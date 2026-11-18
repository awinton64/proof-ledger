import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Stack, Inline, Box, Text, Strong, Heading, Button, Select, Label, Textfield, TextArea, DatePicker, Checkbox,
  DynamicTable, SectionMessage, Spinner, Tabs, TabList, Tab, TabPanel, Lozenge, DonutChart, Link, List, ListItem, Toggle, xcss,
} from '@forge/react';
import { call, runJob, Verdict } from './common';

const card = xcss({ padding: 'space.200', borderColor: 'color.border', borderWidth: 'border.width', borderStyle: 'solid', borderRadius: 'border.radius' });
const STATE = { active: 'success', expired: 'removed', revoked: 'removed', not_started: 'default' };
const opt = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

const Stat = ({ label, value, tone }) => (
  <Box xcss={card}>
    <Stack space="space.050">
      <Heading as="h2">{String(value)}</Heading>
      <Text>{tone ? <Lozenge appearance={tone}>{label}</Lozenge> : label}</Text>
    </Stack>
  </Box>
);

// ---------------- Dashboard ----------------

const Dashboard = ({ version, onChanged }) => {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const load = () => call('dashboard').then(setD).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [version]);
  const run = (name, label) => {
    setBusy(label);
    setError(null);
    runJob(name).then((r) => {
      if (name === 'sweep') setMsg(`Sweep checked ${r.pagesChecked} page(s) for ${r.affected.length} affected customer(s): ${r.created.length} new fix task(s)${r.created.length ? ` (${r.created.map((c) => c.key).join(', ')})` : ''}, ${r.existing.length} already open.`);
      else setMsg(`Scanned ${r.pages} page(s) that name a ledger customer.`);
      return load();
    }).catch((e) => setError(e.message)).finally(() => { setBusy(''); onChanged && onChanged(); });
  };
  if (error && !d) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!d) return <Spinner />;
  const t = d.totals;
  const health = [
    { status: 'Clear or warning only', count: Math.max(0, t.pagesScanned - t.pagesFlagged) },
    { status: 'Flagged', count: t.pagesFlagged },
  ];
  return (
    <Stack space="space.300">
      <Inline space="space.100" alignBlock="center">
        <Button appearance="primary" isDisabled={!!busy} onClick={() => run('scanAll', 'scan')}>{busy === 'scan' ? 'Scanning...' : 'Scan Confluence'}</Button>
        <Button isDisabled={!!busy} onClick={() => run('sweep', 'sweep')}>{busy === 'sweep' ? 'Sweeping...' : 'Run churn and expiry sweep'}</Button>
        <Text>{d.lastScanAt ? `Last scan ${d.lastScanAt.slice(0, 16).replace('T', ' ')} UTC` : 'No scan yet'}</Text>
      </Inline>
      {msg && <SectionMessage appearance="information"><Text>{msg}</Text></SectionMessage>}
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      <Inline space="space.150" shouldWrap>
        <Stat label="Customers in ledger" value={t.customers} />
        <Stat label="Permissions on record" value={t.permissions} />
        <Stat label="Expiring in 30 days" value={t.expiring} tone={t.expiring ? 'inprogress' : 'success'} />
        <Stat label="Unconsented uses" value={t.unconsented} tone={t.unconsented ? 'removed' : 'success'} />
        <Stat label="Pages flagged" value={`${t.pagesFlagged} of ${t.pagesScanned}`} tone={t.pagesFlagged ? 'moved' : 'success'} />
      </Inline>
      {t.pagesScanned > 0 && (
        <Box xcss={xcss({ maxWidth: '420px' })}>
          <DonutChart data={health} colorAccessor="status" valueAccessor="count" labelAccessor="status" title="Scanned pages" height={260} hideMenu />
        </Box>
      )}

      <Heading as="h3">Unconsented or wrong-channel uses</Heading>
      {d.unconsented.length === 0 ? <Text>None found in the last scan.</Text> : (
        <DynamicTable
          head={{ cells: ['Page', 'Customer', 'Verdict', 'Why', 'Fix'].map((c) => ({ key: c, content: c })) }}
          rows={d.unconsented.map((f, i) => ({
            key: `u${i}`,
            cells: [
              { key: 'p', content: f.pageUrl ? <Link href={f.pageUrl} openNewTab>{f.pageTitle}</Link> : <Text>{f.pageTitle}</Text> },
              { key: 'c', content: <Text>{f.customer}</Text> },
              { key: 'v', content: <Verdict value={f.verdict} /> },
              { key: 'r', content: <Text>{f.reasons.join(' ')}</Text> },
              { key: 'f', content: <Text>{f.fix}</Text> },
            ],
          }))}
        />
      )}

      <Heading as="h3">Churn fallout</Heading>
      {d.churnFallout.length === 0 ? <Text>No churned customer appears on a scanned page.</Text> : (
        <List type="unordered">{d.churnFallout.map((f, i) => <ListItem key={`cf${i}`}>{`${f.customer} still appears on "${f.pageTitle}"`}</ListItem>)}</List>
      )}
      {d.lastSweep && (
        <Text>{`Last sweep (${d.lastSweep.reason}, ${d.lastSweep.at.slice(0, 16).replace('T', ' ')} UTC): ${d.lastSweep.created.length} task(s) created, ${d.lastSweep.existing.length} already open.`}</Text>
      )}

      <Heading as="h3">Permissions expiring in 30 days</Heading>
      {d.expiring.length === 0 ? <Text>Nothing expires in the next 30 days.</Text> : (
        <DynamicTable
          head={{ cells: ['Customer', 'Use', 'Channels', 'Expires', 'Days left'].map((c) => ({ key: c, content: c })) }}
          rows={d.expiring.map((p) => ({ key: p.id, cells: [
            { key: 'c', content: <Text>{p.customer}</Text> },
            { key: 'a', content: <Text>{p.assetType}</Text> },
            { key: 'ch', content: <Text>{(p.channels || []).join(', ')}</Text> },
            { key: 'e', content: <Text>{p.expiresOn}</Text> },
            { key: 'd', content: <Lozenge appearance="inprogress">{String(p.days)}</Lozenge> },
          ] }))}
        />
      )}

      <Heading as="h3">Over-asked reference customers (last 90 days)</Heading>
      {d.overAsked.length === 0 ? <Text>No customer is at its reference-call limit.</Text> : (
        <List type="unordered">{d.overAsked.map((o) => <ListItem key={o.customerId}>{`${o.customer}: ${o.used} call(s), limit ${o.limit || 'not set'}`}</ListItem>)}</List>
      )}
    </Stack>
  );
};

// ---------------- Ledger ----------------

const EMPTY = { customerId: '', assetType: 'logo', channels: [], startsOn: '', expiresOn: '', consentSource: '', approvedText: '', maxPerQuarter: '', revoked: false };

const Ledger = ({ version, onChanged }) => {
  const [v, setV] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call('ledger').then(setV).catch((e) => setError(e.message)); }, [version]);
  const act = (name, payload, after) => {
    setBusy(true);
    setError(null);
    const p = name === 'setCustomerStatus' && payload.status === 'churned'
      ? runJob('churn', payload).then(async (sweep) => ({ view: await call('ledger'), sweep }))
      : call(name, payload);
    p.then((r) => {
      if (r.view) { setV(r.view); if (r.sweep) setNote(`Marked churned. Sweep raised ${r.sweep.created.length} fix task(s)${r.sweep.created.length ? `: ${r.sweep.created.map((c) => `${c.key} (${c.page})`).join(', ')}` : ''}.`); }
      else setV(r);
      after && after();
      onChanged && onChanged();
    }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  if (!v) return error ? <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage> : <Spinner />;
  const customers = v.customers.map((c) => ({ value: c.id, label: c.name }));
  const assets = opt(v.assetTypes);
  const channels = opt(v.channels);
  const needsText = form.assetType === 'quote' || form.assetType === 'outcome_claim';

  return (
    <Stack space="space.300">
      {note && <SectionMessage appearance="warning"><Text>{note}</Text></SectionMessage>}
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      <Heading as="h3">Customers (Jira Service Management organizations)</Heading>
      <DynamicTable
        head={{ cells: ['Customer', 'Segment', 'Status', 'Permissions', 'Action'].map((c) => ({ key: c, content: c })) }}
        rows={v.customers.map((c) => ({ key: c.id, cells: [
          { key: 'n', content: <Text><Strong>{c.name}</Strong>{c.aliases?.length ? ` (also: ${c.aliases.join(', ')})` : ''}</Text> },
          { key: 's', content: <Text>{c.segment || '-'}</Text> },
          { key: 'st', content: <Lozenge appearance={c.status === 'churned' ? 'removed' : 'success'}>{c.status}</Lozenge> },
          { key: 'p', content: <Text>{String(v.permissions.filter((p) => p.customerId === c.id).length)}</Text> },
          { key: 'a', content: c.status === 'churned'
            ? <Button spacing="compact" isDisabled={busy} onClick={() => act('setCustomerStatus', { customerId: c.id, status: 'active' })}>Mark active</Button>
            : <Button spacing="compact" appearance="warning" isDisabled={busy} onClick={() => act('setCustomerStatus', { customerId: c.id, status: 'churned' })}>Mark churned</Button> },
        ] }))}
      />

      <Heading as="h3">Permissions</Heading>
      <DynamicTable
        head={{ cells: ['Customer', 'Use', 'Channels', 'Valid', 'State', 'Consent source', ''].map((c, i) => ({ key: `h${i}`, content: c })) }}
        rows={v.permissions.map((p) => ({ key: p.id, cells: [
          { key: 'c', content: <Text>{p.customer}</Text> },
          { key: 'a', content: <Text>{v.assetTypes[p.assetType] || p.assetType}{p.maxPerQuarter ? ` (max ${p.maxPerQuarter}/90 days)` : ''}</Text> },
          { key: 'ch', content: <Text>{(p.channels || []).map((x) => v.channels[x] || x).join(', ')}</Text> },
          { key: 'd', content: <Text>{`${p.startsOn || '?'} to ${p.expiresOn || 'open'}`}</Text> },
          { key: 's', content: <Lozenge appearance={STATE[p.state] || 'default'}>{p.state.replace('_', ' ')}</Lozenge> },
          { key: 'src', content: <Text>{p.consentSource || '-'}</Text> },
          { key: 'x', content: <Inline space="space.050">
            <Button spacing="compact" isDisabled={busy} onClick={() => setForm({ ...EMPTY, ...p, maxPerQuarter: p.maxPerQuarter ? String(p.maxPerQuarter) : '' })}>Edit</Button>
            <Button spacing="compact" appearance="subtle" isDisabled={busy} onClick={() => act('deletePermission', { customerId: p.customerId, id: p.id })}>Delete</Button>
          </Inline> },
        ] }))}
      />

      <Heading as="h3">{form.id ? 'Edit permission' : 'Record a permission'}</Heading>
      <Stack space="space.100">
        <Inline space="space.150" grow="fill">
          <Stack space="space.050" grow="fill"><Label labelFor="f-c">Customer</Label>
            <Select inputId="f-c" options={customers} value={customers.find((o) => o.value === form.customerId) || null} onChange={(o) => setForm({ ...form, customerId: o?.value || '' })} /></Stack>
          <Stack space="space.050" grow="fill"><Label labelFor="f-a">Use</Label>
            <Select inputId="f-a" options={assets} value={assets.find((o) => o.value === form.assetType) || null} onChange={(o) => setForm({ ...form, assetType: o?.value || '' })} /></Stack>
        </Inline>
        <Stack space="space.050"><Label labelFor="f-ch">Allowed channels</Label>
          <Select inputId="f-ch" isMulti options={channels} value={channels.filter((o) => form.channels.includes(o.value))} onChange={(os) => setForm({ ...form, channels: (os || []).map((o) => o.value) })} /></Stack>
        <Inline space="space.150" grow="fill">
          <Stack space="space.050" grow="fill"><Label labelFor="f-s">Starts</Label>
            <DatePicker id="f-s" value={form.startsOn || undefined} onChange={(d) => setForm({ ...form, startsOn: d })} /></Stack>
          <Stack space="space.050" grow="fill"><Label labelFor="f-e">Expires</Label>
            <DatePicker id="f-e" value={form.expiresOn || undefined} onChange={(d) => setForm({ ...form, expiresOn: d })} /></Stack>
          <Stack space="space.050" grow="fill"><Label labelFor="f-src">Consent source (request key or link)</Label>
            <Textfield id="f-src" value={form.consentSource} onChange={(e) => setForm({ ...form, consentSource: e.target.value })} /></Stack>
        </Inline>
        {needsText && <Stack space="space.050"><Label labelFor="f-t">Approved wording</Label>
          <TextArea id="f-t" value={form.approvedText} onChange={(e) => setForm({ ...form, approvedText: e.target.value })} /></Stack>}
        {form.assetType === 'reference_call' && <Stack space="space.050"><Label labelFor="f-m">Max reference calls per 90 days</Label>
          <Textfield id="f-m" value={form.maxPerQuarter} onChange={(e) => setForm({ ...form, maxPerQuarter: e.target.value })} /></Stack>}
        <Checkbox label="Customer revoked this permission" isChecked={!!form.revoked} onChange={(e) => setForm({ ...form, revoked: e.target.checked })} />
        <Inline space="space.100">
          <Button appearance="primary" isDisabled={busy || !form.customerId || !form.assetType || form.channels.length === 0} onClick={() => act('savePermission', form, () => setForm(EMPTY))}>{form.id ? 'Save changes' : 'Add permission'}</Button>
          {form.id && <Button onClick={() => setForm(EMPTY)}>Cancel</Button>}
        </Inline>
      </Stack>
    </Stack>
  );
};

// ---------------- Quick check ----------------

const Check = () => {
  const [v, setV] = useState(null);
  const [form, setForm] = useState({ customer: '', assetType: 'logo', channel: 'website', quoteText: '' });
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { call('ledger').then(setV).catch((e) => setError(e.message)); }, []);
  if (!v) return error ? <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage> : <Spinner />;
  const customers = v.customers.map((c) => ({ value: c.id, label: c.name }));
  const assets = opt(v.assetTypes);
  const channels = opt(v.channels);
  return (
    <Stack space="space.200">
      <Text>The same rule check that the issue panel, the Confluence byline, the Rovo agent and the MCP tools use.</Text>
      <Inline space="space.150" grow="fill">
        <Stack space="space.050" grow="fill"><Label labelFor="q-c">Customer</Label><Select inputId="q-c" options={customers} onChange={(o) => setForm({ ...form, customer: o?.value || '' })} /></Stack>
        <Stack space="space.050" grow="fill"><Label labelFor="q-a">Use</Label><Select inputId="q-a" options={assets} value={assets.find((o) => o.value === form.assetType)} onChange={(o) => setForm({ ...form, assetType: o?.value })} /></Stack>
        <Stack space="space.050" grow="fill"><Label labelFor="q-ch">Channel</Label><Select inputId="q-ch" options={channels} value={channels.find((o) => o.value === form.channel)} onChange={(o) => setForm({ ...form, channel: o?.value })} /></Stack>
      </Inline>
      {(form.assetType === 'quote' || form.assetType === 'outcome_claim') && <Stack space="space.050"><Label labelFor="q-t">Wording</Label><TextArea id="q-t" value={form.quoteText} onChange={(e) => setForm({ ...form, quoteText: e.target.value })} /></Stack>}
      <Inline><Button appearance="primary" isDisabled={!form.customer} onClick={() => call('check', form).then(setR).catch((e) => setError(e.message))}>Check</Button></Inline>
      {r && (
        <Stack space="space.100">
          <Inline space="space.100" alignBlock="center"><Verdict value={r.verdict} /><Text><Strong>{r.customer}</Strong></Text></Inline>
          <List type="unordered">{[...r.reasons, ...(r.warnings || []).map((w) => `Note: ${w}`)].map((x, i) => <ListItem key={`x${i}`}>{x}</ListItem>)}</List>
        </Stack>
      )}
    </Stack>
  );
};

const App = () => {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((x) => x + 1);
  return (
    <Stack space="space.200">
      <Text>Know which customers you may name, where, and until when. Consent lives on each customer's Jira Service Management organization; checks are rules, not AI.</Text>
      <Tabs id="pl-tabs">
        <TabList>
          <Tab>Dashboard</Tab>
          <Tab>Customers and permissions</Tab>
          <Tab>Quick check</Tab>
        </TabList>
        <TabPanel><Box xcss={xcss({ paddingTop: 'space.200', width: '100%' })}><Dashboard version={version} onChanged={bump} /></Box></TabPanel>
        <TabPanel><Box xcss={xcss({ paddingTop: 'space.200', width: '100%' })}><Ledger version={version} onChanged={bump} /></Box></TabPanel>
        <TabPanel><Box xcss={xcss({ paddingTop: 'space.200', width: '100%' })}><Check /></Box></TabPanel>
      </Tabs>
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
