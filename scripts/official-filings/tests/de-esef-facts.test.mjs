// M5: Konzern-Kennzahlen aus ESEF-Paketen deutscher Emittenten. Synthetische Mini-Pakete, kein Netz, nur --out in tmp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { extractFacts, buildEsefFacts } from '../de-esef-facts.mjs';

const LEI = '529900D6BF99LW9R2E68', OTHER = '529900K9B0N5BT694847';
function zip(xml) {
  const name = Buffer.from('pkg/reports/report.xhtml'), data = Buffer.from(xml);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}
const ctx = (id, lei, s, e) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://standards.iso.org/iso/17442">${lei}</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>${s}</xbrli:startDate><xbrli:endDate>${e}</xbrli:endDate></xbrli:period></xbrli:context>`;
const fact = (name, c, v, sign = '') => `<ix:nonFraction name="ifrs-full:${name}" contextRef="${c}" unitRef="EUR" scale="6" decimals="-6" format="ixt:num-dot-decimal"${sign ? ' sign="-"' : ''}>${v}</ix:nonFraction>`;
function report({ lei = LEI, facts }) {
  return `<html xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:ifrs-full="https://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12"><body>` +
    ctx('c25', lei, '2025-01-01', '2025-12-31') + ctx('c24', lei, '2024-01-01', '2024-12-31') +
    `<xbrli:unit id="EUR"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>` + facts + `</body></html>`;
}
const good = () => report({ facts: fact('Revenue', 'c25', '36,800') + fact('Revenue', 'c24', '34,176') + fact('ProfitLoss', 'c25', '7,300') + fact('ProfitLoss', 'c24', '3,150') +
  fact('CashFlowsFromUsedInOperatingActivities', 'c25', '8,100') + fact('CashFlowsFromUsedInOperatingActivities', 'c24', '5,200') });

test('gültiges Paket: drei Konzern-Kennzahlen mit Vorjahr, Werte exakt skaliert', () => {
  const r = extractFacts(zip(good()), { lei: LEI, fiscalYearEnd: '2025-12-31' });
  assert.equal(r.status, 'PLAUSIBLE');
  const by = Object.fromEntries(r.metrics.map((m) => [m.metric, m]));
  assert.equal(by.revenue.value, 36800e6); assert.equal(by.revenue.priorValue, 34176e6); assert.equal(by.revenue.currency, 'EUR');
  assert.equal(by.netIncome.value, 7300e6); assert.equal(by.operatingCashFlow.value, 8100e6);
  assert.equal(by.revenue.periodStart, '2025-01-01'); assert.equal(by.revenue.priorPeriodEnd, '2024-12-31');
});

test('ohne Vorjahr, mit unplausiblem Sprung oder Widerspruch: Kennzahl wird nicht gezeigt', () => {
  const noPrior = extractFacts(zip(report({ facts: fact('Revenue', 'c25', '100') })), { lei: LEI, fiscalYearEnd: '2025-12-31' });
  assert.equal(noPrior.status, 'NO_PLAUSIBLE_FACTS'); assert.deepEqual(noPrior.held.find((h) => h.metric === 'revenue'), { metric: 'revenue', reason: 'NO_PRIOR_YEAR_IN_PACKAGE' });
  const jump = extractFacts(zip(report({ facts: fact('Revenue', 'c25', '1,000') + fact('Revenue', 'c24', '100') })), { lei: LEI, fiscalYearEnd: '2025-12-31' });
  assert.equal(jump.held.find((h) => h.metric === 'revenue').reason, 'YEAR_OVER_YEAR_IMPLAUSIBLE');
  const conflict = extractFacts(zip(report({ facts: fact('Revenue', 'c25', '100') + fact('Revenue', 'c25', '101') + fact('Revenue', 'c24', '90') })), { lei: LEI, fiscalYearEnd: '2025-12-31' });
  assert.equal(conflict.held.find((h) => h.metric === 'revenue').reason, 'CONFLICTING_VALUES');
});

test('fremde LEI im Kontext und Bank ohne Umsatz: nichts übertragen, Umsatz fehlt ehrlich', () => {
  const other = extractFacts(zip(report({ lei: OTHER, facts: fact('Revenue', 'c25', '100') + fact('Revenue', 'c24', '90') })), { lei: LEI, fiscalYearEnd: '2025-12-31' });
  assert.equal(other.metrics.length, 0);
  const bank = extractFacts(zip(report({ facts: fact('ProfitLoss', 'c25', '5,000') + fact('ProfitLoss', 'c24', '4,200') })), { lei: LEI, fiscalYearEnd: '2025-12-31' });
  assert.equal(bank.status, 'PLAUSIBLE'); assert.deepEqual(bank.metrics.map((m) => m.metric), ['netIncome']);
  assert.equal(bank.held.find((h) => h.metric === 'revenue').reason, 'NOT_REPORTED');
  const loss = extractFacts(zip(report({ facts: fact('ProfitLoss', 'c25', '500', true) + fact('ProfitLoss', 'c24', '200') })), { lei: LEI, fiscalYearEnd: '2025-12-31' });
  assert.equal(loss.metrics[0].value, -500e6);
});

test('Erzeuger: Hash muss stimmen, Identität nur über den Katalog (Ticker und LEI), nur deutsche Emittenten', async () => {
  const pkg = zip(good()), sha = createHash('sha256').update(pkg).digest('hex');
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => pkg.buffer.slice(pkg.byteOffset, pkg.byteOffset + pkg.length) });
  const sources = { sources: [
    { ticker: 'SAP.DE', lei: LEI, fiscalYearEnd: '2025-12-31', zipUrl: 'https://example.invalid/sap.zip', sha256: sha },
    { ticker: 'ALV.DE', lei: OTHER, fiscalYearEnd: '2025-12-31', zipUrl: 'https://example.invalid/alv.zip', sha256: '0'.repeat(64) },
    { ticker: 'XYZ.DE', lei: LEI, fiscalYearEnd: '2025-12-31', zipUrl: 'https://example.invalid/x.zip', sha256: sha },
  ] };
  const d = await buildEsefFacts({ sources, fetchImpl, now: '2026-11-08T00:00:00Z' });
  const by = Object.fromEntries(d.rows.map((r) => [r.ticker, r]));
  assert.equal(by['SAP.DE'].status, 'PLAUSIBLE'); assert.equal(by['SAP.DE'].securityId, 'ref_SAP_DE_XETR');
  assert.equal(by['ALV.DE'].status, 'PACKAGE_HASH_MISMATCH'); assert.equal(by['ALV.DE'].metrics.length, 0);
  assert.equal(by['XYZ.DE'].status, 'IDENTITY_NOT_IN_CATALOG');
  assert.equal(d.quantInputReady, false); assert.equal(d.counts.plausible, 1);
});

test('Paket vorbereiten: verschachteltes Paket wird ausgepackt, bei mehreren Berichten nur der benannte gelesen', async () => {
  const { preparePackage } = await import('../de-esef-facts.mjs');
  const inner = zip(good());
  const wrap = (name, data) => { const nm = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nm.length, 28);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + nm.length, 12); end.writeUInt32LE(local.length + nm.length + data.length, 16);
    return Buffer.concat([local, nm, data, central, nm, end]); };
  const nested = wrap('KA-2025.xbri', inner);
  assert.equal(extractFacts(nested, { lei: LEI, fiscalYearEnd: '2025-12-31' }).status, 'PACKAGE_UNSUPPORTED');
  assert.equal(extractFacts(preparePackage(nested), { lei: LEI, fiscalYearEnd: '2025-12-31' }).status, 'PLAUSIBLE');
  assert.equal(preparePackage(inner), inner);
});

test('Quellenliste: nur Website-Pakete mit SHA-256, Emittent im Katalog als deutscher Emittent', async () => {
  const { readFile } = await import('node:fs/promises');
  const list = JSON.parse(await readFile(new URL('../de-esef-sources.json', import.meta.url), 'utf8'));
  const catalog = JSON.parse(await readFile(new URL('../../../discover/data/europe/catalog.json', import.meta.url), 'utf8'));
  assert.ok(list.sources.length >= 1);
  for (const s of list.sources) {
    assert.match(s.sha256, /^[a-f0-9]{64}$/); assert.match(s.zipUrl, /^https:\/\//); assert.doesNotMatch(s.zipUrl, /unternehmensregister|bundesanzeiger|filings\.xbrl\.org/);
    const sec = catalog.securities.filter((x) => x.ticker === s.ticker && x.companyId === 'LEI:' + s.lei);
    assert.equal(sec.length, 1, s.ticker); assert.equal(sec[0].listings[0].identityAdmission.issuerCountry, 'DE');
  }
});
