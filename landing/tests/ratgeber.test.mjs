// Ratgeber (scripts/ratgeber.mjs, ratgeber-inhalt/): Pflichtbausteine, Wortwahl, Quellen, Links, strukturierte Daten,
// Rechenregeln und Einbindung in den Bau (Sitemap, Startseiten-Balken, Menü).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {laden, ratgeberSeiten, zulage, sparplan, root, indexWerte} from '../scripts/ratgeber.mjs';
import {build, SITE_PAGES} from '../scripts/build.mjs';

const {welten, daten, artikel} = laden();
const VERBOTEN = /kaufempfehlung|kaufsignal|verkaufssignal|wir empfehlen|empfohlen|kursziel|zielkurs|kurspotenzial|garantiert|risikolos|schlägt den markt|den markt schlagen|top-pick|geheimtipp|unterbewertet|schnäppchen|zu billig|passt zu dir|kaufgelegenheit|einstiegschance/i;
const geplant = new Set(welten.welten.flatMap((w) => w.artikel.map(([s]) => s)));

test('RG-1 · jeder Artikel hat alle Pflichtbausteine und gehört zum Themenplan', () => {
  assert.ok(Object.keys(artikel).length >= 10, 'mindestens die 10 Startartikel');
  for (const a of Object.values(artikel)) {
    for (const k of ['slug', 'welt', 'titel', 'h1', 'untertitel', 'teaser', 'beschreibung', 'kurz', 'stand', 'abschnitte', 'faq', 'quellen']) assert.ok(a[k], `${a.slug}: ${k}`);
    assert.ok(geplant.has(a.slug), `${a.slug} steht im Themenplan (welten.json)`);
    assert.match(a.slug, /^[a-z0-9-]+$/);
    assert.ok(a.beschreibung.length >= 110 && a.beschreibung.length <= 175, `${a.slug}: Beschreibung ${a.beschreibung.length} Zeichen`);
    assert.ok(a.abschnitte.length >= 3, `${a.slug}: mindestens drei Abschnitte`);
    assert.ok(a.faq.length >= 3, `${a.slug}: mindestens drei Fragen`);
    assert.ok(a.quellen.length >= 1, `${a.slug}: Quellen`);
    assert.ok(a.abschnitte.some((s) => (s.grafiken || []).some((g) => g.typ !== 'merke')), `${a.slug}: mindestens eine Grafik`);
    assert.match(a.stand, /^\d{4}-\d{2}-\d{2}$/);
    for (const s of a.abschnitte) assert.match(s.id, /^[a-z0-9-]+$/, `${a.slug}: Abschnitts-ID`);
  }
});

test('RG-2 · Wortwahl: beschreiben statt empfehlen (docs/legal/WORTWAHL.md)', () => {
  for (const a of Object.values(artikel)) {
    const text = JSON.stringify(a);
    const m = text.match(VERBOTEN);
    assert.equal(m, null, `${a.slug}: „${m?.[0]}“`);
  }
});

test('RG-3 · Beispielwerte: jede genannte Aktie liegt eingefroren vor, mit Stand und KGV-Median', () => {
  assert.match(daten.stand, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(daten.markt.kgvMedian > 0 && daten.markt.anzahl > 1000);
  for (const a of Object.values(artikel)) for (const s of a.abschnitte) for (const g of s.grafiken || []) {
    for (const t of [].concat(g.ticker || [])) {
      const x = daten.aktien[t];
      assert.ok(x, `${a.slug}: ${t} fehlt in daten.json`);
      assert.ok(x.kurs > 0 && x.gewinnJeAktie > 0 && x.kgv > 0, `${a.slug}: ${t} unvollständig`);
      assert.ok(Math.abs(x.kurs / x.gewinnJeAktie - x.kgv) / x.kgv < 0.02, `${t}: KGV passt zu Kurs ÷ Gewinn je Aktie`);
    }
  }
});

test('RG-4 · Rechenregeln: Zulage nach § 84–86 EStG n. F., Sparplan', () => {
  assert.deepEqual([119, 120, 360, 1000, 1800, 5000].map((b) => zulage(b).grund), [0, 60, 180, 340, 540, 540]);
  assert.equal(zulage(1800, 2).kind, 600);
  assert.equal(zulage(200, 1).kind, 200, 'Kinderzulage 100 % der Beiträge');
  assert.equal(zulage(1800, 0, true).summe, 740);
  const s = sparplan(100, 25, 0.05);
  assert.equal(s.eingezahlt, 30000);
  assert.ok(Math.abs(s.wert - 58812) < 5, `Sparplan ${s.wert}`);
  assert.equal(sparplan(100, 10, 0).wert, 12000);
});

test('RG-5 · Seiten: strukturierte Daten, Kanonisch, interne Links führen zu echten Seiten', () => {
  const {seiten, balken} = ratgeberSeiten();
  const pfade = new Set(seiten.map((s) => s.pfad));
  assert.ok(pfade.has('ratgeber/index.html'));
  for (const w of welten.welten) assert.ok(pfade.has(`ratgeber/thema/${w.id}/index.html`));
  for (const s of seiten) {
    const ld = s.html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/);
    assert.ok(ld, `${s.pfad}: JSON-LD`);
    const graph = JSON.parse(ld[1])['@graph'];
    assert.ok(graph.some((g) => g['@type'] === 'BreadcrumbList'), `${s.pfad}: Brotkrumen`);
    if (s.pfad.split('/').length === 3 && !s.pfad.startsWith('ratgeber/thema/') && s.pfad !== 'ratgeber/index.html') {
      assert.ok(graph.some((g) => g['@type'] === 'Article'), `${s.pfad}: Article`);
      assert.ok(graph.some((g) => g['@type'] === 'FAQPage'), `${s.pfad}: FAQPage`);
    }
    assert.match(s.html, new RegExp(`<link rel="canonical" href="https://www\\.visionuniverse\\.de/${s.pfad.replace('index.html', '').replace(/[.]/g, '\\.')}">`));
    assert.match(s.html, /<meta name="robots" content="noindex, nofollow">/, 'Quelle bleibt noindex, der Produktionsbau schaltet frei');
    assert.doesNotMatch(s.html, /<style\b|<script(?![^>]*\b(?:src=|type="application\/(?:ld\+)?json"))[^>]*>/, `${s.pfad}: kein Inline-Skript (CSP)`);
    const tiefe = s.pfad.split('/').length - 1;
    for (const m of s.html.matchAll(/href="((?:\.\.\/)+)ratgeber\/([^"#]*)"/g)) {
      assert.equal(m[1].length / 3, tiefe, `${s.pfad}: Linktiefe ${m[0]}`);
      const ziel = `ratgeber/${m[2]}index.html`;
      assert.ok(pfade.has(ziel), `${s.pfad}: Link auf ${ziel} führt ins Leere`);
    }
    for (const m of s.html.matchAll(/href="\.\.\/([a-z0-9-]+)\/"/g)) {
      if (s.pfad.startsWith('ratgeber/') && tiefe === 2) assert.ok(pfade.has(`ratgeber/${m[1]}/index.html`), `${s.pfad}: Querverweis ../${m[1]}/`);
    }
  }
  assert.match(balken, /href="\.\/ratgeber\/"/);
});

test('RG-6 · Bau: Ratgeber in Sitemap (mit Änderungsdatum), Startseiten-Balken, Menü auf allen Seiten', async () => {
  const out = resolve(root, 'tests/output/ratgeber-production');
  try {
    await build({output: out, config: {mode: 'closed', privacyReviewed: true, privacyHtmlPath: 'legal-drafts/newsletter-public-2026-10-16.html'}, production: true});
    const sitemap = await readFile(resolve(out, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /<loc>https:\/\/www\.visionuniverse\.de\/ratgeber\/<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    for (const slug of Object.keys(artikel)) assert.ok(sitemap.includes(`/ratgeber/${slug}/</loc>`), slug);
    const kgv = await readFile(resolve(out, 'ratgeber/kgv/index.html'), 'utf8');
    assert.match(kgv, /<meta name="robots" content="index, follow">/);
    assert.match(kgv, /web\/ratgeber\.js\?v=[0-9a-f]{16}/);
    assert.match(kgv, /http-equiv="Content-Security-Policy"/);
    const home = await readFile(resolve(out, 'index.html'), 'utf8');
    assert.match(home, /<!--RATGEBER:balken--><section class="rg-bar"/);
    // /start/ ist eine schlanke Landingpage ohne Hauptmenü.
    for (const p of ['index.html', ...SITE_PAGES.filter((x) => x !== 'start/index.html')]) {
      const html = await readFile(resolve(out, p), 'utf8');
      assert.match(html, /<summary>Ratgeber<svg/, `${p}: Ratgeber im Menü`);
      assert.match(html, /ratgeber\/">Ratgeber<\/a>/, `${p}: Ratgeber im Handy-Menü oder in der Fußzeile`);
    }
    assert.match(await readFile(resolve(out, 'llms.txt'), 'utf8'), /## Ratgeber\n- \[/);
  } finally { await rm(out, {recursive: true, force: true}); }
});

test('RG-7 · App-Bilder der Artikel existieren', () => {
  for (const a of Object.values(artikel)) if (a.app) assert.ok(existsSync(resolve(root, `web/img/app/${a.app.bild}.jpg`)), `${a.slug}: ${a.app.bild}.jpg`);
});

test('RG-8 · Indexverlauf: 10.000 $ Start, Endwert und Jahresrendite passen zur Reihe', () => {
  const I = daten.indizes;
  assert.equal(I.daten.length, I.reihen.SPY.length);
  for (const t of ['SPY', 'URTH', 'ACWI']) {
    assert.equal(I.reihen[t].length, I.daten.length, t);
    const w = indexWerte(I, 10)[t];
    assert.ok(Math.abs(w.v[0] - 10000) < 1e-6, t);
    assert.ok(Math.abs(w.ende - I.reihen[t].at(-1) / I.reihen[t][0] * 10000) < 1e-6, t);
    assert.ok(Math.abs((1 + w.jahr) ** 10 - (1 + w.gesamt)) < 1e-9, t);
    const f = indexWerte(I, 5)[t];
    assert.ok(f.v.length > 60 && f.v.length < 70, `${t}: fünf Jahre ≈ 65 Vierwochenpunkte`);
  }
  // Keine Liste „Quellen“ mehr auf der Seite; der Hinweis „keine Anlageberatung“ bleibt.
  const html = ratgeberSeiten().seiten.find((s) => s.pfad === 'ratgeber/msci-world/index.html')?.html || '';
  assert.match(html, /data-g="ichart"/);
  assert.doesNotMatch(html, /<h2>Quellen<\/h2>/);
  assert.match(html, /keine Anlage-, Steuer- oder Rechtsberatung/);
});
