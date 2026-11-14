import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientSummary } from '@core/api/api.models';
import { ErpStore } from '@core/state/erp.store';
import { environment } from '@env/environment';
import { ClientsPageComponent, matchesClient } from './clients-page.component';

const API = environment.apiUrl;
const tick = () => new Promise((resolve) => setTimeout(resolve));

const ANA: ClientSummary = {
  id: 'c-1',
  crmId: 'CRM-7K2M9QXA',
  fullName: 'Ana Pérez',
  email: 'ana.perez@example.test',
  city: 'Miami',
  age: 31,
  accountStatus: 'ACTIVE',
  acaEligibilityStatus: 'ELIGIBLE',
  policies: 1,
  currentPlan: {
    policyId: 'p-1', policyNumber: 'OSC-1', insurer: 'Oscar Health', planName: 'Simple Silver EPO',
    premiumAmount: 0, zeroPremium: true, coverageStart: '2026-01-01', coverageEnd: '2026-12-31', status: 'ACTIVE',
  },
  description: 'Simple Silver EPO de Oscar Health, prima $0 por subsidio ACA · Miami · Elegible ACA',
};

const DAVID: ClientSummary = {
  id: 'c-2',
  crmId: 'CRM-4HQ8ZPTE',
  fullName: 'David Williams',
  email: 'david@example.test',
  city: 'Tampa',
  accountStatus: 'ACTIVE',
  acaEligibilityStatus: 'PENDING',
  policies: 0,
  description: 'Sin plan médico registrado · Tampa · Elegibilidad en verificación',
};

describe('matchesClient', () => {
  it('busca sin distinguir tildes ni mayúsculas en CRM ID, ciudad y plan', () => {
    expect(matchesClient(ANA, 'perez', 'all')).toBe(true);
    expect(matchesClient(ANA, 'crm-7k2m', 'all')).toBe(true);
    expect(matchesClient(ANA, 'MIAMI', 'all')).toBe(true);
    expect(matchesClient(ANA, 'silver', 'all')).toBe(true);
    expect(matchesClient(ANA, 'tampa', 'all')).toBe(false);
  });

  it('filtra por prima cero y por clientes sin plan', () => {
    expect(matchesClient(ANA, '', 'zero')).toBe(true);
    expect(matchesClient(DAVID, '', 'zero')).toBe(false);
    expect(matchesClient(DAVID, '', 'noPlan')).toBe(true);
    expect(matchesClient(ANA, '', 'noPlan')).toBe(false);
  });
});

describe('ClientsPageComponent', () => {
  let http: HttpTestingController;
  let component: ClientsPageComponent;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ClientsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClientsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  async function loadClients(): Promise<void> {
    http.expectOne(`${API}/clients`).flush([ANA, DAVID]);
    await tick();
  }

  it('carga los clientes y calcula los indicadores de cartera', async () => {
    await loadClients();

    expect(component.clients()).toHaveLength(2);
    expect(component.stats()).toEqual({ total: 2, zero: 1, noPlan: 1, cities: 2 });
    expect(component.premiumLabel(ANA)).toBe('$0 · subsidio ACA');
    expect(component.premiumLabel(DAVID)).toBe('Sin plan');

    component.setFilter('zero');
    expect(component.visible().map((c) => c.crmId)).toEqual(['CRM-7K2M9QXA']);
  });

  it('descarga la ficha PDF del cliente', async () => {
    await loadClients();
    const createObjectURL = vi.fn(() => 'blob:ficha');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const done = component.downloadPdf(ANA);
    expect(component.downloading()).toBe('c-1');
    const request = http.expectOne(`${API}/clients/c-1/pdf`);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    await done;

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(component.downloading()).toBeNull();
    expect(TestBed.inject(ErpStore).notice()?.text).toBe('Ficha PDF de Ana Pérez descargada.');
  });

  it('muestra el error si la carga falla', async () => {
    http.expectOne(`${API}/clients`).flush({ status: 500, detail: 'Fallo' }, { status: 500, statusText: 'Server Error' });
    await tick();
    expect(component.error()).toBe('Fallo');
  });
});
