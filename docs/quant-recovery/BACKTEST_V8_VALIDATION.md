# V8 – Validierung

Die vollständige Remote-Quant-Suite des aktuellen Heads besteht mit **3.142/3.142**, ohne Fehler, Skip oder TODO; auch die abgeschlossenen lokalen Prüfumfänge bestehen. Die aktuelle strenge Datenqualität ist **WARN**, mit null ERROR-Regeln und zwei offenen Warnregeln. Der vollständige lokale Lauf und der spätere Main-Abgleich bleiben als getrennte versionierte Umfänge ausgewiesen; Produktzertifizierung und Produktionsfreigabe sind nicht erteilt. [Maschinenlesbarer Abschluss](v8/validation.json).

## Technischer Bezug

Der vollständige lokale Engineering-Nachweis bindet die Quellen des abschließenden Scopes `0ce7551d4bdbd2ecdffe343382b1b3554abe0f31`; der Lauf startete auf Main `f10afd9666136810f0c9081db6ff4324d04065fe`. Die spätere Integration von Main `1dfccf81d579da5f1da603e895b9dbe0ea5d4bd6` ergibt `8a56478b1eda02bef146159a98548c67f86964f1`. In den verglichenen Quant-/Core-/Research-/SEC-Codepfaden änderten sich dabei ausschließlich zwei Testdateien: `product-services.test.mjs` und `backtest-artifact-consistency.test.mjs`. Engines, APIs und Research-/SEC-Code blieben gleich. Aktualisierte Main-Daten werden als eigener Prüfstand behandelt.

Die [Baseline](v8/validation-baseline.json), der [Gesamtbericht](v8/validation.json) und die [Isolationsumfänge](v8/isolation.json) binden Datei-Hashes und Runtime. Nach Start des früheren Gesamtlaufs änderten sich ausschließlich drei benannte CA-Diagnose-/Verifier-/Testdateien. Der vollständige Quant-Log enthält die finale Rundungsregression; zusätzlich bestehen fünf CA-Tests, drei Core-Identitätsprüfungen und eine erneute CA-Einzeldatei-Isolation. Nach dem Main-Merge wurden 7.002 erfasste Startpfade gegen die Git-Objekte des abgeschlossenen `0ce`-Scopes geprüft; nur diese drei erwarteten CA-Änderungen wichen ab. Der inzwischen geänderte Arbeitsbaum wird nicht als unveränderter alter Datenstand ausgegeben. Die historische `baseMain`-Konstante des wiederverwendeten V6-Runners ist keine V8-Basisangabe.

Node **22.23.4**, V8 `12.4.254.21-node.57`, Linux x64, glibc 2.41; Node-Binär-SHA256 `94efd062ed066c1a0b332e18249859c905e920eeada5df55d24c99b919629a90`. Auch ausdrücklich gestartete `node`-Unterprozesse verwenden diese Runtime.

## Vollständiger Remote-Lauf auf aktuellem Main

Die [Quant-CI 40500806688](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40500806688) besteht für den exakten Head `8a56478b1eda02bef146159a98548c67f86964f1` auf Main `1dfccf81d579da5f1da603e895b9dbe0ea5d4bd6`: **3.142 Tests, 3.142 bestanden, null Fehler / Skip / TODO**, Job `122177712468`. Derselbe Job besteht SEC/PIT 32/32 und Consumer 66/66. Dieser unveränderte Remote-Prüfstand ist der maßgebliche vollständige Quant-Nachweis für die aktuellen Main-Daten. Die [Core-CI 40500806716](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40500806716) ist ebenfalls SUCCESS. Die separate [SEC-CI 40500806751](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40500806751) ist ebenfalls SUCCESS. Der [Remote-Beleg](v8/remote-ci.json) bindet diese Ergebnisse an denselben Head; andere noch laufende Workflows werden separat ausgewiesen und nicht als bestanden gezählt.

## Vollständiger lokaler Engineering-Lauf

| Prüfung | Bestanden | Fehler / Skip / TODO |
| --- | ---: | --- |
| Quant vollständig | 3.141/3.141 | 0 / 0 / 0 |
| Core | 239/239 | 0 / 0 / 0 |
| SEC Python | 566/566 | 0 / 0 / 0 |
| SEC/PIT Python | 32/32 | 0 / 0 / 0 |
| Consumer | 66/66 | 0 / 0 / 0 |

Der [historische vollständige Abschluss](v8/validation-f10-checkpoint.json) umfasst alle **288** damaligen Quant-Testdateien. Der vollständige Quant-Lauf startete mit f10-Daten; der Main-Checkout aktualisierte Datenpfade um 12:01:37–38 UTC, der Testlauf endete um 12:02:54 UTC. Er besteht tatsächlich mit 3.141/3.141, ist aber kein unveränderlicher reiner f10-Datenlauf. Welche späten Technical-Prüfungen bereits neue Main-Daten lasen, wurde nicht pro Dateizugriff aufgezeichnet. Die beiden geänderten Testdateien waren vor dem Checkout ausgeführt; der aktuelle Zwei-Dateien-Abgleich wird separat geprüft. Die bereits vor dem Checkout abgeschlossene [vollständige Isolation](v8/isolation-f10-checkpoint.json) deckt dieselben 288 eindeutigen Dateien ab: 119 Dateien aus abgeschlossenen, bytegleichen a–o-Checkpoints und 169 Dateien aus neu ausgeführten p–z-Partitionen; die geänderte CA-Datei wird durch die finale Einzeldatei-Isolation ersetzt. Bestehende Vorher-/Nachher-Prüfungen und die **900-Sekunden-Grenze** je Kindprozess bleiben unverändert. Alle Kindprozesse liefern Exit 0; geschützte Produktionsdaten wurden nicht verändert.

Der abschließende Manifestguard des ursprünglichen Wrappers meldete die zwischenzeitlich geänderte CA-Testdatei korrekt mit Exit 1. Dieser Abbruch bleibt mit Loghash erhalten. Die finale zusammengesetzte Prüfung besteht erst nach Hashabgleich aller übrigen Dateien und der nachgewiesenen finalen CA-Einzeldatei-Isolation. Die aktuelle Main-Datenbasis wird damit nicht als vollständig und durchgehend unverändert lokal ausgeführt bezeichnet.

## Abgleich nach dem letzten Main-Merge

| Prüfung auf 8a / Main 1df | Ergebnis |
| --- | --- |
| Beide geänderten Testdateien | 51/51, kein Fehler / Skip / TODO |
| Core vollständig | 239/239, kein Fehler / Skip / TODO |
| Produktionsdaten-Isolation beider Dateien | PASS, null Änderungen, unveränderte 900-Sekunden-Grenze |
| JSON-Syntax | 32.354 Dateien, PASS |
| Public-Data- und Zugangsdatenprüfung | beide PASS |
| Strenge Datenqualität | WARN, Exit 0, null ERROR / zwei WARN |

Die [ergänzende Isolation](v8/isolation-final-main-delta.json) und der Gesamtbericht binden diese Ergebnisse an den finalen Merge-Stand. Wiederholte Teilprüfungen werden nicht auf die 3.141 historischen Vollsuitentests aufgeschlagen. Die inzwischen erfolgreich abgeschlossene vollständige Remote-Quant-Suite ist oben separat gebunden. Auch die separate Remote-SEC-Prüfung ist erfolgreich abgeschlossen.

Die ältere Main-Gesamtsuite mit **3.135/3.136, ein Fehler** bleibt erhalten: Die Raw-Grant-Positivkontrolle erwartete NVDA in einer positiven Momentumselektion, obwohl die damaligen Main-Daten NVDA negatives Momentum gaben. Die reparierte Kontrolle vergleicht dieselbe Query und Seite unter beiden Grants, fordert übereinstimmende Titel und mindestens einen sichtbaren endlichen Rohkurs beim Raw-Grant. Die Preisunterdrückung und die Verweigerung von Preisfiltern/-sortierung bei Derived-only bleiben geprüft. Beim späteren Merge bleiben auch die zusätzlichen upstream Filter- und Leerkontrollen erhalten. Die ursprüngliche gezielte Reparaturprüfung bestand 46/46; der aktuelle Zwei-Dateien-Abgleich besteht 51/51.

Der historische Quant-Lauf mit **3.111/3.111** und seine Isolation über **282** frühere Dateien bleiben separate Checkpoints. Die ursprüngliche Core-Gegenprobe mit **238/239** bleibt als Fehler dokumentiert: Die Archivdiagnose konstruierte selbst eine `securityId`. Sie verwendet jetzt `core/identity.js#securityIdForTicker`; die Architekturprüfung wurde nicht ausgenommen. Der aktuelle Core-Gesamtlauf besteht 239/239.

## Nachgewiesene Regressionen und Reparaturen

[Maschinenlesbarer Prüfpfad](v8/classification-regression-validation.json): Die erste gezielte Gegenprobe ergab 45 bestandene und 15 fehlgeschlagene Prüfungen, weil die bestehende temporäre Quellfixture die neue Registrierungsdatei nicht kopierte. Nach Ergänzung der Quelle blieben vier echte Leserfehler: Die bestehende strenge Codepfadprüfung erlaubte keine JSON-Konfiguration im Codeabhängigkeitsfeld. Die versionierten Datensätze wurden deshalb als literales CJS-Datenmodul in den vorhandenen Enginepfad überführt. Die Pfadprüfung wurde nicht erweitert.

Eine zusätzliche unabhängige Gegenprobe erzeugte privat eine alte FRMEP-Generation vor der Quellenkorrektur und stellte danach den belegten Klassifikations-HOLD wieder her. Der Leser lieferte zunächst tatsächlich alte Finanzresultate mit `STALE_INPUT_SNAPSHOT`. Die reparierte Identitätsinvalidierung liefert nun `UNAVAILABLE`, `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` und keinen Ergebnis-Payload. Ein weiterer Negativtest entzieht den Evidenzkontext während des asynchronen Lesens. Die abschließende gezielte Suite besteht **62/62** Prüfungen ohne Fehler, Skip oder TODO. Keine bestehende Assertion oder fachliche Schwelle wurde abgeschwächt.

## Unabhängige Rechenbelege

- [Studienreferenz](v8/reference-studies.json): 526 unabhängige Python-Vergleiche für alle fünf Signalregeln und weitere Studienmechaniken; 25 Fixture-Signalereignisse. Dies ist synthetische Rechenprüfung, keine historische Populationsevidenz.
- [Portfolio-Referenz](v8/reference-portfolio.json): vier unabhängige Python-Decimal-Fälle einschließlich finanzierter Käufe, gleichzeitiger Umschichtung, Split/Dividende/terminalem Ereignis und explizit belegtem Nullterminalwert. Diese Fixtures ersetzen keine reale vollständige CA-/TR-Historie.
- Reale V8-Walk-Forward-, Regime-, SEC-Ereignis- und Sensitivitätsgegenrechnungen sind in [Realstudien](BACKTEST_V8_REAL_STUDIES.md) und den dort gebundenen Python-Artefakten ausgewiesen. Rechenparität und exakte Reproduktion begründen keine unberührte Prognosebestätigung.

Die aktuelle reine JSON-Syntaxprüfung verarbeitet die **32.354** Dateien unter `quant/methodology`, `quant/data` und `quant/config` einzeln; jeweils nur eine geparste Datei liegt gleichzeitig im Speicher. Die vorhandenen Prüfungen gegen Zugangsdaten und öffentliche kommerzielle Rohdaten bestehen auch auf dem letzten Main-Stand.

## Datenqualität und Ressourcen

Die [strenge Datenqualitätsprüfung auf aktuellem Main](v8/data-quality-final-main.json) endet mit **WARN / Exit 0**: Tages-/Wochenreihen stimmen für 6.188 Vergleiche überein; Technical-/Tagesreihen für 5.655 Vergleiche. Zwei Warnregeln bleiben offen: 93 von 6.679 Reihen mit Rückstand und 302 von 6.679 mit Sprüngen über 60 %. Keine Warnregel wurde ausgenommen oder abgeschwächt.

Die [frühere Prüfung auf f10](v8/data-quality-latest-main.json) bleibt tatsächlich **FAIL / Exit 2**: 14 Tages-/Wochenabweichungen und 13 Technical-/Tagesabweichungen wurden damals gemessen. Die spätere kanonische Aktualisierung der 14 Wochenfälle stammt aus upstream Main, Commit `6aa8f9757003397bd6524b79c9bd0bfdd9ff056c`; sie wird nicht als V8-Datenreparatur gezählt. Die aktuellen Daten- und Core-Prüfpfade sind bytegleich mit integriertem Main `1dfccf81d579da5f1da603e895b9dbe0ea5d4bd6`. **V8 hat null kanonische Datenreparaturen ausgeführt.**

Der [eingeschränkte 616-Vergleiche-Nachweis](v8/study-cohort-data-quality.json) der elf Studienlistings gehört zum vorherigen f10-Scope und ersetzt keine marktweite Datenqualitätsprüfung. Private Quellen- und Vintagenachweise stehen in [Datenerschließung](BACKTEST_V8_DATA_RECOVERY.md); sie ändern keine historische Fehlerzählung und qualifizieren keine neue Listingidentität.

Die Laufzeit hat zwei CPU-Kerne und 8 GiB Cgroup-Speicher. Der vollständige Quant-Lauf benötigt rund 774 Sekunden; die damalige fortgesetzte Isolation 376 Sekunden. Die aktuelle strenge Datenqualitätsprüfung benötigt rund 72 Sekunden. Der größte beobachtete Kindprozess-RSS aller dokumentierten Abschlussläufe beträgt **2,78 GiB**. Der [Ressourcenbeleg](v8/resources.json) enthält einzelne Laufzeiten, CPU-Zeiten, RSS-Werte und die Cgroup-Zähler. Der sitzungsweite Cgroup-Peak erreicht 8 GiB, der Speicherlimit-Zähler steht abschließend auf 33525; OOM und OOM-Kill bleiben jeweils null. Kindprozess-RSS, gleichzeitig belegter Cgroup-Speicher und sitzungsweiter Peak werden nicht gleichgesetzt.

Unvollständige und fehlgeschlagene frühere Läufe bleiben mit eigener Provenienz erhalten. Keine Testdeaktivierung, keine Ausweitung von Pflichtschwellen, keine Produktionsaktivierung.

Die zusätzlichen R2-Quellenfälle sind in [r2-ca-accounting.json](v8/r2-ca-accounting.json) gesondert gezählt: 14 bestätigte Vintageabgleiche, elf private Ledgerfälle und vier abgeschlossene Trades. Der anfängliche Decimal-/Publishermodellunterschied bleibt als erster Prüfstand erhalten; die finale unabhängige Python-Referenz vergleicht die Publisherwerte exakt und führt die Decimal-Diagnostik separat. Dies ist keine zusätzliche Produkt- oder Prognosezertifizierung.

## Spätere parallele Main-Merges

Nach Abschluss der wissenschaftlichen Generation wurde Main `2f8d11beb689622b1bd0f61dde59ed3a67858bbe` beobachtet. [Git-Objektvergleich](v8/post-freeze-main-review.json): 57 bestehende gebundene beziehungsweise statisch geladene Research-Pfade sind gegenüber dem integrierten `1df…` unverändert; fünf neue V8-Pfade gehören keinem der beiden Main-Bäume an. Dieser Vergleich ist keine behauptete erneute vollständige lokale Ausführung der späteren Technical-Bibliothek. Die PR-Kompatibilitäts-CI läuft unabhängig auf ihrem synthetischen Merge. Die oben genannten exakten Zähler und Datenqualitätsbelege behalten ihre ausdrücklich ausgewiesenen Versionsstände.
