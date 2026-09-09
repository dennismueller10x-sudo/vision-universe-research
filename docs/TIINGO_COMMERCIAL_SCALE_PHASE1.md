# TIINGO COMMERCIAL — SCALE PHASE 1

Vom Canary zum Universum. Was gebaut wurde, was gemessen wurde, und was
weiterhin offen ist.

---

## Die Rollenänderung

Die Golden Five (AAPL, MSFT, NVDA, JPM, XOM) sind ab dieser Phase **nicht mehr
das Zieluniversum**. Sie sind der **Canary-/Regressionssatz**: fünf bekannte
Titel, die vor jedem Scale Gate geprüft werden, damit eine Regression eine
Minute kostet und nicht einen Lauf über 2.000 Titel.

Das Zieluniversum kommt ab jetzt aus den Stammdaten des Anbieters.

## Die Kette

```
build-market-universe    Anbieterstammdaten  → klassifiziertes Universum
select-gate-universe     Universum           → Gate-Auswahl (geschachtelt)
run-scale-gate           Gate-Auswahl        → Kurse, Qualität, Bilanz, Urteil
build-market-factors     Kurse               → Faktoren + Screener-Datenmodell
run-technical-scale      Kurse               → Technical/Elliott-Deckung
build-health-report      alles               → maschinenlesbarer Zustand
```

Jeder Schritt schreibt ein Artefakt, das der nächste liest. Ein fehlender
Schritt ist deshalb sichtbar und nicht stillschweigend eine Null.

## Was neu ist — und was ausdrücklich nicht

| Neu | Warum es neu sein musste |
|---|---|
| `instrument-classification.js` | Die Frage „ist das eine Aktie?" entscheidet, was im Screener landet. Sie gehört an eine Stelle, an der sie einzeln getestet wird. |
| `market-factors.js` | Eine Zeile je Titel statt eines vollständigen Bundles. Rechenprimitive aus `feature-store.js` — keine zweite Methodik. |
| `subscription-tiers.js` | HOT/WARM/COLD. Ein Universum lässt sich nicht dauerhaft abonnieren. |
| `assessSeries()` in `market-quality.js` | `validateBars()` beantwortet „darf diese Bar in den Bestand?". Bei tausend Titeln lautet die Frage anders: ist dieser Titel brauchbar, eingeschränkt brauchbar oder nicht da. |

**Nicht neu gebaut wurden:** Technical Intelligence, Elliott, Chart Engine,
Backtest, Quant Score, der Tiingo-Adapter, der Speicher. `run-technical-scale.mjs`
ruft dieselben Engines auf, die auch die Einzelansicht benutzt. Ein zweiter
Elliott hätte nichts belegt, was der erste nicht belegt.

## Instrumentenklassifikation (§7)

Tiingos Tickerliste trägt `ticker`, `exchange`, `assetType`, `priceCurrency`,
`startDate`, `endDate` — und **keinen Firmennamen**.

Daraus folgen zwei Dinge, die im Ergebnis stehen und nicht nur im Kommentar:

- **ADR ist ohne Namen nicht bestimmbar.** Das Feld `adrEvidence` steht dann auf
  `"unavailable"`. Ein so eingestufter `COMMON_STOCK` *kann* ein ADR sein.
- **Sektor und Branche fehlen vollständig** (`SOURCE_MISSING`). Sie liegen bei
  Tiingo im Fundamentalzusatz, der in diesem Zugang nicht enthalten ist.

`UNKNOWN` ist ein Ergebnis und ausdrücklich **nicht screenerfähig**. Der
umgekehrte Weg — im Zweifel Aktie — wäre bequemer und wäre genau der Fehler, den
§7 verbietet.

Ein einzelner Buchstabe nach dem Bindestrich ist eine **Aktienklasse** und keine
andere Gattung: `BRK-B` ist eine Stammaktie. Daran scheitert die naheliegende
Regel „Bindestrich = Sonderfall".

## Warum GATE_100 kuratiert ist

§9 verlangt Sektor-Diversifikation. Der Anbieter liefert keinen Sektor. Eine
Verteilung über neun Sektoren lässt sich aus Daten, die keinen Sektor kennen,
nicht ziehen — sie zu behaupten wäre schlimmer, als sie zu kuratieren.

`quant/config/gate-100-seed.json` ist deshalb eine **Auswahl von 100 Titeln**,
kein hart kodiertes Universum: jeder Titel muss sich im Anbieteruniversum als
screenerfähige Aktie wiederfinden, sonst fällt er heraus und ein Ersatz aus
demselben Sektor rückt nach. Die Sektorzuordnung trägt `sectorStatus: "CURATED"`
und wird nie als Anbieterangabe ausgegeben.

Ab GATE_500 wird regelbasiert gezogen. Dort ist Diversifikation kein
Auswahlkriterium mehr, sondern ein Messwert.

**Gates sind geschachtelt.** GATE_500 enthält GATE_100 vollständig. Ohne diese
Eigenschaft wäre ein Vergleich zwischen zwei Gates keiner — eine
Verschlechterung könnte auch daran liegen, dass ganz andere Titel drin sind.

## Speicher (§26)

Gemessen, nicht geschätzt:

| Was | Größe |
|---|---|
| Volle Historie je Titel (36 Jahre EOD, JSON) | ~1,5–3 MB |
| Technical-Bundle je Titel | ~0,5 MB |

Bei 2.000 Titeln sind das mehrere Gigabyte. Das gehört weder technisch noch
lizenzrechtlich in ein öffentliches Git-Repository.

Die Trennung ist deshalb:

| Ablage | Inhalt | Im Repository |
|---|---|---|
| `.market-cache/` | vollständige Kursreihen, Checkpoints, Universumsliste | nein (gitignored) |
| `quant/data/market/{universe,scale,factors,health}` | Bilanzen, Zustände, Abstände | ja |
| `quant/data/technical/scale/` | Deckungs- und Laufzeitbericht | ja |

Was ausgeliefert wird, trägt **keine Kursniveaus**. „5 % unter dem
52-Wochen-Hoch" ist eine abgeleitete Aussage; „das Hoch liegt bei 184,20" ist der
Kurs des Anbieters. `market-factors.stripPriceLevels()` entfernt das eine und
behält das andere, und `assert-public-data-hygiene.mjs` prüft das erzeugte
Artefakt — nicht die Absicht des Skripts.

## Echtzeit (§20, §28)

Der Browser verbindet sich **nie** mit dem Anbieter. Der Schlüssel liegt
serverseitig; das Backend hält die Ströme und verteilt sie.

| Stufe | Wer | Transport |
|---|---|---|
| HOT | aktuell geöffnete Titel | WebSocket |
| WARM | Watchlists, häufig aufgerufene Titel | Kursabfrage |
| COLD | der Rest | EOD |

`maxStreamSubscriptions` steht auf **null** — ungemessen. Mit null läuft die
Zuteilung gegen ein bewusst kleines Budget, und der Plan sagt das. Eine geratene
Zahl wäre schlimmer als keine, weil sie sich wie eine gemessene liest.

## Was ein Lauf gefunden hat, den kein Test fand

Der erste Lauf gegen den Commercial-Zugang hat vier Fehler gezeigt. Der
interessanteste:

> Mit voller Historie fällt Apples **29.09.2000** in die Reihe: minus 51,9 % an
> einem Tag. Das Verhältnis 2,08 liegt innerhalb der Toleranz für einen
> 2:1-Split — `market-quality.js` verwarf die ganze Reihe für ein Ereignis, das
> tatsächlich stattgefunden hat. Damit fiel der Canary, und damit stand das Gate.

Die Korrektur nutzt eine Angabe, die vorher ungenutzt blieb: meldet der Anbieter
für diesen Tag ausdrücklich `splitFactor = 1` **und** wird auf der bereinigten
Spalte geprüft, ist ein nicht bereinigter Split keine mögliche Erklärung mehr.
Wo die Angabe fehlt oder auf der rohen Spalte geprüft wird, bleibt der Verdacht
ein Fehler — das ist keine Aufweichung, und zwei Gegenproben halten es fest.

Die anderen drei: eine Namensverwechslung bei den Sitzungsphasen
(`PRE_MARKET` statt `PRE`) ließ erweiterte Zeiten als `ABSENT` erscheinen,
obwohl der Anbieter 536 statt 390 Bars geliefert hatte; der Gesundheitsbericht
stürzte an einem abgebrochenen Gate ab; und die Hygieneprüfung hielt zwei eigene
Artefakte an, weil eine Anzahl unter dem Feldnamen `sma200` und eine Schwelle
unter `high` stand. Behoben wurden die Feldnamen, nicht die Prüfung.

## Was offen bleibt

| Frage | Status | Warum |
|---|---|---|
| Abo-Grenzen des Stroms | `UNMEASURED` | Ein Vertrag ist keine Messung. |
| Kontingente (`COMMERCIAL_LIMITS`) | `verified: false` | Ebenso. Die Zahlen bleiben konservativ, bis ein Lauf sie misst. |
| Sektor/Branche | `SOURCE_MISSING` | Nicht im Zugang enthalten. Nicht geschätzt. |
| ADR-Trennung | `UNVERIFIED` | Ohne Firmennamen nicht entscheidbar. |
| Weitergabe der vollständigen Tickerliste | `LEGAL_REVIEW_REQUIRED` | Anbieterinhalt in Rohform. |

## Ausführen

```bash
# Universum aus den Anbieterstammdaten
TIINGO_API_KEY=... node scripts/market/build-market-universe.mjs

# Gate wählen und laufen lassen
node scripts/market/select-gate-universe.mjs --gate GATE_100
TIINGO_API_KEY=... node scripts/market/run-scale-gate.mjs --gate GATE_100

# Auswertung
node scripts/market/build-market-factors.mjs --gate GATE_100
node scripts/technical/run-technical-scale.mjs --gate GATE_100
node scripts/market/build-health-report.mjs

# Nachweise (brauchen echte Antworten des Anbieters)
TIINGO_API_KEY=... node scripts/market/verify-tiingo-commercial.mjs
TIINGO_API_KEY=... node scripts/market/verify-live-candle.mjs --seconds 90
```

Der Stromnachweis ist nur während der regulären US-Handelszeit aussagekräftig.
Außerhalb kann er nur `UNKNOWN` ergeben — ein ausbleibender Kurs misst dann die
Handelspause und nicht den Tarif.
