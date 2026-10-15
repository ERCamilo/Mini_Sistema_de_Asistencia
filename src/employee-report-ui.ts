interface EmployeeReportUIConfirmationBoundary {
  waitUntilReady?():Promise<void>;
  waitUntilPersisted?():Promise<void>;
}
interface EmployeeReportUIPersistenceOptions {
  getStartup():Promise<void>|null;
  getWriteQueue():Promise<void>;
  isReady():boolean;
  isFallback():boolean;
}
interface EmployeeReportUIOptions extends EmployeeReportUIConfirmationBoundary {
  reporter: { prepare(input:EmployeeReportInput):EmployeeReportPrepared; confirm(report:EmployeeReportPrepared):void };
  getData():EmployeeReportInput;
  share(text:string):Promise<void>; copy(text:string):Promise<void>;
  onView(view:EmployeeReportUIView):void; onConfirmed?():void;
}
interface EmployeeReportUIView {
  report:EmployeeReportPrepared|null; busy:boolean; canConfirm:boolean;
  confirmed:boolean; message:string;
}
interface EmployeeReportUIConfig extends EmployeeReportUIConfirmationBoundary {
  getData():EmployeeReportInput; isReady():boolean;
  openModal(id:string):void; toast(message:string):void;
  copy(text:string):Promise<void>; onConfirmed?():void; storage?:EmployeeReportStorage;
}

(function exposeEmployeeReportUI(root:any,factory:(root:any)=>unknown){
  const api=factory(root);
  if(typeof module==='object'&&module&&module.exports)module.exports=api;
  if(root)root.EmployeeReportUI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root:any){
  // A resolved queue alone says nothing about startup hydration or skipped writes.
  function createPersistenceBoundary(options:EmployeeReportUIPersistenceOptions) {
    function assertAvailable():void {
      if(!options.isReady()&&!options.isFallback())throw new Error('No se pudo guardar la referencia: el almacenamiento aún no está listo. Intenta de nuevo.');
    }
    return {
      waitUntilReady():Promise<void> {
        const startup=options.getStartup();
        if(!startup)return Promise.reject(new Error('Mini está cargando los datos. Vuelve a intentarlo.'));
        return startup.then(assertAvailable);
      },
      waitUntilPersisted():Promise<void> {
        // Read after the synchronous ledger mutation has enqueued its snapshot.
        return options.getWriteQueue().then(assertAvailable);
      }
    };
  }
  function createController(options:EmployeeReportUIOptions) {
    let report:EmployeeReportPrepared|null=null, busy=false, offered=false, confirmed=false, message='';
    const getView=():EmployeeReportUIView=>({report,busy,canConfirm:offered&&!confirmed&&!busy,confirmed,message});
    const publish=()=>options.onView(getView());
    function assertScope():void {
      if(!report||options.getData().scope.id!==report.scope.id)throw new Error('La obra o el listado cambió. Vuelve a abrir el reporte.');
    }
    function refresh(mode?:'full'|'changes'):void {
      if(busy)return;
      try {
        report=options.reporter.prepare({...options.getData(),mode});offered=false;confirmed=false;
        message=!report.hasReference?'Primer reporte: registra el listado completo después de enviarlo.':!report.hasContent?'No hay cambios pendientes.':report.mode==='full'?'Listado completo de la obra o cuadrilla, incluidos los pausados.':'Se muestran sólo los empleados nuevos, modificados o retirados del listado.';
      }catch(error){report=null;message=error instanceof Error?error.message:'No se pudo preparar el reporte.';}
      publish();
    }
    async function exportText(action:'share'|'copy'):Promise<boolean> {
      if(!report?.hasContent||busy||confirmed)return false;
      busy=true;message=action==='share'?'Preparando el reporte para compartir…':'Copiando el reporte…';publish();
      try {
        assertScope();await options[action](report.text);offered=true;
        message=action==='share'?'Envía el texto en WhatsApp. Después pulsa «Ya lo envié».':'Reporte copiado. Después de enviarlo, pulsa «Ya lo envié».';
        return true;
      }catch(error){message=error instanceof Error&&error.name==='AbortError'?'Compartido cancelado. Los cambios siguen pendientes.':error instanceof Error?error.message:'No se pudo compartir. Los cambios siguen pendientes.';return false;}
      finally{busy=false;publish();}
    }
    async function confirm():Promise<boolean> {
      if(!report||!offered||busy||confirmed)return false;
      busy=true;message='Guardando la referencia del reporte…';publish();
      try {
        await options.waitUntilReady?.();
        assertScope();options.reporter.confirm(report);
        await options.waitUntilPersisted?.();
        confirmed=true;message='Reporte registrado. Las próximas comparaciones usarán exactamente este listado.';
        try{options.onConfirmed?.();}catch(_){message+=' La copia de respaldo local sigue pendiente.';}
        return true;
      }catch(error){message=error instanceof Error&&error.name==='QuotaExceededError'?'No se pudo guardar la referencia: el almacenamiento está lleno. El reporte sigue pendiente.':error instanceof Error?error.message:'No se pudo registrar el reporte. Los cambios siguen pendientes.';return false;}
      finally{busy=false;publish();}
    }
    return {refresh,getView,share:()=>exportText('share'),copy:()=>exportText('copy'),confirm};
  }
  let config:EmployeeReportUIConfig|null=null;
  let controller:ReturnType<typeof createController>|null=null;
  function render(view:EmployeeReportUIView):void {
    const doc:Document=root.document;
    const text=doc.getElementById('employee-report-text') as HTMLTextAreaElement;
    const preview=view.report?.text||'';
    if(text.value!==preview)text.value=preview;
    doc.getElementById('employee-report-status')!.textContent=view.message;
    doc.getElementById('employee-report-scope')!.textContent=view.report?.scope.name||'';
    const share=doc.getElementById('employee-report-share') as HTMLButtonElement;
    const copy=doc.getElementById('employee-report-copy') as HTMLButtonElement;
    const confirm=doc.getElementById('employee-report-confirm') as HTMLButtonElement;
    share.disabled=copy.disabled=!view.report?.hasContent||view.busy||view.confirmed;
    share.hidden=copy.hidden=view.confirmed;
    confirm.hidden=!view.canConfirm;confirm.disabled=!view.canConfirm;
    share.classList.toggle('btn-primary',!view.canConfirm);share.classList.toggle('btn-secondary',view.canConfirm);
    for(const mode of ['full','changes'] as const){
      const button=doc.getElementById(`employee-report-${mode}`) as HTMLButtonElement;
      const selected=view.report?.mode===mode;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('active',selected);
      button.disabled=view.busy||mode==='changes'&&!view.report?.hasReference&&!view.confirmed;
      button.onclick=()=>controller?.refresh(mode);
    }
    share.onclick=()=>{void controller?.share();};copy.onclick=()=>{void controller?.copy();};confirm.onclick=()=>{void controller?.confirm();};
    const refresh=doc.getElementById('employee-report-refresh') as HTMLButtonElement;
    refresh.textContent=view.confirmed?'Ver cambios pendientes':'Actualizar vista previa';
    refresh.classList.toggle('btn-primary',view.confirmed);refresh.classList.toggle('btn-secondary',!view.confirmed);
    refresh.disabled=view.busy;refresh.onclick=()=>controller?.refresh(view.confirmed?'changes':view.report?.mode);
  }
  async function shareText(text:string):Promise<void> {
    if(typeof root.navigator.share==='function') {
      await root.navigator.share({title:'Reporte de empleados',text});return;
    }
    const url=`https://wa.me/?text=${encodeURIComponent(text)}`;
    if(url.length>7000)throw new Error('Este listado es largo para abrirlo por enlace. Usa «Copiar» y pégalo en WhatsApp; el texto está completo.');
    const opened=root.open(url,'_blank');
    if(!opened)throw new Error('No se pudo abrir WhatsApp. Permite la ventana o copia el reporte para enviarlo.');
    try{opened.opener=null;}catch(_){}
  }
  function configure(options:EmployeeReportUIConfig):void {config=options;}
  function open():void {
    if(!config)return;
    if(!config.isReady()){config.toast('Mini está cargando los datos. Vuelve a intentarlo.');return;}
    controller=createController({reporter:root.EmployeeChangeReport.createReporter({storage:config.storage||root.localStorage}),getData:config.getData,share:shareText,copy:config.copy,waitUntilReady:config.waitUntilReady,waitUntilPersisted:config.waitUntilPersisted,onConfirmed:config.onConfirmed,onView:render});
    controller.refresh();config.openModal('modal-employee-report');
  }
  return {createController,createPersistenceBoundary,configure,open};
});
