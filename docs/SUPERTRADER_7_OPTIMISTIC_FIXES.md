# Supertrader 7.0 – Behebung SF7-D3 / SF7-D4 in den OPTIMISTIC-Lesarten

Stand: 25. Oktober 2026. Eigentümerentscheidung **E7-3**. Zweig `claude/supertrader-7-optimistic-fixes`, aufgesetzt auf `claude/supertrader-7-execution` (PR #898). Dieser Änderungsstand setzt #898 voraus.

Alle Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Nichts ist live, zertifiziert oder handelbar (`LIVE_NOT_APPROVED`). Es gibt keine Orders, keine Brokeranbindung, keine UI-Änderung und keine neuen Datenabrufe. Öffentlich sind nur Zählungen und Hashes. Die Kennzahlen bleiben versiegelt, und keine Variante wird nach Ergebnis gewählt (E6).

## 1. Entscheidung E7-3 und Umsetzung

| Vorgabe E7-3 | Umsetzung |
|---|---|
| Die beiden belegten Ausführungsdefekte der OPTIMISTIC-Lesarten beheben | SF7-D3 (Turtle) und SF7-D4 (Minervini), jeweils als **neue, versionierte Lesart bzw. Variante** |
| Referenzen schützen | Kein Referenzpfad wurde geändert. Beide Snapshot-Läufe reproduzieren jede Referenz und jede bestehende Variante mit identischem öffentlichem Block (Abschnitt 4). |
| Jede Änderung an Modellvarianten versioniert, mit Vorher/Nachher | Die alte OPTIMISTIC-Lesart bleibt unverändert im Lauf und ist als ersetzt markiert. Vorher/Nachher steht je Variante in Abschnitt 4. |
| SF6-PAPER-2027 neue Version, nicht aktivieren | Protokoll **1.1.0** mit den neuen Fingerabdrücken; 1.0.0 als ersetzt eingetragen. Status bleibt `PREPARED_NOT_ACTIVE`; kein Scheduler, kein Workflow. |

## 2. Defekte

Beide Defekte gehören zur Klasse von SF7-D1. Eine optimistische Lesart darf das Tief eines Tagesbalkens nur dann vor den Fill legen, wenn das möglich ist. Unmöglich ist es in zwei Fällen:

1. **Fill zur Eröffnung** (Gap über das Einstiegslevel, Limit- oder Eröffnungsfill): Der ganze Balken liegt nach dem Fill, also auch das Tief.
2. **Schluss am oder unter dem Level**: Der Schluss ist der letzte Kurs des Balkens. Der Kurs lag beim Fill über dem Stop und schloss am oder unter ihm, also wurde der Stop nach dem Fill gehandelt.

| ID | Wo | Defekt (vorher) |
|---|---|---|
| SF7-D3 | `methods/turtle.mjs`, Lesart `entryBarOrder = OPTIMISTIC` (Szenario `ENTRY_BAR_OPTIMISTIC`) | Jeder Stop und jeder Kanalausstieg am Einstiegs- oder Nachkaufbalken wurde übergangen, auch nach einem Fill zur Eröffnung und auch bei Schluss unter dem Level. Dasselbe galt für den hypothetischen Ausbruch des S1-Filters. |
| SF7-D4 | `research/minervini-lifecycle.mjs#fillBuyOrder`, Variante `ALT-INTRABAR-OPTIMISTIC` | Eine Pivot-Berührung (`INTRADAY_PIVOT_TOUCH`) mit Tief ≤ Stop galt unabhängig vom Schluss als `AMBIGUOUS`, und OPTIMISTIC übergeht `AMBIGUOUS`. Beispiel: Pivot 10,5, Stop 10,0, Balken O 10,2 / H 10,8 / L 9,9 / C 9,95. OPTIMISTIC hielt eine sicher gestoppte Position. Gap-, Limit- und Eröffnungsfills waren bereits `CERTAIN`. |

## 3. Behebung und Versionen

### SF7-D3 → `OPTIMISTIC_CERTAIN_RULE` (Revision `EX7-TUR-SAME-BAR-CERTAIN`, `sf-turtle-1.3.0`)

- **Neue Lesart** `entryBarOrder = 'OPTIMISTIC_CERTAIN_RULE'` und neues Szenario `ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE` im Runner (`sf-runner-1.2.0`). Die Modellannahme `MA-TUR-INTRABAR-ORDER` nennt die neue Lesart als Alternative. Die alte Lesart steht dort unter `supersedes` (`SUPERSEDED_SF7_D3`).
- **Regel:** Das Tief bleibt so früh wie möglich, also optimistisch. Ausgeführt wird ein Level am selben Balken nur, wenn es sicher ist:
  - `OPEN_FILL`: Der Einstieg (oder der erste Nachkauf eines gehaltenen Balkens) lag zur Eröffnung. Dann gilt jedes Level, das das Tief danach erreicht. Das Tief liegt vor späteren Nachkäufen desselben Balkens (optimistisch), deshalb folgt nach einem sicheren Stop kein Nachkauf.
  - `CLOSE`: Der Schluss liegt am oder unter dem Level. Das Level wurde nach dem letzten Fill des Balkens gehandelt.
  - Ausgeführt wird zum Level, das höhere zuerst: Einheiten-Stops über dem Kanal-Level, danach der Kanal. Das entspricht der Referenz. Gründe: `STOP_2N_SAME_BAR_CERTAIN`, `EXIT_<n>D_SAME_BAR_CERTAIN`. Neue Zähler `sameBarCertainByOpenFill` und `sameBarCertainByClose` entstehen erst beim ersten Fall.
  - Für den S1-Filter gilt dieselbe Regel am Ausbruchsbalken (`ENTRY_BAR_RESOLVED_CERTAIN`).
- **Referenz unberührt:** `PESSIMISTIC` und die alte `OPTIMISTIC`-Lesart laufen Zeile für Zeile wie in 1.2.0. Nur `OPTIMISTIC_CERTAIN_RULE` erreicht den neuen Code.

### SF7-D4 → `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE` (Revision `EX7-SAME-BAR-CLOSE-CONFIRMS-STOP`)

- **Gleiche Semantik wie die D1-Revision aus #898.** Neues, gepinntes Register `research/sf7-minervini-variants.mjs` (`sf7-minervini-variants-1.0.0`, `496cad56c7eb…`), festgelegt vor jedem Snapshot-Ergebnis:
  - `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE` (Vergleich `ALT-INTRABAR-OPTIMISTIC`) ersetzt `ALT-INTRABAR-OPTIMISTIC`. Die alte Variante wird weiter gerechnet und ist im Artefakt als `SUPERSEDED_SF7_D4` markiert.
  - `SF7-REF-CLOSE-RULE` (Vergleich `REF`) zählt, wie viele der „angenommenen“ Referenzausstiege tatsächlich sicher sind. Fills, Stücke und Preise bleiben gleich, nur die Bezeichnung ändert sich.
- **Umsetzung:** Die Varianten haben die Konfiguration ihrer Vergleichsvariante plus `sameBarCloseConfirmsStop: true`. `entryEligibility` überträgt das Feld als `closeConfirmsStop` auf die Order, und `fillBuyOrder` liefert dann bei Schluss ≤ Stop `CERTAIN` (`sameBarStopEvidence: CERTAIN_BY_CLOSE`). `minervini-execution.mjs` ist **unverändert** und bucht den Fall als `STOP_SAME_BAR_CERTAIN`. Deshalb bleiben die Research-Fingerabdrücke von sf5 und Kullamägi EP/PS unverändert, die diese Datei einschließen.
- **Register `f13ea350…` unverändert.** `RUN_VARIANTS` und `REFERENCE_CONFIG` sind nicht angefasst, und keine registrierte Variante trägt das Feld (Test).
- **Runner** `sf4-lifecycle-runner-1.1.0`: Er misst die SF7-Varianten neben ihrer Vergleichsvariante und veröffentlicht den Block `sf7Execution` mit Zählungen, Hashes und Vergleich: `ledgerWithoutReasonsEqual`, `ledgerRowsWithChangedReason`, `tradesDelta`, `sameBarStopCertainDelta`, `sameBarStopAmbiguousDelta`. Die Kennzahlen sind versiegelt.

## 4. Vorher / Nachher (Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, research-v1)

| Lauf | Modus | Commit | Vergleich mit | Ergebnis |
|---|---|---|---|---|
| [40170829944](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40170829944) | `sf-research` | `d32d1013` | 39397517900 | Datensatz `EXACT`. **Alle 16 bisherigen Szenarien von S1/S2 haben einen identischen öffentlichen Block** (Trades, `ledgerSha256`, Ausführungszähler, Liquidität), BASE_S0 eingeschlossen. Darvas-Komponentenstudie: `tradesSha256` gleich, 22.577 Signale. |
| [40170832007](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40170832007) | `sf4-lifecycle` | `d32d1013` | 39746264325 | Datensatz `EXACT`. **Alle 21 registrierten Varianten (SEPA 11, Power Play 10) haben einen identischen öffentlichen Block** (Zählungen, Ausstiegsgründe, `ledgerSha256`, `tradesSha256`). Setup-Zählungen, ppFix und Fundamentaldeckung sind gleich. Die Referenz ist deterministisch. |

**Referenzen (unverändert):**

| Referenz | Trades | `ledgerSha256` | `tradesSha256` |
|---|---|---|---|
| Turtle S1 BASE_S0 | 820 | `884d88cb5194…` (= `sf6-run-facts.mjs`) | nicht veröffentlicht (Turtle-Runner) |
| Turtle S2 BASE_S0 | 559 | `67169e865384…` (= `sf6-run-facts.mjs`) | nicht veröffentlicht |
| Minervini SEPA REF | 954 | `1ca5239107bd…` | `207d36f035b9…` |
| Minervini Power Play REF | 1.007 | `877ceb333831…` | `d25663ecc005…` |

**Korrigierte Lesarten (nur Zählungen und Hashes):**

| Strategie | vorher (ersetzt) | nachher (korrigiert) | sichere Stopps am Einstiegsbalken |
|---|---|---|---|
| Turtle S1 | `ENTRY_BAR_OPTIMISTIC`: 786 Trades, 789 Einstiege, `52d0c849f31e…` | `ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE`: 862 Trades, 865 Einstiege, `110e609578f5…` | 99 (69 Eröffnungs-Fill, 30 Schluss); 65 Einstiegs-Stops, 32 Nachkauf-Stops, 2 Kanal |
| Turtle S2 | `ENTRY_BAR_OPTIMISTIC`: 528 Trades, 531 Einstiege, `c6a4e61bede5…` | `ENTRY_BAR_OPTIMISTIC_CERTAIN_RULE`: 489 Trades, 492 Einstiege, `1b188ccdbb32…` | 61 (44 Eröffnungs-Fill, 17 Schluss); 43 Einstiegs-Stops, 18 Nachkauf-Stops |
| Minervini SEPA | `ALT-INTRABAR-OPTIMISTIC`: 987 Trades, `14a557551933…` / `737fe61733e5…` | `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE`: 977 Trades, `817c27a3843b…` / `4e8ec4820918…` | +8 sicher (statt übergangen) |
| Minervini Power Play | `ALT-INTRABAR-OPTIMISTIC`: 929 Trades, `8f3bf76ef153…` / `1ba54a8853a5…` | `SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE`: 931 Trades, `38ba7d02784d…` / `8be245555ab1…` | +22 sicher |

**Referenz mit Schlussregel (nur Bezeichnung):**
- SEPA `SF7-REF-CLOSE-RULE`: 954 Trades, Ledger ohne Grund gleich REF. 5 der 21 als „angenommen“ bezeichneten Ausstiege am Einstiegsbalken sind sicher.
- Power Play `SF7-REF-CLOSE-RULE`: 1.007 Trades, Ledger ohne Grund gleich REF. 19 der 138 sind sicher.

Einordnung (nur Zählungen, keine Performanceaussage):
- Die ersetzten OPTIMISTIC-Schranken waren unmöglich günstig. Bei Turtle S1 hielt die alte Lesart 99 sicher gestoppte Einheiten oder Positionen. Durch früher frei werdendes Kapital entstehen Folgetrades (862 statt 786, Knock-on). Bei S2 überwiegt der Wegfall gehaltener Positionen (489 statt 528).
- Bei Minervini ist der Effekt klein (SEPA 8, Power Play 22 Fälle).
- Die korrigierte Schranke ist nie pessimistischer als die Referenz. Wo der Fall mehrdeutig bleibt (Fill per Berührung, Schluss über dem Level), bleibt sie optimistisch.

## 5. Geänderte Pins und Begründung

Kein Pin wurde geändert, ohne dass beide Läufe die Referenz-Ausgaben hashgleich belegen (Abschnitt 4).

| Pin | vorher | nachher | Grund |
|---|---|---|---|
| AG-3-Engine-Fingerabdruck (`run-research.mjs#codeSha256`; `turtleEngineCodeSha256` in SF6-PAPER-2027) | `ae2a51ed86ae…` | `89fbcf864a57…` | `methods/turtle.mjs` (neue Lesart) und `runner/run-research.mjs` (neues Szenario, `sf-runner-1.2.0`). Neuer `CURRENT_ENGINE`-Eintrag 40170829944 in `facts.mjs`; 39397517900 wird `REGRESSION_REFERENCE`. |
| Minervini-Research-Code (`run-sf4-lifecycle.mjs#researchCodeSha256`; `minerviniResearchCodeSha256`) | `b1d81fb8b67a…` | `c834b227045b…` | `minervini-lifecycle.mjs` (Option in `fillBuyOrder`, Feld in `entryEligibility`, Hinweis in `MA-MIN-INTRABAR-ORDER`), `run-sf4-lifecycle.mjs` (Runner 1.1.0) und die neue Datei `sf7-minervini-variants.mjs` in der Dateiliste. Neuer `AUTHORITATIVE`-Eintrag 40170832007; 39746264325 wird `SUPERSEDED_BY_40170832007_SAME_REFERENCES`. |
| Minervini-Variantenregister | `f13ea350…` | **unverändert** | – |
| sf5-Variantenregister | `0a1260e9…` | **unverändert** | – |
| Research-Code sf5 / Kullamägi EP/PS | – | **unverändert** | `minervini-execution.mjs` nicht geändert |
| SF7-Minervini-Register | – | `496cad56c7eb…` (neu, gepinnt) | Test `SF7-D4-MINERVINI-VARIANTS` |
| SF6-PAPER-2027 | 1.0.0 `c90c30bcf018…` | 1.1.0 `e623b336cd24…` | neue Fingerabdrücke; 1.0.0 als `SUPERSEDED_BY_1_1_0_NEVER_ACTIVATED` eingetragen |

Hinweise:
- Die Engine-Fingerabdrücke `ae2a51ed…` in älteren Laufeinträgen (sf5, Kullamägi, sf6) beschreiben den Code zum Zeitpunkt dieser Läufe. Das bleibt richtig. Gegen den aktuellen Wert prüfen die Tests nur die maßgeblichen Turtle- und Minervini-Einträge.
- Die Referenzgleichheit in `sf6-run-facts.mjs` (gegen 39397517900 und 39746264325) bleibt gültig, weil die neuen Läufe dieselben Hashes zeigen.
- Der Vertragsfingerabdruck der Turtle-Läufe weicht vom Lauf am 20.10. ab. Ursache sind Vertragsänderungen aus den Runden 3.0 bis 5.0. Dieser PR ändert keine Verträge.

## 6. SF6-PAPER-2027 1.1.0: nicht aktiviert

- `version: '1.1.0'`, `fixedOn: '2026-10-25'`, `ownerDecision: 'E2; E7-3 (1.1.0)'`. Neu ist `referenceIdentity`: Er nennt die beiden Läufe und ihr Gleichheitsergebnis.
- Neu ist auch `supersedes` mit Version, Datum, Fingerabdruck und alten Pins von 1.0.0. Status: `SUPERSEDED_BY_1_1_0_NEVER_ACTIVATED`.
- `status: 'PREPARED_NOT_ACTIVE'` und `activation.status: 'NOT_ACTIVATED'`. Scheduler, Orders, Broker und Produktfläche stehen alle auf `NONE`. Kein Workflow referenziert das Protokoll (Test).
- Die SF7-Ausführungsvarianten gehören nicht zum Umfang (`notInScope`). Gepinnt sind nur die Referenzen.
- Dokument: [SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md](SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md), Abschnitt „Versionen“.

## 7. Tests

Neu ist `scripts/supertrader/tests/sf-sf7-optimistic-fixes.test.mjs` mit 8 Tests. Die Fix-Tests schlagen auf dem Stand vor der Behebung fehl: Die neue Lesart gibt es dort nicht (`UNKNOWN_ENTRY_BAR_ORDER`), und `fillBuyOrder` liefert `AMBIGUOUS`. Geprüft gegen `8e66e392`.

| Test | Prüft |
|---|---|
| SF7-D3-TURTLE-OPEN-FILL | Gap-Einstieg, Tief durch den Stop: Stop am selben Balken (vorher gehalten); Preis gleich der Referenz |
| SF7-D3-TURTLE-CLOSE | Berührungs-Einstieg, Schluss unter dem Kanal-Level: sicher; Schluss über allen Levels: wie OPTIMISTIC |
| SF7-D3-TURTLE-ADD-AT-OPEN | Nachkauf zur Eröffnung eines gehaltenen Balkens, Tief durch den neuen Einheiten-Stop: sicher |
| SF7-D3-TURTLE-FILTER | S1-Filter: hypothetischer Ausbruch zur Eröffnung wird LOSER, der mehrdeutige Fall bleibt offen |
| SF7-D3-TURTLE-VERSIONED | Version, Szenarien, Modellannahme; PESSIMISTIC und OPTIMISTIC (S1/S2) auf einem synthetischen Universum **bitgleich mit dem Code vor der Behebung** (Fingerabdruck mit dem alten Code erzeugt) |
| SF7-D4-MINERVINI-FILL | `CERTAIN_BY_CLOSE` nur mit Option; Schluss = Stop; Schluss > Stop und fehlender Schluss bleiben mehrdeutig; Gap unverändert |
| SF7-D4-MINERVINI-LIFECYCLE | das Szenario aus #898: korrigiertes OPTIMISTIC stoppt am selben Balken; REF nur mit anderer Bezeichnung |
| SF7-D4-MINERVINI-VARIANTS | SF7-Register gepinnt; `f13ea350` unverändert; Konfiguration = Vergleichsvariante plus Feld; alle 21 registrierten Varianten **bitgleich mit dem Code vor der Behebung** |

Die bisherigen Charakterisierungstests in `sf-sf7-execution.test.mjs` heißen jetzt `SF7-D3-TURTLE-OPTIMISTIC-FIXED` und `SF7-D4-MINERVINI-FIXED`. Sie zeigen den Defekt der ersetzten Lesart weiter (Vorher) und die Behebung (Nachher). Die Pins in `sf-sf6-readiness.test.mjs` prüfen, dass die Protokoll-Pins dem aktuellen Code entsprechen.

## 8. Verbleibende Risiken

| Schwere | Risiko | Vorschlag |
|---|---|---|
| LOW | Turtle `OPEN_FILL`: Das Tief wird vor spätere Nachkäufe desselben Balkens gelegt. Das ist die optimistische Wahl unter mehreren möglichen Pfaden und keine Gewissheit über die Reihenfolge. | dokumentiert; auflösbar nur mit Intraday-Daten |
| LOW | Schlussregel: Der Tagesschluss ist der Kurs der Schlussauktion. Ob eine ruhende Stop-Order in der Auktion ausgeführt worden wäre, zeigt kein Tagesbalken (gleiche Grenze wie D1). | dokumentiert |
| LOW | Bei Minervini zählt der Runner die durch den Schluss sicheren Fälle als Differenz von `sameBarStopCertain`. Ein eigener Zähler hätte eine Änderung an `minervini-execution.mjs` verlangt und damit die Fingerabdrücke von sf5 und EP/PS verschoben. | bei der nächsten ohnehin nötigen sf5/EP-Neuberechnung nachziehen |
| INFO | `contracts/turtle.mjs` nennt in `knownLimitations` weiter das Szenario `ENTRY_BAR_OPTIMISTIC`. Es wird weiter gerechnet. Eine Textänderung hätte den Vertragsfingerabdruck geändert. | mit der nächsten Vertragsrunde angleichen |
| LOW | Turtle, Nachkauf am Einstiegsbalken: Der Callback für einen Nachkauf zur Eröffnung (`turtle.mjs`, Einstiegszweig) kann dort nie greifen. Das Nachkauf-Level liegt über dem letzten Fill und damit über der Eröffnung. Der Code ist harmlos, deutet aber einen Fall an, den es nicht gibt. | mit der nächsten Engine-Änderung entfernen; heute nicht, weil jede Byteänderung den gepinnten Fingerabdruck `89fbcf86…` verschiebt |
| LOW | Die Zähler `sameBarCertainByOpenFill` und `sameBarCertainByClose` erfassen Stops und Kanalausstiege gemeinsam. Kanalausstiege stehen zusätzlich in `sameBarEntryChannelExits`, ein Ereignis erscheint also in zwei Zählern. | bei der Auswertung beachten, Zähler mit der nächsten Engine-Änderung trennen |
| LOW | Der Turtle-Fingerabdruck (`codeSha256`) deckt alle Dateien von `CODE_FILES` ab, darunter Darvas, Kennzahlen, Snapshot-Eingang und Validierung. Seit 1.1.0 prüft `sf-sf6-readiness` den Pin gegen den laufenden Code. Jede spätere Änderung an diesen Dateien, auch eine reine Darvas-Änderung, verlangt deshalb SF6-PAPER-2027 1.2.0. | so gewollt (Protokollregel: gepinnter Code ist unverändert oder eine neue Protokollversion); hier ausdrücklich festgehalten |
| INFO | Der Lauf-Beleg von 40170829944 enthält neu die Szenario-Felder `status` und `supersededBy`. Er ist darum nicht bytegleich mit dem Beleg von 39397517900. Verglichen werden die öffentlichen Szenario-Blöcke. | erwartet |

## 9. Unabhängiges Review (25.10.2026)

Ergebnis: kein CRITICAL- und kein HIGH-Befund. Die Referenzen sind **durch die Konstruktion** geschützt, nicht nur durch einen Snapshot: Der neue Code läuft nur hinter der neuen Lesart bzw. dem neuen Flag, und die SF7-Varianten laufen nach allen registrierten Varianten.

Das MEDIUM-Ergebnis betraf Testlücken. Es ist mit zwei neuen Tests behoben:
- **`SF7-D3-TURTLE-SHORT-AND-TIE`:**
  - Die Short-Seite des S1-Filters mit Eröffnungs-Fill ist sicher.
  - Ein Schluss genau auf dem Level zählt als sicher, einen Tick darüber bleibt er mehrdeutig.
  - Die Short-Seite mit Schlussregel lässt sich auf einem Tagesbalken nicht isoliert bauen. Jedes Hoch über dem Short-Stop liegt dort auch über dem Long-Kanal, beide Richtungen wären gleichzeitig ausgelöst.
- **`SF7-D3-TURTLE-ALL-OPTIONS`:**
  - PESSIMISTIC und OPTIMISTIC wurden über alle Optionen von `SCENARIO_SET` und Korrelationsgruppen gerechnet: Kosten, Delisting-Szenarien, Daten-Ereignis, Failsafe 20D, `openBreakout=TAKE`, Gruppen mit 265 Limit-Ablehnungen.
  - Das sind 32 Läufe, und sie sind bitgleich mit dem Code vor der Behebung. Gegengeprüft wurde mit `git archive 8e66e392`.

Die LOW-Befunde stehen in Abschnitt 8.
