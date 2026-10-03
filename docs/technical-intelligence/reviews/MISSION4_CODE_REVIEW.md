# Mission IV – unabhängiges Code-Review

Umfang: `git diff 63392c882~1..HEAD` (ohne generierte Daten), Stand e298eed22. Tests: `quant/tests/ti-*` + `screener/tests/*` → 103 bestanden, **1 fehlgeschlagen** (M4-4), 1 übersprungen; `workers/vu-ask` + `ask` → 41/41 bestanden.

## BLOCKER

**B1 – Veröffentlichte Daten stammen noch von der alten Engine (3.2.1 / ti-scenario-1.0.0).**
Der Code (elliott-3.2.2, ti-scenario-1.1.0) und die Methodikseite (`quant/methodology/index.html:169`, „elliott-3.2.2“) sind neu, `quant/data/technical-intelligence/v3/*` wurde aber nicht neu gebaut. Nutzer sehen weiterhin unmögliche Kursniveaus (z. B. ACON: Ziel 1 −2.695, Bestätigung 949,73 bei Kurs 2,44; insgesamt 305 Titel mit Niveau ≤ 0 im Index), und abgeschlossene WXY tragen noch Anwendbarkeit HOCH (ACON). Das Chartbild liest die Shards direkt; nur VU Ask filtert zur Laufzeit. Der Screener-Join übernimmt denselben veralteten Stand.
Repro: `node --test quant/tests/ti-mission4.test.mjs` → M4-4 schlägt fehl (`'elliott-3.2.1' !== 'elliott-3.2.2'`), außerdem:
```
node -e 'const z=require("zlib"),f=require("fs");const j=JSON.parse(z.gunzipSync(f.readFileSync("quant/data/technical-intelligence/v3/shards/AC.json.gz")));console.log(j.instruments.ACON.versions.elliott,j.instruments.ACON.scenarios[0].targets[0].zoneLow)'
# elliott-3.2.1 -2695.2
```
Fix: `build-technical-intelligence.mjs` neu laufen lassen (der neue Methodenschlüssel unterdrückt dabei die Migrationsalarme korrekt: der alte Index hat keinen `scenario`-Eintrag), danach den Screener-Universe-Build.

## MINOR

**M1 – Neu aufgenommene oder wieder auftauchende Titel erzeugen Alarme** (`quant/engines/technical/ti/alerts.js:59-63`). Ohne vorherige Zeile (`p0` fehlt) läuft `diff(null, …)` und meldet `ENTRY_ZONE_REACHED`, obwohl sich kein Kurs bewegt hat. Das passiert bei Universumserweiterungen oder wenn ein Titel in einem Lauf fehlte. Repro:
```
node -e 'const A=require("./quant/engines/technical/ti/alerts.js");const s=(i,f)=>({scenarioId:i,direction:"BULLISH",confidence:"LOW",levels:{},flags:f});console.log(A.diffRun({methodologyKey:"k",rows:[{t:"X",asOf:"2026-09-25",alerts:s("a",{})}]},{methodologyKey:"k",rows:[{t:"NEW",asOf:"2026-09-01",alerts:s("b",{inEntryZone:true})}]}).events)'
# [ { type: 'ENTRY_ZONE_REACHED', symbol: 'NEW', ... } ]
```
Vorschlag: `if (!p0) return;` (Titel ohne Vergleichszeile = Ausgangszustand).

**M2 – Methodenschlüssel deckt nicht alle Module ab** (`scripts/technical/build-technical-intelligence.mjs:289`). Enthalten sind Bundle-, API-, Elliott-, Regel- und Szenario-Version. Nicht enthalten sind `ti-levels`, `ti-dow-trend`, `ti-chart-patterns`, `ti-momentum-volatility`, `ti-wyckoff` und die Evidenztabellen (die `confidence` steuern). Ändert sich eines davon ohne Anhebung von `BUNDLE_VERSION`, entstehen bei neuem Datenstand Migrationsartefakte (`CONFIDENCE_CHANGED`, `SCENARIO_CHANGED`). Repro: `node -e 'console.log(require("./quant/engines/technical/ti/levels.js").VERSION)'`; der Wert fehlt im Schlüssel.

**M3 – Screener-Veraltung nur relativ** (`scripts/screener/build-universe.mjs:139`). Der Grenzwert bezieht sich auf das jüngste `asOf` im Index, nicht auf das Build-Datum. Ein insgesamt alter Index gilt deshalb als frisch:
```
node --input-type=module -e 'import {technicalIntelligenceColumns as t} from "./scripts/screener/build-universe.mjs";const r=t({rows:[{t:"OLD",asOf:"2025-01-03",outlook:"BULLISH",structure:"UPTREND_ADVANCING",elliottApplicable:"LOW"}]});console.log(r.byTicker.get("OLD"),r.meta.stale)'
# { tiOut: 'BULLISH', … } 0
```
Gleiches gilt für `stale` in `ai-tools.js situation()`.

**M4 – Discover-Link ohne Symbol** (`discover/ui/detail.js:1740`). Aus `detail.symbol` = "" wird `#/aktie//chartbild`. Der Router entfernt leere Segmente, sodass der Ticker zu „CHARTBILD“ wird und die Prüfung `^[A-Z0-9.-]{1,12}$` besteht. Repro: `node -e 'const p="/aktie//chartbild".split("/").filter(Boolean);console.log(p[1].toUpperCase())'`. Vorschlag: den Link nur bei gültigem Symbol rendern.

**M5 – Beschriftung „Wochenchart“** in der Screener-Quelle, in VU Ask (`ask/app.js` chartbildBlock) und im Merklisten-Text. Der Index enthält aber 5 Zeilen mit `tf: "1D"`.

## Geprüft, ohne Befund
- scenario.js 1.1.0: A/B ≤ 0 (kein Measured Move), Symmetrie bull/bear, leere Ziele (`rr` → `r4(null)` = null), `entry/invalidation ≤ 0` → kein Szenario, Abschnitts-Merge der Konfiguration. Alle Verbraucher (engine.js:155-159, explain.js:65/84, pages.js:67, page-chartbild.js:89, Index-Zeile) prüfen `targets[0]` und `confirmation` auf null.
- elliott 3.2.2: Die Obergrenze für WXY wirkt nach `developingCap` und nur auf Nicht-LOW, also nur auf abgeschlossene Muster; `abstain` bleibt konsistent (`level === "LOW"`); die `typePrior`-Reihenfolge ist korrekt.
- Merkliste: unterdrückt bei `previousIndex !== true` oder `suppressed !== null` (also auch beim heutigen alerts.json ohne Feld). Die Route `technik` mappt `elliott=1` → `ansicht=profi`; die Weiterleitung in `quant/technical/index.html` prüft das Symbol.
- VU Ask: `chartbild` nur bei `kind === "stock"`; das Modell sieht keine TI-Werte (keine Prompt-Injektion); unplausible Niveaus werden zurückgehalten und benannt; keine Trefferquoten.
- Workbench: `cases-blind.json` enthält nur id/kind/timeframe/cutoff/bars/chart; das SHA-256-Commitment stimmt mit `cases-sealed.json` überein; die Auswertung zählt nur die letzte blinde Version. Hinweis: Blindheit ist clientseitig. Wer unter einem zweiten Code aufdeckt, wird nur im Audit-Log sichtbar, nicht in der Auswertung.
- `product-services.js goldenDaily`: Hinweis: Schlägt das Laden von `summary.json` einmal fehl, bleibt `goldenSet` leer für die gesamte Sitzung (kein erneuter Versuch).
