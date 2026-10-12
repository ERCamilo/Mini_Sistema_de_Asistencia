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
 function element(tag){return {tag,dataset:{},children:[],attributes:{},ownerDocument:d,classList:{add(){}},setAttribute(k,v){this.attributes[k]=v;},append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);},focus(){d.activeElement=this;}};}
 d.createElement=element;d.createElementNS=(_ns,tag)=>element(tag);return {d,container:element('section')};
}
test('live peer updates retain card, focused button and literal alias text', () => {
 const {mountPeers}=require('../connection-presentation.js'),{d,container}=peerDom();let refresh;
 let peers=[{peerId:'p',name:'<img onerror=bad>',state:'connected',authenticated:true,channelOpen:true,leaseValid:true}];
 const view=mountPeers({container,getPeers:()=>peers,subscribe:fn=>{refresh=fn;return ()=>{};},connect:async()=>{},close(){},notify(){}});
 const row=container.children[0],actions=row.children[4],connect=actions.children[0];connect.focus();
 peers=[{peerId:'p',name:'New alias',state:'connecting'}];refresh();
 assert.equal(container.children[0],row);assert.equal(d.activeElement,connect);assert.equal(row.children[1].textContent,'New alias');
 assert.equal(row.children[2].textContent,'Conectando');view.dispose();
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
