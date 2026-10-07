/* =========================================================================
   VU MISSION X — Elliott Prospective Registry: Ledger (nur anhaengen)

   Jede Zeile: { seq, type, id, ref?, week, recordedAt, prevHash, hash, payload }
     hash = sha256(prevHash | seq | type | id | ref | week | canonical(payload))
   Typen: RUN (Lauf mit Code-/Datenversion), EVENT (Setup bei Registrierung, unveraenderlich),
          REVISION (spaetere Entwicklung eines EVENT: CONFIRMED, INVALIDATED, TARGET_REACHED,
          EXTENDED_PROJECTION_REACHED, RELABELED).
   Ein registrierter Eintrag wird nie geaendert; Pruefung: verify.mjs (Kette, HEAD, Prefix gegen Git).
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const LEDGER_VERSION = "elliott-registry-ledger-1.0.0";
export const GENESIS = "0".repeat(64);
const sha = (s) => createHash("sha256").update(s).digest("hex");

/** Kanonisches JSON (Schluessel sortiert) — Hash unabhaengig von der Feldreihenfolge. */
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
export function lineHash(prevHash, e) { return sha([prevHash, e.seq, e.type, e.id, e.ref || "", e.week, canonical(e.payload)].join("|")); }
export const eventId = (payload) => sha(canonical(payload)).slice(0, 24);

export function readLedger(dir) {
  const f = join(dir, "ledger.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Kette pruefen; gibt { ok, errors, head } zurueck. */
export function verifyChain(lines, head) {
  const errors = []; let prev = GENESIS;
  lines.forEach((e, k) => {
    if (e.seq !== k + 1) errors.push("seq " + e.seq + " an Position " + (k + 1));
    if (e.prevHash !== prev) errors.push("prevHash bei seq " + e.seq);
    const h = lineHash(prev, e); if (h !== e.hash) errors.push("hash bei seq " + e.seq);
    prev = e.hash;
  });
  if (head && (head.seq !== lines.length || head.hash !== (lines.length ? lines[lines.length - 1].hash : GENESIS))) errors.push("HEAD passt nicht zum Ledger");
  return { ok: errors.length === 0, errors, head: { seq: lines.length, hash: prev } };
}

/** Neue Eintraege anhaengen (nie umschreiben) und HEAD fortschreiben. */
export function append(dir, existing, entries) {
  mkdirSync(dir, { recursive: true });
  let prev = existing.length ? existing[existing.length - 1].hash : GENESIS, seq = existing.length;
  const out = [];
  for (const x of entries) {
    const e = { seq: ++seq, type: x.type, id: x.id, ref: x.ref || undefined, week: x.week, recordedAt: x.recordedAt, prevHash: prev, payload: x.payload };
    e.hash = lineHash(prev, e); prev = e.hash; out.push(e);
  }
  if (out.length) appendFileSync(join(dir, "ledger.jsonl"), out.map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(join(dir, "HEAD.json"), JSON.stringify({ ledgerVersion: LEDGER_VERSION, seq, hash: prev }, null, 1) + "\n");
  return out;
}
