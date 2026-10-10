/** Current ISO relationships support product preference; MICs are never aliases. */
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { privateReplayRoot } from './europe-private-files.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => /^[a-f0-9]{64}$/.test(value || '');
export const GERMAN_REGIONAL_POLICY = 'GERMANY_REGIONAL_PRIMARY_LIQUID_LOCAL_XETRA';
function csv(text) {
  const records = []; let row = [], field = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quote && text[i + 1] === '"') { field += '"'; i++; } else quote = !quote; }
    else if (c === ',' && !quote) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quote) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(Boolean)) records.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quote) throw Error('INVALID_ISO_CSV_QUOTES');
  if (field || row.length) { row.push(field); records.push(row); }
  const columns = records.shift();
  if (!columns || !['MIC', 'OPERATING MIC', 'OPRT/SGMT', 'ISO COUNTRY CODE (ISO 3166)', 'STATUS'].every(c => columns.includes(c))) throw Error('ISO_MIC_COLUMNS_REQUIRED');
  if (records.some(r => r.length !== columns.length)) throw Error('INVALID_ISO_CSV_ROW');
  return records.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}
/** Rebuild all relationships from original official CSV bytes, ignoring editable row summaries. */
export function readCurrentMicRelationships(manifestPath, now) {
  const root = privateReplayRoot(dirname(manifestPath));
  const path = resolve(manifestPath); if (dirname(path) !== root || !lstatSync(path).isFile()) throw Error('REGULAR_ISO_MANIFEST_REQUIRED');
  const manifest = JSON.parse(readFileSync(path)), source = manifest.source;
  const sourcePath = resolve(source?.path || '');
  if (dirname(sourcePath) !== root || !lstatSync(sourcePath).isFile()) throw Error('REGULAR_ISO_CSV_REQUIRED');
  const bytes = readFileSync(sourcePath);
  if (!source || source.kind !== 'OFFICIAL_ISO10383_MIC' || source.url !== 'https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv' ||
    source.linkObservedOn !== 'https://www.iso20022.org/market-identifier-codes' || source.httpStatus !== 200 || hash(bytes) !== source.sha256 ||
    !current(source, now)) throw Error('CURRENT_HASH_BOUND_OFFICIAL_ISO_REQUIRED');
  const rows = csv(bytes.toString('utf8').replace(/^\uFEFF/, '')), seen = new Set();
  for (const row of rows) { if (!/^[A-Z0-9]{4}$/.test(row.MIC) || seen.has(row.MIC)) throw Error('AMBIGUOUS_ISO_MIC_RECORD'); seen.add(row.MIC); }
  return { source, rows, verified: true, evaluatedAt: now, comparisonPolicy: 'EXACT_MIC_RECORD_AND_EXPLICIT_OPERATING_RELATION_NOT_ALIAS_EQUALITY' };
}
function current(source, now) {
  return sha(source?.sha256) && Number.isFinite(Date.parse(now)) && Number.isFinite(Date.parse(source.retrievedAt)) &&
    Date.parse(source.retrievedAt) <= Date.parse(now) && new Date(source.retrievedAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
}
function activeGerman(row) { return row?.STATUS === 'ACTIVE' && row['ISO COUNTRY CODE (ISO 3166)'] === 'DE'; }
export function germanRegionalMicEvidence(relationships, primaryMarketMic, now) {
  if (!relationships || relationships.verified !== true || !current(relationships.source, now)) return null;
  const selected = relationships.rows.filter(row => row.MIC === primaryMarketMic);
  if (selected.length !== 1 || !activeGerman(selected[0])) return null;
  const primary = selected[0], operating = relationships.rows.filter(row => row.MIC === primary['OPERATING MIC']);
  if (operating.length !== 1 || !activeGerman(operating[0]) || operating[0]['OPRT/SGMT'] !== 'OPRT' || operating[0]['OPERATING MIC'] !== operating[0].MIC) return null;
  if (!['OPRT', 'SGMT'].includes(primary['OPRT/SGMT']) || primary['OPRT/SGMT'] === 'OPRT' && primary.MIC !== primary['OPERATING MIC']) return null;
  const target = relationships.rows.filter(row => row.MIC === 'XETR');
  if (target.length !== 1 || !activeGerman(target[0]) || (target[0]['OPRT/SGMT'] !== 'OPRT' || target[0]['OPERATING MIC'] !== 'XETR')) return null;
  return { verified: true, primaryMarketMic, operatingMic: operating[0].MIC, preferredProductMic: 'XETR',
    primaryRecord: primary, operatingRecord: operating[0], targetRecord: target[0], source: relationships.source,
    evaluatedAt: now, relationshipMeaning: 'DOMESTIC_REFERENCE_PRIMARY_WITH_SEPARATE_XETRA_PRODUCT_PREFERENCE_NOT_MIC_EQUALITY' };
}
export function validRegionalMicEvidence(evidence, primaryMarketMic, now) {
  if (evidence?.verified !== true || evidence.primaryMarketMic !== primaryMarketMic || evidence.preferredProductMic !== 'XETR' ||
    evidence.relationshipMeaning !== 'DOMESTIC_REFERENCE_PRIMARY_WITH_SEPARATE_XETRA_PRODUCT_PREFERENCE_NOT_MIC_EQUALITY' || !current(evidence.source, now)) return false;
  const rebuilt = germanRegionalMicEvidence({ verified: true, rows: [...new Map([evidence.primaryRecord, evidence.operatingRecord, evidence.targetRecord].filter(Boolean).map(r => [r.MIC, r])).values()], source: evidence.source }, primaryMarketMic, now);
  return Boolean(rebuilt && rebuilt.operatingMic === evidence.operatingMic);
}
