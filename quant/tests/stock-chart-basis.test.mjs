/* =========================================================================
   DER CHART DER AKTIENSEITE TRAEGT DIE BASIS, DIE SEIN VERTRAG BINDET.

   Der Befund vom 25.09.2026: die Aktienseite zeichnete die Rohkurse des
   Anbieters. Bei NVDA faellt der 10:1-Split vom 10.06.2024 in die Fenster
   3J, 5J, 10J und Max - 1.208,88 am Vortag, 121,79 am Splittag, also minus
   89,9 Prozent an einem Tag, die es nie gab. Bei AAPL dasselbe mit dem 4:1
   vom 31.08.2020 in 10J und Max.

   Option C bindet das Modul `chart` auf SPLIT_ADJUSTED_PRICE. Diese Datei
   haelt beides fest: dass der Befund echt war (an den gelieferten Daten)
   und dass die gezeichnete Reihe ihn nicht mehr enthaelt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Series = require("../engines/return-series.js");
const ROOT = new URL("../../", import.meta.url);
const services = readFileSync(new URL("quant/api/product-services.js", ROOT), "utf8");
const experience = readFileSync(new URL("vu2/experience.js", ROOT), "utf8");

const GOLDEN = ["ref_NVDA", "ref_AAPL", "ref_MSFT", "ref_JPM", "ref_XOM"];
function payload(id) {
  const file = new URL("quant/data/market/golden-preview/daily/" + id + ".json", ROOT);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

test("the delivered series really does jump at a split - the finding was not hypothetical", () => {
  const nvda = payload("ref_NVDA");
  if (!nvda) return;   /* Der Vorschau-Ausschnitt ist nicht in jedem Baum da. */
  const i = nvda.bars.findIndex((bar) => bar.date === "2024-06-10");
  assert.ok(i > 0, "der Splittag fehlt in der Reihe");
  assert.equal(nvda.bars[i].splitFactor, 10);
  const roh = nvda.bars[i].close / nvda.bars[i - 1].close - 1;
  assert.ok(roh < -0.85, "der Rohkurs springt nicht - dann ist dieser Test wertlos");
});

test("the reconstructed series has no day that a split invented", () => {
  for (const id of GOLDEN) {
    const p = payload(id);
    if (!p) continue;
    const close = Series.splitAdjustedColumn(p.bars, "close");
    for (let i = 1; i < close.length; i++) {
      if (!(close[i] > 0) || !(close[i - 1] > 0)) continue;
      const change = close[i] / close[i - 1] - 1;
      /* 25 Prozent an einem Tag gibt es wirklich; 85 nicht, und ein
         nicht bereinigter 10:1 liegt bei 90. */
      assert.ok(Math.abs(change) < 0.6,
        id + " springt am " + p.bars[i].date + " um " + Math.round(change * 1000) / 10 + " %");
    }
  }
});

test("the reconstruction keeps the traded price and only rescales the past", () => {
  for (const id of GOLDEN) {
    const p = payload(id);
    if (!p) continue;
    const close = Series.splitAdjustedColumn(p.bars, "close");
    /* Der letzte Kurs bleibt der gehandelte - genau das sagt die
       Bildunterschrift, und genau das muss gelten. */
    assert.equal(close[close.length - 1], p.bars[p.bars.length - 1].close);
    /* Und jede Rendite ueber einen splitfreien Abschnitt bleibt gleich. */
    for (let i = 1; i < p.bars.length; i++) {
      if (p.bars[i].splitFactor !== 1) continue;
      const roh = p.bars[i].close / p.bars[i - 1].close - 1;
      const bereinigt = close[i] / close[i - 1] - 1;
      assert.ok(Math.abs(roh - bereinigt) < 1e-9, id + " " + p.bars[i].date);
    }
  }
});

test("the service reconstructs rather than picking a column, and says which it did", () => {
  /* Die Rekonstruktion kommt aus return-series - nicht aus einer zweiten
     Rechnung in der Dienstschicht, und ausdruecklich nicht aus der
     dividendenbereinigten Spalte des Anbieters. */
  assert.match(services, /ReturnSeries\.splitAdjustedColumn\(bars,'close'\)/);
  assert.equal(/adjustedClose/.test(services.slice(services.indexOf("golden-preview/daily"),
    services.indexOf("stock._factorValues"))), false,
    "die bereinigte Spalte des Anbieters wird im Chartpfad gelesen");
  assert.match(services, /priceSource:splitbereinigt\?'RECONSTRUCTED_FROM_SPLIT_FACTOR':'PROVIDER_RAW_CLOSE'/);
  /* Fehlt ein Baustein, geht die Stufe ehrlich als 'unadjusted' hinaus. */
  assert.match(services, /adjustmentStatus:splitbereinigt\?'splitAdjusted':'unadjusted'/);
});

test("the caption follows the series instead of asserting a basis", () => {
  assert.match(experience, /const chartBasis=s\.chart&&s\.chart\.adjustmentStatus==='splitAdjusted'/);
  assert.match(experience, /Splitbereinigte Schlusskurse · USD\. Splits sind herausgerechnet/);
  assert.match(experience, /fehlen die Splitfaktoren, deshalb können Splits als Kurssprünge erscheinen/);
  /* Der alte, feste Satz ist weg - nicht danebengestellt. */
  assert.equal(/text:'Unbereinigte Schlusskurse · USD\. Splits können historische Kurssprünge verursachen\.'/.test(experience), false);
  /* Und die Engine ist in der Seite geladen, sonst faellt die
     Rekonstruktion im Browser still aus. */
  const index = readFileSync(new URL("vu2/index.html", ROOT), "utf8");
  assert.match(index, /quant\/engines\/return-series\.js/);
});
