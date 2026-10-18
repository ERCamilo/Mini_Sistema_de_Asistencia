const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('Firebase linking is optional, local scripts and styles are precached',()=>{const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');for(const file of ['firebase-link.js','firebase-field-config.js','firebase-link.css','vendor/firebase-app-compat.js','vendor/firebase-auth-compat.js']){assert.ok(html.includes('./'+file));assert.ok(sw.includes("'./"+file+"'"));assert.ok(fs.existsSync(file));}assert.ok(html.includes('connections-open'));assert.ok(!html.includes('https://www.gstatic.com/firebasejs/'));});
test('production configuration remains disabled',()=>{delete global.MiniFirebaseFieldConfig;require('../firebase-field-config.js');assert.equal(global.MiniFirebaseFieldConfig,null);});

test('account presentation preserves original Auth controls and never enables disabled configuration',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../src/connection-menu.ts'),'utf8');
 // Browser focus regressions exercise these structural protections with real DOM controls.
 assert.ok(source.includes("const summary=previous||node('section','connections-account-summary')"));
 assert.ok(!source.includes('previous?.remove()'));
 assert.ok(source.includes('if(account.parentElement!==identity)identity.append(account)'));
 assert.ok(source.includes('identity.append(account)'));
 assert.ok(source.includes("el('firebase-link-login')"));
 assert.ok(source.includes("el('firebase-link-logout')"));
 assert.ok(source.includes('disabled.disabled=true'));
 assert.ok(!source.includes('login.hidden=false'));
 assert.ok(!source.includes('initializeApp'));
});
