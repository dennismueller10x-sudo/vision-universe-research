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

## 4b. Die zweite Quelle — und warum sie erst jetzt kommt (O-7)

§6 und §38 lassen eine zweite FX-Quelle nur zu, wenn die Faehigkeit bei
der ersten **objektiv fehlt**. Diese Bedingung ist jetzt erfuellt und
gemessen: Tiingos FX-Historie beginnt am **2020-02-29**, und Vision
Universe braucht EUR-Darstellung fuer 10J, MAX und Fundamentals davor.

**EZB-Referenzkurse ab 1999-01-04**, `providers/ecb/adapter.js`.

```
TIINGO   PRIMARY    priority 10   zuerst gefragt
ECB      FALLBACK   priority 20   nur wo PRIMARY nichts hat
```

Die Rangfolge ist **datumsabhaengig, nicht qualitaetsabhaengig**. Es wird
nie zwischen zwei vorhandenen Werten „gewaehlt" — eine Reihe, in der je
Tag entschieden wird, ist nicht reproduzierbar, und §8 verlangt
Reproduzierbarkeit.

### Jeder Wert weiss, woher er kommt

```json
"fxProvenance": {
  "source": "ecb", "role": "FALLBACK", "priority": 20,
  "derivation": "INVERSE",
  "consideredSources": [{ "source": "tiingo", "role": "PRIMARY",
                          "reason": "beforeSeriesStart" }]
}
```

`consideredSources` ist der Teil, den man erst vermisst, wenn eine Reihe
springt: nicht nur *welche* Quelle geliefert hat, sondern welche davor
mit welchem Grund uebergangen wurde.

### Zwei Korrekturen, die beim Bauen auffielen

**Die Inversion liess `role` fallen.** Bei EUR-Notierung kommt die
Mehrheit der Werte ueber die Gegenrichtung — die Herkunft meldete also
fuer die Mehrheit `role: null`.

**Ein Pivot reicht nicht mehr.** Tiingo notiert gegen USD, die EZB gegen
EUR. Mit nur USD als Pivot findet ein CNY/CHF aus EZB-Daten kein einziges
Bein. Jetzt `["USD", "EUR"]` — fest in dieser Reihenfolge, nicht „welcher
gerade passt".

Ein Kreuz aus zwei Quellen traegt `role: "MIXED"` und die **strengere**
Lizenz: ein Kreuz aus einem freigegebenen und einem gesperrten Kurs ist
gesperrt, weil der gesperrte rechnerisch darin steckt.

### Die Naht wird gemessen, nicht gehofft

Ein Chart wechselt am Beginn der Tiingo-Historie die Quelle. Ein Fixing
um 16:00 MEZ und ein Tagesschluss sind nicht dasselbe — die Frage ist
nicht *ob* sie abweichen, sondern *um wie viel*.
`build-fx-history-ecb.mjs` misst es auf der Ueberlappung und meldet
Median, p95 und Maximum je Paar.

---

## 4c. Die Lizenzfrage ist beantwortbar — und die Antwort ist ein Blocker (O-11)

Die vier Stufen aus O-11, gegen die vorhandene Evidenz geprueft:

| | | |
|---|---|---|
| **A** interne Berechnung | **erlaubt** | `DEFAULT_POLICY.internalUseAllowed` |
| **B** Speicherung / Caching | **erlaubt** | Arbeitsablage, nicht ausgeliefert |
| **C** Anzeige abgeleiteter EUR-Werte | **NICHT erlaubt** | ← die offene Frage |
| **D** Weitergabe roher FX-Reihen | nicht erlaubt | wird auch nicht gebraucht |

Die Freigabe des Eigentuemers vom 2026-09-13 ist als
`marketData`/`intraday`/`realtime` eingetragen und nennt die
„Market-Data". FX ist bei diesem Anbieter ein eigenes Produkt. Dieselbe
Datei sagt: *„Der Vertragstext liegt dem Repository nicht vor; es wurde
keine eigene Rechtspruefung vorgenommen."*

`fx` ist deshalb jetzt eine **eigene Datenklasse** in
`display-policy.js`. Waere es ein Unterfall von `marketData`, wuerde die
bestehende Aktienfreigabe die EUR-Anzeige stillschweigend mitfreigeben —
eine Erlaubnis, die niemand erteilt hat.

### Die Erlaubnis haengt am einzelnen Wert

```
EUR-Wert aus EZB-Kurs (2018)   publicDisplayAllowed: true   + Quellennennung
EUR-Wert aus Tiingo-Kurs (2026) publicDisplayAllowed: false
```

Ungewohnt, und richtig. Die Alternative ist eine globale Sperre, die
entweder die ganze EUR-Anzeige abschaltet oder die Lizenzfrage ignoriert.

Die exakte Vertragsfrage steht maschinenlesbar in
`quant/config/fx-license.json` und ist ueber `Providers.escalation()`
abrufbar — ein Produkt, das eine Sperre meldet, soll den Grund
mitliefern koennen.

---

## 4d. Intraday-FX als zentraler Zustand (O-9)

Die Tagesreihen sind nach Kalendertag geschluesselt. Sechs Intraday-Bars
desselben Tages fielen darin auf **einen** Punkt zusammen.

Deshalb ein zweiter, kleiner Speicher: je Paar **ein** Stand mit vollem
Zeitstempel (`ingestCurrent`), den nur `latest()` liest. Eine historische
Abfrage sieht ihn nie — der Kurs von jetzt hat in der Umrechnung eines
Bilanzwertes von 2021 nichts zu suchen.

Ein Stand wird nur von einem **juengeren** ersetzt; ein verspaetet
eintreffender aelterer Tick darf keinen Ruecksprung erzeugen.

**Gemessen: 12 Anfragen bedienen 11.428 Titel — 952 Titel je Anfrage.**

### Die Degradationsleiter

| FX im Store | Zustand | „Realtime EUR"? |
|---|---|---|
| Tagesschluss | CURRENT | **nein** |
| Intraday, 10 Min | CURRENT | **ja** |
| Intraday, 90 Min | STALE | nein, sichtbar |
| Intraday, 5 Std | STALE | nein, sichtbar |
| kein Kurs | UNAVAILABLE | nein, native Waehrung |

`available: "C"` / `recommended: "A"` — Stufe C bleibt verfuegbar,
gefahren wird A.

---

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

## 14. Regression Guard und Debt Register (O-6, O-12)

### Der Guard

`scripts/quality/assert-no-local-fx.mjs`, drei Befundarten, zwei
Haertegrade: FX-Arithmetik ausserhalb des Core bricht ab (negativ
geprueft); verdaechtige Konstanten und fest verdrahtete Darstellung
werden gezaehlt und gegen eine Grundlinie gehalten.

### Die 68 waren nie 68

Guard und Register hatten je eine eigene Kopie der Muster — derselbe
Fehler, den `price-semantics.js` fuer die Bereinigungsstufen behoben hat.
Beim Zusammenlegen fielen zwei Fehlerquellen auf: eine Regel traf **jedes
Template-Literal**, und ohne Blockzustand zaehlte ein Kommentarende als
Code. **38 der 68 waren Fehlalarme. Es sind 30.**

### Die Migration (O-12)

Registerstand 2026-09-22, 30 Stellen in 15 Dateien:

| Klasse | Anzahl | Bedeutung |
|---|---|---|
| **F** `MIGRATED_FALLBACK` | 18 | migriert; Zeile greift nur ohne geladenen Core |
| **A** `MONETARY_DISPLAY` | 4 | offen — siehe **O-16** |
| **B** `PERCENTAGE_OR_RATIO` | 4 | darf nie konvertieren |
| **C** `STATIC_COPY` | 3 | Schwellenwert im Methodiktext, im Code markiert |
| `UNCLASSIFIED` | 1 | von Hand ansehen |

Eine migrierte Stelle hinterlaesst oft mehr als eine Zeile der Klasse F:
die Bruecke `vuFormat()` und der beibehaltene Rueckfall zaehlen beide.
Deshalb stehen 18 F-Zeilen fuer 13 migrierte Darstellungsstellen in
sechs Dateien.

Migriert: `discover/ui/{surfaces,detail-fundamentals,cards,detail}.js`,
`dashboard/app.js`, `hedgefonds/index.html`. Die FX-Engines sind in
`discover/index.html` und `discover-v2/index.html` eingebunden.

**Das Aussehen aendert sich nicht.** Das war die eigentliche Arbeit.
Discover zeigt deutsche Zahlen mit Dollarzeichen (`154,72 $`), die
Hedgefonds-Seite amerikanische mit gekuerzten Nullen (`$3.4T`). Beides
reproduziert der zentrale Formatter jetzt Zeichen fuer Zeichen — dafuer
kamen `numberLocale` und `trimZeros` dazu. Zwei Tests vergleichen gegen
die alte Form, die darin **kopiert und nicht importiert** steht:
importiert wuerde sie bei einer Aenderung stillschweigend mitwandern und
nichts mehr festhalten.

**Eine beabsichtigte Abweichung, und sie ist eine Korrektur.** Der alte
Discover-Formatter kannte keine Billionenstufe: 3,42 Bio. erschien als
`3420,0 Mrd. $` — genau die unleserliche Form, die §52 untersagt. Jetzt
`3,4 Bio. $`. Das betrifft die groessten Titel des Universums und ist
sichtbar.

**Ein echter Fehler, gefunden beim Abgleich.** Die Hedgefonds-Seite
schrieb `-$7.3B`, mein Formatter `$-7.3B`. Das Minus gehoert vor das
Waehrungszeichen. Aufgefallen ist es nur, weil die zu ersetzende Funktion
es richtig machte.

### Nicht migriert, und warum

Drei Stellen sind Schwellenwerte im Methodiktext („Margen erst ab 50
Mio. $ Umsatz"). Sie tragen jetzt einen Marker **im Code**:

```js
/* vu-currency: C - Schwellenwert im Methodiktext, kein angezeigter Betrag */
```

Der Marker ist zugleich die von O-6 verlangte Dokumentation und das, was
der Zaehler liest. Eine Stelle stillschweigend von der Liste zu nehmen
waere die Alternative, und sie hinterliesse keine Spur.

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

### Paarabdeckung: gefuehrt ist nicht dasselbe wie bedient

`pair-availability.json` (committet, enthaelt keine Kurse) haelt zwei
verschiedene Zahlen auseinander, und die Verwechslung war ein echter
Fehler:

* **Geholt**: 40 Paare. Was der Anbieter direkt fuehrt.
* **Aufloesbar**: **52 von 62 gebrauchten Richtungen** — was die Engine
  daraus bilden kann.

| Aufloesung | Richtungen |
|---|---|
| `INVERSE` (1/rate, exakte Identitaet) | 34 |
| `TRIANGULATED` (ueber USD, beide Beine am selben Tag) | 11 |
| `DIRECT` | 7 |
| **`NONE`** | **10** |

Ohne jede Abdeckung bleiben **5 Waehrungen** (AFN, KZT, MOP, MYR, VND)
und **16 Titel** — das ist der Stand **vor** dem EZB-Fallback; die
Nachpruefung dazu steht weiter unten.

Die erste Fassung meldete nur die erste Zahl und kam auf „21 Richtungen
nicht gefuehrt, 212 Titel betroffen". Sie fuehrte CNY/EUR als „nicht
gefuehrt", mit **124 betroffenen Titeln** und dem Zusatz „bleiben in der
Originalwaehrung". Im selben Lauf rechnete Alibaba korrekt in Euro:
`USD/CNY` liegt mit 2.030 Zeilen im Store, und `fx-rates.js` bildet
`CNY/EUR` daraus ueber USD.

Die richtige Zahl ist **10 Richtungen und 16 Titel** — eine
Groessenordnung kleiner.

> Ein Bericht, der 124 Titel als nicht umrechenbar ausweist, waehrend sie
> umgerechnet werden, laedt zu genau der Entscheidung ein, die O-2
> vermeiden soll: eine zweite Datenquelle fuer ein Problem, das es nicht
> gibt.

Gefragt wird jetzt die Engine selbst — nach dem Import wird jede
gebrauchte Richtung mit `rateAt()` abgefragt und ihre Aufloesungsart
gemeldet. Nur `NONE` heisst, dass die Werte nativ bleiben.

### Historische Abdeckung: je Horizont, nach Titeln gewichtet

Ein Mittelwert ueber 31 Waehrungen sagt nichts: eine Waehrung mit einem
Titel und eine mit 10.790 sind nicht gleich wichtig. `HISTORICAL_FX_COVERAGE`
misst deshalb je Horizont den Anteil der **Titel**, fuer die zum
Stichtag ein Kurs existiert — nicht den Anteil der Waehrungen.

| Horizont | Stichtag | Titel abgedeckt | Quote | Quellen |
|---|---|---|---|---|
| 1J | 2025-09-22 | 11.197 / 11.202 | **99,96 %** | 18 Tiingo, 8 EZB |
| 5J | 2021-09-22 | 11.198 / 11.202 | **99,96 %** | 19 Tiingo, 8 EZB |
| 10J | 2016-09-22 | 11.169 / 11.202 | **99,71 %** | 22 EZB |
| 15J | 2011-09-22 | 11.169 / 11.202 | **99,71 %** | 22 EZB |
| MAX | 1990-01-05 | 0 / 11.202 | 0 % | keine |

Schwelle 99 %, Ergebnis **PASS**.

Zwei Dinge liest man an dieser Tabelle ab. **10J und 15J stammen
vollstaendig aus der EZB** — genau der Bereich, fuer den O-7 die zweite
Quelle verlangt hat; ohne sie waere dort nichts umrechenbar gewesen.
Und **MAX ist aus einem bekannten Grund null**: die Kursreihen beginnen
1990-01-05, jede FX-Quelle fruehestens 1999-01-04. Der Layer verweigert
die Punkte davor mit `beforeSeriesStart`, statt sie zu naehern. Ein
Gate, das aus einem bekannten und richtigen Grund immer rot waere,
beurteilt nichts — MAX wird gemessen und berichtet, aber nicht
bewertet. Was daraus fuer das Produkt folgt, ist **O-15**.

Der laengste EUR-Chart beginnt deshalb fuer die Hauptwaehrung USD
(10.790 Titel) am **1999-01-04**.

### Die Nachpruefung nach dem Fallback (O-13)

O-13 verlangt ausdruecklich, nach der Integration der offiziellen
historischen Quelle erneut zu messen, wie viele der 16 Titel tatsaechlich
unaufloesbar bleiben. Gemessen gegen `historical-coverage.json`
(2026-09-22):

> **5 Titel in 5 Waehrungen** — AFN, KZT, MOP, RUB, VND, je ein Titel.

Die EZB deckt acht Waehrungen neu ab, die Tiingo im 5-Jahres-Horizont
nicht traegt: **CNY (124 Titel)**, BRL (26), HKD (19), KRW (9), INR (6),
MYR (4), IDR (1), PHP (1) — zusammen **190 Titel**.

**RUB ist der lehrreiche Fall.** Die Waehrung ist historisch abgedeckt
und aktuell nicht:

| Horizont | Zustand |
|---|---|
| 1J (2025-09-22) | `pairNotStored` |
| 5J (2021-09-22) | `tiingo`, PRIMARY, `INVERSE`, `DAILY_AT_DATE` |
| 10J (2016-09-22) | `ecb`, FALLBACK, `INVERSE`, `DAILY_AT_DATE` |
| 15J (2011-09-22) | `ecb`, FALLBACK, `INVERSE`, `DAILY_AT_DATE` |

`eurChartStart: 2005-04-01` — die EZB hat die Veroeffentlichung des
Rubel-Referenzkurses eingestellt. Ein Chart in Euro ist bis zum Ende der
Reihe richtig und bricht danach ab; er wird nicht mit dem letzten
bekannten Kurs fortgeschrieben (§39, O-7 VERBOTEN).

> Die naheliegende Annahme — „was historisch geht, geht heute erst
> recht" — ist hier falsch. Deshalb misst der Bericht je Horizont und
> nicht einmal global.

Fuer alle fuenf gilt O-13 unveraendert: `conversionAvailable: false`, der
native Wert und seine Waehrung bleiben sichtbar, der Titel bleibt im
Company Master und im Vision Universe. Geschaetzt wird nichts.

**Die Tiefe ist je Paar verschieden, nicht global.** Die Hauptpaare
reichen bis zum gemessenen Beginn 2020-03-30, andere beginnen spaeter:
CAD/USD ab 2022-02-10, HKD/EUR ab 2022-01-10, SGD/EUR ab 2021-02-08. Die
Karte fuehrt `first` und `last` je Paar.

### Realtime: was gemessen ist und was aussteht

Die Kette zerfaellt in zwei Nachweise, und nur einer haengt an der New
Yorker Boerse.

**`RT1` Realtime-Kette gegen den produktiven FX-Stand — bestanden.**
Drei echte Titel, echte native Waehrung, echter FX-Stand, ein FX-Abruf
fuer alle drei. Jede Umrechnung von Hand gegengerechnet:

| Titel | nativ | FX-Stand | EUR |
|---|---|---|---|
| AAPL | 326,57 USD | 2026-09-21 (DAILY) | 278,50 € |
| NVDA | 218,36 USD | 2026-09-21 (DAILY) | 186,22 € |
| MSFT | 492,44 USD | 2026-09-21 (DAILY) | 419,95 € |

Und der Befund, auf den es ankommt:

> `realtimeClaimAllowed: false` — **mit einem TAGESKURS ist „Realtime EUR"
> nicht zulaessig.** Der Aktienkurs waere realtime, die Umrechnung ist es
> nicht, und das Produkt daraus erst recht nicht (§53).

Das ist kein Mangel des Layers, sondern seine Aufgabe. Und es ist
behebbar: `fxIntraday` und `fxRealtime` sind beide **gemessen vorhanden**.
Ein Intraday-FX-Ingest wuerde die Zusage tragen — siehe **O-9**.

**`RT2` Realtime am offenen US-Markt — NOT_PROVEN.** Der Lauf fiel auf
07:11 UTC; die regulaere Sitzung laeuft 13:30–20:00 UTC. §58: nicht
kuenstlich als PASS melden.

### Weitere Grenzen, die der Nachweis offenlegt

| Fall | Zustand | Grund |
|---|---|---|
| TM/BABA Free Cash Flow FY2020 | **aufgeloest** (Lauf 12, 2026-09-22) | vor O-7: `insufficientPeriodCoverage`, weil die Periode 2019-04 bis 2020-03 fast vollstaendig vor dem Beginn der Tiingo-Historie (2020-02-29) lag — korrekt verweigert statt genaehert. Mit der EZB-Historie rechnet dieselbe Periode jetzt aus **256 Beobachtungen**: TM 990,664 Mrd. JPY → **8,21 Mrd. €**, BABA 155,945 Mrd. CNY → **20,14 Mrd. €**, beide `PERIOD_AVERAGE`. |
| Richtungen mit `resolution: NONE` | keine Aufloesung | weder direkt noch invers noch ueber das Pivot bildbar; nur diese Werte bleiben nativ |

### Der Fallback allein traegt den Nachweis

Lauf 12 (2026-09-22) lief ohne Anbieterabruf: EZB-Reihen, kein Tiingo,
kein Intraday-Stand. Das war kein geplanter Versuch, sondern die Folge
der Marker-Korrektur weiter unten — und es hat eine Frage beantwortet,
die sonst offen geblieben waere.

> **`FX_DATA_PROOF = PASS`, FX-Quelle `PRODUCTION`** — „Regeln belegt UND
> mit qualifizierten FX-Kursen gerechnet", allein aus der EZB.

Damit ist O-7 nicht nur theoretisch erfuellt: die Fallback-Quelle traegt
denselben Nachweis wie die Primaerquelle, ueber alle neun Titel, sechs
Berichtswaehrungen und fuenf Kennzahlen. Zwei Faelle, die vorher
verweigert wurden, rechnen jetzt — siehe die Tabelle darunter.

**Und ein Befund, der ohne diesen Lauf nicht sichtbar gewesen waere.**
Derselbe AAPL-Kurs, derselbe Tag, zwei Quellen:

| Quelle | FX-Stand | 326,57 USD ergeben |
|---|---|---|
| Tiingo (PRIMARY) | 2026-09-21, `DIRECT` | **278,50 €** |
| EZB (FALLBACK) | 2026-09-21, `INVERSE` | **284,22 €** |

Das sind **2,06 %** Unterschied, 5,72 € auf einen Titel. Die
Nahtanalyse ueber 1.659 Ueberlappungstage nennt fuer EUR/USD einen
Median von 0,18 %, ein p95 von 0,74 % und ein Maximum von 2,39 % — der
aktuelle Tag liegt also oberhalb des 95. Perzentils, aber innerhalb des
Gemessenen. Ursache ist die Definition, nicht ein Fehler: die EZB fixiert
um 16:00 MEZ, der Anbieter liefert den Tagesschluss.

> Welche Quelle den Kurs stellt, aendert den angezeigten Euro-Betrag
> sichtbar. Deterministisch ist es, weil die Rangfolge fest ist und jeder
> Wert seine Quelle nennt. Ob der Sprung an der Naht dem Nutzer gezeigt
> werden muss, ist **O-14** — und diese Zahl macht die Frage konkret.

### Ein Schalter, den seine eigene Beschreibung umlegt

Die teuren Schritte haengen an Markern in der Commit-Nachricht:
`[fx-probe]` misst die Anbieterfaehigkeiten, `[fx-ingest]` holt die
Historie. Beide wurden mit `contains()` ueber die **ganze** Nachricht
geprueft.

Am 2026-09-22 loeste ein Commit, dessen Text die Marker nur *erwaehnte*
(„Ohne `[fx-ingest]` fiel der Lauf auf die Testreihe zurueck"), einen
vollstaendigen Anbieterabruf ueber 40 Paare aus. Niemand hatte ihn
gewollt.

> Ein Schalter, den die Beschreibung des Schalters umlegt, ist kaputt —
> und er ist genau dann kaputt, wenn man sorgfaeltig dokumentiert,
> warum man ihn nicht benutzt.

Die Marker werden jetzt in einem vorgelagerten Job aus der
**Betreffzeile** gelesen und als Job-Ausgaben weitergereicht;
`currency-realtime-proof.yml` (`[rt-proof]`) ebenso. Dazu kam ein
dritter Marker `[fx-verify]`: nachrechnen, ohne beim Anbieter
einzukaufen — die EZB ist oeffentlich, die Berichte liegen im Zweig,
der Contract ist Code.

Damit ein solcher Lauf nichts verschlechtert, veroeffentlicht und
beurteilt er die historische Abdeckung **nicht**: gemessen wuerde der
Fallback allein, und die kleinere Zahl ersetzte im Zweig die groessere,
auf die dieses Dokument zeigt.

**Was der Lauf trotzdem belegt hat:** er hat die Abdeckungszahlen
unveraendert reproduziert — dieselben Quoten, dieselben fehlenden
Waehrungen, nur ein neuer Zeitstempel.

> Derselbe Aufbau (`contains()` ueber die ganze Nachricht) steckt in rund
> einem Dutzend weiterer Workflows dieses Repositories. Sie gehoeren
> nicht zu diesem Workstream und wurden hier **nicht** angefasst.

### Tests

**60 Tests, alle gruen.**

| Gruppe | Was sie haelt |
|---|---|
| M1–M12 | die zwoelf Faelle aus §59 |
| I1–I16 | die Invarianten (Originaldaten, Look-Ahead, Margen, ehrliche Anzeige) |
| O5-1 … O5-6 | Devisenkalender 24/5, Wochenende vs. Luecke, Anbieterausfall in drei Stufen, 500 Ticks auf einen FX-Abruf, verfuegbare vs. gefahrene Stufe |
| C1, C2 | Abdeckung gegen Triangulation |
| P1–P4 | Anbieterrang, Herkunft je Wert, beide Pivots |
| L1–L3 | Lizenzerlaubnis je Wert |
| O9-1 … O9-3 | der zentrale Intraday-Zustand |
| SW1–SW4 | der EUR\|USD-Umschalter |
| M12-1 … M12-5 | die Migration: byte-gleiche Ausgabe, Vorzeichen, keine eigene FX-Logik, Ladereihenfolge der Seiten |

`M12-5` ist der juengste und deckt eine Luecke, die kein anderer Test
sah: die Module bauen aufeinander auf, und eine falsche Ladereihenfolge
faellt nicht beim Laden auf, sondern erst, wenn ein Produkt den Contract
benutzt. Derselbe Test haelt fest, dass die Hedgefonds-Seite nur die
Formatierung laedt und die Engine **nicht** — sie rechnet nichts um, und
das soll so bleiben.

Die fuenf roten Tests der Gesamtsuite bestehen **unveraendert auch ohne
diesen Zweig** — mit `git stash` gegengeprueft. Sie gehoeren nicht zu
diesem Workstream und werden hier nicht repariert.

---

## 17. Merge Gate

| Kriterium | Zustand |
|---|---|
| `TIINGO_FX_CAPABILITIES` | **MEASURED** |
| `HISTORICAL_FX_COVERAGE` | **PASS** — 1J/5J 99,96 %, 10J/15J 99,71 % (Schwelle 99 %); MAX berichtet, nicht beurteilt |
| `FX_PROVIDER_PRIORITY` | **PASS** — deterministisch, je Wert belegt |
| `FX_DATA_PROOF` | **PASS** |
| `CURRENCY_CONTRACT` | **PASS** (60 Tests) |
| `INTRADAY_FX_STATE` | **PASS** — 952 Titel je Anfrage |
| `FX_FRESHNESS` | **PASS** |
| `EUR_USD_SWITCH_CONTRACT` | **PASS** (SW1–SW4) |
| `UNKNOWN_CURRENCY_HANDLING` | **PASS** — 94,9 % belegt; nach dem Fallback bleiben 5 Titel unaufloesbar, alle mit `conversionAvailable: false` |
| `CURRENCY_DEBT_MIGRATION` | **PASS** — 13 migriert, Aussehen unveraendert |
| `REGRESSION_GUARD` | **PASS** |
| `NEW_REGRESSIONS` | **0** |
| `PAID_SERVICES_ENABLED` | **0** |
| `REALTIME_FX` | **MARKET_CLOSED_NOT_PROVEN** |

**Nicht gemergt** — das entscheidet der Owner.

### `REALTIME_FX`: der Zeitplan allein holt es nicht nach

`currency-realtime-proof.yml` traegt einen Zeitplan (15:00 und 18:00 UTC
an Werktagen, beide Zeiten in der regulaeren Sitzung, Sommer wie
Winter). **Der Zeitplan feuert nicht.**

GitHub Actions fuehrt `schedule`-Ausloeser ausschliesslich aus dem
Standardzweig aus. Der Workflow liegt auf `claude/vu-currency-fx-layer-elrkpp`
und nicht auf `main` — gegengeprueft. Solange nicht gemergt ist, laeuft
der Zeitplan also nie.

> Das ist eine Henne-Ei-Lage und sie gehoert benannt: O-8 verlangt den
> Nachweis am offenen Markt **vor** dem Merge, der Zeitplan liefert ihn
> erst **nach** dem Merge.

Aufgeloest wird sie ueber den zweiten Ausloeser: ein Push mit
`[rt-proof]` in der **Betreffzeile** waehrend der offenen US-Sitzung
(13:30–20:00 UTC). Der laeuft auf dem Zweig. Genau so wird der Nachweis
gefuehrt; bis dahin bleibt `REALTIME_FX = MARKET_CLOSED_NOT_PROVEN` und
wird nicht beschoenigt (§58).

---

## 18. Der eine Punkt, der eine Owner-Entscheidung braucht

**Die FX-Lizenzfrage (O-11 C).** Solange sie offen ist, tragen alle aus
Tiingo-Kursen abgeleiteten EUR-Werte `publicDisplayAllowed: false`. Der
Layer rechnet und speichert weiter — nur die oeffentliche Anzeige ist
gesperrt.

> **Die exakte Frage:** Umfasst die am 2026-09-13 erklaerte
> Tiingo-Freigabe („das entsprechend freigegebene grosse Paket" fuer die
> oeffentliche Anzeige der Market-Data) auch das FX-/Forex-Produkt —
> getrennt nach (a) interner Berechnung, (b) Speicherung/Caching,
> (c) oeffentlicher Anzeige **abgeleiteter** Werte, (d) Weitergabe
> **roher** FX-Zeitreihen?

Sie steht maschinenlesbar in `quant/config/fx-license.json`.

**Was ohne diese Antwort trotzdem geht:** EUR-Werte, deren Kurs von der
EZB stammt, sind freigegeben (Quellennennung erfolgt) — also die ganze
Historie vor 2020-02-29 und jede Waehrung, die Tiingo nicht fuehrt.

### Nachrangig

| # | Frage |
|---|---|
| **O-14** | Die Naht zwischen EZB-Fixing und Tiingo-Schluss. Gemessen ueber 1.659 Ueberlappungstage (EUR/USD): Median 0,18 %, p95 0,74 %, Maximum 2,39 %; am 2026-09-21 trennten die beiden Quellen **2,06 %**, also 5,72 € auf einen AAPL-Anteil. Ab welcher Groesse soll der Sprung sichtbar gemacht werden? |
| **O-15** | Ein MAX-Chart in EUR beginnt spaeter als in der Originalwaehrung (Kurse ab 1990, FX ab 1999). Begrenzen, hinweisen oder auf USD verweisen? |
| **O-16** | Die **4** verbliebenen Klasse-A-Stellen (Register-Stand 2026-09-22, `openClassA: 4`). Zwei sind Archivseiten unter `morning/` (2026-09-05, 2026-09-08), die niemand mehr anfasst: migrieren oder ausnehmen? `vu2/experience.js:83` ist eine echte Consumer-Stelle und waere eine gewoehnliche Migration. `quant/api/portfolio-workspace.js:16` ist **keine** Formatierung, sondern ein Bewertungs-Gate (`price.unit === 'USD'`): es verweigert Positionen in Fremdwaehrung, statt sie anzunehmen — ehrlich im Sinne von O-13. Sie zu migrieren hiesse, die Depotbewertung in Fremdwaehrung zu **ermoeglichen**; das ist eine Produktentscheidung, keine Migration. |
| **O-17** | Bestaetigung der EZB-Bedingungen (Wiedergabe unter Quellennennung). Blockiert nichts, weil die Nennung ohnehin erfolgt. |
