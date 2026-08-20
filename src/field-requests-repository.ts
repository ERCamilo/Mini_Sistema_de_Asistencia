// Persistence facade dedicated to Solicitudes. UI code never touches its keys.
interface FieldRequestsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

(function exposeFieldRequestsRepository(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.FieldRequestsRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRepositoryApi() {
  function createFieldRequestsRepository(options: {
    storage: FieldRequestsStorage;
    onSnapshotChanged?: (state: { requests: unknown[]; templates: unknown[] }) => void;
  }) {
    function parseCollection(key: string): unknown[] {
      const raw = options.storage.getItem(key);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }

    function validateCollections(requests: unknown, templates: unknown) {
      if (!Array.isArray(requests) || !Array.isArray(templates)) {
        throw new Error('Requests and templates must be arrays');
      }
      return {
        requests: JSON.parse(JSON.stringify(requests)),
        templates: JSON.parse(JSON.stringify(templates))
      };
    }

    function load() {
      return { requests: parseCollection('requests'), templates: parseCollection('requestTemplates') };
    }

    function save(requests: unknown[], templates: unknown[]) {
      const state = validateCollections(requests, templates);
      options.storage.setItem('requests', JSON.stringify(state.requests));
      options.storage.setItem('requestTemplates', JSON.stringify(state.templates));
      options.onSnapshotChanged?.(state);
      return state;
    }

    function exportCollections(requests: unknown[], templates: unknown[]) {
      return validateCollections(requests, templates);
    }

    function importCollections(requests: unknown, templates: unknown) {
      return validateCollections(requests, templates);
    }

    function runAtomicRestore(previous: unknown, candidate: unknown, apply: (state: any) => void, persist: () => void) {
      try { apply(candidate); persist(); }
      catch (error) { apply(previous); persist(); throw error; }
    }

    return { load, save, validateCollections, exportCollections, importCollections, runAtomicRestore };
  }

  return { createFieldRequestsRepository };
});
