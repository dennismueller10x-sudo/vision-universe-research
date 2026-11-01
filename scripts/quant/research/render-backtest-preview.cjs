#!/usr/bin/env node
'use strict';
// Internal review renderer for the backtest preview (no product UI, no endpoint, no workflow).
//   node scripts/quant/research/render-backtest-preview.cjs --out <file.md|file.html> [--enable] [--internal-preview]
//        [--preview docs/quant/backtest-preview/backtest-preview.json] [--certification quant/data/product/backtest-certification-v1.json]
//        [--kind <KIND>]
// Without --enable the preview service answers DISABLED (default) and the file says so.
// --enable alone: status, certification, limits, no numbers (mode STATUS_ONLY).
// --enable --internal-preview: additionally the numbers of the committed envelopes (mode INTERNAL_NUMBERS), labelled RESEARCH.
// --out must lie OUTSIDE the repository (OUT_INSIDE_REPOSITORY): a rendering is a review copy, never a committed artifact.
const fs = require('node:fs');
const path = require('node:path');
const Preview = require('../../../quant/api/backtest-preview-service.cjs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULTS = { preview: 'docs/quant/backtest-preview/backtest-preview.json', certification: 'quant/data/product/backtest-certification-v1.json' };

function parse(argv) {
  const o = { enable: false, internalPreview: false }, flags = { '--preview': 'preview', '--certification': 'certification', '--out': 'out', '--kind': 'kind' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--enable') { o.enable = true; continue; }
    if (argv[i] === '--internal-preview') { o.internalPreview = true; continue; }
    const k = flags[argv[i]];
    if (!k || !argv[i + 1] || o[k] !== undefined) throw Error('INVALID_ARGUMENTS:' + argv[i]);
    o[k] = argv[++i];
  }
  if (!o.out) throw Error('OUT_REQUIRED');
  if (!/\.(md|html)$/.test(o.out)) throw Error('OUT_MUST_END_IN_MD_OR_HTML');
  const rel = path.relative(ROOT, path.resolve(o.out));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw Error('OUT_INSIDE_REPOSITORY:' + rel);
  return { preview: o.preview || DEFAULTS.preview, certification: o.certification || DEFAULTS.certification, out: o.out, kind: o.kind, enable: o.enable, internalPreview: o.internalPreview };
}

const pct = x => typeof x === 'number' && Number.isFinite(x) ? (x < 0 ? '−' : x > 0 ? '+' : '') + (Math.abs(x) * 100).toFixed(1).replace('.', ',') + ' %' : '–';
const share = x => typeof x === 'number' && Number.isFinite(x) ? (x * 100).toFixed(1).replace('.', ',') + ' %' : '–';
const num = x => typeof x === 'number' && Number.isFinite(x) ? String(Math.round(x * 1000) / 1000).replace('.', ',') : '–';
const int = x => typeof x === 'number' && Number.isFinite(x) ? x.toLocaleString('de-DE') : '–';

/* Eine Tabelle als Modell (Kopf + Zeilen), daraus Markdown oder HTML. */
function caseRows(kind, numbers) {
  const head = numbers
    ? ['Fall', 'Zustand', 'Zeitraum', 'Ereignisse beob./ges. (zens.)', 'Trefferquote', 'Median netto', 'Ø Überschuss ggü. Benchmark', 'Gesamt / CAGR / MDD', 'Benchmark (Art, gesamt)', 'Intervall 95 %']
    : ['Fall', 'Zustand', 'Zeitraum', 'Zertifizierung', 'fehlende Eingaben'];
  const rows = kind.cases.map(c => {
    const period = c.period && c.period.from ? c.period.from + ' – ' + c.period.to : '–';
    if (!numbers) return [c.id, c.stateCode + ' ' + c.state, period, c.certificationStatus, c.missingInputs.length ? c.missingInputs.join('; ') : '–'];
    const m = c.metrics || {}, e = c.events || {}, pe = m.perEvent || {}, b = m.benchmark || {}, u = c.uncertainty || {};
    const ev = m.basis === 'NONE' ? '–' : m.basis === 'PORTFOLIO' ? int(m.trades) + ' Trades' : int(e.completed) + '/' + int(e.occurrences) + ' (' + int(e.censored) + ')';
    const pathCol = m.basis === 'PORTFOLIO' ? pct(m.totalReturn) + ' / ' + pct(m.cagr) + ' / ' + pct(m.maxDrawdown) : m.basis === 'PER_EVENT' ? 'Median-Ereignis-DD ' + pct(m.maxDrawdown) : '–';
    const excess = m.excess && typeof m.excess.meanExcess === 'number' ? pct(m.excess.meanExcess) : m.excess && typeof m.excess.totalReturn === 'number' ? pct(m.excess.totalReturn) + ' (gesamt)' : '–';
    const interval = Array.isArray(u.interval) && u.interval.length === 2 ? '[' + pct(u.interval[0]) + '; ' + pct(u.interval[1]) + '] ' + (u.method || '') : '–';
    return [c.id, c.stateCode + ' ' + c.state, period, ev, share(m.hitRate), pct(pe.median), excess, pathCol, b.id ? b.id + (typeof b.totalReturn === 'number' ? ' ' + pct(b.totalReturn) : '') : '–', interval];
  });
  return { head, rows };
}

function model(view) {
  if (view.state !== 'AVAILABLE') return { title: 'Backtest-Vorschau (intern)', status: view.state + ' · ' + view.reason + (view.errors ? ' · ' + view.errors.join(', ') : ''), sections: [] };
  const numbers = view.mode === 'INTERNAL_NUMBERS';
  return {
    title: 'Backtest-Vorschau (intern)',
    status: 'Modus ' + view.mode + ' · Label ' + view.label + ' · ' + view.trust + ' · ' + view.claim + ' · productionApproved=false · publiclyActivated=false · Zertifizierungsartefakt ' +
      view.certificationArtifact.source + ' (Status-Hash ' + view.certificationArtifact.statusSha256.slice(0, 12) + ', zertifizierte Arten: ' + (view.certificationArtifact.certifiedKinds.join(', ') || 'keine') + ')',
    notes: view.notes,
    sections: view.kinds.map(k => ({
      heading: k.kind + ' – ' + k.label,
      facts: [
        ['Zustand der Art', k.stateLabel + ' (A ' + k.states.A + ' · B ' + k.states.B + ' · C ' + k.states.C + ')'],
        ['Zertifizierung', k.certification ? k.certification.status + ' / ' + k.certification.readiness + (k.certification.blockers.length ? ' · Blocker: ' + k.certification.blockers.join(', ') : '') : '–'],
        ['Datenqualitätsgrenzen', k.dataQualityLimits.join(', ') || '–'],
        ['Grenzen', k.limitations.join(', ')]
      ],
      table: caseRows(k, numbers),
      methods: numbers ? k.cases.map(c => [c.id, (c.methods || []).map(x => x.method + ' ' + x.state).join(', ')]) : []
    }))
  };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mdCell = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
function toMarkdown(m) {
  const out = ['# ' + m.title, '', '> ' + m.status, ''];
  for (const n of m.notes || []) out.push('- ' + n);
  for (const s of m.sections) {
    out.push('', '## ' + s.heading, '');
    for (const [k, v] of s.facts) out.push('- **' + k + ':** ' + mdCell(v));
    out.push('', '| ' + s.table.head.map(mdCell).join(' | ') + ' |', '|' + s.table.head.map(() => '---').join('|') + '|');
    for (const r of s.table.rows) out.push('| ' + r.map(mdCell).join(' | ') + ' |');
    if (s.methods.length) { out.push('', 'Methoden:'); for (const [id, v] of s.methods) out.push('- ' + id + ': ' + v); }
  }
  return out.join('\n') + '\n';
}
function toHtml(m) {
  const css = ':root{--bg:#fff;--fg:#1b1f24;--muted:#5b6470;--line:#d9dee4;--warn:#7a4b00}@media (prefers-color-scheme:dark){:root{--bg:#14171a;--fg:#e6e9ed;--muted:#9aa3ad;--line:#2c3238;--warn:#e0b25a}}' +
    'body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1200px;padding:16px}table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-variant-numeric:tabular-nums}' +
    'th,td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}.status{color:var(--warn);border:1px solid var(--line);padding:8px}.wrap{overflow-x:auto}li{margin:2px 0}';
  const p = ['<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Backtest-Vorschau intern</title><style>' + css + '</style></head><body>',
    '<h1>' + esc(m.title) + '</h1><p class="status">' + esc(m.status) + '</p>'];
  if (m.notes) p.push('<ul>' + m.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>');
  for (const s of m.sections) {
    p.push('<h2>' + esc(s.heading) + '</h2><ul>' + s.facts.map(([k, v]) => '<li><strong>' + esc(k) + ':</strong> ' + esc(v) + '</li>').join('') + '</ul>');
    p.push('<div class="wrap"><table><thead><tr>' + s.table.head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      s.table.rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
    if (s.methods.length) p.push('<p>Methoden:</p><ul>' + s.methods.map(([id, v]) => '<li>' + esc(id) + ': ' + esc(v) + '</li>').join('') + '</ul>');
  }
  p.push('</body></html>');
  return p.join('\n') + '\n';
}

function render(o) {
  const doc = JSON.parse(fs.readFileSync(path.resolve(ROOT, o.preview), 'utf8'));
  const certification = JSON.parse(fs.readFileSync(path.resolve(ROOT, o.certification), 'utf8'));
  const view = Preview.getBacktestPreview(doc, { backtestPreview: o.enable ? { enabled: true, audience: Preview.AUDIENCE } : Preview.DEFAULT_CONFIG,
    internalPreview: o.internalPreview, certification, kind: o.kind });
  const m = model(view);
  return { view, text: o.out.endsWith('.html') ? toHtml(m) : toMarkdown(m) };
}

function main(argv = process.argv.slice(2)) {
  const o = parse(argv);
  const { view, text } = render(o);
  fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
  fs.writeFileSync(o.out, text);
  console.log(JSON.stringify({ out: o.out, state: view.state, mode: view.mode || null, reason: view.reason || null, productionApproved: false }));
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { main, parse, render, model, toMarkdown, toHtml };
