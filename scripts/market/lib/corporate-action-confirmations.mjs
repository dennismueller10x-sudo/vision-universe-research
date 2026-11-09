/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/corporate-action-confirmations.mjs

   BESTAETIGTE KAPITALMASSNAHMEN, DIE DER ANBIETER NICHT FUEHRT (Marktdaten-Domaene)

   quant/config/corporate-action-confirmations.json belegt Kapitalmassnahmen,
   die der Anbieter nicht fuehrt und die in den Reihen springen.
     correction.status UNCORRECTED  nur Beleg: aus dem Datenverdacht wird ein
                                    bestaetigter Datenfehler (Technical,
                                    screen-row 1.13.0); kein Faktor.
     correction.status PIPELINE     zusaetzlich bereinigt applyConfirmations()
                                    die Rohbalken beim Lesen: Kopie mit
                                    splitFactor am Sprungtag. Kurse, Volumen und
                                    der Verlauf im Speicher bleiben unberuehrt;
                                    die Bereinigung rechnet unveraendert
                                    return-series.js#splitFactors bzw.
                                    canonical-bars (ADR-002).

   Schutz gegen falsche oder doppelte Bereinigung (je Eintrag, sonst SKIPPED
   mit Grund):
     NO_BAR_AFTER_EFFECTIVE_DATE kein Balken am oder nach dem Wirksamkeitstag
     PROVIDER_SPLIT_NEARBY       der Anbieter fuehrt innerhalb von 5 Sitzungen
                                 einen Split (er hat nachgezogen)
     NO_RAW_JUMP                 kein auffaelliger Rohsprung in Richtung des
                                 Faktors in [Wirksamkeitstag-1, +5 Sitzungen]
                                 (Reihe schon bereinigt); auffaellig heisst
                                 Faktor ausserhalb 0,2..5 oder Split-Signatur
     RESIDUAL_JUMP               nach dem Faktor bliebe ein auffaelliger Sprung
                                 oder mehr als die Haelfte des Rohsprungs
                                 (Faktor passt nicht zur Reihe)
   Der Sprungtag ist der Balken mit dem kleinsten Rest |ln(Sprung x Faktor)|,
   nicht stur der Wirksamkeitstag: Der Anbieter kann am Wirksamkeitstag noch
   einen Altwert fuehren (GIBO 29.06.2026).

   Pruefung je Eintrag: securityId aus core/identity.js (ADR-001), CIK,
   Wirksamkeitstag Werktag, Faktor > 0 und != 1, SEC-Beleg (Accession, URL
   der Accession und des CIK, sha256, woertliches Zitat), Anbieterprobe mit
   Ergebnis, Status UNCORRECTED. Eine ungueltige Datei wirkt nie still.
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Identity = require(join(ROOT, "core", "identity.js"));

export const SCHEMA = "corporate-action-confirmations-1.0.0";
export const CONFIG_PATH = join("quant", "config", "corporate-action-confirmations.json");
const KINDS = new Set(["SHARE_CONSOLIDATION", "SPLIT", "STOCK_DIVIDEND"]);
const CORRECTION = new Set(["UNCORRECTED", "PIPELINE"]);
export const WINDOW_SESSIONS = 5;
const DATE = /^\d{4}-\d{2}-\d{2}$/, ACCESSION = /^\d{10}-\d{2}-\d{6}$/, SHA256 = /^[0-9a-f]{64}$/;
const SEC_URL = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9_.\-]+$/;
const isDate = (v) => typeof v === "string" && DATE.test(v) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const weekday = (v) => { const n = new Date(v + "T00:00:00Z").getUTCDay(); return n >= 1 && n <= 5; };

export function validate(config) {
  const errors = [];
  if (!config || config.schemaVersion !== SCHEMA) errors.push("SCHEMA_VERSION");
  if (!config || !Number.isInteger(config.version) || config.version < 1) errors.push("VERSION");
  if (!config || !Array.isArray(config.entries)) return { valid: false, errors: [...errors, "ENTRIES_MISSING"] };
  const ids = new Set(), events = new Set();
  config.entries.forEach((e, i) => {
    const at = ":" + i;
    if (!e || typeof e !== "object") { errors.push("ENTRY_INVALID" + at); return; }
    if (typeof e.id !== "string" || !/^[A-Z0-9][A-Z0-9.\-]{3,60}$/.test(e.id) || ids.has(e.id)) errors.push("ID_INVALID" + at);
    ids.add(e.id);
    if (typeof e.ticker !== "string" || typeof e.securityId !== "string" || Identity.securityIdForTicker(e.ticker) !== e.securityId) errors.push("SECURITY_ID_NOT_FROM_IDENTITY" + at);
    if (typeof e.cik !== "string" || !/^\d{10}$/.test(e.cik)) errors.push("CIK_INVALID" + at);
    if (!KINDS.has(e.kind)) errors.push("KIND_INVALID" + at);
    if (!(typeof e.splitFactor === "number" && e.splitFactor > 0 && e.splitFactor !== 1)) errors.push("SPLIT_FACTOR_INVALID" + at);
    if (e.kind === "SHARE_CONSOLIDATION" && !(e.splitFactor < 1)) errors.push("CONSOLIDATION_FACTOR_NOT_BELOW_1" + at);
    if (!isDate(e.effectiveDate) || !weekday(e.effectiveDate)) errors.push("EFFECTIVE_DATE_INVALID" + at);
    if (typeof e.effectiveBasis !== "string" || e.effectiveBasis.length < 20) errors.push("EFFECTIVE_BASIS_MISSING" + at);
    if (!isDate(e.verifiedAt) || !(e.verifiedAt > e.effectiveDate)) errors.push("VERIFIED_INVALID" + at);
    if (!Array.isArray(e.evidence) || !e.evidence.length) errors.push("EVIDENCE_MISSING" + at);
    else e.evidence.forEach((d, j) => {
      const dt = at + "." + j;
      if (!d || !ACCESSION.test(d.accession || "")) errors.push("ACCESSION_INVALID" + dt);
      else if (!SEC_URL.test(d.url || "") || !d.url.includes("/" + d.accession.replace(/-/g, "") + "/") || !d.url.includes("/edgar/data/" + String(Number(e.cik)) + "/")) errors.push("URL_INVALID" + dt);
      if (!d || !SHA256.test(d.sha256 || "")) errors.push("SHA256_INVALID" + dt);
      if (!d || typeof d.quote !== "string" || d.quote.length < 40) errors.push("QUOTE_MISSING" + dt);
      if (!d || !isDate(d.filed) || d.filed > e.verifiedAt) errors.push("FILED_INVALID" + dt);
    });
    const p = e.providerCheck;
    if (!p || typeof p.provider !== "string" || !isDate(p.checkedAt) || p.result !== "NO_SPLIT_FACTOR" || !(Number.isInteger(p.requests) && p.requests >= 1)) errors.push("PROVIDER_CHECK_INVALID" + at);
    if (!e.correction || !CORRECTION.has(e.correction.status) || typeof e.correction.reason !== "string" || e.correction.reason.length < 20) errors.push("CORRECTION_STATUS_INVALID" + at);
    const key = e.securityId + "|" + e.effectiveDate;
    if (events.has(key)) errors.push("DUPLICATE_EVENT:" + key);
    events.add(key);
  });
  return { valid: errors.length === 0, errors };
}

/** securityId -> [{ id, effectiveDate, splitFactor, ratioText, accession, correction }]. Wirft bei ungueltiger Datei. Fehlt die Datei: {}. */
export function loadIndex(root = ROOT) {
  const file = join(root, CONFIG_PATH);
  if (!existsSync(file)) return {};
  const config = JSON.parse(readFileSync(file, "utf8")), v = validate(config);
  if (!v.valid) throw new Error("CORPORATE_ACTION_CONFIRMATIONS_INVALID:" + v.errors.join(","));
  const map = {};
  for (const e of config.entries) (map[e.securityId] = map[e.securityId] || []).push({ id: e.id, effectiveDate: e.effectiveDate, splitFactor: e.splitFactor, ratioText: e.ratioText, accession: e.evidence[0].accession, correction: e.correction.status });
  return map;
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);
function splitSignature(r) { const x = r >= 1 ? r : 1 / r, n = Math.round(x); return n >= 2 && n <= 50 && Math.abs(x / n - 1) <= 0.02; }
/** Dieselbe Groessenordnung wie die Kennzeichnung in Technical (price-jumps.js) und DQ-PX-3. */
export function suspiciousJump(r) { return !(finite(r) && r > 0) || r < 0.2 || r > 5 || splitSignature(r); }
let DEFAULT_INDEX = null;

/**
 * applyConfirmations(bars, securityId, {index}) -> {bars, items}
 *
 * `bars`: aufsteigend nach Datum, mit close und splitFactor. Rueckgabe: an
 * angewandten Sprungtagen eine Kopie mit splitFactor = Faktor des Eintrags;
 * sonst dasselbe Array. `items`: je Eintrag APPLIED (mit Datum und
 * Rohsprung) oder SKIPPED mit Grund - die Herkunft fuer den Aufrufer.
 */
export function applyConfirmations(bars, securityId, opts = {}) {
  const index = opts.index || DEFAULT_INDEX || (DEFAULT_INDEX = loadIndex());
  const entries = securityId ? (index[securityId] || []).filter((e) => e.correction === "PIPELINE") : [];
  const items = [];
  if (!entries.length || !Array.isArray(bars) || bars.length < 2) return { bars, items };
  const patch = new Map();
  for (const e of entries) {
    const item = { id: e.id, effectiveDate: e.effectiveDate, splitFactor: e.splitFactor, accession: e.accession, status: "SKIPPED", reason: null };
    items.push(item);
    const eff = bars.findIndex((b) => String(b.date).slice(0, 10) >= e.effectiveDate);
    if (eff < 0) { item.reason = "NO_BAR_AFTER_EFFECTIVE_DATE"; continue; }
    let nearby = false;
    for (let j = Math.max(0, eff - WINDOW_SESSIONS); j <= Math.min(bars.length - 1, eff + WINDOW_SESSIONS); j++) {
      const sf = bars[j].splitFactor;
      if (finite(sf) && sf > 0 && sf !== 1) { nearby = true; break; }
    }
    if (nearby) { item.reason = "PROVIDER_SPLIT_NEARBY"; continue; }
    let best = -1, bestRest = Infinity, bestRaw = null;
    for (let k = Math.max(1, eff - 1); k <= Math.min(bars.length - 1, eff + WINDOW_SESSIONS); k++) {
      const a = bars[k - 1].close, b = bars[k].close;
      if (!(finite(a) && a > 0 && finite(b) && b > 0)) continue;
      const raw = b / a;
      if (!suspiciousJump(raw) || Math.sign(Math.log(raw)) !== -Math.sign(Math.log(e.splitFactor))) continue;
      const rest = Math.abs(Math.log(raw * e.splitFactor));
      if (rest < bestRest) { best = k; bestRest = rest; bestRaw = raw; }
    }
    if (best < 0) { item.reason = "NO_RAW_JUMP"; continue; }
    const residual = bestRaw * e.splitFactor;
    if (suspiciousJump(residual) || bestRest > Math.abs(Math.log(bestRaw)) / 2) { item.reason = "RESIDUAL_JUMP"; item.rawJump = Math.round(bestRaw * 1e4) / 1e4; continue; }
    item.status = "APPLIED"; item.date = String(bars[best].date).slice(0, 10);
    item.rawJump = Math.round(bestRaw * 1e4) / 1e4; item.residualMove = Math.round(residual * 1e4) / 1e4;
    patch.set(best, e.splitFactor);
  }
  if (!patch.size) return { bars, items };
  return { bars: bars.map((bar, i) => (patch.has(i) ? { ...bar, splitFactor: patch.get(i) } : bar)), items };
}
