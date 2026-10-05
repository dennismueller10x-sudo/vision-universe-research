// Supertrader — Prozesskette je Methode: Quelle → historische Daten → Kandidat → Rang →
// Einstieg → Portfolioplatz → Positionsgröße → Halten → Ausstieg → Portfoliorendite.
// Je Schritt: Regel im Code (laufende Version), Quelle und Herkunft. Seit Migration Phase 1 mit den
// Herkunftsklassen von R15 (fidelity/taxonomy.mjs); bei gemischten Schritten gilt die strengste Klasse:
//   ORIGINAL                 steht so in einer Quelle des Traders
//   ORIGINAL_INTERPRETATION  Regel des Traders, für den Code musste Vision Universe eine Lesart wählen
//   VU_FORMALIZATION         qualitative Idee des Traders, von Vision Universe messbar gemacht (Zahlen VU)
//   VU_OWN                   Regel von Vision Universe, in keiner Quelle der Methode
//   FOREIGN_RULE             Regel einer anderen Methode oder eines Dritten (`from` nennt die Herkunft)
//   UNRESOLVED               keine Fundstelle; gilt nicht als Regel des Traders
//   MISSING                  belegter Baustein des Traders, im Code nicht umgesetzt
// "finding" fasst die Fallprüfungen R10/R11 zusammen (warum große Gewinner fehlten) – ohne Kennzahlen.

const S = (step, rule, source, cls, from = null) => (from ? { step, rule, source, cls, from } : { step, rule, source, cls });
export const STEPS = ['Quelle', 'Historische Daten', 'Kandidat', 'Rang', 'Einstieg', 'Portfolioplatz', 'Positionsgröße', 'Halten', 'Ausstieg', 'Portfoliorendite'];
export const CHAIN_CLASSES = Object.freeze(['ORIGINAL', 'ORIGINAL_INTERPRETATION', 'VU_FORMALIZATION', 'VU_OWN', 'FOREIGN_RULE', 'UNRESOLVED', 'MISSING']);
const DATA = S('Historische Daten', 'Tageskurse 2016–2026 aller damals gelisteten US-Aktien inklusive delisteter Titel (Point-in-Time), ohne ETFs/ETNs/Fonds; live Tageskurse.', 'VU-Datenstrecke (privat)', 'VU_OWN');

export const PROCESS_CHAIN = Object.freeze({
  MOMENTUM_BREAKOUT: { version: '3.2.0', steps: [
    S('Quelle', 'Kullamägi, „3 timeless setups“ und FAQ (Volltext). Umgesetzt ist nur das Breakout-Setup; Episodic Pivot und Parabolic Short sowie Margin fehlen.', 'qullamaggie.com', 'ORIGINAL'), DATA,
    S('Kandidat', 'Top 2 % Momentum über 1/3/6 Monate, ≥ 30 % Vorlauf, Kurs „surft“ steigende 10/20-Tage-Linie; enge Basis 10–40 Sitzungen ≤ 25 % (Basisformel und Schwellen VU)', 'Kullamägi; Schwellen und Basisalgorithmus VU', 'VU_FORMALIZATION'),
    S('Rang', 'Gleichzeitige Einstiege nach relativer Stärke am Vortag', 'VU (R10, Kullamägi: „die stärksten 1–2 %“)', 'VU_OWN'),
    S('Einstieg', 'Kauf-Stop am 5-Tage-Hoch im Tagesverlauf (Original: Opening-Range-Hoch)', 'Kullamägi: „enter when the stock is starting to break out“; Tageschart-Variante', 'ORIGINAL_INTERPRETATION'),
    S('Portfolioplatz', 'Höchstens 10 Positionen; 5-Sitzungen-Sperre nach einem Trade; eine Position je Titel', 'keine Höchstzahl in der Quelle; Sperre VU', 'VU_OWN'),
    S('Positionsgröße', '0,5 % Risiko je Trade ÷ Stopabstand, höchstens 25 % je Titel', 'FAQ: 0,3–0,5 % Risiko, 5–25 % Gewicht', 'ORIGINAL_INTERPRETATION'),
    S('Halten', 'Nach 3 Tagen 1/3 verkaufen (Original); Stop auf Einstand erst bei Schluss über dem Einstieg (VU-Bedingung, 3.2.0)', '„sell 1/3 to 1/2 after 3-5 days, move the stop to break even“', 'VU_FORMALIZATION'),
    S('Ausstieg', 'Stop am Tagestief des Kauftags (≤ 1 ADR); Rest beim ersten Schluss unter der 10-Tage-Linie', '„Stop is always lows of the day“; „first CLOSE below the 10-day“', 'ORIGINAL'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung 2016–2026: kein Vorteil gegenüber SPY (intern, ohne veröffentlichte Kennzahlen)', 'PREREGISTRATION-R8 … R11', 'VU_OWN'),
  ], finding: 'Viele große Gewinner wurden nie Kandidat (kein Top-2-%-Rang oder keine enge Basis zum richtigen Zeitpunkt). Wer aufgenommen wurde, endete meist nach wenigen Tagen am Stop des Kauftags – das ist Kullamägis eigene Regel. Bis 3.1.0 verkaufte zusätzlich ein Implementierungsfehler den Rest zu früh (behoben in 3.2.0). Audit (Runde 13): Auf dem investierten Kapital liegt das Modell etwa auf Marktniveau; der Rückstand entsteht durch Cash (wenige gleichzeitige Setups) und hohe Umschlagskosten. Fast alle Einstiege, die sich in den folgenden sechs Monaten verdoppelten, wurden mit weniger als 10 % Gewinn verkauft – das folgt aus Kullamägis Stop- und Ausstiegsregeln, nicht aus einem Fehler.' },
  WEINSTEIN_STAGE: { version: '4.0.0', steps: [
    S('Quelle', 'Weinstein, Secrets for Profiting in Bull and Bear Markets – das Buch wurde nicht gelesen; Buchzitate liegen über Dritte vor (Bulkowski, stageanalysis.net)', 'Sekundär mit wörtlichen Zitaten', 'ORIGINAL_INTERPRETATION'), DATA,
    S('Kandidat', 'Stufe-1-Basis (flache 30-Wochen-Linie, Basis ≥ 10 Wochen) oder Fortsetzungsbasis in Stufe 2. Relative Stärke und Marktfilter werden erst beim Kauf-Stop geprüft; Wochenvolumen ist kein Kandidatenfilter', 'Weinstein (Stufenmodell); Schwellen VU', 'VU_FORMALIZATION'),
    S('Rang', 'Relative Stärke am Vortag', 'VU (R10)', 'VU_OWN'),
    S('Einstieg', 'Kauf-Stop über dem Widerstand im Tagesverlauf; Markt (SPY über nicht fallender 30-Wochen-Linie) und Mansfield-RS > 0 zum letzten Wochenschluss', 'Weinstein: Buy-Stop über dem Widerstand (zitiert bei Bulkowski)', 'ORIGINAL_INTERPRETATION'),
    S('Portfolioplatz', 'Höchstens 10 Positionen; 5-Sitzungen-Sperre; eine Position je Titel', 'keine Zahl in der Quelle (aus den Portfolio-Standardwerten geerbt)', 'VU_OWN'),
    S('Positionsgröße', '0,5 % Risiko ÷ Stopabstand, höchstens 20 % je Position – bisherige VU-Anpassung. Die 0,5 % stammen aus Kullamägis Risikospanne und sind keine Weinstein-Regel. Bei den weiten Wochenstops bleibt die Investitionsquote strukturell niedrig', 'Kullamägis Risikospanne, über die Portfolio-Standardwerte geerbt; keine Weinstein-Quelle', 'FOREIGN_RULE', 'Kullamägi'),
    S('Halten', 'Kein nachgezogener Stop: Die Position läuft bis zum Anfangsstop oder zum Wochenschluss-Ausstieg. Schwaches Ausbruchsvolumen → Verkauf beim ersten Gewinn', 'Weinstein (zitiert bei Bulkowski): „sell it for a fast profit“', 'ORIGINAL_INTERPRETATION'),
    S('Nachziehen des Stops', 'Weinstein zieht den Stop nach (unter die 30-Wochen-Linie bzw. das letzte Zwischentief). In 4.0.0 nicht umgesetzt; die frühere VU-Regel „Stop wöchentlich 2 % unter die Linie“ galt nur bis 1.1.0', 'Weinstein (zitiert bei Bulkowski)', 'MISSING'),
    S('Anfangsstop', '2 % unter dem tiefsten Wochenschluss der Basis (Weinstein: unter dem nächsten Zwischentief)', 'Prinzip Weinstein; Abstand VU', 'VU_FORMALIZATION'),
    S('Ausstieg', 'Wochenschluss unter der 30-Wochen-Linie → Verkauf zur nächsten Eröffnung. VU-Vereinfachung: Weinstein steigt über den nachgezogenen Stop aus', 'VU-Vereinfachung einer Weinstein-Idee', 'VU_FORMALIZATION'),
    S('Fortsetzungskauf', 'Fortsetzungsausbrüche in Stufe 2: Basis ≥ 8 Wochen über der 30-Wochen-Linie, ≤ 25 % tief, Kauf-Stop am Basishoch (live seit Runde 13; Zahlen VU)', 'Idee: Checkliste von stageanalysis.net (Dritter, mit Buchzitaten); Formalisierung VU', 'VU_FORMALIZATION'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung: kein Vorteil gegenüber SPY', 'PREREGISTRATION-R8B … R11', 'VU_OWN'),
  ], finding: 'Die meisten großen Gewinner waren bereits in Stufe 2; 3.0.0 sucht nur Stufe-1-Basen und fand sie deshalb nicht. Fortsetzungskäufe (4.0.0) bringen erstmals Einstiege und laufen seit Runde 13 live. Audit: Der Rückstand zu SPY entsteht fast vollständig durch Cash – die bisherige VU-Anpassung der Positionsgröße (Kullamägis 0,5 % Risiko bei weiten Stops) und wenige Signale lassen das Modell überwiegend in Cash; auf dem investierten Kapital liegt das Ergebnis nahe am Markt. Der Ausstieg bei Wochenschluss unter der 30-Wochen-Linie ist eine VU-Vereinfachung: Getestet wurde damit nicht Weinsteins eigener Stop.' },
  DARVAS_BOX: { version: '3.0.2', steps: [
    S('Quelle', 'TIME 25.05.1959 und 01.08.1960 (Volltext); Buch 1960 nicht frei zugänglich', 'TIME', 'ORIGINAL'), DATA,
    S('Kandidat', 'Nahe 52-Wochen-Hoch, 6-Monats-Stärke ≥ 80. Perzentil, Box mit bestätigter Ober- und Unterkante (VU; die Dreitagesregel schreibt TraderFox Darvas zu, sie ist keine belegte Darvas-Regel)', 'Darvas: Aktien, die mit Volumen gut steigen; Box-Formel VU', 'VU_OWN'),
    S('Rang', 'Relative Stärke am Vortag', 'VU (R10)', 'VU_OWN'),
    S('Einstieg', 'Kauforder an der Boxoberkante im Tagesverlauf', '„places buy orders at breakout points“', 'ORIGINAL'),
    S('Portfolioplatz', 'Fünf bis sechs Titel (Darvas); Höchstgewicht 1/6 je Titel und 5-Sitzungen-Sperre sind VU', '„five or six stocks at a time“; 1/6 VU', 'VU_FORMALIZATION'),
    S('Marktampel', 'Keine neue Position, wenn SPY am Vortag unter seinem 200-Tage-Durchschnitt schloss (seit 3.0.2). Darvas hatte keine Marktampel', 'Öffentlich beschriebene TraderFox-Variante, nicht Darvas', 'FOREIGN_RULE', 'TraderFox'),
    S('Positionsgröße', '0,5 % Risiko ÷ Stopabstand, begrenzt durch 1/6 je Titel. Darvas nennt keine Größenregel; die Zahl stammt aus Kullamägis Risikospanne', 'Kullamägis Risikospanne, als „VU-Standard“ übernommen', 'FOREIGN_RULE', 'Kullamägi'),
    S('Halten', 'Stop an jede höhere bestätigte Boxunterkante nachziehen', 'Darvas (TIME 1960); Boxdefinition VU', 'ORIGINAL_INTERPRETATION'),
    S('Ausstieg', 'Stop 1 % unter der Kauforder, später an der Boxunterkante. Das Prinzip „knapp unter der Kauforder“ ist original, die Zahl 1 % ist VU', '„just below his buy order“ (TIME 1959); 1 % VU', 'VU_OWN'),
    S('Gewinnfilter', 'Gewinne „could double or treble“ – nicht umgesetzt', 'TIME 1959', 'MISSING'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung: kein Vorteil gegenüber SPY', 'PREREGISTRATION-R8B, R10', 'VU_OWN'),
  ], finding: 'Viele Gewinner wurden Kandidat, aber der Stop 1 % unter der Kauforder (VU-Wert) liegt meist in der normalen Tagesschwankung: Gewinner wurden nach Tagen ausgestoppt und Plätze vergeben, bevor der Trend lief. Bis 3.0.0 bekam außerdem der sechste Titel keinen vollen Platz (behoben). Audit (Runde 13): Der Rückstand entsteht vor allem auf dem investierten Kapital – viele kleine Verluste am engen Stop plus hohe Umschlagskosten. Dieselben Einstiege, sechs Monate gehalten, hätten den Rückstand großenteils geschlossen (Gegenprobe, keine Regel).' },
  MINERVINI_VCP: { version: '2.0.0', steps: [
    S('Quelle', 'Minervini-Interviews und eigene Beiträge (Volltext), Trend Template; Bücher nur sekundär', 'minervini.com, Interviews', 'ORIGINAL_INTERPRETATION'), DATA,
    S('Kandidat', 'Trend Template (Kurs über 50/150/200-Tage-Linie, ≥ 30 % über Tief, ≤ 25 % unter Hoch, VU-RS-Perzentil ≥ 70) und VCP-Erkennung (VU-Formel)', 'Minervini; VCP-Formel und RS VU', 'VU_FORMALIZATION'),
    S('Rang', 'Relative Stärke am Vortag', 'VU (R10); Minervini bevorzugt RS 80–90', 'VU_OWN'),
    S('Einstieg', 'Schluss über dem Pivot mit ≥ 1,4× Volumen, Kauf zur nächsten Eröffnung. Die Volumenschwelle 1,4× ist eine O’Neil-Konvention, keine belegte Minervini-Regel', 'Minervini: Kauf am Pivot; Volumenschwelle O’Neil-Konvention', 'FOREIGN_RULE', 'O’Neil-Konvention'),
    S('Portfolioplatz', 'Höchstens 10 Positionen (Minervini: 8–10, auch 12); 5-Sitzungen-Sperre ist VU', 'Minervini-Interviews', 'ORIGINAL_INTERPRETATION'),
    S('Positionsgröße', '1,25 % Risiko je Trade ÷ Stopabstand, höchstens 25 % je Position, Stop höchstens 10 %; nach netto negativen letzten fünf Trades halbes Risiko (VU-Formalisierung der progressiven Exposition)', 'Minervini auf X (1,25 %, 25 %); Halbierungsregel VU', 'VU_FORMALIZATION'),
    S('Halten', 'Stop auf Einstand ab 3 Anfangsrisiken Gewinn; sonst bleibt die Position bis Stop oder Ausstieg', 'Minervini auf X: „nie einen guten Gewinn zum Verlust werden lassen“; Schwelle 3R sekundär', 'ORIGINAL'),
    S('Ausstieg', 'Stop oder Schluss unter der 50-Tage-Linie bei überdurchschnittlichem Volumen → Verkauf zur nächsten Eröffnung. Für diese 50-Tage-Regel gibt es keine Minervini-Fundstelle (eher eine O’Neil-Verkaufsregel)', 'Herkunft ungeklärt', 'UNRESOLVED', 'vermutlich O’Neil'),
    S('Verkauf in die Stärke', 'Minervini verkauft in die Stärke (oft die Hälfte), hat einen Zeitstop und zieht den Stop über den Einstand nach – nicht umgesetzt', 'Minervini (Bücher, Interviews)', 'MISSING'),
    S('Fundamentaldaten (SEPA)', 'Live 2.0.0 verwendet keine Fundamentaldaten (weder Filter noch Anzeige). Zeitpunktgenaue EPS- und Umsatzdaten liegen vor; die Forschungsversion 3.0.0 nutzt Teile davon und ging nicht live. Margen ließen sich ergänzen; Analystenschätzungen, Überraschungen, institutionelle Eigentümer und ein belastbarer Branchenrang fehlen', 'Minervini: „earnings, sales and margins – and the chart“', 'MISSING'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung: kein Vorteil gegenüber SPY', 'PREREGISTRATION-R7 … R11', 'VU_OWN'),
  ], finding: 'Die meisten Gewinner scheiterten schon an der VCP-Erkennung (Basis nicht als VCP erkannt) oder am Ausbruchsvolumen. SMCI 2023 fiel zusätzlich an der Portfolioplatzvergabe. Der Gewinnfilter (3.0.0) hätte bei SMCI wegen nachlassender Beschleunigung ebenfalls nicht gekauft; historische EPS fehlen für rund ein Drittel der Titel. Audit (Runde 13): Auf dem investierten Kapital etwa Marktniveau; der Rückstand entsteht durch Cash (wenige erkannte VCP-Setups). Der Ausstieg bei Schluss unter der 50-Tage-Linie hat keine Minervini-Fundstelle: Aussagen über „Exits, die Gewinner abschneiden“ betreffen diese Regel, nicht Minervinis Verkauf in die Stärke.' },
  DONCHIAN_TURTLE: { version: '2.0.2', steps: [
    S('Quelle', 'The Original Turtle Trading Rules (Volltext): ein Futures-System mit Long und Short, Aufstocken und Korrelationsgrenzen. Diese Live-Version ist eine VU Equity Adaptation von System 1, keine Replikation', 'originalturtles.org', 'ORIGINAL'), DATA,
    S('Kandidat', 'Ausbruch über das 20-Tage-Hoch (System 1); Filter: nach einem hypothetischen Gewinner auslassen, dann 55-Tage-Ausbruch', 'Turtle Rules', 'ORIGINAL_INTERPRETATION'),
    S('VU-Lebenszyklus', 'Aufnahme erst, wenn der Kurs höchstens 6 % unter dem Ausbruchspunkt steht (3 % = vorbereitet); Verfall nach 10 Sitzungen ohne Ausbruch; 5 Sitzungen Sperre. Die Turtles handelten jeden Ausbruch – dadurch können echte Turtle-Ausbrüche verloren gehen (z. B. ein Kurssprung aus mehr als 6 % Abstand)', 'VU (keine Turtle-Regel)', 'VU_OWN'),
    S('Rang', 'Alphabetisch nach Kürzel (VU-eigen). Die Turtle Rules kaufen die stärksten Märkte zuerst; die Forschungsversion 2.1.0 (Rang Stärke/N) ging nicht live', 'Turtle Rules: „bought the strongest markets“ (S. 29)', 'VU_OWN'),
    S('Einstieg', 'Im Tagesverlauf am Ausbruch, bei Kurslücke zur Eröffnung', 'Turtle Rules', 'ORIGINAL'),
    S('Portfolioplatz', 'Höchstens 12 Titel (Original: 12 Units je Richtung) ohne Hebel; kein Gewichtsdeckel je Aktie; keine Korrelationsgrenzen (Marktampel aus 2.0.1 in Runde 13 zurückgenommen)', 'Turtle Rules (Futures); Anpassung VU', 'VU_OWN'),
    S('Positionsgröße', '1 Unit = 1 % des notionellen Kontos je N, Stop 2N; notionelles Konto −20 % je 10 % Verlust (Jahresanpassung = tatsächliches Kapital, VU)', 'Turtle Rules', 'ORIGINAL_INTERPRETATION'),
    S('Halten', 'Nachkaufen in ½-N-Schritten bis 4 Units – nicht umgesetzt (ohne Hebel nicht abbildbar)', 'Turtle Rules', 'MISSING'),
    S('Ausstieg', 'Stop 2N; Ausstieg am 10-Tage-Tief im Tagesverlauf', 'Turtle Rules', 'ORIGINAL'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung: kein Vorteil gegenüber SPY; die Original-Größe hält das Aktiendepot fast immer voll in gleichgerichteten Ausbrüchen', 'PREREGISTRATION-R8-TURTLE … R11', 'VU_OWN'),
  ], finding: 'Turtle-Signale treffen viele große Gewinner, doch eine Unit kostet bei Aktien rund ein Drittel des Kapitals: Nach drei Positionen ist das Depot voll, über zehntausende Einstiege entschied Bargeld bzw. bis R11 das Alphabet. Die Regeln wurden für ein gestreutes Futures-Portfolio geschrieben. Audit (Runde 13): Der Rückstand entsteht auf dem investierten Kapital; die Signale haben im Mittel keinen Vorsprung, und der volle Kapitaleinsatz in wenigen großen Units verstärkt Verluste. Die Marktampel (2.0.1) wurde zurückgenommen. Die alphabetische Auswahl und der VU-Lebenszyklus (Nähe, Verfall, Sperre) entsprechen nicht der Originalmethode.' },
  VU_TREND_52W: { version: '1.0.0', steps: [
    S('Quelle', 'TraderFox, öffentliche Regeln „NEO-DARVAS“ 2018/2019 (Volltext); keine Trader-Primärquelle', 'traderfox.de', 'FOREIGN_RULE', 'TraderFox'), DATA,
    S('Kandidat', '≥ 100 % seit 52-Wochen-Tief, neues Jahreshoch und Kurslücke ≥ 6 % in 20 Handelstagen, ≥ 1 Mio. USD Umsatz, 1.800 umsatzstärkste Titel (Universum VU)', 'TraderFox; Universum VU', 'FOREIGN_RULE', 'TraderFox'),
    S('Rang', 'Clenow-Trendmaß statt nicht öffentlicher „Trendstabilität“', 'VU-Ersatz (Clenow)', 'FOREIGN_RULE', 'Clenow'),
    S('Einstieg', 'Monatsende entscheiden, Kauf zur Eröffnung am ersten Handelstag; nur bei grüner Marktampel', 'TraderFox; Termin VU', 'FOREIGN_RULE', 'TraderFox'),
    S('Portfolioplatz', 'Zehn Plätze, frei werdende Plätze nach Rang', 'TraderFox', 'FOREIGN_RULE', 'TraderFox'),
    S('Positionsgröße', '10 % je Neukauf; > 20 % → 15 %; < 3 % → Verkauf', 'TraderFox', 'FOREIGN_RULE', 'TraderFox'),
    S('Halten', 'Kein Stop; Haltepflicht, solange neue Hochs innerhalb von 65 Handelstagen kommen und der Vorsprung über dem Tief ≥ 100 % bleibt', 'TraderFox', 'FOREIGN_RULE', 'TraderFox'),
    S('Ausstieg', 'Kein neues Hoch in 65 Handelstagen, < 100 % seit Tief; Marktampel rot → höchstens 5 %', 'TraderFox', 'FOREIGN_RULE', 'TraderFox'),
    S('Portfoliorendite', 'Vorab festgelegte Prüfung (PREREGISTRATION-R12); TraderFox-Angaben nicht reproduziert', 'PREREGISTRATION-R12', 'VU_OWN'),
  ], finding: 'Neu in Runde 12: hält Gewinner, solange der Trend neue Hochs bildet, statt sie mit engem Stop abzuschneiden. Mit korrekt gebuchten Übernahmen (Runde 13) liegt das Modelldepot näher am Markt, aber ohne belegten Vorteil und mit hohen Schwankungen. Die Regeln stammen aus einer öffentlich beschriebenen TraderFox-Variante; VU Trendfolge 52W ist weder Darvas’ Methode noch das TraderFox-System.' },
});
