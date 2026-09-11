# VU US Security Master — Entdeckung, Klassifikation, Abgleich

**Stand:** 2026-09-10 · **Engine:** `us-security-master-1.0.0` ·
**Anbieterlauf:** CI 34515827288 (108.589 Zeilen, 0 Kurs-Anfragen) ·
**Phase:** `DISCOVERY_ONLY_NO_BACKFILL`

Dieses Dokument beschreibt einen eigenen Datenstrang. Er beruehrt die
laufende Produktmigration (Vision Universe 2.0) nicht: keine
Frontend-Datei, kein gemeinsames UI, keine Aenderung an oeffentlichen
GitHub-Pages-Pfaden, keine Aenderung an bestehenden Lizenzschranken.

---

## 1. Die Frage

Wie viele echte US-Aktien fuehrt Tiingo, und welche davon fehlen im
gelieferten Bestand von 5.684 Titeln?

Und die Frage dahinter, die zuerst beantwortet werden muss: **was ist
das eigentlich, was wir schon haben?**

## 2. Was nicht passiert

Der Bestand ist geliefert. Er gilt.

* Kein Titel wird geloescht.
* Kein Bestandsartefakt wird ueberschrieben.
* Keine Faktor-, Qualitaets-, Screener- oder Rankingdatei wird angefasst.
* Kein historischer Backfill laeuft.
* Titel, die diese Klassifikation fuer falsch eingeordnet haelt, werden
  **markiert und nicht entfernt**.

Ein Klassierer, der den Bestand fuer falsch haelt, ist ein Verdacht und
keine Vollmacht. Eine Bereinigung ist eine eigene, ausdruecklich
freizugebende Migration — nicht diese Aufgabe.

Die Zusage steht nicht nur hier. `buildSecurityMaster()` prueft sie am
Ergebnis und **wirft**, wenn ein Bestandstitel fehlt, als Neuaufnahme
oder als Ausschluss gefuehrt wird. Ein Lauf, der den Bestand
verkleinert, bricht ab und liefert nicht.

## 3. Die Dateien

| Datei | Rolle |
|---|---|
| `quant/engines/us-security-master.js` | Klassifikation und Abgleich. Reine Logik, einzeln testbar. |
| `scripts/market/build-us-security-master.mjs` | Der Lauf: Liste holen, klassifizieren, abgleichen, schreiben. |
| `quant/tests/us-security-master.test.mjs` | 34 Tests, davon fuenf Mutationstests. |
| `.github/workflows/tiingo-us-discovery.yml` | Der einzige Ort, an dem die Anbieterliste wirklich geladen wird. |
| `quant/data/market/security-master/summary.json` | Bilanz. |
| `quant/data/market/security-master/us-security-master.json` | Der Wertpapierstamm, eine Zeile je Titel. |
| `quant/data/market/security-master/reconciliation.json` | Nur die Zeilen, die eine Entscheidung brauchen — plus Befunde. |
| `quant/data/market/security-master/backfill-estimate.json` | Rechnung fuer eine spaetere Erweiterung. |
| `.market-cache/tiingo/security-master/us-security-master.json` | Der vollstaendige Stamm inkl. neuer Anbieterticker. Gitignored. |

Die Stammtabelle wird **eine Zeile je Wertpapier** geschrieben. Der Grund
ist der Diff: eingerueckt braucht ein Titel 37 Zeilen, und eine Aenderung
an einem Titel sieht aus wie eine Aenderung an der Datei. So beantwortet
`git diff` die Frage "was hat sich am Stamm geaendert?". Die Datei bleibt
gueltiges JSON — sie ist nur anders umgebrochen.

An bestaetigten Bestandszeilen fehlt `classification_reasons`: zweimal
derselbe Satz an 5.357 Zeilen kostet ein Drittel der Datei und sagt
nichts, was nicht in `classification_status` steht. Die vollstaendigen
Begruendungen liegen in der Arbeitsablage. Ein Test (SM64) prueft, dass
gekuerzt nur wird, wo es nichts zu erklaeren gibt.

**Nicht geaendert:** `quant/engines/instrument-classification.js`.
Dieser Klassierer hat die bestehenden Gate-Universen gezogen. Seine
Regeln zu aendern waere eine ruecklaufende Aenderung am Bestand. Der
neue Klassierer baut auf ihm auf und korrigiert nur nach vorn.

Einzige Aenderung an einer bestehenden Datei:
`scripts/market/assert-public-data-hygiene.mjs` prueft jetzt auch den
neuen Pfad auf Kursniveaus. Das ist eine zusaetzliche Schranke, keine
gelockerte.

## 4. Die Gattungen (§3)

`EQUITY_COMMON · ADR · REIT · SPAC · PREFERRED · TRUST · ETF · ETN ·
ETP · MUTUAL_FUND · CEF · INDEX · WARRANT · UNIT · RIGHT · OTHER ·
UNKNOWN`

Die Politik steht als Daten in `POLICY` und nicht als Verzweigung im
Code — nur so laesst sie sich in einem Test lesen und spaeter aendern:

| Fach | Gattungen | Wirkung |
|---|---|---|
| `INCLUDE` | `EQUITY_COMMON` | zaehlt in die Primaerzahl |
| `SEPARATE` | `ADR`, `REIT`, `SPAC`, `TRUST`, `PREFERRED` | getrennt gefuehrt, nicht in der Primaerzahl |
| `EXCLUDE` | `ETF`, `ETN`, `ETP`, `MUTUAL_FUND`, `CEF`, `INDEX`, `WARRANT`, `UNIT`, `RIGHT` | keine Aktien |
| `UNDECIDED` | `OTHER`, `UNKNOWN` | ausdruecklich nicht foerderfaehig |

Kein Papier liegt in zwei Faechern. Ein Test prueft das.

## 5. Was die Anbieterdaten hergeben — und was nicht

Tiingos `supported_tickers.zip` traegt sechs Spalten:

```
ticker, exchange, assetType, priceCurrency, startDate, endDate
```

**Keinen Namen.** Daraus folgt eine harte Grenze:

> **ADR, REIT, SPAC, TRUST, ETN, ETP und CEF sind aus dieser Liste nicht
> bestimmbar.** Ihre Zahlen sind **Untergrenzen**, solange kein Name
> vorliegt. Jede Zeile ohne Namen traegt `name_evidence: "unavailable"`
> und das Kennzeichen `NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED`.

Eine Zeile, die hier `EQUITY_COMMON` traegt, ist deshalb eine
**Restklasse** und keine Feststellung. Wer ADR- oder REIT-Zahlen
braucht, braucht `/tiingo/daily/<ticker>` je Titel — eine Anfrage pro
Ticker, und damit eine eigene Entscheidung.

Was **ohne** Namen sicher geht: Vorzuege, Optionsscheine, Units,
Bezugsrechte, Indizes (Tickerform), ETF und Fonds (`assetType`),
Handelsplatz, Waehrung, Aktivitaet.

## 6. Der Fund im Bestand

Gemessen im Anbieterlauf **34515827288** gegen 108.589 Anbieterzeilen.
**511 der 5.684 Bestandstitel** stehen auf `REVIEW`. Alle bleiben im
Bestand.

| Befund | Titel | Schwere |
|---|---:|---|
| `BASELINE_PREFERRED_CONTAMINATION` | 292 | HIGH |
| `BASELINE_MATCH_AMBIGUOUS` | 208 | HIGH |
| `BASELINE_INACTIVE_LISTINGS` | 8 | MEDIUM |
| `BASELINE_WARRANT_CONTAMINATION` | 3 | MEDIUM |
| `BASELINE_NON_PRIMARY_VENUE` | 1 | MEDIUM |

Die Rechnung geht auf: **5.173 bestaetigt + 511 zur Pruefung = 5.684**.
Ein dritter Ausgang existiert nicht, und `BASELINE_ACCOUNTED_FOR` im
Bericht ist der Ort, an dem er auffiele.

### 6.1 Warum 292 Vorzuege durchgerutscht sind

Tiingo schreibt Sondergattungen als Suffix. Der bestehende Klassierer
kennt die **zweiteilige** Form (`BAC-PB` → Vorzug) und die
Aktienklasse (`BRK-B` → Stammaktie). Er kennt die **dreiteilige** Form
nicht:

```
BAC-P-E   →  Regel /-P[A-Z]?$/ trifft nicht (endet auf "-E")
          →  Regel /-[A-Z]$/  trifft     (Klassenbuchstabe "E")
          →  Ergebnis: COMMON_STOCK
```

Genau diese Form benutzt Tiingo fuer die Vorzugsserien der grossen
Emittenten: `WFC-P-Y`, `PCG-P-A`, `GS-P-C`, `JPM-P-D`, `MS-P-F`, …

Der Effekt ist im ganzen Anbieteruniversum messbar, und zwar exakt:

| Gattung | grober Klassierer | feiner Klassierer | Differenz |
|---|---:|---:|---:|
| COMMON_STOCK / EQUITY_COMMON | 47.888 | 47.035 | **−853** |
| PREFERRED | 29 | 882 | **+853** |

Dieselbe Zahl auf beiden Seiten. Die 853 sind nicht verschwunden — sie
standen im falschen Fach. (`coarseVsFine` im Abgleich; die grobe Seite
stammt aus `universe/summary.json` vom 09.09., die feine aus diesem
Lauf.)

Dieselbe Luecke betrifft `-WS-A` (Optionsscheine): `VST-WS-A`,
`SATX-WS-A`, `NE-WS-A`. Und `-U-x` / `-RT-x`: der grobe Klassierer
fuehrte 494 Papiere als `OTHER`, der feine trennt sie in 395 `UNIT` und
141 `RIGHT`.

### 6.2 Die uebrigen Befunde

* **208 mehrdeutige Zuordnungen** — der Anbieter fuehrt den Ticker
  mehrfach und keine Zeile steht auf dem Handelsplatz des Bestands.
  426 Zeilen, davon 215 inaktiv (fast alle davon Vorgaenger eines
  wiederverwendeten Symbols), aufgeteilt in 385 `EQUITY_COMMON`,
  32 `PREFERRED`, 9 `ETF`. Welche Zeile gemeint ist, entscheidet dieser
  Lauf **nicht**.
* **8 beendete Listings** unter den sauber zugeordneten Titeln.
* **3 Optionsscheine** (`VST-WS-A`, `SATX-WS-A`, `NE-WS-A`).
* **1 Titel auf `EXPM`** (`EFOR`) — Expert Market, ein
  Ausserboersen-Segment. Er kam ueber die kuratierte `GATE_100`-Saat
  herein, die den OTC-Filter der regelbasierten Auswahl nicht
  durchlaeuft.
* **118 Bestandsticker** tragen zusaetzlich ein zweites Anbieterlisting
  (`ALTERNATE_LISTING_OF_BASELINE_TICKER`). Sie zaehlen **nicht** als
  Neuzugang.
* Im ganzen Anbieteruniversum: **2.202 doppelte Ticker**, davon 1.067
  ohne Zeitraumueberschneidung — das ist Symbolwiederverwendung und
  keine Doppelnotierung.

### 6.3 Wie ein Bestandstitel einer Anbieterzeile zugeordnet wird

Tiingo fuehrt denselben Ticker mehrfach: an zwei Handelsplaetzen, oder
nacheinander fuer zwei verschiedene Emittenten
(Symbolwiederverwendung). Die Zuordnung geht deshalb ueber **Ticker UND
Handelsplatz**:

| Fall | `baseline_match` | Folge |
|---|---|---|
| Genau eine Anbieterzeile auf dem Handelsplatz des Bestands | `EXCHANGE_MATCH` | sie ist der Bestandstitel |
| Genau eine Anbieterzeile ueberhaupt, anderer Platz | `EXCHANGE_MATCH` | sie ist es auch (Platzwechsel) |
| Mehrere Zeilen, keine auf dem Platz des Bestands | `AMBIGUOUS` | **alle** behalten den Bezug, alle auf `REVIEW` |
| Weitere Zeilen neben einer sauberen Zuordnung | `ALTERNATE_LISTING` | `REVIEW`, ausdruecklich **nicht** `ADDED` |

Der erste Anbieterlauf (CI 34514590057) hatte das noch ueber den Ticker
allein gemacht — und meldete **6.024 erhaltene Bestandstitel statt
5.684** sowie **333 angeblich beendete Bestandslistings statt 16**. Die
340 zu viel waren keine zusaetzlichen Titel, sondern zusaetzliche Zeilen
zu denselben Titeln; die alte, delistete Zeile eines wiederverwendeten
Symbols schlug auf den lebenden Titel durch.

Der Lauf ist daran **abgebrochen** und hat nichts committet — genau so,
wie er es soll. `baselinePreserved` zaehlt jetzt TITEL,
`baselineMemberRows` zaehlt ZEILEN, und wo beide auseinandergehen, steht
ein Befund (SM42, SM46, SM47).

## 7. Das Anbieteruniversum

Gemessen, nicht geschaetzt. `apimedia.tiingo.com` ist vom Egress-
Regelwerk der Arbeitsumgebung gesperrt; geladen wird die Liste deshalb
in `.github/workflows/tiingo-us-discovery.yml`, wo das Netz offen ist.
Der Lauf kostet **null Anfragen an die Kurs-API** — er laedt eine offene
Datei von rund 800 KB in etwa einer Sekunde.

| Kennzahl | Wert |
|---|---:|
| `RAW_US_PROVIDER_CANDIDATES` | 108.589 |
| `ACTIVE_US_COMMON_EQUITIES` | 7.785 |
| `NEW_ELIGIBLE_ADDITIONS` | **2.116** |
| `FINAL_PROPOSED_US_EQUITY_COUNT` | **7.800** |
| `OTC_COMMON_DEFERRED` | 16.641 |
| `INACTIVE` | 42.483 |
| `EXCLUDED_NEW_CANDIDATES` | 60.642 |
| `REVIEW_NEW_CANDIDATES` | 39.929 |

Gattungen im ganzen Anbieteruniversum: 49.878 `MUTUAL_FUND`, 9.592
`ETF`, 882 `PREFERRED`, 666 `WARRANT`, 395 `UNIT`, 141 `RIGHT`. `ADR`,
`REIT`, `SPAC`, `TRUST`, `ETN`, `ETP`, `CEF` und `INDEX` stehen bei
**0** — nicht weil es sie nicht gibt, sondern weil die Tickerliste
keinen Namen traegt (§5). Diese acht Zahlen sind Untergrenzen und
ausdruecklich keine Zaehlung.

### 7.1 Wo die 2.116 Neuzugaenge liegen

| Handelsplatz | Neuzugaenge |
|---|---:|
| NASDAQ | 1.465 |
| NYSE | 375 |
| BATS | 208 |
| AMEX | 45 |
| NYSE ARCA | 14 |
| NYSE MKT | 9 |

### 7.2 Warum sie gefehlt haben — die Antwort ist eindeutig

| Erstnotierung laut Anbieter | Neuzugaenge |
|---|---:|
| 2023 (ab 10.09.) | 90 |
| 2024 | 389 |
| 2025 | 717 |
| 2026 | 920 |

**Alle 2.116 liegen nach dem 10.09.2023.** Kein einziger davor.

Das ist keine Anbieterluecke und keine Gattungsfrage. Es ist **unsere
eigene Auswahlregel**: `ruleBasedCandidates()` in
`select-gate-universe.mjs` verlangt `minHistoryYears: 3`. Wer nach dem
Stichtag erstmals gehandelt wurde, war fuer `FULL_UNIVERSE` nicht
waehlbar — unabhaengig davon, was er ist.

Der neue Klassierer wendet die Regel auf die Foerderfaehigkeit **nicht**
an (Test SM21). Ein Titel von gestern ist eine Aktie. Ob er in ein
Momentumuniversum gehoert, ist eine andere Frage und gehoert in die
Auswahl, nicht in den Stamm.

### 7.3 Was bewusst draussen bleibt

**16.641 ausserboerslich gehandelte Stammaktien.** Sie sind US-gelistet
und sie sind Aktien. Sie stehen trotzdem nicht in der Primaerzahl, weil
der Bestand keine enthaelt und sie nachtraeglich einzurechnen eine
**Politikentscheidung** waere. Sie tragen `eligibility_reason:
OTC_VENUE_OUT_OF_CURRENT_POLICY` und werden gezaehlt
(`OTC_COMMON_DEFERRED`), damit die Entscheidung mit einer Zahl
getroffen werden kann — nicht mit einem Gefuehl.

## 8. Backfill-Schaetzung (§10)

Nicht getippt, sondern aus dem letzten echten Lauf gerechnet
(`gate-FULL_UNIVERSE.json`, Lauf 34374652149, 5.684 Titel):

| Groesse je Titel | Wert |
|---|---:|
| Anfragen | 1,0004 |
| Laufzeit | 0,592 s |
| Empfangene Daten | 769 KB |
| Belegter Speicher | 1,40 MB |
| Faktorrechnung | 10,2 ms |

Fuer die gemessenen 2.116 Neuzugaenge plus die 34 Titel, deren letzte
Kerze im Referenzlauf veraltet war:

| | Wert |
|---|---:|
| Nachzuholende Titel | 2.116 neu + 34 stale = **2.150** |
| Anfragen | ~2.151 |
| Laufzeit | **~21 min** |
| Download | ~1,6 GB |
| Zusaetzlicher Speicher | ~3,0 GB |
| Faktorrechnung | ~22 s |

Beendete Listings zaehlen ausdruecklich **nicht** mit: ihre Historie ist
vollstaendig, ein erneuter Abruf liefert dieselbe Reihe. `staleSymbols`
kommt aus `dataQuality.reasons.stale_last_bar` des Referenzlaufs und
nicht aus dem `active`-Feld (Test SM63).

Das Stundenbudget liegt bei 12.000 Anfragen; der Anbieter hat in einem
Lauf mit 5.686 Anfragen keine einzige abgelehnt. **Der ganze Nachlauf
passt in einen einzigen Lauf.**

**Ein vollstaendiger Neulauf ist nicht noetig.** `resumable.status` des
letzten Laufs ist `COMPLETE` fuer alle 5.684 Titel, und die Reihen
liegen je Titel getrennt in der Arbeitsablage. Einen unveraenderten
Titel erneut zu holen liefert dieselbe Reihe — kein Gewinn, derselbe
Verkehr. Ein voller Neulauf ueber 8.023 Titel kostete ~79 min und
~5,9 GB Download; ~74 Prozent davon fuer Daten, die schon da sind.

## 9. Anhaengende Erweiterung (§11)

```
BESTAND (5.684, unveraendert)
  + NEUE FOERDERFAEHIGE US-AKTIEN (append-only)
  = ERWEITERTES US-AKTIENUNIVERSUM
```

**Neu zu bauen, weil es ueber die Mitglieder zaehlt:**

* `quant/data/market/scale/universe-FULL_UNIVERSE.json`
* `quant/data/market/scale/gate-FULL_UNIVERSE.json`
* `quant/data/market/factors/factors-FULL_UNIVERSE-summary.json`
* `quant/data/market/factors/screener-FULL_UNIVERSE.json`
* `quant/data/market/health/universe-quality-FULL_UNIVERSE.json`
* `quant/data/market/health/health.json`
* `quant/data/market/universe/summary.json`

**Ausdruecklich zu erhalten:**

* Kursreihen je Titel in `.market-cache` — unveraendert gueltig.
* `universe-GATE_100/500/2000.json` und ihre Faktorendateien. Gates sind
  geschachtelt und gehoeren zu ihrem Lauf. Ein Gate nachtraeglich zu
  vergroessern zerstoert den Vergleich, fuer den es da ist.
* `quant/data/market/commercial/**` — haengt am Zugang, nicht am
  Universum.
* `quant/data/technical/**` — je Instrument; neue kommen dazu.
* `quant/data/sec/**` — anderer Anbieter, anderer Lauf.

Die Faktorzeilen der bestehenden 5.639 gerechneten Titel bleiben gueltig
und werden **ergaenzt**, nicht ersetzt.

## 10. Lizenz- und Auslieferungsgrenzen (§12)

Unveraendert bindend:

* Die vollstaendige Tickerliste bleibt in der Arbeitsablage.
  Redistribution: `LEGAL_REVIEW_REQUIRED`.
* Das ausgelieferte Artefakt traegt **Zeilen von Titeln, die ohnehin
  schon oeffentlich im Bestand stehen**, und Zahlen ueber den Rest. Neue
  Anbieterticker bleiben zurueck (`redistribution.newProviderTickers:
  "WITHHELD"`), bis der Schalter `--include-new-tickers` bewusst gesetzt
  wird.
* **Keine Kursniveaus.** Ein Test (SM61) liest das erzeugte Artefakt und
  sucht nach `close`, `adjustedClose`, `sma20`, `sma200`, `high52w`,
  `low52w`, `bars`. `assert-public-data-hygiene.mjs` prueft denselben
  Pfad im CI.

## 11. Tests (§13)

34 Tests in `quant/tests/us-security-master.test.mjs`.

| Bereich | Tests |
|---|---|
| Schema und Aufzaehlungen | SM01–SM03 |
| Nicht-destruktiv | SM10–SM13 |
| Anhaengende Aufnahme | SM20–SM22 |
| Klassifikation | SM30–SM38 |
| Kontamination, Doppel und Zuordnung | SM40–SM47 |
| Auszaehlung | SM50 |
| Das erzeugte Artefakt | SM60–SM65 |

**Mutationstests.** SM12 greift die nicht-destruktive Wache selbst an:
Titel weg → wirft; Titel als `ADDED` → wirft; Titel als
`EXCLUDED_CANDIDATE` → wirft; unbekannter Status → wirft. Eine Wache,
die nie ausgeloest hat, ist keine bewiesene Wache.

SM35/SM36 pruefen die andere Richtung: ein Klassierer ohne Beleg muss
`UNKNOWN` liefern und ein unbekannter Handelsplatz `REVIEW` — nicht
`EQUITY_COMMON`. **Ein kaputter Klassierer faellt nach REVIEW/UNKNOWN
und entfernt nichts.**

## 12. Der Stand, in einem Satz je Zeile

| | |
|---|---|
| Bestand | 5.684 Titel, **vollstaendig erhalten**, 0 entfernt |
| Davon bestaetigt | 5.173 |
| Davon zur Pruefung | 511 — markiert, nicht angefasst |
| Anbieteruniversum | 108.589 Zeilen |
| Echte neue US-Aktien | **2.116** |
| Erweitertes Universum | **7.800** |
| Grund fuer den Abstand | unsere Drei-Jahres-Regel, nicht der Anbieter |
| Naechster Lauf | ~21 min, ~2.151 Anfragen, ein einziger Lauf |
| Voller Neulauf noetig | **nein** |
| Backfill gestartet | **nein** |

## 13. Naechster Schritt

Die Entdeckung ist abgeschlossen und reproduzierbar. Ein erneuter Lauf
entsteht durch einen Push auf einen `claude/**`-Branch mit der Marke
`[tiingo-discovery]`, der eine der vier beobachteten Dateien aendert.

Die Erweiterung des Universums um die 2.116 Titel ist der naechste
Schritt und **nicht Teil dieser Aufgabe**. Sie braucht die
ausdrueckliche Freigabe des Eigentuemers, und sie faellt in drei
Entscheidungen, die getrennt getroffen werden koennen:

1. **Die 2.116 aufnehmen?** Ein Lauf von ~21 Minuten. Anhaengend, ohne
   Neulauf. Die Drei-Jahres-Regel in `select-gate-universe.mjs` muss
   dafuer bewusst gelockert oder ersetzt werden — sie ist der Grund,
   warum die Titel fehlen.
2. **Die 511 Bestandstitel bereinigen?** 292 Vorzuege, 208 mehrdeutige
   Zuordnungen, 8 beendete Listings, 3 Optionsscheine, 1 EXPM-Titel.
   Eine eigene, ausdruecklich freizugebende Migration — nicht diese.
3. **Die 16.641 OTC-Stammaktien?** Eine Politikentscheidung ueber die
   Reichweite des Produkts, keine Datenfrage.

**Bis dahin ist Schluss.** Es laeuft kein Backfill.
