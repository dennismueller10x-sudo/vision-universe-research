# US-Wertpapierstamm und Firmennamen – wöchentliche Aktualisierung (vorbereitet, Zeitplan aus)

Stand 28.10.2026. Owner-Entscheidung vom selben Tag: regelmäßige, kontrollierte Aktualisierung des Security Masters und der Firmennamen. Zielrhythmus wöchentlich, nach der Aktualisierung von Stammdaten und Universum. Dieses Dokument gehört zum Draft-PR mit `.github/workflows/security-master-weekly.yml`. Ein Zeitplan ist **nicht** aktiv, und es wird **keine** Repository-Variable gesetzt.

## Warum

| Verbraucher | liest | Grenze | Stand 28.10. |
|---|---|---|---|
| Supertrader-8-Tageslauf (Eingangsprüfung `input-gate.mjs`) | `us-security-master.json` (Instrumenttyp, Aktivstatus), `company-names.json` | 60 bzw. 45 Tage | Master 47 Tage (`generatedAt` 11.09.), blockiert ab ca. 10.11.; Namen 17 Tage, blockiert ab ca. 25.11. |
| Systemzustand | `company-names-summary.json` | Warnung 720 h | Warnung ab ca. 10.11. |
| Quant-Backtests | `us-security-master.json` (`canonical_id`, `masterHash`) | Schlüsselwechsel = Neuaufbau | – |

Bisher gab es für den Master keinen Workflow; der letzte Lauf war 34611793308 am 11.09. auf einem nie gemergten Zweig. `company-names.yml` lief nie per Dispatch, sein letzter echter Stand vom 11.10. entstand offline.

## Was der PR tut, mit den bestehenden Erzeugern

| Teil | Änderung |
|---|---|
| `scripts/market/build-us-security-master.mjs` | Zwei Schalter, ohne sie ändert sich nichts. `--require-provider`: ohne Anbieterliste Exit 3 vor dem ersten Schreiben; bisher entstand mit Exit 0 ein reiner Bestandsstand (BASELINE_ONLY). `--stamp`: fester Zeitstempel je Lauftag, derselbe Lauf mit derselben Liste ergibt bitgleiche Dateien. Klassifikation, Abgleich und Engine (`quant/engines/us-security-master.js`) bleiben unverändert. |
| `scripts/market/build-company-names.mjs` | unverändert; aufgerufen nur mit `--sec` (SEC und Repository-Quellen, keine Tiingo-Metadaten) |
| `scripts/market/security-master-refresh-gate.mjs` | neu: Übernahme-Gate G1–G10, fail closed (Exit 4), Bericht als CI-Artefakt |
| `.github/workflows/security-master-weekly.yml` | neu: nur `workflow_dispatch`, `commit` standardmäßig `false`, Zeitplan nur als Kommentar, ADR-005, keine Secrets |
| `core/registry/domains.json` | neue Datenart `usSecurityMaster`; `companyNames.workflow` ergänzt; `securityMaster` (Produkteignung) bleibt ohne Workflow |
| `quant/tests/security-master-weekly.test.mjs` | Abschaltung, ADR-005, genaue Commit-Pfade, Gate-Fälle, Erzeuger fail closed und idempotent |

**Quellen, alle kostenfrei und ohne neue Anbieter:**
- Tiingo-Tickerverzeichnis `supported_tickers.zip`: offene Datei, kein Kursabruf, kein Schlüssel. Der Workflow übergibt keinen.
- SEC `company_tickers_exchange.json`: ohne Schlüssel, mit erklärtem User-Agent.
- Es gibt **keine** Tiingo-Metadatenabfragen; Namen ohne Treffer bleiben so wie zuletzt.

## Übernahme-Gate (fail closed)

| | blockiert, wenn | vorgeschlagene Grenze |
|---|---|---|
| G1 | Anbieterliste nicht erhoben (`status != OK`, `providerFetch != FETCHED`) | – |
| G2 | Bestand nicht vollständig abgeglichen oder destruktive Verletzung | – |
| G3 | Anbieterzeilen weichen vom letzten Stand ab | ±5 % (Stand 108.594) |
| G4 | ausgelieferte Zeilen fallen | höchstens −50 |
| G5 | eine Bestands-`securityId` fehlt oder folgt nicht `core/identity.js` | 0 |
| G6 | **neue** doppelte `canonical_id` (7 bekannte Doppelungen der Anbieterliste werden ausgewiesen) | 0 |
| G7 | Wechsel je stabiler `securityId`: `canonical_id` / Instrumenttyp / aktiv → inaktiv / Eignung / Ticker | 25 / 25 / 50 / 50 / 25 |
| G8 | Klassifikator-Version wechselt ohne ausdrückliche Freigabe (`allow_version_change`) | – |
| G9 | Namensschicht: Produktuniversum anders, `securityId` fehlt, Abdeckung fällt, zu viele Namenswechsel | −20 Namen / 200 Wechsel |
| G10 | Eingaben fehlen oder sind unlesbar | – |

Die Grenzen sind ein Vorschlag und eine **Owner-Entscheidung**. Gemessen ist bisher nur, was ein veralteter Lauf auslösen würde: Eine Anbieterliste mit altem `endDate` setzt 7.794 Titel auf inaktiv, und G7 blockiert das.

**Nachvollziehbarkeit:**
- Tickerwechsel, Delistings (aktiv → inaktiv), Reaktivierungen, `canonical_id`-Wechsel und Namenswechsel werden je stabiler `securityId` gezählt und mit Beispielen berichtet.
- Neue Listings zählt der Erzeuger (`NEW_ELIGIBLE_ADDITIONS`), liefert sie aber aus Lizenzgründen nicht aus. Ihr Weg ins Produkt ist die Tiingo-2.0-Veröffentlichung, nicht dieser Lauf.

**Idempotenz und Datenwachstum:**
- Die Erzeuger schreiben je Lauf alle Zeitstempel neu, rund 9,7 MB Master und 5,6 MB Namen.
- Das Gate übernimmt deshalb nur, wenn sich **fachlich** etwas geändert hat oder der letzte Stand mindestens 21 Tage alt ist. Sonst entscheidet es `SKIP_NO_MATERIAL_CHANGE`.
- So bleiben beide Höchstalter (60 und 45 Tage) sicher eingehalten, ohne wöchentlich 15 MB zu committen und ohne jede Woche die Backtest-Schlüssel zu ändern.

## Ist eine wöchentliche Aktualisierung zuverlässig möglich?

**Technisch ja, mit den bestehenden Quellen:**
- Es sind zwei Abrufe ohne Kontingentverbrauch nötig.
- Das Tickerverzeichnis wird schon werktäglich von `tiingo2-universe-refresh.yml` gelesen, das 10 von 10 Läufen bestanden hat (14.–27.10.).
- Lokal geprüft: fail closed ohne Liste, bitgleich bei Wiederholung, Gate blockiert die realistischen Fehlbilder.

**Fachlich erst nach diesen Voraussetzungen (offen):**

| # | Voraussetzung | wer |
|---|---|---|
| P1 | **Erster Lauf = Versionssprung** 1.1.0 → 1.3.0 des Klassifikators. Offline schon 142 Instrumenttyp-Änderungen. Der Lauf braucht `allow_version_change=true` und eine Vorher/Nachher-Prüfung aus dem CI-Artefakt (CLAUDE.md: Fachmodelle nur mit Vergleich). | Owner |
| P2 | **Quant-Backtests:** Jede Master-Übernahme ändert `masterHash`; geschützte Backtests melden `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` (`server/quant-backtest-reader.cjs`). Die Folge muss akzeptiert oder ein Neuaufbau eingeplant werden. | Quant-Owner |
| P3 | **Grenzen G3–G9** bestätigen oder anpassen. | Owner |
| P4 | **Produkteignung** (`eligibility.json`, Status „Security Master STALE“) bleibt ausgeklammert: Eine Neuberechnung ist eine Universumsänderung, und die nachträglichen Korrekturen (`apply-name-layer-class`, `apply-exchange-directory`) müssten mitlaufen. Eigene Entscheidung. | Owner |
| P5 | **Namen ohne Tiingo-Metadaten:** Neue oder unaufgelöste Titel bekommen nur SEC- oder kuratierte Namen. Ob für Lücken weiter Tiingo-Metadaten (bestehender Plan, rund 20–50 Anfragen je Lauf) genutzt werden dürfen, ist eine Owner-Frage; dieser PR fragt nicht an. | Owner |
| P6 | **Zeitplan:** erst nach einem manuell geprüften Lauf (P1) in einem eigenen PR; Vorschlag Mittwoch 09:41 UTC. Nicht über eine Variable schaltbar: Ein Zeitplan muss im Review sichtbar sein. | Owner |

**Nicht beeinträchtigt:**
- Der Nachtlauf schreibt nichts unter `security-master/` und teilt sich die Concurrency-Gruppe `market-data-<branch>`, deshalb läuft nichts parallel.
- Gepusht werden genau die sechs Dateien (`PUSH_OWNED_PATHS`), nie `eligibility.json` und nie `discover/data`.

## Freigabevorlage

```
Security Master + Firmennamen – wöchentliche Aktualisierung
[ ] PR #____ (Workflow, Gate, Schalter, Registry) gemergt am ____ – aktiviert nichts
[ ] P3 Grenzen bestätigt / angepasst: ____________________________________
[ ] P2 Quant: masterHash-Wechsel akzeptiert / Neuaufbau geplant: ____________
[ ] P1 erster Lauf workflow_dispatch commit=false, allow_version_change=true: Lauf ______
       Vorher/Nachher aus dem Artefakt geprüft (Instrumenttyp, aktiv, Eignung): ____
[ ] P1 Übernahme: zweiter Lauf commit=true, allow_version_change=true: Lauf ______
[ ] P5 Tiingo-Metadaten für Namenslücken: ja / nein
[ ] P4 Produkteignung: unverändert lassen / eigener PR #____
[ ] P6 Zeitplan per eigenem PR #____ (Mittwoch 09:41 UTC)
Entscheidung: freigeben / nicht freigeben        Datum, Name: ______
```
