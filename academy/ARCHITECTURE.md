# VISION UNIVERSE® ACADEMY — Architektur V1 (Phase 1: Foundation + Follow the Money)

## Grundprinzip

Die Academy ist kein Standalone-Projekt, sondern ein weiteres eigenstaendiges
Produktverzeichnis nach demselben Muster wie `macro/`, `dashboard/` oder
`hedgefonds/`: statisches HTML/CSS/JS, keine Build-Pipeline, keine
Frameworks, Auslieferung ueber GitHub Pages. `/assets/site-navigation.js`
und `.css` werden unveraendert weiterverwendet (`Academy` wurde dort als
neuer Menuepunkt ergaenzt).

Anders als die uebrigen Produkte ist die Academy als **Experience System**
statt als Einzelseite gebaut: wiederverwendbare Engines (Berechnung),
eine wiederverwendbare Experience Shell (UI) und datengetriebene Registries
(Concepts/Worlds/Experiences), damit neue Experiences spaeter ergaenzt
werden koennen, ohne Shell oder Engines anzufassen.

## Vier Ebenen (analog zu `macro/ARCHITECTURE.md`)

1. **UI / Shell** (`academy/shell/experience-shell.css`, `.js`) — Hero,
   Story-Sections, Sticky-Visualisierung, Controls (Slider+Stepper,
   Touch-first), Live-Metrics, Evidence-Tags, Waterfall-/Bridge-Chart,
   Methodology-/Sources-Panel, Scrollytelling-Helper. Kennt keine
   Berechnungslogik und keine experience-spezifischen Texte.
2. **Engines** (`academy/engines/*.js`) — reine Berechnungsfunktionen ohne
   DOM-Abhaengigkeit (lauffaehig in Browser und Node, siehe Tests). Phase 1
   enthaelt die `financial-model-engine.js` (Revenue → Gross Profit →
   Operating Income → Net Income → Operating Cash Flow → Free Cash Flow).
   Spaetere Experiences (ROIC, DCF, Earnings Quality) sollen dieselbe Engine
   erweitern statt eine neue zu bauen.
3. **Data / Registries** (`academy/data/*.json`) — `concepts.json`
   (Concept Registry: eine Definition pro Kennzahl), `worlds.json`
   (Academy Master Map V2, 11 Worlds aus der Deep-Research-Audit-Datei),
   `experiences.json` (Experience Registry — neue Experience = neuer
   Eintrag, keine Code-Aenderung an der Landingpage), `questions.json`
   (kuratierte redaktionelle Einstiegsfragen).
4. **Experiences** (`academy/experiences/<slug>/`) — je Experience
   `index.html` + `app.js` (Glue-Code: State, Wiring, Storyline-Rendering)
   + `data.json` (Acts/Copy/Methodology/Sources/Controls-Konfiguration,
   redaktionell pflegbar ohne Code-Aenderung) + optional `styles.css`
   fuer seitenspezifische Ergaenzungen.

`academy/app.js` + `academy/index.html` sind die Landingpage-Ebene: sie
liest ausschliesslich die Registries in `academy/data/` und rendert
Fragen-Grid, Featured Pilot und Worlds-Grid. Neue Worlds/Experiences dort
zu ergaenzen erfordert keine Aenderung an `index.html` oder `app.js`.

## Ordner

```
academy/
  index.html            Landingpage ("Explore how investing works.")
  styles.css            Landingpage-spezifische Layouts (Question-Grid, Worlds-Grid, Featured Pilot)
  app.js                Laedt data/*.json, rendert die drei Grids
  ARCHITECTURE.md        dieses Dokument
  shell/
    experience-shell.css  geteilte visuelle Sprache aller Experiences
    experience-shell.js   geteilte UI-Bausteine (Controls, Charts, Evidence-Tags, Scrollytelling)
  engines/
    financial-model-engine.js       reine Berechnungslogik (Follow the Money)
    financial-model-engine.test.mjs Tests (node --test)
  data/
    concepts.json    Concept Registry (Phase-1-Subset, ca. 15 Konzepte)
    worlds.json       Academy Master Map V2 (11 Worlds)
    experiences.json Experience Registry (1 verfuegbar, 2 als Teaser/"planned")
    questions.json   kuratierte Einstiegsfragen fuer die Landingpage
  experiences/
    follow-the-money/
      index.html   Experience-Seite (Hero, Scrollytelling-Acts, sticky Chart+Controls, Methodology/Sources)
      app.js       Experience-Glue (State, Wiring Engine ↔ Shell)
      data.json    Acts-Copy, Controls-Konfiguration, Methodology, Sources, VU-Integrationen
      styles.css   seitenspezifische Ergaenzungen (Tabs, Integration-Cards, Breadcrumb)
```

## Follow the Money — wie die Experience funktioniert

`academy/experiences/follow-the-money/app.js` laedt `data.json`, baut daraus
die 8 Story-Acts (`Shell.initScrollytelling` markiert den jeweils aktiven
Act per `IntersectionObserver`) und die 10 Assumption-Controls
(`Shell.createControl`, Wertebereiche kommen aus
`Engine.ASSUMPTION_RANGES`). Jede Aenderung ruft
`Engine.computeModel(assumptions)` auf; das Ergebnis wird als Income-
Statement- oder Cash-Bridge-Waterfall (`Shell.renderWaterfall`, Tab-Wechsel)
sowie als sechs Live-Metric-Kacheln gerendert. Das Modell ist ein bewusst
vereinfachtes Zwei-Perioden-Modell (Year 0 → Year 1) eines Demo-
Unternehmens — Details und Limitationen stehen transparent im
Methodology-Panel der Experience selbst (nicht nur in diesem Dokument).

## Tests

`academy/engines/financial-model-engine.test.mjs` nutzt Node's eingebauten
Testrunner (`node --test academy/engines/financial-model-engine.test.mjs`)
— kein neues Testframework noetig. Getestet werden die geforderten
Aha-Momente: Revenue ≠ Cash, Profit ≠ Cashflow, Wachstum kann Cash binden,
CapEx reduziert FCF ohne Net Income zu beruehren, SBC ist ein Non-Cash-
Add-back, sowie Clamping der Annahmen auf sinnvolle Wertebereiche.

## Grenzen und Trennung

`academy/` liest keine Daten aus `dashboard/`, `macro/`, `hedgefonds/` etc.
und schreibt dort nichts hinein — komplett unabhaengig von den bestehenden
Datenpipelines. Umgekehrt aendert Phase 1 an keiner bestehenden
Produktseite etwas ausser dem einen neuen Menuepunkt in
`assets/site-navigation.js`.

## Bewusst noch nicht gebaut (Phase 1)

Siehe Master-Prompt Abschnitt 35: keine weiteren Worlds/Experiences außer
Follow the Money, kein vollstaendiger Knowledge-Graph-UI, kein AI-Tutor,
keine Nutzerprofile/Gamification, keine Live-Datenintegration, kein
zusaetzliches Backend. `worlds.json` und `experiences.json` fuehren die
weiteren 10 Worlds und 2 kommende Piloten (`Why Did the Stock Fall?`,
`How Diversified Are You Really?`) bereits als `status:"planned"`, damit
ihre spaetere Umsetzung nicht durch heutige technische Entscheidungen
erschwert wird.

## Naechster empfohlener Schritt

Live-Deep-Links von bestehenden Vision-Universe-Seiten (z. B. einem
Aktienreport-Feld wie „Free Cash Flow“) direkt in die passende Academy-
Experience/Concept — aktuell beschreibt die Landingpage dieses Prinzip nur
("Connected to Vision Universe"-Sektion), verlinkt aber noch nicht aus
echten Report-/Dashboard-Seiten heraus, um das Risiko einer breiten
Aenderung an bestehenden, funktionierenden Produkten in Phase 1 zu
vermeiden.
