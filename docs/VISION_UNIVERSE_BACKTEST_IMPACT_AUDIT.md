# Vision Universe – Backtest-Impact-Audit der Kursdatenfehler

Stand: 18. Oktober 2026. Diagnostischer Lauf, **nicht zertifizierend**. Keine Strategieregel, kein Parameter, keine Schwelle und keine Quarantäne-Regel wurde geändert. Kein CERTIFIED-Label.

Begleitdokumente: [Root-Cause-Audit](VISION_UNIVERSE_CANONICAL_DATA_ROOT_CAUSE_AUDIT.md), [Abschlussbericht](VISION_UNIVERSE_PRICE_AUDIT_FINAL_REPORT.md). Strukturierte Ergebnisse: [`docs/data-quality/root-cause-audit/`](data-quality/root-cause-audit/).

**Maßgeblicher Lauf: 39100831867 auf Datenstand `862c4242…`.** Alle acht Jobs lasen nachweislich identische Eingaben. Frühere Läufe auf `b3ca8681…` sind nicht reproduzierbar und werden nicht als reproduziert ausgegeben. Die CAGR-Deltas weichen von ihnen um höchstens 0,1 Punkte ab.

## Kurzantwort

**Die Datenfehler erklären die Unterperformance nicht.** Alle sechs Methoden liegen in allen neun Szenarien unter SPY-TR, bei CAGR und bei Sharpe (`UNDERPERFORMANCE_REMAINS`). Ein Small-Cap-Benchmark fehlt.

- **Bestätigte Datenfehler: kein messbarer Effekt.** Die Korrektur der 17 streng bestätigten Kapitalmaßnahmen (C2 gegen B) ändert CAGR und Drawdown aller sechs Methoden um 0,0 Punkte und keinen Rang.
- **VU-Verarbeitungsfehler: messbarer Effekt bei zwei Methoden.** Die Fixes A4/A5/A8 (B gegen A) ändern:
  - Turtle: +2,0 Punkte CAGR, Drawdown 1,7 Punkte flacher
  - Weinstein: −0,7 Punkte CAGR, Drawdown 2,8 Punkte flacher
  - die anderen Methoden: höchstens +0,2 Punkte

  52W und Weinstein tauschen dadurch die Plätze 2/3 nach CAGR und 1/2 nach Sharpe.
- **Turtle: Der frühere Dateneffekt ist weggefallen.** Die +2,0 Punkte aus der lockeren Belegzählung (C) beruhen auf einem einzigen Ereignis. Dort fällt der Kurs, und es gibt nur eine steigende SEC-Aktienzahl als Beleg. Das passt zu einem Split ebenso wie zu einer Verwässerung. Unter der strengen Klasse gilt es nicht als bestätigt.

## 1. Was technisch möglich war und was nicht

| Vergleich | Möglich? | Grund |
|---|---|---|
| Originalzahlen der Tournament-Läufe lesen | **nein** | Owner- und Session-versiegelt |
| Originaldaten bitgleich wiederherstellen | **nein** | R2 und Tiingos Ticker-Liste sind live; kein Capture wurde aufbewahrt (Root-Cause-Audit, Abschnitt 2) |
| Eingefrorene Methoden- und Runner-Codes ausführen | **ja** | #705-Head `547d604d`, `runner-certified-v3` (Original) und `runner-v4` (V4-Infrastruktur) |
| Szenarien untereinander vergleichen | **ja** | alle Szenarien und Jobs auf `862c4242…`, Inhaltsgleichheit je Job geprüft |

Szenario A heißt deshalb „Replay der Originalkonstruktion auf der heutigen Datenkopie“. Alle Aussagen sind Differenzen, Richtungen oder grobe Abstandsklassen. Absolute Kennzahlen sind nur an den Owner versiegelt.

## 2. Szenarien

| ID | Inhalt |
|---|---|
| **A** | Original: Tournament-Daten, `runner-certified-v3` |
| **B1** | A plus kausaler Quarantäne-Termin; 143 von 521 Terminen verschieben sich |
| **B** | VU-Fixes: Stale-Limit 5 Sessions (A4), kausaler Termin und Faktor 1 statt 0,7 (A5), wertbewusster Dust (A8), V4-Order-Untergrenze |
| **C** | B plus Korrektur aller locker bestätigten Ereignisse (21 normalisiert, 18 gesperrt, 1 Reihe entfernt) – Vergleich |
| **C2** | B plus Korrektur nur der **17 streng bestätigten** Ereignisse (15 normalisiert, 2 gesperrt) |
| **C3** | B plus nur die 15 Normalisierungen |
| **D** | C plus Sperre ab jedem übrigen Census-Ereignis (209 Sperren, 15 Reihen entfernt). **Stress-Szenario**: nutzt Wissen im Nachhinein |
| **E** | B, aber jede der 521 quarantänisierten Historien ganz entfernt |
| **F** | B plus V4-Price-Sanity-Quarantäne (3 Wertpapiere) |

## 3. Ergebnisse je Methode

**CAGR, Δ gegenüber A (Prozentpunkte)**

| Methode | B1 | B | C | C2 | C3 | D | E | F |
|---|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 0,0 | +0,2 | +0,2 | +0,2 | +0,2 | +0,6 | +0,3 | +0,2 |
| 52-Week-High | 0,0 | +0,1 | +0,2 | +0,2 | +0,2 | +0,2 | +0,2 | +0,1 |
| Low Volatility | 0,0 | +0,1 | +0,1 | +0,1 | +0,1 | 0,0 | +0,1 | +0,1 |
| Turtle S2 Equity Daily | 0,0 | +2,0 | +4,1 | +2,0 | +2,0 | +2,7 | +0,7 | +2,0 |
| Weinstein Stage Daily | 0,0 | −0,7 | −0,7 | −0,7 | −0,7 | −0,7 | −1,3 | −0,7 |
| Kullamägi Daily | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |

**CAGR, Δ gegenüber B (Datenwirkung bei korrigierter VU-Infrastruktur)**

| Methode | C (locker) | **C2 (streng)** | C3 | D (Stress) | E (ganze Reihe) | F |
|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 0,0 | **0,0** | 0,0 | +0,4 | +0,1 | 0,0 |
| 52-Week-High | 0,0 | **0,0** | 0,0 | +0,1 | 0,0 | 0,0 |
| Low Volatility | 0,0 | **0,0** | 0,0 | 0,0 | 0,0 | 0,0 |
| Turtle S2 Equity Daily | +2,0 | **0,0** | 0,0 | +0,7 | −1,4 | 0,0 |
| Weinstein Stage Daily | 0,0 | **0,0** | 0,0 | 0,0 | −0,7 | 0,0 |
| Kullamägi Daily | 0,0 | **0,0** | 0,0 | 0,0 | 0,0 | 0,0 |

**Maximaler Drawdown, Δ gegenüber A** (positiv = flacher)

| Methode | B1 | B | C | C2 | C3 | D | E | F |
|---|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | +0,1 | 0,0 |
| 52-Week-High | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | −0,1 | 0,0 |
| Low Volatility | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | −0,2 | 0,0 |
| Turtle S2 Equity Daily | 0,0 | +1,7 | +3,8 | +1,7 | +1,7 | +2,4 | +0,5 | +1,7 |
| Weinstein Stage Daily | 0,0 | +2,8 | +2,8 | +2,8 | +2,8 | +2,8 | +2,8 | +2,8 |
| Kullamägi Daily | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | −0,3 | 0,0 |

**Abstand zu SPY.** In allen 54 Zellen gilt `BELOW_SPY` für CAGR und Sharpe. Die Abstandsklasse ändert sich nur bei Weinstein in E.

| Methode | CAGR-Abstand zu SPY in A, B und C2 |
|---|---|
| Cross-sectional Momentum | 1–5 Punkte darunter |
| 52-Week-High | 1–5 Punkte darunter |
| Weinstein | 1–5 Punkte darunter (in E mehr als 5) |
| Low Volatility | mehr als 5 Punkte darunter |
| Turtle | mehr als 5 Punkte darunter |
| Kullamägi | mehr als 5 Punkte darunter |

Die Differenz zu SPY ändert sich um dieselben Werte wie die CAGR, denn der Benchmark ist in allen Szenarien gleich.

**Cash/Exposure.** Die mittlere Exposure ändert sich höchstens um 0,6 Punkte (Weinstein).

## 4. Direkt betroffene Trades (Szenario A)

| Methode | Trade-Datensätze | in Ereignis-Wertpapieren | versch. Ereignis-Wertpapiere | **über ein Ereignis gehalten** | Positions-Monate am Ereignis | Einstieg ≤ 252 Sessions danach | P&L der überspannenden Trades / Endvermögen |
|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 36.897 | 376 | 69 | **24** | 15 | 87 | +0,5 % |
| 52-Week-High | 84.911 | 232 | 38 | **21** | 11 | 26 | −0,1 % |
| Low Volatility | 14.051 | 48 | 2 | **1** | 1 | 0 | 0,0 % |
| Turtle S2 Equity Daily | 753 | 13 | 10 | **1** | 1 | 0 | −18,7 % |
| Weinstein Stage Daily | 172 | 0 | 0 | 0 | 0 | 0 | 0 |
| Kullamägi Daily | 131 | 0 | 0 | 0 | 0 | 0 | 0 |

**Strenge Klasse der überspannten Ereignisse:**
- **Momentum:** 9 mit Gegenbeleg gegen einen Split, 20 ohne Beleg, 2 ungeklärt.
- **52W:** 17 mit Gegenbeleg, 11 ohne Beleg.
- **Low Volatility:** 1 mit Gegenbeleg.
- **Turtle:** 1 × `SHARE_RISE_SPLIT_OR_DILUTION` (Kursfall, Aktienzahl steigt).

Kein überspannter Trade einer Methode betrifft ein streng bestätigtes Ereignis. Deshalb ist C2 überall wirkungslos.

**Direkt, indirekt, Universum:**
- **Direkt.** Höchstens 47 Trade-Datensätze über alle Methoden überspannen ein Ereignis.
- **Indirekt.** Momentum und 52W kaufen nach Ereignissen 87 bzw. 26 Mal ein; diese Wirkung über Signal und Ranking ist nicht getrennt gemessen.
- **Universum.** Nie gekaufte Wertpapiere können Ränge und Breakpoints verschieben. Dieser Effekt steckt in den Szenario-Deltas.

## 5. Top-30-Frage: Verursachen höchstens 30 Aktien den Großteil der Verzerrung?

| Wirkungskanal | Wertpapiere | Ergebnis |
|---|---|---|
| streng bestätigte Datenfehler (C2) | 17 | **keine Verzerrung** (0,0 Punkte bei allen Methoden) |
| locker bestätigte Korrektur (C) | 1 (Turtle-Trade) | +2,0 Punkte Turtle, sonst 0,0 |
| Stress: alle ungeklärten Ereignisse gesperrt (D) | bis zu 226 Census-Segmente | ≤ +0,4 Punkte; eine Zuordnung je Wertpapier ist **nicht berechnet: UNKNOWN** |
| direkt gehaltene Ereignis-Trades | ≤ 47 Datensätze in ≤ 69/38/2/10 Wertpapieren | P&L-Anteil ≤ 0,5 %, außer Turtle (−18,7 %, ein Trade) |
| French-Kalibrierung | 83 Security-Months in 67 Wertpapieren | 0,145 → 0,992; die 55 nicht deklarierten Rohsprung-Monate allein erreichen 0,992 |

**Antwort: Ja, soweit messbar.**
- Die einzige materielle Datenwirkung auf einen Backtest hängt an **einem** Wertpapier (Turtle, lockere Klasse).
- Die Kalibrierungslücke hängt an höchstens 55 Security-Months.
- Ob höchstens 30 Wertpapiere den Stress-Effekt in D tragen, ist **UNKNOWN**. Dafür wäre eine Ablation je Wertpapier nötig, also ein neuer Lauf, und auftragsgemäß wurde keiner gestartet.

## 6. Temporäre Sperre: ganzes Wertpapier oder nur fehlerhafte Zeiträume?

Diagnostischer Vergleich, keine produktive Deaktivierung.

| Variante | was entfernt wird | CAGR Δ gegen B | Trades Δ gegen B |
|---|---|---|---|
| B: gültiges Präfix, Terminal am Quarantänetag | nur Bars nach dem Quarantänetag | – | – |
| D: Sperre ab jedem Census-Ereignis | Zeitraum ab dem Ereignis (209 Sperren) | Momentum +0,4, 52W +0,1, Turtle +0,7, sonst 0,0 | Momentum −101, 52W −201 |
| E: ganzes Wertpapier entfernen | 521 vollständige Historien | Turtle −1,4, Weinstein −0,7, Momentum +0,1 | Momentum −342, 52W −793, LowVol −127 |

**Lesart:**
- **Ganze Wertpapiere zu entfernen ist schlechter.** Es verwirft 521 Historien samt gültiger Vorgeschichte und baut Survivorship ein. Es verschiebt Ergebnisse stärker (Turtle −1,4, Weinstein −0,7), ohne dass ein Beleg dafür spricht.
- **Zeitraumbezogene Behandlung ist vorzuziehen.** Damit ist gemeint: gültiges Präfix, Sperre oder Hold ab dem Ereignis. Sie behält die Daten und bewegt die Ergebnisse höchstens so viel wie das Entfernen ganzer Reihen.
- **Nicht gemessen:** „Sperren und nach Klärung wieder aufnehmen“ (V3-Holds, 120.455 Bars). Die V3-Policy ist nicht abgenommen.

## 7. Rangfolge

Eigener Ein-Prozess-Lauf ([`RANKING.json`](data-quality/root-cause-audit/run-39100831867/RANKING.json)), nur Ränge veröffentlicht. Rang 1 ist am besten.

| Methode | CAGR A | CAGR B | CAGR C2 | Sharpe A | Sharpe B | Sharpe C2 | Drawdown A/B/C2 |
|---|---|---|---|---|---|---|---|
| Cross-sectional Momentum | 1 | 1 | 1 | 3 | 3 | 3 | 5 |
| Weinstein Stage Daily | 2 | **3** | 3 | 1 | **2** | 2 | 2 |
| 52-Week-High | 3 | **2** | 2 | 2 | **1** | 1 | 3 |
| Low Volatility | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| Kullamägi Daily | 5 | 5 | 5 | 6 | 6 | 6 | 1 |
| Turtle S2 Equity Daily | 6 | 6 | 6 | 5 | 5 | 5 | 6 |

- `changes`: A→B ändert CAGR und Sharpe. B→C2 ändert nichts (`false` für alle drei Kennzahlen).
- Die Aussagekraft von B→C2 ist gering, weil C2 keine Methode bewegt.

## 8. Externe French-Kalibrierung: Woher kam 0,145 → 0,992?

Nenner: 493.154 EW-Security-Months.

| Variante (EW-Korrelation) | ausgeschlossene Security-Months | Korrelation |
|---|---|---|
| Baseline | 0 | 0,145 |
| ohne die 83 | 83 | 0,992 |
| ohne alle \|r\| > 100 % | 2.200 | 0,990 |
| **ohne nur die 8 streng bestätigten** | 8 | **0,144** |
| **ohne die 75 nicht streng bestätigten** | 75 | **0,965** |
| ohne die 43 forensischen Defekte (#722) | 43 | 0,992 |
| ohne die 40 forensisch „echten“ | 40 | 0,145 |
| ohne die 55 nicht deklarierten Rohsprünge | 55 | 0,992 |
| ohne die 28 Monate mit deklariertem Split | 28 | 0,144 |

| Volle Konstruktion | EW | MOM-Spread | VAR-Spread |
|---|---|---|---|
| V4-Baseline | 0,145 | 0,038 | −0,002 |
| C2 – streng belegte Korrekturen | 0,144 | 0,033 | −0,001 |
| D – Sperre ab jedem Census-Ereignis (Stress) | 0,992 | 0,824 | 0,963 |
| E – ganze Historien entfernt | 0,146 | 0,037 | −0,009 |

**Lesart:**
- **Bestätigte Korrekturen erklären von der Lücke nichts.**
- **Die Lücke steckt in nicht bestätigten Monaten.** Gemeint sind überwiegend nicht deklarierte Aufwärtssprünge ≥ 10× bei Rohkursen unter 1 $: 52 von 55 aufwärts, 43 unter 1 $.
- **Alle Varianten bleiben FAIL.** Ein Niveauunterschied bleibt, unter anderem wegen des Universums (VU hält 1,34-mal so viele Titel wie French) und der Konstruktion; die Beträge sind nur versiegelt.
- **0,992 ist keine Zertifizierung und begründet keine Ausschlussregel.**

## 9. Kausale Zerlegung (CAGR-Punkte, paarweise aus ungerundeten Werten)

| Schritt | Effekt | Momentum | 52W | LowVol | Turtle | Weinstein | Kullamägi |
|---|---|---|---|---|---|---|---|
| B1 gegen A | A5-Termin | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| B gegen A | VU-Accounting A4, A5-Faktor, A8, Order-Untergrenze | +0,2 | +0,1 | +0,1 | +2,0 | −0,7 | 0,0 |
| C2 gegen B | streng belegte Daten-/CA-Korrektur | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| C gegen B | locker belegte Korrektur (Vergleich) | 0,0 | 0,0 | 0,0 | +2,0 | 0,0 | 0,0 |
| D gegen C | Stress: ungeklärte Ereignisse gesperrt | +0,4 | +0,1 | 0,0 | −1,4 | 0,0 | 0,0 |
| E gegen B | ganze Historie statt Präfix | +0,1 | 0,0 | 0,0 | −1,4 | −0,7 | 0,0 |
| F gegen B | V4-Forensik-Sanity | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |

**Isoliert und nicht isoliert:**
- Provider-Kursfehler und Corporate-Action-Anpassung sind gemeinsam isoliert (C2/C3).
- Accounting und Terminal-Verhalten stecken gebündelt in B; nur der Termin ist getrennt (B1).
- Identität ist nicht variiert (kein Defekt gefunden), ebenso Order Execution (eingefroren).
- Das Universum ist nur über E variiert.
- Die Schritte sind keine additiven Anteile.

## 10. Historische Outperformance-Frage

**`UNDERPERFORMANCE_REMAINS`**

- **Kein Szenario hebt eine Methode über SPY**, weder bei CAGR noch bei Sharpe.
- **Die Rangfolge ändert sich nur durch VU-Fixes**, nicht durch Datenkorrekturen.
- **Eine kleinere Unterperformance gibt es nur bei Turtle**, und nur durch die VU-Fixes (+2,0); die Abstandsklasse bleibt „mehr als 5 Punkte darunter“.
- **Daraus folgt kein Strategievorteil.**

## 11. Grenzen

- A ist ein Replay auf der heutigen Kopie, nicht das versiegelte Original.
- Ältere Kopien sind nicht aufbewahrt und nicht reproduzierbar.
- Es gibt keinen zweiten Preisanbieter; „ohne Beleg“ heißt nicht „echt“.
- D ist ein Stress-Szenario mit Wissen im Nachhinein und keine Schranke.
- Es gibt keinen Small-Cap-Benchmark; das Universum ist beobachtungsbasiert.
- Dieser Lauf ist nicht zertifizierend.
