# Vision Universe – Backtest-Impact-Audit der Kursdatenfehler

Stand: 17. Oktober 2026. Diagnostischer Lauf, **nicht zertifizierend**. Keine Strategieregel, kein Parameter, keine Schwelle und keine Quarantäne-Regel wurde geändert. Kein CERTIFIED-Label.

Begleitdokument: [VISION_UNIVERSE_CANONICAL_DATA_ROOT_CAUSE_AUDIT.md](VISION_UNIVERSE_CANONICAL_DATA_ROOT_CAUSE_AUDIT.md). Strukturierte Ergebnisse: [`docs/data-quality/root-cause-audit/`](data-quality/root-cause-audit/).

## Kurzantwort

**Die Datenfehler erklären die Unterperformance der sechs historischen Methoden nicht.** Alle sechs bleiben in allen sieben Szenarien unter SPY (`UNDERPERFORMANCE_REMAINS`).

- **Kleiner Effekt bei vier Methoden.** Cross-sectional Momentum, 52-Week-High, Low Volatility und Kullamägi ändern sich um höchstens 0,6 Prozentpunkte CAGR. Das gilt auch für die obere Schranke D, in der jedes ungeklärte Ereignis gesperrt wird.
- **Großer Effekt bei Turtle, aber von genau einem Ereignis.** Ein einzelner Trade lief über eine Kapitalmaßnahme, die Tiingo in beiden Spalten fehlt und die eine unabhängige Quelle bestätigt. Er kostete 18,7 % des Endvermögens. Mit der bestätigten Korrektur (Szenario C) steigt die Turtle-CAGR um 4,1 Punkte, bleibt aber unter SPY.
- **Weinstein reagiert auf VU-Infrastrukturfehler, nicht auf Kursdaten.** Mit den bestätigten VU-Bugfixes A4/A5/A8 sinkt die CAGR um 0,7 Punkte, und der Drawdown wird 2,8 Punkte flacher.
- **Die externe French-Kalibrierung reagiert fast nur auf ungeklärte Fälle.** Die unabhängig bestätigten Korrekturen allein heben die EW-Korrelation von 0,145 auf 0,146. Erst das Herausnehmen der nicht bestätigten Fälle ergibt 0,963 bis 0,992 (Abschnitt 6).

## 1. Was technisch möglich war und was nicht

| Vergleich | Möglich? | Grund |
|---|---|---|
| Originalzahlen der Tournament-Läufe (#677, Run 38685897684) lesen | **nein** | Owner- und Session-versiegelt; der Session-Schlüssel ist in dieser Umgebung nicht vorhanden |
| Originaldaten bitgleich wiederherstellen | **nein** | Die R2-Historienablage ist live. Fingerabdruck der Freeze-Daten `318c051f…` (9.408 Segmente, 14.374.702 Bars). Heute `b3ca8681…` (9.407 Segmente, 14.371.749 Bars): −1 Segment, −2.953 Bars (−0,02 %). Schon die Läufe von #737 (`aea43179…`, `c8715919…`) und #758 (`b3ca8681…`) lagen nicht auf den Freeze-Daten (`sameCanonicalContentAsV4Freeze: false` in deren eigenen PREPARE-Dateien). |
| Eingefrorene Methoden- und Runner-Codes ausführen | **ja** | gepinnter #705-Head `547d604d`; Methoden aus `tournament/methods.mjs#historicalParticipants`, Runner `runner-certified-v3.mjs` (Original) und `v4/methods/runner-v4.mjs` (V4-Infrastruktur) |
| Szenarien untereinander vergleichen | **ja** | alle Szenarien eines Laufs auf derselben Kopie (gleiche Daten, gleicher Code, nur die Szenario-Transformation unterscheidet sich) |

**Deshalb heißt Szenario A hier „Replay der Originalkonstruktion auf der heutigen Datenkopie“.** Es ist kein wiederhergestelltes Originalergebnis. Alle Aussagen sind Differenzen zwischen Szenarien. Absolute CAGR-, Drawdown- und Sharpe-Werte sind nur an den Owner versiegelt (`run-39053330565/sealed/`). Damit gilt dieselbe Regel wie in #677/#705.

Lauf: Actions-Run [39053330565](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39053330565), Workflow `.github/workflows/research-price-root-cause-audit.yml`, Code `scripts/research/price-root-cause/`.

## 2. Szenarien

| ID | Inhalt | Belegbasis |
|---|---|---|
| **A** ORIGINAL | Tournament-Daten und `runner-certified-v3` wie im Original | Replay |
| **B1** A5_TIMING | A, nur der Quarantäne-Termin kausal (max(from, observedAt)) | V4-Befund A5, erste Hälfte |
| **B** VU_BUGS | V4-Infrastruktur: Stale-Limit 5 Sessions (A4), kausaler Quarantäne-Termin und Datenereignis-Faktor 1 statt 0,7 (A5), wertbewusster Dust (A8) | nachgewiesene VU-Fehler, behoben nur in `runner-v4` und nie auf die sechs Methoden angewendet |
| **C** INDEPENDENT | B plus nur die Korrekturen, die eine unabhängige Quelle belegt. Ein FINRA- oder SEC-8-K-Verhältnis wird wie ein deklarierter Split angewendet; eine nur durch SEC-Aktienzahlen belegte Maßnahme und ein bestätigter Split-Rest werden ab dem Ereignistag gesperrt. | SEC 8-K, FINRA OTC Daily List, SEC-Aktienzahlen |
| **D** UNRESOLVED_CUT | C plus Sperre ab jedem übrigen Census-Ereignis | obere Schranke der Sensitivität, keine Korrektur |
| **E** WHOLE_SERIES | B, aber jede quarantänisierte Historie ganz entfernt statt gültigem Präfix | Policy-Vergleich |
| **F** V4_FORENSIC | B plus V4-Price-Sanity-Quarantäne (VUs eigener forensischer Klassifikator, kein unabhängiger Beleg) | Vergleich |

Census = jeder Tag im gültigen Tournament-Präfix mit rohem Übernachtsprung ≥ 10× oder ≤ 1/10 ohne deklarierten Split, und jeder deklarierte Split-Tag mit TR-Schritt ≥ 2×. Das sind die Definitionen von #705/#721. Sie werden hier übernommen, nicht neu gesetzt: **616 Ereignisse in 226 Segmenten**.

## 3. Ergebnis je Methode (Δ gegenüber A, Prozentpunkte)

**CAGR**

| Methode | B1 | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 0,0 | +0,2 | +0,2 | +0,6 | +0,3 | +0,2 |
| 52-Week-High | 0,0 | +0,1 | +0,1 | +0,2 | +0,2 | +0,1 |
| Low Volatility | 0,0 | +0,1 | 0,0 | 0,0 | +0,1 | 0,0 |
| Turtle S2 Equity Daily | 0,0 | +2,0 | +4,1 | +2,7 | +0,7 | +2,0 |
| Weinstein Stage Daily | 0,0 | −0,7 | −0,7 | −0,7 | −1,3 | −0,7 |
| Kullamägi Daily | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |

**Maximaler Drawdown** (positiv = flacher)

| Methode | B1 | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 0,0 | 0,0 | 0,0 | 0,0 | +0,1 | 0,0 |
| 52-Week-High | 0,0 | 0,0 | 0,0 | 0,0 | −0,1 | 0,0 |
| Low Volatility | 0,0 | 0,0 | 0,0 | 0,0 | −0,2 | 0,0 |
| Turtle S2 Equity Daily | 0,0 | +1,7 | +3,8 | +2,4 | +0,5 | +1,7 |
| Weinstein Stage Daily | 0,0 | +2,8 | +2,8 | +2,8 | +2,8 | +2,8 |
| Kullamägi Daily | 0,0 | 0,0 | 0,0 | 0,0 | −0,3 | 0,0 |

**Gegenüber SPY:** in allen 42 Kombinationen (6 Methoden × 7 Szenarien) `BELOW_SPY`. Die Differenz zu SPY ändert sich um dieselben Werte wie die CAGR, denn der Benchmark ist in allen Szenarien derselbe.

**Cash/Exposure:** Die mittlere Exposure ändert sich höchstens um 0,6 Punkte (Weinstein B). Die Unterperformance ist also kein Exposure-Artefakt der Datenfehler.

**Rangfolge:** siehe Abschnitt 5.

## 4. Welche Trades waren direkt betroffen? (Szenario A)

| Methode | Trade-Datensätze | in Ereignis-Wertpapieren | davon versch. Wertpapiere | **über ein Ereignis gehalten** | Positions-Monate am Ereignis | Einstieg ≤ 252 Sessions nach Ereignis | P&L der überspannenden Trades / Endvermögen |
|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 36.912 | 376 | 69 | **24** | 15 | 87 | +0,5 % |
| 52-Week-High | 84.934 | 232 | 38 | **21** | 11 | 26 | −0,1 % |
| Low Volatility | 14.071 | 48 | 2 | **1** | 1 | 0 | 0,0 % |
| Turtle S2 Equity Daily | 753 | 13 | 10 | **1** | 1 | 0 | **−18,7 %** |
| Weinstein Stage Daily | 172 | 0 | 0 | 0 | 0 | 0 | 0 |
| Kullamägi Daily | 131 | 0 | 0 | 0 | 0 | 0 | 0 |

Klasse der überspannten Ereignisse (unabhängige Belege ohne Vendor):
- **Momentum:** 9 mit Gegenbeleg gegen einen Split (SEC-Aktienzahl unverändert), 20 ohne jeden Beleg, 2 ungeklärt.
- **52W:** 17 mit Gegenbeleg, 11 ohne Beleg.
- **Low Volatility:** 1 mit Gegenbeleg.
- **Turtle:** 1 unabhängig bestätigte, vom Provider nicht deklarierte Kapitalmaßnahme.

**Direkt betroffen gegenüber nur im Universum:**
- **Direkt (gehalten).** Gehaltene Positionen über einem Ereignis sind selten: höchstens 24 von 36.912 Trade-Datensätzen. Nur bei Turtle ist der Effekt groß, wegen der konzentrierten Positionsgröße.
- **Indirekt (Signal/Ranking).** Momentum und 52W kaufen nach einem Ereignis häufiger: 87 beziehungsweise 26 Einstiege in Ereignis-Wertpapiere binnen eines Jahres danach. Die Look-back-Rendite oder das 52-Wochen-Niveau enthält dann den Sprung. Wer nach dem Sprung kauft, verdient allerdings die echte Rendite ab dem Sprungniveau. Das erklärt, warum D (Sperre ab jedem Ereignis) bei Momentum nur +0,6 Punkte bewirkt.
- **Universumseffekt.** Rangbildende Wertpapiere, die nie gekauft wurden, verschieben Breakpoints und Ränge. Dieser Effekt ist in den Szenario-Deltas enthalten, wird aber nicht getrennt ausgewiesen: Die Methoden sind eingefroren, und ein getrennter Ausweis würde ihren Code verändern.

## 5. Rangfolge

Der Rangvergleich braucht absolute Werte aller sechs Methoden an einer Stelle. Er läuft deshalb als eigener Ein-Prozess-Lauf (`ranking.mjs`, Szenarien A/B/C), der nur Ränge veröffentlicht.

<!-- RANKING -->

## 6. Externe French-Kalibrierung: Woher kam 0,145 → 0,992?

Gleiche V4-Konstruktion (EW-Markt, Freeze V4-Pipeline) auf der heutigen Kopie. Die Baseline 0,145 und die Diagnose 0,992 sind exakt reproduziert.

| Variante (EW-Korrelation mit French) | ausgeschlossene Security-Months | Korrelation |
|---|---|---|
| Baseline | 0 | 0,145 |
| ohne die 83 (Datensignatur) | 83 | 0,992 |
| ohne alle \|r\| > 100 % | 2.200 | 0,990 |
| ohne nur die 43 forensischen Defekte (#722) | 43 | 0,992 |
| ohne nur die 40 forensisch „echten“ | 40 | 0,145 |
| **ohne nur die 27 unabhängig bestätigten** | 27 | **0,146** |
| **ohne die 56 nicht unabhängig bestätigten** | 56 | **0,963** |
| ohne nur die 55 unerklärten Rohsprünge ≥ 10× | 55 | 0,992 |
| ohne nur die 28 Monate mit deklariertem Split | 28 | 0,144 |

Volle Konstruktion (EW, Momentum-Dezile, Varianz-Quintile):

| Variante | EW-Korr. | MOM-Spread-Korr. | VAR-Spread-Korr. |
|---|---|---|---|
| V4-Baseline | 0,145 | 0,038 | −0,002 |
| C – nur unabhängig belegte Korrekturen | 0,146 | 0,034 | −0,001 |
| D – Sperre ab jedem Census-Ereignis | 0,992 | 0,824 | 0,963 |
| E – ganze quarantänisierte Historien entfernt | 0,146 | 0,037 | −0,009 |

Lesart:
- **Unabhängig bestätigte Korrekturen erklären praktisch nichts von der Kalibrierungslücke.** Nur 0,145 → 0,146.
- **Die Lücke stammt aus einer Handvoll nicht bestätigter, aufwärts gerichteter Sprünge ≥ 10× bei Pennystocks.** Sie sind weder als Kapitalmaßnahme noch als echte Bewegung belegt. Sie zu sperren repariert EW, Momentum und Varianz zugleich, aber nur als Sensitivität und nicht als belegte Korrektur.
- **Universumsunterschied bleibt.** VU hält im Mittel 1,337-mal so viele Titel wie French, also mehr Nebenwerte. Auch in der besten Variante bleibt ein Niveauunterschied (Betrag nur versiegelt, Review IR-20); die Varianten D und Ausschluss-83 verfehlen damit weiter die vorab registrierten Toleranzen (FAIL). Der Rest ist Universum, Konstruktion (EW monatlich, Juni-Mitgliedschaft), Delisting-Annahmen und Kosten. Er ist nicht weiter trennbar, weil das CRSP-Universum nicht verfügbar ist.
- **0,992 ist keine Zertifizierung und begründet keine Ausschlussregel.** Ebenso stark ist „ohne Rohstart < 1 $“ (0,992, #705-Diagnose), und Winsorisieren ergibt 0,994. Die Korrelation misst hier die Behandlung eines extremen Pennystock-Randes, nicht die Korrektheit einzelner Fälle.

## 7. Kausale Zerlegung (je Methode, CAGR-Punkte)

| Schritt | Effekt | Momentum | 52W | LowVol | Turtle | Weinstein | Kullamägi |
|---|---|---|---|---|---|---|---|
| A → B1 | A5-Termin (Look-ahead) | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| B1 → B | A4 Stale-Limit + A5-Faktor 1 + A8 Dust (VU-Accounting) | +0,2 | +0,1 | +0,1 | +2,0 | −0,7 | 0,0 |
| B → C | unabhängig belegte Daten-/CA-Korrektur | 0,0 | 0,0 | −0,1 | +2,1 | 0,0 | 0,0 |
| C → D | Sensitivität ungeklärter Ereignisse (obere Schranke) | +0,4 | +0,1 | 0,0 | −1,4 | 0,0 | 0,0 |
| B → E | Policy: ganze Historie statt Präfix | +0,1 | +0,1 | 0,0 | −1,3 | −0,6 | 0,0 |

**Interaktion:**
- B → C und C → D sind nicht additiv. Eine Sperre in D kann einen in C normalisierten Trade wieder beenden; bei Turtle ist D deshalb niedriger als C.
- E entfernt ganze Historien, nicht nur fehlerhafte Tage. Damit vermischt E Survivorship mit Datenqualität: 521 Segmente fehlen ganz.
- Die Spalten addieren sich nicht zu einer „Provider vs. VU“-Quote; das wäre eine künstliche Zahl (Auftrag Abschnitt 7).

## 8. Quarantäne- und Hold-Effekt

- **Original-Tournament.** Es hat 521 quarantänisierte Segmente. Das gültige Präfix bleibt nutzbar.
  - Gründe: 434 Listing-Lücken, 63 Corporate-Action-Widersprüche, 16 fehlende Dividenden, 8 ungültige OHLCV.
  - Kosten: 401.827 nicht genutzte Bars nach dem Quarantänetag, 2,72 % der Ablage-Bars im Tournament-Zeitraum.
- **Quarantäne-Bias im Original.** Eine Datenquarantäne wurde wie ein Delisting mit −30 % abgerechnet (A5). Die Korrektur auf Faktor 1 ist in B enthalten und kostet oder bringt höchstens 0,2 Punkte; die Ausnahmen sind Turtle (+2,0) und Weinstein (−0,7), bei denen A4 mitwirkt.
- **Whole-Series-Policy (E) statt Präfix.**
  - Ändert die CAGR um höchstens 1,3 Punkte (Weinstein).
  - Entfernt 521 von 9.407 Segmenten.
  - Bei Momentum und 52W fallen dadurch 309 beziehungsweise 794 Trades weg.

## 9. Historische Outperformance-Frage

**Ergebnis: `UNDERPERFORMANCE_REMAINS`.** Keine Methode erreicht in einem Szenario SPY.

Daraus folgt nicht, dass die Methoden „gut“ wären, wenn die Daten noch besser würden. Die größte belegte Datenkorrektur (Turtle, C) ist ein einzelner Trade. Keine Methode wurde optimiert, kein Parameter verändert.

## 10. Grenzen

- **A ist ein Replay auf der heutigen Kopie, nicht das versiegelte Original.** Der Unterschied ist klein (−1 Segment, −0,02 % Bars), aber nicht null.
- **Unabhängige Belege ohne zweiten Preisanbieter.** FINRA deckt nur OTC ab; SEC-Aktienzahlen sind ein schwacher Kanal. Der Yahoo-Vendor aus #758 wurde bewusst nicht benutzt (Auftrag: keine erneute Veröffentlichung) und ist nicht im Runner reproduzierbar (#758 R3-01).
- **„Ohne Beleg“ heißt nicht „echt“.** D ist eine Schranke, keine Korrektur.
- **Das Universum bleibt beobachtungsbasiert** (OBSERVED_PANEL_NOT_PIT_COMPLETE). Delisting-Erlöse bleiben Szenarien.
- **Dieser Lauf ist nicht zertifizierend** und ersetzt keine vorab registrierte Kalibrierung.
