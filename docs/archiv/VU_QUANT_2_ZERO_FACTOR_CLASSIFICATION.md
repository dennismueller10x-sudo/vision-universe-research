# Die Screening-Zeilen ohne einen einzigen Faktorwert — vollständig klassifiziert

**Stand 2026-09-26 (zweite Messung, nach M33) · Artefakt
`quant/data/providers/zero-factor-classification.json` (`zero-factor-classification-1.1.0`) ·
Erzeuger `scripts/quant/classify-zero-factor-rows.mjs`**

> **Nachtrag vom 26.09.2026, nach den internen Reparaturen.** Die erste Messung fand 795 Zeilen.
> Nach den Branchenvorlagen (`quant-v2.2.0`), dem korrigierten Versicherungstor und der reparierten
> Berichtsperiode sind es **786**; `SECTOR_TEMPLATE_MISSING` steht bei **0** statt bei 12. Die
> Klassentabellen weiter unten tragen die erste Messung, weil sie den Auftrag beantworten; die
> Kette und die neuen Größen stehen im Abschnitt **„Wo in der Kette die Zeile verloren geht"** am
> Ende. Keine dieser Bewegungen stammt aus einer fremden Quelle.

Auftrag: die rund 795 Zeilen mit `availableFactors: 0` je Titel bestimmen — ohne neue Datenquelle,
ohne Provider, ohne Pipeline-Änderung. Ziel ist zu verstehen, **wie viel des Gaps mit vorhandenen
Daten, besserem Mapping oder einer Methodikentscheidung lösbar wäre** und wie viel wirklich nur eine
fremde Quelle schließen könnte. **Keine Kaufentscheidung wird abgeleitet.**

## Woher die Antworten kommen

Diese Klassifikation **rechnet nichts nach**. Sie liest die Gründe, die der Materialisierungslauf
selbst je Titel, je Faktor und je Komponente gesetzt hat:

| Quelle | Was daraus gelesen wird |
|---|---|
| `quant/data/product/factor-evidence-v1/*.json.gz` | Zustand und Grund je Faktor, Zustand und Grund je Komponente, CIK, Balkenzahl, Marktkapitalisierung, Vergleichsgruppe, Fundamentalstand |
| `…/componentSpecs` (im selben Shard) | zu jeder Komponente ihr Fenster **und der konkrete Eingangsausdruck** |
| `quant/data/sec/consumer/CIK*.json` | welche SEC-Kennzahlreihen ein Emittent wirklich trägt, Quartalspunkte, Geschäftsjahre |
| `quant/data/sec/consumer_coverage.json` | der Deckungsbericht des SEC-Exports |
| `quant/data/universe/market-capability.json` | Vormerkungen (`fr`) |
| `quant/data/universe/search/sym/*.json` | Name, Wertpapierart, Flag `HAS_SEC` |

Die Gründe, die dabei vorkommen, sind die des Produzenten: `FUNDAMENTALS_UNAVAILABLE`,
`INPUT_NOT_MATERIALIZED`, `SECTOR_TEMPLATE_MISSING`, `BLOCKED_EXTERNAL`, `INSUFFICIENT_COMPONENTS`,
`INSUFFICIENT_WEIGHTED_COVERAGE`, `MANDATORY_COMPONENT_MISSING`.

## Das Ergebnis in einer Zahl

**TOTAL_ZERO_FACTOR_ROWS = 795** von 6.441 Screening-Zeilen.

### Primäre Klasse — eine Partition, jeder Titel genau einmal

| Klasse | Titel | Anteil |
|---|---:|---:|
| `SEC_NO_CIK` | **407** | 51,2 % |
| `NOT_APPLICABLE` | **189** | 23,8 % |
| `TRUE_NO_FUNDAMENTALS` | **78** | 9,8 % |
| `INSUFFICIENT_HISTORY` | **75** | 9,4 % |
| `SEC_CIK_BUT_NO_EXPORT` | **45** | 5,7 % |
| `RAW_FUNDAMENTALS_PRESENT` | **1** | 0,1 % |

### Merkmale — ausdrücklich überlappend, keine Partition

| Merkmal | Titel |
|---|---:|
| `RAW_FUNDAMENTALS_PRESENT` (Konsum-Export mit ≥ 1 Kennzahlreihe) | 175 |
| `PARTIAL_FUNDAMENTALS` (Export vorhanden, vom Faktorlauf nicht übernommen) | 129 |
| **`INSUFFICIENT_HISTORY` (< 252 Handelstage)** | **793** |
| `NOT_APPLICABLE` | 189 |
| `SEC_SOURCE_UNAVAILABLE` (zusammengefasst) | 459 |
| — davon `SEC_NO_CIK` | 407 |
| — davon `SEC_CIK_BUT_NO_EXPORT` | 52 |
| `MASTER_SEES_SEC_BUT_RUN_DOES_NOT` | 52 |
| `TRUE_NO_FUNDAMENTALS` | 161 |
| `EXTERNAL_PROVIDER_CANDIDATE` | 407 |

## Der Befund, der die Frage verschiebt

**793 der 795 Titel haben weniger als 252 Handelstage.** Die Verteilung:

| Handelstage | Titel |
|---|---:|
| 0–99 | 349 |
| 100–199 | 343 |
| 200–251 | 101 |
| 252–299 | 2 |
| 300 + | 0 |

Zwei der sieben kanonischen Faktoren — **Kursentwicklung und Schwankungsbreite** — hängen an
**keiner** Fundamentalzahl. Sie brauchen 252 beziehungsweise 273 Handelstage. Für 793 dieser Titel
wären sie also auch dann leer, wenn eine perfekte Fundamentalquelle morgen lieferte.

### Was eine perfekte Fundamentalquelle heute ändern würde

| Messung | Titel |
|---|---:|
| Preisfaktoren durch Historie blockiert | **793** |
| Preisfaktoren heute schon möglich | **2** |
| drei Geschäftsjahre vorhanden | 73 |
| ein oder zwei Geschäftsjahre | 101 |
| kein einziges Geschäftsjahr | 621 |
| vier Quartale in einer Reihe (TTM rechenbar) | 123 |
| weniger als vier Quartale | 52 |
| **beides heute möglich (Historie **und** drei Jahre)** | **1** |

Der einzige Titel, bei dem heute beides zusammenkommt, ist **KDK**: 252 Handelstage, 14 Kennzahlreihen, **fünf** Geschäftsjahre.

## `NOT_APPLICABLE` sind zwei verschiedene Lagen

| Lage | Titel | Branchenschlüssel |
|---|---:|---|
| **(a) keine operative Gesellschaft** | **177** | 6770 Blank Check / SPAC-Hülle (158), 6221 Warenbörse (12), 6199 Finanzvermittlung (7) |
| **(b) operatives Geschäft, Branchenvorlage fehlt** | **12** | 6798 REIT (5), 6021/6022 Banken (3), 6211 Broker (2), 6036 Sparinstitut (1), 6411 Versicherungsdienst (1) |

Bei (a) fehlt nichts — die Frage passt nicht: eine Übernahmehülle hat kein Geschäft, dessen Qualität
oder Wachstum man messen könnte.

Bei (b) ist es umgekehrt, und das ist der **aufschlussreichste Befund der ganzen Analyse**: neun der
zwölf tragen **drei oder mehr Geschäftsjahre**, vier davon **je zwölf Jahre**:

| Titel | SIC | Geschäftsjahre | Kennzahlreihen | Handelstage |
|---|---:|---:|---:|---:|
| ADAMO | 6798 REIT | 12 | 11 | 176 |
| ELLA | 6798 REIT | 12 | 6 | 120 |
| RWTQ | 6798 REIT | 12 | 9 | 209 |
| RWTS | 6798 REIT | 12 | 9 | 83 |
| WSBCO | 6021 Bank | 12 | 9 | 245 |
| NEWTO | 6021 Bank | 8 | 9 | 161 |
| AXG | 6211 Broker | 6 | 2 | 242 |
| CBK | 6022 Bank | 3 | 11 | 247 |
| LIFE | 6411 | 3 | 14 | 166 |

Diese Titel werden nicht wegen fehlender Daten zurückgehalten, sondern weil die Methodik für
Finanzwerte und REITs **keine Branchenvorlage** führt (`SECTOR_TEMPLATE_MISSING`). Das ist eine
Entscheidung im Haus — kein Anbieter würde daran etwas ändern.

## Je Faktor: was genau fehlt

Gezählt werden Titel der 795er-Kohorte. Der Ausdruck in Klammern ist der veröffentlichte
Eingangsausdruck der Komponente.

### quality — 771 `UNAVAILABLE`, 24 `NOT_APPLICABLE`
Gründe: `INPUT_NOT_MATERIALIZED` 617 · `INSUFFICIENT_COMPONENTS` 150 · `SECTOR_TEMPLATE_MISSING` 24 ·
`INSUFFICIENT_WEIGHTED_COVERAGE` 4

| Komponente | Titel | Gründe | Eingang |
|---|---:|---|---|
| `netDebtToAssets` | 793 | 458 keine Fundamentals · 311 Input fehlt · 24 Branchenvorlage | `(totalDebt-cash-shortTermInvestments)/totalAssets` |
| `positiveFcfYears` | 789 | 458 · 307 · 24 | `count(annualFreeCashFlow>0)` |
| `operatingMarginStability` | 789 | 458 · 307 · 24 | `medianAbsoluteDeviation(annualOperatingMargin)` |
| `accrualRatio` | 765 | 458 · 283 · 24 | `(netIncomeTTM-operatingCashFlowTTM)/averageTotalAssets` |
| `equityToAssets` | 641 | 458 · 159 · 24 | `stockholdersEquity/totalAssets` |

### growth — 795 `UNAVAILABLE`
Gründe: `INPUT_NOT_MATERIALIZED` 759 · `INSUFFICIENT_COMPONENTS` 31 · `INSUFFICIENT_WEIGHTED_COVERAGE` 5

| Komponente | Titel | Eingang |
|---|---:|---|
| `fcfCagr3y` | 794 | free cash flow CAGR; beide Endpunkte positiv |
| `revenueGrowthTtmYoy` | 791 | `current TTM revenue/prior-year TTM revenue-1` |
| `revenueCagr3y` | 789 | revenue CAGR |
| `epsCagr3y` | 789 | diluted EPS CAGR; beide Endpunkte positiv |
| `operatingMarginExpansion3y` | 789 | operating-margin percentage-point change |
| `revenueGrowthAcceleration` | 767 | YoY-Wachstum minus vorheriges YoY-Wachstum |

### momentum — 795 `UNAVAILABLE`, **ohne jede Fundamentalzahl**
Gründe: `INSUFFICIENT_COMPONENTS` 618 · `INSUFFICIENT_WEIGHTED_COVERAGE` 103 ·
`INPUT_NOT_MATERIALIZED` 74

| Komponente | Titel | Eingang |
|---|---:|---|
| `priceReturn12m1m` | **795** | split-adjusted price return T-252 bis T-21 |
| `relativeStrength12m1m` | **795** | 12-1-Rendite minus zertifizierte Marktbreite |
| `distanceTo52wHigh` | 793 | `(high252-close)/high252` |
| `distanceToSma200` | 692 | `(close-SMA200)/SMA200` |
| `priceReturn6m` | 458 | split-adjusted price return |
| `priceReturn3m` | 74 | split-adjusted price return |

### value — 771 `UNAVAILABLE`, 24 `NOT_APPLICABLE`
Alle fünf Komponenten fehlen bei **allen 795** (458 keine Fundamentals · 313 Input fehlt · 24
Branchenvorlage): `fcfYield`, `earningsYield`, `ebitdaYield`, `salesYield`, `bookToMarket`. Drei von
ihnen brauchen zusätzlich die **Marktkapitalisierung** oder den **Unternehmenswert**.

### profitability — 771 `UNAVAILABLE`, 24 `NOT_APPLICABLE`
`roicTtm` und `roicMedian3y` fehlen bei **allen 795**, `grossProfitabilityTtm` und `fcfMarginTtm` bei
792, `operatingMarginTtm` bei 789, `roaTtm` bei 755.

### revisions — 795 `UNAVAILABLE`, Grund `BLOCKED_EXTERNAL`
Die Methodik hält diesen Faktor für das **ganze Universum** geschlossen: es gibt keine lizenzierte
Point-in-Time-Quelle für Analystenschätzungen. Das gilt für alle 6.875 Titel, nicht nur für diese
Kohorte.

### risk — 795 `UNAVAILABLE`, **ohne jede Fundamentalzahl**
`realizedVolatility252d` fehlt bei **allen 795**, `maxDrawdown252d` bei 793,
`downsideVolatility252d` bei 789, `beta252d` bei 770 — durchweg `INPUT_NOT_MATERIALIZED`, also zu
wenig Kurshistorie.

## Lesart: wie viel ist wo lösbar

Das ist eine **Einordnung der Messung**, keine Empfehlung und keine Kaufentscheidung.

**Im Haus lösbar, ohne neue Quelle:**
- **12 Titel** warten auf eine **Branchenvorlage** für Banken, Sparinstitute, Broker, REITs und
  Versicherungsdienste — neun davon mit drei bis zwölf Geschäftsjahren fertiger Daten.
- **52 Titel** trägt der Company-Master als mit SEC-Material verbunden (`HAS_SEC`), während der
  Faktorlauf keinen nutzbaren Export findet — eine **Zuordnungsfrage**, kein Datenmangel.
- **129 Titel** haben einen Konsum-Export, den der Faktorlauf nicht als Fundamentalsatz übernommen
  hat. Gemessen sind es meist 4–5 Kennzahlreihen mit 8–16 Punkten, also ein oder zwei Quartale seit
  dem Börsengang: hier ist die Ursache wieder **Zeit**, nicht Zuordnung.

**Durch Zeit lösbar, ohne jedes Zutun:**
- **793 Titel** überschreiten die 252-Tage-Schwelle von selbst; 101 davon fehlen weniger als 52
  Handelstage. Damit öffnen sich Kursentwicklung und Schwankungsbreite — zwei der sieben Faktoren,
  für die keine Fundamentaldaten nötig sind.

**Strukturell nicht lösbar, weil die Frage nicht passt:**
- **177 Titel** sind Übernahmehüllen (SIC 6770), Warenbörsen oder Finanzvermittler ohne operatives
  Geschäft.

**Was allein eine fremde Quelle ändern könnte:**
- **407 Titel** haben kein zugeordnetes CIK, ihr Kürzel steht nicht in den SEC-Verzeichnissen. Für
  sie liegt heute **keine** Fundamentalquelle im Haus. Allerdings: **406** davon haben zugleich weniger
  als 252 Handelstage, also blieben ihre beiden Preisfaktoren auch mit gekauften Fundamentaldaten
  zunächst leer.
- **Der Revisions-Faktor** ist für das ganze Universum geschlossen und hängt an einer Lizenz.

**Die eine Zahl, die alles einordnet:** heute würden Historie **und** drei Geschäftsjahre bei
**einem** Titel dieser Kohorte zusammenkommen (KDK). Das Gap ist überwiegend ein **Zeit**-Gap, zum
kleineren Teil eine **Methodik**- und **Zuordnungs**frage, und erst danach eine Quellenfrage.

## Wiederholen

```
node scripts/quant/classify-zero-factor-rows.mjs
```

Liest nur veröffentlichte Dateien, ruft keinen Anbieter, schreibt genau ein Artefakt.

## Wo in der Kette die Zeile verloren geht

Zweite Messung, nach den internen Reparaturen, für alle 786 Nullzeilen nachvollzogen: Company
Master → Security/Issuer-Mapping → CIK → SEC Factbook → Consumer Export → Faktoreingang →
Faktorevidenz. Eine Partition wie die Klassentabelle, aber nach **Ort** statt nach Ursache.

| Stelle in der Kette | Titel | Anteil |
|---|---|---|
| `KEINE_SEC_VERBINDUNG` — kein CIK, und der Master sieht auch kein SEC-Material | 407 | 51,8 % |
| `ROHFAKTEN_OHNE_ZUORDNUNG` — Factbook hat geliefert, die Registry ordnete nichts zu | 161 | 20,5 % |
| `NOT_APPLICABLE` — Hülle oder Fonds, kein operatives Geschäft | 87 | 11,1 % |
| `HISTORIE_ZU_KURZ` | 78 | 9,9 % |
| `FACTBOOK_OHNE_CONSUMER_EXPORT` | 47 | 6,0 % |
| `CIK_OHNE_FACTBOOK` — der SEC bekannt, führt kein Factbook | 5 | 0,6 % |
| `FAKTOR_MINDESTANFORDERUNG` — alle Stufen lieferten | 1 | 0,1 % |
| `CONSUMER_EXPORT_NICHT_GEJOINT` | **0** | — |
| `IDENTIFIER_OHNE_CIK` — Master sieht SEC, kein Kürzel in den Verzeichnissen | **0** | — |

Die drei Nullen sind das Ergebnis, nicht die Abwesenheit eines Ergebnisses. Gesucht waren „echte
interne Mapping-/Join-Gaps": eine CIK, die im Verzeichnis steht und nicht am Datensatz; ein Export,
der das Kürzel nicht führt; ein falsch gezogenes Mapping. **Keiner dieser Fälle existiert.** Der
Export nennt zu jedem Emittenten die Kürzel, die er selbst führt, und bei keiner der 786 Zeilen
fehlt das eigene darunter.

### Die Lücke, die es wirklich gibt

**183 Emittenten im ganzen Universum — 161 davon Nullzeilen — tragen zusammen 43.953 rohe
SEC-Tatsachen und `mapped = 0`.** Die größten ungenutzten Bestände:

| Rohtatsachen | zugeordnet | Emittent |
|---|---|---|
| 1.125 | 0 | Phoenix Education Partners Inc |
| 930 | 0 | Elmet Group Co. |
| 853 | 0 | Exyn Technologies Inc |
| 717 | 0 | Bob's Discount Furniture Inc |
| 682 | 0 | Forbright Inc – Class A |
| 639 | 0 | York Space Systems Inc |
| 632 | 0 | Cerebras Systems Inc – Class A |
| 611 | 0 | BitGo Holdings Inc – Class A |
| 544 | 0 | Fervo Energy Co. – Class A |
| 531 | 0 | Generate Biomedicines Inc |
| 417 | 0 | Space Exploration Technologies Corp – Class A |

Die Verteilung über alle 5.069 Exporte ist zweigipfelig: **4.884** mit 20 und mehr zugeordneten
Kennzahlen, **183** mit genau null, **zwei** dazwischen. Ein solcher Sprung spricht gegen „ein paar
fehlende Tags" und für einen strukturellen Grund — etwa firmeneigene Konzepte oder Fakten ohne
Periodenrahmen bei Erstmeldern.

**Warum das hier endet.** Welche Konzepte diese Emittenten verwenden, steht in den rohen Fakten.
Die liegen nicht im Repository: `quant/data/sec/canonical` und `inspector` führen die fünf goldenen
Titel, und die 120 MB unter `consumer/` **sind** die SEC-Schicht dieses Hauses. Der Abruf von
`data.sec.gov` — dieselbe Quelle, die die bestehende Pipeline benutzt — ist durch die
Netzwerkpolitik dieser Umgebung gesperrt (CONNECT 403). Die Lücke ist damit exakt lokalisiert,
gezählt und benannt, aber von hier aus nicht behebbar. Sie ist **kein** Provider-Gap: die Daten
sind vorhanden und bezahlt.

### Zwei weitere Befunde derselben Prüfung

Von den 47 Titeln mit CIK und ohne Export hat der Export-Lauf für **25** einen eigenen Fehlschlag
notiert (`NO_PERIODIC_FACTS` — ein Factbook ohne eine einzige Periodentatsache, also ein Befund an
der Quelle). Für die anderen **22** gibt es weder einen Export noch einen Fehlschlagseintrag: der
Lauf hat sie stillschweigend übergangen. Das Artefakt führt beides getrennt als
`EXPORT_RUN_REPORTED_FAILURE` und `EXPORT_RUN_SILENTLY_SKIPPED`.

### Die neuen Größen im Artefakt

| Größe | Wert |
|---|---|
| `TOTAL_ZERO_FACTOR_ROWS` | 786 (erste Messung 795) |
| `FACTOR_CELLS_AVAILABLE` | 22.712 |
| `SECTOR_TEMPLATE_MISSING` | 0 |
| `INTERNAL_MAPPING_GAP` | 161 |
| `EXPORT_RUN_REPORTED_FAILURE` | 25 |
| `EXPORT_RUN_SILENTLY_SKIPPED` | 22 |
| `ZERO_FACTOR_ROWS_CLOSED_WITHOUT_NEW_PROVIDER` | 9 |
| `FACTOR_COVERAGE_GAIN` | +2.325 Faktorzellen |
| `EXTERNAL_PROVIDER_DECISION` | `DEFERRED` |

Der Vergleich gegen den vorigen Lauf wird nicht geschätzt: das Artefakt wird gelesen, **bevor** es
überschrieben wird, und trägt den vorigen Stand mit seinem Zeitstempel. Gibt es keinen vorigen
Lauf, steht dort `null` und nicht `0`.
