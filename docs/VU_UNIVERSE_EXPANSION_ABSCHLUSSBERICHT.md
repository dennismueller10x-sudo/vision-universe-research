# ABSCHLUSSBERICHT — UNIVERSE EXPANSION & DATA STREAM (§58)

Die sechzehn Fragen aus §58, in ihrer Reihenfolge. Jede Zahl stammt aus
einem Artefakt im Repository, kein Wert ist gerundet oder geschätzt (§44).
Wo nichts gemessen wurde, steht das da — nicht eine Null (§30).

---

## 1. Warum waren es vorher 498?

**Zwei Zeilen Code. Keine Anbietergrenze, keine Lizenzgrenze, keine
Pagination, kein Rate Limit, keine statische Liste.**

`scripts/market/build-market-factors.mjs:71`

```js
const DETAIL_LIMIT = parseInt(arg("--detail-limit", "500"), 10) || 500;
```

Oberhalb von 500 Titeln wandern die Faktor-Einzelzeilen in die
Arbeitsablage (gitignored). Begründung im Code: **Dateigröße** („die
Faktorzeilen von 5.684 Titeln sind 15,5 MB"). Folge:
`factors-GATE_2000.json` und `factors-FULL_UNIVERSE.json` existieren im
Repository nicht.

`scripts/discover/build-discover-data.mjs:258-260` (vor dieser Arbeit)

```js
const factors  = readJSON(".../factors-GATE_500.json");
const universe = readJSON(".../universe-GATE_500.json");
```

Discover las die größte Faktordatei, die es im Repository **gibt** — und
das war wegen der ersten Zeile die von GATE_500. 500 Titel ausgewählt,
2 ohne ausreichende Historie, **498**.

Der FULL-UNIVERSE-Lauf (Actions 34374652149) hatte zu diesem Zeitpunkt
längst 5.684 Titel geholt und geprüft. Sie kamen nur nie an.

Vollständige Herleitung: `docs/VU_UNIVERSE_EXPANSION.md`.

## 2. Wie viele Provider-Instrumente wurden gefunden?

**108.573** Zeilen in `supported_tickers.zip`
(`quant/data/market/universe/summary.json`, Lauf 34374652149).

Aufteilung: 47.888 COMMON_STOCK · 49.878 FUND · 9.587 ETF · 697 WARRANT ·
494 OTHER · 29 PREFERRED. Davon **31.320 screenerfähig**, 14.211
nicht-außerbörslich, 66.111 aktiv, 42.462 inaktiv.

> Diese Liste liegt in der Arbeitsablage. Sie ist Anbieterinhalt und
> trägt `redistribution.fullList: LEGAL_REVIEW_REQUIRED` — aus dieser
> Bauumgebung ist `api.tiingo.com` zudem nicht erreichbar. Aufgenommen
> wurde deshalb der **bereits im Repository liegende Auszug** derselben
> Quelle: die vier Gate-Universen, zusammen 5.691 Zeilen.

## 3. Wie viele davon sind Aktien?

**5.688** im Company Master (`TOTAL_EQUITIES`) — bezogen auf den
aufgenommenen Auszug. Im vollständigen Anbieterverzeichnis sind es
31.320 screenerfähige Instrumente.

## 4. Wie viele Common Stocks?

**5.688.** Dazu 2 ETFs, 0 ADRs, 0 Preferred, 0 Warrants, 0 mit
unbestimmbarer Gattung.

> **ADR = 0 ist eine Untergrenze, keine Zählung.** Ohne Firmennamen ist
> ein ADR nicht von einer Stammaktie zu unterscheiden. Das Feld trägt
> `adrEvidence: "unavailable"`, und die Klassifikation sagt das offen,
> statt zu raten.

## 5. Wie viele aktive Titel?

**5.675 aktiv · 15 beendet · 0 unbestimmbar.** Die 15 sind nicht gelöscht:
sie tragen `active: false`, ein `delistedAt` und die Grundlage dieser
Ableitung (§11).

## 6. Wie viele US-Titel?

**5.690 — alle.** Die Auslieferungsregel umfasst US-Primärbörsen
(NASDAQ 3.217, NYSE 2.234, AMEX 197, NYSE MKT 18, BATS 15, NYSE ARCA 9).
Nicht-US: 0. Land unbestimmbar: 0. Außerbörslich: 0.

## 7. Wie viele besitzen CIK?

**0 — und das ist ein Befund über die Umgebung, nicht über die Pipeline.**

`sec.gov` ist aus dieser Bauumgebung nicht erreichbar; der Egress-Proxy
weist `CONNECT www.sec.gov:443` mit **403** ab (gemessen, im Proxy-Status
protokolliert). `quant/data/universe/cik-map.json` trägt deshalb
`status: "UNAVAILABLE"` mit dem HTTP-Befund.

Es wurde ausdrücklich **keine ersatzweise Zuordnung** gebaut. Der Weg
selbst steht und ist ohne Netz geprüft: `quant/tests/sec-universe-scale.test.mjs`
schiebt eine CIK-Zuordnung unter und belegt, dass das SEC-Universum von
5 auf **über 1.000** Emittenten wächst. Es fehlt ein Workflow-Lauf, keine
Zeile Code.

## 8. Wie viele besitzen Kursdaten?

| | |
|---|---|
| beim Anbieter belegt | **5.690** (`HAS_PRICE_HISTORY: PROVIDER_VERIFIED`) |
| davon mit aktuellem Stand | 5.656 |
| **ausgeliefert** | **5** |

Die Trennung ist der Punkt. 5.690 heißt: der Datenweg hat die Reihen
geholt und geprüft. 5 heißt: so viele liegen im Repository und
funktionieren ohne Anbieterzugang. Ohne diese zwei Zahlen nebeneinander
stünde für 5.684 Titel „hat Kursverlauf", und das Chart bliebe leer.

## 9. Wie viele besitzen historische Charts?

**5** — die Development-Preview-Titel (AAPL, MSFT, NVDA, JPM, XOM).
Absolute Kursniveaus realer Titel bleiben nach der Redistributionsregel
zurück; das ist eine **Lizenzfrage, keine technische**.

Die Aktienseite jedes anderen Titels sagt das in einer Zeile, statt ein
leeres Chart zu zeigen.

## 10. Wie viele besitzen Fundamentals?

**5** — die Golden Five. Grund und Weg: Frage 7 und
`docs/VU_SEC_UNIVERSE_SCALE.md`.

## 11. Welche Daten fehlen weiterhin?

| Lücke | Zahl | Grund |
|---|---|---|
| Firmennamen | 5.173 von 5.690 | Die Anbieter-Tickerliste führt keine Namen. |
| Sektor / Branche | alle bis auf die kuratierten | Liegt bei Tiingo im Fundamentalzusatz, nicht in diesem Zugang. |
| ISIN / CUSIP / FIGI / LEI | alle | Keine vorhandene Quelle führt sie. Kein neuer kostenpflichtiger Anbieter (§32). |
| CIK | alle | sec.gov aus dieser Umgebung geblockt. |
| Ausgelieferte Kursreihen | 5.685 | Redistribution ungeklärt. |
| Bewertung, Analysten, Themen | alle | Setzen Fundamentaldaten voraus bzw. sind lizenzpflichtig. |

Keine dieser Lücken ist geschätzt oder mit einem Platzhalter gefüllt. Sie
stehen als Feld im Artefakt.

## 12. Welche Lücken benötigen später einen weiteren Provider?

Nur zwei — und beide erst nach dem SEC-Lauf:

| Lücke | Warum kein vorhandener Anbieter reicht |
|---|---|
| **Sektor / Branche** | Die SEC liefert SIC-Codes, aber keine GICS-Sektoren. SIC ist grob und veraltet; für die Sektor-Reihen in Discover reicht es nicht. |
| **ISIN / CUSIP / FIGI** | Keine öffentliche Quelle. OpenFIGI wäre der kostenlose Kandidat — zu prüfen, nicht zu kaufen. |

Alles Übrige — Firmennamen, CIK, Geschäftszahlen, Handelsplätze — deckt
die SEC ab, **kostenlos**. Analystendaten bleiben bewusst außen vor (§32).

## 13. Welche Tests wurden durchgeführt?

| Suite | Anzahl | Stand |
|---|---|---|
| Quant (`quant/tests/*.test.mjs`) | **731** | grün (684 vorher + 47 neu) |
| Discover (`discover/tests/*.test.mjs`) | **118** | grün |
| SEC / Python (`cli.py test`) | **257** | grün (249 vorher + 8 neu) |
| Prüfung des Company Master | **650** | 0 Befunde |
| Browser-QA Universe Expansion | **19** | grün |
| Browser-QA Discover (Bestand) | **63** | grün |

Neu abgedeckt: Universe Sync, Idempotenz, Deduplizierung, stabile IDs,
Wiederverwendung von Kürzeln, Delisting, Reaktivierung,
Security-Klassifikation, Provider-Mapping, CIK-Mapping, Suche,
Lazy Loading, Fähigkeitsmatrix, URL-Kompatibilität mit dem Bestand,
Sammelweg für companyfacts.

**Drei Befunde hat der Scale Test bzw. die Browser-QA gefunden, nicht das
Nachdenken:**

1. Die Erkennung wiederverwendeter Kürzel löste bei widersprüchlichen
   Anbieterdaten (Startdatum nach Enddatum) **bei jedem Lauf** eine neue
   Generation aus — derselbe Titel hätte bei jedem Sync eine neue ID
   bekommen.
2. Einbuchstabige Kürzel (F, T, C, A — Ford, AT&T, Citigroup, Agilent)
   landeten in einer Sammelscherbe und waren damit **unauffindbar**.
3. Zwei Prüfungen im Verifier haben nichts geprüft und trotzdem „ok"
   gemeldet, weil sie stillschweigend übersprangen, was sie nicht lesen
   konnten.

## 14. Welche Performance wurde bei mehreren Tausend Titeln gemessen?

`quant/data/universe/scale-test.json`, synthetische Instrumente durch
dieselbe Klassifikation, denselben Sync und denselben Indexbau wie echte:

| | 25.000 | 50.000 |
|---|---|---|
| Normalisierung | 82 ms (0,003 ms/Titel) | 132 ms |
| Sync kalt | 196 ms | 449 ms |
| Sync wiederholt | 443 ms, **idempotent** | 978 ms, **idempotent** |
| Hälfte weggenommen | 407 ms, **nichts verloren** | 1.035 ms, **nichts verloren** |
| Qualitätsbericht | 116 ms | 302 ms |
| Indexbau | 21 ms | 56 ms |
| Serialisierung | 107 ms | 247 ms |
| Master gesamt | 18,4 MB | 36,9 MB |
| Suchindex gesamt | 2,4 MB | 4,7 MB |
| **größte Suchscherbe** | **5 KB** | **9 KB** |
| Suche je Anfrage | 0,015 ms | 0,025 ms |
| Heap | 188 MB | 344 MB |

Der reale Stand: 5.690 Instrumente, 623 Scherben, 4,44 MB Master, 781 KB
Suchindex, Sync 71 ms.

**Im Browser gemessen** (Playwright, lokaler Server): eine Suchanfrage
lädt **110,6 KB in vier Abrufen**, die Startseite rendert **72 Karten**
(nicht 5.690), kein horizontaler Überlauf bei 390 px.

## 15. Welche Commits wurden erstellt?

| Commit | Inhalt |
|---|---|
| `38d69dd` | Die 498 waren zwei Zeilen Code, kein Anbieterlimit — Company Master, Engine, Skripte, Scale Test |
| `ba61836` | Suche und Aktienseite kennen das ganze Universum — Frontend-Vertrag, Discover-Entkopplung, Browser-QA |
| `6a75b0c` | Das SEC-Universum kommt aus dem Company Master — CIK-Zuordnung, Sammelweg, Workflow |
| `(dieser)` | Abschlussbericht, Ledger, Fähigkeitsbelege |

## 16. Welcher Branch enthält die Arbeit?

**`claude/vision-universe-expansion-j633h8`**

Nicht nach `main` gemergt, nicht deployt. Kein Pull Request geöffnet —
§52 schließt Merge und Deployment ausdrücklich von den eigenmächtigen
Entscheidungen aus.

---

## Abnahme §55 — Universe

| | |
|---|---|
| Ursache der 498 gefunden | **ja** — zwei Zeilen, benannt und belegt |
| künstliche Universe-Begrenzung entfernt | **ja** — Discover sucht die Faktordatei, statt sie zu nennen |
| vollständiges verfügbares Provider Universe eingelesen | **teilweise** — 5.691 von 108.573; der Rest braucht einen Lauf mit Zugang, keine Codeänderung |
| Security Types klassifiziert | **ja** — 9 Klassen, UNKNOWN ist ein Ergebnis |
| Common Stocks identifizierbar | **ja** — 5.688 |
| Company Master zentral | **ja** — eine Liste, alle Oberflächen |
| Stable IDs | **ja** — `vu_<14 hex>`, reproduzierbar, nicht am Ticker |
| Provider Mapping | **ja** — `providerIds{}` je Instrument |
| Pagination vollständig | **ja** — geprüft: die Tickerliste kommt als eine ZIP, es gibt keine Seiten |
| Universe Sync idempotent | **ja** — gemessen bei 5.691 und bei 50.000 |
| Search kennt das volle Universe | **ja** — im Browser an PLTR belegt |
| Stock Page öffnet Titel außerhalb der 498 | **ja** — im Browser belegt |
| Charts funktionieren, wo Daten vorliegen | **ja** — NVDA zeigt sein Chart, PLTR sagt warum nicht |
| Frontend lädt keine 7.000 Titel | **ja** — 110 KB je Suche, 72 Karten auf der Startseite |
| Coverage Report erzeugt | **ja** — `quant/data/universe/coverage-report.json` |
| Tests grün | **ja** — 731 + 118 + 257 + 650 + 19 + 63 |

## Vorher / Nachher (§44)

```
VORHER:   498
NACHHER:  5.690
```

Gezählt in `quant/data/universe/coverage-report.json`, nicht behauptet.

**Warum nicht 7.000+:** weil gezählt wird. 5.690 ist, was aus dem im
Repository liegenden Anbieterauszug unter den geltenden
Auslieferungsregeln entsteht. Die Architektur hat **keine Obergrenze** —
`size.maxInstruments: null`, und die CI prüft sowohl diese Zeile als auch,
dass kein `MAX_STOCKS`-artiges Konstrukt existiert. Ein Lauf mit Zugang
gegen die 108.573 Zeilen nimmt auf, was die Aufnahmeregeln erlauben; die
Zahl ergibt sich dann aus dem Anbieter und nicht aus dem Code.

## Übergabestelle (§50)

Der nächste Schritt ist **ein Workflow-Lauf**, kein Umbau:

```
Actions → "Company Master — Universum, Suchindex, CIK" → sync: true
```

Er holt das vollständige Anbieterverzeichnis und die CIK-Zuordnung, baut
Master, Suchindex, Deckungsbericht, SEC-Universum und die
Discover-Payloads neu und committet. Danach:

1. **Company Master** — Größe aus dem Anbieter statt aus dem Auszug
2. **CIK Coverage** — gezählt statt 0
3. **SEC Fundamentals** — `cli.py ingest --universe quant/data/universe/sec-universe.json --skip-unresolved --bulk`
4. **Fundamental Normalization** — steht seit Phase 4, unverändert
5. **Derived Metrics** — desgleichen
6. **Stock Page Coverage** — `getFundamentals()` konsumiert sie bereits

Was dafür entschieden werden muss und **nicht** ohne Freigabe entschieden
wurde (§52): ob die vollständige Anbieter-Tickerliste über den bereits
ausgelieferten Umfang hinaus veröffentlicht werden darf
(`redistribution.fullList: LEGAL_REVIEW_REQUIRED`), und ob die
Kursreihen ausgeliefert werden dürfen.
