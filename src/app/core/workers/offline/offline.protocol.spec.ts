import { describe, expect, it } from 'vitest';
import { isCatalogRequest, isHashedAsset, isQueueable, isQueuedResponse } from './offline.protocol';

describe('reglas del Service Worker', () => {
  it('solo encola cambios de estado de siniestros con Idempotency-Key', () => {
    const url = 'https://erp-insurance-api.onrender.com/api/claims/0b1c/status';
    expect(isQueueable('PATCH', url, true)).toBe(true);
    expect(isQueueable('PATCH', url, false)).toBe(false);
    expect(isQueueable('POST', 'https://x/api/patients', true)).toBe(false);
    expect(isQueueable('PATCH', 'https://x/api/claims/0b1c', true)).toBe(false);
  });

  it('reconoce catálogos en la API local y en la de Render', () => {
    expect(isCatalogRequest('/api/catalogs/icd10?q=e11')).toBe(true);
    expect(isCatalogRequest('https://erp-insurance-api.onrender.com/api/catalogs/medications')).toBe(true);
    expect(isCatalogRequest('/api/patients')).toBe(false);
  });

  it('cachea con Cache-First solo recursos con hash de contenido', () => {
    expect(isHashedAsset('/main-ABCD1234.js')).toBe(true);
    expect(isHashedAsset('/chunk-Z9Y8X7W6.js')).toBe(true);
    expect(isHashedAsset('/styles-QWERTY12.css')).toBe(true);
    expect(isHashedAsset('/main.js')).toBe(false);
    expect(isHashedAsset('/favicon.ico')).toBe(true);
  });

  it('distingue la respuesta 202 de una escritura encolada', () => {
    expect(isQueuedResponse({ queued: true, idempotencyKey: 'k' })).toBe(true);
    expect(isQueuedResponse({ id: 'c-1' })).toBe(false);
    expect(isQueuedResponse(null)).toBe(false);
  });
});
