/* 09 · Screener: Satz statt Formular, Kriterien nach Perspektiven, Treffer als Aktienzeilen. */
(function () {
const { screen, slide, chapter, ic, hud, chart, mini, tf, chg, vd, help, lg, row, STOCK, D, S, de, pc, sect, kv, tile, navcard, pill, toggle, bars, search, intro, NAMES, WHAT, day, px } = VU;

/* ---------- Echte Werte: overlay/screener/data/universe-US_REAL.json (Stand 30.10.2026) ----------
   Ticker, Umsatzwachstum TTM %, Nettomarge %, KGV TTM, Börsenwert Mrd. $, Kurs 6 Monate %.
   Screen „stark wachsen und gut verdienen“ = revGrowth > 0,20 und netMargin > 0,15 → 182 Treffer, sortiert nach mcap. */
const R = [['NVDA', 83, 56, 25.87, 4973, 3], ['GOOGL', 22, 33, 14.61, 3383, -27], ['META', 28, 30, 20.98, 1583, 1], ['AVGO', 49, 36, 41.59, 1546, -23], ['LLY', 46, 32, 46.01, 1337, 47], ['MU', 256, 64, 11.91, 1001, 63], ['PLTR', 79, 36, 158.72, 440, 28], ['ORCL', 22, 25, 20.48, 376, -24], ['TXN', 20, 28, 39.02, 273, 7], ['ARM', 23, 18, 242.32, 219, -2], ['ADI', 34, 21, 49.54, 204, 5], ['MRVL', 31, 33, 64.82, 172, 19]];
const UNI = '5.616';
const mc = v => v >= 1000 ? de(v / 1000, 2) + ' Bio.' : de(v, 0) + ' Mrd.';
const SUB = { PLTR: 'Software für Datenanalyse', MRVL: 'Chips für Rechenzentren', ARM: 'Baupläne für Chips', LLY: 'Medikamente' };
const sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v), 0) + ' %';

/* Screener-Muster: Satz-Bauer. Lücken sind neongrüne Bausteine, „+“ fügt eine Eigenschaft an. */
const blank = (t, k = '') => `<span style="background:${k === 'add' ? 'transparent' : 'var(--lime)'};color:${k === 'add' ? 'var(--lime)' : '#000'};${k === 'add' ? 'border:1.5px dashed var(--lime);' : ''}border-radius:10px;padding:1px 8px;box-decoration-break:clone;-webkit-box-decoration-break:clone;white-space:nowrap">${t}</span>`;
const sentence = (parts, size = 25) => `<div style="font-size:${size}px;font-weight:900;letter-spacing:-.035em;line-height:1.38">${parts}</div>`;
const SENT = `Zeig mir Aktien, die ${blank('stark wachsen')} und ${blank('gut verdienen')} ${blank('+', 'add')}`;

/* Screener-Muster: Perspektiven-Gruppen (gleiche Icons wie die Perspektiven der Aktienseite). Zählung aus screener/engine/fields.js. */
const PG = [
  ['i-globe', 'Basis', 'Branche, Land, Börse, Größe', 15, 'Unternehmen + Größe & Markt'],
  ['fundamental', 'Zahlen', 'Wachstum, Marge, Bilanz, Bewertung', 37, 'Wachstum, Qualität, Bilanz, Bewertung'],
  ['quant', 'Faktoren', 'Qualität, Momentum, Risiko je 0–100', 11, 'Vision Universe'],
  ['technical', 'Chart', 'Trend, 200-Tage-Linie, RSI, Kursstärke', 41, 'Momentum + Technik'],
  ['supertrader', 'Methoden', 'Chartformationen, Chartbild, Wellen', 6, 'Technik (Formationen, TI)'],
  ['hedgefonds', 'Investoren', 'Analysten, Kursziele, Profi-Käufe', 7, 'Analysten & Estimates']
];
const pgrow = ([i, t, s, n], o = {}) => `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--a-line)">${i.startsWith('i-') ? `<span class="hud" style="width:40px;height:40px;border-radius:11px">${ic(i, 22)}</span>` : hud(i, 40, 11)}<div style="flex:1;min-width:0"><div class="bb">${t}${o.pro ? ' <span class="pro">PRO</span>' : ''}</div><div class="mu sm">${s}</div></div><span class="mu sm b num">${n}</span>${ic('i-next', 16)}</div>`;

/* Screener-Muster: Trefferzeile = Aktienzeile (C10) + Kennzahlen-Leiste der aktiven Filter. */
const metric = (l, v, on) => `<div><div class="mu" style="font-size:10.5px;font-weight:700">${l}</div><div class="bb num" style="font-size:14px;${on ? 'background:var(--lime);border-radius:6px;padding:0 5px;display:inline-block;color:#000' : ''}">${v}</div></div>`;
const hit = ([t, g, m, pe, cap, p6], o = {}) => `<div style="border-top:1px solid var(--a-line)">${row(t, o.sub || SUB[t])}<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:0 0 11px 52px;margin-top:-3px">${metric('Umsatz', sg(g), 1)}${metric('Marge', de(m, 0) + ' %', 1)}${metric('Wert in $', mc(cap))}${metric('KGV', de(pe, 1))}</div></div>`;

/* Screener-Muster: Trichter (wie viele Aktien jede Regel übrig lässt). Echte Zählungen. */
const funnel = (rows) => rows.map(([l, n, sub], k) => `<div style="padding:10px 0;border-top:1px solid var(--a-line)"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><div style="min-width:0"><div class="bb sm">${k ? `<span class="mu">und </span>` : ''}${l}</div>${sub ? `<div class="mu xs">${sub}</div>` : ''}</div><span class="bb num" style="font-size:17px">${n}</span></div><div class="bar" style="margin-top:6px;height:7px"><i class="${k === rows.length - 1 ? 'l' : ''}" style="width:${Math.max(1.5, parseInt(String(n).replace('.', ''), 10) / 5616 * 100).toFixed(1)}%"></i></div></div>`).join('');

const foot = `<div style="margin-top:22px;padding-top:12px;border-top:1px solid var(--a-line)" class="mu xs">Daten 30.10.2026 · US-Aktien · SEC-Zahlen und Tagesschlusskurse. Filter beschreiben Kennzahlen, sie sind kein Anlageurteil und keine Kaufempfehlung.</div>`;

chapter({ n: '09', title: 'Screener', icon: 'screener', anchor: 'screener', was: 'Einsteiger sagen in einem Satz, was sie suchen. Profis bauen Regeln. <b>Beide sehen sofort, wie viele von 5.616 Aktien übrig bleiben.</b>', pages: 'S01–S05 · 5 Seiten' });

/* ================= S01 · Übersicht ================= */
screen('s01-a', { world: 'screener', dock: 0, h: 1930, body: `
${intro('screener', 'Finde Aktien, die zu dir passen.', 'Sag in einem Satz, was dir wichtig ist. Wir zeigen, welche der 5.616 US-Aktien passen.')}
<div class="seg" style="margin-top:16px"><span class="on">Einfach</span><span>Profi</span></div>
<div class="card ink" style="margin-top:12px;padding:18px">
  <div class="ltag" style="color:#8a8a8a">Dein Satz</div>
  <div style="margin-top:8px">${sentence(SENT)}</div>
  <div class="btn" style="margin-top:16px">${ic('i-list')}182 Treffer zeigen</div>
  <div class="xs" style="color:#9b9b9b;margin-top:10px;text-align:center">Umsatz wächst über 20 % · Gewinnmarge über 15 %</div>
</div>
${sect('Fertige Ideen', 'Alle')}
<div class="grid2">${[['fundamental', 'Wachsen stark', 'Umsatz +20 % in 12 Monaten', '1.005'], ['fundamental', 'Verdienen Geld', 'Gewinnmarge über 0 %', '2.144'], ['technical', 'Im Aufwärtstrend', 'Kurs über 200-Tage-Linie', '1.939'], ['i-star', 'Wachsen und verdienen', 'Umsatz +20 %, Marge 15 %', '182']].map(([i, t, s, n], k) => `<div class="card${k === 3 ? ' lime' : ''}" style="padding:13px;display:grid;gap:8px">${i.startsWith('i-') ? `<span class="hud" style="width:34px;height:34px;border-radius:10px">${ic(i, 18)}</span>` : hud(i, 34, 10)}<div><div class="bb" style="font-size:15px;line-height:1.15">${t}</div><div class="xs" style="opacity:.7;margin-top:2px">${s}</div></div><div class="bb num" style="font-size:22px;letter-spacing:-.03em">${n}<span class="xs b" style="opacity:.6"> Treffer</span></div></div>`).join('')}</div>
<div style="margin-top:10px">${help('200-Tage-Linie: der Durchschnittskurs der letzten 200 Handelstage. Liegt der Kurs darüber, läuft der Trend eher nach oben.')}</div>
${sect('Kriterien nach Perspektive')}
<div class="mu sm" style="margin:-4px 0 6px">Dieselben sechs Blickwinkel wie auf jeder Aktienseite.</div>
${PG.map(p => pgrow(p, { pro: p[1] === 'Methoden' || p[1] === 'Investoren' })).join('')}
<div class="card" style="margin-top:14px;display:flex;align-items:center;gap:14px">
  <div style="font-size:38px;font-weight:900;letter-spacing:-.05em;line-height:1" class="num">${UNI}</div>
  <div><div class="bb sm">US-Aktien im Universum</div><div class="mu xs">Stammaktien an der Hauptbörse · Stand 30.10.2026</div></div>
</div>
<div style="margin-top:10px">${help('Universum: alle Aktien, die der Screener durchsucht. ETFs und Zweitgattungen zählen nicht mit.')}</div>
${sect('Deine Screens', 'Gespeichert')}
<div class="card line" style="display:flex;gap:12px;align-items:center">${vd('o', 'Noch keiner')}<span class="sm">Speichere einen Screen. Beim nächsten Datenstand siehst du, welche Aktien neu dazukommen.</span></div>
<div style="margin-top:12px">${navcard('quant', 'Regeln mit Geschichte testen', 'Quant · Strategien und Backtests')}</div>
${foot}` });

screen('s01-b', { world: 'screener', dock: 0, dk: 1, h: 1190, body: `
${intro('screener', 'Profi-Screener', '')}
<div class="seg" style="margin-top:14px"><span>Einfach</span><span class="on">Profi</span></div>
<div style="margin-top:14px">${search('Kriterium suchen, z. B. ROIC, RSI, KGV …')}</div>
<div class="chips" style="margin-top:12px;flex-wrap:wrap">${['Umsatz > 20 %', 'Marge > 15 %', 'Kurs > SMA 200', 'KGV < 30'].map((t, k) => `<span class="chip ${k < 4 ? 'lm' : ''}" style="height:32px;font-size:13px">${t}</span>`).join('')}</div>
<div class="card" style="margin-top:12px;display:flex;align-items:baseline;gap:8px"><span class="num" style="font-size:40px;font-weight:900;letter-spacing:-.05em;color:var(--lime)">39</span><span class="bb">von ${UNI}</span><span class="mu sm" style="margin-left:auto">4 Regeln</span></div>
${sect('Alle 117 Kriterien')}
${PG.map(p => pgrow(p)).join('')}
<div class="card" style="margin-top:14px;padding:12px">${[['Quant Score', 'noch nicht freigegeben'], ['Analystenkonsens', 'keine lizenzierte Quelle'], ['Erwartetes KGV', 'keine lizenzierte Quelle']].map(([k, v]) => `<div class="kv"><span class="sm b">${k}</span>${vd('o', v)}</div>`).join('')}</div>
<div style="margin-top:10px">${help('Kriterien ohne echte Datenquelle bleiben sichtbar, aber gesperrt. Wir simulieren nichts.')}</div>` });

slide({ id: 'S01', title: 'Screener · Übersicht', route: '/screener/', now: 'S01',
  sub: 'Heute: Kacheln nach Fachgruppen und ein Formular. Neu: ein Satz für Einsteiger, fertige Ideen mit echter Trefferzahl und Kriterien nach denselben Perspektiven wie die Aktienseite.',
  neu: [['s01-a', 'Einfach: Satz, fertige Ideen, Perspektiven'], ['s01-b', 'Profi: Suche, Regeln, alle 117 Kriterien']],
  spec: { aufbau: ['Kopf: Titel + ein Satz, Umschalter Einfach / Profi', 'Satz-Bauer (schwarze Karte): „Zeig mir Aktien, die … und …“ mit neongrünen Lücken, Knopf „N Treffer zeigen“ mit Live-Zählung', 'Fertige Ideen: 4 Karten mit echter Trefferzahl (Wachsen stark 1.005, Verdienen Geld 2.144, Aufwärtstrend 1.939, Wachsen und verdienen 182)', 'Kriterien nach Perspektive: Basis, Zahlen, Faktoren, Chart, Methoden (PRO), Investoren (PRO) mit Anzahl', 'Universum-Kachel 5.616 + Erklärung', 'Deine Screens (Leerzustand) und Brücke zu Quant-Backtests', 'Profi: Kriteriensuche, aktive Regeln als Chips, Trefferzahl groß, gesperrte Kriterien ehrlich mit „Keine Aussage“'], komponenten: ['C01 Kopfzeile', 'C02 Produkt-Leiste (Screener · Filter · Treffer · Gespeichert · Menü)', 'C08 Urteil', 'C09 Erklärung', 'C11 Kachel', 'C12 Navigationskarte', 'C14 Reiter', 'C18 Leerer Zustand', 'C19 PRO-Marke', 'C20 Suche', 'Screener-Muster: Satz-Bauer', 'Screener-Muster: Perspektiven-Gruppen'], daten: ['screener/data/universe-US_REAL.json (count 5.616, cols revGrowth, netMargin, distSma200, pe)', 'screener/engine/fields.js (GROUPS, 117 Kriterien, available:false = gesperrt)', 'Ideen-Zählungen live aus der Engine (query.js), nie hart kodiert'], weg: ['Großes Trichter-Bild und Hero-Icon', 'Gruppen-Kacheln „Unternehmen · Größe & Markt · …“ werden sechs Perspektiven; die alten Gruppen bleiben als Unterüberschriften in „Zahlen“ und „Chart“', '„Watchlist“ verlässt die Leiste: liegt unter Gespeichert und im Menü (Mein Bereich)', 'Modus-Umschalter wandert von unten nach oben'] } });

/* ================= S02 · Filter hinzufügen ================= */
const choice = (t, s, n, on) => `<div class="card${on ? ' ink' : ''}" style="padding:12px;display:flex;align-items:center;gap:12px"><span style="width:26px;height:26px;border-radius:50%;flex:none;display:grid;place-items:center;${on ? 'background:var(--lime);color:#000' : 'border:2px solid var(--a-line)'}">${on ? ic('i-check', 15) : ''}</span><div style="flex:1;min-width:0"><div class="bb">${t}</div><div class="xs" style="opacity:.65">${s}</div></div><span class="bb num sm" style="opacity:${on ? 1 : .7}">${n}</span></div>`;
screen('s02-a', { world: 'screener', dock: 1, h: 1480, body: `
<div class="ltag">Screen bauen · Einfach</div>
<div class="card ink" style="margin-top:10px;padding:16px">${sentence(SENT, 22)}</div>
<div style="display:flex;align-items:baseline;gap:8px;margin-top:14px"><span class="num" style="font-size:44px;font-weight:900;letter-spacing:-.05em">182</span><span class="bb">von ${UNI} Aktien</span></div>
<div class="bar" style="height:8px;margin-top:4px"><i class="l" style="width:3.2%"></i></div>
${sect('Was ist dir noch wichtig?')}
<div class="stack">
${choice('stark wachsen', 'Umsatz +20 % in 12 Monaten', '1.005', 1)}
${choice('gut verdienen', 'Gewinnmarge über 15 %', '689', 1)}
${choice('günstig sind', 'KGV unter 20', '→ 80', 0)}
${choice('im Aufwärtstrend sind', 'Kurs über der 200-Tage-Linie', '→ 71', 0)}
${choice('mehr Geld als Schulden haben', 'Netto-Cash über 0', '→ 20', 0)}
${choice('ruhig schwanken', 'Schwankung unter 25 % im Jahr', '→ 10', 0)}
</div>
<div style="margin-top:12px" class="stack">${help('Gewinnmarge: wie viel von 100 $ Umsatz am Ende als Gewinn bleibt. 15 % heißt 15 $.')}${help('KGV: wie viele Jahresgewinne du für die Aktie zahlst. Kleiner heißt günstiger.')}${help('„→ 80“ heißt: Mit dieser Eigenschaft blieben 80 Treffer übrig.')}</div>
${sect('Oder nach Perspektive wählen')}
${PG.slice(0, 4).map(p => pgrow(p)).join('')}
<div class="btn" style="margin-top:18px">182 Treffer zeigen</div>
<div class="btn line" style="margin-top:10px">${ic('i-bookmark')}Screen speichern</div>` });

const HB = bars([['  ≤0', 921], ['  0–5', 611], ['  5–10', 496], ['  10–15', 348], ['  über 15', 689]], { w: 354, h: 92 });
screen('s02-b', { world: 'screener', dock: 1, h: 1180, body: `
<div class="ltag">Screen bauen · Profi</div>
<div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><span class="num" style="font-size:44px;font-weight:900;letter-spacing:-.05em">39</span><span class="bb">Treffer</span><span class="mu sm" style="margin-left:auto">UND-Verknüpfung</span></div>
${sect('Deine Regeln', '+ Regel')}
<div class="card" style="padding:4px 14px">${funnel([['Alle US-Aktien', UNI], ['Umsatzwachstum (TTM) > 20 %', '1.005', 'Zahlen · Wachstum'], ['Nettomarge > 15 %', '182', 'Zahlen · Qualität'], ['Kurs vs. SMA 200 > 0 %', '71', 'Chart · Trend'], ['KGV (TTM) < 30', '39', 'Zahlen · Bewertung']])}</div>
<div style="margin-top:10px">${help('Der Trichter zeigt, welche Regel am meisten aussortiert. So siehst du sofort, wo du lockern kannst.')}</div>
${sect('Kriterien')}
<div style="display:flex;gap:6px;overflow:hidden">${PG.map(([i, t], k) => `<span class="chip${k === 1 ? ' on' : ''}" style="height:34px;font-size:13px;padding:0 11px">${i.startsWith('i-') ? ic(i, 15) : ic(i, 15)}${t}</span>`).join('')}</div>
<div style="margin-top:8px">${['Umsatzwachstum (TTM)', 'Umsatzwachstum p. a. (3 J.)', 'Bruttomarge', 'Nettomarge', 'Kapitalrendite (ROIC)', 'Verschuldungsgrad (D/E)', 'KGV (TTM)', 'Free-Cashflow-Rendite'].map((l, k) => `<div class="kv"><span class="sm b">${l}</span>${k === 0 || k === 3 || k === 6 ? `<span class="chip lm" style="height:26px;font-size:11.5px;padding:0 9px">aktiv</span>` : ic('i-plus', 18)}</div>`).join('')}</div>` });

screen('s02-c', { world: 'screener', dock: 1, body: `
<div class="ltag">Screen bauen · Profi</div><div class="mt" style="margin-top:6px">39 Treffer</div>
<div class="card" style="margin-top:12px;padding:4px 14px">${funnel([['Alle US-Aktien', UNI], ['Umsatzwachstum > 20 %', '1.005']])}</div>`,
  overlay: `<div class="ovl"></div><div class="sheet"><div class="grab"></div>
<div style="display:flex;align-items:center;gap:10px">${hud('fundamental', 34, 10)}<div><div class="ltag">Zahlen · Qualität</div><div class="mt">Nettomarge</div></div></div>
<div style="margin-top:10px">${help('Wie viel vom Umsatz als Gewinn übrig bleibt, nach allen Kosten und Steuern.')}</div>
<div class="seg" style="margin-top:14px"><span>über 0 %</span><span>über 10 %</span><span class="on">über 15 %</span><span>über 25 %</span></div>
<div class="ltag" style="margin-top:16px">So verteilen sich die Aktien (Marge in %)</div><div class="mu xs" style="margin-top:2px">Neongrün: passt zur Regel</div>
<div style="margin-top:8px">${HB}</div>
<div class="kv" style="margin-top:6px"><span class="sm b">Passen zur Regel</span><span class="bb num">689</span></div>
<div class="kv"><span class="sm b">Ohne Angabe (fallen raus)</span><span class="bb num">2.551</span></div>
<div class="btn" style="margin-top:14px">Regel übernehmen · 182 Treffer</div></div>` });

slide({ id: 'S02', title: 'Screener · Filter hinzufügen', route: '/screener/?view=build', now: 'S02',
  sub: 'Heute: ein leeres Feld, Kacheln mit Fachgruppen, drei Vorschläge. Neu: Einsteiger kreuzen Eigenschaften in Alltagssprache an und sehen vorher, wie viele Treffer bleiben. Profis sehen ihre Regeln als Trichter.',
  neu: [['s02-a', 'Einfach: Eigenschaften ankreuzen, Live-Zählung'], ['s02-b', 'Profi: Regeln als Trichter, Kriterien nach Perspektive'], ['s02-c', 'Sheet: ein Kriterium mit Verteilung']],
  spec: { aufbau: ['Einfach: Satz oben (sticky), Trefferzahl groß mit Anteilsbalken', '6 Eigenschaften in Alltagssprache mit Zielzahl („→ 80“ = Treffer, wenn hinzugefügt): stark wachsen, gut verdienen, günstig, Aufwärtstrend, mehr Geld als Schulden, ruhig', 'Erklärungen zu Gewinnmarge, KGV, Pfeilzahl', 'Perspektiven als Einstieg in alle Kriterien', 'Knöpfe: „182 Treffer zeigen“, „Screen speichern“', 'Profi: Trichter (alle → Regel 1 → Regel 2 …) mit echter Zählung je Stufe, Reiter der Perspektiven, Kriterienliste mit „aktiv“ / „+“', 'Sheet je Kriterium: Erklärung, Schwellen-Reiter, Verteilung als Balken (C17), Zahl passend / ohne Angabe'], komponenten: ['C09 Erklärung', 'C14 Reiter', 'C16 Sheet', 'C17 Balken (Verteilung)', 'Screener-Muster: Satz-Bauer', 'Screener-Muster: Eigenschaft mit Zielzahl', 'Screener-Muster: Trichter'], daten: ['screener/data/universe-US_REAL.json: revGrowth > 0,2 → 1.005; netMargin > 0 → 2.144; > 0,15 → 689; beides → 182; + distSma200 > 0 → 71; + 0 < pe < 30 → 39; + pe < 20 → 80; + netCash > 0 → 20; + vol252 < 0,25 → 10', 'Verteilung netMargin: 921 / 611 / 496 / 348 / 224 / 245 / 220, ohne Angabe 2.551', 'screener/engine/query.js (Zählung je Stufe)'], weg: ['Leeres Gestrichel-Feld „Noch keine Filter“', 'Gruppen-Kacheln als erster Schritt (jetzt Perspektiven unten bzw. Reiter)', '„Link teilen“ und „Strategien & Backtests“ wandern in das Menü der Trefferliste (S03)', 'Vorschläge bleiben, jetzt als Eigenschaften mit Zielzahl'] } });

/* ================= S03 · Treffer ================= */
screen('s03-a', { world: 'screener', dock: 2, h: 2250, body: `
<div class="card ink" style="padding:15px">${sentence(SENT, 19)}<div style="display:flex;align-items:baseline;gap:8px;margin-top:10px"><span class="num" style="font-size:38px;font-weight:900;letter-spacing:-.05em;color:var(--lime)">182</span><span class="bb">von ${UNI} Aktien</span></div></div>
<div class="chips" style="margin-top:12px">${pill('Umsatz > 20 % ×', 'lm')}${pill('Marge > 15 % ×', 'lm')}${pill('+ Filter')}</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"><span class="sm b">Sortiert nach Börsenwert</span><span class="chip" style="height:32px;font-size:13px">${ic('i-filter', 15)}Sortieren</span></div>
<div class="card" style="margin-top:12px;padding:12px 14px">
  <div class="ltag">Warum passt NVIDIA?</div>
  <div class="kv" style="border:0"><span class="sm b">Umsatz +83 % <span class="mu">(gesucht: über 20 %)</span></span>${vd('s', 'passt')}</div>
  <div class="kv"><span class="sm b">Marge 56 % <span class="mu">(gesucht: über 15 %)</span></span>${vd('s', 'passt')}</div>
</div>
<div style="margin-top:6px">${R.map(r => hit(r)).join('')}</div>
<div class="btn line" style="margin-top:14px">Weitere 170 Treffer laden</div>
<div class="grid2" style="margin-top:12px"><div class="btn">${ic('i-bookmark')}Speichern</div><div class="btn ink">${ic('i-share')}Teilen</div></div>
<div style="margin-top:12px">${navcard('quant', 'Diesen Screen in Quant testen', 'Wie hätte er sich früher geschlagen?')}</div>
<div style="margin-top:12px">${help('Grün markiert sind die Kennzahlen deiner Filter. Tippe eine Aktie an, um sie zu öffnen.')}</div>
${foot}` });

screen('s03-b', { world: 'screener', dock: 2, body: `${STOCK('Zahlen')}
<div class="card ink" style="margin-top:12px;padding:14px"><div class="ltag" style="color:#8a8a8a">Aus deinem Screen · Treffer 1 von 182</div><div class="kv" style="border:0"><span class="sm b">Umsatz +83,4 %</span>${vd('s', 'über 20 %')}</div><div class="kv" style="border-color:#262626"><span class="sm b">Nettomarge 55,6 %</span>${vd('s', 'über 15 %')}</div></div>
${sect('Umsatz je Geschäftsjahr')}${bars(D.rev, { w: 354, h: 92 })}
<div class="grid2" style="margin-top:10px">${tile('Umsatz 12 Monate', '303,0 Mrd. $', '+83,4 %')}${tile('KGV', '25,9', 'Bewertung')}</div>
<div style="display:flex;gap:8px;margin-top:12px"><span class="chip" style="flex:1;justify-content:center">${ic('i-back', 15)}Treffer</span><span class="chip on" style="flex:1;justify-content:center">Alphabet${ic('i-next', 15)}</span></div>` });

screen('s03-c', { world: 'screener', dock: 2, body: `
<div class="card ink" style="padding:15px"><div class="sm" style="opacity:.75">6 Regeln aktiv</div><div style="display:flex;align-items:baseline;gap:8px;margin-top:4px"><span class="num" style="font-size:38px;font-weight:900;letter-spacing:-.05em;color:var(--lime)">0</span><span class="bb">Treffer</span></div></div>
<div class="card" style="margin-top:12px;display:flex;gap:10px;align-items:center">${vd('o', 'Keine Treffer')}<span class="sm">Diese Mischung hat heute keine US-Aktie.</span></div>
${sect('Lockere eine Regel')}
${[['ruhig schwanken', '2'], ['KGV unter 10', '1'], ['mehr Geld als Schulden', '1']].map(([t, n]) => `<div class="card" style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:12px"><div style="flex:1"><div class="mu xs b">Ohne</div><div class="bb">„${t}“</div></div><span class="bb num" style="font-size:20px">${n}</span><span class="sm mu">Treffer</span>${ic('i-next', 16)}</div>`).join('')}
<div style="margin-top:12px">${help('Wir rechnen für jede Regel aus, wie viele Aktien ohne sie passen würden.')}</div>
<div class="btn line" style="margin-top:14px">Alle Regeln ansehen</div>` });

slide({ id: 'S03', title: 'Screener · Treffer', route: '/screener/?view=results', now: 'S03',
  sub: 'Heute: 5.616 große Karten mit rot-grünen Zahlen, ohne Bezug zu den Filtern. Neu: Treffer als Aktienzeile mit dem einen Mini-Chart, die Kennzahlen deiner Filter markiert, „Warum passt sie?“ und ein ehrlicher Leerzustand.',
  neu: [['s03-a', 'Trefferliste: Satz, Chips, Zeilen'], ['s03-b', 'Aktie öffnen: Perspektive „Zahlen“, Screener-Leiste bleibt'], ['s03-c', 'Leerzustand: welche Regel lockern']],
  spec: { aufbau: ['Kopf (schwarz): Satz + Trefferzahl', 'Aktive Filter als neongrüne Chips (× entfernt), „+ Filter“', 'Sortierung (Börsenwert, Wachstum, Marge, Kurs 6 M.)', '„Warum passt …?“ für den ersten Treffer, je Regel ein Urteil', 'Trefferzeilen: Aktienzeile (Logo, Name, Mini-Chart 1 J., Kurs, Tagesbewegung) + Leiste mit 4 Kennzahlen, die Filterkennzahlen neongrün', 'Weitere laden, Speichern, Teilen, in Quant testen', 'Aktie öffnen: eine Aktienseite, Perspektive passend zur meistgenutzten Filtergruppe (hier „Zahlen“), Karte „Aus deinem Screen“, Vor/Zurück durch die Treffer', 'Leerzustand: 0 Treffer + je Regel „ohne diese Regel: N Treffer“'], komponenten: ['C04 Aktienkopf', 'C05 Perspektiven-Leiste', 'C07 Kursbewegung', 'C08 Urteil', 'C10 Aktienzeile', 'C17 Balken', 'C18 Leerer Zustand', 'Screener-Muster: Trefferzeile mit Filterkennzahlen', 'Screener-Muster: Warum passt sie?', 'Screener-Muster: Regel lockern'], daten: ['screener/data/universe-US_REAL.json: s, revGrowth, netMargin, pe, mcap, perf6m', 'Mini-Chart: discover/data/stocks (Tagesschluss, 1 Jahr)', 'Leerzustand (6 Regeln): ohne vol252 → 2, ohne pe < 10 → 1, ohne netCash > 0 → 1'], weg: ['Große Karten mit 4 Kennzahlen ohne Filterbezug', 'Rot/Grün für Kurse (Plus neongrün, Minus schwarz)', 'Ungefilterte Liste aller 5.616 Aktien als Startzustand (ohne Filter führt „Treffer“ zum Satz-Bauer)', 'Lesezeichen je Karte → Herz im Aktienkopf'] } });

/* ================= S04 · Gespeichert ================= */
const saved = (t, s, n, nw, on) => `<div class="card" style="padding:14px"><div style="display:flex;align-items:flex-start;gap:10px"><div style="flex:1;min-width:0"><div class="bb">${t}</div><div class="mu xs" style="margin-top:2px">${s}</div></div>${toggle(on)}</div><div style="display:flex;align-items:center;gap:8px;margin-top:10px"><span class="num bb" style="font-size:26px;letter-spacing:-.04em">${n}</span><span class="sm mu b">Treffer</span><span style="margin-left:auto">${nw}</span></div></div>`;
screen('s04-a', { world: 'screener', dock: 3, h: 1150, body: `
<div class="lt">Gespeichert</div>
<div class="seg" style="margin-top:14px"><span class="on">Screens</span><span>Watchlist</span></div>
<div class="stack" style="margin-top:14px">
${saved('Wachsen und verdienen', 'Umsatz > 20 % · Marge > 15 %', '182', pill('+3 neu · Beispiel', 'lm'), 1)}
${saved('Wachstum im Trend <span class="pro">PRO</span>', 'Umsatz > 20 % · Marge > 15 % · Kurs > SMA 200 · KGV < 30', '39', pill('±0 · Beispiel'), 1)}
${saved('Günstige Gewinner', 'Umsatz > 20 % · Marge > 15 % · KGV < 20', '80', pill('−2 · Beispiel'), 0)}
</div>
<div style="margin-top:12px">${help('Schalter an: Wir melden dir, wenn nach dem Datenlauf Aktien neu in deinen Screen kommen oder herausfallen.')}</div>
${sect('Neu in „Wachsen und verdienen“', 'Alle')}
<div class="mu xs b" style="margin:-4px 0 4px">Beispiel für die Darstellung</div>
${row('MRVL', 'neu im Screen')}${row('ADI', 'neu im Screen')}${row('TXN', 'neu im Screen')}
${sect('Zuletzt verwendet')}
<div class="card line sm">Wachsen und verdienen · heute</div>` });

screen('s04-b', { world: 'screener', dock: 3, body: `
<div class="lt">Gespeichert</div>
<div class="seg" style="margin-top:14px"><span class="on">Screens</span><span>Watchlist</span></div>
<div class="card" style="margin-top:18px;padding:22px;text-align:center"><div style="display:flex;justify-content:center">${hud('screener', 56, 16)}</div><div class="mt" style="margin-top:14px">Noch keine Screens</div><p class="mu sm" style="margin-top:8px">Bau einen Satz, speichere ihn. Nach jedem Datenlauf siehst du, welche Aktien neu dazukommen.</p><div class="btn" style="margin-top:16px">Ersten Screen bauen</div></div>
${sect('Oder eine fertige Idee')}
<div class="stack">${navcard('fundamental', 'Wachsen und verdienen', '182 Treffer')}${navcard('technical', 'Im Aufwärtstrend', '1.939 Treffer')}</div>` });

slide({ id: 'S04', title: 'Screener · Gespeichert', route: '/screener/?view=saved', now: 'S04',
  sub: 'Heute nur ein Leerzustand. Neu: gespeicherte Screens als Karten mit Trefferzahl, Veränderung seit dem letzten Datenlauf und Benachrichtigung.',
  neu: [['s04-a', 'Mit Screens: Zahl, Veränderung, Benachrichtigen'], ['s04-b', 'Leerzustand mit fertigen Ideen']],
  spec: { aufbau: ['Titel, Reiter Screens / Watchlist', 'Karte je Screen: Name, Regeln als Text, Trefferzahl, Veränderung seit letztem Datenlauf (+neu / −raus), Schalter Benachrichtigen', 'Liste „Neu in …“ als Aktienzeilen', 'Zuletzt verwendet', 'Leerzustand: Erklärung, Knopf „Ersten Screen bauen“, 2 fertige Ideen'], komponenten: ['C08 Urteil', 'C09 Erklärung', 'C10 Aktienzeile', 'C12 Navigationskarte', 'C14 Reiter', 'C15 Schalter', 'C18 Leerer Zustand', 'C19 PRO-Marke', 'Screener-Muster: Screen-Karte mit Veränderung'], daten: ['Konto: gespeicherte Abfragen (screener/engine/store.js, mit Konto: workers/vu-account)', 'Veränderung: Vergleich der Treffermengen zweier Datenläufe (universe asOf)', 'Veränderungszahlen und „neu“-Liste im Mockup sind Beispiel'], weg: ['„Zuletzt verwendet“ als eigener leerer Block ohne Inhalt', 'Großer Leerzustand ohne Vorschlag'] } });

/* ================= S05 · Watchlist ================= */
screen('s05-a', { world: 'screener', dock: 3, body: `
<div class="lt">Gespeichert</div>
<div class="seg" style="margin-top:14px"><span>Screens</span><span class="on">Watchlist</span></div>
<div class="card" style="margin-top:14px;display:flex;gap:10px;align-items:center;padding:12px">${ic('i-heart', 20)}<span class="sm"><b>Eine Watchlist für alle Welten.</b> Dieselbe Liste wie in Discover und Mein Bereich.</span></div>
<div class="mu xs b" style="margin-top:12px">Beispiel-Liste</div>
${row('NVDA', 'in 1 Screen')}${row('MU', 'in 1 Screen')}${row('AAPL', 'in keinem Screen')}${row('MSFT', 'in keinem Screen')}${row('AMD', 'in keinem Screen')}
<div style="margin-top:12px">${help('„In 1 Screen“: Die Aktie passt heute zu einem deiner gespeicherten Screens. Tippen zeigt, zu welchem.')}</div>
<div class="grid2" style="margin-top:14px"><div class="btn ink">Als Screen filtern</div><div class="btn line">Bearbeiten</div></div>` });

screen('s05-b', { world: 'screener', dock: 3, body: `
<div class="lt">Gespeichert</div>
<div class="seg" style="margin-top:14px"><span>Screens</span><span class="on">Watchlist</span></div>
<div class="card" style="margin-top:18px;padding:22px;text-align:center"><div style="display:flex;justify-content:center"><span class="hud" style="width:56px;height:56px;border-radius:16px">${ic('i-heart', 30)}</span></div><div class="mt" style="margin-top:14px">Noch keine Aktien gemerkt</div><p class="mu sm" style="margin-top:8px">Tippe auf einer Aktienseite oben rechts auf das Herz. Die Aktie erscheint hier und in jeder Welt.</p></div>
${sect('Aus deinem letzten Screen')}
${row('NVDA')}${row('MU')}` });

slide({ id: 'S05', title: 'Screener · Watchlist', route: '/screener/?view=watchlist', newRoute: '/screener/?view=saved&tab=watchlist', now: 'S05',
  sub: 'Heute ein eigener Platz in der Leiste, meist leer. Neu: Reiter unter „Gespeichert“, dieselbe Watchlist wie überall, mit Bezug zu deinen Screens.',
  neu: [['s05-a', 'Watchlist mit „passt zu Screen“'], ['s05-b', 'Leerzustand mit Vorschlägen']],
  spec: { aufbau: ['Gespeichert, Reiter „Watchlist“ aktiv', 'Hinweis: eine Liste für alle Welten', 'Aktienzeilen, Untertitel „in N Screens“ bzw. „in keinem Screen“ (Tippen zeigt welche)', 'Knöpfe: Als Screen filtern (Watchlist als Universum), Bearbeiten', 'Leerzustand: Herz erklären, Treffer aus letztem Screen anbieten'], komponenten: ['C09 Erklärung', 'C10 Aktienzeile', 'C14 Reiter', 'C18 Leerer Zustand'], daten: ['Watchlist aus dem Konto (docs/accounts/WATCHLIST.md), lokal als Rückfall', 'Abgleich mit gespeicherten Screens über screener/engine'], weg: ['Eigener Platz „Watchlist“ in der Produkt-Leiste (jetzt Reiter in „Gespeichert“ und im Menü unter Mein Bereich)'] } });
})();
