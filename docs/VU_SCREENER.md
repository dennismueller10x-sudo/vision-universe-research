# Vision Universe Screener

**Route:** `/screener/` · **Status:** produktiv auf echten Daten (US-Aktien) · **Stand:** 28.09.2026

Der Screener ist ein eigenständiges Vision-Universe-Produkt. Er ist **nicht** Teil von Discover.

| Produkt | Zweck |
|---|---|
| Discover | Ideen finden (Themenwelten, Trends, explorativ) |
| **Screener** | **Aktien nach selbst definierten Regeln filtern** |
| Research / Aktienseite | Unternehmen analysieren (`/discover/#/s/US_REAL/<TICKER>`) |
| Quant | systematisch bewerten (`/vu2/?view=stock&ticker=<TICKER>`) |
| Strategien | Regeln testen und weiterentwickeln (`/vu2/?view=strategies`) |

## Architektur

```
discover/data/stocks/US_REAL/*.json ─┐
quant/data/market/discover-series/*  ├─ scripts/screener/build-universe.mjs ──> screener/data/universe-US_REAL.json
quant/data/universe/instruments/*    │   (Release-Projektion in build-release.mjs,       (spaltenbasiert, ~1 MB gzip)
quant/data/product/sic-peer-taxonomy │    lokal per Skript; gitignored)
quant/data/product/factor-evidence-v1┘
                                                   │
screener/engine/fields.js    Filterbibliothek (eine Definition je Kriterium)
screener/engine/query.js     Screen-Modell, Validierung, URL-Serialisierung
screener/engine/engine.js    Filter-Engine, Trichter, Why-Match, Match-Ranking, Histogramme
screener/engine/adapters.js  Datenadapter (Static JSON aktiv, Remote-API vorbereitet, Provider-Mapping)
screener/engine/store.js     Gespeicherte Screens, Verlauf, Monitoring, Benachrichtigungs-Präferenzen
screener/ui/charts.js        SVG-Charts (Sparkline, Jahresbalken, Histogramm, Kurs+SMA, Technik-Schema)
screener/app.js              Oberfläche (Views, Bottom Sheets, URL-State)
```

Engines sind DOM-frei (UMD) und laufen in Browser, Worker und Node. Die Oberfläche spricht nur mit dem Adapter.
Ein Server-Adapter (`RemoteScreenerAdapter`) nimmt dieselbe Query als JSON entgegen (`POST /screen {query, offset, limit}`),
damit Screening später serverseitig mit Index, Pagination und Cache laufen kann, ohne die Oberfläche zu ändern.

## Filter-Datenmodell

```json
{
  "v": 1, "universe": "US_REAL", "mode": "pro", "logic": "AND",
  "groups": [
    { "id": "g1", "name": "Wachstum", "op": "AND", "filters": [
      { "id": "f1", "field": "revenueGrowth", "op": "gt", "value": 0.2, "value2": null, "timeframe": "TTM", "source": "fundamentals" } ] },
    { "id": "g2", "name": "Technik", "op": "OR", "filters": [
      { "id": "f2", "field": "priceVsSma200", "op": "gt", "value": 0, "source": "technical" } ] }
  ],
  "ranking": { "enabled": true, "weights": { "momentum": 40, "growth": 30, "quality": 20, "value": 10 } },
  "sort": { "field": "match", "dir": "desc" }, "view": "cards", "columns": []
}
```

Operatoren: `gt gte lt lte between eq` (Zahlen), `in` (Auswahllisten), `is` (Ja/Nein). Werte sind Rohwerte
(0,2 = 20 %, 1e9 = 1 Mrd. $). Fehlende Werte erfüllen keine Bedingung; der Filter-Impact weist sie aus.

**URL:** `/screener/?f=sector:in:tech&f=marketCap:lt:1000000000&f=priceVsSma200:gt:0&f=g2~rsi:lt:70&go=g2:OR&mode=pro&rank=momentum:40,growth:30,quality:20,value:10&sort=match:desc&view=results`
– Deep Link, Teilen, Browser-Zurück. Ungültige Links werden gemeldet, nie still ersetzt.

**Gespeicherter Screen:** `{ id, name, description, query, createdAt, updatedAt, runs:[{at, asOf, count, symbols}], notify:{newMatches, removed, bigChanges, weekly, channel, active:false} }`
(localStorage `vu-screener-v1`). Ein neuer Lauf wird nur bei neuem Datenstand gespeichert → „Veränderungen“ vergleicht zwei Marktstände.

## Daten: was real ist und was fehlt

Real (5.400 US-Stammaktien, Stand des ausgelieferten Discover-Datensatzes):
Kurs, Performance 1T–1J/YTD, relative Stärke und Perzentile, SMA20/50/100/200-Abstand, SMA50/200, EMA21, 52W-Hoch/-Tief,
RSI(14), MACD, Bollinger %B, Volatilität, Drawdown, Volumen; SEC-Fundamentaldaten (Umsatz- und EPS-Wachstum, CAGR,
Margen, ROE/ROA/ROIC, Cash Conversion, Verschuldung, Kasse); Bewertung (KGV, KUV, KBV, EV/Umsatz, EV/EBITDA, P/FCF,
FCF-Rendite, PEG historisch); Sektor/Branche aus SEC-SIC; Quant-V2-Faktorevidenz je Faktor.

**Plausibilitätsprüfung Aktienbasis** (`VALUATION_POLICY` in `build-universe.mjs`): Bei ausländischen Emittenten
(ADR-Verhältnis unbekannt), Nicht-USD-Berichtswährung oder unplausibler Aktienbasis werden Marktkapitalisierung und
alle Kurs-/Aktienzahl-Kennzahlen **zurückgehalten** (aktuell 709 Titel). Anlass: in den Quelldaten standen z. B.
TSMC mit 11,7 Bio. $ und LATAM mit 30 Bio. $ Marktkapitalisierung. Margen und Wachstum bleiben gültig.

Nicht verfügbar (sichtbar in der Bibliothek als „Daten folgen“, nie simuliert): Analystenschätzungen, Forward-KGV,
Forward-Wachstum, Revisionen, Kursziele, EBITDA-Wachstum, Zinsdeckung, Current Ratio, ATR, Quant-Gesamtscore
(`QUANT_V2_NOT_ACTIVE`), Score-Momentum, Opportunity Score, Market Regime Fit. `PROVIDER_FIELD_MAP` dokumentiert
mögliche Quellen (FMP, Twelve Data, Massive) – ohne Aufrufe und ohne Schlüssel.

## Match / Ranking

Match = gewichteter Durchschnitt von Universums-Perzentilen je Bereich (Momentum: 6M, 1J, RS-Perzentil, 52W-Hoch;
Wachstum: Umsatz TTM, Umsatz-CAGR 3J, EPS; Qualität: Brutto-/FCF-Marge, ROE, ROIC; Bewertung: KGV, KUV, EV/EBITDA
niedriger besser, FCF-Rendite höher besser). Bezeichnung „Übereinstimmung“ – kein Anlageurteil.

## Tests

```bash
node scripts/screener/build-universe.mjs          # Artefakt lokal bauen
node --test "screener/tests/*.test.mjs"           # Engine, Registry, echtes Universum
python3 -m http.server 8765 &
node scripts/screener/browser-qa.mjs --url http://127.0.0.1:8765 --out /tmp/screener-qa
```

CI: `.github/workflows/screener-ci.yml`.

## Bekannte Einschränkungen

- Universum nur US-Börsen; „Börsenland“, „Region“ und „Unternehmenstyp“ haben daher je einen Wert.
- Sektor ist aus SIC abgeleitet (kein GICS); 645 Titel ohne SIC-Zuordnung.
- Keine Firmenlogos (Monogramme); Unternehmensbeschreibungen nur für ~300 redaktionell gepflegte Titel.
- Screens, Verlauf und Monitoring liegen auf dem Gerät; Benachrichtigungen sind vorbereitet, Zustellung braucht ein Backend.
- ADRs mit hohem US-Handelsumsatz und Verhältnis ≠ 1 können die Plausibilitätsprüfung passieren (z. B. BeOne/ONC).
- Die Quant-Faktorevidenz „Bewertung“ nutzt dieselbe Marktkapitalisierung wie die Quelle; der Screener zeigt sie unverändert.
