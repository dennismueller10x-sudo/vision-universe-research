/** Private official issuer/fiscal mapping. No scoring, admissions or product IO.
 * Company facts remain separate from local share-class EPS/shares. A mapped
 * official filing is not a complete financial input or an adjustment certificate.
 */
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { validISIN, validLEI } from './europe-fundamentals.mjs';
const require = createRequire(import.meta.url);
const registry = require('../../quant/config/sec-metric-registry.json').metrics;
export const VERSION = 'europe-fundamentals-mapping-2.1.0';
export const PINNED_RESEARCH_PARSER_SHA256 = 'aae3bd54d0c11de295039ca9a806ead021b3c0c60fedea3bbb875a8c4918b422';
const OAM = 'https://www.info-financiere.gouv.fr/api/explore/v2.1/catalog/datasets/flux-amf-new-prod/records';
const COMPANY_METRICS = new Set(['revenue', 'netIncome', 'totalAssets', 'totalEquity', 'totalDebt', 'totalLiabilities', 'cash', 'operatingCashFlow']);
const METRIC_KEYS = { revenue: 'revenue', netIncome: 'net_income', totalAssets: 'total_assets', totalEquity: 'stockholders_equity', totalDebt: 'total_debt', totalLiabilities: 'total_liabilities', cash: 'cash_and_equivalents', operatingCashFlow: 'operating_cash_flow', epsBasic: 'eps_basic', epsDiluted: 'eps_diluted' };
const NONNEGATIVE = new Set(['revenue', 'totalAssets', 'totalDebt', 'totalLiabilities', 'cash']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = s => typeof s === 'string' && ISO.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = x => structuredClone(x);
function urlOf(s) { try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password ? u : null; } catch { return null; } }

/** Independently bind normalized context evidence back to the actual package.
 * Conservative supported shape: one reports/XHTML file and simple non-dimensional
 * LEI contexts. Unsupported XML shapes are withheld, never guessed or repaired.
 */
function packageContexts(rawBytes) {
  try {
    const b = Buffer.from(rawBytes);
    if (b.length > 32 * 1024 * 1024) return null;
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0 || b.readUInt16LE(eocd + 4) || b.readUInt16LE(eocd + 6)) return null;
    const entries = b.readUInt16LE(eocd + 10); let offset = b.readUInt32LE(eocd + 16), expanded = 0; const reports = [];
    for (let i = 0; i < entries; i++) {
      if (b.readUInt32LE(offset) !== 0x02014b50) return null;
      const flags = b.readUInt16LE(offset + 8), method = b.readUInt16LE(offset + 10), compressed = b.readUInt32LE(offset + 20), size = b.readUInt32LE(offset + 24);
      const nl = b.readUInt16LE(offset + 28), el = b.readUInt16LE(offset + 30), cl = b.readUInt16LE(offset + 32), local = b.readUInt32LE(offset + 42);
      const name = b.subarray(offset + 46, offset + 46 + nl).toString('utf8'); offset += 46 + nl + el + cl;
      expanded += size;
      if (expanded > 128 * 1024 * 1024 || flags & 1 || name.startsWith('/') || name.split('/').includes('..')) return null;
      if (!/(^|\/)reports\/[^/]+\.xhtml$/.test(name)) continue;
      if (b.readUInt32LE(local) !== 0x04034b50 || b.readUInt16LE(local + 8) !== method) return null;
      const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      const data = b.subarray(start, start + compressed);
      const xml = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: 128 * 1024 * 1024 }) : null;
      if (!xml || xml.length !== size) return null;
      reports.push(xml.toString('utf8'));
    }
    if (reports.length !== 1 || /<!DOCTYPE|<!ENTITY/.test(reports[0])) return null;
    const xml = reports[0], contexts = new Map(), namespaceBindings = new Map();
    for (const m of xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)=["']([^"']+)["']/g)) {
      const set = namespaceBindings.get(m[1]) || new Set(); set.add(m[2]); namespaceBindings.set(m[1], set);
    }
    const namespace = prefix => {
      const found = namespaceBindings.get(prefix); return found?.size === 1 ? [...found][0] : null;
    };
    const attrs = s => {
      const result = {};
      for (const a of s.matchAll(/\b([A-Za-z_][\w:.-]*)\s*=\s*(["'])([^"'<>]*)\2/g)) {
        if (Object.hasOwn(result, a[1])) return null;
        result[a[1]] = a[3];
      }
      return result;
    };
    for (const m of xml.matchAll(/<([A-Za-z_]\w*):context\b([^>]*)>([\s\S]*?)<\/\1:context>/g)) {
      const prefix = m[1], body = m[3], id = attrs(m[2])?.id;
      if (!id || contexts.has(id) || namespace(prefix) !== 'http://www.xbrl.org/2003/instance') return null;
      if (/<(?:\w+:)?(?:segment|scenario|explicitMember|typedMember)\b/.test(body)) continue;
      if ([...body.matchAll(new RegExp(`<${prefix}:identifier\\b`, 'g'))].length !== 1 ||
          [...body.matchAll(new RegExp(`<${prefix}:period\\b`, 'g'))].length !== 1) continue;
      const identifier = body.match(new RegExp(`<${prefix}:identifier\\b([^>]*)>([A-Z0-9]{20})</${prefix}:identifier>`));
      if (!/^https?:\/\/standards\.iso\.org\/iso\/17442$/.test(identifier && attrs(identifier[1])?.scheme || '')) continue;
      const tag = name => body.match(new RegExp(`<${prefix}:${name}>([0-9-]+)</${prefix}:${name}>`))?.[1] || null;
      const start = tag('startDate'), end = tag('endDate'), instant = tag('instant');
      const count = name => [...body.matchAll(new RegExp(`<${prefix}:${name}\\b`, 'g'))].length;
      if (instant ? count('instant') !== 1 || count('startDate') || count('endDate') : count('instant') || count('startDate') !== 1 || count('endDate') !== 1) continue;
      if (!identifier || (instant ? !day(instant) || start || end : !day(start) || !day(end) || start >= end)) continue;
      contexts.set(id, { lei: identifier[2], start, end: instant || end, kind: instant ? 'instant' : 'duration' });
    }
    const rawFacts = [];
    const units = new Map(), unitIds = new Set();
    for (const m of xml.matchAll(/<([A-Za-z_]\w*):unit\b([^>]*)>([\s\S]*?)<\/\1:unit>/g)) {
      if (namespace(m[1]) !== 'http://www.xbrl.org/2003/instance') continue;
      const id = attrs(m[2])?.id, measures = [...m[3].matchAll(/<(\w+):measure>(\w+):(\w+)<\/\1:measure>/g)];
      if (!id || unitIds.has(id)) return null;
      unitIds.add(id);
      if (namespace(measures[0]?.[2]) !== 'http://www.xbrl.org/2003/iso4217') continue;
      if (measures.length === 1) units.set(id, measures[0][3]);
      else if (measures.length === 2 && namespace(measures[1][2]) === 'http://www.xbrl.org/2003/instance' &&
          measures[1][3] === 'shares' && /:\s*divide\b|:divide\b/.test(m[3])) units.set(id, `${measures[0][3]}/shares`);
    }
    for (const m of xml.matchAll(/<([A-Za-z_]\w*):nonFraction\b([^>]*)>([\s\S]*?)<\/\1:nonFraction>/g)) {
      const a = attrs(m[2]); if (!a) continue;
      const name = a.name?.split(':'), format = a.format?.split(':');
      if (namespace(m[1]) !== 'http://www.xbrl.org/2013/inlineXBRL' || a.continuedAt || name?.length !== 2 ||
          !/^https?:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full$/.test(namespace(name[0]) || '') ||
          /<(?:\w+:)?exclude\b/.test(m[3]) || !units.has(a.unitRef)) continue;
      let text = m[3].replace(/<[^>]+>/g, '').replace(/&#(?:160|x[aA]0);|&nbsp;/g, ' ').trim();
      if (text.includes('&')) continue;
      if (format) {
        if (format.length !== 2 || !/^https?:\/\/www\.xbrl\.org\/inlineXBRL\/transformation\/\d{4}-\d{2}-\d{2}$/.test(namespace(format[0]) || '')) continue;
        text = text.replace(/[\s\u00a0\u202f]/g, '');
        if (format[1] === 'num-comma-decimal') text = text.replace(/\./g, '').replace(',', '.');
        else if (format[1] === 'num-dot-decimal') text = text.replace(/,/g, '');
        else continue;
      }
      if (text.length > 256 || !/^-?\d+(?:\.\d+)?$/.test(text) || a.sign && a.sign !== '-' || a.scale && !/^-?\d{1,2}$/.test(a.scale)) continue;
      // Shift the decimal string before converting to Number. Float multiplication
      // would turn a genuine 43,486.8 * 10^6 into 43,486,799,999.99999 and falsely
      // reject Arelle's exact Decimal observation. No financial value is repaired.
      const negative = text.startsWith('-'), parts = (negative ? text.slice(1) : text).split('.');
      const digits = parts.join(''), shift = Number(a.scale || 0) - (parts[1]?.length || 0);
      const padded = shift < 0 ? digits.padStart(1 - shift, '0') : digits;
      const scaled = shift >= 0 ? digits + '0'.repeat(shift) : padded.slice(0, shift) + '.' + padded.slice(shift);
      const value = Number((negative ? '-' : '') + scaled) * (a.sign === '-' ? -1 : 1);
      if (Number.isFinite(value)) rawFacts.push({ contextId: a.contextRef, concept: `{${namespace(name[0])}}${name[1]}`, value, unit: units.get(a.unitRef) });
    }
    return { contexts, rawFacts };
  } catch { return null; }
}

/** Resolver receives original bytes, not a caller-declared verified flag. */
export function verifyOfficialEnvelope(envelope, kind, asOf) {
  const source = envelope?.source, url = urlOf(source?.url);
  const bytes = envelope?.rawBytes;
  if (!day(asOf) || !(typeof bytes === 'string' || bytes instanceof Uint8Array) || !url ||
      !/^[a-f0-9]{64}$/.test(source?.sha256 || '') || sha(bytes) !== source.sha256 || source.httpStatus !== 200 ||
      typeof source.retrievedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(source.retrievedAt) ||
      !Number.isFinite(Date.parse(source.retrievedAt)) || new Date(source.retrievedAt).toISOString().slice(0, 10) > asOf) return null;
  if (kind === 'GLEIF' && (url.hostname !== 'api.gleif.org' || url.pathname !== '/api/v1/lei-records' || !validISIN(url.searchParams.get('filter[isin]')))) return null;
  if (kind === 'GLEIF_HISTORICAL_LEI' && (url.hostname !== 'api.gleif.org' || !/^\/api\/v1\/lei-records\/[A-Z0-9]{20}$/.test(url.pathname) || !validLEI(url.pathname.split('/').at(-1)) || url.search)) return null;
  if (kind === 'OFFICIAL_OAM' && `${url.origin}${url.pathname}` !== OAM) return null;
  if (kind === 'ESEF_PACKAGE' && (url.hostname !== 'fr.ftp.opendatasoft.com' || !url.pathname.startsWith('/datadila/INFOFI/') || !/\.(zip|xbri)$/.test(url.pathname) || url.search)) return null;
  if (!['GLEIF', 'GLEIF_HISTORICAL_LEI', 'OFFICIAL_OAM', 'ESEF_PACKAGE', 'NORMALIZED_RESEARCH'].includes(kind)) return null;
  let payload;
  try { payload = kind === 'ESEF_PACKAGE' ? null : JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return null; }
  return { payload, source: { ...copy(source), kind }, url };
}

export function resolveOfficialIssuer(candidate, envelopes = [], asOf) {
  const lei = candidate?.companyKey?.startsWith('LEI:') ? candidate.companyKey.slice(4) : candidate?.lei;
  if (!validISIN(candidate?.isin) || !validLEI(lei) || !candidate?.securityId || !candidate?.listingKey || candidate.isAdr === true) return null;
  const matches = [];
  for (const envelope of envelopes) {
    const proof = verifyOfficialEnvelope(envelope, 'GLEIF', asOf);
    if (!proof || proof.url.searchParams.get('filter[isin]') !== candidate.isin || !Array.isArray(proof.payload.data)) continue;
    const rows = proof.payload.data.filter(r => r?.id === lei && r.attributes?.lei === lei && r.attributes?.entity?.status === 'ACTIVE' && r.attributes.entity.category === 'GENERAL');
    const active = proof.payload.data.filter(r => r.attributes?.entity?.status === 'ACTIVE' && r.attributes.entity.category === 'GENERAL');
    if (rows.length !== 1 || active.length !== 1 || proof.payload.meta?.pagination?.total !== proof.payload.data.length) continue;
    const links = [proof.payload.links?.first, proof.payload.links?.last].map(urlOf);
    if (links.some(u => !u || u.hostname !== 'api.gleif.org' || u.searchParams.get('filter[isin]') !== candidate.isin)) continue;
    const entity = rows[0].attributes.entity;
    if (candidate.issuerCountry && entity.jurisdiction !== candidate.issuerCountry) continue;
    matches.push({ lei, isin: candidate.isin, issuerName: entity.legalName?.name || null,
      legalJurisdiction: entity.jurisdiction, reportingEntityLei: null, reportingRelationship: 'UNRESOLVED',
      registeredAs: entity.registeredAs || null, registerAuthorityId: entity.registeredAt?.id || null,
      goldenCopyDate: proof.payload.meta?.goldenCopy?.publishDate || null,
      identityAsOf: proof.source.retrievedAt,
      currentDayObserved: new Date(proof.source.retrievedAt).toISOString().slice(0, 10) === asOf,
      provenance: proof.source });
  }
  return matches.sort((a, b) => a.identityAsOf.localeCompare(b.identityAsOf)).at(-1) || null;
}

export function resolveHistoricalReportingEntities(issuer, envelopes = [], asOf) {
  if (!issuer?.currentDayObserved || !issuer.registeredAs || !issuer.registerAuthorityId) return [];
  const result = [];
  for (const envelope of envelopes) {
    const proof = verifyOfficialEnvelope(envelope, 'GLEIF_HISTORICAL_LEI', asOf), row = proof?.payload?.data;
    const a = row?.attributes, entity = a?.entity, successors = entity?.successorEntities;
    if (!proof || new Date(proof.source.retrievedAt).toISOString().slice(0, 10) !== asOf || Array.isArray(row) ||
        row?.id !== proof.url.pathname.split('/').at(-1) || a?.lei !== row.id || !validLEI(row.id) || row.id === issuer.lei ||
        a.registration?.status !== 'DUPLICATE' || entity?.status !== 'NULL' || entity.category !== 'GENERAL' ||
        entity.jurisdiction !== issuer.legalJurisdiction || entity.registeredAs !== issuer.registeredAs || entity.registeredAt?.id !== issuer.registerAuthorityId ||
        !Array.isArray(successors) || successors.length !== 1 || successors[0].lei !== issuer.lei) continue;
    result.push({ reportedLei: row.id, currentIssuerLei: issuer.lei, kind: 'GLEIF_DUPLICATE_LEI_SUCCESSOR',
      currentProof: issuer.provenance, historicalProof: proof.source, localShareClassAssociated: false });
  }
  return result;
}

export function resolveOamRecords(issuer, envelopes = [], asOf, historicalEntities = []) {
  if (!issuer || !day(asOf)) return [];
  const result = [];
  for (const envelope of envelopes) {
    const proof = verifyOfficialEnvelope(envelope, 'OFFICIAL_OAM', asOf);
    if (!proof || !Array.isArray(proof.payload.results)) continue;
    for (const row of proof.payload.results) {
      const url = urlOf(row.url_de_recuperation);
      const filed = row.uin_dat_amf;
      const declaredLei = row.identificationsociete_iso_cd_lei;
      const historical = historicalEntities.find(e => e.reportedLei === declaredLei && e.currentIssuerLei === issuer.lei);
      if (row.identificationsociete_iso_cd_isi !== issuer.isin || declaredLei !== issuer.lei && !historical ||
          !Number.isFinite(Date.parse(filed)) || filed.slice(0, 10) > asOf || !url ||
          url.hostname !== 'fr.ftp.opendatasoft.com' || !url.pathname.startsWith('/datadila/INFOFI/') ||
          !/\.(zip|xbri)$/.test(url.pathname) || url.search || !row.uin_idt_uin) continue;
      result.push({ documentId: `FR-OAM-${row.uin_idt_uin}`, issuerLei: issuer.lei, isin: issuer.isin,
        reportingEntityLei: declaredLei, relationship: historical ? historical.kind : 'OFFICIAL_DECLARED_ISSUER',
        historicalRelationship: historical ? copy(historical) : null,
        publishedAt: filed, title: row.informationdeposee_inf_tit_inf || null,
        documentUrl: url.href, provenance: proof.source });
    }
  }
  return [...new Map(result.map(r => [r.documentId, r])).values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function researchFacts(issuer, records, bundles, asOf) {
  const facts = [], quarantined = [], sources = [];
  for (const bundle of bundles) {
    const normalized = verifyOfficialEnvelope(bundle.normalized, 'NORMALIZED_RESEARCH', asOf);
    const packageProof = verifyOfficialEnvelope(bundle.package, 'ESEF_PACKAGE', asOf);
    const doc = normalized?.payload;
    const record = records.find(r => r.documentId === doc?.filing?.filingId && r.documentUrl === packageProof?.source?.url);
    if (!normalized || !packageProof || !record || doc?.schemaVersion !== 'official-filing-1.0.0' ||
        doc.sourceSystem !== 'ESEF' || ![issuer.lei, record.reportingEntityLei].includes(doc.lei) || doc.isin !== issuer.isin || doc.companyId !== `vu_lei_${doc.lei}` ||
        doc.documentSha256 !== packageProof.source.sha256 || doc.sourceDocument !== record.documentUrl ||
        doc.parserSourceSha256 !== PINNED_RESEARCH_PARSER_SHA256 || doc.privateHarness !== 'PINNED_PR324_PARSER_CURRENT_MAIN_SEC_REGISTRY_IO_SHIM_ONLY' ||
        doc.researchOnly !== true || doc.publicationAllowed !== false || !Array.isArray(doc.facts) ||
        !Number.isFinite(Date.parse(doc.availableAt)) || doc.availableAt.slice(0, 10) > asOf || Date.parse(doc.availableAt) < Date.parse(record.publishedAt)) continue;
    const packageEvidence = packageContexts(bundle.package.rawBytes);
    if (!packageEvidence) continue;
    sources.push({ normalized: normalized.source, package: packageProof.source, officialRecord: record.provenance,
      documentId: record.documentId, parserSourceSha256: doc.parserSourceSha256, parserIssues: copy(doc.issues || []) });
    for (const fact of doc.facts) {
      const p = doc.provenance?.[`${fact.metricId}|${fact.periodEnd}|${fact.fiscalPeriod}`];
      const numeric = typeof fact.value === 'number' && Number.isFinite(fact.value);
      const reporting = typeof fact.currency === 'string' && /^[A-Z]{3}$/.test(fact.currency);
      const original = p?.originalConcept?.match(/^\{https?:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full\}([A-Za-z]+)$/);
      const definition = registry[METRIC_KEYS[fact.metricId]], context = packageEvidence.contexts.get(p?.contextId);
      const conceptMatches = definition?.concepts.some(rule => rule.taxonomy === 'ifrs-full' && rule.concept === original?.[1]);
      const contextMatches = context && context.lei === doc.lei && context.end === fact.periodEnd && context.kind === definition?.kind &&
        context.start === (p?.periodStart ?? null) && (context.kind === 'instant' ||
          (Date.parse(context.end) - Date.parse(context.start)) / 86400000 >= 363 && (Date.parse(context.end) - Date.parse(context.start)) / 86400000 <= 370);
      const rawMatches = packageEvidence.rawFacts.filter(f => f.contextId === p?.contextId && f.concept === p?.originalConcept && f.unit === p?.unit);
      const valueBound = rawMatches.length && rawMatches.every(f => f.value === Number(p?.reportedValue));
      const good = numeric && reporting && day(fact.periodEnd) && fact.periodEnd <= asOf && fact.fiscalPeriod === 'FY' &&
        fact.fiscalYear === Number(fact.periodEnd.slice(0, 4)) && fact.availableAt === doc.availableAt && conceptMatches && contextMatches && valueBound &&
        (!NONNEGATIVE.has(fact.metricId) || fact.value >= 0) &&
        fact.unit === (COMPANY_METRICS.has(fact.metricId) ? 'currency_m' : 'currency') &&
        p?.unit === (COMPANY_METRICS.has(fact.metricId) ? fact.currency : `${fact.currency}/shares`) &&
        fact.filedAt === record.publishedAt.slice(0, 10) && fact.periodEnd <= fact.filedAt &&
        fact.securityId === doc.companyId && fact.sourceFilingId === record.documentId &&
        p?.documentId === record.documentId && p.sourceDocument === record.documentUrl &&
        p.mappingStatus === 'VERIFIED_STANDARD' && p.normalizedValue === fact.value && p.currency === fact.currency &&
        p.periodEnd === fact.periodEnd && p.contextId && original && ['currency_m', 'currency'].includes(fact.unit) &&
        Number.isFinite(Number(p.reportedValue)) && (fact.unit !== 'currency_m' || Number(p.reportedValue) * 1e-6 === fact.value) &&
        (fact.unit !== 'currency' || Number(p.reportedValue) === fact.value);
      if (!good) { quarantined.push({ fact: copy(fact), reason: 'INVALID_OR_UNBOUND_STANDARD_FACT' }); continue; }
      if (!COMPANY_METRICS.has(fact.metricId)) { quarantined.push({ fact: copy(fact), reason: 'LOCAL_SHARE_CLASS_EPS_OR_SHARES_UNVERIFIED' }); continue; }
      facts.push({ ...copy(fact), issuerLei: issuer.lei, reportingEntityLei: doc.lei,
        declaredReportingEntityLei: record.reportingEntityLei, reportingRelationship: record.relationship,
        historicalRelationship: record.historicalRelationship,
        basis: 'CONSOLIDATED_ISSUER_RESEARCH', localShareClassAssociated: false,
        provenance: { ...copy(p), packageSha256: packageProof.source.sha256, normalizedSha256: normalized.source.sha256 } });
    }
  }
  const groups = new Map();
  for (const fact of facts) {
    const key = `${fact.metricId}|${fact.periodEnd}`;
    const group = groups.get(key) || []; group.push(fact); groups.set(key, group);
  }
  const accepted = [];
  for (const group of groups.values()) {
    if (new Set(group.map(f => `${f.value}|${f.currency}|${f.unit}`)).size !== 1) quarantined.push(...group.map(fact => ({ fact, reason: 'CONFLICTING_OFFICIAL_FACTS' })));
    else accepted.push(group.sort((a, b) => a.availableAt.localeCompare(b.availableAt)).at(-1));
  }
  return { facts: accepted, quarantined, sources };
}

export function buildEuropeFundamentalsMapping(universe, evidence = {}, options = {}) {
  const asOf = options.asOf;
  if (!day(asOf)) throw new TypeError('INVALID_AS_OF');
  const listings = universe?.listings || [];
  const groups = new Map();
  for (const candidate of listings.filter(c => c.status === 'ACCEPTED')) {
    const group = groups.get(candidate.securityId) || [];
    if (group.some(c => c.listingKey === candidate.listingKey || c.isin !== candidate.isin || c.companyKey !== candidate.companyKey)) throw new TypeError('DUPLICATE_CANONICAL_SECURITY');
    group.push(candidate); groups.set(candidate.securityId, group);
  }
  const identitiesByIsin = new Map();
  for (const envelope of evidence.identities || []) {
    const key = urlOf(envelope?.source?.url)?.searchParams.get('filter[isin]');
    if (!validISIN(key)) continue;
    const group = identitiesByIsin.get(key) || []; group.push(envelope); identitiesByIsin.set(key, group);
  }
  const bundlesByIssuer = new Map();
  for (const bundle of evidence.factBundles || []) {
    const parsed = verifyOfficialEnvelope(bundle.normalized, 'NORMALIZED_RESEARCH', asOf)?.payload;
    if (!validLEI(parsed?.lei) || !validISIN(parsed?.isin)) continue;
    const key = parsed.isin, group = bundlesByIssuer.get(key) || [];
    group.push(bundle); bundlesByIssuer.set(key, group);
  }
  const rows = [...groups.values()].map(group => {
    const primary = group.filter(c => c.isPrimary === true);
    if (group.length > 1 && primary.length !== 1) throw new TypeError('DUPLICATE_CANONICAL_SECURITY');
    const candidate = group.length === 1 ? group[0] : primary[0];
    const issuer = resolveOfficialIssuer(candidate, identitiesByIsin.get(candidate.isin) || [], asOf);
    const historical = resolveHistoricalReportingEntities(issuer, evidence.historicalEntities || [], asOf);
    const records = resolveOamRecords(issuer, evidence.filingRecords || [], asOf, historical);
    const result = issuer ? researchFacts(issuer, records, bundlesByIssuer.get(issuer.isin) || [], asOf) : { facts: [], quarantined: [], sources: [] };
    const currencies = [...new Set(result.facts.map(f => f.currency))];
    const periods = [...new Set(result.facts.map(f => f.periodEnd))].sort();
    return { securityId: candidate.securityId, companyKey: candidate.companyKey, isin: candidate.isin,
      listingId: candidate.listingKey, mic: candidate.mic, listingCurrency: candidate.currency,
      listings: group.map(c => ({ listingId: c.listingKey, mic: c.mic, listingCurrency: c.currency, isPrimary: c.isPrimary ?? null })),
      issuer: issuer || null, identityStatus: issuer ? (issuer.currentDayObserved ? 'ISSUER_VERIFIED_CURRENT_OBSERVATION' : 'ISSUER_VERIFIED_DATED_OBSERVATION') : 'IDENTITY_BLOCKED',
      status: !issuer ? 'FUNDAMENTALS_IDENTITY_BLOCKED' : result.facts.length ? 'FUNDAMENTALS_PARTIAL' : 'FUNDAMENTALS_NONE',
      reportingEntityLei: result.facts.length && new Set(result.facts.map(f => f.reportingEntityLei)).size === 1 ? result.facts[0].reportingEntityLei : null,
      reportingCurrency: currencies.length === 1 ? currencies[0] : null,
      currencyBasis: currencies.length === 1 && currencies[0] === candidate.currency ? 'SAME_CURRENCY_OBSERVED' : 'UNVERIFIED_OR_CONVERSION_REQUIRED',
      fiscalPeriods: periods, latestFiscalPeriod: periods.at(-1) || null,
      localShareClassBasis: 'UNVERIFIED', sharesBasis: 'UNVERIFIED', shares: null,
      officialFilings: records, companyFacts: result.facts, withheldFacts: result.quarantined, factSources: result.sources,
      historicalReportingEntities: historical,
      quantFinancialInputReady: false, admittedToRanking: false, publicationAllowed: false,
      reasons: !issuer ? ['EXACT_OFFICIAL_ISSUER_PROOF_MISSING'] : [
        ...(result.facts.length ? [] : ['NO_PARSED_VERIFIED_ISSUER_FACTS']), 'LOCAL_SHARE_CLASS_AND_SHARES_BASIS_MISSING', 'EXISTING_ENGINE_INPUT_CERTIFICATE_MISSING'] };
  });
  const counts = Object.fromEntries(['FUNDAMENTALS_FULL', 'FUNDAMENTALS_PARTIAL', 'FUNDAMENTALS_NONE', 'FUNDAMENTALS_IDENTITY_BLOCKED'].map(s => [s, rows.filter(r => r.status === s).length]));
  return { schemaVersion: VERSION, asOf, mode: 'PRIVATE_RESEARCH', publicationAllowed: false,
    summary: { securities: rows.length, companies: new Set(rows.map(r => r.companyKey)).size, ...counts,
      officialFilingMapped: rows.filter(r => r.officialFilings.length).length,
      parsedIssuerFacts: rows.reduce((n, r) => n + r.companyFacts.length, 0), quantFinancialInputReady: 0 }, rows };
}
