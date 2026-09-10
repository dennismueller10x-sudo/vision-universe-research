# VU US Security Master — Entdeckung, Klassifikation, Abgleich

**Stand:** 2026-09-10 · **Engine:** `us-security-master-1.0.0` ·
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
| `quant/tests/us-security-master.test.mjs` | 31 Tests, davon fuenf Mutationstests. |
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

Der Abgleich hat den gelieferten Bestand zum ersten Mal mit der feinen
Gattungsliste gelesen. **327 der 5.684 Titel** stehen jetzt auf
`REVIEW`. Alle bleiben im Bestand.

| Befund | Anzahl | Schwere |
|---|---:|---|
| `BASELINE_PREFERRED_CONTAMINATION` | 308 | HIGH |
| `BASELINE_INACTIVE_LISTINGS` | 16 | MEDIUM |
| `BASELINE_WARRANT_CONTAMINATION` | 3 | MEDIUM |
| `BASELINE_ETF_CONTAMINATION` | 2 | HIGH |
| `BASELINE_NON_PRIMARY_VENUE` | 1 | MEDIUM |

### 6.1 Warum 308 Vorzuege durchgerutscht sind

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

Der neue Klassierer erkennt sie (`tickerMarker`, `basis:
"tickerSuffix3"`) und setzt zusaetzlich das Kennzeichen
`BASE_CLASSIFIER_MISSED_SUFFIX` — der Befund sagt also nicht nur, was
das Papier ist, sondern auch, warum es bisher anders gefuehrt wurde.

Dieselbe Luecke betrifft `-WS-A` (Optionsscheine): `VST-WS-A`,
`SATX-WS-A`, `NE-WS-A`.

### 6.2 Die uebrigen Befunde

* **2 ETF** (`BNY`, `GHI`) — beide vom Anbieter selbst als
  `assetType: ETF` gefuehrt und beide inaktiv. Sie stammen aus der
  Nestung ueber `GATE_2000`.
* **16 inaktive Listings**, darunter `SUNE`, `COHR`, `SIRI`, `FLNA`.
* **1 Titel auf `EXPM`** (`EFOR`) — Expert Market, ein
  Ausserboersen-Segment. Er kam ueber die kuratierte `GATE_100`-Saat
  herein, die den OTC-Filter der regelbasierten Auswahl nicht
  durchlaeuft.
* **0 doppelte Ticker** im Bestand. Der Bestand ist in diesem Punkt
  sauber.

## 7. Was zu einer Erweiterung fehlt

Die Anbieterliste selbst konnte in der Werkstatt **nicht geladen**
werden: `apimedia.tiingo.com` ist vom Egress-Regelwerk der Umgebung
gesperrt (`connect_rejected`, HTTP 403 am Gateway), und `.market-cache/`
ist gitignored und in einem frischen Klon leer.

Der Lauf meldet das als Befund und raet nicht:

```
RAW_US_PROVIDER_CANDIDATES      NOT_FETCHED_THIS_RUN
NEW_ELIGIBLE_ADDITIONS          NOT_MEASURABLE_WITHOUT_PROVIDER_LIST
FINAL_PROPOSED_US_EQUITY_COUNT  PENDING_PROVIDER_FETCH (floor: 5.684)
```

`.github/workflows/tiingo-us-discovery.yml` ist der Ort, an dem die
Liste geladen wird — dort ist das Netz offen. Der Lauf kostet **null
Anfragen an die Kurs-API**; er laedt eine offene Datei von rund 800 KB.

### 7.1 Was sich aus der committeten Bilanz ableiten laesst

`quant/data/market/universe/summary.json` traegt Zahlen ueber die
108.573 Anbieterzeilen des Laufs vom 2026-09-09 — Zahlen ueber die
Liste, nicht die Liste. Daraus:

| US-Regelplatz | screenerfaehig (grob) | im Bestand | Differenz |
|---|---:|---:|---:|
| NASDAQ | 4.908 | 3.215 | 1.693 |
| NYSE | 2.718 | 2.229 | 489 |
| AMEX | 252 | 197 | 55 |
| BATS | 225 | 15 | 210 |
| NYSE MKT | 32 | 18 | 14 |
| NYSE ARCA | 23 | 9 | 14 |
| **Summe** | **8.158** | **5.683** | **2.475** |

(Der 5.684. Titel steht auf `EXPM` und faellt in dieser Tabelle nicht an.)

**Diese 2.475 sind eine Obergrenze, keine Untergrenze.** Die Bilanz
zaehlt in der groben Gattungsliste, in der Vorzuege in dreiteiliger
Schreibweise und Optionsscheine als Stammaktie mitlaufen. Die Zahl der
tatsaechlichen Neuzugaenge liegt darunter. Der Wert traegt im Artefakt
das Etikett `COARSE_CLASSIFIER_UPPER_BOUND`.

### 7.2 Woher die Differenz kommt

Nicht aus einem Anbieterlimit. Aus **unserer eigenen Auswahlregel**:
`ruleBasedCandidates()` in `select-gate-universe.mjs` verlangt
`minHistoryYears: 3`. Ein Titel, der nach dem 2023-09 erstmals
gehandelt wurde, war fuer `FULL_UNIVERSE` nicht waehlbar.

Das ist eine **Auswahlregel und keine Gattungsfrage**. Ein Titel von
gestern ist eine Aktie. Der neue Klassierer wendet die Drei-Jahres-Regel
deshalb **nicht** auf die Foerderfaehigkeit an (Test SM21) — sie
gehoert in die Backfill-Bereitschaft, nicht in die Universumsfrage.

Der zweite Block sind ausserboerslich gehandelte Stammaktien: 17.109
screenerfaehige OTC-Zeilen. Sie sind US-gelistet und sie sind Aktien.
Sie stehen trotzdem nicht in der Primaerzahl, weil der Bestand keine
enthaelt und sie nachtraeglich einzurechnen eine **Politikentscheidung**
waere. Sie bekommen `eligibility_reason:
OTC_VENUE_OUT_OF_CURRENT_POLICY` und werden gezaehlt
(`OTC_COMMON_DEFERRED`), damit die Entscheidung mit einer Zahl
getroffen werden kann.

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

Hochgerechnet auf eine Erweiterung:

| Neue Titel | Anfragen | Laufzeit | Download | Speicher | Faktoren |
|---:|---:|---:|---:|---:|---:|
| 500 | ~500 | ~5 min | ~376 MB | ~682 MB | ~5 s |
| 1.000 | ~1.000 | ~10 min | ~734 MB | ~1,4 GB | ~10 s |
| 2.475 (Obergrenze) | ~2.476 | ~24 min | ~1,8 GB | ~3,2 GB | ~25 s |

Das Stundenbudget liegt bei 12.000 Anfragen; der Anbieter hat in einem
Lauf mit 5.686 Anfragen keine einzige abgelehnt. **Jede dieser Groessen
passt in einen einzigen Lauf.**

**Ein vollstaendiger Neulauf ist nicht noetig.** `resumable.status` des
letzten Laufs ist `COMPLETE` fuer alle 5.684 Titel, und die Reihen
liegen je Titel getrennt in der Arbeitsablage. Einen unveraenderten
Titel erneut zu holen liefert dieselbe Reihe — kein Gewinn, derselbe
Verkehr. Ein voller Neulauf kostete ~56 min und ~4,2 GB Download fuer
nichts.

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

31 Tests in `quant/tests/us-security-master.test.mjs`.

| Bereich | Tests |
|---|---|
| Schema und Aufzaehlungen | SM01–SM03 |
| Nicht-destruktiv | SM10–SM13 |
| Anhaengende Aufnahme | SM20–SM22 |
| Klassifikation | SM30–SM38 |
| Kontamination und Doppel | SM40–SM45 |
| Auszaehlung | SM50 |
| Das erzeugte Artefakt | SM60–SM64 |

**Mutationstests.** SM12 greift die nicht-destruktive Wache selbst an:
Titel weg → wirft; Titel als `ADDED` → wirft; Titel als
`EXCLUDED_CANDIDATE` → wirft; unbekannter Status → wirft. Eine Wache,
die nie ausgeloest hat, ist keine bewiesene Wache.

SM35/SM36 pruefen die andere Richtung: ein Klassierer ohne Beleg muss
`UNKNOWN` liefern und ein unbekannter Handelsplatz `REVIEW` — nicht
`EQUITY_COMMON`. **Ein kaputter Klassierer faellt nach REVIEW/UNKNOWN
und entfernt nichts.**

## 12. Naechster Schritt

Ein Push auf einen `claude/**`-Branch mit der Marke
`[tiingo-discovery]`, der eine der vier beobachteten Dateien aendert,
laedt die Anbieterliste und fuellt die offenen Zahlen.

**Danach ist Schluss.** Der historische Backfill braucht die
ausdrueckliche Freigabe des Eigentuemers.
