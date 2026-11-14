export type QueuePriority = 'normal' | 'urgent';
export type QueueStatus = 'waiting' | 'called';

export interface ConnectedTab {
  tabId: string;
  label: string;
  connectedAt: number;
  lastSeen: number;
}

export interface WaitingPatient {
  id: string;
  name: string;
  reason: string;
  priority: QueuePriority;
  status: QueueStatus;
  arrivedAt: number;
  calledBy?: string;
}

export interface RecordLock {
  recordId: string;
  tabId: string;
  owner: string;
  since: number;
}

export interface SessionState {
  version: number;
  tabs: ConnectedTab[];
  queue: WaitingPatient[];
  locks: RecordLock[];
}

export type SessionCommand =
  | { type: 'hello'; label: string }
  | { type: 'heartbeat' }
  | { type: 'bye' }
  | { type: 'queue:add'; name: string; reason: string; priority: QueuePriority }
  | { type: 'queue:call'; id: string; caller: string }
  | { type: 'queue:remove'; id: string }
  | { type: 'lock:acquire'; recordId: string; owner: string }
  | { type: 'lock:release'; recordId: string };

export type SessionEvent =
  | { type: 'state'; state: SessionState }
  | { type: 'lock:denied'; recordId: string; heldBy: string }
  | { type: 'error'; message: string };

export interface TabEnvelope {
  tabId: string;
  command: SessionCommand;
}

export const TAB_TTL_MS = 15_000;
export const HEARTBEAT_MS = 5_000;
export const MAX_QUEUE = 200;

export function emptyState(): SessionState {
  return { version: 0, tabs: [], queue: [], locks: [] };
}

export interface ApplyResult {
  state: SessionState;
  changed: boolean;
  reply?: SessionEvent;
}

function bump(state: SessionState, patch: Partial<SessionState>): ApplyResult {
  return { state: { ...state, ...patch, version: state.version + 1 }, changed: true };
}

function sortQueue(queue: WaitingPatient[]): WaitingPatient[] {
  const rank = (p: WaitingPatient) => (p.status === 'called' ? 2 : p.priority === 'urgent' ? 0 : 1);
  return [...queue].sort((a, b) => rank(a) - rank(b) || a.arrivedAt - b.arrivedAt);
}

export function applyCommand(state: SessionState, envelope: TabEnvelope, now: number, newId: () => string): ApplyResult {
  const { tabId, command } = envelope;
  const touch = (tabs: ConnectedTab[]) => tabs.map((tab) => (tab.tabId === tabId ? { ...tab, lastSeen: now } : tab));

  switch (command.type) {
    case 'hello': {
      const existing = state.tabs.find((tab) => tab.tabId === tabId);
      if (existing) return { state: { ...state, tabs: touch(state.tabs) }, changed: false };
      return bump(state, { tabs: [...state.tabs, { tabId, label: command.label.slice(0, 60), connectedAt: now, lastSeen: now }] });
    }
    case 'heartbeat':
      return { state: { ...state, tabs: touch(state.tabs) }, changed: false };
    case 'bye':
      return removeTab(state, tabId);
    case 'queue:add': {
      const name = command.name.trim().slice(0, 80);
      if (!name) return { state, changed: false, reply: { type: 'error', message: 'El nombre del paciente es obligatorio.' } };
      if (state.queue.length >= MAX_QUEUE) return { state, changed: false, reply: { type: 'error', message: 'La sala de espera está llena.' } };
      const patient: WaitingPatient = {
        id: newId(), name, reason: command.reason.trim().slice(0, 120), priority: command.priority, status: 'waiting', arrivedAt: now,
      };
      return bump(state, { queue: sortQueue([...state.queue, patient]) });
    }
    case 'queue:call': {
      if (!state.queue.some((p) => p.id === command.id && p.status === 'waiting')) return { state, changed: false };
      const queue = state.queue.map((p) => (p.id === command.id ? { ...p, status: 'called' as const, calledBy: command.caller } : p));
      return bump(state, { queue: sortQueue(queue) });
    }
    case 'queue:remove':
      if (!state.queue.some((p) => p.id === command.id)) return { state, changed: false };
      return bump(state, { queue: state.queue.filter((p) => p.id !== command.id) });
    case 'lock:acquire': {
      const held = state.locks.find((lock) => lock.recordId === command.recordId);
      if (held && held.tabId !== tabId) {
        return { state, changed: false, reply: { type: 'lock:denied', recordId: command.recordId, heldBy: held.owner } };
      }
      if (held) return { state, changed: false };
      return bump(state, { locks: [...state.locks, { recordId: command.recordId, tabId, owner: command.owner.slice(0, 80), since: now }] });
    }
    case 'lock:release': {
      const held = state.locks.find((lock) => lock.recordId === command.recordId && lock.tabId === tabId);
      if (!held) return { state, changed: false };
      return bump(state, { locks: state.locks.filter((lock) => lock !== held) });
    }
  }
}

export function removeTab(state: SessionState, tabId: string): ApplyResult {
  if (!state.tabs.some((tab) => tab.tabId === tabId) && !state.locks.some((lock) => lock.tabId === tabId)) {
    return { state, changed: false };
  }
  return bump(state, {
    tabs: state.tabs.filter((tab) => tab.tabId !== tabId),
    locks: state.locks.filter((lock) => lock.tabId !== tabId),
  });
}

export function expireTabs(state: SessionState, now: number, ttlMs = TAB_TTL_MS): ApplyResult {
  const stale = state.tabs.filter((tab) => now - tab.lastSeen > ttlMs).map((tab) => tab.tabId);
  let result: ApplyResult = { state, changed: false };
  for (const tabId of stale) {
    const next = removeTab(result.state, tabId);
    result = { state: next.state, changed: result.changed || next.changed };
  }
  return result;
}

export function isSessionCommand(value: unknown): value is TabEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as TabEnvelope;
  return typeof envelope.tabId === 'string' && typeof envelope.command === 'object' && envelope.command !== null
    && typeof envelope.command.type === 'string';
}
