import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { PatientResponse } from '@core/api/api.models';
import { EnrollmentPageComponent } from './enrollment-page.component';

const API = environment.apiUrl;
const tick = () => new Promise((resolve) => setTimeout(resolve));

const PATIENT: PatientResponse = {
  id: '6f1c2a10-0000-4000-8000-000000000001',
  crmId: 'CRM-7K2M9QXA',
  firstName: 'Piedad Del Socorro',
  lastName: 'Garcia Nupan',
  email: 'piedad@gmail.com',
  phone: '(305) 450-8353',
  city: 'Boston',
  dateOfBirth: '1969-03-10',
  acaEligibilityStatus: 'ELIGIBLE',
  accountStatus: 'PENDING',
  createdAt: new Date().toISOString(),
};

describe('EnrollmentPageComponent', () => {
  let http: HttpTestingController;
  let component: EnrollmentPageComponent;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [EnrollmentPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    component = TestBed.createComponent(EnrollmentPageComponent).componentInstance;
  });

  afterEach(() => http.verify());

  function fillStepOne(email: string): void {
    Object.assign(component.form, {
      firstName: 'Piedad Del Socorro',
      lastName: 'Garcia Nupan',
      dateOfBirth: '1969-03-10',
      email,
      phone: '3054508353',
      city: 'Boston',
    });
    component.sync();
  }

  function fillRemainingSteps(): void {
    Object.assign(component.form, {
      householdSize: 2,
      householdIncome: 42000,
      hasCoverage: false,
      insurer: 'Ambetter',
      metalLevel: 'Silver',
      monthlyPremium: 428.16,
    });
    component.sync();
  }

  it('no marca errores antes de que el usuario intente continuar', () => {
    expect(component.errorFor('firstName')).toBeNull();
    expect(component.errorFor('email')).toBeNull();
  });

  it('explica por qué piedad@gmailcom no es válido y ofrece la corrección', () => {
    fillStepOne('piedad@gmailcom');
    component.next();

    expect(component.step()).toBe(1);
    expect(component.error()).toBe('Correo electrónico: Al dominio le falta la extensión con punto, por ejemplo ".com".');
    expect(component.errorFor('email')).toContain('extensión con punto');
    expect(component.errorFor('firstName')).toBeNull();
    expect(component.emailSuggestion()).toBe('piedad@gmail.com');

    component.applyEmailSuggestion('piedad@gmail.com');
    expect(component.error()).toBeNull();
    component.next();
    expect(component.step()).toBe(2);
  });

  it('cuenta los campos inválidos cuando hay varios', () => {
    component.next();
    expect(component.error()).toBe('Revisa los 4 campos marcados en rojo.');
    expect(component.errorFor('phone')).toBeNull();
  });

  it('registra paciente y póliza con el teléfono normalizado', async () => {
    fillStepOne('piedad@gmail.com');
    component.next();
    fillRemainingSteps();
    component.next();
    component.next();
    expect(component.submitting()).toBe(true);

    const create = http.expectOne(`${API}/patients`);
    expect(create.request.body).toMatchObject({ email: 'piedad@gmail.com', phone: '(305) 450-8353' });
    create.flush(PATIENT);
    await tick();

    const policy = http.expectOne(`${API}/patients/${PATIENT.id}/policies`);
    expect(policy.request.body).toMatchObject({ insurer: 'Ambetter', planName: 'Silver ACA', premiumAmount: 428.16 });
    policy.flush({});
    await tick();

    for (const reload of http.match((request) => request.method === 'GET')) {
      reload.flush(reload.request.url.endsWith('/pipeline') ? {} : { content: [], totalElements: 0, totalPages: 0, number: 0, size: 100, first: true, last: true });
    }
    await tick();
    expect(component.created()?.id).toBe(PATIENT.id);
  });

  it('lleva al campo rechazado por el backend', async () => {
    fillStepOne('piedad@gmail.com');
    component.next();
    fillRemainingSteps();
    component.next();
    component.next();

    http.expectOne(`${API}/patients`).flush(
      { status: 400, detail: 'Validation failed', errors: { email: 'must be a valid email address' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await tick();

    expect(component.step()).toBe(1);
    expect(component.errorFor('email')).toContain('El servidor rechazó el correo');
    expect(component.error()).toContain('Revisa los campos marcados');
  });
});
