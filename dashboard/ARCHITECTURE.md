# VISION UNIVERSE® Investment OS — Architektur V6.3

## Produktionsfluss

`Twelve Data → GitHub Actions → Technical Engine → dashboard/data/*.json → statisches Dashboard`

Der Browser lädt ausschließlich die statischen JSON-Dateien. Er ruft Twelve Data nicht direkt auf und enthält keinen API-Schlüssel.

## Ordner

- `dashboard/index.html`: V5 Score Beta Master, mit V6.3-Anbindung für statische Daten.
- `dashboard/config/universe.json`: einzige Symbolquelle für Aktien und Benchmarks.
- `dashboard/data/market_data.json`: generierte Tageskerzen.
- `dashboard/data/technical_scores.json`: generierte, deterministische Kennzahlen und Scores.
- `scripts/dashboard/fetch_market_data.py`: sequenzieller Abruf von Twelve Data.
- `scripts/dashboard/calculate_technicals.py`: lokale technische Berechnungen.
- `.github/workflows/update-dashboard.yml`: wöchentlicher Lauf und eingeschränkter Commit.

## Betrieb

Der Workflow läuft samstags und kann manuell gestartet werden. Er erhält den Schlüssel ausschließlich als Secret `TWELVE_DATA_API_KEY`. Falls er fehlt oder ein Symbol nicht valide geliefert wird, bricht der Lauf ohne Daten-Commit ab.

Neue Aktien werden ausschließlich durch Änderung von `dashboard/config/universe.json` hinzugefügt. Nur aktive Einträge werden verarbeitet; Benchmarks sind getrennt.

## Generierte Dateien

Ausschließlich `dashboard/data/market_data.json` und `dashboard/data/technical_scores.json` dürfen durch den Workflow verändert und committed werden. Die initialen Dateien tragen absichtlich den Status `not_generated`, bis der erste erfolgreiche Lauf erfolgt.

## Grenzen und Trennung

`reports/` ist ein eigenständiges Produkt. Dieser Dashboard-Workflow liest, verändert und committet dort nichts.

Eine spätere Fundamental Engine schreibt unabhängig `fundamental_scores.json`. Sie erweitert das Dashboard, ohne die Technical Engine oder Reports umzubauen.
