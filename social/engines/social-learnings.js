/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/social-learnings.js

   SOCIAL INTELLIGENCE ALS FEEDBACK, NICHT ALS REDAKTEUR (Owner-Auftrag
   "WORK OWNS THE POST", 29.09., §3/§27/§50)

   Aus den gemessenen eigenen Posts (social/data/performance.json) werden
   beschreibende Saetze fuer ChatGPT Work - mit Stichprobengroesse, ohne
   Anweisung. Nichts hier ist VU Quant; nichts hier waehlt eine Story.

   Nur was gemessen ist, wird gesagt: eine Gruppe unter MIN_N Posts
   bekommt keinen Satz, und Dimensionen, die die Messung nicht kennt
   (Thema, Hook-Art), werden als "noch nicht erfasst" benannt statt
   geraten.
   ========================================================================= */
"use strict";

const MIN_N = 3;

const FORMAT_NAME = { VIDEO: "Reels/Videos", IMAGE: "Einzelbilder", CAROUSEL_ALBUM: "Carousels" };

function median(werte) {
  const w = werte.filter((x) => typeof x === "number" && isFinite(x)).sort((a, b) => a - b);
  if (!w.length) return null;
  const m = Math.floor(w.length / 2);
  return w.length % 2 ? w[m] : (w[m - 1] + w[m]) / 2;
}

function runde(x) { return x === null ? null : Math.round(x * 10) / 10; }

/**
 * @param performance  Inhalt von social/data/performance.json
 * @returns [{ id, statement, n }]  leer, wenn nichts belastbar ist
 */
function ableiten(performance) {
  const snaps = ((performance && performance.snapshots) || [])
    .filter((s) => s && s.snapshot && s.snapshot.metrics && s.snapshot.state === "VERIFIED");
  if (snaps.length < MIN_N) return [];

  const gruppen = {};
  snaps.forEach((s) => {
    const k = s.mediaType || "UNBEKANNT";
    (gruppen[k] = gruppen[k] || []).push(s.snapshot.metrics);
  });

  const lernen = [];
  const reihen = Object.keys(gruppen).filter((k) => gruppen[k].length >= MIN_N).map((k) => ({
    format: k, n: gruppen[k].length,
    reach: median(gruppen[k].map((m) => m.reach)),
    saves: median(gruppen[k].map((m) => m.saves)),
    shares: median(gruppen[k].map((m) => m.shares)),
    likes: median(gruppen[k].map((m) => m.likes))
  }));

  reihen.forEach((r) => {
    lernen.push({ id: "format:" + r.format, n: r.n,
      statement: (FORMAT_NAME[r.format] || r.format) + " (n=" + r.n + " gemessene Posts): " +
        "Median-Reichweite " + runde(r.reach) + ", Likes " + runde(r.likes) + ", Saves " +
        runde(r.saves) + ", Shares " + runde(r.shares) + "." });
  });

  const alleSaves = snaps.map((s) => s.snapshot.metrics.saves || 0);
  const alleShares = snaps.map((s) => s.snapshot.metrics.shares || 0);
  const summeSaves = alleSaves.reduce((a, b) => a + b, 0);
  const summeShares = alleShares.reduce((a, b) => a + b, 0);
  const wenig = (summeSaves + summeShares) < snaps.length;
  lernen.push({ id: "saves-shares", n: snaps.length,
    statement: "Ueber alle " + snaps.length + " gemessenen Posts zusammen: " + summeSaves +
      " Saves und " + summeShares + " Shares" + (wenig
        ? " - weniger als eine solche Interaktion pro Post; Inhalte, die man speichern oder " +
          "weiterschicken will, sind bisher die groesste Luecke."
        : ".") });

  lernen.push({ id: "not-yet-measured", n: 0,
    statement: "Thema, Hook-Art und Carousel-Struktur der frueheren Posts sind noch nicht " +
      "erfasst - dazu gibt es noch keine belastbaren Learnings." });
  return lernen;
}

module.exports = { MIN_N, ableiten, median };
