#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — intraday-fastpath.mjs

   SCHNELLWEG FUER INTRADAY-DATEN (Owner/Steuerung 11.11.2026)

   Ein Voll-Release (Bau + zwei Browser-Smokes) dauert ~20 Minuten, der Takt
   schreibt alle 5 Minuten. Der Chart auf der Aktienseite lag dadurch bis zu
   45 Minuten hinter der Boerse (Befund iPhone 11.11.2026). Aenderte sich seit
   dem letzten VOLL-Release nichts ausser Intraday-Dateien, braucht es keinen
   Bau: das ausgelieferte Paket (Pages-Artefakt) bekommt die neuen Intraday-
   Dateien darueber, ein kleiner Smoke prueft sie, dann wird ausgerollt.
   Code-Releases bleiben bei vollem Bau und vollem Smoke.

   Unterbefehle:
     klassifiziere --base=<sha> [--head=HEAD]   gibt FAST oder FULL aus (+ Grund)
     overlay --repo=<dir> --site=<dir>           Intraday-Dateien ueber das Paket legen
     smoke --repo=<dir> --site=<dir>             Pruefsumme, Schema, ein Seitenaufruf
   ========================================================================= */
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {cp, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/* Was der Schnellweg ausliefert (alles andere erzwingt den Voll-Release). */
export const INTRADAY_DIR = 'quant/data/market/intraday';
export const INTRADAY_FILES = ['quant/data/market/commercial/intraday-delivery-watchdog.json'];
/* Aenderungen, die nicht in die Auslieferung gehen und nichts am Bau aendern: sie zaehlen nicht gegen den Schnellweg.
   Gemessen am gebauten Release (12.11.2026): diese Pfade kommen darin nicht vor. NICHT dazu gehoert, was der Bau liest oder
   ausfuehrt (scripts/vu2, scripts/core, scripts/account, scripts/watchlist, scripts/mobile, scripts/technical/elliott-home,
   scripts/market, scripts/company_intelligence, scripts/access-gate) und pages-release.yml selbst. */
export const IGNORED_PREFIXES = ['docs/', '.claude/', 'app/', 'brand-media/', 'providers/', 'worker/', 'worker-waker/',
  'scripts/quality/', 'scripts/ci/', 'scripts/quant/', 'scripts/supertrader/', 'scripts/research/', 'scripts/design/',
  'scripts/diagnose/', 'scripts/brevo/', 'scripts/legal/', 'scripts/insider/', 'scripts/marketstack/',
  'scripts/official-filings/', 'scripts/dashboard/', 'scripts/home/', 'scripts/discover/'];
export const IGNORED_PATTERNS = [/\.md$/, /(^|\/)tests\/[^/]+/, /-qa\.mjs$/, /^\.github\/(?!workflows\/pages-release\.yml$)/,
  /^(\.gitignore|\.vercelignore|\.env\.example)$/];

export function isIntraday(path) {
  return path.startsWith(INTRADAY_DIR + '/') || INTRADAY_FILES.includes(path);
}
export function isIgnored(path) {
  return IGNORED_PREFIXES.some((p) => path.startsWith(p)) || IGNORED_PATTERNS.some((r) => r.test(path));
}
export function klassifiziere(changed) {
  const other = changed.filter((p) => p && !isIntraday(p) && !isIgnored(p));
  const intraday = changed.filter(isIntraday);
  if (other.length) return {mode: 'FULL', reason: 'andere Dateien geaendert: ' + other.slice(0, 5).join(', ') + (other.length > 5 ? ' (+' + (other.length - 5) + ')' : '')};
  if (!intraday.length) return {mode: 'FULL', reason: 'keine Intraday-Aenderung seit dem Basis-Release (nichts zu beschleunigen)'};
  return {mode: 'FAST', reason: intraday.length + ' Intraday-Dateien'};
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
async function walk(dir, base = dir, out = []) {
  for (const e of await readdir(dir, {withFileTypes: true})) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, base, out); else out.push(relative(base, p));
  }
  return out;
}

export async function overlay(repo, site) {
  const src = resolve(repo, INTRADAY_DIR), dst = resolve(site, INTRADAY_DIR);
  if (!existsSync(src)) throw Error('INTRADAY_QUELLE_FEHLT');
  await rm(dst, {recursive: true, force: true});
  await mkdir(dst, {recursive: true});
  await cp(src, dst, {recursive: true});
  for (const f of INTRADAY_FILES) {
    if (!existsSync(resolve(repo, f))) continue;
    await mkdir(resolve(site, f, '..'), {recursive: true});
    await cp(resolve(repo, f), resolve(site, f));
  }
  const files = (await walk(dst)).length;
  const marker = {schema: 1, kind: 'INTRADAY_FASTPATH', files, at: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim()};
  await writeFile(resolve(site, 'intraday-fastpath.json'), JSON.stringify(marker) + '\n');
  return marker;
}

export async function pruefe(repo, site) {
  const fehler = [];
  const src = resolve(repo, INTRADAY_DIR), dst = resolve(site, INTRADAY_DIR);
  const quell = await walk(src);
  const ziel = new Set(await walk(dst));
  for (const f of quell) {
    if (!ziel.has(f)) { fehler.push('fehlt im Paket: ' + f); continue; }
    if (sha256(await readFile(join(src, f))) !== sha256(await readFile(join(dst, f)))) fehler.push('Pruefsumme weicht ab: ' + f);
  }
  for (const f of quell) {
    if (!f.endsWith('.json')) continue;
    let j; try { j = JSON.parse(await readFile(join(dst, f), 'utf8')); } catch { fehler.push('kein gueltiges JSON: ' + f); continue; }
    if (/\/ref_[^/]+\.json$/.test('/' + f) && j.schemaVersion !== 'intraday-snapshot-1.0.0') fehler.push('Schema weicht ab: ' + f + ' (' + j.schemaVersion + ')');
  }
  if (!quell.includes('index.json')) fehler.push('index.json fehlt');
  return {geprueft: quell.length, fehler};
}

async function seitenaufruf(site) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv = spawn(process.execPath, [resolve(import.meta.dirname, 'static-server.mjs'), '--dir=' + site, '--port=' + port], {stdio: 'ignore'});
  try {
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) { try { ok = (await fetch(`http://127.0.0.1:${port}/discover/`)).ok; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    if (!ok) return ['Seitenaufruf /discover/ nicht erreichbar'];
    const fehler = [];
    for (const p of ['/quant/data/market/intraday/index.json']) {
      const r = await fetch(`http://127.0.0.1:${port}${p}`);
      if (!r.ok) fehler.push(p + ' -> ' + r.status); else JSON.parse(await r.text());
    }
    return fehler;
  } finally { srv.kill(); }
}

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  try {
    if (cmd === 'klassifiziere') {
      const base = arg('base'), head = arg('head', 'HEAD');
      if (!/^[0-9a-f]{40}$/.test(base || '')) throw Error('BASIS_SHA_UNGUELTIG');
      const changed = execFileSync('git', ['diff', '--name-only', base, head], {encoding: 'utf8', maxBuffer: 1 << 28}).split('\n').filter(Boolean);
      const k = klassifiziere(changed);
      console.log(k.mode + ' ' + k.reason);
      if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, 'mode=' + k.mode + '\n', {flag: 'a'});
    } else if (cmd === 'overlay') {
      console.log(JSON.stringify(await overlay(arg('repo', '.'), arg('site'))));
    } else if (cmd === 'smoke') {
      const r = await pruefe(arg('repo', '.'), arg('site'));
      r.fehler.push(...await seitenaufruf(resolve(arg('site'))));
      console.log(JSON.stringify(r));
      if (r.fehler.length) { console.error(r.fehler.slice(0, 10).join('\n')); process.exitCode = 1; }
    } else throw Error('UNBEKANNTER_BEFEHL');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
