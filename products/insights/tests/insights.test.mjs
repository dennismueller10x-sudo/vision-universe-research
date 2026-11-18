// Insights (/insights/, /insights/reports/): Seiten sind aktuell gebaut, jeder Artikel ist belegt, eingefroren und hält die Wortwahl ein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build, loadArtikel, loadReports, loadMagazin } from '../build.mjs';

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
    assert.ok(a.bild.alt.length > 10);
    if (a.bild.typ === 'app') assert.ok(a.appScreens?.[a.ticker[0]]?.length, `${a.slug}: App-Aufmacher ohne App-Screens (products/insights/screens.mjs)`);
    else {
      assert.ok(fs.existsSync('.' + a.bild.src), `${a.slug}: Bild ${a.bild.src} fehlt`);
      assert.ok(a.bild.ki || a.bild.quelle, `${a.slug}: Bild braucht Bildnachweis (quelle) oder ki: true`);
    }
    assert.ok(!a.pruefung || ['redaktion', 'automatisch'].includes(a.pruefung), `${a.slug}: unbekannte pruefung`);
    for (const s of a.abschnitte) for (const g of [].concat(s.diagramm || [])) {
      assert.ok(g.titel && g.quelle && ['saeulen', 'balken'].includes(g.art || 'saeulen'), `${a.slug}: Diagramm braucht titel, quelle und art saeulen|balken`);
      assert.ok(Array.isArray(g.werte) && g.werte.length >= 2 && g.werte.every(([k, v]) => typeof k === 'string' && Number.isFinite(v)), `${a.slug}: Diagramm-Werte [[Beschriftung, Zahl], …]`);
      if ((g.art || 'saeulen') === 'saeulen') assert.ok(g.werte.every(([, v]) => v >= 0), `${a.slug}: Säulen nur mit Werten >= 0 (sonst art balken)`);
    }
    for (const s of a.abschnitte) if (s.bild) { assert.ok(s.bild.quelle && fs.existsSync('.' + s.bild.src), `${a.slug}: Bild im Text ohne Nachweis oder Datei`); }
    for (const [t, list] of Object.entries(a.appScreens || {})) for (const sc of list) assert.ok(fs.existsSync('.' + sc.src), `${a.slug}: App-Screen ${sc.src} fehlt (${t})`);
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
    assert.match(html, a.bild.typ === 'app' ? /<figcaption>Vision-Universe-App<\/figcaption>/ : a.bild.ki ? /<figcaption>KI-Bild<\/figcaption>/ : new RegExp(`<figcaption>Bild: ${a.bild.quelle}</figcaption>`));
    assert.match(html, /keine Anlageberatung/);
    assert.match(html, /<meta name="robots" content="index,follow/, `${a.slug}: Artikel muss für Suchmaschinen freigegeben sein`);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, /Redaktion Vision Universe · Stand/);
    assert.doesNotMatch(html, /mit KI (erstellt|recherchiert)|KI-Unterstützung/i, `${a.slug}: kein KI-Hinweis am Text (Owner 10.11.2026)`);
    assert.equal((html.match(/<li>[^<]*: <a href="https:/g) || []).length, a.quellen.length);
  }
});

test('IN-5 · Übersicht, Reports, Feed und Sitemap nennen jeden Artikel und jeden Report', () => {
  const hub = read('insights/index.html'), rep = read('insights/reports/index.html'), feed = read('insights/feed.xml'), map = read('insights/sitemap.xml');
  for (const a of artikel) for (const t of [hub, feed, map]) assert.ok(t.includes(`/insights/${a.slug}/`), a.slug);
  for (const r of loadReports()) { assert.ok(rep.includes(`href="${r.href}"`)); assert.ok(fs.existsSync('.' + r.href + 'index.html'), r.href); }
  assert.ok(map.includes('/insights/reports/'));
});

test('IN-6 · Aktienmagazin: jede Ausgabe hat PDF, Cover und alle Seitenbilder; Inhalt zeigt auf vorhandene Seiten', () => {
  const hefte = loadMagazin();
  assert.ok(hefte.length >= 1);
  for (const h of hefte) {
    const dir = `insights/magazin/nr-${h.nr}/`;
    for (const f of ['cover.jpg', `vision-universe-aktienmagazin-${h.nr}.pdf`, 'index.html']) assert.ok(fs.existsSync(dir + f), dir + f);
    for (let i = 1; i <= h.seiten; i++) assert.ok(fs.existsSync(`${dir}seiten/s${String(i).padStart(2, '0')}.jpg`), `${dir} Seite ${i}`);
    for (const [s] of h.inhalt) assert.ok(s >= 1 && s <= h.seiten);
    assert.ok(read('insights/magazin/index.html').includes(`/insights/magazin/nr-${h.nr}/`));
  }
});

test('IN-7 · automatisch veröffentlichte Artikel: mindestens drei Quellen, App-Screens, kein Zitat ohne Quelle', () => {
  for (const a of artikel) {
    assert.ok(['redaktion', 'automatisch', undefined].includes(a.pruefung), `${a.slug}: pruefung ist redaktion oder automatisch`);
    if (a.pruefung !== 'automatisch') continue;
    assert.ok(a.quellen.length >= 3, `${a.slug}: automatisch braucht mindestens drei Quellen`);
    assert.ok(a.ticker.every((t) => (a.appScreens?.[t]?.length ?? 0) >= 2), `${a.slug}: App-Screens fehlen (products/insights/screens.mjs)`);
    assert.ok(a.abschnitte.some((s) => s.daten), `${a.slug}: Abschnitt "Was unsere Daten zeigen" fehlt`);
    if (a.zitat) assert.match(a.zitat.von, /,/, `${a.slug}: Zitat braucht Sprecher und Medium`);
    if (a.bild.typ !== 'app') assert.ok(a.bild.quelle, `${a.slug}: Pressebild ohne Bildnachweis`);
  }
});

// App-Konzept 2 (Owner 14.11.2026): der neueste Artikel füllt den ersten Bildschirm, Aktienmagazin und Aktienreport haben
// je eine Bühne mit Titelseite, Nummer, Seitenzahl und beiden Knöpfen, die Seiten bleiben ohne JavaScript lesbar.
test('IN-8 · News-Start nach Prototyp „App-Konzept 2“ (#news): Titelbild, Reiter, Artikelzeilen, Magazin, Kurz erklärt, Reports', async () => {
  const { createRequire } = await import('node:module');
  const VUUI = createRequire(import.meta.url)('../../../assets/vu-ui.js');
  const pages = build(), hub = pages['insights/index.html'], heft = loadMagazin()[0], reports = loadReports();
  const stories = JSON.parse(read('willkommen/config/stories.json')).stories;
  // Reihenfolge wie im Prototyp: Titelbild (neuester Artikel, einzige h1), Reiter, Heute, Aktienmagazin, Kurz erklärt, Zu deinen Aktien, Aktienreports
  const order = ['class="in-held"', 'class="in-tabs"', 'id="heute"', 'id="magazin"', 'id="kurz"', 'id="deine"', 'id="reports"'].map((k) => hub.indexOf(k));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), 'Reihenfolge der Blöcke: ' + order.join(','));
  assert.match(hub, /^<!DOCTYPE html>\n<html lang="de" data-vu-tabs="inhalt" data-vu-bleed>/, 'Reiter im Inhalt, Kopf durchsichtig über dem Titelbild');
  assert.equal((hub.match(/<h1[ >]/g) || []).length, 1, 'genau eine h1');
  assert.ok(hub.includes(`<h1><a class="in-dehn" href="/insights/${artikel[0].slug}/">`), 'neuester Artikel im Titelbild');
  const heute = hub.slice(hub.indexOf('id="heute"'), hub.indexOf('id="magazin"'));
  assert.equal((heute.match(/class="in-art"/g) || []).length, Math.min(3, artikel.length - 1), 'drei Artikelzeilen unter „Heute“');
  // Jede Zeile: Bild, Rubrik, Titel-Link, jede Aktie als Vorschau-Ziel mit Platz für die Tagesbewegung, Datum
  for (const a of artikel.slice(1)) {
    const z = hub.match(new RegExp(`<div class="in-art" data-in-tk="${a.ticker.join(' ')}">[\\s\\S]*?href="/insights/${a.slug}/"[\\s\\S]*?</time></div></div></div>`))?.[0] || '';
    assert.ok(z.includes('<img ') && z.includes(`<time class="in-zeit" datetime="${a.datum}">`), `${a.slug}: Zeile mit Bild und Datum`);
    for (const t of a.ticker) assert.ok(z.includes(`href="/aktie/#/${t}" data-vu-stock="${t}" data-vu-stock-name="`) && z.includes(`data-in-chg="${t}"`), `${a.slug}: Aktie ${t}`);
  }
  // Aktienmagazin: Kachel mit Titelseite, Nummer, Seitenzahl, Lesefortschritt (news.js) und Knopf; „Alle Ausgaben“
  if (heft) {
    const k = hub.match(/<a class="in-heft" href="\/insights\/magazin\/[^"]*"[\s\S]*?<\/a>/)?.[0] || '';
    assert.ok(k.includes(`<img src="/insights/magazin/nr-${heft.nr}/cover.jpg"`) && k.includes(`Nr. ${heft.nr}`) && k.includes(`${heft.seiten} Seiten`) && k.includes(`data-in-seiten="${heft.seiten}"`) && k.includes('class="in-btn">Lesen<'), 'Magazin-Kachel');
    assert.ok(hub.includes('<a href="/insights/magazin/">Alle Ausgaben ›</a>'));
  }
  // Kurz erklärt: jedes Erklärvideo aus willkommen/config/stories.json
  for (const s of stories) { const v = s.slides.find((x) => x.type === 'video'); if (v) assert.ok(hub.includes(`data-in-vid="${v.src}"`), `Video ${s.id}`); }
  // Reports: jeder Report mit Seiten als Kachel
  for (const r of reports.filter((x) => x.seiten)) assert.ok(hub.includes(`<a class="in-heft" href="${r.href}"`), r.href);
  // Leseseiten: Bühne als Seitenkopf mit h1, Inhalt führt auf vorhandene Seiten
  const stage = (html, ton) => html.match(new RegExp(`<(section|header) class="in-buehne in-buehne--${ton}[^"]*">[\\s\\S]*?</\\1>`))?.[0] || '';
  const heftSeite = pages[`insights/magazin/nr-${heft.nr}/index.html`];
  assert.match(stage(heftSeite, 'nacht'), /<h1>/);
  for (const [s] of heft.inhalt) assert.ok(heftSeite.includes(`<a class="in-seite" href="#s${String(s).padStart(2, '0')}">`) && heftSeite.includes(`<img id="s${String(s).padStart(2, '0')}"`));
  // Artikel: Titelbild im Rahmen des Prototyps mit der einzigen h1, Aktien als Vorschau-Ziele
  for (const a of artikel) {
    const html = pages[`insights/${a.slug}/index.html`];
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${a.slug}: genau eine h1`);
    assert.ok(html.includes('<div class="in-held in-held--artikel">') && html.includes(`<h1>${a.titel.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}</h1>`), `${a.slug}: Titelbild`);
    for (const t of a.ticker) assert.ok(html.includes(`data-vu-stock="${t}"`), `${a.slug}: ${t} als Vorschau-Ziel`);
  }
  // Farben: Schwarz, Weiß, Graustufen, Neongrün, das Nachtschwarz der Bausteine und das Rot der Tagesbewegung (Owner 15.11.2026)
  for (const hex of read('insights/insights.css').match(/#[0-9a-f]{3,8}\b/gi) || []) {
    const h = hex.slice(1).toLowerCase(), full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    assert.ok(['c8f531', '0e1013', 'c4281c'].includes(full) || (full.slice(0, 2) === full.slice(2, 4) && full.slice(2, 4) === full.slice(4, 6)), `insights.css: Farbe außerhalb der Palette: ${hex}`);
  }
  for (const [rel, html] of Object.entries(pages).filter(([rel]) => rel.endsWith('.html'))) {
    // ohne JavaScript lesbar: außer der gemeinsamen Navigation lädt jede Seite nur insights/news.js (verzögert, nur Ergänzungen)
    assert.deepEqual([...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/\?.*$/, '')), ['/assets/site-navigation.js', '/insights/news.js'], rel);
    assert.match(html, /<script src="\/insights\/news\.js\?v=[^"]+" defer><\/script>/, rel);
    assert.ok(html.includes(`<link rel="stylesheet" href="/assets/vu-ui.css?v=${VUUI.VERSION}">`), `${rel}: Marke der Bausteine`);
    assert.ok(html.includes('<meta name="theme-color" content="#08080a">') && html.includes('data-vu-tabs="inhalt"'), `${rel}: dunkler Standard, Reiter im Inhalt`);
    assert.equal((html.match(/<a class="vu-next" /g) || []).length, 1, `${rel}: eine „Weiter“-Karte am Seitenende`);
    assert.ok(html.includes('data-in-hinweise>Daten &amp; Hinweise</a>'), `${rel}: „Daten & Hinweise“ am Seitenende`);
    assert.deepEqual([...html.matchAll(/<nav class="in-tabs"[^>]*>(.*?)<\/nav>/g)].map((m) => m[1].replace(/<[^>]+>/g, '|')), ['|Heute||Magazin||Kurz erklärt||Reports|'], rel);
  }
});

test('IN-9 · news.js: keine Wortwahl-Verstöße, Tagesbewegung nur über published-close.js und core/identity.js', () => {
  const js = read('insights/news.js');
  assert.doesNotMatch(js.replace(/\/\*[\s\S]*?\*\//g, ''), /Signal|Empfehlung|Kursziel|für dich/i);
  assert.match(js, /PC\.dayChange\(series, today\)/);
  assert.match(js, /Id\.securityIdForTicker\(t\)/);
  assert.doesNotMatch(js, /["']ref_["']\s*\+/, 'keine eigene Identitätsbildung (ADR-001)');
});
