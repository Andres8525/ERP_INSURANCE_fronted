import { Component, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AiInsightResponse, AnomalyResponse, BatchResolutionAction } from '@core/api/api.models';
import { AuditApi } from '@core/api/audit.api';
import { ErpStore } from '@core/state/erp.store';
import { AiErrorView, aiErrorView, aiProviderLabel, Fmt } from '@core/ui/format';
import { renderMarkdown } from '@core/ui/markdown';
import { AI_MARKDOWN_CLASSES } from './ai-insights-panel.component';
import { AiReportComponent } from './ai-report.component';

@Component({
  selector: 'app-anomaly-detail',
  imports: [AiReportComponent],
  templateUrl: './anomaly-detail.component.html',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class AnomalyDetailComponent {
  private readonly store = inject(ErpStore);
  private readonly api = inject(AuditApi);
  readonly fmt = Fmt;
  readonly markdownClasses = AI_MARKDOWN_CLASSES;

  readonly anomaly = input.required<AnomalyResponse>();
  readonly closed = output<void>();
  readonly busy = signal<BatchResolutionAction | null>(null);
  readonly explanation = signal<AiInsightResponse | null>(null);
  readonly explaining = signal(false);
  readonly explanationError = signal<AiErrorView | null>(null);
  readonly explanationHtml = computed(() => {
    const explanation = this.explanation();
    return explanation && !explanation.report ? renderMarkdown(explanation.content) : '';
  });
  readonly providerName = computed(() => aiProviderLabel(this.explanation()?.provider));

  async explain(): Promise<void> {
    if (this.explaining()) return;
    this.explaining.set(true);
    this.explanationError.set(null);
    try {
      this.explanation.set(await firstValueFrom(this.api.aiExplanation(this.anomaly().id)));
    } catch (error) {
      this.explanationError.set(aiErrorView(error));
    } finally {
      this.explaining.set(false);
    }
  }

  async resolve(action: BatchResolutionAction): Promise<void> {
    if (this.busy()) return;
    this.busy.set(action);
    const ok = await this.store.resolveAnomalies([this.anomaly().id], action);
    this.busy.set(null);
    if (ok) this.closed.emit();
  }
}
