#!/usr/bin/env node
// Conservative inventory, never a deletion command. Node 22, no dependencies.
import {execFileSync} from 'node:child_process';
import {readFileSync, lstatSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, dirname, posix} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPORT = 'docs/quality/UNUSED_REPORT.md';
const TEXT = /\.(?:[cm]?js|ts|tsx|jsx|html?|css|json|ya?ml|toml|sh|py|md|txt)$/i;
const CODE = /\.(?:[cm]?js|ts|tsx|jsx|html?|css|sh|py)$/i;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const AREAS = ['vu2/', 'discover-v2/', 'dashboard/', 'worker-waker/', 'landing/review/', 'evidence/', 'scripts/'];

export function protectedReason(path) {
  if (/^(quant|discover|supertrader|social)\/data\//.test(path)) return 'generierte Produktdaten (Tabu)';
  if (/(^|\/)data\//.test(path)) return 'Daten: vorsorglich behalten';
  if (/^assets\//.test(path)) return 'Strang E5 (Tabu)';
  if (/^app\//.test(path)) return 'native App (Tabu)';
  if (/^workers\/vu-account\//.test(path)) return 'Account-Worker (Tabu)';
  if (/^docs\/research\//.test(path)) return 'Forschung (Tabu)';
  if (/(^|\/)(?:legal|recht|impressum|datenschutz|nutzungsbedingungen|risikohinweise?|agb|privacy|terms|disclaimer)(?:[-_/.]|$)/i.test(path)) return 'Rechtstext/-unterlagen (Tabu)';
  return null;
}

function globRegex(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { i++; out += '(?:.*/)?'; } else out += '.*';
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out + '$');
}

/** Sources are text supplied by the caller; all tracked files remain graph nodes.
 * Mentions, comments, path filters and directory/glob references count conservatively.
 * This intentionally overestimates usage. Missing edges never establish non-usage.
 */
export function buildGraph(files, sources) {
  const nodes = new Set(files), incoming = new Map(files.map(p => [p, new Map()]));
  const namedByWorkflow = new Set(), dynamic = [], basename = new Map(), folders = new Map([['', files]]), cache = new Map();
  for (const p of files) {
    const b = posix.basename(p);
    if (!basename.has(b)) basename.set(b, []);
    basename.get(b).push(p);
    for (let i = p.indexOf('/'); i !== -1; i = p.indexOf('/', i + 1)) {
      const dir = p.slice(0, i + 1);
      if (!folders.has(dir)) folders.set(dir, []);
      folders.get(dir).push(p);
    }
  }
  function targets(source, raw) {
    // Whole command strings are also tokenized below. A bare '*' in a score
    // formula or ignore list is not a reference to every repository file.
    if (/\s/.test(raw) || (!raw.includes('/') && !/\.[a-z][a-z0-9*?]*([?#].*)?$/i.test(raw))) return [];
    // Playwright route('**/*') intercepts network requests; it is not a local
    // dependency on the entire repository. Keep anchored and extension globs.
    if (/[?*]/.test(raw) && !/[a-z0-9]/i.test(raw.slice(0, raw.search(/[?*]/))) && !/\.[a-z0-9]+$/i.test(raw)) return [];
    const key = posix.dirname(source) + '\0' + raw;
    if (cache.has(key)) return cache.get(key);
    let token = raw.replace(/&amp;/g, '&').replace(/^file:\/\//, '');
    if (/^(?:[a-z]+:|\/\/|#)/i.test(token)) return [];
    try { token = decodeURIComponent(token); } catch { /* retain malformed literal */ }
    // ? is a query separator after a filename/route, but also a shell glob.
    token = token.split('#')[0].replace(/\?[^/]*=.*/, '').replace(/\?(?:v|t|cache)\b.*/, '');
    if (!token || token.includes('${')) return [];
    const rootPath = token.replace(/^\/+/, '').replace(/^\.\//, '');
    const relative = posix.normalize(posix.join(posix.dirname(source), token));
    const choices = token.startsWith('/') ? [rootPath] : [relative, rootPath];
    const found = new Set();
    for (const c of choices) {
      for (const p of [c, c + '.js', c + '.mjs', c + '.cjs', c + '.json', c.replace(/\/$/, '') + '/index.html', c + '/index.js']) {
        if (nodes.has(p)) found.add(p);
      }
      if (/[?*]/.test(c)) {
        const regex = globRegex(c);
        const literal = c.slice(0, c.search(/[?*]/));
        const dir = literal.slice(0, literal.lastIndexOf('/') + 1);
        for (const p of folders.get(dir) || []) if (regex.test(p)) found.add(p);
      } else if (c.endsWith('/') && !/\.html?$/.test(source)) {
        for (const p of folders.get(c) || []) found.add(p);
      }
    }
    // Browser fetch paths resolve against the document, not the JS module.
    // Also retain ambiguous basename calls in shell working directories.
    if (!found.size && !token.startsWith('/') && !token.startsWith('../')) {
      for (const p of basename.get(posix.basename(token)) || []) {
        if (!token.includes('/') || p.endsWith('/' + rootPath)) found.add(p);
      }
    }
    const result = [...found]; cache.set(key, result); return result;
  }
  for (const [source, text] of sources) {
    if (source === REPORT) continue; // generated findings must not manufacture usage
    const kind = WORKFLOW.test(source) ? 'workflow' : /(^|\/)tests?\//.test(source) || /\.test\./.test(source) ? 'test' : /package\.json$/.test(source) ? 'package' : /core\/registry\//.test(source) ? 'registry' : /\.html?$/.test(source) ? 'html' : 'source/mention';
    const tokens = new Set();
    // Includes import/export-from, require(), fetch(), HTML src/href, CSS url(),
    // package scripts, multiline YAML run blocks, Python/shell and registry strings.
    for (const m of text.matchAll(/["'`]([^"'`\r\n]{1,500})["'`]/g)) tokens.add(m[1]);
    for (const m of text.matchAll(/url\(\s*([^\s)"']+)\s*\)|(?:src|href)\s*=\s*([^\s>"']+)/gi)) tokens.add(m[1] || m[2]);
    for (const m of text.matchAll(/(?:\.{0,2}\/)?[\w@.*-]+(?:\/[\w@.*?+-]+)+\/?|[\w@*-]+\.(?:[cm]?js|py|sh|html|css|ya?ml)\b/g)) tokens.add(m[0]);
    for (const token of tokens) {
      for (const target of targets(source, token)) {
        if (source === target) continue;
        const edgeKind = /[*?]/.test(token) || token.endsWith('/') && !/\.html?$/.test(source) ? kind + ':scope' : kind;
        const previous = incoming.get(target).get(source);
        if (!previous || previous.endsWith(':scope')) incoming.get(target).set(source, edgeKind);
        // Exact named paths/cwd mentions are protected; broad CI path globs are edges only.
        if (kind === 'workflow' && !/[?*]/.test(token)) namedByWorkflow.add(target);
      }
    }
    for (const m of text.matchAll(/\b(?:import|require|fetch)\s*\(\s*([^\n;]{1,160})/g)) {
      if (!/^["'][^"']+["']\s*[,)]/.test(m[1])) dynamic.push({source, expression: m[0]});
    }
  }
  return {incoming, namedByWorkflow, dynamic};
}

const cell = s => String(s).replace(/\|/g, '&#124;').replace(/[\r\n]/g, ' ');

const codeCell = value => {
  const text = cell(value), runs = text.match(/`+/g) || [], ticks = '`'.repeat(Math.max(0, ...runs.map(x => x.length)) + 1);
  return ticks + ' ' + text + ' ' + ticks;
};

export function renderReport({files, sources, sizes, commit, skipped = [], live = null, beforeSizes = sizes, comparisonCommit = commit}) {
  const graph = buildGraph(files, sources);
  const candidates = files.filter(p => p !== REPORT && !protectedReason(p));
  const zero = candidates.filter(p => graph.incoming.get(p).size === 0);
  const scopeOnly = candidates.filter(p => graph.incoming.get(p).size && [...graph.incoming.get(p).values()].every(k => k.endsWith(':scope')));
  const protectedZero = files.filter(p => protectedReason(p) && graph.incoming.get(p).size === 0);
  const lines = ['# Ungenutzte Dateien – E7', '', `Analysierter Commit: \`${commit}\`.`, '',
    '## Methode und Grenzen', '',
    'Aufruf: `node scripts/quality/find-unused.mjs [--out DATEI] [--live-evidence DATEI]`.', '',
    'Alle versionierten Dateien sind Graphknoten. HTML (script/link/fetch und Navigation), Code (require/import/export/fetch), CSS, Tests, package.json, YAML-Workflows einschließlich mehrzeiliger run-Blöcke und die Registries liefern Kanten. Literale, Kommentare, Verzeichnisse und Globs zählen vorsorglich als Verweis; Selbstverweise zählen nicht. Relative Pfade, Root-Pfade, Query/Hash, Indexseiten und mehrdeutige Dateinamen werden aufgelöst. Fremde URLs zählen nicht als lokale Verweise.', '',
    'Die Einzelliste umfasst alle Dateien außerhalb der geschützten Bereiche, auch Konfiguration, Dokumentation und Evidence. Daten, Assets, App, Account-Worker, Forschung und Recht bleiben geschützt. Konfiguration und Dokumentation liefern zusätzliche Verweise. Dateninhalte und Binärdateien werden nicht als Quelltext gelesen. Dies ist eine Eingangsgrad-Analyse, keine Erreichbarkeitsanalyse: unbenutzte Zyklen werden nicht erkannt. Dynamische Pfade, Shell-Variablen, HTML-base, externe Aufrufe, Bookmarks und andere Deployments sind nicht vollständig beweisbar.', '',
    `Knoten: ${files.length}; gelesene Textquellen: ${sources.size}; Dateien außerhalb Tabu: ${candidates.length} (davon ${candidates.filter(p => CODE.test(p)).length} Code/Seiten/Skripte); davon ohne eingehende Verweise: ${zero.length}; nur breite Verzeichnis-/Glob-Verweise: ${scopeOnly.length}; geschützte Knoten ohne Verweise: ${protectedZero.length} (keine Löschkandidaten).`, '',
    '**Keine automatische Löschfreigabe.** Fehlender Verweis, ein 404 oder Ausschluss vom Pages-Build allein beweist keine Nichtnutzung. Bei Zweifel bleibt die Datei.', '',
    '## Auslieferung und benannte Bereiche', '',
    '`pages-release.yml` baut mit `scripts/vu2/build-release.mjs`: `permitted()` kopiert grundsätzlich alle zugelassenen getrackten Dateien, einschließlich alter Seiten und evidence. scripts/docs/providers, Tests und bestimmte Daten werden ausgeschlossen. Der Build erzeugt `/vu2/` und `/Quant/` zusätzlich als Redirect nach `/quant/`. Ein ausgelieferter Pfad kann direkt aufgerufen werden, auch ohne internen Link.', '',
    `Größenvergleich gegen \`${comparisonCommit}\`; getrackte Dateibytes, ohne Git-Historie. Neue Analysewerkzeuge zählen zur Nachher-Größe von scripts/.`, '',
    '| Bereich | Dateien nachher | Bytes vorher | Bytes nachher | Entscheidung |', '|---|---:|---:|---:|---|'];
  const decisions = ['Redirect wird im Release erzeugt; behalten.', 'Legacy-Redirect nach /discover/; behalten.', 'Aktive Datenquellen laut domains.json, Seiten laden app-rebuild.js; behalten.', 'Eigenes Cloudflare-Deployment und Workflow-Tests; behalten.', 'CI erwähnt den Review-Pfad; Live-404 genügt nicht; behalten.', 'Audit-/Auslieferungsbelege und grundsätzlich im Pages-Build; behalten.', 'Workflow-/Test-/Registry-Aufrufe schützen; übrige Einträge unten unsicher.'];
  AREAS.forEach((area, i) => {
    const paths = files.filter(p => p.startsWith(area)), bytes = paths.reduce((n, p) => n + sizes.get(p), 0);
    const before = [...beforeSizes].filter(([p]) => p.startsWith(area)).reduce((n, [, size]) => n + size, 0);
    lines.push(`| ${area} | ${paths.length} | ${before} | ${bytes} | ${decisions[i]} |`);
  });
  if (live) {
    lines.push('', `Live-Stichprobe: ${cell(live.checkedAt)}, ${cell(live.site)}. Keine vollständige Browser-Netzwerkaufzeichnung.`, '', '| Pfad | HTTP / Fehler | Ziel / Befund |', '|---|---|---|');
    for (const r of live.checks) lines.push(`| ${cell(r.path)} | ${cell(r.status ?? r.error)} | ${cell(r.sourceCommit ? 'Release-Commit ' + r.sourceCommit : r.accessGate ? 'Research-Zugangssperre, Inhalt: ' + r.contentPath : r.url || '')}; ${cell((r.redirects || []).join(', '))} |`);
    lines.push('', 'HTTP 200 bei HTML kann die Zugangssperre statt des ursprünglichen Inhalts sein. Live-Release und Analyse-Commit können abweichen. Deshalb keine Nichtnutzung daraus ableiten.');
    if (live.pagesArtifact) lines.push('', `Pages-Artefakt: [Lauf ${live.pagesArtifact.runId}](${live.pagesArtifact.runUrl}), ID ${live.pagesArtifact.artifactId}, ${live.pagesArtifact.bytes} Bytes. ${cell(live.pagesArtifact.download)}`);
  } else lines.push('', 'Keine Live-Evidenz übergeben. Alle Kandidaten bleiben unsicher.');
  lines.push('', '## Sicher ungenutzt / entfernt', '', 'Keine Datei erfüllt derzeit einen belastbaren Nichtnutzungsnachweis. Entfernte Dateien: keine. Eingesparte Bytes: 0. Keine Registry-/Workflow-/Test-Verweise wurden entfernt oder abgeschwächt.', '', '## Unsicher – Dateien ohne eingehende Verweise', '', '| Datei | Bytes | Begründung / Entscheidung |', '|---|---:|---|');
  for (const p of zero) lines.push(`| ${cell(p)} | ${sizes.get(p)} | Keine statische eingehende Kante; ${graph.namedByWorkflow.has(p) ? 'Workflow-Schutz' : /(^|\/)tests?\//.test(p) || /\.test\./.test(p) ? 'Test-Einstieg kann über Runner/Glob laufen' : p.startsWith('scripts/') ? 'manueller/externer Aufruf nicht ausgeschlossen; scripts/ nicht in Pages' : 'direkte URL, dynamisches Laden oder eigenes Deployment nicht ausgeschlossen'}; behalten. |`);
  lines.push('', '## Unsicher – nur breite Verzeichnis-/Glob-Verweise', '', 'Ein Verzeichnisverweis oder CI-Pfadfilter beweist keinen ausgeführten Einzelaufruf. Diese Dateien haben Graphkanten, aber keinen konkreten Dateiverweis. Auch hier keine Löschfreigabe.', '', '| Datei | Bytes | Begründung / Beispiel |', '|---|---:|---|');
  for (const p of scopeOnly) lines.push(`| ${cell(p)} | ${sizes.get(p)} | Nur breite Kanten, z. B. ${cell(graph.incoming.get(p).keys().next().value)}; ${graph.namedByWorkflow.has(p) ? 'Workflow-Schutz; ' : ''}Nutzung unklar; behalten. |`);
  lines.push('', '## Workflow-Schutz in den benannten Bereichen', '', '| Datei | Beleg (Workflow) |', '|---|---|');
  for (const p of [...graph.namedByWorkflow].sort()) {
    if (!AREAS.some(a => p.startsWith(a)) || protectedReason(p)) continue;
    const refs = [...graph.incoming.get(p)].filter(([, k]) => k.startsWith('workflow')).map(([s]) => s);
    lines.push(`| ${cell(p)} | ${cell(refs.join(', '))} |`);
  }
  lines.push('', '## Dynamik und ungelesene Quellen', '', `${graph.dynamic.length} dynamische/zusammengesetzte import/require/fetch-Ausdrücke gefunden; diese verhindern einen vollständigen statischen Nichtnutzungsbeweis.`, '', '| Quelle | Ausdruck |', '|---|---|');
  for (const r of graph.dynamic) lines.push(`| ${cell(r.source)} | ${codeCell(r.expression)} |`);
  lines.push('', 'Textquellen über 4 MiB oder Symlinks werden nicht gelesen und hier offengelegt; Datenverzeichnisse und der erzeugte Bericht werden grundsätzlich nicht als Quellen gelesen.', '', ...skipped.map(p => `- ${p}`), '');
  return {markdown: lines.join('\n'), graph, zero};
}

export function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (!['--out', '--live-evidence'].includes(args[i]) || !args[i + 1]) throw Error('Usage: find-unused.mjs [--out FILE] [--live-evidence FILE]');
    options[args[i]] = args[++i];
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const files = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).split('\0').filter(Boolean).sort();
  const sources = new Map(), sizes = new Map(), skipped = [];
  for (const p of files) {
    const stat = lstatSync(resolve(root, p)); sizes.set(p, stat.size);
    if (p === REPORT || /(^|\/)data\//.test(p) || !TEXT.test(p)) continue;
    if (stat.size > 4 * 1024 * 1024 || !stat.isFile()) { skipped.push(p); continue; }
    sources.set(p, readFileSync(resolve(root, p), 'utf8'));
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  const live = options['--live-evidence'] ? JSON.parse(readFileSync(resolve(options['--live-evidence']), 'utf8')) : null;
  const comparisonCommit = live?.analysisBase || commit;
  if (!/^[a-f0-9]{40}$/.test(comparisonCommit)) throw Error('INVALID_COMPARISON_COMMIT');
  const beforeSizes = new Map(execFileSync('git', ['ls-tree', '-r', '-l', '-z', comparisonCommit], {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).split('\0').filter(Boolean).map(row => {
    const tab = row.indexOf('\t'); return [row.slice(tab + 1), Number(row.slice(0, tab).trim().split(/\s+/).at(-1)) || 0];
  }));
  const result = renderReport({files, sources, sizes, commit, skipped, live, beforeSizes, comparisonCommit});
  const out = resolve(root, options['--out'] || REPORT);
  mkdirSync(dirname(out), {recursive: true}); writeFileSync(out, result.markdown);
  console.log(`${files.length} nodes; ${result.zero.length} uncertain files; report: ${out}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
