// Field Requests domain core: dynamic forms, immutable target snapshots,
// response tracking, metrics calculation, templates, and WhatsApp formatting.

type FieldRequestCategory = 'personal' | 'materials' | 'equipment' | 'general';
type FieldRequestStatus = 'draft' | 'open' | 'completed' | 'closed';
type FieldRequestPriority = 'normal' | 'important' | 'urgent';
type FieldRequestTargetType = 'all' | 'position' | 'leader' | 'custom' | 'none';
type FieldRequestFieldType =
  | 'boolean'
  | 'check'
  | 'single_choice'
  | 'multiple_choice'
  | 'number'
  | 'number_unit'
  | 'text_short'
  | 'text_long'
  | 'boolean_comment'
  | 'choice_comment';

interface FieldRequestEmployeeSnapshot {
  id: string;
  name: string;
  number: string;
  position?: string;
}

interface FieldRequestField {
  id: string;
  label: string;
  type: FieldRequestFieldType;
  required?: boolean;
  options?: string[];
  unit?: string;
  allowComment?: boolean;
  order?: number;
}

interface FieldRequestResponseItem {
  fieldId: string;
  employeeId?: string | null;
  value: boolean | string | number | string[];
  comment?: string | null;
  updatedAt: string;
}

interface FieldRequest {
  id: string;
  schemaVersion: 1;
  title: string;
  description?: string;
  category: FieldRequestCategory;
  source: 'mini' | 'sa';
  priority: FieldRequestPriority;
  status: FieldRequestStatus;
  targetType: FieldRequestTargetType;
  targetPosition?: string;
  targets: FieldRequestEmployeeSnapshot[];
  fields: FieldRequestField[];
  responses: Record<string, FieldRequestResponseItem>;
  notes?: string;
  organizationId?: string;
  projectId?: string;
  crewId?: string;
  createdBy?: string;
  requiredDate?: string | null;
  requiredAt?: string | null;
  templateId?: string;
  syncStatus: 'local' | 'pending' | 'synced';
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  closedAt?: string | null;
  lastSharedAt?: string | null;
  shareCount: number;
}

interface FieldRequestTemplate {
  id: string;
  name: string;
  title?: string;
  description?: string;
  category: FieldRequestCategory;
  isFavorite: boolean;
  isSystem: boolean;
  source?: 'mini' | 'sa';
  fields: FieldRequestField[];
  priority: FieldRequestPriority;
  targetType: FieldRequestTargetType;
  targetPosition?: string;
}

interface FieldRequestSummary {
  totalTargets: number;
  targetCount: number;
  respondedTargets: number;
  answeredCount: number;
  pendingTargets: number;
  completionPercentage: number;
  progressPct: number;
  fieldSummaries: Array<{
    fieldId: string;
    label: string;
    type: FieldRequestFieldType;
    booleanCounts?: { yes: number; no: number; pending: number };
    choiceCounts?: Record<string, number>;
    numericValues?: Array<{
      targetName?: string;
      targetNumber?: string;
      value: number | string;
      unit?: string;
      comment?: string | null;
    }>;
    textResponses?: Array<{
      targetName?: string;
      targetNumber?: string;
      value: string | string[];
      comment?: string | null;
    }>;
  }>;
}

(function exposeFieldRequests(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.FieldRequests = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFieldRequestsApi() {

  function generateId(prefix: string): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now()}_${random}`;
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function clone<T>(val: T): T {
    return JSON.parse(JSON.stringify(val));
  }

  function resolveTargets(
    targetType: FieldRequestTargetType,
    allEmployees: FieldRequestEmployeeSnapshot[] = [],
    options?: { targetPosition?: string; targetEmployeeIds?: string[] }
  ): FieldRequestEmployeeSnapshot[] {
    if (!Array.isArray(allEmployees) || allEmployees.length === 0) return [];

    if (targetType === 'all') {
      return allEmployees.map(emp => ({
        id: String(emp.id),
        name: String(emp.name || '').trim(),
        number: String(emp.number || '').trim(),
        position: emp.position ? String(emp.position).trim() : ''
      }));
    }

    if (targetType === 'position') {
      const posFilter = (options?.targetPosition || '').trim().toLowerCase();
      return allEmployees
        .filter(emp => (emp.position || '').trim().toLowerCase() === posFilter)
        .map(emp => ({
          id: String(emp.id),
          name: String(emp.name || '').trim(),
          number: String(emp.number || '').trim(),
          position: emp.position ? String(emp.position).trim() : ''
        }));
    }

    if (targetType === 'custom') {
      const idSet = new Set(options?.targetEmployeeIds || []);
      return allEmployees
        .filter(emp => idSet.has(emp.id))
        .map(emp => ({
          id: String(emp.id),
          name: String(emp.name || '').trim(),
          number: String(emp.number || '').trim(),
          position: emp.position ? String(emp.position).trim() : ''
        }));
    }

    return [];
  }

  function createRequest(
    params: {
      id?: string;
      title: string;
      description?: string;
      category?: FieldRequestCategory;
      priority?: FieldRequestPriority;
      status?: FieldRequestStatus;
      targetType?: FieldRequestTargetType;
      targetPosition?: string;
      targetEmployeeIds?: string[];
      fields?: FieldRequestField[];
      notes?: string;
      organizationId?: string;
      projectId?: string;
      crewId?: string;
      createdBy?: string;
      requiredDate?: string | null;
      requiredAt?: string | null;
      templateId?: string;
    },
    allEmployees: FieldRequestEmployeeSnapshot[] = [],
    nowFn = nowIso
  ): FieldRequest {
    const category = params.category || 'personal';
    const targetType: FieldRequestTargetType = params.targetType
      ? params.targetType
      : (category === 'personal' ? 'all' : 'none');

    const employeePool = (Array.isArray(allEmployees) && allEmployees.length > 0)
      ? allEmployees
      : (Array.isArray((params as any).allEmployees) ? (params as any).allEmployees : []);

    const targets = targetType !== 'none'
      ? resolveTargets(targetType, employeePool, {
          targetPosition: params.targetPosition,
          targetEmployeeIds: params.targetEmployeeIds || (params as any).customRecipients
        })
      : [];

    const now = nowFn();
    const fields = (params.fields && params.fields.length > 0)
      ? params.fields.map((f, idx) => ({
          id: f.id || generateId('fld'),
          label: (f.label || '').trim() || `Campo ${idx + 1}`,
          type: f.type || 'boolean',
          required: !!f.required,
          options: Array.isArray(f.options) ? f.options.map(o => String(o).trim()).filter(Boolean) : [],
          unit: f.unit ? String(f.unit).trim() : undefined,
          allowComment: !!f.allowComment,
          order: typeof f.order === 'number' ? f.order : idx
        }))
      : [
          {
            id: generateId('fld'),
            label: '¿Disponible?',
            type: 'boolean' as FieldRequestFieldType,
            required: true,
            allowComment: true,
            order: 0
          }
        ];

    return {
      id: params.id || generateId('req'),
      schemaVersion: 1,
      title: (params.title || '').trim() || 'Nueva Solicitud',
      description: (params.description || '').trim(),
      category,
      source: 'mini',
      priority: params.priority || 'normal',
      status: params.status || 'open',
      targetType,
      targetPosition: params.targetPosition ? params.targetPosition.trim() : undefined,
      targets,
      fields,
      responses: {},
      notes: (params.notes || '').trim(),
      organizationId: params.organizationId || '',
      projectId: params.projectId || '',
      crewId: params.crewId || '',
      createdBy: params.createdBy || 'capataz',
      requiredAt: params.requiredAt || params.requiredDate || null,
      requiredDate: params.requiredAt || params.requiredDate || null,
      templateId: params.templateId,
      syncStatus: 'local',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      closedAt: null,
      lastSharedAt: null,
      shareCount: 0
    };
  }

  function responseKey(fieldId: string, employeeId?: string | null): string {
    return employeeId ? `${fieldId}:${employeeId}` : fieldId;
  }

  function assertSafeId(value: unknown): void {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Identificador de solicitud no seguro');
  }

  function normalizeRequest(value: any): FieldRequest {
    if (!value || typeof value !== 'object') throw new Error('Solicitud inválida');
    if (!value.id || !value.title || !Array.isArray(value.fields)) throw new Error('Solicitud incompleta');
    assertSafeId(value.id);
    value.fields.forEach((field: any) => assertSafeId(field?.id));
    (value.targets || []).forEach((target: any) => assertSafeId(target?.id));
    const normalized = clone(value) as FieldRequest;
    normalized.schemaVersion = 1;
    normalized.targets = Array.isArray(normalized.targets) ? normalized.targets : [];
    normalized.responses = {};
    const source = Array.isArray(value.responses)
      ? value.responses
      : Object.values(value.responses && typeof value.responses === 'object' ? value.responses : {});
    source.forEach((raw: any) => {
      if (!raw || !raw.fieldId) return;
      const employeeId = raw.employeeId ?? raw.recipientId ?? null;
      normalized.responses[responseKey(String(raw.fieldId), employeeId ? String(employeeId) : null)] = {
        fieldId: String(raw.fieldId),
        employeeId: employeeId ? String(employeeId) : null,
        value: raw.value,
        comment: raw.comment ? String(raw.comment).trim() : null,
        updatedAt: raw.updatedAt || normalized.updatedAt || normalized.createdAt || nowIso()
      };
    });
    normalized.source = normalized.source === 'sa' ? 'sa' : 'mini';
    normalized.syncStatus = normalized.syncStatus || 'local';
    normalized.shareCount = Number(normalized.shareCount) || 0;
    normalized.createdBy = normalized.createdBy || 'capataz';
    normalized.requiredAt = normalized.requiredAt || normalized.requiredDate || null;
    normalized.requiredDate = normalized.requiredAt;
    return normalized;
  }

  function getResponse(request: FieldRequest, fieldId: string, employeeId?: string | null): FieldRequestResponseItem | undefined {
    const responses: any = request?.responses;
    if (Array.isArray(responses)) {
      return responses.find(item => item?.fieldId === fieldId && (item.employeeId ?? item.recipientId ?? null) === (employeeId ?? null));
    }
    return responses?.[responseKey(fieldId, employeeId)];
  }

  function hasAnswer(response?: FieldRequestResponseItem): boolean {
    if (!response) return false;
    if (Array.isArray(response.value)) return response.value.length > 0;
    return response.value !== '' && response.value !== null && response.value !== undefined;
  }

  function isRequestComplete(request: FieldRequest): boolean {
    const required = (request.fields || []).filter(field => field.required);
    if (required.length === 0) return Object.keys(request.responses || {}).length > 0;
    if (request.targets?.length) {
      return request.targets.every(employee => required.every(field => hasAnswer(getResponse(request, field.id, employee.id))));
    }
    return required.every(field => hasAnswer(getResponse(request, field.id)));
  }

  function exportRequestBackup(requests: FieldRequest[], templates: FieldRequestTemplate[]): string {
    return JSON.stringify({ schemaVersion: 1, exportedAt: nowIso(), requests, templates }, null, 2);
  }

  function importRequestBackup(raw: string): { requests: FieldRequest[]; templates: FieldRequestTemplate[] } {
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { throw new Error('El respaldo no contiene JSON válido'); }
    if (parsed?.schemaVersion !== 1) throw new Error('El respaldo no es compatible');
    if (!Array.isArray(parsed.requests) || !Array.isArray(parsed.templates)) throw new Error('El respaldo está incompleto');
    const requests = parsed.requests.map(normalizeRequest);
    const templates = parsed.templates.map((template: any) => {
      if (!template?.id || !template?.name || !Array.isArray(template.fields)) throw new Error('Plantilla inválida en el respaldo');
      return clone(template);
    });
    return { requests, templates };
  }

  function recordResponse(
    request: FieldRequest,
    input: {
      fieldId: string;
      employeeId?: string | null;
      value: boolean | string | number | string[];
      comment?: string | null;
    },
    nowFn = nowIso
  ): FieldRequest {
    const updated = normalizeRequest(request);
    const key = responseKey(input.fieldId, input.employeeId);
    const now = nowFn();

    updated.responses[key] = {
      fieldId: input.fieldId,
      employeeId: input.employeeId || null,
      value: input.value,
      comment: input.comment ? String(input.comment).trim() : null,
      updatedAt: now
    };
    updated.updatedAt = now;

    return updated;
  }

  function removeResponse(
    request: FieldRequest,
    fieldId: string,
    employeeId?: string | null,
    nowFn = nowIso
  ): FieldRequest {
    const updated = normalizeRequest(request);
    const key = responseKey(fieldId, employeeId);
    if (updated.responses[key]) {
      delete updated.responses[key];
      updated.updatedAt = nowFn();
    }
    return updated;
  }

  function changeStatus(
    request: FieldRequest,
    newStatus: FieldRequestStatus,
    nowFn = nowIso
  ): FieldRequest {
    const updated = normalizeRequest(request);
    const now = nowFn();
    updated.status = newStatus;
    updated.updatedAt = now;

    if (newStatus === 'completed') {
      updated.completedAt = now;
    } else if (newStatus === 'closed') {
      updated.closedAt = now;
    } else if (newStatus === 'open') {
      // Reopening clears closed timestamp
      updated.closedAt = null;
    }
    return updated;
  }

  function recordShare(request: FieldRequest, nowFn = nowIso): FieldRequest {
    const updated = normalizeRequest(request);
    const now = nowFn();
    updated.lastSharedAt = now;
    updated.shareCount = (updated.shareCount || 0) + 1;
    updated.updatedAt = now;
    return updated;
  }

  function duplicateRequest(
    request: FieldRequest,
    nowFn = nowIso,
    newTitle?: string
  ): FieldRequest {
    const now = nowFn();
    return {
      ...clone(request),
      id: generateId('req'),
      schemaVersion: 1,
      title: newTitle || request.title,
      status: 'open',
      responses: {},
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      closedAt: null,
      lastSharedAt: null,
      shareCount: 0
    };
  }

  function summarizeResults(request: FieldRequest): FieldRequestSummary {
    const isPersonal = request.targets.length > 0;
    const totalTargets = isPersonal ? request.targets.length : 0;

    let respondedCount = 0;
    if (isPersonal) {
      const respondedEmpIds = new Set<string>();
      Object.values(request.responses).forEach(res => {
        if (res.employeeId) respondedEmpIds.add(res.employeeId);
      });
      respondedCount = respondedEmpIds.size;
    }

    const pendingTargets = isPersonal ? Math.max(0, totalTargets - respondedCount) : 0;
    const completionPercentage = totalTargets > 0
      ? Math.round((respondedCount / totalTargets) * 100)
      : (Object.keys(request.responses).length > 0 ? 100 : 0);

    const fieldSummaries = request.fields.map(field => {
      const fieldType = field.type;
      if (fieldType === 'boolean' || fieldType === 'check' || fieldType === 'boolean_comment') {
        let yes = 0;
        let no = 0;
        if (isPersonal) {
          request.targets.forEach(emp => {
            const key = responseKey(field.id, emp.id);
            const res = request.responses[key];
            if (res) {
              if (res.value === true || res.value === 'true' || res.value === 'yes' || res.value === 'si') {
                yes++;
              } else if (res.value === false || res.value === 'false' || res.value === 'no') {
                no++;
              }
            }
          });
          const pending = totalTargets - (yes + no);
          return {
            fieldId: field.id,
            label: field.label,
            type: fieldType,
            booleanCounts: { yes, no, pending: Math.max(0, pending) }
          };
        } else {
          const res = request.responses[field.id];
          if (res) {
            if (res.value === true || res.value === 'true' || res.value === 'yes' || res.value === 'si') yes = 1;
            else if (res.value === false || res.value === 'false' || res.value === 'no') no = 1;
          }
          return {
            fieldId: field.id,
            label: field.label,
            type: fieldType,
            booleanCounts: { yes, no, pending: 0 }
          };
        }
      }

      if (fieldType === 'single_choice' || fieldType === 'choice_comment' || fieldType === 'multiple_choice') {
        const choiceCounts: Record<string, number> = {};
        (field.options || []).forEach(opt => { choiceCounts[opt] = 0; });

        Object.values(request.responses)
          .filter(r => r.fieldId === field.id)
          .forEach(r => {
            if (Array.isArray(r.value)) {
              r.value.forEach(v => {
                const s = String(v).trim();
                choiceCounts[s] = (choiceCounts[s] || 0) + 1;
              });
            } else if (r.value !== undefined && r.value !== null && String(r.value).trim() !== '') {
              const s = String(r.value).trim();
              choiceCounts[s] = (choiceCounts[s] || 0) + 1;
            }
          });

        return {
          fieldId: field.id,
          label: field.label,
          type: fieldType,
          choiceCounts
        };
      }

      if (fieldType === 'number' || fieldType === 'number_unit') {
        const numericValues: Array<{
          targetName?: string;
          targetNumber?: string;
          value: number | string;
          unit?: string;
          comment?: string | null;
        }> = [];

        if (isPersonal) {
          request.targets.forEach(emp => {
            const key = responseKey(field.id, emp.id);
            const res = request.responses[key];
            if (res && res.value !== undefined && res.value !== null && res.value !== '') {
              numericValues.push({
                targetName: emp.name,
                targetNumber: emp.number,
                value: res.value as (number | string),
                unit: field.unit,
                comment: res.comment
              });
            }
          });
        } else {
          const res = request.responses[field.id];
          if (res && res.value !== undefined && res.value !== null && res.value !== '') {
            numericValues.push({
              value: res.value as (number | string),
              unit: field.unit,
              comment: res.comment
            });
          }
        }

        return {
          fieldId: field.id,
          label: field.label,
          type: fieldType,
          numericValues
        };
      }

      // text_short, text_long, or default
      const textResponses: Array<{
        targetName?: string;
        targetNumber?: string;
        value: string | string[];
        comment?: string | null;
      }> = [];

      if (isPersonal) {
        request.targets.forEach(emp => {
          const key = responseKey(field.id, emp.id);
          const res = request.responses[key];
          if (res && res.value !== undefined && res.value !== null && res.value !== '') {
            textResponses.push({
              targetName: emp.name,
              targetNumber: emp.number,
              value: res.value as string,
              comment: res.comment
            });
          }
        });
      } else {
        const res = request.responses[field.id];
        if (res && res.value !== undefined && res.value !== null && res.value !== '') {
          textResponses.push({
            value: res.value as string,
            comment: res.comment
          });
        }
      }

      return {
        fieldId: field.id,
        label: field.label,
        type: fieldType,
        textResponses
      };
    });
    return {
      totalTargets,
      targetCount: totalTargets,
      respondedTargets: respondedCount,
      answeredCount: respondedCount,
      pendingTargets,
      completionPercentage,
      progressPct: completionPercentage,
      fieldSummaries
    };
  }

  function formatDate(isoString?: string | null): string {
    if (!isoString) return '';
    try {
      const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoString);
      if (calendarDate) return `${calendarDate[3]}/${calendarDate[2]}/${calendarDate[1]}`;
      const d = new Date(isoString);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return '';
    }
  }

  function priorityLabel(priority: FieldRequestPriority): string {
    if (priority === 'urgent') return '🔴 Urgente';
    if (priority === 'important') return '🟡 Importante';
    return 'Normal';
  }

  function formatWhatsAppSummary(request: FieldRequest): string {
    const summary = summarizeResults(request);
    const dateStr = formatDate(request.createdAt);
    const lines: string[] = [];

    lines.push(`📋 *${request.title}*`);
    if (request.priority && request.priority !== 'normal') {
      lines.push(`Prioridad: ${priorityLabel(request.priority)}`);
    }
    if (dateStr) lines.push(`📅 *Fecha:* ${dateStr}`);
    if (request.requiredAt || request.requiredDate) lines.push(`⏰ *Necesaria para:* ${formatDate(request.requiredAt || request.requiredDate)}`);
    if (request.category) {
      const catLabel = request.category === 'personal' ? 'Personal' : (request.category === 'materials' ? 'Materiales' : (request.category === 'equipment' ? 'Equipos' : 'General'));
      lines.push(`🏷️ *Categoría:* ${catLabel}`);
    }
    if (request.targetPosition) lines.push(`👷 *Puesto:* ${request.targetPosition}`);
    if (request.description) lines.push(`ℹ️ ${request.description}`);
    lines.push('─────────────────');

    if (request.targetType !== 'none' && summary.totalTargets > 0) {
      lines.push(`👥 *${summary.totalTargets} trabajadores*`);
      lines.push(`Respuestas: ${summary.respondedTargets}/${summary.totalTargets} (${summary.completionPercentage}%)`);
      lines.push('');

      summary.fieldSummaries.forEach(fs => {
        if (fs.booleanCounts) {
          lines.push(`*${fs.label}*`);
          lines.push(`  ✅ Sí: ${fs.booleanCounts.yes}`);
          lines.push(`  ❌ No: ${fs.booleanCounts.no}`);
          if (fs.booleanCounts.pending > 0) {
            lines.push(`  ⏳ Pendientes: ${fs.booleanCounts.pending}`);
          }
        } else if (fs.choiceCounts) {
          lines.push(`*${fs.label}:*`);
          Object.entries(fs.choiceCounts).forEach(([opt, count]) => {
            if (count > 0) lines.push(`  • ${opt}: ${count}`);
          });
        } else if (fs.numericValues && fs.numericValues.length > 0) {
          const total = fs.numericValues.reduce((acc, curr) => acc + (typeof curr.value === 'number' ? curr.value : Number(curr.value) || 0), 0);
          lines.push(`*${fs.label}:* Total ${total}${fs.numericValues[0].unit ? ' ' + fs.numericValues[0].unit : ''}`);
        }
      });
    } else {
      // General / materials / equipment without target employee list
      summary.fieldSummaries.forEach(fs => {
        if (fs.numericValues && fs.numericValues.length > 0) {
          const val = fs.numericValues[0];
          lines.push(`📦 *${fs.label}:* ${val.value}${val.unit ? ' ' + val.unit : ''}`);
          if (val.comment) lines.push(`   _Nota: ${val.comment}_`);
        } else if (fs.textResponses && fs.textResponses.length > 0) {
          const val = fs.textResponses[0];
          lines.push(`*${fs.label}:* ${val.value}`);
          if (val.comment) lines.push(`   _Nota: ${val.comment}_`);
        } else if (fs.choiceCounts) {
          const chosen = Object.entries(fs.choiceCounts).filter(([, count]) => count > 0).map(([option]) => option).join(', ');
          lines.push(`*${fs.label}:* ${chosen || 'Sin responder'}`);
        }
      });
    }

    if (request.notes) {
      lines.push('');
      lines.push(`📝 *Observaciones:* ${request.notes}`);
    }

    lines.push('');
    lines.push('_Mini Asistencia_');
    return lines.join('\n');
  }

  function formatWhatsAppDetail(request: FieldRequest): string {
    const summary = summarizeResults(request);
    const dateStr = formatDate(request.createdAt);
    const lines: string[] = [];

    lines.push(`📋 *${request.title} — Detalle*`);
    if (request.priority && request.priority !== 'normal') {
      lines.push(`Prioridad: ${priorityLabel(request.priority)}`);
    }
    if (dateStr) lines.push(`📅 *Fecha:* ${dateStr}`);
    if (request.requiredAt || request.requiredDate) lines.push(`⏰ *Necesaria para:* ${formatDate(request.requiredAt || request.requiredDate)}`);
    if (request.targetPosition) lines.push(`👷 *Puesto:* ${request.targetPosition}`);
    lines.push('─────────────────');

    if (request.targetType !== 'none' && request.targets.length > 0) {
      const notesList: Array<{ name: string; comment: string }> = [];

      request.targets.forEach((emp, index) => {
        const answers: string[] = [];
        request.fields.forEach(field => {
          const key = responseKey(field.id, emp.id);
          const res = request.responses[key];
          if (res && res.value !== undefined && res.value !== null && res.value !== '') {
            if (field.type === 'boolean' || field.type === 'boolean_comment' || field.type === 'check') {
              answers.push(res.value ? '✅ Sí' : '❌ No');
            } else {
              answers.push(`${res.value}${field.unit ? ' ' + field.unit : ''}`);
            }
            if (res.comment) {
              notesList.push({ name: emp.name, comment: res.comment });
            }
          }
        });

        const numPrefix = emp.number ? `${emp.number}. ` : `${index + 1}. `;
        const answerText = answers.length > 0 ? answers.join(' · ') : '⏳ Pendiente';
        lines.push(`${numPrefix}${emp.name} — ${answerText}`);
      });

      if (notesList.length > 0) {
        lines.push('');
        lines.push('*Notas individuales:*');
        notesList.forEach(n => {
          lines.push(`• ${n.name}: _${n.comment}_`);
        });
      }

      lines.push('');
      // Brief recap
      summary.fieldSummaries.forEach(fs => {
        if (fs.booleanCounts) {
          lines.push(`*Total:* ${fs.booleanCounts.yes} Sí · ${fs.booleanCounts.no} No · ${fs.booleanCounts.pending} Pendientes`);
        }
      });
    } else {
      // General requests detail
      summary.fieldSummaries.forEach(fs => {
        if (fs.numericValues && fs.numericValues.length > 0) {
          const val = fs.numericValues[0];
          lines.push(`📦 *${fs.label}:* ${val.value}${val.unit ? ' ' + val.unit : ''}`);
          if (val.comment) lines.push(`   _Nota: ${val.comment}_`);
        } else if (fs.textResponses && fs.textResponses.length > 0) {
          const val = fs.textResponses[0];
          lines.push(`*${fs.label}:* ${val.value}`);
          if (val.comment) lines.push(`   _Nota: ${val.comment}_`);
        } else if (fs.choiceCounts) {
          const chosen = Object.entries(fs.choiceCounts).filter(([, count]) => count > 0).map(([option]) => option).join(', ');
          lines.push(`*${fs.label}:* ${chosen || 'Sin responder'}`);
        } else if (fs.booleanCounts) {
          const val = fs.booleanCounts.yes > 0 ? 'Sí' : (fs.booleanCounts.no > 0 ? 'No' : 'Sin responder');
          lines.push(`*${fs.label}:* ${val}`);
        }
      });
    }

    if (request.notes) {
      lines.push('');
      lines.push(`📝 *Observaciones:* ${request.notes}`);
    }

    lines.push('');
    lines.push('_Mini Asistencia_');
    return lines.join('\n');
  }

  function getDefaultTemplates(): FieldRequestTemplate[] {
    return [
      {
        id: 'tpl_horas_extra',
        name: 'Horas extra',
        title: 'Horas extra',
        description: 'Consultar quiénes hacen horas extra hoy',
        category: 'personal',
        isFavorite: true,
        isSystem: true,
        priority: 'normal',
        targetType: 'all',
        fields: [
          {
            id: 'fld_horas_extra',
            label: '¿Puede trabajar horas extra?',
            type: 'boolean_comment',
            required: true,
            allowComment: true,
            order: 0
          }
        ]
      },
      {
        id: 'tpl_disp_manana',
        name: 'Disponibilidad mañana',
        title: 'Disponibilidad mañana',
        description: 'Confirmar asistencia para mañana',
        category: 'personal',
        isFavorite: true,
        isSystem: true,
        priority: 'normal',
        targetType: 'all',
        fields: [
          {
            id: 'fld_disp_manana',
            label: '¿Disponible mañana?',
            type: 'boolean_comment',
            required: true,
            allowComment: true,
            order: 0
          }
        ]
      },
      {
        id: 'tpl_disp_sabado',
        name: 'Disponibilidad sábado',
        title: 'Disponibilidad sábado',
        description: 'Confirmar cuadrilla para el sábado',
        category: 'personal',
        isFavorite: true,
        isSystem: true,
        priority: 'normal',
        targetType: 'all',
        fields: [
          {
            id: 'fld_disp_sabado',
            label: '¿Disponible sábado?',
            type: 'boolean_comment',
            required: true,
            allowComment: true,
            order: 0
          }
        ]
      },
      {
        id: 'tpl_compra_material',
        name: 'Compra de material',
        title: 'Compra de material',
        description: 'Solicitar compra urgente de insumos',
        category: 'materials',
        isFavorite: true,
        isSystem: true,
        priority: 'urgent',
        targetType: 'none',
        fields: [
          {
            id: 'fld_mat_item',
            label: 'Material / Producto',
            type: 'text_short',
            required: true,
            order: 0
          },
          {
            id: 'fld_mat_cantidad',
            label: 'Cantidad requerida',
            type: 'number_unit',
            unit: 'unidades',
            required: true,
            order: 1
          },
          {
            id: 'fld_mat_motivo',
            label: 'Motivo de urgencia',
            type: 'text_long',
            order: 2
          }
        ]
      },
      {
        id: 'tpl_conteo_material',
        name: 'Conteo rápido de material',
        title: 'Conteo rápido de material',
        description: 'Inventario rápido de existencias en obra',
        category: 'materials',
        isFavorite: false,
        isSystem: true,
        priority: 'normal',
        targetType: 'none',
        fields: [
          {
            id: 'fld_mat_cemento',
            label: 'Cemento',
            type: 'number_unit',
            unit: 'sacos',
            order: 0
          },
          {
            id: 'fld_mat_arena',
            label: 'Arena',
            type: 'number_unit',
            unit: 'm3',
            order: 1
          }
        ]
      },
      {
        id: 'tpl_epp_necesario',
        name: 'EPP necesario',
        title: 'EPP necesario',
        description: 'Relevamiento de EPP faltante',
        category: 'equipment',
        isFavorite: false,
        isSystem: true,
        priority: 'normal',
        targetType: 'all',
        fields: [
          {
            id: 'fld_epp_tipo',
            label: 'EPP faltante o a reponer',
            type: 'multiple_choice',
            options: ['Casco', 'Guantes', 'Lentes', 'Zapatos', 'Chaleco', 'Arnés'],
            required: true,
            allowComment: true,
            order: 0
          }
        ]
      },
      {
        id: 'tpl_herramienta_danada',
        name: 'Herramienta dañada',
        title: 'Herramienta dañada',
        description: 'Reportar falla o reposición de equipo',
        category: 'equipment',
        isFavorite: false,
        isSystem: true,
        priority: 'important',
        targetType: 'none',
        fields: [
          {
            id: 'fld_herram_nombre',
            label: 'Herramienta / Equipo',
            type: 'text_short',
            required: true,
            order: 0
          },
          {
            id: 'fld_herram_estado',
            label: 'Estado',
            type: 'single_choice',
            options: ['Dañada leve', 'Inoperativa', 'Perdida', 'Desgastada'],
            required: true,
            order: 1
          },
          {
            id: 'fld_herram_accion',
            label: 'Acción sugerida',
            type: 'text_short',
            order: 2
          }
        ]
      },
      {
        id: 'tpl_abastecimiento',
        name: 'Abastecimiento de obra',
        title: 'Abastecimiento de obra',
        description: 'Agua, combustible y servicios básicos',
        category: 'general',
        isFavorite: false,
        isSystem: true,
        priority: 'normal',
        targetType: 'none',
        fields: [
          {
            id: 'fld_ab_agua',
            label: '¿Hay agua disponible?',
            type: 'boolean',
            order: 0
          },
          {
            id: 'fld_ab_combustible',
            label: 'Nivel de combustible',
            type: 'single_choice',
            options: ['Lleno', 'Mitad', 'Bajo', 'Crítico'],
            order: 1
          },
          {
            id: 'fld_ab_obs',
            label: 'Notas de abastecimiento',
            type: 'text_long',
            order: 2
          }
        ]
      },
      {
        id: 'tpl_solicitud_general',
        name: 'Solicitud general',
        title: 'Solicitud general',
        description: 'Mensaje o consulta abierta',
        category: 'general',
        isFavorite: false,
        isSystem: true,
        priority: 'normal',
        targetType: 'none',
        fields: [
          {
            id: 'fld_gen_asunto',
            label: 'Asunto',
            type: 'text_short',
            required: true,
            order: 0
          },
          {
            id: 'fld_gen_detalle',
            label: 'Detalle / Mensaje',
            type: 'text_long',
            required: true,
            order: 1
          }
        ]
      }
    ];
  }

  function createTemplateFromRequest(
    request: FieldRequest,
    name?: string,
    isFavorite = false
  ): FieldRequestTemplate {
    const templateName = (name || request.title).trim() || 'Plantilla';
    return {
      id: generateId('tpl'),
      name: templateName,
      title: templateName,
      description: request.description,
      category: request.category,
      isFavorite,
      isSystem: false,
      source: 'mini',
      fields: clone(request.fields),
      priority: request.priority,
      targetType: request.targetType,
      targetPosition: request.targetPosition
    };
  }

  function updateTemplate(template: FieldRequestTemplate, changes: Partial<FieldRequestTemplate>): FieldRequestTemplate {
    const updated = { ...clone(template), ...clone(changes) };
    updated.id = template.id;
    updated.name = String(updated.name || updated.title || 'Plantilla').trim() || 'Plantilla';
    updated.title = updated.name;
    updated.fields = Array.isArray(updated.fields) ? clone(updated.fields) : [];
    updated.isSystem = template.isSystem;
    updated.source = template.source || 'mini';
    return updated;
  }

  function duplicateTemplate(template: FieldRequestTemplate): FieldRequestTemplate {
    const copy = clone(template);
    copy.id = generateId('tpl');
    copy.name = `${template.name} (copia)`;
    copy.title = copy.name;
    copy.isSystem = false;
    copy.source = 'mini';
    copy.fields = clone(template.fields);
    return copy;
  }

  function filterRequests(
    requests: FieldRequest[] = [],
    queryOrOptions: any = '',
    categoryFilter = 'all',
    statusFilter = 'all'
  ): FieldRequest[] {
    let queryStr = '';
    let catFilter = categoryFilter;
    let statFilter = statusFilter;

    if (queryOrOptions && typeof queryOrOptions === 'object') {
      queryStr = queryOrOptions.search || queryOrOptions.query || '';
      catFilter = queryOrOptions.category || queryOrOptions.categoryFilter || 'all';
      statFilter = queryOrOptions.status || queryOrOptions.statusFilter || 'all';
    } else if (typeof queryOrOptions === 'string') {
      queryStr = queryOrOptions;
    }

    const q = String(queryStr || '').trim().toLowerCase();
    return (requests || []).filter(req => {
      if (!req) return false;
      const matchQuery = !q || (req.title || '').toLowerCase().includes(q) || (req.description || '').toLowerCase().includes(q);
      const matchCategory = catFilter === 'all' || req.category === catFilter;

      let matchStatus = true;
      if (statFilter === 'open') matchStatus = req.status === 'open' || req.status === 'draft';
      else if (statFilter === 'completed') matchStatus = req.status === 'completed';
      else if (statFilter === 'closed') matchStatus = req.status === 'closed';
      else if (statFilter !== 'all') matchStatus = req.status === statFilter;

      return matchQuery && matchCategory && matchStatus;
    });
  }

  return {
    createRequest,
    recordResponse,
    removeResponse,
    changeStatus,
    recordShare,
    duplicateRequest,
    summarizeResults,
    formatWhatsAppSummary,
    formatWhatsAppDetail,
    getDefaultTemplates,
    createTemplateFromRequest,
    filterRequests,
    responseKey
    ,normalizeRequest
    ,getResponse
    ,isRequestComplete
    ,exportRequestBackup
    ,importRequestBackup
    ,updateTemplate
    ,duplicateTemplate
  };
});
