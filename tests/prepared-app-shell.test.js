const test=require('node:test'),assert=require('node:assert/strict');
const {createPreparedShell}=require('../prepared-app-shell.js');
const {refreshAppShell}=require('../app-shell-refresh.js');
const SCOPE='https://mini.test/',VERSION='2.0.0';
function fixture(failure){
 const values=new Map(),messages=[];let clients=[{id:'old',url:SCOPE}],skip=0;
 const key=x=>new URL(typeof x==='string'?x:x.url,SCOPE).href;
 const storage={
  async open(name){if(!values.has(name))values.set(name,new Map());const rows=values.get(name);return{
   match:async(req,options={})=>{const url=key(req);const item=[...rows].find(([k])=>options.ignoreSearch?new URL(k).pathname===new URL(url).pathname:k===url);return item?.[1].clone();},
   put:async(req,response)=>{if(failure==='disk'&&name.includes('-prepared-'))throw Error('disk full');rows.set(key(req),response.clone());},
   keys:async()=>[...rows.keys()].map(url=>new Request(url)),delete:async req=>rows.delete(key(req))
  };},
  keys:async()=>[...values.keys()],delete:async name=>values.delete(name)
 };
 const options={scope:SCOPE,cacheName:'asistencia-vNEW',build:'asistencia-vNEW',
  assets:['./index.html','./app-release.json','./app.js','./theme.css'],storage,refresh:refreshAppShell,
  skipWaiting:async()=>{skip++;},clients:{matchAll:async()=>clients},
  fetcher:async url=>{
   const file=new URL(url).pathname;
   if(failure==='network'&&file.endsWith('.js'))return new Response('bad',{status:503});
   const body=file.endsWith('app-release.json')?JSON.stringify({version:failure==='version'?'1.0.0':VERSION}):'new:'+file;
   return new Response(body,{headers:{'Content-Type':failure==='html'?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/json'}});
  }};
 const api=createPreparedShell(options);
 return {api,storage,values,options,messages,clients:list=>{clients=list;},skip:()=>skip,
  async message(data,source='new'){const work=[],replies=[];api.handleMessage({data,ports:[{postMessage:m=>{messages.push(m);replies.push(m);}}],source:{id:source},waitUntil:p=>work.push(p)});await Promise.all(work);return replies.findLast(m=>typeof m.ok==='boolean');}
 };
}
async function seed(f){
 const old=await f.storage.open('asistencia-vOLD');
 await old.put(SCOPE+'app.js',new Response('old-ui'));
 await old.put(SCOPE+'index.html',new Response('old-html'));
 await old.put(SCOPE+'app-release.json',new Response(JSON.stringify({version:'1.0.0'})));
 await old.put(SCOPE+'profile.jpg',new Response('photo'));
 await(await f.storage.open('another-app')).put(SCOPE+'receipt.jpg',new Response('receipt'));
 await(await f.storage.open('mini-tutorials-saved')).put(SCOPE+'saved.webm',new Response('video'));
}
test('preparation is isolated and never requests activation',async()=>{
 const f=fixture();await seed(f);const result=await f.message({type:'PREPARE_APP_UPDATE',version:VERSION,token:'one',force:true});
 assert.equal(result.ok,true);assert.equal(f.skip(),0);
 assert.equal(await(await(await f.storage.open('asistencia-vOLD')).match(SCOPE+'app.js')).text(),'old-ui');
});
for(const failure of ['network','disk','html','version'])test(failure+' preserves the working UI and media without a partial replacement',async()=>{
 const f=fixture(failure);await seed(f);const result=await f.message({type:'PREPARE_APP_UPDATE',version:VERSION,token:'one',force:true});
 assert.equal(result.ok,false);assert.equal(f.skip(),0);assert(![...f.values.keys()].some(n=>n.includes('-prepared-')));
 assert.equal(await(await(await f.storage.open('asistencia-vOLD')).match(SCOPE+'app.js')).text(),'old-ui');
 assert.equal(await(await(await f.storage.open('another-app')).match(SCOPE+'receipt.jpg')).text(),'receipt');
 assert.equal(await(await(await f.storage.open('mini-tutorials-saved')).match(SCOPE+'saved.webm')).text(),'video');
});
test('confirmed activation keeps old tabs pinned and cleanup preserves media and other apps',async()=>{
 const f=fixture();await seed(f);
 const ready=await f.message({type:'PREPARE_APP_UPDATE',version:VERSION,token:'one',force:true});
 const activated=await f.message({type:'ACTIVATE_APP_UPDATE',version:VERSION,cacheName:ready.cacheName,previousCacheName:'asistencia-vOLD'});
 assert.equal(activated.ok,true);assert.equal(f.skip(),1);
 assert.equal(await(await f.api.getResponse(new Request(SCOPE+'app.js'),{clientId:'old'})).text(),'old-ui');
 assert.equal(await(await f.api.getResponse(new Request(SCOPE+'app.js'),{clientId:'new'})).text(),'new:/app.js');
 f.clients([{id:'new',url:SCOPE}]);await f.message({type:'CONFIRM_APP_UPDATE',version:VERSION});
 assert.equal(await(await f.storage.open('asistencia-vOLD')).match(SCOPE+'app.js'),undefined);
 assert.equal(await(await(await f.storage.open('asistencia-vOLD')).match(SCOPE+'profile.jpg')).text(),'photo');
 assert.equal(await(await(await f.storage.open('another-app')).match(SCOPE+'receipt.jpg')).text(),'receipt');
 assert.equal(await(await(await f.storage.open('mini-tutorials-saved')).match(SCOPE+'saved.webm')).text(),'video');
});
test('unprepared or mismatched releases cannot activate',async()=>{
 const f=fixture();await seed(f);
 const result=await f.message({type:'ACTIVATE_APP_UPDATE',version:VERSION,cacheName:'asistencia-vNEW-prepared-forged'});
 assert.equal(result.ok,false);assert.equal(f.skip(),0);
});

test('legacy refresh uses an isolated candidate and emits only its final acknowledgement',async()=>{
 const f=fixture();await seed(f);
 const result=await f.message({type:'REFRESH_APP_SHELL'});
 assert.equal(result?.ok,true);
 assert(f.messages.every(m=>m.type!=='progress'));
 assert.equal(await(await(await f.storage.open('asistencia-vOLD')).match(SCOPE+'app.js')).text(),'old-ui');
});
test('legacy refresh cannot partially replace the working shell if storage fails',async()=>{
 const f=fixture('disk');await seed(f);
 const result=await f.message({type:'REFRESH_APP_SHELL'});
 assert.equal(result?.ok,false);
 assert.equal(await(await(await f.storage.open('asistencia-vOLD')).match(SCOPE+'app.js')).text(),'old-ui');
});
test('first activation of the new protocol pins legacy tabs to their previous shell',async()=>{
 const f=fixture();await seed(f);
 const base=await f.storage.open(f.options.cacheName);
 for(const asset of f.options.assets)await base.put(new URL(asset,SCOPE).href,await f.options.fetcher(new URL(asset,SCOPE).href));
 await f.api.initialize();
 assert.equal(await(await f.api.getResponse(new Request(SCOPE+'app.js'),{clientId:'old'})).text(),'old-ui');
 assert.equal(await(await f.api.getResponse(new Request(SCOPE+'app.js'),{clientId:'new'})).text(),'new:/app.js');
});

test('legacy network fetches do not bind the native fetch function to the options object',async()=>{
 const f=fixture();await seed(f);
 const original=f.options.fetcher;
 f.options.fetcher=function(url,init){'use strict';assert.equal(this,undefined);return original(url,init);};
 const result=await f.message({type:'REFRESH_APP_SHELL'});
 assert.equal(result.ok,true,result.message);
});
