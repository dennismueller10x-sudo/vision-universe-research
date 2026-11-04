/* 10 · Vorsorge: vom 10-Euro-Sparplan bis zum Portfolio-X-Ray. Beispielrechnungen sind immer als Beispiel markiert. */
(function () {
const { screen, slide, chapter, ic, hud, chart, tf, chg, vd, help, lg, row, D, S, de, sect, kv, tile, navcard, pill, toggle, bars, search, intro } = VU;

/* ---------- Echte Kursreihen: vorsorge/data/series/<SYM>.json (price.daily, 02.10.2025–02.10.2026, auf 52 Punkte verdichtet) ---------- */
const URTH = [182.64, 182.67, 180.88, 183.16, 184.65, 182.17, 183.23, 180.06, 184.73, 186.25, 187.85, 183.67, 187.81, 188.01, 190.05, 185.64, 191.29, 189.44, 191.6, 190.41, 190.77, 187.21, 186.36, 184.49, 179.85, 180.02, 187.66, 193.33, 194.92, 193.87, 200.63, 201.63, 198.97, 203.91, 204.65, 197.44, 200.99, 199.29, 202.65, 204.63, 201.9, 200.88, 203.37, 210.47, 211.21, 207.83, 209.93, 210.34, 207.69, 206.77, 208.73, 207.53];
/* URTH seit Auflage (price.weekly, 13.01.2012–02.10.2026) */
const URTHMAX = [50.3, 55.2, 53.41, 54.06, 60.26, 62.15, 65.14, 69.87, 71.29, 72.76, 73.39, 74.81, 72.94, 70.69, 65.35, 69.04, 72.36, 74.2, 77.5, 80.26, 85.76, 90.72, 89.47, 91.12, 81.94, 88.79, 91.87, 95.11, 101.92, 90.7, 99.39, 111.44, 122.56, 129.19, 136.36, 125.1, 117.41, 108.01, 109.25, 119.14, 128.44, 122.84, 140.33, 146.58, 156.62, 154.25, 153.05, 173.63, 179.18, 184.98, 202.73, 207.53];
const SPY = [669.22, 671.16, 660.64, 671.76, 679.83, 670.31, 672.04, 662.63, 679.68, 684.39, 689.17, 676.47, 690.31, 687.72, 695.16, 677.58, 695.49, 689.53, 692.12, 686.29, 687.35, 680.33, 677.18, 670.79, 653.18, 650.34, 676.01, 699.94, 711.21, 711.58, 733.83, 742.31, 733.73, 750.46, 754.24, 725.43, 740.96, 734.3, 744.78, 754.95, 743.29, 738.93, 747.03, 773.26, 776.34, 762.6, 771.1, 773.17, 764.29, 761.69, 771.35, 769.64];
const EEM = [54.07, 53.93, 54.19, 54.74, 55.43, 54.71, 54.93, 53.85, 54.24, 54.33, 54.88, 53.2, 54.8, 56.86, 57.94, 57.31, 60.34, 59.6, 60.6, 61.19, 62.62, 58.42, 58.68, 58.75, 56.52, 56.79, 60.44, 62.2, 63.38, 62.69, 67.49, 67.21, 64.26, 68.39, 69.92, 64.66, 68.56, 67.96, 65.7, 66.9, 63.29, 63.33, 64.09, 65.64, 66.61, 66.62, 67.61, 67.47, 67.84, 67.03, 67.98, 67.67];
const QQQ = [605.73, 610.7, 599.99, 610.58, 626.05, 611.67, 608.4, 599.87, 614.27, 622.94, 625.58, 609.11, 623.89, 617.99, 627.17, 608.06, 631.13, 616.52, 611.47, 605.79, 607.87, 601.58, 607.77, 603.31, 583.98, 577.18, 606.09, 637.4, 655.11, 661.57, 695.77, 714.71, 701.53, 729.45, 744.21, 693.69, 722.51, 716.38, 712.6, 725.51, 695.33, 684.23, 687.99, 723.03, 731.07, 710.93, 721.11, 717.67, 714.88, 721.45, 744.5, 749.58];
const FEZ = [63.32, 62.18, 62.74, 62.97, 62.83, 61.94, 63.72, 61.33, 62.73, 63.83, 64.95, 64.29, 64.72, 66, 66.88, 65.3, 68.34, 67.08, 68.18, 68.27, 68.64, 64.35, 63.82, 63.16, 61.14, 62.08, 65.7, 66.67, 65.94, 64.52, 67.97, 66.33, 65.24, 68.2, 67.62, 66.65, 69.24, 67.59, 68.99, 68.08, 67.72, 67.69, 69.77, 71.86, 72.1, 71.28, 71.34, 70.59, 69.7, 68.18, 68.65, 67];
const IWM = [244.02, 245.13, 245.06, 246.42, 244.85, 240.35, 236.79, 233.43, 247.3, 251.82, 257.8, 248.71, 251.42, 252.73, 261.5, 262.58, 264.73, 262.78, 266.16, 263.99, 263.33, 259.24, 253.36, 250.05, 248.78, 248, 260.47, 269.39, 276.48, 272.08, 286.8, 282.67, 273, 290.37, 287.67, 282.05, 289.88, 298.91, 297.58, 295.99, 294.04, 291.17, 291.2, 301.56, 305.09, 297.67, 299.81, 295.19, 288.89, 284.1, 281.97, 281.52];
/* Portfolio URTH 88 % + EEM 12 %, wöchentlich neu gewichtet, Start = 100 (13.01.2012), Kurs ohne Ausschüttungen → 376,4 ≈ +9,4 % p. a. */
const PF = [100, 109.5, 105.9, 107.4, 119.0, 119.9, 126.9, 134.1, 137.3, 141.0, 140.6, 142.7, 139.4, 134.2, 122.7, 129.7, 137.3, 140.1, 147.3, 152.5, 164.0, 173.6, 170.2, 171.6, 154.9, 167.7, 172.9, 178.4, 190.2, 168.5, 186.0, 209.0, 229.1, 239.5, 250.3, 230.8, 214.8, 196.9, 199.1, 216.1, 232.5, 221.2, 250.4, 261.4, 280.5, 272.6, 272.7, 309.5, 320.9, 333.2, 370.6, 376.4];
const idx = a => a.map(v => v / a[0] * 100);

/* Kern-ETFs: vorsorge/data/etf-index-home.json (p1Y, ter, vol). */
const CORE = [['URTH', 'Aktien Welt', 'MSCI World', URTH, 13.63, '0,24 %', '16 %'], ['SPY', 'Aktien USA', 'S&P 500', SPY, 15.01, 'k. A.', '16 %'], ['EEM', 'Schwellenländer', 'MSCI Emerging Markets', EEM, 25.15, '0,72 %', '19 %'], ['QQQ', 'USA Technik', 'Nasdaq-100', QQQ, 23.75, '0,18 %', '22 %'], ['FEZ', 'Aktien Europa', 'EURO STOXX 50', FEZ, 5.81, '0,29 %', '21 %'], ['IWM', 'US-Nebenwerte', 'Russell 2000', IWM, 15.37, '0,19 %', '21 %']];
/* Vorsorge-Muster: ETF-Zeile (wie Aktienzeile C10, rechts 1-Jahres-Bewegung). */
const etf = ([t, n, s, ser, r]) => `<div class="lr" style="grid-template-columns:42px 1fr 58px auto">${lg(t)}<div class="n"><b>${n}</b><span>${s}</span></div>${chart(ser, { w: 58, h: 30, grid: false, base: false })}<div class="p"><span class="xs mu b">1 Jahr</span>${chg(r)}</div></div>`;
const wbar = (l, v, w, lime, sub) => `<div style="padding:8px 0;border-top:1px solid var(--a-line)"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><span class="sm b">${l}${sub ? `<span class="mu xs"> ${sub}</span>` : ''}</span><span class="bb num sm">${v}</span></div><div class="bar" style="height:7px;margin-top:5px"><i class="${lime ? 'l' : ''}" style="width:${w}%"></i></div></div>`;
const bsp = (t = 'Beispielrechnung') => `<span class="chip lm" style="height:24px;font-size:11px;padding:0 9px;letter-spacing:.03em;text-transform:uppercase;font-weight:900">${t}</span>`;
const foot = `<div style="margin-top:22px;padding-top:12px;border-top:1px solid var(--a-line)" class="mu xs">Daten 02.10.2026 · Kurse Tiingo, Bestände SEC N-PORT, Regeln BGBl. 2026 I Nr. 156. Analyse und Information, keine Anlage-, Steuer- oder Rechtsberatung.</div>`;

/* Beispielrechnungen (Formel offen gelegt, keine Prognose). */
const plan = (r, yrs = 32, start = 5000, m = 250, infl = 0.02, cost = 0.003) => { const a = []; let v = start; for (let y = 0; y <= yrs; y++) { a.push(v / Math.pow(1 + infl, y)); v = v * (1 + r - cost) + m * 12 * (1 + (r - cost) / 2); } return a; };
const ten = (r, yrs = 30, m = 120) => { let v = 0; const a = [0]; for (let y = 1; y <= yrs; y++) { v = v * (1 + r) + m * (1 + r / 2); a.push(v); } return a; };
const r100 = v => de(Math.round(v / 100) * 100, 0);
/* Unsichtbare Null-Zonen weiten die Skala von chart(), damit gestrichelte Szenario-Linien im Bild bleiben. */
const fitz = (...ls) => { const all = [].concat(...ls); const lo = Math.min(...all), hi = Math.max(...all); return [[lo, lo, 'g'], [hi, hi, 'g']]; };

chapter({ n: '10', title: 'Vorsorge', icon: 'vorsorge', anchor: 'vorsorge', was: 'Vom ersten 10-Euro-Sparplan bis zum durchleuchteten Portfolio. <b>Ein geführter Weg für Einsteiger</b>, Rechner und X-Ray auf Abruf, jede Beispielrechnung klar markiert.', pages: 'V01–V10 · 10 Seiten' });

/* ================= V01 · Vorsorge Home ================= */
screen('v01-a', { world: 'vorsorge', dock: 0, h: 2420, body: `
${intro('vorsorge', 'Was wird aus deiner Rente?', 'Rechnen, verstehen, anfangen. Ohne Produktverkauf, mit amtlichen Regeln.')}
<div class="card lime" style="margin-top:16px;padding:18px">
  <div class="ltag" style="color:#000;opacity:.6">Neu hier?</div>
  <div style="font-size:30px;font-weight:900;letter-spacing:-.045em;line-height:1.02;margin-top:6px">Starte mit 10&nbsp;€ im Monat.</div>
  <p class="sm" style="margin-top:8px">In 5 Schritten zu deinem ersten ETF-Sparplan. Dauert 3 Minuten.</p>
  <div class="btn ink" style="margin-top:14px">10-Euro-Sparplan starten${ic('i-next')}</div>
</div>
${sect('Wo stehst du?')}
<div class="stack">${navcard('i-spark', 'Ich fange an', 'Sparplan in 5 Schritten')}${navcard('i-target', 'Ich plane meine Rente', 'Planer: wie viel muss ich sparen?')}${navcard('i-pie', 'Ich habe schon ETFs', 'Portfolio durchleuchten')}</div>
${sect('So könnte es aussehen')}
<div class="card" style="padding:16px">
  <div style="display:flex;justify-content:space-between;align-items:center">${bsp()}<span class="mu xs b">250 € im Monat · 35 → 67 J.</span></div>
  <div style="display:flex;align-items:baseline;gap:8px;margin-top:12px"><span class="num" style="font-size:40px;font-weight:900;letter-spacing:-.05em">127 Tsd. €</span></div>
  <div class="mu sm">mit 67, in heutiger Kaufkraft, bei 5 % pro Jahr</div>
  <div style="margin-top:10px">${wbar('Vorsichtig · 3 %', '86 Tsd. €', 45)}${wbar('Mittel · 5 %', '127 Tsd. €', 66, 1)}${wbar('Gut · 7 %', '191 Tsd. €', 100)}</div>
  <div style="margin-top:10px">${help('Heutige Kaufkraft: was das Geld nach 2 % Inflation pro Jahr heute wert wäre. Keine Prognose.')}</div>
</div>
${sect('Was der Staat ab 2027 dazulegt')}
<div class="grid3">${tile('Grundzulage', '540 €', 'höchstens / Jahr')}${tile('Je Kind', '300 €', 'höchstens / Jahr')}${tile('Unter 25', '200 €', 'einmalig')}</div>
<div style="margin-top:10px">${help('Gilt für das neue geförderte Altersvorsorgedepot. Schon ab 10 € im Monat gibt es 60 € Zulage im Jahr.')}</div>
<div style="margin-top:10px">${navcard('i-star', 'Förderung ausrechnen', 'Altersvorsorgedepot ab 1.1.2027')}</div>
${sect('Kern-ETFs', 'Alle 4.007')}
${CORE.map(etf).join('')}
<div style="margin-top:8px">${help('Ein ETF ist ein Korb mit vielen Aktien. „1 Jahr“ zeigt, wie sich der Kurs in 12 Monaten bewegt hat.')}</div>
${sect('Was hat sich geändert?', 'Alle')}
<div class="card" style="padding:4px 14px">${[['EEM', 'Südkorea 12,2 % → 18,1 %'], ['EEM', 'Kaimaninseln 17,5 % → 13,3 %'], ['URTH', 'Microsoft 4,2 % → 3,2 %']].map(([t, s]) => `<div class="kv"><span class="sm"><b>${t}</b> ${s}</span>${ic('i-next', 15)}</div>`).join('')}</div>
${sect('Mehr in Vorsorge')}
<div class="grid2">${[['i-grid', 'Vergleichen', 'ETFs und Kosten'], ['i-star', 'Förderung', 'Zulagen 2027'], ['i-bell', 'Veränderungen', 'Bin ich auf Kurs?'], ['i-book', 'Wissen', '15 Begriffe']].map(([i, t, s]) => `<div class="card" style="padding:12px"><span class="hud" style="width:34px;height:34px;border-radius:10px">${ic(i, 18)}</span><div class="bb" style="margin-top:8px">${t}</div><div class="mu xs">${s}</div></div>`).join('')}</div>
${foot}` });

screen('v01-b', { world: 'vorsorge', dock: 0, body: `${intro('vorsorge', 'Was wird aus deiner Rente?', '')}<div class="card lime" style="margin-top:14px;height:180px"></div>`,
  overlay: `<div class="ovl"></div><div class="sheet"><div class="grab"></div>
<div class="ltag">Erster Besuch</div><div class="mt" style="margin-top:4px">Womit fängst du an?</div>
<p class="mu sm" style="margin-top:6px">Wir zeigen dir nur, was zu dir passt. Ändern kannst du es jederzeit.</p>
<div class="stack" style="margin-top:14px">${[['i-spark', 'Ich habe noch nie gespart', '10-Euro-Sparplan, Schritt für Schritt', 1], ['i-target', 'Ich will wissen, ob es reicht', 'Planer mit drei Beispielen'], ['i-pie', 'Ich habe schon ETFs', 'Portfolio-X-Ray und Veränderungen'], ['i-bars', 'Ich kenne mich aus', 'Alle ETFs, Kosten, Bestände <span class="pro">PRO</span>']].map(([i, t, s, on]) => `<div class="card${on ? ' ink' : ''}" style="display:flex;gap:12px;align-items:center;padding:13px"><span class="hud" style="width:38px;height:38px;border-radius:11px">${ic(i, 20)}</span><div style="flex:1"><div class="bb">${t}</div><div class="xs" style="opacity:.7">${s}</div></div>${ic('i-next', 16)}</div>`).join('')}</div>
</div>` });

slide({ id: 'V01', title: 'Vorsorge · Start', route: '/vorsorge/#/', now: 'V01',
  sub: 'Heute: Rechner-Zahlen, ETF-Liste und Linklisten untereinander. Neu: ein klarer Einstieg „Starte mit 10 €“, drei Wege nach Lage, eine markierte Beispielrechnung, Förderung in drei Zahlen und Kern-ETFs mit dem einen Chart.',
  neu: [['v01-a', 'Start, ganze Seite'], ['v01-b', 'Erster Besuch: Womit fängst du an?']],
  spec: { aufbau: ['Kopf: „Was wird aus deiner Rente?“ + ein Satz', 'Neongrüne Karte „Starte mit 10 € im Monat“ → geführter Ablauf V10', 'Drei Wege: Ich fange an (V10) · Ich plane (V02) · Ich habe schon ETFs (V05)', 'Beispielrechnung (Marke BEISPIELRECHNUNG): 127 Tsd. € in heutiger Kaufkraft, drei Szenarien als Balken, Erklärung Kaufkraft', 'Förderung 2027: Grundzulage bis 540 €, Kind bis 300 €, Einsteigerbonus 200 €', 'Kern-ETFs als ETF-Zeilen mit Mini-Chart und 1-Jahres-Bewegung', 'Was hat sich geändert (3 Zeilen) → V08', 'Mehr: Vergleichen, Förderung, Veränderungen, Wissen', 'Erster Besuch: Sheet mit 4 Lagen, steuert die Startseite (Einsteiger sieht V10 zuerst, Profi die ETF-Liste)'], komponenten: ['C01 Kopfzeile', 'C02 Produkt-Leiste (Vorsorge · Planer · ETFs · Portfolio · Menü)', 'C06 Chart (mini)', 'C07 Kursbewegung', 'C09 Erklärung', 'C11 Kachel', 'C12 Navigationskarte', 'C16 Sheet', 'C19 PRO-Marke', 'Vorsorge-Muster: Beispiel-Marke', 'Vorsorge-Muster: ETF-Zeile', 'Vorsorge-Muster: Szenario-Balken'], daten: ['vorsorge/data/etf-index-home.json (symbols URTH SPY EEM QQQ FEZ IWM; p1Y, ter, vol)', 'vorsorge/data/series/<SYM>.json (price.daily, Mini-Chart 1 Jahr)', 'vorsorge/data/funding-rules/2027-DE.json (maximumFunding: 540 / 300 / 200, minimumAnnualOwnContribution 120)', 'vorsorge/data/changes.json bzw. holdings/<Serie>.json timeline', 'Beispielrechnung: Planer-Formel (V02) mit Standardannahmen'], weg: ['Hero-Bild mit Pflanze', 'Doppelte Knöpfe „Altersvorsorge berechnen“ / „Eigenen Plan erstellen“ → ein Hauptweg + drei Wege', '„Was am meisten bewirkt“ wandert in den Planer (V02)', 'Lange Linklisten (Berechnen, Fördern, ETFs) → Produkt-Leiste und 4 Kacheln', 'Rote und grüne Kostenbalken'] } });

/* ================= V02 · Planer ================= */
const P3 = plan(0.03), P5 = plan(0.05), P7 = plan(0.07);
const input = (l, v, u, w) => `<div style="padding:10px 0;border-top:1px solid var(--a-line)"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="sm b">${l}</span><span class="bb num" style="font-size:17px">${v}<span class="mu sm"> ${u}</span></span></div><div class="bar" style="height:6px;margin-top:8px;overflow:visible;position:relative"><i class="l" style="width:${w}%"></i><span style="position:absolute;left:calc(${w}% - 9px);top:-6px;width:18px;height:18px;border-radius:50%;background:var(--a-ink);border:3px solid var(--lime)"></span></div></div>`;
screen('v02-a', { world: 'vorsorge', dock: 1, h: 1920, body: `
${intro('vorsorge', 'Wie viel muss ich sparen?', 'Fünf Angaben, drei Beispiele. In heutiger Kaufkraft gerechnet.')}
<div class="card" style="margin-top:16px;padding:6px 14px 10px">${input('Dein Alter', '35', 'Jahre', 22)}${input('Rente ab', '67', 'Jahre', 70)}${input('Sparrate', '250', '€ / Monat', 25)}${input('Schon gespart', '5.000', '€', 10)}${input('Wunsch im Alter', '2.800', '€ / Monat', 56)}</div>
<div class="mu xs" style="margin-top:6px">Gesetzliche Rente und andere Einkünfte: 1.700 € / Monat (änderbar)</div>
<div class="card ink" style="margin-top:14px;padding:16px">
  <div style="display:flex;justify-content:space-between;align-items:center">${bsp()}${vd('w', 'Nicht auf Kurs')}</div>
  <div class="num" style="font-size:40px;font-weight:900;letter-spacing:-.05em;margin-top:10px;color:var(--lime)">52 %</div>
  <div class="sm">deines Ziels erreichst du bei 5 % pro Jahr.</div>
  <div class="sm" style="opacity:.7;margin-top:4px">Lücke: 524 € im Monat · Vermögen mit 67: 127 Tsd. €</div>
</div>
${sect('Dein Vermögen bis 67')}
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${bsp('Beispiel')}<span class="chip" style="height:24px;font-size:11px;padding:0 9px">Linie: 5 %</span><span class="chip" style="height:24px;font-size:11px;padding:0 9px">gestrichelt: 3 % und 7 %</span></div>
${chart(P5, { h: 160, lines: [P3, P7], zones: fitz(P3, P7), base: false, axis: ['35 J.', '67 J.'] })}
<div class="grid3" style="margin-top:12px">${tile('3 % · vorsichtig', '86 Tsd.', '€ · Ziel 28 %')}${tile('5 % · mittel', '127 Tsd.', '€ · Ziel 52 %')}${tile('7 % · gut', '191 Tsd.', '€ · Ziel 96 %')}</div>
<div style="margin-top:10px">${help('Ziel 52 %: Dein Vermögen deckt gut die Hälfte der Lücke zwischen Rente und Wunsch für 25 Jahre.')}</div>
${sect('Was am meisten bewirkt')}
<div class="card" style="padding:4px 14px">${[['Sparrate +50 €', '+10'], ['Kosten −0,5 %-Punkte', '+5'], ['Einmal +5.000 €', '+5'], ['2 Jahre länger sparen', '+4']].map(([t, v], k) => `<div class="kv"><span class="sm b">${k + 1}. ${t}</span><span class="chg up">+ ${v.slice(1)} %-Pkt.</span></div>`).join('')}</div>
<div class="mu xs" style="margin-top:6px">Veränderung der Zielerreichung im Beispiel mit 5 %.</div>
${sect('Kosten über 32 Jahre')}
<div class="card" style="padding:14px"><div class="num bb" style="font-size:28px;letter-spacing:-.04em">57 Tsd. €</div><div class="mu sm">Unterschied zwischen 0,2 % und 1,5 % laufenden Kosten</div>${wbar('0,2 % Kosten', '244 Tsd. €', 100, 1)}${wbar('1,5 % Kosten', '187 Tsd. €', 77)}</div>
<div class="grid2" style="margin-top:14px"><div class="btn">Plan speichern</div><div class="btn line">Annahmen</div></div>
${foot}` });

screen('v02-b', { world: 'vorsorge', dock: 1, body: `${intro('vorsorge', 'Wie viel muss ich sparen?', '')}`,
  overlay: `<div class="ovl"></div><div class="sheet" style="max-height:760px"><div class="grab"></div>
<div style="display:flex;justify-content:space-between;align-items:center"><div class="mt">Annahmen</div>${bsp('Beispiel')}</div>
<p class="mu sm" style="margin-top:6px">So rechnen wir. Alles änderbar, nichts davon ist versprochen.</p>
${kv([['Rendite vorsichtig / mittel / gut', '3 / 5 / 7 %'], ['Laufende Kosten (ETF + Depot)', '0,30 %'], ['Inflation pro Jahr', '2,0 %'], ['Einmalanlage', '0 €'], ['Auszahldauer', '25 Jahre'], ['Gerechnet', 'nominal und in Kaufkraft']])}
<div style="margin-top:10px">${help('Rendite: wie stark das Geld im Jahr im Schnitt wächst. Auch Jahre mit Verlust sind möglich.')}</div>
<div class="btn" style="margin-top:14px">Übernehmen</div></div>` });

screen('v02-c', { world: 'vorsorge', dock: 1, dk: 1, body: `
<div class="ltag">Planer · Profi</div><div class="mt" style="margin-top:4px">Alle Kennzahlen je Szenario</div>
<div class="card" style="margin-top:12px;padding:6px 12px"><div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:6px;padding:8px 0" class="xs mu b"><span></span><span>3 %</span><span>5 %</span><span>7 %</span></div>${[['Vermögen nominal', '163', '239', '362'], ['in Kaufkraft', '86', '127', '191'], ['Zielerreichung', '28 %', '52 %', '96 %'], ['Nötige Sparrate', '927 €', '500 €', '–']].map(([k, a, b, c]) => `<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:6px;padding:9px 0;border-top:1px solid var(--a-line)" class="sm"><b>${k}</b><span class="num">${a}</span><span class="num bb" style="color:var(--lime)">${b}</span><span class="num">${c}</span></div>`).join('')}</div>
<div class="mu xs" style="margin-top:6px">Vermögen in Tsd. € mit 67 · nötige Sparrate für 100 % Ziel · Beispielrechnung</div>
${sect('Wie sicher ist das Ziel?')}
<div class="card" style="display:flex;gap:10px;align-items:center">${vd('o', 'Keine Aussage')}<span class="sm">Wir rechnen feste Szenarien, keine Wahrscheinlichkeiten.</span></div>
${sect('Formel')}
<div class="card sm" style="font-family:ui-monospace,monospace;font-size:12px;line-height:1.5">V(t+1) = V(t)·(1+r−k) + 12·Rate<br>Kaufkraft = V / (1+i)^t</div>` });

slide({ id: 'V02', title: 'Vorsorge · Planer', route: '/vorsorge/#/plan', now: 'V02',
  sub: 'Heute: Eingabefelder ganz unten in einem schwarzen Kasten, Ergebnis mit Fachbegriffen, Chart in drei Farben. Neu: Regler oben, ein klares Ergebnis („52 % deines Ziels“) mit Urteil, der eine Chart mit Szenarien als gestrichelte Linien.',
  neu: [['v02-a', 'Planer: Regler, Ergebnis, Chart'], ['v02-b', 'Sheet: Annahmen offen gelegt'], ['v02-c', 'Profi: alle Kennzahlen, Formel']],
  spec: { aufbau: ['Titel + ein Satz', '5 Regler: Alter, Rente ab, Sparrate, schon gespart, Wunsch im Alter; Zeile „Rente und andere Einkünfte“', 'Ergebnis (schwarz): Marke BEISPIELRECHNUNG, Urteil (Auf Kurs / Knapp / Nicht auf Kurs), Zielerreichung groß, Lücke, Vermögen', 'Chart: Vermögenspfad 5 % als Linie, 3 % und 7 % gestrichelt (C06 lines), Achse Alter', 'Drei Kacheln je Szenario', 'Was am meisten bewirkt (Stellschrauben, Zielerreichung in %-Punkten)', 'Kosten über die Laufzeit (0,2 % vs. 1,5 %)', 'Plan speichern, Annahmen (Sheet)', 'Profi: Tabelle nominal / Kaufkraft / Ziel / nötige Sparrate, Formel, ehrliche „Keine Aussage“ zu Wahrscheinlichkeiten'], komponenten: ['C06 Chart (mit lines)', 'C08 Urteil', 'C09 Erklärung', 'C11 Kachel', 'C16 Sheet', 'Vorsorge-Muster: Regler', 'Vorsorge-Muster: Beispiel-Marke', 'Vorsorge-Muster: Stellschrauben'], daten: ['Planer-Engine der heutigen Seite (vorsorge/, Szenarien 3/5/7 %, Kosten 0,30 %, Inflation 2 %, Auszahldauer 25 J.)', 'Werte im Mockup = heutige Standardannahmen: 86 / 127 / 191 Tsd. €, 52 %, Lücke 524 €', 'Gespeicherter Plan: Konto (heute nur Browser)'], weg: ['Schwarzer Eingabekasten am Seitenende → Regler oben', 'Drei Farben im Chart (blau, orange, grün) → eine Linie + gestrichelte Szenarien', 'Reiter „Geführter Rechner / Planer / Vorsorgelücke / Kosten / Szenarien“ → eine Seite, Lücke und Kosten als Abschnitte', 'Rote Ampel „Nicht auf Kurs“ → Urteil (C08)', '„Wird nur in diesem Browser gespeichert“ → im Konto'] } });

/* ================= V03 · ETFs ================= */
screen('v03-a', { world: 'vorsorge', dock: 2, h: 1880, body: `
${intro('vorsorge', 'Die ETF-Welt', '')}
<div style="margin-top:12px">${search('ETF, Index oder Thema')}</div>
<div style="display:flex;align-items:baseline;gap:8px;margin-top:14px"><span class="num" style="font-size:34px;font-weight:900;letter-spacing:-.05em">4.007</span><span class="bb">ETFs</span><span class="mu xs" style="margin-left:auto">2.065 komplexe ausgeblendet</span></div>
<div class="seg" style="margin-top:10px"><span class="on">Einfach</span><span>Alle</span><span>Themen</span></div>
<div class="card" style="margin-top:12px;display:flex;gap:10px;align-items:center;padding:12px">${vd('s', 'Für den Anfang')}<span class="sm">breit gestreut, günstig, lange Historie</span></div>
${sect('Breit und günstig')}
${CORE.slice(0, 2).map(etf).join('')}
${sect('Bausteine dazu')}
${CORE.slice(2).map(etf).join('')}
<div style="margin-top:10px">${help('Schwankung: wie stark der Kurs im Jahr typisch hoch und runter geht. Mehr Schwankung heißt mehr Auf und Ab.')}</div>
${sect('ETF-Welten')}
${[['Breite Welt-ETFs', 241], ['USA', 410], ['Europa', 29], ['Schwellenländer', 113], ['Anleihen', 968], ['Geldmarkt', 21], ['Nebenwerte', 85], ['Dividende', 240], ['Faktor (Qualität, Value …)', 432], ['Themen', 208]].map(([l, n], k) => wbar(l, de(n, 0), n / 968 * 100, k === 0)).join('')}
<div class="card" style="margin-top:14px;padding:12px">${help('Alle Kurse sind US-Listings. In der EU kaufst du meist die UCITS-Version auf denselben Index. Wir zeigen dir, wonach du bei deiner Bank suchst.')}</div>
${foot}` });

screen('v03-b', { world: 'vorsorge', dock: 2, body: `${intro('vorsorge', 'Die ETF-Welt', '')}`,
  overlay: `<div class="ovl"></div><div class="sheet"><div class="grab"></div>
<div class="mt">Filter</div>
<div class="ltag" style="margin-top:14px">Region</div><div class="chips" style="margin-top:8px;flex-wrap:wrap">${['Welt', 'USA', 'Europa', 'Schwellenländer'].map((t, k) => `<span class="chip${k === 0 ? ' on' : ''}">${t}</span>`).join('')}</div>
<div class="ltag" style="margin-top:14px">Kosten höchstens</div><div class="seg" style="margin-top:8px"><span>0,1 %</span><span class="on">0,3 %</span><span>0,5 %</span><span>egal</span></div>
${kv([['Mindestens 10 Jahre Historie', toggle(1)], ['Nur mit Beständen (X-Ray)', toggle(0)], ['Hebel- und Short-ETFs zeigen', toggle(0)]])}
<div style="margin-top:8px">${help('Hebel-ETFs verstärken Gewinne und Verluste. Für die Vorsorge sind sie nicht gedacht, deshalb sind sie aus.')}</div>
<div class="btn" style="margin-top:14px">Treffer zeigen</div></div>` });

screen('v03-c', { world: 'vorsorge', dock: 2, h: 900, body: `
<div class="ltag">ETFs · Themen</div><div class="mt" style="margin-top:4px">Stärkste 12 Monate</div>
<div class="seg" style="margin-top:12px"><span>Einfach</span><span>Alle</span><span class="on">Themen</span></div>
<div class="card ink" style="margin-top:12px;display:flex;gap:10px;align-items:center;padding:12px">${vd('w', 'Hohes Auf und Ab')}<span class="sm">Themen-ETFs schwanken stark. Als Beimischung, nicht als Basis.</span></div>
${[['EWY', 'MSCI South Korea', '0,59 % · 31 %', 129.7], ['FTXL', 'Nasdaq Semiconductor', '0,60 % · 34 %', 126.0], ['CHPS', 'Semiconductor Select', '0,15 % · 34 %', 124.6], ['PSI', 'Semiconductors', '0,56 % · 37 %', 120.8], ['AIS', 'Artificial Intelligence', '0,75 % · 50 %', 112.6], ['SOXX', 'Semiconductor', '0,34 % · 35 %', 109.1], ['SMH', 'VanEck Semiconductor', '0,35 % · 34 %', 86.4]].map(([t, n, s, r]) => `<div class="lr" style="grid-template-columns:42px 1fr auto">${lg(t)}<div class="n"><b>${n}</b><span>Kosten · Schw. ${s}</span></div><div class="p"><span class="xs mu b">1 Jahr</span>${chg(r)}</div></div>`).join('')}
<div style="margin-top:10px">${help('Hohe Gewinne in einem Jahr sagen nichts über die nächsten Jahre.')}</div>` });

slide({ id: 'V03', title: 'Vorsorge · ETFs', route: '/vorsorge/#/etfs', now: 'V03',
  sub: 'Heute sortiert die Liste nach Rendite 1 Jahr: oben stehen Korea- und Chip-ETFs mit +130 %. Für Einsteiger ist das der falsche erste Eindruck. Neu: „Einfach“ zeigt zuerst breite, günstige ETFs; Themen liegen in einem eigenen Reiter mit klarer Warnung.',
  neu: [['v03-a', 'Einfach: breit und günstig zuerst'], ['v03-b', 'Sheet: Filter in Alltagssprache'], ['v03-c', 'Themen: stärkste 12 Monate mit Warnung']],
  spec: { aufbau: ['Titel, Suche (Ticker, ISIN, Index, Thema)', 'Zahl 4.007 + „2.065 komplexe ausgeblendet“', 'Reiter Einfach / Alle / Themen', 'Einfach: Urteil „Für den Anfang: breit, günstig, lange Historie“, Abschnitte „Breit und günstig“ und „Bausteine dazu“ als ETF-Zeilen', 'ETF-Welten als Balken mit Anzahl (tippen = filtern)', 'Hinweis UCITS: US-Listings als Marktabbild, in der EU UCITS-Version suchen', 'Filter-Sheet: Region, Kosten höchstens, 10 J. Historie, nur mit Beständen, Hebel/Short aus', 'Themen: Warnung (Urteil Schwach „Hohes Auf und Ab“), Liste nach 1 Jahr mit Kosten und Schwankung'], komponenten: ['C06 Chart (mini)', 'C07 Kursbewegung', 'C08 Urteil', 'C09 Erklärung', 'C14 Reiter', 'C15 Schalter', 'C16 Sheet', 'C20 Suche', 'Vorsorge-Muster: ETF-Zeile'], daten: ['vorsorge/data/etf-index.json + etf-index-extra.json (counts.publicAnalysis 4.007, complex 2.065)', 'vorsorge/data/etf-index-home.json (Kern-ETFs)', 'Themen-Werte aus der heutigen Liste (p1Y, ter, vol)', 'vorsorge/data/eu/etf-eu-index.json für den UCITS-Hinweis'], weg: ['Standard-Sortierung „Rendite 1 Jahr“ für alle → nur im Reiter Themen', 'Länderreiter „USA · Kurse, Holdings, Kosten / Europa · UCITS“ → Hinweis + Filter', 'Grüne Prozentzahlen → Kursbewegung (C07)', '„Weitere 25 von 3.982 anzeigen“ bleibt als Endlos-Liste'] } });

/* ================= V04 · ETF-Detail URTH ================= */
const ETFHEAD = `<div class="stk"><div class="stk1"><span class="hb">${ic('i-back', 18)}</span>${lg('URTH')}<div class="stkn"><b>iShares MSCI World</b><span>URTH · ETF · Aktien Welt</span></div><span class="hb">${ic('i-heart', 18)}</span></div><div class="stk2"><span class="num stkp">${de(207.53)} $</span>${chg(0.82, 1)}<span class="mu xs b" style="margin-left:auto;text-align:right">Schluss 02.10.2026<br>NYSE · USD</span></div></div>`;
const TOP = [['NVDA', 'NVIDIA', 5.04], ['AAPL', 'Apple', 4.58], ['MSFT', 'Microsoft', 3.24], ['AMZN', 'Amazon', 2.36], ['GOOGL', 'Alphabet A', 2.12], ['GOOG', 'Alphabet C', 1.78], ['AVGO', 'Broadcom', 1.68], ['META', 'Meta Platforms', 1.64], ['TSLA', 'Tesla', 1.33], ['LLY', 'Eli Lilly', 0.99]];
screen('v04-a', { world: 'vorsorge', dock: 2, h: 2340, body: `${ETFHEAD}
<div class="seg" style="margin-top:12px"><span class="on">Überblick</span><span>Bestände</span><span>Risiko</span><span>Kosten</span></div>
<div class="card lime" style="margin-top:12px;padding:14px"><div class="ltag" style="color:#000;opacity:.6">In einem Satz</div><div class="bb" style="font-size:17px;line-height:1.3;margin-top:4px">Ein Korb mit 1.320 Firmen aus 23 Industrieländern. Rund 68 % davon aus den USA.</div></div>
<div style="margin-top:14px">${chart(URTH, { h: 150, axis: ['02.10.25', '02.10.26'] })}</div>${tf('1J')}
<div class="grid2" style="margin-top:12px">${tile('Pro Jahr seit 2012', '+12,2 %', 'mit Ausschüttungen')}${tile('Schwankung', '16 %', 'pro Jahr')}${tile('Kosten', '0,24 %', 'pro Jahr laut Prospekt')}${tile('Firmen', '1.320', 'SEC N-PORT 28.02.2026')}</div>
<div style="margin-top:10px" class="stack">${help('Kosten 0,24 %: Bei 1.000 € im ETF zahlst du rund 2,40 € im Jahr. Sie werden automatisch abgezogen.')}${help('Vergangene Entwicklung ist kein Versprechen für die Zukunft.')}</div>
${sect('Einordnung')}
<div class="card" style="padding:4px 14px">${[['s', 'Passt', 'Klassischer Index-ETF, breit gestreut'], ['s', 'Passt', 'Lange Historie: 14,7 Jahre'], ['s', 'Passt', '23 Länder, 1.320 Firmen'], ['m', 'Hinweis', 'Größter Rückgang −32,7 %, erholt nach 5 Monaten'], ['m', 'Hinweis', 'Gehandelt in US-Dollar'], ['m', 'Hinweis', 'US-Listing: in der EU meist nicht kaufbar']].map(([k, v, t]) => `<div class="kv" style="align-items:center"><span class="sm b" style="flex:1;padding-right:8px">${t}</span>${vd(k, v)}</div>`).join('')}</div>
${sect('Größte Firmen im Korb', 'Alle 1.320')}
${TOP.slice(0, 6).map(([t, n, w]) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--a-line)">${lg(t)}<div style="flex:1"><div class="bb sm">${n}</div><div class="bar" style="height:6px;margin-top:5px"><i style="width:${w / 5.04 * 100}%"></i></div></div><span class="bb num sm">${de(w, 2)} %</span></div>`).join('')}
<div class="mu xs" style="margin-top:6px">Die 10 größten zusammen: 24,8 % · Stand 28.02.2026</div>
${sect('Länder')}
${[['USA', 68.0], ['Japan', 6.1], ['Großbritannien', 3.8], ['Kanada', 3.6], ['Schweiz', 2.8], ['Weitere', 15.7]].map(([l, v], k) => wbar(l, de(v, 1) + ' %', v / 68 * 100, k === 0)).join('')}
<div class="card ink" style="margin-top:16px;padding:16px"><div class="ltag" style="color:#8a8a8a">Bei deiner Bank</div><div class="bb" style="font-size:17px;margin-top:4px">Such nach einem UCITS-ETF auf den „MSCI World“.</div><div class="sm" style="opacity:.7;margin-top:6px">Das ist dieselbe Idee als europäisches Produkt. Beispiele aus dem ESMA-Register, keine Empfehlung:</div><div class="sm" style="margin-top:8px;font-family:ui-monospace,monospace">IE00B4L5Y983 · IE00B0M62Q58<br>LU0274208692 · IE00BFY0GT14</div></div>
<div class="grid2" style="margin-top:14px"><div class="btn">${ic('i-target')}Planspiel</div><div class="btn line">Vergleichen</div></div>
${foot}` });

screen('v04-b', { world: 'vorsorge', dock: 2, dk: 1, h: 1240, body: `${ETFHEAD}
<div class="seg" style="margin-top:12px"><span>Überblick</span><span class="on">Bestände</span><span>Risiko</span><span>Kosten</span></div>
<div class="grid2" style="margin-top:12px">${tile('Top 10 Anteil', '24,8 %', 'vorher 27,7 %')}${tile('Effektiv', '107,5', 'gleich große Firmen')}</div>
<div style="margin-top:8px">${help('„Effektiv 107,5“: So breit gestreut wie 107 gleich große Firmen.')}</div>
${sect('Top 10 · SEC N-PORT 28.02.2026')}
${TOP.map(([t, n, w]) => `<div class="kv"><span class="sm b">${n} <span class="mu">${t}</span></span><span class="bb num">${de(w, 2)} %</span></div>`).join('')}
${sect('Seit dem letzten Bericht')}
<div class="card" style="padding:4px 14px">${['Technologie 31,2 % → 28,4 %', 'USA 70,6 % → 68,0 %', 'Microsoft 4,2 % → 3,2 %'].map(t => `<div class="kv"><span class="sm">${t}</span>${vd('m', 'gesunken')}</div>`).join('')}</div>` });

screen('v04-c', { world: 'vorsorge', dock: 2, body: `${ETFHEAD}<div style="margin-top:14px">${chart(URTH, { h: 150 })}</div>`,
  overlay: `<div class="ovl"></div><div class="sheet"><div class="grab"></div>
<div style="display:flex;justify-content:space-between;align-items:center"><div class="mt">Planspiel</div>${bsp()}</div>
<p class="mu sm" style="margin-top:4px">Was wäre, wenn sich der MSCI World so entwickelt wie bisher?</p>
${input('Sparrate', '100', '€ / Monat', 20)}${input('Laufzeit', '20', 'Jahre', 50)}
${kv([['Selbst eingezahlt', '24.000 €'], ['Staatliche Zulagen (ab 2027)', '7.800 €'], ['Wie bisher · 12,2 % pro Jahr', '121.807 €'], ['Schwächer · 7,6 % pro Jahr', '71.683 €']])}
<div style="margin-top:8px">${help('Rechnet mit der Vergangenheit seit 2012. Die Zukunft kann deutlich schlechter ausfallen.')}</div>
<div class="btn" style="margin-top:12px">In meinen Plan übernehmen</div></div>` });

slide({ id: 'V04', title: 'Vorsorge · ETF-Detail', route: '/vorsorge/#/etf/URTH', now: 'V04',
  sub: 'Heute: zehn Bereiche mit Fachbegriffen, blaue Balken, drei Chart-Farben. Neu: ein Satz, was drin ist, der eine Chart, vier Zahlen mit Erklärung, Einordnung mit Urteilen und der konkrete Hinweis, wonach man bei der Bank sucht.',
  neu: [['v04-a', 'Überblick, ganze Seite'], ['v04-b', 'Bestände (Profi, dunkel)'], ['v04-c', 'Sheet: Planspiel, klar als Beispiel']],
  spec: { aufbau: ['ETF-Kopf (wie Aktienkopf C04): Zurück, Logo, Name, Kategorie, Merken; Kurs, Bewegung, Schluss-Datum, Börse', 'Reiter Überblick / Bestände / Risiko / Kosten', '„In einem Satz“ (neongrün) aus holdings.summary', 'Chart 1 Jahr + Zeitleiste', '4 Kacheln: pro Jahr seit Start, Schwankung, Kosten, Firmen + Erklärungen', 'Einordnung: 6 Zeilen mit Urteil Passt / Hinweis (ersetzt „3 passt · 0 Achtung · 4 Hinweise“)', 'Größte Firmen als Gewichtsbalken, Länder als Balken', '„Bei deiner Bank“: UCITS auf denselben Index + ISIN-Beispiele aus ESMA, ausdrücklich keine Empfehlung', 'Planspiel (Sheet): Sparrate, Laufzeit, Ergebnis mit Marke BEISPIELRECHNUNG, „In meinen Plan übernehmen“', 'Bestände (Profi): Konzentration, effektive Anzahl, Top 10, Änderungen seit letztem Bericht'], komponenten: ['C04 Aktienkopf (ETF-Variante)', 'C06 Chart', 'C07 Kursbewegung', 'C08 Urteil', 'C09 Erklärung', 'C11 Kachel', 'C14 Reiter', 'C16 Sheet', 'Vorsorge-Muster: Gewichtsbalken', 'Vorsorge-Muster: Bei deiner Bank'], daten: ['vorsorge/data/etf/URTH.json (costs.value 0,0024, holdings.positions 1.320, top10 0,2476)', 'vorsorge/data/series/URTH.json (price.daily → Chart)', 'vorsorge/data/holdings/S000035395.json (holdings, exposures.countries, concentration.effectiveNumber 107,5, timeline)', 'vorsorge/data/eu/etf-eu-index.json (ISIN, Anbieter, Ausschüttung der MSCI-World-UCITS)', 'Planspiel-Werte aus der heutigen Seite (Szenario wie bisher 12,2 % p. a.)'], weg: ['ETF-DNA mit 8 blauen Balken → Einordnung mit Urteilen; DNA-Werte als „Mehr“ unter Risiko', 'Drei Chartfarben im Planspiel → Zahlen im Sheet', 'Knöpfe „Beobachten / Planspiel / Vergleichen / Zum Portfolio“ → Herz im Kopf + 2 Knöpfe unten', 'Originalbeschreibung des Anbieters (englisch) → hinter „Mehr“'] } });

/* ================= V05 · Portfolio ================= */
const MODELS = [['ONE ETF', 'Ein einziger Welt-ETF. Maximal einfach.', 'URTH 100 %', '+11,1 %', '16 %', '0,24 %'], ['GLOBAL CORE', 'Welt plus etwas Schwellenländer.', 'URTH 88 · EEM 12', '+10,5 %', '16 %', '0,30 %'], ['CORE + EM', 'Bewusst mehr Schwellenländer.', 'URTH 70 · EEM 30', '+9,6 %', '17 %', '0,38 %'], ['CORE + BONDS', 'Ruhiger mit Staatsanleihen.', 'URTH 70 · VTG 30', '–', '12 %', '0,18 %']];
screen('v05-a', { world: 'vorsorge', dock: 3, h: 1940, body: `
${intro('vorsorge', 'Was steckt in deinem Portfolio?', '')}
<div class="card" style="margin-top:14px;padding:4px 14px">${[['URTH', 'Aktien Welt', '88 %'], ['EEM', 'Schwellenländer', '12 %']].map(([t, n, w]) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--a-line)">${lg(t)}<div style="flex:1"><div class="bb sm">${n}</div><div class="mu xs">${t}</div></div><span class="bb num">${w}</span></div>`).join('')}<div style="padding:10px 0;border-top:1px solid var(--a-line)" class="sm b mu">${ic('i-plus', 15)} ETF hinzufügen</div></div>
${sect('Seit 2012 · Start = 100')}
${chart(PF, { h: 150, axis: ['01/2012', '10/2026'] })}
<div class="grid3" style="margin-top:12px">${tile('Pro Jahr', '+9,4 %', 'ohne Ausschütt.')}${tile('Schwankung', '15,5 %', 'pro Jahr')}${tile('Größter Rückgang', '−32,2 %', 'Feb.–März 2020')}</div>
<div style="margin-top:10px">${help('Größter Rückgang: der tiefste Fall vom Höchststand. So viel hättest du zwischendurch aushalten müssen.')}</div>
<div class="card ink" style="margin-top:14px;padding:16px"><div class="ltag" style="color:#8a8a8a">Was du wirklich besitzt</div><div class="bb" style="font-size:18px;line-height:1.3;margin-top:4px">2 ETFs, aber über 2.500 Firmen. 31 % deines Geldes stecken in den 25 größten.</div></div>
${sect('Größte Firmen · effektiv')}
${[['NVDA', 'NVIDIA', 4.43], ['AAPL', 'Apple', 4.03], ['MSFT', 'Microsoft', 2.85], ['AMZN', 'Amazon', 2.07], ['GOOGL', 'Alphabet', 1.86], ['TSM', 'TSMC', 1.58]].map(([t, n, w]) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--a-line)">${lg(t)}<div style="flex:1"><div class="bb sm">${n}</div><div class="bar" style="height:6px;margin-top:5px"><i style="width:${w / 4.43 * 100}%"></i></div></div><span class="bb num sm">${de(w, 2)} %</span></div>`).join('')}
${sect('Länder · effektiv')}
${[['USA', 60], ['Japan', 5], ['Großbritannien', 3], ['Kanada', 3], ['Taiwan', 3]].map(([l, v], k) => wbar(l, v + ' %', v / 60 * 100, k === 0)).join('')}
${sect('Auf einen Blick')}
<div class="card" style="padding:4px 14px">${[['Kosten pro Jahr', '0,30 %', 's', 'günstig'], ['Gleichlauf URTH ↔ EEM', '0,73', 'm', 'mittel'], ['Überschneidung', '0,0 %', 's', 'keine'], ['Nicht in Euro gehandelt', '100 %', 'w', 'Währung']].map(([k, v, c, t]) => `<div class="kv" style="align-items:center"><span class="sm b" style="flex:1">${k}</span><span class="bb num" style="margin-right:8px">${v}</span>${vd(c, t)}</div>`).join('')}</div>
<div style="margin-top:10px">${help('Gleichlauf 0,73: Die beiden ETFs bewegen sich meist in dieselbe Richtung, aber nicht immer.')}</div>
<div class="btn" style="margin-top:14px">${ic('i-grid')}Beispiel-Mischungen ansehen</div>
${foot}` });

screen('v05-b', { world: 'vorsorge', dock: 3, h: 1000, body: `
<div class="ltag">Portfolio</div><div class="mt" style="margin-top:4px">Beispiel-Mischungen</div>
<p class="mu sm" style="margin-top:6px">Zum Verstehen, wie Bausteine wirken. Keine Empfehlung, Gewichte frei änderbar.</p>
<div class="stack" style="margin-top:12px">${MODELS.map(([n, s, p, r, v, k], i) => `<div class="card${i === 1 ? ' ink' : ''}" style="padding:14px"><div style="display:flex;justify-content:space-between;align-items:center"><span class="ltag" style="${i === 1 ? 'color:var(--lime)' : ''}">${n}</span>${i === 1 ? pill('dein Portfolio', 'lm') : ''}</div><div class="bb" style="margin-top:4px">${s}</div><div class="xs" style="opacity:.65;margin-top:2px">${p}</div><div class="grid3" style="margin-top:10px">${[['10 J. pro Jahr', r], ['Schwankung', v], ['Kosten', k]].map(([a, b]) => `<div><div class="xs" style="opacity:.6">${a}</div><div class="bb num">${b}</div></div>`).join('')}</div></div>`).join('')}</div>
<div style="margin-top:10px">${help('CORE + BONDS: Für den Anleihen-ETF gibt es erst 5 Jahre Daten, deshalb kein 10-Jahres-Wert.')}</div>` });

slide({ id: 'V05', title: 'Vorsorge · Portfolio', route: '/vorsorge/#/portfolio', now: 'V05',
  sub: 'Heute: sehr lange Seite mit blauem Chart, bunten Länder- und Sektorbalken und roten Zahlen. Neu: oben deine ETFs, der eine Chart, drei Zahlen, ein Satz „Was du wirklich besitzt“, danach Firmen und Länder; Beispiel-Mischungen auf eigener Seite.',
  neu: [['v05-a', 'X-Ray, ganze Seite'], ['v05-b', 'Beispiel-Mischungen (Strategiemodelle)']],
  spec: { aufbau: ['Titel, Liste deiner ETFs mit Gewicht, „ETF hinzufügen“', 'Chart seit 2012 (Start = 100) + 3 Kacheln: pro Jahr, Schwankung, größter Rückgang', '„Was du wirklich besitzt“ (schwarz, ein Satz)', 'Größte Firmen effektiv (Gewichtsbalken), Länder effektiv', 'Auf einen Blick: Kosten, Gleichlauf, Überschneidung, Währung mit Urteil', 'Beispiel-Mischungen: Karte je Modell, eigenes Portfolio markiert, Kennzahlen 10 J. / Schwankung / Kosten, Hinweis bei fehlender Historie', 'Profi (unter „Mehr“): Sektoren, Handelswährung, Bestandsänderungen je ETF, Szenario-Lab'], komponenten: ['C06 Chart', 'C08 Urteil', 'C09 Erklärung', 'C11 Kachel', 'Vorsorge-Muster: Gewichtsbalken', 'Vorsorge-Muster: Mischungs-Karte'], daten: ['vorsorge/data/series/URTH.json + EEM.json (price.weekly, wöchentlich neu gewichtet 88/12 → +9,4 % p. a.)', 'vorsorge/data/holdings/<Serie>.json (effektive Firmen und Länder)', 'vorsorge/data/model-portfolios.json (one-etf, global-core, core-em, core-small, core-bonds, quality-tilt, factor)', 'Werte Gleichlauf, Überschneidung, effektive Gewichte aus der heutigen Seite'], weg: ['Blauer Flächenchart → der eine Chart', 'Bunte Länder- und Sektorbalken, Kreisdiagramme der Modelle → Gewichtsbalken', 'Rote Änderungswerte („−0,84 PP“) → Urteil gesunken / gestiegen', '„Wirtschaftszweige: 42 % nicht zugeordnet“ → unter Profi mit Hinweis zur Abdeckung', 'Knöpfe „Übernehmen / Planspiel“ je Modell → Karte antippen'] } });

/* ================= V06 · Vergleichen ================= */
screen('v06-a', { world: 'vorsorge', dock: 2, h: 1390, body: `
${intro('vorsorge', 'Vergleichen', 'Zwei ETFs nebeneinander. Ohne Gewinner-Logik.')}
<div class="grid2" style="margin-top:14px">${[['URTH', 'MSCI World', 1], ['SPY', 'S&P 500', 0]].map(([t, n, on]) => `<div class="card${on ? ' ink' : ''}" style="display:flex;gap:10px;align-items:center;padding:12px">${lg(t)}<div><div class="bb sm">${t}</div><div class="xs" style="opacity:.65">${n}</div></div></div>`).join('')}</div>
${sect('12 Monate · Start = 100')}
${chart(idx(URTH), { h: 150, lines: [idx(SPY)], zones: fitz(idx(URTH), idx(SPY)), base: true, axis: ['02.10.25', '02.10.26'] })}
<div class="mu xs" style="margin-top:4px">Linie: URTH · gestrichelt: SPY</div>
<div class="card" style="margin-top:14px;padding:6px 14px">
<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:6px;padding:8px 0" class="xs mu b"><span></span><span>URTH</span><span>SPY</span></div>
${[['1 Jahr', chg(13.63), chg(15.01)], ['Schwankung', '16 %', '16 %'], ['Größter Rückgang', '−32,7 %', '−55,9 %'], ['Kosten', '0,24 %', vd('o', 'k. A.')], ['Firmen', '1.320', '≈ 500'], ['Länder', '23', '1'], ['Historie seit', '2012', '1993']].map(([k, a, b]) => `<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:6px;padding:9px 0;border-top:1px solid var(--a-line);align-items:center" class="sm"><b>${k}</b><span class="num b">${a}</span><span class="num b">${b}</span></div>`).join('')}</div>
<div style="margin-top:10px" class="stack">${help('Größter Rückgang bei SPY stammt aus 2008. URTH gibt es erst seit 2012, darum ist der Wert nicht direkt vergleichbar.')}${help('k. A.: Für SPY liegt keine Kostenquote aus einer amtlichen Quelle vor. Wir zeigen dann keine Zahl.')}</div>
${sect('Weitere Vergleiche')}
<div class="stack">${navcard('i-bars', 'Kosten über die Laufzeit', '0,2 % oder 1,5 %: 57 Tsd. € Unterschied')}${navcard('i-grid', 'Anbieter vergleichen', 'Depotgebühr, Auswahl, Effektivkosten')}${navcard('i-book', 'Riester-Vertrag prüfen', 'Behalten oder neu ausrichten')}</div>
${foot}` });

screen('v06-b', { world: 'vorsorge', dock: 2, body: `
<div class="ltag">Vergleichen</div><div class="mt" style="margin-top:4px">Was Kosten ausmachen</div>
<div style="margin-top:8px">${bsp()}</div>
<p class="mu sm" style="margin-top:8px">250 € im Monat, 32 Jahre, 5 % pro Jahr vor Kosten.</p>
<div class="card" style="padding:6px 14px 12px">${wbar('0,2 % laufende Kosten', '244 Tsd. €', 100, 1)}${wbar('1,5 % laufende Kosten', '187 Tsd. €', 77)}</div>
<div class="grid2" style="margin-top:6px">${tile('0,2 % Kosten', '244 Tsd. €', 'mit 67')}${tile('1,5 % Kosten', '187 Tsd. €', 'mit 67')}</div>
<div class="card lime" style="margin-top:12px;padding:14px"><div class="num" style="font-size:30px;font-weight:900;letter-spacing:-.04em">57 Tsd. €</div><div class="sm b">weniger, nur wegen höherer Kosten.</div></div>
<div style="margin-top:10px">${help('Laufende Kosten werden jedes Jahr vom Vermögen abgezogen. Über Jahrzehnte summiert sich das.')}</div>` });

slide({ id: 'V06', title: 'Vorsorge · Vergleichen', route: '/vorsorge/#/vergleichen', now: 'V06',
  sub: 'Heute nur eine Liste mit vier Links. Neu: Der Vergleich ist sofort da, zwei ETFs im einen Chart, eine ehrliche Tabelle; die Kostenwirkung als eigener Screen mit Beispielrechnung.',
  neu: [['v06-a', 'ETF-Vergleich URTH und SPY'], ['v06-b', 'Kosten über die Laufzeit']],
  spec: { aufbau: ['Titel + Satz „ohne Gewinner-Logik“', 'Zwei (bis vier) ETF-Wähler als Karten', 'Chart: beide auf Start = 100, erster als Linie, weitere gestrichelt', 'Tabelle: 1 Jahr, Schwankung, größter Rückgang, Kosten, Firmen, Länder, Historie; fehlende Werte als „Keine Aussage“', 'Erklärungen zu nicht vergleichbaren Zeiträumen und fehlenden Kosten', 'Weitere Vergleiche: Kosten, Anbieter, Riester', 'Kosten-Screen: Balken 0,2 % vs. 1,5 %, Kacheln, Unterschied neongrün, Marke BEISPIELRECHNUNG'], komponenten: ['C06 Chart (lines)', 'C07 Kursbewegung', 'C08 Urteil', 'C09 Erklärung', 'C11 Kachel', 'C12 Navigationskarte', 'Vorsorge-Muster: Vergleichstabelle'], daten: ['vorsorge/data/series/URTH.json, SPY.json (price.daily, gleicher Zeitraum)', 'vorsorge/data/etf-index-home.json (p1Y, vol, mdd, ter; SPY ter = null → k. A.)', 'vorsorge/data/etf/SPY.json costs.status SOURCE_NOT_CONNECTED', 'Kostenwerte 244 / 187 Tsd. € aus der heutigen Startseite'], weg: ['Nummerierte Linkliste als ganze Seite', 'Anbieter- und Riester-Analyse bleiben als Unterseiten'] } });

/* ================= V07 · Förderung ================= */
screen('v07-a', { world: 'vorsorge', dock: 1, h: 1800, body: `
${intro('vorsorge', 'Was legt der Staat dazu?', 'Ab 1. Januar 2027 gibt es das geförderte Altersvorsorgedepot.')}
<div class="card" style="margin-top:14px;padding:6px 14px 10px">${input('Du zahlst ein', '1.200', '€ / Jahr', 66)}${input('Kinder mit Kindergeld', '0', '', 0)}</div>
<div class="kv" style="border:0;margin-top:4px"><span class="sm b">Jünger als 25, erster Vertrag</span>${toggle(0)}</div>
<div class="card ink" style="margin-top:12px;padding:16px"><div class="ltag" style="color:#8a8a8a">Zulage pro Jahr</div><div class="num" style="font-size:44px;font-weight:900;letter-spacing:-.05em;color:var(--lime)">390 €</div><div class="sm">Das sind 33 % auf deinen Beitrag.</div></div>
${sect('So wird gerechnet')}
<div class="card" style="padding:4px 14px">${[['Auf die ersten 360 €', '50 %', '180 €'], ['Auf weitere bis 1.800 €', '25 %', '210 €'], ['Je Kind (auf bis 1.800 €)', '100 %', 'bis 300 €'], ['Unter 25, einmalig', '', '200 €']].map(([k, p, v]) => `<div class="kv"><span class="sm b">${k}${p ? ` <span class="mu">· ${p}</span>` : ''}</span><span class="bb num">${v}</span></div>`).join('')}</div>
${sect('Zulage je Beitrag')}
${bars([['  120 €', 60], ['  360 €', 180], ['  600 €', 240], ['  1.200 €', 390], ['  1.800 €', 540]], { w: 354, h: 110 })}
<div style="margin-top:8px">${help('Schon 10 € im Monat (120 € im Jahr) reichen für die Zulage: Der Staat legt 60 € dazu. Darunter gibt es nichts.')}</div>
${sect('Nach 32 Jahren')}
<div style="margin-bottom:6px">${bsp('Modellrechnung')}</div>
${wbar('Mit Zulagen', '111 Tsd. €', 100, 1)}${wbar('Ohne Zulagen', '84 Tsd. €', 76)}
<div class="mu xs" style="margin-top:6px">1.200 € im Jahr, 5 % vor Kosten, 0,5 % Produktkosten.</div>
${sect('Gut zu wissen')}
<div class="card" style="padding:4px 14px">${[['Auszahlung', 'frühestens mit 65'], ['Erlaubt', 'ETFs (UCITS) bis Risikoklasse 5'], ['Kostendeckel Standarddepot', '1 % pro Jahr'], ['Alte Riester-Verträge', 'behalten altes Recht']].map(([k, v]) => `<div class="kv"><span class="sm b">${k}</span><span class="sm">${v}</span></div>`).join('')}</div>
<div class="card lime" style="margin-top:12px;padding:12px" class="sm"><b>Quelle:</b> Altersvorsorgereformgesetz, BGBl. 2026 I Nr. 156 vom 29.05.2026. Werte wörtlich geprüft.</div>
${foot}` });

screen('v07-b', { world: 'vorsorge', dock: 1, body: `
<div class="ltag">Förderung</div><div class="mt" style="margin-top:4px">Für wen lohnt es sich?</div>
<div class="stack" style="margin-top:14px">${[['10 € im Monat', '120 € Beitrag', '60 €', '50 %'], ['50 € im Monat', '600 € Beitrag', '240 €', '40 %'], ['150 € im Monat', '1.800 € Beitrag', '540 €', '30 %'], ['150 € + 2 Kinder', '1.800 € Beitrag', '1.140 €', '63 %']].map(([a, b, z, q], k) => `<div class="card${k === 0 ? ' ink' : ''}" style="display:flex;align-items:center;gap:10px;padding:13px"><div style="flex:1"><div class="bb">${a}</div><div class="xs" style="opacity:.65">${b}</div></div><div style="text-align:right"><div class="bb num" style="font-size:20px${k === 0 ? ';color:var(--lime)' : ''}">+${z}</div><div class="xs" style="opacity:.65">${q} Förderquote</div></div></div>`).join('')}</div>
<div style="margin-top:12px">${help('Förderquote: Zulage geteilt durch deinen Beitrag. Kleine Beiträge werden prozentual am stärksten gefördert.')}</div>
<div class="btn" style="margin-top:14px">Mit 10 € starten</div>` });

slide({ id: 'V07', title: 'Vorsorge · Förderung', route: '/vorsorge/#/foerderung', now: 'V07',
  sub: 'Heute: Eingabekasten unten, Gesetzestext in einem grünen Block. Neu: zwei Regler oben, die Zulage groß, die Rechnung in vier Zeilen, Balken je Beitrag und der Satz „schon 10 € reichen“.',
  neu: [['v07-a', 'Förderrechner, ganze Seite'], ['v07-b', 'Für wen lohnt es sich?']],
  spec: { aufbau: ['Titel + Satz zum Start 1.1.2027', 'Regler: Beitrag pro Jahr, Kinder; Schalter unter 25 / erster Vertrag', 'Ergebnis (schwarz): Zulage pro Jahr groß + Förderquote', 'So wird gerechnet: 50 % auf 360 €, 25 % bis 1.800 €, Kind 100 % bis 300 €, Bonus 200 €', 'Balken: Zulage je Beitrag 120 / 360 / 600 / 1.200 / 1.800 €', 'Modellrechnung nach 32 Jahren mit/ohne Zulagen (Marke)', 'Gut zu wissen: Auszahlung ab 65, erlaubte Anlagen, Kostendeckel 1 %, Bestandsverträge', 'Quelle mit Datum (neongrün)', 'Zweiter Screen: vier Beispielfälle mit Zulage und Förderquote, Knopf „Mit 10 € starten“ → V10'], komponenten: ['C09 Erklärung', 'C11 Kachel', 'C15 Schalter', 'C17 Balken', 'Vorsorge-Muster: Regler', 'Vorsorge-Muster: Beispiel-Marke'], daten: ['vorsorge/data/funding-rules/2027-DE.json (incomeRules.basicAllowance.tiers, childRules.perChild, bonusRules.careerStarter, contributionRules.minimumAnnualOwnContribution 120, productRules.standardDepotCostCap 0,01, payoutRules.earliestAge 65)', 'Modellrechnung 111 / 84 Tsd. € aus der heutigen Seite', 'Riester: funding-rules/2026-DE-riester.json, Frühstart: fruehstart-DE.json (Unterseiten bleiben)'], weg: ['Fünf Knöpfe oben (Geführter Rechner, Förderrechner, Frühstart, Riester, Anbieter) → Regler + Unterseiten über „Mehr“', 'Gesetzesblock als Fließtext → eine Quellenzeile, Details im Sheet', 'Mittelbar Zulageberechtigte (§ 79 Satz 2) → Schalter unter „Mehr Angaben“'] } });

/* ================= V08 · Veränderungen ================= */
screen('v08-a', { world: 'vorsorge', dock: 3, h: 1480, body: `
${intro('vorsorge', 'Bin ich auf Kurs?', 'Was sich seit deinem letzten Stand verändert hat.')}
<div class="card ink" style="margin-top:14px;padding:16px"><div style="display:flex;justify-content:space-between;align-items:center"><span class="ltag" style="color:#8a8a8a">Dein Plan · Beispiel</span>${vd('w', 'Nicht auf Kurs')}</div><div class="num" style="font-size:40px;font-weight:900;letter-spacing:-.05em;color:var(--lime);margin-top:6px">52 %</div><div class="sm">deines Ziels bei 5 % pro Jahr</div></div>
${sect('Stärkste Stellschraube')}
<div class="card lime" style="padding:14px;display:flex;align-items:center;gap:12px"><div style="flex:1"><div class="bb">Sparrate +50 €</div><div class="sm">bringt dich 10 %-Punkte näher ans Ziel</div></div>${ic('i-next', 18)}</div>
${sect('Dein Portfolio')}
<div class="card" style="padding:4px 14px">${[['Schwankung', '15,5 %'], ['Größter Rückgang', '−32,2 %'], ['Letzte 12 Monate', chg(16.8)], ['Nicht in Euro', '100 %']].map(([k, v]) => `<div class="kv"><span class="sm b">${k}</span><span class="bb num">${v}</span></div>`).join('')}</div>
${sect('In deinen ETFs')}
${[['EEM', 'Südkorea 12,2 % → 18,1 %', 'gestiegen', 'm'], ['EEM', 'Kaimaninseln 17,5 % → 13,3 %', 'gesunken', 'm'], ['URTH', 'Microsoft 4,2 % → 3,2 %', 'gesunken', 'm'], ['URTH', 'USA 70,6 % → 68,0 %', 'gesunken', 'm']].map(([t, s, v, k]) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--a-line)">${lg(t)}<span class="sm b" style="flex:1">${s}</span>${vd(k, v)}</div>`).join('')}
<div class="mu xs" style="margin-top:6px">Bestände laut SEC N-PORT, Quartal bis 28.02.2026</div>
${sect('Kosten von Produkten', 'Alle')}
<div class="card" style="padding:4px 14px">${[['RSEE', '1,68 % → 3,03 %', 'w', 'teurer'], ['AMZA', '2,75 % → 1,72 %', 's', 'günstiger'], ['GABF', '0,90 % → 1,64 %', 'w', 'teurer']].map(([t, s, k, v]) => `<div class="kv" style="align-items:center"><span class="sm"><b>${t}</b> ${s}</span>${vd(k, v)}</div>`).join('')}</div>
<div style="margin-top:10px">${help('Kostenquote laut Prospekt, brutto. Neue Prospekte prüfen wir automatisch.')}</div>
<div class="kv" style="margin-top:14px"><span class="sm b">Bei Änderungen benachrichtigen</span>${toggle(1)}</div>
${foot}` });

screen('v08-b', { world: 'vorsorge', dock: 3, body: `
${intro('vorsorge', 'Bin ich auf Kurs?', '')}
<div class="card" style="margin-top:18px;padding:20px;text-align:center"><div style="display:flex;justify-content:center">${vd('o', 'Noch kein Plan')}</div><div class="mt" style="margin-top:12px">Ohne Plan kein Kurs.</div><p class="mu sm" style="margin-top:8px">Speichere einen Plan oder einen Sparplan. Dann zeigen wir hier, ob du auf Kurs bist und was sich ändert.</p><div class="btn" style="margin-top:14px">10-Euro-Sparplan starten</div><div class="btn line" style="margin-top:8px">Zum Planer</div></div>
${sect('Bis dahin: Änderungen bei Kern-ETFs')}
<div class="card" style="padding:4px 14px">${['URTH · 4 relevante Änderungen', 'EEM · 12 relevante Änderungen'].map(t => `<div class="kv"><span class="sm b">${t}</span>${ic('i-next', 15)}</div>`).join('')}</div>` });

slide({ id: 'V08', title: 'Vorsorge · Veränderungen', route: '/vorsorge/#/monitor', now: 'V08',
  sub: 'Heute: Status-Kasten, lange Textzeilen mit Prospekt-Daten und rot-grünen Zahlen. Neu: oben das eine Urteil „auf Kurs?“, die stärkste Stellschraube, danach Änderungen in ETFs und Kosten als Zeilen mit Urteil.',
  neu: [['v08-a', 'Mit Plan: Kurs, Stellschraube, Änderungen'], ['v08-b', 'Leerzustand ohne Plan']],
  spec: { aufbau: ['Titel + Satz', 'Plan-Karte (schwarz): Urteil Auf Kurs / Knapp / Nicht auf Kurs, Zielerreichung', 'Stärkste Stellschraube (neongrün) → Planer', 'Dein Portfolio: Schwankung, größter Rückgang, 12 Monate, Währung', 'In deinen ETFs: Bestandsänderungen je Zeile mit Urteil gestiegen/gesunken', 'Kosten von Produkten: Prospekt-Änderungen mit Urteil teurer/günstiger', 'Schalter Benachrichtigen', 'Leerzustand: „Noch kein Plan“, Wege zu V10 und V02, Änderungen der Kern-ETFs'], komponenten: ['C07 Kursbewegung', 'C08 Urteil', 'C09 Erklärung', 'C15 Schalter', 'C18 Leerer Zustand', 'Vorsorge-Muster: Änderungszeile'], daten: ['vorsorge/data/changes.json (Produkte und Kosten, Prospekt-Daten)', 'vorsorge/data/holdings/<Serie>.json (changes.events, timeline)', 'Plan aus dem Konto; Plan-Werte im Mockup sind Beispiel'], weg: ['Lange Prospekt-Zeilen mit Datumsangaben → kurze Zeile, Datum im Detail', 'Rot/Grün → Urteil (C08)', '„Positionen URTH 88 % · EEM 12 %“ Tabelle → Portfolio (V05)'] } });

/* ================= V09 · Wissen ================= */
const TERMS = [['ETF', 'Ein Korb mit vielen Aktien, den du mit einem Kauf bekommst.'], ['Index', 'Eine Liste, welche Firmen im Korb sind, z. B. MSCI World.'], ['Laufende Kosten (TER)', 'Was der ETF pro Jahr kostet, in Prozent vom Geld.'], ['Effektivkosten', 'Alle Kosten zusammen, auch die von Depot und Vertrag.'], ['Thesaurierend / Ausschüttend', 'Gewinne bleiben im ETF oder werden dir ausgezahlt.'], ['Kurs oder Gesamtrendite', 'Mit oder ohne die ausgezahlten Gewinne gerechnet.'], ['Schwankung', 'Wie stark der Kurs typisch hoch und runter geht.'], ['Größter Rückgang', 'Der tiefste Fall vom letzten Höchststand.'], ['Vorsorgelücke', 'Was zwischen Rente und Wunsch im Alter fehlt.'], ['Überschneidung', 'Wie viele Firmen in zwei ETFs doppelt stecken.'], ['Hebel- und Short-ETFs', 'Verstärken oder drehen Bewegungen. Nicht für die Vorsorge.'], ['UCITS', 'EU-Regeln für Fonds. So erkennst du ETFs für deine Bank.'], ['Altersvorsorgedepot', 'Neues gefördertes Depot ab 2027, mit Zulagen.']];
screen('v09-a', { world: 'vorsorge', dock: 0, h: 1580, body: `
${intro('vorsorge', 'Vorsorge, einfach erklärt.', '15 Begriffe, je ein Satz.')}
<div style="margin-top:12px">${search('Begriff suchen …')}</div>
<div class="card lime" style="margin-top:14px;padding:14px;display:flex;gap:12px;align-items:center"><span class="hud" style="width:40px;height:40px;border-radius:11px">${ic('i-play', 20)}</span><div style="flex:1"><div class="bb">In 3 Minuten zum ersten Sparplan</div><div class="sm">Der geführte Weg mit 10 €</div></div>${ic('i-next', 18)}</div>
${sect('Die wichtigsten Begriffe')}
${TERMS.map(([t, s], k) => `<div style="padding:11px 0;border-top:1px solid var(--a-line)"><div style="display:flex;justify-content:space-between;align-items:center"><b>${t}</b>${ic(k === 0 ? 'i-x' : 'i-plus', 16)}</div>${k < 13 ? `<div class="mu sm" style="margin-top:3px">${s}</div>` : ''}</div>`).join('')}
${sect('Mehr lernen')}
<div class="stack">${navcard('i-book', 'Vision Universe Academy', 'Kurse und Videos')}${navcard('i-check', 'Datenquellen und Qualität', 'Woher jede Zahl kommt')}</div>
${foot}` });

screen('v09-b', { world: 'vorsorge', dock: 0, body: `${intro('vorsorge', 'Vorsorge, einfach erklärt.', '')}`,
  overlay: `<div class="ovl"></div><div class="sheet"><div class="grab"></div>
<div class="ltag">Begriff</div><div class="mt" style="margin-top:4px">Schwankung</div>
<p style="margin-top:8px;font-size:16px;font-weight:600;line-height:1.4">Wie stark der Kurs typisch hoch und runter geht. Mehr Schwankung heißt mehr Auf und Ab.</p>
<div class="ltag" style="margin-top:14px">Am Beispiel MSCI World (URTH)</div>
<div style="margin-top:6px">${chart(URTHMAX, { h: 110, axis: ['2012', '2026'] })}</div>
<div class="grid2" style="margin-top:10px">${tile('Schwankung', '16 %', 'pro Jahr')}${tile('Größter Rückgang', '−32,7 %', '2020, nach 5 Mon. erholt')}</div>
<div class="mu xs" style="margin-top:8px">Fachbegriff: Volatilität</div></div>` });

slide({ id: 'V09', title: 'Vorsorge · Wissen', route: '/vorsorge/#/wissen', now: 'V09',
  sub: 'Heute: eine zugeklappte Liste mit Fachbegriffen. Neu: jeder Begriff gleich mit einem Satz sichtbar, Alltagswort zuerst, Fachwort danach; offen mit echtem Beispiel aus den Daten.',
  neu: [['v09-a', 'Begriffe mit einem Satz'], ['v09-b', 'Begriff offen mit Beispiel']],
  spec: { aufbau: ['Titel + Satz, Suche', 'Lernpfad-Karte: „In 3 Minuten zum ersten Sparplan“ → V10', 'Begriffsliste: Alltagswort, ein Satz sofort sichtbar, „+“ öffnet', 'Sheet je Begriff: Satz groß, Beispiel mit echten Daten (Chart, Kacheln), Fachbegriff unten', 'Mehr lernen: Academy, Datenquellen'], komponenten: ['C06 Chart', 'C09 Erklärung', 'C11 Kachel', 'C12 Navigationskarte', 'C16 Sheet', 'C20 Suche'], daten: ['Begriffe der heutigen Seite (15, hier 13 sichtbar)', 'Beispiel Schwankung: vorsorge/data/series/URTH.json (price.weekly), etf-index-home.json (vol, mdd)', 'Dieselben Sätze speisen die „?“-Erklärungen (C09) in ganz Vorsorge'], weg: ['Zugeklappte Liste ohne Vorschau', 'Fachbegriff als Titel („Schwankung (Volatilität)“) → Alltagswort als Titel, Fachwort unten'] } });

/* ================= V10 · Der 10-Euro-Sparplan (neu, geführt) ================= */
const T3 = ten(0.03), T5 = ten(0.05), T7 = ten(0.07), TZ = ten(0.05, 30, 180);
const step = (k, t) => `<div style="display:flex;align-items:center;gap:10px"><span class="hb">${ic(k === 1 ? 'i-x' : 'i-back', 17)}</span><div style="flex:1;display:grid;grid-template-columns:repeat(6,1fr);gap:4px">${[1, 2, 3, 4, 5, 6].map(i => `<i style="height:5px;border-radius:9px;background:${i <= k ? 'var(--lime)' : 'var(--a-line)'};${i === k ? 'box-shadow:0 0 0 1px var(--a-ink)' : ''}"></i>`).join('')}</div><span class="mu xs b">${k} / 6</span></div><div class="ltag" style="margin-top:16px">${t}</div>`;
const fill = (inner, cta, sec) => `<div style="display:flex;flex-direction:column;height:calc(100% + 84px)">${inner}<div style="margin-top:auto;padding-top:14px"><div class="btn">${cta}</div>${sec ? `<div class="btn line" style="margin-top:8px">${sec}</div>` : ''}</div></div>`;
const F = { world: 'vorsorge', dock: false };

screen('v10-a', Object.assign({}, F, { body: fill(`${step(1, 'Der 10-Euro-Sparplan')}
<div class="lt" style="margin-top:6px">Wie viel möchtest du im Monat sparen?</div>
<div style="text-align:center;margin-top:22px"><span class="num" style="font-size:84px;font-weight:900;letter-spacing:-.06em;line-height:1">10&nbsp;€</span><div class="mu sm b">im Monat</div></div>
<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:18px">${['10 €', '25 €', '50 €', '100 €', 'Eigener'].map((t, k) => `<span class="chip${k === 0 ? ' on' : ''}" style="justify-content:center;padding:0 4px;font-size:13px">${t}</span>`).join('')}</div>
<div class="card" style="margin-top:16px;padding:12px">${help('Kleiner Betrag, großer Schritt: Wichtig ist, dass du anfängst. Erhöhen geht jederzeit.')}</div>
<div class="card ink" style="margin-top:10px;padding:14px;display:flex;gap:12px;align-items:center"><span class="num" style="font-size:26px;font-weight:900;color:var(--lime);letter-spacing:-.04em">+60&nbsp;€</span><span class="sm">Ab 2027 legt der Staat im Jahr dazu. 10 € im Monat sind genau der Mindestbeitrag.</span></div>`, 'Weiter') }));

screen('v10-b', Object.assign({}, F, { body: fill(`${step(2, 'Was daraus werden kann')}
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><div class="mt">10 € im Monat, 30 Jahre</div>${bsp('Beispiel')}</div>
<div style="margin-top:12px">${chart(T5, { h: 140, lines: [T3, T7], zones: fitz(T3, T7), base: false, grid: false, axis: ['heute', 'in 30 Jahren'] })}</div>
<div class="grid2" style="margin-top:10px">${tile('Du zahlst ein', '3.600 €', '30 × 120 €')}${tile('Bei 5 % pro Jahr', `≈ ${r100(T5[30])} €`, 'Linie im Chart')}</div><div class="kv" style="margin-top:4px"><span class="sm b">Spanne bei 3–7 % (gestrichelt)</span><span class="bb num">${r100(T3[30])}–${r100(T7[30])} €</span></div>
<div class="card ink" style="margin-top:10px;padding:12px"><span class="sm"><b style="color:var(--lime)">Keine Prognose.</b> Gerechnet vor Kosten, Steuern und Inflation. Es kann auch weniger werden, zwischendurch auch Verlust.</span></div>`, 'Verstanden, weiter') }));

screen('v10-c', Object.assign({}, F, { body: fill(`${step(3, 'Was ist ein ETF?')}
<div class="lt" style="margin-top:6px">Ein Korb mit vielen Firmen.</div>
<p style="margin-top:10px;font-size:16.5px;font-weight:600;line-height:1.4">Mit jeder Rate kaufst du ein kleines Stück von allen. Geht es einer Firma schlecht, tragen die anderen.</p>
<div class="card" style="margin-top:14px;padding:14px"><div class="dots">${Array.from({ length: 60 }, (_, i) => `<i class="${i === 0 ? 'me' : i % 7 === 3 ? '' : 'f'}"></i>`).join('')}</div><div class="mu xs b" style="margin-top:8px">Jeder Punkt: eine Firma. Im MSCI World sind es 1.320.</div></div>
<div class="stack" style="margin-top:12px">${[['Breit gestreut', 'Hunderte Firmen statt einer'], ['Günstig', '0,24 % Kosten: bei 120 € rund 29 Cent im Jahr'], ['Flexibel', 'Pausieren und verkaufen geht jederzeit']].map(([t, s]) => `<div style="display:flex;gap:10px;align-items:center"><span style="width:26px;height:26px;border-radius:50%;background:var(--lime);display:grid;place-items:center;flex:none">${ic('i-check', 15)}</span><div><b class="sm">${t}</b><div class="mu xs">${s}</div></div></div>`).join('')}</div>`, 'Weiter') }));

screen('v10-d', Object.assign({}, F, { body: fill(`${step(4, 'Ein passender ETF')}
<div class="mt" style="margin-top:6px">Für den Anfang: die ganze Welt in einem ETF.</div>
<div class="card" style="margin-top:12px;padding:14px"><div style="display:flex;align-items:center;gap:10px">${lg('MSCI')}<div style="flex:1"><div class="bb">MSCI World</div><div class="mu xs">1.320 Firmen · 23 Länder · seit 2012 als URTH</div></div>${vd('s', 'Breit')}</div>
<div style="margin-top:10px">${chart(URTHMAX, { h: 96, axis: ['2012', '2026'] })}</div>
${kv([['Kosten pro Jahr', '0,24 %'], ['Schwankung pro Jahr', '16 %'], ['Tiefster Fall (2020)', '−32,7 %']]).replace('<div class="card">', '<div style="margin-top:6px">')}</div>
<div style="margin-top:10px">${help('Vergangene Kurse sind kein Versprechen. Der Chart zeigt nur, wie es bisher lief.')}</div>
<div class="card line" style="margin-top:10px;padding:12px" class="sm"><span class="sm">Andere Wege: <b>Welt inkl. Schwellenländer</b> oder <b>mit Anleihen ruhiger</b>.</span></div>`, 'Diesen Index nehmen', 'Andere ansehen') }));

screen('v10-e', Object.assign({}, F, { body: fill(`${step(5, 'Frei oder gefördert?')}
<div class="mt" style="margin-top:6px">Ab 2027 legt der Staat 60 € im Jahr dazu.</div>
<p class="mu sm" style="margin-top:6px">10 € im Monat sind genau der Mindestbeitrag fürs geförderte Altersvorsorgedepot.</p>
<div class="stack" style="margin-top:14px">
<div class="card line" style="padding:14px"><div style="display:flex;justify-content:space-between;align-items:center"><b>Freier Sparplan</b><span style="width:22px;height:22px;border-radius:50%;border:2px solid var(--a-line)"></span></div><div class="sm mu" style="margin-top:4px">Geht bei fast jeder Bank. Jederzeit verfügbar.</div>${kv([['Zulage', 'keine'], ['Geld verfügbar', 'jederzeit']])}</div>
<div class="card ink" style="padding:14px"><div style="display:flex;justify-content:space-between;align-items:center"><b>Altersvorsorgedepot</b><span style="width:22px;height:22px;border-radius:50%;background:var(--lime);color:#000;display:grid;place-items:center">${ic('i-check', 14)}</span></div><div class="sm" style="opacity:.7;margin-top:4px">Gefördert ab 1.1.2027, mit eigenem Vertrag.</div><div style="display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:10px" class="sm"><span>Zulage</span><b style="color:var(--lime)">+60 € / Jahr</b><span>Geld verfügbar</span><b>ab 65</b></div></div>
</div>
<div style="margin-top:10px">${help('In 30 Jahren wären das 1.800 € vom Staat. Dafür bleibt das Geld bis zur Rente gebunden.')}</div>`, 'Weiter') }));

screen('v10-f', Object.assign({}, F, { body: fill(`${step(6, 'Fertig')}
<div style="display:flex;justify-content:center;margin-top:8px"><span style="width:64px;height:64px;border-radius:50%;background:var(--lime);display:grid;place-items:center">${ic('i-check', 34)}</span></div>
<div class="lt" style="margin-top:10px;text-align:center">Dein Plan steht.</div>
<div class="card" style="margin-top:14px;padding:4px 14px">${kv([['Sparrate', '10 € im Monat'], ['Index', 'MSCI World'], ['Form', 'Altersvorsorgedepot'], ['Erinnerung', 'einmal im Jahr']]).replace('<div class="card">', '<div>')}</div>
<div class="ltag" style="margin-top:14px">Nächster Schritt bei deiner Bank</div>
${[['Depot öffnen', 'oder dein bestehendes nehmen'], ['ETF suchen', 'UCITS-ETF auf den „MSCI World“'], ['Sparplan anlegen', '10 €, Tag im Monat wählen']].map(([t, s], k) => `<div style="display:flex;gap:10px;align-items:center;padding:7px 0"><span class="num" style="width:26px;height:26px;border-radius:50%;background:var(--a-ink);color:var(--lime);display:grid;place-items:center;font-weight:900;font-size:13px;flex:none">${k + 1}</span><div><b class="sm">${t}</b><div class="mu xs">${s}</div></div></div>`).join('')}
<div class="mu xs">Wir verkaufen nichts und bekommen keine Provision.</div>`, 'Zu meinem Plan', 'Checkliste teilen') }));

slide({ t: 'html', anchor: 'V10-ablauf', id: 'V10', title: 'Vorsorge · Der 10-Euro-Sparplan (Ablauf)', sub: 'Neue Seite ohne heutiges Gegenstück. Der wichtigste Einstieg für Einsteiger: sechs Schritte, ein Gedanke pro Bildschirm, ohne Produkt-Leiste, jede Zahl erklärt, jede Rechnung als Beispiel markiert.', html: () => `<div class="devs" style="justify-content:flex-start;flex-wrap:nowrap;gap:14px">${[['v10-a', '1 · Betrag wählen'], ['v10-b', '2 · Was daraus werden kann'], ['v10-c', '3 · ETF in einem Satz'], ['v10-d', '4 · Passender ETF'], ['v10-e', '5 · Frei oder gefördert'], ['v10-f', '6 · Plan steht, nächster Schritt']].map(([id, c]) => `<figure class="dev" style="--w:190px"><div data-frame="${id}"></div><figcaption>${c}</figcaption></figure>`).join('')}</div>` });

slide({ id: 'V10', title: 'Vorsorge · Der 10-Euro-Sparplan', route: 'neu', newRoute: '/vorsorge/#/start', now: null,
  sub: 'Erreichbar von der Vorsorge-Startseite, aus dem Wissen und aus dem Leerzustand von „Bin ich auf Kurs?“. Am Ende steht ein gespeicherter Plan und eine Checkliste für die eigene Bank.',
  neu: [['v10-a', 'Schritt 1: Betrag'], ['v10-b', 'Schritt 2: Beispielrechnung'], ['v10-d', 'Schritt 4: MSCI World'], ['v10-f', 'Schritt 6: Plan + Bank-Checkliste']],
  spec: { aufbau: ['Vollbild-Ablauf ohne Produkt-Leiste, oben Schließen/Zurück + Fortschritt (6 Segmente)', '1 Betrag: 10 € groß, Chips 10 / 25 / 50 / 100 / Eigener', '2 Was daraus werden kann: Chart 30 Jahre (5 % Linie, 3 % und 7 % gestrichelt), Kacheln Eingezahlt 3.600 €, bei 5 %, Spanne; schwarzer Kasten „Keine Prognose“; Marke BEISPIEL', '3 ETF in einem Satz: „Ein Korb mit vielen Firmen“, Punkte-Raster, drei Vorteile', '4 Passender ETF: Index MSCI World mit Chart seit 2012, Kosten, Schwankung, tiefster Fall; Alternativen', '5 Frei oder gefördert: freier Sparplan vs. Altersvorsorgedepot (+60 € Zulage, Auszahlung ab 65)', '6 Plan steht: Zusammenfassung, 3 Schritte bei der eigenen Bank (Depot, UCITS-ETF auf MSCI World suchen, Sparplan anlegen), Hinweis ohne Provision', 'Gespeicherter Plan erscheint in V08 „Bin ich auf Kurs?“ und im Planer'], komponenten: ['C06 Chart (lines)', 'C08 Urteil', 'C09 Erklärung', 'C11 Kachel', 'Vorsorge-Muster: Ablauf-Kopf mit Fortschritt', 'Vorsorge-Muster: Beispiel-Marke', 'Vorsorge-Muster: Bank-Checkliste', 'Punkte-Raster (.dots)'], daten: ['Beispielrechnung: 120 € pro Jahr, Rendite 3 / 5 / 7 % vor Kosten, jährlich verzinst, 30 Jahre (≈ 5.800 / 8.200 / 11.700 €), Formel im Sheet offen legen', 'vorsorge/data/funding-rules/2027-DE.json: Mindestbeitrag 120 €/Jahr, Grundzulage 50 % auf die ersten 360 € → 60 €, Auszahlung frühestens 65', 'vorsorge/data/series/URTH.json (price.weekly) und etf-index-home.json (ter 0,24 %, vol, mdd) als Marktabbild des MSCI World', 'vorsorge/data/eu/etf-eu-index.json: UCITS-Anteilklassen auf den MSCI World (ISIN) für den Bank-Schritt, ohne Empfehlung', 'Plan im Konto (sonst lokal)'], weg: ['Neu, ersetzt den „Geführten Rechner“ als ersten Einstieg; der Planer (V02) bleibt für alle, die schon sparen'] } });
})();
