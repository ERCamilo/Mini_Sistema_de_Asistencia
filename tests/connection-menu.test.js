const test=require('node:test'),assert=require('node:assert/strict');
const {createModeState}=require('../connection-menu.js');
test('one menu selects either transport without inventing device identities',()=>{const state=createModeState({internetAvailable:true,canChange:()=>true});assert.equal(state.current(),'direct');assert.equal(state.select('internet'),true);assert.equal(state.current(),'internet');assert.equal(state.select('direct'),true);});
test('unavailable internet cannot hide the working direct connection',()=>{const state=createModeState({internetAvailable:false,canChange:()=>true});assert.equal(state.select('internet'),false);assert.equal(state.current(),'direct');});
test('active transfer blocks switching methods',()=>{let busy=true;const state=createModeState({internetAvailable:true,canChange:()=>!busy});assert.equal(state.select('internet'),false);assert.equal(state.current(),'direct');busy=false;assert.equal(state.select('internet'),true);busy=true;assert.equal(state.select('direct'),false);assert.equal(state.current(),'internet');});
test('unknown modes are rejected and selected mode can reopen without interrupting work',()=>{const state=createModeState({internetAvailable:true,canChange:()=>false});assert.equal(state.select('direct'),true);assert.throws(()=>state.select('unknown'));});
test('Mini exposes separate visible work and independent device entry points',()=>{
 const fs=require('node:fs'),source=fs.readFileSync(require.resolve('../connection-menu.js'),'utf8');
 assert.ok(source.includes('Asociar a una obra'));
 assert.ok(source.includes('Asociar a otro dispositivo'));
 assert.ok(source.includes('connectionsDevice'));
});
test('Mini account UI has one truthful card with original controls and an unavailable state',()=>{
 const source=require('node:fs').readFileSync(require.resolve('../connection-menu.js'),'utf8');
 assert.ok(source.includes('accountState'));
 assert.ok(source.includes('El acceso con Google no está habilitado en esta versión.'));
 assert.ok(source.includes('accountUnavailable'));
});
