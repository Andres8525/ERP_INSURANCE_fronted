import { describe, expect, it } from 'vitest';
import { SessionCommand, SessionState, TAB_TTL_MS, applyCommand, emptyState, expireTabs } from './session-sync.core';

let ids = 0;
const newId = () => `id-${++ids}`;

function run(state: SessionState, tabId: string, command: SessionCommand, now = 1_000) {
  return applyCommand(state, { tabId, command }, now, newId);
}

describe('estado compartido entre pestañas', () => {
  it('registra pestañas una sola vez', () => {
    let state = run(emptyState(), 'a', { type: 'hello', label: 'Recepción' }).state;
    const again = run(state, 'a', { type: 'hello', label: 'Recepción' });
    state = run(again.state, 'b', { type: 'hello', label: 'Consultorio 2' }).state;

    expect(again.changed).toBe(false);
    expect(state.tabs.map((t) => t.label)).toEqual(['Recepción', 'Consultorio 2']);
    expect(state.version).toBe(2);
  });

  it('ordena la sala de espera: urgentes primero, llamados al final', () => {
    let state = emptyState();
    state = run(state, 'a', { type: 'queue:add', name: 'Ana', reason: 'Control', priority: 'normal' }, 1).state;
    state = run(state, 'a', { type: 'queue:add', name: 'Luis', reason: 'Dolor torácico', priority: 'urgent' }, 2).state;
    state = run(state, 'a', { type: 'queue:add', name: 'Eva', reason: 'Vacuna', priority: 'normal' }, 3).state;
    expect(state.queue.map((p) => p.name)).toEqual(['Luis', 'Ana', 'Eva']);

    state = run(state, 'b', { type: 'queue:call', id: state.queue[0].id, caller: 'Dra. Ruiz' }).state;
    expect(state.queue.map((p) => p.name)).toEqual(['Ana', 'Eva', 'Luis']);
    expect(state.queue[2]).toMatchObject({ status: 'called', calledBy: 'Dra. Ruiz' });

    state = run(state, 'a', { type: 'queue:remove', id: state.queue[2].id }).state;
    expect(state.queue).toHaveLength(2);
  });

  it('rechaza pacientes sin nombre', () => {
    const result = run(emptyState(), 'a', { type: 'queue:add', name: '  ', reason: '', priority: 'normal' });
    expect(result.changed).toBe(false);
    expect(result.reply).toEqual({ type: 'error', message: 'El nombre del paciente es obligatorio.' });
  });

  it('bloquea la edición concurrente de una misma historia clínica', () => {
    let state = run(emptyState(), 'a', { type: 'lock:acquire', recordId: 'HC-1', owner: 'Dr. Gómez' }).state;
    const denied = run(state, 'b', { type: 'lock:acquire', recordId: 'HC-1', owner: 'Dra. Ruiz' });
    expect(denied.reply).toEqual({ type: 'lock:denied', recordId: 'HC-1', heldBy: 'Dr. Gómez' });

    const notOwner = run(state, 'b', { type: 'lock:release', recordId: 'HC-1' });
    expect(notOwner.changed).toBe(false);

    state = run(state, 'a', { type: 'lock:release', recordId: 'HC-1' }).state;
    expect(run(state, 'b', { type: 'lock:acquire', recordId: 'HC-1', owner: 'Dra. Ruiz' }).state.locks[0].owner).toBe('Dra. Ruiz');
  });

  it('libera bloqueos de pestañas cerradas o inactivas', () => {
    let state = run(emptyState(), 'a', { type: 'hello', label: 'A' }, 0).state;
    state = run(state, 'b', { type: 'hello', label: 'B' }, 0).state;
    state = run(state, 'a', { type: 'lock:acquire', recordId: 'HC-9', owner: 'A' }, 0).state;
    state = run(state, 'b', { type: 'heartbeat' }, TAB_TTL_MS).state;

    const expired = expireTabs(state, TAB_TTL_MS + 1);
    expect(expired.changed).toBe(true);
    expect(expired.state.tabs.map((t) => t.tabId)).toEqual(['b']);
    expect(expired.state.locks).toEqual([]);

    const bye = run(expired.state, 'b', { type: 'bye' });
    expect(bye.state.tabs).toEqual([]);
  });
});
