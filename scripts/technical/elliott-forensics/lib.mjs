/* Elliott-Forensik (Mission VI) — gemeinsame Bausteine.
   Nur Forschung: liest den eingefrorenen Practitioner-Datensatz V1, aber AUSSCHLIESSLICH die geoeffneten Faelle
   (DEVELOPMENT, VALIDATION). Die Holdouts (HOLDOUT_TEMPORAL, HOLDOUT_SOURCE) bleiben versiegelt: ihre Zeilen werden vor
   jedem Zugriff herausgefiltert und nie gelesen, gezaehlt wird nur ihre Anzahl. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { replayProjection, barsUntil, MIN_BARS, defaultLoader } from "../practitioner/replay.mjs";
import { effectiveMapping, loadInstrumentMap, normalizeWaveLabel, sourceFamily, loadSourceRegistry } from "../practitioner/lib.mjs";

const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
export const PAT = require(join(ROOT, "quant/engines/technical/elliott/patterns.js"));
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
export const FREEZE = join(ROOT, "quant/data/technical-intelligence/practitioner-v1/freeze/PRACTITIONER_REFERENCE_V1");
export const OPEN_SPLITS = Object.freeze(["DEVELOPMENT", "VALIDATION"]);

/** Geoeffnete Originalfaelle (Holdouts werden vor dem Parsen der Inhalte verworfen). */
export function openedCases(splits = OPEN_SPLITS) {
  const man = JSON.parse(readFileSync(FREEZE + ".manifest.json", "utf8"));
  const byCase = man.splits.byCase, open = new Set(Object.keys(byCase).filter((c) => splits.includes(byCase[c])));
  const sealed = Object.values(byCase).filter((s) => s.startsWith("HOLDOUT")).length;
  const rows = [];
  for (const line of readFileSync(FREEZE + ".jsonl", "utf8").split("\n")) {
    if (!line) continue;
    const m = /"caseId":"([^"]+)"/.exec(line);          // nur die Kennung pruefen, bevor die Zeile gelesen wird
    if (!m || !open.has(m[1])) continue;
    const r = JSON.parse(line);
    if (r.viewKind === "LATER_REVISION") continue;
    rows.push(Object.assign(r, { _split: byCase[r.caseId] }));
  }
  return { rows: rows.sort((a, b) => a.referenceId.localeCompare(b.referenceId)), sealedCases: sealed, freezeSha256: man.sha256 };
}

export function practitionerClass(r) {
  const p = r.primary || {}, pat = p.pattern || "UNKNOWN";
  const motive = ["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL"].includes(pat) || p.family === "MOTIVE";
  return { pattern: pat, family: p.family || "UNKNOWN", broad: motive ? "MOTIVE" : p.family === "CORRECTIVE" ? "CORRECTIVE" : "UNKNOWN",
           impulseLike: pat === "IMPULSE" || (motive && !String(pat).includes("DIAGONAL")), currentWave: normalizeWaveLabel(p.currentWave), state: p.state || null,
           direction: r.directionalBias || null, nextMove: p.nextMoveAfterCurrent || null, degreeRank: Number.isInteger(p.degreeRank) ? p.degreeRank : null };
}

/** Bars wie im blinden Replay (gleicher Lader, gleicher Stichtag, gleicher Zeitrahmen). */
export function caseBars(r, map = loadInstrumentMap(), loader = defaultLoader) {
  const m = effectiveMapping(r, map), p = replayProjection(r, m);
  if (!p.vuSymbol) return { status: "UNMAPPED", projection: p };
  const b = barsUntil(p, p.analysisCutoff, loader);
  if (b.bars.length < MIN_BARS[b.tf]) return { status: "INSUFFICIENT_DATA", projection: p, tf: b.tf, n: b.bars.length };
  return { status: "OK", projection: p, tf: b.tf, bars: b.bars, mapping: m };
}

/** Serie aus [datum, close] (Close-only wie Produktion/Replay) oder aus OHLC-Zeilen {date, open, high, low, close}. */
export function seriesFrom(bars, tf, opts = {}) {
  const rows = bars.map((b) => Array.isArray(b) ? { date: b[0], open: b[1], high: b[1], low: b[1], close: b[1], volume: null }
                                               : { date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? null });
  return Canonical.fromRows(rows, { instrumentId: opts.id || "X", exchange: "X", currency: "USD", timeframe: tf, priceSeriesType: "SPLIT_ADJUSTED",
    source: opts.source || "forensics", meta: { closeOnly: rows.every((x) => x.high === x.close && x.low === x.close) } });
}
export function runV3(series, tf, extra = {}) {
  const P = Ctx.prepare(series);
  return EV3.analyzeElliottV3(Object.assign({ series, features: P.features, pivots: P.pivots, barsPerYear: tf === "1W" ? 52 : 252 }, extra));
}

/** Kandidatenliste (debugAll) → Lesarten mit laufender Welle und Richtung. */
export function candidateReadings(r, series) {
  const all = (r.trace && r.trace.allCands) || [], close = series.close;
  return all.map((c, ix) => {
    const spec = PAT.PATTERNS[c.type], n = c.pts.length - 1, labels = spec.labels;
    const sign = close[c.pts[1]] >= close[c.pts[0]] ? 1 : -1;
    const k = c.complete ? spec.waves : n;                       // laufende bzw. letzte Welle (1-basiert)
    const legDir = (kk) => ((kk % 2 === 1) ? sign : -sign) > 0 ? "UP" : "DOWN";
    const curDir = c.complete ? (sign > 0 ? "DOWN" : "UP") : legDir(k);   // abgeschlossen: Folgebewegung laeuft gegen das Muster
    return { pos: ix, type: c.type, family: spec.family, complete: c.complete, waves: n, currentLabel: c.complete ? null : normalizeWaveLabel(labels[k - 1]),
             lastLabel: normalizeWaveLabel(labels[n - 1]), currentDir: curDir, spanBars: c.pts[c.pts.length - 1] - c.pts[0], start: c.pts[0], end: c.pts[c.pts.length - 1] };
  });
}
export const sourceFamilyOf = (id) => { try { return sourceFamily(id, loadSourceRegistry()); } catch { return id; } };
