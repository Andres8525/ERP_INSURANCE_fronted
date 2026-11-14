import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { WorkerRpcClient } from '../protocol/worker-rpc-client';
import { canUseSharedMemory, detectCapabilities } from '../worker-status';
import { VitalsContract } from './vital-signs.contract';
import {
  SAMPLE_RATE,
  SLOT,
  SharedLayout,
  SignalAnalysis,
  WINDOW_SAMPLES,
  createSharedLayout,
  downsample,
  readResult,
  synthesizeEcg,
} from './vital-signs.core';

export type TransportMode = 'shared-memory' | 'post-message';

export interface FrameResult extends SignalAnalysis {
  workerMicros: number;
  latencyMs: number;
}

export interface BenchmarkResult {
  frames: number;
  sharedMemoryMs: number | null;
  postMessageMs: number;
}

const FRAME_INTERVAL_MS = 100;
const SAMPLES_PER_TICK = (SAMPLE_RATE * FRAME_INTERVAL_MS) / 1000;

interface Session {
  mode: TransportMode;
  worker: Worker;
  client: WorkerRpcClient<VitalsContract>;
  layout: SharedLayout | null;
}

async function waitForChange(control: Int32Array, index: number, previous: number, timeoutMs: number): Promise<boolean> {
  const waitAsync = (Atomics as unknown as {
    waitAsync?: (array: Int32Array, index: number, value: number, timeout: number) => { async: boolean; value: unknown };
  }).waitAsync;
  if (waitAsync) {
    const outcome = waitAsync(control, index, previous, timeoutMs);
    const value = outcome.async ? await (outcome.value as Promise<string>) : outcome.value;
    return value !== 'timed-out';
  }
  const deadline = performance.now() + timeoutMs;
  while (Atomics.load(control, index) === previous) {
    if (performance.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return true;
}

@Injectable({ providedIn: 'root' })
export class VitalSignsService implements OnDestroy {
  readonly capabilities = detectCapabilities();
  readonly sharedMemoryAvailable = canUseSharedMemory(this.capabilities);
  readonly supported = this.capabilities.webWorker;

  readonly mode = signal<TransportMode>(this.sharedMemoryAvailable ? 'shared-memory' : 'post-message');
  readonly running = signal(false);
  readonly bpm = signal(72);
  readonly latest = signal<FrameResult | null>(null);
  readonly averageLatencyMs = signal<number | null>(null);
  readonly frames = signal(0);
  readonly waveform = signal<number[]>([]);
  readonly lastError = signal<string | null>(null);
  readonly benchmarking = signal(false);
  readonly benchmark = signal<BenchmarkResult | null>(null);

  readonly waveformPath = computed(() => {
    const points = this.waveform();
    if (points.length < 2) return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    return points
      .map((value, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * 300).toFixed(1)},${(58 - ((value - min) / span) * 54).toFixed(1)}`)
      .join(' ');
  });

  private session: Session | null = null;
  private ticker: ReturnType<typeof setInterval> | undefined;
  private cursor = 0;
  private inFlight = false;
  private readonly frameBuffer = new Int32Array(WINDOW_SAMPLES);

  async start(forceMode?: TransportMode): Promise<void> {
    if (this.running() || !this.supported) return;
    const mode = forceMode === 'shared-memory' && !this.sharedMemoryAvailable ? 'post-message' : (forceMode ?? this.mode());
    this.lastError.set(null);
    this.frames.set(0);
    this.averageLatencyMs.set(null);
    try {
      this.session = await this.openSession(mode);
      this.mode.set(mode);
      this.running.set(true);
      this.ticker = setInterval(() => void this.tick(), FRAME_INTERVAL_MS);
    } catch (error) {
      this.lastError.set(error instanceof Error ? error.message : String(error));
      this.closeSession();
    }
  }

  stop(): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
    this.running.set(false);
    this.closeSession();
  }

  setBpm(value: number): void {
    this.bpm.set(Math.max(30, Math.min(220, Math.round(value))));
  }

  async runBenchmark(frames = 150): Promise<BenchmarkResult> {
    if (this.running()) this.stop();
    this.benchmarking.set(true);
    try {
      const measure = async (mode: TransportMode) => {
        const session = await this.openSession(mode);
        let total = 0;
        try {
          for (let i = 0; i < frames; i++) {
            synthesizeEcg(i * SAMPLES_PER_TICK, WINDOW_SAMPLES, SAMPLE_RATE, 72, this.frameBuffer);
            total += (await this.process(session, this.frameBuffer)).latencyMs;
          }
        } finally {
          this.dispose(session);
        }
        return Math.round((total / frames) * 1000) / 1000;
      };
      const result: BenchmarkResult = {
        frames,
        postMessageMs: await measure('post-message'),
        sharedMemoryMs: this.sharedMemoryAvailable ? await measure('shared-memory') : null,
      };
      this.benchmark.set(result);
      return result;
    } finally {
      this.benchmarking.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private async tick(): Promise<void> {
    if (!this.session || this.inFlight) return;
    this.inFlight = true;
    try {
      this.cursor += SAMPLES_PER_TICK;
      synthesizeEcg(this.cursor, WINDOW_SAMPLES, SAMPLE_RATE, this.bpm(), this.frameBuffer);
      const result = await this.process(this.session, this.frameBuffer);
      this.latest.set(result);
      this.frames.update((n) => n + 1);
      const previous = this.averageLatencyMs();
      this.averageLatencyMs.set(previous === null ? result.latencyMs : Math.round((previous * 0.9 + result.latencyMs * 0.1) * 1000) / 1000);
      this.waveform.set(downsample(this.frameBuffer, WINDOW_SAMPLES, 240));
    } catch (error) {
      this.lastError.set(error instanceof Error ? error.message : String(error));
      this.stop();
    } finally {
      this.inFlight = false;
    }
  }

  private async process(session: Session, samples: Int32Array): Promise<FrameResult> {
    const startedAt = performance.now();
    if (session.mode === 'shared-memory' && session.layout) {
      const { control, data } = session.layout;
      data.set(samples);
      const previous = Atomics.load(control, SLOT.RESULT_SEQ);
      Atomics.store(control, SLOT.FRAME_LENGTH, samples.length);
      Atomics.add(control, SLOT.FRAME_SEQ, 1);
      Atomics.notify(control, SLOT.FRAME_SEQ);
      if (!(await waitForChange(control, SLOT.RESULT_SEQ, previous, 2_000))) {
        throw new Error('El worker de signos vitales no respondió por memoria compartida.');
      }
      const result = readResult(control);
      return { ...result, latencyMs: performance.now() - startedAt };
    }
    const copy = samples.slice();
    const { result } = await session.client.call('analyzeFrame', { samples: copy, sampleRate: SAMPLE_RATE }, {
      transfer: [copy.buffer],
      timeoutMs: 2_000,
    });
    return { ...result, latencyMs: performance.now() - startedAt };
  }

  private async openSession(mode: TransportMode): Promise<Session> {
    const worker = new Worker(new URL('./vital-signs.worker', import.meta.url), { type: 'module', name: `vital-signs-${mode}` });
    const client = new WorkerRpcClient<VitalsContract>(worker, 5_000);
    let layout: SharedLayout | null = null;
    if (mode === 'shared-memory') {
      layout = createSharedLayout(WINDOW_SAMPLES, SAMPLE_RATE);
      await client.call('attachShared', { buffer: layout.buffer, capacity: WINDOW_SAMPLES });
    }
    return { mode, worker, client, layout };
  }

  private closeSession(): void {
    if (this.session) this.dispose(this.session);
    this.session = null;
  }

  private dispose(session: Session): void {
    if (session.layout) {
      Atomics.store(session.layout.control, SLOT.STOP, 1);
      Atomics.notify(session.layout.control, SLOT.FRAME_SEQ);
    }
    session.client.dispose();
  }
}
