const test=require('node:test');const assert=require('node:assert/strict');
const Report=require('../employee-change-report.js');const UI=require('../employee-report-ui.js');
function setup(options={}){const values=new Map(),events=[];let data={scope:{id:'all',name:'Todos'},today:'2026-10-14',employees:[{id:'a',number:'22',name:'Ana',position:'Ayudante',sueldo:'900'}],attendance:{},tombstones:[]};
 const reporter=Report.createReporter({storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}});
 const controller=UI.createController({reporter,getData:()=>data,share:async text=>events.push(text),copy:async text=>events.push(text),onView:()=>{},...options});
 return {controller,reporter,values,events,setData:v=>data=v,getData:()=>data};}
test('vista previa y WhatsApp no registran la referencia; Ya lo envié sí',async()=>{
 const {controller,values,events}=setup();controller.refresh();assert.equal(values.size,0);assert.equal(controller.getView().canConfirm,false);
 assert.equal(await controller.share(),true);assert.equal(events.length,1);assert.equal(values.size,0);assert.equal(controller.getView().canConfirm,true);
 assert.equal(await controller.confirm(),true);assert.equal(values.size,1);controller.refresh();assert.equal(controller.getView().report.hasContent,false);
});
test('cancelar el compartido conserva cambios pendientes y no ofrece confirmar',async()=>{
 const values=new Map(),reporter=Report.createReporter({storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}});
 const controller=UI.createController({reporter,getData:()=>({scope:{id:'all',name:'Todos'},employees:[{id:'a',number:'1',name:'Ana'}],attendance:{}}),share:async()=>{const error=new Error();error.name='AbortError';throw error;},copy:async()=>{},onView:()=>{}});
 controller.refresh();assert.equal(await controller.share(),false);assert.equal(values.size,0);assert.equal(controller.getView().canConfirm,false);assert.match(controller.getView().message,/cancelado|pendientes/);
});
test('lo compartido permanece fijo aunque el empleado cambie antes de confirmar',async()=>{
 const {controller,reporter,setData,getData}=setup();controller.refresh();await controller.share();setData({...getData(),employees:[{...getData().employees[0],sueldo:'1000'}]});
 assert.equal(await controller.confirm(),true);assert.match(reporter.prepare(getData()).text,/900 → 1000/);
});
test('cambiar de obra impide registrar un reporte como si fuera del listado actual',async()=>{
 const {controller,setData,getData,values}=setup();controller.refresh();await controller.copy();setData({...getData(),scope:{id:'obra-B',name:'Obra B'}});
 assert.equal(await controller.confirm(),false);assert.equal(values.size,0);assert.match(controller.getView().message,/obra|listado/);
});
test('sin espacio se mantiene pendiente aunque ya se haya compartido',async()=>{
 const reporter=Report.createReporter({storage:{getItem:()=>null,setItem:()=>{const error=new Error('storage');error.name='QuotaExceededError';throw error;}}});
 const controller=UI.createController({reporter,getData:()=>({scope:{id:'all',name:'Todos'},employees:[{id:'a',name:'Ana',number:'1'}],attendance:{}}),share:async()=>{},copy:async()=>{},onView:()=>{}});
 controller.refresh();await controller.share();assert.equal(await controller.confirm(),false);assert.equal(controller.getView().confirmed,false);assert.equal(controller.getView().canConfirm,true);assert.match(controller.getView().message,/lleno|pendiente/);
});

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
test('confirmation waits for startup and persistence, blocking duplicate actions',async()=>{
 const startup=deferred(),write=deferred();let notifications=0;
 const {controller,values,events}=setup({waitUntilReady:()=>startup.promise,waitUntilPersisted:()=>write.promise,onConfirmed:()=>notifications++});
 controller.refresh();await controller.share();const report=controller.getView().report;
 const result=controller.confirm();
 assert.equal(controller.getView().busy,true);assert.equal(controller.getView().confirmed,false);assert.equal(values.size,0);
 assert.equal(await controller.confirm(),false);assert.equal(await controller.copy(),false);controller.refresh();
 assert.equal(controller.getView().report,report);assert.equal(events.length,1);
 startup.resolve();await new Promise(setImmediate);
 assert.equal(values.size,1);assert.equal(controller.getView().busy,true);assert.equal(controller.getView().confirmed,false);assert.equal(notifications,0);
 assert.doesNotMatch(controller.getView().message,/Reporte registrado/);
 write.resolve();assert.equal(await result,true);assert.equal(controller.getView().busy,false);assert.equal(controller.getView().confirmed,true);assert.equal(notifications,1);
 assert.equal(await controller.confirm(),false);assert.equal(notifications,1);
});
test('failed persistence remains retryable without a success notification',async()=>{
 const write=deferred();let attempts=0,notifications=0;
 const {controller}=setup({waitUntilPersisted:()=>++attempts===1?write.promise:Promise.resolve(),onConfirmed:()=>notifications++});
 controller.refresh();await controller.share();const result=controller.confirm();await new Promise(setImmediate);
 write.reject(new Error('No se pudo guardar la referencia. Intenta de nuevo.'));
 assert.equal(await result,false);assert.equal(controller.getView().busy,false);assert.equal(controller.getView().confirmed,false);assert.equal(controller.getView().canConfirm,true);assert.equal(notifications,0);
 assert.equal(await controller.confirm(),true);assert.equal(notifications,1);
});
test('startup rejection and scope changes never mutate the report reference',async()=>{
 const startup=deferred();const {controller,values}=setup({waitUntilReady:()=>startup.promise});
 controller.refresh();await controller.share();let result=controller.confirm();startup.reject(new Error('Cargando datos'));
 assert.equal(await result,false);assert.equal(values.size,0);assert.equal(controller.getView().canConfirm,true);
 const next=deferred();const other=setup({waitUntilReady:()=>next.promise});other.controller.refresh();await other.controller.share();result=other.controller.confirm();
 other.setData({...other.getData(),scope:{id:'other',name:'Otra obra'}});next.resolve();assert.equal(await result,false);assert.equal(other.values.size,0);
});
test('persistence boundary waits for startup and reads the newly queued write',async()=>{
 const startup=deferred(),write=deferred();let ready=false,queue=Promise.resolve();
 const boundary=UI.createPersistenceBoundary({getStartup:()=>startup.promise,getWriteQueue:()=>queue,isReady:()=>ready,isFallback:()=>false});
 let settled=false;const waiting=boundary.waitUntilReady().then(()=>settled=true);await new Promise(setImmediate);assert.equal(settled,false);
 ready=true;startup.resolve();await waiting;queue=write.promise;
 settled=false;const saving=boundary.waitUntilPersisted().then(()=>settled=true);await new Promise(setImmediate);assert.equal(settled,false);write.resolve();await saving;
});
test('persistence boundary accepts explicit localStorage fallback, not incomplete initialization',async()=>{
 let startup=null,ready=false,fallback=false,queue=Promise.resolve();
 const boundary=UI.createPersistenceBoundary({getStartup:()=>startup,getWriteQueue:()=>queue,isReady:()=>ready,isFallback:()=>fallback});
 await assert.rejects(boundary.waitUntilReady());startup=Promise.resolve();await assert.rejects(boundary.waitUntilReady());
 fallback=true;await boundary.waitUntilReady();await boundary.waitUntilPersisted();
 fallback=false;ready=true;queue=Promise.resolve().then(()=>{ready=false;fallback=true;});await boundary.waitUntilPersisted();
 fallback=false;await assert.rejects(boundary.waitUntilPersisted());
 queue=Promise.reject(new Error('write failed'));await assert.rejects(boundary.waitUntilPersisted(),/write failed/);
});
