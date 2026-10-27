/* Erklaervideo "Investoren" (Hedgefonds): Depots grosser Investoren, Kaeufe und Verkaeufe, Pflichtmeldungen je Quartal, wer eine Aktie haelt. */
(function () {
  var I = Story.icon;
  function app(id, ic, name, sub) { return '<div id="' + id + '" class="card abs row" style="left:0;right:0;top:40px;padding:34px;gap:30px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + I(ic) + '</span><div><div class="big lime" style="font-size:72px">' + name + '</div><div class="lab" style="margin-top:6px">' + sub + '</div></div></div>'; }
  // Keine Fotos oder Nachbildungen: Initialen in neutralen Kreisen
  function av(ini, size) { return '<span style="display:grid;place-items:center;flex:none;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:#16191d;border:3px solid #c8f531;font-weight:900;font-size:' + (size * .36) + 'px;color:#c8f531">' + ini + '</span>'; }
  var INV = [['WB', 'Warren Buffett'], ['BA', 'Bill Ackman'], ['MB', 'Michael Burry']];
  var invs = INV.map(function (v, i) { return '<div id="hi' + i + '" class="card row" style="padding:24px 28px;gap:24px;opacity:0">' + av(v[0], 96) + '<div><div style="font-weight:900;font-size:42px">' + v[1] + '</div><div class="lab" style="font-size:26px">Depot · 13F</div></div></div>'; }).join('');
  var POS = [['Aktie A', 'Kauf', '#5cc850', 'M12 19 V5 M5 12 L12 5 L19 12'], ['Aktie B', 'Verkauf', '#ff6b5e', 'M12 5 V19 M5 12 L12 19 L19 12'], ['Aktie C', 'Aufgestockt', '#5cc850', 'M12 19 V5 M5 12 L12 5 L19 12'], ['Aktie D', 'Neu', '#c8f531', 'M12 5 V19 M5 12 H19']];
  var pos = POS.map(function (p, i) { return '<div id="hp' + i + '" class="card row" style="padding:22px 28px;gap:22px;opacity:0"><span style="font-weight:900;font-size:40px">' + p[0] + '</span><span class="chip" style="margin-left:auto;font-size:28px;padding:10px 20px;color:' + p[2] + ';border-color:' + p[2] + '"><svg viewBox="0 0 24 24" style="color:' + p[2] + '"><path class="ic" stroke-width="2.6" d="' + p[3] + '"/></svg>' + p[1] + '</span></div>'; }).join('');
  var QS = ['Q1', 'Q2', 'Q3', 'Q4'];

  Story.define({
    kicker: 'Hedgefonds', finKick: 'Hedgefonds', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Was kauft<br>Warren <span class="lime">Buffett?</span>',
        html: '<div id="htm" class="abs" style="left:50%;top:-10px;margin-left:-330px;width:660px;height:660px;background:url(/assets/hero-visuals/hedgefonds.webp) center/cover;-webkit-mask-image:radial-gradient(circle at 50% 45%,#000 42%,transparent 68%);mask-image:radial-gradient(circle at 50% 45%,#000 42%,transparent 68%)"></div>',
        anim: function (t, k) { k.$('htm').style.opacity = k.seg(t, 0, .4); k.$('htm').style.transform = 'scale(' + (.9 + .1 * k.eo(k.seg(t, 0, 1.6))) + ')'; } },
      { hl: 'Die Depots der<br><span class="lime">Großen.</span>',
        html: '<div class="abs" style="left:0;right:0;top:0;display:flex;flex-direction:column;gap:20px">' + invs + '</div><div id="hmore" class="abs" style="left:0;right:0;top:520px;text-align:center;opacity:0"><span class="chip">' + I('hedgefonds') + 'und über 100 weitere</span></div>',
        anim: function (t, k, a) { var n = k.ev('names', a + 2), m = k.ev('more', n + 1.5); for (var i = 0; i < 3; i++) k.pop('hi' + i, t, n - .3 + i * .45, 30); k.pop('hmore', t, m, 20); } },
      { hl: 'Jeder Kauf.<br><span class="lime">Jeder Verkauf.</span>', html: '<div class="abs" style="left:0;right:0;top:0;display:flex;flex-direction:column;gap:18px">' + pos + '</div>',
        anim: function (t, k, a) { var b = k.ev('buy', a + 1); for (var i = 0; i < 4; i++) k.pop('hp' + i, t, (i ? b : a + .2) + i * .35, 30); } },
      { hl: 'Quartal für<br><span class="lime">Quartal.</span>',
        html: '<div class="card abs row" style="left:0;right:0;top:0;padding:30px;gap:26px"><svg width="96" height="96" viewBox="0 0 24 24" style="color:#c8f531;flex:none"><path class="ic" d="M6 3 H15 L19 7 V21 H6 Z M9 11 H16 M9 15 H16 M9 18 H13"/></svg><div><div style="font-weight:900;font-size:42px">Pflichtmeldung 13F</div><div class="lab" style="font-size:28px">Börsenaufsicht SEC · je Quartal</div></div></div>' +
          '<svg class="abs" style="left:0;top:300px" width="952" height="200" viewBox="0 0 952 200"><line x1="60" x2="892" y1="80" y2="80" stroke="rgba(255,255,255,.12)" stroke-width="8" stroke-linecap="round"/><line class="dr" id="hq" pathLength="1" x1="60" x2="892" y1="80" y2="80" stroke="#c8f531" stroke-width="8"/>' +
          QS.map(function (q, i) { var x = 60 + i * 277; return '<g id="hqd' + i + '" opacity="0"><circle cx="' + x + '" cy="80" r="26" fill="#08080a" stroke="#c8f531" stroke-width="6"/><text x="' + x + '" y="160" text-anchor="middle" font-family="Inter" font-weight="900" font-size="38" fill="#f4f5f1">' + q + '</text></g>'; }).join('') + '</svg>',
        anim: function (t, k, a) { var s = k.ev('sec', a + 2); k.draw('hq', t, s - .4, 1.6); for (var i = 0; i < 4; i++) k.$('hqd' + i).style.opacity = k.seg(t, s - .4 + i * .5, s - .3 + i * .5); } },
      { hl: 'Wer hält<br><span class="lime">die Aktie?</span>',
        html: '<svg class="abs" style="left:0;top:0" width="952" height="640" viewBox="0 0 952 640">' + [[150, 520], [476, 560], [802, 520]].map(function (p, i) { return '<line class="dr" id="hl' + i + '" pathLength="1" x1="476" y1="190" x2="' + p[0] + '" y2="' + (p[1] - 60) + '" stroke="#c8f531" stroke-width="4" stroke-opacity=".7"/>'; }).join('') + '</svg>' +
          '<div id="hst" class="card abs row" style="left:236px;width:480px;top:110px;padding:24px;gap:20px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:84px;height:84px">' + I('discover') + '</span><span style="font-weight:900;font-size:42px">Aktie A</span></div>' +
          [[150, 520, 'WB'], [476, 560, 'BA'], [802, 520, 'MB']].map(function (p, i) { return '<div id="ha' + i + '" class="abs" style="left:' + (p[0] - 50) + 'px;top:' + (p[1] - 60) + 'px;opacity:0">' + av(p[2], 100) + '</div>'; }).join(''),
        anim: function (t, k, a) { k.pop('hst', t, a + .2, 20); var w = k.ev('who', a + 1.5); for (var i = 0; i < 3; i++) { k.draw('hl' + i, t, w + i * .25, .5); k.pop('ha' + i, t, w + .3 + i * .25, 20); } } },
      { hl: 'Lerne von<br>den <span class="lime">Großen.</span>', html: app('happ', 'hedgefonds', 'Hedgefonds', 'Depots, Käufe und Verkäufe'),
        anim: function (t, k, a) { k.zoom('happ', t, a + .2, .6); } }
    ]
  });
})();
