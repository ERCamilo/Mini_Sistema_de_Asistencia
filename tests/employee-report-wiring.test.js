const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('el reporte funciona offline y su referencia participa en respaldo/borrado completo',()=>{
 const html=read('index.html'),sw=read('sw.js');
 for(const file of ['employee-change-report.js','employee-report-ui.js','employee-report.css']){
   assert.ok(html.includes('./'+file),file+' cargado');assert.ok(sw.includes("'./"+file+"'"),file+' precached');
 }
 assert.ok(html.indexOf('./employee-change-report.js')<html.indexOf('./employee-report-ui.js'));
 const settings=html.match(/const BACKUP_SETTINGS_KEYS = \[([^\]]+)\]/)[1];assert.match(settings,/mini_employee_report_v1/);
 const reset=html.slice(html.indexOf('window.clearAllData ='),html.indexOf('// --- COPIAR AL PORTAPAPELES ---'));assert.match(reset,/mini_employee_report_v1/);
});

test('report confirmation uses the real startup promise and current snapshot queue',()=>{
 const html=read('index.html');
 assert.match(html,/localPersistenceReady = initLocalPersistence\(\)/);
 assert.match(html,/EmployeeReportUI\.createPersistenceBoundary\(\{[\s\S]*?getStartup: \(\) => localPersistenceReady,[\s\S]*?getWriteQueue: \(\) => localDbWriteQueue,[\s\S]*?isReady: \(\) => localDbReady,[\s\S]*?isFallback: \(\) => !window\.MiniLocalDb\.isEnabled\(localStorage\)/);
 assert.match(html,/EmployeeReportUI\.configure\(\{\s*\.\.\.employeeReportPersistence/);
});
