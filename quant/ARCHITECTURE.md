# VISION UNIVERSE® QUANT — Architektur und lokale Entwicklung

Dieses Verzeichnis enthaelt das Investment Intelligence System. Es folgt demselben Muster
wie `macro/` und `academy/`: statisches HTML/CSS/JS, keine Build-Pipeline, keine
Frameworks, Auslieferung ueber GitHub Pages. `/assets/site-navigation.js` und `.css`
werden unveraendert weiterverwendet (`Quant` wurde dort als Menuepunkt ergaenzt).

Die ausfuehrliche Architekturbeschreibung steht in `docs/VU_ARCHITECTURE.md`; die
Begruendung der Technologieentscheidungen in
`docs/VU_INVESTMENT_INTELLIGENCE_IMPLEMENTATION_PLAN.md`.

## Schichten

1. **Engines** (`engines/*.js`) — reine Logik ohne DOM, lauffaehig in Browser, Node und
   Web Worker (UMD-Muster mit `globalThis`). Hier steht die gesamte Berechnung.
2. **Methodik** (`methodology/*.json`) — alle Gewichte, Schwellen und Strategien,
   versioniert. Keine Magic Numbers in Code oder UI.
3. **Product API** (`api/client.js`) — die v1-Contracts als Funktionsschicht. Seiten und
   AI-Tools rufen ausschliesslich diese Grenze auf, nie eine Engine direkt.
4. **UI** (`ui/*`) — Designsystem, Shell, Charts, Komponenten, Backtest-Worker. Enthaelt
   keine Berechnungslogik.
5. **Daten** (`data/**`) — praekomputierte Artefakte. **Generiert, nicht von Hand
   gepflegt.**
6. **Seiten** (`<name>/index.html` + `app.js`) — Glue-Code: laden, rendern, verlinken.

## SEC Financial Data Core (Phase 4)

Der SEC-Workstream ist **keine zweite Architektur**, sondern eine Ingestion-Quelle
unterhalb der bestehenden Provider-Abstraction:

```
data.sec.gov -> scripts/quant/sec/**  ->  quant/data/sec/*.json
   (Actions)     Python-Ingestion         kanonische FundamentalFact/Filing-Records
                                                    |
                                          providers/sec/adapter.js
                                          FundamentalDataProvider (provider.js)
                                                    |
                                          engines/  Quant · Strategy · Backtest
```

- Die Python-Pipeline unter `scripts/quant/sec/` ist der **Adapter-Unterbau**: sie ist
  der einzige Ort, an dem SEC-/XBRL-spezifische Nutzlasten vorkommen. Sie schreibt
  ausschliesslich kanonische Records nach `quant/data/sec/`.
- `providers/sec/adapter.js` implementiert `FundamentalDataProvider` aus
  `engines/provider.js` und liefert `ok()`/`unavailable()`-Umschlaege. Oberhalb dieser
  Grenze existiert kein SEC-Feld.
- Die Point-in-Time-Regel bleibt `availableAt <= decisionTime` aus `engines/schema.js`
  (`latestKnownFact`). Der SEC-Adapter bringt keine eigene PIT-Semantik mit.
- Details: `docs/SEC_DATA_ARCHITECTURE.md`, `docs/SEC_NORMALIZATION.md`,
  `docs/SEC_PIT_METHODOLOGY.md`, `docs/SEC_COVERAGE_REPORT.md`.

`quant/data/sec/raw/` und `quant/data/sec/facts/` sind gitignored (SEC-Rohdaten,
reproduzierbar). Committet werden nur die kompakten Artefakte daneben.

## Lokale Entwicklung

Voraussetzung: Node.js 22 (nur fuer Tests und Praekomputation; die Website selbst braucht
kein Node).

```bash
# 1  Repository klonen — keine Abhaengigkeiten zu installieren, kein package.json
git clone <repo> && cd vision-universe-research

# 2  Mock-Daten erzeugen (~6 s)
node scripts/quant/build-quant-data.mjs

# 3  Daten gegen die Engines pruefen
node scripts/quant/verify-quant-data.mjs

# 4  Tests
node --test "quant/tests/*.test.mjs"

# 5  Statischen Server starten
python3 -m http.server 8765
#    oder: npx serve .
```

Dann `http://localhost:8765/quant/` oeffnen.

Es wird **kein API-Key benoetigt**. Die gesamte Anwendung laeuft offline auf dem
MockProvider — nur die Schriftart wird von Google Fonts geladen, mit vollstaendigem
Fallback-Stack.

## Wann muss `build-quant-data.mjs` neu laufen?

Nach jeder Aenderung an `engines/mock-generator.js`, `engines/factors.js`,
`engines/quant-score.js`, `engines/normalization.js`, `engines/radar.js` oder
`methodology/quant-v1.json`.

`verify-quant-data.mjs` faellt genau darauf: es rechnet alle Scores nach und vergleicht
sie mit der ausgelieferten Datei. Es laeuft in der CI, weil eine stille Abweichung
zwischen Uebersicht und Backtest der gefaehrlichste Datenfehler des Systems waere.

## Neue Seite anlegen

1. `quant/<name>/index.html` nach dem Muster einer bestehenden Seite (Header, Tab-Leiste,
   `#q-main`, dann die benoetigten Engine-Skripte, `ui/shell.js`, `ui/charts.js`,
   `ui/components.js`, optional `api/client.js`, zuletzt die eigene `app.js`).
2. `quant/<name>/app.js` mit `QuantShell.page({ nav, need, render })`.
3. Eintrag in `NAV` in `quant/ui/shell.js`.
4. `node scripts/sync-navigation.mjs` fuer die Vision-Universe-Hauptnavigation.

Die CI prueft, dass jede Seite Shell und Navigation einbindet.

## Neues Feld ergaenzen

Ein Feld wird **einmal** in `engines/catalog.js` definiert und steht danach automatisch in
Screener-UI, VUQL-Parser, Query-Validierung, Strategiefiltern und AI-Werkzeugbeschreibung
zur Verfuegung. Soll es Faktorkomponente werden, kommt es zusaetzlich mit Gewicht in
`methodology/quant-v1.json` — und die Methodikversion wird erhoeht.

## Grenzen und Trennung

`quant/` liest keine Daten aus `dashboard/`, `macro/`, `hedgefonds/` oder `academy/` und
schreibt dort nichts hinein. Umgekehrt aendert dieser Bereich an keiner bestehenden
Produktseite etwas ausser einem Menuepunkt in `assets/site-navigation.js` und einer Zeile
Positionierung in `assets/site-navigation.css`.

## Bewusst nicht gebaut

Broker-Integration, Orderausfuehrung, autonomes AI-Trading, native Apps, Realtime,
Optionen, Krypto, Intraday-Backtesting, Portfolio-Optimierer, historische
Analystenrevisionen ohne lizenzierte Daten. Die Architektur ist so geschnitten, dass all
das spaeter moeglich bleibt — siehe „Erweiterungspunkte“ in `docs/VU_ARCHITECTURE.md`.
