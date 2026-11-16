# EMA Cluster Intelligence – Backendvertrag und Forschung

Implementierung: `quant/engines/technical/ema-cluster.js`. Keine UI-Anbindung, kein neuer Erzeugerzeitplan.

## Vertrag und Regeln (1.0.0)

`calculate({bars, asOf, timeframe, config})` erwartet abgeschlossene, kanonische splitbereinigte Bars (`date`, `close`, optional gemeinsam `high`/`low`, `availableAt`). Zeitrahmen: 1D/1W/1M; Tagesbars vorher mit `multi-timeframe.js#completedSeries` aggregieren. Kurslücken und Identitätsgrenzen sind vom Datenadapter zu behandeln, nicht durch Auffüllen. Ungültige/noch nicht verfügbare Bars werden abgelehnt. Zukunft ab `asOf` wird vor der Berechnung abgeschnitten.

Standard: GMMA mit 3/5/8/10/12/15 und 30/35/40/45/50/60. Konfigurierbare Gruppen müssen disjunkt sein, alle schnellen Perioden kürzer als alle langsamen. Keine Zuschreibung an Trade Ryan, Chartsekte oder Wir lieben Aktien. EMA ausschließlich `feature-store.js#settledEma`, einschließlich bestehender Startfehlerschranke. Anlaufdaten bleiben `WARMUP`, keine neutralen Ersatzwerte.

Ausgabe `ema-cluster-1.0.0`: Konfiguration und Hash, Kursbasis, Zeitrahmen, Stichtag, `rows`, `events`. Jede Zeile enthält Qualität, Trend, Anordnung, Dynamik, Gruppen-Minimum/-Maximum/-Mittel und EMA-Werte sowie Metriken. Jedes Ereignis enthält Typ, Richtung, Datum, Verfügbarkeitszeitpunkt, Zeitrahmen und Konfigurationshash. Identität wird durch den aufrufenden bestehenden Instrument-/Listingvertrag ergänzt; der Kern erfindet keine Identitäten.

- Bullische Anordnung: kleinste schnelle EMA > größte langsame EMA; bärisch umgekehrt, sonst überlappend.
- Gruppenbreite = (Maximum − Minimum) / Schluss; Abstand = (schnelles Mittel − langsames Mittel) / Schluss. Kursabstand zum Band ist innerhalb null, außerhalb vorzeichenbehaftet relativ zum Schluss.
- Steigung = Änderung des Gruppenmittels über 5 Bars / aktuellen Schluss / 5. Aufwärts-/Abwärtstrend verlangt passende Anordnung und beide Steigungen jenseits ±0,01 % je Bar. Sonst seitwärts bei Kompression und flachen Steigungen, ansonsten Übergang.
- Kompression: schnelle Breite ≤ 0,5 %, langsame ≤ 1 %. Expansion: Gesamtbreite mindestens Faktor 1,2 gegenüber 5 Bars zuvor, außerhalb Kompression. Nulldivision liefert keinen Expansionsnachweis.
- Diese Schwellen sind vor der ersten Auswertung festgelegte VU-Forschungskonventionen, keine GMMA-Originalschwellen: kleine relative Bänder und eine 20-%-Breitenänderung trennen die Begriffe reproduzierbar. Sie sind keine empirisch optimierten Renditeparameter.
- Stabilität = Dauer derselben Gruppenanordnung / 20, bei 1 gekappt. Trendstärke ist ein beschreibender Index aus Abstand (Referenz 3 %), langsamer Steigung (0,2 % je Bar) und Stabilität. Kein Trust Score, keine Wahrscheinlichkeit.
- Pullback: aus zuvor aktivem Trend und vorherigem Kurs außerhalb des Bands kommt der Kursbereich in das schnelle/langsame Band. Ohne OHLC wird nur der Schluss geprüft. Rückkehr frühestens am Folgebalken bei Schluss jenseits des schnellen Bands in Trendrichtung und passender schneller Steigung. Verfall nach 20 Bars oder gegensätzlicher Gruppenanordnung.
- Ereignisse werden beim Zustandswechsel erzeugt, Pullback und Rückkehr bleiben zeitlich getrennt. Kompression→Trend-Ausbruch verlangt unmittelbar vorherige Kompression. Trendwechsel vergleicht die letzte bestätigte Trendrichtung; Übergangsphasen bleiben sichtbar.

## Historische Studie

`scripts/technical/ema-cluster-study.mjs` nutzt unverändert `research-studies.cjs#runEventStudy`, `inference`, `classifyRegimes` und `research-validation.cjs#buildWalkForward`, `aggregateOos`, `holm`. Modus `FORMATIONS` verwendet dieselbe bestehende Formations-Engine mit `analyzeAt(k)`; erstes tatsächlich sichtbares Auftreten zählt. Keine Nutzung von `stateNow` oder vorgezogenen Pivotdaten.

Vor der ersten Ergebnissichtung festgelegt (15.11.2026): Standard-GMMA; alle 12 Ereignistypen; 5/20/60 Handelstage ab dem ersten beobachteten Sitzungsschluss strikt nach Bekanntwerden; Kosten je Seite 5 bp Gebühren + 5 bp Slippage. Preisrenditen nur gegen Preisrenditen, Gesamtrenditen nur gegen Gesamtrenditen mit `returnLevel`. Positive, negative und unveränderte Folgerenditen sowie SPY-Überschuss werden getrennt ausgewiesen. Bärische Ereignisse zusätzlich richtungsbereinigt: nur die Brutto-Relativbewegung wird umgedreht, Kosten werden auch dort abgezogen; kein ausführbarer Short-Backtest.

Inferenz: vorhandene Datums-/Emittentencluster; Holm über sämtliche Ereignistypen × drei Horizonte (nicht messbare Tests bleiben in der Familie). P-Werte erst ab 100 Beobachtungen, 30 Datumsclustern und 2 Emittenten. Regime des vorhandenen Klassifikators: 126/63 Tage, Trendband 2 %, Volatilitätsgrenze 25 %, annualisiert 252; nachträglich beschreibend. Walk-Forward: 252/63/126 Sitzungen, Schritt 126, 5 Kalendertage Embargo, Purging nach Informations-/Ergebnisintervallen. Kein Fitten oder Variantauswahl; spätere Fenster sind kein unberührter Holdout. Verbrauchten Holdout 2008–2015 nicht erneut als unabhängigen Nachweis verwenden.

Input `technical-event-study-input-1.0.0`: `asOf`, `priceBasis: SPLIT_ADJUSTED_PRICE`, `returnBasis`, `currency: USD`, `sourceMode`, expliziter Sitzungskalender, Populationsherkunft/-grenzen, Listings mit Identitäts-/Mitgliedschaftsbelegen und Tagesbars, Benchmark `id: SPY` mit derselben Renditebasis. Das ist ein Adapter auf den bestehenden Research-Vertrag, kein paralleles Populationsmodell. Fehlende Historie, Ereignisse und zensierte Ausgänge bleiben sichtbar; keine Delisting-Erlöse imputieren.

```bash
node scripts/technical/ema-cluster-input.mjs --out /tmp/cluster-input.json
node scripts/technical/ema-cluster-study.mjs --input /tmp/cluster-input.json --out /tmp/cluster-study.json
node scripts/technical/ema-cluster-study.mjs --input /tmp/cluster-input.json --out /tmp/formations-weekly.json --mode FORMATIONS --timeframe 1W
```

Der optionale Inputadapter verwendet ausschließlich bereits committete Golden-Five-Tageshistorien über `golden-five-series.mjs` und die vorhandene SPY-Tagesreihe. Das sind fünf handverlesene heutige Überlebende, keine historische Marktpopulation; beide Seiten Kursrendite ohne Dividenden. Der Tagesend-Zeitstempel ist eine konservative Modellkonvention. Kein Anbieterabruf. Outputs nur außerhalb des Repositorys; keine automatische Produktveröffentlichung.

## Manuelle DEV-Erweiterung auf 200 Aktien (Owner 16.11.2026)

Vor der ersten Auswertung gilt `ema-cluster-dev-study.mjs#PLAN` (`EMA_CLUSTER_DEV_200_V1`): ausschließlich Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Beobachtung 04.01.2016–30.09.2026, Vorlauf ab 2015, unveränderte GMMA-/Ereignis-/Kosten-/Regime-/Walk-Forward-Konventionen. Ziel 150 aktive/50 im DEV-Fenster beendete Listings, nur `EQUITY_COMMON`, mindestens 300 gespeicherte Tageskerzen, mindestens eine im Beobachtungsfenster. Wiedervergebene Listingidentitäten werden ausgeschlossen; bekannte CIKs dedupliziert. Keine Auswahl nach Rendite, Liquidität oder späterer Ereignisanzahl. Das ist eine bedingte Stichprobe, keine repräsentative Marktpopulation.

Schichtung: verfügbare SEC-SIC-Division am früheren Datum aus Listingende und DEV-Ende; verknüpft nur über vorhandene CIK. Unbekannte CIK/Branche bleiben `UNKNOWN`, kein Ticker-Fallback. Innerhalb jedes Status/Branchen-Stratums Rang nach SHA-256 aus festem Seed, Snapshot-ID und Listing-ID; gleiche Zuteilung durch Round-Robin über sortierte Strata bis zum Statusziel. Fehlende Titel werden nicht durch die andere Statusgruppe ersetzt. Stichprobe, Ausschlüsse und Hash werden **vor jeder Ereignisberechnung** geschrieben und versiegelt. Die Brancheninformation dient der bedingten Schichtung, nicht als historischer Anlageentscheidungsnachweis.

Ausführung im bestehenden `research.yml`-Portfoliojob, manueller Modus `ema-cluster-dev`, sequenziell fünf Listings je Batch. Keine neuen Jobs/Workflows/Timer; dieser Modus überspringt Anbieter-, V13-, SEC-Neuabrufe und Produkt-Commits. Restore über vorhandene Snapshot-IO, Fingerabdruck exakt prüfen, keinen alten Kontroll-Backtest wiederholen. Alle zwölf Ereignisse × 5/20/60 Tage ab nächstem Sitzungsschluss, SPY als Split-bereinigte Kursrendite, keine unbekannten Delisting-Erlöse. Vorhandene DQ-K5-Flags bleiben enthalten und werden separat gezählt; weder Reparatur noch Ausschluss echter Crashs. Die ungeklärten Kapitalmaßnahmen bleiben eine Ergebnisgrenze.

Für die gemeinsame Statistik werden die unveränderten Quant-Ereigniszeilen zusammengeführt, keine Batch-Mittelwerte gemittelt. Primärfamilie: 36 Tests auf rohe SPY-Exzessrendite mit globaler Holm-Korrektur; Status-, Regime-, Branchen-, Jahres- und richtungsbereinigte Ergebnisse sind deskriptiv. Gemeinsames sowie Batch-Walk-Forward verwenden bestehende Grenzen; `NOT_RUN` ist kein bestandener Nachweis. Kein unabhängiger Holdout und keine finanzierte/shortbare Strategie. Temporäre Kurse und Ereigniszeilen bleiben außerhalb des Repositorys. Rückgabe nur als vorhandenes RSA/AES-GCM-Format an den Sitzungsschlüssel, sieben Tage Artifact-Retention; öffentliche Quittung enthält nur Hashes und Anzahlen.

## Spätere Integration

Chart: `fast`/`slow` und Zeitraum aus `rows`; Screener: letzte READY-Zeile mit Konfigurationsversion; Ereignisse: Datum und `availableAt`, niemals rückdatieren. Academy: Regeln, Schwellenkonventionen und Grenzen dieses Dokuments. Historische Evidenz bleibt eigener Studiennachweis mit Population und Horizont, niemals ein Erfolgslabel am Trendzustand. Keine Änderung bestehender Spalten oder UI-Dateien erforderlich.

## Durchgeführte Referenzstudien (keine Parameteroptimierung)

Die vollständigen abgeleiteten Ergebnisse liegen hier; Rohkurse bleiben in ihren bestehenden Quellen:

- [EMA, Tag](ema-cluster/ema-reference-2026-11-06.json): fünf Titel, 9.006 Ereignisse, 36 Ereignis-/Horizontzellen; Walk-Forward in 24 Zellen ausgeführt, in 12 wegen des vorhandenen `PURGE_OPERATION_BUDGET` ausdrücklich nicht gerechnet.
- [Formationen, Woche](ema-cluster/formations-weekly-reference-2026-11-06.json): fünf Titel, 511 Ereignisse, 63 Zellen; Walk-Forward ausgeführt.
- [Formationen, Monat](ema-cluster/formations-monthly-reference-2026-11-06.json): fünf Titel, 49 Ereignisse, 27 Zellen; Walk-Forward ausgeführt. Die Stichproben sind zu klein für die festgelegten Signifikanztests; keine Signifikanzbehauptung.

Realisierter Stichtag ist 06.11.2026, das Ende der vorhandenen SPY-Referenzreihe, nicht das spätere Ende der Aktienreihen. EMA-Lauf rund 68 s und 198 MiB maximaler Prozessspeicher; Wochen-/Monatsformationen rund 17/11 s, jeweils rund 175 MiB (lokaler Node-22-Lauf, keine Mobilmessung). Die Ergebnisse tragen Eingabe-/Code-/Ergebnis-Hashes und die Quittungen der unveränderten Quant-Engine. Alle Ereignisse und negativen Ergebnisse bleiben enthalten. Keine dieser Referenzstudien ist ein unabhängiger Erfolgsnachweis, eine repräsentative Marktstudie oder ein finanzierter Portfolio-Backtest.

Der zusätzliche Modus `TEMPLATES` wertet datierte historische Screener-Zeilen in `listings[].templateSnapshots` über die bestehenden `technical/engine/templates.js`-Prädikate aus. Snapshot: `date`, `availableAt`, `sourceHash`, `fields` (bestehende Screener-Spalten, einschließlich `fresh`). Nur ein Wechsel false→true an aufeinanderfolgenden Sitzungen wird zum Ereignis; fehlende Werte bleiben unbekannt. Heutige Spalten werden nicht rückwirkend eingesetzt. Ohne diese historischen Snapshots meldet der Adapter den fehlenden Eingang. Damit ist die exakte Vorlagenstudie technisch vorbereitet; eine breite Rekonstruktion aller 13 Vorlagen bleibt durch private Tages-/PIT-Querschnittsdaten begrenzt. Die bestehende S4-Wochenstudie wurde nicht wiederholt.
