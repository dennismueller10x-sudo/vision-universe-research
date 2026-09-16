# VU SOCIAL — DER AGENT-GRAPH

Stand: 2026-09-16 · Zweig `claude/vision-universe-social-os-eudjmx`

Dieses Dokument beschreibt den Graphen, wie er **läuft** — nicht wie er
gedacht war. Jede Kante unten ist im Code vorhanden und durch einen Test
oder einen Lauf belegt.

---

## 1. Was die Inventur ergeben hat

Erwartet war eine Lücke bei den Engines. Gefunden wurde das Gegenteil:
**25 Engines waren vorhanden**, darunter `learning.js` (404 Z.),
`experiments.js` (259 Z.), `memory.js`, `performance.js`.

Die Lücke lag woanders — und an genau zwei Stellen:

| Ort | Befund |
|---|---|
| `run-social-cycle.mjs` Stufe 4 | `archetypeKnowledge: {}` **fest verdrahtet leer** |
| Strategie-Version | wurde **nirgends** aufbewahrt |

Der erste Befund ist der wichtigere. Er bedeutet: es hätte beliebig viel
gemessen werden können, und **keine einzige Messung hätte je eine
Entscheidung erreicht**. Der Zyklus endete bei den Artefakten. Er lief
vorwärts und kam nie zurück.

Messung des Ist-Zustands vor dem Bau:

```
Trockenlauf:            0 vorschlagsfähig, 0 Pakete, Zustand UNAVAILABLE
mit --provider mock:    4 Pakete, vollständige Begründung
Opportunity-Coverage:   0.46  (fehlend: Trend, Publikum, Historie, Plattformpassung)
```

Der zweite Teil war die Überraschung: der Vorwärtspfad war intakt. Nur
gab es keinen Provider im Trockenlauf, und `platformFit` allein kippt
`UNAVAILABLE` auf `VERIFIED`.

---

## 2. Der Graph

```
                        ┌──────────────────────────────────────┐
                        │        STRATEGY MEMORY (Kette)       │
                        │  strategy_initial → v2 → v3 → …      │
                        └───────┬──────────────────────▲───────┘
                     Parameter  │                      │  neue Version
                                ▼                      │
  ┌────────┐   ┌──────────────┐   ┌──────────┐   ┌─────┴──────┐
  │ SIGNAL │──▶│ OPPORTUNITY  │──▶│ STRATEGY │──▶│  ADAPT     │
  │  VU +  │   │  Scoring     │   │ Mode +   │   │ (Stufe 10) │
  │ extern │   │  Coverage    │   │ Archetyp │   └─────▲──────┘
  └────────┘   └──────────────┘   └────┬─────┘         │
                       ▲                │              │ Beobachtungen
                       │                ▼              │
                       │        ┌───────────────┐  ┌───┴────────┐
                       │        │   CONTENT     │  │   LEARN    │
                       │        │  + VISUAL     │  │ (Stufe 9)  │
                       │        └───────┬───────┘  └───▲────────┘
                       │                ▼              │
                       │        ┌───────────────┐      │ Datenpunkte
                       │        │ QUALITY GATES │      │
                       │        │ Brand·Fakten· │  ┌───┴────────┐
                       │        │ Fatigue·Assets│  │  MEASURE   │
                       │        └───────┬───────┘  │ (Stufe 8)  │
                       │                ▼          └───▲────────┘
                       │        ┌───────────────┐      │
                       │        │ SHADOW DECIDE │      │ Insights
                       │        │ „würde X um T"│      │
                       │        └───────┬───────┘  ┌───┴────────┐
                       │                │          │  CONTENT   │
                       │                └─────────▶│   MEMORY   │
                       │                           └────────────┘
                       │        ┌───────────────┐
                       └────────┤  EXPERIMENT   │◀── EXPLORE-Modus
                    Re-Ranking  │  (Stufe 9b)   │
                                └───────────────┘
```

**Die entscheidende Kante** ist die von CONTENT MEMORY nach STRATEGY.
Sie war die leere Menge. Ohne sie ist alles andere eine Pipeline.

---

## 3. Die Stufen im Einzelnen

| # | Stufe | Engine | Was sie beiträgt |
|---|---|---|---|
| 0 | Provider-Zustand | `provider.js` | Plattformpassung, Kill Switch |
| 1 | Signale | `signals.js` | VU-intern (real), extern (nicht angebunden) |
| 2 | Gedächtnis | `memory.js` | frühere Beiträge **samt Lineage** |
| 2b | Strategie-Gedächtnis | `strategy-memory.js` | Parameter + Beobachtungen der Vorläufe |
| 3 | Gelegenheiten | `opportunity.js` | Score mit Coverage; `null` ≠ 0 |
| 4 | Strategie | `strategy.js` | EXPLORE/EXPLOIT, Archetyp, Zeitfenster |
| 5 | Content + Visual | `content.js`, `visual.js` | Hook, Caption, Bildkonzept |
| 6 | Quality Gates | `brand.js`, `fact-check.js`, `fatigue.js` | siehe §4 |
| 7 | Publishing-Absicht | `publishing.js` | Zustandsübergang, Idempotenzschlüssel |
| **8** | **MESSEN** | `performance.js` | Insights → Snapshots → Score |
| **9** | **LERNEN** | `learning.js` | Beobachtungen mit Konfidenzintervall |
| **9b** | **EXPERIMENTIEREN** | `experiments.js` | eine Variable, vorab festgelegte Stichprobe |
| **10** | **ANPASSEN** | `strategy-memory.js` | neue Version — nur bei belastbarer Evidenz |
| 11 | Schatten-Entscheidung | — | „ich würde X mit Y als Z um T" |

Fett: neu. Der Rest war da.

---

## 4. Quality Gates und wohin ein Fehlschlag führt

| Gate | Prüft | Bei Fehlschlag |
|---|---|---|
| Coverage | genug gemessene Dimensionen? | Gelegenheit nicht vorschlagsfähig |
| Fakten | jede Zahl mit Beleg, Beleg aktuell? | Content verworfen, Stufe benannt |
| Brand | Tonalität, Hook-Länge, Verbote | Content verworfen |
| Fatigue | zu ähnlich zu Bestehendem? | Kandidat verworfen |
| Asset | Bild erreichbar, JPEG, Seitenverhältnis | kein Container |
| Autonomie | Stufe genügt für unbeaufsichtigtes Posten? | bleibt in READY |
| Kill Switch | global/Provider freigegeben? | bleibt in READY |
| **Learning Confidence** | n groß genug, Intervall ohne Null? | **keine Strategieänderung** |

Das letzte Gate ist das wichtigste und das unauffälligste. Ein System,
das aus n=2 eine Strategie ableitet, lernt nicht — es reagiert auf
Rauschen. `LC6` hält fest, dass es das nicht tut.

---

## 5. Exploration und Exploitation

Kein fester Anteil, sondern eine Ziehung gegen `explorationRate` (Start
0,25), gesät aus der Gelegenheits-ID — damit derselbe Anlass nicht je
nach Laufzeitpunkt anders behandelt wird.

- **EXPLORE** wählt, worüber am wenigsten bekannt ist. Nicht zufällig:
  Zufall wäre billiger und lernt langsamer.
- **EXPLOIT** wählt das beste bewährte Format — und sagt ausdrücklich,
  wenn *nichts* bewährt ist, statt eine Wahl als begründet auszugeben.
- Eine EXPLORE-Entscheidung kann ein **Experiment** anlegen: eine
  Variable, eine Kontrolle, eine vorab festgelegte Stichprobe.

Im Nachweislauf sichtbar: von vier Entscheidungen waren zwei
Exploitation (`DATA_STORY`, das belegte Format) und zwei Exploration
(`FUTURE_TECHNOLOGY`, das unbekannteste).

---

## 6. Was der Graph **nicht** hat

- **Kein externer Trend-Provider.** `trend` bleibt ungemessen. Das ist
  eine Owner-Entscheidung (kostenpflichtiger Dienst), kein Baufehler —
  und der Loop schließt ohne ihn, weil `platformFit` zur Vorschlagbarkeit
  genügt.
- **Kein Publikumssignal.** Kommentare/Profilaktionen sind über Insights
  erreichbar, aber noch nicht verdrahtet.
- **Keine zweite Plattform.** Die Provider-Abstraktion trägt sie; es gibt
  nur keine.
- **Kein autonomes Publishing.** `GLOBAL_AUTOPUBLISH` ist aus, Autonomie
  steht auf Stufe 0.


---

## 7. Drei Fehler mit demselben Gesicht

Während dieses Baus sind mir vier Fehler unterlaufen, von denen drei
dasselbe Bild erzeugten: **ein Schritt, der schnell und grün endet.**
Das liest sich wie „es gab nichts zu tun" und bedeutete jedes Mal etwas
anderes.

| Ursache | Wie es aussah |
|---|---|
| Die alte Worker-Fassung antwortete (Propagation) | Feld fehlt → „nicht gesetzt" |
| `git diff` sieht keine unverfolgten Dateien | „keine Änderung" für eine gerade erzeugte Datei |
| Budget rechnete mit veralteter Aufrufzahl | „Too many subrequests" → sah aus wie ein Netzproblem bei Meta |

Und einer, der schlimmer war als die drei: **eine Diagnose, die zu den
Beobachtungen passte und trotzdem falsch war.** Ich hatte behauptet,
`[ test ] && befehl` töte den Schritt unter `bash -e`. Eine Shell nebenan
widerlegt das in zwei Zeilen — ich hatte sie nicht gefragt. Die
Behauptung stand in einer Commit-Nachricht und hätte beinahe zu
Änderungen an zwei fremden produktiven Workflows geführt, in denen kein
Fehler ist. `SE1`–`SE4` halten jetzt fest, was wirklich gilt.

**Was daraus folgte:** auf einen Statuscode zu warten reicht nicht, wenn
die alte Fassung auch 200 antwortet. `/health` nennt deshalb den Commit,
aus dem die antwortende Fassung gebaut wurde, und der Workflow wartet
auf **seinen eigenen**. Kein Statuscode, keine Zeitspanne — die
Identität. Das beendet die Fehlerklasse, statt ihre dritte Ausprägung zu
behandeln.

---

## 8. Ein vierter Fehler mit einem anderen Gesicht: der stille Verlust

Die drei aus §7 sahen alle gleich aus. Dieser sah nach gar nichts aus.

Am 16.09. um **17:59** standen **16 gemessene Beiträge** in
`social/data/performance.json`. Um **18:05** standen dort **12**. Kein
roter Lauf, keine Fehlermeldung, kein Hinweis irgendwo: die zweite
Ingestion erreichte wegen des damals zu klein gerechneten
Subrequest-Budgets weniger Beiträge und schrieb die Datei **neu**.

Vier Messungen waren weg. Nicht veraltet — weg.

Bemerkt habe ich es nur, weil ein Monitor auf „mehr als 12" wartete und
nicht ausgelöst wurde. Er wartete auf etwas, das bereits dagewesen und
inzwischen gelöscht worden war.

**Die Regel, die daraus folgt:** gemessene Leistung ist ein **Beleg**,
kein Zwischenstand. Ein Lauf, der weniger erreicht, ist ein schmalerer
Blick auf dieselbe Welt und kein Löschauftrag.

| Fall | Was gewinnt |
|---|---|
| neue Messung | immer — sie ist jünger |
| neues Scheitern gegen vorhandene Messung | nie — die Abfrage misslang, nicht die Zahl von gestern |
| Beitrag, nach dem dieser Lauf nicht fragte | bleibt — ein kürzeres Fenster ist kein Löschgrund |

Übernommene Zeilen tragen `carriedOver`, den Zeitpunkt des letzten
Versuchs und dessen Grund. `capturedAt` bleibt der Zeitpunkt der
**ursprünglichen** Messung: eine übernommene Zahl mit neuem Datum wäre
eine Fälschung des Alters, und Alter entscheidet in dieser Datei über
`VERIFIED` gegen `STALE`.

Und `run: { requested, measured, carriedOver }` hält fest, was **dieser
Lauf** geschafft hat. Ohne diese Trennung würde das Zusammenführen genau
den schrumpfenden Lauf verdecken, der den Anlass gab.

`PI15`–`PI22` halten das fest. `PI15` ist der Vorfall selbst.

---

## 9. Der Draht, der nie angeschlossen war

`Strategy.selectTiming` kann gemessene Stunden verarbeiten, seit es die
Funktion gibt. Übergeben wurde ihr `timingKnowledge: null`.

Diese Dimension war also nicht *zu dünn belegt*. Sie war **tot**, und
keine Menge Messung hätte daran je etwas geändert. Das ist derselbe
Befund wie beim leeren `archetypeKnowledge` — nur eine Ebene später
gefunden.

Die Stunde ist dabei die einzige Eigenschaft fremder Bestandsbeiträge,
die **ohne jede Übersetzung** sowohl gemessen als auch entschieden wird:
Instagram meldet den Zeitstempel, die Strategie wählt eine Stunde. Kein
Vokabular dazwischen, also auch keine Annahme dazwischen.

| Test | Was er zeigt |
|---|---|
| `LC11` | ab n=6 wird `timingSource` = `gemessen`, die Stunde kippt |
| `LC12` | heutiger Stand: 8 Stunden gemessen, größte Stichprobe **n=4** → entscheidet **nicht** |
| `LC13` | ohne Leistung kein Zeitwissen — ein Datum ist keine Beobachtung |

`LC12` ist der wichtigere der drei. Der Unterschied zwischen „nicht
gemessen" und „gemessen, aber zu dünn" ist der Unterschied zwischen
einer fehlenden Anbindung und einer Aufgabe, die Zeit braucht.

---

## 10. `mediaFormat` steht neben `visualType`, nicht darin

`visualType` ist unser Vokabular für die **gestalterische Entscheidung**:
`CHART`, `DATA_CARD`, `MOTION_GRAPHIC`, `CAROUSEL`, `VIDEO`.

Dort lag bisher die Instagram-Kohorte. `REEL` kommt in diesem Vokabular
gar nicht vor, und `CAROUSEL` vermischte sich stillschweigend mit
unserem `CAROUSEL`. Die zwei Beobachtungen, die daraus entstanden,
hießen `visualType` und bedeuteten etwas anderes.

Aus „Instagram meldet ein Video" folgt weder `MOTION_GRAPHIC` noch
`VIDEO` — beides wäre eine Entscheidung, die bei diesen Beiträgen
niemand getroffen hat.

Deshalb: `mediaFormat` ist, was der **Plattform-Container** sagt.
`visualType` bleibt bei fremden Beiträgen `null`. Getrennt zu halten
kostet ein Feld; zusammenzuwerfen kostet die Unterscheidbarkeit von
Gemessenem und Angenommenem (`LC14`).

`mediaFormat` läuft bewusst als Lerndimension mit, obwohl die Strategie
dafür noch keinen Parameter hat. Die Sicherheitsgrenze stoppt die
Änderung **mit Begründung**. Das ist der Unterschied zwischen „wir können
es nicht messen" und „wir messen es, können damit aber noch nichts
entscheiden". Die zweite Aussage ist eine Aufgabe; die erste wäre eine
Ausrede.

---

## 11. Warum der Nachweis jeden Zustand zweimal fährt

Ein Zyklus **entscheidet in Stufe 4** und **misst in Stufe 8**. Eine
Messung, die während eines Laufs eintrifft, erreicht die Entscheidung
dieses Laufs nicht mehr — sie wird am Ende ins Gedächtnis geschrieben
und wirkt beim nächsten Mal.

Das ist kein Mangel, sondern die Zeit: eine Entscheidung kann nur
benutzen, was bei ihr schon bekannt war.

Der Nachweis lief je Zustand genau **einmal** und hätte deshalb **nie**
eine geänderte Entscheidung zeigen können. Er hätte daraus geschlossen,
der Lernpfad trage nicht — ein Beweis, der an seiner eigenen Bauweise
scheitert und das Ergebnis dem Gegenstand anlastet.

Beide Zustände laufen jetzt zweimal, mit Rückschreiben in den
Datenordner wie in der Produktion (`--out` = `--data`), und verglichen
werden die jeweils zweiten Läufe. **Beide** zweimal — sonst wäre die
Zahl der Läufe ein zweiter Unterschied zwischen den Zuständen.
