/// <reference lib="webworker" />

import { serveRpc } from '../protocol/rpc-server';
import { BillingContract } from './billing-analytics.contract';
import { runBillingAnalysis } from './billing-analytics.run';

serveRpc<BillingContract>(self as DedicatedWorkerGlobalScope, {
  analyze: (payload, context) => runBillingAnalysis(payload, (value) => context.progress(value)),
  ping: () => ({ pong: true, at: Date.now() }),
});
