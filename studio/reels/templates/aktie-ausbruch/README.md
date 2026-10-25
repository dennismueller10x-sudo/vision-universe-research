# Vorlage „Aktie im Ausbruch" (Beispiel Robert Half, 25.10.2026)

Anlass aus der eigenen App: Discover zeigte „Ausbruch mit Volumen" (52-Wochen-Hoch, Volumen 3,4× Ø 20 Tage, +55 % in 12 Monaten). Reel stellt die Aktie vor, erklärt den Grund und endet mit „Solche Ausbrüche entdeckst du in der Vision Universe App. Jeden Tag."

- **Fakten:** Kurse aus `quant/data/market/discover-series/ref_<TICKER>.json` auf `origin/main` (der Arbeitsstand kann einen Tag älter sein). Grund aus der Primärquelle: SEC 8-K Item 2.02, Exhibit 99.1 (`data.sec.gov/submissions/CIK….json`, dann `Archives/edgar/data/<cik>/<accession>/index.json`). Erwartungen und Analystenstimmen nur mit Quelle (Investing.com, Seeking Alpha, Yahoo).
- **Aufbau:** Hook mit Tagesplus → Verstärker (seit Tief verdoppelt, neues Hoch, Volumen) → Grund aus dem Bericht → Einordnung → **Re-Hook mit Gegenstimme** (Kursziel eines Analysten, eigene Rechnung Abstand zum Kurs) → App mit nachgebauter Discover-Karte im hellen iPhone.
- **Bilder:** Hintergrundbilder des Owners (`assets/facade.jpg`, `assets/office.jpg`, nicht im Repo), vorab mit `scale/crop/eq=brightness=-0.2` vorbereitet. Fotorealistische KI-Bilder mit Firmenlogo → Caption „Bilder KI-generiert", TikTok-KI-Schalter.
- **Daten:** `data.json` mit `d`, `v` (12 Monate), `lo`, `hiPrev`; `render.mjs data=data.json`.
