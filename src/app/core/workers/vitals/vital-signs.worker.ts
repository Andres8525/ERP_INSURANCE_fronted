/// <reference lib="webworker" />

import { serveRpc } from '../protocol/rpc-server';
import { SLOT, analyzeSignal, attachLayout } from './vital-signs.core';
import { VitalsContract } from './vital-signs.contract';
import { runSharedLoop } from './vital-signs.loop';

serveRpc<VitalsContract>(self as DedicatedWorkerGlobalScope, {
  attachShared: ({ buffer, capacity }) => {
    const layout = attachLayout(buffer, capacity);
    const startFrame = Atomics.load(layout.control, SLOT.FRAME_SEQ);
    setTimeout(() => runSharedLoop(layout, { startFrame }), 0);
    return { attached: true };
  },
  analyzeFrame: ({ samples, sampleRate }) => {
    const startedAt = performance.now();
    const analysis = analyzeSignal(samples, samples.length, sampleRate);
    return { ...analysis, workerMicros: Math.round((performance.now() - startedAt) * 1000) };
  },
});
