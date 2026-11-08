/* Konzept Discover · Reihen-Startseite („Netflix der Aktienwelt“), Stand 08.11.2026.
   Baut auf den Bausteinen der freigegebenen Vorlage auf (../redesign-2027/lib.js, Tokens aus index.html).
   Alle Aktien, Trefferzahlen und Kursreihen sind echt: window.DX aus data-discover.js (Datenstand 06.11.2026). */
(function () {
'use strict';
const { screen, slide, chapter, ic, hud, chart, help, sect, pill, navcard } = VU;
const R = DX.rows, PK = DX.picks, C = DX.cards, SER = DX.series;
const ASOF = 'Fr. 06.11.';
const src = p => (window.__IMG && window.__IMG[p]) || p; /* eingebettete Bilder in der Einzeldatei */

/* ---------- Formate ---------- */
const nm = s => { let x = String(s || ''); for (let i = 0; i < 3; i++) x = x.replace(/\s+(Class [A-Z]|Inc\.?|Holdings?|Ltd\.?|Corporation|Corp\.?|Co\.?|Company|plc|N\.V\.|S\.A\.|A\.S\.|- New|\(Cayman\)|Group Holding|Therapeutics|Technology Group|Iletisim Hizmetleri)$/i, ''); return x; };
const p0 = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(Math.round(v * 100)) + ' %';
const p1 = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1).replace('.', ',') + ' %';
const pillv = (txt, up, big) => `<span class="chg ${up ? 'up' : 'dn'}${big ? ' big' : ''}">${up ? '▲' : '▼'} ${txt.replace(/^[+−±]/, '')}</span>`;
const r12 = t => C[t] && C[t].r12 != null ? pillv(p0(C[t].r12), C[t].r12 >= 0) : '';
const day = t => C[t] && C[t].d != null ? pillv(p1(C[t].d), C[t].d >= 0) : '';
const fromHigh = t => `<span class="chg dn">▼ ${Math.abs(Math.round(C[t].dh * 100))} %</span>`;
const title = id => { const r = R[id]; if (!r) return id; const t = String(r.title || id).toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const T = { 'new-52-week-highs': 'Neue Jahreshochs', 'im-blick': 'Heute im Blick', 'comeback': 'Comeback?', 'langfristige-compounder': 'Langfristige Compounder', 'ueberraschungen': 'Überraschungen', 'bekannte-namen': 'Bekannte Namen in Bewegung', 'breakout-watch': 'Gerade in Bewegung', 'thema-halbleiter-chips': 'Halbleiter & Chips', 'umsatz-waechst-stark': 'Umsatz wächst stark', 'gewinne-beschleunigen': 'Gewinne beschleunigen', 'cashflow-maschinen': 'Cashflow-Maschinen', 'qualitaet-wachstum': 'Qualität + Wachstum', 'margen-werden-staerker': 'Margen werden stärker', 'momentum-leaders': 'Seit Monaten im Aufwind', 'trend-quality': 'Stabile Aufwärtstrends', 'fundamentale-turnarounds': 'Fundamentale Turnarounds', 'sp500-staerkste': 'Stärkste im S&P 500', 'ndx-staerkste': 'Stärkste im Nasdaq-100', 'djia-staerkste': 'Stärkste im Dow Jones', 'market-leaders': 'Die stärksten Aktien', 'qualitaet-zum-preis': 'Qualität zum vernünftigen Preis', 'starke-bilanz-wachstum': 'Starke Bilanz + Wachstum', 'relative-strength': 'Dem Markt voraus', 'profitables-wachstum': 'Profitables Wachstum', 'fallen-angels': 'Fallen Angels' };
const tt = id => T[id] || title(id);
const n = id => R[id] && R[id].n != null ? R[id].n.toLocaleString('de-DE') : '';
const sub = id => (R[id] && R[id].sub || '').replace(/ — nur liquide.*$/, '.');

/* ---------- Bausteine dieses Konzepts ---------- */
const logo = (t, s = 36) => `<span class="lgx" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .28)}px"><b style="font-size:${Math.max(8.5, s * .25)}px">${t}</b><img src="${src('img/logos/' + t + '.png')}" alt="" onerror="this.remove()"></span>`;
const spark = (t, w, h) => SER[t] ? chart(SER[t], { w, h, grid: false, base: false }) : `<div style="height:${h}px"></div>`;
const heart = (on) => `<span class="pc-heart${on ? ' on' : ''}">${ic(on ? 'i-heartf' : 'i-heart', 15)}</span>`;
/* Poster: das Standard-Format jeder Schiene */
const poster = (t, o = {}) => { const c = C[t]; if (!c) return ''; return `<div class="pc${o.dk ? ' dk' : ''}">${o.badge ? `<span class="pc-badge">${o.badge}</span>` : ''}<div class="pc-top">${logo(t, 34)}${heart(o.on)}</div><b class="pc-n">${nm(c.n)}</b><span class="pc-t">${t}</span><div class="pc-ch">${spark(t, 112, 40)}</div><div class="pc-v">${o.right ? o.right(t) : r12(t)}<span>${o.lab || '12 Mon.'}</span></div></div>`; };
/* Top 10: große Ziffer + schmales Poster */
const top10 = (t, i) => `<div class="t10"><span class="t10-n">${i}</span>${poster(t, { right: day, lab: 'heute' })}</div>`;
/* Themen-Bild */
const TIMG = { ki: '01-kuenstliche-intelligenz', chips: '02-halbleiter-chips', cloud: '03-rechenzentren-cloud', cyber: '04-cybersecurity', quant: '05-quantencomputing', humanoid: '06-humanoide-robotik', raum: '16-raumfahrt', kern: '14-kernenergie-uran', bio: '19-biotechnologie', defense: '18-defense-aerospace', strom: '15-stromnetze-elektrifizierung', luxus: '33-luxus-premium' };
const thema = (k, t, s, cnt, w = 150, h = 200) => `<div class="cimg" style="width:${w}px;height:${h}px;flex:none"><img src="${src('img/themen/' + TIMG[k] + '.webp')}" alt=""><div class="t">${t}<span>${s}${cnt ? ' · ' + cnt + ' Aktien' : ''}</span></div></div>`;
/* Schiene: Titel, ein Satz, „Alle N“, dann seitlich wischbar */
const railHead = (t, cnt, s, tag) => `<div class="rh"><div class="rh-t"><b>${t}</b>${tag ? `<span class="rh-tag">${tag}</span>` : ''}<a>${cnt ? 'Alle ' + cnt : 'Alle'} ${ic('i-next', 13)}</a></div>${s ? `<p>${s}</p>` : ''}</div>`;
const rail = items => `<div class="rail">${items.join('')}</div>`;
const R1 = (id, o = {}) => railHead(o.t || tt(id), o.cnt === false ? '' : n(id), o.s === undefined ? sub(id) : o.s, o.tag) + rail((o.list || PK[id] || []).slice(0, o.k || 6).map((t, i) => poster(t, Object.assign({}, o.p || {}, { badge: o.badges && o.badges[i], on: o.hearts && o.hearts[i] }))));
/* Strategie-Karte (breit) */
const strat = (icon, id, s) => `<div class="sk"><span class="hud" style="width:40px;height:40px">${ic(icon, 20)}</span><b>${tt(id)}</b><span class="mu xs b">${n(id)} Aktien</span><p>${s}</p><div class="sk-l">${(PK[id] || []).slice(0, 4).map(t => logo(t, 26)).join('')}</div></div>`;
const genres = (on, dk) => `<div class="chips gch">${['Alle', 'Kursbewegung', 'Unternehmen', 'Themen', 'Indizes'].map(g => `<span class="chip${g === on ? ' on' : ''}">${g}</span>`).join('')}<span class="chip">${ic('i-grid', 16)}</span></div>`;
const search = () => VU.search('Aktie, Thema oder Frage …');
const head = () => `<div class="ltag">Discover · Schluss ${ASOF}</div><div class="lt" style="margin-top:4px">Was bewegt<br>die Börse heute?</div><div style="margin-top:14px">${search()}</div>`;

/* Billboard: Heute im Blick, Nr. 1 (dunkel, groß) */
const billboard = (t = 'ARDT', i = 1, k = 5) => { const c = C[t]; return `<div class="bb-card"><div class="bb-tag"><span class="rh-tag">Nr. ${i} heute</span><span>Heute im Blick</span></div><div style="display:flex;align-items:center;gap:12px;margin-top:12px">${logo(t, 52)}<div style="min-width:0"><b style="display:block;font-size:21px;letter-spacing:-.03em;line-height:1.1">${nm(c.n)}</b><span class="xs b" style="color:#9b9b9b">${t} · ${({ ARDT: 'Krankenhäuser und Kliniken', XERS: 'Biotech und Arzneimittel' })[t] || ''}</span></div></div>
<div style="display:flex;align-items:center;gap:10px;margin-top:14px"><span class="bigp">▲ ${p0(c.r12).replace('+', '')}</span><span class="sm b" style="color:#9b9b9b">in 12 Monaten</span></div>
<div class="mt" style="margin-top:10px;color:#fff">Auf dem höchsten Stand des Jahres</div>
<div style="margin-top:10px">${chart(SER[t], { w: 322, h: 96, grid: false, axis: ['06.11.25', '06.11.26'] })}</div>
<div class="chips" style="margin-top:10px;flex-wrap:wrap;white-space:normal;gap:6px">${pill('Schlusskurs: höchster seit 52 Wochen', 'lm')}<span class="chip" style="height:30px;font-size:12.5px;background:#1d1d1d;color:#fff">Ausbruch mit Volumen</span></div>
<div class="bb-act"><span class="btn" style="height:46px;font-size:14.5px">Aktie ansehen</span><span class="btn line" style="height:46px;font-size:14.5px;border-color:#333;color:#fff">${ic('i-plus', 18)}Merken</span><span class="bb-i">?</span></div>
<div class="bb-dots">${Array.from({ length: k }, (_, j) => `<i class="${j === i - 1 ? 'on' : ''}"></i>`).join('')}</div></div>`; };
/* Markt-Streifen: eine Zeile statt Block */
const marketStrip = () => `<div class="ms"><div><span class="ltag">Markt heute</span><b>Vorsichtig <span class="mu xs b">Stufe 2 von 5</span></b></div><div class="ms-i"><span>Nasdaq</span>${pillv('+1,40 %', 1)}</div><div class="ms-i"><span>S&amp;P</span>${pillv('+0,31 %', 1)}</div><div class="ms-i"><span>Dow</span>${pillv('−0,40 %', 0)}</div>${ic('i-next', 14)}</div>`;

/* ======================================================================
   Screens
   ====================================================================== */
const HOME = `
${head()}
<div style="margin-top:12px">${genres('Alle')}</div>
<div style="margin-top:16px">${billboard()}</div>
<div style="margin-top:12px">${marketStrip()}</div>

${railHead('Top 10 heute', '', 'Rang nach der Regel „Heute im Blick“: Ereignisse des letzten Handelstags und Stärke über 12 Monate.')}
${rail(PK['im-blick'].slice(0, 6).map((t, i) => top10(t, i + 1)))}

${R1('new-52-week-highs', { badges: ['NEU', 'NEU'] })}

${R1('fallen-angels', { t: 'Fallen Angels', tag: 'NEU', s: 'Starke Zahlen, aber der Kurs liegt weit unter seinem Hoch.', p: { right: fromHigh, lab: 'vom Hoch' } })}

${railHead('Themenwelten', DX.themes, 'Von KI bis Kernenergie, je ein Bild und die Firmen dahinter.')}
${rail([thema('ki', 'Künstliche Intelligenz', 'Neue Software', n('thema-ki')), thema('chips', 'Halbleiter & Chips', 'Große Wirkung', n('thema-halbleiter-chips')), thema('kern', 'Kernenergie & Uran', 'Strom ohne CO₂', n('thema-kernenergie-uran')), thema('raum', 'Raumfahrt', 'Neue Märkte', n('thema-raumfahrt'))])}

${railHead('Zuletzt angesehen', '', 'Nur auf diesem Gerät gespeichert, ohne Konto.')}
${rail(['NVDA', 'MU', 'AAPL', 'MSFT'].map(t => `<div class="cw">${logo(t, 30)}<div style="min-width:0"><b>${nm(C[t].n)}</b><span>Di. angesehen</span></div>${day(t)}</div>`))}

${R1('comeback')}

${R1('thema-halbleiter-chips', { t: 'Mehr aus Halbleiter & Chips', s: 'Du hast zuletzt NVIDIA und Micron angesehen.', cnt: false })}

${R1('langfristige-compounder')}

${R1('ueberraschungen', { t: 'Kennt kaum jemand', s: 'Stark über Monate, aber ohne bekannten Namen.' })}

${R1('bekannte-namen')}

${railHead('Strategien', 23, 'Feste Regeln aus den Geschäftszahlen (SEC).')}
${rail([strat('i-bars', 'umsatz-waechst-stark', '3 Jahre je mindestens +15 % Umsatz.'), strat('i-target', 'qualitaet-wachstum', 'Wächst und verdient gut.'), strat('i-signal', 'cashflow-maschinen', '≥ 15 Cent freies Geld je Dollar Umsatz.')])}

${R1('breakout-watch')}

<div class="allrows">${ic('i-grid', 20)}<div><b>Alle ${DX.reihen + 1} Reihen und ${DX.themes} Themen</b><span>Kursbewegung, Unternehmen, Indizes, Themen</span></div>${ic('i-next', 18)}</div>
<div class="card lime" style="margin-top:14px;padding:16px;display:flex;gap:12px;align-items:center">${hud('discover', 44, 13)}<div style="flex:1"><b style="font-size:16px;display:block;letter-spacing:-.02em">Aktien swipen, eine nach der anderen</b><span class="sm">Wische nach rechts zum Merken.</span></div>${ic('i-next', 20)}</div>
<p class="xs mu" style="margin-top:16px">Discover zeigt Kursverhalten und Geschäftszahlen nach festen Regeln, keine Anlageempfehlung. Daten: Tiingo, SEC. Stand 06.11.2026.</p>`;
screen('n-home', { world: 'discover', dock: 0, h: 4560, body: HOME });

/* Erster Bildschirm hell und dunkel */
screen('n-home-1', { world: 'discover', dock: 0, body: `${head()}<div style="margin-top:12px">${genres('Alle')}</div><div style="margin-top:16px">${billboard()}</div>` });
screen('n-home-dk', { world: 'discover', dock: 0, dk: 1, body: `<div class="ltag">Discover · Schluss ${ASOF}</div><div class="lt" style="margin-top:4px">Was bewegt<br>die Börse heute?</div><div style="margin-top:12px">${genres('Alle')}</div><div style="margin-top:14px">${billboard('XERS', 2)}</div>${railHead('Top 10 heute', '', '')}${rail(PK['im-blick'].slice(0, 4).map((t, i) => top10(t, i + 1)))}` });

/* Genre „Unternehmen“ gewählt */
screen('n-genre', { world: 'discover', dock: 0, h: 1720, body: `<div class="ltag">Discover · Unternehmen</div><div class="lt" style="margin-top:4px">Firmen mit<br>starken Zahlen</div><p class="mu" style="margin-top:8px;font-size:15px">Reihen aus den Jahresabschlüssen (SEC), ohne Fachwissen erklärt.</p>
<div style="margin-top:12px">${genres('Unternehmen')}</div>
${R1('umsatz-waechst-stark', { k: 5 })}
${R1('fallen-angels', { t: 'Fallen Angels', tag: 'NEU', s: 'Starke Zahlen, aber der Kurs liegt weit unter seinem Hoch.', p: { right: fromHigh, lab: 'vom Hoch' } })}
${R1('gewinne-beschleunigen')}
${R1('fundamentale-turnarounds')}
${R1('starke-bilanz-wachstum')}` });

/* Reihe geöffnet: Fallen Angels */
const faRow = (t, i) => { const c = C[t]; return `<div class="rk"><b class="num mu">${i}</b>${logo(t, 40)}<div style="min-width:0"><b>${nm(c.n)}</b><span>${c.hook || t}</span></div><div style="display:grid;justify-items:end;gap:2px">${fromHigh(t)}<span class="xs mu b">vom Hoch</span></div></div>`; };
screen('n-row', { world: 'discover', dock: 0, h: 1720, nopad: 1, body: `<div class="rowhero"><div style="display:flex;justify-content:space-between"><span class="hb" style="background:#1a1a1a;color:#fff">${ic('i-back', 18)}</span><span class="hb" style="background:#1a1a1a;color:#fff">${ic('i-bell', 18)}</span></div>
<div style="display:flex;gap:6px;margin-top:22px"><span class="rh-tag">NEU</span><span class="rh-tag" style="background:#1d1d1d;color:#bbb">Kursbewegung + Unternehmen</span></div>
<div style="font-size:40px;font-weight:900;letter-spacing:-.05em;line-height:.95;margin-top:10px">Fallen<br><span style="color:var(--lime)">Angels</span></div>
<p style="margin-top:10px;color:#bdbdbd;font-size:15px">Starke Zahlen, aber der Kurs liegt weit unter seinem Hoch.</p>
<div class="rowlogos">${PK['fallen-angels'].slice(0, 6).map(t => logo(t, 34)).join('')}</div><p class="xs b" style="color:#9b9b9b;margin-top:8px">${n('fallen-angels')} Aktien · Stand ${ASOF}</p>
<div class="grid2" style="margin-top:16px"><span class="btn" style="height:46px;font-size:14.5px">${ic('i-swipe', 18)}Reihe swipen</span><span class="btn line" style="height:46px;font-size:14.5px;border-color:#333;color:#fff">${ic('i-plus', 18)}Reihe merken</span></div></div>
<div style="padding:0 18px">
<div class="card" style="margin-top:16px;padding:14px"><div class="ltag">Wie kommt eine Aktie hier rein?</div>
<div class="rule"><span>${ic('i-check', 15)}</span><p>Steht in <b>Qualität + Wachstum</b>, <b>Profitables Wachstum</b> oder <b>Langfristige Compounder</b>: Umsatz wächst, Firma verdient Geld.</p></div>
<div class="rule"><span>${ic('i-check', 15)}</span><p>Der Schlusskurs liegt <b>mindestens 30 % unter dem Hoch</b> der letzten 52 Wochen.</p></div>
<div style="margin-top:10px">${help('Ein tiefer Kurs sagt nichts darüber, wie es weitergeht. Die Reihe zeigt nur, wo Zahlen und Kurs auseinanderlaufen.')}</div></div>
<div class="seg" style="margin-top:14px"><span class="on">Abstand</span><span>Umsatz</span><span>Name</span></div>
<div style="margin-top:6px">${PK['fallen-angels'].slice(0, 8).map((t, i) => faRow(t, i + 1)).join('')}</div>
<div class="btn line" style="margin-top:12px;height:46px;font-size:14.5px">Alle ${n('fallen-angels')} anzeigen</div>
${railHead('Ähnliche Reihen', '', '')}
${rail([['comeback', 'i-signal'], ['langfristige-compounder', 'i-bars'], ['qualitaet-zum-preis', 'i-target'], ['fundamentale-turnarounds', 'i-new']].map(([id, i]) => `<div class="sk" style="width:170px"><span class="hud" style="width:36px;height:36px">${ic(i, 18)}</span><b>${tt(id)}</b><span class="mu xs b">${n(id)} Aktien</span></div>`))}
</div>` });

/* Reihe swipen */
const swipeCard = t => { const c = C[t]; return `<div class="card" style="padding:16px;box-shadow:0 20px 40px -20px rgb(0 0 0/.35);background:var(--a-bg);border:1.5px solid var(--a-line)"><div style="display:flex;align-items:center;gap:10px">${logo(t, 48)}<div style="flex:1;min-width:0"><b style="display:block;font-size:19px;letter-spacing:-.02em">${nm(c.n)}</b><span class="mu xs b">${t}</span></div></div><div style="display:flex;gap:8px;align-items:center;margin-top:14px">${fromHigh(t)}<span class="sm mu b">unter dem 52-Wochen-Hoch</span></div><div class="mt" style="margin-top:10px">${c.hook || ''}</div><div style="margin-top:12px">${chart(SER[t], { w: 320, h: 150, axis: ['06.11.25', '06.11.26'] })}</div><div class="chips" style="margin-top:12px;flex-wrap:wrap;white-space:normal;gap:6px">${(c.rows || []).filter(r => T[r]).slice(0, 3).map(r => pill(T[r])).join('')}</div></div>`; };
screen('n-row-swipe', { world: 'discover', dock: 3, body: `<div style="display:flex;justify-content:space-between;align-items:center"><div><div class="ltag">Reihe swipen</div><b style="font-size:20px;letter-spacing:-.03em">Fallen Angels</b></div><span class="mu sm b">3 von ${n('fallen-angels')}</span></div><div class="prog"><i style="width:${300 / R['fallen-angels'].n}%"></i></div>
<div style="margin-top:14px">${swipeCard(PK['fallen-angels'][2])}</div>
<div style="display:flex;justify-content:center;gap:22px;margin-top:18px"><span class="sw-b">${ic('i-x', 24)}</span><span class="sw-b" style="width:54px;height:54px">${ic('i-back', 20)}</span><span class="sw-b lm">${ic('i-heart', 24)}</span></div>` });

/* Vorschau-Sheet (Tippen und Halten auf ein Poster) */
const pv = 'XERS', pc = C[pv];
screen('n-preview', { world: 'discover', dock: 0, body: `${head()}<div style="margin-top:12px">${genres('Alle')}</div>${railHead('Neue Jahreshochs', n('new-52-week-highs'), '')}${rail(PK['new-52-week-highs'].slice(0, 3).map(t => poster(t)))}`,
  overlay: `<div class="ovl"></div><div class="sheet" style="top:140px"><div class="grab"></div><div style="display:flex;align-items:center;gap:12px">${logo(pv, 50)}<div style="flex:1;min-width:0"><b style="display:block;font-size:20px;letter-spacing:-.03em">${nm(pc.n)}</b><span class="mu xs b">${pv} · Biotech und Arzneimittel</span></div><span class="hb">${ic('i-x', 16)}</span></div>
<div style="display:flex;gap:8px;align-items:center;margin-top:14px">${r12(pv).replace('chg', 'chg big')}<span class="sm mu b">12 Monate</span>${day(pv)}<span class="sm mu b">heute</span></div>
<div style="margin-top:12px">${chart(SER[pv], { w: 354, h: 120, axis: ['06.11.25', '06.11.26'] })}</div>
<div class="mt" style="margin-top:12px;font-size:18px">${pc.hook}</div>
<div class="ltag" style="margin-top:14px">Steht heute in ${pc.rows.filter(r => !r.startsWith('thema-')).length} Reihen</div>
<div class="chips" style="margin-top:6px;flex-wrap:wrap;white-space:normal;gap:6px">${pc.rows.filter(r => !r.startsWith('thema-')).map((r, i) => `<span class="chip${i ? '' : ' lm'}" style="height:30px;font-size:12.5px">${tt(r)}</span>`).join('')}</div>
<div class="grid2" style="margin-top:16px;grid-template-columns:1fr auto auto"><span class="btn ink" style="height:48px;font-size:15px">Aktie ansehen</span><span class="hb" style="width:48px;height:48px">${ic('i-heart', 20)}</span><span class="hb" style="width:48px;height:48px">${ic('i-swipe', 20)}</span></div></div>` });

/* Alle Reihen (Vollbild, wie die Kategorien-Liste) */
const G = [
  ['Kursbewegung', ['new-52-week-highs', 'momentum-leaders', 'relative-strength', 'trend-quality', 'breakout-watch', 'comeback', 'fallen-angels']],
  ['Unternehmen', ['umsatz-waechst-stark', 'gewinne-beschleunigen', 'margen-werden-staerker', 'cashflow-maschinen', 'qualitaet-wachstum', 'profitables-wachstum', 'langfristige-compounder', 'fundamentale-turnarounds', 'qualitaet-zum-preis', 'starke-bilanz-wachstum']],
  ['Indizes', ['sp500-staerkste', 'ndx-staerkste', 'djia-staerkste']],
  ['Entdecken', ['im-blick', 'bekannte-namen', 'ueberraschungen']]];
screen('n-all', { world: 'discover', dock: 0, dk: 1, h: 1640, body: `<div style="display:flex;justify-content:space-between;align-items:center"><div class="lt">Alle Reihen</div><span class="hb">${ic('i-x', 18)}</span></div><p class="mu" style="margin-top:6px;font-size:15px">${DX.reihen + 1} Reihen nach festen Regeln und ${DX.themes} Themenwelten.</p>
${G.map(([g, ids]) => `<div class="st">${g}<a>${ids.length}</a></div><div class="card" style="padding:2px 14px">${ids.map(id => `<div class="kv"><span style="display:flex;align-items:center;gap:8px"><span class="sm b">${tt(id)}</span>${id === 'fallen-angels' ? '<span class="rh-tag">NEU</span>' : ''}</span><span class="mu xs b" style="display:inline-flex;gap:6px;align-items:center">${n(id)} ${ic('i-next', 13)}</span></div>`).join('')}</div>`).join('')}
<div class="st">Themenwelten<a>${DX.themes}</a></div>${rail([thema('ki', 'Künstliche Intelligenz', '', 0, 120, 120), thema('cloud', 'Rechenzentren & Cloud', '', 0, 120, 120), thema('cyber', 'Cybersecurity', '', 0, 120, 120)])}` });

/* ======================================================================
   Folien
   ====================================================================== */
slide({ t: 'html', anchor: 'cover', dark: 1, html: () => `<div class="covergrid"><div><img src="${src('img/vision-universe-logo-web.png')}" alt="Vision Universe" style="height:20px;filter:invert(1);margin-bottom:36px"><div style="font-size:clamp(46px,7vw,104px);font-weight:900;letter-spacing:-.06em;line-height:.9">Discover.<br><span style="color:var(--lime)">Reihe für Reihe.</span></div><p style="margin-top:22px;color:#a6a6a6;font-size:clamp(16px,1.5vw,20px);font-weight:500;max-width:42ch">Konzept für die Discover-Startseite als „Netflix der Aktienwelt“: statt Themenkanälen Aktien-Reihen, die man durchwischt. Im CI des Redesigns 2027, mit echten Daten vom 06.11.2026.</p><div class="toc" id="toc" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:28px"></div></div><div class="coverphones"><div data-frame="n-home-1"></div><div data-frame="n-home-dk"></div></div></div>` });

slide({ t: 'html', id: 'K1', title: 'Die Idee: Netflix, nur mit Aktien', sub: 'Jedes bekannte Element von Netflix hat in Discover schon eine Entsprechung, meist sogar fertige Daten. Sie liegen nur nicht auf der Startseite.', html: () => `<div class="xscroll"><table class="tbl map"><thead><tr><th>Bei Netflix</th><th>In Discover</th><th>Heute</th></tr></thead><tbody>${[
  ['Billboard oben (großes Bild, „Abspielen“, „Meine Liste“, „Info“)', 'Heute im Blick: große dunkle Karte, Aktie ansehen · Merken · „?“', 'vorhanden, hell, in der Mitte der Seite'],
  ['Genres: Thriller, Drama, Anime …', `Reihen: Neue Jahreshochs, Fallen Angels, Comeback?, Compounder … (${DX.reihen} fertig + 1 neu)`, '5 von 23 auf der Startseite'],
  ['Kategorien-Leiste oben (Serien, Filme, Kategorien)', 'Genre-Chips: Alle · Kursbewegung · Unternehmen · Themen · Indizes', 'Chips führen auf Unterseiten'],
  ['Top 10 in Deutschland heute (große Ziffern)', 'Top 10 heute, Rang nach der Regel „Heute im Blick“', 'Daten da, keine Ansicht'],
  ['Weiterschauen', 'Zuletzt angesehen, nur auf dem Gerät (discover/engines/memory.js)', 'Engine da, keine Reihe'],
  ['„Weil du X gesehen hast“', '„Mehr aus Halbleiter & Chips“, aus dem Thema der zuletzt angesehenen Aktie', 'neu'],
  ['Neue Folge', 'Badge NEU: seit gestern neu in der Reihe', 'neu'],
  ['Info-Fenster beim Halten', 'Vorschau-Sheet: Chart, ein Satz, „steht heute in 5 Reihen“', 'neu'],
  ['Meine Liste', 'Herz auf jeder Karte, Watchlist', 'vorhanden'],
  ['Serienseite', 'Reihen-Seite mit Regel, Sortierung, „Reihe swipen“', 'vorhanden als Liste']].map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="mu">${r[2]}</td></tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'K2', title: 'Was beim Refresh verloren ging', sub: 'Das Redesign hat die Startseite aufgeräumt: richtig so. Dabei ist aber auch das Durchstöbern weggefallen.', html: () => `<div class="facts">${[
  [`${DX.reihen}`, 'Reihen liefert der Datenlauf jeden Tag, mit Regel und Trefferzahl.'],
  ['5', 'davon zeigt die Startseite heute: Heute im Blick, Stärkste, Jahreshochs, Bekannte Namen, 3 Strategien.'],
  [`${DX.themes}`, 'Themenwelten mit eigenem Bild. Auf der Startseite: 3 sichtbar.'],
  ['3.643 px', 'ist die Startseite hoch. Nach etwa 4 Bildschirmen ist Schluss.'],
  ['1 Format', 'Fast jeder Abschnitt ist eine gleich aussehende Liste. Nichts lädt zum Wischen ein.'],
  ['0', 'persönliche Reihen, obwohl Discover sich „Zuletzt angesehen“ schon merkt.']].map(([a, b]) => `<div><b>${a}</b><p>${b}</p></div>`).join('')}</div>` });

chapter({ n: '01', title: 'Die neue Startseite', icon: 'discover', anchor: 'start', was: 'Oben bleibt alles ruhig: Frage, Suche, <b>ein Billboard</b>. Darunter beginnt das Stöbern: <b>14 Reihen</b>, jede seitlich wischbar.', pages: 'DX01–DX03' });

slide({ id: 'DX01', title: 'Startseite: Reihe für Reihe', route: '/discover/#/', now: 'D01',
  sub: 'Heute: Markt-Block, eine Aktie, dann Listen. Neu: Billboard oben, Markt als eine Zeile, danach 14 Reihen im Wechsel von Kurs, Unternehmen, Themen und Persönlichem. Alle Werte im Mockup sind echte Treffer vom 06.11.2026.',
  neu: [['n-home', 'Ganze Seite, im Rahmen scrollbar'], ['n-home-1', 'Erster Bildschirm']],
  spec: {
    aufbau: ['Kopf wie heute: Datum, Frage, Suche', 'Genre-Chips ersetzen Welten/Strategien/Swipen/Märkte (die stehen schon in der Leiste unten)', 'Billboard „Heute im Blick“ dunkel, wischbar 1–5, Knöpfe Aktie ansehen · Merken · ?', 'Markt heute als eine Zeile (Stufe + 3 Indizes), Tipp → Märkte', 'Top 10 heute (große Ziffern), dann Jahreshochs, Fallen Angels, Themen, Zuletzt angesehen, Comeback?, Mehr aus …, Compounder, Kennt kaum jemand, Bekannte Namen, Strategien, Gerade in Bewegung', '„Alle Reihen“, Swipen-Karte, Hinweis'],
    komponenten: ['Neu: Poster-Karte (Logo, Name, Mini-Chart, Pille)', 'Neu: Top-10-Karte', 'Neu: Schienen-Kopf (Titel, ein Satz, Alle N)', 'Neu: Billboard', 'C06 Chart (Mini), C07 Kursbewegung, C09 Erklärung', 'Themen-Bildkarte (vorhanden)'],
    daten: ['discover/data/rows/US_REAL/{reihe}.json (cards, coverage.matched, subtitle)', 'discover/data/home/US_REAL*.json für Billboard', 'quant/data/market/discover-series/ref_{T}.json (Mini-Charts, faul geladen)', 'discover/engines/memory.js (Zuletzt angesehen, Mehr aus …)'],
    weg: ['Listen „Die stärksten Aktien“ und „Neue Jahreshochs“ als Rangliste → werden Schienen, Rangliste lebt auf der Reihen-Seite', 'Großer Barometer-Block → eine Zeile', 'Schnellzugriffe-Chips → Genre-Chips']
  } });

slide({ id: 'DX02', title: 'Genres und Dunkel', route: '/discover/#/?genre=unternehmen', now: null,
  sub: 'Ein Tipp auf ein Genre filtert die Startseite auf seine Reihen, ohne Seitenwechsel. Im dunklen Modus wirkt das Billboard wie ein Filmplakat: dieselbe Seite, nur dunkel (vorhandener Schalter).',
  neu: [['n-genre', 'Genre „Unternehmen“'], ['n-home-dk', 'Dunkel, Billboard Nr. 2']],
  spec: {
    aufbau: ['Genre-Chips bleiben beim Scrollen oben kleben', 'Je Genre eigene Überschrift und 5–10 Reihen', 'Themen-Genre zeigt die Themen als große Bildkarten, Indizes die drei Index-Reihen'],
    komponenten: ['C14 Reiter (als Chips)', 'Schiene, Poster'],
    daten: ['Zuordnung Reihe → Genre fest im Code (wie Folie „Alle Reihen“)'],
    weg: ['Nichts; ohne Genre-Wahl sieht man „Alle“']
  } });

slide({ t: 'html', id: 'DX03', title: 'Vier Kartenformate statt einer Liste', sub: 'Netflix wirkt lebendig, weil nicht jede Reihe gleich aussieht. Discover bekommt vier Formate, alle aus denselben Bausteinen und Farben.', html: () => `<div class="formats">${[
  ['Poster', 'Standard jeder Reihe. Logo, Name, Kürzel, Mini-Chart 1 Jahr, eine Pille. NEU-Badge, wenn die Aktie seit gestern in der Reihe ist.', `<div style="display:flex;gap:10px">${poster('XERS', { badge: 'NEU' })}${poster('NFLX' in C ? 'NFLX' : PK['fallen-angels'][0], { right: fromHigh, lab: 'vom Hoch' })}</div>`],
  ['Top 10', 'Große Ziffer hinter dem Poster. Nur für eine Reihe am Tag, damit sie besonders bleibt.', `<div style="display:flex;gap:6px">${top10(PK['im-blick'][0], 1)}${top10(PK['im-blick'][1], 2)}</div>`],
  ['Themenbild', 'Bild, Name, ein Satz, Anzahl Aktien. Für Themenwelten und das Genre „Themen“.', `<div style="display:flex;gap:10px">${thema('ki', 'Künstliche Intelligenz', 'Neue Software', n('thema-ki'), 140, 190)}${thema('kern', 'Kernenergie & Uran', 'Strom ohne CO₂', n('thema-kernenergie-uran'), 140, 190)}</div>`],
  ['Breit', 'Für Strategien und Reihen über Reihen: Symbol, Name, Trefferzahl, Regel in einem Satz, vier Logos.', `<div style="display:flex;gap:10px">${strat('i-bars', 'umsatz-waechst-stark', '3 Jahre je mindestens +15 % Umsatz.')}</div>`]].map(([t, s, h]) => `<div class="fmt"><div class="fmt-h"><b>${t}</b><p>${s}</p></div><div class="fmt-b scr">${h}</div></div>`).join('')}</div>` });

chapter({ n: '02', title: 'Reihe, Vorschau, Alle Reihen', icon: 'i-list', anchor: 'reihe', was: 'Jede Reihe ist wie eine Serie: <b>eigene Seite</b>, eigene Regel, <b>durchswipen</b>. Halten zeigt die Vorschau.', pages: 'DX04–DX06' });

slide({ id: 'DX04', title: 'Reihen-Seite: Fallen Angels', route: '/discover/#/c/US_REAL/fallen-angels',
  sub: `Neue Reihe. Regel-Entwurf auf den heutigen Daten: ${n('fallen-angels')} Aktien. Oben dunkel wie eine Serienseite, darunter die Regel in zwei Sätzen, Sortierung und die Liste. „Reihe swipen“ öffnet Swipen nur mit diesen Aktien.`,
  neu: [['n-row', 'Reihen-Seite, ganze Seite'], ['n-row-swipe', 'Reihe swipen']],
  spec: {
    aufbau: ['Dunkler Kopf: Etiketten, Titel, ein Satz, Logos, Trefferzahl, Stand', 'Knöpfe: Reihe swipen · Reihe merken (Glocke: „Neu in dieser Reihe“)', '„Wie kommt eine Aktie hier rein?“ mit Haken je Bedingung + „?“', 'Reiter Sortierung, Rangliste mit Satz aus den Geschäftszahlen', 'Ähnliche Reihen'],
    komponenten: ['C13 Abschnittstitel, C14 Reiter, C09 Erklärung', 'Ranglistenzeile (vorhanden)', 'Breite Karte'],
    daten: ['Neue Reihe fallen-angels im Datenlauf (discover/engines, eigener PR mit Vorher/Nachher)', 'Regel: Mitglied in qualitaet-wachstum, profitables-wachstum oder langfristige-compounder UND distanceTo52wHigh ≤ −30 %'],
    weg: ['Für alle anderen Reihen gilt derselbe Aufbau; heute ist die Reihen-Seite eine schlichte Liste']
  } });

slide({ id: 'DX05', title: 'Vorschau beim Halten', route: 'Startseite, Tippen und Halten auf ein Poster',
  sub: 'Ein kurzer Tipp öffnet die Aktie. Halten (oder „?“) zeigt die Vorschau, ohne die Startseite zu verlassen: Chart, ein Satz, und in welchen Reihen die Aktie heute noch steht. Das verbindet die Reihen untereinander.',
  neu: [['n-preview', 'Vorschau-Sheet Xeris']],
  spec: {
    aufbau: ['Logo, Name, was die Firma macht, Schließen', '12 Monate und heute als Pillen', 'Chart 1 Jahr', 'Ein Satz aus den Geschäftszahlen (hook)', '„Steht heute in N Reihen“ als Chips, Tipp → Reihe', 'Aktie ansehen · Merken · Swipen'],
    komponenten: ['C16 Sheet', 'C06 Chart', 'C07 Kursbewegung'],
    daten: ['Karte aus der Reihe (cards[].hook, metrics)', 'Reihen je Aktie: Index über alle discover/data/rows (beim Bauen im Datenlauf, keine Zusatz-Anfragen)'],
    weg: ['—']
  } });

slide({ id: 'DX06', title: 'Alle Reihen', route: 'Startseite → „Alle Reihen“ / Chip ▦',
  sub: 'Wie die Kategorien-Liste bei Netflix: alles auf einen Blick, nach Genre geordnet, mit Trefferzahl. Ersetzt die heute verstreuten Einstiege über Welten und Strategien nicht, sondern bündelt sie.',
  neu: [['n-all', 'Vollbild, dunkel']],
  spec: {
    aufbau: ['Vollbild schwarz, Schließen', 'Genres als Gruppen: Kursbewegung, Unternehmen, Indizes, Entdecken', 'Je Reihe Name und Trefferzahl', 'Themenwelten als Bildreihe, „Alle 54“'],
    komponenten: ['C03-Stil (Menü schwarz)', 'Listenzeile'],
    daten: ['discover/data/meta.json → rowConfigs, rows/{reihe}.json → coverage.matched'],
    weg: ['—']
  } });

chapter({ n: '03', title: 'Umsetzung', icon: 'layers', anchor: 'umsetzung', was: 'Fast alles ist <b>Oberfläche auf vorhandenen Daten</b>. Neu im Datenlauf sind nur Fallen Angels und das NEU-Badge.', pages: 'U1–U4' });

slide({ t: 'html', id: 'U1', title: 'Was es gibt, was neu ist', html: () => `<div class="xscroll"><table class="tbl"><thead><tr><th>Teil</th><th>Stand</th><th>Arbeit</th></tr></thead><tbody>${[
  ['Reihen-Daten (23 Reihen, 54 Themen)', 'fertig, täglich', 'keine'],
  ['Schienen, Poster, Top 10, Billboard, Genre-Chips', 'neu', 'Oberfläche in discover/ui/v3.js (außerhalb des 180-KB-Budgets)'],
  ['Mini-Charts je Poster', 'Kursreihen da', 'faul laden, erst wenn die Schiene sichtbar wird (IntersectionObserver)'],
  ['Zuletzt angesehen, Mehr aus …', 'memory.js merkt sich schon recent()', 'nur Anzeige'],
  ['Vorschau-Sheet, Reihen-Seite, Alle Reihen', 'Liste vorhanden', 'Oberfläche'],
  ['Fallen Angels', 'neu', 'neue Reihe im Datenlauf, eigener PR mit Vorher/Nachher (Fachmodell-Regel)'],
  ['NEU-Badge', 'neu', 'Vergleich mit gestriger Reihe im Datenlauf (Feld newSince)'],
  ['Schaufenster-Regel', 'neu', 'nur Startseite, siehe U2']].map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td class="mu">${r[2]}</td></tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'U2', title: 'Regeln für die Startseite', sub: 'Damit 14 Reihen nicht beliebig wirken, gelten feste Regeln. Beim Bauen der Mockups hat sich gezeigt, dass heute einige Reihen mit Totalverlust-Fällen oder Aktien ohne Kursreihe beginnen.', html: () => `<ol class="rules7">${[
  'Oben fest: Billboard, Markt, Top 10. Danach wechseln sich Kurs, Unternehmen, Themen und Persönliches ab.',
  'Höchstens 14 Reihen auf der Startseite, der Rest unter „Alle Reihen“.',
  'Reihen mit neuen Treffern seit gestern rücken nach oben. So sieht die Seite jeden Tag anders aus.',
  'Leere Reihen erscheinen nicht. Fehlen Daten, sagt die Reihe es.',
  'Schaufenster-Regel: Auf der Startseite stehen nur Aktien mit Kursreihe und ohne Totalverlust-Fall (12 Monate über −60 %). Die Reihen-Seite zeigt weiter alle Treffer.'].map(x => `<li>${x}</li>`).join('')}</ol>
<div class="note"><b>Befund aus den Daten vom 06.11.</b> Unter den ersten fünf von „Cashflow-Maschinen“ steht ${(DX.dropped['cashflow-maschinen'] || []).join(', ')}, bei „Qualität zum vernünftigen Preis“ ${(DX.dropped['qualitaet-zum-preis'] || []).join(', ')}, bei „Umsatz wächst stark“ ${(DX.dropped['umsatz-waechst-stark'] || []).join(', ')}. Sie haben −60 % oder schlechter über 12 Monate, oder es fehlt ihre Kursreihe. Die Schaufenster-Regel blendet sie auf der Startseite aus. Ob die Sortierung dieser Reihen selbst stimmt, prüfen wir im Datenlauf-PR.</div>` });

slide({ t: 'html', id: 'U3', title: 'Wortwahl', sub: 'Reihen beschreiben Kurse und Zahlen, sie empfehlen nichts (docs/legal/WORTWAHL.md).', html: () => `<div class="xscroll"><table class="tbl"><thead><tr><th>Nicht</th><th>Sondern</th></tr></thead><tbody>${[
  ['Top 10 Gewinner', 'Top 10 heute · Rang nach der Regel „Heute im Blick“'],
  ['Fallen Angels: jetzt günstig', 'Starke Zahlen, aber der Kurs liegt weit unter seinem Hoch'],
  ['Für dich empfohlen', 'Mehr aus Halbleiter & Chips · Du hast zuletzt NVIDIA angesehen'],
  ['Geheimtipps', 'Kennt kaum jemand · stark über Monate, ohne bekannten Namen'],
  ['Comeback-Kandidaten', 'Comeback? · deutlich gefallen, seit drei Monaten wieder im Plus']].map(r => `<tr><td class="mu"><s>${r[0]}</s></td><td><b>${r[1]}</b></td></tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'U4', title: 'Fahrplan und Entscheidungen', html: () => `<div class="plan">${[
  ['PR 1', 'Startseite mit Reihen', 'Schienen, Poster, Top 10, Billboard, Markt-Zeile, Genre-Chips, Schaufenster-Regel. Nur vorhandene Daten.'],
  ['PR 2', 'Reihe, Vorschau, Alle Reihen', 'Reihen-Seite mit Regel und „Reihe swipen“, Vorschau-Sheet, Vollbild „Alle Reihen“.'],
  ['PR 3', 'Persönliche Reihen', 'Zuletzt angesehen, Mehr aus …, NEU-Badge. Alles auf dem Gerät, ohne Konto.'],
  ['PR 4', 'Neue Reihe Fallen Angels', 'Regel im Datenlauf, Vorher/Nachher, Methodik-Text. Danach erscheint sie auf der Startseite.']].map(([a, b, c]) => `<div><span class="tag neu">${a}</span><b>${b}</b><p>${c}</p></div>`).join('')}</div>
<h3 style="margin-top:36px;font-size:22px;letter-spacing:-.02em">Von dir zu entscheiden</h3>
<ol class="dec">${[
  ['Name „Fallen Angels“ oder deutsch „Gefallene Engel“?', 'Empfehlung: „Fallen Angels“, der Untertitel erklärt es.'],
  ['Schwelle für Fallen Angels: 30 % unter dem Hoch?', `Empfehlung: 30 %. Heute ${n('fallen-angels')} Treffer, genug für eine Reihe, nicht zu viele.`],
  ['Billboard dunkel auch im hellen Modus?', 'Empfehlung: ja, als einziger dunkler Block oben. Er trennt „heute“ von „stöbern“.'],
  ['Weitere Reihen-Ideen für später', '„Größte Rückgänge heute“, „Dividende seit 10 Jahren“, „Kurz vor dem Jahreshoch“, „Neu an der Börse“. Brauchen eigene Regeln.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });

})();
