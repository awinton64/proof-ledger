import React from 'react';
import { Lozenge } from '@forge/react';
import { invoke } from '@forge/bridge';

export async function call(name, payload) {
  const r = await invoke(name, payload);
  if (!r?.ok) throw new Error(r?.error || 'Request failed');
  return r.data;
}

const APPEARANCE = { ALLOWED: 'success', CLEAR: 'success', NEEDS_CONSENT: 'moved', BLOCKED: 'removed', WARNING: 'inprogress', UNLABELED: 'default' };
const LABEL = { ALLOWED: 'Allowed', CLEAR: 'Clear', NEEDS_CONSENT: 'Needs consent', BLOCKED: 'Blocked', WARNING: 'Warning', UNLABELED: 'Unlabeled' };

export const Verdict = ({ value, bold = true }) => (
  <Lozenge appearance={APPEARANCE[value] || 'default'} isBold={bold}>{LABEL[value] || value}</Lozenge>
);

export const verdictLabel = (v) => LABEL[v] || v;

// Start a queued job and poll until it finishes (scans and sweeps can outlast a 25 s resolver).
export async function runJob(kind, args = {}, { intervalMs = 2500, maxMs = 300000 } = {}) {
  const { id } = await call('startJob', { kind, args });
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const j = await call('getJob', { id });
    if (j.state === 'done') return j.result;
    if (j.state === 'failed') throw new Error(j.error || 'Job failed');
  }
  throw new Error('Still running. Refresh in a minute to see the result.');
}
