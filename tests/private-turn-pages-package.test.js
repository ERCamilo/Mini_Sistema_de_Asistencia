const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
test('candidate package opts in only output, records hashes and refuses overwrite',async t=>{
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'mini-pages-package-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));const output=path.join(parent,'public');
 const args=['--experimental-transform-types',path.join(root,'scripts/private-turn/package-mini-pages.mts'),'--source-root',root,'--out',output,'--revision','abcdef1','--candidate'];
 const r=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const html=await fs.readFile(path.join(output,'index.html'),'utf8');assert.ok(html.includes('window.MiniPublicTurnPreview='));assert.ok(html.indexOf('private-turn-public-preview.js')>html.indexOf('private-turn-production.js'));
 const manifest=JSON.parse(await fs.readFile(path.join(output,'preview-manifest.json'),'utf8'));assert.equal(manifest.provenance,'unreviewed-candidate');assert.equal(manifest.release.label,'beta 1.9');assert.equal(manifest.release.revision,'abcdef1');
 for(const [name,hash] of Object.entries(manifest.assets)){assert.doesNotMatch(name,/\.git|node_modules|credential|\.env/);assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(output,name))).digest('hex'),hash);}
 const sw=await fs.readFile(path.join(output,'sw.js'),'utf8');assert.ok(sw.includes('./private-turn-public-preview.js'));new (require('node:vm').Script)(sw);assert.ok(!((await fs.readFile(path.join(root,'index.html'),'utf8')).includes('window.MiniPublicTurnPreview=')));
 assert.notEqual(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0);
});
test('release packaging refuses mismatched or dirty source identity',()=>{
 const r=spawnSync(process.execPath,['--experimental-transform-types',path.join(root,'scripts/private-turn/package-mini-pages.mts'),'--source-root',root,'--out','/tmp/must-not-create-mini-pages','--revision','abcdef1'],{encoding:'utf8'});assert.notEqual(r.status,0);
});
test('packaging refuses output inside any repository and unsafe revisions',()=>{
 for(const [output,revision] of [[path.join(root,'must-not-package'),'abcdef1'],['/tmp/must-not-create-mini-pages','abcdef1;sh']]){
  const r=spawnSync(process.execPath,['--experimental-transform-types',path.join(root,'scripts/private-turn/package-mini-pages.mts'),'--source-root',root,'--out',output,'--revision',revision,'--candidate'],{encoding:'utf8'});assert.notEqual(r.status,0);
 }
});
