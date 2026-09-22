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

## 4. Der Zustand der Tiingo-FX-Faehigkeiten: UNBEKANNT

Der Owner geht davon aus, dass der bestehende Vertrag FX umfasst. **Das wurde
nicht bestaetigt und nicht widerlegt.** In dieser Session lag kein
`TIINGO_API_KEY` vor; es wurde kein Endpunkt befragt.

Stand in `quant/engines/fx/fx-capability.js` und
`quant/data/market/capabilities/tiingo-fx-probe.json`:

| Faehigkeit | Zustand |
|---|---|
| `fxCurrent` | `null` — ungeprueft |
| `fxDaily` | `null` — ungeprueft |
| `fxHistoricalDaily` | `null` — ungeprueft |
| `fxIntraday` | `null` — ungeprueft |
| `fxRealtime` | `null` — ungeprueft |
| `fxWebsocket` | `null` — ungeprueft |
| `fxCrossPairs` | `null` — ungeprueft |
| `fxBulkQuotes` | `null` — ungeprueft |

Ein bestehender Vertrag ist keine Messung. `scripts/market/probe-tiingo-fx.mjs`
hebt diese Werte, sobald ein Schluessel vorliegt — und zwar aus dem, was
geantwortet hat, nicht aus dem, was auf einer Tarifseite steht.

**Folge fuer das Produkt heute:** der Layer liefert `UNAVAILABLE`, die
Produkte zeigen die native Waehrung. Nicht 1:1 umgerechnet, nicht mit
Eurozeichen an einer Dollarzahl.

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

## 12. Regression Guard

`scripts/quality/assert-no-local-fx.mjs`, drei Befundarten, zwei Haertegrade:

1. **FX-Arithmetik ausserhalb von `quant/engines/fx/`** → Abbruch.
   `usdToEur()`, `exchangeRate = …`, `wechselkurs = …`.
   Negativ geprueft: eine eingefuegte Verletzung wird gefunden, ihre
   Entfernung macht den Lauf wieder gruen.
2. **Verdaechtige Konstanten** → gezaehlt, Grundlinie 2.
   Bewusst kein Abbruch: `close * 1.015` in `dashboard/app.js:24` ist eine
   Szenariogrenze von anderthalb Prozent, formatiert mit `usd()`. Jedes
   Merkmal einer FX-Umrechnung, und trotzdem keine. Ein Guard mit zwei
   Fehlalarmen je Lauf wird uebergangen und schuetzt dann nichts mehr.
3. **Fest verdrahtete Waehrungssymbole** → gezaehlt, Grundlinie 68 in 20
   Dateien. Darf sinken, nicht steigen.

---

## 13. Was NICHT gemacht wurde

| | Grund |
|---|---|
| Discover 1.0 / 2.1 redesignt | §28, §48 — Discover 2.1 ist ein paralleler Workstream |
| Eine zweite FX-Datenquelle angebunden | §6, §38 — braucht Owner-Entscheidung, nicht Bequemlichkeit |
| Eine kostenpflichtige Tiingo-Funktion aktiviert | §5 — nichts am Tarif geaendert |
| Quant-Faktoren auf EUR umgestellt | §25, §50 — EUR ist keine neue Quant-Methodik |
| Kanonische USD-Werte ueberschrieben | §3 — der Layer ist additiv |
| Realtime-Transport angefasst | §11, §37 — der bestehende Pfad bleibt kanonisch |
| FX-Historie je Aktie gespeichert | §8 — Paar-Zeitreihen zentral, nicht dupliziert |

---

## 14. Nachweisstand

`node scripts/quality/verify-currency-layer.mjs`

**Befund: `PASS_RULES_ONLY`**

Belegt an **echten Daten**: Kursreihen (Tiingo, AAPL/NVDA/MSFT, 1990–2026),
Fundamentals (SEC, echte Geschaeftsjahre, echte Wochenendstichtage),
Berichtswaehrungen (5.069 Datensaetze).

**Nicht belegt:** die Wechselkurse selbst. Solange
`quant/data/market/fx/` leer ist, rechnet der Nachweis mit der Testreihe
(`source: "fixture"`, sichtbar bis in den Money-Vertrag). Der Befund heisst
deshalb `PASS_RULES_ONLY` und nicht `PASS` — ein gruener Haken, der zwei
verschiedene Dinge bedeuten kann, ist kein gruener Haken.

`RT1` (Realtime am offenen Markt) steht auf `NOT_PROVEN`: kein laufender
Stream, keine gemessene offene US-Sitzung. Der Pfad ist gegen den Store
geprueft (I10–I12), der Nachweis am offenen Markt steht aus.

### Testmatrix: 33 Tests, alle gruen

M1–M12 sind die zwoelf Faelle aus §59; I1–I16 die Invarianten
(Originaldaten unveraendert, kein Look-Ahead, Margen invariant, ehrlicher
Rueckfall, Vertrag und Engine deckungsgleich).

---

## 15. Owner-Entscheidungen

| # | Frage | Warum sie offen ist |
|---|---|---|
| **O-1** | Tiingo-FX freischalten und `probe-tiingo-fx.mjs` mit Schluessel laufen lassen? | Ohne Messung bleibt jede FX-Faehigkeit `null`, und der Layer liefert `UNAVAILABLE`. Das ist der einzige Schritt, der `PASS_RULES_ONLY` zu `PASS` macht. |
| **O-2** | Wenn Tiingo FX nicht abdeckt: offizielle Referenzquelle (z. B. EZB-Referenzkurse)? | §6/§38 verbieten eine zweite Quelle aus Komfort. Eine belegte Luecke waere ein anderer Fall — die Entscheidung bleibt beim Owner. |
| **O-3** | Welche der 28 Berichtswaehrungen sollen FX-Paare bekommen? | 400 Unternehmen berichten nicht in USD. Heute liegt fuer **keine** Fremdwaehrung ein Paar vor; ihre monetaeren Werte bleiben in der Originalwaehrung. CNY, CAD, EUR, GBP, BRL decken den Grossteil. |
| **O-4** | 854 SEC-Datensaetze ohne Waehrungsangabe — nachziehen oder als „nicht umrechenbar" belassen? | Sie werden heute korrekt nicht umgerechnet. Ob die Angabe nachgezogen werden soll, ist eine Frage an die SEC-Pipeline, nicht an den Currency Layer. |
| **O-5** | Realtime-Stufe A beibehalten oder B/C pruefen? | A ist die Vorgabe und kostet einen FX-Abruf je Minute. B und C brauchen einen gemessenen Consumer-Nutzen. |
| **O-6** | Die 68 fest verdrahteten Waehrungsstellen abbauen — in welchem Workstream? | Discover 2.1 laeuft parallel (§48). Der Guard haelt den Stand; der Abbau gehoert in den Workstream, der die Oberflaeche ohnehin anfasst. |

---

## 16. Naechste Schritte

**Phase A (fertig)** FX Capability + Store
**Phase B (fertig)** Currency Engine
**Phase C (fertig)** Product Contracts
**Phase D (teilweise)** Proof an Golden Titles — Regeln belegt, Kurse offen (O-1)

Danach, nicht vorher:
* Anbindung Discover 1.0 / 2.1 (nur Contract konsumieren, keine eigene Logik)
* Screener: `canonical calculation value` vs. `display value` trennen
* Waehrungseffekt in der Oberflaeche (Vertrag traegt ihn bereits)
