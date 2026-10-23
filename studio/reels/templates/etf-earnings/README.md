# Vorlage „ETF + Quartalszahlen" (eigene Daten im iPhone, ohne Fremdmaterial)

Entstanden am 23.10.2026. Angst-Hook „Was passiert nächste Woche mit deinem Welt-ETF?", danach Erklärung der Schwankung nach Quartalszahlen mit eigener Rechnung. Der Owner lehnte KI-Sturm-Clips ab („wirkt künstlich") und wünschte echte Charts und Zahlen im iPhone statt Seiten-Scroll.

- **Daten** (`data.json`, mit `render.mjs data=data.json`): echte Schlusskurse aus `quant/data/market/golden-preview/daily` (MSFT, AAPL) bzw. `discover-series` (GOOGL, AMZN, nur 1 Jahr) rund um den letzten Termin; Umsatz und Gewinn je Quartal aus `quant/data/sec/canonical` (MSFT, AAPL; GOOGL und AMZN fehlen dort).
- **Termine der Quartalszahlen:** SEC-Einreichungen 8-K mit Item 2.02 (`data.sec.gov/submissions/CIK….json`, User-Agent mit Kontakt). `earn_moves.py` berechnet die Bewegung vom Schluss am Meldetag zum nächsten Schluss (Zahlen nach Börsenschluss).
- **Gewichte:** MSCI-World-Factsheet (Stand 30.09.2026), Microsoft 4,00, Alphabet A+C 3,99, Amazon 2,67, Apple 5,41 = 16,07 %.
- **Szenen:** iPhone mit schwankendem Depot (ILLUSTRATION), ETF-Ring mit 16-%-Stück, iPhone-Feed mit echten Kurssprüngen, Waage +100 € / −100 €, iPhone mit Umsatz und Gewinn, Papierflieger, App-Karte. Rendern undurchsichtig (`ovl=0`), `compose.sh a`.
- **Lehre Aussprache:** „mit deinem" verschluckte das d („mit einem", Whisper 0,94). Hook-Satz neu mit „DEINEM" aufgenommen (unter 0,01 USD) und vorne eingesetzt, Wortzeiten verschoben.
