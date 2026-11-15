import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MedicalHubService } from '@core/realtime/medical-hub.service';
import { ClinicalRecord, HubEvent, HubUser, RecordField, RecordLock } from '@core/realtime/realtime.models';

export interface ChatLine {
  id: string;
  from: HubUser;
  text: string;
  sentAt: string;
  deliveredBy?: string;
}

export const FIELD_LABELS: Record<RecordField, string> = {
  motivoConsulta: 'Motivo de consulta',
  diagnostico: 'Diagnóstico',
  evolucion: 'Evolución',
  plan: 'Plan de manejo',
};

@Component({
  selector: 'app-clinical-collaboration-panel',
  imports: [FormsModule],
  templateUrl: './clinical-collaboration-panel.component.html',
})
export class ClinicalCollaborationPanelComponent {
  readonly hub = inject(MedicalHubService);
  readonly fields = Object.keys(FIELD_LABELS) as RecordField[];
  readonly labels = FIELD_LABELS;

  roomId = 'tele-consulta-ana';
  draft = '';
  recordId = 'HC-1001';

  readonly joinedRoom = signal<string | null>(null);
  readonly chat = signal<ChatLine[]>([]);
  readonly typing = signal<string | null>(null);
  readonly presence = signal<string[]>([]);

  readonly record = signal<ClinicalRecord | null>(null);
  readonly lock = signal<RecordLock | null>(null);
  readonly drafts = signal<Partial<Record<RecordField, string>>>({});
  readonly notice = signal<string | null>(null);
  readonly ownsLock = computed(() => {
    const lock = this.lock();
    const me = this.hub.welcome();
    return !!lock && !!me && lock.connectionId === me.connectionId;
  });

  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimers = new Map<RecordField, ReturnType<typeof setTimeout>>();

  constructor() {
    this.hub.events$.pipe(takeUntilDestroyed()).subscribe((event) => this.onEvent(event));
    inject(DestroyRef).onDestroy(() => this.saveTimers.forEach((timer) => clearTimeout(timer)));
  }

  join(): void {
    if (this.joinedRoom()) this.hub.send({ type: 'chat.leave', roomId: this.joinedRoom() });
    if (this.hub.send({ type: 'chat.join', roomId: this.roomId.trim() })) {
      this.chat.set([]);
      this.presence.set([]);
    }
  }

  sendMessage(): void {
    const text = this.draft.trim();
    const room = this.joinedRoom();
    if (!text || !room) return;
    if (this.hub.send({ type: 'chat.message', roomId: room, text })) this.draft = '';
  }

  notifyTyping(): void {
    const room = this.joinedRoom();
    if (room) this.hub.send({ type: 'chat.typing', roomId: room });
  }

  openRecord(): void {
    this.notice.set(null);
    this.hub.send({ type: 'record.open', recordId: this.recordId.trim() });
  }

  toggleLock(): void {
    const record = this.record();
    if (!record) return;
    this.hub.send({ type: this.ownsLock() ? 'record.unlock' : 'record.lock', recordId: record.recordId });
  }

  edit(field: RecordField, value: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [field]: value }));
    clearTimeout(this.saveTimers.get(field));
    this.saveTimers.set(field, setTimeout(() => this.save(field), 600));
  }

  valueOf(field: RecordField): string {
    return this.drafts()[field] ?? this.record()?.fields[field] ?? '';
  }

  private save(field: RecordField): void {
    const record = this.record();
    const value = this.drafts()[field];
    if (!record || value === undefined || !this.ownsLock()) return;
    this.hub.send({ type: 'record.edit', recordId: record.recordId, field, value, baseVersion: record.version });
  }

  private onEvent(event: HubEvent): void {
    switch (event.type) {
      case 'welcome':
        this.joinedRoom.set(null);
        this.lock.set(null);
        return;
      case 'chat.joined':
        this.joinedRoom.set(String(event['roomId']));
        return;
      case 'chat.presence': {
        const user = event['user'] as HubUser;
        this.presence.update((list) => (event['status'] === 'joined' ? [...new Set([...list, user.email])] : list.filter((email) => email !== user.email)));
        return;
      }
      case 'chat.message':
        this.typing.set(null);
        this.chat.update((lines) =>
          [...lines, { id: String(event['messageId']), from: event['from'] as HubUser, text: String(event['text']), sentAt: String(event['sentAt']), deliveredBy: event.deliveredBy }].slice(-50),
        );
        return;
      case 'chat.typing': {
        const from = event['from'] as HubUser;
        if (from.userId === this.hub.welcome()?.principal.userId) return;
        this.typing.set(from.email);
        clearTimeout(this.typingTimer ?? undefined);
        this.typingTimer = setTimeout(() => this.typing.set(null), 2500);
        return;
      }
      case 'record.state':
        this.record.set(event['record'] as ClinicalRecord);
        this.lock.set((event['lock'] as RecordLock | null) ?? null);
        this.drafts.set({});
        return;
      case 'record.locked':
        this.lock.set(event['lock'] as RecordLock);
        this.notice.set(null);
        return;
      case 'record.lock-denied': {
        const lock = event['lock'] as RecordLock;
        this.lock.set(lock);
        this.notice.set(`En edición por ${lock.email}: espera a que libere la historia clínica.`);
        return;
      }
      case 'record.unlocked':
        this.lock.set(null);
        this.drafts.set({});
        this.notice.set(event['reason'] === 'Conexión cerrada' ? 'El editor se desconectó y el bloqueo se liberó automáticamente.' : null);
        return;
      case 'record.updated': {
        const record = event['record'] as ClinicalRecord;
        this.record.set(record);
        const field = event['field'] as RecordField;
        if ((event['by'] as HubUser).userId !== this.hub.welcome()?.principal.userId || this.drafts()[field] === record.fields[field]) {
          this.drafts.update((drafts) => {
            const next = { ...drafts };
            delete next[field];
            return next;
          });
        }
        return;
      }
      case 'record.conflict':
        this.record.set(event['record'] as ClinicalRecord);
        this.lock.set((event['lock'] as RecordLock | null) ?? null);
        this.notice.set(event['reason'] === 'STALE' ? 'Otra edición llegó primero: se recargó la última versión.' : 'Necesitas el bloqueo para editar.');
        this.drafts.set({});
        return;
    }
  }
}
