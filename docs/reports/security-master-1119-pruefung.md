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

## Prüfung der 32 Fälle mit SEC-Ticker desselben Emittenten (11.11.2026)

Regel der Steuerung: Dass der Emittent weiter bei der SEC meldet, ist kein Gegenbeleg (Vorzugsaktien und Notes werden oft einzeln getilgt). Gegenbeleg ist nur ein sich bewegender Kurs nach dem Wirksamkeitsdatum oder ein ausdrücklicher Listing-Nachweis für genau diese Wertpapierklasse. Ein sich bewegender Kurs hätte den Fall schon im Register ausgeschlossen (`SERIES_MOVED_AFTER_EFFECTIVE_DATE`, 9 Fälle). Ein klassengenauer Listing-Nachweis liegt für keinen der 30 Fälle unten vor. TRINL und FITBI (die übrigen zwei der 32) sind über das Gegenbeleg-Register ausgeschlossen.

Ergebnis: **kein weiterer Eintrag im Gegenbeleg-Register.** Grenzfall ACVA: Die SEC führt das Symbol noch, der Beleg ist ein 8-K 2.01+3.01 mit Vollzug am 19.10.2026; der Symbolstand der SEC hinkt dem Vollzug nach, die Reihe ist konstant. Er bleibt im Register.

| Ticker | Emittent | Beleg | wirksam | Reihe konstant seit | SEC-Ticker beim Abruf |
|---|---|---|---|---|---|
| AACT | Kodiak AI, Inc. | 8-K_2.01+3.01 | 2025-09-30 | 2025-09-24 | KDK, KDKRW |
| ACVA | ACV Auctions Inc. | 8-K_2.01+3.01 | 2026-10-19 | 2026-10-14 | ACVA |
| APAD | Enhanced Group Inc. | 8-K_2.01+3.01 | 2026-05-08 | 2026-05-07 | ENHA |
| ARBKL | Argo Blockchain Plc | 25-NSE | 2025-12-22 | 2025-12-12 | ARBK |
| BHAT | Blue Hat Interactive Enterta | 25-NSE | 2026-07-24 | 2026-03-13 | BHATF |
| BWNB | Babcock & Wilcox Enterprises | 25-NSE | 2026-08-23 | 2026-08-12 | BW, BW-PA |
| CASI | CASI Pharmaceuticals, Inc. | 25-NSE | 2026-07-03 | 2026-02-25 | CASIF |
| CCCX | Infleqtion, Inc. | 25 | 2026-02-23 | 2026-02-13 | INFQ, INFQ-WT |
| CGBDL | Carlyle Secured Lending, Inc | 25-NSE | 2025-12-08 | 2025-11-24 | CGBD |
| CSCI | COSCIENS Biopharma Inc. | 25 | 2025-09-05 | 2025-09-03 | CSCIF |
| EBR-B | AXIA Energia S.A. | 25-NSE | 2026-01-08 | 2025-11-07 | AXIAY, AXICY |
| EPWK | EPWK Holdings Ltd. | 25-NSE | 2026-06-12 | 2025-12-22 | EPWKF |
| FOSLL | Fossil Group, Inc. | 25-NSE | 2025-11-23 | 2025-11-13 | FOSL |
| FTRK | Fast Track Group | 25-NSE | 2026-10-19 | 2026-08-17 | FTRKF |
| GAINL | GLADSTONE INVESTMENT CORPORA | 25-NSE | 2025-12-25 | 2025-12-15 | GAIN, GAING, GAINI, GAINZ |
| GLADZ | GLADSTONE CAPITAL CORP | 25-NSE | 2025-10-24 | 2025-10-09 | GLAD |
| HNNAZ | HENNESSY ADVISORS INC | 25-NSE | 2026-07-09 | 2026-06-29 | HNNA |
| METCL | Ramaco Resources, Inc. | 25-NSE | 2025-08-11 | 2025-08-01 | METC, METCB, METCI, METCZ |
| MGIC | MAGIC SOFTWARE ENTERPRISES L | 25-NSE | 2026-03-06 | 2026-02-23 | RMTHF |
| OXSQZ | Oxford Square Capital Corp. | 25-NSE | 2025-09-28 | 2025-09-16 | OXSQ, OXSQG, OXSQH |
| REE | REE Automotive Ltd. | 25-NSE | 2026-07-23 | 2026-07-15 | REEAF |
| RILYK | BRC Group Holdings, Inc. | 25-NSE | 2026-04-09 | 2026-03-27 | RILY, RILYG, RILYL, RILYP… |
| RWAYZ | Runway Growth Finance Corp. | 25-NSE | 2026-03-14 | 2026-03-04 | RWAY, RWAYI, RWAYL, RWAYM |
| RZB | REINSURANCE GROUP OF AMERICA | 25-NSE | 2026-06-25 | 2026-06-12 | RGA, RZC |
| SAT | SARATOGA INVESTMENT CORP. | 25-NSE | 2026-09-28 | 2026-09-14 | SAR, SAJ, SAV, SAX… |
| SCCC | Sachem Capital Corp. | 25-NSE | 2025-10-10 | 2025-09-29 | SACH, SACH-PA, SCCD, SCCE… |
| SELX | Semilux International Ltd. | 25-NSE | 2026-10-18 | 2026-06-05 | SELXF |
| SNBR | Sleep Number Corp | 25-NSE | 2026-07-24 | 2026-06-22 | SNBRQ |
| SVAC | General Fusion Group Ltd. | 25-NSE | 2026-07-20 | 2026-07-10 | GFUZ, GFUZW |
| XTKG | X3 Holdings Co., Ltd. | 25-NSE | 2026-07-24 | 2026-04-01 | XTKGF |
