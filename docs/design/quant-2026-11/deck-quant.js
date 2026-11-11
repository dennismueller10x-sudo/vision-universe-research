/* Konzept Quant · „Ein Profil je Aktie“, Stand 08.11.2026.
   Bausteine aus ../redesign-2027/lib.js (Kopie in lib/). Werte: window.QD aus data-quant.js (echt, Stand 06.11.2026);
   Zahlen ohne Datei (Trefferzahlen, Meldungen, Backtests) wie auf den heutigen Seiten vom 08.11.2026 abgelesen. */
(function () {
'use strict';
const { screen, slide, chapter, ic, hud, chart, help, vd, tf, pill } = VU;
const Q = QD.stocks, SER = QD.series;
const ASOF = 'Fr. 06.11.';
const src = p => (window.__IMG && window.__IMG[p]) || p;
const de = (v, d = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const nm = s => String(s || '').replace(/,?\s+(Inc\.?|Corp(oration)?\.?|Holdings?,?( Inc\.?)?|Ltd\.?|Co\.?|Class [A-Z]|plc|\/New\/)$/i, '').replace(/,?\s+(Inc\.?|Corporation)$/i, '');

/* ---------- Begriffe: ein Wort je Eigenschaft, überall gleich ---------- */
const F = ['profitability', 'growth', 'quality', 'momentum', 'value', 'risk', 'revisions'];
const L = { profitability: 'Verdient gut', growth: 'Wächst', quality: 'Zahlen solide', momentum: 'Kurs läuft', value: 'Günstig', risk: 'Ruhiger Kurs', revisions: 'Analysten' };
const FI = { profitability: 'i-bars', growth: 'i-signal', quality: 'i-check', momentum: 'i-line', value: 'i-target', risk: 'i-wave', revisions: 'i-person' };
const stage = v => v == null ? 'Keine Daten' : v >= 90 ? 'Sehr stark' : v >= 75 ? 'Stark' : v >= 45 ? 'Mittel' : v >= 25 ? 'Schwach' : 'Sehr schwach';
const stageK = v => v == null ? 'o' : v >= 75 ? 's' : v >= 45 ? 'm' : 'w';
const pv = (t, k) => Q[t] && Q[t].f[k];

/* ---------- Bausteine ---------- */
const logo = (t, s = 36) => `<span class="lgx" style="width:${s}px;height:${s}px;border-radius:${Math.round(s * .28)}px"><b style="font-size:${Math.max(8.5, s * .25)}px">${t}</b><img src="${src('img/logos/' + t + '.png')}" alt="" onerror="this.remove()"></span>`;
/* Profil klein: sechs Säulen (Analysten fehlt heute überall), stark = neongrün */
const prof = (t, w = 66, h = 30) => { const bw = (w - 5 * 4) / 6; return `<svg width="${w}" height="${h}" aria-hidden="true" style="display:block">${F.slice(0, 6).map((k, i) => { const v = pv(t, k); const bh = v == null ? 3 : Math.max(3, v / 100 * h); return `<rect x="${(i * (bw + 4)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${v == null ? 'none' : v >= 75 ? '#c8f531' : 'var(--a-ink)'}"${v == null ? ' stroke="var(--a-mute)" stroke-dasharray="2 2"' : ''}${v != null && v >= 75 ? ' stroke="var(--a-ink)" stroke-width="1"' : ''}/>`; }).join('')}</svg>`; };
const profLegend = () => `<div class="plg">${F.slice(0, 6).map(k => `<span>${L[k]}</span>`).join('')}</div>`;
/* Profil groß: eine Zeile je Eigenschaft */
const profFull = (t, o = {}) => `<div class="pf">${F.map(k => { const v = pv(t, k); return `<div class="pf-r${v == null ? ' na' : ''}"><span class="pf-l">${ic(FI[k], 15)}${L[k]}</span><span class="pf-b"><i style="width:${v == null ? 0 : v}%" class="${v != null && v >= 75 ? 'hi' : ''}"></i>${[25, 45, 75, 90].map(x => `<em style="left:${x}%"></em>`).join('')}</span><b class="num">${v == null ? '–' : v}</b>${o.noStage ? '' : `<span class="pf-s">${stage(v)}</span>`}</div>`; }).join('')}</div>`;
const scoreP = (v, lab) => `<span class="sp${v >= 75 ? ' hi' : ''}"><small>${lab}</small><b class="num">${v}</b></span>`;
/* Profil-Poster für Schienen */
const qposter = (t, chipTxt) => { const s = Q[t]; return `<div class="pc"><div class="pc-top">${logo(t, 34)}<span class="pc-heart">${ic('i-heart', 15)}</span></div><b class="pc-n">${nm(s.n)}</b><span class="pc-t">${t}</span><div style="margin:8px 0 8px">${prof(t, 110, 34)}</div><span class="chip" style="height:26px;font-size:11px;padding:0 9px;background:var(--a-bg);margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${chipTxt}</span></div>`; };
const railHead = (t, cnt, s, tag) => `<div class="rh"><div class="rh-t"><b>${t}</b>${tag ? `<span class="rh-tag">${tag}</span>` : ''}<a>${cnt ? 'Alle ' + cnt : 'Alle'} ${ic('i-next', 13)}</a></div>${s ? `<p>${s}</p>` : ''}</div>`;
const rail = items => `<div class="rail">${items.join('')}</div>`;
const search = t => VU.search(t || 'Aktie suchen, z. B. NVDA …');
const pillv = (txt, up) => `<span class="chg ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${txt.replace(/^[+−]/, '')}</span>`;
/* Aktienzeile mit Profil */
const prow = (t, right, sub) => { const s = Q[t]; return `<div class="pr">${logo(t, 38)}<div style="min-width:0"><b>${nm(s.n)}</b><span>${sub || t}</span></div>${prof(t, 60, 26)}${right || ''}</div>`; };

/* Anlagestile: Satz als Titel, Fachname klein (Werte vom 08.11.2026, Seite /quant/#/strategien) */
const STILE = [
  ['quality-momentum', 'Solide und im Aufwind', 'Quality Momentum', 33, '+2 · −1', [['quality', 70], ['momentum', 70], ['profitability', 60]], ['VMD', 'PGNY', 'EBF', 'HRMY']],
  ['momentum-leader', 'Der Kurs führt den Markt an', 'Momentum Leader', 182, '+15 · −18', [['momentum', 80], ['growth', 50], ['risk', 40]], []],
  ['garp', 'Wachstum zum fairen Preis', 'GARP', 128, '+2 · −1', [['growth', 65], ['value', 55], ['quality', 50]], ['FIVN']],
  ['quality-compounder', 'Verlässlich und wächst lange', 'Quality Compounder', 12, '', [['quality', 75], ['profitability', 70], ['risk', 50], ['growth', 45]], ['EGP', 'HRMY']],
  ['defensive-quality', 'Solide mit ruhigem Kurs', 'Defensive Quality', 22, '', [['risk', 75], ['quality', 70], ['profitability', 65], ['momentum', 40]], ['CARG', 'IRMD', 'PRI']],
  ['future-leader', 'Wächst schnell, Markt zieht mit', 'Future Leader', 14, '', [['growth', 80], ['momentum', 70], ['profitability', 40]], ['ORRF']],
  ['value-momentum', 'Günstig und dreht nach oben', 'Value Momentum', 217, '+16 · −13', [['value', 70], ['momentum', 60], ['quality', 45]], ['NVEC', 'BLKB']]];
const ruleChip = ([k, x]) => `<span class="rc">${ic(FI[k], 13)}${L[k]} <b>ab ${x}</b></span>`;
const stilCard = s => `<div class="stc"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><span class="ltag">${s[2]}</span><b>${s[1]}</b></div><div style="text-align:right"><b class="num" style="font-size:26px;letter-spacing:-.04em">${s[3]}</b><span class="xs mu b" style="display:block">Aktien heute</span></div></div><div class="rcs">${s[5].map(ruleChip).join('')}</div><div style="display:flex;align-items:center;gap:6px;margin-top:10px">${s[6].slice(0, 4).map(t => logo(t, 24)).join('')}${s[4] ? `<span class="xs b mu" style="margin-left:auto">seit gestern ${s[4]}</span>` : ''}</div></div>`;

/* Setup-Karte mit Wortwahl nach WORTWAHL.md: Zone und Ungültig-Marke laut Methode, kein Ziel */
const setup = (t, zone, inval, hist) => `<div class="card" style="padding:14px"><div style="display:flex;align-items:center;gap:10px">${logo(t, 36)}<div style="flex:1;min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nm(Q[t].n)}</b><span class="xs mu b">${t}</span></div>${vd('s', 'Bestätigt')}</div><div class="grid2" style="margin-top:10px;gap:8px"><div class="mini"><small>Zone laut Methode</small><b>${zone}</b></div><div class="mini"><small>Ungültig laut Methode</small><b>${inval}</b></div></div><p class="xs mu" style="margin-top:8px">${hist}</p></div>`;

/* ======================================================================
   Screens
   ====================================================================== */
const STRIP = `<div class="today"><div class="ltag" style="color:#9b9b9b">Heute bei Quant · Stand ${ASOF}</div><div class="tg">${[['36', 'neu in einem Anlagestil'], ['3', 'Setups bestätigt'], ['12', 'Risiko steigt']].map(([a, b]) => `<div><b class="num">${a}</b><span>${b}</span></div>`).join('')}</div><div class="today-l"><span>Alle 1.257 Meldungen</span>${ic('i-next', 16)}</div></div>`;
const MARKT = `<div class="ms" style="grid-template-columns:1fr auto"><div><span class="ltag">Markt heute</span><b>Breite Schwäche <span class="mu xs b">35 % über der 200-Tage-Linie</span></b><div style="height:6px;border-radius:9px;background:var(--a-line);margin-top:6px"><i style="display:block;height:100%;width:35%;background:var(--a-ink);border-radius:9px"></i></div></div>${ic('i-next', 14)}</div>`;
screen('q-home', { world: 'quant', dock: 0, h: 2020, body: `<div class="ltag">Quant · Schluss ${ASOF}</div><div class="lt" style="margin-top:4px">Was hat sich<br>heute verändert?</div><p class="mu" style="margin-top:8px;font-size:15px">Jede Aktie hat ein Profil aus sieben Eigenschaften. Quant meldet, wenn sich etwas ändert.</p><div style="margin-top:14px">${search()}</div>
<div style="margin-top:14px">${STRIP}</div><div style="margin-top:10px">${MARKT}</div>
${railHead('Neu in einem Anlagestil', 36, 'Seit gestern erfüllt die Aktie alle Regeln eines Stils.')}
${rail([['GABC', 'Solide und im Aufwind'], ['FIVN', 'Wachstum zum fairen Preis'], ['ORRF', 'Wächst schnell, Markt zieht mit'], ['BLKB', 'Günstig und dreht nach oben']].map(([t, c]) => qposter(t, c)))}
${profLegend()}
${railHead('Setup bestätigt', 28, 'Der Chart zeigt eine Lage mit klaren Regeln.')}
<div class="stack">${setup('MTD', '1.510–1.570 $', '1.240 $', 'Ähnliche Lagen bei Mettler Toledo: 70 % von 60 Fällen später höher · Forschung, nicht zertifiziert')}${setup('STGW', '9,5–9,8 $', '8 $', 'Zu wenige frühere Fälle für eine Aussage.')}</div>
${railHead('Anlagestile', 7, 'Jeder Stil ist eine feste Regel. Quant prüft sie täglich.')}
${rail(STILE.slice(0, 3).map(s => `<div style="flex:none;width:280px">${stilCard(s)}</div>`))}
${railHead('So arbeitet Quant', '', '')}
<div class="grid3" style="gap:8px">${[['1', 'Misst', 'sieben Eigenschaften je Aktie'], ['2', 'Meldet', 'was sich seit gestern ändert'], ['3', 'Vergleicht', 'was früher in gleicher Lage geschah']].map(([a, b, c]) => `<div class="card" style="padding:12px"><span class="stepn">${a}</span><b style="display:block;margin-top:8px">${b}</b><span class="xs mu">${c}</span></div>`).join('')}</div>
<div class="card lime" style="margin-top:14px;padding:16px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:42px;height:42px">${ic('i-book', 20)}</span><div style="flex:1"><b style="display:block">Warum kann ich dem vertrauen?</b><span class="sm">Methodik, Daten, Grenzen offen erklärt.</span></div>${ic('i-next', 18)}</div>
<p class="xs mu" style="margin-top:16px">Quant ordnet ein und vergleicht. Keine Anlageempfehlung, keine Prognose, kein Kursziel. Stand 06.11.2026.</p>` });

/* Meldungen (heute „Radar“) */
const MEL = [['MTD', 'Setup bestätigt', 's'], ['STGW', 'Setup bestätigt', 's'], ['XERS', 'Setup bestätigt', 's'], ['KINS', 'Neues Setup', 'm'], ['GABC', 'Neu in „Solide und im Aufwind“', 's'], ['FIVN', 'Neu in „Wachstum zum fairen Preis“', 's'], ['ORRF', 'Neu in „Wächst schnell, Markt zieht mit“', 's'], ['BLKB', 'Neu in „Günstig und dreht nach oben“', 's']];
screen('q-radar', { world: 'quant', dock: 0, h: 1100, body: `<div class="ltag">Meldungen · Stand ${ASOF}</div><div class="lt" style="margin-top:4px">Was ist heute neu?</div><p class="mu" style="margin-top:6px;font-size:15px">1.257 Aktien mit einer Meldung. Eine Zeile je Aktie, Details beim Antippen.</p>
<div class="chips" style="margin-top:12px;flex-wrap:wrap;white-space:normal;gap:6px">${[['Alle', '1.257', 1], ['Setups', '152'], ['Anlagestile', '66'], ['Kurs & Trend', '359'], ['Jahreshoch', '123'], ['Eigenschaften', '271']].map(([a, b, on]) => `<span class="chip${on ? ' on' : ''}" style="height:32px;font-size:13px">${a} <span style="opacity:.6">${b}</span></span>`).join('')}</div>
<div class="seg" style="margin-top:10px"><span class="on">Alle</span><span>Besser 586</span><span>Schlechter 448</span></div>
<div class="st">Freitag, 06.11.<a>Neueste zuerst</a></div>
<div class="card" style="padding:2px 14px">${MEL.map(([t, e, k]) => `<div class="mr">${logo(t, 34)}<div style="min-width:0"><b>${nm(Q[t].n)}</b><span>${e}</span></div>${vd(k, k === 's' ? 'Neu' : 'Beobachten')}</div>`).join('')}</div>
<div class="btn line" style="margin-top:12px;height:46px;font-size:14.5px">Weitere 1.249 laden</div>
<div style="margin-top:12px">${help('Eine Meldung beschreibt, was sich nach festen Regeln geändert hat. Ob das früher einen Vorteil hatte, steht unter Forschung.')}</div>` });

/* Screener einfach und Profi */
const SCR = ['CARG', 'EGP', 'IRMD', 'NVEC', 'HRMY', 'KNSL', 'WSM'];
screen('q-screener', { world: 'quant', dock: 1, h: 1220, body: `<div class="ltag">Quant Screener</div><div class="lt" style="margin-top:4px">Welche Aktien<br>suchst du?</div>
<div class="seg" style="margin-top:12px"><span class="on">Einfach</span><span>Profi</span></div>
<div class="chips" style="margin-top:12px;flex-wrap:wrap;white-space:normal;gap:6px">${['Verdient gut, solide Zahlen', 'Kurs läuft besser als der Markt', 'Wächst und verdient', 'Eher günstig', 'Ruhiger Kurs', 'Setup im Chart', 'Nahe am Jahreshoch'].map((x, i) => `<span class="chip${i ? '' : ' on'}" style="height:32px;font-size:13px">${x}</span>`).join('')}</div>
<div class="card lime" style="margin-top:12px;padding:14px"><span class="ltag" style="color:#000;opacity:.6">Deine Frage</span><b style="display:block;font-size:17px;margin-top:2px">Verdient gut und hat solide Zahlen</b><div class="rcs" style="margin-top:8px">${ruleChip(['profitability', 70])}${ruleChip(['quality', 70])}</div></div>
<div class="st">55 Treffer<a>Sortiert: Verdient gut</a></div>
<div>${SCR.map(t => prow(t, scoreP(pv(t, 'profitability'), 'Verdient'), `${t} · Zahlen solide ${pv(t, 'quality')}`)).join('')}</div>
${profLegend()}
<div class="btn line" style="margin-top:12px;height:46px;font-size:14.5px">Alle 55 zeigen</div>
<div class="btn ink" style="margin-top:8px;height:46px;font-size:14.5px">Im Profi-Modus verfeinern</div>` });
const COLS = ['profitability', 'quality', 'growth', 'momentum', 'risk'];
screen('q-screener-pro', { world: 'quant', dock: 1, body: `<div style="display:flex;justify-content:space-between;align-items:center"><div class="mt">Quant Screener</div><span class="pro" style="margin:0">PRO</span></div>
<div class="seg" style="margin-top:10px"><span>Einfach</span><span class="on">Profi</span></div>
<div class="card" style="margin-top:12px;padding:12px 14px"><div class="ltag">Bedingungen</div><div class="rcs" style="margin-top:8px">${ruleChip(['profitability', 70])}${ruleChip(['quality', 70])}<span class="rc" style="border-style:dashed">${ic('i-plus', 13)}Bedingung</span></div></div>
<div class="tbl2"><div class="tr th"><span>Aktie</span>${COLS.map(k => `<span>${ic(FI[k], 14)}<small>${L[k].split(' ')[0]}</small></span>`).join('')}</div>${SCR.concat(['UTHR', 'SRCE', 'PRI']).map(t => `<div class="tr"><b>${t}</b>${COLS.map(k => { const v = pv(t, k); return `<span class="${v != null && v >= 75 ? 'hi' : ''}">${v == null ? '–' : v}</span>`; }).join('')}</div>`).join('')}</div>
<p class="xs mu" style="margin-top:8px">Neongrün: stark (75 und mehr). Kopfzeile bleibt beim Scrollen stehen. Hell wie der Rest, kein Wechsel ins Dunkle.</p>` });

/* Anlagestile und ein Stil */
screen('q-stile', { world: 'quant', dock: 2, h: 1880, body: `<div class="ltag">Anlagestile</div><div class="lt" style="margin-top:4px">Welche Art von<br>Firma suchst du?</div><p class="mu" style="margin-top:8px;font-size:15px">Jeder Stil ist eine feste Regel aus Eigenschaften. Quant prüft täglich, welche Aktien alle Regeln erfüllen.</p>
<div class="stack" style="margin-top:14px">${STILE.map(stilCard).join('')}</div>
<p class="xs mu" style="margin-top:10px">„Analysten heben Schätzungen an“ erscheint, sobald es dafür Daten gibt.</p>
<div class="card" style="margin-top:12px;padding:14px"><span class="ltag">Forschung, nicht zertifiziert</span><b style="display:block;margin-top:2px">Wie gut war ein Stil früher?</b><span class="sm mu">Gesperrt, bis Universum, Kapitalmaßnahmen und Ausführung geprüft sind.</span></div>` });
const QM = STILE[0];
screen('q-stil', { world: 'quant', dock: 2, h: 1200, nopad: 1, body: `<div class="rowhero"><div style="display:flex;justify-content:space-between"><span class="hb" style="background:#1a1a1a;color:#fff">${ic('i-back', 18)}</span><span class="hb" style="background:#1a1a1a;color:#fff">${ic('i-bell', 18)}</span></div>
<span class="rh-tag" style="margin-top:18px;background:#1d1d1d;color:#bbb">Anlagestil · ${QM[2]}</span>
<div style="font-size:36px;font-weight:900;letter-spacing:-.05em;line-height:.98;margin-top:10px">Solide und<br><span style="color:var(--lime)">im Aufwind</span></div>
<p style="margin-top:8px;color:#bdbdbd;font-size:15px">Solide Firmen, bei denen der Markt die Qualität auch im Kurs bestätigt.</p>
<div class="grid2" style="margin-top:14px;gap:8px"><div class="mini dk"><small>Erfüllen heute</small><b>33 von 6.155</b></div><div class="mini dk"><small>Seit gestern</small><b>2 neu · 1 raus</b></div></div></div>
<div style="padding:0 18px">
<div class="card" style="margin-top:14px;padding:14px"><div class="ltag">Die Regel</div>${QM[5].map(([k, x]) => `<div class="thr"><span>${ic(FI[k], 15)}${L[k]}</span><span class="thr-b"><i style="left:${x}%"></i><em style="left:${x}%;width:${100 - x}%"></em></span><b>ab ${x}</b></div>`).join('')}<div style="margin-top:10px">${help('Alle drei müssen erfüllt sein. 70 heißt: besser als etwa 70 % der Aktien bei dieser Eigenschaft.')}</div></div>
<div class="st">Die 33 Aktien<a>Sortiert: Zahlen solide</a></div>
<div>${['GABC', 'VMD', 'PGNY', 'EBF', 'HRMY', 'SPSC'].map((t, i) => prow(t, i ? scoreP(pv(t, 'quality'), 'Zahlen') : `<span class="rh-tag">NEU</span>`, `${t} · Kurs läuft ${pv(t, 'momentum')}`)).join('')}</div>
<div class="btn line" style="margin-top:12px;height:46px;font-size:14.5px">Alle 33 · im Screener anpassen</div></div>` });

/* Aktienseite, Perspektive „Faktoren“ */
const N = Q.NVDA;
const head = () => VU.STOCK('Faktoren', { s: { t: 'NVDA', name: 'NVIDIA', what: 'Chips für KI und Grafik', p: N.price, d: N.d, eur: '167,17 €', date: ASOF } }).replace('<span class="lg">NVDA</span>', logo('NVDA', 42));
const near = Object.keys(Q).filter(t => t !== 'NVDA' && F.slice(0, 6).every(k => pv(t, k) != null)).map(t => [t, F.slice(0, 6).reduce((a, k) => a + ((pv(t, k) == null || pv('NVDA', k) == null) ? 400 : (pv(t, k) - pv('NVDA', k)) ** 2), 0)]).sort((a, b) => a[1] - b[1]).slice(0, 5).map(x => x[0]);
const STORY = `<div class="story"><div class="ltag" style="color:#9b9b9b">Quant in drei Sätzen</div>${[
  ['i-bars', 'Stärke', `Verdient besser als 99 % aller US-Aktien, wächst stark (86).`, vd('s', 'Sehr stark')],
  ['i-check', 'Schwäche', `Die Zahlen sind weniger solide (43): Gewinn nur zum Teil durch Zahlungsfluss gedeckt.`, vd('w', 'Schwach')],
  ['i-line', 'Zuletzt', `Der Kurs verliert an Tempo: −19 % im letzten Monat.`, vd('w', '5 von 10 schlechter')]].map(([i, l, t, v]) => `<div class="story-r"><span class="hud" style="width:34px;height:34px">${ic(i, 17)}</span><div><span class="ltag" style="color:#9b9b9b">${l}</span><p>${t}</p></div>${v}</div>`).join('')}</div>`;
const CHAP = [['Die sieben Eigenschaften im Detail', 'Belege bis zu den Rohdaten', 'i-grid'], ['Stärken und Schwächen laut Kennzahlen', '3 Stärken · 1 Schwäche · 2 im Mittelfeld', 'i-pie'], ['Was hat sich bewegt?', '1 besser · 5 schlechter seit 05.11.', 'i-signal'], ['Anlagestile und Setup', '0 von 7 Stilen erfüllt · 2 knapp verfehlt', 'i-target'], ['Früher bei NVIDIA', '18 ähnliche Lagen · Forschung', 'i-book'], ['Geschäftszahlen', 'Umsatz 215,94 Mrd. $ (GJ 2026) → Zahlen', 'fundamental']];
const ep = (c, i, open) => `<div class="ep"><b class="ep-n">${i + 1}</b><span class="hud" style="width:40px;height:40px;border-radius:12px">${ic(c[2], 19)}</span><div class="ep-t"><b>${c[0]}</b><span>${c[1]}</span></div><span class="ep-c">${ic(open ? 'i-x' : 'i-next', 15)}</span></div>`;
screen('q-stock', { world: 'quant', dock: 3, hdr: false, h: 1840, body: `${head()}
<div class="card" style="margin-top:14px;padding:14px"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:17px;letter-spacing:-.02em">Das Profil von NVIDIA</b><span class="xs mu b">0–100 · Rang unter 6.155</span></div><div style="margin-top:10px">${profFull('NVDA')}</div><div style="margin-top:10px">${help('Jede Zahl ist ein Rang: 99 heißt besser als 99 % der bewerteten US-Aktien. Eine Gesamtnote gibt es bewusst nicht.')}</div></div>
<div style="margin-top:12px">${STORY}</div>
${railHead('Kapitel', '', '')}
<div class="eps ep2">${CHAP.map((c, i) => ep(c, i)).join('')}</div>
${railHead('Ähnliches Profil', '', 'Aktien, deren sieben Eigenschaften NVIDIA am nächsten liegen.')}
${rail(near.map(t => qposter(t, `${L.profitability} ${pv(t, 'profitability')}`)))}
<p class="xs mu" style="margin-top:16px">Rang im Vergleich zu allen bewerteten US-Aktien, Stand ${ASOF}. Keine Anlageempfehlung.</p>` });

const cond = (k, x) => { const v = pv('NVDA', k), ok = v >= x; return `<div class="cnd"><span class="cnd-i${ok ? ' ok' : ''}">${ic(ok ? 'i-check' : 'i-x', 12)}</span><span>${L[k]} ab ${x}</span><b class="num">${v}</b></div>`; };
screen('q-stock-ch', { world: 'quant', dock: 3, hdr: false, h: 1080, body: `${head()}
<div class="eps ep2" style="margin-top:14px">${ep(CHAP[2], 2)}<div class="open-box">${ep(CHAP[3], 3, true)}
<div class="card" style="background:var(--a-bg);padding:12px 14px;margin-top:6px"><div style="display:flex;justify-content:space-between;align-items:center"><b>Setup im Chart</b>${vd('o', 'Kein Setup')}</div><span class="xs mu">Für „Beobachten“ fehlt noch eine von zwei Bedingungen.</span></div>
<div class="card" style="background:var(--a-bg);padding:12px 14px;margin-top:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><span class="ltag">GARP</span><b style="display:block">Wachstum zum fairen Preis</b></div>${vd('m', 'Knapp verfehlt')}</div>${cond('growth', 65)}${cond('value', 55)}${cond('quality', 50)}<p class="xs b" style="margin-top:8px">Es fehlen 7 Punkte bei „Zahlen solide“.</p></div>
<div class="card" style="background:var(--a-bg);padding:12px 14px;margin-top:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><span class="ltag">Defensive Quality</span><b style="display:block">Solide mit ruhigem Kurs</b></div>${vd('m', 'Knapp verfehlt')}</div>${cond('risk', 75)}${cond('quality', 70)}${cond('profitability', 65)}${cond('momentum', 40)}<p class="xs b" style="margin-top:8px">Es fehlen 27 Punkte bei „Zahlen solide“.</p></div>
<p class="xs mu" style="margin-top:8px">Erfüllt heute 0 von 7 Stilen.</p></div>
${ep(CHAP[4], 4)}</div>` });

/* Vergleich als Profil gegen Profil */
const cmpRow = k => { const a = pv('NVDA', k), b = pv('AMD', k); return `<div class="cmp"><span class="cmp-l">${ic(FI[k], 14)}${L[k]}</span><div class="cmp-b"><div><i style="width:${a || 0}%"></i></div><div><i class="b" style="width:${b || 0}%"></i></div></div><div class="cmp-n"><b class="num">${a == null ? '–' : a}</b><b class="num">${b == null ? '–' : b}</b></div></div>`; };
screen('q-compare', { world: 'quant', dock: 3, h: 980, body: `<div class="ltag">Vergleich</div><div class="lt" style="margin-top:4px">NVIDIA<br>gegen AMD</div>
<div style="display:flex;gap:8px;margin-top:12px;align-items:center"><span class="chip on" style="height:34px">${logo('NVDA', 20)} NVDA</span><span class="chip lm" style="height:34px">${logo('AMD', 20)} AMD</span><span class="chip" style="height:34px">${ic('i-plus', 15)}Aktie</span></div>
<div class="card" style="margin-top:12px;padding:14px">${F.map(cmpRow).join('')}</div>
<div class="story" style="margin-top:12px;padding-bottom:12px"><div class="ltag" style="color:#9b9b9b">In zwei Sätzen</div><p style="font-weight:700;margin-top:6px;font-size:14.5px">NVIDIA verdient deutlich besser (99 zu 59) und wächst schneller (86 zu 79).</p><p style="font-weight:700;margin-top:6px;font-size:14.5px">AMD läuft am Kurs besser (84 zu 62) und hat die solideren Zahlen (68 zu 43).</p></div>
<div class="card" style="margin-top:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center"><b class="sm">Alle Kennzahlen als Tabelle</b>${ic('i-next', 16)}</div>
<div style="margin-top:10px">${help('Bei AMD sind die letzten Geschäftszahlen vom 27.12.2025; Kennzahlen, die neuere Berichte brauchen, stehen deshalb als „–“ in der Tabelle, mit diesem Grund.')}</div>` });

/* Forschung (heute „Backtesting“) */
const BT = [['Neues 52-Wochen-Hoch', 1.4, 'Kleiner Vorteil'], ['Momentum verschlechtert', -0.3, 'Kein messbarer Vorteil'], ['Unter die langfristige Linie', -0.1, 'Kein messbarer Vorteil'], ['Über der langfristigen Linie', -1.2, 'Früher schwächer'], ['Momentum verbessert', -1.3, 'Früher schwächer']];
const btRow = ([t, v, l]) => `<div class="bt"><div><b>${t}</b><span>${l}</span></div><div class="bt-bar"><em></em><i class="${v > 0 ? 'up' : 'dn'}" style="${v > 0 ? 'left:50%' : 'right:50%'};width:${Math.abs(v) / 1.6 * 50}%"></i></div><b class="num">${(v > 0 ? '+' : '−') + de(Math.abs(v), 1)}</b></div>`;
screen('q-backtest', { world: 'quant', dock: 0, h: 1180, body: `<span class="rh-tag" style="background:var(--a-ink);color:var(--lime)">Forschung, nicht zertifiziert</span><div class="lt" style="margin-top:8px">Hatte eine Meldung<br>früher einen Vorteil?</div><p class="mu" style="margin-top:8px;font-size:15px">Für jede Meldung: wie es 6 Monate danach im Vergleich zum Markt derselben Wochen lief.</p>
<div class="today" style="margin-top:14px"><div class="tg">${[['0 von 6', 'zertifiziert'], ['3', 'eingeschränkt geprüft'], ['3', 'sammeln Historie']].map(([a, b]) => `<div><b class="num" style="font-size:24px">${a}</b><span>${b}</span></div>`).join('')}</div></div>
<div class="st">Marktweit geprüft<a>Prozentpunkte zum Markt</a></div>
<div class="card" style="padding:4px 14px">${BT.map(btRow).join('')}</div>
<div style="margin-top:10px">${help('+1,4 heißt: nach der Meldung lagen die Aktien im Schnitt 1,4 Prozentpunkte vor dem Markt derselben Wochen. Vergangenheit, keine Prognose.')}</div>
<div class="st">Sammelt noch Historie</div>
<div class="card" style="padding:2px 14px">${['Setup bestätigt', 'Setup entsteht', 'Anlagestile', 'Eigenschaften-Rang'].map(x => `<div class="kv"><span class="sm b">${x}</span>${vd('o', 'sammelt')}</div>`).join('')}</div>
<div class="card" style="margin-top:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center"><b class="sm">Was zur Zertifizierung fehlt</b>${ic('i-next', 16)}</div>` });

/* ======================================================================
   Folien
   ====================================================================== */
slide({ t: 'html', anchor: 'cover', dark: 1, html: () => `<div class="covergrid"><div><img src="${src('img/vision-universe-logo-web.png')}" alt="Vision Universe" style="height:20px;filter:invert(1);margin-bottom:36px"><div style="font-size:clamp(46px,7vw,104px);font-weight:900;letter-spacing:-.06em;line-height:.9">Quant.<br><span style="color:var(--lime)">Ein Profil<br>je Aktie.</span></div><p style="margin-top:22px;color:#a6a6a6;font-size:clamp(16px,1.5vw,20px);font-weight:500;max-width:44ch">Konzept für Quant, damit Nutzer in Sekunden verstehen, was sie sehen: ein Profil aus sieben Eigenschaften, überall gleich gezeigt, dazu Meldungen, Anlagestile und Forschung. Gleicher Ansatz wie bei Discover, echte Werte vom 06.11.2026.</p><div class="toc" id="toc" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:28px"></div></div><div class="coverphones"><div data-frame="q-home"></div><div data-frame="q-stock"></div></div></div>` });

slide({ t: 'html', id: 'K1', title: 'Die eine Idee: das Profil', sub: 'Heute erklärt Quant sich mit Scores, Faktoren, Fragen, Eigenschaften, Setups, Signalen und Backtests. Neu steht ein Bild im Mittelpunkt: das Profil. Wie eine Spielerkarte mit Werten für Tempo und Schuss, nur für Aktien. Es erscheint überall gleich, klein in jeder Liste, groß auf der Aktie.', html: () => `<div class="formats"><div class="fmt"><div class="fmt-h"><b>Groß, auf der Aktie</b><p>Sieben Zeilen, je ein Wort, ein Balken mit den Stufen-Marken 25 · 45 · 75 · 90, die Zahl, die Stufe. Stark ist neongrün.</p></div><div class="fmt-b scr" style="display:block">${profFull('NVDA')}</div></div><div class="fmt"><div class="fmt-h"><b>Klein, in jeder Liste</b><p>Sechs Säulen in fester Reihenfolge. Man sieht ohne Lesen, wo eine Aktie stark ist. Gestrichelt: keine Daten.</p></div><div class="fmt-b scr" style="display:block">${['NVDA', 'AMD', 'CARG', 'MSFT'].map(t => prow(t, '', t)).join('')}${profLegend()}</div></div></div>
<div class="xscroll" style="margin-top:28px"><table class="tbl"><thead><tr><th>Ein Wort je Eigenschaft (überall gleich)</th><th>Heute auch genannt</th></tr></thead><tbody>${[['Verdient gut', 'Profitabilität · Ertragskraft'], ['Wächst', 'Wachstum · Wächst die Firma?'], ['Zahlen solide', 'Bilanz- & Ergebnisqualität · Qualität · Sind die Zahlen solide?'], ['Kurs läuft', 'Kursstärke · Momentum · Kurs läuft gut?'], ['Günstig', 'Bewertung · Ist sie günstig?'], ['Ruhiger Kurs', 'Risiko · Risiko niedrig · Wie ruhig ist der Kurs?'], ['Analysten (ohne Daten)', 'Erwartungstrend · Earnings Revision · die „siebte Frage“']].map(r => `<tr><td><b>${r[0]}</b></td><td class="mu">${r[1]}</td></tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'K2', title: 'Was beim Durchscrollen auffällt', sub: 'Aufgenommen am 08.11.2026 auf 390 px: 14 Seiten von /quant/.', html: () => `<div class="facts">${[
  ['20.813 px', 'ist der Radar lang, die Aktienseite 6.128 px. Der Radar steht noch im alten Design (grüne Rahmen, Verlauf, rötliche Pille „448 verschlechtert“), ebenso die Backtests.'],
  ['Einstieg · Stopp · Ziel', '„Einstiegsmarke“, „Stopp-Marke“, „Zielzone“, „Ziel 1“ auf Start, Radar, Aktien, Chart und im Fußtext. WORTWAHL.md: „Zone laut Methode“, „Ungültig-Marke laut Methode“, kein Ziel.'],
  ['5 · 6 · 7', 'Wie viele Eigenschaften gibt es? Screener: „3 von 5“ und „5 von 6 Faktoren stark“, Methodik: „sechs Fragen, plus eine siebte“, Aktie: sieben. Dazu vier Namen je Eigenschaft.'],
  ['„dafür / dagegen“', '„Was spricht dafür – und was dagegen?“ auf der Aktienseite steht auf der Nein-Liste der Wortwahl.'],
  ['€ hier, $ dort', 'NVIDIA in Quant: 167,17 € und +3,32 %. In Discover: 186,64 $ und +2,78 %. Gleicher Tag, zwei Tagesbewegungen.'],
  ['„null“', 'Unter der Trefferliste im Screener und unter dem Vergleich steht das Wort „null“. Im Vergleich fehlen bei AMD fast alle Werte ohne Grund.'],
  ['Englisch', 'Stile heißen Quality Compounder, GARP, Future Leader … Der deutsche Satz steht klein darunter.'],
  ['Zwei Leisten', 'Auf der Aktie liegen Perspektiven-Leiste und Schritt-Leiste (Überblick · Eigenschaften · Stärken) übereinander.'],
  ['Kleinigkeiten', '„Bekannte Namen in der Liste“ zeigt unbekannte Namen; leere schwarze Kreise statt Symbolen; der Profi-Screener springt ins Dunkle.']].map(([a, b]) => `<div><b style="font-size:clamp(28px,3.4vw,46px)">${a}</b><p>${b}</p></div>`).join('')}</div>` });

chapter({ n: '01', title: 'Start und Meldungen', icon: 'quant', anchor: 'start', was: 'Oben eine Antwort: <b>was heute neu ist</b>. Darunter Schienen mit Profilen. Der Radar wird zur <b>Meldungsliste</b>.', pages: 'QX01–QX02' });
slide({ id: 'QX01', title: 'Quant · Start', route: '/quant/', now: 'Q01',
  sub: 'Heute: Erklärung, Markt, sechs gleich große Zahlenkacheln, eine Pro-Kachel, drei lange Setup-Karten mit Einstieg/Stopp/Ziel, Stil-Liste, fünf Navigationskarten. Neu: eine schwarze „Heute“-Karte mit drei Zahlen, Markt als Zeile, danach Schienen mit Profil-Postern.',
  neu: [['q-home', 'Ganze Seite, im Rahmen scrollbar']],
  spec: { aufbau: ['Kopf: Datum, Frage, ein Satz „Profil aus sieben Eigenschaften“, Suche', '„Heute bei Quant“: 3 Zahlen (neu in Stil, Setups bestätigt, Risiko steigt) + „Alle 1.257 Meldungen“', 'Markt als eine Zeile', 'Schiene „Neu in einem Anlagestil“ (Profil-Poster)', 'Setup bestätigt: 2 Karten, Zone und Ungültig-Marke laut Methode, kein Ziel; Rückblick als „Forschung“', 'Schiene Anlagestile', '„So arbeitet Quant“ (3 Schritte) nach unten, Vertrauen, Hinweis'],
    komponenten: ['Neu: Profil klein (6 Säulen) und groß (7 Zeilen)', 'Neu: Profil-Poster', 'Schiene, Schienen-Kopf (wie Discover)', 'C08 Urteil, C09 Erklärung'],
    daten: ['quant/data/product/factor-evidence-v1/{Shard}.json.gz → factors.*.score', 'heutige Quellen der Start- und Radar-Zahlen unverändert'],
    weg: ['Sechs Zahlenkacheln → drei Zahlen + Meldungen', 'Pro-Kachel „Lief so etwas früher besser“ → Forschung', 'Einstiegsmarke, Stopp-Marke, Zielzone', 'Fünf Navigationskarten (stehen in Leiste und Menü)'] } });
slide({ id: 'QX02', title: 'Radar wird „Meldungen“', route: '/quant/#/radar', now: 'Q10',
  sub: 'Heute: 20.813 px, jede Aktie als große Karte mit Einstieg, Stopp, Ziel, zwei Evidenz-Zeilen und Details (Aufnahme zeigt die ersten 8.000 px). Neu: eine Zeile je Aktie, gruppiert nach Tag, Filter als Chips, Details erst beim Antippen.',
  neu: [['q-radar', 'Meldungen, eine Zeile je Aktie']],
  spec: { aufbau: ['Kopf mit Zahl der Meldungen', 'Chips: Alle · Setups · Anlagestile · Kurs & Trend · Jahreshoch · Eigenschaften', 'Reiter Alle · Besser · Schlechter (schwarz, nicht rot)', 'Liste je Tag: Logo, Name, Meldung, Urteil', '„Weitere laden“ statt alles auf einmal'],
    komponenten: ['Listenzeile', 'C14 Reiter', 'C16 Sheet für Details'],
    daten: ['heutige Radar-Daten unverändert'],
    weg: ['Große Karten mit drei Kursmarken', 'Rötliche Pille', 'Grüne Rahmen und Verlauf (altes Design)', 'Lange Leseanleitung oben → „?“'] } });

chapter({ n: '02', title: 'Finden', icon: 'screener', anchor: 'finden', was: 'Screener und Anlagestile zeigen <b>Profile statt Zahlenkolonnen</b>, Regeln in Wörtern.', pages: 'QX03–QX04' });
slide({ id: 'QX03', title: 'Screener', route: '/quant/#/screener', now: 'Q02',
  sub: 'Heute: sieben Fragen untereinander, Treffer mit Fachnamen und einer großen Zahl, „null“ unter der Liste, Profi-Modus wechselt ins Dunkle. Neu: Fragen als Chips, Treffer mit Profil, Profi-Tabelle hell mit Symbolen im Kopf.',
  neu: [['q-screener', 'Einfach'], ['q-screener-pro', 'Profi']],
  spec: { aufbau: ['Fragen als Chips (eine Zeile statt sieben Karten)', 'Deine Frage als neongrüne Karte mit Regel-Chips', 'Trefferzeile: Logo, Name, Profil klein, gesuchte Zahl', 'Profi: Bedingungen als Chips, Tabelle mit festem Kopf, stark = neongrün'],
    komponenten: ['Profil klein', 'Regel-Chip', 'Tabelle mit festem Kopf'],
    daten: ['unverändert'],
    weg: ['Stil-Name über jeder Trefferzeile', '„3 von 5 Faktoren stark“ → Profil', '„null“', 'Dunkler Profi-Modus'] } });
slide({ id: 'QX04', title: 'Anlagestile', route: '/quant/#/strategien', newRoute: '/quant/#/stile', now: 'Q03',
  sub: 'Heute: englische Fachnamen, Regeln als „Kurs läuft ≥ 80“. Neu: der deutsche Satz ist der Name, der Fachname klein darüber, Regeln als Chips mit Symbol. Ein Stil öffnet sich wie eine Reihe in Discover: dunkler Kopf, Regel als Balken, Liste mit Profilen.',
  neu: [['q-stile', 'Alle Anlagestile'], ['q-stil', 'Ein Stil: Solide und im Aufwind']],
  spec: { aufbau: ['Stil-Karte: Fachname klein, Satz groß, Trefferzahl, Regel-Chips, Logos, „seit gestern +2 · −1“', 'Stil ohne Daten als Fußnote statt eigener Karte', 'Stil-Seite: dunkler Kopf, „33 von 6.155“, „2 neu · 1 raus“, Regel mit Schwellen-Balken, Liste mit Profil', '„Wie gut war ein Stil früher?“ als Forschung'],
    komponenten: ['Regel-Chip', 'Schwellen-Balken', 'Kopf wie Discover-Reihe'],
    daten: ['unverändert'],
    weg: ['„Bekannte Namen in der Liste“ mit unbekannten Namen → „Die 33 Aktien“', 'Eigene Karte für „Earnings Revision Leader – nicht prüfbar“'] } });

chapter({ n: '03', title: 'Die Aktie', icon: 'i-grid', anchor: 'aktie', was: 'Gleicher Aufbau wie in Discover: <b>Profil, drei Sätze, Kapitel</b>. Nur die Perspektive ist eine andere.', pages: 'QX05–QX06' });
slide({ id: 'QX05', title: 'NVIDIA, Perspektive „Faktoren“', route: '/quant/#/aktie/NVDA', newRoute: '/aktie/NVDA?p=faktoren', now: 'Q07',
  sub: 'Heute: 6.128 px, zwei Leisten übereinander, Euro-Kopf, „Was spricht dafür, was dagegen“, Einstieg/Stop/Ziele. Neu: Profil groß, Quant in drei Sätzen, sechs Kapitel zugeklappt, ähnliche Profile. Gleiches Muster wie die Discover-Aktienseite, damit der Nutzer es nur einmal lernt.',
  neu: [['q-stock', 'Ganze Seite'], ['q-stock-ch', 'Kapitel 4 offen: Anlagestile']],
  spec: { aufbau: ['Aktienkopf C04 in Dollar + Perspektiven-Leiste, keine zweite Leiste', 'Profil groß (7 Zeilen), Hinweis „keine Gesamtnote“', 'Quant in drei Sätzen: Stärke, Schwäche, Zuletzt', 'Kapitel 1–6: Eigenschaften im Detail, Stärken und Schwächen laut Kennzahlen, Was hat sich bewegt, Anlagestile und Setup, Früher (Forschung), Geschäftszahlen', 'Anlagestile offen: je Stil die Bedingungen mit Haken und „es fehlen N Punkte“', 'Ähnliches Profil als Schiene'],
    komponenten: ['Profil groß, Story-Karte, Kapitelzeile (aus dem Discover-Konzept)', 'Bedingungszeile'],
    daten: ['factor-evidence-v1 (factors, change), heutige Quellen der Abschnitte'],
    weg: ['Schritt-Leiste Überblick · Eigenschaften · Stärken', '„Was sagt Quant insgesamt?“ mit drei Kacheln → Profil', '„Spricht dafür/dagegen“ → „Stärken und Schwächen laut Kennzahlen“', '„Einstieg, Stop, Ziele“ → Zone und Ungültig-Marke laut Methode', 'Euro im Kopf'] } });
slide({ id: 'QX06', title: 'Vergleich: Profil gegen Profil', route: '/quant/#/vergleich/NVDA,AMD', now: 'Q13',
  sub: 'Heute: Fachtabelle (ROIC, EV/Sales, 200DMA), bei AMD fast nur „–“ ohne Grund, „null“ am Ende. Neu: zwei Profile übereinander, zwei Sätze, Tabelle auf Wunsch, fehlende Werte mit Grund.',
  neu: [['q-compare', 'NVIDIA gegen AMD']],
  spec: { aufbau: ['Chips je Aktie (bis 4), „+ Aktie“', 'Je Eigenschaft zwei Balken (schwarz / neongrün) und zwei Zahlen', 'Zwei Sätze: wo wer vorne liegt', 'Tabelle aufklappbar, „–“ immer mit Grund'],
    komponenten: ['Vergleichsbalken', 'Story-Karte'],
    daten: ['factor-evidence-v1 für die Profile; Tabelle wie heute'],
    weg: ['„null“', 'Umbrechende Prozentwerte'] } });

chapter({ n: '04', title: 'Vertrauen', icon: 'i-book', anchor: 'vertrauen', was: 'Backtests heißen <b>Forschung</b>. Eine Zahl, ein Balken, ein Satz je Meldung.', pages: 'QX07–QX08' });
slide({ id: 'QX07', title: 'Backtests werden „Forschung“', route: '/quant/#/backtest', newRoute: '/quant/#/forschung', now: 'Q12',
  sub: 'Heute: altes Design, lange Erklärtexte, unterstrichene grüne Links, „Stand der Zertifizierung“ weit unten. Neu: oben das Etikett „Forschung, nicht zertifiziert“ und der Stand in drei Zahlen, darunter je Meldung ein Balken um die Null.',
  neu: [['q-backtest', 'Forschung']],
  spec: { aufbau: ['Etikett Forschung, nicht zertifiziert (CLAUDE.md)', 'Stand: 0 von 6 zertifiziert · 3 eingeschränkt · 3 sammeln', 'Marktweit geprüft: Name, Urteil, Balken um 0, Prozentpunkte', 'Sammelt Historie', 'Was zur Zertifizierung fehlt'],
    komponenten: ['Balken um die Null', 'C08 Urteil'],
    daten: ['quant/data/product/backtest-certification-v1.json und heutige Quellen'],
    weg: ['Grüne Rahmen, Verlauf, Hintergrund-Grafik', 'Lange Absätze → „?“'] } });
slide({ t: 'html', id: 'QX08', title: 'Wortwahl und Begriffe', sub: 'Teil davon ist Pflicht (docs/legal/WORTWAHL.md), Teil Verständlichkeit.', html: () => `<div class="xscroll"><table class="tbl"><thead><tr><th>Heute</th><th>Neu</th><th>Warum</th></tr></thead><tbody>${[
  ['Einstiegsmarke der Methode', 'Zone laut Methode', 'Wortwahl: Handlungsvorschlag'], ['Stopp-Marke, Stop-Loss', 'Ungültig-Marke laut Methode', 'Wortwahl: Anweisung'], ['Zielzone, Ziel 1, Zielbereich', 'entfällt', 'Wortwahl: Kursziel'], ['Was spricht dafür – und was dagegen?', 'Stärken und Schwächen laut Kennzahlen', 'Wortwahl'],
  ['Faktoren, Fragen, Eigenschaften, Scores', 'Eigenschaften (immer sieben, eine heute ohne Daten)', 'ein Begriff'], ['Strategien / Strategy Builder', 'Anlagestile', 'kein Handelsvokabular'], ['Radar', 'Meldungen', 'sagt, was es ist'], ['Backtesting', 'Forschung, nicht zertifiziert', 'CLAUDE.md'], ['Quality Compounder, GARP …', 'Verlässlich und wächst lange, Wachstum zum fairen Preis … (Fachname klein)', 'Deutsch zuerst']].map(r => `<tr><td class="mu"><s>${r[0]}</s></td><td><b>${r[1]}</b></td><td class="mu">${r[2]}</td></tr>`).join('')}</tbody></table></div>` });

chapter({ n: '05', title: 'Umsetzung', icon: 'layers', anchor: 'umsetzung', was: 'Nur Oberfläche und Texte. <b>Keine Fachmodelle, keine neuen Daten.</b>', pages: 'U1–U2' });
slide({ t: 'html', id: 'U1', title: 'Fahrplan', html: () => `<div class="plan" style="grid-template-columns:repeat(5,minmax(0,1fr))">${[
  ['PR 1', 'Wortwahl und Fehler', 'Einstieg/Stopp/Ziel, dafür/dagegen, „null“, Euro-Kopf, leere Symbole. Klein, sofort.'],
  ['PR 2', 'Profil-Baustein', 'Profil klein und groß als gemeinsamer Baustein unter assets/, ein Wort je Eigenschaft überall.'],
  ['PR 3', 'Start, Meldungen', 'Startseite neu, Radar wird Meldungsliste im neuen Design.'],
  ['PR 4', 'Screener, Anlagestile', 'Treffer mit Profil, Profi hell, Stile mit deutschem Namen, Stil-Seite.'],
  ['PR 5', 'Aktie, Vergleich, Forschung', 'Faktoren-Perspektive mit Profil und Kapiteln, Vergleich, Forschung.']].map(([a, b, c]) => `<div><span class="tag neu">${a}</span><b>${b}</b><p>${c}</p></div>`).join('')}</div>
<h3 style="margin-top:36px;font-size:22px;letter-spacing:-.02em">Von dir zu entscheiden</h3>
<ol class="dec">${[
  ['Neue Namen „Meldungen“ (statt Radar), „Anlagestile“ (statt Strategien), „Forschung“ (statt Backtests)?', 'Empfehlung: ja. Alte Adressen leiten weiter.'],
  ['Englische Stil-Namen ganz weg oder klein behalten?', 'Empfehlung: klein behalten, Profis suchen danach.'],
  ['„Früher in 70 % von 60 Fällen höher“ auf der Startseite zeigen?', 'Empfehlung: nur mit Etikett „Forschung, nicht zertifiziert“ oder erst auf der Aktie. Öffentliche Aussagen über frühere Kursverläufe sind ein Owner-Thema (CLAUDE.md).'],
  ['Profil-Baustein auch in Discover-Postern?', 'Empfehlung: nein, Discover bleibt beim Kurschart; das Profil gehört zu Quant.']].map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ol>` });
})();
