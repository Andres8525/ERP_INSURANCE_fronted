import { Component, computed, input } from '@angular/core';
import { AiPriority, AiReport } from '@core/api/api.models';
import { riskView } from '@core/ui/format';

@Component({
  selector: 'app-ai-report',
  templateUrl: './ai-report.component.html',
  styles: `
    @media (min-width: 1024px) {
      .report-split {
        grid-template-columns: 3fr 2fr;
      }
    }
  `,
})
export class AiReportComponent {
  readonly report = input.required<AiReport>();
  readonly compact = input(false);

  readonly risk = computed(() => riskView(this.report().riskLevel));
  readonly actionsTitle = computed(() => (this.compact() ? 'Cómo corregirlo' : 'Acciones recomendadas'));

  severityTone(priority: AiPriority): 'critical' | 'review' | 'mixed' | null {
    switch (priority.severity) {
      case 'Crítica':
        return 'critical';
      case 'Revisión':
        return 'review';
      case 'Mixta':
        return 'mixed';
      default:
        return null;
    }
  }

  caseLabel(count: number | undefined): string | null {
    if (!count) return null;
    return count === 1 ? '1 caso' : `${count} casos`;
  }
}
