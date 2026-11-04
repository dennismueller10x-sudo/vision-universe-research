// Supertrader Master Completion 3.0 – Kausalität und Determinismus der Research-Adapter je Methode.
//
// Nur Tests, keine Engine-Änderung. Der Lebenszyklus-Vertrag (research/lifecycle-engine.mjs, Kopf) verlangt:
// „prepare(security, cfg) per-security precomputation; must be causal bar by bar (bar i uses bars 0..i)“ und
// „signalAt(ctx, i, cfg) setup known at the CLOSE of bar i“. Bisher ist das nur für Turtle (SF-TUR-TEMPORAL), Teile der
// Minervini-Ausstiege und die SF8-Pipeline (SF8-PIT-ASOF) belegt. Hier wird es je Methode auf den eingefrorenen echten
// Reihen der SF8-Fixture geprüft:
//  - MC3-CAUSAL-<Methode>: signalAt und eligibility aus der Vorbereitung über die GANZE Reihe sind am Balken i gleich
//    dem Ergebnis aus der Vorbereitung über die Balken 0..i (plus Platzhalter der Folgesitzung ohne Kurswerte, wie der
//    Produktlauf ihn anhängt: detectors.mjs#withNextSession). Ein Unterschied wäre ein Blick in die Zukunft.
//  - MC3-DETERMINISTIC-<Methode>: zwei Vorbereitungen derselben Eingabe sind gleich, und die Eingabe bleibt unverändert.
//  - MC3-CAUSAL-PROBE: Gegenprobe; ein Adapter mit absichtlichem Blick auf Balken i + 1 wird erkannt.
// C09/C10 (EP/PS) entscheiden an der Eröffnung der Folgesitzung auf IEX-Minuten; ihr Zeitpunkt ist nicht „Schluss von i“.
// Sie sind hier bewusst nicht enthalten; ihr Nachweis steht in sf-mc3-causality-minutes.test.mjs (synthetische Tages- und
// Minuten-Fixtures). C01/C02 deckt SF-TUR-TEMPORAL ab.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SF5_LIFECYCLES } from '../source-faithful/research/sf5-lifecycles.mjs';
import { sepaSetupAt, powerPlaySetupAt } from '../source-faithful/research/minervini-lifecycle.mjs';
import { withNextSession } from '../source-faithful/product/detectors.mjs';

// Abdeckung dieser Datei (der Erzeuger des Evidenzdokuments liest diese Zeile; MC3-COVERAGE prüft sie gegen die Schleifen)
const MC3_COVERED = Object.freeze({ causal: ['C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C11', 'C12', 'C13'], deterministic: ['C03', 'C04', 'C05', 'C08', 'C11', 'C12', 'C13'] });
const MINERVINI = Object.freeze([['C06', 'MINERVINI_SEPA', sepaSetupAt], ['C07', 'MINERVINI_POWER_PLAY', powerPlaySetupAt]]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/sf8-golden-bars.json'), 'utf8'));
const securities = () => F.securities.map((s) => ({
  id: s.id, ticker: s.ticker, terminal: null, meta: structuredClone(s.meta),
  bars: s.cols.d.map((d, k) => ({ date: d, open: s.cols.o[k], high: s.cols.h[k], low: s.cols.l[k], close: s.cols.c[k], volume: s.cols.v[k] })),
}));

// Schnittstellen: jeder 2. Balken ab 60 sowie die letzten 5 vollständigen Balken (der letzte hat keinen Folgebalken).
const cutsOf = (n) => { const out = new Set(); for (let i = 60; i < n - 1; i += 2) out.add(i); for (let i = Math.max(60, n - 6); i < n - 1; i++) out.add(i); return [...out].sort((a, b) => a - b); };
const norm = (x) => JSON.stringify(x ?? null, (k, v) => (v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : (typeof v === 'number' && Number.isNaN(v) ? 'NaN' : v)));
const prefixOf = (sec, i) => ({ ...sec, bars: withNextSession(sec.bars.slice(0, i + 1), sec.bars[i + 1].date) });

/** Vergleicht je Schnitt i die Sicht aus der ganzen Reihe mit der Sicht aus 0..i. Liefert Zählungen und Abweichungen. */
function causalCompare(adapter, cfg, secs) {
  const diffs = [], counts = { cuts: 0, signals: 0, eligibility: 0 };
  for (const sec of secs) {
    const full = adapter.prepare(sec, cfg, {});
    for (const i of cutsOf(sec.bars.length)) {
      counts.cuts++;
      const pre = prefixOf(sec, i), ctxP = adapter.prepare(pre, cfg, {});
      const sFull = full ? adapter.signalAt(full, i, cfg) : null, sPre = ctxP ? adapter.signalAt(ctxP, i, cfg) : null;
      if (norm(sFull) !== norm(sPre)) { diffs.push(`${sec.ticker} ${sec.bars[i].date} signalAt`); continue; }
      if (!sFull) continue;
      counts.signals++;
      if (typeof adapter.eligibility === 'function') {
        const eFull = adapter.eligibility({ ctx: full, setup: sFull, bars: sec.bars, i, cfg });
        const ePre = adapter.eligibility({ ctx: ctxP, setup: sPre, bars: pre.bars, i, cfg });
        counts.eligibility++;
        if (norm(eFull) !== norm(ePre)) diffs.push(`${sec.ticker} ${sec.bars[i].date} eligibility`);
      }
    }
  }
  return { counts, diffs };
}

for (const lc of SF5_LIFECYCLES) {
  test(`MC3-CAUSAL-${lc.candidateId}: ${lc.key} – signalAt/eligibility am Balken i hängen nur von den Balken 0..i ab`, () => {
    const r = causalCompare(lc.adapter, lc.reference, securities());
    assert.deepEqual(r.diffs, [], `${lc.key}: Blick in die Zukunft an ${r.diffs.slice(0, 5).join(', ')}`);
    assert.ok(r.counts.cuts > 500, `${lc.key}: zu wenige Schnitte (${r.counts.cuts})`);
    assert.ok(r.counts.signals > 0, `${lc.key}: kein einziges Setup an den Schnitten – die Prüfung wäre leer`);
  });

  test(`MC3-DETERMINISTIC-${lc.candidateId}: ${lc.key} – gleiche Eingabe, gleiche Vorbereitung; Eingabe unverändert`, () => {
    const secs = securities(), before = norm(secs);
    for (const sec of secs) assert.equal(norm(lc.adapter.prepare(sec, lc.reference, {})), norm(lc.adapter.prepare(structuredClone(sec), lc.reference, {})), `${lc.key} ${sec.ticker}`);
    assert.equal(norm(secs), before, `${lc.key}: prepare verändert die Eingabe`);
  });
}

// Minervini C06/C07: sepaSetupAt / powerPlaySetupAt (security, i) werden in Produkt und Research je Balken gerufen.
for (const [cid, name, fn] of MINERVINI) {
  test(`MC3-CAUSAL-${cid}: ${name} – das Setup am Balken i hängt nur von den Balken 0..i ab; deterministisch`, () => {
    const secs = securities(), before = norm(secs), diffs = [];
    let cuts = 0, evaluated = 0;
    for (const sec of secs) for (const i of cutsOf(sec.bars.length)) {
      cuts++;
      const a = fn(sec, i), b = fn(prefixOf(sec, i), i), c = fn(sec, i);
      if (a != null) evaluated++;
      if (norm(a) !== norm(b)) diffs.push(`${sec.ticker} ${sec.bars[i].date}`);
      assert.equal(norm(a), norm(c), `${name} ${sec.ticker} ${i}: nicht deterministisch`);
    }
    assert.deepEqual(diffs, [], `${name}: Blick in die Zukunft an ${diffs.slice(0, 5).join(', ')}`);
    assert.ok(cuts > 500 && evaluated > 0, `${name}: Prüfung leer (Schnitte ${cuts}, Ergebnisse ${evaluated})`);
    assert.equal(norm(secs), before, `${name}: verändert die Eingabe`);
  });
}

test('MC3-COVERAGE: die erklärte Abdeckung entspricht den Schleifen (SF5-Lebenszyklen und Minervini)', () => {
  const sf5 = SF5_LIFECYCLES.map((l) => l.candidateId), sort = (a) => [...a].sort();
  assert.deepEqual(sort(MC3_COVERED.causal), sort([...sf5, ...MINERVINI.map(([c]) => c)]));
  assert.deepEqual(sort(MC3_COVERED.deterministic), sort(sf5));
});

test('MC3-CAUSAL-PROBE: Gegenprobe – ein Adapter mit Blick auf Balken i + 1 wird erkannt', () => {
  const lc = SF5_LIFECYCLES.find((x) => x.key === 'KK_BREAKOUT');
  const peeking = Object.freeze({
    ...lc.adapter,
    signalAt(ctx, i, cfg) {
      const s = lc.adapter.signalAt(ctx, i, cfg); if (!s) return null;
      const next = ctx.bars[i + 1];
      return { ...s, peek: next && Number.isFinite(next.close) ? next.close : null };
    },
  });
  const ok = causalCompare(lc.adapter, lc.reference, securities());
  const bad = causalCompare(peeking, lc.reference, securities());
  assert.deepEqual(ok.diffs, []);
  assert.ok(bad.diffs.length > 0, 'der absichtliche Blick in die Zukunft bleibt unerkannt');
  // Gegenprobe Minervini: eine Setup-Funktion, die den Folgebalken liest, wird erkannt
  const peekSepa = (sec, i) => { const s = sepaSetupAt(sec, i); return s ? { ...s, peek: sec.bars[i + 1]?.close ?? null } : { peek: sec.bars[i + 1]?.close ?? null }; };
  const sec = securities()[0], i = 200;
  assert.notEqual(norm(peekSepa(sec, i)), norm(peekSepa(prefixOf(sec, i), i)));
});
