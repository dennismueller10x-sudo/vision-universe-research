# Supertrader C09: Studienläufe zur Zuteilung nach Füllminute (Freigabevorlage)

Stand 02.11.2026, PR #1262 (Kopf `d789e6dc4c`). Owner-Entscheidung vom 02.11.: Die Korrektur nach tatsächlicher Füllminute ist fachlich grundsätzlich der richtige Ansatz. Studienläufe mit Secrets, Vorher/Nachher-Vergleich und neue Pins sind vorzubereiten. Historische Nachweise werden nicht still geändert. Die finale fachliche Freigabe folgt nach Vorlage der Ergebnisse.

**Ergebnis dieses Schritts:** Die Läufe sind **nicht gestartet**. Beide Läufe, die die vorhandenen Secrets nutzen, schreiben am Ende einen Commit (Abschnitt 1). Der Auftrag erlaubt nur Läufe ohne Commit. Dieses Dokument ist deshalb die Freigabevorlage: genaue Eingaben, Nebenwirkungen, der Vorher-Stand aus den gepinnten Zählungen und der Pin-Plan. Pins, Registrierungen und `docs/SUPERTRADER_9_CERTIFICATION_READINESS.md` sind unverändert.

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

Die Nachher-Spalten füllt L1. Gezeigt werden nur Zählungen und Hash-Präfixe. Kennzahlen je Variante (CAGR, Drawdown, Trefferquote) stehen nur in der verschlüsselten Ausgabe und werden für den Bericht als Aggregat übernommen.

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
