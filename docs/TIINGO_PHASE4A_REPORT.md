# TIINGO PHASE 4A — ABSCHLUSSBERICHT

Stand: 2026-09-07 · Branch `claude/tiingo-phase4a` · 331 Tests grün
Release-Audit durchgeführt; zwei zusätzliche HIGH-Befunde gefunden und behoben (Frage 21).

Der Erfolgsmaßstab dieser Phase war nicht die Zahl geänderter Dateien, sondern
eine Frage: **Kann Tiingo als Market-Data-Layer für Vision Universe
funktionieren?** Die Antwort ist ja, mit benannten Einschränkungen.

---

## Die Antworten

### 1. Ist Tiingo technisch erfolgreich integriert?

Ja. Als weiterer Adapter hinter derselben Schnittstelle, die Phase 2 für Twelve
Data eingeführt hat. Der aussagekräftigste Beleg ist negativ: **an `factors.js`,
`quant-score.js`, `strategy.js` und `backtest.js` wurde keine Zeile geändert.**
Echte Kurse laufen durch dieselbe Logik wie das Modelluniversum.

Die einzige Änderung an einer bestehenden Engine war eine Korrektur, keine
Anpassung: `backtest.js` schrieb `capabilities.isMock: true` fest. Solange es
nur das Modelluniversum gab, war das richtig; bei echten Kursen wäre es eine
Falschangabe gewesen.

### 2. Welche Endpoints wurden tatsächlich zur Laufzeit getestet?

Vier, alle gegen die echte API in GitHub Actions:

| Endpoint | Wofür | Ergebnis |
|---|---|---|
| `/tiingo/daily/{t}` | Stammdaten | Apple Inc, NASDAQ, Historie ab 1980-12-12 |
| `/tiingo/daily/{t}/prices` | EOD-Bars | 2 936 Bars je Titel, 2015-01-02 → 2026-09-04 |
| `/iex/{t}/prices` | Intraday | 78 Bars |
| — | Kontingentverhalten | `429` mit Stundengrenze, siehe Frage 17 |

Nicht abgerufen: Fundamental-Endpoints, WebSocket, dedizierte Corporate-Action-
Endpoints (nicht nötig — die Ereignisse stehen in der Kursreihe).

### 3. Welche Testaktien wurden verwendet?

Zwölf, absichtlich gewählt statt zufällig — jede beantwortet eine Frage:

| Titel | Warum dieser |
|---|---|
| NVDA | zwei Splits im Zeitraum (4:1 2021, 10:1 2024) |
| AAPL | Split 4:1 2020, dazu Dividenden |
| AMZN | Split 20:1 2022, **keine** Dividende |
| TSLA | Split 3:1 2022, keine Dividende |
| KO, JNJ, XOM, JPM | verlässliche Quartalsdividenden |
| MSFT, META | Dividenden mit unterschiedlicher Historie |
| SPY | ETF, Ausschüttungen |
| BRK-B | Sonderzeichen im Ticker, **weder Split noch Dividende** |

Die drei fett hervorgehobenen Eigenschaften waren die produktivsten: AMZN und
TSLA haben einen Fehlschluss in der Prüflogik aufgedeckt, BRK-B einen zweiten.
Siehe Frage 21.

### 4. Wie weit reicht die Historie praktisch?

Weiter als erwartet und im Free-Tarif nicht beschnitten.

- Stammdaten weisen für AAPL eine Historie ab **1980-12-12** aus.
- Eine Abfrage ab 1990-01-01 lieferte **1 517 Bars ab 1990-01-02**.
- Der Import über zwölf Titel ab 2015 lieferte je **2 936 Bars**.

Die volle Historie kostet **eine Anfrage**. Es gibt keine Seitenaufteilung, an
der sich das Kontingent aufreibt — das ist der Unterschied zwischen einem
Erstimport von 500 Anfragen und einem von mehreren tausend.

### 5. Funktionieren Raw und Adjusted Prices?

Ja, beide, und das ist der wichtigste Befund der Phase.

Tiingo liefert je Handelstag beide Spalten. Am Ex-Tag einer KO-Dividende
(2024-03-14) liegt der bereinigte Eröffnungskurs des 07.03. bei **55,5092**
gegenüber **59,69** unbereinigt, Verhältnis **0,92996**. Die Ausschüttung ist
eingerechnet: nach `price-adjustment-v1.json` ist das **TOTAL_RETURN**.

Damit ist Tiingo der erste zur Laufzeit belegte Total-Return-Bestand im
Projekt — und er kostet nichts. Twelve Data liefert im Free-Tarif kein
`adjusted_close`; jene Reihe ist splitbereinigt und für Renditeaussagen nicht
geeignet.

**Was daraus folgt:** Momentum, Volatilität, Drawdown, Rendite und CAGR dürfen
aus dieser Reihe berechnet werden. Das Wort „Rendite" ist erstmals gedeckt.

### 6. Funktionieren Splits?

Ja. `splitFactor` kennzeichnet den Splittag in der Kursreihe (NVDA 2021-07-20,
Faktor 4). Der unbereinigte Kurs springt um **4,036×**, der bereinigte um
**0,957×**. Der Import fand über zwölf Titel drei Splitereignisse.

Ein eigener Endpoint ist nicht nötig — und damit auch keine zusätzliche
Anfrage.

### 7. Funktionieren Dividenden?

Ja. `divCash` steht je Handelstag. Gemessen bei KO vier Zahlungen zu je 0,485
USD in 2024; über den vollen Importzeitraum 46–47 Ausschüttungen je
Dividendentitel.

### 8. Funktioniert Intraday?

Technisch ja: 78 Bars über `/iex/{t}/prices`, `resampleFreq` einstellbar.

**Es ist trotzdem abgeschaltet.** Die IEX-Daten des Free-Tarifs sind an eine
nicht-anzeigende Nutzung geknüpft; was das für eine öffentliche Seite bedeutet,
ist eine Lizenzfrage und keine technische. `ENABLE_LIVE_MARKET_DATA` steht auf
aus, mit dieser Begründung und Datum in `quant/config/feature-gates.json`.

Ein funktionierender Abruf fühlt sich wie eine Erlaubnis an. Er ist keine.

### 9. Funktioniert IEX / Realtime?

IEX-Intraday: ja (Frage 8). **Realtime im engeren Sinn wurde nicht geprüft.**
Der Endpoint liefert den letzten IEX-Stand; ob das im Free-Tarif als Echtzeit
oder verzögert gilt, wurde nicht gemessen. `realtime` und `delayed` stehen
deshalb beide auf `null` — ungeprüft, nicht widerlegt.

### 10. Funktioniert WebSocket?

**Nicht geprüft, und in dieser Architektur nicht nutzbar.**

Ein WebSocket setzt eine Authentifizierung im Client voraus. Die Seite wird
statisch von GitHub Pages ausgeliefert; ein Schlüssel dort wäre kein Risiko,
sondern eine Veröffentlichung. Es wurde deshalb kein Versuch unternommen —
`websocket` steht auf `null`.

### 11. Ist der API Key vollständig geschützt?

Ja, mit vier Schichten:

1. Er existiert nur als GitHub-Secret und im Speicher des Action-Runners.
2. Der Adapter setzt ihn in den `Authorization`-Header, **nicht in die URL** —
   eine geloggte URL verrät ihn nicht. Ein Test hält das fest.
3. `scripts/market/assert-no-secrets.mjs` durchsucht alles unter
   `quant/data/market` nach Umgebungswerten und bricht ab; der Workflow ruft es
   nach jedem Import auf.
4. Ein eigener Workflow-Schritt prüft den Nachweisbericht gesondert auf den
   Schlüssel und auf `?token=`-Muster.

Der Browser ruft nichts beim Anbieter ab. Er hat nichts, womit er sich
ausweisen könnte, und braucht es nicht.

### 12. Funktioniert der Chart?

Ja. Kerzen mit Volumen im selben Koordinatensystem, ohne Chartbibliothek — der
Rest der Anwendung kommt auch ohne aus.

Im Browser gegen beide Gate-Stellungen geprüft, Desktop und 390 px, ohne
horizontalen Überlauf:

| Zeitraum | Gate aus | Gate an |
|---|---|---|
| 1T, 5T | abgeblendet, mit Begründung | 78 Intraday-Bars |
| 1M | 32 Kerzen | 32 Kerzen |
| 1J | 367 Punkte (dichte Darstellung) | dito |

Bei sehr dichten Reihen bleibt nur der Docht: eine Kerze, die schmaler als ein
Pixel wäre, wäre ohnehin keine. Die Farbe trägt die Richtung weiter.

Am Chart steht immer Quelle und Bereinigungsstufe. Ohne diese Zeile bleibt
offen, ob die gezeigte Bewegung eine Rendite ist oder nur ein Kursverlauf.

### 13. Welche Technical Metrics laufen mit echten Daten?

Alle kursbasierten, unverändert und ohne Sonderweg. Geprüft gegen
`Factors.computeMetricPanel` mit genau dem Aufruf, den auch das Modelluniversum
benutzt:

`momentum3m` · `momentum6m` · `momentum12m` · `momentum12m1m` ·
`distanceTo52wHigh` · `priceTo50dma` · `priceTo200dma` · `volatility` ·
`downsideVolatility` · `maxDrawdown` · `beta` · `avgDollarVolume` ·
`relativeStrength`

### 14. Welche Quant-Faktoren laufen mit echten Daten?

**Momentum und Risiko — und sonst keiner.**

Quality, Value und Growth brauchen Fundamentaldaten. Die gibt es für diese
Titel nicht, und sie zu erfinden ist die eine Sorte Fehler, die sich nicht
durch einen Hinweis heilen lässt.

Die Deckungslogik aus Phase 1 erkennt das von selbst: der Quant Score kommt als
`incomplete` mit `score: null` und benanntem Grund heraus. Ein Test hält fest,
dass daraus **kein** vollständiger Score entsteht.

### 15. Funktioniert ein echter Price-Only-Backtest?

Ja. Eine Momentum-Strategie über sechzehn Titel in vier Sektoren, monatliches
Rebalancing, gegen einen Provider, der ausschließlich Kurse kennt. Ergebnis:
Equity-Kurve, CAGR, Drawdown, `everInvested: true`, `timeInvestedPct > 50`.

Zwei Dinge musste die Strategie ausdrücklich setzen, und beide sind lehrreich:

- **Das Ranking.** Die Voreinstellung rankt zur Hälfte nach Quality und fände
  ohne Bilanzdaten korrekt keinen einzigen Kandidaten.
- **Die Größengrenze.** Eine Marktkapitalisierung gibt es hier nicht, und sie
  zu erfinden wäre genau das, was §21 verbietet.

### 16. Wie viel Free-Quota wurde verbraucht?

| Lauf | Anfragen | Bytes |
|---|---|---|
| Laufzeitnachweis (je Lauf) | 6 | 0,44 MB |
| Import über zwölf Titel | 12 | 8,9 MB |
| **Summe über alle Läufe der Phase** | **55** | **20,0 MB** |

Das sind **0,98 %** des Monatsbudgets von 2 GB. Je Titel kostet die volle
Historie ~725 KB, je Bar ~253 Byte.

Die 55 verteilen sich auf fünf Nachweisläufe (je 6), zwei Importläufe (je 12)
und eine Anfrage, die in die Stundengrenze lief — siehe Frage 17.

Die Bandbreite ist in keinem realistischen Szenario der Engpass. Sie wird
trotzdem gezählt: ein Kontingent, das niemand zählt, wird im Zweifel
überschritten, ohne dass jemand es merkt.

### 17. Welche Limits wurden tatsächlich beobachtet?

Die Stundengrenze, und zwar durch Überschreitung.

Nach fünf Läufen innerhalb einer Stunde (zusammen 42 Anfragen) meldete Tiingo
beim sechsten ein Kontingentproblem. Der Client hatte davon nichts geahnt: die
Fenster leben im Prozess, und jeder Actions-Lauf startet auf einem frischen
Runner bei `0/50`.

Der Rückfall funktionierte — der `429` füllt das Stundenfenster auf, und der
Lauf hört auf zu fragen. Aber die verlässliche Grenze ist damit die des
Anbieters und nicht die eigene. Zwei Konsequenzen wurden gezogen: Nachweis und
Import laufen nur noch auf Anforderung, und ein Kontingentproblem gilt nicht
mehr als widerlegte Fähigkeit (Frage 21).

Minuten- und Tagesgrenze wurden nie erreicht.

### 18. Was bleibt Mock?

| Datenklasse | Herkunft |
|---|---|
| Kurse (Testuniversum) | **echt**, Tiingo, TOTAL_RETURN |
| Kapitalmassnahmen | **echt**, aus der Kursreihe |
| **Fundamentaldaten** | **synthetisch, ausnahmslos** |
| Kurse (Modelluniversum, 511 Titel) | synthetisch |
| Schätzungen, Makrodaten, Nachrichten | keine Quelle |

Die Grenze aus Phase 1 gilt unverändert: **ein reales Unternehmen bekommt keine
erfundenen Bilanzzahlen.** Deshalb bekommen die zwölf Titel echte Kurse und
keinen vollständigen Quant Score.

Die Marktdatenseite zeigt ein Herkunftsabzeichen **je Datenklasse**, nicht eines
für die Seite. Ein Gesamtabzeichen würde unweigerlich „Live", sobald irgendetwas
live ist — und genau diese Verkürzung wäre die Halbwahrheit.

### 19. Welche Änderungen sind nötig beim Upgrade auf Commercial?

Eine Zahlengruppe: `COMMERCIAL_LIMITS` statt `FREE_LIMITS` beim Erzeugen des
Providers. `market-client.js` kennt keinen Tarif, nur rollende Fenster.

> Die Zahlen darin sind **Platzhalter**. Es besteht kein kostenpflichtiger
> Zugang, die Konditionen sind ungeprüft. Das Objekt trägt `verified: false`,
> und ein Test hält das fest. Wer den Tarif in Betrieb nimmt, ersetzt sie durch
> die zugesagten.

Echte Arbeit fällt an genau einer Stelle an: **paralleler Abruf**.
`concurrency` ist deklariert, aber nicht genutzt — bei zwölf Titeln lohnt es
nicht, bei 5 000 schon. Das betrifft eine Datei.

Nicht geändert werden: Adapter, Speicher, Qualitätsprüfung, Panel-Brücke, die
Engines — und die Fähigkeitsmatrix. Ein höheres Kontingent macht aus einer
ungeprüften Fähigkeit keine geprüfte.

### 20. Kann die Pipeline auf 500 / 2 000 / 5 000 Aktien skalieren?

| Universum | Free-Tarif | Commercial (Platzhalterwerte) |
|---|---|---|
| 500 | ja, als Nachtlauf (10 h) | ~6 min |
| 2 000 | **nein** — über der Tagesgrenze | ~25 min |
| 5 000 | **nein** | ~1 h |

Die harte Grenze des Free-Tarifs liegt bei etwa **1 000 täglich aktualisierten
Titeln**, und schon dort ist die Stundengrenze das Nadelöhr: 20 Stunden
Wanduhrzeit.

Bandbreite ist nie der Engpass: 500 Titel Erstimport = 354 MB = 17 % des
Monatsbudgets.

### 21. Welche kritischen Probleme wurden gefunden?

Neun, in sieben Gruppen. **Drei kamen durch den Lauf gegen die echte API,
drei durch adversarisches Nachlesen, zwei durch den Release-Audit** — keiner
davon durch die Testsuite, die zum jeweiligen Zeitpunkt grün war.

**a) Die Stetigkeitsprüfung lief auf der falschen Spalte.**
Der erste Import verwarf AAPL, NVDA, AMZN und TSLA — alle vier mit Split, alle
vier mit tadellos bereinigter Reihe daneben. Die Prüfung lief auf der **rohen**
Spalte, und die springt an einem Split. Das ist ihre Aufgabe, nicht ihr Fehler.
Eine Annahme aus Phase 2, die mit einer Spalte richtig war und mit zweien falsch
wird.

**b) Fehlende Beobachtung wurde als Widerlegung gelesen.**
Der zweite Import verwarf AMZN und TSLA: „als TOTAL_RETURN deklariert, verhält
sich wie SPLIT_ADJUSTED". Beide zahlen keine Dividende — bei einem Titel ohne
Ausschüttung sind die beiden Stufen dieselbe Reihe. Der Widerspruch stützte sich
auf einen Rangvergleich statt auf Widerlegung. Derselbe Denkfehler, den dieselbe
Datei bei der Ableitung ausdrücklich vermeidet; er stand nur in der zweiten
Hälfte noch drin.

**c) Ein Kontingentproblem widerlegte eine Fähigkeit.**
Als die Stundengrenze griff, schrieb der Nachweis `apiAccess: FAILED` — und der
Adapter hätte daraus `securityMaster: false` gemacht. Eine Widerlegung, die nur
besagt, dass gerade niemand nachsehen konnte. Jetzt: `INCONCLUSIVE`, das nichts
anhebt und nichts absenkt, und ein Lauf ohne Messung schreibt gar keinen
Bericht.

**d) Latenter Schemafehler (vor dem ersten API-Lauf gefunden).**
Die Bars des Twelve-Data-Adapters verletzten das eigene Schema:
`adjustedClose` war als Pflichtfeld deklariert, `adjustmentStatus` gar nicht.
Kein Test hatte je Adapterausgabe gegen das Schema geprüft.

**e) Drei Fehler in der Zeitraumlogik (beim Nachlesen gefunden).**
Ein voller Zeitstempel als Stichtag löste eine Ausnahme mitten im Rendern aus.
Ein unlesbarer Stichtag ließ das Fenster stillschweigend entfallen — „1 Monat"
zeigte dann die ganze Historie. Und das Fenster hatte keine obere Grenze: bei
einem Stichtag mitten in der Reihe zeigte der Chart auch die Tage danach.

Der zweite und dritte sind die unangenehmeren, weil sie nicht abstürzen,
sondern still das Falsche zeigen.

**f) Veröffentlichen hing an einem Flag statt an einer Erlaubnis** (Release-Audit).
`publish()` schrieb 400 echte Bars nach `quant/data/market/daily/`, obwohl beide
Feature-Gates aus waren und keine Lizenz eingetragen war. Zwischen Arbeitsablage
und Auslieferung lag nichts als `--publish`. Das ist der Weg, auf dem es
ankommt: der Pfad wird von GitHub Pages ausgeliefert und liegt in der
Versionierung — was dort einmal steht, ist veröffentlicht, und ein späteres
Löschen entfernt es nicht aus der Historie.

`publish()` verlangt jetzt eine ausdrückliche Erlaubnis mit Grundlage und
verweigert ohne sie den Dienst; der Import holt sie aus derselben Richtlinie,
die die Anzeige regelt.

**g) Intraday-Bars trugen den Handelstag am falschen Feld** (Release-Audit).
Der Adapter schrieb ihn unter `timestamp`, das Schema kennt nur `date`, und
alles Nachgelagerte liest von dort. Der 1T-Chart lieferte auf echten
Adapterbars **null Punkte** — während der Browsertest grün war, weil dessen
Fixture `date` benutzte. Genau die Lücke zwischen „Test grün" und „läuft".

Möglich wurde das, weil kein Test die Adapterausgabe je gegen das kanonische
Schema gehalten hat — dieselbe Ursache wie bei Befund (d). Jetzt tun es drei.

Alle sieben Gruppen sind behoben und durch Tests festgehalten. **CRITICAL oder
HIGH offen: keine.**

### 22. Wie viele Tests sind grün?

**331 von 331.** Ausgangspunkt Phase 3: 232.

| Datei | Tests |
|---|---|
| `tiingo.test.mjs` | 34 |
| `market-store.test.mjs` | 20 |
| `adjustment-consistency.test.mjs` | 18 |
| `chart-ranges.test.mjs` | 15 |
| `panel-builder.test.mjs` | 12 |
| bestehende (Phase 1–3) | 232 |

Kein Test ruft eine echte API auf; alle arbeiten auf Fixtures. Die Läufe gegen
die echte API laufen ausschließlich in GitHub Actions und auf Anforderung.

### 23. Ist die bestehende Seite weiterhin vollständig funktionsfähig?

Ja. Alle 232 Tests aus Phase 1–3 sind unverändert grün, und die Änderungen an
bestehenden Dateien sind eng begrenzt:

| Datei | Änderung |
|---|---|
| `schema.js` | `PriceBar` erweitert — `adjustedClose` ist nicht mehr Pflicht |
| `market-client.js` | Stundenfenster, Byte-Zähler, `rateLimited`-Zustand |
| `capabilities.js` | `evidence`-Feld ergänzt |
| `market-quality.js` | Spaltenwahl, Widerlegungslogik (Frage 21 a/b) |
| `backtest.js` | `isMock` abgeleitet statt festgeschrieben |
| `shell.js` | Kapitalmassnahmen-Abzeichen in beide Richtungen |
| `markt/app.js`, `charts.js`, `quant.css` | Kerzenchart, Zeitraumleiste, Freigabetabelle |

Der Mock-Modus ist unverändert der Normalzustand. Öffentlich sichtbar ist
weiterhin **nichts** von Tiingo: der Import schreibt in den Arbeitsstand
(`.market-cache`, nicht im Repository), ein CI-Schritt prüft nach, dass keine
Kursreihe im veröffentlichten Pfad landet.

### 24. Was ist der exakt empfohlene nächste Schritt?

**Die Lizenzfrage klären — vor allem anderen.**

Konkret: schriftlich festhalten, ob Tiingo-Kursdaten auf einer öffentlichen
Seite angezeigt und in einem öffentlichen Repository gespeichert werden dürfen,
und ob die IEX-Intradaydaten des Free-Tarifs davon abweichen.

Warum das und nichts anderes:

Technisch ist alles fertig. Der Adapter läuft, die Bereinigung ist belegt, die
Engines rechnen, der Chart zeichnet. Was fehlt, ist **kein Code**. Was fehlt,
ist die Erlaubnis, das Gebaute zu zeigen — und ohne sie bleibt der ganze
Datenpfad im Arbeitsstand liegen. Jede weitere Programmierarbeit vergrößert
etwas, das niemand sehen darf.

Sobald die Antwort vorliegt, ist der Rest kurz: einen Eintrag in
`display-policy.js` mit Grundlage und Datum, ein Gate umlegen, `--publish`
laufen lassen. Das ist ein Nachmittag.

Was **nicht** als Nächstes ansteht:
- Kein kostenpflichtiger Tarif. Der Free-Tarif trägt 1 000 Titel; das
  Testuniversum hat zwölf.
- Keine Elliott-Wave-Engine. Die Datenschicht trägt sie (Wochenbars fehlen
  noch), aber sie ist eine eigene Phase.
- Keine Fundamentaldaten von Tiingo. Das ist der SEC-Workstream, und der ist
  ausdrücklich getrennt.

---

## Für die Master-Dokumentation

Diese Phase legt **keine** Master-Datei an und ändert keine bestehende — die
zentrale `VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md` läuft über einen eigenen
Dokumentations-PR. Was nach einem erfolgreichen Merge dort einzuarbeiten wäre:

| Thema | Kernaussage |
|---|---|
| Datenanbieter | Tiingo ist als Marktdatenanbieter qualifiziert (`PARTIALLY_QUALIFIED`), nicht als Evidenzquelle. |
| Preissemantik | Erster zur Laufzeit belegter **TOTAL_RETURN**-Bestand des Projekts, im kostenlosen Tarif. |
| Fähigkeitsmatrix | Sie wird nicht mehr behauptet, sondern von einem committeten Laufzeitnachweis gehoben — mit Lauf, Commit und Zahlen je Fähigkeit. |
| Anzeigerichtlinie | Neue Schicht: „können wir abrufen" und „dürfen wir anzeigen" sind getrennt. Öffentliche Anzeige verlangt Gate **und** Lizenz. |
| Auslieferung | Ein Schreibvorgang in einen ausgelieferten Pfad verlangt eine Erlaubnis mit Grundlage, kein Kommandozeilenflag. |
| Grenze zu Fundamentaldaten | Unverändert: reale Unternehmen bekommen echte Kurse und keine erfundenen Bilanzen. |
| Offen | Lizenzfrage, Gates A/B/C, Fundamentaldaten, Realtime, WebSocket. |

## Was diese Phase über das Vorgehen zeigt

Von neun Befunden kamen drei aus **sechs echten API-Aufrufen und einem
Import**, drei aus dem adversarischen Nachlesen des eigenen frischen Codes und
zwei aus dem Release-Audit. **Keiner** kam aus der Testsuite, die zum jeweiligen
Zeitpunkt grün war.

Die Tests waren nicht schlecht. Sie kannten nur keinen Fall, in dem beide
Spalten mit einem echten Split nebeneinander liegen, und keinen Titel, der eine
Eigenschaft schlicht nicht hat — AMZN zahlt keine Dividende, BRK-B hat keine
Kapitalmaßnahme. Solche Fälle denkt man sich nicht aus; die Wirklichkeit legt
sie vor.

Das ist kein Argument gegen Tests, sondern eines für zweierlei: den ersten Lauf
gegen echte Daten früh zu machen und ihn ernst zu nehmen, wenn er etwas
verwirft — und den eigenen frischen Code noch einmal mit der Frage zu lesen,
was ihn zum stillen Falschantworten bringen würde. Die beiden Befunde, die
niemandem aufgefallen wären, sind genau die: kein Absturz, nur ein Fenster, das
mehr zeigt als bestellt.
