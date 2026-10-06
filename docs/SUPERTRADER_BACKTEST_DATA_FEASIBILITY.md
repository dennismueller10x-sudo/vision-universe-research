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

## Was ein survivorship-freier Backtest nachweisen muss — fünf getrennte Nachweise

Ein Backtest ist erst belastbar, wenn **alle fünf** Nachweise erbracht sind. Keiner ersetzt einen
anderen.

| # | Nachweis | Heute | Was ihn erbringen würde |
|---|---|---|---|
| 1 | **Kursreihen delisteter Titel** — vollständige Tagesreihen bis zum letzten Handelstag, inkl. Kursverfall vor Insolvenz/Übernahme | keine einzige Reihe eines wirklich delisteten Titels | Anbieter liefert Reihen über eine stabile Kennung (nicht den wiederverwendeten Ticker), mit Enddatum und letztem Kurs; Stichprobe gegen unabhängige Quelle |
| 2 | **Damalige Universumszugehörigkeit** — welche Titel am Stichtag X gelistet und handelbar waren (bzw. im Index) | 2 Index-Stichtage (Sept. 2026); Start-/Enddaten nur für heute bekannte Ticker | Listing-Historie mit Start- und Enddatum je Wertpapier-ID; für Indexvarianten historische Mitgliedschaften; Abgleich, wie viele Emittenten vor Aufnahme in die Anbieterliste verschwanden |
| 3 | **Kapitalmaßnahmen** — Splits, Dividenden, Spin-offs, Fusionen, Tickerwechsel korrekt und zeitgerecht | Splits adjustiert; Dividendenbereinigung im Universum nicht einheitlich (`TOTAL_RETURN_NOT_UNIFORM`); Spin-offs/Fusionen/Delisting-Erlöse nicht geprüft | Ereignistabelle je Wertpapier-ID inkl. Delisting-Rendite; Total Return aus Rohschluss, Dividende und Split-Faktor neu gerechnet und auf Stichproben geprüft |
| 4 | **Zeitliche Verfügbarkeit (Point-in-Time)** — nur Informationen, die am Stichtag bekannt waren | Kurse unkritisch (Tagesschluss); Querschnittsränge müssten gegen das damalige Universum gerechnet werden; Fundamentaldaten PIT nur für 5 Titel | Ränge je Stichtag aus Nachweis 2; für Greenblatt/Minervini-Fundamentals Veröffentlichungszeitpunkte und Restatements |
| 5 | **Nutzungsrechte** — Backtest-Berechnung und Veröffentlichung abgeleiteter Ergebnisse erlaubt | Tiingo `OWNER_DECLARED_LICENSED`, Vertragstext nicht im Repository; Rechte an abgeleiteten Ergebnissen und an Delisting-Daten ungeklärt | schriftliche Bestätigung im Vertrag/Plan für (a) Delisting-Historie, (b) interne Backtests, (c) Veröffentlichung abgeleiteter Kennzahlen |

## Nächster Schritt: Machbarkeitsprüfung, kein Beweis

**Vorschlag (Owner-Entscheidung, in diesem PR nicht ausgeführt):** Probeabruf ohne
Veröffentlichung für rund 50 tatsächlich delistete US-Stammaktien aus den inaktiven Einträgen des
vollständigen Security Masters (Abruf über permaTicker/`canonical_id`, gemischt aus Insolvenzen
2008 und um 2020, Übernahmen und Downlistings). Festhalten: Balkenzahl, erstes und letztes Datum,
ob der Kursverfall bis zum letzten Handelstag enthalten ist, Split-/Dividendenspalten.

**Was dieser Probeabruf zeigen kann:** nur Nachweis 1 als Machbarkeit — ob der aktuelle Plan
Kursreihen delisteter Titel überhaupt liefert und in welcher Qualität.

**Was er nicht zeigt:** kein historisch korrektes, survivorship-freies Universum. Offen blieben
danach Nachweis 2 (vollständige Listing-Historie und Emittenten, die vor der Anbieterliste
verschwanden), Nachweis 3 (Delisting-Renditen, Fusionen, einheitlicher Total Return),
Nachweis 4 (Ränge und Fundamentaldaten zum Stichtag) und Nachweis 5 (Rechte). Parallel zum Probeabruf
sollte deshalb Nachweis 5 vertraglich geklärt werden — ohne ihn wäre auch ein technisch
vollständiger Datensatz nicht veröffentlichbar.

Fällt der Probeabruf negativ aus, ist die Alternative eine Quelle mit Delistings (z. B. Sharadar);
dort sind ebenfalls alle fünf Nachweise einzeln zu prüfen, Lizenz vor Preis.

In diesem PR wurde weder ein Anbieter abgerufen noch die Pipeline verändert.

## Explorativer Pilot (Runde 4)

**Festgelegt vor dem ersten Lauf (2026-10-01)**, genau ein Lauf, keine Parametersuche
(`scripts/supertrader/pilot/donchian-weekly.mjs`):

- **Methode:** Donchian-/Turtle-Kanal 20/10, auf Wochenschlüsse übertragen (VU). Ausführung zum Schluss der Folgewoche.
- **Portfolio:** max. 20 Positionen, gleich gewichtet.
- **Kosten und Rendite:** 0,25 % je Seite; Kursrendite ohne Dividenden.
- **Universum:** 6.333 öffentliche Wochenschlussreihen, also nur heute gelistete Titel. Zulässig je Woche: ≥ 52 Wochen Historie, Schluss ≥ 5 USD.
- **Datenanomalien:** 1.076 Wochenwerte außerhalb von −75 % / +300 % ausgeschlossen.
- **Zeitraum:** 07.01.2000 – 25.09.2026. In-Sample bis 2015, Out-of-Sample ab 2016.

| | Regel (nach Kosten) | Gleichgew. gleiches Universum | SPY (Kurs) |
|---|---|---|---|
| CAGR | −2,5 % | +8,1 % | +6,4 % |
| Max. Rückgang | −93 % | −57 % | −56 % |
| Schwankung p. a. | 45 % | 19 % | 18 % |

Kennzahlen der Regel:
- Trades: 1.619
- Trefferquote: 31 %
- Ø Gewinn / Ø Verlust: +61 % / −26 %
- Profit Factor: 1,06
- In-Sample: −0,3 % p. a.; Out-of-Sample: −5,1 % p. a.

**Einordnung:** Das ist explorativ, kein Nachweis. Survivorship Bias hebt Strategie *und*
Vergleichsuniversum; der Abstand ist dadurch nicht bereinigt. Das Ergebnis liefert keinen Hinweis
auf Überlegenheit dieser Übertragung. Es wird so veröffentlicht, wie es ausfiel.

## Prüfpläne statt pauschaler 8 Jahre

Die Prüfpläne sind je Methode vorab festgelegt (`engine/gates.mjs`, `TEST_PLANS`). Maßgeblich sind
unabhängige Beobachtungen und Bärenmärkte (SPY ≥ −20 %), nicht eine einheitliche Jahreszahl:

| Methode | Mindestjahre | Bärenmärkte | Beobachtungen | Begründung |
|---|---|---|---|---|
| Tagesmethoden (Momentum, Darvas, Donchian) | 10 | 2 | 300 Trades | kurze Haltedauer, viele Trades |
| Minervini | 10 | 2 | 200 Trades | seltene Setups |
| Weinstein (Woche) | 20 | 3 | 150 Trades | Stufenzyklen über Jahre |
| Greenblatt, Piotroski (jährlich) | 20 | 3 | 20 Jahreskohorten | eine unabhängige Beobachtung je Jahr |
| CAN SLIM (vollständig) | 10 | 2 | 200 Trades | plus Quartalsgewinne und Fondsbestände zum Stichtag |

Neu als hartes Gate kommen hinzu:
- **Nutzungsrechte.**
- **Kapitalmaßnahmen** gelten nur als erfüllt, wenn neben Splits auch Dividenden einheitlich bereinigt sind und Delisting-Renditen vorliegen. Beides ist heute nicht der Fall.
