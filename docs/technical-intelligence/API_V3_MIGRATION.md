# Technical Intelligence API: Migration v2 → v3

**Pfad:** `/quant/data/technical-intelligence/v3/` (vorher `/v2/`). **Schema:** `vu-ti-api-3.0.0`.
Einziger Leser ist `quant/api/technical-intelligence-workspace.js` (Whitelist); er wurde im selben Commit umgestellt. v2 wird mit dem ersten v3-Build entfernt — es gibt keine externen Abnehmer (KI-Werkzeuge `ti/ai-tools.js` lesen über denselben Workspace).

## Unverändert (rückwärtskompatibel)

Alle v2-Felder je Titel bleiben: `outlook`, `regime`, `scenarios`, `confidence`, `confluence`, `signature`, `evidence`, `timeframes`, `alerts`, `pro.*`, `history`, `explain`, `chart`.

## Neu je Titel

| Feld | Inhalt | Zweck |
|---|---|---|
| `overlays.zones[]` | `{scenario, kind: ENTRY\|DEEPER\|TARGET\|RANGE_LOW\|RANGE_HIGH, order?, low, high}` | alles, was als Band gezeichnet wird |
| `overlays.invalidations[]` | `{scenario, price, direction, basis: "CLOSE"}` | Ungültig-Linie je Szenario |
| `overlays.projectedPaths[]` | `{scenario, direction, points: [{step, price, half}]}` | Szenario-Pfad ohne Datum; `half` = halbe Korridorbreite (Preis), wächst mit `step` |
| `overlays.waves` | `{primary[], alternative[], consumerVisible, degree}` | Wellenmarken; `consumerVisible=false` bei Enthaltung |
| `clarity` | `{level: CLEAR\|MODERATE\|AMBIGUOUS, text, note}` | Ebene „Was der Chart zeigt" (keine Wahrscheinlichkeit) |
| `evidenceBadge` | `{level: NOT_ESTABLISHED\|EXPERIMENTAL\|NO_DATA, label, text, n?, hit?, base?}` | Ebene „Was die Historie nahelegt" |
| `pro.elliott.applicability` | `{score, level, abstain, components, signalToNoise, reasons}` | Elliott anwendbar? Enthaltung |
| `pro.elliott.primary.countQuality` | `{score, level, components, note}` | fachliche Güte der Zählung |
| `pro.elliott.primary.detection` | Wellenende, früheste/tatsächliche Bestätigung, vermeidbarer Verzug | Erkennungsverzug |
| `pro.elliottTransparency` | Status, Grad, Count Quality, Anwendbarkeit, Verzug, Regelverletzungen, Richtlinien, höherer Grad, Kandidatenbaum, Neuzuordnungs-Risiko | Profi-Panel „So wurde gerechnet" |
| `replay` (nur Indexmitglieder und Tagesreferenz) | `{every, unit, steps: [{d, c, o, st, cl, sc, ew}]}` | Zeitreise: Analyse an den letzten 26 Schritten mit damaligen Daten |

## Neu im Index (`index.json.gz`)

`clarity`, `evidence`, `elliottApplicable`, `countQuality`, `relabelRisk`, `higherAligned` — Grundlage der Filter auf `/chartlagen`.

## Neue Dateien

`method-evidence.json` — Evidenz-Status je Methode aus der Validierungsstudie (`quant/methodology/technical-method-evidence.json`).

## Verhaltensänderung

Die Elliott-Hauptzählung nutzt **Persistenz** (Engine 2.2): Der Build rechnet die letzten 52 Bars sequenziell und übergibt den Zustand des Vortags. Ergebnis an t hängt damit nur von Bars ≤ t ab (kausal), ist aber nicht mehr identisch mit einem zustandslosen `TI.analyzeAt(P, t)`. Die Drift-Prüfung (`verify-technical-intelligence.mjs`) nutzt dieselbe Funktion `analyzeProduct()`.

## Mission III — Versionsfelder und Elliott 3.2

* Jeder Titel trägt `versions`: `{ api, analysis, resultSchema, elliott, ruleSet, elliottStatus: "EXPERIMENTAL_STRUCTURE_MODEL", dataAsOf }`.
* `meta.json` trägt `elliott: { engine: "v3", status, confluenceWeight: 0, report }`.
* Elliott-Ausgabe 3.2: `applicability.components` enthält zusätzlich `hierarchyConflict` und `proportion`; laufende Zählungen sind höchstens `LOW`; `clarityLevel` ist bei Grad-/Etikett-Mehrdeutigkeit `MODERATE`.
* Abwärtskompatibel: keine Felder entfernt; Konsumenten, die `pro.elliott.engineVersion` lesen, sehen `elliott-3.2.0` statt `elliott-2.2.x`.
