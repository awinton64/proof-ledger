// Proof Ledger permission engine. Pure functions, no Forge imports, no LLM.
// Every verdict is deterministic and explainable: same inputs, same answer, same reasons.

export const ASSET_TYPES = {
  logo: 'Logo or name',
  quote: 'Named quote',
  case_study: 'Case study',
  reference_call: 'Reference call',
  outcome_claim: 'Outcome claim (a number about the customer)',
};

export const CHANNELS = {
  website: 'Website',
  paid_ads: 'Paid ads',
  social: 'Organic social',
  sales_deck: 'Sales deck',
  case_study: 'Case study library',
  press: 'Press and analyst',
  events: 'Events and webinars',
  partner: 'Partner materials',
  sales_call: 'Sales call (reference)',
};

export const VERDICT = { ALLOWED: 'ALLOWED', NEEDS_CONSENT: 'NEEDS_CONSENT', BLOCKED: 'BLOCKED' };

const DAY = 24 * 60 * 60 * 1000;

export function toDay(value) {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isoDay(d) {
  return d ? toDay(d).toISOString().slice(0, 10) : null;
}

function daysBetween(a, b) {
  return Math.round((toDay(b) - toDay(a)) / DAY);
}

export function permissionState(permission, today) {
  const now = toDay(today);
  if (permission.revoked) return 'revoked';
  const start = toDay(permission.startsOn);
  const end = toDay(permission.expiresOn);
  if (start && now < start) return 'not_started';
  if (end && now > end) return 'expired';
  return 'active';
}

// Count reference calls in the rolling window ending today.
export function recentUses(uses, customerId, assetType, today, windowDays = 90) {
  const now = toDay(today);
  return (uses || []).filter((u) => {
    if (u.customerId !== customerId || u.assetType !== assetType) return false;
    const d = toDay(u.date);
    return d && d <= now && daysBetween(d, now) < windowDays;
  });
}

/**
 * Decide whether `customer` may be used as `assetType` in `channel` on `today`.
 * Returns { verdict, reasons[], permission, expiresInDays, warnings[] }.
 */
export function evaluate({ customer, permissions, assetType, channel, today, uses = [], quoteText = null }) {
  const reasons = [];
  const warnings = [];
  if (!customer) {
    return { verdict: VERDICT.NEEDS_CONSENT, reasons: ['Customer is not in the ledger. Add it (or sync from Jira Service Management) and record consent first.'], warnings, permission: null };
  }
  if (!ASSET_TYPES[assetType]) {
    return { verdict: VERDICT.BLOCKED, reasons: [`Unknown asset type "${assetType}".`], warnings, permission: null };
  }
  if (customer.status === 'churned') {
    reasons.push(`${customer.name} is marked churned${customer.churnedAt ? ` since ${isoDay(customer.churnedAt)}` : ''}. Former customers may not be presented as customers.`);
    return { verdict: VERDICT.BLOCKED, reasons, warnings, permission: null };
  }
  if (customer.doNotContact && assetType === 'reference_call') {
    reasons.push(`${customer.name} asked not to be contacted for references.`);
    return { verdict: VERDICT.BLOCKED, reasons, warnings, permission: null };
  }

  const mine = (permissions || []).filter((p) => p.customerId === customer.id && p.assetType === assetType);
  if (mine.length === 0) {
    reasons.push(`No ${ASSET_TYPES[assetType].toLowerCase()} permission on record for ${customer.name}.`);
    return { verdict: VERDICT.NEEDS_CONSENT, reasons, warnings, permission: null };
  }

  const revoked = mine.find((p) => permissionState(p, today) === 'revoked');
  const active = mine.filter((p) => permissionState(p, today) === 'active');
  if (active.length === 0) {
    if (revoked) {
      reasons.push(`${customer.name} revoked ${ASSET_TYPES[assetType].toLowerCase()} permission${revoked.revokedOn ? ` on ${isoDay(revoked.revokedOn)}` : ''}.`);
      return { verdict: VERDICT.BLOCKED, reasons, warnings, permission: revoked };
    }
    const latest = mine.slice().sort((a, b) => String(b.expiresOn).localeCompare(String(a.expiresOn)))[0];
    const st = permissionState(latest, today);
    reasons.push(st === 'not_started'
      ? `Permission starts on ${isoDay(latest.startsOn)}; not usable yet.`
      : `Permission expired on ${isoDay(latest.expiresOn)}. Renew consent before using it.`);
    return { verdict: VERDICT.NEEDS_CONSENT, reasons, warnings, permission: latest };
  }

  const inChannel = active.filter((p) => !channel || (p.channels || []).includes(channel));
  if (inChannel.length === 0) {
    const allowed = [...new Set(active.flatMap((p) => p.channels || []))].map((c) => CHANNELS[c] || c);
    reasons.push(`${customer.name} approved this ${ASSET_TYPES[assetType].toLowerCase()} for ${allowed.join(', ') || 'no channels'}, not ${CHANNELS[channel] || channel}.`);
    return { verdict: VERDICT.NEEDS_CONSENT, reasons, warnings, permission: active[0] };
  }

  let permission = inChannel[0];
  if (quoteText && (assetType === 'quote' || assetType === 'outcome_claim')) {
    const match = inChannel.find((p) => p.approvedText && quoteMatches(quoteText, p.approvedText));
    if (!match) {
      reasons.push(`The wording differs from the text ${customer.name} approved.`);
      return { verdict: VERDICT.NEEDS_CONSENT, reasons, warnings, permission };
    }
    permission = match;
  }

  if (assetType === 'reference_call') {
    const limit = Number(permission.maxPerQuarter || 0);
    if (limit > 0) {
      const used = recentUses(uses, customer.id, assetType, today);
      if (used.length >= limit) {
        const oldest = used.map((u) => toDay(u.date)).sort((a, b) => a - b)[0];
        const freeOn = new Date(oldest.getTime() + 90 * DAY);
        reasons.push(`${customer.name} already took ${used.length} reference call${used.length === 1 ? '' : 's'} in the last 90 days (limit ${limit}). Next slot opens ${isoDay(freeOn)}.`);
        return { verdict: VERDICT.BLOCKED, reasons, warnings, permission };
      }
      if (used.length === limit - 1) warnings.push(`This uses the last reference call slot for this quarter (${limit} allowed).`);
    }
  }

  const expiresInDays = permission.expiresOn ? daysBetween(today, permission.expiresOn) : null;
  if (expiresInDays !== null && expiresInDays <= 30) warnings.push(`Permission expires in ${expiresInDays} day${expiresInDays === 1 ? '' : 's'} (${isoDay(permission.expiresOn)}).`);
  if (customer.renewalAtRisk) warnings.push(`${customer.name} is flagged as a renewal risk. Confirm with the account owner.`);
  reasons.push(`Approved by ${customer.name} for ${CHANNELS[channel] || channel || 'this use'}${permission.consentSource ? ` (consent: ${permission.consentSource})` : ''}${permission.expiresOn ? `, valid until ${isoDay(permission.expiresOn)}` : ''}.`);
  return { verdict: VERDICT.ALLOWED, reasons, warnings, permission, expiresInDays };
}

// ---------- text matching (exact and normalized only) ----------

export function normalize(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9%$'.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function quoteMatches(candidate, approved) {
  const a = normalize(candidate).replace(/[.']/g, '');
  const b = normalize(approved).replace(/[.']/g, '');
  return a.length > 0 && (a === b || b.includes(a));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|tr|div|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

// Find every mention of a ledger customer (name or alias, whole words, case-insensitive).
export function findMentions(text, customers) {
  const out = [];
  for (const c of customers || []) {
    const names = [c.name, ...(c.aliases || [])].filter(Boolean);
    for (const n of names) {
      const re = new RegExp(`(^|[^A-Za-z0-9])(${escapeRe(n)})(?![A-Za-z0-9])`, 'gi');
      let m;
      while ((m = re.exec(text)) !== null) {
        const index = m.index + m[1].length;
        if (!out.some((o) => o.customerId === c.id && Math.abs(o.index - index) < n.length)) out.push({ customerId: c.id, name: c.name, matched: m[2], index });
      }
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// Quoted passages ("..." or curly quotes) of at least 25 characters.
export function findQuotes(text) {
  const out = [];
  const re = /["“]([^"“”]{25,600})["”]/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ text: m[1].trim(), index: m.index });
  return out;
}

// Channel from page labels like "channel-paid-ads"; asset hint from "asset-case-study".
export function channelFromLabels(labels) {
  for (const l of labels || []) {
    const name = String(l).toLowerCase();
    if (name.startsWith('channel-')) {
      const key = name.slice(8).replace(/-/g, '_');
      if (CHANNELS[key]) return key;
    }
  }
  return null;
}

export function assetFromLabels(labels) {
  for (const l of labels || []) {
    const name = String(l).toLowerCase();
    if (name.startsWith('asset-')) {
      const key = name.slice(6).replace(/-/g, '_');
      if (ASSET_TYPES[key]) return key;
    }
  }
  return null;
}

function snippet(text, index, len = 110) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index);
  if (end < 0) end = text.length;
  const line = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (line.length <= len) return line;
  const at = Math.max(0, index - start - 30);
  return `${at > 0 ? '...' : ''}${line.slice(at, at + len).trim()}...`;
}

/**
 * Scan one page. A page with no channel-* label is internal and never flagged for naming,
 * but it is reported as unlabeled so marketing can label it before publishing.
 * Returns { channel, findings[], summary }.
 */
export function scanPage({ title, text, labels, customers, permissions, today, uses = [] }) {
  const channel = channelFromLabels(labels);
  const pageAsset = assetFromLabels(labels);
  const findings = [];
  const mentions = findMentions(text, customers);
  const quotes = findQuotes(text);
  const byCustomer = new Map();
  for (const m of mentions) if (!byCustomer.has(m.customerId)) byCustomer.set(m.customerId, m);

  if (!channel) {
    return {
      channel: null,
      findings: [],
      mentioned: [...byCustomer.values()].map((m) => m.name),
      summary: byCustomer.size ? `Unlabeled page names ${byCustomer.size} customer(s). Add a channel-* label to check it before it goes out.` : 'Unlabeled page; no customers named.',
      status: byCustomer.size ? 'UNLABELED' : 'CLEAR',
    };
  }

  for (const [customerId, m] of byCustomer) {
    const customer = customers.find((c) => c.id === customerId);
    const assetType = pageAsset && pageAsset !== 'quote' ? pageAsset : 'logo';
    const v = evaluate({ customer, permissions, assetType, channel, today, uses });
    if (v.verdict !== VERDICT.ALLOWED) {
      findings.push({ customerId, customer: customer.name, kind: assetType, verdict: v.verdict, reasons: v.reasons, excerpt: snippet(text, m.index), fix: fixFor(v, customer, assetType, channel) });
    } else if (v.warnings.length) {
      findings.push({ customerId, customer: customer.name, kind: assetType, verdict: 'WARNING', reasons: v.warnings, excerpt: snippet(text, m.index), fix: 'No change needed yet. Renew consent or plan a replacement before it lapses.' });
    }
  }

  // Quotes attributed to a customer: the nearest mention within 200 characters after or before the quote.
  for (const q of quotes) {
    const near = mentions
      .map((m) => ({ m, d: m.index >= q.index ? m.index - (q.index + q.text.length) : q.index - m.index }))
      .filter((x) => x.d >= -2 && x.d <= 200)
      .sort((a, b) => a.d - b.d)[0];
    if (!near) continue;
    const customer = customers.find((c) => c.id === near.m.customerId);
    const assetType = /\d+(\.\d+)?\s?%|\$\s?\d|\b\d+x\b/i.test(q.text) ? 'outcome_claim' : 'quote';
    let v = evaluate({ customer, permissions, assetType, channel, today, uses, quoteText: q.text });
    if (assetType === 'outcome_claim' && v.verdict !== VERDICT.ALLOWED) {
      const asQuote = evaluate({ customer, permissions, assetType: 'quote', channel, today, uses, quoteText: q.text });
      if (asQuote.verdict === VERDICT.ALLOWED) v = asQuote;
    }
    if (v.verdict !== VERDICT.ALLOWED) {
      findings.push({ customerId: customer.id, customer: customer.name, kind: assetType, verdict: v.verdict, reasons: v.reasons, excerpt: `"${q.text.slice(0, 120)}${q.text.length > 120 ? '...' : ''}"`, fix: fixFor(v, customer, assetType, channel) });
    }
  }

  const blocked = findings.filter((f) => f.verdict === VERDICT.BLOCKED).length;
  const needs = findings.filter((f) => f.verdict === VERDICT.NEEDS_CONSENT).length;
  const status = blocked ? 'BLOCKED' : needs ? 'NEEDS_CONSENT' : findings.length ? 'WARNING' : 'CLEAR';
  return {
    channel,
    findings,
    mentioned: [...byCustomer.values()].map((m) => m.name),
    summary: status === 'CLEAR'
      ? `${byCustomer.size} customer mention(s), all covered for ${CHANNELS[channel]}.`
      : `${blocked} blocked, ${needs} need consent, ${findings.length - blocked - needs} warning(s) for ${CHANNELS[channel]}.`,
    status,
  };
}

export function fixFor(v, customer, assetType, channel) {
  if (v.verdict === VERDICT.BLOCKED) {
    if (customer?.status === 'churned') return `Remove ${customer.name} from this page (former customer).`;
    if (assetType === 'reference_call') return 'Pick another reference customer.';
    return `Remove this ${ASSET_TYPES[assetType]?.toLowerCase() || 'use'}.`;
  }
  if (v.reasons.some((r) => r.includes('wording differs'))) return 'Use the approved wording exactly, or ask the customer to approve the new text.';
  return `Request ${ASSET_TYPES[assetType]?.toLowerCase() || ''} consent for ${CHANNELS[channel] || channel}, or remove it.`;
}

// ---------- dashboard ----------

export function dashboard({ customers, permissions, uses = [], scans = [], today }) {
  const now = toDay(today);
  const byId = new Map(customers.map((c) => [c.id, c]));
  const expiring = permissions
    .filter((p) => permissionState(p, now) === 'active' && p.expiresOn && daysBetween(now, p.expiresOn) <= 30)
    .map((p) => ({ ...p, customer: byId.get(p.customerId)?.name || p.customerId, days: daysBetween(now, p.expiresOn) }))
    .sort((a, b) => a.days - b.days);
  const expired = permissions
    .filter((p) => permissionState(p, now) === 'expired')
    .map((p) => ({ ...p, customer: byId.get(p.customerId)?.name || p.customerId }));
  const overAsked = customers
    .map((c) => {
      const limit = Math.max(0, ...permissions.filter((p) => p.customerId === c.id && p.assetType === 'reference_call').map((p) => Number(p.maxPerQuarter || 0)));
      const used = recentUses(uses, c.id, 'reference_call', now).length;
      return { customer: c.name, customerId: c.id, used, limit };
    })
    .filter((x) => x.used > 0 && (x.limit === 0 || x.used >= x.limit))
    .sort((a, b) => b.used - a.used);
  const flagged = scans.filter((s) => s.status === 'BLOCKED' || s.status === 'NEEDS_CONSENT');
  const unconsented = flagged.flatMap((s) => s.findings.filter((f) => f.verdict !== 'WARNING').map((f) => ({ ...f, pageId: s.pageId, pageTitle: s.title, pageUrl: s.url })));
  const churnFallout = unconsented.filter((f) => byId.get(f.customerId)?.status === 'churned');
  return {
    totals: {
      customers: customers.length,
      active: customers.filter((c) => c.status !== 'churned').length,
      permissions: permissions.length,
      expiring: expiring.length,
      pagesScanned: scans.length,
      pagesFlagged: flagged.length,
      unconsented: unconsented.length,
    },
    expiring,
    expired,
    overAsked,
    unconsented,
    churnFallout,
  };
}

// Which customers can be named for asset+channel today (for agents and the sales team).
export function referenceable({ customers, permissions, uses = [], assetType, channel, today, segment = null }) {
  return customers
    .filter((c) => !segment || String(c.segment || '').toLowerCase() === String(segment).toLowerCase())
    .map((c) => ({ customer: c, v: evaluate({ customer: c, permissions, assetType, channel, today, uses }) }))
    .filter((x) => x.v.verdict === VERDICT.ALLOWED)
    .map((x) => ({ customerId: x.customer.id, name: x.customer.name, segment: x.customer.segment || null, expiresOn: x.v.permission?.expiresOn || null, warnings: x.v.warnings }));
}
