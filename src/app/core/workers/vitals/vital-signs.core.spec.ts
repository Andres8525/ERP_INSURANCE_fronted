import { describe, expect, it } from 'vitest';
import {
  CONTROL_SLOTS,
  SAMPLE_RATE,
  SLOT,
  WINDOW_SAMPLES,
  analyzeSignal,
  attachLayout,
  createSharedLayout,
  downsample,
  readResult,
  sharedBufferBytes,
  synthesizeEcg,
} from './vital-signs.core';
import { runSharedLoop } from './vital-signs.loop';
import { canUseSharedMemory, detectCapabilities } from '../worker-status';

describe('señales biomédicas', () => {
  it.each([60, 72, 110])('detecta la frecuencia cardiaca de un ECG sintético a %i lpm', (bpm) => {
    const ecg = synthesizeEcg(0, WINDOW_SAMPLES * 2, SAMPLE_RATE, bpm);
    const analysis = analyzeSignal(ecg, ecg.length, SAMPLE_RATE);
    expect(Math.abs(analysis.heartRate - bpm)).toBeLessThan(2);
    expect(analysis.max).toBeGreaterThan(1000);
    expect(analysis.peaks).toBeGreaterThanOrEqual(Math.floor((bpm * 8) / 60) - 1);
  });

  it('devuelve ceros para una ventana vacía y reduce la forma de onda', () => {
    expect(analyzeSignal(new Int32Array(0), 0, SAMPLE_RATE)).toEqual({ min: 0, max: 0, mean: 0, rms: 0, heartRate: 0, peaks: 0 });
    expect(downsample(Int32Array.from([1, 2, 3, 4, 5, 6]), 6, 3)).toEqual([1, 3, 5]);
  });

  it('reserva un bloque de control seguido por las muestras', () => {
    expect(sharedBufferBytes(100)).toBe((CONTROL_SLOTS + 100) * 4);
    const layout = createSharedLayout(100);
    const view = attachLayout(layout.buffer, 100);
    view.data[0] = 42;
    expect(layout.data[0]).toBe(42);
    expect(Atomics.load(layout.control, SLOT.SAMPLE_RATE)).toBe(SAMPLE_RATE);
  });

  it('el bucle del worker procesa un frame publicado con Atomics y notifica el resultado', () => {
    const layout = createSharedLayout(WINDOW_SAMPLES);
    synthesizeEcg(0, WINDOW_SAMPLES, SAMPLE_RATE, 80, layout.data);
    Atomics.store(layout.control, SLOT.FRAME_LENGTH, WINDOW_SAMPLES);
    Atomics.add(layout.control, SLOT.FRAME_SEQ, 1);

    const processed = runSharedLoop(layout, { startFrame: 0, maxFrames: 1, waitTimeoutMs: 10 });

    expect(processed).toBe(1);
    expect(Atomics.load(layout.control, SLOT.RESULT_SEQ)).toBe(1);
    const result = readResult(layout.control);
    expect(Math.abs(result.heartRate - 80)).toBeLessThan(3);
    expect(result.processed).toBe(1);
  });

  it('el bucle termina con la bandera STOP', () => {
    const layout = createSharedLayout(16);
    Atomics.store(layout.control, SLOT.STOP, 1);
    expect(runSharedLoop(layout, { waitTimeoutMs: 1 })).toBe(0);
  });

  it('solo usa memoria compartida con crossOriginIsolated', () => {
    const isolated = detectCapabilities({ crossOriginIsolated: true, SharedArrayBuffer } as unknown as typeof globalThis);
    const notIsolated = detectCapabilities({ crossOriginIsolated: false, SharedArrayBuffer } as unknown as typeof globalThis);
    expect(canUseSharedMemory(isolated)).toBe(true);
    expect(canUseSharedMemory(notIsolated)).toBe(false);
  });
});
