// Datenpaket der internen Backtest-Vorschau fuer den Konto-Worker (workers/vu-account/data/backtest-review-bundle.json):
// gleiche Nachweisart wie die Vorschau-Ansicht, keine Verweise auf den Vorschau-Dienst, keine Vorteils-Aussagen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const Export = require('../../scripts/quant/research/export-backtest-review-bundle.cjs');
const Preview = require('../api/backtest-preview-service.cjs');
const Contract = require('../engines/backtest-result-contract.cjs');
const BUNDLE_FILE = path.join(ROOT, 'workers/vu-account/data/backtest-review-bundle.json');
const BUNDLE = JSON.parse(fs.readFileSync(BUNDLE_FILE, 'utf8'));

test('Nachweisart im Paket = Ansicht der Vorschau (alle Vorschaufaelle und alle Katalogeintraege)', () => {
  assert.deepEqual(Export.EVIDENCE_CLASS_LABEL, Preview.EVIDENCE_CLASS_LABEL);
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, Export.DEFAULTS.preview), 'utf8'));
  const cert = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/product/backtest-certification-v1.json'), 'utf8'));
  const view = Preview.getBacktestPreview(doc, { backtestPreview: { enabled: true, audience: 'INTERNAL_REVIEW' }, internalPreview: true, certification: cert });
  assert.equal(view.state, 'AVAILABLE');
  const byId = Object.fromEntries(view.kinds.flatMap(k => k.cases).map(c => [c.id, c.display.evidence]));
  const mine = Object.fromEntries(BUNDLE.kinds.flatMap(k => k.cases).map(c => [c.id, c.evidence]));
  assert.deepEqual(mine, byId);
  for (const e of BUNDLE.entries) {
    const r = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant/backtest-catalog/results', e.specHash + '.json'), 'utf8'));
    assert.deepEqual(e.evidence, Preview.evidenceClassOf({ state: r.state, evidenceKind: r.envelope.status.evidenceKind, limitations: r.envelope.limitations }), e.label);
    assert.notEqual(e.evidence.class, 'CERTIFIED_STRATEGY');
  }
  assert.equal(BUNDLE.previewHash, doc.previewHash);
  assert.deepEqual(BUNDLE.certificationArtifact.certifiedKinds, view.certificationArtifact.certifiedKinds);
});

test('Paket: keine Verweise auf Vorschau-Dienst oder Research-Adapter, keine Vorteils-Aussagen, nichts zertifiziert', () => {
  const text = fs.readFileSync(BUNDLE_FILE, 'utf8');
  for (const needle of ['backtest-preview-service', 'build-backtest-preview', 'render-backtest-preview', 'backtest-preview/backtest-preview.json',
    'backtest-research-adapter', 'VUBacktestResearchAdapter', 'backtest-result-adapters', 'backtest-result-contract.cjs']) assert.equal(text.includes(needle), false, needle);
  for (const re of Contract.ALPHA_CLAIM_PATTERNS) assert.equal(re.test(text.replace(/NO_ALPHA_OR_CERTIFICATION_CLAIM/g, '')), false, String(re));
  const src = fs.readFileSync(path.join(ROOT, 'scripts/quant/research/export-backtest-review-bundle.cjs'), 'utf8');
  assert.equal(src.includes("require('../../../quant/api/"), false, 'der Export laedt keinen Dienst');
  assert.equal(BUNDLE.certification, 'NOT_CERTIFIED'); assert.equal(BUNDLE.productionApproved, false); assert.equal(BUNDLE.publiclyActivated, false);
  assert.ok(BUNDLE.entries.every(e => e.productionApproved === false && e.evidence.alphaClaim === false));
});

test('Security-Master: Paket nennt die Generation, gegen die der Katalog gerechnet wurde', () => {
  const master = path.join(ROOT, 'quant/data/market/security-master/us-security-master.json');
  assert.equal(Export.MASTER_GENERATIONS[BUNDLE.masterHash], BUNDLE.masterGeneration);
  const current = crypto.createHash('sha256').update(fs.readFileSync(master)).digest('hex');
  // Solange der Master unveraendert ist, muss seine Version der Generation im Paket entsprechen. Nach einem
  // Master-Wechsel gilt der Katalog als veraltet (neu rechnen, dann Paket neu exportieren; BACKTEST_PREVIEW.md Abschnitt 9).
  if (current === BUNDLE.masterHash) assert.equal(JSON.parse(fs.readFileSync(master, 'utf8')).version, BUNDLE.masterGeneration);
});
