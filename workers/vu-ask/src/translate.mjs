/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/src/translate.mjs

   VOM MODELLAUSGANG ZUR GEPRUEFTEN ABFRAGE

   Die Antwort des Modells ist ein Vorschlag, keine Abfrage. Jeder Filter
   laeuft durch dieselbe Validierung wie ein Filter, den ein Mensch im
   Screener anklickt (screener/engine/query.js). Was sie nicht besteht,
   wird nicht still repariert, sondern weggelassen und benannt - der
   Nutzer sieht vor dem Ergebnis, was gerechnet wird und was nicht.
   ========================================================================= */
import Query from "../../../screener/engine/query.js";
import Fields from "../../../screener/engine/fields.js";
import { STRATEGIES, MISSING_TYPES, KINDS } from "./catalog.mjs";

const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function text(v, max) {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
}

function toFilter(raw) {
  const def = Fields.field(raw && raw.field);
  if (!def) return null;
  const f = { field: def.id, op: raw.op };
  if (def.kind === "enum") f.value = Array.isArray(raw.values) ? raw.values : [];
  else if (def.kind === "bool") { f.op = "is"; f.value = raw.flag !== false; }
  else { f.value = raw.value; f.value2 = raw.value2; }
  return f;
}

/**
 * @param {object} out  die vom Schema erzwungene Modellantwort
 * @returns {{kind, understood, query, tickers, show, supertrader, chartbild, missing, notes, dropped}}
 */
export function translate(out) {
  const kind = KINDS.includes(out && out.kind) ? out.kind : "unclear";
  const notes = (Array.isArray(out && out.notes) ? out.notes : []).map((n) => text(n, 200)).filter(Boolean).slice(0, 3);
  const missing = (Array.isArray(out && out.missing) ? out.missing : [])
    .map((m) => ({ wish: text(m && m.wish, 120), type: MISSING_TYPES.includes(m && m.type) ? m.type : "other" }))
    .filter((m) => m.wish)
    .slice(0, 6);

  const dropped = [];
  const filters = [];
  for (const raw of (Array.isArray(out && out.filters) ? out.filters : []).slice(0, Query.MAX_FILTERS)) {
    const candidate = toFilter(raw);
    if (!candidate) { dropped.push(String(raw && raw.field)); continue; }
    try { filters.push(Query.validateFilter(candidate)); }
    catch (e) { dropped.push(candidate.field); }
  }

  const show = [...new Set((Array.isArray(out && out.show) ? out.show : []).filter((id) => Fields.field(id) && Fields.field(id).available !== false))].slice(0, 8);
  const sortField = out && out.sort && out.sort.field !== "none" ? out.sort.field : null;
  const limit = Number.isInteger(out && out.limit) ? Math.min(100, Math.max(1, out.limit)) : 25;

  let query = null;
  if (kind === "screen") {
    try {
      query = Query.validate({
        v: 1, universe: "US_REAL", mode: "pro", logic: "AND",
        groups: [{ id: "g1", op: "AND", filters }],
        sort: sortField ? { field: sortField, dir: out.sort.dir } : { field: "marketCap", dir: "desc" },
        view: "table", columns: show,
      });
    } catch (e) {
      /* Nur die Sortierung kann hier noch scheitern - die Filter sind
         einzeln geprueft. Dann eben nach Marktkapitalisierung. */
      query = Query.validate({ v: 1, universe: "US_REAL", mode: "pro", groups: [{ id: "g1", op: "AND", filters }], view: "table", columns: show });
      dropped.push("sort:" + sortField);
    }
    query.limit = limit;
  }

  const st = out && out.supertrader;
  const supertrader = st && STRATEGIES.includes(st.strategy) && (st.mode === "require" || st.mode === "show")
    ? { strategy: st.strategy, mode: st.mode } : null;

  const tickers = [...new Set((Array.isArray(out && out.tickers) ? out.tickers : [])
    .map((t) => String(t).toUpperCase().trim()).filter((t) => TICKER.test(t)))].slice(0, 10);

  if (dropped.length) notes.push("Nicht ausgewertet, weil nicht eindeutig: " + dropped.join(", "));

  return {
    kind, understood: text(out && out.understood, 300), query,
    tickers: kind === "stock" ? tickers : [], show, supertrader,
    /* Chartbild-Werkzeug (getChartbildLage): nur fuer bestimmte Aktien */
    chartbild: kind === "stock" && tickers.length > 0 && out.chartbild === true,
    missing, notes, dropped,
  };
}

/** Status fuer das Lernprotokoll: was konnte beantwortet werden? */
export function statusOf(result) {
  if (result.kind === "off_topic" || result.kind === "forecast" || result.kind === "unclear") return result.kind;
  const empty = result.kind === "screen" ? !result.query || (!Query.count(result.query) && !result.supertrader)
    : !result.tickers.length;
  if (empty && result.missing.length) return "gap";
  if (empty) return "unclear";
  return result.missing.length || result.dropped.length ? "partial" : "ok";
}
