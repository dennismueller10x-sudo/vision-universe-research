/* =========================================================================
   VISION UNIVERSE SOCIAL — NULL BIS FUENF (HT1–HT20)

   §9–§17, §23.

   -------------------------------------------------------------------------
   WAS VORHER DASTAND
   -------------------------------------------------------------------------

   In content.js, als Vorgabewert:

       hashtags: options.hashtags || ["VisionUniverse", "Investment", "Daten"]

   Niemand hat je `options.hashtags` uebergeben. Jeder Beitrag haette
   dieselben drei Tags getragen — darunter einen internen Markenbegriff.
   Drei feste Tags unter jedem Post sind keine Hashtags, sondern eine
   Signatur.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const H = require("../engines/hashtags.js");

const tags = (k) => H.ableiten(k).hashtags;

/* --------------------------------------------------- Die Obergrenze */

test("HT1 · Hoechstens fuenf, immer", () => {
  const b = H.ableiten({ entities: ["Exxon Mobil"], entityType: "STOCK",
    topic: "CASHFLOW-MASCHINEN", question: "freier Cashflow",
    family: "STOCK_STORY", sector: "ENERGY", audience: "Geldanlage" });
  assert.ok(b.hashtags.length <= H.MAX_HASHTAGS);
  assert.equal(H.MAX_HASHTAGS, 5);
  assert.ok(b.verworfen.some((v) => v.grund === H.VERWORFEN.UEBERZAEHLIG),
    "Bei mehr als fuenf Kandidaten wird nichts als ueberzaehlig vermerkt");
});

test("HT2 · Drei passende bleiben drei — nicht auf fuenf aufgefuellt", () => {
  const t = tags({ entities: [], entityType: "NONE", topic: "Waermepumpen",
    family: "MEGATREND" });
  assert.ok(t.length < 5, "Aufgefuellt auf " + t.length);
  assert.ok(t.length >= 1);
});

test("HT3 · Kein passender Tag heisst null — und das ist zulaessig", () => {
  const b = H.ableiten({});
  assert.deepEqual(b.hashtags, []);
  assert.match(b.satz, /Null ist zulaessig/);
});

/* -------------------------------------------- Keine feste Liste (§10) */

test("HT4 · Verschiedene Beitraege bekommen verschiedene Tags", () => {
  /* Der eigentliche Punkt des Auftrags. Gemessen an der echten Platte,
     nicht an erfundenen Beispielen. */
  const platte = JSON.parse(readFileSync(
    join(ROOT, "social/data/opportunity-slate.json"), "utf8"));
  const themen = (platte.topics || []).slice(0, 25);
  assert.ok(themen.length >= 10, "Zu wenige Themen fuer die Messung");

  const saetze = new Set(themen.map((t) => H.ableiten({
    entities: t.entities, entityType: t.entityType, topic: t.title,
    question: t.question, family: t.family
  }).hashtags.join(",")));

  assert.ok(saetze.size >= 8,
    "Nur " + saetze.size + " verschiedene Tag-Saetze bei " + themen.length +
    " Themen — das ist wieder eine feste Liste, nur laenger");
});

test("HT5 · Die alten drei Festen entstehen nicht mehr", () => {
  const platte = JSON.parse(readFileSync(
    join(ROOT, "social/data/opportunity-slate.json"), "utf8"));
  for (const t of (platte.topics || [])) {
    const g = H.ableiten({ entities: t.entities, entityType: t.entityType,
      topic: t.title, question: t.question, family: t.family }).hashtags;
    assert.ok(!g.includes("VisionUniverse"),
      "Interner Markenbegriff bei: " + t.title);
    assert.ok(!(g.includes("Investment") && g.includes("Daten")),
      "Die alte feste Liste lebt: " + t.title);
  }
});

/* ------------------------------------------- Ticker vs Klarname (§13) */

test("HT6 · Der Klarname schlaegt den Ticker", () => {
  const t = tags({ entities: ["Exxon Mobil Corporation"], entityType: "STOCK",
    topic: "Technisches Setup — XOM", family: "STOCK_STORY" });
  assert.ok(t.includes("ExxonMobil"), t.join(","));
  assert.ok(!t.includes("XOM"), "Ticker UND Klarname: " + t.join(","));
});

test("HT7 · Ohne Klarnamen darf der Ticker stehen", () => {
  const t = tags({ entities: [], entityType: "STOCK",
    topic: "Technisches Setup — XOM", family: "STOCK_STORY" });
  assert.ok(t.includes("XOM"), t.join(","));
});

test("HT8 · Rechtsformen verschwinden, Kuerzel bleiben", () => {
  assert.equal(H.alsTag("Exxon Mobil Corporation"), "ExxonMobil");
  assert.equal(H.alsTag("Siemens Energy AG"), "SiemensEnergy");
  assert.equal(H.alsTag("HP Inc"), "HP");
  assert.equal(H.alsTag("Charter Communications Class A"), "CharterCommunications");
});

/* --------------------------------------------- Mehrere Unternehmen */

test("HT9 · Eine Rangliste bekommt keinen Einzelnamen", () => {
  /* Welchen der zehn sollte er nennen? Wer einen herausgreift,
     behauptet eine Rangfolge, die der Beitrag so nicht trifft. */
  const b = H.ableiten({ entities: ["Valero Energy", "Salesforce", "HP Inc",
    "Newmont", "Microsoft"], entityType: "STOCK",
    topic: "BEKANNTE NAMEN IN BEWEGUNG", family: "RANKING" });
  for (const n of ["ValeroEnergy", "Salesforce", "HP", "Newmont", "Microsoft"]) {
    assert.ok(!b.hashtags.includes(n), n + " herausgegriffen");
  }
  assert.ok(b.verworfen.some((v) => /Unternehmen/.test(v.satz || "")));
});

/* --------------------------------------------------- Qualitaet (§13) */

test("HT10 · Interne Begriffe werden nie zu Tags", () => {
  for (const n of ["Vision Universe", "Technical Opportunity Score", "Atlas"]) {
    const t = tags({ entities: [n], entityType: "STOCK", family: "STOCK_STORY" });
    assert.ok(!t.some((x) => H.kern(x) === H.kern(H.alsTag(n) || "")),
      n + " wurde zum Tag: " + t.join(","));
  }
});

test("HT11 · Tags, die etwas versprechen, fallen raus", () => {
  const b = H.ableiten({ entities: ["Jetzt Kaufen"], entityType: "STOCK",
    family: "STOCK_STORY" });
  assert.ok(!b.hashtags.includes("JetztKaufen"));
  assert.ok(b.verworfen.some((v) => v.grund === H.VERWORFEN.UNBELEGT));
});

test("HT12 · Dieselbe Sache nicht zweimal", () => {
  /* "#Aktie" und "#Aktien" sind fuer einen Leser dasselbe. */
  assert.equal(H.kern("Aktie"), H.kern("Aktien"));
  assert.equal(H.kern("Energie"), H.kern("Energien"));
  assert.notEqual(H.kern("Aktien"), H.kern("Anleihen"));

  /* Und ein Fall, der wirklich kollidiert — sonst prueft der Test eine
     Entdopplung, die nie etwas zu tun bekommt. "Aktien Global AG" als
     Entitaet und "Aktien" als Zielgruppe ergeben denselben Kern. */
  const b = H.ableiten({ entities: ["Exxon Mobil"], entityType: "STOCK",
    family: "STOCK_STORY", audience: "Aktienanalyse" });
  const kerne = b.hashtags.map(H.kern);
  assert.equal(new Set(kerne).size, kerne.length, "Dublette: " + b.hashtags.join(","));
  assert.ok(b.verworfen.some((v) => v.grund === H.VERWORFEN.DOPPELT),
    "Die Kollision wurde gar nicht erst vorgeschlagen — der Test prueft nichts");
});

/* ------------------------------------------- Deutsche Zielgruppe (§14) */

test("HT13 · Die abgeleiteten Begriffe sind deutsch", () => {
  const platte = JSON.parse(readFileSync(
    join(ROOT, "social/data/opportunity-slate.json"), "utf8"));
  const ENGLISCH = /^(Stocks?|Investing|Finance|Trading|Growth|Value|Earnings)$/i;
  for (const t of (platte.topics || [])) {
    for (const g of H.ableiten({ entities: t.entities, entityType: t.entityType,
      topic: t.title, question: t.question, family: t.family }).hashtags) {
      assert.ok(!ENGLISCH.test(g), "Englischer Begriff: #" + g);
    }
  }
});

test("HT14 · Umlaute bleiben erhalten — in beiden Wegen", () => {
  /* Die erste Fassung transliterierte in der Begriffsliste und erhielt
     sie in alsTag(): zwei Schreibweisen in einer Engine. */
  assert.match(H.ableiten({ topic: "KÜNSTLICHE INTELLIGENZ",
    family: "MEGATREND" }).hashtags.join(","), /KünstlicheIntelligenz/);
  assert.equal(H.alsTag("Wärmepumpen AG"), "Wärmepumpen");
});

/* ------------------------------------ Aus dem Kontext, nicht erfunden */

test("HT15 · Ein Themen-Tag entsteht nur, wenn der Begriff dasteht", () => {
  const mit = tags({ topic: "CASHFLOW-MASCHINEN", family: "RANKING",
    entityType: "STOCK", entities: [] });
  const ohne = tags({ topic: "BEKANNTE NAMEN IN BEWEGUNG", family: "RANKING",
    entityType: "STOCK", entities: [] });
  assert.ok(mit.includes("Cashflow"));
  assert.ok(!ohne.includes("Cashflow"), "Erfunden: " + ohne.join(","));
});

test("HT16 · Hoechstens EIN Themen-Tag", () => {
  const b = H.ableiten({ topic: "QUALITÄT + WACHSTUM + DIVIDENDE + CASHFLOW",
    family: "RANKING", entityType: "STOCK", entities: [] });
  const themen = b.detail.filter((d) => d.kategorie === H.KATEGORIE.THEMA);
  assert.equal(themen.length, 1, "Mehrere Themen-Tags: auffuellen durch die Hintertuer");
});

test("HT17 · Jede Content Family bildet auf genau einen Begriff ab", () => {
  /* Und keiner davon ist ein interner Name: "STOCK_STORY" als Hashtag
     waere wieder Systemsprache nach aussen. */
  for (const [fam, tag] of Object.entries(H.FAMILIE_ZU_TAG)) {
    assert.ok(tag && tag.length > 2, fam + " ohne Begriff");
    assert.ok(!H.INTERNE_BEGRIFFE.includes(tag.toLowerCase()),
      fam + " bildet auf einen internen Begriff ab: " + tag);
    assert.notEqual(tag.toUpperCase(), fam, fam + " wurde nur umbenannt");
  }
});

/* ----------------------------------------- FINAL_PUBLIC_TEXT (§17) */

test("HT18 · Caption, Leerzeile, Tags — deterministisch", () => {
  const a = H.finalerText("Text.", ["ExxonMobil", "Energie"]);
  assert.equal(a, "Text.\n\n#ExxonMobil #Energie");
  assert.equal(a, H.finalerText("Text.", ["ExxonMobil", "Energie"]),
    "Nicht deterministisch");
});

test("HT19 · Ohne Tags bleibt die Caption unveraendert", () => {
  assert.equal(H.finalerText("Nur Text.", []), "Nur Text.");
  assert.equal(H.finalerText("Nur Text.", null), "Nur Text.");
});

test("HT20 · Ein vorangestelltes Rautezeichen wird nicht verdoppelt", () => {
  assert.equal(H.finalerText("T", ["#Aktien", "Energie"]), "T\n\n#Aktien #Energie");
});
