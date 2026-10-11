> Recherche-Rohbericht (Mission 02, 2026-10-11), erstellt von einem Recherche-Agenten per Web-Suche; nicht unabhängig verifiziert, keine eigenen Tests. Preise vor Budgetfreigabe auf der Live-Seite gegenprüfen.

# Mission 02 – Automatisierte Social-Videos: Recherche, Repo-Analyse, Architektur
Stand 2026-10-11. Nur gelesen, im Repo nichts geändert. Kennzeichnung: [DOK] = Primärquelle/Repo gelesen, [MKT] = Marketing/Sekundärquelle, [GEMESSEN] = im Repo belegte Messung, [OFFEN] = nicht verifiziert.

## 0. Wichtigste Befunde vorab
1. Es gibt bereits `brand-media/` (isoliert, 4 Charaktere LEA/DAVID/MARC/SOFIA, HeyGen-Photo-Avatar "VU LEA", HyperFrames-Komposition `lea_clip15_hook_01`, Studio-Spec, QA-Statusmodell DRAFT/REVIEW/APPROVED/REJECTED). Mission 02 sollte darauf aufbauen, nicht daneben neu starten. Stand: Lea-Identität nur REVIEW, nicht APPROVED; nur Lea angelegt; Lippensync/Audio nicht beurteilt.
2. `brand-media/README.md` warnt: `pages-release.yml` veröffentlicht alle getrackten Dateien. `brand-media/` (inkl. 2 MP4 mit ~9 MB) ist laut README noch NICHT vom öffentlichen Paket ausgeschlossen (`scripts/vu2/build-release.mjs#permitted`). Das ist ein eigener PR und Voraussetzung, bevor irgendein Video-Artefakt ins Repo kommt.
3. Datenrechte: Tiingo-Freigabe für öffentliche Anzeige liegt als Eigentümererklärung vor (13.09.2026), aber `WITHHELD_REDISTRIBUTION` markiert Felder, die angezeigt, aber nicht weiterverbreitet werden dürfen. Das Social-System sagt explizit: "Ein Social-Beitrag IST Weiterverbreitung" (`social/engines/discover-evidence.js`). Ein Video mit Kursverlauf ist Weiterverbreitung außerhalb der Seite. Vor dem ersten Video mit Kurslinien/-niveaus: schriftliche Klärung mit Tiingo, ob die Freigabe auch Social/YouTube-Videos deckt [OFFEN].
4. Social-System steht auf Autonomiestufe 0, GLOBAL_AUTOPUBLISH aus, PROVIDER_YOUTUBE/TIKTOK "nicht implementiert", Meta nicht konfiguriert. Die Pipeline darf also in Phase 1 nur bis "Freigabekandidat" gehen, nie selbst veröffentlichen.

## 1. Tool-Vergleich

| Kriterium | Remotion | HyperFrames (HeyGen) | Reines FFmpeg | Motion Canvas | Revideo |
|---|---|---|---|---|---|
| Lizenz | Eigene Source-Available-Lizenz; frei für Einzelpersonen, Non-Profits und for-profit bis 3 Mitarbeiter; ab 4 Company License [DOK] | Apache 2.0, "no per-render fees or commercial-use thresholds" [DOK, README] | LGPL/GPL je Build (Codec libx264 = GPL; Hinweis, nicht geprüft) [OFFEN] | MIT (laut Projekt, auf Rendering-Seite nicht genannt) [OFFEN] | MIT [DOK, README] |
| Preise | Creators 25 USD/Monat/Seat; Automators 0,01 USD/Render, min. 100 USD/Monat; Enterprise ab 500 USD/Monat [DOK remotion.pro/license]. Seite nennt Summen unklar, vor Kauf bei Remotion nachfragen. Lizenz ändert sich "slightly" mit Remotion 5.0 [DOK] | 0 | 0 | 0 | 0 |
| Rendering | Headless Chrome + FFmpeg; CPU genügt, Parallelisierung per Concurrency | Seek je Frame in headless Chrome, Encode mit FFmpeg; Node 22+, FFmpeg [DOK]. Lokal in diesem Projekt: 15 s 1080x1920 in ca. 40 s auf Software-GPU [GEMESSEN, Auftraggeber] = ca. 2,7x Echtzeit | sehr schnell (Echtzeit oder schneller), kein Browser | Render über Editor-Button laut Doku; Headless-CLI auf dieser Seite nicht beschrieben [DOK/OFFEN] | Headless Render API (`renderVideo()`), läuft "wherever Node and a headless browser run" [DOK] |
| CI (GitHub Actions Linux, ohne GPU) | geeignet, bekannt | geeignet laut Projekt: "Built for CI, regression tests" [MKT/README]; deterministisch "same input, same frames" [MKT, vor Einsatz per Hash-Vergleich prüfen] | beste Eignung | schwächer (Editor-zentriert) | geeignet, Wartungsstand nicht verifiziert [OFFEN] |
| Chart aus JSON | React-Komponenten, beliebig (SVG + interpolate) | HTML/SVG + GSAP-Timeline, Daten per Inline-JSON oder Build-Skript; Template-HTML wird aus JSON generiert | schwach: nur drawtext/Overlay vorgerenderter PNG/Video; animierte Charts nur über Umweg (z. B. Frames aus SVG) | TypeScript-Generatoren, gut | TS, ähnlich Motion Canvas |
| Untertitel | `@remotion/captions`, Whisper-Integration (Dokumentation von mir nicht geprüft) [OFFEN] | Kinetic Captions, `/embedded-captions`, `/media-use` (Transkription/TTS) [MKT/README] | SRT/ASS einbrennen (`subtitles`/`ass`-Filter) sicher, robust | manuell | manuell |
| Audio-Mixing | `<Audio>`, Volumen/Ducking per Funktion | Audio im Producer-Paket gemischt [DOK], Ducking selbst bauen | `amix`, `sidechaincompress`, `loudnorm` (EBU R128), am stärksten | wenig | wenig |
| Passt zur Repo-Regel "Node ohne Abhängigkeiten" | npm-Abhängigkeitsbaum (React, Chrome-Downloader); nur im CI-Job installierbar | `npx hyperframes` CLI, Template ist reines HTML/GSAP; Repo hat dafür schon `package.json`/`hyperframes.json` in der Komposition | System-Binary, null npm | npm | npm |

Empfehlung (Begründung, keine Lizenzberatung):
- **Kern: HyperFrames (HTML/GSAP) für Szenen/Charts/Overlays + FFmpeg für Mux, Loudnorm, Untertitel-Einbrennen, Concat.** Gründe: Apache 2.0 ohne Schwelle, im Projekt bereits benutzt (`brand-media/video/compositions/lea_clip15_hook_01`), Templates sind reines HTML (Diff-fähig, passt zur statischen Seite), Chrome ist im CI schon vorhanden (Playwright-Workflows nutzen `npm install --no-save` und `playwright install --with-deps chromium`, z. B. `discover-live-smoke.yml`). Dasselbe Muster (`--no-save`, im Job, nicht committet) hält die Regel "Node ohne Abhängigkeiten" für das Repo ein.
- **Remotion nur als Fallback**, falls React-Komponentenmodell gebraucht wird. Prüfen: Mitarbeiterzahl >3 => Company License (mind. 100 USD/Monat Automators, bei Volumen ab ca. 10.000 Renders/Monat; 1 Video/Tag = ca. 30 Renders = Minimum 100 USD/Monat greift) [DOK]. Für unser Volumen ist das reines Festgeld.
- **Motion Canvas / Revideo:** nicht empfohlen (Editor-Fokus bzw. Wartungsstand offen, zusätzlicher Stack ohne Vorteil).
- **Risiko HyperFrames:** Jung, Herstellerprojekt von HeyGen (Abhängigkeit/Roadmap-Risiko); Determinismus-Aussage ist Marketing, mit Golden-Frame-Test absichern; Rendering ist Chrome-basiert => 10–15-min-YouTube-Berichte (ca. 18.000–22.500 Frames bei 25 fps) bei ca. 2,7x Echtzeit = grob 4–6 Minuten reine Szenen-Renderzeit, linear hochgerechnet, nicht gemessen [OFFEN]; in Segmente (je Kapitel) teilen und per FFmpeg concat.

Hinweis zur Messung: 40 s für 15 s Video [GEMESSEN, vom Auftraggeber, nicht reproduziert]. Auf GitHub-Standard-Runnern (2 vCPU) ist Faktor offen: erst Benchmark-Job fahren.

## 2. Repo-Analyse

### 2.1 Nutzbare Datenquellen (alle Pfade gelesen/geprüft)
Registry `core/registry/domains.json` (Feld `producer`, `schedule`). Für Videos relevant:

| Inhalt | Artefakt | Erzeuger | Takt | Video-Nutzung / Vorbehalt |
|---|---|---|---|---|
| Marktpuls (Indizes, Multi-Asset) | `quant/data/market/multi-asset/snapshot.json`, `quant/data/market/intelligence/market-pulse*.json` | `ingest-multi-asset.mjs`, `build-market-pulse.mjs` | alle 3 h | Marktbericht, Reel "Markt in 30 s"; Rechtestatus der Quellen je Asset prüfen |
| Marktregime | `quant/data/product/market-regime-v1.json` (+history) | Materialisierung | nach Refresh | Einordnung. Regime ist Fachmodell, nur lesen |
| Aktien (Kurs, Tagesänderung, Badges, Signale) | `discover/data/stocks/US_REAL/<T>.json` (6.293 Dateien), `discover/data/home|feed|featured` | `build-discover-data.mjs` | Mo–Fr 22:30 UTC | Aktienanalyse. `price.status`, `sparkline: null / WITHHELD_REDISTRIBUTION` beachten |
| Kursreihen 1J split-bereinigt | `quant/data/market/discover-series/ref_<T>.json` (Punkte `[Datum, Schluss]`, 270) | `publish-discover-series.mjs` | Mo–Fr | Chart-Animation. Nur Schlusskurse, ADR-002 |
| Lange Reihen | `quant/data/market/discover-series-long/` | `publish-long-series.mjs` | monatlich | 5J/Max-Charts |
| Intraday | `quant/data/market/intraday/` | `ingest-intraday.mjs` | 5 min | nicht für Videos empfohlen (Realtime/Redistribution, schnell veraltet) |
| Faktoren/Quant-Scores | `quant/data/market/factors/...`, `quant/data/product/**` | `build-market-factors.mjs` u. a. | täglich | nur lesen und zitieren |
| Technical | `quant/data/technical/` | `build-technical-data.mjs` | Mo–Fr | Setup-Erzählung |
| Supertrader | `supertrader/data/signals.json` (Disclaimer-Feld eingebettet) | `scripts/supertrader/build.mjs` | Di–Sa 06:17 | Signale; Modellsignale, "keine Anlageberatung"; Gate A: nur Supertrader-Pfade im PR |
| Fundamentals | `quant/data/fundamentals` (nicht ausgeliefert), Discover-Geschäftszahlen | `cli.py daily` | täglich 06:15 | über Discover-Felder statt Rohdaten |
| Company Intelligence | `company-intelligence/data/index.json` | `scripts/company_intelligence/cli.py` | 6 h, isolierte Vorschau | Porträt-Reel; Vorschau-Status beachten |
| News | `dashboard/data/news_feed.json` | `update_news.mjs` | nur manuell | als Themenquelle ungeeignet (veraltet) |
| Social-Signale | `social/data/signals.json`, `opportunity-slate.json`, `research-package.json` | Social-Orchestrator | täglich | Themenauswahl-Input, wenn Social-System integriert wird |

Frische: `node scripts/core/system-health.mjs` vor jedem Lauf; Video-Job bricht bei `stale` der benötigten Datenart ab (Frischeverträge stehen in der Registry).

### 2.2 Gate- und Workflow-Regeln (CLAUDE.md), die eine neue Pipeline einhalten muss
- Keine generierten Artefakte von Hand ändern oder mitbringen (`quant/data`, `discover/data`, `supertrader/data`, `social/data` gehören ihrem Erzeuger). Die Pipeline **liest** sie nur.
- Identität nur über `core/identity.js`; Preise nur über `quant/engines/return-series.js#splitFactors` und `published-close.js`; Videos zeigen nur veröffentlichte Schlüsse/abgeleitete Werte, keine zweite Ableitung.
- Fachmodelle (Scores, Rankings, Supertrader, Regime, Technical) werden nicht angefasst; Skript zitiert nur.
- Isolations-Gates: Ein PR mit Mission-02-Code darf **keine** Pfade aus `supertrader/**`, `company-intelligence/**`, `discover/**`, `scripts/discover/**`, `quant`, `scripts/market`, `scripts/technical` enthalten. Eigener Top-Level-Ordner (z. B. `video/` und `scripts/video/`) und eigene Workflows `video-*.yml`. Discover-Frontend-Budget (180.000 B) nicht berührt, solange kein Discover-JS/CSS geändert wird.
- Workflows (ADR-005), die committen: `ref: ${{ github.ref }}`, Push nur über `scripts/ci/push-with-retry.sh`, Concurrency `video-<name>-${{ github.ref_name }}`, Eingaben nur über `env:`, Prüf-Workflows `permissions: contents: read`, Diff-Gates mit `set -euo pipefail` und erreichbarer Basis. Hinweis: `push-with-retry.sh` löst Konflikte nur für fest gelistete erzeugte Dateien (`ERZEUGT`), die Liste "wird nicht vorsichtshalber erweitert" => Video-Pipeline soll Videos GAR NICHT committen (siehe 3.6).
- Keine Videos/Binärdateien nach `main` (Repo ist öffentlich, ADR sagt: Git-Historie ist dauerhaft; `social/engines/asset-store.js` beschreibt dieselbe Entscheidung: Binärassets in VU Storage (S3, `VU_HISTORY_S3_*`), im Git nur Content Object mit SHA-256, Größe, Herkunft).
- `scripts/quality/check-test-isolation.mjs`: Tests dürfen keine Produktionsdaten schreiben; Skripte bekommen `--out`.
- Tests: Node `node --test`, deshalb eigene `scripts/video/tests/*.test.mjs`.
- `pages-release.yml`/`build-release.mjs#permitted`: Neuer Ordner muss ausgeschlossen werden (nicht ausliefern: Skripte, Vorlagen, Zwischenstände), sonst werden sie öffentlich ausgeliefert. Das ist ein eigener PR (Auslieferungsregel), wie schon in `brand-media/README.md` vermerkt.
- Neue Datenart (z. B. Video-Manifeste) wird in `core/registry/domains.json` eingetragen, bevor etwas sie liest.

### 2.3 Datenrechte
- `docs/ETF_DATA_RIGHTS.md`: Statusmodell ALLOWED / ATTRIBUTION_REQUIRED / UNKNOWN (wird nicht veröffentlicht) / LICENSE_REQUIRED / NOT_PERMITTED. **Tiingo = ALLOWED per Projektstatus**: Eigentümererklärung 13.09.2026 in `quant/config/development-preview.json`: "öffentliche Anzeige der Market-Data" auf research.visionuniverse.de; Vertragstext liegt dem Repo nicht vor, keine eigene Rechtsprüfung. Die Freigabe nennt die Anzeige auf der Website, nicht ausdrücklich Weiterverbreitung in Videos auf YouTube/Instagram/TikTok => **[OFFEN] bei Tiingo klären**.
- `docs/TIINGO_COMMERCIAL_SCALE_PHASE1.md`: ausgelieferte Daten sollen "keine Kursniveaus" tragen (`stripPriceLevels`), abgeleitete Aussagen ("5 % unter dem 52-Wochen-Hoch") sind das Muster; "das Hoch liegt bei 184,20" ist der Anbieterkurs. Für Videos als Vorsichtsprinzip übernehmen: in Phase 1 relative Größen (Prozent, Indexiert auf 100, Rang) statt absoluter Kursniveaus; Kursreihen als indexierte Linie. `discover` führt für jeden Titel `performancePath` indexiert (heute = 100) – ein fertiges Muster.
- `social/engines/discover-evidence.js`: Felder mit `WITHHELD_REDISTRIBUTION|WITHHELD|LICENSED_ONLY` werden nicht zu Evidenz. Marge/Anteil/Quote über 100 % werden verworfen (Einheitenfehler in der Quelle, 24 Karten betroffen). Die Pipeline muss diese Filter wiederverwenden (nicht kopieren).
- `docs/VU_PROVIDER_LICENSE_CHECKLIST.md`: Anzeige an Dritte, Weiterveröffentlichung, abgeleitete Werte, öffentliches Git-Repo, Quellenangabe/Verzögerungsangabe sind getrennte Fragen. Video = neue Verwendungsart => Checkliste dafür abarbeiten.
- Indexstände (MSCI, STOXX, FTSE, S&P DJI) sind LICENSE_REQUIRED, ETF-Emittenten-Daten NOT_PERMITTED => in Videos keine Indexstände dieser Anbieter nennen oder anzeigen (Index-Namen als Bezeichnung nur, wenn Daten aus eigener zulässiger Quelle stammen; prüfen).
- FX ist eigene Datenklasse ohne öffentliche Freigabe (`display-policy.js`): keine EUR-Umrechnung im Video.
- Intraday/Realtime: Freigabe vorhanden, aber Videos sind nicht live; nur EOD verwenden und "Stand: Datum" einblenden.
- Musik/SFX: Lizenzquelle offen (`brand-media/docs/TRAILER.md`).
- Avatar-/Stimmenrechte: Photo Avatars haben keinen HeyGen-Consent-Flow, Nachweis liegt beim Kunden (`consentRecord`); Bildquelle und Ähnlichkeit mit realen Personen muss der Auftraggeber bestätigen (`HEYGEN_INTEGRATION.md`).
- KI-Kennzeichnung: AI Act Art. 50 (Deepfake-Offenlegung, maschinenlesbare Markierung) gilt laut artificialintelligenceact.eu ab 2.8.2026 [DOK: https://artificialintelligenceact.eu/article/50/]. Plattform-Labels (YouTube "altered or synthetic content", Instagram/TikTok "AI-generated") setzen + Einblendung "KI-generiert". Rechtsberatung nötig [OFFEN].

### 2.4 Bestehendes social/-System (nur beschrieben)
- Orchestrator (`social-orchestrator.yml`): DISCOVER → SELECT → RESEARCH → STORY → HOOK → VISUAL → CREATIVE JOB → VALIDATE → CANDIDATE → **Owner Publishing Gate** → MEASURE → LEARN. Er veröffentlicht nie selbst.
- Kandidaten: `social/data/publish-candidates/cand_*.json` (Zustand `AWAITING_APPROVAL`, `contentHash`, `imageUrl` auf `research.visionuniverse.de/assets/social/...`, Caption mit Hashtags und "Keine Anlageberatung"). Entscheidungen: `social/data/approval-feedback.json` (APPROVE/HOLD/REJECT, `decidedBy: owner`).
- Bilder: `assets/social/pkg_*.jpg` im Repo (statische Auslieferung); Binärassets ideal über `asset-store.js` (S3 + SHA-256 + `asset-integrity.js`).
- Faktenprüfung: `fact-check.js` (deterministisch, Regex für Prozent/Betrag/Multiple/Kennzahl/Kursziel/Datum/Superlative, jede konkrete Aussage braucht `sourceRef`; "wo deterministische Software reicht, kein LLM", §40) und `claim-binding.js` (jede Ziffernfolge und jeder Eigenname im Text muss an ein Evidence Object gebunden sein; keine Ausnahme für "harmlose" Zahlen).
- Video-Regeln: `visual.js`: VIDEO braucht `narrative`; MOTION_GRAPHIC braucht `timeSeries`; "Generierte Videos enthalten standardmäßig KEINE automatisch ins Bild gerenderten Texte. Text und Untertitel sind getrennte, kontrollierte Ebenen." `capabilities.js` kennt `publishVideo`, `publishReel`; `evidence-regime.js` kohortiert REEL getrennt von Bildern; `performance.js` kennt Verweildauer/Completion für Video.
- Kill Switch (`social/config/kill-switch.json`): fehlender Eintrag = AUS; `PROVIDER_YOUTUBE`, `PROVIDER_TIKTOK` "Nicht implementiert"; `PROVIDER_META` nicht konfiguriert; `ACTION_COMMENT` aus (Kommentare = untrusted input). `autonomy.json`: desiredLevel 0.
- Kollisionsvermeidung für Mission 02:
  1. Eigener Namensraum, keine Schreibzugriffe auf `social/**` (Gate-/Erzeugerhoheit: `social/data` gehört dem Orchestrator).
  2. Übergabe als zusätzliches Kandidatenformat erst per eigenem, produkteigenem PR in `social/` (so schon in `brand-media/docs/CONTENT_SYSTEM.md` festgelegt: "Anbindung an das bestehende social/-System erst nach eigenem, produkteigenem PR").
  3. Content-IDs im selben Muster (`vu-post-YYYYMMDD-<hash>`) wählen, damit Cadence/Fatigue/Memory nicht doppelt zählen; eigenes Präfix `vu-video-` vorschlagen.
  4. Orchestrator und Video-Pipeline müssen dieselbe Themenauswahl teilen (sonst Doppelthemen): Video liest `opportunity-slate.json`, schreibt nicht.
  5. Workflow-Hygiene: Social-Workflows nutzen laut ADR-005 noch nackte Pushes/direkte Eingabeinterpolation (bekannte offene Altlast). Die neue Pipeline folgt ADR-005 und kopiert diese Muster nicht.
- `brand-media` (bereits da): Freigabestatus DRAFT/REVIEW/APPROVED/REJECTED je Asset, nur APPROVED als Referenz, Disclaimer-Einblendung, Format-Vorlagen 1–5 (Dialog-Reel, Mythos & Faktencheck, Unternehmensporträt, Produktvorstellung, Marktanalyse), Prompt-Template `FORMAT | CHARAKTERE | THEMA | HOOK (≤8 Wörter) | 3 BELEGE (Quelle+Datum) | CTA | RISIKOHINWEIS`, Kamera-IDs CAM-A..E, Shots ≤ 4–5 s wegen Identitätsdrift. Gemessene HeyGen-Kosten: Photo-Avatar-Anlage 1,32 USD je Identität, Avatar IV ca. 0,03 USD/s (0,08 USD für 2,48 s), 15-s-Clip insgesamt 0,47 USD (Rohclip 12,15 s) [GEMESSEN, `registry/heygen-state.json`]. Bildgenerierung 0,28 USD/Bild laut HeyGen-Doku (Repo-Angabe).

## 3. Architektur-Skizze

### 3.1 Datenfluss
```
 [Artefakte lesen, nur lesen]            [Themenwahl]
 domains.json Frischecheck  ----------> topic-selector (liest social/data/opportunity-slate.json,
 discover/quant/supertrader/market-pulse      Regime, Movers; Dedupe gegen Video-Manifest)
            |                                     |
            v                                     v
      evidence-builder  ---- Evidence-Objekte (JSON, jede Zahl mit sourceRef, asOf, Pfad, Status)
            |    Filter: WITHHELD_*, Einheitenplausibilität, nur CALCULATED, Alter <= Frischevertrag
            v
      script-generator (LLM, nur Struktur-Output: Szenen[] mit Text, Evidenz-IDs)
            |
            v
      fact-gate (deterministisch): claim-binding + fact-check Logik -> jede Ziffer/Name an Evidenz
            |   fail -> verwerfen (kein "abschwächen")  |  pass -> semantische LLM-Zweitprüfung (nur zusätzlich)
            v
      compliance-gate: Disclaimer, keine Anlageberatung/Kauf-Verkaufsaufforderung, Verbotsliste, KI-Kennzeichnung
            v
   +---- Audio ----+    +--- Avatar (nur Sprecher-Szenen) ---+    +--- Visuals ---+
   TTS (Sprecher,     HeyGen Avatar IV je Segment <= 15 s,      HTML/GSAP-Templates mit Daten-JSON:
   Erzählstimme)       Look-ID aus avatar-registry (APPROVED)    Charts, Kennzahlkarten, Rankings,
                                                                 Playwright-Screenrecordings der Live-Seite
   +---------------------------------+---------------------------------+
                                     v
        compose: HyperFrames render je Szene -> FFmpeg concat, Untertitel (SRT/ASS), Musik-Ducking, loudnorm
                                     v
        qa-gates (automatisch): Dauer, Auflösung, Loudness (-14 LUFS Ziel, Plattform prüfen), Frame-Checks (Safe Zone),
        Text-Overflow, Hash der Eingabe-JSON, Zahlen im Frame (OCR-Stichprobe) gegen Evidenz
                                     v
        Freigabe: Kandidat (Video in S3/R2 + Manifest-JSON) -> Owner Approval (HOLD/APPROVE/REJECT)
                                     v
        Publishing: zunächst manuell; später Provider (YouTube/Meta) hinter Kill Switch + Autonomiestufe
                                     v
        Messung -> social/ performance (Verweildauer/Completion) -> Learning
```

### 3.2 Zeitplan und Frische
US-Handel endet 21:00/22:00 UTC (Sommer/Winter), Refresh Mo–Fr 22:30 UTC dauert bis ca. 70 min (ADR-005-Text) => Daily-Videos erst nach Refresh-Ende, z. B. cron 06:30 UTC (nach SEC 06:15, Supertrader 06:17), Datenstand "letzter Handelstag". Frische-Gate liest `core/health.js`. Wochenende: kein Tagesbericht oder "Wochenrückblick" (Datenlage Sa/So).

### 3.3 Skriptgenerierung per LLM mit Faktenprüfung
- LLM erhält nur Evidenz-Objekte und Format-Vorlage, nie freien Zugriff auf Web; Ausgabe als JSON-Schema (Szenen, Sprechertext, Bildschirmtext, Evidenz-IDs).
- Zahlen im Sprechertext sind Platzhalter `{{ev:ID}}`, die der Renderer deterministisch einsetzt (Rundung/Format zentral, deutsches Zahlenformat). Das LLM schreibt keine Ziffern => Halluzination von Zahlen strukturell ausgeschlossen, `claim-binding` bleibt zweite Verteidigung.
- Verbotene Inhalte: Kursprognosen, Kauf-/Verkaufsempfehlungen, Renditeversprechen; Modellsignale werden als "Modellsignal der regelbasierten Strategie" mit dem Disclaimer-Feld aus `supertrader/data/signals.json` verwendet.
- Reproduzierbarkeit: Eingabe-Evidenz-JSON + Prompt-Version + Modell-ID + Seed/Temperatur werden im Manifest gespeichert (Audit analog `social/data/audit-log.json`).
- Anthropic/LLM-Preise hier nicht eingesetzt, siehe Variablen.

### 3.4 TTS / Avatar nur für Sprechersequenzen
- Avatar nur für Hook (0–3 s), 1–2 Moderationsblöcke und CTA; Datenteile als Voice-over (TTS) über Charts. Grund: Avatar-Kosten linear in Sekunden, Identitätsdrift bei langen Shots, Gesicht nur ca. 10 % Bildhöhe bei 1080p (Lea-Test) => für Nahaufnahmen eigene Looks/Crops.
- Avatar-Segmente ≤ 15 s; zwei Moderatoren (z. B. LEA Markt, DAVID Aktie) wechselnd nach Format; nur APPROVED Looks aus `avatar-registry.json`.
- Stimme: feste Voice-ID je Charakter; deutsche Lippensynchronität im Cinematic-Modus nicht zugesichert (`QA_AND_APPROVAL.md`) => nur `create_video_from_avatar` (exaktes Skript) nutzen.
- TTS-Optionen: HeyGen-Stimme (im Avatar-Preis enthalten, zu prüfen) oder ElevenLabs für Voice-over (siehe Preise unten). Aussprache-Glossar für Tickernamen (HeyGen kennt `brand_glossary`).
- Ausfallpfad: HeyGen-Fehler => Format ohne Avatar (nur Voice-over) rendern oder Lauf verwerfen.

### 3.5 Template-Library (HTML/GSAP, Daten als JSON)
Ordner-Vorschlag (neu, außerhalb aller Gate-Pfade): `video/templates/{reel-hook,stock-card,line-chart-indexed,bar-ranking,kpi-card,regime-gauge,screen-frame,lower-third,endcard}/`, `video/brand/` (Schrift Inter, Logo aus Brand-System, Farben schwarz/Beige-Gold bzw. rot/Lime wie bestehende Komposition), `scripts/video/` (Builder, Gates, Tests). Jedes Template: `schema.json` (Pflichtfelder inkl. `sourceRef`, `asOf`), `index.html`, Golden-Frame-Test (Frame N als PNG-Hash, Toleranz). Charts: Linie zeichnen (stroke-dashoffset), Balkenrennen, Zähler; alle Daten indexiert/relativ. 
- Screenrecordings: Playwright-Aufnahme der Live-Seite (`research.visionuniverse.de`), Viewport 1080x1920 bzw. 1920x1080; Konfiguration wie in bestehenden QA-Workflows. Aufnahme gegen die **ausgelieferte** Seite, nicht gegen das Repo, damit gezeigt wird, was Nutzer sehen. Hinweis: Supertrader nur zeigen, wenn öffentlich zulässig (`TRAILER.md`).
- Text im Bild nur aus Templates (Regel `visual.js`), nie vom Avatar-/Videomodell mitgerendert.

### 3.6 Speicherung, Freigabe, Publishing
- **Binärdateien nicht nach main.** Ablage in S3/R2-Bucket über bestehenden Treiber `scripts/market/storage/s3-driver.mjs` (nicht ändern, nur importieren) oder GitHub Actions Artifacts (Retention 90 Tage Default, [OFFEN] prüfen) als Zwischenspeicher; im Repo höchstens ein kleines Manifest (SHA-256, Dauer, Evidenz-Hash) – und auch das erst nach eigener Erzeugerzuordnung in `domains.json`.
- Freigabe-Zustände analog `brand-media`: DRAFT → REVIEW → APPROVED/REJECTED; Qualitäts-Checklisten (Identität, Lippensync, Hände, Audiopegel). Anfangs: jedes Video manuell (Stufe 0). Ziel-Staffel: Reels mit Template-only (ohne Avatar) zuerst halbautomatisch, Avatar-Videos danach, YouTube-Berichte dauerhaft mit Mensch-Freigabe (Haftungsrisiko, Länge).
- Freigabe-UI: bestehendes Approval Center (`approval-center-readiness.mjs`, `publish-approval-queue.mjs`) wiederverwenden (nur per Folge-PR in `social/`).
- Publishing: Phase 1 manueller Upload mit Download-Paket (MP4 + SRT + Caption + Hashtags + Kennzeichnung); Phase 2 YouTube Data API (Owner-Schritt B existiert, `docs/VU_OWNER_STEP_B_YOUTUBE.md`), Meta Reels Graph API (Owner-Reauth, `VU_OWNER_STEP_A_META_REAUTH.md`); TikTok nicht implementiert. Hinter Kill Switch, Autonomiestufe 4 erst nach Security Review (`autonomy.json`).
- Rollback/Rückruf: Fehlerhaft veröffentlichte Videos löschen/ersetzen können (Provider-API); Korrekturprozess dokumentieren, da Finanzinhalte.

### 3.7 QA-Gates (Reihenfolge, alle hart)
1. Frische (`core/health`), 2. Evidenz vollständig/`CALCULATED`/nicht `WITHHELD`, 3. Claim-Binding aller Ziffern und Eigennamen im Skript und im Bildschirmtext, 4. Compliance (Disclaimer vorhanden, Verbotsliste), 5. Rechte-Gate (nur Datenklassen mit Freigabe; Musik-Lizenz-ID; KI-Label gesetzt), 6. technisch (ffprobe: Auflösung, fps, Codec H.264/AAC, Dauer, Pegel; Safe-Zone-Prüfung; keine schwarzen Frames/Stille), 7. Visuell (Golden-Frames je Template; Vorschaubilder je 2 s für Review), 8. Identität (manuell, bis ein automatischer Vergleich mit Datenschutzprüfung existiert), 9. Mensch-Freigabe. Ein Gate wird nicht abgeschwächt (Repo-Regel).

### 3.8 CI-Aufbau
- Workflow `video-build.yml`: `permissions: contents: read` (+ Secrets für HeyGen/TTS/LLM/S3), Concurrency `video-build-${{ github.ref_name }}`, `workflow_dispatch`-Eingaben nur über `env:`, kein Commit auf main. Node 22, `apt-get install ffmpeg`, `npx hyperframes` (Version pinnen), Chromium über Playwright (Version wie bestehende Workflows, z. B. 1.63.0), Schrift-Dateien lokal (Inter liegt schon in `brand-media/.../assets/inter-latin.woff2`).
- Getrennt davon `video-ci.yml` (Tests, `permissions: contents: read`) und Diff-Gate "PR bringt keine generierten Artefakte und keine Pfade fremder Produkte".
- Public Repo: Standard-Linux-Runner kostenlos [DOK: docs.github.com Billing, "free for public repositories"]; falls Repo privat: 0,006 USD/min (2-core x64) [DOK]. Das Repo ist laut `display-policy.js` ein öffentliches GitHub-Pages-Repository => CI-Minuten ca. 0 USD, aber Timeout und Laufzeitgrenzen (6 h je Job) beachten. Kein GPU-Runner nötig; Software-Rendering getestet.
- 10–15-min-Bericht: Segmentierung je Kapitel, parallel per Matrix-Jobs, danach concat.

## 4. Kosten-Formel (Platzhalter; reale Preise nur mit Quelle)

Pro Video i und Tag, N = Videos/Tag (1, 5, 10), 30 Tage:
```
K_Tag = Σ_i [ S_avatar,i · p_avatar_s  +  Z_tts,i · p_tts_1k/1000  +  (T_in,i·p_in + T_out,i·p_out)  +  M_ci,i · p_ci  +  B_i · p_stor · Tage_Aufbewahrung/30 ]
        + Fixkosten/30
K_Monat = 30 · K_Tag
```
Variablen:
- `S_avatar,i`: Avatar-Sekunden (nur Sprecherszenen). `p_avatar_s`: Preis/s.
- `Z_tts,i`: TTS-Zeichen. `p_tts_1k`: Preis je 1000 Zeichen.
- `T_in/T_out`: LLM-Tokens (Skript + Prüfung, ggf. mehrere Versuche k): `T = k · (Evidenz+Prompt) …`. `p_in`, `p_out` Preise je Token (siehe `claude-api`-Preisliste vor Einsatz prüfen, nicht eingesetzt).
- `M_ci,i`: CI-Minuten (Render + Avatar-Warten + QA). `p_ci`: 0 bei öffentlichem Repo; sonst 0,006 USD/min (2-core) [DOK].
- `B_i`: gespeicherte GB (MP4 + Zwischenstände); `p_stor`: Preis/GB/Monat (R2/S3: eigener Tarif, nicht recherchiert) [OFFEN].
- Fixkosten: HeyGen-Plan/Wallet-Grundgebühr, ElevenLabs-Abo, ggf. Remotion-Lizenz (nur falls Remotion), Domain/Storage-Basis.

Quellen-belegte Einzelpreise:
| Position | Wert | Status/Quelle |
|---|---|---|
| HeyGen Avatar IV (API, REST, Wallet) | ca. 0,03 USD/s (0,08 USD für 2,48 s; 0,47 USD für Clip mit 12,15 s Rohvideo = ca. 0,039 USD/s) | [GEMESSEN] `brand-media/registry/heygen-state.json`, `HEYGEN_INTEGRATION.md` |
| HeyGen Photo-Avatar-Anlage | 1,32 USD je Identität (einmalig) | [GEMESSEN] ebenda |
| HeyGen API laut Blog | 4 USD/min Avatar IV 1080p (= 0,067 USD/s), 1 USD/min Standard-Avatar | [MKT, Sekundärquelle] https://www.arcade.software/post/heygen-pricing – widerspricht der Messung (1,8 USD/min); Wallet-Messung gilt, Doku von HeyGen selbst nicht abrufbar (Seite lädt dynamisch: https://app.heygen.com/developers/api?modal=pricing) [OFFEN] |
| ElevenLabs TTS API | v4 0,022 USD je 1K Zeichen (Aktionspreis bis 12.10.2026, regulär 0,08), v4 Turbo 0,011 (reg. 0,04), v3 0,08, Flash/Turbo 0,04; Abo-Stufen: Starter 6 USD, Creator 22, Pro 99 (inkl. 1 Mio bzw. 4,5 Mio v4-Zeichen nach Tabelle, Zuordnung "inferred") | [DOK/Angebot] https://elevenlabs.io/pricing/api; **Aktion endet morgen, regulären Preis ansetzen**; kommerzielle TTS-Lizenz je Tarif dort nicht ausgewiesen [OFFEN] |
| GitHub Actions Linux 2-core | 0,006 USD/min; öffentlich/self-hosted kostenlos; Free 2.000 min/Monat (private) | [DOK] https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions |
| Remotion (falls) | Creators 25 USD/Seat/Monat; Automators 0,01 USD/Render, min. 100 USD/Monat; Enterprise ab 500 USD/Monat; frei bis 3 Mitarbeiter | [DOK] https://www.remotion.pro/license , https://github.com/remotion-dev/remotion/blob/main/LICENSE.md |
| HyperFrames | 0 (Apache 2.0) | [DOK] https://github.com/heygen-com/hyperframes |
| LLM-Tokens, Speicher | Variable | keine Quelle eingesetzt |

Mengengerüst (Annahmen, anpassen; Zielwerte, nicht gemessen):
| Format | Länge | Avatar-Anteil S_avatar | TTS-Zeichen Z (ca. 14–15 Zeichen/s Sprechtext) |
|---|---|---|---|
| Reel | 30–60 s | 6–12 s (Hook+CTA) | ca. 400–800 |
| Aktienanalyse | 1–3 min | 20–40 s | ca. 1.200–2.500 |
| YouTube-Marktbericht | 10–15 min | 60–120 s (Intro/Outro/Überleitungen) | ca. 8.000–12.000 |

Beispielrechnung (nur mit belegten/gemessenen Werten, Rest symbolisch), Avatar-Anteil je Reel 10 s, p_avatar_s = 0,039 USD/s [GEMESSEN]:
- Avatar je Reel: 10 · 0,039 = 0,39 USD. 1/5/10 Reels pro Tag: 0,39 / 1,95 / 3,90 USD pro Tag = ca. 11,7 / 58,5 / 117 USD pro Monat. Bei 4 USD/min [MKT]: 0,67 USD je Reel (Faktor 1,7).
- TTS je Reel (600 Zeichen, v3 0,08 USD/1K [DOK]): 0,048 USD; 1/5/10 = 1,44 / 7,20 / 14,40 USD/Monat. Wenn HeyGen-TTS im Avatar-Preis steckt, entfällt es.
- Ein 12-min-YouTube-Bericht: Avatar 90 s = 3,51 USD, TTS 10.000 Zeichen (v3) = 0,80 USD => ca. 4,3 USD je Bericht plus LLM/CI/Speicher.
- Gemischt 10 Videos/Tag: `K_Monat = 30 · (10 · K_Video) + Fixkosten`, K_Video je Format wie oben; LLM, Speicher, Fixkosten bleiben Variable `p_in, p_out, p_stor, Fixkosten`.

| Szenario | Variable Hauptkosten (Avatar+TTS, belegt/gemessen) | + Variablen |
|---|---|---|
| 1 Video/Tag | ca. 12–13 USD/Monat (Reel) | + LLM + Speicher + Fixkosten |
| 5 Videos/Tag | ca. 66 USD/Monat | dito |
| 10 Videos/Tag | ca. 131 USD/Monat | dito; HeyGen-Wallet/Rate-Limit prüfen [OFFEN] |
(Reel-only, 10 s Avatar, 600 Zeichen; Aktien- und Marktberichte erhöhen Avatar/TTS-Anteile gemäß Tabelle.)

Kostentreiber/Hebel: Avatar-Sekunden minimieren (Hook/CTA wiederverwenden, Intro/Outro-Cache je Look: gleiche Intro-Clips nicht neu generieren), Renderzeit begrenzen, Nachrendern nach QA-Fehler vermeiden (Fakten-Gate **vor** Avatar/TTS), Wallet-Limit/Budget-Gate im Workflow (Abbruch bei Überschreitung, Kontostand vor jedem Lauf per `GET /v3/users/me` prüfen).

## 5. Phasenplan (Vorschlag)
0. Rechte-Klärung: Tiingo-Freigabe für Social/YouTube schriftlich; Musik-Lizenz; KI-Kennzeichnung; Avatar-Consent. Eigenen PR: `brand-media/` und neue Video-Pfade aus Auslieferung ausschließen.
1. Template-only-Reel (ohne Avatar, indexierte Charts aus `discover-series`, Voice-over TTS) + Gates 1–7 + manuelle Freigabe; Benchmark-Job für Renderzeit auf Standard-Runner.
2. Avatar-Hook/CTA (LEA freigeben, dann DAVID), Aktienanalyse 1–3 min.
3. YouTube-Marktbericht (Segmentierung), Screenrecordings.
4. Anbindung an `social/` (eigener PR), Publishing-Provider hinter Kill Switch, Messung.

## 6. Offene Punkte / Risiken
- Tiingo-Weiterverbreitung in Videos (Vertragstext fehlt im Repo).
- Remotion-Lizenzseiten widersprüchlich lesbar (Enterprise-Schwelle "100 USD/Monat"); nur relevant, falls Remotion gewählt wird.
- HyperFrames: Alter/Stabilität, Lizenz Apache 2.0 aus README, Determinismus ungeprüft; Renderzeit auf Runner unbekannt.
- HeyGen-API-Preis: Messung 0,03–0,04 USD/s vs. Blog 4 USD/min; Plan-/Konto-Typ (Web-Tarif free vs. API-Wallet), Rate Limits, Kommerzielle Nutzung/ToS nicht geprüft. Lea-Test: Lippensync/Audio nicht beurteilt, Identität nur REVIEW.
- `brand-media/video/clips/*.mp4` (ca. 9 MB) liegen bereits im Git-Baum, Auslieferungsausschluss offen.
- Gemessene 40 s je 15 s stammen vom Auftraggeber; nicht reproduziert.
- Rechtliches: KI-Kennzeichnung (Art. 50 AI Act, ab 2.8.2026), Finanzwerbung/Anlageempfehlungs-Regeln (MAR/WpHG/BaFin) nicht geprüft, Rechtsberatung nötig.
