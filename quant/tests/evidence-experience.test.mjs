/* Evidence Experience (evidence-language-1.0.0): die Oberflaeche uebersetzt
   gemessene Evidenz in Alltagssprache - nie eine nackte Trefferquote, die
   Edge-Sprache folgt der versionierten Methodik, Vertrauen als Checkliste,
   drei Evidenzstufen getrennt. Die Methodik-Datei ist die Quelle; der Code
   spiegelt sie und darf nicht abweichen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const VMODEL = require("../app/view-model.js");

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const METHOD = JSON.parse(read("quant/methodology/evidence-language-v1.json"));

/* Kleine DOM-Attrappe: genug fuer el(), Text und Klassen. */
function node(tag, attrs, kids) {
  const n = { tag, attrs: attrs || {}, children: [], checked: false, listeners: {}, _text: (attrs && attrs.text) || "" };
  n.addEventListener = (k, f) => { n.listeners[k] = f; };
  Object.defineProperty(n, "textContent", { get: () => n._text, set: (v) => { n._text = v; } });
  [].concat(kids || []).forEach((k) => { if (k != null && k !== false) n.children.push(k); });
  return n;
}
const text = (n) => (n == null ? "" : typeof n === "string" ? n : [n._text, ...n.children.map(text)].join(" ")).replace(/\s+/g, " ").trim();
const all = (n, pred, out = []) => { if (n && typeof n === "object") { if (pred(n)) out.push(n); n.children.forEach((c) => all(c, pred, out)); } return out; };
const cls = (n) => String(n.attrs.class || "");

function load(store = {}) {
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const sandbox = { QX: { el: node, dateDe: (d) => d }, localStorage: ls, VUQuantViewModel: VMODEL };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("quant/app/page-evidence.js").replace(/\}\)\(typeof window !== "undefined" \? window : globalThis\);\s*$/, "})(globalThis);"), sandbox);
  return { E: sandbox.QXEvidence, store };
}
const { E } = load();

const study = (over) => ({ state: "AVAILABLE", trust: "LIMITED", n: 4200, effectiveN: 61, positiveShare: 0.612, basePositiveShare: 0.598,
  deltaPositiveShare: 0.014, deltaCi: [0.004, 0.024], edgeOutOfSample: false, median: 0.031, typicalDrawdown: -0.14, returnType: "TOTAL_RETURN",
  openChecks: ["oos", "survivorship"], checkedIds: ["benchmark", "independence", "lookahead", "oos", "returnBasis", "sample", "survivorship"], ...over });

test("Edge-Sprache: Schwellen und Woerter kommen aus der Methodik", () => {
  assert.equal(E.LANGUAGE_VERSION, METHOD.methodologyVersion);
  assert.deepEqual({ ...E.EDGE_THRESHOLDS_PP }, METHOD.edge.thresholdsPp);
  for (const c of METHOD.edge.classes) assert.equal(E.EDGE[c.id].label, c.label, c.id);
  assert.deepEqual(Object.keys(E.EDGE).sort(), METHOD.edge.classes.map((c) => c.id).sort());
});

test("Edge-Klasse: erst das Band, dann die Groesse", () => {
  const at = (d, lo, hi) => E.edgeOf({ deltaPositiveShare: d, deltaCi: [lo, hi] }).id;
  assert.equal(at(-0.02, -0.03, -0.001), "WEAKER");
  assert.equal(at(0.08, -0.01, 0.17), "NONE", "grosse Differenz mit Band ueber 0 ist kein Vorteil");
  assert.equal(at(0.014, 0.004, 0.024), "SMALL");
  assert.equal(at(0.02, 0.01, 0.03), "MODERATE", "2 Pp ist die Untergrenze von moderat");
  assert.equal(at(0.049, 0.01, 0.08), "MODERATE");
  assert.equal(at(0.05, 0.01, 0.09), "CLEAR");
  assert.equal(E.edgeOf({ deltaPositiveShare: 0.05 }).id, "UNKNOWN", "ohne Band keine Edge-Aussage");
  assert.equal(E.edgeOf(null).id, "UNKNOWN");
});

test("Out-of-Sample-Vorbehalt steht neben dem Vorteil und hebt ihn nie an", () => {
  const s = E.edgeSentence(study());
  assert.match(s, /^Kleiner historischer Vorteil – der Unterschied ist in neueren Daten nicht eindeutig\.$/);
  assert.equal(E.edgeOf(study({ edgeOutOfSample: true })).id, "SMALL");
  assert.doesNotMatch(E.edgeSentence(study({ deltaCi: [-0.01, 0.03] })), /neueren Daten/, "kein Vorbehalt an 'kein Vorteil'");
});

test("Vertrauen: Saetze und Checkliste spiegeln die Methodik", () => {
  for (const k of ["LIMITED", "NOT_READY", "USABLE", "ROBUST"]) assert.equal(E.TRUST_PLAIN[k], METHOD.trust[k], k);
  const ids = JSON.parse(JSON.stringify(E.CHECK_WORDS.map((c) => c[0])));
  assert.deepEqual(ids.sort(), Object.keys(METHOD.trust.checks).sort());
  for (const [id, pass, fail] of E.CHECK_WORDS) {
    assert.equal(pass, METHOD.trust.checks[id].pass, id + " pass");
    assert.equal(fail, METHOD.trust.checks[id].fail, id + " fail");
  }
});

test("Getestetes Signal: nie eine nackte Trefferquote", () => {
  for (const compact of [true, false]) {
    const n = E.signalEvidence(study(), { compact });
    const t = text(n);
    assert.match(t, /Historisch getestet/);
    assert.match(t, /61,2 %/, "Trefferquote");
    assert.match(t, /59,8 %/, "Base Rate daneben");
    assert.match(t, /\+1,4 Pp/, "Differenz daneben");
    assert.match(t, /eingeschränkt/, "Vertrauen daneben");
    assert.match(t, /Kleiner historischer Vorteil/);
    assert.equal(all(n, (x) => /(^| )q-ev-bar( |$)/.test(cls(x))).length, 2, "Signal und Markt als Balken");
    for (const code of ["LIMITED", "PARTIAL", "NOT_READY", "AVAILABLE", "deltaCi", "edgeOutOfSample", "undefined", "NaN"]) assert.ok(!t.includes(code), code + " als Text: " + t);
  }
  assert.equal(E.signalEvidence({ state: "UNAVAILABLE" }), null, "ohne freigegebene Studie keine Zahlen");
});

test("Vollansicht: Rohfaelle neben unabhaengigen, Rueckgang zuerst als Bedeutung, Frage in Alltagssprache", () => {
  const t = text(E.signalEvidence(study()));
  assert.match(t, /4\.200/); assert.match(t, /61/);
  assert.match(t, /Ist der Unterschied zum Markt auch in neueren Daten deutlich\? Nein/);
  assert.match(t, /fielen .*typischerweise um etwa 14 %/);
  assert.match(t, /mit Dividenden/);
  const first = t.split("Wie belastbar")[0];
  for (const term of ["Out-of-Sample", "OOS", "Walk", "Cluster", "Survivorship", "Return Basis", "Base Rate"]) assert.ok(!first.includes(term), term + " in der ersten Ebene: " + first);
});

test("Checkliste: Wichtigstes bestanden + alles Offene, Rest klappt auf", () => {
  const n = E.trustChecklist(study());
  const top = all(n, (x) => x.tag === "ul")[0];
  const items = top.children.map(text);
  assert.ok(items.some((t) => t.startsWith("✓ Dividenden sind berücksichtigt")));
  assert.ok(items.some((t) => t.startsWith("⚠ Die Richtung hat sich in neueren Daten nicht bestätigt")));
  assert.ok(items.some((t) => t.startsWith("⚠ Frühere verschwundene Unternehmen")));
  assert.ok(!items.some((t) => /Genug Fälle/.test(t)), "weitere bestandene Pruefungen stehen im Aufklapper");
  assert.match(text(all(n, (x) => x.tag === "details")[0]), /weitere Prüfungen bestanden/);
  assert.equal(all(E.trustChecklist(study({ checkedIds: undefined, openChecks: undefined })), (x) => x.tag === "ul").length, 0, "ohne Pruefliste keine erfundenen Haken");
});

test("Zertifiziert erscheint nur mit Status CERTIFIED", () => {
  assert.match(text(E.certifiedLine(null)), /Für dieses Signal liegt noch kein vollständig zertifizierter Backtest vor\./);
  assert.match(text(E.certifiedLine({ status: "LIMITED" })), /noch kein vollständig zertifizierter/);
  assert.match(text(E.certifiedLine({ status: "CERTIFIED" })), /Alle methodischen Prüfungen/);
});

test("Benachrichtigen: Auswahl je Aktie auf dem Geraet, ehrlich ohne Versand", () => {
  const { E: E2, store } = load();
  const panel = E2.alertPanel("NVDA");
  assert.match(text(panel), /Benachrichtige mich, wenn/);
  assert.match(text(panel), /noch nicht verschickt/);
  const boxes = all(panel, (x) => x.tag === "input");
  assert.deepEqual(boxes.map((b) => b.attrs.value), JSON.parse(JSON.stringify(E2.ALERT_CHOICES.map((c) => c.id))));
  const high = boxes.find((b) => b.attrs.value === "NEW_52W_HIGH"); high.checked = true; high.listeners.change();
  const edge = boxes.find((b) => b.attrs.value === "EDGE"); edge.checked = true; edge.listeners.change();
  assert.deepEqual(JSON.parse(store["vu.quant.alerts.v1"]), { NVDA: ["NEW_52W_HIGH", "EDGE"] });
  assert.equal(E2.alertMatch("NVDA", { eventType: "NEW_52W_HIGH" }), "Neues 52-Wochen-Hoch");
  assert.equal(E2.alertMatch("NVDA", { eventType: "TREND_UP", backtest: { state: "AVAILABLE", deltaCi: [0.001, 0.02] } }), "Neuer historischer Vorteil");
  assert.equal(E2.alertMatch("NVDA", { eventType: "TREND_UP", backtest: { state: "AVAILABLE", deltaCi: [-0.01, 0.02] } }), null, "kein Vorteil ohne Band ueber 0");
  assert.equal(E2.alertMatch("AAPL", { eventType: "NEW_52W_HIGH" }), null, "Auswahl gilt je Aktie");
  edge.checked = false; edge.listeners.change(); high.checked = false; high.listeners.change();
  assert.deepEqual(JSON.parse(store["vu.quant.alerts.v1"]), {});
  /* Jeder Ausloeser zeigt auf einen echten Ereignistyp des Radars. */
  const Radar = (await_import());
  const types = Radar.EVENT_TYPES.map((t) => t.id);
  for (const c of E2.ALERT_CHOICES) for (const t of c.types || (c.id === "EDGE" ? [] : [c.id])) assert.ok(types.includes(t), t);
});
function await_import() { const m = { exports: {} }; vm.runInNewContext(read("quant/engines/quant-radar.js"), { module: m, exports: m.exports, globalThis: {}, window: undefined }); return m.exports; }

test("Beobachtet: Evidenz-Verlauf je Aktie, kein Portfolio", () => {
  const { E: E3 } = load({ "vu.quant.alerts.v1": JSON.stringify({ DXPE: ["SETUP_CONFIRMED"] }) });
  const tr = { state: "AVAILABLE", current: "SETUP_FORMING", previous: "CONFIRMED", enteredAt: "2026-10-02", history: [["SETUP_WEAKENED", "down", "2026-10-02"], ["SETUP_CONFIRMED", "up", "2026-09-28"]],
    nextCondition: { label: "Setup bestätigt", open: 1, total: 5 }, events: [{ eventType: "NEW_52W_HIGH", backtest: study() }] };
  const t = text(E3.watchTimeline("DXPE", "DXP Enterprises", tr, "#/aktie/DXPE"));
  assert.match(t, /Jetzt/); assert.match(t, /Davor/); assert.match(t, /Als Nächstes/);
  assert.match(t, /\+1,4 Pp gegenüber dem Markt – Kleiner historischer Vorteil/);
  assert.match(t, /2026-09-28 .*passt zu deiner Benachrichtigung/);
  for (const w of ["Stückzahl", "Einstand", "Rendite deines", "Depotwert"]) assert.ok(!t.includes(w), w);
  assert.match(text(E3.watchTimeline("SPY", "SPY", { state: "UNAVAILABLE", reason: "NOT_IN_SETUP_UNIVERSE" }, "#")), /nicht im Setup-Universum/);
});

test("Aktienseite: Was geschah frueher? in drei getrennten Stufen", () => {
  const src = read("quant/app/page-stock.js");
  const a = src.indexOf("A · Diese Aktie selbst"), b = src.indexOf("B · Marktweit getestetes Signal"), c = src.indexOf("C · Zertifizierter Backtest");
  assert.ok(a > 0 && b > a && c > b, "A, B, C in dieser Reihenfolge");
  assert.match(src, /Beobachtet, nicht getestet/);
  assert.match(src, /historisch entwickelt hat, ist noch nicht getestet und nicht zertifiziert/, "Strategie passt != Strategie getestet");
  assert.match(src, /nicht mit den marktweiten Signal-Backtests vermischt/, "Setup-Evidenz getrennt von Signal-Backtests");
  assert.match(src, /alertPanel\(ticker\)/);
});

test("Backtesting-Seite beginnt mit 'Was ist hier bereits belastbar?'", () => {
  const src = read("quant/app/page-backtest.js");
  assert.match(src, /Was ist hier bereits belastbar\?/);
  for (const g of ["Historisch beobachtet", "Historisch getestet", "Zertifiziert"]) assert.ok(src.includes(g), g);
  assert.ok(src.indexOf("trustOverview(") < src.lastIndexOf("picks"), "Ueberblick vor den Einzelstudien");
});

test("Radar: Kennzahlen 'heute interessant' sind gezaehlt, Edge sortiert nicht", () => {
  const b = read("scripts/quant/build-quant-radar.mjs");
  for (const k of ["edgeTickers", "weakerEdgeTickers", "testedSignalTickers", "openChecks", "checkedIds"]) assert.ok(b.includes(k), k);
  const pages = read("quant/app/pages.js");
  assert.match(pages, /typeof sm\.edgeTickers === "number"/, "Kachel nur mit gemessener Zahl");
  assert.match(pages, /edgeSortNote/);
  const R = await_import();
  assert.ok(!JSON.stringify(R.PRIORITY_RULE).includes("delta"), "die Sortierregel kennt keine Edge");
});

test("Naechste Bedingung heisst naechste Stufe, nie die aktuelle", () => {
  const b = read("scripts/quant/build-quant-radar.mjs");
  const fn = b.slice(b.indexOf("function nextStep("), b.indexOf("/* ------------------------------------------------- Alert-Vertrag"));
  assert.match(fn, /Radar\.MATURITY\[r\.state\] \?\? -1\) > curRank/, "Regeln derselben Stufe sind kein naechster Schritt");
});
