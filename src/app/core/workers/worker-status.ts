export type WorkerStatus = 'idle' | 'ready' | 'busy' | 'error' | 'unsupported';

export const WORKER_STATUS_LABEL: Record<WorkerStatus, string> = {
  idle: 'En espera',
  ready: 'Activo',
  busy: 'Procesando',
  error: 'Error',
  unsupported: 'No soportado',
};

export interface PlatformCapabilities {
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  atomicsWaitAsync: boolean;
  webWorker: boolean;
  sharedWorker: boolean;
  serviceWorker: boolean;
  backgroundSync: boolean;
  hardwareConcurrency: number;
}

export function detectCapabilities(scope: typeof globalThis = globalThis): PlatformCapabilities {
  const nav = (scope as { navigator?: Navigator }).navigator;
  const registration = (scope as { ServiceWorkerRegistration?: { prototype: object } }).ServiceWorkerRegistration;
  return {
    crossOriginIsolated: (scope as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
    sharedArrayBuffer: typeof (scope as { SharedArrayBuffer?: unknown }).SharedArrayBuffer === 'function',
    atomicsWaitAsync: typeof (Atomics as { waitAsync?: unknown }).waitAsync === 'function',
    webWorker: typeof (scope as { Worker?: unknown }).Worker === 'function',
    sharedWorker: typeof (scope as { SharedWorker?: unknown }).SharedWorker === 'function',
    serviceWorker: !!nav && 'serviceWorker' in nav,
    backgroundSync: !!registration && 'sync' in registration.prototype,
    hardwareConcurrency: nav?.hardwareConcurrency ?? 1,
  };
}

export function canUseSharedMemory(capabilities: PlatformCapabilities = detectCapabilities()): boolean {
  return capabilities.crossOriginIsolated && capabilities.sharedArrayBuffer;
}
