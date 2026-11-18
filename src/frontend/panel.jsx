import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Inline, Text, Strong, Button, Select, Label, TextArea, Textfield, SectionMessage, Spinner, List, ListItem } from '@forge/react';
import { call, Verdict } from './common';

const opt = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
const MSG = { ALLOWED: 'success', NEEDS_CONSENT: 'warning', BLOCKED: 'error' };
const TITLE = { ALLOWED: 'Allowed', NEEDS_CONSENT: 'Needs consent', BLOCKED: 'Blocked' };

const App = () => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = (d) => {
    setData(d);
    setForm({ customerId: d.request?.customerId || '', assetType: d.request?.assetType || '', channel: d.request?.channel || '', quoteText: d.request?.quoteText || '', purpose: d.request?.purpose || '' });
  };
  useEffect(() => { call('getRequest').then(load).catch((e) => setError(e.message)); }, []);
  const act = (name, payload) => {
    setBusy(true);
    setError(null);
    call(name, payload).then(load).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };

  if (!data) return error ? <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage> : <Spinner />;
  const customers = data.customers.map((c) => ({ value: c.id, label: c.status === 'churned' ? `${c.name} (churned)` : c.name }));
  const assets = opt(data.assetTypes);
  const channels = opt(data.channels);
  const pick = (list, v) => list.find((o) => o.value === v) || null;
  const needsText = form.assetType === 'quote' || form.assetType === 'outcome_claim';
  const v = data.verdict;

  return (
    <Stack space="space.150">
      <Text>Ask before you name a customer. The answer comes from consent recorded on the customer's Jira Service Management organization.</Text>
      <Stack space="space.050">
        <Label labelFor="pl-customer">Customer</Label>
        <Select inputId="pl-customer" options={customers} value={pick(customers, form.customerId)} onChange={(o) => setForm({ ...form, customerId: o?.value || '' })} placeholder="Choose a customer organization" />
      </Stack>
      <Inline space="space.150" grow="fill">
        <Stack space="space.050" grow="fill">
          <Label labelFor="pl-asset">Use</Label>
          <Select inputId="pl-asset" options={assets} value={pick(assets, form.assetType)} onChange={(o) => setForm({ ...form, assetType: o?.value || '' })} />
        </Stack>
        <Stack space="space.050" grow="fill">
          <Label labelFor="pl-channel">Channel</Label>
          <Select inputId="pl-channel" options={channels} value={pick(channels, form.channel)} onChange={(o) => setForm({ ...form, channel: o?.value || '' })} />
        </Stack>
      </Inline>
      {needsText && (
        <Stack space="space.050">
          <Label labelFor="pl-text">Exact wording you want to use</Label>
          <TextArea id="pl-text" value={form.quoteText} onChange={(e) => setForm({ ...form, quoteText: e.target.value })} />
        </Stack>
      )}
      <Stack space="space.050">
        <Label labelFor="pl-purpose">Purpose (optional)</Label>
        <Textfield id="pl-purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
      </Stack>
      <Inline space="space.100">
        <Button appearance="primary" isDisabled={busy || !form.customerId || !form.assetType || !form.channel} onClick={() => act('saveRequest', form)}>{busy ? 'Checking...' : 'Save and check'}</Button>
        {v?.verdict === 'ALLOWED' && form.assetType === 'reference_call' && !data.logged && (
          <Button isDisabled={busy} onClick={() => act('logUse')}>Log reference call as used</Button>
        )}
      </Inline>
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      {v && (
        <SectionMessage appearance={MSG[v.verdict] || 'information'} title={TITLE[v.verdict] || v.verdict}>
          <Stack space="space.050">
            <List type="unordered">
              {v.reasons.map((r, i) => <ListItem key={`r${i}`}>{r}</ListItem>)}
              {v.warnings.map((w, i) => <ListItem key={`w${i}`}>{`Note: ${w}`}</ListItem>)}
            </List>
            {v.approvedText ? <Text><Strong>Approved wording:</Strong> {v.approvedText}</Text> : null}
            {data.logged ? <Text>This request is logged as a reference call.</Text> : null}
          </Stack>
        </SectionMessage>
      )}
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
