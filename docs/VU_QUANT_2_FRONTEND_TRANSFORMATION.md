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

## 10. Der Screener: die Zahlenwand, und was dahinter steckte

Nach dem zweiten Durchgang war der Screener die gemessen schwerste Seite —
und er ist der Weg, den die Startseite einem Anfänger anbietet
(„Aktien finden · Du weißt noch nicht, welche"). Also genau der Weg des
25-€-Sparers.

**Gemessen bei 390 px, vor dem Umbau**, über sechs Ansichten:

| Ansicht | Wörter | erste Höhe | Karten | Klickziele | lange Sätze | Zahlen/100 W |
|---|---|---|---|---|---|---|
| Start | 110 | 65 | 3 | 17 | 0 | 2,7 |
| Aktien | 178 | 92 | 4 | 15 | 0 | 15,2 |
| Methodik | 197 | 69 | 3 | 11 | 1 | 1,5 |
| Strategien | 421 | 102 | **11** | 16 | 1 | 5,0 |
| **Screener** | 499 | 82 | 4 | **39** | 0 | **22,4** |
| Aktie NVDA | 595 | 81 | 7 | 31 | 0 | 10,8 |

22,4 Zahlen je 100 Wörter — die Wand aus Kennzahlen, die sich als „das ist
nichts für mich" liest.

> **Die Spalte „lange Sätze" trug bis zu diesem Durchgang falsche Zahlen.**
> Sie stand zuerst mit 6 (Screener), 11 (Strategien) und 24 in der Summe in
> dieser Tabelle. Die korrigierten Werte stehen oben. Warum, steht in
> Abschnitt 11 — der Fehler lag im Messwerkzeug, nicht in den Seiten.

### Wo die Zahlen wirklich saßen

Nicht geschätzt, sondern je Bereich gezählt (112 Zahlen auf der Seite):

| Bereich | Zahlen | Wörter |
|---|---|---|
| **rechte Spalte der Treffer** | **75** | 150 |
| Begründung („warum ist die Aktie hier?") | 25 | 75 |
| Kopfzeile | 3 | 19 |
| Ticker und Name | 0 | 96 |

Eine Zeile las sich:

```
GL | Globe Life | Qualität: stark (90) | 90 | nur 6 von 7 prüfbar
```

**Die Zahl stand zweimal.** `(90)` in der Begründung, `90` in der Spalte
daneben — dieselbe Zahl, dieselbe Zeile. Zwei Drittel aller Zahlen der
Seite lagen in einer Spalte, die nichts trug, was die Zeile nicht schon
sagte.

### Der Befund dahinter: ein Nenner, den niemand erreicht

„nur X von 7 prüfbar" stand auf **25 von 25 Zeilen**. Die Ursache ist
keine Anzeigefrage. Gemessen über 6.297 Titel:

| Faktor | Abdeckung |
|---|---|
| Kursstärke · Risiko | 88,4 % |
| Unternehmensqualität | 57,5 % |
| Wachstum | 50,9 % |
| Bewertung | 40,0 % |
| Profitabilität | 31,1 % |
| **Erwartungstrend (`revisions`)** | **0,0 %** |

`revisions` steht im veröffentlichten Artefakt, zählt im Nenner von sieben
mit und trägt für **keinen einzigen Titel** einen Wert. Kein Titel erreicht
7 von 7; das Maximum ist 6, und das haben 20,4 %.

Der Satz war damit wahr und trotzdem irreführend: er las sich als Mangel
**dieses** Titels, während die Lücke für alle gleich gilt. Eine Warnung,
die auf jeder Zeile steht, warnt nicht mehr — dieselbe Fehlerklasse wie
ein Wächter, der jede Nacht schreit.

### Was an ihre Stelle getreten ist

Die rechte Spalte trägt jetzt das **Klartext-Urteil** über alle bewerteten
Faktoren — dieselbe Engine, die auf der Aktienseite steht, gerechnet aus
Daten, die ohnehin in der Antwort liegen (kein neues Artefakt, keine
zweite Anfrage). Es variiert, und es ist genau die Auskunft, die fehlte:

```
GL    Globe Life               Qualität: stark (90)   Mehr Stärken als Schwächen
AGNT  AGNT, Inc.               Qualität: stark (88)   Überwiegend schwach
MBLY  Mobileye Global Inc.     Qualität: stark (85)   Überwiegend schwach
```

**AGNT ist der Punkt.** Wer auf Qualität filtert, sah vorher „stark (88)"
und nichts weiter. Dass der Titel im Gesamtbild schwach ist, stand erst
eine Seite später. Jetzt warnt ihn die Zeile, in der er sucht.

Der gemessene Wert bleibt in der Begründung — die Browser-QA verlangt ihn
dort zu Recht, ein Band allein wäre ein Etikett ohne Beleg. Der Nenner des
Urteils sind die **geprüften** Punkte („Stark in 3 von 5 geprüften
Punkten"): er beschreibt sich selbst und braucht die 7 nicht. Die
systemische Lücke steht **einmal** auf der Seite, hinter „Wie wird
gefiltert?", und wird zur Laufzeit aus dem Artefakt gezählt — trägt
`revisions` eines Tages Werte, verschwindet der Satz von allein.

### Und was der Screenshot zeigte, das keine Zahl zeigte

Die Messung sagte, es sei besser geworden. Das Bild sagte: **kein einziger
Treffer ist zu sehen.** Der erste begann bei 909 px, das Fenster ist
844 px hoch.

Drei Ursachen, alle im Bild:

1. **„Chancen finden." stand zweimal** — als Anspruch in der Kopfzeile und
   200 px darunter nochmal als Überschrift.
2. **Der Hero erklärte, was die Zeilen vorführen** („zeigt bei jedem
   Treffer, warum er dabei ist") — 22 Wörter für etwas, das jetzt sichtbar
   ist.
3. **Die Zeile über der Liste nannte vier Dinge auf einmal**: Trefferzahl,
   Universumsgröße, Methodik („Quant V2 · Factor Evidence" — im
   Sprachvertrag erlaubt, am Küchentisch trotzdem englischer Fachbegriff)
   und den Sortierschlüssel, den die Marken darüber ohnehin zeigen.

Oben blieb, was ein Einsteiger hier braucht: **wie viele er sieht**, und
zwar ehrlich („25 von 50 Treffern" statt „50 Treffer" über 25 Zeilen —
damit erklärt sich der Unterschied von selbst und braucht keinen Absatz
mehr), und **dass das keine Rangliste des Marktes ist**. Das ist die
gefährliche Fehllesart und gehört nicht hinter eine Klappe.

### Nachher

| Screener | vorher | nachher |
|---|---|---|
| Wörter | 499 | **342** |
| davon erste Bildschirmhöhe | 82 | **58** |
| Zahlen je 100 Wörter | 22,4 | **8,8** |
| lange Sätze | 0 | 0 |
| Fachbegriffe | 4 | **3** |
| erster Treffer beginnt bei | 909 px | **728 px** |
| Karten · Klickziele | 4 · 39 | 4 · 39 |

Der erste Treffer steht jetzt im ersten Bildschirm (Navigation ab 777 px,
also eine halbe Zeile mit Ticker, Name und Urteilsmarke sichtbar). Keine
Kennzahl hat sich verschlechtert.

### Ein Test, der nicht veraltet

`quant/tests/screener-hit-row.test.mjs` prüft die **Ableitung**, nicht den
heutigen Messwert: dass der Faktorname aus der Methodik kommt und nicht im
Code steht, dass das Urteil aus derselben Engine wie die Aktienseite
kommt, und — über die echten 6.297 Zeilen — dass sich aus einer
Screening-Zeile wirklich ein Urteil bilden lässt und dass es **variiert**.
Eine Spalte, die auf jeder Zeile dasselbe sagt, wäre die Tapete, die
gerade abgenommen wurde.

**Beim ersten Lauf wurde einer dieser Tests rot, obwohl die Oberfläche
sauber war**: er las den Abschnitt samt Kommentaren, und die erklären den
Befund, indem sie die alte Zeichenkette zitieren. Ein Test, der die
Begründung einer Reparatur für die Reparatur hält, verbietet, den eigenen
Befund aufzuschreiben. Er prüft jetzt den Code ohne Kommentare — und
verlangt zusätzlich, dass die Begründung im Code **stehen bleibt**.

### Offen für den Eigentümer

`revisions` bei 0,0 % ist keine Anzeigefrage, sondern eine Datenfrage:
entweder wird der Faktor gefüllt, oder er gehört aus dem veröffentlichten
Faktorsatz. Die Oberfläche sagt bis dahin ehrlich, dass er fehlt.

Drei weitere Stellen tragen denselben Nenner: die Watchlist-Zeile
(`X von 7 bewertet`), die Marke im Kopf der `/quant/`-Aktienseite
(`X von 7 Eigenschaften bewertet`) und die Tabelle des Profi-Screeners
(`X / 7`). Sie sind hier **bewusst nicht mitgeändert** — die Messung galt
dem Screener, und zwei Produkte in einem Durchgang umzubauen wäre eine
Ausweitung ohne Befund. Derselbe Einwand gilt dort aber.

## 11. Das Lineal war kaputt — zweimal, auf dieselbe Art

Diese Messung entscheidet, welche Seite als nächste umgebaut wird. Ein
Lineal, das sich nach der Form der Seite biegt, lenkt die Arbeit auf die
falsche Stelle — und niemand merkt es, weil die Zahl ja aus einer Messung
kommt.

`measure-beginner-load.mjs` hatte zwei Fehler, **beide derselben Art**:
gemessen wurde über die Seite statt über das, was ein Mensch als Einheit
liest.

### Erster Fehler: Klickziele in zugeklappten Aufklappern

Gezählt wurden auch Elemente in geschlossenen `<details>`, weil Chromium
dafür weiterhin ein Rechteck liefert. **436 statt 237 — um 84 % zu hoch.**
Behoben mit `checkVisibility()` plus einem ausdrücklichen Gang über die
Vorfahren. Beide Zustände wurden danach neu gemessen.

### Zweiter Fehler: lange Sätze über den ganzen Seitentext

```js
const saetze = text.split(/[.!?] /)     // `text` ist die GANZE Seite
```

`text` ist der Seitentext mit zusammengepressten Leerzeichen. Getrennt
wurde an `". "`. Damit verschmilzt **jede Überschrift mit dem folgenden
Absatz** zu einem Satz, bis irgendwo ein Punkt kommt:

```
"Quality Compounder Sucht Unternehmen mit stabilen Geschäftsmodellen …"
```

Auf einer Seite mit elf Karten erzeugt das elf lange Sätze, die niemand
geschrieben hat. Die Zahl bestrafte Seiten dafür, **viele Blöcke zu
haben** — und genau nach dieser Zahl wäre als nächstes umgebaut worden.

**Gemessen, korrigiert:**

| | gemeldet | tatsächlich |
|---|---|---|
| Summe über sechs Ansichten | 24 | **2** |
| Strategien | 11 | **1** |
| Screener vorher → nachher | 6 → 5 | **0 → 0** |
| Aktie NVDA | 5 | **0** |
| Methodik | 2 | **1** |

Aufgefallen ist es nur, weil zwei Messungen sich widersprachen: das
Werkzeug meldete für Strategien 11, eine direkte Messung je Absatz fand 1.
Ohne diesen Zufall wäre die Strategien-Seite als „elf lange Sätze"
angefasst worden — an einem Problem, das sie nicht hat.

### Was das für die bisherigen Aussagen bedeutet

**Alle anderen Spalten sind unberührt.** Wörter, erste Bildschirmhöhe,
Karten, Klickziele und Zahlendichte werden anders gezählt und sind von
diesem Fehler nicht betroffen. Die Befunde zum Screener stehen unverändert:
499 → 342 Wörter, erste Höhe 82 → 58, Zahlendichte 22,4 → 8,8.

Falsch war nur die Spalte „lange Sätze" — und damit die Begründung, mit der
Strategien als nächste Seite vorgemerkt war. **Die echte Last von
Strategien sind die elf Karten und 102 Wörter im ersten Bildschirm**, nicht
die Satzlänge.

### Der Test

`quant/tests/beginner-load-ruler.test.mjs` hält beide Reparaturen fest:
dass je Blockelement getrennt wird, dass verschachtelte Blöcke nicht
doppelt zählen, dass die Sichtbarkeitsprüfung für Sätze **und** Klickziele
gilt — und dass die gemessene Begründung im Werkzeug stehen bleibt. Eine
Fehlerklasse, die nur im Commit steht, wird beim nächsten Umbau wieder
eingebaut.

## 12. Strategien: dieselben drei Schnitte, und was bewusst blieb

Nach der Lineal-Korrektur (Abschnitt 11) war klar, dass Strategien **nicht**
an langen Sätzen leidet — das war ein Messfehler. Die echte Last steht in
den anderen Spalten: 421 Wörter, davon **102 im ersten Bildschirm**, und
3.863 px Gesamtlänge.

Gemessen bei 390 × 844, wo was beginnt:

| Position | Inhalt |
|---|---|
| 50 px | „Strategien verstehen." — Anspruch in der Kopfzeile |
| 142 px | „Strategien verstehen." — **dieselbe Überschrift nochmal** |
| 187 px | „Wähle einen Ansatz, der zu deinem Stil passt." |
| 252 px | 25 Wörter, die aufzählen, was jede Karte darunter zeigt |
| 377 px | „Stand der Auswertung: … · 8 Ansätze · Methodik strategy-profile-1.0.0" |
| **441 px** | **erste Strategiekarte** |

Dieselben drei Befunde wie beim Screener, auf einer anderen Seite:

1. **Die Überschrift wiederholte den Anspruch** — dieselben drei Wörter,
   92 px auseinander, dazwischen nichts.
2. **Der dritte Satz zählte auf, was die Karten vorführen** — und war
   zugleich der einzige lange Satz der Seite.
3. **Die technische Zeile nannte vier Dinge auf einmal.** Davon bleibt die
   eine, die entscheidet, ob man den Zahlen trauen kann: der Stichtag. Die
   Zahl der Ansätze steht als Karten darunter; die Methodikkennung gehört
   zu den Vorbehalten am Fuß der Seite, wo ohnehin steht, was diese Zahlen
   *nicht* sind.

### Nachher

| Strategien | vorher | nachher |
|---|---|---|
| Wörter | 421 | **398** |
| davon erste Bildschirmhöhe | 102 | **85** |
| lange Sätze | 1 | **0** |
| **erste Strategiekarte bei** | **441 px** | **309 px** |
| Karten · Klickziele | 11 · 16 | 11 · 16 |
| Zahlen je 100 Wörter | 5,0 | 5,3 |

Der erste Bildschirm zeigt jetzt eine **vollständige Strategie** — Name,
was sie sucht, „7 Titel erfüllen heute alle Bedingungen", der Weg hinein —
plus den Anfang der nächsten. Vorher war es eine angeschnittene Karte.

**Zur Ehrlichkeit:** die Zahlendichte stieg von 5,0 auf 5,3. Nicht weil
Zahlen dazukamen, sondern weil Wörter wegfielen und der Nenner schrumpfte.
Die absolute Zahl der Zahlen ist unverändert.

### Was bewusst NICHT gekürzt wurde

**Die acht Strategiekarten.** Ein früherer Durchgang hat sie bereits von
895 auf 421 Wörter und von 83 auf 16 Klickziele gebracht; jede trägt jetzt
Name, einen Satz, die heutige Trefferzahl, einen Weg hinein und alles
Weitere im Aufklapper.

Acht echte Wahlmöglichkeiten rechtfertigen ihre Länge. Eine nackte
Namensliste („GARP", „Value Momentum", „Future Leader") wäre für genau den
Einsteiger wertlos, um den es hier geht — er weiß ja gerade nicht, was
diese Namen bedeuten. Die Seite ist lang, weil es acht Antworten gibt,
nicht weil sie schwätzt.

### Die Regel wanderte in die QA

Die Doppelung aus Anspruch und Überschrift ist **zweimal an zwei Tagen auf
zwei Seiten** aufgetreten. Eine Regel, die man zweimal von Hand findet,
gehört in eine Prüfung.

Sie steht deshalb nicht im Quelltext einer einzelnen Seite, sondern in der
Schleife der Browser-QA über **alle 18 Ansichten** — und gilt damit auch
für Seiten, die es noch nicht gibt. Vor dem Einbau über alle 18 gemessen:
**null Doppelungen**, alle anderen Seiten waren bereits sauber
(`home`: „Transparenz zuerst." über „Aktien verstehen, ohne Vorwissen";
`explain`: „Keine Blackbox." über „Wir zeigen dir, wie wir rechnen").
Die Prüfung hat also keine Nebenwirkungen — sie hält nur fest, was schon
gilt.

## 13. Die Aktien-Übersicht: zwei Konstanten, vierzigmal wiederholt

Die Übersicht hatte mit **15,2 Zahlen je 100 Wörtern** die zweithöchste
Dichte nach dem alten Screener. Vor dem Umbau stand aber die Frage, ob das
überhaupt ein Defekt ist: **eine hohe Zahlendichte auf einer Kursliste ist
keiner** — dort sind Zahlen der Inhalt. Also erst gemessen, wo sie sitzen.

Über alle 40 Zeilen, aufgeklappt:

| Spalte | verschiedene Werte |
|---|---|
| „Stand 2026-09-28" | **40 × dasselbe** |
| „Vollständig verbundene Analyse verfügbar." | **36 × dasselbe** |
| „Kein Aktienurteil — dieses Papier ist keine Aktie." | 4 × (die Ausnahme) |

Von den 24 Zahlen der rechten Spalte waren **18 der immer gleiche
Stichtag**. Und der Satz auf 36 Zeilen verdeckte genau die vier, die
wirklich etwas mitteilen.

Das ist dieselbe Fehlerklasse wie „nur 6 von 7 prüfbar" im Screener und
wie der Wächter, der jede Nacht schrie: **was immer dasteht, wird nicht
mehr gelesen — und verdeckt das, was nur manchmal dasteht.** Dreimal
dieselbe Klasse an einem Tag, an drei verschiedenen Stellen.

### Nachher

```
A     Agilent Technologies, Inc.                              175,21 $
AA    Alcoa Corp                                               42,25 $
AAAC  Columbia AAA CLO ETF  Kein Aktienurteil — keine Aktie.   20,11 $
```

| Aktien-Übersicht | vorher | nachher |
|---|---|---|
| Zahlen auf der Seite | 27 | **12** |
| Zahlen je 100 Wörter | 15,2 | **7,6** |
| Wörter | 178 | **157** |
| erste Bildschirmhöhe | 92 | **81** |

Der Stichtag steht **einmal** über der Liste — und zwar nur, wenn alle
Zeilen denselben tragen. Weicht eine ab, behält sie ihren eigenen; dann
ist er nämlich eine Auskunft und keine Tapete. Ihn ganz wegzulassen wäre
kein Fortschritt, sondern Verlust.

### Die Prüfung hält die Regel, nicht den Text

`browser-qa.mjs` bekommt einen `stocks`-Block, der die **Regel** festhält:
kein Nebentext einer Trefferzeile darf auf *allen* Zeilen derselbe sein —
und der Stichtag muss trotzdem dastehen, einmal, über der Liste. Ein Test
auf den heutigen Wortlaut hätte genau diesen Fall gefangen und den
nächsten nicht.
