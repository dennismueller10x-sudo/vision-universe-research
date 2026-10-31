# Interne Backtest-Vorschau (`backtest-preview-1.0.0`)

Stand 2026-10-30 · Status: **intern, standardmäßig ausgeschaltet, nicht verdrahtet, nicht zertifiziert.**
`productionApproved` und `publiclyActivated` sind immer `false`. Jede Ausgabe trägt das Label `RESEARCH`,
die Vertrauensstufe `NOT_PRODUCT_TRUST` und `NO_ALPHA_OR_CERTIFICATION_CLAIM`.

Grundlage: Research-Backtest-Runner aus #1133 ([BACKTEST_RUNNER.md](BACKTEST_RUNNER.md)), Ergebnisvertrag v2
([BACKTEST_RESULT_CONTRACT_V2.md](BACKTEST_RESULT_CONTRACT_V2.md)) und die 16 committeten Demonstrationsfälle in
`docs/quant/backtest-demos/`. Die Vorschau macht die sechs Research-Arten mit ihren echten Ergebnissen, Kennzahlen,
Benchmarks und Datenqualitätsgrenzen technisch in einer kontrollierten Vorschau nutzbar. Sie zeigt nichts im Produkt.

## 1. Was existiert

```
committete Runner-Ergebnisse (backtest-runner-result-1.0.0, Umschlag backtest-result-2.0.0)
  → build-backtest-preview.cjs → backtest-preview-service.buildPreview()
       └─ je Umschlag: backtest-research-adapter.getResearchBacktest() (Vertrag, Art, productionApproved, Zustand C)
  → docs/quant/backtest-preview/backtest-preview.json   (Lesemodell, versioniert, Hash-versiegelt)
  → backtest-preview-service.getBacktestPreview(doc, options)   (Gating wie getRealBacktest)
  → render-backtest-preview.cjs → Markdown/HTML außerhalb des Repositorys (interne Durchsicht)
```

| Datei | Rolle |
|---|---|
| `quant/api/backtest-preview-service.cjs` | `buildPreview`, `previewViolations`, `getBacktestPreview`; Node-only wie `real-backtest-service.cjs` |
| `scripts/quant/research/build-backtest-preview.cjs` | CLI: Lesemodell aus `--demos` (und optional `--extra-result`) bauen |
| `scripts/quant/research/render-backtest-preview.cjs` | CLI: interne Durchsicht als `.md`/`.html`, nur außerhalb des Repositorys |
| `docs/quant/backtest-preview/backtest-preview.json` | committetes Lesemodell (reproduzierbar aus den Demos, Test) |
| `scripts/quant/verify-backtest-preview.py` | unabhängige Gegenprüfung (stdlib, `python3 -I`) |
| `quant/tests/backtest-preview.test.mjs` | Tests (Abschnitt 6) |

**Keine neue Architektur.** Es wird nichts neu gerechnet: Kennzahlen, Unsicherheit, Ereigniszählungen, Methodenergebnisse,
Grenzen und Hashes werden unverändert aus den Umschlägen kopiert. Die Prüfung jedes Umschlags läuft über den bestehenden,
isolierten `backtest-research-adapter.js` (Vertrag `backtest-result-2.0.0`, Art, `productionApproved=false`, Zustand C nur mit
Zertifizierungsartefakt), die Prüfung des Zertifizierungsartefakts über `backtest-certification.js#certificationViolations`.

**Ort des Lesemodells.** Nicht unter `quant/data`: dort liegen nur Artefakte mit einem registrierten Erzeuger aus einem
Datenlauf (`core/registry/domains.json`, Feld `producer`), und Testläufe dürfen dort nichts schreiben. Die Vorschau stammt aus
committeten Demonstrationsfällen unter `docs/quant/backtest-demos/` und liegt deshalb daneben unter `docs/quant/backtest-preview/`.
Der Builder verweigert Ziele unter `quant/data`, `discover/data`, `supertrader/data`, `social/data`. Hinweis: `docs/` liegt im
Repository und ist damit nicht geheim; das Lesemodell enthält nur Zahlen, die in `docs/quant/backtest-demos/` bereits committet sind.

**Kein Konfigurationsschalter im Produkt.** Das bestehende interne Vorschaumuster (`getRealBacktest`) schaltet über eine
Option beim Erzeugen der Dienste frei (`options.realBacktestPreview = { enabled: true, audience: 'INTERNAL_REVIEW' }`), nicht über
eine öffentlich ausgelieferte Konfigurationsdatei. Die Backtest-Vorschau übernimmt genau diese Form
(`options.backtestPreview`), legt aber **keinen** Haken in `product-services.js` an: dort gibt es keinen vorhandenen,
ausgeschalteten Haken für diese Vorschau, und der Isolations-Test des Research-Adapters verbietet ihn. Eine Datei
`quant/config/backtest-preview.json` gibt es bewusst nicht (Test).

## 2. Lesemodell `backtest-preview-1.0.0`

Oberste Ebene: `schemaVersion`, `audience: INTERNAL_REVIEW`, `label: RESEARCH`, `trust: NOT_PRODUCT_TRUST`,
`claim: NO_ALPHA_OR_CERTIFICATION_CLAIM`, `productionApproved: false`, `publiclyActivated: false`, `sources`, `certification`,
`kinds[6]`, `previewHash` (sha256 des kanonischen JSON ohne `previewHash`).

`certification`: Quelle, Schema, je Art `status`, `readiness`, `trust`, `reason`, `blockers`, dazu `certifiedKinds` (heute leer)
und `statusSha256`. Gebunden wird der **Statusinhalt**, nicht der Zeitstempel: eine Neuerzeugung des Artefakts mit
unveränderten Status lässt die Vorschau gültig; jede Status- oder Blockeränderung führt zu
`CERTIFICATION_STATUS_CHANGED_REBUILD_PREVIEW`.

`kinds[]` (immer alle sechs, feste Reihenfolge): `kind`, `label` (aus dem Zertifizierungsartefakt), `state` / `stateCode`
(C, wenn ein Fall C ist, sonst A, wenn ein Fall A ist, sonst B), `states {A,B,C}`, `certification`, `dataQualityLimits`
(Vereinigung der Datenqualitätswarnungen), `limitations` (Vereinigung), `cases[]`.

`cases[]`: `id`, `kind`, `scenarios`, `privateData`, `purpose`, `state`, `stateCode`, `stateLabel`, `evidenceKind`,
`certificationStatus`, `certificationSource`, `runnerCertificationSha256`, `productionApproved: false`, `period`, `engine`
(tatsächlicher Engine-Pfad), `costs`, `listings`, `excluded`, `events`, `metrics` (vollständig wie im Umschlag),
`uncertainty`, `benchmark {requested, definition, excess}`, `funded` (finanzierte Variante aus `summary.json`), `methods`
(Methode, Zustand, Ergebnis), `dataQuality` (Renditebasis, Abdeckung, Zensur, Endzustand, Überlebende,
Kapitalmaßnahmen-Zusammenfassung, Warnungen), `limitations`, `missingInputs`, `pit`, `hashes`.

## 3. Gating und View-Modell

```js
const S = require('quant/api/backtest-preview-service.cjs');
S.getBacktestPreview(doc, {
  backtestPreview: { enabled: true, audience: 'INTERNAL_REVIEW' }, // Standard S.DEFAULT_CONFIG = { enabled: false, ... }
  internalPreview: true,                                         // nur damit erscheinen Zahlen
  certification,                                                 // quant/data/product/backtest-certification-v1.json (Pflicht)
  kind: 'SIGNAL_BACKTEST'                                        // optional
});
```

| Eingabe | Antwort |
|---|---|
| ohne `backtestPreview`, `enabled !== true` (auch `'true'`) oder `audience !== 'INTERNAL_REVIEW'` | `DISABLED / BACKTEST_PREVIEW_DISABLED` |
| freigeschaltet, ohne `internalPreview` | `AVAILABLE`, `mode: STATUS_ONLY`: Zustände, Zertifizierung, Grenzen, Datenqualität; `metrics`, `uncertainty`, `benchmark`, `funded`, `methods`, `events`, `pit` sind `null` |
| freigeschaltet, `internalPreview: true` | `AVAILABLE`, `mode: INTERNAL_NUMBERS`: zusätzlich die Zahlen der Umschläge |
| Hash falsch, Flags verändert, Zertifizierungsartefakt fehlt/verletzt seinen Vertrag/Status geändert | `UNAVAILABLE / PREVIEW_CONTRACT_VIOLATED` mit `errors` |
| ein Fall `PRODUCT_CERTIFIED`, ohne dass das Artefakt die Art `CERTIFIED` meldet | `UNAVAILABLE / PRODUCT_CERTIFICATION_NOT_PROVEN` |

In jedem Fall: `label: RESEARCH`, `trust: NOT_PRODUCT_TRUST`, je Fall `display.productAllowed: false`,
`productionApproved: false`, `publiclyActivated: false`. Zustand A wird nie automatisch C.

## 4. Intern einschalten (genauer Schalter)

Neu bauen (nur nötig, wenn sich Demos oder Zertifizierungsstatus ändern):

```bash
node scripts/quant/research/build-backtest-preview.cjs --out docs/quant/backtest-preview/backtest-preview.json
# optional ein offline gerechneter Runner-Lauf als weiterer Fall:
node scripts/quant/research/run-backtest.cjs --spec s.json --out /privat/r.json --no-qa
node scripts/quant/research/build-backtest-preview.cjs --extra-result /privat/r.json --out /privat/preview.json
```

Interne Durchsicht (Ziel muss außerhalb des Repositorys liegen):

```bash
node scripts/quant/research/render-backtest-preview.cjs --out /privat/vorschau.md                               # DISABLED
node scripts/quant/research/render-backtest-preview.cjs --enable --out /privat/vorschau.md                      # STATUS_ONLY
node scripts/quant/research/render-backtest-preview.cjs --enable --internal-preview --out /privat/vorschau.html # INTERNAL_NUMBERS
```

Programmatisch: `options.backtestPreview = { enabled: true, audience: 'INTERNAL_REVIEW' }` und zusätzlich
`options.internalPreview = true` an `getBacktestPreview` übergeben. Es gibt keinen anderen Schalter.

## 5. Arten im Überblick (Stand der committeten Demos, Datenstand 2025-12-31)

| Art | Zustand (Fälle) | Zertifizierung (Artefakt) | Kennzahlen | Benchmark | wichtigste Grenzen |
|---|---|---|---|---|---|
| SAME_STOCK_REPLAY | A (4: NVDA, INTC, SMCI-Ledger, XCO delistet privat) | LIMITED / NOT_READY · Überlebende per Konstruktion, beschreibt statt prüft | je Ereignis (Trefferquote, Median/Mittel netto, Median-Ereignis-Drawdown, Ø Überschuss); Ledger: Gesamt, CAGR, Vol, MDD | SPY Kursrendite je Ereignis; Ledger: Kauf und Halten derselben Aktie | Einzeltitel ex post gewählt, Kursrendite, keine Delisted-Reihen (außer privat), ex post bereinigte Historie |
| PATTERN_EVIDENCE | A (1: 2015 seitwärts) | LIMITED / NOT_READY · Überlebende teils unquantifiziert, keine Gesamtrendite | je Ereignis, Intervall 95 % | SPY Kursrendite | Überlebenden-Kohorte, Kursrendite, keine Gesamtrendite |
| SIGNAL_BACKTEST | A (5: 2008, 2009, 2020, 2022, AGN privat) | LIMITED / NOT_READY · nur teilweise Sensitivität, keine Regel zertifiziert | je Ereignis, Intervall 95 %; finanzierte Variante (Gesamt, CAGR, MDD) | SPY Kursrendite | je-Ereignis-Statistik ist kein finanziertes Portfolio, Überlebenden-Kohorte |
| SETUP_BACKTEST | A (1: Rekonstruktion 2016–2024, Evidenzart RECONSTRUCTION) | COLLECTING_HISTORY / NOT_READY · u. a. Historie zu kurz, OOS nicht messbar | je Ereignis, Intervall 95 % | SPY Kursrendite | rekonstruierte Zustände, Setup-OOS `FAIL / OOS_NOT_MEASURABLE_YET` |
| STRATEGY_BACKTEST | A (3: 2019, 2013–2014, Dividenden-TR) · B (1: Profil) | COLLECTING_HISTORY / NOT_READY · historische Mitgliedschaft fehlt | Gesamt, CAGR, Vol, MDD, Turnover, Kosten, Sharpe (rf 0), Beta, Tracking Error | SPY Kursrendite; TR-Fall: Bargeld zu 0 % | B: PIT-Faktor-Snapshots und Provenienz fehlen; Kursrendite außer TR-Fall |
| FACTOR_RANKING_BACKTEST | A (1, nur mit privatem V10-Panel; ohne Panel B) | COLLECTING_HISTORY / NOT_READY · Faktorhistorie zu kurz | je Ereignis, mittlerer Spearman, Q5−Q1 | SPY Kursrendite | privates Panel (Hash gebunden), Rekonstruktion |

Die genauen Zahlen stehen im Lesemodell und in [BACKTEST_RUNNER.md](BACKTEST_RUNNER.md), Abschnitt 5. Sie beschreiben
Rechenwege auf bedingten, nachträglich gewählten Auswahlen und sind kein Strategiebefund. Die negativen V10–V13-Befunde
bleiben unverändert.

## 6. Tests

`node --test quant/tests/backtest-preview.test.mjs`:

- standardmäßig ausgeschaltet (auch bei falscher Zielgruppe oder `enabled: 'true'`);
- `STATUS_ONLY` ohne Zahlen, `INTERNAL_NUMBERS` nur mit `internalPreview: true`, immer `RESEARCH`;
- Zahlen gleich den committeten Umschlägen (Kennzahlen, Unsicherheit, Ereignisse, Methoden, Hashes, PIT, finanzierte Variante);
- alle sechs Arten mit Datenqualitätsgrenzen, Zertifizierungsstatus und Zuständen; B hat fehlende Eingaben, A hat Zahlen;
- `PRODUCT_CERTIFIED` ohne zertifizierendes Artefakt, mit gefälschtem Artefakt oder als manipulierter Umschlag abgelehnt;
- Manipulation und geänderter Zertifizierungsstatus schließen; neu erzeugtes Artefakt mit gleichen Status bleibt gültig;
- Lesemodell reproduzierbar, Zertifizierungsartefakt byte-unverändert, Python-Gegenprüfung (`python3 -I`);
- keine Wörter der Vorteils-/Überrendite-Regel des Ergebnisvertrags in Lesemodell, View und Renderings;
- Renderer: `DISABLED` ohne `--enable`, verweigert jedes Ziel im Repository, `git status` unverändert;
- Isolation: nur die beiden Offline-Werkzeuge erreichen den Dienst; kein Produktdienst, keine Ansicht, kein Endpunkt, kein Workflow.

Der bestehende Isolations-Test des Research-Adapters (`quant/tests/backtest-result-contract.test.mjs`) lässt genau einen
zusätzlichen Aufrufer zu (`quant/api/backtest-preview-service.cjs`) und verbietet zusätzlich das Stichwort `backtest-preview`
in `product-services.js`, `quant/index.html` und `page-backtest.js`.

## 7. Was getrennt bleibt (eigene Prüfung, eigene Freigabe)

- **Produktanzeige.** `quant/app/**` ist byte-gesperrt (`docs/quant-recovery/v51/ui-protection.json`); die Vorschau ändert
  keine Ansicht, kein CSS, keine Navigation und legt keinen Endpunkt an. Eine Anzeige wäre ein eigener PR mit eigener
  Owner-Entscheidung (wo, für wen, mit welchen Zahlen).
- **Verdrahtung.** Kein Haken in `product-services.js`. Ein späterer ausgeschalteter Haken nach dem Muster von
  `getRealBacktest` bräuchte eine Änderung der Isolations-Tests und eine eigene Freigabe.
- **Fachliche Freigaben.** Zertifizierung (`backtest-certification-v1`, Setup-Unabhängigkeit, OOS-Norm) bleibt unverändert;
  heute zertifiziert das Artefakt keine Art. Öffentliche Zahlen, Vertrauensstufen und Aussagen über Vorteile brauchen die
  bestehenden Gates und eine Owner-Freigabe.
- **Private Fälle.** Die Fälle mit privatem Panel bzw. privaten Delisted-Reihen (Faktor, XCO, AGN) sind nur mit diesen
  Eingaben nachrechenbar.

## 8. Version 2 (31.10.2026): aktuelle Demos, Nachweisart, Spec-Builder

- **Lesemodell neu erzeugt:** Grundlage sind die auf `main` neu gebauten 16 Demos (#1178). Neu erzeugt auf `main` @ `bceb376` (Demos aus #1205), `previewHash` `8bbee23f…`; Python-Prüfung `verify-backtest-preview.py`: 16 Fälle, 0 Befunde. Der Reproduzierbarkeitstest besteht.
- **Nachweisart je Fall** (`display.evidence`, nur in der Ansicht, das Lesemodell bleibt unverändert):

  | Klasse | Anzeige | Abgeleitet aus | Fälle |
  |---|---|---|---|
  | `HISTORICAL_STUDY` | Historische Studie (beobachtete Daten) | Standard | Replay, Pattern, Signal |
  | `HISTORICAL_SIMULATION` | Historische Simulation | `evidenceKind` SIMULATED_LEDGER oder `HISTORICAL_PRICE_SIMULATION` | Ledger, Strategy |
  | `RECONSTRUCTION` | Rekonstruierte Forschungsdaten | Limitation mit `RECONSTRUCT…` | Setup, Faktor |
  | `NOT_COMPUTED` | Nicht gerechnet (Eingaben fehlen) | Zustand B | Strategy-Profil |
  | `CERTIFIED_STRATEGY` | Zertifiziert | **nur** Zustand C (PRODUCT_CERTIFIED) | heute keiner |

  `alphaClaim` ist immer `false`.
- **Spec-Builder** (`scripts/quant/research/backtest-spec-builder.cjs`): erzeugt aus einer Auswahl eine Runner-Spec, die `validateSpec` prüft.
  - Ausgangspunkt sind die 16 registrierten Vorlagen.
  - Änderbar sind nur: Zeitraum (innerhalb des Datenstands der Vorlage), Kosten (`NONE`, `STANDARD` 5+5, `HIGH` 20+20 Bp je Seite), Benchmark (SPY oder keine), Signalregeln (Teilmenge der 5 Regeln), Faktor (7 Signale), Methoden (wie Vorlage oder keine).
  - Eine Produktzertifizierung kann nie angefordert werden.
  - Fehler kommen nur als sichere Codes zurück (`SAFE_CODES`).
  - Ausführung offline: `run-backtest.cjs --spec <spec> --out <datei>`. Beispiel: Vorlage signal-2022-bear, 2022-01..06, HIGH, TREND_DOWN ergibt Zustand A in rund 40 s.
- **Ausführungsmodell:** Der Runner braucht Node, rund 700 MB bis 2,3 GB und die privaten Archive, er läuft also nicht auf GitHub Pages. Geplant ist deshalb ein vorgerechneter Katalog:
  1. ein freigegebenes Raster von Auswahlen über den Spec-Builder;
  2. Rechnung in CI wie beim Demo-Neubau (`[v13-archive:demos]`), mit `verify-backtest-runner.py`;
  3. `build-backtest-preview.cjs --extra-result` erzeugt ein hashgebundenes Lesemodell;
  4. die Ansicht schlägt nach `specHash` nach. Was nicht vorgerechnet ist, wird als „nicht vorgerechnet“ angezeigt.

  Das Raster samt Laufzeitbudget ist der nächste Schritt (eigener PR).
- **Unverändert:** standardmäßig aus, nicht in `product-services.js` verdrahtet, keine Frontend-Änderung, `productionApproved=false`. Eine Anzeige im Produkt braucht eine eigene Owner-Freigabe.

## 9. Geschützter Zugang über den Konto-Worker (31.10.2026, Owner-Freigabe P4: nur intern)

Ziel: Die Vorschau ist für berechtigte Prüfer im Browser nutzbar, aber **nur** nachweisbar geschützt und **nur** nach
ausdrücklichem Einschalten. `docs/` wird von GitHub Pages nicht ausgeliefert, das Repository ist aber öffentlich. Ein
nachweisbarer Schutz besteht deshalb nur über den Konto-Worker und die Supabase-Rollen (Muster der Tarifverwaltung,
[TARIFVERWALTUNG.md](../accounts/TARIFVERWALTUNG.md)). Keine neue Architektur, keine neue Engine, keine Rechnung im
Browser oder im Worker.

```
docs/quant/backtest-catalog (21 vorgerechnete Auswahlen, catalogHash) ┐
Lesemodell backtest-preview.json (previewHash, nur Übersicht)         ├─ export-backtest-review-bundle.cjs
backtest-spec-builder.cjs (Menü, Vorlagen, sichere Codes)             ┘        │
                                   workers/vu-account/data/backtest-review-bundle.json (bundleHash)
                                                                               │
                         vu-account: /v1/admin/backtests*  (Schalter + Sitzung + Rolle backtest_reviewer)
```

| Baustein | Inhalt |
|---|---|
| `scripts/quant/research/export-backtest-review-bundle.cjs` | baut das Paket (`backtest-review-bundle-1.0.0`): Menü, Vorlagen, Übersicht je Art, Katalogindex und abgeleitete Anzeigefelder je Eintrag (Kennzahlen, Risiko, Kosten, Benchmark, Drawdown, Datenqualität und Abdeckung, historische Population, Methoden mit Zustand, Grenzen, PIT). Keine Rohreihen, keine QA-Blöcke, keine Code-Hashes. Prüft Katalogintegrität (`catalogViolations`), `previewHash`, `gridHash`, Security-Master-Generation (`us-security-master-1.1.0`); `--check` vergleicht mit dem committeten Paket |
| `workers/vu-account/src/backtests.mjs` | `GET /v1/admin/backtests` (Menü + Übersicht, ohne Zahlen), `GET/POST /v1/admin/backtests/lookup` (Auswahl → vorgerechneter Eintrag oder `NOT_PRECOMPUTED`) |
| `supabase/migrations/20261031000100_backtest_reviewer.sql` | nur der Rollenwert `backtest_reviewer`, **keine Vergabe** |

**Schutz, in dieser Reihenfolge bei jeder Anfrage:**

1. Schalter `VU_BACKTEST_REVIEW_ENABLED` (wrangler.toml, Entwicklung und Produktion `"false"`): sonst **404
   `PREVIEW_NOT_ACTIVATED`**, ohne Daten und ohne Rollenabfrage.
2. Sitzung (HttpOnly-Cookie oder Bearer-JWT, geprüft gegen JWKS): sonst **401**.
3. Rolle `backtest_reviewer` aus `user_roles` mit dem JWT des Kontos (RLS; Konten können Rollen nur lesen): sonst **403
   `NOT_BACKTEST_REVIEWER`**. `pricing_admin` und `billing_tester` berechtigen nicht.
4. Paketintegrität (`bundleHash`, `productionApproved=false`, `NOT_CERTIFIED`, kein `CERTIFIED_STRATEGY` ohne
   Zertifizierungsartefakt, das die Art zertifiziert): sonst **503 `BACKTEST_BUNDLE_INVALID`**.

Das Paket selbst liefert GitHub Pages nicht aus (`scripts/vu2/build-release.mjs#permitted` schließt `workers/*/data/`
aus, Test); es erreicht Prüfer nur über diese Routen. Die Zahlen stammen aus `docs/quant/backtest-catalog/` und liegen
damit wie bisher im (öffentlichen) Repository, nicht auf der Website.

POST nur mit erlaubter Herkunft und Kopf `X-VU-Client: web` (CSRF, wie alle Konto-Routen). Antworten `Cache-Control:
no-store, private`, `X-Robots-Tag: noindex`. Fehler tragen nur einen Zustand und gegebenenfalls einen sicheren Code
(`SAFE_CODES` des Spec-Builders), nie Daten.

**Nachschlagen.** Der Worker übersetzt eine Auswahl nach denselben Regeln wie `backtest-spec-builder.cjs#buildSpec` in
eine Spec und schlägt deren `specHash` im Paket nach. Die Gleichheit von `specHash`, Fehlercodes und Ergebnis mit
`buildSpec` und `build-backtest-catalog.cjs#lookup` sichert ein Test über alle Raster-Auswahlen und über 200 Varianten.
Was nicht vorgerechnet ist, heißt `NOT_PRECOMPUTED` („nicht vorgerechnet“). Es wird nie gerechnet.

**Nachweisart** je Eintrag (`evidence`): dieselbe Regel wie `display.evidence` der Vorschau (Test gegen die Ansicht).
Alle Einträge: `productionApproved=false`, `alphaClaim=false`; heute zertifiziert das Artefakt keine Art.

**Neu erzeugen** (nach Neubau von Katalog oder Lesemodell, sonst schlägt der Reproduzierbarkeitstest fehl):

```bash
node scripts/quant/research/export-backtest-review-bundle.cjs --out workers/vu-account/data/backtest-review-bundle.json
node scripts/quant/research/export-backtest-review-bundle.cjs --check
```

Nach einem Wechsel des Security Masters ist der Katalog veraltet: Katalog neu rechnen, dann das Paket neu exportieren
(eine unbekannte Master-Generation bricht den Export ab).

**Isolation.** Der Export liest das Lesemodell als JSON und prüft dessen Hash; den Vorschau-Dienst lädt er nicht. Dafür
lässt der Isolations-Test in `quant/tests/backtest-preview.test.mjs` genau einen zusätzlichen Leser des Pfads
`backtest-preview/backtest-preview.json` zu (den Export). Alle übrigen Isolationsregeln bleiben unverändert.

**Tests:** `node --test workers/vu-account/tests/backtests.test.mjs quant/tests/backtest-review-bundle.test.mjs`, SQL:
`supabase/tests/12_backtest_reviewer.sql` (braucht `PG_TEST_URL`).

**Owner-Entscheidungen (nicht in diesem Schritt):** Rolle vergeben (an wen) und Schalter einschalten
([FREIGABEN.md](../accounts/FREIGABEN.md)). Die Seite unter `/konto/admin/backtests/` ist ein eigener Entwurfs-PR; sie
ist nicht verlinkt und zeigt nur, was der Worker liefert.

**Seite (Entwurf, nicht verlinkt): `/konto/admin/backtests/`.** Gleiche Shell wie die Tarifverwaltung (`konto.css`,
`noindex`), Steuerung `views['backtest-review']` in `konto/konto.js`, Anzeige in `konto/admin/backtests/review.js`
(nur `textContent`). Ohne Endpunkt oder ohne Sitzung keine Anfrage; ohne Schalter oder Rolle nur die Meldung des
Servers. Auswahl: Art, Vorlage (historisches Beispiel), Zeitraum, Kosten, Benchmark, Zusatzmethoden, Signalregeln bzw.
Faktor – oder direkt eine der vorgerechneten Auswahlen. Ergebnis: Rendite, Risiko und Drawdown, Kosten, Benchmark,
Datenqualität und Abdeckung, historische Population; jede Zeile mit Bezeichnung, Nachweisart und Grundlage; Grenzen und
Zertifizierungsstand (`NOT_CERTIFIED`, `productionApproved: false`) in jedem Zustand, auch bei „nicht vorgerechnet“.
Keine Änderung an `quant/app/**`, `quant/index.html`, `assets/site-navigation.*` oder `ui-protection.json`.
Tests: `node --test konto/tests/backtest-review.test.mjs`.
