# Vision Universe® Quant — Frontend-Transformation

Arbeitsdokument. Es wächst mit dem Umbau und hält fest, was **gemessen** wurde,
bevor gebaut wurde — und was die Messung gegen den Entwurf entschieden hat.

Stand: 2026-09-28 · Basis: `2d050f8003` (main nach dem Public-Beta-Launch)

---

## 1. Capability Map — was es gibt, bevor etwas umgezogen wird

Regel des Auftrags: *Redesign bedeutet bessere Nutzung und Erklärung, nicht
Entfernen.* Diese Tabelle ist der Vertrag dafür. Jede Zeile muss nach dem Umbau
erreichbar bleiben, auch wenn sie nicht mehr in der Hauptnavigation steht.

| Route | Seitenfunktion | Dienste (`api.*`) | Nach dem Umbau |
|---|---|---|---|
| `home` | `homePage` | `getHomeIntelligence`, `getMarketRegime`, `getMarketSession` | **HOME** (neu gebaut) |
| `screener` | `screenPage` | `screen`, `getRecipes`, `getStrategyProfiles`, `getUniverse` | **SCREENER** (Einfach/Profi) |
| `strategies` | `strategyPage` | `getStrategyContext`, `getStrategyIndex`, `screen` | **STRATEGIEN** |
| `stocks` | inline | `getUniverse` | **AKTIEN** (Einstieg zur Einzelanalyse) |
| `stock` | `stockPage` | `getStockIntelligence`, `getIntelligenceBrief`, `getFactorEvidenceScreening`, `getHistoricalFundamentals`, `getHistoricalPriceHistory`, `getPatternMatch`, `getSetupObservation`, `getSetupScreenIndex`, `getTechnicalIntelligence` | **AKTIENANALYSE** (Herzstück) |
| `quant` | `quantPage` | `getFactorEvidence`, `getIntelligenceBrief`, `getAssignmentChange`, `getSetupScreenIndex`, `getStockIntelligence`, `getStrategyIndex`, `getStrategyProfiles` | bleibt, aus der Aktienseite verlinkt |
| `explain` | `explainPage` | — | **METHODIK** (ausgebaut) |
| `technical` / `elliott` | `technicalWorkspacePage` | `getTechnicalWorkspace` | bleibt, aus der Aktienseite verlinkt |
| `fundamentals` | `fundamentalsPage` | `getHistoricalFundamentals` | bleibt, verlinkt |
| `compare` | `comparePage` | `getComparison` | bleibt, aus Aktien/Screener verlinkt |
| `watchlist` | `watchlistPage` | `getWatchlistIntelligence`, `getAssignmentChange`, `getFactorEvidenceScreening` | bleibt, verlinkt |
| `signals` | `signalsPage` | `getSignals` | bleibt, verlinkt |
| `radar` | `radarPage` | `getRadarIntelligence`, `getMarketRegime`, `getSetupScreenIndex` | bleibt, verlinkt |
| `atlas` | `atlasPage` | — | bleibt, verlinkt |
| `portfolio` | `portfolioPage` | `getPortfolioIntelligence` | bleibt **erreichbar**, ausdrücklich **nicht** in der Navigation |
| `markets` | `marketsPage` | `getMarketIntelligence` | anderes Produkt — nicht in der Quant-Navigation |
| `discover` | `discoverPage` | `getDiscover`, `getSetupScreenIndex` | anderes Produkt — nicht in der Quant-Navigation |
| `research` | inline-Katalog | — | ersetzt durch die neue Informationsarchitektur |

Dienste ohne eigene Seite, die erhalten bleiben müssen: `searchInstruments`
(Suche), `getMarketDataHealth` (Aktualitätszeile), `getIntraday`,
`getRealtimeCapability` (Live-Kurs), `getStrategyMatch`, `getComparison`,
`workspaces`.

---

## 2. Historische Vergleichsfälle — was wirklich geht

Der Auftrag verlangt drei Ebenen. Gemessen, nicht angenommen:

### Ebene 3 — MARKTWEITE MUSTER · **vorhanden und belastbar**

`pattern-match-v1` liefert je Titel die Muster, die **heute** gelten, und je
Muster die Statistik der Grundgesamtheit: `lift`, `asymmetry`, `support`
(z. B. 9.162 Beobachtungen), `outOfSampleLift`, `medianForwardReturn`,
`medianMaxDrawdownWithinHorizon`, dazu `baseRate` und die **gezählten**
zurückgehaltenen Muster (`INSUFFICIENT_SUPPORT`, `NOT_SIGNIFICANT`,
`IN_SAMPLE_ONLY`, `PARAMETER_SENSITIVE`). Der Artefakt-Caveat sagt bereits
genau das Richtige und wird wörtlich übernommen:

> „Diese Zahlen beschreiben eine Grundgesamtheit in der Vergangenheit. Sie
> werden nicht dadurch zu einer Aussage über diesen Titel, dass sie neben
> seinem Namen stehen."

### Ebenen 1 und 2 — TITEL-EIGENE HISTORIE · **rechenbar, aber nur für ein Drittel**

Die Zutaten liegen alle schon da und sind **keine neue Datenquelle und keine
neue Engine**:

- `quant/data/market/discover-series-long/` — 6.334 Titel, **Wochenschluss,
  MAX-Bereich, SPLIT_ADJUSTED**, NVDA bis 1999, AAPL/JPM bis 1990.
- `quant/engines/pattern-research.js` exportiert `featuresAt()` und
  `outcomeAfter()` — dieselbe Funktion, mit der die marktweite Studie gerechnet
  wurde, mit geprüftem Leckage-Vertrag.
- Die 29 Begriffe der Studie lassen sich aus den Findings als Wörterbuch
  ableiten: **14 PRICE** (aus Wochenschlüssen rechenbar) und **15 FUNDAMENTAL**
  (brauchen Point-in-Time-Fundamentaldaten je Woche — die gibt es je Titel
  nicht). Ebene 1/2 bleibt deshalb auf **Preisbedingungen** beschränkt und muss
  das sagen.

Gemessene Abdeckung (Stichprobe 300 Titel, gleichverteilt über das Verzeichnis):

| | Titel | Anteil |
|---|---:|---:|
| gemessen (Langreihe **und** Pattern-Shard vorhanden) | 247 | 82,3 % |
| mit ≥ 1 abgeschlossenem 12-Monats-Fall | 218 | 72,7 % |
| mit ≥ 5 abgeschlossenen 12-Monats-Fällen | 145 | 48,3 % |
| **mit ≥ 10 abgeschlossenen 12-Monats-Fällen** | **101** | **33,7 %** |
| mit ≥ 20 abgeschlossenen 12-Monats-Fällen | 52 | 17,3 % |

### Der Befund, der gegen das Mockup entscheidet

Das Mockup zeigt auf der **NVIDIA**-Seite:
„Ø Performance nach 3 Monaten **+12,8 %**, in **8 von 10** Fällen positiv".

Gemessen an NVIDIAs eigener Historie mit den Preisbedingungen, die heute für
NVDA gelten (`near-52w-high`, `at-all-time-high`, `above-40w-line`,
`trend-stacked`, `quiet-range`):

```
NVDA · 1.445 Wochen (1999–2026) · 7 Treffer → 3 Episoden
         → 1 abgeschlossener 12-Monats-Fall
```

**Ein** Fall. Die Zahl aus dem Mockup ist für genau den Titel, an dem sie
gezeigt wird, nicht belegbar. Sie wird nicht gebaut. Stattdessen greift die
Regel, die der Auftrag selbst vorgibt: *„Zu wenige historische Vergleichsfälle
für eine belastbare Aussage."* — und daneben steht weiterhin die marktweite
Ebene, die für NVDA reich ist (13 robuste Muster gelten).

Weitere gemessene Beispiele (Episoden = zusammenhängende Trefferwochen, zu
einem Fall zusammengefasst):

| Titel | Wochen | Episoden | 3M (n · Median) | 12M (n · Median) |
|---|---:|---:|---|---|
| JPM | 1.917 | 58 | 58 · +3,2 % | 57 · +6,9 % |
| GOOGL | 1.154 | 53 | 52 · +6,5 % | 51 · +24,4 % |
| AAPL | 1.917 | 32 | 31 · +5,5 % | 29 · +13,8 % |
| AACG | 974 | 31 | 30 · +3,9 % | 30 · −1,6 % |
| ACGL | 1.620 | 28 | 27 · +1,5 % | 26 · +22,5 % |
| **MSFT** | 1.917 | **6** | 6 · +1,7 % | 6 · −4,6 % |
| **NVDA** | 1.445 | **3** | 1 · −49,6 % | **1** · −32,6 % |
| **AACI** | 172 | **1** | 1 | 1 |

MSFT zeigt, warum eine reine Zahl ohne Stichprobengröße gefährlich wäre: ein
Median von −4,6 % aus sechs überlappenden Episoden ist keine Eigenschaft von
Microsoft, sondern ein Rauschwert.

### Der Vertrag, der daraus folgt: `historical-cases-1.0.0`

- **Quelle**: die veröffentlichte Wochenreihe des Titels (SPLIT_ADJUSTED, MAX).
- **Rechenweg**: `PatternResearch.featuresAt` / `outcomeAfter`, unverändert.
- **Fall**: eine zusammenhängende Folge von Trefferwochen zählt als **eine**
  Episode. Ohne diese Bündelung stünden bei ACGL 945 „Fälle" statt 28 — eine
  Zahl, die nur Überlappung misst.
- **Mindestmenge**: eine Kennzahl (Median, Positivanteil, Rückschlag) erscheint
  erst ab **10 abgeschlossenen Episoden** im jeweiligen Zeitfenster. Darunter
  wird die Anzahl genannt und ausdrücklich gesagt, dass sie zu klein ist.
- **Kein Einzelfall als Beweis**: der „letzte vergleichbare Fall" erscheint nur
  zusätzlich zur Verteilung, nie allein.
- **Offene Fälle**: Episoden, deren Zeitfenster noch nicht abgelaufen ist,
  werden gezählt und nicht gewertet.
- **Genannte Grenzen**: Wochenraster (Rückschläge innerhalb der Woche sind
  nicht sichtbar), überlappende Zeitfenster, nur Preisbedingungen, und der
  Umstand, dass ein Titel mit langer Historie per Konstruktion einer ist, der
  überlebt hat.
- **Keine Prognose.** Sprachlich: „Historische Vergleichsfälle" und „Was geschah
  danach?" — nie „wird wahrscheinlich".

Das ist **keine neue Quant-Engine**: es ist die veröffentlichte Studienlogik,
auf die eigene Reihe eines Titels angewandt, mit eigener Versionsnummer für die
Darstellungs- und Schwellenregeln.

---

## 3. Die neue Informationsarchitektur

| Bereich | Route | Die Frage, die er beantwortet | Was neu ist |
|---|---|---|---|
| **HOME** | `home` | „Was kann ich hier tun?" | Nutzenversprechen, vier Schritte, drei Einstiege, „Heute im Fokus" aus echten Setup-Zuständen |
| **SCREENER** | `screener` | „Wie finde ich interessante Aktien?" | Einfacher Einstieg mit sechs Eigenschaften und vorgelesenem Satz; Profi-Editor unverändert dahinter |
| **STRATEGIEN** | `strategies` | „Welche Art von Aktien suche ich?" | Katalog aus acht Ansätzen statt eines Regel-Editors; Editor dahinter |
| **AKTIEN** | `stocks` | „Welches Unternehmen?" | Suche, zuletzt analysiert, gemessene Abdeckung — kein Katalog zum Blättern |
| **METHODIK** | `explain` | „Warum kann ich dem Ergebnis trauen?" | Eigener Hauptbereich, fünf Transparenzebenen, vier neue Abschnitte |

Die **Aktienanalyse** (`stock`) bleibt das Herzstück und gehört zu AKTIEN; die
Faktor-, Kurs- und Vergleichsflächen hängen daran und behalten ihre Routen.

### Wortmarke und Navigation

Übermarke klein, Produktname gross in Quant-Grün, darunter ein Satz zum Ort
(„Chancen finden.", „Strategien verstehen.", „Keine Blackbox."). Die untere
Leiste zeigt die fünf Bereiche mit Strichzeichnungen, sitzt über
`env(safe-area-inset-bottom)` plus 10 px Grundluft für Safaris Browserleiste
und erscheint bis 900 px — genau dort verschwindet die obere Leiste, damit
nie beide gleichzeitig dieselben fünf Ziele zeigen.

## 4. Was die Messung gegen den Entwurf entschieden hat

1. **Die NVIDIA-Statistik des Mockups wird nicht gebaut.** Siehe Abschnitt 2.
   Für den gezeigten Titel gibt es einen einzigen abgeschlossenen Fall.
2. **„Large Cap", „Small Cap", „USA", „Europa" und „Nähe 52W-Hoch" sind keine
   Screener-Marken.** Der Screener führt für Grösse, Region und
   Jahreshoch-Nähe kein Feld. Ein Knopf, der nichts filtert, ist eine Lüge in
   Gestalt eines Bedienelements. Stattdessen steht unter den Marken, dass es
   sie noch nicht gibt.
3. **Keine Trefferquote je Strategie.** Der Strategie-Index führt
   `historicalEvidence`, aber als `ASSIGNMENT_PERSISTENCE` über ein Fenster
   von einem Tag. Das ist die Beständigkeit einer Zuordnung, nicht der Erfolg
   eines Ansatzes. Die Zahl steht mit ihrem Fenster da, und daneben der Satz,
   dass eine Erfolgsquote nicht zertifiziert ist.
4. **Der Screener-Einstieg arbeitet nur auf Quant V2.** Eine Abfrage gehört
   genau einer Methodik; eine Regel aus V1 bedeutet in V2 etwas anderes. Die
   sechs Marken sind deshalb ausschliesslich Faktor-Evidenz.

## 5. Zwei Verluste, die der Umbau selbst verursacht hat

Beide wurden durch Messung gefunden, nicht durch Nachdenken — und beide sind
als Test festgehalten, damit sie nicht wiederkehren.

1. **Vier Ansichten waren nicht mehr erreichbar.** Die Liste der gültigen
   Ansichten wurde aus der Navigation abgeleitet. Als die Leiste auf fünf
   Bereiche schrumpfte, lieferten `portfolio`, `discover`, `markets` und
   `research` „Diese Ansicht wurde nicht gefunden". Eine Leiste zu kürzen
   hatte Funktionen abgeschaltet. Die Liste steht jetzt ausgeschrieben da.
2. **Die Markt-Einordnung war von der Startseite verschwunden.** Gemeldet von
   der Suite (`the journey starts with the market and ends at a share`). Der
   Grund von damals gilt unverändert: ohne die Marktlage liest sich jede
   Einzelbewegung, als stünde sie für sich.

Dazu zwei stille Fehler beim Bauen, beide ohne Symptom in der Oberfläche:
`pct1` war in `experience.js` schon vergeben — die zweite Deklaration
gleichen Namens benutzte still die fremde Funktion, sichtbar nur am fehlenden
Vorzeichen. Und die Suche der Aktienseite las `instruments`/`results`/
`matches`; der Dienst antwortet mit `entries`, die Liste wäre immer leer
geblieben.

---

## 6. Was diese Transformation bewusst NICHT anfasst

1. **Die Titelauswahl der Arbeitsflächen ist ein Auswahlfeld mit 6.875 Einträgen.**
   Gemessen auf `quant`, `technical`, `fundamentals` und `atlas`: das Bedienelement
   `.workspace-controls` trägt **204.150 Zeichen** Optionstext. Auf einem Telefon
   ist das keine Auswahl, sondern eine Wand. Der Befund ist **nicht** durch diesen
   Umbau entstanden und liegt ausserhalb der fünf Bereiche; er gehört in den
   POST_LAUNCH_BACKLOG und braucht dieselbe Suche, die die Aktienseite jetzt hat.
1b. **Erledigt statt liegengelassen:** der Backlog-Punkt „der Watchlist-Schritt
   der Browser-QA ist unzuverlässig" ist repariert. Die Schleife fügte beide
   Kürzel ein, ohne nach dem ersten auf das gerenderte Mitglied zu warten; das
   Feld wird beim Rendern neu aufgebaut, und das zweite `fill` traf dann
   gelegentlich das alte Feld. Gemessen waren es lokal 2 Fehlschläge auf 5
   Läufe bei 2 von 2 grün in CI. Kein Produktfehler — ein fehlendes Warten im
   Prüfskript, das hier den Beleg blockiert hat.
2. **Das Gewicht der Auslieferung** (Code-Splitting für das 1,09-MB-Skript,
   `market-capability.json` mit 1.242.180 Bytes) — unverändert offen aus dem Launch.
3. **Portfolio** bleibt erreichbar und unverändert. Keine Depotanalyse, keine
   Allokationsgrafik, kein Portfolio-Score, keine Handlungsaufforderung.
4. **Die Ebene 2 der historischen Vergleichsfälle** (dieselbe Historie, aber
   gelockerte Bedingungen) ist im Vertrag benannt und in der Methodik erklärt,
   aber noch nicht als eigene Ansicht gebaut: Ebene 1 und Ebene 3 stehen
   nebeneinander, Ebene 2 wäre eine dritte Zahlenreihe ohne neue Erkenntnis,
   solange Ebene 1 für zwei Drittel der Titel ohnehin zu dünn ist.

## 7. Selbstkritik: drei Fehler, die dieser Umbau selbst eingebaut hat

Alle drei ohne Symptom in der Oberfläche — deshalb stehen sie hier.

1. **`pct1` war schon vergeben.** Eine zweite Deklaration gleichen Namens im
   selben Gültigkeitsbereich hat still die fremde Funktion benutzt. Sichtbar war
   das nur am fehlenden Vorzeichen einer Rendite.
2. **Die Suche der Aktienseite las geratene Feldnamen** (`instruments`,
   `results`, `matches`). Der Dienst antwortet mit `entries`; die Trefferliste
   wäre immer leer geblieben, ohne dass etwas kaputt ausgesehen hätte.
3. **Der Einstieg „Bestätigte Setups" von der Startseite landete in einer
   zugeklappten Fläche.** Eine mechanische Ersetzung (`main.append` →
   `profiZiel.append`) hatte die Zeile mitgenommen, die das Ergebnis einer
   Setup-Regel zeigt — obwohl sie mit dem Profi-Editor nichts zu tun hat.

## 8. Warum Vercel für Quant nicht erforderlich ist

Der Release stand am 28.09.2026 rot, und zwar nicht wegen des Codes:

```
Resource is limited - try again in 24 hours
(more than 100, code: "api-deployments-free-per-day")
```

Ein Tageskontingent des Accounts. Die richtige Frage war deshalb nicht
„wie reparieren wir den Build", sondern **„wofür baut Vercel hier
überhaupt"**. Vier Fragen, vier im Repository gemessene Antworten.

### 8.1 Wird das Quant-Frontend produktiv über Vercel ausgeliefert? Nein.

`vercel.json` ruft als `buildCommand` das Skript
`scripts/vu2/build-vercel-public.mjs` auf. Dieses Skript schreibt **genau
eine Datei**: `.vercel-public/index.html`, **197 Byte**, ein Satz, `noindex`.
Nachgemessen, nicht gelesen.

Das Quant-Frontend kommt von GitHub Pages: `CNAME` =
`research.visionuniverse.de`, `pages-release.yml` deployt über
`actions/deploy-pages@v4` bei `push` auf `main`. Das gebaute Release
umfasst **35.697 Dateien**.

`.vercelignore` sagt es selbst, und zwar seit dem 22.09.:

> Vercel hosts only the server-side Product Service. The reviewed product UI
> and compact public artifacts are deployed by GitHub Pages.

### 8.2 Hängen produktive APIs von Vercel ab? Drei existieren — Quant nutzt keine.

Vercel hostet drei echte Serverless-Funktionen: `api/history.js`,
`api/intraday.js`, `api/status.js`. **Sie bleiben, unangetastet.**

Aber: **keine Frontend-Datei ruft sie auf.** Die einzigen Aufrufer im
Repository sind `quant/tests/product-data-service.test.mjs` — und die laden
sie direkt als Modul, nicht über HTTP. In `vu2/*.js` gibt es kein `fetch()`
auf `/api/`, keine `.vercel.app`-Adresse und keine konfigurierbare
API-Herkunft. (`/quant/api/*.js` sind lokale Skripte im gleichen Ursprung,
keine Endpunkte — der Verzeichnisname führt in die Irre.)

Der Live-Kurs-Strom läuft über Cloudflare
(`wss://live.visionuniverse.de/live`), nicht über Vercel.

Der Pages-Release kopiert die drei Funktionsdateien als **statischen Text**
mit — auf Pages führen sie nicht aus. Das bestätigt die Trennung eher als
sie zu verwischen.

Das Ausführungsprotokoll hält zudem fest, dass diese Funktionen in der
Produktion `NOT_CONFIGURED` melden und ihr Funktionsschalter ausdrücklich
deaktiviert bleiben soll, bis eine Kosten- und Nebenläufigkeitskontrolle
belegt ist. Sie sind geparkt, nicht tragend.

### 8.3 Nutzt ein Quant-Workflow Vercel zwingend? Nein.

**Keine einzige Datei in `.github/workflows/` nennt Vercel.** Die
Vercel-Checks kommen von der GitHub-App, nicht aus der CI dieses Repos.

### 8.4 Ist Vercel nur für Previews eingebunden? Fast — und das ist der Punkt.

Nicht ausschließlich: die drei Funktionen liegen produktiv dort. Aber für
den **PR-Pfad** trägt Vercel nur eine Vorschau bei — und die zeigt für
einen Commit, der nur das Frontend anfasst, jenen 197-Byte-Platzhalter.
Sie kostet ein Deployment aus dem gemeinsamen Tageskontingent und sagt
nichts.

### 8.5 Was daraufhin geändert wurde — und was nicht

`vercel.json` erhält einen `ignoreCommand`:
`node scripts/vu2/vercel-should-build.mjs`. Die Regel ist eng:

| Lage | Entscheidung |
|---|---|
| `VERCEL_ENV=production` | **baut immer**, unabhängig von den Pfaden |
| Vorschau, `api/`, `server/`, `vercel.json`, `.vercelignore` oder der Vercel-Build geändert | **baut** — die Vorschau ist aussagekräftig |
| Vorschau, nichts davon geändert | **bricht ab** — kein Deployment |
| Diff nicht ermittelbar | **baut** |

Vercels Vertrag ist gegenläufig zur Intuition: **Exit 0 heißt abbrechen,
Exit 1 heißt bauen.** Wer das verwechselt, schaltet die Auslieferung der
Funktionen ab. Deshalb ist jeder unklare Fall ein Bauen, und deshalb hält
`quant/tests/vercel-preview-boundary.test.mjs` die Richtung fest.

**Nicht geändert:** die drei Funktionen, `server/`, der Pages-Deploy, die
Produktionslogik. Vercel wurde nicht global entfernt — andere
Vision-Universe-Produkte, die diese Funktionen später brauchen, verlieren
nichts, und für die Produktion baut Vercel weiter.

### 8.6 Zwei Einschränkungen, die ich nicht verschweige

1. **Vercel war ohnehin kein Merge-Blocker.** Gemessen am PR: der Zustand
   ist `unstable`, nicht `blocked` — der Vercel-Status ist nicht als
   erforderlicher Check geführt. Er ließ den Release *rot aussehen*, ohne
   ihn zu verhindern. Die Bereinigung nimmt das falsche Signal weg, nicht
   eine echte Sperre.
2. **Die Wirkung des `ignoreCommand` kann ich hier nicht beweisen.** Der
   Netzzugang dieser Umgebung sperrt `vercel.com`, ich konnte die Semantik
   also nicht an der Quelle nachlesen, sondern nur den Exit-Code-Vertrag
   testen. Sollte Vercel den Schlüssel ignorieren, bleibt alles wie heute:
   die Regel ist so gebaut, dass ihr schlechtester Fall der Status quo ist
   und niemals eine ausgefallene Produktion. Ob sie greift, zeigt der
   nächste PR, der nur das Frontend anfasst.

Zusätzlich gemessen und offen: `research.visionuniverse.de` ist aus dieser
Umgebung ebenfalls nicht erreichbar (403 der Netz-Richtlinie). Die Abnahme
dieses Release stützt sich deshalb auf das **lokal gebaute** Release
desselben Commits, nicht auf einen Abruf der ausgelieferten Seite. Das ist
in den Belegen so benannt und keine stillschweigende Gleichsetzung.

## 9. Der zweite Durchgang: für jemanden, der 25 € im Monat spart

Der erste Umbau machte die Oberfläche ehrlicher. Er machte sie nicht
einfach. Gemessen am 28.09.2026 bei 390 px, mit
`scripts/vu2/measure-beginner-load.mjs`:

| Ansicht | Wörter | Karten | Klickziele | lange Sätze | Zahlen/100 W |
|---|---|---|---|---|---|
| Start | 551 | 8 | 17 | 4 | 7,3 |
| Screener | 524 | 4 | 39 | 6 | **26,1** |
| Strategien | 895 | 11 | **83** | 14 | 5,9 |
| Aktien | 689 | 5 | 50 | 1 | 24,5 |
| Aktie NVDA | **1.046** | 14 | 37 | 10 | 10,8 |
| Methodik | **1.228** | **28** | 11 | 8 | 1,5 |
| **Summe** | **4.933** | — | **237** | **43** | — |

Zum Vergleich: der Startbildschirm von Trade Republic kommt mit rund 50
Wörtern aus. Zwei Wörter standen sichtbar in der Oberfläche, die dort
nichts zu suchen haben: **„Materialisierung"** und **„Aggregat"** —
Maschinenraum-Sprech, nach außen geraten.

### 9.1 Eine Messung, die zuerst falsch war

Die erste Fassung dieser Messung zählte auf der Strategien-Seite 192
Klickziele. **109 davon lagen in zugeklappten `<details>`**: Chromium
meldet für deren Inhalt weiterhin eine Bounding-Box, und die Prüfung auf
Breite und Höhe ging durch. Gemessen wurde Last, die niemand sieht — die
Zahl, mit der ich den Umbau begründet hatte, war zu hoch.

`checkVisibility()` berücksichtigt `content-visibility`; zusätzlich fällt
alles heraus, was in einem geschlossenen `<details>` liegt. Beide Stände
oben und unten sind mit dem **korrigierten** Werkzeug gemessen.

### 9.2 Zwei Owner-Entscheidungen

**Keine Gesamtnote, sondern eine Stufe im Klartext.** Der Entwurf zeigt
„Quant Score 91/100". Die Ablehnung bleibt, aber der Einwand dahinter war
berechtigt: fünf Faktorbalken sind für einen Sparer keine Antwort.
`plain-verdict-1.0.0` zählt deshalb nur, wie viele der **bereits
gemessenen** Faktoren über und wie viele unter dem Mittelfeld liegen, und
sagt das als Satz:

> **Überwiegend stark** · Stark in 3 von 6 geprüften Punkten
> + Verdient gut an jedem Euro Umsatz
> − Finanziell angreifbar
> + Wächst kräftig

Gerechnet wird nichts dazu. Der Nenner zählt nur **bewertete** Faktoren;
ein Nenner, der fehlende mitzählte, wäre eine stille Abwertung jedes
Titels mit Datenlücken — und das sind die kleinen.

**Einsteiger zuerst, Tiefe hinter „Mehr".** Nichts wurde gelöscht. Jede
Station liegt unverändert einen Griff entfernt, unter einer Frage statt
unter einem Fachbegriff: „Wie die Lage technisch aussieht" statt „Setup".

### 9.3 Ein Widerspruch, den die Messung gefunden hat

Die erste Fassung des Urteils zeigte bei AAME **„Überwiegend schwach"**
über der Zeile **„Stark in 1 von 6 geprüften Punkten"**. Beide Zahlen
richtig, zusammen ein Rätsel — genau der Fehler, vor dem die Kommentare
in `factor-evidence.js` warnen. Die Zählzeile nennt jetzt die Seite, die
das Urteil trägt. Über 6.296 Titel gemessen: **0 Widersprüche**.

### 9.4 Das Ergebnis

| Ansicht | Wörter | Karten | Klickziele | Zahlen/100 W |
|---|---|---|---|---|
| Start | 551 → **110** | 8 → **3** | 17 → 17 | 7,3 → **2,7** |
| Screener | 524 → **474** | 4 | 39 | 26,1 → **18,4** |
| Strategien | 895 → **421** | 11 | 83 → **16** | 5,9 → 5,0 |
| Aktien | 689 → **81** | 5 → **3** | 50 → **9** | 24,5 → **3,7** |
| Aktie NVDA | 1.046 → **575** | 14 → **7** | 37 → **31** | 10,8 → 11,5 |
| Methodik | 1.228 → **197** | 28 → **3** | 11 | 1,5 |
| **Summe** | **4.933 → 1.858** | — | **237 → 123** | — |

**−62 % Wörter, −48 % Klickziele.** „Materialisierung" und „Aggregat"
stehen nicht mehr in der Oberfläche.

### 9.5 Ein Befund, den ich nicht selbst repariere

Die Bänder der Methodik sind als Perzentile beschrieben („sehr stark" =
oberste 10 %). Gemessen über 22.448 Faktorwerte liegen sie anders:

| Band | erwartet | gemessen |
|---|---|---|
| Sehr stark | 10 % | **3,2 %** |
| Stark | 15 % | 12,1 % |
| Durchschnittlich | 30 % | **46,1 %** |
| Schwach | 20 % | 25,4 % |
| Sehr schwach | 25 % | 13,2 % |

Bei `quality` stehen **2 % stark gegen 32 % schwach**. Die Werte sind
offenbar keine Perzentilränge in diesem Universum, sondern gegen eine
andere Referenz normiert. Folge für das Produkt: über 6.296 Titel lesen
sich **21 % positiv und 50 % negativ**.

Ich habe meine Schwellen **nicht** getiltet, um eine freundlichere
Verteilung herzustellen. Das wäre Schönfärberei. Ob die Bänder neu
kalibriert werden, ist eine Methodikfrage und eine Owner-Entscheidung.

### 9.6 Was der Smoke gefunden hat

Ich hatte die Aktienliste vollständig zugeklappt. Der Smoke meldete
`ZU_WENIGE_ZEILEN=0` — zu Recht, und nicht nur formal: wer ohne einen
Namen im Kopf herkommt, stand vor einem Suchfeld und sonst nichts. Ein
leerer Bildschirm ist keine Vereinfachung. Jetzt stehen sechs Zeilen
offen, die übrigen 34 liegen zu.
