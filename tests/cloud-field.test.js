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
