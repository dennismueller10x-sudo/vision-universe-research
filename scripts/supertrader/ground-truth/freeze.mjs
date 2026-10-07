// Ground-Truth-Freeze: friert Fallliste, Praeregistrierung und Replay-Code nach dem Red Team ein (vor jedem Replay).
// node scripts/supertrader/ground-truth/freeze.mjs --write --commit <sha> --redteam <datei-im-repo>   |   --check
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyFreeze } from '../replication/minervini-1.1/freeze.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
export const GT_FREEZE_PATH = path.join(root, 'scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-FREEZE.json');
export const FROZEN_FILES = [
  'scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-PREREG.json',
  'scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-CASES.json',
  'scripts/supertrader/ground-truth/build-cases.mjs',
  'scripts/supertrader/ground-truth/replay.mjs',
  'scripts/supertrader/ground-truth/run-replay.mjs',
  'scripts/supertrader/ground-truth/build-results.mjs',
];
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');

export function currentHashes() { return Object.fromEntries(FROZEN_FILES.map((f) => [f, sha(f)])); }

export function verifyGtFreeze(file = GT_FREEZE_PATH) {
  if (!fs.existsSync(file)) return { ok: false, reason: 'NO_FREEZE' };
  const f = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (f.status !== 'FROZEN') return { ok: false, reason: 'NOT_FROZEN' };
  const now = currentHashes();
  const changed = FROZEN_FILES.filter((p) => f.files[p] !== now[p]);
  const eng = verifyFreeze();
  if (!eng.ok) return { ok: false, reason: 'ENGINE_FREEZE_' + eng.reason };
  if (f.engine.codeHash !== eng.codeHash || f.engine.rulebookHash !== eng.rulebookHash) return { ok: false, reason: 'ENGINE_CHANGED' };
  return changed.length ? { ok: false, reason: 'CHANGED', changed } : { ok: true, casesHash: f.casesHash };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--check')) { const r = verifyGtFreeze(); console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 1); }
  if (argv.includes('--write')) {
    const eng = verifyFreeze();
    if (!eng.ok || eng.sharedChanged.length) { console.error('Engine-Freeze 1.1.0 ungueltig'); process.exit(3); }
    const files = currentHashes();
    const cases = JSON.parse(fs.readFileSync(path.join(root, FROZEN_FILES[1]), 'utf8'));
    const out = {
      schema: 'vu-minervini-ground-truth-freeze-1.0.0', status: 'FROZEN', frozenAt: new Date().toISOString(),
      commit: arg('--commit'), redTeam: arg('--redteam'),
      casesHash: files[FROZEN_FILES[1]], counts: cases.counts, files,
      engine: { name: 'minervini-adaptation-1.1.0', rulebookHash: eng.rulebookHash, codeHash: eng.codeHash, frozenCommit: eng.commit },
      rule: 'Nach dem Freeze keine Aenderung an Faellen, Ankern, Toleranzen oder Replay-Code; Replay je Fenster genau einmal. Engine unveraendert.',
    };
    fs.writeFileSync(GT_FREEZE_PATH, JSON.stringify(out, null, 2) + '\n');
    console.log('geschrieben ' + GT_FREEZE_PATH);
  }
}
