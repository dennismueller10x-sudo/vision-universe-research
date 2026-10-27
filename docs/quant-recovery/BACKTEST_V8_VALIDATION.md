# V8 – Validierung

Fachliche Abnahme und Produktzertifizierung bleiben getrennt. Dieser Bericht dokumentiert ausführbare Prüfungen; er ersetzt keinen aktiven Zertifizierungsvertrag.

## Technischer Bezug

Die abschließende Gesamtsuite und die vollständige Produktionsdaten-Isolation laufen gegen den eingefrorenen Engineering-Stand `8fea838ea9aec792ae7dcb3f546710a03a499d2f`, integriert mit Main `6397635a475ac245d623e3b6f762e9b8f5948dd2`. Maßgeblich sind zusätzlich die tatsächlichen Datei-Hashes und die Runtimebindung. Die historische `baseMain`-Konstante des wiederverwendeten V6-Validierungsrunners bezeichnet seine ursprüngliche Basis und wird nicht als V8-Basis ausgegeben.

Node **22.23.4**, V8 `12.4.254.21-node.57`, Linux x64, glibc 2.41; Node-Binär-SHA256 `94efd062ed066c1a0b332e18249859c905e920eeada5df55d24c99b919629a90`. `PATH` ist auch für alle ausdrücklich gestarteten `node`-Unterprozesse auf diese Runtime gesetzt.

## Abschließende Gesamtläufe

Die noch laufenden Gesamtläufe sind **nicht als bestanden gezählt**. Der Abschlussbericht wird erst nach tatsächlichem Ende der Quant-, Core-, SEC/PIT-, Consumer- und Isolationsprüfungen ergänzt. Die frische Isolationsprüfung umfasst die 282 bei Codefreeze vorhandenen Testdateien; die bestehende 900-Sekunden-Grenze je Kindprozess bleibt unverändert. Die danach ergänzte, separate SEC-Archivparserprüfung wird zusätzlich isoliert geprüft und getrennt nachgewiesen.

## Nachgewiesene Regressionen und Reparaturen

[Maschinenlesbarer Prüfpfad](v8/classification-regression-validation.json): Die erste gezielte Gegenprobe ergab 45 bestandene und 15 fehlgeschlagene Prüfungen, weil die bestehende temporäre Quellfixture die neue Registrierungsdatei nicht kopierte. Nach Ergänzung der Quelle blieben vier echte Leserfehler: Die bestehende strenge Codepfadprüfung erlaubte keine JSON-Konfiguration im Codeabhängigkeitsfeld. Die versionierten Datensätze wurden deshalb als literales CJS-Datenmodul in den vorhandenen Enginepfad überführt. Die Pfadprüfung wurde nicht erweitert.

Eine zusätzliche unabhängige Gegenprobe erzeugte privat eine alte FRMEP-Generation vor der Quellenkorrektur und stellte danach den belegten Klassifikations-HOLD wieder her. Der Leser lieferte zunächst tatsächlich alte Finanzresultate mit `STALE_INPUT_SNAPSHOT`. Die reparierte Identitätsinvalidierung liefert nun `UNAVAILABLE`, `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` und keinen Ergebnis-Payload. Ein weiterer Negativtest entzieht den Evidenzkontext während des asynchronen Lesens. Die abschließende gezielte Suite besteht **62/62** Prüfungen ohne Fehler, Skip oder TODO. Keine bestehende Assertion oder fachliche Schwelle wurde abgeschwächt.

## Unabhängige Rechenbelege

- [Studienreferenz](v8/reference-studies.json): 526 unabhängige Python-Vergleiche für alle fünf Signalregeln und weitere Studienmechaniken; 25 Fixture-Signalereignisse. Dies ist synthetische Rechenprüfung, keine historische Populationsevidenz.
- [Portfolio-Referenz](v8/reference-portfolio.json): vier unabhängige Python-Decimal-Fälle einschließlich finanzierter Käufe, gleichzeitiger Umschichtung, Split/Dividende/terminalem Ereignis und explizit belegtem Nullterminalwert. Diese Fixtures ersetzen keine reale vollständige CA-/TR-Historie.
- Reale V8-Walk-Forward-, Regime-, SEC-Ereignis- und Sensitivitätsgegenrechnungen sind in [Realstudien](BACKTEST_V8_REAL_STUDIES.md) und den dort gebundenen Python-Artefakten ausgewiesen. Rechenparität und exakte Reproduktion begründen keine unberührte Prognosebestätigung.

Zusätzlich bestehen die reine JSON-Syntaxprüfung aller **28.599** Dateien unter `quant/methodology`, `quant/data` und `quant/config` sowie die vorhandenen Prüfungen gegen Zugangsdaten und öffentliche Rohdaten. Die Syntaxprüfung hielt jeweils nur eine geparste Datei im Speicher und benötigte rund 6,5 Sekunden bei rund 186 MiB maximalem Kindprozess-RSS.

## Datenqualität und Ressourcen

Die [strenge Datenqualitätsprüfung auf integriertem Main](v8/data-quality-integrated.json) endet mit Exit 0 und **WARN**, nicht mit einer warnungsfreien Datenabnahme. Keine ERROR-Regel fällt; vier vorhandene WARN-Regeln bleiben offen: 93 von 6.679 Reihen mit Rückstand, 303 mit Sprüngen über 60 %, zwei von 43 leeren Technical-Feldern sowie sechs fehlende Preferred-Screenerzeilen ohne gezählten Ausschlussgrund. Diese Produktdaten werden durch V8 nicht umgeschrieben.

Die Laufzeit verfügt über zwei CPU-Kerne und 8 GiB Cgroup-Speicher. Die Datenqualitätsprüfung benötigt rund 80 Sekunden; der größte aufgezeichnete Kindprozess belegt rund 1,89 GiB. Ressourcen der Gesamtsuiten und die abschließenden Cgroup-OOM-Zähler werden mit den fertigen Gesamtläufen ergänzt. Größter Kindprozess-RSS und gleichzeitig belegter Cgroup-Speicher werden nicht gleichgesetzt.

Vor der finalen Codefixierung unterbrochene Läufe bleiben privat als unvollständig dokumentiert. Ihr Abbruch oder ein noch laufender Prozess wird nicht als PASS umgedeutet. Keine Testdeaktivierung, keine Ausweitung von Pflichtschwellen, keine Produktionsaktivierung.
