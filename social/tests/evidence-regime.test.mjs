/* =========================================================================
   VU SOCIAL — Evidenzregime (ER1–ER16)

   Das Modul entscheidet, WORAN bewertet werden darf. Sein Wert liegt
   nicht darin, dass es Dimensionen ausschliesst, sondern dass es die
   Gruende auseinanderhaelt: "gibt es fuer diesen Medientyp nicht" und
   "zu wenige Messwerte" und "alle Werte gleich" verlangen drei
   verschiedene Antworten. Wer sie zusammenfasst, sucht Fehler an der
   falschen Stelle.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../engines/evidence-regime.js");
const P = require("../engines/performance.js");

const NOW = "2026-09-18T12:00:00Z";

function zeile(mediaType, metrics, i) {
  return {
    mediaId: mediaType + "_" + i,
    mediaType,
    permalink: mediaType === "REELS" ? "https://www.instagram.com/reel/X" + i : "https://www.instagram.com/p/X" + i,
    snapshot: { snapshotId: "s" + i, state: "VERIFIED", metrics: Object.assign({
      impressions: null, reach: null, views: null, watchTimeSeconds: null,
      completionRate: null, likes: null, comments: null, shares: null,
      saves: null, clicks: null, followersGained: null, engagementRate: null,
      profileVisits: null
    }, metrics) }
  };
}

const reels = (n, f) => Array.from({ length: n }, (_, i) => zeile("REELS", f(i), i));
const bilder = (n, f) => Array.from({ length: n }, (_, i) => zeile("IMAGE", f(i), i));

/* ------------------------------------------------------------ Dimensionen */

test("ER1 · Genug Messwerte mit Streuung: die Dimension ist ACTIVE", () => {
  const rows = reels(8, (i) => ({ reach: 20 + i * 3, engagementRate: 0.1 + i * 0.01 }));
  const d = R.assessDimension("reach", rows, R.DEFAULTS);
  assert.equal(d.state, "ACTIVE");
  assert.equal(d.sampleSize, 8);
});

test("ER2 · Zu wenige Messwerte: INSUFFICIENT_EVIDENCE, nicht 0", () => {
  const rows = reels(3, (i) => ({ reach: 20 + i }));
  const d = R.assessDimension("reach", rows, R.DEFAULTS);
  assert.equal(d.state, "INSUFFICIENT_EVIDENCE");
  assert.match(d.reason, /Nur 3 Messwerte/);
});

test("ER3 · Die Plattform meldet die Groesse nicht: NOT_APPLICABLE", () => {
  /* Ein Bildbeitrag hat keine Verweildauer. Das ist keine duenne
     Datenlage — mehr Bilder zu messen wuerde daran nichts aendern. */
  const rows = bilder(10, (i) => ({ reach: 10 + i, engagementRate: 0.2 }));
  const d = R.assessDimension("retention", rows, R.DEFAULTS);
  assert.equal(d.state, "NOT_APPLICABLE");
  assert.match(d.reason, /fuer diesen Medientyp nicht/);
});

test("ER4 · Alle Werte gleich: DEGENERATE — und ausdruecklich nicht 0-Leistung", () => {
  const rows = reels(9, () => ({ reach: 30, shares: 0, engagementRate: 0.2 }));
  const d = R.assessDimension("shares", rows, R.DEFAULTS);
  assert.equal(d.state, "DEGENERATE");
  assert.match(d.reason, /als 0-Leistung gelesen wuerde sie jeden abwerten/);
});

test("ER5 · Median 0 trotz Streuung: DEGENERATE mit anderem Grund", () => {
  /* Gegen 0 ist kein Verhaeltnis bildbar — ein anderer Grund als
     "alle gleich", und er steht auch anders da. */
  const rows = reels(9, (i) => ({ reach: 30, saves: i < 7 ? 0 : 3 }));
  const d = R.assessDimension("saves", rows, R.DEFAULTS);
  assert.equal(d.state, "DEGENERATE");
  assert.match(d.reason, /gegen 0 ist kein Verhaeltnis bildbar/i);
});

test("ER6 · Interne Bewertungen ohne Eingabe: NO_INPUT, nicht NOT_APPLICABLE", () => {
  /* Qualitaet und Markenpassung KOENNTE es geben — fuer selbst erzeugte
     Beitraege gibt es sie. Sie fehlen hier, weil niemand sie geliefert
     hat, und nicht, weil die Plattform sie nicht kennt. */
  const rows = reels(9, (i) => ({ reach: 20 + i }));
  const d = R.assessDimension("brandFit", rows, R.DEFAULTS);
  assert.equal(d.state, "NO_INPUT");
  assert.match(d.reason, /selbst erzeugte Beitraege/);
});

test("ER7 · Verweildauer zaehlt, wenn sie gemessen wurde", () => {
  const rows = reels(8, (i) => ({ reach: 20 + i, watchTimeSeconds: 3 + i * 0.4 }));
  const d = R.assessDimension("retention", rows, R.DEFAULTS);
  assert.equal(d.state, "ACTIVE");
});

/* ---------------------------------------------------------------- Kohorten */

test("ER8 · Reels und Bilder werden getrennt beurteilt", () => {
  /* Der Kern der Format-Semantik: ein gemeinsamer Median waere eine
     Zahl, die keinen von beiden beschreibt. */
  const rows = reels(8, (i) => ({ reach: 100 + i, engagementRate: 0.1, watchTimeSeconds: 3 + i }))
    .concat(bilder(8, (i) => ({ reach: 8 + i, engagementRate: 0.4 })));
  const a = R.assess(rows, { now: NOW });

  assert.ok(a.cohorts.REEL && a.cohorts.IMAGE);
  assert.equal(a.cohorts.REEL.sampleSize, 8);
  assert.ok(a.cohorts.REEL.activeDimensions.includes("retention"));
  assert.equal(a.cohorts.IMAGE.activeDimensions.includes("retention"), false);
});

test("ER9 · Jede Kohorte bekommt ihre eigene Vergleichsbasis", () => {
  const rows = reels(8, (i) => ({ reach: 100 + i, engagementRate: 0.1 }))
    .concat(bilder(8, (i) => ({ reach: 8 + i, engagementRate: 0.4 })));
  const a = R.assess(rows, { now: NOW });
  assert.ok(a.cohorts.REEL.baseline.medians.reach > 50);
  assert.ok(a.cohorts.IMAGE.baseline.medians.reach < 50);
});

test("ER10 · Die Kohorte wird abgelesen, nicht geraten", () => {
  assert.equal(R.cohortFor({ mediaType: "VIDEO" }), "REEL");
  assert.equal(R.cohortFor({ mediaType: "CAROUSEL_ALBUM" }), "CAROUSEL");
  assert.equal(R.cohortFor({ mediaType: "IMAGE" }), "IMAGE");
  /* Fehlt der Typ, verraet der Permalink ihn. */
  assert.equal(R.cohortFor({ permalink: "https://www.instagram.com/reel/A" }), "REEL");
  assert.equal(R.cohortFor({}), "UNKNOWN");
});

/* ----------------------------------------------------------------- Regime */

test("ER11 · Duenne Abdeckung ergibt BOOTSTRAP", () => {
  const rows = reels(8, (i) => ({ reach: 20 + i, engagementRate: 0.1 + i * 0.01 }));
  const a = R.assess(rows, { now: NOW });
  assert.equal(a.regime, "BOOTSTRAP");
  assert.match(a.cohorts.REEL.regimeReason, /Ziel: GROWING/);
});

test("ER12 · Volle Abdeckung und grosse Stichprobe ergeben MATURE", () => {
  /* Der Uebergang kommt aus der Messung, nicht aus einem Datum. */
  const rows = reels(60, (i) => ({
    reach: 100 + i, engagementRate: 0.1 + (i % 7) * 0.01, watchTimeSeconds: 3 + (i % 5),
    shares: 2 + (i % 4), saves: 3 + (i % 5), followersGained: 1 + (i % 3)
  })).map((r, i) => Object.assign(r, {
    context: { qualityScore: 0.6 + (i % 4) * 0.05, brandScore: 0.7 + (i % 3) * 0.05,
               strategicValue: 0.5 + (i % 5) * 0.05 }
  }));
  const a = R.assess(rows, { now: NOW });
  assert.equal(a.regime, "MATURE");
  assert.equal(a.cohorts.REEL.activeWeightShare, 1);
});

test("ER13 · Das Gesamtregime ist das NIEDRIGSTE der Kohorten", () => {
  /* Eine Anlage, die sich MATURE nennt, weil eine von zwei Kohorten reif
     ist, behandelte die andere mit einer Zuversicht, die es dort nicht
     gibt. */
  const reif = reels(60, (i) => ({
    reach: 100 + i, engagementRate: 0.1 + (i % 7) * 0.01, watchTimeSeconds: 3 + (i % 5),
    shares: 2 + (i % 4), saves: 3 + (i % 5), followersGained: 1 + (i % 3)
  }));
  const duenn = bilder(6, (i) => ({ reach: 8 + i, engagementRate: 0.3 }));
  const a = R.assess(reif.concat(duenn), { now: NOW });
  assert.equal(a.cohorts.REEL.regime, "GROWING");
  assert.equal(a.cohorts.IMAGE.regime, "BOOTSTRAP");
  assert.equal(a.regime, "BOOTSTRAP");
});

/* ------------------------------------------------------------- Methodik */

test("ER14 · Die Methodik enthaelt NUR zugelassene Dimensionen, auf 1 normiert", () => {
  const rows = reels(8, (i) => ({ reach: 20 + i, engagementRate: 0.1 + i * 0.01 }));
  const a = R.assess(rows, { now: NOW });
  const w = a.cohorts.REEL.methodology.weights;

  assert.deepEqual(Object.keys(w).sort(), ["engagement", "reach"]);
  const summe = Object.values(w).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(summe - 1) < 1e-9, "die Gewichte summieren auf 1");
});

test("ER15 · Mit dieser Methodik entsteht ein Score, ohne die Schwelle zu senken", () => {
  /* Der eigentliche Zweck. performance.score bleibt unveraendert — es
     bekommt nur andere Gewichte. Eine zweite Bewertungslogik waere der
     Ort, an dem dieselbe Regel spaeter zweimal steht. */
  const rows = reels(8, (i) => ({ reach: 20 + i * 4, engagementRate: 0.1 + i * 0.02 }));
  const a = R.assess(rows, { now: NOW });
  const k = a.cohorts.REEL;

  const ohne = P.score(rows[0].snapshot, k.baseline, {});
  const mit = P.score(rows[0].snapshot, k.baseline, {}, { methodology: k.methodology });

  assert.equal(ohne.available, false, "kanonisch reicht die Abdeckung nicht");
  assert.equal(mit.available, true, "im Regime schon");
  assert.equal(P.DEFAULT_METHODOLOGY.minimumCoverage, 0.5,
    "und die kanonische Schwelle wurde dabei NICHT angefasst");
});

test("ER16 · Der Befund fuer die Strategie-Version nennt Gruende, nicht nur Namen", () => {
  const rows = reels(8, (i) => ({ reach: 20 + i, engagementRate: 0.1 + i * 0.01, shares: 0 }));
  const a = R.assess(rows, { now: NOW });
  const r = a.record;

  assert.equal(r.evidenceRegime, "BOOTSTRAP");
  assert.equal(r.assessedAt, NOW);
  assert.equal(r.sampleSize, 8);
  const kohorte = r.cohorts[0];
  assert.deepEqual(kohorte.activeDimensions, ["reach", "engagement"]);
  for (const e of kohorte.excluded) {
    assert.ok(e.state && e.reason, "jeder Ausschluss traegt Zustand UND Grund");
    assert.ok(e.reason.length > 20, "und der Grund ist ein Satz, kein Etikett");
  }
});
