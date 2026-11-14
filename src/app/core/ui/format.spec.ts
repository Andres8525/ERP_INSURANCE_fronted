import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage, fieldLabel, translateValidationMessage } from './format';

describe('mensajes de error de la API', () => {
  it('traduce los nombres de campo y los mensajes de Bean Validation', () => {
    expect(fieldLabel('email')).toBe('Correo electrónico');
    expect(fieldLabel('otroCampo')).toBe('otroCampo');
    expect(translateValidationMessage('must not be blank')).toBe('es obligatorio');
    expect(translateValidationMessage('size must be between 0 and 100')).toBe('debe tener entre 0 y 100 caracteres');
    expect(translateValidationMessage('must match "^\\d{4}$"')).toBe('tiene un formato inválido');
    expect(translateValidationMessage('mensaje propio')).toBe('mensaje propio');
  });

  it('compone el detalle del ProblemDetail con los campos en español', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: {
        status: 400,
        detail: 'La solicitud contiene 2 campo(s) inválido(s)',
        errors: {
          email: 'must be a valid email address with a domain such as name@mail.com',
          firstName: 'must not be blank',
        },
      },
    });

    expect(apiErrorMessage(error)).toBe(
      'La solicitud contiene 2 campo(s) inválido(s) — Correo electrónico debe ser un correo con dominio, ' +
        'por ejemplo nombre@correo.com; Nombre es obligatorio',
    );
  });
});
