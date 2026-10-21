# Supertrader 3.0 – Strategy Advancement: Abschlussbericht

Stand: 21. Oktober 2026. Basis: `main` @ `7ad6669f6` (nach #811, #812, #816, #818).
Research Snapshot: `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`. Abrechnung: `research-v1`.
Alle historischen Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Keine Methode ist live oder handelbar; es gibt keine Orders.

Maschinenlesbar:
- `scripts/supertrader/source-faithful/artifacts/STRATEGY-READINESS-SF3.json` (sechs Dimensionen, generiert);
- Snapshot-Lauf: öffentlicher Teil im Log von Lauf `sf3-research`, versiegelter Teil auf `claude/supertrader-validation-results`.

Einzeldokumente:
- [SUPERTRADER_3_TURTLE_CORRELATION_RESEARCH.md](SUPERTRADER_3_TURTLE_CORRELATION_RESEARCH.md)
- [SUPERTRADER_3_WEINSTEIN_INDUSTRY_STRENGTH.md](SUPERTRADER_3_WEINSTEIN_INDUSTRY_STRENGTH.md)
- [SUPERTRADER_3_MINERVINI_COMPLETION.md](SUPERTRADER_3_MINERVINI_COMPLETION.md)
- [SUPERTRADER_3_MOMENTUM_AND_DATA_FRONTIER.md](SUPERTRADER_3_MOMENTUM_AND_DATA_FRONTIER.md)
- [SUPERTRADER_3_STRATEGY_READINESS.md](SUPERTRADER_3_STRATEGY_READINESS.md) (generiert)

## Ausgangslage und Architekturentscheidung

- Seit #804/#805 haben die 13 Verträge **keine offene Implementierungslücke**. Jede verbleibende Lücke ist manuell, datenblockiert oder quellenoffen.
- Fortschritt war daher nur auf drei Wegen möglich:
  1. neue PIT-Daten nutzen (#811 SIC, Snapshot-Fundamentals, Kurskorrelation);
  2. bisher nur als Frage geführte, aber mechanisch eindeutige Teile umsetzen (Sizing, Stop-Ausführung, Klassifikation);
  3. jede verbleibende Sperre konkret benennen.
- **Keine Engine wurde verändert.** Das gilt für `methods/*.mjs`, `runner/run-research.mjs` und `runner/snapshot-input.mjs`. Der Code-Fingerabdruck `ae2a51ed86ae…` des Turtle-Acceptance-Gates (AG-3) bleibt gültig; ein Test prüft das (`SF3-RUNNER-FINGERPRINT`).
- Alle neuen Bausteine liegen in `source-faithful/research/` und werden über das Feld `researchEvidence` an die Vertragsregeln gebunden. Ein Regelstatus wurde **nicht** hochgestuft.

## Snapshot-Messung (maßgeblich: Lauf `sf3-research` 39575564781, korrigierter Code; Gegenprobe: Lauf 39573166338)

Eckdaten des Laufs:
- Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Datensatz `EXACT` verifiziert (RESTORE-Beleg).
- 9.211 Segmente, 2.701 Sitzungen. Sec-pit-Fundamentals für 6.289 Wertpapiere.
- Engine-Fingerabdruck `ae2a51ed86ae…` (unverändert).
- Öffentlich sind nur Zählungen; Kennzahlen liegen versiegelt auf `claude/supertrader-validation-results` (`20261021T130218Z`).

Zwei Läufe:
- **Lauf 2 (39575564781, maßgeblich):** Research-Code `76289d0cd9c3…` mit allen Review-Fixes. Versiegelt als `20261021T145819Z`.
- **Lauf 1 (39573166338):** Code vor den Fixes. Turtle-Zählungen und Minervini-Statistiken sind in beiden Läufen identisch. Die Weinstein-Anteile stimmen nach dem M1-Fix innerhalb eines Prozentpunkts überein. Lauf 2 zieht nur jede 8. statt jede 4. Woche als Stichprobe.

### Turtle: Referenz unverändert, Korrelationslimits binden im tatsächlichen Buch nicht

Referenzläufe ohne Gruppen:
- **S1:** 820 Trades, 825 Einstiege.
- **S2:** 559 Trades.
- Beide sind identisch mit den CURRENT_ENGINE-Referenzzählungen, und die Abstimmung ist bestanden. Die Engine ist damit nachweislich unverändert.

| Variante (Unknown-Politik) | S1 Trades | S1 LIMIT6-Ablehnungen | S2 Trades | S2 LIMIT6 | größte enge Gruppe im Universum (Median / Max) |
|---|---|---|---|---|---|
| RAW-126-COMPLETE-70-50 (REPORT_ONLY) | 820 | 0 | 559 | 0 | 29 / 87 |
| RAW-126-COMPLETE-70-50 (POOLED_UNKNOWN) | 889 | 4.694 | 564 | 1.777 | 29 / 87 |
| RAW-63-COMPLETE-70-50 | 820 | 0 | 559 | 0 | 29 / 121 |
| RAW-252-COMPLETE-70-50 | 820 | 0 | 559 | 0 | 31 / 97 |
| RAW-126-COMPLETE-80-60 | 820 | 0 | 559 | 0 | 13 / 51 |
| RES-126-COMPLETE-50-30 | 820 | 0 | 559 | 0 | 51 / 157 |
| RES-126-AVERAGE-50-30 | 820 | 0 | 559 | 0 | 146 / 492 |
| RAW-126-COMPLETE-Q005-Q025 | 820 | 0 | 559 | 0 | 43 / 92 |
| RAW-126-SINGLE-70-50 (Diagnose) | 917 | 1 (LIMIT10: 2.986) | 590 | 1 | 616 / 2.148 |

Konzentration des **tatsächlichen Referenzbuchs** (je Sitzungsende, S1, 2.333 Sitzungen mit Positionen):
- **Units je enger Gruppe:** in allen COMPLETE- und AVERAGE-Varianten höchstens 4. Das entspricht genau einem Titel und ist durch LIMIT4 gedeckt; keine Sitzung liegt über 6 bzw. 10.
- **Paarweise Nachbarschaft:** höchstens 4 bis 5 Units.
- **Mittlere unit-gewichtete Paarkorrelation:** p50 0,11, p95 0,29.
- **Gesamtbuch:** p50 5, max 12 Units.
- **Ausnahme SINGLE (Verkettung):** Hier entstehen marktweite Gruppen (bis 2.148 Titel). Dann liegen 28 Sitzungen über 6 und 137 über 10.

Befund:
- Für die long-only Cash-Adaption mit 1-%-Units hält das Buch selten mehr als 5 Units. Diese Units verteilen sich auf schwach korrelierte Titel.
- Die Absicht von TUR-LIMIT6/10, Risiko in gleichlaufenden Units zu begrenzen, wird im gemessenen Zeitraum **ohne** Limit eingehalten. Das gilt für jede vertretbare Variante.
- Die Datenausnahme der Referenzläufe hat damit nach dieser Messung praktisch keine Wirkung. Das ist kein Freigabeargument; die Regel bleibt quellenoffen.

**Unknown-Anteil:** 9,5 % der Gruppenabfragen der Engine (Lauf 2, `engineLookups`, 126er-Variante: 236.654 von 2.483.801). Die Gründe (kumulierte Zähler, Lauf 1):
- 43 % am Anker nicht im Research-Universum;
- 32 % vor dem ersten vollständigen Anker;
- 25 % mit unvollständigem Renditefenster.

`POOLED_UNKNOWN` behandelt alle unbekannten Titel als einen Block. Das erzeugt die einzigen nennenswerten Ablehnungen. Es zeigt die Größe der Unbekannt-Menge, nicht ein Konzentrationsrisiko.

### Weinstein: Gruppen-Coverage (Variantenvergleich)

| Variante | Mitgliedschaft aufgelöst | Gruppensitzungen gültig | Gruppen mit Chart je Jahr | Kandidaten mit Gruppenevidenz KNOWN |
|---|---|---|---|---|
| SIC3-EW-MIN5-400D-WIDE | 77,8 % | 59,6 % | 145–157 | 51.529 von 71.824 (72 %) |
| SIC3-EW-MIN5-400D-STRICT | 17,8 % | 22,9 % | 19–59 | 7.857 von 71.824 (11 %) |
| SIC2-EW-MIN5-400D-WIDE | 77,8 % | 89,3 % | 60–63 | 54.922 von 71.824 (76 %) |
| SIC4-EW-MIN5-400D-WIDE | 77,8 % | 48,3 % | 179–196 | 48.311 von 71.824 (67 %) |
| SIC3-EW-MIN3-400D-WIDE | 77,8 % | 76,4 % | 188–197 | 53.861 von 71.824 (75 %) |
| SIC3-EW-MIN10-400D-WIDE | 77,8 % | 33,3 % | 83–92 | 44.717 von 71.824 (62 %) |
| SIC3-EW-MIN5-120D-WIDE | 75,5 % | 58,8 % | 145–157 | 49.307 von 71.824 (69 %) |
| SIC3-CAP-MIN5-400D-WIDE | – | – | – | `DATA_BLOCKED` (keine PIT-Aktienzahl) |

Kandidaten sind die Investor- und Trader-Screens jeder 8. Woche (Lauf 2): 43.339 bzw. 28.485.

Befunde:
- **Die strenge Identitätsvariante ist nicht tragfähig.** Die meisten Snapshot-CIKs stammen aus der heutigen Tickerliste (1,67 Mio. gegenüber 0,50 Mio. Auflösungen). Ohne die Annahme `CURRENT_TICKER_MAPPING` bleiben 82 % unbekannt.
- **Hauptgrund für fehlende Mitgliedschaft:** `IDENTITY_NO_CIK` (542.594 Abfragen).
- **SIC3 mit 5 Mitgliedern** ist ein Mittelweg zwischen Granularität und gültigen Charts. SIC2 ist stabiler, aber sehr grob.
- **Kandidaten in SIC3-MIN5-WIDE:**
  - 41.378 von 51.529 (80 %) stehen in Gruppen `ABOVE_RISING_MA30W`;
  - 5.125 (10 %) in Gruppen `BELOW_FALLING_MA30W`. Diese Kandidaten würde das Review-Gate `WEIN-RG-GROUP` als mögliche „negative Gruppe“ zur Entscheidung vorlegen.
- **2022:** Das Bild der Gruppenlabels kehrt sich um (5.162 `BELOW_FALLING` gegen 1.558 `ABOVE_RISING`). Die Gruppenevidenz bildet Branchenrotation und Marktphase also sichtbar ab.

### Minervini: Screen-Statistiken (Monatsenden, keine Strategierendite)

SEPA:
- 101.528 Monatsende-Treffer für Trend Template 1–7.
- Davon hatten 80,3 % ein RS-Perzentil (Proxy) und 81,6 % PIT-Fundamentalevidenz.
- Bei 26.933 Treffern war das EPS-Wachstum beschleunigt (Evidenz, kein Filter).

Power Play, 2016–2026:

| Klasse | Anzahl | Anmerkung |
|---|---|---|
| `CONFIRMED_MECHANICAL_SETUP` | 1.469 | Spitze 2020: 396 |
| `MANUAL_REVIEW_SETUP` | 7.581 | |
| `DATA_BLOCKED_SETUP` | 8.837 | überwiegend junge Notierungen ohne 50 Sitzungen Volumenhistorie vor dem Lauf (IPO-Power-Plays) |

Die Vorwärts-Kursänderung nach einer Klassifikation liegt nur im versiegelten Teil, ausgewiesen als `SCREEN_STATISTIC_FORWARD_PRICE_CHANGE_NOT_A_STRATEGY_RETURN`.

### Kontext

- Branchenrang (Quartalsenden) als Evidenz verfügbar: 66–78 % der notierten Titel je Jahr ab 2017 (Rest: unbekannte Mitgliedschaft oder zu kurze Historie). 2016 ist reine Anlaufzeit.
- Universums-Breite: im Mittel 3.100 Titel je Sitzung.

## Owner-Entscheidungen (21.10.2026)

| Thema | Entscheidung | Umsetzung |
|---|---|---|
| Turtle-Korrelation | keine der acht Varianten als verbindliche Handelsregel; dokumentierte Equity-Research-Modelle | keine Runner-Änderung, Turtle-Acceptance unverändert; Vertragsbegründung `TUR-SF-LIMIT-CORR` ergänzt |
| Weinstein-Gruppen | SIC3 mit mindestens fünf Mitgliedern als klar gekennzeichnete Research-Referenz; nicht `SOURCE_EXACT`, kein Trading-Gate | `WEIN-SF-GROUP` bleibt `DATA_BLOCKED`, Review-Gate `WEIN-RG-GROUP`; übrige Varianten bleiben als Vergleich |
| Minervini | Komponenten vollständig erhalten; mechanisch bestätigte Setups nie als handelbare oder profitable Strategie | jede Klassifikation trägt `NOT_A_TRADABLE_STRATEGY` / `performanceClaim: NONE` (Test `GC-MIN-NOT-A-STRATEGY`) |
| Historische Aktienzahlen | kein neuer Snapshot-Capture | Datenanforderung in `DATA_FRONTIER` (`CAP-weighted group index`) dokumentiert |

## 1. Welche 13 Methoden wurden weiterentwickelt?

| Kandidat | Methode | Fortschritt in diesem Auftrag |
|---|---|---|
| C01/C02 | Turtle S1/S2 | Korrelationslimits als vorregistrierte Equity-Modellvarianten, Konzentrationsmessung, Vorher/Nachher-Lauf auf dem Snapshot |
| C03 | Darvas Box | Branchenrang in der PIT-SIC-Gruppe („stärkste Aktie der Branche“), Marktbreite |
| C04/C05 | Weinstein Investor/Trader | PIT-Gruppenchart (SIC-Stellvertreter), Gruppen-Stage-Evidenz, Gruppen-RS, Breite, Volumen, Rotation, Universums-Breite; an Kandidaten angehängt mit Review-Gate |
| C06 | Minervini SEPA/VCP | PIT-RS-Perzentil, PIT-Fundamentals, VCP-Kontraktionsfolge, Pivot-Ausbruch, Sizing-Rechner, mechanische Stop-Ausführung, Sell-Evidenz, Klassifikation |
| C07 | Minervini Power Play | Vier-Klassen-Klassifikation, Ausbruch über das Laufhoch, Stop-Referenz |
| C08 | Kullamägi Breakout | Branchenrang, Breite (`KK-SF-PRIORITY`); ORH bleibt `DATA_BLOCKED` |
| C09 | Kullamägi Episodic Pivot | Datengrenze konkret: 8-K-Item-2.02-Zeitstempel für das Katalysatordatum, IEX-Minuten venue-begrenzt; keine Tagesbalken-Ersatzlogik |
| C10 | Kullamägi Parabolic Short | Datengrenze: kein freier Weg zu historischer Leihe; kein Short-Backtest |
| C11/C12 | Pocket Pivot / Buyable Gap-Up | Leadership- und Markt-Evidenz (`MOKA-SF-*-CONTEXT`); Megacap braucht PIT-Aktienzahl (r13) |
| C13 | Raschke Holy Grail | quellenblockiert bestätigt (Einstieg, Stop, Größe); keine Regel ergänzt |

## 2. Welche neuen mechanischen Komponenten sind vollständig?

| Komponente | Datei#Funktion | Status |
|---|---|---|
| Kausale Korrelationsgruppen (8 Varianten, 2 Unknown-Politiken) | `turtle-correlation.mjs#createCorrelationGroupProvider` | vollständig, getestet; Modellannahme |
| NN-Chain-Clustering (SINGLE/COMPLETE/AVERAGE) mit verschachtelten Schnitten | `turtle-correlation.mjs#nnChainLinkage`, `#cutDendrogram` | vollständig, Golden Case |
| Konzentrationsmessung tatsächlicher Läufe | `turtle-correlation.mjs#concentrationReport` | vollständig |
| PIT-Gruppenindex (gleichgewichtet), CAP-Pfad | `industry-strength.mjs#buildGroupIndices` | vollständig; CAP im Snapshot `DATA_BLOCKED` |
| Gruppen-Stage-Evidenz, RS, Breite, Volumen, Rotation | `industry-strength.mjs` | vollständig (Evidenz) |
| Universums-Breite (A/D, Momentum-Proxy, Hochs/Tiefs) | `market-breadth.mjs#buildMarketBreadth` | vollständig (Proxy) |
| PIT-RS-Perzentil | `minervini-components.mjs#createRsPercentileProxy` | vollständig (Proxy, nie Gate) |
| PIT-Fundamentals (EPS/Umsatz YoY) | `#fundamentalEvidence` | vollständig (Evidenz, ohne Schwelle) |
| Positionsgröße aus Reviewer-Risiko, 25-%-Deckel | `#positionSize` | vollständig, mechanisch bei gegebenem Risiko |
| Stop-Ausführung unabhängig vom Volumen | `#sellEvidence` | vollständig, mechanisch bei gegebenem Stop |
| Power-Play-Klassifikation | `#powerPlayClassify` | vollständig |
| Branchenrang in der PIT-Gruppe | `context-evidence.mjs#industryLeadership` | vollständig (Evidenz) |
| Sechs-Dimensionen-Readiness | `completion/build-readiness-sf3.mjs` | generiert, Teil von `rebuild-all` |
| Snapshot-Runner `sf3-research` | `research/run-sf3-research.mjs` | fail-closed wie `sf-research` |

## 3. Welche Turtle-Korrelationsvarianten sind fachlich vertretbar?

Die Originalregel bleibt **quellenoffen**: W-TUR nennt kein Maß, kein Fenster und keine Schwelle. Vertretbar als **Equity-Modellannahme** sind Varianten, die drei Eigenschaften erhalten:
- die Absicht der Quelle, also Risiko in gleichlaufenden Units zu begrenzen;
- die Verschachtelung eng ⊂ lose;
- die paarweise Lesart der Beispiele.

Daraus folgt:
- **COMPLETE-Linkage** (jedes Paar erfüllt die Schwelle) ist der Lesart der Beispiele am nächsten. SINGLE verkettet zu marktweiten Gruppen und dient nur der Diagnose.
- **Marktresiduen** trennen gemeinsamen Marktfaktor von Substitut- oder Branchengleichlauf. Die Beispiele der Quelle (Gold/Silber, Rohöl/Heizöl) sind Gleichlauf aus gleicher Grundexposition, nicht aus dem Gesamtmarkt.
- **Paar-Quantil-Schwellen** sind regime-robust. Absolute Rohschwellen verschmelzen in Korrelationsspitzen das Universum (synthetischer Test `SF3-TUR-CORR-QUANTILE`).
- Fenster 63, 126 und 252 sowie die Schwellen sind Sensitivitäten, keine Empfehlung. **Ausgewählt wird nicht nach Rendite.**

Snapshot-Messung (Abschnitt oben):
- Im tatsächlichen Referenzbuch binden die Limits unter keiner COMPLETE- oder AVERAGE-Variante; das Buch hält höchstens 4 Units je enger Gruppe.
- Nur die Verkettung (SINGLE) erzeugt marktweite Pseudogruppen.
- Eine Freigabe einer Variante würde die Referenzergebnisse daher kaum verändern. Sie bleibt trotzdem eine Owner-Entscheidung über eine Modellannahme.

## 4. Wie wird historische Weinstein-Branchenstärke gemessen?

Als **VU-Stellvertreter** des Gruppencharts (`VU_PROXY_OF_WEINSTEIN_GROUP_CHART`):
1. **Mitgliedschaft:** PIT-SEC-SIC je ISO-Woche, abgefragt an der Vorsitzung.
2. **Index:** gleichgewichteter Kettenindex mit Mindestmitgliedern; strikte Lücken (`TOO_FEW_MEMBERS`, Woche ohne Schluss).
3. **Evidenz:** MA30w-Relation der Gruppe, Gruppen-RS gegen SPY, Anteil der Mitglieder über ihrer steigenden MA30w, Volumen-Ratio, Rangliste nach 13-Wochen-RS.
4. **Varianten:** SIC2/3/4, Mindestgröße 3/5/10, Fortschreibung 120/400 Tage, Identitätsbelege streng oder weit.

Grenzen:
- Kapitalgewichtung ist im eingefrorenen Snapshot `DATA_BLOCKED` (keine PIT-Aktienzahl).
- `WEIN-SF-GROUP` bleibt `DATA_BLOCKED`, weil SIC nicht Weinsteins Gruppenliste ist. Die Stage der Gruppe entscheidet der Reviewer (Gate `WEIN-RG-GROUP`).

## 5. Wie weit ist Minervini SEPA/VCP tatsächlich automatisierbar?

**Automatisierbar ist der Screen, nicht die Strategie.**

| Teil | Stand |
|---|---|
| Trend Template 1–7 | mechanisch, als Übersetzung ungeprüft |
| Kriterium 8 (IBD-RS) | `DATA_BLOCKED`; PIT-Perzentil als Proxy, nie Gate |
| Fundamentals | PIT-Evidenz ohne Schwelle; Qualität (Einmaleffekte) braucht den Filing-Text |
| VCP | Kontraktionsfolge als Evidenz; die Gültigkeit des Musters ist manuell, weil die Quelle keine Zähl- oder Halbierungsregel setzt |
| Pivot | Ereignis mechanisch, Volumenurteil in zwei Lesarten |
| Größe | mechanisch bei vom Reviewer gesetztem Risiko |
| Stop | mechanisch, sobald gesetzt |
| Relative Priorität, Einstieg, Sell in Strength | manuell |

## 6. Wie weit ist Minervini Power Play tatsächlich automatisierbar?

- **Mechanisch entscheidbar:** Lauf ≥ +100 % in < 8 Wochen, Korrektur ≤ 25 %, Enge ≤ 10 %, Dauer.
- **Daraus folgen vier Klassen:** `CONFIRMED_MECHANICAL_SETUP`, `MANUAL_REVIEW_SETUP` (Bereich 20–25 %, ODER-Zweig „VCP-Merkmale“, lange Basis), `DATA_BLOCKED_SETUP` und `NOT_QUALIFIED`.
- **Manuell bleiben:** das Urteil „starkes Startvolumen“, Einstieg, Stop und Größe.

## 7. Welche Strategien können vollständig diagnostisch getestet werden?

- Nur **Turtle S1 und S2** (`FULL_DIAGNOSTIC_STRATEGY_BACKTEST`). Auch hier gibt es eine Datenausnahme: Die Korrelationslimits sind in den Referenzläufen nicht durchgesetzt. Die Varianten laufen als Vorher/Nachher-Vergleich daneben.
- Darvas ist eine **mechanische Komponentenstudie**.
- Weinstein, Minervini (beide), KK Breakout, Pocket Pivot und BGU erlauben nur **Screen-Statistiken**.

## 8. Welche brauchen manuelle Prüfung?

- **Darvas:** 8 wesentliche Entscheidungen.
- **Weinstein:** 14 (Investor) bzw. 12 (Trader).
- **Minervini:** 11 (SEPA) bzw. 6 (Power Play).
- **KK Breakout:** 7.
- **Pocket Pivot / BGU:** 7 bzw. 8.
- **EP / Parabolic Short:** 2 bzw. 4.
- **Holy Grail:** 3.
- **Turtle:** keine.

## 9. Welche sind durch Daten blockiert?

| Strategie | blockierende Daten |
|---|---|
| Episodic Pivot | Katalysator, Eröffnungsvolumen, ORH |
| Parabolic Short | Leihe, Intraday-Einstieg, VWAP-Stop |
| Turtle-Short | Leihe (nur Original) |
| KK Breakout ORH-Variante | Intraday |
| Weinstein | NYSE-Breite, Gruppenliste (Proxy vorhanden) |
| Minervini | IBD-RS, Schätzungen/Guidance |
| CAP-Gruppen und BGU-Megacap | PIT-Aktienzahl, die im Snapshot fehlt |

Details: `context-evidence.mjs#DATA_FRONTIER`.

## 10. Welche sind durch Primärquellen blockiert?

- Holy Grail: Einstieg, Stop, Größe.
- Turtle: Korrelationsmaß, Failsafe-Exit, offener Ausbruch (beide Lesarten laufen).
- Darvas: Bottom-Start.
- Morales/Kacher: MA-Verletzung (MOKA-C2), BGU-Volumenfenster.
- Episodic Pivot: Exit.

## 11. Welche Daten würden die größten zusätzlichen Fortschritte ermöglichen?

1. **PIT-Aktienzahl im Snapshot.** Sec-pit r13 liegt im privaten Store; nötig ist nur ein neuer Capture mit dem zusätzlichen Schlüssel. Das ist kostenfrei und schaltet kapitalgewichtete Gruppen und die Megacap-Evidenz frei.
2. **Eingefrorene IEX-Minuten der Triggertage** (privater r9-Cache ab 2017). Damit werden folgende Teile evaluierbar, venue-begrenzt:
   - ORH-Einstiege (KK);
   - EP-Eröffnungsvolumen;
   - Turtle-Intrabar-Reihenfolge (`MA-TUR-INTRABAR-ORDER`).
3. **SEC 8-K Item 2.02 Annahmezeitpunkte** (kostenfrei, je CIK): PIT-Kalender der Ergebnisveröffentlichungen für das EP-Katalysatordatum.
4. **Kostenpflichtig, nur mit Owner-Freigabe:** Schätzungen/Guidance (Minervini, EP) und historische Leihe (Short-Seite).

## 12. Welche Tests und Reviews wurden bestanden?

| Prüfung | Ergebnis |
|---|---|
| `node --test "scripts/supertrader/tests/*.test.mjs"` | 525 Tests: 524 bestanden, 1 bestehender Skip, 0 fehlgeschlagen |
| neue Suiten | `sf-turtle-correlation-research` 11, `sf-industry-strength-research` 8, `sf-minervini-components` 10, `sf-context-evidence-research` 3, `sf-sf3-runner-research` 3 |
| Golden Record (`rebuild-all`) | 115/115 Golden Cases PASS, 208 Tests, 0 fehlgeschlagen |
| CI auf allen fünf PR-Zweigen | grün (Core, Supertrader Quality Gates, CI Config, Currency & FX) |
| Artefakte = frischer Build | bestanden (SF2-COMPLETION-ARTIFACTS, SF3-READINESS) |
| Gate A (`guard-protected-paths.mjs`) | nur Supertrader-Pfade, bestanden |
| Test-Isolation (`check-test-isolation.mjs`) | bestanden |
| AG-3-Code-Fingerabdruck | unverändert (`SF3-RUNNER-FINGERPRINT`) |
| Unabhängiges adversariales Review | 0 CRITICAL, 0 HIGH; 2 MEDIUM (M1, M2) und 4 LOW behoben (siehe Abschnitt „Review“) |
| Snapshot-Läufe `sf3-research` 39575564781 (maßgeblich) und 39573166338 | beide erfolgreich: Datensatz `EXACT`, Turtle-Referenz identisch mit CURRENT_ENGINE, alle Varianten abgestimmt, Ergebnisse zwischen den Läufen konsistent |

## Review

Ein unabhängiges adversariales Review über den gesamten Diff fand **keine CRITICAL- oder HIGH-Befunde**.

Geprüft und bestätigt:
- **NN-Chain-Clustering:** gegen eine naive Referenz auf 3.000 Zufallsmatrizen inklusive Ties, ohne Abweichung.
- **Lance-Williams-Updates und Terminierung:** korrekt.
- **PIT-Grenzen:** Anker, Wochen-Roster, Breite, Fundamentals und Branchenrang halten sie ein.
- **Unknown-Politik:** explizit, ohne Voreinstellung.
- **Ledger-Unit-Buchhaltung:** korrekt.
- **Workflow:** Eingaben nur über `env:`, fail closed, keine neuen Rechte.
- **Statusangaben:** kein Regelstatus hochgestuft.

| Befund | Schwere | Behebung |
|---|---|---|
| M1 Gruppenevidenz bei Mitgliedschaftslücken konnte eine Monate alte Woche als KNOWN melden | MEDIUM | Lücken als UNKNOWN-Sitzungen, Evidenz nur aus der Kalendervorwoche; Test `SF3-WEIN-GROUP-GAP` |
| M2 Kontext-Evidenz fiel bei einem Nicht-Handelstag auf das Datenende zurück (Lookahead, latent) | MEDIUM | Entscheidungswoche aus dem Datum selbst; Test in `SF3-CTX-APPEND` |
| L1 kumulative Provider-Zähler als Lauf-Abdeckung ausgewiesen | LOW | `engineLookups` je Lauf als Differenz |
| L2 Power-Play-Ausbruch am Klassifikationsbalken konnte nie auslösen | LOW | Pivot gesetzt (`PIVOT_SET_AWAITING_BREAKOUT`), Ausbruch an späterem Balken |
| L3 Laufzeit: doppelte Ankerberechnung, Weinstein-Stichprobe | LOW | geteilter Anker-Cache, Stichprobe jede 8. Woche |
| L4 Readiness überbewertete den Kontext-Teil; Klassifikation `TUR-SF-LIMIT-CORR` | LOW | Kontext als reine Abdeckungsmessung benannt. `TUR-SF-LIMIT-CORR` ist im Lückenmodell eine Datenausnahme mit umgesetzter Mechanik; die Operationalisierung ist quellenoffen. Beides gilt gleichzeitig. |

## 13. Welche Draft-PRs wurden erstellt?

| PR | Inhalt | Basis |
|---|---|---|
| [#821](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/821) | Turtle-Korrelationsforschung | `main` |
| [#822](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/822) | Weinstein-Branchenstärke und Universums-Breite | #821 |
| [#823](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/823) | Minervini SEPA/VCP und Power Play | #822 |
| [#824](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/824) | Kontext-Evidenz Darvas/KK/MoKa, Daten- und Quellengrenze | #823 |
| [#825](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/825) | Snapshot-Runner und Workflow-Modus, Verträge (`researchEvidence`), Readiness, Artefakte, dieser Bericht | #824 |

Die PRs sind gestapelt, weil die generierten Artefakte nur einmal am Ende neu gebaut werden. Ein paralleler Neubau in mehreren PRs würde Konflikte erzeugen. Keine Merges ohne Owner-Freigabe.

## 14. Nächste Schritte zu wirklich nutzbaren Supertrader-Strategien

1. **Turtle:** entschieden (keine Variante aktiv). Eine spätere Aktivierung bräuchte eine eigene Szenariozeile im Runner und einen neuen AG-3-Lauf.
2. **Snapshot-Erweiterung:** zurückgestellt (Owner). Ein späterer Capture mit `sec-pit-r13` würde CAP-Gruppen und die Megacap-Evidenz ermöglichen.
3. **Weinstein:** SIC3 / min. 5 ist als Research-Referenz entschieden. Nächster Schritt wäre ein Reviewer-Pilot mit Gruppenchart-Evidenz an echten Kandidaten, weiterhin ohne Gate.
4. **Minervini:** Review-Paket (`sepaClassify` / `powerPlayClassify`) in die bestehende Supertrader-Review-Oberfläche einbinden. Das ist ein eigener Produkt-PR ohne UI-Neugestaltung und ohne Kaufsignal.
5. **Intraday-Erweiterung:** IEX-Minuten der Triggertage einfrieren. Damit werden die Turtle-Intrabar-Annahme und die KK-ORH-Varianten messbar.
6. **Zertifizierung:** V4-D1 (nicht deklarierte Reverse-Splits) und V4-D2 (Gattungen) im Quant-PR schließen. Erst danach sind historische Zahlen zertifizierbar.
