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

## 4c. Die Lizenzfrage: geprueft, benannt, kein Stopp (O-11)

Die fuenf Stufen aus O-11, gegen die im Repository vorhandene Evidenz
geprueft:

| | | Befund | Grundlage |
|---|---|---|---|
| **A** | interne Nutzung von FX-Daten | **gedeckt** | `internalUseAllowed` ist der Standard |
| **B** | serverseitiges Caching | **gedeckt** | Arbeitsablage, nicht ausgeliefert |
| **C** | Berechnung abgeleiteter EUR-Werte | **nicht eindeutig** | ← gebraucht |
| **D** | oeffentliche Anzeige abgeleiteter Werte | **nicht eindeutig** | ← gebraucht, setzt C voraus |
| **E** | Redistribution roher FX-Reihen | **wird nicht gebraucht** | Erlaubnisliste im Workflow schliesst es aus |

### Was im Repository tatsaechlich liegt

Gesucht wurde in `development-preview.json`, `provider-profiles.json`,
`tiingo-scale.json` und den `providers/*/README.md`.

> **Ein Tiingo-Vertragstext liegt nicht vor.** Es gibt keine Lizenzdatei.

Die einzige Grundlage ist die Erklaerung des Eigentuemers vom
2026-09-13, eingetragen als `marketData`/`intraday`/`realtime`. Sie
nennt die „Market-Data"; FX ist bei diesem Anbieter ein eigenes Produkt.
Dieselbe Datei vermerkt: *„Der Vertragstext liegt dem Repository nicht
vor; es wurde keine eigene Rechtspruefung vorgenommen."*

Daraus wird **keine** weitergehende Auslegung gemacht.

```
LICENSE_DISPLAY_DERIVED_FX = OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT
```

**Der Owner hat am 2026-09-22 entschieden.** Fuer die Development-/
Preview-Phase wird das Risiko bewusst getragen; Vision Universe wird
derzeit nicht kommerziell vermarktet. Was das **nicht** heisst, steht
maschinenlesbar daneben und wird von `O11-1` geprueft:

| Feld | Wert |
|---|---|
| `licenseConfirmed` | **false** |
| `commercialRedistributionApproved` | **false** |
| `preCommercialLicenseConfirmationRequired` | **true** |
| `blocksCommercialLaunch` | **true** |
| `publicRawDisplayAllowed` (tiingo) | **false** |

> Eine akzeptierte Unsicherheit ist keine Lizenzauskunft. Wer das
> spaeter verwechselt, verwechselt es teuer - deshalb steht der
> Unterschied im Code und nicht nur in diesem Dokument.

**Die exakte Frage an Tiingo**, maschinenlesbar in
`quant/config/fx-license.json#licenseGate.questionForTiingo` und ueber
`Providers.escalation()` abrufbar:

> „Duerfen Tiingo-FX-Daten serverseitig zur Berechnung abgeleiteter
> EUR-Aktienkurse und EUR-Fundamentalwerte verwendet und diese
> abgeleiteten Werte oeffentlich im Vision-Universe-Produkt angezeigt
> werden, ohne die rohe FX-Zeitreihe zu redistribuieren?"

### Es haelt den technischen Workstream nicht an

`blocksTechnicalWork: false`, `blocksPublicActivation: true`. Der Layer
rechnet und speichert weiter; gesperrt ist die oeffentliche Anzeige
Tiingo-basierter EUR-Werte.

**Und seit O-14 ist das sehr viel weniger.** Die kanonische historische
Quelle ist die EZB, deren Bedingungen geklaert sind — die gesamte
historische EUR-Anzeige ist damit freigegeben. Offen ist nur noch der
**aktuelle** EUR-Wert.

`fx` ist eine **eigene Datenklasse** in `display-policy.js`. Waere es
ein Unterfall von `marketData`, wuerde die bestehende Aktienfreigabe die
EUR-Anzeige stillschweigend mitfreigeben — eine Erlaubnis, die niemand
erteilt hat.

### Die Erlaubnis haengt am einzelnen Wert

```
EUR-Kurs von 2018  (ecb)     publicDisplayAllowed: true   + Quellennennung
EUR-Kurs von heute (tiingo)  publicDisplayAllowed: false
```

Ungewohnt, und richtig. Die Alternative ist eine globale Sperre, die
entweder die ganze EUR-Anzeige abschaltet oder die Lizenzfrage ignoriert.

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

## 4e. Die Naht: Ursache gesucht, nicht verdeckt (O-14)

Zwei Kurse fuer denselben Kalendertag, 2,06 Prozent auseinander. Der
Owner-Entscheid verlangt zu Recht, dass diese Zahl nicht durch die
Anbieterrangfolge unsichtbar gemacht wird, sondern eine Ursache bekommt.

### Die Frage ist nicht, welche Zahl stimmt

Sie lautet: beschreiben die beiden ueberhaupt denselben oekonomischen
Zeitpunkt? Wenn nicht, ist die Differenz kein Datenfehler, sondern die
Definition — und dann waere jede Angleichung eine Faelschung.

**Gemessen, nicht gelesen:**

| | Tiingo | EZB |
|---|---|---|
| Feld | `close` der Tagesbar | Referenzkurs (Fixing) |
| Zeitstempel | `…T00:00:00.000Z`, mit Zone | Handelstag (TARGET) |
| Tagesgrenze | **UTC-Kalendertag** | TARGET-Geschaeftstag |
| Zeitpunkt | Tagesende (~24:00 UTC) | ~14:15 UTC |
| Notierung | je Paar; `eurusd` wird geliefert, `usdeur` nicht | immer EUR-basiert |
| Inversion | erforderlich | nur fuer Nicht-EUR-Basis |

Der Zeitstempel steht in `tiingo-fx-probe.json#timestampSemantics` und
ist dort **gemessen** worden, nicht aus einer Dokumentation uebernommen.

> Damit ist die Antwort auf die Kernfrage: **nein.** Die beiden Zahlen
> beschreiben denselben KALENDERTAG, aber nicht denselben ZEITPUNKT.
> Rund 9,75 Stunden liegen dazwischen.

### Drei Hypothesen, und eine von ihnen sagt eine Zahl voraus

| | Wenn zutreffend, dann |
|---|---|
| **H1 Zeitversatz** | unverzerrt (Median nahe null), kleiner als die Tagesbewegung, und **negativ korreliert mit der Tagesrendite**: an einem steigenden Tag liegt das fruehere Fixing unter dem spaeteren Schluss |
| **H2 Definition** | systematisches Vorzeichen; der Median liegt sichtbar neben null und bleibt dort |
| **H3 Fehler** | Steigung nahe −1 (Tagesversatz) oder strukturell (Faktor statt Versatz) |

H1 sagt nicht nur ein Vorzeichen voraus, sondern eine **Zahl**. Wenn die
EZB 14,25 Stunden in einen 24-Stunden-Tag hinein fixiert, sind noch
41 Prozent des Tages offen. Die Regression der Differenz auf die
Tagesrendite muss dann eine Steigung nahe **−0,41** ergeben.

Das misst `scripts/quality/audit-fx-provider-seam.mjs` ueber den
gesamten Ueberlappungsbereich, je Paar, und schreibt das Ergebnis nach
`provider-seam-audit.json` — ohne einen einzigen Kursstand, weil
relative Differenzen und Korrelationen abgeleitete Groessen sind.

**Das Skript gleicht nichts an.** Es verschiebt keine Reihe, es
interpoliert nicht, es waehlt nicht je Tag den besseren Kurs.

### Das Ergebnis: 15 Paare, 14 eindeutig, eines mit Verzerrung

**`verdict: TIMING_DIFFERENCE`**

| Paar | Tage | Median \|d\| | Median d | corr(r) | Steigung |
|---|---|---|---|---|---|
| EUR/USD | 1.649 | 0,179 % | **−0,002 %** | **−0,725** | −0,553 |
| EUR/CAD | 1.646 | 0,173 % | 0,007 % | −0,748 | −0,556 |
| EUR/JPY | 1.646 | 0,174 % | −0,028 % | −0,590 | −0,375 |
| EUR/GBP | 1.645 | 0,124 % | 0,011 % | −0,622 | −0,403 |
| EUR/CHF | 1.645 | 0,119 % | 0,003 % | −0,632 | −0,442 |
| EUR/MXN | 1.427 | 0,285 % | −0,002 % | −0,779 | −0,635 |
| EUR/DKK | 1.426 | **0,005 %** | 0,001 % | −0,609 | −0,455 |
| EUR/TRY | 1.645 | 0,261 % | **−0,142 %** | −0,643 | −0,564 |

(gekuerzt; die vollen 15 Paare stehen im Bericht)

Drei Befunde, und jeder einzelne schliesst eine Hypothese aus:

**Der Median der vorzeichenbehafteten Differenz liegt bei −0,002 %.**
Zwei Tausendstel eines Prozents. Ein Definitionsunterschied — Geld
statt Mitte, andere Zusammensetzung — wuerde hier ein bleibendes
Vorzeichen hinterlassen. **H2 ist ausgeschlossen.**

**Die Korrelation mit der Tagesrendite betraegt −0,725.** Ueber alle
Paare liegt sie zwischen −0,45 und −0,78, ausnahmslos negativ. Genau
das sagt H1 voraus: an einem steigenden Tag liegt das frueher erhobene
Fixing unter dem spaeteren Schluss.

**Die Inversion ist exakt.** Der groesste Rundreisefehler ueber alle
Paare betraegt `1,6 · 10⁻¹⁶` — Maschinengenauigkeit. **H3 ist
ausgeschlossen.**

### Die Steigung ist steiler als vorhergesagt, und das ist die Pointe

Vorhergesagt −0,41, gemessen −0,553. Gleiches Vorzeichen, gleiche
Groessenordnung, aber deutlich steiler. Das ist kein Treffer, und es
wird hier nicht als einer verkauft.

Die Vorhersage unterstellt, dass sich Bewegung **gleichmaessig ueber
die Uhr** verteilt. Das tut sie nicht: EUR/USD bewegt sich
ueberwiegend in der Ueberlappung von London und New York, also **nach**
dem Fixing. Vom **Varianz**-Tag ist um 14:15 UTC deshalb mehr uebrig
als vom **Uhren**-Tag — und die Steigung misst die Varianz.

Der Bericht rechnet die Steigung in eine implizite Fixing-Uhrzeit
zurueck. Fuer EUR/USD ergibt das **10,7 UTC**. Das heisst **nicht**,
dass die EZB um 10:45 fixiert; es ist eine Uhrzeit-Ablesung einer
varianzgewichteten Groesse.

Dass die Lesart stimmt, zeigt die Streuung ueber die Paare:

| | implizite Uhrzeit | Volatilitaet konzentriert in |
|---|---|---|
| EUR/MXN | 8,8 | US-Stunden — am spaetesten, also steilste Steigung |
| EUR/USD | 10,7 | London/New York |
| EUR/CHF | 13,4 | Europa |
| EUR/JPY | 15,0 | auch asiatische Stunden — also frueher |

Waere die Steigung ein Uhrzeit-Versatz, muessten alle Paare dieselbe
Zahl zeigen. Sie zeigen die Tageszeit ihrer eigenen Volatilitaet.

### Die schlimmsten Tage sind die beste Bestaetigung

| Paar | Tag | Differenz | Was an dem Tag war |
|---|---|---|---|
| EUR/USD | 2022-11-10 | −2,33 % | US-Inflationsdaten, 13:30 UTC — die Bewegung kam **nach** dem Fixing |
| EUR/USD | 2022-09-13 | +1,97 % | US-Inflationsdaten, derselbe Mechanismus |
| EUR/TRY | 2021-12-20 | **+31,8 %** | die Lira-Wende: Ankuendigung am Abend, nach dem Fixing |

> Der 31,8-Prozent-Tag ist kein Datenfehler. Er ist der Tag, an dem sich
> die Lira nach dem Fixing um fast ein Drittel bewegt hat. Ein Fixing um
> 14:15 UTC und ein Schluss um 24:00 UTC **muessen** an diesem Tag weit
> auseinanderliegen — alles andere waere der Fehler.

**Der eine Fall mit Verzerrung** ist EUR/TRY: Median −0,142 %, also
nicht bei null. Das Urteil lautet dort `TIMING_DIFFERENCE_WITH_BIAS`.
Eine Waehrung, die ueber Jahre in eine Richtung laeuft, liegt am
frueheren Zeitpunkt systematisch auf einer Seite. Der Mechanismus ist
derselbe; er hat hier nur eine Vorzugsrichtung.

### Ein Nebenbefund, der vorher niemandem aufgefallen ist

**Tiingo liefert Wochenendzeilen, die EZB nicht** — rund 325 je Paar
ueber den Ueberlappungsbereich. Der Devisenmarkt ist von Freitag 22:00
bis Sonntag 22:00 UTC geschlossen; eine Samstagszeile beschreibt keinen
Handel.

Der Vergleich oben hat sie nicht benutzt (nur Tage, die in **beiden**
Reihen stehen). Fuer die Historie sind sie jetzt ohnehin gegenstandslos,
weil dort die EZB fuehrt. Festgehalten ist es trotzdem: eine
Wochenendzeile, die als Tageskurs durchgeht, waere genau die Art von
stillem Fehler, die dieser Layer verhindern soll.

### Die Rollenverteilung, die daraus folgt

Wenn die Differenz aus der Definition stammt, ist sie unvermeidbar —
aber der **Ort**, an dem sie sichtbar wird, ist waehlbar. Vorher lag er
mitten im Chart: die Reihe kam bis 2020 aus der EZB und danach aus
Tiingo, und der Wechsel legte den Zeitpunktunterschied als Sprung in
eine Reihe, in der kein Sprung hingehoert.

| Klasse | Frage | PRIMARY | FALLBACK |
|---|---|---|---|
| `HISTORICAL_DAILY` | Was war der Kurs am Tag t? | **ecb** | tiingo |
| `CURRENT` | Was ist der Kurs jetzt? | **tiingo** | ecb |

> Der einzige Uebergang liegt jetzt **an der Gegenwart**: historische
> Tagesreihe → aktueller Stand. Und das ist eine Naht, die ohnehin
> existiert, weil ein Tagesschluss und ein Jetzt zwei verschiedene Dinge
> sind.

Die Klasse ergibt sich aus der **Frage**, nicht aus der Datenlage: ein
Datum fragt nach der Historie, kein Datum nach dem juengsten Stand.
Damit bleibt die Rangfolge reproduzierbar — es wird nie je Tag zwischen
zwei vorhandenen Werten gewaehlt (§8).

**Geprueft gegen alle Pfade:**

| Pfad | Klasse | Quelle |
|---|---|---|
| Historischer Chart (1J/5J/10J/MAX) | `HISTORICAL_DAILY` | ecb |
| `PERIOD_AVERAGE` (Fluss) | `HISTORICAL_DAILY` | ecb |
| `DAILY_AT_PERIOD_END` (Stichtag) | `HISTORICAL_DAILY` | ecb |
| `MARKET_PRICE` mit Datum | `HISTORICAL_DAILY` | ecb |
| `LATEST_AVAILABLE` / aktueller Preis | `CURRENT` | tiingo |
| Realtime-Tick × Intraday-State | `CURRENT` | tiingo |

Wo die EZB nichts veroeffentlicht — ARS, CLP, COP, PEN, TWD — kippt die
Rangfolge, und Tiingo traegt auch historisch. Das ist kein Sonderfall im
Code, sondern dieselbe Regel: FALLBACK liefert, wo PRIMARY nichts hat.
Die Herkunft je Wert sagt es (`role: "FALLBACK"`, `resolutionClass:
"HISTORICAL_DAILY"`).

**Ein Nebeneffekt, der die Lizenzlage entspannt.** Die historische
EUR-Anzeige haengt jetzt fast vollstaendig an der EZB, deren Bedingungen
geklaert sind. Gesperrt bleibt bis zur Antwort auf O-11 im Wesentlichen
nur noch der **aktuelle** Tiingo-basierte EUR-Wert — nicht mehr die
halbe Historie.

**Fast**, und die Ausnahme ist gemessen. Fuenf Waehrungen fuehrt die EZB
nicht; ihr Kreuz entsteht aus einem EZB- und einem Tiingo-Bein und traegt
deshalb `role: "MIXED"` — und damit die **strengere** der beiden
Erlaubnisse:

| Waehrung | Titel |
|---|---|
| ARS | 12 |
| TWD | 6 |
| CLP | 5 |
| PEN | 4 |
| COP | 2 |
| **zusammen** | **29** |

29 von 11.202 Titeln zeigen ihre historischen EUR-Werte also erst nach
der Lizenzantwort. Das ist die ehrliche Zahl, und sie ist klein genug,
um sie zu nennen statt sie zu glaetten.

---

## 4f. Ein Anfang je Anzeigewaehrung (O-15)

Das Produkt kannte bisher **einen** `availableFrom` je Reihe. Das war
richtig, solange nur die Originalwaehrung gezeigt wurde, und ist falsch,
seit es einen Umschalter gibt.

| | `availableFrom` | begrenzt durch |
|---|---|---|
| USD (nativ) | **1990-01-05** | die Kursreihe |
| EUR | **1999-01-04** | die FX-Historie |

`layer.availability(nativeCurrency, nativeAvailableFrom)` liefert beide,
je unterstuetzter Anzeigewaehrung einen Eintrag — damit eine Oberflaeche
den Zeitraumwaehler richtig zeichnen kann, **bevor** jemand umschaltet,
statt eine halb leere Reihe zu zeichnen.

Gefragt wird derselbe Weg wie beim Kurs selbst: direkt, invers, ueber
die Pivots (`store.coverageWindow`). Eine zweite, einfachere Rechnung
waere ein zweiter Wahrheitsstand — die Zusage muss mit dem
uebereinstimmen, was `rateAt()` spaeter wirklich liefert.

**Was davor passiert: nichts.** Kein Punkt wird gefuellt, keine
Extrapolation, kein aeltester Kurs fuer frueherer Jahre, kein heutiger
Kurs fuer historische Daten. `beforeSeriesStart`, und das Feld
`limitedBy: "FX_HISTORY"` sagt der Oberflaeche, warum.

---

## 4g. Verfuegbarkeit ist ein Zeitpunkt (O-13)

Der Rubel ist der gemessene Gegenbeweis zur bequemen Annahme, dass eine
Waehrung entweder umrechenbar ist oder nicht:

| Horizont | Zustand |
|---|---|
| 15J / 10J | umrechenbar (ecb) |
| 5J | umrechenbar (tiingo) |
| **heute** | **nicht umrechenbar** |

Die EZB hat die Veroeffentlichung des Rubel-Referenzkurses eingestellt.
Wer Verfuegbarkeit je **Waehrung** fuehrt, muss sich hier fuer eine
Luege entscheiden — in die eine oder die andere Richtung.

Deshalb trennt der Vertrag:

| Feld | Bedeutung |
|---|---|
| `conversionAvailable` | Es gibt ueberhaupt ein Zeitfenster |
| `availableFrom` / `availableTo` | Wo dieses Fenster liegt |
| `currentConversionAvailable` | Fuer **heute** gibt es einen Kurs |
| `currentUnavailableReason` | Warum nicht |

Gefragt wird nach dem Kurs von heute, und damit gilt dieselbe Grenze wie
ueberall sonst (`maxCarryDays`). `latest()` waere die falsche Frage: es
gibt den letzten Punkt der Reihe zurueck, auch wenn er vier Jahre alt
ist — richtig fuer einen Rueckblick, falsch fuer eine Aussage ueber
heute.

### Zwei Auskuenfte, die nicht dasselbe sind

Beim Bauen fiel auf, dass der Layer sie verwechselte:

```
RUB/EUR heute  →  "pairNotStored"        ← falsch
RUB/EUR heute  →  "carryLimitExceeded"   ← richtig
                   lastAvailable: 2022-03-01, gapDays: 1666
```

Die angefragte Richtung war nicht gefuehrt, die Gegenrichtung schon —
und der Grund der Gegenrichtung wurde verworfen. „Gibt es nicht" und
„gilt heute nicht mehr" sind verschiedene Sachverhalte, und O-13 haengt
genau daran: eine Oberflaeche kann jetzt „bis 2022 umrechenbar" sagen
statt nur „nicht verfuegbar".

Fuer alle fuenf unaufloesbaren Waehrungen gilt unveraendert:
`conversionAvailable: false`, nativer Wert und Waehrung bleiben
sichtbar, der Titel bleibt im Company Master und im Vision Universe.
Geschaetzt wird nichts.

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
| **F** `MIGRATED_FALLBACK` | 19 | migriert; Zeile greift nur ohne geladenen Core |
| **A** `MONETARY_DISPLAY` | **0** | keine offene produktive Stelle mehr |
| **B** `PERCENTAGE_OR_RATIO` | 4 | darf nie konvertieren |
| **C** `STATIC_COPY` | 5 | Schwellenwert oder Archivtext, im Code markiert |
| **E** `INTENTIONAL_NATIVE_CURRENCY` | 1 | Bewertungs-Gate, zurueckgestellt |
| `UNCLASSIFIED` | 1 | von Hand ansehen |

Eine migrierte Stelle hinterlaesst oft mehr als eine Zeile der Klasse F:
die Bruecke `vuFormat()` und der beibehaltene Rueckfall zaehlen beide.

Migriert: `discover/ui/{surfaces,detail-fundamentals,cards,detail}.js`,
`dashboard/app.js`, `hedgefonds/index.html`, `vu2/experience.js`. Die
FX-Engines sind in `discover/index.html` und `discover-v2/index.html`
eingebunden; `vu2/index.html` laedt **nur** Registry und Formatierung —
diese Seite rechnet nichts um, und die Engine gehoert nicht auf eine
Seite, die sie nicht braucht.

### Die letzten vier (O-16)

**`vu2/experience.js` — migriert.** Zwei Stellen: die Achsenbeschriftung
des Charts und die Kennzahlformatierung. Byte-gleiche Ausgabe, geprueft
gegen die kopierte alte Form.

Die Bruecke fragt dabei nicht `unit === 'USD'`, sondern die Registry
(`Registry.isKnown(unit)`). Der Vergleich gegen einen Waehrungscode
waere genau die verteilte Kenntnis, die O-6 abbauen soll — und er wuerde
ein kuenftiges `unit: 'EUR'` still ohne Symbol darstellen.

**Die zwei Archivseiten unter `morning/` — nicht migriert, und das ist
die Bedingung aus O-16.** Der Treffer ist die Ueberschrift eines
datierten Artikels: *„21,7 Milliarden Dollar: …"*. Das ist Fliesstext
ueber ein Ereignis zu seinem Datum, kein angezeigter Wert. Eine
Umschaltung waere keine Anzeige, sondern eine Faelschung des Archivs —
die Schlagzeile hat so gestanden. Rein mechanisch migrierbar ist sie
damit nicht; sie tragen jetzt einen Marker `C` mit genau dieser
Begruendung.

**`quant/api/portfolio-workspace.js` — zurueckgestellt, wie verlangt.**

```
DEFERRED_PRODUCT_DECISION_MULTI_CURRENCY_PORTFOLIO
```

`stock.price.unit === 'USD'` sieht aus wie eine fest verdrahtete
Waehrung und ist keine: es ist ein **Bewertungs-Gate**. Eine Position in
Fremdwaehrung wird nicht bewertet, statt sie mit einer stillschweigenden
Annahme zu bewerten — genau das verlangt die Kopfzeile der Datei („No FX
assumption") und genau das verlangt O-13. Sie zu entfernen wuerde die
Multi-Waehrungs-Depotbewertung **freischalten**, mit allem, was daran
haengt. Das ist eine Produktentscheidung, keine Formatierung, und kein
Blocker fuer den Display Layer.

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

Fuenf Stellen tragen einen Marker **im Code**: drei Schwellenwerte im
Methodiktext („Margen erst ab 50 Mio. $ Umsatz") und die zwei
Archivueberschriften oben.

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

## 16b. Die Aktivierung: was der Nutzer sieht

Bis hierher war der Layer vollstaendig und **unbenutzt**. Die Module
lagen auf den Seiten, aber niemand hat einen Vertrag gebaut - denn im
Browser lagen keine Kurse.

### Warum nicht einfach die Kursreihen ausliefern?

Weil das Klasse E aus O-11 waere, und die braucht das Produkt nicht.
Die Loesung folgt aus O-14: **historisch fuehrt ohnehin die EZB**, und
deren Reihen duerfen unter Quellennennung wiedergegeben werden.

| | ausgeliefert | Grund |
|---|---|---|
| EZB-Tagesreihen | **ja**, `quant/data/market/fx/ecb/` | oeffentliche Statistik, Quelle wird genannt |
| Anbieterreihen | **nein**, Arbeitsablage | Klasse E wird nicht gebraucht |
| aktueller Anbieterkurs | **nein** | kommt als fertiger EUR-Wert am Tick, nicht als Kurs |

Der Workflow setzt das durch: eine Reihe im ausgelieferten
EZB-Verzeichnis, die nicht `source: "ecb"` traegt oder keine
Quellennennung hat, bricht den Lauf ab.

### Geladen wird, was gebraucht wird

`bootstrap.js` holt zuerst nur EUR/USD - die Waehrung von 10.790 der
11.202 Titel - und jede weitere erst, wenn eine Flaeche sie anfragt.
Alle zweiundzwanzig zu laden hiesse, jeder Seite drei Megabyte Kurse
aufzuladen, von denen sie eine benutzt.

**Vor den Kursen passiert nichts Falsches.** Der Vertrag steht sofort,
sein Store ist nur leer; eine Umrechnung meldet dann
`conversionUnavailable` und die Flaeche zeigt die Originalwaehrung
(Test `A5`).

### Ein Bootstrap, ein Umschalter, kein zweiter

`VUFx.Bootstrap.boot()` baut den Vertrag - einmal, fuer die ganze Seite.
`VUFx.Switch` liest und schreibt seinen Zustand und **rechnet nichts**.
Ein Wechsel ist ein Ereignis der Seite (`vu-currency-change`); wer
zuhoert, zeichnet neu.

Test `A1` liest den Quellcode aller Consumer-Flaechen und faellt durch,
sobald dort `createLayer`, `createEngine` oder `createStore` auftaucht.
Test `A3` faellt durch, sobald der Umschalter selbst zu rechnen beginnt.

### Umrechnen im Vertrag, formatieren in der Flaeche

Die beiden Schritte bleiben getrennt. Der Vertrag entscheidet, **welcher
Kurs** zu einem Wert gehoert - fuer eine Flussgroesse das Mittel ihrer
Periode, fuer eine Stichtagsgroesse der Kurs des Stichtags. Wie die Zahl
dann aussieht, bleibt die Entscheidung der Flaeche; ihre fertige
Zeichenkette zu uebernehmen wuerde die Tabellen umgestalten (§28).

### Zwei Stellen, an denen es beinahe falsch geworden waere

**Der Periodenanfang.** Eine Flussgroesse braucht beide Periodengrenzen.
Die veroeffentlichten Vergleichszeilen tragen nur das Ende - und ein
Geschaeftsjahr, das im September endet, hat keinen Januaranfang (§14).
Der Anfang kommt deshalb aus der **Kette der Geschaeftsjahre daneben**,
die die Journey ohnehin mitbringt.

Die erste Periode hat keine Vorgaengerin. Streng bliebe sie ohne Anfang
- mit der haesslichen Folge, dass der erste Balken in Dollar stuende und
alle anderen in Euro. `inferFirstFromChain` schliesst genau diese eine
Luecke, und zwar aus den Perioden **desselben Unternehmens**: die erste
ist so lang wie der Median der folgenden. Test `A4` prueft, dass dabei
kein Kalenderjahresanfang herauskommt.

**Die doppelte Umrechnung.** Die Chartreihe wird punktweise umgerechnet,
bevor sie gezeichnet wird. Sie danach noch durch `money()` zu schicken
hiesse, sie ein zweites Mal mit dem Kurs zu multiplizieren. Dafuer gibt
es `alsAngezeigt()` - formatiert, rechnet nicht. Beim Tagesverlauf ist
derselbe Fehler in einer zweiten Gestalt aufgetreten: die Achse war
umgerechnet, der Vortagesschluss nicht, und der Vergleich stand mit
einem Euro-Zaehler und einem Dollar-Nenner da. Jetzt wird der
Schnappschuss **einmal** umgerechnet, und alles rechnet mit derselben
Kopie.

### Der Nachweis in der Oberflaeche

`scripts/quality/verify-currency-ui.mjs` prueft im echten Browser, was
keine Testsuite sehen kann. Gemessen an `AAPL`:

| | |
|---|---|
| `UI1` EUR ist Vorgabe, Umschalter in der Leiste | **PASS** |
| `UI2` 93 Geldbetraege geaendert, **0** Prozent- oder Verhaeltniswerte | **PASS** |
| `UI3` kein Dollarbetrag in der EUR-Ansicht | **PASS** |
| `UI4` 844 Textknoten in beiden Waehrungen - kein Titel faellt weg | **PASS** |
| `UI5` 5 Jahre: **+133 % in EUR** gegen **+126 % in USD** | **PASS** |
| `UI6` MAX-Chart: EUR ab **08.01.1999**, nativ ab **05.01.1990**, mit Hinweis | **PASS** |
| `UI7` keine Konsolenfehler | **PASS** |
| `UI8` Discover 2.1 benutzt denselben Vertrag und denselben Speicher | **PASS** |

Gefuehrt fuer alle neun Nachweistitel: AAPL, NVDA, MSFT, SAP, ASML, NVO,
TM, BABA, GSK.

> `UI5` ist der Satz, auf den es ankommt. Eine Reihe, die rueckwirkend
> mit einem einzigen Kurs umgerechnet wird, haette dieselbe Form wie das
> Original und behauptete damit, der Wechselkurs haette sich nie bewegt.
> Der Unterschied zwischen 133 und 126 Prozent ist der Beweis, dass
> punktweise gerechnet wird.

### Eine Zahl, von Hand nachgerechnet

Der Nachweis ist erst dann einer, wenn eine einzelne Zahl stimmt.
AAPL am 2026-09-18, im Browser, mit den ausgelieferten EZB-Reihen:

| | |
|---|---|
| Kurs | 336,13 USD |
| EZB-Referenzkurs EUR/USD am 2026-09-18 | 1,1460 |
| Handrechnung | 336,13 ÷ 1,1460 = **293,3072** |
| Anzeige | **293,31 €** |
| Herkunft | `ecb`, `PRIMARY`, `HISTORICAL_DAILY`, `INVERSE` |
| Quellennennung | „Wechselkurse: Europäische Zentralbank (EZB-Referenzkurse)." |
| `publicDisplayAllowed` | `true` |

22 Paare, 7.097 Beobachtungen fuer EUR/USD ab 1999-01-04, 3,0 MB im
ausgelieferten Pfad - geladen wird davon je Seite eine Reihe.

**Ein Fehlschlag, der keiner war.** `UI6` meldete SAP und ASML zuerst
als Fehler: "Der EUR-Chart beginnt FRUEHER (08.01.1999) als der native
(22.09.1995)". Der Test verglich `TT.MM.JJJJ` als Zeichenkette. Die
Seite war richtig, der Test war falsch - und das ist der Grund, warum
ein Nachweis selbst gegengelesen gehoert.

---

## 17. Merge Gate

| Kriterium | Zustand | Beleg |
|---|---|---|
| `TIINGO_FX_CAPABILITIES` | **MEASURED** | `tiingo-fx-probe.json` |
| `HISTORICAL_FX_COVERAGE` | **PASS** — 1J/5J 99,96 %, 10J/15J 99,71 % (Schwelle 99 %); MAX berichtet, nicht beurteilt | `historical-coverage.json` |
| `FX_PROVIDER_ROLES` | **PASS** — zwei Klassen, je Klasse deterministisch, Uebergang an der Gegenwart. Ursache gemessen: `TIMING_DIFFERENCE` (14 von 15 Paaren; corr(r) = −0,725, Median der Differenz −0,002 %, Inversionsfehler 1,6·10⁻¹⁶) | `provider-seam-audit.json`, Pruefung `PR1`, Tests `O14-1` … `O14-4` |
| `FX_DATA_PROOF` | **PASS** | `currency-layer-proof.json` |
| `CURRENCY_CONTRACT` | **PASS** (77 Tests) | `currency-fx-matrix.test.mjs` |
| `INTRADAY_FX_STATE` | **PASS** — 952 Titel je Anfrage | `O9-1` … `O9-3` |
| `FX_FRESHNESS` | **PASS** | `O5-1` … `O5-6` |
| `EUR_USD_SWITCH_CONTRACT` | **PASS** (SW1–SW4) | plus `O15-1`: getrennte Anfaenge je Anzeigewaehrung |
| `UNKNOWN_CURRENCY_HANDLING` | **PASS** — 94,9 % belegt; 5 Titel unaufloesbar, alle `conversionAvailable: false`; Verfuegbarkeit zeitpunktbezogen | `O13-1`, `O13-2` |
| `CURRENCY_DEBT_MIGRATION` | **PASS** — 0 offene Klasse-A-Stellen; Grundlinie von 34 auf 33 gesunken | `currency-debt-register.json`, `O16-1`, `O16-2` |
| `CURRENCY_UI_PROOF` | **PASS** — EUR-Vorgabe, Umschalter, 0 bewegte Verhaeltniswerte, 9 Titel | `verify-currency-ui.mjs` (`UI1`–`UI8`) |
| `REGRESSION_GUARD` | **PASS** — 33 Stellen (Grundlinie 33), 2 Konstanten (Grundlinie 2) | `assert-no-local-fx.mjs` |
| `NEW_REGRESSIONS` | **0** | nach dem Merge von `main`: quant 1.403/1.403, discover 233/233, worker 66/66 - **keine** roten Tests mehr (die fuenf bekannten sind auf `main` behoben worden) |
| `PAID_SERVICES_ENABLED` | **0** | kein neuer kostenpflichtiger Dienst; die EZB ist oeffentlich |
| `CRITICAL_BLOCKERS` | **0** | die Lizenzfrage ist dokumentiert und blockiert weder Merge noch Development-Deployment |
| `REALTIME_FX` | **MARKET_CLOSED_NOT_PROVEN** | wird bei offener US-Sitzung nachgeholt |
| `LICENSE_DISPLAY_DERIVED_FX` | **OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT** | Owner-Entscheid 2026-09-22; kein Merge- und kein Deployment-Blocker |
| `PRE_COMMERCIAL_LICENSE_CONFIRMATION_REQUIRED` | **true** | dauerhaft dokumentiert; vor kommerzieller Vermarktung zu klaeren |

**Merge freigegeben** durch den Owner-Entscheid vom 2026-09-22.

`FX_PROVIDER_PRIORITY` heisst seit O-14 `FX_PROVIDER_ROLES`: es gibt
nicht mehr eine Rangfolge, sondern zwei — eine je Art der Frage.

Der Zweig wurde vor dem Merge gegen `main` synchronisiert. Ein Konflikt:
`vu2/experience.js`, wo `main` einen Verfuegbarkeitswaechter in die
Chartfunktion gesetzt hatte und dieser Zweig die Zeile darunter zentral
formatierte. Beide Aenderungen sind erhalten - die eine gehoert `main`,
die andere hier.

**Und ein Fund beim Zusammenfuehren:** `main` brachte
`discover-v2/detail.js` mit einer vierten eigenen Skalenleiter mit. Der
Regression Guard hat sie gemeldet. Genau dafuer gibt es den Guard.

### Warum Discover 2.1 in einem zweiten Schritt migriert

Discover 2.0 ist eine Vorschau, und `scripts/discover-v2/regression-gate.mjs`
haelt sie isoliert: sobald ein Zweig eine Datei unter `discover-v2/`
anfasst, prueft der Gate, dass `discover/index.html`, `discover/app.js`,
`discover/discover.css` und alles unter `discover/ui/` **byte-gleich**
zur Grundlinie bleiben, und dass sonst nichts ausserhalb der Vorschau
sich geaendert hat.

Der Currency Layer ist das Gegenteil davon: ein querliegender Kernumbau,
der genau diese Dateien anfassen MUSS — die Klasse-A-Migration und der
EUR-Umschalter leben dort. Beides in einem Zweig heisst: entweder der
Gate faellt, oder man weicht ihn auf.

Das Einfrieren von Discover 1.0 ist eine Produktionsschutz-Zusage. Sie
wird nicht aufgeweicht, damit ein eigener Zweig gruen wird. Stattdessen
laeuft die Lieferung in zwei Schritten:

1. **Dieser Zweig** enthaelt den Kern und Discover 1.0 — und *keine*
   Datei unter `discover-v2/`. Der Pfadfilter des Vorschau-Workflows
   greift damit nicht, der Gate laeuft gar nicht erst, und seine
   Grundlinie bleibt unberuehrt.
2. **Der Folgeschritt** migriert Discover 2.1 gegen das neue `main`. Die
   Grundlinie enthaelt dann die Currency-Aenderungen an Discover 1.0,
   das Einfrieren geht also durch, und die drei geaenderten Dateien
   (`discover-v2/{app.js,detail.js,index.html}`) stehen ohnehin in der
   Positivliste des Gates. Der Gate bleibt scharf und sagt trotzdem ja.

Das kostet einen zweiten Merge und weicht keine Zusage auf.

**Nachgemessen, nicht gehofft.** Auf dem Folgezweig gegen das gemergte
`main` meldet der Gate `status: PASS` mit `baseline`
`4ce86705533b82d9f6502040cd189b38d5eb662e`, 33.736 geschuetzten Dateien
und Discover 1.0 eingefroren auf seinem *neuen*, waehrungsfaehigen
Stand. Der Guard blieb die ganze Zeit scharf und sagt trotzdem ja —
genau das war der Zweck der Zweiteilung.

Drei Stellen hielten den Folgeschritt fest, damit er nicht vergessen
wird, und sind mit ihm wieder auf volle Strenge zurueckgenommen:
`M12-5` prueft beide Seiten auf die richtige Ladereihenfolge, `O16-1`
verlangt wieder 0 offene Klasse-A-Stellen, und `UI8` prueft wieder
vollstaendig statt zu ueberspringen.

### `REALTIME_FX`: der Zeitplan allein holt es nicht nach

`currency-realtime-proof.yml` traegt einen Zeitplan (15:00 und 18:00 UTC
an Werktagen, beide Zeiten in der regulaeren Sitzung, Sommer wie
Winter). **Vor dem Merge feuerte er nicht.**

GitHub Actions fuehrt `schedule`-Ausloeser ausschliesslich aus dem
Standardzweig aus. Solange der Workflow nur auf
`claude/vu-currency-fx-layer-elrkpp` lag und nicht auf `main`, lief der
Zeitplan nie — gegengeprueft.

> Das war eine Henne-Ei-Lage und sie gehoerte benannt: O-8 verlangt den
> Nachweis am offenen Markt, der Zeitplan liefert ihn erst nach dem
> Merge.

**Mit dem Merge von #163 ist sie aufgeloest.** Der Workflow liegt auf
`main`, der Zeitplan greift, und die Marker-Logik gibt fuer jedes
Ereignis ausser `push` frei (`if [ "$EVENT_NAME" != "push" ]` →
`run=true`) — ein geplanter Lauf braucht also keine Betreffzeile und
fuehrt den Nachweis wirklich aus, statt ihn zu ueberspringen.

Der zweite Ausloeser bleibt als Handgriff bestehen: ein Push mit
`[rt-proof]` in der **Betreffzeile** waehrend der offenen US-Sitzung
(13:30–20:00 UTC).

Bis der Lauf am offenen Markt vorliegt, bleibt
`REALTIME_FX = MARKET_CLOSED_NOT_PROVEN` und wird nicht beschoenigt
(§58). Gegenprobe, dass hier nichts stillschweigend gruen wird: der
Lauf auf diesem Zweig meldete `success`, weil das `proof`-Job ohne
Marker uebersprungen wurde — ein uebersprungener Nachweis ist kein
gefuehrter, und der Status bleibt entsprechend stehen.

---

## 18. Was noch offen ist

### Entschieden, und was daraus folgt

**Die FX-Lizenzfrage.** `LICENSE_DISPLAY_DERIVED_FX =
OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT` (Owner, 2026-09-22). Fuer die
Development-/Preview-Phase wird das Risiko getragen; das Produkt wird
derzeit nicht kommerziell vermarktet. Damit ist sie **kein**
Merge-Blocker und **kein** Deployment-Blocker.

Sie bleibt als Pre-Commercial-Launch-Gate bestehen:
`PRE_COMMERCIAL_LICENSE_CONFIRMATION_REQUIRED = true`. Rohe FX-Reihen
des Anbieters werden weiterhin nicht ausgeliefert - Klasse E wird nicht
gebraucht und nicht ausgeuebt.

> **Die exakte Frage an Tiingo:** „Duerfen Tiingo-FX-Daten serverseitig
> zur Berechnung abgeleiteter EUR-Aktienkurse und EUR-Fundamentalwerte
> verwendet und diese abgeleiteten Werte oeffentlich im
> Vision-Universe-Produkt angezeigt werden, ohne die rohe FX-Zeitreihe
> zu redistribuieren?"

Maschinenlesbar in `quant/config/fx-license.json#licenseGate`, abrufbar
ueber `Providers.escalation()`.

**Was ohne die Antwort geht:** seit O-14 die **historische**
EUR-Anzeige fuer 11.173 der 11.202 Titel — sie haengt an der EZB, deren
Bedingungen geklaert sind und deren Quelle genannt wird. Die
verbleibenden 29 Titel (ARS, TWD, CLP, PEN, COP) brauchen ein
Tiingo-Bein im Kreuz und warten mit.

### Der eine ausstehende Nachweis

`REALTIME_FX`. Wird bei offener US-Sitzung nachgeholt, nicht
beschoenigt.

### Zurueckgestellt, benannt, nicht blockierend

| # | Sache |
|---|---|
| `DEFERRED_PRODUCT_DECISION_MULTI_CURRENCY_PORTFOLIO` | Depotbewertung in Fremdwaehrung. Das Gate in `portfolio-workspace.js` bleibt unveraendert, bis der Owner entscheidet. |
| **O-14 Restfrage** | Die Ursache ist gemessen (`TIMING_DIFFERENCE`, 14 von 15 Paaren, corr −0,725) und die Naht an die Gegenwart verlegt. Bleibt: soll der Sprung zwischen letztem Tagesschluss und aktuellem Kurs dem Nutzer **gezeigt** werden — und ab welcher Groesse? Der Median liegt bei 0,18 %, das p95 bei 0,73 %; an Tagen mit US-Daten bei ueber 2 %. |
| **O-15 Restfrage** | Die getrennten Anfaenge liefert der Vertrag jetzt (`availability`). Bleibt: wie die Oberflaeche es sagt — Zeitraum begrenzen, Hinweis zeigen oder auf die Originalwaehrung verweisen? |
| **O-17** | Bestaetigung der EZB-Bedingungen (Wiedergabe unter Quellennennung). Blockiert nichts, weil die Nennung ohnehin erfolgt. |
