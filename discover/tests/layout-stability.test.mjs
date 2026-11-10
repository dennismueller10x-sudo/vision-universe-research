// Bedienprüfung 09.11.2026 (docs/reports/app-bedienung-20261109.md, P2 NVDA): zwei Layoutsprünge beim Direktaufruf einer
// Aktie, beide nur CSS-seitig behoben, ohne Änderung am fertigen Bild (Vorher/Nachher pixelgleich, siehe PR).
//  1. index.html entfernt bei Direktaufrufen den vorgerenderten Start; bis zur Ansicht ist #v2-shell leer und der
//     Rechtshinweis-Fuß stand oben (CLS 0,22 gedrosselt). -> leere Hülle reserviert den Bildschirm.
//  2. Solange die Kursreihe lädt, ist .dx-chart leer; danach wandert der Kursblock in den Chart-Abschnitt (CLS 0,17 bei
//     CPU-Drosselung). -> Preis-Platzhalter mit Höhe des Kursblocks, leerer Chart-Abschnitt unsichtbar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('leere Discover-Hülle reserviert den Bildschirm (Direktaufruf ohne vorgerenderten Start)', () => {
  assert.match(css('app.css'), /\.dv2 #v2-shell:not\(:has\(\*\)\)\{min-height:calc\(100svh - var\(--vu-navigation-height,56px\)\)\}/);
  const html = css('index.html');
  assert.match(html, /<div id="v2-shell"><main id="v2-main"/, 'die Hülle ist nur bis zur Ansicht leer');
  assert.match(html, /n\.closest\("main"\)\.remove\(\)/, 'Direktaufruf entfernt den vorgerenderten Start weiterhin');
});

test('Aktienseite: während die Kursreihe lädt, hält der Preis die Höhe des Kursblocks und der leere Chart ist unsichtbar', () => {
  const d = css('detail.css');
  const rule = d.match(/@media\(max-width:760px\)\{(body\.dv2 \.dv2-stock:has\(\.dx-chapter--chart > \.dx-chart:empty\) \.dx-dhero-right\{min-height:\d+px\}body\.dv2 \.dv2-stock \.dx-chapter--chart:has\(> \.dx-chart:empty\)\{visibility:hidden\})\}/);
  assert.ok(rule, 'Regel fehlt oder geändert');
  /* Nur der Ladezustand: der Platzhalter ist direktes Kind des Abschnitts (discover/ui/detail.js); jeder Ladeausgang
     (Reihe, keine Reihe, Fehler) leert den Abschnitt mit S.clear(chartHost), im fertigen Chart liegt .dx-chart tiefer. */
  const js = fs.readFileSync(new URL('../ui/detail.js', import.meta.url), 'utf8');
  assert.match(js, /chartHost\.appendChild\(el\("div", \{ class: "dx-chart", style: "height:320px" \}\)\);/);
  assert.equal((js.match(/S\.clear\(chartHost\);/g) || []).length, 2, 'Erfolg/keine Reihe und Fehler leeren den Platzhalter');
  assert.match(css('detail.css'), /\.dv2-stock:has\(\.dx-chart-hero\) \.dx-dhero-right\{display:none\}/, 'fertiger Kursblock ersetzt den Platzhalter');
});
