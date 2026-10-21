# Produktionshistorie, Entscheidungen, Fehler

Stand 2026-10-21. Damit eine neue Sitzung nicht bei null beginnt.

## Reels

| Reel | Stand | Notizen |
|---|---|---|
| Reel 01 „Frühstart-Rente" | Karte im Approval Center, Freigabe des Owners offen | früher vorbereitet, Status vor Verwendung prüfen |
| Reel 02 „Chip-Woche" (Sprecher Noah) | v3, 24,5 s | Pause nach „…fallen trotzdem" entfernt (Owner: „ein Tick zu lang"), Skeptiker-Teil gestrichen. Chip-Aktien fallen trotzdem ohne Pause sprechen |
| Altersvorsorgedepot, Vergleichstest | A nur HyperFrames, B Hybrid mit HeyGen-Clips. Finale Fassung Hybrid, Helmut, Musik 76aef06a | am 20.10.2026 veröffentlicht (Reichweite 21 nach etwa 6 Stunden, Ø Wiedergabe 4,2 s, 3 Likes, keine Shares) |
| „Der teuerste Fehler? Nicht investieren." | veröffentlicht 17.10.2026 | Reichweite 91 nach 3 Tagen, Ø Wiedergabe 5,2 s |
| Riester („Riester ist vorbei") | fertig als `…riester-hybrid-heygen-v3-helmut-dropbox-musik.mp4`, 31,6 s, −14,3 LUFS | Owner: „Das Video ist gut". Caption und Hashtags geliefert. Karte im Approval Center vor Verwendung prüfen. Hook: „Zumindest für neue Verträge" macht ihn korrekt |
| Tesla, ARK-Bull-Case (v5) | veröffentlicht vom Owner am 21.10.2026 | 48 s, Hook „Über 1.200 % Rendite", Karte `cand_reel_reel_2026_10_21_tesla_ark_bullcase`. Messung nach 72 h nachtragen (REEL_RESEARCH.md, Abschnitt 7) |

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

## Messdaten und Lehren

- Meta-Insights der Altbestände: Median Reichweite 12, Ø Wiedergabe 2,6 bis 5,2 s, keine Shares oder Saves. Siehe REEL_RESEARCH.md.
- Aufwändige Animation ohne Betrag-Hook hat nichts bewegt. Deshalb die Formel im Playbook.

## Fehler und Lösungen

| Problem | Lösung |
|---|---|
| Sprecher sagt „Rieser" oder „Leaster" | Kein `<break>` am Textanfang. „Riester ist vorbei." aus einer guten Aufnahme einsetzen |
| „Vision Universe" deutsch ausgesprochen | im Text `Wischn Juniwörs`; im Zweifel das Wortpaar aus einer geprüften Aufnahme einsetzen |
| „2027." falsch betont | Zahl ausschreiben oder umformulieren |
| Test-WAV am Handy nicht abspielbar | als MP3 oder MP4 senden |
| Datei mit Sprechertexten nicht zu öffnen | Text direkt in den Chat |
| ARK-Studie (Primärquelle) nicht abrufbar (403) | Owner schickte das PDF |
| HeyGen-Guthaben 0 beim neuen Text | vorher `GET /v3/users/me` prüfen, Owner lädt auf |
| Bull- und Basisfall-Zahlen im selben Reel | Chips „BULL CASE" oder „BASISFALL" und Zahlen aus derselben Spalte |
| Apify-Suche (Search-Scraper) Timeouts | Hashtag- und Profil-Scraper nutzen |
| BMF-Seiten 503 | Bundestag, Bundesrat, BGBl., Bundesregierung als Quelle |
| Bundesrat-Datum widersprüchlich (24.04. oder 08.05.) | bundesrat.de: 08.05.2026 |
| Verlorene Shell-Sitzung durch `pkill -f` | keine pkill-Befehle mit Mustern, die den eigenen Prozess treffen |

## Recherche-Läufe (Datensätze verfallen nach der Aufbewahrungszeit)

Finanz-Profile `vmVxdjRcc7v07SQ8G`, `LgzyktH5O7puaRZjp`; Hashtag Finanz `yKLbKtnWhPbGJNUe4`; Nischen `vvgkXK9xfnNukS4cx`; X-Profile `GgGu5WuduZXlaJhak` (Kallaway), `zKiwu6dl3fva1AWBO` (liu8in). Auswertung steht in REEL_RESEARCH.md; Rohdaten bei Bedarf neu laden (Kosten im Voraus nennen).
