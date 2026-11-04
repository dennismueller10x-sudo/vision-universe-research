# Strang C – Quant-Backtest und qualifizierte Portfolios

Stand: **04.11.2026**. Plan: [PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md). Fachdokument Baukasten: [PORTFOLIO_STANDARD.md](../quant/PORTFOLIO_STANDARD.md).

## Fertig

- **#1227 gemergt:** interne Backtest-Vorschau in Produktion eingeschaltet (`VU_BACKTEST_REVIEW_ENABLED="true"` nur in `[env.production.vars]`). Zugang nur mit Sitzung und Rolle `backtest_reviewer`.
- **Portfolio-Baukasten v1** (VU-Portfolio-Standard) gebaut, als neue Module ohne Änderung bestehender Engines:
  - Risikomodell mit Ledoit/Wolf-Schrumpfung;
  - Konstruktion: 15–30 Titel, 8 %/25 %, Liquidität, Spread-Modell;
  - PIT-Faktoren mit SEC-Einreichungsdatum;
  - Walk-forward über den unveränderten Ledger `runPortfolio`, mit delisteten Titeln per `TERMINAL_CASH`.
  - Python-Gegenrechnung.
- **SEC Point-in-Time:** Bündel in der Lesart ORIGINAL (Wert wie erstmals eingereicht). Die committeten Consumer-Bündel tragen im Mittel 628 Tage Verzug und sind für historische Stichtage ungeeignet.

## Offen

- Lauf der Musterportfolios im Workflow `quant-portfolio-research.yml` (R2-Tagesbalken, V13-Delistings, SEC ORIGINAL) und Ergebnis in der internen Vorschau.
- Setup-OOS A1–A6 umsetzen (Empfehlung der Vorlage: Schnitt 2027-05-31, 183 Tage Embargo, MEDIAN_EXCESS + SIGN_REPLICATES, Arten getrennt, effektive Fälle, Zeilenexport).
- Historische Strategie- und Faktor-Backtests (Katalog-Arten) auf PIT-Basis über den Baukasten-Datenpfad.

## Braucht Owner

- **Geschäftskonto für die Vorschau:** registrieren (eigene E-Mail, nicht das Konto mit `pricing_admin`) und die Rolle `backtest_reviewer` per SQL vergeben. Anleitung: [BACKTEST_VORSCHAU_AKTIVIERUNG.md](../accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md), Abschnitt 2.
- **Öffentliche Darstellung von Musterportfolio-Renditen:** eigene Freigabe (öffentliche Renditeaussage), abgestimmt mit der Rechtsberatung. Bis dahin nur intern.

## An andere Stränge

- **A:** neuer Workflow `quant-portfolio-research.yml` (nur Marke oder manuell, schreibt nur `docs/quant/research/portfolio-v1/`), bitte bei der Workflow-Bündelung übernehmen.
- **D:** Musterportfolio-Abschnitt der Vorschau. C liefert Daten und Logik (Worker-Route, Bündel), D gestaltet.
