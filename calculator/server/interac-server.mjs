import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createPrivateKey,randomBytes,sign,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';

const directory=path.dirname(fileURLToPath(import.meta.url));
export const RECIPIENT='junhapark2010@gmail.com';
const hash=value=>createHash('sha256').update(value).digest('hex');
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function verifyPaidRequest(request,row,merchantId) {
  if(request.status!=='PAID') return false;
  if(request.id!==row.request_id || request.merchantTransactionId!==row.id
    || String(request.merchant?.id)!==merchantId || Number(request.amount)!==3
    || (request.currency && request.currency!=='CAD')) throw new Error('Payment identity or amount mismatch');
  return true;
}

export function signInteracLicense(row,mode,privateKey) {
  const encoded=Buffer.from(JSON.stringify({v:2,product:'lobsterloll-calculator',deviceId:row.device_id,
    paymentMethod:'interac',recipientEmail:RECIPIENT,amount:'3.00',currency:'CAD',mode,
    transactionId:row.request_id,paidAt:new Date().toISOString()})).toString('base64url');
  return encoded+'.'+sign('RSA-SHA256',Buffer.from(encoded),privateKey).toString('base64url');
}

export class Clik2pay {
  constructor(config) {this.config=config;this.tokenValue=null;this.expires=0;}
  async token() {
    if(this.tokenValue && Date.now()<this.expires) return this.tokenValue;
    const response=await fetch(this.config.authUrl,{method:'POST',
      headers:{Authorization:'Basic '+Buffer.from(this.config.username+':'+this.config.password).toString('base64'),
        'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=client_credentials&scope=payment_request%2Fall',signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Provider authentication failed');
    const data=await response.json();
    if(!data.access_token) throw new Error('Missing provider token');
    this.tokenValue=data.access_token;this.expires=Date.now()+(Number(data.expires_in)-60)*1000;
    return this.tokenValue;
  }
  async request(route,body) {
    const response=await fetch(this.config.apiUrl+route,{method:body?'POST':'GET',
      headers:{Authorization:'Bearer '+await this.token(),'x-api-key':this.config.apiKey,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error('Provider request failed: '+response.status);
    return response.json();
  }
  create(row,payer) {
    return this.request('/payment-requests',{merchantTransactionId:row.id,amount:3,type:'ECOMM',deliveryMode:'NONE',
      merchant:{id:this.config.merchantId},payer:{name:payer.name,email:payer.email,preferredLanguage:'en'},
      displayMessage:'LobsterCalc permanent unlock. CAD 3.00 total, tax included.',invoiceNumber:row.id});
  }
  get(id) {return this.request('/payment-requests/'+encodeURIComponent(id));}
}

export function interacConfig(env=process.env) {
  const mode=env.INTERAC_MODE || 'sandbox';
  const privateFile=path.resolve(directory,env.LICENSE_PRIVATE_KEY_PATH || './private/license-private.pem');
  const pem=env.LICENSE_PRIVATE_KEY_PEM?.replaceAll('\\n','\n')
    || (fs.existsSync(privateFile)?fs.readFileSync(privateFile,'utf8'):null);
  return {mode,publicUrl:(env.PUBLIC_URL || '').replace(/\/$/,''),username:env.CLIK2PAY_USERNAME || '',
    password:env.CLIK2PAY_PASSWORD || '',apiKey:env.CLIK2PAY_API_KEY || '',merchantId:env.CLIK2PAY_MERCHANT_ID || '',
    webhookUser:env.CLIK2PAY_WEBHOOK_USER || '',webhookPassword:env.CLIK2PAY_WEBHOOK_PASSWORD || '',
    apiUrl:mode==='live'?'https://api.clik2pay.com/open/v1':'https://api.sandbox.clik2pay.com/open/v1',
    authUrl:mode==='live'?'https://api-auth.clik2pay.com/oauth2/token':'https://api-auth.sandbox.clik2pay.com/oauth2/token',
    privateKey:pem?createPrivateKey(pem):null,database:path.resolve(directory,env.DATABASE_PATH || './data/interac.sqlite'),
    port:Number(env.PORT || 8080)};
}

export function createInteracService(config,provider=new Clik2pay(config)) {
  const ready=!!(config.privateKey && config.username && config.password && config.apiKey && config.merchantId
    && config.webhookUser && config.webhookPassword && /^https:\/\/[^/?#]+$/.test(config.publicUrl)
    && ['live','sandbox'].includes(config.mode));
  fs.mkdirSync(path.dirname(config.database),{recursive:true});
  const db=new DatabaseSync(config.database);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS interac_checkouts(
    id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,browser_hash TEXT NOT NULL,device_id TEXT NOT NULL,
    request_id TEXT UNIQUE,payment_link TEXT,license TEXT,created_at INTEGER NOT NULL);`);
  const byToken=db.prepare('SELECT * FROM interac_checkouts WHERE token_hash=?');
  const byId=db.prepare('SELECT * FROM interac_checkouts WHERE id=?');
  const byRequest=db.prepare('SELECT * FROM interac_checkouts WHERE request_id=?');
  const operations=new Map(),cached=new Map(),recent=new Map();
  async function once(key,work) {
    if(operations.has(key)) return operations.get(key);
    const operation=work();operations.set(key,operation);
    try{return await operation;}finally{operations.delete(key);}
  }
  async function check(row,force=false) {
    const current=byId.get(row.id);
    if(current.license) return {state:'PAID',license:current.license};
    if(!current.request_id) return {state:'PENDING'};
    const previous=cached.get(row.id);
    if(!force && previous && Date.now()-previous.time<2500) return previous.result;
    return once('status:'+row.id,async()=>{
      const payment=await provider.get(current.request_id);
      if(!verifyPaidRequest(payment,current,config.merchantId)) return {state:'PENDING'};
      const license=signInteracLicense(current,config.mode,config.privateKey);
      db.prepare('UPDATE interac_checkouts SET license=? WHERE id=?').run(license,current.id);
      return {state:'PAID',license};
    }).then(result=>{cached.set(row.id,{time:Date.now(),result});return result;});
  }
  function send(response,status,body,type='application/json') {
    response.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
    response.end(type==='application/json'?JSON.stringify(body):body);
  }
  function page(content) {
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LobsterCalc e-Transfer</title><style>body{background:#f3f0e9;color:#242420;font:16px/1.6 system-ui;max-width:460px;margin:7vh auto;padding:24px}label{display:block;margin-top:15px}input,button{box-sizing:border-box;width:100%;padding:13px;font:inherit;margin-top:6px}button{background:#df482f;color:white;border:0;cursor:pointer}small{color:#666}</style><body>'+content+'</body></html>';
  }
  async function body(request) {
    let text='';for await(const part of request){text+=part;if(text.length>8192)throw new Error('Request body too large');}
    return text;
  }
  function auth(request) {return request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];}
  function webhookAuthorized(request) {
    const expected=Buffer.from('Basic '+Buffer.from(config.webhookUser+':'+config.webhookPassword).toString('base64'));
    const actual=Buffer.from(request.headers.authorization || '');
    return actual.length===expected.length && timingSafeEqual(actual,expected);
  }
  const server=http.createServer(async(request,response)=>{
    try {
      const url=new URL(request.url,'http://localhost');
      if(request.method==='GET' && url.pathname==='/health') return send(response,200,{ok:true,paymentReady:ready,
        paymentMethod:'interac',provider:'clik2pay',mode:config.mode,amount:'3.00',currency:'CAD'});
      if(!ready) return send(response,503,{error:'Automatic e-transfer checkout has not been activated. Do not send money.'});
      if(request.method==='POST' && url.pathname==='/api/interac/checkout') {
        const token=auth(request);if(!token)return send(response,401,{error:'Invalid session'});
        const input=JSON.parse(await body(request));
        if(!/^[a-f0-9]{64}$/.test(input.deviceId || ''))return send(response,400,{error:'Invalid device'});
        let row=byToken.get(hash(token));
        if(row && row.device_id!==input.deviceId)return send(response,403,{error:'Wrong device'});
        const browser=hash('browser:'+token);
        if(!row){
          const address=request.socket.remoteAddress || 'unknown',now=Date.now();
          const attempts=(recent.get(address)||[]).filter(time=>now-time<60000);
          if(attempts.length>=10)return send(response,429,{error:'Too many checkout attempts'});
          attempts.push(now);recent.set(address,attempts);
          db.prepare('INSERT INTO interac_checkouts(id,token_hash,browser_hash,device_id,created_at) VALUES(?,?,?,?,?)')
            .run(randomBytes(16).toString('hex'),hash(token),hash(browser),input.deviceId,now);
          row=byToken.get(hash(token));
        }
        return send(response,200,{paymentMethod:'interac',amount:'3.00',currency:'CAD',mode:config.mode,
          recipientEmail:RECIPIENT,paymentUrl:config.publicUrl+'/checkout/'+row.id+'/'+browser});
      }
      if(request.method==='GET' && url.pathname==='/api/interac/payment-status') {
        const token=auth(request),row=token?byToken.get(hash(token)):null;
        if(!row)return send(response,404,{error:'Checkout not found'});
        return send(response,200,await check(row));
      }
      const checkout=url.pathname.match(/^\/checkout\/([a-f0-9]{32})\/([a-f0-9]{64})$/);
      if(checkout && ['GET','POST'].includes(request.method)) {
        const row=byId.get(checkout[1]);
        if(!row || row.browser_hash!==hash(checkout[2]))return send(response,404,{error:'Checkout not found'});
        if(row.license)return send(response,200,page('<h1>Payment confirmed.</h1><p>Return to the calculator. It will verify and save your permanent unlock.</p>'),'text/html');
        if(request.method==='GET') return send(response,200,page('<p>LOBSTERLOLL / CALCULATOR</p><h1>CAD $3.00 total</h1><p>Tax included. One-time unlock on this computer.</p><p>Seller contact: '+escape(RECIPIENT)+'</p><form method="post"><label>Your name<input name="name" required maxlength="100" autocomplete="name"></label><label>Your email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><p><small>These details are sent to Clik2pay to create your Interac payment request. Complete payment only through the official bank checkout.</small></p><button>Continue to bank payment — CAD $3.00</button></form>'),'text/html');
        const origin=request.headers.origin;
        if(origin && origin!==new URL(config.publicUrl).origin)return send(response,403,{error:'Invalid origin'});
        const input=new URLSearchParams(await body(request));
        const name=(input.get('name')||'').trim(),email=(input.get('email')||'').trim();
        if(name.length<2||name.length>100||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return send(response,400,page('<h1>Check your name and email.</h1><p>Go back and try again. No payment has been taken.</p>'),'text/html');
        const result=await once('create:'+row.id,async()=>{
          const latest=byId.get(row.id);if(latest.payment_link)return latest;
          const payment=await provider.create(latest,{name,email});
          const link=new URL(payment.paymentLink);
          if(!/^[A-Za-z0-9-]{6,80}$/.test(payment.id || '') || payment.merchantTransactionId!==latest.id
            || Number(payment.amount)!==3 || String(payment.merchant?.id)!==config.merchantId
            || link.protocol!=='https:' || link.hostname!=='pay.clik2pay.com' || link.username || link.password)
            throw new Error('Provider returned an unexpected payment request');
          db.prepare('UPDATE interac_checkouts SET request_id=?,payment_link=? WHERE id=?').run(payment.id,payment.paymentLink,row.id);
          return byId.get(row.id);
        });
        response.writeHead(303,{Location:result.payment_link,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
        return response.end();
      }
      if(request.method==='POST' && url.pathname==='/webhooks/clik2pay') {
        if(!webhookAuthorized(request))return send(response,401,{error:'Invalid webhook authentication'});
        const event=JSON.parse(await body(request));
        // Treat a webhook as a notification only. Re-fetch canonical provider data.
        const candidates=[];
        function collect(value,depth=0){
          if(depth>6||candidates.length>=100)return;
          if(typeof value==='string' && /^[A-Za-z0-9-]{6,80}$/.test(value))candidates.push(value);
          else if(value && typeof value==='object')for(const child of Object.values(value))collect(child,depth+1);
        }
        collect(event);
        for(const id of new Set(candidates)){const row=byRequest.get(id);if(row)await check(row,true);}
        return send(response,200,{received:true});
      }
      send(response,404,{error:'Not found'});
    }catch(error){
      console.error('E-transfer verification failed:',error instanceof Error?error.message:'unknown error');
      if(!response.headersSent)send(response,502,{error:'Payment could not be verified. No unlock has been issued.'});
      else response.end();
    }
  });
  return {server,close(){server.close();db.close();}};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=interacConfig();
  createInteracService(config).server.listen(config.port,()=>console.log('LobsterCalc e-transfer service on port '+config.port));
}
