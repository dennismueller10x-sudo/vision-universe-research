# Architektur der täglichen Social-Produktion

Vollständig mit Quellen: `research/pipeline.md`. Alles Konzept, nichts gebaut außer der lokal getesteten HyperFrames-Komposition `video/compositions/lea_clip15_hook_01`.

## Werkzeugwahl
**HyperFrames (HTML/GSAP, Apache 2.0 laut README) + FFmpeg**. HyperFrames für Szenen, Charts, Overlays (lokal getestet: 15 s 1080×1920 in ≈ 40 s). FFmpeg für Concat, Untertitel, Loudnorm, Ducking. **Remotion nur Fallback:** Unternehmenslizenz ab 4 Mitarbeitern (Automators ≥ 100 USD/Monat laut remotion.pro/license, Seite unklar). Motion Canvas/Revideo nicht empfohlen. Renderzeiten auf Standard-Runnern sind ungemessen ⇒ Benchmark-Job vor Einsatz.

## Datenfluss
```
Frische-Check (core/health, domains.json) → Themenwahl (liest social/data/opportunity-slate.json)
→ Evidence-Builder (nur veröffentlichte Artefakte; WITHHELD_* ausfiltern; relative/indexierte Größen)
→ Skript per LLM als JSON mit {{ev:ID}}-Platzhaltern (das LLM schreibt keine Zahlen)
→ Fakten-Gate (deterministisch, claim-binding/fact-check wiederverwenden) → Compliance-Gate (Disclaimer, keine Empfehlung)
→ [parallel] TTS (feste Stimme) | Avatar nur Hook/Moderation/CTA | Visuals (Templates, Charts, Screenrecordings)
→ Compose (HyperFrames je Szene → FFmpeg) → technische/visuelle QA → Owner-Freigabe → manuelles Publishing
```
Das Fakten-Gate läuft **vor** TTS und Avatar, damit keine Kosten für verworfene Skripte entstehen.

## Datenquellen (nur lesen)
`quant/data/market/discover-series/` (1 J, split-bereinigt), `discover/data/stocks/US_REAL/`, `quant/data/market/intelligence/market-pulse*.json`, `quant/data/product/market-regime-v1.json`, `quant/data/technical/`, `supertrader/data/signals.json` (Disclaimer-Feld mitführen), `company-intelligence/data/index.json` (Vorschau-Status). Nicht geeignet: `dashboard/data/news_feed.json` (nur manuell), Intraday.

## Gate-Regeln (CLAUDE.md), die die Pipeline einhält
- Liest Erzeuger-Artefakte, **bringt keine mit** und ändert keine Fachmodelle. Identität über `core/identity.js`, Preise über `splitFactors`/`published-close` (ADR-002).
- Eigener Top-Level-Ordner (`video/`, `scripts/video/`) und eigene Workflows; ein PR darf nie Pfade von `supertrader/**`, `company-intelligence/**`, `discover/**`, `quant`, `scripts/market`, `scripts/technical` mitnehmen.
- Workflows nach ADR-005 (`ref: ${{ github.ref }}`, Eingaben nur via `env:`, Prüf-Workflows `contents: read`, `set -euo pipefail`). Neue Datenart erst in `core/registry/domains.json` eintragen.
- **Keine Videos nach `main`.** Ablage in S3/R2 (vorhandenes Muster `social/engines/asset-store.js`) oder Actions-Artifacts; im Git höchstens Manifest mit SHA-256.
- Auslieferung: `brand-media/` und `video/` müssen aus dem Pages-Paket ausgeschlossen werden (PR #583 deckt `brand-media/`, `video/` fehlt noch).
- Das bestehende `social/`-System steht auf Autonomiestufe 0, kein Auto-Publish, YouTube/TikTok nicht implementiert. Die Pipeline endet bei „Freigabekandidat“ und schreibt nicht in `social/**`; Anbindung nur per eigenem PR.

## Datenrechte (offen, blockiert den ersten Datenvideo-Einsatz)
- Tiingo-Freigabe (Eigentümererklärung 13.09.2026) nennt die **Anzeige auf der Website**. Das Social-System definiert „Ein Social-Beitrag IST Weiterverbreitung“. Ob Videos auf YouTube/Instagram/TikTok gedeckt sind, ist **ungeklärt** → schriftlich klären.
- Bis dahin: nur relative Größen (Prozent, Index = 100, Rang), keine absoluten Kursniveaus; keine Indexstände von MSCI/STOXX/FTSE/S&P DJI, keine ETF-Emittentendaten, keine FX-Umrechnung.
- Musik/SFX: Lizenzquelle offen. KI-Kennzeichnung und Plattform-Labels setzen.

## Formate
| Format | Avatar-Anteil | Aufbau |
|---|---|---|
| Reel 30–60 s | 6–12 s (Hook + CTA) | Hook-Avatar, Charts im Voice-over, CTA-Avatar |
| Aktienanalyse 1–3 min | 20–40 s | Intro, 3 Evidenzkarten, Einordnung, Disclaimer |
| YouTube-Bericht 10–15 min | 60–120 s | kapitelweise rendern (Matrix-Jobs), FFmpeg-Concat |
Moderatoren wechseln nach Format (z. B. LEA Markt, DAVID Aktie, MARC Hinterfragen, SOFIA Erklärung).

## Phasen
0 Rechteklärung + Auslieferungsausschluss · 1 Template-only-Reel (ohne Avatar) mit Gates und Benchmark · 2 Avatar-Hook/CTA, Aktienanalyse · 3 YouTube-Bericht, Screenrecordings · 4 Anbindung an `social/`, Publishing hinter Kill Switch.
