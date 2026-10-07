const test=require('node:test'),assert=require('node:assert/strict');const {createOutbox}=require('../cloud-field.js');
function fixture(){const rows=new Map();let sequence=0;const store={list:async()=>[...rows.values()],put:async row=>rows.set(row.id,structuredClone(row)),remove:async id=>rows.delete(id),nextSequence:async()=>++sequence};let fail=true,calls=[];const q=createOutbox({store,send:async row=>{calls.push(structuredClone(row));if(fail)throw new Error('offline');return {submissionId:row.payload.submissionId,status:'received'};}});return {q,rows,calls,online:()=>fail=false};}
test('persist before sending; failed request survives with identical UUID/body',async()=>{const f=fixture();const payload={submissionId:'id',capturedAt:'date',rows:[{normalHours:8}]};await f.q.enqueue('user-a','scope',payload);await assert.rejects(f.q.flush('user-a'));assert.equal(f.rows.size,1);f.online();await f.q.flush('user-a');assert.equal(f.rows.size,0);assert.deepEqual(f.calls[0],f.calls[1]);});
test('another account cannot flush a previous account queue',async()=>{const f=fixture();await f.q.enqueue('user-a','scope',{submissionId:'id'});f.online();await f.q.flush('user-b');assert.equal(f.calls.length,0);assert.equal(f.rows.size,1);});
test('wrong acknowledgement retains pending payload',async()=>{const rows=[];const q=createOutbox({store:{list:async()=>rows,put:async row=>rows.push(row),remove:async()=>assert.fail('should not remove'),nextSequence:async()=>1},send:async()=>({status:'received',submissionId:'other'})});await q.enqueue('a','s',{submissionId:'id'});await assert.rejects(q.flush('a'));assert.equal(rows.length,1);});
test('pending report from a revoked work does not block another selected work',async()=>{const rows=new Map();let n=0;const calls=[];const q=createOutbox({store:{list:async()=>[...rows.values()],put:async r=>rows.set(r.id,r),remove:async id=>rows.delete(id),nextSequence:async()=>++n},send:async row=>{calls.push(row.scopeKey);if(row.scopeKey==='revoked')throw Error('revoked');return{status:'received',submissionId:row.id};}});await q.enqueue('u','revoked',{submissionId:'old'});await q.enqueue('u','allowed',{submissionId:'new'});await q.flush('u','allowed');assert.deepEqual(calls,['allowed']);assert.deepEqual([...rows.keys()],['old']);});

test('Google name is the default; explicit alias wins without changing stored identity',()=>{
 const {resolveDeviceName}=require('../cloud-field.js');
 assert.equal(resolveDeviceName('',{displayName:'María Pérez',email:'m@example.com'}),'María Pérez');
 assert.equal(resolveDeviceName('Equipo Norte',{displayName:'María Pérez'}),'Equipo Norte');
 assert.equal(resolveDeviceName('   ',{displayName:'',email:'m@example.com'}),'Mini');
 assert.equal(resolveDeviceName('',{displayName:'A'.repeat(150)}).length,120);
});

function batchFixture(){const rows=new Map();let n=0,atomic=0,failAt=1;const calls=[];const store={list:async()=>[...rows.values()],put:async r=>rows.set(r.id,structuredClone(r)),putMany:async entries=>{atomic++;for(const r of entries)rows.set(r.id,structuredClone(r));},remove:async id=>rows.delete(id),nextSequence:async()=>++n};const q=createOutbox({store,send:async row=>{calls.push(structuredClone(row));if(calls.length===failAt)throw Error('offline');return{status:'received',submissionId:row.id};}});return{q,rows,calls,atomic:()=>atomic,failAt:i=>failAt=i};}
test('batch is saved atomically before any network and partial confirmation survives reload',async()=>{const f=batchFixture();f.failAt(2);await f.q.enqueueBatch('u','s',[{submissionId:'a',workDate:'2026-10-01'},{submissionId:'b',workDate:'2026-10-02'},{submissionId:'c',workDate:'2026-10-03'}]);assert.equal(f.atomic(),1);assert.equal(f.calls.length,0);await assert.rejects(f.q.flush('u','s'));assert.deepEqual([...f.rows.keys()],['b','c']);const remaining=structuredClone(f.rows.get('b'));f.failAt(-1);await f.q.flush('u','s');assert.deepEqual(f.calls[2],remaining);assert.equal(f.rows.size,0);});
test('batch validation/capacity fails before writing or allocating sequences',async()=>{const f=batchFixture();await assert.rejects(f.q.enqueueBatch('u','s',[{submissionId:'a'},{submissionId:'a'}]));assert.equal(f.rows.size,0);assert.equal(f.atomic(),0);await assert.rejects(f.q.enqueueBatch('u','s',Array.from({length:101},(_,i)=>({submissionId:String(i)}))));assert.equal(f.rows.size,0);});
test('failed atomic batch persistence never sends or reports success',async()=>{let seq=0,send=0;const q=createOutbox({store:{list:async()=>[],put:async()=>assert.fail(),putMany:async()=>{throw Error('quota');},remove:async()=>{},nextSequence:async()=>++seq},send:async()=>{send++;return{};}});await assert.rejects(q.enqueueBatch('u','s',[{submissionId:'a'},{submissionId:'b'}]),/quota/);assert.equal(send,0);});

test('another click cannot queue the same pending days with new identifiers',async()=>{const f=batchFixture();await f.q.enqueueBatch('u','s',[{submissionId:'a',workDate:'2026-10-04'},{submissionId:'b',workDate:'2026-10-05'}]);await assert.rejects(f.q.enqueueBatch('u','s',[{submissionId:'new',workDate:'2026-10-04'}]),/pendiente/);assert.equal(f.rows.size,2);assert.equal(f.atomic(),1);await f.q.enqueueBatch('other-user','s',[{submissionId:'different-user',workDate:'2026-10-04'}]);assert.equal(f.rows.size,3);});


test('request errors explain offline and timeout without replacing authorization errors',()=>{
 const field=require('../cloud-field.js');
 assert.match(field.requestError(new TypeError('Failed to fetch')).message,/conectar.*pendientes/);
 const timeout=new Error('The operation was aborted');timeout.name='AbortError';assert.match(field.requestError(timeout).message,/tardó.*Reintenta/);
 assert.match(field.requestError(new SyntaxError('Unexpected token')).message,/respuesta.*Reintenta/);
 const denied=new Error('SA debe permitir compartir a ambos Minis.');assert.equal(field.requestError(denied),denied);
});

function deferredNoticeWork() {
 let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};
}
function noticeMountFixture({allowNavigation=true}={}) {
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const elements=new Map(),reviews=[],preparation=deferredNoticeWork(),started=deferredNoticeWork();
 function element() {
  const listeners=new Map();return {dataset:{},value:'',disabled:false,textContent:'',options:[],
   addEventListener(type,listener){listeners.set(type,listener);},
   dispatchEvent(event){listeners.get(event.type)?.(event);},
   append(child){if(child.id)elements.set(child.id,child);},
   replaceChildren(...children){this.options=children;this.value=children.length?'0':'';}};
 }
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},
  createElement:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},dispatchEvent(){}};
 const scope={orgId:'org',projectId:'work',groupId:'crew',deviceId:'cloud-local',shareId:'received-42'};
 const event={id:'attendance',kind:'attendance',revision:'revision-42',scope};
 let user={uid:'leader',getIdToken:async()=> 'synthetic-token'},subscriber,events=[event],view,preparing;
 const storage=new Map([['mini-cloud-device-v1','local']]);
 const root={module:{exports:{}},window:{addEventListener(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  CustomEvent:class {constructor(type){this.type=type;}},AbortController,setTimeout,clearTimeout,queueMicrotask,
  MiniAttendanceDays:{mount:({input})=>({dates:()=>[input.value],setDisabled(){},multiple:()=>false}),validateDates:values=>values},
  ConnectionNotifications:{createTracker:()=>({}),createMonitor:()=>({poll:async()=>{},reset(){events=[];},snapshot:()=>events})},
  indexedDB:{open(){const request={};queueMicrotask(()=>{request.result={transaction(){return {objectStore(){return {getAll(){const result={};queueMicrotask(()=>{result.result=[];result.onsuccess();});return result;}};}};}};request.onsuccess();});return request;}},
  fetch:async url=>({ok:true,json:async()=>url.endsWith('/bindings')?[{...scope,ownerUid:'owner',projectName:'Work',devicePrefix:'cloud-',groups:[{id:'crew',name:'Crew'},{id:'other',name:'Other'}]}]:{roster:{}}})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cloud-field.js'),'utf8'),root);
 view=root.module.exports.mount({document,endpoint:'http://localhost',hooks:{
  user:()=>user,subscribe(fn){subscriber=fn;return()=>{};},build:async()=>null,review:async()=>assert.fail('not a roster notice'),
  organization(adapter){return {reset(){},async open(shareId){if(!shareId){started.resolve();await preparation.promise;}else reviews.push({shareId,scope:JSON.parse(JSON.stringify(adapter.context()))});}};},
  async openNotice(){if(!allowNavigation)return false;preparing=view.openMembers();return true;}
 }});
 return {view,event,reviews,started:started.promise,release:preparation.resolve,
  async finishPreparation(){await preparing;await view.whenIdle();},
  changeScope(){document.getElementById('cloud-field-binding').value='1';},
  replaceNotice(){events=[{...event,revision:'new-revision',scope:{...scope,shareId:'new-share'}}];},
  logout(){user=null;subscriber(null);},switchAccount(){user={uid:'other-leader',getIdToken:async()=> 'other-token'};subscriber(user);}};
}

test('notice waits for menu preparation then opens its exact received share once',async()=>{
 const f=noticeMountFixture();await f.view.refresh();
 const opening=f.view.openUpdate(f.event);await f.started;
 assert.equal(f.view.isBusy(),true);assert.deepEqual(f.reviews,[]);
 f.release();await f.finishPreparation();await opening;
 assert.equal(f.reviews.length,1);assert.equal(f.reviews[0].shareId,'received-42');
 assert.equal(f.reviews[0].scope.projectId,'work');assert.equal(f.reviews[0].scope.groupId,'crew');
});
test('rejected notice navigation never opens a received review',async()=>{
 const f=noticeMountFixture({allowNavigation:false});await f.view.refresh();const preparing=f.view.openMembers();await f.started;
 await f.view.openUpdate(f.event);assert.deepEqual(f.reviews,[]);f.release();await preparing;
});
for(const change of ['logout','switchAccount','changeScope','replaceNotice'])test('notice preparation cannot open stale review after '+change,async()=>{
 const f=noticeMountFixture();await f.view.refresh();const opening=f.view.openUpdate(f.event);await f.started;
 f[change]();f.release();await f.finishPreparation();await opening;assert.deepEqual(f.reviews,[]);
});
