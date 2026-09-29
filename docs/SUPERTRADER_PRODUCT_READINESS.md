# Supertrader — Product Readiness (Stand 29.09.2026, Daten bis 28.09.2026)

Kurzfassung: Supertrader ist als **transparente, regelbasierte Live-Beobachtung** nutzbar.
Kein Modell ist backtest-validiert; Supertrader zeigt deshalb nirgends Rendite, Drawdown,
Trefferquote oder Trust Score.

## Live nutzbar (als Beobachtung, nicht als validierte Strategie)

| Welt | Heute | Was der Nutzer bekommt | Einschränkung |
|---|---|---|---|
| Momentum Breakout (Daily, research-basiert auf Kullamägi) | 2 × Einstieg bereit | Trigger, Ungültig-Level, Risiko, Chart mit Basis und 10/20-Tage-Linie | Daily-Variante statt Original-Opening-Range; enge Basis = VU-Formalisierung |
| Weinstein Stages (Wochenbasis) | 1 × Einstieg bereit, 1 × Setup | Stage, 30-Wochen-Linie, Widerstand, RS | Volumenregel nur im Tagesfenster prüfbar; Klassifikator = VU |
| Darvas Boxes (VU, A/B) | 0 A-Setups, 157 B-Setups | nur A prominent; B im eigenen Reiter | Boxdefinition und A/B-Stufe = VU; Regime „breite Schwäche“ schließt A aus |
| Minervini VCP (Hybrid) | 0 Setups, 35 Beobachten | Trend Template, Kontraktionen, Pivot | automatische VCP ≠ Minervinis Charturteil |
| Signalprotokoll | live seit 28.09.2026 | jeder Zustandswechsel ab SETUP, append-only | noch keine abgeschlossenen Signale — Historie wächst täglich |
| Strategy Lens, Charts, Quellen | — | Titelansicht je Modell, kanonische Kursdaten, 41 Quellen | Quellen per Suchtreffer bestätigt, nicht inhaltlich abgerufen |

## Research-only

- **Alle Backtests:** Engine, Kosten-/Gap-/Same-Bar-Modell und Pflichtkennzahlen sind gebaut und
  getestet. Keine Variante besteht die Datengates (Historie, Survivorship, historisches Universum).
- **Greenblatt Value:** kein Ranking — Umlaufvermögen, kurzfristige Verbindlichkeiten und
  Sachanlagen fehlen im kanonischen Fundamentaldatensatz; PIT-Historie nur für 5 Titel.
- **Kullamägi Opening Range, Episodic Pivot, Parabolic Short; Weinstein Stage-4-Short;
  CAN SLIM, Piotroski, Donchian/Turtle, Market Wizards:** Research in progress, keine Signale.

## Die eine Datenentscheidung mit dem größten Fortschritt

**Ein survivorship-freies, mehrjähriges Tages-OHLCV-Universum als build-internes
Backtest-Artefakt freigeben** — die bereits vorhandene kanonische Tageshistorie (R2) zusammen mit
den delisteten Titeln und der historischen Universumszugehörigkeit.

Warum diese: Sie schließt auf einen Schlag die harten Gates *Historie*, *Volumenhistorie*,
*Out-of-Sample/Walk-forward*, *Survivorship* und *historisches Universum* für **vier** Welten
(Momentum Breakout Daily, Weinstein, Darvas, Minervini-Technik) — also für 10 der 15 definierten
Varianten. Keine andere einzelne Entscheidung bewegt so viele Varianten Richtung
`BACKTEST_READY`. Greenblatt bliebe danach noch an den drei fehlenden Bilanzfeldern und der
PIT-Historie hängen; die Opening-Range-Varianten an historischen Intraday-Balken.

Nicht umgesetzt, weil ausdrücklich ausgeschlossen: keine neue Datenquelle, keine
Infrastrukturänderung, kein Zugriff auf R2 aus Supertrader.
