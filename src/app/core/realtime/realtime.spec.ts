import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { LabPollingService } from './lab-polling.service';
import { MedicalHubService, backoffDelay } from './medical-hub.service';
import { realtimeWsUrl, userIdFromToken } from './realtime.models';
import { VitalsStreamService } from './vitals-stream.service';

const TOKEN = `h.${btoa(JSON.stringify({ sub: 'medico-1' })).replace(/=+$/, '')}.s`;

function setup<T>(service: new () => T): T {
  TestBed.configureTestingModule({ providers: [service, { provide: AuthService, useValue: { token: () => TOKEN } }] });
  return TestBed.inject(service);
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

describe('utilidades de tiempo real', () => {
  it('arma la URL del WebSocket desde el origen actual o la URL configurada', () => {
    expect(realtimeWsUrl('/ws/medical-hub', { sede: 'SEDE-MIA' }, { protocol: 'https:', host: 'erp.example' })).toBe(
      'wss://erp.example/ws/medical-hub?sede=SEDE-MIA',
    );
    expect(realtimeWsUrl('/ws/medical-hub', {}, { protocol: 'http:', host: 'localhost:4200' })).toBe('ws://localhost:4200/ws/medical-hub');
  });

  it('lee el usuario del JWT y aplica backoff exponencial con jitter acotado', () => {
    expect(userIdFromToken(TOKEN)).toBe('medico-1');
    expect(userIdFromToken('roto')).toBeNull();
    expect(backoffDelay(1, () => 0)).toBe(500);
    expect(backoffDelay(3, () => 1)).toBe(4000);
    expect(backoffDelay(20, () => 1)).toBe(15000);
  });
});

describe('LabPollingService (short polling)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('consulta cada X-Poll-Interval, cuenta los 304 y se detiene al completar', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(202, { jobId: 'j-1', state: 'QUEUED', progress: 0 }, { 'X-Poll-Interval': '3000' }))
      .mockResolvedValueOnce(json(200, { jobId: 'j-1', state: 'PROCESSING', progress: 40 }, { ETag: 'W/"a"', 'X-Poll-Interval': '3000' }))
      .mockResolvedValueOnce(json(304, null, { 'X-Poll-Interval': '3000' }))
      .mockResolvedValueOnce(json(200, { jobId: 'j-1', state: 'COMPLETED', progress: 100 }, { ETag: 'W/"b"', 'X-Poll-Interval': '0' }));
    vi.stubGlobal('fetch', fetchMock);
    const service = setup(LabPollingService);

    await service.start('RIPS');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(service.status()?.state).toBe('QUEUED');

    await vi.advanceTimersByTimeAsync(3000);
    expect(service.status()?.progress).toBe(40);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock.mock.calls[2]![1].headers['If-None-Match']).toBe('W/"a"');
    expect(service.stats().notModified).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);

    expect(service.status()?.state).toBe('COMPLETED');
    expect(service.running()).toBe(false);
    expect(service.stats().requests).toBe(3);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('informa cuando el gateway no está disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const service = setup(LabPollingService);
    await service.start('LAB_RESULTS');
    expect(service.error()).toBe('No se pudo conectar con el gateway de tiempo real');
    expect(service.running()).toBe(false);
  });
});

class FakeEventSource {
  static CLOSED = 2;
  static last: FakeEventSource;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, (event: MessageEvent<string>) => void> = {};
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners[type] = listener;
  }

  emit(type: string, data: unknown, lastEventId: string) {
    this.listeners[type]!({ data: JSON.stringify(data), lastEventId } as MessageEvent<string>);
  }

  close() {
    this.closed = true;
  }
}

describe('VitalsStreamService (SSE)', () => {
  beforeEach(() => vi.stubGlobal('EventSource', FakeEventSource));
  afterEach(() => vi.unstubAllGlobals());

  it('abre el stream con token y camas, acumula historia por cama y avisos de farmacia', () => {
    const service = setup(VitalsStreamService);
    service.connect(['UCI-01', 'UCI-03']);
    const source = FakeEventSource.last;
    expect(source.url).toContain('/api/realtime/vitals-stream?');
    expect(source.url).toContain('beds=UCI-01%2CUCI-03');
    expect(source.url).toContain(`access_token=${encodeURIComponent(TOKEN)}`);

    source.onopen!();
    expect(service.status()).toBe('open');
    for (let tick = 0; tick < 70; tick++) {
      source.emit('vitals', { bedId: 'UCI-03', heartRate: 90 + (tick % 5), spo2: 92, alarm: 'NORMAL' }, String(tick + 1));
    }
    source.emit('pharmacy', { noticeId: 'FAR-1', medication: 'Ceftriaxona' }, '71');

    expect(service.beds()['UCI-03']!.heartRate).toHaveLength(60);
    expect(service.pharmacy()[0]!.noticeId).toBe('FAR-1');
    expect(service.lastEventId()).toBe('71');
    expect(service.received()).toBe(71);
  });

  it('distingue reconexión automática de cierre definitivo', () => {
    const service = setup(VitalsStreamService);
    service.connect([]);
    const source = FakeEventSource.last;
    source.onerror!();
    expect(service.status()).toBe('reconnecting');
    expect(service.reconnects()).toBe(1);
    source.readyState = FakeEventSource.CLOSED;
    source.onerror!();
    expect(service.status()).toBe('error');
    service.disconnect();
    expect(source.closed).toBe(true);
  });
});

class FakeWebSocket {
  static OPEN = 1;
  static last: FakeWebSocket;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeWebSocket.last = this;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 } as CloseEvent);
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

describe('MedicalHubService (WebSocket)', () => {
  beforeEach(() => vi.stubGlobal('WebSocket', FakeWebSocket));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('envía el token en el subprotocolo, procesa welcome/pong y reenvía eventos', async () => {
    const service = setup(MedicalHubService);
    const events: string[] = [];
    service.events$.subscribe((event) => events.push(event.type));
    service.connect({ sede: 'SEDE-ORL', clinicalRole: 'MEDICO' });
    const socket = FakeWebSocket.last;
    expect(socket.protocols).toEqual(['bearer', TOKEN]);
    expect(socket.url).toContain('/ws/medical-hub?sede=SEDE-ORL&clinicalRole=MEDICO');

    socket.open();
    expect(service.status()).toBe('open');
    const ping = JSON.parse(socket.sent[0]!) as { type: string; sentAt: number };
    expect(ping.type).toBe('ping');

    socket.receive({ type: 'welcome', connectionId: 'c-1', instanceId: 'gw-a', principal: { userId: 'medico-1' }, backplane: { kind: 'redis' } });
    socket.receive({ type: 'pong', sentAt: Date.now() - 12 });
    socket.receive({ type: 'error', message: 'Demasiados mensajes' });
    await flush();

    expect(service.welcome()?.instanceId).toBe('gw-a');
    expect(service.latencyMs()).toBeGreaterThanOrEqual(12);
    expect(service.lastError()).toBe('Demasiados mensajes');
    expect(events).toEqual(['welcome', 'pong', 'error']);
    expect(service.send({ type: 'chat.join', roomId: 'tele-1' })).toBe(true);
  });

  it('reconecta con backoff si se cae la conexión y no lo hace tras cerrar a propósito', async () => {
    vi.useFakeTimers();
    const service = setup(MedicalHubService);
    service.connect({ sede: 'SEDE-MIA' });
    const first = FakeWebSocket.last;
    first.open();
    first.onclose!({ code: 1006 } as CloseEvent);
    expect(service.status()).toBe('reconnecting');
    expect(service.reconnects()).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.last).not.toBe(first);

    service.disconnect();
    expect(service.status()).toBe('idle');
    expect(service.send({ type: 'ping' })).toBe(false);
  });
});
