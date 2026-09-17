# Discover — Price Data Completion

Stand 13.09.2026, Branch `claude/vision-universe-discover-v3`. Nicht gemergt,
nicht veröffentlicht.

## Kurzfassung

Die Kursreihen aller 498 Titel **existieren beim Anbieter und wurden bereits
ingestiert**. Dass Discover nur fünf zeichnet, ist keine technische Grenze,
sondern eine **Richtlinie des Eigentümers gegen eine ungeklärte Lizenz**. Die
Pipeline ist jetzt so gebaut, dass der Umfang an genau einer Stelle steht
(`quant/config/development-preview.json`) und alles andere — Ingest,
Veröffentlichung, Hygiene-Guard, Discover-Build, Micro-Charts, Aktienseite —
dieser Stelle folgt. Ob dort 5, 498 oder 7 000 stehen, ist die Entscheidung,
die nur der Eigentümer treffen kann; dieser Pass trifft sie nicht.

## Die zwölf Antworten

### 1. Warum hatten nur die Golden Five echte Kursreihen?

Weil `quant/config/development-preview.json` genau diese fünf Ticker als
`scope` deklariert. `quant/engines/display-policy.js` gibt reale Kursdaten
(`audience: development_preview`, `form: raw`) nur für Titel in diesem
`developmentPreviewScope` frei; `scripts/market/ingest-tiingo.mjs
--publish-preview` schrieb nur für diese Titel nach
`quant/data/market/golden-preview/daily/`; `scripts/market/assert-public-data-hygiene.mjs`
bricht jeden Build ab, in dem Bars für einen anderen Titel im öffentlichen
Baum liegen; und der Discover-Build las ausschließlich `golden-preview/`.

Die Datei selbst sagt, was sie ist: *„eine bewusste Produktentscheidung des
Eigentuemers ueber ein eng begrenztes Titel-Set, KEINE Aussage ueber eine
geklaerte Tiingo-Redistributionslizenz“* — getroffen am 08.09.2026,
„ohne externe Rechtspruefung“, für eine Seite, die *„oeffentlich, nicht
zugriffsgeschuetzt“* ausgeliefert wird.

### 2. Technisch oder lizenzrechtlich?

**Lizenzrechtlich — genauer: eine Richtlinie, weil die Lizenz ungeklärt ist.**

Der Beleg dafür, dass es *nicht* technisch ist:

| Glied | Befund |
|---|---|
| Provider | Tiingo, Commercial-Plan; `quant/data/market/scale/gate-GATE_500.json`: 500/500 Titel aufgelöst, 500/500 mit ≥ 250 Bars, im Schnitt 9 077 Bars, ältestes Datum 1990-01-02, jüngstes 2026-09-08 |
| Ingest | `run-scale-gate.mjs` hat alle 500 in die Arbeitsablage geholt (1 521 MB, 502 Anfragen, `actions/cache`-Key `market-cache-*`); auf FULL_UNIVERSE 4 984 von 5 684 Titeln |
| Faktoren | `factors-GATE_500.json`: 498 Titel mit vollständigen Renditen — gerechnet **aus genau diesen Reihen** |
| Anzeige | `provider-profiles.json` → Tiingo: `licensing.status = LEGAL_REVIEW_REQUIRED`; `externalDisplay`, `redistribution`, `publicGithubStorage` alle `UNKNOWN` |
| Guard | `assert-public-data-hygiene.mjs`: *„Commercial-provider raw bars may only live below .market-cache while redistribution is LEGAL_REVIEW_REQUIRED“* |

Der technische Pfad `Instrument → Provider-Mapping → historische Reihe →
Cache → Faktoren` läuft für 5 684 Titel. Was fehlt, ist nicht Code, sondern
eine Erlaubnis. Die Golden Five sind selbst eine **Ausnahme von der
Richtlinie**, keine Freigabe.

Deshalb wurde die Grenze in diesem Pass **nicht umgangen** (Auftrag §3):
Ein Commit, der 493 Tiingo-Kursreihen in ein öffentliches Repository legt,
wäre dieselbe Entscheidung wie die Golden-Five-Ausnahme — nur hundertmal
größer, und nicht meine.

### 3. Wie viele der 498 besitzen beim Anbieter historische Kursdaten?

**498 von 498.** (Gate 500: 500 Titel mit ≥ 250 Bars; die zwei nicht
faktorfähigen Titel sind nicht Teil des Discover-Universums.)

### 4. Für wie viele werden sie jetzt in Vision Universe verfügbar gemacht?

**Technisch: für jeden Titel im deklarierten Umfang — heute 5, morgen so
viele, wie `development-preview.json` nennt.** Der Umfang kann jetzt eine
Tickerliste (`scope`) oder ein ganzes Universum (`scopeUniverse:
"GATE_500"`) sein. Ein Lauf des Workflows *Development Preview Marktdaten*
holt und veröffentlicht dann für jeden dieser Titel ein Jahr Tagesschluss
(`quant/data/market/discover-series/`, ~7 KB je Titel), und der
Discover-Build schreibt daraus `discover/data/series/US_REAL/<SYMBOL>.json`.

Im aktuellen Stand des Branches: **5 ausgeliefert**, weil der Umfang
unverändert ist. `docs/VU_DISCOVER_PRICE_COVERAGE.md` (erzeugt von
`scripts/discover/price-coverage.mjs`) beziffert es.

### 5. Wie viele Discover-Karten zeigen danach echte Kurscharts?

Heute: **7 Karten (5 Titel) von 170 Karten** auf der Startseite des realen
Universums; im Modelluniversum alle 129. Nach Erweiterung des Umfangs auf
`GATE_500`: **alle 170 Karten** — jede trägt bereits den Verweis auf ihre
Reihe, die Datei fehlt nur, weil die Richtlinie sie nicht freigibt.

### 6. Welche Titel bleiben ohne Chart und warum?

493 Titel: `NOT_IN_PREVIEW_SCOPE`. Kein einziger wegen fehlender
Anbieterdaten. Die Karten dieser Titel zeigen die Renditeleiter (vier
Balken) — das bleibt die korrekte Darstellung, solange keine Reihe
ausgeliefert wird.

### 7. Welche Datenquelle?

Tiingo, End-of-Day, aus derselben Arbeitsablage (`.market-cache/tiingo/daily/`),
aus der die Faktoren stammen. Keine neue API, kein neuer Anbieter, kein
Twelve-Data-Pfad (dessen Lizenz ist ebenso ungeklärt).

### 8. Welche Zeitreihe?

Ein Jahr Tagesschlusskurse, split-bereinigt (aus `splitFactor`, dieselbe
Ableitung wie Faktoren und Technical), 270 Handelstage mit Reserve, als
`[datum, schluss]`-Paare. Die Zeiträume 1M / 3M / 6M / 1J sind Fenster auf
diese eine Reihe, die der Micro-Chart selbst schneidet und auf ≤ 64 Punkte
ausdünnt. Keine OHLC, kein Volumen, kein Intraday — das braucht die Karte
nicht, und es hält die Datei bei ~7 KB. Die volle Historie (5 000 Bars) bleibt
den `fullHistory`-Titeln vorbehalten, die die Aktienseite mit 5J/Max und die
Technical Intelligence tragen.

### 9. Wie funktioniert Caching?

Drei Ebenen, jede deterministisch:

1. **Build-Cache:** `discover/data/series/<U>/<SYMBOL>.json` — eine Datei je
   Titel, statisch, von Pages mit `Cache-Control` ausgeliefert. Karten tragen
   nur den Verweis (`priceSeries.path`), keine Punkte: das Startseiten-Manifest
   ist dadurch leichter, und ein Titel in drei Sammlungen hat eine Datei.
2. **Browser-Cache:** `discover/ui/series-loader.js` — Schlüssel ist der Pfad
   (= Universum + Titel). Laufende und erledigte Abrufe werden dedupliziert;
   die Zeiträume sind Fenster, keine weiteren Abrufe. Gemessen:
   `SeriesLoader.stats()` — Abrufe = eindeutige Titel.
3. **HTTP-Cache:** der Browser hält die Datei über Seitenwechsel; der Prefetch
   der nächsten Karten legt sie dort ab.

### 10. Wie funktioniert Lazy Loading?

`Cards.lazyArtwork(card)`: trägt die Karte einen Verweis, steht zunächst ein
Platzhalter mit demselben Maß wie das Bild (Text „Kurs lädt“, keine Linie,
keine Balken — eindeutig kein Chart). Ein `IntersectionObserver`
(`rootMargin` 240 × 320 px) holt die Reihe, sobald die Karte in die Nähe des
Bildschirms kommt, und ersetzt den Platzhalter durch das Datenbild. Nicht
sichtbare Karten laden nichts. Beim Wischen lädt `ui/swipe.js` die Reihen der
nächsten ein bis zwei Karten vor. Trägt eine Karte keinen Verweis (Titel
außerhalb des Umfangs), zeichnet sie sofort die Leiter — ohne Abruf.
Scheitert ein Abruf, fällt die Karte auf die Leiter zurück, ohne Fehlertext.

Eingangsfläche (5 Karten) und die große Karte tragen ihre Punkte eingebettet
bzw. laden sofort — dort soll nichts flackern.

### 11. Funktioniert dieselbe Architektur für 7 000+?

Ja, und nichts davon kennt die Zahl 498 (Test `keine harte Universumsgroesse`):

- **Umfang:** `scopeUniverse: "FULL_UNIVERSE"` löst 5 684 Titel auf.
- **Ingest:** eine Anfrage je Titel und Lauf; der Commercial-Zugang hat
  5 686 Anfragen in einer Stunde nachgewiesen (Abschlussbericht §12).
- **Ablage:** 7 KB × 7 000 = ~50 MB im Repository — vertretbar; die volle
  Historie bleibt in der Arbeitsablage.
- **Auslieferung:** Startseite = meta + erstes Stück; Reihen werden je
  sichtbarer Karte geladen. Sieben sichtbare Karten heißt sieben Abrufe —
  bei 498 wie bei 7 000.
- **Nachrechnung:** `verify-discover-data.mjs` prüft jeden Verweis gegen
  seine Datei und jede Datei gegen den Umfang.

### 12. Welche Tests?

| Prüfung | Ergebnis |
|---|---|
| `discover/tests/*` (neu: `series-loader.test.mjs`; `v3.test.mjs` auf Verweise umgestellt) | 153 grün |
| `quant/tests/discover-series-hygiene.test.mjs` (DS1–DS6: Umfang als Liste und als Universum, Grundlage, Ablehnung außerhalb) + bestehende Hygiene- und Gate-Tests | 44 grün |
| `verify-discover-data.mjs` (Verweise ↔ Dateien, Series-Store, Umfang, Startseiten-Invarianten) | 15 996 Prüfungen, keine Abweichung |
| `assert-public-data-hygiene.mjs` mit `discover-series/` | bestanden |
| `publish-discover-series.mjs --from-published` | 5 Reihen, reproduzierbar |
| Browser-QA V3 (neu: Platzhalter ist kein Chart, keine Layout-Sprünge, Dedup, nur sichtbare Karten laden, Nachladen beim Scrollen, NVDA → Linie, AMD → Leiter ohne Abruf) | siehe Abnahmeprotokoll unten |
| Browser-QA bisher | siehe unten |

## Was der Eigentümer entscheiden muss

Genau eine Zeile in `quant/config/development-preview.json`:

```json
"scopeUniverse": "GATE_500"
```

(oder `"FULL_UNIVERSE"`), dann *Development Preview Marktdaten* per
`workflow_dispatch` starten. Der Lauf holt die Reihen, schreibt
`discover-series/`, baut Technical/Elliott für die `fullHistory`-Titel neu,
prüft die Hygiene und committet. Danach `node scripts/discover/build-discover-data.mjs`
— und jede Karte zeichnet ihre Linie.

**Was diese Zeile bedeutet:** 498 Tiingo-Kursreihen (ein Jahr Tagesschluss)
liegen dann in einem öffentlichen Repository und werden auf einer
öffentlichen Seite angezeigt, während `provider-profiles.json` für Tiingo
weiterhin `LEGAL_REVIEW_REQUIRED` trägt. Die Golden-Five-Ausnahme wurde mit
demselben Vorbehalt getroffen; sie war klein. Diese wäre es nicht. Die
Lizenzcheckliste (`docs/VU_PROVIDER_LICENSE_CHECKLIST.md`) nennt die drei
offenen Fragen: Anzeige gegenüber Dritten, Speicherung über die Sitzung
hinaus, Weiterveröffentlichung.

Eine kleinere Stufe wäre möglich und technisch dieselbe Zeile: ein Universum
aus den ~300 bekannten Namen der Bekanntheitsliste, oder `GATE_100`.
