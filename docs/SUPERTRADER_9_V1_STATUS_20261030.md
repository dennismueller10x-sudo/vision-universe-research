# Supertrader 9 – V1-Stabilität S1–S7, Stand 30.10.2026 ~06:00 UTC

Grundlage: Kriterien **unverändert** aus `docs/SUPERTRADER_8_ACTIVATION_READINESS.md` (Freigabeschwelle V1, Basis 1527253) und Vorstand `docs/SUPERTRADER_8_V1_STATUS_20261029.md` (Draft #1099, per `git show FETCH_HEAD`).
Belege: nur echte GitHub-Actions-Läufe (gelesen, nichts ausgelöst) und lokale Messung auf `main`-Stand 533f788 (Refresh-Commit vom 30.10., 03:37 UTC). Lokale Berichte (`system-health.mjs`, `data-quality.mjs`, `diagnose.mjs`) wurden nur außerhalb des Repositorys geschrieben.

**Ergebnis: V1 nicht erfüllt.** S3 erfüllt; S1, S2, S4 offen; S5 offen und ohne #1098 am 02.11. sicher rot; S6 und S7 nicht erfüllt. Neu seit 29.10.: S7 ist mit veröffentlichtem SF8-Einmalstand und ohne Tageslauf **strukturell** nicht erfüllbar (DQ-SF8-8, siehe c/d).

---

## (a) S1–S7

| # | Kriterium (Kurzform, unverändert) | Belege | Status | Frühestens erfüllt |
|---|---|---|---|---|
| S1 | 5 aufeinanderfolgende geplante Nachtläufe `market-data-refresh.yml` auf `main` nach 1527253 grün (`refresh`, `materialize`, `freshness-contract`), je ein Materialize-Commit, Rückstand 0 | 40615548056 (28.10.) **rot** → Zähler auf 0. 40803128385 (29.10.) grün: alle 7 Jobs success, `supertrader-prune` skipped, Commits 7f8378e/94d7b46 → **1**. 40989532165 (30.10., Start 02:04): `refresh` success (Commit 533f788), `materialize` **läuft noch** (Checkout 03:44→05:57 = 2 h 12 min; 29.10.: 3 min 50 s), Timeout 300 min → spätestens 08:44 UTC | **OFFEN – 1 von 5** (2 von 5, falls 40989532165 grün endet) | Lauf ~04.11. (Kette 30.10., 31.10. [Fr-Sitzung], 03.11. [Mo-Sitzung], 04.11.) |
| S2 | in diesen Läufen kein Heil-Dispatch | Letzter manueller Materialisierungslauf 40459929703 (27.10., vor dem Zählfenster). Seitdem kein `workflow_dispatch` von `product-intelligence-materialization.yml` oder `market-data-refresh.yml` auf `main` | **OFFEN** (1/1 ohne Eingriff) | mit S1 |
| S3 | `supertrader-prune` real gelaufen **oder** Fall nicht eingetreten; NL5 grün | 40615548056: `refresh` rot → `prune` skipped (vorgesehen); 40803128385: alles grün → skipped. Fall „refresh grün, materialize/Frischevertrag rot“ nicht eingetreten | **ERFÜLLT** (unverändert seit 29.10.) | – |
| S4 | Wochenreihen-Reparatur grün + ein Samstags-Volllauf grün; SPY an jedem Lauftag auf letzter Sitzung; SIC/Kontinuität nächtlich frisch | `long-series.yml` geplant: 40484210549 (27.10.), 40673869702 (28.10.), **40861589300 (29.10., Reparatur ENLV/NUWE/PARA/SCAG, Commit f8114f6 „requested 4, written 4“)** grün. Reparatur 30.10. (cron 04:20) um 06:00 noch nicht gestartet. Samstag-Volllauf 31.10. ausstehend. SPY.json letzter Punkt 2026-10-29 (= letzte Sitzung). Kontinuität `generatedAt` 2026-10-30T03:13:19Z, SIC-Taxonomie 2026-10-30T03:13:57Z (frisch). Aber: DQ-PX-4 heute wieder ERROR (ATYR/AXG/OMEX, siehe c) | **OFFEN** | 31.10. (wenn Reparatur 30.10. ATYR/AXG/OMEX heilt und Volllauf 31.10. grün) |
| S5 | 2 aufeinanderfolgende **geplante** Montagsläufe SEC-Consumer grün | 40339879235 (26.10., schedule) grün = 1. Danach drei Bot-Dispatches rot: 40570986935 (27.10.), 40758243298 (28.10.), **40943676672 (29.10.)** – identische 3 Fehler (s. b). #1098 ist **Draft, nicht gemergt**; auf `origin/main` steht weiter `check-test-isolation.mjs:89 … .toString()` und die alte Erwartung in `quarterly-delivery.test.mjs:54ff.` → Fix weiter nötig | **OFFEN – 1 von 2**; Lauf Mo 02.11. 07:30 UTC scheitert ohne #1098 sicher | 02.11., nur wenn #1098 vorher gemergt ist; sonst frühestens 09.11. und dann nur mit neuer Zählung ab einem grünen Montagslauf |
| S6 | Security Master/Firmennamen: Erzeuger mit Zeitplan oder Owner-Turnus; Alter ≥ 14 Tage unter Grenze (60/45 Tage) | `us-security-master.json` `generatedAt` 2026-09-11T14:43:20Z = **48,6 Tage** (Puffergrenze 46 seit 27.10. überschritten). `security-master-weekly.yml`: Zeitplan auskommentiert (Zeile 12), **erster Lauf 40942100928 (29.10., dispatch mit allow_version_change+approved_changes) rot**: Refresh-Gate BLOCKED (G6, G7, G9, s. b). Firmennamen 2026-10-11T05:41Z = 19 Tage (Puffer ≤ 31 bis 11.11.). Eingangsprüfung `AUX_MAX_AGE_DAYS.master = 60` (`scripts/supertrader/source-faithful/product/input-gate.mjs:37`): 10.11. 59,4 Tage CURRENT, **ab Laufdatum 11.11.2026 STALE (Exit 3)**; Namen ab 26.11.2026 STALE | **NICHT ERFÜLLT** | erst nach Owner-Entscheidung zum Gate-Befund und einem grünen Erneuerungslauf; spätestens vor 11.11. |
| S7 | `system-health` OK für SF8-Eingaben; `data-quality` ohne ERROR; DQ-PX-2/PX-3 ≤ Niveau 27.10. | `data-quality` **FAIL**: ERROR DQ-PX-4 3/6188 (ATYR, AXG, OMEX), ERROR DQ-TW-3 2/5657 (ATYR, OMEX), **ERROR DQ-SF8-8 3225/3225**. DQ-PX-2 **104** (27.10.: 93 → über Niveau), DQ-PX-3 300 (≤ 302). `system-health` STALE: Security Master STALE (1080 h), US-Wertpapierstamm DEGRADED (1167 h), Supertrader und SF8-Kandidaten DEGRADED `BEHIND_1_SESSIONS` (Fenster vor Materialisierung) | **NICHT ERFÜLLT** | offen: PX-4/TW-3 nach Reparatur 30.10. + Materialisierung + `technical-world.yml`; DQ-SF8-8 nicht ohne neuen SF8-Stand am selben Tag (s. d/e); Security Master nach S6 |

---

## (b) Laufübersicht seit 20.10. (`main`)

### `market-data-refresh.yml` (nur `schedule` zählt; Jobs refresh/materialize/freshness-contract/imblick/supertrader/supertrader-prune/alarm)

| Lauf | created_at (UTC) | Sitzung | Ergebnis | Bemerkung |
|---|---|---|---|---|
| 39351739842 | 20.10. 01:08 | 19.10. | success | vor Schwelle |
| 39523081393 | 21.10. 00:43 | 20.10. | success | vor Schwelle |
| 39701728271 | 22.10. 00:46 | 21.10. | success | vor Schwelle (SPY 1 Sitzung zurück, #841) |
| 39880198476 | 23.10. 00:47 | 22.10. | success | vor Schwelle |
| 40047253956 | 24.10. 00:54 | 23.10. | success | vor Schwelle |
| 40433301246 | 27.10. 01:33 | 26.10. | **failure** | vor Schwelle; `product-services.test.mjs:155` (NVDA-Momentum), behoben #988; Heil-Dispatch 40459929703 |
| 40615548056 | 28.10. 01:31 | 27.10. | **failure** | `refresh` › `verify-discover-data.mjs`: „thema-immobilien-reits.json: CUBE Klartext-Zahl weicht ab“; behoben #1044 (5b29a10). Zählt als Rücksetzung |
| 40803128385 | 29.10. 01:53 | 28.10. | success | alle Jobs grün, prune skipped, Ende 04:07 → **S1 = 1** |
| 40989532165 | 30.10. 02:04 | 29.10. | **in_progress** | refresh success (03:44), materialize Checkout 2 h 12 min, danach Preflight ab 05:57 |

Planabweichung: Zeitplan 22:30 UTC, Start 01:31–02:04 (3–3,5 h später).

### Nebenläufe

| Workflow | Lauf | Event | created_at | Ergebnis | Ursache bei Rot |
|---|---|---|---|---|---|
| sec-consumer-fundamentals | 40339879235 | schedule | 26.10. 14:27 | success | – |
| | 40381821158 / 40372794847 | dispatch | 26.10. | success | – |
| | 40570986935 | dispatch (Bot) | 27.10. 19:38 | failure | `research-validation-runner.test.mjs` 2× `ERR_STRING_TOO_LONG` (`check-test-isolation.mjs:89`) |
| | 40758243298 | dispatch (Bot) | 28.10. 19:52 | failure | dieselben 2 + `quarterly-delivery.test.mjs:54` |
| | **40943676672** | dispatch (Bot) | 29.10. 19:50 | failure | **3 fails / 3566**: Test 1729 `quarterly-delivery.test.mjs:54` (erwartet Zukunftsperioden-Aktienzahlen, Erzeuger quarantäniert sie seit #1043), Tests 2105/2106 `research-validation-runner.test.mjs:4` → `check-test-isolation.mjs:89` `Uint8Array.toString` `ERR_STRING_TOO_LONG` (Diff > 0x1fffffe8 Zeichen). Exakt das, was #1098 behebt |
| security-master-weekly | **40942100928** | dispatch | 29.10. 19:39 | failure | `security-master-refresh-gate.mjs` BLOCKED (Exit 4): G6 1 neue doppelte canonical_id (`tiingo:NYSE:OKE:1985-07-01`); G7 83 canonical_id-Wechsel (Grenze 25), 100 aktiv→inaktiv (Grenze 50), 82 Eignungswechsel (Grenze 50, ohne freigegebene); G9 592 Namenswechsel (Grenze 200). Alter 48 Tage. Gate-Bericht als Artefakt 12926603614 (30 Tage) |
| supertrader-signals | 39415648368, 39594232570, 39773296154, 39947052626, 40087820695, 40501225836, 40691034906, **40877490425 (29.10. 12:56)** | schedule | | alle success | – |
| | 39536889527, 39892340699, 40056863620, **40815826979 (29.10. 04:06)** | dispatch (Kette) | | alle success | – |
| supertrader-sf8-candidates | 40872236517, 40877312755, 40882429926, 40922298713 | dispatch | 29.10. 12:18–17:32 | skipped | Variable/Bedingung nicht erfüllt |
| | **40924915352** | dispatch | 29.10. 17:49 | success | Commit 3e7fc17 „Research-Kandidaten (Stand 2026-10-28, nicht freigeschaltet)“, 3.225 Kandidaten |
| tiingo2-universe-refresh | 39432025506 (20.10.), 39611962485, 39790683049, 39962041711, 40347500594, 40522744563, 40713308243, **40899863661 (29.10.)** | schedule | | alle success | – |
| long-series (S4) | 40079996462 / 40093020759 (Sa 24.10.), 40484210549 (27.10.), 40673869702 (28.10.), **40861589300 (29.10. 10:57)** | schedule | | alle success | – ; Reparaturläufe beobachtet 6–7 h nach cron 04:20 |

---

## (c) DQ-PX-4 / DQ-TW-3 je Titel

Stand 30.10. 05:52 UTC (`data-quality.mjs`, Sitzung 2026-10-29).

### ENLV, NUWE, PARA, SCAG – **geheilt**

| Titel | Befund 29.10. | Ursache | Heilung |
|---|---|---|---|
| ENLV (Enlivex) | PX-4 + TW-3 | Reverse-Split 2026-10-27, Faktor 0,0625 (1:16) | Reparaturlauf 40861589300 → f8114f6; Technical-Neubau 26a0360 (29.10. 11:31) |
| NUWE (Nuwellis) | PX-4 + TW-3 | Reverse-Split 2026-10-27, Faktor 0,111111 (1:9) | dto. |
| PARA | PX-4 + TW-3 | Reverse-Split 2026-10-27, Faktor 0,1 (1:10). **Kein Tickerwechsel PARA→PSKY**: `ref_PARA` ist laut Company Master „Banzai International, Inc.“, CIK 0001826011, Split-Kette 2024-09-19 (0,02), 2025-07-08 (0,1), 2026-05-08 (0,05), 2026-10-27 (0,1); Wochenreihe ab 2021-02-12 (SPAC-Historie). Paramount Skydance liegt getrennt als `ref_PSKY` (Tagesreihe endet 2026-10-05) | dto. |
| SCAG (Scage Future) | PX-4 + TW-3 | Reverse-Split 2026-10-27, Faktor 0,066667 (1:15) | dto. |

Heute: alle vier `diagnose` OK, Wochenreihe Stand 2026-10-28 mit Split in `corporateActions`, DQ-PX-4/TW-3 ohne diese Titel.
Bewertung: Die Tagesreihe (Refresh, `splitFactors`) war bereinigt, die Wochenreihe und Technical nicht; der vorhandene Mechanismus (Repair-Plan + `long-series.yml` Reparaturlauf, danach `technical-world.yml`) hat es ohne Eingriff am selben Tag geheilt. **Kein Codefehler, kein PR nötig.** Die Lücke ist zeitlich: zwischen Refresh-Commit (~03:30) und Reparatur (~10:40–11:00) steht DQ-PX-4 auf ERROR.

### Neu: ATYR, OMEX, AXG – **offen**

| Titel | DQ-PX-4 (Beispiel) | DQ-TW-3 | Ursache (gemessen 6a76289 → 533f788) |
|---|---|---|---|
| ATYR (aTyr Pharma) | 2026-06-12 Tag 17,62 / Woche 0,4404, Faktor ~40 | 2026-10-28 Technical 0,1284 ≠ Reihe 5,14 | Tagesreihe im Refresh 30.10. rückwirkend bereinigt (28.10.: 0,1284 → 5,14), also Reverse-Split ~1:40 um den 29.10.; Wochenreihe Stand 23.10., Split fehlt in `corporateActions` |
| OMEX (Odyssey Marine) | 2026-07-31 Tag 14,91 / Woche 0,5962, Faktor ~25 | 2026-10-28 Technical 0,542 ≠ 13,55 | dto., Faktor 25 (0,542 → 13,55) |
| AXG (Solowin) | 2025-10-10 Tag 632 / Woche 3,16, Faktor ~200 | – (nicht im Technical-Umfang bzw. ohne Abweichung gemeldet) | dto., Faktor 200 (0,0284 → 5,68) |

Zuständig: Wochenreihe → `long-series.yml` (`scripts/market/long-series-repair-plan.mjs` → `publish-long-series.mjs`, Registry `longSeries`); Technical → Materialisierung (läuft) und `technical-world.yml` (cron 05:10 Di–Sa + `workflow_run`). Der Reparaturlauf 30.10. (cron 04:20) war um 06:00 noch nicht gestartet. **Minimaler richtiger Fix: keiner im Code; regulären Reparaturlauf abwarten** und danach erneut messen. Kein Handeingriff, kein zusätzlicher Dispatch (S2).
Hinweis: `diagnose.mjs` meldet ATYR/OMEX/AXG „OK“, obwohl DQ-PX-4 ERROR ist – die Diagnose prüft die Tag/Woche-Gleichheit nicht (s. d).

Offene PRs mit Bezug: keiner zu diesen Titeln. Reverse-Split-Themen nur in alten Drafts #721/#722/#737/#758 (Research, „do not merge“).

Nebenbefund (nicht geprüft, nur gemeldet): `ref_BNZI` ist im Company Master ebenfalls „Banzai International“ (vu_53417cfec4a4f3, Schluss 1,91 am 29.10.), neben `ref_PARA` (vu_3c045e991a20d7, 4,28). Zwei aktive Reihen mit demselben Namen und verschiedenen Kursen gehören in eine Identitätsprüfung (ADR-001), nicht in diese V1-Bewertung.

---

## (d) Status-Konsistenz

`/status/` (`status/status.js:43–51`) und `system-health.mjs` rechnen beide `Core.Health.evaluate` über `core/registry/domains.json`; mechanisch gleich. Widersprüche entstehen zwischen Health, DQ, Registry-Texten und Läufen:

1. **SF8-Kandidaten: DQ-SF8-1 PASS ↔ DQ-SF8-8 ERROR 3225/3225 ↔ Health DEGRADED.** `core/data-quality.js:679–686` erlaubt `maxLag` 2 Sitzungen; `core/data-quality.js:876–891` verlangt `ref.asOf === v.asOf` (zeitgleicher Schluss). Nach jedem Refresh ist ein Einmalstand (28.10.) gegen die Reihe (29.10.) also **immer** vollständig rot. Health (`domains.json:329`, sessions warn 1/stale 2) meldet DEGRADED, ab übermorgen STALE. Folge: S7 „data-quality ohne ERROR“ ist mit veröffentlichtem Einmalstand ohne Tageslauf nicht erreichbar; `core-ci.yml:146` (`--strict`, `continue-on-error`) wird täglich rot.
2. **Registry-Text ↔ tatsächlicher Zustand SF8.** `core/registry/domains.json:332`: „Owner-Freigabe AUSSTEHEND“, aber Stand ist seit 3e7fc17 (29.10. 18:02, Lauf 40924915352) committet. `docs/SUPERTRADER_8_FIRST_RELEASE.md` verlangt die Owner-Freigabe des Fingerabdrucks vor Lauf B; ob sie erteilt wurde, ist im Repo nicht festgehalten. Zusätzlich Label `(Beta)` in `domains.json:317` und `consumers` `:334`, obwohl #1114 „ohne Beta-Kennzeichnung“ gemergt ist → `/status` und `system-health` zeigen „(Beta)“.
3. **Security Master doppelt, mit verschiedenen Grenzen.** `domains.json:14–26` `securityMaster` (Artefakt `eligibility.json`, 2026-09-15, `workflow: null`, staleAfter 840 h) = **STALE**; `domains.json:31–43` `usSecurityMaster` (`us-security-master.json`, 2026-09-11, `security-master-weekly.yml`, staleAfter 1440 h) = **DEGRADED**. Ein Stamm, zwei Urteile. Die SF8-Eingangsprüfung (60 Tage auf `us-security-master.json`) stimmt mit `usSecurityMaster` überein (STALE ab 10.11. 14:43 bzw. Laufdatum 11.11.); `securityMaster` hat keinen Erzeuger-Workflow, obwohl `security-master-weekly.yml` sie ausdrücklich nicht schreibt (Zeile 14, 135) → für `eligibility.json` gibt es weiterhin **keinen** Erzeuger mit Zeitplan.
4. **SEC-Consumer: Health OK ↔ 3 rote Läufe in Folge.** `fundamentalsConsumer` (`domains.json:166`, warn 192 h / stale 360 h) meldet OK (82,5 h, Stand 26.10. 19:22). Health misst nur Alter; rote Läufe sind unsichtbar, bis am 03.11. 19:22 DEGRADED. Kein Alarm-Issue (s. f).
5. **`diagnose.mjs` ↔ `data-quality`.** ATYR/OMEX/AXG: Diagnose „OK“, DQ-PX-4/TW-3 ERROR.
6. **Supertrader (Signale)**: Health DEGRADED `BEHIND_1_SESSIONS` (asOf 28.10.) ist im Fenster bis zum Ende der Kette erwartbar; kein Widerspruch, aber jeden Morgen sichtbar.

---

## (e) Fix-Vorschläge (eng, je eigener PR)

| # | Vorschlag | Dateien | Gate laut CLAUDE.md | Fachmodell? | Owner-Freigabe? |
|---|---|---|---|---|---|
| F1 | **#1098 aus Draft holen und mergen** (Hash statt `toString()`; Zukunftsperioden-Fakt im Test gezielt einsetzen). Vor Mo 02.11. 07:30 UTC, sonst S5 frühestens 09.11. | `scripts/quality/check-test-isolation.mjs`, `quant/tests/quarterly-delivery.test.mjs` | Quant-Pfad (kein Supertrader-Gate A, keine Discover-Engine) | nein | **ja** (Merge) |
| F2 | Security Master: Gate-Befund von 40942100928 (Artefakt 12926603614) prüfen; G6-Duplikat OKE klären; G7/G9-Änderungen über die vorgesehenen Wege (#1101 Freigabevorlage 1.3.0, #1119 Delisting-Ableitung, `docs/data/security-master/v130-approved-changes.json`) freigeben, dann einen Lauf `security-master-weekly.yml`. Grenzen **nicht** anheben. Danach Zeitplan (Zeile 12) per eigenem Quant-PR einschalten oder festen Turnus festlegen. Frist: vor 11.11.2026 | `docs/data/security-master/*`, `.github/workflows/security-master-weekly.yml` | Quant (Datenstamm) | nein (Stammdaten, kein Score) | **ja** (Entscheidung + Turnus) |
| F3 | Erzeuger für `eligibility.json` festlegen (Registry `securityMaster.workflow` ist `null`) oder `securityMaster` als abgeleitet von `usSecurityMaster` führen; sonst bleibt Health STALE auch nach F2 | `core/registry/domains.json:14–26` (+ ggf. Workflow-Schritt `build-us-eligibility.mjs`) | Core (Registry) bzw. Quant | nein (Produkteignung = Universumsentscheidung → prüfen) | **ja** |
| F4 | DQ-SF8-8 vs. Einmalstand: **keine Lockerung**. Optionen (Owner): (a) V6 Schritt 6 – SF8 an das Kettenende koppeln (`workflow_run`, Form in #1099), damit jeden Tag ein zeitgleicher Stand entsteht; oder (b) bis zur Freigabe den Einmalstand per Revert-PR zurücknehmen und Registry auf `PREPARED_DISABLED` (Rückfallpfad aus `SUPERTRADER_8_FIRST_RELEASE.md`). Ohne (a) oder (b) bleibt S7 dauerhaft rot | (a) `.github/workflows/supertrader-sf8-candidates.yml`, `scripts/supertrader/tests/sf-product-contract.test.mjs`; (b) Revert 3e7fc17 + `core/registry/domains.json` | (a) Supertrader Gate A (nur Supertrader-Pfade); (b) Revert unter Supertrader-Pfaden + separater Core-PR | nein | **ja** (V6 ist gesperrt) |
| F5 | Registry-Texte angleichen: `label`/`consumers` ohne „(Beta)“ (#1114), `activation.decision` mit tatsächlichem Freigabestand (Datum/Fingerabdruck) | `core/registry/domains.json:317, 332, 334` | Core | nein | ja (Inhalt der Freigabe bestätigen) |
| F6 | Alarm für rote Läufe von `sec-consumer-fundamentals.yml` und `security-master-weekly.yml` über `scripts/ci/pipeline-alarm.mjs` (wie `market-data-refresh.yml`) | die zwei Workflows | Quant-Workflows; ADR-005 (Eingaben über `env:`) | nein | nein (nur Melden), Review genügt |
| F7 | `diagnose.mjs`/`core/diagnose.js` um Tag/Woche-Vergleich (DQ-PX-4-Logik `compareDailyWeekly`) je Titel ergänzen, damit `/status/#/ATYR` nicht „OK“ sagt | `core/diagnose.js`, Tests `core/tests` | Core | nein | nein |
| F8 | Beobachten, kein PR: Materialize-Checkout 2 h 12 min (`fetch-depth: 0`, `product-intelligence-materialization.yml:96`) gegenüber 3 min 50 s am 29.10. Wiederholt sich das, frisst es das Timeout (300 min) und gefährdet S1 | – | – | nein | nein |

Nicht vorgeschlagen: kein zusätzlicher Produktivlauf, kein Dispatch von `long-series.yml` (würde S2 nicht berühren, ist aber unnötig – Reparatur ist geplant), keine Änderung an DQ-Toleranzen oder Gate-Grenzen.

---

## (f) Fehlerbehandlung / Alarme

- Offen: **#1134** `[freshness-monitor]` (30.10. 02:36): Tageskurse asOf 28.10. vs. erwartet 29.10. – die bekannte Lücke vor dem Ende des Nachtlaufs; schließt der nächste grüne Lauf.
- Seit 20.10. `pipeline-alarm`: freshness-monitor #814, #839, #871, #983, #985, #1029, #1030, #1097, #1131, #1134; market-data-refresh #841 (22.10.), #986 (27.10., am 28.10. für 40615548056 ergänzt, am 29.10. 04:07 durch 40803128385 geschlossen). Nachtlauf-Fehler wurden also gemeldet und automatisch geschlossen.
- **Nicht gemeldet:** die drei roten SEC-Consumer-Läufe (40570986935, 40758243298, 40943676672) und der rote Security-Master-Lauf 40942100928 – beide Workflows haben keinen Alarmschritt (`grep pipeline-alarm` nur in `freshness-monitor.yml`, `market-data-refresh.yml`). Health zeigt den Consumer-Layer weiter OK (d.4).
- Die Rauschquelle bleibt: freshness-monitor öffnet fast jede Nacht ein STALE-Issue vor dem Kettenende; ein echter Ausfall (z. B. Materialize-Timeout heute) wäre darin schwer zu erkennen.

## Nächste Messpunkte

1. 30.10. nach Ende von 40989532165: Materialize-Commit vorhanden? → S1 = 2.
2. 30.10. nach Reparaturlauf `long-series.yml` und `technical-world.yml`: DQ-PX-4/TW-3 = 0?
3. Sa 31.10.: Volllauf `long-series.yml` (cron 07:40) grün → S4.
4. Mo 02.11. 07:30: SEC-Consumer geplant – nur mit #1098 sinnvoll.
5. Vor 11.11.: Security Master erneuert (F2), sonst Eingangsprüfung STALE.
