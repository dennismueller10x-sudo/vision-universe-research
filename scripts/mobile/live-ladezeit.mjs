#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — live-ladezeit.mjs   (Monitor-Auswahl "ladezeit", 23.11.2026)

   Taegliche Ladezeitmessung der VEROEFFENTLICHTEN Seiten auf dem Handy-Profil des mobilen Labors
   (scripts/mobile/measure.mjs: 390x844, 1,6 Mbit/s, 150 ms, CPU 4x und 2x, kalter Cache, Service Worker blockiert):
   - app: research.visionuniverse.de, hinter der Zugangsmaske (Geheimnis RESEARCH_ACCESS_PASSWORD nur ueber die Umgebung)
   - www: www.visionuniverse.de, offen
   Je Route mehrere Laeufe, Median. Ergebnis: report.json und report.md. Vergleich mit den Berichten der letzten Laeufe
   (Verlauf ohne Commit: das Workflow-Artefakt "ladezeit" der Vortage, per API geholt) und mit den Zielen in
   ladezeit-targets.json. Alarm (Exit 1, rot, blockiert keinen Code-PR): LCP ueber dem Ziel der Route, LCP mehr als 30 % und
   300 ms ueber dem Median der letzten 7 Laeufe, CLS ueber 0,1, Requests mehr als 30 % (und 5) ueber dem Median, oder keine Messung.
   Das Passwort steht nie in Argumenten, Bericht, Rohdaten oder Artefakt (dieses Skript prueft das vor dem Schreiben);
   es wird nichts aufgezeichnet ausser Kennzahlen.
   ========================================================================= */
import {readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SITES = Object.freeze({
 app: {base: 'https://research.visionuniverse.de', gate: true,
  routes: ['/', '/discover/', '/quant/', '/technical/', '/mein-dashboard/', '/quant/#/aktie/NVDA']},
 www: {base: 'https://www.visionuniverse.de', gate: false, routes: ['/', '/magazin/', '/news/']}
});
export const CPUS = Object.freeze([4, 2]);

export const median = (values) => {
 const a = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y);
 if (!a.length) return null;
 const m = Math.floor(a.length / 2);
 return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Knotenname (Tag#id.Klasse) ohne Inhalte; nur Struktur, nie Text. */
const nodeName = (n) => String(n || '').slice(0, 120);
/** LCP-Element des mittleren Laufs: Tag, Id, Bildadresse nur als Pfad (ohne Abfrage). */
export function lcpElementOf(ss) {
 const withLcp = ss.filter((s) => typeof s.lcp === 'number').sort((a, b) => a.lcp - b.lcp);
 const e = (withLcp[Math.floor(withLcp.length / 2)] || {}).lcpElement;
 if (!e) return null;
 let url = ''; try { url = e.url ? new URL(e.url, 'https://x.invalid').pathname : ''; } catch { url = ''; }
 return {tag: e.tag || '', id: e.id || '', url: url.slice(0, 120)};
}
/** Groesste einzelne Verschiebung aller Laeufe (Wert, Zeitpunkt, Knoten): benennt, WAS springt. */
export function topShiftOf(ss) {
 let best = null;
 for (const s of ss) for (const sh of s.shifts || []) if (!best || sh.value > best.value) best = {value: sh.value, at: sh.at, nodes: (sh.sources || []).map((x) => nodeName(x.node)).slice(0, 3)};
 return best ? {value: Math.round(best.value * 1000) / 1000, atMs: Math.round(best.at), nodes: best.nodes} : null;
}
/** Zugangshuelle (nur Host mit Maske): Ende der Huelle und Ende der Inhalts-Antwort, Median je Lauf in ms. */
export function gateOf(ss) {
 const shell = [], content = [];
 for (const s of ss) {
  const nav = s.navigation && s.navigation.responseEnd;
  const c = (s.resourceTimings || []).find((r) => /\/__research\/content\//.test(String(r.name)));
  if (typeof nav === 'number' && c && typeof c.end === 'number') { shell.push(nav); content.push(c.end); }
 }
 const sh = median(shell), co = median(content);
 return sh == null || co == null ? null : {shellMs: Math.round(sh), contentMs: Math.round(co), extraMs: Math.round(co - sh)};
}

/** Zeilen je Route aus der Rohdatei von measure.mjs (nur Kennzahlen; keine Adressen, keine Antworten). */
export function rowsFromRaw(raw, site, cpu) {
 return (raw.rows || []).map((r) => {
  const ss = (raw.samples || []).filter((s) => s.route === r.route);
  return {
   key: site + r.route, site, route: r.route, cpu,
   lcp: r.lcp ?? null, cls: r.cls ?? null, requests: r.requests ?? null, bytes: r.bytes ?? null,
   runs: ss.length, invalidRuns: r.invalidRuns ?? 0, incompleteRuns: r.incompleteRuns ?? 0, failedRuns: r.failedRuns ?? 0,
   lcpRuns: ss.map((s) => (typeof s.lcp === 'number' ? Math.round(s.lcp) : null)),
   lcpElement: lcpElementOf(ss), topShift: topShiftOf(ss), gate: gateOf(ss),
   errors: [...new Set(ss.flatMap((s) => s.errors || []))].slice(0, 3)
  };
 });
}

/** Median je Schluessel und Profil aus den letzten Berichten (neueste zuerst). */
export function baselineFrom(history, key, cpu, limit) {
 const lcp = [], req = [];
 for (const rep of history.slice(0, limit)) {
  const row = (rep.rows || []).find((r) => r.key === key && r.cpu === cpu);
  if (row && typeof row.lcp === 'number') lcp.push(row.lcp);
  if (row && typeof row.requests === 'number') req.push(row.requests);
 }
 return {n: lcp.length, lcp: median(lcp), requests: median(req)};
}

/** Alarme je Zeile. Rein: Zeilen, Ziele, Verlauf rein, Alarmliste raus. */
export function evaluate(rows, targets, history) {
 const d = targets.default, alarms = [];
 for (const row of rows) {
  const t = {...d, ...(targets.routes[row.key] || {})};
  const base = baselineFrom(history, row.key, row.cpu, d.historyRuns);
  const add = (art, text) => alarms.push({key: row.key, cpu: row.cpu, art, text});
  /* Ungueltige Laeufe (Zugangsmaske oder Inhaltsmerkmal fehlt) zaehlen nie als Messwert: ein ungueltiger Wert ist kein gruener Wert. */
  if (row.runs > 0 && (row.invalidRuns || 0) > row.runs / 2) { add('ungueltig', 'Messung ungueltig (' + row.invalidRuns + ' von ' + row.runs + ' Laeufen ohne Inhaltsmerkmal ' + (t.marker ? '"' + t.marker + '"' : 'oder mit Zugangsmaske') + ')'); continue; }
  const ohneLcp = (row.lcpRuns || []).filter((x) => x == null).length;
  if (row.lcp == null || ohneLcp > row.runs / 2) { add('keine-messung', 'LCP nicht gemessen (' + ohneLcp + ' von ' + row.runs + ' Laeufen ohne Wert)'); continue; }
  if (typeof t.lcpMs === 'number' && row.lcp > t.lcpMs) add('lcp-ziel', 'LCP ' + Math.round(row.lcp) + ' ms ueber dem Ziel ' + t.lcpMs + ' ms');
  if (base.n >= d.historyMinRuns && base.lcp != null && row.lcp > base.lcp * t.lcpRelativeFactor && row.lcp - base.lcp > t.lcpRelativeMinMs)
   add('lcp-verlauf', 'LCP ' + Math.round(row.lcp) + ' ms gegen Median ' + Math.round(base.lcp) + ' ms der letzten ' + base.n + ' Laeufe (+' + Math.round((row.lcp / base.lcp - 1) * 100) + ' %)');
  if (typeof row.cls === 'number' && row.cls > t.clsMax) add('cls', 'CLS ' + row.cls.toFixed(3) + ' ueber ' + t.clsMax);
  if (base.n >= d.historyMinRuns && base.requests != null && row.requests > base.requests * t.requestsFactor && row.requests - base.requests > t.requestsMin)
   add('requests', row.requests + ' Requests gegen Median ' + base.requests + ' (+' + Math.round((row.requests / base.requests - 1) * 100) + ' %)');
 }
 return alarms;
}

/** Berichte der Vortage (je Unterordner ein report.json), neueste zuerst. */
export function loadHistory(dir) {
 if (!dir || !existsSync(dir)) return [];
 const out = [], walk = (p) => { for (const e of readdirSync(p)) { const q = join(p, e); if (statSync(q).isDirectory()) walk(q); else if (e === 'report.json') { try { const j = JSON.parse(readFileSync(q, 'utf8')); if (j && j.schema === 'vu-ladezeit-1' && Array.isArray(j.rows)) out.push(j); } catch { /* ungueltig: ignorieren */ } } } };
 walk(dir);
 return out.sort((a, b) => String(b.measuredAt).localeCompare(String(a.measuredAt)));
}

export function reportMarkdown(report) {
 const L = ['# Ladezeit live (' + report.measuredAt + ', Commit ' + (report.commit || '?').slice(0, 9) + ')', '',
  'Profil: 390x844, 1,6 Mbit/s, 150 ms, kalter Cache; je Route ' + report.runs + ' Laeufe, Median. Verlauf: ' + report.historyRuns + ' Berichte.', '',
  '| Seite/Route | CPU | LCP ms | CLS | Requests | Wire KB | LCP je Lauf |', '|---|---|---|---|---|---|---|'];
 for (const r of report.rows) L.push('| ' + r.key + ' | ' + r.cpu + 'x | ' + ((r.invalidRuns || 0) > r.runs / 2 ? 'ungueltig' : r.lcp == null ? '-' : Math.round(r.lcp)) + ' | ' + (r.cls == null ? '-' : r.cls.toFixed(3)) + ' | ' + (r.requests ?? '-') + ' | ' + (r.bytes == null ? '-' : Math.round(r.bytes / 1024)) + ' | ' + r.lcpRuns.join(', ') + ' |');
 L.push('', report.alarms.length ? '## Alarme (' + report.alarms.length + ')' : '## Keine Alarme', '');
 for (const a of report.alarms) L.push('- ' + a.key + ' (' + a.cpu + 'x): ' + a.text);
 L.push('');
 const detail = report.rows.filter((r) => r.cpu === Math.max(...report.rows.map((x) => x.cpu)));
 const d = [];
 for (const r of detail) {
  if (r.lcpElement) d.push('- ' + r.key + ' LCP-Element: ' + r.lcpElement.tag + (r.lcpElement.id ? '#' + r.lcpElement.id : '') + (r.lcpElement.url ? ' ' + r.lcpElement.url : ''));
  if (r.topShift) d.push('- ' + r.key + ' groesste Verschiebung: ' + r.topShift.value + ' bei ' + r.topShift.atMs + ' ms, Knoten ' + r.topShift.nodes.join(' | '));
  if (r.gate) d.push('- ' + r.key + ' Zugangshuelle: Huelle bis ' + r.gate.shellMs + ' ms, Inhalt bis ' + r.gate.contentMs + ' ms (+' + r.gate.extraMs + ' ms)');
 }
 if (d.length) L.push('## Details (CPU ' + Math.max(...report.rows.map((x) => x.cpu)) + 'x)', '', ...d, '');
 return L.join('\n') + '\n';
}

/** Vor dem Schreiben: kein Geheimnis in Text und Rohdaten. */
export function assertNoSecret(text, secrets) {
 for (const s of secrets) if (s && String(s).length >= 6 && text.includes(String(s))) throw Error('SECRET_IN_OUTPUT');
}

function arg(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }

async function main() {
 const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
 const out = resolve(arg('--out', 'ladezeit')), runs = Number(arg('--runs', 3)), windowMs = Number(arg('--window', 12000));
 const which = arg('--site', 'all'), targets = JSON.parse(readFileSync(new URL('./ladezeit-targets.json', import.meta.url), 'utf8'));
 const history = loadHistory(arg('--history', ''));
 const password = process.env.RESEARCH_ACCESS_PASSWORD || '';
 const secrets = [password];
 if (password) { const {accessStateFor} = await import(new URL('../access-gate/build.mjs', import.meta.url)); secrets.push(accessStateFor(password).key); }
 mkdirSync(out, {recursive: true});
 const rows = [];
 for (const [site, cfg] of Object.entries(SITES)) {
  if (which !== 'all' && which !== site) continue;
  if (cfg.gate && !password) { console.error('Kein RESEARCH_ACCESS_PASSWORD: ' + site + ' nicht gemessen'); rows.push(...cfg.routes.flatMap((route) => CPUS.map((cpu) => ({key: site + route, site, route, cpu, lcp: null, cls: null, requests: null, bytes: null, runs: 0, incompleteRuns: 1, failedRuns: 0, lcpRuns: [], errors: ['Zugang fehlt']})))); continue; }
  const base = arg('--' + site + '-base', cfg.base);
  for (const cpu of CPUS) {
   const rawPath = join(out, 'raw-' + site + '-cpu' + cpu + '.json');
   const args = [join(root, 'scripts/mobile/measure.mjs'), '--base-url', base, '--routes', cfg.routes.join(','), '--runs', String(runs), '--cpu', String(cpu), '--window', String(windowMs), '--out', rawPath];
   const expect = {}; for (const route of cfg.routes) { const m = (targets.routes[site + route] || {}).marker; if (m) expect[route] = m; }
   const expectPath = join(out, 'expect-' + site + '.json'); writeFileSync(expectPath, JSON.stringify(expect)); args.push('--expect', expectPath);
   if (cfg.gate) args.push('--gate');
   if (arg('--browser')) args.push('--browser', arg('--browser'));
   const r = spawnSync(process.execPath, args, {cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 1 << 26});
   assertNoSecret((r.stdout || '') + (r.stderr || ''), secrets);
   if (r.status !== 0) { console.error(site + ' CPU ' + cpu + 'x: Messung fehlgeschlagen (Exit ' + r.status + ')'); continue; }
   rows.push(...rowsFromRaw(JSON.parse(readFileSync(rawPath, 'utf8')), site, cpu));
  }
 }
 const alarms = evaluate(rows, targets, history);
 let commit = ''; try { commit = process.env.GITHUB_SHA || ''; } catch { /* ohne */ }
 const report = {schema: 'vu-ladezeit-1', measuredAt: new Date().toISOString(), commit, runs, historyRuns: history.length, rows, alarms};
 const json = JSON.stringify(report, null, 2) + '\n', md = reportMarkdown(report);
 assertNoSecret(json + md, secrets);
 writeFileSync(join(out, 'report.json'), json); writeFileSync(join(out, 'report.md'), md);
 for (const f of readdirSync(out).filter((n) => n.startsWith('raw-'))) assertNoSecret(readFileSync(join(out, f), 'utf8'), secrets);
 console.log(md);
 process.exitCode = alarms.length ? 1 : 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exitCode = 2; });
