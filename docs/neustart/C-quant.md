# Strang C – Quant-Backtest und qualifizierte Portfolios

Stand: **05.11.2026**. Plan: [PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md). Fachdokument Baukasten: [PORTFOLIO_STANDARD.md](../quant/PORTFOLIO_STANDARD.md).

## Fertig

- **#1227 gemergt:** interne Backtest-Vorschau in Produktion eingeschaltet (`VU_BACKTEST_REVIEW_ENABLED="true"` nur in `[env.production.vars]`). Zugang nur mit Sitzung und Rolle `backtest_reviewer`.
- **Portfolio-Baukasten v1** (VU-Portfolio-Standard) gebaut, als neue Module ohne Änderung bestehender Engines:
  - Risikomodell mit Ledoit/Wolf-Schrumpfung;
  - Konstruktion: 15–30 Titel, 8 %/25 %, Liquidität, Spread-Modell;
  - PIT-Faktoren mit SEC-Einreichungsdatum;
  - Walk-forward über den unveränderten Ledger `runPortfolio`, mit delisteten Titeln per `TERMINAL_CASH`.
  - Python-Gegenrechnung.
- **SEC Point-in-Time:** Bündel in der Lesart ORIGINAL (Wert wie erstmals eingereicht). Die committeten Consumer-Bündel tragen im Mittel 628 Tage Verzug und sind für historische Stichtage ungeeignet.

- **Musterportfolios gerechnet** (Lauf 41867100079, [MODEL_PORTFOLIOS.md](../quant/research/portfolio-v1/MODEL_PORTFOLIOS.md)): 5 Profile, 2012–2026, Gesamtrendite inkl. delisteter Titel gegen SPY-Gesamtrendite 14,9 % p. a. **Keines schlägt den Index:** Defensive Quality 13,8 %, Value Momentum 13,0 %, Momentum Leader 12,9 %, Quality Compounder 11,2 %, GARP 5,6 %. Vol 15–21 %, Beta 0,81–1,07. In der internen Vorschau sichtbar, beschriftet „Forschung, nicht zertifiziert“.
- **Setup-OOS A1–A6** umgesetzt (#1333): Schnitt 2027-05-31, Embargo 183 Tage, MEDIAN_EXCESS + SIGN_REPLICATES, SETUP_NEW/SETUP_CONFIRMED getrennt, effektive Ereignistage, Zeilenexport. Gate messbar frühestens um den 2028-01-08.

- **Prüfung Strang E (#1368) umgesetzt** (05.11.):
  - Zeitraum wird angefragt/realisiert getrennt ausgewiesen und bei Verkürzung alarmiert (SPY-Reihe endet 02.10.).
  - Rohschluss delisteter Titel je Datum aus `v13-raw` über `splitFactors`.
  - Delistete Titel ohne Gesamtrendite werden ausgeschlossen.
  - Die Population heißt jetzt ehrlich `CUSTOM_STRATEGY_UNIVERSE`.
  - Die „fraglich“-Punkte stehen als Grenzen im Bericht.
  - Neulauf mit Umschlag-Varianten (Puffer 50, Quartal).

- **E3 Edge-Studie gerechnet** (05.11., [Bericht](../research/edge/BERICHT.md)):
  - nach eingefrorenem Protokoll, Auswahl vor dem Prüfteil festgeschrieben;
  - vorab gewählt: Momentum Leader N20/13 Wochen, im Prüfteil 2020–2026 9,3 % p. a. gegen SPY 15,4 %;
  - 84 Quant-Varianten „schlägt nicht“, keine mit Holm-p ≤ 0,05;
  - 12 Supertrader-Varianten blockiert (Snapshot endet 30.09.).

- **E4/S2 Signal-Studie gerechnet** (05.11., [Ergebnis](../research/signals/S2_ERGEBNIS.md)): keine Familie besser als Halten, mit und ohne DQ-K5. [Registrierung](../research/signals/S2_REGISTRIERUNG.md):
  - dieselbe Studie wie S1, Parität 383 von 383 Trades;
  - Stichprobe 1.000 Titel, Seed 20261105: 789 heutige, 211 delistete, Vorzugsaktien ausgeschlossen;
  - Zeitraum 2016–2026, exakter SPY-Vergleich; 2008–2015 bleibt für eine spätere Bestätigung unberührt;
  - Zahlen gehen versiegelt an den Owner, im Repo stehen Methodik, Abdeckung und Urteil;
  - DQ-K5 vor dem ersten Ergebnis ergänzt (Hinweis Strang G), die Musterportfolios rechnen sie als Vorher/Nachher mit (#1434, Wirkung ≤ 0,1 Prozentpunkte CAGR).
- **E3 Supertrader-Drawdowns geklärt** (#1421): Strang B fand keinen Fehler, Lauf 42004286201 und seine Hashes bleiben gültig. Darvas liegt zwischen −32 und −11 % p. a. Eine Liquiditätsgrenze käme nur als eigene, vorab registrierte Variante.

## Offen
- `backtest-runner.cjs#setupOosFromCertificationPath` an A4 angleichen (berührt CODE_FILES → Demo-Neubau, eigener PR).
- Historische Strategie- und Faktor-Backtests (Katalog-Arten) auf PIT-Basis über den Baukasten-Datenpfad.

## Braucht Owner

- **Geschäftskonto für die Vorschau:** registrieren (eigene E-Mail, nicht das Konto mit `pricing_admin`) und die Rolle `backtest_reviewer` per SQL vergeben. Anleitung: [BACKTEST_VORSCHAU_AKTIVIERUNG.md](../accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md), Abschnitt 2.
- **Öffentliche Darstellung von Musterportfolio-Renditen:** eigene Freigabe (öffentliche Renditeaussage), abgestimmt mit der Rechtsberatung. Bis dahin nur intern.

## An andere Stränge

- **A:** neuer Workflow `quant-portfolio-research.yml` (nur Marke oder manuell, schreibt nur `docs/quant/research/portfolio-v1/`), bitte bei der Workflow-Bündelung übernehmen.
- **D:** Musterportfolio-Abschnitt der Vorschau. C liefert Daten und Logik (Worker-Route, Bündel), D gestaltet.
