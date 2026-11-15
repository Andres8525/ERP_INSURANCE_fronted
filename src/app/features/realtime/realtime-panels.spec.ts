import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MedicalHubService } from '@core/realtime/medical-hub.service';
import { HubEvent } from '@core/realtime/realtime.models';
import { CareCoordinationPanelComponent, mergeReport } from './care-coordination-panel.component';
import { ClinicalCollaborationPanelComponent } from './clinical-collaboration-panel.component';
import { RealtimePageComponent } from './realtime-page.component';
import { sparklinePoints } from './sparkline';

function fakeHub() {
  return {
    events$: new Subject<HubEvent>(),
    send: vi.fn(() => true),
    connected: signal(true),
    status: signal('open'),
    welcome: signal({ connectionId: 'c-me', instanceId: 'gw-a', principal: { userId: 'medico-1', email: 'medico1@nexo.demo', clinicalRole: 'MEDICO', sedeId: 'SEDE-MIA' } }),
  };
}

function mount<T>(component: Type<T>) {
  const hub = fakeHub();
  TestBed.configureTestingModule({ imports: [component], providers: [{ provide: MedicalHubService, useValue: hub }] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, hub, element: fixture.nativeElement as HTMLElement };
}

const record = (version: number, diagnostico = '') => ({
  recordId: 'HC-1001',
  version,
  fields: { motivoConsulta: '', diagnostico, evolucion: '', plan: '' },
  updatedAt: '2026-11-15T10:00:00Z',
  updatedBy: version ? 'medico1@nexo.demo' : null,
});

describe('sparkline', () => {
  it('escala los valores al alto del gráfico', () => {
    expect(sparklinePoints([])).toBe('');
    expect(sparklinePoints([60, 80, 100], 100, 20, 0)).toBe('0,20 50,10 100,0');
    expect(sparklinePoints([5, 5], 10, 10, 0)).toBe('0,10 10,10');
  });
});

describe('mergeReport', () => {
  it('suma los reportes de fan-out de cada réplica para la misma alerta', () => {
    const report = (instanceId: string, delivered: number, durationMs: number): HubEvent => ({
      type: 'fanout.report',
      event: 'alert.code-blue',
      referenceId: 'a-1',
      instanceId,
      report: { recipients: delivered, delivered, skippedClosed: 0, skippedSlow: 0, failed: 0, batches: 2, bytes: 10, durationMs },
    });
    const merged = mergeReport(mergeReport([], report('gw-a', 300, 1.2)), report('gw-b', 700, 2.5));
    expect(merged).toEqual([{ referenceId: 'a-1', event: 'alert.code-blue', instances: ['gw-a', 'gw-b'], delivered: 1000, recipients: 1000, batches: 4, maxDurationMs: 2.5 }]);
  });
});

describe('ClinicalCollaborationPanelComponent', () => {
  it('chat: se une a la sala y pinta los mensajes de otras réplicas', () => {
    const { component, hub, fixture, element } = mount(ClinicalCollaborationPanelComponent);
    component.join();
    expect(hub.send).toHaveBeenCalledWith({ type: 'chat.join', roomId: 'tele-consulta-ana' });

    hub.events$.next({ type: 'chat.joined', roomId: 'tele-consulta-ana' });
    hub.events$.next({ type: 'chat.message', messageId: 'm-1', text: 'Hola doctor', sentAt: 'x', deliveredBy: 'gw-b', from: { userId: 'p-1', email: 'ana@nexo.demo', clinicalRole: 'RECEPCION', sedeId: 'SEDE-MIA' } });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="chat-log"]')?.textContent).toContain('Hola doctor');

    component.draft = 'Tome paracetamol';
    component.sendMessage();
    expect(hub.send).toHaveBeenLastCalledWith({ type: 'chat.message', roomId: 'tele-consulta-ana', text: 'Tome paracetamol' });
  });

  it('historia clínica: solo edita quien tiene el bloqueo y guarda con la versión base', async () => {
    vi.useFakeTimers();
    const { component, hub, fixture, element } = mount(ClinicalCollaborationPanelComponent);
    hub.events$.next({ type: 'record.state', record: record(0), lock: null });
    hub.events$.next({ type: 'record.locked', lock: { recordId: 'HC-1001', userId: 'medico-1', email: 'medico1@nexo.demo', connectionId: 'c-me', acquiredAt: 1, expiresAt: 2 } });
    fixture.detectChanges();
    expect(component.ownsLock()).toBe(true);
    expect(element.querySelector('[data-testid="record-lock"]')?.textContent).toContain('Editando tú');

    component.edit('diagnostico', 'Neumonía');
    await vi.advanceTimersByTimeAsync(600);
    expect(hub.send).toHaveBeenLastCalledWith({ type: 'record.edit', recordId: 'HC-1001', field: 'diagnostico', value: 'Neumonía', baseVersion: 0 });

    hub.events$.next({ type: 'record.updated', field: 'diagnostico', record: record(1, 'Neumonía'), by: { userId: 'medico-1' } });
    expect(component.valueOf('diagnostico')).toBe('Neumonía');

    hub.events$.next({ type: 'record.lock-denied', lock: { recordId: 'HC-1001', userId: 'e-1', email: 'enfermera@nexo.demo', connectionId: 'c-otro', acquiredAt: 1, expiresAt: 2 } });
    fixture.detectChanges();
    expect(component.ownsLock()).toBe(false);
    expect(element.textContent).toContain('En edición por enfermera@nexo.demo');
    expect((element.querySelector('textarea[name="diagnostico"]') as HTMLTextAreaElement).readOnly).toBe(true);
    vi.useRealTimers();
  });

  it('avisa si una edición quedó desactualizada', () => {
    const { component, hub } = mount(ClinicalCollaborationPanelComponent);
    hub.events$.next({ type: 'record.conflict', reason: 'STALE', record: record(3), lock: null });
    expect(component.record()?.version).toBe(3);
    expect(component.notice()).toContain('Otra edición llegó primero');
  });
});

describe('CareCoordinationPanelComponent', () => {
  it('envía interconsultas y sigue su estado hasta la respuesta', () => {
    const { component, hub, fixture, element } = mount(CareCoordinationPanelComponent);
    component.consult = { toUserId: 'medico-2', specialty: 'Cardiología', message: 'ECG alterado', priority: 'URGENT' };
    component.requestConsult();
    expect(hub.send).toHaveBeenCalledWith({ type: 'consult.request', toUserId: 'medico-2', specialty: 'Cardiología', message: 'ECG alterado', priority: 'URGENT' });

    hub.events$.next({ type: 'consult.sent', consultId: 'c-1', toUserId: 'medico-2', viaInstance: 'gw-a' });
    hub.events$.next({ type: 'consult.delivered', consultId: 'c-1', deliveredByInstance: 'gw-b', devices: 2 });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="consult-outgoing"]')?.textContent).toContain('Entregada en gw-b (2 dispositivo/s)');

    hub.events$.next({ type: 'consult.response', consultId: 'c-1', accepted: true, message: 'Voy' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="consult-outgoing"]')?.textContent).toContain('Aceptada: Voy');
  });

  it('muestra el banner de Código Azul y el reporte de fan-out agregado', () => {
    vi.useFakeTimers();
    const { component, hub, fixture, element } = mount(CareCoordinationPanelComponent);
    component.codeBlue();
    expect(hub.send).toHaveBeenCalledWith({ type: 'alert.code-blue', location: 'UCI · cama 3', scope: 'sede' });

    hub.events$.next({ type: 'alert.code-blue', alertId: 'a-1', location: 'UCI · cama 3', sedeId: 'SEDE-MIA', raisedAt: 'x', originInstance: 'gw-a', raisedBy: { email: 'medico1@nexo.demo' } });
    hub.events$.next({ type: 'fanout.report', event: 'alert.code-blue', referenceId: 'a-1', instanceId: 'gw-a', report: { recipients: 1001, delivered: 1001, skippedClosed: 0, skippedSlow: 0, failed: 0, batches: 4, bytes: 1, durationMs: 3 } });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="code-blue-banner"]')?.textContent).toContain('CÓDIGO AZUL · UCI · cama 3');
    expect(element.querySelector('[data-testid="fanout-summary"]')?.textContent).toContain('1001/1001 terminales en 4 lotes');

    vi.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="code-blue-banner"]')).toBeNull();
    vi.useRealTimers();
  });
});

describe('RealtimePageComponent', () => {
  it('presenta la comparativa de los tres protocolos', () => {
    TestBed.configureTestingModule({ imports: [RealtimePageComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(RealtimePageComponent);
    fixture.detectChanges();
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="protocol-card"]');
    expect([...cards].map((card) => card.querySelector('p')?.textContent)).toEqual(['Short polling', 'SSE', 'WebSocket']);
  });
});
