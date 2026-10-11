# Trailer 01 – „Cinematic Studio Launch“: Produktionsplan

Stand 2026-10-11 · 20,000 s · 1080×1920 · 25 fps · Deutsch · Hauptfiguren LEA und DAVID.
**Es wurde nichts Kostenpflichtiges generiert.** Wallet vor der Arbeit und danach: **14,72 USD**. Vorab-Schnitt mit Platzhaltern (Masterbilder statt generierter Szenen): `video/trailer/trailer01_animatic_v3/animatic_v3_720p.mp4`, Komposition `…/composition/`.

## 1. Finales Storyboard und Shot-Liste
| Shot | Zeit | Inhalt | Quelle / Modell | Dauer generiert | Ton |
|---|---|---|---|---|---|
| 01 Empty Room | 0–2 | dunkler Raum, schwarzer Tisch, zwei Stühle, Lichtkegel auf der Tischfläche, langsame Dolly nach vorn | **heygen-video-1**, Plate **G1** | – (Teil von G1, 10 s) | Raumton, Drone, Spannungsaufbau |
| 02 Arrival | 2–5 | LEA von links, DAVID von rechts, Halbtotale | Plate **G1** | | Schritte, Aufbau; **Off 1** |
| 03 Table | 5–8 | beide setzen sich (LEA links, DAVID rechts), fließender Bogen 90–120° um den Tisch, Gimbal-Look | Plate **G1** | | Stühle, Whoosh; **Off 2** |
| 04 Question | 8–10,5 | Nahaufnahme LEA: „Investierst du noch nach Bauchgefühl?“ | **Avatar V**, Look LEA, Stimme nach Freigabe | ≈ 2,6 s | Dialog |
| 05 Answer | 10,5–12 | Nahaufnahme DAVID, leichtes Lächeln: „Nicht mehr.“ | **Avatar V**, Look DAVID | ≈ 1,5 s | Dialog |
| 06 Reveal | 12–17 | 4 Schnitte à 1,25 s: Discover, Quant, Technical Intelligence, Supertrader; Kamerazooms; Datenstand eingeblendet | echte lokale Plattformaufnahmen (Stand 09.10.2026) | – | Riser, Hits je Schnitt, Musik-Höhepunkt |
| 07 Brand | 17–20 | Schwarz 17,0–17,4 (Musik stoppt), „ANDERE RATEN. DU VERSTEHST.“, Logo VISION UNIVERSE, Hinweis KI-generiert; **Off 3** | HyperFrames, offizielles Logo | – | Sub-Impact 17,4, Sting 18,4 |
Plate G1 deckt 0–8 s ab (10 s generiert, 2 s Reserve für Schnitt). Die Plate-Schritte werden mit dem Sounddesign gemischt.

## 2. Sprecher- und Dialogskript (exakt wie im Briefing)
| Zeile | Sprecher | Text | Fenster | geschätzte Dauer | Passt? |
|---|---|---|---|---|---|
| Off 1 | Off-Sprecher | „Jeden Tag tausende Aktien. Millionen Meinungen.“ | 2,0–5,0 | 3,3–3,9 s (16 Silben, 4,1–4,8 Silben/s) | **knapp zu lang**; Start bei 1,7 s oder Tempo 1,1 |
| Off 2 | Off-Sprecher | „Doch was zählt wirklich?“ | 5,0–8,0 | ≈ 1,2 s | ja, Start 5,6 s |
| LEA | LEA | „Investierst du noch nach Bauchgefühl?“ | 8,0–10,5 | ≈ 2,0–2,2 s | ja |
| DAVID | DAVID | „Nicht mehr.“ | 10,5–12,0 | ≈ 0,8 s (+ Lächeln) | ja |
| Off 3 | Off-Sprecher | „Vision Universe.“ | 18,3–20,0 | ≈ 1,6 s | ja, eng |
Schätzgrundlage: gemessene Sprechrate der HeyGen-Stimmen (≈ 4,1 Silben/s Katalogstimme, ≈ 4,8 bei Avatar V). **Tatsächliche Dauern erst nach den TTS-Proben messbar.** Falls Off 1 zu lang bleibt, **Kürzungsvorschlag zur Freigabe:** „Tausende Aktien. Millionen Meinungen.“ (13 Silben, ≈ 3,0 s). Keine zusätzlichen Sätze.
Untertitel dezent unten (Off 1, Off 2, LEA, DAVID); bei Off 3 ersetzt die Typografie den Untertitel.

## 3. HeyGen-Eingaben und Prompts
**Referenzbild-Eingaben (Doku `heygen-video-1`):** `reference_images` bis 9, `reference_videos` bis 3 (nur die ersten 5 s), `reference_audio` bis 3, insgesamt 12; Items als `url`, `asset_id` oder `base64`; im Prompt als `<Picture 1>`, `<Picture 2>` (Reihenfolge der Liste). `prompt_enhancement: disabled` hält den Prompt unverändert. `seed` macht Ergebnisse reproduzierbar (nur innerhalb eines Deployments). Image ≤ 16 MB per URL. Doku-Hinweis: Gesichter am besten klein oder abgewandt, ohne „no retouching“-Klausel driften sie ins Geglättete. Looks/Avatar-IDs sind für dieses Modell **nicht** unterstützt, nur Referenzbilder. Ob die Personen über mehrere Clips gleich bleiben, ist **nicht dokumentiert und ungetestet**.
Referenzen: `<Picture 1>` = LEA-Master (HeyGen-Asset `5e9787a3e500418a91f73d7d02937c9c`, Original `originals/lea_master_original.png`), `<Picture 2>` = DAVID-Master (`e746360d109047cab0777f9571e50610`, `originals/david_master_original.png`). Es gibt keine eigene Referenz für „leeres Studio“; der Raum wird im Prompt beschrieben (Masterbilder liefern Stil).
**Anfragen (nicht ausgeführt)**, `pipeline/trailer01/requests/`:
| Datei | Modell/Endpoint | Parameter |
|---|---|---|
| `g1_plate_768_test.json` | heygen-video-1, `reference_to_video`, `POST /v3/models/videos` | 10 s, 768p, 9:16, seed 2026, Referenzen LEA+DAVID |
| `g1_plate_1080_final.json` | wie oben | 1080p (3 × Preis), nur nach bestandenem 768p-Test |
| `f1a_entrance_768.json`, `f1b_sit_orbit_768.json` | Fallback: Plate in zwei 5-s-Teile | je 5 s, 768p |
| `s04_lea_avatar_v.json`, `s05_david_avatar_v.json` | Avatar V, `POST /v3/videos` | Look LEA `5962a9dd…` / DAVID `91bd009c…`, 1080p, **Voice-ID = Platzhalter** |
| `vo1/2/3_speech.json` | `POST /v3/voices/speech`, Engine `orca`, Deutsch | **Voice-ID = Platzhalter** |
Das Skript `tools/heygen.mjs` bricht bei Platzhaltern (`…PENDING…`) mit Exit 3 ab (getestet) und bei Kostenüberschreitung mit Exit 2.
**Plate-Prompt G1 (Kern):** „Photorealistic live-action footage shot on 35mm film with an ARRI Alexa … no retouching … A fully dark minimalist film studio … rectangular matte black table … two black leather chairs at the short ends facing each other … one soft cone of warm light on the tabletop … low locked-off camera, slow dolly forward for two seconds, nobody in frame. Then from the left the woman identical to `<Picture 1>` and from the right the man identical to `<Picture 2>` walk calmly to the table in a medium-wide shot … they sit down (woman left, man right) … the camera glides in one fluid gimbal-like arc of about 100 degrees … faces stay small and natural … Sound: room tone, footsteps on concrete, chair movements, no music, no speech. No text, no logos, no screens, no windows, no extra people, no neon, no holograms, no face or outfit changes.“ (Vollständig in `g1_plate_768_test.json`.)
Avatar V: kein `motion_prompt` (für Photo-Looks ohne Referenz nicht zulässig), Skript = exakter Dialogsatz.

## 4. Kostenplan (Reihenfolge nach Kostenrisiko)
Gemessen: Avatar V 0,116 USD/s, TTS-Probe ≈ 0,01–0,02 USD. Nicht gemessen: heygen-video-1 laut HeyGen-Blog (Liste 10/2026) 0,03 USD/s bei 768p, 0,09 USD/s bei 1080p (Doku: „1080p = 3 × 768p“); die Oktober-Aktion kann die 768p-Rate halbieren.
| # | Schritt | Rechnung | USD | Freigabe-Gate |
|---|---|---|---|---|
| 0 | Stimmen von LEA, DAVID, **Off-Sprecher** wählen | Proben Off-Sprecher (3 Kandidaten) ≈ 3 × 0,02 | 0,06 | du |
| 1 | **G1-Test**: Plate 10 s, 768p | 10 × 0,03 | **0,30** | du, danach Sichtprüfung |
| 2 | bei Bestehen: G1 final 1080p (alternativ 768p behalten) | 10 × 0,09 | 0,90 | du |
| 3 | Fallback nur bei Identitätsverlust: F1A+F1B 768p | 2 × 5 × 0,03 | 0,30 | du |
| 4 | Off 1–3 per TTS | 3 × ≈ 0,02 | 0,06 | Stimmen freigegeben |
| 5 | LEA Avatar V (≈ 2,6 s) | 2,6 × 0,116 | 0,30 | Stimme freigegeben |
| 6 | DAVID Avatar V (≈ 1,5 s) | 1,5 × 0,116 | 0,17 | Stimme freigegeben |
| **Minimalpfad** | 1, 4, 5, 6 (768p-Plate) | | **≈ 0,83** | |
| **Standardpfad** | 0–2, 4–6 | | **≈ 1,80** | |
| **Planbudget inkl. Wiederholungen** | 3 × G1-768p (0,90), 1 × final (0,90), Fallback (0,30), 3 × LEA (0,90), 3 × DAVID (0,51), 2 × TTS (0,12), Proben (0,06) | | **≈ 3,7** | Hartlimit 5 USD |
Harte Einzelgrenzen: ein Plate-Aufruf (10 s) kostet laut dokumentierter Sekundenabrechnung höchstens 0,90 USD, ein Avatar-V-Clip ≤ 4 s höchstens 0,47 USD. Der Wallet-Stand wird vor jedem Aufruf geprüft (`tools/heygen.mjs balance`), **keine automatischen Wiederholungen**.
Reihenfolge-Logik: erst der günstige 768p-Plate-Test (entscheidet über den Rest), dann Stimmen, dann Avatar-V-Dialoge, zuletzt der teure 1080p-Plate. Nicht enthalten: Lizenzmusik (Sounddesign ist synthetisch und lizenzfrei).

## 5. Verwendete Referenzbilder und Assets
- `originals/lea_master_original.png`, `originals/david_master_original.png` (SHA-256 in `originals/SHA256SUMS`), Asset-IDs siehe oben.
- Avatar-Looks: LEA `5962a9dd56595ecc894cd10ceac004eb`, DAVID `91bd009cb1c607c1065257daa4c85b8f`.
- Plattformaufnahmen: `video/trailer/platform_recordings_2026-10-09/` (Discover, Quant, Technical, Supertrader-Hero), Datenstand 09.10.2026, frisch geprüft mit `node scripts/core/system-health.mjs` (Discover/Quant/Technical/EOD OK, **Supertrader STALE**: keine Signale gezeigt, nur Hero; vor dem Final-Render erneut prüfen und nur bei aktuellem Stand Signale aufnehmen).
- Logo: `assets/vision-universe-logo.png` (offizielles Logo, weiß invertiert, keine KI-Variante).
- Sounddesign-Entwurf: `…/composition/assets/sounddesign_v3.wav` (synthetisch, Skript `tools/trailer01-sounddesign.py`).

## 6. HyperFrames-Komposition (Zielaufbau)
`index.html` (root `main`, 20 s, 1080×1920): Spuren Plate/Avatar-V-Clips (`<video data-start …>` mit Zuschnitt 1080×1890 → 1080×1920), Plattformvideos (4 × 1,25 s, Zoom-Keyframes auf Kernelemente), Grading (CSS-Filter bzw. FFmpeg-`eq`/`curves`, leicht entsättigt, Kontrast +8 %), Vignette und Filmkorn (Overlay), Untertitel (Inter, dezent), Typografie ANDERE RATEN. / DU VERSTEHST. (GSAP), Logo, Hinweis „KI-generierte Charaktere · Keine Anlageberatung“, Audio-Spuren: Sounddesign, Off-Stimme, Dialoge (Ducking −10 dB der Musik bei Dialog), Zielpegel −14 LUFS gesamt, Dialog ≈ −16 LUFS. Renderzeit ≈ 1,8 min lokal (Animatic gemessen). Ausgabe: 1080×1920 H.264/AAC, exakt 20,000 s, danach `ffprobe`-Prüfung.
Animatic v3 (liegt vor) enthält bereits Timing, Untertitel, Produktschnitte mit „Datenstand 09.10.2026“, Typografie, Logo und Sounddesign; Platzhalter sind die Szenen 01–05.

## 7. Qualitätskontrolle (pro Shot, Ergebnis REVIEW, keine Auto-Freigabe)
Identität LEA/DAVID (`tools/identity-contact-sheet.py`, Vergleich mit Master) · Kleidung · Körperbewegung (`tools/motion-metrics.py`) · Stuhl-/Tischposition (LEA links, DAVID rechts) · Kamerabewegung plausibel · keine zusätzlichen Personen · Hände · keine Gesichtswechsel · Stimmen natürlich (Hörprüfung durch dich; ich kann Klang nicht beurteilen) · Lippensync (ASR-Gegenprobe + deine Prüfung) · Übergänge · Plattformdarstellung (Daten datiert). Scheitert ein Shot, wird das dokumentiert; Wiederholung nur nach deiner Freigabe.

## 8. Bekannte Einschränkungen und Entscheidungen
1. **Blickrichtung LEA (Shot 04):** Avatar V hat keine Blicksteuerung; LEAs Master schaut in die Kamera, nicht zu DAVID. Optionen: (a) Interview-Blick in die Kamera akzeptieren (Standard), (b) Avatar IV mit `motion_prompt` („blickt nach rechts“, 0,039 USD/s, aber geringere Qualität). DAVIDs Master blickt nach oben links und passt zur Blickachse zu LEA.
2. **Pose:** Avatar V löst die Hand vom Kinn (Handgeste); nicht steuerbar.
3. **Identität in Plate G1:** ungetestet; Gesichter bleiben klein. Falls LEA/DAVID nicht erkennbar bleiben → Fallback in zwei Teilshots, sonst Variante mit bewegten Masterbildern.
4. **Plate-Ton:** wird mitgeneriert; Schritte/Ambience nutzbar, Musik/Sprache per Prompt ausgeschlossen. Vorschlag: Plate-Ton leise unter dem Sounddesign.
5. **Format:** heygen-video-1 liefert 1080×1890 statt 1080×1920 ⇒ auf 1920 Höhe skalieren und ≈ 17 px seitlich beschneiden.
6. **Supertrader:** Signale veraltet ⇒ nur Hero, bis die Daten aktuell sind.

## 9. Offene Freigaben
1. Stimmen **LEA** (1–5) und **DAVID** (1–3) aus der Hörprobe → Voice-IDs.
2. **Off-Sprecher:** Freigabe für 3 Hörproben (≈ 0,06 USD) mit unbehörten Kandidaten *Wolf Spencer* `ad9c4386…` (tief, ruhig), *Ilya – Firm & Measured* `cd74981d…`, *Deep Dieter* `11894967…`.
3. **G1-Test** (10 s, 768p, ≈ 0,30 USD, Hartgrenze 0,90 USD).
4. Entscheidung Blickrichtung LEA (Option a oder b) und ggf. Kürzung Off 1.
5. Nach Sichtprüfung: Final-Plate 1080p (≈ 0,90 USD) und die Avatar-V-Dialoge (≈ 0,47 USD je Take-Satz).
6. Datenrechte für die Produktaufnahmen sind bekannt (Tiingo, Marketstack); Supertrader-Signale erst bei aktuellem Datenstand.
7. **PR #583** muss vor dem Merge des Branches (liegt `brand-media/` mit Binärdateien); keine Merges durch mich. Gate A/Company-Intelligence/Discover-Gates sind nicht berührt (nur `brand-media/`).
