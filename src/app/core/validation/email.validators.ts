export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TOP_LEVEL_DOMAINS = ['com', 'net', 'org', 'edu', 'gov', 'us', 'co'];
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'outlok.com': 'outlook.com',
};

export function isValidEmail(value: string | null | undefined): boolean {
  return EMAIL_PATTERN.test((value ?? '').trim());
}

export function emailError(value: string | null | undefined): string | null {
  const email = (value ?? '').trim();
  if (!email) return 'Ingresa el correo electrónico.';
  if (/\s/.test(email)) return 'El correo no puede contener espacios.';
  const at = email.indexOf('@');
  if (at < 0) return 'Al correo le falta el símbolo "@".';
  if (at === 0) return 'Falta el usuario antes de "@".';
  if (at !== email.lastIndexOf('@')) return 'El correo solo puede tener un "@".';
  const domain = email.slice(at + 1);
  if (!domain) return 'Falta el dominio después de "@" (por ejemplo gmail.com).';
  if (!domain.includes('.') || domain.endsWith('.') || domain.startsWith('.')) {
    return 'Al dominio le falta la extensión con punto, por ejemplo ".com".';
  }
  return EMAIL_PATTERN.test(email) ? null : 'Formato de correo inválido.';
}

export function suggestEmail(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  const at = normalized.indexOf('@');
  if (at <= 0 || at !== normalized.lastIndexOf('@') || at === normalized.length - 1) return null;
  const local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  if (!domain.includes('.')) {
    const tld = TOP_LEVEL_DOMAINS.find((t) => domain.length > t.length + 1 && domain.endsWith(t));
    if (tld) domain = `${domain.slice(0, -tld.length)}.${tld}`;
  }
  domain = DOMAIN_TYPOS[domain] ?? domain;
  const candidate = `${local}@${domain}`;
  return candidate !== normalized && EMAIL_PATTERN.test(candidate) ? candidate : null;
}
