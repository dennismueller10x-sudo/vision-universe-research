# VU US-Aktienuniversum — Aufraeumen nach dem Backfill

**Stand:** 2026-09-11 · **Engines:** `us-security-master-1.1.0`,
`coverage-metrics-1.0.0` ·
**Phase:** `POST_BACKFILL_CLEANUP_NO_PRICE_REQUESTS` ·
**Kursabfragen:** 0 · **Geloeschte R2-Objekte:** 0

Der Backfill ist abgenommen: 7.802 Historien liegen in Cloudflare R2.
Dieses Dokument beschreibt, was danach zu korrigieren war — und was
dabei ausdruecklich **nicht** passiert ist.

Wie der ganze Datenstrang beruehrt es die Produktmigration (Vision
Universe 2.0) nicht: keine Frontend-Datei, kein gemeinsames UI, keine
Aenderung an oeffentlichen GitHub-Pages-Pfaden, keine Aenderung an
Lizenzschranken.

---

## 1. Zwei Befunde aus dem Backfill

**Erstens: 583 der 2.119 Neuzugaenge sind keine Stammaktien.**

Tiingo fuehrt Derivate in zwei Schreibweisen. Die punktierte
(`BAC-P-E`, `VST-WS-A`) erkannte der Klassierer. Die punktlose
NASDAQ-Schreibweise — ein fuenfter Buchstabe ohne Trennzeichen,
`AACBW` fuer den Warrant auf `AACB` — nicht. Sie sind mitgewandert,
haben Historie und stehen im gelieferten Universum.

**Zweitens: eine Zahl beantwortete drei Fragen.**

Der Backfill meldete `CHART_READY_PERCENT: 84.81`. Die Rechnung
stimmte, die Bezeichnung nicht: gemessen wurde „hat mindestens 250
Bars" — die Schwelle der Technik. Als Chartaussage gelesen behauptet
sie, 1.185 Titel liessen sich nicht darstellen. Die Chart-Engine
zeichnet ab **zwei** Bars (`chart-ranges.js`, `MIN_BARS`). Ein Titel
mit 33 Kerzen hat keinen 10-Jahres-Chart — er hat einen Chart.

## 2. Was nicht passiert ist

* **Keine Kursabfrage.** Die einzige Anbieteranfrage ist
  `supported_tickers.zip`, eine offene Datei von rund 800 KB.
* **Kein R2-Objekt geloescht.** Der Speicher wird ausschliesslich
  gelesen. Auch die Historie eines ausgeschlossenen Warrants bleibt.
* **Kein Bestandstitel entfernt.** `universe-FULL_UNIVERSE.json` bleibt
  zeichengleich; der Lauf rechnet den sha256 vor und nach sich selbst
  nach und bricht ab, wenn er abweicht.
* **Keine Schwelle gesenkt.** `minHistoryCoverageRate` steht
  unveraendert auf 0,9.
* **Keine Astra/Codex-VU2-Datei angefasst.**

## 3. Der fuenfte Buchstabe — und warum der Suffix allein nicht reicht

`AACBW` endet auf W. Das ist ein Hinweis, kein Beleg: es gibt echte
vierstellige Gesellschaften, deren Ticker zufaellig auf W, R oder U
endet. Wer allein nach dem letzten Buchstaben geht, wirft sie mit
hinaus.

Der Beleg ist der **Stamm**. Existiert der vierstellige Rumpf als
eigenes Listing, ist der fuenfstellige Ticker mit hoher
Wahrscheinlichkeit sein Derivat — das SPAC-Muster. 471 der 583
gefundenen Faelle tragen ihren Stamm.

| Fall | Klassifikation | Sicherheit | Ausgang |
|---|---|---|---|
| `AACBW`, Stamm `AACB` gelistet | WARRANT | HIGH | `EXCLUDED` |
| `ZZZZW`, Stamm nicht gelistet | WARRANT | LOW | `REVIEW` |
| `MTEST-A` | TEST_SECURITY | HIGH | `EXCLUDED` |
| `AACB` | EQUITY_COMMON | HIGH | `ELIGIBLE` |

Die Stammenge wird aus **Anbieterliste und Bestand zusammen** gebildet:
ein Stamm, den der Anbieter inzwischen delistet hat, belegt sein
Derivat weiterhin.

Die Testpapierregel ist eng gefasst (`^[A-Z]?TEST[0-9]?(-[A-Z])?$`):
`ATEST`, `NTEST`, `PTEST` treffen, `TESLA`, `ATTEST`, `PROTEST` nicht.
Ein faelschlich ausgeschlossenes Unternehmen ist teurer als ein
durchgerutschtes Testpapier.

## 4. Die Eignungsschicht — neben der Mitgliedschaft, nicht statt ihrer

Die 583 aus `universe-FULL_UNIVERSE.json` zu entfernen hiesse: eine
Datei, die als Bestand gilt, wird kleiner. Ein spaeterer Lauf koennte
dann nicht mehr sagen, ob ein Titel nie da war oder still verschwand.

Stattdessen entsteht **daneben** eine Schicht, die zu jedem Mitglied
sagt, ob es ins Produkt gehoert. Vier Ausgaenge:

| Ausgang | Bedeutung | Im Produktuniversum |
|---|---|---|
| `ELIGIBLE` | Stammaktie, aktiv, Primaerhandelsplatz | ja |
| `SEPARATE_CLASS` | belegt aktienartig, getrennt gefuehrt (Vorzuege) | ja |
| `EXCLUDED` | **belegte** Nicht-Aktie | nein |
| `REVIEW` | unbelegter Verdacht, inaktiv, unbekannt | ja, markiert |

Vor jedem Ausschluss steht `classification_status === "CLASSIFIED"`.
Das ist die ganze Vorsicht dieser Schicht: ohne sie entschiede der
Klassierer ueber Titel, die er selbst nicht erkannt hat.

`SEPARATE_CLASS` ist kein Zierrat. Ein belegter Vorzug ist kein
Verdachtsfall; ihn unter `REVIEW` zu fuehren hiesse, mehrere hundert
einwandfrei erkannte Papiere als zweifelhaft auszuweisen — eine
Unwahrheit in der Richtung, die am teuersten ist, weil sie die
Verdachtsliste unbrauchbar macht.

**Jede** Aenderung der Produkteignung steht einzeln in
`eligibility-reconciliation.json`: Ticker, Handelsplatz, vorher,
nachher, Gattung, Sicherheit, Beleg — und der ausdrueckliche Vermerk,
dass die Historie in R2 bleibt.

## 5. Drei Kennzahlen statt einer

| Kennzahl | Frage | Schwelle | Herkunft der Schwelle |
|---|---|---:|---|
| `STORAGE_COVERAGE` | Haben wir die Historie? | — | — |
| `CHART_AVAILABILITY` | Kann der Chart zeichnen? | 2 Bars | `chart-ranges.js:MIN_BARS` |
| `TECHNICAL_HISTORY_ELIGIBILITY` | Reicht es fuer Indikatoren? | 300 Bars | `run-technical-scale.mjs:MIN_BARS` |

Die Schwellen werden aus den anwendenden Stellen **gelesen**, nicht
hier gesetzt. Eine eigene Zahl waere eine Zweitmeinung ueber fremdes
Verhalten; aendert jemand `MIN_BARS` in der Chart-Engine, geht die
Kennzahl mit.

Die Nenner sind verschieden, und das ist der Punkt:

* `STORAGE_COVERAGE` rechnet ueber **alle** Mitglieder — auch ueber den
  spaeter ausgeschlossenen Warrant. Wir haben ihn geholt, also
  verantworten wir ihn.
* `CHART_AVAILABILITY` und `TECHNICAL_HISTORY_ELIGIBILITY` rechnen ueber
  das **Produktuniversum**. Ein ausgeschlossener Warrant soll gar nicht
  gezeichnet werden.

`STORAGE_COVERAGE` trennt ausserdem zwei Arten von Fehlen: der Anbieter
hat keine Reihe (`missingProviderUnavailable`) gegen wir haben sie
verloren (`missingUnexplained`). Nur das zweite ist ein Speicherfehler.

## 6. Der Nenner der Langhistorie

Die Historienquote fiel auf 84,81 %, weil das Universum um 2.119 Titel
gewachsen ist — darunter 920, die erstmals 2026 gehandelt wurden. Ein
Titel, der seit acht Monaten existiert, **kann** keine 250 Bars haben.
Ihn in den Nenner zu stellen misst nicht die Datenqualitaet, sondern
das Alter des Universums.

Die Antwort ist nicht, die Schwelle zu senken — dann misst die Quote
gar nichts mehr. Die Antwort ist der Nenner:

```
ELIGIBLE_FOR_LONG_HISTORY_CHECK   Listing alt genug (>= 363 Kalendertage
                                  fuer 250 Handelstage), Gattung im
                                  Produktuniversum, Anbieter liefert
PASS / FAIL                       innerhalb dieses Nenners
LONG_HISTORY_COVERAGE_PERCENT     PASS / ELIGIBLE
```

Die Schwelle bleibt bei 90 %, sie gilt jetzt nur auf der richtigen
Grundmenge. Wer aus dem Nenner faellt, verschwindet nicht: er steht mit
Grund daneben (`LISTING_TOO_YOUNG`, `NOT_IN_PRODUCT_UNIVERSE`,
`PROVIDER_HAS_NO_SERIES`, `START_DATE_UNKNOWN`). Die Summe aus Nenner
und Gruenden ergibt das Universum — das wird geprueft.

Die alte Einzelkennzahl bleibt als `legacy` stehen. Nicht als Zusage,
sondern als Vergleichspunkt: wer sie sucht, soll sehen, was sie war und
warum sie nicht mehr allein berichtet wird.

## 7. Die Dateien

| Datei | Inhalt |
|---|---|
| `quant/engines/us-security-master.js` | Klassierer (v1.1.0), `nasdaqFifthLetter`, `collectListedRoots`, `decideProductEligibility` |
| `quant/engines/coverage-metrics.js` | die drei Kennzahlen, `longHistoryEligible` |
| `scripts/market/build-us-eligibility.mjs` | Eignungsschicht und Abgleich |
| `scripts/market/build-coverage-metrics.mjs` | Kennzahlen aus dem R2-Index |
| `quant/data/market/security-master/eligibility.json` | Entscheidung je Titel |
| `quant/data/market/security-master/eligibility-reconciliation.json` | jede Aenderung einzeln |
| `quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json` | das Produktuniversum |
| `quant/data/market/history/coverage-metrics.json` | die vier Rechnungen |
| `.github/workflows/us-equity-cleanup.yml` | der Lauf, `[us-cleanup]` |

Ausgeliefert werden Anzahlen, Datumsgrenzen und Gruende — kein
Kursniveau. Dieselbe Grenze wie ueberall in diesem Datenstrang.

## 8. Tests

| Bereich | Tests |
|---|---|
| Fuenfter Buchstabe, Stammbeleg, Testpapiere | `SM66`–`SM80` |
| Produkteignung, vier Ausgaenge | `SM81`–`SM90` |
| Drei Kennzahlen, Nenner, Schwellenherkunft | `CM01`–`CM18` |

Vier davon sind Mutationstests — sie machen absichtlich kaputt, was
schiefgehen kann, und verlangen, dass es auffaellt:

* `SM69` Der Suffix allein darf keinen Titel ausschliessen.
* `SM83` Ohne Beleg wird nicht ausgeschlossen.
* `CM04` Die Chartschwelle ist nicht die Technikschwelle.
* `CM12` Die Schwelle zu senken macht die Quote huebsch und leer —
  die gemessene Quote aendert sich dabei **nicht**, nur das Urteil.
* `CM13` Null von Null ist nicht 100 %.

## 9. Der Stand, in einem Satz je Zeile

* Der Klassierer kennt die punktlose NASDAQ-Schreibweise und belegt sie
  am Stammsymbol.
* Ein Verdacht ohne Stammbeleg wird bewahrt, nicht ausgeschlossen.
* Die Mitgliedschaft ist unveraendert; die Eignung steht daneben.
* Jede Eignungsaenderung ist einzeln ausgewiesen.
* Aus einer Kennzahl sind drei geworden, mit drei Schwellen aus drei
  Quellen.
* Die Langhistorienquote rechnet auf einem Nenner, der die Frage kennt;
  die Schwelle wurde nicht angefasst.
* Kein Kurs geholt, kein Objekt geloescht.
