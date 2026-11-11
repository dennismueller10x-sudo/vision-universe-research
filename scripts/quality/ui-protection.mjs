// Wirksame UI-Byte-Sperre: eingefrorene Basis (docs/quant-recovery/v51/ui-protection.json, unveraendert) plus die
// einzeln freigegebenen Revisionen aus docs/quality/ui-protection-revisions.json. Fail closed bei jeder Abweichung:
// Basis-Hash geaendert, Revision ohne Pflichtfeld, Datei nicht gesperrt, alter Hash passt nicht zur Kette.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const REVISIONS_FILE = "docs/quality/ui-protection-revisions.json";
export const REVISIONS_DIR = "docs/quality/ui-protection-revisions";
export const LEGACY_COUNT = 175; // UIP-R1..R179 (175 Eintraege) stehen eingefroren in REVISIONS_FILE; neue Revisionen sind je eine Datei in REVISIONS_DIR
export const SCHEMA = "ui-protection-revisions-1.0.0";
const HEX = /^[0-9a-f]{64}$/;

/** Alle Revisionen: die alten (Datei, Reihenfolge) plus je eine Datei in REVISIONS_DIR (Name ohne .json = id, keine Nummer). */
export function loadRevisions(root) {
  const doc = JSON.parse(readFileSync(join(root, REVISIONS_FILE), "utf8"));
  const dir = join(root, REVISIONS_DIR);
  const neu = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const id = f.slice(0, -5);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("UI_PROTECTION_REVISION_SLUG_INVALID:" + f);
    return { id, ...JSON.parse(readFileSync(join(dir, f), "utf8")) };
  }) : [];
  return { ...doc, revisions: [...doc.revisions, ...neu] };
}

export function effectiveLock(root, revisionsDoc = null) {
  const rev = revisionsDoc || loadRevisions(root);
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
  }
  // Kette je Datei: eine Revision gilt, wenn ihr "from" der aktuelle Hash ist. Die Reihenfolge der Dateien im Ordner ist
  // egal (keine Nummer, kein Abgleich bei parallelen PRs); zwei Revisionen mit demselben "from" brechen die Kette.
  let offen = rev.revisions;
  while (offen.length) {
    const rest = [];
    for (const r of offen) { if (files[r.file] === r.from) files[r.file] = r.to; else rest.push(r); }
    if (rest.length === offen.length) throw new Error("UI_PROTECTION_REVISION_CHAIN_BROKEN:" + rest[0].id);
    offen = rest;
  }
  return { ...base, files, revisions: rev.revisions.map((r) => r.id) };
}
