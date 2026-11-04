# Technical-Stand je Aktie (`technical/data/stock/`)

Stand: 03.11.2026 · Schema `vu-technical-stock-1.0.0` · Engine `technical/engine/stock-summary.js`

## Wozu

Andere Produktwelten sollen auf ihrer Aktienseite zeigen können, was Technical zu dieser Aktie veröffentlicht hat
(Gegenrichtung zu „Diese Aktie in Quant und Supertrader“ in Chart Studio). Der volle Screener-Datensatz
`technical/data/screener-v1.json` (rund 6 MB) ist dafür zu schwer. Der Erzeuger schreibt deshalb kleine Scherben
mit dem Technical-Stand je Aktie in Kurzform und fertig formuliert. Leser zeigen nur an und rechnen nichts nach.

## Erzeuger und Ablauf

- Erzeuger: `scripts/technical/world/build-screener.mjs` (Domäne `technicalWorld` in `core/registry/domains.json`),
  Workflow `technical-world.yml`. Der Commit-Schritt nimmt `technical/data` vollständig auf, also auch `stock/`.
- Nur ein voller Lauf schreibt die Scherben. Ein Teillauf (`--limit`, `--tickers`) lässt sie stehen, weil er sonst
  fehlende Aktien löschen würde.
- Die Scherben entstehen vor dem Screener. Verletzt eine Scherbe den Vertrag (`StockSummary.check`) oder das Budget,
  bricht der Lauf ab, bevor irgendeine Datei überschrieben ist.
- Scherben, die es nicht mehr gibt, werden entfernt. Das betrifft nur Dateien im Format `<XX>.json`.
- Test- und Probeläufe schreiben mit `--out <Verzeichnis>`.
- **Erste Veröffentlichung:** mit dem nächsten Lauf von `technical-world.yml` nach dem Merge. Bis dahin gibt es das
  Verzeichnis nicht, und Leser zeigen „noch nicht veröffentlicht“. Die Daten werden nicht von Hand mitgebracht.

## Adresse und Verzeichnis

`/technical/data/stock/<shardKey>.json`. Die Scherbe kommt aus `core/identity.js#shardKey` (ADR-001):
`NVDA` → `NV.json`, `F` → `F_.json`, `BRK-B` → `BR.json`. Es gibt 632 Scherben für 5.663 Aktien
(Stand 02.11.2026).

`technical/data/meta.json` nennt die geschriebenen Scherben: `stock = {schema, count, shards: [..]}`, dazu
`paths.stock`. Ein Leser fragt eine Scherbe nur an, wenn sie dort steht. So gibt es keine vergebliche Anfrage
(kein 404) für ein Kürzel ohne Scherbe oder vor der ersten Veröffentlichung.

## Inhalt

Kopf je Scherbe:

| Feld | Bedeutung |
|---|---|
| `schema`, `version`, `shard`, `asOf`, `generatedFrom` | Vertrag, Scherbe, Stichtag des Screeners, Stand der Materialisierung |
| `versions` | `row` (screen-row), `templates`, `assistant` |
| `limits` | Grenze jeder Vorlage (`templates.js#LIMITS`), wird bei Treffern angezeigt |
| `labels.trend` | Namen der Trendfelder, in derselben Reihenfolge wie `stocks[T].trend` |
| `labels.structures` | Namen der Marktstruktur (`technical-query.js#STRUCTURES`) |
| `labels.formations` | Namen der Formationstypen, die in der Scherbe vorkommen |
| `labels.templates`, `labels.goals` | Titel und Chart-Parameter (`q`) je Vorlage bzw. Analyseziel |
| `labels.checked` | wie viele Vorlagen und Analyseziele geprüft wurden |

Je Aktie (`stocks[T]`):

| Feld | Quelle |
|---|---|
| `s`, `n`, `sid`, `asOf`, `fresh`, `frozenSince` | Screener-Zeile; `sid` = `core/identity.js#securityIdForTicker` |
| `structure` | Spalte `structure` (Code; Name in `labels.structures`) |
| `trend` | `aboveSma50`, `aboveSma200`, `sma50AboveSma200`, `sma200Rising` (Tageschart): `true`, `false` oder `null` (unbekannt) |
| `rsRank` | Spalte `rsRank` |
| `formations[]` | `{tf, type, state, badge, text}`. Tag aus der Spalte `formations`, Satz aus `model.js#hitSentence`. Woche aus `formationActive@1W` und `formationConfirmed@1W` |
| `templates[]`, `goals[]` | `{id, status, label, pass, total}` für `FULL`, `NEAR` und `INCOMPLETE`, ausgewertet mit `templates.js#evaluate`. Analyseziele mit ihrer Voreinstellung (`assistant.js#build`). `NONE` erscheint nicht. Eine Aktie ohne aktuellen Kurs wird nicht eingeordnet (leere Listen) |
| `dq[]` | `{code, tone, short, long}`: `FROZEN`, `BEHIND`, `NO_VOLUME`, `PRICE_JUMP_SUSPECT`, `PRICE_JUMP_CONFIRMED` (Text aus `price-jumps.js#describe`) |

Die Sätze für den Status (`label`) sind dieselben wie in der Prüfleiste von Chart Studio
(„alle Kriterien erfüllt“, „fast erfüllt – ein Kriterium fehlt“, „unvollständig – n unbekannt“).

## Größe (Stand 02.11.2026)

- Je Aktie im Median 0,7 KB JSON, höchstens 3 KB.
- Je Scherbe im Median 8 KB. Die größte Scherbe ist `IN` mit 53 Aktien und 49 KB, komprimiert ausgeliefert etwa 5 KB.
  Die Scherbe `NV` hat 12,8 KB, komprimiert 2,6 KB.
- Budget je Scherbe: 64.000 Bytes (`StockSummary.SHARD_BUDGET`). Darüber verweigert der Erzeuger.
- Alle Scherben zusammen: 7,3 MB.

## Für Leser

- Nur anzeigen, als „Technical-Analyse“ kennzeichnen, nicht als Signal. `limits` mitzeigen.
- Auf Chart Studio verlinken über `core/stock-context.js#href(ctx, "technical")`. Für eine Vorlage oder ein
  Analyseziel `?` + `labels.templates[id].q` bzw. `labels.goals[id].q` anhängen.
- Zuerst `technical/data/meta.json` lesen (4 KB). Fehlt `stock` oder die Scherbe in `stock.shards`, keine Anfrage.
- Fehlt die Scherbe oder die Aktie, oder passt das Schema nicht, dann heißt das „keine Angabe“, nie „nichts erkannt“.
- Stand anzeigen (`asOf`). `fresh: false` heißt: Kurs liegt vor dem Stichtag oder ist eingefroren, siehe `dq`.

## Tests

`technical/tests/technical-stock-summary.test.mjs`: jede Aktie genau einmal und in ihrer `shardKey`-Scherbe,
Budget, gleiche Einordnung wie `templates.js#checklist`, Felder unverändert aus der Zeile, veraltete Aktien ohne
Einordnung, Kurssprung-Text, keine Signalsprache, Erzeuger schreibt nur in ein Testverzeichnis und verweigert bei
einem Verstoß. Sobald `technical/data/stock/` veröffentlicht ist, prüft der Test auch die committeten Scherben
gegen `meta.json`.
