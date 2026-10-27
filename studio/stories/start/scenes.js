/* Erklaervideo "Start": THE ARRIVAL (Film des Owners) mit Motion Graphics, danach dunkler Grund. Render mit ?ovl=1. */
(function () {
  var I = Story.icon;
  function corner(id, d) { return '<path class="dr" id="' + id + '" pathLength="1" stroke="#c8f531" stroke-width="5" d="' + d + '"/>'; }
  var hud = '<svg class="abs" style="left:0;top:0" width="952" height="760" viewBox="0 0 952 760">' + corner('h1', 'M0 90 V0 H90') + corner('h2', 'M862 0 H952 V90') + corner('h3', 'M952 670 V760 H862') + corner('h4', 'M90 760 H0 V670') + '<line id="hscan" x1="0" x2="952" y1="0" y2="0" stroke="rgba(200,245,49,.55)" stroke-width="3"/></svg>' +
    '<div id="hchips" class="abs row" style="left:0;right:0;top:620px;justify-content:center;gap:16px;opacity:0"><span class="chip" style="font-size:30px;padding:12px 24px">Aktien</span><span class="chip" style="font-size:30px;padding:12px 24px">Analyse</span><span class="chip" style="font-size:30px;padding:12px 24px">Vorsorge</span></div>' +
    '<div id="hdata" class="abs" style="left:0;right:0;top:300px;text-align:center;opacity:0"><span class="chip" style="font-size:40px;border-color:#c8f531"><svg viewBox="0 0 24 24"><path class="ic" d="M4 6 C4 4 20 4 20 6 V18 C20 20 4 20 4 18 Z M4 6 C4 8 20 8 20 6 M4 12 C4 14 20 14 20 12"/></svg>Echte Daten</span></div>';
  var g = ''; for (var i = 0; i < 18 * 14; i++) g += '<i id="sg' + i + '" style="display:block;width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,.12)"></i>';
  var NET = [['discover', 'Discover'], ['fundamental', 'Zahlen'], ['technical', 'Charts'], ['quant', 'Faktoren'], ['supertrader', 'Strategien'], ['elliott', 'Elliott']];
  var cx = 476, cy = 360, R = 300, lines = '', nodes = '';
  NET.forEach(function (n, i) { var a = -Math.PI / 2 + i * Math.PI / 3, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    lines += '<line class="dr" id="sl' + i + '" pathLength="1" x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(0) + '" y2="' + y.toFixed(0) + '" stroke="#c8f531" stroke-width="4" stroke-opacity=".7"/>';
    nodes += '<div id="sn' + i + '" class="abs" style="left:' + (x - 70).toFixed(0) + 'px;top:' + (y - 70).toFixed(0) + 'px;width:140px;text-align:center;opacity:0"><span class="tile" style="width:140px;height:140px">' + I(n[0]) + '</span><div style="font-weight:800;font-size:28px;margin-top:10px">' + n[1] + '</div></div>'; });
  var net = '<svg class="abs" style="left:0;top:0" width="952" height="760" viewBox="0 0 952 760">' + lines + '</svg>' + nodes +
    '<div id="scen" class="abs" style="left:' + (cx - 95) + 'px;top:' + (cy - 95) + 'px;width:190px;height:190px;border-radius:50%;background:#0b0c0e;border:4px solid #c8f531;display:grid;place-items:center;color:#c8f531;box-shadow:0 0 90px rgba(200,245,49,.45)"><svg viewBox="0 0 24 24" style="width:100px;height:100px"><use href="#layers"/></svg></div>';
  var PER = [['Zahlen', 'fundamental'], ['Chart', 'technical'], ['Faktoren', 'quant'], ['Setups', 'supertrader']];
  var per = PER.map(function (p, i) { return '<div id="sp' + i + '" class="card" style="padding:24px 10px;opacity:0;display:flex;flex-direction:column;align-items:center;gap:14px;border-color:rgba(200,245,49,.5)"><span class="tile" style="width:96px;height:96px">' + I(p[1]) + '</span><span style="font-weight:900;font-size:32px">' + p[0] + '</span></div>'; }).join('');
  function ok(id, txt) { return '<div id="' + id + '" class="row" style="gap:22px;padding:18px 0;opacity:0"><svg width="58" height="58" viewBox="0 0 64 64" style="color:#c8f531;flex:none"><circle cx="32" cy="32" r="28" fill="rgba(200,245,49,.14)"/><path class="ic" stroke-width="6" d="M20 33 L29 42 L45 23"/></svg><span style="font-weight:800;font-size:44px">' + txt + '</span></div>'; }
  var COV = [['layers', ''], ['', '/assets/hero-visuals/discover.webp'], ['quant', ''], ['', '/assets/hero-visuals/supertrader.svg'], ['', '/assets/hero-visuals/vorsorge.webp']];
  var NAMES = ['Start', 'Entdecken', 'Quant', 'Zahlen', 'Strategie'];
  var circ = COV.map(function (c, i) { return '<div id="sc' + i + '" style="display:flex;flex-direction:column;align-items:center;gap:14px;opacity:0"><div style="position:relative;width:164px;height:164px;border-radius:50%;padding:7px;background:' + (i === 1 ? '#c8f531' : (i === 0 ? '#5a616b' : '#c8f531')) + '"><div style="width:100%;height:100%;border-radius:50%;box-shadow:0 0 0 5px #08080a;display:grid;place-items:center;color:#c8f531;background:#0b0c0e ' + (c[1] ? 'url(' + c[1] + ') center/cover' : '') + '">' + (c[0] ? '<svg viewBox="0 0 24 24" style="width:46%;height:46%"><use href="#' + c[0] + '"/></svg>' : '') + '</div><span style="position:absolute;right:-2px;bottom:-2px;width:52px;height:52px;border-radius:50%;background:' + (i === 1 ? '#c8f531' : '#fff') + ';display:grid;place-items:center;box-shadow:0 0 0 5px #08080a"><i style="margin-left:5px;border-style:solid;border-width:11px 0 11px 17px;border-color:transparent transparent transparent #08080a"></i></span></div><span style="font-weight:800;font-size:30px">' + NAMES[i] + '</span></div>'; }).join('');

  Story.define({
    kicker: 'Willkommen', finKick: 'Willkommen', finSub: 'Jedes Modul in 30 Sekunden', filmUntil: 20,
    scenes: [
      { hl: 'Willkommen bei<br><span class="lime">Vision Universe.</span>', html: hud,
        anim: function (t, k) { ['h1', 'h2', 'h3', 'h4'].forEach(function (id, i) { k.draw(id, t, .3 + i * .15, .6); });
          var y = ((t * 260) % 760); k.$('hscan').setAttribute('y1', y); k.$('hscan').setAttribute('y2', y); k.$('hscan').style.opacity = k.seg(t, .5, 1) * (1 - k.seg(t, 5, 5.6));
          k.pop('hchips', t, k.ev('a', 1.9), 24); k.pop('hdata', t, k.ev('b', 3.4), 24); } },
      { hl: '<span class="lime">Über 6.000</span><br>Aktien.',
        html: '<div class="abs" style="left:0;top:0;display:grid;grid-template-columns:repeat(18,18px);gap:30px 32px">' + g + '</div><div id="sref" class="abs" style="left:0;right:0;top:470px;text-align:center;opacity:0"><span class="chip" style="font-size:38px"><svg viewBox="0 0 24 24"><path class="ic" d="M20 12 A8 8 0 1 1 17.7 6.3 M20 4 V9 H15"/></svg>Jeden Tag aktualisiert</span></div>',
        anim: function (t, k, a) { for (var i = 0; i < 252; i++) { var col = i % 18, row = Math.floor(i / 18), w = (t - a) * 9 - (col + row) * .35, on = w > 0 && w < 2.2; k.$('sg' + i).style.background = on ? '#c8f531' : (w >= 2.2 ? 'rgba(200,245,49,.35)' : 'rgba(255,255,255,.12)'); k.$('sg' + i).style.transform = 'scale(' + (on ? 1.4 : 1) + ')'; } k.pop('sref', t, k.ev('grid', a + 2), 24); } },
      { hl: 'Ein Ort.<br><span class="lime">Alles verbunden.</span>', html: net,
        anim: function (t, k, a) { var n = k.ev('net', a + 3); k.zoom('scen', t, a + .2, .6); for (var i = 0; i < 6; i++) { k.pop('sn' + i, t, a + .5 + i * .3, 20); k.draw('sl' + i, t, n - .2 + i * .1, .5); } k.$('scen').style.boxShadow = '0 0 ' + (90 + 60 * k.pulse(t, n + .4, .9)) + 'px rgba(200,245,49,.5)'; } },
      { hl: 'Ein Tipp.<br><span class="lime">Jede Perspektive.</span>',
        html: '<div id="stap" class="card abs row" style="left:110px;right:110px;top:0;padding:28px;gap:24px"><span class="tile" style="width:90px;height:90px">' + I('discover') + '</span><div><div style="font-weight:900;font-size:40px">Aktie A</div><div class="lab" style="font-size:26px">Ein Tipp genügt</div></div></div><div id="srip" class="abs" style="left:50%;top:70px;width:40px;height:40px;margin-left:-20px;border-radius:50%;border:5px solid #c8f531;opacity:0"></div>' +
          '<div class="abs" style="left:0;right:0;top:300px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px">' + per + '</div>',
        anim: function (t, k, a) { var tp = k.ev('tap', a + 1.5), r = k.seg(t, tp - .5, tp + .1); k.$('srip').style.opacity = r > 0 && r < 1 ? 1 - r : 0; k.$('srip').style.transform = 'scale(' + (1 + r * 6) + ')'; for (var i = 0; i < 4; i++) k.pop('sp' + i, t, tp + i * .25, 40); } },
      { hl: 'Modelle.<br><span class="lime">Keine Beratung.</span>',
        html: '<div class="abs" style="left:0;top:0"><svg width="230" height="250" viewBox="0 0 64 70"><path class="dr" id="ssh" pathLength="1" stroke="#c8f531" stroke-width="3.4" d="M32 4 L58 14 V34 C58 52 46 62 32 66 C18 62 6 52 6 34 V14 Z"/><path class="dr" id="ssc" pathLength="1" stroke="#c8f531" stroke-width="4" d="M21 35 L29 43 L44 26"/></svg></div>' +
          '<div class="abs" style="left:290px;right:0;top:0">' + ok('so1', 'Echte Daten') + ok('so2', 'Feste Regeln') + ok('so3', 'Nachvollziehbar') + '</div>',
        anim: function (t, k, a) { k.draw('ssh', t, a + .1, 1); k.draw('ssc', t, a + .9, .5); var s = k.ev('shield', a + 2.4); k.pop('so1', t, s, 20); k.pop('so2', t, s + .5, 20); k.pop('so3', t, s + 1, 20); } },
      { hl: 'Tippe auf den<br><span class="lime">nächsten Kreis.</span>',
        html: '<div class="abs" style="left:-30px;right:-30px;top:40px;display:flex;justify-content:space-between">' + circ + '</div><div id="sring" class="abs" style="left:236px;top:72px;width:150px;height:150px;border-radius:50%;border:5px solid #c8f531;opacity:0"></div>' +
          '<div id="s30" class="abs" style="left:0;right:0;top:400px;text-align:center;opacity:0"><span class="chip" style="font-size:40px"><svg viewBox="0 0 24 24"><circle class="ic" cx="12" cy="12" r="9"/><path class="ic" d="M12 7 V12 L15 14"/></svg>Jedes Modul in 30 Sekunden</span></div>',
        anim: function (t, k, a) { for (var i = 0; i < 5; i++) k.pop('sc' + i, t, a + .2 + i * .12, 30); var n = k.ev('next', a + 2), r = ((t - a - .8) % 1.2) / 1.2; k.$('sring').style.opacity = t > a + .8 ? (1 - r) * .9 : 0; k.$('sring').style.transform = 'scale(' + (1 + r * .6) + ')'; k.$('sc1').style.transform = 'scale(' + (1 + .06 * Math.sin(t * 6)) + ')'; k.pop('s30', t, n, 24); } }
    ]
  });
})();
