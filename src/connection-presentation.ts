interface MiniConnectionPeerSnapshot { peerId: string; name: string; state?: string; authenticated?: boolean; channelOpen?: boolean; leaseValid?: boolean; busy?: boolean; phase?: string; linkFingerprint?: string | null; preparationRemainingMs?: number | null; channelRemainingMs?: number | null; lastCloseReason?: string | null; }
interface MiniConnectionPeerViewOptions {
 container: HTMLElement;
 getPeers(): MiniConnectionPeerSnapshot[];
 subscribe(callback: () => void): () => void;
 connect(peerId: string): Promise<void>;
 close(peerId: string): void;
 notify(message: string): void;
 schedule?(callback: () => void, delay: number): unknown;
 cancel?(timer: unknown): void;
}
interface MiniPresentationSnapshot {home?:boolean;task?:string;taskTitle?:string;native?:string;nativeTitle?:string;linkPhase?:string;}
interface MiniPresentationOptions {shell:HTMLElement;body:HTMLElement;task:HTMLElement;title:HTMLElement;back:HTMLButtonElement;account:HTMLButtonElement;}
(function exposeMiniPresentation(root:any,factory:()=>unknown){const api=factory();if(typeof module==='object'&&module&&module.exports)module.exports=api;if(root)root.MiniConnectionPresentation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function describePage(s:MiniPresentationSnapshot){
  if(s.home)return {key:'home',title:'Conexiones',back:false};
  if((s.task==='invitation'||s.task==='link')&&s.linkPhase)return {key:s.linkPhase==='linked'?'linked':s.linkPhase==='preview'?'confirm':'invitation',title:s.linkPhase==='linked'?'Mini vinculado':s.linkPhase==='preview'?'Confirmar vínculo':'Vincular con mi obra',back:true};
  if(s.task)return {key:s.task,title:s.taskTitle||'Conexiones',back:true};
  const titles:Record<string,string>={'personal-review':'Actualizar personal','personal-result':'Personal actualizado','personal-received':'Personal recibido'};
  return {key:s.native||'direct',title:titles[s.native||'']||s.nativeTitle||'Conexión directa',back:true};
 }
 function describeFeedback(state:string,pageChanged:boolean,open:boolean){return {banner:state==='success'||state==='error',open:!pageChanged&&open,busy:state==='busy'};}
 function describePeer(peer:MiniConnectionPeerSnapshot){
  const connected=peer.authenticated===true&&peer.channelOpen===true&&peer.leaseValid===true;
  const state=connected?'connected':peer.state==='connecting'?'connecting':peer.state==='error'?'error':'available';
  return {state,label:state==='connected'?'Conectado':state==='connecting'?'Conectando':state==='error'?'Error':'Disponible',connectLabel:state==='connected'||state==='error'?'Reconectar':'Conectar',canClose:state==='connected'||state==='connecting',busy:peer.busy===true};
 }
 interface ConnectionFingerprintCore { validateLinkToken(value: unknown): string; sha256Hex(value: string): Promise<string>; }
 async function createLinkFingerprint(core: ConnectionFingerprintCore, token: unknown): Promise<string | null> {
  try {
   const validated = core.validateLinkToken(token);
   const digest = await core.sha256Hex('mini-connection-card/link-fingerprint/v1:' + validated);
   return /^[a-f0-9]{64}$/.test(digest) ? digest.slice(0, 24).match(/.{6}/g)!.join('-') : null;
  } catch { return null; }
 }
 function observePhase(facts: { state?: string; preparing?: boolean; transportPresent?: boolean; localDescription?: boolean; remoteDescription?: boolean; channelOpen?: boolean; authenticated?: boolean; leaseValid?: boolean }): string {
  if (facts.authenticated && facts.channelOpen && facts.leaseValid) return 'ready';
  if (facts.state === 'error') return 'error';
  if (facts.channelOpen) return 'authenticating';
  if (facts.localDescription && !facts.remoteDescription) return 'waiting-answer';
  if (facts.remoteDescription) return 'negotiating';
  return facts.preparing || facts.transportPresent ? 'preparing' : 'standby';
 }
 function describePeerDetails(peer: MiniConnectionPeerSnapshot) {
  const phases: Record<string, string> = { standby: 'Disponible, sin canal activo', preparing: 'Preparando conexión', 'waiting-answer': 'Esperando respuesta del otro Mini', negotiating: 'Negociando conexión', authenticating: 'Canal abierto, verificando vínculo', ready: 'Canal autenticado, listo para respaldos', error: 'No se pudo establecer la conexión' };
  const reasons: Record<string, string> = { manual: 'Cerrado en este dispositivo', reconnect: 'Reemplazado al reconectar', 'preparation-timeout': 'Se agotó el tiempo del intento', 'signaling-error': 'Error de señalización', 'signaling-loss': 'Se perdió la señalización', 'transport-error': 'Error del transporte', 'transport-disconnected': 'Transporte desconectado', 'lease-expired': 'Venció el tiempo del canal', unknown: 'Motivo no identificado' };
  const phase = describePeer(peer).state === 'connected' ? 'ready' : peer.phase === 'ready' ? 'authenticating' : peer.phase || 'standby';
  const milliseconds = phase === 'ready' ? peer.channelRemainingMs : peer.preparationRemainingMs;
  const seconds = typeof milliseconds === 'number' && Number.isFinite(milliseconds) ? Math.max(0, Math.ceil(milliseconds / 1000)) : null;
  const time = seconds === null ? '' : String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  return {
   link: /^[a-f0-9]{6}(?:-[a-f0-9]{6}){3}$/.test(peer.linkFingerprint || '') ? peer.linkFingerprint! : 'Sin identificar',
   phase: phases[phase] || 'Estado no identificado',
   remaining: time ? (phase === 'ready' ? 'Canal: ' : 'Intento: ') + time : 'Sin cuenta regresiva activa',
   lastClose: peer.lastCloseReason ? reasons[peer.lastCloseReason] || reasons.unknown : 'Sin cierre registrado'
  };
 }
 function mountPeers(o:MiniConnectionPeerViewOptions){
  const d=o.container.ownerDocument;
  const rows=new Map<string,{row:HTMLElement;name:HTMLElement;status:HTMLElement;statusLabel:HTMLElement;statusIcon:SVGElement;hint:HTMLElement;connect:HTMLButtonElement;close:HTMLButtonElement;details:HTMLElement[]}>();
  const pending=new Map<string,Promise<void>>();let disposed=false;
  const schedule=o.schedule||((callback:()=>void,delay:number)=>setTimeout(callback,delay));
  const cancel=o.cancel||((handle:unknown)=>clearTimeout(handle as ReturnType<typeof setTimeout>));
  let timer:unknown=null;
  function refresh(){
   if(disposed)return;
   const peers=o.getPeers(),ids=new Set(peers.map(peer=>peer.peerId));
   for(const [id,view] of rows)if(!ids.has(id)){view.row.remove();rows.delete(id);}
   for(const peer of peers){
    let view=rows.get(peer.peerId);
    if(!view){
     const row=d.createElement('article');row.className='connections-mini-peer';row.dataset.miniPeer=peer.peerId;
     const name=d.createElement('strong'),status=d.createElement('span'),hint=d.createElement('p'),actions=d.createElement('div');
     status.className='connections-mini-peer-state';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
     const statusLabel=d.createElement('span'),statusIcon=icon(d,'unlink');status.append(statusIcon,statusLabel);hint.className='connections-hint';actions.className='connections-mini-peer-actions';
     const connect=d.createElement('button'),close=d.createElement('button');connect.type=close.type='button';connect.dataset.miniPeerConnect=peer.peerId;close.dataset.miniPeerClose=peer.peerId;
     connect.onclick=()=>{if(pending.has(peer.peerId)||disposed)return;const operation=o.connect(peer.peerId);pending.set(peer.peerId,operation);refresh();void operation.catch(()=>{if(!disposed&&pending.get(peer.peerId)===operation)o.notify('No se pudo conectar. Reintenta; tus datos se conservan.');}).finally(()=>{if(pending.get(peer.peerId)===operation)pending.delete(peer.peerId);refresh();});};
     close.onclick=()=>{if(disposed)return;pending.delete(peer.peerId);o.close(peer.peerId);refresh();};
     const group=d.createElement('div');group.className='connections-mini-peer-details';group.setAttribute('role','group');group.setAttribute('aria-label','Detalles del vínculo');
     const details=Array.from({length:4},()=>d.createElement('p'));details[0].className='connections-mini-peer-link';group.append(...details);
     const note=d.createElement('small');note.textContent='El mismo vínculo no confirma una conexión activa.';group.append(note);
     actions.append(connect,close);row.append(icon(d,'phone'),name,status,hint,actions,group);o.container.append(row);view={row,name,status,statusLabel,statusIcon,hint,connect,close,details};rows.set(peer.peerId,view);
    }
    const model=describePeer(peer);if(view.name.textContent!==peer.name)view.name.textContent=peer.name;if(view.statusLabel.textContent!==model.label){
     view.statusLabel.textContent=model.label;
     const kind=model.state==='connected'?'check':model.state==='connecting'?'clock':model.state==='error'?'warning':'unlink';
     const drawing=icon(d,kind);view.statusIcon.replaceChildren(...Array.from(drawing.childNodes));view.statusIcon.setAttribute('data-peer-state-icon',kind);
    }view.row.dataset.state=model.state;
    view.hint.textContent=model.busy?'Cerrar interrumpe la transferencia; los datos guardados se conservan.':model.state==='available'?'Sin conexión activa. Disponible para recibir con Mini abierta.':model.state==='connecting'?'Esperando al otro Mini.':model.state==='error'?'Reintenta la conexión; tus datos se conservan.':'Listo para enviar y recibir respaldos.';
    view.connect.textContent=model.connectLabel;view.connect.disabled=pending.has(peer.peerId);view.connect.setAttribute('aria-label',model.connectLabel+' con '+peer.name);
    const focusedClose=d.activeElement===view.close;view.close.textContent='Cerrar conexión';view.close.disabled=!model.canClose&&!pending.has(peer.peerId);view.close.setAttribute('aria-label','Cerrar conexión con '+peer.name);
    if(focusedClose&&view.close.disabled)view.connect.focus();
    const detail=describePeerDetails(peer),texts=['Vínculo: '+detail.link,'Fase: '+detail.phase,detail.remaining,'Último cierre: '+detail.lastClose];
    texts.forEach((text,index)=>{if(view!.details[index].textContent!==text)view!.details[index].textContent=text;});
   }
   o.container.hidden=peers.length===0;
   const ticking=peers.some(peer=>[peer.preparationRemainingMs,peer.channelRemainingMs].some(value=>typeof value==='number'&&Number.isFinite(value)&&value>0));
   if(!ticking&&timer!==null){cancel(timer);timer=null;}
   if(ticking&&timer===null)timer=schedule(()=>{timer=null;refresh();},1000);
  }
  const off=o.subscribe(refresh);refresh();return {refresh,dispose(){disposed=true;off();if(timer!==null)cancel(timer);timer=null;pending.clear();rows.clear();}};
 }
 function icon(d:Document,kind:string){
  const paths:Record<string,string>={send:'M22 2L9 15M22 2l-7 20-4-9-9-4z',calendar:'M8 2v4M16 2v4M3 10h18M3 4h18v18H3zM8 15h2M14 15h2',share:'M6 12l12-7M6 12l12 7M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M18 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6',refresh:'M3 12a9 9 0 0 1 15-7l3 3M21 3v5h-5M21 12a9 9 0 0 1-15 7l-3-3M3 21v-5h5',back:'M15 18l-6-6 6-6',chevron:'M9 6l6 6-6 6',building:'M3 22V2h12v20M15 10h6v12M6 6h2M10 6h2M6 10h2M10 10h2M6 14h2M10 14h2M18 14h1M18 18h1M6 22v-4h6v4',phone:'M7 2h10v20H7zM10 18h4',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8',cloud:'M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12z',qr:'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z',document:'M14 2H6v20h14V8l-6-6M14 2v6h6M9 13h8M9 17h8',clock:'M12 8v5l3 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',unlink:'M9 15l-2 2a4 4 0 0 1-6-6l3-3M15 9l2-2a4 4 0 0 1 6 6l-3 3M3 3l18 18',tag:'M3 3h8l10 10-8 8L3 11zM7 7h.01',check:'M5 12l4 4L19 6',warning:'M12 3L2 21h20L12 3zM12 9v5M12 17h.01'};
  const svg=d.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('mini-connection-icon');const p=d.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[kind]||paths.document);svg.append(p);return svg;
 }
 function mount(o:MiniPresentationOptions){
  const d=o.shell.ownerDocument,header=o.shell.querySelector('header'),heading=header?.querySelector<HTMLElement>('.mini-p2p-title,h2,h3'),subtitle=header?.querySelector<HTMLElement>('.mini-p2p-subtitle');
  if(!header||!heading)return {refresh(){},dispose(){}};
  const originalTitle=heading.textContent||'Conexiones';heading.dataset.miniPageTitle='';heading.setAttribute('role','heading');heading.setAttribute('aria-level','2');
  const back=d.createElement('button');back.type='button';back.className='mini-connection-header-back';back.dataset.miniHeaderBack='';back.setAttribute('aria-label','Volver');back.append(icon(d,'back'));
  const account=d.createElement('button');account.type='button';account.className='mini-connection-header-account';account.dataset.miniHeaderAccount='';account.setAttribute('aria-label','Mi cuenta');
  const progress=d.createElement('p');progress.className='mini-connection-progress';progress.textContent='Un momento…';progress.hidden=true;progress.setAttribute('role','status');header.after(progress);
  header.prepend(back);header.append(account);
  back.onclick=()=>{const review=o.task.querySelector<HTMLElement>('[data-organization-review]');if(!o.task.hidden&&review&&!review.hidden){const later=d.getElementById('cloud-members-later') as HTMLButtonElement|null;if(later)later.click();else o.back.click();}else if(!o.task.hidden)o.back.click();else o.body.querySelector<HTMLButtonElement>('[data-back],[data-finish-roster]')?.click();};account.onclick=()=>o.account.click();
  const feedback=o.shell.querySelector<HTMLElement>('.connections-feedback'),details=d.createElement('details'),summary=d.createElement('summary');details.className='mini-connection-feedback';summary.textContent='Estado de conexión';details.append(summary);
  const banner=d.createElement('p');banner.className='mini-connection-operation';banner.dataset.connectionOperation='';banner.hidden=true;banner.setAttribute('role','status');
  let stopped=false,queued=false,last='',lastState='',lastStatus='';
  function refresh(){
   if(stopped)return;
   const home=!o.shell.querySelector<HTMLElement>('[data-connections-home]')?.hidden;
   let snapshot:MiniPresentationSnapshot={home};
   if(!home&&!o.task.hidden){snapshot={task:o.task.dataset.screen,taskTitle:o.title.textContent||'',linkPhase:o.task.querySelector('#firebase-link-code')?d.getElementById('firebase-link-status')?.dataset.linkPhase:undefined};const review=o.task.querySelector<HTMLElement>('[data-organization-review]');if(snapshot.task==='members'&&review&&!review.hidden)snapshot={task:'shared-review',taskTitle:'Revisar asistencia'};if(d.getElementById('firebase-link-confirm')?.hidden===false&&o.task.querySelector('#firebase-link-confirm'))snapshot={task:'confirm',taskTitle:'Confirmar vínculo'};}
   else if(!home){const native=o.body.querySelector('.mini-roster-review:not(.mini-backup-review)')?'personal-review':o.body.querySelector('.mini-roster-result')?'personal-result':o.body.querySelector('[data-review-roster]')?'personal-received':'direct';snapshot={native,nativeTitle:o.body.querySelector('h3')?.textContent||''};}
   const page=describePage(snapshot);o.shell.dataset.miniConnectionPage=page.key;
   if(heading!.textContent!==page.title)heading!.textContent=page.title;
   back.hidden=!page.back||(!home&&o.task.hidden&&!o.body.querySelector('[data-back],[data-finish-roster]'));account.hidden=page.key==='home';account.disabled=!home&&!!o.task.hidden;
   if(subtitle)subtitle.hidden=page.key!=='home';
   const status=d.getElementById('firebase-link-status'),name=status?.dataset.accountName||status?.dataset.accountEmail||'Cuenta Google',initial=name.trim().slice(0,1).toUpperCase()||'G';
   const identity=o.task.querySelector<HTMLElement>('.mini-connection-confirm-account');if(identity){const label=identity.querySelector('strong'),email=identity.querySelector('p'),avatar=identity.querySelector('.connections-avatar');if(label&&label.textContent!==name)label.textContent=name;if(email&&email.textContent!==(status?.dataset.accountEmail||''))email.textContent=status?.dataset.accountEmail||'';if(avatar&&avatar.textContent!==initial)avatar.textContent=initial;}
   if(account.textContent!==initial)account.textContent=initial;account.title=name;account.dataset.signedIn=String(!!status?.dataset.accountEmail);
   const key=page.key+'|'+page.title;
   const cloud=d.getElementById('cloud-field-status'),state=cloud?.dataset.operationState||'idle',message=cloud?.textContent?.trim()||'',view=describeFeedback(state,key!==last,details.open),changed=state!==lastState||message!==lastStatus;
   if(feedback?.parentElement){const parent=feedback.parentElement;if(parent!==details){parent.insertBefore(details,feedback);details.append(feedback);}details.open=view.open;const hidden=!feedback.textContent?.trim();if(details.hidden!==hidden)details.hidden=hidden;}
   if(changed&&view.banner&&cloud){banner.replaceChildren(cloud);banner.dataset.state=state;banner.setAttribute('role',state==='error'?'alert':'status');if(banner.hidden!==!message)banner.hidden=!message;const parent=!o.task.hidden?(o.task.querySelector<HTMLElement>('.mini-connection-footer,.connections-task-content')||o.task):o.shell.querySelector<HTMLElement>('[data-connections-home]');if(parent)parent.prepend(banner);}
   else if(key!==last||state==='busy'||state==='idle'){if(!banner.hidden)banner.hidden=true;if(cloud?.parentElement===banner&&feedback)feedback.append(cloud);}
   lastState=state;lastStatus=message;
   const busy=view.busy||d.getElementById('firebase-link-status')?.dataset.linkBusy==='true';if(progress.hidden===busy)progress.hidden=!busy;o.account.disabled=busy;back.disabled=busy;account.disabled=busy||(!home&&!!o.task.hidden);const close=o.shell.querySelector<HTMLButtonElement>('[data-p2p-close]');if(close)close.disabled=busy;

   if(key!==last){last=key;if(page.back&&d.activeElement===o.back)back.focus();}
  }
  function schedule(){if(queued||stopped)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});}
  const observer=new MutationObserver(schedule);observer.observe(o.shell,{attributes:true,attributeFilter:['data-connection-screen']});observer.observe(o.task,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-screen']});observer.observe(o.title,{childList:true});observer.observe(o.body,{childList:true,subtree:true});
  if(feedback)observer.observe(feedback,{childList:true,subtree:true});const status=d.getElementById('firebase-link-status');if(status)observer.observe(status,{attributes:true,attributeFilter:['data-account-email','data-account-name','data-link-phase','data-link-busy']});const confirm=d.getElementById('firebase-link-confirm');if(confirm)observer.observe(confirm,{attributes:true,attributeFilter:['hidden']});
  const cloud=d.getElementById('cloud-field-status');if(cloud)observer.observe(cloud,{childList:true,attributes:true,attributeFilter:['data-operation-state']});
  refresh();return {refresh,dispose(){stopped=true;observer.disconnect();progress.remove();o.account.disabled=false;if(cloud?.parentElement===banner&&feedback)feedback.append(cloud);banner.remove();if(feedback?.parentElement===details)details.before(feedback);details.remove();back.remove();account.remove();heading!.textContent=originalTitle;delete heading!.dataset.miniPageTitle;delete o.shell.dataset.miniConnectionPage;if(subtitle)subtitle.hidden=false;}};
 }
 return {describePage,describeFeedback,describePeer,createLinkFingerprint,observePhase,describePeerDetails,mountPeers,icon,mount};
});
