# Willkommensseite und Erklärserie

Stand 2026-10-26. Die Willkommensseite `/willkommen/` ist die erste Seite nach der Anmeldung und steht vor allen Produktwelten. Sie gehört zu keinem Produkt (nicht Discover, nicht die Marketing-Startseite `/`).

Aufbau von oben nach unten:

1. **Gruß** nach Tageszeit und eine Zeile Einführung.
2. **Highlights**: runde Cover mit Erklärvideos, wie Instagram-Highlights. Bewusst abgewandelte Namen und Cover (Start, Entdecken, Quant, Zahlen, Strategien), nicht die eckigen Produkt-Icons der Welten.
3. **Deine Produkte**: alle Module als Knöpfe (Handy: kleine App-Icons, Desktop: Karten mit einer Zeile Text).
4. **Neu bei Vision Universe**: Neuigkeiten aus dem Team, angeheftete zuerst, sonst neueste zuerst; ab der fünften eingeklappt.

## Dateien

| Teil | Datei |
|---|---|
| Seite | `willkommen/index.html`, `willkommen/app.css`, `willkommen/app.js` |
| Highlights (Reihenfolge, Folien, Fassung) | `willkommen/config/stories.json` |
| Neuigkeiten | `willkommen/config/news.json` |
| Produktliste | `willkommen/app.js`, `PRODUCTS` |
| Prüfung | `willkommen/tests/willkommen.test.mjs`, Workflow `willkommen-ci.yml` |

Bedienung der Highlights: rechts tippen weiter, links zurück, gedrückt halten pausiert, nach unten wischen oder `Esc` schließt, Pfeiltasten am Desktop. Nach der letzten Folie läuft das nächste Highlight. Ein gesehenes Cover wird grau (im Browser gemerkt je `id` und `rev`). Bei `rev + 1` leuchtet es wieder.

Folien: `video` (`src`, `poster`, `duration`) oder `card` (Überschrift, Text, optional Knopf zu einer Produktseite). Bis die gesprochenen Videos fertig sind, erklären Karten-Folien jedes Modul. „Start" spielt seit 26.10.2026 den Film „THE ARRIVAL" (siehe unten). Dauer je Highlight: 15 bis 45 s, Ziel 30 s; der Test lässt außerhalb nichts durch.

## Neuigkeit eintragen

Eintrag oben in `willkommen/config/news.json`: `id` (eindeutig), `date` (`JJJJ-MM-TT`), `tag` (Produkt oder Thema), `title`, `text` (ein bis drei Sätze), optional `link` mit interner Adresse, optional `pinned: true`. Danach `node --test "willkommen/tests/*.test.mjs"`. Keine Kursziele, keine Anlageberatung.

## Neues Video einsetzen

1. Video mit der Reel-Pipeline bauen (`studio/reels/`), 1080 × 1920, H.264, −14,2 LUFS. Für die App eine kleinere Fassung erzeugen (720 × 1280, etwa 2 bis 5 MB, `+faststart`), Posterbild aus dem ersten Bild.
2. Ablegen unter `assets/stories/<id>.mp4` und `assets/stories/<id>.jpg`.
3. In `stories.json` die Karten-Folien durch eine `video`-Folie ersetzen (eine Karte mit Knopf zum Modul darf dahinter bleiben), `rev` erhöhen.
4. `node --test "willkommen/tests/*.test.mjs"`.

Neues Highlight: Eintrag in `stories.json` (Titel höchstens 12 Zeichen, Icon aus `assets/product-icons.svg`).

## Offen

- Weiterleitung nach der Anmeldung: Heute führt die Zugangsmaske (`scripts/access-gate/`) auf die angefragte Seite oder `/`. Sobald es Konten gibt, zeigt der Login auf `/willkommen/` (eigene Änderung im Bereich Zugang, nicht in diesem PR).
- Eintrag „Start" im globalen Menü (`assets/site-navigation.js`), eigene Änderung.

## Highlight „Start": THE ARRIVAL

Quelle: Dropbox des Owners, `/THE ARRIVAL – Original.mp4` (1080 × 1920, 20 s, Musik ohne Sprache, eigenes Material des Owners). Für die App:

- Vier Texteinblendungen in Marke und Schrift (lokal gerendert, keine Kosten): „Willkommen bei Vision Universe." (0,3 s), „Echte Daten. Statt Bauchgefühl." (4,8 s), „Aktien. Zahlen. Charts. Strategien. Alles an einem Ort, alles verbunden." (9,4 s), Logo mit „Investieren mit Weitblick." und „Tippe auf den nächsten Kreis und lerne jedes Modul kennen." (14,6 s bis Ende).
- 720 × 1280, H.264 CRF 24, `+faststart`, Ton −16 LUFS (App, leiser als Reels mit −14,2), AAC 128 kb/s, etwa 3 MB: `assets/stories/willkommen.mp4`, Poster `willkommen.jpg` (Bild bei 1,2 s).
- Danach folgt die Karte „Ein Kreis, ein Modul." (7 s), zusammen 27 s.

Sprache in allen Texten: keine Einschränkung auf US-Aktien (Entscheidung des Owners 26.10.2026), damit später europäische oder deutsche Aktien ohne neue Videos dazukommen können. Konkrete Mengen nur, wenn sie für alle Märkte stimmen.

## Unterschiede zu Instagram-Reels

Es gelten die Regeln aus [README.md](README.md) mit drei Abweichungen, weil die Zuschauer schon in der App sind:

- Kein Schluss „App bald verfügbar". Der Schluss führt zum nächsten Highlight oder zum Modul.
- Der Hook muss nicht Fremde stoppen, sondern in zwei Sekunden sagen, welches Problem das Modul löst.
- Keine Musik nötig. Ton startet nach dem Tipp (der Tipp ist die Nutzergeste, Autoplay mit Ton ist erlaubt); Untertitel wortgenau im Bild, weil viele ohne Ton schauen.

Gleich bleibt: Fakten aus eigenen Daten geprüft, „Modell, keine Prognose", keine Anlageberatung, Helmut als Stimme, Marke (`#08080a`, `#f4f5f1`, Lime `#c8f531`, Inter), kein Kleingedrucktes.

## Reihenfolge und Sprechertexte (Entwurf, Owner prüft)

Helmut spricht nach `tighten.py` rund 2,4 Wörter je Sekunde. 70 Wörter ergeben etwa 30 s. In der TTS-Fassung „Vision Universe" als `Wischn Juniwörs` schreiben, Zahlen ausschreiben.

Geprüfte Zahlen (Stand 24.10.2026): 6.125 US-Aktien im Discover-Universum (`discover/data/meta.json`, `securities`), über 60 Kennzahlen je Unternehmen aus SEC-Meldungen (Fundamental), Supertrader-Methoden u. a. Minervini VCP, CAN SLIM, Darvas, Weinstein (`supertrader/strategies/`).

### 1 Willkommen (etwa 30 s, 72 Wörter)

> Willkommen bei Vision Universe. Hier verstehst du Aktien mit echten Daten statt Bauchgefühl.
> Über sechstausend Aktien, Zahlen direkt aus den Pflichtmeldungen der Unternehmen, Chartbild, Faktoren und Strategien. Alles an einem Ort, alles miteinander verbunden.
> Ein Tipp auf eine Aktie, und du siehst jede Perspektive. Und deine Altersvorsorge planst du gleich mit.
> Wir zeigen Modelle, keine Anlageberatung.
> Tippe auf den nächsten Kreis und lerne jedes Modul in dreißig Sekunden kennen.

Bilder: Logo bei t = 0 mit Großsatz „Echte Daten statt Bauchgefühl", Zähler auf 6.125, vier Modul-Icons verbinden sich zu einem Netz, Handy-Mock-up (ILLUSTRATION), Endkarte „Weiter →" mit Kreisen.

### 2 Discover (etwa 28 s)

> Du weißt nicht, wo du anfangen sollst? Dann fang hier an.
> Discover zeigt dir den Markt zum Durchwischen: Rankings, Themenwelten wie Künstliche Intelligenz, Halbleiter oder Robotik und ein Aktien-Feed.
> Jede Karte zeigt Kursverlauf und das Wichtigste auf einen Blick.
> Ein Tipp, und du landest bei der ganzen Analyse: Zahlen, Chartbild, Faktoren, Setups.
> Oben suchst du jede Aktie direkt nach Namen oder Kürzel.

### 3 Quant (etwa 30 s)

> Was spricht für eine Aktie, und was dagegen? Quant beantwortet das mit festen Regeln.
> Jede Aktie wird nach denselben Faktoren eingeordnet: Trend, Stärke, Bewertung, Qualität.
> Du siehst, was dafür spricht, was dagegen und was sich zuletzt verändert hat.
> Und Quant sucht frühere Fälle, die ähnlich aussahen, und zeigt, wie sie ausgingen.
> Das ist ein Modell, keine Prognose. Aber eines, das du bis zu den Rohdaten nachprüfen kannst.

(Faktorliste vor der Produktion gegen `quant/` prüfen.)

### 4 Fundamental (etwa 30 s)

> Verdient dieses Unternehmen wirklich Geld? Fundamental zeigt es dir in Zahlen.
> Über sechzig Kennzahlen: Umsatz, Gewinn, Margen, Cashflow, Schulden und Bewertung, jährlich und quartalsweise.
> Die Werte kommen direkt aus den Pflichtmeldungen der Unternehmen, mit Quelle zu jedem Wert.
> Und weil eine Zahl allein wenig sagt, steht jede im Vergleich zur eigenen Branche.

Beweis im Bild: NVIDIA-Umsatz 2015 bis 2026 als Balken (gleiche Daten wie Startseite, aus SEC-Meldungen).

### 5 Supertrader (etwa 32 s)

> Was, wenn du die Regeln der bekanntesten Trader einfach prüfen könntest?
> Supertrader setzt Methoden wie Minervini, Darvas oder Weinstein als feste Regeln um. Kein Interpretieren, kein Bauchgefühl.
> Für jede Methode siehst du einen ehrlichen Backtest, mit Gewinnern und Verlierern.
> Und jeden Tag zeigt dir Supertrader, welche Aktien die Regeln gerade erfüllen.
> Das sind Modell-Signale, keine Anlageberatung.

Das frühere Minervini-Reel kann als Bildquelle für die VCP-Szene dienen, nicht als ganzes Video (andere Länge und Schluss).

Später: Technik, Elliott Wave, Screener, Vorsorge, AI Atlas, je ein Kreis.

## Kosten und Ablauf

Je Video eine Stimme (HeyGen, Helmut, `eleven_v3`, etwa 0,05 bis 0,1 USD bei 30 s), Rest lokal (HyperFrames-Stil-Komposition, Chromium, FFmpeg). Fünf Videos etwa 0,5 USD. Jeder Stimmenaufruf nur nach Freigabe des Owners (Regel 6). Guthaben am 26.10.2026: 13,33 USD.

Reihenfolge: Willkommen zuerst, dann Discover, Quant, Fundamental, Supertrader. Jedes Video geht als MP4 an den Owner zur Freigabe, bevor es in `assets/stories/` landet.
