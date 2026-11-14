import { describe, expect, it } from 'vitest';
import { birthDateError, coverageStartError, parseIsoDate } from './date.validators';
import { emailError, isValidEmail, suggestEmail } from './email.validators';
import { normalizePhone, phoneError } from './phone.validators';

const TODAY = new Date(2026, 10, 14);

describe('validadores de correo', () => {
  it('rechaza un dominio sin punto y explica qué falta', () => {
    expect(isValidEmail('piedad@gmailcom')).toBe(false);
    expect(emailError('piedad@gmailcom')).toContain('extensión con punto');
  });

  it('describe cada tipo de error', () => {
    expect(emailError('')).toBe('Ingresa el correo electrónico.');
    expect(emailError('piedad.gmail.com')).toContain('"@"');
    expect(emailError('@gmail.com')).toContain('usuario');
    expect(emailError('a@b@c.com')).toContain('un "@"');
    expect(emailError('ana @gmail.com')).toContain('espacios');
    expect(emailError('ana@')).toContain('dominio');
  });

  it('acepta correos válidos', () => {
    expect(emailError(' piedad@gmail.com ')).toBeNull();
    expect(isValidEmail('ana.ruiz@correo.co')).toBe(true);
  });

  it('sugiere la corrección del dominio', () => {
    expect(suggestEmail('piedad@gmailcom')).toBe('piedad@gmail.com');
    expect(suggestEmail('Ana@Gmial.com')).toBe('ana@gmail.com');
    expect(suggestEmail('ana@gmail.com')).toBeNull();
    expect(suggestEmail('sin-arroba')).toBeNull();
  });
});

describe('validadores de teléfono', () => {
  it('normaliza 10 dígitos al formato de Estados Unidos', () => {
    expect(normalizePhone('3054508353')).toBe('(305) 450-8353');
    expect(normalizePhone('+1 305-450-8353')).toBe('(305) 450-8353');
    expect(normalizePhone('305-555-01')).toBeNull();
  });

  it('el teléfono es opcional pero debe ser válido si se escribe', () => {
    expect(phoneError('')).toBeNull();
    expect(phoneError('305 450 8353')).toBeNull();
    expect(phoneError('305-555-01')).toContain('10 dígitos (tiene 8)');
    expect(phoneError('305-ABC-0101')).toContain('solo números');
  });
});

describe('validadores de fecha', () => {
  it('interpreta fechas ISO sin desfase de zona horaria', () => {
    expect(parseIsoDate('1969-03-10')?.getDate()).toBe(10);
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('10/03/1969')).toBeNull();
  });

  it('la fecha de nacimiento no puede ser futura ni superar la edad máxima', () => {
    expect(birthDateError('1969-03-10', TODAY)).toBeNull();
    expect(birthDateError('', TODAY)).toContain('Ingresa');
    expect(birthDateError('2026-11-15', TODAY)).toContain('futura');
    expect(birthDateError('1900-01-01', TODAY)).toContain('120');
  });

  it('el inicio de cobertura no puede ser muy antiguo', () => {
    expect(coverageStartError('2026-12-01', TODAY)).toBeNull();
    expect(coverageStartError('2025-11-01', TODAY)).toContain('más de un año');
    expect(coverageStartError('', TODAY)).toContain('Selecciona');
  });
});
