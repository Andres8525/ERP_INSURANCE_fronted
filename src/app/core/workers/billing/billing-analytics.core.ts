export type ServiceType = 'CONSULTA' | 'PROCEDIMIENTO' | 'MEDICAMENTO' | 'URGENCIA' | 'HOSPITALIZACION';

export interface BillingRecord {
  id: string;
  patientId: string;
  date: string;
  cie10: string;
  service: ServiceType;
  amount: number;
  insurer: string;
  city: string;
  age: number;
  sex: 'F' | 'M';
}

export interface BillingFilter {
  cie10Prefixes?: string[];
  services?: ServiceType[];
  from?: string;
  to?: string;
  minAmount?: number;
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
  amount: number;
}

export interface AmountStats {
  sum: number;
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
  stdDev: number;
}

export interface BillingReport {
  totalRecords: number;
  matchedRecords: number;
  invalidCie10: number;
  uniquePatients: number;
  amount: AmountStats;
  topDiagnoses: Bucket[];
  byChapter: Bucket[];
  byService: Bucket[];
  byMonth: Bucket[];
  byAgeGroup: Bucket[];
  bySex: Bucket[];
}

export const CIE10_PATTERN = /^[A-Z]\d{2}(\.\d{1,2})?$/;

const CHAPTERS: [string, string, string][] = [
  ['A00', 'B99', 'I · Infecciosas y parasitarias'],
  ['C00', 'D48', 'II · Tumores'],
  ['D50', 'D89', 'III · Sangre e inmunidad'],
  ['E00', 'E90', 'IV · Endocrinas y metabólicas'],
  ['F00', 'F99', 'V · Trastornos mentales'],
  ['G00', 'G99', 'VI · Sistema nervioso'],
  ['H00', 'H59', 'VII · Ojo'],
  ['H60', 'H95', 'VIII · Oído'],
  ['I00', 'I99', 'IX · Circulatorio'],
  ['J00', 'J99', 'X · Respiratorio'],
  ['K00', 'K93', 'XI · Digestivo'],
  ['L00', 'L99', 'XII · Piel'],
  ['M00', 'M99', 'XIII · Osteomuscular'],
  ['N00', 'N99', 'XIV · Genitourinario'],
  ['O00', 'O99', 'XV · Embarazo y parto'],
  ['P00', 'P96', 'XVI · Perinatal'],
  ['Q00', 'Q99', 'XVII · Malformaciones'],
  ['R00', 'R99', 'XVIII · Síntomas y signos'],
  ['S00', 'T98', 'XIX · Traumatismos'],
  ['V01', 'Y98', 'XX · Causas externas'],
  ['Z00', 'Z99', 'XXI · Factores de salud'],
  ['U00', 'U99', 'XXII · Propósitos especiales'],
];

const AGE_GROUPS: [number, number, string][] = [
  [0, 17, '0-17'],
  [18, 34, '18-34'],
  [35, 49, '35-49'],
  [50, 64, '50-64'],
  [65, 200, '65+'],
];

const SERVICES: ServiceType[] = ['CONSULTA', 'PROCEDIMIENTO', 'MEDICAMENTO', 'URGENCIA', 'HOSPITALIZACION'];

export function cie10Chapter(code: string): string | null {
  if (!CIE10_PATTERN.test(code)) return null;
  const head = code.slice(0, 3);
  for (const [from, to, label] of CHAPTERS) {
    if (head >= from && head <= to) return label;
  }
  return null;
}

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function parseBillingCsv(text: string, onProgress?: (fraction: number) => void): BillingRecord[] {
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? '').map((h) => h.trim());
  const index = (name: string) => {
    const position = header.indexOf(name);
    if (position < 0) throw new Error(`Falta la columna "${name}" en el CSV.`);
    return position;
  };
  const columns = {
    id: index('id'), patientId: index('patientId'), date: index('date'), cie10: index('cie10'),
    service: index('service'), amount: index('amount'), insurer: index('insurer'), city: index('city'),
    age: index('age'), sex: index('sex'),
  };
  const records: BillingRecord[] = [];
  const step = Math.max(1, Math.floor(lines.length / 20));
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = parseCsvLine(line);
    records.push({
      id: cells[columns.id],
      patientId: cells[columns.patientId],
      date: cells[columns.date],
      cie10: cells[columns.cie10].trim().toUpperCase(),
      service: cells[columns.service] as ServiceType,
      amount: Number(cells[columns.amount]),
      insurer: cells[columns.insurer],
      city: cells[columns.city],
      age: Number(cells[columns.age]),
      sex: cells[columns.sex] === 'M' ? 'M' : 'F',
    });
    if (onProgress && i % step === 0) onProgress(i / lines.length);
  }
  return records;
}

export function matchesFilter(record: BillingRecord, filter: BillingFilter): boolean {
  if (filter.cie10Prefixes?.length && !filter.cie10Prefixes.some((prefix) => record.cie10.startsWith(prefix.toUpperCase()))) {
    return false;
  }
  if (filter.services?.length && !filter.services.includes(record.service)) return false;
  if (filter.from && record.date < filter.from) return false;
  if (filter.to && record.date > filter.to) return false;
  if (filter.minAmount !== undefined && record.amount < filter.minAmount) return false;
  return true;
}

function quantile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function toBuckets(map: Map<string, { count: number; amount: number; label?: string }>): Bucket[] {
  return [...map.entries()]
    .map(([key, value]) => ({ key, label: value.label ?? key, count: value.count, amount: round(value.amount) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function add(map: Map<string, { count: number; amount: number; label?: string }>, key: string, amount: number, label?: string) {
  const entry = map.get(key);
  if (entry) {
    entry.count++;
    entry.amount += amount;
  } else {
    map.set(key, { count: 1, amount, label });
  }
}

export function analyzeBilling(records: BillingRecord[], filter: BillingFilter = {}, onProgress?: (fraction: number) => void): BillingReport {
  const amounts: number[] = [];
  const diagnoses = new Map<string, { count: number; amount: number; label?: string }>();
  const chapters = new Map<string, { count: number; amount: number; label?: string }>();
  const services = new Map<string, { count: number; amount: number; label?: string }>();
  const months = new Map<string, { count: number; amount: number; label?: string }>();
  const ages = new Map<string, { count: number; amount: number; label?: string }>();
  const sexes = new Map<string, { count: number; amount: number; label?: string }>();
  const patients = new Set<string>();
  let invalid = 0;
  let sum = 0;
  let sumSquares = 0;
  const step = Math.max(1, Math.floor(records.length / 20));

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (onProgress && i % step === 0) onProgress(i / records.length);
    const chapter = cie10Chapter(record.cie10);
    if (!chapter) {
      invalid++;
      continue;
    }
    if (!matchesFilter(record, filter)) continue;
    const amount = Number.isFinite(record.amount) ? record.amount : 0;
    amounts.push(amount);
    sum += amount;
    sumSquares += amount * amount;
    patients.add(record.patientId);
    add(diagnoses, record.cie10, amount);
    add(chapters, chapter, amount);
    add(services, record.service, amount);
    add(months, record.date.slice(0, 7), amount);
    const group = AGE_GROUPS.find(([from, to]) => record.age >= from && record.age <= to)?.[2] ?? 'Sin dato';
    add(ages, group, amount);
    add(sexes, record.sex, amount, record.sex === 'F' ? 'Femenino' : 'Masculino');
  }
  onProgress?.(1);

  const sorted = Float64Array.from(amounts).sort();
  const count = sorted.length;
  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSquares / count - mean * mean) : 0;
  for (const service of SERVICES) if (!services.has(service)) services.set(service, { count: 0, amount: 0 });

  return {
    totalRecords: records.length,
    matchedRecords: count,
    invalidCie10: invalid,
    uniquePatients: patients.size,
    amount: {
      sum: round(sum),
      mean: round(mean),
      median: round(quantile(sorted, 0.5)),
      p95: round(quantile(sorted, 0.95)),
      min: count ? round(sorted[0]) : 0,
      max: count ? round(sorted[count - 1]) : 0,
      stdDev: round(Math.sqrt(variance)),
    },
    topDiagnoses: toBuckets(diagnoses).slice(0, 10),
    byChapter: toBuckets(chapters),
    byService: toBuckets(services),
    byMonth: toBuckets(months).sort((a, b) => a.key.localeCompare(b.key)),
    byAgeGroup: toBuckets(ages).sort((a, b) => AGE_GROUPS.findIndex((g) => g[2] === a.key) - AGE_GROUPS.findIndex((g) => g[2] === b.key)),
    bySex: toBuckets(sexes),
  };
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_CODES = ['I10', 'E11.9', 'J06.9', 'J45.9', 'K29.7', 'M54.5', 'N39.0', 'F41.1', 'E78.0', 'R51', 'A09', 'Z00.0', 'I50.9', 'J18.9', 'E66.9'];
const BASE_AMOUNT: Record<ServiceType, number> = { CONSULTA: 85, PROCEDIMIENTO: 420, MEDICAMENTO: 60, URGENCIA: 650, HOSPITALIZACION: 3800 };
const INSURERS = ['Ambetter', 'Oscar Health', 'Florida Blue', 'Molina Healthcare', 'Aetna CVS Health'];
const CITIES = ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Boston'];

export function generateBillingRecords(count: number, seed = 42, until = new Date(2026, 10, 14)): BillingRecord[] {
  const random = mulberry32(seed);
  const records: BillingRecord[] = new Array(count);
  const patients = Math.max(1, Math.floor(count / 4));
  for (let i = 0; i < count; i++) {
    const roll = random();
    const service: ServiceType = roll < 0.46 ? 'CONSULTA' : roll < 0.64 ? 'PROCEDIMIENTO' : roll < 0.86 ? 'MEDICAMENTO' : roll < 0.96 ? 'URGENCIA' : 'HOSPITALIZACION';
    const skew = random();
    const date = new Date(until.getTime() - Math.floor(random() * 365) * 86_400_000);
    records[i] = {
      id: `R${i + 1}`,
      patientId: `P${1 + Math.floor(random() * patients)}`,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      cie10: i % 997 === 0 ? 'X0' : SAMPLE_CODES[Math.min(SAMPLE_CODES.length - 1, Math.floor(skew * skew * SAMPLE_CODES.length))],
      service,
      amount: Math.round(BASE_AMOUNT[service] * (0.55 + random() * 1.35) * 100) / 100,
      insurer: INSURERS[Math.floor(random() * INSURERS.length)],
      city: CITIES[Math.floor(random() * CITIES.length)],
      age: 1 + Math.floor(random() * 89),
      sex: random() < 0.5 ? 'F' : 'M',
    };
  }
  return records;
}
