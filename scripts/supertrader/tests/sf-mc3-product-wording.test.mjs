// Supertrader Master Completion 3.0 – keine Erfolgsversprechen in Produkttexten und veröffentlichten Kandidaten.
//
// Bisher prüften nur supertrader.js plus Registry (artifacts.test.mjs, „Kein Kaufaufforderungs-Ton“) und der SF8-Katalog
// mit seinen Ansichten (sf-sf8-candidates.test.mjs, SF8-WORDING). Nicht erfasst waren die übrigen Skripte unter
// supertrader/assets (Kandidatenansicht sf-research.js, st-chart.js), alle HTML-Seiten unter supertrader/** und die
// veröffentlichten Kandidatendateien supertrader/data/sf-candidates/** (Stufentexte, Regeltexte, Begründungen).
//
// Wertpapiernamen Dritter (z. B. ein ETF „… Buy Now Pay Later“) sind keine Aussage des Produkts: Namen aus der
// kanonischen Namensschicht (quant/data/market/security-master/company-names.json), die selbst ein Muster treffen,
// werden vor der Prüfung ausgeblendet. So bleibt der Test vom wachsenden Datenstand unabhängig.
//
// Gelesen wird nur; nichts wird geschrieben. Eine verneinte Fundstelle („keine Kaufempfehlung“, „not guaranteed“) ist
// zulässig. Ausgenommen ist supertrader/data/sources.json: Literaturverzeichnis mit wörtlich zitierten Titeln und
// Haftungshinweisen Dritter, kein Produkttext.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const ST = path.join(ROOT, 'supertrader');

/** Versprechen von Erfolg, Gewinn oder Sicherheit sowie Kaufaufforderungen (deutsch und englisch). */
export const PROMISE_PATTERNS = Object.freeze([
  /garantiert\w*|garantie\w*|gewinngarantie|erfolgsgarantie/i,
  /risikolos\w*|risikofrei\w*|ohne\s+risiko/i,
  /sicher(?:e|er|en|es)?\s+(?:gewinn|rendite|profit|ertrag)\w*/i,
  /reich\s+werden|nie\s+(?:mehr\s+)?verlier\w*|kein(?:e|en)?\s+verlust\s+möglich/i,
  /jetzt\s+kaufen|kaufen\s+sie|kaufempfehlung\w*|kaufsignal\w*/i,
  /\bbuy\s+now\b|\bstrong\s+buy\b|guarantee\w*|risk[- ]free|\bsure\s+(?:profit|win|thing)\b|can'?t\s+lose/i,
  /überrendite\w*|schlägt\s+den\s+markt|beat(?:s|ing)?\s+the\s+market/i,
]);
/** Wörtlich zitierte Buchtitel (Quellenangaben), keine Aussage des Produkts. Jeder Eintrag muss im Umfang vorkommen. */
export const QUOTED_TITLES = Object.freeze(['The Little Book That Beats the Market']);
const NEGATION = /\b(?:kein\w*|nicht|nie|niemals|no|not|never)\b[^.!?;:\n]{0,30}$/i;

/** Alle Fundstellen eines Textes, die nicht verneint sind. */
export function promiseFindings(raw, { names = [] } = {}) {
  const out = [];
  let text = raw;
  for (const t of QUOTED_TITLES) text = text.split(t).join('«Buchtitel»');
  for (const n of names) text = text.split(n).join('«Name»');
  for (const re of PROMISE_PATTERNS) {
    const g = new RegExp(re.source, 'gi');
    for (const m of text.matchAll(g)) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      if (NEGATION.test(before)) continue;
      out.push(`${m[0]} … «${text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ')}»`);
    }
  }
  return out;
}

/** Wertpapiernamen der Namensschicht, die selbst ein Muster treffen (nur diese werden ausgeblendet). */
function thirdPartyNames() {
  const p = path.join(ROOT, 'quant/data/market/security-master/company-names.json');
  if (!fs.existsSync(p)) return [];
  const rows = JSON.parse(fs.readFileSync(p, 'utf8')).rows ?? [];
  const all = new Set(rows.flatMap((r) => [r.companyName, r.displayName]).filter((n) => typeof n === 'string' && n.length >= 4));
  return [...all].filter((n) => PROMISE_PATTERNS.some((re) => re.test(n))).sort((a, b) => b.length - a.length);
}

/** Produkttexte: Skripte, HTML-Seiten, veröffentlichte Kandidaten und Registry. */
function productFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      if (rel === 'supertrader/data/sources.json') continue;
      if (/\.(html|js)$/.test(e.name) && !rel.startsWith('supertrader/data/')) out.push(rel);
      else if (rel.startsWith('supertrader/data/sf-candidates/') && e.name.endsWith('.json')) out.push(rel);
    }
  };
  walk(ST);
  for (const f of ['supertrader/data/registry.json', 'supertrader/data/registry-core.json']) if (fs.existsSync(path.join(ROOT, f))) out.push(f);
  return out.sort();
}

test('MC3-WORDING-SCOPE: geprüft werden Skripte, alle Seiten, die Kandidatendateien und die Registry', () => {
  const files = productFiles();
  for (const f of ['supertrader/assets/sf-research.js', 'supertrader/assets/st-chart.js', 'supertrader/assets/supertrader.js', 'supertrader/index.html', 'supertrader/data/sf-candidates/summary.json', 'supertrader/data/sf-candidates/index.json', 'supertrader/data/registry.json']) assert.ok(files.includes(f), f);
  assert.ok(files.filter((f) => f.startsWith('supertrader/data/sf-candidates/strategy/')).length === 13, 'je Methode eine Kandidatendatei');
  assert.ok(files.filter((f) => f.endsWith('.html')).length > 100, 'HTML-Seiten fehlen im Umfang');
});

test('MC3-WORDING-NO-PROMISE: keine Erfolgs-, Gewinn- oder Sicherheitsversprechen und keine Kaufaufforderung in Produkttexten', () => {
  const findings = [], titlesSeen = new Set(), names = thirdPartyNames();
  for (const f of productFiles()) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const t of QUOTED_TITLES) if (text.includes(t)) titlesSeen.add(t);
    for (const x of promiseFindings(text, { names })) findings.push(`${f}: ${x}`);
  }
  // eine Ausnahme ohne Fundstelle ist überflüssig und wird entfernt, statt still mitzulaufen
  assert.deepEqual([...titlesSeen].sort(), [...QUOTED_TITLES].sort(), 'ungenutzte Titel-Ausnahme');
  assert.deepEqual(findings.slice(0, 20), [], `${findings.length} Fundstellen`);
});

test('MC3-WORDING-STATUS: veröffentlichter Stand nennt den Forschungsstatus und keine Stufe 4', () => {
  const s = JSON.parse(fs.readFileSync(path.join(ST, 'data/sf-candidates/summary.json'), 'utf8'));
  assert.deepEqual(s.status, { liveReadiness: 'LIVE_NOT_APPROVED', certification: 'DIAGNOSTIC_NOT_CERTIFIED', validatedTradeSignal: 'LOCKED_FOR_ALL_13', orders: 'NONE' });
  assert.equal(s.counts.validatedTradeSignal, 0);
  assert.equal(s.strategies.length, 13);
  for (const x of s.strategies) assert.equal(x.liveReadiness, 'LIVE_NOT_APPROVED', x.candidateId);
  // die Stufentexte sagen ausdrücklich, dass es keine Order und keine Empfehlung ist
  assert.match(s.stageLabels.MODELED_TRADE_PLAN.short, /keine order/i);
});

test('MC3-WORDING-PROBES: Gegenproben – Versprechen werden erkannt, Verneinungen nicht', () => {
  for (const t of ['Garantierte Rendite mit dieser Methode', 'risikolos handeln', 'Sichere Gewinne jede Woche', 'Jetzt kaufen!', 'Kaufempfehlung für AAPL', 'This setup is risk-free', 'guaranteed returns', 'Die Methode schlägt den Markt', 'This book beats the market', 'nie wieder verlieren'.replace('wieder ', '')]) {
    assert.ok(promiseFindings(t).length > 0, t);
  }
  assert.deepEqual(promiseFindings('Corgi Buy Now Pay Later ETF', { names: ['Corgi Buy Now Pay Later'] }), []);
  assert.ok(promiseFindings('Buy now: Corgi', { names: ['Corgi Buy Now Pay Later'] }).length > 0);
  for (const t of ['Ein bestätigter Ausbruch ist keine Kaufempfehlung.', 'Keine Order, keine Empfehlung.', 'Das Ergebnis ist nicht garantiert.', 'past results are not a guarantee', 'Die Aktie hat sich mindestens verdoppelt.']) {
    assert.deepEqual(promiseFindings(t), [], t);
  }
});
