import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifiedCapture,makeLicense,createPaymentService} from './server.mjs';

const device='a'.repeat(64);
const merchant='MERCHANT12345';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
function removeTemporary(directory) {
  const resolved=fs.realpathSync(directory);
  assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));
  assert.match(path.basename(resolved),/^lobstercalc-(test|wrong)-/);
  fs.rmSync(resolved,{recursive:true,force:true});
}
function paidOrder() {
  return {id:'ORDER1234567890',status:'COMPLETED',purchase_units:[{
    custom_id:device,payee:{merchant_id:merchant},amount:{value:'3.00',currency_code:'USD'},
    payments:{captures:[{id:'CAPTURE12345',status:'COMPLETED',amount:{value:'3.00',currency_code:'USD'}}]},
  }]};
}

test('only matching, completed captures qualify for an unlock',()=>{
  assert.equal(verifiedCapture(paidOrder(),device,merchant).id,'CAPTURE12345');
  for(const state of ['CREATED','APPROVED','PAYER_ACTION_REQUIRED']) {
    const order=paidOrder();order.status=state;assert.equal(verifiedCapture(order,device,merchant),null);
  }
  const pending=paidOrder();pending.purchase_units[0].payments.captures[0].status='PENDING';
  assert.equal(verifiedCapture(pending,device,merchant),null);
  for(const mutate of [
    order=>order.purchase_units[0].amount.value='0.01',
    order=>order.purchase_units[0].amount.currency_code='CAD',
    order=>order.purchase_units[0].payee.merchant_id='OTHERSELLER',
    order=>order.purchase_units[0].custom_id='b'.repeat(64),
    order=>order.purchase_units[0].payments.captures[0].amount.value='2.00',
  ]){const order=paidOrder();mutate(order);assert.throws(()=>verifiedCapture(order,device,merchant));}
});

test('unlock tokens carry an RSA signature',()=>{
  const token=makeLicense({deviceId:device,captureId:'PAID123',mode:'live'},keys.privateKey);
  const[payload,signature]=token.split('.');
  assert.ok(verify('RSA-SHA256',Buffer.from(payload),keys.publicKey,Buffer.from(signature,'base64url')));
  assert.equal(JSON.parse(Buffer.from(payload,'base64url')).deviceId,device);
  assert.equal(JSON.parse(Buffer.from(payload,'base64url')).amount,'3.00');
});

test('HTTP flow resists forged returns, then captures and unlocks exactly once',async()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lobstercalc-test-'));
  let state='CREATED',creates=0,captures=0;
  const provider={
    async create(){creates++;return {id:'ORDER1234567890',links:[{rel:'payer-action',href:'https://www.paypal.com/checkoutnow?token=ORDER1234567890'}]};},
    async get(){const order=paidOrder();order.status=state;return order;},
    async capture(){captures++;state='COMPLETED';return paidOrder();},
  };
  const service=createPaymentService({privateKey:keys.privateKey,clientId:'test',clientSecret:'test',merchantId:merchant,
    publicUrl:'https://payments.example.com',mode:'live',database:path.join(temporary,'payments.sqlite')},provider);
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+service.server.address().port;
  const auth={Authorization:'Bearer '+'c'.repeat(64)};
  try {
    const post=()=>fetch(base+'/api/checkout',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({deviceId:device})});
    assert.equal((await post()).status,200);assert.equal((await post()).status,200);assert.equal(creates,1);
    const pending=await(await fetch(base+'/api/payment-status',{headers:auth})).json();assert.equal(pending.state,'PENDING');assert.ok(!pending.license);
    await fetch(base+'/paypal/return?token=ORDER1234567890&paid=true');assert.equal(captures,0);
    assert.equal((await fetch(base+'/api/payment-status')).status,404);
    assert.equal((await fetch(base+'/api/payment-status',{method:'POST',headers:auth,body:'{"paid":true}'})).status,404);
    state='APPROVED';await new Promise(resolve=>setTimeout(resolve,2600));
    const paid=await(await fetch(base+'/api/payment-status',{headers:auth})).json();assert.equal(paid.state,'PAID');assert.ok(paid.license);assert.equal(captures,1);
    const again=await(await fetch(base+'/api/payment-status',{headers:auth})).json();assert.equal(again.license,paid.license);assert.equal(captures,1);
    const differentDevice=await fetch(base+'/api/checkout',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({deviceId:'b'.repeat(64)})});assert.equal(differentDevice.status,403);
  } finally {service.close();removeTemporary(temporary);}
});

test('incorrect approved amount is rejected before capture',async()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lobstercalc-wrong-'));
  let captures=0;
  const provider={async create(){return{id:'ORDER1234567890',links:[{rel:'payer-action',href:'https://www.paypal.com/checkoutnow?token=ORDER1234567890'}]};},
    async get(){const order=paidOrder();order.status='APPROVED';order.purchase_units[0].amount.value='30.00';return order;},async capture(){captures++;}};
  const service=createPaymentService({privateKey:keys.privateKey,clientId:'test',clientSecret:'test',merchantId:merchant,publicUrl:'https://payments.example.com',mode:'live',database:path.join(temporary,'p.sqlite')},provider);
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+service.server.address().port;const auth={Authorization:'Bearer '+'d'.repeat(64)};
  try{await fetch(base+'/api/checkout',{method:'POST',headers:auth,body:JSON.stringify({deviceId:device})});assert.equal((await fetch(base+'/api/payment-status',{headers:auth})).status,502);assert.equal(captures,0);}
  finally{service.close();removeTemporary(temporary);}
});
