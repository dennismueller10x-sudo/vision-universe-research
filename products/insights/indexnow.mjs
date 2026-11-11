// Insights: neue und geänderte Adressen per IndexNow melden (Bing, Yandex, Seznam, Naver u. a.; die KI-Suchen von
// Microsoft Copilot und ChatGPT stützen sich auf den Bing-Index).
//
//   node products/insights/indexnow.mjs vergleichen --neu <site>/insights/sitemap.xml --out <datei>
//   node products/insights/indexnow.mjs melden --liste <datei> [--trocken]
//
// Ablauf in pages-release.yml: Der Paket-Job holt VOR dem Ausrollen die noch ausgelieferte Sitemap und die Schlüsseldatei
// und vergleicht sie mit der frisch gebauten Sitemap (`vergleichen`). Neu sind Adressen, die es vorher nicht gab oder
// deren lastmod sich geändert hat. Ist die Schlüsseldatei noch nicht ausgeliefert (erstes Ausrollen mit IndexNow), gelten
// alle Adressen der Sitemap als neu. Nach dem Ausrollen prüft `melden`, dass der Schlüssel live liegt, und meldet die
// Liste an api.indexnow.org. Ein Fehler bei IndexNow lässt das Ausrollen nie scheitern (nur Warnung).
//
// Der Schlüssel ist öffentlich (so verlangt es IndexNow) und liegt als <schlüssel>.txt im Wurzelverzeichnis der Seite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BASIS = 'https://research.visionuniverse.de';
export const HOST = new URL(BASIS).host;
export const ENDPUNKT = 'https://api.indexnow.org/indexnow';
const MAX_ADRESSEN = 10000; // Obergrenze je Meldung laut IndexNow

// Genau eine Schlüsseldatei im Wurzelverzeichnis: <32 Hex>.txt mit dem Schlüssel als Inhalt.
export function schluessel(dir = root) {
  const treffer = fs.readdirSync(dir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (treffer.length !== 1) throw new Error(`IndexNow: genau eine Schlüsseldatei im Wurzelverzeichnis erwartet, gefunden: ${treffer.length}`);
  const key = treffer[0].slice(0, -4);
  if (fs.readFileSync(path.join(dir, treffer[0]), 'utf8').trim() !== key) throw new Error('IndexNow: Inhalt der Schlüsseldatei passt nicht zum Namen');
  return key;
}

// Sitemap lesen: Map Adresse -> lastmod ('' ohne lastmod).
export function sitemapEintraege(xml) {
  const m = new Map();
  for (const [, block] of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    if (loc) m.set(loc, block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1] || '');
  }
  return m;
}

// Neue oder geänderte Adressen. vorher === null: noch nichts gemeldet, also alle.
export function geaendert(neuXml, vorherXml) {
  const neu = sitemapEintraege(neuXml);
  const alt = vorherXml == null ? null : sitemapEintraege(vorherXml);
  return [...neu].filter(([u, d]) => !alt || !alt.has(u) || alt.get(u) !== d).map(([u]) => u)
    .filter((u) => u.startsWith(BASIS + '/'));
}

export function nutzlast(key, urls) {
  return { host: HOST, key, keyLocation: `${BASIS}/${key}.txt`, urlList: urls.slice(0, MAX_ADRESSEN) };
}

async function holen(url) {
  const r = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
  return { status: r.status, text: r.ok ? await r.text() : '' };
}

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const warn = (t) => console.log(`::warning::IndexNow: ${t}`);

async function vergleichen() {
  const neuPfad = arg('--neu'), out = arg('--out');
  if (!neuPfad || !out) throw new Error('vergleichen braucht --neu und --out');
  const key = schluessel();
  const neuXml = fs.readFileSync(neuPfad, 'utf8');
  let liste = [], grund;
  try {
    const k = await holen(`${BASIS}/${key}.txt`);
    if (k.status === 404 || (k.status === 200 && k.text.trim() !== key)) {
      liste = geaendert(neuXml, null); grund = 'Schlüssel noch nicht ausgeliefert: erste Meldung aller Adressen';
    } else if (k.status !== 200) {
      grund = `Schlüsseldatei antwortet ${k.status}: diesmal keine Meldung`;
    } else {
      const s = await holen(`${BASIS}/insights/sitemap.xml`);
      if (s.status === 200) { liste = geaendert(neuXml, s.text); grund = 'Vergleich mit der ausgelieferten Sitemap'; }
      else if (s.status === 404) { liste = geaendert(neuXml, null); grund = 'keine ausgelieferte Sitemap: alle Adressen'; }
      else grund = `ausgelieferte Sitemap antwortet ${s.status}: diesmal keine Meldung`;
    }
  } catch (e) { grund = `Seite nicht erreichbar (${e.message}): diesmal keine Meldung`; }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ schema: 'vu-indexnow-1', grund, urls: liste }, null, 1) + '\n');
  console.log(`IndexNow: ${liste.length} Adresse(n) zu melden (${grund})`);
  for (const u of liste) console.log('  ' + u);
}

async function melden() {
  const listePfad = arg('--liste');
  if (!listePfad) throw new Error('melden braucht --liste');
  const { urls = [] } = JSON.parse(fs.readFileSync(listePfad, 'utf8'));
  if (!urls.length) { console.log('IndexNow: nichts zu melden'); return; }
  const key = schluessel();
  const body = nutzlast(key, urls);
  if (process.argv.includes('--trocken')) { console.log(JSON.stringify(body, null, 1)); return; }
  // Nach dem Ausrollen braucht die Auslieferung ein paar Sekunden; IndexNow prüft den Schlüssel live.
  let live = false;
  for (let i = 0; i < 6 && !live; i++) {
    try { const k = await holen(`${BASIS}/${key}.txt?v=${Date.now()}`); live = k.status === 200 && k.text.trim() === key; } catch { /* nochmal */ }
    if (!live) await new Promise((r) => setTimeout(r, 10000));
  }
  if (!live) { warn('Schlüsseldatei nach dem Ausrollen nicht erreichbar, keine Meldung'); return; }
  let r;
  try {
    r = await fetch(ENDPUNKT, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  } catch (e) { warn(`Meldung gescheitert (${e.message})`); return; }
  const text = (await r.text()).slice(0, 300);
  // 200: angenommen, 202: angenommen, Schlüsselprüfung läuft noch.
  if (r.status === 200 || r.status === 202) console.log(`IndexNow: ${body.urlList.length} Adresse(n) gemeldet (HTTP ${r.status})`);
  else warn(`HTTP ${r.status} ${text}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const befehl = process.argv[2];
  const lauf = befehl === 'vergleichen' ? vergleichen : befehl === 'melden' ? melden : null;
  if (!lauf) { console.error('Aufruf: indexnow.mjs vergleichen|melden …'); process.exit(2); }
  // Kein Abbruch des Ausrollens wegen IndexNow: Fehler werden Warnungen.
  lauf().catch((e) => { warn(e.message); });
}
