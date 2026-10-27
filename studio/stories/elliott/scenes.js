/* Erklaervideo "Wellen" (Elliott): 5 + 3 Wellen, nur belastbare Zaehlungen, Invalidierung, Welle 3 und Neues. */
(function () {
  var I = Story.icon;
  function app(id, ic, name, sub) { return '<div id="' + id + '" class="card abs row" style="left:0;right:0;top:40px;padding:34px;gap:30px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + I(ic) + '</span><div><div class="big lime" style="font-size:72px">' + name + '</div><div class="lab" style="margin-top:6px">' + sub + '</div></div></div>'; }
  var P = [[20, 560], [150, 360], [230, 450], [470, 150], [560, 260], [700, 90], [770, 230], [830, 170], [920, 330]];
  var LAB = ['', '1', '2', '3', '4', '5', 'A', 'B', 'C'];
  var path = P.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
  var labels = P.map(function (p, i) { return i ? '<g id="el' + i + '" opacity="0"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="12" fill="' + (i > 5 ? '#ff6b5e' : '#c8f531') + '"/><text x="' + p[0] + '" y="' + (p[1] + (i % 2 ? -32 : 58)) + '" text-anchor="middle" font-family="Inter" font-weight="900" font-size="44" fill="' + (i > 5 ? '#ff6b5e' : '#c8f531') + '">' + LAB[i] + '</text></g>' : ''; }).join('');
  var sine = ''; for (var x = 0; x <= 952; x += 8) sine += (x ? 'L' : 'M') + x + ' ' + (320 + Math.sin(x / 70) * 120 * (0.6 + x / 2400)).toFixed(0);
  var messy = ''; for (var m = 0; m <= 400; m += 10) messy += (m ? 'L' : 'M') + m + ' ' + (120 + Math.sin(m * .21) * 40 + Math.cos(m * .53) * 30).toFixed(0);

  Story.define({
    kicker: 'Elliott', finKick: 'Elliott', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Märkte bewegen<br>sich in <span class="lime">Wellen.</span>',
        html: '<svg class="abs" style="left:0;top:40px" width="952" height="640" viewBox="0 0 952 640"><path class="dr" id="ew" pathLength="1" d="' + sine + '" stroke="#c8f531" stroke-width="7"/></svg>',
        anim: function (t, k) { k.draw('ew', t, 0, 1.6); } },
      { hl: '<span class="lime">5</span> mit dem Trend.<br><span class="red">3</span> dagegen.',
        html: '<svg class="abs" style="left:0;top:20px" width="952" height="660" viewBox="0 0 952 660"><path class="dr" id="ep" pathLength="1" d="' + path + '" stroke="#f4f5f1" stroke-width="6"/>' + labels + '</svg>',
        anim: function (t, k, a) { var w = k.ev('waves', a + 2), c = k.ev('abc', w + 1.2); k.draw('ep', t, a + .1, 2.6); for (var i = 1; i < 9; i++) { var at = i <= 5 ? w - .6 + i * .22 : c - .2 + (i - 6) * .3; k.$('el' + i).style.opacity = k.seg(t, at, at + .15); } } },
      { hl: 'Nur wenn es<br><span class="lime">belastbar</span> ist.',
        html: '<div class="card abs" style="left:0;width:452px;top:0;height:420px;padding:28px;border-color:rgba(200,245,49,.5)"><div class="kicker" style="font-size:22px">Belastbar</div><svg width="396" height="240" viewBox="0 0 400 240" style="margin-top:20px"><path class="dr" id="eg" pathLength="1" d="M0 220 L70 130 L110 170 L230 40 L270 90 L360 10" stroke="#c8f531" stroke-width="7"/></svg></div>' +
          '<div id="ebad" class="card abs" style="left:500px;right:0;top:0;height:420px;padding:28px;opacity:0"><div class="kicker" style="font-size:22px;color:#8b919a">Unklar</div><svg width="396" height="240" viewBox="0 0 400 240" style="margin-top:20px"><path d="' + messy + '" fill="none" stroke="#5a616b" stroke-width="6"/></svg></div>' +
          '<div id="enz" class="abs" style="left:500px;right:0;top:450px;text-align:center;opacity:0"><span class="chip" style="color:#c3c7cc">Keine Zählung</span></div>',
        anim: function (t, k, a) { k.draw('eg', t, a + .2, 1.2); var h = k.ev('honest', a + 2.5); k.pop('ebad', t, h - .6, 24); k.pop('enz', t, h + .4, 16); } },
      { hl: 'Jedes Szenario.<br>Eine <span class="lime">Grenze.</span>',
        html: '<svg class="abs" style="left:0;top:20px" width="952" height="640" viewBox="0 0 952 640"><path class="dr" id="ei" pathLength="1" d="M0 520 L180 300 L300 400 L520 140 L640 260" stroke="#f4f5f1" stroke-width="6"/><line id="eline" x1="0" x2="952" y1="440" y2="440" stroke="#ff6b5e" stroke-width="5" stroke-dasharray="20 14" opacity="0"/><text id="etx" x="952" y="420" text-anchor="end" font-family="Inter" font-weight="900" font-size="36" fill="#ff6b5e" opacity="0">Invalidierung</text><path id="edrop" class="dr" pathLength="1" d="M640 260 L760 340 L860 480" stroke="#ff6b5e" stroke-width="6"/><g id="ex" opacity="0"><circle cx="860" cy="480" r="38" fill="rgba(255,107,94,.2)"/><path d="M842 462 L878 498 M878 462 L842 498" stroke="#ff6b5e" stroke-width="7" stroke-linecap="round"/></g></svg>',
        anim: function (t, k, a) { k.draw('ei', t, a + .1, 1.2); k.$('eline').style.opacity = k.seg(t, a + .9, a + 1.2); k.$('etx').style.opacity = k.seg(t, a + 1.1, a + 1.4); var v = k.ev('inv', a + 2.6); k.draw('edrop', t, v, .9); k.$('ex').style.opacity = k.seg(t, v + .8, v + 1); } },
      { hl: 'Welle 3.<br><span class="lime">Auf und ab.</span>',
        html: '<div class="abs" style="left:0;right:0;top:0;display:flex;flex-direction:column;gap:22px;align-items:flex-start">' +
          [['Welle 3', 'M4 18 L10 8 L14 13 L20 4'], ['Aufwärts', 'M5 19 L19 5 M10 5 H19 V14'], ['Abwärts', 'M5 5 L19 19 M19 10 V19 H10'], ['Neu und verändert', 'M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z']].map(function (c, i) { return '<span id="ec' + i + '" class="chip" style="font-size:44px;padding:20px 36px;opacity:0"><svg viewBox="0 0 24 24" style="width:48px;height:48px"><path class="ic" d="' + c[1] + '"/></svg>' + c[0] + '</span>'; }).join('') + '</div>',
        anim: function (t, k, a) { var w = k.ev('w3', a + 1.4), n = k.ev('new', w + 1.4); k.pop('ec0', t, a + .2, 24); k.pop('ec1', t, w, 24); k.pop('ec2', t, w + .4, 24); k.pop('ec3', t, n, 24); } },
      { hl: 'Experimentell und<br><span class="lime">transparent.</span>', html: app('eapp', 'elliott', 'Elliott', 'Wellenstruktur mit Invalidierung'),
        anim: function (t, k, a) { k.zoom('eapp', t, a + .2, .6); } }
    ]
  });
})();
