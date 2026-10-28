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
| G10 | Eingaben fehlen, sind unlesbar, Grenzen sind keine endlichen Zahlen ≥ 0, oder das Gate wirft eine Ausnahme (jeder Ausgang schreibt `decision=BLOCKED`) | – |

Ein Tickerwechsel löst neben G7 immer auch G5 aus: Die Engine gleicht den Bestand über den Ticker ab, und `core/identity.js` bindet die `securityId` an den Ticker. Ein echter Tickerwechsel ist deshalb in jedem Fall eine Owner-Prüfung (eigener Identitätsfall), nie eine stille Übernahme.

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
| P1 | **Erster Lauf = Versionssprung** 1.1.0 → 1.3.0 des Klassifikators. Gemessen: 138 Instrumenttyp- und 133 Eignungswechsel, 0 `canonical_id`-Wechsel (siehe Entscheidungsvorlage). Der Lauf braucht `allow_version_change=true` und eine Vorher/Nachher-Prüfung aus dem CI-Artefakt (CLAUDE.md: Fachmodelle nur mit Vergleich). | Owner |
| P2 | **Quant-Backtests:** Jede Master-Übernahme ändert `masterHash`; geschützte Backtests melden `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` (`server/quant-backtest-reader.cjs`). Die Folge muss akzeptiert oder ein Neuaufbau eingeplant werden. | Quant-Owner |
| P3 | **Grenzen G3–G9** bestätigen oder anpassen. | Owner |
| P4 | **Produkteignung** (`eligibility.json`, Status „Security Master STALE“) bleibt ausgeklammert: Eine Neuberechnung ist eine Universumsänderung, und die nachträglichen Korrekturen (`apply-name-layer-class`, `apply-exchange-directory`) müssten mitlaufen. Eigene Entscheidung. | Owner |
| P5 | **Namen ohne Tiingo-Metadaten:** Neue oder unaufgelöste Titel bekommen nur SEC- oder kuratierte Namen. Ob für Lücken weiter Tiingo-Metadaten (bestehender Plan, rund 20–50 Anfragen je Lauf) genutzt werden dürfen, ist eine Owner-Frage; dieser PR fragt nicht an. | Owner |
| P6 | **Zeitplan:** erst nach einem manuell geprüften Lauf (P1) in einem eigenen PR; Vorschlag Mittwoch 09:41 UTC. Nicht über eine Variable schaltbar: Ein Zeitplan muss im Review sichtbar sein. | Owner |

**Nicht beeinträchtigt:**
- Der Nachtlauf schreibt nichts unter `security-master/` und teilt sich die Concurrency-Gruppe `market-data-<branch>`, deshalb läuft nichts parallel.
- Gepusht werden genau die sechs Dateien (`PUSH_OWNED_PATHS`), nie `eligibility.json` und nie `discover/data`.

## Entscheidungsvorlage P1–P6 (Stand 28.10.2026, gemessen)

### Gemessener Versionswechsel 1.1.0 → 1.3.0 (offline, nichts committet)

Zwei Läufe wurden gemessen:
- **Lauf A**, nur Bestand ohne Anbieterliste: nicht repräsentativ. 8.021 → 7.803 Zeilen, Enddaten fallen weg. Deshalb verlangt der Workflow `--require-provider`.
- **Lauf B**, Engine 1.3.0 auf der aus dem committeten Master rekonstruierten Anbieterliste: misst allein den Klassifikator.

| Lauf B | Wert |
|---|---|
| Zeilen | 8.021 → 8.021 |
| `canonical_id`-Wechsel | **0** |
| Aktivstatus-Wechsel | 0 |
| `instrument_type`-Wechsel | **138**: 127 EQUITY_COMMON → PREFERRED (Vorzugsaktien mit Suffix, z. B. AGNCM–P, FITBM/O/P, ZIONO/P), 11 → TEST_SECURITY (ZTST, ZVZZT …) |
| `eligible_us_equity` true → false | **133** (6.583 → 6.445) |
| backtestfähige IDs (eindeutig, aktiv, geeignet, Stammaktie) | 6.397 → 6.270: **127 fallen weg, 0 neu**; 110 davon haben eine Langreihe |
| inaktive Stammaktien (Survivorship-Kontrolle) | 191 → 180 |

Nicht offline messbar ist die Drift der Anbieterliste seit 11.09. (neue Start-/Enddaten → `canonical_id`, Delistings).

### `masterHash` und Quant

- `masterHash` ist der SHA-256 der **ganzen Datei** einschließlich `generatedAt` (`quant/engines/weekly-real-adapter.cjs`). Jede Übernahme ändert ihn, auch ohne Zeilenänderung. Heute: `26c82617…6498332`.
- Geschützte Backtests melden danach `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` und werden zurückgehalten (`server/quant-backtest-freshness.cjs`, `server/quant-backtest-reader.cjs`). Es wird nichts still überschrieben.

| Artefakt | hängt am Hash | Neubau | überschreibt? |
|---|---|---|---|
| private echte Wochen-Backtests `<generation>/` | ja, harter Block | `scripts/quant/materialize-real-backtest-read.cjs`, `refresh-real-backtest.cjs` (lokal, kein Workflow) | neue Generation; alte bleibt, nur `release.json` wird umgehängt |
| Batch-Manifest (privat) | ja | `batch-real-weekly-backtests.cjs` | Ausgabeverzeichnis |
| `docs/quant-recovery/v8/*` (`weekly-qualification`, `real-studies`, `sensitivity-summary`, `study-main-integration`), `v9/v8-securement` | ja (eingefroren) | keiner (Evidenz) | versioniert, **nicht anfassen** |
| `quant/data/product/survivorship-control-v1.json` | Inhalt (191 Zeilen, Test) | `build-survivorship-control.mjs` | überschreibt, Test anpassen |
| `quant/data/product/emerging-leaders-v1/study.json` | Inhalt (Aktienmenge) | `emerging-leaders-study.yml` | überschreibt |
| `supertrader/data/coverage.json`, Supertrader-8-Eingangsprüfung | Inhalt (Typ, Aktiv) | eigene Läufe | – |
| Discover, `eligibility.json`, Universum | nein (bewerten den 1.1.0-Stand bereits mit 1.3.0 neu) | – | – |

**Vergleichbar bleiben:** alle Titel, deren `canonical_id`, Klasse und Aktivstatus gleich bleiben. Ihre Zahlen sind identisch, nur der Hash ist neu. **Nicht mehr vergleichbar:** jede an `26c826…` gebundene Generation (formal) und die 127 Vorzugsaktien bzw. Testwerte; deren Ergebnisse werden BLOCKED, nicht verändert.

**Wichtig:** Das Gate dieses PR blockiert den ersten Lauf selbst, denn G7 erlaubt 25 Typwechsel und 50 Eignungswechsel, gemessen sind 138 und 133. `allow_version_change` hebt nur G8 auf.

### Die sechs Entscheidungen

**P1 – Versionswechsel des Klassifikators**
- Optionen:
  - (a) Wechsel in einem eigenen, einmaligen PR mit Vorher/Nachher-Tabelle der 138/133 Änderungen;
  - (b) im ersten Wochenlauf mit `allow_version_change` und angehobenen Grenzen;
  - (c) bei 1.1.0 bleiben.
- Bedeutung: 1.3.0 erkennt Vorzugsaktien und Testwerte, die 1.1.0 als Stammaktien führte. Das ist fachlich richtiger. Discover und das Universum nutzen 1.3.0 bereits.
- Auswirkung: 127 IDs verlassen den Backtest-Bestand, Survivorship 191 → 180, Emerging-Leaders-Menge −138.
- **Empfehlung (a):** Der Klassifikatorwechsel wird getrennt von der Anbieterdrift prüfbar, also zuerst nur die Klasse und erst danach die Liste.
- Risiko: gering, die Typänderungen sind belegbar. Reversibel: Der alte Master bleibt in der Git-Historie, und ein Revert stellt Hash und Klassen wieder her.

**P2 – masterHash und Quant-Backtests**
- Optionen:
  - (a) Neuaufbau einer **neuen** Backtest-Generation nach der Übernahme, die alte Generation und `release.json` vorher sichern;
  - (b) Hash-Bindung lockern;
  - (c) Übernahme verschieben.
- Auswirkung: Bis zum Neuaufbau werden geschützte Backtest-Ergebnisse zurückgehalten, nicht verändert.
- **Empfehlung (a):** Vorher die Liste der betroffenen IDs (Klasse, Eignung, `canonical_id`) gegen die Langreihen und Evidenzsätze erzeugen. `docs/quant-recovery/v8` und `v9` bleiben unberührt. Survivorship und Emerging Leaders je in einem eigenen PR mit Vergleich neu bauen. Keine Lockerung (b): Die Bindung ist der Schutz gegen stilles Überschreiben.
- Reversibel: Die alte Generation bleibt erhalten und kann durch Zurückhängen von `release.json` wieder ausgeliefert werden.

**P3 – Grenzen G3–G9**
- Optionen:
  - (a) Vorschlag beibehalten (±5 % Zeilen, je 25/25/50/50/25 Wechsel, Namen −20 / 200, Höchstalter 21 Tage);
  - (b) einmalige höhere Grenzen nur für den P1-PR;
  - (c) dauerhaft höhere Grenzen.
- **Empfehlung (a) plus (b):** Die Grenzen gelten für die laufende Woche, der einmalige Versionswechsel bekommt seine eigene Freigabe. Dauerhaft höhere Grenzen würden ein veraltetes Anbieterverzeichnis (gemessen 7.794 Deaktivierungen) durchlassen.

**P4 – Produkteignung (`eligibility.json`)**
- Optionen:
  - (a) ausgeklammert lassen;
  - (b) im selben Lauf mitrechnen.
- Bedeutung: Eine Neuberechnung ist eine Universumsänderung mit nachgelagerten Korrekturschritten.
- **Empfehlung (a):** Sie bewertet den Master schon mit 1.3.0 neu. Eine Neuberechnung bleibt eine eigene Entscheidung.
- Risiko: Der Status „Security Master STALE“ in der Eignung bleibt bis dahin sichtbar.

**P5 – Firmennamen ohne Tiingo-Metadaten**
- Optionen:
  - (a) nur SEC- und kuratierte Namen (kostenfrei);
  - (b) zusätzlich Tiingo-Metadaten für Lücken (bestehender Plan, rund 20–50 Anfragen je Lauf).
- **Empfehlung (a)** für den Start: keine Kosten, und Lücken bleiben mit dem letzten Namen stehen.
- Reversibel: (b) ist später ein kleiner Schalter in einem eigenen PR.

**P6 – Zeitplan**
- Optionen:
  - (a) eigener PR nach einem geprüften manuellen Lauf, Mittwoch 09:41 UTC;
  - (b) sofort mit diesem PR;
  - (c) nur manuell.
- **Empfehlung (a)**, mit dieser Reihenfolge:
  1. #1033 mergen (aktiviert nichts);
  2. P1-PR Klassifikator;
  3. Quant-Neuaufbau P2;
  4. ein manueller Lauf mit `commit=false` misst die Anbieterdrift;
  5. Zeitplan-PR.
- Ein Zeitplan muss im Review sichtbar sein; deshalb wird er nicht über eine Variable geschaltet.

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
