# E4 / S1 – vorregistriertes Protokoll

Forschung, nicht zertifiziert. Festgeschrieben vor dem ersten Ergebnislauf am 05.11.2026. Nach diesem Commit unveränderlich; Fehler und Abweichungen ausschließlich im Ergebnisbericht dokumentieren. Keine Parametersuche, keine Nachbarvarianten.

## Frage und Inventur

Welche vorhandenen Long-Setups sind nach Kosten besser als Halten? Basis ist der beim Protokoll-Commit eingefrorene main-Elterncommit (im Laufmanifest gespeichert). Die Engines werden nur importiert, nicht verändert.

| Quelle | Liefert tatsächlich |
|---|---|
| technical/support-resistance.js | ATR-breite Cluster bestätigter Pivots, Gap- und Periodenzonen; keine eigenständigen Trades |
| technical/ti/levels.js | Andere TI-Zonen aus Mehrskalen-Swings, offenen Gaps und 52-Wochen-Extremen; Fibonacci-Konfluenz; keine eigenständigen Trades |
| technical/scenario-engine.js → technical/trade-setup.js | PULLBACK_TO_SUPPORT, BREAKOUT_RETEST, DEEPER_CORRECTION, RANGE_BREAKOUT_UP; objektive Entry-Zonen, Invalidierung/Trade-Stopp und Zielzonen. Auch bearische Spiegelungen; diese Studie untersucht ausdrücklich Long-Kaufgelegenheiten. RANGE und STRUCTURE_FAILURE haben keinen handelbaren Einstieg. |
| setup-engine.js | Zustandskaskade über vorhandenen Katalogfeldern, keine weitere Setup-Familie; Pfadzustände ohne Beobachtungshistorie geschlossen |
| signal-backtest.js | Fünf Wochen-Schlusskursereignisse (Momentum verbessert/verschlechtert, Trend auf/ab, 52-Wochen-Hoch), keine eigenen Stopps/Ziele; daher keine zusätzlichen handelbaren Setup-Varianten |
| pattern-research.js | Merkmale und Gewinner-/Nichtgewinner-Kohorten, keine Entry-/Stopp-/Zielstrategie |

Die TI-Szenarioengine ist eine andere Szenariodefinition; ihre Zonen werden nicht mit der klassischen trade-setup.js-Kette vermischt. Kein neues Schnittmengenmodell.

## Feste Kandidaten und Erkennung

1. Rücksetzer an Unterstützung: bullisches PRIMARY mit Template PULLBACK_TO_SUPPORT. Die Bezeichnung meint die vorhandene Richtungskaskade; sie garantiert keinen separat bullischen SMA-Trend und keine echte Support-Konfluenz (auch Retracement allein möglich). Kein zusätzlicher Trend- oder Supportfilter.
2. Ausbruch über Widerstand: bullisches PRIMARY BREAKOUT_RETEST, also der vorhandene Strukturbruch/Retest, kein erfundener Breakout-Trigger.
3. Rücksetzer an 50-Tage-Linie: NICHT GELIEFERT. SMA50 ist ein Merkmal, kein eigenständiges Setup mit trade-setup.js-Stopp/Ziel. Null auswertbare Fälle, keine Ersatzregel.
4. Seitwärtsbasis: RANGE_BREAKOUT_UP ist CONDITIONAL / AWAITING_TRIGGER. Diese Bedingung wird nicht zu einem bestätigten Signal umgedeutet. Nur wenn die unveränderte Engine ACTIVE liefert, handelbar; sonst null auswertbare Fälle, bedingte Vorkommen zählen separat.
5. Tiefere Korrektur: bullisches ALTERNATIVE DEEPER_CORRECTION, als zusätzliche tatsächlich vorhandene Long-Familie vollständig berichten.

Nur scenario.status=ACTIVE und entryStatus=ACTIVE und trade-setup.js status COMPLETE oder COMPLETE_LOW_RR. Auch niedrige RR bleiben enthalten. Keine Qualitäts-/Scoreselektion. Klassische technical-analysis.js-Kette mit den unveränderten Engine-Defaults; optionale Elliott-, Annotations- und Multi-Timeframe-Module aus, Benchmark null. Diese Abhängigkeiten sind für die klassische Setup-Erkennung nicht erforderlich; kein Ranking, kein Lifecycle-Backfill. Sämtliche Merkmale werden pro Stichtag ausschließlich auf der bis dahin abgeschnittenen Tagesreihe gerechnet. Mindestens 300 Tagesbalken Warm-up wie der vorhandene Setup-Replay. Keine Analyse von 2008–2015: 2015 nur Warm-up; S2-Holdout bleibt unberührt.

## Daten und Zeitraum

Signal-/Eintrittszeitraum 2016-01-01 bis min(2026-12-31, letzter verfügbarer Balken). Keine externen Downloads. Inventur der Repo-Kursquellen mit Datei-Hashes. discover-series-long sind Wochen-Schlusskurse; discover-series tägliche Schlüsse eines Jahres: beide ohne OHLC, niemals O=H=L=C konstruieren. market/golden-preview/daily enthält echte OHLC für AAPL, JPM, MSFT, NVDA, XOM; alle verfügbaren fünf, keine Auswahl nach Ergebnissen. Andere Quellen nur als Abdeckungsinventur, keine synthetischen Ausführungskurse. Verwendete Security-IDs aus Payload, keine eigenen IDs. Splitnormierung über return-series.js#splitFactors; pro Erkennung nur Faktoren aus Balken bis t. Spätere Ausführung und Marken auf dieselbe Skala bringen. Keine neue Split-Ableitung.

Nur heute gelistete Aktien: **Survivorship Bias**; zusätzlich extrem selektive Golden-Five-Abdeckung, keine repräsentative Universumsstudie. Keine historischen Indexmitgliedschaften. Primär splitbereinigte Kursrendite, keine Gesamtrendite; Dividenden fehlen symmetrisch. SPY market/multi-asset/series/SPY.json liefert tägliche splitbereinigte Schlüsse, keine Opens. Der exakte Open-zu-Exit-Vergleich ist damit nicht verfügbar; zusätzlich separat benannter Schlusskurs-Proxy vom Schluss VOR Einstieg bis Schluss des Ausstiegstags, niemals als exakter Vergleich ausgeben. Marktphase an Signaltag: SPY-Schluss >= SMA200 (200 echte tägliche Beobachtungen) oder darunter; fehlende Daten = UNAVAILABLE.

## Ausführung, Kosten und Zählung

Tägliches Beobachtungsraster. Einstieg zum Open des unmittelbar nächsten vorhandenen Tagesbalkens. Signal zählt auch bei später verworfenem Einstieg. Kein Einstieg, falls Open <= Stopp oder >= erstes Ziel (Gap); separat zählen. Stopp wie tradeSetup.tradeStop.price, Ziel konservativ targets[0].zoneLow. Feste Marken ab Signal, kein Trailing. Maximal 60 Handelstage einschließlich Einstiegstag (projectionHorizonBars der Szenario-Defaults); Zeitverkauf zum Schluss des 60. Tages. Vollständiges 60-Tage-Fenster muss vorhanden sein, auch wenn ein früherer Exit möglich wäre: rechtszensierte Signale separat, keine ergebnisabhängige Endauswahl. Ausgänge: Gap unter Stopp zum Open, Gap über Ziel zum Open; sonst Low<=Stopp zum Stopp, High>=Ziel zum Ziel. Bei beiden Berührungen am selben Tag Stopp zuerst, Anzahl Ambiguitäten berichten. Einstiegstag eingeschlossen. Keine Trigger-Limit-Order an der alten Entry-Zone; Auftrag ist der vom Nutzer verlangte nächste Open.

Je Aktie/Familie höchstens ein offener Trade; weitere aktive Tage bis einschließlich Exit werden als überlappende Beobachtungen gezählt, nicht als zusätzliche Trades. Andere Familien können gleichzeitig handeln; diese Studie ist kein Portfolio. Fehlende/inkonsistente OHLC, unvollständige Splitfelder oder Lücken >7 Kalendertage im Ausführungsfenster: verwerfen und zählen, nie auffüllen.

Kosten 10 bp auf Kaufnotional plus 10 bp auf Verkaufsnotional. Nettogewinn = Exit - Entry - .001*(Entry+Exit). R=Entry-Stopp vor Kosten, positiv; Netto-R=Nettogewinn/R. Trefferquote = Anteil Netto-R>0, durchschnittliches Gewinn-R und negatives Verlust-R getrennt, Nullfälle separat. Erwartungswert = mittleres Netto-R; zusätzlich Brutto-R und Netto-Kursrendite.

Halten derselben Aktie: gleicher Open und derselbe Ausstiegstag, aber Verkauf zum Tagesschluss ohne Stopp/Ziel; identische Kosten, identischer R-Nenner. Das misst den Effekt der Exitregeln, nicht Timing-Alpha oder Buy-and-hold über das ganze Jahrzehnt. Gleiche tatsächliche Haltedauer in Handelstagen, Intraday-Differenz mangels Intraday-Kursen offen benennen. Zusätzlich SPY-Proxy mit identischen Roundtrip-Kosten und auf Aktien-Risikoanteil (R/Entry) normiert. Primäre Differenz gegen Halten in R; SPY-Proxy nur deskriptiv. Keine Annualisierung von Einzeltrades.

## Statistik, Urteil und S2

Keine Auswahlparameter anhand der Ergebnisse. Alle fünf Familien und Marktphasen berichten, auch negative/leere. Mindestens 100 abgeschlossene Trades, 20 unterschiedliche Aktien und 20 unterschiedliche Eintritts-Kalenderquartale für ein belastbares Urteil. Andernfalls „zu wenig Fälle“, ungeachtet hoher Rendite. Urteil „besser als Halten“ verlangt positiven Netto-Erwartungswert, positive mittlere gepaarte Differenz gegen Aktie UND exakten SPY-Vergleich sowie korrigierte Signifikanz. Sonst bei ausreichender Abdeckung „nicht besser“ (fehlender Nachweis, kein Gleichheitsbeweis).

Einseitige Tests der gepaarten mittleren R-Differenz per deterministischem Wild-Cluster-Bootstrap: Eintritts-Kalenderquartale als Cluster, unter H0 zentrierte Trades, je Cluster gemeinsames ±1-Zeichen, 9999 Ziehungen, Seed 20261105, p=(1+Anzahl simulierte Mittel >= beobachtet)/(10000). Zeitgleichheit und Serienkorrelation innerhalb eines Quartals werden so berücksichtigt, über Quartalsgrenzen bleibt Abhängigkeit möglich. Holm über 10 Hypothesen (5 Familien × Aktie/SPY), alpha .05. Fehlende Familien/exakte SPY-Daten erhalten p=1; kein schrumpfender Testnenner. Marktphasen rein deskriptiv, keine weiteren Signifikanzbehauptungen. 95%-Intervalle nicht vorausgesetzt, keine nachträgliche Power-Optimierung.

Rangliste absteigend nach mittlerem Netto-R, fehlende zuletzt, Gleichstand Kandidatenreihenfolge; Urteil/Abdeckung hat Vorrang vor Rang. Nur Familien mit positivem Netto-R und positiver Aktiendifferenz für S2 vorschlagen, klar als unbestätigte Kandidaten. Wenn keine diese Hürden nimmt: keine Gewinnerempfehlung. S2 muss breites Universum inklusive Delistings, echte Benchmark-Ausführung und unberührte Jahre 2008–2015 nachliefern, bevor S3 zulässig ist.
