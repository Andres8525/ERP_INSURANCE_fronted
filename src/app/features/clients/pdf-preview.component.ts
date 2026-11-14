import { Component, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ClientSummary } from '@core/api/api.models';

export interface PdfPreviewState {
  client: ClientSummary;
  blob: Blob | null;
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'app-pdf-preview',
  templateUrl: './pdf-preview.component.html',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class PdfPreviewComponent implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);

  readonly preview = input.required<PdfPreviewState>();
  readonly closed = output<void>();
  readonly download = output<void>();
  readonly retry = output<void>();

  readonly objectUrl = signal<string | null>(null);
  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.objectUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(`${url}#toolbar=1&view=FitH`) : null;
  });
  readonly sizeKb = computed(() => {
    const blob = this.preview().blob;
    return blob ? Math.max(1, Math.round(blob.size / 1024)) : 0;
  });

  private currentBlob: Blob | null = null;

  constructor() {
    effect(() => {
      const blob = this.preview().blob;
      if (blob === this.currentBlob) return;
      this.revoke();
      this.currentBlob = blob;
      this.objectUrl.set(blob ? URL.createObjectURL(blob) : null);
    });
  }

  openInNewTab(): void {
    const url = this.objectUrl();
    if (url) window.open(url, '_blank', 'noopener');
  }

  ngOnDestroy(): void {
    this.revoke();
  }

  private revoke(): void {
    const url = this.objectUrl();
    if (url) URL.revokeObjectURL(url);
    this.objectUrl.set(null);
  }
}
