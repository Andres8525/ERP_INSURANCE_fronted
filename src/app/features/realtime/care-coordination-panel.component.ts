import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MedicalHubService } from '@core/realtime/medical-hub.service';
import { FanOutReport, HubEvent, HubUser } from '@core/realtime/realtime.models';

export interface ConsultItem {
  consultId: string;
  from: HubUser;
  specialty: string;
  message: string;
  priority: 'ROUTINE' | 'URGENT';
  originInstance?: string;
  deliveredBy?: string;
  answered?: boolean;
}

export interface AlertItem {
  id: string;
  kind: 'code-blue' | 'turn';
  title: string;
  detail: string;
  at: string;
  originInstance?: string;
}

export interface FanOutSummary {
  referenceId: string;
  event: string;
  instances: string[];
  delivered: number;
  recipients: number;
  batches: number;
  maxDurationMs: number;
}

export function mergeReport(summaries: FanOutSummary[], event: HubEvent): FanOutSummary[] {
  const report = event['report'] as FanOutReport;
  const referenceId = String(event['referenceId']);
  const instance = String(event['instanceId']);
  const existing = summaries.find((summary) => summary.referenceId === referenceId);
  if (!existing) {
    return [
      { referenceId, event: String(event['event']), instances: [instance], delivered: report.delivered, recipients: report.recipients, batches: report.batches, maxDurationMs: report.durationMs },
      ...summaries,
    ].slice(0, 5);
  }
  return summaries.map((summary) =>
    summary === existing
      ? {
          ...summary,
          instances: [...summary.instances, instance],
          delivered: summary.delivered + report.delivered,
          recipients: summary.recipients + report.recipients,
          batches: summary.batches + report.batches,
          maxDurationMs: Math.max(summary.maxDurationMs, report.durationMs),
        }
      : summary,
  );
}

@Component({
  selector: 'app-care-coordination-panel',
  imports: [FormsModule],
  templateUrl: './care-coordination-panel.component.html',
})
export class CareCoordinationPanelComponent {
  readonly hub = inject(MedicalHubService);

  consult = { toUserId: '', specialty: 'Cardiología', message: '', priority: 'URGENT' as 'ROUTINE' | 'URGENT' };
  location = 'UCI · cama 3';
  scope: 'sede' | 'all' = 'sede';
  turn = { ticket: 'A-042', room: 'Consultorio 3' };

  readonly incoming = signal<ConsultItem[]>([]);
  readonly outgoing = signal<Array<{ consultId: string; toUserId: string; status: string }>>([]);
  readonly alerts = signal<AlertItem[]>([]);
  readonly flashing = signal<AlertItem | null>(null);
  readonly reports = signal<FanOutSummary[]>([]);
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.hub.events$.pipe(takeUntilDestroyed()).subscribe((event) => this.onEvent(event));
  }

  requestConsult(): void {
    const { toUserId, specialty, message, priority } = this.consult;
    if (!toUserId.trim() || !message.trim()) return;
    if (this.hub.send({ type: 'consult.request', toUserId: toUserId.trim(), specialty, message, priority })) this.consult.message = '';
  }

  respond(item: ConsultItem, accepted: boolean): void {
    this.hub.send({ type: 'consult.respond', consultId: item.consultId, toUserId: item.from.userId, accepted, message: accepted ? 'Acepto, voy en camino' : 'No disponible ahora' });
    this.incoming.update((items) => items.map((each) => (each.consultId === item.consultId ? { ...each, answered: true } : each)));
  }

  codeBlue(): void {
    this.hub.send({ type: 'alert.code-blue', location: this.location, scope: this.scope });
  }

  callTurn(): void {
    this.hub.send({ type: 'turns.call', ticket: this.turn.ticket, room: this.turn.room });
  }

  private pushAlert(alert: AlertItem): void {
    this.alerts.update((alerts) => [alert, ...alerts].slice(0, 8));
    if (alert.kind === 'code-blue') {
      this.flashing.set(alert);
      clearTimeout(this.flashTimer ?? undefined);
      this.flashTimer = setTimeout(() => this.flashing.set(null), 6000);
    }
  }

  private setOutgoing(consultId: string, status: string, toUserId?: string): void {
    this.outgoing.update((items) => {
      const exists = items.some((item) => item.consultId === consultId);
      if (!exists && toUserId) return [{ consultId, toUserId, status }, ...items].slice(0, 6);
      return items.map((item) => (item.consultId === consultId ? { ...item, status } : item));
    });
  }

  private onEvent(event: HubEvent): void {
    switch (event.type) {
      case 'consult.sent':
        this.setOutgoing(String(event['consultId']), `Enviada vía ${String(event['viaInstance'])}…`, String(event['toUserId']));
        return;
      case 'consult.delivered':
        this.setOutgoing(String(event['consultId']), `Entregada en ${String(event['deliveredByInstance'])} (${String(event['devices'])} dispositivo/s)`);
        return;
      case 'consult.response':
        this.setOutgoing(String(event['consultId']), event['accepted'] ? `Aceptada: ${String(event['message'])}` : `Rechazada: ${String(event['message'])}`);
        return;
      case 'consult.request':
        this.incoming.update((items) => [{ ...(event as unknown as ConsultItem) }, ...items].slice(0, 6));
        return;
      case 'alert.code-blue':
        this.pushAlert({
          id: String(event['alertId']),
          kind: 'code-blue',
          title: `CÓDIGO AZUL · ${String(event['location'])}`,
          detail: `${String(event['sedeId'])} · activado por ${(event['raisedBy'] as HubUser).email}`,
          at: String(event['raisedAt']),
          originInstance: event.originInstance,
        });
        return;
      case 'turns.called':
        this.pushAlert({
          id: String(event['callId']),
          kind: 'turn',
          title: `Turno ${String(event['ticket'])} → ${String(event['room'])}`,
          detail: String(event['sedeId']),
          at: String(event['calledAt']),
          originInstance: event.originInstance,
        });
        return;
      case 'fanout.report':
        this.reports.update((summaries) => mergeReport(summaries, event));
        return;
    }
  }
}
