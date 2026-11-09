/* Konzept Elliott, Hedgefonds, Vorsorge, Stand 09.11.2026.
   Bausteine aus ../redesign-2027/lib.js (Kopie in lib/). Elliott-Lesarten echt aus dem Wellen-Index (data-ehv.js);
   Hedgefonds- und Vorsorge-Zahlen wie am 09.11.2026 auf /hedgefonds/ und /vorsorge/ abgelesen. */
(function () {
'use strict';
const { screen, slide, chapter, ic, hud, chart, help, vd, tf } = VU;
const E = EHV.elliott, SER = EHV.series, UC = EHV.ucits;
const ASOF = 'Fr. 06.11.';
const src = p => (window.__IMG && window.__IMG[p]) || p;
const de = (v, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const logo = (t, s = 36) => `<span class="lgx" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .28)}px"><b style="font-size:${Math.max(8.5, s * .25)}px">${t}</b><img src="${src('img/logos/' + t + '.png')}" alt="" onerror="this.remove()"></span>`;
const face = (id, ini, s = 44) => `<span class="face" style="width:${s}px;height:${s}px"><b>${ini}</b><img src="${src('img/managers/' + id + '.jpg')}" alt="" onerror="this.remove()"></span>`;
const pillv = (txt, up) => `<span class="chg ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${String(txt).replace(/^[+−]/, '')}</span>`;
const railHead = (t, cnt, s, tag) => `<div class="rh"><div class="rh-t"><b>${t}</b>${tag ? `<span class="rh-tag">${tag}</span>` : ''}<a>${cnt ? 'Alle ' + cnt : 'Alle'} ${ic('i-next', 13)}</a></div>${s ? `<p>${s}</p>` : ''}</div>`;
const rail = items => `<div class="rail">${items.join('')}</div>`;
const story = (title, rows) => `<div class="story"><div class="ltag" style="color:#9b9b9b">${title}</div>${rows.map(([i, l, t, v]) => `<div class="story-r"><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><div><span class="ltag" style="color:#9b9b9b">${l}</span><p>${t}</p></div>${v}</div>`).join('')}</div>`;
const ep = (c, i) => `<div class="ep"><b class="ep-n">${i + 1}</b><span class="hud" style="width:40px;height:40px;border-radius:12px">${ic(c[2], 19)}</span><div class="ep-t"><b>${c[0]}</b><span>${c[1]}</span></div><span class="ep-c">${ic('i-next', 15)}</span></div>`;
const stockHead = (p, t = 'NVDA', name = 'NVIDIA', what = 'Chips für KI und Grafik', price = 186.64, d = 2.7753) => { const h = VU.STOCK(p, { s: { t, name, what, p: price, d, eur: t === 'NVDA' ? '167,17 €' : '', date: ASOF } }).replace(`<span class="lg">${t}</span>`, logo(t, 42)); return t === 'NVDA' ? h : h.replace('<br>≈ ', ''); };

/* ======================================================================
   ELLIOTT
   ====================================================================== */
const NAMES = { MNSO: 'Miniso', SN: 'SharkNinja', RYAAY: 'Ryanair', EGP: 'Eastgroup Properties', HWKN: 'Hawkins', PFGC: 'Performance Food Group', CBZ: 'CBIZ', 'AHL-P-E': 'Aspen Insurance (Vorzug)' };
const PAT = p => ({ ZIGZAG: 'Zickzack', FLAT: 'Flache Korrektur', TRIPLE_ZIGZAG: 'Dreifach-Zickzack', WXY: 'Doppelte Korrektur (W-X-Y)', TRIANGLE: 'Dreieck', IMPULSE: 'Impuls' })[String(p).split(':')[0]] || p;
const PH = p => String(p).endsWith(':done') ? 'abgeschlossen' : 'läuft (' + String(p).split(':')[1] + ')';
const STR = s => ({ CORRECTION_IN_UPTREND: 'Rücksetzer im Aufwärtstrend', UPTREND_ADVANCING: 'Aufwärtstrend läuft', RALLY_IN_DOWNTREND: 'Erholung im Abwärtstrend', DOWNTREND_ADVANCING: 'Abwärtstrend läuft' })[s] || s;
const ERows = E.rows.filter(r => !/-P-/.test(r.t)).slice(0, 6);
const eRow = r => `<div class="er">${logo(r.t, 36)}<div style="min-width:0"><b>${NAMES[r.t] || r.t}</b><span>${PAT(r.elliott)} ${PH(r.elliott)} · ${STR(r.structure)}</span></div><div style="display:grid;justify-items:end;gap:3px">${vd(r.direction === 'BULLISH' ? 's' : 'w', r.direction === 'BULLISH' ? 'nach oben' : 'nach unten')}<small class="xs mu b">ungültig ${r.direction === 'BULLISH' ? 'unter' : 'über'} ${de(r.invalidation, 2)} $</small></div></div>`;
screen('e-home', { world: 'elliott', dock: 0, h: 1330, body: `<div class="ltag">Elliott · PRO · Wochencharts ${ASOF}</div><div class="lt" style="margin-top:4px">Wo lassen sich<br>Wellen zählen?</div><p class="mu" style="margin-top:8px;font-size:15px">Elliott ist ein experimentelles Strukturmodell. Es passt nur, wenn der Chart sauber in Wellen verläuft. Das ist selten.</p>
<div class="today" style="margin-top:14px"><div class="ltag" style="color:#9b9b9b">Heute anwendbar</div><div style="display:flex;align-items:baseline;gap:8px;margin-top:4px"><b class="num" style="font-size:44px;letter-spacing:-.05em;color:var(--lime);line-height:1">${E.applicable}</b><span style="color:#bdbdbd;font-weight:700">von ${E.n.toLocaleString('de-DE')} Aktien</span></div><div class="ebar"><i style="width:${Math.max(1.2, E.applicable / E.n * 100)}%"></i></div><p class="xs" style="color:#bdbdbd;margin-top:8px">Gut anwendbar: ${E.high}. Bei allen anderen zeigt die Aktie die Marktstruktur aus Technical.</p></div>
<div style="margin-top:12px">${VU.search('Aktie suchen …')}</div>
<div class="st">Saubere Zählung heute<a>Alle ${E.applicable}</a></div>
<div class="card" style="padding:2px 14px">${ERows.map(eRow).join('')}</div>
<div style="margin-top:10px">${help('Ungültig: Schließt die Woche jenseits dieser Marke, gilt die Zählung nicht mehr. Eine Lesart ist keine Vorhersage und kein Kursziel.')}</div>
<div class="card" style="margin-top:12px;padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('i-book', 20)}</span><div style="flex:1"><b style="display:block">Wellen in 3 Minuten</b><span class="sm mu">Impuls, Korrektur, warum Zählungen oft wechseln</span></div>${ic('i-next', 18)}</div>
<p class="xs mu" style="margin-top:14px">Experimentell. Projektion ≠ Wahrscheinlichkeit. Keine Anlageempfehlung.</p>` });

const SNr = E.rows.find(r => r.t === 'SN');
screen('e-stock', { world: 'elliott', dock: 0, hdr: false, h: 1150, body: `${stockHead('Wellen', 'SN', 'SharkNinja', 'Haushaltsgeräte', 222.95, 2.6804)}
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"><div><span class="ltag">Wellen · Wochenchart</span><div class="mt" style="margin-top:2px">${PAT(SNr.elliott)} ${PH(SNr.elliott)}</div></div>${vd('s', 'Zählung klar')}</div>
<div style="margin-top:8px">${chart(SER.SN, { h: 160, zones: [[SNr.invalidation - 4, SNr.invalidation, 'g', 'Ungültig unter ' + de(SNr.invalidation, 2) + ' $']], axis: ['Nov 25', 'Nov 26'] })}</div>
${story('Die Lesart in drei Sätzen', [['i-wave', 'Struktur', 'Eine Korrektur in drei Teilen ist abgeschlossen. Der Aufwärtstrend läuft.', vd('s', 'nach oben')], ['i-target', 'Grenze', `Die Lesart gilt, solange die Woche über ${de(SNr.invalidation, 2)} $ schließt.`, vd('m', 'Ungültig-Marke')], ['i-book', 'Sicherheit', 'Zählung klar, Gefahr einer Neuzählung gering. Anwendbarkeit: mittel.', vd('m', 'Mittel')]])}
<div class="eps ep2" style="margin-top:12px">${[['Die Wellen im Chart', 'A · B · C mit Datum', 'i-wave'], ['Andere Lesarten', 'Alternative und Randszenario', 'i-shapes'], ['Was früher in ähnlichen Lagen geschah', 'Forschung, nicht zertifiziert', 'i-bars']].map(ep).join('')}</div>` });

screen('e-none', { world: 'elliott', dock: 0, hdr: false, body: `${stockHead('Wellen')}
<div class="card" style="margin-top:14px;padding:16px"><div style="display:flex;gap:8px;align-items:center">${vd('o', 'Keine Zählung')}<span class="ltag">Elliott · NVIDIA</span></div><div class="mt" style="margin-top:10px">Bei NVIDIA lassen sich gerade keine Wellen sauber zählen.</div><p class="sm mu" style="margin-top:6px">Der Chart verläuft zu unruhig für eine belastbare Lesart. Das ist der Normalfall: nur ${E.applicable} von ${E.n.toLocaleString('de-DE')} Aktien sind heute zählbar.</p></div>
<div class="card" style="margin-top:10px;padding:14px;display:flex;gap:12px;align-items:center">${hud('technical', 42, 12)}<div style="flex:1"><b style="display:block">Chart-Lage in Technical ansehen</b><span class="sm mu">Trend, Zonen, Befunde</span></div>${ic('i-next', 18)}</div>
<div class="card" style="margin-top:10px;padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('i-list', 20)}</span><div style="flex:1"><b style="display:block">Aktien mit sauberer Zählung</b><span class="sm mu">${E.applicable} heute</span></div>${ic('i-next', 18)}</div>` });

/* ======================================================================
   HEDGEFONDS
   ====================================================================== */
const STARS = [['berkshire', 'WB', 'Warren Buffett', 'Berkshire Hathaway', '299,3 Mrd. $', '+13,7 %', 1], ['pershing-square', 'BA', 'Bill Ackman', 'Pershing Square', '13,7 Mrd. $', '−11,7 %', 0], ['ark', 'CW', 'Cathie Wood', 'ARK Invest', '', '', 1], ['fisher', 'KF', 'Ken Fisher', 'Fisher Asset Management', '', '', 1]];
const starCard = ([id, ini, n, f, v, c, up]) => `<div class="sc">${face(id, ini, 48)}<b>${n}</b><span>${f}</span>${v ? `<div style="display:flex;align-items:center;gap:6px;margin-top:8px"><b class="num" style="font-size:17px">${v}</b>${pillv(c, up)}</div>` : '<div class="ph" style="margin-top:8px"></div>'}</div>`;
const MOVE = [['SpaceX', 'SPCX', '10 Fonds · 10 neu', '30,8 Mrd. $', 1, 100], ['Micron', 'MU', '8 Fonds · 5 neu', '9,8 Mrd. $', 1, 32], ['Alphabet (C)', 'GOOG', '9 Fonds · 1 neu', '9,6 Mrd. $', 1, 31]];
const moveRow = ([n, t, s, v, up, w]) => `<div class="mvr">${logo(t, 32)}<div style="min-width:0"><b>${n}</b><span>${s}</span><div class="mvb"><i class="${up ? 'up' : ''}" style="width:${w}%"></i></div></div><b class="num">${up ? '+' : '−'}${v}</b></div>`;
screen('h-home', { world: 'hedgefonds', dock: 0, h: 1220, body: `<div class="ltag">Hedgefonds · 13F</div><div class="lt" style="margin-top:4px">Was große Fonds<br>gemeldet haben</div>
<div class="qb"><div><span class="ltag" style="color:#9b9b9b">Gezeigt</span><b>Q2 2026</b><span>Depots am 30.06.2026</span></div><div><span class="ltag" style="color:#9b9b9b">Gemeldet bis</span><b>14.08.</b><span>45 Tage später</span></div><div><span class="ltag" style="color:#9b9b9b">Nächste Meldungen</span><b>14.11.</b><span>für Q3 2026</span></div></div>
<p class="xs mu" style="margin-top:6px">Meldungen zeigen, was Fonds vor Monaten hielten, nicht heute.</p>
<div style="margin-top:12px">${VU.search('Investor, Fonds oder Aktie …')}</div>
${railHead('Star-Investoren', 79, 'Bekannte Namen, Depotwert zum 30.06.')}
${rail(STARS.map(starCard))}
${railHead('Was die Stars bewegt haben', '', 'Geschätzter Wert der Käufe im Quartal.')}
<div class="seg"><span class="on">Gekauft</span><span>Verkauft</span><span>Meistgehalten</span></div>
<div class="card" style="padding:2px 14px;margin-top:8px">${MOVE.map(moveRow).join('')}</div>
${railHead('Viele Fonds, gleiche Aktie', '', 'Aktien, die mehrere Fonds in 30 Tagen gekauft haben.')}
<div class="card" style="padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('i-person', 20)}</span><div style="flex:1"><b style="display:block">Gruppen-Käufe</b><span class="sm mu">heute „Smart Money“</span></div>${ic('i-next', 18)}</div>
<p class="xs mu" style="margin-top:14px">Was große Fonds gemeldet haben (13F, Angabe Dritter). Keine Anlageberatung. Stand 02.11.2026.</p>` });

const POS = [['AAPL', 'Apple', 22.0, ''], ['AXP', 'American Express', 17.1, ''], ['KO', 'Coca-Cola', 10.9, ''], ['GOOGL', 'Alphabet (A)', 9.4, '+45,2 %'], ['BAC', 'Bank of America', 9.2, '−5,9 %'], ['CVX', 'Chevron', 4.7, '']];
screen('h-investor', { world: 'hedgefonds', dock: 1, h: 1180, body: `<div style="display:flex;gap:12px;align-items:center">${face('berkshire', 'WB', 60)}<div><span class="ltag">Value · Berkshire Hathaway</span><div class="mt" style="margin-top:2px">Warren Buffett</div><span class="xs mu b">CEO seit 2026: Greg Abel</span></div></div>
<div class="grid2" style="margin-top:14px;gap:8px"><div class="kt" style="width:auto"><small>Depotwert 30.06.</small><b class="num">299,3 Mrd. $</b><span>▲ +13,7 %</span></div><div class="kt" style="width:auto"><small>Positionen</small><b class="num">29</b><span>Top 5 = 68,7 %</span></div></div>
<div style="margin-top:12px">${story('Das Quartal in drei Sätzen', [['i-pie', 'Größte Position', 'Apple ist mit 22,0 % die größte Position.', vd('m', 'Größte')], ['i-plus', 'Gekauft', 'Mehr Alphabet: Klasse A +45 %, Klasse C mehr als versiebenfacht.', vd('s', 'Aufgestockt')], ['i-x', 'Verkauft', 'Weniger Capital One (−58 %) und Nucor (−52,5 %).', vd('w', 'Reduziert')]])}</div>
<div class="st">Größte Positionen<a>Alle 29</a></div>
<div class="card" style="padding:4px 14px">${POS.map(([t, n, w, c]) => `<div class="pp">${logo(t, 30)}<div style="min-width:0"><b>${n}</b><div class="mvb"><i class="up" style="width:${w / 22 * 100}%"></i></div></div><b class="num">${de(w, 1)} %</b>${c ? pillv(c, c[0] === '+') : t === 'AAPL' ? '<span></span>' : '<span class="xs mu b">gleich</span>'}</div>`).join('')}</div>
<div class="eps ep2" style="margin-top:12px">${[['Depotwert im Verlauf', '8 Quartale', 'i-bars'], ['Käufe (8) und Verkäufe (7)', 'mit Stückzahl und Wert', 'i-list'], ['Werte je Quartal', 'Tabelle', 'i-grid']].map(ep).join('')}</div>` });

screen('h-stock', { world: 'hedgefonds', dock: 2, hdr: false, h: 1180, body: `${stockHead('Investoren')}
<div style="margin-top:14px">${story('Investoren in drei Sätzen · Q2 2026', [['i-person', 'Fonds', '413 Hedgefonds halten NVIDIA, darunter 34 Star-Investoren.', vd('m', 'Viele')], ['i-signal', 'Bewegung', '192 haben aufgestockt, 199 verkauft: ausgeglichen.', vd('m', 'Ausgeglichen')], ['i-heart', 'Insider', 'In 90 Tagen haben 3 Insider verkauft, keiner gekauft.', vd('w', 'Netto Verkauf')]])}</div>
<div class="st">Star-Investoren mit NVIDIA<a>Alle 34</a></div>
<div class="card" style="padding:2px 14px">${[['fisher', 'KF', 'Ken Fisher', 'Fisher Asset Management · 5,4 % des Depots', '18,2 Mrd. $', '+2,7 %', 1], ['', 'IE', 'Israel Englander', 'Millennium · 0,9 %', '2,4 Mrd. $', '+14,9 %', 1], ['', 'KG', 'Ken Griffin', 'Citadel · 0,3 %', '2,4 Mrd. $', '−36,7 %', 0], ['', 'CC', 'Chase Coleman', 'Tiger Global · 9,3 %', '2,2 Mrd. $', '−6,8 %', 0]].map(([id, ini, n, s, v, c, up]) => `<div class="pp">${face(id || 'x', ini, 32)}<div style="min-width:0"><b>${n}</b><span class="xs mu">${s}</span></div><b class="num">${v}</b>${pillv(c, up)}</div>`).join('')}</div>
<div class="eps ep2" style="margin-top:12px">${[['Alle 413 Hedgefonds', 'neu 22 · ganz raus 26', 'i-list'], ['Insider-Käufe und -Verkäufe', 'Form 4, 90 Tage', 'i-person'], ['Alle 13F-Melder', '5.955 inkl. Banken, Versicherer, ETF-Anbieter', 'i-grid']].map(ep).join('')}</div>
<p class="xs mu" style="margin-top:12px">Angabe Dritter (13F, Form 4). Stand der Depots 30.06.2026, Insider bis 03.11.2026. Keine Anlageberatung.</p>` });

/* ======================================================================
   VORSORGE
   ====================================================================== */
screen('v-home', { world: 'vorsorge', dock: 0, h: 1340, body: `<div class="ltag">Vorsorge</div><div class="lt" style="margin-top:4px">Was wird aus<br>deiner Rente?</div><p class="mu" style="margin-top:8px;font-size:15px">Rechnen, verstehen, anfangen. Ohne Produktverkauf, mit amtlichen Regeln.</p>
<div class="jr"><span class="ltag">Dein Weg in drei Schritten</span>${[['1', 'Ziel rechnen', 'Wie viel brauchst du im Alter?', 1], ['2', 'Sparplan bauen', 'Breit streuen, Kosten niedrig', 0], ['3', 'Auf Kurs bleiben', 'Wir melden, wenn sich etwas ändert', 0]].map(([n, a, b, on]) => `<div class="jr-r${on ? ' on' : ''}"><span class="stepn">${n}</span><div><b>${a}</b><span>${b}</span></div>${ic('i-next', 16)}</div>`).join('')}</div>
<div class="card lime" style="margin-top:12px;padding:16px"><span class="ltag" style="color:#000;opacity:.6">Neu hier?</span><b style="display:block;font-size:20px;letter-spacing:-.03em;margin-top:2px">Mit 10 € im Monat anfangen</b><span class="sm">6 Fragen, 3 Minuten.</span><div class="btn ink" style="margin-top:10px;height:46px;font-size:14.5px">Los geht’s</div></div>
<div class="st">Beispielrechnung<a>Selbst rechnen</a></div>
<div class="card" style="padding:14px"><span class="xs mu b">250 € im Monat · 35 → 67 Jahre · heutige Kaufkraft</span><div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><b class="num" style="font-size:32px;letter-spacing:-.04em">127 Tsd. €</b><span class="sm mu b">bei 5 % pro Jahr</span></div><div class="grid3" style="margin-top:8px;gap:6px">${[['3 %', '86 Tsd.'], ['5 %', '127 Tsd.'], ['7 %', '191 Tsd.']].map(([a, b], i) => `<div class="kt" style="width:auto;${i === 1 ? 'background:var(--lime)' : ''}"><small>${a}</small><b class="num" style="font-size:16px">${b}</b></div>`).join('')}</div></div>
<div class="st">Was der Staat ab 2027 dazulegt<a>Förderung</a></div>
<div class="grid3" style="gap:6px">${[['540 €', 'Grundzulage / Jahr'], ['300 €', 'je Kind / Jahr'], ['200 €', 'einmalig unter 25']].map(([a, b]) => `<div class="kt" style="width:auto"><b class="num" style="font-size:18px">${a}</b><small>${b}</small></div>`).join('')}</div>
<div class="st">Die großen Indizes<a>Alle ETFs</a></div>
<div class="card" style="padding:2px 14px">${[['Aktien Welt', 'MSCI World', '+13,63 %'], ['Aktien USA', 'S&P 500', '+15,01 %'], ['Schwellenländer', 'MSCI Emerging Markets', '+25,15 %']].map(([a, b, c]) => `<div class="kv"><span><b class="sm" style="display:block">${a}</b><span class="xs mu">${b} · 12 Monate</span></span>${pillv(c, 1)}</div>`).join('')}</div>
<div style="margin-top:8px">${help('Gemessen an US-Fonds als Marktabbild, Kurse bis 02.10.2026. Kaufbar in der EU sind UCITS-ETFs auf denselben Index.')}</div>` });

const UR = SER.URTH;
screen('v-etf', { world: 'vorsorge', dock: 2, hdr: false, h: 1300, body: `<div style="display:flex;align-items:center;gap:10px"><span class="hb">${ic('i-back', 18)}</span><span class="sm b mu">ETF · Aktien Welt</span><span class="hb" style="margin-left:auto">${ic('i-heart', 17)}</span></div>
<div class="lt" style="margin-top:10px">MSCI World</div><p class="mu sm" style="margin-top:2px">Rund 1.300 große Firmen aus 23 Industrieländern.</p>
<div class="card lime" style="margin-top:12px;padding:14px"><span class="ltag" style="color:#000;opacity:.6">In einem Satz</span><b style="display:block;margin-top:4px;font-size:16px;line-height:1.3">Breit gestreut, aber zu 68 % USA. Die zehn größten Firmen machen ein Viertel aus.</b></div>
<div class="card" style="margin-top:10px;padding:14px"><div style="display:flex;justify-content:space-between;align-items:center"><span class="ltag">In der EU kaufbar</span>${vd('s', 'UCITS')}</div><p class="sm" style="margin-top:6px"><b>${UC.msciWorld} UCITS-ETFs</b> auf MSCI-World-Indizes stehen im EU-Fondsregister, zum Beispiel:</p>${UC.examples.map(x => `<div class="kv"><span class="sm b">${x.name}</span><span class="xs mu b">${x.isin}</span></div>`).join('')}<p class="xs mu" style="margin-top:6px">ESMA-Register, Stand ${UC.runDate.split('-').reverse().join('.')}. Beispiele, keine Empfehlung. Kurse und Kosten folgen, sobald EU-Kurse vorliegen.</p></div>
<div class="st">Marktabbild<a>US-Fonds URTH</a></div>
<div class="card" style="padding:12px">${chart(UR, { w: 330, h: 120, axis: ['Okt 25', '02.10.26'] })}</div>
<div class="grid2" style="margin-top:10px;gap:8px">${[['Pro Jahr seit 2012', '+12,2 %', 'mit Ausschüttungen'], ['Schwankung', '16 %', 'pro Jahr'], ['Kosten', '0,24 %', 'pro Jahr laut Prospekt'], ['Firmen', '1.320', 'Meldung 28.02.2026']].map(([a, b, c]) => `<div class="kt" style="width:auto"><small>${a} <span class="qm">?</span></small><b class="num">${b}</b><span>${c}</span></div>`).join('')}</div>
<div class="eps ep2" style="margin-top:12px">${[['Größte Firmen und Länder', 'NVIDIA 5,0 % · USA 68 %', 'i-pie'], ['Einordnung', '3 passt · 4 Hinweise', 'i-check'], ['Kosten über die Jahre', 'Was 0,24 % ausmachen', 'i-bars'], ['Was hat sich geändert?', 'Gewichte, Kosten', 'i-new']].map(ep).join('')}</div>` });

/* ======================================================================
   Folien
   ====================================================================== */
slide({ t: 'html', anchor: 'cover', dark: 1, html: () => `<div class="covergrid"><div><img src="${src('img/vision-universe-logo-web.png')}" alt="Vision Universe" style="height:20px;filter:invert(1);margin-bottom:36px"><div style="font-size:clamp(42px,6.4vw,92px);font-weight:900;letter-spacing:-.06em;line-height:.92">Elliott.<br>Hedgefonds.<br><span style="color:var(--lime)">Vorsorge.</span></div><p style="margin-top:22px;color:#a6a6a6;font-size:clamp(16px,1.5vw,20px);font-weight:500;max-width:46ch">Die letzten drei Welten im gleichen Muster: ehrlich, was ein Modell kann, ein klarer Zeitbezug bei Meldungen, ein Weg statt acht Einstiegen. Echte Werte vom 06.11.2026.</p><div class="toc" id="toc" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:28px"></div></div><div class="coverphones"><div data-frame="h-stock"></div><div data-frame="v-home"></div></div></div>` });

slide({ t: 'html', id: 'K1', title: 'Das gemeinsame Muster aller Welten', sub: 'Was Discover, Quant, Fundamental, Supertrader und Technical schon bekommen, gilt auch hier. Damit lernt der Nutzer die App einmal.', html: () => `<ol class="rules7">${['Oben eine Frage und ein Satz, was die Welt kann (und was nicht).', 'Auf der Aktie: Kopf, Perspektiven-Leiste, dann „… in drei Sätzen“ mit Urteil.', 'Darunter Kapitel, zugeklappt, statt langer Abschnitte.', 'Jede Zahl mit Stand; bei Meldungen Dritter auch, wann sie gemeldet wurden.', 'Schienen und ruhige Listen statt Kacheln, 25 je Schritt.', 'Fehlen Daten, sagt die Seite es. Kein leerer grauer Kasten.', 'Wortwahl nach WORTWAHL.md: keine Ziele, keine Signale, kein Rot.'].map(x => `<li>${x}</li>`).join('')}</ol>` });

/* Elliott */
chapter({ n: '01', title: 'Elliott', icon: 'elliott', anchor: 'kap-elliott', was: 'Ehrlich, wie selten Wellen zählbar sind: <b>' + E.applicable + ' von ' + E.n.toLocaleString('de-DE') + '</b>. Der Start zeigt genau diese, die Aktie sagt in drei Sätzen, was gilt.', pages: 'EX01–EX03' });
slide({ t: 'html', id: 'EX01', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 09.11.2026 auf 390 px; Lesarten aus dem Wellen-Index vom 06.11.', html: () => `<div class="facts">${[
  [E.applicable + ' von ' + E.n.toLocaleString('de-DE'), `Aktien, bei denen eine Wellenzählung laut eigener Einstufung anwendbar ist; gut anwendbar: ${E.high}. Die Seite wirbt trotzdem mit „Welche Wellen laufen gerade?“.`],
  ['„Welle 3“: ' + E.wave3, `Ein Leistenplatz heißt „Welle 3“. Im Wellen-Index vom 06.11. (index.json.gz) steht bei keiner Aktie eine laufende Welle 3; die meisten Zählungen sind abgeschlossene Korrekturen.`],
  ['Aufwärts ≠ Abwärts', 'NVIDIA in Elliott: „Technischer Ausblick: Aufwärts · Stark“. Am selben Tag in Technical: „Abwärtstrend · Schwach“. Zwei Welten, zwei Aussagen ohne Erklärung.'],
  ['Ziel und Rat', '„Zielbereich 191–216 $“, „Zone 1 ab 191 $“, „Kurs weit über der Zone – Rücklauf abwarten“. Kursziel und Handlungsanweisung stehen auf der Nein-Liste von WORTWAHL.md.'],
  ['Grauer Kasten', 'Lädt die Übersicht nicht (lokal fehlte elliott-home.json), bleibt ein leerer grauer Kasten ohne Hinweis.']].map(([a, b]) => `<div><b style="font-size:clamp(26px,3.2vw,44px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });
slide({ id: 'EX02', title: 'Elliott · Start', route: '/elliott/', now: 'E01',
  sub: 'Neu: Die Startseite sagt, wie selten Wellen zählbar sind, und zeigt genau diese Aktien als ruhige Liste mit Muster, Richtung und Ungültig-Marke. Die Leiste verliert „Welle 3“.',
  neu: [['e-home', 'Start']],
  spec: { aufbau: ['Frage, ein Satz, PRO', 'Heute anwendbar: Zahl, Balken, gut anwendbar', 'Suche', 'Saubere Zählung heute: Liste', 'Wellen in 3 Minuten'], komponenten: ['Listenzeile mit Urteil', 'C09'], daten: ['quant/data/technical-intelligence/v3/index.json.gz (elliottApplicable, elliott, structure, invalidation)', 'elliott-home.json wie heute, mit Leerzustand'], weg: ['Leiste „Welle 3“ → „Zählbar“', 'Grauer Kasten ohne Hinweis'] } });
slide({ id: 'EX03', title: 'Elliott auf der Aktie', route: '/elliott/#/NVDA', newRoute: '/aktie/NVDA?p=wellen', now: 'E02',
  sub: 'Zwei Fälle. Zählbar (SharkNinja): Lesart in drei Sätzen mit Ungültig-Marke, Kapitel für Wellen, Alternativen, Forschung. Nicht zählbar (NVIDIA, der Normalfall): ein klarer Satz und der Weg zur Chart-Lage in Technical, statt eines zweiten, abweichenden „Technischen Ausblicks“.',
  neu: [['e-stock', 'Zählbar: SharkNinja'], ['e-none', 'Nicht zählbar: NVIDIA']],
  spec: { aufbau: ['Aktienkopf + Perspektiven-Leiste', 'Zählbar: Muster, Urteil, Chart mit Ungültig-Zone, drei Sätze (Struktur · Grenze · Sicherheit), Kapitel', 'Nicht zählbar: Karte „keine Zählung“ mit Anteil, Link zu Technical, Liste zählbarer Aktien'], komponenten: ['Story-Karte, Kapitel'], daten: ['wie heute'], weg: ['„Technischer Ausblick“, „Zielbereich“, „Zone 1“, „Rücklauf abwarten“', 'Eigene Marktstruktur-Grafik (gehört zu Technical)'] } });

/* Hedgefonds */
chapter({ n: '02', title: 'Hedgefonds', icon: 'hedgefonds', anchor: 'kap-hedgefonds', was: 'Schon gut gebaut. Neu: <b>ein klarer Zeitbezug</b> oben, drei Sätze je Investor und Aktie, ein Datenfehler behoben.', pages: 'HX01–HX03' });
slide({ t: 'html', id: 'HX01', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 09.11.2026 auf 390 px: 7 Seiten von /hedgefonds/.', html: () => `<div class="facts">${[
  ['Apple fehlt', 'Start: Berkshire mit „Apple 22,0 %“. Auf der Seite von Warren Buffett fehlt Apple in den 29 Positionen; „Top 5 = 68,7 %“ ergibt nur mit Apple einen Sinn. Datenfehler in der Positionsliste.'],
  ['Q1 neben Q2', 'Oben „Meldungen für Q2 2026“, die Karte von Bill Ackman sagt „Stand Q1 2026“. Wann ein Depot so aussah, steht nicht überall.'],
  ['413 · 5.955', 'NVIDIA: „413 Fonds halten“ und weiter unten „Halter 5.955“ (alle 13F-Melder inkl. Banken). Zwei große Zahlen, ein Wort.'],
  ['„Smart Money“', 'Leistenplatz und Seite. WORTWAHL.md: „Was Profis kaufen“ lädt zum Nachmachen ein; besser „Gruppen-Käufe: viele Fonds, gleiche Aktie“.'],
  ['Rohe Namen', '„Builder Investment Group Inc /adv“, „Fisher Asset Management · 5,4 % Ant…“: Rohdaten aus der SEC ohne Aufbereitung.']].map(([a, b]) => `<div><b style="font-size:clamp(26px,3.2vw,44px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });
slide({ id: 'HX02', title: 'Hedgefonds · Start', route: '/hedgefonds/', now: 'H01',
  sub: 'Neu: drei Daten oben (gezeigt, gemeldet bis, nächste Meldungen), Stars als Schiene mit Foto, Käufe/Verkäufe/Meistgehalten als ein Reiter, Gruppen-Käufe statt „Smart Money“.',
  neu: [['h-home', 'Start']],
  spec: { aufbau: ['Quartalsband: Q2 2026 · Depots am 30.06. · gemeldet bis 14.08. · nächste 14.11.', 'Satz: Meldungen zeigen Vergangenheit', 'Suche', 'Star-Investoren (Schiene)', 'Gekauft · Verkauft · Meistgehalten', 'Gruppen-Käufe'], komponenten: ['Quartalsband', 'Investor-Karte', 'Balkenzeile'], daten: ['hedgefonds/data/* wie heute'], weg: ['Kacheln 788 · 64 · 14.11. → Quartalsband', '„Smart Money“'] } });
slide({ id: 'HX03', title: 'Investor und Aktie', route: '/hedgefonds/#/fonds/berkshire · #/aktie/NVDA', now: 'H05',
  sub: 'Investor: Kopf mit Foto, zwei Zahlen, „Das Quartal in drei Sätzen“, Top-Positionen mit Balken (mit Apple), Kapitel. Aktie: „Investoren in drei Sätzen“ (Fonds · Bewegung · Insider), Stars mit Foto, Kapitel für alle Fonds, Insider und alle 13F-Melder.',
  neu: [['h-investor', 'Warren Buffett'], ['h-stock', 'NVIDIA, Perspektive Investoren']],
  spec: { aufbau: ['Investor: Foto, Stil, Name, Depotwert mit Datum, Positionen, drei Sätze, Top 6, Kapitel', 'Aktie: drei Sätze, Stars (4), Kapitel'], komponenten: ['Story-Karte, Kapitel', 'Positionszeile mit Balken'], daten: ['wie heute; Positionsliste muss alle Positionen enthalten (Apple)'], weg: ['Lange Positionsliste auf der Hauptseite → Top 6 + „Alle 29“', 'Rohe Fondsnamen ohne Aufbereitung', 'Tabelle „Alle 13F-Melder“ → Kapitel'] } });

/* Vorsorge */
chapter({ n: '03', title: 'Vorsorge', icon: 'vorsorge', anchor: 'kap-vorsorge', was: 'Ein Weg in drei Schritten statt acht Bereichen. ETFs <b>ehrlich nach Handelbarkeit</b>: US-Fonds als Marktabbild, UCITS für den Kauf.', pages: 'VX01–VX03' });
slide({ t: 'html', id: 'VX01', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 09.11.2026 auf 390 px: 10 Seiten von /vorsorge/.', html: () => `<div class="facts">${[
  ['US-Fonds', 'Die „Kern-ETFs“ (URTH, SPY, EEM, QQQ, FEZ, IWM) sind US-Fonds. Die ETF-Seite schreibt selbst: „Für Privatanleger in der EU meist nicht direkt handelbar“. Im Kursbestand liegen 0 Börsenplätze in Europa; das EU-Register kennt ' + UC.register.toLocaleString('de-DE') + ' UCITS-Fonds (ohne Kurse).'],
  ['02.10.', 'ist der letzte ETF-Kurs. Der Rest der App steht auf dem 06.11.'],
  ['8 Bereiche', 'Start, Planer, ETFs, Portfolio, Vergleichen, Förderung, Veränderungen, Wissen. Dazu 3 Einstiege „Wo stehst du?“ und 4 Kacheln „Mehr in Vorsorge“.'],
  ['4 × „?“', 'Die ETF-Seite zeigt vier Kacheln mit großem schwarzem Fragezeichen, darüber Reiter und eine zweite Reihe „Mehr:“.'],
  ['Gut', 'Planer, Beispielrechnung mit drei Renditen und Förderung sind klar und ehrlich beschriftet. Sie bleiben.']].map(([a, b]) => `<div><b style="font-size:clamp(26px,3.2vw,44px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });
slide({ id: 'VX02', title: 'Vorsorge · Start', route: '/vorsorge/#/', now: 'V01',
  sub: 'Neu: ein Weg in drei Schritten (Ziel rechnen · Sparplan bauen · Auf Kurs bleiben), darunter der 10-Euro-Start, die Beispielrechnung, die Förderung und die großen Indizes mit klarem Hinweis, dass US-Fonds nur das Marktabbild sind.',
  neu: [['v-home', 'Start']],
  spec: { aufbau: ['Frage, Satz', 'Dein Weg in drei Schritten', '10-Euro-Start', 'Beispielrechnung 3 · 5 · 7 %', 'Förderung ab 2027', 'Die großen Indizes, Hinweis Marktabbild/UCITS'], komponenten: ['Weg-Karte (3 Schritte)'], daten: ['wie heute'], weg: ['„Wo stehst du?“ (3) und „Mehr in Vorsorge“ (4) → ein Weg', '„Kern-ETFs“ als US-Fonds ohne Hinweis'] } });
slide({ id: 'VX03', title: 'Ein ETF', route: '/vorsorge/#/etf/URTH', newRoute: '/vorsorge/#/index/msci-world', now: 'V09',
  sub: 'Neu: Die Seite gehört zum Index, nicht zum US-Fonds. Oben ein Satz, dann „In der EU kaufbar“ mit den UCITS-ETFs aus dem EU-Register, darunter der US-Fonds als Marktabbild mit Datum, vier Zahlen mit kleinem „?“, Kapitel.',
  neu: [['v-etf', 'MSCI World']],
  spec: { aufbau: ['Index-Name, Satz', 'In einem Satz', 'In der EU kaufbar: Anzahl UCITS-ETFs, Beispiele mit ISIN, Quelle, „keine Empfehlung“', 'Marktabbild: Chart des US-Fonds mit Datum', '4 Zahlen', 'Kapitel'], komponenten: ['Kennzahl-Kachel mit kleinem „?“', 'Kapitel'], daten: ['vorsorge/data/eu/etf-eu-ucits.json (ESMA)', 'vorsorge/data/series, holdings wie heute'], weg: ['Reiter + „Mehr:“-Chips → Kapitel', 'Große schwarze „?“'] } });

chapter({ n: '04', title: 'Umsetzung', icon: 'layers', anchor: 'umsetzung', was: 'Oberfläche, Wörter, ein Datenfehler. <b>Keine Modelle, keine neuen Daten.</b>', pages: 'U1' });
slide({ t: 'html', id: 'U1', title: 'Fahrplan und Entscheidungen', html: () => `<div class="plan" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[
  ['Elliott · 2 PRs', 'Wörter und Start; Aktie', 'Ziele/„abwarten“ raus, „Welle 3“ → „Zählbar“, Start mit Anteil und Liste, Leerzustand; Aktie zählbar/nicht zählbar, kein zweiter technischer Ausblick.'],
  ['Hedgefonds · 2 PRs', 'Datenfehler und Start; Investor und Aktie', 'Apple in der Positionsliste (Ursache im Leser oder Erzeuger finden, nie Daten von Hand), Quartalsband, „Gruppen-Käufe“, drei Sätze, Kapitel, Namen aufbereiten.'],
  ['Vorsorge · 2 PRs', 'Start und Weg; Index-Seite', 'Drei Schritte, Indizes mit Hinweis; Index-Seite mit UCITS aus dem EU-Register, US-Fonds als Marktabbild, Kapitel, kleine „?“.']].map(([a, b, c]) => `<div><span class="tag neu">${a}</span><b>${b}</b><p>${c}</p></div>`).join('')}</div>
<h3 style="margin-top:36px;font-size:22px;letter-spacing:-.02em">Von dir zu entscheiden</h3>
<ol class="dec">${[
  ['Elliott: Leistenplatz „Welle 3“ durch „Zählbar“ ersetzen?', 'Empfehlung: ja. Heute läuft bei keiner Aktie eine Welle 3.'],
  ['Elliott: eigenen „Technischen Ausblick“ entfernen und auf Technical verweisen?', 'Empfehlung: ja, damit es pro Aktie und Tag nur eine Chart-Aussage gibt.'],
  ['Hedgefonds: „Smart Money“ → „Gruppen-Käufe“?', 'Empfehlung: ja (WORTWAHL.md).'],
  ['Vorsorge: Seiten nach Index statt nach US-Fonds, UCITS aus dem EU-Register nennen?', 'Empfehlung: ja, mit „Beispiele, keine Empfehlung“ und Quelle. Konkrete Produktnamen in einem Vorsorge-Produkt berühren Recht; einmal kurz mit der Rechtsprüfung (docs/legal) abgleichen.'],
  ['Vorsorge: acht Bereiche zu drei Schritten bündeln?', 'Empfehlung: ja; Vergleichen, Förderung, Veränderungen und Wissen bleiben erreichbar, aber als Teil eines Schritts.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });
})();
