# Vision Universe Altersvorsorge (VORSORGE)

Stand: 2026-10-03 · Branch `claude/vorsorge-altersvorsorge`

Vision Universe ist **kein Broker, kein Depotanbieter, kein Vermittler**. VORSORGE ist die
Analyse-, Planungs-, Vergleichs- und Intelligence-Schicht vor einem Broker oder
Vorsorgeanbieter. Die Umsetzung erfolgt extern.

Einstieg: `/vorsorge/` (Hash-Router, statisch, GitHub Pages). Globale Navigation:
Menügruppe „Vorsorge“ + Direktlink im Header (`assets/site-navigation.js`).

## 1. Architektur

```
vorsorge/
  index.html                 Seite, lädt Navigation, Engines, UI
  app.css / app.js           Design-Tokens, Router, Store, Charts, Analytics-Vertrag
  ui/plan.js                 Home, Planer, Vorsorgelücke, Kostenanalyse, Monitor
  ui/etf.js                  Screener/Suche, ETF-Detail (7 Tabs, DNA), Vergleich, Watchlist
  ui/portfolio.js            Modellportfolios, Portfolio-X-Ray, Overlap, Szenario-Lab
  ui/foerderung.js           Förderrechner, Frühstart, Riester, Anbieter, Wissen, Datenqualität
  engines/                   deterministische UMD-Module (Browser + Node)
    vorsorge-math.js         futureValue, realFutureValue, requiredSavingsRate, retirementIncome,
                             requiredCapital, feeImpact, inflationAdjustedValue, withdrawalScenario,
                             goalProbability (geseedet), plan, retirementGap, leverAnalysis
    etf-analytics.js         Performance 1D…MAX, Volatilität, Max Drawdown + Erholung,
                             beste/schlechteste Monate/Jahre, Trend, rel. Stärke, Korrelation,
                             Portfolio-Reihe
    etf-master.js            Klassifikation, ETF-Beleg, FUND → SHARE CLASS → LISTING,
                             Duplikate/Konflikte, Datenqualität, ETF-DNA, Suche
    etf-provider.js          ETFProviderAdapter (Tiingo CONNECTED; Emittenten, Deutsche Börse,
                             Euronext, LSEG, SIX, Morningstar vorbereitet), feldweises Merge
    xray.js                  Overlap, Durchschau (Holdings-Vertrag etf-holdings-1.0.0),
                             Portfolio-X-Ray, Szenario-Lab
    funding.js               versionierte Förder-Rules-Engine
    monitor.js               What changed (ETF-Stamm + Plan), Ampel, Riester-Vergleich
  data/
    etf-master.json          ETF-Verzeichnis + Kennzahlen
    etf/<SYM>.json           Detail: Reihen, Metriken, DNA, Qualität
    quality.json             Data-QA
    changes.json             Änderungsereignisse gegenüber dem letzten Build
    funding-rules/*.json     2027-DE (Altersvorsorgedepot), 2026-DE-riester, fruehstart-DE
    model-portfolios.json    7 Modellportfolios (Lehrbeispiele)
    providers.json           Anbieter-Vergleich: Feldvertrag, noch keine verifizierten Zeilen
  etf/<SYM>/index.html       öffentliche ETF-Seiten (SEO-Einstieg → SPA)
  tests/*.test.mjs           65 Tests
scripts/vorsorge/
  build-etf-data.mjs         reproduzierbarer Daten-Build aus Repository-Tiingo-Daten
  ingest-tiingo-etfs.mjs     Vollausbau: ALLE ETF-Zeilen der Tiingo-Tickerliste (CI, Key nötig)
.github/workflows/
  vorsorge-ci.yml            Tests, Reproduzierbarkeit, Seiten-Marker, Hygiene
  vorsorge-etf-universe.yml  manueller Vollausbau (workflow_dispatch, Secret TIINGO_API_KEY)
```

Routen: `#/` · `#/plan` · `#/plan/luecke` · `#/kosten` · `#/etfs` · `#/etf/<SYM>` ·
`#/vergleich?s=A,B` · `#/portfolio` · `#/portfolio/szenarien` · `#/foerderung` ·
`#/fruehstart` · `#/riester` · `#/anbieter` · `#/vergleichen` · `#/monitor` · `#/watchlist` ·
`#/wissen` · `#/daten`.

## 2. Datenlage (ehrlich)

| | Wert |
|---|---|
| Tiingo-ETF-Zeilen laut Tickerliste | 9.587 (nur Bilanz im Repo; volle Liste = Arbeitsablage, LEGAL_REVIEW_REQUIRED) |
| ETF-Listings im Repository-Auszug | 164 |
| kanonische Fonds | 163 |
| für Endnutzer sichtbar | 156 |
| mit Kurshistorie | 158 (96 %) |
| mit ≥ 3 Jahren Historie | 13 (u. a. SPY, QQQ, DIA, IWM, FEZ, URTH, EEM mit Tagesreihen ab 1995–2012) |
| komplex (Hebel/Short/Optionen/Krypto) | 68, davon Hebel/Short 22 |
| inaktiv/delistet | 8 |
| Konflikte (Tickerkollision) | 2 (BNY = Bank, GHI = Greystone; beide inaktiv, nicht sichtbar) |
| doppelte Ticker | CHAI (NASDAQ + NYSE ARCA) |
| Währungen | USD 164 |
| Börsen | NYSE 68, BATS 54, NASDAQ 30, NYSE ARCA 12 |

**Warum nur 164?** Diese Session hatte keinen Tiingo-Zugang (Proxy blockiert, kein Key).
Der Build nutzt deshalb alles, was Tiingo-Daten im Repository bereits enthalten
(Wertpapierstamm, Tickerlisten-Auszug, Multi-Asset-Tracker, Discover-Reihen) – ohne
künstliche Beschränkung. Der Vollausbau auf alle ~9.600 ETFs läuft mit
`vorsorge-etf-universe.yml` (manuell, Owner-Entscheidung: Kontingent + Erweiterung des
öffentlichen Produktuniversums). Das Skript rekonstruiert dabei die **Gesamtrendite** mit
`quant/engines/canonical-total-return.js`; ohne erfolgreiche Rekonstruktion bleibt die
Basis `PRICE_RETURN`.

**Renditebasis:** Alle heute ausgelieferten Reihen sind split-bereinigte Schlusskurse
**ohne Ausschüttungen**. Die Oberfläche sagt „Kursentwicklung (ohne Ausschüttungen)“ und
nennt Total Return nur bei `basis = TOTAL_RETURN`.

**Felder ohne Quelle** (bleiben `null`, UI „Daten folgen“): TER, Fondsvolumen,
Replikation, Ausschüttungsart, ISIN/WKN, Holdings, Sektoren, Tracking Difference.
Abgeleitet aus dem Fondsnamen (gekennzeichnet `NAME_PATTERN`): Anbieter, Assetklasse,
Region, Index, Thema, Hebel/Short. Index der Markt-Tracker aus der Tiingo-Beschreibung.

**Datenfalle recycelte Ticker:** Tiingos `startDate` gehört bei wiederverwendeten
Kürzeln zum Vorgänger (z. B. WR „1987“, Kursreihe ab 2026). Deshalb nie als
Auflagedatum gezeigt; UI nennt „Kurshistorie ab“ und weist auf den Konflikt hin.

**US-Listings:** Für EU-Privatanleger meist nicht handelbar (kein Basisinformationsblatt).
Die UI sagt das an ETF-Detail und Modellportfolios. UCITS-Listings brauchen europäische
Datenquellen (Adapter vorbereitet).

## 3. Förderregeln

Versioniert unter `vorsorge/data/funding-rules/`, keine Beträge im Code.

- `2027-DE.json` – gefördertes Altersvorsorgedepot, Bundestagsbeschluss KW 13/2026:
  Grundzulage 50 % auf 0–360 € und 25 % auf 360–1.800 € Eigenbeitrag (max. 540 €),
  Mindestbeitrag 120 €, Kinderzulage bis 300 €, Berufseinsteigerbonus 200 € (< 25 J.).
  `primaryVerified: false` – Werte aus übereinstimmenden Sekundärquellen; Bundestag/BMF
  waren aus der Build-Umgebung nicht abrufbar. **Vor Produktivfreigabe gegen BGBl. prüfen.**
  Kinderzulagen-Staffel als Annahme markiert.
- `2026-DE-riester.json` – §§ 84–86, 10a EStG (175 €, 185/300 €, 4 %/2.100 €, 60 € Sockel).
- `fruehstart-DE.json` – 10 €/Monat, 6–17 Jahre, Status „angekündigt“.

## 4. Tests & QA

- `node --test "vorsorge/tests/*.test.mjs"` → 65/65 (Math, Inflation, Gebühren, Sparrate,
  Ziel, Performance, Drawdown, ETF-Matching, Duplikate, Provider-Adapter, Null-Handling,
  Währung, Delisting, Hebel/Short, Förderung, Overlap, X-Ray, Szenarien, Monitor,
  Daten-Contract).
- Discover/Navigation: `discover/tests` + `quant/tests/site-navigation.test.mjs` → 320/320
  (Navigationstest um die neue Gruppe erweitert); Consolidation-Gate PASS;
  `assert-public-data-hygiene.mjs` PASS; `build-release.mjs` PASS.
- Browser-QA (Playwright, 23 Routen × 1440/1280/820/390): keine horizontalen Overflows,
  keine Konsolenfehler, keine leeren Module, kein NaN; Interaktionen (Suche, Planer,
  Sortierung, Filter, Modellportfolio, Watchlist), Hell/Dunkel geprüft.
- Daten-Build reproduzierbar (zwei Läufe, identische Hashes).

## 5. Offene Punkte / nächste Datenquellen

1. Vollausbau Tiingo-ETF-Universum (Workflow starten) inkl. Gesamtrendite.
2. Emittenten-Factsheets/Holdings (iShares, Vanguard, Xtrackers, Amundi, SPDR): TER,
   Volumen, Replikation, Ausschüttung, ISIN, Holdings → aktiviert DNA-Kosten/Diversifikation,
   Overlap, Durchschau, Sektor-Szenarien.
3. Europäische Listings (Deutsche Börse/Xetra, Euronext, LSEG, SIX) für UCITS.
4. Verifizierte Anbieterkonditionen geförderter Altersvorsorgedepots (BIB/PLV).
5. Förderregeln gegen Gesetzestext (BGBl.) verifizieren, `primaryVerified` setzen.
6. Analytics-Senke anschließen (Vertrag steht, sendet derzeit nichts).
