# Avatar-Technologien – Vergleich und Empfehlung

Details und Quellen: `research/avatar_engines.md`. Bewertungen 1–5 sind **Schätzungen aus Quellen, kein eigener Test** (außer HeyGen Avatar IV, dort Sichtprüfung eines Clips).

## HeyGen – was dokumentiert, getestet, unbestätigt ist
| Thema | Stand | Status |
|---|---|---|
| Photo Avatar aus Masterbild (LEA) | angelegt, Look `5962a9dd…`, `supported_api_engines`: avatar_v, avatar_iv, avatar_iii | GETESTET |
| Avatar IV (Photo Avatar) | Clip erzeugt (2,48 s und 12,15 s, 1080×1920). Motion-Prompt und `expressiveness` möglich. Körper bleibt starr, Gesicht leicht schwankend | GETESTET |
| Avatar IV Preis | gemessen ≈ 0,039 USD/s (0,47 USD für 12,15 s). HeyGen-Blog nennt 0,05 USD/s | GETESTET / UNBESTÄTIGT |
| Avatar V | **Test gelaufen, funktioniert mit dem Photo-Look**, Ergebnis siehe `LEA_AVATAR_V_TEST.md`. Doku: „highest-fidelity“, Cross-Reference-Animation, `motion_prompt`; **nur `digital_twin`** dokumentiert. Die API meldet V für unseren Photo-Look trotzdem als unterstützt. Ohne Referenz-Look wird `motion_prompt` bei Photo Avatars laut Tool-Beschreibung abgelehnt | DOKUMENTIERT, Widerspruch ungeklärt |
| Avatar V Preis | **gemessen 0,116 USD/s** (0,60 USD für 5,17 s). Blog war UNVERIFIZIERT und zu niedrig. Zuvor: HeyGen-Blog (Stand 07.10.2026): 0,0667 USD/s, aber für „Digital Twin“. Eigene Messungen weichen von den Blogzahlen ab (Avatar-Anlage 1,32 statt 1,00 USD, Avatar IV 0,039 statt 0,05 USD/s). Offizielle Preistabelle nur im Login-Dashboard | UNBESTÄTIGT |
| Digital Twin | braucht echtes Video-Footage und Einwilligung (Link, 24 h). Für eine fiktive KI-Figur ohne Footage nicht sinnvoll | DOKUMENTIERT |
| Cinematic Avatar (Seedance) | 1–3 Looks als Referenz, 4–15 s, 9:16, 720p/1080p, **kein Skript/keine Stimme**; Preis in Credits, nicht in USD gefunden | DOKUMENTIERT, nicht getestet |
| Externes Audio | `POST /v3/videos` mit `audio_asset_id`/`audio_url` statt Skript; Voice-Settings entfallen (TTS wird umgangen) | DOKUMENTIERT |
| Stimmen | `GET /v3/voices` (Deutsch, Public). Neue Instant Voice Clones in Preview gratis, Professional Clone kostenpflichtig. Voice-ID-Stabilität über Zeit nicht dokumentiert | DOKUMENTIERT |
| Rate Limits | 10 gleichzeitige Workflows (Pay-as-you-go), Videos bis 30 min | DOKUMENTIERT |
| Rechte | Photo Avatars: kein Consent-Flow bei HeyGen, Nachweis beim Kunden. ToS für kommerzielle Nutzung des API-Kontos nicht geprüft | DOKUMENTIERT / OFFEN |

## Alternativen (nur Recherche, kein Konto, kein Test)
| Anbieter | Preis (USD/s) | Eingabe | Anmerkung | Status |
|---|---|---|---|---|
| OmniHuman 1.5 (fal.ai) | 0,16 | Bild + Audio | max. 60 s (720p) / 30 s (1080p); starke Gestik laut Marketing; Deutsch nicht belegt | DOKUMENTIERT (Preis) |
| Kling Avatar v2 (fal.ai) | 0,056 Standard / 0,115 Pro | Bild + Audio | günstig; Deutsch nicht belegt | DOKUMENTIERT (Preis) |
| VEED Fabric 1.0 (fal.ai) | 0,08 (480p) / 0,15 (720p) | Bild + Audio | Widerspruch zum VEED-Support (0,05) | DOKUMENTIERT / widersprüchlich |
| Hedra Avatar / Character-3 | ≈ 0,06 (eigene Rechnung aus Plan) | Bild + Audio | 9:16, lange Clips; API-Preis nicht gefunden | UNBESTÄTIGT |
| Captions Mirage | 0,15 | Skript/Audio | 6-s-Schritte | DOKUMENTIERT |
| Runway Act-Two | 0,05 | Treibervideo nötig | kein direkter Audio-zu-Video-Weg | DOKUMENTIERT |
| Veo 3.1 / Seedance 2 | 0,36–0,40 | Prompt | keine feste Stimme, Clips 8–15 s | nicht geeignet |
| Synthesia, Tavus, D-ID, Creatify, Arcads | uneinheitlich | – | keine belastbaren API-/Minutenpreise oder API-Zugang unklar | UNBESTÄTIGT |
| Sora | – | – | Videos-API laut Drittquellen am 2026-09-24 abgeschaltet | UNBESTÄTIGT |

Für **keine** Engine ist deutsche Lippensynchronität unabhängig belegt. Jede Kandidaten-Engine braucht einen eigenen Test mit identischem deutschem Audio.

## Bewertung (Schätzung, 1–5)
| Kriterium | HeyGen IV | HeyGen V | OmniHuman 1.5 | Kling v2 | Hedra |
|---|---|---|---|---|---|
| Fotorealismus | 3 (gesehen) | 4? | 4? | 3? | 3? |
| Identitätskonsistenz | 3 (gesehen) | 4? | 3? | 3? | 3? |
| Natürlichkeit Mimik/Körper | 2 (gesehen) | 3–4? | 4? | 3? | 3? |
| Deutsch | ? | ? | ? | ? | ? |
| API-Automatisierung | 5 | 5 | 4 | 4 | 3 |
| Kosten/Minute | 2,3 USD | ≈4 USD? | 9,6 USD | 3,4 USD | ≈3,6 USD? |
`?` = nicht belegt.

## Empfehlung (vorläufig)
1. **Primär HeyGen Photo Avatar (Look-ID je Charakter)**, weil Identität, API, Rate Limits und Rechtsrahmen schon vorhanden sind. Stimme **extern erzeugt und per Audio-Datei eingespeist**, nicht an HeyGen-Katalogstimmen gebunden.
2. **Avatar V testen**, sobald der Preis bestätigt ist (siehe `LEA_AVATAR_V_TEST.md`). Gewinnt V sichtbar bei Körperbewegung, wird es Standardengine für Sprechsequenzen.
3. **Zweitengine-Vergleich** (OmniHuman 1.5 und Kling v2 über fal.ai) mit demselben Bild und Audio, je 5–6 s. Das braucht ein fal.ai-Konto und Budget – nicht freigegeben.
4. **Wirkung ohne neue Engine:** Avatar nur für Hook/Moderation/CTA (≤ 40 % der Laufzeit), Rest Voice-over mit Charts/Screens, Schnitt statt Dauereinstellung, Handkamera-Push-ins, Filmkorn. Das senkt den „KI-Avatar-Eindruck“ und die Kosten.
