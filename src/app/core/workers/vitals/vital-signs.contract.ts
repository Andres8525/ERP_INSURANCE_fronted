import { SignalAnalysis } from './vital-signs.core';

export type VitalsContract = {
  attachShared: { payload: { buffer: SharedArrayBuffer; capacity: number }; result: { attached: true } };
  analyzeFrame: { payload: { samples: Int32Array; sampleRate: number }; result: SignalAnalysis & { workerMicros: number } };
};
