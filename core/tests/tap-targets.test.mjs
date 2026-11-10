// Bedienprüfung 09.11.2026 (#1719, P2): kleine Tippziele bekommen eine unsichtbare Trefferfläche von mindestens
// 44×44 px über ::after – Größe, Abstände und Aussehen bleiben (Vorher/Nachher-Bilder im PR pixelgleich).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const HIT = 'content:"";position:absolute;left:50%;top:50%;width:max(100%,44px);height:max(100%,44px);transform:translate(-50%,-50%)';

test('44-px-Trefferflächen: Abschnittslinks, Discover-„Alle“, Screener-Satz, Fundamental-Chips und -Prüflinks', () => {
  const cases = {
    'assets/vu-ui.css': ['.vu-sect>a{position:relative}.vu-sect>a::after{'],
    'discover/ui/reihen.css': ['.dr-head__t a{position:relative}.dr-head__t a::after{'],
    'screener/screener.css': ['.sc-gap.is-add,.sc-gap.is-empty,.sc-satz-o,.sc-rh-all{position:relative}.sc-gap.is-add::after,.sc-gap.is-empty::after,.sc-satz-o::after,.sc-rh-all::after{'],
    'fundamental/app.css': ['.fu-checks a{position:relative}.fu-checks a::after{', '.fu-qchip{position:relative}.fu-qchip::after{']
  };
  for (const [file, rules] of Object.entries(cases)) {
    const css = read(file);
    for (const r of rules) assert.ok(css.includes(r + HIT + '}'), file + ': ' + r);
  }
  /* Ausgefüllte Lücken im Screener-Satz umbrechen als Inline-Text: dort keine absolute Fläche. */
  assert.doesNotMatch(read('screener/screener.css'), /\.sc-gap\{position:relative\}|\.sc-gap::after/);
  /* Die Chipleiste scrollt waagrecht und schneidet ab: 2 px Innenabstand oben/unten, Lage über Außenabstand ausgeglichen. */
  assert.match(read('fundamental/app.css'), /\.fu-qchips\{padding-top:2px;padding-bottom:2px;margin-top:8px;margin-bottom:-2px\}/);
});

test('Kopf mobil: Suche und Profil (40 px breit) treffen auf 44 px Breite', () => {
  assert.match(read('assets/site-navigation.js'), /\.tools\{gap:2px\}\.hb\{width:40px;position:relative\}\.hb::after\{content:"";position:absolute;inset:0 -2px\}/);
});
