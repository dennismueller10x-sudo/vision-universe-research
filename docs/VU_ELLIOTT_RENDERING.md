# VU Elliott Rendering

**Module:** `engines/technical/annotations.js` (Schema `annotation-1.0.0`), `ui/technical-chart.js` (Renderer), `technical/app.js` (Seite)

## 1. Trennung Engine ↔ Renderer

Engines erzeugen `ChartAnnotation`-Objekte: `annotationId, type, layers[], startTime, endTime,
startPrice, endPrice, label, status, method, degree, scenarioId, evidenceRef, confidence,
semanticStyle, zOrder, meta`. Keine Pixel, kein SVG, keine Library-Befehle (Test A1). Der
Renderer interpretiert das Schema; ein Wechsel der Chart-Library berührt keine Engine.

## 2. Zeit, nicht Pixel

Positionen sind Timestamps. Der Renderer bildet Zeit auf Bar-Positionen ab; Zeitpunkte nach
der letzten Bar (Projektionen) werden über Werktags-Fortschreibung in den reservierten
Zukunftsbereich rechts des **NOW_DIVIDER** gelegt. Labels hängen an Pivot-Zeitpunkten und
können nicht „schweben“ (Test A2).

## 3. Drei visuelle Zustände (§37)

| Status | Elliott | Struktur/Szenario | Stil |
|---|---|---|---|
| CONFIRMED | historische Welle, Label an Pivot | Swing-Linie, HH/HL-Labels | durchgezogen, Ink |
| DEVELOPING | laufende Welle | Swing zum Developing-Extrem | Blue, kräftiger |
| PROJECTED | Projektionspfad, Projection Zones, Count-Invalidation | Entry/Target-Zonen, Projektionspfad, Invalidation | gestrichelt/transparent, Purple/Green/Red |

Nichts rechts des Dividers sieht wie Historie aus. Die Legende benennt die drei Zustände.

## 4. Layer

`AUTO` zeigt nur, was das Primary Scenario erklärt (Swing-Linie, letzte Struktur-Labels, SMA
50/200, nächste S/R-Zonen, Entry/Target/Invalidation, Projektionspfad). `STRUCTURE`, `TREND`,
`MOMENTUM`, `SUPPORT_RESISTANCE`, `FIBONACCI`, `ELLIOTT` sind Toggles. `ELLIOTT` zeigt standardmäßig
nur den Primary Count; der Alternative Count (`ELLIOTT_ALT`) und die alternative Entry Zone
(`ALTERNATIVE`) kommen per Toggle „Alternative“.

## 5. Elliott-spezifisch

* `WAVE_SEGMENT` je Welle (Status wie oben), `WAVE_LABEL` am Wellenende (Pivot), `?`-Suffix
  für projizierte Labels.
* `PROJECTION_ZONE` als Fläche (Purple), `INVALIDATION_LEVEL` als gestrichelte rote Linie mit
  Regel-ID im `method`.
* Label-Kollisionen werden im Renderer vertikal aufgelöst; auf 390 px scrollt der Chart
  horizontal (min-width), Layer-Toggles sind ≥ 40 px hoch.

## 6. Visual Regression

`Annotations.positionHash(doc)` hasht Typ, Zeit, Preis, Status, Label aller Annotationen. Test A3
prüft Stabilität und Änderung bei Datenrevision. Screenshots (Desktop 1280 px, Mobile 390 px;
Layer AUTO, STRUCTURE, ELLIOTT) wurden im Release-Audit mit Playwright/Chromium erzeugt (siehe
`VU_TECHNICAL_PHASE1_REPORT.md`).

## 7. Golden Visual Requirement (NVDA 5Y)

Historische Kursstruktur, historische Wave Map (Labels an echten Pivots), aktuelle Welle,
Now-Divider, Projektion, Entry Zone, Invalidation, Target Zones — Vergangenheit und Zukunft
eindeutig unterscheidbar. Umgesetzt in `quant/technical/?symbol=NVDA` (Layer ELLIOTT).
