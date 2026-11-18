import React from 'react';
import { Lozenge } from '@forge/react';
import { invoke } from '@forge/bridge';

export const isTimeout = (e) => /timed out|timeout/i.test(String(e?.message || e));

// Call a resolver. The first call after the app has been idle can hit a cold start and the 25 s
// resolver limit; retry once automatically. `onRetry` lets the caller show "Still loading".
export async function call(name, payload, { retries = 1, onRetry = null } = {}) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await invoke(name, payload);
    } catch (e) {
      if (attempt < retries && isTimeout(e)) { onRetry && onRetry(); continue; }
      throw e;
    }
    if (r?.ok) return r.data;
    const err = new Error(r?.error || 'Request failed');
    if (attempt < retries && isTimeout(err)) { onRetry && onRetry(); continue; }
    throw err;
  }
}

const APPEARANCE = { ALLOWED: 'success', CLEAR: 'success', NEEDS_CONSENT: 'moved', BLOCKED: 'removed', WARNING: 'inprogress', UNLABELED: 'default' };
const LABEL = { ALLOWED: 'Allowed', CLEAR: 'Clear', NEEDS_CONSENT: 'Needs consent', BLOCKED: 'Blocked', WARNING: 'Warning', UNLABELED: 'Unlabeled' };

export const Verdict = ({ value, bold = true }) => (
  <Lozenge appearance={APPEARANCE[value] || 'default'} isBold={bold}>{LABEL[value] || value}</Lozenge>
);

export const verdictLabel = (v) => LABEL[v] || v;

// Start a queued job and poll until it finishes (scans and sweeps can outlast a 25 s resolver).
export async function runJob(kind, args = {}, { intervalMs = 2500, maxMs = 300000 } = {}) {
  const { id } = await call('startJob', { kind, args }, { retries: 0 });
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const j = await call('getJob', { id });
    if (j.state === 'done') return j.result;
    if (j.state === 'failed') throw new Error(j.error || 'Job failed');
  }
  throw new Error('Still running. Refresh in a minute to see the result.');
}
