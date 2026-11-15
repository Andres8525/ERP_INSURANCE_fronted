import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AiInsightResponse, AiStatusResponse } from '@core/api/api.models';
import { AuditApi } from '@core/api/audit.api';
import { AiErrorView, aiErrorView } from '@core/ui/format';
import { renderMarkdown } from '@core/ui/markdown';

export const AI_MARKDOWN_CLASSES =
  'text-[11px] leading-relaxed text-slate-700 [&_h3]:mt-3 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:text-[12px] ' +
  '[&_h4]:font-semibold [&_h4]:text-slate-900 [&_h5]:mt-2 [&_h5]:font-semibold [&_p]:mt-1.5 [&_ul]:mt-1.5 [&_ul]:list-disc ' +
  '[&_ul]:pl-4 [&_ol]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mt-0.5 [&_code]:rounded [&_code]:bg-slate-100 ' +
  '[&_code]:px-1 [&_code]:text-[10px] [&_strong]:font-semibold [&_strong]:text-slate-900';

@Component({
  selector: 'app-ai-insights-panel',
  templateUrl: './ai-insights-panel.component.html',
})
export class AiInsightsPanelComponent {
  private readonly api = inject(AuditApi);
  readonly markdownClasses = AI_MARKDOWN_CLASSES;

  readonly status = signal<AiStatusResponse | null>(null);
  readonly insight = signal<AiInsightResponse | null>(null);
  readonly error = signal<AiErrorView | null>(null);
  readonly loading = signal(false);
  readonly html = computed(() => {
    const insight = this.insight();
    return insight ? renderMarkdown(insight.content) : '';
  });

  constructor() {
    void this.loadStatus();
  }

  async loadStatus(): Promise<void> {
    try {
      this.status.set(await firstValueFrom(this.api.aiStatus()));
    } catch {
      this.status.set(null);
    }
  }

  async generate(refresh = false): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.insight.set(await firstValueFrom(this.api.aiInsights(refresh)));
    } catch (error) {
      this.error.set(aiErrorView(error));
    } finally {
      this.loading.set(false);
    }
  }
}
