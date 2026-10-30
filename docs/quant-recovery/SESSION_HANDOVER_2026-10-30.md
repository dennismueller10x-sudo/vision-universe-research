# Sitzungsübergabe Quant V10–V13 und Backtest-Engineering (Stand 30.10.2026)

Version 1.1.0 dieser Übergabe (30.10.2026; 1.0.0 kam mit #1140). Sie ersetzt keine Fachdokumente, sondern sagt, wo was steht und was offen ist. Eine neue Sitzung braucht keinen Chatverlauf. Abgeschlossene Forschung (V10–V13c) wird **nicht** wiederholt; ihre Befunde sind negativ bzw. begrenzt und gelten unverändert.

**Status der Übergabe:** Alles ist dokumentiert.

**Archiv: in R2 gesichert, Integrität geprüft, Restore aus R2 erfolgreich (30.10.2026).** Archiv 1.2.0 liegt mit 8 Teilen im bestehenden privaten R2-Eimer:
- Workflow-Verify: 8/8 Objekte OK.
- Restore aus R2: 8/8 Teile und 11.616 Dateien hash-identisch.

**Offen:** Das Secret `V13_ARCHIVE_PRIVATE_KEY` fehlt noch. Damit fehlt auch der Restore auf dem Runner, also der Nachweis, dass die Wiederherstellung ohne diese Sitzung gelingt. Ohne den privaten Archivschlüssel ist das Archiv nicht lesbar; er liegt bisher nur in dieser Sitzung und beim Owner (Abschnitt 4).

## 1. Stand `main` und PRs

`main` enthält #1132 (`adbc2f0444`), #1133 (`5e9d2b9d5a`) und #1140 (`99af26c091`), dazu automatische Datenläufe und PRs anderer Sitzungen.

| PR | Inhalt | Stand |
|---|---|---|
| #1091 | V10–V13 Research (Datenrettung, Realstudien, delistete Reihen) | gemergt |
| #1117, #1118, #1120, #1121 | Produktkorrekturen (u. a. Vollverkauf, Börsenwert-Skalenwächter market-cap-1.2.0, Spin-off-Bereinigung) | gemergt |
| #1119 | Security-Master-Status (Option A) | **zurückgehalten**; geht erst nach Review, eigener Freigabe und dem regulären Wechsel 1.1.0→1.3.0 weiter |
| #1129 | V13b (strikte Large-Cap-Grenze, F1w, HIST) | gemergt `0e28622a35` |
| #1132 | V13 Abschluss II (V13c-Studie, Archivwerkzeuge, R2-Workflow) | gemergt `adbc2f0444` |
| #1133 | Backtest-Engineering P2 (Vertrag v2, Population, Kennzahlen, Setup-OOS, Runner, 16 Demos) | **gemergt** `5e9d2b9d5a` (30.10.2026, nach Owner-Freigabe; vorher main, Checks, Reviews, Scope und Konflikte geprüft) |
| #1138 | interne Backtest-Vorschau (Basis seit dem Merge von #1133: `main`) | Draft; standardmäßig aus, nicht verdrahtet |
| #1143 | Security Master 1.1.0→1.3.0: exakte, quellengebundene Freigabeliste (Gate-Schema 1.1.0, Belege je Eintrag; Branch `claude/sm130-approval-list-4ho3rd`) | Draft, vom Owner gegenüber #1136 bevorzugt. Simulation: 1.085/1.144 Änderungen freigabefähig, sonst alles unter den unveränderten Grenzen; BLOCKED nur an G6 OKE (keine Ausnahme; Erzeuger-PR nötig, siehe 6.2) |
| #1140 | Archiv 1.2.0 (Manifest, Werkzeuge, Runner-Restore-Schritt), Entscheidungsvorlage, diese Übergabe | **gemergt** `99af26c091` (Owner-Freigabe 30.10.). Ersetzt **nicht** das Backup |

PRs anderer Sitzungen, die diese Arbeit berühren:
- #1136 (Security Master Nachholdrift, konkurrierendes Freigabeschema 1.1.0): von der Supertrader-9-Sitzung als **abgelöst** markiert („nicht mergen“), aber noch nicht geschlossen; das Schließen entscheidet der Owner. Nicht zusammen mit #1143 integrieren.
- #1159 (Draft, gestapelt auf #1100): nur die von der Freigabe unabhängigen Teile.
  - Backtest-Identitätssperre (Probelauf 72 IDs).
  - `compare` liest die Freigabeliste 1.1.0 aus #1143.
  - Freeze-Manifest ohne `docs/quant-recovery/v13/archive/`.
  - Alarm-Job in `security-master-weekly.yml`.
  - Kein Eingriff in Gate, Freigabe oder Workflow-Eingang. Überschneidung mit #1143 nur am Dateiende von `security-master-weekly.yml`.
- #1137 (Supertrader 9, automatischer SF8-Tageslauf).

## 2. Erledigt (nicht wiederholen)

- **V10–V13c-Studien:** Signal-, Pattern-, Setup-, Strategie- und Faktorstudien auf der Überlebenden- und der Delisted-Population, mit Large-Cap-Grenzen, F1/F1w/F1d, HIST-Sturzfällen und registrierter V13c-Studie 3.0.0. Befund: kein belastbares Alpha. Einstieg: [HANDOVER_V13.md](HANDOVER_V13.md), Abschnitte 1–10; [v13c/](v13c/).
- **Delistete Reihen:**
  - Register 1.0.0 mit 1.675 QUALIFIED und 151 nur Kurs;
  - Register 1.1.0 (V13b HIST) mit 1.688 QUALIFIED;
  - hashgebundener Loader `quant/engines/research-delisted-series.cjs`, opt-in.
- **Backtest-Engineering P2 (#1133):** sechs Arten, Ergebnisvertrag `backtest-result-2.0.0`, Runner, 16 echte Demofälle, unabhängige QA. Einstieg: `docs/quant/BACKTEST_ENGINEERING_HANDOVER_V1.md`.
- **Interne Vorschau (#1138):** Einstieg `docs/quant/BACKTEST_PREVIEW.md`.
- **Entscheidungsvorlage** Setup-OOS / Strategy / Factor: keine Normänderung, Gates unverändert. Einstieg: [../quant/DECISIONS_SETUP_OOS_STRATEGY_FACTOR.md](../quant/DECISIONS_SETUP_OOS_STRATEGY_FACTOR.md).
- **GitHub-Support-Anfrage** zur Bereinigung alter Commits und Blobs: Text an den Owner übergeben. Den Versand macht der Owner.

## 3. Sechs Backtest-Arten

Zustände:
- A = Research ausgeführt;
- B = vorbereitet, durch Daten begrenzt;
- C = produktzertifiziert. C entsteht nur über das Zertifizierungsartefakt.

Heute sind **0/6** Arten zertifiziert; `productionApproved=false`.

| Art | Research | Produkt | Was fehlt für C |
|---|---|---|---|
| SAME_STOCK_REPLAY | A (4 Fälle) | LIMITED / NOT_READY | beschreibt nur, Überlebende per Konstruktion |
| PATTERN_EVIDENCE | A (1) | LIMITED / NOT_READY | Überlebendenkorrektur, Gesamtrendite |
| SIGNAL_BACKTEST | A (5) | LIMITED / NOT_READY | keine Regel zertifiziert, Sensitivität nur teilweise |
| SETUP_BACKTEST | A (1, Rekonstruktion) | COLLECTING_HISTORY | Setup-OOS `FAIL/OOS_NOT_MEASURABLE_YET`; erste M6-Ergebnisse etwa Ende März 2027; Segmentierung braucht eine Owner-Entscheidung (Vorlage A1–A6) |
| STRATEGY_BACKTEST | A (3) · B (1 Profil) | COLLECTING_HISTORY | historische Mitgliedschaft und Faktorhistorie ≥ 24 Monate, frühestens etwa 2028-08 |
| FACTOR_RANKING_BACKTEST | A nur mit privatem V10-Panel | COLLECTING_HISTORY | 24 Snapshot-Monate und 12 abgeschlossene Forward-Monate, frühestens 2028-01/08 |

## 4. Private V13-Archive

### 4.1 Was es ist

Verschlüsseltes Archiv **1.2.0**, Manifest [v13/archive/manifest-1.2.0.json](v13/archive/manifest-1.2.0.json). Anleitung: [v13/archive/README.md](v13/archive/README.md).

| Kennzahl | Wert |
|---|---|
| Teile | 8 |
| Dateien | 11.616 |
| Größe (verschlüsselt) | 1.500.498.176 B |
| Manifest sha256 | `23efb9d27ad968a0f67b491e07247c33c65717dccc7bbf3ed05f58c3f9756ec3` |
| Archivschlüssel, DER-sha256 des öffentlichen Teils | `1b38092afd4b5c7f3a2345808fc754c53e08d0c4f3b379b1c98b2ec7f0266b5d` (`archive-pub.pem`) |

| Teil | Dateien | Chiffre-Bytes | cipherSha256 (Anfang) |
|---|---:|---:|---|
| v13-raw | 15 | 323.911.712 | 31e7d2fb9b775d2a |
| v13-derived | 2.587 | 146.370.592 | c11bb30fed418fdf |
| v13-studies | 50 | 238.766.112 | ebd72090d81a0620 |
| v13b-hist | 1.271 | 277.575.712 | 13b52ad404d49d00 |
| v13b-f1w | 19 | 67.153.952 | ef22644e3caddbb5 |
| v12-listref | 7.634 | 129.648.672 | a56d0ff5b51759e2 |
| v13c-study | 39 | 192.716.832 | bc65bc192f41a372 |
| v10-factor-panel | 1 | 124.354.592 | 0d3bbe15292793ba |

### 4.2 Was nachgewiesen ist

| Schritt | Ergebnis | Nachweis |
|---|---|---|
| Bau | ausgeführt 30.10.2026 | Manifest im Repo |
| lokale Restore-Probe | 8/8 Teile, 11.616 Dateien hash-identisch; Faktorpanel bytegleich; Loader lädt 1.675/1.675 QUALIFIED hashgebunden | `restore-archive.sh` |
| Kapazität | Eimer 4.775.926.662 B; mit Archiv unter 8 GB; Präfix vor dem Upload leer | Run 41068077861 |
| **Upload nach R2** | **erfolgt**: 8 Teile plus Manifest, `research-snapshots/quant-v13/archive-1.2.0/`, jede Datei mit SHA-256 geprüft | Run 41068077861 (`put`) + `transfer.sh put` |
| **Integritätskontrolle in R2** | 8/8 Objekte OK gegen `manifest-1.2.0.json` | Run 41069005168 (`verify`) |
| **Restore aus R2** | alle Teile frisch aus R2 geladen und entschlüsselt: 8/8 Teile, 11.616 Dateien hash-identisch; Manifest aus R2 bytegleich mit dem Repo | Run 41069696417 (`get`) + `transfer.sh get` + `restore-archive.sh` |
| Secret `V13_ARCHIVE_PRIVATE_KEY` | **fehlt** | Run 41069436826 (`restore`) → `SECRET_MISSING` |
| Restore auf dem Runner | **offen** (setzt das Secret voraus) | – |

Ursache der früheren Meldung „R2 nicht erreichbar“: Der Test lief gegen einen Platzhalter-Host (`probe.r2.cloudflarestorage.com`), dem Cloudflare TLS verweigert. Der echte Kontenendpunkt war die ganze Zeit erreichbar, die Netzwerkstufe der Umgebung steht auf „Vollständig“.

### 4.3 Verbleibender Owner-Schritt

1. GitHub-Repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*:
   - Name: `V13_ARCHIVE_PRIVATE_KEY`;
   - Wert: der vollständige Inhalt der Datei `archive-priv.pem`, die der Owner aus der bauenden Sitzung erhalten hat; zusätzlich offline aufbewahren, nie in Chat, Git oder Logs.
2. Danach genügt ein leerer Commit mit der Marke `[v13-archive:restore]` auf einem `claude/**`-Branch, aus jeder Sitzung. Der Runner lädt alle 8 Teile aus R2, prüft den Schlüssel gegen das Manifest und alle Hashes. Damit ist die Wiederherstellung unabhängig von der bauenden Sitzung nachgewiesen.

Wiederherstellung künftig, aus jeder Sitzung: Marke `[v13-archive:get]`, Artefakt per `gh api` laden, `transfer.sh get`, `restore-archive.sh`. Dafür ist der private Archivschlüssel nötig.

### 4.4 Reproduzierbarer Wiederherstellungsweg ohne Archiv

Die öffentlichen Register binden jede Datei per SHA-256. Ein Neubau ist deshalb prüfbar: Weicht er ab, schlägt der Loader fehl. Ein Neubau ist kein Ersatz für eine Sicherung, verhindert aber, dass Ergebnisse unprüfbar werden.

| Teil | Neu erzeugbar über | Prüfanker |
|---|---|---|
| v13-raw, v13-derived | Branch `claude/v13-delisted-fetch-4ho3rd`, Workflow `quant-v13-delisted-fetch.yml`, Marke `[v13-delisted:<batches>]`, neues Transport-Schlüsselpaar (`scripts/quant/v13/delisted/fetch-pubkey.pem` ersetzen); 8.620 Anfragen im Pauschaltarif; danach `scripts/quant/v13/delisted/qualify.py` | `register-1.0.0.json` sha256 `ea986202…a6f` (`pointsSha256` je Reihe) |
| v12-listref | `scripts/quant/v12/listref/` (SEC/EDGAR und Anbieter-Tickerliste) | Voraussetzung von `qualify.py`; HMAC-chainIds müssen reproduziert werden |
| v13b-hist | SEC-Abrufskripte unter `scripts/quant/v13b/hist/` | `v13b/hist/register-1.1.0.json` sha256 `19e108e7…270` |
| v13-studies, v13b-f1w, v13c-study | Studien neu rechnen: `scripts/quant/v13/studies/`, `scripts/quant/v13b/f1w/`, `scripts/quant/v13c/`, V13c gemäß `v13c/study-registration-3.0.0.json` (sha256 `bbe15b19…c1b`) | veröffentlichte Ergebnis-JSONs unter `docs/quant-recovery/v13*/` |
| v10-factor-panel | `scripts/quant/v10/factor/panel.cjs` (SEC-companyfacts-PIT) | Panel-sha256 im Provenienzblock des Faktor-Demofalls (`docs/quant/backtest-demos`) |

Risiko: Anbieterdaten können sich seither geändert haben. Dann reproduzieren die Hashes nicht, und die betroffenen Reihen bleiben ausgeschlossen (fail-closed). Die öffentlichen Ergebnisse bleiben gültig, sind aber nicht mehr nachrechenbar.

## 5. Relevante Hashes

| Objekt | sha256 |
|---|---|
| `docs/quant-recovery/v13/delisted/register-1.0.0.json` | `ea986202ab4dee0b33ff12f31d005bc2435e11014e5c4925be2fcacf86657a6f` |
| `docs/quant-recovery/v13b/hist/register-1.1.0.json` | `19e108e79c25d602ead7ec79583af50a8e0b620571667460ab04a017b936b270` |
| `docs/quant-recovery/v13c/study-registration-3.0.0.json` | `bbe15b1920bcee83222b72547b336b608e60f474a84d8ea2c178c6f08ad14c1b` |
| `quant/methodology/backtest-certification-v1.json` | `392f5657702e23598c4ee5ebcf36e120687f3975d31d9deb57e2e661882ad6ce` |
| `quant/data/product/backtest-certification-v1.json` (Stand `adbc2f0444`, generiert) | `0992222b68e6d9b9ff97ff239f513bc25e7286aaf4f6ac552c5eca99838cd6bf` |
| `docs/quant/backtest-preview/backtest-preview.json` (#1138) | `13f83352a95a49de15b3763aa8ddb2a2e1630bba7ec9725e6b69844b1daf4314` |
| Archiv-Manifest 1.2.0 | `23efb9d27ad968a0f67b491e07247c33c65717dccc7bbf3ed05f58c3f9756ec3` |
| Security-Master-Ausgangsstamm (Freigabebindung) | `prevMasterSha256` beginnt mit `26c82617` (siehe #1119 und die Freigabeliste) |

Teststand:

| Prüfung | Ergebnis |
|---|---|
| `node --test quant/tests/backtest-*.test.mjs` | 103/103 |
| `node --test "quant/tests/*.test.mjs"` (#1138, `cf328315a6`) | 3.654 bestanden, 0 fehlgeschlagen, 19 übersprungen |
| security-master (#1143, `651732d462`) | 76/76; `core` 300/300 |
| `v13-archive` und `secrets` | 11/11 |
| `verify-backtest-preview.py` | 16 Fälle, 0 Befunde |
| `core` auf `main` | 1 rot, DQ-SF8-8 (siehe 6.1) |

## 6. Offene Probleme und Freigaben

### 6.1 `core` war rot auf `main` (erledigt)

Erledigt am 30.10.2026: Der SF8-Kandidatenlauf vom 29.10. (`204a5171bf`) hat DQ-SF8-8 wieder grün gemacht, danach wurde #1133 gemergt. Befund zur Erinnerung, falls er wiederkehrt:

- **Fehler:** DQ-SF8-8 meldet „C01 BOOM/ULBI 2026-10-28: kein zeitgleicher veröffentlichter Schluss (Reihe 2026-10-29)“.
- **Ursache:** Die SF8-Kandidaten (`supertrader/data/sf-candidates`, Stand 28.10.) laufen nur manuell (`supertrader-sf8-candidates.yml`, workflow_dispatch, `commit=true` mit `expected_sha256`). Die veröffentlichte Tagesreihe ist mit dem Marktdaten-Refresh auf den 29.10. gesprungen.
- **Abhilfe (Supertrader-Welt, nicht dieser PRs):**
  - Der Owner stößt den SF8-Kandidatenlauf neu an;
  - oder #1137 (automatischer Tageslauf) wird gemergt.
- **Danach:** `core` auf #1133 einmal neu laufen lassen. Unmittelbar vor dem Merge aktuellen `main`, Pflichtchecks, Reviews, Scope und Konflikte prüfen; erst dann mergen.

### 6.2 Security Master 1.1.0 → 1.3.0

- **Probelauf** 40942100928: BLOCKED.

  | Gate | Befund |
  |---|---|
  | G6 | doppelte canonical_id (OKE) |
  | G7 | 83 canonical, 100 Deaktivierungen, 82 Eignungswechsel |
  | G9 | 592 Namen |

  Die Grenzen bleiben unverändert (G6/G7/G9 werden nicht pauschal erhöht).
- **Weg:** eine exakte, quellengebundene Freigabeliste je Änderung (Draft-PR #1143, Branch `claude/sm130-approval-list-4ho3rd`; Prüfdokument `docs/data/security-master/V130_APPROVAL_LIST_REVIEW.md`). Sie ist gebunden an Versionen und `prevMasterSha256`. Zu klären sind dort die doppelte canonical_id, 83 wiederverwendete Ticker, 100 Deaktivierungen, 82 Eignungswechsel und 592 Namensänderungen.
- **Befund der Liste:** 1.085 von 1.144 Änderungen sind freigabefähig.
  - canonical_id: 60/83 (27 Ticker-Wiederverwendungen mit neuem Listing, 19 Freiverkehr, 6 AMEX→NYSE MKT u. a.); nicht freigabefähig sind 15 verschwundene Altzeilen, 4 doppelt aktive Zeilen, CAM und TRT/TRUE/APAD.
  - Deaktivierungen: 84/100; nicht freigabefähig sind EDVA und 13 Identitätsbefunde, deren eigene Reihe weiterläuft.
  - Eignung: Die 82 zusätzlichen Wechsel folgen nur aus anderen Änderungen.
  - Namen: 591/592 (573 neu aus der SEC, 18 Umfirmierungen); nicht freigabefähig ist XRPN.
- **Owner-Entscheidung 30.10.:** #1143 wird gegenüber #1136 bevorzugt. Keine gleichzeitige Integration, keine Ausnahme-Freigabe für OKE.
- **OKE untersucht** (Prüfdokument, Abschnitt 4, SEC-Quellen):
  - ONEOK, Inc., CIK 1039684, NYSE.
  - Holding-Reorganisation am 10.09.2026 (8-K12B). Nachfolge-Emittent nach Rule 12g-3(a), neue CUSIP, Handel ohne Unterbrechung unter OKE.
  - Ticker-Wiederverwendung nur innerhalb von ONEOK (1997: CIK 74154 → 1039684).
  - `ref_OKE` läuft durchgehend.
  - Die Identität ist eindeutig, aber mit den bestehenden Mitteln **nicht regelkonform auflösbar**: Der Erzeuger führt beide Tiingo-Zeilen. Ein Zurückhalten im Gate wäre die abgelehnte Ausnahme unter anderem Namen.
  - Der Einzelfall bleibt ausgeschlossen. Der Lauf bleibt BLOCKED an G6 (Simulation: sonst alles unter den Grenzen, 0 ungenutzte Einträge).
  - **Empfohlener nächster PR:** im Erzeuger `quant/engines/us-security-master.js` identische canonical_id zusammenführen (gleicher Ticker, gleiche Börse, gleicher Beginn, gleiche Gattung und Währung; das jüngste Ende gewinnt), mit Vorher/Nachher-Vergleich. Betroffen sind 8 securityIds: OKE, BAM, CCSI, FUN, HUT, NYXH, TEL, UHAL-B.
  - Näherung ohne die inaktive OKE-Zeile: Die unveränderte Liste ergibt PASS.
- **Überschneidung #1136:** Beide PRs ändern Gate und Workflow, mit gleichem Schema-Namen und anderem Format. #1136 übernimmt OKE (`--include-duplicates`) und ist auf #1100/#1101 gestapelt, die nicht in `main` sind. Unabhängig davon wären nur die Freeze-Manifeste (#1100), die Belege aus #1101 und der Alarm-Job SMW-15 (Tabelle im Prüfdokument, Abschnitt 11).
- **Teststand #1143** (Kopf `651732d462`): security-master 76/76, `core` 300/300, Isolation sauber.
- **Reihenfolge:**
  1. Owner-Freigabe der Liste.
  2. Erzeuger-PR für die Doppelungen.
  3. Neuer Probelauf `commit=false` (Liste bei Drift mit dem Builder neu), erwartet PASS.
  4. `commit=true` am selben Tag.
  5. Erst nach erfolgreicher Schutzprüfung und ausdrücklicher Abschlussfreigabe #1119 und die echte 1.3.0-Umstellung.

### 6.3 Owner-Entscheidungen ohne Frist

- **Setup-OOS-Segmentierung** (Vorlage A1–A6), Ablage `kinds.SETUP_BACKTEST.oosSegmentation`. Ohne Entscheidung bleibt die Messung aus.
- **Strategy B1** (Research-Artefakt) und **Factor C1** (Rekonstruktionsscope).
- **Produktanzeige der Vorschau:** getrennte Entscheidung, heute nicht vorgesehen.

## 7. Nächste Prioritäten

1. **Archiv:** Upload, Verify und Restore aus R2 sind erledigt (30.10.). Offen ist nur das Secret `V13_ARCHIVE_PRIVATE_KEY` und danach `[v13-archive:restore]` auf dem Runner (4.3).
2. **#1133:** erledigt (gemergt `5e9d2b9d5a`); #1138 steht auf `main`.
3. **Security Master:** Owner-Freigabe der Liste #1143, Erzeuger-PR für identische canonical_id (OKE + 7), Probelauf, dann `commit=true`; #1119 erst nach Abschlussfreigabe. #1136 nicht zusammen mit #1143 integrieren.
4. Owner-Entscheidungen aus 6.3, sobald gewünscht. Keine Normänderung ohne Freigabe.

## 8. Einstieg für eine neue Sitzung

1. `CLAUDE.md`, dann dieses Dokument.
2. Archiv: `docs/quant-recovery/v13/archive/README.md`; Werkzeuge `scripts/quant/v13/archive/` (`build-archive.sh`, `restore-archive.sh`, `presign.mjs`, `transfer.sh`, `r2-restore.mjs`); Workflow `.github/workflows/quant-v13-archive.yml` (Marken usage, put, get, verify, keycheck, restore; nur auf `claude/**`).
3. Backtests: `docs/quant/BACKTEST_ENGINEERING_HANDOVER_V1.md`, `BACKTEST_RUNNER.md`, `BACKTEST_RESULT_CONTRACT_V2.md`, `BACKTEST_PREVIEW.md`; Code `scripts/quant/research/backtest-runner.cjs`, `run-backtest.cjs`, `quant/api/backtest-research-adapter.js`, `quant/api/backtest-preview-service.cjs`.
4. Research-Befunde: `docs/quant-recovery/HANDOVER_V13.md`, `docs/quant-recovery/v13c/`.
5. Security Master: `scripts/market/security-master-refresh-gate.mjs`, PR #1119, #1143, #1159 (#1136 abgelöst).
6. Tests: siehe `CLAUDE.md`, Abschnitt Tests. Gezielt:
   ```bash
   node --test quant/tests/backtest-*.test.mjs quant/tests/v13-archive.test.mjs quant/tests/secrets.test.mjs
   ```

**Dauerregeln:**
- keine Frontend-Änderung, keine Produktaktivierung, `productionApproved=false`;
- keine Gate- oder Normänderung ohne eigenen PR mit Freigabe;
- keine Handänderung generierter Daten;
- private Daten und Schlüssel nie in Git, Logs oder öffentliche Artefakte.
