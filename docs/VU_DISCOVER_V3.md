# Discover V3 — Netflix für Aktien-Research

Stand 13.09.2026, Branch `claude/vision-universe-discover-v3`. Nicht nach
`main` gemergt, nicht veröffentlicht — die Abnahme steht aus.

## Was V3 ändert, in einem Absatz

Die Startseite war eine Folge gleicher Reihen. V3 macht daraus eine Folge von
**Surfaces** in sieben Formen, gerechnet im Build und in Stücken ausgeliefert;
holt **bekannte Namen** innerhalb der qualifizierten Titel nach vorn, ohne die
Ranglisten anzufassen; verteilt Titel über die Seite, damit keiner sie
beherrscht; und zeichnet **keine Linie mehr, die keine Kursreihe ist**. Die
Fachsprache bleibt, wo sie war: eine Ebene tiefer.

## Der Befund vor dem Umbau

`docs/VU_DISCOVER_V3_COLLECTION_AUDIT.md` (erzeugt von
`scripts/discover/audit-collections.mjs`) hat das Problem beziffert:

| Befund | vorher | nachher |
|---|---|---|
| identische Titel unter den ersten zehn, DIE STÄRKSTEN vs. STABILE AUFWÄRTSTRENDS | 10 von 10 | 0 |
| Momentum vs. Relative Stärke | 8 von 10 | 8 von 10 (inhaltlich verwandt — die Startseite zeigt sie unterschiedlich) |
| Reihen auf der Startseite | 7 | 21 Surfaces in 7 Formen |
| Titel, die die Startseite anführen durften | beliebig oft | höchstens eine Surface (Ausnahme: Perzentil ≥ 99, zweimal) |
| Apple, NVIDIA, AMD, Intel, Micron auf der Startseite | praktisch nie | Themenwelt KI, BEKANNTE NAMEN, Sektorreihe TECHNOLOGIE |
| Karten mit einer Linie, die kein Kurschart ist | alle 493 ohne Kursreihe | 0 |

Die Ursache war nicht das Ranking, sondern die Zusammensetzung des Universums:
195 von 497 discoverablen Titeln tragen keinen Namen, den ein Privatanleger
kennt, und die Kennzahlen kennen keine Bekanntheit.

## Architektur

```
discover/config/company-recognition.json   Bekanntheit + Tätigkeit (CURATED_EDITORIAL)
discover/config/themes.json                Themenwelten (CURATED_EDITORIAL)
discover/methodology/discover-v1.json      v3.0.0: 9 Reihen, home.surfaces (Dramaturgie)
discover/engines/relevance.js              Discovery-Reihenfolge + Cross-Collection-Diversity
discover/engines/analytics.js              Ereignis-Vertrag (10 Ereignisse, keine Übertragung)
discover/engines/memory.js                 Sitzungsgedächtnis (localStorage, ohne Konto)
discover/ui/microchart.js                  Micro-Chart (nur echte Reihen) + Renditeleiter
discover/ui/surfaces.js                    ranking · row · theme · featured-card · sectors · immersive · recent
discover/data/home/<U>.json, .2, .3        Startseiten-Manifest in Stücken
scripts/discover/build-discover-data.mjs   buildHome, priceSeries, neue Reihen
scripts/discover/verify-discover-data.mjs  13 654 Nachrechnungen inkl. Home-Invarianten
scripts/discover/audit-collections.mjs     das Audit, jederzeit wiederholbar
scripts/discover/browser-qa-v3.mjs         31 Browser-Prüfungen, Desktop und iPhone
```

### Die Startseite als Manifest

`buildHome` liest `methodology.home.surfaces`, holt für jede Surface die
gerechnete Reihe, ordnet sie mit `relevance.discoveryOrder`, lässt
`relevance.diversify` über die ganze Folge laufen und schreibt das Ergebnis in
Stücken (6 / 7 / Rest). Das erste Stück ist ≈ 150 KB und trägt Hero, Rangliste,
BEKANNTE NAMEN, NEUE JAHRESHOCHS, GERADE IN BEWEGUNG und die Themenwelt KI.
Der Browser lädt das nächste Stück, wenn man 900 px davor steht.

Keine Karte auf der Startseite steht dort ohne ihre Reihe: die Nachrechnung
prüft für jede Surface, dass ihre Titel Teil der Reihe sind, dass die
nummerierte Rangliste der reinen Kennzahl-Reihenfolge entspricht und dass die
Diversity-Regeln halten.

### Discovery Relevance — was sie ist und was nicht

`relevance.discoveryOrder(cards, {recognition})`:

- Position p = 1 − i/(n−1) (1 = erster Platz der Rangliste)
- Bonus: Stufe 1 (Alltagsmarke) +0,18, Stufe 2 +0,10 — **nur in der oberen
  Hälfte** der Liste
- Score = p + Bonus, stabil sortiert; die Menge bleibt dieselbe

Der Score wird nirgends angezeigt und ist keine Finanzkennzahl. Nummerierte
Ranglisten laufen nicht durch das Modul: dort steht die echte Rangziffer. Die
Kategorieseite zeigt jede Reihe in reiner Kennzahl-Reihenfolge.

`relevance.diversify(surfaces)`: ein Titel führt höchstens eine Surface an
(erste zwei Karten), erscheint höchstens zweimal auf der Seite; kurze Listen
(≤ 6 Treffer) werden nicht gekürzt; nummerierte Ranglisten nie verändert. Es
wird entfernt, nie umsortiert.

### Chart Truth Contract (§12)

```
priceSeries = { status, source, priceSeriesType, asOf, range, points | ranges, message }

status === "CALCULATED" && points.length >= 5 && source  → Linie (ui/microchart.js)
sonst                                                    → Renditeleiter: 1M · 3M · 6M · 1J als Balken
```

`contract.assertStock` wirft, wenn CALCULATED ohne Punkte oder Punkte ohne
CALCULATED. Der Build baut die Reihe nur aus Bars, die `display-policy` für
den Titel freigibt; `verify-discover-data.mjs` prüft, dass im realen Universum
nur die Golden Five eine Reihe tragen. Der rebasierte Renditepfad
(`performancePath`) bleibt als Zahlenreihe im Contract, wird aber nirgends
mehr als Kurve gezeichnet — nicht auf der Karte, nicht in der Eingangsfläche,
nicht auf der Aktienseite.

**Konsequenz, unverblümt:** im realen Universum haben genau fünf Karten einen
Chart. Die anderen 493 zeigen vier Balken. Das ist die Datenlage dieses
Repositories, nicht eine Entscheidung dieses Passes — und die einzige
Darstellung, die weder eine Kurve erfindet noch eine Lizenzgrenze ausweitet.

### Redaktionelle Metadata

Zwei Dateien mit `provenance: CURATED_EDITORIAL`:

- `company-recognition.json`: 303 Unternehmen, Stufe 1 (76 Alltagsmarken) oder
  2, je ein sachlicher Einzeiler („Chips für KI und Grafik“). Bestimmt nie,
  OB ein Titel in einer Reihe steht; nur, wie weit vorn er innerhalb der
  qualifizierten Titel gezeigt wird — und ob er in BEKANNTE NAMEN (Stufe 1)
  oder ÜBERRASCHUNGEN (keine Stufe) fällt.
- `themes.json`: drei Themenwelten als Tickerlisten. Die Themenreihe ist
  eine normale Reihe (`buildRow`) mit der Aufnahmeregel „steht in der Liste“;
  die Oberfläche sagt an jeder Themenwelt, dass die Zugehörigkeit eine
  Einordnung ist.

Keine der beiden Dateien erzeugt eine Aussage über eine Aktie. Was auf den
Karten steht, ist gerechnet.

### Neue Reihen und ihre Regeln

| Reihe | Regel (Code in `ROW_FILTERS`) | Sortierung |
|---|---|---|
| BEKANNTE NAMEN IN BEWEGUNG | Stufe 1 UND (neues Hoch ∨ nahe Hoch ∨ Ausbruch ∨ 3M ≥ +5 %) | return3M |
| COMEBACK? | maxDrawdown252d ≤ −25 % UND return3M ≥ +10 % UND ≥ 8 % unter dem Hoch | return3M |
| ÜBERRASCHUNGEN | keine Bekanntheitsstufe UND Leadership-Perzentil ≥ 85 | leadershipScore |
| THEMA … | Ticker in der Themenliste | leadershipScore |
| STABILE AUFWÄRTSTRENDS (geändert) | trendIntact | volatility252d aufsteigend — die ruhigsten zuerst |

Nicht gebaut, weil die Daten es nicht tragen: MEGA CAPS (keine
Marktkapitalisierung für reale Titel), DIVIDENDEN & QUALITÄT (keine
Dividendendaten), „Future Mobility“ (nur klassische Hersteller im Universum
→ AUTOS & MOBILITÄT).

### Ereignisse und Gedächtnis

`analytics.track(name, props)` kennt genau die zehn Ereignisse aus §16 und
verwirft alles andere. Es sendet nichts; eine Senke kann gesetzt werden.
Nicht gemessen: Zeit im Feed.

`memory.create(storage)` merkt sich zuletzt angesehene Titel (12), geöffnete
Karten, besuchte Sammlungen und die Position auf der Startseite — auf dem
Gerät, löschbar mit einem Klick, und ohne Speicher funktioniert alles weiter.
Daraus entsteht heute die Surface ZULETZT ANGESEHEN und der Punkt hinter
einem schon gesehenen Namen; morgen „Mehr aus …“.

### Skalierung

Keine Stelle im Code trägt die Zahl 498 (Test). Eine Startseite kostet meta +
erstes Stück; die Stücke hängen nicht an der Universumsgröße. Rangreihen
tragen 30 Karten, das Manifest die gezeigten. Für 7 000 Titel wächst nur der
Suchindex (heute ≈ 25 KB) und die Zahl der Detailseiten.

## Prüfungen

| Was | Ergebnis |
|---|---|
| Discover-Tests (`node --test discover/tests/*.test.mjs`) | 150 grün, davon 32 neu (relevance, analytics, memory, v3) |
| Nachrechnung (`verify-discover-data.mjs`) | 13 654 Prüfungen, keine Abweichung |
| Build reproduzierbar | ja (nur `meta.json` trägt einen Zeitstempel) |
| Browser-QA bisher (`browser-qa.mjs`, 8 Prüfungen auf V3 umgestellt) | 63/63 |
| Browser-QA V3 (`browser-qa-v3.mjs`) | 31/31 — Nachladen, keine Fake-Charts, Swipe mit Finger/Maus/Tastatur, Einzelmodus mit Ende, Gedächtnis, keine Sackgassen, kein Überlauf |
| Quant-Tests | 684 grün, Kern unverändert |
| Fachsprache Ebene 1 | 0 Treffer über alle Surfaces und Karten |

## Bekannte Einschränkungen

- **Fünf Charts.** Nur die Golden Five tragen eine Kursreihe. Jede weitere
  Linie braucht eine Lizenzentscheidung, keine Codeänderung.
- **Keine Live-Daten.** `ENABLE_LIVE_MARKET_DATA` und `ENABLE_PUBLIC_LIVE_MARKET_DATA`
  stehen auf `false`; Sichtbarkeits-Gating und Prefetch sind gebaut, aber es
  gibt nichts zu abonnieren.
- **Sektoren nur für 100 Titel.** Die Sektorreihen sind entsprechend kurz
  (ENERGIE: 6).
- **Bekanntheit ist redaktionell.** 303 Einträge, aus Sicht eines deutschen
  Privatanlegers — eine Einschätzung, keine Messung.
- **Manifest-Größe.** Stück 1 ≈ 150 KB (US_REAL), im Modelluniversum ≈ 280 KB
  wegen der Kursreihen auf jeder Karte. Vertretbar, aber ein Kandidat für
  eine schlankere Kartenform.
- **iOS < 16.2** fällt auf den `@supports`-Block der Farbwelten zurück
  (seit Publikation).

## Empfehlung zur Veröffentlichung

Aus meiner Sicht veröffentlichbar, unter zwei Bedingungen: (1) Du hast die
Startseite auf dem iPhone durchgewischt und die Themenwelten, die grosse
Karte und den Einzelmodus gesehen; (2) Du trägst die Entscheidung, dass 493
Karten Balken statt Linie zeigen — das ist das ehrliche Bild, aber es ist ein
anderes Bild als vorher. Merge dann per Fast-Forward nach `main`; der Pages-
Build läuft ohne Jekyll, `delivery-check.mjs` prüft den Baum vorher.
