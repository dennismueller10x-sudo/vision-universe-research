/* Konzept Mein Bereich (Willkommen + Mein Dashboard), Portfolios, AI-Atlas, Stand 09.11.2026.
   Bausteine aus ../redesign-2027/lib.js (Kopie in lib/). Kurse und Reihen echt (data-mb.js, Stand 06.11.2026);
   Ereignisse je Aktie aus den heutigen Seiten der Welten (NVIDIA, Micron), Depotwerte wie am 09.11.2026 auf /portfolios/ abgelesen,
   Free Cashflow NVIDIA aus discover/data/stocks/US_REAL/NVDA.json (SEC). */
(function () {
'use strict';
const { screen, slide, chapter, ic, hud, chart, help, vd, bars } = VU;
const SER = MBD.series, CD = MBD.cards;
const ASOF = 'Fr. 06.11.';
const src = p => (window.__IMG && window.__IMG[p]) || p;
const de = (v, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const logo = (t, s = 36) => `<span class="lgx" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .28)}px"><b style="font-size:${Math.max(8.5, s * .25)}px">${t}</b><img src="${src('img/logos/' + t + '.png')}" alt="" onerror="this.remove()"></span>`;
const pillv = (txt, up) => `<span class="chg ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${String(txt).replace(/^[+−-]/, '')}</span>`;
const pct = v => (v >= 0 ? '+' : '−') + de(Math.abs(v), 2) + ' %';
const railHead = (t, cnt, s, tag) => `<div class="rh"><div class="rh-t"><b>${t}</b>${tag ? `<span class="rh-tag">${tag}</span>` : ''}<a>${cnt ? 'Alle ' + cnt : 'Alle'} ${ic('i-next', 13)}</a></div>${s ? `<p>${s}</p>` : ''}</div>`;
const ep = (c, i) => `<div class="ep"><b class="ep-n">${i + 1}</b><span class="hud" style="width:40px;height:40px;border-radius:12px">${ic(c[2], 19)}</span><div class="ep-t"><b>${c[0]}</b><span>${c[1]}</span></div><span class="ep-c">${ic('i-next', 15)}</span></div>`;
const story = (title, rows) => `<div class="story"><div class="ltag" style="color:#9b9b9b">${title}</div>${rows.map(([i, l, t, v]) => `<div class="story-r"><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><div><span class="ltag" style="color:#9b9b9b">${l}</span><p>${t}</p></div>${v}</div>`).join('')}</div>`;

/* ======================================================================
   MEIN BEREICH
   ====================================================================== */
const WL = ['NVDA', 'AAPL', 'MSFT', 'MU'];
const wlStrip = () => `<div class="wl">${WL.map(t => `<div>${logo(t, 26)}<b>${t}</b><div class="num">${de(CD[t].price)} $</div>${pillv(pct(CD[t].d), CD[t].d >= 0)}<div style="margin-top:6px">${SER[t] ? chart(SER[t], { w: 90, h: 24, grid: false, base: false }) : ''}</div></div>`).join('')}</div>`;
const FEED = [
  ['NVDA', 'NVIDIA', `${de(CD.NVDA.price)} $ · ${pct(CD.NVDA.d)}`, [
    ['technical', 'Technical', 'Neuer Befund: Kurslücke nach unten (05.11.)', vd('w', 'nach unten')],
    ['quant', 'Quant', 'Kurs läuft verliert an Tempo (−19 % im Monat)', vd('w', 'schlechter')],
    ['supertrader', 'Supertrader', 'Morales & Kacher · Buyable Gap-Up: Regel erfüllt', vd('s', 'erkannt')],
    ['discover', 'Discover', 'Platz 2 in Langfristige Compounder', vd('m', 'Reihe')]]],
  ['MU', 'Micron', `${de(CD.MU.price)} $ · ${pct(CD.MU.d)}`, [
    ['hedgefonds', 'Hedgefonds', 'Unter den größten Käufen der Stars im Q2 (8 Fonds, 5 neu)', vd('s', 'gekauft')],
    ['discover', 'Discover', 'Platz 25 in Umsatz wächst stark', vd('m', 'Reihe')]]]];
const feedCard = ([t, n, s, rows]) => `<div class="fd"><div class="fd-h">${logo(t, 34)}<div style="flex:1"><b>${n}</b><span>${s}</span></div>${ic('i-next', 15)}</div>${rows.map(([w, l, txt, v]) => `<div class="fd-r"><span class="hud">${ic(w, 15)}</span><span><b class="xs" style="display:block;color:var(--a-mute)">${l}</b>${txt}</span>${v}</div>`).join('')}</div>`;
screen('m-home', { world: 'mein', dock: 0, h: 1480, body: `<div class="ltag">Montag, 9. November</div><div class="lt" style="margin-top:4px">Guten Tag,<br>Dennis</div>
<div class="today" style="margin-top:14px"><div class="ltag" style="color:#9b9b9b">Heute bei deinen Aktien · Schluss ${ASOF}</div><div class="tg">${[['5', 'auf der Watchlist'], ['6', 'neue Ereignisse'], ['2', 'Aktien betroffen']].map(([a, b]) => `<div><b class="num">${a}</b><span>${b}</span></div>`).join('')}</div></div>
${railHead('Watchlist', 5, '')}
${wlStrip()}
${railHead('Was sich getan hat', 6, 'Aus allen Welten, nur für deine Aktien.')}
<div class="feed">${FEED.map(feedCard).join('')}</div>
<div style="margin-top:8px">${help('Ereignisse aus den veröffentlichten Daten der Welten, ohne neue Speicherung. Keine Empfehlung.')}</div>
${railHead('Weiter lernen', 6, '2 von 8 Videos gesehen.')}
<div class="card" style="padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('i-play', 18)}</span><div style="flex:1"><b style="display:block">7 Eigenschaften in 30 Sekunden</b><span class="sm mu">Quant · 0:32</span></div>${ic('i-next', 18)}</div>
${railHead('Deine Welten', '', '')}
<div class="pgrid">${[['discover', 'Discover'], ['quant', 'Quant'], ['fundamental', 'Fundamental'], ['technical', 'Technical'], ['screener', 'Screener'], ['supertrader', 'Supertrader']].map(([i, l]) => `<div><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><b>${l}</b></div>`).join('')}</div>
<p class="xs mu" style="margin-top:14px">Keine Anlageberatung. Kurse: veröffentlichter Schluss ${ASOF}</p>` });

/* ======================================================================
   WILLKOMMEN (Version 2: Trailer und Videos oben, Produktbereiche darunter)
   ====================================================================== */
const ST = MBD.stories;
const trailer = ST.find(x => x.id === 'start');
const clips = ST.filter(x => x.id !== 'start');
const SEEN = { discover: 1, quant: 1 };
const storyCard = x => `<div class="sv${SEEN[x.id] ? ' seen' : ''}"><img src="${src(x.thumb)}" alt=""><div class="sv-g"></div><span class="sv-t">0:${String(x.dur).padStart(2, '0')}</span>${SEEN[x.id] ? '' : '<span class="sv-new">NEU</span>'}<div class="sv-b"><span class="sv-ic">${ic(x.id === 'atlas' ? 'i-spark' : x.id, 14)}</span><b>${x.title}</b><span>${x.product}</span></div><i class="sv-p" style="width:${SEEN[x.id] ? 100 : 0}%"></i></div>`;
const WORLDS = [
  ['discover', 'Discover', 'Aktien entdecken', '23 Reihen, 54 Themen'],
  ['quant', 'Quant', 'Ein Profil je Aktie', '36 neu in einem Anlagestil'],
  ['fundamental', 'Fundamental', 'Zahlen aus SEC-Berichten', '12 Jahre je Firma'],
  ['technical', 'Technical', 'Was zeigt der Chart?', '34 % über der 200-Tage-Linie'],
  ['screener', 'Screener', 'Aktien in einem Satz finden', '5.354 Aktien, 120 Kriterien'],
  ['supertrader', 'Supertrader', 'Methoden der Profis', '34 Pläne fertig'],
  ['hedgefonds', 'Hedgefonds', 'Was große Fonds melden', 'Nächste Meldungen 14.11.'],
  ['elliott', 'Elliott', 'Wellen, wo sie zählbar sind', '41 Aktien zählbar'],
  ['vorsorge', 'Vorsorge', 'Sparplan und Rente', 'ab 10 € im Monat']];
const worldTile = ([i, n, c, live]) => `<div class="wt"><span class="wt-ic">${ic(i, 20)}</span><b>${n}</b><span>${c}</span><em>${live}</em></div>`;
screen('w-home', { world: 'mein', dock: 0, h: 1840, nopad: 1, body: `<div style="padding:0 18px"><div class="ltag">Montag, 9. November</div><div class="mt" style="margin-top:2px;font-size:26px">Guten Tag, Dennis</div></div>
<div class="tr"><img src="${src(trailer.thumb)}" alt=""><div class="tr-g"></div><span class="tr-tag">Trailer</span><span class="tr-snd">${ic('i-mic', 14)} Ton</span><span class="tr-play">${ic('i-play', 30)}</span><div class="tr-b"><b>Vision Universe in 30 Sekunden</b><span>${trailer.tagline} · 0:${trailer.dur}</span><div class="tr-bar"><i style="width:0%"></i></div></div></div>
<div style="padding:0 18px">
<div class="rh"><div class="rh-t"><b>Kurz erklärt in 30 Sekunden</b><a>${clips.length - 2} neu</a></div><p>Ein Video je Welt. Gesehene sind abgehakt.</p></div>
<div class="rail" style="gap:8px">${clips.map(storyCard).join('')}</div>
<a class="mdl"><span class="hud" style="width:40px;height:40px">${ic('i-person', 20)}</span><div><b>Mein Dashboard</b><span>Heute bei deinen Aktien: 6 neue Ereignisse</span></div>${ic('i-next', 18)}</a>
<div class="rh"><div class="rh-t"><b>Deine Welten</b><a>Menü</a></div><p>Tippe eine Welt an. Die Zahl zeigt, was dort heute los ist.</p></div>
<div class="wg">${WORLDS.map(worldTile).join('')}<div class="wt" style="background:#000;color:#fff"><span class="wt-ic" style="background:var(--lime);color:#000">${ic('i-spark', 20)}</span><b>AI Atlas</b><span style="color:#a6a6a6">Frag in deinen Worten</span><em style="color:#fff">rechnet mit allen Welten</em></div></div>
<div class="rh"><div class="rh-t"><b>Neu bei Vision Universe</b><a>Alle</a></div></div>
<div class="card" style="padding:14px;display:flex;gap:12px;align-items:center"><div style="flex:1"><span class="ltag">26. Oktober 2026</span><b style="display:block;margin-top:2px">Willkommen in deinem Vision Universe</b><span class="sm mu">Oben erklären dir kurze Videos jedes Modul.</span></div>${ic('i-next', 16)}</div>
<p class="xs mu" style="margin-top:14px">Keine Anlageberatung. Zahlen der Welten: Stand Fr. 06.11.</p></div>` });

const dc = clips.find(x => x.id === 'discover');
screen('w-story', { world: 'mein', dock: false, hdr: false, nopad: 1, body: `<div class="spl"><img src="${src(dc.thumb.replace('-thumb', '-thumb'))}" alt=""><div class="spl-g"></div><div class="spl-bars"><i class="on"></i><i></i></div><div class="spl-h"><span class="sv-ic" style="width:30px;height:30px">${ic('discover', 16)}</span><div><b>Discover</b><span>Entdecken · 0:${dc.dur}</span></div><span class="hb" style="background:rgb(255 255 255/.15);color:#fff;margin-left:auto">${ic('i-x', 16)}</span></div><div class="spl-b"><b>${dc.tagline}</b><span>Danach: „Jetzt ausprobieren“</span><div class="btn" style="margin-top:12px;height:50px">Discover öffnen</div><div class="spl-nav"><span>‹ Trailer</span><span>Quant ›</span></div></div></div>` });

/* ======================================================================
   PORTFOLIOS (Version 2: Methode sichtbar machen)
   ====================================================================== */
/* Phasen nach Stan Weinstein als Bild: Basis, Aufwärts, Top, Abwärts */
const phases = (on = 1, w = 330, dark = 1) => { const pts = [[0, 70], [40, 66], [70, 72], [100, 64], [120, 58], [160, 38], [190, 26], [215, 18], [240, 22], [260, 16], [285, 30], [310, 50], [330, 66]]; const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' '); const zones = [[0, 110, 'Basis', 1], [110, 205, 'Aufwärts', 2], [205, 265, 'Top', 3], [265, 330, 'Abwärts', 4]]; return `<svg width="${w}" height="104" viewBox="0 0 330 104" aria-hidden="true" style="display:block">${zones.map(([a, b, l, n]) => `<rect x="${a}" y="0" width="${b - a}" height="84" rx="8" fill="${n === on + 1 ? '#c8f531' : dark ? '#1a1a1a' : '#f0f0f0'}" opacity="${n === on + 1 ? .25 : 1}"/><text x="${(a + b) / 2}" y="100" text-anchor="middle" font-size="11" font-weight="800" fill="${n === on + 1 ? '#c8f531' : '#8c8c8c'}" font-family="Inter,sans-serif">${n} · ${l}</text>`).join('')}<path d="${d}" fill="none" stroke="${dark ? '#fff' : '#000'}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`; };
const W = [['VREX', 'Varex Imaging', 17.7, '2026-11-03', 18.56, 18.04], ['TMP', 'Tompkins Financial', 5.5, '2026-10-23', 102.69, 93.82], ['MEDP', 'Medpace', 4.8, '2026-10-21', 643.29, 575.77], ['ASH', 'Ashland', 3.6, '2026-11-06', 78.33, 67.68], ['KIDS', 'OrthoPediatrics', 3.0, '2026-10-28', 26.42, 21.22], ['NUE', 'Nucor', 2.9, '2026-11-02', 277.88, 235.58]];
const posChart = (t, day, auf, inv) => { const pts = MBD.daily[t] || []; if (!pts.length) return ''; const v = pts.map(p => p[1]).concat([auf, inv]); const mn = Math.min(...v) * .99, mx = Math.max(...v) * 1.01, w = 92, h = 40; const X = i => i * w / (pts.length - 1), Y = x => h - (x - mn) / (mx - mn) * h; const k = Math.max(0, pts.findIndex(p => p[0] >= day)); const d = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' '); return `<svg width="${w}" height="${h}" aria-hidden="true" style="display:block;overflow:visible"><rect x="${X(k).toFixed(1)}" y="0" width="${(w - X(k)).toFixed(1)}" height="${h}" fill="#c8f531" opacity=".22"/><line x1="0" x2="${w}" y1="${Y(inv).toFixed(1)}" y2="${Y(inv).toFixed(1)}" stroke="var(--a-mute)" stroke-dasharray="3 3"/><path d="${d}" fill="none" stroke="var(--a-ink)" stroke-width="1.8"/><circle cx="${X(k).toFixed(1)}" cy="${Y(pts[k][1]).toFixed(1)}" r="3.5" fill="#c8f531" stroke="var(--a-ink)" stroke-width="1.5"/></svg>`; };
const ch = (auf, close) => { const g = (close / auf - 1) * 100; return pillv(pct(g).replace(',00', ''), g >= 0); };
const lastClose = t => { const p = MBD.daily[t]; return p ? p[p.length - 1][1] : null; };
const sum = W.reduce((a, x) => a + x[2], 0) + 2.3 + 2.1 + 1.9 + 1.4;
screen('p-depot', { world: 'start', dock: false, h: 1640, nopad: 1, body: `<div class="rowhero" style="padding-top:20px"><div style="display:flex;align-items:center;gap:10px"><span class="hb" style="background:#1a1a1a;color:#fff">${ic('i-back', 18)}</span><span class="xs b" style="color:#9b9b9b">Supertrader-Musterdepot · Rechenmodell</span></div>
<div style="font-size:36px;font-weight:900;letter-spacing:-.05em;line-height:.98;margin-top:14px">Weinstein</div>
<p style="margin-top:6px;color:#bdbdbd;font-size:15px">Jede Aktie durchläuft vier Phasen. Das Musterdepot hält nur Aktien in <b style="color:var(--lime)">Phase 2</b>, dem Aufwärtstrend.</p>
<div style="margin-top:12px">${phases(1)}</div>
<div class="grid3" style="margin-top:12px;gap:6px">${[['10', 'Aktien'], ['12.10.', 'live seit'], ['06.11.', 'Stand']].map(([a, b]) => `<div class="mini dk"><small>${b}</small><b>${a}</b></div>`).join('')}</div></div>
<div style="padding:0 18px">
<div class="st">So ist das Depot heute verteilt<a>Gewicht im Modell</a></div>
<div class="alloc">${W.map(([t, n, w]) => `<i style="flex:${w}" title="${t}"><span>${w >= 8 ? t : ''}</span></i>`).join('')}<i style="flex:${(2.3 + 2.1 + 1.9 + 1.4).toFixed(1)}" class="rest"><span>+4</span></i><i style="flex:${(100 - sum).toFixed(1)}" class="cash"><span>Bargeld</span></i></div>
<p class="xs mu b" style="margin-top:6px">${de(sum, 1)} % in 10 Aktien · ${de(100 - sum, 1)} % Bargeld laut Regel</p>
<div class="st">Seit Aufnahme<a>Alle 10</a></div>
<div class="card" style="padding:2px 14px">${W.map(([t, n, w, day, auf, inv]) => `<div class="pz">${logo(t, 32)}<div style="min-width:0"><b>${n}</b><span>aufgenommen ${day.slice(8, 10)}.${day.slice(5, 7)}. · ${de(w, 1)} %</span></div>${posChart(t, day, auf, inv)}${ch(auf, lastClose(t))}</div>`).join('')}</div>
<p class="xs mu" style="margin-top:6px">Neongrüne Fläche: seit Aufnahme. Gestrichelt: Ungültig-Marke laut Methode.</p>
<div class="st">Zuletzt im Protokoll<a>Alles</a></div>
<div class="tl">${[['06.11.', 'Ashland aufgenommen', '78,33 $'], ['05.11.', 'Progyny und Acadia Healthcare aufgenommen', '33,20 $ · 37,22 $'], ['03.11.', 'Varex Imaging aufgenommen', '18,56 $'], ['02.11.', 'Nucor aufgenommen', '277,88 $']].map(([d, a, b]) => `<div class="tl-r"><i></i><div><b>${d} · ${a}</b><span>${b}</span></div></div>`).join('')}</div>
<div class="eps ep2" style="margin-top:10px">${[['Die Regeln der Methode', 'Phase 2 erkennen, aufnehmen, abgeben', 'i-book'], ['Zur Methode in Supertrader', 'Weinstein · Investor / Trader', 'supertrader']].map(ep).join('')}</div></div>` });

screen('p-home', { world: 'start', dock: false, h: 1080, body: `<div class="ltag">Portfolios</div><div class="lt" style="margin-top:4px">Was die Regeln<br>gerade halten</div><p class="mu" style="margin-top:8px;font-size:15px">14 Musterdepots. Jedes nimmt Aktien streng nach seiner Methode auf und gibt sie ab, ohne echtes Geld.</p>
<div class="chips" style="margin-top:12px">${['Alle 14', 'Supertrader 7', 'Quant 5', 'KI 2'].map((x, i) => `<span class="chip${i ? '' : ' on'}" style="height:32px;font-size:12.5px">${x}</span>`).join('')}</div>
<div class="today" style="margin-top:12px"><div class="ltag" style="color:#9b9b9b">Musterdepots · Stand 06.11.</div><div class="tg">${[['7', 'Supertrader'], ['5', 'Quant'], ['2', 'KI']].map(([a, b]) => `<div><b class="num">${a}</b><span>${b}</span></div>`).join('')}</div><p class="xs" style="color:#9b9b9b;margin-top:8px">Wertentwicklung seit Start: erscheint, sobald belastbar.</p></div>
<div class="st">Supertrader<a>Alle 7</a></div>
<div class="dpc"><div class="dpc-h"><div><span class="ltag">Weinstein Stages</span><b>Weinstein</b><span class="xs mu">Hält nur Aktien im Aufwärtstrend (Phase 2).</span></div>${ic('i-next', 16)}</div><div style="margin-top:8px">${phases(1, 300, 0)}</div><div style="display:flex;align-items:center;gap:4px;margin-top:8px">${['VREX', 'TMP', 'MEDP', 'ASH', 'KIDS'].map(t => logo(t, 24)).join('')}<span class="xs b" style="margin-left:6px">10 Aktien</span><span class="rh-tag" style="margin-left:auto">3 neu</span></div></div>
<div class="dpc" style="margin-top:8px"><div class="dpc-h"><div><span class="ltag">Darvas Boxes</span><b>Darvas · Box</b><span class="xs mu">Aufnahme beim Ausbruch aus der Kiste.</span></div>${ic('i-next', 16)}</div><div style="display:flex;align-items:center;gap:6px;margin-top:8px"><span class="xs b">5 Aktien</span><span class="xs mu b">Stand 06.11.</span></div></div>
<div class="st">Quant<a>Alle 5</a></div>
<div class="dpc"><div class="dpc-h"><div><span class="ltag">Quality Compounder</span><b>Verlässlich und wächst lange</b><span class="xs mu">Hohe Qualität, gute Rendite auf das Kapital.</span></div>${ic('i-next', 16)}</div><div style="display:flex;align-items:center;gap:6px;margin-top:8px"><span class="xs b">25 Aktien</span>${pillv('−0,3 %', 0)}<span class="xs mu b">seit 05.11.</span></div></div>
<p class="xs mu" style="margin-top:14px">Musterdepot ohne echtes Geld. Keine Anlageberatung.</p>` });

/* ======================================================================
   AI-ATLAS (Version 2)
   ====================================================================== */
const AT = MBD.atlas;
const mrd = v => v >= 1e9 ? de(v / 1e9, 2) + ' Mrd. $' : de(v / 1e6, 0) + ' Mio. $';
screen('a-home', { world: 'start', dock: false, h: 1000, nopad: 1, body: `<div class="ah"><div style="display:flex;align-items:center;gap:8px"><span class="sv-ic" style="width:30px;height:30px;background:var(--lime);color:#000">${ic('i-spark', 16)}</span><span class="ltag" style="color:#9b9b9b">AI Atlas · Beta</span></div><div style="font-size:34px;font-weight:900;letter-spacing:-.045em;line-height:1;margin-top:12px">Frag Vision Universe.</div><p style="color:#bdbdbd;margin-top:8px;font-size:15px">In deinen Worten. Atlas übersetzt in Regeln, Vision Universe rechnet. Jede Zahl mit Quelle.</p>
<div class="ask dk"><p>z. B. „Kleine Firmen, günstig, ohne Schulden“</p><div class="ask-f"><span>Tippen oder sprechen</span><span class="hb" style="background:#1d1d1d;color:#fff">${ic('i-mic', 17)}</span><span class="hb" style="background:var(--lime);color:#000">${ic('i-next', 17)}</span></div></div>
<p class="xs" style="color:#9b9b9b;margin-top:8px">Neue Fragen noch gesperrt · Antworten aus dem Archiv kostenlos</p></div>
<div style="padding:0 18px">
<div class="st">Was Atlas kann</div>
<div class="cang">${[['screener', 'Finden', 'Kleine Firmen, günstig, ohne Schulden', 'öffnet den Screener'], ['quant', 'Vergleichen', 'NVIDIA gegen AMD und Broadcom', 'Profile und Zahlen'], ['fundamental', 'Erklären', 'Wie stark ist der Free Cashflow bei NVIDIA gewachsen?', 'mit Chart und Quelle']].map(([i, a, b, c]) => `<div><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><b>${a}</b><p>„${b}“</p><span>${c}</span></div>`).join('')}</div>
<div class="st">Oft gefragt<a>Archiv · kostenlos</a></div>
<div class="card" style="padding:2px 14px">${['Welche Aktien stehen auf einem neuen Jahreshoch?', 'Wer hält NVIDIA unter den großen Fonds?', 'Was heißt KGV?'].map(x => `<div class="kv"><span class="sm b">${x}</span>${ic('i-next', 14)}</div>`).join('')}</div>
<div style="margin-top:10px">${help('Atlas rechnet nicht selbst und gibt keine Anlageberatung. Grenzen und Datenschutz: Tipp auf „?“.')}</div></div>` });

screen('a-screen', { world: 'start', dock: false, h: 960, body: `<div style="display:flex;align-items:center;gap:10px"><span class="hb">${ic('i-back', 18)}</span><span class="ltag" style="flex:1">AI Atlas</span>${vd('o', 'Beispiel')}</div>
<div class="bub" style="margin-top:14px">Kleine Firmen, günstig bewertet, ohne Schulden</div>
<div class="ans"><span class="ltag">So hat Atlas übersetzt</span><div class="rcs"><span class="rc">${ic('i-globe', 13)}Börsenwert <b>0,3–2 Mrd. $</b></span><span class="rc">${ic('i-target', 13)}KGV <b>bis 15</b></span><span class="rc">${ic('i-check', 13)}<b>mehr Kasse als Schulden</b></span></div>
<div style="display:flex;align-items:baseline;gap:8px;margin-top:12px"><b class="num" style="font-size:34px;letter-spacing:-.05em">${AT.n}</b><span class="sm mu b">von ${AT.universe.toLocaleString('de-DE')} US-Aktien erfüllen alle drei</span></div></div>
<div class="card" style="margin-top:10px;padding:2px 14px">${AT.rows.slice(0, 5).map(r => `<div class="pos">${logo(r.t, 32)}<div style="min-width:0"><b>${r.n.replace(/,? Inc\.?$| Ltd$/, '')}</b><span>${mrd(r.mcap)} Börsenwert · Kasse netto ${mrd(r.cash)}</span></div><span class="sp" style="min-width:52px"><small>KGV</small><b class="num" style="font-size:16px">${de(r.pe, 1)}</b></span></div>`).join('')}</div>
<div class="grid2" style="margin-top:10px"><span class="btn ink" style="height:46px;font-size:14px">Alle ${AT.n} im Screener</span><span class="btn line" style="height:46px;font-size:14px">Regel ändern</span></div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><span class="src">${ic('screener', 12)} Screener-Daten, Stand 06.11.2026</span><span class="src">Gewinne und Schulden: SEC</span></div>
<div style="margin-top:10px">${help('Eine Liste nach Regeln, keine Empfehlung. Ein niedriges KGV kann auch einmalige Gewinne spiegeln.')}</div>` });

const FCF = [['2023', 3.808], ['2024', 27.021], ['2025', 60.853], ['2026', 96.676]];
screen('a-answer', { world: 'start', dock: false, body: `<div style="display:flex;align-items:center;gap:10px"><span class="hb">${ic('i-back', 18)}</span><span class="ltag" style="flex:1">AI Atlas</span>${vd('o', 'aus dem Archiv')}</div>
<div class="bub" style="margin-top:14px">Wie stark ist der Free Cashflow bei NVIDIA gewachsen?</div>
<div class="ans"><span class="ltag">Antwort</span><p class="sm" style="margin-top:4px">Der Free Cashflow von NVIDIA stieg von</p><div class="big num">3,8 → 96,7 Mrd. $</div><p class="sm mu b">Geschäftsjahr 2023 bis 2026 · zuletzt +58,9 % zum Vorjahr</p>
<div style="margin-top:10px">${bars(FCF, { w: 320, h: 100 })}</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><span class="src">${ic('fundamental', 12)} SEC-Berichte, Stand 03.11.2026</span><span class="src">Free Cashflow = operativer Cashflow − Investitionen</span></div></div>
<div class="card" style="margin-top:10px;padding:12px 14px"><span class="ltag">So hat Atlas gerechnet</span><div class="rcs"><span class="rc">Firma: NVIDIA</span><span class="rc">Kennzahl: Free Cashflow</span><span class="rc">Zeitraum: GJ 2023–2026</span></div></div>
<div class="st">Weiter fragen</div>
<div class="chips" style="flex-wrap:wrap;white-space:normal;gap:6px">${['Und im Vergleich zu AMD?', 'Wie hoch ist die Marge?', 'Zahlen-Seite öffnen'].map(x => `<span class="chip" style="height:32px;font-size:12.5px">${x}</span>`).join('')}</div>
<div style="margin-top:10px">${help('Antwort aus festen Daten. Keine Vorhersage, keine Anlageberatung.')}</div>` });

screen('a-sheet', { world: 'discover', dock: 0, hdr: false, body: VU.STOCK('Überblick', { s: { t: 'NVDA', name: 'NVIDIA', what: 'Chips für KI und Grafik', p: 186.64, d: 2.7753, eur: '167,17 €', date: ASOF } }).replace('<span class="lg">NVDA</span>', logo('NVDA', 42)),
  overlay: `<div class="ovl"></div><div class="sheet" style="top:360px"><div class="grab"></div><div style="display:flex;align-items:center;gap:10px">${ic('i-spark', 18)}<b style="flex:1">Atlas zu NVIDIA</b><span class="hb">${ic('i-x', 16)}</span></div>
<div class="ask" style="margin-top:10px"><p style="font-size:16px">Frag etwas zu NVIDIA …</p><div class="ask-f"><span>bezieht sich auf diese Aktie</span><span class="hb" style="background:var(--lime)">${ic('i-next', 17)}</span></div></div>
<div class="chips" style="flex-wrap:wrap;white-space:normal;gap:6px;margin-top:10px">${['Wie hat sich der Umsatz entwickelt?', 'Wer hält NVIDIA?', 'Was sagt der Chart?'].map(x => `<span class="chip" style="height:32px;font-size:12.5px">${x}</span>`).join('')}</div></div>` });

/* ======================================================================
   Folien
   ====================================================================== */
slide({ t: 'html', anchor: 'cover', dark: 1, html: () => `<div class="covergrid"><div><img src="${src('img/vision-universe-logo-web.png')}" alt="Vision Universe" style="height:20px;filter:invert(1);margin-bottom:36px"><div style="font-size:clamp(42px,6.4vw,92px);font-weight:900;letter-spacing:-.06em;line-height:.92">Mein Bereich.<br>Portfolios.<br><span style="color:var(--lime)">Atlas.</span></div><p style="margin-top:22px;color:#a6a6a6;font-size:clamp(16px,1.5vw,20px);font-weight:500;max-width:46ch">Version 2, nach deinem Feedback: Dashboard unverändert. Willkommensseite mit Trailer und Videos oben und den Welten darunter, nur optisch geschärft. Musterdepots, die ihre Methode zeigen. Ein Atlas, der zeigt, was er kann.</p><div class="toc" id="toc" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:28px"></div></div><div class="coverphones"><div data-frame="w-home"></div><div data-frame="m-home"></div></div></div>` });

slide({ t: 'html', id: 'K1', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 09.11.2026 auf 390 px. Mein Dashboard mit simulierter Anmeldung im Browser (Konten sind bis zur Freigabe aus); lokal fehlten die Watchlist-Kurse, daher „kein Kurs“ in der Aufnahme.', html: () => `<div class="facts">${[
  ['Willkommen: richtig gebaut', 'Trailer oben, Videos, dann die Welten: die Reihenfolge stimmt. Optisch: kleine Video-Kacheln ohne Stand (gesehen/neu), Welten als gleichförmige Kacheln ohne Bezug zu heute, ein grüner Block „Wähle deinen Einstieg“ zwischen Trailer und Videos.'],
  ['Dashboard: nur Watchlist', 'Mein Dashboard zeigt Kurse der Watchlist. Was in den Welten zu diesen Aktien passiert, fehlt, obwohl alles veröffentlicht ist.'],
  ['Portfolios: ohne Methode', 'Ein Depot ist eine lange Liste großer Karten (6.191 px) mit „Einstieg/Stopp laut Methode“. Was die Methode tut und wie das Depot verteilt ist, sieht man nicht. Alter Kopf mit ☰, Rot/Grün.'],
  ['Atlas: zeigt nicht, was er kann', '„Noch gesperrt“ und „Keine Verbindung“ untereinander, drei Hinweisblöcke, Beispiele mit Fachwort. Kein Gefühl dafür, welche Art Frage gut funktioniert.']].map(([a, b]) => `<div><b style="font-size:clamp(24px,2.8vw,38px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });

chapter({ n: '01', title: 'Willkommen und Dashboard', icon: 'i-person', anchor: 'kap-mein', was: 'Willkommen bleibt der Start mit <b>Trailer, Videos und Welten</b>, schärfer gestaltet. Das Dashboard zeigt, was sich bei deinen Aktien tut.', pages: 'MX01–MX03' });
slide({ id: 'MX01', title: 'Willkommensseite, geschärft', route: '/willkommen/', now: 'W02',
  sub: 'Gleiche Reihenfolge wie heute, bewusst so gewählt: Trailer, Videos, Welten. Neu ist die Gestaltung: Trailer groß und randlos mit Ton-Hinweis, Videos als hohe Karten mit Welt-Symbol, „neu“ und Fortschritt, ein Einstieg ins Dashboard, die Welten als Kacheln mit einer Zahl von heute, Atlas als breite Kachel.',
  neu: [['w-home', 'Willkommensseite'], ['w-story', 'Ein Video geöffnet']],
  spec: { aufbau: ['Begrüßung', 'Trailer randlos (Bild, Abspielen, Ton, Dauer, Fortschritt)', 'Kurz erklärt in 30 Sekunden: hohe Karten mit Bild, Symbol, Dauer, „neu“, gesehen-Balken', 'Mein Dashboard: eine Zeile mit „6 neue Ereignisse“', 'Deine Welten: 9 Kacheln mit Name, Satz und Zahl von heute; Atlas breit', 'Neu bei Vision Universe'], komponenten: ['Neu: Trailer-Karte, Video-Karte (9:16), Welt-Kachel mit Zahl', 'Story-Player (vorhanden) mit Fortschrittsleisten'], daten: ['willkommen/config/stories.json, assets/stories/* (Poster, Videos)', 'je Welt eine Zahl aus deren veröffentlichten Daten (wie auf den Konzept-Folien der Welten)', 'Gesehen/neu: auf dem Gerät'], weg: ['Grüner Block „Wähle deinen Einstieg“ zwischen Trailer und Videos → Teil des ersten Besuchs', 'Welten-Kacheln ohne Bezug zu heute'] } });
slide({ id: 'MX02', title: 'Mein Dashboard: heute bei deinen Aktien', route: '/mein-dashboard/', now: 'D01',
  sub: 'Wie in Version 1 (unverändert, hat überzeugt): oben die Zahl der Ereignisse, die Watchlist als Streifen, dann „Was sich getan hat“: je Aktie die Ereignisse aus Technical, Quant, Supertrader, Discover und Hedgefonds.',
  neu: [['m-home', 'Mein Dashboard']],
  spec: { aufbau: ['Begrüßung mit Datum', 'Heute bei deinen Aktien: 3 Zahlen', 'Watchlist-Streifen', 'Was sich getan hat: Karte je Aktie mit Ereignissen je Welt + Urteil', 'Weiter lernen, Deine Welten'], komponenten: ['Ereignis-Karte je Aktie', 'Watchlist-Streifen'], daten: ['/v1/watchlist (wie heute)', 'Ereignisse aus veröffentlichten Daten je Aktie, im Browser gelesen, nichts gespeichert'], weg: ['—'] } });

chapter({ n: '02', title: 'Portfolios', icon: 'i-pie', anchor: 'kap-portfolios', was: 'Ein Musterdepot zeigt <b>seine Methode als Bild</b>, seine Verteilung und jede Aktie seit Aufnahme.', pages: 'PX01–PX02' });
slide({ id: 'PX01', title: 'Ein Musterdepot: Weinstein', route: '/portfolios/#/supertrader/weinstein-stages', now: 'P05',
  sub: 'Neu: oben die Methode als Bild (vier Phasen, Phase 2 leuchtet), dann wie das Depot heute verteilt ist (Aktien und Bargeld laut Gewicht), je Aktie ein Mini-Chart mit Aufnahmepunkt, Fläche seit Aufnahme und Ungültig-Marke, dann das Protokoll. Echte Gewichte, Daten und Kurse.',
  neu: [['p-depot', 'Weinstein']],
  spec: { aufbau: ['Dunkler Kopf: Name, Satz, Phasen-Bild, drei Zahlen', 'Verteilung: Balken je Aktie + Bargeld', 'Seit Aufnahme: Logo, Name, Datum, Gewicht, Mini-Chart (30 Tage), Veränderung', 'Zuletzt im Protokoll', 'Kapitel'], komponenten: ['Neu: Methodenbild je Methode (Weinstein: Phasen; Darvas: Kisten; Turtle: Kanal; Quant: Profil)', 'Verteilungsbalken', 'Positionszeile mit Mini-Chart'], daten: ['Depot-Daten wie heute (Gewicht, Aufnahme, Ungültig-Marke)', 'quant/data/market/discover-series (Kurse)'], weg: ['Große Karte je Aktie mit vier Feldern', '„Einstieg/Stopp laut Methode“ → Aufnahme / Ungültig-Marke laut Methode', 'Rot/Grün, eigener Kopf'] } });
slide({ id: 'PX02', title: 'Alle Musterdepots', route: '/portfolios/', now: 'P01',
  sub: 'Neu: jede Depot-Karte zeigt ihr Methodenbild, die ersten Aktien als Logos und was neu ist. Der Hinweis zur Wertentwicklung steht einmal oben.',
  neu: [['p-home', 'Übersicht']],
  spec: { aufbau: ['Frage, Satz, Chips', 'Zahlen je Gruppe, ein Hinweis', 'Karten: Fachname, Name, Satz, Methodenbild, Logos, „N neu“'], komponenten: ['Depot-Karte mit Methodenbild'], daten: ['wie heute'], weg: ['Wiederholter Hinweis je Karte'] } });

chapter({ n: '03', title: 'AI-Atlas', icon: 'i-spark', anchor: 'kap-atlas', was: 'Atlas zeigt, <b>was er kann</b> (finden, vergleichen, erklären), und jede Antwort zeigt, <b>wie er übersetzt hat</b>.', pages: 'AX01–AX03' });
slide({ id: 'AX01', title: 'Atlas · Start', route: '/ask/', now: 'A01',
  sub: 'Neu: dunkler Kopf mit großer Eingabe und einem Status-Satz, darunter „Was Atlas kann“ in drei Karten mit je einer Beispielfrage, „Oft gefragt“ aus dem Archiv, die Grenzen in einem „?“.',
  neu: [['a-home', 'Start']],
  spec: { aufbau: ['Kopf dunkel: Titel, Satz, Eingabe, Status', 'Was Atlas kann: Finden · Vergleichen · Erklären', 'Oft gefragt (Archiv, kostenlos)', 'Ein „?“'], komponenten: ['Eingabe dunkel', 'Fähigkeits-Karte'], daten: ['Archiv wie heute'], weg: ['Zwei Zustände untereinander', 'Drei Hinweisblöcke', 'Fachwörter in Beispielen'] } });
slide({ id: 'AX02', title: 'Zwei Antworten', route: '/ask/ (Antwort)', now: 'A03',
  sub: 'Echte Zahlen. Finden: „Kleine Firmen, günstig, ohne Schulden“ → Atlas zeigt die drei Regeln, ' + MBD.atlas.n + ' Treffer und die ersten fünf, mit „Alle im Screener“. Erklären: Free Cashflow von NVIDIA mit Balken, Quelle und Rechenweg.',
  neu: [['a-screen', 'Finden'], ['a-answer', 'Erklären']],
  spec: { aufbau: ['Frage als Blase', 'So hat Atlas übersetzt (Regel-Chips)', 'Ergebnis: Zahl, Liste oder Chart', 'Weiter: im Screener öffnen, Regel ändern, weiter fragen', 'Quellen-Chips, Hinweis'], komponenten: ['Antwort-Karte, Regel-Chip, Quellen-Chip'], daten: ['Atlas-Übersetzung + Screener-Universum bzw. SEC-Daten'], weg: ['—'] } });
slide({ id: 'AX03', title: 'Atlas auf jeder Aktie', route: 'Aktienkopf → Atlas', now: null,
  sub: 'Der Atlas-Knopf oben öffnet auf einer Aktie ein Sheet „Atlas zu NVIDIA“ mit drei passenden Fragen.',
  neu: [['a-sheet', 'Sheet auf der Aktie']],
  spec: { aufbau: ['Sheet mit Eingabe und 3 Fragen zur Aktie'], komponenten: ['C16 Sheet'], daten: ['Aktie als Kontext der Frage'], weg: ['—'] } });

chapter({ n: '04', title: 'Umsetzung', icon: 'layers', anchor: 'umsetzung', was: 'Oberfläche. <b>Konten bleiben aus bis zur Freigabe, nichts Neues wird gespeichert.</b>', pages: 'U1' });
slide({ t: 'html', id: 'U1', title: 'Fahrplan und Entscheidungen', html: () => `<div class="plan" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[
  ['Willkommen + Dashboard · 2 PRs', 'Willkommen geschärft; Dashboard-Ereignisse', 'Trailer-Karte, Video-Karten mit gesehen/neu, Welt-Kacheln mit Zahl, Dashboard-Zeile; Modul „Was sich getan hat“.'],
  ['Portfolios · 2 PRs', 'Depot; Übersicht', 'Methodenbild je Methode, Verteilung, Mini-Charts seit Aufnahme, Protokoll; Karten mit Bild und Logos; Wortwahl, Farben, gemeinsame Navigation.'],
  ['Atlas · 2 PRs', 'Start und Antworten; Sheet', 'Fähigkeiten, Archiv, ein Status; Antworten mit Übersetzung, Ergebnis und Quelle; Sheet im Aktienkopf.']].map(([a, b, c]) => `<div><span class="tag neu">${a}</span><b>${b}</b><p>${c}</p></div>`).join('')}
<h3 style="margin-top:36px;font-size:22px;letter-spacing:-.02em">Von dir zu entscheiden</h3>
<ol class="dec">${[
  ['Welt-Kacheln mit einer Zahl von heute?', 'Empfehlung: ja, je Welt eine einfache Zahl aus ihren veröffentlichten Daten; fehlt sie, steht nur der Satz.'],
  ['Musterdepot mit Methodenbild und Verteilung inkl. Bargeld?', 'Empfehlung: ja, ein Bild je Methode (Weinstein-Phasen, Darvas-Kisten, Turtle-Kanal, Quant-Profil).'],
  ['Atlas: „Finden“-Antworten direkt mit „Alle im Screener“?', 'Empfehlung: ja, Atlas übergibt seine Regeln an den einen Screener.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });
})();
