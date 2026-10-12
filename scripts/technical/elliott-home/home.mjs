/* =========================================================================
   VU Elliott Home — kompakter Entdeckungsindex (elliott-home-1.0.0)

   Eine LIEFERANSICHT der veroeffentlichten Technical-Intelligence-Shards, wie
   product/technical-signals-v1/by-ticker: sie erzeugt keine Zaehlung, keine
   Projektion und keinen Rang, sondern waehlt aus dem Produkt aus, was der
   Kunde auf der Elliott-Startseite sehen darf, und ordnet es in Reihen.

   Quellen (nur lesend):
     - quant/data/technical-intelligence/v3/{index.json.gz, shards/*.json.gz, meta.json}
     - Namen: quant/data/product/universe-list-v1.json.gz (nur Anzeige)

   Regeln (alle aus dem Produkt uebernommen, keine zweite Ableitung):
     - Welche Thesen der Kunde sieht: ti-projection.mjs#displayedTheses
       (PRIMARY, ALTERNATIVE, HIGH_UPSIDE nur bei consumerVisible; Motiv-Alternative
       und Explore Highlights eigenstaendig; Candidate Explorer nie).
     - Datenstand (data-freshness-1.0.0): nur FRESH und DELAYED. Zurueckgehaltene
       Titel (STALE, NON_TRADING) tragen im Shard keine Projektion und stehen hier nie.
     - Wertpapierart: nur Titel des Index (= Produktuniversum des Builds) mit Namenseintrag.
     - Reihenfolge: deterministisch, ohne Projektionsgroesse und ohne Zukunftsdaten.
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { displayedTheses } from "../lib/ti-projection.mjs";

export const HOME_VERSION = "elliott-home-1.0.0";
export const HOME_SCHEMA = "vu-elliott-home-1.0.0";
export const HOME_PATH = "quant/data/technical-intelligence/v3/elliott-home.json";

/** Rollen in Anzeigereihenfolge (klein = vorn). Rolle und Kennzeichnung bleiben im Kartenfeld role. */
export const ROLE_ORDER = { PRIMARY: 0, ALTERNATIVE: 1, HIGH_UPSIDE: 2, MOTIVE_ALTERNATIVE: 3, EXPLORE_HIGHLIGHT: 4 };
const VISIBLE_FRESHNESS = new Set(["FRESH", "DELAYED"]);
const TIERS = { BASE: "base", EXTENDED: "ext", EXTREME: "xtr" };
/** Welle je Projektionstyp. Folgebewegung, Gegenbewegung und Ausbruch sind keine Wellennummer. */
export const WAVE_OF_TYPE = { WAVE_3: "3", WAVE_5: "5", WAVE_C: "C" };
export const MIN_ROW = 3;      // kleinere Gruppen bilden keine Reihe, bleiben aber ueber den Filter erreichbar
export const ROW_CAP = 24;     // Karten je Reihe auf der Startseite; der Rest ueber "Alle ansehen"
export const RECENT_DAYS = 2;
const RECENT_EVENTS = { CREATED: "NEW", CONFIRMED: "CONFIRMED", ROLE_CHANGED: "ROLE", REVISED: "REVISED", BASE_PROJECTION_REACHED: "ZONE", EXTENDED_PROJECTION_REACHED: "ZONE", EXTREME_PROJECTION_REACHED: "ZONE" };
const RECENT_PRIORITY = { CONFIRMED: 0, ROLE: 1, NEW: 2, ZONE: 3, REVISED: 4 };

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const round = (x, d) => (num(x) === null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Trend und Marktstruktur in Thesenrichtung: 0..2. Unbekannt zaehlt nicht als Gegenkontext. Relative Staerke ist bewusst nicht Teil der Reihenfolge. */
export function contextAgreement(dir, ctx) {
  if (!ctx) return 0;
  const up = dir === "UP";
  let n = 0;
  const trend = ctx.trend && ctx.trend.state;
  if ((up && trend === "POSITIVE") || (!up && trend === "NEGATIVE")) n++;
  const v = ctx.structure && num(ctx.structure.vote);
  if (v !== null && ((up && v > 0) || (!up && v < 0))) n++;
  return n;
}

const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/** Juengstes relevantes Lebenszyklusereignis innerhalb des Fensters (nur Beschreibung, keine Bewertung). */
export function recentChange(thesis, asOf) {
  const events = thesis && thesis.lifecycle && Array.isArray(thesis.lifecycle.events) ? thesis.lifecycle.events : [];
  let best = null;
  for (const e of events) {
    const kind = RECENT_EVENTS[e.type];
    if (!kind || !e.d) continue;
    const age = days(e.d, asOf);
    if (!(age >= 0 && age <= RECENT_DAYS)) continue;
    if (!best || e.d > best.d || (e.d === best.d && RECENT_PRIORITY[kind] < RECENT_PRIORITY[best.kind])) best = { kind, d: e.d, type: e.type };
  }
  return best;
}

/** Projektionsstufen, die noch etwas zu zeigen haben: nicht durchlaufen (PASSED) und in Richtung der These (eine Stufe, die
    den Kurs enthaelt, gilt auch). Prozente sind Bruchteile des aktuellen Kurses. */
export function liveTiers(thesis) {
  const up = thesis.direction === "UP", tiers = {};
  for (const z of thesis.zones || []) {
    const key = TIERS[z.tier], lo = num(z.pctLow), hi = num(z.pctHigh);
    if (!key || lo === null || hi === null || z.state === "PASSED") continue;
    if (up ? hi < 0 : lo > 0) continue;
    // Eine Zone, die den Kurs enthaelt, wird auf ihren Teil in Thesenrichtung gekuerzt (die Karte nennt nie einen Rueckgang als Aufwaertsziel); der Chart zeigt die ganze Zone.
    tiers[key] = up ? [round(Math.max(lo, 0), 4), round(hi, 4)] : [round(lo, 4), round(Math.min(hi, 0), 4)];
  }
  return tiers;
}

/** Eine kundensichtbare These -> Karte. Reine Funktion der Shard-Daten. */
export function cardOf({ symbol, name, currency, role, thesis, proj, doc, ordinal }) {
  const fr = doc.freshness || {};
  const pool = thesis.pool && num(thesis.pool.rank) !== null && num(thesis.pool.size) ? { pos: thesis.pool.rank + 1, size: thesis.pool.size } : null;
  const tiers = liveTiers(thesis);
  const ctx = proj.context || null;
  const change = recentChange(thesis, proj.asOf || doc.asOf);
  return {
    id: symbol + ":" + role.charAt(0) + ":" + ordinal,
    t: symbol, n: name, cur: currency || null,
    role,
    type: thesis.type, wave: WAVE_OF_TYPE[thesis.type] || null,
    dir: thesis.direction, st: thesis.status,
    pattern: thesis.patternName || thesis.pattern || null,
    close: round(num(proj.close) !== null ? proj.close : doc.price && doc.price.close, 4),
    tiers,
    inv: thesis.invalidation && num(thesis.invalidation.price) !== null ? { p: thesis.invalidation.price, dir: thesis.invalidation.direction } : null,
    fr: fr.state || "FRESH", last: fr.lastBar || null,
    pool,
    gate: role === "EXPLORE_HIGHLIGHT" && thesis.qualityGates ? (thesis.qualityGates.failed || []) : [],
    ctx: ctx ? { trend: (ctx.trend && ctx.trend.state) || null, rs: ctx.rs && num(ctx.rs.rank) !== null && ctx.rs.state !== "UNAVAILABLE" ? round(ctx.rs.rank, 3) : null, ms: ctx.structure && num(ctx.structure.vote) !== null ? round(ctx.structure.vote, 2) : null } : null,
    agree: contextAgreement(thesis.direction, ctx),
    chg: change ? { k: change.kind, d: change.d } : null
  };
}

/** Anzeigereihenfolge: Rolle, bestaetigt vor entwickelnd, Rang im Pool, Kontext, Kuerzel. Kein Punktwert, keine Projektionsgroesse. */
export function compareCards(a, b) {
  return ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
    || (a.st === "CONFIRMED" ? 0 : 1) - (b.st === "CONFIRMED" ? 0 : 1)
    || (a.pool ? a.pool.pos / a.pool.size : 2) - (b.pool ? b.pool.pos / b.pool.size : 2)
    || b.agree - a.agree
    || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function compareRecent(a, b) {
  return (a.chg.d < b.chg.d ? 1 : a.chg.d > b.chg.d ? -1 : 0) || RECENT_PRIORITY[a.chg.k] - RECENT_PRIORITY[b.chg.k] || compareCards(a, b);
}

/** Reihen. Nur Reihen mit mindestens MIN_ROW Karten; Titel und Regel sind Teil des Vertrags (die Seite erfindet nichts). */
export const ROW_DEFS = [
  { id: "wave3", title: "Welle-3-Lesarten", rule: "Lesarten, in denen eine Welle 3 laufen könnte", pick: (c) => c.wave === "3" },
  { id: "wave5", title: "Welle-5-Lesarten", rule: "Lesarten, in denen eine Welle 5 laufen könnte", pick: (c) => c.wave === "5" },
  { id: "waveC", title: "Welle-C-Lesarten", rule: "Lesarten, in denen eine Welle C laufen könnte", pick: (c) => c.wave === "C" },
  { id: "recent", title: "Neu und verändert", rule: "Lesarten mit neuem Ereignis in den letzten " + RECENT_DAYS + " Tagen: neu, bestätigt, überarbeitet, Rolle gewechselt, Zone erreicht", pick: (c) => !!c.chg, sort: compareRecent },
  { id: "bullish", title: "Aufwärts", rule: "Lesarten mit Aufwärtsrichtung", pick: (c) => c.dir === "UP" },
  { id: "bearish", title: "Abwärts", rule: "Lesarten mit Abwärtsrichtung", pick: (c) => c.dir === "DOWN" },
  { id: "engine", title: "Bevorzugte Lesart der Engine", rule: "Primäre Lesart und reguläre Alternative", pick: (c) => c.role === "PRIMARY" || c.role === "ALTERNATIVE" || c.role === "HIGH_UPSIDE" }
];

/** Alle Karten eines Shard-Dokuments (ein Titel). Projektion Woche vor Tag, gleiche These nur einmal. */
export function cardsOfDocument(symbol, doc, names) {
  if (!doc || doc.withheld) return [];
  const fr = doc.freshness || {};
  if (!VISIBLE_FRESHNESS.has(fr.state || "FRESH")) return [];
  const entry = names.get(symbol);
  if (!entry) return [];
  const out = [], seen = new Set();
  let ordinal = 0;
  for (const proj of [doc.projectionWeekly, doc.projection]) {
    if (!proj || proj.exploreWithheld === true && !proj.consumerVisible && !proj.motiveAlternative) continue;
    for (const [role, thesis] of displayedTheses(proj)) {
      if (!thesis || !thesis.zones || !thesis.key || seen.has(thesis.key)) continue;
      seen.add(thesis.key);
      if (!Object.keys(liveTiers(thesis)).length) continue;      // alle Zonen durchlaufen oder gegenlaeufig: keine Entdeckung
      out.push(cardOf({ symbol, name: entry.n || symbol, currency: entry.u, role, thesis, proj, doc, ordinal: ordinal++ }));
    }
  }
  return out;
}

/** Index aus Karten + Metadaten. Deterministisch: gleiche Eingabe, gleiche Bytes. */
export function assembleHome({ cards, meta, indexGeneratedAt, dataAsOf }) {
  const sorted = cards.slice().sort(compareCards);
  const rows = [];
  const filters = { wave: {}, dir: {}, st: {}, role: {} };
  for (const c of sorted) {
    if (c.wave) filters.wave[c.wave] = (filters.wave[c.wave] || 0) + 1;
    filters.dir[c.dir] = (filters.dir[c.dir] || 0) + 1;
    filters.st[c.st] = (filters.st[c.st] || 0) + 1;
    filters.role[c.role] = (filters.role[c.role] || 0) + 1;
  }
  for (const def of ROW_DEFS) {
    const all = sorted.filter(def.pick);
    if (all.length < MIN_ROW) continue;
    const ordered = def.sort ? all.slice().sort(def.sort) : all;
    rows.push({ id: def.id, title: def.title, rule: def.rule, total: all.length, ids: ordered.slice(0, ROW_CAP).map((c) => c.id) });
  }
  const symbols = new Set(sorted.map((c) => c.t));
  const proj = (meta && meta.projection) || {};
  return {
    schemaVersion: HOME_SCHEMA,
    version: HOME_VERSION,
    source: { api: meta && meta.schemaVersion || null, bundle: meta && meta.bundle || null, elliott: meta && meta.elliott && meta.elliott.engine || null, projection: proj.version || null,
      freshness: "data-freshness-1.0.0", indexGeneratedAt: indexGeneratedAt || null },
    dataAsOf: dataAsOf || null,
    summary: {
      theses: sorted.length, securities: symbols.size,
      bullish: filters.dir.UP || 0, bearish: filters.dir.DOWN || 0,
      confirmed: filters.st.CONFIRMED || 0, developing: filters.st.DEVELOPING || 0,
      wave3: filters.wave["3"] || 0, wave5: filters.wave["5"] || 0, waveC: filters.wave.C || 0,
      delayed: sorted.filter((c) => c.fr === "DELAYED").length, recent: sorted.filter((c) => c.chg).length
    },
    filters,
    rows,
    cards: sorted
  };
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const readGz = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString("utf8"));

/** Namen und Waehrung aus der Universumsliste (nur Anzeige). Map Ticker -> {n, u}. */
export function loadNames(root) {
  const m = new Map(), f = join(root, "quant/data/product/universe-list-v1.json.gz");
  if (!existsSync(f)) return m;
  for (const e of readGz(f).entries || []) if (e && e.s) m.set(e.s, { n: e.n || e.s, u: e.u || null });
  return m;
}

/** Baut den Index aus einem Verzeichnis veroeffentlichter TI-Daten. */
export function buildHomeFromDir(root, dir = join(root, "quant/data/technical-intelligence/v3")) {
  const meta = readJson(join(dir, "meta.json"));
  const index = readGz(join(dir, "index.json.gz"));
  const names = loadNames(root);
  const product = new Set(index.rows.map((r) => r.t));     // Produktuniversum des Builds (ausgeschlossene Papiere haben keine Zeile)
  const cards = [];
  let dataAsOf = null;
  for (const f of readdirSync(join(dir, "shards")).filter((x) => x.endsWith(".json.gz")).sort()) {
    const instruments = readGz(join(dir, "shards", f)).instruments || {};
    for (const symbol of Object.keys(instruments).sort()) {
      if (!product.has(symbol)) continue;
      const doc = instruments[symbol];
      if (doc && doc.asOf && (!dataAsOf || doc.asOf > dataAsOf)) dataAsOf = doc.asOf;
      cards.push(...cardsOfDocument(symbol, doc, names));
    }
  }
  return assembleHome({ cards, meta, indexGeneratedAt: index.generatedAt, dataAsOf });
}
