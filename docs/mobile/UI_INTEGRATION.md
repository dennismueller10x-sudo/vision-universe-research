# Mobile Oberfläche: Weg von verschachtelten Rahmen zur App-Navigation

**Stand:** 03.11.2026 (Phase 2) · Zielbild und Etappen. **Etappe B/C bleibt Zielbild; die app-aktive Gesten-Ergänzung E3 ist unten beschrieben.** Der Prototyp (`app/`) nutzt Rahmen (iframe) und gilt nur bis zum Gerätetest. ADR-004 (Expo als Stufe 3) bleibt langfristig gültig.

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

## E3: gemeinsame Gesten-Ergänzung (06.11.2026)

`assets/vu-gestures.js` (UMD, Pointer Events, ohne Bibliothek) ergänzt die bestehenden C16-Sheets und öffnet Detailklappen auf Aktienseiten als ziehbare Sheets. Die bestehende iframe-Hülle bleibt bestehen. Aktivierung, Android-Brücke und Testaufruf: [app/README.md](../../app/README.md#app-gesten-e3). Gestaltung folgt C16 aus Redesign 2027, ohne Änderungen an Texten, Daten oder Fachmodellen.

Rand: 20 px, Richtungsentscheidung ab 8 px, Zurück ab 35 % Breite. Sheet: 70 % Höhe, Vollbild per Aufwärtszug ab 12 % Bildschirmhöhe, Schließen ab 22 % abwärts; Abbruch behält die vorherige Höhe. Reduced Motion entfernt Einflug und Nachlauf. Chart-/Tabellenflächen außerhalb des Randes erhalten keine Pointer-Handler. Original-Detailknoten werden versetzt und beim Schließen zurückgesetzt, nicht kopiert. Beim direkten Einstieg ohne nutzbare Vorgeschichte führt Zurück zum Produkteinstieg; eine je Produkt gespeicherte Historien-Untergrenze verhindert den Rücksprung eines Rahmens nach `about:blank`.

Nachweise und Prüfstand stehen im E3-PR; [Quant hell](e3-gestures/quant-light.gif) und [Supertrader dunkel](e3-gestures/supertrader-dark.gif) zeigen Inline-Ansicht → Sheet → Vollbild → Randgeste. Keine Store-/Pages-Veröffentlichung, keine neuen Workflows oder Schlüssel. Ein echter Gerätetest bleibt erforderlich.

Prüfstand: 76 fokussierte Node-Tests grün (App inklusive Gestenlogik, gemeinsame Navigation, UI-Byte-Sperre). Chromium-Touch-QA auf beiden NVDA-Routen bei 390 × 844, jeweils hell/dunkel: Schwellen, Abbruch, Reduced Motion, Vollbild, Schließen, Methodenseiten und feste Zurück-Taste bestanden; axe-Kontrast jeweils 0 Befunde. Discover: 120.063 Byte / 6 Requests (Budget 180.000 / 12), im Browser ohne Opt-in 0 Gesten-Requests. Ergebnisse: [results.json](e3-gestures/results.json). Herkunftsgeprüfte iframe-Brücke separat mit simuliertem Capacitor-App-Plugin bestanden; kein Gerätetest. Produktionsisolation: keine Datei verändert. Core: 378 bestanden, 3 übersprungen, 1 vorhandener Generatorfehler; die Ausgabe bleibt mit dem ursprünglichen und dem ergänzten VUUI bytegleich. Python: 585 bestanden, 5 vorhandene Bestandsabweichungen im kanonischen Markt. Diese Daten und Fachmodelle sind unverändert.

## E5: Performance und Qualität der Web-Seiten (07.11.2026)

Die Web-Seiten nutzen die vorhandenen Redesign-2027-Bausteine auch während des
Ladens: reservierter Aktienkopf, formgleiche Skeletons und stabile Inhaltsflächen.
Intent-Vorladen lädt wenige bestehende Daten-Shards bei Pointerdown/Fokus bzw.
verzögertem Hover; Save-Data schaltet es ab. Ausstehende Anfragen werden geteilt,
ein späterer echter Detailaufruf prüft seine Daten neu. View Transitions fassen
den tatsächlichen Ansichtswechsel ein; Reduced Motion unterdrückt die Bewegung.

Im Quant-Release erscheint der kanonisch projizierte Kopf vor dem großen Router.
Der Router übernimmt dieselben Kopf-/Frageknoten; die vollständige Seite bleibt
maßgeblich. Der Erzeuger liest die bestehenden Service-/VM-/Identitätsregeln,
verwirft nicht verfügbare/nicht erlaubte Werte und erzeugt kleine Release-Shards.
Keine zweite Kurswahrheit. Technical zeigt den vorhandenen Instrument-Schluss
vor dem Laden der Analyse-Engines. Supertrader-Start liest eine kleine Projektion
der unveränderten Kopf-/Zählerfelder statt die ganze Signals-Datei zu parsen.

Gemeinsame Bedienelemente haben mindestens 44 × 44 px; `touch-action:
manipulation` verhindert Doppeltipp-Zoom und erhält Pinch-Zoom. Vorzeichen-Pillen
tragen Pfeil, Zahl und ausgesprochene Plus-/Minus-Beschriftungen mit Einheit.
Natürliche Link-/Tab-Namen enthalten den sichtbaren Text; ergänzende Erklärungen
bleiben für Screenreader verfügbar. Die Perspektivenleiste aktualisiert ihre
Attribute, ohne fokussierte Links oder geladene SVG-Knoten zu ersetzen.

Abschluss-QA: elf Routen hell/dunkel plus Analysten-Dialoge, 24 Ansichten bei
390 × 844: null axe-Kontrastverstöße, null beanstandete geprüfte Tippflächen,
keine Seitenfehler/Überbreite, feste Kopfposition, sichtbare Tab-Stopps und
Dialog-Fokusfalle/Escape/Fokusrückgabe bestanden. Axe meldet zusätzlich
`incomplete` bei Symbolen, Bildern, Pseudoinhalt und teils überdeckten Elementen;
diese bleiben im Bericht und sind keine vollständige manuelle Kontrast- oder
Screenreader-Abnahme. Discover: 129.698 decoded Bytes / sieben Budget-Requests
(maximal 180.000 / zwölf). Separat bestandener Quant-Smoke: 46 Ressourcen (ohne Hauptdokument) /
3.061.032 decoded Bytes auf NVDA, innerhalb des unveränderten Budgets.

Ein echter Service Worker bestätigt Offline-Hinweis, gecachtes NVDA-Logo und
verweigerte neue Marktdatenabrufe. Kalte LCP-Messungen blockieren den SW bewusst
und behaupten deshalb keinen Warm-Cache-Gewinn. Früher Kopf bei blockiertem
Router, Knotenübernahme, erneute Navigation sowie Technical-Kurs bei blockierten
Engines wurden separat im Browser geprüft. Messwerte, Zielabweichungen und
Rohdaten: [PERFORMANCE.md](PERFORMANCE.md), [QA](e5/final/quality.json),
[früher Kopf](e5/final/early-head.json), [Quant-Smoke](e5/final/quant-smoke.json).
Kein Gerätetest; keine Änderung an der App-Hülle oder am Account-Worker.

Zusätzliche Produkt-QA: Technical 72/72, Discover 212/212, Supertrader 62 Seitenaufrufe ohne Fehler, Fundamental-Vergleich (Chromium) 124 Prüfungen ohne Befund. Der Vergleich behält seine bestehenden 38 px hohen Schalter und deren 46 px große Tippflächen.
