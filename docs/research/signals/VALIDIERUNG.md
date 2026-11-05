# E4 / S1 – Prüfstand

Forschung, nicht zertifiziert. Laufumgebung: Node v24.22.1 (Repository-Ziel laut CLAUDE.md: Node 22); Python 3. Die Auswertung ändert keine Produktdateien oder Engines.

## Grüne E4-Prüfungen

- `node --test scripts/research/signals/study.test.mjs`: 7/7 bestanden. Kosten, nächste Open-Ausführung, Gaps, doppelte Berührung, volles 60-Tage-Fenster, kanonische Split-Skalierung, Zukunftsabschneidung, Holm-Nenner und unveränderliches Protokoll.
- `node scripts/quality/check-test-isolation.mjs --suite 'scripts/research/signals/study.test.mjs'`: keine Produktionsdatei verändert.
- `node scripts/research/signals/verify.mjs --results docs/research/signals/results --out docs/research/signals/results/verification.json`: 383 Trades, 12.910 Quelldateien und sämtliche Engine-Hashes verifiziert. Einstieg/Exit, Kosten/R, Haltevergleich, SPY-Proxy, täglicher SMA200, Ausschlussbilanz, Überschneidungen und Aggregationen geprüft. Zusätzlich 15 Signalrekonstruktionen (erste Ausführung je Aktie/Familie) aus dem damaligen Präfix, Stopp und Ziel mit dem Ledger abgeglichen.
- Syntaxprüfung aller drei CLI-Dateien und `git diff --check`: bestanden.
- Protokoll-Hash identisch mit dem separat vor dem ersten Lauf angelegten Commit `10b0021c`. Keine Abweichung oder Parameteranpassung nach Ergebnissichtung. Kein zweiter Variantenlauf.

## Breite Repository-Gates aus CLAUDE.md

Diese Gates wurden ebenfalls gestartet. Sie sind **nicht grün**. Erster Versuch im sehr kleinen Sparse-Checkout fehlte an vielen Importen; anschließend die Code-/Testbereiche und benötigte zentrale Datenbereiche nachgeladen und erneut ausgeführt. Der Checkout enthält weiterhin nicht sämtliche Produkt-/Doku-/Fundamentaldateien des großen Repositories. Die Fehler sind daher keine saubere Aussage über den vollständigen main-CI-Stand. Sie werden nicht als E4-Erfolg ausgegeben und nicht außerhalb der erlaubten Pfade repariert.

| Gate | Lokales Ergebnis |
| --- | --- |
| Core `core/tests/*.test.mjs` | 305 Tests: 278 bestanden, 26 fehlgeschlagen, 1 übersprungen |
| Technical `technical/tests/*.test.mjs` | 112 Tests: 101 bestanden, 7 fehlgeschlagen, 4 übersprungen |
| Python `scripts/quant/tests/test_*.py` | 590 Tests: 5 Fehlschläge, 1 Fehler, 21 übersprungen |
| Konten / Workers / Dashboard | 116 Tests: 109 bestanden, 4 fehlgeschlagen, 3 übersprungen |
| Quant `quant/tests/*.test.mjs` | Lauf beim Anlegen dieses Prüfstands noch aktiv; bereits Fehler außerhalb E4 |
| Discover / Supertrader / Screener | Lauf beim Anlegen dieses Prüfstands noch aktiv; bereits Fehler außerhalb E4 |

Beispiele: Kontentests finden `assets/site-navigation.js`, `supabase/seed.sql` und `landing/server/newsletter.mjs` im Sparse-Checkout nicht. Technical findet Academy-/Dokumentationsdateien nicht. Die Python-Gates melden zusätzlich Datenstandsabweichungen (166 statt 167 ausgeschlossene Titel; 6570 statt 6683 verfügbare Charts) und fehlende Fundamental-Artefakte. Quant/Discover melden fehlende importierte oder referenzierte Produktartefakte und Datenverträge. Keine dieser Dateien wird im PR verändert.

SQL-/Flow-Prüfungen sind laut CLAUDE.md an `PG_TEST_URL` gebunden; kein konfigurierter Datenbanklauf wurde behauptet. Keine neuen Workflows, kein Datenanbieterabruf, keine Änderung an fachlichen Regeln. Der PR wird nicht als produktionsreifer Signaldienst oder als zertifizierter Backtest behandelt.
