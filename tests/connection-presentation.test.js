const test=require('node:test'),assert=require('node:assert/strict');
const {describePage}=require('../connection-presentation.js');
test('a single title describes each connection stage, including native personal and direct pairing',()=>{
 assert.deepEqual(describePage({home:true,taskTitle:'viejo'}),{key:'home',title:'Conexiones',back:false});
 assert.equal(describePage({task:'send',taskTitle:'Enviar asistencia'}).title,'Enviar asistencia');
 assert.equal(describePage({native:'personal-review',nativeTitle:'Revisa qué cambiará'}).title,'Actualizar personal');
 assert.equal(describePage({native:'personal-result'}).title,'Personal actualizado');
 assert.equal(describePage({native:'direct',nativeTitle:'Escanear QR de SA'}).title,'Escanear QR de SA');
 assert.equal(describePage({native:'direct'}).back,true);
});

test('invitation headings follow the real Google linking phase',()=>{
 assert.equal(describePage({task:'invitation',taskTitle:'viejo',linkPhase:'ready'}).title,'Vincular con mi obra');
 assert.equal(describePage({task:'link',linkPhase:'preview'}).title,'Confirmar vínculo');
 assert.equal(describePage({task:'invitation',linkPhase:'linked'}).title,'Mini vinculado');
 assert.equal(describePage({task:'account',taskTitle:'Mi cuenta',linkPhase:'linked'}).title,'Mi cuenta');
});

test('background connection details stay collapsed; actions get a visible result',()=>{
 const {describeFeedback}=require('../connection-presentation.js');
 assert.deepEqual(describeFeedback('idle',false,false),{banner:false,open:false,busy:false});
 assert.deepEqual(describeFeedback('success',false,false),{banner:true,open:false,busy:false});
 assert.deepEqual(describeFeedback('error',false,false),{banner:true,open:false,busy:false});
 assert.deepEqual(describeFeedback('idle',true,true),{banner:false,open:false,busy:false});
 assert.deepEqual(describeFeedback('idle',false,true),{banner:false,open:true,busy:false});
 assert.deepEqual(describeFeedback('busy',false,false),{banner:false,open:false,busy:true});
});

test('send, dates, sharing and refresh have distinct representative vector icons',()=>{const {icon}=require('../connection-presentation.js');const d={createElementNS:(ns,tag)=>({tag,attributes:{},children:[],classList:{add(){}},setAttribute(k,v){this.attributes[k]=v;},append(child){this.children.push(child);},namespaceURI:ns})};const drawing=kind=>icon(d,kind).children[0].attributes.d;const document=drawing('document');for(const kind of ['send','calendar','share','refresh'])assert.notEqual(drawing(kind),document,kind+' must not fall back to a document');assert.equal(new Set(['send','calendar','share','refresh'].map(drawing)).size,4);});

test('Mini peer state requires a valid authenticated open channel, not merely a link', () => {
 const api=require('../connection-presentation.js');assert.equal(typeof api.describePeer,'function');
 assert.equal(api.describePeer({peerId:'p',name:'Mini',state:'connected'}).label,'Disponible');
 assert.equal(api.describePeer({peerId:'p',name:'Mini',state:'connected',authenticated:true,channelOpen:true,leaseValid:true}).label,'Conectado');
 assert.equal(api.describePeer({peerId:'p',name:'Mini',state:'connecting'}).label,'Conectando');
 assert.equal(api.describePeer({peerId:'p',name:'Mini',state:'error'}).label,'Error');
});

function peerDom() {
 const d={activeElement:null};
 function element(tag){return {tag,dataset:{},children:[],get childNodes(){return this.children;},replaceChildren(...nodes){this.children=[];this.append(...nodes);},attributes:{},ownerDocument:d,classList:{add(){}},setAttribute(k,v){this.attributes[k]=v;},append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);},focus(){d.activeElement=this;}};}
 d.createElement=element;d.createElementNS=(_ns,tag)=>element(tag);return {d,container:element('section')};
}
test('live peer updates retain card, focused button and literal alias text', () => {
 const {mountPeers}=require('../connection-presentation.js'),{d,container}=peerDom();let refresh;
 let peers=[{peerId:'p',name:'<img onerror=bad>',state:'connected',authenticated:true,channelOpen:true,leaseValid:true}];
 const view=mountPeers({container,getPeers:()=>peers,subscribe:fn=>{refresh=fn;return ()=>{};},connect:async()=>{},close(){},notify(){}});
 const row=container.children[0],actions=row.children[4],connect=actions.children[0];connect.focus();
 peers=[{peerId:'p',name:'New alias',state:'connecting'}];refresh();
 assert.equal(container.children[0],row);assert.equal(d.activeElement,connect);assert.equal(row.children[1].textContent,'New alias');
 assert.equal(row.children[2].children[1].textContent,'Conectando');view.dispose();
});
test('peer view coalesces reconnect clicks and stale completion cannot enable a newer action', async () => {
 const {mountPeers}=require('../connection-presentation.js'),{container}=peerDom();let first,second,calls=0,closed=0;
 const view=mountPeers({container,getPeers:()=>[{peerId:'p',name:'Mini',state:'connecting'}],subscribe:()=>()=>{},connect:()=>{calls++;return new Promise(r=>{if(calls===1)first=r;else second=r;});},close(){closed++;},notify(){}});
 const [connect,close]=container.children[0].children[4].children;
 connect.onclick();connect.onclick();assert.equal(calls,1);assert.equal(connect.disabled,true);
 close.onclick();connect.onclick();assert.equal(calls,2);assert.equal(closed,1);
 first();await new Promise(r=>setImmediate(r));assert.equal(connect.disabled,true);
 second();await new Promise(r=>setImmediate(r));assert.equal(connect.disabled,false);view.dispose();
});

test('peer cards show prominent semantic icon and text for all four current states', () => {
 const {mountPeers}=require('../connection-presentation.js'),{d,container}=peerDom();let refresh;
 let peer={peerId:'p',name:'Synthetic Mini',state:'available'};
 const view=mountPeers({container,getPeers:()=>[peer],subscribe:fn=>{refresh=fn;return ()=>{};},connect:async()=>{},close(){},notify(){}});
 const row=container.children[0],button=row.children[4].children[0];button.focus();
 for(const [state,label,kind,hint] of [['available','Disponible','unlink','Sin conexión activa'],['connecting','Conectando','clock','Esperando'],['connected','Conectado','check','Listo para enviar y recibir'],['error','Error','warning','Reintenta']]){
  peer={...peer,state,authenticated:state==='connected',channelOpen:state==='connected',leaseValid:state==='connected'};refresh();
  assert.equal(row.dataset.state,state);const badge=row.children[2];assert.equal(badge.attributes.role,'status');assert.equal(badge.attributes['aria-atomic'],'true');
  assert.equal(badge.children[0].attributes['data-peer-state-icon'],kind);assert.equal(badge.children[0].attributes['aria-hidden'],'true');assert.equal(badge.children[1].textContent,label);
  assert.ok(row.children[3].textContent.includes(hint));assert.equal(d.activeElement,button);assert.equal(container.children[0],row);
 }
 view.dispose();
});

test('connected badge resets for closed, expired or unauthenticated linked peers', () => {
 const {mountPeers}=require('../connection-presentation.js'),{container}=peerDom();let refresh;
 let peer={peerId:'p',name:'Mini',state:'connected',authenticated:true,channelOpen:true,leaseValid:true};
 const view=mountPeers({container,getPeers:()=>[peer],subscribe:fn=>{refresh=fn;return ()=>{};},connect:async()=>{},close(){},notify(){}});
 const row=container.children[0];
 for(const field of ['authenticated','channelOpen','leaseValid']){
  peer={...peer,authenticated:true,channelOpen:true,leaseValid:true,[field]:false};refresh();
  assert.equal(row.dataset.state,'available');assert.equal(row.children[2].children[1].textContent,'Disponible');assert.match(row.children[3].textContent,/Sin conexión activa/);
 }
 view.dispose();
});

test('unchanged peer refresh does not rewrite the live status or replace its drawing', () => {
 const {mountPeers}=require('../connection-presentation.js'),{container}=peerDom();
 const view=mountPeers({container,getPeers:()=>[{peerId:'p',name:'Mini',state:'available'}],subscribe:()=>()=>{},connect:async()=>{},close(){},notify(){}});
 const badge=container.children[0].children[2],label=badge.children[1],drawing=badge.children[0].children[0];let writes=0;
 Object.defineProperty(label,'textContent',{get:()=> 'Disponible',set(){writes++;}});
 view.refresh();view.refresh();assert.equal(writes,0);assert.equal(badge.children[0].children[0],drawing);view.dispose();
});

test('link fingerprints use a validated token and a separate public-display digest domain', async () => {
 const api=require('../connection-presentation.js'),core=require('../p2p-core.js');
 const token=Buffer.alloc(32,7).toString('base64url'),other=Buffer.alloc(32,8).toString('base64url');
 assert.equal(typeof api.createLinkFingerprint,'function');
 const hash=await api.createLinkFingerprint(core,token);
 const expected=(await core.sha256Hex('mini-connection-card/link-fingerprint/v1:'+token)).slice(0,24).match(/.{6}/g).join('-');
 assert.equal(hash,expected);assert.equal(hash,await api.createLinkFingerprint(core,token));assert.notEqual(hash,await api.createLinkFingerprint(core,other));
 assert.equal(await api.createLinkFingerprint(core,'secret-invalid-token'),null);
 assert.equal(await api.createLinkFingerprint({...core,sha256Hex:async()=>{throw Error('secret');}},token),null);
 assert.doesNotMatch(hash,new RegExp(token));
});
test('observed phases never infer trusted readiness from factory, ICE or channel completion', () => {
 const {observePhase}=require('../connection-presentation.js');
 assert.equal(typeof observePhase,'function');
 for(const [facts,phase] of [[{},'standby'],[{preparing:true},'preparing'],[{transportPresent:true},'preparing'],[{localDescription:true,remoteDescription:false},'waiting-answer'],[{remoteDescription:true},'negotiating'],[{channelOpen:true},'authenticating'],[{channelOpen:true,authenticated:true,leaseValid:false},'authenticating'],[{channelOpen:true,authenticated:true,leaseValid:true},'ready'],[{state:'error'},'error']])assert.equal(observePhase(facts),phase);
});
test('card detail strings allowlist phases, codes and reasons without leaking unexpected text', () => {
 const {describePeerDetails}=require('../connection-presentation.js');
 assert.equal(typeof describePeerDetails,'function');
 const base={peerId:'p',name:'Mini',phase:'waiting-answer',linkFingerprint:'012345-abcdef-012345-abcdef',preparationRemainingMs:9100,lastCloseReason:'preparation-timeout'};
 const view=describePeerDetails(base);assert.match(view.link,/012345/);assert.match(view.phase,/respuesta/);assert.equal(view.remaining,'Intento: 00:10');assert.match(view.lastClose,/tiempo/);
 assert.equal(describePeerDetails({...base,preparationRemainingMs:-2}).remaining,'Intento: 00:00');
 assert.equal(describePeerDetails({...base,phase:'ready',authenticated:true,channelOpen:true,leaseValid:true,preparationRemainingMs:null,channelRemainingMs:61000}).remaining,'Canal: 01:01');
 const unknown=JSON.stringify(describePeerDetails({...base,phase:'secret-sdp',linkFingerprint:'secret-proof',lastCloseReason:'secret-error'}));assert.doesNotMatch(unknown,/secret/);assert.match(unknown,/Sin identificar/);
});
test('display timer reads fixed remaining time, preserves keyed focus and stops on idle and dispose', () => {
 const {mountPeers}=require('../connection-presentation.js'),{d,container}=peerDom();let callback,timer=0,cancelled=0,reads=0,remaining=5000;
 const view=mountPeers({container,getPeers:()=>{reads++;return [{peerId:'p',name:'Mini',phase:'preparing',preparationRemainingMs:remaining}];},subscribe:()=>()=>{},connect:async()=>{},close(){},notify(){},schedule:fn=>{callback=fn;return ++timer;},cancel:()=>cancelled++});
 const row=container.children[0],button=row.children[4].children[0];button.focus();const details=row.children[5];assert.ok(details,'detail group missing');assert.equal(timer,1);
 remaining=2900;callback();assert.equal(container.children[0],row);assert.equal(d.activeElement,button);assert.match(details.children[2].textContent,/00:03/);assert.equal(timer,2);
 remaining=null;callback();assert.equal(timer,2,'idle cards must not schedule another tick');assert.equal(reads,3);view.dispose();assert.equal(cancelled,0);
 const active=mountPeers({container,getPeers:()=>[{peerId:'q',name:'Mini',channelRemainingMs:5000}],subscribe:()=>()=>{},connect:async()=>{},close(){},notify(){},schedule:fn=>{callback=fn;return ++timer;},cancel:()=>cancelled++});active.dispose();assert.equal(cancelled,1);callback();assert.equal(timer,3);
});
