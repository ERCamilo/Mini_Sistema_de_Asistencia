const test=require('node:test');
const assert=require('node:assert/strict');
const Report=require('../employee-change-report.js');
const employees=[{id:'a',number:'22',name:'Ana',position:'Ayudante',sueldo:'900'},{id:'b',number:'7',name:'Beto',position:'Oficial',sueldo:'1200'}];
const attendance={'2026-10-01':{a:{status:'present',hours:8}},'2026-09-01':{a:{status:'absent',hours:0}},'2026-02-30':{a:{status:'present',hours:8}},'2026-10-20':{b:{status:'present',hours:8}}};
function setup(){const values=new Map();let seq=0;const reporter=Report.createReporter({storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},now:()=> '2026-10-14T16:00:00.000Z',id:()=> 'r-'+ ++seq});return {values,reporter};}
const input=(overrides={})=>({scope:{id:'all',name:'Todos los empleados'},employees,attendance,tombstones:[],today:'2026-10-14',...overrides});
test('el primer listado trae campos diarios y primera asistencia real, sin inferir ingreso',()=>{
 const {reporter,values}=setup(),report=reporter.prepare(input());
 assert.equal(report.hasReference,false);assert.equal(report.mode,'full');
 assert.match(report.text,/22\. Ana/);assert.match(report.text,/Precio por día: 900/);assert.match(report.text,/Primera asistencia registrada: 01\/10\/2026/);
 assert.match(report.text,/Beto[\s\S]*Sin asistencia registrada/);assert.equal(values.size,0);
});
test('cambios por ID muestran antes/después y omiten empleados sin cambios',()=>{
 const {reporter}=setup();reporter.confirm(reporter.prepare(input()));
 const changed=[{...employees[0],number:'33',position:'Albañil',sueldo:'1000'},employees[1],{id:'c',number:'40',name:'Carlos',position:'Pintor',sueldo:'1100'}];
 const report=reporter.prepare(input({employees:changed}));
 assert.equal(report.mode,'changes');assert.match(report.text,/Número: 22 → 33/);assert.match(report.text,/Puesto: Ayudante → Albañil/);assert.match(report.text,/Precio por día: 900 → 1000/);
 assert.match(report.text,/Nuevo[\s\S]*Carlos/);assert.doesNotMatch(report.text,/Beto/);
});
test('sueldo equivalente y metadata no crean cambios; completo sigue incluyendo todos',()=>{
 const {reporter}=setup();reporter.confirm(reporter.prepare(input()));
 const data=input({employees:[{...employees[0],sueldo:'900.00',updatedAt:'nuevo',saEmployeeId:'SA-A'},employees[1]]});
 assert.equal(reporter.prepare(data).hasContent,false);
 const full=reporter.prepare({...data,mode:'full'});assert.match(full.text,/Beto/);assert.equal(full.hasContent,true);
});
test('archivar conserva la primera asistencia; borrarla explícitamente permite corregirla',()=>{
 const {reporter}=setup();reporter.confirm(reporter.prepare(input()));
 const later={'2026-10-10':{a:{status:'present',hours:8}}};
 assert.equal(reporter.prepare(input({attendance:later})).hasContent,false);
 const correction=reporter.prepare(input({attendance:later,tombstones:[{employeeId:'a',date:'2026-10-01'}]}));
 assert.match(correction.text,/Primera asistencia registrada: 01\/10\/2026 → 10\/10\/2026/);
});
test('confirmar registra lo revisado; una edición posterior sigue pendiente',()=>{
 const {reporter,values}=setup(),report=reporter.prepare(input());
 assert.equal(values.size,0);reporter.confirm(report);const saved=[...values.values()];reporter.confirm(report);assert.deepEqual([...values.values()],saved);
 const next=reporter.prepare(input({employees:[{...employees[0],sueldo:'1000'},employees[1]]}));assert.match(next.text,/900 → 1000/);
});
test('obras separadas no pisan referencias; una confirmación obsoleta se rechaza',()=>{
 const {reporter}=setup(),first=reporter.prepare(input()),stale=reporter.prepare(input());
 const other=reporter.prepare(input({scope:{id:'ctx-1',name:'Obra uno'},employees:[employees[0]]}));
 reporter.confirm(other);reporter.confirm(first);
 assert.throws(()=>reporter.confirm(stale),/referencia|revisión/i);
 assert.equal(reporter.prepare(input({scope:{id:'ctx-1',name:'Obra uno'},employees:[employees[0]]})).hasReference,true);
});
test('cuota y referencia corrupta no se registran silenciosamente',()=>{
 const storage={getItem:()=>null,setItem:()=>{throw new Error('cuota');}},reporter=Report.createReporter({storage});
 assert.throws(()=>reporter.confirm(reporter.prepare(input())),/cuota/);
 const corrupt=Report.createReporter({storage:{getItem:()=>'{roto',setItem:()=>{throw new Error('no debe escribir');}}});
 assert.throws(()=>corrupt.prepare(input()),/referencia/i);
});
test('nombres/estados cambiados y filas retiradas se comunican sin asumir eliminación',()=>{
 const {reporter}=setup();reporter.confirm(reporter.prepare(input()));
 const report=reporter.prepare(input({employees:[{...employees[0],name:'Ana Pérez',paused:true}]}));
 assert.match(report.text,/Nombre: Ana → Ana Pérez/);assert.match(report.text,/Estado: Activo → Pausado/);assert.match(report.text,/Ya no figura en este listado[\s\S]*Beto/);
});
test('un empleado sin asistencia reportada muestra su primera marca al registrarse',()=>{
 const {reporter}=setup();reporter.confirm(reporter.prepare(input()));
 const report=reporter.prepare(input({attendance:{...attendance,'2026-10-12':{b:{status:'present',hours:8}}}}));
 assert.match(report.text,/Primera asistencia registrada: Sin asistencia registrada → 12\/10\/2026/);assert.doesNotMatch(report.text,/Ana/);
});
