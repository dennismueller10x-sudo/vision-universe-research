# Portfolio-Baukasten v1 nach dem VU-Portfolio-Standard

Status: **Forschung, nicht zertifiziert.** Neues Fachmodell, freigegeben vom Owner am 04.11.2026 ([Neustart-Plan §2](../PLAN_NEUSTART_2026-11.md)).
Kein Produktpfad liest diese Module; Ergebnisse erscheinen nur intern (Backtest-Vorschau). Eine öffentliche Darstellung ist eine öffentliche Renditeaussage und braucht die Owner-Freigabe und die Abstimmung mit der Rechtsberatung.

## 1. Standard (`quant/engines/portfolio-construction.cjs`, `STANDARD`)

| Regel | Wert |
|---|---|
| Titelzahl | 15–30, Ziel 25 |
| Titelgrenze | max. 8 % |
| Branchengrenze | max. 25 % je Branche (Fama/French 12 aus dem SIC-Code der SEC) |
| Liquidität | Kurs ≥ 5 USD; Tagesumsatz (ADV, 20 Tage) ≥ 2 Mio. USD, je Titel höchstens 5 % des ADV bei 10 Mio. USD Portfoliovermögen; ohne Volumen ersatzweise Marktkapitalisierung ≥ 300 Mio. USD |
| Kosten je Seite | Gebühr 1 bp + Slippage 5 bp (Ledger) + halber Spread nach Liquiditätsklasse: ADV ≥ 100 Mio. 2 bp, ≥ 25 Mio. 5 bp, ≥ 10 Mio. 10 bp, ≥ 2 Mio. 25 bp, sonst 50 bp; ersatzweise nach Marktkapitalisierung; +25 bp unter 5 USD |
| Gewichtung | Risikoparität (gleiche Risikobeiträge) auf der geschrumpften Kovarianz; Varianten gleichgewichtet, inverse Volatilität |
| Risikomodell | 104 Wochenrenditen, Kovarianz nach Ledoit/Wolf (2004) mit Ziel konstanter Korrelation (`portfolio-risk.cjs`) |
| Benchmark | SPY Gesamtrendite (Dividenden reinvestiert, `vorsorge/data/series/SPY.json`, `canonical-total-return-1.0.0`) gegen Gesamtrendite des Portfolios |
| Rebalancing | alle 4 Wochen; Entscheidung zum Wochenschluss, Ausführung zum Schluss der Folgewoche |
| Kennzahlen | Gesamtrendite, CAGR, Volatilität, Max. Drawdown, Beta, Korrelation, Tracking Error, Turnover, Kosten, Kalenderjahre, je Testfenster |

Ablauf je Stichtag: Kandidaten nach Profilscore absteigend, höchstens `floor(25 % × 25) = 6` Titel je Branche, Risikomodell, Rohgewichte, Projektion auf Titel-, Liquiditäts- und Branchengrenze (überschüssiges Gewicht anteilig an freie Titel, nicht unterzubringendes Gewicht bleibt Cash). Jede Konstruktion prüft den Standard und bricht bei einer Verletzung ab (`STANDARD_VIOLATED`). Weniger als 15 geeignete Titel: `TOO_FEW_ELIGIBLE`, es entsteht kein Ziel, der Bestand läuft bis zum nächsten Stichtag unverändert weiter (vor der ersten Konstruktion: Cash).

## 2. Historische Rekonstruktion (Point-in-Time)

| Baustein | Quelle | PIT-Regel |
|---|---|---|
| Kurse | kanonische Tagesbalken (Tiingo, R2) im Workflow; lokal die committeten Wochenreihen | nur bis zum Stichtag; Rohschluss für die Marktkapitalisierung über `return-series.js#splitFactors` (ADR-002) |
| Gesamtrendite | `adjustedClose` der Tagesbalken (Split und Dividende); delistete Titel aus dem V13-Archiv (`totalReturn`) | Dividenden am Ex-Tag im Titel reinvestiert (virtuelle Stücke) |
| Fundamentaldaten | SEC companyfacts, Lesart ORIGINAL (`scripts/quant/portfolio/build_pit_fundamentals.py`) | sichtbar erst nach dem Einreichungsdatum (`filed < Stichtag`); jüngstes Geschäftsjahr höchstens 548 Tage alt |
| delistete Titel | V13-Register 1.0.0, 1.675 QUALIFIED, private Reihen aus dem R2-Archiv | im Universum bis zum letzten Handelstag; danach `TERMINAL_CASH` |
| Endwert delisteter Titel | Klasse aus dem Register | Übernahme 100 %, unbekannt 70 %, Notlage 0 % des letzten Schlusses; Sensitivität 100/100/100 und 100/30/0 |
| Branche | heutiger SIC-Code (SEC) | **nicht** historisch |
| Universum | alle handelbaren US-Stammaktien mit SIC, mindestens 105 Wochen Historie | **keine** historische Indexmitgliedschaft |

Faktoren (`portfolio-pit-factors.cjs`) sind eine dokumentierte Rekonstruktion der Profilfamilien, nicht die Live-Faktorevidenz:
Momentum 12-1 Monate, Risiko (negative 52-Wochen-Volatilität), Qualität (Bruttomarge, Eigenkapitalquote, FCF-Marge), Profitabilität (Netto- und FCF-Marge), Wachstum (Umsatz 3 Jahre und Vorjahr), Value (Gewinn-, FCF- und Buchrendite auf die Marktkapitalisierung).
Je Familie das Mittel der Querschnitts-Perzentile, je Profil das Mittel der Familien-Perzentile.
Profile wie in `strategy-index-v1`: quality-compounder, momentum-leader, quality-momentum, garp, future-leader, defensive-quality, value-momentum. earnings-revision-leader fehlt (keine historischen Analystenrevisionen).

## 3. Ledger und Kosten

- Ledger ist `research-portfolio.cjs#runPortfolio`, **unverändert** (Modus `HISTORICAL_OBSERVED` mit Gesamtrendite und `TERMINAL_CASH`; lokal `HISTORICAL_PRICE_SIMULATION`).
- Gebühr und Slippage bucht der Ledger je Handel.
- Der titelabhängige halbe Spread wird je Handelstag als anteiliger Abschlag auf den Portfoliowert gebucht. Das entspricht einer Finanzierung der Spreadkosten aus allen Positionen anteilig, ein Fehler zweiter Ordnung gegenüber einer Buchung im Ledger.
- Titel ohne Kurs zum Ausführungstag (z. B. in derselben Woche delistet) werden nicht gekauft; ihr Gewicht bleibt Cash. Damit kennt keine Entscheidung die Zukunft.
- Kennzahlen: `backtest-metrics.cjs` (mit eigener Python-Gegenrechnung).

## 4. Walk-forward

Keine Größe wird auf Ergebnissen angepasst. Regeln, Schwellen, Profile und Endwerte sind vorab festgelegt. Risikomodell und Scores werden je Stichtag rollierend nur aus der Vergangenheit geschätzt.
Zusätzlich weist jeder Lauf seine Kennzahlen je festem Drei-Jahres-Testfenster aus (2012–2014, 2015–2017, …).

## 5. Vorher/Nachher

Neue Dateien, keine bestehende Engine geändert:
- `research-portfolio.cjs`, `backtest-metrics.cjs` und alle Runner-Dateien (`CODE_FILES`) sind bytegleich.
- `check-backtest-demo-freshness.cjs --strict`: Code CURRENT.
- Vorschau-Bundle `aefb5942…` unverändert, Katalog-Generation 1 unverändert.

## 6. Prüfungen

```bash
node --test quant/tests/portfolio-standard.test.mjs quant/tests/model-portfolios-result.test.mjs
python3 -I scripts/quant/verify-portfolio-construction.py --input cases.json   # aus dem Test erzeugt
```

- Tests: Standard über 40 Zufallsfälle × 3 Gewichtungen; Risikoparität; Liquiditätsgrenzen; Spread-Klassen; SEC-Sichtbarkeit nach Einreichungsdatum; delistete Titel im Lauf; kein Blick nach vorn (geänderte Zukunft ändert die Entscheidung nicht).
- Python-Gegenrechnung: Schrumpfung, Kovarianz, Gewichte und Grenzen auf 24 Fällen.

## 7. Läufe

- **Workflow** `quant-portfolio-research.yml` (Marke `[quant-portfolio-research]` oder manuell): Tagesbalken aus R2, delistete Titel aus dem V13-Archiv, SEC ORIGINAL aus companyfacts.zip.
  Committet nur `docs/quant/research/portfolio-v1/model-portfolios.json` und den Bericht `MODEL_PORTFOLIOS.md` (Kennzahlen, Wertentwicklung, Gewichte; keine Kurse).
- **Lokal:**
  ```bash
  node scripts/quant/portfolio/model-portfolios.cjs --out /tmp/mp.json [--fundamentals DIR]
  ```
  Nur Kursrendite und nur heutige Titel; als Survivorship-Lauf gekennzeichnet.
