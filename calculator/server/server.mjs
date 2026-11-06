import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createPrivateKey,randomUUID,sign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
export const PRODUCT = 'lobsterloll-calculator';
export const PRICE = '3.00';
export const CURRENCY = 'USD';

function cents(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return -1;
  const [whole, fraction=''] = value.split('.');
  return Number(whole)*100 + Number(fraction.padEnd(2,'0'));
}

function verifyPurchase(order,deviceId,merchantId) {
  if (order.purchase_units?.length !== 1) throw new Error('Unexpected purchase units');
  const unit = order.purchase_units[0];
  if (unit.custom_id !== deviceId || unit.payee?.merchant_id !== merchantId)
    throw new Error('Payment identity mismatch');
  if (unit.amount?.currency_code !== CURRENCY || cents(unit.amount?.value) !== 300)
    throw new Error('Order amount mismatch');
  return unit;
}

// Only provider data fetched by this server can reach this function.
export function verifiedCapture(order, deviceId, merchantId) {
  if (order.status !== 'COMPLETED') return null;
  const unit=verifyPurchase(order,deviceId,merchantId);
  const captures = unit.payments?.captures;
  if (!Array.isArray(captures) || captures.length !== 1) return null;
  const capture = captures[0];
  if (capture.status !== 'COMPLETED') return null;
  if (capture.amount?.currency_code !== CURRENCY || cents(capture.amount?.value) !== 300 || !capture.id)
    throw new Error('Capture amount mismatch');
  return capture;
}

export function makeLicense({deviceId,captureId,mode}, privateKey) {
  const payload = Buffer.from(JSON.stringify({
    v:1,product:PRODUCT,deviceId,mode,amount:PRICE,currency:CURRENCY,
    captureId,paidAt:new Date().toISOString(),
  })).toString('base64url');
  return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url');
}

export class PayPal {
  constructor(config) {this.config=config;this.accessToken=null;this.tokenExpires=0;}
  async token() {
    if (this.accessToken && Date.now()<this.tokenExpires) return this.accessToken;
    const basic = Buffer.from(this.config.clientId+':'+this.config.clientSecret).toString('base64');
    const response = await fetch(this.config.paypalApi+'/v1/oauth2/token', {
      method:'POST',headers:{Authorization:'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('PayPal authentication failed');
    const data=await response.json();
    if (!data.access_token) throw new Error('Missing PayPal access token');
    this.accessToken=data.access_token;
    this.tokenExpires=Date.now()+(Number(data.expires_in)-60)*1000;
    return this.accessToken;
  }
  async request(route,{method='GET',body,requestId}={}) {
    const response=await fetch(this.config.paypalApi+route,{
      method,headers:{Authorization:'Bearer '+await this.token(),'Content-Type':'application/json',
        Prefer:'return=representation',...(requestId?{'PayPal-Request-Id':requestId}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('PayPal request failed: '+response.status);
    return response.json();
  }
  async create(id,deviceId) {
    return this.request('/v2/checkout/orders',{method:'POST',requestId:id,body:{
      intent:'CAPTURE',
      purchase_units:[{reference_id:'calculator',custom_id:deviceId,
        description:'LobsterCalc permanent unlock for this computer — tax included',
        payee:{merchant_id:this.config.merchantId},
        amount:{currency_code:CURRENCY,value:PRICE}}],
      payment_source:{paypal:{experience_context:{
        brand_name:'LobsterLoll',shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW',
        return_url:this.config.publicUrl+'/paypal/return',
        cancel_url:this.config.publicUrl+'/paypal/cancel',
      }}},
    }});
  }
  get(orderId) {return this.request('/v2/checkout/orders/'+encodeURIComponent(orderId));}
  capture(orderId,id) {
    return this.request('/v2/checkout/orders/'+encodeURIComponent(orderId)+'/capture',
      {method:'POST',body:{},requestId:id+'-capture'});
  }
}

export function loadConfig(environment=process.env) {
  const mode=environment.PAYPAL_MODE || 'live';
  const publicUrl=(environment.PUBLIC_URL || '').replace(/\/$/,'');
  const privatePath=path.resolve(directory,environment.LICENSE_PRIVATE_KEY_PATH || './private/license-private.pem');
  const keyText=environment.LICENSE_PRIVATE_KEY_PEM?.replaceAll('\\n','\n')
    || (fs.existsSync(privatePath)?fs.readFileSync(privatePath,'utf8'):null);
  return {
    mode,publicUrl,clientId:environment.PAYPAL_CLIENT_ID || '',clientSecret:environment.PAYPAL_CLIENT_SECRET || '',
    merchantId:environment.PAYPAL_MERCHANT_ID || '',privateKey:keyText?createPrivateKey(keyText):null,
    paypalApi:mode==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com',
    database:path.resolve(directory,environment.DATABASE_PATH || './data/payments.sqlite'),
    port:Number(environment.PORT || 8080),
  };
}

export function createPaymentService(config,provider=new PayPal(config)) {
  const ready=!!(config.privateKey && config.clientId && config.clientSecret
    && /^[A-Z0-9]{8,32}$/.test(config.merchantId) && /^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(config.publicUrl)
    && ['live','sandbox'].includes(config.mode));
  fs.mkdirSync(path.dirname(config.database),{recursive:true});
  const db=new DatabaseSync(config.database);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS checkouts(
      id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,device_id TEXT NOT NULL,
      order_id TEXT UNIQUE,approval_url TEXT,license TEXT,created_at INTEGER NOT NULL
    );`);
  const findToken=db.prepare('SELECT * FROM checkouts WHERE token_hash=?');
  const findOrder=db.prepare('SELECT * FROM checkouts WHERE order_id=?');
  const inFlight=new Map();
  const recent=new Map();
  const lastStatus=new Map();

  async function statusFor(row) {
    if (row.license) return {state:'PAID',license:row.license};
    if (!row.order_id) return {state:'PENDING'};
    if (inFlight.has(row.id)) return inFlight.get(row.id);
    const cached=lastStatus.get(row.id);
    if(cached && Date.now()-cached.time<2500) return cached.value;
    const operation=(async()=>{
      let order=await provider.get(row.order_id);
      if (order.id!==row.order_id) throw new Error('Unexpected PayPal order');
      if (order.status==='APPROVED') {
        verifyPurchase(order,row.device_id,config.merchantId);
        await provider.capture(row.order_id,row.id);
        // Fetch the canonical order after capture; never trust browser claims.
        order=await provider.get(row.order_id);
        if(order.id!==row.order_id) throw new Error('Unexpected captured order');
      }
      const capture=verifiedCapture(order,row.device_id,config.merchantId);
      if(!capture) return {state:'PENDING'};
      const license=makeLicense({deviceId:row.device_id,captureId:capture.id,mode:config.mode},config.privateKey);
      db.prepare('UPDATE checkouts SET license=? WHERE id=?').run(license,row.id);
      return {state:'PAID',license};
    })();
    inFlight.set(row.id,operation);
    try {
      const value=await operation;
      lastStatus.set(row.id,{time:Date.now(),value});
      return value;
    } finally {inFlight.delete(row.id);}
  }

  function send(response,status,body,type='application/json') {
    response.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
    response.end(type==='application/json'?JSON.stringify(body):body);
  }
  function page(message) {
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LobsterCalc payment</title><body style="background:#f3f0e9;color:#242420;font:18px/1.6 system-ui;max-width:560px;margin:12vh auto;padding:25px"><p style="color:#df482f">LOBSTERLOLL / CALCULATOR</p><h1>'+message+'</h1><p>Return to LobsterCalc. It will unlock only after the payment service confirms your completed PayPal payment.</p></body></html>';
  }
  function tokenHash(request) {
    const token=request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    return token?createHash('sha256').update(token).digest('hex'):null;
  }
  async function body(request) {
    let text='';
    for await(const part of request){text+=part;if(text.length>4096)throw new Error('Body too large');}
    return JSON.parse(text);
  }
  const server=http.createServer(async(request,response)=>{
    try {
      const url=new URL(request.url,'http://localhost');
      if(request.method==='GET' && url.pathname==='/health') {
        return send(response,200,{ok:true,paymentReady:ready,mode:config.mode,amount:PRICE,currency:CURRENCY});
      }
      if(!ready) return send(response,503,{error:'Checkout has not been activated by the seller.'});
      if(request.method==='POST' && url.pathname==='/api/checkout') {
        const hash=tokenHash(request);
        if(!hash) return send(response,401,{error:'Invalid checkout session'});
        const input=await body(request);
        if(!/^[a-f0-9]{64}$/.test(input.deviceId || '')) return send(response,400,{error:'Invalid device ID'});
        let row=findToken.get(hash);
        if(row && row.device_id!==input.deviceId) return send(response,403,{error:'Session belongs to another device'});
        if(!row) {
          const address=request.socket.remoteAddress || 'unknown';
          const now=Date.now();
          const attempts=(recent.get(address)||[]).filter(time=>now-time<60000);
          if(attempts.length>=10) return send(response,429,{error:'Too many checkout attempts. Try again shortly.'});
          attempts.push(now);recent.set(address,attempts);
          const id=randomUUID();
          db.prepare('INSERT INTO checkouts(id,token_hash,device_id,created_at) VALUES(?,?,?,?)').run(id,hash,input.deviceId,now);
          row=findToken.get(hash);
        }
        if(!row.order_id) {
          const order=await provider.create(row.id,row.device_id);
          const approval=order.links?.find(link=>['payer-action','approve'].includes(link.rel))?.href;
          const parsed=new URL(approval);
          const expected=config.mode==='live'?'www.paypal.com':'www.sandbox.paypal.com';
          if(!/^[A-Z0-9]{10,32}$/.test(order.id || '') || parsed.protocol!=='https:' || parsed.hostname!==expected)
            throw new Error('Invalid PayPal approval URL');
          db.prepare('UPDATE checkouts SET order_id=?,approval_url=? WHERE id=?').run(order.id,approval,row.id);
          row=findToken.get(hash);
        }
        return send(response,200,{approvalUrl:row.approval_url,amount:PRICE,currency:CURRENCY,mode:config.mode});
      }
      if(request.method==='GET' && url.pathname==='/api/payment-status') {
        const hash=tokenHash(request);
        const row=hash?findToken.get(hash):null;
        if(!row) return send(response,404,{error:'Checkout not found'});
        return send(response,200,await statusFor(row));
      }
      if(request.method==='GET' && url.pathname==='/paypal/return') {
        const orderId=url.searchParams.get('token');
        const row=orderId?findOrder.get(orderId):null;
        if(!row) return send(response,404,page('Checkout not found.'),'text/html');
        const result=await statusFor(row);
        return send(response,200,page(result.state==='PAID'?'Payment confirmed.':'Your payment is still processing.'),'text/html');
      }
      if(request.method==='GET' && url.pathname==='/paypal/cancel')
        return send(response,200,page('Checkout was closed.'),'text/html');
      send(response,404,{error:'Not found'});
    } catch(error) {
      // Do not log payer details, approval URLs, access tokens, or secret keys.
      console.error('Payment request failed:',error instanceof Error?error.message:'unknown error');
      if(!response.headersSent) send(response,502,{error:'Payment could not be verified. No unlock has been issued.'});
      else response.end();
    }
  });
  return {server,close:()=>{server.close();db.close();}};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=loadConfig();
  const service=createPaymentService(config);
  service.server.listen(config.port,()=>console.log('LobsterCalc payment service listening on port '+config.port));
}
