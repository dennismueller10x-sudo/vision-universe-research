/* Konzept Technical · „Der Chart in drei Sätzen“, Stand 09.11.2026.
   Bausteine aus ../redesign-2027/lib.js (Kopie in lib/). Befunde, Zonen, Trefferzahlen und Musterzahlen wie am
   09.11.2026 auf /technical/ abgelesen (Datenstand 06.11.2026); Kursreihen echt (data-tc.js). */
(function () {
'use strict';
const { screen, slide, chapter, ic, hud, chart, help, vd, tf } = VU;
const SER = TCD.series;
const ASOF = 'Fr. 06.11.';
const src = p => (window.__IMG && window.__IMG[p]) || p;
const logo = (t, s = 36) => `<span class="lgx" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .28)}px"><b style="font-size:${Math.max(8.5, s * .25)}px">${t}</b><img src="${src('img/logos/' + t + '.png')}" alt="" onerror="this.remove()"></span>`;
const pillv = (txt, up) => `<span class="chg ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${String(txt).replace(/^[+−]/, '')}</span>`;
const railHead = (t, cnt, s, tag) => `<div class="rh"><div class="rh-t"><b>${t}</b>${tag ? `<span class="rh-tag">${tag}</span>` : ''}<a>${cnt ? 'Alle ' + cnt : 'Alle'} ${ic('i-next', 13)}</a></div>${s ? `<p>${s}</p>` : ''}</div>`;
const rail = items => `<div class="rail">${items.join('')}</div>`;
const sp = (t, w = 64, h = 24) => SER[t] ? chart(SER[t], { w, h, grid: false, base: false }) : '';
/* Richtung in Worten statt „bullisch/bärisch“ */
const dir = d => d > 0 ? vd('s', 'deutet nach oben') : d < 0 ? vd('w', 'deutet nach unten') : vd('m', 'Richtung offen');
/* Muster als kleines Bild */
const SH = { dreieck: 'M3 6 L33 13 L3 20 M3 6 L3 20', range: 'M3 8 H33 M3 18 H33 M6 13 L11 9 L16 17 L21 9 L26 17 L31 9', doppelboden: 'M3 4 L10 18 L17 9 L24 18 L33 4', doppeltop: 'M3 20 L10 6 L17 15 L24 6 L33 20', kopf: 'M2 20 L8 11 L12 15 L18 3 L24 15 L28 11 L34 20', luecke_dn: 'M3 5 L14 9 M20 15 L33 19', luecke_up: 'M3 19 L14 15 M20 9 L33 5', flagge: 'M3 21 L12 5 L20 9 L27 7 L33 11' };
const shape = (k, s = 36) => `<svg width="${s}" height="${Math.round(s * .66)}" viewBox="0 0 36 24" aria-hidden="true"><path d="${SH[k]}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ======================================================================
   Technical · Start
   ====================================================================== */
const NEU = [['PEBK', 'Peoples Bancorp', 'Doppeltop, nach unten aufgelöst', -1, '−4,56 %', 'doppeltop'], ['GMED', 'Globus Medical', 'Seitwärtsrange, nach unten verlassen', -1, '−12,76 %', 'range'], ['DTIL', 'Precision BioSciences', 'Ausbruch über Widerstand', 1, '+7,40 %', 'range']];
const VORL = [['Steigt seit Monaten', 'Aufwärtstrend · 8 Regeln', 542, 'i-signal'], ['Gerade ausgebrochen', 'über Widerstand oder Range', 832, 'i-new'], ['Auf Jahreshoch', 'höchster Schluss seit 52 Wochen', 59, 'i-star'], ['Ruhige Rücksetzer', 'Schwankung zieht sich zusammen', 108, 'i-wave'], ['Dreieck nach oben aufgelöst', 'Dreieck mit Ausbruch nach oben', 151, 'i-target']];
const MU = [['Dreieck', 888, 0, 'dreieck'], ['Ausbruch aus Range', 644, 1, 'range'], ['Doppelboden', 308, 1, 'doppelboden'], ['Doppeltop', 373, -1, 'doppeltop'], ['Kopf-Schulter', 236, -1, 'kopf'], ['Kurslücke nach oben', 447, 1, 'luecke_up'], ['Kurslücke nach unten', 464, -1, 'luecke_dn'], ['Flagge steigend', 54, 1, 'flagge']];
const neuCard = ([t, n, s, d, chg, k]) => `<div class="nc"><div style="display:flex;align-items:center;gap:8px">${logo(t, 32)}<div style="min-width:0;flex:1"><b>${n}</b><span class="xs mu b">${t}</span></div>${pillv(chg, d > 0)}</div><div class="nc-s"><span class="nc-ic">${shape(k, 30)}</span><span>${s}</span></div><div style="margin-top:8px">${sp(t, 196, 40)}</div>${dir(d)}</div>`;
const vCard = ([a, b, c, i]) => `<div class="idc" style="width:180px"><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><b style="margin-top:8px">${a}</b><span class="xs mu">${b}</span><div class="idc-n"><b class="num">${c.toLocaleString('de-DE')}</b><small>Treffer</small></div></div>`;
screen('c-home', { world: 'technical', dock: 0, h: 1480, body: `<div class="ltag">Technical · Schluss ${ASOF}</div><div class="lt" style="margin-top:4px">Was zeigt<br>der Chart?</div><p class="mu" style="margin-top:8px;font-size:15px">Jeden Tag lesen feste Regeln die Charts aller US-Aktien und sagen in Worten, was auffällt.</p>
<div style="margin-top:14px">${VU.search('Aktie oder „Dreieck über der 200-Tage-Linie“')}</div>
<div class="chips" style="margin-top:10px">${['NVDA', 'AAPL', 'TSLA', 'MSFT'].map(t => `<span class="chip" style="gap:8px">${logo(t, 20)}${t}</span>`).join('')}</div>
<div class="ms" style="margin-top:14px;grid-template-columns:1fr auto"><div><span class="ltag">Markt heute</span><b>Schwacher Markt <span class="mu xs b">34 % über der 200-Tage-Linie</span></b><div style="height:6px;border-radius:9px;background:var(--a-line);margin-top:6px"><i style="display:block;height:100%;width:34%;background:var(--a-ink);border-radius:9px"></i></div></div>${ic('i-next', 14)}</div>
${railHead('Heute neu im Chart', '', 'Ein Muster hat sich gestern aufgelöst.')}
${rail(NEU.map(neuCard))}
${railHead('Fertige Suchen', 13, 'Tipp öffnet die Treffer im Screener.')}
${rail(VORL.map(vCard))}
${railHead('Muster heute im Markt', 24, 'So viele Aktien zeigen das Muster.')}
<div class="mgrid">${MU.slice(0, 4).map(([a, n, d, k]) => `<div><span class="mg-ic">${shape(k, 40)}</span><b>${a}</b><div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><b class="num" style="font-size:20px">${n}</b><span class="dirdot ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '◆'}</span></div></div>`).join('')}</div>
${railHead('Lernen', '', '')}
<div class="card lime" style="padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('i-book', 20)}</span><div style="flex:1"><b style="display:block">Chart lesen in 4 Lektionen</b><span class="sm">Kurskerze, Struktur, Unterstützung und Widerstand</span></div>${ic('i-next', 18)}</div>
<p class="xs mu" style="margin-top:16px">Befunde nach festen Regeln. Keine Handlungsempfehlung. Kursstand 06.11.2026.</p>` });

/* ======================================================================
   NVIDIA, Perspektive „Chart“
   ====================================================================== */
const head = () => VU.STOCK('Chart', { s: { t: 'NVDA', name: 'NVIDIA', what: 'Chips für KI und Grafik', p: 186.64, d: 2.7753, eur: '167,17 €', date: ASOF } }).replace('<span class="lg">NVDA</span>', logo('NVDA', 42));
const ZONES = [[174.95, 178.83, 'l', 'Unterstützung 175–179'], [185.2, 199.68, 'g', 'Widerstand 185–200']];
const BEF = [['Kurslücke nach unten', 'am 05.11. · ungültig über 199,68 $', -1, 'luecke_dn'], ['Kurs unter der 200-Tage-Linie', '186,64 $ zu 204,67 $ (−8,8 %)', -1, 'range'], ['50-Tage-Linie über der 200-Tage-Linie', '219,81 $ zu 204,67 $', 1, 'flagge']];
const befRow = ([a, b, d, k]) => `<div class="bf"><span class="nc-ic">${shape(k, 28)}</span><div style="min-width:0"><b>${a}</b><span>${b}</span></div>${dir(d)}</div>`;
screen('c-chart', { world: 'technical', dock: 2, hdr: false, h: 1600, body: `${head()}
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"><div><span class="ltag">Was der Chart sagt</span><div class="mt" style="margin-top:2px">Abwärtstrend</div></div>${vd('w', 'Schwach')}</div>
<div style="margin-top:8px">${chart(SER.NVDA, { h: 170, zones: ZONES, axis: ['Nov 25', 'Nov 26'] })}</div>${tf('1J')}
<div class="chips" style="margin-top:8px"><span class="chip on" style="height:30px;font-size:12.5px">Zonen</span><span class="chip" style="height:30px;font-size:12.5px">Trendlinie</span><span class="chip" style="height:30px;font-size:12.5px">200-Tage-Linie</span></div>
<div class="story" style="margin-top:14px"><div class="ltag" style="color:#9b9b9b">Der Chart in drei Sätzen</div>${[
  ['i-line', 'Trend', 'Der Kurs liegt 8,8 % unter der 200-Tage-Linie.', vd('w', 'Schwach')],
  ['i-signal', 'Schwung', 'Der Kurs ist zuletzt stark gefallen (RSI 30,8, fast „überverkauft“).', vd('w', 'Schwach')],
  ['i-bars', 'Letzter Tag', 'Plus 2,78 % bei fast doppelt so viel Handel wie üblich.', vd('s', 'Stark')]].map(([i, l, t, v]) => `<div class="story-r"><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><div><span class="ltag" style="color:#9b9b9b">${l}</span><p>${t}</p></div>${v}</div>`).join('')}</div>
<div class="grid2" style="margin-top:12px;gap:8px"><div class="zt"><small>Widerstand ▲</small><b class="num">192,53 $</b><span>Zone 185–200 $ · 7-mal gestoppt</span></div><div class="zt lo"><small>Unterstützung ▼</small><b class="num">176,89 $</b><span>Zone 175–179 $ · 2-mal gehalten</span></div></div>
${railHead('Befunde heute', 6, 'Was die Regeln heute im Chart finden.')}
<div class="card" style="padding:2px 14px">${BEF.map(befRow).join('')}</div>
<div class="eps ep2" style="margin-top:12px">${[['Alle 6 Befunde mit Regel', 'je Befund: was er bedeutet, wann ungültig', 'i-list'], ['Verlauf der letzten 12 Monate', 'jede Erkennung seit November 2025, 1 heute aktiv', 'i-book'], ['Chart Studio', 'Kerzen, Linien, RSI, MACD · PRO', 'i-line']].map(([a, b, c], i) => `<div class="ep"><b class="ep-n">${i + 1}</b><span class="hud" style="width:40px;height:40px;border-radius:12px">${ic(c, 19)}</span><div class="ep-t"><b>${a}</b><span>${b}</span></div><span class="ep-c">${ic('i-next', 15)}</span></div>`).join('')}</div>
<p class="xs mu" style="margin-top:14px">Befunde nach festen Regeln. Keine Handlungsempfehlung. Quant und Supertrader zur selben Aktie: oben in der Leiste.</p>` });

/* Ein Befund geöffnet */
const VERL = [['05.11.', 'Kurslücke nach unten', 'heute aktiv', 1], ['30.10.', 'Kurslücke nach unten', 'nicht mehr aktiv', 0], ['05.10.', 'Ausbruch über Widerstand', 'nicht mehr aktiv', 0], ['21.09.', 'Steigende Unterstützungslinie', 'heute ungültig', 0], ['14.09.', 'Steigender Keil', 'nicht mehr aktiv', 0]];
screen('c-befund', { world: 'technical', dock: 2, hdr: false, body: `${head()}`, overlay: `<div class="ovl"></div><div class="sheet" style="top:150px"><div class="grab"></div><div style="display:flex;gap:12px;align-items:center"><span class="mg-ic" style="width:52px;height:52px">${shape('luecke_dn', 38)}</span><div style="flex:1"><span class="ltag">Befund · NVIDIA</span><div class="mt" style="margin-top:2px">Kurslücke nach unten</div></div>${dir(-1)}</div>
<p class="sm" style="margin-top:12px">Der Kurs hat am 05.11. deutlich unter dem Vortagestief eröffnet. Die Lücke bleibt bestehen, solange der Schluss unter <b>199,68 $</b> bleibt.</p>
<div class="grid2" style="margin-top:12px;gap:8px"><div class="kt" style="width:auto"><small>Erkannt</small><b class="num">05.11.2026</b></div><div class="kt" style="width:auto"><small>Ungültig laut Regel</small><b class="num">über 199,68 $</b></div></div>
<div class="card" style="margin-top:12px;padding:12px 14px;display:flex;align-items:center;gap:10px"><span class="rh-tag" style="background:var(--a-ink);color:var(--lime)">Forschung</span><span class="sm" style="flex:1">Hilft dieses Muster? 24 Muster mit Belegen</span>${ic('i-next', 15)}</div>
<div class="st">Verlauf bei NVIDIA<a>12 Monate</a></div>
<div class="tl">${VERL.map(([d, a, b, on]) => `<div class="tl-r"><i style="${on ? 'background:var(--lime);box-shadow:0 0 0 2px var(--a-ink)' : ''}"></i><div><b>${d} · ${a}</b><span>${b}</span></div></div>`).join('')}</div></div>` });

/* Muster */
const HILFT = [['Range-Ausbruch', '51 % lagen vorn · 7.690 Fälle', 's', 'Belegt'], ['Fallende Widerstandslinie', '53,1 % · 8.622 Fälle', 'o', 'Kein Vorteil'], ['Ausbruch über Widerstand', '47,6 % · 11.499 Fälle', 'o', 'Kein Vorteil'], ['Kurslücke nach oben', '45,3 % · 4.123 Fälle', 'w', 'Gegen die Lesart']];
screen('c-muster', { world: 'technical', dock: 3, h: 1300, body: `<div class="ltag">Muster</div><div class="lt" style="margin-top:4px">Was die Formen<br>im Chart bedeuten</div>
<div class="seg" style="margin-top:12px"><span class="on">Muster</span><span>Indikatoren</span><span>Regeln</span></div>
<div class="st">Heute im Markt<a>24 Muster</a></div>
<div class="mgrid">${MU.map(([a, n, d, k]) => `<div><span class="mg-ic">${shape(k, 40)}</span><b>${a}</b><div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><b class="num" style="font-size:20px">${n}</b><span class="dirdot ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '◆'}</span></div></div>`).join('')}</div>
<div style="margin-top:8px">${help('▲ deutet nach oben, ▼ nach unten, ◆ Richtung offen. Zahl: Aktien mit dem Muster am 06.11.')}</div>
<div class="st">Hilft das Muster?<a>Forschung</a></div>
<div class="card" style="padding:4px 14px">${HILFT.map(([a, b, k, v]) => `<div class="kv"><span><b class="sm" style="display:block">${a}</b><span class="xs mu">${b} · 20 Tage danach</span></span>${vd(k, v)}</div>`).join('')}</div>
<div style="margin-top:8px">${help('„Lagen vorn“: Anteil der Fälle, in denen die Aktie 20 Handelstage danach besser lief als der Durchschnitt. Forschung, nicht zertifiziert.')}</div>` });

/* Lernen (Akademie + Assistent) */
const PFADE = [['Chart lesen', 4, 'Kurskerze, Struktur, Unterstützung und Widerstand', 'i-line'], ['Trendfolge', 4, '200-Tage-Linie, relative Stärke', 'i-signal'], ['Ausbrüche', 4, 'Dreiecke, Bestätigung, Fehlausbrüche', 'i-new'], ['Schwung', 4, 'RSI, MACD, Trend gegen Schwung', 'i-wave'], ['Schwankung und Risiko', 4, 'ruhige und unruhige Phasen', 'i-shapes'], ['Trendwechsel', 4, 'Doppelboden, Kopf-Schulter', 'i-target'], ['Mehrere Zeitrahmen', 4, 'Tag, Woche, Monat', 'i-grid'], ['Eigene Routine', 4, 'in 10 Minuten durch einen Chart', 'i-check']];
screen('c-lernen', { world: 'technical', dock: 0, h: 1300, body: `<div class="ltag">Lernen</div><div class="lt" style="margin-top:4px">Charts lesen<br>lernen</div><p class="mu" style="margin-top:8px;font-size:15px">8 Lernpfade, 32 kurze Lektionen. Fortschritt bleibt auf diesem Gerät.</p>
<div class="today" style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:center"><div><span class="ltag" style="color:#9b9b9b">Weiter mit</span><b style="display:block;font-size:18px;margin-top:2px">Chart lesen · Lektion 1</b><span class="xs" style="color:#bdbdbd">Aufbau einer Kurskerze</span></div><span class="nb-go" style="width:44px;height:44px">${ic('i-play', 18)}</span></div><div class="prog" style="background:#2a2a2a;margin-top:12px"><i style="width:0%;background:var(--lime)"></i></div><span class="xs" style="color:#9b9b9b">0 von 32 Lektionen</span></div>
<div class="st">Lernpfade</div>
<div class="lpg">${PFADE.map(([a, n, b, i]) => `<div><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><b>${a}</b><span>${b}</span><div class="lp-d">${Array.from({ length: n }, () => '<i></i>').join('')}</div></div>`).join('')}</div>
<div class="st">Eine Frage an den Chart</div>
<div class="chips" style="flex-wrap:wrap;white-space:normal;gap:6px">${['Welche Aktien sind im Aufwärtstrend?', 'Wo gibt es einen Ausbruch?', 'Welche Aktien laufen besser als der Markt?', 'Wer steht an einer Unterstützung?'].map(x => `<span class="chip" style="height:auto;min-height:34px;padding:7px 12px;font-size:13px;white-space:normal">${x}</span>`).join('')}</div>
<div style="margin-top:8px">${help('Jede Frage öffnet den Screener mit passenden Regeln. Beispiele in den Lektionen sind konstruiert; keine Anlageempfehlung.')}</div>` });

/* Screener: Technical als Perspektive „Chart“ im gemeinsamen Screener */
screen('c-screener', { world: 'screener', dock: 0, body: `<div class="ltag">Screener · Perspektive Chart</div><div class="lt" style="margin-top:4px">Was suchst du?</div>
<div class="chips" style="margin-top:12px">${[['i-globe', 'Basis'], ['fundamental', 'Zahlen'], ['quant', 'Faktoren'], ['technical', 'Chart', 1]].map(([i, l, on]) => `<span class="chip${on ? ' on' : ''}" style="height:34px;font-size:13px">${ic(i, 15)}${l}</span>`).join('')}</div>
<div class="satz"><span class="ltag" style="color:#9b9b9b">In Worten suchen</span><p style="font-size:20px">Dreieck im Aufwärtstrend</p><div class="satz-c" style="margin-top:10px"><span class="satz-o"><b>Dreieck in Bildung</b></span><span class="satz-o"><b>im Aufwärtstrend</b></span></div><p class="xs" style="color:#9b9b9b;margin-top:8px;font-size:12px;font-weight:600;letter-spacing:0">2 Regeln erkannt. Was wir nicht erkennen, zeigen wir an.</p></div>
${railHead('Fertige Suchen · Chart', 13, '')}
${rail(VORL.slice(0, 4).map(vCard))}
<div class="btn" style="margin-top:16px;height:52px">155 Treffer zeigen</div>
<div style="margin-top:10px">${help('Technical hat keinen eigenen Screener mehr: dieselben Regeln, Vorlagen und die Suche in Worten stecken in der Perspektive „Chart“ des einen Screeners.')}</div>` });

/* ======================================================================
   Folien
   ====================================================================== */
slide({ t: 'html', anchor: 'cover', dark: 1, html: () => `<div class="covergrid"><div><img src="${src('img/vision-universe-logo-web.png')}" alt="Vision Universe" style="height:20px;filter:invert(1);margin-bottom:36px"><div style="font-size:clamp(46px,7vw,100px);font-weight:900;letter-spacing:-.06em;line-height:.9">Technical.<br><span style="color:var(--lime)">Der Chart<br>in drei Sätzen.</span></div><p style="margin-top:22px;color:#a6a6a6;font-size:clamp(16px,1.5vw,20px);font-weight:500;max-width:46ch">Konzept für Technical: ein Wort für alles, was die Regeln finden, Richtungen in Worten statt Fachjargon, der Chart mit Zonen und drei Sätzen, Lernen als eigener Ort. Gleicher Ansatz wie die anderen Welten.</p><div class="toc" id="toc" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:28px"></div></div><div class="coverphones"><div data-frame="c-chart"></div><div data-frame="c-muster"></div></div></div>` });

slide({ t: 'html', id: 'K1', title: 'Die eine Idee: ein Wort, eine Richtung', sub: 'Heute heißt dasselbe „Signale“, „Befunde“, „Erkennungen“, „Setups“ oder „Aktive Signale“; die Richtung heißt „bullisch“, „bärisch“, „▲ Aufwärts“ oder „deutet nach oben“. Neu: alles, was die Regeln finden, ist ein Befund. Jede Richtung steht in Worten. Fachbegriffe wie SMA, RSI oder MACD bleiben im Chart Studio und im „?“.', html: () => `<div class="formats"><div class="fmt"><div class="fmt-h"><b>Befund mit Richtung</b><p>Bild des Musters, Name, ein Satz mit Datum und Ungültig-Marke laut Regel, Richtung in Worten.</p></div><div class="fmt-b scr" style="display:block">${BEF.map(befRow).join('')}</div></div><div class="fmt"><div class="fmt-h"><b>Muster als Bild</b><p>Jedes Muster hat ein kleines Bild, überall gleich: auf dem Start, in Befunden, auf der Musterseite, in den Lektionen.</p></div><div class="fmt-b scr" style="display:block"><div class="mgrid">${MU.slice(0, 4).map(([a, n, d, k]) => `<div><span class="mg-ic">${shape(k, 40)}</span><b>${a}</b></div>`).join('')}</div></div></div></div>
<div class="xscroll" style="margin-top:24px"><table class="tbl"><thead><tr><th>Heute</th><th>Neu</th></tr></thead><tbody>${[['Signale · Aktive Signale · Alle Befunde · Erkennungen · Setups', 'Befunde (heute) · Verlauf (12 Monate)'], ['Bullisch / Bärisch / Aufwärts / Abwärts', 'deutet nach oben / deutet nach unten / Richtung offen'], ['SMA 200, SMA 50 über SMA 200', '200-Tage-Linie, 50-Tage-Linie über der 200-Tage-Linie (SMA nur im Studio)'], ['RSI 14: 30,8 · Zonen über 70 überkauft …', 'Schwung: zuletzt stark gefallen (RSI im „?“)'], ['Volumen 1,95× des 20-Tage-Medians', 'fast doppelt so viel Handel wie üblich'], ['Strategie-Akademie · Analyse-Assistent', 'Lernen (ein Ort)'], ['Welche Frage möchten Sie …', 'du, wie überall']].map(r => `<tr><td class="mu"><s>${r[0]}</s></td><td><b>${r[1]}</b></td></tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'K2', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 09.11.2026 auf 390 px: 10 Seiten von /technical/.', html: () => `<div class="facts">${[
  ['4 Wörter', 'für dasselbe: Signale, Befunde, Erkennungen, Setups. Dazu „bullisch/bärisch“. „Signal“ steht in WORTWAHL.md auf der Nein-Liste (Plan §11).'],
  ['3 × Quant + Supertrader', 'Jede Chart-Ansicht (Chart, Signale, Studio) wiederholt unten einen Block mit Fachtext („kanonische siebenfaktorige Vertrag“, „Stufe ‚Geprüfte Handelsfreigabe‘ gesperrt“). Die Perspektiven-Leiste führt schon dorthin.'],
  ['6.540 px', 'ist die Signale-Ansicht von NVIDIA lang, vor allem durch 12 Monate Erkennungen als Liste.'],
  ['3. Screener', 'Technical hat einen eigenen Screener mit Suche in Worten und Vorlagen. Entschieden ist: ein Screener (/screener/), Technical wird dort Perspektive „Chart“.'],
  ['5.630 · 5.354 · 6.155', 'US-Aktien laut Technical, Screener und Quant. Markt heute: 34 % in Technical, 35 % in Quant.'],
  ['Altes Design, „Sie“', 'Die Akademie (8 Pfade, 32 Lektionen) hat unterstrichene Linklisten und doppelte Zurück-Links; der Assistent siezt und hat eine eigene Reiterleiste. Auf dem Start steht eine Kachel mit schwarzem „?“ statt Symbol.']].map(([a, b]) => `<div><b style="font-size:clamp(28px,3.4vw,46px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });

chapter({ n: '01', title: 'Start und Chart', icon: 'technical', anchor: 'kap-chart', was: 'Der Start zeigt, <b>was heute neu im Chart ist</b>. Die Aktie: Chart mit Zonen, <b>drei Sätze</b>, Befunde.', pages: 'TX01–TX03' });
slide({ id: 'TX01', title: 'Technical · Start', route: '/technical/', now: 'C01',
  sub: 'Heute: drei Zahlenkacheln (eine mit „?“), Markt, zwei fertige Suchen, „Heute neu“, vier Bestenlisten-Kacheln, Lernkarten. Neu: Suche mit Firmen-Chips, Markt als Zeile, „Heute neu im Chart“ als Karten mit Musterbild und Richtung, fertige Suchen als Schiene (→ Screener), Muster heute als Raster, Lernen.',
  neu: [['c-home', 'Ganze Seite']],
  spec: { aufbau: ['Kopf, Suche (Aktie oder Satz), Firmen-Chips', 'Markt heute als Zeile', 'Heute neu im Chart: Karte mit Logo, Pille, Musterbild, Satz, Mini-Chart, Richtung', 'Fertige Suchen (öffnen den Screener, Perspektive Chart)', 'Muster heute im Markt (Raster)', 'Lernen'], komponenten: ['Neu: Musterbild, Befund-Karte', 'Schiene, Ideen-Karte (aus Fundamental + Screener)'], daten: ['technical/data/* wie heute'], weg: ['Zahlenkacheln (5.630 · Setups ? · Stand)', 'Bestenlisten-Kacheln → fertige Suchen'] } });
slide({ id: 'TX02', title: 'NVIDIA, Perspektive „Chart“', route: '/technical/#/chart/NVDA', newRoute: '/aktie/NVDA?p=chart', now: 'C04',
  sub: 'Heute: gute Basis mit „In drei Sätzen“ und „Wichtige Preise“, aber Fachwörter (SMA, RSI), Reiter Chart/Signale/Studio und unten der lange Quant-/Supertrader-Block. Neu: Urteil und Chart mit Zonen oben, „Der Chart in drei Sätzen“ in Alltagssprache, zwei Zonen-Kacheln, Befunde heute mit Richtung in Worten, Kapitel (alle Befunde, Verlauf, Studio).',
  neu: [['c-chart', 'Ganze Seite'], ['c-befund', 'Ein Befund (Sheet)']],
  spec: { aufbau: ['Aktienkopf + Perspektiven-Leiste', 'Was der Chart sagt: ein Wort + Urteil', 'Chart 1J mit Zonen, Zeitleiste, Ebenen-Chips', 'Der Chart in drei Sätzen: Trend, Schwung, Letzter Tag', 'Widerstand / Unterstützung', 'Befunde heute (3 von 6)', 'Kapitel: Alle Befunde, Verlauf 12 Monate, Chart Studio (PRO)', 'Befund-Sheet: Satz, Erkannt, Ungültig laut Regel, Forschung, Verlauf'], komponenten: ['C06 Chart mit Zonen', 'Story-Karte, Kapitel (aus Discover)', 'Befund-Zeile, Zeitleiste'], daten: ['technical/data/stock/{T} wie heute'], weg: ['Block „Diese Aktie in Quant und Supertrader“ (Perspektiven-Leiste)', 'Reiter Chart · Signale · Studio → Kapitel', 'Bullisch/Bärisch, SMA im Fließtext'] } });
slide({ id: 'TX03', title: 'Chart Studio bleibt für Profis', route: '/technical/#/chart/NVDA/studio', now: 'C06',
  sub: 'Das Studio ist gut und bleibt (PRO): Kerzen, Durchschnitte, RSI, MACD. Neu ist nur, was darunter steht: Befunde wie auf der Chart-Seite statt „Aktive Signale“, kein Quant-/Supertrader-Block. Erreichbar als Kapitel der Chart-Seite.',
  neu: [], spec: { aufbau: ['Studio unverändert', 'Darunter: Befunde heute, Zonen, Link zurück'], komponenten: ['wie heute'], daten: ['wie heute'], weg: ['„Aktive Signale“ → Befunde', 'Quant-/Supertrader-Block'] } });

chapter({ n: '02', title: 'Muster, Lernen, Screener', icon: 'i-shapes', anchor: 'kap-muster', was: 'Muster als Bilder. Akademie und Assistent werden <b>Lernen</b>. Der Screener zieht in den <b>einen Screener</b>.', pages: 'TX04–TX06' });
slide({ id: 'TX04', title: 'Muster', route: '/technical/#/muster', now: 'C07',
  sub: 'Heute schon klar: Muster mit Zahl und Richtung, „Hilft das Muster wirklich?“ mit Forschungs-Etikett. Neu: jedes Muster mit Bild im Raster, Forschung als ruhige Liste mit Urteil, Erklärung im „?“.',
  neu: [['c-muster', 'Muster']],
  spec: { aufbau: ['Reiter Muster · Indikatoren · Regeln', 'Raster: Bild, Name, Zahl, Richtung', 'Hilft das Muster? Liste mit Urteil (Belegt · Kein Vorteil · Gegen die Lesart)', '„?“ zu „lagen vorn“'], komponenten: ['Musterbild', 'C08 Urteil'], daten: ['technical/data/formation-evidence.json wie heute'], weg: ['Große schwarze Karte für ein einzelnes Muster'] } });
slide({ id: 'TX05', title: 'Lernen', route: '/technical/#/akademie und #/assistent', newRoute: '/technical/#/lernen', now: 'C08',
  sub: 'Heute: Akademie im alten Design (Linklisten, doppelte Zurück-Links), Assistent mit „Sie“ und eigener Reiterleiste. Neu: ein Ort „Lernen“ mit „Weiter mit“-Karte, acht Lernpfaden als Raster mit Fortschritt und „Eine Frage an den Chart“ (der heutige Assistent) als Chips, die den Screener öffnen.',
  neu: [['c-lernen', 'Lernen']],
  spec: { aufbau: ['Kopf, ein Satz', 'Weiter mit (Lektion, Dauer, Fortschritt)', 'Lernpfade 2 × 4 mit Punkten je Lektion', 'Eine Frage an den Chart → Screener'], komponenten: ['Lernpfad-Kachel', 'Fortschritt'], daten: ['technical/academy/content.json, technical/engine/assistant.js wie heute'], weg: ['Eigenes Akademie-Design', 'Sie-Form', 'Reiterleiste des Assistenten'] } });
slide({ id: 'TX06', title: 'Screener: Perspektive „Chart“', route: '/technical/#/screener', newRoute: '/screener/ (Perspektive Chart)', now: 'C02',
  sub: 'Entschieden mit dem Konzept Fundamental + Screener: ein Screener. Die starke Suche in Worten und die 13 Vorlagen von Technical ziehen in die Perspektive „Chart“ des gemeinsamen Screeners. Die alten Adressen leiten weiter, sobald alles abgedeckt ist.',
  neu: [['c-screener', 'Perspektive Chart']],
  spec: { aufbau: ['Perspektiven-Chips, Chart aktiv', 'Suche in Worten mit erkannten Regeln als Chips', 'Fertige Suchen · Chart', 'Hauptknopf mit Trefferzahl'], komponenten: ['Satz-Baustein (aus Fundamental + Screener)'], daten: ['technical/data/screener-v1.json (fließt schon ins Screener-Universum)'], weg: ['Eigener Technical-Screener (Suchen · Vorlagen · Gespeichert)'] } });

chapter({ n: '03', title: 'Umsetzung', icon: 'layers', anchor: 'umsetzung', was: 'Oberfläche und Wörter. <b>Keine Erkennungsregel ändert sich.</b>', pages: 'U1' });
slide({ t: 'html', id: 'U1', title: 'Fahrplan und Entscheidungen', html: () => `<div class="plan" style="grid-template-columns:repeat(4,minmax(0,1fr))">${[
  ['PR 1', 'Wörter', 'Befund statt Signal, Richtung in Worten, 200-Tage-Linie statt SMA im Fließtext, du statt Sie (Folie K1).'],
  ['PR 2', 'Start und Chart', 'Folien TX01–TX03: Start, Chart-Seite mit drei Sätzen und Befunden, Befund-Sheet, Studio aufgeräumt, Quant-/Supertrader-Block entfernt.'],
  ['PR 3', 'Muster und Lernen', 'Folien TX04–TX05: Musterbilder, Lernen als ein Ort.'],
  ['PR 4', 'Screener', 'Folie TX06 gemeinsam mit dem Plan Fundamental + Screener; Weiterleitung erst bei voller Abdeckung.']].map(([a, b, c]) => `<div><span class="tag neu">${a}</span><b>${b}</b><p>${c}</p></div>`).join('')}</div>
<h3 style="margin-top:36px;font-size:22px;letter-spacing:-.02em">Von dir zu entscheiden</h3>
<ol class="dec">${[
  ['„Befund“ als ein Wort für alles, was die Regeln finden?', 'Empfehlung: ja; „Signal“ verschwindet aus der Oberfläche.'],
  ['Akademie und Assistent zu „Lernen“ zusammenlegen?', 'Empfehlung: ja, eine Adresse #/lernen, alte Adressen leiten weiter.'],
  ['Eine Zahl für „Markt heute“ und für die Größe des Universums in allen Welten?', 'Empfehlung: ja, aus einer gemeinsamen Quelle; bis dahin mit Stand und Basis beschriftet. Eigener kleiner Querschnitts-PR, keine Modelländerung.'],
  ['„Hilft das Muster?“ mit Prozenten weiter zeigen?', 'Empfehlung: ja, wie heute mit Etikett „Forschung, nicht zertifiziert“; keine neuen Aussagen über Kursverläufe.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });
})();
