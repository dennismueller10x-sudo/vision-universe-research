# C08 Kullamägi Breakout – Treueprüfung (Stand 05.11.2026)

> **Forschung, nicht zertifiziert.** Dieser Bericht prüft, ob unsere Umsetzung die veröffentlichte Methode trifft. Renditezahlen stehen hier nicht (Owner-Entscheidung 05.11.2026: keine öffentlichen Renditezahlen); der Owner erhält sie intern.

Anlass: Die Referenz C08 verliert schon vor Kosten deutlich. Das ist mit den belegten Ergebnissen der Methode nicht vereinbar und wird deshalb als Treue-Fehler unserer Umsetzung behandelt, bis das Gegenteil belegt ist. Unabhängige Gegenprüfung durch Strang E: PR #1417.

## 1. Regelabgleich

| Punkt | Methode laut Quelle | Referenz `kk-breakout-lifecycle.mjs` (unverändert, in SF6-PAPER-2027 gepinnt) | Befund | FID-1 / FID-2 (`kk-breakout-fidelity.mjs`) |
|---|---|---|---|---|
| (a) Auswahl | stärkste 1–2 % nach 1/3/6 Monaten, hohe ADR, liquide („3 timeless setups“; Interview Chat with Traders) | kein Gate (KK-005 nur Hinweis, C08-MOMENTUM-SPLIT) | **Lücke** | Top 2 % bestPercentile 1/3/6 Monate, Rohkurs ≥ 5 USD |
| (b) Marktfilter | „fewer or no trades“ in schwachen Märkten; 2023 konkret IWM: SMA10 > SMA20, beide steigend (Stream 08.06. und 15.12.2023) | keiner (KK-050/051 als Reviewer-Kontext ausgeschlossen) | **Lücke** | SMA10 > SMA20, beide steigend, auf SPY (IWM nicht im Snapshot, deklarierter Ersatz) |
| (c) Einstieg | Kauf über dem Opening-Range-High bzw. am Niveau, Alarme vor der Eröffnung; nicht kaufen, wenn schon > ATR gestiegen | nächstes Open nach dem Ausbruchsschluss (Owner-Entscheidung 23.10.2026, strikt PIT) | **Lücke** (F05: Kauf-Stopp-Zweig der Engine ungenutzt) | Kauf-Stopp am vorab bekannten 10-Tage-Hoch, Füllung max(Eröffnung, Niveau); Eröffnung mit Risiko > 1 ADR wird nicht gekauft |
| (d) Stopp | Tagestief des Einstiegstags, nicht weiter als die ADR | Tief des Signaltags; Prüfung Risiko ≤ ADR20 vom Open | **Abweichung** (F06) | Initialrisiko ≤ 1 ADR20, ab Schluss des Einstiegstags dessen Tief; FID-2 normiert wie ADR20 (relativ zum Tief) |
| (e) Ausstieg | 1/3–1/2 nach 3–5 Tagen, Stopp auf Einstand, Rest am Schluss unter MA10 (schnelle) bzw. MA20 (langsame) | 1/3 nach 3 Tagen, Breakeven, Rest unter MA10 | **Teilabweichung** (nur MA10) | FID-1 wie Referenz; FID-2 MA10 bei ADR20 ≥ 5 %, sonst MA20 |
| (f) Größe | 0,25–1 % Risiko je Trade, Positionen meist 10–20 %, über Nacht ≤ 30 % | 0,5 % Risiko, Kappe 25 % | gedeckt | unverändert |
| Setup-Qualität | großer Vorlauf 30–100 % in 1–3 Monaten, geordnete Konsolidierung mit höheren Tiefen, enger werdend, „surft“ auf MA10/20 | Vorlauf ≥ 30 % in 63 Sitzungen, MA10/20 steigend, 10 Sitzungen | **grob** | FID-2 zusätzlich: höhere Tiefe und engere Spanne in der zweiten Hälfte der Konsolidierung |
| Intraday-Einstieg | Opening-Range-High (1/5/60 Minuten) | DATA_BLOCKED (keine Intraday-Historie) | bleibt offen | bleibt offen (Tagesbalken) |

FID-1 und FID-2 wurden **vor** dem ersten Lauf festgelegt (PR #1418); keine Regel ist nach Sicht auf Ergebnisse gewählt. Die Referenz C08 bleibt unverändert.

## 2. Messung

Je Fassung (Referenz, FID-1, FID-2) auf DEV 2016–2026 im Top-5-Lauf (`supertrader-st-hist-top5.yml`, ab `st-hist-top5-1.4.0`, versiegelt):
- R-Verteilung der geschlossenen Trades: Trefferquote, mittleres R der Gewinner und Verlierer, Anteil über +5 R, längster Gewinner, Haltedauer der Gewinner. Die Methode lebt von wenigen großen Gewinnern; enden unsere Gewinner nach wenigen Tagen, liegt dort der Fehler.
- Abgleich mit öffentlich dokumentierten Trades (Abschnitt 3): hat die Engine im Fenster ±8 Tage gekauft, wie und wann beendet.
- Kosten zu 0 und zu Referenzkosten.

Bestätigt wird erst auf dem unberührten HOLDOUT 2008–2015, einmalig, mit vorher festgeschriebener Regel.

## 3. „Goldene Trades“

Aus seinen eigenen Materialien belegt sind nur Lehrbeispiele ohne Kurse (TSLA 2020, MNKD 2013, AAXN 2004). Die übrigen Trades stammen aus Mitschriften Dritter zu seinen Livestreams (Paraphrasen, Daten teils geschätzt); für 2016–2018 wurde kein Trade gefunden. Geprüft werden im DEV-Fenster: KOD (12/2019), OCGN (12/2019), DT, JCP, JMIA, JAGX (01/2020), FCEL, ETCG, ZM, ROKU, DXCM (02/2020), AMC, BB (06/2021), FCX, PDD (01/2023), RGTI (06/2023). Liste mit Quellen: `KK_GOLDEN_TRADES` in `scripts/supertrader/source-faithful/research/kk-breakout-fidelity.mjs`. Seit Mai 2023 handelt er laut Mitschrift fast nur noch Episodic Pivots.

## 4. Quellen

- qullamaggie.com, „My 3 timeless setups that have made me tens of millions“ (Auswahl, Konsolidierung, ORH-Einstieg, Stopp ≤ ADR, Teilverkauf und MA10/MA20, Risiko 0,25–1 %).
- Interview Chat with Traders (Mitschrift Trading Resource Hub): stärkste 2 %, Stopp am Tagestief, MA10 für schnelle und MA20 für langsame Titel.
- Stream-Mitschriften Retail Trader's Repository (10/2019–04/2020) und Trading Resource Hub (2021, 2023): Marktfilter, einzelne Trades.
- Unabhängige Gegenprüfung: Strang E, PR #1417 (Befunde F05, F06, Trailing, ADR-Normierung, Setup-Qualität).

## 5. Ergebnis (05.11.2026, ohne Renditezahlen)

1. **Diagnose der 16 belegten Trades** (Läufe 42040595941 und 42043947326). Der erste blockierende Schritt je Trade:
   - nicht im Universum: 2,
   - Kurs unter 5 USD (VU-Grenze, bleibt): 4,
   - Momentum knapp unter den obersten 2 % (Quellregel, bleibt): 5,
   - Vorlauf fehlt (eher Episodic Pivot): 3,
   - erkannt und ausgelöst, aber kein Kapital frei: 4 (eine Umsetzungslücke: Die Orders werden in neutraler Reihenfolge gefüllt),
   - Kurslücke über 1 ADR: 1.
2. **FID-3** (#1436) wählt je Tag die 3 stärksten Setups nach Momentum-Rang. Damit ist der einzelne Trade vor Kosten erstmals leicht positiv, aber die Variante ist kaum investiert.
3. **FID-4** (#1442) ist FID-3 mit Kullamägis Positionsgröße. Regel und Erfolgskriterium wurden vor dem Lauf committet (`certification/C08-FID4-PREREGISTRATION.json`). Auf DEV ist das Kriterium nicht erfüllt (Lauf 42060179992). Deshalb gibt es keinen Holdout und keine weitere Variante.
4. **Abschluss:** C08 gilt als „Erkennung je Trade, Portfolio nicht bestätigt“. Die Zahlen liegen privat beim Owner.
