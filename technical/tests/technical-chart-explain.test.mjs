/* „Chart erklären“ (technical/engine/chart-explain.js): sieben Schritte in Alltagssprache.
   Prueft je Schritt die Zweige, die Fibonacci-Regel an echten AAPL-Tagesbars, dass jede Zahl im Text
   aus der Eingabe stammt, und die Wortwahl (keine Empfehlung, kein Score). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CE = require("../engine/chart-explain.js");
const Canon = require("../../quant/engines/technical/canonical-bars.js");
const Ctx = require("../../quant/engines/technical/ti/context.js");
const Lv = require("../../quant/engines/technical/ti/levels.js");
const Dow = require("../../quant/engines/technical/ti/dow-trend.js");
const AAPL = require("../../quant/tests/fixtures/technical-reference-aapl.json");

function aaplCtx() {
  const rows = AAPL.date.map((d, i) => ({ date: d, open: AAPL.open[i], high: AAPL.high[i], low: AAPL.low[i], close: AAPL.close[i], volume: AAPL.volume[i] }));
  const s = Canon.fromRows(rows, { instrumentId: "AAPL", exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "test", sourceRevision: "fixture" });
  const prep = Ctx.prepare(s), t = s.length - 1;
  return { s, t, ctx: Ctx.at(prep, t) };
}
const base = { close: 100, sma200: 90, sma200Past: 88, stage: { stage: 2 }, rsRank: 82.4,
  support: { zoneLow: 95, zoneHigh: 97, kinds: ["SWING_LOW"], touches: 2 }, resistance: { zoneLow: 103, zoneHigh: 104, kinds: ["HIGH_52W"], touches: 0 },
  fib: { up: true, developing: true, from: { price: 80, time: "2026-07-01" }, to: { price: 110, time: "2026-10-15" }, levels: [{ ratio: 0.382, price: 98.54 }, { ratio: 0.5, price: 95 }, { ratio: 0.618, price: 91.46 }] },
  rsi: 63.2, formation: { name: "Dreieck aufsteigend", sentence: "Steigende Tiefs laufen gegen ein flaches Hoch.", direction: 1, confirmed: false } };
const by = (out) => Object.fromEntries(out.steps.map((s) => [s.id, { ...s, text: s.text.replace(/\u00a0/g, " ") }]));
const byRaw = (out) => Object.fromEntries(out.steps.map((s) => [s.id, s]));

test("sieben Schritte in fester Reihenfolge, je mit Titel, Satz, Erklärung, Ampel und Ebene", () => {
  const out = CE.explain(base);
  assert.deepEqual(out.steps.map((s) => s.id), ["richtung", "phase", "staerke", "zonen", "fibonacci", "schwung", "muster"]);
  assert.deepEqual(out.steps.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(out.steps.map((s) => s.layer), ["avg", "stage", null, "zones", "fib", null, "trend"]);
  for (const s of out.steps) {
    assert.ok(s.title && s.text && s.meaning, s.id);
    assert.ok(["strong", "mid", "weak", "none"].includes(s.tone), s.id);
  }
  assert.equal(out.headline, "Aufwärtstrend · besser als 82 von 100 Aktien · Kurs nah an der Decke");
  assert.match(out.note, /keine Vorhersage und keine Handlungsempfehlung/);
});

test("Richtung: Lage zur 200-Tage-Linie und ihre Steigung über 21 Handelstage", () => {
  assert.equal(by(CE.explain(base)).richtung.text, "Der Kurs liegt 11 % über der 200-Tage-Linie, und die Linie steigt. Das ist ein Aufwärtstrend.");
  assert.equal(by(CE.explain({ ...base, close: 80, sma200Past: 92 })).richtung.tone, "weak");
  assert.match(by(CE.explain({ ...base, close: 80, sma200Past: 92 })).richtung.text, /Linie fällt\. Das ist ein Abwärtstrend\./);
  assert.match(by(CE.explain({ ...base, sma200Past: 95 })).richtung.text, /Linie fällt noch\. Der Trend könnte drehen/);
  const kratzer = by(CE.explain({ ...base, close: 88 })).richtung;
  assert.equal(kratzer.tone, "mid"); assert.match(kratzer.text, /Kratzer/);
  const tief = by(CE.explain({ ...base, close: 72 })).richtung;
  assert.equal(tief.tone, "weak"); assert.match(tief.text, /deutlich angeschlagen/);
  assert.equal(by(CE.explain({ ...base, sma200: null })).richtung.tone, "none");
});

test("Phase: vier Phasen der 150-Tage-Linie, ohne Wert keine Aussage", () => {
  const tones = [1, 2, 3, 4].map((k) => by(CE.explain({ ...base, stage: { stage: k } })).phase);
  assert.deepEqual(tones.map((p) => p.tone), ["mid", "strong", "mid", "weak"]);
  tones.forEach((p, i) => assert.ok(p.text.startsWith("Phase " + (i + 1) + " von 4"), p.text));
  assert.equal(by(CE.explain({ ...base, stage: { stage: null } })).phase.tone, "none");
});

test("Stärke: RS-Rang als „besser/schlechter als N von 100 Aktien“", () => {
  assert.equal(by(CE.explain({ ...base, rsRank: 82.4 })).staerke.text, "In den letzten 6 Monaten lief die Aktie besser als 82 von 100 Aktien.");
  assert.equal(by(CE.explain({ ...base, rsRank: 27.6 })).staerke.text, "In den letzten 6 Monaten lief die Aktie schlechter als 72 von 100 Aktien.");
  assert.equal(by(CE.explain({ ...base, rsRank: 27.6 })).staerke.tone, "weak");
  assert.equal(by(CE.explain({ ...base, rsRank: 55 })).staerke.tone, "mid");
  assert.equal(by(CE.explain({ ...base, rsRank: null })).staerke.tone, "none");
});

test("Boden und Decke: Zonen mit Abstand, Jahreshoch ohne Berührung heißt so", () => {
  const z = by(CE.explain(base)).zonen;
  assert.match(z.text, /^Boden bei 95,00–97,00 \$ \(3,1 % unter dem Kurs\): Hier wurde der Kurs schon aufgefangen\./);
  assert.match(z.text, /Decke bei 103,00–104,00 \$ \(3,0 % über dem Kurs\): Hier liegt das Jahreshoch\./);
  assert.equal(by(CE.explain({ ...base, support: null, resistance: null })).zonen.text, "Gerade liegt keine klare Zone in der Nähe des Kurses.");
});

test("Fibonacci: Regel am letzten großen Schwung auf echten AAPL-Bars, Marken = fibOfSwing", () => {
  const { s, ctx } = aaplCtx();
  const f = CE.fibSwing(ctx, Lv);
  assert.equal(f.scale, "scale-3");
  const v = ctx.view("scale-3"), a = v.confirmed.at(-1), b = v.developing;
  assert.equal(f.from.price, a.pivotPrice); assert.equal(f.to.price, b.pivotPrice); assert.equal(f.developing, true);
  const ref = Lv.fibOfSwing(a.pivotPrice, b.pivotPrice, "x").filter((l) => l.kind === "RETRACEMENT" && [0.382, 0.5, 0.618].includes(l.ratio));
  assert.deepEqual(f.levels.map((l) => l.price), ref.map((l) => l.price));
  const step = by(CE.explain({ ...base, close: s.close.at(-1), fib: f })).fibonacci;
  assert.match(step.text, /^Der letzte große Anstieg ging von 196,00 \$ \(August 2024\) auf 260,10 \$ \(Dezember 2024\)\./);
  assert.match(step.meaning, /nicht öfter als knapp daneben/);
  assert.equal(step.tone, "none");
  assert.equal(CE.fibSwing({ view: () => null }, Lv), null);
  assert.equal(by(CE.explain({ ...base, fib: null })).fibonacci.tone, "none");
});

test("Fibonacci: Rückgang heißt Erholung, Anteil des Rückwegs im Satz", () => {
  const down = { up: false, from: { price: 200, time: "2026-09-01" }, to: { price: 100, time: "2026-11-01" }, levels: [{ ratio: 0.382, price: 138.2 }, { ratio: 0.5, price: 150 }, { ratio: 0.618, price: 161.8 }] };
  const t = by(CE.explain({ ...base, close: 120, fib: down })).fibonacci.text;
  assert.match(t, /letzte große Rückgang/); assert.match(t, /Marken für eine Erholung/); assert.match(t, /20 % des Rückgangs wieder aufgeholt/);
});

test("Weinstein-Phase an AAPL aus ti/dow-trend.js (keine eigene Rechnung)", () => {
  const { ctx } = aaplCtx();
  assert.equal(by(CE.explain({ ...base, stage: Dow.weinsteinStage(ctx) })).phase.text, "Phase 2 von 4: Anstieg. Der Kurs läuft über der steigenden 150-Tage-Linie.");
});

test("Schwung und Muster in Worten", () => {
  const sw = (r) => by(CE.explain({ ...base, rsi: r })).schwung;
  assert.match(sw(75).text, /„überkauft“/); assert.match(sw(60).text, /Guter Schwung/); assert.match(sw(50).text, /Ausgeglichen/);
  assert.match(sw(40).text, /eher gefallen/); assert.match(sw(25).text, /„überverkauft“/);
  assert.equal(by(CE.explain(base)).muster.text, "Dreieck aufsteigend (erkannt). Steigende Tiefs laufen gegen ein flaches Hoch. Laut Regel: deutet nach oben.");
  assert.equal(by(CE.explain({ ...base, formation: null })).muster.text, "Gerade ist kein Chartmuster aktiv. Das ist normal: Meistens gibt es keins.");
});

test("Wortwahl: keine Empfehlung, kein Kursziel, kein Score, du-Form", () => {
  const variants = [base, { ...base, close: 72, rsi: 25, rsRank: 10, stage: { stage: 4 } }, {}];
  const BANNED = /Kaufsignal|Verkaufssignal|\bkaufen\b|\bverkaufen\b|Kursziel|Rendite|Gewinn|empfehl(?!ung\.$)|garantiert|\bsicher\b|Score|Punkte|bullisch|bärisch|\bSignal\b/i;
  for (const v of variants) {
    const out = CE.explain(v);
    for (const s of out.steps) for (const t of [s.title, s.text, s.meaning]) {
      assert.doesNotMatch(t, BANNED, s.id + ": " + t);
      assert.doesNotMatch(t, /[\p{Ll},]\s+(Sie|Ihnen|Ihr|Ihre)\b/u, s.id + ": " + t);
    }
  }
});
