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
