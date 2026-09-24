# Vision Universe® — ONE DISCOVER Consolidation

Stand: 24.09.2026 · Branch `claude/discover-consolidation-migration-rq4hq5`
Ausgangspunkt: `main` @ `c8d24a0bd` (PR #193, nach PR #190 / `6e31941`)

## Ergebnis

| vorher | nachher |
|---|---|
| `/discover/` = Discover 1 (Legacy, eigenes `app.js`) | `/discover/` = das bisherige Discover 2.1 — **das einzige Discover** |
| `/discover-v2/` = Discover 2.1 (Preview, `noindex`) | `/discover-v2/` = Weiterleitungs-Alias auf `/discover/` (Hash-Route bleibt erhalten) |
| Navigation: „Discover“ + „Discover 2.0“ | Navigation: nur „Discover“ |
| Wortmarke „Discover 2.1“, Link „Discover 1.0 ↗“ | Wortmarke „Discover“, kein Versionslink |

Richtung der Migration: **aktuelles Discover 2 → kanonisches Discover.** Keine
Datei des Discover-2-Frontends wurde an Discover 1 angepasst; Discover 1 wurde
abgelöst.

## 1. Current Discover Frontend Baseline (Freeze vor der Migration)

Frontend-Dateien von `/discover-v2/` @ `c8d24a0bd` (jetzt unter `/discover/`, Inhalt unverändert außer den unten genannten Namens-/Pfadstellen):

| Datei | Zeilen | Zweck |
|---|---|---|
| `app.js` | 233 | Router, Leiste, Dock-Navigation, Suche, Theme, Currency-Switch |
| `home.js` / `home.css` | 350 / 208 | Home, Hero-Bild, Themenwelten-Reihe, kompakte Kachel-Reihen, Swipe |
| `detail.js` / `detail.css` | 478 / 399 | Aktienseite (komponiert `discover/ui/detail*.js`) |
| `themes.js` | 77 | Katalog der 40 Themenwelten, Fotos `assets/themen/NN-slug.webp` |
| `app.css` | 189 | Shell, Dock, Welten, Responsive |
| `index.html` | 90 | Ladereihenfolge Quant-Shell → Realtime → FX-Core → Discover-Engines → UI |

Bildassets: `assets/themen/**` (40 Themenfotos + Hero) — unverändert.

Screenshots: `docs/screenshots/discover-consolidation/before/` (8 Routen × 320/390/1440 × hell/dunkel wurden aufgenommen, 24 davon eingecheckt). Die Aufnahme ist deterministisch (zwei Läufe: 48/48 pixelgleich).

Browser-QA-Baseline: `scripts/discover-v2/browser-qa.mjs` gegen `/discover-v2/` = **186/186 PASS**, 97 Screenshots.

## 2. Feature-Inventar (Feature-Baseline)

Nachgewiesen durch die kanonische Browser-QA (186 Checks) und die Parity-Aufnahmen:

Home · Hero (Auge, 16:9) · Themenwelten-Reihe (40 Welten, Fotos, Platzhalter „In Vorbereitung“) · Welten-Übersicht (`#/welten`) · Themenwelt-Detail (`#/thema/<slug>`) · Aktienwelten/Sammlungen (`#/c/US_REAL/<row>`) · Entdecken-Feed mit Swipe und Fortsetzen (`#/einzeln/US_REAL`) · Suche (Overlay, `/`-Taste, Fokusfalle) · Premium-Glass-Dock-Navigation · kompakte Aktienkarten · Rankings mit Begründung · Fundamental Stories · Aktienseite (`#/s/US_REAL/<SYM>`, Instrument-Directory-Fallback für Titel außerhalb der Discover-Fläche) · Charts (1T/1W/1M/6M/1J/5J/Max, nur Linie) · Intraday/Freshness/Source State · Currency EUR|USD (zentraler Contract) · Daten & Quellen (`#/daten`) · Hell/Dunkel/System · 320/390/1440 · Barrierefreiheit (axe, WCAG 2.1 AA ohne critical/serious).

Hash-Routen des alten Discover 1 bleiben gültig: `#/s/…`, `#/c/…`, `#/einzeln/…`, `#/daten`. `#/u/<id>` (Universumswechsel) fällt auf Home zurück — Discover 2 kennt nur `US_REAL`.

## 3. Dependency Audit und Klassifikation

Discover 2 war eine dünne Ansicht über dem Discover-Verzeichnis: sein `index.html` lud **alle** Engines, **alle** UI-Module, `discover.css` und die Daten aus `/discover/`. Klassifikation:

| Pfad | Klasse | Entscheidung |
|---|---|---|
| `discover/index.html` (alt) | A LEGACY_FRONTEND_ONLY | ersetzt durch das Discover-2-`index.html` |
| `discover/app.js` (alt, 984 Z.) | A LEGACY_FRONTEND_ONLY | entfernt — exportiert nichts, was Discover 2 nutzt; ersetzt durch Discover-2-`app.js` |
| `discover/ui/hero.js` | A LEGACY_FRONTEND_ONLY | entfernt — `D.Hero` hatte als einzigen Verbraucher das alte `app.js` |
| `discover/ui/*.js` (übrige 13) | B SHARED_PRODUCT_COMPONENT | bleiben — Karten, Feed, Suche, Aktienseite, Live-Hub, Microchart, Artwork … |
| `discover/discover.css` | E SHARED_RUNTIME | bleibt — Discover 2 lädt es als Basis-Stylesheet |
| `discover/engines/*.js` | D SHARED_ENGINE | bleiben unverändert |
| `discover/config/*`, `discover/methodology/*` | C SHARED_DATA_CONTRACT | bleiben unverändert |
| `discover/data/**` | G GENERATED_ARTIFACT | unverändert (Erzeuger: `scripts/discover/build-discover-data.mjs`) |
| `discover/tests/*.test.mjs` | F TEST_ONLY (Engine-/Contract-Tests) | bleiben; `scale.test.mjs` prüft statt `hero.js` jetzt `app.js` |
| `scripts/discover/browser-qa.mjs` (V4), `browser-qa-v3.mjs`, `browser-qa-v41.mjs`, `screenshots-acceptance.mjs` | F TEST_ONLY, Discover-1-DOM | entfernt — Nachweis: gegen das alte `/discover/` grün (V3 0 Fehler, V4.1 30/30), gegen das kanonische Discover rot, weil sie Selektoren des abgelösten DOM prüfen (`#d-root`, `.dx-rail`, `.dx-fnav`, …). Ersetzt durch die kanonische Browser-QA |
| `scripts/discover-v2/browser-qa.mjs` | F | → `scripts/discover/browser-qa.mjs` (Adresse `/discover/`, Nav-Check „genau ein Discover“, `indexable` statt `noindex`) |
| `scripts/discover-v2/contract-qa.mjs` | F | → `scripts/discover/contract-qa.mjs`; B5 prüft jetzt „ein Discover, keine Versionsnamen, Alias leitet nur weiter“ |
| `scripts/discover-v2/regression-gate.mjs` | F | ersetzt durch `scripts/discover/consolidation-gate.mjs` (die Preview-Isolation hat keinen Gegenstand mehr) |
| `scripts/discover/delivery-check.mjs`, `scripts/universe/browser-qa.mjs`, `scripts/discover/browser-qa-live.mjs`, `scripts/quality/verify-currency-ui.mjs` | F, Daten-Wahrheit | migriert: Selektoren des Discover-1-DOM um die kanonischen ergänzt (`.v2-stock`, `.v2-track`, `.v2-hero-track`, `.v2-message`), UI8 prüft den Alias; die Prüfaussagen selbst sind unverändert |
| `scripts/discover/browser-qa-realtime.mjs` | F, Daten-Wahrheit | unverändert — alle Selektoren liegen auf der Aktienseite in geteilten Modulen und existieren im kanonischen Discover (vorher/nachher geprüft) |
| `quant/**`, `worker/**`, Realtime, FX-Core | — | **nicht verändert** |

Keine Bridge, kein Worker, keine API, keine neue Pipeline.

## 4. Änderungen am Discover-2-Frontend (nur Naming/Pfade)

- `index.html`: Titel/Beschreibung ohne „2.1“, `noindex` entfernt (kanonische Seite), Pfade `/discover-v2/*` → `/discover/*`, `hero.js` nicht mehr geladen.
- `app.js`: Wortmarke, Dokumenttitel und Fehlermeldungen „Discover“ statt „Discover 2.1“; Link „Discover 1.0 ↗“ und Fußzeilenlink „Discover 1.0 öffnen“ entfernt; `labelCurrentNavigation()` entfällt (benannte den Nav-Eintrag „Discover 2.0“ um).
- `app.css`: eine Regel. Der entfernte Vergleichslink trug `margin-left:auto` und schob Währung/Darstellung nach rechts; ab 1091 px übernimmt das jetzt das erste Element nach der Wortmarke. Ohne diese Regel wäre die Desktop-Leiste verrutscht (im Parity-Gate sichtbar geworden und behoben).
- `detail.js`: nur Kommentar.
- `assets/site-navigation.js`: Eintrag „Discover 2.0“ entfernt.

## 5. Legacy-URL

GitHub Pages hat keine Server-Weiterleitung. `/discover-v2/index.html` ist ein
Alias ohne eigene Oberfläche: `location.replace("/discover/"+search+hash)`, dazu
`meta refresh`, `rel=canonical`, `noindex`. Er lädt nur die gemeinsame
Navigation; das Consolidation-Gate verbietet jedes weitere Skript dort.

## 6. Gates

| Gate | vorher | nachher |
|---|---|---|
| Visual Parity (48 Aufnahmen, 8 Routen × 3 Breiten × 2 Schemata) | Referenz | 8 pixelgleich; 40 nur im Kopfband (Desktop Zeilen 25–126: Nav-Eintrag, Wortmarke, Versionslink; Mobil Zeilen 88–110: Wortmarke). Inhalt, Karten, Bilder, Charts, Dock identisch. `docs/screenshots/discover-consolidation/parity.json` |
| Kanonische Browser-QA Chromium (186 Checks, inkl. axe, CLS, DOM-Budget, 320/390/1440, hell/dunkel) | 186/186 | 186/186 |
| Currency-UI-Nachweis UI1–UI8 | — | PASS (EUR Vorgabe, nur Geldbeträge ändern sich, 5J-Rendite EUR≠USD, MAX-Beginn mit Hinweis, Alias → gleicher Vertrag) |
| Delivery-Check (Pages-strenger Server, jede Anfrage) | — | 18/18, 0 fehlerhafte eigene Anfragen (keine 404 auf Themenbilder) |
| Live-/Intraday-QA (33 Prüfpunkte) | altes `/discover/` 33/33; `/discover-v2/` 31/33 (zwei Checks zählten Discover-1-Klassen) | 33/33 |
| Universe-/Such-QA | 14 ok / 5 Befunde | 14 ok / 5 Befunde (dieselben 5, siehe offene Punkte) |
| `node --test discover/tests/*.test.mjs` | 233 | 233 PASS |
| `node --test quant/tests/*.test.mjs` | — | 1411 PASS |
| Consolidation-Gate, Contract-QA, Consumer-Clean, Source-State-Coverage | — | PASS |

WebKit: der CI-Workflow `discover-frontend-ci.yml` fährt dieselbe Browser-QA zusätzlich mit WebKit; lokal stand in dieser Umgebung nur Chromium zur Verfügung.

## 7. CI

- `discover-v2-ci.yml` → `discover-frontend-ci.yml`: gleiche Browser-/A11y-/Performance-Gates, jetzt gegen `/discover/`, zusätzlich Trigger auf `discover/**` und `assets/themen/**`.
- `discover-live-smoke.yml`: V3/V4/V4.1 ersetzt durch die kanonische Browser-QA.
- `currency-production-proof.yml`: zählt die FX-Module nur noch auf `/discover/`.
- `discover-ci.yml`: der Guard „Discover verändert keine bestehende Engine“ nimmt genau drei Currency-Nachweisdateien aus, die Discover-Pfade namentlich führen (Testmatrix, Formatierungs-Grundlinie, Debt Register). `quant/engines/fx` bleibt geschützt.
- Currency-Nachweise: Pfade `discover-v2/{home,detail}.js` → `discover/{home,detail}.js`; Debt Register mit dem eigenen Generator neu erzeugt (Summe unverändert 33, Klasse A offen 0).

## 8. Offene Punkte / spätere Cleanups (bewusst nicht in diesem Auftrag)

1. **Interne Bezeichner mit „v2“**: CSS-Klassen `v2-*`/`dv2-*`, `body.dv2`, `#v2-shell`, globales `VUDiscoverV2`. Sie sind nicht sichtbar; eine Umbenennung wäre ein reiner Refactor mit Regressionsrisiko für ~800 Zeilen CSS. Kandidat für einen späteren Cleanup.
2. **`discover/discover.css`** enthält noch Regeln für das abgelöste Discover-1-DOM (z. B. `.dx-fnav`, `.dx-hero*`). Die Datei ist geteilte Basis für Karten, Feed und Aktienseite; ungenutzte Regeln herauszulösen braucht eine eigene Coverage-Messung.
3. **Universe-/Such-QA**: 5 Befunde bestehen identisch schon am alten `/discover/` (Suchindex 826 KB in einem Abruf, Ring-Angabe, Stammdaten-/„nicht vorhanden“-Zeilen auf der Instrument-Seite, Chartfläche ohne Kursreihe). Keine Regression dieser Migration; betrifft Search/Company-Master-Verträge.
4. **Kommentare außerhalb von Discover** nennen noch `discover-v2` (`quant/engines/fx/money-format.js`, `scripts/quality/currency-debt-patterns.mjs` Suchwurzel) — Currency Core bleibt laut Auftrag unangetastet.
5. **CI-Kopplung** (für den Infrastructure Cleanup): der Pfad-Guard in `discover-ci.yml` arbeitet mit einer Ausschlussliste; `currency-fx-verify.yml` läuft ohne Pfadfilter auf jedem PR. Beides funktioniert, ist aber grob.
6. Historische Dokumentation (`docs/discover-v2/**`, `docs/VU_DISCOVER_V*.md`) behält ihre Versionsnamen.

## 9. Rollback

Ein einziger Revert des Merge-Commits stellt den vorherigen Zustand vollständig her (Discover 1 unter `/discover/`, Discover 2.1 unter `/discover-v2/`). Es gibt keine Daten- oder Schemaänderung; `discover/data/**` ist unberührt.

## 10. Reproduzieren

```bash
python3 -m http.server 8765 --bind 127.0.0.1 &
node scripts/discover/consolidation-gate.mjs
node scripts/discover/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/discover-qa
node scripts/discover/visual-parity.mjs capture --path /discover/ --out /tmp/after
node scripts/discover/visual-parity.mjs compare --before <baseline> --after /tmp/after
```
