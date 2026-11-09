/**
 * Supertrader 9 – X-LEDGER / C12-LEDGER (CERT-PREP-TOP5-PLAN.json): die Ledger-Einträge für Morales/Kacher, Raschke,
 * B07 und W-MIN18 in scripts/supertrader/source-ledger.json sind ausschließlich aus dem #709-Extrakt, der SF-Registry
 * und (W-RAS97) holy-grail-lifecycle.mjs#W_RAS97 belegt. Nicht belegte Felder sind null und in not_evidenced genannt.
 * Liest nur; der Legacy-Build und der Ledger verweisen nicht auf den source-faithful-Baum (SF2-LEGACY-ISOLATION).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { W_RAS97 } from '../source-faithful/research/holy-grail-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const ledger = read('scripts/supertrader/source-ledger.json');
const extract = read('scripts/supertrader/source-faithful/evidence/PSR709-EVIDENCE-EXTRACT.json');
const registry = read('scripts/supertrader/source-faithful/artifacts/STRATEGY-REGISTRY.json');
const src = new Map(extract.sources.map((s) => [s.source_id, s]));
const X_LEDGER_IDS = ['W-MOKAPP', 'W-MOKA12', 'W-MOKASTOP', 'W-MOKAV24', 'W-RAS04', 'W-RAS97', 'B07', 'W-MIN18'];
const entry = (id) => ledger.find((s) => s.source_id === id);

test('X-LEDGER-PSR709: Einträge aus dem #709-Extrakt stimmen Feld für Feld (URL, sha256, Titel, Provenienz, Ära, Wortlautprüfung)', () => {
  for (const id of X_LEDGER_IDS.filter((x) => x !== 'W-RAS97')) {
    const e = entry(id), ev = e?.provenance_evidence, s = src.get(id);
    assert.ok(e && ev && s, id);
    assert.equal(ev.basis, 'PSR709_EXTRACT', id);
    assert.equal(ev.pullRequest, extract.pin.pullRequest, id);
    assert.equal(ev.commit, extract.pin.commit, id);
    assert.equal(ev.psr709_source_id, id);
    assert.equal(ev.psr709_title, s.title, id);
    assert.equal(e.url ?? null, s.url ?? null, `${id}: URL`);
    assert.equal(ev.sha256 ?? null, s.sha256 ?? null, `${id}: sha256`);
    for (const k of ['provenance', 'era', 'original_wording_checked']) assert.equal(ev[k], s[k], `${id}.${k}`);
    for (const k of ['document_language', 'page_count', 'edition', 'isbn', 'translation_note']) assert.equal(ev[k], s[k], `${id}.${k}`);
    // was der Extrakt nicht hat, ist als nicht belegt gekennzeichnet
    if (!s.sha256) assert.ok(ev.not_evidenced.includes('sha256'), `${id}: fehlender Hash gekennzeichnet`);
    if (!s.url) assert.ok(ev.not_evidenced.includes('url') && e.url_verification === 'NO_URL_FOUND', `${id}: fehlende URL gekennzeichnet`);
    if (s.page_count == null) assert.ok(ev.not_evidenced.includes('page_count'), `${id}: Seitenzahl`);
    assert.equal(e.url_verification, !s.url ? 'NO_URL_FOUND' : s.sha256 ? 'CONTENT_SHA256_IN_PSR709' : 'URL_FROM_PSR709_NOT_REVERIFIED', id);
    // Obergrenze: Primärquelle mit geprüftem Wortlaut explizit, ungeprüfte Übersetzung höchstens abgeleitet
    assert.equal(e.evidence_status_ceiling, s.original_wording_checked ? 'PRIMARY_EXPLICIT' : 'PRIMARY_INFERRED', id);
  }
});

test('X-LEDGER-RAS97: W-RAS97 steht nicht im #709-Extrakt und ist nur als Sekundärquelle aus D-RAS97 geführt', () => {
  const e = entry('W-RAS97'), ev = e.provenance_evidence;
  assert.equal(src.has('W-RAS97'), false);
  assert.equal(ev.basis, 'OWNER_DECISION_D-RAS97');
  assert.equal(ev.in_psr709_extract, false);
  assert.equal(e.url, W_RAS97.url);
  assert.equal(ev.sha256, W_RAS97.sha256);
  assert.equal(e.evidence_status_ceiling, 'SECONDARY_ONLY');
  assert.ok(ev.not_evidenced.includes('author'));
  const hg = registry.entries.find((x) => x.strategyId === 'SF_RASCHKE_HOLY_GRAIL');
  assert.ok(hg.secondarySourceRules.every((r) => r.secondarySource === 'W-RAS97' && r.status === 'SOURCE_DERIVED'));
});

test('X-LEDGER-USED-FOR: used_for nennt genau die Methoden der SF-Registry, die die Quelle zitieren', () => {
  for (const id of X_LEDGER_IDS) {
    const usedBy = registry.entries.filter((x) => (x.sources ?? []).some((s) => s.sourceId === id)).map((x) => x.strategyId);
    assert.ok(usedBy.length > 0, id);
    assert.deepEqual(entry(id).used_for, usedBy, id);
  }
});
