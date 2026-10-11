> Recherche-Rohbericht (Mission 02, 2026-10-11), erstellt von einem Recherche-Agenten per Web-Suche; nicht unabhängig verifiziert, keine eigenen Tests. Preise vor Budgetfreigabe auf der Live-Seite gegenprüfen.

# Recherche: API-fähige Talking-Avatar-/Lip-Sync-Engines (Alternative/Ergänzung zu HeyGen)

Stand: 2026-10-11. Nur Web-Recherche (WebSearch/WebFetch), keine Käufe, keine Konten, keine Tests.

## Legende und Einschränkungen (wichtig)

- **DOKUMENTIERT** = offizielle Doku-/Pricing-Seite des Anbieters oder der Hosting-Plattform (URL genannt). Bei fal.ai: Modellseite von fal ist offiziell für den fal-Preis, nicht für das Modell des Herstellers.
- **DRITTQUELLE** = Blog, Vergleichsseite, Reseller, Aggregator.
- **MARKETING/UNBESTÄTIGT** = Werbeaussage des Anbieters oder nicht verifizierbar.
- "nicht gefunden" = in dieser Recherche nicht auffindbar. Keine Preise erfunden. Viele Preisseiten lieferten beim Abruf nur Teilinhalt (JS-Seiten); wo Quellen widersprechen, steht beides.
- Die Suchwerkzeuge liefern teils zusammengefasste Seiteninhalte. Preise vor Budgetfreigabe immer auf der Live-Seite gegenprüfen.
- **Bewertungen 1-5 sind eine Schätzung auf Basis von Quellen, KEIN eigener Test.** Für Deutsch gibt es fast nirgends belastbare Tests.
- Der Preisstand ist je Quelle "Abruf 2026-10-11", Seiten-Datierung wenn bekannt.

## 1. Schnellüberblick Preise (USD, Ausgabesekunde)

| Anbieter / Modell | Preis | Umgerechnet pro Minute | Status |
|---|---|---|---|
| HeyGen Avatar IV Photo Avatar (API) | $0.05/s (720p/1080p), 4K $4/min | $3.00/min (4K $4.00) | DOKUMENTIERT (help.heygen.com, s. u.) |
| HeyGen Avatar IV Digital Twin / Avatar V | ca. $0.0667/s bzw. 48 Credits/min (Studio) | ca. $4/min | DRITTQUELLE; Avatar-V-API-Preis offiziell nicht gefunden |
| HeyGen Seedance 2 (Cinematic) | 60 Credits (720p) / 150 Credits (1080p) pro Clip (ca. 15 s), Studio-Credits | USD nicht gefunden | DOKUMENTIERT als Credits (help.heygen.com), USD-Umrechnung nicht gefunden |
| Hedra Character-3 | 6 Credits/s; Plan Basic $20 = 2.000 Credits, also ca. $0.01/Credit | ca. $0.06/s = $3.60/min (eigene Rechnung) | DRITTQUELLE (Credit-Satz), Plan-Preis DOKUMENTIERT (hedra.com/pricing); API-USD-Preis nicht gefunden |
| ByteDance OmniHuman 1.5 (fal.ai) | $0.16/s | $9.60/min | DOKUMENTIERT (fal.ai Modellseite/Guide) |
| Kling AI Avatar v2 Pro (fal.ai) | $0.115/s | $6.90/min | DOKUMENTIERT (fal.ai) |
| Kling AI Avatar v2 Standard (fal.ai) | $0.0562/s | $3.37/min | DOKUMENTIERT (fal.ai, laut Suchzusammenfassung; Drittquelle bestätigt) |
| VEED Fabric 1.0 (fal.ai) | $0.08/s (480p), $0.15/s (720p) | $4.80 / $9.00 | DOKUMENTIERT (fal.ai); VEED-Support nennt $0.05/s (Widerspruch) |
| Captions/Mirage "Avatar X" (Mirage API) | $0.15/s, 6-s-Schritte aufgerundet | $9.00/min | DOKUMENTIERT (captions.ai/help/docs/api/pricing); andere Suchseite nannte "Mirage Video 1" $0.175/s (Widerspruch) |
| Runway Act-Two | 5 Credits/s, $0.01/Credit | $3.00/min | DOKUMENTIERT (docs.dev.runwayml.com/guides/pricing) |
| Runway Veo 3.1 mit Audio / Fast | 40 / 15 Credits/s | $24 / $9 pro min | DOKUMENTIERT (gleiche Seite) |
| Runway Seedance 2 (480-720p / 1080p) | 36 / 40 Credits/s | $0.36 / $0.40 pro s | DOKUMENTIERT (gleiche Seite) |
| Google Veo 3.1 (Gemini API) | Standard $0.40/s mit Audio, Fast $0.10-0.30, Lite $0.05-0.08 | $24/min Standard | DRITTQUELLE; Google-Seite nicht abgerufen |
| Tavus Video Generation | Overage $0.80-1.00/min plus Plan ($59 / $397 mtl.) | $0.80-1.00/min | Plan-Preise DOKUMENTIERT (tavus.io/pricing); Minutenpreis uneinheitlich |
| Synthesia | kein API-Minutenpreis; Creator-Plan nötig, ca. $64-89/Monat, ca. $3/min effektiv | ca. $3/min | DRITTQUELLE |
| D-ID | 1 Credit je 15 s; Plan Launch ab $35 (180 Credits) | ca. $0.2/min nominell (Rechnung unsicher) | DRITTQUELLE, widersprüchlich |
| Creatify Aurora (API) | 1 Credit/s (aurora_v1), 0.5 Credit/s (fast); API Starter $99 = 500 Credits | Credit-USD je nach Plan, ca. $0.20/s bei $99/500 | DOKUMENTIERT (Changelog docs.creatify.ai) für Credits; Plan-USD DRITTQUELLE |
| Arcads | kein Preis veröffentlicht; ca. 800 Credits/min, Einstieg ca. $110/Monat | nicht gefunden | DRITTQUELLE/UNBESTÄTIGT; API-Zugang nicht belegt |
| OpenAI Sora 2 | Videos-API am 2026-09-24 abgeschaltet | n/a | DRITTQUELLE (mehrere Blogs zitieren OpenAI-Deprecation); nicht empfehlbar |

## 2. Detailtabelle je Anbieter

Spalten: Modell | Eingabe | API | Preis | Max. Länge | Auflösung/9:16 | Körper/Gestik | Deutsch Lip-Sync | Stimme | Identität | Rechte/Einwilligung | Kennzeichnung

### 2.1 HeyGen (Avatar IV, Avatar V, Cinematic/Seedance)

- **Modelle:** Avatar IV (Photo Avatar, Digital Twin), Avatar V (Start laut Releasebot 2026-05-04, DRITTQUELLE), Seedance-2-"Avatar Shots" (Cinematic), Video Agent.
- **Eingabe:** Photo Avatar aus einem Bild; Skript+TTS (HeyGen-Stimmen, Voice-Clone) oder eigenes Audio. DOKUMENTIERT (help.heygen.com, HeyGen-MCP-Funktionen create_photo_avatar, create_video_from_avatar, create_video_from_image in dieser Umgebung sichtbar).
- **API:** ja. DOKUMENTIERT (developers.heygen.com; Seite pricing-and-credits war beim Abruf 404). API-Wallet in USD, Start $5, 10 gleichzeitige Videos, Credits 12 Monate gültig, seit Feb 2026 keine Gratis-API-Credits. DOKUMENTIERT (help.heygen.com/en/articles/10060327).
- **Preis:** Photo Avatar (Avatar IV) $3.00/min bei 720p/1080p, $4.00/min bei 4K, nach tatsächlichen Sekunden. DOKUMENTIERT, aber Seitenabruf lieferte die Preistabelle nicht; Wert stammt aus Suchzusammenfassung der HeyGen-Hilfe, G2 bestätigt $0.05/s (DRITTQUELLE). Avatar IV Digital Twin $4/min (DRITTQUELLE), Avatar V ca. $0.0667/s bzw. 48 Credits/min (DRITTQUELLE/uneinheitlich). Avatar-Erstellung ca. $1 pro Aufruf (DRITTQUELLE). Seedance 2: 60 Credits (720p) oder 150 Credits (1080p) je Clip, pauschal unabhängig von Länge (help.heygen.com, DOKUMENTIERT, Credits nicht USD); Luma-Artikel nennt 120 Credits/min (Widerspruch). Fal-Seedance-2-Preise (nicht HeyGen): $0.30/s 720p, $0.68/s 1080p (DRITTQUELLE).
- **Max. Länge:** nicht gefunden für Avatar IV/V per API. Trial-Token 60 s mit Wasserzeichen (DOKUMENTIERT, docs.heygen.com/reference/limits). Wireflow-Wrapper nennt 60 s Audio pro Avatar-V-Render (DRITTQUELLE). Avatar-V-Marketing: Konsistenz über 30 Minuten (MARKETING, fal.ai/heygen-avatar).
- **Auflösung/9:16:** 720p/1080p/4K (DOKUMENTIERT); Portrait über Video Agent orientation="portrait" (DOKUMENTIERT in MCP-Beschreibung). Wireflow-Node nennt Avatar V fix 16:9 1080p (DRITTQUELLE) - für Vertikal prüfen.
- **Körper/Gestik:** Avatar IV: Gestik aus Audio abgeleitet (MARKETING); kein dokumentierter Gestik-Prompt. Avatar V "lernt Bewegung" (MARKETING, heygen.com/avatars/avatar-v). Seedance-2-Modus erlaubt Prompt-gesteuerte Kamera/Bewegung (MARKETING/help-Artikel "avatar shots powered by seedance2").
- **Deutsch:** 175+ Sprachen, 50+ Stimmen (MARKETING, fal.ai/heygen-avatar). Unabhängiger Deutsch-Test nicht gefunden.
- **Stimme:** Voice-Clone und Voice-Design (HeyGen-MCP: clone_voice, design_voice, DOKUMENTIERT als Funktion). Feste Stimme pro Avatar wählbar.
- **Identität:** Avatar-Gruppe/Look-ID bleibt gleich; "Identität auf Modellebene" (MARKETING). Photo Avatar aus Referenzbild ist der natürliche Weg für das 1024x1536-Standbild. Avatar V ist laut Seite auf Video-Aufnahme ausgelegt, Foto-Eingang unklar (DRITTQUELLE-Hinweis); auf fal nur Preset-Avatare, keine eigenen (DOKUMENTIERT fal.ai/heygen-avatar).
- **Rechte/Einwilligung:** Für Digital Twin Einwilligung verpflichtend (create_avatar_consent, DOKUMENTIERT als MCP-Funktion). Regeln für rein synthetische Fiktivfiguren (Photo Avatar aus KI-Bild): nicht gefunden. Kommerzielle Nutzung: Terms nicht geprüft.
- **Kennzeichnung:** Eigene Pflicht-Label-Regel nicht gefunden; Wasserzeichen nur im Trial/Test.

### 2.2 Hedra (Character-3, Avatar, Omnia)

- **Modell:** Character-3 (Vorgänger), Hedra Avatar (Nachfolger), Omnia (Ganzkörperbewegung). DOKUMENTIERT (hedra.com/docs/pages/developer/guides/generate-avatar-video).
- **Eingabe:** Startbild + Audio + optionaler `text_prompt`; Dauer = Audiolänge. Skript+TTS vermutlich über Hedra-Studio (nicht verifiziert).
- **API:** ja (generations-Endpunkt). DOKUMENTIERT.
- **Preis:** Character-3 6 Credits/s (DRITTQUELLE, usagepricing/Scopeful); Basic $20/2.000 Credits, Pro $50/7.200, Ultra $100/18.000 (DOKUMENTIERT hedra.com/pricing). Daraus ca. $0.007-0.01/Credit, also $2.5-3.6/min (eigene Rechnung, nicht veröffentlicht). Reiner API-USD-Satz: nicht gefunden.
- **Max. Länge:** Avatar-Modell 10 Minuten (DOKUMENTIERT, Modellseite); Character-3 60 s (DRITTQUELLE, pletor).
- **Auflösung/9:16:** 540p/720p/1080p, 1:1, 16:9, 9:16 (DOKUMENTIERT, Modellseite; zwei Hedra-Seiten widersprechen bei der Seitenverhältnisliste).
- **Körper/Gestik:** Text-Prompt für Szene/Bewegung (DOKUMENTIERT als Parameter; Wirkung nicht belegt); Omnia für Ganzkörper (DOKUMENTIERT als Modell-ID).
- **Deutsch:** nicht gefunden.
- **Stimme:** Hedra-Studio kann TTS/Voice; API-Detail nicht gefunden.
- **Identität:** Referenzbild als Startframe je Aufruf; keine persistente Identität dokumentiert.
- **Rechte:** Bezahlpläne kommerziell (DOKUMENTIERT hedra.com/pricing); Fiktivfiguren-Regeln nicht gefunden. Kennzeichnung: nicht gefunden.

### 2.3 Captions / Mirage

- **Modell:** Mirage Avatar X (Bild oder Video + Audio -> Video). DOKUMENTIERT (captions.ai/help/docs/api/pricing).
- **API:** ja. **Preis:** $0.15/s, aufgerundet auf 6-s-Schritte (DOKUMENTIERT); eine weitere Seitenfassung nannte $0.175/s (Widerspruch); fal-Reseller $0.30/s (DRITTQUELLE, novoads).
- **Max. Länge/Auflösung/9:16/Sprachen/Rate-Limit:** nicht auf Preisseite; Rate-Limit Videogenerierung 2 Anfragen (DRITTQUELLE-Suchausschnitt der Doku, unbestätigt).
- **Körper/Gestik, Deutsch, Stimme, Identität, Rechte, Kennzeichnung:** nicht gefunden. Mirage wird als "expressive" beworben (MARKETING).

### 2.4 Synthesia

- **Modell:** Express-Avatare (u. a. Express-2 Ganzkörper laut DRITTQUELLE), Stock-Avatare, Skript+TTS.
- **API:** ja, ab Creator-Plan (DOKUMENTIERT docs.synthesia.io: Create-Video 60/min, 300/h, 1.000/Tag). Eigenes Bild als Avatar: nicht belegt (Synthesia setzt auf Aufnahme/Stock-Avatare).
- **Preis:** kein öffentlicher API-Minutenpreis; Creator ca. $64-89/Monat, Standardvideo 2 Credits/s (DRITTQUELLE), Zusatz-API-Nutzung "Contact sales". Effektiv ca. $3/min (DRITTQUELLE).
- **Übrige Felder:** Länge, Auflösung, Deutsch (Synthesia wirbt mit 140+ Sprachen, MARKETING, nicht verifiziert in dieser Recherche), Rechte, Kennzeichnung: nicht gefunden. Passt eher schlecht zum "Referenzbild"-Workflow.

### 2.5 D-ID

- **API:** ja. **Preis:** nur Drittquellen, widersprüchlich (1 Credit je 15-s-Block, Launch $35, Scale ca. $297; kommerzielle API ab Launch). Avatar-v4-/Expressive-Preis: nicht gefunden.
- **Übrige Felder:** nicht gefunden. Klassischer Foto-zu-Talking-Head-Anbieter, Körper/Gestik begrenzt (Einschätzung).

### 2.6 Tavus

- **Modell:** Replicas (Phoenix-Rendering laut DRITTQUELLE), Video Generation und Conversational Video.
- **Eingabe:** Replica aus 1-2 Min Video, bei manchen Tiers ein Einzelbild (DOKUMENTIERT tavus.io/pricing, zwei Versionen auf der Seite). Skript+TTS, Custom-Voice.
- **API:** ja. **Preis:** Free (5 Min), Starter $59/Monat, Growth $397/Monat plus Overage $1.00/$0.90/$0.80 pro Min, 30-s-Minimum, Rundung 6 s (DOKUMENTIERT). Replica-Training Overage $40-65. Max. Länge Video: nicht angegeben.
- **Deutsch, Gestik, Rechte, Kennzeichnung:** nicht gefunden.

### 2.7 Runway (Act-Two, Gen-4.5, Aleph, Veo/Seedance via Runway)

- **Act-Two:** Performance-Transfer (Treiber-Video + Charakterbild/-video), kein Audio-zu-Video. 5 Credits/s = $0.05/s = $3/min (DOKUMENTIERT). Für "Skript -> Sprecher" nicht direkt; man bräuchte ein Treibervideo (z. B. aus TTS-Lipsync) - umständlich. Das ist Einschätzung, nicht belegt.
- **Veo 3.1 mit Audio** $0.40/s, Fast $0.15/s; Seedance 2 $0.36-0.40/s; Seedance 2.5 $0.20-0.68/s; Gen-4.5 $0.12/s (DOKUMENTIERT). Credits $0.01. Web-App-Credits getrennt von API (DRITTQUELLE).
- Max. Länge, Deutsch, Rechte, Kennzeichnung: nicht geprüft/nicht gefunden.

### 2.8 ByteDance OmniHuman 1.5 (fal.ai, BytePlus, Replicate)

- **Eingabe:** Bild mit Person + Audio (mp3/wav/m4a/aac/ogg) + Prompt-Feld (DOKUMENTIERT fal.ai).
- **API:** ja über fal.ai; BytePlus direkt ($0.12/s, DRITTQUELLE). Replicate: nicht geprüft.
- **Preis:** $0.16/s (DOKUMENTIERT fal.ai); OmniHuman 1.0 $0.14/s; Reseller $0.045-0.18/s (DRITTQUELLE).
- **Max. Länge:** 60 s bei 720p, 30 s bei 1080p (DOKUMENTIERT fal-Guide). Längere Sendungen = Segmentierung nötig.
- **Körper/Gestik:** Kopf, Mimik, Oberkörpergesten korrelieren mit Sprache (DRITTQUELLE, inference.sh, zu 1.0). Prompt-Wirkung nicht dokumentiert.
- **Deutsch:** "mehrsprachig trainiert" (DRITTQUELLE), ~90 % Phonem-Genauigkeit Marketing ohne Deutsch (MARKETING/UNBESTÄTIGT). Kein Deutsch-Test gefunden. Unscharfe Bilder/verrauschtes Audio senken Qualität; am besten Einzelsprecher (DRITTQUELLE).
- **Stimme:** keine (nur Audio-Eingang; TTS separat, z. B. ElevenLabs). Dadurch feste Stimme trivial extern lösbar.
- **Identität:** Referenzbild identisch pro Aufruf -> gute Konsistenz, aber Kleidung/Hintergrund folgen dem Bild (Einschätzung).
- **Rechte/Kennzeichnung:** auf fal-Seite nicht angegeben; Lizenzbedingungen nicht geprüft.

### 2.9 Kling AI Avatar (v2 Standard/Pro)

- **Eingabe:** Bild + Audio + optionaler Prompt (DOKUMENTIERT fal.ai). **API:** fal.ai, Kling-API, Runware.
- **Preis:** Pro $0.115/s, Standard $0.0562/s (fal.ai).
- **Länge:** Ausgabe = Audiolänge, kein Maximum auf fal-Seite; Hedra-Seiten: 1 min; Runware: 5 min (Widerspruch, DRITTQUELLE).
- **Auflösung:** 1080p/48 fps laut Quellen (DRITTQUELLE/MARKETING); fal-Seite nennt keine Auflösung.
- **Deutsch:** nicht bestätigt. Cliprise (DRITTQUELLE) nennt Lip-Sync für Englisch, Japanisch, Koreanisch, Chinesisch - Deutsch fehlt. Risiko.
- **Stimme/Identität/Rechte/Kennzeichnung:** Stimme extern; sonst nicht gefunden.

### 2.10 VEED Fabric 1.0 (zusätzlich relevant)

- Bild + Audio -> Talking-Video, API via fal.ai und VEED. $0.08/s (480p), $0.15/s (720p) (DOKUMENTIERT fal.ai). Max. 1 min pro Aufruf (VEED-Doku, DRITTQUELLE-Auszug; andere Seite 5 min). Fast-Variante vorhanden. Deutsch: nicht gefunden.

### 2.11 Google Veo 3.1 mit Audio

- Text/Bild -> Video mit generiertem Ton, **kein Audio-Eingang für feste Stimme** (Einschätzung). Gemini API Standard $0.40/s (1080p mit Audio), Fast $0.10-0.30, Lite $0.05-0.08 (DRITTQUELLE). Clips max. 8 s bei 1080p/4K (DRITTQUELLE). Über Runway $0.40/s (DOKUMENTIERT).
- Für ein Moderatorenformat ungeeignet als Hauptweg: kurze Clips, Stimme/Text nicht exakt steuerbar, Stimmen driften zwischen Clips (Einschätzung). Deutsche Sprache möglich, Qualität nicht belegt.

### 2.12 OpenAI Sora

- Videos-API laut mehreren Quellen am 2026-09-24 abgeschaltet, Apps schon 2026-04-26 (DRITTQUELLE). Frühere Preise sora-2 $0.10/s, sora-2-pro $0.30-0.70/s. **Nicht planen.** OpenAI-Quelle selbst nicht abgerufen.

### 2.13 Creatify / Arcads

- **Creatify:** API mit Aurora (Bild/Avatar + Audio/Skript), aurora_v1 1 Credit/s, fast 0.5 Credit/s seit Mai 2026 (DOKUMENTIERT, docs.creatify.ai Changelog); alte Billing-Seite zeigt noch 15-s-Blöcke. Plan-USD: API Starter $99 / 500 Credits, Pro $299 / 2.000 (DRITTQUELLE) -> ca. $0.15-0.20 pro Credit. Deutsch, Max-Länge, Rechte: nicht gefunden. Ausrichtung UGC-Werbung.
- **Arcads:** kein veröffentlichter Preis, API-Zugang nicht belegt, Schauspieler-Avatare realer Personen (Einwilligung bei Anbieter). Für eigene Fiktivfiguren ungeeignet (Einschätzung).

## 3. Rechte, Einwilligung, Kennzeichnung

- **Einwilligung:** Für echte Personen verlangen HeyGen (Consent-Schritt für Digital Twin) und andere eine Zustimmung. Für rein KI-generierte Fiktivfiguren ohne reale Vorlage ist bei keinem Anbieter eine explizite Regel gefunden worden. Terms jedes Anbieters vor Produktivstart prüfen (nicht geprüft). Risiko: KI-Bildgenerator darf keine reale Person ähnlich genug reproduzieren.
- **Kommerzielle Rechte:** Hedra: Bezahlpläne kommerziell (DOKUMENTIERT). D-ID: kommerzielle API ab Launch (DRITTQUELLE). Übrige: nicht geprüft/nicht gefunden.
- **EU AI Act Art. 50 (Kennzeichnung):** Gilt laut mehreren Fachquellen ab 2026-08-02 (DRITTQUELLE; Ropes & Gray, CSA, compliancehub). Betreiber, die Deepfakes (KI-erzeugte Bild-/Video-/Audioinhalte, die realen Personen/Orten/Ereignissen ähneln) veröffentlichen, müssen offenlegen; Anbieter müssen Ausgaben maschinenlesbar markieren (Art. 50(2)). Eine deutsche Quelle nennt für Altsysteme eine Übergangsfrist bis 2026-12-02 für Art. 50(2) (UNBESTÄTIGT, Verordnung (EU) 2026/1744 laut Quelle, selbst nicht geprüft). Offene Frage: ob vollständig fiktive Moderatoren als "Deepfake" gelten; sicherer ist, die Moderatoren klar als KI-generiert zu kennzeichnen (z. B. Einblendung/Beschreibung). Rechtsberatung einholen. Zusätzlich Börsenformat: keine Anlageberatung, Hinweis auf Fiktivität der Moderatoren (nicht recherchiert, fachlich naheliegend).

## 4. Bewertung 1-5 (SCHÄTZUNG auf Quellenbasis, KEIN eigener Test)

5 = am besten. Kosten: 5 = billig.

| Anbieter | Fotorealismus | Identität | Mimik/Körper | Deutsch | API-Automation | Kosten/Min | Hinweis |
|---|---|---|---|---|---|---|---|
| HeyGen Avatar IV (Photo) | 4 | 4 | 4 | 4 | 5 | 4 ($3) | Deutsch nur Marketing |
| HeyGen Avatar V | 5 | 5 | 5 | 4 | 3 (Foto-Eingang/API unklar) | 3 | wenige belastbare Quellen |
| HeyGen Seedance 2 | 5 | 3 | 5 | 3 | 3 | 2 | Cinematic, flatterhafte Stimme/Länge |
| Hedra Character-3/Avatar | 4 | 4 | 4 | 3 | 4 | 4 | Deutsch nicht belegt |
| OmniHuman 1.5 (fal) | 5 | 4 | 5 | 3 | 5 | 2 ($9.60) | 60-s-Grenze |
| Kling Avatar v2 Pro | 4 | 4 | 4 | 2 | 5 | 3 ($6.90) | Deutsch ungeklärt |
| Kling Avatar v2 Std | 3 | 4 | 3 | 2 | 5 | 4 ($3.37) | |
| VEED Fabric 1.0 | 3-4 | 4 | 3 | 3 | 5 | 3 | 1-min-Limit |
| Captions Mirage | 4 | 4 | 4 | 3 | 4 | 2 ($9) | wenige Details |
| Runway Act-Two | 4 | 4 | 4 | n/a | 4 | 4 | braucht Treibervideo |
| Synthesia | 4 | 3 | 3 | 4 | 3 | 3 | Foto-Workflow fehlt |
| D-ID | 3 | 3 | 2 | 3 | 4 | 4 | Talking-Head |
| Tavus | 4 | 4 | 3 | 3 | 4 | 4 | Plan-Grundgebühr |
| Creatify Aurora | 4 | 3 | 4 | 3 | 4 | 3 | UGC-Fokus |
| Veo 3.1 | 5 | 2 | 5 | 3 | 4 | 1 | keine feste Stimme |

## 5. Empfehlung für vier feste Fiktiv-Moderatoren (Referenzbild 1024x1536, Deutsch, sitzend)

Architektur-Vorschlag (Einschätzung): Stimme getrennt über TTS/Voice-Clone erzeugen (feste Stimme, deutsch prüfbar), dann Audio + Referenzbild an eine Audio-getriebene Engine. So bleibt die Stimme engine-unabhängig und die Engines austauschbar.

1. **HeyGen Avatar IV Photo Avatar (Primär):** $3/min dokumentiert, volle API, Voice-Clone, Look-ID pro Moderator; Avatar V beobachten, sobald Foto-Eingang/API-Preis offiziell belegt ist.
2. **ByteDance OmniHuman 1.5 über fal.ai (Zweitengine/Qualitätsvergleich):** dokumentierter Preis $0.16/s, Bild+Audio, starke Körpergestik; Segmente <=60 s (720p). Deutsch-Lip-Sync zuerst mit eigenem Testclip prüfen.
3. **Hedra Avatar/Character-3 (Dritte, auch als Ersatz bei langen Clips bis 10 min):** 9:16, Prompt-Parameter, günstig (ca. $3.6/min eigene Rechnung); API-USD-Satz vorher beim Anbieter klären. Alternativ Kling Avatar v2 Std/Pro als günstiger Zusatz, falls Deutsch-Test besteht.

Nicht empfohlen: Sora (abgeschaltet), Veo (keine feste Stimme, 8 s), Arcads (reale Schauspieler, kein Preis), D-ID/Synthesia (schwächerer Foto-Workflow).

Nächste Schritte: je Engine einen 20-s-Testclip mit identischem deutschen Audio und identischem Referenzbild; Lip-Sync, Identitätsdrift, Handhaltung am Tisch und 9:16-Zuschnitt vergleichen; Terms/Fiktivfiguren-Klausel und AI-Act-Kennzeichnung rechtlich klären.

## Quellen (Auswahl)

- https://docs.dev.runwayml.com/guides/pricing (Runway, offiziell)
- https://fal.ai/models/fal-ai/bytedance/omnihuman/v1.5 und https://fal.ai/learn/devs/omnihuman-15-user-guide
- https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro
- https://fal.ai/models/fal-ai/veed/fabric
- https://fal.ai/heygen-avatar
- https://www.captions.ai/help/docs/api/pricing
- https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained ; https://docs.heygen.com/reference/limits ; https://help.heygen.com/en/articles/14448006
- https://www.hedra.com/pricing ; https://www.hedra.com/docs/pages/developer/guides/generate-avatar-video ; https://www.hedra.com/models/video/hedra/avatar
- https://www.tavus.io/pricing
- https://docs.creatify.ai/api-reference/changelog.md
- https://docs.synthesia.io/reference/paginating
- Drittquellen: creatify.ai-Blog, g2.com/articles/heygen-api-pricing, usagepricing.com, wavespeed.ai, benchlm.ai, zilliz.com (Sora), ropesgray.com / cloudsecurityalliance.org (AI Act)
