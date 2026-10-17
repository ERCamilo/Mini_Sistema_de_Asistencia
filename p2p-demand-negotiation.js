"use strict";
(function exposeDemandNegotiation(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.P2PDemandNegotiation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function demandNegotiationModule() {
    function ufrags(sdp = '') {
        return new Set(sdp.split(/\r?\n/).filter(line => line.startsWith('a=ice-ufrag:')).map(line => line.slice(12)));
    }
    function identity(sdp = '') {
        const origin = /^o=[^ ]+ ([^ ]+) ([^ ]+) /m.exec(sdp);
        const fragments = Array.from(ufrags(sdp)).sort();
        return origin && fragments.length ? origin[1] + ':' + origin[2] + ':' + fragments.join(',') : null;
    }
    function create(options) {
        const pc = options.pc;
        let closed = false;
        let tail = Promise.resolve();
        const pending = [];
        let ignored = new Set();
        function enqueue(operation) {
            const next = tail.then(async () => { if (!closed)
                await operation(); });
            tail = next.catch(error => { if (!closed)
                options.onError(error); });
            return next;
        }
        function compatible(candidate) {
            var _a, _b;
            // Candidates without a generation identity are unsafe on a reusable route.
            const fragment = candidate.usernameFragment || ((_a = /(?:^| )ufrag ([^ ]+)/.exec(candidate.candidate || '')) === null || _a === void 0 ? void 0 : _a[1]);
            return !!fragment && !ignored.has(fragment) && ufrags((_b = pc.remoteDescription) === null || _b === void 0 ? void 0 : _b.sdp).has(fragment);
        }
        async function flush() {
            while (pending.length && !closed) {
                const candidate = pending.shift();
                if (compatible(candidate))
                    await pc.addIceCandidate(candidate);
            }
        }
        function start() {
            return enqueue(async () => {
                var _a;
                if (pc.signalingState !== 'stable' || pc.remoteDescription)
                    return;
                options.prepareChannel();
                const offer = await pc.createOffer();
                if (closed)
                    return;
                await pc.setLocalDescription(offer);
                if (!closed)
                    options.send('offer', { type: 'offer', sdp: ((_a = pc.localDescription) === null || _a === void 0 ? void 0 : _a.sdp) || offer.sdp });
            });
        }
        function receive(frame) {
            return enqueue(async () => {
                var _a;
                if (frame.type === 'ice') {
                    const candidate = frame.data;
                    if (!pc.remoteDescription) {
                        if (pending.length >= 64)
                            throw new Error('Demasiadas señales ICE pendientes.');
                        pending.push(candidate);
                    }
                    else if (compatible(candidate))
                        await pc.addIceCandidate(candidate);
                    return;
                }
                const description = frame.data;
                if (frame.type === 'offer') {
                    const collision = pc.signalingState !== 'stable';
                    if (collision && !options.polite) {
                        ignored = ufrags(description.sdp);
                        return;
                    }
                    if (collision) {
                        options.discardProvisionalChannel();
                        await pc.setLocalDescription({ type: 'rollback' });
                    }
                    if (closed)
                        return;
                    ignored = new Set();
                    await pc.setRemoteDescription(description);
                    await flush();
                    const answer = await pc.createAnswer();
                    if (closed)
                        return;
                    await pc.setLocalDescription(answer);
                    if (!closed)
                        options.send('answer', { type: 'answer', sdp: ((_a = pc.localDescription) === null || _a === void 0 ? void 0 : _a.sdp) || answer.sdp });
                }
                else if (pc.signalingState === 'have-local-offer') {
                    ignored = new Set();
                    await pc.setRemoteDescription(description);
                    await flush();
                }
            });
        }
        return { start, receive, close() { closed = true; pending.length = 0; } };
    }
    return { create, identity, ufrags };
});
