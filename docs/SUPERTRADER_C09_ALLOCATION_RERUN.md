# Supertrader C09: Studienläufe zur Zuteilung nach Füllminute (Freigabevorlage)

Stand 02.11.2026, PR #1262 (Kopf `d789e6dc4c`). Owner-Entscheidung vom 02.11.: Die Korrektur nach tatsächlicher Füllminute ist fachlich grundsätzlich der richtige Ansatz. Studienläufe mit Secrets, Vorher/Nachher-Vergleich und neue Pins sind vorzubereiten. Historische Nachweise werden nicht still geändert. Die finale fachliche Freigabe folgt nach Vorlage der Ergebnisse.

**Nachtrag 02.11.2026 (abends):** Der Owner hat L1 und L2 freigegeben. Beide Läufe sind gelaufen, die Ergebnisse stehen in Abschnitt 6. Abschnitte 1 bis 5 sind die unveränderte Freigabevorlage.

**Ergebnis dieses Schritts (Freigabevorlage, vor den Läufen):** Die Läufe sind **nicht gestartet**. Beide Läufe, die die vorhandenen Secrets nutzen, schreiben am Ende einen Commit (Abschnitt 1). Der Auftrag erlaubt nur Läufe ohne Commit. Dieses Dokument ist deshalb die Freigabevorlage: genaue Eingaben, Nebenwirkungen, der Vorher-Stand aus den gepinnten Zählungen und der Pin-Plan. Pins, Registrierungen und `docs/SUPERTRADER_9_CERTIFICATION_READINESS.md` sind unverändert.

## 1. Welche Workflows die Läufe ausführen

Beide Runner laufen nur in `.github/workflows/supertrader-validation.yml`, Job `run`. Andere `supertrader-*.yml` rufen sie nicht auf.

| Runner | Modus | Auslöser | Secrets im Schritt | Laufzeit (zuletzt) |
|---|---|---|---|---|
| `run-kk-intraday.mjs` (C09/C10) | `kk-intraday-cache` (`--cache-only`, `TIINGO_API_KEY` wird vor dem Aufruf entfernt) | `workflow_dispatch` (Eingaben `mode`, `snapshot`, `accounting`) oder Marke in der Commit-Nachricht auf `claude/**` | `VU_HISTORY_S3_*` (nur lesen) | – |
| `run-sf5-lifecycle.mjs` | `sf5-lifecycle` | wie oben | `VU_HISTORY_S3_*` (nur lesen) | 93 min (40228392651) |

Geprüfte Nebenwirkungen:

- **Privater Eimer (R2):** nur lesen.
  - `run-kk-intraday.mjs` schreibt den Minuten-Cache nicht, wenn `--cache-only` gesetzt ist (Rücksprung vor `driver.put`, Zeile 278), und ruft keine Anfrage ab (`runFetchLoops` mit `cacheOnly`).
  - `run-sf5-lifecycle.mjs` schreibt nur in `--out` (`*.public.json`, `*.sealed.json`) im Runner-Verzeichnis.
- **Snapshots:** werden nur geöffnet, nicht neu erzeugt. Ein Capture läuft nur in `supertrader-research-snapshot.yml` über eine eigene Marke.
- **PR-Branch und `main`:** kein Commit. Der Checkout nutzt `ref: ${{ github.ref }}`, der Job hat keinen Push auf `github.ref`.
- **Commit, der nicht abschaltbar ist:** Der letzte Schritt „Verschlüsseltes Ergebnis ablegen“ (`if: always()`) committet die verschlüsselte Ausgabe als **neue Datei mit Zeitstempel** auf den Zweig `claude/supertrader-validation-results` und pusht ihn. Er überschreibt nichts, nur `main` und der PR-Branch sind nicht betroffen. Es gibt aber keine Eingabe, die den Schritt auslässt. Die Workflow-Berechtigung ist `contents: write`.
- **Öffentliche Ausgabe:** Das Log gibt `*.public.json` aus (`cat`), also nur Zählungen, Hashes und Reason Codes. Rohkurse und Minutenwerte stehen nur in der verschlüsselten Datei und im privaten Cache. Ein Actions-Artefakt lädt der Workflow nicht hoch.

Damit fallen beide Läufe unter „läuft nur mit Commit“ und sind **nicht gestartet**.

## 2. Freigabevorlage: Läufe

Alle Läufe verwenden dieselbe Snapshot-Generation wie die gepinnten Läufe:

- Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Datensatz-SHA-256 `3ea6443d…`
- Abrechnung `research-v1`
- 0 Tiingo-Anfragen

| Nr. | Zweck | Workflow / ref | Eingaben | Nebenwirkung |
|---|---|---|---|---|
| L1 | C09/C10 **nachher** | `supertrader-validation.yml` auf `claude/supertrader-c09-intraday-allocation` | `mode=kk-intraday-cache`, `snapshot=sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, `accounting=research-v1` | 1 Commit (neue Datei) auf `claude/supertrader-validation-results` |
| L2 | SF5 **nachher** | dto. | `mode=sf5-lifecycle`, gleiche Eingaben | dto. |
| L0 (optional) | C09/C10 **vorher**, Kontrolle | dto. auf `main` | wie L1 | dto. |

**Vorher-Stand ohne neuen Lauf:** Auf `origin/main` (Basis `34d57f100d`) ist der Test SF-KK-READINESS grün. Der KK-Research-Fingerabdruck auf `main` ist also gleich `researchCodeSha256` `a1aa5b0b…` von Lauf 40228395395, einschließlich `lifecycle-engine.mjs` (`3e2cbdc8…`). Für SF5 gilt dasselbe: `0726cac0…` entspricht Lauf 40228392651. Die gepinnten Zählungen dieser beiden Läufe sind daher der Vorher-Stand mit identischem Code und identischer Eingabe. L0 bestätigt nur die Determiniertheit und ist nicht nötig.

**Alternative ohne jeden Commit (eigene Owner-Entscheidung, eigener Workflow-PR):** Eine Eingabe `publish: artifact-only` im Validierungs-Workflow, die den Ablageschritt auslässt und nur `*.public.json` als Actions-Artefakt hochlädt. Die verschlüsselte Datei entfällt in diesem Fall. Ein Vorher-Lauf bräuchte dann einen Zweig mit alter Engine und neuer Workflow-Fassung. Das ist hier nicht umgesetzt, weil es den Ablagevertrag der Validierungsläufe ändert.

## 3. Vorher-Stand (gepinnt, Lauf 40228395395) und Vergleichsprotokoll

Die Nachher-Werte stehen in Abschnitt 6 (L1, Lauf 41504851988). Gezeigt werden nur Zählungen und Hash-Präfixe. Kennzahlen je Variante (CAGR, Drawdown, Trefferquote) stehen nur in der verschlüsselten Ausgabe und werden für den Bericht als Aggregat übernommen.

EP-Day-Set CLEAN (Lifecycle-Engine, Auftragstyp `INTRADAY_RESOLVED`, also von der Änderung betroffen):

| Variante | Trades vorher | geschlossen / offen | `tradesSha256` vorher | Trades nachher | `tradesSha256` / `ledgerSha256` gleich? | `intradayAllocationByMinute` |
|---|---|---|---|---|---|---|
| REF | 611 | 609 / 2 | `a3219114…` | offen | offen | offen |
| ALT-ORH-5 | 403 | 401 / 2 | `e62761cb…` | offen | offen | offen |
| ALT-NO-VOLUME-RULE | 1042 | 1039 / 3 | `d90c3977…` | offen | offen | offen |
| ALT-QUIET-PRIOR-RUN-50 | 406 | 405 / 1 | `c7cdc6c3…` | offen | offen | offen |
| ALT-EXIT-MA10 | 613 | 612 / 1 | `fcfa0981…` | offen | offen | offen |
| ALT-EXIT-MA50 | 598 | 593 / 5 | `16665e42…` | offen | offen | offen |
| ALT-FILL-MINUTE-OPTIMISTIC | 607 | 605 / 2 | `77cef900…` | offen | offen | offen |
| ALT-RISK-00025 | 612 | 610 / 2 | `8ffd2489…` | offen | offen | offen |
| ALT-RISK-001 | 581 | 579 / 2 | `6c9063d0…` | offen | offen | offen |
| SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE | 606 | – | `e8938fca…` (Ledger `513f3418…`) | offen | offen | offen |

Erweiterung `extE7_6.ep` (gleiche Varianten), vorher in derselben Reihenfolge: 615 / 404 / 1061 / 408 / 617 / 601 / 610 / 616 / 578 Trades, SF7-Variante 611. Dazu kommt die PS-Seite (`ps`, `psOnePositionPerTicker`, `extE7_6.ps`). Sie bucht über eigene PS-Trades, nicht über `INTRADAY_RESOLVED`, und muss deshalb hashgleich bleiben. Erwartung: Jede Abweichung dort ist ein Befund.

Vergleich nach L1, je Variante:

1. `trades`, `closed`, `openAtDataEnd`, `tradesSha256`, `ledgerSha256` gegen die Tabelle.
2. `rejections` je Reason Code, vor allem `REJECT_MAX_OPEN_POSITIONS`, `REJECT_INSUFFICIENT_CAPITAL` und `NOT_EXECUTED_NO_SOURCE_BAR`. Der Schlüssel `counts.intradayAllocationByMinute` erscheint nur an Engpasstagen. Fehlt er, gab es keinen Engpasstag.
3. Geänderte Zuteilungen werden nur als Zahl angegeben: Trades nur vorher, nur nachher, verschoben. Nicht genannt werden Ticker, Kurse oder Minutenwerte.
4. Unverändert müssen bleiben: Kandidaten, `intradayCoverage`, `sampling`, Minuten- und Basis-Cache-Hashes (`c399a88c…`, `911b53b5…`) und die Register (`e8d25282…`, `436358d6…`, `ca54c1fe…`). Weicht einer davon ab, ist die Eingabe nicht identisch und der Vergleich ungültig.

**SF5 (L2):** Erwartet ist für alle 47 Varianten ein bytegleicher öffentlicher Block gegenüber 40228392651. SF5 verwendet `INTRADAY_RESOLVED` nicht. Der Differential-Lauf in #1262 zeigt 282/282 gleiche Ausgaben. Dann wandert nur `researchCodeSha256` (`0726cac0…` → `a8d757fb…`). Jede Abweichung stoppt den Pin-Schritt.

## 4. Pin-Plan (nach sauberem L1/L2, zweiter Commit auf #1262)

Die Pins werden ergänzt und nicht ersetzt. Alte Lauf-IDs, ihre Hashes und die Registrierung 1.0.0 bleiben stehen und lassen sich weiter referenzieren.

| Pin | Datei | Schritt |
|---|---|---|
| `KK_SNAPSHOT_RUNS` | `completion/build-kk-ep-ps.mjs` | neuer Eintrag L1 vorn als `AUTHORITATIVE`, `researchCodeSha256` des neuen Kopfes. 40228395395 bleibt mit allen Feldern erhalten. Nach Repo-Konvention wird nur sein `role` auf `SUPERSEDED_BY_<L1>_…` gesetzt: `…_SAME_PUBLIC_RESULTS`, wenn alles gleich ist, sonst `…_C09_ALLOCATION_BY_MINUTE` mit den gezählten Unterschieden. |
| `SF5_SNAPSHOT_RUNS` | `completion/build-sf5-lifecycle.mjs` | neuer Eintrag L2 als `AUTHORITATIVE`, 40228392651 wird `SUPERSEDED_BY_<L2>_SAME_REFERENCES` |
| `PINNED_SF6_ENGINE_FILES` | `tests/sf-sf7-execution-validation.test.mjs` | neuer Wert `b05ea605…` mit Kommentar (Commit von L1/L2). Der alte Wert `7edb24de…` bleibt als benannte Konstante der 7.0-Identitätsläufe im Test. |
| ST9-V13 | `research/st9-v13-delisted-registration-1.1.0.json` (neu) | neue Registrierungsversion mit Referenz-Hash `lifecycle-engine.mjs` `1dcf2655…` und Begründung (C09-Korrektur, keine V13-Ergebnisse gesehen). `…-1.0.0.json` bleibt bytegleich. Die Studie liest 1.1.0, ein Test belegt, dass 1.0.0 unverändert ist. |
| Artefakte | `STRATEGY-KK-EP-PS-CHART.json`, `STRATEGY-SF5-LIFECYCLE.json`, `SUPERTRADER_5_LIFECYCLE_MATRIX.md` | nur mit ihren Erzeugern neu bauen, nicht von Hand ändern |

Unverändert bleiben `docs/SUPERTRADER_9_CERTIFICATION_READINESS.md`, `SF6-PAPER-2027` (`e623b336…`, `89fbcf86…`), `integrityCodeSha256`, die EP/PS-Register und `supertrader/data`.

## 5. Offene Owner-Freigaben

1. **Läufe L1 und L2** (optional L0) über `workflow_dispatch` mit den Eingaben aus Abschnitt 2, einschließlich des Ablage-Commits auf `claude/supertrader-validation-results`. Alternativ zuerst der Workflow-PR „nur Artefakt“.
2. **Pins** nach Vorlage der Zählungen: neuer AUTHORITATIVE-Eintrag, alte Einträge als SUPERSEDED, ST9-V13-Registrierung 1.1.0.
3. **Fachliche Freigabe C09** (Merge #1262) mit den Vorher/Nachher-Zahlen. Danach folgt der Versionssprung von `ENGINE_VERSION`, wenn gewünscht.

Bis dahin bleiben in der CI von #1262 genau die 5 Pin-Tests rot (Job `gates`). Kein Gate wurde abgeschwächt.

## 6. Ergebnisse der Läufe (02.11.2026)

Owner-Freigabe vom 02.11.2026: L1 und L2 mit den vorgesehenen Secrets, verschlüsselte Ablage auf `claude/supertrader-validation-results`. L0 ist nicht gelaufen. Abschnitt 2 zeigt, dass der Vorher-Stand mit gleichem Code und gleicher Eingabe schon als gepinnter Lauf vorliegt.

### 6.1 Läufe und Ablage

| Nr. | Lauf | Modus | ref / Commit | Dauer | Ergebnis | Ablagedatei (`claude/supertrader-validation-results`) |
|---|---|---|---|---|---|---|
| L1 | [41504851988](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/41504851988) | `kk-intraday-cache` | `claude/supertrader-c09-intraday-allocation` @ `2a61ec52aa` | 30 min | success, 0 Tiingo-Anfragen | `20261102T192348Z-kk-intraday-cache.sealed.json` (Commit `f49978767f`) |
| L2 | [41504856962](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/41504856962) | `sf5-lifecycle` | dto. | 113 min | success | `20261102T204700Z-sf5-lifecycle.sealed.json` (Commit `aa62bcd945`) |

Eingaben beider Läufe über `workflow_dispatch`: `snapshot=sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, `accounting=research-v1`.

Prüfung der Ablage:
- Jeder Lauf hat genau einen Commit mit genau einer **neuen** Datei angelegt (`git diff --name-status`: nur `A`). Bestehende Dateien wurden nicht geändert oder überschrieben. Gepusht wurde ohne Force.
- Beide Dateien beginnen mit `"schema":"supertrader-sealed-1.0.0"` (RSA-OAEP-256 + A256GCM, Schlüssel nur beim Owner). Der Zweig enthält danach 155 Dateien, alle `*.sealed.json`.
- `*.public.json` wird nicht abgelegt, sie steht nur im Log. Sie enthält Zählungen, Reason Codes und Hashes, keine Kurse, Minutenwerte, Ticker oder Kennzahlen.
- `main` und der PR-Branch haben durch die Läufe keinen Commit bekommen.
- **Zweigschutz:** `claude/supertrader-validation-results` hat keine Schutzregel (`protected: false`). Das Ruleset „Schutz vor Verlust“ (Löschen und Force-Push verboten) gilt nur für den Default-Branch, `brevo-newsletter-state`, `backup/**`, `rollback/**`, `data/**` und `evidence/**`. Schreiben können nur Personen mit Schreibrecht auf das Repository und der Workflow-Token. Lesen kann jeder, weil das Repository öffentlich ist, die Dateien sind aber verschlüsselt. Owner-Hinweis: Den Zweig in das Ruleset aufnehmen, dann sind Löschen und Force-Push verboten. Daran wurde hier nichts geändert.

Die Kennzahlen je Variante (CAGR, Drawdown, Trefferquote) stehen nur in den verschlüsselten Dateien. Hier stehen nur öffentliche Zählungen.

### 6.2 Unabhängiger Vergleich

Werkzeug: `scripts/supertrader/validation/compare-public-runs.mjs` (Test `sf-c09-compare-public-runs.test.mjs`). Es liest den öffentlichen Block aus dem Actions-Log beider Läufe, vergleicht kanonisches JSON und gibt nur Aggregate aus. Es benutzt weder die Engine noch die Pins.

```bash
node scripts/supertrader/validation/compare-public-runs.mjs --before <Log 40228395395> --after <Log 41504851988>
node scripts/supertrader/validation/compare-public-runs.mjs --before <Log 40228392651> --after <Log 41504856962>
```

**Gültigkeit (Eingaben identisch):** In der Quittung unterscheiden sich nur `runId`, `commit` und `researchCodeSha256`. Es gilt: KK `a1aa5b0b…` → `c5ee7f45…`, SF5 `0726cac0…` → `a8d757fb…`, beide gleich dem Fingerabdruck des PR-Kopfes. Gleich sind Datensatz `3ea6443d…` (EXACT), `engineCodeSha256` `89fbcf86…`, Minuten- und Basis-Cache (`c399a88c…`, `911b53b5…`), E7-6-Erweiterungscache, Day-Set-Hashes und Register (`e8d25282…`, `436358d6…`, `ca54c1fe…`, SF5 `0a1260e9…`). Ebenfalls gleich sind `candidates`, `intradayCoverage` und `sampling`. Der Vergleich ist damit gültig.

**SF5 (L2):** Alle 47 Variantenblöcke (41 sf5 + 6 SF7-Ausführung) sind identisch, ebenso alle Lebenszyklus-Blöcke (Determinismus, `sf7Validation`). Der ganze öffentliche Block ohne Quittung hat vorher und nachher dieselbe SHA-256 `c1f6b941…`. `counts.intradayAllocationByMinute` kommt nicht vor. Die Erwartung ist erfüllt.

**C10 / PS-Seite (L1):** `ps` (alle Tagesmengen, beide Überlappungsregeln) und `extE7_6` außer `extE7_6.ep` sind identisch, `ps` mit SHA-256 `5b1c967a…` vorher und nachher. Die Erwartung ist erfüllt.

**C09 / EP-Seite (L1):** Alle 47 EP-Blöcke haben sich geändert: 9 Varianten × 4 Tagesmengen, die SF7-Variante sowie die 10 Blöcke von `extE7_6.ep`. Auch `tradesSha256` und `ledgerSha256` sind überall verschieden. Das gilt auch dort, wo die Zahl der Trades gleich bleibt (ALT-ORH-5). Die unabhängigen Prüfungen `ep.sf7Validation` melden in allen 10 Varianten 0 Verstöße.

EP-Day-Set CLEAN (Referenz):

| Variante | Trades vorher → nachher | geschlossen | offen | `tradesSha256` nachher | Hash gleich? | `REJECT_INSUFFICIENT_CAPITAL` | `STOP_SAME_BAR_CERTAIN` |
|---|---|---|---|---|---|---|---|
| REF | 611 → 600 (-11) | 609 → 598 | 2 → 2 | `f4d9ffc7…` (Ledger `5d3abc61…`) | nein | 1 → 12 | 389 → 381 |
| ALT-ORH-5 | 403 → 403 (+0) | 401 → 401 | 2 → 2 | `5eab499a…` (Ledger `61360efc…`) | nein | 0 → 0 | 169 → 169 |
| ALT-NO-VOLUME-RULE | 1042 → 1023 (-19) | 1039 → 1020 | 3 → 3 | `cf5cf06b…` (Ledger `b52c1326…`) | nein | 73 → 92 | 659 → 637 |
| ALT-QUIET-PRIOR-RUN-50 | 406 → 399 (-7) | 405 → 398 | 1 → 1 | `566f9645…` (Ledger `0a372eea…`) | nein | 1 → 8 | 246 → 241 |
| ALT-EXIT-MA10 | 613 → 606 (-7) | 612 → 605 | 1 → 1 | `9bad9e98…` (Ledger `21ea27ad…`) | nein | 0 → 7 | 389 → 384 |
| ALT-EXIT-MA50 | 598 → 586 (-12) | 593 → 581 | 5 → 5 | `b2086656…` (Ledger `58e444d3…`) | nein | 15 → 27 | 378 → 370 |
| ALT-FILL-MINUTE-OPTIMISTIC | 607 → 597 (-10) | 605 → 595 | 2 → 2 | `2933c3ad…` (Ledger `d667fe8c…`) | nein | 5 → 15 | 384 → 377 |
| ALT-RISK-00025 | 612 → 611 (-1) | 610 → 609 | 2 → 2 | `084603c3…` (Ledger `b8c49841…`) | nein | 0 → 1 | 389 → 388 |
| ALT-RISK-001 | 581 → 573 (-8) | 579 → 571 | 2 → 2 | `3aded2fd…` (Ledger `11456735…`) | nein | 33 → 41 | 368 → 360 |
| SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE | 606 → 598 (-8) | 604 → 596 | 2 → 2 | `29498a69…` (Ledger `b7a311a1…`) | nein | 0 → 0 | 383 → 378 |

Andere Reason Codes (CLEAN, Delta nachher − vorher):

- REF: NOT_EXECUTED_INTRADAY_NOT_FETCHED +1
- ALT-NO-VOLUME-RULE: NOT_EXECUTED_INTRADAY_NOT_FETCHED -1
- ALT-EXIT-MA50: NOT_EXECUTED_IDENTITY_MISMATCH +1, NOT_EXECUTED_INTRADAY_NOT_FETCHED +3

Weitere Tagesmengen (Trades vorher → nachher, alle Hashes verschieden):

| Variante | BEFORE_FIX | STRAT_YEAR_X_LIQUIDITY | STRAT_YEAR_X_LIQUIDITY_X_REGIME | `extE7_6.ep` |
|---|---|---|---|---|
| REF | 611 → 600 (-11) | 463 → 455 (-8) | 429 → 423 (-6) | 615 → 604 (-11) |
| ALT-ORH-5 | 403 → 403 (+0) | 297 → 297 (+0) | 275 → 275 (+0) | 404 → 404 (+0) |
| ALT-NO-VOLUME-RULE | 1106 → 1075 (-31) | 818 → 801 (-17) | 774 → 763 (-11) | 1061 → 1035 (-26) |
| ALT-QUIET-PRIOR-RUN-50 | 406 → 399 (-7) | 310 → 307 (-3) | 286 → 282 (-4) | 408 → 403 (-5) |
| ALT-EXIT-MA10 | 613 → 606 (-7) | 463 → 459 (-4) | 429 → 425 (-4) | 617 → 608 (-9) |
| ALT-EXIT-MA50 | 598 → 586 (-12) | 457 → 448 (-9) | 427 → 422 (-5) | 601 → 594 (-7) |
| ALT-FILL-MINUTE-OPTIMISTIC | 607 → 597 (-10) | 462 → 456 (-6) | 428 → 421 (-7) | 610 → 603 (-7) |
| ALT-RISK-00025 | 612 → 611 (-1) | 463 → 463 (+0) | 429 → 429 (+0) | 616 → 614 (-2) |
| ALT-RISK-001 | 581 → 573 (-8) | 459 → 450 (-9) | 422 → 419 (-3) | 578 → 568 (-10) |
| SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE | – | – | – | 611 → 600 (-11) |

Unabhaengige Pruefungen `ep.sf7Validation` (CLEAN, vorher → nachher):

| Variante | Verstoesse | `maxOpenPositions` | `cappedByCash` | `cappedByWeight` | `sameBarExits` |
|---|---|---|---|---|---|
| REF | 0 → 0 | 7 → 7 | 24 → 26 | 159 → 157 | 389 → 381 |
| ALT-ORH-5 | 0 → 0 | 6 → 8 | 0 → 1 | 62 → 61 | 169 → 169 |
| ALT-NO-VOLUME-RULE | 0 → 0 | 9 → 10 | 94 → 115 | 326 → 304 | 659 → 637 |
| ALT-QUIET-PRIOR-RUN-50 | 0 → 0 | 6 → 7 | 8 → 13 | 127 → 126 | 246 → 241 |
| ALT-EXIT-MA10 | 0 → 0 | 6 → 7 | 6 → 11 | 162 → 162 | 389 → 384 |
| ALT-EXIT-MA50 | 0 → 0 | 8 → 7 | 58 → 49 | 143 → 140 | 378 → 370 |
| ALT-FILL-MINUTE-OPTIMISTIC | 0 → 0 | 7 → 8 | 24 → 26 | 159 → 158 | 384 → 377 |
| ALT-RISK-00025 | 0 → 0 | 7 → 12 | 0 → 3 | 69 → 69 | 389 → 388 |
| ALT-RISK-001 | 0 → 0 | 6 → 7 | 47 → 54 | 336 → 326 | 368 → 360 |
| SF7-ALT-FILL-MINUTE-OPTIMISTIC-CERTAIN-RULE | 0 → 0 | 7 → 8 | 22 → 27 | 160 → 158 | 383 → 378 |

Lesart:
- Die Änderung wirkt fast nur über die Kasse. `REJECT_INSUFFICIENT_CAPITAL` steigt, `STOP_SAME_BAR_CERTAIN` sinkt um ungefähr dieselbe Zahl. Vorher hat ein sicherer Stopp am selben Tag Kasse für die nächste Order in fillRank-Reihenfolge frei gemacht, auch wenn deren Füllminute vor der Stoppminute lag. Nach F-MC3M-01 ist die Kasse erst für spätere Minuten frei. Diese Einstiege fallen weg.
- `REJECT_MAX_OPEN_POSITIONS` kommt vorher und nachher nicht vor. Die Platzgrenze war im Referenzlauf also nie der Engpass.
- ALT-ORH-5 hat gleich viele Trades und gleiche Reason Codes, aber andere Hashes. Hier ändert sich nur die Größe einzelner Positionen (`cappedByCash` 0 → 1, `cappedByWeight` 62 → 61).
- Die kleinen Verschiebungen bei `NOT_EXECUTED_*` (REF +1, ALT-NO-VOLUME-RULE −1, ALT-EXIT-MA50 +4) folgen wahrscheinlich aus anderen Haltedauern: Eine Order für einen Wert, der gerade gehalten wird, wird übersprungen und nicht bewertet. Aus den öffentlichen Zählungen lässt sich das nicht einzeln belegen.

**Engpasstage (`counts.intradayAllocationByMinute`):** Der KK-Runner veröffentlicht für EP nur ausgewählte Zähler (`notExecuted`, `technicalOrdersArmed`, `notTriggered`, Reason Codes) und nicht das ganze `counts`-Objekt. Die Zahl der Engpasstage steht deshalb weder im öffentlichen Block noch in der verschlüsselten Datei, dort stehen nur Kennzahlen und Trades. Abschnitt 3 Punkt 2 hatte das anders erwartet. Sicher ist nur die Untergrenze: Jede der 47 EP-Ausgaben hat sich geändert, also gab es in jeder Variante mindestens einen Engpasstag. Wer die genaue Zahl will, braucht einen Runner, der den Zähler veröffentlicht. Das ändert `researchCodeSha256` erneut und braucht einen eigenen PR und einen neuen Lauf.

Nicht geprüft wurden die Kennzahlen je Variante, weil sie verschlüsselt sind. Der Owner kann sie in den beiden Ablagedateien mit den Vorgängern vergleichen: `20261025T203358Z-kk-intraday-cache.sealed.json` (40228395395) und `20261025T213058Z-sf5-lifecycle.sealed.json` (40228392651).

### 6.3 Neue Pins (zweiter Commit, ergänzt nach Abschnitt 4)

Alles ist ergänzt, nichts entfernt. Alte Lauf-IDs, ihre Hashes und Zählungen bleiben vollständig stehen. Ausdrücklich geändert wurden an alten Einträgen nur diese Felder:

| Pin | neu | alter Eintrag: was sich ändert |
|---|---|---|
| `KK_SNAPSHOT_RUNS` (`completion/build-kk-ep-ps.mjs`) | 41504851988 `AUTHORITATIVE`, `researchCodeSha256` `c5ee7f45…`, EP-Zählungen und Hashes aus L1, PS-Blöcke unverändert übernommen, `metrics` → Ablage `20261102T192348Z` | 40228395395: `role` `AUTHORITATIVE` → `SUPERSEDED_BY_41504851988_C09_ALLOCATION_BY_MINUTE`; an `validity` angehängt „superseded by 41504851988 (C09 allocation by fill minute, PR #1262: every EP block changed, inputs and PS identical)“ |
| `SF5_SNAPSHOT_RUNS` (`completion/build-sf5-lifecycle.mjs`) | 41504856962 `AUTHORITATIVE`, `researchCodeSha256` `a8d757fb…`, `sameReferencesAs` 40228392651 (47/47 identisch), sonst Felder von 40228392651 | 40228392651: `role` `AUTHORITATIVE` → `SUPERSEDED_BY_41504856962_SAME_REFERENCES` |
| `PINNED_SF6_ENGINE_FILES` (`tests/sf-sf7-execution-validation.test.mjs`) | `b05ea605…` | alter Wert `7edb24de…` bleibt als `PINNED_SF6_ENGINE_FILES_7_0_IDENTITY_RUNS` |
| ST9-V13 | `research/st9-v13-delisted-registration-1.1.0.json` (SHA-256 `e2f9aa7d…`), nur Referenz `lifecycle-engine.mjs` `3e2cbdc8…` → `1dcf2655…`, `baseCommit` `d789e6dc`, Block `amends`; `run-st9-v13-delisted-study.mjs` liest 1.1.0 | `…-1.0.0.json` bytegleich (`548b8079…`), als `REGISTRATION_FILE_1_0_0` / `REGISTRATION_SHA256_1_0_0` gepinnt; neuer Test prüft Bytegleichheit und dass sich nur diese eine Referenz ändert |
| Artefakte | `STRATEGY-KK-EP-PS-CHART.json`, `STRATEGY-SF5-LIFECYCLE.json`, `docs/SUPERTRADER_5_LIFECYCLE_MATRIX.md` mit ihren Erzeugern neu gebaut (`rebuild-all.mjs` konvergiert, 120/120 Golden Cases) | – |

Neu gegenüber Abschnitt 4: Die Ergebnisse von C09 haben sich geändert. Deshalb heißt die Rolle `…_C09_ALLOCATION_BY_MINUTE` und nicht `…_SAME_PUBLIC_RESULTS`. Der Test SF-KK-READINESS kennt diese eine Ersetzung jetzt ausdrücklich. Er prüft, dass Eingaben, Stichprobe und PS gleich sind, dass sich jeder EP-Hash geändert hat und dass es genau eine solche Ersetzung gibt (40228395395). Die bisherige Regel für `SAME_PUBLIC_RESULTS` bleibt unverändert.

Unverändert: `docs/SUPERTRADER_9_CERTIFICATION_READINESS.md` (bytegleich), `SF6-PAPER-2027` (`e623b336…`), `engineCodeSha256` `89fbcf86…`, `integrityCodeSha256`, EP/PS/Stichproben-Register, `ENGINE_VERSION` und `supertrader/data`.

Offen bleibt die fachliche Freigabe C09 (Merge #1262). Der PR wird nicht gemergt.
