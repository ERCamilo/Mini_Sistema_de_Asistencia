"use strict";
// Small state coordinator that keeps immutable domain returns connected to UI state.
(function exposeFieldRequestCoordinator(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.FieldRequestCoordinator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCoordinator() {
    function update(requests, requestId, transform) {
        let found = false;
        const result = (requests || []).map(request => {
            if (request.id !== requestId)
                return request;
            found = true;
            return transform(request);
        });
        return found ? result : requests;
    }
    function recordResponse(requests, requestId, input, domain) {
        return update(requests, requestId, request => domain.recordResponse(request, input));
    }
    function changeStatus(requests, requestId, status, domain) {
        return update(requests, requestId, request => domain.changeStatus(request, status));
    }
    function recordShare(requests, requestId, domain) {
        return update(requests, requestId, request => domain.recordShare(request));
    }
    return { update, recordResponse, changeStatus, recordShare };
});
