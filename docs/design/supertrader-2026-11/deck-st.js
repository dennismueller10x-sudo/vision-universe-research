/* Konzept Supertrader · „Das Rezept eines Profis, Schritt für Schritt“, Stand 08.11.2026.
   Bausteine aus ../redesign-2027/lib.js (Kopie in lib/). Zahlen der Methoden, Musterdepots und Protokolle wie am
   08.11.2026 auf /supertrader/ abgelesen (Datenstand 06.11.2026); Kursreihen echt (data-st.js). */
(function () {
'use strict';
const { screen, slide, chapter, ic, hud, chart, help, vd, pill } = VU;
const SER = STD.series;
const ASOF = 'Fr. 06.11.';
const src = p => (window.__IMG && window.__IMG[p]) || p;
const fmt = n => n.toLocaleString('de-DE');
const logo = (t, s = 36) => `<span class="lgx" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .28)}px"><b style="font-size:${Math.max(8.5, s * .25)}px">${t}</b><img src="${src('img/logos/' + t + '.png')}" alt="" onerror="this.remove()"></span>`;
const pillv = (txt, up) => `<span class="chg ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${String(txt).replace(/^[+−]/, '')}</span>`;
const railHead = (t, cnt, s, tag) => `<div class="rh"><div class="rh-t"><b>${t}</b>${tag ? `<span class="rh-tag">${tag}</span>` : ''}<a>${cnt ? 'Alle ' + cnt : 'Alle'} ${ic('i-next', 13)}</a></div>${s ? `<p>${s}</p>` : ''}</div>`;
const rail = items => `<div class="rail">${items.join('')}</div>`;
const FORSCH = `<span class="rh-tag" style="background:var(--a-ink);color:var(--lime)">Forschung, nicht zertifiziert</span>`;

/* ---------- Die eine Idee: der Ablauf ---------- */
/* Erkennen (3 Stufen, über alle Aktien) und Musterdepot (4 Schritte, ohne echtes Geld) – gleiche Leiste, klare Namen */
const ERK = [['Muster erkannt', 'Der Chart sieht aus wie das Muster.'], ['Regel erfüllt', 'Alle prüfbaren Regeln der Methode stimmen.'], ['Plan fertig', 'Zone und Ungültig-Marke laut Methode stehen fest.']];
const DEP = [['Wartet', 'Kurs noch unter der Zone laut Methode.'], ['Aufgenommen', 'Das Musterdepot nimmt die Aktie auf.'], ['Im Musterdepot', 'Läuft nach Regel weiter.'], ['Abgegeben', 'Regel sagt raus; Ergebnis im Protokoll.']];
const steps = (labels, on, o = {}) => `<div class="stp${o.dk ? ' dk' : ''}">${labels.map((l, i) => `<div class="${i < on ? 'done' : i === on ? 'on' : ''}"><i></i><span>${l[0] || l}</span></div>`).join('')}</div>`;
const mini = (n, on, total) => `<span class="stm">${Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'done' : i === on ? 'on' : ''}"></i>`).join('')}</span>`;

/* 13 Methoden wie auf /supertrader/strategies/ (Treffer am Stichtag 06.11.2026) */
const M = [
  ['Weinstein', 'Investor', 'Stan Weinstein', 'Trend', 622, 'Aktie verlässt eine lange Seitwärtsphase nach oben.', 1],
  ['Weinstein', 'Trader', 'Stan Weinstein', 'Trend', 583, 'Neuer Anlauf nach oben in einem laufenden Aufwärtstrend.', 1],
  ['Minervini', 'VCP', 'Mark Minervini', 'Ausbruch', 564, 'Schwankungen werden kleiner, dann folgt der Ausbruch.', 1],
  ['Morales & Kacher', 'Pocket Pivot', 'Gil Morales, Chris Kacher', 'Volumen', 405, 'Aufwärtstag mit mehr Volumen als jeder Abwärtstag der letzten 10 Tage.', 0],
  ['Morales & Kacher', 'Buyable Gap-Up', 'Gil Morales, Chris Kacher', 'Kurslücke', 348, 'Kurslücke nach oben mit sehr hohem Volumen.', 0],
  ['Raschke', 'Holy Grail', 'Linda Raschke', 'Rücksetzer', 233, 'Starker Trend, dann erster Rücksetzer an die 20-Tage-Linie.', 0],
  ['Darvas', 'Box', 'Nicolas Darvas', 'Ausbruch', 151, 'Kurs pendelt in einer Kiste und bricht nach oben aus.', 1],
  ['Turtle', '20 Tage', 'Richard Dennis', 'Trend', 150, 'Kurs steigt über das Hoch der letzten 20 Tage.', 1],
  ['Turtle', '55 Tage', 'Richard Dennis', 'Trend', 125, 'Kurs steigt über das Hoch der letzten 55 Tage.', 1],
  ['Kullamägi', 'Episodic Pivot', 'Kristjan Kullamägi', 'Kurslücke', 74, 'Kurssprung um mindestens 10 % nach einer Überraschung.', 0],
  ['Minervini', 'Power Play', 'Mark Minervini', 'Ausbruch', 33, 'Erst +100 % in acht Wochen, dann eine ruhige Pause.', 0],
  ['Kullamägi', 'Breakout', 'Kristjan Kullamägi', 'Ausbruch', 18, 'Starker Lauf, enge Pause, dann Ausbruch.', 1],
  ['Kullamägi', 'Parabolic', 'Kristjan Kullamägi', 'Short', 6, 'Überhitzte Aktie, Wette auf Rückgang. Nur Forschung.', 0]];
const mName = m => `${m[0]} · ${m[1]}`;
const mCard = (m, w = 230) => `<div class="mc" style="width:${w}px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><span class="chip" style="height:24px;font-size:11px;padding:0 9px;background:var(--a-bg)">${m[3]}</span>${m[6] ? `<span class="rh-tag">Musterdepot</span>` : ''}</div><b>${mName(m)}</b><span class="xs mu b">${m[2]}</span><p>${m[5]}</p><div class="mc-n"><b class="num">${fmt(m[4])}</b><small>heute erkannt</small></div></div>`;
const mRow = m => `<div class="mr2"><div style="min-width:0"><div style="display:flex;align-items:center;gap:6px"><b>${mName(m)}</b>${m[6] ? '<span class="rh-tag" style="font-size:9px;padding:2px 6px">Musterdepot</span>' : ''}</div><span class="xs mu b">${m[2]} · ${m[3]}</span><p>${m[5]}</p></div><div class="mr2-n"><b class="num">${fmt(m[4])}</b><small>heute</small></div></div>`;

/* ======================================================================
   Screens
   ====================================================================== */
const TODAY = `<div class="today"><div class="ltag" style="color:#9b9b9b">Heute erkannt · alle US-Aktien · ${ASOF}</div>
<div class="tg">${[['2.384', 'Muster erkannt'], ['894', 'Regel erfüllt'], ['34', 'Plan fertig']].map(([a, b]) => `<div><b class="num">${a}</b><span>${b}</span></div>`).join('')}</div>
<div style="margin-top:10px">${steps(ERK, 2, { dk: 1 })}</div>
<div class="ltag" style="color:#9b9b9b;margin-top:14px">Musterdepots · ohne echtes Geld</div>
<div class="tg" style="grid-template-columns:repeat(4,1fr)">${[['193', 'warten'], ['0', 'heute aufgenommen'], ['634', 'im Musterdepot'], ['948', 'abgegeben']].map(([a, b]) => `<div><b class="num" style="font-size:24px">${a}</b><span>${b}</span></div>`).join('')}</div></div>`;
const PLAN = [['TDC', 'Teradata', 'Morales & Kacher · Buyable Gap-Up', '+0,1 %', 1], ['ULBI', 'Ultralife', 'Minervini · Power Play', '−0,2 %', 0], ['BMBL', 'Bumble', 'Minervini · Power Play', '−0,5 %', 0], ['SG', 'Sweetgreen', 'Kullamägi · Breakout', '+0,5 %', 1]];
screen('t-home', { world: 'supertrader', dock: 0, h: 1680, body: `<div class="ltag">Supertrader · Schluss ${ASOF}</div><div class="lt" style="margin-top:4px">Methoden<br>der Profis</div><p class="mu" style="margin-top:8px;font-size:15px">13 Methoden berühmter Trader als feste Regeln, jeden Tag auf alle US-Aktien angewendet. Musterdepots zeigen, was die Regel tun würde. Ohne echtes Geld.</p>
<div style="margin-top:10px">${FORSCH}</div>
<div style="margin-top:12px">${TODAY}</div>
${railHead('Die 13 Methoden', 13, 'Jede sucht ein bestimmtes Kursmuster.')}
${rail(M.slice(0, 5).map(m => mCard(m)))}
${railHead('Plan fertig', 34, 'Zone und Ungültig-Marke laut Methode stehen. Abstand zur Zone heute:')}
<div class="card" style="padding:2px 14px">${PLAN.map(([t, n, m, d, up]) => `<div class="mr">${logo(t, 34)}<div style="min-width:0"><b>${n}</b><span>${m}</span></div><div style="display:grid;justify-items:end;gap:2px">${pillv(d, up)}<small class="xs mu b">zur Zone</small></div></div>`).join('')}</div>
${railHead('So läuft ein Durchgang', '', 'NVIDIA im Musterdepot Turtle, Oktober 2026.')}
<div class="card" style="padding:14px">${steps(DEP, 3)}<div style="margin-top:10px">${chart(SER.NVDA.slice(-14), { w: 322, h: 90, grid: false, marks: [[8, 1], [9, 2]] })}</div><div class="sm" style="margin-top:8px"><b>① 02.10.</b> Musterdepot nimmt auf · 236,29 $<br><b>② 12.10.</b> Musterdepot gibt ab · 226,80 $ ${pillv('−4,02 %', 0)}</div></div>
<div class="card" style="margin-top:12px;padding:14px;display:flex;gap:12px;align-items:center">${hud('supertrader', 42, 12)}<div style="flex:1"><b style="display:block">VU Hausstrategie</b><span class="sm mu">20 Aktien, je 5 %, eigene Regeln, seit 05.10. im Vorwärtslauf</span></div>${ic('i-next', 18)}</div>
<div class="card" style="margin-top:10px;padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('i-bars', 20)}</span><div style="flex:1"><b style="display:block">Forschung</b><span class="sm mu">0 von 9 Regelversionen mit belegtem Vorteil</span></div>${ic('i-next', 18)}</div>
<p class="xs mu" style="margin-top:16px">Rechenmodell nach öffentlich beschriebenen Regeln. Keine Anlageberatung, keine Empfehlung, kein Kursziel.</p>` });

screen('t-methods', { world: 'supertrader', dock: 1, h: 2000, body: `<div class="ltag">Methoden</div><div class="lt" style="margin-top:4px">Was sucht<br>welche Methode?</div><p class="mu" style="margin-top:8px;font-size:15px">Ein Name je Methode: Trader · Muster. Fünf haben ein Musterdepot.</p>
<div style="margin-top:12px">${VU.search('Methode oder Trader …')}</div>
<div class="chips" style="margin-top:10px">${['Alle 13', 'Mit Musterdepot 5', 'Ausbruch 4', 'Trend 4', 'Kurslücke 2', 'Rücksetzer 1', 'Volumen 1'].map((x, i) => `<span class="chip${i ? '' : ' on'}" style="height:32px;font-size:12.5px">${x}</span>`).join('')}</div>
<div style="margin-top:8px">${M.map(mRow).join('')}</div>
<div class="card" style="margin-top:14px;padding:14px"><b class="sm">Weitere Modelle in der Forschung</b><p class="xs mu" style="margin-top:4px">CAN SLIM, Piotroski, Greenblatt, VU Trendfolge 52W und Market-Wizards-Modelle: Teilprüfung, ohne tägliche Erkennung.</p></div>
<div style="margin-top:10px">${help('Die Zahl rechts: wie viele US-Aktien am 06.11. das Muster zeigen. Sie sagt nichts darüber, ob die Methode Geld verdient.')}</div>` });

/* Eine Methode */
screen('t-method', { world: 'supertrader', dock: 1, h: 1480, nopad: 1, body: `<div class="rowhero"><div style="display:flex;justify-content:space-between"><span class="hb" style="background:#1a1a1a;color:#fff">${ic('i-back', 18)}</span><span class="hb" style="background:#1a1a1a;color:#fff">${ic('i-bell', 18)}</span></div>
<div style="display:flex;gap:6px;margin-top:18px"><span class="rh-tag" style="background:#1d1d1d;color:#bbb">Ausbruch</span><span class="rh-tag">Musterdepot</span></div>
<div style="font-size:38px;font-weight:900;letter-spacing:-.05em;line-height:.96;margin-top:10px">Minervini<br><span style="color:var(--lime)">VCP</span></div>
<p style="margin-top:8px;color:#bdbdbd;font-size:15px">Schwankungen werden kleiner, dann folgt der Ausbruch. Nach Mark Minervini, als feste Regel umgesetzt.</p>
<div class="grid2" style="margin-top:14px;gap:8px"><div class="mini dk"><small>Heute erkannt</small><b>564 Aktien</b></div><div class="mini dk"><small>Musterdepot</small><b>0 von 10 Plätzen</b></div></div></div>
<div style="padding:0 18px">
<div class="st">So denkt die Methode</div>
<div class="grid3" style="gap:8px">${[['1', 'Aufwärtstrend', 'Kurs über den Durchschnitten'], ['2', 'Wird ruhiger', 'jede Schwankung kleiner'], ['3', 'Ausbruch', 'über die Marke, mit Volumen']].map(([a, b, c]) => `<div class="card" style="padding:12px"><span class="stepn">${a}</span><b style="display:block;margin-top:8px;font-size:14px">${b}</b><span class="xs mu">${c}</span></div>`).join('')}</div>
<div class="st">Im Musterdepot gerade<a>Protokoll seit 28.09.</a></div>
<div class="card" style="padding:14px"><div style="display:flex;align-items:center;gap:10px">${logo('IDT', 36)}<div style="flex:1"><b style="display:block">IDT Corp</b><span class="xs mu b">Plan fertig · 2,7 % bis zur Zone</span></div>${vd('m', 'noch 2,7 %')}</div>${steps(DEP, 0)}
<div class="zb"><i style="left:0"></i><i class="me" style="left:44%"></i><i class="z" style="left:100%"></i></div><div class="zb-l"><span>Ungültig laut Methode<br><b>80,52 $</b></span><span style="text-align:center">Schluss<br><b>82,17 $</b></span><span style="text-align:right">Zone laut Methode<br><b>84,39 $</b></span></div>
<div style="margin-top:10px">${chart(SER.IDT || SER.NVDA, { w: 322, h: 90, grid: false, zones: [[84.39, 86, 'l', 'Zone laut Methode'], [79.5, 80.52, 'g', 'Ungültig']] })}</div></div>
<div class="grid3" style="gap:8px;margin-top:10px">${[['1', 'abgegeben'], ['48', 'Muster zerfallen'], ['1', 'Regel geändert']].map(([a, b]) => `<div class="kt" style="width:auto"><small>${b}</small><b class="num">${a}</b></div>`).join('')}</div>
<div class="st">Wie nah an der Originalregel?</div>
<div class="card" style="padding:14px"><div class="mt3"><i style="width:${2 / 17 * 100}%;background:var(--lime)"></i><i style="width:${10 / 17 * 100}%;background:var(--a-ink)"></i><i style="width:${1 / 17 * 100}%;background:#8c8c8c"></i><i style="width:${1 / 17 * 100}%;background:#c4c4c4"></i><i style="width:${3 / 17 * 100}%;background:var(--a-line)"></i></div><p class="xs b" style="margin-top:8px">17 Regelteile: 2 wörtlich vom Trader · 10 umgesetzt · 1 Ergänzung · 1 ohne Beleg · 3 fehlen</p></div>
<div class="card" style="margin-top:10px;padding:14px;display:flex;justify-content:space-between;align-items:center"><div>${FORSCH}<b style="display:block;margin-top:6px">Wie belastbar?</b><span class="xs mu">In Prüfung. Ein Vorteil ist nicht belegt.</span></div>${ic('i-next', 16)}</div>
<div class="eps ep2" style="margin-top:12px">${[['Die Regeln im Detail', '9 Abschnitte', 'i-list'], ['Was stammt vom Trader?', 'Quellen je Regelteil', 'i-book'], ['Lücken und fehlende Daten', '3 Regelteile fehlen', 'i-shapes']].map(([a, b, c], i) => `<div class="ep"><b class="ep-n">${i + 1}</b><span class="hud" style="width:40px;height:40px;border-radius:12px">${ic(c, 19)}</span><div class="ep-t"><b>${a}</b><span>${b}</span></div><span class="ep-c">${ic('i-next', 15)}</span></div>`).join('')}</div></div>` });

/* Treffer (heute „Signale“) */
const TR = [['APAM', 'Artisan Partners', 34.16, 36.43, 39.13, '+7,42 %'], ['LINE', 'Lineage', 34.95, 35.86, 39.13, '+9,13 %'], ['CCEP', 'Coca-Cola Europacific', 109.65, 106.48, 116.13, '+9,07 %'], ['BTI', 'British American Tobacco', 59.28, 58.54, 60.89, '+4,02 %'], ['POOL', 'Pool Corporation', 193.57, 206.21, 211.70, '+2,66 %'], ['ISRG', 'Intuitive Surgical', 431.19, 444.59, 452.80, '+1,85 %'], ['SW', 'Smurfit WestRock', 40.43, 43.38, 44.09, '+1,63 %'], ['XNCR', 'Xencor', 31.97, 35.61, 35.75, '+0,41 %']];
const de2 = v => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const trRow = ([t, n, inv, auf, close, g]) => { const lo = Math.min(inv, auf, close) * .995, hi = Math.max(inv, auf, close) * 1.005, x = v => ((v - lo) / (hi - lo) * 100).toFixed(1); return `<div class="trr"><div class="trr-h">${logo(t, 32)}<div style="min-width:0;flex:1"><b>${n}</b><span>Turtle · im Musterdepot</span></div>${pillv(g, 1)}</div><div class="zb sm2"><i style="left:${x(inv)}%"></i><i class="z" style="left:${x(auf)}%"></i><i class="me" style="left:${x(close)}%"></i></div><div class="zb-l xs"><span>Ungültig ${de2(inv)} $</span><span>Aufnahme ${de2(auf)} $</span><span>Schluss ${de2(close)} $</span></div></div>`; };
screen('t-treffer', { world: 'supertrader', dock: 2, h: 1360, body: `<div class="ltag">Treffer · Schluss ${ASOF}</div><div class="lt" style="margin-top:4px">Wo steht welche<br>Aktie im Ablauf?</div>
<div style="margin-top:10px">${FORSCH}</div>
<div class="chips" style="margin-top:12px;flex-wrap:wrap;white-space:normal;gap:6px">${[['Im Musterdepot', '624', 1], ['Plan fertig', '34'], ['Abgegeben', '10'], ['Alle Methoden', ''], ['Turtle', '']].map(([a, b, on]) => `<span class="chip${on ? ' on' : ''}" style="height:32px;font-size:12.5px">${a}${b ? ` <span style="opacity:.6;margin-left:4px">${b}</span>` : ''}</span>`).join('')}</div>
<div class="card" style="margin-top:10px;padding:10px 12px">${steps(DEP, 2)}</div>
<div class="st">624 im Musterdepot<a>Sortiert: seit Aufnahme</a></div><p class="xs mu b" style="margin:-4px 0 4px">● Ungültig-Marke · <span style="color:#000;background:var(--lime);border-radius:9px;padding:0 5px">●</span> Aufnahme · ○ Schluss</p>
<div>${TR.map(trRow).join('')}</div>
<div class="btn line" style="margin-top:12px;height:46px;font-size:14.5px">Weitere 25 laden</div>
<div style="margin-top:10px">${help('Ungültig-Marke laut Methode: fällt der Schluss darunter, gibt das Musterdepot die Aktie ab. Rechenmodell, keine Order.')}</div>` });

/* Aktie, Perspektive Methoden */
const head = () => VU.STOCK('Methoden', { s: { t: 'NVDA', name: 'NVIDIA', what: 'Chips für KI und Grafik', p: 186.64, d: 2.7753, eur: '167,17 €', date: ASOF } }).replace('<span class="lg">NVDA</span>', logo('NVDA', 42));
const PROT = [['12.10.', 'Musterdepot gibt ab', 'Turtle · 226,80 $', pillv('−4,02 %', 0)], ['08.10.', 'Musterdepot gibt ab', 'Darvas · Box · 232,18 $', pillv('−1,74 %', 0)], ['08.10.', 'Warnzeichen laut Methode', 'Turtle · 230,48 $', ''], ['02.10.', 'Musterdepot nimmt auf', 'Darvas · Box und Turtle · 236,29 $', ''], ['01.10.', 'Plan fertig', 'beide Methoden · 230,86 $', '']];
screen('t-stock', { world: 'supertrader', dock: 0, hdr: false, h: 1300, body: `${head()}
<div class="story" style="margin-top:14px"><div class="ltag" style="color:#9b9b9b">Supertrader in drei Sätzen</div>${[
  ['i-target', 'Heute', '1 von 13 Methoden erkennt NVIDIA: Morales & Kacher · Buyable Gap-Up.', vd('s', 'Regel erfüllt')],
  ['i-grid', 'Musterdepot', 'Kein Musterdepot hält NVIDIA gerade.', vd('o', 'Nicht dabei')],
  ['i-book', 'Zuletzt', 'Im Oktober 10 Tage in zwei Musterdepots, dann abgegeben.', vd('w', '−4,02 %')]].map(([i, l, t, v]) => `<div class="story-r"><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><div><span class="ltag" style="color:#9b9b9b">${l}</span><p>${t}</p></div>${v}</div>`).join('')}</div>
<div class="st">Alle 13 Methoden<a>1 erkennt</a></div>
<div class="card" style="padding:2px 14px">${[['Morales & Kacher · Buyable Gap-Up', 1], ['Weinstein · Investor', -1], ['Weinstein · Trader', -1], ['Minervini · VCP', -1], ['Morales & Kacher · Pocket Pivot', -1]].map(([n, s]) => `<div class="kv"><span class="sm b">${n}</span><span style="display:flex;gap:8px;align-items:center">${mini(0, s, 3)}<span class="xs b ${s < 0 ? 'mu' : ''}">${s < 0 ? 'nein' : 'Regel erfüllt'}</span></span></div>`).join('')}<div class="kv"><span class="sm b mu">+ 8 weitere</span>${ic('i-next', 14)}</div></div>
<div class="st">Protokoll<a>Ältere (3)</a></div>
<div class="tl">${PROT.map(([d, a, b, p]) => `<div class="tl-r"><i></i><div><b>${d} · ${a}</b><span>${b}</span></div>${p}</div>`).join('')}</div>
<div style="margin-top:10px">${help('Das Musterdepot ist ein Rechenmodell. Es zeigt, was die Regel getan hätte, nicht was du tun solltest.')}</div>` });

/* Hausstrategie */
const HS = 'ADI COP CRWD CVX DINO EOG EXPD HAS LNG MPC NTAP NTRA OKTA P PLTR PSX RBRK TEAM TXN VLO'.split(' '), HSN = 'COP CVX EOG HAS LNG P RBRK TXN'.split(' ');
screen('t-haus', { world: 'supertrader', dock: 0, h: 1700, body: `<div class="ltag">VU Hausstrategie · eigene Regeln</div><div class="lt" style="margin-top:4px">20 Aktien,<br>je 5 %</div><p class="mu" style="margin-top:8px;font-size:15px">Große US-Firmen im Aufwärtstrend, mit Kaufdruck im Volumen und starken Quartalszahlen. Die Regeln sind eingefroren.</p>
<div style="margin-top:10px">${FORSCH}</div>
<div class="today" style="margin-top:12px"><div class="tg" style="grid-template-columns:1fr 1fr"><div><b class="num" style="font-size:24px">30.10.</b><span>zuletzt entschieden</span></div><div><b class="num" style="font-size:24px">30.11.</b><span>nächste Entscheidung</span></div></div><p class="xs" style="color:#bdbdbd;margin-top:10px">Seit 05.10.2026 im Vorwärtslauf: jede Entscheidung wird vorher festgeschrieben. Ein Vorteil ist historisch nicht belegt.</p></div>
<div class="st">Im Musterdepot<a>neu am 30.10. markiert</a></div>
<div class="hsg">${HS.map(t => `<div class="${HSN.includes(t) ? 'new' : ''}">${logo(t, 30)}<b>${t}</b></div>`).join('')}</div>
<div class="st">Protokoll</div>
<div class="card" style="padding:12px 14px"><b class="sm">30.10.2026 · Monatsende</b><p class="sm" style="margin-top:4px"><b>Rein:</b> COP, CVX, EOG, HAS, LNG, P, RBRK, TXN</p><p class="sm" style="margin-top:2px"><b>Raus:</b> AMD, DELL, FTNT, HPE, MU, TER, TWLO, WAB</p><span class="xs mu">festgeschrieben 31.10.2026</span></div>
<div class="st">Die 5 Regeln</div>
<div class="card" style="padding:2px 14px">${[['Universum', 'die 500 größten US-Firmen'], ['Filter', 'über der 200-Tage-Linie, ≥ 80 % des 52-Wochen-Hochs'], ['Rang', 'Volumen, Quartalszahlen, Umsatzwachstum, Kursstärke'], ['Musterdepot', '20 Titel, gleich gewichtet, bleiben bis Rang 40'], ['Termin', 'letzter Handelstag im Monat']].map(([a, b], i) => `<div class="kv"><span style="display:flex;gap:10px;align-items:center"><span class="stepn">${i + 1}</span><span><b class="sm" style="display:block">${a}</b><span class="xs mu">${b}</span></span></span></div>`).join('')}</div>
<div class="card" style="margin-top:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center"><b class="sm">Wie wir hierhin gekommen sind</b>${ic('i-next', 16)}</div>
<p class="xs mu" style="margin-top:14px">Rechenmodell, kein echtes Geld. Keine Anlageberatung.</p>` });

/* Forschung (heute „Backtests“) */
const PRUEF = [['Kurse über viele Jahre', 0, '1,1 Jahre vorhanden, ≥ 10 nötig'], ['Damalige Aktienauswahl', 0, '7 historische Stichtage'], ['Volumen über viele Jahre', 0, '1,1 Jahre vorhanden'], ['Splits und Dividenden', 0, 'Dividenden nicht einheitlich bereinigt'], ['Ehrliche Kauf- und Verkaufskurse', 1, 'Kosten und Ausführung je Seite'], ['Test auf neuen Daten', 0, 'Zeitraum zu kurz'], ['Vergleich mit dem Markt', 1, '2 Kontrollstrategien'], ['Recht zur Veröffentlichung', 0, 'Vertragstext liegt nicht vor']];
screen('t-research', { world: 'supertrader', dock: 3, h: 1420, body: `${FORSCH}<div class="lt" style="margin-top:8px">Wie belastbar ist<br>welche Methode?</div><p class="mu" style="margin-top:8px;font-size:15px">Ein Test spielt eine Regel mit alten Kursen durch. Nur ein sauberer Test ist etwas wert.</p>
<div class="today" style="margin-top:14px"><b class="num" style="font-size:44px;letter-spacing:-.05em;color:var(--lime);line-height:1">0 von 9</b><p style="margin-top:6px;font-weight:700">Regelversionen mit belegtem Vorteil</p><div class="tg" style="margin-top:10px">${[['6', 'in Prüfung'], ['3', 'Daten fehlen'], ['0', 'ohne Vorteil']].map(([a, b]) => `<div><b class="num" style="font-size:22px">${a}</b><span>${b}</span></div>`).join('')}</div></div>
<div class="st">Was für einen fairen Test fehlt<a>2 von 8 erfüllt</a></div>
<div class="card" style="padding:4px 14px">${PRUEF.map(([a, ok, b]) => `<div class="cnd" style="margin:8px 0"><span class="cnd-i${ok ? ' ok' : ''}">${ic(ok ? 'i-check' : 'i-x', 12)}</span><span><b style="display:block">${a}</b><small class="mu">${b}</small></span><span></span></div>`).join('')}</div>
<div class="st">Stand je Methode</div>
<div class="card" style="padding:2px 14px">${[['Kullamägi · Breakout', 'Version 3.2.0'], ['Weinstein', 'Version 4.0.0'], ['Darvas · Box', 'Version 3.0.2']].map(([a, b]) => `<div class="kv"><span><b class="sm" style="display:block">${a}</b><span class="xs mu">${b}</span></span>${vd('o', 'In Prüfung')}</div>`).join('')}<div class="kv"><span class="sm b mu">+ 6 weitere</span>${ic('i-next', 14)}</div></div>
<div class="card" style="margin-top:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center"><span><b class="sm" style="display:block">Älterer Pilot: Turtle auf Wochenschlüssen</b><span class="xs mu">explorativ, nicht belastbar</span></span>${ic('i-next', 16)}</div>` });

/* ======================================================================
   Folien
   ====================================================================== */
slide({ t: 'html', anchor: 'cover', dark: 1, html: () => `<div class="covergrid"><div><img src="${src('img/vision-universe-logo-web.png')}" alt="Vision Universe" style="height:20px;filter:invert(1);margin-bottom:36px"><div style="font-size:clamp(46px,7vw,100px);font-weight:900;letter-spacing:-.06em;line-height:.9">Supertrader.<br><span style="color:var(--lime)">Das Rezept<br>eines Profis.</span></div><p style="margin-top:22px;color:#a6a6a6;font-size:clamp(16px,1.5vw,20px);font-weight:500;max-width:46ch">Konzept für Supertrader: jede Methode ein Name, ein Ablauf in klaren Schritten, Musterdepots ohne echtes Geld, Forschung offen gezeigt. Gleicher Ansatz wie Discover, Quant und Fundamental.</p><div class="toc" id="toc" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:28px"></div></div><div class="coverphones"><div data-frame="t-home"></div><div data-frame="t-method"></div></div></div>` });

slide({ t: 'html', id: 'K1', title: 'Die eine Idee: der Ablauf', sub: 'Heute gibt es zwei Stufen-Systeme nebeneinander („Bild passt · Regel bestätigt · Durchgerechnet“ und „Muster entsteht · Marke erreicht · Modell ist dabei · Abgeschlossen“) und dazu „Stufe 3“, „Kurz vor der Marke“, „Warnzeichen“. Neu: eine Leiste mit klaren Wörtern, überall gleich, für zwei Fragen.', html: () => `<div class="formats"><div class="fmt"><div class="fmt-h"><b>Erkennen: zeigt die Aktie das Muster?</b><p>Für alle 13 Methoden, jeden Tag, über alle US-Aktien. Drei Stufen.</p></div><div class="fmt-b scr" style="display:block">${steps(ERK, 2)}<div style="margin-top:10px">${ERK.map(([a, b]) => `<p class="sm" style="margin-top:4px"><b>${a}:</b> ${b}</p>`).join('')}</div></div></div><div class="fmt"><div class="fmt-h"><b>Musterdepot: was würde die Regel tun?</b><p>Für die fünf Methoden mit Musterdepot. Vier Schritte, ohne echtes Geld.</p></div><div class="fmt-b scr" style="display:block">${steps(DEP, 2)}<div style="margin-top:10px">${DEP.map(([a, b]) => `<p class="sm" style="margin-top:4px"><b>${a}:</b> ${b}</p>`).join('')}</div></div></div></div>
<div class="xscroll" style="margin-top:24px"><table class="tbl"><thead><tr><th>Heute</th><th>Neu</th></tr></thead><tbody>${[['Bild passt · Stufe 1', 'Muster erkannt'], ['Regel bestätigt · Stufe 2', 'Regel erfüllt'], ['Durchgerechnet · Stufe 3 · Kurz vor der Marke', 'Plan fertig'], ['Muster entsteht', 'Wartet'], ['Marke erreicht · Modell steigt ein', 'Aufgenommen (Musterdepot nimmt auf)'], ['Modell ist dabei', 'Im Musterdepot'], ['Abgeschlossen · Ausstieg', 'Abgegeben (Musterdepot gibt ab)'], ['Geplatzt', 'Muster zerfallen']].map(r => `<tr><td class="mu">${r[0]}</td><td><b>${r[1]}</b></td></tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'K2', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 08.11.2026 auf 390 px: 11 Seiten von /supertrader/ und /portfolios/.', html: () => `<div class="facts">${[
  ['13 · 12 · 5 · 7', 'Wie viele Methoden gibt es? Start: 13. Datenregister: 12 Welten. Reiter: „Musterdepots 5“ und „Weitere 7“. Dazu die Hausstrategie.'],
  ['3 Namen', 'Dieselbe Methode heißt „Turtle System 1“, „Donchian Turtle“ und „VU Equity Adaptation – Turtle Trading“; ebenso Minervini SEPA / VCP / Power Play, Kullamägi Breakout / Momentum Breakout.'],
  ['„Signale“', 'Ein Leistenplatz heißt „Signale“, die Seite zeigt „Stop“, „Einstieg“, „Luft bis zum Stop“; die Methode sagt „Risiko je Kauf“, „Wird der Stop erreicht“, „Einstiegschancen“. Alles auf der Nein-Liste von WORTWAHL.md.'],
  ['„schlägt den Markt“', 'Die Hausstrategie schreibt, der Vorwärtslauf zeige, „ob die Strategie den Markt schlägt“. Nein-Liste; neu: „im Vergleich zum S&P 500“.'],
  ['Rot', 'Auf der NVIDIA-Seite sind die Ergebnisse −4,02 % und −1,74 % rote Pillen.'],
  ['5.733 px', 'ist die Seite „Signale“ lang; jede Zeile mit Stop/Einstieg/Schluss-Leiste. Der Start ist mit 3.185 px gut, aber erklärt zwei Stufen-Systeme.']].map(([a, b]) => `<div><b style="font-size:clamp(28px,3.4vw,46px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });

slide({ t: 'html', id: 'K3', title: 'Ein Name je Methode', sub: 'Regel: „Trader · Muster“. Der Name gilt auf jeder Seite, in Leiste, Protokoll und Musterdepot. Der technische Name bleibt in der Methodik.', html: () => `<div class="xscroll"><table class="tbl"><thead><tr><th>Neu</th><th>Heute auch</th><th>Musterdepot</th></tr></thead><tbody>${[
  ['Weinstein · Investor / · Trader', 'Weinstein Investor, Weinstein Trader, Weinstein Stages, VU Adaptation – Weinstein Stage Analysis', 'ja (weinstein-stages)'],
  ['Minervini · VCP', 'Minervini SEPA / VCP, Minervini VCP, VU Adaptation – Minervini', 'ja (minervini-vcp)'],
  ['Minervini · Power Play', 'Minervini Power Play', '–'],
  ['Morales & Kacher · Pocket Pivot / · Buyable Gap-Up', 'Pocket Pivot, Buyable Gap-Up', '–'],
  ['Raschke · Holy Grail', 'Holy Grail', '–'],
  ['Darvas · Box', 'Darvas-Box, Darvas Boxes, VU Adaptation – Darvas', 'ja (darvas-boxes)'],
  ['Turtle · 20 Tage / · 55 Tage', 'Turtle System 1/2, Donchian Turtle, VU Equity Adaptation – Turtle Trading', 'ja (donchian-turtle)'],
  ['Kullamägi · Breakout', 'Kullamägi Breakout, Momentum Breakout, VU Adaptation – Kullamägi Breakout', 'ja (momentum-breakout)'],
  ['Kullamägi · Episodic Pivot / · Parabolic', 'Kullamägi Episodic Pivot, Kullamägi Parabolic (Short)', '– (Parabolic nur Forschung)'],
  ['Forschung: CAN SLIM, Piotroski, Greenblatt, VU Trendfolge 52W, Market-Wizards', '„Weitere 7“', '–']].map(r => `<tr><td><b>${r[0]}</b></td><td class="mu">${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>` });

chapter({ n: '01', title: 'Start und Methoden', icon: 'supertrader', anchor: 'kap-start', was: 'Oben <b>eine schwarze Karte</b> mit dem Ablauf von heute. Methoden als Karten mit einem Namen und einem Satz.', pages: 'SX01–SX03' });
slide({ id: 'SX01', title: 'Supertrader · Start', route: '/supertrader/', now: 'T01',
  sub: 'Heute: zwei Stufen-Systeme, „Nicht belegt“-Kasten, Methoden-Liste, vier Lebenslauf-Kacheln, „Stufe 3“-Liste, NVIDIA-Beispiel. Neu: eine schwarze Karte „Heute“ mit beiden Leisten, Methoden als Schiene, „Plan fertig“ als ruhige Liste, das NVIDIA-Beispiel mit Leiste und klaren Wörtern.',
  neu: [['t-home', 'Ganze Seite']],
  spec: { aufbau: ['Kopf: ein Satz, was Supertrader ist (Methoden als Regeln, Musterdepots ohne Geld), Etikett Forschung', 'Heute: Erkennen (3 Zahlen + Leiste) und Musterdepots (4 Zahlen)', 'Schiene „Die 13 Methoden“', '„Plan fertig“: Abstand zur Zone laut Methode', 'So läuft ein Durchgang (NVIDIA, Oktober)', 'Hausstrategie, Forschung, Hinweis'],
    komponenten: ['Neu: Ablauf-Leiste (groß und mini)', 'Methoden-Karte', 'Schiene (aus Discover)'],
    daten: ['supertrader/data/* und Kandidaten-Tageslauf, wie heute'],
    weg: ['Zwei verschiedene Stufen-Namen', '„Stufe 3 heißt …“-Erklärung', '„Modell steigt ein“, „Ausstieg nach Regel“'] } });
slide({ id: 'SX02', title: 'Methoden', route: '/supertrader/strategies/', now: 'T02',
  sub: 'Heute: 13 Methoden mit Stufenbalken, dazu Reiter „Musterdepots 5“ und „Weitere 7“ mit anderen Namen. Neu: eine Liste mit einem Namen je Methode, Filter „Mit Musterdepot“ und Stil, Forschungsmodelle als Fußnote.',
  neu: [['t-methods', 'Alle Methoden']],
  spec: { aufbau: ['Suche, Chips Alle · Mit Musterdepot · Stil', 'Zeile: Trader · Muster, Etikett Musterdepot, Trader und Stil, ein Satz, Zahl heute', 'Weitere Modelle in der Forschung'], komponenten: ['Methoden-Zeile'], daten: ['wie heute; Namenszuordnung Folie K3'], weg: ['Reiter „Musterdepots 5“ / „Weitere 7“', 'Stufenbalken ohne Legende'] } });
slide({ id: 'SX03', title: 'Eine Methode: Minervini · VCP', route: '/supertrader/strategies/minervini-vcp/', now: 'T03',
  sub: 'Heute: „Eingestiegen wird …“, „Einstiegschancen“, „Risiko je Kauf“, „Stop“, Methodentreue als Fachbalken. Neu: dunkler Kopf wie eine Discover-Reihe, „So denkt die Methode“ in drei Bildern, Musterdepot mit Ablauf-Leiste und Zone/Ungültig-Marke laut Methode, Methodentreue in Alltagssprache, Kapitel.',
  neu: [['t-method', 'Minervini · VCP']],
  spec: { aufbau: ['Kopf: Stil, Musterdepot, Name, ein Satz, heute erkannt, Plätze im Musterdepot', 'So denkt die Methode: 3 Schritte', 'Im Musterdepot gerade: Aktie mit Leiste, Abstand, Ungültig · Schluss · Zone, Chart mit Zonen', 'Protokoll in drei Zahlen', 'Wie nah an der Originalregel? (17 Regelteile)', 'Wie belastbar (Forschung)', 'Kapitel'], komponenten: ['Ablauf-Leiste, Zonenleiste', 'Kopf wie Discover-Reihe'], daten: ['wie heute'], weg: ['„Eingestiegen wird …“, „Einstiegschancen“, „Risiko je Kauf“, „Stop“'] } });

chapter({ n: '02', title: 'Treffer und Aktie', icon: 'i-target', anchor: 'kap-treffer', was: '„Signale“ werden <b>Treffer</b>. Auf der Aktie: drei Sätze, alle Methoden, Protokoll.', pages: 'SX04–SX05' });
slide({ id: 'SX04', title: '„Signale“ werden „Treffer“', route: '/supertrader/signals/', newRoute: '/supertrader/treffer/', now: 'T04',
  sub: 'Heute: 769 Einträge mit Stop/Einstieg/Schluss-Leisten, Leseanleitung als neongrüne Box. Neu: Filter nach Schritt im Ablauf, die Leiste einmal oben erklärt, je Aktie Ungültig-Marke · Aufnahme · Schluss, 25 je Schritt.',
  neu: [['t-treffer', 'Im Musterdepot']],
  spec: { aufbau: ['Kopf, Etikett Forschung', 'Chips: Im Musterdepot · Plan fertig · Abgegeben · Methode', 'Ablauf-Leiste mit aktivem Schritt', 'Zeile: Logo, Name, Methode, Pille seit Aufnahme, Leiste Ungültig · Aufnahme · Schluss', '25 je Schritt'], komponenten: ['Ablauf-Leiste', 'Zonenleiste'], daten: ['wie heute'], weg: ['Wort „Signal“ (WORTWAHL.md: Plan §11 keine Signale)', '„Stop“, „Einstieg“, „Luft bis zum Stop“'] } });
slide({ id: 'SX05', title: 'NVIDIA, Perspektive „Methoden“', route: '/supertrader/stock/NVDA/', newRoute: '/aktie/NVDA?p=methoden', now: 'T06',
  sub: 'Heute schon kompakt, aber mit roten Pillen, „Einstieg/Ausstieg“, „Modell steigt ein“. Neu im Muster der anderen Welten: drei Sätze (Heute · Musterdepot · Zuletzt), alle 13 Methoden mit Mini-Leiste, Protokoll als Zeitleiste mit klaren Wörtern.',
  neu: [['t-stock', 'NVIDIA']],
  spec: { aufbau: ['Aktienkopf + Perspektiven-Leiste', 'Supertrader in drei Sätzen', 'Alle 13 Methoden mit Mini-Leiste', 'Protokoll: nimmt auf / gibt ab / Warnzeichen laut Methode, Ergebnis als Pille (schwarz bei Minus)'], komponenten: ['Story-Karte (aus Discover)', 'Mini-Leiste', 'Zeitleiste'], daten: ['supertrader/stock/{T}/ wie heute'], weg: ['Kacheln „Ausbruch 0 von 4 · Trend 0 von 4 · Lücke 1 von 5“ → Liste', 'Rote Pillen'] } });

chapter({ n: '03', title: 'Musterdepots und Forschung', icon: 'i-bars', anchor: 'kap-forschung', was: 'Hausstrategie als ruhige Seite. Backtests heißen <b>Forschung</b>, wie in Quant.', pages: 'SX06–SX08' });
slide({ id: 'SX06', title: 'VU Hausstrategie', route: '/supertrader/hausstrategie/', now: 'T07',
  sub: 'Heute: gut gebaut, aber „ob die Strategie den Markt schlägt“ und eine lange Prüfgeschichte vorne. Neu: Termine in einer schwarzen Karte, 20 Aktien als Logo-Raster mit Markierung der neuen, Protokoll, fünf Regeln, Prüfgeschichte als Kapitel.',
  neu: [['t-haus', 'Hausstrategie']],
  spec: { aufbau: ['Kopf mit Satz und Etikett', 'Termine (zuletzt / nächste Entscheidung), Vorwärtslauf', 'Logo-Raster 20 Aktien, neue markiert', 'Protokoll Rein/Raus', 'Die 5 Regeln', 'Wie wir hierhin gekommen sind (Kapitel)'], komponenten: ['Logo-Raster'], daten: ['wie heute'], weg: ['„ob die Strategie den Markt schlägt“'] } });
slide({ id: 'SX07', title: 'Backtests werden „Forschung“', route: '/supertrader/backtests/', newRoute: '/supertrader/forschung/', now: 'T05',
  sub: 'Heute: „0 von 9“ gut sichtbar, Prüfstand als Liste mit Fachtext (OHLCV, Same-Bar, Stop-Buy/Stop-Loss). Neu wie in Quant: Etikett oben, Stand in Zahlen, „Was für einen fairen Test fehlt“ als Prüfliste in Alltagssprache, Stand je Methode, der ältere Pilot als Kapitel.',
  neu: [['t-research', 'Forschung']],
  spec: { aufbau: ['Etikett, Frage, ein Satz', '0 von 9 + 3 Zahlen', 'Prüfliste 8 Punkte', 'Stand je Methode', 'Älterer Pilot als eigener Eintrag'], komponenten: ['Prüfliste (wie Checklisten in Fundamental)'], daten: ['supertrader/data/backtests.json und Zertifizierungs-Dokumente'], weg: ['Fachbegriffe in der Prüfliste → „?“', 'Pilot-Chart mit Renditevergleich auf der Hauptseite → eigenes Kapitel, Inhalt unverändert'] } });
slide({ t: 'html', id: 'SX08', title: 'Wortwahl', sub: 'Pflicht nach docs/legal/WORTWAHL.md (Plan §11: keine Signale, keine Handelsanweisungen).', html: () => `<div class="xscroll"><table class="tbl"><thead><tr><th>Heute</th><th>Neu</th></tr></thead><tbody>${[
  ['Signale (Leiste, Seite)', 'Treffer'], ['Stop, Luft bis zum Stop, Wird der Stop erreicht', 'Ungültig-Marke laut Methode, Abstand zur Ungültig-Marke'], ['Einstieg, Einstieg des Modells, Eingestiegen wird', 'Zone laut Methode; Musterdepot nimmt auf'], ['Ausstieg', 'Musterdepot gibt ab'], ['Modell steigt ein · Modell ist dabei', 'Aufgenommen · Im Musterdepot'], ['Risiko je Kauf', 'Anteil je Aufnahme im Musterdepot'], ['Einstiegschancen', 'entfällt'], ['ob die Strategie den Markt schlägt', 'wie die Regel im Vergleich zum S&P 500 läuft'], ['Kurz vor der Marke', 'Plan fertig · noch N % bis zur Zone']].map(r => `<tr><td class="mu"><s>${r[0]}</s></td><td><b>${r[1]}</b></td></tr>`).join('')}</tbody></table></div>` });

chapter({ n: '04', title: 'Umsetzung', icon: 'layers', anchor: 'umsetzung', was: 'Nur Oberfläche, Namen und Texte. <b>Keine Regel, kein Musterdepot, kein Tageslauf ändert sich.</b>', pages: 'U1' });
slide({ t: 'html', id: 'U1', title: 'Fahrplan und Entscheidungen', html: () => `<div class="plan" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[
  ['PR 1', 'Wortwahl und Farben', 'Folie SX08 auf allen Supertrader-Seiten, rote Pillen schwarz. Klein, sofort.'],
  ['PR 2', 'Namen und Ablauf', 'Ein Name je Methode (K3), eine Ablauf-Leiste mit den neuen Wörtern (K1).'],
  ['PR 3', 'Start, Methoden, Methode', 'Folien SX01–SX03.'],
  ['PR 4', 'Treffer, Aktie, Hausstrategie, Forschung', 'Folien SX04–SX07; neue Adressen leiten von den alten weiter.']].map(([a, b, c]) => `<div><span class="tag neu">${a}</span><b>${b}</b><p>${c}</p></div>`).join('')}</div>
<h3 style="margin-top:36px;font-size:22px;letter-spacing:-.02em">Von dir zu entscheiden</h3>
<ol class="dec">${[
  ['Namen „Treffer“ (statt Signale) und „Forschung“ (statt Backtests)?', 'Empfehlung: ja; die Leiste wird Supertrader · Methoden · Treffer · Forschung · Menü.'],
  ['Ein Name je Methode nach „Trader · Muster“?', 'Empfehlung: ja, Tabelle K3. Technische Namen nur noch in der Methodik.'],
  ['Pilot-Backtest mit Renditevergleich (−37,8 % zu S&P 500) auf der Hauptseite?', 'Empfehlung: in ein eigenes Kapitel, Inhalt unverändert. Öffentliche Aussagen über Rendite bleiben dein Thema (CLAUDE.md).'],
  ['Gate A', 'Supertrader-PRs enthalten nur Supertrader-Pfade; die gemeinsame Ablauf-Leiste liegt deshalb unter supertrader/assets/, nicht unter assets/.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });
})();
