/* Erklaervideo "Vorsorge": Vorsorgeluecke, ETFs und Kosten, Portfolio-Roentgen, Foerderrechner. Analyse statt Produktverkauf. */
(function () {
  var I = Story.icon;
  function app(id, ic, name, sub) { return '<div id="' + id + '" class="card abs row" style="left:0;right:0;top:40px;padding:34px;gap:30px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + I(ic) + '</span><div><div class="big lime" style="font-size:72px">' + name + '</div><div class="lab" style="margin-top:6px">' + sub + '</div></div></div>'; }
  var A = [], B = []; for (var i = 0; i <= 30; i++) { var g = 420 - Math.pow(i / 30, 1.6) * 330 + Math.sin(i * 1.3) * 10; A.push((i * 31).toFixed(0) + ',' + g.toFixed(0)); B.push((i * 31).toFixed(0) + ',' + (g + Math.pow(i / 30, 1.6) * 110).toFixed(0)); }
  var area = 'M' + A.join(' L') + ' L' + B.slice().reverse().join(' L') + ' Z';
  var SEG = [[.34, '#c8f531', 'Technologie'], [.22, '#8fd61f', 'Finanzen'], [.18, '#5a7d16', 'Gesundheit'], [.14, '#3a4048', 'Industrie'], [.12, '#5a616b', 'Weitere']];
  var off = 0, donut = SEG.map(function (s, i) { var r = '<circle id="vd' + i + '" cx="200" cy="200" r="150" fill="none" stroke="' + s[1] + '" stroke-width="64" pathLength="1" stroke-dasharray="0 1" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 200 200)"/>'; off += s[0]; return r; }).join('');
  var legend = SEG.map(function (s, i) { return '<div id="vl' + i + '" class="row lab" style="gap:14px;margin-bottom:16px;opacity:0"><i style="width:26px;height:26px;border-radius:6px;background:' + s[1] + ';display:inline-block"></i>' + s[2] + '</div>'; }).join('');

  Story.define({
    kicker: 'Vorsorge', finKick: 'Vorsorge', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Reicht deine<br><span class="lime">Rente?</span>',
        html: '<div id="vp" class="abs" style="left:50%;top:-20px;margin-left:-330px;width:660px;height:660px;background:url(/assets/hero-visuals/vorsorge.webp) center/cover;-webkit-mask-image:radial-gradient(circle at 50% 45%,#000 42%,transparent 68%);mask-image:radial-gradient(circle at 50% 45%,#000 42%,transparent 68%)"></div>',
        anim: function (t, k) { k.$('vp').style.opacity = k.seg(t, 0, .4); k.$('vp').style.transform = 'scale(' + (.9 + .1 * k.eo(k.seg(t, 0, 1.6))) + ')'; } },
      { hl: 'Deine<br><span class="lime">Vorsorgelücke.</span>',
        html: '<div class="abs row" style="left:80px;right:80px;top:0;height:600px;align-items:flex-end;gap:90px">' +
          '<div style="flex:1;text-align:center"><div style="height:520px;display:flex;align-items:flex-end"><div id="vb1" style="width:100%;height:0;border-radius:18px 18px 6px 6px;background:#5a616b"></div></div><div class="lab" style="margin-top:16px">Bedarf</div></div>' +
          '<div style="flex:1;text-align:center"><div style="height:520px;display:flex;flex-direction:column;justify-content:flex-end"><div id="vgap" style="height:0;border:4px dashed #ff6b5e;border-bottom:0;border-radius:18px 18px 0 0;background:rgba(255,107,94,.12);position:relative"><div id="vfill" style="position:absolute;left:0;right:0;bottom:0;height:0;background:#c8f531;border-radius:14px 14px 0 0"></div></div><div id="vb2" style="height:0;border-radius:0 0 6px 6px;background:#8b919a"></div></div><div class="lab" style="margin-top:16px">Rente</div></div></div>' +
          '<div id="vlbl" class="abs" style="left:0;right:0;top:640px;text-align:center;opacity:0"><span class="chip" style="color:#c8f531">Lücke schließen</span></div>',
        anim: function (t, k, a) { var e = k.eo(k.seg(t, a + .2, a + 1)); k.$('vb1').style.height = (480 * e) + 'px'; k.$('vb2').style.height = (300 * e) + 'px'; k.$('vgap').style.height = (180 * k.eo(k.seg(t, a + .9, a + 1.4))) + 'px'; var g = k.ev('gap', a + 2.5); k.$('vfill').style.height = (100 * k.eo(k.seg(t, g + .3, g + 1.6))) + '%'; k.pop('vlbl', t, g + .3, 16); } },
      { hl: 'ETFs und<br><span class="lime">Kosten.</span>',
        html: '<div class="card abs" style="left:0;right:0;top:0;padding:30px"><svg width="892" height="460" viewBox="0 0 930 460"><path id="varea" d="' + area + '" fill="rgba(255,107,94,.18)" opacity="0"/><polyline class="dr" id="vla" pathLength="1" points="' + A.join(' ') + '" stroke="#c8f531" stroke-width="5"/><polyline class="dr" id="vlb" pathLength="1" points="' + B.join(' ') + '" stroke="#8b919a" stroke-width="5"/></svg>' +
          '<div class="row" style="gap:28px;margin-top:6px"><span class="row lab" style="gap:10px;font-size:28px"><i style="width:26px;height:8px;border-radius:4px;background:#c8f531;display:inline-block"></i>ETF-Verlauf</span><span class="row lab" style="gap:10px;font-size:28px"><i style="width:26px;height:8px;border-radius:4px;background:#8b919a;display:inline-block"></i>nach Kosten</span><span id="vgeb" class="row lab" style="gap:10px;font-size:28px;color:#ff6b5e;opacity:0"><i style="width:26px;height:18px;border-radius:4px;background:rgba(255,107,94,.4);display:inline-block"></i>Gebühren</span></div></div>',
        anim: function (t, k, a) { k.draw('vla', t, a + .2, 1.6); var e = k.ev('etf', a + 2.4); k.draw('vlb', t, e + .4, 1.6); k.$('varea').style.opacity = k.seg(t, e + 1.6, e + 2.2); k.$('vgeb').style.opacity = k.seg(t, e + 1.8, e + 2.2); } },
      { hl: 'Was steckt<br>im <span class="lime">Fonds?</span>',
        html: '<div class="abs" style="left:0;top:20px"><svg width="400" height="400" viewBox="0 0 400 400">' + donut + '</svg></div><div class="abs" style="left:460px;right:0;top:80px">' + legend + '</div>',
        anim: function (t, k, a) { var x = k.ev('xray', a + 2) - 1.4; for (var i = 0; i < 5; i++) { var s = SEG[i][0] * k.eo(k.seg(t, x + i * .25, x + i * .25 + .6)); k.$('vd' + i).setAttribute('stroke-dasharray', s + ' ' + (1 - s)); k.pop('vl' + i, t, x + i * .25 + .2, 16); } } },
      { hl: 'Staatliche<br><span class="lime">Förderung.</span>',
        html: '<div class="abs row" style="left:0;top:0;gap:18px;align-items:flex-end;height:330px">' + [0, 1, 2, 3, 4].map(function (i) { return '<div style="display:flex;flex-direction:column-reverse;gap:8px">' + [0, 1, 2, 3, 4].slice(0, i + 1).map(function (j) { return '<i id="vc' + i + j + '" style="display:block;width:120px;height:34px;border-radius:50%;background:#c8f531;box-shadow:inset 0 -6px 0 #7fae12;opacity:0"></i>'; }).join('') + '</div>'; }).join('') + '</div>' +
          '<div id="vfr" class="card abs row" style="left:0;right:0;top:390px;padding:28px;gap:24px;opacity:0;border-color:rgba(200,245,49,.5)"><span class="tile" style="width:96px;height:96px">' + I('vorsorge') + '</span><div><div style="font-weight:900;font-size:42px">Förderrechner</div><div class="lab" style="font-size:28px">Zulagen und Förderung berechnet</div></div></div>',
        anim: function (t, k, a) { for (var i = 0; i < 5; i++) for (var j = 0; j <= i; j++) { var at = a + .2 + (i * 3 + j) * .07; k.$('vc' + i + j).style.opacity = k.seg(t, at, at + .1); k.$('vc' + i + j).style.transform = 'translateY(' + ((1 - k.eo(k.seg(t, at, at + .25))) * -60) + 'px)'; } k.pop('vfr', t, k.ev('foerd', a + 2), 24); } },
      { hl: 'Analyse statt<br><span class="lime">Produktverkauf.</span>', html: app('vapp', 'vorsorge', 'Vorsorge', 'Lücke, ETFs, Kosten, Förderung'),
        anim: function (t, k, a) { k.zoom('vapp', t, a + .2, .6); } }
    ]
  });
})();
