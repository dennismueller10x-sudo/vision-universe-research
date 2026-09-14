# VISION UNIVERSE® — Fundamental Intelligence (Consumer)

Stand: 14.09.2026 · Branch `claude/vision-universe-discover-v3` · nicht gemergt, nicht veröffentlicht.

> DER KURS ZEIGT, WAS DIE AKTIE GEMACHT HAT.
> DIE FUNDAMENTALS ZEIGEN, WAS DAS UNTERNEHMEN GEMACHT HAT.

## 1. Audit — was vorhanden war

| Baustein | Fundort | Befund |
|---|---|---|
| SEC-Pipeline (Python, Standardbibliothek) | `scripts/quant/sec/` (provider, http_client mit Fair-Access-Limiter, normalize, fiscal, periods, restatements, derived, quality, gates, canonical, coverage, store) | vollständig, PIT-fähig, Restatements, Annual/Quarterly/TTM-Resolver, Derivate; Design für Skalierung (`iter_bulk_company_facts`, Checkpoints) vorhanden, aber nur für 5 Titel je gelaufen |
| Kanonische Bundles | `quant/data/sec/canonical/{AAPL,JPM,MSFT,NVDA,XOM}.json` (~490 KB je Titel, quartalsweise, volle Historie) | 5 Titel; Größe schließt eine Ausweitung auf 6 000 Titel im Repository aus |
| Universum der SEC-Pipeline | `quant/config/sec-universe.json` | 5 Titel |
| Andere Branches (`claude/sec-financial-data-core-qiizhj`, `codex/sec-master-universe-large`) | canonical = 5, Universum = 5 | kein Branch trägt mehr als die fünf Titel; nichts zu übernehmen, kein Konflikt |
| Discover-Anbindung | `discover/engines/unternehmen.js` (`ausSecFakten`), `einordnung.js` (30 Sekunden, Waage) | funktionierend, aber auf 5 Titel begrenzt |
| CIK-Zuordnung | Namensschicht `security-master/company-names.json` (SEC-Tickerverzeichnis, Ticker + Börse) | 5 516 Titel des Produktuniversums mit CIK, 1 362 ohne (Preferreds, ADR ohne 10-K/20-F-Fakten, Trusts, Auslandstitel) |

Entscheidung: **keine zweite SEC-Architektur.** Die bestehende Pipeline bekommt eine zweite, schlanke Ausgabe.

## 2. Consumer-Fundamentals (`scripts/quant/sec/consumer.py`)

* Quelle: SEC Bulk-Archiv `companyfacts.zip` (eine Anfrage statt 5 000; SEC Fair Access). Identität: CIK aus der Namensschicht; ohne CIK keine Fundamentals und keine Schätzung.
* Pro CIK ein Bundle `quant/data/sec/consumer/CIK##########.json` (Schema `vu-consumer-fundamentals-1.0.0`, ~15–25 KB), Index je Ticker `consumer/index.json`, Coverage-Grid `consumer_coverage.json`.
* Dieselbe Pipeline: `iter_raw_facts` (nur periodische Formulare 10-K/10-Q/20-F/40-F und Amendments) → `FiscalCalendar.from_raw_facts` → `normalize_company` (YTD-De-Akkumulation, Restatement-Zeitlinien) → `PeriodResolver` (`annual`, `quarter`, `ttm`) → `derived.reconstruct` (Free Cashflow, Nettoschulden, Bruttogewinn/Gesamtschulden, wo nicht berichtet).
* **Annual / Quarterly / TTM strikt getrennt:** `annual` = Geschäftsjahre (FY, bis zu 13 im Fenster, damit der 10-Jahres-Horizont nicht am angebrochenen Jahr scheitert), `quarterly` = 8 Standalone-Quartale, `ttm` = Summe der vier jüngsten Standalone-Quartale mit `through: FYxxxxQn`; Bilanzpositionen als letzter Stand.
* **Point-in-time:** Policy `as_of_latest` zum Lauftag; Verfügbarkeit auf Filing-Datum (das Bulk-Archiv trägt `filed`, nicht die Annahmezeit) — ein Wert ist nie vor seinem Filing sichtbar. Jede Zeile: `[fy, fp, periodEnd, value, filed, accession, derived]`.
* Kennzahlen: revenue, gross_profit, operating_income, net_income, eps_diluted, operating_cash_flow, capital_expenditures, free_cash_flow, cash_and_equivalents, total_debt, long_term_debt, net_debt, total_assets, stockholders_equity, shares_outstanding, diluted_weighted_average_shares, research_and_development, dividends_paid, stock_based_compensation.
* Keine Null als Platzhalter: eine nie berichtete Kennzahl fehlt.
* **Zwei Befunde des ersten Bulk-Laufs, behoben in Normalisierung 1.6.0** (`scripts/quant/sec/version.py`, Regressionen in `quant/tests/test_consumer_calendar.py`):
  1. Amazon meldet in jedem 10-Q Zwölfmonatswerte (Nettogewinn, Cashflows). Der Kalender lernte daraus Geschäftsjahre mit Ende 30.06., benannte Q2 als Q1 und überschrieb FY2025 mit dem Juni-Wert. Rund 250 der 5 066 Unternehmen trugen mindestens ein solches Jahr. Jetzt: Geschäftsjahresgrenzen nur aus Jahresberichten (10-K/20-F/40-F, auch /A); eine Zwölfmonatsperiode, die nicht auf einem Geschäftsjahresende endet, wird nicht als FY geführt.
  2. JPMorgans Umsatzkonzept endet 2014 in den Quartalen, der Nettogewinn läuft weiter — das TTM des Umsatzes stand „durch FY2014Q4" neben aktuellen Zahlen. Jetzt: alle TTM-Zeilen eines Bundles enden im selben Quartal (das jüngste Fenster gewinnt), und ein Fenster, das älter als 400 Tage ist, ist keines („trailing" heißt trailing).
* Workflow `.github/workflows/sec-consumer-fundamentals.yml` (Dispatch, montags 07:30 UTC, Push-Marke `[sec-consumer]`): Offline-Tests → Bundles → Discover-Build → Matrix → Guards → Regressionen → Commit.
* Offline-Tests: `scripts/quant/tests/test_consumer.py` (synthetische Emittentin; Annual/Quarterly/TTM-Trennung, PIT, keine Nullen, Horizonte, Coverage-Grid, Größe).

## 3. Fundamentals-Engine (`discover/engines/fundamentals.js`, `fundamentals-1.0.0`)

Deterministisch, ohne Sprachmodell, im Build gerechnet und mit der Seite ausgeliefert.

| Baustein | Regel |
|---|---|
| Horizont | 10 Jahre, wenn FY(t−10) auf der Umsatzreihe existiert; sonst 5; sonst 3; sonst erste vs. letzte valide Periode |
| Damals vs. heute | Umsatz, Nettogewinn, operative Marge, Free Cashflow, Gewinn je Aktie, Aktienanzahl, Nettoschulden — nur Zeilen mit beiden Werten; Veränderung absolut, in %, CAGR bzw. Prozentpunkte; Beleg je Zeile |
| Journey | Jahresreihen: Umsatz, Nettogewinn, Free Cashflow, operativer Cashflow, EPS, Margen (nur Zähler/Nenner desselben FY), Kasse, Schulden, Aktien |
| Story | Sätze nur aus zwei benannten Perioden: Umsatz verdoppelt (+100 %), gewachsen (≥ +25 %), gesunken (≤ −15 %), kaum verändert; Gewinn schneller/langsamer als Umsatz (Δ ≥ 10 Pp.); Wende in den Gewinn/Verlust; operative Marge ± 3 Pp.; FCF zuletzt ± 15 % oder negativ; Aktienanzahl ± 5 %; Verschuldung schneller als Gewinn (Δ ≥ 25 Pp. und ≥ +25 %). Jede Aussage: metric, periodStart, periodEnd, valueStart, valueEnd, calculation, source, asOf, version |
| Health | Wachstum (Umsatz-CAGR über den Horizont): ≥ 20 % Sehr stark, ≥ 10 % Stark, ≥ 3 % Solide, ≥ 0 Flach, sonst Rückläufig · Profitabilität (Nettomarge FY): ≥ 20 / 10 / 3 / 0 % · Cashflow (FCF-Marge FY): ≥ 15 % Sehr stark, ≥ 8 % Stark, > 0 Solide, sonst Negativ · Bilanz: Nettokasse Sehr solide, Nettoschulden ≤ 2× FCF Solide, ≤ 4× Belastet, sonst Angespannt · Verwässerung (Aktien über den Horizont): ≤ −3 % Rückkäufe, ≤ +2 % Gering, ≤ +10 % Moderat, sonst Hoch |
| Signale (Sammlungen) | Umsatz-CAGR 3J/10J, Nettomarge, FCF-Marge, Gewinnbeschleunigung (Wachstum FY(t) − FY(t−1)), Margenausweitung 3J, FCF > 0 in drei FY, Turnaround (FY(t−2) < 0, FY(t) > 0), Nettokasse, Compounder (10J ≥ 10 % und jedes FY profitabel) |
| Kurs + Fundamentals | Kursänderung über die ausgelieferte Reihe neben Umsatz-/Gewinnänderung der Geschäftsjahre, die vor Start- und Endpunkt endeten; ausdrücklich ohne Kausalität |
| Bewertung (Build) | KGV = Kurs / Gewinn je Aktie (TTM, sonst FY), KUV = Kurs × Aktien / Umsatz, FCF-Rendite = FCF / Marktwert; Vergleich mit dem Median des Universums: > 1,5× „deutlich höher bewertet als der breite Markt", < 0,67× „günstiger", sonst „im Bereich des breiten Markts" |

Tests: `discover/tests/fundamentals.test.mjs` (FU1–FU10) auf synthetischen Bundles der Pipeline-Fixture.

## 4. Fundamentale Sammlungen (Discover)

Nur aus Geschäftsjahren; eine Reihe erscheint erst ab fünf Titeln (`minMembers`).

| Reihe | Regel |
|---|---|
| Umsatz wächst stark | Umsatz-CAGR 3J ≥ 15 % |
| Gewinne beschleunigen | Gewinnwachstum FY(t) − FY(t−1) ≥ 5 Pp., Nettomarge > 0 |
| Margen werden stärker | operative Marge FY(t) − FY(t−3) ≥ 2 Pp. |
| Cashflow-Maschinen | FCF-Marge FY ≥ 15 %, Nettomarge > 0 |
| Qualität + Wachstum | Umsatz-CAGR 3J ≥ 10 %, Nettomarge ≥ 10 % |
| Langfristige Compounder | Umsatz-CAGR 10J ≥ 10 %, Nettogewinn > 0 in jedem FY |
| Profitables Wachstum | Umsatz-CAGR 3J ≥ 10 %, Nettomarge ≥ 5 %, FCF > 0 |
| Fundamentale Turnarounds | Nettogewinn FY(t−2) < 0, FY(t) > 0 |
| Qualität zum vernünftigen Preis | Nettomarge ≥ 10 %, KGV ≤ 20 |
| Starke Bilanz + Wachstum | Nettokasse, Umsatz-CAGR 3J ≥ 10 % |

## 5. Was bewusst nicht gerechnet wird

* keine Schätzungen, keine Branchendurchschnitte als Ersatz, keine Prognosen, keine Analystenmeinungen
* ROIC: nur ROE (Nettogewinn / Eigenkapital des letzten FY); ROIC verlangt eine Steuer- und Kapitalannahme, die die Daten nicht hergeben
* kein „historischer Bewertungsbereich" (bräuchte Kurs- und Gewinnhistorie über zehn Jahre; die ausgelieferte Kursreihe beginnt 2023)
* keine Vermischung: TTM-Wachstum nur gegen die vier Quartale davor; fehlen sie, fehlt das Wachstum
