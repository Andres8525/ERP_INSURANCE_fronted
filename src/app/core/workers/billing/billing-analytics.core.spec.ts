import { describe, expect, it } from 'vitest';
import { BillingRecord, analyzeBilling, cie10Chapter, generateBillingRecords, parseBillingCsv, parseCsvLine } from './billing-analytics.core';
import { runBillingAnalysis } from './billing-analytics.run';

const CSV = [
  'id,patientId,date,cie10,service,amount,insurer,city,age,sex',
  'R1,P1,2026-01-10,E11.9,CONSULTA,100.00,Ambetter,Miami,57,F',
  'R2,P1,2026-01-20,E11.9,MEDICAMENTO,50.50,Ambetter,Miami,57,F',
  'R3,P2,2026-02-03,I10,CONSULTA,80.00,"Oscar Health, Inc",Tampa,70,M',
  'R4,P3,2026-02-15,J45.9,URGENCIA,600.00,Florida Blue,Orlando,12,M',
  'R5,P4,2026-03-01,X0,CONSULTA,90.00,Molina Healthcare,Boston,40,F',
].join('\n');

describe('analítica de facturación', () => {
  it('interpreta CSV con campos entre comillas', () => {
    expect(parseCsvLine('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
    const records = parseBillingCsv(CSV);
    expect(records).toHaveLength(5);
    expect(records[2].insurer).toBe('Oscar Health, Inc');
    expect(records[3]).toMatchObject({ cie10: 'J45.9', service: 'URGENCIA', amount: 600, age: 12, sex: 'M' });
  });

  it('exige las columnas del formato', () => {
    expect(() => parseBillingCsv('id,date\n1,2026-01-01')).toThrow('patientId');
  });

  it('clasifica códigos CIE-10 por capítulo y descarta los inválidos', () => {
    expect(cie10Chapter('E11.9')).toBe('IV · Endocrinas y metabólicas');
    expect(cie10Chapter('I10')).toBe('IX · Circulatorio');
    expect(cie10Chapter('S82.6')).toBe('XIX · Traumatismos');
    expect(cie10Chapter('X0')).toBeNull();
    expect(cie10Chapter('e11')).toBeNull();
  });

  it('calcula estadísticas y agrupaciones', () => {
    const report = analyzeBilling(parseBillingCsv(CSV));

    expect(report.totalRecords).toBe(5);
    expect(report.matchedRecords).toBe(4);
    expect(report.invalidCie10).toBe(1);
    expect(report.uniquePatients).toBe(3);
    expect(report.amount).toMatchObject({ sum: 830.5, min: 50.5, max: 600, median: 90 });
    expect(report.topDiagnoses[0]).toMatchObject({ key: 'E11.9', count: 2, amount: 150.5 });
    expect(report.byMonth.map((b) => b.key)).toEqual(['2026-01', '2026-02']);
    expect(report.byAgeGroup.map((b) => b.key)).toEqual(['0-17', '50-64', '65+']);
    expect(report.byService.find((b) => b.key === 'HOSPITALIZACION')?.count).toBe(0);
  });

  it('filtra por prefijos CIE-10, servicio, fechas y monto mínimo', () => {
    const records = parseBillingCsv(CSV);
    expect(analyzeBilling(records, { cie10Prefixes: ['e11'] }).matchedRecords).toBe(2);
    expect(analyzeBilling(records, { services: ['CONSULTA'] }).matchedRecords).toBe(2);
    expect(analyzeBilling(records, { from: '2026-02-01', to: '2026-02-28' }).matchedRecords).toBe(2);
    expect(analyzeBilling(records, { minAmount: 90 }).matchedRecords).toBe(2);
  });

  it('genera datos sintéticos deterministas y los analiza con progreso', () => {
    const a: BillingRecord[] = generateBillingRecords(2_000, 7);
    const b: BillingRecord[] = generateBillingRecords(2_000, 7);
    expect(a).toEqual(b);

    const progress: number[] = [];
    const run = runBillingAnalysis({ source: { kind: 'synthetic', count: 5_000, seed: 3 }, filter: {} }, (p) => progress.push(p));
    expect(run.report.totalRecords).toBe(5_000);
    expect(run.report.invalidCie10).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(100);
  });

  it('acepta el CSV como bytes transferibles', () => {
    const bytes = new TextEncoder().encode(CSV).buffer as ArrayBuffer;
    const run = runBillingAnalysis({ source: { kind: 'csvBytes', bytes }, filter: {} });
    expect(run.report.matchedRecords).toBe(4);
  });
});
