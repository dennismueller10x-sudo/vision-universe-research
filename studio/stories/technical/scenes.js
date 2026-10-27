/* Erklaervideo "Charts" (Technical): Indikatoren, Zonen, Formationen mit Gueltigkeit, Chart Studio, Signale im Screener. */
(function () {
  var I = Story.icon;
  function app(id, ic, name, sub) { return '<div id="' + id + '" class="card abs row" style="left:0;right:0;top:40px;padding:34px;gap:30px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:130px;height:130px;flex:none">' + I(ic) + '</span><div><div class="big lime" style="font-size:72px">' + name + '</div><div class="lab" style="margin-top:6px">' + sub + '</div></div></div>'; }
  // Kerzen (ausgedacht, nur Illustration)
  var C = [], p = 300; for (var i = 0; i < 30; i++) { var o = p, c = p + Math.sin(i * .9) * 22 - 6 + (i > 18 ? -6 : 0), h = Math.min(o, c) - 12 - (i % 3) * 6, l = Math.max(o, c) + 12 + (i % 4) * 5; C.push([o, c, h, l]); p = c; }
  function candles(id) { return C.map(function (k, i) { var x = 18 + i * 31, up = k[1] < k[0]; return '<g id="' + id + i + '" opacity="0"><line x1="' + x + '" x2="' + x + '" y1="' + k[2].toFixed(0) + '" y2="' + k[3].toFixed(0) + '" stroke="' + (up ? '#5cc850' : '#ff6b5e') + '" stroke-width="3"/><rect x="' + (x - 9) + '" y="' + Math.min(k[0], k[1]).toFixed(0) + '" width="18" height="' + Math.max(4, Math.abs(k[1] - k[0])).toFixed(0) + '" rx="3" fill="' + (up ? '#5cc850' : '#ff6b5e') + '"/></g>'; }).join(''); }
  var ma = C.map(function (k, i) { var s = 0, n = 0; for (var j = Math.max(0, i - 5); j <= i; j++) { s += C[j][1]; n++; } return (18 + i * 31) + ',' + (s / n).toFixed(0); }).join(' ');
  function chart(id, extra) { return '<div class="card abs" style="left:0;right:0;top:0;height:640px;padding:20px;overflow:hidden"><svg width="952" height="600" viewBox="0 60 952 480">' + candles(id) + (extra || '') + '</svg></div>'; }
  function showCandles(k, t, id, at, step) { for (var i = 0; i < 30; i++) k.$(id + i).style.opacity = k.seg(t, at + i * step, at + i * step + .1); }

  Story.define({
    kicker: 'Technical', finKick: 'Technical', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: 'Was sagt der<br><span class="lime">Chart?</span>', html: chart('ka'),
        anim: function (t, k) { showCandles(k, t, 'ka', 0, .02); } },
      { hl: 'Trend und<br><span class="lime">Zonen.</span>',
        html: chart('kb', '<polyline class="dr" id="kma" pathLength="1" points="' + ma + '" stroke="#c8f531" stroke-width="5"/>' +
          '<rect id="ksup" x="0" y="330" width="952" height="34" fill="rgba(92,200,80,.16)" opacity="0"/><rect id="kres" x="0" y="190" width="952" height="34" fill="rgba(255,107,94,.16)" opacity="0"/>') +
          '<div id="kl1" class="abs row" style="left:0;top:670px;gap:16px;opacity:0"><span class="chip" style="font-size:28px;padding:10px 22px;color:#c8f531">Gleitender Durchschnitt</span><span class="chip" style="font-size:28px;padding:10px 22px;color:#5cc850">Unterstützung</span><span class="chip" style="font-size:28px;padding:10px 22px;color:#ff6b5e">Widerstand</span></div>',
        anim: function (t, k, a) { showCandles(k, t, 'kb', a - .3, 0); var i = k.ev('ind', a + 1.5), s = k.ev('sr', i + 2.5); k.draw('kma', t, i, 1.4); k.$('ksup').style.opacity = k.seg(t, s, s + .4); k.$('kres').style.opacity = k.seg(t, s + .3, s + .7); k.pop('kl1', t, s + .2, 16); } },
      { hl: 'Formationen<br><span class="lime">erkannt.</span>',
        html: chart('kc', '<path class="dr" id="ktri" pathLength="1" d="M300 200 L700 285 M300 380 L700 300" stroke="#c8f531" stroke-width="5" stroke-dasharray="1"/>') +
          '<div id="kok" class="abs" style="left:0;top:670px;opacity:0"><span class="chip" style="color:#c8f531;border-color:#c8f531">Formation erkannt</span></div><div id="kno" class="abs" style="left:430px;top:670px;opacity:0"><span class="chip" style="color:#ff6b5e;border-color:#ff6b5e">ungültig</span></div>',
        anim: function (t, k, a) { showCandles(k, t, 'kc', a - .3, 0); k.draw('ktri', t, a + .3, 1); k.pop('kok', t, a + 1.1, 16); var p = k.ev('pat', a + 2.5); k.pop('kno', t, p + .6, 16); k.$('ktri').style.stroke = t > p + .6 ? '#ff6b5e' : '#c8f531'; } },
      { hl: 'Deine Linien<br><span class="lime">laufen mit.</span>',
        html: chart('kd', '<line id="kln" x1="60" y1="420" x2="60" y2="420" stroke="#f4f5f1" stroke-width="6" stroke-linecap="round"/><circle id="kpen" cx="60" cy="420" r="16" fill="#c8f531"/>') +
          '<div id="kst" class="abs" style="left:0;top:670px;opacity:0"><span class="chip"><svg viewBox="0 0 24 24"><path class="ic" d="M4 20 L8 19 L19 8 L16 5 L5 16 Z"/></svg>Chart Studio</span></div>',
        anim: function (t, k, a) { showCandles(k, t, 'kd', a - .3, 0); k.pop('kst', t, a + .2, 16); var d = k.ev('draw', a + 2), p1 = k.eo(k.seg(t, a + .4, d)), p2 = k.eo(k.seg(t, d, d + 1.2)), x = 60 + 520 * p1 + 330 * p2, y = 420 - 160 * p1 - 100 * p2; k.$('kln').setAttribute('x2', x); k.$('kln').setAttribute('y2', y); k.$('kpen').setAttribute('cx', x); k.$('kpen').setAttribute('cy', y); k.$('kln').style.strokeDasharray = p2 > 0 ? '' : ''; } },
      { hl: 'Finde deine<br><span class="lime">Signale.</span>',
        html: '<div class="card abs row" style="left:0;right:0;top:0;padding:30px 34px;justify-content:space-between"><div><div class="kicker" style="font-size:22px;color:#8b919a">Filter</div><div style="font-weight:900;font-size:42px;margin-top:8px">Kurs über 200-Tage-Linie</div></div><span id="ktg" style="width:120px;height:64px;border-radius:32px;background:#2a3036;position:relative;flex:none"><i id="ktk" style="position:absolute;left:6px;top:6px;width:52px;height:52px;border-radius:50%;background:#f4f5f1"></i></span></div>' +
          ['A', 'B', 'C'].map(function (n, i) { return '<div id="kr' + i + '" class="card abs row" style="left:0;right:0;top:' + (190 + i * 130) + 'px;padding:22px 30px;gap:22px;opacity:0"><span class="tile" style="width:76px;height:76px">' + I('technical') + '</span><span style="font-weight:900;font-size:38px">Aktie ' + n + '</span><span class="chip" style="margin-left:auto;font-size:24px;padding:8px 18px;color:#c8f531">Signal</span></div>'; }).join(''),
        anim: function (t, k, a) { var f = k.ev('filter', a + 2), on = k.eo(k.seg(t, f - .6, f - .3)); k.$('ktg').style.background = on > .5 ? '#c8f531' : '#2a3036'; k.$('ktk').style.left = (6 + 56 * on) + 'px'; for (var i = 0; i < 3; i++) k.pop('kr' + i, t, f - .1 + i * .3, 30); } },
      { hl: 'Der Chart,<br><span class="lime">erklärt.</span>', html: app('kapp', 'technical', 'Technical', 'Indikatoren, Formationen, Screener'),
        anim: function (t, k, a) { k.zoom('kapp', t, a + .2, .6); } }
    ]
  });
})();
