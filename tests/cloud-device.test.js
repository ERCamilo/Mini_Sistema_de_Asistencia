const test=require('node:test'),assert=require('node:assert/strict');
const {getDeviceIdentity}=require('../cloud-field.js');
test('device identity preserves the existing installation ID across reload and name edits',()=>{
 const values=new Map([['mini-cloud-device-v1','existing-device']]);
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 assert.deepEqual(getDeviceIdentity(storage,()=>{throw Error('must preserve identity');}),{deviceId:'existing-device',deviceName:''});
 values.set('mini-cloud-device-name-v1','Mini de campo');
 assert.deepEqual(getDeviceIdentity(storage,()=>''),{deviceId:'existing-device',deviceName:'Mini de campo'});
});
test('new installation creates identity only once without using account credentials',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 let calls=0;
 const first=getDeviceIdentity(storage,()=>{calls++;return 'installation-uuid';});
 const second=getDeviceIdentity(storage,()=>{calls++;return 'wrong';});
 assert.deepEqual(first,second);assert.equal(calls,1);
});
