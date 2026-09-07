# VU QUANT METHODOLOGY

Konfiguration: `quant/methodology/quant-v1.json` · Version `quant-v1.0.0`
Implementierung: `quant/engines/factors.js`, `normalization.js`, `quant-score.js`

## Was der Score ist — und was nicht

Der VU Quant Score beschreibt die **relative Position eines Wertpapiers innerhalb einer
Vergleichsgruppe**.

> „Quality 94“ heisst: besser als 94 % der Vergleichsgruppe.
> Es heisst **nicht**: 94 % Wahrscheinlichkeit auf steigende Kurse.

## Pipeline

```
Rohkennzahl
   -> Validierung            nicht endliche Werte werden null, nicht 0
   -> Winsorization          2. / 98. Perzentil
   -> Peer-Normalisierung    Industry -> Sector -> Universe
   -> Perzentil je Komponente
   -> Faktorscore            gewichteter Mittelwert der Komponenten
   -> Composite              gewichteter Mittelwert der Faktoren
   -> Universums-Perzentil
   -> VU Quant Score 0..100
```

Der letzte Schritt ist wesentlich: ein reiner gewichteter Mittelwert von fuenf
Perzentilen zieht sich durch den zentralen Grenzwertsatz zur Mitte zusammen — der beste
Titel eines Universums laege bei 78 statt bei 99. Der Perzentilschritt macht den Score
wieder als Rang lesbar („Top 5 %“) und entspricht der regulatorisch bevorzugten Sprache.

**Beide Werte werden ausgewiesen.** `compositeScore` ist die Summe der Faktorbeitraege,
`score` der Perzentilrang. Die Kette bleibt dadurch nachvollziehbar.

## Faktorgewichte (V1)

| Faktor | Gewicht |
|---|---:|
| Quality | 30 % |
| Momentum | 30 % |
| Growth | 20 % |
| Value | 15 % |
| Risk | 5 % |

Der Research sieht zusaetzlich 15 % Analyst Revisions vor. Ohne lizenzierte historische
Point-in-Time-Konsensdaten wird dieses Gewicht **nicht mit erfundenen Daten gefuellt**,
sondern auf Quality, Momentum und Growth verteilt. Der Faktor existiert im Schema mit
`available: false`; sobald belastbare Daten vorliegen, entsteht `quant-v2` mit eigener
Version — keine stille Aenderung.

## Komponenten

**Quality** ROIC 25 · Gross Profitability 20 · FCF-Marge 20 · Operative Marge 15 · Bilanzqualitaet 10 · Verschuldung 10
**Momentum** 12-1 25 · 6M 20 · Relative Staerke 15 · Abstand 52W-Hoch 12 · 3M 10 · Kurs/200DMA 10 · Kurs/50DMA 8
**Value** FCF-Rendite 30 · Earnings Yield 25 · EV/EBITDA 20 · Kurs/FCF 15 · EV/Sales 10
**Growth** Umsatzwachstum 35 · EPS-Wachstum 25 · FCF-Wachstum 25 · Margenausweitung 15
**Risk** Volatilitaet 35 · Downside-Volatilitaet 25 · Max. Drawdown 25 · Beta 15

Bei `higherIsBetter: false` (Volatilitaet, Verschuldung, EV/EBITDA, Abstand zum Hoch)
wird die Perzentilskala gedreht: 100 bedeutet immer „guenstig fuer den Faktor“.

## Peer-Normalisierung

```
70 % Perzentil in der Vergleichsgruppe
30 % Perzentil im Gesamtuniversum
```

Damit wird ein Softwareunternehmen nicht an den Margen einer Bank gemessen — und zugleich
entsteht nicht automatisch in jeder objektiv schwachen Branche ein Spitzenwert.

Fallback-Kette bei weniger als 12 Titeln mit Wert: **Industry → Sector → Universe**.

## Fehlende Daten

Fehlende Werte bekommen **kein Ersatzperzentil**. Sie bleiben `null` und senken die
Coverage.

| Regel | Wirkung |
|---|---|
| Komponentenabdeckung eines Faktors < 50 % | Faktorscore ist `null`, der Faktor faellt aus dem Composite |
| Gesamtabdeckung < 60 % | Status `incomplete`, **kein Score** |
| ausgefallene Faktorgewichte zusammen > 20 % | Status `incomplete` |

Konfidenzbaender: ≥ 90 % hoch · ≥ 75 % mittel · ≥ 60 % niedrig · darunter unzureichend.

Ein Titel ohne ausreichende Daten bekommt also keinen kuenstlich praezisen Score,
sondern einen sichtbar eingeschraenkten Status mit Begruendung.

## Explainability

```
contribution_f = effektivesGewicht_f × Faktorscore_f
Composite      = Σ contribution_f
```

Die effektiven Gewichte summieren zu 1, die Beitraege damit exakt zum Composite. Das ist
kein Darstellungstrick, sondern folgt aus der Konstruktion — und wird als
Acceptance-Kriterium ueber alle Titel geprueft.

## Score Momentum

Aus wochentlichen Snapshots (Intervall 7 Tage, Fenster 365 Tage):

- `scoreVelocity30d`, `scoreVelocity60d` — Veraenderung ueber 30 bzw. 60 Kalendertage
- `scoreAcceleration` — Velocity der letzten 30 Tage minus Velocity der 30 Tage davor
- `factorVelocity` — dasselbe je Faktor

Die Snapshots werden jeweils mit dem **zum Stichtag verfuegbaren Datenstand** berechnet,
nicht rueckwirkend aus heutigen Daten rekonstruiert. Eine rueckwirkend gerechnete
Signalhistorie waere selbst look-ahead-biased.

> **Wichtige Einordnung:** Quant Score Momentum ist ein eigener Vision-Universe-Signaltyp.
> Er ist **nicht** automatisch wissenschaftlich validiert, nur weil seine Bestandteile es
> sind. Die Engine berechnet das Signal — sie behauptet nichts ueber seine Trefferquote.

## Radar-Schwellen

Quant Upgrade ab +6 · Downgrade ab −6 · Momentum-Fuehrer ab Score 90 ·
Quality-Fuehrer ab 90 · 52W-Hoch ≤ 3 % Abstand bei Quant ≥ 70 ·
Emerging Compounder ab +4 in Quality **und** Growth · Factor Breakout ab +8 in ≥ 2 Faktoren.

## Wissenschaftliche Grundlage

Fama/French (Drei- und Fuenf-Faktoren-Modell), Novy-Marx (Gross Profitability),
Jegadeesh/Titman (Momentum), Asness/Frazzini/Pedersen (Quality Minus Junk),
Frazzini/Pedersen (Betting Against Beta), George/Hwang (52-Wochen-Hoch).

Growth wird bewusst **nicht** als eigenstaendige, etablierte Faktorpraemie behandelt,
sondern als Stock-Selection-Komponente in Kombination mit Quality und Value. Factor
Timing findet nicht statt: die Gewichte sind statisch und versioniert.
