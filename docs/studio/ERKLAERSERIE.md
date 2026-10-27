# Willkommensseite und Erklärserie

Stand 2026-10-26. Die Willkommensseite `/willkommen/` ist die erste Seite nach der Anmeldung und steht vor allen Produktwelten. Sie gehört zu keinem Produkt (nicht Discover, nicht die Marketing-Startseite `/`).

Aufbau von oben nach unten (Entwurf des Owners vom 26.10.2026). **Auf dem iPhone passt alles in einen Bildschirm, ohne Scrollen:** die Seite ist so hoch wie der sichtbare Bereich unter der Kopfleiste; Kreise, Icons und Überschrift skalieren mit der Höhe, der Text der Meldung bekommt so viele Zeilen, wie Platz ist.

1. **Gruß** nach Tageszeit, Titel, eine Zeile, Weltkugel rechts.
2. **Erklärvideos**: Karte mit runden Covern (Bild der Produktwelt oder Icon, Feld `cover` in `stories.json`), Play-Zeichen, „Alle ansehen" spielt ab dem ersten neuen Video, Pfeil blättert weiter.
3. **Deine Produkte**: zwei Reihen zu fünf Kacheln (Icon, Name, kurze Zeile). „Alle Produkte" öffnet das globale Menü mit allen Welten.
4. **Neu bei Vision Universe**: die erste Meldung (angeheftet oder neueste) mit Illustration; „Alle Neuigkeiten" zeigt die Liste.

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

## Neues Video einsetzen oder ändern

Ablauf, Benennung (`<id>-v<version>`) und Speicher: [studio/stories/README.md](../../studio/stories/README.md). Kurz: Quelle bleibt in der Dropbox, Rezept mit den Einblendungen liegt unter `studio/stories/<id>/story.json`, `build-story.mjs --apply` baut die App-Fassung nach `assets/stories/` und trägt sie im Highlight ein. Kommt ein Modul dazu, Text im Rezept ändern, `version` erhöhen, neu bauen.

## Offen

- Weiterleitung nach der Anmeldung: Heute führt die Zugangsmaske (`scripts/access-gate/`) auf die angefragte Seite oder `/`. Sobald es Konten gibt, zeigt der Login auf `/willkommen/` (eigene Änderung im Bereich Zugang, nicht in diesem PR).
- Eintrag „Start" im globalen Menü (`assets/site-navigation.js`), eigene Änderung.

## Highlight „Start": THE ARRIVAL mit Helmut

Quelle: Dropbox des Owners, `/THE ARRIVAL – Original.mp4` (1080 × 1920, 20 s, Musik ohne Sprache, eigenes Material des Owners). Aktuell `assets/stories/start-v2.mp4` (Rezept `studio/stories/start/story.json`):

- Sprecher Helmut (HeyGen, ElevenLabs `eleven_v3`), 17,3 s nach `tighten.py`, ab 0,6 s; Aufnahme `studio/stories/start/voice-v2.m4a`, Kosten 0,05 USD. Text: „Willkommen bei Vision Universe. Hier verstehst du Aktien mit echten Daten statt Bauchgefühl. Zahlen, Charts, Faktoren und Strategien. Alles an einem Ort, alles miteinander verbunden. Investieren mit Weitblick. Tippe auf den nächsten Kreis und lerne jedes Modul in dreißig Sekunden kennen."
- Filmton als Musikbett, unter der Stimme abgesenkt (Ducking), Mischung −16 LUFS.
- Fünf Texteinblendungen auf den Wortzeiten der Stimme.
- `start-v1` (ohne Stimme) wurde ersetzt: **Regel des Owners (26.10.2026): Erklärvideos haben immer einen Sprecher.**

Sprache in allen Texten: keine Einschränkung auf US-Aktien (Entscheidung des Owners 26.10.2026), damit später europäische oder deutsche Aktien ohne neue Videos dazukommen können. Konkrete Mengen nur, wenn sie für alle Märkte stimmen.

## Stand der Highlights (26.10.2026)

Elf Erklärvideos im Motion-Graphics-Stil (Baukasten `studio/stories/kit/`), alle mit Helmut, Musik und Effekten, 24 bis 32 s, danach eine Karte mit Knopf ins Modul:

| Kreis | Modul | Datei |
|---|---|---|
| Start | Vision Universe (mit THE ARRIVAL) | `start-v3.mp4` |
| Entdecken | Discover | `discover-v1.mp4` |
| Quant | Quant | `quant-v1.mp4` |
| Zahlen | Fundamental | `fundamental-v1.mp4` |
| Strategie | Supertrader | `supertrader-v1.mp4` |
| Charts | Technical | `technical-v1.mp4` |
| Wellen | Elliott | `elliott-v1.mp4` |
| Filter | Screener | `screener-v1.mp4` |
| Vorsorge | Vorsorge | `vorsorge-v1.mp4` |
| Investoren | Hedgefonds | `hedgefonds-v1.mp4` |
| AI Atlas | AI Atlas | `atlas-v1.mp4` |

Grafiken zeigen Platzhalter („Aktie A") und keine echten Kurse oder Zielwerte; Investoren als Initialen, keine Fotos. Kosten der Stimmen: 0,78 USD für alle elf.

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
