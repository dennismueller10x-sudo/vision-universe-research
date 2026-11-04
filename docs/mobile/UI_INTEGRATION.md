# Mobile Oberfläche: Weg von verschachtelten Rahmen zur App-Navigation

**Stand:** 03.11.2026 (Phase 2) · Zielbild und Etappen. **Nichts davon ist umgesetzt.** Der Prototyp (`app/`) nutzt Rahmen (iframe) und gilt nur bis zum Gerätetest. ADR-004 (Expo als Stufe 3) bleibt langfristig gültig.

## 1. Ausgangslage (aus dem Repository)

| Produkt | Bauart | Besonderheiten |
|---|---|---|
| Discover | Einseitige App mit Hash-Routen (`#/s/US_REAL/NVDA`), 91 Skripte in `index.html` (im Release gebündelt) | Pfade absolut (`/quant/data/...`), teilt Daten mit Quant |
| Quant | Einseitige App mit Hash-Routen, 84 Skripte, im Release nach Ansicht in Pakete geteilt | UMD-Engines ohne DOM (wiederverwendbar), absolute Datenpfade |
| Technical | Einseitige App, 15 Skripte, Hash-Routen | eigenes Chart Studio (Canvas) |
| Supertrader | Mehrseitig statisch (Start, Strategien, Backtests, Signale), 3 Skripte auf der Startseite | Je-Aktie-Shards unter `supertrader/data/stock/` |
| Gemeinsame Shell | `assets/site-navigation.{js,css}` (56 KB / 18 KB): Kopfmenü und **unterer „Dock“** (`data-vu-dock`), Safe-Area-fähig | Die Web-Seite hat bereits eine mobile Bottom-Navigation |
| Wiederverwendbar ohne Änderung | UMD-Engines (`quant/engines`, `core/*`), Verträge in `core/client.js`, Formatierung (`money-format.js`), Design-Tokens `--vu-*`, `assets/vu-chart.js` | ADR-004 §3 |

Verschachtelung im Prototyp erzeugt: zwei Navigationsleisten übereinander (Shell-Tabs und Web-Dock), zwei Scrollbereiche, Tastatur und Safe Areas doppelt behandelt, getrennter Speicher (ITP), keine Deep Links in den Rahmen, keine Rückmeldung von der Seite an die App.

## 2. Zielbild

Eine App, die sich wie eine App bedient, ohne die Produktmodule neu zu schreiben:

- **Native Navigation:** Tab-Leiste (Start, Quant, Technical, Supertrader, Watchlist, Konto) und native Navigationsstapel mit Zurück-Geste. Kein Web-Kopfmenü, kein Web-Dock in der App.
- **Eine Anmeldung:** Das Token liegt in der Keychain. Produktseiten fragen es über eine Brücke ab, sie speichern es nie.
- **Deep Links:** `/stock/{ticker}` und die Routen aus `APP_READINESS.md` §4 öffnen die richtige Ansicht (Universal Links; braucht `apple-app-site-association` auf der Domain, ein Web-PR).
- **Appgerechte Bedienung:** Safe Areas, 44-px-Ziele, Pull-to-Refresh nur wo sinnvoll, Haptik für Aktionen, System-Teilen, hell/dunkel nach System.
- **Ehrlicher Offline-Zustand:** Hinweis statt alter Kurse (wie `sw.js`).

## 3. Etappen

| Etappe | Inhalt | Wiederverwendung | Aufwand (Schätzung) | Änderungen am Web |
|---|---|---|---|---|
| **A: Prototyp (jetzt)** | Shell mit Rahmen | alles | erledigt | keine |
| **B: App-Modus im Hauptfenster** | Die WebView lädt die Seiten als Hauptdokument (kein Rahmen). Die App kennzeichnet sich im User-Agent (`ios.appendUserAgent`). Die gemeinsame Shell erkennt `html[data-vu-app]`, blendet Kopfmenü aus und nutzt den **vorhandenen Dock** als Navigation oder übergibt an eine native Leiste. Brücke per `postMessage`/Capacitor-Plugin: Token anfordern, Deep Link, Teilen, Haptik. | alle Produktmodule unverändert | klein bis mittel (S/M) | kleine, getrennte PRs an `assets/site-navigation.*` mit Shell-QA; Konto-API-Aufrufe der Seiten über die Brücke |
| **C1: Native Navigation mit Web-Inhalt** | Native Tab-Leiste und Stapel (UITabBarController oder Expo Router), je Tab eine WebView mit Produkt, geteilte Brücke, Deep-Link-Router | Produktmodule als Web | mittel (M) | App-Modus aus B |
| **C2: Native Bildschirme für Kernfunktionen** | Watchlist, Aktienkopf, Signalliste nativ (React Native) mit den UMD-Engines und `/v1/`-Verträgen; Charts bleiben vorerst Web-Komponenten | Engines, Verträge, Formatierung | groß (L) | `/v1/`-API aus ADR-004 Stufe 2 |

Empfehlung: **Etappe B** nach dem Gerätetest. Sie beseitigt die Verschachtelung mit dem kleinsten Eingriff und bleibt mit Capacitor und mit Expo (WebView-Brücke) gleich. C1/C2 erst, wenn der Gerätetest zeigt, dass Web-Inhalt in der App Gesten oder Speicher nicht trägt.

### Wie Etappe B technisch geht, ohne Produktionszugang zu umgehen
1. Die WebView navigiert zu `https://research.visionuniverse.de/...` (Hauptfenster). Die **Passwortmaske bleibt** und erscheint wie im Browser. Kein Eingriff in ihren Schlüssel.
2. Die Brücke gibt das Zugriffstoken nur an Seiten der erlaubten Herkunft (`research.visionuniverse.de`) und nur auf Anfrage heraus, nie als Cookie oder Speicherwert. Das Token ist kurzlebig (1 h, Rotation).
3. Absolute Pfade (`/quant/data/...`) funktionieren, weil die Seiten von der echten Herkunft kommen. Eine **gebündelte** Variante (Seiten im App-Paket, Daten remote) bräuchte einen Pfad-Umschreiber oder eine Basis-URL je Produkt: nicht empfohlen, weil sie Produktcode in die App kopiert.
4. Risiken: Store-Richtlinie 4.2 (Mindestumfang, für den Store zu klären), Abhängigkeit von der Web-Verfügbarkeit, ITP bei Cookies der Konto-Seiten (nicht genutzt, das Konto läuft nativ).

### Was in diesem PR nicht passiert
Keine Änderung an Produktseiten, an `assets/site-navigation.*` oder an Verträgen. Die Etappen B und C brauchen je eigene PRs mit den Produkt-Gates aus CLAUDE.md.

## 4. Entscheidungskriterien nach dem Gerätetest

| Beobachtung auf dem iPhone | Folge |
|---|---|
| Hauptfenster-Variante (B) bedienbar: Gesten in Charts, Speicher, Tastatur | B ausbauen, Capacitor behalten |
| Chart-Gesten oder Zurück-Wischen kollidieren | Gesten in Seiten lösen (Produkt-PR) oder C1 |
| WebView wird bei Quant/Technical wegen Speicher neu geladen | Datenpakete verkleinern (PERFORMANCE.md) oder C2 für die Aktienseite |
| Store-Prüfung nach 4.2 wird für B als zu dünn eingeschätzt | C1/C2 und native Mehrwerte (Push, Widgets, Sperre) vor dem Store-Antrag |
