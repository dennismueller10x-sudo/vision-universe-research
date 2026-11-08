/* 02 · Discover: Übersicht, Welten, Thema, Strategien, Swipen, Suche, Märkte, Watchlist, die gemeinsame Aktienseite. */
(function () {
const { screen, slide, chapter, ic, hud, chart, mini, tf, chg, vd, help, lg, row, STOCK, DOCK, HDR, WORLDS, perspbar, D, S, de, pc, sect, kv, tile, navcard, pill, toggle, bars, supp, resi, NV, search, intro, NAMES, WHAT, day, px } = VU;

/* Echte Kursreihen (52 Punkte, 1 Jahr) – Aktien aus quant/data/market/discover-series, Märkte aus quant/data/market/multi-asset/series */
const X = {"GDYN":[7.6,8.74,8.27,8.11,8.76,9.49,9.69,9.32,9.17,9.89,9.24,8.73,8.28,7.27,6.5,6.99,6.9,7.15,6.44,5.97,5.72,5.77,5.28,5.95,5.72,5.84,6.77,6.68,7,7.5,6.09,6.37,5.41,6.24,5.92,5.8,5.61,7.06,7.58,7.94,7.91,7.89,8.2,7.98,7.59,7.75,8.02,7.95,7.79,8.65,9.49,13.36],"OSPN":[15.51,12.2,12.55,11.89,12.2,12.22,12.96,12.78,12.95,12.83,12.91,11.85,11.68,11.11,10.98,11.38,11.37,10.97,10.69,10.45,10.64,10.69,10.6,11.49,11.34,11.93,11.84,12.34,13.71,15.34,13.97,14.26,13.52,14.74,15.21,15.54,14.75,15.41,16.24,16.92,15.59,16.46,16.76,16.85,17.51,17.81,18.12,18.22,17.5,20.19,20.15,25.66],"LLY":[844.5,937.44,1022.87,1043.29,1075.47,1010.31,1027.51,1071.44,1078.73,1064.04,1077.19,1078.52,1023.8,1107.12,1015.21,1023.22,1022.02,983.26,977.25,917.5,897,935.58,939.47,927.03,883.96,967.93,966.99,988.09,1064.74,1064.15,1144.68,1122.5,1117.26,1191.74,1216.95,1169.17,1185.87,1154.97,1191.94,1209,1244.4,1176.1,1159.6,1115.7,1152.93,1183.46,1142.85,1179.27,1257.03,1273.46,1373.7,1417.54],"ECO":[34.2,33.56,39,36.78,36.84,37.07,35.77,33.92,33.58,33.5,40.5,38.38,40.32,39.14,42.69,46.78,53.2,48.81,44.68,47.15,49.01,51.75,49.02,51.6,53.11,55.39,55.93,55.81,53.55,48.18,49.04,52,54.44,49.94,52.23,56.77,57.46,59.86,63.78,63.92,64.1,66.34,69.56,76.15,84.95,77.9,87.28,93.11,89.7,94.73,101.63,101.33],"HZO":[23.71,23.39,22.56,21.43,23.38,23.82,25.19,24.73,24.37,26.41,27.3,28.65,26.86,30.76,28.74,28.69,30.05,28.35,26.35,25.07,26.51,27.17,27.13,30.54,29.72,27.66,33.29,32.73,34.65,34.75,33.67,34.07,37.08,35.75,34.79,35.27,33.57,35.03,35.13,52.04,52.25,52.19,52.16,52.21,52.56,52.44,52.35,52.37,52.37,52.59,52.59,52.76],"SWKS":[79.16,70.64,68.17,60.5,65.95,69.32,66.97,64.68,64.02,66.27,58.5,58.55,55.28,59,63.68,59.22,59.61,56.48,55.2,54.12,56.66,55.19,56.36,58.99,63.65,68.85,70.13,70.35,83.42,79.12,73.56,71.42,71.4,65.93,59.95,57.63,60.47,62.48,66.84,69.76,67.94,67.36,71.5,88.35,88.76,89.34,85.03,76.35,79.7,83.43,89.43,87.58],"EQIX":[833.16,819.33,786.54,752.81,753.31,741.58,750.32,758.51,765,788.06,801.31,795.48,816.15,802.13,867.52,918.03,948.02,953,971.47,974.76,963.39,1000.37,1030.24,1088.62,1108.76,1083.2,1086.22,1062.62,1077.63,1071.8,1059.84,1094.68,1095,1013.62,1034.87,1009.14,1033.55,1047.53,1052.86,1073.78,1082.61,1076.45,1040.83,1037.72,1021.34,1008.08,1025.72,1026.06,985.98,955.03,1036.67,1013.7],"QQQ":[626.05,611.67,608.4,585.67,619.25,625.48,613.62,617.05,620.87,623.42,626.24,616.28,633.22,605.75,613.11,603.47,609.24,608.91,597.26,593.02,573.79,584.98,611.07,648.85,663.88,672.88,713.29,705.88,730.28,746.16,707.83,729.86,710.62,725.17,723.28,705.94,691.96,683.55,714.65,732.07,710.93,721.11,717.67,714.88,721.45,744.5,749.58,751.27,709.8,704.4,715.34,690.49],"SPY":[679.83,670.31,672.04,652.53,683.39,685.69,681.76,680.59,687.85,691.81,693.77,685.4,695.42,686.19,691.96,684.48,689.3,681.31,666.06,659.8,645.09,655.83,679.46,710.14,713.94,718.01,739.3,738.65,750.59,759.57,737.05,750.33,733.24,745.76,751.71,750.72,738.18,741.69,768.56,777.88,762.6,771.1,773.17,764.29,761.69,771.35,769.64,778.57,763.25,759.97,769.36,755.72],"DIA":[475.01,469.28,474.74,458.1,477.18,480.03,485.4,481.15,484.59,494.61,491.94,490.8,490.13,494.75,501.33,494.38,494.86,479.84,467.48,461.06,459.31,465.06,479.25,494.22,492.21,489.56,497.11,497.01,505.25,514.05,509.41,521.44,518.52,522.4,524.19,524.83,516.26,521.51,538.19,537.91,527.51,535.22,536.93,525.79,515.88,517.49,511.1,516.11,519.1,521.37,522.73,517.13],"XAUUSD":[4540.18,4596.7,4959.03,5512.9,4947.52,5031.89,5020.07,5106.02,5184.69,5165.28,5197.23,5013,4465,4495.15,4676.33,4763.83,4823.49,4738.21,4692.02,4614.02,4715.52,4652.3,4546.65,4519.78,4484.6,4317.78,4294.23,4161.51,4014.66,4035.04,4098.66,4001.27,3995.39,4055.57,4105.99,4278.2,4371.55,4426.02,4624.16,4457.22,4480.18,4394.28,4283.7,4368.75,4260.4,4138.6,4144.75,4111.91,4114.09,4005.6,3873.01,3898.42],"BTCUSD":[64647.82,66991.04,70884.63,69961.67,72826.2,70503.1,71301.88,66739.26,67293.7,71800.11,74176.9,73822.82,77460.24,75755.23,79846.71,80653.95,81074.91,76781.11,77008.29,73381.21,64046.16,63073.77,64419.34,62882.29,62652.4,60168.39,63099.78,63183.74,64995.61,64688.28,64094.1,63902.87,63470.13,64911.17,63429.32,64686.57,77728.6,77837.33,77312.12,79107.57,77251.58,76354.25,86196.57,84460.57,84506.33,83296.78,81751.57,81388.23,81315.23,80806.86,77439.02,78238.22],"US2Y":[3.59,3.63,3.58,3.55,3.47,3.56,3.52,3.48,3.45,3.47,3.53,3.6,3.56,3.57,3.52,3.47,3.42,3.57,3.76,3.79,3.96,3.79,3.78,3.78,3.83,3.88,3.9,4.09,4.13,4.05,4.15,4.07,4.16,4.14,4.21,4.13,4.31,4.22,4.18,4.2,4.19,4.19,4.39,4.56,4.67,4.87,4.78,4.75,4.74,4.69,4.61,4.56],"DE2Y":[1.96,1.98,2.01,1.99,2.03,2.11,2.13,2.14,2.13,2.1,2.08,2.11,2.08,2.07,2.03,2.04,2.02,2.34,2.35,2.72,2.67,2.49,2.53,2.51,2.67,2.57,2.69,2.63,2.53,2.64,2.59,2.61,2.5,2.51,2.63,2.75,2.83,2.76,2.74,2.76,2.8,2.81,2.94,3.17,3.24,3.28,3.02,3.08,3.08,3.02,3.08,3.06],"WTI":[62.27,61.75,60.54,60.66,59.11,58.81,58.4,55.44,58.55,57.26,57.74,59.13,60.7,64.5,63.77,63.05,66.36,71.13,94.65,93.39,89.33,104.69,114.58,93.07,93.64,110.47,98.75,104.52,101.69,92.65,96.83,91.58,80.35,70.3,69.6,79.2,84.38,84.25,81.96,83.76,86.04,86.34,87.03,94.21,107.02,96.41,96.16,96.24,95.39,107.89,105.25,103.37],"US10Y":[4.08,4.17,4.11,4.1,4.02,4.14,4.19,4.16,4.12,4.18,4.18,4.26,4.26,4.29,4.18,4.08,4.02,4.13,4.27,4.25,4.42,4.31,4.29,4.32,4.34,4.39,4.38,4.59,4.56,4.47,4.56,4.47,4.5,4.44,4.56,4.55,4.67,4.67,4.63,4.68,4.65,4.66,4.79,4.95,4.94,5.18,5.24,5.22,5.09,5,4.98,4.94]};

/* ---------- Hilfen dieser Welt ---------- */
const up = t => !String(t).trim().startsWith('−');
/* Prozentwert als Pille: Plus neongrün, Minus schwarz. Werte ohne Vorzeichen (Margen) grau. */
const P = (t, big) => { const s = String(t).trim(); const k = s.startsWith('+') ? 'up' : s.startsWith('−') ? 'dn' : ''; return k ? `<span class="chg ${k}${big ? ' big' : ''}">${k === 'up' ? '▲' : '▼'} ${s}</span>` : `<span class="chg" style="background:var(--a-line);color:var(--a-ink)">${s}</span>`; };
const BIG = t => { const u = up(t); return `<span class="num" style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 16px 6px 12px;font-size:30px;font-weight:900;letter-spacing:-.045em;line-height:1;white-space:nowrap;background:${u ? 'var(--lime)' : 'var(--a-ink)'};color:${u ? '#000' : 'var(--a-inv)'}"><span style="font-size:15px">${u ? '▲' : '▼'}</span>${t}</span>`; };
const ser = t => S[t] || X[t];
const nm = (t, n) => n || NAMES[t] || t;
const sp = (a, w = 74, h = 32) => a ? chart(a, { w, h, grid: false, base: false }) : '<span></span>';
/* Aktienzeile mit eigener rechter Spalte (Klartext-Zahl statt Tagesbewegung) */
const xrow = (t, n, sub, right, a) => `<div class="lr">${lg(t)}<div class="n"><b>${nm(t, n)}</b><span>${sub}</span></div>${sp(a === undefined ? ser(t) : a)}<div class="p">${right}</div></div>`;
const trow = (t, w, lab, story, n) => xrow(t, n, story, `${P(w)}<span class="xs mu" style="font-weight:600">${lab}</span>`);
const rank = (i, t, n, w, lab, story) => `<div style="display:grid;grid-template-columns:22px 42px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-top:${i > 1 ? '1px solid var(--a-line)' : '0'}"><b class="num" style="font-size:15px;color:var(--a-mute)">${i}</b>${lg(t)}<div style="min-width:0"><b style="display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n}</b><span class="mu" style="font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${story}</span></div><div style="display:grid;justify-items:end;gap:2px">${P(w)}<span class="xs mu" style="font-weight:600">${lab}</span></div></div>`;
const theme = (img, t, s, n, h = 150) => `<div class="cimg" style="height:${h}px"><img src="img/${img}.webp" alt=""><div class="t">${t}<span>${[s, n ? n + ' Aktien' : ''].filter(Boolean).join(' · ')}</span></div></div>`;
const cp = t => `<span class="chip" style="height:30px;font-size:12.5px;background:var(--a-bg)">${t}</span>`;
const hscroll = (items, w) => `<div style="display:flex;gap:10px;margin-right:-18px;overflow:hidden">${items.map(x => `<div style="flex:none;width:${w}px">${x}</div>`).join('')}</div>`;
const sheet = (inner, top = 300) => `<div class="ovl"></div><div class="sheet" style="top:${top}px"><div class="grab"></div>${inner}</div>`;
const lineItem = (l, r, sub) => `<div class="kv"><span><span class="sm b" style="display:block">${l}</span>${sub ? `<span class="xs mu">${sub}</span>` : ''}</span><span class="bb num">${r}</span></div>`;
const step5 = (on, labels) => `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">${labels.map((l, i) => `<div style="display:grid;gap:5px"><i style="display:block;height:8px;border-radius:9px;background:${i === on ? 'var(--lime)' : 'var(--a-line)'}${i === on ? ';box-shadow:0 0 0 1.5px var(--a-ink)' : ''}"></i><span style="font-size:9.5px;font-weight:${i === on ? 800 : 600};color:${i === on ? 'var(--a-ink)' : 'var(--a-mute)'};text-align:center;line-height:1.1">${l}</span></div>`).join('')}</div>`;
const STUFEN = ['Defensiv', 'Vorsichtig', 'Selektiv', 'Konstruktiv', 'Breit konstr.'];
const last2 = a => a[a.length - 1];
const chg1 = a => (a[a.length - 1] / a[a.length - 2] - 1) * 100;

/* Kurzbeschreibungen, die nicht in VU.WHAT stehen (aus den Discover-Karten) */
const GD = { t: 'GDYN', n: 'Grid Dynamics', w: '+65 %', story: 'Auf dem höchsten Stand des Jahres', hook: 'Der Umsatz hat sich in 5 Jahren mehr als verdreifacht.' };

chapter({ n: '02', title: 'Discover', icon: 'discover', anchor: 'discover', was: 'Aktien finden ohne Fachwissen: <b>eine Frage oben, ein Satz je Aktie</b>, Themen, Strategien und Swipen. Und die eine Aktienseite für alle Welten.', pages: 'D01–D09 · 9 Seiten' });

/* ======================================================================
   D01 · Übersicht
   ====================================================================== */
const idx = [['QQQ', 'Nasdaq 100'], ['SPY', 'S&P 500'], ['DIA', 'Dow Jones']];
screen('d01-a', { world: 'discover', dock: 0, h: 3050, body: `
<div class="ltag">Discover · Schluss Fr. 30.10.</div>
<div class="lt" style="margin-top:4px">Was bewegt<br>die Börse heute?</div>
<p class="mu" style="margin-top:8px;font-size:15px">Aktien finden, verstehen, merken. Ohne Fachwissen.</p>
<div style="margin-top:14px">${search('Aktie, Thema oder Frage …')}</div>
<div class="chips" style="margin-top:12px">${['i-globe|Welten', 'i-target|Strategien', 'i-swipe|Swipen', 'i-signal|Märkte'].map(x => { const [i, l] = x.split('|'); return `<span class="chip">${ic(i, 17)}${l}</span>`; }).join('')}</div>

${sect('Der Markt heute', 'Märkte')}
<div class="card ink" style="padding:16px">
 <div style="display:flex;justify-content:space-between;align-items:center"><span class="ltag" style="color:#9b9b9b">Marktbarometer · US-Aktien</span><span class="xs b" style="opacity:.7">Stufe 2 von 5</span></div>
 <div style="font-size:30px;font-weight:900;letter-spacing:-.04em;color:var(--lime);margin-top:6px">Vorsichtig</div>
 <p class="sm" style="opacity:.8;margin-top:4px">Normale Schwankungen, aber der Trend ist noch nicht breit bestätigt.</p>
 <div style="margin-top:12px;--a-line:#2a2a2a;--a-ink:#fff;--a-mute:#8c8c8c">${step5(1, STUFEN)}</div>
</div>
<div class="grid3" style="margin-top:10px">${idx.map(([t, n]) => `<div class="card" style="padding:10px"><b class="xs" style="display:block">${n}</b><div style="margin:6px 0">${sp(X[t], 88, 30)}</div>${P(pc(chg1(X[t])))}</div>`).join('')}</div>
<div style="margin-top:8px">${help('Gemessen an den Fonds QQQ, SPY und DIA, die den Index nachbilden. Nicht der offizielle Indexstand.')}</div>

${sect('Heute im Blick', '1 von 5')}
<div class="card" style="padding:16px">
 <div style="display:flex;align-items:center;gap:10px">${lg('GDYN', 1)}<div style="flex:1;min-width:0"><b style="display:block;font-size:18px;letter-spacing:-.02em">Grid Dynamics</b><span class="mu xs b">GDYN · Software und IT-Dienste</span></div><span class="hb" style="background:var(--a-bg)">${ic('i-heart', 18)}</span></div>
 <div style="margin-top:14px;display:flex;align-items:center;gap:10px">${BIG('+65 %')}<span class="mu sm b">in 12 Monaten</span></div>
 <div class="mt" style="margin-top:10px">Auf dem höchsten Stand des Jahres</div>
 <div style="margin-top:12px">${chart(X.GDYN, { w: 322, h: 110, axis: ['30.10.25', '30.10.26'] })}</div>
 <div class="ltag" style="margin-top:12px">Warum heute?</div>
 <div class="chips" style="flex-wrap:wrap;white-space:normal;margin-top:6px">${pill('Schlusskurs: höchster seit 52 Wochen', 'lm')}${cp('Ausbruch mit Volumen')}${cp('Volumen 6,0× Ø 20 Tage')}</div>
 <div style="margin-top:12px">${help('Ausbruch: Der Kurs steigt über seine Durchschnitte, und es wird viel mehr gehandelt als sonst.')}</div>
 <div class="grid2" style="margin-top:14px"><span class="btn ink" style="height:46px;font-size:14.5px">Aktie ansehen</span><span class="btn" style="height:46px;font-size:14.5px">${ic('i-swipe', 18)}Swipen</span></div>
</div>
<div style="display:flex;justify-content:center;gap:6px;margin-top:10px">${[1, 0, 0, 0, 0].map(o => `<i style="width:${o ? 18 : 6}px;height:6px;border-radius:9px;background:${o ? 'var(--a-ink)' : 'var(--a-line)'}"></i>`).join('')}</div>

${sect('Themenwelten', 'Alle 54')}
${hscroll([theme('01-kuenstliche-intelligenz', 'Künstliche Intelligenz', 'Neue Software', 30, 190), theme('02-halbleiter-chips', 'Halbleiter & Chips', 'Große Wirkung', 30, 190), theme('03-rechenzentren-cloud', 'Rechenzentren & Cloud', 'Fundament der Cloud', 30, 190)], 160)}

${sect('Die stärksten Aktien', 'Alle')}
<div class="seg"><span class="on">Alle</span><span>S&amp;P 500</span><span>Nasdaq 100</span><span>Dow</span></div>
<div style="margin-top:6px">
${rank(1, 'ECO', 'Okeanis Eco Tankers', '+196 %', '12 Monate', 'Mehr als verdoppelt')}
${rank(2, 'HZO', 'Marinemax', '+115 %', '12 Monate', 'Neues Jahreshoch')}
${rank(3, 'GKOS', 'Glaukos', '+208 %', '12 Monate', 'Auf dem höchsten Stand des Jahres')}
${rank(4, 'CDNA', 'Caredx', '+512 %', '12 Monate', 'Auf dem höchsten Stand des Jahres')}
</div>
<div style="margin-top:6px">${help('„Stark“ heißt hier: Der Kurs lief über Monate besser als der Rest. Das sagt nichts über die Zukunft.')}</div>

${sect('Neue Jahreshochs', '370 Treffer')}
<div class="card" style="padding:4px 14px">
${rank(1, 'HZO', 'Marinemax', '+115 %', '12 Monate', 'Höchster Schluss seit 12 Monaten')}
${rank(2, 'HOG', 'Harley-Davidson', '+23 %', '3 Monate', 'Wieder im Aufwind')}
${rank(3, 'DFIN', 'Donnelley Financial', '+50 %', '12 Monate', 'Gehört zu den Marktführern')}
</div>

${sect('Strategien', 'Alle 23')}
<div class="stack">
${navcard('i-bars', 'Umsatz wächst stark', '616 Aktien · 3 Jahre je ≥ 15 %')}
${navcard('i-target', 'Qualität + Wachstum', '385 Aktien · wächst und verdient')}
${navcard('i-signal', 'Cashflow-Maschinen', '588 Aktien · ≥ 15 Cent je Dollar')}
</div>

${sect('Bekannte Namen in Bewegung', 'Alle')}
${row('LLY', 'Pharma · auf Jahreshoch')}${row('TSLA', 'Wieder im Aufwind')}${row('COST', WHAT.COST)}

<div class="card lime" style="margin-top:22px;padding:18px;display:flex;gap:14px;align-items:center">${hud('discover', 48, 14)}<div style="flex:1"><b style="font-size:17px;display:block;letter-spacing:-.02em">400 Aktien, eine nach der anderen</b><span class="sm">Wische nach rechts zum Merken.</span></div>${ic('i-next', 20)}</div>
<p class="xs mu" style="margin-top:18px">Discover zeigt Kursverhalten, keine Anlageempfehlung. Daten: Tiingo, SEC. Stand 30.10.2026.</p>
` });

screen('d01-b', { world: 'discover', dock: 0, body: `<div class="ltag">Discover · Schluss Fr. 30.10.</div><div class="lt" style="margin-top:4px">Was bewegt<br>die Börse heute?</div><div style="margin-top:14px">${search()}</div>`,
  overlay: sheet(`<div class="ltag">Heute im Blick · Grid Dynamics</div><div class="mt" style="margin-top:4px">Warum steht diese Aktie hier?</div>
  <p class="sm mu" style="margin-top:6px">Feste Regeln, kein Bauchgefühl. Jeder Punkt zählt zur Wertung „Heute im Blick“.</p>
  <div class="card" style="margin-top:12px;padding:4px 14px">
   ${lineItem('Schlusskurs', vd('s', 'Jahreshoch'), 'höchster seit 52 Wochen')}
   ${lineItem('Ausbruch', vd('s', 'Ja'), 'über den Durchschnitten, mit Volumen')}
   ${lineItem('Volumen', '6,0×', 'gehandelte Stück gegenüber Ø 20 Tage')}
   ${lineItem('Seit 6 Monaten', P('+130 %'), 'starke Dynamik')}
   ${lineItem('Geschäft', vd('s', 'Wächst'), 'Umsatz in 5 Jahren mehr als verdreifacht (SEC)')}
  </div>
  <div style="margin-top:12px">${help('Volumen: wie viele Aktien an einem Tag gehandelt werden. 6,0× heißt sechsmal so viel wie üblich.')}</div>
  <div style="margin-top:12px">${help('Wertung 96 von 100: 70 % Ereignisse des letzten Handelstags, 30 % Stärke über Monate.')}</div>
  <div class="btn ink" style="margin-top:16px">Aktie ansehen</div>`, 250) });

slide({ id: 'D01', title: 'Discover · Übersicht', route: '/discover/#/', now: 'D01',
  sub: 'Heute: Hero mit Weltkugel, drei Knöpfe, viele gleich aussehende Karussells. Neu: eine Frage oben, darunter in fester Reihenfolge Markt, eine Aktie des Tages mit Begründung, Themen, Ranglisten.',
  neu: [['d01-a', 'Start, ganze Seite'], ['d01-b', 'Sheet „Warum steht diese Aktie hier?“']],
  spec: {
    aufbau: ['Kopf: Datum des Schlusskurses, Frage-Überschrift, Suche mit Atlas, Schnellzugriffe (Welten, Strategien, Swipen, Märkte)',
      'Der Markt heute: Barometer-Karte (schwarz, Stufe 2 von 5 mit 5er-Skala) + 3 Index-Kacheln mit Mini-Chart und Tagesbewegung', 'Heute im Blick: eine große Karte (Klartext-Zahl, Klartext-Satz, Chart 1 Jahr, Gründe als Chips, „?“), Punkte 1 von 5, Knöpfe Aktie ansehen / Swipen',
      'Themenwelten: Bildkarten seitlich wischbar, „Alle 54“', 'Die stärksten Aktien: Reiter Alle / S&P 500 / Nasdaq 100 / Dow, Rangliste 1–4', 'Neue Jahreshochs (Anzahl Treffer), Strategien (3 Karten mit Trefferzahl), Bekannte Namen', 'Neongrüne Karte „400 Aktien“ → Swipen, Hinweis keine Anlageempfehlung'],
    komponenten: ['C01 Kopfzeile', 'C02 Produkt-Leiste (Platz Discover)', 'C20 Suche', 'C06 Chart', 'C07 Kursbewegung', 'C08 Urteil', 'C09 Erklärung', 'C10 Aktienzeile', 'C12 Navigationskarte', 'C13 Abschnittstitel', 'C14 Reiter', 'C16 Sheet', 'Discover-Muster: Klartext-Zahl (große Pille + Satz)', 'Discover-Muster: Ranglistenzeile (Rang, Logo, Satz, Pille)', 'Discover-Muster: Stufen-Skala 5'],
    daten: ['discover/data/home/US_REAL.json (surfaces: hero, top-10, top-sp500/ndx/djia) und US_REAL.2/3.json (new-52-week-highs, Themen, bekannte-namen)', 'Hero-Karte: cards[].plain, .imBlick.reasons, .badges, .hook', 'quant/data/market/intelligence/market-pulse.json (environment.level, label, statement)', 'quant/data/market/multi-asset/series/QQQ|SPY|DIA.json', 'Trefferzahlen: discover/data/rows/US_REAL/<row>.json → coverage.matched'],
    weg: ['Hero mit Weltkugel und Werbe-Claim „Sieh den Markt mit anderen Augen“', 'Knopf-Trio „Jetzt entdecken / Themenwelten / Märkte“ → Chips unter der Suche', 'Mini-Reiter Chart/Umsatz/Gewinn/Cashflow auf jeder Karte → nur auf der Aktienseite', 'Grüne Werbekachel „Neue Perspektiven“ und Rot/Grün-Zahlen', '„Market Pulse“-Block wandert in „Der Markt heute“', 'Fußzeile mit Links → Menü']
  } });

/* ======================================================================
   D02 · Welten
   ====================================================================== */
const BER = [['Technologie', 11], ['Gesundheit', 6], ['Energie & Rohstoffe', 7], ['Industrie', 17], ['Finanzen', 4], ['Konsum', 9]];
const tl = (t, n) => `<div class="kv"><span class="sm b">${t}</span><span class="mu sm b" style="display:inline-flex;gap:8px;align-items:center">${n} Aktien ${ic('i-next', 14)}</span></div>`;
const bhead = (t, n) => `<div class="st" style="margin-top:26px">${t}<a>${n} Themen</a></div>`;
screen('d02-a', { world: 'discover', dock: 1, h: 2910, body: `
<div class="ltag">Discover · Welten</div>
<div class="lt" style="margin-top:4px">Themenwelten</div>
<p class="mu" style="margin-top:8px;font-size:15px">54 Megatrends und Branchen. Tippe ein Thema und sieh, welche Firmen dahinter stehen.</p>
<div style="margin-top:14px">${search('Thema suchen, z. B. Uran …')}</div>
<div class="chips" style="margin-top:12px"><span class="chip on">Alle</span>${BER.slice(0, 4).map(([b]) => `<span class="chip">${b}</span>`).join('')}</div>

<div style="margin-top:18px">${theme('01-kuenstliche-intelligenz', 'Künstliche Intelligenz', 'Chips, Software und Rechenzentren', 30, 210)}</div>
<div class="xs mu b" style="margin-top:6px">Meistgeöffnet · NVIDIA steht hier auf Rang 18</div>

${bhead('Technologie & Vernetzung', 11)}
<div class="grid2">${theme('02-halbleiter-chips', 'Halbleiter & Chips', 'Große Wirkung', 30)}${theme('03-rechenzentren-cloud', 'Rechenzentren & Cloud', 'Fundament der Cloud', 30)}${theme('04-cybersecurity', 'Cybersecurity', 'Digitaler Schutz', 24)}${theme('05-quantencomputing', 'Quantencomputing', 'Neue Ära', 10)}${theme('10-autonomes-fahren', 'Autonomes Fahren', 'Ohne Fahrer', 10)}${theme('39-streaming-gaming', 'Streaming & Gaming', 'Auf Abruf', 16)}</div>
<div class="card" style="margin-top:10px;padding:2px 14px">${tl('Satelliten & Konnektivität', 7)}${tl('Medien & Werbung', 30)}${tl('Telekommunikation & Netze', 30)}${tl('Unternehmenssoftware & IT', 30)}</div>

${bhead('Gesundheit', 6)}
<div class="grid2">${theme('19-biotechnologie', 'Biotechnologie', 'Leben neu verstehen', 30)}<div class="card" style="padding:2px 12px">${['Genomik', 'Medizintechnik', 'Pharma', 'Longevity', 'Gesundheits&shy;dienste'].map(t => `<div class="kv"><span class="sm b">${t}</span>${ic('i-next', 14)}</div>`).join('')}</div></div>

${bhead('Energie & Rohstoffe', 7)}
<div class="grid2">${theme('12-erneuerbare-energien', 'Erneuerbare Energien', 'Energiewende', 14)}${theme('14-kernenergie-uran', 'Kernenergie & Uran', 'Grundlast', 12)}</div>
<div class="card" style="margin-top:10px;padding:2px 14px">${tl('Batterien & Energiespeicher', 14)}${tl('Wasserstoff', 6)}${tl('Stromnetze & Elektrifizierung', 30)}${tl('Rohstoffe & Bergbau', 30)}${tl('Öl, Gas & Versorger', 30)}</div>

${bhead('Industrie', 17)}
<div class="grid2">${theme('16-raumfahrt', 'Raumfahrt', 'Wirtschaft im All', 16)}${theme('07-robotik-automation', 'Robotik & Automation', 'Fabriken automatisieren', 20)}${theme('18-defense-aerospace', 'Defense & Aerospace', 'Sicherheit', 30)}<div class="card" style="display:grid;place-items:center;text-align:center"><div><b class="mt">+14</b><div class="mu sm b">weitere Themen</div></div></div></div>

${bhead('Finanzen & Immobilien', 4)}
<div class="grid2">${theme('29-banken-fintech', 'Banken & Fintech', 'Geld wird digital', 30)}<div class="card" style="padding:2px 12px">${['Versicherungen', 'Immobilien & REITs', 'Finanzdienste'].map(t => `<div class="kv"><span class="sm b">${t}</span>${ic('i-next', 14)}</div>`).join('')}</div></div>

${bhead('Konsum & Mobilität', 9)}
<div class="grid2">${theme('32-konsum-marken', 'Konsum & Marken', 'Starke Marken', 30)}${theme('09-elektromobilitaet', 'Autos & Mobilität', 'Vom E-Auto bis Lkw', 30)}</div>
<div style="margin-top:14px">${help('Themenwelten sind eine redaktionelle Zuordnung: Wer zum Thema gehört, entscheidet die Redaktion. Die Zahlen auf den Karten kommen aus den Kursdaten.')}</div>
` });

const EN = [['Batterien & Energiespeicher', 'Speicher, Zellen, Materialien', 14, null], ['Erneuerbare Energien', 'Solar, Wind und Speicher', 14, '12-erneuerbare-energien'], ['Wasserstoff', 'Elektrolyse und Brennstoffzellen', 6, null], ['Kernenergie & Uran', 'Uran, Reaktoren, kleine Kraftwerke', 12, '14-kernenergie-uran'], ['Stromnetze & Elektrifizierung', 'Netze, Trafos, Leitungsbau', 30, null], ['Rohstoffe & Bergbau', 'Kupfer, Lithium, Gold', 30, null], ['Öl, Gas & Versorger', 'Förderung, Raffinerien, Versorger', 30, '41-oel-gas']];
screen('d02-b', { world: 'discover', dock: 1, h: 1000, body: `
<div class="ltag">Discover · Welten</div>
<div class="lt" style="margin-top:4px">Themenwelten</div>
<div class="chips" style="margin-top:14px"><span class="chip">Alle</span><span class="chip on">Energie &amp; Rohstoffe · 7</span><span class="chip">Industrie</span></div>
<div class="stack" style="margin-top:16px">${EN.map(([t, s, n, img]) => `<div class="card" style="display:flex;gap:12px;align-items:center;padding:10px">${img ? `<img src="img/${img}.webp" alt="" style="width:64px;height:64px;border-radius:14px;object-fit:cover;flex:none">` : `<span class="hud" style="width:64px;height:64px;border-radius:14px">${ic('i-globe', 64)}</span>`}<div style="flex:1;min-width:0"><b style="display:block;font-size:15px">${t}</b><span class="mu xs b">${s}</span></div><span class="xs b mu" style="white-space:nowrap">${n} Aktien</span></div>`).join('')}</div>
<div style="margin-top:14px">${help('Fehlt ein Bild, zeigt die Karte das Icon. Keine leeren dunklen Platzhalter mehr.')}</div>
` });

slide({ id: 'D02', title: 'Discover · Welten', route: '/discover/#/welten', now: 'D02',
  sub: 'Heute: 54 gleich große Bildkacheln, 27 davon mit leerem Platzhalterbild, über 12.000 px lang. Neu: Bereich-Filter oben, große Bilder nur für die wichtigsten Themen, der Rest als kompakte Zeilen.',
  neu: [['d02-a', 'Alle 54 Welten, nach Bereich'], ['d02-b', 'Filter „Energie & Rohstoffe“ aktiv']],
  spec: {
    aufbau: ['Titel, Satz „54 Megatrends“, Themensuche', 'Bereich-Chips: Alle, Technologie, Gesundheit, Energie & Rohstoffe, Industrie, Finanzen, Konsum', 'Meistgeöffnetes Thema als große Bildkarte', 'Je Bereich: Titel mit Anzahl Themen, 2er-Raster Bildkarten (nur Themen mit Bild), übrige Themen als Zeilen mit Aktienzahl', 'Hinweis redaktionelle Zuordnung', 'Filter-Zustand: Liste mit Vorschaubild oder Icon, Untertitel, Aktienzahl'],
    komponenten: ['C02 Produkt-Leiste (Platz Welten)', 'C20 Suche', 'C09 Erklärung', 'C13 Abschnittstitel', 'Discover-Muster: Themenkarte (Bild, Titel, Untertitel, Aktienzahl)', 'Discover-Muster: Themenzeile'],
    daten: ['discover/config/themes.json (54 Themen: id, title, lead, world = Bereich)', 'Aktienzahl: discover/data/rows/US_REAL/thema-<id>.json → cards.length', 'Bilder: assets/themen/<NN>-<id>.webp'],
    weg: ['Kacheln mit leerem dunklem Verlauf statt Bild → Zeile mit Icon', 'Gleiches Gewicht für alle 54 Themen → Bilder nur dort, wo vorhanden', 'Kopfbild der Seite entfällt']
  } });

/* ======================================================================
   D03 · Thema KI
   ====================================================================== */
const KI = [['ADI', '+77 %', '12 Mon.', 'Gehört zu den Marktführern'], ['TXN', '+88 %', '12 Mon.', 'Gehört zu den Marktführern'], ['AAPL', '+28 %', '12 Mon.', 'Fast wieder am Jahreshoch'], ['SWKS', '+43 %', '3 Mon.', 'Wieder im Aufwind', 'Skyworks Solutions'], ['AMD', '+40 %', '6 Mon.', 'Seit Monaten im Aufwärtstrend'], ['MU', '+290 %', '12 Mon.', 'Mehr als verdreifacht'], ['MSFT', '−3,6 %', '12 Mon.', 'Etwas unter Vorjahr'], ['EQIX', '+27 %', '12 Mon.', 'Seit einem Jahr im Plus', 'Equinix'], ['MRVL', '+118 %', '12 Mon.', 'Mehr als verdoppelt'], ['PLTR', '+47 %', '3 Mon.', 'Wieder im Aufwind'], ['CRM', '−8,9 %', '12 Mon.', 'Etwas unter Vorjahr'], ['TSLA', '+2,3 %', '6 Mon.', 'Durchgehend im Aufwärtstrend'], ['AMAT', '+65 %', '12 Mon.', 'Über zwölf Monate im Plus'], ['NVDA', '+46 %', 'Umsatz p. a.', '10 Jahre gewachsen, immer profitabel']];
screen('d03-a', { world: 'discover', dock: 1, h: 1890, body: `
<div style="display:flex;align-items:center;gap:8px" class="sm b mu">${ic('i-back', 16)}Themenwelten</div>
<div class="cimg" style="height:260px;margin-top:10px"><img src="img/01-kuenstliche-intelligenz.webp" alt=""><div class="t" style="padding:16px"><span style="color:var(--lime);font-size:10.5px;letter-spacing:.07em;font-weight:800">THEMENWELT · TECHNOLOGIE</span><div style="font-size:28px;font-weight:900;letter-spacing:-.04em;margin-top:4px">Künstliche Intelligenz</div><span>Chips, Software und Rechenzentren</span></div></div>
<div class="grid3" style="margin-top:12px">${tile('Aktien', '30', 'im Thema')}${tile('12 Monate', '17 / 30', 'im Plus')}${tile('Heute', '2 / 30', 'im Plus')}</div>
<div style="margin-top:10px">${help('„17 / 30 im Plus“: 17 der 30 Firmen stehen heute höher als vor einem Jahr.')}</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px"><b style="font-size:17px">Die Firmen</b><span class="chip" style="height:32px;font-size:13px">${ic('i-filter', 15)}Stärke</span></div>
<div style="margin-top:4px">${KI.map(([t, w, l, s, n]) => trow(t, w, l, s, n)).join('')}</div>
<div class="btn line" style="margin-top:12px">Alle 30 zeigen</div>
${sect('Verwandte Themen')}
${hscroll([theme('02-halbleiter-chips', 'Halbleiter & Chips', 'Große Wirkung', 30, 120), theme('03-rechenzentren-cloud', 'Rechenzentren', 'Cloud', 30, 120), theme('07-robotik-automation', 'Robotik', 'Automation', 20, 120)], 150)}
<div style="margin-top:14px">${help('Redaktionelle Zuordnung. Die Reihenfolge „Stärke“ folgt der Discover-Methodik, nicht einer Empfehlung.')}</div>
` });

screen('d03-b', { world: 'discover', dock: 1, body: `<div class="cimg" style="height:200px"><img src="img/01-kuenstliche-intelligenz.webp" alt=""><div class="t" style="padding:16px"><div style="font-size:26px;font-weight:900">Künstliche Intelligenz</div></div></div>${trow('ADI', '+77 %', '12 Mon.', 'Gehört zu den Marktführern')}${trow('TXN', '+88 %', '12 Mon.', 'Gehört zu den Marktführern')}`,
  overlay: sheet(`<div class="mt">Sortieren und filtern</div>
  <div class="ltag" style="margin-top:14px">Reihenfolge</div>
  <div class="stack" style="margin-top:8px;gap:0">${[['Stärke (Vorgabe)', 1], ['Bewegung 12 Monate', 0], ['Bewegung heute', 0], ['Umsatzwachstum', 0], ['Name A–Z', 0]].map(([t, o]) => `<div class="kv"><span class="sm b">${t}</span>${o ? `<span style="width:22px;height:22px;border-radius:50%;background:var(--lime);display:grid;place-items:center;color:#000">${ic('i-check', 14)}</span>` : `<span style="width:22px;height:22px;border-radius:50%;border:1.5px solid var(--a-line)"></span>`}</div>`).join('')}</div>
  <div class="ltag" style="margin-top:14px">Nur zeigen</div>
  <div class="kv"><span class="sm b">Über 12 Monate im Plus</span>${toggle(0)}</div>
  <div class="kv"><span class="sm b">Schreibt Gewinn</span>${toggle(0)}</div>
  <div class="kv"><span class="sm b">Auf meiner Watchlist</span>${toggle(0)}</div>
  <div class="btn" style="margin-top:14px">30 Aktien zeigen</div>`, 240) });

slide({ id: 'D03', title: 'Discover · Thema KI', route: '/discover/#/c/US_REAL/thema-ki', now: 'D03',
  sub: 'Heute: 30 hohe Karten im 2er-Raster, abgeschnittene Namen, Kurse in Rot und Grün. Neu: Kopfbild, drei Kennzahlen zum Thema, eine Liste mit einer Zeile je Firma.',
  neu: [['d03-a', 'Thema, ganze Seite'], ['d03-b', 'Sheet Sortieren und filtern']],
  spec: {
    aufbau: ['Zurück zu Themenwelten', 'Kopfbild mit Bereich, Titel, Lead', 'Drei Kacheln: Aktien im Thema, wie viele 12 Monate im Plus, wie viele heute im Plus + „?“', 'Liste „Die Firmen“ mit Sortier-Chip: Logo, Name, Klartext-Satz, Mini-Chart 1 Jahr, Klartext-Zahl mit Zeitraum', '„Alle 30 zeigen“', 'Verwandte Themen (Bildkarten wischbar)', 'Hinweis redaktionelle Zuordnung', 'Sheet: Reihenfolge (Stärke, 12 Monate, heute, Umsatzwachstum, Name) und Filter'],
    komponenten: ['C02 Produkt-Leiste (Platz Welten)', 'C11 Kachel', 'C09 Erklärung', 'C15 Schalter', 'C16 Sheet', 'Discover-Muster: Aktienzeile mit Klartext-Zahl (statt Tagesbewegung)'],
    daten: ['discover/data/rows/US_REAL/thema-ki.json (cards[].plain.zahl, .plain.story, metrics.return12M, changePercent)', 'discover/config/themes.json (lead, world)', 'Mini-Chart: quant/data/market/discover-series/ref_<T>.json'],
    weg: ['Hohe Karten im 2er-Raster mit abgeschnittenen Texten („Nummer 2 i…“, „Zwischend…“)', 'Euro- und Dollar-Kurs auf jeder Karte → nur auf der Aktienseite', 'Rot/Grün → Pillen neongrün/schwarz']
  } });

/* ======================================================================
   D04 · Strategien
   ====================================================================== */
const STR = [
  ['Was gerade passiert', 'Kurs bewegt sich auffällig', 'i-signal', [['Heute im Blick', 'Jahreshochs, Ausbrüche, Volumen', 435, 'GDYN', '+65 %'], ['Neue Jahreshochs', 'Höchster Stand seit 12 Monaten', 370, 'HZO', '+115 %'], ['Gerade in Bewegung', 'Viel Handel, Kurs zieht an', 39, 'DFIN', '+37 %'], ['Bekannte Namen in Bewegung', 'Alltagsmarken mit Bewegung', 36, 'HAS', '+53 %'], ['Überraschungen', 'Stark, aber kaum bekannt', 516, 'ECO', '+196 %'], ['Comeback?', 'Erst gefallen, jetzt wieder im Plus', 250, 'MRNA', '+798 %']]],
  ['Stärke über Monate', 'Kurs läuft besser als der Markt', 'i-line', [['Die stärksten Aktien', 'Führen den Markt über Monate an', 2585, 'ECO', '+196 %'], ['Stärkste im S&amp;P 500', 'Die 500 größten US-Firmen', 493, 'PSX', '+105 %'], ['Stärkste im Nasdaq-100', 'Die 100 größten Nasdaq-Firmen', 98, 'MRNA', '+798 %'], ['Stärkste im Dow Jones', 'Die 30 Klassiker', 30, 'MRK', '+73 %'], ['Seit Monaten im Aufwind', 'Stärkste Entwicklung zuletzt', 2585, 'GKOS', '+69 %'], ['Dem Markt voraus', 'Besser als der Gesamtmarkt', 2585, 'GKOS', '+208 %'], ['Stabile Aufwärtstrends', 'Ruhig und stetig nach oben', 842, 'CHT', '+13,5 %']]],
  ['Das Geschäft wächst', 'Zahlen aus SEC-Berichten', 'i-bars', [['Umsatz wächst stark', '3 Jahre je mind. 15 % mehr Umsatz', 616, 'MSC', '+292 %'], ['Gewinne beschleunigen', 'Gewinn wächst schneller als im Vorjahr', 649, 'KRG', '35 %'], ['Margen werden stärker', 'Bleibt mehr vom Umsatz übrig', 904, 'GRAB', '8,0 %'], ['Cashflow-Maschinen', 'Mind. 15 Cent frei je Dollar Umsatz', 588, 'NRP', '107 %'], ['Profitables Wachstum', 'Wächst, verdient, erzeugt Cash', 378, 'ALAB', '+120 %'], ['Fundamentale Turnarounds', 'Vor 2 Jahren Verlust, heute Gewinn', 325, 'GDYN', '2,3 %']]],
  ['Qualität', 'Gute Firma, solide Basis', 'i-star', [['Qualität + Wachstum', 'Wächst zweistellig, Marge ≥ 10 %', 385, 'NBIS', '+240 %'], ['Langfristige Compounder', '10 Jahre Wachstum, immer Gewinn', 184, 'TKR', '+72 %'], ['Qualität zum vernünftigen Preis', 'Marge ≥ 10 %, KGV bis 20', 402, 'WSE', '26 %'], ['Starke Bilanz + Wachstum', 'Mehr Kasse als Schulden', 126, 'IMMR', '+271 %']]]
];
const sItem = ([t, s, n, top, w]) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--a-line)"><div style="flex:1;min-width:0"><b style="display:block;font-size:15px">${t}</b><span class="mu xs b">${s}</span></div><div style="text-align:right;display:grid;justify-items:end;gap:3px"><span class="xs b num">${n.toLocaleString('de-DE')} Treffer</span><span class="xs mu b">Nr. 1: ${top}</span></div>${ic('i-next', 16)}</div>`;
screen('d04-a', { world: 'discover', dock: 2, h: 2150, body: `
<div class="ltag">Discover · Strategien</div>
<div class="lt" style="margin-top:4px">Strategien</div>
<p class="mu" style="margin-top:8px;font-size:15px">23 Auswahlen mit festen Regeln. Jede zeigt, wie viele Aktien die Regel heute erfüllen.</p>
<div class="chips" style="margin-top:14px"><span class="chip on">Alle 23</span>${STR.map(g => `<span class="chip">${g[0].split(' ')[0] === 'Das' ? 'Geschäft' : g[0].split(' ')[0] === 'Was' ? 'Bewegung' : g[0].split(' ')[0]}</span>`).join('')}</div>
<div class="card ink" style="margin-top:16px;padding:16px;display:flex;gap:12px;align-items:center">${hud('discover', 46, 13)}<div style="flex:1"><div class="ltag" style="color:#9b9b9b">Beliebteste Auswahl</div><b style="font-size:18px;display:block">Heute im Blick</b><span class="sm" style="opacity:.75">435 Aktien haben sich am 30.10. auffällig bewegt</span></div>${ic('i-next', 18)}</div>
${STR.map(([g, s, i, items]) => `<div style="margin-top:24px;display:flex;align-items:center;gap:10px"><span class="hud" style="width:34px;height:34px;border-radius:10px">${ic(i, 34)}</span><div><b style="font-size:18px;letter-spacing:-.02em;display:block">${g}</b><span class="mu xs b">${s} · ${items.length} Auswahlen</span></div></div><div style="margin-top:6px">${items.map(sItem).join('')}</div>`).join('')}
<div style="margin-top:16px">${help('Treffer: so viele der 6.103 US-Aktien erfüllen die Regel heute. Gezeigt werden die besten 30.')}</div>
` });

screen('d04-b', { world: 'discover', dock: 2, h: 1160, body: `
<div style="display:flex;align-items:center;gap:8px" class="sm b mu">${ic('i-back', 16)}Strategien</div>
<div class="ltag" style="margin-top:12px">Das Geschäft wächst</div>
<div class="lt" style="margin-top:2px">Umsatz wächst stark</div>
<p class="mu" style="margin-top:8px;font-size:15px">Firmen, deren Umsatz drei Jahre lang um mindestens 15 % pro Jahr gewachsen ist.</p>
<div class="grid3" style="margin-top:14px">${tile('Treffer', '616', 'von 6.103')}${tile('Gezeigt', '30', 'die stärksten')}${tile('Quelle', 'SEC', 'Jahresberichte')}</div>
<div class="card line" style="margin-top:12px"><div class="ltag">Die Regel</div><p class="sm" style="margin-top:6px"><b>Umsatz-Wachstum pro Jahr über 3 Geschäftsjahre ≥ 15 %.</b> Nur Firmen mit mindestens 100 Mio. $ Umsatz. Mehr als 300 % pro Jahr zählt nicht (Sondereffekt).</p></div>
<div style="margin-top:10px">${help('Pro Jahr: 15 % pro Jahr über 3 Jahre heißt, der Umsatz ist insgesamt um gut die Hälfte gestiegen.')}</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px"><b style="font-size:17px">Die Treffer</b><span class="chip" style="height:32px;font-size:13px">${ic('i-filter', 15)}Wachstum</span></div>
${rank(1, 'MSC', 'Studio City International', '+292 %', 'Umsatz p. a.', 'Umsatz wächst sehr schnell')}
${rank(2, 'LOT', 'Lotus Technology', '+279 %', 'Umsatz p. a.', 'Umsatz wächst sehr schnell')}
${rank(3, 'IMMR', 'Immersion', '+41 %', 'Umsatz p. a. 10 J.', 'In 10 Jahren mehr als verdreifacht')}
${rank(4, 'HTLM', 'HomesToLife', '+258 %', 'Umsatz p. a.', 'Wächst und verdient dabei Geld')}
${rank(5, 'NBIS', 'Nebius Group', '+240 %', 'Umsatz p. a.', 'Wächst und verdient dabei Geld')}
<div class="btn line" style="margin-top:12px">Alle 30 zeigen</div>
<div class="grid2" style="margin-top:10px"><span class="btn ink" style="height:48px;font-size:14.5px">${ic('i-swipe', 18)}Einzeln swipen</span><span class="btn line" style="height:48px;font-size:14.5px">${ic('i-filter', 18)}Im Screener</span></div>
` });

slide({ id: 'D04', title: 'Discover · Strategien', route: '/discover/#/strategien', now: 'D04',
  sub: 'Heute: 23 gleich große Bildkarten mit Stockfotos ohne Reihenfolge. Neu: vier Gruppen, je Auswahl eine Zeile mit Regel in Alltagssprache, Trefferzahl und heutiger Nr. 1.',
  neu: [['d04-a', 'Alle 23 Auswahlen in 4 Gruppen'], ['d04-b', 'Eine Strategie: Regel, Treffer, Liste']],
  spec: {
    aufbau: ['Titel, Satz „23 Auswahlen mit festen Regeln“', 'Gruppen-Chips: Alle, Bewegung, Stärke, Geschäft, Qualität', 'Schwarze Karte: beliebteste Auswahl', '4 Gruppen mit Icon und Satz: Was gerade passiert (6), Stärke über Monate (7), Das Geschäft wächst (6), Qualität (4)', 'Zeile: Name, Regel in einem Halbsatz, Trefferzahl, Nr. 1 heute', 'Detail (neue Adresse /discover/#/strategien/<rowId>): Titel, Satz, Kacheln Treffer / Gezeigt / Quelle, Karte „Die Regel“ wörtlich, „?“, Rangliste, Knöpfe Swipen und Im Screener öffnen'],
    komponenten: ['C02 Produkt-Leiste (Platz Strategien)', 'C11 Kachel', 'C09 Erklärung', 'C13 Abschnittstitel', 'Discover-Muster: Strategiezeile (Name, Regel, Treffer, Nr. 1)', 'Discover-Muster: Ranglistenzeile'],
    daten: ['discover/data/rows/US_REAL/<rowId>.json: title, subtitle, rule, coverage.matched, coverage.universeSize, cards[0]', 'Gruppierung: neues Feld group in der Row-Registry (Vorschlag), heute aus world ableitbar'],
    weg: ['Stockfoto je Strategie (Berge, Windräder) → Icon je Gruppe', 'Großschreibung gemischt („HEUTE IM BLICK“, „STÄRKSTE AKTIEN …“) → einheitliche Schreibweise', 'Keine Trefferzahl heute → Trefferzahl neu sichtbar']
  } });

/* ======================================================================
   D05 · Swipen
   ====================================================================== */
const swipeCard = (o, tilt) => `<div class="card" style="background:var(--a-bg);border:1.5px solid var(--a-line);box-shadow:0 18px 40px -18px rgb(0 0 0/.35);border-radius:28px;padding:18px;${tilt ? `transform:rotate(${tilt}deg);` : ''}">
 <div style="display:flex;justify-content:space-between;align-items:center"><span class="ltag">${o.her}</span><span class="xs b mu num">${o.pos}</span></div>
 <div style="display:flex;align-items:center;gap:10px;margin-top:12px">${lg(o.t, 1)}<div style="min-width:0"><b style="display:block;font-size:21px;letter-spacing:-.03em;line-height:1.1">${o.n}</b><span class="mu xs b">${o.t} · ${o.what}</span></div></div>
 <div style="margin-top:16px;display:flex;align-items:center;gap:10px">${BIG(o.w)}<span class="mu sm b">${o.lab}</span></div>
 <div class="mt" style="margin-top:10px">${o.story}</div>
 <div style="margin-top:12px">${chart(o.a, { w: 316, h: 120, axis: ['30.10.25', '30.10.26'] })}</div>
 <div class="chips" style="flex-wrap:wrap;white-space:normal;margin-top:12px">${o.chips.map((c, i) => pill(c, i ? '' : 'lm')).join('')}</div>
 <div style="margin-top:12px;display:flex;gap:8px;align-items:flex-start" class="sm b">${hud('fundamental', 24, 7)}<span>${o.hook}</span></div>
</div>`;
const swipeBtns = `<div style="display:flex;justify-content:center;align-items:center;gap:18px;margin-top:16px"><span style="width:62px;height:62px;border-radius:50%;background:var(--a-card);display:grid;place-items:center">${ic('i-x', 26)}</span><span style="width:52px;height:52px;border-radius:50%;background:var(--a-ink);color:var(--a-inv);display:grid;place-items:center">${ic('i-next', 22)}</span><span style="width:62px;height:62px;border-radius:50%;background:var(--lime);color:#000;display:grid;place-items:center">${ic('i-heart', 26)}</span></div><div style="display:flex;justify-content:center;gap:38px;margin-top:6px" class="xs b mu"><span>Weiter</span><span>Öffnen</span><span>Merken</span></div>`;
const C_GD = { her: 'Heute im Blick', pos: '1 / 400', t: 'GDYN', n: 'Grid Dynamics', what: 'Software und IT-Dienste', w: '+65 %', lab: 'in 12 Monaten', story: 'Auf dem höchsten Stand des Jahres', a: X.GDYN, chips: ['Neues Jahreshoch', 'Top 2 %', '+130 % in 6 Mon.'], hook: 'Der Umsatz hat sich in 5 Jahren mehr als verdreifacht.' };
const C_ECO = { her: 'Die stärksten Aktien', pos: '2 / 400', t: 'ECO', n: 'Okeanis Eco Tankers', what: 'Öltanker-Reederei', w: '+196 %', lab: 'in 12 Monaten', story: 'Hat sich in zwölf Monaten mehr als verdoppelt', a: X.ECO, chips: ['Fast am Jahreshoch', 'Top 1 %', '+84 % in 6 Mon.'], hook: 'Der Umsatz ist in 3 Jahren um +44 % gewachsen.' };
screen('d05-a', { world: 'discover', dock: 3, body: `<div style="display:flex;justify-content:space-between;align-items:center"><div class="chips"><span class="chip on" style="height:32px;font-size:13px">Alle</span><span class="chip" style="height:32px;font-size:13px">Bekannte</span><span class="chip" style="height:32px;font-size:13px">Wachstum</span></div><span class="xs b mu">${ic('i-filter', 16)}</span></div>
<div style="margin-top:12px;position:relative">${swipeCard(C_GD)}</div>${swipeBtns}` });
screen('d05-b', { world: 'discover', dock: 3, body: `<div style="display:flex;justify-content:space-between;align-items:center"><div class="chips"><span class="chip on" style="height:32px;font-size:13px">Alle</span><span class="chip" style="height:32px;font-size:13px">Bekannte</span><span class="chip" style="height:32px;font-size:13px">Wachstum</span></div></div>
<div style="margin-top:12px;position:relative">${swipeCard(C_ECO)}</div>${swipeBtns}`,
  overlay: `<div style="position:absolute;left:18px;right:18px;top:118px;background:var(--a-ink);color:var(--a-inv);border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 12px 30px -10px rgb(0 0 0/.5)"><span style="width:30px;height:30px;border-radius:50%;background:var(--lime);color:#000;display:grid;place-items:center">${ic('i-heartf', 16)}</span><div style="flex:1"><b class="sm" style="display:block">Grid Dynamics gemerkt</b><span class="xs" style="opacity:.7">Auf deiner Watchlist</span></div><b class="sm" style="color:var(--lime)">Rückgängig</b></div>` });
screen('d05-c', { world: 'discover', dock: 3, body: `<div style="opacity:.35">${swipeCard(C_GD)}</div>`,
  overlay: `<div class="ovl" style="background:rgb(0 0 0/.88)"></div><div style="position:absolute;left:24px;right:24px;top:170px;color:#fff;text-align:center"><div style="display:flex;justify-content:space-between;align-items:center;font-weight:900;font-size:15px"><span style="display:grid;justify-items:center;gap:8px"><span style="width:64px;height:64px;border-radius:50%;background:#1a1a1a;display:grid;place-items:center">${ic('i-x', 28)}</span>Nach links:<br>weiter</span><span style="display:grid;justify-items:center;gap:8px"><span style="width:64px;height:64px;border-radius:50%;background:#fff;color:#000;display:grid;place-items:center">${ic('i-next', 28)}</span>Tippen:<br>öffnen</span><span style="display:grid;justify-items:center;gap:8px"><span style="width:64px;height:64px;border-radius:50%;background:var(--lime);color:#000;display:grid;place-items:center">${ic('i-heart', 28)}</span>Nach rechts:<br>merken</span></div><p style="margin-top:28px;font-size:22px;font-weight:900;letter-spacing:-.03em;line-height:1.15">400 Aktien, eine nach der anderen.</p><p style="margin-top:8px;color:#bdbdbd;font-size:14px">Aus 26 Sammlungen gemischt. Bekannte und unbekannte Namen im Wechsel. Keine Empfehlung.</p><div class="btn" style="margin-top:22px">Los geht’s</div></div>` });

slide({ id: 'D05', title: 'Discover · Swipen', route: '/discover/#/einzeln/US_REAL', newRoute: '/discover/#/swipen', now: 'D05',
  sub: 'Heute heißt der Platz „Entdecken“, die Karte zeigt keine Knöpfe zum Merken oder Weiterblättern. Neu: echte Swipe-Karten mit drei klaren Gesten.',
  neu: [['d05-a', 'Karte 1 von 400'], ['d05-b', 'Nach rechts gewischt: gemerkt'], ['d05-c', 'Erster Start: Gesten erklärt']],
  spec: {
    aufbau: ['Filter-Chips: Alle, Bekannte, Wachstum (Sammlungen aus feed.rule)', 'Karte: Herkunft (Sammlung) und Position, Logo, Name, Kurzbeschreibung, Klartext-Zahl, Klartext-Satz, Chart 1 Jahr, drei Gründe als Chips, ein Satz aus den Geschäftszahlen', 'Knöpfe: Weiter (links), Öffnen (Mitte, öffnet die Aktienseite), Merken (rechts, neongrün)', 'Nach Merken: schwarzer Hinweis oben mit „Rückgängig“', 'Erster Start: Overlay mit den drei Gesten'],
    komponenten: ['C02 Produkt-Leiste (Platz Swipen)', 'C06 Chart', 'C16 Sheet / Overlay', 'Discover-Muster: Swipe-Karte', 'Discover-Muster: Hinweis (Toast) mit Rückgängig'],
    daten: ['discover/data/feed/US_REAL.json (count 400, order[].herkunft, cards[].plain, .badges, .hook)', 'Merken schreibt in die Watchlist des Kontos (Mein Bereich)'],
    weg: ['Platzname „Entdecken“ → „Swipen“', 'Mini-Reiter Chart/Umsatz/Gewinn/Cashflow auf der Karte → auf der Aktienseite', 'Hinweis „Stand … nicht aktuell“ als gelbes Etikett → Datum im Kopf der App']
  } });

/* ======================================================================
   D06 · Suchen
   ====================================================================== */
screen('d06-a', { world: 'discover', dock: 0, h: 1160, body: `
<div style="display:flex;align-items:center;gap:10px"><div style="flex:1">${search('Aktie, Thema, Frage')}</div><b class="sm">Abbrechen</b></div>
${sect('Zuletzt gesucht', 'Löschen')}
<div class="chips" style="flex-wrap:wrap">${['NVIDIA', 'Micron', 'Uran', 'Apple'].map(t => `<span class="chip">${ic('i-search', 15)}${t}</span>`).join('')}</div>
${sect('Oft gesucht')}
${row('NVDA')}${row('AAPL')}${row('TSLA')}${row('MSFT')}
${sect('Themen')}
<div class="chips" style="flex-wrap:wrap">${['Künstliche Intelligenz', 'Kernenergie & Uran', 'Raumfahrt', 'Cybersecurity'].map(t => `<span class="chip">${ic('i-globe', 15)}${t.replace('&', '&amp;')}</span>`).join('')}</div>
${sect('Frag Atlas')}
<div class="stack">${['Warum ist NVIDIA heute gefallen?', 'Welche Chip-Aktien sind günstiger als NVIDIA?', 'Was heißt KGV?'].map(q => `<div class="card" style="display:flex;gap:10px;align-items:center;padding:12px"><span style="width:30px;height:30px;border-radius:50%;background:var(--lime);display:grid;place-items:center;color:#000;flex:none">${ic('i-spark', 15)}</span><b class="sm" style="flex:1">${q}</b>${ic('i-next', 16)}</div>`).join('')}</div>
` });
const hit = (t, n, s) => `<div class="lr" style="grid-template-columns:42px 1fr auto">${lg(t)}<div class="n"><b>${n}</b><span><u style="text-decoration:none;background:var(--lime);color:#000;font-weight:800">${t.slice(0, 2)}</u>${t.slice(2)} · ${s}</span></div>${ic('i-next', 16)}</div>`;
screen('d06-b', { world: 'discover', dock: 0, body: `
<div style="display:flex;align-items:center;gap:10px"><div style="flex:1;display:flex;align-items:center;gap:10px;height:48px;border-radius:999px;background:var(--a-card);padding:0 16px;font-weight:700;font-size:15px;box-shadow:0 0 0 2px var(--a-ink) inset">${ic('i-search', 18)}<span>nv<span style="display:inline-block;width:2px;height:18px;background:var(--a-ink);vertical-align:-3px"></span></span></div><b class="sm">Abbrechen</b></div>
<div class="ltag" style="margin-top:18px">Aktien · 4 Treffer</div>
<div class="card" style="margin-top:8px;padding:2px 14px;border:2px solid var(--a-ink);background:var(--a-bg)">${row('NVDA')}</div>
<div style="margin-top:6px">${hit('NVAX', 'Novavax', 'Impfstoffe')}${hit('NVCR', 'NovoCure', 'Medizintechnik')}${hit('NVCT', 'Nuvectis Pharma', 'Pharma')}</div>
<div class="ltag" style="margin-top:16px">Frag Atlas</div>
<div class="card" style="margin-top:8px;display:flex;gap:10px;align-items:center;padding:12px"><span style="width:30px;height:30px;border-radius:50%;background:var(--lime);display:grid;place-items:center;color:#000;flex:none">${ic('i-spark', 15)}</span><b class="sm" style="flex:1">„nv“ als Frage an Atlas senden</b>${ic('i-next', 16)}</div>
<div style="margin-top:14px">${help('Tipp: Suche nach Name, Kürzel (NVDA) oder Thema. Enter öffnet den ersten Treffer.')}</div>
` });

slide({ id: 'D06', title: 'Discover · Suchen', route: '/discover/#/suche', now: 'D06',
  sub: 'Heute: eine leere weiße Seite mit Tastatur-Hinweisen für den Computer. Neu: Suchen beginnt mit Vorschlägen, Treffer erscheinen beim Tippen, Fragen gehen an Atlas.',
  neu: [['d06-a', 'Suche geöffnet, noch nichts getippt'], ['d06-b', 'Tippen „nv“: Treffer']],
  spec: {
    aufbau: ['Suchfeld mit Atlas-Knopf und „Abbrechen“ (öffnet aus jeder Kopfzeile, Lupe)', 'Leer: Zuletzt gesucht (Chips, lokal gespeichert), Oft gesucht (Aktienzeilen), Themen (Chips), Frag Atlas (3 Beispielfragen)', 'Beim Tippen: Treffer nach Gruppen (Aktien, Themen, Strategien), erster Treffer hervorgehoben, Suchbuchstaben neongrün markiert, „als Frage an Atlas senden“'],
    komponenten: ['C20 Suche', 'C10 Aktienzeile', 'C09 Erklärung', 'C13 Abschnittstitel', 'Discover-Muster: Trefferzeile mit Markierung'],
    daten: ['discover/data/search/US_REAL.json (entries: s, n, a = Kurzbeschreibung, href)', 'discover/config/themes.json für Themen-Treffer', 'Zuletzt gesucht: localStorage (nur auf dem Gerät)'],
    weg: ['Tastatur-Hinweise „↑ ↓ zum Auswählen · Esc schließt“ auf dem Telefon', 'Leere Seite ohne Vorschläge', 'Fußzeile im Suchfenster']
  } });

/* ======================================================================
   D07 · Märkte
   ====================================================================== */
const mrow = (n, s, v, d, a, unit = '') => `<div class="lr" style="grid-template-columns:1fr 74px auto"><div class="n"><b>${n}</b><span>${s}</span></div>${sp(a)}<div class="p"><span class="num">${v}${unit}</span>${d}</div></div>`;
const bp = v => `<span class="chg ${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '▲ +' : '▼ −'}${Math.abs(v)} bp</span>`;
const dots100 = (a, b) => `<div class="dots" style="grid-template-columns:repeat(20,1fr);gap:3px">${Array.from({ length: 100 }, (_, i) => `<i style="background:${i < a ? 'var(--lime)' : i < a + b ? 'var(--a-line)' : 'var(--a-ink)'}"></i>`).join('')}</div>`;
const TF = [['FMC', 'FMC Corp', '+30,53 %'], ['OSPN', 'OneSpan', '+27,34 %'], ['CDNA', 'Caredx', '+22,22 %'], ['BEZ', 'Baldor Electric', '+17,47 %'], ['LITZ', 'Tradr 2X Short LITE', '+17,01 %']];
const TL = [['ATEC', 'Alphatec Holdings', '−38,08 %'], ['RDDT', 'Reddit', '−29,22 %'], ['INTC', 'Intel', '−28,58 %'], ['AXTX', 'Tradr 2X Long AXTI', '−20,09 %'], ['CACC', 'Credit Acceptance', '−19,26 %']];
const mover = ([t, n, w], i) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:${i ? '1px solid var(--a-line)' : '0'}"><b class="num xs mu" style="width:14px">${i + 1}</b><b class="sm" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n}</b><span class="xs mu b">${t}</span>${P(w)}</div>`;
screen('d07-a', { world: 'discover', dock: 0, h: 2910, body: `
<div style="display:flex;align-items:center;gap:8px" class="sm b mu">${ic('i-back', 16)}Discover</div>
<div class="lt" style="margin-top:8px">Märkte</div>
<p class="mu" style="margin-top:6px;font-size:15px">Wie steht die Börse? Stand: Schluss Fr. 30.10.</p>

<div class="card ink" style="margin-top:16px;padding:18px">
 <div class="ltag" style="color:#9b9b9b">Marktbarometer · US-Aktien</div>
 <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><span style="font-size:38px;font-weight:900;letter-spacing:-.05em;color:var(--lime)">Vorsichtig</span><span class="sm b" style="opacity:.7">Stufe 2 von 5</span></div>
 <div style="margin-top:12px;--a-line:#2a2a2a;--a-ink:#fff;--a-mute:#8c8c8c">${step5(1, STUFEN)}</div>
 <p style="margin-top:14px;font-size:15px;font-weight:600">Normale Schwankungen, aber der Trend ist noch nicht breit bestätigt.</p>
 <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><span class="chip" style="background:#1a1a1a;color:#fff;height:30px;font-size:12.5px">Schwankung: normal</span><span class="chip" style="background:#1a1a1a;color:#fff;height:30px;font-size:12.5px">Schwung: uneinheitlich</span><span class="chip" style="background:#1a1a1a;color:#fff;height:30px;font-size:12.5px">Rückschlag-Risiko: erhöht</span></div>
 <div class="btn" style="margin-top:16px;height:48px;font-size:15px">Was heißt „Vorsichtig“?</div>
</div>

${sect('Was die Geschichte sagt')}
<div class="card" style="padding:16px">
 <b class="sm">Von 100 Fällen bei „Vorsichtig“ stand man 1 Jahr später so da:</b>
 <div style="display:flex;align-items:baseline;gap:8px;margin-top:8px"><span style="font-size:44px;font-weight:900;letter-spacing:-.05em">67</span><span class="bb">von 100 im Plus</span></div>
 <div style="margin-top:10px">${dots100(67, 13)}</div>
 <div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap" class="xs b"><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 1px var(--a-ink)"></i> 67 im Plus</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--a-line)"></i> 13 leicht im Minus</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--a-ink)"></i> 20 mehr als −10 %</span></div>
</div>
<div class="grid3" style="margin-top:10px">${tile('Typisch 1 Jahr', '+13,0 %', 'alle Stufen ähnlich')}${tile('Typisch 5 Jahre', '+69 %', '86 von 100 im Plus')}${tile('Schlechtes Jahr', '−21 %', '1 von 10 Fällen')}</div>
<div style="margin-top:10px">${help('Nachgerechnet mit festen Regeln seit 1929. Beschreibung der Vergangenheit, keine Prognose.')}</div>

<div class="chips" style="margin-top:22px"><span class="chip on">Aktien</span><span class="chip">Rohstoffe</span><span class="chip">Gold</span><span class="chip">Krypto</span><span class="chip">Zinsen</span></div>
${sect('Aktienmärkte')}
${mrow('Nasdaq 100', 'Fonds QQQ · Technologie', de(last2(X.QQQ)), chg(chg1(X.QQQ)), X.QQQ, ' $')}
${mrow('S&amp;P 500', 'Fonds SPY · 500 größte US-Firmen', de(last2(X.SPY)), chg(chg1(X.SPY)), X.SPY, ' $')}
${mrow('Dow Jones', 'Fonds DIA · 30 Klassiker', de(last2(X.DIA)), chg(chg1(X.DIA)), X.DIA, ' $')}
<div style="margin-top:8px">${help('Wir zeigen den Kurs des Fonds, der den Index nachbildet. Der Indexstand selbst ist in Punkten und höher.')}</div>

${sect('Gewinner und Verlierer · 30.10.')}
<div class="grid2">
 <div class="card" style="padding:10px 12px"><b class="sm" style="display:flex;gap:6px;align-items:center"><span class="chg up">▲</span>Gewinner</b>${TF.slice(0, 5).map((x, i) => `<div style="padding:7px 0;border-top:${i ? '1px solid var(--a-line)' : '0'};margin-top:${i ? 0 : 6}px"><b class="xs" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[1]}</b>${P(x[2])}</div>`).join('')}</div>
 <div class="card" style="padding:10px 12px"><b class="sm" style="display:flex;gap:6px;align-items:center"><span class="chg dn">▼</span>Verlierer</b>${TL.slice(0, 5).map((x, i) => `<div style="padding:7px 0;border-top:${i ? '1px solid var(--a-line)' : '0'};margin-top:${i ? 0 : 6}px"><b class="xs" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x[1]}</b>${P(x[2])}</div>`).join('')}</div>
</div>
<div class="xs mu b" style="margin-top:6px">1.945 liquide US-Titel, Schluss 30.10. gegen 29.10.</div>

${sect('Was heute auffällt')}
<div class="stack">
 <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>Aktienmärkte geben nach</b>${vd('w', 'Ungewöhnlich')}</div><p class="sm mu" style="margin-top:4px">Mehrere große Märkte fallen stark in dieselbe Richtung.</p><div class="kv" style="margin-top:6px"><span class="sm b">Nasdaq 100</span>${P('−3,47 %')}</div><div class="kv"><span class="sm b">S&amp;P 500</span>${P('−1,77 %')}</div></div>
 <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>Euro deutlich fester</b>${P('+0,38 %')}</div><p class="sm mu" style="margin-top:4px">1,3-mal so groß wie eine typische Tagesbewegung. Heißt: US-Aktien sind in Euro etwas weniger wert.</p></div>
 <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>US-Zins 5 Jahre fällt</b>${bp(-7)}</div><p class="sm mu" style="margin-top:4px">Sichere Anlagen werfen weniger ab. Das verändert, wie attraktiv Aktien im Vergleich sind.</p></div>
</div>
<div style="margin-top:8px">${help('bp = Basispunkt. 100 bp sind 1 Prozentpunkt. −7 bp: Der Zins fällt um 0,07 Punkte.')}</div>

${sect('Weitere Märkte')}
${mrow('Öl WTI', 'Rohstoff · je Fass · 27.10.', de(last2(X.WTI)), chg(chg1(X.WTI)), X.WTI, ' $')}
${mrow('Gold', 'Edelmetall · je Unze · 01.11.', de(last2(X.XAUUSD), 0), chg(chg1(X.XAUUSD)), X.XAUUSD, ' $')}
${mrow('Bitcoin', 'Krypto · rund um die Uhr · 01.11.', de(last2(X.BTCUSD), 0), chg(chg1(X.BTCUSD)), X.BTCUSD, ' $')}
${mrow('US-Zins 2 Jahre', 'Staatsanleihe USA', de(last2(X.US2Y)), bp(-5), X.US2Y, ' %')}
${mrow('Bund 2 Jahre', 'Staatsanleihe Deutschland', de(last2(X.DE2Y)), bp(-2), X.DE2Y, ' %')}
<div class="lr" style="grid-template-columns:1fr auto"><div class="n"><b>Fed-Leitzins</b><span>US-Notenbank · seit 11.12.2025</span></div><div class="p"><span class="num">3,75–4,00 %</span>${bp(25)}</div></div>
<p class="xs mu" style="margin-top:14px">Beschreibung nach festen Regeln, keine Prognose, keine Anlageberatung.</p>
` });

screen('d07-b', { world: 'discover', dock: 0, body: `<div class="lt">Märkte</div>`, overlay: sheet(`<div class="ltag">Marktbarometer</div><div class="mt" style="margin-top:4px">Was heißt „Vorsichtig“?</div>
<p class="sm" style="margin-top:8px"><b>Mehr Gegenwind als Rückenwind.</b> Der Trend ist brüchig, viele Aktien schwächeln, nur wenige tragen die Bewegung.</p>
<div style="margin-top:14px">${step5(1, STUFEN)}</div>
<div class="ltag" style="margin-top:18px">1 Jahr später, je Stufe (von 100 Fällen)</div>
${[['Defensiv', 71, 19], ['Vorsichtig', 67, 20], ['Selektiv', 73, 13], ['Konstruktiv', 80, 9]].map(([s, a, b]) => `<div style="padding:9px 0;border-top:1px solid var(--a-line)"><div style="display:flex;justify-content:space-between" class="sm"><b>${s}${s === 'Vorsichtig' ? ' <span class="pro" style="background:var(--lime);color:#000">HEUTE</span>' : ''}</b><span class="mu b">${a} im Plus · ${b} unter −10 %</span></div><div class="bar" style="margin-top:6px;height:8px;display:flex"><i class="l" style="width:${a}%;border-radius:0"></i><i style="width:${b}%;margin-left:auto;border-radius:0"></i></div></div>`).join('')}
<div style="margin-top:12px">${help('„Breit konstruktiv“ kommt in der Rückrechnung nicht vor: Die Marktbreite lässt sich für früher nicht nachbauen.')}</div>
<div style="margin-top:10px">${help('Die Stufe entsteht aus Trend, Schwung, Schwankung und Marktbreite. Kein Gesamtscore, keine Gewichte.')}</div>`, 150) });

slide({ id: 'D07', title: 'Discover · Märkte', route: '/discover/#/maerkte', now: 'D07',
  sub: 'Heute: 14.000 px mit Tacho in Orange, Rot und Grün, Karussells je Anlageklasse. Neu: oben eine schwarze Barometer-Karte, darunter Geschichte als 100 Punkte, dann alle Märkte als ruhige Zeilen.',
  neu: [['d07-a', 'Märkte, ganze Seite'], ['d07-b', 'Sheet „Was heißt Vorsichtig?“']],
  spec: {
    aufbau: ['Zurück zu Discover (erreichbar über „Der Markt heute“ und Chip „Märkte“, Platz Discover)', 'Barometer: Stufe als Wort, 5er-Skala, Satz, drei Zustände als Chips, Knopf zum Sheet', 'Was die Geschichte sagt: 100 Punkte (im Plus / leicht minus / mehr als −10 %), drei Kacheln, „?“', 'Reiter Aktien, Rohstoffe, Gold, Krypto, Zinsen (springen zu Abschnitten)', 'Aktienmärkte als Zeilen mit Mini-Chart', 'Gewinner und Verlierer nebeneinander (je 5)', 'Was heute auffällt: Karten mit Urteil „Ungewöhnlich“', 'Weitere Märkte als Zeilen (Öl, Gold, Bitcoin, US-Zins, Bund, Leitzins), Datum je Zeile wenn abweichend', 'Sheet: Stufe erklärt, Rückrechnung je Stufe als Balken'],
    komponenten: ['C02 Produkt-Leiste (Platz Discover)', 'C06 Chart (mini)', 'C07 Kursbewegung', 'C08 Urteil', 'C09 Erklärung', 'C11 Kachel', 'C14 Reiter', 'C16 Sheet', 'Discover-Muster: Stufen-Skala 5', 'Discover-Muster: 100-Punkte-Raster', 'Discover-Muster: Marktzeile (Name, Art, Wert, Bewegung)'],
    daten: ['quant/data/market/intelligence/market-pulse.json (environment, why, dimensions)', 'quant/data/market/intelligence/market-pulse-calibration.json (Rückrechnung je Stufe)', 'quant/data/market/multi-asset/series/<Symbol>.json und snapshot.json', 'Gewinner/Verlierer und „Was heute auffällt“: Werte aus der heutigen Seite (D07), Datei der Discover-Märkte'],
    weg: ['Tacho in Orange/Rot/Grün → 5er-Skala neongrün', 'Rot/Grün-Balken „67 von 100“ → Punkte-Raster', 'Breite Karussellkarten je Markt mit Rahmenfarbe je Klasse → Zeilen', 'Wetter-Icons und bunte Symbole', 'Euro-Umrechnung je Karte → Dollar wie Quelle, Euro im Konto umschaltbar']
  } });

/* ======================================================================
   D08 · Watchlist (wandert nach Mein Bereich)
   ====================================================================== */
const WL = ['NVDA', 'AAPL', 'MSFT', 'LLY', 'COST', 'AMD'];
const wlUp = WL.filter(t => day(t) >= 0).length;
screen('d08-a', { world: 'mein', dock: 1, h: 1300, body: `
<div class="ltag">Mein Bereich · Beispiel</div>
<div class="lt" style="margin-top:4px">Watchlist</div>
<div class="card ink" style="margin-top:14px;padding:16px;display:flex;gap:14px;align-items:center"><div style="font-size:40px;font-weight:900;letter-spacing:-.05em;color:var(--lime);line-height:1">${wlUp}/${WL.length}</div><div><b style="font-size:17px;display:block">heute im Plus</b><span class="sm" style="opacity:.7">Schluss Fr. 30.10. · ${WL.length} Aktien gemerkt</span></div></div>
<div class="seg" style="margin-top:14px"><span class="on">Heute</span><span>12 Monate</span><span>Name</span></div>
<div style="margin-top:6px">${WL.map(t => row(t)).join('')}</div>
${sect('Benachrichtigungen')}
<div class="card" style="padding:4px 14px"><div class="kv"><span class="sm b">Bewegung über ±5 % am Tag</span>${toggle(1)}</div><div class="kv"><span class="sm b">Neues Jahreshoch</span>${toggle(1)}</div><div class="kv"><span class="sm b">Neue Quartalszahlen (SEC)</span>${toggle(0)}</div></div>
${sect('Passt zu deiner Liste')}
${trow('MU', '+290 %', '12 Mon.', 'Ähnlich wie NVIDIA')}${trow('AVGO', '−15,5 %', '12 Mon.', 'Ähnlich wie NVIDIA')}
<div style="margin-top:12px">${help('Die Watchlist gilt in allen Welten: Was du in Quant oder Technical merkst, steht auch hier.')}</div>
` });
screen('d08-b', { world: 'mein', dock: 1, body: `
<div class="ltag">Mein Bereich</div>
<div class="lt" style="margin-top:4px">Watchlist</div>
<div class="card" style="margin-top:16px;padding:22px;text-align:center"><span style="width:64px;height:64px;border-radius:50%;background:var(--lime);display:inline-grid;place-items:center;color:#000">${ic('i-heart', 30)}</span><div class="mt" style="margin-top:12px">Noch nichts gemerkt</div><p class="sm mu" style="margin-top:6px">Tippe auf einer Aktie auf das Herz oder wische beim Swipen nach rechts.</p></div>
${sect('Zum Start: bekannte Namen')}
${['NVDA', 'AAPL', 'MSFT'].map(t => `<div class="lr" style="grid-template-columns:42px 1fr auto">${lg(t)}<div class="n"><b>${NAMES[t]}</b><span>${WHAT[t]}</span></div><span class="chip lm" style="height:32px;font-size:13px">${ic('i-plus', 15)}Merken</span></div>`).join('')}
<div class="btn ink" style="margin-top:16px">${ic('i-swipe', 18)}Aktien swipen</div>
` });

slide({ id: 'D08', title: 'Discover · Watchlist', route: '/discover/#/watchlist', newRoute: '/mein-dashboard/#/watchlist', now: 'D08',
  sub: 'Heute: eine Discover-eigene Watchlist, leer, mit großem Fußbereich. Neu: eine Watchlist für alle Welten in „Mein Bereich“, mit Tageszusammenfassung und Benachrichtigungen.',
  neu: [['d08-a', 'Watchlist mit 6 Aktien (Beispiel)'], ['d08-b', 'Leerer Zustand mit Startvorschlägen']],
  spec: {
    aufbau: ['Welt „Mein Bereich“, Platz Watchlist (Discover-Route leitet weiter)', 'Schwarze Karte: wie viele gemerkte Aktien heute im Plus', 'Reiter Heute / 12 Monate / Name', 'Aktienzeilen mit Mini-Chart und Tagesbewegung', 'Benachrichtigungen mit Schaltern (±5 %, Jahreshoch, Quartalszahlen)', 'Passt zu deiner Liste (aus discoverNext.similar der gemerkten Aktien)', 'Leer: Herz-Icon, Satz, drei bekannte Namen zum Merken, Knopf Swipen'],
    komponenten: ['C01 Kopfzeile (Mein Bereich)', 'C02 Produkt-Leiste Mein Bereich (Platz Watchlist)', 'C10 Aktienzeile', 'C14 Reiter', 'C15 Schalter', 'C18 Leerer Zustand', 'C09 Erklärung'],
    daten: ['Watchlist im Konto (docs/accounts/WATCHLIST.md), ohne Anmeldung lokal', 'Kurse: discover/data/stocks/US_REAL/<T>.json (price, changePercent)', 'Vorschläge: discoverNext.similar.cards'],
    weg: ['Eigene Discover-Watchlist → eine Watchlist für alle Welten', 'Großer leerer Weißraum und Fußzeile im leeren Zustand']
  } });

/* ======================================================================
   D09 · NVIDIA – die gemeinsame Aktienseite, Perspektive „Überblick“
   ====================================================================== */
/* Jahresspanne aus NVDA.json: metrics.distanceTo52wHigh −0,15914, distanceTo52wLow +0,245754, jahresspanne.position 0,607 */
const n1 = D.nvda, hi = NV.p / (1 - 0.15914), lo = NV.p / 1.245754;
const pos = 0.606959;
const mrd = v => de(v / 1e9, 1) + ' Mrd. $';
const ZA = [['1 Monat', '−11,4 %'], ['3 Monate', '−1,0 %'], ['6 Monate', '+3,1 %'], ['12 Monate', '−1,2 %']];
const HEALTH = [['Wachstum', 'Sehr stark', 'Umsatz +46 % pro Jahr über 10 Jahre', 'Wächst die Firma?'], ['Profitabilität', 'Sehr stark', 'Nettomarge 55,6 % (GJ 2026)', 'Verdient sie Geld?'], ['Cashflow', 'Sehr stark', 'Free-Cashflow-Marge 44,8 %', 'Bleibt Geld übrig?'], ['Bilanz', 'Sehr solide', 'Kasse 10,6 Mrd. $ · Schulden 7,5 Mrd. $', 'Ist sie solide finanziert?']];
const SIM = [['MU', '+290 %', 'Speicherchips'], ['AVGO', '−15,5 %', 'Halbleiter und Software'], ['MSFT', '−3,6 %', 'Windows, Office, Azure'], ['ORCL', '−53 %', 'Datenbanken und Software']];
const THEME = [['AAPL', '+28 %', 'iPhone, Mac und App Store'], ['ADI', '+77 %', 'Analogchips'], ['AMAT', '+65 %', 'Maschinen für Chipfertigung'], ['AMD', '+40 %', 'Prozessoren und Grafikchips']];
const CHEAP = [['MU', '+290 %', 'Speicherchips'], ['ADBE', '−26 %', 'Photoshop und Acrobat'], ['QCOM', '−7,8 %', 'Chips für Smartphones']];
const IDX = [['S&amp;P 500', 7.77, 'Gewicht 7,77 %'], ['Dow Jones', 2.42, 'Gewicht 2,42 %'], ['Nasdaq-100', null, 'Gewicht nicht veröffentlicht']];
const RANKS = [['Langfristige Compounder', 2, 184], ['Profitables Wachstum', 4, 378], ['Qualität + Wachstum', 5, 385], ['Starke Bilanz + Wachstum', 7, 126], ['Künstliche Intelligenz', 18, 41], ['Stärkste im Nasdaq-100', 56, 98]];
const persCard = (i, t, s) => `<div class="card" style="padding:12px;display:grid;gap:8px">${hud(i, 32, 9)}<div><b class="sm" style="display:block">${t}</b><span class="xs mu b">${s}</span></div></div>`;

screen('d09-a', { world: 'discover', dock: 0, h: 5300, body: `
${STOCK('Überblick')}
<div style="margin-top:14px">${chart(n1, { h: 170, axis: ['30.10.25', '30.10.26'] })}</div>
${tf('1J')}

<div class="card" style="margin-top:16px;padding:16px">
 <div class="ltag">In einem Satz</div>
 <div class="mt" style="margin-top:6px;font-size:23px">Etwas unter dem Stand vor einem Jahr</div>
 <div style="display:flex;align-items:center;gap:10px;margin-top:12px">${BIG('−1,2 %')}<span class="mu sm b">in 12 Monaten · −1,0 % in 3 Monaten</span></div>
</div>

${sect('Zeitachse')}
<div class="grid2">${ZA.map(([l, w]) => `<div class="card" style="padding:12px;display:flex;justify-content:space-between;align-items:center"><span class="sm b">${l}</span>${P(w)}</div>`).join('')}</div>

${sect('Jahresspanne')}
<div class="card" style="padding:16px">
 <div style="position:relative;height:16px;margin-top:4px"><div class="bar" style="position:absolute;inset:4px 0;height:8px"><i class="l" style="width:${(pos * 100).toFixed(0)}%"></i></div><span style="position:absolute;left:calc(${(pos * 100).toFixed(1)}% - 9px);top:-1px;width:18px;height:18px;border-radius:50%;background:var(--a-ink);box-shadow:0 0 0 3px var(--a-bg)"></span></div>
 <div style="display:flex;justify-content:space-between;margin-top:10px" class="xs b"><span><span class="mu">Tief</span><br><span class="num" style="font-size:14px">${de(lo)} $</span></span><span style="text-align:center"><span class="mu">Heute</span><br><span class="num" style="font-size:14px">${de(NV.p)} $</span></span><span style="text-align:right"><span class="mu">Hoch</span><br><span class="num" style="font-size:14px">${de(hi)} $</span></span></div>
 <p class="sm" style="margin-top:10px">Der Kurs liegt <b>15,9 % unter dem höchsten</b> und <b>25 % über dem tiefsten</b> Stand der letzten zwölf Monate.</p>
</div>

${sect('Auf einen Blick')}
<div class="stack">${[['fundamental', 'Geschäft', vd('s', 'Sehr stark'), 'Umsatz +83 % in 12 Monaten', 'Zahlen'], ['fundamental', 'Bewertung', vd('m', 'Wie der Markt'), 'KGV 25,9 · Markt 20,9', 'Zahlen'], ['technical', 'Kurs', vd('w', 'Etwas schwächer'), '−11,4 % in 1 Monat', 'Chart']].map(([i, t, v, s, p]) => `<div class="card" style="display:flex;align-items:center;gap:12px;padding:11px 12px">${hud(i, 36, 10)}<div style="flex:1"><div class="bb sm">${t}</div><div class="mu xs b">${s}</div></div>${v}</div>`).join('')}</div>

${sect('Was macht NVIDIA?')}
<div class="card" style="padding:16px"><p style="font-size:16px;font-weight:700;line-height:1.35">Entwickelt Chips für künstliche Intelligenz, Rechenzentren und Grafik.</p><div class="mu xs b" style="margin-top:6px">Technologie · NASDAQ · 24,3 Mrd. Aktien · Geschäftsjahr endet im Januar</div>
<div class="chips" style="flex-wrap:wrap;white-space:normal;margin-top:12px">${['Künstliche Intelligenz', 'Halbleiter & Chips', 'Rechenzentren & Cloud', 'Robotik', 'Quantencomputing', 'Autonomes Fahren'].map((t, i) => pill(t.replace('&', '&amp;'), i ? '' : 'lm')).join('')}</div></div>

${sect('Wie sich das Geschäft entwickelt hat')}
<div class="seg"><span class="on">Umsatz</span><span>Gewinn</span><span>Cashflow</span></div>
<div style="display:flex;align-items:flex-end;gap:12px;margin-top:14px"><div><div class="xs mu b">GJ 2015</div><div class="bb num" style="font-size:20px;color:var(--a-mute)">${mrd(D.rev[0][1])}</div></div><span style="margin-bottom:4px">${ic('i-next', 18)}</span><div><div class="xs mu b">GJ 2026</div><div class="bb num" style="font-size:26px;letter-spacing:-.03em">${mrd(D.rev[11][1])}</div></div></div>
<div style="margin-top:12px">${bars(D.rev, { w: 354, h: 130 })}</div>
<div class="card lime" style="margin-top:10px;padding:12px 14px"><b>Der Umsatz hat sich in 10 Jahren auf das 43-Fache gesteigert.</b></div>
<div style="margin-top:10px">${help('GJ = Geschäftsjahr. Bei NVIDIA endet es im Januar, GJ 2026 lief also von Februar 2025 bis Januar 2026.')}</div>
<div class="stack" style="margin-top:10px;gap:0">${['Der Gewinn wächst schneller als der Umsatz.', 'Die operative Marge ist um 45,5 Prozentpunkte gestiegen.', 'Der freie Cashflow ist zuletzt kräftig gestiegen (+59 %).'].map(t => `<div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--a-line)" class="sm b"><span style="color:var(--a-ink)">${ic('i-check', 16)}</span>${t}</div>`).join('')}</div>

${sect('Wie gesund ist die Firma?')}
<div class="grid2">${HEALTH.map(([t, g, s, q]) => `<div class="card" style="padding:12px"><div class="xs mu b">${q}</div><b style="display:block;margin-top:2px">${t}</b><div style="margin-top:8px">${vd('s', g)}</div><div class="xs b" style="margin-top:8px">${s}</div></div>`).join('')}</div>
<div style="margin-top:10px">${help('Nettomarge 55,6 %: Von 100 $ Umsatz bleiben 55,60 $ Gewinn übrig.')}</div>

${sect('Ist NVIDIA teuer?')}
<div class="card" style="padding:16px">
 <div style="display:flex;justify-content:space-between;align-items:center"><b>Kurs-Gewinn-Verhältnis</b>${vd('m', 'Wie der Markt')}</div>
 <div style="display:grid;grid-template-columns:76px 1fr 40px;gap:8px;align-items:center;margin-top:14px" class="sm b"><span>NVIDIA</span><div class="bar"><i style="width:100%"></i></div><span class="num" style="text-align:right">25,9</span><span class="mu">Markt</span><div class="bar"><i style="width:${(20.91 / 25.87 * 100).toFixed(0)}%;background:var(--a-mute)"></i></div><span class="num mu" style="text-align:right">20,9</span></div>
 <div style="margin-top:12px">${help('KGV 25,9: Du zahlst 25,90 $ für 1 $ Jahresgewinn. Höher heißt: Im Kurs steckt mehr Erwartung.')}</div>
</div>
<div class="grid2" style="margin-top:10px">${tile('Börsenwert', '4,97 Bio. $', 'Kurs × Aktien')}${tile('Kurs-Umsatz (KUV)', '16,4', 'Markt: 2,0')}${tile('Gewinnrendite', '3,9 %', '1 / KGV')}${tile('Free-Cashflow-Rendite', '2,6 %', 'Cash je 100 $ Börsenwert')}</div>

${sect('Was dafür spricht, was dagegen')}
<div class="card" style="padding:4px 14px">${[['+', 'Der Umsatz wächst deutlich', '+83 % gegenüber dem Vorjahr'], ['+', 'Der Gewinn wächst schneller als der Umsatz', '+123 % gegenüber dem Vorjahr'], ['+', 'Arbeitet sehr profitabel', '64 % des Umsatzes bleiben als Gewinn'], ['−', 'Die Bewertung ist hoch', 'Im Kurs steckt viel erwartetes Wachstum (KGV 25,9)'], ['−', 'Deutlicher Rückschlag im letzten Jahr', '−20 % vom Höchststand']].map(([k, t, s], i) => `<div style="display:flex;gap:10px;padding:10px 0;border-top:${i ? '1px solid var(--a-line)' : '0'}"><span style="flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:${k === '+' ? 'var(--lime)' : 'var(--a-ink)'};color:${k === '+' ? '#000' : 'var(--a-inv)'}">${k}</span><div><b class="sm" style="display:block">${t}</b><span class="xs mu b">${s}</span></div></div>`).join('')}</div>

${sect('In welchen Indizes?')}
<div class="card" style="padding:4px 14px">${IDX.map(([n, w, s], i) => `<div style="padding:10px 0;border-top:${i ? '1px solid var(--a-line)' : '0'}"><div style="display:flex;justify-content:space-between" class="sm"><b>${n}</b><span class="b ${w ? '' : 'mu'}">${s}</span></div>${w ? `<div class="bar" style="margin-top:7px;height:7px"><i class="l" style="width:${w * 8}%"></i></div>` : ''}</div>`).join('')}</div>
<div style="margin-top:10px">${help('Gewicht 7,77 %: Von 100 € in einem S&amp;P-500-Fonds stecken 7,77 € in NVIDIA.')}</div>

${sect('Platz in Ranglisten')}
<div class="stack" style="gap:6px">${RANKS.map(([t, r, o]) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:14px;background:var(--a-card)"><span class="num bb" style="width:40px;font-size:17px">${r}.</span><b class="sm" style="flex:1">${t}</b><span class="xs mu b">von ${o}</span>${ic('i-next', 14)}</div>`).join('')}</div>

${sect('Ähnliche Aktien', 'Alle 8')}
${SIM.map(([t, w, s]) => trow(t, w, '12 Mon.', s)).join('')}
<div class="xs mu b" style="margin-top:4px">Ähnlich bei Kursverhalten, Wachstum, Marge und Bewertung, gleiche Branche zuerst.</div>

${sect('Gleiches Thema: KI', 'Alle 30')}
${THEME.map(([t, w, s]) => trow(t, w, '12 Mon.', s)).join('')}

${sect('Günstiger bewertet', 'Alle 6')}
${CHEAP.map(([t, w, s]) => trow(t, w, '12 Mon.', s)).join('')}
<div style="margin-top:8px">${help('Günstiger: KGV unter 80 % von NVIDIAs, Nettomarge mindestens 5 %, gleiche Branche.')}</div>

${sect('Mehr zu NVIDIA in anderen Welten')}
<div class="grid3">${persCard('technical', 'Chart', 'Trend, Zonen')}${persCard('fundamental', 'Zahlen', 'SEC-Berichte')}${persCard('quant', 'Faktoren', '6 Eigenschaften')}${persCard('supertrader', 'Methoden', '13 Regeln')}${persCard('elliott', 'Wellen', 'Struktur')}${persCard('hedgefonds', 'Investoren', '13F-Daten')}</div>

<div class="card line" style="margin-top:20px;display:flex;gap:10px;align-items:center">${ic('i-book', 18)}<div style="flex:1"><b class="sm">Daten und Methodik</b><div class="xs mu b">Kurse Tiingo · Zahlen SEC · Stand 30.10.2026</div></div>${ic('i-next', 16)}</div>
<p class="xs mu" style="margin-top:10px">Discover zeigt Kursverhalten, keine Anlageempfehlung.</p>
` });

/* 5 Jahre */
const n5 = D.nvda5y, h5 = Math.max(...n5), l5 = Math.min(...n5), g5 = (NV.p / n5[0] - 1) * 100;
screen('d09-b', { world: 'discover', dock: 0, body: `
${STOCK('Überblick')}
<div style="display:flex;align-items:center;gap:10px;margin-top:14px">${BIG('+' + de(g5, 0) + ' %')}<span class="mu sm b">in 5 Jahren</span></div>
<div style="margin-top:12px">${chart(n5, { h: 190, axis: ['vor 5 Jahren', '30.10.26'], marks: [[n5.indexOf(h5), 'H']] })}</div>
${tf('5J')}
<div class="grid3" style="margin-top:14px">${tile('Start', de(n5[0]) + ' $', 'vor 5 Jahren')}${tile('Hoch', de(h5) + ' $', 'Wochenschluss')}${tile('Tief', de(l5) + ' $', 'Wochenschluss')}</div>
<div style="margin-top:10px">${help('Kurse sind um Aktiensplits bereinigt. So lassen sich alte und neue Kurse direkt vergleichen.')}</div>
` });

/* Merken-Sheet */
screen('d09-c', { world: 'discover', dock: 0, body: `${STOCK('Überblick')}<div style="margin-top:14px">${chart(n1, { h: 150 })}</div>`,
  overlay: sheet(`<div style="display:flex;align-items:center;gap:12px">${lg('NVDA', 1)}<div style="flex:1"><div class="mt">NVIDIA gemerkt</div><div class="xs mu b">Steht jetzt in deiner Watchlist, in allen Welten</div></div><span style="width:40px;height:40px;border-radius:50%;background:var(--lime);display:grid;place-items:center;color:#000">${ic('i-heartf', 20)}</span></div>
  <div class="ltag" style="margin-top:18px">Sag mir Bescheid, wenn …</div>
  <div class="card" style="margin-top:8px;padding:4px 14px">
   <div class="kv"><span><span class="sm b" style="display:block">der Kurs am Tag ±5 % macht</span><span class="xs mu">heute: −4,22 %</span></span>${toggle(1)}</div>
   <div class="kv"><span><span class="sm b" style="display:block">ein neues Jahreshoch erreicht</span><span class="xs mu">Hoch: ${de(hi)} $</span></span>${toggle(1)}</div>
   <div class="kv"><span><span class="sm b" style="display:block">neue Quartalszahlen erscheinen</span><span class="xs mu">Quelle: SEC</span></span>${toggle(0)}</div>
   <div class="kv"><span><span class="sm b" style="display:block">der Kurs unter einen Preis fällt</span><span class="xs mu">Preis selbst wählen</span></span>${toggle(0)}</div>
  </div>
  <div class="ltag" style="margin-top:16px">Notiz</div>
  <div class="card line sm" style="margin-top:8px;color:var(--a-mute)">Warum interessiert mich die Aktie?</div>
  <div class="grid2" style="margin-top:14px"><span class="btn line" style="height:48px;font-size:14.5px">Entfernen</span><span class="btn" style="height:48px;font-size:14.5px">Fertig</span></div>`, 230) });

/* Profi: alle Kennzahlen */
const PK = [['Kursstärke (Perzentil)', '58,1', 'besser als 58 % der US-Aktien'], ['Schwung (Perzentil)', '54,7', '12 Monate ohne letzten Monat'], ['Relative Stärke (Perzentil)', '53,1', 'gegenüber dem Markt'], ['Schwankung 1 Jahr', '37,2 %', 'Volatilität, annualisiert'], ['Größter Rückgang 1 Jahr', '−20,2 %', 'Max. Drawdown'], ['Beta 1 Jahr', '1,93', 'bewegt sich fast doppelt so stark wie der Markt'], ['Abstand 200-Tage-Linie', '+0,1 %', 'knapp darüber'], ['Abstand 50-Tage-Linie', '−7,7 %', 'darunter'], ['Volumen 20 / 60 Tage', '0,89×', 'etwas weniger Handel'], ['Rang in der Branche', '11 von 18', 'Technologie']];
screen('d09-d', { world: 'discover', dock: 0, dk: 1, h: 1260, body: `
${STOCK('Überblick')}
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px"><b style="font-size:19px;letter-spacing:-.02em">Alle Kennzahlen</b><span class="pro">PRO</span></div>
<p class="sm mu" style="margin-top:4px">Aus diesen Werten entstehen die Sätze oben. Universum: 6.103 US-Aktien.</p>
<div class="card" style="margin-top:12px;padding:4px 14px">${PK.map(([k, v, s]) => lineItem(k, v, s)).join('')}</div>
<div style="margin-top:12px">${help('Perzentil 58: NVIDIA liegt vor 58 von 100 Aktien. Das ist eine Rangfolge, keine Wahrscheinlichkeit.')}</div>
<div style="margin-top:10px">${help('Beta 1,93: Fällt der Markt um 1 %, fiel NVIDIA im letzten Jahr im Schnitt um rund 1,9 %.')}</div>
` });

slide({ id: 'D09', title: 'Discover · NVIDIA (Aktienseite)', route: '/discover/#/s/US_REAL/NVDA', newRoute: '/aktie/NVDA (Perspektive Überblick)', now: 'D09',
  sub: 'Die wichtigste Seite der App. Heute: 9er-Icon-Leiste, Tageschart in Rot, Kennzahlen in Euro, Abschnitte hinter „Mehr“-Klappen. Neu: ein Kopf für alle Welten, dann Satz, Zeitachse, Spanne, drei Urteile, Geschäft, Gesundheit, Bewertung, Indizes, Nachbarn.',
  neu: [['d09-a', 'Überblick, ganze Seite (1 Jahr)'], ['d09-b', 'Zeitraum 5 Jahre'], ['d09-c', 'Sheet Merken und Benachrichtigen'], ['d09-d', 'Profi: alle Kennzahlen (dunkel)']],
  spec: {
    aufbau: ['C04 Aktienkopf (Zurück, Logo, Name, „was die Firma macht“, Herz) mit Kurs, Bewegung, Schluss-Datum, Euro-Wert; Perspektiven-Leiste, „Überblick“ aktiv, klebt oben', 'Chart mit Zeitleiste 1T–Max (Standard 1J)', 'In einem Satz: plain.story + Klartext-Zahl + plain.zusatz', 'Zeitachse 1M/3M/6M/12M als Pillen', 'Jahresspanne: Balken mit Punkt, Tief/Heute/Hoch in $, Satz', 'Auf einen Blick: drei Urteile Geschäft / Bewertung / Kurs (tippbar → Perspektive Zahlen bzw. Chart)', 'Was macht NVIDIA: ein Satz, Sektor, Börse, Aktienzahl, Themen-Chips', 'Geschäft 12 Jahre: Reiter Umsatz/Gewinn/Cashflow, Von→Bis, Balken, Kernsatz neongrün, „?“ GJ, drei belegte Aussagen', 'Gesundheit: 4 Kategorien mit Frage, Urteil, Beleg', 'Bewertung: KGV gegen Marktmedian, Urteil, „?“, 4 Kacheln', 'Dafür / dagegen (3 + 2)', 'Indexmitgliedschaften mit Gewicht als Balken', 'Platz in Ranglisten (memberships, Rang von N)', 'Ähnliche Aktien, Gleiches Thema, Günstiger bewertet (je Regel als Satz)', 'Mehr in anderen Welten (6 Perspektiven)', 'Daten und Methodik, Hinweis', 'Zustände: 5 Jahre (Zuwachs, Hoch/Tief), Merken-Sheet mit Benachrichtigungen und Notiz, Profi „Alle Kennzahlen“ (PRO)'],
    komponenten: ['C04 Aktienkopf', 'C05 Perspektiven-Leiste', 'C06 Chart + Zeitleiste', 'C07 Kursbewegung', 'C08 Urteil', 'C09 Erklärung', 'C10 Aktienzeile', 'C11 Kachel', 'C14 Reiter', 'C15 Schalter', 'C16 Sheet', 'C17 Balken', 'C19 PRO-Marke', 'Discover-Muster: Klartext-Zahl', 'Discover-Muster: Jahresspanne', 'Discover-Muster: Dafür/Dagegen-Liste', 'Discover-Muster: Ranglisten-Platz'],
    daten: ['discover/data/stocks/US_REAL/NVDA.json: plain, zeitachse, jahresspanne, geschaeftszahlen, fundamentals.journey.tracks, .story.statements, .health.categories, .valuation, indexMemberships (weight), memberships (rank/of), themes, discoverNext.similar|sameTheme|cheaperAlternatives (rule), metrics, rawValues, ranks', 'Chart: quant/data/market/discover-series/ref_NVDA.json (1J), discover-series-long (5J/Max); Preis über published-close.js (ADR-002)', 'Merken/Benachrichtigen: Konto-Watchlist (docs/accounts/WATCHLIST.md)'],
    weg: ['9er-Icon-Leiste „Analysewelten“ → Perspektiven-Leiste', 'Index-Etiketten unter dem Namen → Abschnitt „In welchen Indizes?“ mit Gewicht', 'Gelbes Etikett „Letzter Handelstag … heutige Kurse …“ → Schluss-Datum im Kopf', 'Leerer Block „Auf einen Blick: Meldungen nicht verfügbar“ → drei Urteile', 'Kennzahlen in Euro (189,9 Mrd. €) → Dollar wie SEC-Quelle, Euro nur beim Kurs', 'Rot/Grün und goldener Balken → Pillen und neongrüner letzter Balken', '„Ab hier: die Analyse“ (Klappe) → Profi-Ansicht „Alle Kennzahlen“ (PRO)', 'Knöpfe „Einzeln weiter entdecken / Zurück zu Discover“ → Produkt-Leiste']
  } });
})();
