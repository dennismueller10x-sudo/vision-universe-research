// Supertrader „Das Rezept eines Profis“ (docs/design/supertrader-2026-11/HANDOVER.md, Entscheidungen 4 und 5, Folie SX08):
// Wortwahl nach docs/legal/WORTWAHL.md und assets/legal-notices.json (wording[].avoid) und keine roten Farben.
//
// Geprüft werden die Texte, die Supertrader selbst schreibt: Zeichenketten in den Skripten unter supertrader/assets
// (ohne Kommentare und ohne reine Code-Zeichenketten wie Dateinamen oder Zustandscodes), die Seitenhüllen, die
// scripts/supertrader/build.mjs erzeugt (Titel und Beschreibung), und die Stylesheets (Farben).
// Regeltexte, Quellen und Methodik-Zitate aus den Daten (registry.json, sources.json) sind Zitate der Methode und
// gehören nicht dazu. Eine verneinte Fundstelle („keine Kauf- oder Verkaufsempfehlung“) ist zulässig.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Skripte der Oberfläche (supertrader/assets/*.js). */
export const UI_SCRIPTS = Object.freeze(fs.readdirSync(path.join(ROOT, 'supertrader/assets')).filter((f) => f.endsWith('.js')).sort().map((f) => 'supertrader/assets/' + f));

/** Folie SX08 „Wortwahl“ und WORTWAHL.md: was in der Oberfläche nicht mehr steht. */
export const AVOID = Object.freeze([
  [/\bsignal\w*|\w+signal\w*/i, 'Signal → Treffer / Regel-Ergebnis'],
  [/\bstopp?s?\b|\bstop-|-stop\b|stop-loss/i, 'Stop → Ungültig-Marke laut Methode'],
  [/luft bis zum/i, 'Luft bis zum Stop → Abstand zur Ungültig-Marke'],
  [/einstieg\w*|eingestiegen|steigt ein\b|einsteig\w*/i, 'Einstieg → Zone laut Methode / Musterdepot nimmt auf'],
  [/ausstieg\w*|steigt aus\b|ausgestiegen/i, 'Ausstieg → Musterdepot gibt ab'],
  [/risiko (?:je|pro|bis)\b/i, 'Risiko je Kauf → Anteil je Aufnahme im Musterdepot'],
  [/schlägt den markt|den markt schlägt|überrendite/i, '„schlägt den Markt“ → wie die Regel im Vergleich zum S&P 500 läuft'],
  [/kaufzone|kursziel|zielkurs|kurspotenzial|interessant ab/i, 'WORTWAHL.md: Zone laut Methode'],
  [/\btrigger\w*/i, 'Trigger → Zone laut Methode'],
  [/kurz vor der marke|modell ist dabei/i, 'Folie K1: Plan fertig / Im Musterdepot'],
  [/\b(?:kauft|verkauft|kaufen|verkaufen|gekauft|verkaufte?)\b/i, 'kaufen/verkaufen → nimmt auf / gibt ab'],
  [/empfehl\w*|empfohlen/i, 'Empfehlung → Ergebnis der Methode'],
]);
const NEGATION = /\b(?:kein\w*|nicht|nie|ohne)\b[^.!?;:\n]{0,40}$/i;

/** Zeichenketten eines Skripts ohne Kommentare. Ein Kommentar beginnt nur außerhalb einer Zeichenkette. */
export function stringLiterals(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '/' && /[=(,:!&|?{};\[]\s*$/.test(src.slice(Math.max(0, i - 20), i))) {
      /* Regulärer Ausdruck: bis zum schließenden / überspringen */
      let j = i + 1, cls = false;
      while (j < src.length && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
      i = j + 1; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; } s += src[j]; j++; }
      out.push(s); i = j + 1; continue;
    }
    i++;
  }
  return out;
}

/** Nur Text für Menschen: mindestens ein Wort mit Kleinbuchstaben und ein Leerzeichen oder ein großgeschriebenes Wort. */
function isProse(s) {
  if (!/[a-zäöüß]/.test(s)) return false;
  if (/^[\w./?=&#:%-]*$/.test(s) && !/^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(s)) return false;  // Pfad, Schlüssel, Code
  if (/^[a-z][\w-]*$/.test(s) || /^var\(--[\w-]+\)$/.test(s)) return false;
  if (/^[a-z0-9-]+(?: [a-z0-9-]+){0,3}$/.test(s) && s.split(' ').some((w) => w.includes('-') || w.length <= 2)) return false;  // CSS-Klassen wie 'm stop'
  if (/^(?:\.|#|\[)[\w-]/.test(s) || /^(?:<\/?[a-z]|[a-z-]+=)/.test(s.trim()) && !/>[^<]*[a-zäöüß]{3}/.test(s)) return false;
  return true;
}

export function findings(text) {
  const out = [];
  const plain = text.replace(/<[^>]*>/g, ' ');
  for (const [re, why] of AVOID) {
    for (const m of plain.matchAll(new RegExp(re.source, 'gi'))) {
      if (NEGATION.test(plain.slice(Math.max(0, m.index - 45), m.index))) continue;
      out.push(`${m[0]} (${why}) «${plain.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ')}»`);
    }
  }
  return out;
}

test('SX08: Skripte der Oberfläche schreiben keine Signal-, Stop-, Einstiegs- oder Marktschlägt-Wörter', () => {
  const bad = [];
  for (const f of UI_SCRIPTS) {
    for (const s of stringLiterals(read(f))) {
      if (!isProse(s)) continue;
      for (const x of findings(s)) bad.push(f + ': ' + x);
    }
  }
  assert.deepEqual(bad, []);
});

test('SX08: erzeugte Seitenhüllen (build.mjs) tragen die neue Wortwahl in Titel und Beschreibung', () => {
  const src = read('scripts/supertrader/build.mjs');
  const shells = [];
  for (const m of src.matchAll(/\[\s*'[^']+\.html',\s*'[a-z]+',\s*'([^']+)',\s*'([^']+)'/g)) shells.push(m[1] + ' · ' + m[2]);
  for (const m of src.matchAll(/title: `([^`]+)`, description: `([^`]+)`/g)) shells.push(m[1] + ' · ' + m[2]);
  assert.ok(shells.length >= 10, 'Seitenhüllen gefunden: ' + shells.length);
  const bad = shells.flatMap((t) => findings(t).map((x) => t + ': ' + x));
  assert.deepEqual(bad, []);
  const html = renderPage({ title: 'T', description: 'D', page: 'home', depth: 1 });
  assert.deepEqual(findings(html.replace(/<script[\s\S]*?<\/script>/g, '')), []);
});

test('SX08: die gebauten Seitenhüllen unter supertrader/ stimmen mit dem Erzeuger überein', () => {
  for (const f of ['index.html', 'strategies/index.html', 'hausstrategie/index.html', 'sources/index.html']) {
    const html = read('supertrader/' + f);
    const t = (html.match(/<title>([^<]*)<\/title>/) || [])[1] + ' · ' + (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    assert.deepEqual(findings(t), [], f);
  }
});

/** Rot: Farbton bis 12° oder ab 345°, kräftig gesättigt und weder fast schwarz noch fast weiß. */
export function isRed(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return false;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return (hue <= 12 || hue >= 345) && sat >= 0.45 && l >= 0.2 && l <= 0.8;
}

test('Entscheidung 5: kein Rot in den Supertrader-Stylesheets und Skripten (Minus ist schwarz)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'supertrader/assets')).filter((f) => /\.(css|js)$/.test(f)).map((f) => 'supertrader/assets/' + f);
  const bad = [];
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b/gi)) if (isRed(m[0])) bad.push(f + ': ' + m[0]);
    for (const m of src.matchAll(/\b(?:color|background|fill|stroke):\s*(?:red|crimson|firebrick|tomato)\b/gi)) bad.push(f + ': ' + m[0]);
  }
  assert.deepEqual(bad, []);
  assert.ok(isRed('#d6303c') && isRed('#dc2626') && isRed('#c81e1e') && !isRed('#c8f531') && !isRed('#000') && !isRed('#a1a1aa'));
});

test('Selbsttest: Zeichenketten-Leser und Fundstellen', () => {
  assert.deepEqual(stringLiterals("var a = 'Stop 1'; // 'Signal'\n/* 'x' */ var b = \"y z\"; var r = /a'b/g;"), ['Stop 1', 'y z']);
  assert.equal(findings('Luft bis zum Stop').length, 2);
  assert.equal(findings('keine Kauf- oder Verkaufsempfehlung').length, 0);
  assert.equal(findings('Abstand zur Ungültig-Marke · Zone laut Methode · Musterdepot nimmt auf').length, 0);
  assert.ok(findings('Signale ansehen').length);
  assert.ok(isProse('Modell steigt ein'));
  assert.ok(!isProse('signals.json'));
  assert.ok(!isProse('st-r-sig'));
});
