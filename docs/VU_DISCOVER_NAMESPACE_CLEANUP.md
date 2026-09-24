# DISCOVER NAMESPACE & LEGACY CLEANUP REPORT

Stand: 24.09.2026 · Basis: `main` @ `ff355c309` (nach ONE DISCOVER, PR #195)

Grundsatz: Funktion vor Namenssauberkeit. Kein globales Suchen & Ersetzen;
jeder Fund ist klassifiziert und nur geändert, wo die Änderung nachweislich
neutral ist.

## 1. Inventory und 2. Klassifikation

| Pfad | Symbol / Treffer | Aktiv? | Klasse | Entscheidung |
|---|---|---|---|---|
| sichtbare Oberfläche (`discover/*.js`, `index.html`, Nav) | „Discover 1.0/2.0/2.1“ | – | A | **0 Treffer** — bereits mit PR #195 neutralisiert |
| `discover/ui/daten.js:97` → `meta.moduleVersion` | „Version: Discover discover-4.0.0“ auf *Daten & Quellen* | aktiv | A/C | **bleibt**: technische Versionsangabe des Datenvertrags aus `discover/data/meta.json` (erzeugt von `build-discover-data.mjs`); Änderung wäre ein Eingriff in die Datenpipeline |
| `discover/{app,home,detail,themes}.js` | `global.VUDiscoverV2` | aktiv | B | **migriert** → `VUDiscover.Views` (s. 4.) |
| `discover/*.css`, `discover/*.js`, `index.html` | `.v2-*`, `.dv2`, `.dv2-*`, `#v2-shell`, `.v2-skip` (≈2.280 Treffer in 7 Dateien) | aktiv | C | **bleiben** (s. 5.) |
| `scripts/discover/browser-qa.mjs`, `delivery-check.mjs`, `browser-qa-live.mjs`, `scripts/universe/browser-qa.mjs` | `.v2-*`-Selektoren, `window.__dv2Vitals` | aktiv (Test) | C/D | **bleiben** — spiegeln die aktiven DOM-Klassen |
| `.github/workflows/*` | Workflow-/Job-Namen | aktiv | D | **0 versionierte Namen** — „Discover Frontend Quality Gates“, „Discover CI“, „Discover Live-Rauchtest“ bereits neutral |
| `discover/app.css:74`, `discover/detail.css:1,187,342` | Kommentare „Discover 2.1 / 1.0 / 2.0“ | aktiv (Kommentar) | D | **neutralisiert** (reine Kommentare) |
| `scripts/quality/verify-currency-ui.mjs:27` | Kopfkommentar „UI8 Discover 1.0 und Discover 2.1 …“ | aktiv (Kommentar) | D | **neutralisiert** auf die tatsächliche Zusage von UI8 |
| `discover/methodology/discover-v1.json` (+ 5 Leser) | Methodik-Datei `discover-v1` | aktiv | C (Datenvertrag) | **bleibt** — Versionskennung der Scoring-Methodik (`methodologyVersion`), nicht der Produktgeneration; gelesen von Build, Verify, Tests |
| `discover/index.html` | `<vu-navigation no-preview>` | aktiv | C | **bleibt** — `navigation-theme.test.mjs` verlangt das Attribut; wirkungslos seit der Plakette entfiel |
| `discover/app.css` | `.v2-preview` Regel | tot (kein Element) | E | **bleibt** — CSS-Bereinigung außerhalb des Budgets, kein Laufzeiteffekt |
| `discover/discover.css` | Discover-1-Klassen (`.dx-fnav*`, `.dx-hero*`, `.dx-positioning*` …) | vermutlich tot | E | **bleibt** — statisch nicht beweisbar: mehrere Klassen werden zur Laufzeit zusammengesetzt (`dx-live-label--`+Zustand, `dx-legend-ma-`+Periode); ohne Coverage-Messung kein Löschen |
| `quant/engines/fx/currency-contract.js:6`, `money-format.js:9,79`, `quant/config/currency-formatting-baseline.json` (note) | Kommentare „Discover 1.0/2.1“, „discover-v2/home.js“ | aktiv (Kommentar) | F/Core | **bleiben** — Currency Core eingefroren |
| `scripts/quality/currency-debt-patterns.mjs:18` | Suchwurzel `"discover-v2"` | aktiv | Core-Tooling | **bleibt** — Currency-Werkzeug; Wurzel enthält nur den Alias, harmlos |
| `docs/discover-v2/**`, `docs/VU_DISCOVER_V*.md`, `docs/VU_DISCOVER_CONSOLIDATION.md`, `docs/screenshots/**` | Versionsnamen | historisch | F | **unverändert** |
| `discover-v2/index.html` | Weiterleitung | aktiv | G | **bleibt** — Compatibility Redirect, keine zweite Implementierung |
| `.github/workflows/discover-frontend-ci.yml` (Kopfkommentar, Pfadfilter `discover-v2/**`) | Historie + Alias-Schutz | aktiv | F/G | **bleibt** — Pfadfilter schützt den Alias |
| `scripts/discover/{consolidation-gate,contract-qa}.mjs`, `verify-currency-ui.mjs` UI8 | `/discover-v2/` | aktiv (Test) | G | **bleiben** — prüfen den Alias |

## 3. Entfernte Legacy-Reste

Keine in diesem Durchgang. Die Discover-1-Laufzeit (`discover/app.js` alt,
`discover/index.html` alt, `discover/ui/hero.js`) wurde bereits mit PR #195
entfernt. **DISCOVER_1_RUNTIME_LEGACY = 0**: kein geladenes Skript und kein
Export existiert mehr nur für Discover 1 (geprüft: jeder `<script>` in
`discover/index.html` ist Teil des kanonischen Frontends oder geteilte
Engine/UI; `VUDiscover.Hero` existiert nicht mehr).

## 4. Umbenannte aktive Namespaces

`window.VUDiscoverV2` → `window.VUDiscover.Views`

- Producer: `themes.js` (`Themes`), `home.js` (`Home`), `detail.js` (`Detail`);
  Consumer: `app.js` (`V.Themes`, `V.Home`, `V.Detail`), `home.js` (`V.Themes`).
- Keine weiteren Leser: kein Test, kein Skript, kein Workflow, keine andere
  Seite, kein dynamischer Zugriff (`grep` über das ganze Repository).
- **Warum nicht flach `VUDiscover`:** dort liegt bereits `VUDiscover.Detail`,
  der geteilte Aktienseiten-Renderer aus `discover/ui/detail.js`, den die
  Ansicht selbst aufruft. `V.Detail` flach auf `VUDiscover` zu legen, hätte ihn
  überschrieben. Unter `VUDiscover.Views` gibt es keine Kollision.
- Änderung: je eine Zeile in 4 Dateien, gleiche Zeilenzahl (Currency Debt
  Register bleibt byte-gleich).

## 5. Bewusst erhaltene v2-Namen

| Name | Kopplung | Grund |
|---|---|---|
| `.v2-*`, `.dv2-*` CSS-Klassen, `body.dv2` | ≈2.100 Treffer in 3 Stylesheets + 3 Skripten; Kaskade über `body.dv2 …`-Präfixe; 4 QA-Skripte greifen darauf zu | breit gekoppelt, keine sichtbare Wirkung; Umbenennung wäre ein Massen-Refactor mit Regressionsrisiko ohne Nutzen |
| `#v2-shell`, `#v2-main`, `.v2-skip` | Router, Skip-Link, Fokusführung, Suche (`inert`) | Laufzeit-IDs mit Fokus-/A11y-Logik |
| `window.__dv2Vitals` | nur in `scripts/discover/browser-qa.mjs` (Init-Script + Auswertung) | testintern, nicht ausgeliefert |

## 6. Workflow-/Test-Namensänderungen

Keine nötig: alle aktiven Workflow-, Job- und Check-Namen sind bereits
versionsfrei. Geändert ist nur der Kopfkommentar von `verify-currency-ui.mjs`
(UI8), die Prüfaussage ist unverändert.

## 7. Dead-Code-Nachweise

- Discover-1-Runtime: 0 (siehe 3.).
- Browser-geladene Engines ohne Browser-Verbraucher (`scoring`, `recommendation`,
  `realtime-source`, `technical-intelligence`, `high52w`): **keine
  Discover-1-Reste** — beide früheren Seiten luden sie identisch; sie sind
  geteilte Engines für Build und Tests. Das Entfernen der `<script>`-Tags wäre
  eine Laufzeitänderung außerhalb dieses Auftrags → dokumentiert, nicht geändert.
- Discover-1-CSS in `discover.css`: siehe Tabelle, nicht beweisbar tot.

## 8. Dateien geändert

| Datei | Grund |
|---|---|
| `discover/app.js`, `home.js`, `detail.js`, `themes.js` | Namespace `VUDiscoverV2` → `VUDiscover.Views` (je 1 Zeile) |
| `discover/app.css`, `discover/detail.css` | veraltete Versionskommentare (4 Kommentarzeilen) |
| `scripts/quality/verify-currency-ui.mjs` | veralteter Kopfkommentar zu UI8 |
| `scripts/discover/visual-parity.mjs` | Parity-Routen um Suche, Fundamentals und eine farbige Themenwelt erweitert (Anforderung §14) |
| `docs/VU_DISCOVER_ARCHITECTURE.md` | aktuelle Architekturdefinition vorangestellt |
| `docs/VU_DISCOVER_NAMESPACE_CLEANUP.md` | dieser Bericht |

## 9. Bewusst nicht geändert

`quant/**` (inkl. FX-Core-Kommentare), `worker/**`, alle Market-Data-,
Freshness-, Realtime-, SEC- und Provider-Dateien, `discover/data/**`,
`discover/engines/**`, `discover/ui/**`, `discover/discover.css`,
`discover-v2/index.html`, alle Workflows, `docs/discover-v2/**` und übrige
historische Berichte.

## 10.–13. Nachweise

| Gate | Ergebnis |
|---|---|
| Screenshot-Parity: 11 Ansichten (Start, Welten, Themenwelt mit/ohne Reihe, farbige Themenwelt Elektromobilität, Sammlung, Entdecken-Feed, Aktienseite, Fundamentals, Suche, Daten) × 320/390/1440 × hell/dunkel = 66 | **66/66 pixelgleich** (Baseline zweimal aufgenommen: deterministisch) |
| Chromium, kanonische Browser-QA (186 Checks) | 186/186 |
| Currency UI1–UI8 | PASS |
| Delivery-Check (jede Anfrage, 404) | 18/18, 0 fehlerhafte Anfragen |
| Live-/Intraday-QA | 33/33 |
| Deep Links `/discover-v2/` + `''`, `#/`, `#/welten`, `#/thema/…`, `#/c/…`, `#/einzeln/…`, `#/s/…`, `#/daten` | 8/8 → `/discover/` mit identischem Hash, 0 Konsolenfehler, 0 px Überlauf; `window.VUDiscoverV2` undefined, `VUDiscover.Views` = Themes/Home/Detail |
| CI-Nachweis `discover-frontend-ci.yml` auf Commit `04d0a80d0` (Lauf 35997315131, Pages-Release-Build) | Consolidation-Gate + Contract-Tests PASS; Chromium 186/186; **WebKit 33/33** |

## 14. Data-Core-Freeze-Proof

`git diff --name-only origin/main` enthält keine Datei unter `quant/`,
`worker/`, `scripts/market/`, `providers/`, `discover/data/`, `discover/engines/`.
Currency Debt Register: Neuerzeugung byte-gleich zum eingecheckten Stand.
`node --test discover/tests quant/tests`: 1644/1644.

## 15. Verbleibende technische Schulden

1. `.v2-*`/`dv2`-Klassen und `#v2-shell` (bewusst, s. 5.).
2. Discover-1-Regeln in `discover/discover.css` — Entfernung nur mit
   Coverage-Messung im Browser über alle Ansichten.
3. Fünf browser-geladene Engines ohne Browser-Verbraucher (s. 7.).
4. `moduleVersion` „discover-4.0.0“ auf *Daten & Quellen* — Frage an den
   Datenvertrag, nicht an das Frontend.
5. FX-Core-Kommentare nennen historische Discover-Pfade — beim nächsten
   Eingriff in den Currency Core mitnehmen.
