import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ClaimsApi } from '../../core/api/claims.api';
import { ClaimPriority, ClaimResponse, ClaimStatus } from '../../core/api/api.models';
import { ErpStore } from '../../core/state/erp.store';
import { Fmt } from '../../core/ui/format';

interface ClaimColumn {
  status: ClaimStatus;
  title: string;
}

interface ClaimDraft {
  patientId: string;
  description: string;
  priority: ClaimPriority;
  amount: number | null;
  location: string;
  service: string;
}

const COLUMNS: ClaimColumn[] = [
  { status: 'OPEN', title: 'Abierto' },
  { status: 'IN_REVIEW', title: 'En revisión' },
  { status: 'APPROVED', title: 'Aprobado' },
  { status: 'REJECTED', title: 'Rechazado' },
];

const emptyDraft = (): ClaimDraft => ({
  patientId: '',
  description: '',
  priority: 'NORMAL',
  amount: null,
  location: '',
  service: '',
});

/** Pipeline Kanban de siniestros: GET /api/claims/pipeline + CRUD /api/claims. */
@Component({
  selector: 'app-claims-page',
  imports: [FormsModule],
  templateUrl: './claims-page.component.html',
})
export class ClaimsPageComponent {
  readonly store = inject(ErpStore);
  private readonly claimsApi = inject(ClaimsApi);
  readonly fmt = Fmt;
  readonly columns = COLUMNS;

  readonly priorityFilter = signal<'all' | ClaimPriority>('all');
  readonly highPriorityCount = computed(() => this.store.allClaims().filter((c) => c.priority === 'HIGH').length);
  readonly dragging = signal<ClaimResponse | null>(null);
  readonly dropTarget = signal<ClaimStatus | null>(null);
  readonly movingId = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(() => this.store.allClaims().find((c) => c.id === this.selectedId()) ?? null);

  readonly creating = signal(false);
  readonly saving = signal(false);
  draft: ClaimDraft = emptyDraft();

  claimsFor(status: ClaimStatus): ClaimResponse[] {
    const filter = this.priorityFilter();
    const claims = this.store.pipeline()[status];
    return filter === 'all' ? claims : claims.filter((claim) => claim.priority === filter);
  }

  neighbour(status: ClaimStatus, step: 1 | -1): ClaimStatus | null {
    const index = COLUMNS.findIndex((c) => c.status === status) + step;
    return COLUMNS[index]?.status ?? null;
  }

  async move(claim: ClaimResponse, status: ClaimStatus | null): Promise<void> {
    if (!status || this.movingId()) return;
    this.movingId.set(claim.id);
    await this.store.moveClaim(claim, status);
    this.movingId.set(null);
  }

  // --- Drag & drop nativo HTML5 ---
  onDragStart(event: DragEvent, claim: ClaimResponse): void {
    this.dragging.set(claim);
    event.dataTransfer?.setData('text/plain', claim.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent, status: ClaimStatus): void {
    if (!this.dragging()) return;
    event.preventDefault();
    this.dropTarget.set(status);
  }

  onDrop(event: DragEvent, status: ClaimStatus): void {
    event.preventDefault();
    const claim = this.dragging();
    this.dragging.set(null);
    this.dropTarget.set(null);
    if (claim) void this.move(claim, status);
  }

  onDragEnd(): void {
    this.dragging.set(null);
    this.dropTarget.set(null);
  }

  // --- Alta ---
  openCreate(): void {
    this.draft = emptyDraft();
    this.draft.patientId = this.store.patients()[0]?.id ?? '';
    this.creating.set(true);
  }

  async create(): Promise<void> {
    const d = this.draft;
    if (!d.patientId || !d.description.trim() || this.saving()) return;
    this.saving.set(true);
    const ok = await this.store.run(async () => {
      const created = await firstValueFrom(
        this.claimsApi.create({
          patientId: d.patientId,
          description: d.description.trim(),
          priority: d.priority,
          amount: d.amount ?? undefined,
          location: d.location.trim() || undefined,
          services: d.service.trim() ? [{ name: d.service.trim() }] : undefined,
        }),
      );
      await this.store.loadClaims();
      return `Siniestro ${created.claimNumber} registrado.`;
    });
    this.saving.set(false);
    if (ok) this.creating.set(false);
  }

  async remove(claim: ClaimResponse): Promise<void> {
    if (!confirm(`¿Eliminar el siniestro ${claim.claimNumber}? Esta acción no se puede deshacer.`)) return;
    if (await this.store.deleteClaim(claim)) this.selectedId.set(null);
  }
}
