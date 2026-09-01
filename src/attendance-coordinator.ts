// UMD wrapper kept intact: emits `module.exports` (CommonJS for node --test)
// and `root.AttendanceCoordinator` (browser global consumed by index.html).

interface AttendanceEmployeeInput {
  id: string;
  name: string;
  number: string;
}

interface AttendanceCoordinatorOptions {
  repository: any;
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  envelopeApi?: any;
  scope?: { ownerUid: string; siteId: string; sourceId: string };
  deviceId?: string;
  now?: () => string;
  generateUuid?: () => string;
}

(function exposeAttendanceCoordinator(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.AttendanceCoordinator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAttendanceCoordinatorModule() {
  const OUTBOX_KEY = 'mini-sa-outbox-v1';
  const DEFAULT_SCOPE = { ownerUid: 'local-owner', siteId: 'local-site', sourceId: 'mini-app' };

  function defaultUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // RFC4122 v4 compliant fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function defaultNow(): string {
    return new Date().toISOString();
  }

  function createAttendanceCoordinator(options: AttendanceCoordinatorOptions) {
    const repository = options.repository;
    const storage = options.storage;
    const nowFn = options.now || defaultNow;
    const uuidFn = options.generateUuid || defaultUuid;
    const baseScope = options.scope || DEFAULT_SCOPE;
    const deviceId = options.deviceId || 'device-local-1';
    let sequence = 0;

    function loadOutbox(): any[] {
      const raw = storage.getItem(OUTBOX_KEY);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function persistOutbox(outbox: any[]): void {
      storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
    }

    function recordAttendance(
      employee: AttendanceEmployeeInput,
      date: string,
      status: 'present' | 'absent' | 'pending',
      hours: number = 8
    ): { status: 'saved' | 'deleted'; record?: any; tombstone?: any; outboxRecord?: any } {
      const repoResult = repository.setRecord(employee.id, date, status, hours);

      if (status !== 'present') {
        return {
          status: 'deleted',
          tombstone: repoResult.tombstone
        };
      }

      // Enqueue to offline outbox as immutable v1 envelope
      sequence += 1;
      const eventId = uuidFn();
      const timestamp = nowFn();

      const envelope = {
        schema: 'mini-attendance/v1',
        eventId,
        scope: { ...baseScope },
        deviceId,
        clientSequence: sequence,
        rosterVersion: 'v1.0.0',
        capturedAt: timestamp,
        rows: [
          {
            sourceEmployeeId: employee.id,
            number: String(employee.number || ''),
            name: String(employee.name || ''),
            status: 'present',
            hours: typeof repoResult.record?.hours === 'number' ? repoResult.record.hours : hours
          }
        ]
      };

      const outboxRecord = {
        eventId,
        envelope,
        state: 'pending',
        attempts: 0,
        nextAttemptAt: Date.now()
      };

      const currentOutbox = loadOutbox();
      persistOutbox([...currentOutbox, outboxRecord]);

      return {
        status: 'saved',
        record: repoResult.record,
        outboxRecord
      };
    }

    function getPendingOutbox(): any[] {
      return loadOutbox().filter(item => item.state === 'pending' || item.state === 'sending');
    }

    function getAllOutbox(): any[] {
      return loadOutbox();
    }

    function acknowledgeEvent(eventId: string): boolean {
      const outbox = loadOutbox();
      const target = outbox.find(item => item.eventId === eventId);
      if (!target) return false;

      target.state = 'ack';
      target.ackedAt = nowFn();
      persistOutbox(outbox);
      return true;
    }

    function markEventFailed(eventId: string, errorMsg?: string): boolean {
      const outbox = loadOutbox();
      const target = outbox.find(item => item.eventId === eventId);
      if (!target) return false;

      target.attempts = (target.attempts || 0) + 1;
      if (target.attempts >= 5) {
        target.state = 'dead';
      } else {
        target.state = 'pending';
      }
      target.error = errorMsg || 'Unknown error';
      persistOutbox(outbox);
      return true;
    }

    function clearOutbox(): void {
      persistOutbox([]);
    }

    return {
      recordAttendance,
      getPendingOutbox,
      getAllOutbox,
      acknowledgeEvent,
      markEventFailed,
      clearOutbox
    };
  }

  return {
    createAttendanceCoordinator
  };
});
