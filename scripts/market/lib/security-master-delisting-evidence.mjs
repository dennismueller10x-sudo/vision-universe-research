/* =========================================================================
   VISION UNIVERSE — scripts/market/lib/security-master-delisting-evidence.mjs

   Laedt das SEC-Delisting-Register (quant/config/security-master-delisting-evidence.json)
   fuer die beiden Stellen, die active_status aus Anbieterzeilen ableiten:
   scripts/market/build-us-security-master.mjs (Erzeuger des Stamms) und
   scripts/market/build-us-eligibility.mjs (beurteilt Stammzeilen neu, wenn
   die Klassiererversion abweicht oder die Namensschicht umstuft - ohne das
   Register wuerde sie ein belegt beendetes Listing aus dem aktuellen
   Anbieter-endDate wieder ACTIVE ableiten).

   Fail closed: fehlende Datei, Formfehler (quant/engines/us-security-master.js
   #indexDelistingEvidence) oder eine securityId, die nicht core/identity.js
   folgt, werfen. Abschalten nur ausdruecklich mit dem Pfad "none".
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

export const DEFAULT_DELISTING_EVIDENCE_FILE = join(root, "quant", "config", "security-master-delisting-evidence.json");

/** -> { doc, index, file, sha256 } ; doc/index null bei "none". Wirft bei jedem Fehler. */
export function loadDelistingEvidence(file = DEFAULT_DELISTING_EVIDENCE_FILE) {
  if (file === "none") return { doc: null, index: null, file: null, sha256: null };
  if (!existsSync(file)) {
    throw new Error("SEC-Delisting-Register fehlt: " + file + " (abschalten nur ausdruecklich mit 'none').");
  }
  const bytes = readFileSync(file);
  const doc = JSON.parse(bytes.toString("utf8"));
  const index = Master.indexDelistingEvidence(doc);
  for (const r of doc.records) {
    if (Identity.securityIdForTicker(r.ticker) !== r.securityId) {
      throw new Error("SEC-Delisting-Register: securityId " + r.securityId + " folgt nicht core/identity.js fuer " + r.ticker);
    }
  }
  return { doc, index, file: file.startsWith(root + "/") ? file.slice(root.length + 1) : file,
           sha256: createHash("sha256").update(bytes).digest("hex") };
}
