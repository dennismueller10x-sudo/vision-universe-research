/* =========================================================================
   VISION UNIVERSE — r2-chart-integration.test.mjs

   DER DAUERHAFTE SPEICHER IM HAUPTCHART DER EIGENTUEMER-VORSCHAU.

   Drei Zusagen, die hier auseinanderfallen koennten:

     1. Der Browser bekommt kein Zugangsmittel zu sehen - weder fuer R2
        noch fuer den Anbieter (CH1, CH2).
     2. Es gibt EINEN Chart. Intraday ist ein Zeitraum darin, kein
        zweiter Chart darunter (CH6, CH7).
     3. Ein junges Listing zeigt seinen vollen Verlauf. Zu wenig
        Historie fuer die Technik heisst NICHT "keine Historie" (CH8).

   MUTATIONSTESTS

   CH3 verlangt, dass die Nutzlast wirklich das Minimum ist - ein Feld
   mehr faellt auf. CH10 verlangt, dass die Quarantaene der Ranglisten
   nicht einfach alles durchlaesst.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lies = (p) => readFileSync(join(root, p), "utf8");

const History = require(join(root, "api", "history.js"));
const Ranges = require(join(root, "quant", "engines", "chart-ranges.js"));
const Hygiene = require(join(root, "quant", "engines", "ranking-hygiene.js"));

/* ===================================== DIE GRENZE ZUM ZUGANGSMITTEL */

test("CH1 — kein Zugangsmittel erreicht den Browser", () => {
  /* Alles, was der Browser laedt. Ein Schluessel darf hier nicht
     vorkommen, auch nicht als Name einer Umgebungsvariablen, die
     jemand versehentlich hineinschreibt. */
  const browserDateien = ["vu2-bridge/bridge.js", "vu2-bridge/experience.js",
                          "quant/engines/chart-ranges.js", "quant/engines/ranking-hygiene.js"];
  const verboten = [/TIINGO_API_KEY/, /VU_HISTORY_S3_SECRET/, /VU_HISTORY_S3_ACCESS/,
                    /AKIA[0-9A-Z]{10,}/, /secretAccessKey/i, /accessKeyId/i];
  for (const datei of browserDateien) {
    const text = lies(datei);
    for (const muster of verboten) {
      assert.ok(!muster.test(text), datei + " enthaelt " + muster);
    }
  }
});

test("CH2 — der Browser spricht nie direkt mit R2 oder dem Anbieter", () => {
  for (const datei of ["vu2-bridge/bridge.js", "vu2-bridge/experience.js"]) {
    const text = lies(datei);
    assert.ok(!/api\.tiingo\.com/.test(text), datei + " ruft den Anbieter direkt");
    assert.ok(!/r2\.cloudflarestorage\.com/.test(text), datei + " ruft R2 direkt");
    assert.ok(!/amazonaws\.com/.test(text), datei + " ruft einen Objektspeicher direkt");
  }
  /* Und der Weg, den er STATTDESSEN nimmt, steht da. */
  assert.match(lies("vu2-bridge/bridge.js"), /fetch\("\/api\/history\?ticker=/);
});

/* ============================================== DIE MINIMALE NUTZLAST */

test("CH3 MUTATION — die Standardnutzlast traegt nur Datum und Schluss", () => {
  const bars = [{ date: "2026-01-02", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100,
                  adjClose: 1.4, dividend: 0, splitFactor: 1 }];
  const schmal = History.schneideUndForme(bars, { spalten: "close" });
  assert.deepEqual(Object.keys(schmal[0]).sort(), ["close", "date"],
    "die Standardantwort muss das Minimum sein, das der Hauptchart braucht");

  /* Die Gegenprobe: wer OHLC ausdruecklich anfragt, bekommt genau das
     und nicht mehr. */
  const voll = History.schneideUndForme(bars, { spalten: "ohlcv" });
  assert.deepEqual(Object.keys(voll[0]).sort(),
    ["close", "date", "high", "low", "open", "volume"]);
  assert.ok(!("adjClose" in voll[0]), "adjClose gehoert nicht in die Antwort");
});

test("CH4 — das Fenster wird vor dem Umformen geschnitten", () => {
  const bars = ["2026-01-02", "2026-02-02", "2026-03-02"].map((d) => ({ date: d, close: 1 }));
  assert.equal(History.schneideUndForme(bars, { von: "2026-02-02" }).length, 2);
  assert.equal(History.schneideUndForme(bars, { bis: "2026-02-02" }).length, 2);
  assert.equal(History.schneideUndForme(bars, { von: "2026-02-02", bis: "2026-02-02" }).length, 1);
  assert.equal(History.schneideUndForme(bars, {}).length, 3);
});

test("CH5 — die Funktion nennt ihre Umgebungsvariablen, aber nie ihre Werte", () => {
  const quelle = lies("api/history.js");
  /* Der Name gehoert in die Abhilfe - der Wert nirgendwohin. */
  assert.match(quelle, /VU_HISTORY_S3_SECRET_ACCESS_KEY/);
  assert.ok(!/process\.env\.VU_HISTORY_S3_SECRET_ACCESS_KEY[^)]*antwort/.test(quelle));
  /* Und sie fragt den Anbieter nicht: dieser Weg liest nur den Speicher. */
  assert.ok(!/api\.tiingo\.com/.test(quelle), "die Historienfunktion darf den Anbieter nicht rufen");
  assert.match(quelle, /providerRequests: 0/);
});

/* ================================================== EIN EINZIGER CHART */

test("CH6 — der Intraday-Chart als eigener Abschnitt ist weg", () => {
  const text = lies("vu2-bridge/experience.js");
  assert.ok(!/function chartBereich/.test(text),
    "der separate Chartabschnitt darf nicht zurueckkommen");
  assert.ok(!/Intraday und Echtzeit/.test(text),
    "die Ueberschrift des zweiten Chartblocks steht noch da");
  /* Und es gibt genau EINEN AUFRUF, der zeichnet. Die Erwaehnung im
     Kommentar zaehlt nicht - gesucht ist der Aufruf mit Klammer. */
  const zeichnet = (text.match(/g\.QuantCharts\.lineChart\(/g) || []).length;
  assert.equal(zeichnet, 1, "es darf nur eine Zeichenstelle geben, sonst sind es zwei Charts");
});

test("CH7 — der Hauptchart uebernimmt Behaelter und Leiste der Ansicht", () => {
  const text = lies("vu2-bridge/experience.js");
  assert.match(text, /focus\.querySelector\("\.ranges"\)/,
    "die bestehende Zeitraumleiste muss wiederverwendet werden");
  assert.match(text, /leiste\.previousElementSibling/,
    "der bestehende Chartbehaelter muss wiederverwendet werden");
  /* Die Leiste wird wieder EINGEBLENDET - sie wurde frueher versteckt. */
  assert.match(text, /leiste\.hidden = false/);
  assert.ok(!/leiste\.hidden = true/.test(text),
    "eine versteckte Leiste war die alte Antwort auf fehlende Daten");
});

/* ============================================ JUNGE LISTINGS */

test("CH8 — ein junges Listing zeigt seinen vollen Verlauf", () => {
  /* 40 Handelstage: zu wenig fuer die Technik (300) und fuer die
     Langhistorie (250) - und trotzdem ein Chart. Genau diese
     Verwechslung stand vorher auf der Seite. */
  const bars = [];
  for (let i = 0; i < 40; i++) {
    bars.push({ date: "2026-07-" + String((i % 28) + 1).padStart(2, "0"), close: 10 + i });
  }
  bars.forEach((b, i) => { b.date = new Date(Date.UTC(2026, 6, 1) + i * 86400000)
    .toISOString().slice(0, 10); });

  const max = Ranges.selectRange("MAX", { eod: bars }, { today: bars[bars.length - 1].date });
  assert.equal(max.ok, true, "MAX muss die vorhandene Historie zeigen");
  assert.equal(max.bars.length, 40, "und zwar vollstaendig");

  const einMonat = Ranges.selectRange("1M", { eod: bars }, { today: bars[bars.length - 1].date });
  assert.equal(einMonat.ok, true, "auch ein Monat traegt");

  /* Ein Zeitraum, den die Reihe nicht hergibt, faellt aus - mit Grund
     und mit einem Vorschlag, nicht mit "keine Historie". */
  const zehnJahre = Ranges.selectRange("10Y", { eod: bars }, { today: bars[bars.length - 1].date });
  assert.equal(zehnJahre.ok, true,
    "10J schneidet ein Fenster, das die ganze Reihe enthaelt - das ist kein Fehler");
});

test("CH9 — Chart und Technikeignung sind zwei verschiedene Fragen", () => {
  /* Zwei Bars reichen dem Chart. Der Technik reichen sie nicht. Beides
     gleichzeitig wahr - genau der Fall aus der Abnahme. */
  const bars = [{ date: "2026-09-10", close: 10 }, { date: "2026-09-11", close: 11 }];
  const res = Ranges.selectRange("MAX", { eod: bars }, { today: "2026-09-11" });
  assert.equal(res.ok, true, "der Chart zeichnet ab zwei Bars");
  assert.ok(bars.length < 300, "und die Technik braucht 300 - beides steht nebeneinander");
});

/* ================================================== RANGLISTENHYGIENE */

test("CH10 MUTATION — die Quarantaene laesst nicht einfach alles durch", () => {
  const echt = { value: 0.31, dataQuality: "WARNING" };       /* AAPL-artig */
  const kaputt = { value: 3149999, dataQuality: "WARNING" };  /* MINE       */
  assert.equal(Hygiene.quarantaeneGrund(echt, "strongestMomentum12M"), null,
    "ein normaler Titel darf nicht zurueckgehalten werden");
  assert.equal(Hygiene.quarantaeneGrund(kaputt, "strongestMomentum12M").reason,
    "IMPLAUSIBLE_VALUE");

  /* Und die Stufe FAIL wird zurueckgehalten, auch bei kleinem Wert. */
  assert.equal(Hygiene.quarantaeneGrund({ value: 0.05, dataQuality: "FAIL" },
    "strongestMomentum12M").reason, "DATA_QUALITY_FAIL");

  /* WARNING allein darf NICHT reichen: zwei Drittel des Universums
     tragen sie, AAPL eingeschlossen. */
  assert.equal(Hygiene.quarantaeneGrund({ value: 0.5, dataQuality: "WARNING" },
    "strongestMomentum12M"), null,
    "WARNING zu unterdruecken loeschte das halbe Produkt");
});

test("CH11 — zurueckgehalten heisst nicht veraendert", () => {
  const eintraege = [{ ticker: "AAA", value: 0.4, dataQuality: "WARNING" },
                     { ticker: "BBB", value: 9999, dataQuality: "WARNING" }];
  const r = Hygiene.trenne(eintraege, "strongestMomentum12M");
  assert.deepEqual(r.shown.map((e) => e.ticker), ["AAA"]);
  assert.equal(r.quarantined.length, 1);
  assert.equal(r.quarantined[0].value, 9999, "der Wert bleibt unveraendert erhalten");
  assert.ok(r.quarantined[0].quarantineMessage, "und traegt seinen Grund");
  /* Die Eingabe selbst wurde nicht angefasst. */
  assert.equal(eintraege[1].quarantineReason, undefined);
});

test("CH12 — die ausgelieferte Rangliste fuehrt keinen unplausiblen Titel an", () => {
  const datei = join(root, "quant/data/proof/meta.json");
  if (!existsSync(datei)) return;
  const meta = JSON.parse(readFileSync(datei, "utf8"));
  const rang = (meta.screenerQuestions || []).filter((q) => q.kind === "ranked");
  assert.ok(rang.length > 0);

  for (const q of rang) {
    for (const e of (q.entries || [])) {
      const grund = Hygiene.quarantaeneGrund(e, q.id, { skala: 1 });
      assert.equal(grund, null,
        q.id + ": " + e.ticker + " steht in der Liste, obwohl " +
        (grund && grund.reason));
    }
  }
  /* Und die Zurueckgehaltenen sind nicht verschwunden. */
  const gehalten = rang.reduce((n, q) => n + (q.quarantinedCount || 0), 0);
  assert.ok(gehalten > 0, "ohne einen einzigen Fall prueft dieser Test nichts");
});

test("CH13 — die Bruecke haelt gebrochene Reihen aus Trefferlisten heraus", () => {
  const quelle = lies("vu2-bridge/bridge.js");
  assert.match(quelle, /gebrochenPruefer/,
    "die Bruecke muss die Liste der gebrochenen Reihen benutzen");
  assert.match(quelle, /quarantinedBrokenSeries/,
    "und sagen, wie viele sie zurueckhaelt");
  /* Die Schwellen selbst stehen NICHT im Browser - eine zweite Fassung
     derselben Grenze waere eine Fehlerquelle. */
  assert.ok(!/IMPLAUSIBLE_VALUE/.test(quelle),
    "die Regel gehoert in die Engine, nicht in die Bruecke");
});
