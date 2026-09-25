/* Discover — Markets 3.0: die Markteinordnung konsumiert das Core-Artefakt
   und bestimmt selbst keinen Zustand. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const MP = require("../../quant/engines/multi-asset/market-pulse.js");
const PULSE = JSON.parse(readFileSync(new URL("../../quant/data/market/intelligence/market-pulse.json", import.meta.url), "utf8"));
const HIST = JSON.parse(readFileSync(new URL("../../quant/data/market/intelligence/market-pulse-history.json", import.meta.url), "utf8"));
const SRC = readFileSync(new URL("../ui/market-intelligence.js", import.meta.url), "utf8");

function load() {
  const el = (tag, attrs, kids) => {
    const n = { tag, attrs: attrs || {}, children: (kids || []).filter(Boolean) };
    n.appendChild = (c) => { n.children.push(c); return c; };
    return n;
  };
  const ctx = { QuantShell: { el, clear: () => {} }, VUMarketPulse: MP, Intl, Date, Math, String, Object, Array, JSON, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx.VUDiscover.MarketIntelligence;
}
const MI = load();
const J = (x) => JSON.parse(JSON.stringify(x));
function text(n) { if (!n) return ""; if (typeof n === "string") return n; return [n.attrs && n.attrs.text, n.text, ...(n.children || []).map(text)].filter(Boolean).join(" "); }
function find(n, pred, out = []) { if (!n || typeof n !== "object") return out; if (pred(n)) out.push(n); (n.children || []).forEach((c) => find(c, pred, out)); return out; }
const cls = (c) => (n) => n.attrs && typeof n.attrs.class === "string" && n.attrs.class.split(" ").includes(c);
const JETZT = new Date("2026-09-25T10:40:00Z");

test("Naechste Neubewertung: naechster Planlauf (alle 3 h zur Minute 20 UTC), nie in der Vergangenheit", () => {
  const sch = { everyHours: 3, minuteUtc: 20 };
  assert.equal(MI.naechsteBewertung(sch, new Date("2026-09-25T10:40:00Z")).toISOString(), "2026-09-25T12:20:00.000Z");
  assert.equal(MI.naechsteBewertung(sch, new Date("2026-09-25T12:20:00Z")).toISOString(), "2026-09-25T15:20:00.000Z");
  assert.equal(MI.naechsteBewertung(sch, new Date("2026-09-25T23:50:00Z")).toISOString(), "2026-09-26T00:20:00.000Z");
  assert.equal(MI.naechsteBewertung(null, JETZT), null);
});

test("Bewertungszyklus: 'ca.', kein Sekundenzaehler, ausgebliebener Lauf wird gesagt", () => {
  const p = { evaluation: { generatedAt: "2026-09-25T09:37:00Z", schedule: { everyHours: 3, minuteUtc: 20 } } };
  const z = MI.zyklusText(p, JETZT);
  assert.match(z.text, /Letzte Neubewertung 25\.09\., 11:37 Uhr · nächste planmäßig ca\. 14:20 Uhr/);
  assert.doesNotMatch(z.text, /\d{2}:\d{2}:\d{2}/);
  assert.equal(z.verspaetet, false);
  const alt = MI.zyklusText(p, new Date("2026-09-25T17:00:00Z"));
  assert.equal(alt.verspaetet, true);
  assert.match(alt.hinweis, /ausgeblieben/);
});

test("Hero: Zustand, Hauptaussage, Bedeutung fuer Anleger, Veraenderung - alles aus dem Artefakt", () => {
  const h = MI.hero(PULSE, JETZT);
  const t = text(h);
  assert.equal(h.attrs["data-environment"], PULSE.environment.state);
  assert.ok(t.includes(PULSE.environment.label));
  assert.ok(t.includes(PULSE.environment.statement));
  assert.ok(t.includes(PULSE.environment.investor));
  assert.ok(t.includes(PULSE.comparison.biggest.text));
  assert.match(t, /keine Anlageberatung/);
  assert.doesNotMatch(t, /\d+\s*\/\s*100|Score/);
  assert.equal(find(h, cls("dx-m3-stufe")).length, 5, "fuenf Stufen, eine aktiv");
  assert.equal(find(h, cls("is-aktiv")).length, 1);
});

test("Hero fail closed: ohne Einordnung keine erfundene Aussage", () => {
  const h = MI.hero({ ...PULSE, environment: { level: null, statement: "Das Marktumfeld ist gerade nicht bestimmbar." } }, JETZT);
  assert.match(text(h), /Nicht bestimmbar/);
  assert.doesNotMatch(text(h), /Für Anleger/);
});

test("Fuenf Dimensionen: eine Zeile je Dimension mit Skala, Belegen, Methodik; veraltete Breite sichtbar", () => {
  const k = MI.landkarte(PULSE);
  const dims = find(k, cls("dx-m3-dim"));
  assert.deepEqual(J(dims.map((d) => d.attrs["data-dimension"])), ["TREND", "BREADTH", "MOMENTUM", "RISK", "CROSS_ASSET"]);
  for (const d of dims) {
    assert.match(text(d), /Methodik/);
    assert.ok(find(d, cls("dx-m3-spur")).length === 1);
  }
  if (PULSE.dimensions.BREADTH.state === "NOT_CURRENT") {
    const b = dims.find((d) => d.attrs["data-dimension"] === "BREADTH");
    assert.ok(find(b, cls("is-alt")).length >= 1, "veraltete Breite als nicht aktuell gezeichnet");
    assert.doesNotMatch(text(b), /\d{4}-\d{2}-\d{2}/, "Datum lesbar, nicht ISO");
  }
});

test("Vorher/Jetzt, Warum, Worauf, Aendern: vollstaendig aus dem Artefakt, keine Empfehlung", () => {
  const all = [MI.vorherJetzt(PULSE), MI.warum(PULSE), MI.worauf(PULSE, {}), MI.bildAendern(PULSE, {})];
  for (const n of all) assert.ok(n, "Bereich vorhanden");
  const t = all.map(text).join(" ");
  assert.doesNotMatch(t, /\b(jetzt )?(kaufen|verkaufen)\b|Kaufsignal|sollten Sie/i);
  assert.ok(text(all[0]).includes(PULSE.comparison.biggest.text));
  assert.equal(find(all[2], cls("dx-m3-punkt-item")).length, PULSE.whatMatters.length);
  assert.equal(find(all[3], cls("dx-m3-aendern-spalte")).length, 2);
});

test("Verlauf, Breite, Cross Asset, Geschichten", () => {
  const v = MI.verlauf(HIST, PULSE);
  assert.ok(v && typeof v._zeichnen === "function");
  assert.deepEqual(J(MI.ZEITRAEUME.map((z) => z.id)), ["1W", "1M", "3M", "6M", "1Y"]);
  const b = MI.breite(PULSE, HIST);
  assert.equal(b.attrs["data-state"], PULSE.dimensions.BREADTH.state);
  if (PULSE.dimensions.BREADTH.state === "NOT_CURRENT") assert.match(text(b), /keine Einordnung/);
  const ca = MI.crossAsset(PULSE, {});
  assert.match(text(ca), /nicht, warum/);
  const items = [{ symbol: "DE10Y", group: "renditen", change: 10, ratio: 2.4, title: "Bund 10J", value: "+10 bp", evidence: "x", asOf: "2026-09-24", session: "CURRENT", direction: "neutral" },
                 { symbol: "DE2Y", group: "renditen", change: 7, ratio: 2.1, title: "Bund 2J", value: "+7 bp", evidence: "x", asOf: "2026-09-24", session: "CURRENT", direction: "neutral" }];
  const st = MI.stories(items, (x) => x);
  const s = find(st, cls("dx-m3-story"));
  assert.equal(s.length, 1);
  assert.match(text(s[0]), /Renditedruck nimmt zu/);
  assert.match(text(s[0]), /Warum relevant\?/);
  assert.equal(MI.stories([], (x) => x), null);
});

test("Keine Providerlogik, keine Zustandsberechnung in der Oberflaeche", () => {
  assert.doesNotMatch(SRC, /tiingo|fmp|fred|api\.|apikey|fetch\(/i);
  assert.doesNotMatch(SRC, /environmentLevel|seriesSignals|moveRatio/, "Zustaende kommen fertig aus dem Core");
});
