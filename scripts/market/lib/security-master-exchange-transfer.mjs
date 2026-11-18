/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/security-master-exchange-transfer.mjs

   Laedt das Register belegter Boersenwechsel
   (quant/config/security-master-exchange-transfer.json) fuer den Erzeuger
   des Wertpapierstamms (scripts/market/build-us-security-master.mjs).

   Fail closed: fehlende Datei, Formfehler
   (quant/engines/us-security-master.js#indexExchangeTransfer) oder eine
   securityId, die nicht core/identity.js folgt, werfen. Abschalten nur
   ausdruecklich mit dem Pfad "none" (Vorher-Lauf).
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const Identity = require(join(root, "core", "identity.js"));

export const DEFAULT_EXCHANGE_TRANSFER_FILE =
  join(root, "quant", "config", "security-master-exchange-transfer.json");

/** -> { doc, index, file, sha256 } ; doc/index null bei "none". Wirft bei jedem Fehler. */
export function loadExchangeTransfer(file = DEFAULT_EXCHANGE_TRANSFER_FILE) {
  if (file === "none") return { doc: null, index: null, file: null, sha256: null };
  if (!existsSync(file)) {
    throw new Error("Boersenwechsel-Register fehlt: " + file + " (abschalten nur ausdruecklich mit 'none').");
  }
  const bytes = readFileSync(file);
  let doc;
  try { doc = JSON.parse(bytes.toString("utf8")); }
  catch (err) { throw new Error("EXCHANGE_TRANSFER_INVALID: kein JSON (" + err.message + ")"); }
  const index = Master.indexExchangeTransfer(doc);
  for (const r of doc.records) {
    if (!Identity.consistent(r.ticker, r.securityId)) {
      throw new Error("EXCHANGE_TRANSFER_INVALID: securityId " + r.securityId +
                      " folgt nicht core/identity.js fuer " + r.ticker);
    }
  }
  return { doc, index, file: file.startsWith(root + "/") ? file.slice(root.length + 1) : file,
           sha256: createHash("sha256").update(bytes).digest("hex") };
}
