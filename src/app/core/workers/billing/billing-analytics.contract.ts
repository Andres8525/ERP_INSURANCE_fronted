import { BillingFilter, BillingRecord, BillingReport } from './billing-analytics.core';

export type BillingSource =
  | { kind: 'records'; records: BillingRecord[] }
  | { kind: 'csv'; text: string }
  | { kind: 'csvBytes'; bytes: ArrayBuffer }
  | { kind: 'synthetic'; count: number; seed: number };

export interface BillingAnalysis {
  report: BillingReport;
  parseMs: number;
  analyzeMs: number;
}

export type BillingContract = {
  analyze: { payload: { source: BillingSource; filter: BillingFilter }; result: BillingAnalysis };
  ping: { payload: null; result: { pong: true; at: number } };
};
