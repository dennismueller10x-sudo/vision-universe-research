# Gate-Audit Vision Universe Research (Stand 23.10.2026)

Nur gelesen. Es wurde nichts geändert, committet, ausgelöst oder kommentiert. **Kein Gate soll jetzt entfernt werden.** Alle Punkte unten sind Empfehlungen.

Grundlage:
- 113 Workflow-Dateien unter `.github/workflows/` (Stand `56374bb2cd`).
- Lauf-Statistiken über `gh run list` bzw. die REST-API `repos/.../actions` (öffentliches Repository, über den Proxy gelesen). Jede Zahl nennt ihr Fenster: Lauf-Nummern bzw. Datum, `n` = Anzahl der Läufe.
- Fehlerursachen über die Job- und Step-Liste (`/actions/runs/{id}/jobs`) und über Job-Logs, nur als Stichprobe.
- Laufzeiten: Median der Läufe mit `success`/`failure` (updatedAt − startedAt). Warteschlangenzeit ist nicht enthalten.

---

## 0. Kernaussagen

1. **Branch-Schutz gibt es nicht.** `GET repos/.../branches/main` liefert `protected:false` und `required_status_checks.contexts: []`. `GET .../rulesets` und `.../rules/branches/main` liefern `[]`. Kein PR-Check ist technisch Pflicht. Die PR-Gates wirken nur per Konvention (rotes Häkchen). Die eigentlich harten Gates sitzen deshalb in den **Daten- und Auslieferungs-Workflows**. Dort entscheidet ein rotes Ergebnis über Commit bzw. Deploy.
2. **Die Aufteilung von `market-data-refresh.yml` in Gate A / B / C (12.10.2026) wirkt nachweislich.**
   - Geplante Läufe 15.09.–12.10.: 13 von 19 rot. Die meisten Ursachen waren datenabhängige Regressionstests (Steps „Regressionssuite“ bzw. „Gate A“).
   - Danach 9 von 9 geplanten Läufen grün (#1774–#2160, 13.10.–23.10.).
   - Dieses Muster fehlt noch in sieben weiteren Daten-Erzeugern (siehe 3.2).
3. **Der Concurrency-Fehler bei `technical-intelligence-build.yml` ist belegt und harmlos verlaufen. Strukturell bleibt er riskant.**
   - Lauf-Fenster #471–#570 (21.–23.10., n=100): 86 skipped, 11 cancelled, 3 success.
   - Ursache: Jeder Push auf `claude/**` erzeugt einen übersprungenen `long-series`-Lauf, z. B. #1955–#1961 am 23.10. Jeder davon startet über `workflow_run` einen TI-Lauf in derselben festen Gruppe. Der Filter greift erst auf Job-Ebene. Der neue wartende Lauf verdrängt dann den älteren wartenden.
   - TI-Läufe #563–#567 wurden so von den Pushes 1955–1959 verdrängt. #568 (selbst skipped) verdrängte #567, während #562 lief (04:55–06:15 UTC, 80 min).
   - Am 23.10. ging dabei kein gültiger Lauf verloren: Alle Auslöser waren übersprungene Branch-Läufe. Ein gültiger Lauf (Dispatch auf `main` oder Upstream `success`) wäre aber genauso verdrängt worden.
   - `pages-release.yml` hat dieses Problem bereits gelöst (eigene Gruppe `pages-production-ignored-{run_id}`). TI-Build, Materialisierung und Supertrader-Live-Smoke haben die Lösung nicht.
4. **Der rote Zustand von `core-ci` „live“ ist chronisch und fast nur durch einzelne Titel verursacht.**
   - Geplante Läufe 05.10.–22.10.: 14 von 18 rot.
   - Alle 14 geprüften roten Läufe:
     - 9× DQ-PX-4 (Tages- vs. Wochenschluss) mit 1–7 von ~6.170 Titeln.
     - 6× DQ-PX-5 mit 1–2 von ~6.300 Titeln.
     - 1× DQ-PX-1 mit 3 von 6.827 Titeln.
     - Dazu `system-health --strict` STALE für nicht kritische Systeme: News 172–364 h, Security Master 847–896 h.
   - Das Gate blockiert nichts nachgelagertes. Es ist ein Alarm, der fast jeden Tag rot ist, und verliert damit seine Signalwirkung.
   - PR #858 (automatische Reparatur der Wochenreihen, DQ-PX-4) trifft die häufigste Ursache.
   - Ein lokaler Lauf `data-quality.mjs --strict` auf dem heutigen Stand ist grün (DQ-PX-4 0/6172). Grund ist die Reparatur per Dispatch, `long-series` #1954.
5. **Ganze Test-Suiten fremder Produkte laufen zehnfach und blockieren fremde Pipelines.** `node --test "quant/tests/*.test.mjs"` läuft in 10 Workflows, `discover/tests/*` in 8, `scripts/vu2/build-release.mjs` in 9. 20 Workflows installieren Playwright. Die Isolations-Gates (Supertrader Gate A, CI protected paths, Social „Quant unberührt“) garantieren schon, dass diese PRs Quant nicht ändern. Ein zusätzlicher Lauf der Quant-Suite prüft dort vor allem den **Datenstand**, nicht den Code des PRs.

---

## 1. Inventar der blockierenden Gates

Legende:
- Spalte „Auslöser“: PR = pull_request, P = push, S = schedule, D = workflow_dispatch, WR = workflow_run, WC = workflow_call.
- Spalte „Wirkung“: **global** = blockiert das ganze Produkt bzw. die ganze Auslieferung; **produkt** = nur die eigene Welt; **alarm** = blockiert nichts, macht nur rot.
- Laufzeit: Median des ganzen Workflows (nicht des einzelnen Steps), aus dem jeweils genannten Fenster.

### 1.1 PR-/Push-Prüf-Workflows (mangels Branch-Schutz nicht erzwungen)

| # | Gate | Datei:Zeile | Auslöser | verhindert konkret | Folge ohne Gate | Wirkung | Überschneidung | Laufzeit | Empirie (Fenster) | Klasse |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Core-Tests | core-ci.yml:58 | PR, P | Regression in Identität / Preiswahrheit (core/*.js, push-with-retry, published-close) | falsche securityId / Schlusskurse | global (Pflicht-Check `core` laut Kommentar) | quant-ci (gleiche Testdateien teils) | 6,5 min (p90 15,2) | #1462–1561 (21.–23.10., n=100): 91 ✓, 1 ✗ (schedule), 8 cancelled (PR-Supersede) | **A** |
| 2 | Zustandstests `state-gate.mjs` | core-ci.yml:68, scripts/ci/state-gate.mjs | PR (bedingt), S/D streng | Supertrader-Signal ohne Discover-Seite | tote Verweise im Produkt | produkt (Manifest `blockingWhenPrTouches`) | Freshness-Monitor „supertrader“ | in #1 | im live-Job in 2 von 14 geprüften roten Läufen rot (15./16.10.) | **A**, Vorbild für alle anderen |
| 3 | Erzeugte Artefakte im PR | core-ci.yml:85 | PR | Rebase-Konflikt des nächsten Datenlaufs | verworfene Datenläufe | nur Warnung | – | – | – | (Warnung) |
| 4 | CI Config (Workflow-Regeln, npx-Pin) | ci-config.yml:28 | PR, P (Pfade) | PR-Lauf in Produktions-Concurrency-Gruppe, ungepinnte npx | Verdrängung von Produktionsläufen | global | – | 1,1 min | #726–825 (16.–23.10.): 95 ✓, 0 ✗, 5 action_required | **A** |
| 5 | Quant CI (Engine-/Acceptance-Suite, Drift TI v2/v3, kein lokales FX, Hygiene, Semantik-Parität) | quant-ci.yml:40–153 | PR, P (Pfade) | Engine-Regression, Abweichung veröffentlichter Daten von Engine, Rohdaten in öffentlichen Pfaden, FX-Umrechnung neben Currency Layer | falsche Kurse / Scores ausgeliefert | global (Quant) | Suite auch in 9 weiteren Workflows; Drift in market-refresh + TI-Build; Hygiene in 20 Workflows | 6,7 min | #1082–1181 (14.–23.10.): 93 ✓, 2 ✗ (Engine-Tests), 5 action_required | **A** |
| 6 | Discover CI: Contract-Tests, verify-discover-data, Reproduzierbarkeit | discover-ci.yml:35–56 | PR, P (Pfade) | nicht deterministischer Build, Daten ≠ Engine | nicht vergleichbare Stände | produkt | verify-discover-data auch in market-refresh, long-series (2×), company-names, index-membership, sec-consumer | 8,0 min | #583–682 (12.–23.10.): 94 ✓, 6 ✗ (4× Contract-Tests, 2× Stock-Hooks-Scope inkl. `INTEGRATION_SCOPE_GIT_FAILED`) | **A** |
| 7 | „Discover verändert keine bestehende Engine“ | discover-ci.yml:81–106 | PR | Discover-PR ändert quant/, scripts/market … | stille Engine-Änderung | produkt | #8, #12, #18 (gleiche Idee, vier Implementierungen) | in #6 | im Fenster nicht einzeln rot gesehen | **A** (Regel), Implementierung **C** (Duplikat) |
| 8 | Supertrader Gate A `guard-protected-paths.mjs` | supertrader-ci.yml:30, scripts/supertrader/guard-protected-paths.mjs:10–30 | PR | Supertrader-PR ändert Discover/Quant | Querschnitts-PR an Isolation vorbei | produkt | #7, #12, #18 | in #9 | 3 von 6 roten Stichproben (#218–317) | **A** / Implementierung **C** |
| 9 | Supertrader CI: Gate B/D/E Tests, Build, **ganze Discover- und Quant-Suite**, Gate F Browser-QA | supertrader-ci.yml:33–54 | PR, P | Engine-/Registry-Regression | falsche Handelssignale | produkt (Tests B–F), Fremdsuiten global | Quant-/Discover-Suite doppelt zu #5/#6; build-release doppelt | 15,9 min | #218–317 (19.–23.10.): 69 ✓, 6 ✗ (3× Gate F Browser, 3× Gate A), 24 cancelled (12 davon Push auf main, `cancel-in-progress: true`) | B/D/E **A**; Fremdsuiten **C** |
| 10 | Discover Frontend Gates (consolidation-gate, Deploy-Switch, Browser/a11y/Performance, Budget ≤ 180.000 B / ≤ 12 Requests) | discover-frontend-ci.yml:35–80, scripts/discover/browser-qa.mjs:138 | PR, P | aufgeblähte Views, kaputte Navigation | Ladezeit / Regression | produkt | build-release + Playwright wie #9, #13, #14, #15 | 17,6 min (p90 55,9) | #561–660 (12.–23.10.): 56 ✓, 26 ✗, 17 cancelled. 12 von 12 geprüften ✗ im Step „Browser, accessibility, performance …“. Stichprobe: `locator.waitFor: Timeout 30000ms`, 1× `getaddrinfo ENOTFOUND playwright.download.prss.microsoft.com` (Infra). Ein Budget-Fehler ist in der Stichprobe **nicht** belegt. | Budget **A**; Flake-Anteil → **B** (Retry/Klassifikation) |
| 11 | Quant Browser QA (vu2) | vu2-browser-qa.yml:36–77 | PR | Regression der Quant-Oberfläche, Ressourcenbudget | UI kaputt | produkt | build-release | 12,7 min | #534–633 (10.–23.10.): 85 ✓, 7 ✗ (5× „Test desktop and mobile preview“, 2× „Direct links … slow networks“), 3 cancelled | **A** (Flake-Anteil nicht gemessen) |
| 12 | Company Intelligence `validate` (eigene Tests + **alle Quant-/Discover-/Supertrader-/Screener-Suiten** + protected paths + Currency-Register-Assertion) | company-intelligence.yml:388–443 | PR, P, D | CI-PR ändert Produktionspfade | Querschnittsänderung | produkt (Pfade), Fremdsuiten global | #7, #8, #18; Fremdsuiten doppelt | 8,8 min | #507–606 (14.–22.10.): 61 ✓, 28 ✗ (25 PR), 11 cancelled. Von 12 geprüften ✗: 8× „Existing products and SEC regressions“ (Fremdsuiten, `ERR_TEST_FAILURE`), 4× eigene Tests | Pfad-Gate **A**; Fremdsuiten **C** |
| 13 | Screener CI | screener-ci.yml:25–45 | PR, P | Screener-Regression | – | produkt | build-release | 7,0 min | #79–178: 87 ✓, 1 ✗, 12 cancelled | **A** |
| 14 | Shell CI + VU3-Regression | shell-ci.yml:28–92 | PR, P | Navigation / Shell kaputt | alle Seiten | global | build-release ×2 im selben Workflow | 30,2 min | #180–279 (18.–23.10.): 69 ✓, 3 ✗ (VU3 Browser), 28 cancelled (12 Push main) | **A**; Laufzeit **C** |
| 15 | Research Access Gate | research-access-ci.yml:34 | PR, P | Passwort-Gate umgehbar | Inhalte öffentlich | global | pages-release prüft Access-Gate erneut | 2,4 min | #1–95: 95 ✓ | **A** |
| 16 | SEC Fundamentals CI (inkl. **ganzer Quant-Suite**) | sec-fundamentals-ci.yml:48 | PR, P | SEC-Exporter-Regression | falsche Fundamentaldaten | produkt + Fremdsuite | Quant-Suite doppelt | 7,8 min | #957–1056 (13.–23.10.): 81 ✓, 14 ✗. 12 von 12 geprüften ✗ im Step „Run the whole quant test suite“. Beispiel: „Datenstand weicht vom veröffentlichten Produkt ab (5034 Titel, NOT_IN_REGISTRY_UNIVERSE)“ = datenabhängig | eigene Tests **A**; Fremdsuite **C** |
| 17 | Vorsorge CI „Daten-Build ist reproduzierbar“ | vorsorge-ci.yml:30 | PR, P | Drift Vorsorge-Daten | – | produkt | – | 2,6 min | #1–94: 74 ✓, 20 ✗ (12 von 12 geprüften im Reproduzierbarkeits-Step, Ursache nicht weiter untersucht) | **A** (Ursache prüfen) |
| 18 | Social CI „Der bestehende Quant-Bereich bleibt unberührt“ (ganze Quant-Suite) | social-ci.yml:300–304 | PR, P | Social ändert Quant | – | produkt + Fremdsuite | #7, #8, #12 | 9,8 min | #114–214 (26.09.–16.10.): 84 ✓, 16 ✗ (8 von 11 geprüften in diesem Step) | **C** (Duplikat Pfad-Gate + Fremdsuite) |
| 19 | Currency FX Verify (PR) | currency-fx-verify.yml | PR | Currency-Regression | falsche Umrechnung | global | quant-ci FX-Guard | 1,2 min | #1912–2011: 95 ✓, 1 ✗, 4 cancelled | **A** |

### 1.2 Daten erzeugende Workflows (Gate rot = kein Commit)

| # | Gate | Datei:Zeile | Auslöser | verhindert konkret | Folge ohne Gate | Wirkung | Überschneidung | Laufzeit | Empirie (Fenster) | Klasse |
|---|---|---|---|---|---|---|---|---|---|---|
| 20 | Market Refresh **Gate A** (Code-Regression vor dem Abruf) | market-data-refresh.yml:76, quant/config/eod-publish-gates.json | S, D | Abruf mit kaputtem Code verbrennt Kontingent | 6.000+ Requests für falsche Daten | global (EOD) | quant-ci | Workflow 94 min (Schedule-Median) | 3 ✗ (08.–10.10., #1589/#1633/#1653). Laut Manifest `incident2` waren das datenabhängige Tests. Seit Neuschnitt 12.10. 0 ✗ in 9 Läufen | **A** (seit Neuschnitt) |
| 21 | Drift `verify-technical-data` | market-data-refresh.yml:235 | S, D | TI-Daten ≠ Engine | falsche Chart-Signale | global | quant-ci:80 | – | im Fenster nicht rot | **A** |
| 22 | `build-discover-data` + `verify-discover-data` | market-data-refresh.yml:238–241 | S, D | Discover-Daten ≠ Engine | falsche Karten | **global für eine Abweichung** | long-series 2×, discover-ci | – | 2 ✗ (02.10., #877/#887). Log #887: „95230 Prüfungen, **1 Abweichung**: PRHIZ trägt eine Karte ohne Aussage“ → ganzer Nachtstand verworfen | **A** als Regel; Granularität → **B** (Titel isolieren) |
| 23 | `assert-daily-lifecycle-health --strict` | market-data-refresh.yml:266 | S, D | Lebenszyklus kaputt | Universum bricht weg | global | – | – | im Fenster nicht rot | **A** |
| 24 | Public-Data-Hygiene / `assert-no-secrets` / Schlüssel-grep | market-data-refresh.yml:255,275; long-series.yml:96–106; TI-Build:246 u. a. (20 Workflows) | S, D, P | Rohdaten / Schlüssel öffentlich | Lizenz- / Sicherheitsvorfall | global | 20-fach | Sekunden | im Fenster nicht rot | **A** (beim Erzeuger); quant-ci-Wiederholung **C** |
| 25 | Market Refresh **Gate B** Data-Integrity | market-data-refresh.yml:281 | S, D | Mock-/Zukunftswerte, Rohbars, inkonsistente Projektion | korrupte Produktdaten | global | – | – | seit 12.10. 0 ✗ | **A** |
| 26 | Commit/Push `push-with-retry.sh` (ADR-005) | market-data-refresh.yml:440 u. a. | – | verlorene Läufe bei Wettlauf | Datenverlust | – | – | – | „Commit und Push“ ✗ in Market Refresh 5× (15.09.–10.10.; Logs #1695, #937, #504: `CONFLICT` in quant/data/technical/*, discover/data/*, capabilities/*). Außerdem sec-consumer 3×, coverage 1×, index-membership 1× (jeweils letzte 5 ✗). Zum Teil vor Einführung des Werkzeugs; das Einführungsdatum ist im flachen Klon nicht ermittelbar | **A** |
| 27 | Materialisierung: Contract-/Regressionstests + `assert-product-completeness` | product-intelligence-materialization.yml:393–410 | WC (aus Market Refresh), D, WR | unvollständige / inkonsistente Quant-Produktdaten | Lücken in Rankings / Regime | global (Quant) | enthält `market-signal-contract.test.mjs` und `product-services.test.mjs`, die das Manifest `incident2` als datenabhängig aus Gate A entfernt hat | 30,5 min (D) | D-Läufe #18–200 (23.09.–14.10., n=46): 35 ✓, 10 ✗. In der Kette: 1× ✗ #954 (03.10., Contract-Tests: `QUANT_BACKTEST_SIGNAL_INTELLIGENCE = FAIL`, `PIT_PASS FAIL`) | **A**; datenabhängige Tests darin → **B** |
| 28 | **Freshness-Contract fail closed** | market-data-refresh.yml:525–575 | nach Kette | Marktlauf grün, aber Produktstand eingefroren | stilles Einfrieren (wie 29.09.–02.10.) | global (Alarm + verhindert Supertrader/Im-Blick-Folgestufe) | Freshness-Monitor, core-ci live health, Intraday-Watchdog | ≤ 15 min | 3 ✗ (#751 30.09., #834 02.10., #812 01.10.) = **echte Befunde** (P0_DATA_PIPELINE_FROZEN) | **A** |
| 29 | TI-Build: Drift `verify-technical-intelligence --every 50` + Hygiene | technical-intelligence-build.yml:242–248 | S, WR, D | TI v3 ≠ Engine | falsche Chartbild-Szenarien | produkt | quant-ci:83 | 59,8 min | S #47–535: 14 ✓ / 14; D 5 / 5 ✓ | **A** |
| 30 | Long-Series: Discover-Rebuild + Verify (2×), Hygiene, Schlüssel-grep | long-series.yml:91–135 | S, D | Wochenreihe bricht Discover | falsche 5J-/Max-Charts | global | verify-discover-data 2× im Lauf | 9,3 min | S #43–1731 (19.09.–17.10.): 10 ✓, 1 ✗; D: 8 ✓, 2 ✗, 1 cancelled (Ursachen nicht geprüft) | **A** |
| 31 | Supertrader Signale: „Integrität vor dem Commit“ (ganze Supertrader-Suite) | supertrader-signals.yml:46–47 | S, D | fehlerhafte Handelssignale | **falsche Produktions-Signale** | produkt | supertrader-ci (gleiche Suite) | 2,2 min | #1–35 (29.09.–23.10.): 29 ✓, 6 ✗. 4 geprüfte ✗ (15.–17.10.) alle `not ok 99 – signals-core: ohne Historienlisten, alles andere unverändert` = echter Defekt; Signale 3 Sitzungen alt (deckt sich mit core-ci health „Supertrader STALE“ 15./16.10.) | **A** |
| 32 | „Regressionssuite“ (ganze Quant-/Discover-Suite) in company-names, coverage-metrics, sec-consumer-fundamentals, index-membership, universe-master, update-sec-fundamentals | company-names.yml:84, coverage-metrics.yml:100, sec-consumer-fundamentals.yml:139, index-membership.yml:61, universe-master.yml:194, update-sec-fundamentals.yml:80 | S, D, P | Code-Regression | – | global für diesen Erzeuger | genau das Muster, das Market Refresh am 12.10. abgeschafft hat | – | sec-consumer S (21.09.–19.10.): 2 ✓ / 3 ✗; D: 4 ✓ / 3 ✗ (je 1× Regressionssuite). coverage-metrics S: 1 ✓ / 4 ✗; D: 4 ✓ / 10 ✗ (u. a. 2–3× „Abweichung je Titel erklären“, 3× Regressionssuite) | **B** (auf Gate-A/B/C-Muster umstellen) |

### 1.3 Auslieferung (Production Deploy)

| # | Gate | Datei:Zeile | Auslöser | verhindert konkret | Wirkung | Empirie | Klasse |
|---|---|---|---|---|---|---|---|
| 33 | Nur `workflow_run` mit `success` liefert aus | pages-release.yml:136–139 | WR | Auslieferung eines verworfenen Datenstands | global | 33 von 100 Läufen skipped (#5118–5217, 22.–23.10.) | **A** |
| 34 | `build-release.mjs` Throws (Identität, Shard-Budgets, SEC-Budget 8 MiB, Mock-Quellen) | scripts/vu2/build-release.mjs:13–269 | alle | Identitäts-Mismatch, Budget-Überlauf, Mock im Release | **global** – auch bei einem einzelnen Titel (z. B. `INSPECTOR_IDENTITY_MISMATCH`, `QUARTERLY_SHARD_BUDGET_EXCEEDED` je CIK) | 1 ✗ im Fenster (company-intelligence-live) | **A**; Einzeltitel-Throws → **B** (isolieren) |
| 35 | Production Smoke über das gebaute Release (Playwright) | pages-release.yml:248–258 | alle | kaputte Seite live | global | im Fenster 0 ✗ | **A** |
| 36 | Deploy-Switch mit offenem Tab | pages-release.yml:262–266 | nur PR | – | PR | – | **A** (richtig begrenzt) |
| 37 | Delivery Contract (Commit-Identität, kein Mock, keine SEC-Kanonik, Redirect-Regeln) | pages-release.yml:268–318 | alle | falscher Commit / Mock / interne Daten öffentlich | global | 0 ✗ | **A** |
| 38 | Access-Gate + Smoke durch das Gate | pages-release.yml:319ff | alle | ungeschützte Seiten | global | 0 ✗ | **A** |
| 39 | Company-Intelligence-Live-QA, fail-closed Rollback | pages-release.yml:~395–597 | nach Deploy | fehlerhafte CI-Freischaltung | produkt (deaktiviert nur CI) | 1 ✗ in #5118–5217 | **A** (Vorbild: Klassifikation TRANSIENT_INFRA + begrenzte Wiederholung) |

### 1.4 Reine Monitore (blockieren nichts, machen rot / benachrichtigen)

| # | Monitor | Empirie | Klasse |
|---|---|---|---|
| 40 | core-ci `live` (`data-quality --strict`, `state-gate --strict`, `system-health --site --strict`), core-ci.yml:104–129 | S 05.–22.10.: **14 ✗ / 18** (Ursachen siehe Kernaussage 4) | **B** |
| 41 | freshness-monitor.yml | S 09.–23.10. (n=60): 35 ✓, **25 ✗** (Stichprobe 5: 3× „Ergebnis“, 1× Im Blick, 1× Produktstand P0, 1× Supertrader) | **C** (vierfach mit #28, #40, intraday-delivery-watchdog) |
| 42 | supertrader-live-smoke.yml | S: 7 ✓, 3 ✗ (Browser-QA gegen Produktion), 6 cancelled; WR (22.–23.10., n=60): 32 skipped, **12 cancelled**, 4 ✗, 12 ✓ | **B**; Concurrency **C** |

---

## 2. Concurrency-Befunde

| Gruppe | Workflows | Problem | Belege | Bewertung |
|---|---|---|---|---|
| `technical-intelligence-build` (fest, `cancel-in-progress:false`) | technical-intelligence-build.yml:193 | `workflow_run` ohne `branches:`-Filter. Übersprungene Upstream-Läufe von `claude/**` belegen die einzige Warteschlangen-Position und verdrängen gültige wartende Läufe. | #471–570: 86 skipped, 11 cancelled. #563–567 durch long-series #1955–1959 (alle `push` auf `claude/*`, skipped) | **C → reparieren (P1)** |
| `product-intelligence-materialization` (fest) | product-intelligence-materialization.yml:69 | Gleiches Muster (WR auf Market Refresh ohne Branch-Filter; Market Refresh hatte im Fenster #2069–2168 98 von 100 übersprungene Push-Läufe). Zusätzlich teilt der WC-Aufruf aus der Kette möglicherweise die Gruppe; GitHub-Verhalten für Concurrency in Reusable Workflows hier nicht gemessen. | #117–216: 89 skipped, 4 cancelled (alle `push`) | **C → reparieren (P1)** |
| `supertrader-live-smoke` (fest, **`cancel-in-progress:true`**) | supertrader-live-smoke.yml | Jeder Pages-Lauf (~alle 5 min, auch skipped) startet einen Smoke. Ein übersprungener neuer Lauf **bricht einen laufenden gültigen Smoke ab**. | WR n=60: 12 cancelled, 32 skipped | **C → reparieren (P1)** |
| `pages-production` (fest) | pages-release.yml | Ein laufender + ein wartender Lauf; ein neuer wartender ersetzt den älteren. Gewollt („neuester Stand gewinnt“). Delivery Contract liefert den Kopf aus (Z. 280–295). | #5118–5217: 24 cancelled, davon 19 WR | **A** – bleibt |
| `intraday-pacemaker-<ref>` (gemeinsam für Pacemaker, Snapshots, Watchdog-Reparatur) | intraday-*.yml | Gewollte Serialisierung der Schreiber auf `quant/data/market/intraday`. Ein wartender Lauf verdrängt einen wartenden. | Pacemaker #861–960: 12 cancelled; Snapshots-Schedule n=60: 8 cancelled | **A** – bleibt |
| `market-data-<ref>`, `long-series-<ref>`, TI-Build, Im Blick, home-refresh, company-logos | verschiedene | **Keine gemeinsame Sperre**, obwohl die Pfade sich überschneiden (discover/data, quant/data/technical, capabilities, freshness). Schutz nur über Rebase / Autostash in `push-with-retry.sh`. | 5× „Commit und Push“ ✗ in Market Refresh (bis 10.10.) mit `CONFLICT` in diesen Pfaden; 3× sec-consumer, je 1× coverage / index | **A** (Wettlaufschutz nötig); Umsetzung verbessern (P2) |
| PR-Gruppen `*-${{ github.ref }}` mit `cancel-in-progress:true` auf **Push nach main** | supertrader-ci, shell-ci, core-ci, screener, discover-frontend | Zwischen-Commits auf main bleiben ungeprüft (der neueste ersetzt sie). | supertrader-ci 12, shell-ci 12, discover-frontend 4 cancelled bei Push | akzeptabel (Nachfolger prüft den Kopf), **niedrig** |
| `company-intelligence-continuous-production` | refresh, refreeze-auto, universe-release, profile-source | Gewollte Serialisierung der CI-Produktion | nicht gemessen | **A** |

---

## 3. Klassifikation

### 3.1 A – kritischer Schutz (behalten)
Core-Tests (1), state-gate (2), CI Config (4), Quant-CI-Engine/Drift/FX/Hygiene (5), Discover-Reproduzierbarkeit (6), Isolations-**Regeln** (7, 8, 12), Research Access (15), Currency FX (19), Market Refresh Gate A und B (20, 25), Drift-Prüfungen (21, 29), Lifecycle-Health (23), Hygiene/Schlüssel beim Erzeuger (24), push-with-retry (26), Materialisierungs-Vollständigkeit (27), Freshness-Contract (28), Supertrader-Signal-Integrität (31), alle Pages-Auslieferungs-Gates (33, 35–39), Concurrency `pages-production` und `intraday-pacemaker`.

### 3.2 B – sollte Warnung bzw. Titel-Quarantäne statt globaler Sperre werden
- **core-ci live DQ-PX-4/-5/-1** (40): 1–7 Titel von ~6.200 machen die Plattform rot. Vorschlag: Ab einer Schwelle (z. B. > 0,5 % oder > 25 Titel) rot, darunter Warnung plus betroffene Titel im Bericht bzw. in der Quarantäne-Liste. Zusammen mit PR #858 (Reparatur).
- **system-health --strict für nicht kritische Systeme** (News, Security Master, Analyst Ratings): Warnung. Rot nur für EOD, Discover, Intraday, Supertrader, Quant.
- **verify-discover-data / build-release mit Einzeltitel-Fehlern** (22, 34): Titel als `unavailable` ausweisen (Mechanismus `discoverAvailability.unavailable` existiert schon, siehe state-manifest `remedy`). Global rot nur über einer Schwelle.
- **Datenabhängige Tests in der Materialisierung** (27): `market-signal-contract`, `product-services` u. a. dem Phasenmodell aus `eod-publish-gates.json` zuordnen (integrity vs. observability).
- **„Regressionssuite“ in sieben Daten-Erzeugern** (32) und Supertrader-Signale (31, nur der Code-Teil): Gate-A/B/C-Muster übernehmen.
- **Browser-Gates mit Infra-Flakes** (10, 11, 14, 42): Infrastruktur-Fehler (Playwright-Download, Timeouts) wie in `classify-live-failure.mjs` klassifizieren und begrenzt wiederholen. Echte Assertions bleiben rot.
- **coverage-metrics „Abweichung je Titel erklären“**: Bericht statt Sperre (4 von 10 Stichproben-✗).

### 3.3 C – redundant oder ohne zusätzliche Sicherheit
- **Fremd-Suiten in Produkt-CIs** (9, 12, 16, 18): Quant-Suite in 10 Workflows, Discover-Suite in 8. Da das jeweilige Pfad-Gate Quant-Änderungen schon verbietet, testet die Wiederholung den Datenstand von main, nicht den PR. Belege: CI-validate 8 von 12, SEC-CI 12 von 12, Social 8 von 11 Fehlschlägen in genau diesen Steps.
- **Vier Implementierungen derselben Isolationsregel** (7, 8, 12, 18) mit jeweils eigener Pfadliste.
- **Vierfache Frische-Überwachung** (28, 40, 41, intraday-delivery-watchdog).
- **`build-release.mjs` in 9 Workflows, Playwright-Installation in 20**; shell-ci baut zweimal im selben Workflow.
- **Concurrency-Regeln, die unabhängige Läufe verdrängen bzw. abbrechen**: TI-Build, Materialisierung, Supertrader-Live-Smoke.

---

## 4. Konsolidierungs-Vorschläge (priorisiert, nur Empfehlungen)

| Prio | Vorschlag | Lockerungsrisiko | Aufwand |
|---|---|---|---|
| **P1-1** | `branches: [main]` unter `workflow_run` in technical-intelligence-build.yml, product-intelligence-materialization.yml und supertrader-live-smoke.yml. Alternativ das `pages-release`-Muster (`…-ignored-{run_id}` für nicht erfolgreiche Upstreams). Bei Supertrader-Live-Smoke zusätzlich `cancel-in-progress:false` oder dasselbe Muster. | keins (Job-`if` bleibt). Achtung: `workflow_run.branches` filtert auf den Upstream-Branch – gewünscht. | S, je 2–4 Zeilen; CI-Config-Test (`scripts/ci/tests`) um die Regel „WR-Workflow in fester Gruppe braucht Branch-Filter“ ergänzen |
| **P1-2** | core-ci live: DQ-Regeln mit Schwelle bzw. Quarantäne, `system-health --strict` nur für kritische Systeme. Ziel: rot = Handlungsbedarf. | mittel. Ein einzelner falscher Titel ist dann nur noch Warnung. Mitigiert durch Titel-Liste im Bericht, Quarantäne-Kennzeichnung auf der Seite und #858-Reparatur. | M |
| **P1-3** | Einzeltitel-Isolation in `verify-discover-data` und den Einzel-CIK-Throws von `build-release.mjs`: Titel `unavailable` setzen, Lauf grün mit Warnung, global rot über Schwelle. | mittel. Ein Titel zeigt kurz „nicht verfügbar“ statt Daten. Kein falscher Kurs wird veröffentlicht. | M |
| **P1-4** | Gate-A/B/C-Phasenmodell (`eod-publish-gates.json`) auf company-names, coverage-metrics, sec-consumer-fundamentals, index-membership, universe-master, update-sec-fundamentals, supertrader-signals und die Materialisierungs-Tests übertragen. | gering. Gleiche Tests, nur anders eingeordnet; in Market Refresh belegt: 13 von 19 ✗ vorher → 0 von 9 nachher. | M (Manifest je Erzeuger, Runner existiert) |
| **P2-5** | Fremd-Suiten in supertrader-ci, company-intelligence validate, sec-fundamentals-ci und social-ci durch „betroffene Tests“ ersetzen: Importhülle der geänderten Dateien, Mechanismus aus `run-eod-publish-gates.mjs` wiederverwenden, oder nur auf quant-ci/discover-ci verlassen. | gering bis mittel. Fängt keine Querwirkung über erzeugte Daten mehr – dafür gibt es state-gate. | M |
| **P2-6** | Eine zentrale Pfad-Eigentums-Prüfung aus `core/registry/domains.json` (Feld `producer`, Produktpfade) generieren und die vier handgeschriebenen Listen ersetzen. Wichtig: dieselben Ausnahmen (Currency-Nachweise, CI-Stock-Hooks). | gering, wenn mit Vorher/Nachher-Abgleich über die letzten 100 PRs eingeführt | M–L |
| **P2-7** | Frische-Überwachung bündeln: Eine Quelle (`measure-pipeline-freshness` + `system-health`) und ein Alarm-Issue (`scripts/ci/pipeline-alarm.mjs`). freshness-monitor und core-ci live lesen dieselbe Bewertung statt eigener Schwellen. | gering (nur Monitore) | M |
| **P2-8** | Release-Artefakt einmal je PR bauen und als Artefakt wiederverwenden. Playwright-Browser cachen. Infra-Fehler klassifizieren und einmal wiederholen (Muster `classify-live-failure.mjs` / `retry-live-qa.mjs`). | gering. Echte Assertions bleiben blockierend. | M |
| **P3-9** | Schreiber-Koordination für Daten-Workflows mit überlappenden Pfaden: entweder strikte Pfad-Partitionierung je Erzeuger (domains.json) oder eine gemeinsame `main-writer`-Gruppe nur für den Commit-Job. Langläufer warten dann nicht auf den Abruf, nur auf den Push. | gering; Risiko längerer Wartezeit | M |
| **P3-10** | Branch-Schutz / Ruleset auf `main` mit wenigen produktbezogenen **Aggregator-Checks** (z. B. `core`, `quant`, `discover`, `supertrader`, `pages-pr`), Bypass für den Bot-Push der Datenläufe. Owner-Entscheidung. | keins (heute ist nichts erzwungen). Risiko: Datenläufe dürfen nicht blockiert werden → Bypass nötig. | S–M |

### Zielarchitektur-Prinzipien
1. **Betroffene Titel isolieren statt global sperren.** Ein Datenfehler bei 1 von 6.000 Titeln kostet einen Titel, nicht einen Nachtstand. Global rot nur über einer Schwelle oder bei Plattforminvarianten (Identität, Split-Faktoren, Mock, Schlüssel).
2. **Produktbezogene Sperren.** Ein PR bzw. Lauf wird nur von Prüfungen gesperrt, deren Eingänge er berührt. `state-gate.mjs` mit `blockingWhenPrTouches` ist das Vorbild.
3. **Nicht blockierende Qualitätsberichte.** Beobachtung (Gate C, Chart-Parität #859) läuft nach dem Commit und meldet über ein Alarm-Issue.
4. **Ereignisgesteuerte Prüfungen mit sauberen Auslösern.** `workflow_run` nur mit Branch-Filter; übersprungene Läufe belegen keine Warteschlange.
5. **Testergebnisse wiederverwenden.** Eine Suite läuft einmal je Commit und Code-Stand. Daten-Workflows prüfen nur Datenverträge; Code-Regressionen gehören in die PR-CI des Erzeugers.
6. **Getrennte Ebenen.** Entwicklung (PR-CI, Code), Datenproduktion (Phasen A/B/C je Erzeuger, eigener Schreibpfad) und Auslieferung (pages-release: Identität, Hygiene, Smoke) bleiben getrennt. Jede Ebene prüft nur, was in ihr entsteht.

### Kurzbewertung der laufenden PRs
- **#858** (automatische Reparatur der Wochenreihen, DQ-PX-4) trifft die häufigste Ursache von core-ci-live-rot: 9 von 14 geprüften roten Läufen. Das ist sinnvoll. Ergänzend bleibt P1-2 nötig, weil DQ-PX-5/-1 und system-health eigene Rotursachen sind.
- **#859** (Chart-Paritätsbericht, nicht blockierend) entspricht Prinzip 3. Damit es kein fünfter Frische- oder Qualitätsmonitor mit eigener Schwelle wird, sollte der Bericht in das gemeinsame Alarm-Issue (P2-7) münden.

## 5. Nicht gemessen / Grenzen
- Branch-Schutz: per API gelesen (nicht geschützt, keine Rulesets). Organisationsweite Regeln sind nicht sichtbar.
- Concurrency-Verhalten von `workflow_call` (Materialisierung in der Market-Refresh-Kette) gegenüber der Top-Level-Gruppe des aufgerufenen Workflows: nicht empirisch geprüft.
- Discover-Frontend-Budget (≤ 180 KB / ≤ 12 Requests): In 12 geprüften Fehlschlägen ist kein Budget-Verstoß eindeutig belegt; die Flake-Quote ist nicht quantifiziert.
- Vorsorge-CI-Reproduzierbarkeit (20 ✗) und long-series-Dispatch-✗ (2): Ursachen nicht untersucht.
- Laufzeiten ohne Warteschlangenzeit; GitHub-Schedules starten bis zu ~5 h verspätet (TI-Build-Cron 05:35, Start 09:37–13:27 UTC; Market-Refresh-Cron 22:30, Start 00:32–03:06 UTC).
- Einführungsdatum von `push-with-retry.sh` im flachen Klon nicht ermittelbar.
