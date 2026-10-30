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
