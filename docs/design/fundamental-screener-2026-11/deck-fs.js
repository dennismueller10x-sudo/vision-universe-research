/* Konzept Fundamental + Screener · „Verstehen und finden“, Stand 08.11.2026.
   Bausteine aus ../redesign-2027/lib.js (Kopie in lib/). Werte: window.FS aus data-fs.js (echt, Stand 06.11.2026);
   Kennzahlen der heutigen NVIDIA-Seite (LTM-Werte, Branchenvergleich) wie am 08.11.2026 auf /fundamental/ abgelesen. */
(function () {
'use strict';
const { screen, slide, chapter, ic, hud, chart, help, vd, bars, pill } = VU;
const ST = FS.stocks, SER = FS.series, NV = FS.nvda;
const ASOF = 'Fr. 06.11.';
const src = p => (window.__IMG && window.__IMG[p]) || p;
const de = (v, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v * 100), d) + ' %';
const nm = s => String(s || '').replace(/,?\s+(Inc\.?|Corp(oration)?\.?|Holdings?|Ltd\.?|Co\.?|Class [A-Z]|plc)$/i, '').replace(/,?\s+(Inc\.?|Corporation)$/i, '');
const big = v => v >= 1e12 ? de(v / 1e12, 2) + ' Bio. $' : v >= 1e9 ? de(v / 1e9, v >= 1e11 ? 0 : 1) + ' Mrd. $' : de(v / 1e6, 0) + ' Mio. $';
const fmt = n => n.toLocaleString('de-DE');

/* ---------- Bausteine ---------- */
const logo = (t, s = 36) => `<span class="lgx" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .28)}px"><b style="font-size:${Math.max(8.5, s * .25)}px">${t}</b><img src="${src('img/logos/' + t + '.png')}" alt="" onerror="this.remove()"></span>`;
const pillv = (txt, up) => `<span class="chg ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${String(txt).replace(/^[+−]/, '')}</span>`;
const railHead = (t, cnt, s, tag) => `<div class="rh"><div class="rh-t"><b>${t}</b>${tag ? `<span class="rh-tag">${tag}</span>` : ''}<a>${cnt ? 'Alle ' + cnt : 'Alle'} ${ic('i-next', 13)}</a></div>${s ? `<p>${s}</p>` : ''}</div>`;
const rail = items => `<div class="rail">${items.join('')}</div>`;
const search = t => VU.search(t);
const sp = (t, w = 64, h = 24) => SER[t] ? chart(SER[t], { w, h, grid: false, base: false }) : '<span></span>';
const CK = FS.checks;
const ckCard = (id, w = 250) => { const c = CK[id]; return `<div class="ckc" style="width:${w}px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><span class="ltag">Checkliste</span><b>${c.name}</b></div><span class="ckn"><b class="num">${c.items.length}</b><small>Punkte</small></span></div><p class="xs mu" style="margin-top:6px">${c.items.slice(0, 3).join(' · ')} …</p><div style="display:flex;align-items:center;gap:4px;margin-top:10px">${c.hits.slice(0, 5).map(t => logo(t, 24)).join('')}<span class="xs b" style="margin-left:auto">${fmt(c.full)} erfüllen alle</span></div></div>`; };
const ckRow = (id) => { const c = CK[id], k = c.nvda.filter(Boolean).length, all = k === c.items.length; return `<div class="ckr"><span class="ckr-r${all ? ' on' : ''}"><b class="num">${k}</b>/${c.items.length}</span><div><b>${c.name}</b><span>${all ? 'Alle Punkte erfüllt' : `${k} von ${c.items.length} Punkten erfüllt`}</span></div><div class="ckr-d">${c.nvda.map(x => `<i class="${x ? 'on' : ''}"></i>`).join('')}</div>${ic('i-next', 15)}</div>`; };
const stat = (l, v, s) => `<div class="kt"><small>${l}</small><b class="num">${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
const hitRow = (t, mk, lab) => { const s = ST[t]; return `<div class="hr">${logo(t, 38)}<div style="min-width:0"><b>${nm(s.n)}</b><span>${s.was || t}</span></div><div class="hr-r">${mk}<small>${lab}</small></div></div>`; };

/* ======================================================================
   Fundamental · Start
   ====================================================================== */
const WF = [['ALAB', '+120,2 %'], ['MU', '+104,7 %'], ['NVDA', '+100,1 %']]; /* Rangliste Wachstumsführer ab 10 Mrd. $, Seite vom 08.11.2026 */
screen('f-home', { world: 'fundamental', dock: 0, h: 1420, body: `<div class="ltag">Fundamental · Zahlen bis 03.11.</div><div class="lt" style="margin-top:4px">Wie gut ist<br>das Geschäft?</div><p class="mu" style="margin-top:8px;font-size:15px">Umsatz, Gewinn und Cashflow von ${fmt(FS.n)} US-Firmen, aus den Pflichtmeldungen an die SEC.</p>
<div style="margin-top:14px">${search('Firma oder Kürzel, z. B. NVIDIA')}</div>
<div class="chips" style="margin-top:10px">${['NVDA', 'AAPL', 'MSFT', 'PLTR'].map(t => `<span class="chip" style="gap:8px">${logo(t, 20)}${t}</span>`).join('')}</div>
${railHead('Checklisten', 3, 'Mehrere Bedingungen auf einmal, jede mit Haken. Wie eine Prüfliste.', 'NEU')}
${rail(['qualitaet', 'wachstum', 'bewertung'].map(id => ckCard(id)))}
${railHead('Ranglisten', 6, 'Eine Kennzahl, sortiert. Größe wählbar.')}
${rail([['Wachstumsführer', 'Umsatz pro Jahr über 3 Jahre', WF], ['Profitable Unternehmen', 'Höchste Kapitalrendite (ROIC)', null], ['Cashflow-Stärke', 'Höchste Free-Cashflow-Rendite', null]].map(([t, s, top]) => `<div class="rlc"><b>${t}</b><span class="xs mu">${s}</span>${top ? `<div style="margin-top:10px">${top.map(([x, v], i) => `<div class="rlr"><b class="num mu">${i + 1}</b>${logo(x, 26)}<span>${nm(ST[x].n)}</span>${pillv(v, 1)}</div>`).join('')}</div>` : `<div class="rlph">${[1, 2, 3].map(i => `<i></i>`).join('')}</div>`}</div>`))}
${railHead('Zahlen lesen in 30 Sekunden', '', '')}
${rail([['Umsatz', 'Was die Firma verkauft.', '216 Mrd. $', 'NVIDIA, GJ 2026'], ['Nettogewinn', 'Was nach allen Kosten und Steuern bleibt.', '120 Mrd. $', 'NVIDIA, GJ 2026'], ['Free Cashflow', 'Echtes Geld nach Investitionen.', '96,7 Mrd. $', 'NVIDIA, GJ 2026'], ['KGV', 'Wie viele Jahresgewinne der Börsenwert kostet.', '23,6', 'NVIDIA, heute']].map(([a, b, c, d], i) => `<div class="lern"><span class="stepn">${i + 1}</span><b>${a}</b><p>${b}</p><div class="lern-v"><b class="num">${c}</b><small>${d}</small></div></div>`))}
<div class="card" style="margin-top:22px;padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('i-grid', 20)}</span><div style="flex:1"><b style="display:block">Branchen im Vergleich</b><span class="sm mu">Nettomarge, Wachstum und Bewertung je Branche</span></div>${ic('i-next', 18)}</div>
<div class="card" style="margin-top:10px;padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('screener', 20)}</span><div style="flex:1"><b style="display:block">Selbst filtern</b><span class="sm mu">Im Screener nach eigenen Bedingungen</span></div>${ic('i-next', 18)}</div>
<p class="xs mu" style="margin-top:16px">Zahlen aus den Pflichtmeldungen der Unternehmen (SEC). Keine Empfehlung.</p>` });

/* ======================================================================
   Fundamental · Aktie (Perspektive „Zahlen“)
   ====================================================================== */
const N = ST.NVDA;
const head = (p = 'Zahlen') => VU.STOCK(p, { s: { t: 'NVDA', name: 'NVIDIA', what: 'Chips für KI und Grafik', p: N.price, d: N.chg1d * 100, eur: '167,17 €', date: ASOF } }).replace('<span class="lg">NVDA</span>', logo('NVDA', 42));
const KST = [['Börsenwert', '4,54 Bio. $', 'heute'], ['Umsatz', '303 Mrd. $', '12 Monate'], ['KGV', '23,6', 'Markt 20,6'], ['Nettomarge', '63,7 %', '12 Monate'], ['Free Cashflow', '127 Mrd. $', '12 Monate'], ['Kapitalrendite', '71,3 %', 'ROIC, GJ 2026']];
const revBars = (key, h = 120, w = 352) => bars(NV[key].slice(-12).map(([fy, v]) => [String(fy), v / 1e9]), { w, h });
const CHAP = [['Bilanz und Schulden', 'Mehr Kasse als Schulden', 'i-shapes'], ['Cashflow', 'Free Cashflow 96,7 Mrd. $ (GJ 2026)', 'i-wave'], ['Bewertung', 'KGV 23,6 · Branche 30,1 · Markt 20,6', 'i-target'], ['In der Branche', 'Elektronik und Halbleiter · höchster Umsatz der Gruppe', 'i-grid'], ['Analysten', `${NV.analysts.strongBuy + NV.analysts.buy} von ${NV.analysts.strongBuy + NV.analysts.buy + NV.analysts.hold + NV.analysts.sell} positiv · Angabe Dritter`, 'i-person'], ['Dividende', 'Dividende je Aktie und Verlauf', 'i-pie'], ['Alle 60 Kennzahlen', 'Suchen, Verlauf, Branchenvergleich', 'i-list'], ['Quellen', 'SEC-Meldungen je Wert', 'i-book']];
const ep = (c, i) => `<div class="ep"><b class="ep-n">${i + 1}</b><span class="hud" style="width:40px;height:40px;border-radius:12px">${ic(c[2], 19)}</span><div class="ep-t"><b>${c[0]}</b><span>${c[1]}</span></div><span class="ep-c">${ic('i-next', 15)}</span></div>`;
screen('f-stock', { world: 'fundamental', dock: 0, hdr: false, h: 1800, body: `${head()}
<div class="story" style="margin-top:14px;padding-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center"><span class="ltag" style="color:#9b9b9b">Das Geschäft in einem Satz</span>${vd('s', 'Sehr stark')}</div><p style="font-size:20px;font-weight:900;letter-spacing:-.03em;line-height:1.15;margin-top:8px">Wächst stark und verdient sehr gut.</p><p class="sm" style="color:#bdbdbd;margin-top:6px">Umsatz +83 % in 12 Monaten · von 100 $ Umsatz bleiben 63,70 $ Gewinn.</p></div>
<div class="kts">${KST.map(([a, b, c]) => stat(a, b, c)).join('')}</div>
<div class="card" style="margin-top:12px;padding:14px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:17px">Finanzen</b><span class="xs mu b">GJ 2015–2026 · SEC</span></div>
<div class="seg" style="margin-top:10px"><span class="on">Umsatz</span><span>Gewinn</span><span>Cashflow</span><span>Marge</span></div>
<div style="display:flex;align-items:flex-end;gap:10px;margin-top:12px"><b class="num" style="font-size:26px;letter-spacing:-.04em">216 Mrd. $</b><span class="sm mu b">GJ 2026</span>${pillv('+65,5 %', 1)}</div>
<div style="margin-top:8px">${revBars('revenue', 110, 322)}</div>
<div style="display:flex;gap:6px;margin-top:6px"><span class="chip on" style="height:30px;font-size:12.5px">Jahre</span><span class="chip" style="height:30px;font-size:12.5px">Quartale</span><span class="chip" style="height:30px;font-size:12.5px;margin-left:auto">${ic('i-plus', 14)}Vergleichen</span></div></div>
${railHead('Checklisten', '', 'Tipp zeigt jede Bedingung mit Wert.', 'NEU')}
<div class="card" style="padding:2px 14px">${['qualitaet', 'wachstum', 'bewertung'].map(ckRow).join('')}</div>
${railHead('Kapitel', '', '')}
<div class="eps ep2">${CHAP.map(ep).join('')}</div>
<p class="xs mu" style="margin-top:16px">Zahlen aus den Pflichtmeldungen (SEC), Stand 03.11.2026. Analysten: Angabe Dritter (Finnhub, ${NV.analystsAsOf.split('-').reverse().join('.')}). Keine Empfehlung.</p>` });

/* Checkliste als Sheet */
const QV = ['+100 % p. a.', '55,6 %', '44,8 %', '71,3 %', '2,1 Mrd. $ netto', '86 %', '+44,7 Pp.', '+207 % p. a.'];
screen('f-check', { world: 'fundamental', dock: 0, hdr: false, body: `${head()}`, overlay: `<div class="ovl"></div><div class="sheet" style="top:150px"><div class="grab"></div><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><span class="ltag">Checkliste · NVIDIA</span><div class="mt" style="margin-top:2px">Qualität</div></div><span class="ckr-r on" style="width:58px;height:58px;font-size:15px"><b class="num" style="font-size:24px">8</b>/8</span></div>
<div style="margin-top:10px">${CK.qualitaet.items.map((t, i) => `<div class="cnd" style="margin-top:9px"><span class="cnd-i${CK.qualitaet.nvda[i] ? ' ok' : ''}">${ic(CK.qualitaet.nvda[i] ? 'i-check' : 'i-x', 12)}</span><span>${t}</span><b class="num">${QV[i]}</b></div>`).join('')}</div>
<div class="card" style="margin-top:14px;padding:12px 14px;display:flex;align-items:center;gap:10px"><div style="flex:1"><b>${CK.qualitaet.full} von ${fmt(FS.n)} Aktien</b><span class="xs mu" style="display:block">erfüllen heute alle 8 Punkte</span></div><span class="btn ink" style="height:40px;font-size:13.5px;padding:0 14px">Im Screener</span></div>
<div style="margin-top:10px">${help('Eine Checkliste beschreibt, welche Bedingungen erfüllt sind. Sie sagt nichts über den künftigen Kurs.')}</div></div>` });

/* Kennzahl-Detail Umsatz */
const PEER = [['NVDA', 303], ['MU', 133], ['AVGO', 89.1], ['INTC', 59.9], ['GE', 52.6], ['AMD', 41.3]];
screen('f-metric', { world: 'fundamental', dock: 0, hdr: false, h: 1420, body: `<div style="display:flex;align-items:center;gap:10px"><span class="hb">${ic('i-back', 18)}</span><span class="sm b mu">NVIDIA · Kennzahl</span><span class="hb" style="margin-left:auto">${ic('i-share', 17)}</span></div>
<div class="lt" style="margin-top:12px">Umsatz</div><p class="mu sm" style="margin-top:2px">Erlöse aus dem Verkauf von Waren und Dienstleistungen.</p>
<div style="display:flex;align-items:baseline;gap:10px;margin-top:12px"><b class="num" style="font-size:38px;letter-spacing:-.05em">303 Mrd. $</b><span class="sm mu b">letzte 12 Monate</span></div>
<div class="seg" style="margin-top:12px"><span>3 J</span><span>5 J</span><span class="on">10 J</span><span>Max</span><span>Quartale</span></div>
<div class="card" style="margin-top:10px;padding:12px">${revBars('revenue', 150, 330)}<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><span class="chip on" style="height:30px;font-size:12.5px">NVDA</span><span class="chip" style="height:30px;font-size:12.5px">${ic('i-plus', 14)}AMD</span><span class="chip" style="height:30px;font-size:12.5px">${ic('i-plus', 14)}AVGO</span><span class="chip" style="height:30px;font-size:12.5px">${ic('i-plus', 14)}Firma</span></div></div>
<div class="grid3" style="margin-top:10px;gap:8px">${[['3 J p. a.', '+100,0 %'], ['5 J p. a.', '+66,9 %'], ['10 J p. a.', '+45,7 %']].map(([a, b]) => `<div class="kt" style="width:auto"><small>${a}</small><b class="num">${b}</b></div>`).join('')}</div>
<div class="st">Im Branchenvergleich<a>223 Firmen</a></div>
<div class="card" style="padding:12px 14px">${PEER.map(([t, v]) => `<div class="pbr"><span class="pbr-l">${logo(t, 22)}<b>${t}</b></span><span class="pbr-b"><i class="${t === 'NVDA' ? 'hi' : ''}" style="width:${v / 303 * 100}%"></i></span><b class="num">${de(v, v >= 100 ? 0 : 1)} Mrd. $</b></div>`).join('')}<p class="xs mu" style="margin-top:8px">Median der Branche: 468 Mio. $. NVIDIA hat den höchsten Wert der Gruppe.</p></div>
<div class="st">Werte je Geschäftsjahr<a>Meldung je Wert</a></div>
<div class="card" style="padding:2px 14px">${NV.revenue.slice(-5).reverse().map(([fy, v], i, a) => { const prev = NV.revenue[NV.revenue.length - 2 - i]; const g = prev ? v / prev[1] - 1 : 0; return `<div class="kv"><span class="sm b">GJ ${fy}</span><span style="display:flex;gap:10px;align-items:center"><b class="num">${big(v)}</b>${pillv(pct(g, 1), g >= 0)}</span></div>`; }).join('')}</div>
<div style="margin-top:10px">${help('Umsatz: gemeldeter Wert aus den Geschäftsberichten, keine Schätzung. GJ endet bei NVIDIA im Januar.')}</div>` });

/* ======================================================================
   Screener
   ====================================================================== */
const SATZ = [['stark wachsen', 'Umsatz über +20 %', FS.gt[20]], ['gut verdienen', 'Nettomarge über 15 %', 689], ['günstig sind', 'KGV unter 20', 952], ['im Aufwärtstrend sind', 'über der 200-Tage-Linie', 1844], ['mehr Geld als Schulden haben', 'Nettokasse', 320]];
screen('s-home', { world: 'screener', dock: 0, h: 1320, body: `<div class="ltag">Screener · ${fmt(FS.n)} US-Aktien · Stand ${ASOF}</div><div class="lt" style="margin-top:4px">Was suchst du?</div><p class="mu" style="margin-top:8px;font-size:15px">Sag in einem Satz, was dir wichtig ist. Die Trefferzahl siehst du sofort.</p>
<div class="satz"><span class="ltag" style="color:#9b9b9b">Dein Satz</span><p>Zeig mir Aktien, die <span class="satz-gap">…</span></p><div class="satz-c">${SATZ.map(([a, b, c]) => `<span class="satz-o"><b>${a}</b><small>${fmt(c)}</small></span>`).join('')}</div></div>
${railHead('Fertige Ideen', 8, 'Bewährte Muster als feste Regeln, jederzeit anpassbar.')}
${rail([['Checkliste Qualität', '8 Punkte, alle erfüllt', CK.qualitaet.full, CK.qualitaet.hits], ['Wachstum zum fairen Preis', 'PEG ≤ 1,5, Umsatz 3 J ≥ 10 % p. a., Gewinn', FS.peg.full, FS.peg.hits.filter(t => t !== 'GOOG')], ['Checkliste Wachstum', '6 Punkte, alle erfüllt', CK.wachstum.full, CK.wachstum.hits], ['Niedrige Bewertung', '5 Bewertungs-Punkte erfüllt', CK.bewertung.full, CK.bewertung.hits]].map(([a, b, c, h]) => `<div class="idc"><b>${a}</b><span class="xs mu">${b}</span><div style="display:flex;gap:4px;margin-top:10px">${h.slice(0, 4).map(t => logo(t, 24)).join('')}</div><div class="idc-n"><b class="num">${fmt(c)}</b><small>Treffer</small></div></div>`))}
${railHead('Nach Perspektive', '', 'Dieselben Blickwinkel wie auf jeder Aktienseite.')}
<div class="pgrid">${[['i-globe', 'Basis', 15], ['fundamental', 'Zahlen', 37], ['quant', 'Faktoren', 11], ['technical', 'Chart', 41], ['supertrader', 'Methoden', 9], ['hedgefonds', 'Investoren', 7]].map(([i, l, c]) => `<div><span class="hud" style="width:36px;height:36px">${ic(i, 18)}</span><b>${l}</b><small>${c} Kriterien</small></div>`).join('')}</div>
${railHead('Deine Screens', '', '')}
<div class="card" style="padding:14px;display:flex;gap:12px;align-items:center"><span class="hb" style="background:var(--a-bg)">${ic('i-bookmark', 18)}</span><div style="flex:1"><b class="sm" style="display:block">Noch kein gespeicherter Screen</b><span class="xs mu">Gespeichert sieht man beim nächsten Besuch, was neu dazukam.</span></div></div>
<p class="xs mu" style="margin-top:16px">Filter beschreiben Kennzahlen. Kein Anlageurteil, keine Kaufempfehlung.</p>` });

/* Filter-Sheet mit Verteilung */
const H = FS.hist, HM = Math.max(...H.slice(0, 19));
const histo = () => { const w = 330, h = 90, bw = w / 20; return `<svg width="${w}" height="${h + 16}" aria-hidden="true" style="display:block">${H.map((v, i) => { const bh = Math.max(2, Math.min(v, HM) / HM * h); const on = i >= 7; return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${on ? '#c8f531' : 'var(--a-line)'}"${on ? ' stroke="var(--a-ink)" stroke-width="1"' : ''}/>`; }).join('')}<line x1="${7 * bw}" x2="${7 * bw}" y1="0" y2="${h}" stroke="var(--a-ink)" stroke-width="2.5"/>${[['−50 %', 0], ['0 %', 5], ['+50 %', 10], ['+100 %', 15], ['+150 %', 19.5]].map(([t, i]) => `<text x="${i * bw}" y="${h + 13}" font-size="10" fill="var(--a-mute)" font-family="Inter,sans-serif" text-anchor="${i === 0 ? 'start' : i > 19 ? 'end' : 'middle'}">${t}</text>`).join('')}</svg>`; };
screen('s-filter', { world: 'screener', dock: 1, body: `<div class="satz" style="margin-top:0"><p>Zeig mir Aktien, die <span class="satz-gap on">stark wachsen</span></p></div>`, overlay: `<div class="ovl"></div><div class="sheet" style="top:232px"><div class="grab"></div><div style="display:flex;justify-content:space-between;align-items:baseline"><div><span class="ltag">Zahlen · Wachstum</span><div class="mt" style="margin-top:2px">Umsatzwachstum</div></div><span class="sm mu b">12 Monate</span></div>
<div style="display:flex;align-items:baseline;gap:8px;margin-top:12px"><span class="sm b">über</span><b class="num" style="font-size:34px;letter-spacing:-.05em">+20 %</b></div>
<div style="margin-top:8px">${histo()}</div>
<div class="sld"><i style="left:${7 / 20 * 100}%"></i><em style="left:${7 / 20 * 100}%"></em></div>
<div class="chips" style="margin-top:12px;flex-wrap:wrap;white-space:normal;gap:6px">${[0, 10, 20, 30, 50].map(t => `<span class="chip${t === 20 ? ' on' : ''}" style="height:32px;font-size:12.5px">über ${t} % <span style="opacity:.6;margin-left:4px">${fmt(FS.gt[t])}</span></span>`).join('')}</div>
<div style="margin-top:12px">${help('Jede Säule: wie viele der 5.354 Aktien so stark gewachsen sind. Neongrün: deine Auswahl.')}</div>
<div class="btn" style="margin-top:14px;height:52px">${fmt(FS.gt[20])} Treffer zeigen</div></div>` });

/* Treffer */
const HITS = FS.hits20.filter(t => t !== 'GOOG').slice(0, 9);
screen('s-results', { world: 'screener', dock: 2, h: 1080, body: `<div class="satz" style="margin-top:0;padding-bottom:12px"><p>Zeig mir Aktien, die <span class="satz-gap on">stark wachsen</span><span class="satz-plus">${ic('i-plus', 16)}</span></p><div style="display:flex;align-items:baseline;gap:8px;margin-top:10px"><b class="num" style="font-size:34px;letter-spacing:-.05em;color:var(--lime)">${fmt(FS.gt[20])}</b><span class="sm" style="color:#bdbdbd">von ${fmt(FS.n)} Aktien</span></div></div>
<div style="display:flex;gap:6px;margin-top:10px;align-items:center"><span class="chip lm" style="height:32px;font-size:12.5px">Umsatz über +20 % ${ic('i-x', 13)}</span><span class="chip" style="height:32px;font-size:12.5px">${ic('i-plus', 13)}Filter</span><span class="seg" style="margin-left:auto;padding:3px"><span class="on" style="padding:5px 9px">${ic('i-list', 15)}</span><span style="padding:5px 9px">${ic('i-grid', 15)}</span></span></div>
<div class="st" style="margin-top:14px">Nach Börsenwert<a>${ic('i-filter', 14)} Sortieren</a></div>
<div>${HITS.map(t => hitRow(t, pillv(pct(ST[t].revGrowth), 1), 'Umsatz')).join('')}</div>
<div class="btn line" style="margin-top:12px;height:46px;font-size:14.5px">Weitere 25 laden</div>
<div class="grid2" style="margin-top:8px"><span class="btn ink" style="height:46px;font-size:14px">${ic('i-bookmark', 17)}Screen speichern</span><span class="btn line" style="height:46px;font-size:14px">${ic('i-swipe', 17)}Treffer swipen</span></div>` });

/* Treffer antippen: Vorschau */
const P = ST.NVDA;
screen('s-peek', { world: 'screener', dock: 2, body: `<div class="satz" style="margin-top:0"><p>Zeig mir Aktien, die <span class="satz-gap on">stark wachsen</span></p></div><div style="margin-top:10px">${HITS.slice(0, 4).map(t => hitRow(t, pillv(pct(ST[t].revGrowth), 1), 'Umsatz')).join('')}</div>`,
  overlay: `<div class="ovl"></div><div class="sheet" style="top:250px"><div class="grab"></div><div style="display:flex;align-items:center;gap:12px">${logo('NVDA', 48)}<div style="flex:1"><b style="display:block;font-size:20px;letter-spacing:-.03em">NVIDIA</b><span class="mu xs b">NVDA · ${P.was}</span></div><div style="text-align:right"><b class="num" style="font-size:18px">${de(P.price, 2)} $</b><div>${pillv(pct(P.chg1d, 2), P.chg1d >= 0)}</div></div></div>
<div class="card lime" style="margin-top:12px;padding:12px 14px"><span class="ltag" style="color:#000;opacity:.6">Erfüllt deinen Filter</span><div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><b>Umsatz ${pct(P.revGrowth)}</b><span class="sm b">gesucht: über +20 %</span></div></div>
<div style="margin-top:10px">${chart(SER.NVDA, { w: 354, h: 90, axis: ['06.11.25', '06.11.26'] })}</div>
<div class="kts" style="margin-top:10px">${stat('Börsenwert', big(P.mcap), '')}${stat('KGV', de(P.pe, 1), '')}${stat('Nettomarge', de(P.netMargin * 100, 1) + ' %', 'GJ')}</div>
<div class="grid2" style="margin-top:12px;grid-template-columns:1fr auto auto"><span class="btn ink" style="height:48px;font-size:15px">Aktie öffnen</span><span class="hb" style="width:48px;height:48px">${ic('i-heart', 20)}</span><span class="hb" style="width:48px;height:48px">${ic('i-next', 20)}</span></div></div>` });

/* ======================================================================
   Folien
   ====================================================================== */
slide({ t: 'html', anchor: 'cover', dark: 1, html: () => `<div class="covergrid"><div><img src="${src('img/vision-universe-logo-web.png')}" alt="Vision Universe" style="height:20px;filter:invert(1);margin-bottom:36px"><div style="font-size:clamp(46px,7vw,100px);font-weight:900;letter-spacing:-.06em;line-height:.9">Fundamental<br>und Screener.<br><span style="color:var(--lime)">Verstehen.<br>Finden.</span></div><p style="margin-top:22px;color:#a6a6a6;font-size:clamp(16px,1.5vw,20px);font-weight:500;max-width:46ch">Konzept für die beiden Zahlen-Produkte: so viel Tiefe wie die großen Analyse- und Screening-Seiten, so leicht wie eine Neo-Broker-App, im Design von Vision Universe. Echte Werte vom 06.11.2026.</p><div class="toc" id="toc" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:28px"></div></div><div class="coverphones"><div data-frame="f-stock"></div><div data-frame="s-filter"></div></div></div>` });

const Y = '<i class="dot yes" title="vorhanden"></i>', O = '<span class="mu">–</span>', H2 = '<i class="dot half" title="teilweise"></i>';
slide({ t: 'html', id: 'K1', title: 'Was die Großen bieten, was wir daraus machen', sub: 'Abgleich mit aktien.guide, fiscal.ai, TraderFox und der Bedienung einer Neo-Broker-App. Schwarzer Punkt: vorhanden · halber Punkt: teilweise · Strich: fehlt. TraderFox am 08.11.2026 auf der Startseite gelesen; aktien.guide und fiscal.ai haben den automatischen Abruf blockiert, dort nach allgemeiner Produktkenntnis.', html: () => `<div class="xscroll"><table class="tbl cmpt"><thead><tr><th>Funktion</th><th>aktien.guide</th><th>fiscal.ai</th><th>TraderFox</th><th>VU heute</th><th>VU neu</th></tr></thead><tbody>${[
  ['Bewertungs- und Qualitäts-Scores als Prüfliste', Y, O, Y, O, 'Checklisten mit Haken je Bedingung'],
  ['Finanzen über 10+ Jahre, Jahre und Quartale', Y, Y, Y, Y, 'ein Chart mit Umschalter'],
  ['Mehrere Firmen in einem Chart vergleichen', H2, Y, H2, H2, '„+ Vergleichen“ in jeder Kennzahl'],
  ['Branchenvergleich je Kennzahl', H2, H2, O, Y, 'bleibt, kompakter'],
  ['Segmente und Firmen-KPIs (z. B. Umsatz je Sparte)', O, Y, O, O, 'nicht in den Daten, ehrlich benannt'],
  ['Analysten-Einstufungen', Y, Y, Y, Y, 'als Kapitel, Angabe Dritter'],
  ['Dividende', Y, Y, Y, Y, 'als Kapitel'],
  ['Screener mit fertigen Vorlagen', Y, Y, Y, Y, 'Fertige Ideen inkl. Checklisten'],
  ['Filter mit Verteilung und Live-Trefferzahl', O, H2, H2, H2, 'Regler über Verteilung, Zahl sofort'],
  ['Ranglisten mit eigenen Gewichten', O, O, Y, O, 'später, siehe Entscheidungen'],
  ['Gespeicherte Screens mit „neu seit gestern“', H2, Y, Y, Y, 'bleibt, sichtbarer'],
  ['KI-Fragen zur Firma', O, Y, O, Y, 'Atlas oben rechts (vorhanden)'],
  ['Eine Suche, einfache Aktienseite, Sheets statt Seitenwechsel', H2, H2, O, H2, 'Grundprinzip (Folie K3)']].map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td></tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'K2', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 08.11.2026 auf 390 px: 13 Seiten von /fundamental/ und 5 von /screener/ (lokal mit den Daten vom 06.11.; die volle Fundamental-Historie lag lokal nicht vor, darum sind einzelne Charts in den Aufnahmen leer).', html: () => `<div class="facts">${[
  ['3 Screener', 'Quant (#/screener), Technical (#/screener) und /screener/, dazu Ranglisten in Fundamental. Für Nutzer ist unklar, welcher wofür ist.'],
  ['Wortwahl', '„Finde Aktien, die zu dir passen“ und „Warum passt NVIDIA?“ (WORTWAHL.md: kein „passt zu dir“; erlaubt „erfüllt deinen Filter“). Rangliste „Interessante Bewertungen“ wertet.'],
  ['11.052 px', 'ist die Trefferliste „Wachsen stark“ (1.007 Treffer) lang. Jede Zeile hat vier Zahlen, Spaltennamen sind abgeschnitten („EPS-…“).'],
  ['Gleiches Wort, andere Regel', 'Fertige Idee „Verdienen Geld“ = Gewinnmarge über 0 % (2.140). Im Satz „gut verdienen“ = über 15 % (689).'],
  ['8 × „?“', 'Die Fundamental-Aktie zeigt acht gleich große Kacheln, jede mit großem schwarzem Fragezeichen. Darüber zwei Leisten übereinander.'],
  ['0 Checklisten', 'Was aktien.guide und TraderFox groß macht (Prüflisten mit Punkten), fehlt. Die Daten dafür liegen schon im Screener.']].map(([a, b]) => `<div><b style="font-size:clamp(28px,3.4vw,46px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });

slide({ t: 'html', id: 'K3', title: 'So soll es sich anfühlen', sub: 'Die Leichtigkeit einer Neo-Broker-App, übertragen auf Analyse. Sieben Regeln für beide Produkte.', html: () => `<ol class="rules7">${['Eine Suche oben, überall. Firma tippen, fertig.', 'Ein Satz zuerst, dann die Zahlen. Jede Seite beginnt mit der Aussage.', 'Sheets statt Seitenwechsel: Checkliste, Filter, Vorschau öffnen sich von unten.', 'Antwort sofort: Trefferzahl ändert sich beim Schieben, nicht nach „Anwenden“.', 'Eine Hauptaktion je Bildschirm, groß und unten.', 'Große Zahl, kleine Erklärung. Das „?“ steht am Rand, nicht als schwarzer Knopf auf jeder Kachel.', 'Nichts springt: Platzhalter beim Laden, Listen in 25er-Schritten.'].map(x => `<li>${x}</li>`).join('')}</ol>` });

chapter({ n: '01', title: 'Fundamental: verstehen', icon: 'fundamental', anchor: 'kap-fundamental', was: 'Ein Satz zum Geschäft, sechs Zahlen im Streifen, <b>ein Finanz-Chart</b>, Checklisten und Kapitel.', pages: 'FX01–FX03' });
slide({ id: 'FX01', title: 'Fundamental · Start', route: '/fundamental/', now: 'F01',
  sub: 'Heute: ein NVIDIA-Beispiel, Ranglisten als Liste, Lernliste, drei Discover-Chips, drei Zahlenkacheln. Neu: Suche mit Lieblingsfirmen, Checklisten und Ranglisten als Schienen mit den ersten Plätzen, „Zahlen lesen“ als wischbare Karten.',
  neu: [['f-home', 'Ganze Seite']],
  spec: { aufbau: ['Kopf: Frage, ein Satz, Suche, vier Firmen-Chips mit Logo', 'Checklisten (NEU): Qualität, Wachstum, Bewertung mit Trefferzahl und Logos', 'Ranglisten als Schiene, erste drei Plätze sichtbar', 'Zahlen lesen in 30 Sekunden als Karten mit Beispielwert', 'Branchen, Selbst filtern (→ Screener), Hinweis'],
    komponenten: ['Schiene, Schienen-Kopf (aus Discover)', 'Neu: Checklisten-Karte, Ranglisten-Karte, Lernkarte'],
    daten: ['screener/data/universe-US_REAL.json (Checklisten, Ranglisten)', 'discover/data/stocks/US_REAL/{T}.json'],
    weg: ['„Beispiel: NVIDIA in 4 Zahlen“ → Lernkarten', 'Discover-Auswahlen auf der Fundamental-Startseite', 'Drei Zahlenkacheln (60 · 12 J. · Berichte)'] } });
slide({ id: 'FX02', title: 'NVIDIA, Perspektive „Zahlen“', route: '/fundamental/#/NVDA', newRoute: '/aktie/NVDA?p=zahlen', now: 'F05',
  sub: 'Heute: zwei Leisten, acht Kacheln mit großem „?“, Umsatz-Chart, Entwicklung, Branche, Knopfwolke „Mehr“. Neu wie in Discover und Quant: ein Satz, ein Streifen mit sechs Zahlen, ein Finanz-Chart mit Umschalter, drei Checklisten, Kapitel. Die Checkliste öffnet sich als Sheet.',
  neu: [['f-stock', 'Ganze Seite'], ['f-check', 'Checkliste Qualität (Sheet)']],
  spec: { aufbau: ['Aktienkopf + Perspektiven-Leiste, keine zweite Leiste (Überblick · Kennzahlen · Branche · Finanzen entfällt)', 'Das Geschäft in einem Satz (schwarz) mit Urteil', 'Kennzahlen-Streifen: 6 Zahlen, seitlich wischbar, Tipp → Kennzahl', 'Finanzen: Umsatz · Gewinn · Cashflow · Marge, Jahre/Quartale, „+ Vergleichen“', 'Checklisten: Punkte je Liste, Tipp → Sheet mit Bedingung und Wert', 'Kapitel: Bilanz, Cashflow, Bewertung, Branche, Analysten (Angabe Dritter), Dividende, Alle 60 Kennzahlen, Quellen'],
    komponenten: ['Story-Karte, Kapitelzeile (aus Discover)', 'Neu: Kennzahlen-Streifen, Checklisten-Zeile und -Sheet', 'C06-Balken, C14 Reiter, C16 Sheet'],
    daten: ['fundamental/data/history/{Shard}.json.gz und discover/data/stocks (wie heute)', 'Checklisten aus screener/data/universe-US_REAL.json', 'dashboard/data/analyst_ratings.json (Angabe Dritter)'],
    weg: ['Zweite Leiste', 'Acht Kacheln mit schwarzem „?“ → Streifen', '„Mehr“ als Knopfwolke → Kapitel', '„Entwicklung pro Jahr“ → Kapitel bzw. Kennzahl-Detail'] } });
slide({ id: 'FX03', title: 'Eine Kennzahl im Detail', route: '/fundamental/#/NVDA?ansicht=kennzahl&k=revenue',
  now: 'F09', sub: 'Heute schon gut, aber lang und mit Hinweistexten oben. Neu: große Zahl, Zeitraum als ein Reiter, Chart mit „+ Firma“ zum Überlagern, Wachstum p. a. in drei Kacheln, Branchenvergleich als Balken mit Logo, Werte je Jahr mit Pille.',
  neu: [['f-metric', 'Umsatz']],
  spec: { aufbau: ['Zurück, Name, Teilen', 'Kennzahl, ein Satz, große Zahl', 'Reiter 3 J · 5 J · 10 J · Max · Quartale', 'Chart + Chips „+ AMD“, „+ AVGO“, „+ Firma“ (bis 4 Linien)', 'Wachstum p. a. 3/5/10 J', 'Branchenvergleich mit Logos', 'Werte je GJ mit Veränderung, Link zur Meldung'],
    komponenten: ['Balken (C06-Stil), Vergleichsbalken', 'Chips'],
    daten: ['wie heute; Vergleich lädt die Historie der gewählten Firmen nach'],
    weg: ['Hinweisbox „Volle Historie …“ oben → nur wenn wirklich etwas fehlt, unten', 'Zwei Reihen Knöpfe (Jährlich/Quartalsweise und 3J/5J/10J/Max) → ein Reiter'] } });

chapter({ n: '02', title: 'Screener: finden', icon: 'screener', anchor: 'kap-screener', was: 'Der Satz „Zeig mir Aktien, die …“ bleibt das Herz. Neu: <b>Regler über der Verteilung</b>, Treffer als ruhige Liste, Vorschau als Sheet.', pages: 'FX04–FX06' });
slide({ id: 'FX04', title: 'Screener · Start', route: '/screener/', now: 'S01',
  sub: 'Heute: „Finde Aktien, die zu dir passen“, Satz-Baustein mit Knopf „Eigenschaften wählen“, vier Ideen-Kacheln, Perspektiven-Liste, Universum-Kachel, zwei Quant-Links. Neu: der Satz zeigt die häufigsten Ergänzungen direkt mit Trefferzahl, fertige Ideen als Schiene, Perspektiven als Raster.',
  neu: [['s-home', 'Start']],
  spec: { aufbau: ['Kopf: Stand, „Was suchst du?“', 'Satz „Zeig mir Aktien, die …“ mit 5 Ergänzungen und Trefferzahl je Ergänzung', 'Fertige Ideen: Checklisten, Wachstum zum fairen Preis, Niedrige Bewertung …', 'Nach Perspektive: 6 Kacheln mit Kriterienzahl', 'Deine Screens'],
    komponenten: ['Neu: Satz-Baustein mit Optionen', 'Ideen-Karte', 'Perspektiven-Raster'],
    daten: ['screener/data/universe-US_REAL.json'],
    weg: ['„Finde Aktien, die zu dir passen“', 'Universum-Kachel (Zahl steht im Kopf)', 'Quant-Links im Screener (Menü)'] } });
slide({ id: 'FX05', title: 'Filter und Treffer', route: '/screener/?f=revenueGrowth:gt:0.2&view=results', now: 'S05',
  sub: 'Heute: Treffer als 11.052 px lange Liste mit vier Zahlen je Zeile. Neu: Ein Filter öffnet sich als Sheet mit Regler über der echten Verteilung aller 5.354 Aktien und schnellen Stufen. Die Treffer stehen ruhig da: Logo, Name, was die Firma macht, die gesuchte Zahl. 25 je Schritt.',
  neu: [['s-filter', 'Filter-Sheet mit Verteilung'], ['s-results', 'Treffer']],
  spec: { aufbau: ['Satz oben mit Trefferzahl', 'Filter-Chip, „+ Filter“, Ansicht Liste/Karten', 'Sortieren als Sheet', 'Trefferzeile: Logo, Name, Satz, gesuchte Zahl als Pille', '25 je Schritt, Speichern, Treffer swipen (wie Discover)', 'Filter-Sheet: Name, Zeitraum, große Schwelle, Verteilung, Regler, Stufen mit Zahl, Hauptknopf mit Trefferzahl'],
    komponenten: ['Neu: Verteilungs-Regler', 'Trefferzeile', 'C16 Sheet'],
    daten: ['Verteilung aus derselben Spalte des Universums (im Browser gerechnet)'],
    weg: ['Vier Zahlen je Zeile und abgeschnittene Spaltennamen', 'Alle Treffer auf einmal', '„Warum passt NVIDIA?“ → „Erfüllt deinen Filter“'] } });
slide({ id: 'FX06', title: 'Treffer antippen', route: 'Trefferliste → Sheet',
  sub: 'Wie bei einem Neo-Broker: Tipp auf einen Treffer öffnet erst eine Vorschau, nicht gleich die ganze Seite. Oben, warum die Aktie den Filter erfüllt; Chart; drei Zahlen; „Aktie öffnen“, merken, nächster Treffer.',
  neu: [['s-peek', 'Vorschau NVIDIA']],
  spec: { aufbau: ['Logo, Name, Kurs, Tagesbewegung', '„Erfüllt deinen Filter“ mit Wert und gesuchter Schwelle', 'Chart 1 Jahr, drei Zahlen', 'Aktie öffnen · Merken · Nächster Treffer'], komponenten: ['C16 Sheet', 'C06 Chart'], daten: ['Universum + Kursreihe'], weg: ['—'] } });

chapter({ n: '03', title: 'Checklisten', icon: 'i-check', anchor: 'checklisten', was: 'Prüflisten wie bei den großen Seiten, aber <b>offen</b>: jede Bedingung mit Haken und Wert. Keine Note, kein Urteil über den Kurs.', pages: 'FX07' });
slide({ t: 'html', id: 'FX07', title: 'Drei Checklisten (Regel-Entwurf)', sub: `Gerechnet auf den echten Daten vom 06.11.2026 über ${fmt(FS.n)} US-Aktien. Neue Regeln: eigener PR mit Vorher/Nachher (CLAUDE.md).`, html: () => `<div class="formats" style="grid-template-columns:repeat(3,minmax(0,1fr))">${['qualitaet', 'wachstum', 'bewertung'].map(id => { const c = CK[id]; return `<div class="fmt"><div class="fmt-h"><b>Checkliste ${c.name}</b><p><b>${c.full}</b> Aktien erfüllen alle ${c.items.length} Punkte. NVIDIA: ${c.nvda.filter(Boolean).length} von ${c.items.length}.</p></div><div class="fmt-b scr" style="display:block">${c.items.map((t, i) => `<div class="cnd"><span class="cnd-i${c.nvda[i] ? ' ok' : ''}">${ic(c.nvda[i] ? 'i-check' : 'i-x', 12)}</span><span>${t}</span></div>`).join('')}<div style="display:flex;gap:4px;margin-top:12px">${c.hits.slice(0, 6).map(t => logo(t, 26)).join('')}</div></div></div>`; }).join('')}</div>
<div class="note">Eine Checkliste zeigt, welche Bedingungen erfüllt sind (Wortwahl: „erfüllt die Regel“). Keine Gesamtnote, kein „Kaufsignal“, keine Namen fremder Scores. Die Schwellen sind ein Vorschlag und stehen in der Methodik.</div>` });

chapter({ n: '04', title: 'Umsetzung', icon: 'layers', anchor: 'umsetzung', was: 'Oberfläche zuerst. <b>Checklisten</b> sind neue Regeln und bekommen einen eigenen PR.', pages: 'U1' });
slide({ t: 'html', id: 'U1', title: 'Fahrplan und Entscheidungen', html: () => `<div class="plan" style="grid-template-columns:repeat(5,minmax(0,1fr))">${[
  ['PR 1', 'Wortwahl und Klarheit', '„zu dir passen“, „passt“, „Interessante Bewertungen“, gleiche Begriffe mit gleicher Regel in Ideen und Satz.'],
  ['PR 2', 'Fundamental-Aktie', 'Ein Satz, Kennzahlen-Streifen, Finanz-Chart, Kapitel; zweite Leiste weg.'],
  ['PR 3', 'Kennzahl und Vergleich', 'Kennzahl-Detail neu, „+ Firma“ im Chart.'],
  ['PR 4', 'Screener', 'Start, Filter-Sheet mit Verteilung, Trefferliste in 25ern, Vorschau-Sheet.'],
  ['PR 5', 'Checklisten', 'Drei Listen als Regeln, auf Aktie, Start und als fertige Ideen. Vorher/Nachher.']].map(([a, b, c]) => `<div><span class="tag neu">${a}</span><b>${b}</b><p>${c}</p></div>`).join('')}</div>
<h3 style="margin-top:36px;font-size:22px;letter-spacing:-.02em">Von dir zu entscheiden</h3>
<ol class="dec">${[
  ['Ein Screener statt drei?', 'Empfehlung: ja. /screener/ ist der eine Screener; Quant- und Technical-Screener werden zu Einstiegen mit vorgewählter Perspektive („Faktoren“, „Chart“). Betrifft den Quant-Plan: dessen PR 4 baut dann nur die Perspektive „Faktoren“ im gemeinsamen Screener.'],
  ['Ranglisten in Fundamental behalten?', 'Empfehlung: ja, als fertige Listen auf der Startseite, technisch als gespeicherter Screen (eine Regel, eine Sortierung).'],
  ['Ranglisten mit eigenen Gewichten (wie TraderFox)?', 'Empfehlung: später, als Profi-Funktion. Zuerst Checklisten.'],
  ['Analysten-Kursziele zeigen?', 'Empfehlung: nein. Nur die Einstufungen als Angabe Dritter mit Quelle und Datum (WORTWAHL.md).'],
  ['Schwellen der Checklisten', 'Empfehlung: wie auf Folie FX07; sie stehen offen in der Methodik und lassen sich im Screener ändern.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });
})();
