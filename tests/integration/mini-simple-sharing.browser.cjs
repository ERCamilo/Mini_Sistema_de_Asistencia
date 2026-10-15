const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:9280'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9299')throw new Error('Demo emulators required');
const load=require('node:module').createRequire('/home/ubuntu/worktrees/sa-firebase-link-preview-20261003/infra/firebase-link-preview/package.json');
const {chromium}=load('playwright'),admin=load('firebase-admin/app'),{getAuth}=load('firebase-admin/auth'),{getFirestore}=load('firebase-admin/firestore');
const saRoot=process.env.SA_ROOT;if(!saRoot)throw new Error('SA_ROOT required');
const {createFieldBridgeService}=require(saRoot+'/infra/firebase-field-circuit/service.cjs'),{createFieldInvitationService}=require(saRoot+'/infra/firebase-field-invitations/invitation-service.cjs'),{createInvitationGateway}=require(saRoot+'/infra/firebase-link-preview/gateway.cjs');
const miniRoot=path.resolve(__dirname,'../..'),logs=process.env.CIRCUIT_LOG;console.log('MINI_ROOT',miniRoot);let app,db,browser;const servers=[],pages=[];
function jwt(sub){return Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub,iss:'https://accounts.google.com',aud:'demo',name:'Responsable '+sub,email:sub+'@example.test',email_verified:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.';}
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
assert.equal(await page.locator('.mini-p2p-shell,.sa-p2p-shell').filter({visible:true}).count(),1);
await page.locator('[data-connection-account-open]').click();const google=page.locator(type==='sa'?'#sa-field-login':'#firebase-link-login');await google.waitFor({state:'visible'});assert.equal(await google.innerText(),'Iniciar sesión con Google');assert.ok((await google.boundingBox()).height>=44);await page.waitForFunction(type=>document.querySelector(type==='sa'?'#sa-field-login img':'#firebase-link-login img')?.naturalWidth>0,type);await page.screenshot({path:path.join(logs,type+'-classic-google-account.png')});
await page.evaluate(async({type,token,name})=>{const result=await firebase.app(type==='sa'?'sa-field-only':'mini-field').auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token));await result.user.updateProfile({displayName:'Responsable '+name});await result.user.getIdToken(true);},{type,token:jwt(name),name});return {page,context};}

async function audit(page,title,file){
 const original=await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
 for(const theme of ['dark','light','sol','contrast','ocean']){
  await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
  await page.screenshot({path:path.join(logs,'mini-simple-'+file+'-'+theme+'.png'),animations:'disabled'});
  const rows=await page.locator('.mini-p2p-shell').evaluate(shell=>{
   const rgba=s=>{const m=s.match(/[\d.]+/g);return m?m.map(Number):[0,0,0,0];};
   const blend=(f,b)=>{const a=f[3]??1;return [0,1,2].map(i=>f[i]*a+b[i]*(1-a));};
   const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const background=n=>{const chain=[];for(let p=n;p;p=p.parentElement)chain.unshift(p);return chain.reduce((b,p)=>blend(rgba(getComputedStyle(p).backgroundColor),b),[255,255,255]);};
   return [...shell.querySelectorAll('*')].filter(n=>n.getClientRects().length&&!n.closest('[disabled]')&&getComputedStyle(n).visibility!=='hidden'&&[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())).flatMap(n=>{const s=getComputedStyle(n),f=rgba(s.color);if(f[3]===0||Number(s.opacity)<1)return [];const bg=background(n),fg=blend(f,bg),lo=lum(bg),hi=lum(fg),ratio=(Math.max(lo,hi)+.05)/(Math.min(lo,hi)+.05),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700);return [{text:n.textContent.trim().slice(0,100),ratio,required:large?3:4.5,color:s.color,background:bg}];});
  });
  fs.writeFileSync(path.join(logs,'mini-simple-'+file+'-'+theme+'-contrast.json'),JSON.stringify(rows,null,2));
  assert.deepEqual(rows.filter(r=>r.ratio+.02<r.required),[],title+' '+theme+' contrast');
 }
 await page.evaluate(theme=>{if(theme)document.documentElement.setAttribute('data-theme',theme);else document.documentElement.removeAttribute('data-theme');},original);
}
async function miniScreen(page,title,file){
 await page.waitForFunction(title=>document.querySelector('[data-mini-page-title]')?.textContent===title,title);
 await page.waitForFunction(()=>!document.querySelector('.mini-p2p-shell').style.height);
 assert.equal(await page.locator('.connections-screen-title:visible,[data-connections-back]:visible').count(),0);
 await audit(page,title,file);
 const small=await page.locator('.mini-p2p-shell button:visible').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
 assert.deepEqual(small,[],title+' 44px controls');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.mini-p2p-shell')),true,title+' keyboard focus');
 await page.setViewportSize({width:768,height:900});await page.screenshot({path:path.join(logs,'mini-simple-'+file+'-desktop.png'),animations:'disabled'});
 assert.equal(await page.locator('.mini-p2p-shell').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&n.scrollWidth<=n.clientWidth+1;}),true,title+' desktop');

 await page.setViewportSize({width:360,height:800});
 assert.equal(await page.locator('.mini-p2p-shell').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&n.scrollWidth<=n.clientWidth+1;}),true,'360px '+title);
 await page.screenshot({path:path.join(logs,'mini-simple-'+file+'-360.png'),animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 console.log('PASS simple Mini '+title+'; five measured themes and 360px');
}
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

(async()=>{try{fs.mkdirSync(logs,{recursive:true});app=admin.initializeApp({projectId:'demo-sa-field-access'},'field-browser');db=getFirestore(app);const auth=getAuth(app);await fetch('http://127.0.0.1:9280/emulator/v1/projects/demo-sa-field-access/databases/(default)/documents',{method:'DELETE'});const saOrigin=await serve(saRoot),miniOrigin=await serve(miniRoot);const server=http.createServer(diagnosticGateway(createInvitationGateway({service:createFieldInvitationService({db,auth}),fieldService:createFieldBridgeService({db,auth}),auth,allowedOrigins:[saOrigin,miniOrigin],allowLocalHttp:true,ipLimit:1000,uidLimit:300})));await new Promise(r=>server.listen(0,'127.0.0.1',r));servers.push(server);const endpoint='http://127.0.0.1:'+server.address().port;
browser=await chromium.launch({executablePath:'/snap/bin/chromium',headless:true,args:['--no-sandbox']});const sa=await open('sa',saOrigin,endpoint,'office-cloud');await sa.page.locator('#sa-field-login').waitFor({state:'hidden'});await link(sa.page);await sa.page.locator('#sa-field-all').click();await sa.page.locator('#sa-field-publish').click();await sa.page.getByText(/3 empleados publicados/).waitFor();console.log('PASS SA publish through actual UI');const expectedOwnerUid=await sa.page.evaluate(()=>firebase.app('sa-field-only').auth().currentUser.uid);
const minis=[];
for(let i=1;i<=3;i++){if(!await sa.page.locator('#sa-field-create').isVisible())await sa.page.getByRole('button',{name:'Crear invitación para Mini',exact:true}).click();else await sa.page.locator('#sa-field-create').click();await sa.page.locator('#sa-field-invite').waitFor({state:'visible'});await sa.page.waitForFunction(()=>!document.getElementById('sa-field-create').disabled);const token=await sa.page.locator('#sa-field-code').inputValue();assert.ok(token);assert.equal(await sa.page.locator('.connections-invitation-qr svg').count(),1);assert.ok(Number(await sa.page.locator('#sa-field-invite').getAttribute('data-expires-at'))>Date.now());const mini=await open('mini',miniOrigin,endpoint,'leader-cloud-'+i);minis.push(mini);await link(mini.page);await mini.page.locator('#firebase-link-code').fill(token);await mini.page.locator('#firebase-link-review').click();await mini.page.locator('#firebase-link-confirm').waitFor({state:'visible'});await mini.page.locator('#firebase-link-confirm').click();await mini.page.locator('[data-link-result]').waitFor({state:'visible'});await clickCloud(mini.page,'cloud-field-refresh');await mini.page.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===1&&!document.getElementById('cloud-field-refresh').disabled);await clickCloud(mini.page,'cloud-field-roster');await mini.page.locator('[data-review-roster]').click();await mini.page.locator('[data-apply-roster]').click();await mini.page.locator('.mini-roster-result').filter({hasText:'Personal actualizado'}).waitFor();assert.equal(await mini.page.evaluate(()=>window.employeeRepository.getAll().length),3);await mini.page.locator('[data-finish-roster]').click();await mini.page.locator('[data-primary-action="send"]').waitFor({state:'visible'});assert.equal(await mini.page.locator('.mini-p2p-shell,.sa-p2p-shell').filter({visible:true}).count(),1);await mini.page.evaluate(()=>miniCloudFieldView.whenIdle());await mini.page.locator('[data-p2p-close]').click();await mini.page.locator('.mini-p2p-overlay').waitFor({state:'hidden'});await mini.page.evaluate(()=>{document.querySelectorAll('.modal.active').forEach(n=>closeModal(n.id));switchView('attendance');});await mini.page.getByRole('button',{name:'Marcar presente a Persona sintética '+i,exact:true}).click();await mini.page.evaluate(()=>openModal('firebase-link-modal'));await clickCloud(mini.page,'cloud-field-send');await mini.page.getByText(/SA recibió la asistencia/).waitFor();console.log('PASS Mini '+i+' invitation, reviewed roster, actual attendance send');}

async function members(page){
 await home(page);await page.locator('[data-connection-detail]').first().click();await page.locator('[data-cloud-action="members"]').filter({visible:true}).first().click();
 await page.locator('#cloud-members-refresh').click();
 await page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
}
const devices=await Promise.all(minis.map(async mini=>await mini.page.evaluate(async()=>{
 const uid=firebase.app('mini-field').auth().currentUser.uid,bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid));
 return 'cloud-'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,20)+'-'+localStorage.getItem('mini-cloud-device-v1');
})));
await members(minis[0].page);assert.equal(await minis[0].page.locator('#cloud-members-target option').count(),1);
assert.equal(await minis[0].page.locator('#cloud-members-send').isEnabled(),false);console.log('PASS sharing disabled by default');
await home(sa.page);await sa.page.getByRole('button',{name:'Actualizar conexiones',exact:true}).click();
await sa.page.waitForFunction(()=>document.querySelectorAll('[data-sharing-action]').length===3&&!document.getElementById('sa-field-publish').disabled);
for(const device of devices){
 const card=sa.page.locator('[data-device-id="'+device+'"]');await home(sa.page);await openDeviceActions(sa.page,await card.getAttribute('data-device-id'));await card.locator('[data-sharing-action]').click();await card.locator('[data-sharing-confirm]').click();
 await card.getByRole('button',{name:'Bloquear intercambio con miembros',exact:true}).waitFor();
 await sa.page.waitForFunction(()=>!document.getElementById('sa-field-publish').disabled);
}
await sa.page.screenshot({path:path.join(logs,'sharing-sa-permissions.png')});
const a=minis[0],b=minis[1],c=minis[2];await members(a.page);
assert.equal(await a.page.locator('#cloud-members-target option').count(),3);
assert.equal(await a.page.locator('.org-member-card').count(),2);await a.page.waitForFunction(()=>document.querySelector('[data-mini-page-title]')?.textContent==='Miembros y asistencia');await miniScreen(a.page,'Miembros y asistencia','members');await a.page.getByRole('button',{name:/Responsable leader-cloud-2/}).waitFor();assert.equal(await a.page.locator('.org-member-list').innerText().then(t=>t.includes('@example.test')),false);await a.page.locator('[data-member-device="'+devices[1]+'"]').click();assert.equal(await a.page.locator('#cloud-members-target').inputValue(),devices[1]);await a.page.screenshot({path:path.join(logs,'authorized-member-cards.png')});console.log('PASS visible Google default names, selecting card does not send');
await home(minis[1].page);await minis[1].page.locator('[data-connection-account-open]').click();await minis[1].page.getByRole('button',{name:/Este dispositivo/}).click();await minis[1].page.locator('#cloud-field-device-name').fill('Mini Norte');await minis[1].page.locator('#cloud-field-device-save').click();await minis[1].page.waitForFunction(()=>!document.getElementById('cloud-field-device-save').disabled);await members(a.page);await a.page.locator('[data-member-device="'+devices[1]+'"]').getByText('Mini Norte',{exact:true}).waitFor();await a.page.locator('[data-member-device="'+devices[1]+'"]').getByText('Responsable leader-cloud-2',{exact:true}).waitFor();
await minis[1].page.locator('#cloud-field-device-name').fill('');await minis[1].page.locator('#cloud-field-device-save').click();await minis[1].page.waitForFunction(()=>!document.getElementById('cloud-field-device-save').disabled);await members(a.page);assert.equal(await a.page.locator('[data-member-device="'+devices[1]+'"] strong').innerText(),'Responsable leader-cloud-2');console.log('PASS explicit device alias and clearing alias restores Google public name');

await a.page.locator('#cloud-members-target').selectOption(devices[1]);
await a.context.route('**/v1/field/share',r=>r.abort());await a.page.locator('#cloud-members-send').click();
await a.page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
assert.equal(await a.page.evaluate(async()=>{return(await MiniCloudField.createIndexedStore('mini-org-share-outbox-v1').list()).length;}),1);
await a.page.reload({waitUntil:'networkidle'});await a.page.evaluate(()=>openP2PTransferModal());await a.context.unroute('**/v1/field/share');
await members(a.page);await a.page.locator('#cloud-members-retry').click();await a.page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
assert.equal(await a.page.evaluate(async()=>{return(await MiniCloudField.createIndexedStore('mini-org-share-outbox-v1').list()).length;}),0);
console.log('PASS chosen member, durable offline share, reload and retry without peer pairing');
await members(c.page);assert.equal(await c.page.locator('[data-share-id]').count(),0);
await members(b.page);assert.equal(await b.page.locator('[data-share-id]').count(),1);
const hours=async page=>await page.evaluate(()=>{
 const employees=employeeRepository.getAll(),date=document.getElementById('cloud-field-date').value;
 return employees.map(e=>({id:e.saEmployeeId,hours:attendanceRepository.getRecord(e.id,date)?.hours||null}));
});
assert.equal((await hours(b.page)).find(r=>r.id==='emp-1').hours,null);
await b.page.locator('[data-share-id]').click();assert.equal(await b.page.locator('#cloud-members-apply').isEnabled(),false);
assert.equal((await hours(b.page)).find(r=>r.id==='emp-2').hours,8);
await b.page.waitForFunction(()=>document.querySelector('[data-mini-page-title]')?.textContent==='Revisar asistencia');assert.equal(await b.page.locator('[data-organization-directory]').isVisible(),false);await miniScreen(b.page,'Revisar asistencia','shared-review');
await b.page.locator('.org-share-row').filter({hasText:'Persona sintética 1'}).getByRole('button',{name:'Aplicar 8 h',exact:true}).click();
await b.context.route('**/v1/field/sharedack',r=>r.abort());await b.page.locator('#cloud-members-apply').click();
await b.page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
assert.equal((await hours(b.page)).find(r=>r.id==='emp-1').hours,8);assert.equal((await hours(b.page)).find(r=>r.id==='emp-2').hours,8);
await b.page.reload({waitUntil:'networkidle'});await b.page.evaluate(()=>openP2PTransferModal());await b.context.unroute('**/v1/field/sharedack');await members(b.page);
await b.page.locator('[data-share-id]').click();await b.page.getByRole('button',{name:'Confirmar revisión guardada',exact:true}).click();
await b.page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
assert.equal(await b.page.locator('[data-share-id]').count(),0);assert.equal((await hours(b.page)).find(r=>r.id==='emp-1').hours,8);
console.log('PASS scoped review, no auto apply, preserve absence, receipt+ack retry after reload');
await a.page.evaluate(()=>{
 const e=employeeRepository.getAll().find(e=>e.saEmployeeId==='emp-1'),date=document.getElementById('cloud-field-date').value;
 attendanceRepository.setRecord(e.id,date,'present',6);
});await members(a.page);await a.page.locator('#cloud-members-target').selectOption(devices[1]);await a.page.locator('#cloud-members-send').click();
await a.page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
await members(b.page);await b.page.locator('[data-share-id]').click();
await b.page.getByText('Recibido: 6 h · Actual: 8 h',{exact:true}).waitFor();
assert.equal(await b.page.locator('#cloud-members-apply').isEnabled(),false);
await b.page.locator('#cloud-members-discard').click();await b.page.waitForFunction(()=>!document.getElementById('cloud-members-refresh').disabled);
assert.equal((await hours(b.page)).find(r=>r.id==='emp-1').hours,8);assert.equal(await b.page.locator('[data-share-id]').count(),0);
console.log('PASS explicit discard retains conflicting current attendance');
// New acceptance: three days with a blank day between, both destinations, partial failure.
const today=await a.page.locator('#cloud-field-date').inputValue();
const shift=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const early=shift(-3),middle=shift(-1),empty=shift(-2),dates=[early,middle,today];
await a.page.evaluate(({early,middle,today})=>{
 const employee=employeeRepository.getAll().find(e=>e.saEmployeeId==='emp-1');
 attendanceRepository.setRecord(employee.id,early,'present',6);
 attendanceRepository.setRecord(employee.id,middle,'present',7);
 attendanceRepository.setRecord(employee.id,today,'present',8);
}, {early,middle,today});
await b.page.evaluate(({middle})=>{const e=employeeRepository.getAll().find(e=>e.saEmployeeId==='emp-1');attendanceRepository.setRecord(e.id,middle,'present',5);},{middle});
async function selectDays(page){
 await page.evaluate(()=>miniCloudFieldView.whenIdle());
 await page.locator('[data-day-mode="multiple"]').click();
 await page.locator('#cloud-field-date-from').fill(early);await page.locator('#cloud-field-date-from').dispatchEvent('change');
 await page.locator('#cloud-field-date-to').fill(today);await page.locator('#cloud-field-date-to').dispatchEvent('change');
 await page.locator('[data-preview-refresh]').click();await page.evaluate(()=>miniCloudFieldView.whenIdle());
 await page.locator('[data-preview-day]').first().waitFor();
 assert.equal(await page.locator('[data-preview-day]').count(),3);
 assert.equal(await page.locator('[data-empty-days]').isVisible(),true);
 assert.equal(await page.locator('[data-attendance-day]').count(),4);
 // Sparse days can be deselected; an unreviewed selection cannot be sent.
 await page.locator('[data-attendance-day="'+empty+'"]').uncheck();
 assert.equal(await page.locator('[data-preview-day]').count(),0);
 await page.locator('[data-preview-refresh]').click();await page.evaluate(()=>miniCloudFieldView.whenIdle());
 assert.equal(await page.locator('[data-preview-day]').count(),3);
 assert.equal(await page.locator('[data-empty-days]').count(),0);
}
await home(a.page);await a.page.locator('[data-primary-action="send"]').click();await a.page.evaluate(()=>miniCloudFieldView.whenIdle());
await selectDays(a.page);await miniScreen(a.page,'Enviar asistencia','multiday-send');
let submitCalls=0;const submitted=[];
await a.context.route('**/v1/field/submit',async route=>{submitted.push(route.request().postDataJSON().submission);submitCalls++;if(submitCalls===2)await route.abort();else await route.continue();});
await a.page.locator('#cloud-field-send').click();await a.page.evaluate(()=>miniCloudFieldView.whenIdle());
const saPending=(await a.page.evaluate(async()=> (await MiniCloudField.createIndexedStore().list()))).sort((a,b)=>a.payload.clientSequence-b.payload.clientSequence);assert.equal(saPending.length,2);assert.equal(submitted.length,2);
await a.page.reload({waitUntil:'networkidle'});await a.page.evaluate(()=>openP2PTransferModal());
await home(a.page);await a.page.locator('[data-primary-action="send"]').click();await a.page.evaluate(()=>miniCloudFieldView.whenIdle());
await a.page.locator('#cloud-field-retry').click();await a.page.evaluate(()=>miniCloudFieldView.whenIdle());
assert.equal(await a.page.evaluate(async()=> (await MiniCloudField.createIndexedStore().list()).length),0);
assert.deepEqual(submitted[2],saPending[0].payload);assert.deepEqual(submitted[3],saPending[1].payload);await a.context.unroute('**/v1/field/submit');
const binding=await a.page.locator('#cloud-field-binding option').first().evaluate(n=>({...n.dataset}));
const saReceived=await sa.page.evaluate(async({endpoint,binding})=>{const token=await firebase.app('sa-field-only').auth().currentUser.getIdToken();const r=await fetch(endpoint+'/v1/field/inbox',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({orgId:binding.orgId,projectId:binding.projectId})});if(!r.ok)throw Error('SA inbox failed');return r.json();},{endpoint,binding});
const submittedIds=new Set(submitted.map(p=>p.submissionId)),batchReceived=saReceived.filter(item=>submittedIds.has(item.submissionId));assert.equal(batchReceived.length,3);assert.deepEqual(batchReceived.map(x=>x.payload.workDate).sort(),dates);assert.equal(new Set(batchReceived.map(x=>x.submissionId)).size,3);
await clickCloud(sa.page,'sa-field-receive');
const saOfficial=await sa.page.evaluate(async()=>{const {default:db}=await import('/js/modules/services/IndexedDBService.js');await db.init();return(await db.getAll('attendance')).length;});assert.equal(saOfficial,0,'SA still requires human review');
console.log('PASS Mini → SA 3 selected days, no empty day, partial failure, reload, exact pending body retry, inbox distinct dates and no automatic apply');await sa.page.locator('.mini-attendance-import').getByRole('button',{name:'Cerrar',exact:true}).first().click();await sa.page.locator('#header-p2p-indicator').click();
// A real IndexedDB failed batch must roll back every row.
assert.deepEqual(await a.page.evaluate(async()=>{const store=MiniCloudField.createIndexedStore('atomic-batch-'+crypto.randomUUID()),row={id:'same',uid:'synthetic',scopeKey:'test',payload:{submissionId:'same'},createdAt:1};let rejected=false;try{await store.putMany([row,row]);}catch{rejected=true;}return{rejected,count:(await store.list()).length};}),{rejected:true,count:0});
await members(a.page);await selectDays(a.page);await a.page.locator('#cloud-members-target').selectOption(devices[1]);
let shareCalls=0;const shared=[];
await a.context.route('**/v1/field/share',async route=>{shared.push(route.request().postDataJSON().submission);shareCalls++;if(shareCalls===2)await route.abort();else await route.continue();});
await a.page.locator('#cloud-members-send').click();await a.page.evaluate(()=>miniCloudFieldView.whenIdle());
const memberPending=(await a.page.evaluate(async()=> (await MiniCloudField.createIndexedStore('mini-org-share-outbox-v1').list()))).sort((a,b)=>a.payload.clientSequence-b.payload.clientSequence);assert.equal(memberPending.length,2);
await a.page.reload({waitUntil:'networkidle'});await a.page.evaluate(()=>openP2PTransferModal());await members(a.page);
await a.page.locator('#cloud-members-retry').click();await a.page.evaluate(()=>miniCloudFieldView.whenIdle());
assert.equal(await a.page.evaluate(async()=> (await MiniCloudField.createIndexedStore('mini-org-share-outbox-v1').list()).length),0);
assert.deepEqual(shared[2],memberPending[0].payload);assert.deepEqual(shared[3],memberPending[1].payload);await a.context.unroute('**/v1/field/share');
await members(c.page);assert.equal(await c.page.locator('[data-share-id]').count(),0,'other recipient receives nothing');
await members(b.page);assert.equal(await b.page.locator('[data-share-id]').count(),3);
async function reviewDays(){
 for(const box of await b.page.locator('[data-received-day]').all())await box.check();
 await b.page.locator('#cloud-members-review-days').click();await b.page.evaluate(()=>miniCloudFieldView.whenIdle());
 assert.equal(await b.page.locator('#cloud-members-apply').isDisabled(),true);
 for(const date of [early,today]){const day=b.page.locator('[data-review-date="'+date+'"]');await day.locator('summary').click();await day.locator('[data-apply-day]').click();}
}
await reviewDays();await miniScreen(b.page,'Revisar asistencia','multiday-receive');
const record=async date=>b.page.evaluate(date=>{const e=employeeRepository.getAll().find(e=>e.saEmployeeId==='emp-1');return attendanceRepository.getRecord(e.id,date);},date);
assert.equal((await record(early)),null);assert.equal((await record(middle)).hours,5);assert.equal((await record(today)).hours,8);
// A local change after review blocks the entire batch before any day is written.
await b.page.evaluate(date=>{const e=employeeRepository.getAll().find(e=>e.saEmployeeId==='emp-1');attendanceRepository.setRecord(e.id,date,'present',4);},early);
await b.page.locator('#cloud-members-apply').click();await b.page.evaluate(()=>miniCloudFieldView.whenIdle());await b.page.getByText(/La asistencia actual cambió/).waitFor();
assert.equal((await record(early)).hours,4);assert.equal((await record(middle)).hours,5);
await b.page.locator('#cloud-members-later').click();await members(b.page);await reviewDays();
let acknowledgements=0;
await b.context.route('**/v1/field/sharedack',async route=>{acknowledgements++;if(acknowledgements===2)await route.abort();else await route.continue();});
await b.page.locator('#cloud-members-apply').click();await b.page.evaluate(()=>miniCloudFieldView.whenIdle());
const saved=await record(early);assert.equal(saved.hours,6);assert.equal((await record(middle)).hours,5,'unselected day keeps 5 hours');
assert.equal((await record(today)).hours,8);assert.equal((await hours(b.page)).find(x=>x.id==='emp-2').hours,8,'unmarked incoming preserves the local mark');
await b.page.reload({waitUntil:'networkidle'});await b.page.evaluate(()=>openP2PTransferModal());await b.context.unroute('**/v1/field/sharedack');await members(b.page);
assert.equal(await b.page.locator('[data-share-id]').count(),2);for(const box of await b.page.locator('[data-received-day]').all())await box.check();
await b.page.locator('#cloud-members-review-days').click();await b.page.getByRole('button',{name:'Confirmar revisión guardada',exact:true}).click();await b.page.evaluate(()=>miniCloudFieldView.whenIdle());
assert.equal(await b.page.locator('[data-share-id]').count(),0);assert.deepEqual(await record(early),saved,'receipt retry never re-applies marks');
assert.equal((await record(middle)).hours,5);console.log('PASS Mini → Mini 3 days, durable partial send, scoped recipient, batch review, local-change rejection, keep unselected/unmarked, receipt/ack retry without duplicate apply');

const bc=sa.page.locator('[data-device-id="'+devices[1]+'"]');await home(sa.page);await openDeviceActions(sa.page,await bc.getAttribute('data-device-id'));await bc.locator('[data-sharing-action]').click();await bc.locator('[data-sharing-confirm]').click();
await bc.getByRole('button',{name:'Permitir intercambio con miembros',exact:true}).waitFor();await sa.page.waitForFunction(()=>!document.getElementById('sa-field-publish').disabled);
await members(a.page);assert.equal(await a.page.locator('#cloud-members-target option').count(),2);assert.equal(await a.page.locator('[data-member-device="'+devices[1]+'"]').count(),0);assert.equal(await a.page.locator('.org-member-card').count(),1);
await a.page.screenshot({path:path.join(logs,'sharing-mini-members.png')});
assert.equal(await a.page.locator('[role="tablist"]').count(),0);
console.log('PASS SA blocks sharing, directory updates, no transport tabs');
for(const p of pages){assert.deepEqual(p.errors,[],p.name);assert.equal(await p.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,p.name);}
console.log('PASS organization sharing real mobile browser circuit');
}catch(e){for(const p of pages){console.log('DEBUG',p.name,await p.page.locator('body').innerText(),p.errors);await p.page.screenshot({path:path.join(logs,p.name+'-sharing-failure.png')});}throw e;}finally{if(browser)await browser.close();for(const server of servers)await new Promise(r=>server.close(r));if(db)await db.terminate();if(app)await admin.deleteApp(app);}})().catch(e=>{console.error(e);process.exitCode=1;});
