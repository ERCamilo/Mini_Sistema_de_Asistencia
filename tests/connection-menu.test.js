const test=require('node:test'),assert=require('node:assert/strict');
const {createModeState}=require('../connection-menu.js');
test('only local Google profile-photo URLs are eligible for display',()=>{
 const {safeAccountPhoto}=require('../connection-menu.js');
 assert.equal(safeAccountPhoto('https://lh3.googleusercontent.com/a/avatar'),'https://lh3.googleusercontent.com/a/avatar');
 for(const value of ['http://lh3.googleusercontent.com/a','https://googleusercontent.com.evil.test/a','https://user@lh3.googleusercontent.com/a','data:image/png;base64,aaa','',null])assert.equal(safeAccountPhoto(value),'');
});
test('one menu selects either transport without inventing device identities',()=>{const state=createModeState({internetAvailable:true,canChange:()=>true});assert.equal(state.current(),'direct');assert.equal(state.select('internet'),true);assert.equal(state.current(),'internet');assert.equal(state.select('direct'),true);});
test('unavailable internet cannot hide the working direct connection',()=>{const state=createModeState({internetAvailable:false,canChange:()=>true});assert.equal(state.select('internet'),false);assert.equal(state.current(),'direct');});
test('active transfer blocks switching methods',()=>{let busy=true;const state=createModeState({internetAvailable:true,canChange:()=>!busy});assert.equal(state.select('internet'),false);assert.equal(state.current(),'direct');busy=false;assert.equal(state.select('internet'),true);busy=true;assert.equal(state.select('direct'),false);assert.equal(state.current(),'internet');});
test('unknown modes are rejected and selected mode can reopen without interrupting work',()=>{const state=createModeState({internetAvailable:true,canChange:()=>false});assert.equal(state.select('direct'),true);assert.throws(()=>state.select('unknown'));});
test('Mini exposes separate visible work and independent device entry points',()=>{
 const fs=require('node:fs'),source=fs.readFileSync(require.resolve('../connection-menu.js'),'utf8');
 assert.ok(source.includes('Asociar a una obra'));
 assert.ok(source.includes('Vincular dispositivo'));
 assert.ok(source.includes('Dispositivos vinculados'));
 assert.ok(source.includes('Obra asociada'));
 assert.ok(source.includes('Iniciar sesión'));
 assert.ok(!source.includes('Otros Minis'));
 assert.ok(!source.includes('Conecta Mini con tu obra'));
 assert.ok(source.includes('connectionsDevice'));
});
test('Mini account UI has one truthful card with original controls and an unavailable state',()=>{
 const source=require('node:fs').readFileSync(require.resolve('../connection-menu.js'),'utf8');
 assert.ok(source.includes('accountState'));
 assert.ok(source.includes('connections-profile-photo'));
 assert.ok(source.includes('El acceso con Google no está habilitado en esta versión.'));
 assert.ok(source.includes('accountUnavailable'));
});

test('peer reconnect has one owned action and stale completion cannot clear a newer action', async () => {
 const api=require('../connection-menu.js');assert.equal(typeof api.createPeerActions,'function');
 let resolve, calls=0, closed=0;const actions=api.createPeerActions({connect:()=>{calls++;return new Promise(r=>{resolve=r;});},close:()=>{closed++;}});
 const first=actions.connect('p'), finishFirst=resolve;assert.equal(actions.connect('p'),first);assert.equal(calls,1);assert.equal(actions.pending('p'),true);
 actions.close('p');assert.equal(closed,1);assert.equal(actions.pending('p'),false);
 const second=actions.connect('p'), finishSecond=resolve;assert.equal(calls,2);
 finishFirst();await first;assert.equal(actions.pending('p'),true);
 finishSecond();await second;assert.equal(actions.pending('p'),false);
 actions.dispose();
});

test('the sharing keyboard trap includes native detail summaries',()=>{
 const source=require('node:fs').readFileSync(require.resolve('../connection-menu.js'),'utf8');
 assert.ok(source.includes('button,input,select,textarea,summary,a[href]'));
});
