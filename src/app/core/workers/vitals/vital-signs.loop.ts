import { SLOT, SharedLayout, analyzeSignal, writeResult } from './vital-signs.core';

export interface LoopOptions {
  startFrame?: number;
  maxFrames?: number;
  waitTimeoutMs?: number;
  now?: () => number;
}

export function runSharedLoop(layout: SharedLayout, options: LoopOptions = {}): number {
  const { control, data } = layout;
  const waitTimeout = options.waitTimeoutMs ?? 500;
  const now = options.now ?? (() => performance.now());
  let lastFrame = options.startFrame ?? Atomics.load(control, SLOT.FRAME_SEQ);
  let frames = 0;
  const maxFrames = options.maxFrames ?? Number.POSITIVE_INFINITY;
  while (Atomics.load(control, SLOT.STOP) === 0 && frames < maxFrames) {
    if (Atomics.wait(control, SLOT.FRAME_SEQ, lastFrame, waitTimeout) === 'timed-out') continue;
    const frame = Atomics.load(control, SLOT.FRAME_SEQ);
    if (frame === lastFrame) continue;
    lastFrame = frame;
    if (Atomics.load(control, SLOT.STOP) !== 0) break;
    const startedAt = now();
    const length = Atomics.load(control, SLOT.FRAME_LENGTH);
    const analysis = analyzeSignal(data, length, Atomics.load(control, SLOT.SAMPLE_RATE));
    writeResult(control, analysis, (now() - startedAt) * 1000);
    Atomics.add(control, SLOT.RESULT_SEQ, 1);
    Atomics.notify(control, SLOT.RESULT_SEQ);
    frames++;
  }
  return frames;
}
