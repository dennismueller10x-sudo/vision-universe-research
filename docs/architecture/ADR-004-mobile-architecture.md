# ADR-004: Weg zur nativen App

**Status:** angenommen (Richtung), 03.10.2026 · Ausführliche Analyse: [APP_READINESS.md](APP_READINESS.md)

## Entscheidung

1. **Stufe 1 – PWA (jetzt, wenig Aufwand):** Web-Manifest und ein kleiner Service Worker für die Shell.
   Damit kommen Installierbarkeit, Startbildschirm-Icon und ein Offline-Zustand. Die Daten bleiben statisch und werden per HTTP gecacht.
   Es gibt keine neue Laufzeit und kein zweites Frontend.
2. **Stufe 2 – Vision Universe API (`/v1/...`):** Die Verträge aus `core/client.js` werden als HTTP-Endpunkte angeboten.
   Ort: Vercel (`api/`) oder Cloudflare Workers, beide sind schon im Betrieb.
   Der statische Client und der HTTP-Client sprechen **denselben** Vertrag (Umschlag `{state, reason, source, asOf, data}`).
3. **Stufe 3 – Expo / React Native**, sobald Push-Benachrichtigungen, Konten oder App-Store-Präsenz gebraucht werden.
   - Die Engines (UMD, rein, ohne DOM) laufen unverändert in Hermes und JavaScriptCore.
   - Das UI wird nativ neu gebaut.
   - Daten kommen ausschließlich über `/v1/...`.
4. **Nicht gewählt:**
   - Rein native Apps (Swift/Kotlin): doppelte UI-Arbeit, keine Wiederverwendung der Engines.
   - Ein Capacitor-Wrapper um die bestehenden Seiten: Die Seiten laden heute bis zu 20 MB JSON, haben keinen Offline-Zustand und kein gemeinsames Komponentensystem. Das würde die Web-Schulden in die App tragen.

## Voraussetzungen, die vorher erfüllt sein müssen

- **User Data getrennt von Market Data** (`core/contracts/user-data.schema.json`). Heute gibt es zwei unabhängige Watchlists im `localStorage` (Discover und Quant).
- **Sharding der großen Artefakte:**
  - `supertrader/data/signals.json`: 3,2 MB auf jeder Seite.
  - `factors-FULL_UNIVERSE.json`: 18,8 MB im Quant-Screener.
- **Stabile Identität** für Watchlists und Portfolios: `instrumentId` mit Generation statt Ticker (ADR-001, offener Teil).
- **Deep Links:** Die kanonischen Routen sind festgelegt (APP_READINESS.md §4) und werden als Universal Links und App Links reserviert.
