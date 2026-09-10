# Full-Universe-Produktnachweis

**Stand:** 2026-09-10 · Zweig `claude/full-universe-proof-y8ncfa`
**Zweck:** das bestehende Vision-Universe-/Quant-Produkt einmal mit dem
ganzen ausgelieferten Markt sehen. Kein VU2, keine Neugestaltung, keine
Fuenf-Titel-Vorfuehrung.

Dies ist eine **Abnahmeumgebung**, kein Produktschritt. Sie fuegt hinzu
und aendert nichts.

---

## 1. Isolation

### Gesperrt — nicht angefasst

Astra/Codex arbeiten parallel an Vision Universe 2.0. Diese Zweige und
die Pfade, die sie fuehren, sind **LOCKED**:

| Zweig | gefuehrte Pfade (Auswahl) |
|---|---|
| `workstream/vu2-phase0-audit` | `docs/vu2/**` |
| `workstream/vu2-lifecycle-foundation` | `quant/engines/market-store.js`, `scripts/market/ingest-tiingo.mjs` |
| `workstream/vu2-intelligence-contracts` | `quant/api/intelligence-contract.js`, `quant/engines/market-metric-registry.js` |
| `workstream/vu2-experience` | `vu2/**`, `quant/api/product-services.js`, `quant/technical/app.js`, `quant/ui/charts.js`, `scripts/vu2/**`, `.github/workflows/vu2-browser-qa.yml` |
| `workstream/vu2-eod-gates` | `quant/engines/market-eod-gate.js` |
| `workstream/vu2-research-workspaces` | `quant/api/fundamentals-contract.js` |
| `codex/sec-master-universe-large` | `scripts/quant/sec/**`, `scripts/quant/tests/**`, SEC-Workflows |
| `codex/development-preview-activation` | (gegenwaertig ohne Abweichung von `main`) |

Kein Merge, kein Rebase, kein Cherry-Pick in oder aus diesen Zweigen.
`quant/ui/charts.js` steht ausdruecklich auf dieser Liste **und** wird von
diesem Nachweis benutzt — **lesend, ueber die Fassung auf `main`**. Genau
das ist die Grenze: gemeinsame Dateien ja, aber nur gelesen.

### Grundlage dieses Zweigs

`claude/full-universe-proof-y8ncfa` ist ein Vorspulen auf
`claude/vercel-protected-preview` (a43f8b7), einen reinen Claude-Zweig ohne
VU2-Anteil. Von dort kommen drei Dinge, die dieser Nachweis braucht und
nicht neu erfindet:

* `vercel.json` — der geschuetzte Vorschau-Bau,
* `_preview-data/factors-FULL_UNIVERSE.json` — das dauerhafte
  Faktorartefakt,
* `scripts/preview/build-preview-dataset.mjs` — der Vorschaudatensatz.

### Neu in diesem Zweig

| Pfad | Art |
|---|---|
| `_proof-src/universe/**` | die Oberflaeche des Nachweises (Quelltext) |
| `scripts/proof/build-product-proof.mjs` | Bauskript (Daten + Kopie der Oberflaeche) |
| `quant/tests/product-proof.test.mjs` | PP1–PP10 |
| `docs/FULL_UNIVERSE_PRODUCT_PROOF.md` | dieses Dokument |
| `vercel.json` | **eine** Zeile: der zweite Bauschritt, plus ein Header-Block |
| `.gitignore` | zwei Bauzeit-Pfade |

Keine Datei unter `quant/ui/`, `quant/engines/`, `quant/stock/`,
`quant/screener/`, `assets/` oder im Wurzelverzeichnis der oeffentlichen
Seite wurde veraendert. PP5 misst das gegen `origin/main`, PD8 zusaetzlich
fuer die oeffentliche Auslieferung.

---

## 2. Was der Eigentuemer sieht

Drei Adressen, alle in der geschuetzten Vercel-Vorschau:

| Adresse | Was |
|---|---|
| `/universe/` | Umfang, Suche ueber **alle** Titel, Chart-Lage, Einstieg |
| `/universe/screener/` | Regelbauer auf gemessenen Faktoren + die 18 Fragen des Laufs |
| `/universe/stock/?ticker=<TICKER>` | Einzeltitel: Status, Chart, Quantum-Faktoren, Stammdaten, Herkunft |

`/preview-universe/` bleibt, was es war: die **interne** Pruefansicht. Sie
ist nicht das Produkt und wird von diesen Seiten nicht verlinkt.

### Die bekannte Oberflaeche, nicht eine zweite

Die Seiten laden `/quant/ui/quant.css`, `/quant/ui/shell.js`,
`/quant/ui/components.js`, `/quant/ui/charts.js` und
`/quant/engines/chart-ranges.js` — dieselbe Kopfzeile, dieselben
Reiter, dieselben Karten, Tabellen, Chips, Zustandsboxen und dieselbe
Zeitraumleiste wie `/quant/stock/`. Eigener CSS-Anteil:
`_proof-src/universe/ui/proof.css`, 41 Zeilen, ausschliesslich fuer
Suchfeld, Facetten und den mitlaufenden Tabellenkopf.

### Warum ein eigener Namensraum

`/quant/` laeuft auf dem synthetischen Modelluniversum: VU Quant Score,
Factor DNA, Perzentilraenge. Dieses Universum hat davon nichts — es hat
gemessene Zustaende aus echten Kursreihen. Dieselbe Seite mit beiden
Datenquellen zu speisen hiesse, zwei Bedeutungen unter einen Namen zu
legen. Ein Feld heisst deshalb „Rendite 12M" und nicht `momentum12m`.
PP8 prueft, dass kein Modellname im Feldkatalog auftaucht.

---

## 3. Zahlen des gebauten Standes

> **Keine Zahl aus diesem Dokument abschreiben.** Sie stammen aus einem
> Lauf; der naechste verschiebt sie. Der aktuelle Stand steht in
> `quant/data/proof/meta.json`. Die Tests pruefen Beziehungen und
> Untergrenzen, nie eine Messung als Invariante.

| | Stand 2026-09-10 |
|---|---|
| Titel im Universum, suchbar und aufrufbar | **5.683** |
| davon mit gemessener Faktorzeile | **5.636** |
| Faktorfelder je Titel | 44 im Screener-Katalog, 34 in der Quantum-Ansicht |
| Datenstand | 2026-09-09 |
| Snapshot | `preview_FULL_UNIVERSE_22410507fd29` |
| Faktorartefakt | `_preview-data/factors-FULL_UNIVERSE.json`, Lauf 34486165298, `PROTECTED_PREVIEW_ONLY` |
| Datenqualitaet | PASS 2.239 · WARNING 3.397 · FAIL 47 |

Die 47 Titel ohne Faktorzeile sind **trotzdem** suchbar und haben eine
Seite. Dort steht, warum nichts gerechnet wurde — nicht eine Null.

### Groessen (das entscheidet, ob es auf dem Telefon laedt)

| Datei | Groesse | wer laedt sie |
|---|---|---|
| `quant/data/proof/meta.json` | 86 KB | jede Seite |
| `quant/data/proof/index.json` | 1,5 MB | Suche und Screener |
| `quant/data/proof/rows/NN.json` | ~130 KB | der Einzeltitel, **eines** von 64 |

Die Tabelle liegt spaltenweise: ein Feldname je Spalte statt je Zeile.
Bei 5.683 Zeilen ist das der Unterschied zwischen 1,5 MB und 8,6 MB.

---

## 4. Chart — was laeuft, was nicht

Drei getrennte Fragen. Ein Sammelurteil waere genau die Verwechslung, die
der Eigentuemer ausgeschlossen hat.

### 4.1 Historischer Chart — LAEUFT

Echte Tiingo-EOD-Kerzen, im Browser gezeichnet und gemessen: 252
Kerzenkoerper, Zeitraumleiste bedienbar, 1440 px und 390 px.

| Titel | Bars | von | bis |
|---|---:|---|---|
| AAPL, MSFT, NVDA, JPM, XOM | je 2.937 | 2015-01-02 | 2026-09-08 |

**Warum nur fuenf.** Nicht der Chart ist begrenzt, sondern der Bestand:
die Kursreihen aller uebrigen Titel (rund 7,4 GB) lagen in der
Arbeitsablage des Actions-Laufs und existieren in keinem Zweig dieses
Repositorys. Ausgeliefert sind daraus die abgeleiteten Zustaende — mit
denen rechnen Suche und Screener. Fuer die fuenf Titel gibt es eine
datierte Eigentuemerfreigabe (`quant/config/development-preview.json`).
Bei jedem anderen Titel steht genau das an der Stelle des Charts.

### 4.2 Intraday-Chart — LAEUFT NICHT

* Anbieterfaehigkeit: `intraday: VERIFIED` (Laufzeitmessung 2026-09-10,
  `quant/data/market/commercial/capability-retest.json`).
* Ausgeliefert: **nichts**. Es liegen keine Intraday-Bars im Repository.
* Gate `ENABLE_LIVE_MARKET_DATA`: **false** (Lizenzpruefung offen).

**Blocker:** ein Lauf, der Intraday-Bars erzeugt, ein Ablageort ausserhalb
von Git, und eine Gate-Entscheidung. Alle drei sind Eigentuemersache.

### 4.3 Realtime / Live-Chart — LAEUFT NICHT IN DIESER AUSLIEFERUNG

Der Strom ist im **Backend** belegt:
`quant/data/market/commercial/live-candle-verification.json`,
`LIVE_CHART_READY: TRUE`, `wss://api.tiingo.com/iex`, mehrere
aufeinanderfolgende Kursereignisse, daraus eine laufende Minutenkerze mit
mehr als einem Update, gebaut mit `quant/engines/realtime/bar-merge.js` —
demselben `applyTick` wie im Chart.

**Das ist kein Produkterfolg, und es wird hier nicht als einer gezaehlt.**
Ein simulierter Chart steht auch nicht da.

**Der genaue Blocker.** Diese Vorschau ist eine statische Auslieferung.
Ein Live-Chart im Browser braucht eine Verbindung zu
`wss://api.tiingo.com/iex`, und die traegt den Anbieterschluessel. Der
Schluessel darf nicht in den Browser — das ist keine Vorsichtsmassnahme,
sondern die Bedingung, unter der der Zugang ueberhaupt benutzt wird.
Damit fehlt genau ein Bauteil: **eine serverseitige Weiterleitung**
(Edge-Funktion, die den Strom als SSE weiterreicht) mit
`TIINGO_API_KEY` in den Vercel-Umgebungsvariablen.

Das zu bauen ist Produktentwicklung und liegt ausserhalb dieser
Abnahmeumgebung. Dazu kommt eine offene fachliche Frage, die auch ein
fertiger Relay nicht loest: der Anbieter nennt die Kursart nicht
(`priceType: UNSPECIFIED`). Der Chart wuerde sich bewegen; ob die Zahl ein
Abschluss oder ein Referenzkurs ist, ist unbelegt — und alles, was auf der
Kerze rechnet, braucht diese Auskunft.

---

## 5. Wie es gebaut wird

```
node scripts/preview/build-preview-dataset.mjs      # Vorschaudatensatz
node scripts/proof/build-product-proof.mjs          # Nachweis: Daten + Oberflaeche
```

Beides steht in `vercel.json#buildCommand` und laeuft bei jeder
Vorschau-Auslieferung. Die Ausgabe (`quant/data/proof/`, `/universe/`) ist
gitignored und entsteht ausschliesslich zur Bauzeit — auf GitHub Pages
gibt es diese Dateien nicht. Die Quelle der Oberflaeche liegt unter
`_proof-src/` (fuehrender Unterstrich: Jekyll traegt solche Verzeichnisse
nicht in die Ausgabe) und ist als Code lesbar und pruefbar.

Es wird **nichts** beim Anbieter geholt und **nichts** nachgerechnet.
Quelle ist ausschliesslich der bereits geprueste Vorschaudatensatz. Fehlt
er, bricht der Bau ab (PP10) — eine Oberflaeche mit erfundenen Zahlen
waere schlimmer als gar keine.

---

## 6. Nachweise

### Die Tuer ist gemessen zu

Lauf 34515642252 (`vercel-preview-verify.yml`) gegen die Auslieferung
dieses Zweigs, Ergebnis **PREVIEW_VERIFIED**, 10 von 10:

* ohne Zugangsmittel antworten `/`, `/preview-universe/` **und**
  `/quant/data/preview/universe.json` mit HTTP 302 auf die
  Vercel-Anmeldung — die Tuer ist zu, auch fuer die JSON-Datei;
* mit Zugangsmittel: 5.683 Titel, 5.636 auswertbar, keine Kursdaten,
  `X-Robots-Tag: noindex, nofollow, noarchive`;
* auf GitHub Pages: die Vorschaupfade und das Faktorartefakt jeweils
  HTTP 404, die oeffentlichen Dateien Byte fuer Byte identisch;
* kein Schluessel im ausgelieferten Inhalt.

### Tests

`quant/tests/product-proof.test.mjs`, PP1–PP10, laufen in der Quant CI mit:

| | Frage |
|---|---|
| PP1 | Ist **jeder** ausgelieferte Titel suchbar **und** aufrufbar? (nicht Stichprobe — alle) |
| PP2 | Streuen Browser und Bauskript die Buendel gleich? |
| PP3 | Steht irgendwo ein Kursniveau oder eine Kursreihe? |
| PP4 | Sagt jede Luecke, warum sie eine ist — statt einer Null? |
| PP5 | Ist es die bestehende Oberflaeche, und blieb sie unveraendert? |
| PP6 | Entsteht die Ausgabe zur Bauzeit und bleibt aus dem Repository? |
| PP7 | Sind die drei Chart-Arten getrennt beantwortet, ohne Simulation? |
| PP8 | Rechnet der Screener auf gemessenen Groessen statt auf Modellnamen? |
| PP9 | Steht eine rohe Diagnosemarke als erste Auskunft in der Oberflaeche? |
| PP10 | Kommen die Werte unveraendert an, und bricht der Bau ohne Quelle ab? |

Gesamtstand beim Abschluss: **707 Tests, 0 Fehler**, dazu
`assert-public-data-hygiene.mjs` und `assert-no-secrets.mjs` gruen.

### Browser-QA

Chromium, `1440x960` und `390x844`, gegen den lokal gebauten Stand.
**46 von 46 Pruefungen bestanden**, darunter:

* Suche zaehlt 5.683 Titel; ein beliebiger Titel (`PBI`) ist auffindbar
  und per Klick zu oeffnen;
* AAPL-Chart gezeichnet (1200x320 bzw. 360x320, 252 Kerzen),
  Zeitraumwechsel bedienbar;
* ORCL ohne Kursreihe: Quantum-Faktoren da, Chart ausdruecklich nicht,
  Begruendung im Klartext;
* Screener liefert echte Treffer aus dem vollen Universum, eine
  strengere Regel senkt die Zahl;
* kein Querlauf auf keiner Seite in keiner Breite, keine Seitenfehler.

Was diese QA **nicht** belegt: den Zustand der ausgelieferten Vorschau.
Dieser Arbeitsplatz erreicht `*.vercel.app` nicht (der Ausgangsproxy
lehnt die Verbindung ab, `connect_rejected`). Geprueft ist damit der
Stand, der gebaut wird — nicht die Auslieferung selbst.

### Nachweis am lebenden System

Dafuer gibt es zwei Laeufe in GitHub Actions, wo das Netz offen ist:

| Workflow | Was er misst |
|---|---|
| `vercel-preview-verify.yml` | die geschuetzte Vorschau insgesamt (V1–V10) |
| `full-universe-proof-verify.yml` | **diesen** Produktnachweis (P1–P10) |

`scripts/proof/verify-product-proof.mjs` faehrt dazu einen echten
Browser gegen die ausgelieferte Adresse:

| | Frage |
|---|---|
| P1 | Werden Seiten **und** Datensatz ohne Zugangsmittel abgewiesen? |
| P2 | Traegt der ausgelieferte Datensatz das ganze Universum? |
| P3 | Liefert **jedes** der 64 Buendel seinen Titel aus? |
| P4 | Findet die Suche einen **zufaellig** gezogenen Titel, und oeffnet er sich? |
| P5 | Zeichnet der Chart echte Kerzen — auf 1440 px und auf 390 px? |
| P6 | Rechnet der Screener auf dem vollen Universum, und wirkt eine strengere Regel? |
| P7 | Laeuft bei 390 px nichts quer? |
| P8 | Steht ein Schluessel im ausgelieferten Inhalt? |
| P9 | Macht die Seite einen Strom auf, den niemand belegt hat? |
| P10 | Kennt GitHub Pages den Nachweis nicht (404)? |

Der zufaellig gezogene Titel in P4 ist Absicht: eine Vorfuehrung mit
denselben fuenf Namen beweist genau das, was hier nicht gefragt ist.

---

## 7. Grenzen dieses Nachweises

| | |
|---|---|
| **VU Quant Score** | gibt es hier nicht. Er braucht Fundamentaldaten; dieses Universum traegt keine. Eine Ersatzzahl waere eine Erfindung. |
| **Firmennamen** | fehlen. Der Anbieterzugang liefert fuer dieses Universum keinen Namen; die Suche vergleicht Ticker. Ein Ticker als Name ausgegeben saehe aus wie eine Auskunft. |
| **Sektoren** | 100 von 5.683 Titeln tragen einen kuratierten Sektor (9 Sektoren, aus GATE_100 uebernommen). Fuer alle uebrigen liefert der Zugang keinen — dort steht nichts, und es wird nichts geraten. |
| **Technical Intelligence** | fuer 27 Titel vorhanden, sonst nicht — sie braucht dieselbe Kursreihe wie der Chart. |
| **Kursniveaus** | zurueckgehalten (§34). Ausgeliefert werden Zustaende, Abstaende und Renditen — nie ein Kurs. |
| **Backtests, Strategien, Ranking, Radar, AI** | nicht angebunden. Sie laufen auf dem Modelluniversum; sie hier anzuschliessen waere Produktentwicklung. |
