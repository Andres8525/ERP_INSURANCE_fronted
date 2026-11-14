import { Component, computed, inject, signal } from '@angular/core';
import { CatalogProbe, OfflineService } from '@core/workers/offline/offline.service';

@Component({
  selector: 'app-offline-panel',
  templateUrl: './offline-panel.component.html',
})
export class OfflinePanelComponent {
  readonly offline = inject(OfflineService);
  readonly busy = signal<string | null>(null);
  readonly probe = signal<CatalogProbe | null>(null);
  readonly message = signal<string | null>(null);

  readonly stateLabel = computed(() => ({
    unsupported: 'No soportado',
    registering: 'Registrando',
    installing: 'Instalando',
    active: 'Activo',
    error: 'Error',
  })[this.offline.state()]);

  readonly lastEventLabel = computed(() => {
    const event = this.offline.lastEvent();
    if (!event) return null;
    return event.type === 'outbox:queued'
      ? `Escritura encolada sin conexión (${event.pending} pendiente[s]).`
      : `Sincronización en segundo plano: ${event.flushed} enviada(s), ${event.pending} pendiente(s).`;
  });

  async precache(): Promise<void> {
    await this.run('precache', async () => `${await this.offline.precacheCatalogs()} catálogo(s) guardado(s) para uso sin conexión.`);
  }

  async test(): Promise<void> {
    await this.run('probe', async () => {
      const result = await this.offline.probeCatalog();
      this.probe.set(result);
      return null;
    });
  }

  async flush(): Promise<void> {
    await this.run('flush', async () => `${await this.offline.flush()} escritura(s) pendiente(s) enviada(s).`);
  }

  async clear(): Promise<void> {
    await this.run('clear', async () => {
      await this.offline.clearCaches();
      this.probe.set(null);
      return 'Cachés del Service Worker vaciadas.';
    });
  }

  private async run(kind: string, action: () => Promise<string | null>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(kind);
    this.message.set(null);
    try {
      this.message.set(await action());
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(null);
    }
  }
}
