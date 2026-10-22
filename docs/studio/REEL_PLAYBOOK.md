# Vision Universe Reel-Playbook

Stand: 2026-10-21. Konto **@app.visionuniverse**. Dieses Dokument hält fest, wie wir Reels bauen: Formel, Aufbau, Formate, Checklisten, Produktion, Messung. Die Belege stehen in [REEL_RESEARCH.md](REEL_RESEARCH.md). Die Werkzeuge liegen in [`studio/reels/`](../../studio/reels/README.md).

Regeln, die immer gelten: nichts ohne Freigabe im Approval Center veröffentlichen, immer Call to Action zur Vision-Universe-App („bald verfügbar", Endkarte „App"), kein Kleingedrucktes im Video (Quellen und Hinweise gehören in die Caption), keine fremden oder ungeklärten Videos und Bilder, kein neues Abo, jeder kostenpflichtige HeyGen- oder Apify-Aufruf wird vorher genannt und freigegeben.

## 1. Die Formel (Hypothese, belegt durch Beobachtung, noch nicht durch eigene Messung)

Keine Formel garantiert Reichweite. Diese ist die stärkste Zusammenfassung dessen, was in 42 analysierten Videos, 332 Finanz-Reels und den Aussagen von zwei Praktikern wiederkehrt. Sie wird mit eigenen Zahlen geprüft (Abschnitt 7).

**HOOK 70 → SPIKE 90 → PEAK/RELEASE → RE-HOOK → BEWEIS → TEILEN**

| Stufe | Zeit | Was passiert | Prüffrage |
|---|---|---|---|
| 1. Hook (70/100) | 0 bis 2 s | Ein Satz, **gesprochen ab 0,2 s** und **gleichzeitig als Großtext im ersten Bild**. Wir starten mitten in der Geschichte, nicht bei null. Der Satz enthält mindestens eines: Betrag oder Prozent, Zielgruppe plus Gegner, Gefahr oder Schutz-Nutzen, Rätsel oder Paradox. | Versteht jemand ohne Ton und ohne Kontext, warum er bleiben soll? |
| 2. Verstärker (90/100) | 2 bis 10 s | Eine zweite Zuspitzung: Kontrast, ungewöhnlich konkrete Zahl, Behauptung, die widerspricht. Offene Schleife („Das klingt verrückt. Dann schau dir an, was dafür passieren muss."). | Gibt es einen Satz, der Zweifel oder Neugier erzeugt? |
| 3. Peak und Release | alle 10 bis 15 s | Nach jeder Auflösung sofort ein neuer Spannungspunkt: neue Zahl, neuer Kontrast, neue Frage. **Keine Szene länger als 12 s ohne neuen Punkt.** | Wann kommt der nächste Punkt? |
| 4. Re-Hook | bei 40 bis 60 % | Fehlschlag-Finte („Aber heute verkauft Tesla keinen einzigen Roboter an Kunden."). Holt zurück, wenn die Aufmerksamkeit sinkt. | Gibt es in der Mitte eine Wendung? |
| 5. Eigener Beweis | im Mittelteil | Eine Zahl, Rechnung oder ein Gesetzesverweis, den **wir** liefern (Förderrechner, Discover, Quant, BGBl.). Keine reine geliehene Autorität. | Was belegt das, was nur wir haben? |
| 6. Einordnung | vor dem Schluss | Kurzer ehrlicher Rahmen („Das ist ein Modell, keine Prognose."). Er senkt das Risiko, ohne den Hook zu töten. | Ist die Aussage so gesagt, dass sie vor einer Prüfung besteht? |
| 7. App und Anlass | letzte 3 bis 5 s | **App-Hinweis zuerst** („bald verfügbar", Endkarte „App"). Ein gesprochener Aufruf zum Weiterschicken entfällt vorerst (Owner-Entscheidung 21.10.2026). Der Anlass zum Teilen oder Speichern steckt im Inhalt (Rechnung, Tabelle, Warnung). | Würde jemand das ohne Aufruf weiterschicken? |

Grundlagen: Shares erzeugen Views, Saves erzeugen Follower (Kallaway, bestätigt durch Auswertung der Gewinner). Haltezeit entscheidet über die Auslieferung; in den ersten 3 bis 5 Sekunden verlieren wir die meisten (eigene Messung: Ø Wiedergabe 2,6 bis 5,2 s).

### Hook-Bibliothek (Bauarten mit Beispielen aus den Daten, nur als Struktur, nie als Text kopiert)

1. **Betrag zuerst:** „540 Euro vom Staat. Jedes Jahr." / „Über 1.200 Prozent Rendite."
2. **Zielgruppe plus Gegner:** „Alle mit Riester-Vertrag aufgepasst: Kündigen kostet dich Geld."
3. **Szenario:** „Wenn der Kurs auf X fällt, was passiert mit deinem Sparplan?"
4. **Schutz-Nutzen:** „Wenn du diesen Vertrag hast, zahlst du vermutlich zu viel."
5. **Rätsel:** „Dieses Ding liegt überall in München und hört dem Boden zu."
6. **Paradox:** „Keine Ventile, trotzdem doppelt so viele Zündungen."
7. **Offene Schleife:** „Antworte auf keinen Fall so. Sondern so."
8. **Kontrast aus Zahl gegen Aussage:** zwei Größen, die nicht zusammenpassen.

Regeln für Hooks: keine Frage ohne Betrag oder Konflikt; keine Superlative, die wir nicht belegen können („aggressivste"); Zahlen rechnen wir selbst nach (Beispiel: 5.000 geteilt durch 370 minus 1 ist über 1.200 Prozent).

### Hook-Score (vor der Produktion, 0 bis 10)

Je ein Punkt: (1) Betrag oder Prozent im ersten Satz, (2) Zielgruppe oder „du", (3) Konflikt, Gefahr oder Gegner, (4) Überraschung oder Widerspruch, (5) gesprochen ab 0,2 s, (6) derselbe Satz als Großtext im ersten Bild, (7) nach unter 10 s ein zweiter Spannungspunkt, (8) Re-Hook in der Mitte, (9) eigener Beweis, (10) Anlass zum Teilen oder Speichern im Inhalt (ohne gesprochenen Aufruf). **Unter 7 Punkten wird nicht produziert.**

### Erstes Bild

Die erste Sekunde darf nie leer sein: Großzahl oder Großsatz sind bei t=0 voll da, Icons und Zeichnungen bauen sich danach auf. In der Vorlage `meta-muse` steht „10 Mio." schon im ersten Bild.

### Bildsprache (ab Meta-Reel)

Neben Balken und Zahlen: selbstzeichnende Linien (SVG mit `stroke-dashoffset`), Icons (Person, Chip, Einkaufswagen, Pfeil, Ort, Uhr), Handy-Mock-ups mit Kennzeichnung „ILLUSTRATION", Zeitstrahlen mit Münze, Unterstreichung bei der Kernaussage. Eigene Bilder des Owners als abgedunkelter Hintergrund (vorab zuschneiden und abdunkeln). Fremde Logos nie nachbauen, neutrale Form plus Wort in unserer Schrift.

### Was wir stoppen

Erklär-Opener ohne Betrag, Logo-Intros, Whip-Pans, Zoom-Effekte, Partikel, Rahmen- und Ring-Effekte, Szenen über 12 Sekunden ohne neuen Punkt, „Folge uns" als einziger Aufruf, reine „bald verfügbar"-Botschaft ohne Nutzen, Reels ohne eigenen Beweis, ungeprüfte Zahlen.

## 2. Formate

Alle Formate beginnen mit der Hook-Formel. Länge ist eine Folge des Inhalts.

| Format | Länge | Aufbau | Stimme | Beleg |
|---|---|---|---|---|
| **F1 Anspruchs-Karte** | 10 bis 15 s | Titel und Betrag im ersten Bild, 3 bis 5 Zeilen, Handlungsaufruf, Schleife | Helmut ab 0,2 s | Finanz-Gewinner (kurz, Betrag im ersten Bild) |
| **F2 Zahlen-Tafel A gegen B** | 10 bis 15 s | Tabelle oder zwei Balken, Differenz farbig, Frage | Helmut | renditesammler, divicircinus |
| **F3 Aufgepasst-Ansage** | 20 bis 30 s | Satz 1: Zielgruppe plus Gegner, Satz 2: Beweis, Satz 3: Ausweg, Wort-für-Wort-Untertitel | Helmut | pascalrudroff, geheimniskremerei |
| **F4 Markt-Moment** | 20 bis 50 s | Ticker, Zahl, Kontrast, Beweis, Einordnung | Helmut | aktien_world, Nischen-Erzähl-Reels |
| **F5 Satire-Szene (POV)** | 8 bis 12 s | „POV: …" oder „[Rolle], wenn …", Pointe in 8 bis 10 s | Stimme oder Text | visionfreiheit (Prinzip) |
| **F6 Erzähl-Reel mit Schema-Animation** | 40 bis 70 s | Szenario- oder Schutz-Hook, Karte oder Schema, Beweis in der Mitte, Auflösung | Helmut | dachschadenmitwissen, techniktogo_ |

## 3. Themenplanung: Raster 6 × 5

Sechs Themenfelder mal fünf Formate, ein Reel pro Tag oder pro Wochentag im Wechsel. Dann muss nur noch der Blickwinkel erfunden werden.

Themenfelder: (1) Altersvorsorge und Staat, (2) Tech- und KI-Aktien, (3) Dividenden, (4) ETF und Kosten, (5) Markt-Ereignisse mit Termin, (6) eigene Daten (Discover, Quant, Förderrechner).

Katalogwert: Zeitkritische Reels (Tesla-Zahlen) halten 3 bis 5 Tage. Evergreen-Reels (Zulagenrechnung, Kostenvergleich) als verlinkte Serie führen, in Highlights sammeln, nach 2 bis 3 Monaten erneut posten. Das Mischverhältnis ist offen (Hypothese: 2 von 3 evergreen).

## 4. Checkliste vor der Freigabe

1. Hook-Score ab 7.
2. Jede Zahl gegen Primärquelle geprüft (Gesetz, Studie, Unternehmensmitteilung). Rechenwege in der Caption.
3. Kurs oder Stand direkt vor dem Posten prüfen, Abweichung über 5 % korrigiert.
4. Aussprache per Transkript geprüft („Vision Universe": im Text `Wischn Juniwörs`, „Riester" ohne Pause am Anfang, Zahlen ausgeschrieben).
5. Bild- und Tonrechte geklärt (Musik aus eigenem Dropbox-Track, fremde Bilder nur mit geklärter Herkunft).
6. KI-Kennzeichnung in der Caption („Teile der Bilder sind KI-generiert"), TikTok: Schalter „KI-generierter Inhalt".
7. Keine Anlageberatung, kein Kursversprechen. „Modell, keine Prognose" wenn Zielkurse vorkommen.
8. Lautheit −14,2 LUFS, 1080 × 1920, H.264.
9. Caption: Hook, Quelle mit Datum, Rechenweg, Hinweis, App-Hinweis, Hashtags.
10. Freigabe nur durch den Owner im Approval Center.

## 5. Produktion (kurz)

Ablauf und Befehle in [`studio/reels/README.md`](../../studio/reels/README.md).

1. Skript mit Hook-Score, Zahlen prüfen.
2. Stimme: HeyGen `POST /v3/voices/speech` (Helmut, `eleven_v3`). Kosten etwa 0,1 USD je 50 Sekunden.
3. Pausen kürzen und Tempo 1,14 (`tighten.py`), Transkript prüfen.
4. Wortzeiten in Szenen übersetzen (`build_timing.py`), HTML-Komposition in HyperFrames-Stil rendern (Chromium, Bildfolge, vier Prozesse parallel).
5. Effekte selbst synthetisieren (`synth_sfx.py`), Musik aus Dropbox-Track mit Ducking, Normalisierung auf −14,2 LUFS.
6. FFmpeg zusammensetzen, Video prüfen (Kontaktbogen).
7. Hosting: HeyGen-Asset-Upload (stabile öffentliche Adresse mit Range-Unterstützung).
8. Karte im Approval Center: Workflow **Social Reel vorbereiten** (`social-reel.yml`). Es wird nichts veröffentlicht.

Kosten pro Reel (Stand Oktober 2026): Stimme 0,1 bis 0,15 USD, HeyGen-Clip 768p etwa 0,10 USD je 5 Sekunden, Apify-Läufe wenige Cent.

## 6. Design

Dunkel (`#08080a`), Text `#f4f5f1`, Akzent Lime `#c8f531`, Schrift Inter. Große Zahlen, Linien-Icons (Auto, Roboter) als eigenes SVG, Linienchart mit Kurs-zu-Ziel, Ring für Anteile, Balken für Vergleiche. Untertitel mit Schlüsselwort in Lime. Dunkle Verläufe über Bildern, damit Text lesbar bleibt. Bildmaterial abgedunkelt und entsättigt.

## 7. Messung und Entscheidung

| Zeitpunkt | Was wir lesen |
|---|---|
| 24 Stunden | Reichweite, Ø Wiedergabedauer, Likes (nur Eindruck) |
| 72 Stunden | zusätzlich Shares, Saves, Kommentare, Profilbesuche. **Hauptvergleich.** |
| 7 Tage | Follower-Veränderung, endgültige Reichweite |

Rangfolge: Shares und Saves, Ø Wiedergabedauer, Reichweite, Likes. Retention-Kurve und Kontostatus per Screenshot aus der App (die API liefert sie nicht).

Ausgangswerte (vor Neustart, offizielle Insights): Median Reichweite 12, Ø Wiedergabe 2,6 bis 5,2 s, 0 Shares und 0 Saves. **Treffer:** Reichweite über 300, Ø Wiedergabe über 8 s oder mindestens 2 Shares. Ein Format gilt erst nach zwei von drei Treffern in Folge als bestätigt.

### Offene Hypothesen, jeweils mit einem Test

| # | Hypothese | Test |
|---|---|---|
| H1 | Hook mit Betrag schlägt Hook mit Frage | Gleiches Thema zweimal in verschiedener Hook-Bauart, 3 Tage Abstand |
| H2 | Stimme ab 0,2 s schlägt Karte ohne Stimme | Gleiche Karte mit und ohne Helmut |
| H3 | Re-Hook in der Mitte erhöht die Ø Wiedergabe | Zwei Fassungen desselben Reels |
| H4 | Kurze Reels (12 s) erreichen mehr Fremde als lange (45 s) | Gleiches Thema in beiden Längen |
| H5 | Eigener Beweis erhöht Shares gegenüber reinem Zitat | Reel mit eigener Rechnung gegen Zitat-Reel |
| H6 | Hohe Produktion (Kallaway) schlägt einfache Karten (Finanz-Daten) | je 3 Reels pro Stil |
| H7 | Person im Bild (Owner) schlägt reine Stimme | 3 Reels mit Person |
| H8 | Serien und Wiederholung bringen mehr als Einzel-Hits | nach 4 Wochen |

## 8. Erfahrungen aus der Entstehung

- Der Hook entscheidet, nicht der Aufwand. Unsere ersten animierten Erklär-Reels lagen bei 21 bis 91 erreichten Konten. Sie waren 25 bis 32 s lang und begannen ohne Betrag.
- `<break>` am Textanfang führt zu falscher Aussprache („Riester" wurde „Leaster"). Stattdessen kein Break und notfalls ein Wort aus einer früheren Aufnahme einsetzen.
- „Vision Universe" spricht Helmut richtig als `Wischn Juniwörs`. Nach jeder Aufnahme per Whisper prüfen und im Zweifel das Wortpaar aus der geprüften Aufnahme einsetzen.
- Zahlen in der Stimme ausschreiben („dreihundertsiebzig"). Das Tempo steigt mit `atempo 1.14`. Pausen über 0,26 s kürzen.
- Das HeyGen-Guthaben war leer, als der neue Text gebraucht wurde. Vor einer Produktion Guthaben prüfen (`GET /v3/users/me`).
- Bei Kursen immer „aktuell rund X" und im Zweifel den Bereich prüfen, über den die Aussage robust bleibt (Tesla: zwischen 355 und 374 $ blieb die Rendite über 1.200 %).
- Bei Quellen mit Basis- und Bull-Fall die Zahlen nicht mischen. Im Tesla-Reel standen zunächst Basisfall-Zahlen zum Bull-Hook; korrigiert.
- Gesperrte Quellen (ARK-Seite 403): Primärquelle vom Owner als PDF anfordern, statt Sekundärquellen zu mischen.
