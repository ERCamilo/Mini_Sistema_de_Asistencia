// Component acceptance: real Mini modules and native WebRTC, not the full app page.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { X509Certificate, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { browserLaunchReason } = require('./private-turn.browser.cjs');
const ROOT = path.resolve(__dirname, '../..');
const modules = ['p2p-core.js', 'p2p-pairing.js', 'mini-backup-summary.js', 'p2p-backup-bridge.js', 'p2p-backup-consent.js', 'mini-peer-session-manager.js', 'p2p-demand-negotiation.js', 'mini-peer-availability.js', 'connection-menu.js', 'connection-presentation.js', 'mini-notice.js'];
let phase = 'CAPABILITY';
async function main() {
  assert.ok(process.env.PLAYWRIGHT_MODULE); assert.ok(process.env.PRIVATE_TURN_TOOL_OUTPUT);
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  const { startDevServer } = await import(pathToFileURL(path.join(process.env.PRIVATE_TURN_TOOL_OUTPUT, 'dev-server.mjs')).href);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mini-backup-browser-'));
  const devs = [], contexts = []; let browser, upstream, requests = 0, blocked = 0;
  try {
    const keyPath = path.join(temporary, 'own.key'), certPath = path.join(temporary, 'own.crt');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
    const key = await fs.readFile(keyPath), cert = await fs.readFile(certPath);
    const spki = createHash('sha256').update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    upstream = http.createServer((req, res) => {
      assert.equal(req.url, '/turn-creds'); assert.equal(req.method, 'POST'); requests++;
      let body = ''; req.on('data', chunk => { body += chunk; assert.ok(body.length <= 20000); });
      req.on('end', () => { assert.deepEqual(JSON.parse(body), { idToken: 'synthetic-token' }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ username: 'synthetic-user', credential: 'synthetic-password', ttl: 300, expiresAt: Date.now() + 300000, iceServers: [{ urls: 'turn:synthetic.invalid:3478', username: 'synthetic-user', credential: 'synthetic-password' }] })); });
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const fixture = path.join(temporary, 'app'); await fs.mkdir(fixture);
    for (const name of [...modules, 'firebase-field-config.js', 'p2p-transfer.css', 'connection-screens.css', 'mini-notice.css']) await fs.copyFile(path.join(ROOT, name), path.join(fixture, name));
    await fs.writeFile(path.join(fixture, 'index.html'), '<html><meta charset="utf-8"><link rel="stylesheet" href="./p2p-transfer.css"><link rel="stylesheet" href="./connection-screens.css"><link rel="stylesheet" href="./mini-notice.css"><script src="./firebase-field-config.js"></script>' + modules.map(name => '<script src="./' + name + '"></script>').join('') + '<textarea id="restore-backup-textarea"></textarea><section id="modal-restore-backup" hidden></section></html>');
    phase = 'BROWSER_LAUNCH';
    try { browser = await chromium.launch({ chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--ignore-certificate-errors-spki-list=' + spki, '--disable-background-networking'] }); }
    catch (error) { phase += '_' + browserLaunchReason(error); throw new Error('BROWSER_UNAVAILABLE'); }
    const ports = new Set();
    async function pageFor(forceRelay) {
      const dev = await startDevServer({ forwardPort: upstream.address().port, port: 0, tls: { key, cert }, appRoot: fixture, assets: ['index.html', 'firebase-field-config.js', 'p2p-transfer.css', 'connection-screens.css', 'mini-notice.css', ...modules], bootstrap: { enabled: true, appIdentity: 'mini', canonicalRoot: ROOT, contract: { ttlUnit: 'seconds', expiresAtFormat: 'unix-milliseconds' }, forceRelay } });
      devs.push(dev); ports.add(new URL(dev.origin).port);
      const context = await browser.newContext(); contexts.push(context);
      await context.route('**/*', route => { const u = new URL(route.request().url()); if (['127.0.0.1', 'localhost'].includes(u.hostname) && ports.has(u.port)) return route.continue(); blocked++; return route.abort(); });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const listeners = new Set(); window.authNames = [];
        const user = { uid: 'synthetic-user', getIdToken: async () => 'synthetic-token' };
        window.mockAuth = { currentUser: user, onAuthStateChanged(fn) { listeners.add(fn); fn(this.currentUser); return () => listeners.delete(fn); } };
        window.setFixtureAuth = user => { window.mockAuth.currentUser = user; for (const fn of listeners) fn(user); };
        window.setGuest = () => window.setFixtureAuth(null);
        window.firebase = { app(name) { window.authNames.push(name); if (name !== 'mini-field') throw new Error('WRONG_AUTH'); return { auth: () => window.mockAuth }; } };
        window.NativeRtc = window.RTCPeerConnection;
      });
      phase = 'MOCK_PAGE_LOAD'; await page.goto(dev.origin); phase = 'BOOTSTRAP_READY'; await page.waitForFunction(() => !!window.privateTurnTest?.active);
      return page;
    }
    const pages = [await pageFor(false), await pageFor(true)];
    phase = 'PEER_VISUAL_STATES';
    // Use the shipped theme definitions, not colors taught to agree with this test.
    const appHtml = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
    const themeCss = [appHtml.match(/:root\s*\{[\s\S]*?\}/)[0], ...['light', 'contrast', 'ocean', 'sol'].map(theme => appHtml.match(new RegExp('\\[data-theme="' + theme + '"\\]\\s*\\{[\\s\\S]*?\\}'))[0])].join('\n');
    if (process.env.PRIVATE_TURN_H3_ONLY === '1') {
      let tail = Promise.resolve();
      for (let i = 0; i < 2; i++) await pages[i].exposeFunction('h3Bridge', (type, data) => {
        if (type === 'ice' && !data.candidate) return;
        tail = tail.then(() => pages[1-i].evaluate(({type,data}) => window.h3Emit({type:'signal',frame:{v:1,type,data}}), {type,data}));
        return tail;
      });
      for (const [i,page] of pages.entries()) await page.evaluate(i => {
        window.setGuest(); window.h3Count = 0; window.h3Messages = []; window.h3States = [];
        const listeners = new Set();
        window.h3Emit = event => { for (const fn of listeners) fn(event); };
        window.h3Owner = window.MiniPeerAvailability.create({
          localPeerId: 'h3-'+i, remotePeerId: 'h3-'+(1-i), setupTimeoutMs: 2000,
          signaling: { connect: async()=>{}, onEvent(fn){listeners.add(fn);return()=>listeners.delete(fn);},send(type,data){void window.h3Bridge(type,data);},close(){} },
          validateFrame: window.SaMiniP2P.validateSignalFrameObject,
          onState(state){window.h3States.push(state);},
          async createSession(options) {
            window.h3Count++;
            if(window.h3Hold) await new Promise(resolve=>{window.h3Release=resolve;});
            return window.SaMiniP2P.createRtcSession({...options,iceServers:[],onChannel(channel){
              window.h3Channel=channel;
              // Component-only readiness: native open, not production trusted authentication.
              options.onReady();
              channel.addEventListener('message',()=>window.h3Messages.push('received'));
            }});
          }
        });
        return window.h3Owner.start();
      }, i);
      for(const role of [0,1]) {
        phase='H3_HELD_ANSWERER_ROLE_'+role;
        await pages[1-role].evaluate(()=>{window.h3Hold=true;});
        await pages[role].evaluate(()=>window.h3Owner.demand());
        await pages[1-role].waitForFunction(()=>!!window.h3Release);
        await pages[1-role].evaluate(()=>{window.h3Owner.retire();window.h3Hold=false;window.h3Release();window.h3Release=null;});
        await pages[role].waitForFunction(()=>window.h3Owner.getSession()===null);
        for(const page of pages) assert.equal(await page.evaluate(()=>window.h3Owner.getSession()===null),true);
        const before=await Promise.all(pages.map(page=>page.evaluate(()=>window.h3Count)));
        await new Promise(resolve=>setTimeout(resolve,50));
        assert.deepEqual(await Promise.all(pages.map(page=>page.evaluate(()=>window.h3Count))),before);
        phase='H3_EXPLICIT_RETRY_ROLE_'+role;
        await pages[role].evaluate(()=>window.h3Owner.demand());
        for(const page of pages) await page.waitForFunction(()=>{
          const session=window.h3Owner.getSession();
          return session?.pc instanceof window.NativeRtc&&session.pc.connectionState==='connected'&&session.channel===window.h3Channel&&session.channel?.readyState==='open';
        });
        phase='H3_BIDIRECTIONAL_MESSAGES_ROLE_'+role;
        for(const page of pages)await page.evaluate(()=>{window.h3Messages=[];});
        for(const page of pages)await page.evaluate(()=>{
          const session=window.h3Owner.getSession();
          if(!session||session.channel!==window.h3Channel||session.channel.readyState!=='open')throw new Error('H3_CURRENT_CHANNEL_REQUIRED');
          for(let n=0;n<3;n++)session.channel.send('synthetic');
        });
        for(const page of pages)await page.waitForFunction(()=>{
          const session=window.h3Owner.getSession();
          return session?.channel===window.h3Channel&&session.channel?.readyState==='open'&&window.h3Messages.length===3;
        });
        console.log(JSON.stringify({scope:'native-direct-component',role,phase:'bidirectional-messages',messagesEachWay:3}));
        phase='H3_SELECTED_PAIR_ROLE_'+role;
        const pairs=[];
        for(const page of pages) {
          const measured=await page.waitForFunction(async()=>{
            const session=window.h3Owner.getSession();
            if(!(session?.pc instanceof window.NativeRtc)||session.pc.connectionState!=='connected'||session.channel!==window.h3Channel||session.channel?.readyState!=='open')return false;
            const stats=await session.pc.getStats();
            if(window.h3Owner.getSession()!==session)return false;
            for(const transport of stats.values()) {
              if(transport.type!=='transport'||!transport.selectedCandidatePairId)continue;
              const pair=stats.get(transport.selectedCandidatePairId);
              if(pair?.type!=='candidate-pair'||pair.state!=='succeeded')continue;
              const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
              // https://www.w3.org/TR/webrtc/#rtcicecandidatetype-enum
              if(local?.type==='local-candidate'&&local.candidateType==='host'&&remote?.type==='remote-candidate'&&['host','prflx'].includes(remote.candidateType))return {state:pair.state,local:local.candidateType,remote:remote.candidateType};
            }
            return false;
          });
          try { pairs.push(await measured.jsonValue()); } finally { await measured.dispose(); }
        }
        console.log(JSON.stringify({scope:'native-direct-component',role,phase:'selected-pair',pairs}));
        for(const pair of pairs) {
          assert.equal(pair.state,'succeeded');
          assert.equal(pair.local,'host');
          assert.ok(['host','prflx'].includes(pair.remote));
        }
        console.log(JSON.stringify({scope:'native-direct-component',role,expiredToStandby:true,freshRetry:true,pairs,messagesEachWay:3}));
        for(const page of pages)await page.evaluate(()=>{window.h3Owner.retire();window.h3Channel=null;window.h3Messages=[];});
        await tail;
      }
      for(const page of pages)await page.evaluate(()=>window.h3Owner.stop());
      assert.equal(requests,0);assert.equal(blocked,0);
      console.log('mini-backup-browser:h3-pass:both-ID-roles:deadline-standby:explicit-retry:native-direct-component:no-ICE-servers:not-live-TURN');return;
    }
    if (process.env.PRIVATE_TURN_INBOX_ONLY === '1') {
      phase = 'PRODUCTION_INBOX_AUTH_RESTORE';
      const ui = await fs.readFile(path.join(ROOT, 'p2p-roster-ui.js'), 'utf8');
      const section = (start, end) => { const a = ui.indexOf(start), b = ui.indexOf(end, a); assert.ok(a >= 0 && b > a); return ui.slice(a, b); };
      // Execute the shipped receiver functions, not a substitute helper receiver.
      const receiverSource = section('const backupReceiverCleanups', 'function isTransferModalOpen') + section('const MINI_BACKUP_BACKOFF_MS', '// A live lease') + section('async function startMiniBackupInbox', 'async function startPassiveInbox') + section('async function stageReceivedBackup', '// ---- Received Mini backup review');
      let inboxTail = Promise.resolve();
      for (let i = 0; i < 2; i++) await pages[i].exposeFunction('productionInboxBridge', (type, data) => {
        if (type === 'ice' && !data.candidate) return;
        inboxTail = inboxTail.then(() => pages[1-i].evaluate(({type,data}) => window.productionInboxSignal({type:'signal',frame:{v:1,type,data}}), {type,data}));
        return inboxTail;
      });
      for (const [i, page] of pages.entries()) {
        await page.addStyleTag({content:themeCss});
        await page.evaluate(({i, receiverSource}) => {
          window.setGuest();
          document.body.insertAdjacentHTML('afterbegin', '<main data-fixture-attendance><h1>Asistencia — fixture sintético</h1></main>');
          window.data = {schemaVersion:1,users:[{id:'synthetic-employee',name:'Synthetic employee'}],attendance:{'2026-10-01':{'synthetic-employee':{checkIn:'08:00'}}},requests:[]};
          window.beforeData = JSON.stringify(window.data); window.buildMiniBackupData = () => window.data;
          window.inboxSignals=[]; window.inboxFactories=0; window.inboxRtcStates=[]; window.inboxSessions=[];
          const self={deviceId:'production-inbox-'+i,appType:'mini',displayName:'Synthetic Mini '+i};
          const peer={peerId:'production-inbox-'+(1-i),peerApp:'mini',displayName:'Synthetic Mini '+(1-i),purpose:'backup',linkToken:'A'.repeat(43)};
          const core={...window.SaMiniP2P,createRtcSession:async options=>{window.inboxFactories++;const session=await window.SaMiniP2P.createRtcSession({...options,iceServers:[],onState:(state,error)=>{window.inboxRtcStates.push({state,error:!!error});options.onState?.(state,error);}});window.inboxSessions.push(session);return session;},SignalingClient:class {
            constructor(){this.listeners=new Set();this.closed=false;window.inboxSignals.push(this);} async connect(){this.closed=false;} onEvent(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);} send(type,data){void window.productionInboxBridge(type,data);} close(){this.closed=true;} emit(event){for(const fn of this.listeners)fn(event);}
          }};
          window.productionInboxSignal=event=>{for(const signal of window.inboxSignals)if(!signal.closed)signal.emit(event);};
          const identityStore={getSelf:async()=>self,getPeer:async()=>peer,listPeers:async()=>[peer],savePeer:async value=>value};
          const root=window,pairing=window.SaMiniP2PPairing;
          const isNetworkOnline=()=>true,peerName=value=>value.displayName||'Synthetic Mini';
          let activeTransferPeerId=null; const refreshMiniP2PHeader=async()=>{},recordP2PActivity=()=>{},signalTerminalSuccess=()=>{},boundedUserSafeError=()=> 'Synthetic transfer failed';
          // These unused navigation dependencies deliberately cannot restore data.
          const toast=()=>{},renderError=()=>{},renderBackupReview=async()=>{},body=()=>null,isTransferModalOpen=()=>false;
          const activeManualPeerId=null;
          eval(receiverSource + '; window.productionInbox={start:startMiniBackupInbox,reconnect:reconnectMiniBackupPeer,close:closeMiniBackupConnection,stop:stopAllMiniBackupListeners,listeners:miniBackupListeners,peer};');
        },{i,receiverSource});
        phase='PRODUCTION_INBOX_BOOT_'+i;
        await page.evaluate(()=>window.productionInbox.start());
        await page.waitForFunction(()=>window.productionInbox.listeners.size===1);
      }
      for(const page of pages)assert.equal(await page.evaluate(()=>window.inboxFactories),0);
      // A delayed callback simulates persisted account restoration after standby boot.
      phase='PRODUCTION_INBOX_DELAYED_HYDRATION';
      await pages[1].evaluate(()=>{window.inboxBefore=window.inboxSignals.length;window.setFixtureAuth({uid:'synthetic-restored',getIdToken:async()=>{throw new Error('NO_REAL_TOKEN');}});});
      await pages[1].waitForFunction(()=>window.inboxSignals.length>window.inboxBefore&&window.productionInbox.listeners.size===1);
      // Actual hydration is proven above; use guest transport to keep native ICE host-only.
      await pages[1].evaluate(()=>{window.inboxBefore=window.inboxSignals.length;window.setGuest();});
      await pages[1].waitForFunction(()=>window.inboxSignals.length>window.inboxBefore&&window.productionInbox.listeners.size===1);
      assert.equal(await pages[1].evaluate(()=>window.inboxFactories),0);
      async function transferOutsideMenu() {
        phase='PRODUCTION_ATTENDANCE_CONNECT';
        await Promise.race([pages[0].evaluate(()=>window.productionInbox.reconnect(window.productionInbox.peer.peerId)), new Promise((_,reject)=>setTimeout(()=>reject(new Error('INBOX_CONNECT_DEADLINE')),20000))]);
        phase='PRODUCTION_ATTENDANCE_AUTHENTICATED_CHANNELS';
        for(const page of pages)await page.waitForFunction(()=>[...window.productionInbox.listeners.values()].some(entry=>entry.authenticated&&entry.channel?.readyState==='open'));
        phase='PRODUCTION_ATTENDANCE_VISIBLE_NOTICE';
        const sending=pages[0].evaluate(async()=>{
          const entry=[...window.productionInbox.listeners.values()][0],bridge=window.SaMiniP2PBackup,core=window.SaMiniP2P,payload=await bridge.createMiniBackupPayload();
          const decision=await window.P2PBackupConsent.requestConsent(entry.channel,core,{offerId:window.P2PBackupConsent.createOfferId(),schema:'mini-backup/v1',size:payload.size,senderName:'Synthetic sender'},{timeoutMs:15000});
          if(decision!=='accepted')throw new Error('CONSENT_NOT_ACCEPTED');
          await bridge.sendBackupOnChannel(entry.channel,{bytes:payload.bytes,schema:'mini-backup/v1',timeoutMs:15000});return true;
        });
        await pages[1].getByRole('button',{name:'Aceptar',exact:true}).waitFor({state:'visible',timeout:15000});
        assert.equal(await pages[1].locator('[data-connections-home],.mini-p2p-shell').count(),0);
        await pages[1].getByRole('button',{name:'Aceptar',exact:true}).click();assert.equal(await sending,true);
        assert.deepEqual(await pages[1].evaluate(()=>({attendance:!!document.querySelector('[data-fixture-attendance]'),staged:window.SaMiniP2PBackup.backupStagedStore.listStaged().length,unchanged:JSON.stringify(window.data)===window.beforeData})),{attendance:true,staged:1,unchanged:true});
      }
      phase='PRODUCTION_ATTENDANCE_NOTICE_AND_STAGE';await transferOutsideMenu();
      await pages[1].evaluate(()=>window.productionInbox.close(window.productionInbox.peer.peerId));
      for(const page of pages)await page.waitForFunction(()=>[...window.productionInbox.listeners.values()].every(entry=>!entry.lease));
      phase='PRODUCTION_ATTENDANCE_REPEAT_AFTER_CLOSE';await transferOutsideMenu();
      for(const page of pages)await page.evaluate(()=>window.productionInbox.stop());
      assert.equal(requests,0);assert.equal(blocked,0);
      console.log('mini-backup-browser:production-inbox-pass:two-contexts:isolated-attendance-screen:no-connections-menu:auth-restoration:visible-MiniNotice:accepted-and-staged:repeat-after-close:no-auto-restore:no-external-requests:host-only-not-live-TURN');return;
    }
    for (const page of pages) {
      await page.addStyleTag({ content: themeCss + '\nbody { margin: 16px; background: var(--bg-color); color: var(--text-color); font-family: sans-serif; }' });
      await page.evaluate(() => {
        const container = document.createElement('section'); document.body.append(container); window.visualContainer = container;
        window.visualPeers = ['available', 'connecting', 'connected', 'error'].map(state => ({ peerId: state, name: 'Synthetic Mini — ' + state, state, authenticated: state === 'connected', channelOpen: state === 'connected', leaseValid: state === 'connected' }));
        window.visualUi = window.MiniConnectionPresentation.mountPeers({ container, getPeers: () => window.visualPeers, subscribe: () => () => {}, connect: async () => {}, close() {}, notify() {} });
      });
      for (const width of [390, 1000]) for (const theme of ['dark', 'light', 'contrast', 'ocean', 'sol']) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        const result = await page.evaluate(() => {
          const color = value => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const c = canvas.getContext('2d'); c.fillStyle = value; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); };
          const lum = rgb => rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
          const contrast = (a, b) => { const x = lum(color(a)), y = lum(color(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
          return [...window.visualContainer.children].map(row => {
            const badge = row.querySelector('.connections-mini-peer-state'), style = getComputedStyle(badge), bounds = badge.getBoundingClientRect(), card = row.getBoundingClientRect();
            return { state: row.dataset.state, label: badge.textContent, icon: badge.querySelector('svg').dataset.peerStateIcon, accessible: badge.getAttribute('role') === 'status' && badge.querySelector('svg').getAttribute('aria-hidden') === 'true', contrast: contrast(style.color, style.backgroundColor), fits: bounds.left >= card.left && bounds.right <= card.right, touch: [...row.querySelectorAll('button')].every(button => button.getBoundingClientRect().height >= 44) };
          });
        });
        assert.deepEqual(result.map(x => [x.state, x.label, x.icon]), [['available', 'Disponible', 'unlink'], ['connecting', 'Conectando', 'clock'], ['connected', 'Conectado', 'check'], ['error', 'Error', 'warning']]);
        for (const row of result) { assert.ok(row.accessible && row.fits && row.touch, 'visual geometry ' + theme + '/' + row.state + ' ' + JSON.stringify({accessible:row.accessible,fits:row.fits,touch:row.touch})); assert.ok(row.contrast >= 4.5, theme + '/' + row.state + ' badge contrast ' + row.contrast); }
      }
      assert.deepEqual(await page.evaluate(() => {
        const row = window.visualContainer.querySelector('[data-mini-peer="connected"]'), button = row.querySelector('button'); button.focus();
        window.visualPeers[2].channelOpen = false; window.visualUi.refresh();
        return { state: row.dataset.state, label: row.querySelector('.connections-mini-peer-state').textContent, hint: row.querySelector('.connections-hint').textContent.includes('Sin conexión activa'), focused: document.activeElement === button, sameButton: row.querySelector('button') === button };
      }), { state: 'available', label: 'Disponible', hint: true, focused: true, sameButton: true });
      await page.evaluate(() => { window.visualUi.dispose(); window.visualContainer.remove(); });
    }
    if (process.env.PRIVATE_TURN_VISUAL_ONLY === '1') {
      assert.equal(requests, 0); assert.equal(blocked, 0);
      console.log('mini-backup-browser:visual-pass:two-contexts:mobile-desktop:five-project-themes:four-states:contrast>=4.5:no-credential-requests:no-external-requests'); return;
    }
    phase = 'SIGNED_POLICY';
    for (let i = 0; i < pages.length; i++) {
      const before = requests;
      phase = 'SIGNED_FACTORY_' + i; const result = await pages[i].evaluate(async () => {
        let config; window.RTCPeerConnection = class { constructor(value) { config = value; } close() {} };
        const session = await window.SaMiniP2P.createRtcSession({ initiator: false, signaling: { expiresAt: null, onEvent: () => () => {}, connect: async () => {}, send() {}, close() {} } }); session.close();
        window.RTCPeerConnection = window.NativeRtc; window.setGuest();
        const make = () => new Map([['transport', { id: 'transport', type: 'transport', dtlsState: 'connected', selectedCandidatePairId: 'pair' }], ['pair', { id: 'pair', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'local', remoteCandidateId: 'remote' }], ['local', { id: 'local', type: 'local-candidate', candidateType: 'relay' }], ['remote', { id: 'remote', type: 'remote-candidate', candidateType: 'relay' }]]);
        const selected = await window.PrivateTurnBootstrap.verifySelectedRelay({ connectionState: 'connected', getStats: async () => make() });
        const gathered = make(); delete gathered.get('transport').selectedCandidatePairId;
        const gatheredOnly = await window.PrivateTurnBootstrap.verifySelectedRelay({ connectionState: 'connected', getStats: async () => gathered });
        return { policy: config.iceTransportPolicy, servers: config.iceServers.length, namedAuth: window.authNames.every(name => name === 'mini-field'), selected, gatheredOnly };
      });
      phase = 'SIGNED_ASSERT_' + i; assert.deepEqual(result, { policy: i ? 'relay' : 'all', servers: 1, namedAuth: true, selected: true, gatheredOnly: false }); assert.equal(requests - before, 1);
    }
    const demandProof = { unilateralRoles: [], simultaneous: false, retirementWake: false, oneSidedRetirementWake: false };
    let demandMode = 'live', held = [], demandTail = Promise.resolve();
    let demandCounts = { offer: 0, answer: 0, ice: 0 };
    async function deliverDemand(message) {
      await pages[1 - message.i].evaluate(({ type, data }) => window.demandEvent({ type: 'signal', frame: { v: 1, type, data } }), message);
    }
    function queueDemand(message) {
      demandTail = demandTail.then(() => deliverDemand(message));
      return demandTail;
    }
    for (let i = 0; i < 2; i++) await pages[i].exposeFunction('demandBridge', async (type, data) => {
      if (type === 'ice' && !data.candidate) return;
      demandCounts[type]++;
      const message = { i, type, data };
      if (demandMode === 'live') return queueDemand(message);
      held.push(message);
      if (demandMode !== 'collect-offers' || held.filter(row => row.type === 'offer').length !== 2) return;
      demandMode = 'deliver-offers';
      const states = await Promise.all(pages.map(page => page.evaluate(() => window.demandOwner.getSession().pc.signalingState)));
      assert.deepEqual(states, ['have-local-offer', 'have-local-offer']);
      const offers = held.filter(row => row.type === 'offer');
      held = held.filter(row => row.type !== 'offer');
      // Hold every answer and candidate until BOTH offers reach the receivers.
      await Promise.all(offers.map(deliverDemand));
      demandMode = 'live';
      const pending = held; held = [];
      for (const row of pending) queueDemand(row);
      await demandTail;
    });
    for (let i = 0; i < 2; i++) await pages[i].evaluate(async i => {
      window.demandCalls = 0; window.demandLeaseClock = 0; window.demandErrors = []; window.demandMessages = [];
      const listeners = new Set();
      const signal = { connect: async () => {}, onEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }, send(type, data) { void window.demandBridge(type, data); }, close() {} };
      window.demandEvent = event => { for (const fn of listeners) fn(event); };
      window.demandOwner = window.MiniPeerAvailability.create({ signaling: signal, localPeerId: 'demand-' + i, remotePeerId: 'demand-' + (1 - i), validateFrame: window.SaMiniP2P.validateSignalFrameObject,
        createSession: async options => {
          const generation = ++window.demandCalls, startedAt = window.demandLeaseClock;
          let session; session = await window.SaMiniP2P.createRtcSession({ ...options, iceServers: [], onState(state) { if (state === 'error') window.demandErrors.push(generation); if (['error', 'disconnected', 'failed', 'closed'].includes(state) && session && window.demandOwner.getSession() === session) window.demandLease?.retire(); }, onChannel(channel) { window.demandChannel = channel; window.demandLease.ready(channel); options.onReady(); channel.addEventListener('message', event => window.demandMessages.push(event.data)); } });
          window.demandLease = window.MiniPeerSessionManager.create({ now: () => window.demandLeaseClock, schedule: () => ({}), cancel() {} }).lease(session, startedAt, () => window.demandOwner.retire(), { transportOwnedExternally: true });
          return session;
        }
      });
      await window.demandOwner.start();
    }, i);
    for (const page of pages) assert.equal(await page.evaluate(() => window.demandCalls), 0);
    async function assertDemandChannel(expectedCalls) {
      try {
        for (const page of pages) await page.waitForFunction(() => window.demandChannel?.readyState === 'open' || window.demandErrors.includes(window.demandCalls), null, { timeout: 15000 });
      } catch (error) {
        const endpoints = await Promise.all(pages.map(page => page.evaluate(async () => {
          const session = window.demandOwner.getSession(), pc = session?.pc;
          const stats = pc ? await pc.getStats() : new Map();
          let localCandidates = 0, remoteCandidates = 0;
          stats.forEach(row => { if (row.type === 'local-candidate') localCandidates++; if (row.type === 'remote-candidate') remoteCandidates++; });
          return { factories: window.demandCalls, errors: window.demandErrors.filter(g => g === window.demandCalls).length, retiredErrors: window.demandErrors.filter(g => g !== window.demandCalls).length, connection: pc?.connectionState, ice: pc?.iceConnectionState, gathering: pc?.iceGatheringState, signaling: pc?.signalingState, channel: session?.channel?.readyState, localDescription: !!pc?.localDescription, remoteDescription: !!pc?.remoteDescription, localCandidates, remoteCandidates };
        })));
        console.error(JSON.stringify({ scope: 'synthetic-native-demand-counterexample', phase, frameCounts: demandCounts, bufferedFrames: held.length, endpoints }));
        throw error;
      }
      for (const page of pages) {
        const result = await page.evaluate(() => ({ calls: window.demandCalls, errors: window.demandErrors.filter(g => g === window.demandCalls).length, open: window.demandChannel?.readyState }));
        if (result.calls !== expectedCalls || result.errors || result.open !== 'open') console.error(JSON.stringify({ scope: 'synthetic-native-demand-assertion', phase, expectedCalls, result, frameCounts: demandCounts }));
        assert.deepEqual(result, { calls: expectedCalls, errors: 0, open: 'open' });
      }
      for (let i = 0; i < 2; i++) await pages[i].evaluate(i => Promise.all([0, 1, 2].map(index => window.demandLease.run(async channel => { if (channel !== window.demandChannel) throw new Error('DEMAND_CHANNEL_REPLACED'); channel.send('demand-' + i + '-' + index); }))), i);
      try { for (const page of pages) await page.waitForFunction(() => window.demandMessages.length === 3); } catch (error) { console.error(JSON.stringify({scope:'synthetic-native-demand-message-count',phase,endpoints:await Promise.all(pages.map(page=>page.evaluate(()=>({messages:window.demandMessages.length,factories:window.demandCalls,active:!!window.demandOwner.getSession(),channel:window.demandChannel?.readyState}))))}));throw error; }
    }
    for (const role of [0, 1]) {
      phase = 'NATIVE_UNILATERAL_DEMAND_' + role;
      await pages[role].evaluate(() => window.demandOwner.demand().then(() => true));
      await assertDemandChannel(role + 1); demandProof.unilateralRoles.push(role);
      await demandTail;
      for (const page of pages) await page.evaluate(() => { window.demandOwner.retire(); window.demandChannel = null; window.demandMessages = []; });
    }
    demandProof.retirementWake = true;
    phase = 'NATIVE_SIMULTANEOUS_DEMAND';
    demandMode = 'collect-offers'; demandCounts = { offer: 0, answer: 0, ice: 0 };
    await Promise.all(pages.map(page => page.evaluate(() => window.demandOwner.demand().then(() => true))));
    await assertDemandChannel(3); demandProof.simultaneous = true;
    await demandTail;
    phase = 'NATIVE_ONE_SIDED_RETIREMENT_WAKE';
    for (const page of pages) await page.evaluate(() => { window.demandChannel = null; window.demandMessages = []; });
    assert.equal(await pages[0].evaluate(() => { window.demandLeaseClock = 300000; return window.demandLease.valid(); }), false);
    for (const page of pages) await page.waitForFunction(() => window.demandOwner.getSession() === null);
    for (const page of pages) assert.equal(await page.evaluate(() => window.demandCalls), 3);
    await pages[0].evaluate(() => window.demandOwner.demand().then(() => true));
    await assertDemandChannel(4); demandProof.oneSidedRetirementWake = true;
    for (const page of pages) await page.evaluate(() => window.demandOwner.stop());
    phase = 'MINI_PAIRING';
    const connected = new Set();
    for (let i = 0; i < 2; i++) await pages[i].exposeFunction('signalBridge', async (type, data) => {
      if (type === 'connect') { connected.add(i); if (connected.size === 2) for (const page of pages) await page.evaluate(() => window.signalEvent({ type: 'ready', peerCount: 2 })); return; }
      if (type === 'ice' && !data.candidate) return;
      await pages[1 - i].evaluate(({ type, data }) => window.signalEvent({ type: 'signal', frame: { v: 1, type, data } }), { type, data });
    });
    const descriptor = await pages[0].evaluate(async () => {
      const core = window.SaMiniP2P;
      const descriptor = await core.makePairDescriptor({ deviceId: 'mini-1', appType: 'mini', displayName: 'Synthetic Mini 1' });
      return core.decodePairDescriptor(core.encodePairDescriptor(descriptor), { allowSameApp: true });
    });
    // Receiver's subscription is installed before the initiator can publish any SDP.
    for (const i of [1, 0]) await pages[i].evaluate(async ({ i, descriptor }) => {
      const core = window.SaMiniP2P;
      window.failure = false; window.saved = []; window.stageStore = window.SaMiniP2PBackup.createBackupStagingStore();
      window.data = { schemaVersion: 1, exportedAt: '2026-09-15T00:00:00Z', users: [{ id: 'synthetic-employee', name: i === 0 ? 'Synthetic sender employee' : 'Existing receiver employee' }], attendance: { '2026-09-15': { 'synthetic-employee': { checkIn: '08:00' } } }, requests: [] };
      window.beforeData = JSON.stringify(window.data); window.buildMiniBackupData = () => window.data;
      const store = { async savePeer(peer, options) { if (!options.allowSameApp || peer.peerApp !== 'mini' || peer.purpose !== 'backup') throw new Error('WRONG_PURPOSE'); window.saved.push(peer); return peer; } };
      window.session = await core.createRtcSession({ initiator: i === 0, iceServers: [], signaling: { expiresAt: null, onEvent(fn) { window.signalEvent = fn; return () => {}; }, connect: () => window.signalBridge('connect'), send(type, data) { void window.signalBridge(type, data).catch(() => { window.failure = true; }); }, close() {} }, onChannel(channel) {
        window.channel = channel; window.offerInbox = window.P2PBackupConsent.bufferOffers(channel, core);
        window.pairing = window.SaMiniP2PPairing.attachPairing(channel, { self: { deviceId: 'mini-' + (i + 1), appType: 'mini', displayName: 'Synthetic Mini ' + (i + 1) }, descriptor, initiator: i === 0, store, allowSameApp: true, onCandidate: candidate => { window.candidate = candidate; }, onLinked: peer => { window.peer = peer; }, onError: () => { window.failure = true; } });
      } });
    }, { i, descriptor });
    for (const page of pages) await page.waitForFunction(() => !!window.candidate || window.failure, null, { timeout: 20000 });
    assert.equal(await pages[0].evaluate(() => window.candidate.sas), await pages[1].evaluate(() => window.candidate.sas));
    for (const page of pages) await page.evaluate(() => window.candidate.accept());
    for (const page of pages) { await page.waitForFunction(() => !!window.peer || window.failure); assert.deepEqual(await page.evaluate(() => ({ failed: window.failure, authenticated: window.SaMiniP2P.isChannelAuthenticated(window.channel), purpose: window.peer.purpose, app: window.peer.peerApp, connected: window.session.pc.connectionState })), { failed: false, authenticated: true, purpose: 'backup', app: 'mini', connected: 'connected' }); }
    for (const page of pages) await page.evaluate(() => {
      window.leaseClock = 0;
      window.sharedLease = window.MiniPeerSessionManager.create({ now: () => window.leaseClock }).lease(window.session, 0, () => { window.leaseRetired = true; });
      window.sharedLease.ready(window.channel);
      window.originalChannel = window.channel;
    });
    phase = 'NATIVE_MENU_FOCUS';
    for (const page of pages) {
      await page.evaluate(() => {
        const container=document.createElement('section');document.body.append(container);window.peerUiAlias='<script>not executable</script>';
        window.peerUi=window.MiniConnectionPresentation.mountPeers({container,getPeers:()=>[{peerId:window.peer.peerId,name:window.peerUiAlias,state:'connected',authenticated:window.SaMiniP2P.isChannelAuthenticated(window.channel),channelOpen:window.channel.readyState==='open',leaseValid:window.sharedLease.valid()}],subscribe:()=>()=>{},connect:async()=>{},close(){},notify(){}});
        window.peerUiConnect=container.querySelector('[data-mini-peer-connect]');window.peerUiConnect.focus();window.peerUiAlias='Updated device alias';window.peerUi.refresh();
        window.peerUiResult={focused:document.activeElement===window.peerUiConnect,sameButton:container.querySelector('[data-mini-peer-connect]')===window.peerUiConnect,state:container.querySelector('.connections-mini-peer-state').textContent,name:container.querySelector('strong').textContent,scriptNodes:container.querySelectorAll('script').length,touchMinimum:window.peerUiConnect.getBoundingClientRect().height>=44};
      });
      assert.deepEqual(await page.evaluate(()=>window.peerUiResult),{focused:true,sameButton:true,state:'Conectado',name:'Updated device alias',scriptNodes:0,touchMinimum:true});
      await page.evaluate(()=>window.peerUi.dispose());
    }
    phase = 'CONSENT_DECLINE';
    for (const page of pages) await page.evaluate(() => { window.acceptOffer = false; window.offerInbox.release((offer, reply) => {
      if (window.acceptOffer) {
        const core = window.SaMiniP2P, bridge = window.SaMiniP2PBackup;
        const receiver = core.createTransferReceiver({ channel: window.channel, onError: () => { window.failure = true; }, onComplete(result) { const staged = window.stageStore.stageBackup({ ...result, sourceApp: 'mini', sourcePeerId: window.peer.peerId, sourcePeerName: window.peer.displayName }); bridge.sendBackupStagedAck(window.channel, { transferId: result.transferId, sha256: result.sha256, schema: result.schema }); } });
        let finished = false;
        const handler = async event => {
          if (core.parseControl(event.data)) return;
          if (typeof event.data === 'string') { const meta = JSON.parse(event.data); if (meta.type === 'start' && !window.P2PBackupConsent.matchesOffer(offer, meta)) { window.failure = true; return; } if (meta.type === 'end') finished = true; }
          await receiver(event); if (finished) window.channel.removeEventListener('message', handler);
        };
        window.channel.addEventListener('message', handler);
      }
      reply(window.acceptOffer);
    }); });
    async function sendBackup(from = 0) { return pages[from].evaluate(async () => window.sharedLease.run(async channel => {
      if (channel !== window.originalChannel) throw Error('CHANNEL_REPLACED');
      const core = window.SaMiniP2P, bridge = window.SaMiniP2PBackup;
      const payload = await bridge.createMiniBackupPayload(); window.payload = payload;
      const decision = await window.P2PBackupConsent.requestConsent(window.channel, core, { offerId: window.P2PBackupConsent.createOfferId(), schema: 'mini-backup/v1', size: payload.size, senderName: 'Synthetic Mini 1' }, { timeoutMs: 10000 });
      if (decision !== 'accepted') return { decision, sent: false };
      await bridge.sendBackupOnChannel(window.channel, { bytes: payload.bytes, schema: 'mini-backup/v1', timeoutMs: 10000 });
      return { decision, sent: true, size: payload.size, sha256: payload.sha256, expectedText: payload.json };
    })); }
    assert.deepEqual(await sendBackup(), { decision: 'declined', sent: false });
    assert.deepEqual(await pages[1].evaluate(() => ({ count: window.stageStore.getPendingCount(), unchanged: JSON.stringify(window.data) === window.beforeData })), { count: 0, unchanged: true });
    phase = 'CONSENT_ACCEPT_AND_STAGE'; await pages[1].evaluate(() => { window.acceptOffer = true; }); const sent = await sendBackup();
    assert.equal(sent.decision, 'accepted'); assert.equal(sent.sent, true);
    phase = 'EXPLICIT_REVIEW_NO_RESTORE';
    const proof = await pages[1].evaluate(expectedText => {
      const bridge = window.SaMiniP2PBackup, staged = window.stageStore.listStaged()[0]; window.openedModal = null;
      window.openModal = id => { window.openedModal = id; }; window.validateRestoreTextarea = () => { window.validationRequested = true; };
      const review = bridge.reviewStagedBackupInMini(staged);
      return { count: window.stageStore.getPendingCount(), schema: staged.schema, sourceApp: staged.sourceApp, sha256: staged.sha256, size: staged.size, exact: review.text === expectedText, textareaExact: document.getElementById('restore-backup-textarea').value === review.text, modal: window.openedModal, validationRequested: window.validationRequested, unchanged: JSON.stringify(window.data) === window.beforeData, failed: window.failure };
    }, sent.expectedText);
    assert.deepEqual(proof, { count: 1, schema: 'mini-backup/v1', sourceApp: 'mini', sha256: sent.sha256, size: sent.size, exact: true, textareaExact: true, modal: 'modal-restore-backup', validationRequested: true, unchanged: true, failed: false });
    phase = 'REPEATED_CONSENT_ACCEPT_AND_STAGE';
    for (let attempt = 0; attempt < 2; attempt++) {
      const repeated = await sendBackup();
      assert.equal(repeated.decision, 'accepted'); assert.equal(repeated.sent, true);
    }
    assert.deepEqual(await pages[1].evaluate(() => ({ count: window.stageStore.getPendingCount(), unchanged: JSON.stringify(window.data) === window.beforeData, failed: window.failure })), { count: 1, unchanged: true, failed: false });
    phase = 'BIDIRECTIONAL_REUSE';
    await pages[0].evaluate(() => { window.acceptOffer = true; });
    for (let attempt = 0; attempt < 3; attempt++) {
      const repeated = await sendBackup(1);
      assert.equal(repeated.decision, 'accepted'); assert.equal(repeated.sent, true);
    }
    for (const page of pages) assert.deepEqual(await page.evaluate(() => ({ sameChannel: window.channel === window.originalChannel, connected: window.session.pc.connectionState, authenticated: window.SaMiniP2P.isChannelAuthenticated(window.channel) })), { sameChannel: true, connected: 'connected', authenticated: true });
    phase = 'FIXED_LEASE_EXPIRY';
    for (const page of pages) {
      assert.equal(await page.evaluate(() => { window.leaseClock = 300000; return window.sharedLease.valid(); }), false);
      assert.equal(await page.evaluate(() => window.leaseRetired === true), true);
    }
    assert.equal(requests, 2); assert.equal(blocked, 0);
    for (const page of pages) await page.evaluate(() => { window.offerInbox.detach(); window.pairing.detach(); window.session.close(); window.privateTurnTest.dispose(); });
    console.log(JSON.stringify({ scope: 'production-module-component-fixture', independentMiniContexts: 2, sameAppBackupPairing: true, consentDeclineUnchanged: true, nativeHostBackupTransfers: 6, sharedBidirectionalLease: true, nativeSimultaneousDemand: demandProof.simultaneous, nativeDemandRoles: demandProof.unilateralRoles, retirementWake: demandProof.retirementWake, oneSidedRetirementWake: demandProof.oneSidedRetirementWake, managedLeaseExpiryWake: true, bilateralRetirementStandby: true, nativeMenuFocusPreserved: true, managedLeaseMessagesEachDirection: 3, fixedLeaseExpiry: true, stagingAck: true, explicitReviewNoRestore: true, mockSignedPolicies: ['all', 'relay'], controlledMockSelectedRelay: true, externalRequests: 0, liveTurnProof: false }));
  } catch(error) { if(process.env.PRIVATE_TURN_H3_ONLY==='1') console.error(JSON.stringify({scope:'native-h3',phase,endpoints:await Promise.all(contexts.map(async context=>{try{return await context.pages()[0].evaluate(()=>({factories:window.h3Count,states:window.h3States,active:!!window.h3Owner?.getSession(),connection:window.h3Owner?.getSession()?.pc?.connectionState,channel:window.h3Channel?.readyState,messages:window.h3Messages?.length}));}catch{return {unavailable:true};}}))})); if(process.env.PRIVATE_TURN_INBOX_ONLY==='1') console.error(JSON.stringify({scope:'synthetic-production-inbox',phase,endpoints:await Promise.all(contexts.map(async context=>{const page=context.pages()[0];try{return await page.evaluate(()=>({listeners:window.productionInbox?.listeners.size,signals:window.inboxSignals?.length,factories:window.inboxFactories,rtcEvents:window.inboxRtcStates,retainedSessions:window.inboxSessions?.map(session=>({connection:session.pc?.connectionState,ice:session.pc?.iceConnectionState,channel:session.channel?.readyState,remaining:session.getLeaseRemainingMs?.()})),states:[...(window.productionInbox?.listeners.values()||[])].map(entry=>({state:entry.state,stopped:entry.stopped,authenticated:entry.authenticated,channel:entry.channel?.readyState,connection:entry.session?.pc?.connectionState}))}));}catch{return {unavailable:true};}}))}));throw error; } finally { for (const context of contexts) await context.close(); await browser?.close(); for (const dev of devs) await dev.close(); if (upstream) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); } await fs.rm(temporary, { recursive: true, force: true }); }
}
if (require.main === module) void main().catch(error => { if (phase === 'PEER_VISUAL_STATES' && error?.code === 'ERR_ASSERTION') console.error(error.message); console.error('mini-backup-browser:failed:' + phase + ':' + (error?.code === 'ERR_ASSERTION' ? 'ASSERTION' : error?.name === 'TimeoutError' ? 'TIMEOUT' : 'OPERATION'));  process.exitCode = 1; });
