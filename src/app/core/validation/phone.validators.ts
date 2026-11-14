const ALLOWED_PHONE_CHARACTERS = /^[0-9()+\-.\s]+$/;

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizePhone(value: string | null | undefined): string | null {
  let digits = digitsOf(value ?? '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function phoneError(value: string | null | undefined): string | null {
  const phone = (value ?? '').trim();
  if (!phone) return null;
  if (!ALLOWED_PHONE_CHARACTERS.test(phone)) return 'Usa solo números, espacios, paréntesis o guiones.';
  return normalizePhone(phone) ? null : `El teléfono debe tener 10 dígitos (tiene ${digitsOf(phone).length}).`;
}
