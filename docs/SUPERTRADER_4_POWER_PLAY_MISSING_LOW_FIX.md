# Supertrader 4.0 – Power Play: fehlendes Korrekturtief (Fachmodell-Fix)

Stand: 22. Oktober 2026. Owner-Freigabe: Punkt 7 der Entscheidungsvorlage zu #842 (eigener Fachmodell-PR nach #842).
Basis: `main` @ `3d3e757dd` (Merge von #842). Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Abrechnung `research-v1`, `DIAGNOSTIC_NOT_CERTIFIED`.

## Fehler

`methods/minervini.mjs#powerPlayScreen` (sf-minervini-1.0.0) misst die Korrektur der Konsolidierung als `1 − tiefstes Tief seit dem Peak / Peak-Hoch`.
- Fehlt ein Tief (`NaN`), wird das tiefste Tief `NaN` und damit auch die Korrektur.
- `NaN > 25 %` ist falsch, also galt das Gate MIN-PP-04 als **bestanden**.
- Die Klassifikation prüft fehlende Balken nur in den letzten 80 Sitzungen. Ein fehlendes Tief, das älter ist, aber noch in der Konsolidierung liegt, rutschte deshalb durch.
- Ergebnis: Je nach Fall `MANUAL_REVIEW_SETUP` oder `DATA_BLOCKED_SETUP` mit `NaN`-Stop statt einer ehrlichen Datensperre.

## Fix

| Datei | Änderung |
|---|---|
| `methods/minervini.mjs` (sf-minervini-1.0.1) | `powerPlayScreen`: Ist ein Tief der Konsolidierung nicht endlich, ist die Korrektur nicht messbar. Das Gate gilt als nicht bestätigt, und es wird kein Kandidat ausgegeben (fail closed). Die Spitzensuche ist als `powerPlayPeak` herausgelöst; ihre Logik ist unverändert. |
| `research/minervini-components.mjs` (1.0.1) | `powerPlayClassify`: Solche Balken sind `DATA_BLOCKED_SETUP` mit dem Grund `MISSING_LOW_IN_CONSOLIDATION`, nicht `NOT_QUALIFIED`. |
| `research/minervini-lifecycle.mjs` | Exakter Vorfilter: Die Spitzen mit fehlendem späteren Tief bleiben aktiv und gehen durch die Klassifikation (Äquivalenztests unverändert grün). |
| `contracts/minervini.mjs` | C07 1.3.0: Herleitung von MIN-SF-PP-CORRECTION ergänzt, Test `GC-MIN-PP-MISSING-LOW`. **Regelstatus unverändert** (`SOURCE_DERIVED`). |
| `research/pp-missing-low-comparison.mjs` | Alte Fassung (sf-minervini-1.0.0 / components-1.0.0) **wörtlich** eingefroren, nur für den Vorher/Nachher-Nachweis. |

Unverändert:
- der SEPA-Screen;
- Turtle, Weinstein, Darvas und alle anderen Strategien;
- AG-3-Fingerabdruck `ae2a51ed86ae…`;
- Referenzannahmen und Varianten (Fingerabdruck `f13ea350…`);
- Kennzeichnungen `MODEL_LIFECYCLE_STUDY`, `NOT_A_TRADABLE_STRATEGY`, `performanceClaim: NONE`, `LIVE_NOT_APPROVED`.

## Nachweis vorher/nachher

**Synthetisch** (Tests `GC-MIN-PP-MISSING-LOW`, `GC-MIN-PP-MISSING-LOW-CLASS`, `SF4-PPFIX-DAILY-EQUALS-FULL`):

| Fall | vorher (1.0.0) | nachher (1.0.1) |
|---|---|---|
| +100 % Lauf, fehlendes Tief in der Konsolidierung, danach 35 % Korrektur, Balken außerhalb des 80-Sitzungen-Fensters | `MANUAL_REVIEW_SETUP`, Korrektur `NaN` | `DATA_BLOCKED_SETUP` (`MISSING_LOW_IN_CONSOLIDATION`) |
| Zufallsreihen mit Lücken | Übergänge nur nach `DATA_BLOCKED_SETUP` | gezielter Tagesvergleich = Vollberechnung beider Fassungen |
| Reihen ohne fehlende Tiefs | – | 0 Änderungen |

**Snapshot** (Lauf [39746264325](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39746264325), Commit `77964daa9`, Research-Code `b1d81fb8…`, Datensatz `EXACT`):

| Messung | Balken | geändert |
|---|---|---|
| täglich ab Fensterbeginn (beide Fassungen dort, wo ein Peak mit fehlendem späteren Tief aktiv ist) | 13.378.246 | **0** (keine einzige betroffene Stelle) |
| Monatsenden, beide Fassungen vollständig (Stichprobe der sf3-Screen-Statistik) | 639.582 | **0** |
| Power-Play-Setupklassen täglich | wie vorher: `CONFIRMED_MECHANICAL` 25.939, `MANUAL_REVIEW` 154.844, `DATA_BLOCKED` 187.877 | **0** |
| Lifecycle, alle 21 Varianten | Trades und Ledger-Hash **bytegleich** mit Lauf 39729913772 | **0** |

**Befund:**
- Im eingefrorenen Snapshot tritt der Fehler nicht auf. Die Segmente werden an Datenlücken getrennt (`#n`), sodass hinter keinem Run-up-Peak ein Tief fehlt.
- Der Fix ist eine Absicherung gegen künftige Daten mit fehlenden Tiefs; die synthetischen Tests belegen seine Wirkung.
- Die veröffentlichten Zählungen von Supertrader 3.0 (1.469 bestätigte Setups an Monatsenden) und von 4.0 bleiben gültig.

## Tests

| Prüfung | Ergebnis |
|---|---|
| `node --test "scripts/supertrader/tests/*.test.mjs"` | 559 Tests: 558 bestanden, 1 bestehender Skip |
| `rebuild-all` | 116/116 Golden Cases, 242 SF-Tests ohne Fehler; Artefakte = frischer Build |
| `core/tests` | 212/212 |
| Test-Isolation | bestanden |
| `SF4-SNAPSHOT-RUN-CURRENT-CODE` | maßgeblicher Lauf 39746264325 = aktueller Code; Lauf 39729913772 als `PRE_FIX_REFERENCE` |

Kein Merge ohne Owner-Freigabe.
