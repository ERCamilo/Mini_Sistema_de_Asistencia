const test=require('node:test');const assert=require('node:assert/strict');
require('../employee-number-rules.js');
const Repository=require('../employee-repository.js');const Proposal=require('../employee-proposal.js');
function setup(){const values=new Map([['users',JSON.stringify([{id:'local-1',number:'1',name:'Ana',position:'Ayudante',sueldo:'1500',workContextId:'obra-mini',extraPositions:[{name:'Oficial'}]}])]]);return {values,repo:Repository.createEmployeeRepository({storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}})};}
function transfer(repo){const p=Proposal.createProposal(repo.getAll(),{proposalId:'p-1',requestId:'r-1',saProjectId:'P-1',generatedAt:'2026-10-14T12:00:00.000Z'});const result={schema:'mini-roster-result/v1',proposalId:p.proposalId,saProjectId:p.saProjectId,mappings:[{...p.employees[0],saEmployeeId:'EMP-1',number:'7',dailySalary:1600}]};return {p,result};}
test('confirmación SA conserva ID local y metadata, y se aplica una sola vez',()=>{
 const {repo,values}=setup(),{p,result}=transfer(repo);repo.applySaEmployeeBindings(result,p);
 const e=repo.getAll()[0];assert.equal(e.id,'local-1');assert.equal(e.workContextId,'obra-mini');assert.equal(e.extraPositions[0].name,'Oficial');assert.equal(e.saEmployeeId,'EMP-1');assert.equal(e.sueldo,'1600');assert.equal(e.number,'7');
 const before=values.get('users');repo.applySaEmployeeBindings(result,p);assert.equal(values.get('users'),before);
});
test('si el empleado cambió o el número confirmado colisiona no hay aplicación parcial',()=>{
 const {repo,values}=setup(),{p,result}=transfer(repo);const changed=repo.getAll();changed[0].name='Cambio local';values.set('users',JSON.stringify(changed));const before=values.get('users');
 assert.throws(()=>repo.applySaEmployeeBindings(result,p),/cambi/);assert.equal(values.get('users'),before);
 const other=setup(),t=transfer(other.repo);const list=other.repo.getAll();list.push({id:'local-2',name:'Otra persona',number:'7'});other.values.set('users',JSON.stringify(list));const snapshot=other.values.get('users');
 assert.throws(()=>other.repo.applySaEmployeeBindings(t.result,t.p),/ficha/);assert.equal(other.values.get('users'),snapshot);
});
test('otro registro local no puede compartir el vínculo SA aunque tenga otra ficha',()=>{
 const {repo,values}=setup(),{p,result}=transfer(repo),users=repo.getAll();
 users.push({id:'local-2',number:'99',name:'Otra ficha',saEmployeeId:'EMP-1',saProjectId:'P-1'});
 values.set('users',JSON.stringify(users));const before=values.get('users');
 assert.throws(()=>repo.applySaEmployeeBindings(result,p),/vinculad|duplicad/);assert.equal(values.get('users'),before);
});
