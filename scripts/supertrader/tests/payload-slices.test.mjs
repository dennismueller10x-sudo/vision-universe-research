/* Payload-Ausschnitte (Audit 03.10.2026: jede der 822 Supertrader-Seiten
   lud die volle signals.json, 3,3 MB). Die Ausschnitte duerfen nichts
   veraendern, was eine Seite zeigt: gemessen auf der committeten
   signals.json mit derselben Sammellogik wie supertrader.js#renderStock. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signalsCore, signalsBySymbol, HISTORY_LISTS, SLICES_VERSION } from '../build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const signals = JSON.parse(readFileSync(join(ROOT, 'supertrader', 'data', 'signals.json'), 'utf8'));
const size = (x) => Buffer.byteLength(JSON.stringify(x));

/* Spiegel von renderStock: was die Aktienseite aus den Signalen sammelt. */
function stockView(sig, sym) {
  const entries = [], history = [];
  for (const id of Object.keys(sig.strategies)) {
    const st = sig.strategies[id];
    st.open.forEach((x) => { if (x.symbol === sym) entries.push([id, 'open', x]); });
    st.closed.concat(st.invalidated, st.retired || []).forEach((x) => { if (x.symbol === sym) history.push([id, x]); });
    st.scanner.top.forEach((x) => { if (x.symbol === sym) entries.push([id, 'scan', x]); });
  }
  for (const id of ['CANSLIM', 'PIOTROSKI_F']) {
    const pc = sig.partialChecks && sig.partialChecks[id];
    if (pc) pc.candidates.concat(pc.near || []).forEach((r) => { if (r.symbol === sym) entries.push([id, 'partial', r]); });
  }
  return { entries, history };
}

test('signals-core: ohne Historienlisten, alles andere unveraendert', () => {
  const core = signalsCore(signals);
  for (const [id, st] of Object.entries(signals.strategies)) {
    for (const k of HISTORY_LISTS) assert.equal(core.strategies[id][k], undefined, id + '.' + k);
    for (const k of Object.keys(st).filter((k) => !HISTORY_LISTS.includes(k))) assert.deepEqual(core.strategies[id][k], st[k], id + '.' + k);
  }
  for (const k of Object.keys(signals).filter((k) => k !== 'strategies')) assert.deepEqual(core[k], signals[k], k);
  assert.ok(size(core) < size(signals) * 0.6, `core ${size(core)} B gegen ${size(signals)} B`);
});

test('Aktien-Ausschnitt: die Aktienseite sieht fuer jedes Symbol exakt dasselbe', () => {
  const slices = signalsBySymbol(signals);
  const syms = Object.keys(signals.bySymbol);
  assert.ok(syms.length > 500);
  for (const sym of syms) assert.deepEqual(stockView(slices[sym], sym), stockView(signals, sym), sym);
  for (const sl of Object.values(slices)) for (const k of ['asOf', 'inputsGeneratedAt', 'counts']) assert.equal(sl[k], undefined, 'taeglich wechselndes Feld ' + k + ' im Ausschnitt');
  const max = Math.max(...Object.values(slices).map(size));
  assert.ok(max < 150000, 'groesster Ausschnitt ' + max + ' B');
});

test('Aktien-Ausschnitt auch fuer Symbole nur aus Teilpruefungen', () => {
  const nur = Object.values(signals.partialChecks || {}).flatMap((pc) => (pc.candidates || []).map((r) => r.symbol)).find((s) => !signals.bySymbol[s]);
  if (!nur) return;
  const slice = signalsBySymbol(signals, [nur])[nur];
  assert.deepEqual(stockView(slice, nur), stockView(signals, nur));
});

test('Seite fragt nur Ausschnitte an, die build.json ausweist (keine vergeblichen 404)', () => {
  const src = readFileSync(join(ROOT, 'supertrader', 'assets', 'supertrader.js'), 'utf8');
  const build = readFileSync(join(ROOT, 'scripts', 'supertrader', 'build.mjs'), 'utf8');
  assert.match(build, /slices: \{ version: SLICES_VERSION, stock: Object\.keys\(slices\)\.sort\(\) \}/);
  assert.match(src, /\(sl\.stock \|\| \[\]\)\.indexOf\(SYM\) >= 0 \? 'stock\/' \+ SYM \+ '\.json' : null/);
  assert.match(src, /if \(!part\) return getJSON\(FILE\.signals\);/);
});

test('SLICES_VERSION ist gesetzt', () => { assert.match(SLICES_VERSION, /^signals-slices-\d+$/); });
