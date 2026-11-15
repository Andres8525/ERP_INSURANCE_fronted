import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COUNT_UP_DURATION_MS, CountUpDirective, easeOutCubic } from './count-up.directive';

@Component({
  imports: [CountUpDirective],
  template: `<span [appCountUp]="value()" [countUpDecimals]="decimals()"></span>`,
})
class HostComponent {
  readonly value = signal(0);
  readonly decimals = signal(0);
}

describe('CountUpDirective', () => {
  afterEach(() => vi.useRealTimers());

  function create(duration: number) {
    TestBed.configureTestingModule({ providers: [{ provide: COUNT_UP_DURATION_MS, useValue: duration }] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el valor final al instante cuando la animación está desactivada', () => {
    const fixture = create(0);
    fixture.componentInstance.value.set(1284);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toBe('1,284');

    fixture.componentInstance.decimals.set(2);
    fixture.componentInstance.value.set(11.5);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toBe('11.50');
  });

  it('cuenta progresivamente hasta el valor con aceleración suave', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(performance, 'now').mockReturnValue(1000);

    const fixture = create(200);
    fixture.componentInstance.value.set(100);
    fixture.detectChanges();
    await fixture.whenStable();

    const runFrames = (time: number) => frames.splice(0).forEach((callback) => callback(time));
    runFrames(1100);
    const midway = Number(fixture.nativeElement.textContent);
    expect(midway).toBeGreaterThan(50);
    expect(midway).toBeLessThan(100);

    runFrames(1250);
    expect(fixture.nativeElement.textContent).toBe('100');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('usa una curva que arranca rápido y termina exactamente en 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
  });
});
