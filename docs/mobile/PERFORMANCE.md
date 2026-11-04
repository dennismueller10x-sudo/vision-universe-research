# Mobile Performance: Messung gegen den gebauten Release, Maßnahmen

**Stand:** 03.11.2026 (Phase 2) · Werkzeug: `app/scripts/measure-payload.mjs [--root <Release>] [--slow]`
Chromium, iPhone-Viewport 390×844, gzip wie GitHub Pages. Nicht WKWebView, nicht auf dem Gerät [offen].

## Korrektur an Phase 1

Der Phase-1-Bericht nannte `factors-FULL_UNIVERSE.json` (19,1 MB entpackt) als größten Befund der Quant-Aktienseite. Das war eine **Fehlmessung**: Ich habe den **Quelltext** des Repositorys ausgeliefert. Produktion liefert den **gebauten Release** aus, und dieser erzeugt die Faktor-Shards selbst (`scripts/vu2/build-release.mjs`, nicht committet):

- `quant/api/product-services.js` (`factorsFor`) lädt zuerst `/quant/data/market/factors/product-shards/<shardKey>.json`. Nur ohne Shard fällt es auf `factors-FULL_UNIVERSE-product.json` und zuletzt auf die volle Datei zurück.
- Im Quelltext gibt es diese Shards nicht (Ordner fehlt, 404). Deshalb lud meine Messung die 19 MB.
- Auch die Technical-Signale sind im Release feiner geteilt (`technical-signals-v1/by-ticker/NVDA.json.gz`, 55 KB statt des 741-KB-Buckets `NV`).

Konsequenz: Phase 1 hat Quant-Aktie um etwa das Dreifache (Übertragung) bzw. Siebenfache (entpackt) überschätzt. Die Messung unten gilt für den gebauten Release.

## Messung (gebauter Release, lokal ohne Drosselung)

| Bereich | Anfragen | Wire | Dekodiert | JSON | JS-Heap | 404 |
|---|---:|---:|---:|---|---:|---:|
| Discover Start | 127 | 1,15 MB | 3,7 MB | 17 / 229 KB | 6,5 MB | 0 |
| Discover Aktie (NVDA) | 119 | 1,26 MB | 5,0 MB | 18 / 649 KB | 7,7 MB | 0 |
| Quant Start | 25 | 0,76 MB | 2,1 MB | 4 / 54 KB | 5,5 MB | 0 |
| **Quant Aktie (NVDA)** | **47** | **1,07 MB** | **3,6 MB** | 23 / 195 KB | **10,8 MB** | 0 |
| Technical | 25 | 0,22 MB | 0,68 MB | 2 / 60 KB | 2,2 MB | 0 |
| Supertrader | 20 | 0,61 MB | 5,1 MB | 8 / 449 KB | 7,1 MB | 0 |
| Konto (Web) | 16 | 0,10 MB | 0,30 MB | 0 | 2,0 MB | 0 |

Gedrosselt (1,6 Mbit/s, 150 ms Latenz), gebauter Release:

| Bereich | Anfragen | Wire | Zeit bis ruhig | JS-Heap |
|---|---:|---:|---:|---:|
| Discover Start | 126 | 1.12 MB | 24.3 s* | 6 MB |
| Discover Aktie | 119 | 1.23 MB | 8.8 s | 7.8 MB |
| Quant Start | 24 | 0.74 MB | 5.3 s | 5 MB |
| Quant Aktie | 47 | 1.05 MB | 7.2 s | 9.1 MB |
| Technical | 25 | 0.22 MB | 2.2 s | 2.2 MB |
| Supertrader | 20 | 0.59 MB | 4.4 s | 7.1 MB |
| Konto (Web) | 16 | 0.10 MB | 2.4 s | 2 MB |

\* Discover Start erreicht in 20 s keinen ruhigen Netzzustand (Maß ist die Wartegrenze, kein Ladeende). Quant Aktie braucht im Release 7,2 s statt 21,8 s im Quelltext (Phase 1).
Zeit bis ruhig ist nicht „bedienbar“; auf dem Gerät zu messen [offen].

Quelltext-Messung (Phase 1) bleibt als Vergleich für die Frage „was passiert ohne Shards“: Quant Aktie 3,55 MB Wire, 25,7 MB entpackt.

## Rangliste der tatsächlichen Probleme (Release)

| # | Bereich | Befund | Maßnahme (eigener Produkt-PR, hier nicht umgesetzt) | Erwarteter Effekt |
|---|---|---|---|---|
| 1 | Supertrader | `supertrader/data/signals-core.json`: 336 KB Wire, **4,2 MB entpackt** beim Start. Parsen und Heap auf dem Telefon. | Startseite aus einem kleinen Index (Zähler, Kopfzeilen); Details je Aktie aus den vorhandenen Shards unter `supertrader/data/stock/`; Feldliste je Ansicht wie bei der Quant-Projektion | entpackt unter 1 MB |
| 2 | Discover Start | 127 Anfragen, 91 Skripte in der Seite; erreicht in 20 s keinen ruhigen Netzzustand. Zwei Themenbilder 86–105 KB. | Skripte bündeln (wie `release-bundle.js` bei Quant); Bilder verzögert laden und kleiner (≤ 40 KB); Ursache des Dauerverkehrs klären (Live-Abruf/Polling) | Anfragen < 40; „ruhig“ nach wenigen Sekunden |
| 3 | Discover Aktie | `discover/logos/credits.json` 324 KB Wire, 1,7 MB entpackt, für eine Aktie | Nachweise nur bei Bedarf laden oder je Wertpapier teilen | −1,7 MB entpackt |
| 4 | Discover Aktie | `quant/data/technical/instruments/NVDA.json` 112 KB / 547 KB | Nur bei geöffnetem Chartbild laden, Zeitraum begrenzen | −0,5 MB beim Start |
| 5 | Alle | `quant/data/market/intraday/index.json` 47 KB / 473 KB auf jeder Seite | Nur die gebrauchten Tickers (Index je Shard) | −0,4 MB entpackt |
| 6 | Quant Aktie | `release-bundle.js` 365 KB Wire / 1,2 MB entpackt + `pack-stock.js` 161 KB / 568 KB | Ist bereits nach Ansicht geteilt (Pakete); weiteres Aufteilen nur bei Gerätemessung | gering |
| 7 | Quelltext/Entwicklung | Ohne Release-Build lädt die Quant-Aktie die volle 19-MB-Datei. Nur lokal relevant. | Entwicklungsserver mit Release-Projektion, oder die App immer gegen einen Release testen | nur Entwicklung |

Die `factors-FULL_UNIVERSE.json` selbst bleibt als Quelle der Shards unverändert. Für die **App** gilt: Sie lädt dieselben Release-Dateien wie die Webseite. Es gibt **keine** zweite Datenform.

## Bedarfsgerechtes Nachladen: Entwurf für die App (nicht umgesetzt)

1. **Auf dem Gerät messen vor weiterer Arbeit.** Die Zahlen oben sind Chromium. Erst Zeit bis „bedienbar“ (Interaction to first paint) und Speicher in Instruments auf einem iPhone mit Mobilfunk messen. Danach Rang 1 bis 3 gezielt angehen.
2. **Je Ansicht eine Datenzusage:** Jede Produktansicht nennt ihre Dateien und ein Byte-Budget (wie das bestehende Discover-Budget in `scripts/discover/browser-qa.mjs`). Ein Gate je Produkt, nicht in diesem PR.
3. **Listen mit Index, Detail mit Shard:** Muster ist bereits vorhanden (Faktoren, Technical je Ticker, Supertrader `stock/`). Übertragen auf Supertrader-Start und Discover-Nachweise.
4. **HTTP-Cache für die App:** GitHub Pages sendet `cache-control: max-age=600`. Für die App reicht das nicht als Offline-Ersatz. Ein Cache für **Marktdaten** wäre fachlich falsch (veraltete Kurse), siehe `sw.js`. Offline bleibt deshalb ein Hinweis, kein Datenstand.
5. **Prefetch nur im WLAN** (Network-Plugin liefert Verbindungsart), nie für Marktdaten.
