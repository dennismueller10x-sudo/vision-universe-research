# Supertrader 8.0 – Stand V1 und Tageslauf (D3), 29.10.2026

Stand 29.10.2026, 06:45 UTC, `main` 9119b17. Dieser Stand bewertet die vorab festgelegten Kriterien S1–S7 aus [SUPERTRADER_8_ACTIVATION_READINESS.md](SUPERTRADER_8_ACTIVATION_READINESS.md), Abschnitt „Freigabeschwelle V1“ (Basis 1527253, Stand 27.10.). Die Kriterien gelten **unverändert**.

Für die Bewertung wurden nur echte Laufprotokolle gelesen (GitHub Actions). Es wurde kein Lauf ausgelöst und keine Variable geändert. Gezählt werden nur geplante Läufe auf `main`.

Gilt unverändert:
- Alle 13 Strategien sind `LIVE_NOT_APPROVED`; `VALIDATED_TRADE_SIGNAL` ist gesperrt.
- Keine Orders, kein Broker, keine Zertifizierung, keine neuen Anbieter oder Abrufe.
- Die 83 Quarantänefälle und CC-5 bleiben.
- Der Tageslauf bleibt abgeschaltet: kein Zeitplan, Variable nicht gesetzt, Registry `PREPARED_DISABLED`, Commit gesperrt. V6 ist gesperrt.

## Ergebnis

**V1 ist nicht erfüllt.** S3 ist erfüllt, S1, S2, S4 und S5 sind offen, S6 und S7 sind nicht erfüllt.

Der früheste Termin für S1 ist der Lauf am **04.11.2026**, wenn alle Nachtläufe ab dem 29.10. grün bleiben. S5 kann frühestens am 02.11. erfüllt werden, und nur, wenn #1098 vorher gemergt ist. S6 braucht weiter eine Owner-Entscheidung.

## S1–S7

| # | Kriterium (unverändert) | Belege (Lauf-IDs) | Stand 29.10. |
|---|---|---|---|
| S1 | fünf aufeinanderfolgende geplante Nachtläufe `market-data-refresh.yml` nach 1527253 grün (`refresh`, `materialize`, `freshness-contract`), je ein „Materialize …“-Commit mit Produktrückstand 0 | **40615548056** (28.10., Sitzung 27.10.) **rot**; **40803128385** (29.10., Sitzung 28.10.) grün: Commits 7f8378e und 94d7b46, Frischevertrag ohne Fail-closed | **1 von 5** (Zähler am 28.10. zurückgesetzt) |
| S2 | in diesen Läufen kein manueller Eingriff | 28.10. kein Heil-Dispatch (Sitzung 27.10. wurde nie materialisiert, der Lauf am 29.10. holte nach). Kein „Materialize“-Commit außerhalb geplanter Läufe seit c04c7a5 (27.10.) | offen (1 von 1 ohne Eingriff) |
| S3 | `supertrader-prune` einmal real gelaufen **oder** festgehalten, dass der Fall nicht eintrat; NL5 grün | Der Fall „`refresh` grün, `materialize` oder Frischevertrag rot“ trat nicht ein. 40615548056: `refresh` rot → `prune` übersprungen, wie in #993 vorgesehen. 40803128385: alles grün → `prune` übersprungen. NL5 lokal auf 9119b17: 16/16 | **erfüllt** (Fall nicht eingetreten) |
| S4 | Wochenreihen-Reparatur grün und ein Samstags-Volllauf grün; SPY an jedem Lauftag auf der letzten Sitzung; SIC und Kontinuität nächtlich frisch | `long-series.yml` geplant: 40484210549 (27.10.) und 40673869702 (28.10.) grün, Reparaturlauf 29.10. steht noch aus. `multi-asset-data.yml`: 8/8 geplant grün (40427331474 … 40798015185), SPY 28.10. = letzte Sitzung. SIC und Kontinuität am 28.10. **nicht** erneuert (`refresh` rot), am 29.10. 03:02 frisch | offen: Samstag 31.10. ausstehend; DQ-PX-4 siehe S7 |
| S5 | SEC-Consumer: zwei aufeinanderfolgende geplante Montagsläufe grün mit erklärter Abdeckung | 40339879235 (26.10., geplant) grün. Danach zwei vom Bot angestoßene Läufe rot: 40570986935 (27.10.) und 40758243298 (28.10.); sie zählen nicht, zeigen aber einen Fehler, der jeden Lauf trifft (siehe unten) | **1 von 2**; der Montagslauf 02.11. scheitert ohne #1098 sicher |
| S6 | Security Master und Firmennamen: Erzeuger mit Zeitplan **oder** Owner-Entscheidung zum Turnus; Alter mindestens 14 Tage unter der Grenze (60 bzw. 45 Tage) | Master `generatedAt` 2026-09-11T14:43:20Z, 47,4 Tage (Puffer verlangt ≤ 46). Namen 2026-10-11T05:41:17Z, 17,8 Tage (≤ 31). Erzeuger `security-master-weekly.yml` seit #1033 auf `main`, Zeitplan auskommentiert, **0 Läufe**. `company-names.yml` ohne Zeitplan, 0 Läufe | **nicht erfüllt** |
| S7 | `system-health` OK für alle SF8-Eingaben; `data-quality` ohne ERROR; DQ-PX-2/PX-3 höchstens auf dem Niveau vom 27.10. | `system-health`: SF8-Eingaben OK außer Security Master (STALE, 1.057 h) und US-Wertpapierstamm (DEGRADED). `data-quality`: **ERROR DQ-PX-4** 4/6.188 und **ERROR DQ-TW-3** 4/5.655 (ENLV, NUWE, PARA, SCAG: Split in der Wochenreihe und in Technical nicht nachgezogen). DQ-PX-2 101 (27.10.: 93), DQ-PX-3 301 (27.10.: 302). DQ-SF8-1..8 PASS ohne Daten | **nicht erfüllt** |

Messung lokal auf 9119b17: `system-health.mjs` 06:20 UTC, `data-quality.mjs` 06:40 UTC, Eingangsprüfung nach `input-gate.mjs`.

## Echte Fehler und Ursachen

| Lauf | Fehler | Ursache | Behebung |
|---|---|---|---|
| 40615548056 `market-data-refresh` (28.10.) | `refresh` › „Discover-Daten“: `verify-discover-data.mjs` meldet „thema-immobilien-reits.json: CUBE Klartext-Zahl weicht ab“; `materialize`, Frischevertrag, `supertrader`, `prune` übersprungen; Alarm #986 ergänzt | Klartext rechnete nicht auf dem ausgelieferten Wert der SEC-Kennzahl | **#1044** auf `main` (5b29a10, 28.10.). Der Lauf am 29.10. war grün. Kein neuer PR |
| 40570986935, 40758243298 `sec-consumer-fundamentals` | `research-validation-runner.test.mjs` 2×: `check-test-isolation.mjs:89` `ERR_STRING_TOO_LONG` | Der Diff der geschützten Bäume wird nach dem Erzeugen frischer SEC-Daten > 512 MB und als Zeichenkette verglichen. fd60cae (26.10.) hatte nur den Puffer gegen ENOBUFS vergrößert | **Draft #1098** |
| 40758243298 `sec-consumer-fundamentals` | `quarterly-delivery.test.mjs:54` | Der Test setzt Zukunftsperioden-Aktienzahlen im committeten Bestand voraus. Seit #1043 stellt der Erzeuger sie selbst unter Quarantäne | **Draft #1098** |
| `freshness-monitor` 40695929680, 40754380703, 40761798552, 40806215993 | STALE | **Richtig erkannt**: Sitzung 27.10. nie materialisiert (28.10.), dann Lücke vor dem Nachtlauf (29.10. 02:25) | kein Fehler; die bekannte Lücke vor dem Nachtlauf erzeugt weiter Alarme |
| `data-quality` lokal | DQ-PX-4 und DQ-TW-3 (ENLV, NUWE, PARA, SCAG) | Split nach dem Reparaturlauf vom 28.10. (40673869702); der Hinweis der Regel nennt Reparaturplan und `long-series.yml` | Der geplante Reparaturlauf (Di–Sa 04:20 UTC, beobachtet bis 6 h später) steht aus. Kein Code-Fehler belegt, daher kein PR. Erneut messen, wenn der Lauf vom 29.10. durch ist |

Weitere geplante Läufe ohne Befund:
- `sec-fundamentals-daily.yml` 40501035515 (27.10.) und 40690628272 (28.10.);
- `supertrader-signals.yml` 40691034906 (28.10., geplant, Stand 26.10., weil nichts Neues materialisiert war) und 40815826979 (29.10., von der Kette angestoßen, Stand 28.10.).

Planabweichung des Nachtlaufs: Zeitplan 22:30 UTC, Start 01:31 bzw. 01:53 UTC, also etwa 3 h verspätet. Das Ende der Kette lag am 29.10. um 04:09 UTC.

## D3 – Tageslauf `supertrader-sf8-candidates.yml`: Aktivierungsreife ohne Aktivierung

Geprüft auf `main` 9119b17. Es gibt keinen konkurrierenden Lauf; der Workflow aus #973 wird weiterverwendet.

| Prüfpunkt | Befund |
|---|---|
| DQ-SF8-1..8 im Lauf | Schritt „Datenqualitaet DQ-SF8“ prüft den öffentlichen Teil vor Upload und Commit (`--only=sf8 --sf8-dir --sf8-activated`). Weniger als 8 Regeln oder eine Regel mit 0 Prüfungen sind rot |
| Zentraler Preisabgleich V4 | Erzeuger mit `price-parity.mjs` gegen `quant/data/market/discover-series` (published-close, ADR-002); DQ-SF8-8 prüft „SF8-Schluss = veröffentlichter Schluss“ im Lauf. Die vier Split-Titel aus S7 träfe am Stichtag FAIL bzw. CAP CHART |
| Frische | `--require-current "$heute"`: Tagesbalken müssen auf der letzten abgeschlossenen XNYS-Sitzung stehen. Nebenquellen höchstens 10 Tage (Wochenreihen, Kontinuität, SIC), 45 Tage (Namen) und 60 Tage (Master). Sonst Exit 3 und kein neuer Stand |
| Altersgrenze Security Master | `generatedAt` 2026-09-11T14:43:20Z + 60 Tage = 10.11.2026 14:43 UTC. Gemessen wird am Laufdatum 00:00 UTC: am 10.11. 59,4 Tage → CURRENT, **ab dem Laufdatum 11.11.2026** 60,4 Tage → **STALE, Exit 3**. Firmennamen: ab 26.11.2026 STALE. Wochenreihen ohne neuen Lauf ab 07.11. |
| Aktivierung und Commit | Kein Zeitplan, nur `workflow_dispatch`. Job nur mit `vars.SF8_CANDIDATES_ENABLED == 'true'`. Commit nur mit `commit=true` **und** Registry `ACTIVATING` bzw. ohne `activation`. Registry steht auf `PREPARED_DISABLED` (`core/registry/domains.json`), `SF8-REGISTRY-GUARD` grün |
| Keine Veröffentlichung ungeprüfter Kandidaten | Ohne Commit nur CI-Artefakt (14 Tage). Ein Artefakt unter `supertrader/data/sf-candidates` bei `PREPARED_DISABLED` wäre in Health FAILED/PUBLISHED_WITHOUT_ACTIVATION, in den Register-Tests und in DQ rot. Die Vorschau ist nur mit `?sfPreview=1` sichtbar |
| ADR-005 | `ref: ${{ github.ref }}`, `push-with-retry.sh`, Concurrency `-${{ github.ref_name }}`, Eingaben nur über `env:`; im Test `SF8-DAILY-WORKFLOW` festgeschrieben |

### Kopplung an das Ende der Kette: bewusst **kein** PR

`scripts/supertrader/tests/sf-product-contract.test.mjs` schreibt fest:

```
assert.doesNotMatch(code, /^\s*(schedule|cron|push|pull_request|workflow_run)\s*:/m, 'kein automatischer Auslöser');
```

Ein `workflow_run`-Auslöser ließe sich mit der Variable inert halten. Er müsste aber genau diese Schutzprobe lockern, bevor V6 freigegeben ist. Außerdem würde jeder Nachtlauf einen übersprungenen Lauf erzeugen, und das Setzen der Variable (V6 Schritt 3) würde den Zeitplan (Schritt 6) gleich mit einschalten. Beides widerspricht der Regel „Gates werden nicht abgeschwächt“ und der getrennten Freigabe.

Die Kopplung gehört deshalb in den Zeitplan-PR von V6 Schritt 6. Vorgeschlagene Form:

```yaml
on:
  workflow_dispatch: { inputs: { commit: { type: boolean, default: false } } }
  workflow_run:
    workflows: ['Marktdaten-Refresh (Produktuniversum, Tageskurse + Faktoren + Discover)']
    types: [completed]
jobs:
  candidates:
    if: >-
      vars.SF8_CANDIDATES_ENABLED == 'true' && (github.event_name == 'workflow_dispatch' ||
      (vars.SF8_CANDIDATES_CHAIN == 'true' && github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.event != 'push'))
```

Eigenschaften der Kopplung:
- Gekoppelt wird an das Ende von `refresh` → `materialize` → Frischevertrag. SF8 liest weder die Signale noch die Supertrader-Ausgabe, deshalb wird nicht auf `supertrader-signals.yml` gewartet.
- Ein roter oder übersprungener Nachtlauf startet nichts; die Eingangsprüfung bleibt die zweite Sperre.
- Ein `workflow_run` hat keine Eingaben, also auch kein `commit=true`: Ein gekoppelter Lauf committet nicht. Ein gekoppelter Commit wäre eine eigene, spätere Freigabe.
- Die Schutzprobe in `SF8-DAILY-WORKFLOW` wird im selben PR auf genau diese Form umgestellt, mit Gegenproben: ohne Variable kein Lauf, ohne `SF8_CANDIDATES_CHAIN` kein gekoppelter Lauf, kein Commit über `workflow_run`, kein Lauf bei `conclusion != success` oder einem anderen Zweig.

## Owner-Freigabevorlage V6 (Tageslauf aktivieren)

```
Freigabe Supertrader 8.0 – V6 Tageslauf der Research-Kandidaten
Bleibt in jedem Schritt: 13 Strategien LIVE_NOT_APPROVED, VALIDATED_TRADE_SIGNAL gesperrt,
keine Orders/Broker/Zertifizierung, 83 Quarantänefälle + CC-5 unverändert, keine neuen Kosten.

Vorbedingungen (alle belegt, sonst keine Freigabe)
[ ] V1 S1  fünf geplante Nachtläufe grün in Folge: 40803128385, ______, ______, ______, ______
[ ] V1 S2  ohne Heil-Dispatch            [ ] S3 erfüllt (29.10.)       [ ] S4 Samstag 31.10. + Reparatur grün
[ ] V1 S5  #1098 gemergt; geplanter Montagslauf 02.11. ______ grün (mit 40339879235 vom 26.10. zwei in Folge)
[ ] V1 S6  Security Master: security-master-weekly.yml Zeitplan per eigenem Quant-PR #____
           ODER manueller Turnus ______ ; spätestens vor dem 11.11.2026 erneuert
           Firmennamen: Turnus ______ ; spätestens vor dem 26.11.2026 erneuert
[ ] V1 S7  data-quality ohne ERROR (DQ-PX-4/DQ-TW-3 nach Reparaturlauf geheilt), system-health SF8-Eingaben OK
[ ] V5     Vorschau (Inhalt, Darstellung, Safari/WebKit) freigegeben am ____

Schritte (je ein eigener, vom Owner gemergter PR bzw. eine eigene Owner-Handlung; jeder Zwischenstand grün)
[ ] 1 Supertrader-PR #____: registry-guard.mjs akzeptiert ACTIVATING (Gate A, nur Supertrader-Pfade)
[ ] 2 Core-PR #____: core/registry/domains.json supertrader-sf8-candidates activation.state
      PREPARED_DISABLED -> ACTIVATING (Health DISABLED/AWAITING_FIRST_RUN, Commit-Sperre gelöst)
[ ] 3 Repository-Variable SF8_CANDIDATES_ENABLED=true (nur Owner);
      erster Lauf manuell mit commit=false: Lauf ______ ; DQ-SF8 8/8 PASS, Artefakt geprüft
[ ] 4 Lauf manuell mit commit=true: Lauf ______ ; Commit ______ nur supertrader/data/sf-candidates
[ ] 5 Supertrader-PR #____ (activation nicht mehr verlangt), danach Core-PR #____ (Feld entfernt)
[ ] 6 Zeitplan-PR #____: workflow_run auf „Marktdaten-Refresh …“ (conclusion success, main, kein push)
      + Variable SF8_CANDIDATES_CHAIN=true; gekoppelte Läufe committen nicht ohne weitere Freigabe

Rückfall (jederzeit, ohne Datenverlust)
- Sofort: Variable SF8_CANDIDATES_ENABLED löschen oder ≠ 'true' -> Job wird übersprungen.
- Kopplung aus: SF8_CANDIDATES_CHAIN löschen (Schritt 6).
- Nach Schritt 2/4: Core-PR activation.state -> PREPARED_DISABLED; ein schon committetes Artefakt
  supertrader/data/sf-candidates nur per Revert des Bot-Commits in einem eigenen, freigegebenen PR
  entfernen, nie von Hand ändern (Health/DQ/Register-Tests sind sonst rot).
- Es entstehen keine Orders und keine Signale; Rückfall berührt keine anderen Produkte.

Entscheidung: aktivieren / nicht aktivieren        Datum, Name: ______
```

## Offen

- S1, S2: weitere reguläre Nachtläufe abwarten; frühestens am 04.11. erfüllt.
- S4: Samstagslauf `long-series.yml` am 31.10. und Reparatur der vier Split-Titel.
- S5: #1098 mergen (Owner), dann den geplanten Montagslauf am 02.11. abwarten. Mit 40339879235 wären es zwei geplante Läufe in Folge.
- S6: Owner-Entscheidung zum Turnus für Security Master und Firmennamen. Ohne sie blockiert die Eingangsprüfung ab dem 11.11.2026, bewusst fail closed.
- S7: erneut messen, sobald der Reparaturlauf vom 29.10. durch ist.
- Nicht belegt: ein Lauf von `supertrader-prune` (der Fall trat nicht ein) und ein Lauf von `security-master-weekly.yml` (abgeschaltet).
