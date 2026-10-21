# Werbetrailer 2 („THE ARRIVAL", App-Version)

Stand 2026-10-21. Dokumentation des zweiten Werbetrailers für Vision Universe. Er entstand in einer **eigenen Claude-Code-Sitzung** („Vision Universe Werbtrailer", 20. bis 21.10.2026) und ist **unabhängig vom Reel-Studio** unter `docs/studio/`. Beide Dokumentationen sind bewusst getrennt.

Quelle dieser Datei: der Verlauf der Sitzung (Nutzernachrichten und Endantworten), lesend ausgewertet. **Nicht enthalten sind die Skripte und Dateien dieser Sitzung**, sie lagen nur im Arbeitsordner der Sitzung (nicht im Repo, nicht in Dropbox). Wer den Trailer neu bauen will, nutzt diese Beschreibung als Pflichtenheft.

## Ziel und Material

- Zweiter Werbetrailer, 9:16 für Reels und TikTok, 35 s, 1080 × 1920, 30 fps, −14 LUFS.
- Ausgangsvideo (Dropbox des Owners): „VISION UNIVERSE – THE ARRIVAL Trailer 2 WAN 3 Original.mp4". Im Repo liegt nur das Standbild `brand-media/higgsfield/references/the-arrival-final-master.jpg`.
- Stimme: „Helmut – German Epic Trailer Voice" (ElevenLabs-Stimme, in HeyGen verknüpft).
- Musik: „System Collapse – Dark Hybrid Trailer" (Song `system_collapse` aus Dropbox, derselbe wie im ersten Trailer), verwendet ab 2:04 (Spannungsaufbau bis zum Drop), unter der Stimme automatisch abgesenkt.
- Motion Graphics im HyperFrames-Stil (HTML-Animationen, lokal gerendert), Handy-Mockup mit Bildschirmaufnahmen der App aus der lokal gestarteten Repo-Seite (die Live-Seite `research.visionuniverse.de` ist passwortgeschützt).
- Erster Trailer (Musikquelle): https://www.instagram.com/reel/DemaHzFKK_q/

## Sprechertext (final)

„Eine neue Ära der Marktanalyse. Tausende Aktien. Ein Universum an Daten. Quant-Scores, Signale, Trends – in Echtzeit. [Jede Aktie. Jeden Tag. Analysiert. Bewertet. Erklärt.] Vision Universe. Die App, die Märkte sichtbar macht. Bald verfügbar."

Der Satz „Sie sind angekommen" wurde auf Wunsch des Owners weggelassen. „Die App" wird nur einmal gesprochen. Am Schluss spricht Helmut nur „Bald verfügbar.", im Bild steht „Die App – Bald verfügbar" mit `visionuniverse.de` (nicht `research.visionuniverse.de`).

## Aufbau der Endfassung (v5)

| Zeit | Inhalt |
|---|---|
| 0 bis etwa 20 s | Bilder aus „THE ARRIVAL" (leicht verlangsamt, farblich angepasst), Kamera-Rahmen, Zeitcode, „● LIVE". Jede gesprochene Zeile erscheint als Schrift auf das Wort. „Eine neue Ära der Marktanalyse" beginnt bei 1,2 s. Animationen: Zähler bis 6.000+ und Ticker-Laufband bei „Tausende Aktien", Datennetz, Score-Ring, Signal-Karten, Trend-Chart. Mittelmodul: Raster aus 30 Aktien-Kacheln, die bei „Jede Aktie / Jeden Tag / Analysiert / Bewertet / Erklärt" aufbauen, scannen, zählen, einfärben und eine Beispielkarte zeigen |
| 20 bis 22 s | Kurze Stille im Song, „Vision Universe" gesprochen, Logo blendet langsam ein |
| 22 s | Drop: Logo mit Weißblitz, Druckwelle und Farbversatz |
| 22,7 bis 29,4 s | App im Handy-Mockup. Nur die Startseiten (Hero-Bereiche) von **Quant, Discover, SuperTrader, Screener, Hedgefonds, Vorsorge**, je etwa 1,1 s, mit seitlichem Wechsel und Label „01 / 06 · QUANT" usw. |
| 29 bis 35 s | Endkarte mit Logo, „Die App – Bald verfügbar", `visionuniverse.de` in Lime |

Die sechs Hero-Aussagen im Handy: Quant „Jeden Tag sehen, was sich verändert." · Discover „Sieh den Markt mit anderen Augen." · SuperTrader „Methoden. Setups. Klare Regeln." · Screener „Finde genau die Aktien, die zu dir passen." (5.632 Aktien im Universum) · Hedgefonds „Große Investoren. Klare Einblicke." · Vorsorge „Was wird aus deiner Rente?"

## Fassungen

| Version | Änderung |
|---|---|
| v1 | Erste Fassung mit Live-Screens (Startseite, Quant, SuperTrader, Discover) |
| v2 | Start früher, `visionuniverse.de`, Schluss „Die App – Bald verfügbar", „Desktop & Smartphone" entfernt, kein „Jetzt entdecken" |
| v3 | Gesprochen nur noch „Bald verfügbar", neues Mittelmodul (30 Aktien-Kacheln) gegen Leerlauf, „Trailer 02" entfernt |
| v4 | Bewegte Bildschirmaufnahmen im Handy (Discover-Wischen, NVIDIA-Chart mit Zeitraumwechsel, Elliott-Analyse, Quant-Zahlen) mit Finger-Tipps und Chips |
| **v5** | Nur noch die Hero-Bereiche der sechs Module, Modul-Label, keine Finger-Tipps |

## Offene Punkte und Hinweise

- **Beispielwerte im Mittelmodul** (NVDA, Quant-Score 94, „Setup bestätigt", Begründung) sind ausgedacht, keine echten Daten aus dem Quant-Modell. Im Werbespot als Beispiel kennzeichnen oder neutralisieren (kein konkreter Ticker).
- Der Ton wurde nie am Stück angehört, nur Einzelbilder und Lautheit geprüft. Vor Veröffentlichung einmal komplett abspielen.
- Die App-Screens stammen aus dem Repo-Stand vom 19./20.10.2026, ohne Live-Daten. Der Screener zeigte lokal zunächst „Daten nicht verfügbar". Die Daten wurden lokal mit `scripts/screener/build-universe.mjs` aus den Discover-Daten erzeugt. Der Ordner `screener/data/` steht in `.gitignore` und wird nicht eingecheckt.
- Das fertige Video liegt nur in der alten Sitzung. Es wurde nicht in Dropbox abgelegt, weil das Dropbox-Plugin nur Textdateien anlegen kann. **Datei in der Sitzung herunterladen und sichern.**
- Möglicher Zusatz: App-Store- und Google-Play-Hinweis („Bald im App Store & bei Google Play"), 16:9-Fassung, andere Stimme.
- Der Trailer wurde nicht veröffentlicht (Stand der Sitzung). Veröffentlicht wird nur im Approval Center durch den Owner.

## Caption (vorbereitet am 21.10.2026)

> **Eine neue Ära der Marktanalyse beginnt.** 🌌
>
> Jede Aktie. Jeden Tag. Analysiert. Bewertet. Erklärt.
>
> Mit Vision Universe siehst du, was sich an den Märkten verändert und warum: Quant-Scores, Signale und Trends, nachvollziehbar und auf echten Daten.
>
> 🔹 Quant: über 6.000 US-Aktien nach festen Regeln
> 🔹 Discover: Unternehmen, Trends und Themenwelten
> 🔹 SuperTrader: Methoden, Setups, klare Regeln
> 🔹 Screener: finde genau die Aktien, die zu dir passen
> 🔹 Hedgefonds: was die großen Investoren kaufen und verkaufen
> 🔹 Vorsorge: was wird aus deiner Rente?
>
> 📲 **Die App – bald verfügbar.**
> 👉 visionuniverse.de
>
> #VisionUniverse #Aktien #Börse #Investieren #Marktanalyse #Aktienanalyse #ETF #Altersvorsorge #Hedgefonds #Trading #Finanzen #FinTech #AppLaunch #ComingSoon
>
> *Keine Anlageberatung. Alle Inhalte dienen der Information.*

Kurzversion (TikTok oder Story): „Eine neue Ära der Marktanalyse. 🌌 Jede Aktie. Jeden Tag. Analysiert. Bewertet. Erklärt. Die Vision Universe App – bald verfügbar. 👉 visionuniverse.de #VisionUniverse #Aktien #Börse #Investieren #ComingSoon"

## Verbindung zum Reel-Studio

Gemeinsame Bausteine: Stimme Helmut, Dropbox-Track `system_collapse`, Marke (Hintergrund `#08080a`, Lime `#c8f531`, Inter), App-Hinweis „bald verfügbar". Der Trailer ist ein Markenfilm ohne Hook-Formel. Für Reels gilt das Playbook unter `docs/studio/`.
