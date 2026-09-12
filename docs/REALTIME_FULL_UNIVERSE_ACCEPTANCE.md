# Intraday und Echtzeit für das gesamte Produktuniversum — Abnahmebericht

> Geschützte Vorschau. Keine öffentliche Auslieferung, kein Merge nach
> `main`, keine Änderung an GitHub Pages.

## Was sich geändert hat, in einem Satz

Intraday-Abruf und Echtzeitstrom galten für fünf freigegebene Titel;
jetzt gelten sie für jeden der 7.004 Titel des bereinigten
Produktuniversums, und die Grenze steht an genau einer Stelle.

## Die Grenze

| | |
| --- | --- |
| `PRODUCT_UNIVERSE_SOURCE` | `quant/data/market/security-master/eligibility.json` (`us-security-master-1.1.0`) |
| Projektion | `quant/data/market/realtime/product-symbols.json`, gebaut von `scripts/realtime/build-product-symbols.mjs` |
| Regel | Produktuniversum = alle Entscheidungen außer `EXCLUDED` |
| `PRODUCT_UNIVERSE_SIZE` | **7.004** (ELIGIBLE 6.477 · SEPARATE_CLASS 308 · REVIEW 219) |
| Ausgeschlossen | 799 (WARRANT 392 · UNIT 258 · RIGHT 116 · TEST_SECURITY 30 · ETF 3) |
| Gemeinsame Prüfstelle | `api/_scope.js` — beide Serverfunktionen fragen dort, nirgends sonst |

Der Eignungslauf wird in diesem Workstream **gelesen, nicht verändert**.
Die Datei ist byteidentisch mit dem Stand des Quellzweigs
(`claude/tiingo-us-equity-discovery-k5j4bc`, Blob
`e5eaea8c2afea8bfbd707d0d49a701308aa649e6`). Das Bauskript rechnet die
Zählungen gegen die Quelle nach und bricht bei Abweichung ab; die
Prüfsumme der Quelle steht im Verzeichnis.

## Zustandsvokabular

Sieben Zustände, die auseinandergehalten werden, weil sie zu
verschiedenen nächsten Schritten führen:

| Zustand | Bedeutung |
| --- | --- |
| `INTRADAY_AVAILABLE` | Bars liegen vor |
| `INTRADAY_UNAVAILABLE` | der Anbieter führt für dieses Symbol keine Intraday-Serie |
| `PROVIDER_UNAVAILABLE` | der Anbieter hat abgelehnt oder geschwiegen |
| `REALTIME_AVAILABLE` | der Titel darf Kursaktualisierungen bekommen |
| `MARKET_CLOSED` | keine Ereignisse zu erwarten — kein Fehler |
| `SYMBOL_NOT_SUPPORTED` | nicht im Produktuniversum |
| `NOT_ELIGIBLE` | vorhandenes, aber ausgeschlossenes Papier (Warrant, Unit, …) |

`INTRADAY_UNAVAILABLE` und `REALTIME_AVAILABLE` schließen einander
ausdrücklich **nicht** aus: ein frisch notierter Titel kann ohne
Tagesreihe dastehen und trotzdem gehandelt werden. Wer daraus „Echtzeit
nicht verfügbar" macht, sagt dem Nutzer etwas Falsches über seinen
Titel. `RS7` hält das fest.

## Bedarfsgesteuerte Abonnements

Es gibt **keine** stehende Verbindung für das Universum. Abonniert wird,
was gerade betrachtet wird:

* Beim Laden einer Aktienseite passiert nichts. Erst der Klick auf `1T`
  oder `5T` holt den Tagesverlauf und öffnet den Strom.
* Eine Verbindung führt höchstens vier Titel
  (`maxSymbolsPerConnection`). Was darüber hinausgeht, bekommt
  `CONNECTION_LIMIT` mit Begründung — es wird nicht stillschweigend
  weggeschnitten.
* Abbau im Browser über zehn Pfade: Zeitraumwechsel, neue Auswahl,
  `pagehide`, `visibilitychange`, Anbieterfehler, Fensterende, Neustart,
  Fehlerfall. Serverseitig über sechs: `req.on("close")`,
  `req.on("aborted")`, Fensterablauf, Socketfehler, Socketschluss,
  Anbieterabweisung.
* Nie zwei Verbindungen für denselben Titel: `stromStarten()` beendet
  zuerst die laufende.

## Was den Chart bewegt — und was nicht

Nur Abschlüsse. Quotes werden gezählt und gemeldet, damit belegt ist,
dass der Strom läuft, aber sie bekommen keinen Kurs.

Die erste Fassung hat ihnen einen gegeben: die Mitte zwischen Geld und
Brief, notfalls selbst ausgerechnet. Zu diesem Kurs hat niemand
gehandelt — er ist errechnet, nicht beobachtet. Er wäre in dieselbe
Kerze geflossen wie echte Abschlüsse, und hinterher hätte das niemand
mehr auseinandersortiert. `RS8b` misst das an der Wirkung: zwei Quotes
und ein Abschluss ergeben genau ein Kursereignis.

## Kursbezeichnung

Der Anbieter nennt die Kursart nicht (`priceType` bleibt
`UNSPECIFIED`). Deshalb steht nirgends *Last Trade*, *offizieller
letzter Handel*, *Bid*, *Ask*, *Mid* oder *NBBO*. Die Oberfläche
schreibt **Kursaktualisierung**; jede Nachricht trägt
`priceTypeConfirmed: false`.

## Darstellung

Tagesverlauf und Kursaktualisierungen laufen in den **bestehenden**
Chart und die **bestehende** Zeitraumleiste. Keine zweite Fläche, keine
neue Seite, kein Debug-Chart. Die Achse zeigt absolute Kurse in Dollar —
keine ±-Delta-Skala. Der letzte Punkt trägt den gemeldeten Kurs; es wird
nichts zwischen zwei Kurse gerechnet.

## Bekannte Anbieter- und Tarifgrenzen

Siehe `docs/VU2_OWNER_PREVIEW.md`, Abschnitt *Bekannte Anbieter- und
Tarifgrenzen*: `thresholdLevel` wird vom Tarif abgelehnt (Code 400, bei
Stufe 5 wie bei Stufe 0 — der Parameter wird deshalb gar nicht mehr
gesendet), die Kursart bleibt unbestätigt, nicht jeder Titel hat eine
Intraday-Reihe, Vercel friert Umgebungsvariablen beim Bauen ein, und der
Strom läuft in einem Fenster statt endlos.
