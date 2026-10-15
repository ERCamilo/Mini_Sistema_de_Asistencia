const test=require('node:test');const assert=require('node:assert/strict');
require('../employee-proposal.js');const Sender=require('../employee-proposal-sender.js');
class Channel{constructor(){this.readyState='open';this.listeners=new Set();this.closers=new Set();this.sent=[];}send(s){this.sent.push(JSON.parse(s));}addEventListener(t,f){if(t==='message')this.listeners.add(f);if(t==='close')this.closers.add(f);}removeEventListener(t,f){this.listeners.delete(f);this.closers.delete(f);}message(m){for(const f of this.listeners)f({data:JSON.stringify(m)});}close(){this.readyState='closed';for(const f of [...this.closers])f({});}}
const employee={id:'local-1',name:'Ana',number:'1',position:'Ayudante',sueldo:'1500'};
test('solicitud SA requiere confirmación y transmisión conserva campos diarios',async()=>{
 const channel=new Channel(),sent=[];let confirm;const storage=new Map();const sender=Sender.createSender({channel,peer:{peerId:'sa-1',peerApp:'sa'},core:{isChannelAuthenticated:()=>true,sendPayload:async(c,p)=>{sent.push(JSON.parse(p.text));return {transferId:'t',sha256:'a'.repeat(64)};}},repository:{getAll:()=>[employee],applySaEmployeeBindings:()=>{}},storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},choose:()=>new Promise(r=>confirm=r)});
 channel.message({schema:'mini-roster-request/v1',requestId:'req-1',saProjectId:'P-1',offerId:''});await new Promise(r=>setImmediate(r));assert.equal(sent.length,0);
 confirm(['local-1']);await new Promise(r=>setImmediate(r));assert.equal(sent[0].employees[0].dailySalary,1500);assert.equal(sent[0].employees[0].position,'Ayudante');sender.detach();
});
test('canal sin autenticar no produce oferta ni datos',()=>{
 const channel=new Channel();const sender=Sender.createSender({channel,peer:{peerId:'sa-1',peerApp:'sa'},core:{isChannelAuthenticated:()=>false},repository:{getAll:()=>[employee]},storage:{getItem:()=>null,setItem:()=>{}},choose:async()=>['local-1']});
 assert.throws(()=>sender.offer(['local-1']));assert.equal(channel.sent.length,0);sender.detach();
});
test('una oferta desde Mini también confirma la obra antes de transmitir y reenviar conserva proposalId',async()=>{
 const channel=new Channel(),sent=[],chosen=[],storage=new Map();
 const sender=Sender.createSender({channel,peer:{peerId:'sa-1',peerApp:'sa'},core:{isChannelAuthenticated:()=>true,sendPayload:async(c,p)=>sent.push(JSON.parse(p.text))},repository:{getAll:()=>[employee],applySaEmployeeBindings:()=>{}},storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},choose:async request=>{chosen.push(request);return ['local-1'];}});
 sender.offer(['local-1']);const offer=channel.sent.find(m=>m.schema==='mini-roster-offer/v1');
 channel.message({schema:'mini-roster-request/v1',requestId:'r-1',saProjectId:'P-1',projectName:'Obra Norte',offerId:offer.offerId});await new Promise(r=>setImmediate(r));
 assert.equal(chosen.length,1);assert.equal(chosen[0].projectName,'Obra Norte');
 channel.message({schema:'mini-roster-request/v1',requestId:'r-2',saProjectId:'P-1',projectName:'Obra Norte',offerId:''});await new Promise(r=>setImmediate(r));
 assert.equal(sent[0].proposalId,sent[1].proposalId);assert.equal(sent[1].requestId,'r-2');sender.detach();
});
test('cerrar el canal cancela la selección pendiente y elimina sus listeners',async()=>{
 const channel=new Channel();let aborted=false;
 const sender=Sender.createSender({channel,peer:{peerId:'sa-1',peerApp:'sa'},core:{isChannelAuthenticated:()=>true,sendPayload:async()=>{throw new Error('no debe enviar');}},repository:{getAll:()=>[employee],applySaEmployeeBindings:()=>{}},storage:{getItem:()=>null,setItem:()=>{}},choose:request=>new Promise(resolve=>request.signal?.addEventListener('abort',()=>{aborted=true;resolve([]);})),status:()=>{}});
 channel.message({schema:'mini-roster-request/v1',requestId:'r-1',saProjectId:'P-1',projectName:'Obra',offerId:''});channel.close();
 await new Promise(r=>setImmediate(r));assert.equal(aborted,true);assert.equal(channel.listeners.size,0);sender.detach();
});
test('la comprobación de capacidad recupera el ready si SA se conectó después',()=>{
 const channel=new Channel(),sender=Sender.createSender({channel,peer:{peerId:'sa-late',peerApp:'sa'},core:{isChannelAuthenticated:()=>true},repository:{getAll:()=>[]},storage:{getItem:()=>null,setItem:()=>{}}});
 channel.message({schema:'mini-roster-hello/v1'});
 assert.equal(channel.sent.filter(m=>m.schema==='mini-roster-ready/v1').length,2);sender.detach();
});
