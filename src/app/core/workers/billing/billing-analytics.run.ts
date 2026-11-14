import { BillingRecord, analyzeBilling, generateBillingRecords, parseBillingCsv } from './billing-analytics.core';
import { BillingAnalysis, BillingContract } from './billing-analytics.contract';

export function runBillingAnalysis(
  payload: BillingContract['analyze']['payload'],
  progress: (value: number) => void = () => undefined,
): BillingAnalysis {
  const parseStart = performance.now();
  let records: BillingRecord[];
  const { source } = payload;
  if (source.kind === 'csv' || source.kind === 'csvBytes') {
    const text = source.kind === 'csv' ? source.text : new TextDecoder().decode(source.bytes);
    records = parseBillingCsv(text, (fraction) => progress(fraction * 40));
  } else if (source.kind === 'synthetic') {
    records = generateBillingRecords(source.count, source.seed);
    progress(40);
  } else {
    records = source.records;
  }
  const parseMs = Math.round(performance.now() - parseStart);
  const analyzeStart = performance.now();
  const report = analyzeBilling(records, payload.filter, (fraction) => progress(40 + fraction * 60));
  return { report, parseMs, analyzeMs: Math.round(performance.now() - analyzeStart) };
}
