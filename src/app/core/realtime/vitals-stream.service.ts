import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { PharmacyNotice, VitalSample, realtimeHttpUrl } from './realtime.models';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

export interface BedState {
  latest: VitalSample;
  heartRate: number[];
  spo2: number[];
}

const HISTORY = 60;
const MAX_NOTICES = 8;

@Injectable()
export class VitalsStreamService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private source: EventSource | null = null;
  private windowStart = 0;
  private windowCount = 0;

  readonly status = signal<StreamStatus>('idle');
  readonly beds = signal<Record<string, BedState>>({});
  readonly pharmacy = signal<PharmacyNotice[]>([]);
  readonly lastEventId = signal<string | null>(null);
  readonly received = signal(0);
  readonly reconnects = signal(0);
  readonly eventsPerSecond = signal(0);
  readonly error = signal<string | null>(null);

  connect(bedIds: string[]): void {
    this.disconnect();
    const params = new URLSearchParams({ access_token: this.auth.token() ?? '' });
    if (bedIds.length) params.set('beds', bedIds.join(','));
    this.status.set('connecting');
    this.error.set(null);
    this.beds.set({});
    const source = new EventSource(realtimeHttpUrl(`/api/realtime/vitals-stream?${params}`));
    this.source = source;

    source.onopen = () => this.status.set('open');
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        this.status.set('error');
        this.error.set('El gateway rechazó o cerró el stream (revisa la sesión y el rol)');
      } else {
        this.status.set('reconnecting');
        this.reconnects.update((count) => count + 1);
      }
    };
    source.addEventListener('vitals', (event) => this.onVitals(event as MessageEvent<string>));
    source.addEventListener('pharmacy', (event) => this.onPharmacy(event as MessageEvent<string>));
    source.addEventListener('reset', () => this.beds.set({}));
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
    this.status.set('idle');
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private track(event: MessageEvent<string>): void {
    if (event.lastEventId) this.lastEventId.set(event.lastEventId);
    this.received.update((count) => count + 1);
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.eventsPerSecond.set(this.windowCount);
      this.windowStart = now;
      this.windowCount = 0;
    }
    this.windowCount += 1;
  }

  private onVitals(event: MessageEvent<string>): void {
    this.track(event);
    const sample = JSON.parse(event.data) as VitalSample;
    this.beds.update((beds) => {
      const previous = beds[sample.bedId];
      return {
        ...beds,
        [sample.bedId]: {
          latest: sample,
          heartRate: [...(previous?.heartRate ?? []), sample.heartRate].slice(-HISTORY),
          spo2: [...(previous?.spo2 ?? []), sample.spo2].slice(-HISTORY),
        },
      };
    });
  }

  private onPharmacy(event: MessageEvent<string>): void {
    this.track(event);
    const notice = JSON.parse(event.data) as PharmacyNotice;
    this.pharmacy.update((notices) => [notice, ...notices].slice(0, MAX_NOTICES));
  }
}
