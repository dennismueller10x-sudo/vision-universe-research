/* Erklaervideo "Entdecken" (Discover): Tausende Aktien, 54 Themenwelten, Feed, Rankings, Maerkte, Analyse mit einem Tipp. */
(function () {
  var I = Story.icon;
  var grid = ''; for (var i = 0; i < 22 * 20; i++) grid += '<i id="dg' + i + '" style="display:block;width:16px;height:16px;border-radius:50%;background:#262b31"></i>';
  var TH = ['Künstliche Intelligenz', 'Halbleiter & Chips', 'Robotik', 'Cybersecurity', 'Rechenzentren', 'Quantencomputing', 'Elektromobilität', 'Wasserstoff', 'Biotechnologie', 'Erneuerbare Energien', 'Raumfahrt'];
  var chips = TH.map(function (n, i) { return '<span id="dt' + i + '" class="chip" style="opacity:0;font-size:32px;padding:14px 26px' + (i === TH.length - 1 ? ';border-color:#c8f531;color:#c8f531' : '') + '">' + n + '</span>'; }).join('');
  function spark(id, pts, w, h, col) { return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline class="dr" id="' + id + '" pathLength="1" points="' + pts + '" stroke="' + (col || '#c8f531') + '" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>'; }
  var P1 = '0,32 12,28 22,30 34,20 46,22 58,14 70,16 82,8 100,4', P2 = '0,20 14,24 26,18 38,22 50,14 62,18 74,12 86,16 100,10', P3 = '0,28 12,26 24,30 36,22 48,24 60,18 72,22 84,14 100,12';
  var cards = ['A', 'B', 'C', 'D', 'E'].map(function (n, i) { return '<div id="dc' + i + '" class="card abs" style="left:24px;right:24px;top:100px;height:560px;padding:32px;background:#13171b"><div class="row"><span class="tile" style="width:84px;height:84px">' + I(['discover', 'technical', 'fundamental', 'quant', 'elliott'][i]) + '</span><div><div style="font-weight:900;font-size:40px">Aktie ' + n + '</div><div class="lab" style="font-size:26px">Themenwelt · Ranking</div></div></div><div style="margin-top:50px">' + spark('ds' + i, [P1, P2, P3, P1, P2][i], 390, 240) + '</div></div>'; }).join('');
  var ranks = [96, 84, 75, 66, 58].map(function (w, i) { return '<div id="dr' + i + '" class="row" style="gap:20px;margin-bottom:22px;opacity:0"><span class="big" style="font-size:44px;width:52px;color:' + (i ? '#8b919a' : '#c8f531') + '">' + (i + 1) + '</span><span style="font-weight:800;font-size:34px;width:180px">Aktie ' + 'ABCDE'[i] + '</span><span class="bar" style="flex:1;height:26px;border-radius:13px"><i id="drb' + i + '" style="border-radius:13px;' + (i ? 'background:#5a616b' : '') + '"></i></span></div>'; }).join('');
  var mk = ['Nasdaq 100', 'S&P 500', 'Dow Jones'].map(function (n, i) { return '<div id="dm' + i + '" class="card" style="flex:1;padding:20px;opacity:0"><div style="font-weight:800;font-size:26px">' + n + '</div>' + spark('dms' + i, [P1, P3, P2][i], 260, 90) + '</div>'; }).join('');
  var persp = [['Zahlen', 'fundamental'], ['Chart', 'technical'], ['Faktoren', 'quant']].map(function (p, i) { return '<div id="dp' + i + '" class="card" style="flex:1;padding:26px 20px;opacity:0;display:flex;flex-direction:column;align-items:center;gap:16px;border-color:rgba(200,245,49,.5)"><span class="tile" style="width:100px;height:100px">' + I(p[1]) + '</span><span style="font-weight:900;font-size:34px">' + p[0] + '</span></div>'; }).join('');

  Story.define({
    kicker: 'Discover', finKick: 'Discover', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: '<span class="lime">Über 6.000</span><br>Aktien.',
        html: '<div class="abs" style="left:4px;top:0;display:grid;grid-template-columns:repeat(22,16px);gap:26px 27px">' + grid + '</div><div id="dq" class="abs" style="left:50%;top:250px;margin-left:-130px;width:260px;height:260px;border-radius:50%;background:rgba(8,8,10,.85);border:4px solid #c8f531;display:grid;place-items:center;opacity:0;box-shadow:0 0 80px rgba(200,245,49,.35)"><span class="big lime" style="font-size:190px">?</span></div>',
        anim: function (t, k) { for (var i = 0; i < 440; i++) { var r = (Math.sin(i * 12.9898) * 43758.5453) % 1, on = Math.abs(Math.sin(t * 2 + r * 40)) > .82; k.$('dg' + i).style.background = on ? '#c8f531' : (t * 3 > Math.abs(r) * 4 ? '#3a4048' : '#262b31'); } k.zoom('dq', t, k.ev('a', 1.6), .5); } },
      { hl: '<span class="lime">54</span><br>Themenwelten.',
        html: '<div class="abs" style="left:0;right:0;top:0;display:flex;flex-wrap:wrap;gap:20px">' + chips + '</div>',
        anim: function (t, k, a) { var s = k.ev('themes', a + 1.5), l = k.ev('list', s + 1.5); for (var i = 0; i < TH.length; i++) k.pop('dt' + i, t, (i < 3 ? s + i * .25 : l + (i - 3) * .22), 24); var last = k.$('dt' + (TH.length - 1)); last.style.boxShadow = '0 0 ' + (50 * k.pulse(t, l + 2, .9)) + 'px rgba(200,245,49,.6)'; } },
      { hl: 'Wisch dich durch<br>den <span class="lime">Markt.</span>',
        html: '<div class="abs phone" style="left:50%;top:0;margin-left:-235px;transform:scale(.9);transform-origin:50% 0"><div class="notch"></div><div class="abs" style="left:0;right:0;top:56px;text-align:center;font-weight:800;font-size:26px;color:#8b919a" id="dcn">Aktie 1 von 6.125</div>' + cards + '<div class="ill">ILLUSTRATION</div></div>',
        anim: function (t, k, a) { var s = k.ev('swipe', a + 1.5), pos = 0, i;
          for (i = 0; i < 4; i++) if (t >= s + i * .7 + .45) pos = i + 1;
          for (i = 0; i < 5; i++) { var at = s + i * .7, el = k.$('dc' + i), d = i - pos, sw = i === pos && i < 4 ? k.eio(k.seg(t, at, at + .45)) : 0;
            el.style.zIndex = 10 - i; el.style.opacity = d < 0 || d > 2 ? 0 : 1;
            el.style.transform = sw > 0 ? 'translateY(' + (-950 * sw) + 'px) rotate(' + (-5 * sw) + 'deg)' : 'translateY(' + (Math.max(0, d) * 28) + 'px) scale(' + (1 - Math.max(0, d) * .05) + ')';
            k.draw('ds' + i, t, i === 0 ? a + .2 : s + (i - 1) * .7 + .45, .7); }
          k.$('dcn').textContent = 'Aktie ' + (1 + pos) + ' von 6.125'; } },
      { hl: 'Wer liegt<br><span class="lime">vorne?</span>',
        html: '<div class="abs" style="left:0;right:0;top:0">' + ranks + '</div><div class="abs row" style="left:0;right:0;top:440px;gap:18px;align-items:stretch">' + mk + '</div>',
        anim: function (t, k, a) { var r = k.ev('rank', a + 1.3), m = k.ev('mk', r + 1); for (var i = 0; i < 5; i++) { k.pop('dr' + i, t, r - .4 + i * .12, 20); k.fill('drb' + i, t, r - .3 + i * .12, [96, 84, 75, 66, 58][i], .9); } for (var j = 0; j < 3; j++) { k.pop('dm' + j, t, m + j * .2, 26); k.draw('dms' + j, t, m + .2 + j * .2, .8); } } },
      { hl: 'Ein Tipp.<br><span class="lime">Mitten drin.</span>',
        html: '<div id="dtap" class="card abs row" style="left:120px;right:120px;top:0;padding:28px;gap:24px"><span class="tile" style="width:90px;height:90px">' + I('discover') + '</span><div><div style="font-weight:900;font-size:40px">Aktie A</div><div class="lab" style="font-size:26px">Tippen für die Analyse</div></div></div>' +
          '<div id="drip" class="abs" style="left:50%;top:70px;width:40px;height:40px;margin-left:-20px;border-radius:50%;border:5px solid #c8f531;opacity:0"></div>' +
          '<div class="abs row" style="left:0;right:0;top:300px;gap:18px;align-items:stretch">' + persp + '</div>',
        anim: function (t, k, a) { var tp = k.ev('tap', a + 1), p = k.ev('persp', tp + 1.4); var r = k.seg(t, tp, tp + .6); k.$('drip').style.opacity = r > 0 && r < 1 ? 1 - r : 0; k.$('drip').style.transform = 'scale(' + (1 + r * 6) + ')'; k.$('dtap').style.transform = 'scale(' + (1 - .04 * k.pulse(t, tp, .3)) + ')'; for (var i = 0; i < 3; i++) k.pop('dp' + i, t, p + i * .35, 40); } },
      { hl: 'Dein Einstieg in<br><span class="lime">Vision Universe.</span>',
        html: '<div class="abs" style="left:50%;top:-20px;margin-left:-330px;width:660px;height:660px;background:url(/assets/hero-visuals/discover.webp) center/cover;-webkit-mask-image:radial-gradient(38.6% 38.6% at 62.5% 39.2%,#000 86%,transparent 100%);mask-image:radial-gradient(38.6% 38.6% at 62.5% 39.2%,#000 86%,transparent 100%)" id="dglobe"></div>' +
          '<div id="dapp" class="card abs row" style="left:0;right:0;top:560px;padding:30px;gap:28px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:120px;height:120px;flex:none">' + I('discover') + '</span><div><div class="big lime" style="font-size:72px">Discover</div><div class="lab" style="margin-top:6px">Aktien, Themen und Märkte</div></div></div>',
        anim: function (t, k, a) { k.$('dglobe').style.transform = 'rotate(' + ((t - a) * 3) + 'deg) scale(' + (.9 + .1 * k.eo(k.seg(t, a, a + 1.5))) + ')'; k.pop('dapp', t, k.ev('app', a + 1.2), 30); } }
    ]
  });
})();
