/* =========================================================================
   VISION UNIVERSE — measure-beginner-load.mjs

   WIE SCHWER IST DIESE OBERFLAECHE FUER JEMANDEN, DER 25 EURO IM MONAT
   IN EINEN ETF SPART?

   "Zu komplex" ist ein Gefuehl. Ein Gefuehl kann man nicht umbauen, und
   man kann nicht pruefen, ob der Umbau geholfen hat. Diese Messung macht
   aus dem Gefuehl Zahlen - fuer jede Hauptansicht, bei 390 px, also auf
   dem Geraet, auf dem entschieden wird.

   GEMESSEN WIRD, WAS EINEN ANFAENGER TATSAECHLICH AUFHAELT:

     woerter          Sichtbarer Text insgesamt. Lesezeit, roh.
     woerterErsteHoehe  Woerter in der ersten Bildschirmhoehe. Das ist,
                      was jemand sieht, bevor er sich entscheidet zu
                      bleiben oder wegzuwischen.
     karten           Abgegrenzte Bloecke. Jeder Block ist eine Sache,
                      die der Kopf einsortieren muss.
     entscheidungen   Klickbare Ziele. Jedes ist eine Frage "und jetzt?".
     fachbegriffe     Woerter aus der Liste unten, die ein Sparer nicht
                      mitbringt. Nicht verboten - aber jedes will erklaert
                      oder ersetzt werden.
     zahlenDichte     Zahlen je 100 Woerter. Eine Wand aus Kennzahlen
                      liest sich als "das ist nichts fuer mich".
     langeSaetze      Saetze ueber 20 Woertern. Der Hauptgrund, warum ein
                      erklaerender Text nicht erklaert.

   DIE FACHBEGRIFFE

   Die Liste ist nicht die der verbotenen Begriffe aus dem
   Sprachvertrag - die verbietet internen Code. Diese hier verbietet
   nichts. Sie zaehlt Woerter, die im Finanzjournalismus normal sind und
   an einem Kuechentisch nicht vorkommen. Ein Wort auf dieser Liste ist
   ein Hinweis, keine Anklage.
   ========================================================================= */

import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');

const argv = process.argv.slice(2);
const root = resolve(argv.find((a) => !a.startsWith('--')) || '.');
const REPORT = (() => { const i = argv.indexOf('--report'); return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : null; })();

/* Woerter, die ein Sparer nicht mitbringt. Klein geschrieben, es wird
   ohne Ruecksicht auf Gross-/Kleinschreibung gesucht. */
export const FACHBEGRIFFE = [
  'momentum', 'volatilität', 'volatilitaet', 'perzentil', 'quantil', 'faktor',
  'kennzahl', 'kennzahlen', 'ebit', 'ebitda', 'roe', 'roic', 'cashflow',
  'marktkapitalisierung', 'bewertungsniveau', 'multiple', 'kgv', 'kbv',
  'drawdown', 'sharpe', 'beta', 'alpha', 'korrelation', 'regime',
  'materialisierung', 'artefakt', 'kohorte', 'stichtag', 'aggregat',
  'relative stärke', 'relative staerke', 'benchmark', 'universum',
  'schwelle', 'perzentilrang', 'zeitreihe', 'fundamentaldaten',
  'liquidität', 'liquiditaet', 'allokation', 'diversifikation',
];

const ANSICHTEN = [
  ['Start', '/vu2/'],
  ['Screener', '/vu2/?view=screener'],
  ['Strategien', '/vu2/?view=strategies'],
  ['Aktien', '/vu2/?view=stocks'],
  ['Aktie NVDA', '/vu2/?view=stock&ticker=NVDA'],
  ['Methodik', '/vu2/?view=explain'],
];

const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png'};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://l').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(root, '.' + p);
    if (!file.startsWith(root + sep)) throw Error('path');
    if (file.endsWith('.gz')) { res.setHeader('Content-Type', 'application/octet-stream'); res.end(await readFile(file)); return; }
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({
  headless: true, args: ['--no-sandbox'],
  ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
});
const page = await browser.newPage({viewport: {width: 390, height: 844}});

const zeilen = [];
for (const [name, pfad] of ANSICHTEN) {
  await page.goto(origin + pfad, {waitUntil: 'networkidle'}).catch(() => {});
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    /* ZUGEKLAPPTES ZAEHLT NICHT - UND DAS IST NICHT SELBSTVERSTAENDLICH.

       Erste Fassung dieser Messung zaehlte auf der Strategien-Seite 192
       Klickziele. 109 davon lagen in <details>, die ZU waren: Chromium
       meldet fuer deren Inhalt weiterhin eine Bounding-Box, und die
       Pruefung auf Breite und Hoehe ging deshalb durch. Gemessen wurde
       also Last, die niemand sieht - und die Zahl, mit der ich den Umbau
       begruendet habe, war zu hoch.

       checkVisibility() beruecksichtigt content-visibility und damit den
       Zustand des Aufklappers; der Rueckfall auf die Box bleibt fuer
       aeltere Engines stehen. Zusaetzlich faellt alles heraus, was in
       einem geschlossenen <details> liegt - ausser dessen eigenem
       <summary>, denn das ist sichtbar und ist ein Klickziel. */
    const sichtbar = (el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
      if (typeof el.checkVisibility === 'function'
        && !el.checkVisibility({contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true})) return false;
      for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) {
        if (!d.open && !(el.tagName === 'SUMMARY' && el.parentElement === d) && !(el.closest('summary') && el.closest('summary').parentElement === d)) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const wurzel = document.querySelector('#app') || document.body;
    const text = (wurzel.innerText || '').replace(/\s+/g, ' ').trim();
    const worte = text ? text.split(' ').filter(Boolean) : [];

    /* Erste Bildschirmhoehe: alles, was oberhalb von 844 px beginnt. */
    let obenText = '';
    for (const el of wurzel.querySelectorAll('*')) {
      if (el.children.length) continue;           /* nur Blattknoten, sonst zaehlt alles doppelt */
      if (!sichtbar(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < 844) obenText += ' ' + (el.textContent || '');
    }
    const obenWorte = obenText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

    const karten = [...wurzel.querySelectorAll('section,article,.card,.q-card,.panel')].filter(sichtbar).length;
    const entscheidungen = [...wurzel.querySelectorAll('a[href],button,select,input,[role=button],[tabindex]')].filter(sichtbar).length;

    /* SAETZE WERDEN JE TEXTBLOCK GEZAEHLT, NICHT UEBER DIE GANZE SEITE.

       SELBST GEFUNDEN, ALS ZWEI MESSUNGEN SICH WIDERSPRACHEN: dieses
       Werkzeug meldete fuer die Strategien-Seite 11 lange Saetze, eine
       direkte Messung je Absatz fand 1.

       Der Grund stand hier: `text` ist der ganze Seitentext mit
       zusammengepressten Leerzeichen, und getrennt wurde an ". ". Damit
       verschmilzt jede Ueberschrift mit dem folgenden Absatz zu EINEM
       Satz, bis irgendwo ein Punkt kommt - "Quality Compounder Sucht
       Unternehmen mit ...". Auf einer Seite mit elf Karten erzeugt das
       elf lange Saetze, die niemand geschrieben hat.

       Die Zahl bestrafte also Seiten dafuer, viele Bloecke zu haben -
       und genau nach dieser Zahl haette ich als naechstes umgebaut.
       Ein Lineal, das sich nach der Form der Seite biegt, misst nichts.

       Es ist derselbe Fehler wie beim Zaehlen der Klickziele (dort
       zaehlten Elemente in zugeklappten <details> mit): eine Messung
       ueber die Seite statt ueber das, was ein Mensch als Einheit liest.

       Jetzt: je Blockelement, an Satzzeichen getrennt. */
    const bloecke = [...wurzel.querySelectorAll('p,li,h1,h2,h3,h4,summary,figcaption,dd,dt,blockquote,td,th')]
      .filter(sichtbar);
    const saetze = [];
    for (const b of bloecke) {
      if (b.querySelector('p,li,h1,h2,h3,h4,summary,figcaption,dd,dt,blockquote,td,th')) continue;
      for (const s of (b.innerText || '').split(/(?<=[.!?])\s+/)) {
        const t = s.trim();
        if (t.split(/\s+/).filter(Boolean).length > 2) saetze.push(t);
      }
    }
    const langeSaetze = saetze.filter((s) => s.split(/\s+/).filter(Boolean).length > 20).length;
    const zahlen = (text.match(/\d[\d.,]*/g) || []).length;

    return {
      text: text.toLowerCase(),
      woerter: worte.length,
      woerterErsteHoehe: obenWorte.length,
      karten, entscheidungen,
      saetze: saetze.length,
      langeSaetze,
      zahlen,
    };
  });

  const treffer = FACHBEGRIFFE.filter((b) => m.text.includes(b));
  zeilen.push({
    ansicht: name, pfad,
    woerter: m.woerter,
    woerterErsteHoehe: m.woerterErsteHoehe,
    karten: m.karten,
    entscheidungen: m.entscheidungen,
    langeSaetze: m.langeSaetze,
    saetze: m.saetze,
    zahlenDichte: m.woerter ? Math.round((m.zahlen / m.woerter) * 1000) / 10 : 0,
    fachbegriffe: treffer.length,
    fachbegriffeListe: treffer,
  });
}

await browser.close();
server.close();

const p = (n, b) => String(n).padStart(b);
console.log('\nEINSTEIGERLAST BEI 390 px · ' + root + '\n');
console.log('  Ansicht      Woerter  davon 1.Hoehe  Karten  Klickziele  lange Saetze  Fachbegriffe  Zahlen/100W');
for (const z of zeilen) {
  console.log('  ' + z.ansicht.padEnd(12) + p(z.woerter, 7) + p(z.woerterErsteHoehe, 15)
    + p(z.karten, 8) + p(z.entscheidungen, 12) + p(z.langeSaetze, 14) + p(z.fachbegriffe, 14) + p(z.zahlenDichte, 13));
}
const summe = (k) => zeilen.reduce((a, z) => a + z[k], 0);
console.log('\n  Summe ueber sechs Ansichten: ' + summe('woerter') + ' Woerter, '
  + summe('entscheidungen') + ' Klickziele, ' + summe('langeSaetze') + ' lange Saetze.');
console.log('  Fachbegriffe insgesamt: ' + [...new Set(zeilen.flatMap((z) => z.fachbegriffeListe))].join(', ') + '\n');

if (REPORT) {
  await writeFile(REPORT, JSON.stringify({
    schemaVersion: 'beginner-load-1.0.0',
    generatedAtUtc: new Date().toISOString(),
    release: root,
    viewport: {width: 390, height: 844},
    views: zeilen,
  }, null, 2) + '\n');
  console.log('  Bericht: ' + REPORT + '\n');
}
