# Sitzungsübergabe Quant V10–V13 und Backtest-Engineering (Stand 30.10.2026)

Version 1.0.0 dieser Übergabe. Sie ersetzt keine Fachdokumente, sondern sagt, wo was steht und was offen ist. Eine neue Sitzung braucht keinen Chatverlauf. Abgeschlossene Forschung (V10–V13c) wird **nicht** wiederholt; ihre Befunde sind negativ bzw. begrenzt und gelten unverändert.

**Status der Übergabe:** Alles ist dokumentiert. Der Archivstand ist prüfbar beschrieben (Abschnitt 4): Das Archiv ist **lokal restore-geprüft**, die **dauerhafte Sicherung ist noch BLOCKIERT**. Bis zum Upload gibt es das Archiv nur im Container dieser Sitzung. Der Wiederherstellungsweg ohne Archiv steht in 4.4.

## 1. Stand `main` und PRs

`main` = `adbc2f0444` (Merge #1132). Seitdem gibt es auf `main` nur automatische Datenläufe.

| PR | Inhalt | Stand |
|---|---|---|
| #1091 | V10–V13 Research (Datenrettung, Realstudien, delistete Reihen) | gemergt |
| #1117, #1118, #1120, #1121 | Produktkorrekturen (u. a. Vollverkauf, Börsenwert-Skalenwächter market-cap-1.2.0, Spin-off-Bereinigung) | gemergt |
| #1119 | Security-Master-Status (Option A) | **zurückgehalten**; geht erst nach Review, eigener Freigabe und dem regulären Wechsel 1.1.0→1.3.0 weiter |
| #1129 | V13b (strikte Large-Cap-Grenze, F1w, HIST) | gemergt `0e28622a35` |
| #1132 | V13 Abschluss II (V13c-Studie, Archivwerkzeuge, R2-Workflow) | gemergt `adbc2f0444` |
| #1133 | Backtest-Engineering P2 (Vertrag v2, Population, Kennzahlen, Setup-OOS, Runner, 16 Demos) | offen, Merge genehmigt (nach #1132). **Blockiert:** `core` rot wie auf `main` (siehe 6.1). Kein Merge vor grünem `core` |
| #1138 | interne Backtest-Vorschau (Draft, auf #1133) | Draft; standardmäßig aus, nicht verdrahtet |
| SM-Freigabeliste | quellengebundene exakte Freigabeliste 1.1.0→1.3.0 (Draft, Branch `claude/sm130-approval-list-4ho3rd`) | in Arbeit bzw. Draft; siehe 6.2 |
| dieser PR | Archiv 1.2.0, Runner-Restore-Schritt, Entscheidungsvorlage, diese Übergabe (Branch `claude/vision-quant-v10-backtest-4ho3rd`) | Draft |

PRs anderer Sitzungen, die diese Arbeit berühren: #1136 (Security Master Nachholdrift, Freigabeschema 1.1.0), #1137 (Supertrader 9, automatischer SF8-Tageslauf). Beide sind offen.

## 2. Erledigt (nicht wiederholen)

- **V10–V13c-Studien:** Signal-, Pattern-, Setup-, Strategie- und Faktorstudien auf der Überlebenden- und der Delisted-Population, mit Large-Cap-Grenzen, F1/F1w/F1d, HIST-Sturzfällen und registrierter V13c-Studie 3.0.0. Befund: kein belastbares Alpha. Einstieg: [HANDOVER_V13.md](HANDOVER_V13.md), Abschnitte 1–10; [v13c/](v13c/).
- **Delistete Reihen:**
  - Register 1.0.0 mit 1.675 QUALIFIED und 151 nur Kurs;
  - Register 1.1.0 (V13b HIST) mit 1.688 QUALIFIED;
  - hashgebundener Loader `quant/engines/research-delisted-series.cjs`, opt-in.
- **Backtest-Engineering P2 (#1133):** sechs Arten, Ergebnisvertrag `backtest-result-2.0.0`, Runner, 16 echte Demofälle, unabhängige QA. Einstieg: `docs/quant/BACKTEST_ENGINEERING_HANDOVER_V1.md` (auf dem #1133-Branch).
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
| lokale Restore-Probe | **8/8 Teile, 11.616 Dateien hash-identisch** (Chiffre, Klartext, Datei-Inventar); Faktorpanel bytegleich; Loader lädt 1.675/1.675 QUALIFIED hashgebunden | `restore-archive.sh`, nur lokal |
| R2-Lesezugriff und Kapazität | Eimer 4,78 GB; mit Archiv 6,28 GB, unter der Nullkostengrenze von 8 GB | Run 40943780307 `[v13-archive:usage]` |
| Upload nach R2 | **nicht ausgeführt** | – |
| Secret `V13_ARCHIVE_PRIVATE_KEY` | **fehlt** | Run 41011143637 `[v13-archive:keycheck]` → `SECRET_MISSING` |
| unabhängige Restore-Probe auf dem Runner | **nicht möglich** (setzt Upload und Secret voraus) | – |

**Eine dauerhafte Sicherung ist damit NICHT erreicht.** Erst Upload, `[v13-archive:verify]` und `[v13-archive:restore]` mit grünem Ergebnis gelten als Abschluss.

### 4.3 Blocker und Owner-Schritte (nur UI)

Ursache: Die Sitzungsumgebung erreicht `*.r2.cloudflarestorage.com` nicht. Es gibt keinen anderen autorisierten privaten Weg vom Container zum Runner. Der einzige Kanal wäre öffentlicher GitHub-Speicher (Git, Artefakte, Releases), und den hat der Owner ausgeschlossen.

1. **Netzwerk:** claude.ai/code → Umgebung dieser Sitzung (Menü im Sitzungstitel) → *Edit* → *Network access* → `*.r2.cloudflarestorage.com` zu den erlaubten Domains hinzufügen.
2. **Secret:** GitHub-Repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*:
   - Name: `V13_ARCHIVE_PRIVATE_KEY`;
   - Wert: vollständiger PEM-Inhalt der Archivschlüsseldatei, die der Owner aus dieser Sitzung bekommen hat (`archive-priv.pem`).
   
   Zusätzlich offline aufbewahren.
3. Danach dieser Sitzung (oder einer neuen, solange der Container besteht) schreiben: „R2 frei“. Ablauf:
   1. `[v13-archive:keycheck]`;
   2. `[v13-archive:put]`, dann `transfer.sh put`;
   3. `[v13-archive:verify]`;
   4. `[v13-archive:restore]` (unabhängig auf dem Runner);
   5. Ergebnis in der README eintragen.

**Wichtig:** Diese Schritte müssen geschehen, **bevor** der Container dieser Sitzung abgebaut wird. Das passiert beim Archivieren des Chats oder nach Inaktivität. Danach ist `archive-out/` verloren, und es bleibt nur 4.4.

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
| `v13-archive` und `secrets` | 11/11 |
| `verify-backtest-preview.py` | 16 Fälle, 0 Befunde |
| `core` auf `main` | 1 rot, DQ-SF8-8 (siehe 6.1) |

## 6. Offene Probleme und Freigaben

### 6.1 `core` rot auf `main` (blockiert den Merge von #1133)

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
- **Weg:** eine exakte, quellengebundene Freigabeliste je Änderung (Draft-PR, Branch `claude/sm130-approval-list-4ho3rd`). Sie ist gebunden an Versionen und `prevMasterSha256`. Zu klären sind dort die doppelte canonical_id, 83 wiederverwendete Ticker, 100 Deaktivierungen, 82 Eignungswechsel und 592 Namensänderungen.
- **Überschneidung:** #1136 (andere Sitzung) führt ebenfalls ein Freigabeschema 1.1.0 ein. Vor einem Merge ist ein Schema zu wählen.
- **Reihenfolge:**
  1. Review der Liste;
  2. eigene Owner-Freigabe;
  3. regulärer 1.3.0-Lauf;
  4. erst dann #1119.

### 6.3 Owner-Entscheidungen ohne Frist

- **Setup-OOS-Segmentierung** (Vorlage A1–A6), Ablage `kinds.SETUP_BACKTEST.oosSegmentation`. Ohne Entscheidung bleibt die Messung aus.
- **Strategy B1** (Research-Artefakt) und **Factor C1** (Rekonstruktionsscope).
- **Produktanzeige der Vorschau:** getrennte Entscheidung, heute nicht vorgesehen.

## 7. Nächste Prioritäten

1. **Archiv:** Owner-Schritte 4.3, dann Upload, Verify und Runner-Restore. Erst danach gilt die Sicherung als abgeschlossen.
2. **#1133:** nach grünem `core` mergen (genehmigt); dann die Basis von #1138 auf `main` umstellen.
3. **Security Master:** Review der Freigabeliste, mit #1136 abstimmen, Owner-Freigabe, 1.3.0-Lauf, dann #1119.
4. Owner-Entscheidungen aus 6.3, sobald gewünscht. Keine Normänderung ohne Freigabe.

## 8. Einstieg für eine neue Sitzung

1. `CLAUDE.md`, dann dieses Dokument.
2. Archiv: `docs/quant-recovery/v13/archive/README.md`; Werkzeuge `scripts/quant/v13/archive/` (`build-archive.sh`, `restore-archive.sh`, `presign.mjs`, `transfer.sh`, `r2-restore.mjs`); Workflow `.github/workflows/quant-v13-archive.yml` (Marken usage, put, get, verify, keycheck, restore; nur auf `claude/**`).
3. Backtests: `docs/quant/BACKTEST_ENGINEERING_HANDOVER_V1.md`, `BACKTEST_RUNNER.md`, `BACKTEST_RESULT_CONTRACT_V2.md`, `BACKTEST_PREVIEW.md`; Code `scripts/quant/research/backtest-runner.cjs`, `run-backtest.cjs`, `quant/api/backtest-research-adapter.js`, `quant/api/backtest-preview-service.cjs`.
4. Research-Befunde: `docs/quant-recovery/HANDOVER_V13.md`, `docs/quant-recovery/v13c/`.
5. Security Master: `scripts/market/security-master-refresh-gate.mjs`, PR #1119, Freigabelisten-PR, #1136.
6. Tests: siehe `CLAUDE.md`, Abschnitt Tests. Gezielt:
   ```bash
   node --test quant/tests/backtest-*.test.mjs quant/tests/v13-archive.test.mjs quant/tests/secrets.test.mjs
   ```

**Dauerregeln:**
- keine Frontend-Änderung, keine Produktaktivierung, `productionApproved=false`;
- keine Gate- oder Normänderung ohne eigenen PR mit Freigabe;
- keine Handänderung generierter Daten;
- private Daten und Schlüssel nie in Git, Logs oder öffentliche Artefakte.
