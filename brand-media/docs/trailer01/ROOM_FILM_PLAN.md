# Trailer 01 „THE ROOM“ – Produktionsvorbereitung (avatarfrei)

Stand 2026-10-11. **Reset:** Die avatarbasierte Planung (`PRODUCTION_PLAN.md`, Avatar V, Looks, Voice-IDs LEA/DAVID) ist für diesen Trailer **ausgesetzt**, die Avatar-Assets bleiben unangetastet. **Es wurde nichts Kostenpflichtiges generiert**; einzige Aktion mit HeyGen: kostenloser Upload der Referenz. Wallet: **14,42 USD**.
Vorab-Schnitt mit Platzhaltern (Referenzbild statt generierter Fahrten, Plattformaufnahmen, Sounddesign, vorläufige Off-Stimme nur zur Timing-Kontrolle): `video/trailer/room_animatic_v41/room_animatic_v41_720p.mp4`, Quelle `…/composition/`.

## 1. Verbindliche Referenz
`originals/trailer_room/room_reference_master.png` (941×1672, SHA-256 `4d793b86…`, HeyGen-Asset **`8454ae22adbb47f1a8f94b6adc41ad2d`**, Registry `trailer-room-reference`, APPROVED durch Auftraggeber). Maßgeblich: riesiger schwarzer Raum, viel Negativraum oberhalb, ein langer schwarzer Tisch mit dünnen Metallbeinen, zwei schwarze Schalenstühle mit dünnen Beinen, Frau links, Mann rechts im Profil, Personen ≈ 10 % der Bildhöhe, Lichtkegel/Lichtfläche auf Tisch und Boden, dunkler reflektierender Beton. Die Personen im Bild sind **keine** LEA/DAVID.

## 2. Shot-Strategie (heygen-video-1, keine Avatare)
Laut Doku: `reference_to_video` (bis 9 Referenzbilder, im Prompt `<Picture 1>`), `image_to_video` (`image` = erstes Frame, Seitenverhältnis folgt dem Bild), kein Letzter-Frame-Parameter, 5–15 s, Ton inklusive, `prompt_enhancement: disabled`, `seed` reproduzierbar. Mehrere Szenen in einem Prompt sind möglich (zeitgegliederter Prompt, kein Schnittbefehl dokumentiert).
**Empfohlen – Pfad S (2 Clips, getrennte Aufgaben):**
- **Clip A (Akt I + II, 8 s):** `reference_to_video`, `<Picture 1>` = Referenz (Raum, Proportionen, Licht). Prompt fordert **leeren Raum bis Sekunde 3**, danach Auftritt von links/rechts, Hinsetzen wie im Referenzbild. Risiko: das Referenzbild zeigt sitzende Personen, das Modell könnte sie schon am Anfang einblenden.
- **Clip B (Akt III, 7 s):** `image_to_video`, erstes Frame = Referenzbild (sitzende Personen, exakt die Komposition), Dolly nach vorn, dann Orbit 100–120° mit Aufstieg. Alternative: erstes Frame = **letztes Frame von Clip A** (maximale Kontinuität; Frame-Extraktion lokal, danach kostenloser Upload, Anfrage `b_orbit_from_a_lastframe_768.json` mit gesperrtem Platzhalter).
- Übergang A→B bei 7,0 s als Match-Cut/Kurz-Dissolve mit Sound-Hit; Raum und Licht stimmen durch die gemeinsame Referenz überein.
**Ausweichpfad M:** ein Clip, 15 s, zeitgegliederter Prompt (`m_one_clip_768.json`): geringste Kosten und Brüche, aber weniger Kontrolle.
**Ausweichpfad T:** `text_to_video` ohne Referenz für den leeren Raum, falls Clip A die Personen zu früh zeigt (ungetestet; weicht stärker von der Referenz ab).
**Geprüft und verworfen:** lokales Entfernen der Personen aus dem Referenzbild (Inpainting + Stuhl-Nachmalen) für einen „leeren“ Startframe. Ergebnis unbrauchbar (Schlieren, Geisterkonturen, `…_REJECTED_for_generation.png`). Ebenfalls verworfen laut Briefing: Personen aus dem sitzenden Bild aufstehen und rückwärts laufen lassen.

## 3. Shot-by-Shot (20,000 s)
| Akt | Zeit | Bild | Quelle |
|---|---|---|---|
| I THE VOID | 0–3 | fast schwarz, Lichtkegel über Tisch, zwei leere Stühle, Kamera weit weg, kaum wahrnehmbare Fahrt nach vorn | Clip A (0–3 s) |
| II THE ARRIVAL | 3–7 | Frau von links, Mann von rechts, klein, Schritte hallen, Stuhl zurückziehen, sitzen; Fahrt langsam weiter | Clip A (3–7 s, 1 s Reserve) |
| III THE ORBIT | 7–13 | näher an den Tisch, dann fließender Bogen 100–120° mit leichtem Aufstieg, Tiefe des Raums sichtbar, Personen klein | Clip B (6 s + 1 s Reserve) |
| IV THE REVEAL | 13–17 | Plattform: Discover, Quant, Technical Intelligence, Supertrader, je ≈ 1 s, Musik-Höhepunkt | echte Aufnahmen, HyperFrames |
| V THE STATEMENT | 17–20 | 17,0–17,3 Schwarz/Stille, „ANDERE RATEN.“ 17,6, „DU VERSTEHST.“ 18,2, Logo 18,7, Sting 18,5 | HyperFrames |
Personen sprechen nicht; keine Lippenbewegungen nötig.

## 4. Kamera- und Bewegungsplan
| t | Kamera |
|---|---|
| 0–7 s (Clip A) | sehr weit, niedrig, locked; Dolly vorwärts so langsam, dass es kaum bewusst wahrgenommen wird (insgesamt ≈ 10–15 % Annäherung) |
| 7–9 s (Clip B) | Dolly vorwärts, Personen wachsen von ≈ 10 auf ≈ 14 % Bildhöhe |
| 9–13 s | Beginn Orbit gegen den Uhrzeigersinn um den Tisch, 100–120° gesamt, gleichmäßige Winkelgeschwindigkeit (≈ 25–30°/s), Aufstieg ≈ 1,5 m, dabei bleibt der Tisch Zentrum; Personen nie über ≈ 20 % Bildhöhe |
| Endpose | leicht erhöhte Dreiviertelsicht auf den Tisch, Tiefe des Raums im Rücken |
Regeln: keine Zooms, keine Beschleunigungsspitzen, Raumgröße und Maßstab haben absolute Priorität; faces bleiben klein (Doku-Hinweis: kleine Gesichter driften weniger).

## 5. HeyGen-Prompts und Anfragen (nicht ausgeführt, `pipeline/room_film/requests/`)
| Datei | Modus | Dauer/Auflösung | Seed |
|---|---|---|---|
| `a_empty_arrival_768.json` | reference_to_video | 8 s, 768p | 3001 |
| `b_orbit_768.json` | image_to_video, first frame = Referenz | 7 s, 768p | 3002 |
| `b_orbit_from_a_lastframe_768.json` | image_to_video, first frame = Letztes Frame A (**gesperrt**, `TODO_`) | 7 s, 768p | 3003 |
| `m_one_clip_768.json` | reference_to_video, 3 Phasen | 15 s, 768p | 3004 |
| `a_empty_arrival_1080.json`, `b_orbit_1080.json` | Endfassung | 8 s / 7 s, 1080p | 3001 / 3002 |
| `vo_off1/2/(3 optional)_speech.json` | TTS HeyGen, Engine orca | – | **Voice-ID gesperrt** |
**Clip A (Kern, Volltext in der Datei):** „Photorealistic cinematic live-action footage, shot on 35mm film with an ARRI Alexa … no retouching … The setting is exactly the room shown in `<Picture 1>`: a gigantic, almost completely black studio hall with a huge amount of empty black space above, a dark slightly reflective concrete floor, a single soft cone of light … one long rectangular black table with thin black metal legs and two black molded chairs … IMPORTANT: at the start the room is completely empty … Do not show the two seated people from `<Picture 1>` at the start. Camera: very far away and low, locked, barely perceptible slow dolly forward … 0 to 3 seconds: only the empty room … From second 3: a woman walks in from the far left and a man from the far right, both very small, each about one tenth of the frame height, footsteps echoing … They sit down opposite each other, the woman on the left chair and the man on the right chair … Sound: deep room tone, audible footsteps with echo, soft chair movement, no music, no speech. No text, no logos, no screens, no windows, no cameras or lights visible, no extra people, no neon, no holograms, no close-ups of faces …“
**Clip B (Kern):** „The video starts exactly with the given first frame … Camera, one continuous movement without cuts: 0 to 2 seconds a smooth slow dolly forward; 2 to 7 seconds the camera glides into a fluid drone-like gimbal orbit around the table, about 100 to 120 degrees, rising slowly by about one and a half meters … people remain small, never more than one fifth of the frame height … Mysterious, elegant, expensive.“
Personenbeschreibung nur textlich (Frau: schulterlange blonde Haare, schwarze Lederjacke; Mann: kurze dunkle Haare, kurzer Bart, schwarzer Pullover, weiße Sneaker), **keine Avatar-Referenzen**.

## 6. Sound- und Sprecher-Timeline
Sound entsteht lokal (synthetisch, lizenzfrei, `tools/room-film-sounddesign.py`) plus Plate-Ton der Clips (Schritte/Hall) als Option; Modell-Ton wird per Prompt auf „no music, no speech“ gesetzt.
| t | Ton |
|---|---|
| 0–3 | tiefer Bass/Drone, leises Raumrauschen, Hall, keine Sprache |
| 3,4–6,4 | deutliche Schritte mit Hallkette (0,19/0,41/0,68/1,0 s), Kleidungsrascheln |
| 6,2–6,6 | Stuhlrücken |
| 7,0 | Whoosh zum Orbit, Pad-Wechsel |
| **7,4–10,3** | **Off 1:** „Tausende Aktien. Millionen Meinungen.“ (Musik −5 dB) |
| **11,1–12,6** | **Off 2:** „Doch was zählt wirklich?“ |
| 9–13 | Puls ab 9 s, Spannung steigt |
| 13–17 | vier Schnitte je 1 s mit Whoosh/Thump, Riser, Höhepunkt |
| 17,0–17,3 | **Stille** |
| 17,3 | Sub-Impact, 17,6/18,2 Tipp-Ticks zu den Textzeilen, 18,5 Sting |
Off-Dauern (gemessen an den Hörproben): Wolf Spencer 2,6 s + 1,2 s, Deep Dieter 3,0 + 1,5 s, Ilya 3,1 + 1,9 s – alle passen (Off 2 endet spätestens bei 12,9 s). „Andere raten. Du verstehst.“ bleibt **Text mit Sting**; optionaler Sprecher (`vo_off3`, ≈ 1,5 s bei 17,7–19,2 s) nur nach deiner Entscheidung. Die Off-Stimme ist noch nicht gewählt (Hörbogen OFF 1 Wolf Spencer · 2 Ilya · 3 Deep Dieter); im Animatic dient Wolf Spencer nur als **vorläufiger Platzhalter für das Timing**.

## 7. HyperFrames-Kompositionsplan
- Spuren: Clip A (0–7), Clip B (7–13) mit 0,3 s Kreuzblende/Match-Cut, Plattformaufnahmen (13–17), Schwarz + Typografie + Logo (17–20), Off-Stimme, Sounddesign (Ducking −5 dB bei Sprache), Untertitel dezent (Off 1/2).
- Format: Clips 768×1344 (bzw. 1080×1890 in der Endfassung) → 1080×1920 (Skalierung 1,41× bzw. Beschnitt ≈ 17 px); Farbgrading minimal (Schwarzwert halten, Kontrast −/+ nur leicht, keine Schärfung), Korn 7 %, Vignette, kein Neon.
- **Akt IV reduziert:** die Aufnahmen werden im **dunklen Theme** aufgenommen (Discover per Theme-Schalter, bereits umgesetzt: `scr_discover_dark.mp4`), je Beat ein lesbarer Ausschnitt (große Kennzahl/Karte, keine kleinen Texte), Produktname groß, „Datenstand 09.10.2026 · letzter Handelstag“ eingeblendet. **Supertrader:** Signale veraltet (Stand 06.10., STALE), daher nur Hero; vor dem Final-Render `system-health` erneut prüfen.
- Typografie: Inter, weiß auf Schwarz, 118 px; Logo: offizielles `assets/vision-universe-logo.png` (weiß invertiert, keine KI-Variante). Hinweis „KI-generierte Szenen · Keine Anlageberatung“ klein.
- Export: 1080×1920, 25 fps, H.264/AAC, exakt 20,000 s, Pegel −14 LUFS gesamt, Off −16 LUFS; Renderzeit ≈ 1,5 min lokal (gemessen am Animatic).

## 8. Kostenabschätzung (Preise 768p 0,03 USD/s gemessen: 8 s = 0,25 USD; 1080p = 3×)
| Schritt | Rechnung | USD | Obergrenze (1,67×) |
|---|---|---|---|
| A 768p, 8 s | 8 × 0,031 | 0,25 | 0,40 |
| B 768p, 7 s | 7 × 0,031 | 0,22 | 0,35 |
| **Gate 1: A+B (768p)** | | **≈ 0,47** | 0,75 |
| Wiederholungen (je Clip max. 2, nur nach Freigabe) | 4 × ≈ 0,23 | 0,92 | |
| Endfassung 1080p A+B | 15 × 0,09 | 1,35 | 2,25 |
| Off-TTS (2–3 Zeilen) | ≈ 0,02 je Zeile | 0,06 | |
| **Standard** (Gate 1 + 1080p + TTS) | | **≈ 1,9** | |
| **Planbudget** inkl. Wiederholungen | | **≈ 3,3** | Hartlimit 4,5 |
| Ausweichpfad M, 15 s, 768p / 1080p | 15 × 0,031 / 15 × 0,09 | 0,47 / 1,35 | |
Reihenfolge nach Kostenrisiko: Stimme wählen (kostenlos) → **Gate 1** (A+B, 768p) → Sichtprüfung → ggf. Fallback M/T → TTS → 1080p-Endfassung → Schnitt. Keine automatischen Wiederholungen; vor jedem Aufruf Wallet-Prüfung (`tools/heygen.mjs balance`), Abbruch bei Überschreitung, gesperrte Platzhalter.

## 9. Qualitätskriterien (pro Clip, REVIEW, keine Auto-Freigabe)
Personen realistisch klein (≈ 10 % der Bildhöhe) · Tisch/Stühle proportional, Sitzhöhe normal, Füße am Boden · Raum wirkt riesig, Geometrie stabil · Gehen natürlich, Hinsetzen glaubwürdig (Plate-Test zeigte „Vorbeugen“ als typisches Artefakt) · keine verformten Gliedmaßen · Orbit gleichmäßig, kein Zoom, keine Sprünge · kein Hologramm, keine Zusatzpersonen · Clip A beginnt wirklich **leer** · Anschluss A→B (Raum, Licht, Kleidung). Werkzeuge: `tools/identity-contact-sheet.py` (Frames), `tools/motion-metrics.py`. Fehler werden dokumentiert, Korrekturen vorgeschlagen (Prompt/Seed), nicht automatisch wiederholt.

## 10. Freigaben
1. **Gate 1:** Clips A und B in 768p (zusammen ≈ 0,47 USD, Obergrenze 0,75 USD), je ein Versuch.
2. Entscheidung Off-Stimme (Hörbogen OFF 1/2/3) und ob „Andere raten. Du verstehst.“ nur als Text oder zusätzlich gesprochen.
3. Danach einzeln: Fallback (M oder T), 1080p-Endfassung (≈ 1,35 USD), TTS (≈ 0,06 USD).
4. Plattformaufnahmen final im dunklen Theme (kostenlos, nach Datenfrische-Check).
5. PR #583 vor dem Merge; keine Merges durch mich.
