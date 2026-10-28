/* =========================================================================
   VISION UNIVERSE — split-supplement-effect.mjs

   VORHER/NACHHER EINER BELEGTEN SPLIT-ERGAENZUNG AUF DEN COMMITTETEN
   WOCHENREIHEN - OHNE HISTORIENABLAGE

   Der Herausgeber (publish-long-series.mjs) liest Tagesbalken aus R2; die
   gibt es hier nicht. Was sich deterministisch sagen laesst, steht in der
   committeten Wochenreihe: jeder Wochenschluss VOR dem Ex-Tag wird durch
   den Faktor geteilt, alles ab dem Ex-Tag bleibt. Weil die Reihe auf Cent
   gerundet veroeffentlicht ist, ist der neue Wert bei ungeradem Cent nicht
   eindeutig (x,xx5 liegt genau auf der Rundungskante): solche Punkte
   tragen [unten, oben] und `exact: false`.

   Daneben: der Kapitalmassnahmen-Beleg (splits + supplemented, moves neu),
   das Urteil des Wochen-Adapters (weekly-real-adapter.cjs, createLoader mit
   der korrigierten Kopie im Speicher) und - falls vorhanden - das
   historische KGV der Fundamental-Seite (fundamental/engine/catalog.js).

   Schreibt NUR nach --out (Pflicht). Keine Produktionsdaten.

     node scripts/market/split-supplement-effect.mjs --out=<datei.json> [--only=PZZA]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (n, f) => { const h = argv.find((a) => a.startsWith(n + "=")); return h ? h.slice(n.length + 1) : f; };

const Supplements = require(join(ROOT, "quant", "engines", "split-evidence-supplements.js"));
const PublishedClose = require(join(ROOT, "quant", "engines", "published-close.js"));
const CorporateActions = require(join(ROOT, "quant", "engines", "corporate-action-evidence.js"));
const Adapter = require(join(ROOT, "quant", "engines", "weekly-real-adapter.cjs"));

const sha = (s) => createHash("sha256").update(s).digest("hex");
const r6 = (v) => Math.round(v * 1e6) / 1e6;

/** Rundungseinheit eines veroeffentlichten Schlusses (published-close.js#roundClose). */
function unit(p) { return p >= 1 ? 0.01 : Math.pow(10, Math.floor(Math.log10(p)) - 3); }

/** Neuer Punkt aus dem gerundeten alten: [mitte, unten, oben], exakt wenn unten == oben. */
export function dividePublished(p, ratio) {
  const u = unit(p), eps = u * 1e-6;
  const lo = PublishedClose.roundClose((p - u / 2) / ratio), hi = PublishedClose.roundClose((p + u / 2 - eps) / ratio);
  return { value: PublishedClose.roundClose(p / ratio), lo, hi, exact: lo === hi };
}

/** Die Wochenreihe nach der Ergaenzung: Punkte vor dem Ex-Tag / ratio. Die Woche, die den Ex-Tag enthaelt, endet nach ihm. */
export function correctedDoc(doc, entry) {
  const ambiguous = [];
  const points = doc.points.map(([d, p]) => {
    if (d >= entry.exDate) return [d, p];
    const n = dividePublished(p, entry.ratio);
    if (!n.exact) ambiguous.push({ date: d, before: p, lo: n.lo, hi: n.hi });
    return [d, n.value];
  });
  const ca = doc.corporateActions ? JSON.parse(JSON.stringify(doc.corporateActions)) : null;
  const unresolvedMoves = [];
  if (ca) {
    ca.splits = ca.splits.concat([[entry.exDate, r6(entry.ratio)]]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    ca.supplemented = [{ date: entry.exDate, factor: r6(entry.ratio), id: entry.id, accession: entry.evidence[0].accession, source: "SEC_FILING_SUPPLEMENT" }];
    const byWeek = new Map(ca.moves.map((m) => [m.week, m]));
    ca.moves = [];
    for (let w = 1; w < points.length; w++) {
      const r = points[w][1] / points[w - 1][1];
      if (!CorporateActions.splitSized(r)) continue;
      const from = points[w - 1][0], to = points[w][0], alt = byWeek.get(to);
      /* Tagesverhaeltnisse innerhalb einer Woche, die ganz vor oder ganz nach dem Ex-Tag liegt, aendern sich nicht. */
      if (alt && (to < entry.exDate || from >= entry.exDate)) {
        ca.moves.push({ ...alt, weeklyRatio: r6(r), splitInWeek: ca.splits.some((s) => s[0] > from && s[0] <= to) });
      } else unresolvedMoves.push({ week: to, weeklyRatio: r6(r), reason: "NEEDS_DAILY_BARS" });
    }
  }
  return { doc: { ...doc, points, corporateActions: ca }, ambiguous, unresolvedMoves };
}

function adapterVerdict(loader, securityId, text) {
  try {
    const r = loader(securityId, text);
    return { ok: true, corporateActionQuality: r.corporateActionQuality.status, items: r.corporateActionQuality.items };
  } catch (e) { return { ok: false, error: String(e.message).slice(0, 400) }; }
}

async function historicalPe(ticker, before, after) {
  try {
    const C = require(join(ROOT, "fundamental", "engine", "catalog.js"));
    const { projectHistory, publicationDates, annualReportDates } = await import(join(ROOT, "scripts", "fundamental", "build-history.mjs"));
    const stockFile = join(ROOT, "discover", "data", "stocks", "US_REAL", ticker + ".json");
    if (!existsSync(stockFile)) return { state: "NO_STOCK" };
    const stock = JSON.parse(readFileSync(stockFile, "utf8"));
    const cik = stock.fundamentals && stock.fundamentals.cik;
    if (!cik) return { state: "NO_CIK" };
    const p = projectHistory(JSON.parse(readFileSync(join(ROOT, "quant", "data", "sec", "consumer", "CIK" + cik + ".json"), "utf8")), ticker);
    p.published = publicationDates(p, (await annualReportDates(ROOT)).get(cik));
    const pick = (h) => ({ state: h.state, reason: h.reason, splits: h.splits,
      rows: h.rows.map((r) => ({ fy: r.fy, filed: r.filed, factor: r.factor ?? null, eps: r.eps ?? null, price: r.price ?? null, priceDate: r.priceDate ?? null, pe: r.v === null ? null : Math.round(r.v * 100) / 100, reason: r.reason })) });
    const b = pick(C.historicalPe(C.fromHistory(p, stock), before)), a = pick(C.historicalPe(C.fromHistory(p, stock), after));
    const key = (r) => JSON.stringify([r.factor, r.eps, r.price, r.priceDate, r.pe, r.reason]);
    const changed = a.rows.filter((r, i) => !b.rows[i] || key(b.rows[i]) !== key(r)).map((r) => ({ fy: r.fy, before: b.rows.find((x) => x.fy === r.fy) || null, after: r }));
    return { stateBefore: b.state, stateAfter: a.state, fiscalYears: a.rows.map((r) => r.fy), splitsAfter: a.splits, rowsChanged: changed.length, changed,
             firstFyBefore: b.rows.length ? b.rows[0].fy : null };
  } catch (e) { return { state: "ERROR", error: String(e.message).slice(0, 300) }; }
}

export async function effect(root = ROOT, only = null) {
  const loader = Adapter.createLoader(root);
  const out = [];
  for (const entry of Supplements.config.entries) {
    if (only && !only.has(entry.ticker)) continue;
    const rel = join("quant", "data", "market", "discover-series-long", entry.securityId + ".json");
    const text = readFileSync(join(root, rel), "utf8");
    const doc = JSON.parse(text);
    const { doc: neu, ambiguous, unresolvedMoves } = correctedDoc(doc, entry);
    const neuText = JSON.stringify(neu);
    const changed = doc.points.map((p, i) => [p[0], p[1], neu.points[i][1]]).filter((x) => x[1] !== x[2]);
    const at = doc.points.findIndex((p) => p[0] >= entry.exDate);
    const around = doc.points.slice(Math.max(0, at - 3), at + 3).map((p, i) => ({ week: p[0], before: p[1], after: neu.points[Math.max(0, at - 3) + i][1] }));
    const ratioAt = (pts) => r6(pts[at][1] / pts[at - 1][1]);
    const ath = (pts) => pts.reduce((m, p) => (p[1] > m[1] ? p : m), pts[0]);
    out.push({
      id: entry.id, securityId: entry.securityId, ticker: entry.ticker, exDate: entry.exDate, ratio: entry.ratio,
      file: rel, sha256Before: sha(text), sha256AfterExpected: sha(neuText),
      points: doc.points.length, pointsChanged: changed.length, firstChanged: changed[0] ? changed[0][0] : null, lastChanged: changed.length ? changed[changed.length - 1][0] : null,
      pointsUnchanged: doc.points.length - changed.length, pointsAmbiguousByCentRounding: ambiguous.length,
      ambiguousSample: ambiguous.slice(0, 5),
      exWeek: { week: doc.points[at][0], ratioBefore: ratioAt(doc.points), ratioAfter: ratioAt(neu.points), splitSizedBefore: !!CorporateActions.splitSized(ratioAt(doc.points)), splitSizedAfter: !!CorporateActions.splitSized(ratioAt(neu.points)) },
      around,
      firstPoint: { before: doc.points[0], after: neu.points[0] },
      lastPoint: { before: doc.points[doc.points.length - 1], after: neu.points[neu.points.length - 1] },
      maxRangeReturn: { before: r6(doc.points[doc.points.length - 1][1] / doc.points[0][1]), after: r6(neu.points[neu.points.length - 1][1] / neu.points[0][1]) },
      allTimeHigh: { before: ath(doc.points), after: ath(neu.points) },
      corporateActions: { before: doc.corporateActions, afterExpected: neu.corporateActions, unresolvedMoves },
      weeklyAdapter: { before: adapterVerdict(loader, entry.securityId, text), after: adapterVerdict(loader, entry.securityId, neuText) },
      fundamentalHistoricalPe: await historicalPe(entry.ticker, doc, neu)
    });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const OUT = arg("--out", null);
  if (!OUT) { console.error("--out=<datei> fehlt (dieses Skript schreibt nie in Produktionsdaten)"); process.exit(2); }
  const only = arg("--only", null) ? new Set(arg("--only").split(",").map((t) => t.trim().toUpperCase())) : null;
  const rows = await effect(ROOT, only);
  const report = {
    schemaVersion: "split-supplement-effect-1.0.0",
    note: "Vorher/Nachher einer belegten Split-Ergaenzung, deterministisch auf der committeten Wochenreihe berechnet (scripts/market/split-supplement-effect.mjs). Der echte Neubau entsteht erst im Lauf des Herausgebers (long-series.yml) aus den Tagesbalken; Werte mit exact:false koennen dort um einen Cent abweichen.",
    supplementsFile: "quant/config/split-evidence-supplements.json",
    supplementsSha256: sha(readFileSync(join(ROOT, "quant", "config", "split-evidence-supplements.json"))),
    codeSha256: Object.fromEntries(["quant/engines/return-series.js", "quant/engines/split-evidence-supplements.js", "quant/engines/corporate-action-evidence.js",
      "scripts/market/publish-long-series.mjs", "scripts/market/publish-discover-series.mjs", "scripts/market/split-supplement-effect.mjs"].map((p) => [p, sha(readFileSync(join(ROOT, p)))])),
    rows
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
  for (const r of rows) console.log(`${r.ticker}: ${r.pointsChanged}/${r.points} Wochen geaendert (bis ${r.lastChanged}), Ex-Woche ${r.exWeek.ratioBefore} -> ${r.exWeek.ratioAfter}, Adapter vorher ${r.weeklyAdapter.before.ok ? r.weeklyAdapter.before.corporateActionQuality : "FEHLER"} / nachher ${r.weeklyAdapter.after.ok ? r.weeklyAdapter.after.corporateActionQuality : "FEHLER " + r.weeklyAdapter.after.error}`);
}
