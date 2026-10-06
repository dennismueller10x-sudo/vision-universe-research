# Supertrader – Unabhängiger Red-Team-Audit (Runde 14)

Stand: 04.10.2026.

| Grundlage | Ort |
|---|---|
| Präregistrierung | `scripts/supertrader/validation/PREREGISTRATION-R14.json` (eingefroren, zwei Ergänzungen vor der Holdout-Öffnung, Öffnungsprotokoll) |
| Programm | `scripts/supertrader/validation/audit-r14.mjs` |
| Quellenketten | `scripts/supertrader/validation/R14-SOURCE-CHAINS.json` (130 Regelzeilen) |
| Ergebnis | `scripts/supertrader/validation/AUDIT-R14-RESULT.json` |

Alle Kennzahlen liegen nur verschlüsselt vor, weil sie aus Tiingo-Daten stammen. Dieses Dokument nennt Befunde, Richtungen und Einstufungen ohne Zahlen. **Live wurde in R14 nichts verändert.**

**Grundsatz:** Geprüft werden VU-Umsetzungen. Ein negatives Ergebnis widerlegt keinen Trader und kein fremdes Musterdepot.

## 0. Die Leitfrage

> Testet Vision Universe die Handelsmethoden von Minervini, Kullamägi, Weinstein, Darvas und Turtle – oder nur deren Einstiegsideen in einem eigenen Portfoliomodell?

**Für alle fünf: überwiegend die Einstiegsidee (teils die Ausstiegsidee) in einem VU-eigenen Rahmen für Portfolio, Risiko und Ausführung.**

| Methode | Was wir tatsächlich testen |
|---|---|
| Kullamägi | Am nächsten am Original. Ein- und Ausstieg sowie Positionsgröße sind quellennah. Es fehlen zwei von drei Setups, der Einstieg über die Eröffnungsspanne, Margin und Ermessen. |
| Minervini | Trend Template und VCP als Formalisierung, Positionsgröße nahe an seinen Interviewangaben. Es fehlen SEPA-Fundamentaldaten (live in 2.0.0 nicht umgesetzt), Verkauf in die Stärke, gestaffelte Stops und Pilotpositionen. |
| Weinstein | Einstiegsidee der Stufenanalyse. Die Positionsgröße ist eine Fremdregel (Kullamägis Risikostandard). Stop und Hauptausstieg sind VU-Formalisierungen, die von Weinstein abweichen. |
| Darvas | Box-Ausbruch mit vielen Regeln, die nicht von Darvas stammen: dreitägige Box, 1-%-Stop, Nähe zum Hoch, Marktampel (TraderFox). Es fehlen Volumen- und Gewinnfilter sowie Pyramidisierung. |
| Turtle | Signale von System 1 nahe am Original. Das Portfolio ist für Aktien strukturell fremd: eine Unit je Aktie ohne Hebel, kein Aufstocken, keine Korrelationsgrenzen, alphabetische Reihenfolge. |

## 1. Vorgehen

**Zeiträume**
- **Entwicklungszeitraum (DEV):** 2016–2026, bereits in R8–R13 genutzt.
- **Holdout:** 2008–2015, eigens über den bestehenden Datenzugang abgerufen, vorher nie ausgewertet und genau einmal geöffnet.
- **Grenze des Holdouts:** Die Tickerliste ist für ältere Delistings unvollständig. Der Holdout ist deshalb nicht frei von Survivorship Bias: Positive Ergebnisse sind nach oben verzerrt, negative konservativ.

**Je Methode gemessen**
- **Ebene A:** reales Depot gegen SPY-Gesamtrendite.
- **Ebene B (investiertes Kapital):**
  - je Trade gegen SPY über dieselbe Haltedauer;
  - positionsgenau je eingesetztem Kapital, abgestimmt gegen die Depotkurve;
  - Signalportfolio aller Einstiege ohne Kapazitätsgrenze.
- **Ebene C (ohne Hebel):**
  - ungenutztes Kapital in SPY statt Bargeld;
  - Gleichgewicht;
  - unbegrenzte Plätze;
  - Halten statt Methodenausstieg;
  - alternative Reihenfolgen gleichzeitiger Signale.
- **Exposure:** Verteilung über die Tage und Zerlegung des ungenutzten Kapitals in Größenregel, fehlende Signale, Marktampel sowie Plätze/Bargeld.
- **Signalqualität:** alle Einstiege nach 5 bis 252 Tagen gegen SPY, gegen das liquide Universum und gegen das RS-Dezil (Momentum-Kontrolle), mit Monats-Cluster-t.
- **Exit-Audit:** spätere Gewinner, die zu früh verkauft wurden, je Ausstiegsregel; gepaarter Vergleich mit Halten.
- **Fallketten:** 16 Mega-Gewinner (mechanisch ausgewählt, plus SMCI) und je Methode die 10 größten Verlustbeiträge.
- **Weitere Prüfungen:** Regime und Jahre, Kosten und Umschlag, Handelbarkeit, Point-in-Time der Fundamentaldaten, Kontext-Benchmarks (RSP, QQQ, IWM, IWV, IWF, IWO, MDY, IJR).

## 2. Befunde zur Rechnung

### Bestätigt korrekt
- Doppelte und überlappende Trades, Ticker-Wiederverwendung, unabhängige zweite Buchung und SPY-Gesamtrendite sind korrekt.
- Neu geprüft: Das Dollarergebnis der Positionen stimmt je Methode auf den Euro mit der Depotkurve überein.
- Die Fundamentaldaten (Minervini 3.0.0, Forschung) sind zeitpunktgenau: nur Werte, die vor dem Signaltag eingereicht wurden, und je Periode nur die erste Meldung.

### Bestätigter Fehler, behoben (Forschungs- und Modellportfoliomodul)
- **Endlosschleife im Turtle-Notionalkonto,** sobald ein Depot innerhalb eines Kalenderjahres mehr als die Hälfte verliert.
  - Erkannt am ersten Holdout-Lauf (Jahr 2008), der ohne Ergebnis abgebrochen wurde.
  - Das Modul wird auch vom Live-Modelldepot verwendet und hätte dort den Signal-Build hängen lassen.
  - Korrektur: Begrenzung der Kürzungen. Für jede bisher endende Eingabe ist das Ergebnis identisch. Test R14-T1.

### R13-Korrektur unvollständig (belegt, nicht live korrigiert)
- Die SEC-Klassifikation aus R13 erfasst nicht alle Barübernahmen. Ein Teil der delisteten Notierungen hat keine Klassifikation.
- **Belegfälle:**
  - Übernahme eines Auslandsemittenten, die bei Turtle einen großen Teil des Depots kostete;
  - eine Barübernahme 2019;
  - drei SPAC-Auflösungen zum Treuhandwert (Dezember 2022), die Weinstein als Ausbrüche gekauft hatte.
- **Wirkung:** nach oben begrenzt durch das Szenario „letzter Kurs“. Sie ändert kein Urteil.

### Messfehler im eigenen Protokoll, vor der Holdout-Öffnung korrigiert
- Die vorab festgelegte Rendite auf investiertes Kapital (Portfoliorendite geteilt durch die Exposition des Vortags) übersieht Positionen, die am selben Tag eröffnet und geschlossen werden.
- Folge: Kullamägi erscheint fälschlich positiv.
- Ersetzt durch eine positionsgenaue Rechnung. Beide Werte sind berichtet.

## 3. Benchmark-Fairness

- 2016–2026 war SPY gegenüber gleichgewichteten und kleineren US-Aktien ungewöhnlich stark.
- Unsere Universen sind gleichgewichtet, eher mittel bis klein und wachstumsnah. Ein Teil des Rückstands zu SPY ist daher Größen- und Gewichtungseffekt, keine Signalqualität.
- Im Holdout 2008–2015 war es umgekehrt.
- Deshalb wird jedes Signal auch gegen das liquide Universum und das RS-Dezil gemessen.
- Ebene A (gegen SPY) bleibt die Anlegerwahrheit.

## 4. Ergebnisse je Methode

### Kullamägi / Momentum 3.2.0
- **Exposure:** niedrig. Ursache sind fehlende Signale, nicht die Positionsgröße.
- **Live-Depot:** schlägt SPY in keinem Zeitraum.
- **Mit SPY statt Bargeld als Basis:** in beiden Zeiträumen knapp über SPY (nicht signifikanzgeprüft; Holdout nach oben verzerrt).
- **Je Trade:** liegt gegen SPY über dieselbe Haltedauer im Mittel darunter.
- **Signale:** in DEV langfristig über dem Universum, gegen das RS-Dezil nicht signifikant, im Holdout nicht wiederholt. Ein Signalvorteil ist nicht belegt.
- **Exits:** Mehr als die Hälfte der Ausstiege fällt auf den Tagestief-Stop des Kauftags. Die große Mehrheit späterer Verdoppler wird mit kleinem Gewinn oder Verlust verkauft. Gepaart liegt Halten in beiden Zeiträumen signifikant vorn.
- **Fallketten:** Fast alle Mega-Gewinner wurden nie Kandidat (Momentum-Perzentil, starre Basis). Die größten Verluste sind Lücken unter den Kauftags-Stop.
- **Kategorie:** **E** (diskretionär, Teilumfang). Hinweis: Die Exits zerstören Gewinner in beiden Zeiträumen.

### Weinstein 4.0.0
- **Exposure:** strukturell niedrig.
  - Die Größenregel (eine Kullamägi-Zahl) ergibt sehr kleine Positionen.
  - Zehn Mini-Positionen belegen alle Plätze und weisen weitere Signale ab.
- **Gleichgewicht je Platz:** in beiden Zeiträumen besser als die Live-Größe, im Holdout auch über SPY, in DEV nicht.
- **Signale:** gegen das Universum neutral, gegen SPY in DEV schlechter.
- **Exits:**
  - Die Volumenregel WEIN-VOL-04 („schwaches Ausbruchsvolumen → Verkauf beim ersten Gewinn“; bei Bulkowski mit Buchzitat sekundär belegt, hier in engster Lesart formalisiert) beendet drei Viertel der Trades nach wenigen Tagen. *Einordnung R15/Migration Phase 1: Nicht diese Regel, sondern der Hauptausstieg bei Wochenschluss unter der 30-Wochen-Linie ist eine VU-Vereinfachung (Fall B).*
  - Halten liegt gepaart in beiden Zeiträumen vorn.
- **Fehlkandidaten:** Die größten Verlustbeiträge sind Buchungsartefakte (Übernahme und SPAC-Auflösungen mit Abschlag).
- **Kategorie:** **D** (Größe, Stop, Ausstieg), dann **A** (kein Signalvorteil).

### Darvas 3.0.2
- **Exposure:** hoch, kein Exposure-Problem.
- **Ausstiege:** Der 1-%-Stop beendet die große Mehrheit der Trades schon nach einem Tag und erzeugt sehr hohen Umschlag.
- **Signale:** liegen in DEV über dem Universum, aber nicht über dem RS-Dezil. Der Vorsprung ist der Momentum-Faktor, kein Darvas-Eigenwert. Im Holdout negativ.
- **Reihenfolge:** Das Ergebnis hängt stark davon ab, welche gleichzeitigen Signale genommen werden.
- **Marktampel:** hilft in beiden Zeiträumen.
- **Kategorie:** **D**, dann **A**.

### Minervini 2.0.0
- **Exposure:** niedrig, Ursache sind fehlende Signale.
- **Signale:** in DEV leicht positiv, nicht signifikant gegen das RS-Dezil, im Holdout negativ.
- **Gleichgewicht mit SPY als Basis:** in DEV knapp über SPY, im Holdout nicht wiederholt.
- **Exits:** in DEV signifikant schädlich, im Holdout nicht.
- **Live 2.0.0:** ohne SEPA-Fundamentaldaten. Die R12-Erweiterung der SEC-Daten hätte Minervini 3.0.0 nicht verändert.
- **Kategorie:** **D**, dann **A** (Hinweis F: geringe Fallzahl).

### Turtle 2.0.2
- **Exposure:** voll investiert.
- **Positionsgröße:** Die Unit-Regel ergibt bei volatilitätsarmen Aktien sehr große Einzelpositionen.
- **Reihenfolge:** Ohne Rang entscheidet das Alphabet (live belegt). Das Ergebnis schwankt stark mit der Reihenfolge.
- **Signale:** gegen Universum und RS-Dezil ohne Vorteil, im Holdout signifikant darunter.
- **Regime:** in Bärenphasen besonders schwach.
- **Kategorie:** **D** (Übertragung von Futures auf ungehebelte Einzelaktien), dann **A**.

### VU Trendfolge 52W 1.0.0 (eigene VU-Strategie)
- Kein Vorteil in beiden Zeiträumen; hohe Beta- und Konzentrationswirkung.
- Weder Darvas noch das TraderFox-System. Das Rangmaß ist ein Ersatz für ein nicht öffentliches Original.
- **Kategorie:** **A**.

## 5. Abschlussmatrix

| Strategie | Signal-Edge | Exits zerstören | Portfolio-Problem | Exposure-Problem | Implementierungsproblem | Strategieproblem (VU-Version) | R13-Urteil | Kategorie |
|---|---|---|---|---|---|---|---|---|
| Kullamägi | nicht belegt | ja (beide Zeiträume) | nein | ja (fehlende Signale) | Teilumfang | nicht belegt | teils irreführend | E |
| Weinstein | nein | ja (beide) | ja (Mini-Positionen belegen Plätze) | ja (Größenregel) | ja | ja | teils bestätigt | D → A |
| Darvas | nein (nur Momentum-Faktor) | ja (beide) | ja (Reihenfolge) | nein | ja | ja | bestätigt | D → A |
| Minervini | nein | DEV ja, Holdout nein | nein | ja (fehlende Signale) | ja (SEPA fehlt) | ja | bestätigt, Doku korrigiert | D → A (F) |
| Turtle | nein | ja (beide) | ja (Reihenfolge, Alphabet, Konzentration) | nein | ja (Übertragung, Endlosschleife) | ja | bestätigt | D → A |
| Trendfolge 52W | nein | – | Konzentration | nein | Ersatz-Rangmaß | ja | bestätigt | A |

**Kategorie G (robuster Vorteil im Holdout) trifft auf keine Strategie zu.**

## 6. R13-Aussagen geprüft

| Bewertung | Aussagen |
|---|---|
| **Bestätigt** | Buchung und Benchmark; „für keine Methode ein Vorteil belegt“; Darvas/Turtle: Rückstand auf investiertem Kapital; Minervini: Cash aus fehlenden Signalen; „Halten verkleinert den Rückstand“ (jetzt signifikant) |
| **Teilweise bestätigt** | Delisting-Korrektur (unvollständig); Weinstein „fast nur Cash“ (Cash entsteht durch eine Fremdregel, Signale ohne Vorsprung); Momentum „ohne Vorteil“ (für das Depot belegt, für Signale nicht widerlegt) |
| **Irreführend** | Momentum „investiert etwa Marktniveau“ (Beitrag zur Gesamtrendite, nicht Rendite auf investiertem Kapital) |
| **Falsch** | „Darvas-Gewinnfilter als VU-Annahme“ und „Minervini 2.0.0 mit EPS/Umsatz“ (R13-Doku, korrigiert); „Turtle: keine Quelle für eine Rangfolge“; Weinstein-Prozesskette „Stop wöchentlich nachziehen“ (Live-Text, zur Korrektur empfohlen) |

## 7. Was wir sagen dürfen – und was nicht

**Dürfen:**
- „In unseren VU-Umsetzungen ist für keine Methode ein Vorteil gegenüber SPY belegt (2008–2015 und 2016–2026).“
- „Unsere Ausstiegsregeln schneiden Gewinner nachweislich ab.“
- „Die niedrige Investitionsquote bei Weinstein ist eine Folge unserer Größenregel.“

**Nicht dürfen:**
- „Methode X funktioniert nicht.“
- „Die Signale haben keinen Wert“ – oder „einen Vorteil“.
- „Investiertes Kapital auf Marktniveau.“
- „Original-Methode“ oder „TraderFox-Backtest reproduziert“.

## 8. Empfehlungen

Ohne Live-Änderung in R14:

1. **Live-Texte korrigieren:** Weinstein-Prozesskette (Stop, Volumen), Turtle-Rangquelle.
2. **Delisting-Klassifikation erweitern:** Auslandsemittenten und SPAC-Auflösungen; SPACs aus dem Universum ausschließen.
3. **Forschung:** neu präregistrieren und vorwärts prüfen, weil beide Zeiträume jetzt gesehen sind:
   - Kullamägi: Ausstieg mit weniger Kauftags-Rauschen, bewertet mit SPY als Basis;
   - Weinstein: quellennahe Größe und quellennaher Stop;
   - Turtle: Gewichtsgrenze und Stärke-Rang (ehrlicher: diversifiziertes ETF-/Futures-Universum);
   - Darvas: Box-Stop nach Darvas' eigener Beschreibung.
4. **Bewertungsstandard:**
   - Ebene A gegen SPY;
   - Ebene B tradegleich und positionsgenau;
   - Ebene C mit SPY als Basis für ungenutztes Kapital;
   - Signale gegen Universum und RS-Dezil.
