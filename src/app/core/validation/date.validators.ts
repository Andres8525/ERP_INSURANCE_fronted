export const MAX_AGE_YEARS = 120;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function startOfToday(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function ageInYears(birth: Date, today: Date): number {
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return age;
}

export function birthDateError(value: string | null | undefined, today = new Date()): string | null {
  if (!value) return 'Ingresa la fecha de nacimiento.';
  const birth = parseIsoDate(value);
  if (!birth) return 'Fecha de nacimiento inválida.';
  if (birth > startOfToday(today)) return 'La fecha de nacimiento no puede ser futura.';
  if (ageInYears(birth, today) > MAX_AGE_YEARS) return `La edad no puede superar ${MAX_AGE_YEARS} años.`;
  return null;
}

export function coverageStartError(value: string | null | undefined, today = new Date()): string | null {
  if (!value) return 'Selecciona el inicio de cobertura.';
  const start = parseIsoDate(value);
  if (!start) return 'Fecha de inicio inválida.';
  const limit = startOfToday(today);
  limit.setFullYear(limit.getFullYear() - 1);
  if (start < limit) return 'El inicio de cobertura no puede ser de hace más de un año.';
  return null;
}
