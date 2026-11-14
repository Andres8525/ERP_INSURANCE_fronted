export const SLOT = {
  FRAME_SEQ: 0,
  FRAME_LENGTH: 1,
  RESULT_SEQ: 2,
  STOP: 3,
  SAMPLE_RATE: 4,
  MIN: 5,
  MAX: 6,
  MEAN: 7,
  RMS: 8,
  HEART_RATE_X100: 9,
  PEAKS: 10,
  PROCESSED: 11,
  WORKER_MICROS: 12,
} as const;

export const CONTROL_SLOTS = 16;
export const SAMPLE_RATE = 250;
export const WINDOW_SAMPLES = SAMPLE_RATE * 4;

export interface SignalAnalysis {
  min: number;
  max: number;
  mean: number;
  rms: number;
  heartRate: number;
  peaks: number;
}

export interface SharedLayout {
  buffer: SharedArrayBuffer;
  control: Int32Array;
  data: Int32Array;
  capacity: number;
}

export function sharedBufferBytes(capacity: number): number {
  return (CONTROL_SLOTS + capacity) * Int32Array.BYTES_PER_ELEMENT;
}

export function attachLayout(buffer: SharedArrayBuffer, capacity: number): SharedLayout {
  return {
    buffer,
    capacity,
    control: new Int32Array(buffer, 0, CONTROL_SLOTS),
    data: new Int32Array(buffer, CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT, capacity),
  };
}

export function createSharedLayout(capacity: number, sampleRate = SAMPLE_RATE): SharedLayout {
  const layout = attachLayout(new SharedArrayBuffer(sharedBufferBytes(capacity)), capacity);
  Atomics.store(layout.control, SLOT.SAMPLE_RATE, sampleRate);
  return layout;
}

export function analyzeSignal(samples: ArrayLike<number>, length: number, sampleRate: number): SignalAnalysis {
  const n = Math.min(length, samples.length);
  if (n === 0) return { min: 0, max: 0, mean: 0, rms: 0, heartRate: 0, peaks: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < n; i++) {
    const value = samples[i];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    squares += value * value;
  }
  const mean = sum / n;
  const threshold = mean + 0.6 * (max - mean);
  const refractory = Math.round(sampleRate * 0.25);
  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const value = samples[i];
    if (value < threshold || value < samples[i - 1] || value < samples[i + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && i - last < refractory) {
      if (value > samples[last]) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  let heartRate = 0;
  if (peaks.length >= 2) {
    const averageInterval = (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1);
    heartRate = (60 * sampleRate) / averageInterval;
  }
  return {
    min,
    max,
    mean: Math.round(mean * 100) / 100,
    rms: Math.round(Math.sqrt(squares / n) * 100) / 100,
    heartRate: Math.round(heartRate * 10) / 10,
    peaks: peaks.length,
  };
}

function gaussian(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-0.5 * d * d);
}

export function synthesizeEcg(
  startSample: number,
  length: number,
  sampleRate: number,
  bpm: number,
  out: Int32Array<ArrayBufferLike> = new Int32Array(length),
  noise = 25,
): Int32Array<ArrayBufferLike> {
  const period = 60 / bpm;
  for (let i = 0; i < length; i++) {
    const n = startSample + i;
    const t = n / sampleRate;
    const phase = (t % period) / period;
    const value =
      150 * gaussian(phase, 0.12, 0.025) -
      90 * gaussian(phase, 0.22, 0.008) +
      1200 * gaussian(phase, 0.25, 0.01) -
      180 * gaussian(phase, 0.28, 0.01) +
      320 * gaussian(phase, 0.5, 0.045);
    const jitter = noise * Math.sin(n * 12.9898 + 78.233) * Math.sin(n * 0.37);
    out[i] = Math.round(value + jitter);
  }
  return out;
}

export function writeResult(control: Int32Array, analysis: SignalAnalysis, workerMicros: number): void {
  Atomics.store(control, SLOT.MIN, Math.round(analysis.min));
  Atomics.store(control, SLOT.MAX, Math.round(analysis.max));
  Atomics.store(control, SLOT.MEAN, Math.round(analysis.mean));
  Atomics.store(control, SLOT.RMS, Math.round(analysis.rms));
  Atomics.store(control, SLOT.HEART_RATE_X100, Math.round(analysis.heartRate * 100));
  Atomics.store(control, SLOT.PEAKS, analysis.peaks);
  Atomics.store(control, SLOT.WORKER_MICROS, Math.round(workerMicros));
  Atomics.add(control, SLOT.PROCESSED, 1);
}

export function readResult(control: Int32Array): SignalAnalysis & { workerMicros: number; processed: number } {
  return {
    min: Atomics.load(control, SLOT.MIN),
    max: Atomics.load(control, SLOT.MAX),
    mean: Atomics.load(control, SLOT.MEAN),
    rms: Atomics.load(control, SLOT.RMS),
    heartRate: Atomics.load(control, SLOT.HEART_RATE_X100) / 100,
    peaks: Atomics.load(control, SLOT.PEAKS),
    workerMicros: Atomics.load(control, SLOT.WORKER_MICROS),
    processed: Atomics.load(control, SLOT.PROCESSED),
  };
}

export function downsample(samples: ArrayLike<number>, length: number, points: number): number[] {
  const n = Math.min(length, samples.length);
  if (n <= points) return Array.from({ length: n }, (_, i) => samples[i]);
  const step = n / points;
  return Array.from({ length: points }, (_, i) => samples[Math.floor(i * step)]);
}
