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
| `scripts/market/security-master-refresh-gate.mjs` | neu: Übernahme-Gate G1–G10, fail closed (Exit 4), Bericht als CI-Artefakt; `--approved-changes` für den einmaligen Wechsel (P3) |
| `scripts/market/security-master-v130-evidence.mjs` | neu: Nachweis des Klassifiziererwechsels, schreibt nur nach `--out` |
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
| G7 | Wechsel je stabiler `securityId`: `canonical_id` / Instrumenttyp / aktiv → inaktiv / Eignung / Ticker; ausgenommen nur die Paare einer gebundenen Sonderfreigabe (P3) | 25 / 25 / 50 / 50 / 25 |
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

**Fachlich nach den Owner-Entscheidungen P1–P6 vom 28.10.2026** (nächster Abschnitt). Noch läuft nichts: kein produktiver Refresh, kein Zeitplan, keine Repository-Variable.

**Nicht beeinträchtigt:**
- Der Nachtlauf schreibt nichts unter `security-master/` und teilt sich die Concurrency-Gruppe `market-data-<branch>`, deshalb läuft nichts parallel.
- Gepusht werden genau die sechs Dateien (`PUSH_OWNED_PATHS`), nie `eligibility.json` und nie `discover/data`.

## Owner-Entscheidungen P1–P6 (28.10.2026)

| # | Entscheidung | umgesetzt in diesem PR | offen |
|---|---|---|---|
| P1 | Version 1.3.0 **nur als kontrollierter einmaliger Wechsel** mit eigenem Datenvergleich und Freigabeprüfung | vollständige Listen und Vergleich (`docs/data/security-master/`), Sonderfreigabe im Gate, gebunden an genau diesen Wechsel | Owner-Freigabe des Laufs |
| P2 | Quant-Backtests **nur als neue Generation**; alte Generationen, Manifeste und `release.json` vorher **unveränderlich sichern**; kein stilles Überschreiben | Sicherungs- und Neuaufbauplan unten | Sicherung und Neuaufbau (privat, lokal; eigener Schritt) |
| P3 | G3–G9 **bleiben streng**; Sonderfreigabe nur für die belegten Auswirkungen des einmaligen Wechsels, **keine generelle Lockerung** | `--approved-changes` (Workflow-Eingabe `approved_changes`), Grenzen unverändert | – |
| P4 | `eligibility.json` **bleibt unverändert** | Workflow pusht sie nie (SMW-3) | – |
| P5 | Firmennamen **nur aus SEC und kuratierten Quellen**; keine kostenpflichtigen Tiingo-Metadaten; fehlende Namen **nicht erfinden** | `build-company-names.mjs --sec`, Lücken behalten den letzten Namen | – |
| P6 | wöchentliche Aktualisierung gewünscht, **Scheduler bleibt deaktiviert** | Zeitplan nur als Kommentar (SMW-1) | eigener PR nach dem geprüften Wechsel |

### P1 – der einmalige Wechsel 1.1.0 → 1.3.0, gemessen

Gemessen mit `scripts/market/security-master-v130-evidence.mjs`: die Engine 1.3.0 auf dem committeten Stamm (`26c82617…6498332`) mit derselben, aus seinen Anbieterzeilen rekonstruierten Anbieterliste, demselben Bestand und demselben Zeitstempel. Gezählt wird mit der Vergleichslogik des Gates (`compareMasters`, je stabiler `securityId`). Ergebnis committet unter `docs/data/security-master/`, Stand 28.10.2026 auf `main`. Test SMW-10 baut die Wechsel, die Freigabedatei und die Menge der entfallenden IDs aus Stamm und Engine nach und vergleicht sie genau. Langreihen, Produkteignung und Fundstellen im Nachweis sind ein datierter Stand und wachsen mit den Datenläufen:

| Datei | Inhalt |
|---|---|
| `v130-switch-lists.md` | **vollständige Liste** der 138 IDs: Typ vorher → nachher, Eignung, backtestfähig, Identität, Langreihe, Produkteignung |
| `v130-switch-evidence.json` | dieselben Listen maschinenlesbar, Eingangs-SHA-256, Fundstellen in Quant-Artefakten |
| `v130-approved-changes.json` | die Sonderfreigabe für das Gate (genau 138 Typ- und 138 Eignungswechsel) |

| | vorher (1.1.0) | nachher (1.3.0) |
|---|---|---|
| Zeilen | 8.021 | 8.021 |
| `instrument_type`-Wechsel | – | **138**: 127 EQUITY_COMMON → PREFERRED, 11 EQUITY_COMMON → TEST_SECURITY |
| `eligible_us_equity`-Wechsel je `securityId` | – | **138**, alle true → false, dieselben IDs wie die Typwechsel |
| geeignete Zeilen | 6.583 | 6.445 |
| `canonical_id`-, Aktivstatus-, Tickerwechsel, verlorene oder neue IDs | – | **0** |
| backtestfähige IDs (genau eine Zeile, aktiv, geeignet, Stammaktie) | 6.397 | 6.270: **127 entfallen, 0 neu** |

**Korrektur:** Die frühere Angabe „133 Eignungswechsel“ war eine grobe Zeilenzählung (127 eindeutige plus 14 mehrdeutige true → false, abzüglich 4 mehrdeutiger false → true) und ist falsch. Das Gate zählt je `securityId`; dort sind es 138.

**Nachweis der 127 entfallenden backtestfähigen IDs:**
- 116 PREFERRED und 11 TEST_SECURITY; die übrigen 11 der 138 haben zwei Zeilen (eine aktiv, eine inaktiv) und waren schon vorher nicht backtestfähig.
- Identität: alle 127 folgen `core/identity.js` (`securityId` = Ticker-Identität, keine Neuvergabe, kein `canonical_id`-Wechsel).
- Historische Kursreihen: 110 haben eine Langreihe unter `quant/data/market/discover-series-long/` (alle `real`, `SPLIT_ADJUSTED`). Die Reihen bleiben unverändert liegen; nur ihre Aufnahme in künftige Backtests entfällt.
- Discover: keine der 127 ist im Universum `US_REAL`. Produkteignung (unverändert, P4): 105 SEPARATE_CLASS, 11 REVIEW, 11 EXCLUDED; Discover hat sie also schon heute nicht als Stammaktie geführt.

### Vorher/Nachher Quant und Discover

| Verbraucher | liest | Wirkung des Wechsels |
|---|---|---|
| Discover (Universum, Rankings, Detail) | `eligibility.json`, `US_REAL` | **keine**: P4 lässt `eligibility.json` unverändert, keine der 127 IDs ist im Universum |
| Supertrader-8-Eingangsprüfung | Instrumenttyp, Aktivstatus | die 138 Vorzugsaktien und Testwerte gelten als Nicht-Stammaktie; sie sind heute in keinem Discover-Universum |
| private Wochen-Backtests (`<generation>/`, Manifest, `release.json`) | `masterHash` (ganze Datei), backtestfähige IDs | geschützte Generation meldet `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` und wird zurückgehalten, nicht verändert; eine neue Generation hätte 6.270 statt 6.397 IDs |
| `quant/data/product/survivorship-control-v1.json` | inaktive Stammaktien-Zeilen | 191 → 180 (die 11 Zwei-Zeilen-IDs); Test `survivorship-control.test.mjs` erwartet 191 |
| `quant/data/product/emerging-leaders-v1/study.json` | `commonEquityIds`, `inactiveEquityIds` | Eingangsmenge −138 IDs, inaktive −11; Wirkung auf die Studie misst der Neuaufbau |
| `capabilities-v1`, `sic-peer-taxonomy-v1`, `naming-contract-v1`, `total-return-quality-v1` | eigene Inventare | nennen 116 / 113 / 9 / 1 der 127 IDs; werden durch den Wechsel **nicht** neu gebaut |
| `docs/quant-recovery/**` (v7–v9, eingefroren) | – | v9-Evidenz nennt einzelne der 127 IDs (`v9-followups/stale-tails/before-after.json` 35, `v9/corporate-actions/ca-missing-weeks.json` 12, `ca-stale-tail-finding.json` 27, `v9/sensitivity/registration-1.0.0.json` 27). Sie belegt den Stand 1.1.0 und bleibt **unverändert**; eine neue Generation verweist auf sie, schreibt sie nie neu |
| `build-factor-evidence`, `build-quant-radar` | Engine-Modul, nicht die Stammdatei | keine |

### P3 – Sonderfreigabe statt Lockerung

- Ohne Freigabe blockiert G7 den Wechsel (138 > 25 Typwechsel, 138 > 50 Eignungswechsel). Die Grenzen bleiben 25 / 25 / 50 / 50 / 25.
- `--approved-changes <datei>` nimmt **genau** die belegten Paare (`securityId`, vorher, nachher) aus der G7-Zählung. Jeder andere Wechsel, auch derselbe Titel mit anderem Ziel, zählt weiter. Alle übrigen Gates (G1–G6, G8–G10, Deaktivierungen, Ticker) bleiben unberührt.
- Die Freigabe gilt nur, wenn alles zutrifft, sonst BLOCKED:
  - zusammen mit `allow_version_change`;
  - Quellversion = 1.1.0 und Zielversion = 1.3.0;
  - SHA-256 des Ausgangsstamms = `26c82617…` (aus den Bytes von `--prev` berechnet, nicht aus der Freigabedatei).
- Damit ist sie nicht wiederverwendbar: Im nächsten Wochenlauf ist die Quellversion 1.3.0, und der Ausgangsstamm hat einen anderen Hash.
- Der Gate-Bericht zeigt angewandte und nicht genutzte Einträge (`report.approval`). Nicht genutzte Einträge blockieren nicht (ein Titel kann inzwischen delistet sein; das zählt dann als Deaktivierung gegen G7).
- Die Anbieterdrift seit 11.09. ist offline nicht messbar und fällt **nicht** unter die Freigabe: Sie muss im selben Lauf innerhalb der normalen Grenzen liegen, sonst BLOCKED.
- Tests: SMW-9 (Bindung, Exaktheit, Teilfreigabe, andere Wechselarten, Wiederverwendung), SMW-10 (goldener Fall am committeten Stamm).

### `masterHash` und Quant

- `masterHash` ist der SHA-256 der **ganzen Datei** einschließlich `generatedAt` (`quant/engines/weekly-real-adapter.cjs`). Jede Übernahme ändert ihn, auch ohne Zeilenänderung.
- Geschützte Backtests melden danach `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` und werden zurückgehalten (`server/quant-backtest-freshness.cjs`, `server/quant-backtest-reader.cjs`). Es wird nichts still überschrieben.
- Die Hash-Verträge bleiben in diesem PR **unverändert**. Ein rückwärtskompatibler Vorschlag (zusätzlicher Inhalts-Fingerabdruck) ist getrennt vorbereitet und braucht eine eigene Owner-Freigabe.

### P2 – Sicherung und Neuaufbau der Quant-Artefakte (Plan, nichts ausgeführt)

Reihenfolge, jeder Schritt erst nach Freigabe des vorigen:

1. **Sicherung (vor jeder Übernahme):**
   - Alle privaten Backtest-Generationen, das Batch-Manifest und `release.json` als schreibgeschütztes Archiv ablegen.
   - Dazu eine Liste `sha256  pfad` für jede Datei, deren eigener SHA-256 im Freigabeprotokoll steht.
   - Prüfung: `sha256sum -c` gegen das Original vor und nach dem Neuaufbau. Die alten Generationen bleiben am Ort; der Neuaufbau schreibt nur in eine **neue** Generation.
2. **Übernahme des Stamms 1.3.0:** Workflow-Lauf mit `allow_version_change=true`, `approved_changes=true`, zuerst `commit=false`; Gate-Bericht und Listen vergleichen; dann derselbe Lauf mit `commit=true`.
3. **Neue Backtest-Generation:**
   - `scripts/quant/materialize-real-backtest-read.cjs` bzw. `refresh-real-backtest.cjs` in ein neues Generationsverzeichnis.
   - Vorher/Nachher je Strategie: Anzahl IDs (6.397 → 6.270), Kennzahlen der unveränderten 6.270 IDs müssen gleich sein.
   - Erst dann `release.json` umhängen. Zurück geht es durch Zurückhängen auf die gesicherte Generation.
4. **Survivorship-Kontrolle:** eigener PR, `build-survivorship-control.mjs` neu, 191 → 180, Test angepasst, mit Liste der 11 IDs.
5. **Emerging Leaders:** eigener PR über `emerging-leaders-study.yml`, mit Vorher/Nachher der Aktienmenge und der Ergebnisse.
6. `docs/quant-recovery/**` und archivierte Generationen werden nie neu geschrieben.

## Freigabevorlage

```
Security Master 1.3.0 – einmaliger Klassifiziererwechsel und wöchentliche Aktualisierung
[ ] PR #1033 gemergt am ____ (Workflow, Gate, Sonderfreigabe, Nachweis) – aktiviert nichts
[ ] P1 Listen geprüft: docs/data/security-master/v130-switch-lists.md
       138 Typwechsel, 138 Eignungswechsel, 127 entfallende backtestfähige IDs: ja / nein
[ ] P2 Sicherung erstellt: Archiv ____, SHA-256-Liste ____ (sha256 der Liste: ____)
[ ] P3 Sonderfreigabe v130-approved-changes.json (prevMasterSha256 26c82617…) freigegeben: ja / nein
[ ] Lauf 1  workflow_dispatch commit=false allow_version_change=true approved_changes=true: Lauf ______
       Gate PASS, report.approval.applied 138/138, sonst keine Wechsel über den Grenzen: ____
[ ] Lauf 2  dieselben Eingaben, commit=true: Lauf ______
[ ] P2 neue Backtest-Generation ______, Vergleich 6.397 → 6.270 geprüft, release.json umgehängt: ____
[ ] Survivorship-PR #____ (191 → 180)    [ ] Emerging-Leaders-PR #____
[ ] P4 eligibility.json unverändert    [ ] P5 nur SEC/kuratierte Namen
[ ] P6 Zeitplan-PR #____ (erst danach; Scheduler bis dahin aus)
Entscheidung: freigeben / nicht freigeben        Datum, Name: ______
```
