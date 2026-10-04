/* Practitioner Reference Benchmark — Ergebnisstudie (Protokoll §11), GETRENNT von der Methodenaehnlichkeit.

   Nur dieses Modul liest Kurse NACH dem Stichtag. compare.mjs importiert es nicht; aufgerufen wird es nur von run-outcome.mjs,
   und zwar erst nach versiegeltem Vergleich (comparison.seal.json zum selben Freeze-Hash).
   Szenariorichtung = erwartete Bewegung AB JETZT: Praktiker directionalBias, VU currentWave.direction (Red-Team C1).
   Konventionen wie die TI-Methodik: Schlusskursbasis; Invalidation und Ziel auf demselben Bar → Invalidation zuerst;
   Luecken werden nicht interpoliert (es zaehlt der naechste vorhandene Bar). Keine Rankings, keine Trefferquoten je Quelle.
     T1/T2 = naechste bzw. zweitnaechste Zielzone in Szenariorichtung jenseits des Einstiegsschlusses (Zone, in der der
             Schluss schon liegt, zaehlt nicht). UP erreicht bei Schluss >= Zone.low, DOWN bei Schluss <= Zone.high.
     Invalidation: 'below' bei Schluss < Niveau, 'above' bei Schluss > Niveau. Ende der Auswertung bei Invalidation.
     MFE/MAE in % vom Einstiegsschluss in Szenariorichtung, bis zur Invalidation bzw. zum Horizontende.
     revisionBeforeOutcome: eine spaetere Fassung desselben Falls wurde vor dem ersten Ereignis (bzw. Horizontende) veroeffentlicht. */
import { round } from "./lib.mjs";
import { barsUntil, defaultLoader } from "./replay.mjs";
import { parsePublication } from "./cutoff.mjs";

export const DEFAULT_HORIZON = Object.freeze({ "1D": 252, "1W": 52 });

/**
 * @param o {direction:'UP'|'DOWN'|…, entryClose, invalidation:{price,direction}|null, targets:[{low,high}], bars:[[date,close]] (nur nach Stichtag)}
 */
export function evaluateOutcome(o) {
  const dir = o.direction, entry = o.entryClose, bars = o.bars || [];
  const res = { direction: dir || null, entryClose: entry, horizonBars: bars.length, t1: null, t2: null, invalidation: null, firstEvent: "NONE", mfePct: null, maePct: null, targetsUsable: 0, alreadyInZone: 0 };
  if (!Number.isFinite(entry) || entry <= 0) return Object.assign(res, { firstEvent: "NO_ENTRY" });
  const sgn = dir === "UP" ? 1 : dir === "DOWN" ? -1 : 0;
  let targets = [];
  if (sgn) {
    for (const z of o.targets || []) {
      const lo = Math.min(z.low, z.high), hi = Math.max(z.low, z.high);
      if (entry >= lo && entry <= hi) { res.alreadyInZone++; continue; }
      if (sgn > 0 && lo > entry) targets.push({ low: lo, high: hi });
      if (sgn < 0 && hi < entry) targets.push({ low: lo, high: hi });
    }
    targets.sort((a, b) => (sgn > 0 ? a.low - b.low : b.high - a.high));
  }
  res.targetsUsable = targets.length;
  const reached = (z, c) => (sgn > 0 ? c >= z.low : c <= z.high);
  const inv = o.invalidation && Number.isFinite(o.invalidation.price) ? o.invalidation : null;
  const invHit = (c) => inv && (inv.direction === "below" ? c < inv.price : inv.direction === "above" ? c > inv.price : false);
  let mfe = sgn ? 0 : null, mae = sgn ? 0 : null;
  for (let i = 0; i < bars.length; i++) {
    const [d, c] = bars[i];
    if (sgn) { const r = sgn * (c / entry - 1) * 100; mfe = Math.max(mfe, r); mae = Math.min(mae, r); }
    if (invHit(c)) {   // gleicher Bar wie Ziel → Invalidation zuerst
      res.invalidation = { date: d, bars: i + 1 };
      if (res.firstEvent === "NONE") res.firstEvent = "INVALIDATION";
      break;
    }
    if (targets[0] && !res.t1 && reached(targets[0], c)) { res.t1 = { date: d, bars: i + 1 }; if (res.firstEvent === "NONE") res.firstEvent = "T1"; }
    if (targets[1] && !res.t2 && reached(targets[1], c)) res.t2 = { date: d, bars: i + 1 };
  }
  if (!sgn && res.firstEvent === "NONE") res.firstEvent = inv ? "NONE" : "NO_DIRECTION";
  if (sgn && !targets.length && !inv) res.firstEvent = "NO_LEVELS";
  res.mfePct = round(mfe, 3); res.maePct = round(mae, 3);
  return res;
}

/** Bars strikt nach dem Stichtag-Bar (gleicher Zeitrahmen wie die Wiedergabe), begrenzt auf den Horizont. */
export function barsAfter(rec, horizon, loader = defaultLoader) {
  const all = barsUntil(rec.projection, "9999-12-31", loader).bars;
  return all.filter((b) => b[0] > rec.lastBarDate).slice(0, horizon);
}

/**
 * Ergebnis eines Falls fuer Praktiker und VU. chain = Fassungen des Falls (fuer revisionBeforeOutcome).
 * mapping: wirksame Abbildung (Skalierung der Praktiker-Niveaus).
 */
export function outcomeForCase(ref, mapping, rec, chain, opts = {}) {
  if (!rec || rec.status !== "OK") return { referenceId: ref.referenceId, status: rec ? rec.status : "MISSING" };
  const tf = rec.timeframeUsed, horizon = (opts.horizon && opts.horizon[tf]) || DEFAULT_HORIZON[tf];
  const bars = barsAfter(rec, horizon, opts.loader);
  const scale = mapping.levelsComparable ? mapping.levelScale : null, sc = (v) => (Number.isFinite(v) && Number.isFinite(scale) ? v * scale : null);
  const pr = evaluateOutcome({ direction: ref.directionalBias, entryClose: rec.market.closeAtCutoff, bars,
    invalidation: ref.invalidation && sc(ref.invalidation.price) !== null ? { price: sc(ref.invalidation.price), direction: ref.invalidation.direction } : null,
    targets: Number.isFinite(scale) ? (ref.targetZones || []).map((z) => ({ low: sc(z.low), high: sc(z.high) })) : [] });
  pr.levelsComparable = Number.isFinite(scale);
  const firstDate = (pr.firstEvent === "T1" && pr.t1 ? pr.t1.date : pr.firstEvent === "INVALIDATION" && pr.invalidation ? pr.invalidation.date : bars.length ? bars[bars.length - 1][0] : null);
  const pubOf = (r) => parsePublication(r.publication).instantMs;
  const laterRevs = (chain || []).filter((r) => r.referenceId !== ref.referenceId && pubOf(r) > pubOf(ref));
  pr.revisionBeforeOutcome = firstDate ? laterRevs.some((r) => r.analysisCutoff < firstDate) : null;
  const c = rec.vu && rec.vu.primary;
  /* C1: erwartete naechste Bewegung = laufende Bewegung (VU currentWave.direction; Praktiker directionalBias), nicht nextMove. */
  const vu = c ? evaluateOutcome({ direction: c.currentWave.direction, entryClose: rec.market.closeAtCutoff, bars, invalidation: c.invalidation, targets: c.targets }) : { firstEvent: "VU_NO_COUNT" };
  if (c) vu.abstain = rec.vu.applicability.abstain;
  return { referenceId: ref.referenceId, caseId: ref.caseId, timeframe: tf, horizonBars: horizon, barsAvailable: bars.length, status: "OK", practitioner: pr, vu };
}

export function aggregateOutcomes(rows) {
  const ok = rows.filter((r) => r.status === "OK");
  const dist = (k) => ok.reduce((o, r) => { const e = r[k].firstEvent; o[e] = (o[e] || 0) + 1; return o; }, {});
  const med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
  return { cases: ok.length, statusCounts: rows.reduce((o, r) => { o[r.status] = (o[r.status] || 0) + 1; return o; }, {}),
           practitioner: { firstEvent: dist("practitioner"), medianMfePct: med(ok.map((r) => r.practitioner.mfePct)), medianMaePct: med(ok.map((r) => r.practitioner.maePct)),
                           revisionBeforeOutcome: ok.filter((r) => r.practitioner.revisionBeforeOutcome).length },
           vu: { firstEvent: dist("vu"), medianMfePct: med(ok.map((r) => r.vu.mfePct)), medianMaePct: med(ok.map((r) => r.vu.maePct)) },
           note: "Gepoolt, ohne Rangfolge einzelner Quellen. Pflichtgrenzen: Publikations-, Loesch-, Auswahlverzerrung; unvollstaendige Archive; abweichende Kursquellen (Proxy); keine Intraday-Reihenfolge (Schlusskurs)." };
}
