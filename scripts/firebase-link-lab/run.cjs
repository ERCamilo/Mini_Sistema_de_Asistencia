const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const sa=process.env.SA_LINK_LAB;if(!sa)throw new Error('Set SA_LINK_LAB to frozen local preview candidate');
const env={...process.env,CI:'true',JAVA_TOOL_OPTIONS:'-Xmx512m',GCLOUD_PROJECT:'demo-sa-field-access'};delete env.GOOGLE_APPLICATION_CREDENTIALS;delete env.FIREBASE_TOKEN;
let r=spawnSync(process.execPath,[path.join(sa,'../firebase-field-access/assemble.cjs')],{env,stdio:'inherit'});if(r.status)process.exit(r.status);
fs.mkdirSync(path.join(__dirname,'.generated'),{recursive:true});fs.copyFileSync(path.join(sa,'../firebase-field-access/.generated/firestore.rules'),path.join(__dirname,'.generated/firestore.rules'));
r=spawnSync('/home/ubuntu/node_modules/.bin/firebase',['emulators:exec','--only','auth,firestore','--project','demo-sa-field-access','--config','firebase.emulator.json','node browser-contract.cjs'],{cwd:__dirname,env,stdio:'inherit'});process.exit(r.status||(r.signal||r.error?1:0));
