// Expanded UI acceptance performs rapid multi-device actions; gateway rate limits have dedicated tests.
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
async function open(type,origin,endpoint,name){const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(({type,config})=>{if(type==='sa')window.SaFieldPreviewConfig=config;else window.MiniFirebaseFieldConfig=config;},{type,config:{firebase:{projectId:'demo-sa-field-access',apiKey:'demo-key',authDomain:'localhost',appId:'demo-app'},endpoint,emulator:'http://127.0.0.1:9299'}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>console.log('NETWORK',name,new URL(r.url()).pathname,r.failure()?.errorText));page.on('response',r=>{if(r.url().includes('/v1/')&&r.status()>=400)console.log('HTTP',name,new URL(r.url()).pathname,r.status());});pages.push({page,errors,name});
if(type==='sa'){await page.goto(origin+'/design.md');await page.evaluate(async()=>{localStorage.setItem('onboardingCompleted','true');localStorage.setItem('asistencia_feature_projects','true');localStorage.setItem('asistencia_default_project_id','PRJ-circuit');localStorage.setItem('asistencia_active_project_id','PRJ-circuit');const {default:db}=await import('/js/modules/services/IndexedDBService.js');await db.init();await db.update('settings',{key:'app',companyName:'Laboratorio Firebase',regularHoursPerDay:8,schemaVersion:3,legacyNavigation:false});await db.update('projects',{id:'PRJ-circuit',name:'Obra sintética',status:'active',schemaVersion:1,createdAt:1,updatedAt:1});await db.update('positions',{id:'pos-main',projectId:'PRJ-circuit',name:'Oficial',active:true,hourlyRate:100});for(let i=1;i<=3;i++)await db.update('employees',{id:'emp-'+i,number:String(i),name:'Persona sintética '+i,projectId:'PRJ-circuit',active:true,positions:['pos-main'],loans:[]});});}
else{await page.goto(origin+'/manifest.json');await page.evaluate(()=>localStorage.setItem('tutorialsSeen',JSON.stringify(['marcar-asistencia','agregar-empleado','liberar-espacio'])));}
await page.goto(origin,{waitUntil:'networkidle'});
if(type==='sa'){await page.waitForFunction(()=>window.App?.state?.employees?.length===3);assert.equal(await page.locator('[data-header-action="open-field-panel"]').count(),0);await page.locator('#header-p2p-indicator').click();await page.waitForFunction(()=>firebase.apps.some(a=>a.name==='sa-field-only'));}
else{await page.waitForFunction(()=>window.employeeRepository);if(await page.locator('#mini-welcome-name').isVisible()){await page.locator('#mini-welcome-name').fill(name);await page.locator('.mini-welcome-submit').click();}await page.evaluate(()=>{document.querySelectorAll('.modal.active').forEach(n=>closeModal(n.id));window.GuidedTour?.stop();switchView('attendance');});await page.locator('#btn-attendance-link').click();}
assert.equal(await page.locator('.mini-p2p-shell,.sa-p2p-shell').filter({visible:true}).count(),1);await page.evaluate(async({type,token})=>{await firebase.app(type==='sa'?'sa-field-only':'mini-field').auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(token));},{type,token:jwt(name)});return {page,context};}

async function audit(page,title,file){
 if(process.env.MINI_RECOVERY_FOCUSED==='1')return;
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
 console.log('PASS simple Mini '+title+(process.env.MINI_RECOVERY_FOCUSED==='1'?'; 360px; theme captures skipped for recovery run':'; five measured themes and 360px'));
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
async function link(page){await home(page);await page.locator('[data-connections-add]').click();if(await page.locator('.mini-p2p-shell').count())await miniScreen(page,'Vincular','route');await page.locator('[data-route-card="internet"] input').check();await page.getByRole('button',{name:'Continuar',exact:true}).click();if(await page.locator('.mini-p2p-shell').count()){await page.locator('[data-invitation-scan]').waitFor({state:'visible',timeout:3000});await miniScreen(page,'Vincular con mi obra','invitation');}}
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
browser=await chromium.launch({executablePath:'/snap/bin/chromium',headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});const sa=await open('sa',saOrigin,endpoint,'office-cloud');await sa.page.locator('#sa-field-login').waitFor({state:'hidden'});await link(sa.page);await sa.page.locator('#sa-field-all').click();await sa.page.locator('[data-personal-search]').fill('Persona sintética 2');assert.equal(await sa.page.locator('#sa-field-employees label:visible').count(),1);assert.equal(await sa.page.locator('#sa-field-employees input:checked').count(),3);await sa.page.locator('[data-personal-search]').fill('');await sa.page.screenshot({path:path.join(logs,'screens-sa-personal.png')});await sa.page.locator('#sa-field-publish').click();await sa.page.getByText(/3 empleados publicados/).waitFor();console.log('PASS SA publish through actual UI');const expectedOwnerUid=await sa.page.evaluate(()=>firebase.app('sa-field-only').auth().currentUser.uid);
const minis=[];
for(let i=1;i<=3;i++){if(!await sa.page.locator('#sa-field-create').isVisible())await sa.page.getByRole('button',{name:'Crear invitación para Mini',exact:true}).click();else await sa.page.locator('#sa-field-create').click();await sa.page.locator('#sa-field-invite').waitFor({state:'visible'});await sa.page.waitForFunction(()=>!document.getElementById('sa-field-create').disabled);const token=await sa.page.locator('#sa-field-code').inputValue();assert.ok(token);await sa.page.screenshot({path:path.join(logs,'member-designs-sa-invitation-'+i+'.png')});const mini=await open('mini',miniOrigin,endpoint,'leader-cloud-'+i);minis.push(mini);await mini.page.evaluate(()=>miniCloudFieldView.whenIdle());if(i===1){assert.equal(await mini.page.locator('.mini-connection-feedback').evaluate(n=>n.open),false);await audit(mini.page,'Conexiones vacías','home-empty');}await link(mini.page);if(i===1){
 await mini.page.evaluate(()=>{window.BarcodeDetector=undefined;});
 await mini.page.locator('[data-invitation-scan]').click();
 await mini.page.locator('[data-qr-status]').filter({hasText:'La cámara no está disponible'}).waitFor();
 await miniScreen(mini.page,'Escanear QR de SA','qr-unsupported');
 await mini.page.locator('[data-manual-fallback]').click();
 await mini.page.locator('[data-invitation-scan]').waitFor({state:'visible'});
 await mini.page.evaluate(()=>{window.__originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code'];}async detect(){return [];}};navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
 await mini.page.locator('[data-invitation-scan]').click();
 await mini.page.locator('[data-qr-status]').filter({hasText:'No se concedió acceso'}).waitFor();
 await miniScreen(mini.page,'Escanear QR de SA','qr-denied');
 await mini.page.locator('[data-manual-fallback]').click();
 await mini.context.grantPermissions(['camera'],{origin:miniOrigin});
 await mini.page.evaluate(token=>{navigator.mediaDevices.getUserMedia=async options=>{const stream=await window.__originalGetUserMedia(options);window.__qrTracks=stream.getTracks();return stream;};window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code'];}async detect(){return [{rawValue:'sa-mini-invite/v1:'+token}];}};},token);
 await mini.page.locator('[data-invitation-scan]').click();
 await mini.page.waitForFunction(token=>document.getElementById('firebase-link-code')?.value===token,token);
 assert.equal(await mini.page.locator('#firebase-link-confirm').isVisible(),false);
 assert.equal(await mini.page.locator('#cloud-field-binding option').count(),0);
 assert.equal(await mini.page.evaluate(()=>window.__qrTracks?.every(t=>t.readyState==='ended')),true);
 await mini.page.locator('#firebase-link-code').fill('incorrecto');await mini.page.locator('#firebase-link-review').click();
 await mini.page.locator('#firebase-link-error').filter({hasText:'código completo'}).waitFor();
 assert.equal(await mini.page.locator('#firebase-link-error').isVisible(),true);
 await audit(mini.page,'Error de código visible','invitation-error');
 console.log('PASS QR camera unsupported/denied/manual fallback and synthetic camera detection, camera tracks stopped; no redemption');
}await mini.page.locator('#firebase-link-code').fill(token);await mini.page.locator('#firebase-link-review').click();await mini.page.locator('#firebase-link-confirm').waitFor({state:'visible'});await miniScreen(mini.page,'Confirmar vínculo','confirm-'+i);await mini.page.locator('#firebase-link-confirm').click();await mini.page.locator('[data-link-result]').waitFor({state:'visible'});await mini.page.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===1&&!document.getElementById('cloud-field-refresh').disabled);await miniScreen(mini.page,'Mini vinculado','linked-'+i);assert.equal(await mini.page.locator('#firebase-link-details').isVisible(),false);await mini.page.locator('[data-linked-roster]').click();await mini.page.locator('[data-review-roster]').click();await miniScreen(mini.page,'Actualizar personal','personal-'+i);await mini.page.locator('[data-apply-roster]').click();await mini.page.locator('.mini-roster-result').filter({hasText:'Personal actualizado'}).waitFor();assert.equal(await mini.page.evaluate(()=>window.employeeRepository.getAll().length),3);await miniScreen(mini.page,'Personal actualizado','result-'+i);await mini.page.locator('[data-finish-roster]').click();await mini.page.locator('[data-primary-action="send"]').waitFor({state:'visible'});assert.equal(await mini.page.locator('.mini-p2p-shell,.sa-p2p-shell').filter({visible:true}).count(),1);await mini.page.evaluate(()=>miniCloudFieldView.whenIdle());await mini.page.locator('[data-p2p-close]').click();await mini.page.locator('.mini-p2p-overlay').waitFor({state:'hidden'});await mini.page.evaluate(()=>{document.querySelectorAll('.modal.active').forEach(n=>closeModal(n.id));switchView('attendance');});await mini.page.getByRole('button',{name:'Marcar presente a Persona sintética '+i,exact:true}).click();await mini.page.evaluate(()=>openModal('firebase-link-modal'));await home(mini.page);await mini.page.locator('[data-connection-detail]').first().click();await miniScreen(mini.page,'Detalle del vínculo','detail-'+i);assert.ok((await mini.page.locator('[data-connection-step="details"]').innerText()).includes('Obra sintética'));await home(mini.page);await mini.page.locator('[data-connection-account-open]').click();await miniScreen(mini.page,'Mi cuenta','account-'+i);assert.ok((await mini.page.locator('[data-account-summary]').innerText()).includes('leader-cloud-'+i+'@example.test'));await home(mini.page);await mini.page.locator('[data-primary-action="send"]').click();await mini.page.evaluate(()=>miniCloudFieldView.whenIdle());const preview=await mini.page.evaluate(()=>JSON.parse(document.getElementById('cloud-field-updates').dataset.preview));assert.equal(preview.present,1);assert.equal(preview.unmarked,2);assert.equal(preview.rows.length,3);assert.equal(await mini.page.evaluate(async()=> (await MiniCloudField.createIndexedStore().list()).length),0);await miniScreen(mini.page,'Enviar asistencia','send-'+i);await clickCloud(mini.page,'cloud-field-send');await mini.page.getByText(/SA recibió la asistencia/).waitFor();console.log('PASS Mini '+i+' invitation, reviewed roster, actual attendance send');}
await clickCloud(sa.page,'sa-field-receive');const read=store=>sa.page.evaluate(async name=>{const {default:db}=await import('/js/modules/services/IndexedDBService.js');return await db.getAll(name);},store);assert.equal((await read('attendanceSubmissionInbox')).length,3);assert.equal((await read('attendance')).length,0);console.log('PASS 3 received durable, no automatic application');
await sa.page.locator('[data-mini-action="toggle-select-all"]').click();await sa.page.locator('[data-mini-action="consolidate-drafts"]').click();await sa.page.getByRole('button',{name:/Mini Firebase · .*: 8h/}).first().waitFor({state:'visible'});const choices=await sa.page.getByRole('button',{name:/Mini Firebase · .*: 8h/}).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));assert.equal(choices.length,3);for(const name of choices)await sa.page.getByRole('button',{name,exact:true}).click();await sa.page.locator('[data-mini-action="complete-mini-day"]').click();await sa.page.locator('[data-mini-action="create-mini-consolidated"]').click();await sa.page.locator('[data-mini-action="accept-automatic"]').click();await sa.page.locator('[data-mini-action="apply"]').click();await sa.page.waitForFunction(async()=>{const {default:db}=await import('/js/modules/services/IndexedDBService.js');return(await db.getAll('attendance')).length===3;});assert.ok((await read('attendance')).every(r=>r.hoursWorked===8));console.log('PASS SA human review and apply actual 3-Mini attendance');await sa.page.locator('.mini-attendance-import').getByRole('button',{name:'Cerrar',exact:true}).first().click();
const mini=minis[0],expectedUid=await mini.page.evaluate(()=>firebase.app('mini-field').auth().currentUser.uid);await mini.context.route('**/v1/field/submit',r=>r.abort());await clickCloud(mini.page,'cloud-field-send');await mini.page.waitForFunction(()=>!document.getElementById('cloud-field-send').disabled);assert.equal(await mini.page.evaluate(async()=>{return (await MiniCloudField.createIndexedStore().list()).length;}),1);await mini.page.reload({waitUntil:'networkidle'});assert.equal(await mini.page.evaluate(async()=>{return (await MiniCloudField.createIndexedStore().list()).length;}),1);await mini.context.unroute('**/v1/field/submit');await mini.page.evaluate(()=>openModal('firebase-link-modal'));await mini.page.waitForFunction(uid=>firebase.app('mini-field').auth().currentUser?.uid===uid,expectedUid);await mini.page.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===1);assert.equal(await mini.page.locator('#firebase-link-login').isVisible(),false);assert.equal(await mini.page.locator('#firebase-link-code').isVisible(),false);console.log('PASS restored SDK session and existing grant after reload; no second login or invitation');await clickCloud(mini.page,'cloud-field-retry');await mini.page.getByText(/0 envío\(s\) pendiente/).waitFor();assert.equal(await mini.page.evaluate(async()=>{return(await MiniCloudField.createIndexedStore().list()).length;}),0);console.log('PASS failed send persists through reload and retries');
await clickCloud(mini.page,'cloud-field-send');await mini.page.getByText(/SA recibió la asistencia/).waitFor();console.log('PASS new send after reload without repeating roster import');
await clickCloud(mini.page,'firebase-link-add');assert.equal(await mini.page.locator('#firebase-link-code').isVisible(),true);await mini.page.locator('#firebase-link-code').fill('A'.repeat(43));await clickCloud(mini.page,'firebase-link-cancel');await mini.page.evaluate(()=>openModal('firebase-link-modal'));assert.equal(await mini.page.locator('#firebase-link-code').isVisible(),false);assert.equal(await mini.page.locator('#firebase-link-code').inputValue(),'');console.log('PASS optional new invitation and cancel preserve existing link');
const restored=await browser.newContext({storageState:await mini.context.storageState({indexedDB:true}),viewport:{width:390,height:844},serviceWorkers:'block'});await restored.addInitScript(config=>window.MiniFirebaseFieldConfig=config,{firebase:{projectId:'demo-sa-field-access',apiKey:'demo-key',authDomain:'localhost',appId:'demo-app'},endpoint,emulator:'http://127.0.0.1:9299'});const restoredPage=await restored.newPage();
restoredPage.on('requestfailed',request=>{const url=new URL(request.url());console.log('RECOVERY_REQUEST_FAILED',JSON.stringify({host:url.host,path:url.pathname,navigation:request.isNavigationRequest(),error:/^net::[A-Z_]+$/.test(request.failure()?.errorText||'')?request.failure().errorText:'OTHER'}));});
restoredPage.on('framenavigated',frame=>{if(frame===restoredPage.mainFrame()){const url=new URL(frame.url());console.log('RECOVERY_NAVIGATED',JSON.stringify({host:url.host,path:url.pathname}));}});
restoredPage.on('pageerror',error=>console.log('RECOVERY_PAGE_ERROR',error.name));
await restoredPage.addInitScript(()=>window.addEventListener('popstate',()=>console.info('RECOVERY_POPSTATE',JSON.stringify({guarded:history.state?.miniBackGuard===true}))));
restoredPage.on('console',message=>{if(message.text().startsWith('RECOVERY_POPSTATE '))console.log(message.text());});
async function recoveryReloadState(stage){console.log('RECOVERY_RELOAD_STATE',JSON.stringify(await restoredPage.evaluate(stage=>({stage,ready:document.readyState,overlayVisible:!!document.querySelector('.mini-p2p-overlay'),workerControlled:!!navigator.serviceWorker?.controller,backGuarded:history.state?.miniBackGuard===true,employeeCount:employeeRepository.getAll().length}),stage)));}
await restoredPage.goto(miniOrigin,{waitUntil:'networkidle'});await restoredPage.waitForFunction(uid=>firebase.app('mini-field').auth().currentUser?.uid===uid,expectedUid);await restoredPage.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===1);await restoredPage.evaluate(()=>openModal('firebase-link-modal'));assert.equal(await restoredPage.locator('#firebase-link-code').isVisible(),false);await restoredPage.evaluate(()=>miniCloudFieldView.whenIdle());await home(restoredPage);await openAccount(restoredPage);await restoredPage.locator('[data-account-summary]').waitFor();
// Reset/recovery regression on an isolated copy of the signed-in Mini.
const acceptedMarkers=await restoredPage.evaluate(()=>localStorage.getItem('sa_roster_version_guard_v1'));
for(const legacy of [false,true]){
 await restoredPage.evaluate(()=>miniCloudFieldView.whenIdle());
 await restoredPage.locator('[data-p2p-close]').click();
 await restoredPage.locator('.mini-p2p-overlay').waitFor({state:'hidden'});
 await restoredPage.evaluate(()=>document.querySelectorAll('.modal.active').forEach(n=>closeModal(n.id)));
 await restoredPage.locator('#nav-more').focus();
 await restoredPage.locator('#nav-more').press('Enter');
 await restoredPage.locator('#btn-more-tab-data').click();
 await restoredPage.locator('[onclick="clearAllData()"]').click();
 await restoredPage.locator('#confirm-ok').click();
 await restoredPage.waitForFunction(()=>employeeRepository.getAll().length===0);
 assert.equal(await restoredPage.evaluate(()=>localStorage.getItem('sa_roster_version_guard_v1')),null);
 if(legacy)await restoredPage.evaluate(markers=>localStorage.setItem('sa_roster_version_guard_v1',markers),acceptedMarkers);
 await restoredPage.reload({waitUntil:'domcontentloaded'});
 await restoredPage.waitForFunction(uid=>firebase.app('mini-field').auth().currentUser?.uid===uid,expectedUid);
 await restoredPage.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===1);
 assert.equal(await restoredPage.evaluate(()=>employeeRepository.getAll().length),0);
 await restoredPage.evaluate(()=>openModal('firebase-link-modal'));
 await clickCloud(restoredPage,'cloud-field-roster');
 await restoredPage.locator('[data-review-roster]').click();
 if(legacy)await restoredPage.getByText('Recuperar personal',{exact:true}).waitFor();
 assert.equal(await restoredPage.locator('[data-apply-roster]').isEnabled(),true);
 assert.equal(await restoredPage.evaluate(()=>employeeRepository.getAll().length),0,'review never auto applies');
 await restoredPage.locator('[data-apply-roster]').click();
 await restoredPage.locator('.mini-roster-result').filter({hasText:'Personal actualizado'}).waitFor();
 assert.equal(await restoredPage.evaluate(()=>employeeRepository.getAll().length),3);
 await restoredPage.locator('[data-finish-roster]').click();
 await restoredPage.locator('[data-connections-home]').waitFor({state:'visible'});
 await restoredPage.evaluate(()=>miniCloudFieldView.whenIdle());
 await clickCloud(restoredPage,'cloud-field-roster');
 await restoredPage.locator('[data-review-roster]').click();
 assert.equal(await restoredPage.locator('[data-apply-roster]').isDisabled(),true,'normal duplicate guard retained');
 await restoredPage.locator('[data-roster-later]').click();
 await restoredPage.locator('[data-connections-home]').waitFor({state:'visible'});
 await restoredPage.evaluate(()=>miniCloudFieldView.whenIdle());
 await restoredPage.locator('[data-p2p-close]').click();
 await restoredPage.locator('.mini-p2p-overlay').waitFor({state:'hidden'});
 await recoveryReloadState(legacy?'legacy-restored':'current-restored');
 // Closing the root layer consumes its history guard asynchronously.
 await restoredPage.waitForFunction(()=>history.state?.miniBackGuard!==true);
 await recoveryReloadState(legacy?'legacy-ready-to-reload':'current-ready-to-reload');
 await restoredPage.reload({waitUntil:'domcontentloaded'});
 await restoredPage.waitForFunction(()=>employeeRepository.getAll().length===3);
 assert.equal(await restoredPage.evaluate(()=>new Set(employeeRepository.getAll().map(e=>e.id)).size),3);
 await restoredPage.evaluate(()=>openModal('firebase-link-modal'));
 await home(restoredPage);await openAccount(restoredPage);
 console.log('PASS '+(legacy?'legacy stale receipt':'current reset')+' cloud personnel recovery after reset/reload, explicit review, no duplicates');
}
await restoredPage.locator('#firebase-link-logout').click();await restoredPage.locator('#firebase-link-login').waitFor({state:'visible'});await restoredPage.reload({waitUntil:'domcontentloaded'});await restoredPage.waitForFunction(()=>!firebase.app('mini-field').auth().currentUser&&document.getElementById('firebase-link-login').hidden===false);assert.equal(await restoredPage.evaluate(()=>window.employeeRepository.getAll().length),3);await restored.close();console.log('PASS persisted browser storage restores session; explicit logout remains logged out after reload and retains personnel');

await sa.page.reload({waitUntil:'networkidle'});assert.equal((await read('attendance')).length,3);assert.equal((await read('attendanceSubmissionInbox')).length,3);await sa.page.evaluate(()=>openFieldPanel());await sa.page.waitForFunction(uid=>firebase.app('sa-field-only').auth().currentUser?.uid===uid,expectedOwnerUid);assert.equal(await sa.page.locator('#sa-field-login').isVisible(),false);assert.equal(await sa.page.evaluate(()=>firebase.apps.some(a=>a.name==='[DEFAULT]')?firebase.app().auth().currentUser:null),null);const previousInbox=await read('attendanceSubmissionInbox'),previousAttendance=await read('attendance');const receiveScope=await sa.page.evaluate(()=>JSON.parse(sessionStorage.getItem('sa-field-context-v1')));const submissions=db.collection('fieldOrganizations').doc(receiveScope.orgId).collection('projects').doc('PRJ-circuit').collection('submissions');const expectedReceipts=(await submissions.get()).docs.filter(doc=>doc.data().status==='received');assert.ok(expectedReceipts.length>0);await clickCloud(sa.page,'sa-field-receive');for(const receipt of expectedReceipts){assert.equal((await receipt.ref.get()).data().status,'acknowledged');assert.equal(await sa.page.evaluate(async payload=>{const {default:store}=await import('/js/modules/services/IndexedDBService.js');const {attendanceSubmissionSemanticHash}=await import('/js/modules/features/attendance/AttendanceSubmissionVersioning.js');return (await store.getAll('attendanceSubmissionInbox')).some(record=>record.saProjectId===payload.saProjectId&&record.sourceSnapshot.deviceId===payload.deviceId&&record.sourceSnapshot.workDate===payload.workDate&&attendanceSubmissionSemanticHash(record.sourceSnapshot)===attendanceSubmissionSemanticHash(payload));},receipt.data().payload),true);}assert.deepEqual(await read('attendanceSubmissionInbox'),previousInbox);assert.deepEqual(await read('attendance'),previousAttendance);console.log('PASS specific repeated submissions acknowledged, durable semantic dedup and no automatic attendance mutation');await sa.page.locator('.mini-attendance-import').getByRole('button',{name:'Cerrar',exact:true}).first().click();await sa.page.locator('#header-p2p-indicator').click();console.log('PASS SA restores field Google session after reload, can receive without login/republish and keeps default autosync signed out');
await clickCloud(sa.page,'sa-field-devices-refresh');await sa.page.waitForFunction(()=>document.querySelectorAll('.sa-field-device').length===3);
const deviceId=await mini.page.evaluate(()=>{const uid=firebase.app('mini-field').auth().currentUser.uid;return crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid)).then(bytes=>'cloud-'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,20)+'-'+localStorage.getItem('mini-cloud-device-v1'));});
const card=sa.page.locator('[data-device-id="'+deviceId+'"]');
assert.ok((await sa.page.locator('[data-connection-account-id]').filter({has:card}).textContent()).includes('leader-cloud-1@example.test'));
const sameOwnerMini=await open('mini',miniOrigin,endpoint,'leader-cloud-1');pages[pages.length-1].name='same-account-second-mini';await sameOwnerMini.page.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===1);assert.notEqual(await sameOwnerMini.page.evaluate(()=>localStorage.getItem('mini-cloud-device-v1')),await mini.page.evaluate(()=>localStorage.getItem('mini-cloud-device-v1')));
await openDeviceActions(sa.page,await card.getAttribute('data-device-id'));await sa.page.locator('[data-connection-step="details"] [data-device-id="'+deviceId+'"]').waitFor();await sa.page.screenshot({path:path.join(logs,'screens-sa-detail.png')});await home(sa.page);await openAccount(sa.page);assert.ok((await sa.page.locator('[data-account-summary]').filter({visible:true}).innerText()).includes('office-cloud@example.test'));await sa.page.screenshot({path:path.join(logs,'screens-sa-account.png')});await home(sa.page);if(!await card.locator('[data-device-action]').isVisible())await openDeviceActions(sa.page,await card.getAttribute('data-device-id'));await card.locator('[data-device-action]').click();await card.locator('[data-device-cancel]').click();assert.equal(await card.locator('[data-device-confirmation]').isVisible(),false);
if(!await card.locator('[data-device-action]').isVisible())await openDeviceActions(sa.page,await card.getAttribute('data-device-id'));await card.locator('[data-device-action]').click();await card.locator('[data-device-confirm]').click();await card.getByText('Acceso revocado',{exact:true}).waitFor();
await home(mini.page);await mini.page.locator('[data-primary-action=send]').click();await mini.page.evaluate(()=>miniCloudFieldView.whenIdle());await mini.page.getByText(/Este Mini ya no tiene acceso/).waitFor();assert.equal(await mini.page.locator('#cloud-field-send').isEnabled(),false);assert.equal(await mini.page.evaluate(()=>window.employeeRepository.getAll().length),3);
await mini.page.reload({waitUntil:'networkidle'});await mini.page.evaluate(()=>openModal('firebase-link-modal'));await mini.page.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===0);assert.equal(await mini.page.evaluate(()=>window.employeeRepository.getAll().length),3);
await clickCloud(sameOwnerMini.page,'cloud-field-roster');await sameOwnerMini.page.locator('[data-review-roster]').click();await sameOwnerMini.page.locator('[data-apply-roster]').click();await sameOwnerMini.page.locator('.mini-roster-result').filter({hasText:'Personal actualizado'}).waitFor();console.log('PASS another installation using the SAME Google account still receives and applies personnel after first device revocation');
console.log('PASS SA revoke/cancel, revoked roster+send blocked, reload cannot revive and local data retained');
if(!await card.locator('[data-device-action]').isVisible())await openDeviceActions(sa.page,await card.getAttribute('data-device-id'));await card.locator('[data-device-action]').click();await card.locator('[data-device-confirm]').click();await card.getByText('Autorizado',{exact:true}).waitFor();await clickCloud(mini.page,'cloud-field-refresh');await mini.page.waitForFunction(()=>document.querySelectorAll('#cloud-field-binding option').length===1);
await home(mini.page);await mini.page.locator('[data-connection-account-open]').click();await mini.page.getByRole('button',{name:/^Este dispositivo/}).click();await miniScreen(mini.page,'Nombre de este Mini','alias');await mini.page.locator('#cloud-field-device-name').fill('Mini de campo uno');await mini.page.locator('#cloud-field-device-save').click();await mini.page.waitForFunction(()=>!document.getElementById('cloud-field-device-save').disabled);await clickCloud(sa.page,'sa-field-devices-refresh');await openDeviceActions(sa.page,deviceId);await card.getByText('Mini de campo uno',{exact:true}).waitFor({state:'visible'});
const leaving=minis[1],leavingDeviceId=await leaving.page.evaluate(async()=>{const uid=firebase.app('mini-field').auth().currentUser.uid;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid));return 'cloud-'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,20)+'-'+localStorage.getItem('mini-cloud-device-v1');});await clickCloud(leaving.page,'cloud-field-leave');await leaving.page.locator('#cloud-field-leave-cancel').click();assert.equal(await leaving.page.locator('#cloud-field-leave-review').isVisible(),false);await clickCloud(leaving.page,'cloud-field-leave');await leaving.page.locator('#cloud-field-leave-confirm').click();await leaving.page.getByText(/Este Mini salió de la obra/).waitFor();assert.equal(await leaving.page.evaluate(()=>window.employeeRepository.getAll().length),3);await leaving.page.reload({waitUntil:'networkidle'});await leaving.page.waitForFunction(()=>firebase.app('mini-field').auth().currentUser!==null&&document.querySelectorAll('#cloud-field-binding option').length===0);
await clickCloud(sa.page,'sa-field-devices-refresh');await openDeviceActions(sa.page,leavingDeviceId);await sa.page.locator('[data-device-id="'+leavingDeviceId+'"]').getByText('Salió de la obra',{exact:true}).waitFor({state:'visible'});await clickCloud(minis[2].page,'cloud-field-send');await minis[2].page.getByText(/SA recibió la asistencia/).waitFor();assert.ok((await read('attendance')).every(r=>r.hoursWorked===8));assert.ok((await read('attendanceSubmissionInbox')).length>=3);console.log('PASS explicit restore, name edit, Mini leave/cancel persists after reload, other Mini keeps access and SA history retained');
await home(sa.page);await home(minis[2].page);for(const [label,view] of [['sa',sa.page],['mini',minis[2].page]]){assert.equal(await view.locator('[role="tablist"]').count(),0);assert.ok(await view.locator('[data-connections-list] [data-connection-card]').count()>0);await view.screenshot({path:path.join(logs,'one-ui-'+label+'-overview.png')});}console.log('PASS one overview, one link list, no transport tabs in both apps');
await openAccount(sa.page);await sa.page.locator('#sa-field-logout').click();await sa.page.locator('#sa-field-login').waitFor({state:'visible'});await sa.page.reload({waitUntil:'networkidle'});await sa.page.evaluate(()=>openFieldPanel());await openAccount(sa.page);await sa.page.locator('#sa-field-login').waitFor({state:'visible'});await sa.page.waitForFunction(()=>firebase.app('sa-field-only').auth().currentUser===null);assert.equal((await read('attendance')).length,3);console.log('PASS SA explicit logout remains signed out after reload and attendance retained');for(const p of pages){assert.deepEqual(p.errors,[],p.name);assert.equal(await p.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,p.name);await p.page.screenshot({path:path.join(logs,p.name+'.png')});}console.log('PASS SA + 3 Mini Firebase emulator browser circuit, durable queue, human review, reload, mobile width');
}catch(e){for(const p of pages){console.log('DEBUG',p.name,await p.page.locator('body').innerText(),p.errors);await p.page.screenshot({path:path.join(logs,p.name+'-failure.png')});}throw e;}finally{if(browser)await browser.close();for(const server of servers)await new Promise(r=>server.close(r));if(db)await db.terminate();if(app)await admin.deleteApp(app);}})().catch(e=>{console.error(e);process.exitCode=1;});
