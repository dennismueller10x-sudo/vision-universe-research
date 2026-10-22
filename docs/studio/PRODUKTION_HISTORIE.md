# Produktionshistorie, Entscheidungen, Fehler

Stand 2026-10-22. Damit eine neue Sitzung nicht bei null beginnt.

## Reels

| Reel | Stand | Notizen |
|---|---|---|
| Reel 01 „Frühstart-Rente" | Karte im Approval Center, Freigabe des Owners offen | früher vorbereitet, Status vor Verwendung prüfen |
| Reel 02 „Chip-Woche" (Sprecher Noah) | v3, 24,5 s | Pause nach „…fallen trotzdem" entfernt (Owner: „ein Tick zu lang"), Skeptiker-Teil gestrichen. Chip-Aktien fallen trotzdem ohne Pause sprechen |
| Altersvorsorgedepot, Vergleichstest | A nur HyperFrames, B Hybrid mit HeyGen-Clips. Finale Fassung Hybrid, Helmut, Musik 76aef06a | am 20.10.2026 veröffentlicht (Reichweite 21 nach etwa 6 Stunden, Ø Wiedergabe 4,2 s, 3 Likes, keine Shares) |
| „Der teuerste Fehler? Nicht investieren." | veröffentlicht 17.10.2026 | Reichweite 91 nach 3 Tagen, Ø Wiedergabe 5,2 s |
| Riester („Riester ist vorbei") | fertig als `…riester-hybrid-heygen-v3-helmut-dropbox-musik.mp4`, 31,6 s, −14,3 LUFS | Owner: „Das Video ist gut". Caption und Hashtags geliefert. Karte im Approval Center vor Verwendung prüfen. Hook: „Zumindest für neue Verträge" macht ihn korrekt |
| Tesla, ARK-Bull-Case (v5) | veröffentlicht vom Owner am 21.10.2026 | 48 s, Hook „Über 1.200 % Rendite", Karte `cand_reel_reel_2026_10_21_tesla_ark_bullcase`. Messung nach 72 h nachtragen (REEL_RESEARCH.md, Abschnitt 7) |
| Tesla, Q3-Zahlen (v1) | fertig, **nicht veröffentlicht**, Vorlage `quartalszahlen` | 60 s. Owner: Mischung mit dem ARK-Kursziel gefällt nicht, besser getrennte Reels zu den Earnings-Calls |
| Meta, Muse (v1) | vom Owner am 22.10.2026 veröffentlicht | 44 s, Hook „Wahnsinn. 10 Millionen Menschen haben in sechs Wochen einen KI-Agenten eingerichtet" (Zahl des Owners), Vorlage `meta-muse`. Owner: „Das Video ist sehr gut". Messung nach 72 h nachtragen |
| Tesla, Robotaxi Q3 (v1) | fertig 22.10.2026, **Prüfung durch den Owner offen** | 44,9 s, Hook „Fast 2 Mio. Meilen. Ohne Fahrer." (Hook-Score 8), Vorlage `tesla-robotaxi`. Ein Gedanke aus dem Q3-Update (PDF des Owners), Bilder aus der Präsentation, eigener Beweis „80-mal um die Erde", Re-Hook „Aber das kostet". Stimme 0,12 USD |
| Unitree H2-X (v1) | fertig 22.10.2026, vom Owner abgenommen („Das Video ist Weltklasse"), Karte offen | 41 s, Angst-Hook „Ein Mann mit Messer. Nachts. Vor deiner Tür.", Vorlage `fremdclip`. Clip von Unitree (Sek. 30 bis 54) im Vordergrund: **Ausnahme von Regel 4 auf ausdrücklichen Wunsch des Owners**, Quelle im Bild und in der Caption. Kosten: Apify 0,15 USD, Stimme 0,10 USD |

Die Videodateien liegen nicht im Repo. Die Vorlagen und Skripte liegen in `studio/reels/`.

## Entscheidungen des Owners (Auswahl)

- Männliche Stimme, kein HeyGen-Avatar. Später: noch dramatischere Stimme, Helmut ist der Stand.
- Effekte: Wackeln (Shake) gefällt nicht, Whip-Pan, Zoom und Partikel wurden später gestrichen (Reichweitendaten sprechen gegen Aufwand, für Hook).
- Musik lauter und härter. Der Dropbox-Track ersetzt die Bibliotheksmusik.
- Clips: „majestätische Mystik", dann mehr Spektakel. Münzregen wurde kritisch gesehen (Meta-Einschränkung), deshalb keine Münzen.
- Alle Quellen prüfen. Immer Call to Action zur App, am Ende „App" statt „Studio".
- Klare Absage an neue Abos und Produktivänderungen. Fremde Reels nur zur Analyse.
- Riester und Altersvorsorgedepot sind erledigt, danach andere Themen (Tesla).
- Sprecher von Anfang an (Hook geht sonst verloren), Bull-Case statt Basisfall im Hook, Rendite in Prozent.
- **Das erste Bild muss sofort tragen:** Eine große Zahl oder ein großer Hook ab Bild 1, nicht erst eine leere Sekunde und dann Aufbau (Owner, 22.10.2026).
- **Mehr Grafik statt nur Zahlen und Diagramme:** Zeichnungen, Icons, Handy-Mock-ups, eigene Bilder des Owners als abgedunkelter Hintergrund. Fremdlogos nicht nachbauen.
- **Earnings-Calls statt Zahlen-Mischung:** Je Konzern ein eigenes Reel aus den Aussagen im Call (Tesla und Meta getrennt). Ein Gedanke pro Reel.
- Der Owner liefert gern den Hook und die Hintergrundbilder selbst. Bilder: in der Caption kennzeichnen („Bildquelle: …").

## Messdaten und Lehren

- Meta-Insights der Altbestände: Median Reichweite 12, Ø Wiedergabe 2,6 bis 5,2 s, keine Shares oder Saves. Siehe REEL_RESEARCH.md.
- Aufwändige Animation ohne Betrag-Hook hat nichts bewegt. Deshalb die Formel im Playbook.

## Fehler und Lösungen

| Problem | Lösung |
|---|---|
| Sprecher sagt „Rieser" oder „Leaster" | Kein `<break>` am Textanfang. „Riester ist vorbei." aus einer guten Aufnahme einsetzen |
| „Vision Universe" deutsch ausgesprochen | im Text `Wischn Juniwörs`; im Zweifel das Wortpaar aus einer geprüften Aufnahme einsetzen |
| „2027." falsch betont | Zahl ausschreiben oder umformulieren |
| Render-Prozess meldet `Target crashed` oder `screenshot Timeout` | Zuerst `df -h /tmp` prüfen: Das Schreibkontingent der Sitzung war voll (27 MB frei), die Abstürze lagen daran. Alte `frames/`-Ordner löschen, dann nur die fehlenden Bilder nachrendern |
| Große Ebenen mit CSS-`filter`, `mask` oder Blur machen das Rendern langsam und instabil | Hintergrundbilder vorab mit `ffmpeg` abdunkeln und zuschneiden, Übergänge nur mit Deckkraft und Verschiebung |
| `faster-whisper` meldet `metadata_errors` (zu altes `av`) | Audio per `ffmpeg` nach `f32le` 16 kHz laden und das Array an `transcribe` geben |
| „Muse" wird nicht englisch gesprochen | im Text `Mjus`, Untertitel `Muse` (Schreibweise `{Mjus|Muse}` im Skript) |
| Skript-Satzzeichen als eigenes Wort gezählt | `build_script.py` hängt allein stehende Satzzeichen an das vorige Wort |
| `pkill -f` im selben Befehl beendet die eigene Shell | Prozesse per `pgrep` und Kennung beenden, Namen nicht im Befehlstext wiederholen |
| Test-WAV am Handy nicht abspielbar | als MP3 oder MP4 senden |
| Datei mit Sprechertexten nicht zu öffnen | Text direkt in den Chat |
| ARK-Studie (Primärquelle) nicht abrufbar (403) | Owner schickte das PDF |
| HeyGen-Guthaben 0 beim neuen Text | vorher `GET /v3/users/me` prüfen, Owner lädt auf |
| Bull- und Basisfall-Zahlen im selben Reel | Chips „BULL CASE" oder „BASISFALL" und Zahlen aus derselben Spalte |
| Bilder aus einer Unternehmens-Präsentation (PDF) | `pdfimages -j -f 11 -l 22 -p deck.pdf img`, kleine Dateien unter 20 KB löschen: Fotos kommen in voller Auflösung (3.712 × 1.857), nicht als Seiten-Screenshot |
| Whisper (deutsch) hört „Austin" als „Osten" | Ausschnitt mit `language=en` gegenprüfen: englisches Modell erkennt „Austin", Aussprache ist richtig. „Cybercab" klingt wie „Cybercap" (Auslautverhärtung), akzeptiert |
| Untertitel-Reste wie „gefahren." oder „Jahr." allein | nach `build_script.py` mit der vorigen Gruppe zusammenführen (Zeilen bis etwa 30 Zeichen, Schrift 52 px) |
| YouTube-Download aus der Cloud-Sitzung (`yt-dlp`: 403, „Sign in to confirm you're not a bot") | Apify `streamers/youtube-video-downloader`, Ablage im Key-Value-Store; Obergrenze mindestens 0,50 USD, abgerechnet nach MB |
| Hook-Wahl ohne eigene Messdaten | Owner bevorzugt Angst- und Schutz-Hooks; die Beobachtung stützt das (höchste Share-Rate 3,2 % bei „So stirbst du nicht"). Als Hypothese H9 messen |
| Apify-Suche (Search-Scraper) Timeouts | Hashtag- und Profil-Scraper nutzen |
| BMF-Seiten 503 | Bundestag, Bundesrat, BGBl., Bundesregierung als Quelle |
| Bundesrat-Datum widersprüchlich (24.04. oder 08.05.) | bundesrat.de: 08.05.2026 |
| Verlorene Shell-Sitzung durch `pkill -f` | keine pkill-Befehle mit Mustern, die den eigenen Prozess treffen |

## Recherche-Läufe (Datensätze verfallen nach der Aufbewahrungszeit)

Finanz-Profile `vmVxdjRcc7v07SQ8G`, `LgzyktH5O7puaRZjp`; Hashtag Finanz `yKLbKtnWhPbGJNUe4`; Nischen `vvgkXK9xfnNukS4cx`; X-Profile `GgGu5WuduZXlaJhak` (Kallaway), `zKiwu6dl3fva1AWBO` (liu8in). Auswertung steht in REEL_RESEARCH.md; Rohdaten bei Bedarf neu laden (Kosten im Voraus nennen).
