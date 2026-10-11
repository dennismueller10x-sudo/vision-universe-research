> Recherche-Rohbericht (Mission 02, 2026-10-11), erstellt von einem Recherche-Agenten per Web-Suche; nicht unabhängig verifiziert, keine eigenen Tests. Preise vor Budgetfreigabe auf der Live-Seite gegenprüfen.

# Vier feste deutsche KI-Stimmen für Börsenvideos – Recherche (Stand 2026-10-11)

Nur Web-Recherche, keine Käufe/Konten/kostenpflichtigen Aufrufe. Kennzeichnung je Aussage:
- **[DOK]** = offizielle Doku/Preisseite des Anbieters (URL genannt)
- **[DRITT]** = unabhängige Drittquelle / Aggregator / Presse
- **[MKT]** = Marketing des Anbieters oder unbestätigt
- **[EIGEN]** = meine Ableitung/Rechnung (Annahme genannt)
- "nicht gefunden" = bewusst keine Zahl erfunden

Hinweis zur Methode: Web-Abrufe liefen über ein Zusammenfassungsmodell; Zahlen sind so übernommen, wie die Seite sie lieferte. Vor Vertragsabschluss die Live-Seite prüfen.

---

## 0. Kernergebnisse in Kürze

1. **Externe TTS-Audios können in HeyGen eingespeist werden** (`POST /v3/videos` mit `audio_url` oder `audio_asset_id` statt `script`; MP3/WAV, max. 32 MB Upload, max. 30 min pro Request). [DOK: https://developers.heygen.com/audio-to-video.md]. Das ist der robusteste Weg zu "dauerhaft identischen" Stimmen, weil man HeyGens Stimmenkatalog umgeht.
2. **HeyGens "Voice Design" erzeugt keine neue Stimme, sondern liefert deterministisch bis zu 3 Treffer aus dem Katalog** (gleicher Prompt + gleicher `seed` = gleiche Stimmen). [DOK: https://developers.heygen.com/docs/voices/design-voices.md]. Ob/wie lange die `voice_id` bestehen bleibt, ist dort nicht dokumentiert.
3. **ElevenLabs ist laut Arena Spitzenreiter** (Eleven v4 Turbo Elo 1327, v4 Elo 1323). [DRITT: https://artificialanalysis.ai/text-to-speech/leaderboard]. Kein deutschsprachiges Einzelranking gefunden.
4. **Preis-Falle Datum:** Eleven v4 steht aktuell bei $0,022/1.000 Zeichen statt $0,08, Aktion endet am **12. Oktober 2026** (morgen). [DOK: https://elevenlabs.io/pricing/api]. Für Budget immer $0,08 (v4) bzw. $0,04 (v4 Turbo) ansetzen.
5. **Größtes Stabilitätsrisiko bei ElevenLabs:** v4 kann Stimmen hörbar anders klingen lassen als v3 [DOK: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4.md]; ElevenLabs-"Default voices" laufen am 31.12.2026 ab [DOK: https://elevenlabs.io/docs/overview/capabilities/voices]. Konsequenz: Voice-ID **plus** `model_id` plus Settings plus Archiv der Referenz-Audios festschreiben; keine Default-/Standardstimmen verwenden.
6. **Günstigste solide Alternativen:** Fish Audio $15/1 Mio UTF-8-Bytes [DOK], Google Chirp 3 HD $30/1 Mio Zeichen [DOK], Azure Neural HD ~$22/1 Mio (nur DRITT; offizielle Seite zeigt "$-").

---

## 1. HeyGen

### 1.1 Stimmen, Engines, Endpunkte
- Katalog: "300+ pre-built voices across dozens of languages", `type` = `public` oder `private`. [DOK: https://developers.heygen.com/docs/voices/overview.md]. Deutsch/Locale-Liste dort **nicht** genannt (nicht gefunden).
- Engines für Speech: `orca` (HeyGen Voice, Default für die meisten öffentlichen Katalogstimmen), `starfish`, `elevenlabs` (Modelle per `settings.model_id`: `eleven_v4`, `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_flash_v2`, `eleven_turbo_v2_5`). Legacy-Wert `elevenlabs_v3` funktioniert noch. [DOK: https://developers.heygen.com/docs/voices/speech.md]
- `fish` taucht **nicht** in der Speech-Doku auf, aber in `engine_settings` von Create Video (`fish`: model, stability, similarity). [DOK: https://developers.heygen.com/reference/create-video.md]. Als Filter bei GET /v3/voices werden nur orca/starfish/elevenlabs genannt.
- Speech-Endpunkt `POST /v3/voices/speech`: `text` 1–5.000 Zeichen, `voice_id`, `engine` (optional), `speed` 0,5–2,0, `language`/`locale`, `force_regenerate` (Cache umgehen), `<break time="1s"/>`; Antwort: `audio_url`, `duration`, `engine`, `word_timestamps`. **`seed` und `emotion` nicht dokumentiert.** Preis dort nicht genannt. [DOK: speech.md, s. o.]
- Es gibt einen **Speech-Cache** ("force_regenerate skips the speech cache") – d. h. identische Anfragen können gecachtes Audio liefern; das hilft Reproduzierbarkeit, ist aber nicht als Garantie dokumentiert. [DOK + EIGEN]
- Eigene HeyGen-Voice-Modell-Klone [DOK: https://developers.heygen.com/docs/models/heygen-voice.md]:
  - Instant Clone: 1 Aufnahme (nur erste 3 min genutzt), nicht nachtrainierbar, Preis: "Free during the preview", zählt aufs Klon-Kontingent. Steuerung: `expressiveness_boost`.
  - Professional Clone: 1–10 Aufnahmen, 20+ min, Training mit Polling bis `ACTIVE`, nachtrainierbar. Steuerung: **`seed`**, `speed`, `pitch_shift`, `pitch_variance`, `<break>`. Preis: ein bezahlter Slot pro Stimme (je Slot 5 Trainings/Monat); Professional-Speech **0,6 API-Credits pro Minute**. Wert eines API-Credits in USD: nicht gefunden. Über Slot-Limit: `voice_expired`.
  - Was `seed` bewirkt, steht **nicht** in der Doku. [DOK, Lücke]
  - Sprachen/Versionen/Stabilität des Modells: nicht beschrieben.
- Für erfundene (nicht reale) Moderatoren ist ein Clone problematisch: Er braucht reale Aufnahmen eines Sprechers (Einwilligung, Lizenz). Siehe Risiken.

### 1.2 Voice-ID-Stabilität in HeyGen
- Doku sagt nur: `voice_id` aus `GET /v3/voices` holen und verwenden; Stabilität/Versionierung/Deprecation **nicht beschrieben**. [DOK: speech.md, overview.md]
- Design ist deterministisch (Prompt+Seed), aber Katalog kann sich ändern (EIGEN, nicht belegt).
- Bewertung: Wer die Stimme **in HeyGen** (Katalog/Design) festlegt, hängt an einem nicht zugesicherten Katalog. Besser: Audio extern erzeugen und als Datei einspeisen.

### 1.3 Audio → Avatar-Lipsync (externe TTS)
- `POST /v3/videos` ("pass `audio_url` (or `audio_asset_id`) instead of `script`"); genau eine Audioquelle, schließt `script` aus. `audio_url` = öffentliche HTTPS-URL; `audio_asset_id` aus `POST /v3/assets` (MP3/WAV, max. 32 MB; größere Dateien via Create Asset Upload/S3-Slot). Videolänge folgt dem Audio; bis 30 min Audio pro Request. Subject: `type: avatar` (`avatar_id`) oder `type: image`. Engine Default Avatar IV, optional `avatar_v`. Auflösung 720p/1080p, Aspect Ratios 16:9, 9:16, 1:1 u. a., `callback_url`, Captions/`subtitle_url`. [DOK: https://developers.heygen.com/audio-to-video.md]
- `voice_settings` gelten **nur** bei `script`+`voice_id`; bei hochgeladenem Audio "bypasses TTS". [DOK: https://developers.heygen.com/reference/create-video.md]
- Lipsync-Endpunkte für vorhandene Videos: Speed (nur Audio) und Precision (Avatar-Inferenz), Batch bis 100 Jobs. [DOK: https://developers.heygen.com/lipsync-speed.md, https://developers.heygen.com/batch-lipsyncs.md]. Nicht nötig für den Hauptfall.

### 1.4 Kostenfolge
- Offizielle API-Preisseite: nur im Dashboard (https://app.heygen.com/developers/api?modal=pricing), laut Index "per-operation pricing" – **nicht abrufbar, keine Zahlen von dort**. Die Audio-to-Video-Doku nennt keine Preise. [DOK]
- Help-Center "HeyGen API Pricing Explained" (zuletzt aktualisiert 16.09.2026): API ist Pay-as-you-go in USD, getrennt von Abo-Credits; Abrechnung nach tatsächlich erzeugten Sekunden. Die Preistabelle war im abgerufenen Volltext **nicht enthalten**; eine Suchzusammenfassung nannte: Avatar V Digital Twin $7,20/min, Avatar IV Digital Twin/Studio $4,83/min, Avatar IV Photo Avatar $2,31/min, Avatar III $0,60–0,99/min, Text-to-Speech $0,12/min. [DOK-Quelle https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained, aber Zahlen nur aus Suchzusammenfassung = **unbestätigt**]. Eine andere Drittquelle nennt $0,05–0,10/Sekunde, Widerspruch → Preise **vor Planung im Dashboard prüfen**. [DRITT: creatify.ai]
- Schluss: Mit externem Audio zahlt man **nur die Avatar-Sekunden** (Länge folgt dem Audio) plus die externe TTS; HeyGens eigenes TTS entfällt. Ob Audio-Input einen Rabatt gegenüber Script-Videos hat, ist **nicht dokumentiert** (nicht gefunden). Die Avatar-Sekunden kosten gleich viel wie bei HeyGen-TTS, das TTS ist also der kleine Posten.

---

## 2. ElevenLabs

### 2.1 Modelle & Preise
- Modelle: `eleven_v4` (Flaggschiff, 10.000 Zeichen/Request, German ja), `eleven_v4_turbo`, `eleven_v3` (5.000 Zeichen), `eleven_multilingual_v2` (10.000, 29 Sprachen), `eleven_flash_v2_5` (40.000). Turbo-v2/2.5 deprecated, Flash empfohlen. [DOK: https://elevenlabs.io/docs/overview/models]
- API-Preise je 1.000 Zeichen: Flash/Turbo $0,04; Multilingual v2 $0,08; v3 $0,08. **Eleven v4 $0,08 (Aktion $0,022 bis 12.10.2026); v4 Turbo $0,04 (Aktion $0,011).** [DOK: https://elevenlabs.io/pricing/api; v4-Listenpreis zusätzlich DRITT: https://www.eesel.ai/blog/eleven-v4-pricing]
- Abo-Pläne (monatlich): Free $0/10k Credits; Starter $6/30k; Creator $22/121k (1 PVC); Pro $99/600k (1 PVC); Scale $299/1,8 Mio (3 PVC); Business $990/6 Mio (10 PVC); Enterprise custom. Commercial license ab Starter. [DOK: https://elevenlabs.io/pricing]. Credit-pro-Zeichen-Satz für v4 steht auf der Seite nicht (nur "1 Credit/Zeichen" allgemein) → für v4 nicht gesichert.
- Qualität: Arena (Provider Voice Arena) Platz 1 v4 Turbo (1327), Platz 2 v4 (1323); Erscheinungsdatum Sept 2026; **kein Deutsch-Filter** (nur US/UK-Akzent). [DRITT: https://artificialanalysis.ai/text-to-speech/leaderboard]. ElevenLabs-Claim "~75 % Präferenz in Blindtests" [MKT: https://elevenlabs.io/de/blog/eleven-v4]. Unabhängigen deutschen Hörtest zu v4: **nicht gefunden**.

### 2.2 Steuerung
- v4: Audio-Tags (`[whispering]`, `[laughing]` …), Tag-Befolgung "not perfect yet"; **kein SSML, keine Style-/Speed-Slider in v4**; Stability/Similarity vorhanden. [DOK: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4.md]
- API `convert`: `seed` (0–4294967295), "Determinism is not guaranteed"; `previous_text`/`next_text`/`previous_request_ids` für Übergänge zwischen Stücken; `apply_text_normalization`; `language_code` (nicht bei multilingual_v2). [DOK: https://elevenlabs.io/docs/api-reference/text-to-speech/convert]
- Konsequenz: Reproduzierbarkeit = "nahezu", nicht bit-genau. Fertiges Audio archivieren statt neu erzeugen.

### 2.3 Voice Design / Voice Library / Stabilität
- Voice Design: Beschreibung 20–1.000 Zeichen, 3 Vorschauen, optional Preview-Text 100–1.000 Zeichen; v4 empfohlen, aber designte Stimmen "may be less performative" mit v4; kompatibel zu v2-Modellen. [DOK: https://elevenlabs.io/docs/overview/capabilities/voices]
- API: Preview → `generated_voice_id` → Create → neue `voice_id` in der Bibliothek ("use this to reference the voice"). Ob die ID dauerhaft ist, **nicht ausdrücklich dokumentiert**. [DOK: https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/voice-design]
- **Default-Stimmen laufen am 31.12.2026 ab** (nur Konten vor März 2026 hatten Zugriff), Ersatz nicht 1:1. [DOK: https://elevenlabs.io/docs/overview/capabilities/voices; https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-are-default-voices]
- v4-Klone können hörbar anders klingen als v3-Version; manche Nutzer bevorzugen v3. [DOK: v4-Seite s. o.] → Modellwechsel = potenzieller Stimmwechsel.
- Voice Library: >10.000 Community-Stimmen; für Free-Konten nicht per API. Wegfall/Entzug einer Library-Stimme: **Richtlinie nicht gefunden** (EIGEN: Risiko, da Dritte sie teilen; besser eigene Designer-Stimme).
- Deutsche Library-Stimmen konkret (Namen/Zählung): **nicht verifiziert** (Library ist dynamisch, nur im Konto auditierbar).

### 2.4 Rechte & Recht
- Kommerzielle Nutzung: Terms: wer die nötigen IP-Rechte am Input hat, darf generierten Content kommerziell nutzen; Bezahlkonten dürfen kommerziell nutzen (EEA-Terms). [DOK/Terms-Suche: https://elevenlabs.io/terms, https://elevenlabs.io/terms-of-use-eu; zusammengefasst über DRITT https://terms.law/ai-output-rights/elevenlabs/]. Library-Stimmen laut ElevenLabs mit kommerzieller Lizenz [DOK: https://elevenlabs.io/elevenlabs-voices-a-comprehensive-guide, MKT-nah].
- Klausel speziell zu **Voice-Design-Stimmen**: nicht gefunden. Urheberrecht an rein KI-erzeugter Stimme: unklar (DRITT, nicht geprüft). Vertragliche Nutzungsrechte bleiben davon unberührt.
- DSGVO: DPA öffentlich (https://elevenlabs.io/dpa laut DRITT https://compound.law/de-DE/tools/elevenlabs/); EU-Data-Residency als separater Workspace (Zugang beantragen), Speicherung in EU, Verarbeitung kann außerhalb stattfinden; Zero Retention nur Enterprise [DOK: https://elevenlabs.io/docs/product-guides/administration/data-residency; Details DRITT]. Für reine Skript-Texte (keine Personendaten) geringes Risiko.

---

## 3. Weitere Anbieter

### 3.1 Azure Speech (de-DE)
- Stimmen de-DE: HD `de-DE-Seraphina:DragonHDLatestNeural` (w), `de-DE-Florian:DragonHDLatestNeural` (m); `de-DE-Mia:MAI-Voice-2` (w), `de-DE-Klaus:MAI-Voice-2` (m) mit Stilen angry/happy/sad/whispering; Flash-Varianten Mia/Klaus; Multilingual Seraphina/Florian; Standard u. a. Katja, Conrad, Bernd. [DOK: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts]
- Preis: offizielle Seite zeigt Platzhalter "$-" → **nicht gefunden (DOK)**. Drittquelle (Calculator, 08.10.2026): Neural HD $22/1 Mio, Neural $15/1 Mio. [DRITT: https://inventivehq.com/tools/developer/tts-stt-api-cost-calculator]. Free: 0,5 Mio Zeichen/Monat Neural; HD nicht im Free-Tier. [DOK: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/]
- Steuerung: SSML (Stil nur bei unterstützten Stimmen). Stabilität: Stimmen sind feste Namen; der Suffix "Latest" in `DragonHDLatestNeural` legt nahe, dass sich das Modell hinter dem Namen ändern kann (EIGEN, Beleg für Versionspinning nicht gefunden).
- DSGVO: EU-Regionen (z. B. West Europe) wählbar, DPA über Microsoft (EIGEN/allgemein, nicht in dieser Recherche abgerufen).
- Qualität: unabhängiger Deutsch-Test: nicht gefunden.

### 3.2 Google Cloud TTS (Chirp 3 HD)
- Preis: Chirp 3 HD **$30/1 Mio Zeichen**, erste 1 Mio/Monat frei; Instant Custom Voice $60/1 Mio; Gemini-TTS tokenbasiert ($1/1 Mio Text-Tokens, $20/1 Mio Audio-Tokens bei Gemini 3.1 Flash TTS Preview; Zuordnung auf der Seite unklar). [Suchzusammenfassung der offiziellen Seite https://cloud.google.com/text-to-speech/pricing, Abruf der Seite selbst ohne Zahlen → **unbestätigt**]
- de-DE ist unterstützt, 30 Stimmen (Achernar, Kore, Leda, Puck …), Name `de-DE-Chirp3-HD-<Voice>` (Muster, nicht verifiziert). SSML (Preview, nicht im Streaming), `speaking_rate` 0,25–2,0, Pausen-Tags `[pause]`, IPA-Aussprache. EU-Regionen GA. [DOK: https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd]
- Arena: Gemini 3.8 Flash TTS Platz 5 (1272, $16,50/1 Mio). [DRITT: Artificial Analysis]
- Stabilität: feste Stimmennamen; Modellupdates/Pinning: nicht gefunden.

### 3.3 OpenAI TTS
- `gpt-4o-mini-tts` $12/1 Mio Audio-Tokens (Minutenpreis nicht gefunden); `tts-1` $15, `tts-1-hd` $30 je 1 Mio Zeichen. [DOK: https://developers.openai.com/api/docs/pricing]
- 13 Standardstimmen (marin, cedar empfohlen), per `instructions` steuerbar (Ton, Tempo, Akzent); Stimmen auf Englisch optimiert, Deutsch "performs well". Keine SSML. Pflicht: klare Offenlegung gegenüber Endnutzern, dass die Stimme KI ist. Eigene Custom Voices nur mit Einwilligungsaufnahme. [DOK: https://developers.openai.com/api/docs/guides/text-to-speech]
- Stabilität: Stimmen mit `instructions` nicht deterministisch (EIGEN); Snapshot-Pinning nicht geprüft. Für "vier feste deutsche Stimmen" nicht erste Wahl (nur vordefinierte, englisch optimierte Stimmen).

### 3.4 Cartesia
- Sonic 3 unterstützt Deutsch (42 Sprachen). [DOK: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest]
- Pläne: Free 20k Credits, Pro $5/100k, Startup $49/1,25 Mio (2 Pro-Klone), Scale $299/8 Mio; 1 Credit = 1 Zeichen; Überschuss $65/$45/$38 je 1 Mio. Kommerzielle Lizenz ab Pro. [DOK: https://cartesia.ai/pricing]. Sonic 3.6 ~$49/1 Mio (Arena Platz 4, Elo 1284). [DRITT]
- Stabilität/Deutsch-Qualität: nicht gefunden.

### 3.5 Fish Audio
- API $15/1 Mio UTF-8-Bytes (s2-pro, s1), kein Abo nötig; ca. 12 h Sprache pro 1 Mio Bytes (Anbieterangabe). [DOK: https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits]. Deutsche Umlaute = 2 Bytes (EIGEN).
- Deutsch-Qualität, Lizenz DE: nicht gefunden; kommerzielle Rechte planabhängig (nur DRITT, unbestätigt). In HeyGen als Engine-Option sichtbar (s. 1.1).

### 3.6 Nicht weiterverfolgt
- Play.ht, Deepgram Aura: für Deutsch/Qualität nicht in den Arena-Top-10; nicht recherchiert (bewusst).

---

## 4. EU AI Act Art. 50 und Kennzeichnung (keine Rechtsberatung)

- Art.-50-Transparenzpflichten gelten ab **2. August 2026**; die Pflicht zur maschinenlesbaren Markierung (Art. 50(2)) hat laut Omnibus für vor dem 2.8.2026 platzierte Systeme Übergang bis **2. Dezember 2026** (Quellen widersprüchlich, am Amtsblatt prüfen). Bußgeld bis 15 Mio € / 3 %. [DRITT: https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations; https://compliancehub.wiki/eu-ai-act-article-50-transparency-digital-omnibus-2026/]
- Finaler Code of Practice zu Kennzeichnung KI-Inhalte: 10.06.2026, freiwillig, laut Kommission geeignet für Nachweis. [DRITT: https://www.jonesday.com/en/insights/2026/06/european-commission-publishes-final-code-of-practice-on-marking-and-labelling-aigenerated-content]
- Rollen: Anbieter (ElevenLabs/HeyGen) markieren Output (50(2)); Betreiber (wir) kennzeichnen Deepfakes (50(4)) und müssen bei KI-Interaktion informieren (50(1), hier nicht relevant). Ob rein fiktive Moderatoren ein "Deepfake" im Sinne der Definition (Ähnlichkeit mit realen Personen) sind, ist Auslegung (EIGEN, juristisch klären). Empfehlung: ohnehin sichtbar "KI-generierte Moderatoren" im Video/Beschreibung kennzeichnen; OpenAI verlangt es vertraglich ohnehin [DOK].
- Zusätzlich (nicht recherchiert): Anlageberatungs-/Marktmanipulationsregeln bei Börsencontent.

---

## 5. Konzept "Vier feste Stimmen"

### 5.1 Architektur (Empfehlung)
1. **TTS extern** (nicht in HeyGen), Ergebnis als WAV/MP3 archivieren, dann `audio_asset_id`/`audio_url` → HeyGen `POST /v3/videos`. Vorteile: unabhängig von HeyGen-Katalog, Stimme voll in eigener Hand, Wechsel des Avatar-Anbieters möglich.
2. **Primär ElevenLabs (Voice Design, eigene gespeicherte Stimmen)**, `eleven_v4` (Ausdruck) oder `eleven_multilingual_v2`/`eleven_v3` (stabil/bekannt) – Modell pro Stimme **fest wählen** und nicht automatisch wechseln. Für lange Videos (bis 15 min ≈ 2.000 Wörter ≈ 14.000 Zeichen) in Absatz-Chunks ≤ 10.000 Zeichen (v4) mit `previous_text`/`next_text`/`previous_request_ids`.
3. **Fallback (Paket B, Azure-only):** Vier deutlich unterscheidbare HD-Stimmen existieren: Seraphina (w), Mia (w), Florian (m), Klaus (m) [DOK]. Vorteil: Stimmenname ist eine feste Kennung, SSML-Steuerung, EU-Region. Nachteil: Alter/Charakter nicht steuerbar; Preis nicht offiziell bestätigt.
4. Optional später: Pro-Voice-Clone bei HeyGen (Seed, nachtrainierbar) nur wenn rechtlich saubere Referenzaufnahmen eines eingewilligten Sprechers vorliegen.

### 5.2 Konkrete Zuordnung (Charakter, Stimmtyp, Anbieter)
| Charakter | Stimmprofil (Voice-Design-Prompt-Idee, Deutsch, hochdeutsch) | Primär | Fallback |
|---|---|---|---|
| LEA (~32 w) | warm, klar, mittlere Lage, ruhig-souverän, Nachrichtensprecherin-Ton | ElevenLabs Voice Design | Azure Seraphina (DragonHD) |
| DAVID (~34 m) | locker-dynamisch, mittlere Lage, sympathisch, leichtes Lächeln | ElevenLabs Voice Design | Azure Florian (DragonHD) |
| MARC (~52 m) | tief, ruhig, bedächtig, Autorität/Erfahrung, leicht raue Textur | ElevenLabs Voice Design | Azure Klaus (MAI-Voice-2) |
| SOFIA (~29 w) | hell, schnell, energisch, jung, Social-Media-Tempo | ElevenLabs Voice Design | Azure Mia (MAI-Voice-2) |
Prompts jeweils 20–1.000 Zeichen, Preview-Text 100–1.000 Zeichen mit typischen Börsenphrasen (Tickersymbole, Prozentzahlen, Kurse) – so wird die Aussprache von Zahlen/Kürzeln schon bei der Auswahl getestet. Auswahl je Charakter durch Blindtest (3 Vorschauen). Stimmen müssen sich untereinander deutlich unterscheiden (Lage, Tempo).

### 5.3 Festschreiben und Versionieren
Pro Charakter ein Repo-File (z. B. `voices/lea.json`; Hinweis: nicht unter generierte Datenordner, damit CLAUDE.md-Regeln eingehalten werden) mit:
- `provider`, `voice_id`, `model_id`, `output_format`, `stability`, `similarity_boost`, `language_code`, `seed`, `apply_text_normalization`, Pronunciation-Regeln (Tickers, "S&P 500", "DAX"), Sprechtempo-Ziel
- `design_prompt` + `preview_text` + `generated_voice_id` (Herkunftsnachweis)
- `reference_audio_sha256` und Referenz-Audios (Standardsatz ~60 s) im Archiv; bei jeder Modell-/Settings-Änderung Regressionstest (Hörvergleich + Dauer/Pegel-Messung)
- `version` (SemVer), `valid_from`, Änderungsgrund
Betriebsregeln: (a) Modell nur nach bewusstem Wechsel ändern; (b) fertiges Audio pro (Skript-Hash + Voice-Version) cachen und nie neu erzeugen; (c) Wöchentlicher Canary-Check: festen Satz synthetisieren, Dauer/Spektrum gegen Referenz prüfen (EIGEN); (d) Exit-Plan: Stimmen-Archiv + Fallback-Paket B; (e) keine Default-/Library-Stimmen (Ablauf 31.12.2026, Entzug).
- Wenn doch HeyGen-intern: `voice_id` + `engine` + `settings.model_id` + `speed` festschreiben, `force_regenerate` nur gezielt; Seed nur bei Professional Clone/Voice-Design-Suche dokumentiert.

### 5.4 Kosten pro 1.000 Wörter Skript
Annahme [EIGEN]: 1.000 deutsche Wörter ≈ 7.000 Zeichen (inkl. Leerzeichen) ≈ 7 min Sprechzeit (~145 Wörter/min). Berechnung = Preis × 7.
| Anbieter/Modell | Preis (Quelle) | USD / 1.000 Wörter |
|---|---|---|
| ElevenLabs v4 (Liste) | $0,08/1k Z. [DOK] | **$0,56** |
| ElevenLabs v4 Aktion (bis 12.10.) | $0,022/1k [DOK] | $0,15 (nicht planen) |
| ElevenLabs v4 Turbo | $0,04/1k [DOK] | $0,28 |
| ElevenLabs über Abo Creator (121k Credits/$22, angenommen 1 Credit/Zeichen, für v4 unbestätigt) | $0,18/1k [EIGEN] | ≈ $1,27 |
| Fish Audio s2-pro | $15/1 Mio Bytes [DOK], ≈7.150 Bytes | ≈ $0,11 |
| Azure Neural HD | $22/1 Mio [DRITT] | ≈ $0,15 (unbestätigt) |
| Google Chirp 3 HD | $30/1 Mio [DOK-Suche] | $0,21 (erste 1 Mio/Monat frei) |
| OpenAI tts-1-hd / tts-1 | $30 / $15 je 1 Mio Z. [DOK] | $0,21 / $0,11 |
| OpenAI gpt-4o-mini-tts | $12/1 Mio Audio-Tokens | nicht gefunden (Tokens pro Sekunde unbekannt) |
| Cartesia Sonic 3.x | Überschuss $38–65 je 1 Mio Credits [DOK]; $49/1 Mio [DRITT] | $0,27–0,46 |
| HeyGen TTS | $0,12/min [unbestätigt] × 7 min | ≈ $0,84 |
Avatar-Seite (kommt dazu, unabhängig vom TTS): bei ~7 min Video z. B. Avatar IV Studio $4,83/min [unbestätigt, help.heygen.com] ≈ $34; Photo Avatar $2,31/min ≈ $16. TTS ist also <3 % der Gesamtkosten; Stimmqualität sollte nie am TTS-Preis scheitern. Tagesvolumen (30 s–15 min): bei 15 min ≈ 2.100 Wörter ElevenLabs v4 ≈ $1,18.

### 5.5 Risiken
1. **Modell-/Katalogdrift** (ElevenLabs v4≠v3, Default-Stimmen-Ablauf, Azure "Latest"): Gegenmaßnahmen siehe 5.3.
2. **Keine garantierte Determinismus** (ElevenLabs `seed`: "not guaranteed"): Audio cachen, nicht regenerieren.
3. **Preisbewegung:** v4-Aktion endet 12.10.2026; Azure/HeyGen-API-Preise nicht abschließend verifiziert.
4. **v4 hat kein SSML/Style/Speed:** Betonung nur über Audio-Tags und Text; Tempo ggf. nachträglich per Audio-Tool (EIGEN). Aussprache von Tickern/Zahlen früh testen; `apply_text_normalization` und Skriptvorverarbeitung.
5. **Lippensync-Mismatch:** Externes Audio mit starken Pausen/Atmern kann Avatar-Mimik verändern; Pegel normalisieren, Stille trimmen (EIGEN, nicht belegt).
6. **Rechte:** Voice-Design-Klausel nicht gefunden; Urheberschutz an synthetischer Stimme unsicher; Nutzungsrecht vertraglich (bezahlter Plan) – Terms-Screenshot/Datum archivieren.
7. **Recht/Kennzeichnung:** Art. 50 (ab 2.8.2026), Kennzeichnung der KI-Moderatoren; juristisch prüfen.
8. **DSGVO:** Skripte enthalten i. d. R. keine Personendaten; EU-Residency/DPA nutzen; ElevenLabs-Verarbeitung kann außerhalb EU stattfinden (Enterprise Zero Retention).
9. **Plan-Lücken:** HeyGen-Preise für Audio-Input nicht dokumentiert; ggf. kleinen Test (1 Video, ~$) im Dashboard buchen, bevor skaliert wird – nicht Teil dieser Recherche.
10. **Quellenqualität:** Arena-Ranking ohne Deutsch-Filter; eigener Blindtest mit 5 Börsentexten Pflicht vor Festlegung.

### 5.6 Offene Punkte (nicht gefunden)
Offizielle HeyGen-API-Preistabelle und Audio-Input-Abrechnung; HeyGen-Deutsch-Stimmenliste; Azure offizieller HD-Preis; ElevenLabs v4 Credits/Zeichen im Abo; Voice-Design-Lizenzklausel; deutscher unabhängiger Hörtest (v4); Cartesia/Fish Deutsch-Qualität; Play.ht/Deepgram (nicht untersucht).
