# VU MOCK DATA

Generator: `quant/engines/mock-generator.js` · Adapter: `quant/engines/mock-provider.js`
Praekomputation: `scripts/quant/build-quant-data.mjs` · Pruefung: `scripts/quant/verify-quant-data.mjs`

## Warum synthetisch statt echter Ticker

Reale Unternehmensnamen mit erfundenen Fundamentaldaten waeren die gefaehrlichste Form
von Mock-Daten: irgendwann haelt jemand einen Screenshot fuer eine echte Analyse.

Deshalb: IDs `VU0001` … `VU0500` und `VUF001` … `VUF011`, Namen nach dem Muster
`VU Mock Semis 0142`, `isMock: true` an jedem Record, und auf jeder Seite ein sichtbares
Demo-Banner.

## Determinismus

Alles entsteht aus einem festen Seed (`vision-universe-quant-v1`) ueber einen
Mulberry32-PRNG. Gleicher Seed → bitgleiche Daten in Browser und Node.

Das ist keine Bequemlichkeit, sondern Voraussetzung: ohne reproduzierbare Datenbasis
waere der `reproductionHash` eines Backtests wertlos.

## Umfang

| | |
|---|---|
| Securities | 500 synthetische + 11 Edge-Case-Fixtures = 511 |
| Zeitraum | 2006-01-02 bis 2026-09-04 (5.395 Handelstage, Wochentage ohne Feiertage) |
| Fundamentaldaten | quartalsweise, bitemporal, inkl. Revisionen |
| Corporate Actions | ~20.000 (Dividenden, Splits, Delistings, Uebernahmen) |
| Heute gelistet | 482 · historisch verschwunden 29 |

## Preismodell

```
Kurs_t = Startkurs × Ertragsanker_t × exp(Rerating_t + Abweichung_t + Momentum_t)
```

| Komponente | Rolle |
|---|---|
| **Ertragsanker** | taeglich interpolierte TTM-Ertragskraft aus den Fundamentaldaten; traegt die langfristige Rendite |
| **Abweichung** | Ornstein-Uhlenbeck-Prozess aus Marktfaktor (ueber Beta) und idiosynkratischem Schock; erzeugt Volatilitaet, Drawdowns und schwankende Bewertungsniveaus, kehrt ueber Jahre zurueck |
| **Rerating** | gedaempfte dauerhafte Bewertungsverschiebung aus dem Alpha des Archetyps, begrenzt auf ±55 % |
| **Momentum** | Rueckkopplung aus der 12-1-Monats-Rendite |

Zwei Entscheidungen, die beim Testen entstanden sind und ohne die das Modell
irrefuehrend gewesen waere:

**Der Kurs braucht einen Fundamentalanker.** Ein reiner Random Walk haette Kurs und
Ertragslage nach 20 Jahren vollstaendig entkoppelt — ein Titel haette bei einem KGV von
0,5 gehandelt und eine Dividendenrendite von 300 % ausgewiesen. Die Value- und
Quality-Faktoren haetten dann nicht Bewertung gemessen, sondern kumuliertes Rauschen.

**Das Modell braucht Momentum.** Eine reine Mean Reversion ist strukturell
*anti*-Momentum: genau die Titel, die zuletzt gestiegen sind, verlieren wieder. Eine
Momentum-Strategie haette darin nie funktionieren koennen — der Backtest haette nicht die
Strategie getestet, sondern eine Eigenschaft des Generators. Die Rueckkopplung bildet den
dokumentierten Befund (Jegadeesh/Titman) nach; die Umkehr uebernimmt weiterhin der
OU-Prozess.

Gemessen: das oberste Momentum-Quintil liegt in den folgenden zwoelf Monaten rund
12 Prozentpunkte vor dem untersten.

## Marktregime

Sieben modellierte Krisenfenster (Finanzkrise 2007–2009, Eurokrise 2011, Wachstumsangst
2015/16, Zinsangst 2018, Pandemie-Schock 2020, Zins- und Inflationsschock 2022,
Bewertungskorrektur 2025). Der gleichgewichtete Benchmark erreicht ~12 % CAGR bei rund
−54 % maximalem Drawdown — ein Datensatz mit echten Zyklen, nicht mit einer geraden Linie.

## Archetypen

Compounder 16 % · Steady 20 % · Cyclical 16 % · Hypergrowth 12 % · Defensive 12 % ·
Deep Value 12 % · Laggard 12 %.

Jeder Archetyp definiert Bandbreiten fuer Wachstum, Margen, Kapitalintensitaet,
Volatilitaet, Beta, Alpha, Verschuldung, Ausschuettungsquote, Bewertungspraemie und
langfristiges Wachstumsziel. Sektoren folgen einer an einem breiten US-Markt orientierten
Gewichtung, damit Peer Groups unterschiedlich gross sind und die Fallback-Kette
Industry → Sector → Universe realistisch getestet wird.

Aktienzahl und Startkurs werden aus der Ertragslage abgeleitet, nicht frei gewuerfelt.
Resultierende Querschnittsverteilung (p5 / p50 / p95): KGV 4 / 20 / 103 ·
ROIC −2 / 11 / 41 % · Umsatzwachstum −3 / 5 / 19 % · Volatilitaet 15 / 27 / 52 % ·
Marktkapitalisierung 0,4 / 23 / 3.100 Mrd. USD.

## Bitemporale Fundamentaldaten

Je Quartal: `periodEnd` → `reportedAt` (+30–48 Tage, je Titel verschieden) → `filedAt`
(+2 Tage) → `availableAt` (+1 Tag). 15 Kennzahlen je Periode.

## Edge-Case-Fixtures

| Fixture | Ticker | Zweck |
|---|---|---|
| `MOCK_HIGH_QUALITY` | VUF001 | obere Kante der Quality-Normalisierung |
| `MOCK_HIGH_MOMENTUM` | VUF002 | anhaltende Staerke nahe dem 52-Wochen-Hoch |
| `MOCK_HIGH_GROWTH` | VUF003 | extremes Wachstum bei duenner Marge — Growth ohne Quality |
| `MOCK_DEEP_VALUE` | VUF004 | sehr niedrige Bewertung bei intakter Cash-Erzeugung |
| `MOCK_VALUE_TRAP` | VUF005 | optisch guenstig, aber schrumpfend und mit negativem Momentum |
| `MOCK_LOW_VOL` | VUF006 | obere Kante des Risk-Faktors |
| `MOCK_MISSING_DATA` | VUF007 | fuenf fehlende Kennzahlen — muss INCOMPLETE bleiben |
| `MOCK_DELISTED` | VUF008 | 2019 delistet, bleibt im historischen Universum |
| `MOCK_RESTATEMENT` | VUF009 | Korrektur 2018 fuer Perioden aus 2017 |
| `MOCK_FUTURE_DATA_LEAK` | VUF010 | Datensatz mit `availableAt` 2027 — darf heute nirgends erscheinen |
| `MOCK_CORPORATE_ACTION` | VUF011 | 4:1-Split 2021 und Sonderdividende 2023 |

Jede Fixture ist Gegenstand mindestens eines Tests. Zusaetzlich verschwinden ~6 % der
regulaeren Titel historisch — Survivorship Bias wird als Normalfall getestet, nicht als
Sonderfall.

## Speicherform

Preisreihen liegen als `Float32Array` (~21 MB fuer 511 Titel ueber 20 Jahre).
Fundamentaldaten liegen kompakt je Quartal; die Expansion in kanonische
`FundamentalFact`-Objekte passiert im Adapter — genau die Grenze, an der auch ein echter
Vendor uebersetzen wuerde.

## Praekomputation

`node scripts/quant/build-quant-data.mjs` (~6 s) erzeugt `quant/data/`:

| Datei | Inhalt | Roh / gzip |
|---|---|---|
| `meta.json` | Snapshot, Versionen, Provider-Gesundheit, Fixtures | 3 KB |
| `securities.json` | alle Titel mit Kennzahlen, Scores, Perzentilen | 946 / ~175 KB |
| `dna/<shard>.json` | Factor DNA, 11 Shards | je ~240 / ~30 KB |
| `score-history.json` | 53 wochentliche Snapshots | 752 / ~186 KB |
| `radar.json`, `events.json`, `rankings.json` | Radar-Module, Events, Ranglisten | 264 KB |
| `strategies.json`, `field-catalog.json` | Bibliothek, Feldkatalog | 21 KB |

Jeder historische Snapshot wird mit dem Datenstand **seines** Stichtags berechnet.

`node scripts/quant/verify-quant-data.mjs` rechnet alle Scores nach und vergleicht sie mit
der ausgelieferten Datei. Es laeuft in der CI: eine stille Abweichung zwischen Uebersicht
und Backtest waere der gefaehrlichste Datenfehler des Systems.

## Bewusste Vereinfachungen

Keine Feiertage (nur Wochentage) · kein echter Intraday-Verlauf (die Eroeffnung ist eine
deterministische Interpolation) · ein Universum (`US_EQUITIES`) · eine Waehrung (USD) ·
keine Analystenschaetzungen, Makrodaten oder News.
