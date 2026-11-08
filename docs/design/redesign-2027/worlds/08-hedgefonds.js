/* 08 · Hedgefonds: Was große Investoren kaufen und verkaufen, aus den 13F-Pflichtmeldungen. */
(function () {
const { screen, slide, chapter, ic, hud, chart, chg, vd, help, lg, row, STOCK, D, S, de, sect, kv, tile, navcard, pill, toggle, bars, search, intro } = VU;

/* ---------- Hilfen ---------- */
const av = (t, star) => `<span style="position:relative;flex:none;width:40px;height:40px;border-radius:50%;background:var(--a-ink);color:var(--a-inv);display:grid;place-items:center;font-weight:900;font-size:12.5px">${t}${star ? `<i style="position:absolute;right:-3px;bottom:-3px;width:17px;height:17px;border-radius:50%;background:var(--lime);color:#000;display:grid;place-items:center;border:2px solid var(--a-bg)">${ic('i-star', 9)}</i>` : ''}</span>`;
const tk = t => `<span class="lg" style="width:auto;min-width:42px;padding:0 6px;font-size:10px">${t}</span>`;
const kick = (t, h) => `<div class="ltag" style="margin-top:24px">${t}</div><div class="mt" style="margin:3px 0 10px">${h}</div>`;
const acc = (t, right) => `<div style="display:flex;align-items:center;gap:10px;padding:13px 0;border-top:1px solid var(--a-line)"><b class="sm" style="flex:1">${t}</b>${right || ''}${ic('i-next', 16)}</div>`;
const back = t => `<div style="display:flex;align-items:center;gap:8px" class="sm b">${ic('i-back', 18)}${t}</div>`;
/* Fluss-Zeile: Rang, Kürzel, Name, Wert, Unterzeile, Balken (Kauf neongrün, Verkauf schwarz) */
const flow = (n, t, name, val, sub, pct, buy) => `<div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--a-line)"><span class="mu xs b" style="width:14px">${n}</span>${tk(t)}<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:8px"><b class="sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</b><b class="sm num" style="white-space:nowrap">${val}</b></div><div class="bar" style="height:7px;margin:6px 0 4px"><i class="${buy ? 'l' : ''}" style="width:${pct}%"></i></div><div class="mu xs">${sub}</div></div></div>`;
/* Investor-Zeile */
const inv = (ini, name, firm, style, val, d, star) => `<div style="display:flex;gap:11px;align-items:center;padding:11px 0;border-top:1px solid var(--a-line)">${av(ini, star)}<div style="flex:1;min-width:0"><b class="sm" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</b><span class="mu xs" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${firm}${style ? ' · ' + style : ''}</span></div><div style="text-align:right;display:grid;gap:3px;justify-items:end"><b class="num sm">${val}</b>${d == null ? '' : chg(d)}</div></div>`;
/* Halte-Zeile: Name, Anteil als Balken */
const hold = (t, name, w, d, mx) => `<div style="padding:9px 0;border-top:1px solid var(--a-line)"><div style="display:flex;align-items:center;gap:10px">${tk(t)}<b class="sm" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</b><b class="num sm">${de(w, 1)} %</b><span style="flex:none;min-width:70px;text-align:right">${d === 'neu' ? vd('s', 'Neu') : d === 0 ? '<span class="mu xs b">unverändert</span>' : chg(d)}</span></div><div class="bar" style="height:6px;margin-top:7px"><i style="width:${(w / mx * 100).toFixed(1)}%"></i></div></div>`;

chapter({ n: '08', title: 'Hedgefonds', icon: 'hedgefonds', anchor: 'hedgefonds', was: 'Was die bekanntesten Investoren kaufen und verkaufen, direkt aus den Pflichtmeldungen an die US-Börsenaufsicht. <b>Ehrlich datiert: Die Meldungen sind bis zu viereinhalb Monate alt.</b>', pages: 'H01–H07 · 7 Seiten' });

/* ---------- H01 Übersicht ---------- */
screen('h01-a', { world: 'hedgefonds', dock: 0, h: 2150, body: `${intro('hedgefonds', 'Was Profis kaufen', 'Große Investoren müssen ihre US-Aktien alle drei Monate der Börsenaufsicht melden. Wir zeigen, was sie kaufen und verkaufen.')}
<div class="xs b" style="margin-top:10px;display:flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:var(--lime);border:1.5px solid var(--a-ink)"></i>Meldungen für Q2 2026 · geprüft am 26.10.2026</div>
<div style="margin-top:12px">${search('Investor, Fonds oder Aktie …')}</div>
<div class="chips" style="margin-top:10px">${['Bill Ackman', 'Michael Burry', 'Cathie Wood', 'NVIDIA'].map(t => pill(t)).join('')}</div>
<div class="grid3" style="margin-top:14px">${tile('Hedgefonds', '788', 'davon 79 Stars')}${tile('DACH', '64', 'Melder')}${tile('Nächste Frist', '14.11.', 'für Q3 2026')}</div>
<div style="margin-top:10px">${help('13F-Meldung: Pflichtliste der US-Aktien eines großen Investors. Sie kommt bis 45 Tage nach Quartalsende, die Daten sind also nicht von heute.')}</div>
${sect('Star-Investoren', 'Alle 79')}
<div style="display:flex;gap:10px;overflow:hidden">${[['BA', 'Bill Ackman', 'Pershing Square · Aktivist', '13,7 Mrd. $', -11.7, 'Brookfield 17,6 % · Amazon 17,4 %', 'Stand Q1 2026'], ['WB', 'Warren Buffett', 'Berkshire Hathaway · Value', '299,3 Mrd. $', 13.7, 'Apple 22,0 % · American Express 17,1 %', 'Q2 2026']].map(([i, n, f, v, d, top, q]) => `<div class="card" style="flex:none;width:270px;padding:14px"><div style="display:flex;gap:10px;align-items:center">${av(i, 1)}<div style="min-width:0"><b>${n}</b><div class="mu xs">${f}</div></div></div><div style="display:flex;align-items:center;gap:8px;margin-top:12px"><span class="bb num" style="font-size:24px">${v}</span>${chg(d)}</div><div class="xs b" style="margin-top:8px">${top}</div><div class="mu xs" style="margin-top:4px">${q}</div></div>`).join('')}</div>
${kick('Käufe und Verkäufe im Quartal', 'Was die Stars bewegt haben')}
<div class="seg"><span class="on">Star-Investoren</span><span>Alle Hedgefonds</span></div>
<div class="sm b" style="margin:14px 0 2px;display:flex;align-items:center;gap:6px">${ic('i-plus', 15)}Größte Käufe</div>
${flow(1, 'SPCX', 'SpaceX', '30,8 Mrd. $', '10 Fonds · 10 neu eingestiegen', 100, 1)}${flow(2, 'MU', 'Micron Technology', '9,8 Mrd. $', '7 Fonds · 4 neu', 32, 1)}${flow(3, 'GOOG', 'Alphabet (C)', '9,6 Mrd. $', '10 Fonds · 1 neu', 31, 1)}
<div class="sm b" style="margin:16px 0 2px;display:flex;align-items:center;gap:6px">${ic('i-x', 15)}Größte Verkäufe</div>
${flow(1, 'GOOGL', 'Alphabet (A)', '−6,0 Mrd. $', '16 Fonds · 1 komplett raus', 100, 0)}${flow(2, 'AMAT', 'Applied Materials', '−4,1 Mrd. $', '11 Fonds · 1 komplett raus', 68, 0)}${flow(3, 'TSM', 'TSMC', '−3,5 Mrd. $', '14 Fonds · 2 komplett raus', 58, 0)}
<div style="margin-top:8px">${help('Geschätzter Wert: gekaufte oder verkaufte Stückzahl mal Kurs am Quartalsende.')}</div>
${sect('Meistgehalten bei Stars', 'Alle Aktien')}
${[['GOOGL', 'Alphabet (A)', 34, '4,4'], ['AMZN', 'Amazon', 30, '5,5'], ['META', 'Meta Platforms', 28, '3,1'], ['TSM', 'TSMC', 25, '5,6']].map(([t, n, f, w], i) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--a-line)"><span class="mu xs b" style="width:14px">${i + 1}</span>${lg(t)}<div style="flex:1"><b class="sm">${n}</b><div class="mu xs">Ø ${w} % Anteil im Depot</div></div><b class="num">${f}</b><span class="mu xs">Fonds</span></div>`).join('')}
${sect('Entdecken')}
<div class="grid2">${[['i-person', 'Star-Investoren'], ['i-list', 'Aktien'], ['i-signal', 'Insider-Käufe'], ['i-globe', 'Deutschland &amp; DACH']].map(([i, t]) => `<div class="card" style="padding:12px;display:grid;gap:10px"><span class="hud" style="width:36px;height:36px">${ic(i, 18)}</span><b class="sm">${t}</b></div>`).join('')}</div>
<div class="mu xs" style="margin-top:16px">Keine Anlageberatung. Stand 26.10.2026.</div>` });

slide({ id: 'H01', title: 'Hedgefonds · Übersicht', route: '/hedgefonds/', now: 'H01', sub: 'Heute beginnt die Seite mit großem Bild und Fotos, rote und grüne Balken, sechs bunte Kacheln. Neu: Was ist eine 13F-Meldung (ehrliches Datum), dann die Stars, dann die Bewegungen in Schwarz und Neongrün.',
  neu: [['h01-a', 'Start, ganze Seite']],
  spec: { aufbau: ['Intro: „Was Profis kaufen“ + Satz zur Meldepflicht', 'Stand-Zeile: Quartal + Prüfdatum', 'Suche + Schnell-Chips (Investoren, Aktien)', '3 Kacheln: 788 Hedgefonds (79 Stars) · 64 DACH · nächste Frist 14.11.', 'Erklärung 13F mit Verzug', 'Star-Investoren: wischbare Karten (Initialen oder Foto, Fondsgröße, Veränderung, Top 2, Meldestand)', 'Käufe und Verkäufe: Reiter Stars / Alle, Top 3 Käufe (neongrüne Balken), Top 3 Verkäufe (schwarze Balken), Erklärung „geschätzter Wert“', 'Meistgehalten bei Stars: Top 4 mit Zahl der Fonds', 'Entdecken: 4 Karten (Stars, Aktien, Insider-Käufe, DACH)'],
    komponenten: ['C01 Kopfzeile', 'C02 Produkt-Leiste (Hedgefonds · Investoren · Aktien · Smart Money · Menü)', 'C07 Kursbewegung (Fondsgröße ggü. Vorquartal)', 'C09 Erklärung', 'C11 Kachel', 'C14 Reiter', 'C20 Suche', 'Hedgefonds-Muster: Investor-Karte', 'Hedgefonds-Muster: Fluss-Zeile (Kauf neongrün, Verkauf schwarz)', 'Hedgefonds-Muster: Avatar mit Stern für Star-Investoren'],
    daten: ['hedgefonds/data/hedgefonds.json (latestPeriodLabel, hedgefondsCount 788, dachCount 64, funds[] mit manager, slug, totalValueUSD, aumChangePct, top)', 'hedgefonds/data/hedgefonds.json → aggregates.buys / sells / consensus (Stars) und aggregatesAll (alle)', 'Fotos: hedgefonds/data/manager-photos.json (Lizenzzeile bleibt im Detail)'],
    weg: ['Großes Kopfbild mit Säulen → Intro', 'Farbige Avatare und bunte Entdecken-Kacheln (Lila, Grün, Rosa, Orange) → Schwarz/Neongrün', 'Rote/grüne Mengen-Balken → Fluss-Zeile', '„Fonds-Einstiege“ als Kachel → Reiter auf Smart Money (H06)', '„Datenbank“ in der Leiste → Reiter „Alle Fonds“ unter Investoren (H03)', 'Akkordeon „Wie wird das gezählt?“ → C09 Erklärungen an den Zahlen'] } });

/* ---------- H02 Investoren ---------- */
const STARS = [['KG', 'Ken Griffin', 'Citadel Advisors', 'Multi-Strategie', '875,0 Mrd. $', 41.5], ['KF', 'Ken Fisher', 'Fisher Asset Management', 'Wachstum', '335,8 Mrd. $', 13.9], ['WB', 'Warren Buffett', 'Berkshire Hathaway', 'Value', '299,3 Mrd. $', 13.7], ['CA', 'Cliff Asness', 'AQR Capital', 'Quant', '286,8 Mrd. $', 31.4], ['IE', 'Israel Englander', 'Millennium', 'Multi-Strategie', '276,3 Mrd. $', 15.0], ['DS', 'David E. Shaw', 'D. E. Shaw &amp; Co.', 'Quant', '210,2 Mrd. $', 26.4], ['JS', 'John Overdeck, David Siegel', 'Two Sigma', 'Quant', '138,1 Mrd. $', 11.4], ['PM', 'Paul Marshall', 'Marshall Wace', 'Long/Short', '126,7 Mrd. $', 26.2], ['SC', 'Steven A. Cohen', 'Point72', 'Multi-Strategie', '90,7 Mrd. $', 16.2], ['DB', 'Dmitry Balyasny', 'Balyasny', 'Multi-Strategie', '80,2 Mrd. $', 4.1], ['BN', 'Bill Nygren', 'Harris Associates', 'Value', '75,4 Mrd. $', 0.5], ['JS', 'Jim Simons (†2024)', 'Renaissance Technologies', 'Quant', '72,6 Mrd. $', 13.6]];
screen('h02-a', { world: 'hedgefonds', dock: 1, h: 1520, body: `${intro('hedgefonds', 'Investoren', 'Die bekanntesten Manager mit Depot und allen Käufen und Verkäufen.')}
<div class="seg" style="margin-top:16px"><span class="on">Star-Investoren 79</span><span>Alle Fonds 788</span></div>
<div style="margin-top:12px">${search('Name, z. B. „Buffett“')}</div>
<div class="chips" style="margin-top:10px">${pill('Alle 79', 'on')}${pill('Value 23')}${pill('Wachstum 12')}${pill('Aktivist 10')}${pill('Quant 5')}</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px" class="xs b"><span class="mu">79 Investoren</span><span style="display:flex;align-items:center;gap:6px">${ic('i-filter', 14)}Größtes Depot</span></div>
${STARS.map(r => inv(r[0], r[1], r[2], r[3], r[4], r[5], 1)).join('')}
<div style="margin-top:12px">${help('Die Prozentzahl ist die Veränderung des gemeldeten Depotwerts zum Vorquartal. Sie enthält Kursgewinne und Zukäufe und ist keine Rendite.')}</div>
<div class="btn line" style="margin-top:14px;height:48px">Weitere 67 anzeigen</div>
<div class="mu xs" style="margin-top:14px">Meldungen Q2 2026. Keine Anlageberatung.</div>` });

screen('h02-b', { world: 'hedgefonds', dock: 1, body: `${intro('hedgefonds', 'Investoren')}<div class="seg" style="margin-top:16px"><span class="on">Star-Investoren 79</span><span>Alle Fonds 788</span></div>`, overlay: `<div class="ovl"></div><div class="sheet"><div class="grab"></div><div class="mt">Was heißt welcher Stil?</div>${[['Value', 'Kauft Firmen, die er für zu billig hält, und wartet.', '23'], ['Wachstum', 'Kauft Firmen, deren Umsatz schnell steigt.', '12'], ['Aktivist', 'Kauft große Anteile und drängt das Management zu Änderungen.', '10'], ['Quant', 'Computer-Modelle entscheiden, oft Tausende Positionen.', '5'], ['Multi-Strategie', 'Viele Teams mit eigenen Ansätzen unter einem Dach.', ''], ['Long/Short', 'Setzt auf steigende und auf fallende Kurse.', '']].map(([t, s, n]) => `<div style="display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--a-line)"><div style="flex:1"><b class="sm">${t}</b><div class="mu xs">${s}</div></div>${n ? `<b class="num sm">${n}</b>` : ''}</div>`).join('')}<div style="margin-top:8px">${help('Wichtig: 13F zeigt nur Kauf-Positionen in US-Aktien. Wetten auf fallende Kurse fehlen.')}</div><div class="btn ink" style="margin-top:12px;height:48px">Verstanden</div></div>` });

slide({ id: 'H02', title: 'Hedgefonds · Investoren', route: '/hedgefonds/#/investoren', now: 'H02', sub: 'Heute große bunte Karten, zwölf auf 8.400 px. Neu: eine Zeile je Investor, Stil-Chips, eine Erklärung, was die Prozentzahl bedeutet (keine Rendite).',
  neu: [['h02-a', 'Reiter „Star-Investoren“, ganze Seite'], ['h02-b', 'Sheet „Was heißt welcher Stil?“']],
  spec: { aufbau: ['Intro', 'Reiter: Star-Investoren 79 · Alle Fonds 788 (= heutige Datenbank H03)', 'Suche, Stil-Chips, Sortierung', 'Investor-Zeilen: Avatar mit Stern, Name, Firma · Stil, Depotwert, Veränderung zum Vorquartal (C07)', 'Erklärung „keine Rendite“', 'Weitere anzeigen', 'Sheet (Tipp auf Stil): Stile in einem Satz + Hinweis auf fehlende Short-Positionen'],
    komponenten: ['C07 Kursbewegung', 'C09 Erklärung', 'C14 Reiter', 'C16 Sheet', 'C20 Suche', 'Hedgefonds-Muster: Investor-Zeile mit Avatar'],
    daten: ['hedgefonds/data/hedgefonds.json → funds[] (category „Investoren“, manager, name, style, totalValueUSD, aumChangePct, history)', 'Top-3-Positionen je Investor bleiben in der Fondsseite (H05)'],
    weg: ['Große Karten mit Top-3, „neu/verkauft“-Zählern und Pastell-Hintergründen → Zeile; Top-Positionen auf H05', 'Dropdown „Größtes Portfolio“ → Sortier-Taste', 'Grüne Pfeile → C07'] } });

/* ---------- H03 Datenbank → Investoren, Reiter „Alle Fonds“ ---------- */
const ALL = [['KG', 'Ken Griffin', 'Citadel Advisors', '875,0 Mrd. $', 1], ['KF', 'Ken Fisher', 'Fisher Asset Management', '335,8 Mrd. $', 1], ['WB', 'Warren Buffett', 'Berkshire Hathaway', '299,3 Mrd. $', 1], ['CA', 'Cliff Asness', 'AQR Capital Management', '286,8 Mrd. $', 1], ['QL', 'Quantinno Capital Management', 'New York', '83,3 Mrd. $', 0], ['DB', 'Dmitry Balyasny', 'Balyasny Asset Management', '80,2 Mrd. $', 1], ['PT', 'Paul Tudor Jones', 'Tudor Investment Corp', '71,9 Mrd. $', 1], ['AL', 'Adage Capital Partners', 'Boston', '71,3 Mrd. $', 0], ['RG', 'Robyn Grew', 'Man Group', '62,7 Mrd. $', 1], ['CH', 'Chris Hohn', 'TCI Fund Management', '52,8 Mrd. $', 1], ['SL', 'Soroban Capital Partners', 'New York', '47,8 Mrd. $', 0], ['BF', 'Bert Flossbach', 'Flossbach von Storch · DACH', '22,1 Mrd. $', 1]];
screen('h03-a', { world: 'hedgefonds', dock: 1, h: 1440, body: `${intro('hedgefonds', 'Investoren')}
<div class="seg" style="margin-top:16px"><span>Star-Investoren 79</span><span class="on">Alle Fonds 788</span></div>
<div style="margin-top:12px">${search('Fonds, Manager oder Stadt')}</div>
<div class="chips" style="margin-top:10px">${pill('Alle 788', 'on')}${pill(ic('i-star', 14) + ' Stars 79')}${pill('DACH 64')}${pill('Institutionen 40')}</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px" class="xs b"><span class="mu">788 Fonds · nach Depotgröße</span><span style="display:flex;align-items:center;gap:6px">${ic('i-filter', 14)}Filter</span></div>
${ALL.map(r => inv(r[0], r[1], r[2], '', r[3], null, r[4])).join('')}
<div style="margin-top:12px">${help('Stern = Star-Investor mit Porträt und Erklärung. Alle anderen sind Fonds, die eine 13F-Meldung abgeben, oft mit Sitz in den USA.')}</div>
<div class="btn line" style="margin-top:14px;height:48px">Weitere 50 anzeigen</div>
${acc('Weitere Institutionen (40)')}
<div class="mu xs" style="margin-top:12px">Stand 26.10.2026. Keine Anlageberatung.</div>` });

screen('h03-b', { world: 'hedgefonds', dock: 1, body: `${intro('hedgefonds', 'Investoren')}<div class="seg" style="margin-top:16px"><span>Star-Investoren 79</span><span class="on">Alle Fonds 788</span></div>`, overlay: `<div class="ovl"></div><div class="sheet"><div class="grab"></div><div class="mt">Fonds filtern</div>${sect('Sortieren')}<div style="display:flex;flex-wrap:wrap;gap:7px">${pill('Größtes Depot', 'on')}${pill('Größtes Plus')}${pill('Größtes Minus')}${pill('Name A–Z')}</div>${sect('Region')}<div style="display:flex;flex-wrap:wrap;gap:7px">${pill('Alle', 'on')}${pill('USA')}${pill('Deutschland &amp; DACH')}${pill('Europa')}${pill('Asien')}</div>${sect('Anzeigen')}<div class="kv"><span class="sm b">Nur Star-Investoren</span>${toggle(0)}</div><div class="kv"><span class="sm b">Fonds ohne neue Meldung</span>${toggle(1)}</div><div class="btn" style="margin-top:14px;height:50px">788 Fonds zeigen</div></div>` });

slide({ id: 'H03', title: 'Hedgefonds · Datenbank', route: '/hedgefonds/#/datenbank', newRoute: '/hedgefonds/#/investoren/alle', now: 'H03', sub: 'Die Datenbank ist heute ein eigener Leisten-Platz, sieht aber aus wie die Investoren-Liste. Neu: ein Reiter „Alle Fonds“ unter Investoren, der Leisten-Platz wird frei für Smart Money.',
  neu: [['h03-a', 'Investoren, Reiter „Alle Fonds“'], ['h03-b', 'Filter-Sheet']],
  spec: { aufbau: ['Intro „Investoren“ (gleiche Seite wie H02)', 'Reiter „Alle Fonds 788“ aktiv', 'Suche (Fonds, Manager, Stadt), Chips Alle · Stars · DACH 64 · Institutionen 40', 'Zeilen: Avatar (Stern bei Star), Manager oder Fonds, Firma oder Stadt, Depotwert', 'Erklärung Stern', 'Weitere 50 anzeigen; Akkordeon „Weitere Institutionen (40)“', 'Filter-Sheet: Sortieren, Region, Schalter, Button mit Trefferzahl'],
    komponenten: ['C14 Reiter', 'C15 Schalter', 'C16 Sheet', 'C20 Suche', 'Hedgefonds-Muster: Investor-Zeile mit Avatar'],
    daten: ['hedgefonds/data/hedgefonds.json → funds[] (category, region, city, totalValueUSD)', 'hedgefonds/data/universe.json (788 Fonds, 40 Institutionen)'],
    weg: ['Leisten-Platz „Datenbank“ → Reiter unter „Investoren“; die Leiste bekommt „Smart Money“', 'Bunte Initialen-Kreise → schwarze Avatare', 'Dropdown „Größte Fonds“ → Filter-Sheet'] } });

/* ---------- H04 Aktien ---------- */
const TOP = [['AMZN', 'Amazon', 481, 45], ['MSFT', 'Microsoft', 414, 36], ['NVDA', 'NVIDIA', 413, 34], ['GOOGL', 'Alphabet (A)', 392, 47], ['META', 'Meta Platforms', 345, 42], ['AAPL', 'Apple', 339, 28], ['GOOG', 'Alphabet (C)', 302, 35], ['AVGO', 'Broadcom', 295, 24], ['TSM', 'TSMC', 258, 34], ['V', 'Visa', 256, 28]];
screen('h04-a', { world: 'hedgefonds', dock: 2, h: 1960, body: `${intro('hedgefonds', 'Wer hält welche Aktie?', 'Tippe eine Aktie an und sieh, welche Fonds sie halten, kaufen oder verkaufen.')}
<div style="margin-top:14px">${search('Aktie oder Kürzel, z. B. „pal“')}</div>
${sect('Meistgehalten', 'Alle 4.840')}
<div class="seg"><span class="on">Alle Fonds</span><span>Star-Investoren</span></div>
<div style="margin-top:6px">${TOP.map(([t, n, f, s], i) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--a-line)"><span class="mu xs b" style="width:16px">${i + 1}</span>${lg(t)}<div style="flex:1;min-width:0"><b class="sm">${n}</b><div class="bar" style="height:6px;margin-top:6px"><i style="width:${(f / 481 * 100).toFixed(1)}%"></i></div></div><div style="text-align:right;width:62px"><b class="num">${f}</b><div class="mu xs">${s} Stars</div></div></div>`).join('')}</div>
<div style="margin-top:10px">${help('Gezählt wird, bei wie vielen Hedgefonds die Aktie zu den gemeldeten Positionen gehört.')}</div>
${kick('Käufe und Verkäufe im Quartal', 'Über alle Hedgefonds')}
<div class="seg"><span class="on">Käufe</span><span>Verkäufe</span></div>
<div style="margin-top:6px">${flow(1, 'SPCX', 'SpaceX', '62,6 Mrd. $', '79 Fonds · 68 neu', 100, 1)}${flow(2, 'MU', 'Micron Technology', '12,6 Mrd. $', '69 Fonds · 39 neu', 20, 1)}${flow(3, 'GOOGL', 'Alphabet (A)', '11,8 Mrd. $', '75 Fonds · 19 neu', 19, 1)}${flow(4, 'GOOG', 'Alphabet (C)', '11,0 Mrd. $', '57 Fonds · 14 neu', 18, 1)}${flow(5, 'AMZN', 'Amazon', '7,4 Mrd. $', '123 Fonds · 19 neu', 12, 1)}</div>
<div style="margin-top:10px">${help('Dieselbe Aktie kann in beiden Listen stehen: Manche Fonds kaufen, andere verkaufen.')}</div>
${sect('Mehr')}
<div class="stack">${navcard('i-signal', 'Insider-Käufe', 'Chefs kaufen eigene Aktien')}${navcard('i-new', 'Fonds-Einstiege', 'Neue Positionen im Quartal')}</div>
<div class="mu xs" style="margin-top:14px">Stand 26.10.2026. Keine Anlageberatung.</div>` });

slide({ id: 'H04', title: 'Hedgefonds · Aktien', route: '/hedgefonds/#/aktien', now: 'H04', sub: 'Heute 11.800 px: 30 Aktien, dann 20 Käufe und Verkäufe mit Mini-Avataren und „▸ 75 Fonds anzeigen“. Neu: Top 10 mit Balken, Käufe und Verkäufe als Reiter, jede Aktie öffnet die eine Aktienseite.',
  neu: [['h04-a', 'Aktien, ganze Seite']],
  spec: { aufbau: ['Intro + Suche', 'Meistgehalten: Reiter Alle Fonds / Stars, Top 10 mit Rang, Logo, Balken, Zahl der Fonds und Stars, Link „Alle 4.840“', 'Erklärung Zählweise', 'Käufe und Verkäufe: Reiter, Top 5 als Fluss-Zeilen', 'Erklärung „beide Listen“', 'Mehr: Insider-Käufe, Fonds-Einstiege (→ Smart Money)', 'Tipp auf Aktie → Aktienseite Perspektive „Investoren“ (H07)'],
    komponenten: ['C09 Erklärung', 'C12 Navigationskarte', 'C14 Reiter', 'C20 Suche', 'Hedgefonds-Muster: Fluss-Zeile'],
    daten: ['hedgefonds/data/stocks/index.json (fields: cusip, ticker, name, fundCount, starCount, valueUSD; 4.840 Zeilen)', 'hedgefonds/data/hedgefonds.json → aggregatesAll.buys / sells'],
    weg: ['Plätze 11–30 → „Alle 4.840“', 'Mini-Avatare „+11“ und „▸ Fonds anzeigen“ → auf der Aktienseite', 'Rot/Grün → Schwarz/Neongrün', 'Chips „Insider-Käufe“, „Fonds-Einstiege“ oben → Smart Money in der Leiste'] } });

/* ---------- H05 Fonds Pershing Square ---------- */
const PSH = [['BN', 'Brookfield', 17.6, -2.8], ['AMZN', 'Amazon', 17.4, 19.2], ['UBER', 'Uber', 15.7, -0.8], ['MSFT', 'Microsoft', 15.3, 'neu'], ['QSR', 'Restaurant Brands', 12.2, -1.0], ['META', 'Meta Platforms', 11.1, 0], ['HHH', 'Howard Hughes', 8.7, 0], ['SEG', 'Seaport Entertainment', 0.8, 0], ['GOOG', 'Alphabet (C)', 0.7, -94.9], ['HTZ', 'Hertz', 0.5, 0], ['GOOGL', 'Alphabet (A)', 0.1, -95.2]];
screen('h05-a', { world: 'hedgefonds', dock: 1, h: 1920, body: `${back('Investoren')}
<div style="display:flex;gap:14px;align-items:center;margin-top:16px"><span style="width:64px;height:64px;border-radius:50%;background:var(--a-ink);color:var(--a-inv);display:grid;place-items:center;font-weight:900;font-size:20px;flex:none">BA</span><div><div class="ltag">Aktivist · Gründer &amp; CEO</div><div class="lt" style="font-size:30px">Bill Ackman</div><div class="mu sm">Pershing Square Capital</div></div></div>
<p class="sm" style="margin-top:10px;font-size:15px">Aktivistischer Investor mit <b>wenigen, sehr konzentrierten</b> Positionen.</p>
<div class="card line" style="margin-top:12px;display:flex;gap:10px;align-items:flex-start">${vd('o', 'Stand Q1 2026')}<span class="sm">Für Q2 2026 liegt noch keine Meldung vor. Du siehst den letzten Stand vom 31.03.2026.</span></div>
<div class="grid2" style="margin-top:12px"><div class="card" style="padding:12px"><div class="mu xs b">Depotwert (13F)</div><div class="bb num" style="font-size:20px;margin-top:3px">13,7 Mrd. $</div><div style="margin-top:6px">${chg(-11.67)}</div></div>${tile('Positionen', '11', 'Top 5 = 78,2 %')}</div>
${sect('Depotwert im Verlauf')}
<div class="card" style="padding:12px">${bars([['20Q2/24', 10.41], ['20Q3/24', 12.92], ['20Q4/24', 12.66], ['20Q1/25', 11.93], ['20Q2/25', 13.73], ['20Q3/25', 14.64], ['20Q4/25', 15.53], ['20Q1/26', 13.71]], { w: 330, h: 110 })}<div class="xs b" style="margin-top:6px">8 Quartale · +31,7 % seit Q2 2024 · Hoch 15,5 Mrd. $</div></div>
${sect('Was er hält')}
<div class="seg"><span class="on">Positionen 11</span><span>Käufe 2</span><span>Verkäufe 6</span></div>
<div style="margin-top:6px">${PSH.map(([t, n, w, d]) => hold(t, n, w, d, 17.6)).join('')}</div>
<div style="margin-top:10px">${help('Anteil: Welcher Teil des gemeldeten Depots in dieser Aktie steckt. Rechts die Veränderung der Stückzahl zum Vorquartal.')}</div>
${acc('13F-Meldung bei der SEC')}${acc('Foto und Lizenz')}
<div class="mu xs" style="margin-top:14px">Vergleich Q4 2025 → Q1 2026. Keine Anlageberatung.</div>` });

screen('h05-b', { world: 'hedgefonds', dock: 1, h: 1060, body: `${back('Investoren')}
<div style="display:flex;gap:12px;align-items:center;margin-top:14px">${av('BA', 1)}<div><b>Bill Ackman</b><div class="mu xs">Pershing Square · Stand Q1 2026</div></div></div>
<div class="seg" style="margin-top:16px"><span>Positionen 11</span><span class="on">Käufe 2</span><span>Verkäufe 6</span></div>
<div class="sm b" style="margin:16px 0 4px">Gekauft</div>
${hold('MSFT', 'Microsoft · neu', 15.3, 'neu', 17.6)}${hold('AMZN', 'Amazon · aufgestockt', 17.4, 19.2, 17.6)}
<div class="sm b" style="margin:18px 0 4px">Verkauft</div>
<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--a-line)">${tk('HLT')}<b class="sm" style="flex:1">Hilton · komplett raus</b>${vd('w', 'Verkauft')}</div>
${hold('GOOGL', 'Alphabet (A)', 0.1, -95.2, 17.6)}${hold('GOOG', 'Alphabet (C)', 0.7, -94.9, 17.6)}${hold('BN', 'Brookfield', 17.6, -2.8, 17.6)}${hold('QSR', 'Restaurant Brands', 12.2, -1.0, 17.6)}${hold('UBER', 'Uber', 15.7, -0.8, 17.6)}
<div style="margin-top:10px">${help('Käufe = 1 neue + 1 aufgestockte Position. Verkäufe = 5 verkleinert + 1 komplett verkauft.')}</div>` });

slide({ id: 'H05', title: 'Hedgefonds · Fonds Pershing Square', route: '/hedgefonds/#/fonds/pershing-square', now: 'H05', sub: 'Steht für alle Fondsseiten. Heute: gelbe Warnbox, bunte Icon-Kacheln, Torte in sieben Farben, blaue Balken. Neu: ehrlicher Meldestand als Urteil, Verlauf mit bars(), Positionen als Anteils-Balken, Käufe und Verkäufe als Reiter.',
  neu: [['h05-a', 'Fondsseite, ganze Seite'], ['h05-b', 'Reiter „Käufe“ und „Verkäufe“']],
  spec: { aufbau: ['Zurück zu Investoren', 'Kopf: Foto oder Initialen, Stil · Rolle, Name, Fonds, ein Satz', 'Meldestand-Karte (C08 „Stand Q1 2026“), wenn das aktuelle Quartal fehlt', '2 Kacheln: Depotwert + Veränderung, Positionen + Top-5-Anteil', 'Depotwert im Verlauf: 8 Quartale als C17 Balken', 'Reiter Positionen / Käufe / Verkäufe', 'Positionen: Kürzel, Name, Anteil, Veränderung, Anteils-Balken', 'Erklärung Anteil; Akkordeons SEC-Meldung, Foto-Lizenz', 'Reiter Käufe/Verkäufe: neu, aufgestockt, verkleinert, komplett verkauft (Hilton)'],
    komponenten: ['C07 Kursbewegung', 'C08 Urteil', 'C09 Erklärung', 'C11 Kachel', 'C14 Reiter', 'C17 Balken', 'Hedgefonds-Muster: Anteils-Zeile'],
    daten: ['hedgefonds/data/funds/pershing-square.json (manager, role, style, bio, reportDate, totalValueUSD, aumChangePct, history[8], holdings[11], tradeCounts, trades.new/added/reduced/sold)', 'Foto: hedgefonds/data/hedgefonds.json → funds[].photo (Lizenz CC BY 2.0)'],
    weg: ['Torte in 7 Farben → Anteils-Balken je Position (gleiche Information, eine Farbe)', 'Blaue Quartals-Balken → C17', 'Gelbe Warnbox → Meldestand-Karte', 'Bunte Icon-Kacheln (Koffer, Pfeil, Ebenen, Kalender) → 2 Kacheln', 'Button „13F bei der SEC“ → Akkordeon unten'] } });

/* ---------- H06 Smart Money ---------- */
screen('h06-a', { world: 'hedgefonds', dock: 3, h: 1660, body: `${intro('hedgefonds', 'Smart Money', 'Wenn Chefs und Großaktionäre mit eigenem Geld Aktien der eigenen Firma kaufen.')}
<div class="seg" style="margin-top:16px"><span class="on">Insider-Käufe</span><span>Fonds-Einstiege</span></div>
<div class="card lime" style="margin-top:14px;padding:14px"><b>Warum das zählt</b><p class="sm" style="margin-top:4px">Verkäufe haben viele Gründe, etwa Steuern. Ein Kauf mit eigenem Geld meist nur einen: Vertrauen in die eigene Firma.</p></div>
<div class="grid3" style="margin-top:10px">${tile('Gruppen-Käufe', '50', 'mind. 3 Insider')}${tile('Größter Kauf', 'RSG', '1,4 Mrd. $')}${tile('Stand', '27.10.', 'Form 4')}</div>
<div style="margin-top:10px">${help('Insider müssen jeden Kauf binnen zwei Geschäftstagen melden (Form 4). Diese Daten sind also fast aktuell.')}</div>
${sect('Gruppen-Käufe')}
${[['TSM', 'TSMC', 30, '837 Tsd. $'], ['BBD', 'Banco Bradesco', 22, '97 Mio. $'], ['RENT', 'Rent the Runway', 19, '6 Mio. $'], ['BRVE', 'Braveheart Bio', 18, '159 Mio. $'], ['XBP', 'Xbp Global', 15, '2 Mio. $'], ['BLSM', 'BlossomHill Therapeutics', 12, '25 Mio. $']].map(([t, n, k, v], i) => flow(i + 1, t, n, k + ' Insider', 'netto ' + v + ' gekauft', k / 30 * 100, 1)).join('')}
<div style="margin-top:10px">${help('Gruppen-Kauf: Mindestens drei Insider kaufen innerhalb von 30 Tagen. Das ist seltener als ein Einzelkauf.')}</div>
${sect('Größte Netto-Käufe · 90 Tage')}
${[['RSG', 'Republic Services', '1,4 Mrd. $', 2, 100], ['LEN', 'Lennar', '595 Mio. $', 2, 42], ['MAIR', 'Madison Air Solutions', '220 Mio. $', 3, 16], ['GPI', 'Group 1 Automotive', '211 Mio. $', 1, 15], ['BRVE', 'Braveheart Bio', '159 Mio. $', 18, 11]].map(([t, n, v, k, p], i) => flow(i + 1, t, n, v, k + (k === 1 ? ' Käufer' : ' Käufer'), p, 1)).join('')}
<div style="margin-top:10px">${help('Netto: Käufe minus Verkäufe aller Insider in 90 Tagen.')}</div>
<div class="mu xs" style="margin-top:14px">Stand 27.10.2026. Keine Anlageberatung.</div>` });

screen('h06-b', { world: 'hedgefonds', dock: 3, body: `${intro('hedgefonds', 'Smart Money')}<div class="seg" style="margin-top:16px"><span class="on">Insider-Käufe</span><span>Fonds-Einstiege</span></div>`, overlay: `<div class="ovl"></div><div class="sheet"><div class="grab"></div><div class="mt">Wer ist ein Insider?</div>${[['i-person', 'Vorstand und Geschäftsführung', 'Zum Beispiel CEO oder Finanzchef'], ['i-grid', 'Board-Mitglieder', 'Der Aufsichtsrat der Firma'], ['i-pie', 'Großaktionäre', 'Wer mehr als 10 % der Aktien hält']].map(([i, t, s]) => `<div style="display:flex;gap:12px;align-items:center;padding:11px 0;border-top:1px solid var(--a-line)"><span class="hud" style="width:38px;height:38px">${ic(i, 19)}</span><div><b class="sm">${t}</b><div class="mu xs">${s}</div></div></div>`).join('')}${sect('Was wir zeigen')}${help('Nur Käufe und Verkäufe über die Börse. Geschenkte Aktien und Optionen aus dem Gehalt zählen nicht als Kauf.')}<div style="margin-top:8px">${help('Mehrere Aktiengattungen einer Firma zählen als eine Firma.')}</div><div class="btn ink" style="margin-top:14px;height:48px">Verstanden</div></div>` });

slide({ id: 'H06', title: 'Hedgefonds · Smart Money', route: '/hedgefonds/#/smart-money', now: 'H06', sub: 'Heute bunte Icon-Kacheln, ein langer Erklärtext in einer grünen Box und 45 Zeilen. Neu: der Grund in zwei Sätzen, Gruppen-Käufe und Netto-Käufe als Fluss-Zeilen, eigener Platz in der Leiste.',
  neu: [['h06-a', 'Insider-Käufe, ganze Seite'], ['h06-b', 'Sheet „Wer ist ein Insider?“']],
  spec: { aufbau: ['Intro „Smart Money“', 'Reiter Insider-Käufe / Fonds-Einstiege', 'Neongrüne Karte „Warum das zählt“', '3 Kacheln: Gruppen-Käufe 50 · größter Kauf RSG · Stand 27.10.', 'Erklärung Form 4 (fast aktuell, im Gegensatz zu 13F)', 'Gruppen-Käufe 30 Tage: Top 6 Fluss-Zeilen (Zahl der Insider, netto)', 'Größte Netto-Käufe 90 Tage: Top 5', 'Sheet: Wer ist ein Insider, was gezählt wird'],
    komponenten: ['C02 Leiste: Platz „Smart Money“ aktiv', 'C09 Erklärung', 'C11 Kachel', 'C14 Reiter', 'C16 Sheet', 'Hedgefonds-Muster: Fluss-Zeile'],
    daten: ['hedgefonds/data (Insider-Datei des Smart-Money-Laufs, Form 4, Stand 27.10.2026; Felder: Cluster je Emittent mit Zahl der Insider, netto USD; Netto-Käufe 90 Tage mit Käuferzahl)', 'Fonds-Einstiege: hedgefonds/data/hedgefonds.json → aggregatesAll.buys (status „new“)'],
    weg: ['Orange/Grün/Blau Icon-Kacheln → C11', 'Langer Text in der grünen Box → zwei Sätze + Sheet', 'Plätze 7–15 je Liste → „Alle anzeigen“', 'Heute nur über Kacheln erreichbar → eigener Platz in der Leiste'] } });

/* ---------- H07 NVIDIA, Perspektive Investoren ---------- */
screen('h07-a', { world: 'hedgefonds', dock: 2, h: 1900, body: `${STOCK('Investoren')}
<div class="card ink" style="margin-top:14px;padding:16px"><div style="display:flex;justify-content:space-between;align-items:center"><span class="ltag" style="color:#9b9b9b">Hedgefonds · Q2 2026</span>${vd('m', 'Ausgeglichen')}</div><div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><span class="bb num" style="font-size:44px;letter-spacing:-.05em;color:var(--lime);line-height:1">413</span><span class="b">Fonds halten NVIDIA</span></div><div class="sm" style="opacity:.75;margin-top:4px">darunter 34 Star-Investoren · zusammen 276,4&nbsp;Mrd.&nbsp;$</div>
<div style="display:flex;justify-content:space-between;margin-top:14px" class="xs b"><span>193 kaufen mehr</span><span>200 verkaufen</span></div><div style="display:flex;height:10px;border-radius:9px;overflow:hidden;gap:3px;margin-top:6px"><i style="flex:193;background:var(--lime)"></i><i style="flex:200;background:#fff"></i></div><div class="xs" style="opacity:.7;margin-top:6px">22 neu eingestiegen · 28 komplett ausgestiegen</div></div>
<div style="margin-top:10px">${help('Ausgeglichen: Etwa gleich viele Fonds haben aufgestockt wie verkleinert.')}</div>
<div class="card lime" style="margin-top:12px;padding:13px;display:flex;gap:10px;align-items:center">${ic('i-star', 20)}<span class="sm"><b>Größte Überzeugung:</b> Builder Investment Group hat 36,1 % ihres Depots in NVIDIA.</span></div>
${sect('Star-Investoren mit NVIDIA', 'Alle 34')}
${[['KF', 'Ken Fisher', 'Fisher Asset Mgmt.', '18,2 Mrd. $', 2.7, '5,4 %'], ['CA', 'Cliff Asness', 'AQR Capital', '7,5 Mrd. $', 17.8, '2,6 %'], ['DS', 'David E. Shaw', 'D. E. Shaw &amp; Co.', '4,0 Mrd. $', 36.3, '1,9 %'], ['IE', 'Israel Englander', 'Millennium', '2,4 Mrd. $', 14.9, '0,9 %'], ['KG', 'Ken Griffin', 'Citadel Advisors', '2,4 Mrd. $', -36.7, '0,3 %'], ['CC', 'Chase Coleman', 'Tiger Global', '2,2 Mrd. $', -6.8, '9,3 %']].map(([i, n, f, v, d, w]) => inv(i, n, f + ' · ' + w + ' Anteil', '', v, d, 1)).join('')}
<div style="margin-top:10px">${help('Rechts die Veränderung der Stückzahl zum Vorquartal. Anteil: Gewicht von NVIDIA im Depot des Fonds.')}</div>
<div class="card line" style="margin-top:12px"><b class="sm">Komplett ausgestiegen, u. a.</b><div class="sm" style="margin-top:4px">Dan Sundheim (D1 Capital, zuvor 274 Mio. $) · Daniel Loeb (Third Point, 33 Mio. $)</div></div>
${sect('Insider bei NVIDIA · 90 Tage')}
<div class="grid3">${tile('Käufer', '0', '')}${tile('Verkäufer', '3', '')}<div class="card" style="padding:12px"><div class="mu xs b">Netto</div><div style="margin-top:6px"><span class="chg dn">−968 Mio. $</span></div></div></div>
<div class="card" style="margin-top:10px;display:flex;gap:10px;align-items:center">${vd('o', 'Keine Käufe')}<span class="sm">Kein Insider hat in 90 Tagen gekauft.</span></div>
${sect('Alle 13F-Melder · Q2 2026')}
${kv([['Halter', '5.955'], ['Neu eingestiegen', '+221'], ['Ausgestiegen', '123'], ['Aufgestockt / reduziert', '2.979 / 2.336']])}
<div style="margin-top:10px">${help('Alle 13F-Melder: auch Banken, Versicherer und ETF-Anbieter, nicht nur Hedgefonds.')}</div>
<div class="mu xs" style="margin-top:14px">Stand 26.10.2026. Keine Anlageberatung.</div>` });

slide({ id: 'H07', title: 'Hedgefonds · NVIDIA (Perspektive Investoren)', route: '/hedgefonds/#/aktie/67066G104', newRoute: 'Aktienseite, Perspektive „Investoren“', now: 'H07', sub: 'Heute eigener Kopf ohne Kurs, Adresse über CUSIP, rote und grüne Zahlen. Neu: gemeinsamer Aktienkopf, eine Antwort (413 Fonds, ausgeglichen), Stars mit Gewicht, Insider und alle Melder darunter.',
  neu: [['h07-a', 'Aktie NVIDIA, Perspektive „Investoren“, Hedgefonds-Leiste unten']],
  spec: { aufbau: ['C04 Aktienkopf (204,64 $, Perspektive „Investoren“ aktiv)', 'Schwarze Antwort-Karte: 413 Fonds, 34 Stars, 276,4 Mrd. $, Urteil, Käufer/Verkäufer-Balken 193 : 200, neu 22 / raus 28', 'Erklärung „Ausgeglichen“', 'Neongrüne Karte „Größte Überzeugung“', 'Star-Investoren mit NVIDIA: Top 6 nach Wert, mit Anteil und Veränderung; Link „Alle 34“, dahinter Reiter Alle 413 / Stars 34', 'Komplett ausgestiegen (Stars)', 'Insider 90 Tage: Käufer 0, Verkäufer 3, Netto; Leerer Zustand „Keine Käufe“', 'Alle 13F-Melder als kv-Liste'],
    komponenten: ['C04 Aktienkopf', 'C05 Perspektiven-Leiste', 'C02 Hedgefonds-Leiste bleibt (Platz „Aktien“)', 'C07 Kursbewegung', 'C08 Urteil (Käufer/Verkäufer: s ab deutlich mehr Käufern, m ausgeglichen, w deutlich mehr Verkäufer)', 'C09 Erklärung', 'C18 Leerer Zustand', 'kv-Liste', 'Hedgefonds-Muster: Käufer/Verkäufer-Balken'],
    daten: ['hedgefonds/data/stocks/5.json → "67066G104" (fundCount 413, starCount 34, valueUSD, buyers 193, sellersCount 200, holders[] mit w/v/st/d, sellers[])', 'hedgefonds/data/hedgefonds.json → funds[] (Zuordnung slug → Manager für Stars)', 'Insider und alle 13F-Melder: Smart-Money-Daten, Stand 27.10.2026', 'Adresse: Aktienseite per Ticker, CUSIP-Zuordnung über hedgefonds/data/cusip-map.json und core/identity.js'],
    weg: ['Eigener Kopf ohne Kurs + 9er-Icon-Leiste → C04 + C05', 'Grün/Rot für Käufer/Verkäufer → Neongrün/Weiß im schwarzen Feld', 'Liste der 413 Fonds nach Gewicht zuerst → Stars zuerst, volle Liste über „Alle“', 'Adresse mit CUSIP → Aktienseite mit Ticker'] } });
})();
