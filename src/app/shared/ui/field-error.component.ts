import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as text) {
      <span class="field-error" role="alert" [id]="fieldId() + '-error'">{{ text }}</span>
    }
  `,
})
export class FieldErrorComponent {
  readonly fieldId = input.required<string>();
  readonly message = input<string | null | undefined>(null);
}
