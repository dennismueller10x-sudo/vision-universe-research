# HeyGen-Integration – geprüfter Stand (2026-10-10)

## Korrektur (2. Lauf): Web-Tarif ≠ API-Wallet
Die MCP-Connector-Verbindung (OAuth) bucht auf den **Web-Tarif** (free, keine Credits). Der **API-Key** (REST, `api.heygen.com`) bucht auf das **USD-Wallet** (`GET /v3/users/me` → `wallet.remaining_balance`; Stand 2026-10-10: 3,67 → 2,27 USD nach Test). Kostenpflichtige Generierung läuft daher per REST. Die Annahme „Free-Tarif verhindert Produktion“ war für die API falsch; für den MCP-Weg bleibt sie richtig. Das Legacy-Quota-Feld `/v2/user/remaining_quota` zeigt zusätzlich 220 API-Credits – Umrechnung ungeklärt, nicht verwendet.

Gemessene Kosten: Photo-Avatar-Anlage 1,32 USD je Identität; Avatar-IV-Video ≈ 0,03 USD/s (0,08 USD für 2,48 s). Bildgenerierung heygen-image-1: 0,28 USD/Bild (laut HeyGen-Doku).
Consent: Für Photo Avatars gibt es keinen HeyGen-Consent-Flow (nur Digital Twins); Einwilligung/Nachweis liegt beim Kunden → siehe `consentRecord` in der Registry.

## Verbindung (1. Lauf, Stand vor Korrektur)
- Konto erreichbar (`get_current_user`): Tarif **free**, Credits nicht ausgewiesen (`remaining: null`).
- 9 private Avatar-Gruppen vorhanden (ATLAS-Linie: Atlas TR Style, Avatar V7, Atlas V3–V6, Atlas Frau/Frau 2, Atlas Neu). IDs in `registry/avatar-registry.json#legacy`. Nichts wurde verändert.
- Keine neuen Avatare, Uploads, Bilder oder Videos erzeugt.

## Verfügbare Schnittstellen (tatsächlich vorhanden)
| Bedarf | Werkzeug | Anmerkung |
|---|---|---|
| Referenzbild hochladen | `create_asset_upload` → PUT → `complete_asset_upload` | Der Upload ist Dateitransfer zu HeyGen; Sandbox-Zugriff auf Upload-Host nicht getestet |
| Photo Avatar | `create_photo_avatar` (Name + Foto/Asset, optional bestehende Gruppe) | Identität = Avatar-Gruppe, weitere Looks in dieselbe Gruppe |
| Prompt Avatar | `create_prompt_avatar` (Prompt, ≤3 Referenzbilder, optional `avatarId`) | schwächere Identitätsbindung |
| Avatar Looks | `list_avatar_looks`, `create_template_looks`, `create_look_pack_looks`, `update_avatar_look` | Look-Pakete aus Vorlagen |
| Identitätsbild | `create_image_generation` (identity_remix, 1 Referenzbild, kein freier Prompt) | |
| Sprechendes Video, exaktes Skript | `create_video_from_avatar` | Engines: Avatar III/IV/V (je nach Look), 720p–4K, 9:16 möglich |
| Cinematic | `create_video_from_cinematic_avatar` | 1–3 Looks + Referenzen, 4–15 s, 720p/1080p, 9:16, kein Skript/Stimme (Prompt-getrieben, Seedance) |
| Bild→Video / Referenz→Video | `image_to_video`, `reference_to_video`, `create_video_from_image` | Start-/Endframe-Verfügbarkeit je Schema noch zu prüfen |
| Video Agent | `create_video_agent` (chat/generate) | offene kreative Produktion, weniger kontrollierbar |
| Lip-Sync / Stimmen | `create_lipsync`, `create_speech`, `list_voices`, `clone_voice`, `design_voice`, `update_avatar_group#defaultVoiceId` | Deutsche Stimmen noch auszuwählen |
| Digital Twin | `create_digital_twin` + `create_avatar_consent` | braucht Video-Footage und Einwilligungslink (24 h, einmalig); für fiktive KI-Figuren nicht anwendbar |

Nicht verfügbar / nicht belegt: ein dokumentiertes Mehr-Referenzbild-„Character Lock“ ausser über Avatar-Gruppen; Preise pro Generierung sind über die Werkzeuge **nicht abrufbar** – vor Freigabe im HeyGen-Dashboard prüfen.

## Rechte, Einwilligung, Kosten (zu klären, nicht behauptet)
- Kommerzielle Nutzung hängt am Tarif und den HeyGen-Nutzungsbedingungen – für den Free-Tarif vor Produktion prüfen. Wasserzeichen/Auflösungslimits im Free-Tarif möglich (nicht verifiziert).
- Die vier Figuren sind KI-generierte Bilder; die Quelle der Bilder und eine Ähnlichkeit zu realen Personen muss der Auftraggeber bestätigen. Bei Photo Avatars verlangt HeyGen Einwilligungsprozesse (`create_avatar_consent` pro Gruppe, Status in Registry).
- KI-Kennzeichnung der Reels (Plattform-Labels, EU AI Act Art. 50) einplanen.

## Freigaben, die nötig sind (nichts davon ausgeführt)
1. Upload der vier Master zu HeyGen (Datenabfluss).
2. `create_photo_avatar` ×4 (mögliche Credits/Plan-Limit).
3. Identitätstest-Bilder, danach Testvideos Sitzen / Sprechen / Kamerabewegung (jeweils Credits).
4. Trailer-Shots (siehe `TRAILER.md`).

Nach Freigabe: IDs in `avatar-registry.json` eintragen, `tools/validate.mjs` ausführen.
