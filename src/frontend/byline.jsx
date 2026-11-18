import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Stack, Inline, Text, Strong, Button, DynamicTable, SectionMessage, Spinner, Em } from '@forge/react';
import { call, Verdict } from './common';

const ASSET = { logo: 'Name or logo', quote: 'Quote', case_study: 'Case study', reference_call: 'Reference', outcome_claim: 'Outcome claim' };

const App = () => {
  const [scan, setScan] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    setError(null);
    call('scanPage').then(setScan).catch((e) => setError(e.message)).finally(() => setBusy(false));
  };
  useEffect(run, []);
  if (error) return <SectionMessage appearance="error" title="Proof check failed"><Text>{error}</Text></SectionMessage>;
  if (!scan) return <Inline space="space.100"><Spinner /><Text>Checking customer mentions against the Proof Ledger...</Text></Inline>;
  const rows = scan.findings.map((f, i) => ({
    key: `f${i}`,
    cells: [
      { key: 'c', content: <Stack space="space.050"><Text><Strong>{f.customer}</Strong></Text><Text>{ASSET[f.kind] || f.kind}</Text><Verdict value={f.verdict} /></Stack> },
      { key: 'r', content: <Stack space="space.050"><Text>{f.reasons.join(' ')}</Text><Text><Em>{f.excerpt}</Em></Text><Text><Strong>Fix:</Strong> {f.fix}</Text></Stack> },
    ],
  }));
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center">
        <Verdict value={scan.status} />
        <Text>{scan.summary}</Text>
      </Inline>
      {scan.findings.length > 0 && (
        <DynamicTable
          head={{ cells: [{ key: 'c', content: 'Customer and use', width: 30 }, { key: 'r', content: 'Why and fix', width: 70 }] }}
          rows={rows}
        />
      )}
      {scan.mentioned?.length > 0 && <Text>Customers named on this page: {scan.mentioned.join(', ')}</Text>}
      <Inline space="space.100" alignBlock="center">
        <Button onClick={run} isDisabled={busy}>{busy ? 'Checking...' : 'Check again'}</Button>
        <Text>Rules only, no AI. Channel comes from the page's channel-* label.</Text>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
