# Supertrader — Machbarkeit echter Backtests (Stand 30.09.2026)

Nur eine Bestandsaufnahme. Die Pipeline wurde nicht verändert und es wurde keine neue Datenquelle angebunden.
Belege sind Repository-Pfade und wurden stichprobenhaft nachgeprüft.

## Kurz

Es gibt eine mehrjährige Tageshistorie für die **heute gelisteten** rund 7.800 US-Titel. Es gibt
**keine** Kursreihe eines tatsächlich delisteten Titels und **kein** Point-in-Time-Universum.
Backtests wären technisch rechenbar, aber durch Survivorship Bias nach oben verzerrt. Deshalb
bleiben alle Kennzahlen gesperrt.

## Was existiert

| Baustein | Befund | Beleg |
|---|---|---|
| Tages-OHLCV (R2, privat) | ab 1990 (`initialFrom 1990-01-01`, `MAX_AVAILABLE`), OHLC, Volumen, adjustierte Werte, Split-Faktor, Dividende | `quant/config/tiingo-scale.json`, `quant/engines/bar-codec.js`, `quant/engines/history-store.js` |
| Abdeckung | 7.802 / 7.803 Titel gespeichert; 5.884 mit ≥ 300 Balken | `quant/data/market/history/coverage-metrics.json` |
| Öffentliche Langreihen | 6.333 Wochenschluss-Reihen, nur split-adjustiert | `quant/data/market/discover-series-long/` |
| Öffentliche Tagesbalken für Supertrader | ~1,07 Jahre | `quant/data/product/technical-signals-v1/` |
| Total Return | auf 5 Referenzreihen bestätigt, im Universum **nicht einheitlich** (`TOTAL_RETURN_NOT_UNIFORM`) | `quant/data/providers/total-return-verification.json`, `return-basis-universe-study.json` |
| Indexzugehörigkeit | nur 2 Stichtage (15.09. und 26.09.2026) für S&P 500, NDX, DJIA | `quant/data/market/index-membership/history/` |

## Was fehlt

- **Delistete Titel.** Das Universum wird aus der heutigen Tiingo-Liste gebaut; inaktive Einträge
  werden gefiltert (`scripts/market/select-gate-universe.mjs:68`, `active !== false`). Die 191
  inaktiven Stammaktien im committeten Security Master sind fast alle ältere Listings
  wiederverwendeter Ticker. Keine gespeicherte Reihe gehört zu einem wirklich delisteten Titel.
  `docs/TIINGO_DATA_SEMANTICS.md` führt „Delistete Wertpapiere“ als `UNKNOWN`.
- **Historische Universumszugehörigkeit** („was war am Tag X handelbar/im Index“).
- **Historie vor 1990.**
- **Einheitliche Dividendenbereinigung** für Total-Return-P&L (muss aus Rohschluss, Dividende und
  Split-Faktor neu gerechnet werden).

## Lizenz

Tiingo ist `OWNER_DECLARED_LICENSED` (13.09.2026). Der Vertragstext liegt dem Repository nicht vor
(`quant/config/provider-profiles.json`). Ob **abgeleitete Backtest-Ergebnisse** veröffentlicht
werden dürfen, ist für Tiingo nicht beantwortet (`docs/VU_PROVIDER_LICENSE_CHECKLIST.md`). Ob der
aktuelle Plan Kurse delisteter Ticker liefert, ist ebenfalls offen. Die Alternative mit
Delistings (Sharadar, `docs/VU_PROVIDER_DECISION_MATRIX.md`) hat Lizenz- und Preisstatus „offen“.

## Fehlende Voraussetzungen je Strategie

| Strategie | Zusätzlich zu Survivorship und PIT-Universum |
|---|---|
| Momentum Breakout Daily | Querschnitts-Ränge müssen gegen das damalige Universum gerechnet werden; die Opening-Range-Variante braucht Intraday-Historie (vorgehalten: 2 Sitzungen) |
| Weinstein | Benchmark-Wochenreihe vorhanden; Sektorkontext nur über SIC; Volumen nur in den R2-Tagesbalken |
| Darvas | OHLCV ausreichend; die Delistings sind die wesentlichen Verlustfälle |
| Minervini | RS-Rang gegen das Gesamtmarkt-Universum zum Stichtag; mit nur Überlebenden wird die RS systematisch überschätzt |
| Greenblatt | Umlaufvermögen, kurzfristige Verbindlichkeiten und Sachanlagen fehlen; PIT-Fundamentaldaten nur für 5 Titel |

## Die eine nächste Datenmaßnahme

**Ein Probe-Abruf ohne Veröffentlichung:** Für etwa 50 tatsächlich delistete US-Stammaktien aus den
inaktiven Einträgen des vollständigen Security Masters wird die Tageshistorie bei Tiingo abgefragt.
Die Abfrage läuft über die permaTicker-/`canonical_id`-Kennung, nicht über den wiederverwendeten
Ticker, und schließt Insolvenzen aus 2008 und um 2020 ein. Festgehalten werden die Zahl der Balken,
das Enddatum und ob die letzten Balken vorhanden sind. Parallel wird im Vertrag geprüft, ob
Backtests erlaubt sind und abgeleitete Ergebnisse veröffentlicht werden dürfen.

Warum diese Maßnahme: Survivorship ist das einzige Gate, das **alle vier** Live-Strategien
gemeinsam blockiert. Die inaktiven Listings sind samt Start- und Enddaten bereits aufgezählt.
Liefert Tiingo ihre Kurse, lässt sich daraus ein „gelistet am Tag X“-Universum fast ohne
Zusatzkosten rekonstruieren. Das schließt zugleich *Survivorship* und *historisches Universum*.
Liefert Tiingo sie nicht, ist die Antwort eine kostenpflichtige Quelle mit Delistings. Dann ist
zuerst die Lizenzfrage zu klären, danach der Preis.

Diese Maßnahme ist eine Owner-Entscheidung (Anbieterabruf). In dieser Runde wurde sie nicht
umgesetzt.
