/* =========================================================================
   VISION UNIVERSE — elliott-registry/split-adjusted-view.mjs

   EINGEFRORENE THESEN NACH EINEM SPLIT: ORIGINAL BLEIBT, ANSICHT KOMMT DAZU

   Eine Elliott-These friert absolute Kurse ein (Anker, Referenzlaenge,
   Zonen, Invalidierung, Bestaetigung). Kommt danach ein Split, steht die
   splitbereinigte Kursreihe auf einer anderen Basis als die These: MBRX
   (1:20 am 20.10.2026) hatte eine Zone 0,82-1,05 auf alter Basis, der
   bereinigte Kurs lag bei 5,61. Gemessen 23.10.2026: 7 Thesen
   (KNDI 2x, MBRX, NXGL 2x, SKIN 2x), alle ARCHIVED.

   Entscheidung des Eigentuemers (23.10.2026): eine These wird durch einen
   Split weder geloescht noch beendet. Die Originalwerte bleiben
   unveraendert; die angepassten Werte stehen getrennt daneben, mit
   Faktor, Splittagen und Stichtag. Historische Zustaende (stateAtFreeze,
   Ereignisse) werden nicht neu bewertet.

   Dieses Modul rechnet nur die Ansicht. Es schreibt keine These, aendert
   keine Zaehlung und keinen Zustand. Der Faktor kommt aus derselben
   Funktion wie jede Kursreihe (quant/engines/return-series.js#splitFactors,
   ADR-002): Splits mit Ex-Tag NACH dem Einfrieren, Wert / Produkt der Faktoren.

     node scripts/technical/elliott-registry/split-adjusted-view.mjs            Bericht
     node scripts/technical/elliott-registry/split-adjusted-view.mjs --out=P    als JSON
   ========================================================================= */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RS = require(join(ROOT, "quant", "engines", "return-series.js"));
const Identity = require(join(ROOT, "core", "identity.js"));

export const VIEW_SCHEMA = "elliott-thesis-split-view-1.0.0";

/** Kumulierter Faktor fuer einen Wert vom Tag `frozenAt`: Splits mit Ex-Tag danach
 *  (bis `asOf`). Ueber RS.splitFactors, damit es keine zweite Regel gibt. */
export function factorAfter(frozenAt, splits, asOf) {
  const later = (splits || []).filter(([d, f]) => d > frozenAt && (!asOf || d <= asOf) && Number.isFinite(f) && f > 0 && f !== 1)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!later.length) return { factor: 1, applied: [] };
  const bars = [{ date: frozenAt, splitFactor: 1 }].concat(later.map(([d, f]) => ({ date: d, splitFactor: f })));
  return { factor: RS.splitFactors(bars)[0], applied: later };
}

const adj = (v, k) => (typeof v === "number" && Number.isFinite(v) ? Number((v / k).toPrecision(6)) : v);

/** Ansicht einer These: je Revision Original (unveraendert) und angepasst. null, wenn kein Split danach. */
export function splitAdjustedThesis(thesis, splits, asOf = null) {
  const revisions = [];
  for (const r of thesis.revisions || []) {
    const { factor, applied } = factorAfter(r.frozenAt, splits, asOf);
    if (factor === 1) continue;
    const original = {
      anchor: r.anchor ? { price: r.anchor.price, time: r.anchor.time } : null,
      referenceLength: r.reference ? r.reference.length : null,
      zones: (r.zones || []).map((z) => ({ tier: z.tier, low: z.low, high: z.high, stateAtFreeze: z.stateAtFreeze })),
      invalidation: r.invalidation ? { price: r.invalidation.price, direction: r.invalidation.direction } : null,
      confirmation: r.confirmation ? { price: r.confirmation.price } : null
    };
    revisions.push({
      rev: r.rev, frozenAt: r.frozenAt,
      splitsApplied: applied, cumulativeFactor: factor,
      original,
      adjusted: {
        basis: "SPLIT_ADJUSTED",
        anchor: original.anchor ? { price: adj(original.anchor.price, factor), time: original.anchor.time } : null,
        referenceLength: adj(original.referenceLength, factor),
        /* stateAtFreeze bleibt der historische Befund vom Einfriertag, nicht neu bewertet. */
        zones: original.zones.map((z) => ({ tier: z.tier, low: adj(z.low, factor), high: adj(z.high, factor), stateAtFreeze: z.stateAtFreeze })),
        invalidation: original.invalidation ? { price: adj(original.invalidation.price, factor), direction: original.invalidation.direction } : null,
        confirmation: original.confirmation ? { price: adj(original.confirmation.price, factor) } : null
      }
    });
  }
  if (!revisions.length) return null;
  return { thesisId: thesis.id, symbol: thesis.symbol, timeframe: thesis.timeframe, state: thesis.state, revisions,
           note: "Originalwerte unveraendert; angepasste Werte = Original / kumulierter Splitfaktor (Splits nach dem Einfrieren)." };
}

function collectTheses(store) {
  const out = [];
  (function walk(o) {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o && typeof o === "object") { if (o.symbol && o.state && Array.isArray(o.revisions)) { out.push(o); return; } Object.values(o).forEach(walk); }
  })(store && store.theses);
  return out;
}

/** Bericht ueber den Registerstand: Splits aus der Wochenreihe (corporateActions.splits). */
export function buildView({ root = ROOT, asOf = null } = {}) {
  const store = JSON.parse(readFileSync(join(root, "quant/data/technical-intelligence/v3/projection-theses.json"), "utf8"));
  const theses = collectTheses(store), cache = new Map(), views = [];
  for (const t of theses) {
    if (!cache.has(t.symbol)) {
      let splits = [];
      try {
        const p = join(root, "quant/data/market/discover-series-long", Identity.securityIdForTicker(t.symbol) + ".json");
        if (existsSync(p)) splits = (JSON.parse(readFileSync(p, "utf8")).corporateActions || {}).splits || [];
      } catch (e) { splits = []; }
      cache.set(t.symbol, splits);
    }
    const v = splitAdjustedThesis(t, cache.get(t.symbol), asOf);
    if (v) views.push(v);
  }
  const byState = {};
  views.forEach((v) => { byState[v.state] = (byState[v.state] || 0) + 1; });
  return { schemaVersion: VIEW_SCHEMA, theses: theses.length, affected: views.length, byState, views };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = (n) => { const h = process.argv.find((a) => a.startsWith(n + "=")); return h ? h.slice(n.length + 1) : null; };
  const v = buildView({ asOf: arg("--as-of") });
  console.log(`Elliott-Thesen mit Split nach dem Einfrieren: ${v.affected} von ${v.theses} ${JSON.stringify(v.byState)}`);
  for (const x of v.views) for (const r of x.revisions) {
    const z = r.original.zones[0], a = r.adjusted.zones[0];
    console.log(`  ${x.symbol.padEnd(6)} ${x.state.padEnd(9)} rev ${r.rev} eingefroren ${r.frozenAt} · Splits ${JSON.stringify(r.splitsApplied)} · Faktor ${r.cumulativeFactor}` +
      (z ? ` · ${z.tier} ${z.low}-${z.high} -> ${a.low}-${a.high}` : ""));
  }
  const out = arg("--out");
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), ...v }, null, 1) + "\n"); }
}
