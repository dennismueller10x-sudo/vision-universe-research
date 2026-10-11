# Voice Identity System – vier feste deutsche Stimmen

Details und Quellen: `research/voices.md`. **Es wurde keine Stimme angelegt, gekauft oder geklont.** Keine Stimme wurde angehört; alle Vorschläge sind Kandidaten.

## Kernentscheidung
Stimme und Avatar **entkoppeln**: Audio extern erzeugen, archivieren, als `audio_asset_id` in `POST /v3/videos` einspeisen (DOKUMENTIERT: bei Audio-Eingabe wird HeyGens TTS umgangen, bezahlt werden nur die Avatar-Sekunden plus der TTS-Anbieter). Damit hängt die Stimme nicht an Katalog- oder Modelländerungen von HeyGen und lässt sich für jeden Avatar-Anbieter wiederverwenden.

## Optionen
| Option | Pro | Contra | Status |
|---|---|---|---|
| HeyGen-Katalogstimmen (`/v3/voices`, Deutsch) | sofort, im Avatar-Workflow, keine Zusatzkosten bekannt | Stabilität der Voice-ID über Zeit nicht dokumentiert, Klang „TTS“, keine Emotionssteuerung im Speech-Endpunkt | GETESTET nur „Lea“ (`becf484d…`) |
| HeyGen Instant Voice Clone | gratis in der Preview | braucht eine Aufnahme (Quelle? ein Klon einer echten Stimme wirft Rechte-/Einwilligungsfragen auf) | DOKUMENTIERT, nicht genutzt |
| ElevenLabs (v3 / v4 / multilingual v2), Voice Design | derzeit höchste Naturlichkeit laut Drittranking (kein Deutsch-Filter), Voice Design ohne echte Person, kommerziell ab Starter-Abo (6 USD/Monat) | Determinismus nicht garantiert (Seed), v4 ohne SSML, Modell-Updates ändern den Klang, Default-Stimmen laufen am 31.12.2026 ab, Lizenzklausel für designte Stimmen nicht gefunden | DOKUMENTIERT / UNBESTÄTIGT |
| Azure de-DE HD (Seraphina, Mia, Florian, Klaus) | vier unterscheidbare Stimmen, SSML | offizieller Preis nicht abrufbar, Name „LatestNeural“ deutet Modelldrift an | UNBESTÄTIGT |
| Google Chirp 3 HD (de-DE, 30 Stimmen) | EU-Region, 30 USD/1 Mio Zeichen (Suchzusammenfassung), 1 Mio/Monat frei | Qualität Deutsch ungetestet | UNBESTÄTIGT |
| Cartesia, Fish, OpenAI | siehe Rohbericht | OpenAI nur 13 englisch-optimierte Stimmen | UNBESTÄTIGT |

## Empfohlenes Vorgehen
1. **Blindtest** (Freigabe nötig, Kosten < 5 USD): 5 Börsentexte × 4 Charaktere × 2 Kandidaten (ElevenLabs Voice Design, bestes HeyGen/Azure/Google-Paket). Hörbewertung durch den Auftraggeber.
2. Pro Charakter genau **eine** Stimme festlegen und in `avatar-registry.json` versioniert ablegen: `voiceProvider`, `voiceId`, `modelId`, Settings, `seed`, `designPrompt`, Hash eines Referenz-Audios, `voiceVersion` (SemVer).
3. **Fertiges Audio cachen** (Hash aus Skripttext + Voice-Version), nie dasselbe Skript neu erzeugen.
4. **Canary:** wöchentlich ein fester Satz je Stimme erzeugen und gegen das Referenz-Audio vergleichen (Dauer, Pegel, Spektralprofil; Hörprobe bei Abweichung). Modelländerung ⇒ neue Voice-Version, kein stilles Update.
5. Chunking ≤ 10.000 Zeichen mit Kontext (`previous_text`) für lange Berichte.

## Vorläufige Charakterprofile (Zielklang)
| Charakter | Zielklang | HeyGen-Kandidat (ungehört, nur Platzhalter für Tests) |
|---|---|---|
| LEA | klar, warm-souverän, analytisch | „Lea“ `becf484d4ec3411b992206f95e6a3aa5` (genutzt, Auftraggeber: „künstlich“) |
| DAVID | ruhig, sympathisch, locker | „Nero – Thoughtful & Clear“ `ef0632945bc64e3b888bd83a50363671` |
| MARC | tief, ruhig, autoritär | „Mordecai – Serious & Composed“ `d284344a1ba04039bdfdede36a319f32` |
| SOFIA | hell, schnell, neugierig | „Jane – Bright & Energetic“ `133d11fe30af4bd7914bdbe4586357c1` |

## Rechtliches
Kommerzielle Nutzung: ElevenLabs ab bezahltem Konto, Details prüfen. Stimmen realer Personen nicht klonen. KI-Kennzeichnung der Moderatoren (EU AI Act Art. 50, ab 2.8.2026; Auslegung für fiktive Figuren offen – Rechtsberatung). 
