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

## Fundamentaldaten-Pipeline (separat, manuell)

`Financial Modeling Prep (profile, ratios-ttm, key-metrics-ttm, financial-growth) → GitHub Actions (nur workflow_dispatch) → dashboard/data/fundamental_metrics.json`

Ursprünglich war diese Pipeline auf Twelve Data ausgelegt; deren `/statistics`-Endpoint ist dort aber erst ab dem Pro-Tarif freigeschaltet (bestätigt per 403-Fehler mit expliziter Plan-Meldung). Umgestellt auf Financial Modeling Prep, deren kostenloser Tarif (250 Requests/Tag) die benötigten Endpunkte für US-Aktien bereits enthält.

Diese Pipeline ist bewusst von der wöchentlichen Kurs-Pipeline getrennt, damit ein Fundamentaldaten-Lauf den Kurs-/Technical-Workflow niemals beeinflussen kann:

- `scripts/dashboard/fetch_fundamentals.py`: ruft pro übergebenem Symbol vier FMP-Endpunkte auf (`profile`, `ratios-ttm`, `key-metrics-ttm`, `financial-growth`) und schreibt ausschließlich `dashboard/data/fundamental_metrics.json` (Schema-Version 3). Andere Symbole im File bleiben beim Merge unverändert; `pe_ratio_forward` bleibt leer, da FMPs kostenloser Tarif keine Analysten-Schätzungen liefert.
- `.github/workflows/update-fundamentals.yml`: **nur** `workflow_dispatch` mit Pflicht-Input `symbols` (Komma-getrennt, Default `AMZN`) — kein Cron, läuft nie automatisch. Erhält den Schlüssel ausschließlich als Secret `FMP_API_KEY`. Ein eigener Scope-Guard erlaubt im Diff ausschließlich `dashboard/data/fundamental_metrics.json`.
- Symbole, die schon vor dieser Pipeline von Hand recherchierte Kennzahlen hatten, behalten diese unter `legacy` je Symbol als Fallback; `app-rebuild.js` und `guide/app.js` zeigen den FMP-Wert, sobald einer vorliegt, sonst den `legacy`-Wert, sonst „—“.
- Neue Symbole werden weiterhin über `dashboard/config/universe.json` freigeschaltet; Kursdaten dafür liefert erst der nächste Lauf von `update-dashboard.yml` (unverändert, eigener Trigger).
- Fehlt für ein Symbol ein Fundamental-, Score- oder Kursdatensatz, rendert `app-rebuild.js` einen degradierten Zustand (`—`, „Score noch offen“, „Kein Research-Profil hinterlegt“) statt abzustürzen — neue Symbole können so schrittweise befüllt werden, ohne bestehende Seiten zu gefährden.
- Die Marktkapitalisierungs-Linie im Charting (`?overlay=mcap`) kostet keine zusätzlichen Credits: sie wird clientseitig aus vorhandenen Kursdaten × zuletzt gemeldeten `shares_outstanding` berechnet (Näherung, ignoriert Rückkäufe/Kapitalerhöhungen zwischen zwei Fundamental-Läufen) und ist nur sichtbar, wenn für das gewählte Symbol bereits Fundamentaldaten vorliegen.

## Analyst Ratings Pipeline

`Finnhub (+ FMP für Kursziele) → GitHub Actions → dashboard/data/analyst_ratings.json → statisches Dashboard`

- `scripts/dashboard/fetch_analyst_ratings.py`: ruft Recommendation Trends (letzte 6 Monate) von Finnhub für alle aktiven Aktien aus `dashboard/config/universe.json` ab (Benchmarks/ETFs werden übersprungen, da sie keine Analystenabdeckung haben). Für den Kursziel-Konsens wird zuerst Finnhub versucht; liefert dessen `/stock/price-target` einen Plan-Fehler (401/403), fällt das Script automatisch auf FMPs `/stable/price-target-consensus` zurück. Welcher Anbieter den Kursziel-Wert geliefert hat, steht je Aktie in `price_target_provider`.
- `.github/workflows/update-analyst-ratings.yml`: läuft sonntags und kann manuell gestartet werden. Erhält die Schlüssel ausschließlich als Secrets `FINNHUB_API_KEY` (Pflicht) und `FMP_API_KEY` (optional — ohne ihn gibt es Kursziele nur, wenn Finnhubs eigener Endpunkt zugänglich ist). Bricht ohne Daten-Commit ab, falls `FINNHUB_API_KEY` fehlt oder die Recommendation-Trends nicht geliefert werden. Ein lokales Sicherheits-Limit (`MAX_CALLS_PER_RUN`) bricht den Lauf zusätzlich hart ab, falls je Lauf ungewöhnlich viele API-Calls anfallen würden.
- Ausschließlich `dashboard/data/analyst_ratings.json` darf durch diesen Workflow verändert und committed werden. Die initiale Datei trägt absichtlich den Status `not_generated`, bis der erste erfolgreiche Lauf erfolgt.
- `analysten/index.html`: eigenständige Dashboard-Seite (wie `hedgefonds/index.html`), die ausschließlich `dashboard/data/analyst_ratings.json`, `dashboard/config/universe.json` (Firmennamen) und `dashboard/data/market_data.json` (aktueller Kurs für das Kurszielpotenzial) lädt. Kein Live-Finnhub-/FMP-Zugriff im Browser.
- Weder Finnhub noch FMP liefern im kostenlosen bzw. aktuell gebuchten Tarif eine Zuordnung einzelner Kursziele zu Bank/Analyst — nur aggregierte Werte (Konsens, Hoch/Tief/Median). Eine solche Detailtiefe wäre nur mit einem kostenpflichtigen Upgrade möglich.
- Diese Pipeline ist unabhängig von der Technical Engine und den Reports; sie liest und verändert deren Dateien nicht.
