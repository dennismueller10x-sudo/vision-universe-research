/* Erklaervideo "Zahlen" (Fundamental): 60 Kennzahlen in 7 Bereichen, Quelle je Wert, Verlauf, Branchenvergleich. */
(function () {
  var I = Story.icon;
  var CATS = [
    ['Wachstum', 'M4 18 L10 12 L14 16 L21 8 M15 8 H21 V14'],
    ['Gewinn & Verlust', 'M5 4 H19 V20 H5 Z M8 9 H16 M8 13 H16 M8 17 H12'],
    ['Profitabilität', 'M6 18 L18 6 M7 7 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M17 17 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0'],
    ['Cashflow', 'M3 9 C7 5 10 13 14 9 C17 6 19 8 21 9 M3 15 C7 11 10 19 14 15 C17 12 19 14 21 15'],
    ['Bilanz', 'M12 4 V20 M5 8 H19 M5 8 L2 14 H8 Z M19 8 L16 14 H22 Z M8 20 H16'],
    ['Aktie & Dividende', 'M12 3 A9 9 0 1 0 21 12 H12 Z M14 3 A7 7 0 0 1 21 10 H14 Z'],
    ['Bewertung', 'M3 12 L12 3 H21 V12 L12 21 Z M16 8 h.01']
  ];
  var tiles = CATS.map(function (c, i) { return '<div id="fc' + i + '" class="card" style="padding:22px 18px;opacity:0;display:flex;flex-direction:column;gap:14px;align-items:flex-start"><span class="tile" style="width:76px;height:76px"><svg viewBox="0 0 24 24"><path class="ic" stroke-width="2" d="' + c[1] + '"/></svg></span><span style="font-weight:800;font-size:30px;line-height:1.1">' + c[0] + '</span></div>'; }).join('');
  var H = [38, 44, 52, 49, 61, 70, 66, 78, 88, 96], bars = H.map(function (h, i) { return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%"><div id="fb' + i + '" style="height:0;border-radius:10px 10px 4px 4px;background:linear-gradient(180deg,#c8f531,#7fae12)"></div></div>'; }).join('');
  var line = H.map(function (h, i) { return (i * 86 + 40) + ',' + (440 - (h * .55 + 18 + Math.sin(i) * 14) * 4.2).toFixed(0); }).join(' ');

  Story.define({
    kicker: 'Fundamental', finKick: 'Fundamental', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Verdient es<br>wirklich <span class="lime">Geld?</span>',
        html: '<div class="abs" style="left:50%;top:40px;margin-left:-300px"><svg width="600" height="600" viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="rgba(200,245,49,.07)"/><circle class="dr" id="fco" pathLength="1" cx="32" cy="32" r="27" stroke="#c8f531" stroke-width="2"/><circle class="dr" id="fci" pathLength="1" cx="32" cy="32" r="21" stroke="rgba(200,245,49,.5)" stroke-width="1"/><text id="fq" x="32" y="44" text-anchor="middle" font-family="Inter" font-weight="900" font-size="34" fill="#c8f531">?</text></svg></div>',
        anim: function (t, k) { k.draw('fco', t, 0, 1); k.draw('fci', t, .3, 1); var s = 1 + .08 * Math.sin(t * 5); k.$('fq').style.transformOrigin = '32px 32px'; k.$('fq').style.transform = 'scale(' + s + ')'; } },
      { hl: '<span class="lime" id="f60">60</span> Kennzahlen.<br>7 Bereiche.',
        html: '<div class="abs" style="left:0;right:0;top:0;display:grid;grid-template-columns:repeat(3,1fr);gap:20px">' + tiles + '</div>',
        anim: function (t, k, a) { var c = k.ev('cats', a + 2), c2 = k.ev('c', c + 1); k.count('f60', t, a + .1, 1.6, 0, 60); for (var i = 0; i < 7; i++) k.pop('fc' + i, t, (i < 3 ? c : c2) + (i < 3 ? i : i - 3) * .32, 30); } },
      { hl: 'Aus den<br><span class="lime">Pflichtmeldungen.</span>',
        html: '<div class="card abs" style="left:0;width:470px;top:0;height:600px;padding:40px"><div class="kicker" style="font-size:22px;color:#8b919a">Jahresbericht</div>' +
          [80, 92, 70, 88, 60, 84, 76].map(function (w, i) { return '<div style="height:16px;border-radius:8px;background:rgba(255,255,255,.1);margin-top:' + (i ? 26 : 40) + 'px;width:' + w + '%"></div>'; }).join('') +
          '<div id="fhl" class="abs" style="left:30px;right:30px;top:270px;height:60px;border-radius:12px;border:3px solid #c8f531;background:rgba(200,245,49,.12);opacity:0"></div></div>' +
          '<svg class="abs" style="left:470px;top:290px" width="90" height="40" viewBox="0 0 90 40"><path class="dr" id="farr" pathLength="1" stroke="#c8f531" stroke-width="5" d="M4 20 H80 M64 6 L80 20 L64 34"/></svg>' +
          '<div id="fval" class="card abs" style="left:575px;right:0;top:200px;padding:30px;border-color:rgba(200,245,49,.55);opacity:0"><div class="lab" style="font-size:28px">Umsatz</div><div class="big" style="font-size:66px;margin:10px 0 18px">Wert</div><span class="chip" style="font-size:24px;padding:8px 18px;color:#c8f531"><svg viewBox="0 0 24 24" style="width:26px;height:26px"><path class="ic" d="M5 12 L10 17 L19 7"/></svg>Quelle</span></div>',
        anim: function (t, k, a) { var s = k.ev('src', a + 2.5); k.pop('fhl', t, a + .9, 0); k.draw('farr', t, a + 1.3, .5); k.pop('fval', t, a + 1.7, 20); k.$('fval').style.boxShadow = '0 0 ' + (60 * k.pulse(t, s, .8)) + 'px rgba(200,245,49,.5)'; } },
      { hl: 'Jährlich &<br><span class="lime">quartalsweise.</span>',
        html: '<div class="row abs" style="left:0;top:0;gap:14px"><span id="fy" class="chip" style="font-size:28px;padding:10px 24px">Jahr</span><span id="fqq" class="chip" style="font-size:28px;padding:10px 24px">Quartal</span></div>' +
          '<div class="abs" style="left:0;right:0;top:110px;height:470px;display:flex;gap:22px;align-items:flex-end;border-bottom:2px solid rgba(255,255,255,.12)">' + bars + '</div>' +
          '<svg class="abs" style="left:0;top:110px" width="952" height="470" viewBox="0 0 952 470"><polyline class="dr" id="fl" pathLength="1" points="' + line + '" stroke="#f4f5f1" stroke-width="6" stroke-dasharray="1"/></svg>' +
          '<div id="flg" class="row abs" style="left:0;top:610px;gap:26px;opacity:0"><span class="row lab" style="gap:10px"><i style="width:26px;height:14px;border-radius:7px;background:#c8f531;display:inline-block"></i>Umsatz</span><span class="row lab" style="gap:10px"><i style="width:26px;height:6px;border-radius:3px;background:#f4f5f1;display:inline-block"></i>Gewinn</span></div>',
        anim: function (t, k, a) { for (var i = 0; i < 10; i++) { var at = a + .3 + i * .1; k.$('fb' + i).style.height = (H[i] * k.eo(k.seg(t, at, at + .5))) + '%'; }
          var on = t >= k.ev('chart', a + 1.6); k.$('fy').style.background = on ? 'rgba(17,20,24,.9)' : '#c8f531'; k.$('fy').style.color = on ? '#f4f5f1' : '#101318'; k.$('fqq').style.background = on ? '#c8f531' : 'rgba(17,20,24,.9)'; k.$('fqq').style.color = on ? '#101318' : '#f4f5f1';
          var m = k.ev('multi', a + 2.6); k.draw('fl', t, m, 1.2); k.pop('flg', t, m + .3, 16); } },
      { hl: 'Im Vergleich<br>zur <span class="lime">Branche.</span>',
        html: '<div class="card abs" style="left:0;right:0;top:0;padding:40px"><div class="kicker" style="font-size:24px;color:#8b919a">Nettomarge</div>' +
          '<div class="lab" style="margin:34px 0 14px">Unternehmen</div><div class="bar" style="height:40px;border-radius:20px"><i id="fp1" style="border-radius:20px"></i></div>' +
          '<div class="lab" style="margin:30px 0 14px">Branche (Median)</div><div class="bar" style="height:40px;border-radius:20px"><i id="fp2" style="border-radius:20px;background:#5a616b"></i></div></div>' +
          '<div class="abs" style="left:0;right:0;top:520px"><div class="row" style="justify-content:space-between" ><span class="lab mut" style="font-size:28px">schwächer</span><span class="lab mut" style="font-size:28px">stärker</span></div><div style="position:relative;height:18px;margin-top:16px;border-radius:9px;background:linear-gradient(90deg,#ff6b5e,#5a616b 50%,#c8f531)"><span id="fmk" style="position:absolute;top:-17px;left:0;width:52px;height:52px;margin-left:-26px;border-radius:50%;background:#f4f5f1;border:6px solid #c8f531;box-shadow:0 0 30px rgba(200,245,49,.6)"></span></div></div>',
        anim: function (t, k, a) { var p = k.ev('peer', a + 2.5); k.fill('fp1', t, a + .4, 78, 1); k.fill('fp2', t, a + .6, 52, 1); k.$('fmk').style.left = (50 + 28 * k.eo(k.seg(t, p, p + 1))) + '%'; } },
      { hl: 'Zahlen, die du<br><span class="lime">verstehst.</span>',
        html: '<div id="fapp" class="card abs row" style="left:0;right:0;top:40px;padding:34px;gap:30px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + I('fundamental') + '</span><div><div class="big lime" style="font-size:72px">Fundamental</div><div class="lab" style="margin-top:6px">60 Kennzahlen, Quelle zu jedem Wert</div></div></div>',
        anim: function (t, k, a) { k.zoom('fapp', t, a + .2, .6); } }
    ]
  });
})();
