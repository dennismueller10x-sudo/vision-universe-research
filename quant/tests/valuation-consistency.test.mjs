/* =========================================================================
   DREI WEGE ZU EINER BEWERTUNG - UND NUR EINER HIELT SICH AN DIE SEMANTIK.

   Gemessen am 26.09.2026 über die veröffentlichten Artefakte: von den 465
   Titeln, deren Börsenwert M34 ausdrücklich zurückhält, trugen 266 drei
   Zeilen tiefer doch eine Bewertungszahl.

     GOOGL   Bewertung zurückgehalten · Kurs-Gewinn-Verhältnis 17,27,
             Kurs-Umsatz-Verhältnis 9,32
     T       zurückgehalten · 8,4 und 1,52
     JPM     zurückgehalten · Ertragsrendite 4,62 % aus einem Börsenwert
             von 1.408 Mrd.

   Die Faktorschicht sagte „wird bewusst zurückgehalten, weil die Aktienzahl
   dem Unternehmen und nicht dieser Notierung gilt"; die Kennzahlenschicht
   nannte genau die Zahl, die daraus entsteht. Nachgerechnet und nicht
   vermutet: `f_ps` ist „Kurs × Aktien / Umsatz", `f_fcfYield` ist „Free
   Cashflow / (Kurs × Aktien)", `f_pe` ist „Kurs / (Gewinn / Aktien)" - alle
   drei tragen die Aktienzahl des Emittenten.

   Was hier gehalten wird: wo die Faktorschicht zurückhält, hält jede Schicht
   zurück - und sagt den Grund, statt „Daten fehlen" zu behaupten. Es fehlt
   nichts; es wird eine Zahl nicht genannt, die sich nur schätzen ließe.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const FundamentalInputs = require(join(ROOT, "quant/engines/fundamental-inputs.js"));

const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});

const GRUND = "SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING";
/* Die prominenten Fälle aus der Messung - sie stehen hier, weil der Auftrag
   ausdrücklich nach ihnen fragt, nicht als Sonderlogik. */
const ZURUECKGEHALTEN = ["GOOGL", "GOOG", "JPM", "T", "SO", "AGNC"];
const UNBERUEHRT = ["AAPL", "MSFT", "NVDA"];

test("die Liste der bewertungsabhängigen Kennzahlen deckt beide Arbeitsflächen", () => {
  const liste = FundamentalInputs.MARKET_CAP_DEPENDENT_PRODUCT_METRICS;
  /* Der Konsum-Export, die Panel-Arbeitsfläche und die breite - alle drei
     Wege, über die eine Bewertungszahl eine Seite erreichen kann. */
  for (const key of ["pe", "ps", "fcfYield", "earningsYield", "evToSales", "evToEbitda",
    "priceToFcf", "priceEarnings", "priceSales"]) {
    assert.ok(liste.includes(key), "die Sperrliste kennt '" + key + "' nicht");
  }
  /* Und die Bewertungsfamilie BEIDER Arbeitsflächen ist vollständig erfasst:
     eine Kennzahl der Familie „Bewertung", die nicht in der Liste steht,
     wäre genau die Lücke, die diesen Fehler erzeugt hat. */
  const panel = readFileSync(join(ROOT, "quant/api/quant-workspace-contract.js"), "utf8");
  const familie = panel.slice(panel.indexOf("['value',"), panel.indexOf("]]", panel.indexOf("['value',")));
  for (const treffer of familie.matchAll(/'([a-zA-Z]+)'/g)) {
    if (treffer[1] === "value" || treffer[1] === "Bewertung") continue;
    if (/^[A-Z]/.test(treffer[1]) || treffer[1].length < 3) continue;
    assert.ok(liste.includes(treffer[1]),
      "die Bewertungsfamilie der Panel-Arbeitsfläche führt '" + treffer[1] + "', die Sperrliste nicht");
  }
});

test("wo der Börsenwert zurückgehalten wird, nennt keine Schicht eine Bewertungszahl", async () => {
  let geprueft = 0;
  for (const ticker of ZURUECKGEHALTEN) {
    const s = await api.getStockIntelligence(ticker);
    if (s.marketCapReason !== GRUND) continue;
    geprueft += 1;
    assert.ok(s.valuationWithheld, ticker + ": die Zurückhaltung ist nicht vermerkt");
    assert.equal(s.valuationWithheld.reason, GRUND);
    /* Der Konsum-Export. */
    for (const key of ["pe", "ps", "fcfYield"]) {
      if (!s[key]) continue;
      assert.equal(Number.isFinite(s[key].value), false, ticker + ": " + key + " trägt trotzdem eine Zahl");
      assert.equal(s[key].reason, GRUND, ticker + ": " + key + " nennt nicht den richtigen Grund");
    }
    /* Die Rohwerte dahinter, damit keine Fläche sie am Modell vorbei liest. */
    for (const key of ["f_pe", "f_ps", "f_fcfYield"]) {
      if (s.consumerMetrics && key in s.consumerMetrics) {
        assert.equal(s.consumerMetrics[key], null, ticker + ": Rohwert " + key + " ist noch da");
      }
    }
    /* Die Arbeitsfläche - über beide Wege. */
    for (const quelle of [s.quant, await api.getQuantWorkspace(ticker)]) {
      for (const family of (quelle && quelle.families) || []) {
        for (const m of family.metrics || []) {
          if (!FundamentalInputs.MARKET_CAP_DEPENDENT_PRODUCT_METRICS.includes(m.metricId)) continue;
          assert.equal(Number.isFinite(m.value), false, ticker + ": " + m.metricId + " trägt trotzdem eine Zahl");
        }
      }
    }
  }
  assert.ok(geprueft >= 4, "nur " + geprueft + " der prominenten Fälle sind zurückgehalten");
});

test("ein Titel ohne Zurückhaltung verliert keine einzige Kennzahl", async () => {
  /* Die Gegenprobe: eine Sperre, die zu weit greift, wäre schlimmer als
     keine - sie nähme 6.400 Titeln ihre Bewertung, um 465 zu schützen. */
  for (const ticker of UNBERUEHRT) {
    const s = await api.getStockIntelligence(ticker);
    assert.notEqual(s.marketCapReason, GRUND, ticker + ": unerwartet zurückgehalten");
    assert.equal(s.valuationWithheld, undefined, ticker + ": trägt einen Zurückhaltungsvermerk");
    const werte = [];
    for (const family of (s.quant && s.quant.families) || []) {
      for (const m of family.metrics || []) if (Number.isFinite(m.value)) werte.push(m.metricId);
    }
    assert.ok(werte.length >= 6, ticker + ": nur " + werte.length + " Kennzahlen mit Wert");
  }
});

test("der Bestand ist vollständig abgedeckt - kein Titel entgeht der Regel", () => {
  /* Die Regel greift über das Verzeichnis. Also muss das Verzeichnis JEDEN
     Titel kennen, den die Faktorschicht zurückhält - sonst gäbe es Seiten,
     die die Entscheidung nicht erfahren, und genau das war der Fehler. */
  const faktorDir = join(ROOT, "quant/data/product/factor-evidence-v1");
  const listePfad = join(ROOT, "quant/data/product/universe-list-v1.json.gz");
  if (!existsSync(faktorDir) || !existsSync(listePfad)) return;
  const liste = JSON.parse(gunzipSync(readFileSync(listePfad)).toString("utf8"));
  if (liste.schemaVersion === "universe-list-1.0.0") return;
  const imVerzeichnis = new Map(liste.entries.map((e) => [e.s, e.v || null]));
  const fehlen = [];
  let zurueck = 0;
  for (const datei of readdirSync(faktorDir)) {
    if (!datei.endsWith(".json.gz") || datei === "screening.json.gz" || datei === "summary.json.gz") continue;
    const shard = JSON.parse(gunzipSync(readFileSync(join(faktorDir, datei))).toString("utf8"));
    for (const [ticker, src] of Object.entries(shard.securities || {})) {
      if (src.marketCapReason !== GRUND) continue;
      zurueck += 1;
      if (imVerzeichnis.get(ticker) !== GRUND) fehlen.push(ticker);
    }
  }
  assert.ok(zurueck > 100, "nur " + zurueck + " zurückgehaltene Bewertungen gefunden");
  assert.deepEqual(fehlen.slice(0, 10), [],
    fehlen.length + " von " + zurueck + " zurückgehaltenen Titeln fehlen im Verzeichnis");
});

test("statt der Zahl steht der Grund - nicht der Satz, dass Daten fehlen", () => {
  /* Das Wörterbuch verlangt für „nicht vorhanden" und „bewusst
     zurückgehalten" zwei verschiedene Texte. Der Unterschied ist der ganze
     Punkt: im ersten Fall fehlt etwas, im zweiten hat das Haus sich
     entschieden. */
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  const block = seite.slice(seite.indexOf("const KENNZAHL_GRUND={"), seite.indexOf("function kennzahlGrund("));
  assert.ok(block.length > 200, "der Grundtext für die zurückgehaltene Bewertung fehlt");
  assert.ok(block.includes(GRUND), "der Grund ist nicht zugeordnet");
  /* Erst den EINEN Eintrag abgrenzen, dann darin prüfen. Ein Fenster bis zum
     Blockende prüft sonst seinen eigenen Rand: die übrigen Schlüssel der
     Tabelle sind selbst interne Codes. Genau daran hat sich der
     Branchenvorlagen-Test in M39 zweimal selbst ausgelöst. */
  const schluessel = [...block.matchAll(/\n? ?([A-Z][A-Z_]{4,}):/g)].map((m) => m[1]);
  assert.ok(schluessel.includes(GRUND), "der Grund steht nicht als eigener Schlüssel in der Tabelle");
  let satz = block.slice(block.indexOf(GRUND) + GRUND.length + 1);
  for (const anderer of schluessel) if (anderer !== GRUND) satz = satz.split(anderer + ":")[0];
  assert.ok(satz.length > 200, "der Satz ist zu kurz, um etwas zu erklären");
  assert.equal(/[A-Z]{3,}_[A-Z_]{3,}/.test(satz), false,
    "interner Code im Nutzersatz: " + satz.slice(0, 160));
  /* Und die Fläche ruft ihn auf, statt den alten Satz zu schreiben. */
  assert.match(seite, /text:m\.state==='AVAILABLE'\?'Datenstand '[^:]*:kennzahlGrund\(m\)/);
  /* Der Wert selbst steht als Aussage da und nicht als „Nicht verfügbar". */
  assert.match(seite, /m\.reason==='SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING'\?'Bewusst nicht genannt'/);
});

test("ein Kennzahlenkasten ohne eine einzige Zeile entsteht nicht", async () => {
  /* Gemessen: der Panelweg liefert die Bewertungsfamilie als
     earningsYield/priceToFcf, der breite als priceEarnings/priceSales.
     Die Auswahl der Seite kannte nur die ersten - für jeden Titel ausserhalb
     des Panels stand die Frage „Welcher Preis steht dem Geschäft
     gegenüber?" über einem leeren Kasten. */
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  const auswahl = seite.slice(seite.indexOf("const selected={quality:"), seite.indexOf("};", seite.indexOf("const selected={quality:")));
  for (const key of ["earningsYield", "priceToFcf", "priceEarnings", "priceSales"]) {
    assert.ok(auswahl.includes(key), "die Auswahl der Bewertungsfamilie kennt '" + key + "' nicht");
  }
  /* Und der Kasten entsteht nur mit wenigstens einer Zeile - in JEDER Form. */
  assert.match(seite, /s\.quant\.families\.filter\(f=>selected\[f\.id\]&&\(f\.metrics\|\|\[\]\)\.some\(m=>zeige\(f,m\)\)\)/);
  /* Verhalten dazu: über beide Wege trägt die Bewertungsfamilie mindestens
     eine Kennzahl, die die Seite auch auswählt. */
  const AUSGEWAEHLT = ["earningsYield", "priceToFcf", "priceEarnings", "priceSales"];
  for (const ticker of ["AAPL", "WBD"]) {
    const s = await api.getStockIntelligence(ticker);
    const familie = (s.quant && s.quant.families || []).find((f) => f.id === "value");
    if (!familie) continue;
    const treffer = (familie.metrics || []).filter((m) => AUSGEWAEHLT.includes(m.metricId));
    assert.ok(treffer.length > 0, ticker + ": die Bewertungsfamilie trägt keine Kennzahl der Auswahl");
  }
});
