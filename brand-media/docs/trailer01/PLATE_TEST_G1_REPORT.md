# Plate-Test G1 (heygen-video-1, 768p) – Ergebnis und Entscheidungsstand

2026-10-11 · **ein** Versuch, keine Wiederholung · Datei `video/trailer/plate_tests/g1_768_test_seed2026_8s.mp4`, Kontaktbogen und Schlüsselbilder daneben, Rohdaten `…_result.json`.

## Durchführung und Kosten
- `POST /v3/models/videos`, `reference_to_video`, Referenzen `<Picture 1>` LEA-Master, `<Picture 2>` DAVID-Master, 8 s, 768p, 9:16, Seed 2026, `prompt_enhancement: disabled`. (Studiokonzept im Prompt: schwarzer Raum, rechteckiger schwarzer Tisch, zwei schwarze Stühle, dunkler reflektierender Boden, dezentes Deckenlicht, Lichtkegel auf der Tischfläche.)
- Vorab begrenzt: 8 s statt 10 s, Kostenwache mit 0,05 USD/s (1,67 × Blog-Listenpreis) ⇒ Obergrenze 0,40 USD < 0,45 USD Limit.
- **Tatsächlich: 0,25 USD** (Wallet 14,67 → 14,42), also ≈ 0,031 USD/s. Das bestätigt den HeyGen-Listenpreis von 0,03 USD/s bei 768p (gemessen, eine Stichprobe, Wallet-Anzeige auf 0,01 gerundet). Ausgabe 768×1344, 24 fps, mit AAC-Ton.

## Befund (Sichtprüfung der Frames alle 0,5 s plus vier Detailbilder; Ton nicht abgehört)
| Kriterium | Ergebnis |
|---|---|
| Studio | gut: dunkler Raum, schwarzer rechteckiger Tisch, zwei schwarze Lederstühle (Eames-Stil), dunkler reflektierender Boden, Lichtkegel an der Rückwand, später Wandstrahler und Deckenträger sichtbar. Abweichungen zum Master-Studio: weiter, sichtbare Deckenstruktur, Lichtkegel auf der Wand statt auf der Tischfläche |
| Shot 01 (leerer Raum) | erfüllt, ca. 0–3 s; die Dolly-Bewegung ist sehr subtil |
| Auftritt | LEA von links, DAVID von rechts, als große Figuren im Vordergrund ab ≈ 3,0 s (später als geplant, Sollbeginn 2 s) |
| LEA | blonde, schulterlange Wellen, schwarze Lederjacke, schwarzes Top, schwarze Hose, schwarze Stiefel: erkennbar der Master. Gesicht klein und im Profil/Dreiviertel, Ähnlichkeit plausibel, aber **nicht pixelgenau prüfbar** |
| DAVID | kurze dunkle Haare, Bart, schwarzer Strickpullover, Uhr, weiße Sneaker: erkennbar der Master |
| Kleidung konsistent | ja über alle Frames |
| Hinsetzen | beide stützen sich zuerst vorgebeugt auf dem Tisch ab (wirkt leicht „verbeugt“), dann sitzen sie: LEA links, DAVID rechts, Stuhlpositionen korrekt |
| Kamerabogen | ab ≈ 6 s fließender Bogen, endet in der Dreiviertelansicht hinter LEAs Schulter; plausibel, kein Ruckeln sichtbar; Winkel ≈ 60–90° (Soll 90–120°) |
| Zusatzpersonen, Hände | keine Zusatzpersonen, Hände ohne sichtbare Deformation in den geprüften Frames |
| Körperbewegungen | überwiegend natürlich; das Vorbeugen vor dem Hinsetzen ist das auffälligste Artefakt |
| Ton | Plate liefert eigenen Ton (leise, Mittel −36,6 dB, Spitzen −1,9 dB; Schritte/Stühle laut Pegelverlauf vorhanden); **Klang nicht beurteilt** |
Gesamturteil: **brauchbar bis gut, Status REVIEW.** Die Gesichter bleiben in dieser Entfernung erkennbar; ob eine 1080p-Neugenerierung dieselbe Leistung liefert, ist offen (anderer Lauf, ≈ 0,90 USD für 10 s).

## Einbau in den Trailer (Animatic v3.1)
`video/trailer/trailer01_animatic_v31/animatic_v31_720p.mp4`: der Plate ersetzt die Platzhalter in den Shots 01–03. Zeitdehnung ×1,08 (0,6–8,0 s auf 8 s), Beschnitt 768×1344 → 1080×1920 (1,41 × hochskaliert, mit Korn/Vignette kaschiert), Sounddesign ohne synthetische Schritte, dafür Plate-Ton. Der Auftritt fällt damit auf ≈ 2,7 s, Hinsetzen ≈ 4,8–6,1 s, Orbit ≈ 5,8–8 s, also nah an den Soll-Fenstern. Off 1 ist auf „Tausende Aktien. Millionen Meinungen.“ gekürzt.

## Optionen für die Endfassung
1. **Plate behalten** (768p, hochskaliert): 0 USD zusätzlich, mit sichtbarem Detailverlust.
2. **Neu in 1080p, 10 s** mit retimtem Prompt (Auftritt ab 1,5 s, kein Vorbeugen, 100–120° Bogen): ≈ 0,90 USD (Hartgrenze), Ergebnis kann abweichen (Neuwurf).
3. Prompt-Variante in 768p (≈ 0,31 USD je 10 s) vorher testen.
**Empfehlung:** erst Option 1 im Schnitt bewerten; 1080p nur, wenn die Softness auf dem Handy stört.

## Offene Entscheidung: LEA schaut DAVID an
Avatar V hat keine Blicksteuerung, LEAs Master schaut in die Kamera. Mögliche Wege (alle noch ohne Generierung, jeweils erst nach Freigabe):
- **A:** Avatar IV mit `motion_prompt` („dreht den Kopf nach rechts zu ihrem Gegenüber und spricht“): 0,039 USD/s ≈ 0,10 USD je Take, Qualität geringer als V, Blickrichtung nicht garantiert.
- **B:** Avatar V (Kameraposition) und Schnitt-/Framing-Trick (LEA links im Bild, DAVID als Gegenschuss mit Blick nach links): Blick bleibt formal zur Kamera, Wirkung als Gespräch durch Schnittfolge und Bildaufbau; kostenlos, aber nicht dein Wunsch „schaut DAVID an“.
- **C:** `heygen-video-1` mit LEA-Master und Referenz-Audio für Nahaufnahme „spricht zu DAVID“: Blick am besten, aber Stimme/Lippensync nicht an den festen Avatar gebunden und ungetestet.
Voraussetzung für A/C: freigegebene Stimme. Vorschlag: nach der Stimmenwahl A als günstiger Test (≈ 0,10 USD), danach Entscheidung.

## Timing der Off-Zeilen (aus den Off-Hörproben gemessen)
| Zeile | Wolf Spencer | Ilya | Deep Dieter | Fenster |
|---|---|---|---|---|
| Off 1 „Tausende Aktien. Millionen Meinungen.“ | 2,6 s | 3,1 s | 3,0 s | 2,0–5,0 ✓ |
| Off 2 „Doch was zählt wirklich?“ | 1,2 s | 1,9 s | 1,5 s | 5,0–8,0 ✓ |
| Off 3 „Vision Universe.“ | 0,9 s | 1,0 s | 1,0 s | 18,3–20,0 ✓ |
Alle Zeilen passen in ihre Fenster. Die drei Off-Proben kosteten zusammen 0,05 USD (Wallet 14,72 → 14,67).
