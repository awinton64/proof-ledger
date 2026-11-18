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

const Dashboard = ({ data, onChanged }) => {
  const [d, setD] = useState(data);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setD(data); }, [data]);
  const run = (name, label) => {
    setBusy(label);
    setError(null);
    runJob(name).then((r) => {
      if (name === 'sweep') setMsg(`Sweep checked ${r.pagesChecked} page(s) for ${r.affected.length} affected customer(s): ${r.created.length} new fix task(s)${r.created.length ? ` (${r.created.map((c) => c.key).join(', ')})` : ''}, ${r.existing.length} already open.`);
      else setMsg(`Scanned ${r.pages} page(s) that name a ledger customer.`);
    }).catch((e) => setError(e.message)).finally(() => { setBusy(''); onChanged && onChanged(); });
  };
  if (error && !d) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!d) return <Spinner />;
  const t = d.totals;
  const empty = t.customers === 0;
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
      {empty && (
        <SectionMessage appearance="discovery" title="No customers in the ledger yet">
          <Text>Add a customer on the Customers and permissions tab, or, if you are a Jira admin, open the Demo data tab and click Load demo data to try Proof Ledger with invented customers and pages.</Text>
        </SectionMessage>
      )}
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

const Ledger = ({ view, onChanged }) => {
  const [v, setV] = useState(view);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addOrg, setAddOrg] = useState(null);
  const [newName, setNewName] = useState('');
  useEffect(() => { setV(view); }, [view]);
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

      {v.customers.length === 0 && <Text>No customers in the ledger yet. Add one below.</Text>}

      <Heading as="h4">Add a customer to the ledger</Heading>
      <Text>{`Only Jira Service Management organizations you add here are part of the ledger.${v.untracked.length ? ` ${v.untracked.length} other organization(s) on this site are not tracked.` : ''}`}</Text>
      <Inline space="space.150" alignBlock="end" grow="fill">
        <Stack space="space.050" grow="fill"><Label labelFor="add-org">Existing organization</Label>
          <Select inputId="add-org" isClearable options={v.untracked.map((o) => ({ value: o.id, label: o.name }))} value={addOrg} onChange={(o) => setAddOrg(o || null)} placeholder={v.untracked.length ? 'Choose an organization' : 'All organizations are tracked'} /></Stack>
        <Button isDisabled={busy || !addOrg} onClick={() => act('addCustomer', { orgId: addOrg.value }, () => setAddOrg(null))}>Add organization</Button>
        <Stack space="space.050" grow="fill"><Label labelFor="add-new">Or create a new organization</Label>
          <Textfield id="add-new" value={newName} placeholder="Customer name" onChange={(e) => setNewName(e.target.value)} /></Stack>
        <Button isDisabled={busy || !newName.trim()} onClick={() => act('addCustomer', { name: newName }, () => setNewName(''))}>Create and add</Button>
      </Inline>

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

const Check = ({ view: v }) => {
  const [form, setForm] = useState({ customer: '', assetType: 'logo', channel: 'website', quoteText: '' });
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const customers = v.customers.map((c) => ({ value: c.id, label: c.name }));
  const assets = opt(v.assetTypes);
  const channels = opt(v.channels);
  return (
    <Stack space="space.200">
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
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

// ---------------- Demo data (admins) ----------------

const Demo = ({ setup, onChanged }) => {
  const s = setup;
  const [form, setForm] = useState({ taskProject: setup.settings.taskProject || '', spaceKey: setup.settings.demoSpaceKey || '' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  if (!s.isAdmin) return <SectionMessage appearance="information"><Text>Only Jira administrators can load or reset the demo data.</Text></SectionMessage>;
  const projects = s.projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }));
  const spaces = s.spaces.map((x) => ({ value: x.key, label: `${x.name} (${x.key})` }));
  const ready = form.taskProject && form.spaceKey && projects.some((o) => o.value === form.taskProject) && spaces.some((o) => o.value === form.spaceKey);
  const go = (reset) => {
    setBusy(reset ? 'reset' : 'load');
    setError(null);
    setMsg(null);
    runJob('demo', { reset, taskProject: form.taskProject, spaceKey: form.spaceKey }, { maxMs: 600000 })
      .then((r) => { setMsg({ text: `${reset ? 'Demo reset' : 'Demo loaded'}: ${r.message}`, skipped: r.skipped || [] }); })
      .catch((e) => setError(e.message))
      .finally(() => { setBusy(''); onChanged && onChanged(); });
  };
  return (
    <Stack space="space.200">
      <Text>Load a small, entirely fictional demo so you can try Proof Ledger right away: 12 invented customers of the invented vendor Tamberlit Analytics (as Jira Service Management organizations), 20 consent records, 8 marketing pages in the Confluence space you choose, and 6 proof requests in the Jira project you choose.</Text>
      <Text>Safe to run more than once. It only creates or changes demo records (marked as demo), never your own customers, pages or issues. Reset restores the demo to its starting state and closes fix tasks raised for demo customers.</Text>
      <Text>{`Demo customers in the ledger: ${s.demoCustomers} of ${s.demoTotal}.`}</Text>
      <Inline space="space.150" grow="fill">
        <Stack space="space.050" grow="fill"><Label labelFor="d-p">Jira project for proof requests and fix tasks</Label>
          <Select inputId="d-p" options={projects} value={projects.find((o) => o.value === form.taskProject) || null} onChange={(o) => setForm({ ...form, taskProject: o?.value || '' })} /></Stack>
        <Stack space="space.050" grow="fill"><Label labelFor="d-s">Confluence space for demo pages</Label>
          <Select inputId="d-s" options={spaces} value={spaces.find((o) => o.value === form.spaceKey) || null} onChange={(o) => setForm({ ...form, spaceKey: o?.value || '' })} /></Stack>
      </Inline>
      <Inline space="space.100" alignBlock="center">
        <Button appearance="primary" isDisabled={!!busy || !ready} onClick={() => go(false)}>{busy === 'load' ? 'Loading demo data...' : 'Load demo data'}</Button>
        <Button isDisabled={!!busy || !ready || s.demoCustomers === 0} onClick={() => go(true)}>{busy === 'reset' ? 'Resetting...' : 'Reset demo data'}</Button>
        {busy && <Text>This takes about a minute.</Text>}
      </Inline>
      {msg && (
        <SectionMessage appearance="success">
          <Stack space="space.050">
            <Text>{msg.text}</Text>
            {msg.skipped.map((x, i) => <Text key={`sk${i}`}>{`Skipped: ${x}`}</Text>)}
          </Stack>
        </SectionMessage>
      )}
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
    </Stack>
  );
};

const App = () => {
  const [home, setHome] = useState(null);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((x) => x + 1);
  useEffect(() => {
    setError(null);
    call('home', {}, { onRetry: () => setRetrying(true) })
      .then((h) => { setHome(h); setRetrying(false); })
      .catch((e) => { setError(e.message); setRetrying(false); });
  }, [version]);
  const pad = xcss({ paddingTop: 'space.200', width: '100%' });
  let body;
  if (home?.needsJsm) {
    body = <SectionMessage appearance="warning" title="Jira Service Management is required"><Text>{home.message}</Text></SectionMessage>;
  } else if (!home) {
    body = error
      ? <SectionMessage appearance="error" title="Proof Ledger could not load"><Stack space="space.100"><Text>{error}</Text><Inline><Button onClick={bump}>Try again</Button></Inline></Stack></SectionMessage>
      : <Inline space="space.100" alignBlock="center"><Spinner /><Text>{retrying ? 'Still loading (the app was asleep), retrying...' : 'Loading the ledger...'}</Text></Inline>;
  } else {
    body = (
      <Stack space="space.100">
        {error && <SectionMessage appearance="error"><Stack space="space.100"><Text>{`Refresh failed: ${error}`}</Text><Inline><Button onClick={bump}>Try again</Button></Inline></Stack></SectionMessage>}
        <Tabs id="pl-tabs">
          <TabList>
            <Tab>Dashboard</Tab>
            <Tab>Customers and permissions</Tab>
            <Tab>Quick check</Tab>
            <Tab>Demo data</Tab>
          </TabList>
          <TabPanel><Box xcss={pad}><Dashboard data={home.dashboard} onChanged={bump} /></Box></TabPanel>
          <TabPanel><Box xcss={pad}><Ledger view={home.view} onChanged={bump} /></Box></TabPanel>
          <TabPanel><Box xcss={pad}><Check view={home.view} /></Box></TabPanel>
          <TabPanel><Box xcss={pad}><Demo setup={home.demo} onChanged={bump} /></Box></TabPanel>
        </Tabs>
      </Stack>
    );
  }
  return (
    <Stack space="space.200">
      <Text>Know which customers you may name, where, and until when. Consent lives on each customer's Jira Service Management organization; checks are rules, not AI.</Text>
      {body}
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
