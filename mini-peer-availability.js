"use strict";
(function exposeMiniPeerAvailability(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports)
        module.exports = api;
    if (root)
        root.MiniPeerAvailability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function miniPeerAvailabilityModule() {
    function identity(sdp = '') {
        const origin = /^o=[^ ]+ ([^ ]+) ([^ ]+) /m.exec(sdp);
        const fragments = sdp.split(/\r?\n/).filter(line => line.startsWith('a=ice-ufrag:')).map(line => line.slice(12)).sort();
        return origin && fragments.length ? origin[1] + ':' + origin[2] + ':' + fragments.join(',') : null;
    }
    function create(options) {
        if (!options.localPeerId || !options.remotePeerId || options.localPeerId === options.remotePeerId)
            throw new Error('Identidades Mini inválidas.');
        const signaling = options.signaling;
        const retired = new Set();
        let stopped = false, off = null, generation = 0;
        let active = null;
        let setup = null;
        let listeners = new Set();
        let buffered = [], bytes = 0;
        let offerIdentity = null;
        let cancelSetup = null;
        let localDemand = false, timer = null;
        function remember(value) {
            if (!value)
                return;
            retired.add(value);
            if (retired.size > 64)
                retired.delete(retired.values().next().value);
        }
        function retire() {
            var _a, _b, _c, _d, _e;
            cancelSetup === null || cancelSetup === void 0 ? void 0 : cancelSetup(new Error('Preparación Mini retirada.'));
            cancelSetup = null;
            generation++;
            remember(offerIdentity);
            remember(identity((_b = (_a = active === null || active === void 0 ? void 0 : active.pc) === null || _a === void 0 ? void 0 : _a.remoteDescription) === null || _b === void 0 ? void 0 : _b.sdp));
            remember(identity((_d = (_c = active === null || active === void 0 ? void 0 : active.pc) === null || _c === void 0 ? void 0 : _c.localDescription) === null || _d === void 0 ? void 0 : _d.sdp));
            const previous = active;
            active = null;
            setup = null;
            localDemand = false;
            offerIdentity = null;
            if (timer)
                clearTimeout(timer);
            timer = null;
            buffered = [];
            bytes = 0;
            listeners = new Set();
            try {
                previous === null || previous === void 0 ? void 0 : previous.close();
            }
            catch { /* Transport does not own availability. */ }
            if (!stopped)
                (_e = options.onState) === null || _e === void 0 ? void 0 : _e.call(options, 'available');
        }
        function ensure() {
            var _a;
            if (stopped)
                return Promise.reject(new Error('Disponibilidad Mini cerrada.'));
            if (setup)
                return setup;
            if (active)
                return Promise.resolve(active);
            const ownGeneration = generation;
            const ownListeners = listeners;
            let ready = false;
            const onReady = () => {
                if (stopped || ownGeneration !== generation)
                    return false;
                ready = true;
                if (timer)
                    clearTimeout(timer);
                timer = null;
                return true;
            };
            const borrowed = {
                expiresAt: null,
                connect: () => signaling.connect(),
                send: (type, data) => { if (stopped || generation !== ownGeneration)
                    throw new Error('Conexión Mini retirada.'); signaling.send(type, data); },
                onEvent: callback => { ownListeners.add(callback); return () => ownListeners.delete(callback); },
                close: () => { }
            };
            timer = setTimeout(() => { var _a; if (!ready && ownGeneration === generation) {
                retire();
                (_a = options.onState) === null || _a === void 0 ? void 0 : _a.call(options, 'error', new Error('La preparación Mini excedió el tiempo límite.'));
            } }, Math.min(30000, Math.max(1, (_a = options.setupTimeoutMs) !== null && _a !== void 0 ? _a : 10000)));
            const cancelled = new Promise((_resolve, reject) => { cancelSetup = reject; });
            const creation = Promise.resolve().then(() => {
                if (stopped || ownGeneration !== generation)
                    throw new Error('Preparación Mini retirada.');
                return options.createSession({ signaling: borrowed, initiator: false, onReady,
                    demandNegotiation: { localPeerId: options.localPeerId, remotePeerId: options.remotePeerId } });
            }).then(async (session) => {
                var _a, _b;
                if (stopped || ownGeneration !== generation) {
                    session.close();
                    throw new Error('Preparación Mini retirada.');
                }
                active = session;
                const queue = buffered;
                buffered = [];
                bytes = 0;
                for (const event of queue)
                    for (const callback of ownListeners)
                        callback(event);
                if (localDemand && !offerIdentity)
                    await ((_a = session.startNegotiation) === null || _a === void 0 ? void 0 : _a.call(session));
                if (stopped || ownGeneration !== generation)
                    throw new Error('Preparación Mini retirada.');
                setup = null;
                cancelSetup = null;
                if (!ready)
                    (_b = options.onState) === null || _b === void 0 ? void 0 : _b.call(options, 'connecting');
                return session;
            }).catch(error => {
                var _a;
                if (ownGeneration === generation && !stopped) {
                    retire();
                    (_a = options.onState) === null || _a === void 0 ? void 0 : _a.call(options, 'error', error);
                }
                throw error;
            });
            setup = Promise.race([creation, cancelled]);
            return setup;
        }
        function receive(event) {
            var _a, _b, _c, _d, _e;
            if (stopped)
                return;
            if (['peer-left', 'socket-closed', 'socket-error', 'error'].includes(event.type)) {
                for (const callback of listeners)
                    callback(event);
                retire();
                if (event.type !== 'peer-left')
                    (_a = options.onState) === null || _a === void 0 ? void 0 : _a.call(options, 'signaling-error');
                return;
            }
            // Membership is availability, not an instruction to allocate TURN.
            if (event.type !== 'signal' || !event.frame)
                return;
            let frame;
            try {
                frame = options.validateFrame(event.frame);
            }
            catch (error) {
                (_b = options.onState) === null || _b === void 0 ? void 0 : _b.call(options, 'error', error);
                return;
            }
            const id = identity(frame.data.sdp);
            if (id && retired.has(id))
                return;
            if (!active && !setup && frame.type !== 'offer')
                return;
            if (frame.type === 'offer') {
                if (!id)
                    return;
                const currentIdentity = offerIdentity || identity((_d = (_c = active === null || active === void 0 ? void 0 : active.pc) === null || _c === void 0 ? void 0 : _c.remoteDescription) === null || _d === void 0 ? void 0 : _d.sdp);
                if (active && currentIdentity && currentIdentity !== id)
                    retire();
                offerIdentity = id;
            }
            const validated = { type: 'signal', frame };
            if (active) {
                for (const callback of listeners)
                    callback(validated);
                return;
            }
            const size = JSON.stringify(validated).length;
            if (buffered.length >= 64 || bytes + size > 256 * 1024) {
                retire();
                (_e = options.onState) === null || _e === void 0 ? void 0 : _e.call(options, 'error', new Error('Demasiadas señales Mini pendientes.'));
                return;
            }
            buffered.push(validated);
            bytes += size;
            void ensure().catch(() => { });
        }
        return {
            async start() { var _a; if (stopped)
                throw new Error('Disponibilidad Mini cerrada.'); if (!off)
                off = signaling.onEvent(receive); await signaling.connect(); if (stopped)
                throw new Error('Disponibilidad Mini cerrada.'); if (!active && !setup)
                (_a = options.onState) === null || _a === void 0 ? void 0 : _a.call(options, 'available'); },
            demand() { localDemand = true; return ensure(); },
            retire,
            stop() { if (stopped)
                return; stopped = true; retire(); off === null || off === void 0 ? void 0 : off(); off = null; signaling.close('availability-stop'); },
            getSession: () => active
        };
    }
    function watchAccount(auth, changed) {
        var _a;
        const initialUid = ((_a = auth === null || auth === void 0 ? void 0 : auth.currentUser) === null || _a === void 0 ? void 0 : _a.uid) || null;
        let first = true, generation = 0, disposed = false;
        const peers = new Map();
        function capture() {
            const ownGeneration = generation, snapshot = new Map(peers);
            return { current: peerId => !disposed && generation === ownGeneration && (peerId === undefined || (peers.get(peerId) || 0) === (snapshot.get(peerId) || 0)) };
        }
        const off = (auth === null || auth === void 0 ? void 0 : auth.onAuthStateChanged(user => {
            if (disposed)
                return;
            if (first) {
                first = false;
                if (((user === null || user === void 0 ? void 0 : user.uid) || null) === initialUid)
                    return;
            }
            generation++;
            peers.clear();
            changed(capture());
        })) || (() => { });
        return Object.assign(() => { if (disposed)
            return; disposed = true; generation++; peers.clear(); off(); }, {
            capture,
            invalidatePeer: (peerId) => { peers.set(peerId, (peers.get(peerId) || 0) + 1); }
        });
    }
    return { create, watchAccount };
});
