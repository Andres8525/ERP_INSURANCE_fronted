import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import {
  HEARTBEAT_MS,
  QueuePriority,
  SessionCommand,
  SessionEvent,
  SessionState,
  applyCommand,
  emptyState,
} from './session-sync.core';

export type SyncMode = 'disconnected' | 'shared-worker' | 'local';

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class SessionSyncService implements OnDestroy {
  readonly tabId = randomId();
  readonly supported = typeof SharedWorker !== 'undefined';
  readonly mode = signal<SyncMode>('disconnected');
  readonly state = signal<SessionState>(emptyState());
  readonly lastDenied = signal<{ recordId: string; heldBy: string } | null>(null);
  readonly lastError = signal<string | null>(null);

  readonly tabs = computed(() => this.state().tabs);
  readonly queue = computed(() => this.state().queue);
  readonly locks = computed(() => this.state().locks);
  readonly waiting = computed(() => this.queue().filter((p) => p.status === 'waiting').length);

  private port: MessagePort | null = null;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private localSequence = 0;
  private readonly onPageHide = () => this.disconnect();

  connect(label: string): void {
    if (this.mode() !== 'disconnected') return;
    if (this.supported) {
      try {
        const worker = new SharedWorker(new URL('./session-sync.shared-worker', import.meta.url), {
          type: 'module',
          name: 'erp-session-sync',
        });
        this.port = worker.port;
        this.port.addEventListener('message', (event: MessageEvent<SessionEvent>) => this.receive(event.data));
        this.port.start();
        worker.addEventListener('error', () => this.lastError.set('No se pudo iniciar el Shared Worker.'));
        this.mode.set('shared-worker');
      } catch (error) {
        this.lastError.set(error instanceof Error ? error.message : String(error));
        this.mode.set('local');
      }
    } else {
      this.mode.set('local');
    }
    this.send({ type: 'hello', label });
    this.heartbeat = setInterval(() => this.send({ type: 'heartbeat' }), HEARTBEAT_MS);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
  }

  disconnect(): void {
    if (this.mode() === 'disconnected') return;
    this.send({ type: 'bye' });
    clearInterval(this.heartbeat);
    this.port?.close();
    this.port = null;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
    this.mode.set('disconnected');
    this.state.set(emptyState());
  }

  addPatient(name: string, reason: string, priority: QueuePriority): void {
    this.send({ type: 'queue:add', name, reason, priority });
  }

  callPatient(id: string, caller: string): void {
    this.send({ type: 'queue:call', id, caller });
  }

  removePatient(id: string): void {
    this.send({ type: 'queue:remove', id });
  }

  acquireLock(recordId: string, owner: string): void {
    this.lastDenied.set(null);
    this.send({ type: 'lock:acquire', recordId, owner });
  }

  releaseLock(recordId: string): void {
    this.send({ type: 'lock:release', recordId });
  }

  lockFor(recordId: string) {
    return this.locks().find((lock) => lock.recordId === recordId) ?? null;
  }

  ownsLock(recordId: string): boolean {
    return this.lockFor(recordId)?.tabId === this.tabId;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private send(command: SessionCommand): void {
    if (this.mode() === 'shared-worker' && this.port) {
      this.port.postMessage({ tabId: this.tabId, command });
      return;
    }
    if (this.mode() === 'local') {
      const result = applyCommand(this.state(), { tabId: this.tabId, command }, Date.now(), () => `L${++this.localSequence}`);
      this.state.set(result.state);
      if (result.reply) this.receive(result.reply);
    }
  }

  private receive(event: SessionEvent): void {
    if (event.type === 'state') this.state.set(event.state);
    else if (event.type === 'lock:denied') this.lastDenied.set({ recordId: event.recordId, heldBy: event.heldBy });
    else this.lastError.set(event.message);
  }
}
