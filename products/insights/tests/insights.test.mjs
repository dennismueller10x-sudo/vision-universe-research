// Insights (/insights/, /insights/reports/): Seiten sind aktuell gebaut, jeder Artikel ist belegt, eingefroren und hält die Wortwahl ein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build, loadArtikel, loadReports } from '../build.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const artikel = loadArtikel();

test('IN-1 · gebaute Seiten sind aktuell (node products/insights/build.mjs)', () => {
  for (const [rel, text] of Object.entries(build())) assert.equal(fs.existsSync(rel) ? read(rel) : null, text, `${rel} veraltet`);
});

test('IN-2 · jeder Artikel hat Pflichtfelder, Bild, Quellen mit Adresse und eingefrorene Daten je Ticker', () => {
  const slugs = new Set();
  for (const a of artikel) {
    for (const k of ['slug', 'datum', 'stand', 'rubrik', 'titel', 'unterzeile', 'teaser', 'ticker', 'bild', 'abschnitte', 'quellen']) assert.ok(a[k], `${a.slug}: ${k} fehlt`);
    assert.match(a.slug, /^[a-z0-9-]+$/); assert.ok(!slugs.has(a.slug), `${a.slug} doppelt`); slugs.add(a.slug);
    assert.match(a.datum, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(fs.existsSync('.' + a.bild.src), `${a.slug}: Bild ${a.bild.src} fehlt`);
    assert.ok(a.bild.alt.length > 10);
    assert.ok(a.quellen.length >= 2, `${a.slug}: weniger als zwei Quellen`);
    for (const q of a.quellen) assert.match(q.url, /^https:\/\//, `${a.slug}: Quelle ohne Adresse`);
    assert.ok(a.daten?.commit, `${a.slug}: Daten nicht eingefroren (products/insights/snapshot.mjs)`);
    for (const t of a.ticker) assert.ok(a.daten.aktien[t]?.serie?.length > 20, `${a.slug}: Daten zu ${t} fehlen`);
    for (const s of a.abschnitte) if (s.daten) assert.ok(a.ticker.includes(s.daten), `${a.slug}: Datenkasten für unbekannten Ticker`);
    assert.ok(a.teaser.length <= 200, `${a.slug}: Teaser zu lang für die Beschreibung`);
  }
});

test('IN-3 · Wortwahl (docs/legal/WORTWAHL.md): keine Empfehlungs- oder Versprechensbegriffe', () => {
  const verboten = /\b(Kaufempfehlung|Kaufsignal|Verkaufssignal|wir empfehlen|empfohlen|Kurspotenzial|Kaufzone|Einstiegschance|Kaufgelegenheit|Top-Pick|Geheimtipp|unterbewertet|Schnäppchen|garantiert|risikolos|todsicher|jetzt kaufen|jetzt einsteigen)\b/i;
  for (const a of artikel) {
    const text = [a.titel, a.unterzeile, a.teaser, a.zitat?.text, ...a.abschnitte.map((s) => s.html)].join(' ');
    assert.doesNotMatch(text, verboten, a.slug);
    assert.doesNotMatch(text, /Kursziel/i, `${a.slug}: Kursziele nur als Angabe Dritter mit Quelle – im Artikel bewusst nicht verwendet`);
  }
});

test('IN-4 · Artikelseite: Kanonische Adresse, NewsArticle-JSON-LD, KI-Bild-Hinweis, Pflichthinweis, Quellenliste', () => {
  for (const a of artikel) {
    const html = read(`insights/${a.slug}/index.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://research.visionuniverse.de/insights/${a.slug}/">`));
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.equal(ld['@type'], 'NewsArticle'); assert.equal(ld.datePublished.slice(0, 10), a.datum);
    if (a.bild.ki) assert.match(html, /<figcaption>KI-Bild<\/figcaption>/);
    assert.match(html, /keine Anlageberatung/);
    assert.match(html, /Mit KI-Unterstützung recherchiert und geschrieben/);
    assert.equal((html.match(/<li>[^<]*: <a href="https:/g) || []).length, a.quellen.length);
  }
});

test('IN-5 · Übersicht, Reports, Feed und Sitemap nennen jeden Artikel und jeden Report', () => {
  const hub = read('insights/index.html'), rep = read('insights/reports/index.html'), feed = read('insights/feed.xml'), map = read('insights/sitemap.xml');
  for (const a of artikel) for (const t of [hub, feed, map]) assert.ok(t.includes(`/insights/${a.slug}/`), a.slug);
  for (const r of loadReports()) { assert.ok(rep.includes(`href="${r.href}"`)); assert.ok(fs.existsSync('.' + r.href + 'index.html'), r.href); }
  assert.ok(map.includes('/insights/reports/'));
});
