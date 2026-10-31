'use strict';
// Security-Master-Generationen fuer Research (Owner-Auftrag 31.10.2026, P2).
// Abgeschlossene Studien lesen eine eingefrorene, hashgebundene Generation (quant/config/security-master-generations.json),
// der Produktstamm (LIVE) folgt weiter dem woechentlichen Erzeuger. Kein stilles Mischen: eine eingefrorene Generation
// wird nur mit exakt passendem SHA-256 geladen, sonst fail closed.
//   resolve(root, id)  -> { id, file, text, sha256, frozen }
// id = 'LIVE' liest quant/data/market/security-master/us-security-master.json (bisheriges Verhalten, byte-gleich).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LIVE = 'LIVE';
const REGISTRY = 'quant/config/security-master-generations.json';
const LIVE_FILE = 'quant/data/market/security-master/us-security-master.json';
const SCHEMA = 'security-master-generations-1.0.0';
const ID = /^us-security-master-\d+\.\d+\.\d+$/;
const OWN_ROOT = path.resolve(__dirname, '..', '..');

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
function fail(code, detail) { const e = new Error(code + (detail ? ':' + detail : '')); e.code = code; throw e; }

function validateRegistry(reg) {
  if (!reg || reg.schemaVersion !== SCHEMA || !reg.live || reg.live.id !== LIVE || reg.live.file !== LIVE_FILE || !reg.generations || typeof reg.generations !== 'object') fail('MASTER_GENERATION_REGISTRY_INVALID');
  for (const [id, g] of Object.entries(reg.generations)) {
    if (!ID.test(id) || !g || g.version !== id || !/^[0-9a-f]{64}$/.test(g.sha256 || '') || typeof g.file !== 'string') fail('MASTER_GENERATION_REGISTRY_INVALID', id);
    // eingefrorene Kopien liegen nie im generierten Datenpfad, den der Erzeuger ueberschreibt
    if (!g.file.startsWith('quant/frozen/security-master/') || g.file.includes('..')) fail('MASTER_GENERATION_REGISTRY_INVALID', id + ':file');
  }
  if (!Object.hasOwn(reg.generations, reg.researchEvidenceDefault)) fail('MASTER_GENERATION_REGISTRY_INVALID', 'researchEvidenceDefault');
  return reg;
}
/** Registry of the given root; falls back to this repository's registry (tmp fixtures copy only parts of the tree). */
function registry(root = OWN_ROOT) {
  const own = path.join(root, REGISTRY), file = fs.existsSync(own) ? own : path.join(OWN_ROOT, REGISTRY);
  return validateRegistry(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function researchEvidenceDefault(root) { return registry(root).researchEvidenceDefault; }

/** Resolves a generation id to its verified bytes. LIVE is read from root as before; a frozen id must match its sha256. */
function resolve(root, id = LIVE) {
  if (id === LIVE) { const text = fs.readFileSync(path.join(root, LIVE_FILE), 'utf8'); return { id: LIVE, file: LIVE_FILE, text, sha256: sha256(text), frozen: false }; }
  if (typeof id !== 'string' || !ID.test(id)) fail('MASTER_GENERATION_INVALID', String(id));
  const reg = registry(root), g = reg.generations[id];
  if (!g) fail('MASTER_GENERATION_UNKNOWN', id);
  // the frozen copy is looked up in root first, then in this repository (identical bytes, sha checked either way)
  const candidates = [path.join(root, g.file), path.join(OWN_ROOT, g.file)];
  const file = candidates.find(f => fs.existsSync(f));
  if (!file) fail('MASTER_GENERATION_FILE_MISSING', id);
  const text = fs.readFileSync(file, 'utf8'), h = sha256(text);
  if (h !== g.sha256) fail('MASTER_GENERATION_HASH_MISMATCH', id);
  return { id, file: g.file, text, sha256: h, frozen: true };
}
/** Generation id for a recorded master hash (reporting only): a frozen id, or null. */
function generationOfHash(hash, root) {
  for (const [id, g] of Object.entries(registry(root).generations)) if (g.sha256 === hash) return id;
  return null;
}

module.exports = { LIVE, REGISTRY, LIVE_FILE, SCHEMA, validateRegistry, registry, researchEvidenceDefault, resolve, generationOfHash, sha256 };
