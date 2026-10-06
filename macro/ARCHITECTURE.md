# VISION UNIVERSE® Macro Intelligence — Architektur V1

## Produktionsfluss (V1)

`Manuelle/redaktionelle Recherche (FRED, BLS, BEA, ...) → macro/data/*.json → statisches Dashboard`

Der Browser ruft FRED oder andere Datenquellen nicht direkt auf (CORS-/Fetch-Beschränkungen im Browser, siehe unten). Er lädt ausschließlich die vier statischen JSON-Dateien in `macro/data/`.

## Trennung der vier Ebenen

1. **UI** (`macro/index.html`, `macro/styles.css`): Layout, Navigation, Kartenkomponenten. Enthält keine Berechnungslogik und keine redaktionellen Texte.
2. **Berechnungslogik** (`macro/calc.js`): reine Funktionen (direction/momentum/acceleration/score, Kategorie-Aggregation, Regime-Score, Yield-Curve-Klassifikation, Fed-Flexibility, Inflection-Point-Erkennung). Kennt keine UI, keine redaktionellen Texte.
3. **Rohdaten** (`macro/data/current.json`): ausschließlich recherchierte Fakten je Indikator (currentValue, historische Vergleichspunkte, Quelle, Datum, Datenhinweis). Keine abgeleiteten Scores, keine Meinungen.
4. **Redaktionelle Interpretation** (`macro/data/content.json`): Macro Read (Tailwinds/Headwinds/Regime Change/Bottom Line), Asset Implications, Playbook-Prinzipien, Kategorie-Einleitungstexte. Wird monatlich von Hand aktualisiert.

`macro/app.js` verbindet alle vier Ebenen zur Laufzeit im Browser.

## Ordner

- `macro/index.html` — Markup-Grundgerüst, 11 Ansichten (Overview + 10 Kategorien), Hash-Routing.
- `macro/styles.css` — erweitert die bestehenden Vision-Universe-Design-Tokens (siehe `/hedgefonds/index.html`, `/dashboard/v2.css`) um Regime-Skala, Signal-Karten, KPI-Karten, Composite-Karten.
- `macro/calc.js` — Berechnungsschicht (siehe oben), keine Abhängigkeit von DOM oder fetch.
- `macro/app.js` — lädt die vier JSON-Dateien, ruft calc.js auf, rendert alle Ansichten.
- `macro/data/config.json` — zentral konfigurierbar: Gewichtung der 7 Teil-Scores, Regime-Schwellenwerte/-Labels, Kategorie-Zugehörigkeit je Indikator, Polarität (higherIsBetter) je Indikator, Inflection-Schwellenwerte.
- `macro/data/current.json` — aktueller Monats-Snapshot aller ~52 Indikatoren (Level, 3/6/12-Monats-Vergleich, Quelle, Datenhinweis).
- `macro/data/content.json` — redaktionelle Ebene (siehe oben).
- `macro/data/history.json` — monatliche Regime-Score-Archiv-Historie (wird bei jedem Update um einen Eintrag ergänzt, nie überschrieben).
- `macro/data/archive/YYYY-MM.json` — vollständiger, unveränderlicher Snapshot-Export des jeweiligen Monats (Daten + redaktioneller Text + berechnete Scores zum Zeitpunkt der Veröffentlichung), für spätere Nachvollziehbarkeit von Regimewechseln.

## Monatliches Update (V1, manuell)

1. `macro/data/current.json` mit neuen Werten aktualisieren (bestehende Struktur je Indikator beibehalten: currentValue wird zu previousValue, previousValue zu threeMonthsAgo usw. — oder gezielt neu recherchieren, wo Datenlücken bestehen).
2. `macro/data/content.json` redaktionell aktualisieren (Macro Read, Asset Implications, ggf. Kategorie-Einleitungen).
3. Einen neuen Eintrag in `macro/data/history.json` (`snapshots`) ergänzen — niemals bestehende Einträge löschen oder verändern.
4. Eine Kopie des vollständigen Snapshots unter `macro/data/archive/YYYY-MM.json` ablegen.

Keine Code-Änderung an `index.html`, `styles.css`, `app.js` oder `calc.js` nötig, solange sich die Indikator-Liste nicht ändert.

## Neue Indikatoren hinzufügen

1. Eintrag in `macro/data/current.json` unter `indicators.<id>` mit Metadaten (name, category, seriesId, source, unit, frequency) und Werten ergänzen.
2. `<id>` in `macro/data/config.json` unter `polarity` (higherIsBetter true/false) und in der passenden `categoryMembers`-Liste ergänzen.
3. Optional: Kennzahl in der passenden `render*`-Funktion in `app.js` in eine `kpi-grid`-Liste aufnehmen (sonst erscheint sie nicht auf einer Kategorieseite, fließt aber bereits in den Teil-Score ein).

## Grenzen und Trennung

`dashboard/`, `hedgefonds/`, `etf/`, `analysten/` sind eigenständige Produkte mit eigenen Datenpipelines. Dieses Verzeichnis liest, verändert und committet dort nichts, und umgekehrt.

## V2 (nicht in V1 implementiert, architektonisch vorbereitet)

`FRED-/weitere APIs → Cloudflare Worker/Backend → Cache → Macro Calculation Engine → macro/data/*.json`

Sobald ein Backend automatisiert `macro/data/current.json`, `history.json` und `archive/*.json` im gleichen Format schreibt, funktioniert das bestehende Frontend unverändert weiter — die vier Ebenen (UI/Berechnung/Daten/Redaktion) sind bereits so geschnitten, dass V2 nur Ebene 3 (Rohdaten-Beschaffung) automatisiert, ohne UI, Berechnungslogik oder redaktionelle Struktur zu verändern.
