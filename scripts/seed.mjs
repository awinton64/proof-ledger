// Seeds the fictional Proof Ledger demo into an Atlassian site.
// Every company here is invented. "Corvane Analytics" is the fictional vendor.
// Usage: SITE=https://your-site.atlassian.net ATL_EMAIL=... ATL_TOKEN=... node scripts/seed.mjs
// Optional: JSM_PROJECT=CUST TASK_PROJECT=PROOF SPACE_KEY=MKT. Safe to re-run: it updates in place.
// Dates are relative to the day you run it, so the demo states (expiring, expired, over-asked) stay true.

const SITE = process.env.SITE;
const AUTH = 'Basic ' + Buffer.from(`${process.env.ATL_EMAIL}:${process.env.ATL_TOKEN}`).toString('base64');
const JSM_PROJECT = process.env.JSM_PROJECT || 'CUST';
const TASK_PROJECT = process.env.TASK_PROJECT || 'PROOF';
const SPACE_KEY = process.env.SPACE_KEY || 'MKT';
if (!SITE || !process.env.ATL_EMAIL || !process.env.ATL_TOKEN) throw new Error('Set SITE, ATL_EMAIL and ATL_TOKEN');

const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

async function req(method, path, body) {
  const res = await fetch(SITE + path, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', 'Content-Type': 'application/json', 'X-ExperimentalApi': 'opt-in' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ---------- fictional customers and consent ----------

const CUSTOMERS = [
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

const Q = {
  brindle: 'With Corvane, our dispatch team stopped guessing which loads would run late.',
  orrin: 'Corvane gave our member services team one view of every open case.',
  velloran: 'Corvane gives our claims team one place to see what changed and why.',
  cinder: 'Corvane helped us find the bottleneck in our test lab within a week.',
  graybirchQuote: 'Our lab managers trust the numbers because they can trace every one of them.',
  graybirchClaim: 'Corvane cut our assay reporting cycle by 30% in two quarters.',
};

// [customer, assetType, channels, startsOffset, expiresOffset, extra]
const PERMISSIONS = [
  ['Brindlewood Freight', 'logo', ['website', 'sales_deck'], -300, 200],
  ['Brindlewood Freight', 'quote', ['website', 'case_study', 'sales_deck'], -300, 200, { approvedText: Q.brindle }],
  ['Brindlewood Freight', 'case_study', ['case_study', 'website'], -300, 200],
  ['Brindlewood Freight', 'reference_call', ['sales_call'], -300, 300, { maxPerQuarter: 2 }],
  ['Quillmere Health', 'logo', ['website'], -200, 300],
  ['Quillmere Health', 'case_study', ['case_study'], -200, 300, { revoked: true, revokedOn: day(-14), notes: 'New CMO asked us to take the case study down.' }],
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

// ---------- fictional Confluence pages ----------

const p = (t) => `<p>${t}</p>`;
const quote = (t, who) => `<blockquote><p>“${t}” - ${who}</p></blockquote>`;
const banner = p('<em>Fictional demo content for Proof Ledger. Corvane Analytics and every customer named here are invented.</em>');

const PAGES = [
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

// ---------- fictional proof requests (Jira issues) ----------

const REQUESTS = [
  { summary: 'Reference call for a logistics prospect', customer: 'Brindlewood Freight', assetType: 'reference_call', channel: 'sales_call', purpose: 'Late-stage logistics deal' },
  { summary: 'Quote Velloran Insurance in a LinkedIn ad', customer: 'Velloran Insurance', assetType: 'quote', channel: 'paid_ads', quoteText: Q.velloran, purpose: 'Q1 paid social' },
  { summary: 'Reference call for a biotech prospect', customer: 'Graybirch Biotech', assetType: 'reference_call', channel: 'sales_call', purpose: 'Healthcare pipeline' },
  { summary: 'Orrinvale logo on webinar slide', customer: 'Orrinvale Credit Union', assetType: 'logo', channel: 'events', purpose: 'Spring webinar' },
  { summary: 'Cindergate quote in the enterprise deck', customer: 'Cindergate Robotics', assetType: 'quote', channel: 'sales_deck', quoteText: Q.cinder, purpose: 'Enterprise deck refresh' },
  { summary: 'Saltmarrow logo on the homepage', customer: 'Saltmarrow Hotels', assetType: 'logo', channel: 'website', purpose: 'Homepage refresh' },
];

// ---------- run ----------

async function main() {
  const desks = await req('GET', '/rest/servicedeskapi/servicedesk');
  const desk = desks.values.find((d) => d.projectKey === JSM_PROJECT);
  if (!desk) throw new Error(`No service desk ${JSM_PROJECT}`);
  const types = await req('GET', `/rest/servicedeskapi/servicedesk/${desk.id}/requesttype`);
  const reqType = types.values.find((t) => /general|question|ask/i.test(t.name)) || types.values[0];

  const orgs = (await req('GET', '/rest/servicedeskapi/organization?limit=100')).values;
  const byName = {};
  for (const c of CUSTOMERS) {
    let org = orgs.find((o) => o.name === c.name);
    if (!org) org = await req('POST', '/rest/servicedeskapi/organization', { name: c.name });
    byName[c.name] = String(org.id);
  }
  await req('POST', `/rest/servicedeskapi/servicedesk/${desk.id}/organization`, { organizationId: Number(byName[CUSTOMERS[0].name]) }).catch(() => {});
  for (const id of Object.values(byName)) await req('POST', `/rest/servicedeskapi/servicedesk/${desk.id}/organization`, { organizationId: Number(id) }).catch(() => {});

  // One consent request per permission, so each record points at a real (synthetic) JSM ticket.
  const existing = await req('GET', `/rest/api/3/search/jql?jql=${encodeURIComponent(`project = ${JSM_PROJECT} AND labels = proof-consent`)}&fields=summary&maxResults=100`);
  const consentKey = {};
  for (const i of existing.issues || []) consentKey[i.fields.summary] = i.key;
  const records = {};
  for (const c of CUSTOMERS) records[c.name] = { aliases: c.aliases || [], status: 'active', segment: c.segment, owner: c.owner, renewalAtRisk: !!c.renewalAtRisk, doNotContact: !!c.doNotContact, permissions: [], uses: [] };
  let n = 0;
  for (const [cust, assetType, channels, s, e, extra] of PERMISSIONS) {
    n++;
    const summary = `Consent: ${cust} ${assetType.replace('_', ' ')} (${channels.join(', ')})`;
    if (!consentKey[summary]) {
      const created = await req('POST', '/rest/servicedeskapi/request', {
        serviceDeskId: desk.id,
        requestTypeId: reqType.id,
        requestFieldValues: { summary, description: `Synthetic demo record. Fictional customer ${cust} agreed to ${assetType.replace('_', ' ')} use in: ${channels.join(', ')}.` },
      });
      consentKey[summary] = created.issueKey;
      await req('PUT', `/rest/api/3/issue/${created.issueKey}`, { update: { labels: [{ add: 'proof-consent' }] } });
    }
    records[cust].permissions.push({ id: `seed-${n}`, assetType, channels, startsOn: day(s), expiresOn: day(e), consentSource: consentKey[summary], approvedText: '', ...(extra || {}) });
  }
  // Reference-call history: Brindlewood is at its limit; Graybirch has room.
  records['Brindlewood Freight'].uses = [
    { assetType: 'reference_call', channel: 'sales_call', date: day(-40), requestKey: 'history' },
    { assetType: 'reference_call', channel: 'sales_call', date: day(-9), requestKey: 'history' },
  ];
  records['Graybirch Biotech'].uses = [{ assetType: 'reference_call', channel: 'sales_call', date: day(-30), requestKey: 'history' }];
  for (const c of CUSTOMERS) await req('PUT', `/rest/servicedeskapi/organization/${byName[c.name]}/property/proof-ledger`, records[c.name]);
  console.log(`customers: ${CUSTOMERS.length}, permissions: ${PERMISSIONS.length}`);

  // Confluence pages.
  const space = (await req('GET', `/wiki/api/v2/spaces?keys=${SPACE_KEY}`)).results[0];
  for (const pg of PAGES) {
    const found = (await req('GET', `/wiki/api/v2/spaces/${space.id}/pages?title=${encodeURIComponent(pg.title)}&body-format=storage`)).results[0];
    let id;
    if (found) {
      const cur = await req('GET', `/wiki/api/v2/pages/${found.id}`);
      if ((found.body?.storage?.value || '') !== pg.body) {
        await req('PUT', `/wiki/api/v2/pages/${found.id}`, { id: found.id, status: 'current', title: pg.title, body: { representation: 'storage', value: pg.body }, version: { number: cur.version.number + 1, message: 'Proof Ledger demo seed' } });
      }
      id = found.id;
    } else {
      id = (await req('POST', '/wiki/api/v2/pages', { spaceId: space.id, status: 'current', title: pg.title, body: { representation: 'storage', value: pg.body } })).id;
    }
    if (pg.labels.length) await req('POST', `/wiki/rest/api/content/${id}/label`, pg.labels.map((name) => ({ prefix: 'global', name })));
    console.log(`page ${id}: ${pg.title}`);
  }

  // Proof requests.
  const have = await req('GET', `/rest/api/3/search/jql?jql=${encodeURIComponent(`project = ${TASK_PROJECT} AND labels = proof-request`)}&fields=summary&maxResults=100`);
  const haveBy = Object.fromEntries((have.issues || []).map((i) => [i.fields.summary, i.key]));
  const meta = await req('GET', `/rest/api/3/issue/createmeta/${TASK_PROJECT}/issuetypes`);
  const type = (meta.issueTypes || meta.values).find((t) => t.name === 'Task') || (meta.issueTypes || meta.values)[0];
  for (const r of REQUESTS) {
    let key = haveBy[r.summary];
    if (!key) {
      key = (await req('POST', '/rest/api/3/issue', { fields: { project: { key: TASK_PROJECT }, issuetype: { id: type.id }, summary: r.summary, labels: ['proof-request'] } })).key;
    }
    await req('PUT', `/rest/api/3/issue/${key}/properties/proof-request`, { customerId: byName[r.customer], assetType: r.assetType, channel: r.channel, quoteText: r.quoteText || '', purpose: r.purpose, savedOn: day(0) });
    console.log(`request ${key}: ${r.summary}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
