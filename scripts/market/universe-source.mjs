/* =========================================================================
   VISION UNIVERSE — universe-source.mjs

   WOHER DIE TITEL KOMMEN - UND WOHER NICHT

   Der Market-Data-Layer braucht eine Antwort auf "welche Titel?". Es
   gibt im Repository genau eine kanonische Antwort je Ausbaustufe, und
   dieses Modul benennt sie, statt dass jedes Skript sich eine eigene
   Liste baut:

     1. Der Company Master / Eignungslauf des US-Security-Master-
        Workstreams (quant/data/market/security-master/eligibility.json,
        us-security-master-1.1.0). Produktuniversum = alle Entscheidungen
        ausser EXCLUDED - dieselbe Regel, die die Quelle selbst unter
        counts.productUniverse fuehrt. Liegt die Datei im Branch, ist sie
        die Quelle. Sie wird gelesen, nie veraendert.

     2. Solange sie NICHT im Branch liegt: das groesste im Repository
        vorhandene, mit Kursdaten belegte Universum
        (quant/data/market/scale/universe-FULL_UNIVERSE.json). Das ist
        KEINE zweite 7.000er-Liste, sondern der bestehende Stand dieses
        Branches - eine Liste, die es hier schon gab.

   Was dieses Modul ausdruecklich NICHT tut: eine eigene Universumsliste
   erzeugen, eine Liste aus einem anderen Branch kopieren, oder Titel
   nach eigener Regel ein- oder ausschliessen. Der Uebergabepunkt an den
   Company Master steht in HANDOVER und im Ergebnis jedes Aufrufs.
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const PRODUCT_UNIVERSE = "PRODUCT_UNIVERSE";
export const SECURITY_MASTER_FILE = "quant/data/market/security-master/eligibility.json";
export const FALLBACK_UNIVERSE_FILE = "quant/data/market/scale/universe-FULL_UNIVERSE.json";

/* Die Regel des Eignungslaufs, unveraendert uebernommen. */
export const ELIGIBILITY_CLASSES = ["ELIGIBLE", "SEPARATE_CLASS", "REVIEW", "EXCLUDED"];
export const PRODUCT_CLASSES = ["ELIGIBLE", "SEPARATE_CLASS", "REVIEW"];

/* Der Uebergabepunkt. Er wird nicht erraten: Branch, Commit, Datei,
   Version und Blob stammen aus dem Lesen des Quellzweigs am 2026-09-13. */
export const HANDOVER = {
  workstream: "US Security Master / Company Master (SEC + Tiingo Eignungslauf)",
  branch: "claude/tiingo-us-equity-discovery-k5j4bc",
  commit: "2e22a2e69ce3fd164a89dc118e00ced565ad9e95",
  consumedBy: "claude/full-universe-proof-y8ncfa (scripts/realtime/build-product-symbols.mjs)",
  file: SECURITY_MASTER_FILE,
  version: "us-security-master-1.1.0",
  rule: "Produktuniversum = alle Entscheidungen ausser EXCLUDED",
  expectedCounts: { universeMembers: 7803, productUniverse: 7004,
                    ELIGIBLE: 6477, SEPARATE_CLASS: 308, REVIEW: 219, EXCLUDED: 799 },
  note: "Die Datei liegt nicht in diesem Branch. Sie wird nicht kopiert: der Company Master " +
        "ist ein eigener Workstream und wird als Ganzes uebernommen (Merge/Cherry-Pick der " +
        "Eignungsartefakte), nicht als zweite Liste. Sobald sie vorliegt, liest dieses Modul sie " +
        "ohne Codeaenderung."
};

function readJSON(file) { return JSON.parse(readFileSync(file, "utf8")); }

/**
 * Loest das Produktuniversum auf.
 *
 * @returns {{ source, file, version, securities, counts, sha256, handover }}
 *   securities: [{ securityId, ticker, providerSymbol, exchange, mic, eligibility }]
 */
export function resolveProductUniverse(root) {
  const master = join(root, SECURITY_MASTER_FILE);
  if (existsSync(master)) return fromSecurityMaster(root, master);
  const fallback = join(root, FALLBACK_UNIVERSE_FILE);
  if (!existsSync(fallback)) {
    throw new Error("Kein Universum vorhanden: weder " + SECURITY_MASTER_FILE + " noch " +
                    FALLBACK_UNIVERSE_FILE + ".");
  }
  return fromScaleUniverse(root, fallback, "FULL_UNIVERSE");
}

function fromSecurityMaster(root, file) {
  const roh = readFileSync(file);
  const quelle = JSON.parse(roh.toString("utf8"));
  const entscheidungen = quelle.decisions || [];
  if (!entscheidungen.length) throw new Error(SECURITY_MASTER_FILE + " traegt keine Entscheidungen.");
  const counts = { universeMembers: entscheidungen.length, productUniverse: 0,
                   ELIGIBLE: 0, SEPARATE_CLASS: 0, REVIEW: 0, EXCLUDED: 0 };
  const securities = [];
  for (const e of entscheidungen) {
    const klasse = e.product_eligibility;
    if (!ELIGIBILITY_CLASSES.includes(klasse)) {
      throw new Error(SECURITY_MASTER_FILE + ": unbekannte Eignungsklasse '" + klasse + "' fuer " + e.ticker);
    }
    counts[klasse]++;
    if (klasse === "EXCLUDED") continue;
    counts.productUniverse++;
    securities.push({
      securityId: e.securityId || "ref_" + e.ticker, ticker: String(e.ticker).toUpperCase(),
      providerSymbol: e.providerSymbol || String(e.ticker).toUpperCase(),
      exchange: e.exchange || null, mic: e.mic || null, eligibility: klasse,
      instrumentType: e.instrument_type || null
    });
  }
  /* Gegenprobe gegen die Zaehlung der Quelle - eine Projektion, die von
     ihrer Quelle abweicht, darf nicht entstehen. */
  const erwartet = quelle.counts || {};
  for (const k of ["productUniverse", "ELIGIBLE", "SEPARATE_CLASS", "REVIEW", "EXCLUDED"]) {
    if (erwartet[k] !== undefined && erwartet[k] !== counts[k]) {
      throw new Error(SECURITY_MASTER_FILE + ": " + k + " " + counts[k] + " statt " + erwartet[k] + " (Quelle).");
    }
  }
  securities.sort((a, b) => (a.ticker < b.ticker ? -1 : 1));
  return {
    source: "SECURITY_MASTER", file: SECURITY_MASTER_FILE, version: quelle.version || null,
    generatedAt: quelle.generatedAt || null, securities, counts,
    sha256: createHash("sha256").update(roh).digest("hex"),
    handover: Object.assign({}, HANDOVER, { status: "INTEGRATED" })
  };
}

function fromScaleUniverse(root, file, name) {
  const roh = readFileSync(file);
  const u = JSON.parse(roh.toString("utf8"));
  const securities = (u.securities || []).map((s) => ({
    securityId: s.securityId || "ref_" + s.ticker, ticker: String(s.ticker).toUpperCase(),
    providerSymbol: s.providerSymbol || String(s.ticker).toUpperCase(),
    exchange: s.exchange || null, mic: s.mic || null, eligibility: null,
    instrumentType: s.assetType || s.instrumentType || null
  })).sort((a, b) => (a.ticker < b.ticker ? -1 : 1));
  return {
    source: "SCALE_UNIVERSE", file: file.replace(root + "/", ""), version: u.method || u.gate || name,
    generatedAt: u.generatedAt || null, securities,
    counts: { universeMembers: securities.length, productUniverse: securities.length },
    sha256: createHash("sha256").update(roh).digest("hex"),
    handover: Object.assign({}, HANDOVER, {
      status: "PENDING",
      message: "Market-Data-Layer ist fuer " + securities.length + " Titel bereit (" +
               file.replace(root + "/", "") + "); Integration des neuen Company Masters wartet auf " +
               HANDOVER.branch + " @ " + HANDOVER.commit.slice(0, 7) + " (" + SECURITY_MASTER_FILE + ", " +
               HANDOVER.version + ", " + HANDOVER.expectedCounts.productUniverse + " Titel)."
    })
  };
}

/**
 * Ein Universum nach Namen: PRODUCT_UNIVERSE (kanonisch) oder ein
 * Gate-Universum aus quant/data/market/scale/.
 */
export function resolveUniverse(root, name) {
  if (!name || name === PRODUCT_UNIVERSE) return resolveProductUniverse(root);
  const file = join(root, "quant", "data", "market", "scale", "universe-" + name + ".json");
  if (!existsSync(file)) throw new Error("Universum " + name + " nicht vorhanden: " + file);
  return fromScaleUniverse(root, file, name);
}

/* ------------------------------------------------------------ als Skript */
if (process.argv[1] && process.argv[1].endsWith("universe-source.mjs")) {
  const rootArg = process.argv.find((a) => a.startsWith("--root="));
  const r = resolveProductUniverse(rootArg ? rootArg.slice(7) : join(process.cwd()));
  console.log("Vision Universe — Universumsquelle\n");
  console.log("  Quelle:   " + r.source + " (" + r.file + ")");
  console.log("  Version:  " + r.version);
  console.log("  Titel:    " + r.securities.length);
  console.log("  Zaehlung: " + JSON.stringify(r.counts));
  console.log("  Company Master: " + r.handover.status + (r.handover.message ? "\n  " + r.handover.message : ""));
}
