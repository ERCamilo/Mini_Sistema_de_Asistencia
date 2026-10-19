interface DemandSignalFrame {
  type: 'offer' | 'answer' | 'ice';
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}
interface DemandNegotiationOptions {
  pc: RTCPeerConnection;
  polite: boolean;
  send(type: string, data: RTCSessionDescriptionInit | RTCIceCandidateInit): void;
  prepareChannel(): void;
  discardProvisionalChannel(): void;
  onError(error: unknown): void;
}
(function exposeDemandNegotiation(root: any, factory: () => unknown) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.P2PDemandNegotiation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function demandNegotiationModule() {
  function ufrags(sdp: string = ''): Set<string> {
    return new Set(sdp.split(/\r?\n/).filter(line => line.startsWith('a=ice-ufrag:')).map(line => line.slice(12)));
  }
  function identity(sdp: string = ''): string | null {
    const origin = /^o=[^ ]+ ([^ ]+) ([^ ]+) /m.exec(sdp);
    const fragments = Array.from(ufrags(sdp)).sort();
    return origin && fragments.length ? origin[1] + ':' + origin[2] + ':' + fragments.join(',') : null;
  }
  function create(options: DemandNegotiationOptions) {
    const pc = options.pc;
    let closed = false;
    let tail: Promise<void> = Promise.resolve();
    const pending: RTCIceCandidateInit[] = [];
    let ignored = new Set<string>();
    function enqueue(operation: () => Promise<void>): Promise<void> {
      const next = tail.then(async () => { if (!closed) await operation(); });
      tail = next.catch(error => { if (!closed) options.onError(error); });
      return next;
    }
    function compatible(candidate: RTCIceCandidateInit): boolean {
      // Candidates without a generation identity are unsafe on a reusable route.
      const fragment = candidate.usernameFragment || /(?:^| )ufrag ([^ ]+)/.exec(candidate.candidate || '')?.[1];
      return !!fragment && !ignored.has(fragment) && ufrags(pc.remoteDescription?.sdp).has(fragment);
    }
    async function flush() {
      while (pending.length && !closed) {
        const candidate = pending.shift()!;
        if (compatible(candidate)) await pc.addIceCandidate(candidate);
      }
    }
    function start(): Promise<void> {
      return enqueue(async () => {
        if (pc.signalingState !== 'stable' || pc.remoteDescription) return;
        options.prepareChannel();
        const offer = await pc.createOffer();
        if (closed) return;
        await pc.setLocalDescription(offer);
        if (!closed) options.send('offer', { type: 'offer', sdp: pc.localDescription?.sdp || offer.sdp });
      });
    }
    function receive(frame: DemandSignalFrame): Promise<void> {
      return enqueue(async () => {
        if (frame.type === 'ice') {
          const candidate = frame.data as RTCIceCandidateInit;
          if (!pc.remoteDescription) {
            if (pending.length >= 64) throw new Error('Demasiadas señales ICE pendientes.');
            pending.push(candidate);
          } else if (compatible(candidate)) await pc.addIceCandidate(candidate);
          return;
        }
        const description = frame.data as RTCSessionDescriptionInit;
        if (frame.type === 'offer') {
          const collision = pc.signalingState !== 'stable';
          if (collision && !options.polite) { ignored = ufrags(description.sdp); return; }
          if (collision) {
            options.discardProvisionalChannel();
            await pc.setLocalDescription({ type: 'rollback' });
          }
          if (closed) return;
          ignored = new Set();
          await pc.setRemoteDescription(description);
          await flush();
          const answer = await pc.createAnswer();
          if (closed) return;
          await pc.setLocalDescription(answer);
          if (!closed) options.send('answer', { type: 'answer', sdp: pc.localDescription?.sdp || answer.sdp });
        } else if (pc.signalingState === 'have-local-offer') {
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
