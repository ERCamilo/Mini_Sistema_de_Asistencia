const test=require('node:test'),assert=require('node:assert/strict');
const {createAppUpdateWorker}=require('../app-update-worker.js');
function fixture(blocked){
 const waiting=new EventTarget();waiting.state='installed';waiting.messages=[];
 waiting.postMessage=(data,ports)=>{
  waiting.messages.push(data);
  if(blocked==='message'||(blocked==='activation'&&data.type==='ACTIVATE_APP_UPDATE'))return;
  if(data.type==='PREPARE_APP_UPDATE')ports[0].postMessage({ok:true,version:data.version,cacheName:'asistencia-vNEW'});
  if(data.type==='ACTIVATE_APP_UPDATE'){waiting.state='activated';waiting.dispatchEvent(new Event('statechange'));ports[0].postMessage({ok:true});}
 };
 const active=new EventTarget();active.state='activated';
 active.postMessage=(data,ports)=>{if(blocked!=='legacy')ports[0].postMessage({version:'OLD',cacheName:'asistencia-vOLD'});};
 const never=new Promise(()=>{});
 const registration={active,waiting,update:()=>blocked==='update'?never:Promise.resolve()};
 const serviceWorker={getRegistration:()=>blocked==='registration'?never:Promise.resolve(registration)};
 const worker=createAppUpdateWorker({serviceWorker,timeoutMs:1000,activationTimeoutMs:1000,legacyTimeoutMs:30,legacyCacheName:()=> 'asistencia-vLEGACY'});
 return {waiting,worker,registration};
}
for(const blocked of ['registration','update','message'])test('bounded '+blocked+' does not activate or wait indefinitely',async()=>{
 const f=fixture(blocked);
 await assert.rejects(f.worker.prepare('2.0.0'),e=>e.code==='timeout');
 assert(!f.waiting.messages.some(m=>m.type==='ACTIVATE_APP_UPDATE'));
});
test('preparing shares a snapshot and only explicit activation changes worker state',async()=>{
 const f=fixture();const[a,b]=await Promise.all([f.worker.prepare('2.0.0'),f.worker.prepare('2.0.0')]);
 assert.equal(a,b);assert.equal(f.waiting.state,'installed');
 assert.equal(f.waiting.messages.length,1);await f.worker.activate(a);assert.equal(f.waiting.state,'activated');
});
test('a legacy worker without GET_VERSION cannot block the new updater',async()=>{
 const f=fixture('legacy');const handle=await f.worker.prepare('2.0.0');
 assert.equal(handle.previousCacheName,'asistencia-vLEGACY');assert.equal(f.waiting.state,'installed');
});
test('forced same-version repair downloads a fresh candidate',async()=>{
 const f=fixture();await f.worker.prepare('2.0.0');await f.worker.prepare('2.0.0',{force:true});
 assert.equal(f.waiting.messages.filter(m=>m.type==='PREPARE_APP_UPDATE').length,2);
});
test('activation without acknowledgement has its own bounded deadline',async()=>{
 const f=fixture('activation');const handle=await f.worker.prepare('2.0.0');
 await assert.rejects(f.worker.activate(handle),e=>e.code==='timeout');
});
