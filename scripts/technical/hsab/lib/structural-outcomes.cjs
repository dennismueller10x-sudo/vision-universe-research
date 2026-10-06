/* =========================================================================
   VU HISTORICAL STRUCTURAL ACCURACY BENCHMARK (Mission VIII) — Outcome-Regeln

   Reine Funktionen, die ein zum Zeitpunkt t EINGEFRORENES Szenario gegen die
   Kursbars t+1 … t+H pruefen. Kein Zugriff auf Engines; die Szenario-Ebenen
   kommen aus den versiegelten Replay-Records (Stage 1).

   Ebene A (strukturell, Hauptgroesse) — was dem Kunden gesagt wurde:
     "Hauptszenario X; Ziel 1 bei Z; ungueltig bei Schluss jenseits I."
     • Kein Einstieg noetig (das waere Ebene B, Ausfuehrung).
     • Ziel 1 erreicht: Hoch (bullish) >= Untergrenze der Zielzone bzw.
       Tief (bearish) <= Obergrenze. Auf Wochenschluss-Reihen (O=H=L=C) ist
       das der Schlusskurs.
     • Invalidation: SCHLUSS jenseits der Grenze (wie im Produkt).
     • Ziel und Invalidation in DERSELBEN Bar → AMBIGUOUS_SAME_BAR. In der
       Hauptgroesse KEIN Erfolg (konservativ, vorab registriert), getrennt
       gezaehlt. (Bei Schluss-Invalidation liegt die Beruehrung zeitlich vor
       dem Schluss; die guenstige Lesart wird nur als Sensitivitaet berichtet.)
     • Weder noch bis H → TIMEOUT (kein Erfolg).
     • Reihe endet vor H ohne Aufloesung → CENSORED (nicht gewertet, gezaehlt;
       Sensitivitaet: als Misserfolg).
     • Kurs bei t schon in/jenseits Ziel 1 → TRIVIAL_TARGET (nicht gewertet).
     • Kurs bei t schon jenseits der Invalidation → ALREADY_INVALID (nicht
       gewertet; das Produkt zeigt solche Szenarien als INVALIDATED).
   ========================================================================= */
"use strict";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Kodierung der Szenario-Geometrie (aus dem Replay-Record). */
function geometry(sc) {
  if (!sc || !(sc.dir === 1 || sc.dir === -1) || !isNum(sc.inv) || !sc.t1) return null;
  return { dir: sc.dir, inv: sc.inv, t1Lo: sc.t1[0], t1Hi: sc.t1[1], t2Lo: sc.t2 ? sc.t2[0] : null, t2Hi: sc.t2 ? sc.t2[1] : null, conf: isNum(sc.conf) ? sc.conf : null };
}

const RESOLVED = new Set(["TARGET1", "INVALIDATED", "AMBIGUOUS_SAME_BAR", "TIMEOUT"]);

/**
 * Strukturelles Ergebnis eines Szenarios.
 * @param {{high:number[],low:number[],close:number[]}} s  Serie
 * @param {number} t   Anzeige-Bar (Stand der Analyse)
 * @param {object} g   geometry()
 * @param {number} H   Horizont in Bars
 * @param {number} [atr] ATR bei t (fuer MFE/MAE in ATR)
 * @param {{closeTarget?:boolean}} [opt] Sensitivitaet: Ziel nur per SCHLUSS erreicht (symmetrisch zur Schluss-Invalidation)
 */
function primaryOutcome(s, t, g, H, atr, opt) {
  const cT = !!(opt && opt.closeTarget);
  const n = s.close.length, d = g.dir, c0 = s.close[t];
  const t1Near = d > 0 ? g.t1Lo : g.t1Hi, t2Near = d > 0 ? g.t2Lo : g.t2Hi;
  const beyondInv = (c) => (d > 0 ? c < g.inv : c > g.inv);
  const touches = (hi, lo, lvl, c) => (cT ? (d > 0 ? c >= lvl : c <= lvl) : d > 0 ? hi >= lvl : lo <= lvl);
  if (beyondInv(c0)) return { outcome: "ALREADY_INVALID" };
  if (d > 0 ? c0 >= t1Near : c0 <= t1Near) return { outcome: "TRIVIAL_TARGET" };
  let outcome = null, k = -1, t2 = null, confIdx = -1, mfe = 0, mae = 0, t1Idx = -1;
  const last = Math.min(n - 1, t + H);
  for (let j = t + 1; j <= last; j++) {
    const hi = s.high[j], lo = s.low[j], c = s.close[j];
    const fav = d > 0 ? hi - c0 : c0 - lo, adv = d > 0 ? c0 - lo : hi - c0;
    if (fav > mfe) mfe = fav; if (adv > mae) mae = adv;
    const inv = beyondInv(c), hit = touches(hi, lo, t1Near, c);
    if (g.conf !== null && confIdx < 0 && (d > 0 ? c > g.conf : c < g.conf) && !inv) confIdx = j;
    if (hit && inv) { outcome = "AMBIGUOUS_SAME_BAR"; k = j; break; }
    if (inv) { outcome = "INVALIDATED"; k = j; break; }
    if (hit) { outcome = "TARGET1"; k = j; t1Idx = j; break; }
  }
  if (!outcome) {
    if (t + H <= n - 1) { outcome = "TIMEOUT"; k = t + H; } else return { outcome: "CENSORED", barsObserved: last - t };
  }
  /* Ziel 2 vor Invalidation (innerhalb H), nur wenn Ziel 1 erreicht wurde. */
  if (isNum(t2Near)) {
    t2 = false;
    if (outcome === "TARGET1") {
      /* Beruehrung innerhalb einer Bar liegt vor deren Schluss; danach beendet ein Schluss jenseits der Grenze die Suche. */
      for (let j = t1Idx; j <= last; j++) {
        if (touches(s.high[j], s.low[j], t2Near, s.close[j])) { t2 = true; break; }
        if (beyondInv(s.close[j])) break;
      }
    }
  }
  return { outcome, bars: k - t, success: outcome === "TARGET1", t2,
           confirmed: g.conf === null ? null : confIdx >= 0 && confIdx <= k,
           mfeAtr: isNum(atr) && atr > 0 ? Math.round((mfe / atr) * 100) / 100 : null,
           maeAtr: isNum(atr) && atr > 0 ? Math.round((mae / atr) * 100) / 100 : null };
}

/**
 * Geometrie-neutrale Richtungsprobe: Schluss +k·ATR in Richtung d vor Schluss −k·ATR dagegen.
 * Gleiche Regel fuer VU und alle einfachen Modelle (symmetrisch, Zufall ≈ 50 % abzueglich Drift).
 */
function barrier(s, t, d, atr, k, H) {
  const n = s.close.length, c0 = s.close[t], up = c0 + d * k * atr, dn = c0 - d * k * atr;
  if (!(atr > 0) || !(c0 > 0)) return null;
  const last = Math.min(n - 1, t + H);
  for (let j = t + 1; j <= last; j++) {
    const c = s.close[j];
    if (d > 0 ? c >= up : c <= up) return 1;
    if (d > 0 ? c <= dn : c >= dn) return 0;
  }
  return t + H <= n - 1 ? 0.5 : null;   // 0.5 = unentschieden (TIMEOUT), null = zensiert
}

/** Rendite nach h Bars (Schluss zu Schluss), null wenn die Reihe vorher endet. */
function forward(s, t, h) { return t + h < s.close.length ? s.close[t + h] / s.close[t] - 1 : null; }

/** Ergebnis in R (Vielfache des Risikos bis zur Invalidation ab Anzeigeschluss): Ziel 1 → +Abstand/Risiko; sonst Schluss beim Ausgang. */
function rMultiple(s, t, g, o) {
  if (!o || !RESOLVED.has(o.outcome)) return null;
  const c0 = s.close[t], risk = Math.abs(c0 - g.inv); if (!(risk > 0)) return null;
  /* Winsorisiert auf ±5 R (Protokollnachtrag nach W_VAL, vor jeder Holdout-Oeffnung): winzige Risikoabstaende und Gaps erzeugen sonst Ausreisser von ±50 R. */
  const w = (x) => Math.max(-5, Math.min(5, x));
  if (o.outcome === "TARGET1") return w(Math.abs((g.dir > 0 ? g.t1Lo : g.t1Hi) - c0) / risk);
  const k = Math.min(s.close.length - 1, t + o.bars); return w((g.dir * (s.close[k] - c0)) / risk);
}

/** Kontroll-Geometrie in ATR-Einheiten: dieselben Abstaende an einer anderen Reihe/Zeit. */
function atrGeometry(g, c0, atr) {
  if (!(atr > 0)) return null;
  const d = g.dir, t1Near = d > 0 ? g.t1Lo : g.t1Hi, t2Near = d > 0 ? g.t2Lo : g.t2Hi;
  return { dir: d, kT: Math.abs(t1Near - c0) / atr, kI: Math.abs(c0 - g.inv) / atr, kT2: isNum(t2Near) ? Math.abs(t2Near - c0) / atr : null };
}
function applyAtrGeometry(ag, c0, atr) {
  const d = ag.dir, t1 = c0 + d * ag.kT * atr, inv = c0 - d * ag.kI * atr;
  if (!(inv > 0) || !(t1 > 0)) return null;
  const t2 = isNum(ag.kT2) ? c0 + d * ag.kT2 * atr : null;
  return { dir: d, inv, t1Lo: t1, t1Hi: t1, t2Lo: t2, t2Hi: t2, conf: null };
}

module.exports = { geometry, primaryOutcome, rMultiple, barrier, forward, atrGeometry, applyAtrGeometry, RESOLVED, VERSION: "hsab-outcomes-1.0.0" };
