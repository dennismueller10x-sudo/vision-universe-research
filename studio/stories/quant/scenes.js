/* Erklaervideo "Quant": sieben Eigenschaften, dafuer/dagegen, Veraenderungen, Signal gegen den Markt. */
(function () {
  var I = Story.icon, F = ['Qualität', 'Wachstum', 'Kursstärke', 'Bewertung', 'Profitabilität', 'Erwartung', 'Risiko'];
  var VAL = [.72, .86, .9, .38, .78, .64, .55];
  function poly(r, vals, cx, cy) { return vals.map(function (v, i) { var a = -Math.PI / 2 + i * 2 * Math.PI / 7; return (cx + Math.cos(a) * r * v).toFixed(1) + ',' + (cy + Math.sin(a) * r * v).toFixed(1); }).join(' '); }
  function radar(id, size, labels) {
    var c = size / 2, r = size * (labels ? .33 : .4), rings = [1, .66, .33].map(function (k) { return '<polygon points="' + poly(r, [k, k, k, k, k, k, k], c, c) + '" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="2"/>'; }).join('');
    var axes = F.map(function (f, i) { var a = -Math.PI / 2 + i * 2 * Math.PI / 7; return '<line x1="' + c + '" y1="' + c + '" x2="' + (c + Math.cos(a) * r) + '" y2="' + (c + Math.sin(a) * r) + '" stroke="rgba(255,255,255,.08)" stroke-width="2"/>' + (labels ? '<text x="' + (c + Math.cos(a) * (r + 62)) + '" y="' + (c + Math.sin(a) * (r + 50) + 10) + '" fill="#8b919a" font-family="Inter" font-weight="800" font-size="28" text-anchor="middle">' + f + '</text>' : ''); }).join('');
    var nodes = F.map(function (f, i) { var a = -Math.PI / 2 + i * 2 * Math.PI / 7; return '<circle id="' + id + 'n' + i + '" cx="' + (c + Math.cos(a) * r) + '" cy="' + (c + Math.sin(a) * r) + '" r="13" fill="#c8f531" opacity="0"/>'; }).join('');
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' + rings + axes +
      '<polygon class="dr" id="' + id + 'o" pathLength="1" points="' + poly(r, [1, 1, 1, 1, 1, 1, 1], c, c) + '" stroke="#c8f531" stroke-width="5"/>' +
      '<polygon id="' + id + 'v" points="' + poly(r, VAL, c, c) + '" fill="rgba(200,245,49,.22)" stroke="#c8f531" stroke-width="5" opacity="0" style="transform-origin:' + c + 'px ' + c + 'px"/>' + nodes + '</svg>';
  }
  var rows = F.map(function (f, i) { return '<div id="qr' + i + '" class="row" style="justify-content:space-between;padding:20px 26px;border-radius:20px;border:1.5px solid transparent;opacity:.35"><span style="font-weight:800;font-size:34px">' + f + '</span><span class="bar" style="width:150px"><i id="qb' + i + '"></i></span></div>'; }).join('');
  function check(ok, txt, id) { return '<div id="' + id + '" class="row" style="gap:22px;padding:22px 0;opacity:0"><svg width="56" height="56" viewBox="0 0 64 64" style="color:' + (ok ? '#5cc850' : '#ff6b5e') + ';flex:none"><circle cx="32" cy="32" r="28" fill="' + (ok ? 'rgba(92,200,80,.16)' : 'rgba(255,107,94,.16)') + '"/>' + (ok ? '<path class="ic" stroke-width="6" d="M20 33 L29 42 L45 23"/>' : '<path class="ic" stroke-width="6" d="M22 22 L42 42 M42 22 L22 42"/>') + '</svg><span style="font-weight:800;font-size:40px">' + txt + '</span></div>'; }
  function note(id, name, txt, ico) { return '<div id="' + id + '" class="card row" style="padding:26px 28px;margin-bottom:20px;opacity:0;gap:22px"><span class="tile" style="width:84px;height:84px;flex:none">' + ico + '</span><div><div style="font-weight:900;font-size:36px">' + name + '</div><div class="lab" style="font-size:30px;margin-top:4px">' + txt + '</div></div></div>'; }
  var ARROW = '<svg viewBox="0 0 24 24"><path class="ic" d="M4 17 L10 11 L14 15 L20 8 M15 8 H20 V13"/></svg>';
  var SPARK = '<svg viewBox="0 0 24 24"><path class="ic" d="M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z"/></svg>';
  var WARN = '<svg viewBox="0 0 24 24" style="color:#ff6b5e"><path class="ic" d="M12 3 L22 20 H2 Z M12 9 V14 M12 17 V17.5"/></svg>';
  var dots = ''; for (var i = 0; i < 40; i++) dots += '<span id="qd' + i + '" style="width:30px;height:30px;border-radius:50%;background:#2a3036;display:inline-block"></span>';

  Story.define({
    kicker: 'Quant', finKick: 'Quant', finSub: 'In deiner Vision Universe App',
    scenes: [
      { hl: '<span class="lime">7</span> Eigenschaften.<br>Jeden Tag.',
        html: '<div class="abs" style="left:50%;top:10px;margin-left:-380px">' + radar('r1', 760, true) + '</div><div id="q1c" class="abs" style="left:0;right:0;top:730px;text-align:center;opacity:0"><span class="chip">' + I('quant') + 'Für jede Aktie</span></div>',
        anim: function (t, k) {
          k.draw('r1o', t, 0, 1.3);
          for (var i = 0; i < 7; i++) { var at = .25 + i * .2; k.$('r1n' + i).style.opacity = k.seg(t, at, at + .15); }
          var v = k.eo(k.seg(t, k.ev('a', 1), k.ev('a', 1) + .8)); k.$('r1v').style.opacity = v; k.$('r1v').style.transform = 'scale(' + v + ')';
          k.pop('q1c', t, k.ev('b', 1.9));
        } },
      { hl: 'Nach festen<br><span class="lime">Regeln.</span>',
        html: '<div class="abs phone" style="left:0;top:0;transform:scale(.82);transform-origin:0 0"><div class="notch"></div><div class="abs" style="left:34px;top:90px;font-weight:800;font-size:24px;letter-spacing:.14em;color:#8b919a">AKTIE A · 7 EIGENSCHAFTEN</div><div class="abs" style="left:15px;top:170px">' + radar('r2', 420, false) + '</div><div class="ill">ILLUSTRATION</div></div>' +
          '<div class="abs" style="left:420px;right:0;top:20px">' + rows + '</div>',
        anim: function (t, k, a) {
          k.draw('r2o', t, a + .1, .8); var f1 = k.ev('f1', a + 2), f2 = k.ev('f2', a + 4);
          for (var i = 0; i < 7; i++) {
            var at = i < 3 ? f1 + i * .55 : f2 + (i - 3) * .55, on = k.seg(t, at, at + .3);
            k.$('qr' + i).style.opacity = .35 + .65 * on; k.$('qr' + i).style.borderColor = on > 0 && t < at + .9 ? 'rgba(200,245,49,.6)' : 'transparent';
            k.$('qr' + i).style.background = on > 0 && t < at + .9 ? 'rgba(200,245,49,.08)' : 'transparent';
            k.fill('qb' + i, t, at, VAL[i] * 100, .6); k.$('r2n' + i).style.opacity = on;
          }
          var v = k.eo(k.seg(t, f2 + 2, f2 + 2.8)); k.$('r2v').style.opacity = v; k.$('r2v').style.transform = 'scale(' + v + ')';
        } },
      { hl: '<span class="lime">Dafür.</span><br><span class="red">Dagegen.</span>',
        html: '<div class="card abs" style="left:0;right:0;top:0;padding:30px 40px"><div class="kicker" style="font-size:26px;color:#5cc850">Dafür</div>' + check(true, 'Starkes Wachstum', 'p1') + check(true, 'Hohe Kursstärke', 'p2') + check(true, 'Solide Qualität', 'p3') +
          '<div style="height:2px;background:rgba(255,255,255,.08);margin:18px 0 22px"></div><div class="kicker" style="font-size:26px;color:#ff6b5e">Dagegen</div>' + check(false, 'Hohe Bewertung', 'c1') + '</div>',
        anim: function (t, k, a) { var p = k.ev('pro', a + .8), c = k.ev('con', a + 2.5); k.pop('p1', t, p, 20); k.pop('p2', t, p + .3, 20); k.pop('p3', t, p + .6, 20); k.pop('c1', t, c, 20); } },
      { hl: 'Was sich<br><span class="lime">verändert.</span>',
        html: '<div class="abs" id="bell" style="left:0;top:0;width:150px;height:150px;color:#c8f531"><svg width="150" height="150" viewBox="0 0 64 64"><path class="ic" stroke-width="3.6" d="M18 44 V28 C18 19 24 13 32 13 C40 13 46 19 46 28 V44 L50 48 H14 Z M27 52 C28 56 36 56 37 52"/><circle cx="46" cy="16" r="7" fill="#c8f531"/></svg></div>' +
          '<div class="abs" style="left:0;right:0;top:200px"><div class="kicker" style="font-size:24px;color:#8b919a;margin-bottom:22px">Heute bei Quant</div>' + note('n1', 'Aktie A', 'Neues Hoch', ARROW) + note('n2', 'Aktie B', 'Neues Setup', SPARK) + note('n3', 'Aktie C', 'Risiko steigt', WARN) + '</div>',
        anim: function (t, k, a) { var b = k.ev('bell', a + .8); k.$('bell').style.transform = 'rotate(' + (Math.sin((t - b) * 22) * 14 * k.pulse(t, b, .9)) + 'deg)'; k.pop('n1', t, b + .2, 40); k.pop('n2', t, b + 1.0, 40); k.pop('n3', t, b + 1.8, 40); } },
      { hl: 'Besser als<br>der <span class="lime">Markt?</span>',
        html: '<div class="card abs" style="left:0;right:0;top:0;padding:34px 40px"><div class="kicker" style="font-size:24px;color:#8b919a">Jedes Signal gegen den Markt</div>' +
          '<div class="lab" style="margin:30px 0 14px">Signal</div><div class="bar" style="height:34px;border-radius:18px"><i id="hb1" style="border-radius:18px"></i></div>' +
          '<div class="lab" style="margin:26px 0 14px">Markt</div><div class="bar" style="height:34px;border-radius:18px"><i id="hb2" style="border-radius:18px;background:#5a616b"></i></div></div>' +
          '<div class="abs" style="left:0;right:0;top:470px"><div class="lab" style="margin-bottom:22px">Frühere Fälle</div><div style="display:grid;grid-template-columns:repeat(10,30px);gap:20px 58px">' + dots + '</div></div>',
        anim: function (t, k, a) { var h = k.ev('hist', a + .6); k.fill('hb1', t, h, 82, 1.2); k.fill('hb2', t, h + .2, 58, 1.2);
          for (var i = 0; i < 40; i++) { var at = h + .8 + i * .06, on = k.seg(t, at, at + .1); k.$('qd' + i).style.background = on > 0 ? (i % 10 < 7 ? '#c8f531' : '#5a616b') : '#2a3036'; k.$('qd' + i).style.transform = 'scale(' + (1 + .4 * k.pulse(t, at, .3)) + ')'; } } },
      { hl: 'Beweis statt<br><span class="lime">Bauchgefühl.</span>',
        html: '<div class="abs" style="left:50%;top:0;margin-left:-170px"><svg width="340" height="340" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="rgba(200,245,49,.08)"/><circle class="dr" id="ck0" pathLength="1" cx="32" cy="32" r="29" stroke="#c8f531" stroke-width="2.6"/><path class="dr" id="ck1" pathLength="1" stroke="#c8f531" stroke-width="4.4" d="M19 33 L28 42 L46 22"/></svg></div>' +
          '<div id="qapp" class="card abs row" style="left:0;right:0;top:420px;padding:30px 34px;gap:28px;border-color:rgba(200,245,49,.55);opacity:0"><span class="tile" style="width:120px;height:120px;flex:none">' + I('quant') + '</span><div><div class="big lime" style="font-size:72px">Quant</div><div class="lab" style="margin-top:6px">in der Vision Universe App</div></div></div>' +
          '<div id="qmod" class="abs" style="left:0;right:0;top:640px;text-align:center;opacity:0"><span class="chip" style="color:#c3c7cc">Ein Modell, keine Prognose</span></div>',
        anim: function (t, k, a) { k.draw('ck0', t, a + .1, .8); k.draw('ck1', t, a + .6, .6); k.pop('qmod', t, a + .3); k.pop('qapp', t, k.ev('app', a + 2)); } }
    ]
  });
})();
