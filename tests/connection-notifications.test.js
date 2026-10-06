const test=require('node:test'),assert=require('node:assert/strict');
const {createTracker,createMonitor}=require('../connection-notifications.js');
const event=(version='1',id='roster')=>({id,revision:version,kind:'roster',title:'Personal nuevo',description:'Obra',count:1,scope:{orgId:'o',projectId:'p',groupId:'g'}});
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
test('announce/defer persists by account, scope and revision without clearing pending',()=>{
 const s=storage();let t=createTracker(s);assert.equal(t.canAnnounce('a',event()),true);t.mark('a',event());
 t=createTracker(s);assert.equal(t.canAnnounce('a',event()),false);assert.equal(t.canAnnounce('b',event()),true);assert.equal(t.canAnnounce('a',event('2')),true);
 t.defer('a',event());assert.equal(t.isDeferred('a',event()),true);assert.equal(t.isDeferred('a',event('2')),false);
 assert.equal(t.canAnnounce('a',{...event(),scope:{projectId:'other'}}),true);
});
function fixture(){
 let uid='a',available=true,resolve,fail=false,loads=0;const timers=[],published=[],notices=[],closed=[];
 const m=createMonitor({uid:()=>uid,available:()=>available,tracker:createTracker(storage()),load:async()=>{loads++;if(fail)throw Error('offline');return await new Promise(r=>resolve=r);},
 publish:e=>published.push(e),open:e=>notices.push({opened:e}),announce:(e,review,later)=>{notices.push({e,review,later});return()=>closed.push(e.id);},
 setTimer:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimer:()=>{}});
 return{m,timers,published,notices,closed,get loads(){return loads;},resolve:e=>resolve(e),uid:v=>uid=v,available:v=>available=v,fail:()=>fail=true};
}
test('one request at a time; ignore logout race and close old-account notices',async()=>{
 const f=fixture(),p=f.m.poll();await f.m.poll();assert.equal(f.loads,1);
 f.uid('b');f.m.reset();f.resolve([event()]);await p;assert.deepEqual(f.m.snapshot(),[]);assert.equal(f.notices.length,0);
 const q=f.m.poll();f.resolve([event()]);await q;assert.equal(f.notices.length,1);
 f.uid(null);f.m.reset();assert.equal(f.closed.length,1);f.notices[0].review();assert.equal(f.notices.length,1);
});
test('hidden/offline never fetch; defer retains dashboard task; new version announces',async()=>{
 const f=fixture();f.available(false);await f.m.poll();assert.equal(f.loads,0);f.available(true);
 let p=f.m.poll();f.resolve([event()]);await p;f.notices[0].later();assert.equal(f.m.snapshot().length,1);assert.equal(f.closed.length,1);
 p=f.m.poll();f.resolve([event()]);await p;assert.equal(f.notices.length,1);
 p=f.m.poll();f.resolve([event('2')]);await p;assert.equal(f.notices.length,2);
 p=f.m.poll();f.resolve([]);await p;assert.deepEqual(f.m.snapshot(),[]);
});
test('network failure backs off, preserves pending and caps notices at three',async()=>{
 const f=fixture();let p=f.m.poll();f.resolve([event('1','1'),event('1','2'),event('1','3'),event('1','4')]);await p;
 assert.equal(f.notices.length,3);assert.equal(f.m.snapshot().length,4);f.fail();await f.m.poll();await f.m.poll();
 assert.equal(f.m.snapshot().length,4);assert.equal(f.timers.at(-1).delay,240000);
});
