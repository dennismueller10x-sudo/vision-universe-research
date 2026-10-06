/* =========================================================================
   EINE AKTIENMETHODIK GILT FÜR AKTIEN.

   Gemessen am 28.09.2026: 136 Instrumente heißen ausdrücklich „... ETF" —
   Columbia AAA CLO ETF, VanEck Bitcoin ETF, Ishares 1-10 Year Treasury Bond
   ETF — und trugen COMMON_STOCK, weil der Anbieter für 7.801 von 7.803
   Zeilen `assetType = "Stock"` meldet. Sie standen im Aktienscreener (132),
   hatten eine Faktorzeile (136), davon 34 mit bewerteten Eigenschaften und
   9 mit einem „Börsenwert", der in Wahrheit das Nettovermögen eines Fonds
   ist.

   Owner-Entscheidung vom 28.09.2026: der ausdrückliche Name schlägt das
   unspezifische Anbieterfeld. Freigegeben ist ausschließlich „ETF" und
   „Exchange-Traded Fund".

   Was hier gehalten wird — nicht die Zahlen, sondern die Grenzen:
     1. Der ausdrückliche Name entscheidet, das mehrdeutige Wort nicht.
     2. Ein belegtes Nicht-Aktien-Papier bekommt KEINE Aktienaussage:
        keine Faktorzeile, keinen Börsenwert, keine Bewertung, keine
        Screening-Zeile, keinen Stiltreffer.
     3. Es bleibt im Instrumenten- und Suchuniversum, und die Seite sagt in
        Alltagssprache, warum die Aktienanalyse fehlt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Classification = require(join(ROOT, "quant/engines/instrument-classification.js"));
const FactorEvidence = require(join(ROOT, "quant/engines/factor-evidence.js"));
const Shape = require(join(ROOT, "quant/engines/journey-shape.js"));
const Brief = require(join(ROOT, "quant/engines/intelligence-brief.js"));
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

const EQUITY = new Set(["COMMON_STOCK", "ADR"]);
const EVIDENCE_BASIS = new Set(["SECURITY_NAME", "PROVIDER_ASSET_TYPE"]);

function instrumente() {
  const dir = join(ROOT, "quant/data/universe/instruments");
  if (!existsSync(dir)) return [];
  const alle = [];
  for (const datei of readdirSync(dir)) {
    if (!datei.endsWith(".json")) continue;
    alle.push(...(JSON.parse(readFileSync(join(dir, datei), "utf8")).instruments || []));
  }
  return alle;
}
const provenNonEquity = () => instrumente().filter((i) => !EQUITY.has(i.securityType) &&
  i.securityTypeConfidence === "HIGH" && EVIDENCE_BASIS.has(i.securityTypeBasis));

test("nur der ausdrueckliche Fondsmantel zaehlt - kein mehrdeutiges Wort", () => {
  const muster = Classification.EXPLICIT_FUND_WRAPPER;
  assert.ok(muster instanceof RegExp, "die Grenze ist kein Muster");
  /* Freigegeben. */
  for (const name of ["Columbia AAA CLO ETF", "VanEck Bitcoin ETF",
    "Simplify Exchange Traded Funds Barrier Income", "Some Exchange-Traded Fund"]) {
    assert.equal(muster.test(name), true, "nicht erkannt: " + name);
  }
  /* NICHT freigegeben - jedes davon trifft auch Aktien. */
  for (const name of ["American Assets Trust", "Altisource Portfolio Solutions",
    "Virtus Artificial Intelligence & Technology Opportunities Fund", "Bitwise 10 Crypto Index"]) {
    assert.equal(muster.test(name), false, "faelschlich erkannt: " + name);
  }
  /* Und die Klassifikation folgt dem: derselbe Name, einmal mit und einmal
     ohne den Mantel, ergibt zwei verschiedene Gattungen. */
  const mitMantel = Classification.classify({ ticker: "TEST", name: "Columbia AAA CLO ETF", assetType: "Stock", exchange: "NYSE" }, { today: "2026-09-28" });
  assert.equal(mitMantel.instrumentType, "ETF");
  assert.equal(mitMantel.confidence, "HIGH");
  assert.equal(mitMantel.typeBasis, "SECURITY_NAME");
  assert.equal(mitMantel.screenerEligible, false, "ein Fonds im Aktienscreener");
  const ohne = Classification.classify({ ticker: "TEST", name: "American Assets Trust", assetType: "Stock", exchange: "NYSE" }, { today: "2026-09-28" });
  assert.equal(ohne.instrumentType, "COMMON_STOCK", "ein REIT wurde umklassifiziert");
});

test("kein Titel mit ausdruecklichem ETF-Namen bleibt eine Aktie", () => {
  const alle = instrumente();
  if (!alle.length) return;
  const kandidaten = alle.filter((i) => i.companyName && Classification.EXPLICIT_FUND_WRAPPER.test(i.companyName));
  assert.ok(kandidaten.length > 50, "nur " + kandidaten.length + " Kandidaten - die Messung greift nicht");
  const nochAktie = kandidaten.filter((i) => EQUITY.has(i.securityType));
  assert.deepEqual(nochAktie.map((i) => i.symbol + " " + i.companyName).slice(0, 8), [],
    nochAktie.length + " von " + kandidaten.length + " tragen weiter eine Aktiengattung");
  /* Und sie bleiben im Instrumentenuniversum - die Entscheidung nimmt ihnen
     die Aktienanalyse, nicht ihre Existenz. */
  const imUniversum = kandidaten.filter((i) => i.productEligibility && i.productEligibility !== "EXCLUDED");
  assert.ok(imUniversum.length > kandidaten.length * 0.9,
    "nur " + imUniversum.length + " von " + kandidaten.length + " sind noch im Instrumentenuniversum");
});

test("ein belegtes Nicht-Aktien-Papier bekommt keine einzige Aktienaussage", () => {
  const fremd = provenNonEquity();
  if (!fremd.length) return;
  const set = new Set(fremd.map((i) => i.symbol));
  /* 1. Kein Platz im Aktienscreener. */
  const imScreener = fremd.filter((i) => i.screenerEligible);
  assert.deepEqual(imScreener.map((i) => i.symbol).slice(0, 8), [],
    imScreener.length + " belegte Nicht-Aktien im Aktienscreener");
  /* 2. Keine Faktorzeile, kein Boersenwert, keine Bewertung. */
  const dir = join(ROOT, "quant/data/product/factor-evidence-v1");
  if (existsSync(dir)) {
    const treffer = [];
    for (const datei of readdirSync(dir)) {
      if (!datei.endsWith(".json.gz") || datei === "screening.json.gz" || datei === "summary.json.gz") continue;
      const shard = JSON.parse(gunzipSync(readFileSync(join(dir, datei))).toString("utf8"));
      for (const ticker of Object.keys(shard.securities || {})) if (set.has(ticker)) treffer.push(ticker);
    }
    assert.deepEqual(treffer.slice(0, 8), [], treffer.length + " Faktorzeilen fuer Nicht-Aktien");
    /* 3. Keine Screening-Zeile - und damit kein Stiltreffer. */
    const screening = join(dir, "screening.json.gz");
    if (existsSync(screening)) {
      const payload = JSON.parse(gunzipSync(readFileSync(screening)).toString("utf8"));
      const drin = Object.keys(payload.rows || {}).filter((t) => set.has(t));
      assert.deepEqual(drin.slice(0, 8), [], drin.length + " Screening-Zeilen fuer Nicht-Aktien");
    }
  }
  const stil = join(ROOT, "quant/data/product/strategy-index-v1.json.gz");
  if (existsSync(stil)) {
    const index = JSON.parse(gunzipSync(readFileSync(stil)).toString("utf8"));
    const treffer = [];
    for (const profil of index.profiles || []) {
      for (const ticker of profil.tickers || []) if (set.has(ticker)) treffer.push(profil.profileId + ":" + ticker);
    }
    assert.deepEqual(treffer.slice(0, 8), [], treffer.length + " Stiltreffer fuer Nicht-Aktien");
  }
});

test("der Materialisierer nennt die Uebersprungenen mit Gattung und Beleg", () => {
  const pfad = join(ROOT, "quant/data/product/factor-evidence-v1/summary.json");
  if (!existsSync(pfad)) return;
  const s = JSON.parse(readFileSync(pfad, "utf8"));
  assert.ok(s.notAnEquityListing, "das Artefakt sagt nicht, wen es weggelassen hat");
  assert.equal(s.notAnEquityListing.reason, "NOT_AN_EQUITY_LISTING");
  assert.match(s.notAnEquityListing.decision, /2026-09-28/, "die Entscheidung ist nicht datiert");
  assert.ok(s.notAnEquityListing.count > 0);
  assert.equal(s.notAnEquityListing.count, s.counts.notAnEquityListing);
  assert.equal(s.notAnEquityListing.tickers.length, s.notAnEquityListing.count);
  /* Jede Gattung darin ist wirklich keine Aktie. */
  for (const typ of Object.keys(s.notAnEquityListing.byType)) {
    assert.equal(EQUITY.has(typ), false, "Aktiengattung in der Ausschlussliste: " + typ);
  }
  /* Und jede Beleggrundlage ist eine positive. */
  for (const basis of Object.keys(s.notAnEquityListing.byBasis)) {
    assert.ok(EVIDENCE_BASIS.has(basis), "Ausschluss ohne positiven Beleg: " + basis);
  }
});

test("die Seite sagt in Alltagssprache, warum ein Fonds keine Aktienanalyse hat", async () => {
  const fremd = provenNonEquity().filter((i) => i.productEligibility === "ELIGIBLE" ||
    i.productEligibility === "SEPARATE_CLASS" || i.productEligibility === "REVIEW");
  if (!fremd.length) return;
  const probe = fremd.slice(0, 3);
  for (const instrument of probe) {
    const fe = await api.getFactorEvidence(instrument.symbol);
    assert.equal(fe.state, "UNAVAILABLE", instrument.symbol + ": traegt Faktor-Evidenz");
    assert.equal(fe.reason, "NOT_AN_EQUITY_LISTING",
      instrument.symbol + ": Grund '" + fe.reason + "' statt der Gattungsentscheidung");
    assert.equal(fe.securityType, instrument.securityType);
    /* Der Anlagestil sagt dasselbe - nicht "keine Daten". */
    const sm = await api.getStrategyMatch(instrument.symbol);
    assert.equal(sm.reason, "NOT_AN_EQUITY_LISTING", instrument.symbol + ": Stil nennt '" + sm.reason + "'");
    /* Die Reisegruppe uebersetzt es, ohne Code und ohne "derzeit". */
    const form = Shape.assess(Shape.stationsFrom({ factors: fe }));
    const gruppe = form.groups.find((g) => g.causeId === "NOT_AN_EQUITY_LISTING");
    assert.ok(gruppe, instrument.symbol + ": keine Ursachengruppe fuer die Gattung");
    assert.equal(/[A-Z]{3,}_[A-Z_]{3,}/.test(gruppe.headline + " " + gruppe.explanation), false,
      "interner Code im Nutzertext: " + gruppe.explanation.slice(0, 120));
    assert.equal(/\bderzeit\b|\bnoch nicht\b/.test(gruppe.explanation), false,
      "die Erklaerung verspricht eine Aenderung, die nie kommt: " + gruppe.explanation.slice(0, 120));
    /* Und der Kopfsatz der Auskunft nennt die Gattung statt einer Datenluecke. */
    const brief = await api.getIntelligenceBrief(instrument.symbol);
    assert.match(brief.headline.sentence, /Fonds|Vorzugspapier|Schuldverschreibung|Optionsschein|keine Aktie/,
      instrument.symbol + ": Kopfsatz '" + brief.headline.sentence.slice(0, 90) + "'");
    assert.equal(/liegt noch keine auswertbare Einordnung/.test(brief.headline.sentence), false,
      instrument.symbol + ": der Kopfsatz behauptet eine Datenluecke");
  }
});

test("der Bericht zur Gattungssicherheit nennt die Freigabe und den Rest", () => {
  const pfad = join(ROOT, "quant/data/product/security-type-safety-v1.json");
  if (!existsSync(pfad)) return;
  const b = JSON.parse(readFileSync(pfad, "utf8"));
  assert.equal(b.schemaVersion, "security-type-safety-1.0.0");
  assert.equal(b.ownerDecision.date, "2026-09-28");
  assert.ok(b.ownerDecision.notReleased.length >= 4, "die Nicht-Freigaben fehlen");
  assert.equal(b.ETF_RECLASSIFIED, b.ETF_NAME_EVIDENCE_CANDIDATES,
    "nicht jeder Kandidat wurde umklassifiziert");
  assert.equal(b.STILL_EQUITY_AFTER_EVIDENCE, 0);
  assert.equal(b.STOCK_SCREENER_REMAINING, 0);
  /* Der Rest muss null sein - fuenf Zahlen, jede eine moegliche Aktienaussage
     ueber ein Papier, das keine Aktie ist. */
  for (const key of ["factorRows", "valueFactors", "marketCaps", "screeningRows", "strategyMatches"]) {
    assert.equal(b.residual[key], 0, "residual." + key + " = " + b.residual[key]);
  }
  /* Und die mehrdeutigen Muster sind messbar unangetastet. */
  assert.ok(b.AMBIGUOUS_NOT_CHANGED > 100,
    "nur " + b.AMBIGUOUS_NOT_CHANGED + " mehrdeutige Titel unveraendert - die Grenze ist zu weit");
  for (const m of b.ambiguousLeftAlone) {
    assert.ok(m.counterExample && m.counterExample.length > 20, m.id + ": kein Gegenbeispiel");
  }
});
