const test=require('node:test'),assert=require('node:assert/strict');
const {createModeState}=require('../connection-menu.js');
test('only local Google profile-photo URLs are eligible for display',()=>{
 const {safeAccountPhoto}=require('../connection-menu.js');
 assert.equal(safeAccountPhoto('https://lh3.googleusercontent.com/a/avatar'),'https://lh3.googleusercontent.com/a/avatar');
 for(const value of ['http://lh3.googleusercontent.com/a','https://googleusercontent.com.evil.test/a','https://user@lh3.googleusercontent.com/a','data:image/png;base64,aaa','',null])assert.equal(safeAccountPhoto(value),'');
});
test('one menu selects either transport without inventing device identities',()=>{const state=createModeState({internetAvailable:true,canChange:()=>true});assert.equal(state.current(),'direct');assert.equal(state.select('internet'),true);assert.equal(state.current(),'internet');assert.equal(state.select('direct'),true);});
test('unavailable internet cannot hide the working direct connection',()=>{const state=createModeState({internetAvailable:false,canChange:()=>true});assert.equal(state.select('internet'),false);assert.equal(state.current(),'direct');});
test('active transfer blocks switching methods',()=>{let busy=true;const state=createModeState({internetAvailable:true,canChange:()=>!busy});assert.equal(state.select('internet'),false);assert.equal(state.current(),'direct');busy=false;assert.equal(state.select('internet'),true);busy=true;assert.equal(state.select('direct'),false);assert.equal(state.current(),'internet');});
test('unknown modes are rejected and selected mode can reopen without interrupting work',()=>{const state=createModeState({internetAvailable:true,canChange:()=>false});assert.equal(state.select('direct'),true);assert.throws(()=>state.select('unknown'));});
test('Mini exposes separate visible work and independent device entry points',()=>{
 const fs=require('node:fs'),source=fs.readFileSync(require.resolve('../connection-menu.js'),'utf8');
 assert.ok(source.includes('Asociar a una obra'));
 assert.ok(source.includes('Vincular dispositivo'));
 assert.ok(source.includes('Dispositivos vinculados'));
 assert.ok(source.includes('Obra asociada'));
 assert.ok(source.includes('Iniciar sesión'));
 assert.ok(!source.includes('Otros Minis'));
 assert.ok(!source.includes('Conecta Mini con tu obra'));
 assert.ok(source.includes('connectionsDevice'));
});
test('Mini account UI has one truthful card with original controls and an unavailable state',()=>{
 const source=require('node:fs').readFileSync(require.resolve('../connection-menu.js'),'utf8');
 assert.ok(source.includes('accountState'));
 assert.ok(source.includes('connections-profile-photo'));
 assert.ok(source.includes('El acceso con Google no está habilitado en esta versión.'));
 assert.ok(source.includes('accountUnavailable'));
});

test('peer reconnect has one owned action and stale completion cannot clear a newer action', async () => {
 const api=require('../connection-menu.js');assert.equal(typeof api.createPeerActions,'function');
 let resolve, calls=0, closed=0;const actions=api.createPeerActions({connect:()=>{calls++;return new Promise(r=>{resolve=r;});},close:()=>{closed++;}});
 const first=actions.connect('p'), finishFirst=resolve;assert.equal(actions.connect('p'),first);assert.equal(calls,1);assert.equal(actions.pending('p'),true);
 actions.close('p');assert.equal(closed,1);assert.equal(actions.pending('p'),false);
 const second=actions.connect('p'), finishSecond=resolve;assert.equal(calls,2);
 finishFirst();await first;assert.equal(actions.pending('p'),true);
 finishSecond();await second;assert.equal(actions.pending('p'),false);
 actions.dispose();
});

test('the sharing keyboard trap includes native detail summaries',()=>{
 const source=require('node:fs').readFileSync(require.resolve('../connection-menu.js'),'utf8');
 assert.ok(source.includes('button,input,select,textarea,summary,a[href]'));
});

// Generic DOM/event subset: executes the real compiled UMD menu, not expected UI logic.
function menuDom(staged = []) {
 const vm=require('node:vm'),fs=require('node:fs'),observers=new Set();
 const events=target=>{target.listeners=new Map();target.addEventListener=(name,fn)=>{if(!target.listeners.has(name))target.listeners.set(name,new Set());target.listeners.get(name).add(fn);};target.removeEventListener=(name,fn)=>target.listeners.get(name)?.delete(fn);target.dispatchEvent=event=>{for(const fn of [...(target.listeners.get(event.type)||[])])fn(event);return true;};};
 let mutations=0;
 class Observer {constructor(callback){this.callback=callback;}observe(target){this.target=target;observers.add(this);}disconnect(){observers.delete(this);}}
 function changed(target){for(const o of observers)if(o.target===target&&!o.queued){o.queued=true;queueMicrotask(()=>{o.queued=false;if(observers.has(o)){mutations++;o.callback([]);}});}}
 const d={activeElement:null};events(d);
 class Element {
  constructor(tag){this.tagName=tag.toUpperCase();this.ownerDocument=d;this.children=[];this.attributes={};this.dataset=new Proxy({}, {set:(obj,key,value)=>{obj[key]=String(value);this.attributes['data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;}});this.hidden=false;this.tabIndex=0;this.style={};events(this);}
  get classList(){return {add:(...names)=>{this.className=[...new Set([...(this.className||'').split(' '),...names])].join(' ');},remove:name=>{this.className=(this.className||'').split(' ').filter(x=>x!==name).join(' ');},contains:name=>(this.className||'').split(' ').includes(name)};}
  get childNodes(){return this.children;}get childElementCount(){return this.children.length;}get parentNode(){return this.parentElement;}get nextSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]||null;}get isConnected(){return this===d.body||!!this.parentElement?.isConnected;}
  get textContent(){return (this.text||'')+this.children.map(n=>n.textContent).join('');}set textContent(value){this.text=String(value||'');this.replaceChildren();}
  append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}changed(this);}prepend(...nodes){for(const n of [...nodes].reverse()){n.remove();n.parentElement=this;this.children.unshift(n);}changed(this);}
  insertBefore(n,next){n.remove();n.parentElement=this;const at=this.children.indexOf(next);this.children.splice(at<0?this.children.length:at,0,n);changed(this);}
  remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;changed(p);}}
  replaceChildren(...nodes){for(const n of [...this.children])n.remove();this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);}getAttribute(k){return this.attributes[k]??null;}hasAttribute(k){return k==='hidden'?this.hidden:Object.hasOwn(this.attributes,k);}removeAttribute(k){delete this.attributes[k];}
  matches(selector){if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);const attr=selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);if(attr)return this.hasAttribute(attr[1])&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);return this.tagName.toLowerCase()===selector;}
  querySelectorAll(selector){const result=[];for(const child of this.children){if(selector.split(',').some(s=>child.matches(s.trim())))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}closest(selector){return selector.split(',').some(s=>this.matches(s.trim()))?this:this.parentElement?.closest(selector)||null;}
  focus(){d.activeElement=this;}getClientRects(){return this.hidden?[]:[{}];}click(){this.onclick?.({target:this});this.dispatchEvent({type:'click',target:this});}
 }
 d.createElement=tag=>new Element(tag);d.createElementNS=(_,tag)=>new Element(tag);d.body=d.createElement('body');d.getElementById=id=>d.body.querySelector('#'+id);d.querySelector=selector=>d.body.querySelector(selector);
 const api={stagedList:()=>staged,reviewStaged:async id=>{api.reviewed=id;},discardStaged:async id=>{staged=staged.filter(row=>row.peerId!==id);d.dispatchEvent({type:'p2p-staged-roster-change'});}};d.defaultView={MiniP2PActivityUi:api,getComputedStyle:()=>({visibility:'visible'})};
 const shell=d.createElement('section');shell.className='mini-p2p-shell';d.body.append(shell);const direct=d.createElement('div');shell.append(direct);
 const peerList=d.createElement('div');peerList.className='mini-p2p-peer-list';direct.append(peerList);
 for(const id of ['sa','sa2']){const row=d.createElement('div');row.className='mini-p2p-peer-row';const badge=d.createElement('span');badge.dataset.rosterPendingPeer=id;badge.textContent=staged.some(item=>item.peerId===id)?'1':'';badge.hidden=!badge.textContent;row.append(badge);peerList.append(row);}
 const other=d.createElement('span');other.className='mini-count-badge';other.textContent='7';peerList.append(other);
 if(staged.length){const native=d.createElement('section');native.className='mini-p2p-activity';const review=d.createElement('button');review.dataset.reviewStaged=staged[0].peerId;review.textContent='Revisar';native.append(review);direct.prepend(native);}
 const context={module:{exports:{}},console,URL,queueMicrotask,HTMLElement:Element,MutationObserver:Observer,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../connection-menu.js'),'utf8'),context);
 const mount=()=>context.module.exports.mount({app:'mini',shell,directBody:direct,internetAvailable:false,getInternet(){throw Error('Unexpected network UI request');},canChange:()=>true,beforeLeaveInternet:()=>true,notify(){},close(){}});
 return {d,shell,direct,api,mount,apply(){d.dispatchEvent({type:'connection-data-applied'});staged=[];},setPending(value){staged=value;d.dispatchEvent({type:'p2p-staged-roster-change'});},flush:()=>new Promise(resolve=>setImmediate(resolve)),mutations:()=>mutations};
}
test('durable pending SA roster is first-class and cloud empty state is not misleading',async()=>{
 const dom=menuDom([{peerId:'sa',peerName:'Synthetic SA',employeeCount:2}]),view=dom.mount();view.show();await dom.flush();
 const review=dom.shell.querySelector('[data-review-staged]');assert.ok(review,'pending roster needs a visible Review action');
 assert.equal(review.closest('.connections-extras'),null);assert.equal(review.closest('[hidden]'),null);
 assert.doesNotMatch(dom.shell.textContent,/No hay cambios por revisar/);review.click();assert.equal(dom.api.reviewed,'sa');view.release();
});
test('background pending refresh is local, stable, disposable and survives reopen; discard updates empty state',async()=>{
 const dom=menuDom(),view=dom.mount();view.show();await dom.flush();
 dom.setPending([{peerId:'sa',peerName:'Synthetic SA',employeeCount:1}]);await dom.flush();
 const review=dom.shell.querySelector('[data-review-staged]');assert.ok(review);review.focus();
 for(let n=0;n<4;n++)dom.setPending([{peerId:'sa',peerName:'Synthetic SA',employeeCount:1}]);await dom.flush();
 assert.equal(dom.shell.querySelector('[data-review-staged]'),review);assert.equal(dom.d.activeElement,review);assert.ok(dom.mutations()<10,'no rebuild observer loop');
 dom.shell.querySelector('[data-discard-staged]').click();await dom.flush();assert.equal(dom.shell.querySelector('[data-review-staged]'),null);assert.match(dom.shell.textContent,/No hay cambios por revisar/);
 view.release();const previous=dom.shell.textContent;dom.setPending([{peerId:'sa',peerName:'Restored',employeeCount:3}]);await dom.flush();assert.equal(dom.shell.textContent,previous);
 const reopened=menuDom(dom.api.stagedList()),fresh=reopened.mount();fresh.show();await reopened.flush();assert.ok(reopened.shell.querySelector('[data-review-staged]'));fresh.release();
});

test('native apply refresh reads cleared staging after the same turn, and release rejects stale async refresh',async()=>{
 const dom=menuDom([{peerId:'sa',peerName:'<img onerror=bad>',employeeCount:1}]),view=dom.mount();view.show();await dom.flush();
 assert.ok(dom.shell.textContent.includes('<img onerror=bad>'));assert.equal(dom.shell.querySelector('img')?.src,undefined);
 dom.apply();await dom.flush();assert.equal(dom.shell.querySelector('[data-staged-rosters]').hidden,true);
 dom.setPending([{peerId:'sa',peerName:'SA',employeeCount:1}]);await dom.flush();
 let finish;dom.api.discardStaged=()=>new Promise(resolve=>{finish=resolve;});
 dom.shell.querySelector('[data-staged-rosters]').querySelector('[data-discard-staged]').click();
 view.release();const before=dom.shell.textContent;finish();await dom.flush();assert.equal(dom.shell.textContent,before);
 assert.equal(dom.d.listeners.get('p2p-staged-roster-change').size,0);assert.equal(dom.d.listeners.get('connection-data-applied').size,0);
});

test('harvested roster badges track each peer after arrival, discard and apply without changing other badges',async()=>{
 const dom=menuDom([{peerId:'sa',employeeCount:1}]),view=dom.mount();view.show();await dom.flush();
 const badge=id=>dom.shell.querySelector('[data-roster-pending-peer="'+id+'"]');
 assert.equal(badge('sa').hidden,false);assert.equal(badge('sa2').hidden,true);
 dom.setPending([{peerId:'sa',employeeCount:1},{peerId:'sa2',employeeCount:2}]);await dom.flush();assert.equal(badge('sa2').hidden,false);
 dom.shell.querySelector('[data-staged-rosters]').querySelector('[data-discard-staged="sa"]').click();await dom.flush();
 assert.equal(badge('sa').hidden,true);assert.equal(badge('sa').textContent,'');assert.equal(badge('sa2').textContent,'1');assert.equal(badge('sa2').hidden,false);
 dom.apply();await dom.flush();assert.equal(badge('sa2').hidden,true);assert.equal(dom.shell.querySelector('.mini-count-badge').textContent,'7');view.release();
});
test('pending action sizing overrides fixed icon widths without shrinking minimum touch targets',()=>{
 const css=require('node:fs').readFileSync(require.resolve('../connection-screens.css'),'utf8');
 const rule=css.match(/\.mini-p2p-shell \.connections-staged-card button \{([^}]+)\}/)[1];
 assert.match(rule,/(?:^|;)width:auto;/);assert.match(rule,/(?:^|;)flex:0 0 auto;/);assert.match(rule,/(?:^|;)min-width:44px;/);assert.match(rule,/(?:^|;)min-height:44px;/);
 const native=require('node:fs').readFileSync(require.resolve('../p2p-roster-ui.js'),'utf8');assert.ok(native.includes('data-roster-pending-peer="${esc(peer.peerId)}"'));
});

test('pending action wrapper spans the shared card grid instead of its 44px icon column',()=>{
 const fs=require('node:fs'),base=fs.readFileSync(require.resolve('../p2p-transfer.css'),'utf8'),css=fs.readFileSync(require.resolve('../connection-screens.css'),'utf8');
 assert.match(base,/\.connections-home \.connections-action-card \{grid-template-columns:44px minmax\(0,1fr\)/);
 const actions=css.match(/\.mini-p2p-shell \.connections-staged-card \.connections-card-actions \{([^}]+)\}/)[1];
 assert.match(actions,/(?:^|;)grid-column:1 \/ -1;/);
});
