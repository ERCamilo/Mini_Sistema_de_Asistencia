interface ConnectionNoticeEvent {
 id:string;revision:string;kind:'roster'|'attendance'|'sa-attendance';title:string;description:string;count:number;
 scope:Record<string,string>;deferred?:boolean;
}
interface ConnectionNoticeTracker {
 key(event:ConnectionNoticeEvent):string;canAnnounce(uid:string,event:ConnectionNoticeEvent):boolean;
 mark(uid:string,event:ConnectionNoticeEvent):void;defer(uid:string,event:ConnectionNoticeEvent):void;
 isDeferred(uid:string,event:ConnectionNoticeEvent):boolean;
}
interface ConnectionNoticeMonitorOptions {
 uid():string|null;available():boolean;load(uid:string):Promise<ConnectionNoticeEvent[]>;
 publish(events:ConnectionNoticeEvent[]):void;open(event:ConnectionNoticeEvent):void;
 announce(event:ConnectionNoticeEvent,review:()=>void,later:()=>void):()=>void;
 tracker:ConnectionNoticeTracker;setTimer?(fn:()=>void,delay:number):unknown;clearTimer?(id:unknown):void;
}
(function exposeConnectionNotifications(root:any,factory:()=>unknown){const api=factory();if(typeof module==='object'&&module&&module.exports)module.exports=api;if(root)root.ConnectionNotifications=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function eventKey(event:ConnectionNoticeEvent){
  return JSON.stringify([event.kind,event.id,Object.entries(event.scope).sort(([a],[b])=>a.localeCompare(b))]);
 }
 function createTracker(storage:Pick<Storage,'getItem'|'setItem'>):ConnectionNoticeTracker{
  const prefix='connection-notices-v1:',memory=new Map<string,Record<string,{announced?:string;deferred?:string}>>();
  function read(uid:string){
   if(memory.has(uid))return memory.get(uid)!;
   let map:Record<string,{announced?:string;deferred?:string}>={};
   try{const raw=JSON.parse(storage.getItem(prefix+uid)||'{}') as unknown;if(raw&&typeof raw==='object'&&!Array.isArray(raw))map=raw as typeof map;}catch{/* Corrupt notice preferences never affect user data. */}
   memory.set(uid,map);return map;
  }
  function write(uid:string,event:ConnectionNoticeEvent,field:'announced'|'deferred'){
   const map=read(uid),key=eventKey(event);map[key]={...map[key],[field]:event.revision};
   const keys=Object.keys(map);for(const old of keys.slice(0,Math.max(0,keys.length-512)))delete map[old];
   try{storage.setItem(prefix+uid,JSON.stringify(map));}catch{/* Keep session dedupe if storage is unavailable. */}
  }
  return {key:eventKey,canAnnounce:(uid,e)=>read(uid)[eventKey(e)]?.announced!==e.revision&&read(uid)[eventKey(e)]?.deferred!==e.revision,
   mark:(uid,e)=>write(uid,e,'announced'),defer:(uid,e)=>write(uid,e,'deferred'),isDeferred:(uid,e)=>read(uid)[eventKey(e)]?.deferred===e.revision};
 }
 function createMonitor(o:ConnectionNoticeMonitorOptions){
  const timer=o.setTimer||((fn:()=>void,ms:number)=>setTimeout(fn,ms)),clear=o.clearTimer||((id:unknown)=>clearTimeout(id as number));
  const active=new Map<string,{revision:string;close:()=>void}>();
  let events:ConnectionNoticeEvent[]=[],generation=0,running=false,stopped=false,scheduled:unknown=null,failures=0;
  function publish(uid:string){events=events.map(e=>({...e,deferred:o.tracker.isDeferred(uid,e)}));o.publish(events.map(e=>({...e,scope:{...e.scope}})));}
  function schedule(ms:number){if(scheduled!==null)clear(scheduled);scheduled=null;if(stopped||!o.uid())return;scheduled=timer(()=>{scheduled=null;void poll();},ms);}
  function valid(uid:string,g:number,event:ConnectionNoticeEvent){return !stopped&&o.uid()===uid&&generation===g&&events.some(e=>eventKey(e)===eventKey(event)&&e.revision===event.revision);}
  function close(key:string){active.get(key)?.close();active.delete(key);}
  async function poll(){
   if(stopped||running)return;
   const uid=o.uid();if(!uid){reset();return;}
   if(!o.available()){schedule(60000);return;}
   running=true;const g=generation;
   try{
    const result=await o.load(uid);
    if(stopped||g!==generation||o.uid()!==uid)return;
    events=result.slice(0,200);failures=0;
    for(const [key,handle] of active)if(!events.some(e=>eventKey(e)===key&&e.revision===handle.revision))close(key);
    publish(uid);
    for(const event of events){
     const key=eventKey(event);
     if(active.size>=3||active.has(key)||!o.tracker.canAnnounce(uid,event))continue;
     const review=()=>{if(!valid(uid,g,event))return;close(key);o.open(event);};
     const later=()=>{if(!valid(uid,g,event))return;o.tracker.defer(uid,event);close(key);publish(uid);};
     const cleanup=o.announce(event,review,later);active.set(key,{revision:event.revision,close:cleanup});o.tracker.mark(uid,event);
    }
   }catch{/* Preserve previous pending tasks on a transient network failure. */if(g===generation)failures=Math.min(failures+1,3);}
   finally{running=false;schedule(g!==generation?0:Math.min(60000*2**failures,300000));}
  }
  function reset(){generation++;events=[];for(const key of [...active.keys()])close(key);o.publish([]);if(scheduled!==null)clear(scheduled);scheduled=null;failures=0;}
  return {poll,reset,start(){stopped=false;void poll();},stop(){stopped=true;reset();},snapshot:()=>events.map(e=>({...e,scope:{...e.scope}}))};
 }
 return {createTracker,createMonitor};
});
