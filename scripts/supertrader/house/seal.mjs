// VU Hausstrategie HS1: Holdout-Sperre und Verschluesselung an mehrere Empfaenger.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { encryptForOwner } from '../validation/lib.mjs';

export const DEV_END = '2021-12-31';

// Entwicklungsmodus: alles nach DEV_END entfernen, BEVOR irgendetwas gerechnet wird.
// Ein Listing, das erst nach DEV_END endet, ist im Entwicklungszeitraum nicht delistet.
export function truncateForDevelopment(segs) {
  return segs.map((s) => {
    const origLast = s.raw.length ? s.raw[s.raw.length - 1].date : null;
    const raw = s.raw.filter((b) => b.date <= DEV_END);
    const fund = s.fund ? { ...s.fund, eps: (s.fund.eps || []).filter((r) => r[2] <= DEV_END), rev: (s.fund.rev || []).filter((r) => r[2] <= DEV_END), ...(s.fund.shares ? { shares: s.fund.shares.filter((r) => r[2] <= DEV_END) } : {}) } : s.fund;
    return { ...s, raw, fund, delisted: !!s.delisted && origLast !== null && origLast <= DEV_END };
  }).filter((s) => s.raw.length > 0);
}

export function fileHash(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// Holdout nur, wenn FROZEN-HS1.json die aktuellen Hashes von Praeregistrierung und Engine traegt.
export function assertFrozen(dir, name = 'FROZEN-HS1.json') {
  const frozenPath = path.join(dir, name);
  if (!fs.existsSync(frozenPath)) throw new Error(`Holdout gesperrt: ${name} fehlt.`);
  const f = JSON.parse(fs.readFileSync(frozenPath, 'utf8'));
  for (const [file, want] of Object.entries(f.hashes || {})) {
    const got = fileHash(path.join(dir, file));
    if (got !== want) throw new Error(`Holdout gesperrt: ${file} seit dem Einfrieren veraendert.`);
  }
  if (!f.selectedTrial) throw new Error('Holdout gesperrt: kein gewaehlter Versuch.');
  return f;
}

// Ein verschluesseltes Ergebnis je Empfaenger-Schluessel (Eigentuemer, Arbeitssitzung).
export function sealAll(outDir, baseName, obj, keyPaths) {
  const buf = Buffer.from(JSON.stringify(obj));
  const written = [];
  for (const [tag, p] of Object.entries(keyPaths)) {
    if (!fs.existsSync(p)) continue;
    const f = path.join(outDir, `${baseName}.${tag}.sealed.json`);
    fs.writeFileSync(f, encryptForOwner(fs.readFileSync(p, 'utf8'), buf));
    written.push(f);
  }
  return written;
}
