#!/usr/bin/env node
/* =========================================================================
   DIE STOCK JOURNEY ALS ZUSAMMENHÄNGENDE ENTSCHEIDUNGSHILFE — GEMESSEN.

   Bis M39 wurde jedes Modul einzeln gemessen: wie viele Titel tragen einen
   Faktorwert, wie viele ein Setup, wie viele einen Mustervergleich. Jede
   dieser Zahlen war richtig, und keine beantwortete die Frage, ob eine Seite
   ZUSAMMEN etwas sagt.

   Diese Messung stellt genau die: auf zwölf Archetypen (starke Aktie,
   schwache, Momentum, Value, Bank, REIT, Wachstum, datenarmer junger Titel,
   Multi-Class mit zurückgehaltener Bewertung, ohne Stil, mit Setup, ohne
   Setup) und zusätzlich auf einer 500er-Stichprobe.

   WAS SIE ZÄHLT

     1. Widersprüche. Nicht als Gefühl, sondern als Paar: eine Stelle sagt
        „nicht verfügbar", eine andere zeigt es. Jeder Fall ist benannt und
        einzeln nachprüfbar.
     2. Doppelte Hauptaussagen. Zwei gleichlautende Sätze auf einer Seite
        sind für einen Leser ein Fehler, auch wenn beide stimmen.
     3. Technische Angaben ohne Nutzeraussage - ein Code, eine Zahl, ein
        Kasten ohne Satz.
     4. Nutzeraussagen ohne Beleg.
     5. Die elf Fragen der Reise, je Archetyp: beantwortbar oder nicht.

   WIE DIE ARCHETYPEN GEWÄHLT WERDEN

   Nicht von Hand. Jede Klasse hat ein Prädikat über die veröffentlichten
   Artefakte, und gewählt wird der alphabetisch erste Treffer, der auch die
   prominenten Titel bevorzugt, wo sie passen. Eine handverlesene Liste
   würde messen, was ich sehen will; ein Prädikat misst, was das Universum
   hergibt - und beim nächsten Lauf dasselbe.

   Ausführen:
     node scripts/vu2/measure-intelligence-coherence.mjs [--sample 500] [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const Brief = require(join(ROOT, "quant/engines/intelligence-brief.js"));
const Shape = require(join(ROOT, "quant/engines/journey-shape.js"));
const FactorEvidence = require(join(ROOT, "quant/engines/factor-evidence.js"));

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const SAMPLE = parseInt(arg("sample", "500"), 10);
const OUT = arg("out", join(ROOT, "quant/data/product/intelligence-coherence-v1.json"));
const SCHEMA = "intelligence-coherence-1.0.0";

const api = Service.create({
  loadJSON: async (p) => JSON.parse(await readFile(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(await readFile(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/* ----------------------------------------------------------------------
   DIE ARCHETYPEN, aus den veröffentlichten Artefakten bestimmt.
   ---------------------------------------------------------------------- */
async function factorTabelle() {
  const dir = join(ROOT, "quant/data/product/factor-evidence-v1");
  const zeilen = new Map();
  if (!existsSync(dir)) return zeilen;
  for (const datei of (await readdir(dir)).sort()) {
    if (!datei.endsWith(".json.gz") || datei === "screening.json.gz" || datei === "summary.json.gz") continue;
    const shard = JSON.parse(gunzipSync(await readFile(join(dir, datei))).toString("utf8"));
    for (const [ticker, src] of Object.entries(shard.securities || {})) {
      const rec = FactorEvidence.hydrate(src, shard);
      const factors = FactorEvidence.ordered(rec);
      const werte = {};
      for (const f of factors) if (f.state === "AVAILABLE" && finite(f.score)) werte[f.id] = f.score;
      zeilen.set(ticker, {
        ticker, werte, bewertet: Object.keys(werte).length,
        template: src.template ? src.template.id : null,
        marketCapReason: src.marketCapReason || null,
        bars: finite(src.bars) ? src.bars : null
      });
    }
  }
  return zeilen;
}

const ARCHETYPEN = [
  { id: "STARKE_AKTIE", label: "starke Aktie", bevorzugt: ["NVDA", "MSFT", "AAPL"],
    trifft: (z) => z.bewertet >= 4 && Object.values(z.werte).filter((v) => v >= 75).length >= 2 },
  { id: "SCHWACHE_AKTIE", label: "schwache Aktie", bevorzugt: [],
    trifft: (z) => z.bewertet >= 4 && Object.values(z.werte).filter((v) => v <= 25).length >= 2 },
  { id: "MOMENTUM_TITEL", label: "Momentum-Titel", bevorzugt: [],
    trifft: (z) => finite(z.werte.momentum) && z.werte.momentum >= 90 && finite(z.werte.value) && z.werte.value <= 45 },
  { id: "VALUE_TITEL", label: "Value-Titel", bevorzugt: [],
    trifft: (z) => finite(z.werte.value) && z.werte.value >= 90 && finite(z.werte.momentum) && z.werte.momentum <= 45 },
  { id: "BANK", label: "Bank", bevorzugt: ["WSBCO"],
    trifft: (z) => z.template === "BALANCE_SHEET_FINANCIAL" && z.bewertet >= 2 },
  { id: "REIT", label: "REIT", bevorzugt: [],
    trifft: (z) => z.template === "REAL_ESTATE_TRUST" && z.bewertet >= 2 },
  { id: "WACHSTUM", label: "Wachstumsunternehmen", bevorzugt: [],
    trifft: (z) => finite(z.werte.growth) && z.werte.growth >= 90 },
  { id: "JUNGER_TITEL", label: "datenarme junge Aktie", bevorzugt: [],
    trifft: (z) => finite(z.bars) && z.bars > 0 && z.bars < 252 },
  { id: "BEWERTUNG_ZURUECKGEHALTEN", label: "Multi-Class / Bewertung zurückgehalten",
    bevorzugt: ["GOOGL", "JPM", "T"],
    trifft: (z) => z.marketCapReason === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING" && z.bewertet >= 2 }
];

/* Drei Klassen hängen nicht an der Faktorzeile, sondern am Setup- und
   Stilindex - sie werden aus deren eigenen Artefakten gezogen. */
async function setupKandidaten() {
  const pfad = join(ROOT, "quant/data/product/setup-observations-v1/screen-index.json.gz");
  if (!existsSync(pfad)) return { mit: null, ohne: null };
  const index = JSON.parse(gunzipSync(await readFile(pfad)).toString("utf8"));
  const mit = (() => {
    for (const state of ["CONFIRMED", "SETUP_FORMING", "WATCH"]) {
      const eintrag = (index.states || []).find((s) => s.state === state);
      for (const regel of (eintrag && eintrag.rules) || []) {
        if (Array.isArray(regel.tickers) && regel.tickers.length) return regel.tickers.slice().sort()[0];
      }
    }
    return null;
  })();
  return { mit, ohne: null };
}

async function main() {
  const universe = await api.getUniverse();
  if (universe.state === "UNAVAILABLE") throw new Error("the product universe is not readable");
  const alle = universe.stocks.map((s) => s.ticker).sort();

  const zeilen = await factorTabelle();
  const geordnet = alle.map((t) => zeilen.get(t)).filter(Boolean);

  const auswahl = [];
  const belegt = new Set();
  const nimm = (id, label, ticker, begruendung) => {
    if (!ticker || belegt.has(ticker)) return;
    belegt.add(ticker);
    auswahl.push({ archetype: id, label, ticker, selectedBy: begruendung });
  };
  for (const klasse of ARCHETYPEN) {
    let treffer = klasse.bevorzugt.find((t) => zeilen.has(t) && klasse.trifft(zeilen.get(t)) && !belegt.has(t));
    if (!treffer) treffer = (geordnet.find((z) => klasse.trifft(z) && !belegt.has(z.ticker)) || {}).ticker;
    nimm(klasse.id, klasse.label, treffer, "Prädikat über das veröffentlichte Faktor-Artefakt");
  }
  const setup = await setupKandidaten();
  nimm("MIT_SETUP", "Titel mit Setup", setup.mit, "erster Ticker des Setup-Zustandsindex");

  /* Ohne Stil und ohne Setup: das steht erst nach dem Dienstaufruf fest.
     Gesucht wird der erste Titel der Stichprobe, der die Bedingung erfüllt -
     deterministisch, aber nicht aus einem Artefakt ablesbar. */
  const step = Math.max(1, Math.floor(alle.length / SAMPLE));
  const stichprobe = alle.filter((_, i) => i % step === 0).slice(0, SAMPLE);

  /* ------------------------------------------------------------------
     DIE ELF FRAGEN DER REISE. Jede ist ein Prädikat über die Auskunft
     und die Quellen - beantwortbar heisst: es steht ein Satz da, der aus
     einem gemessenen Wert kommt.
     ------------------------------------------------------------------ */
  const FRAGEN = [
    ["wieStark", "Wie stark ist die Aktie?", (b) => b.headline.state !== "UNAVAILABLE"],
    ["wasTreibt", "Was treibt die Stärke oder Schwäche?",
      (b) => b.pro.concat(b.contra).some((e) => e.kind === "factor" && e.why)],
    ["wasAendertSich", "Was verändert sich gerade?",
      (b) => b.pro.concat(b.contra).some((e) => e.kind === "change")],
    ["gibtEsSetup", "Gibt es ein Setup?", (b) => !!b.setup.state && b.setup.state !== "UNAVAILABLE"],
    ["wasBestaetigt", "Was würde es bestätigen?",
      (b) => !!(b.setup.next && b.setup.next.open && b.setup.next.open.length)],
    /* Beantwortet heisst hier auch: „es gibt keinen Zustand, der ungültig
       werden könnte" - das ist bei einem Titel ohne Setup die richtige
       Antwort und keine Lücke. Die strenge Kennzahl SETUPS_WITH_INVALIDATION
       zählt daneben nur die Titel mit entscheidbarem Zustand UND benannten
       Bedingungen; beide Zahlen stehen im Bericht. */
    ["wasUngueltig", "Was würde es ungültig machen?",
      (b) => !!(b.setup.invalidation &&
        ((b.setup.invalidation.conditions && b.setup.invalidation.conditions.length) ||
         b.setup.invalidation.reason === "NO_STATE_TO_INVALIDATE"))],
    ["welcheStrategie", "Welche Strategie passt?", (b) => b.strategy.state === "AVAILABLE"],
    ["strategieDafuer", "Was spricht dafür?", (b) => b.strategy.fulfils.length > 0 || b.pro.length > 0],
    ["strategieDagegen", "Was spricht dagegen?", (b) => b.strategy.missing.length > 0 || b.contra.length > 0],
    ["historisch", "Wie sahen ähnliche Situationen historisch aus?",
      (b) => b.pattern.state === "AVAILABLE" || b.pattern.state === "NO_PATTERN_HOLDS"],
    ["belastbar", "Wie belastbar ist diese Evidenz?",
      (b) => b.pattern.state === "AVAILABLE" ? finite(b.pattern.robust) : b.unknown.length > 0]
  ];

  /* ------------------------------------------------------------------
     WIDERSPRÜCHE. Jedes Paar ist eine konkrete, nachprüfbare Behauptung
     über zwei Stellen derselben Seite.
     ------------------------------------------------------------------ */
  function widersprueche(d, b) {
    const treffer = [];
    const s = d.stock || {};
    /* 1. Kein Kurs oben, aber eine gezeichnete Reihe darunter. */
    const letzte = s.chart && s.chart.state === "AVAILABLE" ? (s.chart.bars || []).slice(-1)[0] : null;
    if (!finite(s.price && s.price.value) && s.price && s.price.reason !== "DISPLAY_NOT_PERMITTED" &&
        letzte && finite(letzte.close)) {
      treffer.push({ id: "PRICE_MISSING_WHILE_SERIES_DRAWN",
        detail: "Kopfzahl ohne Kurs, letzter Punkt der gezeichneten Reihe " + letzte.close });
    }
    /* 2. Bewertung zurückgehalten und trotzdem eine Bewertungszahl. */
    if (s.marketCapReason === "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING") {
      const gezeigt = [];
      for (const key of ["pe", "ps", "fcfYield"]) if (finite(s[key] && s[key].value)) gezeigt.push(key);
      for (const family of (s.quant && s.quant.families) || []) {
        for (const m of family.metrics || []) {
          if (finite(m.value) && ["earningsYield", "priceEarnings", "priceSales", "priceToFcf", "evToSales", "evToEbitda", "fcfYield"].includes(m.metricId)) {
            gezeigt.push("quant." + m.metricId);
          }
        }
      }
      if (gezeigt.length) treffer.push({ id: "VALUATION_WITHHELD_BUT_SHOWN", detail: gezeigt.join(", ") });
    }
    /* 3. Ein Faktor als Stärke bezeichnet, der nicht über dem Mittelfeld
          liegt - der Fehler, der 743 Titel betraf. */
    for (const id of b.headline.strengths) {
      const f = (d.factors.factors || []).find((x) => x.id === id);
      if (f && FactorEvidence.STRENGTH_BANDS.indexOf(f.band) < 0) {
        treffer.push({ id: "WEAK_FACTOR_CALLED_STRENGTH", detail: id + " · " + f.band });
      }
    }
    /* 4. Stärke und Schwäche im gleichen Band. */
    const baender = (id) => ((d.factors.factors || []).find((x) => x.id === id) || {}).band;
    for (const stark of b.headline.strengths) {
      for (const schwach of b.headline.weaknesses) {
        if (baender(stark) && baender(stark) === baender(schwach)) {
          treffer.push({ id: "STRENGTH_AND_WEAKNESS_SAME_BAND", detail: stark + " / " + schwach + " · " + baender(stark) });
        }
      }
    }
    /* 5. Ein Mustervergleich, der als Lücke UND als Befund dasteht. */
    const alsLuecke = b.unknown.some((e) => e.kind === "pattern");
    if (alsLuecke && (b.pattern.state === "AVAILABLE" || b.pattern.state === "NO_PATTERN_HOLDS")) {
      treffer.push({ id: "PATTERN_FINDING_CALLED_GAP", detail: b.pattern.state });
    }
    /* 6. Ein Setup-Zustand in der Auskunft, den die Beobachtung nicht trägt. */
    const beobachtet = d.setup && d.setup.state === "AVAILABLE" ? d.setup.classification.state : null;
    if (b.setup.state && b.setup.state !== "UNAVAILABLE" && b.setup.state !== beobachtet) {
      treffer.push({ id: "SETUP_STATE_MISMATCH", detail: b.setup.state + " vs " + beobachtet });
    }
    /* 7. DIESELBE MESSUNG auf beiden Seiten.
     *
     * Der erste Lauf dieser Prüfung war zu grob und hat dabei zwei Dinge
     * aufgedeckt, von denen nur eines ein Fehler war.
     *
     * Ein Fehler: die LAGE einer Eigenschaft in einer Spalte und ihre
     * RICHTUNG in der Gegenspalte - „Eine schwache Kursentwicklung" dagegen,
     * „Kurstempo verbessert sich" dafür. 95 von 120 Titeln. Die Auskunft
     * führt die Richtung jetzt neben der Lage; 7b hält das.
     *
     * KEIN Fehler: zwei verschiedene Messungen derselben Familie, die in
     * verschiedene Richtungen zeigen - „Bruttomarge verbessert sich" dafür
     * und „Free-Cashflow-Marge verschlechtert sich" dagegen. Beide nennen
     * ihre Kennzahl, beide sind gemessen, und dass sie auseinanderlaufen ist
     * der Befund und nicht sein Gegenteil. Die Identität einer Aussage ist
     * deshalb ihre Messung und nicht ihre Familie. */
    const kennung = (e) => e.kind + ":" + (e.itemId || e.factorId || "");
    const proSchluessel = new Set(b.pro.filter((e) => e.factorId || e.itemId).map(kennung));
    for (const e of b.contra) {
      if ((e.factorId || e.itemId) && proSchluessel.has(kennung(e))) {
        treffer.push({ id: "FACTOR_BOTH_SIDES", detail: kennung(e) });
      }
    }
    /* 7b. Und die Aufteilung selbst: eine Veränderung in der Gegenspalte zu
       einer genannten Eigenschaft ist die Lage, die 7 gemeint hat. */
    const lageProSeite = { pro: new Set(), contra: new Set() };
    for (const key of ["pro", "contra"]) {
      for (const e of b[key]) if (e.kind === "factor" && e.factorId) lageProSeite[key].add(e.factorId);
    }
    for (const key of ["pro", "contra"]) {
      const gegen = key === "pro" ? "contra" : "pro";
      for (const e of b[key]) {
        if (e.kind === "change" && e.factorId && lageProSeite[gegen].has(e.factorId)) {
          treffer.push({ id: "CHANGE_SPLIT_FROM_ITS_FACTOR", detail: e.factorId + " · " + e.text });
        }
      }
    }
    return treffer;
  }

  /* Doppelte Hauptaussagen: identischer Satz an zwei Stellen der Auskunft. */
  function doppelte(b) {
    const saetze = [];
    const nimmSatz = (quelle, text) => {
      if (typeof text === "string" && text.trim().length > 12) saetze.push({ quelle, text: text.replace(/\s+/g, " ").trim() });
    };
    nimmSatz("headline", b.headline.sentence);
    for (const key of ["pro", "contra", "unknown"]) for (const e of b[key]) nimmSatz(key, e.text);
    nimmSatz("setup", b.setup.sentence);
    nimmSatz("setup.why", b.setup.why && b.setup.why.sentence);
    nimmSatz("setup.next", b.setup.next && b.setup.next.sentence);
    nimmSatz("setup.invalidation", b.setup.invalidation && b.setup.invalidation.sentence);
    nimmSatz("strategy", b.strategy.sentence);
    nimmSatz("pattern", b.pattern.sentence);
    const gesehen = new Map(), treffer = [];
    for (const s of saetze) {
      if (gesehen.has(s.text)) treffer.push({ text: s.text.slice(0, 80), sources: [gesehen.get(s.text), s.quelle] });
      else gesehen.set(s.text, s.quelle);
    }
    return treffer;
  }

  /* Technische Angabe ohne Nutzeraussage: ein Zustand mit Code, zu dem kein
     Satz gehört. Gemessen an den Stellen, die überhaupt Codes tragen. */
  function ohneAussage(d, b) {
    const treffer = [];
    const t = d.technical || {};
    if (t.state === "AVAILABLE") {
      for (const [name, block] of [["Trend", t.trend], ["Momentum", t.momentum], ["Schwankung", t.volatility], ["Elliott", t.elliott]]) {
        if (block && block.code && !block.label) treffer.push({ id: "TECHNICAL_CODE_WITHOUT_LABEL", detail: name + " " + block.code });
      }
    }
    if (d.setup && d.setup.state === "AVAILABLE" && !b.setup.sentence) {
      treffer.push({ id: "SETUP_STATE_WITHOUT_SENTENCE", detail: d.setup.classification.state });
    }
    for (const key of ["pro", "contra", "unknown"]) {
      for (const e of b[key]) if (!e.text) treffer.push({ id: "STATEMENT_WITHOUT_TEXT", detail: key });
    }
    /* Ein Kennzahlenkasten, dessen ausgewählte Zeilen alle fehlen, wäre eine
       Überschrift ohne Antwort. Gemessen an derselben Auswahl, die die Seite
       zeigt. */
    const AUSWAHL = { quality: ["operatingMargin", "fcfMargin", "netMargin"], growth: ["revenueGrowth", "epsGrowth"],
      value: ["earningsYield", "priceToFcf", "priceEarnings", "priceSales"], risk: ["volatility", "maxDrawdown"] };
    for (const family of (d.stock && d.stock.quant && d.stock.quant.families) || []) {
      const auswahl = AUSWAHL[family.id];
      if (!auswahl) continue;
      const vorhanden = (family.metrics || []).filter((m) => auswahl.includes(m.metricId));
      if (vorhanden.length === 0) treffer.push({ id: "METRIC_BOX_WITHOUT_ANY_SELECTED_METRIC", detail: family.id });
    }
    return treffer;
  }

  async function fuerTitel(ticker) {
    const b = await api.getIntelligenceBrief(ticker).catch((e) => ({ state: "UNAVAILABLE", reason: "THROWN:" + e.message }));
    if (b.state !== "AVAILABLE") return { ticker, error: b.reason };
    const d = b.sources;
    const fragen = {};
    for (const [id, , pruefen] of FRAGEN) {
      try { fragen[id] = !!pruefen(b); } catch { fragen[id] = false; }
    }
    const form = Shape.assess(Shape.stationsFrom({
      stock: d.stock, factors: d.factors, setup: d.setup, patterns: d.patterns,
      match: d.match, technical: d.technical
    }));
    return {
      ticker,
      headlineState: b.headline.state,
      headline: b.headline.sentence,
      pro: b.pro.length, contra: b.contra.length, unknown: b.unknown.length,
      duplicatesMerged: b.duplicatesMerged,
      setupState: b.setup.state,
      setupNext: !!(b.setup.next && b.setup.next.open && b.setup.next.open.length),
      setupInvalidation: !!(b.setup.invalidation && b.setup.invalidation.conditions && b.setup.invalidation.conditions.length),
      strategyState: b.strategy.state,
      strategyExplained: b.strategy.state === "AVAILABLE" &&
        !!b.strategy.sentence && (b.strategy.fulfils.length + b.strategy.missing.length + b.strategy.blocking.length) > 0,
      patternState: b.pattern.state,
      patternAsymmetry: b.pattern.state === "AVAILABLE" && finite(b.pattern.asymmetry),
      methodologySwitch: b.methodologySwitch.active ? b.methodologySwitch.id : null,
      questions: fragen,
      answered: Object.values(fragen).filter(Boolean).length,
      contradictions: widersprueche(d, b),
      duplicates: doppelte(b),
      withoutStatement: ohneAussage(d, b),
      withoutEvidence: Brief.statementsWithoutEvidence(b),
      shape: form.shape
    };
  }

  /* --- die Stichprobe, in Zahlen --- */
  const z = {
    titel: 0, summaryComplete: 0, summaryPartial: 0, summaryUnavailable: 0,
    proContraUnknownAlleDrei: 0, proContraUnknownMindestensZwei: 0,
    setupVorhanden: 0, setupEntscheidbar: 0, setupNext: 0, setupInvalidation: 0,
    strategyExplained: 0, patternAsymmetry: 0, patternFinding: 0, methodologySwitch: 0,
    contradictions: 0, duplicates: 0, withoutStatement: 0, withoutEvidence: 0,
    full: 0, reduced: 0, unusable: 0
  };
  const widerspruchArten = {}, aussageArten = {}, fragenTreffer = {};
  for (const [id] of FRAGEN) fragenTreffer[id] = 0;
  const fehler = {};
  const proben = [];
  const nachtraeglich = [];
  const formen = {};

  for (let i = 0; i < stichprobe.length; i += 20) {
    const stapel = await Promise.all(stichprobe.slice(i, i + 20).map(fuerTitel));
    for (const r of stapel) {
      if (r.error) { fehler[r.error] = (fehler[r.error] || 0) + 1; continue; }
      z.titel += 1;
      if (r.headlineState === "COMPLETE") z.summaryComplete += 1;
      else if (r.headlineState === "PARTIAL") z.summaryPartial += 1;
      else z.summaryUnavailable += 1;
      const gruppen = [r.pro > 0, r.contra > 0, r.unknown > 0].filter(Boolean).length;
      if (gruppen === 3) z.proContraUnknownAlleDrei += 1;
      if (gruppen >= 2) z.proContraUnknownMindestensZwei += 1;
      if (r.setupState && r.setupState !== "UNAVAILABLE") z.setupVorhanden += 1;
      if (["WATCH", "SETUP_FORMING", "CONFIRMED"].includes(r.setupState)) {
        z.setupEntscheidbar += 1;
        if (r.setupNext) z.setupNext += 1;
        if (r.setupInvalidation) z.setupInvalidation += 1;
      }
      if (r.strategyExplained) z.strategyExplained += 1;
      if (r.patternAsymmetry) z.patternAsymmetry += 1;
      if (r.patternState === "NO_PATTERN_HOLDS") z.patternFinding += 1;
      if (r.methodologySwitch) z.methodologySwitch += 1;
      z.contradictions += r.contradictions.length;
      z.duplicates += r.duplicates.length;
      z.withoutStatement += r.withoutStatement.length;
      z.withoutEvidence += r.withoutEvidence.length;
      for (const c of r.contradictions) widerspruchArten[c.id] = (widerspruchArten[c.id] || 0) + 1;
      for (const c of r.withoutStatement) aussageArten[c.id] = (aussageArten[c.id] || 0) + 1;
      for (const [id] of FRAGEN) if (r.questions[id]) fragenTreffer[id] += 1;
      /* Die Reiseform, jetzt in der Sprache der Auskunft: eine volle Reise
         beantwortet mindestens neun der elf Fragen, eine reduzierte
         wenigstens vier, darunter ist sie nicht benutzbar. Die Schwellen
         sind dieselben wie in der Formmessung - höchstens zwei Absagen. */
      if (r.answered >= 9) z.full += 1;
      else if (r.answered >= 4) z.reduced += 1;
      else z.unusable += 1;
      /* UND DIE ALTE FORM DANEBEN - zwei Lineale, nicht ein Fortschritt.
         Die Formmessung zählt gehaltvolle STATIONEN, diese Messung
         beantwortete FRAGEN. Ein Titel mit einer vollen Faktorleiste und
         ohne Setup hat elf Stationen und neun Antworten. Die beiden Zahlen
         nebeneinander zu zeigen ist der einzige Weg, sie nicht als
         Verbesserung auszugeben, die keine ist. */
      formen[r.shape] = (formen[r.shape] || 0) + 1;
      if (proben.length < 12) proben.push({ ticker: r.ticker, answered: r.answered, headline: r.headline });
      /* Zwei Archetypen stehen in keinem Artefakt: „kein Stil passt" und
         „kein Setup" sind Antworten der Dienste und keine Eigenschaft einer
         Zeile. Sie werden deshalb aus der Stichprobe genommen - der erste
         Treffer der alphabetisch geordneten Stichprobe, also beim nächsten
         Lauf derselbe. */
      nachtraeglich.push(r);
    }
  }

  /* --- die Archetypen, vollständig ausgeschrieben --- */
  /* Ein Titel, der schon eine andere Klasse belegt, taugt hier nicht - sonst
     fällt die Klasse still aus, weil ihr erster Treffer anderswo steht. Genau
     das ist beim ersten 500er-Lauf passiert: „ohne Setup" verschwand, weil
     sein erster Treffer die schwache Aktie war. */
  const ausStichprobe = (pruefen) =>
    (nachtraeglich.find((r) => !belegt.has(r.ticker) && pruefen(r)) || {}).ticker || null;
  nimm("OHNE_STIL", "Titel ohne passenden Anlagestil",
    ausStichprobe((r) => r.strategyState !== "AVAILABLE"),
    "erster Titel der Stichprobe, für den kein Profil auswertbar ist");
  nimm("OHNE_SETUP", "Titel ohne Setup",
    ausStichprobe((r) => r.setupState === "NO_SETUP"),
    "erster Titel der Stichprobe mit dem Zustand 'kein Setup'");

  const archetypen = [];
  for (const eintrag of auswahl) {
    const schon = nachtraeglich.find((r) => r.ticker === eintrag.ticker);
    archetypen.push({ ...eintrag, ...(schon || await fuerTitel(eintrag.ticker)) });
  }

  const bericht = {
    schemaVersion: SCHEMA,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    briefEngine: Brief.SCHEMA_VERSION,
    universe: alle.length, sample: z.titel,
    sampling: "jeder " + step + ". Titel der alphabetisch sortierten Liste - deterministisch",
    ARCHETYPES: archetypen.map((a) => ({
      archetype: a.archetype, label: a.label, ticker: a.ticker, selectedBy: a.selectedBy,
      error: a.error || null,
      headlineState: a.headlineState || null, headline: a.headline || null,
      pro: a.pro ?? null, contra: a.contra ?? null, unknown: a.unknown ?? null,
      setupState: a.setupState || null, setupNext: a.setupNext ?? null, setupInvalidation: a.setupInvalidation ?? null,
      strategyState: a.strategyState || null, strategyExplained: a.strategyExplained ?? null,
      patternState: a.patternState || null, methodologySwitch: a.methodologySwitch || null,
      answeredQuestions: a.answered ?? null, questions: a.questions || null,
      contradictions: a.contradictions || [], duplicates: a.duplicates || [],
      withoutStatement: a.withoutStatement || [], withoutEvidence: a.withoutEvidence || [],
      shape: a.shape || null
    })),
    /* Die Kennzahlen des Auftrags, in seinen Namen. */
    STOCKS_WITH_COMPLETE_INTELLIGENCE_SUMMARY: z.summaryComplete,
    STOCKS_WITH_PARTIAL_INTELLIGENCE_SUMMARY: z.summaryPartial,
    STOCKS_WITH_PRO_CONTRA_UNKNOWN: z.proContraUnknownAlleDrei,
    STOCKS_WITH_AT_LEAST_TWO_GROUPS: z.proContraUnknownMindestensZwei,
    SETUPS_WITH_NEXT_CONDITION: z.setupNext,
    SETUPS_WITH_INVALIDATION: z.setupInvalidation,
    SETUPS_DECIDABLE_STATE: z.setupEntscheidbar,
    SETUPS_PUBLISHED: z.setupVorhanden,
    STRATEGY_MATCH_WITH_EXPLANATION: z.strategyExplained,
    PATTERN_MATCH_WITH_ASYMMETRY: z.patternAsymmetry,
    PATTERN_MATCH_EXPLICIT_NO_HOLD: z.patternFinding,
    METHODOLOGY_SWITCH_VISIBLE: z.methodologySwitch,
    CONTRADICTORY_STATEMENTS: z.contradictions,
    DUPLICATE_PRIMARY_STATEMENTS: z.duplicates,
    TECHNICAL_INFORMATION_WITHOUT_STATEMENT: z.withoutStatement,
    STATEMENTS_WITHOUT_EVIDENCE: z.withoutEvidence,
    FULL_INTELLIGENCE_JOURNEY: z.full,
    REDUCED_INTELLIGENCE_JOURNEY: z.reduced,
    UNUSABLE: z.unusable,
    /* Dasselbe Sample mit dem Lineal der Formmessung - damit die beiden
       Zahlenreihen vergleichbar BLEIBEN und nicht verwechselt werden. */
    journeyShapeOnSameSample: formen,
    contradictionKinds: widerspruchArten,
    withoutStatementKinds: aussageArten,
    questionsAnswered: Object.fromEntries(FRAGEN.map(([id, frage]) => [id, { question: frage, titles: fragenTreffer[id] }])),
    serviceErrors: fehler,
    examples: proben,
    definitions: {
      FULL_INTELLIGENCE_JOURNEY: "mindestens 9 der 11 Reisefragen beantwortbar",
      REDUCED_INTELLIGENCE_JOURNEY: "4 bis 8 Fragen beantwortbar",
      UNUSABLE: "höchstens 3 Fragen beantwortbar",
      STOCKS_WITH_PRO_CONTRA_UNKNOWN: "alle drei Gruppen tragen mindestens eine Aussage",
      SETUPS_WITH_NEXT_CONDITION: "von den Titeln mit entscheidbarem Zustand: die nächste Stufe nennt mindestens eine offene Bedingung",
      SETUPS_WITH_INVALIDATION: "von den Titeln mit entscheidbarem Zustand: der heutige Zustand nennt mindestens eine erfüllte Bedingung, deren Wegfall ihn beendet",
      CONTRADICTORY_STATEMENTS: "gezählte Paare, je Paar in contradictionKinds benannt - keine Schätzung",
      journeyShapeOnSameSample: "die Form nach journey-shape-1.0.0 (gehaltvolle STATIONEN, höchstens " +
        "zwei Absagen) über dieselbe Stichprobe. Ein anderes Lineal als FULL/REDUCED/UNUSABLE oben, " +
        "das beantwortete FRAGEN zählt - die beiden Reihen sind nicht dieselbe Messung"
    }
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  const p = (n) => String(n).padStart(5);
  process.stdout.write("Stock-Intelligence-Kohärenz · " + z.titel + " von " + alle.length + " Titeln\n\n");
  process.stdout.write("  Archetypen:\n");
  for (const a of bericht.ARCHETYPES) {
    process.stdout.write("    " + (a.ticker || "—").padEnd(8) + a.label.padEnd(38) +
      (a.answeredQuestions === null ? "Fehler " + a.error : a.answeredQuestions + "/11 Fragen") +
      (a.contradictions.length ? "  WIDERSPRUCH " + a.contradictions.map((c) => c.id).join(",") : "") +
      (a.duplicates.length ? "  DOPPELT " + a.duplicates.length : "") + "\n");
  }
  process.stdout.write("\n  Kennzahlen (" + z.titel + " Titel):\n");
  for (const key of ["STOCKS_WITH_COMPLETE_INTELLIGENCE_SUMMARY", "STOCKS_WITH_PRO_CONTRA_UNKNOWN",
    "SETUPS_DECIDABLE_STATE", "SETUPS_WITH_NEXT_CONDITION", "SETUPS_WITH_INVALIDATION",
    "STRATEGY_MATCH_WITH_EXPLANATION", "PATTERN_MATCH_WITH_ASYMMETRY", "METHODOLOGY_SWITCH_VISIBLE",
    "CONTRADICTORY_STATEMENTS", "DUPLICATE_PRIMARY_STATEMENTS", "TECHNICAL_INFORMATION_WITHOUT_STATEMENT",
    "STATEMENTS_WITHOUT_EVIDENCE", "FULL_INTELLIGENCE_JOURNEY", "REDUCED_INTELLIGENCE_JOURNEY", "UNUSABLE"]) {
    process.stdout.write("    " + p(bericht[key]) + "  " + key + "\n");
  }
  if (Object.keys(widerspruchArten).length) {
    process.stdout.write("\n  Widerspruchsarten: " + Object.entries(widerspruchArten).map(([k, v]) => k + " " + v).join(" · ") + "\n");
  }
  if (Object.keys(aussageArten).length) {
    process.stdout.write("  Ohne Nutzeraussage: " + Object.entries(aussageArten).map(([k, v]) => k + " " + v).join(" · ") + "\n");
  }
  process.stdout.write("\n  Fragen je Titel:\n");
  for (const [id, eintrag] of Object.entries(bericht.questionsAnswered)) {
    process.stdout.write("    " + p(eintrag.titles) + "  " + id.padEnd(18) + eintrag.question + "\n");
  }
  if (Object.keys(fehler).length) process.stdout.write("\n  Dienstfehler: " + JSON.stringify(fehler) + "\n");
  process.stdout.write("\n  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
