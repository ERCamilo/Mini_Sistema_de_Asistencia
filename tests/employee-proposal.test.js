const test = require('node:test');
const assert = require('node:assert/strict');
const Proposal = require('../employee-proposal.js');
const Core = require('../p2p-core.js');
test('transporte admite propuesta concreta y sigue rechazando rosters genéricos',()=>{
 const start={protocol:Core.TRANSFER_PROTOCOL,type:'start',transferId:'proposal-transfer-123456789',kind:'roster',schema:'mini-roster-proposal/v1',size:0,chunkSize:Core.CHUNK_SIZE,totalChunks:0,sha256:'a'.repeat(64)};
 assert.equal(Core.validateTransferStart(start).schema,'mini-roster-proposal/v1');
 assert.throws(()=>Core.validateTransferStart({...start,schema:'mini-roster/v1'}));
});
const options = { proposalId:'proposal-1', requestId:'request-1', saProjectId:'PRJ-1', generatedAt:'2026-10-14T12:00:00.000Z' };
const employee = { id:'mini-1', number:'001', name:'Ana', position:'Ayudante', sueldo:'1500', phone:'8095550100' };
test('personal transmite sueldo diario numérico y solo campos del contrato', () => {
  const value=Proposal.createProposal([employee],options);
  assert.equal(value.salaryPeriod,'daily'); assert.equal(value.currency,'DOP');
  assert.deepEqual(value.employees[0],{miniLocalId:'mini-1',number:'001',name:'Ana',position:'Ayudante',dailySalary:1500,phone:'8095550100',email:''});
  assert.deepEqual(Proposal.validateProposal(value),value);
});
test('campos incompletos se conservan para revisión y salario inválido se rechaza', () => {
  assert.equal(Proposal.createProposal([{...employee,sueldo:''}],options).employees[0].dailySalary,null);
  for(const sueldo of ['abc','0','-10','Infinity']) assert.throws(()=>Proposal.createProposal([{...employee,sueldo}],options));
  assert.throws(()=>Proposal.createProposal([employee,employee],options),/duplicado/);
});
test('respuesta debe pertenecer a la propuesta y no puede vincular dos filas al mismo SA', () => {
  const p=Proposal.createProposal([employee],options);
  const result={schema:'mini-roster-result/v1',proposalId:p.proposalId,saProjectId:p.saProjectId,mappings:[{...p.employees[0],saEmployeeId:'EMP-1'}]};
  assert.equal(Proposal.validateResult(result,p).mappings[0].saEmployeeId,'EMP-1');
  assert.throws(()=>Proposal.validateResult({...result,proposalId:'otro'},p));
  assert.throws(()=>Proposal.validateResult({...result,mappings:[{...result.mappings[0],miniLocalId:'otro'}]},p));
});
test('la propuesta no puede introducir campos reservados a la respuesta SA',()=>{
 const p=Proposal.createProposal([employee],options);
 assert.throws(()=>Proposal.validateProposal({...p,employees:[{...p.employees[0],saEmployeeId:'untrusted'}]}));
});
