interface EmployeeProposalRow {
  miniLocalId: string; number: string; name: string; position: string;
  dailySalary: number | null; phone: string; email: string;
}
interface EmployeeProposalPayload {
  schema: 'mini-roster-proposal/v1'; proposalId: string; requestId: string;
  saProjectId: string; generatedAt: string; salaryPeriod: 'daily'; currency: 'DOP';
  employees: EmployeeProposalRow[];
}
interface EmployeeProposalMapping extends EmployeeProposalRow { saEmployeeId: string }
interface EmployeeProposalResult {
  schema: 'mini-roster-result/v1'; proposalId: string; saProjectId: string;
  mappings: EmployeeProposalMapping[];
}
(function exposeEmployeeProposal(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.MiniEmployeeProposal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SCHEMA = 'mini-roster-proposal/v1';
  function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Datos de personal inválidos.');
    return value as Record<string, unknown>;
  }
  function keys(value: Record<string, unknown>, allowed: string[]): void {
    if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Campo no admitido en personal.');
  }
  function text(value: unknown, field: string, max = 128, empty = false): string {
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`${field} inválido.`);
    const result = value.trim();
    if (!empty && !result) throw new Error(`${field} es obligatorio.`);
    return result;
  }
  function id(value: unknown): string {
    const result = text(value, 'Identificador');
    if (/\s/.test(result)) throw new Error('Identificador inválido.');
    return result;
  }
  function salary(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))) throw new Error('Escribe el salario diario como número, sin símbolos.');
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 10000000) throw new Error('Salario diario inválido.');
    return number;
  }
  function row(value: unknown, result = false): EmployeeProposalRow {
    const r = object(value); keys(r,['miniLocalId','number','name','position','dailySalary','phone','email',...(result?['saEmployeeId']:[])]);
    const number = text(r.number, 'Ficha', 32);
    if (!/^\d+$/.test(number) || !Number.isSafeInteger(Number(number))) throw new Error('La ficha debe ser un número entero.');
    return { miniLocalId:id(r.miniLocalId), number, name:text(r.name,'Nombre',120), position:text(r.position,'Puesto',80,true), dailySalary:salary(r.dailySalary), phone:text(r.phone ?? '', 'Teléfono',40,true), email:text(r.email ?? '', 'Correo',120,true) };
  }
  function validateProposal(value: unknown): EmployeeProposalPayload {
    const p=object(value); keys(p,['schema','proposalId','requestId','saProjectId','generatedAt','salaryPeriod','currency','employees']);
    if(p.schema!==SCHEMA || p.salaryPeriod!=='daily' || p.currency!=='DOP') throw new Error('Contrato de personal incompatible.');
    const generatedAt=text(p.generatedAt,'Fecha',32);
    if(!Number.isFinite(Date.parse(generatedAt)) || new Date(generatedAt).toISOString()!==generatedAt) throw new Error('Fecha de personal inválida.');
    if(!Array.isArray(p.employees) || !p.employees.length || p.employees.length>500) throw new Error('Selecciona entre 1 y 500 empleados.');
    const employees=p.employees.map(value=>row(value)), ids=new Set<string>();
    for(const r of employees) { if(ids.has(r.miniLocalId)) throw new Error('Empleado local duplicado.'); ids.add(r.miniLocalId); }
    return {schema:SCHEMA,proposalId:id(p.proposalId),requestId:id(p.requestId),saProjectId:id(p.saProjectId),generatedAt,salaryPeriod:'daily',currency:'DOP',employees};
  }
  function createProposal(employees: Record<string, unknown>[], options: Record<string, unknown>): EmployeeProposalPayload {
    return validateProposal({...options,schema:SCHEMA,salaryPeriod:'daily',currency:'DOP',employees:employees.map(e=>({miniLocalId:e.id,number:e.number,name:e.name,position:e.position ?? '',dailySalary:salary(e.sueldo),phone:e.phone ?? '',email:e.email ?? ''}))});
  }
  function validateResult(value: unknown, proposal: EmployeeProposalPayload): EmployeeProposalResult {
    const r=object(value); keys(r,['schema','proposalId','saProjectId','mappings']);
    if(r.schema!=='mini-roster-result/v1' || r.proposalId!==proposal.proposalId || r.saProjectId!==proposal.saProjectId || !Array.isArray(r.mappings) || r.mappings.length>proposal.employees.length) throw new Error('Respuesta de personal no corresponde a este envío.');
    const incoming=new Set(proposal.employees.map(e=>e.miniLocalId)), local=new Set<string>(), sa=new Set<string>();
    const mappings=r.mappings.map(value=>{const rec=object(value);const mapped={...row(rec,true),saEmployeeId:id(rec.saEmployeeId)};
      if(!incoming.has(mapped.miniLocalId) || local.has(mapped.miniLocalId) || sa.has(mapped.saEmployeeId)) throw new Error('Vinculación de personal inválida o duplicada.');
      local.add(mapped.miniLocalId);sa.add(mapped.saEmployeeId);return mapped;
    });
    return {schema:'mini-roster-result/v1',proposalId:proposal.proposalId,saProjectId:proposal.saProjectId,mappings};
  }
  return {SCHEMA,createProposal,validateProposal,validateResult,parseDailySalary:salary};
});
