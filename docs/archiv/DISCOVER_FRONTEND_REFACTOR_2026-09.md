# Discover Frontend: Bestand und Refactor

## Produktgrenze

Die Plattformnavigation verbindet eigenständige Vision-Universe-Produkte. Discover enthält nur Aktien, Themenwelten, Entdecken, Suche und Märkte/Market Pulse. Quant, Academy, Research, Hedgefonds und andere Produkte werden ausschließlich über die globale Navigation erreicht.

## Bestehende Pfade und Komponenten

| Bereich | Bestehender Pfad / Baustein | Datenvertrag |
| --- | --- | --- |
| Plattformnavigation | `assets/site-navigation.js`, Web Component `vu-navigation` auf den Produktseiten | Produkt-Routen |
| Discover-Shell und Hash-Router | `discover/index.html`, `discover/app.js` | `discover/data/meta.json` |
| Discover Start und Rails | `discover/home.js`, `discover/home.css`; Home-Chunks werden nacheinander geladen | `discover/data/home/US_REAL*.json` |
| Themenkatalog | `discover/themes.js` mit 40 bestehenden redaktionellen Themen und drei `rowId`-Zuordnungen | `meta.rows`, `discover/data/rows/US_REAL/<rowId>.json` |
| Aktienkarten und Charts | `discover/ui/cards.js`, `artwork.js`, `microchart.js`, `live-hub.js`; Start und Themenwelt-Details nutzen `Home.tile` | bestehende Kurs- und Intraday-Pfade |
| Aktienseite | `discover/detail.js`, `discover/ui/detail.js` | Aktien-/Instrumentverzeichnis |
| Suche | `discover/ui/search.js` als geteilter Dialog | bestehendes Instrumentverzeichnis |
| Märkte und Market Pulse | `discover/ui/markets.js`, `market-intelligence.js`, Route `#/maerkte` | `quant/data/market/multi-asset/snapshot.json`, `quant/data/market/intelligence/market-pulse.json` |
| Währung | `quant/engines/fx/currency-preference.js` und `currency-switch.js` | gemeinsamer `VUFx.layer` |
| Darstellung | `discover/engines/theme.js` | `vu-discover-theme-v1` |

Bestehende Hash-Routen: `#/` (Start), `#/welten`, `#/thema/:slug`, `#/c/:universe/:row`, `#/s/:universe/:symbol`, `#/einzeln/:universe`, `#/maerkte`, `#/maerkte/:id`, `#/daten` sowie Einstellungen und Watchlist. Die Suche nutzt denselben Dialog in Start, Dock und Route.

## Refactor-Reihenfolge

1. Plattformmenü in Produktgruppen aufteilen; Discover-internes Menü getrennt halten. Mobile Discover-Dock bleibt bei vier Zielen, Märkte ist im Desktop-Untermenü und im Startkontext sichtbar.
2. Home-Chunks unverändert konsumieren: Hero, aktueller Marktüberblick aus dem bestehenden Multi-Asset-Snapshot, Themenwelten, ein Featured-Titel, Market-Pulse-Teaser und gebündelte Rankings-Tabs. Drei besondere spätere Reihen bleiben direkte Swipe-Module; die übrigen wiederholten Aktienreihen erscheinen als kompakte Einstiege in ihre bestehenden Sammlungsseiten. Spätere Flächen bleiben Discover-intern und werden weiter lazy geladen.
3. Den Themenkatalog nach seinen vorhandenen Gruppen präsentieren. Nur bei den drei Themen mit `rowId` konkrete Aktienzahlen und Auswahlkarten zeigen. Keine Themenperformance oder Unterthemenzahlen ohne Datenvertrag behaupten.
4. Market Pulse auf der Startseite als kurze Vorschau aus dem bestehenden Core-Artefakt; die vollständige Auswertung bleibt auf `#/maerkte`.
5. Responsive- und Zustandsprüfung für Light/Dark, Währung, Menü, Suche, Hash-Navigation, Rails und Datenfehler. Bestehende Charts, Quellen und Freshness-Semantik bleiben beim vorhandenen Renderer.

Das ist ein Frontend-Refactor. Er ändert keine kanonischen Modelle, Provider, generierten Produktdaten oder Backend-Jobs.
