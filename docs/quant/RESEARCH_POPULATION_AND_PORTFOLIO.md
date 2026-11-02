# Research-Population, Backtest-Kennzahlen und Exit-Regeln (P2)

Status: **Research-Werkzeug, nicht zertifiziert.** Kein Produktpfad, kein Endpunkt, keine UI liest diese Module.
`productionApproved` bleibt `false`; jede Ausgabe trägt `certification: NOT_CERTIFIED`. Ein Lauf mit diesen Modulen ist
höchstens Zustand A (RESEARCH_EXECUTED) im dokumentierten Scope, nie automatisch C (PRODUCT_CERTIFIED).

## 1. `scripts/quant/research/research-population.cjs` – eine Fassade für historische Populationen

Ausdrücklich zu aktivieren (Profilname), Default-Verhalten aller bestehenden Loader bleibt unverändert.
Die Fassade leitet **nichts neu ab**, sie ruft vorhandenen Code:

| Baustein | Herkunft |
|---|---|
| Loader-Optionen | `research-weekly-loader.cjs` (Optionsnamen aus `LOADER_OPTIONS*`, Abhängigkeiten prüft der Loader selbst) |
| Frame-Regel (modale Wochenlabels, MIC-Menge), Source-Manifest | `scripts/quant/v10/studies/common.cjs#buildFrame/#sourceManifest` (aufgerufen, nicht nachgebaut) |
| Delisted-Frames F1/F1c/F1w | `scripts/quant/v13/studies/run-frame.cjs#buildContext` (FRAMES, `lib.mergeFrame`, `lib.mergedManifestHash`) über `research-delisted-series.cjs#loadDelisted` |
| PIT-Register | `research-pit-market-cap.cjs`, `research-index-population.cjs`: nur Verfügbarkeit/Abdeckung, keine Verknüpfung mit dem Frame |

### API

```js
const Pop = require('scripts/quant/research/research-population.cjs');
const p = Pop.buildPopulation({ profile: 'V10_LIFECYCLE', window: ['2000-01-01', '2025-12-31'], privateDirs: { delistedSeries } });
p.listings          // Map(securityId -> Loader-Dokument), Frame-Listings mit Überlappung zum Fenster (nicht aufzählbar)
p.frameIds, p.calendar, p.calendarInWindow
p.coverage          // perYear {active, entering, ending, delistedActive, censoredEnding, delistedShare}, lifecycleStatus,
                    // terminalKind, endedBeforeCalendarEnd, censoredEnds, corporateActionQuality, corporateActionEvidenceBound,
                    // identityEvidenceBound, totalReturnAvailable/Share, delistedListings/Share, qualificationCounts,
                    // frameExclusions, registers {pitMarketCap, indexPopulation}
p.dataQuality       // {warnings, docWarningCounts}
p.inputHashes       // masterHash, Register-Hashes (Identity/V12/V13/V13b, CA, Lifecycle, Delisted-Register, PIT-MCAP, Index),
                    // sourceManifestHash, f0ManifestHash, calendarHash, pointsHashRoot (+ pointsHashes mit includePointsHashes)
p.profile           // {name, spec, specHash}
p.reference         // Vergleich mit dem veröffentlichten Referenzlauf (Drift der quant/data seit dem Lauf)
p.populationHash
Pop.summarize(p)    // JSON-sicherer Bericht ohne Dokumente
Pop.availability('V13_DELISTED_F1', { privateDirs })   // prüft private Eingaben ohne zu bauen
Pop.createLoader('PRODUCT_DEFAULT')                     // = weekly-real-adapter createLoader (byte-identisch)
```

Profile: `PRODUCT_DEFAULT` (Adapter-Loader, nur Survivor-Kohorte), `V10_PRIMARY` (Identity + CA), `V10_LIFECYCLE`
(+ Lifecycle = V12-Requal-Frame = V13 F0), `V12_LARGECAP`, `V13_LARGECAP`, `V13B_LARGECAP_STRICT`, `V13_DELISTED_F1`,
`V13_DELISTED_F1C`, `V13B_DELISTED_F1W`.

Regeln:
- Frame-Regel und Kalender werden immer auf den vollen Daten berechnet (wie in den Referenzläufen); `window` schränkt nur die
  zurückgegebenen Listings und den Abdeckungsbericht ein.
- Delisted-Profile brauchen das private Verzeichnis (außerhalb des Repositorys). Fehlt es: `PRIVATE_DATA_UNAVAILABLE`;
  liegt es im Repository: `PRIVATE_DIR_INSIDE_REPOSITORY`; fehlen Dateien zu Registerzeilen: `PRIVATE_DATA_INCOMPLETE`.
  Es gibt keinen stillen Rückfall auf F0.
- Gesamtrendite-Reihen gibt es nur für die privaten Delisted-Reihen; die öffentlichen Wochenreihen sind PRICE_RETURN
  (Warnung `PRICE_RETURN_ONLY_NO_TOTAL_RETURN_SERIES` bzw. `TOTAL_RETURN_PARTIAL_n_OF_m`).

### Stand der Daten (main @ e62d7268e1, Lauf 2026-10-29)

| Profil | Frame | qualifiziert | Kalender | Referenz |
|---|---|---|---|---|
| PRODUCT_DEFAULT | 4.253 | 4.448 | 1.922 Wochen, Hash `48605c9a…` | – |
| V10_LIFECYCLE (= V13 F0) | **4.327** (Referenz 4.329) | 4.525 (Referenz 4.526) | 1.922, Hash = V10-Referenz | Drift: `ref_NUWE`, `ref_SCAG` nicht mehr im Frame; Source-Manifest `9e535518…` statt `2c27039f…` |
| V13_DELISTED_F1 / F1c / F1w | nicht gebaut | – | – | private Reihen in dieser Umgebung nicht vorhanden → `PRIVATE_DATA_UNAVAILABLE` (Referenz V13: 4.719 / 4.758 / 5.905) |

Für alle Listings, die in beiden Läufen vorkommen, sind die Punkt-Hashes unverändert; der Kalender-Hash entspricht der
V10-Referenz. Die beiden entfallenen Listings erklären die Abweichung 4.329 → 4.327.

## 2. `quant/engines/backtest-metrics.cjs` – Kennzahlen aus einem Equity-/Cash-/Trade-Pfad

`computeMetrics(ledger, options)`; `fromPortfolio(runPortfolioResult)` erzeugt den Ledger aus `research-portfolio.cjs`.
Einfache Ledger: `{initialCapital?, rows: [{date, value, cash?, receivables?, benchmark?, positions?}], trades?: [{date,
listingId, side, notional, fee?, slippage?, units?}]}`.

Kennzahlen und Konventionen:
- Gesamtrendite, CAGR (365,25-Tage-Jahre, wie die Engine), Kalenderjahresrenditen (Teiljahre markiert).
- Volatilität annualisiert aus Zeile-zu-Zeile-Renditen, Stichproben-SD (n−1) × √52 (Default `periodsPerYear: 52`, WEEKLY;
  Warnung bei abweichendem Datumsabstand).
- Max. Drawdown inkl. Peak-, Trough-, Erholungsdatum und Dauer (Perioden/Tage); der Startpunkt ist das Anfangskapital
  (Einstiegskosten zählen, wie `Legacy.maxDrawdownOf` in der Engine).
- Trades: eine Runde ist eine Positionsepisode eines Listings (Kauf ohne Bestand → Bestand null). P&L = Verkaufs- minus
  Kaufnotional minus Gebühren und Slippage. Trefferquote nur über zuordenbare Runden (Kauf eröffnet, Verkauf schließt);
  Episoden durch Spin-off-/Nachfolger-Einheiten oder Terminal-Ereignisse werden gezählt, aber nicht bewertet. Offene Positionen
  am Ende separat. Ausschüttungen sind nicht Teil der Trade-P&L.
- Haltedauer (Perioden und Tage), Zahl der Fills, Fills je Exit-Grund.
- Turnover je Datum = Notional / (2 × Equity vor dem Handel) – identisch zur Engine-Definition; Summe und annualisiert.
- Kosten gesamt (Gebühren, Slippage, Anteil am Anfangskapital), durchschnittliche Cash-Quote.
- Benchmark nur auf denselben Daten (fehlende Daten → `BENCHMARK_DATES_INCOMPLETE`, nichts wird aufgefüllt): Rendite,
  Überschuss, Tracking Error, Beta, Korrelation, Information Ratio.
- Sharpe mit expliziter, beschrifteter Risk-free-Annahme (Default 0, `ASSUMPTION_ZERO_DEFAULT`).

Unabhängige Gegenrechnung: `python3 -I scripts/quant/verify-backtest-metrics.py --input case.json [--out report.json]`
(stdlib, eigener Code, relative Toleranz 1e-9). Paritätstests: Fixtures (Units- und Positionspfad, Risk-free, Benchmark),
fünf synthetische Portfolios, ein Stop-Portfolio und zwei echte `runPortfolio`-Läufe aus den committeten Wochenreihen
(MSFT, JPM, KO, PG, XOM, 2010–2024, SPY-Preisbenchmark).

Beispiel (echter Lauf, 5 Titel à 18 %, Rebalancing alle 4 Wochen, 5+5 bp, 782 Wochen 2010-01 bis 2024-12; konditionale
Survivor-Kohorte, keine Dividenden, nicht übertragbar): Gesamtrendite 286,7 %, CAGR 9,46 %, Vol 13,9 %, Sharpe (rf 0) 0,72,
MDD −30,3 % (2020-02-14 → 2020-03-20, erholt 2021-02-05), SPY 419,3 %, Beta 0,76, Tracking Error 7,6 %. Werte dienen der
Plausibilisierung der Rechenwege, nicht als Strategiebefund.

## 3. Opt-in-Exit-Regeln in `research-portfolio.cjs` (1.3.0)

`input.exitRules = { stop?: {semantics: 'WEEKLY_CLOSE_STOP', threshold: (0,1), reference: 'AVERAGE_ENTRY_PRICE' |
'TRAILING_HIGH_CLOSE'}, maxHoldingSessions?: n ≥ 1, reentry: 'NEXT_TARGET' | 'AFTER_TARGET_DROPS' }`

Fachliche Semantik (nur mit Wochendaten zulässige Aussagen):
- Ausgewertet wird **nur der Schlusskurs der Bewertungssession** (bei Wochensessions der Wochenschluss). Ein Stop greift, wenn
  dieser Schluss ≤ Referenz × (1 − threshold) ist. Es gibt keine Intraweek-Kurse, keine Stop-Order-Ausführung zum Limit.
- Ausführung: Vollverkauf zum Schluss der **nächsten** Session (bestehendes Engine-Timing Entscheidung → nächste Session),
  mit den normalen Kosten; der Gap-Verlust über die Schwelle hinaus bleibt im Ergebnis.
- `WEEKLY_CLOSE_STOP` verlangt eine Session je ISO-Woche (`WEEKLY_CLOSE_STOP_REQUIRES_WEEKLY_SESSIONS`).
- Referenzen: gewichteter Durchschnittseinstand der offenen Position (Zukäufe gemittelt) oder höchster Schluss seit Eröffnung;
  bei SPLIT-Ereignissen wird die Referenz durch das Verhältnis geteilt. Dividenden werden nicht addiert (Rohschluss).
- `maxHoldingSessions = N`: Auslösung am Schluss der N-ten gehaltenen Session, Verkauf an der folgenden; Haltedauer Kauf→Verkauf
  genau N Sessions. Zukäufe setzen die Uhr nicht zurück.
- Ein ausgelöstes Listing wird bei einem Target am Ausführungstag nicht zurückgekauft; sein Gewicht bleibt Cash (keine
  Umverteilung). `NEXT_TARGET`: Wiedereinstieg durch jedes später entschiedene Target. `AFTER_TARGET_DROPS`: erst nachdem ein
  späteres Target das Listing nicht mehr enthält.
- Auslösung an der letzten Session: `TRIGGERED_AT_LAST_SESSION_NOT_EXECUTED`; Terminal-Ereignis vor der Ausführung:
  `SUPERSEDED_POSITION_CLOSED_BEFORE_EXECUTION`.
- Nicht unterstützt (fail closed): SPINOFF und TERMINAL_EXCHANGE (Einheiten ohne Einstandspreis), unbekannte Schlüssel.
- Keine Annahmen über Intraday-Preise, Liquidität (nur die bestehende optionale Dollar-Volumen-Grenze) oder Dividenden-Zahltage
  über das hinaus, was die Engine bereits modelliert.

Ausgabe nur mit `exitRules`: `schemaVersion: research-portfolio-1.3.0`, `exitRules`, `exitLedger` (Regel, Auslöse-/Ausführungsdatum,
Kurse, Referenz, Einheiten, Zustand), `openExitBlocks`, Trades mit `reason`, zusätzliche `limitations`. Ohne `exitRules` ist
jede Ausgabe byte-identisch zu 1.2.0 einschließlich `schemaVersion` (nur `sourceHashes`/`generation`/`resultHash` folgen dem
Dateihash); belegt durch Golden-Hashes und einen JSON-Vergleich mit der main-Fassung auf allen Fixtures und zwei echten Läufen.

## Tests

```bash
node --test quant/tests/research-population.test.mjs quant/tests/backtest-metrics.test.mjs quant/tests/research-portfolio-exit-rules.test.mjs
RESEARCH_POPULATION_FULL=1 node --test --test-name-pattern="real data" quant/tests/research-population.test.mjs   # ~80 s, echte Frames
```
