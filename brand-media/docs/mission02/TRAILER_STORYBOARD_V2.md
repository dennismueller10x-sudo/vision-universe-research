# Trailer „Andere raten. Du verstehst.“ – Produktionsvorbereitung

20 s · 9:16 · 1080×1920 · 25 fps · Deutsch · Hauptfiguren LEA und DAVID. **Noch nichts Kostenpflichtiges generiert.**
Vorab-Schnitt (Animatic, Standbilder der Master + echte lokale Plattformaufnahmen + synthetisches Sounddesign): `video/trailer/animatic_v1/animatic_v1_720p.mp4`, Quelle in `…/composition/`. Die Tags im Bild (S01…S08) sind Review-Hilfen und fallen im Finale weg.

## Shot-by-Shot
| Shot | Zeit | Inhalt | Quelle | Kamera/Look | Ton |
|---|---|---|---|---|---|
| S01 | 0,0–1,8 | Dunkler, leerer Studioraum, warmes Wandlicht oben links, Tischkante, schwarze Tasse | Cinematic (HeyGen) oder Ausschnitt der Master, abgedunkelt (Lean) | CAM-D, langsamer Push-in, Korn | Raumton, Drone setzt ein, Tür-Klick bei 1,2 |
| S02 | 1,8–3,0 | LEA betritt von links, Lederjacke, Stiefel, geht Richtung Stuhl | Cinematic, Referenz: LEA-Look | CAM-D → seitlicher Schnitt, 35 mm | Schritte (Stiefel) |
| S03 | 3,0–4,0 | DAVID betritt von rechts, Strickpullover, Sneaker | Cinematic, Referenz: DAVID-Look | CAM-D, gegenläufig | Schritte (weicher) |
| S04 | 4,0–5,6 | 4a LEA setzt sich (0,8 s), 4b DAVID setzt sich (0,8 s) | Cinematic oder Master-Stills mit Bewegung | CAM-C Dreiviertel | Stuhlquietschen |
| S05 | 5,6–8,2 | Zwei Winkelwechsel: weite Zweier-Totale, dann Halbtotale, Spannungsaufbau | Cinematic mit **beiden** Looks, ersatzweise zwei Einzelshots | kurze Winkel statt Kamerafahrt (Identitätsdrift) | Whoosh 5,4, Drone steigt |
| S06 | 8,2–11,2 | LEA Nahaufnahme: „Investierst du noch nach Bauchgefühl?“ | **Avatar V**, Look LEA, neue Stimme | CAM-A, Push-in im Schnitt | Dialog, Drone geduckt |
| S07 | 11,2–12,5 | DAVID: „Nicht mehr.“ | **Avatar V**, Look DAVID | CAM-A, Gegenschuss | Dialog, kurze Pause, Thump bei 12,45 |
| S08 | 12,5–17,0 | 4 Produktschnitte à ≈ 1,1 s: Discover, Quant, Technical, SuperTrader, Einblendung des Namens | Echte Screenrecordings der Plattform (Playwright, 1080×1920) | harte Cuts, Whoosh+Thump je Schnitt | Riser 14,5→17,0 |
| S09 | 17,0 | Schwarz, Stille, Sub-Impact | – | – | Impact 17,0 |
| S10 | 17,4–20,0 | „Andere raten.“ (17,6) · „Du verstehst.“ (18,5) · Logo (19,1) · Hinweis „KI-generierte Charaktere · Keine Anlageberatung“ | HyperFrames | Typo, Lime-Akzent | Tipp-Ticks, Schluss-Sting |

Dialogtext exakt wie im Auftrag. Zeiten sind Zielwerte; die tatsächliche Sprechdauer der Avatar-V-Clips bestimmt den Schnitt (LEA ≈ 2,6 s, DAVID ≈ 1,0 s geschätzt).

## Cinematic-Prompts (Entwurf, Englisch für das Modell)
- **S01:** „Locked-off, very slow push-in on an empty minimalist black film studio, matte black stone table, black leather ribbed office chairs, dark polished concrete floor with warm soft reflections, one warm vertical wall light top left, cinematic shadows, fine film grain, photorealistic, no people, no text.“
- **S02:** „LEA from the reference enters the black studio from the left, walking calmly toward the table, black leather blazer, black trousers and boots, natural gait, camera slightly low, shallow depth of field, same room as reference, no text.“
- **S03:** „DAVID from the reference enters from the right, black knit sweater, black trousers, white sneakers, relaxed confident walk, same studio, no text.“
- **S04/S05:** „Both sit down at the black table, natural movements, then a slow camera move to a three-quarter angle, same studio, no text, no subtitles.“
Negativ: Gesichtsveränderung, andere Frisur, Text, Neon, Hologramme, zusätzliche Personen.

## Avatar-V-Anfragen (nach Stimmenfreigabe)
`POST /v3/videos`, `type: avatar`, `engine: avatar_v`, 9:16, 1080p, `fit: cover`, Look-IDs aus `avatar-registry.json` (LEA `5962a9dd…`, DAVID `91bd009c…`), Stimme = freigegebene Voice-ID, kein `motion_prompt` (bei Photo-Avataren für V nicht zulässig). Im Test hat V die Pose geändert (Handgeste). Für DAVID **ungetestet**.

## Benötigte Assets
| Asset | Status |
|---|---|
| Masterbilder LEA, DAVID (APPROVED) | vorhanden |
| HeyGen-Looks LEA, DAVID | vorhanden (`registry/avatar-registry.json`) |
| Freigegebene Stimmen LEA, DAVID | **offen** (Kandidaten + Hörproben vorhanden) |
| Avatar-V-Clips LEA/DAVID | nicht erzeugt |
| Cinematic-Clips S01–S05 | nicht erzeugt |
| Screenrecordings (Plattform) | **Vorabversion** (lokal, 3-s-Scroll, Daten teils „Kurse veraltet“); Finale Aufnahme gegen die ausgelieferte, frische Seite nötig – öffentliche Seite ist passwortgeschützt, Zugang nötig |
| Sounddesign | Entwurf synthetisch (lizenzfrei, `sounddesign_draft.wav`), final zu mastern |
| Logo (weiß) | vorhanden |
| Studio-Referenz „leer“ | fehlt (nur über Cinematic oder Ausschnitt) |
| Musik | optional, Lizenzquelle offen; Entwurf nutzt nur Drone/SFX |

> **Kosten überholt:** Variante B/C beruhen auf einem falschen Produkt (Cinematic Avatar). Aktuelle Empfehlung und Kosten (≈ 4,5 USD mit `heygen-video-1`) in `COST_DISCREPANCY_ANALYSIS.md`.

## Kostenabschätzung (USD, überholt)
Gemessen: Avatar V 0,116/s · Avatar IV 0,039/s · Sprachprobe ≈ 0,01–0,02 · Bildgenerierung 0,28/Bild (HeyGen-Doku).
**Ungemessen:** Cinematic. HeyGen nennt Credits (60 bei 720p, 150 bei 1080p je Clip), keinen USD-Preis. Als **unverifizierte Obergrenze** nehme ich den Seedance-2-Preis von Runway: 0,36–0,40 USD/s ⇒ 4–5 s ≈ 1,6–2,0 USD je Clip.

| Variante | Inhalt | Rechnung | Summe |
|---|---|---|---|
| **A Lean** | S01–S05 aus bewegten Master-Stills; nur Dialoge mit Avatar V | LEA 3,2 s × 0,116 = 0,37; DAVID 1,6 s × 0,116 = 0,19; je 3 Takes ⇒ 1,7 | **≈ 1,7** (gemessen) |
| **B Standard** | + 3 Cinematic-Clips (Auftritt LEA, Auftritt DAVID, Sitzen/Winkel, je ≈ 5 s) | 3 × 2,0 = 6,0; 1,5-fache Takes ⇒ 9,0; + 1,7 | **≈ 10,7** (Cinematic unverifiziert) |
| **C Premium** | 5 Cinematic-Clips inkl. leerem Studio und Zweier-Shot, 2 Takes | 5 × 2,0 × 2 = 20,0 + 1,7 | **≈ 21,7** (übersteigt Wallet 14,72) |
**Empfehlung B mit Preis-Sonde:** vorab **ein** 4-s-Cinematic-Test (LEA-Look, Studio) für Identität und tatsächlichen USD-Preis, Budgetgrenze ≈ 2 USD, danach Entscheidung A/B/C. Dann trailerfertig innerhalb des aktuellen Guthabens.
Zusatzkosten nicht enthalten: Lizenzmusik, Rechtsprüfung, Arbeitszeit.

## Risiken
- **Identitätsdrift** in Cinematic-Shots (nur Looks als Referenz, 1–3 Looks, 4–15 s, kein Skript). Gegenmaßnahme: kurze Shots, Gesichtsvergleich mit Master, sonst Fallback auf Variante A.
- **Auflösung:** Master 1024×1536; Nahaufnahme per Zoom ≈ 1,5–1,9× ist weich ⇒ moderater Zoom, Korn, kurze Dauer. Echte Nahaufnahme-Looks wären ein eigener (kostenpflichtiger) Schritt.
- **DAVID mit Avatar V** ungetestet; Gestik nicht steuerbar.
- **Lippensync Deutsch** in Bewegung ungeprüft; Hör-/Sichtprüfung durch den Auftraggeber nötig.
- **Datenrechte:** Produktaufnahmen zeigen Prozentwerte/Indexkacheln (Discover) – vor Veröffentlichung gegen die Tiingo-/Indexlizenz-Regeln prüfen oder unscharf/ausblenden. „Kurse veraltet“-Hinweise im Finale vermeiden (frische Daten abwarten).
- **KI-Kennzeichnung** ist im Endcard enthalten; Plattform-Label zusätzlich setzen.

## Ablauf bis zum Trailer
1. Du wählst Stimmen (LEA, DAVID) · 2. Voice-IDs festschreiben, Default-Stimmen am Avatar setzen · 3. Cinematic-Preis-Sonde (Freigabe) · 4. Avatar-V-Dialoge (LEA, DAVID) · 5. Cinematic-Shots nach Variante · 6. Finale Screenrecordings · 7. Schnitt (HyperFrames/FFmpeg) + Sound-Mastering (−14 LUFS Gesamt, Dialog −16) · 8. QA (Identität, Sync, Hände, Rechte) · 9. Freigabe durch dich.
