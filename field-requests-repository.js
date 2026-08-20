"use strict";
(function exposeFieldRequestsRepository(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.FieldRequestsRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRepositoryApi() {
    function createFieldRequestsRepository(options) {
        function parseCollection(key) {
            const raw = options.storage.getItem(key);
            if (!raw)
                return [];
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            }
            catch {
                return [];
            }
        }
        function validateCollections(requests, templates) {
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
        function save(requests, templates) {
            var _a;
            const state = validateCollections(requests, templates);
            options.storage.setItem('requests', JSON.stringify(state.requests));
            options.storage.setItem('requestTemplates', JSON.stringify(state.templates));
            (_a = options.onSnapshotChanged) === null || _a === void 0 ? void 0 : _a.call(options, state);
            return state;
        }
        function exportCollections(requests, templates) {
            return validateCollections(requests, templates);
        }
        function importCollections(requests, templates) {
            return validateCollections(requests, templates);
        }
        function runAtomicRestore(previous, candidate, apply, persist) {
            try {
                apply(candidate);
                persist();
            }
            catch (error) {
                apply(previous);
                persist();
                throw error;
            }
        }
        return { load, save, validateCollections, exportCollections, importCollections, runAtomicRestore };
    }
    return { createFieldRequestsRepository };
});
