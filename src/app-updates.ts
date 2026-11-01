interface MiniUpdatesManager {
 boot(): void; flush(): void; showNews(manual?: boolean): void;
 check(manual?: boolean, force?: boolean): Promise<void>; controllerChanged(hadController: boolean): Promise<void>;
 apply(): Promise<unknown>; repair(): Promise<void>; reloadSafely(): Promise<void>; cancelOperation(): void; getState(): MiniUpdateState;
}
interface MiniUpdatesOptions {
 openModal(id: string): void; closeModal(id: string): void; beforeReload(): Promise<void>; isBusy(): boolean;
}
interface Window {
 MiniAppVersion: AppVersionPolicy;
 MINI_BUILD_INFO?: {version?: string; buildId?: string; updatedAt?: string};
 AppUpdateManager: {createReleaseManager(options: AppUpdateManagerOptions): MiniUpdatesManager};
 MiniAppUpdateWorker: {
  createAppUpdateWorker(options?: MiniUpdateWorkerConfig): {
   prepare(version: string, options?: MiniPrepareOptions): Promise<MiniPreparedUpdate>;
   activate(handle: MiniPreparedUpdate, options?: {signal?: AbortSignal}): Promise<void>;
   confirmRunningVersion(version: string): Promise<void>;
  };
  withUpdateDeadline<T>(action: (signal: AbortSignal) => Promise<T> | T, options?: {timeoutMs?: number; signal?: AbortSignal}): Promise<T>;
 };
 MiniUpdateFeedback: {createUpdateFeedback(): HTMLElement; updateUpdateFeedback(element: HTMLElement, state: Partial<MiniUpdateState>): void};
 MiniUpdates: {init(options: MiniUpdatesOptions): void; showNews(): void; check(): Promise<void>; repair(): void; close(id: string): void; onModalClosed(id: string): void};
}
(function exposeMiniUpdates(root: any, factory: () => unknown) {
 const api=factory();
 if(typeof module==='object' && module && module.exports)module.exports=api;
 if(root)root.MiniUpdates=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 let manager: MiniUpdatesManager | null=null,config: MiniUpdatesOptions | null=null;
 const callbacks=new Map<string,()=>void>();
 function hasOtherDialog(){
  return !!document.querySelector('.modal.active:not(#update-modal):not(#interface-repair-modal), .mini-p2p-overlay, .mini-welcome-overlay');
 }
 function status(message:string){
  const target=document.querySelector('#interface-repair-modal.active [data-release-status], #update-modal.active [data-release-status]');
  if(target)target.textContent=message;
  const inline=document.getElementById('app-update-status');if(inline)inline.textContent=message;
 }
 function updateControls(state:MiniUpdateState){
  document.querySelectorAll<HTMLElement>('[data-update-feedback]').forEach(el=>window.MiniUpdateFeedback.updateUpdateFeedback(el,state));
  const modal=document.getElementById('update-modal');
  if(modal){
   const primary=modal.querySelector<HTMLButtonElement>('[data-release-apply]');
   if(primary){primary.disabled=state.busy||state.phase==='preparing';primary.textContent=state.busy?'Actualizando…':state.phase==='preparing'?'Preparando…':state.phase==='error'?'Reintentar':'Actualizar ahora';}
   const reload=modal.querySelector<HTMLButtonElement>('[data-release-reload]');
   if(reload){reload.hidden=state.phase!=='error';reload.disabled=state.busy;}
   modal.setAttribute('aria-busy',String(state.busy||state.phase==='preparing'));
  }
  const repair=document.getElementById('interface-repair-modal');
  if(repair){
   const primary=repair.querySelector<HTMLButtonElement>('[data-repair-apply]');
   if(primary){primary.disabled=state.busy;primary.textContent=state.busy?'Reparando…':'Reparar y recargar';}
   const reload=repair.querySelector<HTMLButtonElement>('[data-release-reload]');
   const message=repair.querySelector('[data-release-status]')?.textContent||'';
   if(reload){reload.hidden=state.busy||!/^No se pudo|tardó demasiado/.test(message);reload.disabled=state.busy;}
   repair.setAttribute('aria-busy',String(state.busy));
  }
 }
 async function fetchRelease():Promise<unknown>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetch('./app-release.json?__incoming='+Date.now(),{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Release unavailable');
   const content=await response.text();if(content.length>150000)throw Error('Release too large');
   return JSON.parse(content) as unknown;
  }finally{clearTimeout(timer);}
 }
 function addFeedback(modal:HTMLElement){
  if(modal.querySelector('[data-update-feedback]'))return;
  const target=modal.querySelector('[data-release-status]');
  const feedback=window.MiniUpdateFeedback.createUpdateFeedback();
  const title=modal.querySelector('h2');title?.after(feedback);if(target)feedback.after(target);
 }
 function show(kind:'news'|'update',releases:AppRelease[],version:string,onClose:()=>void,apply:()=>Promise<unknown>):boolean{
  const id=kind==='news'?'whats-new-modal':'update-modal',modal=document.getElementById(id);
  if(!modal||!config)return false;
  modal.querySelector('[data-release-title]')!.textContent=(kind==='news'?'Novedades · v':'Actualización disponible · v')+version;
  const list=modal.querySelector('[data-release-list]')!;list.replaceChildren();
  for(const entry of releases){
   const release=window.MiniAppVersion.getDisplayRelease(entry);
   const section=document.createElement('section'),title=document.createElement('h3'),date=document.createElement('p'),items=document.createElement('ul');
   title.textContent=release.title+' · v'+release.version;date.textContent=release.date.split('-').reverse().join('/');
   for(const text of release.items){const item=document.createElement('li');item.textContent=text;items.appendChild(item);}
   section.append(title,date,items);list.appendChild(section);
  }
  modal.querySelector('[data-release-status]')!.textContent=kind==='update'?manager?.getState().message||'':'';
  if(kind==='update'){
   addFeedback(modal);
   modal.querySelector<HTMLButtonElement>('[data-release-apply]')!.onclick=()=>{void apply();};
   modal.querySelector<HTMLButtonElement>('[data-release-reload]')!.onclick=()=>{void manager?.reloadSafely();};
  }
  callbacks.set(id,onClose);config.openModal(id);if(manager)updateControls(manager.getState());return true;
 }
 function showSuccess(onClose:()=>void):boolean{
  const element=document.getElementById('update-success');if(!element)return false;
  element.hidden=false;setTimeout(()=>{element.hidden=true;onClose();},1800);return true;
 }
 function repair(){
  if(!manager||!config||document.querySelector('#interface-repair-modal.active, #update-modal.active, #whats-new-modal.active'))return;
  if(config.isBusy()||hasOtherDialog()){status('Guarda o cierra los cambios pendientes antes de reparar la interfaz.');return;}
  const modal=document.getElementById('interface-repair-modal');if(!modal)return;
  modal.querySelector('[data-release-status]')!.textContent='';addFeedback(modal);
  modal.querySelector<HTMLButtonElement>('[data-repair-apply]')!.onclick=()=>{void manager?.repair();};
  modal.querySelector<HTMLButtonElement>('[data-release-reload]')!.onclick=()=>{void manager?.reloadSafely();};
  callbacks.set('interface-repair-modal',()=>manager?.cancelOperation());config.openModal('interface-repair-modal');updateControls(manager.getState());
 }
 function init(options:MiniUpdatesOptions){
  if(manager)return;config=options;
  const worker=window.MiniAppUpdateWorker.createAppUpdateWorker({legacyCacheName:()=>{
   const info=window.MINI_BUILD_INFO;
   return info?.version&&info.buildId?'asistencia-v'+info.version+'-'+info.buildId:null;
  }});
  manager=window.AppUpdateManager.createReleaseManager({
   policy:window.MiniAppVersion,prefix:'mini',
   read:key=>(key==='mini:updateReceipt'?sessionStorage:localStorage).getItem(key),
   write:(key,value)=>(key==='mini:updateReceipt'?sessionStorage:localStorage).setItem(key,value),
   now:()=>Date.now(),online:()=>navigator.onLine!==false,fetchRelease,
   canShow:()=>!options.isBusy()&&!document.querySelector('.modal.active, .mini-p2p-overlay, .mini-welcome-overlay'),
   canReload:()=>!options.isBusy()&&!hasOtherDialog(),
   show,showSuccess,status,updateState:updateControls,
   beforeReload:()=>window.MiniAppUpdateWorker.withUpdateDeadline(()=>options.beforeReload(),{timeoutMs:15000}),
   prepareRelease:worker.prepare,activateRelease:worker.activate,reload:()=>location.reload(),
   reportError:(error,context)=>console.warn('Mini: '+context,error)
  });
  manager.boot();void worker.confirmRunningVersion(window.MiniAppVersion.APP_VERSION);
  let hadController=!!navigator.serviceWorker?.controller;
  const watched=new WeakSet<ServiceWorkerRegistration>();
  const watch=(registration:ServiceWorkerRegistration|undefined)=>{
   if(!registration||watched.has(registration))return;watched.add(registration);
   registration.addEventListener('updatefound',()=>{void manager!.check(false,true);});
  };
  if('serviceWorker'in navigator){
   navigator.serviceWorker.addEventListener('controllerchange',()=>{const previous=hadController;hadController=true;void manager!.controllerChanged(previous);});
   navigator.serviceWorker.ready.then(watch).catch(()=>{});navigator.serviceWorker.getRegistration().then(watch).catch(()=>{});
  }
  const check=()=>{if(document.visibilityState!=='hidden')void manager!.check();};
  window.addEventListener('online',()=>{void manager!.check(false,true);});window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  setInterval(check,60000);setInterval(()=>manager!.flush(),1000);check();
  document.querySelectorAll('[data-app-version]').forEach(el=>{el.textContent='v'+window.MiniAppVersion.APP_VERSION;});
 }
 function onModalClosed(id:string){const callback=callbacks.get(id);callbacks.delete(id);callback?.();}
 return{init,showNews:()=>manager?.showNews(true),check:()=>manager?.check(true)||Promise.resolve(),repair,
 close:(id:string)=>config?.closeModal(id),onModalClosed};
});
