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
