# VU UNIVERSE EXPANSION — 498 → das verfügbare Aktienuniversum

Dieses Dokument beantwortet zuerst eine Frage und baut erst danach etwas:

> **Warum sind es heute 498?**

Ohne diese Antwort wäre jede Erweiterung geraten.

---

## 1. Der Befund: CURRENT_UNIVERSE_SOURCE, CURRENT_UNIVERSE_SIZE, WHY_498

| | |
|---|---|
| **CURRENT_UNIVERSE_SOURCE** | `quant/data/market/factors/factors-GATE_500.json` |
| **CURRENT_UNIVERSE_SIZE** | **498** |
| **WHY_498** | zwei Zeilen Code, keine Anbietergrenze |

### Der Codepfad, Zeile für Zeile

```
quant/config/tiingo-scale.json          gates[].id = GATE_500, size = 500
        ↓
scripts/market/select-gate-universe.mjs regelbasierte Auswahl → 500 Titel
        ↓  quant/data/market/scale/universe-GATE_500.json   (500 securities)
        ↓
scripts/market/build-market-factors.mjs Faktoren je Titel; 2 Titel fallen
                                        wegen zu kurzer Historie aus  → 498
        ↓  quant/data/market/factors/factors-GATE_500.json  (498 securities)
        ↓
scripts/discover/build-discover-data.mjs:258-260
                                        liest GENAU DIESE DATEI, hart verdrahtet
        ↓
discover/data/search/US_REAL.json       498 Einträge
discover/data/stocks/US_REAL/*.json     498 Dateien
discover/data/rows/US_REAL/*.json       Reihen aus denselben 498
```

### Die beiden Zeilen

**Erstens**, `scripts/market/build-market-factors.mjs:71`:

```js
const DETAIL_LIMIT = parseInt(arg("--detail-limit", "500"), 10) || 500;
```

Oberhalb von 500 Titeln wandern die Faktor-Einzelzeilen in die
Arbeitsablage (`.market-cache/`, gitignored); ausgeliefert werden nur
Deckungsbilanz und Screener. Die Begründung im Code ist **Dateigröße**
(„die Faktorzeilen von 5.684 Titeln sind 15,5 MB"), nicht Lizenz und
nicht Anbieter. Folge: `factors-GATE_2000.json` und
`factors-FULL_UNIVERSE.json` existieren im Repository **nicht**.

**Zweitens**, `scripts/discover/build-discover-data.mjs:258-260`:

```js
const factors  = readJSON(join(root, "quant/data/market/factors/factors-GATE_500.json"));
const universe = readJSON(join(root, "quant/data/market/scale/universe-GATE_500.json"));
```

Discover liest die größte Faktordatei, die es im Repository *gibt* — und
das ist wegen der ersten Zeile die von GATE_500.

### Was die 498 ausdrücklich **nicht** sind

| Vermutung | Befund |
|---|---|
| Anbietergrenze | Nein. Tiingo liefert **108.573** Zeilen (`quant/data/market/universe/summary.json`). |
| Lizenzgrenze | Nein für diese Zahl. Die Lizenzfrage betrifft die *vollständige Tickerliste* und die *Kursreihen* — nicht 498 gegen 5.684. |
| Pagination | Nein. Der Anbieter liefert die Tickerliste als eine ZIP-Datei; es gibt keine Seiten, an denen etwas abbrechen könnte. |
| Rate Limit | Nein. Der FULL_UNIVERSE-Lauf stellte 5.686 Anfragen bei einem Stundenbudget von 12.000, ohne ein einziges HTTP 429. |
| Ein 500er-Konstante irgendwo in der UI | Nein. Keine Oberfläche kennt eine Zahl. |
| MVP-Altlast / statische JSON-Liste | Nein. Die 498 entstehen bei jedem Build neu. |

**Das Universum war nie beschränkt — die Auslieferung war es.** Der
FULL-UNIVERSE-Lauf (Actions-Lauf 34374652149) hat **5.684** Titel geholt,
geprüft und verfaktort; davon kamen 498 im Frontend an.

---

## 2. Was daraus folgt

Die Aufgabe ist deshalb nicht „mehr Daten holen" — die Daten sind da. Die
Aufgabe ist eine **Datenschicht zwischen Anbieter und Oberfläche**, die
nicht mehr an einem Gate-Artefakt hängt.

---

## 3. Zielarchitektur — der kanonische Company Master

```
PROVIDER SYMBOL DIRECTORY      supported_tickers.zip (108.573 Zeilen)
        ↓
INGESTION                      scripts/market/build-market-universe.mjs
        ↓
NORMALIZATION                  quant/engines/company-master.js
        ↓
SECURITY CLASSIFICATION        quant/engines/instrument-classification.js
        ↓
CANONICAL COMPANY MASTER       quant/data/universe/instruments/<XX>.json
        ↓
PROVIDER IDENTIFIER MAPPING    instrument.providerIds{}
        ↓
DATA CAPABILITIES              quant/data/universe/capability-summary.json
        ↓
PRICE / FUNDAMENTALS / QUANT   bestehende Engines, unverändert
        ↓
SEARCH / DISCOVER / STOCK PAGE quant/data/universe/search/**
```

**Ein Master, alle Oberflächen.** Discover, Suche, Aktienseite, Markets
und Watchlist lösen gegen dasselbe Verzeichnis auf. Es gibt kein
Discover-Universum und kein Such-Universum mehr.

### Der Schlüssel ist nicht der Ticker (§8)

Jedes Instrument trägt eine `instrumentId` der Form `vu_<14 hex>`,
abgeleitet aus `provider | exchange | providerSymbol` plus einer
`generation`. Die Generation zählt hoch, wenn dasselbe Kürzel an
derselben Börse ein zweites Mal vergeben wird.

Warum das kein Selbstzweck ist, zeigt der eigene Bestand: **COHR** liegt
im Anbieterverzeichnis zweimal — einmal NYSE, einmal NASDAQ. Unter einem
Ticker-Primärschlüssel wären das ein Datensatz und ein stiller
Datenverlust.

Das Startdatum geht **nicht** in die ID ein: Anbieter korrigieren
Startdaten nachträglich, und eine ID, die sich bei einer Datenkorrektur
ändert, ist keine ID.

### URL- und Bestandsverträglichkeit (§41, §42)

Die bestehenden `securityId`s (`ref_AAPL`, `ref_BRK_A`) bleiben als
`legacyIds` am Instrument. Alle **498** bestehenden Aktienseiten lösen im
Master auf — geprüft in `scripts/universe/verify-company-master.mjs`, nicht
behauptet. Ticker bleiben in URLs.

---

## 4. Was gebaut wurde

| Datei | Rolle |
|---|---|
| `quant/engines/company-master.js` | Identität, Normalisierung, idempotenter Sync, Fähigkeiten, Suchindex, Qualität, Deckung |
| `quant/config/company-master.json` | Politik: Aufnahme, Auslieferung, Scherben, Suche. **`size.maxInstruments: null`** |
| `scripts/universe/build-company-master.mjs` | Verzeichnis → Master, in Scherben, mit Sync-Protokoll |
| `scripts/universe/build-universe-indexes.mjs` | Master → Suchindex, Fähigkeitsmatrix, Deckungsbericht |
| `scripts/universe/build-cik-map.mjs` | SEC-Verzeichnisse → CIK + Firmenname für das US-Universum |
| `scripts/universe/verify-company-master.mjs` | 629 Prüfungen gegen den ausgelieferten Stand |
| `scripts/universe/scale-test.mjs` | Messung an 25.000 und 50.000 Instrumenten |

### Keine Obergrenze (§6)

`quant/config/company-master.json`:

```json
"size": { "maxInstruments": null }
```

Und `verify-company-master.mjs` prüft genau das:
„Keine Zielgröße im Master hinterlegt". Es gibt kein `MAX_STOCKS = 7000`,
und es darf keines geben.

### Auslieferungsgrenze ≠ Größengrenze (§32)

Was im Master steht, und was im öffentlichen Repository landet, sind zwei
Fragen. Ausgeliefert wird nach `publish.rules`: US-Primärbörsen, USD,
keine außerbörslichen Titel, keine Investmentfonds. Das ist **derselbe
Umfang, der mit PR #60 bereits im Repository liegt** — keine neue
Lizenzentscheidung, nur die Aufhebung der technischen Begrenzung. Der
vollständige Master liegt in der Arbeitsablage.

---

## 5. Idempotenz (§14, §15)

`syncUniverse()` kennt fünf Ausgänge: **NEW · UPDATED · UNCHANGED ·
DELISTED · REACTIVATED**.

Ein zweiter Lauf auf derselben Quelle liefert ausschließlich `UNCHANGED`
— gemessen:

```
Sync: 0 neu · 0 geaendert · 5691 unveraendert · 0 beendet · 0 reaktiviert
604 Scherben (0 geschrieben, 604 unveraendert)
```

Delistete Titel werden **beendet, nicht gelöscht** (§11): `active: false`,
`delistedAt` mit Datum, wo der Anbieter eines nennt. Der Scale Test nimmt
die Hälfte des Eingangs weg und prüft, dass kein Instrument verschwindet.

### Ein Befund, den erst der Scale Test gefunden hat

Die erste Fassung der Ticker-Wiederverwendung erkannte ein neu vergebenes
Kürzel an „Bestand beendet **und** Eingang beginnt danach". Bei einer
widersprüchlichen Anbieterzeile — Startdatum nach Enddatum, das kommt vor
— löste diese Regel bei **jedem** Lauf eine neue Generation aus: derselbe
Titel hätte bei jedem Sync eine neue ID bekommen. Die Regel verlangt jetzt
zusätzlich ein *anderes* Startdatum. Gefunden hat das der Lauf über 25.000
Instrumente, nicht das Nachdenken.

---

## 6. Messung bei mehreren Tausend Titeln (§47)

`quant/data/universe/scale-test.json`, synthetische Instrumente durch
dieselbe Klassifikation, denselben Sync, denselben Indexbau:

| | 25.000 | 50.000 |
|---|---|---|
| Normalisierung | 82 ms | 132 ms |
| Sync (kalt) | 196 ms | 449 ms |
| Sync (Wiederholung) | 443 ms, idempotent | 978 ms, idempotent |
| Hälfte weggenommen | 407 ms, nichts verloren | 1.035 ms, nichts verloren |
| Qualitätsbericht | 116 ms | 302 ms |
| Indexbau | 21 ms | 56 ms |
| Serialisierung | 107 ms | 247 ms |
| Master gesamt | 18,4 MB | 36,9 MB |
| Suchindex gesamt | 2,4 MB | 4,7 MB |
| **größte Suchscherbe** | **5 KB** | **9 KB** |
| Suche je Anfrage | 0,015 ms | 0,025 ms |
| Heap | 188 MB | 344 MB |

Die vorletzte Zeile ist die eigentliche Antwort auf §16 und §49: Der
Browser lädt **5 bis 9 Kilobyte** je Suchanfrage, nicht das Universum.

---

## 7. Vorher / Nachher (§44)

| | vorher | nachher |
|---|---|---|
| Instrumente im ausgelieferten Universum | **498** | **5.690** |
| Quelle | `factors-GATE_500.json` | `quant/data/universe/instruments/**` |
| Primärschlüssel | Ticker | `instrumentId` |
| delistete Titel | nicht geführt | 15, mit Datum |
| Kursverlauf beim Anbieter belegt | 498 | **5.690** |
| Kursverlauf ausgeliefert | 5 | 5 (unverändert — Redistribution) |
| Firmennamen | 498 (kuratiert) | 517 |
| CIK | 5 (von Hand) | siehe `docs/VU_SEC_UNIVERSE_SCALE.md` |

Die genauen Zahlen stehen maschinenlesbar in
`quant/data/universe/coverage-report.json`.

### Warum 5.690 und nicht 7.000+

Weil **gezählt** wird und nicht gerundet (§44). Die 5.690 sind das, was
aus dem im Repository liegenden Anbieterauszug unter den geltenden
Auslieferungsregeln entsteht — der Auszug der FULL-UNIVERSE-Läufe:
US-Primärbörse, USD, aktiv oder mit Enddatum, mindestens drei Jahre
Historie.

Das vollständige Anbieterverzeichnis (108.573 Zeilen, davon **31.320**
screenerfähig und **14.211** nicht-außerbörslich) liegt in der
Arbeitsablage und ist ohne Anbieterzugang aus dieser Bauumgebung nicht
abrufbar. **Die Pipeline hat dafür keine Grenze**: läuft
`build-company-master.mjs` mit gesetztem `TIINGO_API_KEY` gegen das frisch
gezogene Verzeichnis, nimmt derselbe Lauf alles auf, was die
Aufnahmeregeln erlauben — `manifest.source.complete` steht dann auf `true`
statt auf `false`, und die Zahl ergibt sich aus dem Anbieter.

Der Weg dorthin ist ein Workflow-Lauf, kein Umbau:
`.github/workflows/universe-master.yml`.

---

## 8. Was weiterhin fehlt

| Lücke | Grund | Was sie schließt |
|---|---|---|
| Firmennamen für 5.173 Titel | Die Anbieter-Tickerliste trägt keine Namen. | Der SEC-Lauf (`build-cik-map.mjs`) in Actions — er liefert Namen **und** CIK für praktisch jeden US-Einreicher, kostenlos. |
| Sektor / Branche | Liegt bei Tiingo im Fundamentalzusatz, der in diesem Zugang nicht enthalten ist. | Ein Anbieter mit Stammdaten, oder SIC aus den SEC-Submissions. |
| ISIN / CUSIP / FIGI / LEI | Keine vorhandene Quelle führt sie. Kein neuer kostenpflichtiger Anbieter (§32). | Die Felder stehen im Schema und bleiben `null`. |
| ADR-Trennung | Ohne Firmennamen nicht von einer Stammaktie zu unterscheiden. `TOTAL_ADRS` ist eine **Untergrenze**, keine Zählung. | Namen — siehe erste Zeile. |
| Ausgelieferte Kursreihen | Redistribution der Anbieterkurse ist ungeklärt. | Eine Lizenzantwort, kein Code. |

Keine dieser Lücken wird geschätzt, geraten oder mit einem Platzhalter
gefüllt. Sie stehen als Feld im Artefakt, nicht als Fußnote.
