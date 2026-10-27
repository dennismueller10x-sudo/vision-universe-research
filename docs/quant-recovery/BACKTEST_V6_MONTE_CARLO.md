# V6 Monte Carlo: bedingte, reproduzierbare Szenariosimulation

Implementierung: `quant/engines/research-monte-carlo.cjs`, Vertrag
`research-monte-carlo-1.0.0`. Offline-Research, keine UI, kein öffentlicher
Transport, kein Scheduler und keine Produktfreigabe.

## Fachlicher Umfang

`runMonteCarlo(input)` unterstützt zwei ausdrücklich verschiedene Modelle:

| Modell | Zulässige Beobachtungseinheit | Annahme / Grenze |
|---|---|---|
| `TRADE_IID` | Deklarierte, nicht überlappende finanzierte Trades | Trade-Renditen werden unabhängig mit Zurücklegen gezogen. Kalenderdauer, Leerlauf, Marktregime und zeitliche Trade-Abhängigkeit werden nicht simuliert. Dieses Modell eignet sich nicht zur Umdeutung überlappender marktweiter Ereignisse in ein finanziertes Portfolio. |
| `CIRCULAR_BLOCK` | Deklarierte regelmäßige Netto-Periodenrenditen eines Portfolios | Zufällige Blockanfänge mit Zurücklegen; innerhalb des Blocks bleibt die zeitliche Reihenfolge erhalten, am Quellenende wird umgebrochen. Blocklänge ist vorab festzulegen; die Wrap-Annahme und eine zu kurze Historie bleiben Modellgrenzen. |

Die Engine erzeugt synthetische Sequenzen und alternative Kapitalpfade.
Beobachtete Quelldaten und simulierte Pfade bleiben getrennt. Es gibt keine
synthetischen historischen Datumsangaben, keine CAGR aus Tradeanzahl und keine
Behauptung einer Zukunftsprognose. Monte Carlo behebt weder fehlende Delistings
noch ein ungeeignetes Universum, Corporate-Action-Fehler oder fehlende PIT-Daten.

Eine Eingabedeklaration beweist nicht die Richtigkeit ihrer Quelldaten.
`dataEligibility` und `independentEvidence` bleiben deshalb
`NOT_ESTABLISHED_BY_SIMULATION`. `certification=NOT_CERTIFIED` und
`productionApproved=false` werden unverändert ausgegeben. Der aufrufende
Research-Vertrag muss die tatsächliche Datenzulässigkeit separat nachweisen.

## Eingabevertrag

```js
const { runMonteCarlo } = require('./quant/engines/research-monte-carlo.cjs');
const result = runMonteCarlo({
  model: 'CIRCULAR_BLOCK', seed: 12345, simulations: 10000,
  horizon: 52, initialCapital: 100000, blockLength: 13, retainPaths: 3,
  observations: observedNetWeeklyReturns, // [{date:'YYYY-MM-DD', return: Dezimalquote}]
  returnBasis: 'PRICE_RETURN',
  costs: {basis: 'ALREADY_NET', modelVersion: 'actual-source-cost-model'},
  provenance: {
    sourceKind: 'HISTORICAL_OBSERVED', sourceHash: actualSourceHash,
    sourceVersion: actualSourceVersion, samplingUnit: 'REGULAR_PERIOD',
    scope: 'konkret benannter historischer Listing-/Portfolio-Scope'
  }
});
```

`sourceKind` ist `HISTORICAL_OBSERVED` oder ausdrücklich `SYNTHETIC_TEST`.
Testfixtures sind keine historischen Ergebnisse. `sourceHash` ist ein externer
Herkunftsverweis, keine von der Engine verifizierte Quellendatei oder Freigabe.
Der tatsächliche `inputHash` wird intern aus allen übergebenen Beobachtungen und
Konfigurationsfeldern berechnet. Ein vom Aufrufer gelieferter `inputHash`,
Zertifizierungsstatus oder ein unbekanntes Eingabefeld wird abgewiesen.

Mindestens zwei datierte Beobachtungen, strikt steigende eindeutige Daten und
endliche Renditen ab −100 % sind erforderlich. Das ist eine technische
Eingabebedingung, keine hinreichende methodische Mindeststichprobe. Fehlende
Renditen, ungeklärte Returnbasis, unzulässige Kosten und uneindeutige Reihenfolge
werden zurückgewiesen. Regelmäßigkeit, Unabhängigkeit, Instrumentidentität,
Survivorship, Vollständigkeit und Returnvalidität brauchen externe Belege.

## Kosten und Kapitalrechnung

`ALREADY_NET` übernimmt die tatsächlichen Nettoausgänge unverändert; zusätzliche
Gebührenfelder sind verboten. Das Blockmodell akzeptiert ausschließlich diese
Variante: Eine wöchentliche Portfoliorendite darf nicht nochmals mit pauschalen
Trade-Roundtrip-Kosten belastet werden.

Für `TRADE_IID` kann `PER_SIDE_NOTIONAL` Brutto-Trade-Renditen in Nettoausgänge
umrechnen. Mit `c=(feeBps+slippageBps)/10000` und Bruttorendite `r` gilt:

`Kapital_nachher = Kapital_vorher / (1+c) * (1+r) * (1-c)`.

Kaufkosten werden auf das finanzierbare Kaufnotional, Verkaufskosten auf das
tatsächliche Verkaufsnotional gerechnet. Keine Zwischenrundung. Dieses Modell
ist eine explizite Annahme; historische Spread-/Impact- oder Brokerkosten sind
damit nicht bewiesen. Es gibt keine doppelte Slippage und keine implizite
Cashverzinsung. Offene Positionen ohne abgeschlossenen Trade-Outcome gehören
nicht in den Trade-Resampling-Input.

## Ergebnisse und Unsicherheit

Für Endkapital, kumulative Rendite, maximalen Drawdown und längste Folge
negativer gezogener Renditeeinheiten werden Mittelwert, beobachtetes Minimum,
Maximum und konfigurierbare Perzentile ausgegeben. Drawdown ist eine negative
Dezimalquote und wird ausschließlich an Simulationsschritten gemessen.
`longestLossStreak` zählt gezogene negative Renditeeinheiten; es ist keine
Kalenderdauer. Bei vollständigem Kapitalverlust bleibt das Kapital null.

Begrenzte Beispielpfade enthalten Equity und Quellindizes; die vollständigen
Ergebnisse aller Pfade werden nicht unbegrenzt im Speicher gehalten.

`CONDITIONAL_MONTE_CARLO_DKW` quantifiziert ausschließlich die endliche
Simulationsstichprobe unter dem fixierten empirischen Modell. Pro Kennzahl gilt
ein simultanes CDF-Band über alle Quantile mit `alpha=0.05` und
`epsilon=sqrt(log(2/alpha)/(2*simulations))`, höchstens 1. Die invertierten
Quantilgrenzen verwenden den empirischen generalisierten Inversen. Sobald
`p-epsilon<=0` oder `p+epsilon>=1`, ist die betreffende Grenze `null` und
ausdrücklich `UNBOUNDED`; Stichprobenextrema werden nicht als garantierte
Verteilungsschranken ausgegeben. Punktperzentile verwenden lineare Interpolation.

Das Band ist kein Konfidenzintervall für tatsächliche zukünftige Anlageergebnisse
und keine gemeinsame 95%-Aussage über sämtliche verschiedenen Risikokennzahlen.
Es schließt Unsicherheit aus Daten, Parametern, Regimewechseln, Auswahlverzerrung
und Modellfehlern nicht ein. Mehr Simulationen erzeugen keine neuen unabhängigen
historischen Beobachtungen. Eine hohe Simulationsanzahl ersetzt keine
angemessene Quellstichprobe oder vorher begründete Blocklänge.

## Determinismus und Budgets

PRNG: dokumentiertes `xorshift32` mit nichtnull uint32-Seed (1–4294967295).
Indexauswahl verwendet Rejection-Sampling auf dessen tatsächlicher nichtnull
32-Bit-Ausgabemenge und vermeidet Modulo-Bias. Keine Systemzufallsquelle,
Zeitstempel oder Lastmessung beeinflusst das Ergebnis.

`inputHash`, `generationHash` und `resultHash` sind SHA256 über kanonische
JSON-Inhalte; der Codehash bezieht sich auf die tatsächlich geladene Moduldatei.
Die numerische Runtime umfasst Node, V8, Betriebssystem, Architektur, glibc und
SHA256 der Node-Binärdatei. Identische Eingaben unter identischem Code und
aufgezeichneter Runtime liefern identische Ergebnisse und Hashes. Andere
Runtimes erhalten andere Generationsmetadaten; finanzielle Kennzahlen werden
nicht passend gerundet. Bestehende Store-/Rollback-Verträge werden nicht ersetzt.

Harte Schutzbudgets, vor der Simulation geprüft:

| Ressource | Grenze |
|---|---:|
| Quellbeobachtungen | 100.000 |
| Simulationen | 100.000 |
| Schritte je Simulation | 20.000 |
| Simulationen × Schritte | 20.000.000 |
| Aufbewahrte Equitypunkte | 100.000 |
| Angeforderte Quantile | 101 |

Sortierung benötigt zusätzlich O(S log S) Arbeit für S Simulationen je Kennzahl;
die Speicherung ist O(N+S+aufbewahrte Punkte), nicht O(S×Horizont).
Nichtendliche Kapitalpfade werden abgewiesen. Das Modul verspricht keine feste
Wandzeit auf beliebiger Hardware; konkrete Laufzeit-/RSS-Nachweise gehören in
den maschinenlesbaren Validierungslauf.

## Nachrechnung und Prüfungen

`quant/tests/research-monte-carlo.test.mjs` prüft deterministische Wiederholung,
analytische Null-/Verlust-/Ruinpfade, finanzierte Kosten, Blocknachbarschaft und
Wrap, Modelltrennung, Seed-Vektoren und Frequenzen, eine exakte Zweipunkt-
Verteilung, Verkleinerung numerischer MC-Unsicherheit sowie ungültige Eingaben,
Budgets und Hashinvalidierung. Keine Testfixture wird als Realhistorie ausgegeben.

`scripts/quant/verify-research-monte-carlo.py` rechnet PRNG, Indexauswahl,
Kapitalpfade, Drawdowns, Verlustserien und sämtliche Verteilungsstatistiken
unabhängig mit Python-Standardbibliothek nach; Quellindizes müssen exakt passen,
Finanzwerte mit vorab festgelegter relativer/absoluter Toleranz 1e-12.
Beschädigte Statistiken und manipulierte Seedpfade werden in Negativtests erkannt.

```bash
node --test quant/tests/research-monte-carlo.test.mjs
python3 scripts/quant/verify-research-monte-carlo.py input.json result.json
```

Die Python-Nachrechnung ist ein unabhängiger mechanischer Nachweis. Sie ist kein
neuer unabhängiger historischer Holdout und kein Nachweis eines wirtschaftlichen
Vorteils. Fachliche Freigabe der empirischen Verteilung, der Trade-IID-Annahme
oder der Blocklänge bleibt studienspezifisch.

Lokaler Ressourcenlauf auf Node v22.23.4 / Linux x64: 10.000 Blocksimulationen
mit je 1.000 Schritten, 500 synthetischen Quellbeobachtungen, Blocklänge 13 und
drei aufbewahrten Pfaden ergaben 10.000.000 Schritte in 2.921,97 ms bei
175.656.960 Bytes Prozess-Peak-RSS. Die für diesen einzelnen Prüflauf gesetzten
Grenzen von 10 Sekunden und 256 MiB wurden eingehalten. Dieser Befund ist ein
Hardware-/Last-abhängiger technischer Messwert, kein Performanceversprechen.
Das maschinenlesbare Ressourcenprotokoll wird im gemeinsamen V6-Nachweis
referenziert. Auch dieser gesamte Lauf mit 10.000.000 Schritten wurde mit der
unabhängigen Python-Referenz nachgerechnet: sämtliche Verteilungsstatistiken,
aufbewahrten Pfade und bedingten Unsicherheitsbänder bestanden bei 1e-12 Toleranz.
Die eigenen 21 Tests bestanden auf derselben Node-Version;
vollständige Integrations-/Regressionszahlen stehen im V6-Validierungsbericht.
