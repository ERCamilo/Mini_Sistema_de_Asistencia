import test,{before,after}from 'node:test';
import assert from 'node:assert/strict';
import {loadPlaywright,serve,PHONE}from '../tutorials/lib.mjs';
let browser,server,base;
before(async()=>{const {chromium}=await loadPlaywright();server=await serve();base=`http://localhost:${server.address().port}/`;browser=await chromium.launch();});
after(async()=>{await browser?.close();server?.close();});
async function device(){
 const context=await browser.newContext({viewport:PHONE,serviceWorkers:'block',locale:'es-ES',timezoneId:'America/Santo_Domingo'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'manifest.json');await page.evaluate(()=>{
   localStorage.setItem('users',JSON.stringify([{id:'a',number:'22',name:'Ana',position:'Ayudante',sueldo:'900'},{id:'b',number:'7',name:'Beto',position:'Oficial',sueldo:'1200'}]));
   localStorage.setItem('attendance',JSON.stringify({'2026-10-01':{a:{status:'present',hours:8}}}));
   localStorage.setItem('tutorialsSeen','["marcar-asistencia"]');localStorage.setItem('storageHelpSnoozedUntil',String(Date.now()+86400000));
 });
 await page.goto(base,{waitUntil:'networkidle'});
 if(await page.waitForSelector('#mini-welcome-name',{timeout:4000}).then(()=>true,()=>false)){await page.fill('#mini-welcome-name','Reporte');await page.click('.mini-welcome-submit');}
 await page.waitForFunction(()=>document.getElementById('storage-mode-hint').textContent.includes('días guardados')&&localDbReady);
 await page.evaluate(()=>{
   window.__reports=[];window.__copies=[];window.open=url=>{window.__reports.push(url);return {opener:null};};
   Object.defineProperty(navigator,'share',{value:undefined,configurable:true});
   Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copies.push(text)},configurable:true});
   switchView('employees');
 });
 return {context,page,errors};
}
const open=async page=>{await page.click('#btn-employee-report');await page.waitForSelector('#modal-employee-report.active');};
const preview=page=>page.inputValue('#employee-report-text');
test('primer reporte y sólo cambios: WhatsApp no confirma; copia/confirmación conserva IDs y horas',async()=>{
 const {context,page,errors}=await device();try{
   const original=await page.evaluate(()=>({users:employeeRepository.getAll(),attendance:attendanceRepository.getAll()}));
   await open(page);assert.match(await preview(page),/22\. Ana[\s\S]*Precio por día: 900[\s\S]*01\/10\/2026/);
   assert.equal(await page.isDisabled('#employee-report-changes'),true);
   await page.click('#employee-report-share');assert.equal(await page.evaluate(()=>localStorage.getItem('mini_employee_report_v1')),null);
   assert.match(await page.evaluate(()=>decodeURIComponent(window.__reports[0].split('?text=')[1])),/Beto/);
   await page.click('#employee-report-confirm');
   assert.deepEqual(await page.evaluate(()=>({users:employeeRepository.getAll(),attendance:attendanceRepository.getAll()})),original);
   await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>localDbReady);await page.evaluate(()=>{switchView('employees');const e=employeeRepository.getById('a');employeeRepository.save({...e,number:'33',position:'Albañil',sueldo:'1000'});});
   await open(page);const text=await preview(page);assert.match(text,/Número: 22 → 33/);assert.match(text,/Puesto: Ayudante → Albañil/);assert.match(text,/Precio por día: 900 → 1000/);assert.doesNotMatch(text,/Beto/);
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.__copied=text},configurable:true}));
   await page.click('#employee-report-copy');assert.equal(await page.evaluate(()=>window.__copied),text);await page.click('#employee-report-confirm');await page.click('#employee-report-refresh');
   assert.match(await preview(page),/Sin cambios/);assert.equal(await page.isDisabled('#employee-report-share'),true);
   assert.equal(await page.evaluate(()=>attendanceRepository.getRecord('a','2026-10-01').hours),8);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('edición posterior al compartido permanece pendiente y el respaldo incluye la referencia',async()=>{
 const {context,page,errors}=await device();try{
   await open(page);await page.click('#employee-report-share');await page.evaluate(()=>{employeeRepository.save({...employeeRepository.getById('a'),sueldo:'1000'});});await page.click('#employee-report-confirm');
   const saved=await page.evaluate(()=>buildMiniBackupData());assert.ok(saved.settings.mini_employee_report_v1);
   await page.click('#employee-report-refresh');assert.match(await preview(page),/900 → 1000/);
   // Exercise the real atomic backup restore with its exact report reference.
   await page.evaluate(backup=>{localStorage.removeItem('mini_employee_report_v1');applyBackupRestore(backup);},saved);
   await page.click('#employee-report-refresh');assert.match(await preview(page),/900 → 1000/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('la obra limita el listado, la búsqueda no; borrar todo también borra la referencia',async()=>{
 const {context,page,errors}=await device();try{
   await page.evaluate(()=>{const c=workContextManager.saveContext({name:'Obra Norte',type:'project'});workContextManager.assignEmployeeContext('a',c.id,employeeRepository);workContextManager.setActive(c.id);});
   await page.fill('#search-employees','No coincide');await open(page);assert.match(await preview(page),/Obra Norte[\s\S]*Ana/);assert.doesNotMatch(await preview(page),/Beto/);
   await page.click('#employee-report-share');await page.click('#employee-report-confirm');await page.evaluate(()=>{closeModal('modal-employee-report');clearAllData();});
   await page.click('#modal-confirm.active #confirm-ok');await page.waitForFunction(()=>employeeRepository.getAll().length===0);
   assert.equal(await page.evaluate(()=>localStorage.getItem('mini_employee_report_v1')),null);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('reporte largo: compartido nativo conserva todo el texto y cancelar no cambia referencia',async()=>{
 const {context,page,errors}=await device();try{
   await page.evaluate(()=>{const staff=Array.from({length:100},(_,i)=>({id:'employee-'+i,number:String(i+1),name:'Empleado con nombre extenso '+i,position:'Ayudante',sueldo:'1500'}));employeeRepository.importBatch(staff,'replace');});
   await open(page);const text=await preview(page);assert.ok(text.length>7000);
   await page.click('#employee-report-share');assert.match(await page.textContent('#employee-report-status'),/largo/);assert.equal(await page.isVisible('#employee-report-confirm'),false);
   await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>window.__native=payload.text}));
   await page.click('#employee-report-share');assert.equal(await page.evaluate(()=>window.__native),text);
   await page.click('#employee-report-refresh');await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelado','AbortError');}}));
   await page.click('#employee-report-share');assert.match(await page.textContent('#employee-report-status'),/cancelado/);assert.equal(await page.isVisible('#employee-report-confirm'),false);assert.equal(await page.evaluate(()=>localStorage.getItem('mini_employee_report_v1')),null);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('320–480 px y cinco temas: nombres accesibles, contraste, sin desbordes y controles táctiles',async()=>{
 const {context,page,errors}=await device();try{
   await open(page);
   if(process.env.AXE_PATH)await page.addScriptTag({path:process.env.AXE_PATH});
   for(const width of [320,390,480])for(const theme of ['dark','light','contrast','ocean','sol']){
     await page.setViewportSize({width,height:844});await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
     const layout=await page.evaluate(()=>{
       const root=document.querySelector('#modal-employee-report .modal-content'),r=root.getBoundingClientRect();
       return {overflow:r.left<0||r.right>innerWidth+1,small:[...root.querySelectorAll('button:not([hidden])')].filter(el=>{const r=el.getBoundingClientRect();return r.width<44||r.height<44;}).map(el=>el.id),outside:[...root.querySelectorAll('button:not([hidden]),textarea')].filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth+1;}).map(el=>el.id)};
     });assert.deepEqual(layout,{overflow:false,small:[],outside:[]},{width,theme});
     if(process.env.AXE_PATH){const violations=await page.evaluate(async()=> (await axe.run(document.getElementById('modal-employee-report'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(violations,[],{width,theme});}
   }assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
