/* =========================================================================
   VISION UNIVERSE TECHNICAL — evidence-phases.mjs
   MARKTPHASEN UND ZEITHAELFTEN FUER DIE TAGES-EVIDENZ (candlestick-, indicator-evidence)

   Phase je Datum aus der SPY-Tagesreihe (quant/data/market/multi-asset/series/SPY.json, seit 1995):
     UP   = SPY-Schluss an diesem Datum ueber seinem SMA 50 (nur Schluesse <= Datum, kausal). SMA 50 statt 200:
            im Tagesfenster (rund ein Jahr) lag SPY nur an 13 von 271 Tagen unter dem SMA 200, unter dem SMA 50 an 61.
     DOWN = darunter
   Zeithaelften: H1 = Ereignisdatum vor dem Median aller Ereignisdaten, H2 = ab diesem Datum (je etwa die Haelfte der Ereignisse;
   das Kursfenster ruhender Titel reicht weiter zurueck und taugt nicht als Mitte).
   Eine Aussage gilt erst als stabil, wenn die Richtung in allen vier Teilmengen dieselbe ist.

   VERGLEICHSGRUPPE UND MARKTBREITE (beschreibend, zusaetzlich; aendert weder `phases` noch `stableSign`):
     Vergleichsquote = Anteil ALLER Titel desselben Datums, die ueber dem Querschnittsmittel lagen (bei baerischer
            Lesart: darunter), gemittelt ueber die Ereignisdaten mit Vielfachheit. Das ist die Trefferquote, die ein
            zufaellig gewaehlter Titel an denselben Tagen gehabt haette. Sie liegt meist unter 50 %, weil der Median
            der Renditen unter ihrem Mittel liegt; der Vergleich mit 50 % ueberschaetzt deshalb kein Muster, er
            unterschaetzt aber die Huerde nicht richtig herum: massgeblich ist die Vergleichsquote.
     Marktbreite je Datum = Anteil der Titel mit Schluss ueber dem eigenen SMA 200 (aus der Vollhistorie, je Bar kausal).
            BROAD  = mindestens BREADTH_LEVEL (50 %) der Titel ueber dem SMA 200
            NARROW = darunter
   ========================================================================= */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SPY_FILE = join(root, "quant/data/market/multi-asset/series/SPY.json");
export const PHASE_SMA = 50;
export const SLICES = ["UP", "DOWN", "H1", "H2"];

/** Map Datum -> "UP" | "DOWN" aus Punkten [Datum, Schluss]; Daten vor dem ersten vollen SMA fehlen. */
export function dailyPhases(points, period = PHASE_SMA) {
  const out = new Map();
  let sum = 0;
  const c = points.map((p) => p[1]);
  for (let i = 0; i < c.length; i++) {
    sum += c[i];
    if (i >= period) sum -= c[i - period];
    if (i >= period - 1) out.set(String(points[i][0]).slice(0, 10), c[i] > sum / period ? "UP" : "DOWN");
  }
  return out;
}

export function loadPhases() { return dailyPhases(JSON.parse(readFileSync(SPY_FILE, "utf8")).points); }

/** Mitteldatum fuer die Zeithaelften: Median der Ereignisdaten mit Vielfachheit (je Haelfte etwa gleich viele Ereignisse). */
export function midDate(dates) { const d = dates.slice().sort(); return d[d.length >> 1]; }

/** Teilmengen eines Ereignisdatums. */
export function slicesOf(date, phases, mid) {
  const out = [], p = phases.get(date);
  if (p) out.push(p);
  out.push(date < mid ? "H1" : "H2");
  return out;
}

/** Stabil: in allen vier Teilmengen dasselbe Vorzeichen des Mittels (und jede Teilmenge mit mindestens minN Ereignissen). */
export function stable(byPhase, minN) {
  const s = SLICES.map((k) => byPhase[k]);
  if (s.some((x) => !x || x.n < minN || x.mean === null)) return null;
  const sg = s.map((x) => Math.sign(x.mean));
  return sg.every((v) => v === sg[0] && v !== 0) ? sg[0] : 0;
}

export const BREADTH_SLICES = ["BROAD", "NARROW"], BREADTH_LEVEL = 0.5, BASE_MIN_TITLES = 50;
const fin = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Marktbreite je Datum. add(dates, close, sma200) je Titel (gleich lange Reihen), finish() -> Map Datum -> { share, n, phase }.
 * Kausal: Schluss und SMA 200 desselben Bars; Daten mit weniger als minTitles Titeln bekommen keine Phase.
 */
export function breadthAccumulator(level = BREADTH_LEVEL, minTitles = BASE_MIN_TITLES) {
  const acc = new Map();
  return {
    add(dates, close, sma200) {
      if (!Array.isArray(sma200) || sma200.length !== close.length) return;
      for (let i = 0; i < close.length; i++) {
        const c = close[i], s = sma200[i];
        if (!(c > 0) || !fin(s) || !(s > 0)) continue;
        const d = String(dates[i]).slice(0, 10), e = acc.get(d) || [0, 0];
        e[1]++; if (c > s) e[0]++; acc.set(d, e);
      }
    },
    finish() {
      const out = new Map();
      for (const [d, [above, n]] of acc) if (n >= minTitles) out.set(d, { share: above / n, n, phase: above / n >= level ? "BROAD" : "NARROW" });
      return out;
    }
  };
}

/**
 * Vergleichsgruppe je Datum: wie viele Titel lagen ueber (pos) bzw. unter (neg) dem Querschnittsmittel desselben Datums.
 * returnsByDate: Map Datum -> Array der Renditen aller Titel; nur Daten mit mindestens minTitles Titeln.
 */
export function baseCounts(returnsByDate, minTitles = BASE_MIN_TITLES) {
  const out = new Map();
  for (const [d, rs] of returnsByDate) {
    if (rs.length < minTitles) continue;
    let s = 0; for (const r of rs) s += r;
    const m = s / rs.length; let pos = 0, neg = 0;
    for (const r of rs) { if (r > m) pos++; else if (r < m) neg++; }
    out.set(d, { pos, neg, n: rs.length });
  }
  return out;
}

/**
 * Vergleichsquote fuer eine Ereignismenge: dates = Ereignisdaten (mit Vielfachheit), dir < 0 = baerische Lesart.
 * null, wenn kein Datum eine Vergleichsgruppe hat.
 */
export function baseRate(dates, dir, counts) {
  let s = 0, k = 0;
  for (const d of dates) { const c = counts.get(d); if (!c) continue; s += (dir < 0 ? c.neg : c.pos) / c.n; k++; }
  return k ? s / k : null;
}
