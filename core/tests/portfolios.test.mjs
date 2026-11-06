// Bereich /portfolios/ (Owner 06.11.2026): bündelt alle Musterdepots. Prüft das reine Modell gegen die
// committeten Artefakte der Erzeuger und die Pflichtangaben der Seite (Label, Hinweis, keine Backtest-Renditen,
// keine Kauf- oder Verkaufsaufforderung). Schreibt keine Datei.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
globalThis.VUUI = require(join(root, "assets/vu-ui.js"));
const P = require(join(root, "portfolios/portfolios.js"));
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const src = () => ({
  stPortfolio: read("supertrader/data/portfolio.json"),
  stTrend: read("supertrader/data/trend52.json"),
  stHouse: read("supertrader/data/ledger/VU_HOUSE_HS4_V03.json"),
  stRegistry: read("supertrader/data/registry-core.json"),
  quant: read("quant/data/product/model-depots-v1.json"),
  ki: existsSync(join(root, "quant/data/product/ki-depots-v1.json")) ? read("quant/data/product/ki-depots-v1.json") : null
});

test("PF-1 · Alle Depots: Supertrader je Methode, Trendfolge, Hausstrategie, fünf Quant-Profile, KI A und B", () => {
  const all = P.collect(src());
  const st = all.filter((d) => d.group === "supertrader"), q = all.filter((d) => d.group === "quant"), ki = all.filter((d) => d.group === "ki");
  for (const id of Object.keys(read("supertrader/data/portfolio.json").strategies)) assert.ok(st.some((d) => d.key === id), id);
  assert.ok(st.some((d) => d.id === "hausstrategie"));
  assert.ok(st.some((d) => d.key === "VU_TREND_52W"));
  assert.ok(st.some((d) => /Minervini/.test(d.name)));
  assert.equal(q.length, 5);
  assert.ok(q.some((d) => d.name === "Momentum Leader"));
  assert.deepEqual(ki.map((d) => d.id).sort(), ["a", "b"]);
  for (const d of all) {
    assert.ok(d.name && d.method, d.id + ": Name und Methode in einem Satz");
    assert.equal(new Set(all.filter((x) => x.group === d.group).map((x) => x.id)).size, all.filter((x) => x.group === d.group).length, "eindeutige Adressen");
  }
});

test("PF-2 · Positionen: Gewicht, Aufnahme, Aufnahmekurs; Veränderung = Schluss laut Export gegen Aufnahmekurs; Stopp nur bei Supertrader-Methoden", () => {
  const all = P.collect(src());
  const pf = read("supertrader/data/portfolio.json");
  const w = all.find((d) => d.key === "WEINSTEIN_STAGE"), raw = pf.strategies.WEINSTEIN_STAGE.positions;
  assert.equal(w.positions.length, raw.length);
  assert.ok(w.stops);
  const p = w.positions[0];
  assert.equal(p.stop, raw[0].stop);
  assert.ok(Math.abs(p.changePct - (raw[0].lastPrice / raw[0].entryPrice - 1) * 100) < 1e-9);
  const q = all.find((d) => d.id === "momentum-leader");
  assert.equal(q.stops, false);
  assert.ok(q.positions.every((x) => x.weight > 0 && x.since && x.entryPrice > 0));
  const house = all.find((d) => d.id === "hausstrategie");
  assert.ok(house.positions.every((x) => x.changePct === null && x.since), "Hausstrategie: keine Kurse im Ledger, keine erfundene Entwicklung");
});

test("PF-3 · Depot-Wertentwicklung nur, wenn der Export sie führt (Quant: PUBLISHED + nav; Supertrader: nie)", () => {
  const s = src(), all = P.collect(s);
  assert.ok(all.filter((d) => d.group === "supertrader").every((d) => d.perf === null));
  const pub = s.quant.performance && s.quant.performance.state === "PUBLISHED";
  for (const d of all.filter((x) => x.group === "quant")) assert.equal(!!d.perf, pub, d.id);
  const hidden = JSON.parse(JSON.stringify(s.quant)); hidden.performance.state = "PENDING";
  assert.ok(P.fromQuant(hidden).every((d) => d.perf === null && d.positions.every((p) => p.changePct === null)));
  assert.deepEqual(P.fromQuant({ schemaVersion: "x" }), []);
});

test("PF-4 · KI-Depots (Schema ki-depots-1.0.0, Edge 2): ohne Export oder ohne Einstiegskurs die Startkachel, sonst Bestand, Begründung und Vorwärtswert", () => {
  const none = P.fromKi(null);
  assert.ok(none.every((d) => d.pending && d.liveSince === "2026-11-06" && d.positions.length === 0));
  assert.match(P.render(none, "#/ki"), /startet am 06\.11\.2026, erste Werte folgen/);
  const base = { schemaVersion: "ki-depots-1.0.0", label: P.LABEL, recommendation: false, liveStart: "2026-11-06", asOf: "2026-11-06" };
  const waiting = P.fromKi({ ...base, depots: [{ id: "EDGE2-KI-B-PAPER", slug: "b", name: "KI-Depot B", method: "Mit News und Analysten.", rule: "Regel.", positions: [], cashWeight: 1,
    pending: { decisionDate: "2026-11-05", entry: "Schluss des nächsten Handelstags", positions: [{ ticker: "NVDA", name: "NVIDIA", targetWeight: 0.1, reason: "Umsatz wächst laut letztem Bericht.", reasonNeutralized: true, news: [{ date: "2026-11-04", title: "Bericht", source: "Reuters", url: "https://example.com/a" }] }] },
    performance: { start: null, index: [], changeSinceStart: null }, protocol: [] }] });
  assert.equal(waiting[0].id, "b");
  assert.equal(waiting[0].pending, true);
  const w = P.render(waiting, "#/ki/b");
  assert.match(w, /startet am 06\.11\.2026/);
  assert.match(w, /Zielgewicht/);
  assert.match(w, /Begründung laut Methode:<\/b> Umsatz wächst laut letztem Bericht\./);
  assert.match(w, /Angabe Dritter/);
  assert.match(w, /sprachlich neutralisiert/);
  const live = P.fromKi({ ...base, asOf: "2026-11-07", depots: [{ id: "EDGE2-KI-B-PAPER", slug: "b", name: "KI-Depot B", method: "Mit News und Analysten.", pending: null,
    positions: [{ ticker: "NVDA", name: "NVIDIA", targetWeight: 0.1, currentWeight: 0.098, since: "2026-11-06", entryPrice: 100, lastPrice: 95, lastDate: "2026-11-07", changeSinceEntry: -0.05, reason: "Umsatz wächst.", news: [] }],
    performance: { start: "2026-11-06", index: [["2026-11-06", 100], ["2026-11-07", 101.2]], changeSinceStart: 0.012 },
    protocol: [{ date: "2026-11-06", action: "REIN", ticker: "NVDA", weight: 0.1, price: 100 }, { date: "2026-11-06", action: "OHNE_KURS", ticker: "XYZ", weight: 0.05, price: null }] }] });
  const [b] = live;
  assert.equal(b.pending, false);
  assert.ok(Math.abs(b.perf.pct - 1.2) < 1e-9);
  assert.equal(b.positions[0].weight, 0.098);
  assert.ok(Math.abs(b.positions[0].changePct + 5) < 1e-9);
  const d = P.render(live, "#/ki/b");
  assert.match(d, /vu-chg--down/);
  assert.match(d, /ohne Einstiegskurs/);
  assert.equal(P.validKi({ ...base, depots: [], recommendation: true }), false);
});

test("PF-5 · Jede Ansicht trägt Label und Hinweis-Baustein, keine Backtest-Rendite, keine Kauf- oder Verkaufsaufforderung", () => {
  const all = P.collect(src());
  const routes = ["#/", "#/supertrader", "#/quant", "#/ki"].concat(all.map((d) => "#/" + d.group + "/" + d.id));
  for (const r of routes) {
    const html = P.render(all, r);
    assert.match(html, /Rechenmodell, kein echtes Geld/, r);
    assert.match(html, /Keine Anlageberatung, keine Empfehlung/, r);
    const text = html.replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(text, /\b(jetzt )?(kaufen|verkaufen)\b|Kaufsignal|Verkaufssignal|Kaufempfehlung|Kaufzone|Kursziel erreicht/i, r);
    assert.doesNotMatch(text, /Backtest-Rendite|CAGR|Rendite p\. ?a\./i, r);
  }
  // Pflicht-Hinweis modelPortfolio kommt aus legal-notices.json (über VUUI.legal, sichtbar mit der Rechtsfreigabe)
  assert.match(readFileSync(join(root, "portfolios/portfolios.js"), "utf8"), /U\.legal\("modelPortfolio"\)/);
  assert.ok(read("assets/legal-notices.json").notices.modelPortfolio.text);
});

test("PF-6 · Adressen, Protokoll und Seite", () => {
  assert.deepEqual(P.parseRoute("#/quant/momentum-leader"), { group: "quant", id: "momentum-leader", unknown: false });
  assert.deepEqual(P.parseRoute("#/"), { group: null, id: null, unknown: false });
  assert.equal(P.parseRoute("#/xyz").unknown, true);
  const log = P.groupedLog({ protocol: [{ date: "2026-10-01", action: "REIN", ticker: "A" }, { date: "2026-11-01", action: "RAUS", ticker: "A" }, { date: "2026-11-01", action: "REIN", ticker: "B" }] });
  assert.deepEqual(log.map((g) => [g.date, g.rein.length, g.raus.length]), [["2026-11-01", 1, 1], ["2026-10-01", 1, 0]]);
  const all = P.collect(src());
  assert.match(P.render(all, "#/quant/gibt-es-nicht"), /Dieses Musterdepot gibt es nicht/);
  const html = readFileSync(join(root, "portfolios/index.html"), "utf8");
  for (const s of ["/assets/site-navigation.js", "/assets/vu-ui.js", "/assets/vu-ui.css", "/portfolios/portfolios.js"]) assert.ok(html.includes(s), s);
  // bestehende Seiten verlinken auf den neuen Bereich
  assert.match(readFileSync(join(root, "quant/musterdepots/depots.js"), "utf8"), /\/portfolios\//);
  assert.match(readFileSync(join(root, "supertrader/assets/st-redesign.js"), "utf8"), /\/portfolios\//);
});
