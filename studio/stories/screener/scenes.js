/* Erklaervideo "Filter" (Screener): eigene Kriterien, Gewichtung, technische Filter, Vergleich, Speichern und Watchlist. */
(function () {
  var I = Story.icon;
  function app(id, ic, name, sub) { return '<div id="' + id + '" class="card abs row" style="left:0;right:0;top:40px;padding:34px;gap:30px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + I(ic) + '</span><div><div class="big lime" style="font-size:72px">' + name + '</div><div class="lab" style="margin-top:6px">' + sub + '</div></div></div>'; }
  var FL = [['Umsatzwachstum', 70], ['Nettomarge', 55], ['Bewertung (KGV)', 40]];
  var filters = FL.map(function (f, i) { return '<div id="sf' + i + '" class="card" style="padding:24px 30px;opacity:0"><div class="row" style="justify-content:space-between"><span style="font-weight:800;font-size:36px">' + f[0] + '</span><span class="row lab" style="font-size:26px;gap:8px">Gewicht <b id="sw' + i + '" style="color:#c8f531">0</b></span></div><div style="position:relative;height:14px;margin-top:22px;border-radius:7px;background:rgba(255,255,255,.08)"><i id="sfb' + i + '" style="position:absolute;left:0;top:0;bottom:0;width:0;border-radius:7px;background:#c8f531"></i><i id="sfk' + i + '" style="position:absolute;top:-12px;left:0;width:38px;height:38px;margin-left:-19px;border-radius:50%;background:#f4f5f1;border:5px solid #c8f531"></i></div></div>'; }).join('');
  var C1 = ['KGV', 'Nettomarge', 'Wachstum', 'Dividende'], C2 = ['Trend', 'Momentum', '200-Tage-Linie', 'Chartformation'];
  var chips = C1.map(function (c, i) { return '<span id="sca' + i + '" class="chip" style="opacity:0">' + c + '</span>'; }).join('') + C2.map(function (c, i) { return '<span id="scb' + i + '" class="chip" style="opacity:0;border-color:#c8f531;color:#c8f531">' + c + '</span>'; }).join('');
  var ROWS = ['Umsatzwachstum', 'Nettomarge', 'Bewertung', 'Kursstärke'], V = [[.8, .5, .6], [.6, .9, .4], [.4, .5, .8], [.9, .6, .5]];
  var table = '<div class="card abs" style="left:0;right:0;top:0;padding:28px 30px"><div class="row" style="padding-left:300px;gap:0">' + ['A', 'B', 'C'].map(function (n) { return '<span style="flex:1;font-weight:900;font-size:34px;text-align:center">Aktie ' + n + '</span>'; }).join('') + '</div>' +
    ROWS.map(function (r, i) { return '<div id="st' + i + '" class="row" style="gap:0;padding:22px 0;border-top:1px solid rgba(255,255,255,.07);opacity:0"><span style="width:300px;font-weight:800;font-size:30px">' + r + '</span>' + V[i].map(function (v, j) { return '<span style="flex:1;padding:0 14px"><span class="bar" style="display:block;height:18px"><i id="stb' + i + j + '" style="' + (v === Math.max.apply(null, V[i]) ? '' : 'background:#5a616b') + '"></i></span></span>'; }).join('') + '</div>'; }).join('') + '</div>';

  Story.define({
    kicker: 'Screener', finKick: 'Screener', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Tausende Aktien.<br><span class="lime">Deine Kriterien.</span>',
        html: '<div id="sfun" class="abs" style="left:50%;top:-10px;margin-left:-330px;width:660px;height:660px;background:url(/assets/hero-visuals/screener.webp) center/cover;-webkit-mask-image:radial-gradient(circle at 50% 45%,#000 45%,transparent 70%);mask-image:radial-gradient(circle at 50% 45%,#000 45%,transparent 70%)"></div>',
        anim: function (t, k) { k.$('sfun').style.transform = 'scale(' + (.85 + .15 * k.eo(k.seg(t, 0, 2))) + ')'; k.$('sfun').style.opacity = k.seg(t, 0, .4); } },
      { hl: 'Dein eigenes<br><span class="lime">Universum.</span>', html: '<div class="abs" style="left:0;right:0;top:0;display:flex;flex-direction:column;gap:20px">' + filters + '</div>',
        anim: function (t, k, a) { var f = k.ev('f', a + 1.5), w = k.ev('w', f + 1); for (var i = 0; i < 3; i++) { k.pop('sf' + i, t, f - .3 + i * .25, 24); var x = FL[i][1] * k.eo(k.seg(t, w + i * .3, w + i * .3 + .8)); k.$('sfb' + i).style.width = x + '%'; k.$('sfk' + i).style.left = x + '%'; k.$('sw' + i).textContent = Math.round(x / 10); } } },
      { hl: 'Jetzt auch<br><span class="lime">Chartformationen.</span>', html: '<div class="abs" style="left:0;right:0;top:0;display:flex;flex-wrap:wrap;gap:20px">' + chips + '</div>',
        anim: function (t, k, a) { var c = k.ev('tech', a + 2); for (var i = 0; i < 4; i++) { k.pop('sca' + i, t, a + .3 + i * .25, 20); k.pop('scb' + i, t, c + i * .3, 20); } } },
      { hl: 'Vergleiche<br><span class="lime">direkt.</span>', html: table,
        anim: function (t, k, a) { var c = k.ev('cmp', a + 1.5); for (var i = 0; i < 4; i++) { k.pop('st' + i, t, a + .2 + i * .2, 16); for (var j = 0; j < 3; j++) k.fill('stb' + i + j, t, c - .6 + i * .2, V[i][j] * 100, .8); } } },
      { hl: 'Speichern.<br><span class="lime">Watchlist.</span>',
        html: '<div id="ssv" class="card abs row" style="left:0;right:0;top:0;padding:30px;gap:26px;opacity:0"><svg width="90" height="90" viewBox="0 0 24 24" style="color:#c8f531;flex:none"><path class="ic" d="M6 3 H18 V21 L12 16 L6 21 Z"/></svg><div><div style="font-weight:900;font-size:42px">Meine Suche</div><div class="lab" style="font-size:28px">3 Filter · gespeichert</div></div></div>' +
          '<div id="swl" class="card abs row" style="left:0;right:0;top:200px;padding:30px;gap:26px;opacity:0"><svg width="90" height="90" viewBox="0 0 24 24" style="flex:none"><path id="sheart" d="M12 21 C6 16 3 13 3 9 A5 5 0 0 1 12 6 A5 5 0 0 1 21 9 C21 13 18 16 12 21 Z" fill="rgba(200,245,49,0)" stroke="#c8f531" stroke-width="2"/></svg><div><div style="font-weight:900;font-size:42px">Watchlist</div><div class="lab" style="font-size:28px">Aktie A hinzugefügt</div></div></div>',
        anim: function (t, k, a) { k.pop('ssv', t, a + .2, 24); var s = k.ev('save', a + 1.6); k.pop('swl', t, s, 24); k.$('sheart').style.fill = 'rgba(200,245,49,' + k.seg(t, s + .5, s + .8) + ')'; } },
      { hl: 'Aus Tausenden<br>deine <span class="lime">Auswahl.</span>', html: app('sapp', 'screener', 'Screener', 'Filtern, gewichten, vergleichen'),
        anim: function (t, k, a) { k.zoom('sapp', t, a + .2, .6); } }
    ]
  });
})();
