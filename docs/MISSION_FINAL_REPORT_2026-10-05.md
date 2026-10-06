# Vision Universe: FINAL REPORT der Mega-Mission „Full Platform Hardening“

**Stand:** 05.10.2026, nach Abschluss der Merge-Kette und dem finalen Red-Team-Durchgang.
**Löst ab:** [MISSION_FINAL_REPORT_2026-10-04.md](MISSION_FINAL_REPORT_2026-10-04.md) (Stand vor der Merge-Kette) und [GAP_CHECK_2026-10-04.md](GAP_CHECK_2026-10-04.md).
**Gap-Check gegen den Mega-Prompt:** [GAP_CHECK_2026-10-05.md](GAP_CHECK_2026-10-05.md).

---

## 1. Ergebnis

**Die Mega-Mission ist technisch abgeschlossen.**

- **Merge-Kette:** Alle 30 vorgesehenen PRs sind auf `main`, in der Reihenfolge des Berichts vom 04.10.
- **Neue Fixes:** Acht PRs aus Problemen, die erst beim Mergen und im finalen Red Team sichtbar wurden: #434, #435, #437, #438, #439, #440, #441 und dieser Bericht.
- **Gemergt wurde** nur mit grüner CI.
  - Ausnahme ist das externe Vercel-Free-Tier-Limit.
  - Bei #401 war außerdem ein SEC-EDGAR-Ausfall (HTTP 503) rot. Er prüft nicht den Code dieses PRs (Abschnitt 7).
- **Owner-Themen:** Drei Themen bleiben offen und sind dokumentiert (Abschnitt 14). Keines davon ist für einen DoD-Punkt zwingend.

**main:** `710ac411e4f5` (Code-Stand nach #441; dieser Bericht kommt als reiner Doku-PR obendrauf).

---

## 2. Gemergte PRs

### Vor dem 04.10. abends (Owner-Freigabe)
#405 (Materialisierung erkennt neuere Faktorzeilen), #419 (Setup-Bündel, staleRepeats), #418 (LOGI-Fallback Supertrader).

### Merge-Kette 04./05.10. (Reihenfolge des Berichts)

| Schritt | PRs | Methode | Eingriffe |
|---|---|---|---|
| 1 | **#428** Deckungs-Neuabnahme | Squash | Konflikt mit dem SEC-Daily-Lauf vom 04.10. (13 erzeugte Dateien, auf main nur Zeitstempel). #428-Seite übernommen; die offiziellen Builder erzeugen denselben Inhalt. |
| 2 | **#386** Platform Hardening | Merge-Commit | `coverage-metrics.yml`: beide Seiten zusammengeführt. GROM mit dem offiziellen Builder neu erzeugt: Die Tagesreihe auf main bestand aus 270 Schlusskursen 0, und #386 liefert sie korrekt nicht aus. |
| 3 | **#423**, **#391**, **#394** → **#395**, **#396**, **#414** | Merge-Commit | keine. Die Basis wurde auf main umgestellt; ein Squash von #386 hätte add/add-Konflikte in jedem Kind-PR erzeugt. |
| 4 | **#390**, **#393** | Squash | keine |
| 5 | **#413** → **#421**, **#389**, **#422** | Merge-Commit / Squash | Siehe die Liste unter dieser Tabelle. |
| 6 | **#387** → **#397** → **#411** | Merge-Commit | keine (Gate A grün) |
| 7 | **#399**, **#402**, **#403**, **#406**, **#407**, **#408**, **#409**, **#410**, **#420**, **#398**, **#400**, **#388**, **#401** | Squash | Siehe die Liste unter dieser Tabelle. |

**Eingriffe in Schritt 5:**
- **#413/#421:**
  - Alte SEC-Daten vom 03.10. entfernt. Sie stammten aus Bot-Commits auf dem Feature-Zweig, und ein Merge hätte sie über die neueren Daten auf main gelegt.
  - Die Workflow-Fassungen von #386 übernommen.
  - `vorsorge-etf-universe.yml` auf env-Eingaben umgestellt, `vorsorge-ci.yml` mit permissions.
- **#389:** Die letzte Ausnahme im env-Wächter ist entfernt.
- **#422:**
  - wrangler-Pin und env-Eingabe in einer Zeile.
  - Der npx-Wächter läuft jetzt in CI Config.

**Eingriffe in Schritt 7:**
- **#398:** Debt-Register mit dem Builder neu erzeugt.
- **#400:** Die Benchmark-ID kommt jetzt aus `core/identity.js` (Identitäts-Wächter).
- **#388:** Auf das Discover-Modul begrenzt (Gate seit #390 wirksam); der Publisher-Teil ging nach **#437**.
- **#401:** Zwei Funktionen an derselben Stelle zusammengeführt.

### Neue PRs aus der Merge-Kette und dem finalen Red Team

| PR | Befund | Fix |
|---|---|---|
| **#434** | `pages-release.yml`: ein spät gestarteter Lauf checkte den neueren Kopf aus und brach mit `CHECKOUT_COMMIT_MISMATCH` ab. Der Kopf blieb unausgeliefert; die Produktion stand auf 10e66f0. | Abweichender Kopf nur, wenn er das Ereignis enthält (Vergleich „ahead“), sonst Abbruch wie bisher. Die Produktion wurde sofort per Dispatch nachgezogen. |
| **#435** | `sec-fundamentals-daily.yml` lief auf `claude/**`-Pushes echt: Daten auf Feature-Zweige, möglicher R2-Schreibvorgang mit unfertigem Code. | Ein push-Ereignis erzwingt `--dry-run`. Nachgewiesen in Lauf 37247453734: R2- und Commit-Schritte übersprungen, der Zweigkopf unverändert. |
| **#437** | Teil 2 von #388: Der Publisher nutzt `return-series.js#splitFactors`. | Splitfaktor ≤ 0 erzeugt keine negativen Kurse mehr. Bitgleich auf 14.775 Golden-Balken. |
| **#438** | Discover nannte bei fehlender Kursreihe immer „Redistributionsregel“, auch bei zu kurzer Reihe (GROM, DMN). | `INSUFFICIENT_HISTORY` mit passendem Satz, Datentest über alle Titel |
| **#439** | Vorsorge bildete `ref_`-Pfade selbst; im Identitäts-Wächter stand eine Ausnahme dafür. | `core/identity.js`, Ausnahme entfernt. Verhaltensgleich: 0 geänderte Vorsorge-Dateien. |
| **#440** | Die Adoption-Matrix maß Supertrader falsch als „eigen“. Der Split-Wächter erlaubte noch zwei konsolidierte Dateien. | Messung korrigiert. Die Liste schrumpft nur; veraltete Einträge scheitern. Doku auf Stand 05.10. |
| **#441** | Security-Review M4: Der Schlüssel-Scan deckte `workers/`, `api/` und `assets/` nicht ab und kannte Anthropic-, Cloudflare- und S3-Schlüssel nicht. | Abgedeckt, mit Gegenproben. Auf main sauber. |

**Geschlossen:** #427 (überholt durch #425). **Fremd gemergt:** #417, #424, #425, #429, #430, #431, #436 (andere Sitzungen).

---

## 3. Verbleibende offene PRs

Aus dieser Mission: **keine**.

Offen und nicht Teil dieser Mission (andere Sitzungen und Workstreams, eigene Freigabe):

| PR | Inhalt |
|---|---|
| #433 | Supertrader R14 Red-Team-Audit (keine Live-Regeländerung) |
| #432, #404, #353, #346 | Tiingo 2.0 / Tiingo-Audit (Codex) |
| #426 | Technical Intelligence V2 |
| #356 | Company Intelligence Rollout |
| #341, #334, #330, #324 | Marketstack / globale Datenschicht |
| #328 | Serverseitiger Passwortschutz für Research (betrifft Security H1) |
| #86–#92 | VU2-Workstreams |
| #95–#380 (VU-AUTHORING-REQUEST) | Social-Authoring-Anfragen |

---

## 4. Finaler CI-Status

- **main `710ac411e4f5`:** grün. Quant CI, SEC Fundamentals CI, Quant 2.0 Production Pages (Auslieferung) und Supertrader Production Smoke erfolgreich. Ein Smoke-Duplikat wurde vom nächsten Lauf verdrängt (cancelled). Die Fix-PRs #438/#439/#440 sind jeweils grün gelaufen (Discover CI, Core, Vorsorge CI).
- **Seit Beginn der Kette (04.10. 23:00 UTC) bis zum Merge von #401:** 188 Läufe auf main, **1 rot**. Das war das Pages-Rennen von 00:09, behoben mit #434; die Produktion wurde per Dispatch nachgezogen. „cancelled“ heißt: von einem neueren Lauf derselben Gruppe verdrängt.
- **Lokal auf dem finalen Code-Stand `710ac411e4f5`:**

| Suite | Ergebnis |
|---|---|
| Core | 65/65 |
| Discover | 338/338 |
| Quant | 2400/2400 |
| Supertrader | 178/178 |
| Social | 1959/1959 |
| Workflow-Wächter (`scripts/ci/tests`) | 13/13 |
| Vorsorge | 97/97 |
| Screener | 16/16 |
| Python (SEC, Quant) | 490 OK |

- **Reproduzierbarkeit auf main:**
  - Discover-Build: 0 abweichende Dateien
  - Currency-Debt-Register: reproduzierbar
  - Company Master: 683 bestanden, 0 Befunde
  - Fundamentals-Abgleich: `reconciled: true`
  - Schlüssel-Scan (`--all`): sauber
- **Golden Paths** (Core-Suite): Stock (Security → Kurs → Chart → Fundamentals → Quant → News), Discover und Supertrader.
- **Extern:** Vercel-Free-Tier (`api-deployments-free-per-day`) und SEC EDGAR (HTTP 503 am 05.10. ab ca. 02:18 UTC).

---

## 5. Core-Adoption-Matrix (gemessen, nicht geschätzt)

`node scripts/core/adoption-matrix.mjs` auf main (mit #440):

| Bereich | Security Identity | Prices | Fundamentals | Corporate Actions | Health/DQ | Core Client |
|---|---|---|---|---|---|---|
| Discover | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | – |
| Quant | ✅ Core | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | – |
| Markets | – | – | – | – | – | – |
| Screener | ✅ Core | ⚪ indirekt | ⚪ indirekt | – | – | – |
| Supertrader | 🟢 gemeinsam | ⚪ indirekt | ⚪ indirekt | – | – | – |
| Technical | ✅ Core | – | – | – | – | – |
| News | ✅ Core | – | – | – | 🔴 eigen | ✅ Core |
| Company Pages | – | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | – | – |
| Status | ✅ Core | – | – | – | ✅ Core | ✅ Core |

Eigene Split-Bereinigungen im Repository (Ziel: nur quant/engines/return-series.js):
  providers/tiingo/adapter.js
  quant/engines/mock-generator.js
  quant/engines/return-series.js
  quant/engines/technical/canonical-bars.js
  scripts/market/study-momentum-return-basis.mjs
  scripts/supertrader/validation/lib.mjs

**Parallelwelten:**

| Parallelwelt | Status |
|---|---|
| Split-Bereinigung | Sechs Stellen statt acht, jede begründet: `return-series.js` (die Definition); `canonical-bars.js` (OHLC und Volumen, Gleichheit festgeschrieben, #410); Supertrader-Validierung (versiegelt, Gate A); Mock-Generator und Tiingo-Adapter (Rohdaten); Studie. Der Wächter lässt keine neue zu, und die Liste schrumpft nur. |
| Identität | Ausnahmen im Wächter: nur Kommentare, regelgleiche Rohzeilen-Normalisierung und der Tiingo-2.0-Workstream. Vorsorge ist mit #439 umgestellt. |
| `core/client.js` | Status, News, Golden Paths. Nächster Schritt: Discover-Detail (reines Refactoring nach #401), dann der Screener. |
| Datenalter in News | rechnet die Seite selbst. Nächster Schritt: `core/health.js` (P3). |
| Gesamtrendite | `investorReturn` und `canonical-total-return.js`. Methodik-Version nötig, eigener Fachentscheid. |

---

## 6. Single Source of Truth

| Datum | Quelle | Beleg |
|---|---|---|
| Wertpapier-Identität | `core/identity.js` (ADR-001) | Wächter `identity-adoption.test.mjs` |
| Tageskurs und Split-Bereinigung | `return-series.js#splitFactors` (ADR-002) | #388, #437, #410; Wächter `adoption-matrix.test.mjs` |
| Veröffentlichter Schlusskurs | `published-close.js#roundClose` (unter 1 $ kein Cent-Verlust) | #386 |
| 52-Wochen-Hoch und -Tief | Plattformdefinition, 252 Handelstage aus Tageshoch und -tief | #398, #399, #409 |
| Movers, Steigend/Fallend | EOD-Tagesreihe (`movers-eod-1.0.0`) | #400 |
| Vortagesschluss | Tagesreihe, sobald sie die Sitzung enthält | #401, #402 |
| Deckungskennzahlen | aktuelle R2-Messung statt Skalierungsbericht vom 11.09.; jede Abweichung je Titel erklärt | #428 |
| Universum | Company Master; der Stand wartet auf die Tiingo-2.0-Freigabe | Owner |

---

## 7. Pipeline-Zuverlässigkeit

| Thema | Stand |
|---|---|
| Einheitliches Commit-Protokoll | `push-with-retry.sh`: Kopf auschecken, Rebase prüfen, laut scheitern statt `|| true` (ADR-005, #386, #428) |
| Materialisierung | erkennt neuere Faktorzeilen am gleichen Stichtag (#405). PIT-Parity weist Wiederholungen aus, `mismatches == 0` unverändert (#419). |
| Diff-Gates | wirken in flachen Checkouts (#390). Erster echter Fang: #388. |
| Concurrency | PR-Läufe sind aus Produktions-, Anbieter- und Zustandsgruppen gelöst (#393). |
| Feature-Zweige schreiben keine Produktionsdaten | #435 |
| Pages-Auslieferung | kein unausgelieferter Kopf mehr nach schnellen Merges (#434) |
| Eingaben, Rechte, Lieferkette | alle Dispatch-Eingaben über env (Wächter, 0 Ausnahmen); `permissions` in jedem Workflow (Wächter); `wrangler`/`sharp`/`npx` exakt gepinnt (Wächter). Alle Wächter laufen in CI Config bei jeder Workflow-Änderung. |
| Deckungslauf | Diagnose vor dem Commit: Unerklärtes bricht ab (#428). Ändert sich die Deckung, scheitert der wöchentliche Lauf bewusst, bis die Abweichung je Titel erklärt und neu abgenommen ist. Das ist die Owner-Regel „Baseline nicht einfach aktualisieren“. |
| SEC-Daily bei SEC-Ausfall | bricht ab (HTTP 503 nach 5 Versuchen), statt den Tag zu überspringen. Richtig, denn sonst fehlten die Filings dieses Tages. Am 05.10. ab ca. 02:18 UTC aufgetreten; der nächste erfolgreiche Lauf holt die Tage nach. |

---

## 8. Datenqualität

- **Regeln:** `core/data-quality.mjs`.
- **Diagnosen:** `adjustment-steps` (#420) und `coverage-delta` (#428). Jede Deckungsabweichung bekommt eine Klasse; UNEXPLAINED bricht ab.
- **Gefundene und behobene Datenfehler:**
  - GROM: Nullchart aus 270 Schlusskursen 0. Seit #386 wird die Reihe nicht mehr ausgeliefert, seit #438 mit dem richtigen Grund.
  - Splitfaktor ≤ 0 im Publisher (#437).
  - Doppelte Dividende LOGI 2024/2025 beim Anbieter: durch das Gate gesperrt, Anbieterkorrektur angefragt (#420).
- **Reproduzierbarkeit:** Discover-Build, Debt-Register, Vorsorge-Build und Company Master werden gegen den Quellcode geprüft.

---

## 9. UI und Performance

- **UI-Fixes:**
  - 52W folgt der Plattformdefinition (#398, #399).
  - Vortag aus der Tagesreihe (#401, #402).
  - Scroll-Gedächtnis (#406).
  - Sitzungsdatum statt „heute“ (#408).
  - LOGI-Fallback (#418).
  - Ehrlicher Grund bei fehlender Reihe (#438).
- **Nutzlast:**

  | Seite | vorher | nachher | PRs |
  |---|---|---|---|
  | Supertrader | 3,68 MB | 1,80 MB | #397, #411 |
  | Quant-Aktienseite | 9,0 MB | 5,46 MB | – |
  | Faktorprojektion | 19,2 MB | 3,3 MB | #403 |

- **Browser-QA:** Discover-Gates in Chromium und WebKit, 390 und 1440 px. Supertrader Gate F, 390 und 1280 px.
- **Bewusst nicht:** ein gemeinsames Komponentensystem ohne doppelten Fehler (Auftrag §11) und ein Cache mit Content-Hash (Build-Umbau, P3).

---

## 10. App- und PWA-Readiness

- APP_READINESS (Mobile-Domäne, Push-Ereignisschema, Trennung der Nutzerdaten), ADR-004.
- **PWA Stufe 1 auf main (#407):** Manifest, Icons, Offline-Hinweis, kein Daten-Cache. Gecachte Kurse würden als aktuell erscheinen.
- **Nächster Schritt:** Watchlist auf `instrumentId`, die erste gemeinsame Funktion für PWA, App und Notifications.

---

## 11. Security

| Punkt | Stand |
|---|---|
| Script-Injection über Dispatch-Eingaben | geschlossen: alle Workflows, Wächter mit 0 Ausnahmen (#386, #389, #413, #421) |
| Token-Rechte | `permissions` in jedem Workflow (Wächter, #421) |
| Lieferkette (M1) | `wrangler@4.147.0`, `sharp@0.34.5`, jedes `npx`/`npm install` exakt (Wächter, #422). SHA-Pins für `actions/*` bewusst nicht: nur Erstanbieter. |
| Produktionsschreibrechte aus Feature-Zweigen | geschlossen (#435) |
| Schlüssel-Scan (M4) | Worker, API, Assets; Anthropic, Cloudflare, S3 (#441). Offen: ein Scan der vollen Git-Historie (gitleaks), eigener PR mit Werkzeugwahl. |
| Social-Worker `?key=` (M3) | **Owner**, siehe Abschnitt 14 |
| Research-Zugangsmaske nur clientseitig (H1) | **Owner-Entscheidung**; serverseitige Lösung liegt als #328 (andere Sitzung) |
| `vu-live` ohne Verbindungslimit (M5) | offen. Ein Limit je IP ändert das Live-Verhalten (NAT, Mobilfunk) und braucht eine Produktentscheidung über die Schwelle. |
| L1, L2, L4 | Low, dokumentiert in `SECURITY_REVIEW.md` |
| Secrets in dieser Mission | keine ausgegeben. Fundstellen wurden nur gekürzt gezeigt (Testattrappe). |

---

## 12. Developer Experience

- `CLAUDE.md` mit den Arbeitsregeln (#391), RUNBOOK („Der Kurs von X ist veraltet“), DATA_FLOWS, PIPELINES, FRONTEND, ADR-001…005.
- **Wächter, die einen Fehler sofort benennen:**
  - Identität, Split, env-Eingaben, permissions, Concurrency, npx-Pins, Pages-Auslieferung, SEC-Daily-Trockenlauf.
  - Testisolation: kein Test schreibt committete Dateien (#386).
- **Gefunden, P3, offen:** Die Test-Suiten hinterlassen Verzeichnisse in `/tmp`. Ein Quant-Lauf erzeugt 128 Einträge, einzelne über 100 MB. Auf CI-Läufern ohne Folgen; lokal füllt es die Platte. Nächster Schritt: Aufräumen in den betroffenen Tests (`vu-scale`, `vu-issuer-out`, `vu-persist-log`, `vu-bucket`, `vu-facts`).

---

## 13. Definition of Done

| # | Kriterium | Stand | Beleg |
|---|---|---|---|
| 1 | Reale Architektur verstanden und dokumentiert | ✅ | `docs/architecture/*`, `VISION_UNIVERSE_ARCHITECTURE.md`, DATA_FLOWS, PIPELINES |
| 2 | Kritische Architekturprobleme gefunden | ✅ | Berichte 03.–05.10. Neu in der Kette: Pages-Rennen, Produktionsläufe auf Feature-Zweigen, unwirksame Wächter (Workflow-Tests, Split-Liste, Matrix-Messung), Nullchart GROM, falscher Grund bei fehlender Reihe. |
| 3 | Sichere relevante Refactorings | ✅ | #388/#437 (bitgleich), #394, #396, #403, #428, #439 (0 Datenänderung) |
| 4 | Zentrale Core-Struktur | ✅ | `core/` auf main: Identity, Client, Health, DQ, Diagnose, Golden Paths |
| 5 | Source of Truth | ✅ mit benanntem Rest | Abschnitt 6. Rest: Universum bis Tiingo 2.0 (Owner), Methodik der Gesamtrendite |
| 6 | Kritische Pipelines robuster | ✅ | Abschnitt 7 |
| 7 | Datenqualität systematisch prüfbar | ✅ | Abschnitt 8 |
| 8 | Systemzustand und Frische sichtbar | ✅ | `/status/`, Frische-Kennzeichen, Herkunft je Lauf. Die News weisen ihren Stand (21.09.) aus. |
| 9 | UI geprüft, relevante Fehler behoben | ✅ | Abschnitt 9 |
| 10 | Wiederverwendbare UI-Logik, wo sinnvoll | ✅ (bewusst eng) | Scroll-Gedächtnis (#406). Mehr Abstraktion ohne doppelten Fehler widerspräche §11. |
| 11 | App-Readiness | ✅ | Abschnitt 10 |
| 12 | Kritische Regressionstests | ✅ | Jeder Fix mit Test und Gegenprobe; Golden Paths |
| 13 | Architektur und Betrieb dokumentiert | ✅ | ADRs, RUNBOOK, `CLAUDE.md`, CORE_ADOPTION (Stand 05.10.), dieser Bericht |
| 14 | main stabil | ✅ | Abschnitt 4 |
| 15 | Klare Liste verbleibender Risiken | ✅ | Abschnitt 15 |

---

## 14. Verbleibende Owner-Entscheidungen

Keines dieser Themen blockiert einen DoD-Punkt.

| Thema | Stand | Warum kein DoD-Blocker | Empfehlung |
|---|---|---|---|
| **Social-Worker `?key=`** (Security M3) | Der Worker nimmt den Admin-Schlüssel auch als Query-Parameter an; er landet in Logs und im Referer. | Security-DoD verlangt geprüfte und dokumentierte Risiken; das ist erfüllt. Abschalten kann nur, wer den Meta-Connect-Fluss kennt: Er nutzt den Parameter, solange die Sitzung (`session.js`) nicht bestätigt ist. | Meta-Connect über die Sitzung bestätigen, danach `?key=` entfernen und nur `Authorization: Bearer` annehmen. |
| **Tiingo-Skalierungsbericht** | Vom 11.09. Seit #428 nur noch Rückfall: Die technische Deckung kommt aus der R2-Messung. | Kein Produktwert hängt mehr daran. | Neu rechnen nur bei Bedarf (`tiingo-scale.yml`, kostet Anbieterabrufe). |
| **News-Zeitplan** | Die News stehen seit 21.09.; die Seite weist das aus (DoD 8). | Frische-Sichtbarkeit ist erfüllt; ob und wie oft neu erzeugt wird, ist Produkt und Kosten. | Zeitplan festlegen oder die Seite als Archiv kennzeichnen. |
| Universum / Tiingo 2.0 | Wartet auf die Freigabe von #353/#404/#432 (Codex). | eigener Workstream | Freigabe-Reihenfolge der Tiingo-PRs festlegen |
| Vercel-Plan | Das Free-Tier-Limit macht Preview-Deployments an aktiven Tagen rot. | extern; GitHub Pages ist die Produktion | Plan anheben oder Previews auf Bedarf schalten |

---

## 15. Verbleibende Risiken und technische Schulden

| Thema | Schwere | Nächster Schritt |
|---|---|---|
| Identität tickerbasiert (keine ISIN/FIGI) | High | ADR-001 Stufe 2 |
| Universum veraltet bis zur Tiingo-2.0-Freigabe | High | Owner |
| Research-Zugangsmaske nur clientseitig (H1) | High, falls als Schutz verstanden | Owner (#328) |
| `vu-live` ohne Verbindungslimit (M5) | Medium | Produktentscheid zur Schwelle, dann Worker |
| Social `?key=` (M3) | Medium | Owner, siehe Abschnitt 14 |
| Historien-Scan nach Secrets (gitleaks) | Medium | eigener PR mit Werkzeugwahl |
| `discover/data/`: mehrere Schreiber (z. B. Langreihen-Lauf und Builder) | Medium | Erzeugerhoheit je Unterpfad (ADR-005) |
| LOGI-Gesamtrendite (Anbieter) | Medium | durch das Gate gesperrt; Anbieterkorrektur |
| Tests hinterlassen `/tmp`-Verzeichnisse | Low (lokal) | Aufräumen in den Tests |
| Datenalter in News selbst gerechnet | Low | `core/health.js` |
| `core/client.js` noch nicht in Discover-Detail | Low | reines Refactoring |
| Cache ohne Content-Hash | Low | Build-Umbau |

---

## 16. Finaler Red-Team-Durchgang (05.10.)

| Prüfung | Ergebnis |
|---|---|
| Hat ein Merge eine Änderung verloren? | Nein. Die Kernänderung jedes gemergten PRs ist auf main (24 Stichproben, je PR eine). |
| Konfliktauflösungen ehrlich? | Erzeugte Dateien wurden nur über die offiziellen Builder aufgelöst, mit Gegenprobe (#428, #386, #398). Code-Konflikte: beide Seiten erhalten (#386, #388, #401, #422). |
| Gate abgeschwächt? | Nein. Mehrere Gates wurden **verschärft**: env-Wächter ohne Ausnahme, Identitäts-Wächter ohne Vorsorge-Ausnahme, Split-Liste schrumpft nur, Schlüssel-Scan breiter. Auf #388 hat das Discover-Gate einen echten Modulübergriff gefunden; aufgelöst durch Aufteilen statt durch eine Ausnahme. |
| Baseline ohne Erklärung übernommen? | Nein. Die Deckung ist je Titel erklärt (#428). |
| Fachliche Modelle verändert? | Nein. Quant-, Supertrader-, Ranking- und Technical-Logik sind unverändert. #400 und #401 ändern Ausgaben mit eigener Methodik-Version bzw. als Fehlerkorrektur, wie im Bericht vom 04.10. vorgesehen. |
| Wächter, die nie liefen | gefunden und behoben: npx-Wächter nur in Quant CI (#422 → CI Config); Matrix-Messung falsch (#440). |
| Produktionsdaten aus Feature-Zweigen | gefunden, aus #413/#421 entfernt, Ursache behoben (#435) |
| Externe Ausfälle als Codefehler ausgegeben? | Nein. Vercel und SEC sind belegt, jeweils mit einem Neustart; kein Gate gelockert. |
| Merges ohne Freigabe | Gemergt wurden die freigegebenen PRs der Kette und die Fixes aus Problemen, die dabei entstanden („beheben, testen, weiterarbeiten“). Kein fremder PR. |
| Secrets | keine ausgegeben |

---

## 17. Aussage

**Die Mega-Mission ist technisch abgeschlossen.**

- `main` ist fachlich und technisch stabil.
- Alle 15 DoD-Punkte sind erfüllt.
- Keine innerhalb dieses Auftrags umsetzbare P0-, P1- oder P2-Arbeit ist mehr offen. Was bleibt, ist entweder eine Owner- oder Produktentscheidung (Abschnitt 14) oder P3 (Abschnitt 15).
- Core-Adoption und verbleibende Parallelwelten sind gemessen und dokumentiert (Abschnitt 5, [CORE_ADOPTION.md](architecture/CORE_ADOPTION.md)).
- Es gibt keinen offenen PR dieser Mission.
- Der finale Red-Team-Durchgang ist abgeschlossen (Abschnitt 16).
