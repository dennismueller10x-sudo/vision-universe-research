# Vision Universe – Backtest-Impact-Audit der Kursdatenfehler

Stand: 18. Oktober 2026. Diagnostischer Lauf, **nicht zertifizierend**. Keine Strategieregel, kein Parameter, keine Schwelle und keine Quarantäne-Regel wurde geändert. Kein CERTIFIED-Label.

Begleitdokument: [VISION_UNIVERSE_CANONICAL_DATA_ROOT_CAUSE_AUDIT.md](VISION_UNIVERSE_CANONICAL_DATA_ROOT_CAUSE_AUDIT.md). Strukturierte Ergebnisse: [`docs/data-quality/root-cause-audit/`](data-quality/root-cause-audit/).

## Kurzantwort

**Die Datenfehler erklären die Unterperformance der sechs historischen Methoden nicht.** Alle sechs liegen in allen neun Szenarien unter SPY-TR, gemessen auf der Kopie `b3ca8681…` (`UNDERPERFORMANCE_REMAINS`). Auch die Sharpe Ratio liegt überall unter der von SPY. Ein Small-Cap-Benchmark fehlt.

- **Streng belegte Datenkorrekturen ändern fünf Methoden nicht.** Momentum, 52-Week-High, Low Volatility, Weinstein und Kullamägi bewegen sich gegenüber B um 0,0 Punkte CAGR.
- **Turtle reagiert stark, je zur Hälfte auf zwei Ursachen.**
  - VU-Accounting-Fixes (B gegen A): +2,0 Punkte.
  - Streng belegte Datenkorrektur (C2 gegen B): weitere +2,0 Punkte, zusammen +4,1 gegen A.
  - Die Datenkorrektur hängt an einem einzigen Trade über einem bestätigten Ereignis ohne genanntes Verhältnis. Dieses Ereignis wird abgeschnitten, nicht normalisiert; das Abschneiden nutzt Wissen, das zum Handelszeitpunkt nicht vorlag.
  - Turtle bleibt Rang 6 von 6 nach CAGR.
- **Weinstein reagiert nur auf VU-Infrastruktur.** Die Fixes A4/A5/A8 senken die CAGR um 0,7 Punkte und machen den Drawdown 2,8 Punkte flacher.
- **Die French-Kalibrierung hängt nicht an bestätigten Korrekturen.** Diese allein ergeben 0,144–0,146. Erst das Herausnehmen nicht bestätigter Fälle ergibt 0,963 bis 0,992 (Abschnitt 6).

## 1. Was technisch möglich war und was nicht

| Vergleich | Möglich? | Grund |
|---|---|---|
| Originalzahlen der Tournament-Läufe (#677, Run 38685897684) lesen | **nein** | Owner- und Session-versiegelt; der Session-Schlüssel ist in dieser Umgebung nicht vorhanden |
| Originaldaten bitgleich wiederherstellen | **nein** | Die R2-Ablage ist live. Freeze `318c051f…` (9.408 Segmente, 14.374.702 Bars), heute `b3ca8681…` (9.407, 14.371.749): −1 Segment, −2.953 Bars. Schon #737 und #758 lagen nicht auf den Freeze-Daten. |
| Eingefrorene Methoden- und Runner-Codes ausführen | **ja** | gepinnter #705-Head `547d604d`; Methoden aus `tournament/methods.mjs#historicalParticipants`, Runner `runner-certified-v3.mjs` (Original) und `v4/methods/runner-v4.mjs` (V4-Infrastruktur) |
| Szenarien untereinander vergleichen | **ja** | alle Szenarien und alle Jobs auf derselben Kopie, per Fingerabdruck erzwungen |

**Deshalb heißt Szenario A hier „Replay der Originalkonstruktion auf der heutigen Datenkopie“.** Es ist kein wiederhergestelltes Originalergebnis. Alle Aussagen sind Differenzen zwischen Szenarien, Richtungen gegen SPY oder grobe Abstandsklassen. Absolute CAGR-, Drawdown- und Sharpe-Werte sind nur an den Owner versiegelt (`run-39073148967/sealed/`), wie in #677/#705.

Lauf: Actions-Run [39073148967](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39073148967), Workflow `.github/workflows/research-price-root-cause-audit.yml`, Code `scripts/research/price-root-cause/`.

## 2. Szenarien

| ID | Inhalt | Belegbasis |
|---|---|---|
| **A** ORIGINAL | Tournament-Daten und `runner-certified-v3` wie im Original | Replay |
| **B1** A5_TIMING | A, nur der Quarantäne-Termin kausal (max(from, observedAt)); 143 von 521 Terminen verschieben sich | V4-Befund A5, erste Hälfte |
| **B** VU_BUGS | V4-Infrastruktur: Stale-Limit 5 Sessions (A4), kausaler Termin und Datenereignis-Faktor 1 statt 0,7 (A5), wertbewusster Dust (A8) und die V4-Order-Untergrenze | nachgewiesene VU-Fehler, behoben nur in `runner-v4` |
| **C** INDEPENDENT (locker) | B plus Korrekturen für alle locker bestätigten Ereignisse | Vergleich; durch C2 ersetzt |
| **C2** STRICT | B plus Korrekturen nur für streng bestätigte Ereignisse: mit Verhältnis normalisiert (15), sonst ab dem Ereignistag gesperrt | SEC 8-K, FINRA, SEC-Aktienzahlen, strenge Klasse |
| **C3** STRICT_NORMALIZE_ONLY | B plus nur die 15 Normalisierungen aus C2 | trennt Normalisieren von Sperren |
| **D** UNRESOLVED_CUT | C plus Sperre ab jedem übrigen Census-Ereignis | **Stress-Szenario, keine Schranke**: nutzt Wissen im Nachhinein, Ausstiegskurs nicht handelbar |
| **E** WHOLE_SERIES | B, aber jede quarantänisierte Historie ganz entfernt statt gültigem Präfix | Policy-Vergleich; vermischt Survivorship mit Datenqualität |
| **F** V4_FORENSIC | B plus V4-Price-Sanity-Quarantäne (VUs eigener Klassifikator) | Vergleich |

**Census.** Jeder Tag im gültigen Präfix mit rohem Übernachtsprung ≥ 10× oder ≤ 1/10 ohne deklarierten Split, und jeder deklarierte Split-Tag mit TR-Schritt ≥ 2×. Die Definitionen stammen aus #705/#721 und werden übernommen, nicht neu gesetzt: **616 Ereignisse in 226 Segmenten**.

**Strenge Klasse.** Das Verhältnis erklärt den Sprung auf ±25 %, kein SEC-Widerspruch, kein deklarierter Split ≤ 200 Tage. Das ergibt **28 Ereignisse** (Begleitdokument, Abschnitt 4).

## 3. Ergebnis je Methode

**CAGR, Δ gegenüber A (Prozentpunkte)**

| Methode | B1 | B | C | C2 | C3 | D | E | F |
|---|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 0,0 | +0,2 | +0,2 | +0,2 | +0,2 | +0,6 | +0,3 | +0,2 |
| 52-Week-High | 0,0 | +0,1 | +0,1 | +0,1 | +0,2 | +0,2 | +0,2 | +0,1 |
| Low Volatility | 0,0 | +0,1 | 0,0 | 0,0 | +0,1 | 0,0 | +0,1 | 0,0 |
| Turtle S2 Equity Daily | 0,0 | +2,0 | +4,1 | +4,1 | +2,0 | +2,7 | +0,7 | +2,0 |
| Weinstein Stage Daily | 0,0 | −0,7 | −0,7 | −0,7 | −0,7 | −0,7 | −1,3 | −0,7 |
| Kullamägi Daily | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |

**Maximaler Drawdown, Δ gegenüber A** (positiv = flacher)

| Methode | B1 | B | C | C2 | C3 | D | E | F |
|---|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | +0,1 | 0,0 |
| 52-Week-High | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | −0,1 | 0,0 |
| Low Volatility | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | −0,2 | 0,0 |
| Turtle S2 Equity Daily | 0,0 | +1,7 | +3,8 | +3,8 | +1,7 | +2,4 | +0,5 | +1,7 |
| Weinstein Stage Daily | 0,0 | +2,8 | +2,8 | +2,8 | +2,8 | +2,8 | +2,8 | +2,8 |
| Kullamägi Daily | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | −0,3 | 0,0 |

**Gegen SPY.** In allen 54 Zellen (6 Methoden × 9 Szenarien) gilt `BELOW_SPY` für CAGR und Sharpe.

| Methode | CAGR-Abstand zu SPY (A) | über alle Szenarien |
|---|---|---|
| Cross-sectional Momentum | 1–5 Punkte darunter | gleich |
| 52-Week-High | 1–5 Punkte darunter | gleich |
| Weinstein | 1–5 Punkte darunter | in E mehr als 5 Punkte |
| Low Volatility | mehr als 5 Punkte darunter | gleich |
| Turtle | mehr als 5 Punkte darunter | gleich, auch mit +4,1 |
| Kullamägi | mehr als 5 Punkte darunter | gleich |

**Cash/Exposure.** Die mittlere Exposure ändert sich höchstens um 0,6 Punkte (Weinstein B). Die Unterperformance ist kein Exposure-Artefakt der Datenfehler.

## 4. Welche Trades waren direkt betroffen? (Szenario A)

| Methode | Trade-Datensätze | in Ereignis-Wertpapieren | davon versch. Wertpapiere | **über ein Ereignis gehalten** | Positions-Monate am Ereignis | Einstieg ≤ 252 Sessions nach Ereignis | P&L der überspannenden Trades / Endvermögen |
|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 36.912 | 376 | 69 | **24** | 15 | 87 | +0,5 % |
| 52-Week-High | 84.934 | 232 | 38 | **21** | 11 | 26 | −0,1 % |
| Low Volatility | 14.071 | 48 | 2 | **1** | 1 | 0 | 0,0 % |
| Turtle S2 Equity Daily | 753 | 13 | 10 | **1** | 1 | 0 | **−18,7 %** |
| Weinstein Stage Daily | 172 | 0 | 0 | 0 | 0 | 0 | 0 |
| Kullamägi Daily | 131 | 0 | 0 | 0 | 0 | 0 | 0 |

**Klasse der überspannten Ereignisse** (Trade-Ereignis-Paare, unabhängige Belege ohne Vendor):
- **Momentum:** 9 mit Gegenbeleg gegen einen Split (SEC-Aktienzahl unverändert), 20 ohne jeden Beleg, 2 ungeklärt.
- **52W:** 17 mit Gegenbeleg, 11 ohne Beleg.
- **Low Volatility:** 1 mit Gegenbeleg.
- **Turtle:** 1 bestätigte, vom Provider nicht deklarierte Kapitalmaßnahme; sie bleibt auch unter der strengen Klasse bestätigt.

**Turtle im Einzelnen.**
- In A beträgt das P&L des überspannenden Trades −18,7 % des Endvermögens, in B −19,2 %.
- In C2 wird das Ereignis abgeschnitten. Die Position endet zum letzten gültigen Kurs vor dem Sprung, mit Faktor 1. Das P&L wird +6,4 %.
- C3 (nur Normalisieren) lässt Turtle unverändert. Der Effekt kommt also allein aus dem Abschneiden, weil für dieses Ereignis kein Verhältnis vorliegt.
- Das Abschneiden ist eine Diagnose mit Wissen im Nachhinein. Es zeigt nicht, was ein Händler damals hätte tun können.

**Direkt betroffen, indirekt, Universum:**
- **Direkt (gehalten).** Höchstens 24 von 36.912 Trade-Datensätzen. Nur bei Turtle ist der Effekt groß, wegen der konzentrierten Positionsgröße.
- **Indirekt (Signal/Ranking).** Momentum und 52W kaufen nach einem Ereignis häufiger: 87 bzw. 26 Einstiege in Ereignis-Wertpapiere binnen eines Jahres. Hypothese: Die Look-back-Rendite oder das 52-Wochen-Niveau enthält dann den Sprung, aber wer nach dem Sprung kauft, verdient die Rendite ab dem Sprungniveau. Das passt dazu, dass D bei Momentum nur +0,6 Punkte bewirkt. Getrennt gemessen ist es nicht.
- **Universumseffekt.** Nie gekaufte Wertpapiere können Breakpoints und Ränge verschieben. Der Effekt steckt in den Szenario-Deltas, wird aber nicht getrennt ausgewiesen: Die Methoden sind eingefroren, und ein getrennter Ausweis würde ihren Code ändern.

## 5. Rangfolge

Ein eigener Ein-Prozess-Lauf (`ranking.mjs`, Szenarien A, B, C2) bildet die Ränge und veröffentlicht nur diese ([`RANKING.json`](data-quality/root-cause-audit/run-39073148967/RANKING.json)). Rang 1 ist am besten.

| Methode | CAGR A | CAGR B | CAGR C2 | Sharpe A | Sharpe B | Sharpe C2 | Drawdown A/B/C2 |
|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 1 | 1 | 1 | 3 | 3 | 3 | 5 |
| Weinstein Stage Daily | 2 | **3** | 3 | 1 | **2** | 2 | 2 |
| 52-Week-High | 3 | **2** | 2 | 2 | **1** | 1 | 3 |
| Low Volatility | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Kullamägi Daily | 5 | 5 | 5 | 6 | 6 | 6 | 1 |
| Turtle S2 Equity Daily | 6 | 6 | 6 | 5 | 5 | 5 | 6 |

- **Die VU-Accounting-Fixes (A → B) tauschen 52W und Weinstein** bei CAGR (Rang 2/3) und Sharpe (Rang 1/2).
- **Die streng belegten Datenkorrekturen (B → C2) ändern keinen Rang.**
- Die Drawdown-Ränge bleiben in allen drei Szenarien gleich.
- Keine Methode liegt in einem Szenario über SPY.

## 6. Externe French-Kalibrierung: Woher kam 0,145 → 0,992?

Gleiche V4-Konstruktion (EW-Markt) auf der heutigen Kopie. Die Baseline 0,145 und die Diagnose 0,992 sind exakt reproduziert. Nenner: 493.258 EW-Security-Months.

| Variante (EW-Korrelation mit French) | ausgeschlossene Security-Months | Korrelation |
|---|---|---|
| Baseline | 0 | 0,145 |
| ohne die 83 (Datensignatur) | 83 | 0,992 |
| ohne alle \|r\| > 100 % | 2.200 | 0,990 |
| ohne nur die 43 forensischen Defekte (#722) | 43 | 0,992 |
| ohne nur die 40 forensisch „echten“ | 40 | 0,145 |
| **ohne nur die 11 streng bestätigten** | 11 | **0,145** |
| **ohne die 72 nicht streng bestätigten** | 72 | **0,963** |
| ohne nur die 27 locker bestätigten | 27 | 0,146 |
| ohne die 56 nicht locker bestätigten | 56 | 0,963 |
| ohne nur die 55 unerklärten Rohsprünge ≥ 10× | 55 | 0,992 |
| ohne nur die 28 Monate mit deklariertem Split | 28 | 0,144 |

Alle Varianten bleiben **FAIL**. Auch 0,992 verfehlt die vorab registrierten Toleranzen für mittlere Differenz und maximalen Drawdown. Deren Beträge sind nur versiegelt (Review IR-20).

**Volle Konstruktion** (EW, Momentum-Dezile, Varianz-Quintile):

| Variante | EW-Korr. | MOM-Spread-Korr. | VAR-Spread-Korr. |
|---|---|---|---|
| V4-Baseline | 0,145 | 0,038 | −0,002 |
| C – locker belegte Korrekturen | 0,146 | 0,034 | −0,001 |
| **C2 – streng belegte Korrekturen** | **0,144** | **0,033** | **−0,002** |
| D – Sperre ab jedem Census-Ereignis (Stress) | 0,992 | 0,824 | 0,963 |
| E – ganze quarantänisierte Historien entfernt | 0,146 | 0,037 | −0,009 |

**Lesart:**
- **Bestätigte Korrekturen erklären von der Kalibrierungslücke nichts Messbares.** 0,145 → 0,144–0,146.
- **Die nicht bestätigten Fälle tragen den Großteil.** Ihr Ausschluss allein ergibt 0,963. Die letzten Schritte bis 0,992 brauchen auch die 11 bestätigten Monate. Sie wirken also nur im Verbund, nicht allein.
- **Die 83 sind fast alle Aufwärtssprünge bei Pennystocks:** 78 aufwärts, 50 mit Rohkurs unter 1 $ vor dem Sprung. Sie sind überwiegend weder als Kapitalmaßnahme noch als echte Bewegung belegt. Sie zu sperren repariert EW, Momentum und Varianz zugleich, aber nur als Sensitivität.
- **Ein Universumsunterschied bleibt.** VU hält im Mittel 1,337-mal so viele Titel wie French, also mehr Nebenwerte. Ein Niveauunterschied bleibt in jeder Variante. Er ist nicht weiter in Universum, Konstruktion (EW monatlich, Juni-Mitgliedschaft), Delisting-Annahmen und Kosten trennbar, weil das CRSP-Universum fehlt.
- **0,992 ist keine Zertifizierung und begründet keine Ausschlussregel.** Ebenso stark sind „ohne Rohstart < 1 $“ (0,992, #705-Diagnose) und Winsorisieren (0,994). Die Korrelation misst die Behandlung eines extremen Pennystock-Randes, nicht die Korrektheit einzelner Fälle.

## 7. Kausale Zerlegung (CAGR-Punkte, paarweise aus ungerundeten Werten)

| Schritt | Effekt | Momentum | 52W | LowVol | Turtle | Weinstein | Kullamägi |
|---|---|---|---|---|---|---|---|
| B1 gegen A | A5-Termin (Look-ahead) | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| B gegen A | VU-Accounting A4, A5-Faktor, A8, Order-Untergrenze (gebündelt) | +0,2 | +0,1 | +0,1 | +2,0 | −0,7 | 0,0 |
| C2 gegen B | streng belegte Daten-/CA-Korrektur | 0,0 | 0,0 | 0,0 | +2,0 | 0,0 | 0,0 |
| C3 gegen B | davon nur Normalisieren | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| C gegen B | locker belegte Korrektur (Vergleich) | 0,0 | 0,0 | 0,0 | +2,0 | 0,0 | 0,0 |
| D gegen C | Stress: Sperre ab jedem ungeklärten Ereignis | +0,3 | +0,1 | 0,0 | −1,4 | 0,0 | 0,0 |
| E gegen B | Policy: ganze Historie statt Präfix | +0,1 | 0,0 | 0,0 | −1,4 | −0,7 | 0,0 |
| F gegen B | V4-Forensik-Sanity | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |

**Isoliert und nicht isoliert** (Auftrag Abschnitt 12):

| Ursache | Status |
|---|---|
| Provider-Kursfehler und Corporate-Action-Anpassung | gemeinsam isoliert in C2/C3 (die bestätigten Fälle sind beides zugleich) |
| VU-Normalisierung | als Arithmetik deterministisch geprüft (E1–E10, F1); kein Backtest-Effekt, weil kein Fehler gefunden |
| Identität | kein Defekt gefunden (#722); nicht variiert |
| Universumskonstruktion | nur über E und den French-Mengenvergleich |
| Portfolio-Accounting | B (gebündelt) |
| Order Execution | eingefrorene Next-Open-Ausführung; nicht variiert; die V4-Order-Untergrenze steckt in B |
| Terminal-/Missing-Bar-Verhalten | B1 (Termin) und B (Stale-Limit) |

**Interaktion:**
- Die Schritte sind paarweise Differenzen, keine additiven Anteile.
- Eine Sperre in D kann einen in C normalisierten Trade wieder beenden. Bei Turtle liegt D deshalb unter C.
- E entfernt 521 ganze Historien und vermischt damit Survivorship mit Datenqualität.
- Die Fixes innerhalb von B sind nicht einzeln isoliert. Eine Aufteilung auf A4, A5-Faktor und A8 wird deshalb nicht behauptet.
- Die Spalten ergeben keine „Provider gegen VU“-Quote; das wäre eine künstliche Zahl.

## 8. Quarantäne- und Hold-Effekt

- **Original-Tournament.** 521 quarantänisierte Segmente, das gültige Präfix bleibt nutzbar.
  - Gründe: 434 Listing-Lücken, 63 Corporate-Action-Widersprüche, 16 fehlende Dividenden, 8 ungültige OHLCV.
  - Kosten: 401.827 nicht genutzte Bars nach dem Quarantänetag, 2,72 % der Ablage-Bars im Tournament-Zeitraum.
- **Quarantäne-Bias im Original.** Eine Datenquarantäne wurde wie ein Delisting mit −30 % abgerechnet (A5). Die Korrektur auf Faktor 1 steckt gebündelt in B. Getrennt messbar ist nur der Termin (B1, 0,0 bei allen Methoden).
- **Whole-Series-Policy (E) statt Präfix.**
  - Ändert die CAGR gegenüber B um höchstens 1,4 Punkte (Turtle).
  - Entfernt 521 von 9.407 Segmenten.
  - Bei Momentum und 52W fallen 309 bzw. 794 Trades weg.
- **V3-Holds (Nachbau ohne Vendor).** 518 Holds; danach würden 120.455 Bars wieder genutzt. Die V3-Policy ist nicht abgenommen (#758 PIT-Abnahme nicht bestanden) und wurde hier nicht als Szenario gerechnet.
- **Entfernte Trades in C/D.** In D fallen bei Momentum 94 und bei 52W 207 Trade-Datensätze weg. In C2 sind es bei 52W 23 weniger, bei Low Volatility 110 mehr (Wertpapiere bleiben handelbar statt eingefroren).

## 9. Historische Outperformance-Frage

**Ergebnis: `UNDERPERFORMANCE_REMAINS`** (CAGR und Sharpe unter SPY-TR auf `b3ca8681…`, in allen 54 Zellen).

- **Nebenbefund: Die Rangfolge ändert sich**, aber durch VU-Accounting-Fixes (A → B), nicht durch belegte Datenkorrekturen (B → C2).
- **`UNDERPERFORMANCE_REDUCED` trifft nur auf Turtle zu**, und dort ohne Wechsel der Abstandsklasse (bleibt mehr als 5 Punkte unter SPY).
- **Ohne Small-Cap-Benchmark** (IWM/IWV fehlen) bleibt offen, ob die Methoden gegen ein passendes Universum besser aussähen. Das ist eine Benchmark-Frage, keine Datenfrage.
- **Daraus folgt kein Strategievorteil.** Die größte belegte Datenkorrektur (Turtle, C2) ist ein einzelner, im Nachhinein abgeschnittener Trade. Keine Methode wurde optimiert, kein Parameter verändert.

## 10. Grenzen

- **A ist ein Replay auf der heutigen Kopie, nicht das versiegelte Original.** Der Unterschied ist klein (−1 Segment, −0,02 % Bars), aber nicht null.
- **Unabhängige Belege ohne zweiten Preisanbieter.** FINRA deckt nur OTC ab und gleicht nur das Symbol ab; SEC-Aktienzahlen sind ein schwacher Kanal. Der Yahoo-Vendor aus #758 wurde bewusst nicht benutzt (Auftrag) und ist nicht im Runner reproduzierbar (#758 R3-01).
- **„Ohne Beleg“ heißt nicht „echt“.** D ist ein Stress-Szenario, keine Korrektur und keine Schranke.
- **Abschneiden nutzt Wissen im Nachhinein.** Das betrifft C2-Sperren und D; der Ausstiegskurs war nicht handelbar.
- **Kein Small-Cap-Benchmark.** Die Aussage „unter SPY“ ist eng definiert.
- **Das Universum bleibt beobachtungsbasiert** (OBSERVED_PANEL_NOT_PIT_COMPLETE). Delisting-Erlöse bleiben Szenarien.
- **Dieser Lauf ist nicht zertifizierend** und ersetzt keine vorab registrierte Kalibrierung.
