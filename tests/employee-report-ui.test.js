const test=require('node:test');const assert=require('node:assert/strict');
const Report=require('../employee-change-report.js');const UI=require('../employee-report-ui.js');
function setup(){const values=new Map(),events=[];let data={scope:{id:'all',name:'Todos'},today:'2026-10-14',employees:[{id:'a',number:'22',name:'Ana',position:'Ayudante',sueldo:'900'}],attendance:{},tombstones:[]};
 const reporter=Report.createReporter({storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}});
 const controller=UI.createController({reporter,getData:()=>data,share:async text=>events.push(text),copy:async text=>events.push(text),onView:()=>{}});
 return {controller,reporter,values,events,setData:v=>data=v,getData:()=>data};}
test('vista previa y WhatsApp no registran la referencia; Ya lo envié sí',async()=>{
 const {controller,values,events}=setup();controller.refresh();assert.equal(values.size,0);assert.equal(controller.getView().canConfirm,false);
 assert.equal(await controller.share(),true);assert.equal(events.length,1);assert.equal(values.size,0);assert.equal(controller.getView().canConfirm,true);
 assert.equal(controller.confirm(),true);assert.equal(values.size,1);controller.refresh();assert.equal(controller.getView().report.hasContent,false);
});
test('cancelar el compartido conserva cambios pendientes y no ofrece confirmar',async()=>{
 const values=new Map(),reporter=Report.createReporter({storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}});
 const controller=UI.createController({reporter,getData:()=>({scope:{id:'all',name:'Todos'},employees:[{id:'a',number:'1',name:'Ana'}],attendance:{}}),share:async()=>{const error=new Error();error.name='AbortError';throw error;},copy:async()=>{},onView:()=>{}});
 controller.refresh();assert.equal(await controller.share(),false);assert.equal(values.size,0);assert.equal(controller.getView().canConfirm,false);assert.match(controller.getView().message,/cancelado|pendientes/);
});
test('lo compartido permanece fijo aunque el empleado cambie antes de confirmar',async()=>{
 const {controller,reporter,setData,getData}=setup();controller.refresh();await controller.share();setData({...getData(),employees:[{...getData().employees[0],sueldo:'1000'}]});
 assert.equal(controller.confirm(),true);assert.match(reporter.prepare(getData()).text,/900 → 1000/);
});
test('cambiar de obra impide registrar un reporte como si fuera del listado actual',async()=>{
 const {controller,setData,getData,values}=setup();controller.refresh();await controller.copy();setData({...getData(),scope:{id:'obra-B',name:'Obra B'}});
 assert.equal(controller.confirm(),false);assert.equal(values.size,0);assert.match(controller.getView().message,/obra|listado/);
});
test('sin espacio se mantiene pendiente aunque ya se haya compartido',async()=>{
 const reporter=Report.createReporter({storage:{getItem:()=>null,setItem:()=>{const error=new Error('storage');error.name='QuotaExceededError';throw error;}}});
 const controller=UI.createController({reporter,getData:()=>({scope:{id:'all',name:'Todos'},employees:[{id:'a',name:'Ana',number:'1'}],attendance:{}}),share:async()=>{},copy:async()=>{},onView:()=>{}});
 controller.refresh();await controller.share();assert.equal(controller.confirm(),false);assert.equal(controller.getView().confirmed,false);assert.equal(controller.getView().canConfirm,true);assert.match(controller.getView().message,/lleno|pendiente/);
});
