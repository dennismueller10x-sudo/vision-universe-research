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
  /* Ausgefüllte Lücken im Screener-Satz umbrechen als Inline-Text: dort keine absolute Fläche. Ausnahme App-Konzept 2
     (Prototyp #screener): in der Satz-Kachel von „Suchen“ und in den Kopfkacheln sind die Lücken Blöcke ohne Umbruch
     (inline-block, nowrap) – nur dort, eng gefasst, wächst die Fläche über ::after. */
  const scCss = read('screener/screener.css');
  assert.doesNotMatch(scCss, /(^|[},])\.sc-gap(\{position:relative\}|::after)/m);
  for (const sel of ['body.sc .sc-ak .sc-ak-sent .sc-gap', 'body.sc .sc-hero2 .sc-sentence .sc-gap']) {
    assert.ok(scCss.includes(sel + '{position:relative;display:inline-block;'), sel + ': Block ohne Umbruch');
    assert.ok(scCss.includes(sel + '::after{content:"";position:absolute;'), sel + ': Trefferfläche');
  }
  /* Die Chipleiste scrollt waagrecht und schneidet ab: 2 px Innenabstand oben/unten, Lage über Außenabstand ausgeglichen. */
  assert.match(read('fundamental/app.css'), /\.fu-qchips\{padding-top:2px;padding-bottom:2px;margin-top:8px;margin-bottom:-2px\}/);
});

test('Kopf nach Prototyp: Welten-Wechsler, KI, Suche und Profil (38 px hoch) treffen auf 44 px', () => {
  const nav = read('assets/site-navigation.js');
  assert.match(nav, /\.hb\{position:relative;width:38px;height:38px;/);
  assert.match(nav, /\.mod::after,\.hb::after\{content:"";position:absolute;inset:-3px\}/);
  assert.match(nav, /<a class="hb ki" href="\/ask\/\?fokus=1" aria-label="Vision Universe KI fragen">/, 'KI-Knopf ist ein .hb: 38 px sichtbar, 44 px Fläche');
  assert.match(nav, /\.tools\{display:flex;align-items:center;gap:8px;/, '8 px Abstand: die 44-px-Flächen überlappen nicht');
  assert.match(nav, /\.tab\{[^}]*height:44px;margin-block:-4px;/, 'Reiter-Pille 36 px, Fläche 44 px');
  assert.match(nav, /\.tab \.pill\{[^}]*height:36px;/, 'Reiter-Pille 36 px wie im Prototyp');
  assert.match(nav, /\.toggle\{[^}]*border:3px solid transparent;margin:-3px;background:\$\{t\.glass\};background-clip:padding-box;color:\$\{t\.ink\};height:44px;/, 'Menü-Knopf 38 px sichtbar, Fläche 44 px');
  assert.match(nav, /\.find button\{width:44px;height:44px;margin:-2px;border:2px solid transparent;[^}]*background-clip:padding-box;/, 'KI-Knopf der Menü-Suche 40 px sichtbar, Fläche 44 px');
});
