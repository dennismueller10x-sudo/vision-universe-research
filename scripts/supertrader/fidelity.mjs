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
  MISSING: { label: 'Fehlt im Code', plain: 'Belegter Baustein der Methode, der im laufenden Modell nicht umgesetzt ist.' },
});

// Belegstufe der Quelle (was in Runde 7 tatsaechlich einsehbar war).
export const SOURCE_ACCESS = Object.freeze({
  PRIMARY_FULL: 'Primärquelle im Volltext gelesen (Runde 8)',
  SECONDARY_QUOTE: 'Wörtliches Zitat aus dem Original in einer Sekundärquelle',
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
      r('Auswahl', 'Trend Template: Kurs über 50/150/200-Tage-Linie, Linien geordnet, 200-Tage-Linie steigt ≥ 1 Monat', 'SECONDARY', 'Kurs über 50/150/200-Tage-Linie, Linien geordnet, 200-Tage-Linie höher als vor 21 Sitzungen', 'OPERATIONALIZATION'),
      r('Auswahl', 'Mindestens 30 % (Buch 2013) bzw. 25 % (ältere Fassung) über dem 52-Wochen-Tief', 'DISPUTED', '1.1.0: 25 % · 2.0.0: 30 %', 'OPERATIONALIZATION'),
      r('Auswahl', 'Höchstens 25 % unter dem 52-Wochen-Hoch', 'SECONDARY', 'Kurs mindestens 75 % des 52-Wochen-Hochs', 'ORIGINAL'),
      r('Auswahl', 'IBD-RS-Rang ≥ 70 (lieber 80–90)', 'SECONDARY', 'VU-Perzentil der gewichteten 3–12-Monats-Rendite ≥ 70', 'VU_EXTENSION', 'IBD-RS ist proprietär.'),
      r('Basis', 'VCP: 2–6 Kontraktionen, jede enger, Volumen trocknet aus, Pivot am Hoch der letzten engen Zone', 'SECONDARY', 'Zickzack 4 %, ≥ 2 fallende Tiefen, erste ≤ 35 %, letzte ≤ 10 %, Volumen 10/50 < 0,8', 'OPERATIONALIZATION', 'Minervini beschreibt die VCP nur qualitativ (X, primär).'),
      r('Einstieg', 'Kauf beim Ausbruch über den Pivot; Volumen deutlich über Durchschnitt', 'PRIMARY_SNIPPET', '1.1.0: Schluss über Pivot ohne Volumenregel · 2.0.0: zusätzlich ≥ 1,4× 50-Tage-Volumen', 'OPERATIONALIZATION', 'Zahl 40–50 % nur sekundär.'),
      r('Stop', 'Stop vor dem Einstieg festlegen; höchstens 10 % Verlust', 'PRIMARY_SNIPPET', 'Kontraktionstief, höchstens 10 % unter Einstieg', 'OPERATIONALIZATION', '10 % aus Schwager-Interview, sekundär.'),
      r('Ausstieg', 'Gewinne nie zu Verlusten werden lassen; Stop auf Einstand', 'PRIMARY_SNIPPET', '1.1.0: fehlt · 2.0.0: Stop auf Einstand ab 3 Anfangsrisiken Gewinn', 'OPERATIONALIZATION', '3R nur sekundär.'),
      r('Ausstieg', 'In die Stärke verkaufen; Bruch der 50-Tage-Linie mit hohem Volumen', 'SECONDARY', '1.1.0: jeder Schluss unter der 50-Tage-Linie (VU) · 2.0.0: nur mit überdurchschnittlichem Volumen', 'OPERATIONALIZATION', '1.1.0 war eine VU-Regel.'),
      r('Positionsgröße', 'Ø 1,25 % Risiko je Trade, höchstens 2,5 %; 25 % Position bei 5 % Stop', 'PRIMARY_SNIPPET', '1.1.0: 0,5 % (VU) · 2.0.0: 1,25 %, max. 25 %', 'ORIGINAL'),
      r('Portfolio', 'Schrittweise Exposition nach Ergebnis der letzten 4–5 Trades', 'PRIMARY_SNIPPET', '2.0.0: halbes Risiko nach netto negativen letzten 5 Trades', 'OPERATIONALIZATION'),
      r('Fundamentaldaten', 'Beschleunigung von Gewinn, Umsatz, Marge über drei Quartale („Code 33“)', 'SECONDARY', 'fehlt', 'MISSING', 'Keine Gewinndaten zum damaligen Stichtag.'),
    ],
    missing: ['Fundamentaldaten (Code 33)', 'Cheat-/Low-Cheat-Einstiege vor dem Pivot', 'Verkauf in die Stärke / Klimax-Signale', 'Diskretionäre Basisbeurteilung', 'Proprietäres Marktmodell'],
    data: { historical: 'Tageskurse aller damals gelisteten US-Aktien ab 2016 (inkl. delisteter)', live: 'Tageskurse ~6.000 US-Aktien, ein Jahr Tageshistorie', gaps: 'keine Gewinne/Umsätze zum Stichtag; kein IBD-RS' },
    sourcesRead: [],
    failedAttempts: ['minervini.com: Bezahlangebot, keine frei lesbaren Regeln (abgerufen 02.10.2026)', 'minervini.com/blog: 404', 'Bücher (2013, 2017): weder frei noch über eine Leihe ohne Konto zugänglich'],
    neededMaterial: ['Trade Like a Stock Market Wizard (2013): Trend Template, VCP, Risiko-Kapitel', 'Think & Trade Like a Champion (2017): Einstiege, Größe, Einstand', 'Schwager, Stock Market Wizards (2001): Minervini-Kapitel (10-%-Grenze)'],
  },
  WEINSTEIN_STAGE: {
    status: 'VU_VARIANT', mechanizable: 'PARTLY',
    mechanizableNote: 'Stufen und Steigung der 30-Wochen-Linie beurteilt Weinstein nach Augenmaß; Gruppenstärke und Marktindikatoren werden gewichtet, ohne feste Zahl.',
    rules: [
      r('Auswahl', 'Vier Stufen, 30-Wochen-Linie; Kauf nur in Stufe 2', 'SECONDARY', 'Stufe aus Steigung (±0,5 %/4 Wochen) und Lage zur Linie', 'OPERATIONALIZATION', 'Keine Steigungszahl im Original.'),
      r('Basis', 'Stufe-1-Basis, Widerstand an der Oberkante', 'SECONDARY', 'Basis ≥ 10 Wochen flache Linie, Kurs ±15 % um die Linie, Widerstand = höchster Wochenschluss', 'OPERATIONALIZATION'),
      r('Basis', '—', 'NONE', '1.1.0: Setup verworfen, sobald die Linie vor dem Ausbruch steigt · 2.0.0: Basis bleibt bis Ausbruch/Bruch', 'UNBACKED', 'Umsetzungsfehler in 1.1.0: verwarf in der lokalen Probe die Hälfte der Basen.'),
      r('Einstieg', 'Kauf per Buy-Stop knapp über dem Widerstand („If you have purchased it with a buy-stop order …“)', 'SECONDARY_QUOTE', 'bis 2.0.0: Wochenschluss über dem höchsten Wochenschluss, Kauf zur nächsten Woche · 3.0.0: Kauf-Stop über dem Tageshoch der Basis', 'OPERATIONALIZATION', 'Bis 2.0.0 Übertragungsfehler.'),
      r('Einstieg', 'Ohne deutlichen Volumenanstieg meiden; mit Buy-Stop gekauft: beim ersten Anstieg mit schnellem Gewinn verkaufen', 'SECONDARY_QUOTE', '3.0.0: Volumen der Ausbruchswoche < 2× → Verkauf beim ersten Schluss über dem Einstieg', 'OPERATIONALIZATION'),
      r('Einstieg', 'Ausbruchsvolumen mindestens doppelt so hoch wie der Schnitt der Vorwochen', 'SECONDARY', '1.1.0: 1,5× zehn Wochen (VU) · 2.0.0: 2× vier Wochen', 'OPERATIONALIZATION'),
      r('Relative Stärke', 'Nie mit negativer RS kaufen (Mansfield-RS, Nulllinie)', 'SECONDARY', '1.1.0: 13-Wochen-Anstieg (VU) · 2.0.0: Mansfield-RS > 0', 'OPERATIONALIZATION'),
      r('Marktfilter', '„Forest to the trees“: erst Markt, dann Gruppe, dann Aktie', 'SECONDARY', '1.1.0: fehlt · 2.0.0: SPY über nicht fallender 30-Wochen-Linie; Gruppe fehlt', 'OPERATIONALIZATION'),
      r('Stop', 'Unter dem bedeutenden Tief unter dem Ausbruch, nicht auf runden Zahlen', 'SECONDARY', '2 % unter der Basis; Rundungsregel fehlt', 'OPERATIONALIZATION'),
      r('Ausstieg', 'Investor: Stop nachziehen unter Korrekturtiefs/30-Wochen-Linie; raus spätestens in Stufe 4', 'SECONDARY', '1.1.0: Stop 2 % unter der Linie im Wochenverlauf (VU) + Wochenschluss darunter · 2.0.0: nur Wochenschluss unter der Linie', 'OPERATIONALIZATION'),
      r('Positionsgröße', 'Halbe Position beim Ausbruch, Rest beim Rücksetzer', 'SECONDARY', 'fehlt (VU-Standard 0,5 % Risiko)', 'VU_EXTENSION'),
    ],
    chain: [
      { step: 'Deep Research', text: 'Stufen, 30-Wochen-Linie, Volumen und relative Stärke genannt; Buch nicht zugänglich.' },
      { step: 'Code bis 2.0.0', text: 'Wochenschluss-Bestätigung und Kauf zur nächsten Woche; der Widerstand war der höchste Wochenschluss.' },
      { step: 'Fehlerart', text: 'Übertragungsfehler: das Buch spricht vom Kauf per Buy-Stop (wörtlich bei Bulkowski zitiert).' },
      { step: 'Wirkung', text: 'Einstieg bis zu einer Woche später und höher; die Volumenregel wirkte als Filter vor dem Kauf statt als Ausstiegsgrund danach. Die Gegenprobe trägt diese Teilursache: Mit Kauf-Stop und Volumenregel nach dem Kauf schneidet jedes Signal in beiden Teilzeiträumen besser ab. Einen Vorteil gegenüber dem Gesamtmarkt belegt das nicht.' },
    ],
    sourcesRead: ['Bulkowski, thepatternsite.com: Trading Weinstein, Weinstein Stops (mit Buchzitaten)', 'stageanalysis.net: Breakout Quality Checklist (mit Buchzitaten)'],
    missing: ['Gruppen-/Sektorstufe', 'Langfristige Marktindikatoren (A/D-Linie, Momentum-Index)', 'Halbposition + Rücksetzer-Kauf', 'Rundungsregel für Stops', 'Leerverkauf in Stufe 4'],
    data: { historical: 'Wochenreihen aus Point-in-Time-Tagesbalken ab 2016, SPY-Wochenschluss', live: 'Lange Wochenschlusskurse + ein Jahr Tagesbalken (Wochenvolumen nur im Tagesfenster)', gaps: 'keine Gruppenzuordnung zum Stichtag; keine Marktbreite' },
    neededMaterial: ['Secrets for Profiting in Bull and Bear Markets (1988): Kapitel Kaufzeitpunkt, Verkauf, Langfristindikatoren', 'Stocks & Commodities Interview V.39:11 (2021)'],
  },
  MOMENTUM_BREAKOUT: {
    status: 'VU_VARIANT',
    sameDayFinding: 'MOSTLY_EXIT', // Runde 9: interne Minutenprüfung strittiger Kauf-Stop-Tage mechanizable: 'PARTLY',
    mechanizableNote: 'Kullamägi kauft am Hoch der ersten Minuten (Opening Range). Er erlaubt ausdrücklich den Einstieg nach Tageschart („just look at the daily chart and enter when the stock is starting to break out“) – das bildet 3.x ab. Sein Stop am Tagestief hängt davon ab, wann im Tagesverlauf gekauft wird; das ist nur mit Minutenkursen prüfbar (intern ab 2017 vorhanden, nur Börse IEX – ein einzelner Handelsplatz ohne Eröffnungsauktion). Die Basisqualität beurteilt er nach Augenmaß.',
    chain: [
      { step: 'Deep Research', text: 'Gab Auswahl, Basis, Einstieg am Opening-Range-Hoch, Stop am Tagestief (≤ ADR), Teilverkauf und Trailing korrekt wieder.' },
      { step: 'Code bis 2.0.0', text: 'Einstieg erst nach Tagesschluss über dem Trigger, Kauf zur nächsten Eröffnung; Stop am Tief des Vortags; Gap-Sperre 0,5 ADR (nicht in der Quelle); Höchstgewicht 20 % statt bis 25 %.' },
      { step: 'Fehlerart', text: 'Übertragungsfehler in den Code: eine allgemeine VU-Konvention (Schlusskurs-Bestätigung) ersetzte den belegten Einstieg. Kein Lesefehler der Recherche.' },
      { step: 'Wirkung', text: 'Späterer, höherer Einstieg; Stop bezieht sich auf einen anderen Tag; Ausbrüche mit großem Gap fehlten. Die vorab festgelegte Gegenprobe (gleiche Regeln, alter Einstieg) zeigt aber: Der Einstiegszeitpunkt erklärt die schwachen historischen Ergebnisse nicht. Auch quellennah bleibt die Methode ohne nachgewiesenen Vorteil.' },
    ],
    rules: [
      r('Auswahl', 'Die 1–2 % stärksten Aktien über 1, 3, 6 Monate', 'PRIMARY_FULL', 'Perzentil ≥ 98 über 1/3/6 Monate', 'ORIGINAL'),
      r('Basis', 'Vorlauf 30–100 % in 1–3 Monaten, 2 Wochen bis 2 Monate geordnete Konsolidierung mit höheren Tiefs; der Kurs „surft“ die steigende 10- und 20-Tage-Linie', 'PRIMARY_FULL', 'Vorlauf ≥ 30 %, Basis 10–40 Sitzungen, Tiefe ≤ 25 %, höhere Tiefs, enger werdende Spanne · bis 3.0.0: Kurs über beiden Linien, Setup endet bei einem Schluss darunter, dann 5 Sitzungen Sperre · 3.1.0: über mindestens einer Linie, keine Sperre', 'OPERATIONALIZATION', 'Tiefe 25 % und der Basis-Algorithmus sind VU. Die strengere Linienregel und die Sperre bis 3.0.0 waren VU-Zusätze – an ihnen scheiterte Kullamägis TSLA-Beispiel (Juni 2020).'),
      r('Einstieg', 'Opening-Range-Hoch (1/5/60 Min.) oder nach Tageschart „when the stock is starting to break out“', 'PRIMARY_FULL', '2.0.0: Schluss über dem 5-Tage-Hoch, Kauf zur nächsten Eröffnung · 3.0.0: Kauf-Stop am 5-Tage-Hoch im Tagesverlauf', 'OPERATIONALIZATION', 'Bis 2.0.0 Umsetzungsfehler (Schlusskurs-Konvention). Trigger = 5-Tage-Hoch ist VU.'),
      r('Stop', '„Stop is always lows of the day“, nicht weiter als ATR/ADR – gemeint ist das Tief bis zum Kauf', 'PRIMARY_FULL', '2.0.0: Tief des Bestätigungstags · ab 3.0.0: Tagestief des Einstiegstags, höchstens 1 ADR', 'OPERATIONALIZATION', 'Mit Tageskursen nur angenähert: Eine interne Prüfung mit IEX-Minutenkursen (2017–2026, ein Handelsplatz) zeigt, dass das Tagestief oft erst nach dem Kauf entsteht. Dann lag der echte Stop höher und wurde noch am Kauftag erreicht. Historische Ergebnisse auf Tagesbasis sind für diese Methode deshalb zu günstig; die Minutenprüfung ist die maßgebliche Lesart.'),
      r('Gap', 'keine Gap-Regel in der Quelle', 'PRIMARY_FULL', '2.0.0: Gap > 0,5 ADR ausgelassen · 3.0.0: keine Sperre', 'ORIGINAL', 'Die Sperre bis 2.0.0 war eine unbelegte VU-Annahme.'),
      r('Ausstieg', '1/3–1/2 nach 3–5 Tagen verkaufen, Stop auf Einstand', 'PRIMARY_FULL', '1/3 nach 3 Sitzungen, Rest auf Einstand', 'ORIGINAL'),
      r('Ausstieg', 'Rest mit der 10/20-Tage-Linie; Anfänger: erster Schluss unter der 10-Tage-Linie', 'PRIMARY_FULL', '1.1.0: 10-Tage-Ausstieg ab Tag 1 für die ganze Position · ab 2.0.0: nur für den Rest', 'ORIGINAL', 'Umsetzungsfehler in 1.1.0, in 2.0.0 korrigiert – im Test fast ohne Wirkung.'),
      r('Positionsgröße', 'Risiko meist 0,3–0,5 %, selten > 1 %; Positionen meist 10–20 %, „generally 5%-25%“; nie > 30 % über Nacht', 'PRIMARY_FULL', '0,5 % Risiko · 2.0.0: max. 20 % · 3.0.0: max. 25 %', 'ORIGINAL'),
      r('Portfolio', 'keine Höchstzahl genannt', 'PRIMARY_FULL', 'max. 10 Positionen', 'VU_EXTENSION'),
      r('Marktfilter', 'keine schriftliche Regel auf seiner Website', 'PRIMARY_FULL', 'kein Filter', 'ORIGINAL', 'Bewusst nicht ergänzt – eine Regel aus Streams/Tweets ist nicht belegt.'),
      r('Liquidität', 'keine Vorgabe der Methode', 'NONE', 'Kurs ≥ 5 USD, 5 Mio. USD Tagesumsatz, ADR ≥ 2 %', 'VU_EXTENSION'),
    ],
    missing: ['Einstieg am Opening-Range-Hoch der ersten Minuten (Intraday-Historie fehlt)', 'Episodic Pivots als eigenes Modell (Gap-Ursache und Analystenschätzungen fehlen)', 'Parabolic Shorts'],
    data: { historical: 'Tageskurse ab 2016 (inkl. delisteter)', live: 'Tageskurse', gaps: 'keine Intraday-Historie; keine Nachrichten-/Schätzungsdaten' },
    neededMaterial: ['Konsolidierte Minutenkurse aller Börsen inkl. Eröffnungsauktion (mit dem bestehenden Zugang nicht verfügbar: der Mehrbörsen-Endpunkt liefert dieselben IEX-Werte) für den Opening-Range-Einstieg'],
    examples: [
      { case: 'AXON (AAXN), Ausbruch 09.01.2004', role: 'Unabhängig – für keine Regel verwendet', result: 'Version 3.1.0 kauft genau am markierten Tag; 3.0.0 verfehlte ihn (Setup endete am Vortag wegen eines Schlusses unter der 10-Tage-Linie).' },
      { case: 'MNKD, Ausbruch 10.05.2013', role: 'Unabhängig – für keine Regel verwendet', result: 'Verfehlt (3.0.0 und 3.1.0): Nach einem Monat Seitwärtsbewegung stieg die 20-Tage-Linie nicht mehr; die Trendregel war nicht erfüllt. Keine Regeländerung, um das Beispiel nicht nachträglich passend zu machen.' },
      { case: 'TSLA, Ausbruch 01.06.2020', role: 'Entwicklungsbeispiel – zählt nicht als Bestätigung', result: 'Version 3.1.0 kauft einen Handelstag früher: Am 29.05. wurde der Trigger erst kurz vor Handelsschluss knapp überschritten. Der eigentliche Ausbruch mit Kurslücke kam am 01.06.' },
      { case: 'NVDA, Episodic Pivots 2016/2017', role: 'Regelidentität (kein laufendes Modell)', result: 'Die 10-%-Gap-Regel ordnet alle drei Tage so ein wie Kullamägi.' },
    ],
    sourcesRead: ['qullamaggie.com: „3 TIMELESS setups“ (08.01.2021) mit allen Beispielcharts', 'qullamaggie.com: FAQ', 'qullamaggie.com: „How to master a setup: Episodic Pivots“'],
  },
  DARVAS_BOX: {
    status: 'VU_VARIANT',
    sameDayFinding: 'MOSTLY_HOLD', // Runde 9: interne Minutenprüfung strittiger Kauf-Stop-Tage mechanizable: 'PARTLY',
    mechanizableNote: 'Was eine Box ist, beschreibt Darvas nicht als Formel; die verbreitete 3-Tage-Regel ist eine spätere Rekonstruktion. Sein Buch (1960) ist nicht frei zugänglich.',
    chain: [
      { step: 'Deep Research', text: 'Nannte Box, Kauf über der Oberkante und Stop-Loss; die Zeitungsquelle war in Runde 7 nur als Auszug lesbar.' },
      { step: 'Code bis 2.0.0', text: 'Kauf erst nach Tagesschluss über der Oberkante zur nächsten Eröffnung; Stop bis 1.2.0 an der Unterkante, 2.0.0 knapp unter der Oberkante – mit Schlusskurs-Einstieg liegt dieser Stop oft schon unter dem Kaufkurs des Vortags.' },
      { step: 'Fehlerart', text: 'Übertragungsfehler: Darvas „places buy orders at breakout points“ (TIME 1959) – eine Kauforder, keine Schlusskurs-Bestätigung.' },
      { step: 'Wirkung', text: '2.0.0 kombinierte einen engen Stop (an der Kauforder) mit einem späten Einstieg (nächste Eröffnung). 3.0.0 setzt Order und Stop wie beschrieben zusammen und schneidet je Signal besser ab – doch ein Stop 1 % unter der Kauforder liegt meist innerhalb der Tagesspanne: Ob er am Kauftag hielt, zeigen Tageskurse nicht. Eine interne Prüfung mit IEX-Minuten zeigt: Die neutrale Annahme (Tief vor dem Kauf) trifft öfter zu, aber ein erheblicher Teil der strittigen Tage endet tatsächlich am Kauftag.' },
    ],
    rules: [
      r('Auswahl', 'Aktien, die mit starkem Volumen gut steigen; Wachstumsunternehmen, deren Gewinne sich verdoppeln oder verdreifachen könnten', 'PRIMARY_FULL', 'Nahe 52-Wochen-Hoch + 6-Monats-Perzentil ≥ 80; Gewinnfilter fehlt', 'OPERATIONALIZATION'),
      r('Basis', 'Box: Kurs pendelt zwischen Ober- und Unterkante', 'SECONDARY', 'Oberkante/Unterkante je 3 Sitzungen bestätigt, Höhe 3–25 %', 'VU_EXTENSION', '3-Tage-Regel nur sekundär.'),
      r('Einstieg', '„places buy orders at breakout points“', 'PRIMARY_FULL', 'bis 2.0.0: Schluss über der Oberkante, Kauf zur nächsten Eröffnung · 3.0.0: Kauforder an der Oberkante im Tagesverlauf', 'ORIGINAL', 'Bis 2.0.0 Umsetzungsfehler.'),
      r('Stop', 'Stop-Loss „just below his buy order“', 'PRIMARY_FULL', '1.2.0: Boxunterkante · ab 2.0.0: 1 % unter der Oberkante', 'OPERATIONALIZATION', '1 % ist VU für „knapp“.'),
      r('Ausstieg', 'Mit großem Gewinn: Stop knapp unter die Marke, an der eine fallende Aktie Halt finden sollte', 'PRIMARY_FULL', 'Nachziehen an jede neue bestätigte Boxunterkante', 'OPERATIONALIZATION'),
      r('Portfolio', 'fünf bis sechs Aktien gleichzeitig', 'PRIMARY_FULL', 'bis 2.0.0: 10 (VU) · 3.0.0: 6', 'ORIGINAL'),
      r('Positionsgröße', 'Aufstocken in steigende Boxen', 'SECONDARY', 'fehlt (VU-Standard 0,5 % Risiko)', 'VU_EXTENSION'),
    ],
    missing: ['Gewinnfilter („earnings could double or treble“) – keine Gewinne zum Stichtag', 'Volumenschwelle (keine Zahl belegt)', 'Pyramiding'],
    data: { historical: 'Tageskurse ab 2016', live: 'Tageskurse', gaps: 'keine Gewinndaten zum Stichtag' },
    neededMaterial: ['How I Made $2,000,000 in the Stock Market (1960): Boxdefinition und Volumen – über die Ausleihe des Internet Archive nur mit Konto, nicht frei abrufbar'],
    sourcesRead: ['TIME, 25.05.1959, „Business: Pas de Dough“', 'TIME, 01.08.1960, „The Darvas Effect“'],
  },
  DONCHIAN_TURTLE: {
    status: 'VU_VARIANT',
    sameDayFinding: 'MOSTLY_EXIT', // Runde 9: interne Minutenprüfung strittiger Kauf-Stop-Tage mechanizable: 'YES',
    mechanizableNote: 'Die Turtle-Regeln sind vollständig mechanisch und liegen im Volltext vor – geschrieben für ein gestreutes Futures-Portfolio, nicht für Einzelaktien.',
    chain: [
      { step: 'Deep Research', text: 'System 1/2, 2N-Stop, 10-Tage-Ausstieg, Unit-Größe und Filter korrekt genannt (Sekundärquellen).' },
      { step: 'Code bis 1.1.0', text: 'Schlusskurs-Bestätigung + Kauf zur nächsten Eröffnung, Ausstieg nach Schluss unter dem 10-Tage-Tief zur nächsten Eröffnung, N als einfaches Mittel, kein Filter, 0,5 % Risiko statt 1 % je N, 10 Positionen.' },
      { step: 'Fehlerart', text: 'Übertragungsfehler und ausgelassene Bausteine. Das Original sagt wörtlich: „did not wait until the daily close or the open of the following day“.' },
      { step: 'Wirkung', text: 'Einstieg und Ausstieg je einen Tag zu spät, andere Positionsgröße, Gewinner-Filter fehlte. 2.0.0 bildet System 1 ab (ohne Nachkaufen). Die Signale schneiden je Trade fast gleich ab wie 1.1.0; die Original-Größe (1 % je N) hält das Aktienportfolio aber fast immer voll investiert in gleichgerichteten Ausbrüchen – für gestreute Futures geschrieben, auf Einzelaktien deutlich verlustreicher (Hinweis, keine bewiesene Ursache).' },
    ],
    rules: [
      r('Einstieg', 'System 1: Kurs überschreitet das 20-Tage-Hoch um einen Tick; im Tagesverlauf, bei Gap zur Eröffnung', 'PRIMARY_FULL', 'bis 1.1.0: Schluss über dem 20-Tage-Hoch, Kauf zur nächsten Eröffnung · 2.0.0: Kauf-Stop im Tagesverlauf', 'ORIGINAL', 'Bis 1.1.0 Umsetzungsfehler.'),
      r('Einstieg', 'Ausbruch auslassen, wenn der letzte Ausbruch ein Gewinner gewesen wäre; dann 55-Tage-Failsafe', 'PRIMARY_FULL', 'bis 1.1.0: fehlt · 2.0.0: gedachte System-1-Trades als Filter, 55-Tage-Failsafe; laufender gedachter Trade zählt wie Gewinner', 'OPERATIONALIZATION', 'Behandlung des noch laufenden gedachten Trades ist VU.'),
      r('Volatilität', 'N = (19 × N des Vortags + True Range) / 20', 'PRIMARY_FULL', 'bis 1.1.0: 20-Tage-Mittel · 2.0.0: Formel des Originals', 'ORIGINAL'),
      r('Stop', '2N unter dem Einstieg', 'PRIMARY_FULL', '2N unter dem tatsächlichen Einstieg', 'ORIGINAL'),
      r('Ausstieg', 'System 1: 10-Tage-Tief, Order sobald der Kurs die Marke durchschreitet', 'PRIMARY_FULL', 'bis 1.1.0: Schluss darunter, Verkauf zur nächsten Eröffnung · 2.0.0: an der Marke im Tagesverlauf', 'ORIGINAL'),
      r('Positionsgröße', 'Unit = 1 % des Kontos je N; notionelles Konto −20 % je 10 % Verlust', 'PRIMARY_FULL', 'bis 1.1.0: 0,5 % Risiko · 2.0.0: 1 % je N, notionelles Konto', 'ORIGINAL'),
      r('Positionsgröße', 'Nachkaufen bis 4 Units im Abstand ½ N, Stops nachziehen', 'PRIMARY_FULL', 'fehlt', 'MISSING', 'Der Simulator führt eine Position je Signal.'),
      r('Portfolio', '4 Units je Markt, 6/10 je korrelierter Gruppe, 12 je Richtung', 'PRIMARY_FULL', 'bis 1.1.0: 10 Positionen · 2.0.0: 12 Titel, keine Korrelationsgruppen, ohne Hebel', 'OPERATIONALIZATION'),
      r('Universum', 'Futures-Liste (Anleihen, Währungen, Rohstoffe, Aktienindex)', 'PRIMARY_FULL', 'Liquide US-Aktien ≥ 10 USD, 20 Mio. USD Umsatz', 'VU_EXTENSION', 'Grundsätzliche Übertragung auf eine andere Anlageklasse.'),
    ],
    missing: ['Nachkaufen bis 4 Units', 'Korrelationsgrenzen', 'System 2 (55/20 Tage)', 'Leerverkauf'],
    data: { historical: 'Tageskurse ab 2016', live: 'Tageskurse', gaps: 'keine' },
    neededMaterial: [],
    sourcesRead: ['The Original Turtle Trading Rules, PDF (tradingblox.com), 27 Seiten'],
  },
  CANSLIM: {
    status: 'PARTIAL_CHECK', mechanizable: 'PARTLY',
    mechanizableNote: 'C, A und L haben Zahlen; N, S und I sind Ermessen; M (Follow-Through-Tage, Distributionstage) ist mechanisch, aber nicht umgesetzt.',
    rules: [
      r('C', 'Quartals-EPS ≥ 25 % ggü. Vorjahr, Umsatz ≥ 25 % oder beschleunigt', 'SECONDARY', 'Teilprüfung mit zuletzt berichteten Werten', 'OPERATIONALIZATION'),
      r('A', 'Jahres-EPS ≥ 25 % in drei Jahren, Eigenkapitalrendite ≥ 17 %', 'SECONDARY', 'Teilprüfung', 'OPERATIONALIZATION'),
      r('L', 'RS-Rang ≥ 80', 'SECONDARY', 'VU-Perzentil', 'VU_EXTENSION'),
      r('M', 'Follow-Through-Tag, Distributionstage', 'SECONDARY', 'fehlt', 'MISSING'),
      r('Kauf/Verkauf', 'Pivot + ≥ 40–50 % Volumen, nicht > 5 % darüber; Verlust bei 7–8 % begrenzen', 'SECONDARY', 'fehlt', 'MISSING'),
    ],
    missing: ['Gewinne zum Veröffentlichungszeitpunkt', 'Institutionelle Halter (13F)', 'Basismuster', 'Marktrichtung M', 'Ein- und Ausstieg'],
    data: { historical: 'nicht vorhanden (keine Fundamentaldaten zum Stichtag)', live: 'zuletzt berichtete Quartalszahlen (SEC)', gaps: 'Point-in-Time-Fundamentaldaten, 13F' },
    neededMaterial: ['How to Make Money in Stocks (4. Aufl. 2009)', 'Point-in-Time-Fundamentaldaten mit Meldedatum'],
  },
  PIOTROSKI_F: {
    status: 'PARTIAL_CHECK', mechanizable: 'YES',
    mechanizableNote: 'Neun eindeutige Kennzahlen aus zwei Jahresabschlüssen – vollständig mechanisch, aber nur mit Abschlüssen zum damaligen Stand testbar.',
    rules: [
      r('Auswahl', 'Nur das Fünftel mit dem höchsten Buchwert-Kurs-Verhältnis', 'SECONDARY', 'fehlt', 'MISSING'),
      r('Score', 'Neun binäre Signale (ROA, CFO, ΔROA, Accrual, ΔVerschuldung, ΔLiquidität, keine Emission, ΔMarge, ΔUmschlag)', 'SECONDARY', 'Teilprüfung mit zuletzt berichteten Werten', 'OPERATIONALIZATION'),
      r('Zeitpunkt', 'Start im 5. Monat nach Geschäftsjahresende, Haltedauer 1 Jahr', 'SECONDARY', 'fehlt', 'MISSING'),
    ],
    missing: ['Buchwert-Kurs-Filter', 'Zeitlogik (Meldedatum)', 'Haltedauer'],
    data: { historical: 'nicht vorhanden', live: 'Jahresabschlüsse (SEC), zuletzt berichtet', gaps: 'Abschlüsse zum damaligen Stand' },
    neededMaterial: ['Piotroski (2000), Journal of Accounting Research 38 – Originalaufsatz', 'Point-in-Time-Abschlüsse'],
  },
  GREENBLATT_VALUE: {
    status: 'RESEARCH', mechanizable: 'YES',
    mechanizableNote: 'Die Rangformel ist mechanisch; es fehlen EBIT, Unternehmenswert und Bilanzposten je Stichtag.',
    rules: [
      r('Rang', 'Ertragsrendite EBIT/EV und Kapitalrendite EBIT/(Nettoumlaufvermögen + Sachanlagen), Rangsumme', 'SECONDARY', 'nicht umgesetzt', 'MISSING'),
      r('Universum', '≥ 50 Mio. USD, ohne Finanzwerte, Versorger, ausländische Titel', 'SECONDARY', 'nicht umgesetzt', 'MISSING'),
      r('Portfolio', '20–30 Aktien, gestaffelt gekauft, rund 1 Jahr gehalten', 'SECONDARY', 'nicht umgesetzt', 'MISSING'),
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
    schema: FIDELITY_VERSION, chain: f.chain || [], sameDayFinding: f.sameDayFinding || null, examples: f.examples || [], sourcesRead: f.sourcesRead || [], failedAttempts: f.failedAttempts || [],
    status: f.status, statusLabel: PRODUCT_STATUS[f.status].label, statusPlain: PRODUCT_STATUS[f.status].plain,
    mechanizable: f.mechanizable, mechanizableNote: f.mechanizableNote,
    rules: f.rules.map((x) => ({ ...x, clsLabel: RULE_CLASS[x.cls].label, accessLabel: SOURCE_ACCESS[x.access] })),
    counts: Object.fromEntries(Object.keys(RULE_CLASS).map((k) => [k, COUNT(f.rules, k)])),
    missing: f.missing, data: f.data, neededMaterial: f.neededMaterial,
  };
}
