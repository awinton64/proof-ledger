// Fictional demo data and the load/reset logic used by the in-app "Load demo data" action and by
// scripts/seed.mjs. No Forge imports: all site access goes through an adapter (`io`), so the same
// code runs inside Forge (as the app), from Node with an API token, and in tests against a fake site.
//
// Safety rules (tested in test/demo.test.js):
// - Only invented companies and pages are created. "Corvane Analytics" is the fictional vendor.
// - A record is touched only if it is demo data: an organization whose ledger record carries
//   `demo: true` (or, for sites seeded before the flag existed, a fictional name whose permissions
//   all have seed ids), a Confluence page with the demo label or demo banner, a Jira issue with the
//   demo label, or a fix task raised for a demo customer. Anything else with a matching name is
//   skipped and reported.
// - Load is idempotent and keeps changes made to existing demo records; reset restores them.

export const DEMO_LABEL = 'proof-ledger-demo';
export const DEMO_BANNER_TEXT = 'Fictional demo content for Proof Ledger';
export const DEMO_REQUEST_LABEL = 'proof-request';

export const DEMO_CUSTOMERS = [
  { name: 'Brindlewood Freight', aliases: ['Brindlewood'], segment: 'Logistics', owner: 'Account team East' },
  { name: 'Quillmere Health', segment: 'Healthcare', owner: 'Account team West' },
  { name: 'Orrinvale Credit Union', aliases: ['Orrinvale'], segment: 'Financial services', owner: 'Account team East', renewalAtRisk: true },
  { name: 'Saltmarrow Hotels', segment: 'Hospitality', owner: 'Account team West' },
  { name: 'Wrenfield Schools', segment: 'Education', owner: 'Account team East', doNotContact: true },
  { name: 'Velloran Insurance', segment: 'Financial services', owner: 'Account team West' },
  { name: 'Pellucid Harbor Software', aliases: ['Pellucid Harbor'], segment: 'Software', owner: 'Account team East' },
  { name: 'Cindergate Robotics', segment: 'Manufacturing', owner: 'Account team West' },
  { name: 'Thistlebrook Retail', segment: 'Retail', owner: 'Account team East' },
  { name: 'Lantern Quay Media', segment: 'Media', owner: 'Account team West' },
  { name: 'Graybirch Biotech', aliases: ['Graybirch'], segment: 'Healthcare', owner: 'Account team East' },
  { name: 'Kestrelmoor Energy', segment: 'Energy', owner: 'Account team West' },
];
const DEMO_NAMES = new Set(DEMO_CUSTOMERS.map((c) => c.name));

const Q = {
  brindle: 'With Corvane, our dispatch team stopped guessing which loads would run late.',
  orrin: 'Corvane gave our member services team one view of every open case.',
  velloran: 'Corvane gives our claims team one place to see what changed and why.',
  cinder: 'Corvane helped us find the bottleneck in our test lab within a week.',
  graybirchQuote: 'Our lab managers trust the numbers because they can trace every one of them.',
  graybirchClaim: 'Corvane cut our assay reporting cycle by 30% in two quarters.',
};

// [customer, assetType, channels, startsOffsetDays, expiresOffsetDays, extra]. Dates are relative to the
// day of loading, so the demo states (expiring soon, expired, over-asked) stay true.
export const DEMO_PERMISSIONS = [
  ['Brindlewood Freight', 'logo', ['website', 'sales_deck'], -300, 200],
  ['Brindlewood Freight', 'quote', ['website', 'case_study', 'sales_deck'], -300, 200, { approvedText: Q.brindle }],
  ['Brindlewood Freight', 'case_study', ['case_study', 'website'], -300, 200],
  ['Brindlewood Freight', 'reference_call', ['sales_call'], -300, 300, { maxPerQuarter: 2 }],
  ['Quillmere Health', 'logo', ['website'], -200, 300],
  ['Quillmere Health', 'case_study', ['case_study'], -200, 300, { revoked: true, revokedOffset: -14, notes: 'New CMO asked us to take the case study down.' }],
  ['Orrinvale Credit Union', 'logo', ['website', 'paid_ads', 'sales_deck'], -150, 250],
  ['Orrinvale Credit Union', 'quote', ['sales_deck'], -150, 250, { approvedText: Q.orrin }],
  ['Saltmarrow Hotels', 'logo', ['website'], -353, 12],
  ['Wrenfield Schools', 'logo', ['website'], -100, 400],
  ['Velloran Insurance', 'quote', ['website'], -60, 300, { approvedText: Q.velloran }],
  ['Pellucid Harbor Software', 'logo', ['sales_deck'], -90, 180],
  ['Cindergate Robotics', 'logo', ['sales_deck', 'website'], -120, 240],
  ['Cindergate Robotics', 'quote', ['sales_deck'], -120, 240, { approvedText: Q.cinder }],
  ['Thistlebrook Retail', 'logo', ['partner', 'website'], -385, -20],
  ['Lantern Quay Media', 'logo', ['partner'], -50, 150],
  ['Graybirch Biotech', 'logo', ['press', 'website'], -80, 280],
  ['Graybirch Biotech', 'quote', ['press'], -80, 280, { approvedText: Q.graybirchQuote }],
  ['Graybirch Biotech', 'outcome_claim', ['press'], -80, 280, { approvedText: Q.graybirchClaim }],
  ['Graybirch Biotech', 'reference_call', ['sales_call'], -80, 280, { maxPerQuarter: 3 }],
];

const p = (t) => `<p>${t}</p>`;
const quote = (t, who) => `<blockquote><p>“${t}” - ${who}</p></blockquote>`;
const banner = p(`<em>${DEMO_BANNER_TEXT}. Corvane Analytics and every customer named here are invented.</em>`);

export const DEMO_PAGES = [
  {
    title: 'Homepage: customer logo wall (draft)',
    labels: ['channel-website'],
    body: banner + '<h2>Trusted by teams that move fast</h2>'
      + p('Brindlewood Freight, Quillmere Health, Orrinvale Credit Union, Saltmarrow Hotels and Wrenfield Schools run their reporting on Corvane.')
      + quote(Q.brindle, 'Head of Operations, Brindlewood Freight'),
  },
  {
    title: 'Q1 paid social ad copy',
    labels: ['channel-paid-ads'],
    body: banner + '<h2>Variant A</h2>' + p('Join Orrinvale Credit Union and Brindlewood Freight. See every open case in one view.')
      + '<h2>Variant B</h2>' + quote('Velloran Insurance cut claims handling time by 40% with Corvane.', 'Velloran Insurance'),
  },
  {
    title: 'Case study: Brindlewood Freight',
    labels: ['channel-case-study', 'asset-case-study'],
    body: banner + '<h2>How Brindlewood Freight plans around late loads</h2>'
      + p('Brindlewood Freight moves regional freight for grocers and builders. Dispatchers used to rebuild the late-load list by hand each morning.')
      + quote(Q.brindle, 'Head of Operations, Brindlewood Freight'),
  },
  {
    title: 'Case study: Quillmere Health',
    labels: ['channel-case-study', 'asset-case-study'],
    body: banner + '<h2>Quillmere Health: one view of every clinic</h2>'
      + p('Quillmere Health runs outpatient clinics across three regions and used Corvane to combine their weekly reporting.'),
  },
  {
    title: 'Enterprise sales deck outline',
    labels: ['channel-sales-deck'],
    body: banner + '<h2>Slide 4: Customers like you</h2>'
      + p('Orrinvale Credit Union, Pellucid Harbor Software and Cindergate Robotics.')
      + '<h2>Slide 5: Proof</h2>'
      + quote('Corvane helped us find every bottleneck in our test lab within a day.', 'VP Engineering, Cindergate Robotics')
      + quote(Q.orrin, 'Member Services Director, Orrinvale Credit Union'),
  },
  {
    title: 'Partner program page',
    labels: ['channel-partner'],
    body: banner + '<h2>Partners who build on Corvane</h2>'
      + p('Retail analytics partners help customers like Thistlebrook Retail and Lantern Quay Media get value in weeks.'),
  },
  {
    title: 'Press release: Corvane spring launch',
    labels: ['channel-press'],
    body: banner + '<h2>Corvane launches lab reporting</h2>'
      + p('Early users include Graybirch Biotech and Kestrelmoor Energy.')
      + quote(Q.graybirchClaim, 'Lab Director, Graybirch Biotech'),
  },
  {
    title: 'Analyst briefing notes (internal)',
    labels: [],
    body: banner + p('Internal notes. Customers we may discuss under NDA: Brindlewood Freight, Kestrelmoor Energy, Orrinvale Credit Union.'),
  },
];

export const DEMO_REQUESTS = [
  { summary: 'Reference call for a logistics prospect', customer: 'Brindlewood Freight', assetType: 'reference_call', channel: 'sales_call', purpose: 'Late-stage logistics deal' },
  { summary: 'Quote Velloran Insurance in a LinkedIn ad', customer: 'Velloran Insurance', assetType: 'quote', channel: 'paid_ads', quoteText: Q.velloran, purpose: 'Q1 paid social' },
  { summary: 'Reference call for a biotech prospect', customer: 'Graybirch Biotech', assetType: 'reference_call', channel: 'sales_call', purpose: 'Healthcare pipeline' },
  { summary: 'Orrinvale logo on webinar slide', customer: 'Orrinvale Credit Union', assetType: 'logo', channel: 'events', purpose: 'Spring webinar' },
  { summary: 'Cindergate quote in the enterprise deck', customer: 'Cindergate Robotics', assetType: 'quote', channel: 'sales_deck', quoteText: Q.cinder, purpose: 'Enterprise deck refresh' },
  { summary: 'Saltmarrow logo on the homepage', customer: 'Saltmarrow Hotels', assetType: 'logo', channel: 'website', purpose: 'Homepage refresh' },
];
const REQUEST_SUMMARIES = new Set(DEMO_REQUESTS.map((r) => r.summary));

// ---------- pure helpers ----------

export const dayFrom = (today, offset) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const isDemoName = (name) => DEMO_NAMES.has(name);

// Is this organization's ledger record demo data that the loader may overwrite?
export function isDemoRecord(name, record) {
  if (!isDemoName(name)) return false;
  if (!record) return true; // fictional name, nothing recorded yet: safe to claim
  if (record.demo === true) return true;
  // Seeded before the flag existed: only seed permission ids, and (for a customer with no permissions)
  // the exact segment and owner the seed wrote.
  const perms = record.permissions || [];
  if (!perms.every((x) => String(x.id || '').startsWith('seed-'))) return false;
  if (perms.length > 0) return true;
  const def = DEMO_CUSTOMERS.find((c) => c.name === name);
  return record.segment === def.segment && record.owner === def.owner;
}

// Confluence stores storage format with named entities (&ldquo; for a curly quote), so compare decoded text.
const ENTITIES = { ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', quot: '"', apos: "'", amp: '&', nbsp: ' ', ndash: '\u2013', mdash: '\u2014', hellip: '…' };
const decode = (html) => String(html || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
  .replace(/\s+/g, ' ')
  .trim();
export const sameStorage = (a, b) => decode(a) === decode(b);

export const isDemoPage = (page) => !!page && ((page.labels || []).includes(DEMO_LABEL) || String(page.body || '').includes(DEMO_BANNER_TEXT));

// A fix task belongs to the demo if it carries the demo label or was raised for a demo customer
// (sweep labels are pl-<pageId>-<orgId>).
export function isDemoFixTask(labels, demoOrgIds) {
  if ((labels || []).includes(DEMO_LABEL)) return true;
  const ids = new Set([...demoOrgIds].map(String));
  return (labels || []).some((l) => {
    const m = /^pl-\d+-(\d+)$/.exec(l);
    return m && ids.has(m[1]);
  });
}

// The seeded ledger records, keyed by customer name. `consentFor(n, customer, perm)` may return a
// consent source (for example a JSM request key); `previous` keeps sources from an earlier load.
export function buildDemoRecords(today, { consentFor = null, previous = {} } = {}) {
  const records = {};
  for (const c of DEMO_CUSTOMERS) {
    records[c.name] = { demo: true, aliases: c.aliases || [], status: 'active', churnedAt: null, segment: c.segment, owner: c.owner, renewalAtRisk: !!c.renewalAtRisk, doNotContact: !!c.doNotContact, permissions: [], uses: [] };
  }
  DEMO_PERMISSIONS.forEach(([cust, assetType, channels, s, e, extra = {}], i) => {
    const id = `seed-${i + 1}`;
    const { revokedOffset, ...rest } = extra;
    const prev = (previous[cust]?.permissions || []).find((x) => x.id === id);
    const consentSource = (consentFor && consentFor(i + 1, cust, { assetType, channels })) || prev?.consentSource || `Demo consent ${i + 1} (fictional)`;
    records[cust].permissions.push({
      id, assetType, channels, startsOn: dayFrom(today, s), expiresOn: dayFrom(today, e), consentSource, approvedText: '',
      ...rest, ...(revokedOffset !== undefined ? { revokedOn: dayFrom(today, revokedOffset) } : {}),
    });
  });
  records['Brindlewood Freight'].uses = [
    { assetType: 'reference_call', channel: 'sales_call', date: dayFrom(today, -40), requestKey: 'history' },
    { assetType: 'reference_call', channel: 'sales_call', date: dayFrom(today, -9), requestKey: 'history' },
  ];
  records['Graybirch Biotech'].uses = [{ assetType: 'reference_call', channel: 'sales_call', date: dayFrom(today, -30), requestKey: 'history' }];
  return records;
}

// ---------- load / reset against a site adapter ----------
//
// io: {
//   listOrgs() -> [{ id, name }]          getRecord(orgId) -> record | null      putRecord(orgId, record)
//   createOrg(name) -> { id }
//   findSpace(key) -> { id, key } | null   findPage(spaceId, title) -> { id, body, labels, version } | null
//   createPage(spaceId, title, body) -> id  updatePage(id, title, body, version)   addLabels(pageId, labels)
//   searchIssues(jql) -> [{ key, summary, labels }]   createIssue(projectKey, summary, labels) -> key
//   addIssueLabels(key, labels)   getIssueProperty(key, prop) -> value | null   setIssueProperty(key, prop, value)
//   closeIssue(key) -> boolean
//   consentFor?(n, customer, perm) -> string | null    (optional; the seed script uses it for JSM consent tickets)
// }

export async function applyDemo(io, { today, taskProject, spaceKey, reset = false, log = () => {} }) {
  if (!taskProject) throw new Error('Choose a Jira project for proof requests and fix tasks.');
  if (!spaceKey) throw new Error('Choose a Confluence space for the demo pages.');
  const space = await io.findSpace(spaceKey);
  if (!space) throw new Error(`Confluence space ${spaceKey} was not found. Choose another space.`);

  const report = { customers: { created: 0, updated: 0, kept: 0 }, pages: { created: 0, updated: 0, kept: 0 }, requests: { created: 0, updated: 0, kept: 0 }, fixTasksClosed: 0, skipped: [] };

  // 1. Customers (JSM organizations with a ledger record).
  const orgs = await io.listOrgs();
  const orgByName = new Map();
  for (const o of orgs) if (isDemoName(o.name) && !orgByName.has(o.name)) orgByName.set(o.name, o);
  const existing = {};
  const ids = {};
  for (const c of DEMO_CUSTOMERS) {
    let org = orgByName.get(c.name);
    if (org) {
      const rec = await io.getRecord(org.id);
      if (!isDemoRecord(c.name, rec)) {
        report.skipped.push(`Organization "${c.name}" already has non-demo Proof Ledger data; left unchanged.`);
        continue;
      }
      existing[c.name] = rec;
    } else {
      org = await io.createOrg(c.name);
      report.customers.created++;
    }
    ids[c.name] = String(org.id);
  }
  const records = buildDemoRecords(today, { consentFor: io.consentFor || null, previous: existing });
  for (const c of DEMO_CUSTOMERS) {
    const id = ids[c.name];
    if (!id) continue;
    const prev = existing[c.name];
    if (prev && prev.demo === true && !reset) {
      report.customers.kept++;
      continue;
    }
    await io.putRecord(id, records[c.name]);
    if (prev) report.customers.updated++;
  }
  log(`customers: ${JSON.stringify(report.customers)}`);

  // 2. Confluence pages in the chosen space.
  for (const pg of DEMO_PAGES) {
    const found = await io.findPage(space.id, pg.title);
    const labels = [...pg.labels, DEMO_LABEL];
    if (found && !isDemoPage(found)) {
      report.skipped.push(`Page "${pg.title}" in ${spaceKey} is not demo content; left unchanged.`);
      continue;
    }
    let id;
    if (!found) {
      id = await io.createPage(space.id, pg.title, pg.body);
      report.pages.created++;
    } else {
      id = found.id;
      if (reset && !sameStorage(found.body, pg.body)) {
        await io.updatePage(id, pg.title, pg.body, found.version);
        report.pages.updated++;
      } else report.pages.kept++;
    }
    const missing = labels.filter((l) => !(found?.labels || []).includes(l));
    if (missing.length) await io.addLabels(id, missing);
  }
  log(`pages: ${JSON.stringify(report.pages)}`);

  // 3. Proof requests (Jira issues with a proof-request issue property).
  const demoIds = new Set(Object.values(ids));
  const have = await io.searchIssues(`project = "${taskProject}" AND labels = "${DEMO_REQUEST_LABEL}" ORDER BY created ASC`);
  const byTitle = new Map();
  for (const i of have) {
    if (!REQUEST_SUMMARIES.has(i.summary) || byTitle.has(i.summary)) continue;
    let isDemo = (i.labels || []).includes(DEMO_LABEL);
    if (!isDemo) {
      const prop = await io.getIssueProperty(i.key, 'proof-request');
      isDemo = !!prop && demoIds.has(String(prop.customerId)); // seeded before the demo label existed
    }
    if (isDemo) byTitle.set(i.summary, i);
  }
  for (const r of DEMO_REQUESTS) {
    const customerId = ids[r.customer];
    if (!customerId) continue;
    const value = { customerId, assetType: r.assetType, channel: r.channel, quoteText: r.quoteText || '', purpose: r.purpose, savedOn: today, demo: true };
    const issue = byTitle.get(r.summary);
    if (!issue) {
      const key = await io.createIssue(taskProject, r.summary, [DEMO_REQUEST_LABEL, DEMO_LABEL]);
      await io.setIssueProperty(key, 'proof-request', value);
      report.requests.created++;
      continue;
    }
    if (!(issue.labels || []).includes(DEMO_LABEL)) await io.addIssueLabels(issue.key, [DEMO_LABEL]);
    if (reset) {
      await io.setIssueProperty(issue.key, 'proof-request', value);
      report.requests.updated++;
    } else report.requests.kept++;
  }
  log(`requests: ${JSON.stringify(report.requests)}`);

  // 4. Reset only: close open fix tasks that the sweep raised for demo customers.
  if (reset) {
    const open = await io.searchIssues(`project = "${taskProject}" AND labels = "proof-fix" AND statusCategory != Done`);
    for (const i of open) {
      if (!isDemoFixTask(i.labels, demoIds)) continue;
      if (await io.closeIssue(i.key)) report.fixTasksClosed++;
    }
    log(`fix tasks closed: ${report.fixTasksClosed}`);
  }
  return report;
}

export function summarizeDemoReport(r, reset) {
  const parts = [
    `${r.customers.created} customer(s) created, ${r.customers.updated} restored, ${r.customers.kept} already present`,
    `${r.pages.created} page(s) created, ${r.pages.updated} restored, ${r.pages.kept} already present`,
    `${r.requests.created} proof request(s) created, ${r.requests.updated} restored, ${r.requests.kept} already present`,
  ];
  if (reset) parts.push(`${r.fixTasksClosed} demo fix task(s) closed`);
  return parts.join('; ') + '.';
}
