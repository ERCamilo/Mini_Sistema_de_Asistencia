const test=require('node:test'),assert=require('node:assert/strict');
const {createReviewModel,applyReview,createReceipts}=require('../organization-share.js');
const payload={schema:'attendance-submission/v1',saProjectId:'work',workDate:'2026-10-05',rows:[{saEmployeeId:'e1',name:'Uno',status:'present',normalHours:8,overtimeHours:2},{saEmployeeId:'e2',name:'Dos',status:'unmarked',normalHours:0,overtimeHours:0}]};
const employees=[{id:'local1',saProjectId:'work',saEmployeeId:'e1'},{id:'local2',saProjectId:'work',saEmployeeId:'e2'},{id:'wrong',saProjectId:'other',saEmployeeId:'e1'}];
test('review uses scoped SA ids, sums hours and preserves every existing mark by default',()=>{
 const m=createReviewModel(payload,employees,{local1:{status:'present',hours:7},local2:{status:'present',hours:8}},'work');
 assert.equal(m.rows[0].localId,'local1');assert.equal(m.rows[0].incomingHours,10);assert.equal(m.rows[0].currentHours,7);assert.equal(m.rows[0].selected,false);assert.equal(m.rows[1].selectable,false);
 let incoming;applyReview(m,{importBatch:data=>{incoming=data;}});
 assert.equal(incoming,undefined);
 m.rows[0].selected=true;applyReview(m,{importBatch:data=>{incoming=data;}});
 assert.deepEqual(incoming,{'2026-10-05':{local1:{status:'present',hours:10}}});
});
test('missing/ambiguous employees cannot be applied and foreign work rejected',()=>{
 assert.throws(()=>createReviewModel(payload,employees,{},'other'));
 const m=createReviewModel(payload,[...employees,{id:'duplicate',saProjectId:'work',saEmployeeId:'e1'}],{},'work');
 assert.equal(m.rows[0].selectable,false);m.rows[0].selected=true;let called=false;
 assert.throws(()=>applyReview(m,{importBatch:()=>called=true}));assert.equal(called,false);
});
test('invalid date, hours and duplicate employee ids fail before mutation',()=>{
 for(const p of [{...payload,rows:[{...payload.rows[0],normalHours:24,overtimeHours:1}]},{...payload,rows:[{...payload.rows[0],normalHours:0,overtimeHours:0}]},{...payload,rows:[{...payload.rows[1],normalHours:8}]},{...payload,workDate:'2026-02-30'},{...payload,rows:[{...payload.rows[0],normalHours:NaN}]},{...payload,rows:[payload.rows[0],payload.rows[0]]}])assert.throws(()=>createReviewModel(p,employees,{},'work'));
});
test('receipt survives reload, account/device/group separation and storage failure',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 let r=createReceipts(storage);assert.equal(r.get('account/work/group/device','share'),null);
 r.put('account/work/group/device','share','applied');r=createReceipts(storage);
 assert.equal(r.get('account/work/group/device','share'),'applied');assert.equal(r.get('other/work/group/device','share'),null);
 assert.throws(()=>createReceipts({getItem:()=>null,setItem:()=>{throw Error('quota');}}).put('scope','id','applied'));
});

test('member presentation uses device name and Google owner, omits email and deduplicates',()=>{
 const {presentMembers}=require('../organization-share.js');
 assert.deepEqual(presentMembers([{deviceId:'a',name:'Equipo Norte',ownerName:'María Pérez',ownerEmail:'private@example.com'},{deviceId:'b',name:'',ownerName:'Juan'},{deviceId:'a',name:'Duplicado'}]),[{deviceId:'a',name:'Equipo Norte',ownerName:'María Pérez'},{deviceId:'b',name:'Juan',ownerName:'Juan'}]);
 assert.throws(()=>presentMembers([{name:'sin id'}]));
});

test('legacy email fallback is not presented as a public Google owner name',()=>{const {presentMembers}=require('../organization-share.js');assert.equal(presentMembers([{deviceId:'a',name:'Mini',ownerName:'private@example.test'}])[0].ownerName,'Miembro de la obra');});

test('multi-day review merges once, keeps unselected hours and validates all before writing',()=>{const {applyReviewBatch}=require('../organization-share.js');const a=createReviewModel(payload,employees,{},'work'),b=createReviewModel({...payload,workDate:'2026-10-04'},employees,{local1:{hours:6}},'work');a.rows[0].selected=true;b.rows[0].selected=true;const calls=[];applyReviewBatch([a,b],{importBatch:(data,mode)=>calls.push({data,mode})});assert.equal(calls.length,1);assert.deepEqual(calls[0],{mode:'merge',data:{'2026-10-05':{local1:{status:'present',hours:10}},'2026-10-04':{local1:{status:'present',hours:10}}}});b.rows[0].localId=null;assert.throws(()=>applyReviewBatch([a,b],{importBatch:()=>assert.fail('no partial write')}));assert.throws(()=>applyReviewBatch([a,a],{importBatch:()=>assert.fail('duplicate date')}));});
test('received day selection stays within one sender and one version per date',()=>{const {validateReviewItems}=require('../organization-share.js');const item=(id,date,device='sender')=>({shareId:id,senderName:'Equipo Norte',payload:{...payload,deviceId:device,workDate:date}});assert.equal(validateReviewItems([item('a','2026-10-04'),item('b','2026-10-05')]).length,2);for(const items of [[],[item('a','2026-10-05'),item('b','2026-10-05')],[item('a','2026-10-04'),item('b','2026-10-05','other')]])assert.throws(()=>validateReviewItems(items));});

function loadOrganizationModule(presentation) {
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const root={module:{exports:{}}};
 if(presentation)root.MiniConnectionPresentation=presentation;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../organization-share.js'),'utf8'),root);
 assert.equal(root.MiniOrganizationShare,root.module.exports);
 return root;
}
function organizationMountFixture() {
 function element(tag) {
  return {tag,children:[],dataset:{},append(...nodes){this.children.push(...nodes);},
   replaceChildren(...nodes){this.children=nodes;},replaceWith(){},
   querySelector(selector){return selector==='svg'?this.children.find(node=>node.tag==='svg'):null;}};
 }
 const host=element('section'),calls=[];
 const document={createElement:element,getElementById:id=>id==='cloud-field-members'?host:null};
 const options={document,storage:{getItem:()=>null,setItem(){}},context:()=>null,
  createQueue:()=>({}),request:async()=>{assert.fail('mount must not request cloud data');},
  build:async()=>null,run:async()=>{assert.fail('mount must not start operations');},
  employees:()=>[],repository:{},onApplied(){},notify(){},open(){}};
 return {host,options,calls,presentation:{icon(document,kind){calls.push(kind);return document.createElement('svg');}}};
}
test('organization mount uses its required icon capability present at module load',()=>{
 const f=organizationMountFixture(),root=loadOrganizationModule(f.presentation);
 const api=root.MiniOrganizationShare.mount(f.options);
 assert.deepEqual(f.calls,['chevron','refresh']);assert.equal(f.host.children.length,4);
 api.reset();assert.deepEqual(f.calls,['chevron','refresh']);
});
test('organization mount resolves required icons loaded after the module, not during initialization',()=>{
 const root=loadOrganizationModule(),f=organizationMountFixture();
 root.MiniConnectionPresentation=f.presentation;
 root.MiniOrganizationShare.mount(f.options);
 assert.deepEqual(f.calls,['chevron','refresh']);assert.equal(f.host.children.length,4);
});
test('organization mount still fails when its required icon capability is missing',()=>{
 const root=loadOrganizationModule(),f=organizationMountFixture();
 assert.throws(()=>root.MiniOrganizationShare.mount(f.options),/icon|MiniConnectionPresentation/);
 assert.equal(f.host.children.length,0);
});
