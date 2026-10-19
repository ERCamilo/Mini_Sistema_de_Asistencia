const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:9280'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9299')throw new Error('Demo emulators required');
const load=require('node:module').createRequire('/home/ubuntu/worktrees/sa-firebase-link-preview-20261003/infra/firebase-link-preview/package.json');
const {chromium}=load('playwright'),admin=load('firebase-admin/app'),{getAuth}=load('firebase-admin/auth'),{getFirestore}=load('firebase-admin/firestore');
const saRoot=process.env.SA_ROOT;if(!saRoot)throw new Error('SA_ROOT required');
const {createFieldBridgeService}=require(saRoot+'/infra/firebase-field-circuit/service.cjs'),{createFieldInvitationService}=require(saRoot+'/infra/firebase-field-invitations/invitation-service.cjs'),{createInvitationGateway}=require(saRoot+'/infra/firebase-link-preview/gateway.cjs');
const miniRoot=path.resolve(__dirname,'../..'),logs=process.env.CIRCUIT_LOG;console.log('MINI_ROOT',miniRoot);let app,db,browser;const servers=[],pages=[];
function jwt(sub){return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub,iss:'https://accounts.google.com',aud:'demo',email:sub+'@example.test',email_verified:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.';}
const httpDiagnostics=[];
function diagnosticGateway(handler){
 const codes=new Set(['RATE_LIMITED','UNAUTHENTICATED','FORBIDDEN','INVALID_ARGUMENT','INVITE_UNAVAILABLE','SCOPE_UNAVAILABLE','ACCESS_REVOKED','SHARING_DISABLED','REPLAY_CONFLICT','STALE_ROSTER','STALE_SEQUENCE','BODY_TOO_LARGE','BAD_REQUEST','INTERNAL_ERROR','ORIGIN_DENIED','PREFLIGHT_DENIED','JSON_REQUIRED','BAD_JSON','METHOD_NOT_ALLOWED']);
 return (req,res)=>{
  const end=res.end;
  res.end=function(chunk,...args){
   if(res.statusCode>=400){
    const match=/^\/v1\/(field|invitations)\/([a-z]+)$/.exec(req.url||'');let code='OTHER';
    try{const error=JSON.parse(String(chunk||'')).error;if(codes.has(error))code=error;}catch{}
    const diagnostic={operation:match?match[1]+'/'+match[2]:'OTHER',status:res.statusCode,code};httpDiagnostics.push(diagnostic);console.log('HTTP_DIAGNOSTIC',JSON.stringify(diagnostic));
   }
   return end.call(this,chunk,...args);
  };
  return handler(req,res);
 };
}
async function serve(root){const server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)||/\/(\.git|node_modules)\//.test(file))return res.writeHead(403).end();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);return 'http://127.0.0.1:'+server.address().port;}
async function open(type,origin,endpoint,name){const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(({type,config})=>{if(type==='sa')window.SaFieldPreviewConfig=config;else window.MiniFirebaseFieldConfig=config;},{type,config:{firebase:{projectId:'demo-sa-field-access',apiKey:'demo-key',authDomain:'localhost',appId:'demo-app'},endpoint,emulator:'http://127.0.0.1:9299'}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));pages.push({page,errors,name});
if(type==='sa'){await page.goto(origin+'/design.md');await page.evaluate(async()=>{localStorage.setItem('onboardingCompleted','true');localStorage.setItem('asistencia_feature_projects','true');localStorage.setItem('asistencia_default_project_id','PRJ-circuit');localStorage.setItem('asistencia_active_project_id','PRJ-circuit');const {default:db}=await import('/js/modules/services/IndexedDBService.js');await db.init();await db.update('settings',{key:'app',companyName:'Laboratorio Firebase',regularHoursPerDay:8,schemaVersion:3,legacyNavigation:false});await db.update('projects',{id:'PRJ-circuit',name:'Obra sintética',status:'active',schemaVersion:1,createdAt:1,updatedAt:1});await db.update('positions',{id:'pos-main',projectId:'PRJ-circuit',name:'Oficial',active:true,hourlyRate:100});for(let i=1;i<=3;i++)await db.update('employees',{id:'emp-'+i,number:String(i),name:'Persona sintética '+i,projectId:'PRJ-circuit',active:true,positions:['pos-main'],loans:[]});});}
else{await page.goto(origin+'/manifest.json');await page.evaluate(()=>localStorage.setItem('tutorialsSeen',JSON.stringify(['marcar-asistencia','agregar-empleado','liberar-espacio'])));}
await page.goto(origin,{waitUntil:'networkidle'});
if(type==='sa'){await page.waitForFunction(()=>window.App?.state?.employees?.length===3);assert.equal(await page.locator('[data-header-action="open-field-panel"]').count(),0);await page.locator('#header-p2p-indicator').click();await page.waitForFunction(()=>firebase.apps.some(a=>a.name==='sa-field-only'));}
else{await page.waitForFunction(()=>window.employeeRepository);if(await page.locator('#mini-welcome-name').isVisible()){await page.locator('#mini-welcome-name').fill(name);await page.locator('.mini-welcome-submit').click();}await page.evaluate(()=>{document.querySelectorAll('.modal.active').forEach(n=>closeModal(n.id));window.GuidedTour?.stop();switchView('attendance');});await page.locator('#btn-attendance-link').click();}
assert.equal(await page.locator('.mini-p2p-shell,.sa-p2p-shell').filter({visible:true}).count(),1);await page.evaluate(async({type,token})=>{await firebase.app(type==='sa'?'sa-field-only':'mini-field').auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token));},{type,token:jwt(name)});return {page,context};}

async function idle(page){
 await page.evaluate(()=>window.miniCloudFieldView?.whenIdle());
 await page.waitForFunction(()=>!window.miniCloudFieldView?.isBusy()&&document.getElementById('firebase-link-status')?.dataset.linkBusy!=='true'&&!document.getElementById('cloud-field-refresh')?.disabled&&!document.getElementById('sa-field-publish')?.disabled);
}
async function home(page){
 await idle(page);
 if(!await page.locator('[data-connections-home]').isVisible()){
  const back=page.locator('[data-mini-header-back]').filter({visible:true});
  if(await back.count())await back.click();else await page.locator('[data-connections-back]').filter({visible:true}).click();
 }
 await page.locator('[data-connections-home]').waitFor({state:'visible'});await idle(page);
}
async function link(page){await home(page);await page.locator('[data-connections-add]').click();await page.locator('[data-route-card="internet"] input').check();await page.getByRole('button',{name:'Continuar',exact:true}).click();}
async function clickCloud(page,id){
 if(id==='firebase-link-add'){await link(page);return;}
 if(id==='firebase-link-cancel'){await home(page);return;}
 if(id==='cloud-field-refresh'||id==='sa-field-devices-refresh'){await home(page);await page.getByRole('button',{name:'Actualizar conexiones',exact:true}).click();return;}
 if(id==='sa-field-receive'){
  await home(page);await page.getByRole('button',{name:'Actualizar conexiones',exact:true}).click();await idle(page);
  const notice=page.locator('[data-connections-home] [data-notice-kind="sa-attendance"]');
  await notice.getByRole('button',{name:'Revisar asistencia',exact:true}).waitFor({state:'visible'});
  await idle(page);await notice.getByRole('button',{name:'Revisar asistencia',exact:true}).click();
  await page.locator('[data-mini-action="toggle-select-all"]').waitFor({state:'visible'});return;
 }
 if(id==='cloud-field-roster'){await home(page);await page.locator('[data-cloud-action="roster"]').filter({visible:true}).first().click();return;}
 if(id==='cloud-field-leave'){await home(page);await page.locator('[data-connection-detail]').first().click();await page.locator('[data-cloud-action="leave"]').filter({visible:true}).first().click();return;}
 if(!await page.locator('#'+id).isVisible()){await home(page);await page.locator('[data-primary-action="send"]').click();}
 await page.locator('#'+id).click();
}

async function expectLinked(page){
 await page.waitForFunction(()=>document.getElementById('firebase-link-status')?.dataset.linkPhase==='linked'&&document.getElementById('firebase-link-status')?.dataset.linkBusy==='false');
 await page.locator('[data-link-result]').getByText('Conectado con Obra sintética',{exact:true}).waitFor({state:'visible'});
 await idle(page);await page.getByRole('button',{name:'Ir a conexiones',exact:true}).click();
 await expectBindings(page);
}
async function expectBindings(page){
 await page.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===1);
 await page.locator('[data-connections-home]').waitFor({state:'visible'});await page.locator('[data-connections-list] [data-connection-card]').filter({visible:true}).first().waitFor({state:'visible'});
 assert.equal(await page.locator('[data-connection-account-open]').isVisible(),true);
}
async function openAccount(page){await home(page);await page.locator('[data-connection-account-open]').click();}
async function openDeviceActions(page,id){
 const card=page.locator('[data-device-id="'+id+'"]');if(await card.locator('[data-device-action]').isVisible())return;
 await home(page);const owner=page.locator('[data-connection-account-id]').filter({has:card});
 if(await owner.count())await owner.locator('[data-connection-detail]').first().click();else await openDeviceActions(sa.page,await card.getAttribute('data-device-id'));
 await card.locator('[data-device-action]').waitFor({state:'visible'});
}

(async()=>{try{fs.mkdirSync(logs,{recursive:true});app=admin.initializeApp({projectId:'demo-sa-field-access'},'field-browser');db=getFirestore(app);const auth=getAuth(app);await fetch('http://127.0.0.1:9280/emulator/v1/projects/demo-sa-field-access/databases/(default)/documents',{method:'DELETE'});const saOrigin=await serve(saRoot),miniOrigin=await serve(miniRoot);const server=http.createServer(diagnosticGateway(createInvitationGateway({service:createFieldInvitationService({db,auth}),fieldService:createFieldBridgeService({db,auth}),auth,allowedOrigins:[saOrigin,miniOrigin],allowLocalHttp:true,ipLimit:300,uidLimit:300})));await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);const endpoint='http://127.0.0.1:'+server.address().port;
browser=await chromium.launch({executablePath:'/snap/bin/chromium',headless:true,args:['--no-sandbox']});const sa=await open('sa',saOrigin,endpoint,'office-cloud');await sa.page.locator('#sa-field-login').waitFor({state:'hidden'});await link(sa.page);await sa.page.locator('#sa-field-all').click();await sa.page.locator('#sa-field-publish').click();await sa.page.getByText(/3 empleados publicados/).waitFor();console.log('PASS SA publish through actual UI');const expectedOwnerUid=await sa.page.evaluate(()=>firebase.app('sa-field-only').auth().currentUser.uid);
const minis=[];
for(let i=1;i<=3;i++){if(!await sa.page.locator('#sa-field-create').isVisible())await sa.page.getByRole('button',{name:'Crear invitación para Mini',exact:true}).click();else await sa.page.locator('#sa-field-create').click();await sa.page.locator('#sa-field-invite').waitFor({state:'visible'});await sa.page.waitForFunction(()=>!document.getElementById('sa-field-create').disabled);const token=await sa.page.locator('#sa-field-code').inputValue();assert.ok(token);const mini=await open('mini',miniOrigin,endpoint,'leader-cloud-'+i);minis.push(mini);await link(mini.page);await mini.page.locator('#firebase-link-code').fill(token);await mini.page.locator('#firebase-link-review').click();await mini.page.locator('#firebase-link-confirm').waitFor({state:'visible'});await mini.page.locator('#firebase-link-confirm').click();await expectLinked(mini.page);await clickCloud(mini.page,'cloud-field-refresh');await expectBindings(mini.page);await clickCloud(mini.page,'cloud-field-roster');await mini.page.locator('[data-review-roster]').click();await mini.page.locator('[data-apply-roster]').click();await mini.page.locator('.mini-roster-result').filter({hasText:'Personal actualizado'}).waitFor();assert.equal(await mini.page.evaluate(()=>window.employeeRepository.getAll().length),3);await mini.page.locator('[data-finish-roster]').click();await mini.page.locator('[data-primary-action="send"]').waitFor({state:'visible'});assert.equal(await mini.page.locator('.mini-p2p-shell,.sa-p2p-shell').filter({visible:true}).count(),1);await mini.page.evaluate(()=>{closeP2PTransferModal();document.querySelectorAll('.modal.active').forEach(n=>closeModal(n.id));switchView('attendance');});await mini.page.getByRole('button',{name:'Marcar presente a Persona sintética '+i,exact:true}).click();await mini.page.evaluate(()=>openModal('firebase-link-modal'));await clickCloud(mini.page,'cloud-field-send');await mini.page.getByText(/SA recibió la asistencia/).waitFor();console.log('PASS Mini '+i+' invitation, reviewed roster, actual attendance send');}


async function poll(page,kind,revision){
 for(let i=0;i<50;i++){
  const result=await page.evaluate(async()=>{await miniCloudFieldView.pollUpdates();return miniCloudFieldView.getUpdates();});
  if(result.some(e=>e.kind===kind&&(!revision||e.revision.includes('"'+revision+'"'))))return result;
  await page.waitForTimeout(100);
 }
 throw Error('No update '+kind+' '+revision);
}
async function miniHome(page){await page.evaluate(()=>openP2PTransferModal());await page.waitForFunction(()=>!document.getElementById('cloud-field-refresh').disabled);await home(page);}
async function publishAgain(){
 await home(sa.page);await sa.page.locator('[data-primary-action="personal"]').click();
 await sa.page.locator('#sa-field-all').click();await sa.page.locator('#sa-field-publish').click();
 await sa.page.waitForFunction(()=>!document.getElementById('sa-field-publish').disabled);
}
async function closeMini(page){await page.evaluate(()=>miniCloudFieldView.whenIdle());await page.waitForFunction(()=>window.miniConnectionsMenu?.canNavigate?.()!==false);await page.evaluate(()=>closeP2PTransferModal());await page.locator('.mini-p2p-shell').waitFor({state:'hidden'});}
async function notice(page,text){return page.locator('.mini-notice').filter({hasText:text});}
await publishAgain();const a=minis[0],b=minis[1],c=minis[2];await closeMini(a.page);await closeMini(b.page);await closeMini(c.page);
await a.page.waitForFunction(()=>miniCloudFieldView.getUpdates().some(e=>e.kind==='roster'&&e.revision.includes('\"2\"')),{},{timeout:90000});const update=a.page.locator('.mini-notice').filter({hasText:'Personal actualizado disponible'});await update.getByRole('button',{name:'Revisar',exact:true}).waitFor();
await update.getByRole('button',{name:'Revisar',exact:true}).click();
await a.page.locator('[data-review-roster]').waitFor();assert.equal(await a.page.evaluate(()=>MiniP2PRosterVersions.getGuard().getLastApplied('PRJ-circuit').rosterVersion),'1');
await a.page.locator('[data-review-roster]').click();await a.page.locator('[data-apply-roster]').click();await a.page.locator('[data-finish-roster]').waitFor();await a.page.locator('[data-finish-roster]').click();
await a.page.waitForFunction(()=>!miniCloudFieldView.getUpdates().some(e=>e.kind==='roster'));
assert.equal(await a.page.evaluate(()=>MiniP2PRosterVersions.getGuard().getLastApplied('PRJ-circuit').rosterVersion),'2');
console.log('PASS automatic roster metadata, actionable notice, human review, remove after apply');
const bridge=createFieldBridgeService({db,auth}),invitations=createFieldInvitationService({db,auth});
const ownerToken=await sa.page.evaluate(()=>firebase.app('sa-field-only').auth().currentUser.getIdToken());
const {orgId}=await bridge.bootstrap({idToken:ownerToken,name:'Laboratorio Firebase'});
await bridge.provision({idToken:ownerToken,orgId,projectId:'PRJ-second',projectName:'Obra segunda',groupId:'group-second',groupName:'Grupo segundo',roster:{schema:'sa-roster/v1',version:1,saProjectId:'PRJ-second',generatedAt:'2026-10-05T00:00:00.000Z',employees:[{saEmployeeId:'second-e',number:'91',name:'Persona segunda',position:'Oficial'}]}});
const invite=await invitations.issue({idToken:ownerToken,orgId,projectId:'PRJ-second',groupIds:['group-second']});
await b.page.evaluate(()=>openP2PTransferModal());await link(b.page);await b.page.locator('#firebase-link-code').fill(invite.token);await b.page.locator('#firebase-link-review').click();await b.page.locator('#firebase-link-confirm').waitFor();await b.page.locator('#firebase-link-confirm').click();await b.page.waitForFunction(()=>!document.getElementById('firebase-link-confirm').disabled);await clickCloud(b.page,'cloud-field-refresh');await b.page.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===2);await b.page.evaluate(()=>miniCloudFieldView.whenIdle());
await closeMini(b.page);
for(let i=0;i<30;i++){await b.page.evaluate(()=>miniCloudFieldView.pollUpdates());if(await b.page.evaluate(()=>miniCloudFieldView.getUpdates().some(e=>e.scope.projectId==='PRJ-second')))break;await b.page.waitForTimeout(100);}
await b.page.locator('.mini-notice').filter({hasText:'Obra segunda'}).getByRole('button',{name:'Revisar',exact:true}).click();await b.page.locator('[data-review-roster]').waitFor();
assert.equal(await b.page.locator('#cloud-field-binding').evaluate(s=>s.selectedOptions[0].dataset.projectId),'PRJ-second');
assert.equal(await b.page.evaluate(()=>employeeRepository.getAll().some(e=>e.saProjectId==='PRJ-second')),false);
await b.page.locator('[data-review-roster]').click();await b.page.locator('[data-apply-roster]').click();await b.page.locator('[data-finish-roster]').waitFor();await b.page.locator('[data-finish-roster]').click();await closeMini(b.page);
console.log('PASS notification for a nonselected second work selects its exact authorized scope');
await poll(c.page,'roster','2');await c.page.locator('.mini-notice').filter({hasText:'Personal actualizado disponible'}).getByRole('button',{name:'Después',exact:true}).click();
await c.page.reload({waitUntil:'networkidle'});await poll(c.page,'roster','2');await miniHome(c.page);
assert.equal(await c.page.locator('.mini-notice').filter({hasText:'Personal actualizado disponible'}).count(),0);
assert.equal(await c.page.locator('[data-notice-kind="roster"]').count(),1);
assert.ok((await c.page.locator('[data-notice-kind="roster"]').innerText()).includes('Guardado para después'));
const homeNode=c.page.locator('[data-connections-home]');assert.equal(await homeNode.locator(':scope > :first-child').getAttribute('data-connections-actions'),'');
assert.equal(await c.page.locator('[role="tablist"]').count(),0);
await c.page.screenshot({path:path.join(logs,'actions-first-mini.png')});
console.log('PASS defer survives reload, no repeated popup, pending stays in actions-first overview');
await home(sa.page);await sa.page.getByRole('button',{name:'Actualizar conexiones',exact:true}).click();await sa.page.waitForFunction(()=>!document.getElementById('sa-field-publish').disabled);
const devices=await Promise.all(minis.map(async mini=>await mini.page.evaluate(async()=>{
 const uid=firebase.app('mini-field').auth().currentUser.uid,bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid));
 return 'cloud-'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,20)+'-'+localStorage.getItem('mini-cloud-device-v1');
})));
for(const device of devices){const card=sa.page.locator('[data-device-id="'+device+'"]');await home(sa.page);await openDeviceActions(sa.page,await card.getAttribute('data-device-id'));await card.locator('[data-sharing-action]').click();await card.locator('[data-sharing-confirm]').click();await sa.page.waitForFunction(()=>!document.getElementById('sa-field-publish').disabled);}
await miniHome(a.page);await a.page.locator('[data-cloud-action="members"]').first().click();await a.page.locator('#cloud-members-refresh').click();await a.page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
await a.page.locator('#cloud-members-target').selectOption(devices[1]);await a.page.locator('#cloud-members-send').click();await a.page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
await poll(b.page,'attendance');const incoming=b.page.locator('.mini-notice').filter({hasText:'asistencia(s) compartida(s)'});await incoming.getByRole('button',{name:'Revisar',exact:true}).waitFor();await idle(b.page);await b.page.waitForFunction(()=>window.miniConnectionsMenu?.canNavigate?.()!==false);await incoming.getByRole('button',{name:'Revisar',exact:true}).click();await b.page.locator('#cloud-members-apply').waitFor();
assert.equal(await b.page.locator('#cloud-members-apply').isEnabled(),false);
assert.equal(await b.page.evaluate(()=>{const e=employeeRepository.getAll().find(e=>e.saEmployeeId==='emp-1');return attendanceRepository.getRecord(e.id,document.getElementById('cloud-field-date').value);}),null);
await b.page.locator('#cloud-members-discard').click();await b.page.waitForFunction(()=>!miniCloudFieldView.getUpdates().some(e=>e.kind==='attendance'));
console.log('PASS shared-attendance notification opens exact received review, no auto mutation, discard clears notice');
await closeMini(c.page);await publishAgain();await poll(c.page,'roster','3');await c.page.locator('.mini-notice').filter({hasText:'Personal actualizado disponible'}).getByRole('button',{name:'Después',exact:true}).waitFor();
console.log('PASS a newer roster announces after an earlier deferral');
await sa.page.evaluate(()=>saFieldNotifications.poll());await sa.page.waitForFunction(()=>saFieldNotifications.snapshot().some(e=>e.kind==='sa-attendance'));
await home(sa.page);await sa.page.screenshot({path:path.join(logs,'actions-first-sa.png')});
await sa.page.evaluate(()=>closeP2PRosterTransfer());await sa.page.locator('.connection-notification').filter({hasText:'envío(s) de Mini por revisar'}).getByRole('button',{name:'Revisar',exact:true}).click();
await sa.page.locator('[data-mini-action="toggle-select-all"]').waitFor();
assert.equal(await sa.page.evaluate(async()=>{const {default:db}=await import('/js/modules/services/IndexedDBService.js');return(await db.getAll('attendanceSubmissionInbox')).length;}),3);
assert.equal(await sa.page.evaluate(async()=>{const {default:db}=await import('/js/modules/services/IndexedDBService.js');return(await db.getAll('attendance')).length;}),0);
console.log('PASS SA notification opens received inbox, staged durable, never auto applies');
await c.page.evaluate(()=>firebase.app('mini-field').auth().signOut());await c.page.waitForFunction(()=>miniCloudFieldView.getUpdates().length===0);
await c.page.waitForTimeout(500);assert.equal(await c.page.locator('.mini-notice').filter({hasText:'Personal actualizado disponible'}).count(),0);
console.log('PASS logout removes account notices and pending dashboard');
for(const p of pages){assert.deepEqual(p.errors,[],p.name);assert.equal(await p.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,p.name);}
console.log('PASS notifications and actions-first mobile browser circuit');
}catch(e){for(const p of pages){console.log('DEBUG',p.name,await p.page.locator('body').innerText(),p.errors);await p.page.screenshot({path:path.join(logs,p.name+'-notices-failure.png')});}throw e;}finally{if(browser)await browser.close();for(const server of servers)await new Promise(r=>server.close(r));if(db)await db.terminate();if(app)await admin.deleteApp(app);}})().catch(e=>{console.error(e);process.exitCode=1;});
