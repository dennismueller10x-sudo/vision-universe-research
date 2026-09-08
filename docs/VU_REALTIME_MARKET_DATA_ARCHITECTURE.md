# VU REALTIME MARKET DATA ARCHITECTURE

Wie ein Live-Chart entsteht, der nicht lügt.

Module: `quant/engines/realtime/`
Anbieter: `providers/tiingo/realtime.js`
Oberfläche: `quant/ui/live-chart.js`
Konfiguration: `quant/config/market-calendar.json`, `quant/config/realtime-thresholds.json`
Vorgeschichte: `TIINGO_LIVE_ARCHITECTURE.md`, `VU_MARKET_DATA_ARCHITECTURE.md`, `VU_PROVIDER_ARCHITECTURE.md`

---

## Die Frage, um die es geht

Ein Chart, der Kurse zeigt, macht eine Aussage über die Gegenwart. Wenn über
ihm „LIVE" steht, ist es sogar eine Zusicherung. Die schwierige Aufgabe ist
nicht, Daten zu holen — das ist ein HTTP-Aufruf. Sie ist, in jedem Moment
sagen zu können, **wie alt das ist, was da steht**, und das Etikett zu
ändern, sobald sich die Antwort ändert.

Der klassische Fehler sieht nicht wie ein Fehler aus:

> Die Verbindung reißt. Das letzte Bild bleibt stehen. Darüber steht
> weiterhin „LIVE". Nichts blinkt, nichts meldet sich — der Chart sieht
> genauso aus wie vorher. Nur ist der Kurs jetzt zwanzig Minuten alt, und
> jemand trifft eine Entscheidung darauf.

Diese Architektur ist um diesen einen Fall herum gebaut.

---

## Die Leiter

Es gibt fünf Datenklassen, in genau dieser Reihenfolge:

```
REALTIME_STREAM   Push-Verbindung, Tick für Tick
      ↓
REALTIME_QUOTE    Kursabfrage ohne Verzögerung, wiederholt geholt
      ↓
INTRADAY          Intraday-Bars, typisch 1–5 Minuten
      ↓
EOD               Tagesschlusskurse
      ↓
UNAVAILABLE       kein belastbarer Datenstand
```

`UNAVAILABLE` steht bewusst mit auf der Leiter. „Nichts verfügbar" ist ein
**Ergebnis der Auswahl**, kein Ausfall der Auswahl — der Chart bleibt
bedienbar und sagt, woran es liegt.

**Was nicht auf der Leiter steht:** das synthetische Modelluniversum. Es gibt
keinen Mock-Rückfall, auch nicht als letzte Sprosse. Ein Chart, der bei
fehlenden Kursen erfundene zeichnet, ist schlimmer als ein leerer — er sieht
richtig aus. Ein Test hält fest, dass die Leiter kein Wort wie „mock",
„synth" oder „demo" enthält.

---

## Die drei Gutachter

Bevor eine Datenklasse benutzt werden darf, müssen drei Fragen mit Ja
beantwortet sein. Sie werden in dieser Reihenfolge gestellt, und die
Reihenfolge ist die Aussage:

| # | Frage | Antwortet | Ein Nein heißt |
|---|---|---|---|
| 1 | Liefert der Anbieter das? | `capabilities.js` + Laufzeitnachweis | `UNAVAILABLE` / `UNKNOWN` |
| 2 | Ist der Abruf freigeschaltet? | `feature-gates.json` | `BLOCKED_BY_PLAN` |
| 3 | Darf das Ergebnis diese Zielgruppe sehen? | `display-policy.js` | `BLOCKED_BY_LICENSE` |

Warum die Reihenfolge zählt: **„Der Anbieter kann das nicht" löst man mit
einem Anbieterwechsel, „Die Lizenz erlaubt es nicht" mit einem Vertrag, und
„Das Gate ist aus" mit einem Commit.** Drei verschiedene Aufgaben. Eine
Klasse, die der Anbieter gar nicht liefert, als `BLOCKED_BY_LICENSE` zu
melden, wäre eine Falschauskunft in Richtung Rechtsabteilung.

### Sechs Zustände statt drei

Phase 2 kannte `true` / `false` / `null`. Für einen Live-Chart reichen die
nicht:

```
AVAILABLE            an echten Daten belegt        ← nur dieser ist nutzbar
UNAVAILABLE          ausdrücklich nicht vorhanden
UNKNOWN              niemand hat nachgesehen
BLOCKED_BY_PLAN      technisch da, nicht freigegeben
BLOCKED_BY_LICENSE   technisch da, Anzeige nicht erlaubt
ERROR                die Prüfung selbst ist gescheitert
```

**Die Regel, die alles trägt: `UNKNOWN` wird niemals `AVAILABLE`.** Eine
ungeprüfte Fähigkeit ist keine Fähigkeit. Sie darf einen Prüfpfad auslösen,
aber nie eine Anzeige. Wer „LIVE" schreibt, weil die Anbieterdokumentation
Realtime nennt, hat den Nutzer belogen — und der Kurs, den er dabei zeigt,
ist möglicherweise fünfzehn Minuten alt.

`ERROR` existiert aus einem Grund, der schon einmal weh getan hat: ein
erschöpftes Kontingent als „kann kein Realtime" zu verbuchen trägt eine
Widerlegung in die Matrix ein, die nur besagt, dass gerade niemand
nachsehen konnte.

---

## Die Bausteine

Elf Module, jedes mit einer Aufgabe. Keines rechnet in einem anderen mit.

```
                    ┌─────────────────────────┐
                    │ capability-negotiation  │  Was darf und kann dieser Zugang?
                    └────────────┬────────────┘
                                 ▼
   Laufzeitzustand ─────► ┌─────────────────┐
   Bestand         ─────► │ fallback-engine │  Welche Klasse zeichnen wir jetzt?
   Verfall         ─────► └────────┬────────┘
                                   ▼
                          ┌─────────────────┐
                          │      feed       │  Die Reihenfolge. Rechnet nichts selbst.
                          └────────┬────────┘
        ┌──────────────┬───────────┼───────────┬──────────────┐
        ▼              ▼           ▼           ▼              ▼
  ┌───────────┐  ┌───────────┐ ┌────────┐ ┌──────────┐  ┌────────────┐
  │ transport │  │ bar-merge │ │staleness│ │connection│  │ data-status│
  │ 4 Wege    │  │ 7 Regeln  │ │3 Stufen│ │ 8 Zustände│ │ 1 Wort     │
  └───────────┘  └─────┬─────┘ └────────┘ └──────────┘  └──────┬─────┘
                       ▼                                        ▼
                ┌──────────────┐                        ┌──────────────┐
                │ chart-adapter│───────────────────────►│  live-chart  │
                │ zeichnen?    │                        │  (Oberfläche)│
                └──────────────┘                        └──────────────┘
```

| Modul | Aufgabe |
|---|---|
| `data-class.js` | Die Leiter und die sechs Zustände |
| `capability-negotiation.js` | Anbieter, Gate, Lizenz — drei Gutachter |
| `market-hours.js` | Läuft gerade Handel? |
| `staleness.js` | Ist der Stand noch aktuell? |
| `connection-state.js` | In welchem Zustand ist die Verbindung? |
| `bar-merge.js` | Wie wird aus Historie und Live eine Reihe? |
| `fallback-engine.js` | Welche Datenklasse? (rein, zustandslos) |
| `transport.js` | Vier Abrufwege hinter einer Form |
| `feed.js` | Die Reihenfolge |
| `data-status.js` | Was steht über dem Chart? |
| `chart-adapter.js` | Muss überhaupt gezeichnet werden? |

---

## Die Merge-Regeln

Der Chart bekommt seine Daten aus zwei Welten. Die Historie ist fertig,
geordnet und bereinigt. Der Live-Strom ist keines davon.

Sieben Regeln, deterministisch: dieselbe Folge von Ereignissen ergibt immer
dieselbe Reihe, unabhängig von der Reihenfolge des Eintreffens.

| # | Regel | Verhindert |
|---|---|---|
| R1 | **Identität** — eine Bar wird durch ihren *Zeiteimer* bestimmt, nicht durch ihren Zeitstempel. Der Eimer entsteht aus der Ortszeit der Börse. | Zeitzonen- und Umstellungsfehler |
| R2 | **Vorrang** — bestätigt schlägt vorläufig. Bestätigt ist eine Bar aber erst, wenn ihre Periode abgelaufen ist. | Doppelte Kerze aus Historie und Live; und umgekehrt eine laufende Kerze, die keinen Tick mehr annimmt |
| R3 | **Reihenfolge** — eine verspätete Bar wird einsortiert, nicht angehängt. Trifft sie auf einen bestätigten Eimer, wird sie verworfen und gezählt. | Kerze zwischen zwei alten |
| R4 | **Zukunft** — ein Zeitstempel jenseits der Toleranz wird abgelehnt. | Look-ahead, Future Leakage |
| R5 | **Bereinigung** — eine Bar mit anderer Bereinigungsstufe wird abgelehnt. Nicht umgerechnet — abgelehnt. | Adjusted/Raw-Mischung |
| R6 | **Split** — eine Kapitalmaßnahme macht die Reihe *nachladepflichtig*. Es wird nichts weggerechnet und nichts geglättet. | Erfundener Kurssprung am Split-Tag |
| R7 | **Tick** — ein Tick faltet in die laufende Bar: Hoch, Tief, Schluss, Volumen. Er erzeugt nie eine bestätigte Bar. | Indikatoren, die auf einem Wert rechnen, der sich noch ändert |

**Zu R2**, weil es beim Bau tatsächlich schiefging: Anfangs galt jede
abgerufene Bar als bestätigt. Damit sperrte die erste Bar des laufenden
Intervalls jeden Tick aus, der sie verfeinern sollte — der Chart stand still,
während Daten hereinkamen. Bestätigt ist eine Bar jetzt erst, wenn ihre
Periode *vorbei* ist. Innerhalb der laufenden Periode gilt die jüngste
Angabe; der Anbieter aggregiert dieselben Trades wie wir.

**Zu R6:** Ein Split ändert jeden Kurs davor. Eine Reihe, in der nur die
neuen Bars den neuen Maßstab tragen, zeigt einen Absturz, den es nie gab.
Deshalb wird die Reihe markiert und nachgeladen, statt sie zu glätten.

---

## Der Verbindungsautomat

Acht Zustände, als Automat und nicht als Sammlung von Flags:

```
IDLE ──► CONNECTING ──► LIVE ⇄ DEGRADED
              │           │        │
              │           └────────┴──► RECONNECTING ──┐
              │                              │         │
              └──────────────────────────────┴─────────┼──► FALLBACK_INTRADAY
                                                       │           │
                                                       ├───────────┴──► FALLBACK_EOD
                                                       │
                                                       ├──► OFFLINE
                                                       └──► UNAVAILABLE
```

Warum ein Automat: vier boolesche Felder (`connected`, `reconnecting`,
`degraded`, `usingFallback`) ergeben sechzehn Kombinationen, von denen acht
unmöglich sind — und irgendwann steht „verbunden und im Rückfall und offline"
gleichzeitig da. Das ist keine hypothetische Sorge: **genau diese Kombination
ist der Grund, warum ein Chart „LIVE" zeigt, während er Tagesschlusskurse
zeichnet.** Ein Automat kann nur in einem Zustand sein; Übergänge, die es
nicht gibt, finden nicht statt (und werden als Fehler des Aufrufers gezählt).

**Die Regel, die der Automat durchsetzt: ein Verlassen von LIVE ist immer
sichtbar.** Es gibt keinen Übergang, der LIVE still verlässt und die alten
Daten weiter als aktuell ausgibt.

### Der Weg zurück nach oben

Nach einem Abbruch wird der Echtzeitpfad nicht einfach wieder eingeschaltet:

```
1. Reconnect versuchen (exponentieller Backoff, gedeckelt)
2. nach n erfolglosen Versuchen: Rückfall auf die nächste Klasse
3. in Abständen erneut versuchen
4. bei Erfolg: FEHLENDE BARS NACHLADEN
5. zusammenführen — Entdopplung durch R1/R2
6. erst wenn ein frischer Stand vorliegt: LIVE
```

Schritt 4 vor Schritt 6 ist der ganze Punkt. Umgekehrt zeigt der Chart eine
Lücke und nennt sie live.

---

## Verfall

Drei Stufen, versioniert konfiguriert in `realtime-thresholds.json`:

```
FRESH      so aktuell, wie diese Klasse sein kann
DEGRADED   älter als erwartet, noch brauchbar
STALE      nicht mehr das, wofür es sich ausgibt
```

Dazu zwei Sonderfälle, die keine Fehler sind: `MARKET_CLOSED` und `UNKNOWN`
(kein Zeitstempel, Zeitstempel aus der Zukunft).

**Zwei Zeiten, nicht eine.** `timestamp` sagt, wann der Kurs entstand;
`receivedAt`, wann wir ihn bekamen. Die Lücke dazwischen ist die
Anbieterverzögerung, die Lücke danach unsere. Wer nur eine misst,
verwechselt einen langsamen Anbieter mit einer toten Verbindung — und behebt
dann das falsche Problem.

**Schwellen sind relativ, wo die Semantik das verlangt.** Intraday rechnet
gegen das Bar-Intervall: eine 5-Minuten-Bar ist nach 6 Minuten normal, eine
1-Minuten-Bar nicht. EOD rechnet in Stunden nach Schluss.

**Rückfall und Verfall sind zwei Entscheidungen.** Die erste trifft die
Verbindung, die zweite die Anzeige — und die Rückfallschwelle liegt höher.

---

## Handelszeiten

Bei geschlossener Börse gibt es keinen Verfall. Ein Kurs von Freitag 17:00
ist am Sonntag nicht verdorben, er ist der letzte, den es gibt. Er heißt
`MARKET_CLOSED` — und **trotzdem nicht LIVE**.

Umgekehrt genauso wichtig: um 15:30 an einem Dienstag *ist* ein zwanzig
Minuten alter Kurs ein Problem, und dieselbe Anzeige muss das dann sagen.

Ohne Kalender hält ein Live-Chart das Wochenende für einen abgerissenen
Stream, zeigt eine Störung, wo keine ist, und schult den Nutzer darauf,
Warnungen zu ignorieren.

**Zeitzonen:** Börsenzeiten sind Ortszeiten. „09:30" ist im Januar 14:30 UTC
und im Juli 13:30 UTC. Wer feste UTC-Offsets einbaut, hat zweimal im Jahr
für ein paar Wochen einen Chart, der eine Stunde zu früh aufmacht. Deshalb
rechnet `market-hours.js` ausschließlich über `Intl` mit einer *benannten*
Zeitzone — die Umstellung ist damit kein Sonderfall, sondern der Normalfall,
den die Bibliothek ohnehin kennt.

Der Kalender (`market-calendar.json`) nennt seine Abdeckung ausdrücklich
(2025–2027). Außerhalb entscheidet nur Wochentag und Uhrzeit, und der Befund
trägt `calendarCoverage: false`. Eine Vollständigkeit, die niemand geprüft
hat, wird nicht behauptet.

---

## Das Etikett

`data-status.js` entscheidet über ein Wort, und das Wort ist „LIVE". Es ist
das einzige in dieser Anwendung, das eine Zusicherung über die Gegenwart
macht — alle anderen Etiketten sagen, wie alt etwas ist.

**Fünf Bedingungen, alle nötig:**

1. Die Verbindung ist im Zustand `LIVE` (Automat, nicht Flag).
2. Die gezeichnete Datenklasse ist eine Echtzeitklasse.
3. Diese Klasse ist `AVAILABLE` — belegt, nicht ungeprüft.
4. Der Datenstand ist `FRESH` nach den versionierten Schwellen.
5. Es wird nicht gerade zurückgefallen.

Fällt eine davon, fällt das Wort.

| Zustand | Anzeige |
|---|---|
| Echtzeit, frisch, belegt | `LIVE · 14:32:18` |
| Echtzeitpfad, aber alternd | `VERZÖGERT · Stand 14:15` |
| Intraday-Bars | `INTRADAY · Stand 14:30` |
| Tagesschluss | `LETZTER SCHLUSSKURS · 07.09.2026` |
| Wiederaufbau läuft | `VERBINDUNG WIRD WIEDERHERGESTELLT · Stand 14:20` |
| Börse zu | `BÖRSE GESCHLOSSEN · Stand 05.09.2026 16:00` |
| nichts da | `MARKTDATEN DERZEIT NICHT VERFÜGBAR` |

Der Abstieg aus §22 als Ablauf — und so auch im Browsertest beobachtet:

```
LIVE · 14:01:59
   ↓  Stream fällt aus
VERBINDUNG WIRD WIEDERHERGESTELLT · Stand 14:01
   ↓  Reconnects erschöpft
INTRADAY · Stand 14:00
```

Nicht: „LIVE bleibt stehen, obwohl seit 20 Minuten nichts kommt."

Die Oberfläche formuliert **nichts** selbst. Ein zweiter Ort, an dem „LIVE"
entstehen kann, wäre genau der Ort, an dem es irgendwann fälschlich entsteht.

---

## Zwei Provenienzen

§17 verlangt zweierlei, das sich widerspricht, wenn man es in ein Feld
presst: intern muss nachvollziehbar sein, welcher Anbieter welche
Datenklasse wann geliefert hat — und öffentlich dürfen Anbieterdetails nicht
ohne Lizenzgrundlage erscheinen.

| | intern | öffentlich |
|---|---|---|
| Anbieter, Tarif | ja | nur mit Erlaubnis |
| Datenklasse, Stand | ja | ja |
| Verzögerungsstatus | ja | ja |
| Fallback-Grund, Fehler, Versuche | ja | nein |
| Fähigkeitsleiter | ja | nein |

Wer das öffentliche Objekt ausgibt, kann nichts falsch machen; wer das
interne ausgibt, muss es wollen. Ob der Anbietername genannt werden darf,
entscheidet **nicht** dieses Modul — es bekommt das Ergebnis der
Anzeigerichtlinie übergeben und hält sich daran. Sonst gäbe es zwei Stellen,
an denen eine Lizenzfrage beantwortet wird.

Es gibt keinen pauschalen Fußnotentext wie „alle Daten synthetisch", wenn
reale Daten verwendet werden — ein Test hält das fest.

---

## Schlüssel

**Unverändert gegenüber Phase 4A, und das ist Absicht.**

```
verboten:      Browser ──► Tiingo
vorgesehen:    Browser ──► eigener Endpunkt ──► Tiingo
heute gebaut:  Browser ──► ausgelieferte Dateien
                            ▲
                     GitHub Actions ──► Tiingo   (Authorization-Header)
```

Vision Universe wird statisch ausgeliefert. Ein Schlüssel im Browser ist kein
Risiko, er ist eine Veröffentlichung. Kein Modul unter
`quant/engines/realtime/` und auch nicht `quant/ui/live-chart.js` liest
`process.env`, kennt eine Anbieteradresse oder öffnet von sich aus eine
Verbindung — vier Tests halten das fest.

Der IEX-WebSocket authentifiziert sich mit dem Token in der **ersten
Nachricht**. Das ist der Grund, warum `providers/tiingo/realtime.js` beim
Laden prüft, ob ein Browser sie ausführt, und in dem Fall wirft. Ein
Ladefehler ist hier das gewünschte Verhalten: die Nachricht stünde sonst im
Netzwerkprotokoll jedes Besuchers.

`transport.js` baut keinen Socket. Der Verbindungsaufbau wird
hineingereicht — der Aufrufer sitzt serverseitig und kennt den Schlüssel,
das Transportmodul nicht.

---

## Der Wechsel auf einen besseren Tarif (§20)

Der Idealfall ist gebaut: **ein Bericht kommt in den Baum, sonst nichts.**

```
scripts/market/verify-tiingo-realtime.mjs   (in GitHub Actions, mit Schlüssel)
        │
        ▼
quant/data/market/tiingo-realtime-verification.json
        │   realtimeQuote: PASSED
        ▼
providers/tiingo/adapter.js      market.realtime: null ──► true
        │
        ▼
capability-negotiation           REALTIME_QUOTE: UNKNOWN ──► AVAILABLE
        │
        ▼
fallback-engine                  wählt den besseren Pfad von selbst
        │
        ▼
data-status                      darf jetzt LIVE sagen
```

Keine Zeile Code. Ein Test (`I03`) spielt genau diesen Vorgang durch.

Der Echtzeitbericht ist bewusst eine **eigene Datei** neben dem Nachweis aus
Phase 4A: Historie, Splits und Bereinigung ändern sich mit dem Tarif nicht,
die Echtzeitpfade sind genau die, die es tun — und sie werden zu anderer
Zeit, unter anderen Bedingungen (die Börse muss offen sein) und
möglicherweise mit einem anderen Konto gemessen. Ein gemeinsamer Bericht
hieße, dass ein Realtime-Lauf am Sonntag die Befunde vom Dienstag
überschreibt.

---

## Zeichnen

Das bestehende Chart-Modul (`ui/charts.js`) zeichnet handgeschriebenes SVG
und baut bei jedem Aufruf die ganze Fläche neu. Für einen Jahreschart ist das
richtig. Für einen Live-Chart wäre es der sichere Weg in eine Oberfläche, die
bei jedem Tick flackert.

`chart-adapter.js` löst das nicht durch eine Chart-Library — das wäre ein
eigener Umbau mit eigener Begründung. Es beantwortet die Frage *vor* dem
Zeichnen: **was hat sich seit dem letzten Bild geändert?**

```
nichts            → nicht zeichnen
die letzte Bar    → nur sie aktualisieren
eine neue Bar     → anhängen
die Struktur      → neu aufbauen
```

Damit erzeugt ein Tick, der nur den Schlusskurs der laufenden Kerze bewegt,
eine Aktualisierung und keinen Neuaufbau. Die Reihe führt dafür zwei Zähler
(`revision`, `structuralRevision`), sodass „hat sich etwas geändert" ein
Zahlenvergleich ist und kein Abgleich über 600 Bars — und die Reihe wird als
*Funktion* übergeben, damit sie bei unverändertem Stand gar nicht erst
kopiert wird. Gemessene Wirkung siehe `VU_REALTIME_MARKET_DATA_VALIDATION.md`.

Der Adapter kennt kein DOM. Das ist bei einer Komponente, die über Zeichnen
oder Nichtzeichnen entscheidet, keine Nebensache: sie ist damit in Node
vollständig prüfbar.

---

## Technical Intelligence

Realtime-Charting und Technical Intelligence sind **zwei getrennte
Frequenzebenen**, und dieser Workstream hält sie getrennt.

V1 der Technical Intelligence ist EOD und vorberechnet. Es wird hier nichts
bei jedem Tick neu gerechnet. Vorbereitet ist die Trennung, mehr nicht:

| Ebene | Frequenz | heute |
|---|---|---|
| Realtime Price Layer | Tick / Bar | dieser Workstream |
| Incremental Technical Layer | Bar-Schluss | nicht gebaut |
| EOD / confirmed Technical State | Tagesschluss | bestehend, unberührt |

Die Brücke ist `bar.confirmed` aus R2/R7: eine laufende Kerze ist vorläufig,
und alles, was Signale erzeugt, darf ausschließlich auf bestätigten Bars
rechnen. Wer das verwechselt, bekommt Signale, die wieder verschwinden.

Kein Modul der Technical Intelligence wurde geändert. Die 249 Python- und
alle bestehenden JS-Prüfungen laufen unverändert.

---

## SEC

Unberührt. SEC ist Fundamentaldatenquelle und **kein Market-Data-Provider**;
die Grenze bleibt, wo sie war. Kein Modul dieses Workstreams liest oder
schreibt etwas unter `providers/sec/` oder `scripts/quant/sec/`.

---

## Was diese Architektur nicht tut

- Sie behauptet keine Echtzeit. Mit dem vorliegenden Zugang ist **nicht
  bekannt**, ob Echtzeitkurse geliefert werden. Die Fähigkeiten stehen auf
  `UNKNOWN` und werden nur durch einen Laufzeitnachweis angehoben.
- Sie beantwortet keine Lizenzfrage. Ein funktionierender Abruf fühlt sich
  wie eine Erlaubnis an. Er ist keine.
- Sie deployt nichts. Beide Feature-Gates stehen aus.
- Sie ersetzt das Chart-Modul nicht.
- Sie simuliert nichts. Es gibt keinen Demo-Tick und keinen Testmodus, der
  Kurse erzeugt.
