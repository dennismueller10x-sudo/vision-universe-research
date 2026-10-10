# Generierungsplan (referenzbasiert)

Es wurde **kein** Bild generiert. Grund: Jede Generierung kostet Credits, das HeyGen-Konto ist laut `get_current_user` im Tarif `free`; Freigabe steht aus.

## Werkzeuge mit Identitätsbindung (laut MCP-Schnittstelle)
- `create_image_generation` (heygen-image-1, `identity_remix`): 1–5 Identitätsbilder + genau 1 Referenzbild für Kleidung/Pose/Komposition/Hintergrund. **Keine eigenen Prompts.** Geeignet für Poses/Perspektiven, wenn ein passendes Posen-/Studio-Referenzbild existiert.
- `create_prompt_avatar` (Prompt + bis zu 3 Referenzbilder, `avatarId` als visuelle Referenz): freier Prompt, schwächere Identitätsgarantie.
- `create_photo_avatar`: Foto → Avatar (Looks, Video).
Bei Abweichungen: **keine** automatische Freigabe.

## Reihenfolge (Gate-gesteuert)
1. **Identitätstest je Charakter (1 Bild, `side-left` oder `seated-front`)** – Kosten klein, vor allem anderen. Vergleich mit Master (QA-Checkliste).
2. Nur bei Bestehen: restliche 8 Bilder je Charakter. Bei Nichtbestehen: Methode wechseln (Prompt-Avatar mit 3 Referenzen), nicht Menge erhöhen.
3. Studio-Referenzen zuerst ohne Personen (`empty-room`) als Referenzbild für identity_remix-Hintergrund.
4. Alle Ergebnisse: Status `REVIEW`, dann manuelle Freigabe.

## Prompt-Bausteine
**STUDIO_BASE:** „Black minimalist film studio, matte black stone table 240×110 cm, black leather ribbed office chairs, dark polished concrete floor with soft warm reflections, one warm vertical wall light top left, soft key light 3200K from front left, subtle rim light, cinematic shadows, shallow depth of field, fine film grain, muted palette black and warm beige, photorealistic, no neon, no holograms, no CGI elements.“
**IDENTITY_LOCK:** „Same person as reference image, identical face, eyes, nose, mouth, hair colour and style, skin texture with natural pores, same body build and same clothing. Do not beautify, no skin smoothing, natural hands with five fingers.“
**NEGATIVE:** „plastic skin, over-symmetry, extra fingers, distorted hands, different face, different hairstyle, neon, hologram, text, watermark, uncanny expression.“

## Shot-Prompts (je Charakter: `{CHAR}` = Beschreibung aus CHARACTER_BIBLE)
| Slot | Prompt-Zusatz |
|---|---|
| side-left / side-right | „90° profile view, seated at table, looking toward the other chair, CAM-B, 50 mm“ |
| fullbody | „standing full body at studio, walking toward chair, wide shot, 35 mm, feet visible“ |
| seated-3q-left | „seated, three-quarter view from front left, hands relaxed on table, CAM-C“ |
| seated-front | „seated frontal, forearms on table, CAM-A“ |
| expr-warm | „close-up, subtle genuine half-smile, eyes engaged“ |
| expr-focused | „close-up, thoughtful, slight frown of concentration“ |
| dialogue-a | „mid-speech, looking at conversation partner off-camera right, over-the-shoulder, 50 mm“ |
| dialogue-b | „listening, slight nod, looking at partner off-camera left“ |

Prompt = `STUDIO_BASE` + `IDENTITY_LOCK` + `{CHAR}` + Shot-Zusatz; `NEGATIVE` wo unterstützt.

## Ausgabeformat
Ziel 9:16 (Video) und 2:3 (Stills). Videomaster brauchen ≥ 1080×1920 – Originale (1024×1536) reichen nur mit Upscale. Registry-Felder `format`, `sha256`, `model`, `heygenId` beim Eintrag befüllen; Hash-Prüfung via `tools/validate.mjs`.

## Medienablage
Generierte Medien unter `library/`, `studio/`, `video/` via Git LFS (`brand-media/.gitattributes`). Zu klären: LFS-Kontingent im Konto und Erreichbarkeit des LFS-Servers (nicht getestet); Alternative: R2-/Bucket-Ablage mit Hash in der Registry. Repository ist bereits 2,6 GB groß.
