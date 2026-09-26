/* =========================================================================
   EINE VERTRAGSPRUEFUNG, ZWEI LESER.

   Die Universumsliste und der Faktorlauf brauchen denselben letzten
   Schlusskurs - die Liste, um eine Zahl zu zeigen, der Faktorlauf, um einen
   Boersenwert zu bilden, wo kein Technical-Buendel existiert (gemessen 131
   Titel). Solange die Pruefung zweimal dastand, waren es zwei Vertraege,
   sobald einer ergaenzt wird.

   Was hier gehalten wird, ist nicht "die Funktion gibt eine Zahl zurueck",
   sondern dass jede einzelne Vertragsbedingung fuer sich ablehnt. Eine
   Pruefung, die nur im Ganzen getestet ist, verliert unbemerkt eine Zeile.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Close = require(join(ROOT, "quant/engines/published-close.js"));
const HEUTE = "2026-09-26";

const reihe = (overrides = {}) => ({
  schemaVersion: "discover-series-1.1.0",
  dataMode: "real", source: "tiingo", provider: "tiingo",
  status: "CALCULATED", priceSeriesType: "SPLIT_ADJUSTED",
  grain: "daily", publishBasis: "EOD", currency: "USD",
  asOf: "2026-09-25",
  points: [["2026-09-24", 100.5], ["2026-09-25", 101.25]],
  ...overrides
});

test("eine vollstaendige Reihe liefert ihren letzten Punkt", () => {
  const punkt = Close.lastPoint(reihe(), HEUTE);
  assert.deepEqual(punkt, { close: 101.25, date: "2026-09-25", currency: "USD", basis: "SPLIT_ADJUSTED" });
  /* Auch als Objektpunkte, weil beide Formen in den Reihen vorkommen. */
  const objektform = Close.lastPoint(reihe({ points: [{ date: "2026-09-25", close: 101.25 }] }), HEUTE);
  assert.equal(objektform.close, 101.25);
});

test("jede einzelne Vertragsbedingung lehnt fuer sich ab", () => {
  const faelle = {
    "fremdes Schema": { schemaVersion: "discover-series-1.0.0" },
    "kein Echtbetrieb": { dataMode: "sample" },
    "fremde Quelle": { source: "other" },
    "fremder Anbieter": { provider: "other" },
    "nicht gerechnet": { status: "PENDING" },
    "falsche Kursbasis": { priceSeriesType: "TOTAL_RETURN" },
    "falsche Koernung": { grain: "weekly" },
    "keine Veroeffentlichungsbasis": { publishBasis: null },
    "keine Waehrung": { currency: null },
    "Stichtag fehlt": { asOf: null },
    "Stichtag in der Zukunft": { asOf: "2027-01-01" },
    "keine Punkte": { points: [] },
    "Punkt in der Zukunft": { points: [["2027-01-01", 9]] },
    "Kurs null": { points: [["2026-09-25", 0]] },
    "Kurs negativ": { points: [["2026-09-25", -5]] },
    "Kurs keine Zahl": { points: [["2026-09-25", "101.25"]] },
    "Datum unbrauchbar": { points: [["25.09.2026", 101.25]] }
  };
  for (const [name, patch] of Object.entries(faelle)) {
    assert.equal(Close.lastPoint(reihe(patch), HEUTE), null, name + " wurde nicht abgelehnt");
  }
  assert.equal(Close.lastPoint(null, HEUTE), null);
  assert.equal(Close.lastPoint({}, HEUTE), null);
});

test("derselbe Aufruf zweimal gibt dasselbe - der Stichtag kommt von aussen", () => {
  /* Wuerde die Funktion selbst "heute" bilden, haenge ihr Ergebnis an der
     Uhr des Laufs und nicht am Datenstand. */
  const gestern = Close.lastPoint(reihe(), "2026-09-24");
  assert.equal(gestern, null, "ein Punkt vom 25. ist am 24. noch Zukunft");
  assert.ok(Close.lastPoint(reihe(), "2026-09-25"));
});

test("der Faktorlauf bildet Boersenwerte aus dieser Reihe und sagt es", () => {
  /* Gemessen: 131 Titel hatten Anteilsbestand und Kurs und trotzdem keinen
     Boersenwert, weil nur die Technical-Buendel gelesen wurden. */
  const dir = join(ROOT, "quant/data/product/factor-evidence-v1");
  if (!existsSync(dir)) return;
  let ausReihe = 0, ausBuendel = 0, ohneQuelle = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json.gz") || name === "screening.json.gz" || name === "summary.json.gz") continue;
    const shard = JSON.parse(gunzipSync(readFileSync(join(dir, name))).toString("utf8"));
    for (const row of Object.values(shard.securities)) {
      if (!Number.isFinite(row.marketCap)) {
        /* Ohne Boersenwert steht dort auch keine Kursquelle - sonst waere sie
           eine Behauptung ueber eine Zahl, die es nicht gibt. */
        assert.equal(row.marketCapPriceSource, null, row.ticker);
        continue;
      }
      if (row.marketCapPriceSource === "PUBLISHED_CLOSE_FROM_SERIES") ausReihe += 1;
      else if (row.marketCapPriceSource === "TECHNICAL_BUNDLE_CLOSE") ausBuendel += 1;
      else ohneQuelle += 1;
    }
  }
  assert.equal(ohneQuelle, 0, ohneQuelle + " Boersenwerte nennen ihre Kursquelle nicht");
  assert.ok(ausBuendel > 1000, "kaum noch Kurse aus den Buendeln: " + ausBuendel);
  assert.ok(ausReihe > 50, "der Zugewinn aus der veroeffentlichten Reihe fehlt: " + ausReihe);

  /* Und kein Titel traegt noch den Grund "kein veroeffentlichter Kurs",
     solange eine gueltige Reihe fuer ihn existiert. */
  const seriesDir = join(ROOT, "quant/data/market/discover-series");
  if (!existsSync(seriesDir)) return;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json.gz") || name === "screening.json.gz" || name === "summary.json.gz") continue;
    const shard = JSON.parse(gunzipSync(readFileSync(join(dir, name))).toString("utf8"));
    for (const row of Object.values(shard.securities)) {
      if (row.marketCapReason !== "NO_PUBLISHED_CLOSE") continue;
      const pfad = join(seriesDir, row.securityId + ".json");
      if (!existsSync(pfad)) continue;
      assert.equal(Close.lastPoint(JSON.parse(readFileSync(pfad, "utf8")), row.dataCutoff), null,
        row.ticker + " sagt 'kein veroeffentlichter Kurs' und hat eine gueltige Reihe");
    }
  }
});
