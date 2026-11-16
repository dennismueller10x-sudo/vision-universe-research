/* Erklaervideo "Vision Universe KI" (bis 16.11.2026 "AI Atlas"): Frage in eigenen Worten, wird zu Filtern, rechnet auf Daten
   aus Screener, Supertrader und Quant. Fassung 2 (16.11.2026): neuer Name und Bausteine im Design "App-Konzept 2" wie die Seite
   /ask/ (weisse Suchpille mit neongruenem Knopf, Kacheln #151516 mit Radius 22 px bei 390 px Breite = 60 px bei 1080 px,
   Symbolkachel mit gruenem Rand, Zeilen mit Trennlinie). Fassung 3 (16.11.2026): neue Aufnahme, gesprochen "Die Vision Universe KI". */
(function () {
  var I = Story.icon;
  var SPARK = '<svg viewBox="0 0 24 24"><path class="ic" d="M12 2.5c.6 4.6 2.7 7.2 7.5 8-4.8.7-6.9 3.4-7.5 8-.6-4.6-2.7-7.3-7.5-8 4.8-.8 6.9-3.4 7.5-8z"/><circle cx="19.5" cy="19" r="1.4" fill="currentColor"/></svg>';
  var LUPE = '<svg viewBox="0 0 24 24" style="width:50px;height:50px;flex:none"><circle class="ic" cx="10.5" cy="10.5" r="6.5"/><path class="ic" d="M15.5 15.5 L21 21"/></svg>';
  var NEXT = '<span style="width:116px;height:116px;border-radius:50%;background:#c8f531;color:#101318;display:grid;place-items:center;flex:none;margin-left:auto"><svg viewBox="0 0 24 24" style="width:48px;height:48px"><path class="ic" d="M9 5 L16 12 L9 19"/></svg></span>';
  var Q = 'Welche profitablen Tech-Aktien sind günstig bewertet?';
  var FIL = ['Branche: Technologie', 'Profitabel', 'Günstig bewertet'];
  var SRC = [['screener', 'Screener', 120], ['supertrader', 'Supertrader', 476], ['quant', 'Quant', 832]];
  var NAME = 'Vision Universe KI';

  // Bausteine des neuen Designs nur in diesem Video; der Name wird nicht in Grossbuchstaben gesetzt ("KI" gross, Rest normal).
  var css = document.createElement('style');
  css.textContent = '#stage .card{background:#151516;border:0;border-radius:60px}' +
    '#stage .tile{border-radius:30%;background:#0e1013;border:2px solid rgba(200,245,49,.35);box-shadow:none}' +
    '#stage .chip{background:#232325;border:0}' +
    '#kick,#finKick{text-transform:none;letter-spacing:.06em}';
  document.head.appendChild(css);

  Story.define({
    kicker: NAME, finKick: NAME, finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Frag in eigenen<br><span class="lime">Worten.</span>',
        html: '<div class="abs" style="left:50%;top:20px;margin-left:-120px"><span class="tile" style="width:240px;height:240px">' + SPARK + '</span></div>' +
          '<div class="abs row" style="left:0;right:0;top:340px;min-height:144px;padding:14px 14px 14px 44px;gap:22px;border-radius:72px;background:#fff;color:#000">' + LUPE +
          '<span style="font-weight:700;font-size:40px;color:#5f5f5f">Frag ' + NAME + ' …</span><i id="acur" style="width:4px;height:50px;background:#000;display:inline-block;margin-left:-12px"></i>' + NEXT + '</div>',
        anim: function (t, k) { k.$('acur').style.opacity = Math.floor(t * 2.5) % 2 ? 0 : 1; } },
      { hl: 'Zum<br><span class="lime">Beispiel:</span>',
        html: '<div class="abs" style="left:0;right:0;top:0;display:flex;justify-content:flex-end"><div id="aq" style="max-width:820px;padding:30px 36px;border-radius:56px 56px 14px 56px;background:#c8f531;color:#101318;font-weight:800;font-size:46px;line-height:1.2;opacity:0"><span id="aqt"></span></div></div>',
        anim: function (t, k, a) { var q = k.ev('q', a + 1); k.pop('aq', t, q - .3, 24); k.$('aqt').textContent = Q.slice(0, Math.round(Q.length * k.seg(t, q - .2, q + 2))); } },
      { hl: 'Aus Frage<br>wird <span class="lime">Filter.</span>',
        html: '<div class="abs" style="left:0;right:0;top:0;display:flex;flex-direction:column;gap:22px;align-items:flex-start">' + FIL.map(function (f, i) { return '<span id="af' + i + '" class="chip" style="font-size:44px;padding:22px 36px;opacity:0"><svg viewBox="0 0 24 24" style="width:44px;height:44px"><path class="ic" d="M3 5 H21 L14 13 V19 L10 21 V13 Z"/></svg>' + f + '</span>'; }).join('') + '</div>',
        anim: function (t, k, a) { var f = k.ev('filters', a + 2) - 1.4; for (var i = 0; i < 3; i++) k.pop('af' + i, t, f + i * .45, 30); } },
      { hl: 'Auf echten<br><span class="lime">Daten.</span>',
        html: '<svg class="abs" style="left:0;top:0" width="952" height="640" viewBox="0 0 952 640">' + SRC.map(function (s, i) { return '<line class="dr" id="al' + i + '" pathLength="1" x1="' + s[2] + '" y1="420" x2="476" y2="150" stroke="#c8f531" stroke-width="4" stroke-opacity=".7"/>'; }).join('') + '</svg>' +
          '<div id="acen" class="abs" style="left:376px;top:50px;width:200px;height:200px;opacity:0;border-radius:30%"><span class="tile" style="width:200px;height:200px">' + SPARK + '</span></div>' +
          SRC.map(function (s, i) { return '<div id="as' + i + '" class="abs" style="left:' + (s[2] - 90) + 'px;top:350px;width:180px;text-align:center;opacity:0"><span class="tile" style="width:140px;height:140px;margin:0 auto">' + I(s[0]) + '</span><div style="font-weight:800;font-size:32px;margin-top:12px">' + s[1] + '</div></div>'; }).join(''),
        anim: function (t, k, a) { k.zoom('acen', t, a + .1, .6); for (var i = 0; i < 3; i++) { k.pop('as' + i, t, a + .3 + i * .3, 24); k.draw('al' + i, t, a + .6 + i * .3, .5); } var s = k.ev('src', a + 2.5); k.$('acen').style.boxShadow = '0 0 ' + (90 * k.pulse(t, s, .9)) + 'px rgba(200,245,49,.6)'; } },
      { hl: 'Regeln und<br><span class="lime">Treffer.</span>',
        html: '<div class="card abs" style="left:0;right:0;top:0;padding:34px 40px"><div style="font-weight:800;font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:#a1a7af">Angewendete Regeln</div><div class="row" style="flex-wrap:wrap;gap:14px;margin-top:20px">' + FIL.map(function (f) { return '<span class="chip" style="font-size:28px;padding:12px 24px">' + f + '</span>'; }).join('') + '</div></div>' +
          '<div class="card abs" style="left:0;right:0;top:250px;padding:6px 40px">' +
          ['A', 'B', 'C'].map(function (n, i) { return '<div id="ar' + i + '" class="row" style="padding:26px 0;gap:26px;opacity:0;' + (i ? 'border-top:2px solid rgba(255,255,255,.09)' : '') + '"><span class="tile" style="width:84px;height:84px;flex:none">' + I('discover') + '</span><span style="font-weight:900;font-size:40px">Aktie ' + n + '</span><svg viewBox="0 0 24 24" style="width:46px;height:46px;margin-left:auto;color:#c8f531"><path class="ic" stroke-width="2.6" d="M5 12 L10 17 L19 7"/></svg></div>'; }).join('') + '</div>',
        anim: function (t, k, a) { var r = k.ev('rules', a + 2); for (var i = 0; i < 3; i++) k.pop('ar' + i, t, r + i * .3, 24); } },
      { hl: 'Deine Frage.<br><span class="lime">Unsere Daten.</span>',
        html: '<div id="aapp" class="card abs row" style="left:0;right:0;top:40px;padding:40px;gap:34px;opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + SPARK + '</span><div><div class="big lime" style="font-size:66px;letter-spacing:-.04em">' + NAME + '</div><div class="lab" style="margin-top:10px;color:#a1a7af">Frag in eigenen Worten</div></div></div>',
        anim: function (t, k, a) { k.zoom('aapp', t, a + .2, .6); } }
    ]
  });
})();
