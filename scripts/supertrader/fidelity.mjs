// Supertrader — Methodentreue (Runde 7).
//
// Trennt fuer jede Methode: was eine Quelle tatsaechlich sagt, welche Regel im
// Code steht und wie diese Regel einzuordnen ist. Ein Name im Menue ist keine
// Umsetzung. Diese Datei ist die einzige Quelle fuer den Produktstatus
// (registry.json -> Methodenseite) und fuer docs/SUPERTRADER_METHOD_FIDELITY.md.
//
// Quellenzugang in Runde 7: Die Netzwerkrichtlinie der Arbeitsumgebung sperrte
// fast alle Primaerseiten (minervini.com, qullamaggie.com, originalturtles.org,
// investors.com, SSRN, Google Books, time.com). Belegt ist deshalb, was
// mehrere unabhaengige Suchauszuege uebereinstimmend wiedergeben. Keine
// Regel wurde aus einer unrechtmaessigen Buchkopie uebernommen; fehlendes
// Originalmaterial ist je Methode benannt.

export const FIDELITY_VERSION = 'supertrader-fidelity-1.0.0';

// Einordnung einer einzelnen Code-Regel.
export const RULE_CLASS = Object.freeze({
  ORIGINAL: { label: 'Originalregel', plain: 'Steht so in einer Primärquelle des Traders.' },
  OPERATIONALIZATION: { label: 'Vertretbare Umsetzung', plain: 'Belegte Regel, für Tageskurse mechanisch übersetzt (z. B. Schlusskurs statt Kauforder im Tagesverlauf).' },
  VU_EXTENSION: { label: 'Vision-Universe-Erweiterung', plain: 'Eigene Ergänzung; nicht Teil der Originalmethode.' },
  UNBACKED: { label: 'Unbelegte Annahme', plain: 'Weder in Primär- noch in übereinstimmenden Sekundärquellen gefunden.' },
});

// Belegstufe der Quelle (was in Runde 7 tatsaechlich einsehbar war).
export const SOURCE_ACCESS = Object.freeze({
  PRIMARY: 'Primärquelle eingesehen',
  PRIMARY_SNIPPET: 'Primärquelle, nur Auszug lesbar',
  SECONDARY: 'Übereinstimmende Sekundärquellen',
  DISPUTED: 'Quellen widersprechen sich',
  NONE: 'Keine Quelle',
});

// Produktstatus je Methode (was der Kunde als Erstes liest).
export const PRODUCT_STATUS = Object.freeze({
  SOURCE_FAITHFUL: { label: 'Quellentreu nachgebildet', plain: 'Alle Kernregeln sind belegt und mechanisch abbildbar.' },
  VU_VARIANT: { label: 'Vision-Universe-Variante', plain: 'Angelehnt an die Methode: belegte Kernideen, mechanisch umgesetzt, mit eigenen Annahmen und fehlenden Bausteinen. Nicht die Methode des Traders selbst.' },
  PARTIAL_CHECK: { label: 'Teilprüfung', plain: 'Nur einzelne Kriterien prüfbar; kein vollständiges Signal.' },
  RESEARCH: { label: 'Forschung', plain: 'Beschrieben, aber nicht als laufendes Modell umgesetzt.' },
});

const r = (area, source, access, code, cls, note) => ({ area, source, access, code, cls, note: note || null });

export const FIDELITY = Object.freeze({
  MINERVINI_VCP: {
    status: 'VU_VARIANT', mechanizable: 'PARTLY',
    mechanizableNote: 'Trend Template ist mechanisch; ob eine Basis eine echte VCP ist, wo der Pivot liegt und wann in die Stärke verkauft wird, entscheidet Minervini nach Augenmaß.',
    rules: [
      r('Auswahl', 'Trend Template: Kurs über 50/150/200-Tage-Linie, Linien geordnet, 200-Tage-Linie steigt ≥ 1 Monat', 'SECONDARY', 'MIN-TREND-01/02 (21 Sitzungen Steigung)', 'OPERATIONALIZATION'),
      r('Auswahl', 'Mindestens 30 % (Buch 2013) bzw. 25 % (ältere Fassung) über dem 52-Wochen-Tief', 'DISPUTED', '1.1.0: 25 % · 2.0.0: 30 %', 'OPERATIONALIZATION'),
      r('Auswahl', 'Höchstens 25 % unter dem 52-Wochen-Hoch', 'SECONDARY', 'MIN-HIGH-01', 'ORIGINAL'),
      r('Auswahl', 'IBD-RS-Rang ≥ 70 (lieber 80–90)', 'SECONDARY', 'VU-Perzentil der gewichteten 3–12-Monats-Rendite ≥ 70', 'VU_EXTENSION', 'IBD-RS ist proprietär.'),
      r('Basis', 'VCP: 2–6 Kontraktionen, jede enger, Volumen trocknet aus, Pivot am Hoch der letzten engen Zone', 'SECONDARY', 'Zickzack 4 %, ≥ 2 fallende Tiefen, erste ≤ 35 %, letzte ≤ 10 %, Volumen 10/50 < 0,8', 'OPERATIONALIZATION', 'Minervini beschreibt die VCP nur qualitativ (X, primär).'),
      r('Einstieg', 'Kauf beim Ausbruch über den Pivot; Volumen deutlich über Durchschnitt', 'PRIMARY_SNIPPET', '1.1.0: Schluss über Pivot ohne Volumenregel · 2.0.0: zusätzlich ≥ 1,4× 50-Tage-Volumen', 'OPERATIONALIZATION', 'Zahl 40–50 % nur sekundär.'),
      r('Stop', 'Stop vor dem Einstieg festlegen; höchstens 10 % Verlust', 'PRIMARY_SNIPPET', 'Kontraktionstief, höchstens 10 % unter Einstieg', 'OPERATIONALIZATION', '10 % aus Schwager-Interview, sekundär.'),
      r('Ausstieg', 'Gewinne nie zu Verlusten werden lassen; Stop auf Einstand', 'PRIMARY_SNIPPET', '1.1.0: fehlt · 2.0.0: Einstand ab 3R (MIN-BE-01)', 'OPERATIONALIZATION', '3R nur sekundär.'),
      r('Ausstieg', 'In die Stärke verkaufen; Bruch der 50-Tage-Linie mit hohem Volumen', 'SECONDARY', '1.1.0: jeder Schluss unter der 50-Tage-Linie (VU) · 2.0.0: nur mit überdurchschnittlichem Volumen', 'OPERATIONALIZATION', '1.1.0 war eine VU-Regel.'),
      r('Positionsgröße', 'Ø 1,25 % Risiko je Trade, höchstens 2,5 %; 25 % Position bei 5 % Stop', 'PRIMARY_SNIPPET', '1.1.0: 0,5 % (VU) · 2.0.0: 1,25 %, max. 25 %', 'ORIGINAL'),
      r('Portfolio', 'Schrittweise Exposition nach Ergebnis der letzten 4–5 Trades', 'PRIMARY_SNIPPET', '2.0.0: halbes Risiko nach netto negativen letzten 5 Trades', 'OPERATIONALIZATION'),
      r('Fundamentaldaten', 'Beschleunigung von Gewinn, Umsatz, Marge über drei Quartale („Code 33“)', 'SECONDARY', 'fehlt', 'UNBACKED', 'Keine Gewinndaten zum damaligen Stichtag.'),
    ],
    missing: ['Fundamentaldaten (Code 33)', 'Cheat-/Low-Cheat-Einstiege vor dem Pivot', 'Verkauf in die Stärke / Klimax-Signale', 'Diskretionäre Basisbeurteilung', 'Proprietäres Marktmodell'],
    data: { historical: 'Tageskurse aller damals gelisteten US-Aktien ab 2016 (inkl. delisteter)', live: 'Tageskurse ~6.000 US-Aktien, ein Jahr Tageshistorie', gaps: 'keine Gewinne/Umsätze zum Stichtag; kein IBD-RS' },
    neededMaterial: ['Trade Like a Stock Market Wizard (2013): Trend Template, VCP, Risiko-Kapitel', 'Think & Trade Like a Champion (2017): Einstiege, Größe, Einstand', 'Schwager, Stock Market Wizards (2001): Minervini-Kapitel (10-%-Grenze)'],
  },
  WEINSTEIN_STAGE: {
    status: 'VU_VARIANT', mechanizable: 'PARTLY',
    mechanizableNote: 'Stufen und Steigung der 30-Wochen-Linie beurteilt Weinstein nach Augenmaß; Gruppenstärke und Marktindikatoren werden gewichtet, ohne feste Zahl.',
    rules: [
      r('Auswahl', 'Vier Stufen, 30-Wochen-Linie; Kauf nur in Stufe 2', 'SECONDARY', 'Stufe aus Steigung (±0,5 %/4 Wochen) und Lage zur Linie', 'OPERATIONALIZATION', 'Keine Steigungszahl im Original.'),
      r('Basis', 'Stufe-1-Basis, Widerstand an der Oberkante', 'SECONDARY', 'Basis ≥ 10 Wochen flache Linie, Kurs ±15 % um die Linie, Widerstand = höchster Wochenschluss', 'OPERATIONALIZATION'),
      r('Basis', '—', 'NONE', '1.1.0: Setup verworfen, sobald die Linie vor dem Ausbruch steigt · 2.0.0: Basis bleibt bis Ausbruch/Bruch', 'UNBACKED', 'Umsetzungsfehler in 1.1.0: verwarf in der lokalen Probe die Hälfte der Basen.'),
      r('Einstieg', 'Ausbruch über den Widerstand (Kauforder knapp darüber)', 'SECONDARY', 'Wochenschluss über dem Widerstand, Kauf zur nächsten Eröffnung', 'OPERATIONALIZATION'),
      r('Einstieg', 'Ausbruchsvolumen mindestens doppelt so hoch wie der Schnitt der Vorwochen', 'SECONDARY', '1.1.0: 1,5× zehn Wochen (VU) · 2.0.0: 2× vier Wochen', 'OPERATIONALIZATION'),
      r('Relative Stärke', 'Nie mit negativer RS kaufen (Mansfield-RS, Nulllinie)', 'SECONDARY', '1.1.0: 13-Wochen-Anstieg (VU) · 2.0.0: Mansfield-RS > 0', 'OPERATIONALIZATION'),
      r('Marktfilter', '„Forest to the trees“: erst Markt, dann Gruppe, dann Aktie', 'SECONDARY', '1.1.0: fehlt · 2.0.0: SPY über nicht fallender 30-Wochen-Linie; Gruppe fehlt', 'OPERATIONALIZATION'),
      r('Stop', 'Unter dem bedeutenden Tief unter dem Ausbruch, nicht auf runden Zahlen', 'SECONDARY', '2 % unter der Basis; Rundungsregel fehlt', 'OPERATIONALIZATION'),
      r('Ausstieg', 'Investor: Stop nachziehen unter Korrekturtiefs/30-Wochen-Linie; raus spätestens in Stufe 4', 'SECONDARY', '1.1.0: Stop 2 % unter der Linie im Wochenverlauf (VU) + Wochenschluss darunter · 2.0.0: nur Wochenschluss unter der Linie', 'OPERATIONALIZATION'),
      r('Positionsgröße', 'Halbe Position beim Ausbruch, Rest beim Rücksetzer', 'SECONDARY', 'fehlt (VU-Standard 0,5 % Risiko)', 'VU_EXTENSION'),
    ],
    missing: ['Gruppen-/Sektorstufe', 'Langfristige Marktindikatoren (A/D-Linie, Momentum-Index)', 'Halbposition + Rücksetzer-Kauf', 'Rundungsregel für Stops', 'Leerverkauf in Stufe 4'],
    data: { historical: 'Wochenreihen aus Point-in-Time-Tagesbalken ab 2016, SPY-Wochenschluss', live: 'Lange Wochenschlusskurse + ein Jahr Tagesbalken (Wochenvolumen nur im Tagesfenster)', gaps: 'keine Gruppenzuordnung zum Stichtag; keine Marktbreite' },
    neededMaterial: ['Secrets for Profiting in Bull and Bear Markets (1988): Kapitel Kaufzeitpunkt, Verkauf, Langfristindikatoren', 'Stocks & Commodities Interview V.39:11 (2021)'],
  },
  MOMENTUM_BREAKOUT: {
    status: 'VU_VARIANT', mechanizable: 'PARTLY',
    mechanizableNote: 'Kullamägi kauft im Tagesverlauf am Hoch der ersten Minuten (Opening Range); dafür fehlen historische Intraday-Kurse. Basisqualität beurteilt er nach Augenmaß.',
    rules: [
      r('Auswahl', 'Die 1–2 % stärksten Aktien über 1, 3, 6 Monate', 'PRIMARY_SNIPPET', 'Perzentil ≥ 98 über 1/3/6 Monate', 'ORIGINAL'),
      r('Basis', 'Vorlauf 30–100 % in 1–3 Monaten, 2 Wochen bis 2 Monate geordnete Konsolidierung an steigenden 10/20-Tage-Linien', 'PRIMARY_SNIPPET', 'Vorlauf ≥ 30 %, Basis 10–40 Sitzungen, Tiefe ≤ 25 %, höhere Tiefs, enger werdende Spanne', 'OPERATIONALIZATION'),
      r('Einstieg', 'Kauf am Opening-Range-Hoch (1/5/60 Minuten)', 'PRIMARY_SNIPPET', 'Schluss über dem 5-Tage-Hoch, Kauf zur nächsten Eröffnung; Gap > 0,5 ADR ausgelassen', 'OPERATIONALIZATION', 'Größte Abweichung: Tagesdaten statt Intraday.'),
      r('Stop', 'Tagestief, nicht weiter als ADR', 'PRIMARY_SNIPPET', 'Tief des Bestätigungstags, höchstens 1 ADR', 'OPERATIONALIZATION'),
      r('Ausstieg', '1/3–1/2 nach 3–5 Tagen verkaufen, Stop auf Einstand', 'PRIMARY_SNIPPET', '1/3 nach 3 Sitzungen, Rest auf Einstand', 'ORIGINAL'),
      r('Ausstieg', 'Rest an der 10/20-Tage-Linie nachziehen', 'PRIMARY_SNIPPET', '1.1.0: 10-Tage-Ausstieg ab Tag 1 für die ganze Position · 2.0.0: nur für den Rest', 'OPERATIONALIZATION', 'Umsetzungsfehler in 1.1.0.'),
      r('Positionsgröße', 'Meist 0,3–0,5 % Risiko, Positionen 10–20 %', 'PRIMARY_SNIPPET', '0,5 % Risiko, max. 20 %', 'ORIGINAL'),
      r('Marktfilter', 'Index über 10/20-Tage-Linie (nur aus Streams/Tweets berichtet)', 'NONE', 'fehlt', 'VU_EXTENSION'),
      r('Liquidität', '—', 'NONE', 'Kurs ≥ 5 USD, 5 Mio. USD Tagesumsatz, ADR ≥ 2 %', 'VU_EXTENSION'),
    ],
    missing: ['Intraday-Einstieg am Opening-Range-Hoch', 'Episodic Pivots (eigenes Setup, Nachrichten)', 'Parabolic Shorts', 'Marktfilter'],
    data: { historical: 'Tageskurse ab 2016 (inkl. delisteter)', live: 'Tageskurse', gaps: 'keine Intraday-Historie; keine Nachrichten-/Gap-Ursache' },
    neededMaterial: ['qullamaggie.com Beiträge im Volltext (3 timeless setups, FAQ, Episodic Pivots) – frei verfügbar, in dieser Umgebung gesperrt', 'Historische 1-/5-Minuten-Kurse (kostenpflichtig)'],
  },
  DARVAS_BOX: {
    status: 'VU_VARIANT', mechanizable: 'PARTLY',
    mechanizableNote: 'Was eine Box ist, beschreibt Darvas nicht als Formel; die verbreitete 3-Tage-Regel ist eine spätere Rekonstruktion.',
    rules: [
      r('Auswahl', 'Starke Aktien nahe neuer Hochs, Zukunftsbranchen, steigende Ertragskraft', 'SECONDARY', 'Nahe 52-Wochen-Hoch + 6-Monats-Perzentil ≥ 80; Ertragskraft fehlt', 'OPERATIONALIZATION'),
      r('Basis', 'Box: Kurs pendelt zwischen Ober- und Unterkante', 'SECONDARY', 'Oberkante/Unterkante je 3 Sitzungen bestätigt, Höhe 3–25 %', 'VU_EXTENSION', '3-Tage-Regel nur sekundär.'),
      r('Einstieg', 'Kauforder knapp über der Boxoberkante', 'PRIMARY_SNIPPET', 'Schluss über der Oberkante, Kauf zur nächsten Eröffnung', 'OPERATIONALIZATION'),
      r('Stop', 'Stop-Loss knapp unter dem Kaufkurs (TIME, 1959)', 'PRIMARY_SNIPPET', '1.2.0: Boxunterkante · 2.0.0: 1 % unter der Oberkante', 'OPERATIONALIZATION', '1.2.0 wich vom Primärbeleg ab.'),
      r('Ausstieg', 'Stop mit jeder höheren Box nachziehen', 'SECONDARY', 'Neue bestätigte Boxunterkante', 'OPERATIONALIZATION'),
      r('Positionsgröße', 'Aufstocken in steigende Boxen', 'SECONDARY', 'fehlt (VU-Standard 0,5 %)', 'VU_EXTENSION'),
    ],
    missing: ['Fundamentalfilter („techno-fundamentalist“)', 'Volumenbestätigung (keine Zahl belegt)', 'Pyramiding'],
    data: { historical: 'Tageskurse ab 2016', live: 'Tageskurse', gaps: 'keine Gewinndaten zum Stichtag' },
    neededMaterial: ['How I Made $2,000,000 in the Stock Market (1960), z. B. über die Ausleihe im Internet Archive'],
  },
  DONCHIAN_TURTLE: {
    status: 'VU_VARIANT', mechanizable: 'YES',
    mechanizableNote: 'Die Turtle-Regeln sind vollständig mechanisch – aber für ein gestreutes Futures-Portfolio geschrieben, nicht für Einzelaktien.',
    rules: [
      r('Einstieg', 'System 1: Ausbruch über das 20-Tage-Hoch (Stop-Order im Tagesverlauf)', 'SECONDARY', 'Schluss über dem 20-Tage-Hoch, Kauf zur nächsten Eröffnung', 'OPERATIONALIZATION'),
      r('Einstieg', 'Signal auslassen, wenn der letzte Ausbruch ein Gewinner war', 'SECONDARY', 'fehlt', 'UNBACKED', 'Fehlender Originalbaustein.'),
      r('Stop', '2N (N = 20-Tage-ATR)', 'SECONDARY', '2N unter der Eröffnung', 'ORIGINAL'),
      r('Ausstieg', 'Bruch des 10-Tage-Tiefs', 'SECONDARY', 'Schluss unter dem 10-Tage-Tief, Verkauf zur nächsten Eröffnung', 'OPERATIONALIZATION'),
      r('Positionsgröße', '1 Unit = 1 % Konto je N; bis 4 Units im Abstand ½ N', 'SECONDARY', '0,5 % Risiko je Trade, kein Aufstocken', 'VU_EXTENSION'),
      r('Portfolio', 'Limits je Markt / korrelierte Märkte', 'SECONDARY', 'max. 10 Positionen', 'VU_EXTENSION'),
      r('Universum', 'Gestreute Futures', 'SECONDARY', 'Liquide US-Aktien ≥ 10 USD, 20 Mio. USD Umsatz', 'VU_EXTENSION'),
    ],
    missing: ['System-1-Filter', 'Unit-Größe 1 % je N', 'Pyramiding bis 4 Units', 'Korrelationslimits', 'System 2 (55/20 Tage)'],
    data: { historical: 'Tageskurse ab 2016', live: 'Tageskurse', gaps: 'keine' },
    neededMaterial: ['Curtis Faith, The Original Turtle Trading Rules (frei auf originalturtles.org; hier gesperrt)'],
  },
  CANSLIM: {
    status: 'PARTIAL_CHECK', mechanizable: 'PARTLY',
    mechanizableNote: 'C, A und L haben Zahlen; N, S und I sind Ermessen; M (Follow-Through-Tage, Distributionstage) ist mechanisch, aber nicht umgesetzt.',
    rules: [
      r('C', 'Quartals-EPS ≥ 25 % ggü. Vorjahr, Umsatz ≥ 25 % oder beschleunigt', 'SECONDARY', 'Teilprüfung mit zuletzt berichteten Werten', 'OPERATIONALIZATION'),
      r('A', 'Jahres-EPS ≥ 25 % in drei Jahren, Eigenkapitalrendite ≥ 17 %', 'SECONDARY', 'Teilprüfung', 'OPERATIONALIZATION'),
      r('L', 'RS-Rang ≥ 80', 'SECONDARY', 'VU-Perzentil', 'VU_EXTENSION'),
      r('M', 'Follow-Through-Tag, Distributionstage', 'SECONDARY', 'fehlt', 'UNBACKED'),
      r('Kauf/Verkauf', 'Pivot + ≥ 40–50 % Volumen, nicht > 5 % darüber; Verlust bei 7–8 % begrenzen', 'SECONDARY', 'fehlt', 'UNBACKED'),
    ],
    missing: ['Gewinne zum Veröffentlichungszeitpunkt', 'Institutionelle Halter (13F)', 'Basismuster', 'Marktrichtung M', 'Ein- und Ausstieg'],
    data: { historical: 'nicht vorhanden (keine Fundamentaldaten zum Stichtag)', live: 'zuletzt berichtete Quartalszahlen (SEC)', gaps: 'Point-in-Time-Fundamentaldaten, 13F' },
    neededMaterial: ['How to Make Money in Stocks (4. Aufl. 2009)', 'Point-in-Time-Fundamentaldaten mit Meldedatum'],
  },
  PIOTROSKI_F: {
    status: 'PARTIAL_CHECK', mechanizable: 'YES',
    mechanizableNote: 'Neun eindeutige Kennzahlen aus zwei Jahresabschlüssen – vollständig mechanisch, aber nur mit Abschlüssen zum damaligen Stand testbar.',
    rules: [
      r('Auswahl', 'Nur das Fünftel mit dem höchsten Buchwert-Kurs-Verhältnis', 'SECONDARY', 'fehlt', 'UNBACKED'),
      r('Score', 'Neun binäre Signale (ROA, CFO, ΔROA, Accrual, ΔVerschuldung, ΔLiquidität, keine Emission, ΔMarge, ΔUmschlag)', 'SECONDARY', 'Teilprüfung mit zuletzt berichteten Werten', 'OPERATIONALIZATION'),
      r('Zeitpunkt', 'Start im 5. Monat nach Geschäftsjahresende, Haltedauer 1 Jahr', 'SECONDARY', 'fehlt', 'UNBACKED'),
    ],
    missing: ['Buchwert-Kurs-Filter', 'Zeitlogik (Meldedatum)', 'Haltedauer'],
    data: { historical: 'nicht vorhanden', live: 'Jahresabschlüsse (SEC), zuletzt berichtet', gaps: 'Abschlüsse zum damaligen Stand' },
    neededMaterial: ['Piotroski (2000), Journal of Accounting Research 38 – Originalaufsatz', 'Point-in-Time-Abschlüsse'],
  },
  GREENBLATT_VALUE: {
    status: 'RESEARCH', mechanizable: 'YES',
    mechanizableNote: 'Die Rangformel ist mechanisch; es fehlen EBIT, Unternehmenswert und Bilanzposten je Stichtag.',
    rules: [
      r('Rang', 'Ertragsrendite EBIT/EV und Kapitalrendite EBIT/(Nettoumlaufvermögen + Sachanlagen), Rangsumme', 'SECONDARY', 'nicht umgesetzt', 'UNBACKED'),
      r('Universum', '≥ 50 Mio. USD, ohne Finanzwerte, Versorger, ausländische Titel', 'SECONDARY', 'nicht umgesetzt', 'UNBACKED'),
      r('Portfolio', '20–30 Aktien, gestaffelt gekauft, rund 1 Jahr gehalten', 'SECONDARY', 'nicht umgesetzt', 'UNBACKED'),
    ],
    missing: ['Alle Rechengrößen je Stichtag', 'Portfolio-Staffelung'],
    data: { historical: 'nicht vorhanden', live: 'Pflichtfelder fehlen', gaps: 'EBIT, Schulden, Barmittel, Sachanlagen je Stichtag' },
    neededMaterial: ['The Little Book That Beats the Market (2005/2010), Anhang'],
  },
});

const COUNT = (rules, cls) => rules.filter((x) => x.cls === cls).length;

export function fidelityFor(id) {
  const f = FIDELITY[id];
  if (!f) return { schema: FIDELITY_VERSION, status: 'RESEARCH', statusLabel: PRODUCT_STATUS.RESEARCH.label, statusPlain: PRODUCT_STATUS.RESEARCH.plain, rules: [], missing: [], counts: {} };
  return {
    schema: FIDELITY_VERSION,
    status: f.status, statusLabel: PRODUCT_STATUS[f.status].label, statusPlain: PRODUCT_STATUS[f.status].plain,
    mechanizable: f.mechanizable, mechanizableNote: f.mechanizableNote,
    rules: f.rules.map((x) => ({ ...x, clsLabel: RULE_CLASS[x.cls].label, accessLabel: SOURCE_ACCESS[x.access] })),
    counts: Object.fromEntries(Object.keys(RULE_CLASS).map((k) => [k, COUNT(f.rules, k)])),
    missing: f.missing, data: f.data, neededMaterial: f.neededMaterial,
  };
}
