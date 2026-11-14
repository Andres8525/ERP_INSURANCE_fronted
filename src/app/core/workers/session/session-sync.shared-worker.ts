/// <reference lib="webworker" />

import {
  HEARTBEAT_MS,
  SessionEvent,
  SessionState,
  TabEnvelope,
  applyCommand,
  emptyState,
  expireTabs,
  isSessionCommand,
  removeTab,
} from './session-sync.core';

declare const self: SharedWorkerGlobalScope;

let state: SessionState = emptyState();
const ports = new Map<MessagePort, string | null>();
let sequence = 0;
const newId = () => `W${Date.now().toString(36)}${(++sequence).toString(36)}`;

function send(port: MessagePort, event: SessionEvent): void {
  try {
    port.postMessage(event);
  } catch {
    ports.delete(port);
  }
}

function broadcast(): void {
  const event: SessionEvent = { type: 'state', state };
  for (const port of ports.keys()) send(port, event);
}

function handle(port: MessagePort, envelope: TabEnvelope): void {
  ports.set(port, envelope.tabId);
  const result = applyCommand(state, envelope, Date.now(), newId);
  state = result.state;
  if (result.reply) send(port, result.reply);
  if (result.changed) broadcast();
  else if (envelope.command.type === 'hello') send(port, { type: 'state', state });
  if (envelope.command.type === 'bye') {
    ports.delete(port);
    port.close();
  }
}

self.addEventListener('connect', (event: MessageEvent) => {
  const port = event.ports[0];
  ports.set(port, null);
  port.addEventListener('message', (message: MessageEvent) => {
    if (isSessionCommand(message.data)) handle(port, message.data);
  });
  port.start();
});

setInterval(() => {
  const result = expireTabs(state, Date.now());
  state = result.state;
  const alive = new Set(state.tabs.map((tab) => tab.tabId));
  for (const [port, tabId] of ports) {
    if (tabId && !alive.has(tabId)) {
      ports.delete(port);
      state = removeTab(state, tabId).state;
    }
  }
  if (result.changed) broadcast();
}, HEARTBEAT_MS);
