# Supertrader – Forward-Datenpfad für SF6-PAPER-2027 (Protokoll 1.2.0, FP-ST-02 V5)

Stand: 03.11.2026. Folge-PR zu [SUPERTRADER_PAPER_2027_ACTIVATION.md](SUPERTRADER_PAPER_2027_ACTIVATION.md) (Abschnitt 3, Voraussetzung V5).

**Status: Entwurf.** Das Forward-Fenster und der Forward-Lader sind gebaut. Der neue Pin ist **vorbereitet, nicht gesetzt**: Protokoll 1.2.0 steht auf `DRAFT_PENDING_REFERENCE_IDENTITY`. Der Schalter bleibt aus. Es wurde kein Workflow gestartet und keine Variable und kein Secret gesetzt. Keine Orders, kein Broker, keine Produktfläche, `LIVE_NOT_APPROVED`.

Bei eingeschaltetem Schalter meldet der Wächter jetzt nicht mehr `FORWARD_DATA_PATH_NOT_IMPLEMENTED`, sondern `REFERENCE_IDENTITY_NOT_SHOWN`. Das bleibt so, bis die Owner-Läufe aus Abschnitt 5 die Referenzgleichheit zeigen und 1.2.0 festgeschrieben ist (Abschnitt 6).

## 1. Was neu ist

| Datei | Inhalt |
|---|---|
| `scripts/supertrader/validation/lib.mjs` | `FORWARD_WINDOW` (`PAPER_2027`), `forwardWindow(to)`, Auswahl über `ST_WINDOW=PAPER_2027` mit `ST_WINDOW_TO=<t>`, eigener Namensraum `tiingo-paper-2027`, `LISTING_OPTS` (Listen-Stichtag t). `WINDOWS`, DEV und HOLDOUT bleiben unverändert. |
| `scripts/supertrader/validation/analyze-methods.mjs`, `fetch.mjs`, `sec-pit.mjs` | übergeben `L.LISTING_OPTS` an `buildListingTable`. In DEV und HOLDOUT ist der Wert `undefined`, das Verhalten also wie bisher. |
| `scripts/supertrader/validation/fetch.mjs` | `--mode forward`: schreibt den Forward-Namensraum bis t fort. Abgerufen wird, was fehlt, fehlerhaft ist oder vor dem Ziel endet, dazu SPY immer. Ein unvollständiger Lauf endet mit Exit 6 (`FORWARD_FETCH_INCOMPLETE`). |
| `scripts/supertrader/source-faithful/paper/forward-source.mjs` | Forward-Lader `loadForwardSource(session, { io })` und `assertForwardWindow`. |
| `scripts/supertrader/source-faithful/completion/sf6-paper-protocol-2027-v1_2_0.mjs` | Protokoll **1.2.0 neben 1.1.0**. Liste der Versionen und `currentPaperProtocol()`. 1.1.0 ist bytegleich (`e623b336…`). |
| `scripts/supertrader/source-faithful/paper/activation-2027.mjs` | Der Wächter kennt alle Versionen und akzeptiert nur die aktuelle. Der Datenpfad ist `IMPLEMENTED`. Neue Gründe: `PROTOCOL_SUPERSEDED:1.1.0` und `REFERENCE_IDENTITY_NOT_SHOWN`. |
| `scripts/supertrader/source-faithful/paper/forward-log.mjs` | Einträge und Kette beziehen sich auf die aktuelle Version. |
| `scripts/supertrader/source-faithful/paper/run-paper-2027.mjs` | neu `session` (fällige Sitzung) und `forward-probe` (nur Zählungen und Hashes). `record` lädt über den Forward-Pfad und bricht ab, wenn eine Sitzung in den Daten fehlt (`FORWARD_SESSION_NOT_IN_DATA`). |
| `.github/workflows/supertrader-paper-2027.yml` | Job `record`: erst Sitzung bestimmen, dann Forward-Reihen fortschreiben, dann SEC-Daten, dann aufzeichnen. Jeder Schritt läuft mit `ST_WINDOW=PAPER_2027` und `ST_WINDOW_TO=<t>`. |
| `.github/workflows/supertrader-research-snapshot.yml`, `snapshot/pointer.mjs`, `snapshot/restore-job.sh` | `capture-paper-2027` (mit `[supertrader-snapshot-window-to:YYYY-MM-DD]`) und `restore-paper-2027`. Eigener Zeiger `SNAPSHOT-POINTER-PAPER-2027.json` mit Fenster. |
| `.github/workflows/supertrader-validation.yml` | Eingabe `allow_code_version_change`, nur manuell und nur mit Snapshot. Dazu die Modi `paper-2027-fetch`, `paper-2027-sec` und `paper-2027-probe`, ebenfalls nur manuell. |
| `scripts/supertrader/tests/sf-paper-2027-forward.test.mjs`, `paper-forward-fixture.mjs` | 8 Tests, darunter der Identitätsnachweis (Abschnitt 3). |

## 2. Datensemantik: dieselbe wie im Research-Snapshot

Es gibt keinen zweiten Lader und keine zweite Preisableitung. Die Forward-Quelle ist `validation/analyze-methods.mjs#loadPitData` mit `snapshot/snapshot.mjs#CANONICAL_LOAD`, also mit den Flags des Captures. Sie läuft nur im Fenster `PAPER_2027`.

Der Datensatz einer Sitzung t entsteht wie in den Snapshot-Läufen der Referenzen (`run-sf6-validation.mjs`):
- `datasetFromPit` mit `lib.mjs#adjustSeries`: Split-Faktoren und Dividenden, ADR-002;
- `attachSecPit` mit sec-pit r12.

| Punkt | Forward-Fenster `PAPER_2027` | wie |
|---|---|---|
| Vorlauf | ab 02.01.2026 (ein Jahr) | DEV 2015, HOLDOUT 2007 |
| erste Sitzung | 04.01.2027 | Protokoll `window.firstSession` |
| Ende | rollend, `ST_WINDOW_TO` = aufzuzeichnende Sitzung t | – |
| Universum | `buildListingTable` mit Stichtag t, `INCLUDED_CLASSES`, `STORE_ACTIVE` aus der täglichen Kurspipeline (`tiingo`), alles andere aus dem eigenen Namensraum | DEV-Regeln, HOLDOUT-artiger Namensraum |
| Delistings | Listenende vor t − 10 Tagen ⇒ `LISTING_INACTIVE` mit Abrechnung | DEV |
| PIT | Rohdaten bis t, Adjustierung danach (`forward-log.mjs#truncatePit`). Ein Split nach t ändert die Aufzeichnung von t nicht. | Protokoll `data.pit` |
| Einfrieren | Capture/Restore mit `ST_WINDOW=PAPER_2027`, gleicher Snapshot-Code | Protokoll `data.freezing` |

Warum der Stichtag t nötig ist: Ohne ihn gilt in `buildListingTable` der Standard 01.10.2026. Ein Titel, der im Februar 2027 delistet wird, liefe dann als aktiv weiter, ohne Abrechnung des Delistings. Der Test `PAPER-2027-FWD-LOADER` zeigt diesen Gegenfall.

## 3. Nachweis: DEV und HOLDOUT unverändert

**Auf Fixtures (Test `PAPER-2027-FWD-DEV-HOLDOUT-IDENTITY`):** Ein Kindprozess je Fenster lädt synthetische Quellen über den unveränderten Lader. Die Quellen enthalten 5 aktive Titel, ein Delisting, einen Börsengang, einen Split und Dividenden. Der Kindprozess baut den Datensatz und rechnet alle 11 SF6-Referenzen über das ganze Fenster.

Die Ausgabe wird gehasht. Sie umfasst:
- Fenster und Konvention;
- Listentabelle und Endursachen;
- Datensatz- und Kontroll-Backtest-Fingerabdruck;
- je Referenz die Ledger- und Trade-Hashes.

Die Hashes sind **mit dem Code vor 1.2.0** gepinnt (Zweig `claude/supertrader-paper-2027-activation`, `db3f98c5`):

| Fenster | Hash vor 1.2.0 = nach 1.2.0 | Referenzen mit Buchungen |
|---|---|---|
| DEV | `7c0c27669fcb02fe…` | 10 von 11 (Power Play 0), alle abgeglichen |
| HOLDOUT | `b2b2b68da9b5658a…` | 10 von 11, alle abgeglichen |

Zusätzlich gilt:
- Die Konvention (`snapshot/contract.mjs#conventionFingerprint`) bleibt `94a96e3056c6…`. Die eingefrorenen DEV- und HOLDOUT-Snapshots lassen sich also weiter öffnen (sonst `CORPORATE_ACTION_CONVENTION_MISMATCH`).
- `WINDOWS` ist unverändert.
- Ohne `ST_WINDOW` ist das Fenster DEV, mit `ST_WINDOW=HOLDOUT` das Holdout-Fenster, beide wie bisher.
- Die bestehenden Snapshot-Tests (Capture, Restore, Parität) sind grün.

**Auf den echten Daten:** durch die Owner-Läufe in Abschnitt 5.

## 4. Fingerabdrücke

| Fingerabdruck | vorher | nachher | Grund |
|---|---|---|---|
| Turtle-Engine `runner/run-research.mjs#codeSha256` (`turtleEngineCodeSha256`) | `89fbcf864a57041379bc62d4af64cfda7c5601aaaf1c08b38fd6b91b6472ef24` | **`5e6683d4ebf4f6c4257b0bfbc4a3fcb6608973ddb0876a0ef077bf9d4cccecec`** | `validation/lib.mjs`, die einzige geänderte der 10 Dateien |
| Minervini-Code, Minervini-Varianten, sf5-Varianten | `c834b227…`, `f13ea350…`, `0a1260e9…` | unverändert | – |
| Snapshot-Konvention | `94a96e3056c6…` | unverändert | Funktionstexte unverändert |
| Snapshot-Code `snapshot/contract.mjs#codeFingerprint` | `0672fa7dad13…` | `675c404f9d18…` | `lib.mjs` und `analyze-methods.mjs` |
| ST9-V13-Registrierung 1.0.0, `validation/lib.mjs` | `49fd4a39c600…` | `b46350addaa5…` | wie oben |
| ST9-V13-Registrierung 1.0.0, `validation/analyze-methods.mjs` | `99de2c0f133f…` | `520fb34781ba…` | `LISTING_OPTS` |
| Protokoll SF6-PAPER-2027 | 1.1.0 `e623b336cd24…` (bleibt) | 1.2.0 Entwurf `1c23911cb771bf25…` | ändert sich noch einmal, wenn die Läufe eingetragen werden |

Kleiner ging es nicht. Das Fenster wird in `lib.mjs` ausgewählt, beim Import über `ST_WINDOW`. Von dort lesen es auch `buildListingTable` und `classifyFetch`. Ein Forward-Fenster außerhalb von `lib.mjs` hätte die Universumsregeln doppelt gebraucht. Das ist nach ADR-002 und dem Auftrag ausgeschlossen. An den Funktionstexten der Konvention ändert sich nichts.

**Folge für alle Snapshot-Läufe nach dem Merge:** Der Snapshot-Code-Fingerabdruck ändert sich. Jeder Runner auf `sts1-134d4d62…` verweigert deshalb ohne `--allow-code-version-change` (`CODE_VERSION_CHANGED`, Review SF-R4-01). Dafür gibt es jetzt die Dispatch-Eingabe `allow_code_version_change`. Sie gilt nur manuell und nur mit Snapshot und wird im Beleg vermerkt (`codeVersionChanged: true`). Der Datensatz wird trotzdem gegen das Manifest verglichen, `datasetVerified` ist dann `EXACT` oder `CODE_VERSION_CHANGED`. Das betrifft auch den KK-Lauf von #1263.

## 5. Owner-Läufe, die die Referenzgleichheit zeigen

Alle Läufe laufen auf dem Zweig dieses PR (`claude/supertrader-paper-2027-forward-path`) und auf dem DEV-Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`. Bis auf den Snapshot-Abruf kosten sie keine Anbieter-Anfragen.

| # | Workflow | Eingaben bzw. Marke | Vergleich mit | Erwartung |
|---|---|---|---|---|
| R1 | `supertrader-validation.yml` (workflow_dispatch) | `mode=sf-research`, `snapshot=sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, `accounting=research-v1`, `allow_code_version_change=true` | 40170829944 | `datasetVerified: EXACT`. Alle Szenarien von S1/S2 haben einen identischen öffentlichen Block (BASE_S0 `884d88cb…` / `67169e86…`), ebenso Darvas (`tradesSha256`). Beleg-`codeSha256` = `5e6683d4…`. |
| R2 | `supertrader-validation.yml` | `mode=sf4-lifecycle`, sonst wie R1 | 40170832007 | `EXACT`. REF und alle Varianten von SEPA und Power Play identisch (REF SEPA `1ca52391…`, PP `877ceb33…`). |
| R3 | `supertrader-validation.yml` | `mode=sf5-lifecycle`, sonst wie R1 | 40228392651 | `EXACT`. Die sieben sf5-Lifecycles identisch. |
| R4 | `supertrader-research-snapshot.yml` | leerer Commit mit `[supertrader-snapshot:restore]` | Restores in `SNAPSHOT-POINTER.json` | zwei unabhängige Restores: `datasetVerified` und `replayVerified` `EXACT` bei `codeVersionChanged: true` |
| R5 | `supertrader-research-snapshot.yml` | leerer Commit mit `[supertrader-snapshot:restore-holdout]` | `SNAPSHOT-POINTER-HOLDOUT.json` | wie R4, für den Holdout-Snapshot |
| R6 | `supertrader-validation.yml` | `mode=kk-intraday-cache`, sonst wie R1 | 40228395395 | 0 Anfragen, alle öffentlichen Blöcke identisch, Engine-Hash `5e6683d4…`. Keine SF6-Referenz, aber nötig für SF-KK-READINESS. Lässt sich mit dem Lauf zu #1263 zusammenlegen. |

R1 bis R3 entsprechen den beiden Läufen von 1.1.0 (E7-3) und decken zusätzlich die sieben sf5-Referenzen ab. Damit sind alle 11 Referenzen abgedeckt. R4 und R5 zeigen, dass der Lader DEV und HOLDOUT auf den echten eingefrorenen Daten unverändert baut.

**Vorbereitung des Forward-Namensraums (ab Dezember 2026, keine Referenzgleichheit):**

| # | Workflow | Eingaben | Zweck |
|---|---|---|---|
| F1 | `supertrader-validation.yml` | `mode=paper-2027-fetch` | Erstbefüllung von `tiingo-paper-2027` bis zur letzten Sitzung. Wiederholen bis Exit 0, der Lauf setzt fort, wo er stand. |
| F2 | `supertrader-validation.yml` | `mode=paper-2027-sec` | sec-pit r12 und sec-delist r13 im Forward-Namensraum |
| F3 | `supertrader-validation.yml` | `mode=paper-2027-probe` | Forward-Lader auf echten Daten. Nur Zählungen und Hashes, keine Aufzeichnung. Vor dem 04.01.2027 sind 0 Sitzungen im Fenster zu erwarten. |

## 6. Folge-Commit nach den Läufen (vor dem 01.01.2027)

1. In `sf6-paper-protocol-2027-v1_2_0.mjs` werden `referenceIdentity` mit den Lauf-IDs gefüllt (`turtle`, `minervini`, `sf5`, `restoreDev`, `restoreHoldout`, `kk`; `status: 'SHOWN'`) sowie `fixedOn` und `status: 'PREPARED_NOT_ACTIVE'` gesetzt.
2. `ACTIVATED_PROTOCOL_SHA256` bekommt den neuen 1.2.0-Fingerabdruck. Der Test `PAPER-2027-SWITCH` erzwingt das.
3. In `sf-sf6-readiness.test.mjs` wird `SF6-PAPER-PROTOCOL-2027` auf die aktuelle Version umgestellt: 1.2.0-Fingerabdruck pinnen, Pins gegen den Code prüfen. Der 1.1.0-Fingerabdruck bleibt als ersetzte Version gepinnt.
4. `completion/facts.mjs` bekommt einen neuen `CURRENT_ENGINE`-Eintrag aus R1. 40170829944 wird `REGRESSION_REFERENCE`. Dazu kommen der neue maßgebliche sf4-Lauf aus R2 und der KK-Lauf aus R6, jeweils mit eigenem Eintrag; die alten bleiben erhalten.
5. Die Completion-Artefakte und `SUPERTRADER_13_METHODS_EVIDENCE.md` werden **mit ihren Erzeugern** neu gebaut, nie von Hand.
6. Die ST9-V13-Registrierung bekommt einen Nachtrag (1.0.1) mit den neuen Hashes. Das ist eine Owner-Entscheidung, denn die Registrierung sagt ausdrücklich: „a changed engine needs a new registration“.
7. Danach kann der Owner-Commit am Schalter folgen (Aktivierungsvorlage, Abschnitt 6).

## 7. Erwartet rot, bis die Läufe da sind (nicht abgeschwächt)

Supertrader-Suite: 1142 Tests, 1116 bestanden, **14 fehlgeschlagen**, 12 übersprungen. Alle 14 folgen aus dem neuen Turtle-Fingerabdruck, dem neuen Snapshot-Code oder den neuen Datei-Hashes. Keiner wurde neu gepinnt oder abgeschwächt.

| Test | warum rot | grün durch |
|---|---|---|
| `SF6-PAPER-PROTOCOL-2027` (sf-sf6-readiness) | Die 1.1.0-Pins passen nicht mehr zum Code. | Folge-Commit Schritt 3 |
| `SF7-EXIT-FINGERPRINTS` | Turtle-Engine `89fbcf86…` ist gepinnt. | Schritt 3/4, neuer Pin nach R1 |
| `SF3-RUNNER-FINGERPRINT`, `SF4-RUNNER-FINGERPRINT`, `SF5-RUNNER-FINGERPRINT` | Die `CURRENT_ENGINE`-Läufe tragen den alten Code-Hash. | R1, Schritt 4 |
| `SF4-SNAPSHOT-RUN-CURRENT-CODE` | Der maßgebliche sf4-Lauf trägt den alten Engine-Hash. | R2, Schritt 4 |
| `SF-KK-READINESS` | Der maßgebliche KK-Lauf trägt den alten Engine-Hash. | R6, Schritt 4 |
| `SF2-COMPLETION-ARTIFACTS` | Frischer Build: AG-3 ist für C01/C02 ohne Lauf auf dem neuen Code nicht erfüllt. | R1, Schritte 4 und 5 |
| `CP-PLAN-REPORT`, `MC3-EV-REFCODE`, `MC3-EV-DOC-EQUALS-GENERATOR`, `MC3-EV-MERGE-FORECAST` | `HEAD_DIFFERS_FROM_PINNED_REFERENCE_FINGERPRINT` | R1, Schritte 4 und 5 |
| ST9-Ausführung: „registered references are re-hashed“, „preflight lists exactly …“ | `REGISTERED_REFERENCE_CHANGED: validation/analyze-methods.mjs` (und `lib.mjs`) | Schritt 6 (Owner-Entscheidung) |

## 8. Prüfen

```bash
node --test scripts/supertrader/tests/sf-paper-2027-forward.test.mjs scripts/supertrader/tests/sf-paper-2027-activation.test.mjs
node scripts/supertrader/source-faithful/paper/run-paper-2027.mjs guard --today 2026-11-03   # INACTIVE, NOT_ACTIVATED; Pins gleich 1.2.0
node -e 'import("./scripts/supertrader/source-faithful/runner/run-research.mjs").then((m) => console.log(m.codeSha256()))'   # 5e6683d4…
```

## 9. Ablaufblatt R1–R6 für die gebündelte Owner-Ausführungsfreigabe

Stand: 03.11.2026. Nur Dokumentation. Es wurde kein Lauf gestartet. Die Freigabe der Läufe ist eine eigene Owner-Entscheidung. Sie gilt gebündelt für R1 bis R6 und nur in der Form dieser Tabelle. Die Läufe sind in `sf6-paper-protocol-2027-v1_2_0.mjs#referenceIdentity.requiredRuns` festgeschrieben. Weicht eine Eingabe davon ab, ist der Lauf kein Nachweis.

**Ref für alle Läufe:** Zweig `claude/supertrader-paper-2027-forward-path` (PR #1270). Code-Stand `2823ce3ca94a23def67b82f3acfed38904ebd889`. Dieser Abschnitt kam als reiner Doku-Commit danach und ändert keinen Fingerabdruck. Gestartet wird auf der Spitze des Zweigs. Maßgeblich ist der Code-Fingerabdruck im Beleg, nicht die SHA. Ein Lauf auf einer anderen Spitze zählt nur, wenn die Fingerabdrücke der Spalte „erwartet“ gleich sind.

**Gemeinsame Werte:**
- `SNAPSHOT_DEV` = `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`.
- Turtle-Engine-Fingerabdruck nach 1.2.0 = `5e6683d4ebf4f6c4257b0bfbc4a3fcb6608973ddb0876a0ef077bf9d4cccecec`, vorher `89fbcf86…`.
- Snapshot-Code-Fingerabdruck `675c404f9d18…`, vorher `0672fa7dad13…`. Daher `codeVersionChanged: true`.
- Konvention `94a96e3056c6…`, unverändert.

| # | Workflow-Datei, Auslöser | Eingaben (alle) | erwarteter Code-Fingerabdruck | verglichen mit | Gleichheitskriterien | Dauer (Referenzlauf) | Secrets / Anbieter | Ablage |
|---|---|---|---|---|---|---|---|---|
| R1 | `.github/workflows/supertrader-validation.yml`, workflow_dispatch, Ref wie oben | `mode=sf-research`, `snapshot=sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, `accounting=research-v1`, `allow_code_version_change=true` | Beleg-`codeSha256` = `5e6683d4…` | **40170829944** (Commit `d32d1013`, 25.10.2026) | `datasetVerified: EXACT`. Jedes Szenario von S1 und S2 hat einen identischen öffentlichen Block (BASE_S0 `884d88cb…` / `67169e86…`; Trades BASE_S0 820 / 559). Die Darvas-Komponentenstudie ist identisch (`tradesSha256`). Beleg `codeVersionChanged: true`. | ≈ 22 min (06:55–07:17 UTC) | nur Snapshot-Eimer (`VU_HISTORY_S3_*`). Im Schritt steht kein `TIINGO_API_KEY`. 0 Anbieteranfragen. | verschlüsselt auf `claude/supertrader-validation-results` (`<stamp>-*.sealed.json`). Öffentlicher Block im Job-Log (`*.public.json`). |
| R2 | wie R1 | `mode=sf4-lifecycle`, sonst wie R1 | Minervini-Code `c834b227…`, Varianten `f13ea350…`, Engine `5e6683d4…` | **40170832007** (Commit `d32d1013`) | `EXACT`. REF und jede registrierte Variante von SEPA und Power Play sind identisch (REF SEPA `1ca52391…`, Power Play `877ceb33…`). | ≈ 29 min (06:55–07:24 UTC) | wie R1 | wie R1 |
| R3 | wie R1 | `mode=sf5-lifecycle`, sonst wie R1 | sf5-Varianten `0a1260e9…`, Engine `5e6683d4…` | **40228392651** (Commit `f60b3bb8`, sf5 AUTHORITATIVE) | `EXACT`. Die sieben sf5-Lifecycles (REF und Varianten) haben einen identischen öffentlichen Block. | ≈ 95 min (19:56–21:31 UTC) | wie R1 | wie R1 |
| R4 | `.github/workflows/supertrader-research-snapshot.yml`, push auf den Zweig: leerer Commit, Nachricht mit `[supertrader-snapshot:restore]` | keine Eingaben. Die ID kommt aus `SNAPSHOT-POINTER.json` (`sts1-134d4d62…`). | Snapshot-Code `675c404f…` (`codeVersionChanged: true`) | Restores in `SNAPSHOT-POINTER.json` (39213033571, 39217202814) | zwei unabhängige Restores (restore-a, restore-b). `datasetVerified: EXACT` mit `datasetSha256` `3ea6443de70c…`. `replayVerified: EXACT` mit `replaySha256` `18e2a0d8d969…`. `snapshot.mjs compare` ohne Abweichung. | ≈ 5 min (Referenz 39217202814) | nur Snapshot-Eimer. 0 Anbieteranfragen. | **Commit auf diesen Zweig** (`scripts/supertrader/foundation/artifacts/snapshot-runs/<runId>/`, neuer Eintrag in `SNAPSHOT-POINTER.json`, nur Hashes und Zählungen). Push über `push-with-retry.sh`. |
| R5 | wie R4, Nachricht mit `[supertrader-snapshot:restore-holdout]` (eigener Commit, nicht zusammen mit R4) | keine. Die ID kommt aus `SNAPSHOT-POINTER-HOLDOUT.json` (`sts1-85959e4bab0681baa6ed221bee94821e`). | wie R4 | Restores in `SNAPSHOT-POINTER-HOLDOUT.json` (39998409317) | wie R4. `datasetSha256` `28d41836527d…`, `replaySha256` `ef0d0559d00e…`, beide `EXACT`. | ≈ 5–10 min | wie R4 | wie R4 (`SNAPSHOT-POINTER-HOLDOUT.json`) |
| R6 | wie R1 | `mode=kk-intraday-cache`, `snapshot=sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, `accounting=research-v1`, `allow_code_version_change=true` | Beleg `engineCodeSha256` = `5e6683d4…`. KK-Forschungscode wie auf der Spitze (siehe unten). | **40228395395** (Commit `f60b3bb8`, KK AUTHORITATIVE). Nach #1263 zusätzlich der C09-Lauf zu #1263. | 0 Anfragen (Cache). Jeder öffentliche Block identisch (candidates, intradayCoverage, sampling, extE7_6, EP-Sets inkl. sf7Execution, PS; alle `tradesSha256` und `ledgerSha256`). Nach #1263 gilt das ohne das neue Feld `intradayAllocationByMinute`; gegen den C09-Lauf ist alles identisch. | ≈ 38 min (19:56–20:34 UTC) | Der Workflow entfernt `TIINGO_API_KEY` im Prozess (`unset`). Nur Snapshot-Eimer und vorhandener Intraday-Cache. 0 Anbieteranfragen. | wie R1 |

**Reihenfolge und Abhängigkeiten:**
1. Der C09-Lauf zu #1263 (`mode=kk-intraday-cache`, eigene Freigabe) läuft **vor** dem Merge von #1270, auf dem Zweig von #1263.
2. **R6 kann diesen Lauf nicht übernehmen.** Er trägt den alten Engine-Fingerabdruck `89fbcf86…`, weil #1263 `validation/lib.mjs` nicht ändert. SF-KK-READINESS verlangt auf dem Stand von #1270 aber `5e6683d4…`. Umgekehrt fehlt #1270 heute die Änderung an `run-kk-intraday.mjs` aus #1263: Der KK-Forschungscode steht hier auf `c5ee7f45…`, mit #1263 auf `20bd1b3b…`.
3. Deshalb läuft R6 **auf dem Code von #1270, nachdem #1262/#1263 auf main sind und main in diesen Zweig übernommen wurde**. Nur dann trägt der Beleg beide neuen Fingerabdrücke (Engine `5e6683d4…`, KK `20bd1b3b…`). Ein R6 vor diesem Schritt veraltet, sobald #1263 landet, und müsste wiederholt werden.
4. R1 bis R5 hängen nicht an #1263. Sie können vorher laufen. Ein späteres Übernehmen von main ändert nur die SHA, nicht die Fingerabdrücke. Die Belege bleiben gültig, solange die Spalte „erwartet“ stimmt.
5. R4 und R5 sind zwei getrennte leere Commits auf diesem Zweig. Die Concurrency je Zweig führt sie nacheinander aus. Ihr Publish-Job committet auf diesen Zweig. Vor weiteren Commits auf den Zweig muss also deren Push abgewartet werden.
6. Nach den Läufen folgt der Folge-Commit aus Abschnitt 6, mit den Lauf-IDs in `referenceIdentity`. Danach sind die 14 roten Tests aus Abschnitt 7 grün.

**Nicht Teil dieser Freigabe:**
- F1 bis F3 (Forward-Namensraum, Anbieteranfragen, ab Dezember 2026);
- der Owner-Schalter in `paper/activation-2027.mjs`;
- jeder Merge.

**Registrierung des Protokolls (unabhängig von R1–R6):**
- Das Protokoll `scripts/supertrader/source-faithful/paper/log/SF6-PAPER-2027.jsonl` wird als vorbereitete Datenart `supertrader-paper-2027-log` (`PREPARED_DISABLED`) in `core/registry/domains.json` eingetragen. Dafür gibt es zwei eigene PRs: #1272 (Supertrader) und #1273 (Core).
- Reihenfolge: #1272 (gepinnte Gate-Ausnahme in `registry-guard.mjs`) → #1268 → #1273 (Eintrag).
- Vor dem ersten Eintrag ins Protokoll braucht die Datenart den Wechsel auf `ACTIVATING`. Dazu gehören ein neuer Pin und ein eigener Core-PR, beides mit Owner-Freigabe.
