import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createInteracService,verifyPaidRequest,signInteracLicense,RECIPIENT} from './interac-server.mjs';

const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const device='a'.repeat(64),merchant='merchant-123',transaction='request-123456';
const row={id:'a'.repeat(32),device_id:device,request_id:transaction};
function payment(overrides={}) {
  return {id:transaction,status:'PAID',merchantTransactionId:row.id,merchant:{id:merchant},amount:3,...overrides};
}
function removeTemporary(directory) {
  const resolved=fs.realpathSync(directory);
  assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));
  assert.match(path.basename(resolved),/^lobstercalc-interac-/);
  fs.rmSync(resolved,{recursive:true,force:true});
}
test('only a matching PAID provider request qualifies',()=>{
  assert.equal(verifyPaidRequest(payment(),row,merchant),true);
  for(const status of ['CREATED','PENDING','COMPLETED','DECLINED','CANCELLED'])
    assert.equal(verifyPaidRequest(payment({status}),row,merchant),false);
  for(const overrides of [{amount:2},{currency:'USD'},{merchant:{id:'other'}},{merchantTransactionId:'other'},{id:'other'}])
    assert.throws(()=>verifyPaidRequest(payment(overrides),row,merchant));
});
test('signed license binds the CAD payment, recipient and computer',()=>{
  const token=signInteracLicense(row,'live',keys.privateKey);
  const[payload,signature]=token.split('.');
  assert.ok(verify('RSA-SHA256',Buffer.from(payload),keys.publicKey,Buffer.from(signature,'base64url')));
  const data=JSON.parse(Buffer.from(payload,'base64url'));
  assert.equal(data.currency,'CAD');assert.equal(data.amount,'3.00');assert.equal(data.paymentMethod,'interac');
  assert.equal(data.recipientEmail,RECIPIENT);assert.equal(data.deviceId,device);assert.equal(data.v,2);
});
test('checkout, webhook verification and one-time automatic licensing',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lobstercalc-interac-'));
  let state='CREATED',created=0,currentId;
  const provider={
    async create(entry,payer){
      created++;currentId=entry.id;assert.equal(payer.email,'buyer@example.com');
      return {id:transaction,merchantTransactionId:entry.id,merchant:{id:merchant},amount:3,paymentLink:'https://pay.clik2pay.com/r/ABC1234'};
    },
    async get(id){assert.equal(id,transaction);return payment({status:state,merchantTransactionId:currentId});},
  };
  const config={mode:'live',publicUrl:'https://payments.example.com',username:'test',password:'test',apiKey:'test',merchantId:merchant,
    webhookUser:'notify',webhookPassword:'test-webhook-secret',privateKey:keys.privateKey,database:path.join(directory,'test.sqlite')};
  const service=createInteracService(config,provider);
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+service.server.address().port,headers={Authorization:'Bearer '+'b'.repeat(64),'Content-Type':'application/json'};
  try {
    const create=()=>fetch(base+'/api/interac/checkout',{method:'POST',headers,body:JSON.stringify({deviceId:device})});
    const first=await(await create()).json(),second=await(await create()).json();
    assert.equal(first.paymentUrl,second.paymentUrl);assert.equal(first.currency,'CAD');assert.equal(first.recipientEmail,RECIPIENT);
    const route=new URL(first.paymentUrl).pathname;
    const form=await(await fetch(base+route)).text();assert.match(form,/CAD \$3\.00 total/);
    const post=()=>fetch(base+route,{method:'POST',body:new URLSearchParams({name:'Test Buyer',email:'buyer@example.com'}),redirect:'manual'});
    assert.equal((await post()).status,303);assert.equal((await post()).status,303);assert.equal(created,1);
    const poll=()=>fetch(base+'/api/interac/payment-status',{headers});
    assert.equal((await(await poll()).json()).state,'PENDING');
    assert.equal((await fetch(base+'/api/interac/payment-status')).status,404);
    const event={eventType:'PAYMENT-COMPLETED',resource:{id:transaction,status:'PAID'}};
    assert.equal((await fetch(base+'/webhooks/clik2pay',{method:'POST',body:JSON.stringify(event)})).status,401);
    const webhook=()=>fetch(base+'/webhooks/clik2pay',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('notify:test-webhook-secret').toString('base64')},body:JSON.stringify(event)});
    assert.equal((await webhook()).status,200);
    assert.ok(!(await(await poll()).json()).license,'a webhook claim alone must not unlock');
    state='PAID';assert.equal((await webhook()).status,200);
    const paid=await(await poll()).json();assert.equal(paid.state,'PAID');assert.ok(paid.license);
    assert.equal((await(await poll()).json()).license,paid.license);
    const data=JSON.parse(Buffer.from(paid.license.split('.')[0],'base64url'));
    assert.equal(data.deviceId,device);assert.equal(data.recipientEmail,RECIPIENT);assert.equal(data.transactionId,transaction);
    const other=await fetch(base+'/api/interac/checkout',{method:'POST',headers,body:JSON.stringify({deviceId:'c'.repeat(64)})});assert.equal(other.status,403);
  } finally {service.close();removeTemporary(directory);}
});
test('unconfigured service refuses all payment creation',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lobstercalc-interac-'));
  const service=createInteracService({mode:'sandbox',database:path.join(directory,'test.sqlite')},{create(){throw new Error('must not be called');}});
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+service.server.address().port;
  try {
    assert.equal((await(await fetch(base+'/health')).json()).paymentReady,false);
    assert.equal((await fetch(base+'/api/interac/checkout',{method:'POST',body:'{}'})).status,503);
  }finally{service.close();removeTemporary(directory);}
});
