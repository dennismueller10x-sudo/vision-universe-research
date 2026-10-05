# App Readiness – Analyse und Vorbereitung

**Stand:** 03.10.2026 · Entscheidung: [ADR-004](ADR-004-mobile-architecture.md)

Ziel: Vision Universe soll eine native App bekommen können, ohne dass dafür eine zweite Datenwahrheit oder ein zweites Fachmodell entsteht.

```
VISION UNIVERSE CORE  (core/, quant/engines/, Datenartefakte, R2)
        │
VISION UNIVERSE API   heute: core/client.js über statische Dateien, api/*.js (Vercel)
        │             morgen: /v1/... mit demselben Vertrag
   ┌────┴────┐
  WEB       APP
```

## 1. Ausgangslage (gemessen)

| Thema | Befund | Folge für eine App |
|---|---|---|
| Laufzeit | statische Seiten, UMD-Engines ohne DOM | Engines laufen unverändert in React Native (Hermes/JSC) |
| Datenzugriff | Produkte lesen Dateipfade direkt; nur `core/client.js` und `quant/api/product-services.js` kapseln | Die App braucht eine API, keine Pfade |
| Datenmengen | Supertrader 3,6 MB je Seite, Quant-Screener 18,8 MB + 1,2 MB, Discover-Start ca. 2 MB, Hedgefonds 2,15 MB | Mobil über Funk nicht tragbar. Vorher sharden oder eine API mit Abfrage anbieten. |
| Offline | kein Service Worker, kein Manifest, `cache: no-store/no-cache` in mehreren Seiten | Erste Stufe ist eine PWA |
| User Data | nur `localStorage`, je Produkt getrennt (siehe §3) | ein Modell, eine Quelle |
| Identität | `securityId` ist tickerbasiert | Watchlists und Portfolios müssen `instrumentId` speichern |
| Auth | keine Konten. `ask/` und `vu-ask` haben einen Passwortzugang, die Research-Maske arbeitet clientseitig. | Konten sind für die App neu zu bauen |
| Realtime | WebSocket `wss://live.visionuniverse.de/live` (vu-live) | wiederverwendbar; vorher Verbindungslimit einbauen (SECURITY_REVIEW M5) |

## 2. Optionen

| Option | Wiederverwendung | Aufwand | Risiko | Urteil |
|---|---|---|---|---|
| **PWA** | 100 % Web | gering | iOS-Push erst ab iOS 16.4 und nur nach „Zum Home-Bildschirm“; Speicher kann geräumt werden | **Stufe 1** |
| **Expo / React Native** | Engines, Verträge, Formatierung (`money-format.js`) | mittel | UI wird neu gebaut | **Stufe 3** |
| Native (Swift/Kotlin) | keine | hoch, doppelt | zwei Codebasen | nein |
| Hybrid (Capacitor/WebView) | Seiten 1:1 | gering | trägt Datenmengen, Scroll- und Ladeprobleme der Web-Seiten in die App | nein |

**Empfehlung:**
1. Jetzt eine PWA.
2. Parallel `/v1/` als HTTP-Fassade von `core/client.js` (Vercel `api/`, dort laufen schon `/api/intraday`, `/api/history`, `/api/status`).
3. Expo, sobald Konten, Push oder Store-Präsenz gebraucht werden. Expo statt nacktem React Native, wegen EAS Build/Update, Push über `expo-notifications` und Deep-Link-Handling über `expo-router`.

## 3. User Data getrennt von Market Data

| Market Data (Core, öffentlich, gecacht) | User Data (privat, je Konto) |
|---|---|
| Securities, Kurse, Fundamentals, Index, News, Quant, Supertrader | Watchlists, Portfolios, Präferenzen, Notification-Opt-ins, Geräte, Konto, Abo/Entitlements, Feature Flags |
| Quelle: `core/registry/domains.json` | Modell: `core/contracts/user-data.schema.json` |
| statisch, CDN | API mit Auth, nie im Pages-Artefakt |

**Heutige Nutzerdaten im Browser** (Migrationsquelle):

| Schlüssel | Inhalt | Produkt |
|---|---|---|
| `vu-discover-watchlist-v1` | Watchlist (Ticker) | Discover |
| `vu.quant.watchlist.v1` | Watchlist (Ticker) | Quant |
| `vu.quant.recent.v1` | zuletzt angesehen | Quant |
| `vu-discover-memory-v1` | gesehene Titel, Feed-Position | Discover |
| `vu-currency-preference-v1` | Anzeigewährung | global |
| `vu-discover-theme-v1` | Hell/Dunkel | global |
| `vu-screener-v1` | Screener-Zustand | Screener |
| `vu-ask-access`, `vu-ask-client`, `vu-ask-read` | Atlas-Zugang. **Das Passwort steht im Klartext** (SECURITY_REVIEW L1). | Ask |

**Befund:** Es gibt zwei getrennte Watchlists. Wer in Discover eine Aktie merkt, sieht sie in Quant nicht.
Das Schema sieht **eine** Watchlist-Sammlung für alle Produkte vor. Die Migration bildet die Vereinigung beider Schlüssel und löst jeden Ticker einmalig auf eine `instrumentId` auf (`core/client.js#getSecurity`).

## 4. Routing, Deep Links, Universal Links

Kanonische Routen, die Web und App teilen. Für die App werden sie als Universal Links (iOS) und App Links (Android) reserviert:

| Route | Web heute | Inhalt |
|---|---|---|
| `/stock/{ticker}` | `/discover/#/s/US_REAL/{ticker}` und `/quant/#/aktie/{ticker}` | Aktienseite |
| `/discover` | `/discover/#/` | Entdecken |
| `/markets` | `/discover/#/maerkte` | Märkte |
| `/screener` | `/screener/?…` | Screener |
| `/strategies/{id}` | `/supertrader/strategies/{slug}/` | Strategie |
| `/watchlist` | `/discover/#/watchlist` | Watchlist |
| `/status` | `/status/` | Systemzustand (intern) |

Heute nutzt Discover Hash-Routing. Die App braucht Pfad-Routen.
Vorbereitung:
- `apple-app-site-association` und `assetlinks.json` unter `/.well-known/` ausliefern, sobald App-IDs feststehen.
- Eine Pfad-zu-Hash-Weiterleitung (`404.html` existiert) für Web-Aufrufe ohne App.

## 5. Mobile Domain: was vorbereitet ist und was nicht

| Bereich | Stand |
|---|---|
| Authentication, Sessions | nicht gebaut; Modell: `userId` opaque, Token nur serverseitig |
| User Profile, Preferences | Schema (`user-data.schema.json#profile/preferences`) |
| Watchlists, Saved Stocks, Portfolios | Schema, Migrationsquelle dokumentiert |
| Notifications, Device Registration | Schema (`devices`, `notificationSettings`) + Ereignismodell (§6) |
| Entitlements, Subscription State | Schema (`entitlements`); kein Anbieter angebunden |
| Feature Flags | Schema; heute `quant/config/feature-gates.json` (global, nicht je Nutzer) |
| Deep Links, App-Routing | §4 |

Bewusst **nicht** gebaut: Es gibt dafür heute keinen Verbraucher (Leitlinie des Auftrags).

## 6. Push-Notifications (Entwurf)

```
Datenlauf (Refresh, SEC daily, Supertrader, Regime)
   └── neue veröffentlichte Artefakte
         └── Event-Generator: vergleicht Stand N mit N-1, deterministisch
               └── events (core/contracts/events.schema.json), idempotent je eventId
                     └── Fan-out je Nutzer: Opt-in × Watchlist × Entitlement
                           └── Zustellung: Expo Push / Web Push, Rate-Limit je Nutzer und Tag
```

| Ereignis | Quelle | Regel (Vorschlag) |
|---|---|---|
| WATCHLIST_NEWS | News, Company Intelligence | neue Meldung zu einem Titel auf der Watchlist |
| EARNINGS | SEC daily (8-K/10-Q), Company Intelligence | neue Quartalszahlen veröffentlicht |
| PRICE_EVENT | EOD-Reihe | neues 52-Wochen-Hoch oder Tagesbewegung über einer Schwelle (aus derselben Reihe, ADR-002) |
| SUPERTRADER_SIGNAL | `supertrader/data/signals.json` | Zustandswechsel SETUP→TRIGGER oder INVALIDATED |
| QUANT_CHANGE | `quant/data/product/**` | Zuordnungswechsel (`assignment-change`) |
| MARKET_REGIME_CHANGE | Market Regime | Regimewechsel |

Grundsätze:
- Kein Ereignis aus einer AI-Interpretation.
- Jedes Ereignis trägt seine Evidenz und seinen Datenstand (`asOf`).
- Ein Ereignis zu veralteten Daten wird nicht versendet. Der Event-Generator prüft vorher `core/health.js`.

## 7. Reihenfolge

1. PWA: Manifest, Icons, Service Worker für die Shell, Offline-Zustand.
2. Große Artefakte sharden (Supertrader-Signale je Symbol, Faktoren über `screening.json.gz`).
3. `/v1/` mit den Verträgen aus `core/client.js`, Rate-Limit, `Cache-Control` je Datenart.
4. Konten und User-Data-API (Schema §3). Migration der beiden Watchlists.
5. Event-Generator (§6) als Teil der Datenläufe.
6. Expo-App mit `expo-router` (Routen aus §4), `expo-notifications`.
