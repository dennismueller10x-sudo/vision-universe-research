# Supertrader 7.0 – Ausführung, Abrechnung und Strategielücken (Workstreams B, D, E, F)

Stand: 24. Oktober 2026. Basis `main` @ `304f91794`. Zweig `claude/supertrader-7-execution`.

Alle Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Keine Strategie ist live, zertifiziert oder handelbar (`LIVE_NOT_APPROVED`). Es gibt keine Orders, keine Brokeranbindung, keine UI-Änderung und keine neuen Intraday-Abrufe. Öffentlich sind nur Zählungen und Hashes. Die Kennzahlen bleiben versiegelt und haben keine Variante ausgewählt (E6).

## 1. Ergebnis in Kürze

- Die gemeinsame Engine (`research/lifecycle-engine.mjs`) wurde adversariell geprüft: Code-Review und ein Invarianten-Fuzzer über alle sf5-Adapter und alle vorregistrierten Varianten. Geprüft wurden Fills im Balken, Schutzstufen, Kosten, Bargeld, Positionsgrenzen, Abrechnung und Abstimmung. Der Fuzzer fand 0 Verstöße gegen die Invarianten (Fill innerhalb des Balkens, Stückbilanz je Trade, Bargeld nie negativ, Abstimmung).
- **Fünf echte Defekte** (D4 und D5 aus dem unabhängigen Review von #898), alle in Lesarten oder Auswertungen, keiner in einer Referenz:

| ID | Schwere | Wo | Defekt | Status |
|---|---|---|---|---|
| SF7-D1 | MEDIUM | `lifecycle-engine.mjs#fillOrder` | Bei einem Buy-Stop-Fill per Berührung mit Tief **und Schluss** am oder unter dem Stop galt der Stop als „mehrdeutig“. Der Schluss ist aber der letzte Kurs des Balkens: Der Kurs lag beim Fill über dem Stop und schloss am oder unter ihm, also wurde der Stop **nach** dem Fill gehandelt. Die OPTIMISTIC-Lesart hielt solche Positionen trotzdem. Die PESSIMISTIC-Referenz stieg bereits zum Stop aus, nur mit der Bezeichnung „angenommen“. | als deklarierte Variante behoben (EX7) |
| SF7-D2 | MEDIUM | `run-kk-intraday.mjs#epTradeSummary` | Die versiegelten EP-Handelskennzahlen lasen `realizedPnl`. Geschlossene Engine-Trades tragen ihr Ergebnis aber als `pnl`. Mittelwert, Median und Trefferquote waren deshalb leer (`null`), auch je Schicht. In der versiegelten Tradeliste fehlte das Ergebnis geschlossener Trades. Öffentliche Zählungen und Hashes waren nicht betroffen. | behoben |
| SF7-D3 | MEDIUM | `methods/turtle.mjs`, nur Alternative `ENTRY_BAR_OPTIMISTIC` | Gleiche Klasse wie D1: Die Turtle-Alternative übergeht jeden Stop am Einstiegs- oder Nachkaufbalken, auch wenn der Fill zur Eröffnung lag. Dann kommt das Tief zwingend danach. | **behoben nach E7-3** als versionierte Lesart `OPTIMISTIC_CERTAIN_RULE` (sf-turtle-1.3.0), siehe [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md) |
| SF7-D4 | MEDIUM | `research/minervini-lifecycle.mjs#fillBuyOrder` / `minervini-execution.mjs` | Gleiche Klasse wie D1 bei Minervini: Eine Pivot-Berührung mit Tief ≤ Stop gilt unabhängig vom Schluss als `AMBIGUOUS`, und `ALT-INTRABAR-OPTIMISTIC` übergeht sie. Beispiel: Pivot 10,5, Stop 10,0, Balken O 10,2 / H 10,8 / L 9,9 / C 9,95; OPTIMISTIC hält eine sicher gestoppte Position. | **behoben nach E7-3** als Variante `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE`, siehe [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md) |
| SF7-D5 | MEDIUM | `research/kk-ep-lifecycle.mjs#resolveEpDay` | Unter `ALT-FILL-MINUTE-OPTIMISTIC` wird das Tief der Fill-Minute ≤ Stop immer übergangen. Sicher ist der Stop aber, wenn der Fill die Minuteneröffnung ist (Open ≥ Level) oder die Minute am oder unter dem Stop schließt. | als deklarierte Variante behoben (EX7-EP), REF unberührt |

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

### SF7-D1: Grenzen der Regel „Schluss ≤ Stop = sicher“

Diese Grenzen gehören zur Revision. Ihr Registertext ist vor dem Lauf gepinnt und im Lauf 40099831813 eingetragen, deshalb stehen sie hier statt im `why`-Text: Eine Änderung des Texts würde das gepinnte Register nach Vorliegen eines Ergebnisses ändern.
- Der Tagesschluss ist der Kurs der Schlussauktion. Lag der fortlaufende Handel nach dem Fill ganz über dem Stop und erreichte erst die Auktion den Stop, dann ist der Stop im Sinne des Balkens „gehandelt“. Ob eine ruhende Stop-Order tatsächlich in der Auktion ausgeführt worden wäre, hängt vom Ordertyp und vom Handelsplatz ab, und das zeigt kein Tagesbalken.
- Ausgeführt wird zum Stop. Ein Kurssprung durch den Stop innerhalb der Sitzung, etwa nach einem Handelsstopp, hätte zu einem schlechteren Preis gefüllt. Diese Lücke hat auch der bisherige PESSIMISTIC-Ausstieg, und sie ist auf Tagesbalken nicht auflösbar.
- Die Regel macht die OPTIMISTIC-Schranke also nur weniger optimistisch. Pessimistischer als die Referenz wird sie nie.

### SF7-D5 → Ausführungsrevision EX7-EP-FILL-MINUTE-CERTAIN

- **Regel:** Unter OPTIMISTIC ist ein Tief der Fill-Minute ≤ Stop ein sicherer Stop am selben Tag, ausgeführt zum Stop. Das gilt, wenn der Fill die Minuteneröffnung ist (Open ≥ Level) oder die Minute am oder unter dem Stop schließt. Sonst entscheiden wie bisher die späteren Minuten.
- **Datenbasis:** nur IEX-Kurse. Die Regel kann deshalb nur sichere Stopps übersehen, nie einen erfinden.
- **Umsetzung:** `makeEpAdapter({ fillMinuteRule })` in `kk-ep-lifecycle.mjs`. `KK_EP_ADAPTER` bleibt unverändert: Version `kk-ep-chart-lifecycle-1.2.0`, kein Flag, EP-Register `e8d25282…`.
- **Variante:** `SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE` in `research/sf7-ep-execution-variants.mjs` (Register `1b48d3cd…`, vor dem Lauf gepinnt). Vergleich mit `ALT-FILL-MINUTE-OPTIMISTIC` auf dem Referenz-Day-Set `CLEAN`, nur aus dem Cache.
- **Lauf:** Der Runner `kk-intraday-runner-1.3.0` veröffentlicht den Block `ep.sf7Execution` mit Zählungen, Hashes und `fillMinuteStop`-Zählung.
- **Pins:** `kk-ep-lifecycle.mjs` ist in keinem Protokoll gepinnt. SF6-PAPER-2027 schließt EP aus. Der Fingerabdruck des KK-Research-Codes wird je Lauf eingetragen.
- **REF:** Die Referenz ist PESSIMISTIC; das Tief der Fill-Minute ist dort bereits ein Stop. Test `SF7-D5-EP-FILL-MINUTE`: REF ist mit und ohne Flag identisch.

### SF7-D2 → behoben

- `epRealizedPnl(t)`: `pnl` für `CLOSED`, `realizedPnl` für offene Trades.
- `epSealedTrade(t)` erzeugt die versiegelte Tradeliste.
- Der Runner heißt seit 7.0 `kk-intraday-runner-1.2.1`, mit D5 dann `1.3.0`.
- Die EP- und PS-Register, die Day-Sets und alle öffentlichen Hashes sind unverändert (Lauf in Abschnitt 4).

## 3. Tests

Neu ist `scripts/supertrader/tests/sf-sf7-execution.test.mjs` mit 17 Tests. Die Defekttests schlugen vor der jeweiligen Behebung fehl: `SF7-D1-FILL`, `SF7-D1-LIFECYCLE`, `SF7-D1-PESSIMISTIC-PRICES` und `SF7-D2-EP-TRADE-SUMMARY`. `SF7-D5-EP-FILL-MINUTE` zeigt den Defekt ohne Flag im selben Test. Das wurde gegen den Stand von `main` geprüft.

| Test | Prüft |
|---|---|
| SF7-D1-FILL | Einordnung sicher / mehrdeutig / Gap; Schluss gleich Stop; fehlender Schluss |
| SF7-D1-LIFECYCLE | OPTIMISTIC vorher: gehalten, am Folgetag zum Gap-Open gestoppt; mit EX7: Ausstieg am Stop desselben Balkens; Fall Schluss > Stop unverändert |
| SF7-D1-PESSIMISTIC-PRICES | unter PESSIMISTIC nur die Bezeichnung anders, Fills, Stücke und Preise gleich |
| SF7-D1-REFERENCES-UNTOUCHED | sf5-Register gepinnt, kein Referenzadapter mit Flag, SF7-Register gepinnt, Konfiguration = Vergleichsvariante |
| SF7-D2-EP-TRADE-SUMMARY | versiegelte EP-Handelskennzahlen aus `pnl` |
| SF7-D3-TURTLE-OPTIMISTIC-FIXED | (seit E7-3) ersetzte Lesart zeigt D3, `OPTIMISTIC_CERTAIN_RULE` stoppt; die Turtle-Referenz stoppt korrekt |
| SF7-D4-MINERVINI-FIXED | (seit E7-3) ohne Option `AMBIGUOUS` (Referenzpfad), mit Revision `CERTAIN_BY_CLOSE` |
| SF7-D5-EP-FILL-MINUTE | Fill zur Minuteneröffnung und Minutenschluss ≤ Stop: ohne Flag übergangen, mit Flag sicher; mehrdeutiger Fall unverändert; REF mit und ohne Flag identisch |
| SF7-D5-EP-VARIANT | EP-Register, Referenzadapter und Version unverändert; Variante gepinnt; Konfiguration = Vergleichsvariante |
| SF7-RUN-TRANSCRIPTION | eingetragener SF7-Registerhash im sf5-Laufeintrag = aktueller Code; jede eingetragene Variante existiert |
| SF7-RUNNER-BLOCK | SF7-Block im sf5-Runner; öffentlich nur Zählungen. REF-Vergleich: Ledger ohne Grund gleich, Ledger-Hash nur bei Umbuchungen anders. OPTIMISTIC-Vergleich: bei sicheren Stopps ist das Ledger ohne Grund verschieden. `tradesDelta` = Differenz der Tradezahlen |
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
| [40099833835](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40099833835) | `kk-intraday-cache` | `d1ea0179` | **0 Anfragen.** Alle öffentlichen Blöcke (candidates, intradayCoverage, sampling, ep, ps) sind identisch mit 40001460163, ebenso Cache-, Day-Set- und Registerhashes. 40001460163 wird zu `SUPERSEDED_BY_40099833835_SAME_PUBLIC_RESULTS`. |
| [40107434014](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40107434014) | `kk-intraday-cache` | `ec9d00f7` | Lauf nach den Review-Befunden (D5). **0 Anfragen.** Alle öffentlichen Blöcke außerhalb des neuen `ep.sf7Execution` sind identisch mit 40099833835 und 40001460163. Das gilt für alle Day-Sets und alle EP- und PS-Varianten, REF eingeschlossen (`ledgerSha256` `4ded0139…`, `tradesSha256` `a3219114…`). Neuer AUTHORITATIVE-Eintrag; 40099833835 wird zu `SUPERSEDED_BY_40107434014_SAME_PUBLIC_RESULTS`. |

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

Turtle und Minervini liegen nicht auf dieser Engine. Ihr Code ist unverändert: Der Engine-Fingerabdruck `ae2a51ed…` ist unverändert, und der sf4-Fingerabdruck wird per Test geprüft. (Stand #898; seit E7-3 `89fbcf864a57…` bzw. Minervini `c834b227045b…`, Referenzen hashgleich, siehe [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md)).

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

**SF7-EP-Variante (Lauf 40107434014, Day-Set CLEAN, nur Zählungen):**
- `SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE`: 606 Trades gegenüber 607 bei `ALT-FILL-MINUTE-OPTIMISTIC`.
- 21 Fill-Minuten-Stopps sind jetzt sicher: 12 durch einen Fill zur Minuteneröffnung, 9 durch einen Minutenschluss am oder unter dem Stop.
- Abgestimmt; `ledgerSha256` `513f3418…`.

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
| Episodic Pivot | **behoben** (D2, nur versiegelte Auswertung); **geändert nur als Variante** (D5, OPTIMISTIC-Fill-Minute) | Volumen-Tempo nur IEX gegen IEX-Basis der 20 Vorsitzungen (PIT); Stop = Tagestief vor der Fill-Minute; KK-034; gemeinsame Day-Sets |
| Parabolic Short | **unverändert, keine technisch lösbare Lücke** | Einstiegs- und Zielregeln, Stop vor Ziel (pessimistisch), Überlappungsvariante setzt chronologische Kandidaten je Wertpapier voraus (`screenCandidates`: aufsteigend), offene Trades markiert |
| EP/PS-Stichprobe (`kk-sample.mjs`) | **unverändert, keine technisch lösbare Lücke** | `cleanPrefix`: EP bis zum letzten Schlüssel mit Basis, PS bis zum letzten nur über den PS-Pfad gecachten Schlüssel; `stratifiedSample`: exakter rationaler Bruch, Reihenfolge nach Hash; korrekter Median |

Die Readiness-Matrix 6.0 enthält keine Zeile der Klasse TECHNICAL. Ihre TEIL-Zellen sind manuelle Entscheidungen, Quellen- oder Datensperren oder V4-D1. Die `MEASUREMENT_GAP`-Einträge in `STRATEGY-COMPLETION-GAPS.json` betreffen nur V4-D1/V4-D2 (außerhalb dieses Auftrags). Der Minervini-Code wurde nicht geändert. Der Befund D4 (Abschnitt 1) ist gelistet und durch einen Test charakterisiert. Nachtrag E7-3: D3 und D4 sind in [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md) behoben.

## 6. Verbleibende Risiken

| Schwere | Risiko | Warum offen / Vorschlag |
|---|---|---|
| erledigt | **SF7-D3 Turtle OPTIMISTIC** | Behoben nach E7-3 (25.10.2026): [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md), Lauf 40170829944, Referenzen hashgleich, SF6-PAPER-2027 1.1.0 (nicht aktiv). |
| MEDIUM | **EP am Einstiegstag nur IEX**: Ob der Stop am selben Tag fällt, entscheiden allein die IEX-Minuten. Ein konsolidiertes Tagestief unter dem Stop wird nicht geprüft und ist eine mögliche optimistische Verzerrung. | Lösbar als reine Zähl-Evidenz aus den Tagesbalken (Cache-only). Nicht umgesetzt, weil es eine neue Einordnung wäre und nicht nebenbei kommen soll. Vorschlag: eigener Schritt mit Zählung „Tagestief ≤ Stop ohne IEX-Stop“. |
| LOW | Weinstein-Trailing: Der Kommentar sagt „Wochenhoch am oder über dem Hoch“, der Code verlangt „darüber“ (`>`). | Eine Änderung würde die Referenz ändern. Vorerst nur dokumentiert. |
| LOW | Dust-Abschreibungen (< 0,01 $) stehen in der Engine nur in den Ereignissen, nicht im Ledger (Vertrag A8 verlangt das Ledger). Ohne Zahlungsfluss bleibt die Kasse unberührt. | Eine Änderung des Ledgers ändert Referenz-Hashes. Nur dokumentiert. |
| LOW | Stale-Abrechnung ohne jeden früheren Schluss ergäbe NaN. | Theoretisch: Die Eligibility verlangt Vorbalken. Nur dokumentiert. |
| LOW | EP/PS-Schichtung: Schichten mit Merkmal `NA` (Liquidität oder Regime) sind teilnahmeberechtigt. | Deklariertes Verhalten von 6.0, unverändert. |
| erledigt | **SF7-D4 Minervini OPTIMISTIC** | Behoben nach E7-3 (25.10.2026): [SUPERTRADER_7_OPTIMISTIC_FIXES.md](SUPERTRADER_7_OPTIMISTIC_FIXES.md), Lauf 40170832007, alle registrierten Varianten hashgleich. |
| LOW | `run-sf6-validation.mjs` und `run-sf6-integrity.mjs` führen `lifecycle-engine.mjs` und `minervini-execution.mjs` nicht in ihren Code-Dateilisten (`validationCodeSha256` / `integrityCodeSha256`). Eine Engine-Änderung ändert deren Fingerabdruck daher nicht. | Nicht hier behoben, weil eine Änderung die eingetragenen 6.0-Fingerabdrücke verschieben würde. Vorschlag für einen eigenen PR: beide Dateien aufnehmen und die Läufe neu eintragen. |
