# Betriebshandbuch

## 1. Zuerst messen

```bash
node scripts/core/system-health.mjs                                        # Repository-Stand
node scripts/core/system-health.mjs --site=https://research.visionuniverse.de   # ausgelieferte Seite
node scripts/core/diagnose.mjs NVDA                                        # eine Aktie, Glied für Glied
node scripts/core/data-quality.mjs                                         # Datenqualität
```

Im Browser: `/status/` und `/status/#/NVDA`.

Die Zustände bedeuten:

| Zustand | Bedeutung |
|---|---|
| OK | Frischevertrag erfüllt |
| DEGRADED | über der Warnschwelle, oder weniger Datensätze als erwartet |
| STALE | über der harten Schwelle |
| FAILED | Artefakt nicht lesbar |
| NOT_DELIVERED | wird bewusst nicht ausgeliefert, nur im Repository messbar |

## 2. „Der Kurs von X ist veraltet“

1. `node scripts/core/diagnose.mjs X`. Das erste rote Glied ist die Ursache.

| Erstes rotes Glied | Ursache | Reparatur |
|---|---|---|
| `universe` | Titel nicht im Company Master oder nur inaktiv | Universum neu bauen (`build-us-eligibility.mjs`, `universe-master.yml`). Bei Übernahme oder Delisting ist das korrekt. |
| `eod` FAILED | Keine Reihe. Titel im Ablehnungsregister? Identität? | `classify-rejections.mjs` lesen; `node scripts/core/data-quality.mjs` (DQ-ID-1) |
| `eod` STALE | Refresh rot oder Titel vom Anbieter nicht mehr geliefert | Lauf von `market-data-refresh.yml` prüfen, siehe §3 |
| `payload` STALE | Reihe aktuell, Seite nicht | Discover-Build fehlgeschlagen oder Push verloren (§3) |
| `payload` FAILED (Preis ≠ Reihe) | zweite Preiswahrheit | DQ-PX-5; `build-discover-data.mjs` prüfen |
| `intraday` | Takt steht | §4 |

## 3. Ein Datenlauf ist rot

**Quant-Produktionscheck (täglich 05:40 UTC, `quant-produktionscheck.yml`, Zeitplan über `core/registry/schedule.json`):** öffnet jede Quant-Route der ausgelieferten Seite in einem frischen Browser (bereit, kein JS-Fehler, keine fehlgeschlagene Anfrage, Inhalt; Zeit, Anfragen und KB als Messbasis fürs Frontend-Budget, Artefakt `quant-produktionscheck`, 30 Tage) und bewertet jede Datenart unter `/quant/` nach dem Frischevertrag. Frontend-Budget je Route (Übertragungs-KB, Anfragen, Zeit bis bereit) steht in `quant/config/frontend-budget.json` (Messwert 13.11.2026 + 25 % bzw. + 8 Anfragen; Überschreitung = Befund, kein roter Code-PR; ein Budget sinkt per PR, wenn eine Route schneller wird); die größten Ressourcen je Route stehen im Befundtext. Rot öffnet das Issue `[quant-produktionscheck]` (Label `pipeline-alarm`), der nächste grüne Lauf schließt es. Von Hand: `node scripts/quant/production-check.mjs --site=https://research.visionuniverse.de [--nur-daten|--nur-routen]`.

Ein roter Marktdaten-Refresh oder ein roter Freshness-Monitor öffnet automatisch ein Issue mit dem Label `pipeline-alarm` (`scripts/ci/pipeline-alarm.mjs`): Lauf, fehlgeschlagene Schritte, rote Tests. Der nächste grüne Lauf schließt es. Tests, die erst nach der Veröffentlichung rot werden (Gate C), stehen in einem eigenen Issue `[market-data-refresh · Beobachtung]`.

Datenarten, die AN sein sollen (`expectLive: true` in `core/registry/domains.json`, derzeit Company Intelligence), prüft der Freshness-Monitor gegen die Seite (`node scripts/core/expect-live.mjs --site=https://research.visionuniverse.de`): steht eine davon live auf DISABLED, wird er rot und öffnet das Alarm-Issue; `/status/` zeigt `DISABLED_BUT_EXPECTED_LIVE`. Anlass: 08.11.2026 schloss ein Fail-closed-Rollback des Company-Intelligence-Refresh (Lauf 42493495646, Pages-Läufe im Runner-Stau) das Gate, und der eigene Health-Lauf wertete das als „bewusst aus“. Wer bewusst abschaltet, setzt `expectLive:false` im selben PR.

1. Log des Schritts **„Commit und Push“** lesen.
   - Konflikte in den eigenen Erzeugerpfaden des Refresh (`discover/data` ohne `europe`, `quant/data/technical`, Faktoren, Kursreihen; `PUSH_OWNED_PATHS` im Workflow) löst das Skript seit 10/2026 nach eigenem Stand auf.
   - `Konflikt ausserhalb erzeugter Artefakte: <Datei>`: Ein anderer Commit hat dieselbe Datei geändert.
     - Kam der Commit aus einem Feature-PR? Dann den PR korrigieren (generierte Dateien auf den Stand von `main`).
     - War es ein zweiter Datenlauf? Dann einfach wiederholen. Seit ADR-005 checkt jeder Lauf die Spitze aus.
   - `Push nach N Versuchen nicht möglich`: `main` bewegt sich zu schnell. Den Lauf wiederholen.
2. `P0_DATA_PIPELINE_FROZEN` aus dem Schritt `freshness-contract`: Der Marktlauf war grün, die Materialisierung nicht. Den Job `materialize` im selben Lauf ansehen.
3. **Gate A** (vor dem Abruf) rot: Ein Code-Test des Marktlaufs ist auf `main` rot. Gate A umfasst seit 10/2026 nur Testdateien, die Code aus der Importhülle des Jobs `refresh` prüfen und keinen erzeugten Datenstand lesen (`node scripts/market/run-eod-publish-gates.mjs --explain`). Zuerst den Code reparieren, dann den Abruf wiederholen. Rote Tests anderer Produkte oder am Datenstand des Vorabends halten den Abruf nicht mehr an; sie laufen in Gate C und erscheinen im Beobachtungs-Issue.
4. **Gate B** (nach dem Abruf) rot: Die neuen Daten verletzen einen Integritätstest. Nichts wurde veröffentlicht. Die Testausgabe lesen.

Wiederholen: Actions → Workflow → „Run workflow“ auf `main`. Für einen Datenlauf ist das idempotent.

## 4. Intraday steht

- `intraday/index.json`: `dataSession.asOf` und `regularComplete`.
- Läuft `intraday-pacemaker.yml`? Schlägt der Wächter (`pipeline-intraday.yml`, Teil `waechter`) an?
- Nach Börsenschluss holt der Lauf um 21:35 UTC (`intraday-snapshots.yml`) den Schluss und das Universum.
- Ist er gescheitert, holt ein manueller Lauf mit `scope=auto` nach. Das Siegel funktioniert seit 03.10. auch mit Bindestrich-Tickern.

### Im Blick (Intraday) steht oder zeigt „Experimentell/EOD“ statt der Live-Auswahl

- `discover/live/monitor-US_REAL.json`: `plan.lastDueSlot`, `published.slot`, `lastRun`, `error`.
- `node scripts/discover/check-im-blick-live.mjs --site=https://research.visionuniverse.de` nennt den Befund (`RECOMPUTE_OVERDUE` = Lauf nicht gestartet; `DATA_STALE` = Kurse alt, dann Abschnitt 4).
- Keine Läufe von `discover-im-blick-live.yml`: GitHub verwirft Zeitplan-Ereignisse (belegt 12.10.2026). Der Cloudflare-Wecker stößt alle 30 Minuten an; fehlt auch das: Workflow von Hand starten. Details: `docs/DISCOVER_IM_BLICK.md`.
- Nach dem Nachtlauf zeigt `published.eodAsOf` noch die alte Basis (Hinweis `BASIS_NOT_PUBLISHED`, nur Warnung): Job `imblick` im Lauf von `market-data-refresh.yml` ansehen. Er läuft nur, wenn refresh, materialize und freshness-contract grün sind, und macht den Nachtlauf nie rot; ein Fehler steht im Issue `[market-data-refresh]` (Label `pipeline-alarm`) und in `monitor-US_REAL.json` (`error.code` = `NIGHT_CHECK_FAILED`: Datenversion oder Handelsdatum passen nicht; die letzte gültige Auswahl bleibt stehen). Nachholen: `discover-im-blick-live.yml` von Hand starten. Der nächste Slot rechnet ohnehin auf der neuen Basis.
- Wurde die Basis bewusst auf ein **älteres** Datum zurückgesetzt (Revert/Neubau), überspringt Im Blick alle Läufe still (`BASIS_OLDER`, auch mit `--force`): die Basis geht nie rückwärts. Dann `discover/live/im-blick-US_REAL.json` und `monitor-US_REAL.json` löschen und committen, danach `discover-im-blick-live.yml` von Hand starten.

## 5. News sind alt

`update-news.yml` hat keinen Zeitplan. Manuell starten: Actions → „Update VISION UNIVERSE news“.
Die Seite zeigt seit 03.10. selbst an, wenn der Feed älter ist als sein Maximalalter.
**Empfehlung:** einen Zeitplan setzen, zum Beispiel alle 6 Stunden. Das ist eine Owner-Entscheidung, weil der Lauf externe RSS-Quellen abfragt.

## 6. Ein Wertpapier fehlt oder ist falsch zugeordnet

- Identität: `node -e 'console.log(require("./core/identity.js").securityIdForTicker("BRK-B"))'`
- Universum: `quant/data/market/security-master/eligibility.json` (`decisions[]`: `product_eligibility`, `active_status`)
- Company Master: `quant/data/universe/instruments/<shard>.json`, mit Scherbe aus `core/identity.js#shardKey`
- Index: `quant/data/market/index-membership/<INDEX>.json` (`unmatched`)

## 7. Deployment während eines Datenlaufs

`pages-release.yml` baut immer vom Kopf von `main` und hat eine eigene Concurrency-Gruppe (`pages-production`).
Ein Deployment mitten in einem Datenlauf liefert den letzten vollständig gepushten Stand. Teilstände gibt es nicht, weil der Push den Commit atomar setzt.
Nach dem Datenlauf löst `workflow_run` das nächste Deployment aus.

## 8. `core` ist rot, aber der PR hat nichts damit zu tun

1. Welcher Test? Schritt „Zustandstests (Querverträge über erzeugte Daten)“ im Job `core`: steht dort „Datenbefund, nicht dieser PR“, ist es kein Fehler des PR (Warnung, Check bleibt grün). Rot ist der Check nur, wenn der PR einen Eingang des Tests berührt (`core/tests/state/manifest.json`, `blockingWhenPrTouches`).
2. Zustandstests (`core/tests/state/`) prüfen nicht Code, sondern ob die **erzeugten Daten zweier Produkte** zueinander passen (z. B. jedes Supertrader-Signal hat eine Discover-Seite, sonst toter Link). Sie bleiben verbindlich: auf `main`, im täglichen Zeitplan und per Dispatch von `core-ci.yml` (Job `live`) sind sie immer streng.
3. Abhilfe steht in der Warnung: den Erzeuger der veralteten Seite laufen lassen. Beispiel 13.10.2026: der Nachtlauf entfernte QRVO aus dem Discover-Universum, `supertrader-signals.yml` lief wegen der Zeitplan-Verspätung (323–428 Minuten, 15 von 15 Läufen) erst Stunden später. Vor einem manuellen Start prüfen: Nachtlauf und Materialisierung fertig, der Lauf schreibt nur `supertrader/`, die Integritätstests im Lauf bleiben bindend.
4. Neue Zustandstests: Datei in `core/tests/state/` ablegen **und** im Manifest führen (Erzeuger, Abhilfe, berührte Pfade). Eine nicht geführte Datei ist immer streng. Code-Tests bleiben in `core/tests/*.test.mjs` und blockieren jeden PR.

## 9. Supertrader steht auf dem Vortag oder zeigt einen toten Link

1. Befund: `node scripts/ci/supertrader-chain.mjs check --root=.` (oder der Job `supertrader` im Freshness-Monitor). `SUPERTRADER_LATE` (> 4 h) und `SUPERTRADER_STALE` (> 9 h, FAIL) heißen: die validierten Produktdaten tragen die letzte Sitzung, Supertrader nicht. `DEAD_TICKER_REFS`: Signale auf Titel ohne Discover-Seite und ohne `discoverAvailability`-Ausweis (der nächste Lauf weist sie aus).
2. Kette: Der Nachtlauf (`market-data-refresh.yml`) stößt in der letzten Stufe `supertrader` den Workflow `supertrader-signals.yml` per `workflow_dispatch` an, aber nur wenn refresh, materialize und freshness-contract grün sind und `measure-pipeline-freshness` (QUANT_CURRENT = PASS) sowie das Discover-Universum, der Benchmark SPY, das Marktregime und der Börsenstatus dieselbe letzte Sitzung tragen (sonst `REFUSE/INPUT_NOT_CURRENT` mit Alarm-Issue; der Zeitplan-Rückfall rechnet dann später). Steht Supertrader schon auf dem Datum, aber ein Signal zeigt auf einen entfallenen Titel (`DEAD_TICKER_REFS`), stößt die Stufe einen Neubau an, der ihn ausweist. Der Zeitplan 06:17 UTC in `supertrader-signals.yml` bleibt als Rückfall (er kam im Schnitt 5–7 Stunden zu spät). **Frist (13.11.2026):** zusätzlich startet der Wecker `supertrader-signals.yml` um 01:47 UTC (Register-Eintrag `supertrader-signals-frist`, Di–Sa), rund zwei Stunden nach dem Nachtlauf-Ende und vor der Warnschwelle `SUPERTRADER_LATE` (4 h); hat der Anstoß abgelehnt (`INPUT_NOT_CURRENT`, #1765), rechnet die Frist nach, ohne dass jemand eingreift. Der Lauf spielt den Datenzweig selbst ein (`seed-data-branch.sh alle`), ist idempotent (steht Supertrader schon auf dem Datum: kein Commit) und kostet rund 2,5 Minuten.
3. Ursache finden: Job `supertrader` im Nachtlauf ansehen (`SKIP/UP_TO_DATE`, `SKIP/ALREADY_QUEUED`, `REFUSE/DATA_NOT_VALIDATED` oder Dispatch abgewiesen: Issue `[market-data-refresh]` mit Fehlertext). Lief der Supertrader-Lauf und ist rot, bleiben die Signale unverändert (Integritätstests vor dem Commit): den Lauf in den Actions ansehen.
4. Nachholen: `supertrader-signals.yml` von Hand starten. Vorher prüfen: Nachtlauf und Materialisierung fertig, der Lauf schreibt nur `supertrader/`, seine Integritätstests bleiben bindend. Ein Wiederholungslauf ist idempotent (keine neuen Handelstage, keine Minutenabrufe, kein Commit) und kostet nur Laufzeit (rund 2,5 Minuten).


## 10. Ein Zeitplan-Lauf kam nicht (Zeitgeber)

Alle Zeitpläne stehen in `core/registry/schedule.json` (Plan Neustart §3: ein Zeitgeber). `timer: "waker"` heißt: der Cloudflare-Wecker `vu-intraday-waker` liest das Register jede Minute von `main` und startet den Workflow per `workflow_dispatch` mit `zeitplan=<cron>`; der Lauf heißt dann `<Workflow> · Takt <cron>`. Kam nichts an, holt der Wecker nach 5, 10 und 15 Minuten nach. `timer: "github"` heißt: der Cron steht noch im Workflow (Altbestand oder begründete Ausnahme, Feld `ausnahme`).

- Inventar und Abweichungen: `node scripts/core/schedule-registry.mjs` (Vertragstest SZ in `core/tests/schedule-registry.test.mjs`).
- Wecker eingerichtet? `https://vu-intraday-waker.little-credit-15d3.workers.dev/status` (`schluesselHinterlegt: true`).
- Wecker neu ausrollen: Workflow „Cloudflare — Intraday-Wecker ausrollen“ (`cloudflare-waker-deploy.yml`). Ein Registerwechsel braucht **kein** Ausrollen.
- Umstellen eines Eintrags: Cron aus dem Workflow und `timer: "waker"` im selben Commit; der Workflow bekommt den Eingang `zeitplan`, `run-name` mit Marke und die Weiche `github.event.schedule || inputs.zeitplan` (SZ-2 prüft das).

## 11. Daten kommen aus dem Datenzweig (`data/live`)

Erzeugte Daten wandern Datenart für Datenart aus `main` in den Datenzweig `data/live` (Plan Neustart §3). Stand und Reihenfolge stehen in `core/registry/data-branch.json`: unter `domains` die umgestellten Datenarten (Phase `BRANCH_ONLY` = Erzeuger schreibt nur noch in den Zweig; die Kopie in `main` ist eingefroren), unter `plan` alle übrigen mit Status (`NEXT`, `LATER`, `LAST`, `EXEMPT`) und Grund. Vertragstest DB in `core/tests/data-branch-pilot.test.mjs`.

- Pages legt den Zweig vor dem Bau in den Arbeitsbaum und nach dem Bau über die Auslieferung (`scripts/ci/overlay-data-branch.mjs`, Bericht in der Step Summary „Datenzweig“). Neuer gewinnt, kaputt oder zu klein ersetzt nie den guten Stand.
- Ein Workflow, der solche Daten liest, ruft nach dem Checkout `scripts/ci/seed-data-branch.sh alle` auf (commit-sicher, auch bei `git add -A`).
- Ein Erzeuger schreibt mit `scripts/ci/push-data-branch.sh data/live <pfad>…` (Verzeichnisse werden gespiegelt).
- „Seite zeigt alten Stand“: Step Summary „Datenzweig“ des letzten Pages-Laufs lesen (`KEPT_MAIN` mit Grund), dann den letzten Lauf des Erzeugers.

## 12. Vercel-Vorschau „Deployment rate limited“

Das Tageskontingent (100) wird offenbar schon beim Anlegen einer Vorschau gezählt; der Abbruch durch `ignoreCommand` hilft dann nicht (10.11.2026, ein reiner Test-PR bekam den Status). Deshalb schaltet `vercel.json` mit `git.deploymentEnabled` die Vorschau für `claude/*`-Zweige aus (Steuerung 10.11.2026; die Vorschau war ohnehin der 197-Byte-Platzhalter, Oberflächen prüft die Browser-QA in der CI). `main` und Produktion bleiben unberührt; Test in `quant/tests/vercel-preview-boundary.test.mjs`. Der rote Vercel-Status ist keine Pflichtprüfung und kein Codefehler.

## 13. Welche Generation ist live? (Release-Manifest)

Jede Auslieferung trägt `/core/release-manifest.json` (ADR-008, [Entscheidung](../architecture/ADR-008-release-generationen.md)): Code-SHA, Datenzweig-SHA, je Datenart Pfad + Inhaltshash, Security-Master- und Company-Intelligence-Generation, Gesamthash der Nutzdaten (`payloadHash`; Zeitstempel ausgenommen, im Manifest unter `volatile` genannt). `stage` ist `BUILT` (Releasebau) oder `SEALED` (Pages, nach Overlay und Staging).
Prüfen: `node scripts/core/system-health.mjs --site=https://research.visionuniverse.de` (Zeile „Ausgelieferte Generation“, JSON: `report.release`) oder `/status/`. Weicht `code.sha` vom erwarteten Commit ab, hat Pages ihn nicht übernommen (§7, Marker `pages-release-marker.yml`).
Zwei Bauten mit gleichen Eingaben müssen denselben `payloadHash` haben; `core/tests/release-manifest.test.mjs` (RM) sichert das mit Fixtures und Gegenproben.
Der Siegel-Schritt ist nie blockierend (continue-on-error, nur Warnung) und läuft vor dem Hochladen, sonst läge das Manifest nicht im Paket. Stand 10.11.2026: Manifest, Siegel-Schritt und Statuszeile umgesetzt; der Vergleich Live ↔ Kandidat (`comparePayload`) blockiert noch nicht, er benennt nur.

## 14. Merge bei Grün statt Auto-Merge (`ci-gate`)

Das Ruleset „Schutz vor Verlust“ gilt für `main` und die Datenzweige (`data/**`, `backup/**`, `rollback/**`, `evidence/**`, `brevo-newsletter-state`). Die Datenläufe pushen dort mit dem `GITHUB_TOKEN` (github-actions[bot], `push-with-retry.sh`) direkt, ohne PR. „Require status checks to pass“ im selben Ruleset würde diese Pushes ablehnen, und der Actions-Akteur lässt sich in Rulesets nicht als Bypass eintragen (nur Rollen, Deploy-Keys, installierte Apps). **Deshalb: keine Pflichtprüfung, kein Auto-Merge.** Nichts im Ruleset ändern.
Stattdessen merged die Sitzung ihren PR selbst, sobald `ci-gate` grün ist: `scripts/ci/wait-gate.sh <PR>` (Exit 0 = grün). `ci-gate` läuft auf jedem PR, wartet auf alle ausgelösten Prüfungen (übersprungen = ok, je Name zählt der neueste Lauf, nur GitHub-Actions-Jobs) und ist nur grün, wenn keine rot ist.
Wer doch Auto-Merge will, braucht zuerst eine GitHub-App (Owner-Entscheidung): Datenläufe pushen mit deren Token (`actions/create-github-app-token`), die App kommt als Bypass-Akteur in ein eigenes Ruleset nur für den Default-Branch mit der Pflichtprüfung `ci-gate`. Das ist ein eigener Umbau aller Datenläufe, nicht Teil des Schnellwegs.
Infrastrukturfehler (apt-DNS, Netz, Runner-Verlust) startet `ci-retry.yml` einmal selbst neu; echte Testfehler nicht.

Infrastruktur-Messung 13.11.2026 (Strang AL): Übersprungene Läufe (~48 %) kosten keine Runner-Minuten (sie kommen von `push: claude/**` und `workflow_run`-Triggern mit Job-`if`); `monitor.yml`-Rot sind echte Live-Prüfungen; Pages-Release ist über die Gruppe `pages-production` schon entprellt. Die `ci-gate`-Zeit bestimmt der langsamste Check: Quant-Suite läuft deshalb in drei Shards (`*-quant-suite`), Browser-QA je Viewport/Abschnitt, `verify-suites.mjs` fährt jede Suite einmal. Nicht löschen: `scripts/quant/v9`–`v13c` (Backtest-Generationen), `history-store-sync.yml` (Launch-Gate STORE) und die manuellen Brevo-/Brand-Media-Workflows; Workflows zu bündeln spart keine Laufzeit. Der einzige Hebel auf Repo-Größe und Main-Commits ist der Umzug erzeugter Daten nach `data/live` (§11).

Queue-Messung 13.11.2026 (Strang AL): Das Konto fährt höchstens ~20 Jobs gleichzeitig; Wartezeit je Job (created_at→started_at). PR-CI: Median 4 s → 59 s, p90 180 → 515 s (nur 600 jüngste Läufe je Zeitraum, Stichprobe); Datenläufe Median 3 → 49 s; Pages-Release/Intraday-Schnellpfad meist < 3 min, ein `pipeline-intraday`-Nachholen am 13.11. 20:30 UTC wartete 43 Min auf einen Runner. Vergleichbare Voll-Läufe (alle Prüfungen ausgelöst, ≥12 Jobs, erfolgreich): Laufzeit Median 32,4 → 19,4 Min, längster Job 28,5 → 16,1 Min, Job-Minuten je Lauf unverändert (~100), Jobs je Lauf 19 → 18–36. Die Aufteilung (Shards) hilft also, ein ci.yml-ändernder PR belegt aber bis zu 36 der ~20 Plätze: Datenläufe warten dann hinter ihm. Es gibt in GitHub Actions keine Priorität zwischen Workflows und `max-parallel` verlängert nur die PR-Laufzeit. Regel: PRs, die `ci.yml` oder breite Pfade ändern (lösen alle Prüfungen aus), nicht zwischen 13:30 und 21:00 UTC öffnen/pushen; weitere Shards nur, wenn die Job-Minuten sinken. Hebel für echte Priorität ist größere/zusätzliche Runner-Kapazität (Owner-Entscheidung, kostet Geld).

## 15. Schnellweg für kleine Oberflächenänderungen

Ziel: Push bis live in rund 30 Minuten ohne Handarbeit. PR öffnen, `scripts/ci/wait-gate.sh <PR>` abwarten, bei Grün selbst squash-mergen (§14). Browser-Jobs laufen im Playwright-Image (kein apt, kein `playwright install`), `ci-retry.yml` startet Infrastrukturfehler einmal neu, die Shell-QA läuft in drei parallelen Jobs. Eine neue UI-Schutz-Revision ist eine eigene Datei in `docs/quality/ui-protection-revisions/` ohne Nummer, also ohne Konflikt bei bewegtem `main`. Echte Testfehler bleiben rot und werden repariert, nicht wiederholt.
Offen, braucht eine UI-Schutz-Revision mit Owner-Freigabe (`scripts/vu2/browser-qa.mjs` ist byte-gesperrt): (1) ein einmaliger Wiederholungsversuch in `versuch()` für die schwankende Meldung „Unexpected price-history fanout: screenerPro@1440“ (lokal nicht reproduzierbar; die Meldung nennt seit #1855 den Pfad, daran die Ursache klären, dann ggf. Retry unnötig); (2) die Direktlink-QA (`scripts/vu2/direct-link-lib.mjs`) hängt an Wortlaut („vollständige technische Auswertung … noch nicht veröffentlicht“, „Chartbild öffnen“): stabile Markup-Anker (`data-*`) in den gesperrten Seitendateien würden den Text ablösen.
