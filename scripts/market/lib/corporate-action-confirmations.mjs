/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/corporate-action-confirmations.mjs

   BESTAETIGTE, NOCH NICHT BEREINIGTE KAPITALMASSNAHMEN (Marktdaten-Domaene)

   quant/config/corporate-action-confirmations.json belegt Kapitalmassnahmen,
   die der Anbieter nicht fuehrt und die in den Reihen noch springen. Die Datei
   korrigiert NICHTS: Sie macht aus einem Datenverdacht einen bestaetigten
   Datenfehler (Technical, screen-row 1.13.0). Bereinigt wird nur ueber
   split-evidence-supplements.json bzw. den Anbieter; danach faellt der
   Eintrag weg.

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
    if (!e.correction || e.correction.status !== "UNCORRECTED" || typeof e.correction.reason !== "string") errors.push("CORRECTION_STATUS_INVALID" + at);
    const key = e.securityId + "|" + e.effectiveDate;
    if (events.has(key)) errors.push("DUPLICATE_EVENT:" + key);
    events.add(key);
  });
  return { valid: errors.length === 0, errors };
}

/** securityId -> [{ id, effectiveDate, splitFactor, ratioText, accession }]. Wirft bei ungueltiger Datei. Fehlt die Datei: {}. */
export function loadIndex(root = ROOT) {
  const file = join(root, CONFIG_PATH);
  if (!existsSync(file)) return {};
  const config = JSON.parse(readFileSync(file, "utf8")), v = validate(config);
  if (!v.valid) throw new Error("CORPORATE_ACTION_CONFIRMATIONS_INVALID:" + v.errors.join(","));
  const map = {};
  for (const e of config.entries) (map[e.securityId] = map[e.securityId] || []).push({ id: e.id, effectiveDate: e.effectiveDate, splitFactor: e.splitFactor, ratioText: e.ratioText, accession: e.evidence[0].accession });
  return map;
}
