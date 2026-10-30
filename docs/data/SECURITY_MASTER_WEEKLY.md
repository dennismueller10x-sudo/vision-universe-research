# US-Wertpapierstamm und Firmennamen – wöchentliche Aktualisierung (vorbereitet, Zeitplan aus)

Stand 28.10.2026, Nachtrag 30.10.2026 (Nachholdrift, erweiterter Freeze). Owner-Entscheidung vom selben Tag: regelmäßige, kontrollierte Aktualisierung des Security Masters und der Firmennamen. Zielrhythmus wöchentlich, nach der Aktualisierung von Stammdaten und Universum. Dieses Dokument gehört zum Draft-PR mit `.github/workflows/security-master-weekly.yml`. Ein Zeitplan ist **nicht** aktiv, und es wird **keine** Repository-Variable gesetzt.

Ergänzt am 29.10.2026 (Workstream D2):
- Reproduktion und Zählabgleich 138 / 127 / 133 (P1);
- Freeze der historischen Quant-Ergebnisse und Pfad für eine neue Generation (P2);
- vollständige Freigabevorlage.

Ausgeführt ist weiterhin nichts.

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

**Korrektur:** Die frühere Angabe „133 Eignungswechsel“ ist falsch. Das Gate zählt je `securityId`; dort sind es 138. Der Zählabgleich unten zeigt, dass 133 aus keiner Zählung der committeten Eingaben folgt.

#### Nachweis vom 29.10.2026: reproduziert und abgeglichen (Workstream D2)

Reproduziert ohne Abruf und ohne kostenpflichtige Anfrage, nur aus committeten Eingaben auf `main` `9119b17a`:
- Stamm `quant/data/market/security-master/us-security-master.json`, SHA-256 `26c82617…6498332`, Version 1.1.0, `generatedAt` 11.09.2026;
- Bestand `quant/data/market/scale/universe-FULL_UNIVERSE.json`;
- Engine `quant/engines/us-security-master.js` 1.3.0 (Regeln 1.3.3).

```bash
node scripts/market/security-master-v130-evidence.mjs --out <tmp>
# [v130-evidence] us-security-master-1.1.0 -> us-security-master-1.3.0: Typ 138, Eignung 138, canonical 0, backtestfähig 6397 -> 6270 (−127/+0, 110 mit Langreihe)
cmp <tmp>/v130-switch-evidence.json docs/data/security-master/v130-switch-evidence.json     # bytegleich
cmp <tmp>/v130-switch-lists.md docs/data/security-master/v130-switch-lists.md               # bytegleich
cmp <tmp>/v130-approved-changes.json docs/data/security-master/v130-approved-changes.json   # bytegleich
```

Neu schreibt das Skript zusätzlich `v130-count-reconciliation.json` (Funktion `countReconciliation`, Erzeugerausgabe, committet). Test SMW-11 baut die Datei aus Stamm und Engine nach und vergleicht sie genau. Was jede Zahl zählt:

| Zahl | zählt | Zusammensetzung |
|---|---|---|
| **138** Typwechsel | je `securityId` (Gate, `compareMasters`) | 127 EQUITY_COMMON → PREFERRED, 11 EQUITY_COMMON → TEST_SECURITY; 127 IDs mit einer Zeile, 11 mit zwei |
| **138** Eignungswechsel | je `securityId` (Gate) | alle true → false; genau dieselben IDs wie die Typwechsel |
| 149 Typwechsel | je Zeile | 127 + 11 aktive Zeilen, dazu 11 inaktive Zweitzeilen (PREFERRED, Eignung schon vorher false) |
| 138 Eignungswechsel | je Zeile | 138 true → false, **0** false → true; geeignete Zeilen 6.583 → 6.445 |
| **127** (a) → PREFERRED | je `securityId` | 116 einzeilige + 11 zweizeilige IDs (`ref_ADAMM`, `ref_ADAMN`, `ref_AGNCP`, `ref_GOODN`, `ref_GOODO`, `ref_HBANP`, `ref_LANDP`, `ref_MBINN`, `ref_OXLCN`, `ref_OXLCO`, `ref_OXLCP`) |
| **127** (b) entfallend backtestfähig | je `securityId`, Regel des Wochen-Adapters | 116 PREFERRED + 11 TEST_SECURITY |
| **133** (früher) | – | nicht reproduzierbar: weder je ID (138) noch je Zeile (138, netto 138). Die eigene Herleitung „127 + 14 − 4“ ergibt 137. Mehrzeilige IDs haben 11, nicht 14, Eignungszeilen true → false, und 0, nicht 4, false → true |

Die beiden 127 sind **verschiedene Mengen** mit gleicher Größe. Sie überschneiden sich in 116 IDs:
- Die 11 Zwei-Zeilen-IDs werden PREFERRED, waren aber schon vorher nicht backtestfähig.
- Die 11 TEST_SECURITY-IDs werden nicht PREFERRED, entfallen aber.

Die Sonderfreigabe deckt beide über die 138 Paare ab.

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
| `docs/quant-recovery/**` (v7–v9, eingefroren) | – | v8- und v9-Evidenz nennt einzelne der 127 als `securityId` (z. B. `v9-followups/stale-tails/before-after.json` 35, `v9/corporate-actions/ca-missing-weeks.json` 12, `ca-stale-tail-finding.json` 27, `v9/sensitivity/registration-1.0.0.json` 27; `BACKTEST_V8_DATA_RECOVERY.md`: FRMEP, MBINM), als Ticker oder Listung (u. a. `v8/r2-assessment.json`, `v9/identity/*`, `v9/secpit/*`). Die Zählung im Nachweis erfasst nur die `"ref_…"`-Form. Die Evidenz belegt den Stand 1.1.0 und bleibt **unverändert**; eine neue Generation verweist auf sie, schreibt sie nie neu |
| `build-factor-evidence`, `build-quant-radar` | Engine-Modul, nicht die Stammdatei | keine |

### P3 – Sonderfreigabe statt Lockerung

- Ohne Freigabe blockiert G7 den Wechsel (138 > 25 Typwechsel, 138 > 50 Eignungswechsel). Die Grenzen bleiben 25 / 25 / 50 / 50 / 25.
- `--approved-changes <datei>` nimmt **genau** die belegten Paare (`securityId`, vorher, nachher) aus der G7-Zählung. Jeder andere Wechsel, auch derselbe Titel mit anderem Ziel, zählt weiter. Alle übrigen Gates (G1–G6, G8–G10, Deaktivierungen, Ticker) bleiben unberührt.
- Einträge sind streng typisiert (`securityId` und Typen als Text, Eignung als Wahrheitswert), ohne Doppelungen; `--approved-changes` ohne Datei ist G10.
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

Werkzeug: `scripts/quant/backtest-generation-freeze.cjs` mit Test `quant/tests/security-master-v130-freeze.test.mjs` (eigener Quant-PR #1100). Es ruft keinen Anbieter ab, schreibt nie nach `quant/data`, `discover/data`, `supertrader/data` oder `social/data` und hängt keinen Leser um.

**Was vom Stamm abhängt:**

| Klasse | was | Schutz |
|---|---|---|
| eingefrorene, committete Quant-Evidenz | `docs/quant-recovery/` V5.1, V6 (mit Sicherungen), V7, V8, V9, V9-Folgearbeit, Methodik v1 und `BACKTEST_V51.md` (Hauptbericht V5.1) sowie `BACKTEST_V6…V9_*.md`, 241 Dateien (nach Review #1100) | `docs/data/security-master/v130-quant-freeze.json`: SHA-256 je Datei, erzeugt mit `repo-manifest` auf `main` `9119b17a`. Test SMF-1 schlägt fehl, wenn eine Datei sich ändert oder fehlt; neue Dateien (neue Generation) sind erlaubt. V10 ist eine offene Übergabe und bewusst nicht enthalten |
| private Backtest-Generationen (außerhalb des Repositorys) | `<privat>/<generation>/` mit Snapshot (`masterHash`), Listings, Index, `release.json`; Zeiger `<privat>/release.json` | `freeze` vor der Übernahme, `verify` vor und nach dem Neuaufbau (SMF-3) |
| veröffentlichte Quant-Daten mit Stammbezug | Survivorship-Kontrolle, Emerging Leaders, Inventare (Tabelle oben) | Erzeugereigen, Stand in der Git-Historie; jeder Neubau ist ein eigener Erzeuger-PR mit Vorher/Nachher (Schritte 4–5) |
| `masterHash`-Verbraucher | Adapter, Materialisierung, Freshness, Leser | unverändert; die alte Generation meldet nach dem Wechsel `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` |

1. **Sicherung (vor jeder Übernahme):**
   ```bash
   node scripts/quant/backtest-generation-freeze.cjs verify-repo --manifest docs/data/security-master/v130-quant-freeze.json
   node scripts/quant/backtest-generation-freeze.cjs freeze --generations <privat-1.1.0> --out <archiv>/v130-private-freeze.json
   ```
   - `freeze` erfasst jede Datei der privaten Wurzel mit SHA-256 (ohne Sperrdateien), prüft jeden Snapshot (`hash(input) = generation`) und hält Generation und `masterHash` des Zeigers fest.
   - Der `filesSha256` des Manifests kommt ins Freigabeprotokoll. Zusätzlich die Wurzel schreibgeschützt archivieren.
2. **Übernahme des Stamms 1.3.0:** Workflow-Lauf mit `allow_version_change=true`, `approved_changes=true`, zuerst `commit=false`; Gate-Bericht und Listen vergleichen; dann derselbe Lauf mit `commit=true`.
3. **Neue Backtest-Generation**, nur vom Erzeuger und nur in eine **neue** private Wurzel:
   ```bash
   node scripts/quant/backtest-generation-freeze.cjs build-post-switch --frozen <privat-1.1.0> --manifest <archiv>/v130-private-freeze.json --output <privat-1.3.0>
   node scripts/quant/backtest-generation-freeze.cjs compare --frozen <privat-1.1.0> --output <privat-1.3.0> --approved docs/data/security-master/v130-approved-changes.json --out <archiv>/v130-compare.json
   ```
   - `build-post-switch` verweigert, wenn
     - der Stamm noch nicht 1.3.0 ist (`MASTER_NOT_SWITCHED`) oder sein `masterHash` gleich geblieben ist,
     - die neue Wurzel die alte ist oder in ihr liegt bzw. sie enthält (`POST_SWITCH_OUTPUT_MUST_BE_SEPARATE_ROOT`),
     - eine eingefrorene Generation in der Ausgabe liegt,
     - die eingefrorene Wurzel vorher oder nachher nicht bytegleich ist (`FROZEN_GENERATION_CHANGED…`).
   - Sonst ruft es den bestehenden Erzeuger `materialize-real-backtest-read.cjs` im Umfang der eingefrorenen Generation auf. Die neue Generations-ID folgt aus dem neuen `masterHash`.
   - Es schreibt `lineage.json` (Vorgänger, Nachfolger, `publiclyActivated: false`, `readerSwitch: OWNER_STEP_NOT_PERFORMED`).
   - `compare` vergleicht Titel für Titel die Kennzahlen je Periode (Metriken, Endkapital, offene Positionen, Buy-and-Hold). Es meldet `ONLY_APPROVED_CHANGES` nur, wenn sich ausschließlich IDs der Sonderfreigabe ändern. Erwartet: 127 `NEWLY_BLOCKED` (`INELIGIBLE_EQUITY_LISTING`), alle übrigen `SAME_FINANCIALS` bzw. `SAME_BLOCKED`.
   - Am Fixture mit echten Reihen (NVDA, MSFT, XOM, ACGLO) geprüft (SMF-5): ACGLO wird `NEWLY_BLOCKED`, die drei anderen haben gleiche Kennzahlen, der alte Zeiger bleibt bytegleich.
   - Erst danach und nur mit Owner-Freigabe wird der Leser auf `<privat-1.3.0>` gestellt. Zurück geht es, indem der Leser wieder auf `<privat-1.1.0>` zeigt; diese Wurzel ist unverändert, `verify` belegt das.
4. **Survivorship-Kontrolle:** eigener PR, `build-survivorship-control.mjs` neu, 191 → 180, Test angepasst, mit Liste der 11 IDs.
5. **Emerging Leaders:** eigener PR über `emerging-leaders-study.yml`, mit Vorher/Nachher der Aktienmenge und der Ergebnisse.
6. `docs/quant-recovery/**` und archivierte Generationen werden nie neu geschrieben.

## Nachholdrift seit 11.09. (gemessen 30.10.2026)

**Befund.** Der erste echte Lauf 40942100928 (29.10., `commit=false`, `allow_version_change` und `approved_changes`) wurde vom Gate blockiert. Ein Probelauf am 30.10. mit denselben Erzeugern bestätigt das; seine Ausgaben gingen nur in ein Arbeitsverzeichnis, es gab keinen Commit. Grundlage: offene Tiingo-Liste, 109.165 Zeilen, und SEC `company_tickers_exchange.json`, beide ohne Kosten. Ergebnis: **Die Sonderfreigabe v130 allein reicht nicht.** Sie deckt den Klassifiziererwechsel ab, aber nicht sieben Wochen Anbieterdrift.

| Gate | 29.10. (Lauf) | 30.10. (Probelauf) | Ursache |
|---|---|---|---|
| G6 neue doppelte `canonical_id` | 1 | 1 | `tiingo:NYSE:OKE:1985-07-01`: Die Anbieterliste führt ONEOK zweimal, einmal ACTIVE und einmal INACTIVE bis 14.09. |
| G7 `canonical_id`-Wechsel | 83 | 85 | 34 neue Listings mit wiederverwendetem Ticker, 19 Wechsel zu OTC, 17 korrigierte Startdaten, 9 umbenannte Börsen (z. B. AMEX → NYSE MKT), 5 Börse und Start, 1 entfallenes Listing |
| G7 aktiv → inaktiv | 100 | 104 | 90 Ende passt zur eigenen Tagesreihe bzw. ohne Produktreihe; **14 Identitätsbefunde**: Die eigene Reihe läuft weiter, das Anbieter-Ende liegt bei 2016–2026 (Tickerwiederverwendung, z. B. PCLN, NYNY, ACTS) |
| G7 Eignung, über v130 hinaus | 82 | 85 | alle true → false: 65 durch Delisting, 19 durch mehrdeutiges Listing, 1 sonstige |
| G7 Instrumenttyp, über v130 hinaus | – | 10 | ETF-Listing mit demselben Ticker (unter der Grenze 25) |
| G9 Namenswechsel | 592 | 592 | 573 gefüllte Lücken (vorher ohne Namen, jetzt SEC), 14 Tiingo → SEC, 1 kuratiert → SEC, **4 SEC → Tiingo-Metadaten** (P5-Konflikt) |

Reaktivierungen, Tickerwechsel, verlorene und neue IDs: 0.

**Weg, ohne Grenzen anzuheben:** Eine zweite, gleich gebundene Freigabedatei. Das Schema `security-master-approved-changes-1.1.0` erzeugt `scripts/market/security-master-drift-evidence.mjs` aus dem Probelauf.

| Regel | umgesetzt |
|---|---|
| Bindung wie v130 | dieselben Versionen 1.1.0 → 1.3.0, SHA-256 des Ausgangsstamms `26c82617…`, nur mit `allow_version_change`; im Workflow nur zusammen mit `approved_changes` (`approved_drift`) |
| nur vorsichtige Richtung | Delistings, Eignung true → false, `canonical_id`-Wechsel, Typwechsel und Namen. Reaktivierung, neue Eignung, Tickerwechsel, neue oder verlorene IDs sind nicht freigebbar (G10) |
| exakt | Paare (`securityId`, vorher, nachher) bzw. die `securityId` bei Delistings. Nicht genannte Wechsel, auch Drift nach dem 30.10., zählen gegen die unveränderten Grenzen 25 / 25 / 50 / 50 / 25 / 200 |
| exakt verschlüsselt | Schlüssel `JSON.stringify([securityId, vorher, nachher])`: Werte mit „|“ (mehrzeilige `canonical_id`) oder ein Name „∅“ können keinen anderen Wechsel decken |
| nur mit v130 | eine Datei 1.1.0 gilt nur zusammen mit genau einer v130-Datei derselben Versionen und desselben Ausgangsstamms (im Gate, nicht nur im Workflow) |
| Identitätsbefunde nie in der Freigabe | die 14 Titel (Reihe läuft nach dem Anbieter-Ende weiter oder ist unlesbar) zählen gegen die Grenzen (14 ≤ 50) und werden ausgewiesen; ohne Reihenverzeichnis bricht das Werkzeug ab |
| Tickerwiederverwendung nur auf Wunsch | 35 IDs, unter denen der Anbieter ein neues Listing oder ein ETF mit demselben Ticker führt (34 neue Zeilen, dazu `ref_CAM`). Für den Stamm ist das vorsichtig: mehrdeutig heißt nicht geeignet. Es ist aber ein Identitätsthema, denn die Produktreihe einer alten `securityId` kann schon das neue Instrument zeigen (z. B. `ref_AAAP` ab 23.06.2026). Deshalb nur mit `--include-ticker-reuse` |
| Namen nach P5 | freigegeben sind nur Namen mit Quelle SEC: gefüllte Lücken und SEC statt Tiingo (587). Nicht freigegeben, aber unter der Grenze: SEC → Tiingo-Metadaten (4) und kuratiert → SEC (1) |
| Doppelung OKE | **nicht** in der committeten Datei. Ohne eigene Entscheidung blockiert G6 weiter |

Nachweis committet unter `docs/data/security-master/`:
- `drift-lists.md`: alle Listen zum Lesen;
- `drift-evidence.json`: Klassen und erwartetes Gate-Ergebnis;
- `drift-approved-changes.json`: die Freigabe.

Tests: SMW-12 (Gate), SMW-13 (Klassen), SMW-14 (committete Datei).

| Freigaben im Probelauf 30.10. | Gate |
|---|---|
| v130 | BLOCKED (G6, G7 ×3, G9) |
| v130 + Nachholdrift (committete Datei) | BLOCKED: G6 OKE und G7 35 `canonical_id` (die Tickerwiederverwendung, Grenze 25) |
| v130 + Nachholdrift mit `--include-ticker-reuse --include-duplicates` | PASS, Entscheidung COMMIT |

Beide Zusätze sind eigene Owner-Entscheidungen. Nach der Entscheidung wird die Datei mit dem Werkzeug neu erzeugt; sie wird nie von Hand geändert.

**OKE ist eine eigene Entscheidung.** Mit der Freigabe der Doppelung hat ONEOK zwei Zeilen und gilt nicht mehr als backtestfähig (genau eine Zeile verlangt). Discover bleibt unverändert, weil `eligibility.json` nicht neu gebaut wird (P4). Ohne Freigabe bleibt der ganze Stamm blockiert, bis der Anbieter die Zeile entfernt. Ab dem 11.11. bleibt dann auch der Supertrader-Tageslauf stehen (Eingangsprüfung STALE). Eine Bereinigung exakt gleicher Anbieterzeilen in der Engine wäre eine fachliche Änderung des Stamms: eigener PR mit Versionswechsel, nicht vorbereitet.

**Erneuern:** Die Drift wächst täglich. Vor dem Lauf misst derselbe Probelauf neu:

```bash
# Arbeitsverzeichnis W, nichts im Repository
for f in us-security-master.json summary.json reconciliation.json company-names.json; do git show HEAD:quant/data/market/security-master/$f > W/prev/$f; done
node scripts/market/build-us-security-master.mjs --require-provider --today <T> --stamp <T>T00:00:00Z --out W/next --work-dir W/work
node scripts/market/universe-source.mjs && node scripts/market/build-company-names.mjs --sec   # schreibt Namen ins Repo: danach kopieren und git checkout -- quant/data
node scripts/market/security-master-drift-evidence.mjs --prev W/prev --next W/next --prev-names W/prev/company-names.json \
  --next-names W/next-company-names.json --measured-on <T> --out docs/data/security-master [--include-ticker-reuse] [--include-duplicates]
```

Als Erzeugerausgabe neu committen und dann laufen lassen. Neue Drift zwischen Messung und Lauf zählt gegen die normalen Grenzen und blockiert nur, wenn sie diese überschreitet.

**Quant:**
- Delistings und mehrdeutige Listings nehmen weitere IDs aus der Menge der backtestfähigen Titel. Am 30.10. sind es neben den 127 aus v130 bis zu 104 Delistings und 34 neu mehrdeutige.
- `backtest-generation-freeze.cjs compare` nimmt dafür mehrere `--approved` an. `ONLY_APPROVED_CHANGES` heißt dann: Geändert haben sich nur IDs aus einer der beiden Freigaben.
- Die erwarteten Zählungen „6.397 → 6.270“ und „191 → 180“ gelten nur für den Wechsel allein. Die tatsächlichen Werte liefert der Lauf (`compare`, Survivorship-Erzeuger).

**Verhältnis zu #1119** (SEC-belegte Delistings, 132 Zeilen):
- #1119 ändert die Engine und bekommt eine eigene G7-Freigabe.
- Erst nach diesem Wechsel mergen, damit sich die zwei Freigaben nicht überlagern.
- Manche der 132 kann die Anbieterdrift schon selbst inaktiv setzen; sie fallen im späteren Lauf dann weg.

### Eingefrorene Quant-Evidenz erweitert

Seit dem Merge von #1132 (30.10.) sind V10–V13c auf `main`. `backtest-generation-freeze.cjs repo-manifest` friert jetzt alles unter `docs/quant-recovery/` ein:
- 550 Dateien;
- `filesSha256` `12bdbbe1…`;
- Quelle `main` `adbc2f04`.

SMF-1 prüft zusätzlich, dass in den eingefrorenen Generationsverzeichnissen keine Datei außerhalb des Manifests liegt. Neue Generationen in neuen Verzeichnissen bleiben möglich; eine Änderung oder Ergänzung einer eingefrorenen Generation ist rot.

## Freigabevorlage

Der Wechsel selbst ist eine nicht rückgängig zu machende Datenveröffentlichung (Commit des Stamms auf `main`), und er ändert produktive Quant-Bezüge (`masterHash` aller Generationen). Deshalb endet die Vorbereitung hier. Ausgeführt wird erst nach Owner-Freigabe.

**Was umgestellt wird:** nur `quant/data/market/security-master/us-security-master.json` und seine Begleitdateien (`summary.json`, `reconciliation.json`, `backfill-estimate.json`; `PUSH_OWNED_PATHS`). Klassifizierer 1.1.0 → 1.3.0, gleiche Anbieterliste, gleicher Bestand. `eligibility.json` und `discover/data` bleiben unverändert (P4).

**Voraussetzungen:**
- Nachweis-PR #1101 und Freeze-PR #1100 gemergt;
- `verify-repo` INTACT;
- privater `freeze` erstellt, `filesSha256` notiert;
- Stamm auf `main` noch `26c82617…` (sonst gilt die Sonderfreigabe nicht, G8/P3);
- Nachholdrift am Lauftag oder kurz davor neu gemessen und committet (`drift-approved-changes.json`);
- Scheduler aus, keine Repository-Variable.

**Erwartete Diffs je Klasse** (je stabiler `securityId`; Zählabgleich oben):

| Klasse | erwartet | Gate |
|---|---|---|
| Instrumenttyp | 138: 127 → PREFERRED, 11 → TEST_SECURITY | G7 über Sonderfreigabe, `report.approval.applied` 138 |
| Eignung `eligible_us_equity` | 138, alle true → false (dieselben IDs) | G7 über Sonderfreigabe |
| `canonical_id`, Ticker, aktiv → inaktiv, Reaktivierung, verlorene oder neue IDs | 0 aus dem Wechsel; die Anbieterdrift seit 11.09. ist über die normalen Grenzen hinaus (Abschnitt Nachholdrift) und braucht die Nachholfreigabe | G3–G7 unverändert 25 / 25 / 50 / 50 / 25, Drift über `drift-approved-changes.json` |
| Zeilen | 149 Typzeilen, 138 Eignungszeilen; geeignete Zeilen 6.583 → 6.445 | – |
| backtestfähige IDs | 6.397 → 6.270 (−127, +0) | `compare`: 127 `NEWLY_BLOCKED`, sonst gleiche Kennzahlen |
| Survivorship-Kontrolle | 191 → 180 inaktive Stammaktien-Zeilen | eigener Erzeuger-PR |
| Emerging Leaders | Eingangsmenge −138, inaktive −11 | eigener Erzeuger-PR |

**Betroffene Verbraucher:**
- private Wochen-Backtests: alte Generation zurückgehalten, neue Generation in neuer Wurzel;
- Supertrader-8-Eingangsprüfung: 138 IDs gelten als Nicht-Stammaktie, keine davon in einem Discover-Universum;
- Survivorship-Kontrolle und Emerging Leaders: je eigener PR;
- Inventare `capabilities-v1`, `sic-peer-taxonomy-v1`, `naming-contract-v1`, `total-return-quality-v1`: werden nicht neu gebaut;
- Discover: keine Wirkung;
- `docs/quant-recovery/**`: eingefroren.

**Rückweg:**
- Stamm: Revert des Übernahme-Commits. Die alten Bytes `26c82617…` stehen in Git, die Prüfsumme im Freeze-Manifest.
- Backtests: Leser bleibt bzw. geht zurück auf `<privat-1.1.0>`, `verify` INTACT.
- Erzeuger-PRs (Survivorship, Emerging Leaders): Revert.
- Kein Schritt löscht oder überschreibt eine Generation.

```
Security Master 1.3.0 – einmaliger Klassifiziererwechsel und wöchentliche Aktualisierung
[ ] PR #1033 gemergt am 28.10.2026 (Workflow, Gate, Sonderfreigabe, Nachweis) – aktiviert nichts
[ ] Nachweis-PR #1101 gemergt (Zählabgleich, SMW-11)   [ ] Freeze-PR #1100 gemergt (SMF-1…5)
[ ] P1 Listen geprüft: docs/data/security-master/v130-switch-lists.md, v130-count-reconciliation.json
       138 Typwechsel, 138 Eignungswechsel, 127 entfallende backtestfähige IDs, 133 als falsch bestätigt: ja / nein
[ ] P2 verify-repo INTACT (550 Dateien, filesSha256 12bdbbe1…): ____
[ ] P2 privater freeze: Wurzel ____, Generation ____, filesSha256 ____, Archiv ____
[ ] P3 Sonderfreigabe v130-approved-changes.json (prevMasterSha256 26c82617…) freigegeben: ja / nein
[ ] Nachholdrift drift-lists.md geprüft (Messung ____): Delistings ___, canonical_id ___, Eignung ___, Typ ___, Namen ___
       14 Identitätsbefunde (nicht freigegeben, zählen gegen die Grenzen) zur Kenntnis: ja / nein
       4 Namen SEC → Tiingo-Metadaten und 1 kuratiert → SEC (nicht freigegeben, P5) zur Kenntnis: ja / nein
[ ] Tickerwiederverwendung (35 IDs, drift-lists.md) als mehrdeutig übernehmen: ja (--include-ticker-reuse) / nein (Lauf bleibt blockiert)
       Identitätsprüfung der Produktreihen dieser IDs als eigener Discover-/Identitäts-PR: beauftragt ja / nein
[ ] OKE-Doppelung tiingo:NYSE:OKE:1985-07-01 freigeben (ONEOK danach nicht backtestfähig): ja (--include-duplicates) / nein (Lauf bleibt blockiert)
[ ] Lauf 1  workflow_dispatch commit=false allow_version_change=true approved_changes=true approved_drift=true: Lauf ______
       Gate PASS, report.approval.applied ____, sonst keine Wechsel über den Grenzen: ____
[ ] Lauf 2  dieselben Eingaben, commit=true: Lauf ______ (Datenveröffentlichung, nicht umkehrbar außer per Revert)
[ ] P2 build-post-switch: neue Wurzel ____, Generation ____, lineage.json frozenRootVerified INTACT/INTACT
[ ] P2 compare --approved v130 --approved drift: ONLY_APPROVED_CHANGES, unexpected 0, NEWLY_BLOCKED ____: ____
[ ] Leser auf neue Wurzel umgestellt (eigene Freigabe): ja / nein / später
[ ] Survivorship-PR #____ (191 → 180)    [ ] Emerging-Leaders-PR #____
[ ] P4 eligibility.json unverändert    [ ] P5 nur SEC/kuratierte Namen
[ ] P6 Zeitplan-PR #____ (erst danach; Scheduler bis dahin aus)
Entscheidung: freigeben / nicht freigeben        Datum, Name: ______
```
