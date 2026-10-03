// Supertrader — Prozesskette je Methode (Runde 12): Quelle → historische Daten → Kandidat → Rang →
// Einstieg → Portfolioplatz → Positionsgröße → Halten → Ausstieg → Portfoliorendite.
// Je Schritt: Regel im Code (laufende Version), Quelle und Einordnung:
//   ORIGINAL            steht so in einer Primärquelle des Traders
//   DOCUMENTED_VARIANT  steht so in einer öffentlich beschriebenen Variante eines Dritten
//   OPERATIONALIZATION  belegte Regel, mechanisch übersetzt
//   VU_EXTENSION        Annahme/Ergänzung von Vision Universe
//   MISSING             belegter Baustein, im Code nicht umgesetzt
// "finding" fasst die Fallprüfungen R10/R11 zusammen (warum große Gewinner fehlten) – ohne Kennzahlen.

const S = (step, rule, source, cls) => ({ step, rule, source, cls });
export const STEPS = ['Quelle', 'Historische Daten', 'Kandidat', 'Rang', 'Einstieg', 'Portfolioplatz', 'Positionsgröße', 'Halten', 'Ausstieg', 'Portfoliorendite'];
const DATA = S('Historische Daten', 'Tageskurse 2016–2026 aller damals gelisteten US-Aktien inklusive delisteter Titel (Point-in-Time), ohne ETFs/ETNs/Fonds; live Tageskurse.', 'VU-Datenstrecke (privat)', 'VU_EXTENSION');

export const PROCESS_CHAIN = Object.freeze({
  MOMENTUM_BREAKOUT: { version: '3.2.0', steps: [
    S('Quelle', 'Kullamägi, „3 timeless setups“ und FAQ (Volltext)', 'qullamaggie.com', 'ORIGINAL'), DATA,
    S('Kandidat', 'Top 2 % Momentum über 1/3/6 Monate, ≥ 30 % Vorlauf, Kurs „surft“ steigende 10/20-Tage-Linie; enge Basis 10–40 Sitzungen ≤ 25 % (Basisformel VU)', 'Kullamägi; Basisalgorithmus VU', 'OPERATIONALIZATION'),
    S('Rang', 'Gleichzeitige Einstiege nach relativer Stärke am Vortag', 'VU (R10, Kullamägi: „die stärksten 1–2 %“)', 'VU_EXTENSION'),
    S('Einstieg', 'Kauf-Stop am 5-Tage-Hoch im Tagesverlauf (Original: Opening-Range-Hoch)', 'Kullamägi: „enter when the stock is starting to break out“', 'OPERATIONALIZATION'),
    S('Portfolioplatz', 'Höchstens 10 Positionen', 'keine Höchstzahl in der Quelle', 'VU_EXTENSION'),
    S('Positionsgröße', '0,5 % Risiko je Trade ÷ Stopabstand, höchstens 25 % je Titel', 'FAQ: 0,3–0,5 % Risiko, 5–25 % Gewicht', 'ORIGINAL'),
    S('Halten', 'Nach 3 Tagen 1/3 verkaufen; Stop auf Einstand erst bei Schluss über dem Einstieg (3.2.0)', '„sell 1/3 to 1/2 after 3-5 days, move the stop to break even“', 'ORIGINAL'),
    S('Ausstieg', 'Stop am Tagestief des Kauftags (≤ 1 ADR); Rest beim ersten Schluss unter der 10-Tage-Linie', '„Stop is always lows of the day“; „first CLOSE below the 10-day“', 'ORIGINAL'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung 2016–2026: kein Vorteil gegenüber SPY (intern, ohne veröffentlichte Kennzahlen)', 'PREREGISTRATION-R8 … R11', 'VU_EXTENSION'),
  ], finding: 'Viele große Gewinner wurden nie Kandidat (kein Top-2-%-Rang oder keine enge Basis zum richtigen Zeitpunkt). Wer aufgenommen wurde, endete meist nach wenigen Tagen am Stop des Kauftags – das ist Kullamägis eigene Regel. Bis 3.1.0 verkaufte zusätzlich ein Implementierungsfehler den Rest zu früh (behoben in 3.2.0).' },
  WEINSTEIN_STAGE: { version: '3.0.0', steps: [
    S('Quelle', 'Weinstein, Secrets for Profiting in Bull and Bear Markets (über stageanalysis.net mit Buchzitaten)', 'Sekundär mit wörtlichen Zitaten', 'ORIGINAL'), DATA,
    S('Kandidat', 'Stufe-1-Basis (flache 30-Wochen-Linie), Ausbruch in Stufe 2; relative Stärke > 0; Wochenvolumen ≥ 2× Schnitt', 'Weinstein', 'OPERATIONALIZATION'),
    S('Rang', 'Relative Stärke am Vortag', 'VU (R10)', 'VU_EXTENSION'),
    S('Einstieg', 'Kauf-Stop über dem Widerstand im Tagesverlauf', 'Weinstein: Buy-Stop über dem Widerstand', 'ORIGINAL'),
    S('Portfolioplatz', 'Höchstens 10 Positionen', 'keine Zahl in der Quelle', 'VU_EXTENSION'),
    S('Positionsgröße', '0,5 % Risiko ÷ Stopabstand, höchstens 20 %', 'VU-Standard', 'VU_EXTENSION'),
    S('Halten', 'Stop wöchentlich 2 % unter die steigende 30-Wochen-Linie nachziehen; schwaches Ausbruchsvolumen → Verkauf beim ersten Gewinn', 'Weinstein', 'ORIGINAL'),
    S('Ausstieg', 'Wochenschluss unter der 30-Wochen-Linie', 'Weinstein', 'ORIGINAL'),
    S('Fortsetzungskauf', 'Fortsetzungsausbrüche in Stufe 2 (Version 4.0.0 gebaut, verfehlte eine Übernahmebedingung knapp – Forschung)', 'stageanalysis.net Checkliste', 'MISSING'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung: kein Vorteil gegenüber SPY', 'PREREGISTRATION-R8B … R11', 'VU_EXTENSION'),
  ], finding: 'Die meisten großen Gewinner waren bereits in Stufe 2; 3.0.0 sucht nur Stufe-1-Basen und fand sie deshalb nicht. Fortsetzungskäufe (4.0.0) brachten erstmals Einstiege, bestanden aber die Vollportfolio-Bedingung nicht.' },
  DARVAS_BOX: { version: '3.0.2', steps: [
    S('Quelle', 'TIME 25.05.1959 und 01.08.1960 (Volltext); Buch 1960 nicht frei zugänglich', 'TIME', 'ORIGINAL'), DATA,
    S('Kandidat', 'Nahe 52-Wochen-Hoch, 6-Monats-Stärke ≥ 80. Perzentil, Box mit bestätigter Ober- und Unterkante (3-Tage-Regel nur sekundär)', 'Darvas: Aktien, die mit Volumen gut steigen; Box-Formel VU', 'VU_EXTENSION'),
    S('Rang', 'Relative Stärke am Vortag', 'VU (R10)', 'VU_EXTENSION'),
    S('Einstieg', 'Kauforder an der Boxoberkante im Tagesverlauf', '„places buy orders at breakout points“', 'ORIGINAL'),
    S('Portfolioplatz', 'Fünf bis sechs Titel; Höchstgewicht 1/6 (3.0.1); Marktampel: keine neue Position bei SPY unter GD 200 (3.0.2)', '„five or six stocks at a time“; Ampel aus dokumentierter Drittvariante', 'ORIGINAL'),
    S('Positionsgröße', '0,5 % Risiko ÷ Stopabstand', 'VU-Standard', 'VU_EXTENSION'),
    S('Halten', 'Stop an jede höhere bestätigte Boxunterkante nachziehen', 'Darvas (TIME 1960)', 'OPERATIONALIZATION'),
    S('Ausstieg', 'Stop 1 % unter der Kauforder, später an der Boxunterkante', '„just below his buy order“', 'OPERATIONALIZATION'),
    S('Gewinnfilter', 'Gewinne „could double or treble“ – nicht umgesetzt', 'TIME 1959', 'MISSING'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung: kein Vorteil gegenüber SPY', 'PREREGISTRATION-R8B, R10', 'VU_EXTENSION'),
  ], finding: 'Viele Gewinner wurden Kandidat, aber der Stop 1 % unter der Kauforder liegt meist in der normalen Tagesschwankung: Gewinner wurden nach Tagen ausgestoppt und Plätze vergeben, bevor der Trend lief. Bis 3.0.0 bekam außerdem der sechste Titel keinen vollen Platz (behoben).' },
  MINERVINI_VCP: { version: '2.0.0', steps: [
    S('Quelle', 'Minervini-Interviews und eigene Beiträge (Volltext), Trend Template; Bücher nur sekundär', 'minervini.com, Interviews', 'ORIGINAL'), DATA,
    S('Kandidat', 'Trend Template (Kurs über 50/150/200-Tage-Linie, ≥ 30 % über Tief, ≤ 25 % unter Hoch, RS ≥ 70) und VCP-Erkennung (VU-Formel)', 'Minervini; VCP-Formel VU', 'OPERATIONALIZATION'),
    S('Rang', 'Relative Stärke am Vortag', 'VU (R10); Minervini bevorzugt RS 80–90', 'VU_EXTENSION'),
    S('Einstieg', 'Schluss über dem Pivot mit ≥ 1,4× Volumen, Kauf zur nächsten Eröffnung', 'Minervini: Kauf am Pivot mit Volumen', 'OPERATIONALIZATION'),
    S('Portfolioplatz', 'Höchstens 10 Positionen', 'keine feste Zahl belegt', 'VU_EXTENSION'),
    S('Positionsgröße', 'Risiko je Trade ÷ Stopabstand; Stop höchstens 10 %', 'Minervini: Verlust begrenzen, meist 7–8 %', 'OPERATIONALIZATION'),
    S('Halten', 'Halten über der 50-Tage-Linie', 'VU (kein belegter Halteausstieg)', 'VU_EXTENSION'),
    S('Ausstieg', 'Stop oder Schluss unter der 50-Tage-Linie; kein Verkauf in die Stärke', 'Minervini verkauft in die Stärke – nicht umgesetzt', 'MISSING'),
    S('Gewinnfilter', 'EPS-/Umsatzbeschleunigung zum damaligen Stand (3.0.0 gebaut, verfehlte die Übernahmebedingungen – Forschung)', 'Minervini: „earnings, sales and margins – and the chart“', 'MISSING'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung: kein Vorteil gegenüber SPY', 'PREREGISTRATION-R7 … R11', 'VU_EXTENSION'),
  ], finding: 'Die meisten Gewinner scheiterten schon an der VCP-Erkennung (Basis nicht als VCP erkannt) oder am Ausbruchsvolumen. SMCI 2023 fiel zusätzlich an der Portfolioplatzvergabe. Der Gewinnfilter (3.0.0) hätte bei SMCI wegen nachlassender Beschleunigung ebenfalls nicht gekauft; historische EPS fehlen für rund ein Drittel der Titel.' },
  DONCHIAN_TURTLE: { version: '2.0.1', steps: [
    S('Quelle', 'The Original Turtle Trading Rules (Volltext)', 'originalturtles.org', 'ORIGINAL'), DATA,
    S('Kandidat', 'Ausbruch über das 20-Tage-Hoch (System 1); Filter: nach einem hypothetischen Gewinner auslassen, dann 55-Tage-Ausbruch', 'Turtle Rules', 'ORIGINAL'),
    S('Rang', 'Alphabetisch (Turtle 2.1.0 mit Rang Stärke/N gebaut, verfehlte eine Übernahmebedingung – Forschung)', 'Turtle Rules: „bought the strongest markets“', 'MISSING'),
    S('Einstieg', 'Im Tagesverlauf am Ausbruch, bei Kurslücke zur Eröffnung', 'Turtle Rules', 'ORIGINAL'),
    S('Portfolioplatz', '12 Units je Richtung = 12 Titel, ohne Hebel; Marktampel: keine neue Position bei SPY unter GD 200 (2.0.1, VU-Annahme)', 'Turtle Rules (Futures); Ampel VU', 'OPERATIONALIZATION'),
    S('Positionsgröße', '1 Unit = 1 % des Kontos je N, Stop 2N; notionelles Konto −20 % je 10 % Verlust', 'Turtle Rules', 'ORIGINAL'),
    S('Halten', 'Nachkaufen in ½-N-Schritten bis 4 Units – nicht umgesetzt (ohne Hebel nicht abbildbar)', 'Turtle Rules', 'MISSING'),
    S('Ausstieg', 'Stop 2N; Ausstieg am 10-Tage-Tief im Tagesverlauf', 'Turtle Rules', 'ORIGINAL'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung: kein Vorteil gegenüber SPY; die Original-Größe hält das Aktiendepot fast immer voll in gleichgerichteten Ausbrüchen', 'PREREGISTRATION-R8-TURTLE … R11', 'VU_EXTENSION'),
  ], finding: 'Turtle-Signale treffen viele große Gewinner, doch eine Unit kostet bei Aktien rund ein Drittel des Kapitals: Nach drei Positionen ist das Depot voll, über zehntausende Einstiege entschied Bargeld bzw. bis R11 das Alphabet. Die Regeln wurden für ein gestreutes Futures-Portfolio geschrieben.' },
  VU_TREND_52W: { version: '1.0.0', steps: [
    S('Quelle', 'TraderFox, öffentliche Regeln „NEO-DARVAS“ 2018/2019 (Volltext); keine Trader-Primärquelle', 'traderfox.de', 'DOCUMENTED_VARIANT'), DATA,
    S('Kandidat', '≥ 100 % seit 52-Wochen-Tief, neues Jahreshoch und Kurslücke ≥ 6 % in 20 Handelstagen, ≥ 1 Mio. USD Umsatz, 1.800 umsatzstärkste Titel', 'TraderFox; Universum VU', 'DOCUMENTED_VARIANT'),
    S('Rang', 'Clenow-Trendmaß statt nicht öffentlicher „Trendstabilität“', 'VU-Ersatz', 'VU_EXTENSION'),
    S('Einstieg', 'Monatsende entscheiden, Kauf zur Eröffnung am ersten Handelstag; nur bei grüner Marktampel', 'TraderFox; Termin VU', 'OPERATIONALIZATION'),
    S('Portfolioplatz', 'Zehn Plätze, frei werdende Plätze nach Rang', 'TraderFox', 'DOCUMENTED_VARIANT'),
    S('Positionsgröße', '10 % je Neukauf; > 20 % → 15 %; < 3 % → Verkauf', 'TraderFox', 'DOCUMENTED_VARIANT'),
    S('Halten', 'Kein Stop; Haltepflicht, solange neue Hochs innerhalb von 65 Handelstagen kommen und der Vorsprung über dem Tief ≥ 100 % bleibt', 'TraderFox', 'DOCUMENTED_VARIANT'),
    S('Ausstieg', 'Kein neues Hoch in 65 Handelstagen, < 100 % seit Tief; Marktampel rot → höchstens 5 %', 'TraderFox', 'DOCUMENTED_VARIANT'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung (PREREGISTRATION-R12); TraderFox-Angaben nicht reproduziert', 'PREREGISTRATION-R12', 'VU_EXTENSION'),
  ], finding: 'Neu in Runde 12: hält Gewinner, solange der Trend neue Hochs bildet, statt sie mit engem Stop abzuschneiden. Ergebnis der vorab festgelegten Prüfung siehe Evidenz.' },
});
