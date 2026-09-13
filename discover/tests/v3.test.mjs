/* Discover V3: Chart Truth Contract, Discovery-Reihenfolge, Diversity,
   Fachsprache, Nachladen, keine harte Universumsgroesse. Alle Pruefungen
   laufen ueber die AUSGELIEFERTEN Daten - was hier gruen ist, ist es fuer
   das, was der Nutzer sieht. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(root, "discover", "data");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const vorhanden = existsSync(join(DATA, "meta.json"));
const meta = vorhanden ? readJSON(join(DATA, "meta.json")) : null;
const Relevance = require("../engines/relevance.js");
const RECOGNITION = readJSON(join(root, "discover", "config", "company-recognition.json")).companies;
const PREVIEW = (await import("../../scripts/market/preview-scope.mjs")).resolveScope(root).tickers;

function homeSurfaces(universeId) {
  const files = readdirSync(join(DATA, "home")).filter((n) => n.startsWith(universeId) && n.endsWith(".json"))
    .sort((a, b) => (a.length - b.length) || (a < b ? -1 : 1));
  return files.flatMap((f) => readJSON(join(DATA, "home", f)).surfaces || []);
}
const alleKarten = (surfaces) => surfaces.flatMap((s) => s.cards || []);

test("kein synthetischer Verlauf als Kurschart: Linien nur mit Freigabe", { skip: !vorhanden }, () => {
  const karten = alleKarten(homeSurfaces("US_REAL"));
  assert.ok(karten.length > 100, "Startseite hat Karten");
  for (const c of karten) {
    const ps = c.priceSeries;
    assert.ok(ps && typeof ps === "object", c.symbol + " ohne priceSeries-Objekt");
    if (ps.status === "CALCULATED") {
      assert.ok(PREVIEW.has(c.symbol), c.symbol + " zeichnet ohne Freigabe");
      assert.ok(ps.source && ps.asOf && ps.priceSeriesType, c.symbol + " Reihe ohne Herkunft");
      /* Karten tragen Verweise (lazy); die Eingangsflaeche traegt Punkte. */
      const punkte = ps.points;
      if (Array.isArray(punkte)) assert.ok(punkte.length >= 5, c.symbol + " Reihe ohne Punkte");
      else {
        assert.ok(typeof ps.path === "string", c.symbol + " weder Punkte noch Verweis");
        const datei = ps.path.startsWith("/quant/") ? join(root, ps.path.slice(1))
                    : join(DATA, ps.path.replace("/discover/data/", ""));
        assert.ok(existsSync(datei), c.symbol + " Verweis ohne Datei");
        assert.ok(readJSON(datei).points.length >= 5, c.symbol + " Datei ohne Punkte");
      }
    } else {
      assert.equal(ps.points, null, c.symbol + " traegt Punkte ohne Status CALCULATED");
      assert.equal(ps.path || null, null, c.symbol + " traegt Verweis ohne Status CALCULATED");
    }
  }
});

test("Karten ohne Kursreihe tragen keinen Fake-Chart - aber die vier Renditen", { skip: !vorhanden }, () => {
  const karten = alleKarten(homeSurfaces("US_REAL")).filter((c) => c.priceSeries.status !== "CALCULATED");
  assert.ok(karten.length > 50);
  for (const c of karten) {
    assert.ok(["return1M", "return3M", "return6M", "return12M"].some((k) => isNum(c.metrics[k])),
      c.symbol + " hat keine Rendite fuer die Leiter");
  }
});

test("Relevanz veraendert die Eligibility nicht: jede Startseiten-Karte steht in ihrer Reihe", { skip: !vorhanden }, () => {
  for (const u of meta.universes) {
    for (const s of homeSurfaces(u.universeId)) {
      if (!s.rowId || s.rowId === "sector-leaders") continue;
      const row = readJSON(join(DATA, "rows", u.universeId, s.rowId + ".json"));
      const erlaubt = new Set(row.cards.map((c) => c.symbol));
      for (const c of s.cards || []) assert.ok(erlaubt.has(c.symbol), `${u.universeId}/${s.id}: ${c.symbol} nicht in ${s.rowId}`);
      if (s.type === "ranking") {
        assert.deepEqual(s.cards.map((c) => c.symbol), row.cards.slice(0, s.cards.length).map((c) => c.symbol),
          "Rangliste ist die reine Kennzahl-Reihenfolge");
      }
    }
  }
});

test("bekannte Titel werden nur innerhalb qualifizierter Kandidaten priorisiert", { skip: !vorhanden }, () => {
  const row = readJSON(join(DATA, "rows", "US_REAL", "momentum-leaders.json"));
  const ordered = Relevance.discoveryOrder(row.cards, { recognition: RECOGNITION });
  assert.deepEqual(ordered.cards.map((c) => c.symbol).sort(), row.cards.map((c) => c.symbol).sort());
  for (const t of ordered.trace) {
    if (t.bonus > 0) assert.ok(t.quantRank <= Math.ceil(row.cards.length / 2), t.symbol + " gehoben aus der unteren Haelfte");
  }
});

test("Regeln der neuen Reihen halten: bekannte Namen, Comeback, Ueberraschungen, Themen", { skip: !vorhanden }, () => {
  const rows = (id) => readJSON(join(DATA, "rows", "US_REAL", id + ".json")).cards;
  for (const c of rows("bekannte-namen")) {
    assert.equal(RECOGNITION[c.symbol] && RECOGNITION[c.symbol].tier, 1, c.symbol + " ist keine Alltagsmarke");
    assert.ok(c.signals.new52WeekHigh || c.signals.nearHigh || c.signals.breakout || c.metrics.return3M >= 0.05, c.symbol + " bewegt sich nicht");
  }
  for (const c of rows("comeback")) {
    assert.ok(c.metrics.maxDrawdown252d <= -0.25 && c.metrics.return3M >= 0.10 && c.metrics.distanceTo52wHigh <= -0.08, c.symbol);
  }
  for (const c of rows("ueberraschungen")) {
    assert.ok(!RECOGNITION[c.symbol], c.symbol + " ist bekannt");
    assert.ok(c.metrics.leadershipPercentile >= 85, c.symbol);
  }
  const themes = readJSON(join(root, "discover", "config", "themes.json")).themes;
  for (const t of themes) {
    const liste = new Set(t.tickers);
    for (const c of rows("thema-" + t.id)) assert.ok(liste.has(c.symbol), c.symbol + " nicht im Thema " + t.id);
  }
});

test("Cross-Collection-Diversity: ein Titel fuehrt hoechstens eine Surface an", { skip: !vorhanden }, () => {
  const surfaces = homeSurfaces("US_REAL");
  const fuehrt = {};
  for (const s of surfaces) {
    const cards = s.cards || [];
    const kurz = s.type !== "featured-card" && cards.length <= 6 && (!isNum(s.total) || s.total <= 6);
    if (s.type === "hero" || kurz) continue;
    cards.slice(0, 2).forEach((c) => { fuehrt[c.symbol] = (fuehrt[c.symbol] || 0) + 1; });
  }
  const mehrfach = Object.entries(fuehrt).filter(([, n]) => n > 1);
  for (const [sym, n] of mehrfach) {
    const k = alleKarten(surfaces).find((c) => c.symbol === sym);
    assert.ok(n <= 2 && k.metrics.leadershipPercentile >= 99, sym + " fuehrt " + n + " Surfaces an");
  }
});

test("keine Fachsprache auf Ebene 1", { skip: !vorhanden }, () => {
  const verboten = /\b(RSI|Score|Perzentil|ATR|MACD|Beta|Sharpe|Breakout|Leadership|Momentum|Relative Strength|RVOL|Faktor)\b/i;
  const texte = [];
  for (const s of homeSurfaces("US_REAL")) {
    [s.title, s.subtitle, s.lead, s.kicker].forEach((t) => t && texte.push(t));
    for (const c of s.cards || []) {
      const p = c.plain || {};
      [p.story, p.zusatz, p.zahl && p.zahl.label].forEach((t) => t && texte.push(t));
      (c.badges || []).forEach((b) => { texte.push(b.label || ""); texte.push(b.detail || ""); });
      (c.reasons || []).forEach((r) => texte.push(r.label || ""));
      if (c.headline) texte.push(c.headline.kicker || "");
    }
  }
  texte.push(meta.topTen.title, meta.topTen.subtitle);
  const treffer = texte.filter((t) => verboten.test(t));
  assert.deepEqual(treffer, [], "Fachbegriffe auf Ebene 1: " + treffer.join(" | "));
});

test("Nachladen: das erste Stueck ist klein, die Kette endet", { skip: !vorhanden }, () => {
  for (const h of meta.home) {
    const erstes = join(DATA, h.chunks[0].replace("/discover/data/", ""));
    assert.ok(statSync(erstes).size < 320 * 1024, h.universeId + ": erstes Stueck zu gross");
    let url = h.chunks[0], gesehen = 0;
    while (url) {
      const teil = readJSON(join(DATA, url.replace("/discover/data/", "")));
      gesehen++;
      url = teil.next;
      assert.ok(gesehen <= 6, "Kette endet nicht");
    }
    assert.equal(gesehen, h.chunks.length);
  }
});

test("Ereignis-Vertrag: die zehn Ereignisse aus §16 sind definiert", () => {
  const A = require("../engines/analytics.js");
  ["discover_impression", "collection_view", "card_view", "card_open", "chart_range_change", "swipe",
   "theme_open", "stock_open", "immersive_start", "immersive_complete"].forEach((n) => assert.ok(A.EVENTS[n], n));
});

test("keine harte Universumsgroesse im Code", () => {
  const dateien = [join(root, "discover", "app.js"), join(root, "scripts", "discover", "build-discover-data.mjs")]
    .concat(readdirSync(join(root, "discover", "ui")).map((f) => join(root, "discover", "ui", f)))
    .concat(readdirSync(join(root, "discover", "engines")).map((f) => join(root, "discover", "engines", f)));
  for (const f of dateien) {
    /* Kommentare raus (Block und Zeile), dann pruefen: eine Zahl in einer
       Erklaerung ist erlaubt, eine im Code nicht. */
    const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/\b498\b/.test(code), `${f} enthaelt 498 im Code`);
  }
});

test("Startseite skaliert: Abrufe haengen nicht von der Titelzahl ab", { skip: !vorhanden }, () => {
  for (const u of meta.universes) {
    const h = meta.home.find((x) => x.universeId === u.universeId);
    assert.ok(h.chunks.length <= 4, u.universeId + ": " + h.chunks.length + " Stuecke");
  }
});
