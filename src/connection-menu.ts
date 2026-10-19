declare const MiniConnectionPresentation:{icon(d:Document,kind:string):SVGElement;mountPeers(o:MiniConnectionPeerViewOptions):{refresh():void;dispose():void};mount(o:MiniPresentationOptions):{refresh():void;dispose():void}};
type ConnectionMenuMethod='direct'|'internet';
interface ConnectionMenuOptions {
 getMiniPeers?():MiniConnectionPeerSnapshot[];subscribeMiniPeers?(callback:()=>void):()=>void;closeMiniPeer?(peerId:string):void;connectMiniPeer?(peerId:string):Promise<void>;
 app?:'mini'|'sa';shell:HTMLElement;directBody:HTMLElement;internetAvailable:boolean;
 getInternet():HTMLElement;beforeLeaveInternet():boolean;canChange():boolean;
 notify(message:string):void;close():void;scanInvitation?():void;refreshInternet?():void|Promise<void>;prepareSend?():Promise<void>;prepareMembers?():Promise<void>;
}
(function exposeConnectionMenu(root:any,factory:()=>unknown){const api=factory();if(typeof module==='object'&&module&&module.exports)module.exports=api;if(root)root.ConnectionMenu=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function createModeState(options:{internetAvailable:boolean;canChange():boolean}){
  let mode:ConnectionMenuMethod='direct';
  return {current:()=>mode,select:(next:unknown)=>{
   if(next!=='direct'&&next!=='internet')throw new Error('Medio de conexión no válido.');
   if(next===mode)return true;
   if(next==='internet'&&!options.internetAvailable||!options.canChange())return false;
   mode=next;return true;
  }};
 }
 function createPeerActions(options:{connect(peerId:string):Promise<void>;close(peerId:string):void}){
  const active=new Map<string,Promise<void>>();let disposed=false;
  return {
   connect(peerId:string):Promise<void>{
    if(disposed)return Promise.reject(new Error('Menú cerrado.'));
    const previous=active.get(peerId);if(previous)return previous;
    const promise=options.connect(peerId);active.set(peerId,promise);
    void promise.then(()=>{if(active.get(peerId)===promise)active.delete(peerId);},()=>{if(active.get(peerId)===promise)active.delete(peerId);});return promise;
   },
   close(peerId:string){if(disposed)return;active.delete(peerId);options.close(peerId);},
   pending:(peerId:string)=>active.has(peerId),dispose(){disposed=true;active.clear();}
  };
 }
 function safeAccountPhoto(value:unknown):string{
  if(typeof value!=='string'||!value||value.length>2048)return '';
  try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com'))&&!u.username&&!u.password?u.href:'';}catch{return '';}
 }
 function mount(options:ConnectionMenuOptions){
  const {shell,directBody}=options,d=shell.ownerDocument;d.body.classList.add('connections-open');
  const app=options.app||(shell.classList.contains('sa-p2p-shell')?'sa':'mini');
  const trigger=d.activeElement as HTMLElement|null;
  const origins:Array<{node:HTMLElement;parent:HTMLElement;next:ChildNode|null}>=[];
  const observers:MutationObserver[]=[];const cleanupCallbacks:Array<()=>void>=[];
  let internet:HTMLElement|null=null,released=false,currentTask='',detailIndex=0,detailDevice='',detailAccount='',detailAccountUnavailable=false;
  let detailOwner:HTMLElement|null=null,detailSlot:HTMLElement|null=null;
  let detailScope:Record<string,string>|null=null;let presentation:{refresh():void;dispose():void}|null=null;
  function node(tag:string,className=''){const n=d.createElement(tag);n.className=className;return n;}
  function button(text:string,action:()=>void){const n=d.createElement('button');n.type='button';n.textContent=text;n.onclick=action;return n;}
  function move(n:HTMLElement|null,target:HTMLElement){
   if(!n||n.parentElement===target)return;
   if(!origins.some(row=>row.node===n)&&n.parentElement)origins.push({node:n,parent:n.parentElement,next:n.nextSibling});
   target.append(n);
  }
  function el(id:string){return d.getElementById(id);}
  const home=node('div',directBody.className+' connections-home');home.dataset.connectionsHome='';
  const account=node('section','connections-account');account.dataset.connectionsAccount='';
  const accountTitle=node('strong');accountTitle.textContent='Cuenta Google';account.append(accountTitle);
  const accountPhoto=node('img','connections-account-photo') as HTMLImageElement;accountPhoto.alt='';accountPhoto.setAttribute('aria-hidden','true');accountPhoto.hidden=true;accountPhoto.referrerPolicy='no-referrer';accountPhoto.onerror=()=>{accountPhoto.hidden=true;accountTitle.hidden=false;};account.prepend(accountPhoto);
  const feedback=node('div','connections-feedback');feedback.setAttribute('aria-live','polite');
  const toolbar=node('div','connections-toolbar');
  const priorities=node('section','connections-priorities');priorities.dataset.connectionsActions='';
  const pending=node('div','connections-pending'),primaryActions=node('div','connections-primary-actions');priorities.append(pending,primaryActions);
  const list=node('div','connections-list');list.dataset.connectionsList='';
  const directList=node('div','connections-source-list'),cloudList=node('div','connections-source-list');
  list.append(directList,cloudList);
  const heading=node('h3');heading.textContent=app==='sa'?'Vínculos':'Obra asociada';
  const empty=node('section','connections-empty');const emptyTitle=node('strong'),emptyHint=node('p');emptyTitle.textContent=app==='sa'?'Todavía no hay vínculos':'Asocia tu obra cuando lo necesites';emptyHint.textContent=app==='sa'?'Usa Vincular Mini para compartir personal y recibir asistencia.':'Recibe personal y comparte asistencia con una obra.';empty.append(icon('building'),emptyTitle,emptyHint);
  const extras=node('div','connections-extras');
  const taskHost=node('div',directBody.className+' connections-task');taskHost.dataset.connectionsTask='';taskHost.hidden=true;
  const taskTitle=node('h3');taskTitle.className='connections-screen-title';const taskBack=button('Volver a compartir',()=>{show();});
  taskBack.dataset.connectionsBack='';
  const taskContent=node('div','connections-task-content');taskHost.append(taskBack,taskTitle,taskContent);
  const store=node('div');store.hidden=true;store.dataset.connectionsStore='';
  const add=button(app==='mini'?'Asociar a una obra':'Vincular',()=>{task('link');});add.dataset.connectionsAdd='';
  if(app==='mini'){
   const device=button('Vincular dispositivo',()=>{
    if(!guard())return;
    const backup=extras.querySelector<HTMLButtonElement>('[data-open-backup-hub-btn]')||directBody.querySelector<HTMLButtonElement>('[data-open-backup-hub-btn]');
    if(!backup){options.notify('No se pudo abrir la asociación de dispositivos. Vuelve a abrir Compartir.');return;}
    showDirect();backup.click();
   });
   device.dataset.connectionsDevice='';device.prepend(icon('phone'));toolbar.prepend(device);toolbar.classList.add('connections-device-toolbar');
  }
  const refresh=button('Actualizar conexiones',()=>{if(!guard())return;void refreshCloud();});
  toolbar.append(add,refresh);if(app==='mini'){refresh.prepend(icon('refresh'));add.prepend(icon('link'));refresh.dataset.connectionsRefresh='';}home.append(priorities,toolbar,heading,list,empty,extras,account);
  shell.insertBefore(home,directBody);shell.insertBefore(feedback,directBody);shell.insertBefore(taskHost,directBody);shell.append(store);
  const header=shell.querySelector('header');if(header)move(account,header);
  if(app==='mini'&&options.getMiniPeers&&options.subscribeMiniPeers&&options.connectMiniPeer&&options.closeMiniPeer&&typeof MiniConnectionPresentation!=='undefined'){
   const peerSection=node('section','connections-mini-peers'),peerHeading=node('h3'),peerList=node('div');peerHeading.textContent='Dispositivos vinculados';peerSection.append(peerHeading,peerList);home.insertBefore(peerSection,heading);
   const actions=createPeerActions({connect:options.connectMiniPeer,close:options.closeMiniPeer});
   const peers=MiniConnectionPresentation.mountPeers({container:peerList,getPeers:options.getMiniPeers,subscribe:options.subscribeMiniPeers,connect:id=>actions.connect(id),close:id=>actions.close(id),notify:options.notify});
   cleanupCallbacks.push(()=>{peers.dispose();actions.dispose();});
  }
  const parts=new Map<string,HTMLElement>();
  const detailPart=node('section','connections-form connections-detail');detailPart.dataset.connectionStep='details';parts.set('details',detailPart);store.append(detailPart);
  const accountOpen=button('Mi cuenta',()=>{task('account');});accountOpen.dataset.connectionAccountOpen='';account.append(accountOpen);
  function section(name:string,ids:string[]){
   const part=node('section','connections-form');part.dataset.connectionStep=name;parts.set(name,part);store.append(part);
   for(const id of ids){const n=el(id);if(!(n instanceof HTMLElement))continue;const label=d.querySelector<HTMLElement>('label[for="'+id+'"]');if(label)move(label,part);move(n.parentElement?.tagName==='LABEL'?n.parentElement:n,part);}
   return part;
  }
  function guard(){
   if(!options.canChange()||!options.beforeLeaveInternet()){
    options.notify('Finaliza o cancela la operación actual antes de continuar.');return false;
   }
   return true;
  }
  async function refreshCloud(){
   try{await options.refreshInternet?.();if(!released)renderCloud();}
   catch(e){options.notify(e instanceof Error?e.message:'No se pudieron actualizar las conexiones.');}
  }
  function updateEmpty(){empty.hidden=!!list.querySelector('[data-connection-card]');}
  function decorate(n:HTMLElement,method:string){
   n.dataset.connectionCard='';n.dataset.connectionTransport=method;n.classList.add('connections-card');
   if(!n.querySelector('.connections-route')){const badge=node('span','connections-route');badge.textContent=method==='internet'?'Por internet':'Directa';n.prepend(badge);}
  }
  function bindCloudAction(label:string,action:string,index:number){
   const option=(el('cloud-field-binding') as HTMLSelectElement|null)?.options[index];
   const bound=option?.dataset.orgId?{orgId:option.dataset.orgId,projectId:option.dataset.projectId,groupId:option.dataset.groupId}:null;
   const b=button(label,()=>{
    if(!guard())return;
    if(b.dataset.primaryAction==='send'){const date=el('cloud-field-date') as HTMLInputElement|null;if(date)date.value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
    const select=el('cloud-field-binding') as HTMLSelectElement|null;
    if(select){const actual=bound?[...select.options].findIndex(o=>o.dataset.orgId===bound.orgId&&o.dataset.projectId===bound.projectId&&o.dataset.groupId===bound.groupId):index;if(actual<0){options.notify('Este vínculo ya no está autorizado. Actualiza las conexiones.');return;}select.value=String(actual);select.dispatchEvent(new Event('change',{bubbles:true}));}
    if(action==='roster'||action==='receive'){(el(app==='mini'?'cloud-field-roster':'sa-field-receive') as HTMLButtonElement|null)?.click();return;}
    if(task(action)&&action==='leave')(el('cloud-field-leave') as HTMLButtonElement|null)?.click();
   });
   if(app==='mini')b.prepend(icon(action==='send'?'send':action==='roster'?'people':action==='members'?'share':action==='leave'?'unlink':'document'));b.dataset.cloudAction=action;return b;
  }
  function renderCloud(){
   if(app==='sa'){
    const devices=el('sa-field-devices');if(devices)move(devices,cloudList);
    const accounts=[...(devices?.querySelectorAll<HTMLElement>('[data-connection-account-id]')||[])];
    for(const card of accounts){
     decorate(card,'internet');
     if(!card.querySelector('.connections-row-icon')){const symbol=icon('people');symbol.classList.add('connections-row-icon');card.prepend(symbol);}
     if(!card.querySelector('[data-connection-detail]')){const detail=button('Ver dispositivos',()=>{if(!guard())return;detailAccount=card.dataset.connectionAccountId||'';detailAccountUnavailable=false;detailDevice='';task('details');});detail.dataset.connectionDetail='';detail.setAttribute('aria-label','Ver dispositivos de '+(card.querySelector('h3')?.textContent||'esta cuenta'));card.append(detail);}
    }
    devices?.querySelectorAll<HTMLElement>('[data-device-id]').forEach(card=>{
     // Account devices keep their native controls in details, never overview rows.
     if(card.closest('[data-connection-account-id]'))return;
     decorate(card,'internet');
     if(!card.querySelector('.connections-row-icon')){const symbol=icon('phone');symbol.classList.add('connections-row-icon');card.prepend(symbol);}
     const access=card.querySelector<HTMLButtonElement>('[data-device-action]');if(access)access.textContent=access.textContent?.includes('Revocar')||access.textContent==='Desvincular'?'Desvincular':'Restaurar vínculo';
     if(!card.querySelector('[data-connection-detail]')){const detail=button('Ver vínculo',()=>{if(!guard())return;detailDevice=card.dataset.deviceId||'';detailAccount='';detailAccountUnavailable=false;task('details');});detail.dataset.connectionDetail='';card.append(detail);}
     if(!card.querySelector('[data-cloud-action]')){
      const actions=node('div','connections-card-actions');
      actions.append(bindCloudAction('Compartir personal','personal',0),bindCloudAction('Recibir asistencia de la obra','receive',0));card.append(actions);
     }
    });
    if(devices)for(const p of [...devices.children])if(!p.hasAttribute('data-device-id')&&!p.hasAttribute('data-connection-account-id'))(p as HTMLElement).hidden=accounts.length>0||!!devices.querySelector('[data-device-id]');
   }else{
    const select=el('cloud-field-binding') as HTMLSelectElement|null;
    cloudList.replaceChildren();
    [...(select?.options||[])].forEach((option,index)=>{
     const card=node('article','connections-card');decorate(card,'internet');
     const title=node('strong');title.textContent=option.textContent;
     const authorization=node('p');authorization.textContent='Obra y grupo autorizados para este dispositivo';
     const actions=node('div','connections-card-actions');
     actions.append(bindCloudAction('Recibir personal','roster',index),bindCloudAction('Enviar asistencia','send',index),bindCloudAction('Miembros y asistencia','members',index),bindCloudAction('Desvincular','leave',index));
     const detail=button('Administrar vínculo',()=>{detailIndex=index;detailScope={orgId:option.dataset.orgId||'',projectId:option.dataset.projectId||'',groupId:option.dataset.groupId||''};task('details');});detail.dataset.connectionDetail='';
     const symbol=icon('building');symbol.classList.add('connections-row-icon');card.append(symbol,title,authorization,detail,actions);cloudList.append(card);
    });
   }
   updateEmpty();renderHeader();renderPriorities();renderInvitation();if(currentTask==='details')renderDetails();if(currentTask==='account')renderAccount();
  }

  function accountAvailable(){
   const login=el('firebase-link-login'),logout=el('firebase-link-logout');
   return options.internetAvailable&&Boolean(login&&!login.hidden||logout&&!logout.hidden);
  }
  function renderHeader(){
   const status=el(app==='mini'?'firebase-link-status':'sa-field-status'),email=status?.dataset.accountEmail||'';
   accountOpen.textContent=email||app==='mini'&&!accountAvailable()?'Mi cuenta':'Iniciar sesión';accountOpen.title=email?'Mi cuenta · '+email:'Mi cuenta';accountOpen.setAttribute('aria-label','Mi cuenta');
   accountTitle.textContent=email?(status?.dataset.accountName||email).trim().slice(0,1).toUpperCase():'G';
   const photo=email?safeAccountPhoto(status?.dataset.accountPhoto):'';if(accountPhoto.getAttribute('src')!==photo){accountPhoto.hidden=true;accountTitle.hidden=false;if(photo)accountPhoto.src=photo;else accountPhoto.removeAttribute('src');}
   if(photo&&accountPhoto.complete&&accountPhoto.naturalWidth>0){accountPhoto.hidden=false;accountTitle.hidden=true;}
   accountPhoto.onload=()=>{if(!released&&email&&safeAccountPhoto(status?.dataset.accountPhoto)===accountPhoto.src){accountPhoto.hidden=false;accountTitle.hidden=true;}};
  }
  function icon(kind:string){if(app==='mini'&&typeof MiniConnectionPresentation!=='undefined')return MiniConnectionPresentation.icon(d,kind);const svg=d.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('connections-line-icon');const path=d.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='phone'?'M7 2h10v20H7zM10 18h4':kind==='building'?'M3 22V2h12v20M15 10h6v12M6 6h2M10 6h2M6 10h2M10 10h2M6 14h2M10 14h2M18 14h1M18 18h1M6 22v-4h6v4':kind==='link'?'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2':kind==='people'?'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8':'M14 2H6v20h14V8l-6-6M14 2v6h6M9 13h8M9 17h8');svg.append(path);return svg;}
  function currentEvents():ConnectionNoticeEvent[]{
   try{const raw=el(app==='mini'?'cloud-field-updates':'sa-field-updates')?.dataset.events;return raw?JSON.parse(raw) as ConnectionNoticeEvent[]:[];}catch{return [];}
  }
  function renderPriorities(){
   pending.replaceChildren();primaryActions.replaceChildren();
   const events=currentEvents(),local=app==='sa'?Number(el('sa-field-updates')?.dataset.localPending||0):0,pendingTitle=node('h3');pendingTitle.textContent='Por revisar';pendingTitle.className='connections-pending-heading';pending.append(pendingTitle);priorities.dataset.app=app;if(app==='mini')priorities.append(primaryActions,pending);
   if(!events.length&&!local){const text=node('p','connections-clear');text.textContent=app==='sa'?'No hay envíos por revisar':'No hay cambios por revisar';pending.append(text);}
   for(const event of events){
    const card=node('article','connections-action-card');card.dataset.noticeKind=event.kind;
    const title=node('strong');title.textContent=event.title;
    const description=node('p');description.textContent=event.description;
    const count=node('span','connections-count');count.textContent=String(event.count);count.setAttribute('aria-label',event.count+' pendiente(s)');
    const review=button(event.kind==='roster'?'Revisar personal':'Revisar asistencia',()=>{if(guard())d.dispatchEvent(new CustomEvent('connection-open-notice',{detail:{app,event}}));});
    review.dataset.noticeReview='';card.prepend(icon(event.kind==='roster'?'people':'document'));card.append(count,title,description,review);
    if(event.deferred){const later=node('small');later.textContent='Guardado para después';card.append(later);}
    pending.append(card);
   }
   if(local>0){
    const card=node('article','connections-action-card'),title=node('strong'),description=node('p');
    title.textContent='Asistencia recibida';description.textContent=local+' envío(s) guardados aquí para revisar.';
    const review=button('Revisar asistencia recibida',()=>{if(guard())d.dispatchEvent(new CustomEvent('connection-open-local-inbox'));});review.dataset.primaryAction='local-review';
    card.prepend(icon('document'));card.append(title,description,review);pending.append(card);
   }
   if(app==='mini'){
    const select=el('cloud-field-binding') as HTMLSelectElement|null,index=Number(select?.value||0);
    if(select?.options.length){
     const card=node('article','connections-action-card connections-daily');
     const title=node('h3');title.textContent='Compartir asistencia';
     const description=node('p');description.textContent=select.options[index]?.textContent||'Selecciona una obra';
     const send=bindCloudAction('Preparar envío','send',index);send.dataset.primaryAction='send';
     send.textContent='Enviar asistencia';
     card.append(icon('send'),title,description,send);primaryActions.append(card);const personnel=node('article','connections-action-card connections-personal-action'),personnelTitle=node('h3'),personnelHint=node('p');personnelTitle.textContent='Personal de mi obra';personnelHint.textContent=select.options[index]?.textContent||'';const update=bindCloudAction('Actualizar personal','roster',index);update.dataset.primaryAction='roster';personnel.append(icon('people'),personnelTitle,personnelHint,update);primaryActions.append(personnel);const peers=node('article','connections-action-card connections-members-action'),peerTitle=node('h3'),peerHint=node('p'),share=bindCloudAction('Compartir con otro equipo','members',index);share.dataset.primaryAction='members';peerTitle.textContent='Equipo de mi obra';peerHint.textContent='Compartir o revisar asistencia de varios días';peers.append(icon('share'),peerTitle,peerHint,share);primaryActions.append(peers);
    }
   }else{
    const card=node('article','connections-action-card');
    const title=node('h3');title.textContent='Compartir personal';
    const description=node('p');description.textContent=((el('sa-field-project-name') as HTMLInputElement|null)?.value||'Obra activa')+' · Personal oficial para tus Minis.';
    const publish=button('Preparar personal',()=>{task('personal');});publish.dataset.primaryAction='personal';
    card.append(icon('people'),title,description,publish);
    const link=node('article','connections-action-card connections-link-tile'),linkTitle=node('h3'),linkHint=node('p');linkTitle.textContent='Vincular Mini';linkHint.textContent='Conectar un nuevo Mini';add.textContent='Vincular Mini';link.append(icon('link'),linkTitle,linkHint,add);
    primaryActions.append(card,link);
   }
  }
  function contextCard(title:string,description:string){const card=node('section','connections-context');const heading=node('strong'),text=node('p');heading.textContent=title;text.textContent=description;card.append(heading,text);return card;}
  function identityCard(){
   const status=el('firebase-link-status'),email=status?.dataset.accountEmail||'',name=status?.dataset.accountName||email||'Cuenta Google';const card=contextCard(name,email||'Inicia sesión para gestionar tus vínculos');card.classList.add('mini-connection-identity');const avatar=node('span','connections-avatar');avatar.textContent=name.trim().slice(0,1).toUpperCase()||'G';avatar.setAttribute('aria-hidden','true');card.prepend(avatar);return card;
  }
  function decorateActionRow(row:HTMLButtonElement,title:string,hint:string,kind:string){
   const copy=node('span'),label=node('strong'),description=node('small');label.textContent=title;description.textContent=hint;copy.append(label,description);row.replaceChildren(copy);row.classList.add('mini-connection-action-row');if(typeof MiniConnectionPresentation!=='undefined'){row.prepend(MiniConnectionPresentation.icon(d,kind));row.append(MiniConnectionPresentation.icon(d,'chevron'));}
  }
  function restoreSaDetails(){
   const devices=el('sa-field-devices');
   const accountDevices=detailPart.querySelector<HTMLElement>('[data-account-devices]');
   if(accountDevices){
    accountDevices.hidden=true;
    if(detailOwner&&devices?.contains(detailOwner))detailOwner.append(accountDevices);else accountDevices.remove();
   }
   const card=detailPart.querySelector<HTMLElement>('[data-device-id]');
   if(card){if(detailSlot&&devices?.contains(detailSlot))detailSlot.replaceWith(card);else card.remove();}
   detailOwner=null;detailSlot=null;
  }
  function renderDetails(){
   if(app==='sa'){
    const devices=el('sa-field-devices');
    if(detailAccountUnavailable){detailPart.replaceChildren(contextCard('Cuenta no disponible','Esta cuenta ya no está en la lista. Actualiza las conexiones.'));return;}
    if(detailAccount){
     const owner=[...(devices?.querySelectorAll<HTMLElement>('[data-connection-account-id]')||[])].find(card=>card.dataset.connectionAccountId===detailAccount);
     if(owner===detailOwner&&detailPart.querySelector('[data-account-devices]'))return;
     restoreSaDetails();detailPart.replaceChildren();
     const contents=owner?.querySelector<HTMLElement>('[data-account-devices]');
     if(owner&&contents){detailOwner=owner;contents.hidden=false;detailPart.append(contents);taskTitle.textContent=owner.querySelector('h3')?.textContent||'Dispositivos de la cuenta';}
     else{detailAccount='';detailAccountUnavailable=true;taskTitle.textContent='Cuenta no disponible';detailPart.append(contextCard('Cuenta no disponible','Esta cuenta ya no está en la lista. Actualiza las conexiones.'));}
     return;
    }
    const replacement=[...(devices?.querySelectorAll<HTMLElement>('[data-device-id]')||[])].find(card=>card.dataset.deviceId===detailDevice);
    if(detailSlot&&devices?.contains(detailSlot)&&!replacement)return;
    restoreSaDetails();detailPart.replaceChildren();
    if(replacement){detailSlot=node('span');detailSlot.hidden=true;replacement.before(detailSlot);detailPart.append(replacement);taskTitle.textContent=replacement.querySelector('h3')?.textContent||'Detalle del vínculo';}
    else{detailPart.append(contextCard('Vínculo no disponible','Actualiza las conexiones para consultar este Mini.'));}
    return;
   }
   detailPart.replaceChildren();
   const select=el('cloud-field-binding') as HTMLSelectElement|null;
   const index=detailScope?.orgId?[...(select?.options||[])].findIndex(o=>o.dataset.orgId===detailScope?.orgId&&o.dataset.projectId===detailScope?.projectId&&o.dataset.groupId===detailScope?.groupId):detailIndex;
   const option=select?.options[index];if(!option){detailPart.append(contextCard('Vínculo no disponible','Actualiza las conexiones.'));return;}
   taskTitle.textContent='Detalle del vínculo';const identity=identityCard(),scope=contextCard(option.textContent||'Obra','Obra y grupo autorizados');scope.classList.add('mini-connection-scope');if(typeof MiniConnectionPresentation!=='undefined')scope.prepend(MiniConnectionPresentation.icon(d,'building'));const badge=node('span','mini-connection-status');badge.textContent='Autorizado';scope.append(badge);identity.append(scope,contextCard('Por internet','Ruta de conexión'));detailPart.append(identity);
   const actions=node('div','connections-detail-actions');actions.append(bindCloudAction('Recibir personal','roster',index),bindCloudAction('Enviar asistencia','send',index),bindCloudAction('Miembros y asistencia','members',index),bindCloudAction('Desvincular de esta obra','leave',index));detailPart.append(actions);const rename=button('Nombre del dispositivo',()=>{task('settings');});decorateActionRow(rename,'Nombre de este Mini',(el('cloud-field-device-name') as HTMLInputElement|null)?.dataset.resolvedName||'Mini','tag');detailPart.append(rename);
   const hint=node('p','connections-hint');hint.textContent='Desvincular conserva el personal y la asistencia guardados en este dispositivo.';detailPart.append(hint);
  }
  function renderAccount(){
   const previous=taskContent.querySelector<HTMLElement>('[data-account-summary]');
   const summary=previous||node('section','connections-account-summary');summary.dataset.accountSummary='';
   const status=el(app==='mini'?'firebase-link-status':'sa-field-status'),email=status?.dataset.accountEmail||'',name=status?.dataset.accountName||email||'Cuenta Google';
   const identity=summary.querySelector<HTMLElement>('.connections-context')||contextCard(name,email||'Inicia sesión para gestionar tus vínculos');
   const avatar=identity.querySelector<HTMLElement>('.connections-avatar')||node('span','connections-avatar');
   avatar.textContent=email?(name.trim()[0]||'G').toUpperCase():'G';avatar.setAttribute('aria-hidden','true');
   if(avatar.parentElement!==identity)identity.prepend(avatar);
   const photo=email?safeAccountPhoto(status?.dataset.accountPhoto):'';
   const photoNode=identity.querySelector<HTMLImageElement>('.connections-profile-photo')||d.createElement('img');
   photoNode.className='connections-profile-photo';photoNode.alt='';photoNode.setAttribute('aria-hidden','true');photoNode.referrerPolicy='no-referrer';
   if(photoNode.parentElement!==identity)avatar.after(photoNode);
   photoNode.onload=()=>{if(!released&&photo&&photoNode.getAttribute('src')===photo){photoNode.hidden=false;avatar.hidden=true;}};
   photoNode.onerror=()=>{photoNode.hidden=true;avatar.hidden=false;};
   if(photoNode.getAttribute('src')!==photo){
    photoNode.hidden=true;avatar.hidden=false;
    if(photo)photoNode.src=photo;else photoNode.removeAttribute('src');
   }
   if(!photo){photoNode.hidden=true;avatar.hidden=false;}
   const title=identity.querySelector('strong')!,description=identity.querySelector('p')!;
   title.textContent=name;description.textContent=email||'Inicia sesión para gestionar tus vínculos';
   if(app==='mini'){
    const login=el('firebase-link-login') as HTMLButtonElement|null,logout=el('firebase-link-logout') as HTMLButtonElement|null;
    const available=accountAvailable();
    const connected=available&&!!email;
    identity.classList.add('mini-connection-identity','mini-account-card');
    identity.dataset.accountState=available?(connected?'connected':'signed-out'):'unavailable';
    title.textContent=connected?name:'Conecta tu cuenta Google';
    description.textContent=connected?email:available?'Inicia sesión para gestionar tus obras.':'El acceso con Google no está habilitado en esta versión.';
    description.id='mini-account-description';
    const state=identity.querySelector<HTMLElement>('.mini-account-status')||node('span','mini-account-status');state.textContent=connected?'Conectada':available?'Sin iniciar sesión':'No disponible';
    if(state.parentElement!==identity)identity.append(state);
    const unavailable=identity.querySelector<HTMLButtonElement>('[data-account-unavailable]');
    if(unavailable)unavailable.hidden=available;
    if(available){
     if(account.parentElement!==identity)identity.append(account);
     for(const control of [login,logout])if(control){control.classList.add('mini-account-action');control.setAttribute('aria-describedby',description.id);}
    }else{
     if(account.parentElement!==store)store.append(account);
     if(!unavailable){
      const disabled=button('Iniciar sesión con Google',()=>{});disabled.disabled=true;disabled.dataset.accountUnavailable='';disabled.classList.add('mini-account-action');disabled.setAttribute('aria-describedby',description.id);
      const logo=d.createElement('img');logo.src='./vendor/google-g.png';logo.width=20;logo.height=20;logo.alt='';disabled.prepend(logo);identity.append(disabled);
     }
    }
   }else if(account.parentElement!==summary)summary.append(account);
   if(identity.parentElement!==summary)summary.prepend(identity);
   if(!previous){
    if(app==='mini'){
     const linked=button('Mis obras vinculadas',()=>{show();}),device=button('Este dispositivo',()=>{task('settings');});
     linked.dataset.accountWorks='';device.dataset.accountDevice='';decorateActionRow(device,'Este dispositivo','','phone');decorateActionRow(linked,'Mis obras vinculadas','','building');summary.append(device,linked);
    }
    const backup=extras.querySelector<HTMLButtonElement>('[data-open-backup-hub-btn]');if(backup)summary.append(button('Respaldos y transferencia directa',()=>{backup.click();}));
    const pendingButton=button('',()=>{show();});pendingButton.dataset.accountPending='';summary.append(pendingButton);
    const hint=node('p','connections-hint');hint.textContent='Cerrar sesión conserva los datos guardados en este dispositivo.';summary.append(hint);taskContent.prepend(summary);
   }
   const works=summary.querySelector('[data-account-works] small'),device=summary.querySelector('[data-account-device] small');
   const select=el('cloud-field-binding') as HTMLSelectElement|null;
   if(works)works.textContent=new Set([...(select?.options||[])].map(o=>o.dataset.orgId+'|'+o.dataset.projectId)).size+' obra(s) autorizada(s)';
   if(device)device.textContent=(el('cloud-field-device-name') as HTMLInputElement|null)?.dataset.resolvedName||'Mini';
   const pendingButton=summary.querySelector('[data-account-pending]');if(pendingButton)pendingButton.textContent='Pendientes por revisar · '+currentEvents().reduce((total,event)=>total+event.count,0);
  }
  function renderInvitation(){
   if(app!=='mini')return;
   const part=parts.get('link'),status=el('firebase-link-status');if(!part||!status)return;
   const phase=status.dataset.linkPhase||'ready';part.dataset.linkPhase=phase;
   const intro=part.querySelector<HTMLElement>('[data-invitation-intro]');if(intro)intro.hidden=phase==='preview'||phase==='linked';
   const old=part.querySelector('[data-link-result]');old?.remove();
   const cancel=part.querySelector<HTMLElement>('[data-invitation-cancel]');if(cancel)cancel.hidden=phase==='linked';
   const add=el('firebase-link-add');if(add)add.hidden=true;
   if(phase!=='linked')return;
   const result=node('section','mini-connection-linked');result.dataset.linkResult='';
   if(typeof MiniConnectionPresentation!=='undefined')result.append(MiniConnectionPresentation.icon(d,'check'));
   const title=node('strong'),hint=node('p');title.textContent='Conectado con '+(status.dataset.projectName||'tu obra');hint.textContent='Actualiza el personal para comenzar a pasar asistencia.';result.append(title,hint);
   let groups:string[]=[];try{groups=JSON.parse(status.dataset.groupIds||'[]') as string[];}catch{groups=[];}
   const select=el('cloud-field-binding') as HTMLSelectElement|null,choices=[...(select?.options||[])].map((option,index)=>({option,index})).filter(({option})=>option.dataset.orgId===status.dataset.orgId&&option.dataset.projectId===status.dataset.projectId&&groups.includes(option.dataset.groupId||''));
   if(choices.length){for(const {option,index} of choices){const update=bindCloudAction(choices.length>1?'Actualizar personal · '+(option.dataset.groupName||option.textContent):'Actualizar personal','roster',index);update.dataset.linkedRoster='';result.append(update);}}else result.append(contextCard('Preparando tu obra','Espera un momento mientras se carga el personal disponible.'));
   result.append(button('Volver a compartir',()=>{show();}));part.append(result);
  }
  function renderSendPreview(){
   const part=parts.get(currentTask);if(!part||!['send','members'].includes(currentTask))return;
   for(const screen of parts.values())screen.querySelector('[data-send-preview]')?.remove();
   const preview=node('section','connections-send-preview');preview.dataset.sendPreview='';
   const select=el('cloud-field-binding') as HTMLSelectElement|null,option=select?.selectedOptions[0];
   preview.append(contextCard(option?.textContent||'Obra y grupo',currentTask==='members'?'El otro Mini revisará los días antes de aplicarlos.':'SA revisará los días antes de incorporarlos.'));
   try{
    const raw=el('cloud-field-updates')?.dataset.preview;
    const data=raw?JSON.parse(raw) as {dates:string[];orgId:string;projectId:string;groupId:string;days:Array<{workDate:string;present:number;unmarked:number;overtimeHours:number;rows:Array<{number:string;name:string;label:string}>}>;emptyDates:string[];present:number;unmarked:number;overtimeHours:number}:null;
    if(data&&data.orgId===option?.dataset.orgId&&data.projectId===option?.dataset.projectId&&data.groupId===option?.dataset.groupId){
     const metrics=node('div','connections-metrics');for(const [value,label] of data.dates.length>1?[[data.days.length,'días con asistencia'],[data.present,'marcas presentes'],[data.overtimeHours,'h extras']]:[[data.present,'presentes'],[data.unmarked,'sin marca'],[data.overtimeHours,'h extras']])metrics.append(contextCard(String(value),String(label)));preview.append(metrics);
     for(const day of data.days){
      const details=d.createElement('details');details.className='connections-preview-day';details.open=data.days.length===1;details.dataset.previewDay=day.workDate;
      const title=d.createElement('summary');title.textContent=MiniAttendanceDays.formatDate(day.workDate)+' · '+day.present+' presentes';title.prepend(icon('calendar'));title.append(icon('chevron'));details.append(title);
      const rows=node('div','connections-preview-rows');for(const row of day.rows)rows.append(contextCard(row.number+' · '+row.name,row.label));details.append(rows);preview.append(details);
     }
     if(data.emptyDates.length){const empty=contextCard(data.emptyDates.length+' día(s) sin asistencia','Estos días no se enviarán: '+data.emptyDates.map(MiniAttendanceDays.formatDate).join(', '));empty.dataset.emptyDays='';preview.append(empty);}
     if(!data.days.length)preview.append(contextCard('No hay asistencia para enviar','Elige otros días o registra la asistencia.'));
     const send=el('cloud-field-send');if(send){const text=data.days.length>1?'Enviar '+data.days.length+' días a SA':'Enviar a SA';send.replaceChildren(icon('send'),d.createTextNode(text));}
    }else preview.append(contextCard('Revisa los días que vas a compartir','Comprueba las personas y las horas antes de enviar.'));
   }catch{preview.append(contextCard('Vista previa no disponible','Revisa los días seleccionados.'));}
   const refresh=button('Revisar días seleccionados',()=>{void options.prepareSend?.();});refresh.prepend(icon('calendar'));refresh.dataset.previewRefresh='';preview.append(refresh);const dates=el('cloud-field-dates');if(dates?.parentElement===part)dates.after(preview);else part.prepend(preview);
  }
  function sendPreviewChanged(){renderSendPreview();}
  d.addEventListener('connection-send-preview',sendPreviewChanged);
  function enhancePersonal(part:HTMLElement){
   const list=el('sa-field-employees');if(!list)return;
   const bar=node('div','connections-personal-toolbar'),count=node('strong'),search=d.createElement('input');search.type='search';search.placeholder='Buscar por número o nombre';search.setAttribute('aria-label','Buscar personal');search.dataset.personalSearch='';bar.append(count);const all=el('sa-field-all');if(all)bar.append(all);list.before(bar,search);
   function update(){const rows=[...list!.querySelectorAll<HTMLLabelElement>('label')],selected=rows.filter(row=>row.querySelector<HTMLInputElement>('input')?.checked).length;count.textContent=selected+' seleccionados';for(const row of rows)row.hidden=!(row.textContent||'').toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());const publish=el('sa-field-publish');if(publish)publish.textContent=selected?'Compartir '+selected+' empleados':'Compartir personal seleccionado';}
   search.addEventListener('input',update);list.addEventListener('change',update);el('sa-field-all')?.addEventListener('click',()=>queueMicrotask(update));
   const observer=new MutationObserver(update);observer.observe(list,{childList:true});observers.push(observer);update();
   const hint=node('p','connections-hint');hint.textContent='Se comparte personal, sin sueldos ni préstamos.';part.append(hint);
  }
  function activate(name:string,scope:Record<string,string>){
   if(!guard())return false;
   if(app==='mini'){
    const select=el('cloud-field-binding') as HTMLSelectElement|null;
    const index=[...(select?.options||[])].findIndex(o=>o.dataset.orgId===scope.orgId&&o.dataset.projectId===scope.projectId&&o.dataset.groupId===scope.groupId);
    if(!select||index<0){options.notify('Esta obra o grupo ya no está autorizado. Actualiza las conexiones.');return false;}
    select.value=String(index);select.dispatchEvent(new Event('change',{bubbles:true}));
   }
   return name==='roster'?true:task(name);
  }
  function updates(event:Event){const detail=(event as CustomEvent<{app:string}>).detail;if(detail?.app===app&&!released)renderPriorities();}
  d.addEventListener('connection-updates',updates);
  function initializeInternet(){
   if(internet||!options.internetAvailable)return;
   try{
    internet=options.getInternet();move(internet,store);internet.hidden=false;
    const prefix=app==='sa'?'sa-field-':'firebase-link-';
    for(const id of ['login','logout'])move(el(prefix+id),account);
    const login=el(prefix+'login');if(login){login.classList.add('connection-google-button');const mark=d.createElement('img');mark.src=app==='mini'?'./vendor/google-g.png':'js/vendor/google-g.png';mark.width=20;mark.height=20;mark.alt='';mark.setAttribute('aria-hidden','true');const label=node('span');label.textContent='Iniciar sesión con Google';login.replaceChildren(mark,label);let lastHidden=login.hidden;const watcher=new MutationObserver(()=>{if(login.hidden===lastHidden)return;lastHidden=login.hidden;void refreshCloud();});watcher.observe(login,{attributes:true,attributeFilter:['hidden']});observers.push(watcher);}
    move(el(prefix+'status'),feedback);
    const profileStatus=el(prefix+'status');
    if(profileStatus){
     let profileSnapshot=JSON.stringify([profileStatus.dataset.accountEmail||'',profileStatus.dataset.accountName||'',profileStatus.dataset.accountPhoto||'']);
     const profileWatcher=new MutationObserver(()=>{
      const next=JSON.stringify([profileStatus.dataset.accountEmail||'',profileStatus.dataset.accountName||'',profileStatus.dataset.accountPhoto||'']);
      if(released||next===profileSnapshot)return;
      profileSnapshot=next;
      presentation?.refresh();
      renderHeader();
      if(currentTask==='account')renderAccount();
     });
     profileWatcher.observe(profileStatus,{attributes:true,attributeFilter:['data-account-email','data-account-name','data-account-photo']});
     observers.push(profileWatcher);
    }
    if(app==='mini'){
     move(el('firebase-link-error'),feedback);move(el('cloud-field-status'),feedback);
     const linkPart=section('link',['firebase-link-code','firebase-link-review','firebase-link-details','firebase-link-confirm','firebase-link-add']);const intro=contextCard('Escanea la invitación de SA','Abre el QR en SA y apunta la cámara.');intro.dataset.invitationIntro='';intro.classList.add('mini-invitation-intro');if(typeof MiniConnectionPresentation!=='undefined')intro.prepend(MiniConnectionPresentation.icon(d,'qr'));const scan=button('Escanear QR de SA',()=>{if(!guard())return;showDirect();options.scanInvitation?.();});scan.dataset.invitationScan='';intro.append(scan);linkPart.prepend(intro);const input=el('firebase-link-code');if(input){const label=d.createElement('label');label.htmlFor='firebase-link-code';label.textContent='O pega el código de invitación';label.className='mini-invitation-code-label';input.before(label);input.setAttribute('placeholder','Pega aquí el código que te envió SA');}const review=el('firebase-link-review');if(review)review.textContent='Revisar código';const linkWatcher=new MutationObserver(()=>{renderInvitation();presentation?.refresh();});const status=el('firebase-link-status');if(status){linkWatcher.observe(status,{attributes:true,attributeFilter:['data-link-phase','data-link-busy']});observers.push(linkWatcher);}const error=el('firebase-link-error');if(error)move(error,linkPart);if(typeof MiniConnectionPresentation!=='undefined')el('firebase-link-details')?.querySelectorAll<HTMLElement>('.connections-capabilities>div').forEach((card,i)=>{if(!card.querySelector('svg'))card.prepend(MiniConnectionPresentation.icon(d,i?'document':'people'));});const confirmIdentity=identityCard();confirmIdentity.classList.add('mini-connection-confirm-account');el('firebase-link-confirm')?.before(confirmIdentity);const cancelInvitation=button('Cancelar',()=>{show();});cancelInvitation.dataset.invitationCancel='';linkPart.append(cancelInvitation);renderInvitation();
     const sendPart=section('send',['cloud-field-dates','cloud-field-send','cloud-field-retry']);const retry=el('cloud-field-retry');if(retry)retry.textContent='Reintentar envíos';const footer=node('footer','mini-connection-footer');const send=el('cloud-field-send');if(send){send.textContent='Enviar a SA';footer.append(send);}footer.append(button('Volver',()=>{show();}));sendPart.append(footer);
     const leavePart=section('leave',['cloud-field-leave','cloud-field-leave-review']);if(typeof MiniConnectionPresentation!=='undefined'){const leaveReview=el('cloud-field-leave-review');if(leaveReview&&!leaveReview.querySelector('.mini-connection-icon'))leaveReview.prepend(MiniConnectionPresentation.icon(d,'unlink'));}const leaveCancel=el('cloud-field-leave-cancel'),cancelLeave=()=>{task('details');};leaveCancel?.addEventListener('click',cancelLeave);cleanupCallbacks.push(()=>leaveCancel?.removeEventListener('click',cancelLeave));const confirmLeave=el('cloud-field-leave-confirm');if(confirmLeave)confirmLeave.textContent='Desvincular';
     const settings=section('settings',['cloud-field-device-name','cloud-field-device-save']);const aliasHint=node('p','connections-hint');aliasHint.textContent='Deja el nombre vacío para usar el de tu cuenta Google.';settings.append(aliasHint);
     section('members',['cloud-field-members']);

     const select=el('cloud-field-binding');if(select){const watcher=new MutationObserver(renderCloud);watcher.observe(select,{childList:true});observers.push(watcher);}
    }else{
     const controls=el('sa-field-controls');
     const personal=section('personal',['sa-field-project-name','sa-field-group-name','sa-field-refresh','sa-field-all','sa-field-employees','sa-field-publish']);enhancePersonal(personal);
     const invitePart=section('invite',['sa-field-create','sa-field-invite']);
     invitePart.prepend(contextCard('Invitar un Mini','Comparte el código con la persona que usará Mini. Deberá revisar y confirmar la obra y el grupo.'));
     personal.append(button('Crear invitación para Mini',()=>{(el('sa-field-create') as HTMLButtonElement|null)?.click();}));
     // Keep label text associated with existing inputs in the shared task.
     if(controls)for(const label of [...controls.querySelectorAll<HTMLElement>('label')]){
      if(label.querySelector('input'))continue;
      if(label.textContent?.includes('Nombre'))move(label,parts.get('personal')!);
     }
     const devices=el('sa-field-devices');
     if(devices){const watcher=new MutationObserver(renderCloud);watcher.observe(devices,{childList:true});observers.push(watcher);}
    }
    renderCloud();void refreshCloud();
   }catch(e){options.notify(e instanceof Error?e.message:'No se pudo preparar la cuenta.');}
  }
  function renderOverview(){
   const source=directBody.querySelector('.mini-p2p-peer-list,.sa-p2p-peer-list');
   if(source&&!source.hasAttribute('data-connections-harvested')){
    source.setAttribute('data-connections-harvested','');
    directList.replaceChildren();
    for(const card of [...source.querySelectorAll<HTMLElement>('.mini-p2p-peer-row,.sa-p2p-peer-row')]){
     decorate(card,'direct');directList.append(card);
    }
    extras.replaceChildren();
    const pending=directBody.querySelector<HTMLElement>('.mini-p2p-activity');if(pending)extras.append(pending);
    const self=directBody.querySelector<HTMLElement>('.mini-p2p-self,.sa-p2p-self');if(self)extras.append(self);
    const backup=directBody.querySelector<HTMLElement>('[data-open-backup-hub-btn]');if(backup)extras.append(backup);
   }
   initializeInternet();renderCloud();
  }
  function paintHome(){
   currentTask='';
   if(app==='sa')restoreSaDetails();
   currentTask='';shell.insertBefore(feedback,taskHost);shell.dataset.connectionScreen='home';if(header)header.append(account);else home.append(account);home.hidden=false;taskHost.hidden=true;directBody.hidden=true;feedback.hidden=false;
   for(const part of parts.values())store.append(part);
  }
  function show(_method?:ConnectionMenuMethod){
   if(released)return false;
   if(currentTask&&!guard())return false;
   const returning=!!currentTask&&!['account','details','send'].includes(currentTask);paintHome();renderOverview();if(returning)void refreshCloud();
   queueMicrotask(()=>{
    if(released||!shell.isConnected)return;
    presentation?.refresh();
    const active=d.activeElement as HTMLElement|null;
    if(active&&shell.contains(active)&&active.getClientRects().length&&d.defaultView?.getComputedStyle(active).visibility!=='hidden')return;
    focusableNodes()[0]?.focus();
   });return true;
  }
  function showDirect(){
   home.hidden=true;taskHost.hidden=true;directBody.hidden=false;feedback.hidden=true;
  }
  function pairingChoices(){
   if(app==='mini')taskContent.append(identityCard());
   const choices=node('fieldset','connections-route-choices'),legend=node('legend');legend.textContent='Elige cómo conectar';choices.append(legend);
   let selected:ConnectionMenuMethod=options.internetAvailable?'internet':'direct';
   for(const [value,title,description] of [['internet','Por internet','Recibir personal y enviar asistencia desde cualquier lugar.'],['direct','Conexión directa','Conectar con SA cuando ambos equipos estén disponibles.']]){
    if(value==='internet'&&!options.internetAvailable)continue;
    const card=node('label','connections-route-card');card.dataset.routeCard=value;const radio=d.createElement('input');radio.type='radio';radio.name='connection-route';radio.value=value;radio.checked=selected===value;
    const copy=node('span'),heading=node('strong'),hint=node('small');heading.textContent=title;hint.textContent=description;copy.append(heading,hint);card.append(radio,copy);if(app==='mini'&&typeof MiniConnectionPresentation!=='undefined')card.prepend(MiniConnectionPresentation.icon(d,value==='internet'?'cloud':'qr'));choices.append(card);radio.onchange=()=>{selected=value as ConnectionMenuMethod;};
   }
   const continueButton=button('Continuar',()=>{
    if(!guard())return;
    if(selected==='internet'){if(app==='mini'){taskHost.dataset.screen='invitation';currentTask='invitation';shell.dataset.connectionScreen='invitation';}openForm(app==='sa'?'personal':'link',app==='sa'?'Compartir personal':'Vincular con mi obra');if(app==='sa'&&el('sa-field-login')?.hidden)store.append(account);(el('firebase-link-add') as HTMLButtonElement|null)?.click();}
    else{showDirect();directBody.querySelector<HTMLButtonElement>(app==='sa'?'[data-new-pair]':'[data-manual-pair]')?.click();}
   });continueButton.dataset.screenPrimary='';taskContent.append(choices,continueButton);
   if(app==='mini'){const scan=button('Escanear QR de SA',()=>{if(!guard())return;showDirect();directBody.querySelector<HTMLButtonElement>('[data-scan-pair]')?.click();});taskContent.append(scan);}
  }
  function openForm(name:string,title:string){
   for(const part of parts.values())store.append(part);
   taskContent.replaceChildren();taskTitle.textContent=title;
   const part=parts.get(name);if(part)taskContent.append(part);
   if(app==='mini'&&(name==='send'||name==='members')&&part){const dates=el('cloud-field-dates');if(dates)move(dates,part);if(dates)part.prepend(dates);}
  }
  function task(name:string){
   if(released||!guard())return false;
   initializeInternet();if(name==='link'||name==='invitation'||name==='account')taskHost.insertBefore(account,taskTitle);else store.append(account);taskHost.dataset.screen=name;shell.dataset.connectionScreen=name;currentTask=name;home.hidden=true;directBody.hidden=true;taskHost.hidden=false;feedback.hidden=false;
   openForm(name==='link'?'route':name==='invitation'?'link':name,name==='send'?'Enviar asistencia':name==='leave'?'Desvincular de la obra':name==='settings'?'Nombre de este Mini':name==='members'?'Miembros y asistencia':'Compartir personal');
   if(name==='link'){taskTitle.textContent='Vincular una obra';pairingChoices();}
   if(name==='invite')taskTitle.textContent='Invitar un Mini';if(name==='invitation')taskTitle.textContent='Revisar invitación';
   if(name==='details')renderDetails();if(name==='account'){taskTitle.textContent='Mi cuenta';renderAccount();}
   if(name==='send'){renderSendPreview();void options.prepareSend?.();}if(name==='members'){renderSendPreview();void options.prepareMembers?.();}
   taskHost.append(feedback);presentation?.refresh();if(app==='mini')shell.querySelector<HTMLButtonElement>('[data-mini-header-back]')?.focus();else taskBack.focus();return true;
  }
  function directClick(event:Event){
   const target=event.target as HTMLElement|null;
   if(target?.closest('[data-wait-peer],[data-wait-attendance],[data-send-peer],[data-select-peer],[data-rename-peer],[data-open-backup-hub-btn],[data-rename-self]'))showDirect();
  }
  home.addEventListener('click',directClick,true);
  const bodyWatcher=new MutationObserver(()=>{
   if(released)return;
   if(!directBody.querySelector('.mini-p2p-peer-list,.sa-p2p-peer-list')&&directBody.childElementCount)showDirect();
  });
  bodyWatcher.observe(directBody,{childList:true});observers.push(bodyWatcher);
  function focusableNodes(){
   return [...shell.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,a[href],[tabindex="0"]')].filter(n=>!n.hasAttribute('disabled')&&n.getClientRects().length>0&&n.tabIndex>=0&&d.defaultView?.getComputedStyle(n).visibility!=='hidden');
  }
  function keydown(event:KeyboardEvent){
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();options.close();return;}
   if(event.key!=='Tab')return;
   const nodes=focusableNodes();
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&d.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&d.activeElement===last){event.preventDefault();first?.focus();}
  }
  shell.addEventListener('keydown',keydown);
  if(app==='mini'&&typeof MiniConnectionPresentation!=='undefined')presentation=MiniConnectionPresentation.mount({shell,body:directBody,task:taskHost,title:taskTitle,back:taskBack,account:accountOpen});
  return {
   show,task,activate,canNavigate:guard,
   review(_method:ConnectionMenuMethod){showDirect();},
   release(){
    if(!options.beforeLeaveInternet())return false;
    if(app==='sa')restoreSaDetails();
    presentation?.dispose();cleanupCallbacks.forEach(fn=>fn());released=true;d.removeEventListener('connection-send-preview',sendPreviewChanged);d.body.classList.remove('connections-open');d.removeEventListener('connection-updates',updates);observers.forEach(o=>o.disconnect());
    for(const {node,parent,next} of [...origins].reverse()){
     if(next?.parentNode===parent)parent.insertBefore(node,next);else parent.append(node);
    }
    if(internet)internet.hidden=true;
    shell.removeEventListener('keydown',keydown);if(trigger?.isConnected)queueMicrotask(()=>trigger.focus());return true;
   }
  };
 }
 return {createModeState,createPeerActions,safeAccountPhoto,mount};
});
