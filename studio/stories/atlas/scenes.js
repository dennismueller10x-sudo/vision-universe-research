/* Erklaervideo "AI Atlas": Frage in eigenen Worten, wird zu Filtern, rechnet auf Daten aus Screener, Supertrader und Quant. */
(function () {
  var I = Story.icon;
  var SPARK = '<svg viewBox="0 0 24 24"><path class="ic" d="M12 2.5c.6 4.6 2.7 7.2 7.5 8-4.8.7-6.9 3.4-7.5 8-.6-4.6-2.7-7.3-7.5-8 4.8-.8 6.9-3.4 7.5-8z"/><circle cx="19.5" cy="19" r="1.4" fill="currentColor"/></svg>';
  var Q = 'Welche profitablen Tech-Aktien sind günstig bewertet?';
  var FIL = ['Branche: Technologie', 'Profitabel', 'Günstig bewertet'];
  var SRC = [['screener', 'Screener', 120], ['supertrader', 'Supertrader', 476], ['quant', 'Quant', 832]];

  Story.define({
    kicker: 'AI Atlas', finKick: 'AI Atlas', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Frag in eigenen<br><span class="lime">Worten.</span>',
        html: '<div class="abs" style="left:50%;top:20px;margin-left:-120px"><span class="tile" style="width:240px;height:240px;border-radius:50%">' + SPARK + '</span></div>' +
          '<div class="card abs row" style="left:0;right:0;top:340px;padding:26px 30px;gap:18px;border-radius:999px"><span class="lab" style="font-size:34px">Frag Atlas …</span><i id="acur" style="width:4px;height:44px;background:#c8f531;display:inline-block"></i></div>',
        anim: function (t, k) { k.$('acur').style.opacity = Math.floor(t * 2.5) % 2 ? 0 : 1; } },
      { hl: 'Zum<br><span class="lime">Beispiel:</span>',
        html: '<div class="abs" style="left:0;right:0;top:0;display:flex;justify-content:flex-end"><div id="aq" style="max-width:820px;padding:30px 36px;border-radius:36px 36px 10px 36px;background:#c8f531;color:#101318;font-weight:800;font-size:46px;line-height:1.2;opacity:0"><span id="aqt"></span></div></div>',
        anim: function (t, k, a) { var q = k.ev('q', a + 1); k.pop('aq', t, q - .3, 24); k.$('aqt').textContent = Q.slice(0, Math.round(Q.length * k.seg(t, q - .2, q + 2))); } },
      { hl: 'Aus Frage<br>wird <span class="lime">Filter.</span>',
        html: '<div class="abs" style="left:0;right:0;top:0;display:flex;flex-direction:column;gap:22px;align-items:flex-start">' + FIL.map(function (f, i) { return '<span id="af' + i + '" class="chip" style="font-size:44px;padding:20px 34px;opacity:0;border-color:#c8f531"><svg viewBox="0 0 24 24" style="width:44px;height:44px"><path class="ic" d="M3 5 H21 L14 13 V19 L10 21 V13 Z"/></svg>' + f + '</span>'; }).join('') + '</div>',
        anim: function (t, k, a) { var f = k.ev('filters', a + 2) - 1.4; for (var i = 0; i < 3; i++) k.pop('af' + i, t, f + i * .45, 30); } },
      { hl: 'Auf echten<br><span class="lime">Daten.</span>',
        html: '<svg class="abs" style="left:0;top:0" width="952" height="640" viewBox="0 0 952 640">' + SRC.map(function (s, i) { return '<line class="dr" id="al' + i + '" pathLength="1" x1="' + s[2] + '" y1="420" x2="476" y2="150" stroke="#c8f531" stroke-width="4" stroke-opacity=".7"/>'; }).join('') + '</svg>' +
          '<div id="acen" class="abs" style="left:376px;top:50px;width:200px;height:200px;opacity:0"><span class="tile" style="width:200px;height:200px;border-radius:50%">' + SPARK + '</span></div>' +
          SRC.map(function (s, i) { return '<div id="as' + i + '" class="abs" style="left:' + (s[2] - 90) + 'px;top:350px;width:180px;text-align:center;opacity:0"><span class="tile" style="width:140px;height:140px;margin:0 auto">' + I(s[0]) + '</span><div style="font-weight:800;font-size:32px;margin-top:12px">' + s[1] + '</div></div>'; }).join(''),
        anim: function (t, k, a) { k.zoom('acen', t, a + .1, .6); for (var i = 0; i < 3; i++) { k.pop('as' + i, t, a + .3 + i * .3, 24); k.draw('al' + i, t, a + .6 + i * .3, .5); } var s = k.ev('src', a + 2.5); k.$('acen').style.boxShadow = '0 0 ' + (90 * k.pulse(t, s, .9)) + 'px rgba(200,245,49,.6)'; } },
      { hl: 'Regeln und<br><span class="lime">Treffer.</span>',
        html: '<div class="card abs" style="left:0;right:0;top:0;padding:26px 30px"><div class="kicker" style="font-size:22px;color:#8b919a">Angewendete Regeln</div><div class="row" style="flex-wrap:wrap;gap:14px;margin-top:18px">' + FIL.map(function (f) { return '<span class="chip" style="font-size:26px;padding:8px 18px">' + f + '</span>'; }).join('') + '</div></div>' +
          ['A', 'B', 'C'].map(function (n, i) { return '<div id="ar' + i + '" class="card abs row" style="left:0;right:0;top:' + (260 + i * 128) + 'px;padding:22px 30px;gap:22px;opacity:0"><span class="tile" style="width:74px;height:74px">' + I('discover') + '</span><span style="font-weight:900;font-size:38px">Aktie ' + n + '</span><svg viewBox="0 0 24 24" style="width:46px;height:46px;margin-left:auto;color:#5cc850"><path class="ic" stroke-width="2.6" d="M5 12 L10 17 L19 7"/></svg></div>'; }).join(''),
        anim: function (t, k, a) { var r = k.ev('rules', a + 2); for (var i = 0; i < 3; i++) k.pop('ar' + i, t, r + i * .3, 24); } },
      { hl: 'Deine Frage.<br><span class="lime">Unsere Daten.</span>',
        html: '<div id="aapp" class="card abs row" style="left:0;right:0;top:40px;padding:34px;gap:30px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + SPARK + '</span><div><div class="big lime" style="font-size:72px">AI Atlas</div><div class="lab" style="margin-top:6px">Frag in eigenen Worten</div></div></div>',
        anim: function (t, k, a) { k.zoom('aapp', t, a + .2, .6); } }
    ]
  });
})();
