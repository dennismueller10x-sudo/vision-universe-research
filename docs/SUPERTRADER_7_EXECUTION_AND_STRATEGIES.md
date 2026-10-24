# Supertrader 7.0 – Ausführung, Abrechnung und Strategielücken (Workstreams B, D, E, F)

Stand: 24. Oktober 2026. Basis `main` @ `304f91794`. Zweig `claude/supertrader-7-execution`.

Alle Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Keine Strategie ist live, zertifiziert oder handelbar (`LIVE_NOT_APPROVED`). Es gibt keine Orders, keine Brokeranbindung, keine UI-Änderung und keine neuen Intraday-Abrufe. Öffentlich sind nur Zählungen und Hashes. Die Kennzahlen bleiben versiegelt und haben keine Variante ausgewählt (E6).

## 1. Ergebnis in Kürze

- Die gemeinsame Engine (`research/lifecycle-engine.mjs`) wurde adversariell geprüft: Code-Review und ein Invarianten-Fuzzer über alle sf5-Adapter und alle vorregistrierten Varianten. Geprüft wurden Fills im Balken, Schutzstufen, Kosten, Bargeld, Positionsgrenzen, Abrechnung und Abstimmung. Der Fuzzer fand 0 Verstöße gegen die Invarianten (Fill innerhalb des Balkens, Stückbilanz je Trade, Bargeld nie negativ, Abstimmung).
- **Drei echte Defekte**, alle in Lesarten oder Auswertungen, keiner in einer Referenz:

| ID | Schwere | Wo | Defekt | Status |
|---|---|---|---|---|
| SF7-D1 | MEDIUM | `lifecycle-engine.mjs#fillOrder` | Bei einem Buy-Stop-Fill per Berührung mit Tief **und Schluss** am oder unter dem Stop galt der Stop als „mehrdeutig“. Der Schluss ist aber der letzte Kurs des Balkens: Der Kurs lag beim Fill über dem Stop und schloss am oder unter ihm, also wurde der Stop **nach** dem Fill gehandelt. Die OPTIMISTIC-Lesart hielt solche Positionen trotzdem. Die PESSIMISTIC-Referenz stieg bereits zum Stop aus, nur mit der Bezeichnung „angenommen“. | als deklarierte Variante behoben (EX7) |
| SF7-D2 | MEDIUM | `run-kk-intraday.mjs#epTradeSummary` | Die versiegelten EP-Handelskennzahlen lasen `realizedPnl`. Geschlossene Engine-Trades tragen ihr Ergebnis aber als `pnl`. Mittelwert, Median und Trefferquote waren deshalb leer (`null`), auch je Schicht. In der versiegelten Tradeliste fehlte das Ergebnis geschlossener Trades. Öffentliche Zählungen und Hashes waren nicht betroffen. | behoben |
| SF7-D3 | MEDIUM | `methods/turtle.mjs`, nur Alternative `ENTRY_BAR_OPTIMISTIC` | Gleiche Klasse wie D1: Die Turtle-Alternative übergeht jeden Stop am Einstiegs- oder Nachkaufbalken, auch wenn der Fill zur Eröffnung lag. Dann kommt das Tief zwingend danach. | **offen, gelistet** (Engine gepinnt, Abschnitt 6) |

- **Referenzen unverändert.** Ohne Adapter-Flag läuft die Engine Zeile für Zeile wie in 5.0. Belegt wird das durch den neuen sf5-Lauf (Abschnitt 4): Er reproduziert alle Referenz-Hashes. Das sf5-Variantenregister (`0a1260e9…`, gepinnt in SF6-PAPER-2027) ist unverändert, die Engine-Version bleibt `sf5-lifecycle-engine-1.0.0`.

## 2. Behebungen und Varianten

### SF7-D1 → Ausführungsrevision EX7-SAME-BAR-CLOSE-CONFIRMS-STOP

- **Regel:** Ein Buy-Stop wird per Berührung gefüllt, und auf dem Fill-Balken gilt Tief ≤ Stop sowie Schluss ≤ Stop. Dann ist der Stop am selben Balken **sicher** und wird zum Stop ausgeführt, in beiden Intrabar-Lesarten (`CERTAIN_BY_CLOSE`, Grund `STOP_SAME_BAR_CERTAIN_CLOSE_AT_OR_BELOW_STOP`). Liegt der Schluss über dem Stop, bleibt der Fall mehrdeutig.
- **Klasse:** Korrektur der Ausführungslogik. Sie entfernt einen unmöglichen Pfad, fügt keine Zahl hinzu, ist keine Quellregel und keine neue Modellwahl.
- **Umsetzung:** Die Engine prüft das nur, wenn der Adapter `sameBarCloseConfirmsStop: true` setzt (`fillOrder(bar, order, { closeConfirmsStop })`). Kein Referenzadapter setzt das Flag (Test `SF7-D1-REFERENCES-UNTOUCHED`). Der neue Zähler `sameBarStopCertainByClose` entsteht erst beim ersten Fall. Die Zählungen bestehender Läufe behalten daher ihre Schlüssel.
- **Varianten** (`research/sf7-execution-variants.mjs`, Version `sf7-execution-variants-1.0.0`, Register `310cb075…`). Das Register wurde vor jedem Snapshot-Ergebnis gepinnt. Es sind Wrapper mit gleicher Konfiguration und gleicher Vorbereitung wie die jeweilige Vergleichsvariante:

| Lifecycle | Variante | Vergleich mit |
|---|---|---|
| Darvas | `SF7-REF-CLOSE-RULE` | `REF` |
| Darvas | `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE` | `ALT-INTRABAR-OPTIMISTIC` |
| Holy Grail W-RAS97 | `SF7-REF-CLOSE-RULE` | `REF` |
| Holy Grail W-RAS97 | `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE` | `ALT-INTRABAR-OPTIMISTIC` |
| Weinstein Investor | `SF7-REF-CLOSE-RULE` | `REF` |
| Weinstein Trader | `SF7-REF-CLOSE-RULE` | `REF` |

  Kullamägi Breakout, Pocket Pivot und BGU kaufen `ON_OPEN` bzw. `ON_CLOSE`. Dort gibt es am Einstiegsbalken keine Mehrdeutigkeit, sie sind nicht betroffen.
- **Lauf:** Der sf5-Runner (`sf5-lifecycle-runner-1.1.0`) misst die Varianten neben den unveränderten sf5-Varianten. Öffentlich sind je Variante die Zählungen und Hashes (`publicOf`) und ein Vergleich:
  - `ledgerWithoutReasonsEqual`: Ledger ohne Grundfeld gleich der Vergleichsvariante;
  - `ledgerRowsWithChangedReason`;
  - `tradesDelta`;
  - `sameBarStopCertainByClose`.

  Die Kennzahlen sind versiegelt.

### SF7-D2 → behoben

- `epRealizedPnl(t)`: `pnl` für `CLOSED`, `realizedPnl` für offene Trades.
- `epSealedTrade(t)` erzeugt die versiegelte Tradeliste.
- Der Runner heißt jetzt `kk-intraday-runner-1.2.1`.
- Die EP- und PS-Register, die Day-Sets und alle öffentlichen Hashes sind unverändert (Lauf in Abschnitt 4).

## 3. Tests

Neu ist `scripts/supertrader/tests/sf-sf7-execution.test.mjs` mit 13 Tests. Die vier Defekttests (`SF7-D1-FILL`, `SF7-D1-LIFECYCLE`, `SF7-D1-PESSIMISTIC-PRICES`, `SF7-D2-EP-TRADE-SUMMARY`) schlugen vor der Behebung fehl. Das wurde gegen den Stand von `main` geprüft.

| Test | Prüft |
|---|---|
| SF7-D1-FILL | Einordnung sicher / mehrdeutig / Gap; Schluss gleich Stop; fehlender Schluss |
| SF7-D1-LIFECYCLE | OPTIMISTIC vorher: gehalten, am Folgetag zum Gap-Open gestoppt; mit EX7: Ausstieg am Stop desselben Balkens; Fall Schluss > Stop unverändert |
| SF7-D1-PESSIMISTIC-PRICES | unter PESSIMISTIC nur die Bezeichnung anders, Fills, Stücke und Preise gleich |
| SF7-D1-REFERENCES-UNTOUCHED | sf5-Register gepinnt, kein Referenzadapter mit Flag, SF7-Register gepinnt, Konfiguration = Vergleichsvariante |
| SF7-D2-EP-TRADE-SUMMARY | versiegelte EP-Handelskennzahlen aus `pnl` |
| SF7-D3-TURTLE-OPTIMISTIC-CHARACTERIZED | dokumentiert D3; die Turtle-Referenz stoppt korrekt |
| SF7-RUNNER-BLOCK | SF7-Block im sf5-Runner; öffentlich nur Zählungen; REF-Vergleich: Ledger ohne Grund gleich |
| SF7-EX-COST-SYMMETRY | Slippage und Gebühr je Seite symmetrisch; Kosten = Verlust eines Rundlaufs zum gleichen Preis |
| SF7-EX-POSITION-CAP-TIEBREAK | gleichzeitige Signale; Grenze von 20 Positionen; Bargeld bindet; Auswahl unabhängig von der Eingabereihenfolge der Wertpapiere |
| SF7-EX-SHARE-BALANCE | unabhängige Abstimmung: Stückbilanz je Trade (auch mit Teilverkäufen) und Endkapital = Ledger-Cash + Marken |
| SF7-EX-DIVIDEND-ENTRY-DAY | keine Dividende beim Kauf zur Eröffnung am Ex-Tag; Dividende nach einem Schlusskurs-Kauf am Vortag |
| SF7-EX-GAP-THROUGH-STOP-AND-OVER-BUY-STOP | Kauf-Gap und Stop-Gap jeweils zur Eröffnung |
| SF7-EX-MAXDD | Drawdown: Spitze vor dem Tief |

Bisher war die Ledger-Abstimmung der Engine tautologisch: Sie spielt dasselbe Ledger nach, das die Kasse bucht. `SF7-EX-SHARE-BALANCE` prüft deshalb unabhängig über Stücke und Marken.

## 4. CI-Läufe und Hash-Gleichheit

Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Abrechnung research-v1, Auslösung über `workflow_dispatch` auf dem Zweig.

| Lauf | Modus | Commit | Ergebnis |
|---|---|---|---|
| [40099831813](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40099831813) | `sf5-lifecycle` | `d1ea0179` | Datensatz `EXACT`. **41 von 41 sf5-Varianten mit vollständig identischem öffentlichem Block** gegenüber 39939890956: Zählungen, Ausstiegsgründe, Ablehnungen, `ledgerSha256`, `tradesSha256`. Determinismus bei allen 7 Referenzen. Variantenregister `0a1260e9…` unverändert. Neuer AUTHORITATIVE-Eintrag in `build-sf5-lifecycle.mjs`; 39939890956 wird zu `SUPERSEDED_BY_40099831813_SAME_REFERENCES`. |
| [40099833835](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40099833835) | `kk-intraday-cache` | `d1ea0179` | **0 Anfragen.** Alle öffentlichen Blöcke (candidates, intradayCoverage, sampling, ep, ps) sind identisch mit 40001460163, ebenso Cache-, Day-Set- und Registerhashes. Neuer AUTHORITATIVE-Eintrag in `build-kk-ep-ps.mjs`; 40001460163 wird zu `SUPERSEDED_BY_40099833835_SAME_PUBLIC_RESULTS`. |

**BASE-Ledger-Hashes der Referenzen = `sf6-run-facts.mjs`** (Ausschnitt):

| Referenz | `ledgerSha256` |
|---|---|
| Darvas | `2be4ed71…` |
| Kullamägi | `8b4dfb91…` |
| Pocket Pivot | `6cafafc7…` |
| BGU | `2ad276df…` |
| Weinstein Investor | `153ea35d…` |
| Weinstein Trader | `0d869af0…` |
| Holy Grail | `875cda8c…` |

Turtle und Minervini liegen nicht auf dieser Engine. Ihr Code ist unverändert: Der Engine-Fingerabdruck `ae2a51ed…` ist unverändert, und der sf4-Fingerabdruck wird per Test geprüft.

**SF7-Varianten (öffentliche Zählungen, Kennzahlen versiegelt):**

| Lifecycle / Variante | Trades (Vergleich) | sicher durch Schluss | weiter „angenommen“ | Ledger ohne Grund gleich |
|---|---|---|---|---|
| Darvas `SF7-REF-CLOSE-RULE` | 19.556 (19.556) | 8.596 | 8.406 (vorher 17.002) | ja |
| Darvas `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE` | 9.440 (7.515) | 4.419 | – | – |
| Holy Grail `SF7-REF-CLOSE-RULE` | 4.025 (4.025) | 127 | 416 (vorher 543) | ja |
| Holy Grail `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE` | 3.702 (3.624) | 112 | – | – |
| Weinstein Investor `SF7-REF-CLOSE-RULE` | 1.348 (1.348) | 1 | 3 (vorher 4) | ja |
| Weinstein Trader `SF7-REF-CLOSE-RULE` | 1.808 (1.808) | 4 | 18 (vorher 22) | ja |

Einordnung (nur Zählungen, keine Performanceaussage):
- In 5.0/6.0 galten bei Darvas 17.002 Ausstiege als „angenommen“, also als Ergebnis der pessimistischen Intrabar-Annahme. **8.596 davon (51 %) sind tatsächlich sicher.** Die Aussage aus 6.0, die Referenz messe „vor allem die pessimistische Intrabar-Annahme“, gilt damit nur noch für 8.406 Ausstiege.
- Die optimistische Darvas-Schranke war unmöglich günstig: 4.419 sicher gestoppte Einstiege wurden gehalten. Die korrigierte Schranke hat 9.440 statt 7.515 Trades, weil früher frei werdendes Kapital Folgetrades erlaubt (Knock-on, E6).
- Bei Holy Grail ist der Effekt klein, bei Weinstein vernachlässigbar.

## 5. Strategien: geändert oder unverändert

| Strategie | Ergebnis | Geprüfte Evidenz |
|---|---|---|
| Turtle S1/S2 | **unverändert, keine technisch lösbare Lücke außer D3** (nur Alternative, gelistet) | LIMIT4 (`addUnits`), LIMIT12 (`buyUnit`), LIMIT6/10 mit PIT-Gruppen der Vorsitzung (GC-TUR-LIMIT6/10); Stops je Einheit, Anhebung erst nach tatsächlichem Fill (nach der Bargeldprüfung); Gap-Stop min(open, stop); Failsafe-Ausstieg in beiden Lesarten (10D/20D, Test vorhanden); Rangfolge nach Stärke bis i − 1, Gleichstand nach ID; Korrelationsgruppen bleiben SIC-Proxy (E4) |
| Darvas | **geändert nur als Variante** (D1) | Stop-Anhebung nur nach oben (`raiseStop`); ATH-Prüfung; PIT-Präfixtest vorhanden; die Referenz behält ihre 17.002 als „angenommen“ bezeichneten Ausstiege (sf5-Lauf 39939890956), der SF7-Lauf zählt davon die sicheren |
| Weinstein Investor/Trader | **geändert nur als Variante** (D1, nur Bezeichnung, keine OPTIMISTIC-Variante vorregistriert) | Wochenentscheidungen nur an abgeschlossenen Wochen; Stop-Plan; VOL5 |
| Kullamägi Breakout | **unverändert, keine technisch lösbare Lücke** | Einstieg `ON_OPEN` mit `maxPlannedLoss` = ADR20 der Vorsitzungen (KK-012 abgeleitet), Ablehnung statt engerem Stop; Teilverkauf und Break-even ab der nächsten Sitzung; KK-001 30 % (Plattform 25 % strenger); keine Mehrdeutigkeit am Einstiegsbalken |
| Pocket Pivot | **unverändert, keine technisch lösbare Lücke** | `ON_OPEN`, kein Preisstop (Quelle gesperrt, E3); Sell-Guide gleich `sellGuideEvidence` (GC-SF5-MOKA-GUIDE-EQUIV); verbrauchte Verletzung kehrt nicht zurück |
| BGU | **unverändert, keine technisch lösbare Lücke** | `ON_OPEN`, Stop-Market am Gap-Tagestief, Gap durch den Stop zur Eröffnung (Test vorhanden); 50er-Fenster als Konvention (D-BGU-VOLWINDOW) |
| Holy Grail W-RAS97 | **geändert nur als Variante** (D1) | Buy-Stop über dem Berührungsbalken, Stop am Swing-Tief; Trailing bleibt SF6-Forschungsvariante (E3) |
| Episodic Pivot | **behoben** (D2, nur versiegelte Auswertung) | Volumen-Tempo nur IEX gegen IEX-Basis der 20 Vorsitzungen (PIT); Stop = Tagestief vor der Fill-Minute; KK-034; gemeinsame Day-Sets |
| Parabolic Short | **unverändert, keine technisch lösbare Lücke** | Einstiegs- und Zielregeln, Stop vor Ziel (pessimistisch), Überlappungsvariante setzt chronologische Kandidaten je Wertpapier voraus (`screenCandidates`: aufsteigend), offene Trades markiert |
| EP/PS-Stichprobe (`kk-sample.mjs`) | **unverändert, keine technisch lösbare Lücke** | `cleanPrefix`: EP bis zum letzten Schlüssel mit Basis, PS bis zum letzten nur über den PS-Pfad gecachten Schlüssel; `stratifiedSample`: exakter rationaler Bruch, Reihenfolge nach Hash; korrekter Median |

Die Readiness-Matrix 6.0 enthält keine Zeile der Klasse TECHNICAL. Ihre TEIL-Zellen sind manuelle Entscheidungen, Quellen- oder Datensperren oder V4-D1. Die `MEASUREMENT_GAP`-Einträge in `STRATEGY-COMPLETION-GAPS.json` betreffen nur V4-D1/V4-D2 (außerhalb dieses Auftrags). Minervini wurde nicht berührt.

## 6. Verbleibende Risiken

| Schwere | Risiko | Warum offen / Vorschlag |
|---|---|---|
| MEDIUM | **SF7-D3 Turtle OPTIMISTIC**: Die Alternative `ENTRY_BAR_OPTIMISTIC` überschätzt ihre Schranke (Eröffnungs-Fills und Schluss ≤ Stop). | `methods/turtle.mjs` gehört zum gepinnten `turtleEngineCodeSha256` (SF6-PAPER-2027) und zum AG-3-Fingerabdruck. Eine Behebung braucht eine neue Turtle-Engine-Version, einen neuen Referenzlauf und eine Protokollversion. Das ist eine Eigentümerentscheidung vor dem 01.01.2027. Die Referenz BASE_S0 ist nicht betroffen. |
| MEDIUM | **EP am Einstiegstag nur IEX**: Ob der Stop am selben Tag fällt, entscheiden allein die IEX-Minuten. Ein konsolidiertes Tagestief unter dem Stop wird nicht geprüft und ist eine mögliche optimistische Verzerrung. | Lösbar als reine Zähl-Evidenz aus den Tagesbalken (Cache-only). Nicht umgesetzt, weil es eine neue Einordnung wäre und nicht nebenbei kommen soll. Vorschlag: eigener Schritt mit Zählung „Tagestief ≤ Stop ohne IEX-Stop“. |
| LOW | Weinstein-Trailing: Der Kommentar sagt „Wochenhoch am oder über dem Hoch“, der Code verlangt „darüber“ (`>`). | Eine Änderung würde die Referenz ändern. Vorerst nur dokumentiert. |
| LOW | Dust-Abschreibungen (< 0,01 $) stehen in der Engine nur in den Ereignissen, nicht im Ledger (Vertrag A8 verlangt das Ledger). Ohne Zahlungsfluss bleibt die Kasse unberührt. | Eine Änderung des Ledgers ändert Referenz-Hashes. Nur dokumentiert. |
| LOW | Stale-Abrechnung ohne jeden früheren Schluss ergäbe NaN. | Theoretisch: Die Eligibility verlangt Vorbalken. Nur dokumentiert. |
| LOW | EP/PS-Schichtung: Schichten mit Merkmal `NA` (Liquidität oder Regime) sind teilnahmeberechtigt. | Deklariertes Verhalten von 6.0, unverändert. |
