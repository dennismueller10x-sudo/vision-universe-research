# Security Master: Nachbesserung der SEC-Delisting-Regel (Befunde zu #1119)

Stand 11.11.2026. Regelwerk: CLAUDE.md, `docs/quant/QUANT_FINAL_HANDOVER.md` (B2, B3).

## Befunde der Prüfung vom 09.11. an den Quelldaten

Quelle `docs/quant-recovery/v10/population/lifecycle-cases.json`, SHA-256 `b42530d65fd8ab83f0cfbdfc47476304e9af9b54167fa916701bc2bad3d225ff`.

| Titel | Befund | Beleg in den Quelldaten | Folge |
|---|---|---|---|
| QRTEB | Emittentenbeleg statt Klassenbeleg | Form 25-NSE und 15-12G des Emittenten (CIK 1355096), keine Klasse B | Gegenbeleg `CLASS_MISMATCH`, kein Registersatz |
| TRINL | falscher Beleg für die Aktiengattung | Form 25 des Emittenten betrifft die Notes; SEC führt TRIN, TRNI, TRNZ weiter | Gegenbeleg `CLASS_MISMATCH` |
| FITBI | Börsenwechsel nicht erfasst | Form 25 vom 11.06.2026; SEC führt FITB-PI weiter | Gegenbeleg `EXCHANGE_TRANSFER` |
| SHLT | Kurse nach dem Delisting | Form 25 vom 21.03.2025 (wirksam 31.03.2025), Schluss konstant 2,05 ab 02.04.2025 bis 26.10.2026 | echtes Delisting, bleibt INACTIVE; die Reihe ist Anbieter-Fortschreibung |

Alle vier Befunde trafen zu. Beim vierten liegt der Fehler nicht im Delisting, sondern darin, dass der Anbieter nach dem Delisting konstant fortschreibt. Diese Kurse blockieren das Delisting nicht, sie gelten ab dem Wirksamkeitstag nicht mehr.

## Regel

- Ein Registersatz braucht weiter einen abgeschlossenen Beleg (Form 25/25-NSE oder 8-K 2.01 und 3.01), eine bis heute eingefrorene Tagesreihe und eine identitätskonforme `securityId` (`core/identity.js`).
- Die 331 Fälle ohne abgeschlossenen Beleg bleiben draußen wie zuvor. Fehlender Beleg ist kein Gegenbeleg.
- **Neu:** Ein ausdrücklicher Gegenbeleg (Klassenfehler, Nachfolger, Börsen-/Symbolwechsel) in `quant/config/security-master-delisting-counter-evidence.json` nimmt den Titel aus dem Register. Er bleibt ACTIVE mit Befund `SEC_DELISTING_BLOCKED:COUNTER_EVIDENCE:<Art>`.
- Konstante fortgeschriebene Kurse nach dem Wirksamkeitstag blockieren nicht. Nur eine sich bewegende Reihe nach dem Wirksamkeitstag blockiert (`SERIES_MOVED_AFTER_EFFECTIVE_DATE`, 9 Fälle).

## Zählung (Erzeuger `build-security-master-delisting-evidence.mjs`, Version 1.1.0)

| | Register alt (#1119, 09.11. vor der Verschärfung) | Register neu |
|---|---:|---:|
| Fälle | 475 | 475 |
| Registersätze | 133 | 130 |
| durch Gegenbeleg ausgeschlossen | 0 | 3 (QRTEB, TRINL, FITBI) |
| ohne abgeschlossenen Beleg | 331 | 331 |
| bewegte Reihe nach Wirksamkeitstag | 9 | 9 |
| Quellenkonflikt | 2 | 2 |

Die 130 verbleibenden Sätze sind Byte für Byte die der alten Fassung. Die Verschärfung auf „jeder spätere Kurs sperrt“ aus dem Stand vom 09.11. ist zurückgenommen: Sie hätte alle 475 Fälle ausgeschlossen, weil der Anbieter in allen fortschreibt.

## Vorher/Nachher

- `main` führt den Stamm 1.1.0 ohne Register: alle Titel ACTIVE, auch SHLT.
- Beim nächsten Stammbau (Erzeuger `build-us-security-master.mjs`, nicht in diesem PR) werden die 130 Titel ab ihrem Wirksamkeitstag INACTIVE; die Liste je Titel steht in [security-master-1119-vergleich.json](security-master-1119-vergleich.json). QRTEB, TRINL, FITBI bleiben ACTIVE mit Befund.
- Dieser PR bringt keine Stamm- oder Universumsdaten. Die Wirkung auf das Produktuniversum entsteht erst durch den Eligibility-Lauf (`security-master-eligibility.yml`).
- Ein vollständiger Neubau mit der Tiingo-Eingabe vom 09.11. (ZIP, Baseline) ist in dieser Sitzung nicht reproduziert worden. Die Stammzahlen 43.362 → 43.231 aus dem Stand vom 09.11. gelten für die Verschärfung, nicht für diese Regel.

## Gleichartige Kandidaten (zur Entscheidung, nicht geändert)

32 der 133 alten Sätze haben beim Abruf noch SEC-Tickers desselben Emittenten, darunter Vorzugsaktien und Notes (z. B. GAINL, GLADZ, OXSQZ, CGBDL, METCL, RZB). Ohne ausdrücklichen Gegenbeleg bleiben sie im Register. Wer sie prüft, ergänzt Einträge im Gegenbeleg-Register.
