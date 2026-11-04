/* 05 · Fundamental: Übersicht, Entdecken/Ranglisten, Rangliste Wachstum, Suche, Methodik, Aktie Perspektive „Zahlen“. */
(function () {
const { screen, slide, chapter, ic, hud, chart, tf, chg, vd, help, lg, row, STOCK, D, de, sect, kv, tile, navcard, pill, toggle, bars, NV, search, intro } = VU;

/* ---------- Hilfen dieser Welt ---------- */
const T = D.tracks;
const mrd = v => de(v / 1e9, 1) + ' Mrd. $';
const H1 = (title, lead) => `<div class="lt" style="margin-top:4px">${title}</div>${lead ? `<p class="mu" style="margin-top:6px;font-size:15px">${lead}</p>` : ''}`;
const seg = (a, on, mt = 14) => `<div class="seg" style="margin-top:${mt}px">${a.map(x => `<span class="${x === on ? 'on' : ''}">${x}</span>`).join('')}</div>`;
/* Fundamental-Muster: Kennzahl-Kachel mit „?“ und einem Satz Alltagssprache */
const ktile = (label, value, sub, why) => `<div class="card" style="padding:12px;display:flex;flex-direction:column;gap:2px"><div style="display:flex;align-items:center;gap:6px"><span class="mu xs b" style="flex:1">${label}</span><span style="width:18px;height:18px;border-radius:50%;background:var(--a-ink);color:var(--a-inv);display:grid;place-items:center;font-size:11px;font-weight:900">?</span></div><div class="bb num" style="font-size:21px">${value}</div><div class="mu xs">${sub}</div><div class="xs" style="margin-top:6px;line-height:1.35;border-top:1px solid var(--a-line);padding-top:6px">${why}</div></div>`;
/* Fundamental-Muster: Firmenkarte mit 3 Balken (Werte aus Aufnahme F02) */
const fbar = (l, v, w, lime) => `<div style="margin-top:7px"><div style="display:flex;justify-content:space-between" class="xs"><span class="mu b">${l}</span><b class="num">${v}</b></div><div class="bar" style="height:6px;margin-top:3px"><i class="${lime ? 'l' : ''}" style="width:${w}%"></i></div></div>`;
const fco = (t, n, um, g, nm, fm, kgv) => `<div class="card" style="padding:13px"><div style="display:flex;align-items:center;gap:10px"><span class="lg">${t}</span><div style="flex:1;min-width:0"><b class="sm" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n}</b><span class="mu xs">Umsatz ${um} · KGV ${kgv}</span></div>${ic('i-next', 16)}</div>${fbar('Wachstum pro Jahr (3 J)', g + ' %', Math.min(100, parseFloat(g.replace(',', '.'))), 1)}${fbar('Nettomarge', nm + ' %', Math.min(100, parseFloat(nm.replace(',', '.')) * 1.4))}${fbar('Free-Cashflow-Marge', fm + ' %', Math.min(100, parseFloat(fm.replace(',', '.')) * 1.4))}</div>`;
const RANK = [['i-target', 'Interessante Bewertungen', 'Niedrigstes KGV'], ['i-star', 'Profitable Unternehmen', 'Höchste Kapitalrendite (ROIC)'], ['i-line', 'Wachstumsführer', 'Umsatz pro Jahr über 3 Jahre'], ['i-bars', 'Cashflow-Stärke', 'Höchste Free-Cashflow-Rendite'], ['i-pie', 'Höchste Margen', 'Nettomarge'], ['i-grid', 'Solide Bilanzen', 'Größte Nettokasse']];
const foot = `<div style="display:flex;align-items:center;gap:8px;margin-top:18px" class="mu xs b">${ic('i-book', 16)} Zahlen aus den Pflichtmeldungen an die SEC · Stand 30.10.2026 · keine Empfehlung</div>`;

chapter({ n: '05', title: 'Fundamental', icon: 'fundamental', anchor: 'fundamental', was: 'Geschäftszahlen aus den Pflichtmeldungen an die SEC, <b>jede Kennzahl mit einem Satz Alltagssprache</b> und 12 Jahren Verlauf. Ranglisten mit sichtbarer Regel.', pages: 'F01–F06 · 6 Seiten' });

/* ---------- F01 Übersicht ---------- */
screen('f01-a', { world: 'fundamental', dock: 0, h: 1860, body: `${intro('fundamental', 'Wie gut ist das Geschäft?', 'Umsatz, Gewinn und Cashflow von US-Firmen. Direkt aus den Pflichtmeldungen an die US-Börsenaufsicht.')}
<div style="margin-top:14px">${search('Firma oder Kürzel, z. B. NVIDIA')}</div>
<div style="display:flex;gap:8px;margin-top:10px">${pill('NVDA', '')}${pill('AAPL', '')}${pill('MSFT', '')}${pill('PLTR', '')}</div>
${sect('Beispiel: NVIDIA in 4 Zahlen', 'Öffnen')}
<div class="card line" style="padding:16px"><div style="display:flex;align-items:center;gap:10px">${lg('NVDA')}<div style="flex:1"><b>NVIDIA</b><div class="xs mu">Geschäftsjahr 2026</div></div>${vd('s', 'Sehr stark')}</div><div style="margin-top:12px">${bars(T.revenue.slice(-10), { w: 318, h: 70 })}</div><div class="grid2" style="margin-top:8px;gap:8px">${[['Umsatz', '216 Mrd. $'], ['Gewinn', '120 Mrd. $'], ['Free Cashflow', '96,7 Mrd. $'], ['Wachstum p. a.', '+45,7 %']].map(([k, v]) => `<div><div class="xs mu b">${k}</div><b class="num" style="font-size:17px">${v}</b></div>`).join('')}</div><div class="xs mu" style="margin-top:8px">Umsatz je GJ 2017–2026 · Wachstum: GJ 2016 → 2026 pro Jahr</div></div>
${sect('Ranglisten', 'Alle 6')}
<div class="stack">${RANK.slice(0, 3).map(([i, t, s]) => navcard(i, t, s + ' · ab 10 Mrd. $')).join('')}</div>
${sect('Zahlen lesen in 30 Sekunden')}
<div class="card" style="padding:4px 14px">${[['Umsatz', 'Was die Firma verkauft.'], ['Nettogewinn', 'Was nach allen Kosten und Steuern bleibt.'], ['Free Cashflow', 'Echtes Geld, das nach Investitionen übrig ist.'], ['KGV', 'Wie viele Jahresgewinne du beim Kauf bezahlst.']].map(([k, v], i) => `<div style="display:flex;gap:10px;padding:10px 0;${i ? 'border-top:1px solid var(--a-line)' : ''}"><span class="hud" style="width:28px;height:28px;flex:none;border-radius:9px;font-weight:900;font-size:12px">${i + 1}</span><div><b class="sm">${k}</b><div class="mu xs">${v}</div></div></div>`).join('')}</div>
${sect('Branchen')}
${navcard('i-grid', 'Branchen im Vergleich', 'Nettomarge je Branche (Median)')}
${sect('Auswahlen aus Discover')}
<div style="display:flex;gap:8px;flex-wrap:wrap">${pill('Profitables Wachstum', 'lm')}${pill('Compounder', '')}${pill('Cashflow-Maschinen', '')}</div>
<div class="grid3" style="margin-top:16px">${tile('Kennzahlen', '60', 'im Katalog')}${tile('Verlauf', '12 J.', 'bis GJ 2026')}${tile('Quelle', 'SEC', 'EDGAR')}</div>
${foot}` });

screen('f01-b', { world: 'fundamental', dock: 0, body: `${intro('fundamental', 'Wie gut ist das Geschäft?')}<div style="margin-top:14px">${search('Firma oder Kürzel')}</div>${sect('Ranglisten')}
<div class="card" style="padding:16px"><div style="display:flex;gap:10px;align-items:center">${vd('o', 'Gerade keine Daten')}</div><div class="bb" style="margin-top:10px">Ranglisten laden gerade nicht.</div><p class="mu sm" style="margin-top:4px">Die Vergleichsdaten aller US-Aktien fehlen. Wir zeigen nichts Halbes.</p><div class="ltag" style="margin-top:12px">Was weiter geht</div><div class="stack" style="margin-top:6px">${['Jede Firma einzeln (Suche)', 'Methodik und Erklärungen', 'Auswahlen aus Discover'].map(t => `<div style="display:flex;gap:8px;align-items:center" class="sm b">${ic('i-check', 16)}${t}</div>`).join('')}</div><div class="grid2" style="margin-top:14px"><div class="btn">Neu laden</div><div class="btn line">Status</div></div></div>
<div style="margin-top:12px">${help('Status zeigt dir, welche Datenart wann zuletzt aktualisiert wurde.')}</div>` });

slide({ id: 'F01', title: 'Fundamental · Übersicht', route: '/fundamental/#/', now: 'F01', sub: 'Heute: Kacheln mit „–“, Ranglisten „konnten nicht geladen werden“, Seite endet nach drei Abschnitten. Neu: eine Frage, ein echtes Beispiel mit 12 Jahren Umsatz, Ranglisten als Karten, Mini-Lektion für Einsteiger und ein ehrlicher Fehlerzustand.',
  neu: [['f01-a', 'Start, ganze Seite'], ['f01-b', 'Zustand: Vergleichsdaten fehlen']],
  spec: { aufbau: ['Titel als Frage + Satz zur Quelle', 'Suche + Schnellwahl NVDA, AAPL, MSFT, PLTR', 'Beispielkarte NVIDIA (schwarz): Urteil, Umsatz-Balken 10 GJ, 4 Zahlen', 'Ranglisten: 3 von 6 als Navigationskarten (Regel „ab 10 Mrd. $“ sichtbar), „Alle 6“', 'Zahlen lesen in 30 Sekunden: Umsatz, Nettogewinn, Free Cashflow, KGV', 'Branchen im Vergleich', 'Auswahlen aus Discover als Chips', '3 Kacheln: 60 Kennzahlen, 12 Jahre, Quelle SEC', 'Fehlerzustand: Urteil „Keine Aussage“, was weiter geht, Neu laden, Status-Link'], komponenten: ['C20 Suche', 'C17 Balken', 'C08 Urteil', 'C12 Navigationskarte', 'C11 Kachel', 'C18 Leerer Zustand', 'C09 Erklärung'], daten: ['VU.D.tracks.revenue (GJ 2015–2026)', 'fundamental/engine/catalog.js → METRICS (60), RANKINGS (6), SIZES', 'Universum /screener/data/universe-US_REAL.json (Release, nicht im Repo)'], weg: ['Kacheln mit „–“ (Unternehmen mit SEC-Zahlen, Stand) → nur Kacheln mit Wert', 'Großes Hero-Icon', 'Grauer Fehlerkasten mitten in der Seite → eigener Zustand mit nächstem Schritt', 'Leiste: Entdecken/Suche/Methodik → Ranglisten · Branchen · Methodik (Suche in der Kopfzeile)'] } });

/* ---------- F02 Entdecken ---------- */
screen('f02-a', { world: 'fundamental', dock: 1, h: 1550, body: `${H1('Entdecken', 'Firmen, die in Zahlen auffallen. Jede Karte führt zur Firma.')}
${seg(['Ranglisten', 'Auswahlen'], 'Auswahlen')}
<div style="display:flex;gap:8px;margin-top:12px;overflow:hidden">${pill('Profitables Wachstum', 'on')}${pill('Compounder', '')}${pill('Cashflow-Maschinen', '')}</div>
<p class="sm" style="margin-top:10px"><b>Profitables Wachstum:</b> wächst, verdient Geld und erzeugt freien Cashflow.</p>
<div style="margin-top:8px">${help('Wachstum pro Jahr (3 J): um wie viel Prozent der Umsatz im Schnitt jedes Jahr gestiegen ist.')}</div>
<div class="stack" style="margin-top:12px">${fco('MU', 'Micron Technology', '133 Mrd. $', '104,6', '63,8', '44,3', '11,9')}${fco('NVDA', 'NVIDIA', '216 Mrd. $', '100,0', '55,6', '44,8', '25,9')}${fco('CRDO', 'Credo Technology', '1,34 Mrd. $', '93,5', '35,4', '30,5', '53,5')}${fco('TMDX', 'Transmedics Group', '605 Mio. $', '86,4', '31,4', '22,1', '17,1')}${fco('NUTX', 'Nutex Health', '875 Mio. $', '58,6', '8,1', '28,1', '7,9')}</div>
<div class="btn line" style="margin-top:12px">Alle Firmen der Auswahl</div>
<div style="margin-top:12px">${help('Nettomarge: wie viel von 100 $ Umsatz als Gewinn bleibt. 55,6 % heißt 55,60 $.')}</div>
${foot}` });

screen('f02-b', { world: 'fundamental', dock: 1, body: `${H1('Entdecken', 'Ranglisten sortieren eine Kennzahl. Die Regel steht dabei.')}
${seg(['Ranglisten', 'Auswahlen'], 'Ranglisten')}
<div class="stack" style="margin-top:14px">${RANK.map(([i, t, s]) => navcard(i, t, s)).join('')}</div>
<p class="mu xs" style="margin-top:10px">Größe wählbar: ab 2 · 10 · 100 Mrd. $ Börsenwert. Keine Empfehlung.</p>` });

slide({ id: 'F02', title: 'Fundamental · Entdecken', route: '/fundamental/#/entdecken', newRoute: '/fundamental/#/ranglisten', now: 'F02', sub: 'Heute: über 14.000 px lange Liste der Discover-Auswahl, Ranglisten-Fehler oben. Neu: Leistenplatz „Ranglisten“ mit zwei Reitern; die Auswahl zeigt 5 Firmen mit erklärten Balken, dann „Alle“.',
  neu: [['f02-a', 'Reiter Auswahlen, ganze Seite'], ['f02-b', 'Reiter Ranglisten']],
  spec: { aufbau: ['Titel + Satz, Reiter Ranglisten · Auswahlen', 'Auswahlen: Chips je Discover-Auswahl, Satz was sie bedeutet, Erklärung Wachstum', 'Firmenkarte: Logo, Name, Umsatz, KGV, drei Balken (Wachstum neongrün, Nettomarge, FCF-Marge)', '5 Karten, dann „Alle Firmen der Auswahl“', 'Ranglisten: 6 Navigationskarten mit Kennzahl im Untertitel, Größenfilter-Hinweis'], komponenten: ['C14 Reiter', 'C09 Erklärung', 'C12 Navigationskarte', 'Fundamental-Muster: Firmenkarte mit drei Balken'], daten: ['Werte aus Aufnahme F02 (Discover-Auswahl „Profitables Wachstum“, Stand 30.10.2026): discover/data (Auswahl-Definitionen) + Discover-Aktiendateien', 'fundamental/engine/catalog.js → RANKINGS'], weg: ['Endlose Liste (über 40 Karten) → 5 + „Alle“', '„KGV keine Angabe“ als eigene Zeile → im Untertitel nur, wenn vorhanden', 'Ranglisten-Fehlerkasten oben → eigener Zustand (F01)', 'Route /entdecken → /ranglisten (alte Adresse leitet um)'] } });

/* ---------- F03 Rangliste Wachstum ---------- */
const rk = (n, t, name, v, sub) => `<div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid var(--a-line)"><span class="bb num" style="width:22px">${n}</span><span class="lg">${t}</span><div style="flex:1;min-width:0"><b class="sm" style="display:block">${name}</b><span class="mu xs">${sub}</span></div><span class="vd s num">+${v} %</span></div>`;
screen('f03-a', { world: 'fundamental', dock: 1, h: 1380, body: `<div style="display:flex;align-items:center;gap:8px" class="sm b mu">${ic('i-back', 18)} Ranglisten</div>${H1('Wachstumsführer', 'Wessen Umsatz ist in 3 Jahren am stärksten gewachsen?')}
<div style="display:flex;gap:8px;margin-top:12px;overflow:hidden">${pill('Wachstum', 'on')}${pill('Bewertung', '')}${pill('Profitabel', '')}${pill('Cashflow', '')}</div>
<div class="seg" style="margin-top:12px"><span>ab 2 Mrd. $</span><span class="on">ab 10 Mrd. $</span><span>ab 100 Mrd. $</span></div>
<div class="card line" style="margin-top:12px"><div class="ltag">Regel dieser Liste</div><p class="sm" style="margin-top:4px">Umsatz pro Jahr über 3 Jahre, absteigend. Nur Firmen mit mindestens 250 Mio. $ Umsatz und höchstens 300 % pro Jahr.</p></div>
<div style="display:flex;align-items:center;margin-top:16px"><span class="st" style="margin:0;flex:1">Platz 1–3</span>${pill('Beispiel', 'lm')}</div>
<div class="card" style="padding:2px 14px;margin-top:10px">${rk(1, 'MU', 'Micron Technology', '104,6', 'Umsatz 133 Mrd. $')}${rk(2, 'NVDA', 'NVIDIA', '100,0', 'Umsatz 216 Mrd. $')}${rk(3, 'CRDO', 'Credo Technology', '93,5', 'Umsatz 1,34 Mrd. $')}</div>
<p class="mu xs" style="margin-top:8px">Beispiel mit Werten aus der Discover-Auswahl vom 30.10.2026. Die echte Liste kommt aus dem Universum aller US-Aktien.</p>
<div style="margin-top:12px">${help('Eine Rangliste sortiert nur eine Zahl. Sie sagt nicht, ob die Aktie gut oder günstig ist.')}</div>
<div class="btn line" style="margin-top:12px">Platz 4–25 zeigen</div>${foot}` });

screen('f03-b', { world: 'fundamental', dock: 1, body: `<div style="display:flex;align-items:center;gap:8px" class="sm b mu">${ic('i-back', 18)} Ranglisten</div>${H1('Wachstumsführer', 'Umsatz pro Jahr über 3 Jahre')}
<div class="seg" style="margin-top:12px"><span>ab 2 Mrd. $</span><span class="on">ab 10 Mrd. $</span><span>ab 100 Mrd. $</span></div>
<div class="card" style="margin-top:16px;padding:18px;text-align:center"><div>${vd('o', 'Keine Aussage')}</div><div class="mt" style="margin-top:12px">Liste gerade leer</div><p class="mu sm" style="margin-top:6px">Die Vergleichsdaten aller US-Aktien laden nicht. Wir zeigen keine halbe Rangliste.</p><div class="btn" style="margin-top:14px">Neu laden</div></div>
<div class="card line" style="margin-top:12px"><div class="ltag">Regel dieser Liste</div><p class="sm" style="margin-top:4px">Umsatz ≥ 250 Mio. $, Wachstum ≤ 300 % pro Jahr.</p></div>` });

slide({ id: 'F03', title: 'Fundamental · Rangliste Wachstum', route: '/fundamental/#/rangliste/wachstum', now: 'F03', sub: 'Heute: fast leere Seite mit Fehlermeldung, Regel versteckt im Aufklapper. Neu: Frage als Titel, Regel offen sichtbar, Plätze mit Wert als Urteil-Pille, ehrlicher Leerzustand.',
  neu: [['f03-a', 'Rangliste mit Regel (Werte: Beispiel)'], ['f03-b', 'Zustand: Daten fehlen']],
  spec: { aufbau: ['Zurück zu Ranglisten, Titel + Frage', 'Chips: andere Ranglisten (wischbar)', 'Größe als Segment: ab 2 / 10 / 100 Mrd. $', 'Regel-Karte offen (Text aus RANKINGS.rule)', 'Plätze 1–25: Rang, Logo, Name, Umsatz, Wert als neongrüne Pille', 'Erklärung „sortiert nur eine Zahl“', 'Leerzustand mit Urteil „Keine Aussage“, Neu laden, Regel bleibt sichtbar'], komponenten: ['C14 Reiter/Segment', 'C08 Urteil', 'C09 Erklärung', 'C18 Leerer Zustand', 'Fundamental-Muster: Ranglistenzeile'], daten: ['fundamental/engine/catalog.js → RANKINGS.wachstum (col revCagr3, Filter revenue ≥ 2,5e8, revCagr3 ≤ 3), SIZES, ranking(U, id, sizeId, 25)', 'Universum /screener/data/universe-US_REAL.json (im Release)', 'Mockup-Werte: Beispiel aus Aufnahme F02'], weg: ['„Regel dieser Rangliste“ als Aufklapper → offene Karte', 'Grauer Fehlerkasten ohne Aktion → Leerzustand mit Neu laden'] } });

/* ---------- F04 Suche ---------- */
screen('f04-a', { world: 'fundamental', dock: 0, hdr: true, body: `<div style="display:flex;align-items:center;gap:10px;height:50px;border-radius:999px;background:var(--a-card);padding:0 16px;border:2px solid var(--a-ink);font-weight:700">${ic('i-search', 18)}<span style="flex:1">nvi<span style="display:inline-block;width:2px;height:18px;background:var(--a-ink);vertical-align:middle;margin-left:1px"></span></span><span class="mu sm">Abbrechen</span></div>
<div class="ltag" style="margin-top:16px">Firmen</div><div class="card" style="padding:2px 14px;margin-top:6px">${row('NVDA', 'Zahlen · Umsatz 303 Mrd. $ (12 M)')}</div>
<div class="ltag" style="margin-top:16px">Kennzahlen</div><div class="stack" style="margin-top:6px">${navcard('i-book', 'Was heißt „Nettoverschuldung“?', 'Erklärung in der Methodik')}</div>
<div class="ltag" style="margin-top:16px">Zuletzt angesehen</div><div class="card" style="padding:2px 14px;margin-top:6px">${row('AAPL')}${row('MSFT')}</div>
<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${pill('PLTR', '')}${pill('JPM', '')}${pill('KO', '')}</div>` });

screen('f04-b', { world: 'fundamental', dock: 0, body: `<div style="display:flex;align-items:center;gap:10px;height:50px;border-radius:999px;background:var(--a-card);padding:0 16px;border:2px solid var(--a-ink);font-weight:700">${ic('i-search', 18)}<span style="flex:1">Siemens</span><span class="mu sm">Abbrechen</span></div>
<div class="card" style="margin-top:18px;padding:18px;text-align:center"><div>${vd('o', 'Kein Treffer')}</div><div class="mt" style="margin-top:12px">Siemens berichtet nicht an die SEC</div><p class="mu sm" style="margin-top:6px">Fundamental zeigt US-Firmen mit Pflichtmeldungen. Kurse und Chart findest du trotzdem.</p><div class="btn line" style="margin-top:14px">In Discover suchen</div></div>
<div class="ltag" style="margin-top:16px">Probier</div><div class="card" style="padding:2px 14px;margin-top:6px">${row('NVDA')}${row('AAPL')}${row('MSFT')}</div>` });

slide({ id: 'F04', title: 'Fundamental · Suchen', route: '/fundamental/#/suche', now: 'F04', sub: 'Heute: eigener Leistenplatz „Suche“ mit Beispielliste. Neu: Suche sitzt in der Kopfzeile (überall gleich); Treffer zeigen sofort eine Zahl, Kennzahlen sind mit durchsuchbar, kein Treffer wird erklärt.',
  neu: [['f04-a', 'Suche beim Tippen'], ['f04-b', 'Kein Treffer, erklärt']],
  spec: { aufbau: ['Kopfzeilen-Suche öffnet Vollbild-Suchfeld mit Cursor', 'Abschnitt Firmen: Aktienzeile + eine Kennzahl', 'Abschnitt Kennzahlen: Treffer im Katalog → Methodik', 'Zuletzt angesehen + Schnellwahl', 'Kein Treffer: Grund in einem Satz (nicht SEC-meldepflichtig), Weg nach Discover'], komponenten: ['C20 Suche (Kopfzeile)', 'C10 Aktienzeile', 'C12 Navigationskarte', 'C18 Leerer Zustand'], daten: ['Namen/Kürzel: core/identity.js (securityIdForTicker, matchKey)', 'fundamental/engine/catalog.js → METRICS[].label für Kennzahl-Treffer'], weg: ['Leistenplatz „Suche“ → Kopfzeilen-Suche (Route /fundamental/#/suche bleibt als Deep Link und öffnet die Suche)', 'Beispielliste ohne Werte'] } });

/* ---------- F05 Methodik ---------- */
const mrow = (k, v, f) => `<div style="padding:10px 0;border-top:1px solid var(--a-line)"><div style="display:flex;gap:8px;align-items:baseline"><b class="sm" style="flex:1">${k}</b><span class="mu xs num">${f}</span></div><div class="xs" style="margin-top:2px;line-height:1.35">${v}</div></div>`;
screen('f05-a', { world: 'fundamental', dock: 3, h: 1700, body: `${H1('Methodik', 'Woher die Zahlen kommen und was sie bedeuten.')}
<div class="card ink" style="margin-top:14px;padding:16px"><div class="ltag" style="color:#9b9b9b">Quelle</div><div class="bb" style="margin-top:4px">Pflichtmeldungen an die SEC</div><p class="xs" style="opacity:.75;margin-top:4px">Companyfacts von SEC EDGAR. Dieselben Zahlen nutzen Discover, Quant und Screener.</p></div>
${sect('Drei Zeiträume')}
<div class="grid3">${tile('GJ', 'Jahr', 'aus dem Jahresbericht')}${tile('Quartal', '3 Mon.', 'einzeln, ggf. berechnet')}${tile('LTM', '12 Mon.', 'letzte 4 Quartale')}</div>
${sect('Kennzahlen in Worten', '60')}
<div style="display:flex;gap:6px;flex-wrap:wrap">${[['Wachstum', 6], ['Gewinn &amp; Verlust', 11], ['Profitabilität', 11], ['Cashflow', 6], ['Bilanz', 10], ['Aktie', 7], ['Bewertung', 9]].map(([k, n], i) => pill(`${k} · ${n}`, i === 2 ? 'on' : '')).join('')}</div>
<div class="card" style="padding:2px 14px;margin-top:10px">${mrow('Nettomarge', 'Wie viel von jedem Umsatz-Dollar als Gewinn bleibt.', 'Gewinn ÷ Umsatz')}${mrow('Kapitalrendite (ROIC)', 'Wie viel Gewinn das eingesetzte Geld im Geschäft bringt.', 'PRO-Formel')}${mrow('Eigenkapitalrendite (ROE)', 'Gewinn im Verhältnis zum Geld der Aktionäre.', 'Gewinn ÷ Eigenkapital')}${mrow('Free-Cashflow-Marge', 'Anteil des Umsatzes, der als freies Geld übrig bleibt.', 'FCF ÷ Umsatz')}${mrow('F&amp;E-Quote', 'Anteil des Umsatzes für Forschung.', 'F&amp;E ÷ Umsatz')}</div>
${sect('Bewertung')}
<p class="sm" style="line-height:1.45">Aktuell: KGV, KUV, Börsenwert zum letzten Schlusskurs. Verlauf: je Jahresbericht mit dem Kurs nach der Veröffentlichung, splitbereinigt und gegengeprüft.</p>
<div style="margin-top:8px">${help('Splitbereinigt: Teilt eine Firma ihre Aktien (z. B. 1 wird 10), rechnen wir alte Kurse um, damit nichts springt.')}</div>
${sect('Vergleich mit der Branche')}
<p class="sm" style="line-height:1.45">Wettbewerber = Firmen derselben SEC-Branche (mindestens 5). Wir zeigen die Lage („höher als 80 % der Gruppe“), keine Wertung.</p>
${sect('Lücken und Grenzen')}
<div class="stack">${['Fehlt ein Wert, bleibt das Jahr leer. Nichts wird geschätzt.', 'Margen über 150 % gelten als nicht plausibel und werden nicht gezeigt.', 'Korrigiert eine Firma später, zeigen wir den korrigierten Wert.'].map(t => `<div class="card" style="display:flex;gap:10px;padding:12px">${ic('i-check', 18)}<span class="sm">${t}</span></div>`).join('')}</div>
<div class="btn line" style="margin-top:14px">Alle Formeln <span class="pro">PRO</span></div>
${foot}` });

screen('f05-b', { world: 'fundamental', dock: 3, body: `${H1('Methodik')}`, overlay: `<div class="ovl"></div><div class="sheet" style="top:120px"><div class="grab"></div><div class="ltag">Profitabilität · Kennzahl</div><div class="mt" style="margin-top:4px">Kapitalrendite (ROIC)</div><p class="sm" style="margin-top:8px;line-height:1.45">Stell dir vor, du steckst 100 $ in das Geschäft. ROIC sagt, wie viel Gewinn pro Jahr daraus wird.</p><div class="card lime" style="margin-top:12px;display:flex;align-items:center;gap:12px"><div style="flex:1"><div class="xs b">NVIDIA · GJ 2026</div><div class="bb num" style="font-size:30px">71,3 %</div></div><div class="xs b" style="max-width:15ch">aus 100 $ werden rund 71 $ Gewinn</div></div><div class="card ink" style="margin-top:10px;font-size:12.5px;line-height:1.5"><span class="pro" style="background:var(--lime);color:#000">PRO</span> Operatives Ergebnis × (1 − Steuerquote) ÷ (Eigenkapital + Finanzschulden − Kasse). Steuerquote auf 0–50 % begrenzt, ohne Angabe 21 %.</div><div style="margin-top:10px">${help('Über 15 % gilt meist als sehr gut. Banken und Versicherer sind schwer vergleichbar.')}</div></div>` });

slide({ id: 'F05', title: 'Fundamental · Methodik', route: '/fundamental/#/methodik', now: 'F05', sub: 'Heute: 7.600 px Fließtext mit Formeln. Neu: Quelle in einer Karte, drei Zeiträume als Kacheln, Kennzahlen nach Kategorie mit Alltagssatz, Formeln als PRO im Sheet.',
  neu: [['f05-a', 'Methodik, ganze Seite'], ['f05-b', 'Kennzahl geöffnet (ROIC)']],
  spec: { aufbau: ['Titel + Satz', 'Quelle (schwarze Karte)', 'Drei Zeiträume GJ / Quartal / LTM als Kacheln', 'Kennzahlen in Worten: 7 Kategorien als Chips mit Anzahl (60 gesamt), Liste mit Alltagssatz und Kurzformel', 'Bewertung, Vergleich mit der Branche, Lücken und Grenzen (je 1–3 Sätze)', 'Alle Formeln (PRO, heutiger Volltext)', 'Kennzahl-Sheet: Alltagsbild, NVDA-Wert, Formel PRO, Einordnung'], komponenten: ['C11 Kachel', 'C14 Chips', 'C09 Erklärung', 'C16 Sheet', 'C19 PRO-Marke', 'Fundamental-Muster: Kennzahl-Zeile (Name, Alltagssatz, Kurzformel)'], daten: ['fundamental/engine/catalog.js → CATS, METRICS[].desc, FORMULA', 'fundamental/app.js (Methodik-Texte, Abschnitt „Vergleich und Ranglisten“)', 'NVDA ROIC 71,3 % aus Aufnahme F06'], weg: ['Ein langer Fließtext → Abschnitte mit je einem Satz', 'Formeln im Haupttext → PRO-Ansicht „Alle Formeln“ (Inhalt bleibt vollständig)', '„Fundamental“-Zurück-Link oben'] } });

/* ---------- F06 Aktie: Perspektive Zahlen ---------- */
const tabs = on => `<div class="seg" style="margin-top:12px">${['Überblick', 'Kennzahlen', 'Branche', 'Finanzen'].map(x => `<span class="${x === on ? 'on' : ''}">${x}</span>`).join('')}</div>`;
const dev = (k, a, b, g) => `<div style="display:flex;align-items:center;padding:10px 0;border-top:1px solid var(--a-line)"><div style="flex:1"><b class="sm">${k}</b><div class="mu xs">GJ 2016 → 2026 · ${a} → ${b}</div></div>${g}</div>`;
screen('f06-a', { world: 'fundamental', dock: 0, h: 2200, body: `${STOCK('Zahlen')}${tabs('Überblick')}
<div class="card ink" style="margin-top:12px;padding:16px;display:flex;gap:12px;align-items:center"><div style="flex:1"><div class="ltag" style="color:#9b9b9b">Das Geschäft</div><div class="bb" style="font-size:18px;margin-top:2px">Wächst stark und verdient sehr gut</div><div class="xs" style="opacity:.7;margin-top:4px">Umsatz +83,4 % in 12 Monaten</div></div>${vd('s', 'Sehr stark')}</div>
${sect('Auf einen Blick')}
<div class="grid2">${ktile('Börsenwert', '4,97 Bio. $', 'zum Schlusskurs', 'Was die ganze Firma an der Börse kostet.')}${ktile('Umsatz 12 Monate', '303 Mrd. $', 'LTM · +83,4 %', 'Alles, was NVIDIA in einem Jahr verkauft hat.')}${ktile('KGV', '25,9', 'zum Schlusskurs', 'Du zahlst 25,90 $ für 1 $ Jahresgewinn.')}${ktile('KUV', '16,4', 'zum Schlusskurs', 'Börsenwert geteilt durch Jahresumsatz.')}${ktile('Nettomarge', '63,7 %', 'LTM', 'Von 100 $ Umsatz bleiben 63,70 $ Gewinn.')}${ktile('Free Cashflow', '127 Mrd. $', 'LTM', 'Freies Geld nach allen Investitionen.')}${ktile('Eigenkapitalrendite', '76,3 %', 'GJ 2026', 'Gewinn auf das Geld der Aktionäre.')}${ktile('Kapitalrendite', '71,3 %', 'GJ 2026 · ROIC', 'Gewinn auf das im Geschäft steckende Geld.')}</div>
${sect('12 Jahre Umsatz', 'Finanzen')}
${seg(['Umsatz', 'Gewinn', 'Cashflow'], 'Umsatz', 0)}
<div style="margin-top:12px">${bars(T.revenue, { w: 354, h: 130 })}</div>
<p class="mu xs" style="margin-top:4px">Geschäftsjahr endet im Januar · GJ 2026: Umsatz 216 Mrd. $, Nettogewinn 120 Mrd. $</p>
${sect('Entwicklung pro Jahr')}
<div class="card" style="padding:2px 14px">${dev('Umsatz', '5,0 Mrd. $', '216 Mrd. $', vd('s', '+45,7 % p. a.'))}${dev('Nettogewinn', '614 Mio. $', '120 Mrd. $', vd('s', '+69,5 % p. a.'))}${dev('Free Cashflow', '1,1 Mrd. $', '96,7 Mrd. $', vd('s', '+56,6 % p. a.'))}${dev('Nettomarge', '12,3 %', '55,6 %', vd('s', '+43,3 Pp.'))}</div>
<div style="margin-top:10px">${help('p. a. heißt pro Jahr: im Schnitt jedes Jahr so viel mehr. Pp. = Prozentpunkte.')}</div>
${sect('In der Branche')}
<div class="card" style="display:flex;gap:10px;align-items:center">${vd('o', 'Keine Aussage')}<span class="sm">Vergleichsdaten gerade nicht verfügbar. Wir zeigen nichts Erfundenes.</span></div>
${sect('Mehr')}
<div style="display:flex;gap:8px;flex-wrap:wrap">${pill('Dividende', '')}${pill('Analysten', '')}${pill('Bewertung im Verlauf', '')}${pill('Quellen', '')}</div>
${foot}` });

const cats = [['Wachstum', 6, 'Umsatz +83,4 % (12 M)'], ['Gewinn &amp; Verlust', 11, 'Nettogewinn 120 Mrd. $ (GJ 26)'], ['Profitabilität', 11, 'Nettomarge 63,7 % (LTM)'], ['Cashflow', 6, 'Free Cashflow 127 Mrd. $ (LTM)'], ['Bilanz', 10, 'Kasse 10,6 Mrd. $ (GJ 26)'], ['Aktie &amp; Dividende', 7, 'Gewinn je Aktie 4,90 $ (GJ 26)'], ['Bewertung', 9, 'KGV 25,9']];
screen('f06-b', { world: 'fundamental', dock: 0, h: 1180, body: `${STOCK('Zahlen')}${tabs('Kennzahlen')}
<div style="margin-top:12px">${search('Kennzahl suchen, z. B. Marge')}</div>
<div class="grid3" style="margin-top:12px">${tile('Definiert', '60', 'Kennzahlen')}${tile('Quelle', 'SEC', '10-K und 10-Q')}${tile('Verlauf', '12 J.', 'GJ 2015–26')}</div>
<div class="stack" style="margin-top:12px">${cats.map(([k, n, s]) => `<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px"><div style="flex:1"><div class="bb sm">${k} <span class="mu">· ${n}</span></div><div class="mu xs">${s}</div></div>${ic('i-next', 16)}</div>`).join('')}</div>
<p class="mu xs" style="margin-top:10px">Jede Kennzahl öffnet: Verlauf (Jahr/Quartal), Vergleich mit Branche, Tabelle mit SEC-Quelle. Bis zu 3 Kennzahlen gemeinsam <span class="pro">PRO</span>.</p>` });

const fy = [2022, 2023, 2024, 2025, 2026];
const val = (k, y) => { const r = T[k].find(x => x[0] === y); return r ? de(r[1] / 1e9, 1) : '–'; };
screen('f06-c', { world: 'fundamental', dock: 0, h: 1260, body: `${STOCK('Zahlen')}${tabs('Finanzen')}
${seg(['Gewinn &amp; Verlust', 'Bilanz', 'Cashflow'], 'Gewinn &amp; Verlust')}
<div style="margin-top:12px">${bars(T.net_income, { w: 354, h: 110 })}</div><p class="mu xs">Nettogewinn je Geschäftsjahr, GJ 2015–2026</p>
<div class="card" style="margin-top:12px;padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:1.5fr repeat(5,1fr);gap:2px;padding:10px 12px;font-size:10.5px;font-weight:800;color:var(--a-mute)"><span>Mrd. $</span>${fy.map(y => `<span style="text-align:right">GJ ${String(y).slice(2)}</span>`).join('')}</div>${[['Umsatz', 'revenue'], ['Nettogewinn', 'net_income'], ['Oper. Cashflow', 'operating_cash_flow'], ['Free Cashflow', 'free_cash_flow'], ['Kasse', 'cash'], ['Schulden', 'debt']].map(([l, k]) => `<div style="display:grid;grid-template-columns:1.5fr repeat(5,1fr);gap:2px;padding:9px 12px;border-top:1px solid var(--a-line);font-size:12px"><b>${l}</b>${fy.map((y, i) => `<span class="num" style="text-align:right;${i === 4 ? 'font-weight:800' : ''}">${val(k, y)}</span>`).join('')}</div>`).join('')}</div>
<div style="display:flex;gap:8px;margin-top:10px">${pill('5 J', 'on')}${pill('10 J', '')}${pill('Alle', '')}${pill('Quartale', '')}</div>
<div style="margin-top:10px">${help('Operativer Cashflow: Geld aus dem laufenden Geschäft. Ziehst du Investitionen ab, bleibt der Free Cashflow.')}</div>` });

slide({ id: 'F06', title: 'Fundamental · NVIDIA in Zahlen', route: '/fundamental/#/NVDA', now: 'F06', sub: 'Heute: eigener Kopf mit 9er-Icons, Warnung „SEC-Historie nicht verfügbar“, Kacheln ohne Erklärung. Neu: gemeinsame Aktienseite, Perspektive „Zahlen“: Urteil in einem Satz, jede Kennzahl mit Alltagssatz, 12 Jahre über Balken, Finanzen als Tabelle.',
  neu: [['f06-a', 'Überblick, ganze Seite'], ['f06-b', 'Reiter Kennzahlen'], ['f06-c', 'Reiter Finanzen']],
  spec: { aufbau: ['Aktienkopf, Perspektive „Zahlen“ aktiv, Fundamental-Leiste bleibt', 'Reiter Überblick · Kennzahlen · Branche · Finanzen', 'Urteil-Karte: „Wächst stark und verdient sehr gut“ (Sehr stark)', 'Auf einen Blick: 8 Kacheln (Börsenwert 4,97 Bio. $, Umsatz LTM 303 Mrd. $, KGV 25,9, KUV 16,4, Nettomarge 63,7 %, FCF 127 Mrd. $, EK-Rendite 76,3 %, ROIC 71,3 %), jede mit „?“ und Alltagssatz', '12 Jahre Balken (Umsatz/Gewinn/Cashflow)', 'Entwicklung GJ 2016 → 2026 pro Jahr', 'Branche: Leerzustand, solange Vergleichsdaten fehlen', 'Mehr: Dividende, Analysten, Bewertung im Verlauf, Quellen', 'Kennzahlen-Reiter: Suche, 7 Kategorien mit Anzahl und Beispielwert', 'Finanzen-Reiter: GuV/Bilanz/Cashflow, Balken, Tabelle GJ 22–26, 5 J/10 J/Alle/Quartale'], komponenten: ['C04 Aktienkopf', 'C05 Perspektiven-Leiste', 'C14 Reiter', 'C08 Urteil', 'C17 Balken', 'C18 Leerer Zustand', 'C09 Erklärung', 'C20 Suche', 'Fundamental-Muster: Kennzahl-Kachel mit Alltagssatz', 'Fundamental-Muster: Finanztabelle'], daten: ['Kacheln: Aufnahme F06 (Discover-Bewertung zum Schlusskurs 30.10.2026; LTM aus SEC-Historie)', 'VU.D.tracks.revenue | net_income | free_cash_flow | operating_cash_flow | cash | debt | eps_diluted (GJ 2015–2026)', 'Entwicklung: Aufnahme F06 (GJ 2016 → 2026)', '/fundamental/data/history/{shardKey}.json.gz (Release), Fallback Discover-Block mit Hinweis'], weg: ['9er-Icon-Leiste und eigener Kopf → gemeinsamer Aktienkopf', 'Grün/Rot-Liniengrafik mit Zeitleiste im Zahlen-Reiter (Chart gehört zur Perspektive „Chart“)', 'Beige Warnbox → ehrlicher Leerzustand nur im betroffenen Abschnitt', 'Graue/grüne Doppelbalken → ein Balken-Stil (letztes Jahr neongrün)'] } });
})();
