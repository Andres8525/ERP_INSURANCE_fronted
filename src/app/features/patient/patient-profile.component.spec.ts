import { describe, expect, it } from 'vitest';
import { validatePatientDraft } from './patient-profile.component';

describe('validatePatientDraft', () => {
  it('acepta una ficha completa y válida', () => {
    expect(
      validatePatientDraft({ firstName: 'Piedad', lastName: 'Garcia', email: 'piedad@gmail.com', phone: '(305) 450-8353' }),
    ).toEqual({});
  });

  it('marca cada campo con su motivo', () => {
    const errors = validatePatientDraft({ firstName: ' ', lastName: '', email: 'piedad@gmailcom', phone: '305-555-01' });

    expect(errors.firstName).toBe('Ingresa el nombre.');
    expect(errors.lastName).toBe('Ingresa el apellido.');
    expect(errors.email).toContain('extensión con punto');
    expect(errors.phone).toContain('10 dígitos');
  });

  it('limita la longitud de la ciudad', () => {
    const errors = validatePatientDraft({ firstName: 'Ana', lastName: 'Ruiz', email: 'ana@correo.com', phone: '', city: 'x'.repeat(121) });
    expect(errors.city).toBe('Máximo 120 caracteres.');
  });

  it('el teléfono vacío es válido porque es opcional', () => {
    expect(validatePatientDraft({ firstName: 'Ana', lastName: 'Ruiz', email: 'ana@correo.com', phone: '' })).toEqual({});
  });
});
