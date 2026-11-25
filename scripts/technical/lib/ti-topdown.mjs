/* Elliott von oben im Produkt (Owner 23.11.2026): kompakte Form der Zaehlung des grossen Grades, ihrer Unterteilung und des Pfads
   (quant/engines/technical/elliott/elliott-topdown.js) fuer das Chartbild-Produkt v3. Rechnet auf der vollen Wochenreihe seit
   Handelsbeginn; dazu eine Monatsreihe der Schlusskurse fuer das Bild „Großes Bild“. Build, Drift-Pruefung und Tests rechnen damit
   identisch. */
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./ti-data.mjs";

const TD = createRequire(import.meta.url)(join(ROOT, "quant/engines/technical/elliott/elliott-topdown.js"));
export const TOPDOWN_VERSION = TD.VERSION;

/** Preis auf 4 signifikante Stellen (Anzeige, kein Rechenwert). */
export function sig(v) { if (typeof v !== "number" || !isFinite(v)) return null; if (v === 0) return 0; const d = Math.max(0, 3 - Math.floor(Math.log10(Math.abs(v)))); return Number(v.toFixed(Math.min(d, 6))); }
const wave = (w) => ({ l: w.label, ft: w.fromTime, fp: sig(w.fromPrice), tt: w.toTime, tp: sig(w.toPrice), dev: w.status === "DEVELOPING" ? 1 : 0 });
function count(c) {
  if (!c) return null;
  return { kind: c.kind, dir: c.direction, cur: c.current.label, curDir: c.current.direction, waves: c.waves.map(wave),
           inv: c.invalidation ? { p: sig(c.invalidation.price), d: c.invalidation.direction, rule: c.invalidation.ruleId, text: c.invalidation.text } : null,
           rules: c.rules.map((r) => r.id), fit: c.guidelineFit, anchor: c.anchor };
}
const step = (s) => ({ l: s.label, disp: s.display, deg: s.degree, dir: s.direction, dev: s.developing ? 1 : 0, from: sig(s.anchor), point: sig(s.point), ex: s.exhausted ? 1 : 0, scale: s.scale,
  rel: s.zone.relation, tiers: s.zone.tiers.map((z) => ({ t: z.tier, lo: sig(z.low), hi: sig(z.high), r: z.ratios, done: z.passed ? 1 : 0 })) });
/** Monatsschluesse (letzter Wochenschluss je Monat) seit Handelsbeginn. */
export function monthly(times, close) {
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const m = String(times[i]).slice(0, 7);
    if (out.length && out[out.length - 1][0].slice(0, 7) === m) out[out.length - 1] = [times[i], sig(close[i])];
    else out.push([times[i], sig(close[i])]);
  }
  return out;
}
/** Kompakte Zaehlung von oben fuer eine Wochenreihe (canonical series: timestamps, close). null bei zu kurzer Historie. */
export function topDownFor(series) {
  if (!series || series.timeframe !== "1W" || !series.close || series.close.length < 104) return null;
  let r; try { r = TD.analyzeTopDown({ close: series.close, times: series.timestamps }); } catch (e) { return { v: TD.VERSION, status: "ERROR" }; }
  if (!r || r.status !== "OK") return { v: TD.VERSION, status: r ? r.status : "ERROR" };
  return {
    v: TD.VERSION, status: "OK", asOf: r.asOf, close: sig(r.close),
    primary: count(r.primary), alternative: count(r.alternative), sub: count(r.sub),
    path: r.path.map(step),
    altSub: count(r.alternativeSub), altPath: (r.alternativePath || []).map(step),
    candidates: r.candidates || null,
    monthly: monthly(series.timestamps, series.close)
  };
}
