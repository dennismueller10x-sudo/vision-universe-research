/* =========================================================================
   QUANT FRONTEND REBUILD — VIEW MODEL (quant/app/view-model.js)

   Die Produktschicht zwischen Engine und Oberflaeche. Geprueft wird gegen
   ECHTE veroeffentlichte Artefakte, gelesen ueber dieselben Product
   Services wie im Browser - nicht gegen erfundene Fixtures.

   NVDA_QUALITY_EXPLAINED: NVIDIA traegt bei Quality die Stufe "schwach".
   Das Audit (docs/VU_QUANT_FRONTEND_REBUILD.md) hat das nachgerechnet
   (Befund E: das Etikett "Unternehmensqualitaet" war zu breit). Diese
   Tests halten fest, dass die Oberflaeche
     - den Faktor mit dem benennt, was er misst,
     - die tragenden Komponenten nennt (stark UND schwach),
     - die fehlende Komponente ausweist,
     - nicht "angreifbare Bilanz" behauptet, wo die Bilanzkennzahlen stark sind,
     - und Stufen nicht als Marktanteile ("staerkste 10 %") ausgibt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VM = require("../app/view-model.js");
const Evidence = require("../engines/factor-evidence.js");
const PL = require("../engines/product-language.js");
const Services = require("../api/product-services.js");

const file = (url) => join(ROOT, url.replace(/^\//, ""));
const loadJSON = async (url) => { const p = file(url); if (!existsSync(p)) throw Object.assign(new Error("404 " + url), { status: 404 }); return JSON.parse(readFileSync(p, "utf8")); };
const loadCompressedJSON = async (url) => { const p = file(url); if (!existsSync(p)) throw Object.assign(new Error("404 " + url), { status: 404 }); return JSON.parse(gunzipSync(readFileSync(p))); };
const api = Services.create({ loadJSON, loadCompressedJSON, displayPolicy: require("../engines/display-policy.js"), queryEngine: require("../engines/query.js") });
VM.useLanguage(PL);

async function stockVM(ticker, withDistribution) {
  const [factors, brief, setup, match, cases] = await Promise.all([
    api.getFactorEvidence(ticker), api.getIntelligenceBrief(ticker).catch(() => null), api.getSetupObservation(ticker).catch(() => null),
    api.getStrategyMatch(ticker).catch(() => null), api.getHistoricalCases(ticker).catch(() => null)]);
  let distribution = null;
  if (withDistribution) {
    const s = await api.getFactorEvidenceScreening();
    distribution = {};
    VM.ORDER.forEach((id) => { distribution[id] = s.rows.map((r) => r["quantV2.factorEvidence." + id]).filter(Number.isFinite).sort((a, b) => a - b); });
  }
  return { vm: VM.stock({ ticker, factors, brief, setup, match, cases, distribution }), factors };
}

test("VM1 · die Stufengrenzen sind die der Engine, nicht eigene", () => {
  for (const b of VM.BAND_ORDER) {
    const probe = VM.BAND_MIN[b];
    assert.equal(VM.band(probe), Evidence.bandForPosition(probe).id, "Grenze " + b + " weicht von factor-evidence.js ab");
    if (probe > 0) assert.equal(VM.band(probe - 0.01), Evidence.bandForPosition(probe - 0.01).id, "knapp unter " + b);
  }
  assert.equal(VM.BAND_SEMANTICS_VERSION, Evidence.BAND_SEMANTICS_VERSION);
  /* Dieselbe Zaehlung der Position wie die Engine. */
  const werte = Array.from({ length: 333 }, (_, i) => Math.round(((i * 37) % 101) * 10) / 10).sort((a, b) => a - b);
  for (const v of [0, 12.3, 50, 50.5, 88, 100, 101]) assert.equal(VM.positionIn(werte, v), Evidence.positionOf(werte, v), "Position " + v);
});

test("VM2 · NVDA_QUALITY_EXPLAINED: Faktorname, tragende Komponenten und Luecke", async () => {
  const { vm } = await stockVM("NVDA", true);
  const q = vm.factors.find((f) => f.id === "quality");
  assert.equal(q.name, "Bilanz- & Ergebnisqualität", "der Faktor heisst nach dem, was er misst");
  assert.notEqual(q.name, "Unternehmensqualität");
  assert.match(q.notMeasures, /Profitabilität/, "es muss gesagt werden, was der Faktor NICHT misst");
  if (q.state === "AVAILABLE" && q.tone === "bad") {
    assert.ok(q.drivers.down.length >= 1, "eine schwache Einordnung braucht eine schwache Komponente als Grund");
    assert.match(q.why, /Schwach: /);
    /* Bei NVDA sind die Bilanzkennzahlen stark - die Begruendung muss sie nennen. */
    if (q.drivers.up.length) assert.match(q.why, /Stark: /);
    assert.doesNotMatch(q.why + JSON.stringify(vm.proCon), /angreifbare Bilanz|Finanziell angreifbar/,
      "eine pauschale Bilanz-Aussage widerspraeche den starken Bilanzkomponenten");
  }
  /* Jede Komponente fuehrt bis zu den Rohdaten - oder sagt, warum nicht. */
  for (const c of q.components) {
    if (c.state === "AVAILABLE") { assert.ok(c.value, c.id + " ohne Rohwert"); assert.ok(c.input, c.id + " ohne Formel"); assert.ok(c.weightText, c.id + " ohne Gewicht"); }
    else assert.ok(c.missing && !/[A-Z_]{6,}/.test(c.missing), c.id + ": fehlende Komponente ohne Klartext");
  }
  assert.ok(q.coverageText, "Datenabdeckung muss genannt werden");
  /* Die Position im Markt ist gezaehlt, nicht aus der Stufe abgeleitet. */
  if (q.state === "AVAILABLE") { assert.ok(q.rank && q.rank.total > 100); assert.match(q.rankText, /^Höher als bei \d+ % der [\d.]+ bewerteten Aktien\.$/); }
});

test("VM3 · Stufe und Position sind eine Aussage (factor-band-2.0.0)", async () => {
  for (const t of ["NVDA", "AAPL", "JPM"]) {
    const { vm } = await stockVM(t, true);
    for (const f of vm.factors.filter((x) => x.state === "AVAILABLE")) {
      assert.ok(typeof f.position === "number", t + " " + f.id + ": verfuegbarer Faktor ohne Position");
      assert.equal(f.band, VM.band(f.position), t + " " + f.id + ": Stufe passt nicht zur Position");
      assert.equal(Math.floor(f.position), Number(f.rankText.match(/(\d+) %/)[1]), t + " " + f.id + ": angezeigte Position weicht ab");
    }
  }
});

test("VM4 · Bedeutung und Zahl stehen zusammen", () => {
  /* Wert (Zahl) und Stufe (aus der Position) - die Stufe kommt nie aus der Zahl. */
  assert.equal(VM.factorLabel("momentum", 82.4, 86), "Stark (82)");
  assert.equal(VM.factorLabel("value", 58.2, 60), "Durchschnittlich (58)");
  assert.equal(VM.factorLabel("risk", 83.2, 80), "Niedrig (83)");
  assert.equal(VM.factorLabel("value", 20, 5), "Sehr teuer (20)");
  assert.equal(VM.factorLabel("quality", 68, 91), "Sehr stark (68)", "68 reicht bei Quality fuer die stärksten 10 %");
  assert.equal(VM.factorLabel("quality", 68, null), "Wert 68", "ohne Position keine Stufe");
  assert.equal(VM.factorLabel("quality", null), null);
});

test("VM5 · die Einordnung ist die Regel von plain-verdict, keine zweite", async () => {
  const PV = require("../engines/plain-verdict.js");
  for (const t of ["NVDA", "AAPL", "JPM", "T"]) {
    const { vm, factors } = await stockVM(t);
    if (vm.factorState !== "AVAILABLE") continue;
    const u = PV.urteil(factors);
    if (vm.overall.rated >= 3) assert.equal(vm.overall.id, u.stufeId, t);
    assert.equal(vm.overall.rated, u.bewertet, t + ": Nenner = bewertete Faktoren");
  }
});

test("VM6 · Strategy Match: 'passt' nur, wenn nichts verletzt oder offen ist", async () => {
  for (const t of ["NVDA", "MSFT", "JPM"]) {
    const { vm } = await stockVM(t);
    const s = vm.strategy;
    if (s.state !== "AVAILABLE") continue;
    /* Drei Faelle: alles erfuellt -> "passt"; gute Uebereinstimmung mit
       Offenem -> "am ehesten"; darunter -> "zu keinem Stil passt gut". */
    if (!s.best.notMet.length && !s.best.open.length) assert.match(s.sentence, /^Passt aktuell zu/, t);
    else if (s.good) assert.match(s.sentence, /^Am ehesten passt/, t);
    else assert.match(s.sentence, /^Zu keinem Anlagestil passt dieser Titel derzeit gut\. Am nächsten kommt /, t);
    assert.ok(!/^Passt aktuell/.test(s.sentence) || (!s.best.notMet.length && !s.best.open.length), t + ": 'passt' trotz verletzter oder offener Bedingung");
    for (const c of [...s.best.met, ...s.best.notMet, ...s.best.open]) assert.doesNotMatch(c.label, /Quant V2/, "interner Namensraum im Label");
  }
});

test("VM7 · Historical Replay: unter der Mindestzahl kein Median, nie eine Prognose", async () => {
  for (const t of ["NVDA", "AAPL", "KO", "JPM"]) {
    const { vm } = await stockVM(t);
    const lv = vm.replay.levels.find((l) => l.id === "SAME_STOCK");
    for (const h of lv.horizons || []) if (!h.sufficient) assert.equal(h.median, null, t + " " + h.id + ": Median trotz zu weniger Faelle");
    if (lv.state === "INSUFFICIENT") assert.match(lv.text, /Zu wenige historische Vergleichsfälle/);
    const words = JSON.stringify(vm.replay);
    assert.doesNotMatch(words, /wird steigen|wird fallen|erwarten wir|Kursziel von|(?<!keine )Prognose:/i, t);
    assert.match(vm.replay.isNot, /keine Prognose/);
  }
});

test("VM8 · Setup beantwortet Wo / Warum / Was als Naechstes / Was macht es ungueltig", async () => {
  const { vm } = await stockVM("NVDA");
  const s = vm.setup;
  if (s.state === "UNAVAILABLE") return;
  assert.ok(s.label && s.where && s.why, "Wo und Warum");
  assert.ok(s.next && s.next.text, "Was als Naechstes");
  assert.ok(s.invalidation && s.invalidation.text, "Was macht es ungueltig");
  for (const c of [...(s.next.conditions || []), ...(s.invalidation.conditions || [])]) {
    assert.doesNotMatch(c.label, /^technical[A-Z]/, "Feldname statt Nutzerbegriff: " + c.label);
    assert.doesNotMatch(String(c.demand || "") + String(c.value || ""), /[A-Z]{3,}_[A-Z]/, "roher Enum-Wert: " + c.demand + " " + c.value);
  }
});

test("VM9 · Gruende fuer fehlende Auswertungen: Satz mit Zahl, nie ein Code", () => {
  assert.equal(VM.technicalReasonText({ reason: "INSUFFICIENT_HISTORY", bars: 116, requiredBars: 252 }),
    "Diese Auswertung benötigt 252 Handelstage; für diesen Titel liegen 116 vor.");
  assert.equal(VM.patternReasonText({ reason: "INSUFFICIENT_WEEKLY_HISTORY", weeks: 103, requiredWeeks: 104 }),
    "Dieser Vergleich braucht 104 Wochen Kurshistorie; für diesen Titel liegen 103 vor.");
  assert.equal(VM.technicalReasonText({ reason: "TECHNICAL_CONTRACT_FOO" }), VM.TECHNICAL_REASON.TECHNICAL_PARTIAL());
  assert.equal(VM.technicalReasonText({ reason: "UNKNOWN_CODE" }), null, "ein unbekannter Code wird nicht als Satz ausgegeben");
  assert.equal(VM.gapSentence({ required: 252, available: 116 }), "Für diese Analyse werden 252 Handelstage benötigt; vorhanden sind 116.");
  for (const code of Object.keys(VM.REASON)) assert.doesNotMatch(VM.reasonText(code), /[A-Z]{4,}_[A-Z]/, code);
  assert.match(VM.analysisLagText({ lagSessions: 1, analysisAsOf: "2026-09-28", priceAsOf: "2026-09-29" }), /einen Handelstag/);
  assert.equal(VM.analysisLagText({ lagSessions: 0 }), null);
});

test("VM10 · Veraenderung: Richtung als Satz, Zustaende nicht als Veraenderung ausgegeben", async () => {
  const { vm } = await stockVM("NVDA");
  const c = vm.change;
  if (c.state !== "AVAILABLE") return;
  for (const i of c.items) {
    assert.ok(i.text && !/IMPROVING|DETERIORATING|STABLE/.test(i.text), i.id);
    if (i.id === "trendStructure") assert.doesNotMatch(i.text, /verbessert/, "Trendstruktur ist ein Zustand, keine Veraenderung");
  }
  for (const o of c.open) assert.doesNotMatch(o.text, /[A-Z]{4,}_[A-Z]/);
});

test("VM11 · gezaehlte Position und Verteilung", () => {
  const sorted = [10, 20, 30, 40, 50];
  assert.deepEqual(VM.rankIn(sorted, 30), { below: 2, total: 5, share: 0.5 });
  assert.equal(VM.rankIn([], 30), null);
  /* Stufen nach Position: 10 / 15 / 30 / 20 / 25 % - bei jeder Verteilung. */
  const werte = Array.from({ length: 201 }, (_, i) => 30 + i * 0.2).concat([NaN]);
  const d = VM.distributionOf(werte);
  assert.equal(d.n, 201);
  assert.deepEqual(d.bands, { VERY_STRONG: 21, STRONG: 30, NEUTRAL: 60, WEAK: 40, VERY_WEAK: 50 });
  assert.equal(d.cuts.VERY_STRONG, 30 + 180 * 0.2, "der kleinste Wert der stärksten 10 %");
  assert.deepEqual(VM.distributionOf([95, 80, 50]).bands, { VERY_STRONG: 0, STRONG: 0, NEUTRAL: 0, WEAK: 0, VERY_WEAK: 0 }, "unter 100 Werten keine Stufe");
});

test("VM12 · Identitaetskonflikt: beide Namen, Grund im Klartext, keine Entscheidung", () => {
  const n = VM.identityNote({ ticker: "AACI", name: "Armada Acquisition Corp. III", identityConflict: { kind: "D", alternativeName: "Armada Acquisition Corp I" } });
  assert.match(n.shown, /Armada Acquisition Corp\. III/); assert.match(n.shown, /Armada Acquisition Corp I/);
  assert.match(n.why, /Zahlwörter/); assert.match(n.why, /Wir entscheiden diese Frage nicht/);
  for (const k of ["D", "F", "G"]) assert.ok(VM.IDENTITY_REASON[k]);
  assert.equal(VM.identityNote({ ticker: "X" }), null);
});

test("VM13 · datenarmer Titel und Nicht-Aktie: keine Einordnung erfunden", async () => {
  const f = await api.getFactorEvidence("ZZZZZ");
  const vm = VM.stock({ ticker: "ZZZZZ", factors: f });
  assert.equal(vm.factorState, "UNAVAILABLE"); assert.equal(vm.overall, null); assert.deepEqual(vm.factors, []);
  assert.doesNotMatch(vm.factorReason, /[A-Z]{4,}_[A-Z]/);
});

test("VM14 · Zeitfenster in Alltagssprache", () => {
  assert.equal(VM.windowText("TTM"), "letzte 12 Monate");
  assert.equal(VM.windowText("latest filing"), "letzte Meldung");
  assert.equal(VM.windowText("unbekannt"), "unbekannt");
});
