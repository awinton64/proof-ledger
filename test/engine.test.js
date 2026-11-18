import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, scanPage, dashboard, referenceable, findMentions, quoteMatches, htmlToText, channelFromLabels, VERDICT } from '../src/engine.js';

const today = '2026-11-18';
const acme = { id: 'c1', name: 'Brindlewood Freight', aliases: ['Brindlewood'], status: 'active', segment: 'Logistics' };
const quill = { id: 'c2', name: 'Quillmere Health', status: 'active', segment: 'Healthcare' };
const gone = { id: 'c3', name: 'Orrinvale Credit Union', status: 'churned', churnedAt: '2026-11-01' };
const customers = [acme, quill, gone];
const permissions = [
  { id: 'p1', customerId: 'c1', assetType: 'logo', channels: ['website', 'sales_deck'], startsOn: '2026-01-01', expiresOn: '2027-06-30', consentSource: 'CUST-1' },
  { id: 'p2', customerId: 'c1', assetType: 'quote', channels: ['website', 'case_study'], startsOn: '2026-01-01', expiresOn: '2026-12-01', approvedText: 'Tamberlit cut our month-end reporting from four days to one.' },
  { id: 'p3', customerId: 'c1', assetType: 'reference_call', channels: ['sales_call'], startsOn: '2026-01-01', expiresOn: '2027-12-31', maxPerQuarter: 2 },
  { id: 'p4', customerId: 'c2', assetType: 'logo', channels: ['website'], startsOn: '2025-01-01', expiresOn: '2026-10-31' },
  { id: 'p5', customerId: 'c3', assetType: 'logo', channels: ['website', 'paid_ads'], startsOn: '2026-01-01', expiresOn: '2027-12-31' },
  { id: 'p6', customerId: 'c2', assetType: 'case_study', channels: ['case_study'], startsOn: '2026-01-01', expiresOn: '2027-12-31', revoked: true, revokedOn: '2026-09-01' },
];

test('allowed in an approved channel, with reasons', () => {
  const v = evaluate({ customer: acme, permissions, assetType: 'logo', channel: 'website', today });
  assert.equal(v.verdict, VERDICT.ALLOWED);
  assert.match(v.reasons[0], /valid until 2027-06-30/);
});

test('wrong channel needs consent and names the approved channels', () => {
  const v = evaluate({ customer: acme, permissions, assetType: 'logo', channel: 'paid_ads', today });
  assert.equal(v.verdict, VERDICT.NEEDS_CONSENT);
  assert.match(v.reasons[0], /Website, Sales deck, not Paid ads/);
});

test('missing permission needs consent', () => {
  const v = evaluate({ customer: quill, permissions, assetType: 'quote', channel: 'website', today });
  assert.equal(v.verdict, VERDICT.NEEDS_CONSENT);
});

test('expired permission needs renewal', () => {
  const v = evaluate({ customer: quill, permissions, assetType: 'logo', channel: 'website', today });
  assert.equal(v.verdict, VERDICT.NEEDS_CONSENT);
  assert.match(v.reasons[0], /expired on 2026-10-31/);
});

test('churned customer is blocked even with a valid permission', () => {
  const v = evaluate({ customer: gone, permissions, assetType: 'logo', channel: 'website', today });
  assert.equal(v.verdict, VERDICT.BLOCKED);
  assert.match(v.reasons[0], /churned since 2026-11-01/);
});

test('revoked permission is blocked', () => {
  const v = evaluate({ customer: quill, permissions, assetType: 'case_study', channel: 'case_study', today });
  assert.equal(v.verdict, VERDICT.BLOCKED);
});

test('expiry within 30 days is allowed with a warning', () => {
  const v = evaluate({ customer: acme, permissions, assetType: 'quote', channel: 'website', today, quoteText: 'Tamberlit cut our month-end reporting from four days to one.' });
  assert.equal(v.verdict, VERDICT.ALLOWED);
  assert.match(v.warnings[0], /expires in 13 days/);
});

test('changed quote wording needs consent', () => {
  const v = evaluate({ customer: acme, permissions, assetType: 'quote', channel: 'website', today, quoteText: 'Tamberlit cut our month-end reporting from four days to ten minutes.' });
  assert.equal(v.verdict, VERDICT.NEEDS_CONSENT);
  assert.match(v.reasons[0], /wording differs/);
});

test('reference call limit blocks the third call in 90 days', () => {
  const uses = [
    { customerId: 'c1', assetType: 'reference_call', date: '2026-10-01' },
    { customerId: 'c1', assetType: 'reference_call', date: '2026-11-02' },
  ];
  const v = evaluate({ customer: acme, permissions, assetType: 'reference_call', channel: 'sales_call', today, uses });
  assert.equal(v.verdict, VERDICT.BLOCKED);
  assert.match(v.reasons[0], /Next slot opens 2026-12-30/);
  const older = [{ customerId: 'c1', assetType: 'reference_call', date: '2026-07-01' }, uses[1]];
  assert.equal(evaluate({ customer: acme, permissions, assetType: 'reference_call', channel: 'sales_call', today, uses: older }).verdict, VERDICT.ALLOWED);
});

test('unknown customer needs consent', () => {
  assert.equal(evaluate({ customer: null, permissions, assetType: 'logo', channel: 'website', today }).verdict, VERDICT.NEEDS_CONSENT);
});

test('not-yet-started permission is not usable', () => {
  const p = [{ customerId: 'c2', assetType: 'quote', channels: ['website'], startsOn: '2027-01-01', expiresOn: '2027-12-31' }];
  const v = evaluate({ customer: quill, permissions: p, assetType: 'quote', channel: 'website', today });
  assert.equal(v.verdict, VERDICT.NEEDS_CONSENT);
  assert.match(v.reasons[0], /starts on 2027-01-01/);
});

test('mentions match whole words and aliases, case-insensitive', () => {
  const m = findMentions('Teams at BRINDLEWOOD and Quillmere Health agree. Brindlewoodish is not a match.', customers);
  assert.deepEqual(m.map((x) => x.customerId), ['c1', 'c2']);
});

test('quote matching ignores punctuation, case and curly quotes', () => {
  assert.ok(quoteMatches('tamberlit cut our month‑end reporting from four days to one', 'Tamberlit cut our month-end reporting from four days to one.'));
  assert.ok(!quoteMatches('Tamberlit cut reporting time in half', 'Tamberlit cut our month-end reporting from four days to one.'));
});

test('channel label parsing', () => {
  assert.equal(channelFromLabels(['draft', 'channel-paid-ads']), 'paid_ads');
  assert.equal(channelFromLabels(['channel-unknown']), null);
});

test('page scan flags wrong channel, churned customer and altered quote', () => {
  const html = '<h1>Q4 paid campaign</h1><p>Trusted by Brindlewood Freight and Orrinvale Credit Union.</p><blockquote>“Tamberlit cut our month-end reporting from four days to ten minutes.” - Brindlewood Freight</blockquote>';
  const r = scanPage({ title: 'Ad copy', text: htmlToText(html), labels: ['channel-paid-ads'], customers, permissions, today });
  assert.equal(r.status, 'BLOCKED');
  const kinds = r.findings.map((f) => `${f.customer}:${f.kind}:${f.verdict}`).sort();
  assert.deepEqual(kinds, [
    'Brindlewood Freight:logo:NEEDS_CONSENT',
    'Brindlewood Freight:quote:NEEDS_CONSENT',
    'Orrinvale Credit Union:logo:BLOCKED',
  ]);
});

test('page scan is clear when every use is covered', () => {
  const text = 'Brindlewood Freight says: "Tamberlit cut our month-end reporting from four days to one."';
  const r = scanPage({ title: 'Home', text, labels: ['channel-website'], customers, permissions, today });
  assert.equal(r.findings.filter((f) => f.verdict !== 'WARNING').length, 0);
  assert.notEqual(r.status, 'BLOCKED');
});

test('unlabeled pages are reported, not flagged', () => {
  const r = scanPage({ title: 'Notes', text: 'Call notes with Quillmere Health.', labels: [], customers, permissions, today });
  assert.equal(r.status, 'UNLABELED');
  assert.equal(r.findings.length, 0);
});

test('outcome claims need outcome or matching quote consent', () => {
  const text = 'Quillmere Health: "We reduced claim handling time by 40% in one quarter with Tamberlit."';
  const r = scanPage({ title: 'Deck', text, labels: ['channel-sales-deck'], customers, permissions, today });
  assert.ok(r.findings.some((f) => f.kind === 'outcome_claim' && f.verdict === 'NEEDS_CONSENT'));
});

test('dashboard summarizes expiring, over-asked and churn fallout', () => {
  const scan = scanPage({ title: 'Ad', text: 'Orrinvale Credit Union loves us.', labels: ['channel-website'], customers, permissions, today });
  const uses = [{ customerId: 'c1', assetType: 'reference_call', date: '2026-11-01' }, { customerId: 'c1', assetType: 'reference_call', date: '2026-11-10' }];
  const d = dashboard({ customers, permissions, uses, scans: [{ ...scan, pageId: '1', title: 'Ad' }], today });
  assert.equal(d.expiring.length, 1);
  assert.equal(d.expiring[0].id, 'p2');
  assert.equal(d.overAsked[0].customer, 'Brindlewood Freight');
  assert.equal(d.churnFallout.length, 1);
  assert.equal(d.totals.pagesFlagged, 1);
});

test('referenceable lists only customers allowed for that use', () => {
  const r = referenceable({ customers, permissions, assetType: 'logo', channel: 'website', today });
  assert.deepEqual(r.map((x) => x.name), ['Brindlewood Freight']);
});
