# Supertrader R15 – Kanonische Rekonstruktion, Fidelity-Audit und Architektur-Reparatur

Stand: 5. Oktober 2026. Baut auf R14 auf (`docs/SUPERTRADER_INDEPENDENT_AUDIT_R14.md`).

**Leitregel von R15:** Eine Regel wird einer Trader-Methode nur zugeordnet, wenn ihre Herkunft nachvollziehbar ist.

**Was R15 nicht ist:** keine Performance-Optimierung, kein neuer Backtest, keine Live-Änderung.
- Alle Live-Versionen, Ledger und Live-Texte sind unverändert.
- Abweichungen sind als Befund und im Migrationsplan aufgeführt.
- R15 veröffentlicht keine Kennzahlen aus Kursdaten.

| Artefakt | Ort |
|---|---|
| Kanonische Regelbücher | `scripts/supertrader/fidelity/canonical/{kullamagi,weinstein,darvas,minervini,turtle}.json` (+ `.md`) |
| Alle Regeln, Layer A/B | `scripts/supertrader/fidelity/R15-CANONICAL-RULES.json` |
| Herkunft je Live-Komponente | `scripts/supertrader/fidelity/R15-RULE-PROVENANCE.json` |
| Fidelity-Score + Hard Gate | `scripts/supertrader/fidelity/R15-FIDELITY-MATRIX.json` |
| Lücken je Strategie | `scripts/supertrader/fidelity/R15-STRATEGY-GAPS.json` |
| Migrationsplan Phase 1–6 | `scripts/supertrader/fidelity/R15-MIGRATION-PLAN.json` |
| Live-Text- und Fundamental-Audit | `scripts/supertrader/fidelity/audit/` |
| Generator (reproduzierbar) | `node scripts/supertrader/fidelity/build-r15-artifacts.mjs` |
| Tests | `scripts/supertrader/tests/r15.test.mjs` (17 Tests; gesamte Suite 203/203 grün) |

---

## 0. Kurzfassung

1. **Keine Live-Version bildet die Methode ihres Namensgebers ab.**
   - Alle fünf Trader-Strategien sind **VU_ADAPTATION**.
   - VU Trendfolge 52W ist **VU_NATIVE**.
   - Bei keiner Version ist **REPLICATION_CLAIM_ALLOWED** gesetzt (Hard Gate, Abschnitt 12).
2. **Am nächsten am Original ist Kullamägi Breakout.**
   - Stop am Tagestief, Teilverkauf, Einstand und Ausstieg an der SMA10 sind original.
   - Episodic Pivot und Parabolic Short fehlen.
   - Das Portfolio hat VU-Grenzen.
3. **Fremdregeln stecken unsichtbar in drei Strategien:**
   - Kullamägis 0,5 %-Risiko steckt in Weinstein (still über `PORTFOLIO_DEFAULTS` geerbt) und in Darvas (als „VU-Standard“).
   - Die TraderFox-Marktampel steckt in Darvas.
   - O'Neil-artige Volumen- und Ausstiegsregeln stecken in Minervini.
4. **Ursache des Drifts:**
   - Gemeinsame Module (Simulator, Portfolio-Defaults, Lifecycle) gelten für alle Strategien, ohne dass die Regelkarte sie zeigt.
   - Die Registry trägt veraltete Regeln weiter (`legacy_only`, in der UI unsichtbar).
   - Die Herkunft wird aus einem einzigen Flag (`VU_formalization_flag`) abgeleitet.
5. **Reparatur in R15:**
   - Strategy Fidelity Layer mit den Schichten A (kanonisch), B (Formalisierung) und C (Portfolio/Ausführung).
   - Explizite Portfolio-Policy je Strategie mit Herkunft je Feld; stilles Erben von Defaults schlägt per Test fehl.
   - Geteilte Regeln mit Herkunft je Strategie.
   - Produktklassen und Provenienz als Metadaten.
6. **Exit-Befund aus R14:**
   - Fall A (Original-Exit) gilt nur für Kullamägi und für das Prinzip bei Darvas.
   - Bei Weinstein und Minervini ist der Ausstieg VU bzw. ungeklärt (Fall B). Dort haben wir nicht die Originalmethode getestet.
7. **SEC-Daten reichen nicht für eine belastbare Minervini-Replication.**
   - EPS und Umsatz liegen zeitpunktgenau vor.
   - Margen fehlen zeitpunktgenau.
   - Schätzungen, Überraschungen, Revisionen, 13F und Gruppenrang fehlen ganz.

---

## 1. Herkunftsklassen und Schichten

| Klasse (R15-Auftrag) | Schlüssel | Bedeutung |
|---|---|---|
| ORIGINAL | `ORIGINAL` | Regel steht so in einer Primär- oder belegten Sekundärquelle |
| ORIGINAL – Interpretation notwendig | `ORIGINAL_INTERPRETATION` | Regel ist original, für Code muss eine Lesart gewählt werden |
| VU Formalisierung | `VU_FORMALIZATION` | VU macht eine qualitative Originalregel mechanisch (z. B. Schwelle) |
| VU eigene Regel | `VU_OWN` | Regel kommt in keiner Quelle der Methode vor |
| Fremdregel | `FOREIGN_RULE` | Regel stammt aus einer anderen Methode bzw. Quelle (Kullamägi, TraderFox, O'Neil, Bulkowski) |
| Nicht öffentlich reproduzierbar | `NOT_PUBLIC` | Methode nennt die Regel, aber Daten oder Wortlaut sind nicht zugänglich |
| Ungeklärt | `UNRESOLVED` | keine Fundstelle; darf nicht als Original gelten |

**Schichten** (`fidelity/taxonomy.mjs`):

| Schicht | Inhalt |
|---|---|
| A_CANONICAL | Regel der Methode |
| B_FORMALIZATION | mechanische Lesart |
| C_PORTFOLIO_EXECUTION | Größe, Auswahl, Exposure, Fills, Sperren |

**Zusammengesetzte Angaben** werden konservativ auf die strengste enthaltene Klasse abgebildet. Beispiel: „ORIGINAL (0,5 %) / VU_OWN (10 Plätze)“ wird zu `VU_OWN`. Die Rohangabe bleibt in `classificationDetail` erhalten (Test R15-R3).

---

## 2. Ergebnis je Strategie

Es folgen je Strategie die acht Pflichtfragen aus Abschnitt 28 des Auftrags. Die Belege mit Rule-ID, Quelle, Code-Stelle und Schweregrad stehen in den Regelbüchern und in `R15-STRATEGY-GAPS.json`.

### 2.1 Kullamägi – Live 3.2.0 („Momentum Breakout“)

Herkunft der Live-Komponenten: ORIGINAL 5 · ORIGINAL_INTERPRETATION 5 · VU_FORMALIZATION 13 · VU_OWN 15 · FREMD 0.

| Frage | Antwort |
|---|---|
| Was ist Original? | Drei Setups: Breakout, Episodic Pivot, Parabolic Short/Long. Breakout-Kern: Scan der stärksten 1–2 % über 1/3/6 Monate; 30–100 % Vorlauf; geordnete Basis von 2 Wochen bis 2 Monaten mit höheren Tiefs an steigenden 10/20-Linien; Einstieg über das Hoch der Eröffnungsspanne; Stop am Tagestief, höchstens etwa 1 ADR; nach 3–5 Tagen 1/3 bis 1/2 verkaufen; Einstand; Rest bei Schluss unter SMA10/20; Risiko 0,25–1 %; Gewicht 5–25 %, höchstens 30 % über Nacht. |
| Nicht reproduzierbar | Basisqualität nach Augenmaß; Größe nach Überzeugung; Markt-Ermessen; Wahl zwischen 10- und 20-Tage-Linie; Aufstocken intraday; Umfang der Margin; Bewertung des EP-Katalysators; alles, was nur aus Videos und Streams stammt. |
| Setzt VU um | Nur Breakout als Tageschart-Variante: Top-2-%-Perzentil; Vorlauf ≥ 30 %; VU-Basis; Kauf-Stop am 5-Tage-Hoch; Stop Tagestief ≤ 1 ADR; 1/3 nach 3 Sitzungen; Einstand; Rest unter SMA10; 0,5 % Risiko, 25 %, 10 Plätze, RS-Rang. |
| Fehlt | Episodic Pivot (keine Engine); Parabolic Short/Long (keine Engine, keine Short-Simulation); Einstieg über die Eröffnungsspanne mit Minutendaten; Varianten 20-Tage-Trail und Teilverkauf 1/2; Aufstocken; Margin; Markt-Ermessen. |
| Fremd | Keine Fremdregel im Kullamägi-Pfad. Umgekehrt wird seine Risikozahl in Weinstein und Darvas verwendet. |
| VU-eigen | Basis-Algorithmus; 5-Tage-Hoch als Trigger; Nähe 3 %; Liquiditätsfilter; Einstand-Bedingung; Gleichtagsregel; **5-Sitzungen-Sperre**; 10 Plätze; maxExposure 1,0; RS-Rang; ETF-Ausschluss. |
| Darf „Kullamägi“ heißen? | **Nein** als „Kullamägi-Methode“ oder „Replikation“. Zulässig: „Momentum Breakout – research-basiert auf Kullamägis Breakout-Setup (VU-Variante, Tageschart)“. |
| Echte Replication | Nur für Breakout sinnvoll. Voraussetzungen: Minutendaten (Hoch der Eröffnungsspanne, Tagestief bis zum Kauf); Variantengitter vorab festlegen; Sizing 0,3–0,5 % bei 10–25 % Gewicht; Hebel nur als Sensitivität. EP erst mit zeitpunktgenauen Konsens-, Guidance- und Nachrichtendaten. |

**Code-Befund:** Die Regelkarte sagt „keine Sperre nach Invalidierung“ (`registry-r8.mjs:58`). `engine/simulator.mjs:238` setzt die 5-Sitzungen-Sperre aber auch dort. Text und Code widersprechen sich (Phase 1).

### 2.2 Weinstein – Live 4.0.0

Herkunft: ORIGINAL 2 · ORIGINAL_INTERPRETATION 3 · VU_FORMALIZATION 9 · VU_OWN 16 · **FREMD 3**.

| Frage | Antwort |
|---|---|
| Was ist Original? | Stufenmodell mit 30-Wochen-Linie; Kauf nur in Stufe 2 per Kauf-Stop über dem Widerstand; deutlicher Volumenanstieg; positive relative Stärke; Auswahl vom Markt über die besten Gruppen zu den besten Charts; Halbposition beim Ausbruch, Rest beim Rücksetzer; Anfangsstop unter dem letzten Zwischentief, nicht auf runden Zahlen; Stop nachziehen und in Stufe 3 enger setzen; Shorts in Stufe 4. |
| Nicht reproduzierbar | Gruppen- und Sektorstärke (keine zeitpunktgenauen Gruppendaten); Langfrist-Marktindikatoren; Weinsteins Größen- und Streuungsregeln (Buch nicht abgerufen); Augenmaß-Urteile. |
| Setzt VU um | Stufenklassifikation, Basis- und Fortsetzungsbasis, Kauf-Stop, Marktfilter SPY/MA30, Mansfield-RS > 0, Volumen-Schnellverkauf (WEIN-VOL-04), Anfangsstop am Basistief, Ausstieg bei Wochenschluss unter MA30. |
| Fehlt | Gruppenfilter; Halbposition mit Rücksetzerkauf; Zwischentief-Stop; Rundungsregel; **Nachziehen des Stops**; Verengung in Stufe 3; Shorts (bewusst weggelassen). |
| Fremd | **0,5 % Risiko je Trade = Kullamägis KK-RISK-01**, still über `PORTFOLIO_DEFAULTS` geerbt (`portfolio: null`). Dazu IBD-artiges RS-Perzentil und 5-$-Minimum (Bulkowski). |
| VU-eigen | Stufenschwellen; Basis-Zahlen; Stoppuffer 2 %; Ausstieg bei Wochenschluss unter MA30; Verfall nach 60 Sitzungen; Sperre; 20 % Höchstgewicht und 10 Plätze (geerbt). |
| Darf „Weinstein“ heißen? | Nur als „VU-Variante nach Weinstein (Stufenanalyse, Einstiegsidee; Teilumfang long-only)“. |
| Echte Replication | Halbposition + Rücksetzer; Zwischentief-Stop mit Rundung; Nachziehen auf min(MA30, Zwischentief); keine eigene Weinstein-Größenzahl (Sensitivität, als VU gekennzeichnet); Gruppenfilter erst mit zeitpunktgenauen Branchendaten. |

**Code-Befunde:**
- Der nachgezogene Stop wird in `process-chain.mjs:34` und `registry.mjs:269/560` behauptet, ist im Code aber nicht vorhanden.
- Fehlendes Wochenvolumen gilt als ausreichend (`weinstein-v3.mjs:71`).

### 2.3 Darvas – Live 3.0.2

Herkunft: ORIGINAL 6 · ORIGINAL_INTERPRETATION 2 · VU_FORMALIZATION 3 · VU_OWN 17 · **FREMD 6**.

Darvas-Original, NEO-DARVAS (TraderFox) und Trend52 sind im Regelbuch getrennt geführt (`canonical/darvas.json → systems`).

| Frage | Antwort |
|---|---|
| Was ist Original? | Belegt aus TIME 1959/1960 (HIGH): starke Aktien mit starkem Volumen; wachsende Firmen mit möglicher Gewinnverdopplung; Kauforder am Ausbruchspunkt; Stop knapp unter der Kauforder; bei großem Gewinn Stop unter der Unterstützung; 5–6 Titel. Aus dem Buch (MEDIUM, nicht abgerufen): Boxen, neue Hochs, Pyramidisieren, Techno-Fundamentalismus. |
| Nicht reproduzierbar | Exakte Boxdefinition, Kaufpunkt-Aufschlag, Stopabstand, Pyramiding-Mengen: ohne Buch nicht festlegbar. |
| Setzt VU um | Kauf-Stop an der Boxoberkante; Stop **1 %** darunter (`darvas-v3.mjs:30`); Nachziehen an die neue Boxunterkante; nur Stop-Ausstieg; 6 Titel. |
| Fehlt | Gewinn- und Wachstumsfilter; Volumenbedingung; Pyramidisieren; Konzentration bzw. Kredit. |
| Fremd | **Marktampel SPY > GD200 (TraderFox)**; **0,5 % Risiko (Kullamägi)**; 3-Tage-Box (TraderFox-Zuschreibung). |
| VU-eigen | 1 %-Abstand; 20-Tage-Hoch als Oberkante; Boxhöhe 3–25 %; Nähe 90/95 %; Momentum-Perzentil ≥ 80; Verfall 30; Sperre 5; Kappe 1/6; RS-Rang; A/B-Qualität. |
| Darf „Darvas“ heißen? | Nur als „VU-Variante nach Darvas (Box-Ausbruch per Kauforder, Stop knapp unter der Kauforder – 1 % VU)“ mit Hinweis auf Fremdregeln. |
| Echte Replication | Erst Buch beschaffen und Box, Kaufpunkt, Stop und Pyramiding mit Fundstelle belegen. Danach nur Layer-A-Regeln, ohne Marktampel und Momentum-Perzentil, Pyramidisieren bis Zielgewicht, Gewinnfilter aus zeitpunktgenauen SEC-Daten. |

### 2.4 Minervini – Live 2.0.0 (komplett neu rekonstruiert)

Herkunft: ORIGINAL 7 · ORIGINAL_INTERPRETATION 8 · VU_FORMALIZATION 12 · VU_OWN 14 · **FREMD 1 · UNGEKLÄRT 1**.

| Frage | Antwort |
|---|---|
| Was ist Original? | Die acht Trend-Template-Kriterien; SEPA-Fundamentaldaten (Gewinn, Umsatz, Margen, Beschleunigung/„Code 33“, Überraschungen, Revisionen, Führerschaft); VCP qualitativ (2–6 kleiner werdende Kontraktionen, Volumenrückgang, Pivot); Kauf über dem Pivot; Cheat-Einstiege; Verlustgrenze 10 %; **Einstand bei 3× Risiko (original – R14 nannte das fälschlich „VU“)**; Verkauf in die Stärke; Zeitstop; Wiedereinstieg; Pilotkäufe und progressive Exposure; höchstens 25 % je Position; 1–2 % Risiko; 8–12 Positionen. |
| Nicht reproduzierbar | IBD-RS; Konsens-, Überraschungs- und Revisionsdaten zum damaligen Stand; Katalysatoren; Minervinis Marktmodell; historische Intraday-Ausbruchszeitpunkte. |
| Setzt VU um | Trend Template (RS als VU-Proxy); mechanischer VU-VCP; Schlussbestätigung über dem Pivot mit Volumen ≥ 1,4×; Kauf zur nächsten Eröffnung; Stop max(Kontraktionstief, −10 %); Einstand ab 3R; Vollausstieg bei Schluss unter SMA50 mit Volumen; 1,25 % Risiko; 25 %; 10 Plätze; Halbierung nach Verlustserie. |
| Fehlt | **SEPA live vollständig**; Verkauf in die Stärke bzw. Teilverkauf; Nachziehen über Einstand; Zeitstop; gestaffelte Stops; Cheat-, Low-Cheat- und Power-Play-Einstiege; Pilotkäufe und Aufstocken; Startquote 25–50 %. |
| Fremd / ungeklärt | Ausbruchsvolumen ≥ 1,4× ist FOREIGN_RULE (O'Neil-Konvention). Ausstieg „Schluss unter SMA50 mit Volumen“ ist UNRESOLVED (keine Minervini-Fundstelle, eher eine O'Neil-Verkaufsregel). |
| VU-eigen | VCP-Zickzackmechanik und ihre Grenzen; Volumenquotient < 0,8; Setup-Risiko-Filter; Verfall nach 20 Sitzungen; Sperre; ein Signal je Titel; Halbierungsregel; RS-Rang. |
| Darf „Minervini“ heißen? | **Nein** als „Minervini-Methode“ oder „SEPA“. Zulässig: „VU-Version nach Minervinis Trend Template und VCP-Idee (ohne SEPA-Fundamentaldaten, ohne Verkauf in die Stärke)“. |
| Echte Replication | Trend Template vollständig; SEPA zeitpunktgenau aus SEC-Erstmeldungen (EPS, Umsatz, Beschleunigung über bis zu drei Quartale, Bruttomarge); Überraschungen und Revisionen als NOT_PUBLIC; breitere Basisbeurteilung; Kauf-Stop am Pivot; Teilverkauf in die Stärke; Pilot und Aufstocken; progressive Exposure. **Bleibt auch dann VU_ADAPTATION**, weil das Fundamental-Gate nicht HIGH erreichbar ist (Abschnitt 6). |

### 2.5 Turtle – Live 2.0.2

Herkunft: ORIGINAL 9 · ORIGINAL_INTERPRETATION 4 · VU_FORMALIZATION 3 · VU_OWN 13 · UNGEKLÄRT 1.

**Futures-Original und Equity-Adaption** sind im Regelbuch als zwei Produkte geführt (`canonical/turtle.json → products`, `futuresDependence`).

| Frage | Antwort |
|---|---|
| Was ist Original? | Mechanisches Futures-Trendfolgesystem auf etwa 20 Märkten. System 1 (20/10, Gewinner-Filter, 55-Failsafe) und System 2 (55/20), long und short. N = EMA20 der True Range; Unit = 1 % je N; Aufstocken je ½ N bis 4 Units; Stop 2N mit Nachzug; Grenzen 4/6/10/12 Units; notionelles Konto −20 % je 10 % Verlust; bei gleichzeitigen Signalen die stärksten Märkte zuerst (Turtle Rules S. 29). |
| Nicht reproduzierbar | Dennis' subjektive Jahresanpassung; Ordertaktik; genaue Korrelationsgruppen; individuelle Allokation einzelner Turtles. |
| Setzt VU um | S1-Einstieg per Kauf-Stop inkl. Gap; Gewinner-Filter (nur long) mit 55-Failsafe; N; Stop 2N; 10-Tage-Ausstieg; Unit 1 %/N; notionelles Konto; long-only; höchstens 12 Titel ohne Hebel. |
| Fehlt | Short-Seite; Aufstocken ½ N mit Stop-Nachzug; Korrelationsgrenzen 6/10; Unit-Heat; **Stärke-Rang**; Vollständigkeit der Signale; System 2 (zulässig weggelassen). |
| Fremd (strukturell) | Anlageklasse US-Einzelaktien statt diversifizierter Futures. Ohne Hebel wird die Unit-Größe zum Kassa-Nominal (Gewichte etwa ein Fünftel bis weit über ein Drittel). Bargeld wird zur faktischen Positionsgrenze. |
| VU-eigen | **Lebenszyklus mit Signalverlust**: Nähe 3 %/6 % (`readyDistance`/`setupDistance`), Verfall nach 10 Sitzungen, Sperre 5. **Alphabetische Auswahl (ALPHA)**; maxPositionPct 1,0; Liquiditäts-, ADR- und Kanalfilter. |
| Darf „Turtle“ heißen? | **Nein** als „Turtle Trading System“ oder „Replikation“. Zulässig: „Turtle-System-1-Signale auf US-Aktien (VU-Variante; Portfolio VU-eigen)“, und erst nach Korrektur des falschen Live-Texts „keine Rangregel in der Quelle“. |
| Echte Replication | **A) `turtle-futures-replication`:** nur mit Futures-Daten (nicht vorhanden; ohne neue Kosten nicht baubar). **B) `turtle-equity-adaptation`:** Höchstgewicht je Aktie; Unit so skalieren, dass 12 Units in 100 % passen; Aufstocken; Gruppen Industrie ≤ 6 / Sektor ≤ 10 / gesamt ≤ 12; Rang (C − C[63]) / N; jeder Ausbruch ist ein Signal (kein Nähe-, Verfall- oder Sperrmechanismus); keine Neueinstiege ab etwa 50 % Jahresverlust. |

### 2.6 VU Trendfolge 52W – Live 1.0.0 (eigene VU-Strategie)

Herkunft: FREMD (TraderFox) 5 · VU_OWN 2 · ORIGINAL 1.

| Frage | Antwort |
|---|---|
| Was ist Original? | Keine Trader-Methode. Grundlage sind öffentliche Regeln der TraderFox-Variante NEO-DARVAS: 100 % seit Tief, 20-Tage-Hoch, Gap, Liquidität, Verkaufs- und Gewichtsregeln, Marktampel. |
| Setzt VU um | Diese Regeln mit VU-Universum, Zeitplan und Ersatz-Rang (Clenow). |
| Fremd | Mit Absicht: Die TraderFox-Regeln sind Grundlage und als solche ausgewiesen. |
| Darf „Darvas“ heißen? | **Nein.** Nur „VU Trendfolge 52W (eigene VU-Strategie nach öffentlichen TraderFox-Regeln)“. |
| Produktklasse | **VU_NATIVE**; ein Replication-Claim ist nicht möglich. |

---

## 3. Geteilte Portfolio- und Lifecycle-Logik

Diese Regeln gelten über gemeinsame Module für **alle** Strategien. Bisher erschienen sie auf keiner Regelkarte. R15 führt sie in `fidelity/shared-rules.mjs` mit einer Herkunftsangabe je Strategie (Test R15-S1).

| Regel | Modul | KK | Weinstein | Darvas | Minervini | Turtle |
|---|---|---|---|---|---|---|
| SH-COOLDOWN-5 (5 Sitzungen Sperre) | `simulator.mjs:28` | VU_OWN | VU_OWN | VU_OWN | VU_OWN | VU_OWN |
| SH-ONE-POSITION (kein Aufstocken) | Simulator | VU_OWN | VU_OWN | VU_OWN | VU_OWN | VU_OWN |
| SH-LONG-ONLY | Simulator | VU_OWN | VU_OWN | ORIGINAL | ORIG_INT | VU_OWN |
| SH-FILL-STOP | `execution.mjs` | VU_FORM | ORIGINAL | ORIG_INT | VU_FORM | ORIGINAL |
| SH-FILL-NEXT-OPEN | Simulator/Execution | VU_FORM | VU_FORM | VU_FORM | VU_FORM | VU_FORM |
| SH-SIZE-RISK (Risiko ÷ Stopabstand) | `runPortfolioTR` | ORIG_INT | VU_OWN | VU_OWN | ORIG_INT | ORIGINAL |
| SH-NO-LEVERAGE | `runPortfolioTR` | VU_OWN | VU_OWN | VU_OWN | VU_OWN | VU_OWN |
| SH-SELECT-SIMULTANEOUS | `runPortfolioTR` priority | VU_FORM | VU_FORM | VU_FORM | VU_FORM | **VU_OWN (ALPHA)** |
| SH-DEFAULTS (`PORTFOLIO_DEFAULTS`) | `backtest.mjs:9` | ungenutzt | **FREMD (geerbt)** | **FREMD (Zahl)** | ungenutzt | ungenutzt |

**Was diese Tabelle zeigt:**
- Die 5-Sitzungen-Sperre, das Verbot des Aufstockens und die Hebelfreiheit sind bei **jeder** Strategie VU-eigen.
- Bei Darvas, Minervini und Turtle widerspricht das Aufstockverbot einer Originalregel (Pyramidisieren).

**Architekturreparatur** (`fidelity/portfolio-policy.mjs`):
- Explizite Layer-C-Policy je Live-Strategie mit Wert, Herkunft und Quelle je Feld.
- `resolvePortfolioPolicy(engine).cfg` ist per Test **identisch** mit der Live-Konfiguration (R15-P1). Damit gibt es keine Verhaltensänderung.
- Eine neue Engine ohne Policy, oder eine Engine mit `portfolio: null` außerhalb der Altfall-Liste, wirft `ImplicitPolicyError` (R15-P2).
- Weinstein ist als einziger Altfall (`LEGACY_IMPLICIT`) ausgewiesen.
- Portfolio-Isolation: Eine Änderung der Momentum-Policy verändert keine andere Strategie (R15-I2).
- Signal-Isolation: Keine Live-Engine importiert die Strategie eines anderen Traders (R15-I1).

---

## 4. Exit-Befund aus R14: Fall A oder Fall B?

| Strategie | Fall | Begründung |
|---|---|---|
| Kullamägi | **A (Original)** | Tagestief-Stop, Teilverkauf, Einstand und Schluss unter SMA10 sind wörtlich original. VU ist nur die Einstand-Bedingung und das Tagestief des ganzen Tages. Frühe Verkäufe späterer Verdoppler folgen aus seinen Regeln; eine Trefferquote um 25 % mit hohen R-Vielfachen ist bei ihm erwartet. |
| Weinstein | **B (VU)** | Der Hauptausstieg „Wochenschluss < MA30“ ist eine Vereinfachung. Original ist ein nachgezogener Stop unter min(MA30, Zwischentief), in Stufe 3 enger. Nur WEIN-VOL-04 ist im Kern original. |
| Darvas | **A im Prinzip, B in der Zahl** | „Stop knapp unter der Kauforder“ und „nachziehen“ sind original. Die 1 % und das Nachziehen ohne Puffer sind VU. |
| Minervini | **B** | Vollausstieg „Schluss < SMA50 mit Volumen“ ist ungeklärt bzw. O'Neil-nah. Original sind Verkauf in die Stärke, Teilverkauf, Nachziehen und Zeitstop – alles fehlt. |
| Turtle | **A (Signal) mit B im Portfolio** | 10-Tage-Ausstieg und Stop 2N sind original. Ohne Aufstocken und Nachzug ist der Stop-Verlauf aber nicht der des Originals. |

**Folge:** Der R14-Satz „Unsere Ausstiegsregeln schneiden Gewinner nachweislich ab“ bleibt richtig, betrifft aber Verschiedenes:
- Bei Weinstein und Minervini testen wir **nicht** die Originalmethode.
- Bei Kullamägi ist es ein möglicher Nachteil **seiner** Methode.
- Daraus entsteht in R15 keine neue Exit-Regel.

---

## 5. Exposure nach den Originalregeln

Die Frage lautet nicht „Wie bekommen wir mehr Exposure?“, sondern: Was hätte die Methode selbst erzeugt?

| Strategie | Was die Originalregeln erzeugen würden | Heute live |
|---|---|---|
| Kullamägi | Gewicht meist 10–25 %, höchstens 30 %; rechnerisch 7–10 Titel bei voller Investition; Margin (Umfang NOT_PUBLIC), also über 100 % möglich; in Flauten wenige oder keine Trades (Ermessen). | Höchstens 10 × 25 %, ohne Hebel. Die niedrige Quote kommt aus fehlenden Signalen, nicht aus einer Fremdregel. |
| Weinstein | Größe nach Kapital (Halbposition + Zukauf), nicht nach 0,5 % Risiko bei weitem Stop. In Bullenmärkten hoch investiert, in Stufe-4-Märkten nahe null. Eine Zahl ist ohne Buch nicht ableitbar (UNRESOLVED). | Die Obergrenze liegt bei etwa 30 % und ist eine **Folge der Fremdregel** (0,5 % ÷ 15–27 % Stopabstand), nicht der Methode. |
| Darvas | 5–6 Titel, konzentriert, mit Kredit; Pyramidisieren in Gewinner; Cash entsteht in der Baisse über Stops. | 6 × 1/6 ohne Kredit und ohne Pyramiding. Die Marktampel (TraderFox) senkt die Quote zusätzlich – fremd. |
| Minervini | Start mit 25–50 %, progressive Aufstockung nach Erfolg bis voll investiert, bei Stärke mit Margin. | 10 × 25 % bei 1,25 % Risiko. Die niedrige Quote kommt aus fehlenden Signalen. Die Startquote fehlt. |
| Turtle | Futures: hohe Exposition über Margin, begrenzt durch Units und Korrelationsgruppen. Bei Aktien ohne Hebel passen nur 2–5 Units – nach Original also eine Konzentration, die das Original nie hatte. | Bargeld begrenzt; die Grenze von 12 bindet praktisch nie. |

---

## 6. Fundamentaldaten-Architektur und die SEC-Fragen

### 6.1 Matrix

Vollständig in `audit/fundamentals-matrix.json`. Kürzel: **A** = jährlich, **Q** = quartalsweise, **TTM** = letzte zwölf Monate.

| Datensatz | Rev | EPS | NI | Marge | FCF | Cash | Debt | CapEx | Shares | Point-in-Time | Nutzt | Live? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `quant/data/sec/consumer` (5.073 Emittenten) | A+Q+TTM | A+Q+TTM | A+Q+TTM | ableitbar | ja | ja | ja | ja | ja | **nein** (zuletzt berichtet, nur heute gelistete Emittenten, ca. 8 Quartale) | CAN-SLIM- und Piotroski-Teilprüfungen | Teilprüfung, keine Strategie |
| Discover-Metriken | Wachstum | – | jährlich | Netto/FCF | Marge | – | – | – | – | nein | Minervini-Anzeige (ungefiltert) | nur Anzeige |
| `quant/data/fundamentals/issuers` | nur Abdeckung | nur Abdeckung | – | – | – | – | – | – | – | Metadaten | Berichte | nein |
| SEC canonical (5 Titel) | ja | ja | ja | ableitbar | ja | ja | ja | ja | ja | ja (5 Titel) | Pipeline-Qualität | nein |
| `sec-pit-r11` (privat) | Q | Q | – | – | – | – | – | – | – | **ja** (Erstmeldung, `filed < asOf`, inkl. delisteter Titel) | **Minervini 3.0.0** (Forschung) | nein |
| `sec-pit-r12` (privat) | Q + IFRS | Q + IFRS | – | – | – | – | – | – | – | ja | Audit und Sensitivität | nein |
| Schätzungen, Überraschungen, 13F, Gruppenrang | – | – | – | – | – | – | – | – | – | – | – | **fehlt** |

Keine Live-Strategie nutzt heute Fundamentaldaten als Regel.

### 6.2 Die acht SEC-Fragen

1. **Welche SEC-Datensätze existieren?** Die sieben Zeilen oben. Die Fundamentalwerte stammen alle aus EDGAR companyfacts.
2. **Welche sind Point-in-Time?** `sec-pit-r11/r12` (nur EPS und Umsatz, quartalsweise, Erstmeldung). Die Golden-Five sind ebenfalls zeitpunktgenau, aber mit nur 5 Titeln irrelevant. `consumer` ist **nicht** zeitpunktgenau.
3. **Welche nutzt Minervini 2.0.0?** Keinen als Regel. Der Live-Kontext `ctxOf` (`build.mjs:404`) enthält kein `fund`. Angezeigt werden nur heutige Discover-Kennzahlen, ungefiltert (Test R15-F1).
4. **Welche nutzt Minervini 3.0.0?** `sec-pit-r11` über `engine/earnings.mjs`:
   - EPS-Wachstum ≥ 25 % gegenüber Vorjahr, Beschleunigung gegenüber dem Vorquartal, Umsatz über Vorjahr;
   - sichtbar erst nach dem Einreichungstag (Test R15-F1);
   - ohne Daten kein Einstieg.
5. **Warum unterscheiden sich die Versionen?** 2.0.0 entstand in Runde 7, bevor zeitpunktgenaue Daten inklusive delisteter Titel existierten. `consumer` ist für Regeln ungeeignet. R11 baute den PIT-Speicher, 3.0.0 nutzt ihn.
6. **Warum ging 3.0.0 nicht live?** Die präregistrierten Bedingungen aus R11 wurden verfehlt (DECISION-R11, bestätigt in DECISION-R13):
   - (a) keine sinkende Zahl aufgenommener Gewinner-Einstiege in der Fallmenge;
   - (b) Überrendite nicht unter dem fünftschlechtesten von 20 Zufallsreihenfolgen.
   - Der Gewinnfilter senkte die Zahl der Einstiege auch bei Gewinnern stark.
7. **Welche SEPA-Bestandteile sind mit vorhandenen Daten korrekt abbildbar?**
   - Quartals-EPS-Wachstum, EPS-Beschleunigung (auch über drei Quartale), Umsatzwachstum und -beschleunigung: zeitpunktgenau aus `sec-pit`.
   - Jährliches EPS-Wachstum: aus den Quartalen ableitbar.
   - Trend Template: aus Kursen, RS als Ersatz.
8. **Was fehlt tatsächlich?**
   - **Margen zeitpunktgenau:** GrossProfit, OperatingIncome und NetIncome sind in companyfacts vorhanden, werden aber nicht als Erstmeldung extrahiert. Machbar durch Erweiterung von `sec-pit.mjs`, ohne Doppelentwicklung.
   - **Analystenschätzungen, Revisionen, Überraschungen, 13F-Sponsorship, zeitpunktgenauer Gruppenrang:** nicht vorhanden, ohne neue Datenquelle nicht reproduzierbar (NOT_PUBLIC).

---

## 7. Ordering-Bias (alle Strategien)

| Prüfpunkt | Befund | Klasse |
|---|---|---|
| Alphabetische Auswahl | **Turtle** wählt gleichzeitige Signale nach `listingId` (ALPHA). Ökonomisch bedeutungslos; die Quelle nennt einen Stärke-Rang (S. 29). Markiert als `VU_FORMALIZATION_REQUIRED` (R15-O1). | VU_OWN, **HIGH** |
| RS/SCORE-Gleichstand | Alphabetisch nur bei exakt gleicher RS. R15-O1 zeigt: Das RS-Ergebnis hängt nicht vom Kürzel ab. | VU_FORMALIZATION, LOW |
| Loop-Reihenfolge der Signale | Der Simulator läuft je Titel unabhängig. Ein Titel beeinflusst keinen anderen, also kein Bias. | – |
| Zeitstempel-Gleichstand | Alle Einstiege eines Tages gelten als gleichzeitig. Intraday-Auslösezeiten fehlen. Bei Turtle entscheidet im Original die zeitliche Reihenfolge, live das Alphabet. | VU_FORMALIZATION |
| Erst eingetroffen, zuerst bedient | Tage laufen chronologisch (`calendar`). Frühere Einstiege belegen Plätze zuerst – das ist fachlich korrekt. | – |
| Ausstiege vor Einstiegen am selben Tag | Erlöse eines Ausstiegs am Tag *d* finanzieren Einstiege am Tag *d*, auch wenn der Ausstieg zum Schluss und der Einstieg zur Eröffnung erfolgt. | VU_OWN, MEDIUM (Migration Phase 3) |
| Batch-, Datei- und Objektreihenfolge | `byEntry` ist eine Map; jede Liste wird vor der Nutzung sortiert. Dateien werden sortiert gelesen (`build.mjs:124`). Kein Bias gefunden. | – |
| Gegenprobe | RALPHA (umgekehrt alphabetisch) und `seed` (Zufallsreihenfolge) existieren. Pflicht für jeden Replication-Kandidaten (Phase 4). | – |

---

## 8. Delisting-Fälle und Turtle-Schleife

### 8.1 Delisting-Klassifikator R15 (`validation/sec-pit.mjs`)

| Fall | R13 | R15 | Grundlage (echte SEC-Metadaten, `tests/fixtures/delist-cases-r15.json`) |
|---|---|---|---|
| DESP | UNKNOWN | **ACQUISITION** | Abmeldeformulare im Fenster, keine Notlage |
| BEL | UNKNOWN | **ACQUISITION** | dto. |
| HLAH | UNKNOWN | **SPAC_TRUST** | SIC 6770 |
| HIII | UNKNOWN | **SPAC_TRUST** | SIC 6770 |
| BSKY | UNKNOWN | **SPAC_TRUST** | SIC 6770. Die CIK wurde eindeutig, nachdem Kandidaten ohne Einreichung im Fenster ausgeschieden sind. |

**Regeln des Klassifikators:**
- A) Übernahmeformulare wie in R13.
- B) SIC 6770 wird zu SPAC_TRUST.
- C) Abmeldeformulare (S-8 POS, POS AM, POSASR, POS462B) im Fenster von −5 bis +10 Tagen **ohne Notlage** werden zu ACQUISITION. Bei einer Notlage wird blockiert, damit Insolvenzen nicht als Übernahme gelten (R15-D2).
- CIK-Wahl ohne XBRL-Zwang.

Regressionstest R15-D1: R13 verfehlt alle fünf Fälle, R15 bucht sie richtig.

### 8.2 Turtle-Notionalkonto (R14-Fix)

**Ursache:** Die Verlustschwellen summieren sich auf 50 % des Jahresstarts. Bei einem größeren Verlust endete die Schleife nie.

**Fix:** Begrenzung auf `tnCuts < 60`.

**Test R15-T2** prüft:
- Die Referenz der alten Schleife terminiert bis 50 % Verlust mit höchstens 60 Kürzungen; dort ändert der Fix kein Ergebnis.
- Bei einem Drawdown über 50 % in einem Kalenderjahr endet die Schleife.
- Das notionelle Konto geht gegen null, eine neue Position bleibt unter 10 USD (keine unplausible Größe).

---

## 9. Code gegen Doku gegen Live-Text

Prüfgrundlage: `audit/live-text-audit.json` mit 56 Live-Aussagen.

**Ergebnis:**
- **46 Abweichungen**: 31 Aussagen nicht codegleich, 27 nicht zur Live-Version passend.
- **7 davon HIGH.**

| Methode | Aussagen | Abweichungen | HIGH |
|---|---|---|---|
| Weinstein | 14 | 14 | 4 |
| Minervini | 12 | 10 | 1 |
| Kullamägi | 7 | 5 | 0 |
| Darvas | 7 | 6 | 0 |
| Turtle | 7 | 6 | 0 |
| Trend52 | 3 | 1 | 0 |
| übergreifend | 6 | 4 | 2 |

**Ursachen:**
- `registry.mjs` trägt Regeln früherer Versionen weiter.
- `legacy_only` wird in der UI nicht angezeigt.
- `registry.mjs:664-668` leitet Herkunft und Zähler aus `VU_formalization_flag` ab, auch für veraltete Regeln.

**Beispiele:**
- Weinstein „Stop wöchentlich nachziehen“ – nicht im Code.
- Kullamägi „keine Sperre nach Invalidierung“ – Code sperrt.
- Turtle „keine Rangregel in der Quelle“ – falsch.
- Darvas-Texte zu Schlusskurs-Einstieg und Stop an der Unterkante – veraltet.

Gemäß Auftrag **nicht live korrigiert**, sondern als Phase 1 im Migrationsplan.

---

## 10. Produktklassen, Versionierung, Trennung Signal und Portfolio

**Produktklassen** (`fidelity/product-classes.mjs`):
- Alle Live-Versionen haben die Klasse **VU_ADAPTATION**, Trend52 die Klasse **VU_NATIVE**.
- Eine **REPLICATION** gibt es heute nicht.

**Benennung künftiger Versionen:** `<methode>-<replication|adaptation|native>-<semver>`.
- Beispiele: `minervini-replication-1.0.0`, `turtle-futures-replication-1.0.0`, `turtle-equity-adaptation-1.0.0`, `vu-trend-52w-native-1.0.0`.
- Test R15-N1 prüft das Muster.
- Eine Version ist nie gleichzeitig Original und VU-Optimierung.

**Trennung von Signal-Engine und Portfolio-Engine:**
- Signal-Isolation ist belegt (R15-I1).
- Die Kopplung entsteht nur über die gemeinsamen Schichten. Diese sind jetzt explizit: Layer-C-Policy und geteilte Regeln.
- Die physische Trennung in eigene Module mit eigener Versionsnummer ist Phase 2 und 3 (keine Live-Änderung in R15).

**Provenienz je Live-Version:** `R15-RULE-PROVENANCE.json` enthält je Strategie jede Signal-Komponente, jedes Policy-Feld und jede geteilte Regel mit Klasse, Quelle und Code-Stelle.

---

## 11. Abschlussmatrix 1 – Fidelity und Claim

Interner, nicht marketingfähiger Score aus `R15-FIDELITY-MATRIX.json`. Risk ist HIGH nur, wenn Exit und Sizing HIGH sind.

| Strategie | Entry | Exit | Sizing | Portfolio | Fundamentals | Originaltreue aktuell | Claim erlaubt |
|---|---|---|---|---|---|---|---|
| Kullamägi 3.2.0 | MEDIUM | HIGH | HIGH | LOW | HIGH (keine verlangt) | **MEDIUM** (Breakout-Kern) | **nein** (Entry, Portfolio) |
| Weinstein 4.0.0 | MEDIUM | LOW | LOW | LOW | HIGH (keine verlangt) | **LOW** | **nein** |
| Darvas 3.0.2 | MEDIUM | MEDIUM | LOW | MEDIUM | LOW | **LOW** | **nein** |
| Minervini 2.0.0 | MEDIUM | LOW | MEDIUM | MEDIUM | LOW | **LOW** | **nein** |
| Turtle 2.0.2 | MEDIUM | HIGH | LOW | LOW | HIGH (keine verlangt) | **LOW** | **nein** |
| VU Trendfolge 52W 1.0.0 | MEDIUM | MEDIUM | MEDIUM | MEDIUM | HIGH | MEDIUM (gegen TraderFox-Regeln) | **nein** (VU_NATIVE) |

## 12. Abschlussmatrix 2 – Fremdregeln, Lücken, Reparaturbedarf

| Strategie | Kritische Fremdregeln | Fehlende Originalregeln | VU-Annahmen | Reparaturbedarf |
|---|---|---|---|---|
| Kullamägi | keine | EP und Parabolic als Setups; Einstieg über die Eröffnungsspanne; Aufstocken; Margin | Basis-Algorithmus, 5-Tage-Hoch, Sperre, 10 Plätze, RS-Rang | **klein**: Text und Sperre klären; EP als eigenes Produkt |
| Weinstein | **0,5 % Risiko (KK-RISK-01), still geerbt** | Halbposition + Rücksetzer, Zwischentief-Stop, Nachziehen, Gruppenfilter | Wochenschluss-Ausstieg, Stoppuffer, 20 %/10 geerbt | **grundlegend**: Größe, Stop, Ausstieg |
| Darvas | **Marktampel (TraderFox), 0,5 % (Kullamägi), 3-Tage-Box** | Gewinn- und Volumenfilter, Pyramidisieren, Buchregeln | 1 %-Stop, Nähe, Momentum-Perzentil, Kappe 1/6 | **grundlegend** (erst Buchbeleg) |
| Minervini | **Volumen ≥ 1,4× (O'Neil); SMA50-Ausstieg ungeklärt** | SEPA live, Verkauf in die Stärke, Zeitstop, Pilot, Startquote | VCP-Mechanik, Halbierungsregel, Verfall | **grundlegend** (Exit + SEPA), Replication wegen Daten nicht erreichbar |
| Turtle | strukturell: Aktien statt Futures, Unit ohne Hebel | Aufstocken, Short, Gruppengrenzen, Heat, **Stärke-Rang** | **ALPHA-Auswahl, Lebenszyklus mit Signalverlust**, maxPositionPct 1 | **grundlegend im Portfolio**; Signale nur klein |
| Trend52 | TraderFox-Regeln (gewollt, ausgewiesen) | – | Universum, Clenow-Rang, Zeitplan | klein (nur Benennung) |

---

## 13. Migrationsplan (Kurzform; vollständig in `R15-MIGRATION-PLAN.json`)

Keine Phase läuft automatisch. Live bleibt bis zu einer ausdrücklichen Freigabe unverändert. Historische Ledger werden nie überschrieben.

| Phase | Inhalt | Gate |
|---|---|---|
| 1 Canonical Rulebooks | In R15 erstellt. Danach: Primärquellen nachziehen (Darvas-, Weinstein-, Minervini-Bücher); Etikett und Live-Texte korrigieren (46 Abweichungen); Registry ohne `legacy_only` als aktive Regel | Provenienz-Tests grün, Live-Text ohne HIGH |
| 2 Replication Engines | Signal-Engines nur aus Layer A/B. Kandidaten: `turtle-equity-adaptation-1.0.0`, `weinstein-adaptation-5.0.0`, `darvas-adaptation-4.0.0`, `minervini-adaptation-3.1.0`, `kullamaegi-breakout-adaptation-4.0.0`; `turtle-futures-replication-1.0.0` nur mit Futures-Daten | Fidelity-Matrix je Kandidat, keine Fremdregel in Kernbereichen |
| 3 Strategy-specific Portfolio Engines | Layer C nur über `resolvePortfolioPolicy`; `PORTFOLIO_DEFAULTS` für Live verboten; fachliche Auswahlregel statt ALPHA; Pyramidisieren bzw. Halbposition je Methode | Policy ≡ Live für unveränderte Versionen; ALPHA/RALPHA ergebnisneutral |
| 4 Parallel Validation | Präregistrierung; Vorwärtsprüfung (DEV und Holdout sind gesehen); Schatten-Ledger | vorregistrierte Kriterien, keine Parameterwahl nach Ergebnis |
| 5 Live Migration | nur nach Freigabe; alte Version einfrieren | Freigabe durch den Betreiber |
| 6 VU Adaptations separat | VU-Optimierungen (z. B. Exit-Varianten aus R14) nur als eigene `-adaptation`- oder `-native`-Produkte | eigene Präregistrierung |

---

## 14. Die zehn Schlussfragen

1. **Welche Live-Versionen bilden die Trader-Methode tatsächlich ab?**
   - Keine vollständig.
   - Am nächsten kommt **Kullamägi Breakout 3.2.0**: Exit und Sizing sind quellentreu, es ist aber nur eines von drei Setups, und der Einstieg ist eine Tageschart-Formalisierung.
   - Die **Turtle-Signale (System 1)** sind nahe am Original, das Portfolio nicht.
2. **Welche nicht?**
   - **Weinstein**: nur Einstiegsidee.
   - **Darvas**: Prinzip original, Zahlen und Filter VU bzw. TraderFox.
   - **Minervini**: ohne SEPA, ohne Original-Exit.
   - **Turtle** als System: andere Anlageklasse, kein Aufstocken, Alphabet.
   - **Trend52** ist keine Trader-Methode und darf nicht „Darvas“ heißen.
3. **Welche Regeln hat VU erfunden oder aus anderen Strategien übernommen?**
   - **Übernommen:**
     - Kullamägis 0,5 % in Weinstein und Darvas;
     - TraderFox-Marktampel und 3-Tage-Box in Darvas;
     - O'Neil-Volumen ≥ 1,4× in Minervini, dazu der ungeklärte SMA50-Ausstieg;
     - Bulkowskis 5-$-Minimum und das IBD-artige RS-Perzentil in Weinstein.
   - **Erfunden:**
     - bei allen Strategien: 5-Sitzungen-Sperre, Aufstockverbot, Hebelfreiheit;
     - Lebenszyklus mit Nähe, Verfall und Signalverlust (Turtle, Darvas, Kullamägi);
     - ALPHA-Auswahl (Turtle);
     - Darvas: 1 %-Stop;
     - Weinstein: Ausstieg bei Wochenschluss unter MA30;
     - Minervini: VCP-Mechanik und Halbierungsregel;
     - die übrigen VU-Annahmen je Regelbuch.
4. **Wie konnte der Specification Drift entstehen?**
   - (a) Gemeinsame Module tragen Regeln in alle Strategien: `PORTFOLIO_DEFAULTS`, Cooldown, eine Position je Titel, Auswahlregel.
   - (b) Engines ohne eigene Portfolioangabe erben still. So kam Weinstein zu Kullamägis Risiko.
   - (c) Die Registry trägt Regeln früherer Versionen weiter; `legacy_only` ist in der UI unsichtbar.
   - (d) Die Herkunft hängt an einem einzigen Flag (`VU_formalization_flag`), statt je Regel belegt zu sein.
   - (e) Sekundärquellen wie TraderFox und O'Neil-Konventionen wurden Methoden zugeschrieben, ohne Klassentrennung.
   - (f) Code-Kommentare und Live-Texte wurden bei Versionswechseln nicht mitgeprüft.
5. **Welche Architekturänderung verhindert ihn künftig?**
   - Der Strategy Fidelity Layer: Regelbuch (A), Formalisierung (B) und explizite Portfolio-Policy (C) mit Herkunft je Feld.
   - Stilles Erben bricht den Test.
   - Geteilte Regeln brauchen eine Herkunft je Strategie.
   - Produktklasse und Hard Gate als Metadaten.
   - Artefakte reproduzierbar aus den Regelbüchern; ein Test vergleicht sie mit den eingecheckten Dateien.
   - Benennungsmuster.
   - Folgt in Phase 1–3: Registry-Herkunft aus `R15-RULE-PROVENANCE.json`, Verbot von `PORTFOLIO_DEFAULTS`, Live-Text-Audit als Test.
6. **Welche Performanceaussage bleibt gültig?**
   - „In unseren **VU-Umsetzungen** ist für keine Methode ein Vorteil gegenüber SPY belegt.“ Diese Aussage galt immer nur für VU-Versionen.
   - „Die niedrige Investitionsquote bei Weinstein ist eine Folge **unserer** Größenregel.“ R15 präzisiert: Es ist eine Fremdregel.
   - „Unsere Ausstiegsregeln schneiden Gewinner ab.“ Gültig mit der Fall-A/B-Einordnung aus Abschnitt 4.
7. **Welche Performanceaussage muss zurückgezogen oder umformuliert werden?**
   - Jede Formulierung, die ein Ergebnis einer Methode zuschreibt („Weinstein-“, „Darvas-“, „Minervini-“, „Turtle-Strategie erzielt …“). Neu: „VU-Adaption nach X erzielt …“.
   - Bei Weinstein und Minervini darf keine Aussage über die Wirkung des **Original-Exits** gemacht werden (Fall B).
   - Jede Aussage, Trend52 sei „Darvas“.
   - Jeder Satz mit „Replikation“ oder „Original-Methode“.
8. **Welche Strategie muss von Grund auf neu implementiert werden?**
   - **Weinstein**: Größe, Stop und Ausstieg.
   - **Turtle**: als Equity Adaptation neu, Portfolio-Engine mit Units, Gruppen, Rang, Aufstocken, ohne Lebenszyklus. Eine Futures-Replication ist nur mit Futures-Daten möglich.
   - **Darvas**: nach Buchbeleg, ohne TraderFox-Regeln.
   - **Minervini**: Exit, SEPA und Exposure; bleibt dennoch Adaption.
9. **Welche Strategie braucht nur kleinere Korrekturen?**
   - **Kullamägi Breakout**: Regelkarte und Sperre in Einklang bringen; Einstand-Bedingung ausweisen; ehrliche Benennung. EP und PS als eigene Produkte.
   - **Trend52**: nur Benennung.
10. **Reichen die SEC-Daten für eine belastbare Minervini-Replication?**
    - **Nein.**
    - EPS und Umsatz samt Beschleunigung sind zeitpunktgenau vorhanden.
    - Margen ließen sich ohne neue Kosten ergänzen (Erweiterung `sec-pit.mjs`).
    - Analystenschätzungen, Revisionen, Überraschungen, institutionelle Sponsorship und Gruppenrang fehlen und sind ohne neue Datenquelle nicht reproduzierbar.
    - Damit erreicht der Bereich Fundamental nicht HIGH, und das Hard Gate verbietet den Replication-Claim.
    - Erreichbar ist eine **Minervini-Adaption mit zeitpunktgenauem SEPA-Teilfilter**.

---

## 15. Abschluss-Gate (Abschnitt 36)

| Bedingung | Erfüllt | Beleg |
|---|---|---|
| Jede Strategie hat ein kanonisches Regelbuch | ja | `canonical/*.json`, `R15-CANONICAL-RULES.json`: KK 57, Weinstein 33, Darvas 59, Minervini 69, Turtle 41, Trend52 12 Regeln |
| Jede wichtige Regel hat eine Herkunft | ja | R15-R1 |
| Jede Live-Regel ist klassifiziert | ja | `R15-RULE-PROVENANCE.json`, R15-R2 |
| Fremdregeln identifiziert | ja | Abschnitt 12, `foreignOrUnresolved` |
| VU-Annahmen identifiziert | ja | Regelbücher `vuOwn`, Abschnitt 3 |
| SEC- und Minervini-Integration geklärt | ja | Abschnitt 6, R15-F1 |
| Turtle Futures vs. Equity geklärt | ja | Abschnitt 2.5, `canonical/turtle.json` |
| Portfolio-Engines auf versteckte gemeinsame Regeln geprüft | ja | Abschnitt 3, R15-P1/P2/S1/I2 |
| Ordering-Bias geprüft | ja | Abschnitt 7, R15-O1 |
| Replication / Adaptation / Native architektonisch getrennt | ja (Metadaten, Hard Gate) | `product-classes.mjs`, R15-R5, R15-N1 |
| Tests existieren | ja | `r15.test.mjs` (17), Suite 203/203 |
| Migrationsplan | ja | `R15-MIGRATION-PLAN.json` |

---

## 16. Grenzen

- Die Bücher von Darvas, Weinstein und Minervini wurden nicht im Volltext abgerufen. Regeln daraus haben höchstens Belegstärke MEDIUM und sind als solche markiert.
- Die Fidelity-Stufen sind ein interner Score aus den Regelbüchern, keine Messung.
- Es gibt keine neuen Backtests. Aussagen über Wirkungen stammen aus R14 oder sind ausdrücklich qualitativ.
- Zitate aus Quellen sind auf höchstens 15 Wörter gekürzt oder paraphrasiert.
