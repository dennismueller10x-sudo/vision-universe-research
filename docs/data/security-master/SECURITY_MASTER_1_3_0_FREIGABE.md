# Security Master 1.1.0 → 1.3.0: gebündelte Owner-Freigabe (Stand 02.11.2026)

**Noch nicht freigegeben. Nichts ist umgestellt.** Dieses Dokument ersetzt den Ablauf in [`V130_SWITCH_FREIGABE.md`](V130_SWITCH_FREIGABE.md) (Stoppregel „bytegleich `4d9a0e03…`“ ist überholt, siehe §3). Arbeitspaket H1 in [`docs/quant/QUANT_FINAL_HANDOVER.md`](../../quant/QUANT_FINAL_HANDOVER.md), Supertrader-Kriterium S6 in [`docs/SUPERTRADER_9_HANDOVER.md`](../../SUPERTRADER_9_HANDOVER.md). #1119 bleibt zurückgestellt.

Alle Zahlen unten stammen aus dem Probelauf **41400342624** (02.11.2026, 06:31 UTC, `commit=false`) und aus einer lokalen Simulation auf `main` @ `122f5d9d5` (alle sechs Stammdateien des Probelaufs im Arbeitsbaum, nie committet).

## 1. Frist und technischer Grund

| Quelle | `generatedAt` heute | Grenze | letzter zulässiger Lauftag (UTC) | STALE ab |
|---|---|---|---|---|
| Stamm `us-security-master.json` | 2026-09-11T14:43:20.305Z | 60 Tage | **Di 10.11.2026** | **Mi 11.11.2026** |
| Firmennamen `company-names.json` | 2026-10-11T05:41:17.821Z | 45 Tage | Mi 25.11.2026 | Do 26.11.2026 |

**Grund im Code** (`scripts/supertrader/source-faithful/product/input-gate.mjs`):
- Zeile 37: `AUX_MAX_AGE_DAYS = { weeklyLong: 10, continuity: 10, sic: 10, names: 45, master: 60 }`.
- Zeilen 46–47: `ageDays = (Date.parse(`${today}T00:00:00Z`) - Date.parse(generatedAt)) / 864e5`, STALE bei `ageDays > maxDays` (echt größer).
- `today` ist das UTC-Datum des Laufs (`heute="$(date -u +%F)"`, `.github/workflows/supertrader-sf8-candidates.yml` Zeile 96), gemessen ab 00:00 UTC. Am 10.11. ist der Stamm 59,39 Tage alt (CURRENT), am 11.11. 60,39 Tage (STALE).
- Folge: `build-candidates.mjs --require-current` bricht mit **Exit 3** ab (Zeile 178). Der Kandidatenlauf läuft per Zeitplan Di–Sa um 11:43 UTC (`cron: '43 11 * * 2-6'`). Der erste blockierte Lauf wäre **Mi 11.11.2026, 11:43 UTC**.

**Harte Frist:** Der neue Stamm muss vor Mi 11.11.2026, 11:43 UTC auf `main` stehen. **Geplante Frist:** produktiver Lauf spätestens Mo 09.11.2026, damit ein Tag für eine Wiederholung bleibt (§4, Abbruchkriterien).

**Nachweis (lokal, nur lesend):** `node scripts/market/security-master-switch-preflight.mjs --deadline --today 2026-11-02` ruft dieselbe Funktion `staleAuxiliary` auf:
```
[frist] master: generatedAt 2026-09-11T14:43:20.305Z, max. 60 Tage → letzter CURRENT-Lauftag 2026-11-10, STALE ab 2026-11-11 (heute CURRENT)
[frist] names: generatedAt 2026-10-11T05:41:17.821Z, max. 45 Tage → letzter CURRENT-Lauftag 2026-11-25, STALE ab 2026-11-26 (heute CURRENT)
```
Direkt mit `staleAuxiliary(root, d)`: am 10.11. keine Meldung für `master`, am 11.11. `{"source":"master","generatedAt":"2026-09-11T14:43:20.305Z","maxDays":60}`. Test SMP-1/2 hält das fest.

**Nach dem Wechsel:** Der Workflow stempelt `--stamp "${heute}T00:00:00Z"`. Ein Lauf am Tag T gilt bis T+60 einschließlich (Lauf am 10.11. → gültig bis 09.01.2027, SMP-2). Der Wechsel committet auch die Firmennamen und löst damit die Namensfrist (26.11.) mit.

**Weitere Konsumenten mit Altersgrenzen:**

| Konsument | Regel | Wirkung |
|---|---|---|
| Statusseite `/status/`, `scripts/core/system-health.mjs` (`core/registry/domains.json`, `usSecurityMaster`) | `staleAfter` 1440 h, `warnAfter` 240 h, `ageHours > staleAfter` (`core/health.js` Zeile 192) | heute DEGRADED, **STALE ab 10.11.2026, 14:43 UTC**. Nach dem Wechsel OK (simuliert: „OK, 12,5 h alt, 8055 Datensätze“) |
| Statusseite, `companyNames` | `staleAfter` 2160 h | STALE erst ab 09.01.2027 |
| Statusseite, `securityMaster` = `eligibility.json` (critical) | `staleAfter` 840 h | **schon STALE seit 20.10.2026** (Stand 15.09.). Eigener Erzeuger `build-us-eligibility.mjs`, manuell. Der Wechsel ändert das nicht. Eigene Owner-Entscheidung |
| DQ-Regeln (`core/data-quality.js`, `scripts/core/data-quality.mjs`) | keine Altersgrenze, nur Inhalt (DQ-ID-4, DQ-PX-6/7) | siehe §5 |

## 2. Probelauf

| Lauf | Zeit (UTC) | Folgestand sha256 | Anbieterzeilen | Gate mit Liste von `main` (`0a72def6…`) |
|---|---|---|---|---|
| 41285528656 | 01.11. 07:37 | `4d9a0e039c4e9431…` | 109.176 | PASS, kein ungenutzter Eintrag |
| **41400342624** | 02.11. 06:31 | **`f10b1c25f2c1ac9d…`** | 109.195 | PASS · COMMIT, **3 ungenutzte Namen**, gezählt: canonical_id 24/25, Deaktivierungen 20/50, Eignung 17/50, Typ 1/25, Namen 5/200 |
| lokal, gleiche Befehle wie der Workflow | 02.11. 11:44 | `0850e1ebfc4fc399…` | 109.198 | PASS · COMMIT, kein ungenutzter Eintrag, Namen 1/200 |

**Lokal ausführbar ohne Secrets.** Beide Abrufe sind offen: Tiingo `supported_tickers.zip` (ohne Schlüssel) und SEC `company_tickers_exchange.json` (User-Agent). Ausgeführt wurden die Workflow-Schritte in derselben Reihenfolge:
- Engine-Tests 73/0;
- `build-us-security-master.mjs --require-provider --today 2026-11-02 --stamp 2026-11-02T00:00:00Z --out <scratch>`;
- `build-company-names.mjs --sec` (schreibt in den Arbeitsbaum, danach kopiert und mit `git restore` zurückgesetzt);
- `security-master-refresh-gate.mjs` mit `--allow-version-change --approved-changes`.

**Der Folgestand ist nicht einmal innerhalb eines Tages stabil:**
- Lokal und CI unterscheiden sich in einer Stammzeile: MGPI, Anbieter-Enddatum `2026-10-30` → `null`. Dazu kommen 3 weitere Anbieterzeilen außerhalb des Bestands. Zwischen 06:31 und 11:44 UTC hat sich die Anbieterliste bewegt.
- `workingStore.file` trägt den absoluten Arbeitspfad. Lokal und in CI ist deshalb nie bytegleich. Zwei CI-Läufe haben denselben Pfad (`/home/runner/work/_temp/sm-work/…`).
- Der Namensschritt holt die SEC-Liste live. Unterschiede:
  - CI um 06:31: Umfirmierungen LRHC, MSGS, SLMT und UUU, ohne Namen für ASTLW und SEATW, WKEY unverändert;
  - lokal um 11:45: umgekehrt.
  - Die lokal abgerufene Datei war bytegleich mit der vom 01.11. (`76b92fba…`).

**Folge:** Freigabeliste, Probelauf und `commit=true` gehören auf denselben Tag. Der letzte Probelauf und der produktive Lauf müssen **unmittelbar nacheinander** laufen (§4, Schritte 4–5).

## 3. Freigabeliste neu erzeugt (02.11.2026)

Befehl, Eingaben wie bei der Liste vom 01.11.:
- Delisting-Register #1119 @`4f16be7`;
- Belegregister `quant/config/security-master-canonical-change-evidence.json` (`7f09edbf…`);
- SEC-Liste `76b92fba…`;
- Basis `v130-approved-changes.json`.

```bash
node scripts/market/build-security-master-approval-list.mjs \
  --gate-report <art>/_temp/sm-gate.json --prev <sm-prev> --next <art>/_temp/sm-next \
  --prev-names <sm-prev>/company-names.json --next-names <art>/…/quant/data/market/security-master/company-names.json \
  --base-approval docs/data/security-master/v130-approved-changes.json \
  --sec <company_tickers_exchange.json> --sec-as-of 2026-11-02 \
  --delisting-register <#1119 @4f16be7 quant/config/security-master-delisting-evidence.json> \
  --delisting-register-ref "PR #1119 @4f16be7 quant/config/security-master-delisting-evidence.json" \
  --canonical-evidence quant/config/security-master-canonical-change-evidence.json \
  --out <scratch>/approval.json --classification-out <scratch>/class.json --markdown-out <scratch>/lists.md
```

**Vergleich mit der Liste auf `main`/#1240** (`v130-approved-changes-1.1.0.json`, sha256 `0a72def6…`, Quelllauf 41285528656):

| Kategorie | `main` (01.11.) | neu aus 41400342624 (sha256 `8c456be3…`) | Unterschied |
|---|---:|---:|---|
| canonical_id | 64 | 64 | keiner |
| Instrumenttyp | 147 | 147 | keiner |
| Deaktivierungen | 96 | 100 | **+4**: DBRG_P_H (`WITH_CANONICAL_CHANGE:HISTORICAL_ROW_DROPPED`), DBRG_P_I, DBRG_P_J, VACI (je `PROVIDER_ENDDATE_RESTATED`) |
| Eignungswechsel | 211 | 212 | **+1**: VACI (folgt aus der Deaktivierung) |
| Namen | 592 | 593 | **−3** ASTLW, SEATW, WKEY; **+4** LRHC, MSGS, SLMT, UUU (`RENAMED_SAME_CIK_SEC`) |
| Ticker, doppelte canonical_id | 0 | 0 | keiner |

Keine Streichung außer den drei Namen, die in diesem Lauf nicht vorkommen. Die lokal erzeugte Liste aus dem 11:44-Stand (`bd16e094…`) ist gleich, bis auf die Namen: Dort gilt der Namensstand vom 01.11.

**Gate gegen den Probelauf 41400342624 mit der neuen Liste:** PASS · COMMIT, **kein ungenutzter Eintrag**. Gezählt (Grenzen unverändert):
- canonical_id **24/25**;
- Deaktivierungen 16/50;
- Eignung 16/50;
- Typ 1/25;
- Namen 1/200 (XRPN, CIK-Wechsel);
- neue Doppelungen 0.

**Nicht freigabefähig, zählen weiter gegen die Grenze:**
- canonical_id (24): 15 `PROVIDER_HISTORY_RESTARTED`, 5 `TWO_ACTIVE_LISTINGS`, APAD `EXCHANGE_TRANSFER`, CAM `UNCLEAR_REPLACEMENT`, TRT `EXCHANGE_LABEL_RENAMED`, TRUE `START_DATE_RESTATED`;
- Deaktivierungen (16): die 13 Ticker-Wiederverwendungen sowie FGNX, FGNXP und RITR.

**Risiko:** Der Spielraum bei canonical_id beträgt einen Eintrag. Ein weiterer nicht belegbarer Neubeginn beim Anbieter blockiert das Gate (fail closed). Dann gilt Schritt 2, Abbruch.

Die neue Liste wird **nicht** in diesem PR committet. Sie ist am Lauftag schon wieder veraltet. Sie entsteht am Lauftag neu (§4, Schritt 2) und kommt mit einem eigenen PR auf `main`, denn der Workflow liest sie aus dem Checkout von `main`.

## 4. Gebündelte Owner-Freigabe: Ausführungsreihenfolge

**Lauftag T** = ein Werktag, spätestens **Mo 09.11.2026** (harte Grenze Mi 11.11., 11:43 UTC). Start nach den Nachtläufen, gegen **07:00 UTC**. Bis zum SF8-Lauf um 11:43 UTC muss alles erledigt sein. `security-master-weekly` und `market-data-refresh` teilen die Concurrency-Gruppe `market-data-main`. Sie laufen also nie parallel. Vorsicht: GitHub hält je Gruppe nur **eine** wartende Anfrage, eine neuere verdrängt die ältere. Jeden Lauf daher erst starten, wenn der vorige beendet ist und kein Lauf dieser Gruppe läuft. Das gilt besonders für P2 → C und C → Marktdaten.

**Vorbedingung (vor T):** #1240 ist gemergt.
- Dieser PR bringt die Prüfhilfe `security-master-switch-preflight.mjs` und die Testkorrektur `v10-population` (§5).
- Ohne die Korrektur wird die Quant-Suite nach dem Wechsel rot.
- Kein offener PR ändert die sechs Stammdateien. #1119 bleibt zu.

| Nr. | Wer | Aktion (Workflow, Eingaben) | Prüfung danach | Abbruchkriterium → Schritt |
|---|---|---|---|---|
| 1 | zentrale Entwicklung | Probelauf P1: `security-master-weekly.yml` auf `main`, `commit=false`, `allow_version_change=true`, `approved_changes=true` | Lauf grün; Artefakt `security-master-weekly-<P1>` geladen | Lauf rot oder Gate BLOCKED aus anderem Grund als einer veralteten Liste → **Stopp**, Ursache klären, kein weiterer Schritt |
| 2 | zentrale Entwicklung | Liste aus P1 neu erzeugen (Befehl §3). Lokal das Gate mit der neuen Liste gegen P1 prüfen. `preflight --gate-report <lokaler Bericht>` | PASS · COMMIT, kein ungenutzter Eintrag, gezählt ≤ Grenzen | canonical_id gezählt > 25, neue doppelte canonical_id oder sonstiger G-Fehler → **Stopp**. Neue Einträge nur mit Beleg und eigener Owner-Entscheidung, Grenzen bleiben |
| 3 | zentrale Entwicklung → **Owner merged** | Listen-PR:<br>• `v130-approved-changes-1.1.0.json`;<br>• SMA-7 in `quant/tests/security-master-approval-v110.test.mjs` (`sourceRun.runId` = P1);<br>• `V130_APPROVAL_LISTS_RUN_<P1>.md` | CI grün; Diff gegen die vorige Liste im PR-Text | CI rot → beheben, nicht mergen |
| 4 | zentrale Entwicklung | Probelauf P2 sofort nach dem Merge, gleiche Eingaben wie 1. `preflight --gate-report <P2>/_temp/sm-gate.json` | „erfüllt“: PASS · COMMIT, 1.1.0 → 1.3.0, **kein ungenutzter Eintrag** | nicht erfüllt → zurück zu 2 (am selben Tag möglich); nach 14:00 UTC auf den nächsten Werktag |
| 5 | **Owner** | Produktiver Lauf C **direkt nach P2**: `security-master-weekly.yml` auf `main`, `commit=true`, `allow_version_change=true`, `approved_changes=true` | Lauf grün; Commit von `vision-universe-bot` „Security Master + Firmennamen: Stand T us-security-master-1.3.0“ mit genau den sechs Dateien. `preflight --compare <P2>/_temp/sm-next/us-security-master.json <C>/_temp/sm-next/us-security-master.json` → **bytegleich**. `preflight --gate-report <C>` erfüllt | Gate BLOCKED → nichts committet, zurück zu 4. Committet, aber **nicht bytegleich** oder Bericht nicht erfüllt → **Rücknahme R1**, dann ab 1 am nächsten Werktag (nur vor der Frist) |
| 6 | Owner (oder zentrale Entwicklung mit dieser Freigabe) | Sofort danach: `market-data-refresh.yml` auf `main`, manuell, `initial=false` | Lauf grün; Discover-Commit. NM3 und „Erzeugerbesitz 485“ grün. Discover zeigt für EDVA „Endovia Health Sciences“ | Lauf rot → nicht zurücknehmen. Log prüfen, Lauf wiederholen. Der Nachtlauf (22:30 UTC) baut ebenfalls neu. Bis dahin bleiben NM3 und 485 rot und die Namen alt |
| 7 | zentrale Entwicklung | Nachprüfung auf `main` HEAD:<br>• volle Suiten (CLAUDE.md) und `check-test-isolation.mjs`;<br>• `preflight --deadline`;<br>• `system-health.mjs`;<br>• SF8-Lauf 11:43 UTC | Suiten wie §5. Frist zeigt `master` STALE erst ab T+60. US-Wertpapierstamm OK. SF8-Eingangsprüfung CURRENT | Ein neuer, vom Stamm verursachter Fehler, den §5 nicht vorhersagt → **Rücknahme R1/R2** nach Owner-Entscheidung |
| 8 | zentrale Entwicklung → **Owner merged** | Generations-PR:<br>• Eintrag `us-security-master-1.3.0` in `quant/config/security-master-generations.json` mit sha256, Bytes und `gitBlob` aus `git rev-parse <C>:quant/data/market/security-master/us-security-master.json`, dazu `generatedAt`, Zeilen 8055, `frozenAt` T;<br>• `node scripts/quant/pin-security-master-generation.cjs --generation us-security-master-1.3.0 --commit <C>`, danach `--check`;<br>• `researchEvidenceDefault` bleibt 1.1.0 | MG-1…6, SMF, MCH grün. Die Kopie 1.1.0 ist unverändert (`--generation us-security-master-1.1.0 --check` → `ALREADY_PINNED`) | Hash oder Blob passt nicht → Pin bricht ab (`…_MISMATCH`), nicht mergen |
| 9 | Owner | Folgeentscheidungen:<br>• S6-Nachweis (Supertrader) mit den Lauf-IDs P2, C und SF8;<br>• #1119;<br>• optional H7 (Katalog-Generation 2) | – | – |

**Freigabetext (vom Owner zu erteilen):**
> „Ich gebe für den Lauftag <Datum, spätestens 09.11.2026> die Schritte 1–8 aus `docs/data/security-master/SECURITY_MASTER_1_3_0_FREIGABE.md` §4 frei. Ausdrücklich freigegeben sind: den Listen-PR (Schritt 3) und den Generations-PR (Schritt 8) mergen; `security-master-weekly.yml` mit `commit=true`, `allow_version_change=true`, `approved_changes=true` (Schritt 5); `market-data-refresh.yml` manuell (Schritt 6). Bedingungen:
> - Am selben Tag Probelauf, neu erzeugte Liste und Gate PASS bei unveränderten Grenzen, ohne ungenutzten Eintrag.
> - Der produktive Folgestand ist bytegleich mit dem des unmittelbar vorangehenden Probelaufs.
> - Bei jedem Abbruchkriterium gilt die dort genannte Rücknahme.“

## 5. Auswirkungen je Produktwelt (Simulation 02.11.2026)

**Basis:** `main` @ `122f5d9d5` + dieser PR, Stamm 1.1.0. **Kandidat:** die sechs Dateien aus 41400342624, danach Discover-Neubau wie `market-data-refresh.yml`:
- `build-discover-data`;
- `verify-discover-data`: 97.531 Prüfungen ohne Abweichung;
- `build-capability-matrix`;
- `vu2/build-product-capabilities`.

| Welt | Basis (1.1.0) | Kandidat (1.3.0 + Discover-Neubau) | Änderungen |
|---|---|---|---|
| **Identität** (Stamm) | 8.021 Zeilen, 7.803 securityIds | 8.055 Zeilen, 7.803 securityIds | **0 neue, 0 entfallene securityIds**, 0 Tickerwechsel, 0 neue doppelte canonical_id (6 bestehende bleiben).<br>• canonical_id: 88 (89 IDs mit geändertem Zeilensatz), davon 64 freigegeben.<br>• Instrumenttyp: 148.<br>• aktiv → inaktiv: 116.<br>• Eignung true → false: 228, false → true: 0.<br>• IDs mit mehr als einer Zeile: 239 |
| Ticker-Wiederverwendung, Quarantäne | 13 IDs aktiv und geeignet | alle 13 INACTIVE, nicht geeignet | Produktuniversum unverändert: die 13 sind dort schon ausgeschlossen (`identityQuarantined` 13) |
| Produktuniversum (`eligibility.json`) | 6.686 | 6.686 | unverändert, eigener Erzeuger. Namensabdeckung 6.666/6.686 |
| **Discover** | – | 270 Dateien neu gebaut | **nur Namen**, keine Rang- oder Kennzahländerung:<br>• 263 Aktienseiten: 18 mit eigenem neuen Namen (`companyName`, `legalName`, `nameSource`), die übrigen über Vergleichskarten;<br>• Suche: 2 Dateien;<br>• Reihen: 3;<br>• Startseite: 1;<br>• `meta.json`. |
| Discover-Suite | 581/0 | vor dem Neubau 579/2 (NM3, 485, erwartet), danach grün | Schritt 6 ist Pflicht |
| Capabilities (Market, vu2) | – | je 2 Dateien | nur Begründungen: `NO_CIK` 1.346 → 1.131, `NOT_IN_COMPANYFACTS` 124 → 339 (SEC-CIKs aus den neuen Namen) |
| **Supertrader** SF8 | 3.368 Kandidaten (2.103 / 1.188 / 77), Stand 30.10., Eingangsprüfung CURRENT | **3.368, gleich verteilt** | 4 von 525 Dateien: nur der Name Armada Acquisition Corp II → Evernorth Holdings.<br>Im SF8-Universum (6.103):<br>• 11 Typwechsel EQUITY_COMMON → ETF (Ticker-Wiederverwendungen AAAP, ABI, ANV, CAM, COOL, DINE, LMNX, LQ, PCS, PTNT, VOLT);<br>• 39 neue Listing-Anfänge;<br>• 0 Aktivstatus;<br>• 18 Namen.<br>Kein Einfluss auf die Kandidaten zum 30.10. |
| **Quant** | 3.857/0 | 3.858/2 → nach Korrektur und vu2-Neubau grün | (1) `product-capabilities` „committed projection is reproducible“: rot, wenn nur die Market-Matrix neu gebaut ist. `market-data-refresh` baut beide (Schritt 6).<br>(2) `v10-population` „listingLifecycleEvidence … everything else unchanged“: verglich den 1.1.0-gebundenen Evidenz-Loader mit dem Produkt-Adapter (`LIVE`). Nach dem Wechsel unterscheiden sie sich nur in `masterVersion`, `masterGeneratedAt` und `identityHash`. **Korrektur in diesem PR:** Der Vergleich läuft auf derselben Generation (`LIVE`), wie es `SECURITY_MASTER_GENERATIONS.md` verlangt. Auf 1.1.0 und auf 1.3.0 grün |
| Research-Loader, Freezes | 1.1.0 | 1.1.0 | unverändert: SMF-1…8, MG-1…6 und MCH im Kandidaten grün (38/0 mit Artefakttests) |
| Survivorship-Kontrolle, Emerging Leaders | – | – | eigene Erzeuger, beim Wechsel nicht neu gebaut, keine Änderung |
| **Core** | 308/0 | 308/0 | – |
| DQ (`data-quality.mjs`) | DQ-ID-4 112, DQ-PX-6 456, DQ-PX-7 349 (WARN) | DQ-ID-4 **60**, DQ-PX-6 442, DQ-PX-7 342 | weniger Widersprüche zwischen Stamm und Reihen |
| Statusseite | US-Wertpapierstamm DEGRADED (1.245 h) | OK | `eligibility.json` bleibt STALE (§1) |
| **Technical** | 61/0 | 61/0 | – |
| Discover + Supertrader + Screener (eine Suite) | 1.641/0 | 1.641/0 nach dem Neubau | – |
| Python Quant | 588 OK | 588 OK | – |

## 6. Eingefrorene Stände unverändert (Nachweis)

- `git diff origin/main -- docs/quant-recovery quant/frozen docs/quant/backtest-catalog docs/data/security-master/v130-quant-freeze.json quant/config/security-master-generations.json` ist auf diesem PR leer.
- `pin-security-master-generation.cjs --generation us-security-master-1.1.0 --check` → `ALREADY_PINNED`, sha256 `26c82617…6498332`. Das ist bytegleich mit dem heutigen Produktstamm.
- `export-backtest-review-bundle.cjs --check` → ok, `bundleHash aefb5942…`, 21 Einträge. Backtest-Tests (Worker, Konto) 16/0.
- **Probe Generationseintrag 1.3.0** in einem Wegwerf-Root, mit dem Kandidaten `f10b1c25…`, 9.714.501 Bytes, Blob `b1bddbc6…`:
  - `pin` → `PINNED`, zweiter Aufruf → `ALREADY_PINNED`;
  - `resolve('us-security-master-1.3.0')` lädt mit passendem Hash.
  - Am Lauftag gelten die Werte des Commits C, nicht diese.

## 7. Rücknahme

| Fall | Schritte | Prüfung |
|---|---|---|
| **R1**: vor Schritt 6 (Discover noch alt) | PR mit `git revert <C>`, Owner merged. Der Revert stellt die sechs Dateien bytegleich wieder her | `sha256sum quant/data/market/security-master/us-security-master.json` = `26c82617…`; volle Suiten |
| **R2**: nach Schritt 6 | wie R1, danach `market-data-refresh.yml` manuell. Den Discover-Commit **nicht** reverten: Er ist ein Erzeuger-Artefakt, der Neubau stellt die alten Namen her | NM3 und 485 grün |
| Generation (Schritt 8 schon gemergt) | Der Eintrag bleibt, Einträge werden nie entfernt. `researchEvidenceDefault` war und bleibt 1.1.0 | MG-1…6 |

- **Was die Rücknahme nicht berührt:**
  - die eingefrorene Kopie `quant/frozen/security-master/us-security-master-1.1.0.json`;
  - die Research-Loader (lesen immer 1.1.0);
  - Katalog-Generation 1 und das Vorschau-Bundle.
- **Echter Revert, lokal auf einem Wegwerfzweig (nie gepusht):**
  - Die sechs Dateien aus 41400342624 als Commit, dann `git revert --no-edit HEAD`.
  - Ergebnis: Baum `b098fa02…`, **identisch** mit dem Baum vor der Übernahme. Der Stamm hat wieder `26c82617…`.
- **Lokal geprüft (Simulation):** Nach `git restore` der sechs Dateien und der Discover-, Capability- und vu2-Dateien:
  - der Arbeitsbaum ist sauber, der Stamm wieder `26c82617…`;
  - die Basis-Suiten sind grün (§5: Quant 3.857/0, Core 308/0, Discover/Supertrader/Screener 1.641/0, Technical 61/0, Python OK);
  - `v10-population` und NM3 sind auch nach der Korrektur auf 1.1.0 grün.
- **Folge einer Rücknahme nach dem 10.11.:** Der alte Stamm ist für die SF8-Eingangsprüfung STALE. Jeder Kandidatenlauf endet mit Exit 3 und Alarm, bis ein neuer Wechsel gelingt. Deshalb ist der geplante Lauftag spätestens der 09.11.

## 8. Hilfsmittel

`scripts/market/security-master-switch-preflight.mjs`:
- nur lesend, kein Netz, schreibt nur nach `--out` außerhalb des Repositorys;
- Tests SMP-1…5 in `quant/tests/security-master-switch-preflight.test.mjs`;
- `--deadline`: Frist mit der Funktion der Eingangsprüfung;
- `--compare <probe> <produktiv>`: Bytegleichheit, sonst Zeilen- und Kopfabweichungen;
- `--gate-report <sm-gate.json>`: PASS · COMMIT, Versionssprung, kein ungenutzter Eintrag, Grenzen aus dem Gate selbst.
