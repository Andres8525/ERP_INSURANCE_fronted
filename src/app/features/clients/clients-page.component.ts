import { Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ClientSummary } from '@core/api/api.models';
import { ClientsApi } from '@core/api/clients.api';
import { ErpStore } from '@core/state/erp.store';
import { saveBlob } from '@core/ui/download';
import { Fmt, apiErrorMessage } from '@core/ui/format';
import { PdfPreviewComponent, PdfPreviewState } from './pdf-preview.component';

export type ClientFilter = 'all' | 'zero' | 'noPlan';

function normalize(value: string | undefined | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

export function matchesClient(client: ClientSummary, query: string, filter: ClientFilter): boolean {
  if (filter === 'zero' && !client.currentPlan?.zeroPremium) return false;
  if (filter === 'noPlan' && client.currentPlan) return false;
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = [
    client.crmId,
    client.fullName,
    client.email,
    client.phone,
    client.city,
    client.currentPlan?.insurer,
    client.currentPlan?.planName,
  ]
    .map(normalize)
    .join(' ');
  return haystack.includes(needle);
}

@Component({
  selector: 'app-clients-page',
  imports: [FormsModule, PdfPreviewComponent],
  templateUrl: './clients-page.component.html',
})
export class ClientsPageComponent {
  private readonly api = inject(ClientsApi);
  private readonly store = inject(ErpStore);
  readonly fmt = Fmt;
  readonly patientSelected = output<string>();

  readonly clients = signal<ClientSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly query = signal('');
  readonly filter = signal<ClientFilter>('all');
  readonly downloading = signal<string | null>(null);
  readonly preview = signal<PdfPreviewState | null>(null);

  readonly visible = computed(() => this.clients().filter((c) => matchesClient(c, this.query(), this.filter())));
  readonly stats = computed(() => {
    const all = this.clients();
    return {
      total: all.length,
      zero: all.filter((c) => c.currentPlan?.zeroPremium).length,
      noPlan: all.filter((c) => !c.currentPlan).length,
      cities: new Set(all.map((c) => c.city).filter(Boolean)).size,
    };
  });

  constructor() {
    effect(() => {
      this.store.patients();
      untracked(() => void this.load());
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.clients.set(await firstValueFrom(this.api.list()));
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(filter: ClientFilter): void {
    this.filter.set(filter);
  }

  premiumLabel(client: ClientSummary): string {
    const plan = client.currentPlan;
    if (!plan) return 'Sin plan';
    return plan.zeroPremium ? '$0 · subsidio ACA' : `${Fmt.money(plan.premiumAmount)}/mes`;
  }

  async openPreview(client: ClientSummary): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(client.id);
    this.preview.set({ client, blob: null, loading: true, error: null });
    try {
      const blob = await firstValueFrom(this.api.pdf(client.id, 'inline'));
      if (this.preview()?.client.id === client.id) this.preview.set({ client, blob, loading: false, error: null });
    } catch (err) {
      if (this.preview()?.client.id === client.id) {
        this.preview.set({ client, blob: null, loading: false, error: `No se pudo generar el PDF: ${apiErrorMessage(err)}` });
      }
    } finally {
      this.downloading.set(null);
    }
  }

  retryPreview(): void {
    const current = this.preview();
    if (current) void this.openPreview(current.client);
  }

  downloadPreview(): void {
    const current = this.preview();
    if (!current?.blob) return;
    saveBlob(current.blob, `cliente-${current.client.crmId}.pdf`);
    this.store.notify({ kind: 'success', text: `Ficha PDF de ${current.client.fullName} descargada.` });
    this.closePreview();
  }

  closePreview(): void {
    this.preview.set(null);
  }
}
