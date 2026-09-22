# VU CURRENCY & FX LAYER — EUR FIRST

Wie ein Betrag seine Waehrung wechselt, ohne seine Herkunft zu verlieren.

Implementierung: `quant/engines/fx/*.js`
Vertrag: `quant/methodology/currency-fx-v1.json`
Tests: `quant/tests/currency-fx-matrix.test.mjs`
Nachweis: `scripts/quality/verify-currency-layer.mjs`
Guard: `scripts/quality/assert-no-local-fx.mjs`
Sondierung: `scripts/market/probe-tiingo-fx.mjs`

---

## 1. Der Satz, aus dem alles folgt

> EUR ist eine **Darstellung**. Nicht die neue Originalwaehrung.

Tiingo liefert NVDA mit `181.42` und `currency: "USD"`. Die SEC liefert Apples
Umsatz mit `130497000000` und `currency: "USD"`. Beides bleibt so, wie es ist.
Was dazukommt, ist additiv:

```
native:  { value: 181.42, currency: "USD" }
display: { value: 154.71, currency: "EUR" }
fx:      { rate: 0.8528, source: "...", asOf: "2026-09-21", method: "LATEST_AVAILABLE" }
```

Wer nur `native` liest, bekommt exakt das, was die Quelle geliefert hat — auf die
Nachkommastelle. Es gibt keinen Pfad, auf dem ein kanonischer USD-Wert durch
einen EUR-Wert ueberschrieben wird.

---

## 2. Was der Audit vorgefunden hat

Vor diesem Auftrag gab es **keine Currency-/FX-Schicht**. Die Suche nach
`fx`, `forex` oder einer Umrechnung ueber alle Engines, Provider und Worker
ergab null Treffer. Es gab nichts zu duplizieren — aber es gab drei Dinge zu
respektieren:

| Vorgefunden | Konsequenz |
|---|---|
| `currency: "USD"` fest verdrahtet an 8 Stellen in `providers/tiingo/adapter.js` und `realtime.js` | Nicht angefasst. Die Waehrung kommt weiterhin von dort; der Layer liest sie, statt sie zu ersetzen. |
| `" $"`, `" Mrd. $"`, `"$"+…` in 20 Produktdateien (68 Stellen) | Grundlinie in `quant/config/currency-formatting-baseline.json`. Die Zahl darf sinken, nicht steigen. |
| Capability-Tristate `true/false/null` aus Phase 2 | Uebernommen. FX ist eine eigene Datenklasse (`fx`) in `quant/engines/capabilities.js`, nicht ein Anhaengsel an `market`. |
| `price-semantics.js` (RAW / SPLIT_ADJUSTED / TOTAL_RETURN / UNKNOWN) | Die Umrechnung ist der **letzte** Schritt nach der Adjustierung, nie ein zweiter Adjustment-Pfad. |
| `realtime/freshness.js` (LIVE / LAST_SESSION / STALE / UNAVAILABLE) | Als Muster uebernommen, aber eigene Datei: FX hat keine Boersensitzung. |

---

## 3. Der wichtigste Befund: SEC ist nicht USD

§16 des Auftrags war kein theoretischer Vorbehalt. Gemessen am eigenen
Bestand (`quant/data/sec/consumer/`, 5.069 Datensaetze):

| | Anzahl |
|---|---|
| Datensaetze insgesamt | 5.069 |
| mit Waehrungsangabe | 4.215 |
| davon **nicht USD** | **400 (9,5 %)** |
| verschiedene Berichtswaehrungen | **28** |
| ohne jede Waehrungsangabe | 854 |

Die groessten Fremdwaehrungsgruppen: CNY (116), CAD (65), EUR (52), GBP (20),
BRL (19), HKD (16), SGD (16), JPY (14), MXN (11), AUD (11).

Darunter Namen, die niemand fuer Sonderfaelle haelt: **TSM** (TWD), **SAP**,
**ASML**, **NOVO** (DKK), **TOYOTA** (JPY), **UBS** (CHF), **ALIBABA** (CNY),
**SHELL**-Nachbarn wie **BTI** (GBP), **SANTANDER** (EUR).

> Eine Engine, die „SEC = USD" annimmt, haette bei 400 Unternehmen jeden
> monetaeren Wert um den Wechselkurs danebenliegen lassen — ohne dass
> irgendetwas nach einem Fehler ausgesehen haette.

Deshalb liest `currency-registry.js` die Waehrung aus den Facts und leitet
sie nirgends ab. Ein Datensatz ohne Waehrungsangabe wird **nicht** umgerechnet.

---

## 4. Die Tiingo-FX-Faehigkeiten: GEMESSEN

Der Owner-Entscheid O-1 verlangt Messung statt Annahme. Gemessen wurde in
GitHub Actions (`currency-fx-verify.yml`) mit dem bestehenden
Repository-Secret; der Schluessel steht im Authorization-Header, nie in
einer URL, und drei Stufen halten ihn aus Protokoll, Bericht und
Repository heraus.

`TIINGO_FX_CAPABILITIES = MEASURED` (Lauf 35697488444, 20 Anfragen)

| Faehigkeit | Ergebnis | Beleg |
|---|---|---|
| `fxCurrent` | **ja** | Quote 1 Sekunde alt |
| `fxDaily` | **ja** | 39 Tageszeilen, aktuell bis heute |
| `fxHistoricalDaily` | **ja** | zurueck bis **2020-02-29** |
| `fxIntraday` | **ja** | 79 Stundenbars |
| `fxRealtime` | **ja** | Zeitstempel 1 s, innerhalb der 120-s-Toleranz |
| `fxCrossPairs` | **nein** | CNY/EUR in keiner Schreibweise gefuehrt |
| `fxBulkQuotes` | ungeprueft | 2 Symbole angefragt, 1 zurueck — nicht unterscheidbar |
| `fxWebsocket` | nicht versucht | gehoert in einen eigenen Lauf |

**O-2 ist damit beantwortet:** `secondSource = NO`. Der bestehende Zugang
deckt den Bedarf. Eine zweite Quelle waere Komfort, kein Erfordernis.

### Drei Dinge, die erst der Lauf sichtbar gemacht hat

**1. Das Symbol war eine Annahme.** Der erste Lauf meldete sieben von acht
Faehigkeiten als ungeprueft — bei funktionierendem Zugang. Im Bericht stand
der Grund:

```
eurusd   HTTP 200, 9 Zeilen, juengste 2026-09-22
usdeur   HTTP 200, 0 Zeilen
```

Tiingo folgt der Marktkonvention: EUR/USD wird mit EUR als Basis notiert,
die Gegenrichtung existiert nicht als eigene Reihe. Alle Sonden liefen auf
`usdeur`, weil USD/EUR der groesste Bedarf ist. Die Sonden waren richtig,
das Symbol war geraten.

`resolveTicker()` befragt jetzt beide Schreibweisen und nimmt die
antwortende — **zuerst klaeren, womit gemessen wird, dann messen**. Die
Gegenrichtung entsteht in `fx-rates.js` durch Inversion, eine exakte
Identitaet.

**2. HTTP 400 ist eine Fenstergrenze, kein fehlendes Paar.** Der erste
Import verlor alle 39 Paare an HTTP 400 — auch `eurusd`, das Sekunden
zuvor gelesen worden war. Der Unterschied war `startDate=2015-01-01`.

Die Sonde bisektiert jetzt zwischen funktionierendem und abgelehntem
Fenster:

| Fenster ab | HTTP | Zeilen |
|---|---|---|
| 2019-03-24 | 400 | – |
| 2019-11-07 | 400 | – |
| **2020-02-29** | **200** | **9** |
| 2020-06-22 | 200 | 10 |

> **Die FX-Historie des Anbieters beginnt am 2020-02-29.** Ein
> EUR-Chart ueber 10 Jahre oder MAX kann nicht weiter zurueckreichen.
> Das ist eine Produktgrenze, keine Einstellung — siehe **O-7**.

**3. Ein Tageskurs lizenziert kein „Realtime EUR".** `realtimeClaimAllowed`
haing nur an `CURRENT`. Ein Tagesschluss ist innerhalb seiner
Vier-Tage-Toleranz CURRENT — aber ueber einem damit gerechneten Wert darf
„Realtime EUR" nicht stehen. Die Zusage verlangt jetzt zusaetzlich eine
Frequenz, die sie tragen kann.

### Verfuegbar ist nicht gefahren

Mit belegtem `fxRealtime` meldete der Resolver prompt Stufe C. Als
Verfuegbarkeitsaussage richtig, als Betriebsaussage falsch — O-5 sagt
ausdruecklich „keine FX-Anfrage pro Stock Tick".

```
available:       "C"     was der Zugang hergibt
recommended:     "A"     was gebaut ist und laeuft
upgradePossible: true    eine Owner-Entscheidung, kein Automatismus
```

## 5. Die Architektur

```
                         Nutzer: EUR | USD
                                │
                  currency-preference.js   ein Schluessel fuer alle Produkte
                                │
                  currency-contract.js     die Fassade, die Produkte lesen
                    │        │        │
          currency-engine.js │        money-format.js
            │        │       │          Berechnung ≠ Formatierung
   currency-class.js │  currency-registry.js
     Was ist das     │    Welche Waehrung, und woher wissen wir das
     fuer eine Zahl  │
                fx-rates.js  ←  fx-freshness.js
                  Der zentrale Store      Ist der Stand, was er behauptet
                       │
                  fx-capability.js        Was der Vertrag wirklich kann
```

`fx-realtime-state.js` haengt daneben: es multipliziert Ticks am Ende des
bestehenden Transports und aendert diesen nicht.

### Die Funktion, die es gibt — und die, die es nicht gibt

```js
// GIBT ES:
convertMoney(value, fromCurrency, toCurrency, dateOrPeriod, context)

// GIBT ES NICHT:
usdToEur(value)
```

Eine `usdToEur`-Funktion ist ein Versprechen, das beim ersten Schweizer Titel
bricht. Dann steht eine `usdToChf` daneben, und drei Monate spaeter rechnen
drei Funktionen mit drei Staenden. EUR ist der erste produktive Fall, nicht
die Architektur — `CHF`, `GBP`, `JPY` brauchen einen Eintrag in
`DISPLAY_CURRENCIES` und ein FX-Paar, sonst nichts.

---

## 6. Der Kontext bestimmt den Kurs

Derselbe Betrag, derselbe Tag, zwei Kontexte, zwei Kurse:

| Kontext | FX-Methode | Gilt fuer |
|---|---|---|
| `MARKET_PRICE` | `DAILY_AT_DATE` | Kurse — jeder Tag mit dem Kurs seines Tages |
| `CURRENT_VALUE` | `LATEST_AVAILABLE` | aktueller Kurs, Realtime |
| `BALANCE_SHEET` | `DAILY_AT_PERIOD_END` | Cash, Debt, Assets, Equity |
| `INCOME_STATEMENT` | `PERIOD_AVERAGE` | Revenue, EBIT, Net Income |
| `CASH_FLOW` | `PERIOD_AVERAGE` | OCF, FCF, CapEx, Dividenden |
| `PER_SHARE` | Regel des Zaehlers | EPS (Periode), Buchwert je Aktie (Stichtag) |

Gemessen an AAR Corp (Geschaeftsjahr Juni–Mai): der Periodendurchschnitt
FY2026 liegt bei 0,847420 auf 260 Handelstagen — der Kurs des letzten
Periodentags ist ein anderer. Bei 3,3 Mrd. USD Umsatz entscheidet diese
Wahl ueber einen zweistelligen Millionenbetrag.

### Periodengrenzen kommen aus den Daten

Die kanonischen Fundamentalreihen fuehren `end`, aber keinen Anfang.
`Engine.resolvePeriodChain()` leitet ihn aus dem Ende der Vorperiode + 1 Tag
ab und markiert das als `DERIVED_FROM_PRIOR_PERIOD`. Gibt es keinen
Vorgaenger, ist die Antwort `UNKNOWN` — **kein** geschaetztes Kalenderjahr.

Apple schliesst Ende September ab, AAR Corp Ende Mai, viele Einzelhaendler
Ende Januar. „Geschaeftsjahr = Kalenderjahr" ist bei einem erheblichen Teil
des Universums schlicht falsch.

---

## 7. Der Sonderfall, der die bequeme Regel widerlegt

> „Prozentwerte niemals veraendern" — bei Kursrenditen ist das **falsch**.

| Klasse | Umrechnen? | Warum |
|---|---|---|
| `MONETARY_STOCK/FLOW/PRICE/PER_SHARE` | ja | Betraege |
| `RATIO_METRIC` (Marge, ROIC, Wachstum) | nein | Waehrung kuerzt sich heraus |
| `MULTIPLE` (KGV, EV/EBITDA) | nein | dimensionslos — „KGV in Euro" existiert nicht |
| `SCORE`, `COUNT` | nein | keine Waehrung |
| **`PRICE_RETURN`** | **nein — NEU BERECHNEN** | aus der EUR-Reihe, nicht durch Multiplikation |

Nachgerechnet an echten Kursen (Tiingo SPLIT_ADJUSTED, 5 Jahre bis 2026-09-10):

| Titel | Rendite USD | Rendite EUR | Waehrungseffekt |
|---|---|---|---|
| AAPL | +119,22 % | +119,92 % | +0,70 pp |
| NVDA | +871,35 % | +874,45 % | +3,10 pp |
| MSFT | +66,53 % | +67,06 % | +0,53 pp |

Die Identitaet, die gelten **muss** und in jedem Lauf geprueft wird:

```
(1 + r_EUR) = (1 + r_USD) × (FX_Ende / FX_Anfang)
```

Geht sie nicht exakt auf, wurde die Reihe irgendwo nicht punktweise
umgerechnet — genau der Fehler, den eine Rueckrechnung mit dem heutigen Kurs
erzeugt. Ein Waehrungseffekt von faktisch null ist deshalb kein gutes,
sondern ein verdaechtiges Ergebnis.

---

## 8. Kein Look-Ahead, keine erfundenen Kurse

| Fall | Verhalten |
|---|---|
| Fixing am Stichtag vorhanden | `DAILY_AT_DATE` |
| Wochenende / Feiertag | `PREVIOUS_AVAILABLE` — der letzte Kurs **vor** dem Tag |
| Luecke groesser als 10 Tage | `carryLimitExceeded` — **kein** Kurs |
| Tag liegt vor Beginn der Reihe | `beforeSeriesStart` — ein spaeterer Kurs waere Look-Ahead |
| Periodenabdeckung unter 60 % | `insufficientPeriodCoverage` — **kein** Durchschnitt |
| Paar nicht gefuehrt | Inversion (`1/rate`), sonst Triangulation ueber USD |
| Triangulationsbeine auf verschiedenen Tagen | `triangulationDateMismatch` — kein Kreuz aus zwei Tagen |

Es gibt keine lineare Interpolation. Eine Naeherung, die sich nicht als
solche meldet, ist gefaehrlicher als eine Luecke.

**Nachgewiesen an echten Stichtagen:** Apples Geschaeftsjahre enden 2023-09-30,
2024-09-28 und 2025-09-27 — alle drei ein **Samstag**. Jeder faellt
deterministisch auf den Freitag davor zurueck, nie auf den Montag danach.

---

## 9. Freshness: gemessen gegen den Zeitpunkt, den der Kurs beschreibt

Vier Zustaende: `CURRENT`, `LAST_AVAILABLE`, `STALE`, `UNAVAILABLE`.

Der Bezugspunkt ist **nicht die Uhr**, sondern `requestedDate`. Ein
Wechselkurs vom 30.06.2021 fuer einen Bilanzwert vom 30.06.2021 ist perfekt —
gegen die heutige Uhr gemessen waere er fuenf Jahre alt und STALE, und jede
historische Anzeige truege eine Warnung, die nichts bedeutet. Wer solche
Warnungen erzeugt, bringt Nutzern bei, sie zu uebersehen.

`realtimeClaimAllowed` ist nur bei `CURRENT` wahr. Ein Aktienkurs kann
realtime sein, waehrend der FX-Stand es nicht ist — dann heisst das Ergebnis
nicht „Realtime EUR".

Bei `UNAVAILABLE` wird **nicht** umgerechnet: der Originalwert erscheint in
seiner Waehrung mit dem Vermerk „Originalwaehrung".

---

## 10. Realtime: ein FX-Stand, viele Ticks

Der bestehende Pfad `Tiingo → Cloudflare Realtime → VU Realtime State →
Browser` bleibt unberuehrt. `fx-realtime-state.js` multipliziert am Ende und
haengt sich nicht in den Transport.

**Stufe A ist die Vorgabe** (`fx-capability.js`): ein FX-Stand bedient viele
Ticks, solange er `CURRENT` ist. Gemessen im Test: **52 Ticks je FX-Abruf**
bei 60 Sekunden Aktualisierung.

Stufe B (Intraday-FX) und C (Realtime-FX) sind definiert, aber **nicht
gebaut**. Eine liquide Aktie bewegt sich in einer Minute um Zehntelprozente,
ein Hauptwaehrungspaar um Hundertstel. Ein zweiter Push-Transport waere ein
zweites Kontingent, ein zweiter Betriebszustand und ein zweiter Ausfallpfad
fuer eine Stelle, die niemand sieht. Stufe C braucht eine Owner-Entscheidung
und einen belegten Nutzen.

Doppelte Umrechnung wird durch einen Marker am Tick verhindert: Kurs mal
Kurs sieht aus wie ein Kurssturz.

---

## 11. Der Umschalter ist echt

`EUR | USD`, Vorgabe **EUR** (Primaermarkt Deutschland), Schluessel
`vu-currency-preference-v1` — produktneutral, damit Discover nicht EUR merkt,
waehrend der Screener USD merkt.

Der Schalter aendert **Werte**, nicht Symbole:

* aktueller Kurs, Intraday, Realtime
* historischer Chart → die **historische EUR-Reihe**
* Performance → **neu berechnet** aus dieser Reihe
* Market Cap, Enterprise Value, Revenue, Profit, Cash Flow, Cash, Debt

Unveraendert bleiben: Margen, Wachstumsraten, ROIC, ROE, Quant Scores,
Factor Scores, technische Prozentindikatoren, dimensionslose Multiples.

### Was der umgerechnete Kurs ist — und was nicht

`price()` haengt bei jeder Umrechnung `semantics.kind =
"CONVERTED_HOME_MARKET_QUOTE"` an, mit `tradingVenueClaim: false`:

> Umgerechneter Kurs des Heimatmarktes in EUR. Dies ist **kein** an einer
> EUR-Boerse gehandelter Kurs.

Diese Zeile gehoert auf die Daten-und-Quellen-Seite jedes Produkts, das den
Wert anzeigt.

---

## 12. Waehrungsabdeckung: 94,9 Prozent belegt (O-4)

Der erste Nachweis zaehlte 854 Datensaetze ohne Waehrungsangabe und liess
sie stehen. O-4 verlangt Rekonstruktion mit Provenance — oder UNKNOWN.

| Zustand | Anzahl | Herleitung |
|---|---|---|
| `KNOWN_NATIVE_CURRENCY` | 4.150 | `units.revenue` |
| `DERIVED_NATIVE_CURRENCY` | 661 | andere monetaere Spalte, alle einheitlich (660) · kanonische XBRL-Facts (1) |
| `UNKNOWN_NATIVE_CURRENCY` | 258 | kein Beleg (182) · uneinheitlicher Abschluss (76) |
| **aufgeloest** | **94,9 %** | |

**Nicht in der Kaskade:** Sitz, Boerse, Land — und der verfuehrerischste
Fehlgriff, die **Handelswaehrung aus der Kursreihe**. Sie liegt fuer jeden
Titel vor und beantwortet eine andere Frage: SAP notiert als ADR in USD
und bilanziert in EUR. Wer sie einsetzt, laesst SAPs Umsatz um den
Wechselkurs falsch stehen, ohne dass etwas nach einem Fehler aussieht.

76 Unternehmen fuehren **zwei monetaere Waehrungen im selben Abschluss** —
CRH (EUR und USD), YPF (ARS und USD), Harmony Gold (USD und ZAR),
Ryanair (EUR und USD). Sie werden als Befund gemeldet, nicht per Mehrheit
aufgeloest: jeder Wert rechnet mit seiner eigenen Waehrung.

---

## 13. Paarbedarf: abgeleitet, nicht gepflegt (O-3)

`build-fx-pair-requirements.mjs` liest den Bestand und leitet **62 Paare
aus 32 Berichtswaehrungen** ab. Keine Zeile des Skripts nennt eine
Waehrung beim Namen. Ein neuer Titel mit neuer Berichtswaehrung erzeugt
beim naechsten Lauf ein neues Paar, ohne dass jemand etwas eintraegt.

| Paar | Titel | Anteil | Prioritaet |
|---|---|---|---|
| USD/EUR | 10.858 | 92,4 % | REQUIRED |
| CNY/EUR · CNY/USD | je 124 | 1,1 % | REQUIRED |
| CAD, BRL, GBP, HKD, SGD, JPY, AUD … | | | LONG_TAIL |

Der Import holt jedes kanonische Paar **genau einmal** — die
Gegenrichtung entsteht durch Inversion, nicht durch eine zweite Anfrage.
Das halbiert das Kontingent, ohne eine Zahl zu verlieren.

---

## 14. Regression Guard und Debt Register (O-6)

### Der Guard

`scripts/quality/assert-no-local-fx.mjs`, drei Befundarten, zwei
Haertegrade:

1. **FX-Arithmetik ausserhalb von `quant/engines/fx/`** → Abbruch.
   Negativ geprueft: eine eingefuegte Verletzung wird gefunden, ihre
   Entfernung macht den Lauf wieder gruen.
2. **Verdaechtige Konstanten** → gezaehlt, Grundlinie 2. Kein Abbruch:
   `close * 1.015` in `dashboard/app.js:24` ist eine Szenariogrenze,
   formatiert mit `usd()`. Jedes Merkmal einer FX-Umrechnung, und
   trotzdem keine.
3. **Fest verdrahtete Waehrungsdarstellung** → gezaehlt, Grundlinie 30.

### Die 68 waren nie 68

Guard und Register hatten je eine eigene Kopie der Muster — derselbe
Fehler, den `price-semantics.js` fuer die Bereinigungsstufen behoben hat.
Beim Zusammenlegen in `currency-debt-patterns.mjs` fielen zwei
Fehlerquellen auf:

* Die Regel `/["'`]\$\$?\{/` traf **jedes Template-Literal**, weil ein
  Backtick gefolgt von `${` dazu passt. `vu2/experience.js:83` ist ein
  Diagrammtitel, keine Waehrungsschuld.
* Ohne Blockzustand zaehlte `discover/ui/detail.js:730` als Code. Die
  Zeile lautet `303 Mrd. $ schon. */` — das Ende eines Kommentars, der
  erklaert, warum dort gerundet wird.

**Von 68 gemeldeten Stellen waren 38 Fehlalarme.** Es sind 30.

### Das Register

| Klasse | Anzahl | Regel |
|---|---|---|
| **A** `MONETARY_DISPLAY` | 25 | muss den Currency Contract konsumieren |
| **B** `PERCENTAGE_OR_RATIO` | 4 | niemals FX-Konvertierung |
| `UNCLASSIFIED` | 1 | von Hand ansehen |

Migrationsreihenfolge, je Datei gebuendelt: `detail-fundamentals.js` (5),
`hedgefonds/index.html` (5), `surfaces.js` (4), `daten.js` (2),
`detail.js` (2), dann Einzelstellen.

Die Migration beginnt **nach** dem Produktionsnachweis — so steht es in
O-6.

---

## 15. Was NICHT gemacht wurde

| | Grund |
|---|---|
| Discover 1.0 / 2.1 redesignt | §28, §48 — Discover 2.1 ist ein paralleler Workstream |
| Eine zweite FX-Datenquelle angebunden | O-2 — der bestehende Zugang deckt den Bedarf |
| Eine kostenpflichtige Tiingo-Funktion aktiviert | nichts am Tarif geaendert, `PAID_SERVICES_ENABLED = 0` |
| Quant-Faktoren auf EUR umgestellt | §25, §50 — EUR ist keine neue Quant-Methodik |
| Kanonische Werte ueberschrieben | §3 — der Layer ist additiv |
| Realtime-Transport angefasst | §11, §37 — der bestehende Pfad bleibt kanonisch |
| FX-Reihen ins Repository committet | Redistribution ist `LEGAL_REVIEW_REQUIRED`; sie bleiben in der Arbeitsablage |
| Die 30 Waehrungsstellen migriert | O-6 — erst der Nachweis, dann die Migration |

---

## 16. Nachweisstand

`node scripts/quality/verify-currency-layer.mjs`

**`FX_DATA_PROOF = PASS`** — Regeln belegt UND mit qualifizierten
FX-Kursen gerechnet (Lauf 35697488444).

### Kurse: neun Titel, punktweise nachgerechnet

Fuer jeden Stuetzpunkt (heute, 1 Monat, 1 Jahr, 5 Jahre) wird
`nativePrice × FX(t)` von Hand gegengerechnet, und jeder FX-Stand muss
`<= Kurstag` liegen. Die Zerlegung

```
(1 + r_EUR) = (1 + r_USD) × (FX_Ende / FX_Anfang)
```

geht in jedem Lauf exakt auf. Ginge sie nicht auf, waere die Reihe
irgendwo nicht punktweise umgerechnet worden.

### Fundamentals: fuenf Kennzahlen ueber sechs Berichtswaehrungen

| Titel | Waehrung | Revenue (nativ) | → EUR | Methode |
|---|---|---|---|---|
| AAPL | USD | 416,2 Mrd. | 352,0 Mrd. € | PERIOD_AVERAGE, 312 Tage |
| MSFT | USD | 331,8 Mrd. | 284,5 Mrd. € | PERIOD_AVERAGE, 313 Tage |
| **SAP** | **EUR** | 36,80 Mrd. | **36,80 Mrd. €** | **IDENTITY** — Bit fuer Bit |
| ASML | EUR | 32,67 Mrd. | 32,67 Mrd. € | IDENTITY |
| **TM** | **JPY** | 48.036,7 Mrd. | 293,7 Mrd. € | PERIOD_AVERAGE, FY Apr–Mrz |
| **BABA** | **CNY** | 1.023,7 Mrd. | 124,3 Mrd. € | PERIOD_AVERAGE, FY Apr–Mrz |
| **GSK** | **GBP** | 32,67 Mrd. | 38,14 Mrd. € | PERIOD_AVERAGE |

SAP ist der Fall, den eine naiv gebaute Engine falsch macht: der Umsatz
ist bereits EUR und darf **nicht** umgerechnet werden (Fast Path), der
Kurs ist USD und **muss** umgerechnet werden. Wer die Waehrung je
Unternehmen statt je Wert fuehrt, bekommt genau hier zwei Zahlen, von
denen eine falsch ist.

Stichtagsgroessen belegt an echten Wochenend-Geschaeftsjahresenden:
AAPL 2025-09-27 (Sa) → FX vom 26.09., NVDA 2026-01-25 (So) → FX vom
23.01., MSFT 2026-06-30 (Di) → `DAILY_AT_DATE`.

### Was der Nachweis ausdruecklich NICHT bestanden meldet

| Pruefung | Zustand | Grund |
|---|---|---|
| `RT1` Realtime am offenen Markt | **NOT_PROVEN** | kein laufender Stream, keine gemessene offene US-Sitzung. §58: nicht kuenstlich als PASS melden. |
| `FD-NVO` (DKK) | BLOCKED → behoben | DKK fiel bei `--max-pairs=40` unter den Schnitt; jetzt 80 |
| TM/BABA Free Cash Flow FY2020 | `insufficientPeriodCoverage` | die Periode 2019-04 bis 2020-03 liegt fast vollstaendig **vor** dem Beginn der FX-Historie (2020-02-29). Korrekt verweigert statt genaehert. |

### Tests

**43 Tests, alle gruen.** M1–M12 sind die zwoelf Faelle aus §59, I1–I16
die Invarianten, O5-1 bis O5-6 die Realtime-Anforderungen aus O-5
(Devisenkalender 24/5, Wochenende vs. Luecke, Anbieterausfall in drei
Stufen, 500 Ticks auf einen FX-Abruf, verfuegbare vs. gefahrene Stufe).

Die fuenf roten Tests der Gesamtsuite bestehen **unveraendert auch ohne
diesen Zweig** — mit `git stash` gegengeprueft. Sie gehoeren nicht zu
diesem Workstream und werden hier nicht repariert.

---

## 17. Merge Gate

| Kriterium | Zustand |
|---|---|
| `TIINGO_FX_CAPABILITIES` | **MEASURED** |
| `FX_DATA_PROOF` | **PASS** |
| `CURRENCY_CONTRACT` | **PASS** (43 Tests) |
| `REGRESSION_GUARD` | **PASS** |
| `NEW_REGRESSIONS` | **0** |
| `PAID_SERVICES_ENABLED` | **0** |
| `REALTIME_FX` | **MARKET_CLOSED_NOT_PROVEN** |

---

## 18. Owner-Entscheidungen

Die urspruenglichen O-1 bis O-6 sind abgearbeitet. Offen bleibt:

| # | Frage | Warum sie offen ist |
|---|---|---|
| **O-7** | Die FX-Historie beginnt **2020-02-29**. Wie sollen 10J- und MAX-Charts in EUR damit umgehen? | Heute verweigert der Layer korrekt (`beforeSeriesStart`), statt zu naehern. Drei Wege: EUR-Chart auf den belegten Zeitraum begrenzen, den Nutzer in USD verweisen, oder eine Referenzquelle fuer die Zeit davor — Letzteres waere eine zweite Quelle und braucht eine Entscheidung. |
| **O-8** | Realtime-Nachweis bei offener US-Sitzung nachholen | Der einzige Punkt, der `MARKET_CLOSED_NOT_PROVEN` zu `PASS` macht. Braucht einen Lauf zwischen 15:30 und 22:00 MEZ. |
| **O-9** | Stufe C ist verfuegbar. Bleibt es bei A? | Gemessen: 500 Ticks ueber 50 Titel auf einen FX-Abruf. Ein Wechsel braucht einen belegten Consumer-Nutzen, nicht die blosse Verfuegbarkeit. |
| **O-10** | 258 Datensaetze ohne belegbare Waehrung, davon 76 mit uneinheitlichem Abschluss | Sie werden heute korrekt nicht umgerechnet. Ob die Angabe nachgezogen wird, ist eine Frage an die SEC-Pipeline. |
| **O-11** | Redistribution der FX-Reihen | Sie liegen in der Arbeitsablage und werden nicht ausgeliefert. Eine oeffentliche EUR-Anzeige braucht einen Eintrag in `display-policy.js` mit Datum und Grundlage. |
| **O-12** | Migration der 25 Klasse-A-Stellen | Der Nachweis steht; nach O-6 darf die Migration jetzt beginnen. Discover 2.1 laeuft parallel (§48) — der Abbau gehoert in den Workstream, der die Oberflaeche ohnehin anfasst. |
