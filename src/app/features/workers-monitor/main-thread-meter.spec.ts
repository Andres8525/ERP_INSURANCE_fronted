import { describe, expect, it } from 'vitest';
import { FrameMeter } from './main-thread-meter';

describe('FrameMeter', () => {
  it('cuenta los frames del último segundo y detecta bloqueos del hilo principal', () => {
    const meter = new FrameMeter();
    for (let t = 0; t <= 1000; t += 16) meter.record(t);
    expect(meter.sample().fps).toBeGreaterThanOrEqual(60);
    expect(meter.sample().blockedFrames).toBe(0);

    meter.record(1400);
    const blocked = meter.sample();
    expect(blocked.longestFrameMs).toBeGreaterThanOrEqual(400);
    expect(blocked.blockedFrames).toBe(1);
    expect(blocked.fps).toBeLessThan(60);
  });
});
