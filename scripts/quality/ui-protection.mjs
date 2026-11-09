// Wirksame UI-Byte-Sperre: eingefrorene Basis (docs/quant-recovery/v51/ui-protection.json, unveraendert) plus die
// einzeln freigegebenen Revisionen aus docs/quality/ui-protection-revisions.json. Fail closed bei jeder Abweichung:
// Basis-Hash geaendert, Revision ohne Pflichtfeld, Datei nicht gesperrt, alter Hash passt nicht zur Kette.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const REVISIONS_FILE = "docs/quality/ui-protection-revisions.json";
export const SCHEMA = "ui-protection-revisions-1.0.0";
const HEX = /^[0-9a-f]{64}$/;

export function effectiveLock(root, revisionsDoc = null) {
  const rev = revisionsDoc || JSON.parse(readFileSync(join(root, REVISIONS_FILE), "utf8"));
  if (!rev || rev.schemaVersion !== SCHEMA || !rev.base || !Array.isArray(rev.revisions)) throw new Error("UI_PROTECTION_REVISIONS_INVALID");
  const baseBytes = readFileSync(join(root, rev.base.file));
  if (createHash("sha256").update(baseBytes).digest("hex") !== rev.base.sha256) throw new Error("UI_PROTECTION_BASE_CHANGED");
  const base = JSON.parse(baseBytes.toString("utf8"));
  const files = { ...base.files };
  const seen = new Set();
  for (const r of rev.revisions) {
    for (const k of ["id", "date", "pr", "ownerApproval", "file", "from", "to", "scope"]) if (r[k] === undefined || r[k] === "") throw new Error("UI_PROTECTION_REVISION_FIELD_MISSING:" + k);
    if (seen.has(r.id)) throw new Error("UI_PROTECTION_REVISION_DUPLICATE:" + r.id);
    seen.add(r.id);
    if (!Object.hasOwn(files, r.file)) throw new Error("UI_PROTECTION_REVISION_FILE_NOT_LOCKED:" + r.file);
    if (!HEX.test(r.from) || !HEX.test(r.to) || r.from === r.to) throw new Error("UI_PROTECTION_REVISION_HASH_INVALID:" + r.id);
    if (files[r.file] !== r.from) throw new Error("UI_PROTECTION_REVISION_CHAIN_BROKEN:" + r.id);
    files[r.file] = r.to;
  }
  return { ...base, files, revisions: rev.revisions.map((r) => r.id) };
}
