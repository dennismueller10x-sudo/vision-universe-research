/* Bereinigungsmodus (prune-dead-refs.mjs): entfallene Titel ausweisen,
   sonst nichts. Anlass BZH (27.10.2026): Universum ohne BZH committet,
   Materialisierung rot, Supertrader nicht angestossen -> toter Link.
   Hermetisch: jede Pruefung baut ein Wegwerf-Repository. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prune, planPrune, validateUniverse, LIMITS, main } from '../prune-dead-refs.mjs';
import { discoverAvailability } from '../discover-availability.mjs';
import { discoverAvailability as ausBuild } from '../build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NOTE = 'Hinweis statt Link.';
const SOURCE = 'discover/data/stock-index/US_REAL.json';
/* 1200 gueltige Kuerzel als Grundbestand des Universums. */
const BASIS = Array.from({ length: 1200 }, (_, i) => 'U' + String(i).padStart(4, '0'));

function signal(sym, extra = {}) {
  return { strategyId: 'DARVAS_BOX', id: 'DARVAS_BOX:' + sym + ':2026-10-07:v3.0.2', state: 'SETUP', symbol: sym, levels: { trigger: 34.54, stop: 31.2 }, ...extra };
}

/** Wegwerf-Repository: Supertrader-Stand mit `signale`, Universum mit `universum`. */
function repo({ signale = ['AAA', 'BZH', 'LOGI'], ausgewiesen = ['LOGI'], universum = ['AAA', 'BZH', 'TRD', ...BASIS], asOf = '2026-10-23', universeAsOf = '2026-10-26', meta = {}, build = {}, trend = ['TRD'] } = {}) {
  const r = mkdtempSync(join(tmpdir(), 'vu-prune-'));
  const data = join(r, 'supertrader', 'data');
  mkdirSync(join(data, 'stock'), { recursive: true });
  mkdirSync(join(r, 'discover', 'data', 'stock-index'), { recursive: true });
  const schreibe = (rel, obj) => writeFileSync(join(r, rel), JSON.stringify(obj) + '\n');
  const alle = [...new Set([...signale, ...trend])].sort();
  const av = { source: SOURCE, checked: alle.length, unavailable: [...ausgewiesen].sort(), note: NOTE };
  const strategies = { DARVAS_BOX: { open: signale.map((s) => signal(s)), closed: [], invalidated: [], retired: [], scanner: { top: [] } } };
  const bySymbol = Object.fromEntries(signale.map((s) => [s, [{ strategyId: 'DARVAS_BOX', id: signal(s).id, state: 'SETUP' }]]));
  const signals = { schema: 'supertrader-signals-1.0.0', asOf, inputsGeneratedAt: '2026-10-24T02:33:37.003Z', policy: 'p', disclaimer: 'd', counts: { open: signale.length }, strategies, bySymbol, partialChecks: {}, discoverAvailability: av };
  schreibe('supertrader/data/signals.json', signals);
  schreibe('supertrader/data/signals-core.json', { ...signals, slice: 'core' });
  schreibe('supertrader/data/build.json', { asOf, ...build });
  schreibe('supertrader/data/trend52.json', { portfolio: { positions: trend.map((symbol) => ({ symbol })) }, prepared: { candidates: [] }, nearMisses: [], closed: [] });
  for (const s of alle) schreibe('supertrader/data/stock/' + s + '.json', { schema: 'x', slice: 'stock', symbol: s, bySymbol: bySymbol[s] ? { [s]: bySymbol[s] } : {}, discoverAvailability: { source: SOURCE, unavailable: ausgewiesen.includes(s) ? [s] : [], note: NOTE } });
  const sym = [...universum].sort();
  schreibe('discover/data/stock-index/US_REAL.json', { universeId: 'US_REAL', count: sym.length, note: 'n', symbols: sym });
  schreibe('discover/data/meta.json', { universes: [{ universeId: 'US_REAL', asOf: universeAsOf, generatedAt: '2026-10-27T02:43:11.310Z', securities: sym.length, withPriceSeries: sym.length, ...meta }] });
  return r;
}

/** Inhalt aller Dateien unter supertrader/ (Pfad -> Text). */
function stand(r) {
  const out = {};
  const lauf = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) lauf(p); else out[p.slice(r.length)] = readFileSync(p, 'utf8'); } };
  lauf(join(r, 'supertrader'));
  return out;
}
const json = (r, rel) => JSON.parse(readFileSync(join(r, rel), 'utf8'));
const ohneAusweis = (o) => ({ ...o, discoverAvailability: { ...o.discoverAvailability, unavailable: null } });
function bricht(r, code) {
  const vorher = stand(r);
  assert.throws(() => prune({ root: r }), (e) => e.code === code, code);
  assert.deepEqual(stand(r), vorher, code + ': nichts geschrieben');
}

test('BZH: aus dem Universum entfallen -> ausgewiesen; Signale, Werte und Stand byte-gleich', () => {
  const r = repo({ universum: ['AAA', 'TRD', ...BASIS] });
  const vorher = stand(r);
  const b = prune({ root: r });
  assert.equal(b.action, 'PRUNE');
  assert.deepEqual(b.added, ['BZH']);
  assert.deepEqual(b.unavailable, ['BZH', 'LOGI']);
  const nachher = stand(r);
  const geaendert = Object.keys(nachher).filter((k) => nachher[k] !== vorher[k]).sort();
  assert.deepEqual(geaendert, ['/supertrader/data/signals-core.json', '/supertrader/data/signals.json', '/supertrader/data/stock/BZH.json']);
  for (const k of geaendert) assert.deepEqual(ohneAusweis(JSON.parse(nachher[k])), ohneAusweis(JSON.parse(vorher[k])), k + ': nur der Ausweis');
  const sig = json(r, 'supertrader/data/signals.json');
  assert.equal(sig.asOf, '2026-10-23', 'kein neuer Stand');
  assert.equal(sig.discoverAvailability.checked, 3 + 1, 'Pruefumfang unveraendert');
  assert.deepEqual(sig.strategies.DARVAS_BOX.open.find((x) => x.symbol === 'BZH').levels, { trigger: 34.54, stop: 31.2 }, 'Signal bleibt, Werte unveraendert');
  assert.deepEqual(json(r, 'supertrader/data/stock/BZH.json').discoverAvailability.unavailable, ['BZH']);
  assert.ok(nachher['/supertrader/data/signals.json'].endsWith('}\n'), 'Build-Format');
  rmSync(r, { recursive: true, force: true });
});

test('idempotent: ein zweiter Lauf ohne Universumsaenderung schreibt nichts', () => {
  const r = repo({ universum: ['AAA', 'TRD', ...BASIS] });
  prune({ root: r });
  const einmal = stand(r);
  const b = prune({ root: r });
  assert.equal(b.action, 'NOOP');
  assert.deepEqual(b.files, []);
  assert.deepEqual(stand(r), einmal);
  rmSync(r, { recursive: true, force: true });
});

test('gueltige Titel bleiben unveraendert; nichts entfallen -> nichts geschrieben', () => {
  const r = repo({ universum: ['AAA', 'BZH', 'TRD', ...BASIS] });
  const vorher = stand(r);
  assert.equal(prune({ root: r }).action, 'NOOP');
  assert.deepEqual(stand(r), vorher);
  rmSync(r, { recursive: true, force: true });
});

test('leeres, defektes, fehlendes oder unvalidiertes Universum: Abbruch, nichts geschrieben', () => {
  const faelle = [
    [repo({ universum: [] }), 'UNIVERSE_INCOMPLETE'],
    [repo({ universum: ['AAA', 'TRD', ...BASIS.slice(0, LIMITS.minUniverse - 10)] }), 'UNIVERSE_INCOMPLETE'],
    [repo({ meta: { withPriceSeries: 900 } }), 'UNIVERSE_UNVALIDATED'],
    [repo({ meta: { universeId: 'EU' } }), 'UNIVERSE_UNVALIDATED'],
    [repo({ universeAsOf: '2026-10-22' }), 'UNIVERSE_OLDER'],
    [repo({ universum: ['AAA', 'aaa', ...BASIS] }), 'UNIVERSE_INVALID']
  ];
  const kaputt = repo();
  writeFileSync(join(kaputt, 'discover/data/stock-index/US_REAL.json'), '{"universeId":"US_REAL","symbols":[');
  faelle.push([kaputt, 'UNIVERSE_INVALID']);
  const fehlt = repo();
  rmSync(join(fehlt, 'discover/data/stock-index/US_REAL.json'));
  faelle.push([fehlt, 'UNIVERSE_INVALID']);
  const zaehlt = repo();
  const idx = json(zaehlt, 'discover/data/stock-index/US_REAL.json');
  writeFileSync(join(zaehlt, 'discover/data/stock-index/US_REAL.json'), JSON.stringify({ ...idx, count: idx.count + 5 }) + '\n');
  faelle.push([zaehlt, 'UNIVERSE_INVALID']);
  for (const [r, code] of faelle) { bricht(r, code); rmSync(r, { recursive: true, force: true }); }
});

test('unplausibler Schwund (viele Signal-Titel auf einmal entfallen): Abbruch statt Massenausweis', () => {
  const viele = Array.from({ length: 40 }, (_, i) => 'V' + String(i).padStart(3, '0'));
  const r = repo({ signale: ['AAA', ...viele], ausgewiesen: [], universum: ['AAA', 'TRD', ...BASIS] });
  bricht(r, 'UNIVERSE_SHRINK_IMPLAUSIBLE');
  rmSync(r, { recursive: true, force: true });
});

test('kanonische Identitaet: gleiche securityId unter anderem Kuerzel wird nicht geraten', () => {
  const r = repo({ signale: ['AAA', 'BRK.B'], ausgewiesen: [], universum: ['AAA', 'BRK-B', 'TRD', ...BASIS] });
  bricht(r, 'IDENTITY_AMBIGUOUS');
  rmSync(r, { recursive: true, force: true });
  assert.throws(() => validateUniverse({ universeId: 'US_REAL', count: 1202, symbols: ['BRK.B', 'BRK-B', ...BASIS] }, { universes: [{ universeId: 'US_REAL', asOf: '2026-10-26', generatedAt: '2026-10-27T00:00:00Z', securities: 1202, withPriceSeries: 1202 }] }, '2026-10-23'), (e) => e.code === 'IDENTITY_AMBIGUOUS');
});

test('wieder gefuehrtes Kuerzel (moegliche Neuvergabe): Ausweis bleibt, der volle Build entscheidet', () => {
  const r = repo({ universum: ['AAA', 'BZH', 'LOGI', 'TRD', ...BASIS] });
  const vorher = stand(r);
  const b = prune({ root: r });
  assert.equal(b.action, 'NOOP');
  assert.deepEqual(b.stillMarkedButListed, ['LOGI']);
  assert.deepEqual(stand(r), vorher);
  rmSync(r, { recursive: true, force: true });
});

test('widerspruechlicher Supertrader-Stand: Abbruch, nichts geschrieben', () => {
  for (const [r, code] of [
    [repo({ build: { asOf: '2026-10-22' } }), 'STATE_INCONSISTENT'],
    [repo({ trend: ['TRD', 'ZZZ'] }), null]
  ]) {
    if (code) { bricht(r, code); rmSync(r, { recursive: true, force: true }); continue; }
    /* Titelmenge passt nicht zum Pruefumfang (trend52.json anders als beim Build). */
    const t = json(r, 'supertrader/data/trend52.json');
    t.portfolio.positions.push({ symbol: 'NEU' });
    writeFileSync(join(r, 'supertrader/data/trend52.json'), JSON.stringify(t) + '\n');
    bricht(r, 'STATE_INCONSISTENT');
    rmSync(r, { recursive: true, force: true });
  }
});

test('gescheiterte Quant-Materialisierung: Bereinigung laeuft, ohne Markt- oder Quant-Daten zu lesen', () => {
  /* Das Wegwerf-Repository hat gar kein quant/ - wie ein Nachtlauf, dessen Materialisierung rot war. */
  const r = repo({ universum: ['AAA', 'TRD', ...BASIS] });
  const b = prune({ root: r });
  assert.equal(b.action, 'PRUNE');
  assert.deepEqual(b.added, ['BZH']);
  rmSync(r, { recursive: true, force: true });
  const src = readFileSync(join(ROOT, 'scripts', 'supertrader', 'prune-dead-refs.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /quant\/|'quant'|TIINGO|MARKETSTACK|fetch\(|https?:/i, 'keine Markt-/Quant-Daten, kein Anbieter');
  assert.doesNotMatch(src, /'ledger'|ledger\//, 'Ledger unberuehrt');
});

test('nie zuruecknehmen: neu entfallener Titel und gleichzeitig wieder gefuehrtes Kuerzel', () => {
  /* BZH entfaellt, LOGI steht wieder im Universum: BZH wird ausgewiesen, LOGI bleibt ausgewiesen. */
  const r = repo({ universum: ['AAA', 'LOGI', 'TRD', ...BASIS] });
  const b = prune({ root: r });
  assert.deepEqual(b.added, ['BZH']);
  assert.deepEqual(b.stillMarkedButListed, ['LOGI']);
  assert.deepEqual(json(r, 'supertrader/data/signals.json').discoverAvailability.unavailable, ['BZH', 'LOGI']);
  assert.deepEqual(json(r, 'supertrader/data/stock/LOGI.json').discoverAvailability.unavailable, ['LOGI']);
  rmSync(r, { recursive: true, force: true });
});

test('abgebrochener Lauf (Ausschnitt schon umbenannt, signals.json noch alt): erneuter Lauf vervollstaendigt', () => {
  const r = repo({ universum: ['AAA', 'TRD', ...BASIS] });
  const ziel = repo({ universum: ['AAA', 'TRD', ...BASIS] });
  prune({ root: ziel });
  /* Zustand nach Abbruch zwischen den Umbenennungen: nur stock/BZH.json ist neu. */
  writeFileSync(join(r, 'supertrader/data/stock/BZH.json'), readFileSync(join(ziel, 'supertrader/data/stock/BZH.json')));
  const b = prune({ root: r });
  assert.equal(b.action, 'PRUNE');
  assert.deepEqual(b.files, ['supertrader/data/signals-core.json', 'supertrader/data/signals.json']);
  assert.deepEqual(stand(r), stand(ziel), 'gleiches Ergebnis wie ein ununterbrochener Lauf');
  assert.equal(prune({ root: r }).action, 'NOOP');
  for (const x of [r, ziel]) rmSync(x, { recursive: true, force: true });
});

test('Bereinigung laedt keine Engines: nur die reinen Ausweis-Funktionen, dieselben wie im Build', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'supertrader', 'prune-dead-refs.mjs'), 'utf8');
  const importe = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(importe, ['./discover-availability.mjs', 'node:fs', 'node:module', 'node:path', 'node:url']);
  assert.equal(ausBuild, discoverAvailability, 'Build und Bereinigung teilen dieselbe Funktion');
});

test('Ergebnis entspricht dem Ausweis des vollen Builds fuer dieselben Eingaben', () => {
  const universum = ['AAA', 'TRD', ...BASIS];
  const r = repo({ universum });
  prune({ root: r });
  const voll = discoverAvailability(['AAA', 'BZH', 'LOGI', 'TRD'], universum);
  assert.deepEqual(json(r, 'supertrader/data/signals.json').discoverAvailability.unavailable, voll.unavailable);
  rmSync(r, { recursive: true, force: true });
});

test('planPrune ist rein und pruefbar; CLI: Abbruch = Exit 2, Trockenlauf schreibt nichts', () => {
  const r = repo({ universum: ['AAA', 'TRD', ...BASIS] });
  const vorher = stand(r);
  const log = console.log; const zeilen = []; console.log = (x) => zeilen.push(String(x));
  try {
    assert.equal(main(['--root=' + r, '--dry-run'], {}), 0);
    assert.deepEqual(stand(r), vorher, 'Trockenlauf');
    assert.match(zeilen.at(-1), /"action":"PRUNE".*"added":\["BZH"\]/);
    writeFileSync(join(r, 'discover/data/stock-index/US_REAL.json'), '{}');
    assert.equal(main(['--root=' + r], {}), 2);
    assert.match(zeilen.join('\n'), /::error title=Supertrader-Bereinigung::UNIVERSE_INVALID/);
  } finally { console.log = log; }
  assert.deepEqual(stand(r), vorher);
  rmSync(r, { recursive: true, force: true });
  assert.equal(typeof planPrune, 'function');
});

test('Workflow: Bereinigung nur per Modus-Eingabe, ohne Anbieterabruf und ohne vollen Build, Tests vor dem Commit', () => {
  const wf = readFileSync(join(ROOT, '.github', 'workflows', 'supertrader-signals.yml'), 'utf8');
  assert.match(wf, /cron: '17 6 \* \* 2-6'/, 'Zeitplan unveraendert');
  assert.match(wf, /mode:\s*\n(?:\s+.*\n)*?\s+options:\s*\n\s+- build\s*\n\s+- prune-dead-refs/);
  assert.match(wf, /MODE: \$\{\{ inputs\.mode \|\| 'build' \}\}/, 'Eingabe nur ueber env');
  assert.doesNotMatch(wf.replace(/MODE: \$\{\{ inputs\.mode \|\| 'build' \}\}/, ''), /\$\{\{\s*inputs\./, 'keine Eingabe im Shell-Text');
  const schritte = wf.split('\n      - ').slice(1);
  const schritt = (re) => schritte.find((s) => re.test(s)) || '';
  assert.match(schritt(/intraday-prefetch\.mjs/), /if: env\.MODE == 'build'/, 'kein Minutenabruf bei der Bereinigung');
  assert.match(schritt(/supertrader\/build\.mjs/), /if: env\.MODE == 'build'/, 'kein voller Build bei der Bereinigung');
  assert.match(schritt(/prune-dead-refs\.mjs/), /if: env\.MODE == 'prune-dead-refs'/);
  assert.doesNotMatch(schritt(/prune-dead-refs\.mjs/), /TIINGO|secrets\./);
  assert.ok(wf.indexOf('node --test "scripts/supertrader/tests/*.test.mjs"') < wf.indexOf('commit-and-push.sh'), 'Tests vor dem Commit');
  assert.match(schritt(/supertrader\/build\.mjs/), /NODE_OPTIONS: --max-old-space-size=3072/, 'Heap nur fuer den Build');
  assert.equal((wf.match(/max-old-space-size/g) || []).length, 1);
});
