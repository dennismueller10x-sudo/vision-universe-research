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

screen('m-first', { world: 'mein', dock: 0, body: `<div class="ltag">Willkommen</div><div class="lt" style="margin-top:4px">Schön, dass<br>du da bist</div><p class="mu" style="margin-top:8px;font-size:15px">Drei kurze Schritte, dann zeigt dir dein Bereich jeden Tag, was sich bei deinen Aktien tut.</p>
<div class="ob" style="margin-top:14px">${[['1', 'Einblick in 30 Sekunden', 'Video ansehen', 1], ['2', 'Wähle dein Ziel', 'Verstehen, Ideen finden oder Vorsorge', 0], ['3', 'Merke deine erste Aktie', 'Tippe auf ♡ bei einer Aktie', 0]].map(([n, a, b, done]) => `<div class="ob-r"><span class="ob-c${done ? ' done' : ''}">${done ? '✓' : n}</span><div><b>${a}</b><span>${b}</span></div>${ic('i-next', 16)}</div>`).join('')}<div class="prog" style="background:#2a2a2a;margin-top:10px"><i style="width:33%;background:var(--lime)"></i></div><span class="xs" style="color:#9b9b9b">1 von 3 erledigt</span></div>
<div class="st">Beliebt zum Merken<a>Suchen</a></div>
<div class="chips" style="flex-wrap:wrap;white-space:normal;gap:6px">${['NVDA', 'AAPL', 'MSFT', 'AMD', 'AVGO', 'MU'].map(t => `<span class="chip" style="gap:8px">${logo(t, 20)}${t} ${ic('i-heart', 14)}</span>`).join('')}</div>
<div style="margin-top:8px">${help('Feste Liste bekannter Namen, keine Empfehlung.')}</div>` });

/* ======================================================================
   PORTFOLIOS
   ====================================================================== */
const DEP = [['Supertrader', [['Weinstein', 'Weinstein Stages', 10, '06.11.'], ['Darvas · Box', 'Darvas Boxes', 5, '06.11.'], ['Turtle', 'Donchian Turtle', 4, '06.11.'], ['VU Hausstrategie', 'eigene Regeln', 20, '30.10.']]], ['Quant', [['Verlässlich und wächst lange', 'Quality Compounder', 25, '06.11.', '−0,3 %'], ['Wachstum zum fairen Preis', 'GARP', 25, '06.11.', '−1,4 %'], ['Solide mit ruhigem Kurs', 'Defensive Quality', 25, '06.11.', '+0,6 %']]]];
screen('p-home', { world: 'start', dock: false, h: 1320, body: `<div class="ltag">Portfolios · Musterdepots</div><div class="lt" style="margin-top:4px">Was die Regeln<br>gerade halten</div><p class="mu" style="margin-top:8px;font-size:15px">Jedes Musterdepot nimmt Aktien streng nach seiner Methode auf und gibt sie nach Regel ab. Rechenmodell, kein echtes Geld.</p>
<div class="chips" style="margin-top:12px">${['Alle 14', 'Supertrader 7', 'Quant 5', 'KI 2'].map((x, i) => `<span class="chip${i ? '' : ' on'}" style="height:32px;font-size:12.5px">${x}</span>`).join('')}</div>
<div class="card" style="margin-top:10px;padding:10px 14px;display:flex;gap:10px;align-items:center">${vd('o', 'Noch nicht veröffentlicht')}<span class="xs mu b" style="flex:1">Die Wertentwicklung seit Start zeigen die Depots, sobald sie belastbar ist.</span></div>
${DEP.map(([g, list]) => `<div class="st">${g}<a>Alle ${g === 'Quant' ? 5 : 7}</a></div><div class="stack">${list.map(([n, f, k, d, chg]) => `<div class="dp"><span class="ltag">${f}</span><b>${n}</b><div style="display:flex;align-items:center;gap:10px"><span class="xs b">${k} Aktien</span><span class="xs mu b">Stand ${d}</span>${chg ? `<span style="margin-left:auto;display:inline-flex;gap:6px;align-items:center">${pillv(chg, chg[0] === '+')}<small class="xs mu b">seit 05.11.</small></span>` : ''}</div></div>`).join('')}</div>`).join('')}
<p class="xs mu" style="margin-top:14px">Musterdepot ohne echtes Geld. Keine Anlageberatung.</p>` });

const POSW = [['VREX', 'Varex Imaging', 17.7, '03.11.', '−0,6 %'], ['TMP', 'Tompkins Financial', 5.5, '23.10.', '−3,2 %'], ['MEDP', 'Medpace', 4.8, '21.10.', '+1,5 %'], ['ASH', 'Ashland', 3.6, '06.11.', '−2,2 %'], ['KIDS', 'OrthoPediatrics', 3.0, '28.10.', '+20,2 %'], ['NUE', 'Nucor', 2.9, '02.11.', '−11,8 %']];
screen('p-depot', { world: 'start', dock: false, h: 1300, body: `<div style="display:flex;align-items:center;gap:10px"><span class="hb">${ic('i-back', 18)}</span><span class="sm b mu">Supertrader-Musterdepots</span></div>
<span class="ltag" style="display:block;margin-top:12px">Weinstein Stages · nach Stan Weinstein</span><div class="lt" style="margin-top:2px">Weinstein</div><p class="mu sm" style="margin-top:4px">Hält nur Aktien in Phase 2, dem Aufwärtstrend.</p>
<div class="grid3" style="margin-top:12px;gap:6px">${[['Aktien', '10'], ['Live seit', '12.10.'], ['Stand', '06.11.']].map(([a, b]) => `<div class="kt" style="width:auto"><small>${a}</small><b class="num" style="font-size:18px">${b}</b></div>`).join('')}</div>
<div style="margin-top:12px">${story('Das Depot in drei Sätzen', [['i-plus', 'Neu', 'Zuletzt aufgenommen (05.–06.11.): Ashland, Progyny, Acadia Healthcare.', vd('s', '3 neu')], ['i-pie', 'Größte Position', 'Varex Imaging mit 17,7 %.', vd('m', 'Gewicht')], ['i-signal', 'Seit Aufnahme', 'OrthoPediatrics +20,2 %, Par Pacific −24,0 %.', vd('m', 'gemischt')]])}</div>
<div class="st">Im Musterdepot<a>Alle 10</a></div>
<div class="card" style="padding:2px 14px">${POSW.map(([t, n, w, d, c]) => `<div class="pos">${logo(t, 34)}<div style="min-width:0"><b>${n}</b><span>${de(w, 1)} % · aufgenommen ${d}</span></div>${pillv(c, c[0] === '+')}</div>`).join('')}</div>
<div style="margin-top:8px">${help('Je Aktie stehen Aufnahmekurs, Zone und Ungültig-Marke laut Methode in der Detailansicht. Rechenmodell, keine Order.')}</div>
<div class="eps ep2" style="margin-top:12px">${[['Protokoll', 'aufgenommen und abgegeben, mit Datum', 'i-list'], ['Die Regeln', 'Phase 2, Aufnahme, Abgabe', 'i-book'], ['Zur Methode in Supertrader', 'Weinstein · Investor / Trader', 'supertrader']].map(ep).join('')}</div>` });

/* ======================================================================
   AI-ATLAS
   ====================================================================== */
const EX = ['Wie stark ist der Free Cashflow bei NVIDIA gewachsen?', 'Vergleiche NVIDIA, AMD und Broadcom bei Umsatz, Marge und KGV', 'Günstig bewertete kleine Firmen mit wenig Schulden', 'Welche Aktien stehen auf einem neuen Jahreshoch?'];
screen('a-home', { world: 'start', dock: false, h: 1080, body: `<div style="display:flex;align-items:center;gap:10px">${hud('discover', 34, 10).replace('discover', 'discover')}<span class="ltag">AI Atlas · Beta</span></div><div class="lt" style="margin-top:8px">Was möchtest<br>du wissen?</div><p class="mu" style="margin-top:8px;font-size:15px">Atlas übersetzt deine Frage in Regeln. Jede Zahl rechnet Vision Universe aus seinen Daten, mit Quelle.</p>
<div class="ask"><p>Frag in deinen Worten …</p><div class="ask-f"><span>Tippen oder sprechen</span><span class="hb">${ic('i-mic', 17)}</span><span class="hb" style="background:var(--lime)">${ic('i-next', 17)}</span></div></div>
<div class="card" style="margin-top:10px;padding:10px 14px;display:flex;gap:10px;align-items:center">${vd('o', 'Beta')}<span class="xs mu b" style="flex:1">Neue Fragen sind noch gesperrt. Gestellte Fragen kommen kostenlos aus dem Archiv.</span></div>
<div class="st">Probier zum Beispiel</div>
<div class="stack">${EX.map(x => `<div class="card" style="padding:12px 14px;display:flex;gap:10px;align-items:center">${ic('i-spark', 16)}<b class="sm" style="flex:1">${x}</b>${ic('i-next', 15)}</div>`).join('')}</div>
<div style="margin-top:10px">${help('Atlas rechnet nicht selbst und gibt keine Anlageberatung. Was genau gilt: Tipp auf „?“.')}</div>` });

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
slide({ t: 'html', anchor: 'cover', dark: 1, html: () => `<div class="covergrid"><div><img src="${src('img/vision-universe-logo-web.png')}" alt="Vision Universe" style="height:20px;filter:invert(1);margin-bottom:36px"><div style="font-size:clamp(42px,6.4vw,92px);font-weight:900;letter-spacing:-.06em;line-height:.92">Mein Bereich.<br>Portfolios.<br><span style="color:var(--lime)">Atlas.</span></div><p style="margin-top:22px;color:#a6a6a6;font-size:clamp(16px,1.5vw,20px);font-weight:500;max-width:46ch">Die persönlichen Bereiche im gleichen Muster wie die Welten: ein Ort, der jeden Tag sagt, was sich bei deinen Aktien tut; Musterdepots, die man in drei Sätzen versteht; ein Atlas, der zeigt, wie er rechnet.</p><div class="toc" id="toc" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:28px"></div></div><div class="coverphones"><div data-frame="m-home"></div><div data-frame="a-answer"></div></div></div>` });

slide({ t: 'html', id: 'K1', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 09.11.2026 auf 390 px. Mein Dashboard mit simulierter Anmeldung im Browser (Konten sind bis zur Freigabe aus); lokal fehlten die Watchlist-Kurse, daher „kein Kurs“ in der Aufnahme.', html: () => `<div class="facts">${[
  ['2 × „Mein Bereich“', 'Willkommensseite und Mein Dashboard heißen beide „Mein Bereich“, beide zeigen die Welten als Kacheln. Wer angemeldet ist, landet auf der Willkommensseite mit Video statt bei seinen Aktien.'],
  ['Nur Watchlist', 'Mein Dashboard zeigt Kurse der Watchlist. Was in den Welten zu diesen Aktien passiert (Befunde, Meldungen, Reihen, 13F), fehlt, obwohl alles veröffentlicht ist.'],
  ['Portfolios: alt', 'Eigener Kopf mit ☰, rote und grüne Pfeile, „Einstieg laut Methode“, „Stopp laut Methode“, sieben Mal „Depot-Wertentwicklung noch nicht veröffentlicht“. Ein Depot ist 6.191 px lang, jede Aktie eine große Karte.'],
  ['Atlas: 3 Hinweise', '„Noch gesperrt“ und darunter „Keine Verbindung“, dazu drei Hinweisblöcke zu Grenzen und Datenschutz. Beispiele mit Fachwort („Minervini-Raster“).'],
  ['Atlas: allein', 'Atlas lebt auf /ask/. Auf einer Aktie gibt es keinen Weg, „zu dieser Aktie“ zu fragen (außer in Elliott).']].map(([a, b]) => `<div><b style="font-size:clamp(26px,3.2vw,44px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });

chapter({ n: '01', title: 'Mein Bereich', icon: 'i-person', anchor: 'kap-mein', was: 'Willkommen und Mein Dashboard werden <b>ein Ort</b>: „Heute bei deinen Aktien“ aus allen Welten. Das Willkommen bleibt für den ersten Besuch.', pages: 'MX01–MX02' });
slide({ id: 'MX01', title: 'Mein Bereich: heute bei deinen Aktien', route: '/willkommen/ + /mein-dashboard/', newRoute: '/mein-dashboard/ (Start nach Anmeldung)', now: 'D01',
  sub: 'Neu: Nach der Anmeldung landet man hier. Oben die Zahl der Ereignisse, die Watchlist als Streifen, dann „Was sich getan hat“: je Aktie die Ereignisse aus Technical, Quant, Supertrader, Discover und Hedgefonds. Darunter Weiter lernen und die Welten.',
  neu: [['m-home', 'Mein Bereich']],
  spec: { aufbau: ['Begrüßung mit Datum', 'Heute bei deinen Aktien: 3 Zahlen', 'Watchlist-Streifen (Kurs, Tagesbewegung, Mini-Chart)', 'Was sich getan hat: Karte je Aktie mit Ereignissen je Welt + Urteil', 'Weiter lernen (nächstes Video)', 'Deine Welten (6), Hinweis'], komponenten: ['Neu: Ereignis-Karte je Aktie', 'Watchlist-Streifen', 'Story/Today-Karte'], daten: ['/v1/watchlist (wie heute)', 'Ereignisse: veröffentlichte Daten je Aktie (Quant change, Technical Befunde, Discover memberships, Supertrader stock, Hedgefonds stocks), im Browser gelesen, nichts gespeichert'], weg: ['Willkommensseite als Start nach jeder Anmeldung', 'Doppelte Welten-Kacheln'] } });
slide({ id: 'MX02', title: 'Erster Besuch', route: '/willkommen/', now: 'W02',
  sub: 'Das Willkommen bleibt, aber nur bis drei Schritte erledigt sind: Einblick-Video, Ziel wählen, erste Aktie merken. Danach öffnet die Anmeldung direkt Mein Bereich.',
  neu: [['m-first', 'Erster Besuch']],
  spec: { aufbau: ['Begrüßung', 'Drei Schritte mit Haken und Fortschritt', 'Beliebt zum Merken (feste Liste, keine Empfehlung)'], komponenten: ['Schrittkarte'], daten: ['Fortschritt im Konto (vorhandene Felder) bzw. auf dem Gerät'], weg: ['Video-Startseite für Wiederkehrer'] } });

chapter({ n: '02', title: 'Portfolios', icon: 'i-pie', anchor: 'kap-portfolios', was: 'Musterdepots im neuen Design, mit den <b>Namen der Welten</b> und drei Sätzen je Depot.', pages: 'PX01–PX02' });
slide({ id: 'PX01', title: 'Alle Musterdepots', route: '/portfolios/', now: 'P01',
  sub: 'Neu: ein Hinweis zur Wertentwicklung oben statt auf jeder Karte, Namen wie in Supertrader und Quant (Fachname klein darüber), ruhige Karten, Pillen in Neongrün und Schwarz.',
  neu: [['p-home', 'Übersicht']],
  spec: { aufbau: ['Frage, Satz, Chips je Gruppe', 'Ein Hinweis „Noch nicht veröffentlicht“', 'Karten je Gruppe: Fachname, Name, Aktien, Stand, Veränderung'], komponenten: ['Depot-Karte'], daten: ['wie heute'], weg: ['Eigener Kopf mit ☰ → gemeinsame Navigation', 'Rot/Grün', 'Wiederholter Hinweis je Karte'] } });
slide({ id: 'PX02', title: 'Ein Musterdepot', route: '/portfolios/#/supertrader/weinstein-stages', now: 'P05',
  sub: 'Neu: drei Zahlen, „Das Depot in drei Sätzen“, eine Zeile je Aktie (Gewicht, aufgenommen, seit Aufnahme), Zone und Ungültig-Marke laut Methode erst in der Detailansicht, Kapitel.',
  neu: [['p-depot', 'Weinstein']],
  spec: { aufbau: ['Kopf mit Fachname, Name, Satz', '3 Zahlen', 'Drei Sätze: neu, größte Position, seit Aufnahme', 'Zeilen je Aktie', 'Kapitel: Protokoll, Regeln, Methode'], komponenten: ['Story-Karte, Kapitel', 'Positionszeile'], daten: ['wie heute'], weg: ['Große Karte je Aktie mit vier Feldern', '„Einstieg/Stopp laut Methode“ → Zone/Ungültig-Marke laut Methode'] } });

chapter({ n: '03', title: 'AI-Atlas', icon: 'i-spark', anchor: 'kap-atlas', was: 'Eine Eingabe, klare Beispiele, <b>Antworten mit Rechenweg und Quelle</b>. Und Atlas auf jeder Aktie.', pages: 'AX01–AX03' });
slide({ id: 'AX01', title: 'Atlas · Start', route: '/ask/', now: 'A01',
  sub: 'Neu: eine Eingabe, ein Status-Hinweis (Beta, Archiv kostenlos) statt „Noch gesperrt“ und „Keine Verbindung“ untereinander, Beispiele in Alltagssprache, die Grenzen in einem „?“.',
  neu: [['a-home', 'Start']],
  spec: { aufbau: ['Frage, Satz', 'Eingabe mit Mikrofon', 'Ein Status-Hinweis', '4 Beispiele', 'Ein „?“ für Grenzen und Datenschutz'], komponenten: ['Eingabe', 'C09'], daten: ['wie heute'], weg: ['Doppelte Zustände', 'Drei Hinweisblöcke', 'Fachwörter in Beispielen'] } });
slide({ id: 'AX02', title: 'Eine Antwort', route: '/ask/ (Antwort)', now: 'A03',
  sub: 'Neu (Aufbau, echte Zahlen): die Antwort als große Zahl mit Zeitraum, ein Balkenchart, Quelle je Zahl, „So hat Atlas gerechnet“ als Chips, „Weiter fragen“. Heute kam lokal nur „Keine Verbindung“.',
  neu: [['a-answer', 'Antwort aus dem Archiv']],
  spec: { aufbau: ['Frage als Blase', 'Antwort: Satz, große Zahl, Zeitraum, Chart, Quellen', 'So hat Atlas gerechnet (Regeln)', 'Weiter fragen', 'Hinweis'], komponenten: ['Antwort-Karte', 'Quellen-Chip'], daten: ['Atlas-Antwort + die Daten der Welten (hier SEC, discover/data/stocks)'], weg: ['—'] } });
slide({ id: 'AX03', title: 'Atlas auf jeder Aktie', route: 'Aktienkopf → Atlas', now: null,
  sub: 'Neu: Der Atlas-Knopf oben öffnet auf einer Aktie ein Sheet „Atlas zu NVIDIA“ mit drei passenden Fragen. Die Frage bezieht sich auf die Aktie, ohne dass man sie tippt.',
  neu: [['a-sheet', 'Sheet auf der Aktie']],
  spec: { aufbau: ['Sheet mit Eingabe und 3 Fragen zur Aktie'], komponenten: ['C16 Sheet'], daten: ['wie heute; Aktie als Kontext der Frage'], weg: ['—'] } });

chapter({ n: '04', title: 'Umsetzung', icon: 'layers', anchor: 'umsetzung', was: 'Oberfläche und Zusammenführung. <b>Konten bleiben aus bis zur Freigabe, nichts Neues wird gespeichert.</b>', pages: 'U1' });
slide({ t: 'html', id: 'U1', title: 'Fahrplan und Entscheidungen', html: () => `<div class="plan" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[
  ['Mein Bereich · 2 PRs', 'Zusammenführen; Ereignisse', 'Start nach Anmeldung = Mein Dashboard, Willkommen nur bis 3 Schritte erledigt; Modul „Was sich getan hat“ aus veröffentlichten Daten je Watchlist-Aktie.'],
  ['Portfolios · 2 PRs', 'Übersicht; Depot', 'Gemeinsame Navigation, Namen der Welten, Wortwahl, Farben, drei Sätze, Zeilen statt Karten.'],
  ['Atlas · 2 PRs', 'Start und Antwort; Sheet', 'Ein Status, Beispiele, Antwort mit Rechenweg und Quelle; Atlas-Sheet im Aktienkopf.']].map(([a, b, c]) => `<div><span class="tag neu">${a}</span><b>${b}</b><p>${c}</p></div>`).join('')}</div>
<h3 style="margin-top:36px;font-size:22px;letter-spacing:-.02em">Von dir zu entscheiden</h3>
<ol class="dec">${[
  ['Nach der Anmeldung direkt zu Mein Bereich statt zur Willkommensseite?', 'Empfehlung: ja, Willkommen nur bis die drei Schritte erledigt sind.'],
  ['„Was sich getan hat“ aus allen Welten für die Watchlist?', 'Empfehlung: ja, als Modul aus veröffentlichten Daten, im Browser gelesen, keine neue Speicherung (passt zur Regel in dashboard.js: neue Module erst mit freigegebener Datenquelle – die Quellen sind bereits öffentlich).'],
  ['Musterdepots mit den Namen aus Supertrader und Quant?', 'Empfehlung: ja, damit ein Depot überall gleich heißt.'],
  ['Atlas-Sheet auf jeder Aktie?', 'Empfehlung: ja, nur mit freigeschalteter Fragefunktion; bis dahin zeigt das Sheet Archiv-Antworten zur Aktie.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });
})();
