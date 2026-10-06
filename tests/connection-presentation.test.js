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
