import { DestroyRef, Directive, ElementRef, InjectionToken, effect, inject, input } from '@angular/core';

export const COUNT_UP_DURATION_MS = new InjectionToken<number>('COUNT_UP_DURATION_MS', { factory: () => 700 });

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - Math.min(Math.max(progress, 0), 1), 3);
}

@Directive({ selector: '[appCountUp]' })
export class CountUpDirective {
  readonly value = input.required<number>({ alias: 'appCountUp' });
  readonly decimals = input(0, { alias: 'countUpDecimals' });

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly duration = inject(COUNT_UP_DURATION_MS);
  private readonly format = new Map<number, Intl.NumberFormat>();
  private current = 0;
  private frame = 0;

  constructor() {
    effect(() => this.animate(this.value() ?? 0, this.decimals()));
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  private animate(target: number, decimals: number): void {
    this.cancel();
    const from = this.current;
    if (this.duration <= 0 || from === target || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      this.render(target, decimals);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const progress = (now - start) / this.duration;
      this.render(progress >= 1 ? target : from + (target - from) * easeOutCubic(progress), decimals);
      if (progress < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private render(value: number, decimals: number): void {
    this.current = value;
    let formatter = this.format.get(decimals);
    if (!formatter) {
      formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      this.format.set(decimals, formatter);
    }
    this.element.nativeElement.textContent = formatter.format(value);
  }

  private cancel(): void {
    if (this.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
