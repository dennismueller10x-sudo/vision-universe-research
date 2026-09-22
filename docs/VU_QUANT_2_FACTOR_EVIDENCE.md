# Vision Universe® Quant 2.0 — Factor Evidence & Change Engine

Methodik-Identität: `vu-factor-evidence-1.0.0`, abgeleitet aus `quant-v2.0.0`
Change-Methodik: `vu-change-1.0.0`
Artefakt: `quant/data/product/factor-evidence-v1/` (637 Shards + `summary.json`)
Stand der hier dokumentierten Messung: Datenstichtag `2026-09-18`

## 0. Warum eine eigene Methodik-Version

Quant V2 ist festgelegt, aber nicht veröffentlichungsfähig: `publication.allowed = false`,
`fullScoreRequiresEveryFactor = true`, und der Faktor Revisions ist ohne lizenzierte
PIT-Konsensquelle extern blockiert. Ein Produkt, das darauf wartet, zeigt jahrelang nichts.

Diese Ebene löst das, ohne das Gate zu brechen:

- Sie berechnet **je Faktor** Evidenz und Position nach den Definitionen aus `quant-v2.json`.
- Sie veröffentlicht **keinen Composite Score und keinen Rang**. `composite.state = WITHHELD`.
- Sie verteilt **kein Gewicht** eines fehlenden Faktors auf einen anderen.
- Sie ist **eigenständig versioniert**, damit eine spätere Quant-V2-Aktivierung eine neue
  Entscheidung ist und keine stille Umdeutung des hier Veröffentlichten.

Das Publikations-Gate ist kein Kommentar, sondern eine Prüfung: `publicationViolations()`
läuft beim Schreiben jedes Datensatzes und beim Lesen im Browser. Ein Datensatz mit
`quantScore`, `rank` oder einem Wert an einem geschlossenen Faktor wird nicht ausgeliefert
und nicht gerendert.

## 1. Quellen — ausschließlich vorhandene Artefakte

| Quelle | Pfad | Was daraus kommt |
|---|---|---|
| Kursfaktoren | `quant/data/market/factors/factors-FULL_UNIVERSE.json` | Renditen, relative Stärke, Volatilität, Drawdown, Volumen, Abstände zu SMA und 52-Wochen-Hoch — 6.404 Titel, Engine `market-factors-1.0.0` |
| Geschäftszahlen | `quant/data/sec/consumer/CIK*.json` | Jahres-, Quartals- und TTM-Werte mit Meldedatum, Schema `vu-consumer-fundamentals-1.0.0` — 4.721 gelesene Emittenten |
| Kursstand | `quant/data/product/technical-signals-v1/<shard>.json.gz` | Letzter veröffentlichter Schlusskurs und die 270-Tage-Reihe — 5.676 Titel |
| Vergleichsgruppen | `quant/data/product/sic-peer-taxonomy-v1.json` | `sic4_industry`, `sic_division`, Identitätskette Ticker → securityId → CIK — 5.355 Zeilen |
| Vertrag | `quant/methodology/quant-v2.json` | Komponenten, Gewichte, Fenster, Mindestanforderungen |

Keine Provider-Anfrage, kein R2-Schreibvorgang, keine zweite Pipeline. Der Materializer
(`scripts/quant/build-factor-evidence.mjs`) liest, rechnet und schreibt ein Consumer-Artefakt.
Die fundamentale Rechnung selbst steht in `quant/engines/fundamental-inputs.js`, damit eine
Formel, die über das Öffnen eines Faktors entscheidet, für sich testbar bleibt.

## 2. Verarbeitungskette

```
kanonische Identität
  → PIT-Auswahl (Meldedatum ≤ Stichtag)
  → Perioden-Ausrichtung (Bilanzstichtag ≤ 400 Tage vom Berichtszeitraum)
  → Gültigkeitsprüfung, legitime negative Werte bleiben negativ
  → Winsorisierung 2./98. Perzentil, getrennt für Peer und Universum
  → deterministische Midrank-Perzentile (Gleichstand teilt den Rang)
  → Peer-Blend 70 % Vergleichsgruppe / 30 % Universum
  → Faktorwert = Σ(Gewicht × Komponentenwert) / Σ(verfügbares Gewicht)
  → Mindestanzahl, Mindestgewicht, Pflichtkomponenten
  → Confidence
```

Die Vergleichsgruppe wird pro Kennzahl aufgelöst, nicht pro Population:
`sic4_industry` ab 20 gültigen Emittenten **für diese Kennzahl**, sonst `sic_division` ab 40,
sonst `universe` ab 200 — mit dokumentiertem Confidence-Abschlag.

## 3. Die sieben Faktoren — gemessener Stand

| Faktor | Gewicht in V2 | AVAILABLE | UNAVAILABLE | NOT_APPLICABLE | Status |
|---|---:|---:|---:|---:|---|
| Quality | 10 % | 2.732 | 2.705 | 967 | breit verfügbar |
| Growth | 15 % | 3.188 | 3.216 | 0 | breit verfügbar |
| Momentum | 25 % | 5.582 | 822 | 0 | breit verfügbar |
| Value | 15 % | 1.999 | 3.438 | 967 | breit verfügbar |
| Profitability | 15 % | 1.154 | 4.283 | 967 | breit verfügbar |
| Revisions | 15 % | 0 | 6.404 | 0 | **geschlossen** — Gate `PIT_ANALYST_CONSENSUS` |
| Risk | 5 % | 5.303 | 1.101 | 0 | breit verfügbar |

Sechs der sieben Faktoren sind breit verfügbar. Nur der Erwartungstrend ist vollständig
geschlossen, und zwar aus einem Grund, den keine Codeänderung auflöst.

Veröffentlichte Titel: 6.404 von 6.875 des kanonischen Produktuniversums.
Nicht veröffentlicht: 471 ohne zertifizierte Kursfaktor-Zeile (369 `SOURCE_MISSING`, 102 `FAIL`).

### 3.1 Quality — „Wie solide ist das Unternehmen aufgestellt?“

| Komponente | Gewicht | Eingabe | Fenster | Richtung | Stand |
|---|---:|---|---|---|---|
| `accrualRatio` | 25 % | (Nettogewinn TTM − operativer Cashflow TTM) / ⌀ Bilanzsumme | TTM | niedriger | verfügbar |
| `netDebtToAssets` | 20 % | Nettoverschuldung / Bilanzsumme | letzter Abschluss | niedriger | dünn — Gate `NET_DEBT_PERIOD_ALIGNMENT` |
| `equityToAssets` | 15 % | Eigenkapital / Bilanzsumme | letzter Abschluss | höher | verfügbar |
| `positiveFcfYears` | 20 % | Anzahl Jahre mit positivem Free Cashflow | 5 Geschäftsjahre | höher | verfügbar, nicht winsorisiert (Zählwert) |
| `operatingMarginStability` | 20 % | mittlere absolute Abweichung der operativen Marge vom eigenen Median | bis 5 Geschäftsjahre, ab 4 | niedriger | verfügbar |

Pflicht: eine aus `accrualRatio`/`positiveFcfYears` **und** eine Bilanzkomponente.
Mindestens 3 Komponenten, mindestens 60 % Originalgewicht.
Branchenbehandlung: Für Banken (SIC 6020–6220), Versicherer (6300–6411) und REITs (6798)
ist die allgemeine Formel `NOT_APPLICABLE`, bis eigene versionierte Vorlagen existieren.
Interpretation: höher = belastbarere Bilanz und Rechnungslegung. Keine Empfehlung.

### 3.2 Growth — „Wächst das Geschäft, und wird es schneller oder langsamer?“

| Komponente | Gewicht | Eingabe | Fenster | Richtung | Stand |
|---|---:|---|---|---|---|
| `revenueCagr3y` | 30 % | Umsatz-CAGR | 3 Geschäftsjahre | höher | verfügbar |
| `epsCagr3y` | 20 % | verwässertes EPS-CAGR, beide Endpunkte positiv | 3 Geschäftsjahre | höher | verfügbar |
| `fcfCagr3y` | 15 % | Free-Cashflow-CAGR, beide Endpunkte positiv | 3 Geschäftsjahre | höher | verfügbar |
| `revenueGrowthTtmYoy` | 15 % | TTM-Umsatz / Vorjahres-TTM − 1, aus acht Einzelquartalen | 1 Jahr | höher | verfügbar |
| `operatingMarginExpansion3y` | 10 % | Veränderung der operativen Marge in Prozentpunkten | 3 Geschäftsjahre | höher | verfügbar |
| `revenueGrowthAcceleration` | 10 % | aktuelles YoY-Wachstum − vorheriges YoY-Wachstum | zwei YoY-Intervalle | höher | verfügbar |

Pflicht: `revenueCagr3y` **oder** `revenueGrowthTtmYoy`.
Ein CAGR über einen Vorzeichenwechsel ist `null`, nie `0`.
Growth ist der einzige Fundamentalfaktor ohne Branchenausschluss: Wachstum ist auch bei
Banken, Versicherern und REITs nach derselben Formel definiert.

### 3.3 Momentum — „Wie hat sich der Kurs gegenüber dem Markt entwickelt?“

| Komponente | Gewicht | Eingabe | Fenster | Richtung | Stand |
|---|---:|---|---|---|---|
| `totalReturn12m1m` | 30 % | Gesamtrendite T−252 bis T−21 | 252/21 Sitzungen | höher | verfügbar, **Pflicht** |
| `totalReturn6m` | 20 % | Gesamtrendite | 126 Sitzungen | höher | verfügbar |
| `totalReturn3m` | 10 % | Gesamtrendite | 63 Sitzungen | höher | verfügbar |
| `relativeStrength12m1m` | 20 % | Titel 12-1 minus Vergleichsindex 12-1 | 252/21 Sitzungen | höher | in `market-factors-1.0.0` implementiert, erscheint mit dem nächsten Marktdaten-Lauf |
| `distanceTo52wHigh` | 10 % | (Hoch₂₅₂ − Kurs) / Hoch₂₅₂ | 252 Sitzungen | niedriger | verfügbar |
| `distanceToSma200` | 10 % | (Kurs − SMA200) / SMA200 | 200 Sitzungen | höher | verfügbar |

Zur relativen Stärke: Das ausgelieferte Kursfaktor-Artefakt führt sie bisher nur über volle
12 Monate, die Methodik verlangt das 12-1-Fenster. Das Fenster zu tauschen wäre eine stille
Ersetzung; stattdessen rechnet `market-factors-1.0.0` die Größe jetzt selbst, und die Komponente
öffnet sich mit dem nächsten Marktdaten-Lauf. Bis dahin beträgt das verfügbare Gewicht 80 %,
über dem Minimum von 60 %.
Kursbasis: `adjustedClose`, in der Semantikleiter `TOTAL_RETURN`, ausgewiesen als solche.

### 3.4 Value — „Was bezahle ich für das, was das Unternehmen verdient?“

| Komponente | Gewicht | Eingabe | Richtung | Stand |
|---|---:|---|---|---|
| `fcfYield` | 30 % | Free Cashflow TTM / Börsenwert | höher | verfügbar |
| `earningsYield` | 25 % | Nettogewinn TTM / Börsenwert | höher | verfügbar |
| `ebitdaYield` | 20 % | EBITDA TTM / Unternehmenswert | höher | verdrahtet, wartet auf den nächsten SEC-Lauf |
| `salesYield` | 10 % | Umsatz TTM / Unternehmenswert | höher | dünn — Gate `NET_DEBT_PERIOD_ALIGNMENT` |
| `bookToMarket` | 15 % | Eigenkapital / Börsenwert | höher | verfügbar |

Der Börsenwert entsteht aus der veröffentlichten Aktienzahl des letzten Abschlusses und dem
letzten veröffentlichten Schlusskurs: 3.921 Titel. Negative Gewinn- und Cashflow-Renditen sind
gültige ungünstige Werte und werden nicht abgeschnitten. Branchenausschluss wie bei Quality.

### 3.5 Profitability — „Wie viel bleibt vom Geschäft übrig?“

| Komponente | Gewicht | Eingabe | Richtung | Stand |
|---|---:|---|---|---|
| `roicTtm` | 25 % | operatives Ergebnis nach Steuern / (Schulden + Eigenkapital − Kasse) | höher | verdrahtet, wartet auf den nächsten SEC-Lauf |
| `roicMedian3y` | 15 % | Median der jährlichen ROIC | höher | verdrahtet, wartet auf den nächsten SEC-Lauf |
| `grossProfitabilityTtm` | 20 % | Rohertrag TTM / ⌀ Bilanzsumme | höher | verfügbar |
| `operatingMarginTtm` | 15 % | operatives Ergebnis TTM / Umsatz TTM | höher | verfügbar |
| `fcfMarginTtm` | 15 % | Free Cashflow TTM / Umsatz TTM | höher | verfügbar |
| `roaTtm` | 10 % | Nettogewinn TTM / ⌀ Bilanzsumme | höher | verfügbar |

Verfügbares Gewicht derzeit 60 %, genau auf dem Minimum: der Faktor öffnet sich, sobald alle
vier vorhandenen Komponenten für einen Titel messbar sind, und fällt sonst geschlossen.

Der Steuersatz im ROIC ist der **gemeldete effektive Satz** des Emittenten
(Steueraufwand / Vorsteuerergebnis), nicht ein unterstellter. Ein Verlustjahr, eine
Steuererstattung oder ein Satz über 100 % sind reale Befunde und machen den kanonischen
Nachsteuerwert undefiniert statt ungefähr: der Wert bleibt dann leer. Das eingesetzte Kapital
ist Schulden plus Eigenkapital minus Kasse; ein negatives eingesetztes Kapital ergibt keine
sinnvolle Rendite und liefert ebenfalls keinen Wert.

Branchenausschluss wie bei Quality.

### 3.6 Revisions — extern blockiert

Ohne lizenzierte, unveränderliche PIT-Konsens-Snapshots ist der gesamte Faktor
`UNAVAILABLE / BLOCKED_EXTERNAL` — für alle 6.404 Titel, ohne Ausnahme und ohne Proxy.
SEC-Restatements sind ausdrücklich nicht dieser Faktor.

### 3.7 Risk — „Wie stark hat der Kurs bisher geschwankt?“

| Komponente | Gewicht | Eingabe | Fenster | Richtung | Stand |
|---|---:|---|---|---|---|
| `realizedVolatility252d` | 35 % | annualisierte Volatilität der Tages-Logrenditen | 252 Sitzungen | niedriger | verfügbar, **Pflicht** |
| `downsideVolatility252d` | 25 % | annualisierte Halbabweichung der negativen Tages-Logrenditen | 252 Sitzungen | niedriger | in `market-factors-1.0.0`, mit Übergangs-Ableitung |
| `maxDrawdown252d` | 25 % | größter Spitze-zu-Tal-Rückgang, als Betrag | 252 Sitzungen | niedriger | verfügbar |
| `beta252d` | 15 % | Kovarianz zum Vergleichsindex / Indexvarianz | 252 Sitzungen | niedriger | in `market-factors-1.0.0` implementiert, erscheint mit dem nächsten Marktdaten-Lauf |

`downsideVolatility252d` und `beta252d` rechnet inzwischen `market-factors-1.0.0` selbst, an
derselben Stelle wie `volatility252d` und die relative Stärke, auf derselben Reihe und derselben
Log-Rendite- und √252-Konvention, jeweils erst ab 240 gültigen Renditen. Beta paart Titel und
Vergleichsindex **über die Handelstage**: ein Tag ohne Gegenstück fällt heraus, statt die Reihe
zu verschieben — positionsweises Zippen würde bei jedem Feiertag jede weitere Rendite gegen den
falschen Tag rechnen. Solange das ausgelieferte Artefakt die beiden Felder noch nicht führt,
leitet der Materializer `downsideVolatility252d` aus der veröffentlichten 270-Tage-Reihe ab und
weist dafür die Kursbasis `SPLIT_ADJUSTED` je Komponente aus; `beta252d` bleibt bis dahin leer,
weil die Tagesreihe des Vergleichsindex nicht mit veröffentlicht wird.
Höher bedeutet **geringeres** beobachtetes Risiko. Vergangene Schwankungen sind keine
Verlustprognose.

## 4. Confidence

`0,50 × Coverage + 0,20 × Freshness + 0,15 × Peer-Qualität + 0,10 × Historientiefe + 0,05 × Provenienz`,
Bänder 90 / 75 / 60 wie in `quant-v2.json`. Peer-Qualität: 100 für `sic4_industry`,
75 für `sic_division`, 45 für `universe` — der von der Methodik geforderte Abschlag bei
Universums-Fallback. Confidence ist **keine Erfolgswahrscheinlichkeit** und wird im Produkt
auch so benannt.

## 5. Change Engine — `vu-change-1.0.0`

Elf Positionen je Titel, jede mit Bedeutung, Richtung, Von-/Nach-Wert und Fenster:

| Position | Vergleich | Quelle |
|---|---|---|
| Kurstempo | letzter Monat gegen Dreimonats-Monatstempo | Kursfaktoren |
| Stärke gegenüber dem Markt | Monatsvorsprung gegen Sechsmonats-Monatsvorsprung | Kursfaktoren |
| Schwankungsbreite | 20 Tage gegen 252 Tage | Kursfaktoren |
| Handelsvolumen | 20 Tage gegen 60 Tage | Kursfaktoren |
| Trendstruktur | Lage zu 20/50/100/200-Tage-Linie | Kursfaktoren |
| Nähe zum Jahreshoch | Abstand zum 52-Wochen-Hoch | Kursfaktoren |
| Umsatztempo | YoY-Wachstum gegen Vorjahres-YoY | Geschäftsjahre |
| Bruttomarge | TTM gegen Vorjahres-TTM | acht Einzelquartale |
| Free-Cashflow-Marge | TTM gegen Vorjahres-TTM | acht Einzelquartale |
| Erwartungstrend | — | `BLOCKED_EXTERNAL` |
| Verlauf der Faktorwerte | — | `FACTOR_SNAPSHOT_HISTORY_NOT_MATERIALIZED` |

**Die harte Regel:** Veränderung wird an Eingaben gemessen, nie an Scores. Ein Satz wie
„Momentum stieg in sechs Wochen von 68 auf 82“ braucht eine geordnete Historie
veröffentlichter Faktor-Snapshots. Diese Historie beginnt mit dieser Methodik und wird nicht
rückwirkend aus heutigen Daten rekonstruiert — das wäre Look-ahead unter anderem Namen.

Die Schwellen, ab denen eine Veränderung als Verbesserung oder Verschlechterung bezeichnet
wird, stehen versioniert in `quant/engines/change-engine.js` (`THRESHOLDS`) und gelten für jeden
Titel gleich. Sie sind Beschriftungsregeln, keine Einstiegsregeln, und tragen keine
Backtest-Behauptung.

## 6. Offene Eingabe-Gates

Jedes Gate benennt genau eine fehlende Eingabe, was sie blockiert und wer sie besitzt.
Sie stehen maschinenlesbar in `summary.json` unter `openInputGates`:

| Gate | Blockiert | Eigentümer |
|---|---|---|
| `CONSUMER_EXPORT_MATERIALIZATION` | `value.ebitdaYield`, `profitability.roicTtm`, `profitability.roicMedian3y` | `scripts/quant/sec/consumer.py` — erweitert, wartet auf den nächsten SEC-Lauf |
| `BETA_252D` | `risk.beta252d` | `market-factors-1.0.0` — implementiert, wartet auf den nächsten Marktdaten-Lauf |
| `RELATIVE_STRENGTH_12M1M_MATERIALIZATION` | `momentum.relativeStrength12m1m` | `market-factors-1.0.0` — implementiert, wartet auf den nächsten Marktdaten-Lauf |
| `NET_DEBT_PERIOD_ALIGNMENT` | `quality.netDebtToAssets`, `value.salesYield` | SEC-Normalisierung |
| `PIT_ANALYST_CONSENSUS` | `revisions.*` | externe Lizenz |
| `INDUSTRY_TEMPLATES_BANKS_INSURERS_REITS` | `quality.*`, `value.*`, `profitability.*` für 967 Titel | Quant-V2-Methodik |
| `FACTOR_SNAPSHOT_HISTORY` | `change.scoreMomentum` | dieser Materializer, ab seinem ersten wöchentlichen Snapshot |

Das Consumer-Gate ist inzwischen geschlossen: `consumer.py` führt
`depreciation_and_amortization`, `pretax_income`, `income_tax_expense` und das bereits in der
SEC-Schicht abgeleitete `ebitda` jetzt mit, und die drei Komponenten lesen sie. Es war eine
Erweiterung einer bestehenden Ausspielung, keine neue Pipeline. Die Werte erscheinen mit dem
nächsten SEC-Lauf in den Consumer-Artefakten; bis dahin bleiben die drei Komponenten leer.

## 7. Produktebene

`/vu2/?view=quant&ticker=<TICKER>` zeigt in dieser Reihenfolge:

1. **Bedeutung** — Name, Zustand („5 von 7 Faktoren bewertet“, „Kein Gesamtscore veröffentlicht“),
   ein Satz zur Faktorlage, ein Satz zur Veränderung.
2. **Factor DNA** — die sieben Faktoren in kanonischer Reihenfolge mit Band und Balken.
   Aufklappen zeigt Erklärung, Vergleichsgruppe, Datensicherheit und jede Einzelkennzahl mit
   Rohwert, Position, Gewicht und — falls geschlossen — ihrem typisierten Grund.
3. **Veränderung** — gruppiert nach verbessert / verschlechtert / unverändert, mit Von-nach-Werten;
   nicht messbare Bereiche stehen aufklappbar mit Grund darunter.
4. **Setup** — die kanonische Zustandsreise ohne markierten Zustand, weil die Setup-Methodik
   fail-closed ist, darunter die heute beobachtbaren Bedingungen als „x von y erfüllt“.
5. **Datenstand** — Kursstichtag, Geschäftszahlen-Stichtag und deren Bekanntwerden, Börsenwert,
   Methodik-Version, Datenqualität.

`/vu2/?view=explain` ist die Einsteigerfläche: was Quant bedeutet, wozu es gegenüber dem Broker
gut ist, die sieben Eigenschaften in Alltagssprache, wie eine Position entsteht — und was hier
bewusst nicht steht.

Beide Flächen sind bei 1440 px und 390 px ohne horizontalen Überlauf geprüft.

## 8. Was hier nicht behauptet wird

- Kein Gesamtscore, kein Rang, kein Perzentil über alle Faktoren.
- Keine Kursprognose, kein Kursziel, keine Empfehlung.
- Kein Setup-Zustand, solange die Setup-Methodik nicht zertifiziert ist.
- Kein Backtest und keine historische Rendite aus dieser Ebene.
- Kein geschätzter Wert anstelle eines fehlenden.
- Kein Wert aus der Zukunft in einer Aussage über die Vergangenheit: Geschäftszahlen werden nur
  verwendet, wenn ihr Meldedatum vor dem Stichtag liegt.
