'use strict';
// V13c - building blocks of the pre-registered extension study (docs/quant-recovery/v13c/study-registration-3.0.0.json).
// Thin layer over the unchanged V13 study code (scripts/quant/v13/studies), the V13b F1d transform (scripts/quant/v13b/f1w/lib.cjs)
// and the hash-bound delisted loader with the opt-in register 1.1.0 (quant/engines/research-delisted-series.cjs).
// Nothing here changes F0, F1, F1w, F1d, any default or any committed result.
const fs = require('node:fs'), path = require('node:path');
const W = require('../v13/studies/lib.cjs'), K = W.K;
const L13b = require('../v13b/f1w/lib.cjs');
const D = require(W.ROOT + '/quant/engines/research-delisted-series.cjs');

const REG_FILE = 'docs/quant-recovery/v13c/study-registration-3.0.0.json';
const OUT_DIR = 'docs/quant-recovery/v13c';
const SCRATCH = path.resolve(W.ROOT, '..', '..');
const PRIVATE = path.join(SCRATCH, 'v13c-private');
const SERIES_100 = W.PRIVATE_SERIES; // scratchpad/v13-private/series (1,675 QUALIFIED + 151 PRICE_ONLY)
const SERIES_110 = path.join(SCRATCH, 'v13b-private', 'series-1.1.0'); // the 13 new QUALIFIED chains of register 1.1.0
// Registered V13/V13b manifests (registration 3.0.0 reproductionChecks.R2).
const MANIFEST_100 = Object.freeze({ F1: 'f7d13db0900757050b8025a8c0e8e546dbe9d43618e6856a393c6144e9caa478', F1w: '066505661d92b62c6e5a4d0fe788c9629d5abde051c54f5309365016d64335f3', F1d: 'c0d86f8319b65d99572a3ddb8912d0ba71f1fb128aec68774b9e8c882af44bf0' });
// This study's frames -> the end-of-series rule they share with their V13/V13b counterpart.
const FRAMES = Object.freeze({ F1p: { counterpart: 'F1', rule: 'REGISTERED' }, F1wp: { counterpart: 'F1w', rule: 'RELABEL_LAST_BAR' }, F1dp: { counterpart: 'F1d', rule: 'DROP_LAST_BAR' } });
const LABEL = { F1p: "V13C_PRIMARY F1'", F1wp: "V13C_SENSITIVITY F1w'", F1dp: "V13C_SENSITIVITY F1d'" };
// spx-terminal-register-1.0.0 row excluded by name in the registration (First Data 2006, review 1.0.0 DISTRIBUTION_IN_PERIOD).
const FIRST_DATA_KEY = '747c456cff6e81ac';

// Study amendment 3.0.1 D1: frame runs use quant/data of the V13/V13b runs (tree 963779a1..., commit 885f5574cc), restored only in the worktree.
const DATA_SNAPSHOT = Object.freeze({ commit: '885f5574cc3249f806ea7982d6b27263d1c2b001', tree: '963779a13c247e658ac051fb90b3e4714f1d1663' });
function dataState(root = W.ROOT) {
  // tree id of the working-copy quant/data (incl. untracked files) via a temporary index; the real index is not touched
  const { spawnSync } = require('node:child_process'), os = require('node:os');
  const idx = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'v13c-idx-')), 'index'), env = { ...process.env, GIT_INDEX_FILE: idx };
  const git = (...a) => { const r = spawnSync('git', ['-C', root, ...a], { env, encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status !== 0) throw Error('V13C_GIT:' + a.join(' ') + ':' + r.stderr); return r.stdout.trim(); };
  git('read-tree', '--empty'); git('add', '-A', '--', 'quant/data'); const tree = git('write-tree', '--prefix=quant/data/');
  fs.rmSync(path.dirname(idx), { recursive: true, force: true });
  return { snapshotCommit: DATA_SNAPSHOT.commit, snapshotTree: DATA_SNAPSHOT.tree, quantDataTree: tree, quantDataEqualsSnapshot: tree === DATA_SNAPSHOT.tree };
}
function amendmentSha(root = W.ROOT) {
  const f = 'docs/quant-recovery/v13c/study-amendment-3.0.1.json';
  if (!fs.existsSync(path.join(root, f))) return null;
  const s = W.shaFile(path.join(root, f)), committed = fs.readFileSync(path.join(root, f.replace(/\.json$/, '.sha256')), 'utf8').trim().split(/\s+/)[0];
  if (s !== committed) throw Error('V13C_AMENDMENT_HASH_MISMATCH');
  return s;
}

/** All committed amendments of registration 3.0.0, hash-checked against their .sha256 files. */
function amendments(root = W.ROOT) {
  const out = {};
  for (const v of ['3.0.1', '3.0.2']) {
    const f = 'docs/quant-recovery/v13c/study-amendment-' + v + '.json'; if (!fs.existsSync(path.join(root, f))) continue;
    const s = W.shaFile(path.join(root, f)), committed = fs.readFileSync(path.join(root, f.replace(/\.json$/, '.sha256')), 'utf8').trim().split(/\s+/)[0];
    if (s !== committed) throw Error('V13C_AMENDMENT_HASH_MISMATCH:' + v);
    out[v] = s;
  }
  return out;
}

function registrationSha(root = W.ROOT) {
  const s = W.shaFile(path.join(root, REG_FILE)), committed = fs.readFileSync(path.join(root, REG_FILE.replace(/\.json$/, '.sha256')), 'utf8').trim().split(/\s+/)[0];
  if (s !== committed) throw Error('V13C_REGISTRATION_HASH_MISMATCH');
  return s;
}

/** The chains that are QUALIFIED in register 1.1.0 but not in 1.0.0 (pure; from the public registers). */
function newQualifiedChains(root = W.ROOT) {
  const read = f => { const r = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')), ix = Object.fromEntries(r.columns.map((c, i) => [c, i])); return new Map(r.rows.map(x => [x[ix.chainId], x[ix.status]])); };
  const a = read(D.REGISTER), b = read(D.REGISTER_110.file);
  return [...b].filter(([id, st]) => st === 'QUALIFIED' && a.get(id) !== 'QUALIFIED').map(([id]) => 'dl_' + id).sort();
}

function loadDelisted110(include = 'QUALIFIED', dir = SERIES_100, extra = SERIES_110) {
  return D.loadDelisted(W.ROOT, { dir, include, registerVersion: '1.1.0', extraDirs: [extra] });
}

/** Frame merge of one study frame on a delisted doc map (pure apart from the merge functions it reuses unchanged). */
function mergeStudyFrame(frame, fr0, docs) {
  const rule = (FRAMES[frame] || FRAMES[{ F1: 'F1p', F1w: 'F1wp', F1d: 'F1dp' }[frame]] || {}).rule;
  if (rule === 'REGISTERED') return W.mergeFrame(fr0, docs, {});
  if (rule === 'RELABEL_LAST_BAR') return W.mergeFrame(fr0, docs, { relabelLastBar: true });
  if (rule === 'DROP_LAST_BAR') return L13b.mergeFrameF1d(fr0, docs);
  throw Error('V13C_FRAME_UNKNOWN:' + frame);
}

/** delistedInfo exactly as the V13 run-frame.cjs (F1/F1w) and the V13b run.cjs (F1d) built it (enters the manifest hash). */
function delistedInfoOf(frame, dl, fr) {
  const drop = (FRAMES[frame] || {}).rule === 'DROP_LAST_BAR' || frame === 'F1d';
  return { include: dl.include, registerHash: dl.registerHash, counts: dl.counts, loaded: fr.delisted.loaded, added: fr.delisted.added.length,
    excluded: Object.fromEntries(Object.entries(fr.delisted.excluded).map(([k, v]) => [k, v.length])), relabelledLastBars: fr.delisted.relabelledLastBars, relabelOption: fr.delisted.relabelOption,
    ...(drop ? { truncatedLastBars: fr.delisted.truncatedLastBars, tooShortAfterDrop: fr.delisted.tooShortAfterDrop, dropOption: true } : {}),
    addedByTerminalClass: fr.delisted.added.reduce((a, id) => { const k = fr.docs.get(id).listingLifecycle.terminal.kind; a[k] = (a[k] || 0) + 1; return a; }, {}),
    addedByStatus: fr.delisted.added.reduce((a, id) => { const k = fr.docs.get(id).listingLifecycle.status; a[k] = (a[k] || 0) + 1; return a; }, {}) };
}

const r4 = x => typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x;
function roundDeep(x, f = W.r6) { if (Array.isArray(x)) return x.map(v => roundDeep(v, f)); if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundDeep(v, f)])); return f(x); }

module.exports = { W, K, D, L13b, DATA_SNAPSHOT, dataState, amendmentSha, amendments, REG_FILE, OUT_DIR, SCRATCH, PRIVATE, SERIES_100, SERIES_110, MANIFEST_100, FRAMES, LABEL, FIRST_DATA_KEY,
  registrationSha, newQualifiedChains, loadDelisted110, mergeStudyFrame, delistedInfoOf, r4, roundDeep };
