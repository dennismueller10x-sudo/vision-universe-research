# Validierung der E3-Vorbereitung

Ausgeführt am 05.11.2026 im flachen Teilcheckout von main `dfa38ce2794b03267ef0c21b671e6ff50bffbf72`, Node v24.22.1 (Projektvorgabe Node 22). Kein Strategieergebnis und kein Zertifizierungsnachweis.

| Prüfung | Ergebnis |
|---|---|
| `node --test scripts/research/edge/study.test.cjs` | 7 bestanden, 0 fehlgeschlagen |
| Syntaxprüfung beider CJS-Module | bestanden |
| `preflight.cjs --out docs/research/edge` | erwarteter Exit 2, BLOCKED, 0 Strategieläufe |
| Vollständigkeit JSON | 96 eindeutige Varianten, alle Kennzahlen null, kein erfundenes Urteil |
| Protokoll seit Registrierungscommit | unverändert, SHA-256 stimmt mit gepinntem Fingerabdruck überein |
| `git diff --check` | bestanden |

Die sieben gezielten Tests prüfen Varianten- und Hypothesenumfang, Konzentrations-Konsistenz, Protokoll-Hash, Holm mit blockierten Tests, Drawdown einschließlich Startkapital, gepaarten Block-Bootstrap (Nullfall, Richtung und Reproduzierbarkeit), undefinierten Cash-Sharpe, fehlende p-Werte und alle Urteilszweige sowie vollständige blockierte Berichtstabellen. Das sind Softwaretests mit synthetischen Daten; sie belegen keine Kosten- oder Strategie-Parität. Entsprechende Adapter sind noch offen.

Alle Testgruppen aus CLAUDE.md wurden zusätzlich gestartet, mit 180 Sekunden Zeitlimit je Gruppe. Der Teilcheckout enthält nicht sämtliche Produktmodule, Workflows und Daten. Die Fehler dürfen weder als bestandene CI noch ohne weiteren Nachweis vollständig als bestehende Hauptzweigfehler interpretiert werden.

| Pflichtgruppe | Beobachtung |
|---|---|
| core/tests | 176 bestanden, 63 fehlgeschlagen, 2 übersprungen; u. a. fehlende analysten/index.html, discover/data/search/GLOBAL.json und Provider-Modul |
| quant/tests | nach 180 s abgebrochen, kein vollständiges Ergebnis |
| discover + scripts/supertrader + screener | 1097 bestanden, 138 fehlgeschlagen, 21 übersprungen; u. a. fehlende Discover-Engines und supertrader/data |
| technical/tests | 7 bestanden, 16 fehlgeschlagen; u. a. fehlende technical/academy/content.json |
| Python scripts/quant/tests | 416 Tests, 4 Fehlschläge, 163 Fehler, 24 übersprungen; u. a. fehlende quant/config/sec-metric-registry.json und generierte Artefakte |
| check-test-isolation | nach 180 s abgebrochen; startet selbst weitere Tests, kein vollständiges Ergebnis |
| Konten/Abos | 84 bestanden, 12 fehlgeschlagen, 3 übersprungen; u. a. fehlende landing/server/newsletter.mjs |

PG_TEST_URL ist nicht eingerichtet; die optionalen PostgreSQL-/Flow-Prüfungen wurden nicht ausgeführt. Keine Produkt- oder Workflowdateien zur Behebung dieser Umgebungsfehler geändert. Der PR bleibt Entwurf, sowohl wegen der offenen empirischen Arbeit als auch wegen der unvollständigen Gesamtvalidierung.
