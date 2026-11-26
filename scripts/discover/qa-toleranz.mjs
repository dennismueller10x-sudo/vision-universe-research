/* Toleranz der Browser-QA (Steuerung 26.11.2026, Option A): ein 404 auf
   /supertrader/data/sf-candidates/ticker/<SHARD>.json ist nur dann KEIN Befund, wenn <SHARD> nicht in
   supertrader/data/sf-candidates/summary.json -> tickerShards steht (der Erzeuger hat fuer den Titel keinen Shard geschrieben, die
   Seite verlinkt ihn aber noch). Steht der Shard dort und fehlt trotzdem, bleibt es ein Fehler. Keine pauschale 404-Ausnahme. */
const MUSTER = /\/supertrader\/data\/sf-candidates\/ticker\/([^/?#]+)\.json(?:[?#].*)?$/;

/** @param {{status:number,url:string}} antwort @param {Iterable<string>} tickerShards @returns {boolean} true = kein Befund */
export function istErlaubter404(antwort, tickerShards) {
  if (!antwort || antwort.status !== 404) return false;
  const m = MUSTER.exec(String(antwort.url || ''));
  if (!m) return false;
  const shards = tickerShards instanceof Set ? tickerShards : new Set(tickerShards || []);
  return !shards.has(decodeURIComponent(m[1]));
}

/** Liest tickerShards aus summary.json; ohne lesbare Liste gibt es keine Toleranz (leere Menge waere "alles erlaubt" - daher null). */
export function lies(summary) {
  return Array.isArray(summary && summary.tickerShards) ? new Set(summary.tickerShards) : null;
}

/** Laedt tickerShards aus dem Arbeitsbaum (Datei unter dem Verzeichnis der Supertrader-Kandidaten); null, wenn nicht lesbar. */
export async function ladeShards(readFile, basis) {
  try { return lies(JSON.parse(await readFile(new URL("../../supertrader/data/sf-candidates/summary.json", basis), "utf8"))); } catch (e) { return null; }
}
