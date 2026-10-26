/* Erklaervideo "Strategie" (Supertrader): Methoden bekannter Trader als feste Regeln, Checkliste, Backtests, taeglicher Scan. */
(function () {
  var I = Story.icon;
  function app(id, ic, name, sub) { return '<div id="' + id + '" class="card abs row" style="left:0;right:0;top:40px;padding:34px;gap:30px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + I(ic) + '</span><div><div class="big lime" style="font-size:72px">' + name + '</div><div class="lab" style="margin-top:6px">' + sub + '</div></div></div>'; }
  var NAMES = [['Minervini', 'Trend & Basis'], ['Darvas', 'Boxen'], ['Weinstein', 'Phasen'], ['Turtle Trading', 'Ausbrüche']];
  var cards = NAMES.map(function (n, i) { return '<div id="tn' + i + '" class="card" style="padding:26px 28px;opacity:0"><div class="kicker" style="font-size:20px;color:#8b919a">Methode</div><div style="font-weight:900;font-size:44px;margin-top:8px">' + n[0] + '</div><div class="lab" style="font-size:28px;margin-top:4px">' + n[1] + '</div></div>'; }).join('');
  var CK = ['Aufwärtstrend intakt', 'Nahe am Hoch', 'Volumen bestätigt', 'Ausbruch über Basis', 'Stopp festgelegt'];
  var checks = CK.map(function (c, i) { return '<div class="row" style="gap:20px;padding:18px 0;border-bottom:1px solid rgba(255,255,255,.07)"><svg width="54" height="54" viewBox="0 0 64 64" style="flex:none"><circle cx="32" cy="32" r="27" fill="rgba(200,245,49,.1)" stroke="rgba(200,245,49,.4)" stroke-width="2"/><path class="dr" id="tc' + i + '" pathLength="1" stroke="#c8f531" stroke-width="6" d="M20 33 L29 42 L45 23"/></svg><span style="font-weight:800;font-size:38px">' + c + '</span></div>'; }).join('');
  var EQ = [], y = 380; for (var i = 0; i <= 40; i++) { y += (Math.sin(i * 1.7) * 26 + Math.cos(i * .6) * 18) - 7.5; EQ.push((i * 23.8).toFixed(0) + ',' + Math.max(30, Math.min(420, y)).toFixed(0)); }
  var marks = [[6, 1], [11, 0], [17, 1], [22, 1], [27, 0], [33, 1], [38, 1]].map(function (m, j) { var p = EQ[m[0]].split(','); return '<circle id="tm' + j + '" cx="' + p[0] + '" cy="' + p[1] + '" r="13" fill="' + (m[1] ? '#5cc850' : '#ff6b5e') + '" opacity="0"/>'; }).join('');
  var dots = ''; for (var d = 0; d < 16 * 10; d++) dots += '<i id="tg' + d + '" style="display:block;width:20px;height:20px;border-radius:5px;background:#22272d"></i>';
  var HITS = [23, 58, 101, 137];

  Story.define({
    kicker: 'Supertrader', finKick: 'Supertrader', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Wie handeln die<br><span class="lime">Besten?</span>',
        html: '<div class="abs" style="left:50%;top:20px;margin-left:-230px"><svg width="460" height="520" viewBox="0 0 64 72"><path class="dr" id="tt1" pathLength="1" stroke="#c8f531" stroke-width="3" d="M18 8 H46 V26 C46 36 40 42 32 42 C24 42 18 36 18 26 Z M18 14 H8 C8 24 12 28 18 28 M46 14 H56 C56 24 52 28 46 28 M32 42 V54 M20 62 H44 L42 54 H22 Z"/><text id="tt2" x="32" y="31" text-anchor="middle" font-family="Inter" font-weight="900" font-size="16" fill="#c8f531" opacity="0">1</text></svg></div>',
        anim: function (t, k) { k.draw('tt1', t, 0, 1.2); k.$('tt2').style.opacity = k.seg(t, .8, 1.1); } },
      { hl: 'Methoden.<br><span class="lime">Feste Regeln.</span>',
        html: '<div class="abs" style="left:0;right:0;top:0;display:grid;grid-template-columns:1fr 1fr;gap:20px">' + cards + '</div><div id="tmore" class="abs" style="left:0;right:0;top:470px;text-align:center;opacity:0"><span class="chip">' + I('supertrader') + 'und weitere Methoden</span></div>',
        anim: function (t, k, a) { var n = k.ev('names', a + 2), m = k.ev('more', n + 2); k.pop('tn0', t, n - .1, 30); k.pop('tn1', t, n + .5, 30); k.pop('tn2', t, n + 1.1, 30); k.pop('tn3', t, m, 30); k.pop('tmore', t, m + .7, 20); } },
      { hl: 'Keine Meinung.<br>Eine <span class="lime">Checkliste.</span>',
        html: '<div class="card abs" style="left:0;right:0;top:0;padding:20px 36px">' + checks + '</div><div id="tsrc" class="abs" style="left:0;right:0;top:560px;text-align:center;opacity:0"><span class="chip"><svg viewBox="0 0 24 24"><path class="ic" d="M6 3 H15 L19 7 V21 H6 Z M9 11 H16 M9 15 H16"/></svg>Jede Regel mit Quelle</span></div>',
        anim: function (t, k, a) { for (var i = 0; i < 5; i++) k.draw('tc' + i, t, a + .3 + i * .4, .35); k.pop('tsrc', t, k.ev('check', a + 2.5), 20); } },
      { hl: 'Ehrliche<br><span class="lime">Backtests.</span>',
        html: '<div class="card abs" style="left:0;right:0;top:0;padding:30px"><div class="kicker" style="font-size:22px;color:#8b919a">Backtest · Illustration</div><svg width="892" height="440" viewBox="0 0 952 440" style="margin-top:20px"><polyline class="dr" id="teq" pathLength="1" points="' + EQ.join(' ') + '" stroke="#c8f531" stroke-width="5"/>' + marks + '</svg>' +
          '<div class="row" style="gap:30px;margin-top:10px"><span class="row lab" style="gap:10px;font-size:30px"><i style="width:22px;height:22px;border-radius:50%;background:#5cc850;display:inline-block"></i>Gewinner</span><span class="row lab" style="gap:10px;font-size:30px"><i style="width:22px;height:22px;border-radius:50%;background:#ff6b5e;display:inline-block"></i>Verlierer</span></div></div>',
        anim: function (t, k, a) { k.draw('teq', t, a + .2, 2.2); var b = k.ev('bt', a + 1.5); for (var j = 0; j < 7; j++) { var at = b + .2 + j * .25; k.$('tm' + j).style.opacity = k.seg(t, at, at + .15); k.$('tm' + j).setAttribute('r', 13 + 8 * k.pulse(t, at, .3)); } } },
      { hl: 'Jeden Tag<br><span class="lime">durchsucht.</span>',
        html: '<div class="abs" style="left:0;top:0;display:grid;grid-template-columns:repeat(16,20px);gap:22px 39px">' + dots + '</div>' +
          '<svg id="tlens" class="abs" style="left:0;top:0" width="150" height="150" viewBox="0 0 64 64"><circle class="ic" cx="26" cy="26" r="17" stroke="#c8f531" stroke-width="5"/><path class="ic" stroke="#c8f531" stroke-width="6" d="M39 39 L56 56"/></svg>' +
          '<div id="thit" class="card abs row" style="left:0;right:0;top:530px;padding:24px 30px;gap:24px;opacity:0;border-color:rgba(200,245,49,.5)"><svg width="60" height="60" viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="rgba(200,245,49,.15)"/><path class="ic" stroke="#c8f531" stroke-width="6" d="M20 33 L29 42 L45 23"/></svg><span style="font-weight:900;font-size:40px">Treffer: Muster erfüllt</span></div>',
        anim: function (t, k, a) { var s = k.ev('scan', a + 2), p = k.seg(t, a, b5()), x = 40 + 740 * (.5 + .5 * Math.sin(p * 7)), yy = 30 + 360 * p; k.$('tlens').style.transform = 'translate(' + x + 'px,' + yy + 'px)';
          for (var i = 0; i < 160; i++) { var hit = HITS.indexOf(i), at = s + hit * .35; k.$('tg' + i).style.background = hit >= 0 && t >= at ? '#c8f531' : '#22272d'; k.$('tg' + i).style.boxShadow = hit >= 0 && t >= at ? '0 0 18px rgba(200,245,49,.8)' : 'none'; }
          k.pop('thit', t, s + 1.5, 24);
          function b5() { return k.ev('app', a + 5) - 1; } } },
      { hl: 'Das ist<br><span class="lime">Supertrader.</span>',
        html: app('tapp', 'supertrader', 'Supertrader', 'Methoden, Regeln, Backtests') + '<div id="tnote" class="abs" style="left:0;right:0;top:290px;text-align:center;opacity:0"><span class="chip" style="color:#c3c7cc">Modell-Signale, keine Anlageberatung</span></div>',
        anim: function (t, k, a) { k.zoom('tapp', t, a + .2, .6); k.pop('tnote', t, a + .5, 20); } }
    ]
  });
})();
