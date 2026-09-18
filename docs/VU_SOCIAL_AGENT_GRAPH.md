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

---

## 12. Die zwei Stufen, die aus „würde" ein „könnte" machen

Der Graph endete bei der Schatten-Entscheidung: *„ich würde X mit Y als Z
um T senden."* Diese Aussage behauptet, dass X **sendbar wäre**. Ob das
stimmt, entscheidet sich nicht an der Entscheidung, sondern am Material.

| # | Stufe | Skript | Was sie beiträgt |
|---|---|---|---|
| **11b** | **FRACHT** | `render-asset.mjs` | Bildplan je Entscheidung; mit `--render` das Bild selbst |
| **12** | **VERSAND** | `dispatch-publications.mjs` | Absicht, Idempotenzschlüssel, die eine HTTP-Anfrage |

Ohne 11b fällt erst im Moment der Veröffentlichung auf, dass die Fracht
fehlt — und dann ist der Anspruch schon angemeldet, und niemand weiß
ohne nachzusehen, ob ein Beitrag entstand.

Ohne 12 bleibt „der Loop könnte senden" eine Behauptung. Mit 12 ist es
`dispatch-plan.json`, und dort steht die Anfrage im Wortlaut.

### Gesperrt heißt nicht unsichtbar

Der Versand baut die Anfragen auch dann, wenn **alle** Sperren zu sind —
mit Grund, und **ohne** eine Absicht anzumelden (eine Absicht ist eine
Zustandsänderung; eine gesperrte Entscheidung darf keine erzeugen).

„Gesperrt" sagt, dass nichts hinausgeht. Es sagt nicht, **was**
hinausginge. Genau das ist aber die Frage, die vor einer Freigabe zu
beantworten ist und nicht danach.

### Die Kennung ist überall dieselbe

```
packageId  →  assets/social/<packageId>.jpg      die Datei
           →  .../assets/social/<packageId>.jpg  die Adresse
           →  contentId im Publish-Aufruf        der Anspruch
```

Ein eigener Schlüssel an einer dieser Stellen wäre ein weiterer Name für
denselben Beitrag — und eine weitere Gelegenheit, dass zwei davon
auseinanderlaufen.

---

## 13. Was der erste Lauf gegen echte Pakete zeigte

Die Tests waren grün. Die erste gezeichnete Karte las sich so:

```
76
76
Warum bewegt sich XOM gerade?
```

76 wovon?

Die Content-Engine legt einen Wert als **zwei** Belege ab: einen mit der
Zahl (`text: "76"`, `numeric: 76`) und einen mit der Bezeichnung
(`text: "Technical Opportunity Score"`, `numeric: null`) — beide mit
derselben Quelle, weil auch eine Bezeichnung wie „52-Wochen-Hoch"
belegpflichtig ist. Der Renderer las nur den ersten und setzte dessen
Text als Beschriftung unter die Zahl.

**Mein Fixture hatte die Form, die ich mir vorgestellt hatte, nicht die,
die die Engine liefert.** Ein grüner Test über eine erfundene Datenform
prüft die Erfindung.

Eine Zahl, die nicht sagt, wovon sie die Zahl ist, wird seitdem nicht
gezeichnet (`RA19`) — und eine Bezeichnung aus einer anderen Quelle
zählt nicht (`RA20`).

---

## 14. „16 gemessen, 0 zugeordnet"

Der Zyklus gegen den echten Datenstand meldete:

```
Gemessene Beitraege: 16 von 26
Zugeordnet:          0 Gedaechtniseintrag/-eintraege, 0 bewertet
Keine Beobachtung moeglich — es gibt noch keine gemessenen Beitraege.
```

Der letzte Satz war falsch. Es gab sechzehn.

Zwei Fehler in einer Zeile:

1. **Die Sache:** die Bestandsbeiträge standen nie im *produktiven*
   Gedächtnis. Der Nachweis baute sie sich in einen Arbeitsordner, der
   Betrieb bekam sie nie. `backfill-account-memory.mjs` trägt sie ein —
   und `prove-loop-closure.mjs` holt sie sich ab jetzt von dort, damit es
   für dieselbe Frage nicht zwei Regeln gibt.
2. **Die Meldung:** drei Lagen sahen gleich aus (nichts gemessen /
   gemessen aber nicht zugeordnet / zugeordnet aber keine Dimension mit
   genug gleichartigen Fällen) und verlangen völlig verschiedene
   Antworten.

Nach dem Backfill: **16 gemessen, 16 zugeordnet, 16 bewertbar, 2
Beobachtungen.**

---

## 15. Die Autorenschicht — und wo die Trennlinie verläuft

Der Owner hat AI Authoring freigegeben und zugleich die Linie gezogen.
Sie sitzt jetzt im Code:

```
FAKTEN / EVIDENZ      deterministisch, an Belege gebunden
STRATEGIE / BRIEF     die bestehende Intelligence
───────────────────────────────────────────── hier hinüber
AUTHORING             generativ
───────────────────────────────────────────── und hier zurück
CLAIM VALIDATION      deterministisch
BRAND / QUALITY       deterministisch bzw. evidenzgebunden
```

| Stufe | Datei | Was sie beiträgt |
|---|---|---|
| Brief | `content-brief.js` | alles, was ein Autor über die Welt erfährt — und nur das |
| Autoren | `providers/authoring/*` | Varianten nach benannten Mustern |
| Bindung | `claim-binding.js` | jede Zahl, jedes Kürzel, jeder Sprechakt gegen die Belege |
| Bildgüte | `visual-quality.js` | die Karte als Einheit, nicht als Datei |
| Komposition | `authoring.js` | sagen Hook, Bildzeile und Caption dreimal dasselbe? |
| Auswahl | `authoring.js` | Marke → gemessene Wirkung → Komposition → Nutzung |

**Der Brief ist die ganze Sicherung.** Ein Autor bekommt keine Signale,
keine Suche, kein Gedächtnis, kein Werkzeug. Das ist nicht Misstrauen
gegen ein bestimmtes Modell — es ist die einzige Bauweise, in der die
Frage *woher stammt diese Zahl* beantwortbar bleibt: eine Zahl im
Ergebnis kann nur aus dem Brief stammen, sonst ist sie erfunden.

Die wichtigste Liste im Brief heißt `mustNotClaim`. Sie sagt, was die
Belege **nicht** hergeben. Ein Autor, der nur die Belege sieht, weiß
nicht, was fehlt; er sieht eine Zahl und denkt sich den Rest dazu.

---

## 16. Vier Prüfer, die zuerst das Falsche verworfen haben

Jeder neue Prüfer hat als Erstes meine eigenen, korrekten Texte
abgelehnt. Das ist kein Zufall, sondern die Regel: ein Prüfer, der zu
grob greift, sieht zuerst wie Strenge aus und ist in Wahrheit Blindheit.

| Prüfer | Was er zu Unrecht verwarf | Warum |
|---|---|---|
| Claim Binding | „Stand 2026-09-16" | ein ISO-Datum in drei Zahlen zerlegt |
| Claim Binding | „…, **weil** eine nachvollziehbare Zahl mehr wert ist" | ein Satz über die **eigene** Entscheidung ist keine Marktaussage |
| Claim Binding | „Lagebeschreibung, **keine** Prognose." | Verneinung nicht gesehen |
| Bildgüte | jede Karte ohne Zahl | Quellenpflicht hängt an der **Zahl**, nicht an der Karte |
| Komposition | **alle vier** Varianten | Hook und Caption **sollen** Titel und Zahl teilen |

**Die gemeinsame Gefahr:** ein Prüfer, der richtige Texte verwirft, wird
abgeschaltet — und dann prüft er gar nichts mehr. Jeder dieser Fälle hat
einen Test bekommen, der die Richtung festhält.

Und einer in die Gegenrichtung: *„wir erwarten mehr"* ging durch, weil
die Regel nur *„erwarten wir"* kannte. Im Deutschen steht das Verb mal
vorn und mal hinten.

---

## 17. Der Fehler, den kein einzelner Prüfer sehen kann

```
Hook:      "Was diese Zahl nicht sagt: XOM, 76 im ... Score."
Bildzeile: "Lagebeschreibung, keine Prognose."
Caption:   "... nicht ihre Ursache und nicht, was als nächstes passiert."
```

Jedes Stück bestand jede Prüfung. Zusammen sagen sie dreimal dieselbe
Sache mit denselben Mitteln.

Die Markenprüfung sieht Hook und Caption. Die Bildgüte sieht die Karte.
**Den Zusammenhang sah niemand** — bis es eine Prüfung dafür gab.

---

## 18. Der Quelltext darf ASCII sein, der Beitrag nicht

Die erste Karte aus der neuen Autorenschicht las:

> Gleiches Verfahren **fuer** jeden Titel.

Die ASCII-Konvention dieses Repositories ist richtig: der Quelltext
läuft durch Shells, Workflows und Editoren, deren Kodierung niemand
garantiert. Sie gilt für den **Quelltext**.

Auf einem deutschen Markenkonto sieht „fuer jeden Titel" aus, als hätte
es eine Maschine geschrieben, die kein Deutsch kann — und genau das wäre
es dann auch. Die Umlaute stehen jetzt als Escape-Sequenzen: die Datei
bleibt ASCII, der Text wird deutsch.

Die Markenprüfung blockierte Rückfälle zunächst anhand einer
**Wortliste**: dreißig Formen, die wir kannten.

### Die Liste hat den eigentlichen Fall nicht gekannt

Sobald die Rückfallebene die reiche Evidenz nutzte, stand in der
Caption:

> TREND_STRUCTURE **traegt** 27.35 von 30 Punkten bei.

Der Satz kam nicht vom Autor. Er kam aus den **Quant-Daten**. Die sind
ASCII — „SMA50 ueber SMA200", „Relative Staerke nicht verfuegbar" —,
und solange sie nur gerechnet wurden, war das folgenlos. Seit das
Evidence Package sie an den Autor weiterreicht, sind sie
veröffentlichter Text.

„traegt" stand in keiner Liste. Eine Aufzählung fängt, woran jemand
gedacht hat, und schweigt über den Rest. Bei einem **Sperrgatter** ist
das die falsche Richtung von Unwissen.

### Zwei getrennte Aufgaben statt einer Liste

`social/engines/german-text.js` trennt, was die Liste vermengt hat:

| | |
|---|---|
| `normalize()` | repariert, **was wir kennen**. Exakte Wortformen und die produktive Endung `-taet`. Es rät nie. |
| `residue()` | meldet, **was wir nicht kennen**. Unbekanntes blockiert, statt durchzurutschen. |

Keine Regel über Digraphen: jedes „au"+„e" und jedes „eu"+„e" erzeugt
die Folge „ue", ohne dass je ein Umlaut gemeint war. „dauert", „neue",
„Feuer" und „Frauen" bleiben deshalb unangetastet — `GT5` hält das
fest, und `GT6b` die qu-Klasse (Frequenz, Sequenz, Request), die sich
beim ersten Lauf selbst gemeldet hat.

Repariert wird an der **einen** Stelle, durch die jeder Beleg läuft.
Der Eingriff ist rein orthografisch, und `EP4` beweist es: die Zahlen
müssen identisch bleiben, und `statementVerbatim` trägt den
unveränderten Engine-Satz mit, wo sich etwas geändert hat.

### Der erste Fund stand im eigenen Beweismaterial

`V9` behauptete seit jeher, dieser Text sei veröffentlichungsfähig:

> Weil die Nachfrage nach Rechenzentren **waechst** und die Marge daher
> steigt.

Er war es nicht. Ein Prüfer, der schärfer wird, prüft zuerst die
eigenen Fixtures.

### Dieselbe Reparatur an der Provider-Grenze

Der Brief liefert dem Creative Agent Belegsätze. Kommen die in
ASCII-Umschrift, übernimmt er sie so — er kann nicht wissen, dass
„traegt" ein Fehler ist. Der Adapter repariert deshalb beim Einlesen,
**bevor** fremder Text ein Kandidat wird.

Die Kennung bleibt dabei, was sie verspricht: die Reparatur ist
deterministisch, also bezeichnet dieselbe `hook_variant_id` bei jedem
Lauf denselben Text (`CG25`), und der unveränderte Agententext reist in
`textVerbatim` mit.

---

## 19. Der generative Autor ist fertig und hat keinen Client

`social/providers/authoring/model/adapter.js` ist vollständig: Prompt aus
dem Brief, Antwortparser, Variantenbau, feindliche Tests.

Im Repository existiert **kein Modellanbieter, kein Schlüssel, keine
Abrechnung**. Der Adapter meldet sich deshalb über `available()` ab,
statt im Lauf zu scheitern — ein Ausfall, der erst im Lauf auffällt,
wäre ein Beitrag ohne Text. Der deterministische Autor schreibt
solange weiter.

```
Autoren:
  model     nicht verfuegbar
  template  einsatzbereit
```

Das Anbinden kostet laufend Geld und ist damit eine Owner-Entscheidung,
keine Implementierungsfrage.

---

## 20. Der Creative Provider ohne Modell-API

Der Owner hat den Weg außerhalb des Builds nachgewiesen:

```
VU/GitHub → PR-Ereignis → ChatGPT Work Creative Agent
          → strukturiertes Authoring Result + generatives Bild → GitHub
```

Keine klassische OpenAI-Text-API, keine klassische OpenAI-Bild-API,
kein Schlüssel, keine laufenden Kosten. Textnachweis über PR #97,
Text-und-Bild-Nachweis über PR #98.

`social/providers/authoring/chatgpt-work/adapter.js` ist deshalb der
erste generative Autor **innerhalb** der vorhandenen Autorenschicht —
keine zweite Content-Pipeline.

### Wer wofür zuständig ist

| Vision Universe | ChatGPT Work |
|---|---|
| Signal Intelligence, Evidence, Opportunity Ranking | — |
| Strategy Memory, Hook Strategy, EXPLORE/EXPLOIT | — |
| Visual Strategy, Experimente | — |
| **kanonische Hook-Auswahl** | editorische Empfehlung, `is_canonical_selection: false` |
| Claim Validation, Brand/Quality/Safety Gates | — |
| Publishing, Performance Attribution, Learning | — |
| — | **Creative Author + Creative Visual Producer** |

Ein `selected_hook` im Ergebnis wird beim Einlesen **abgewiesen**. Die
Auswahl gehört zur Strategie, und die Strategie gehört uns.

### Die Kennungen stehen fest, bevor der Agent läuft

```
hook_variant_id   = content_id : brief_blob_sha : hook_type : ordinal
visual_variant_id = content_id : brief_blob_sha : visual : strategy : ordinal
processing_key    = brief_id : content_id : brief_blob_sha : schema_version
```

Vision Universe rechnet sie nach und weist ab, was nicht übereinstimmt.
Eine einmal verwendete `hook_variant_id` bezeichnet **niemals später**
einen anderen Text.

Der `brief_blob_sha` ist der git-Blob-SHA der Datei, die der Agent
bekommen hat — `sha1("blob " + länge + NUL + inhalt)`, nachgeprüft
gegen `git hash-object`. Gerechnet wird er aus den **Bytes der
abgelegten Datei**, nicht aus einer Rekonstruktion: die hinge an einem
Dutzend langer Textbausteine, die an zwei Stellen gepflegt werden
müssten, und ein abweichendes Zeichen ließe alle vier erwarteten
Kennungen falsch werden.

---

## 21. Ein intakter Anfang ist kein intaktes Bild

Der Bildnachweis hat einen **abgeschnittenen Transfer** produziert. Die
PNG-Signatur stand korrekt am Anfang der Datei. Ein Korrekturcommit hat
sie ersetzt.

Ein Ergebnis mit Binärasset darf deshalb erst nach dieser Kette
`COMPLETED` heißen:

```
GENERATE → MIME prüfen → Dimensionen prüfen → Hash berechnen
        → Git Blob/Tree/Commit
        → FRISCHER READBACK vom finalen Commit
        → Hash, Größe, MIME, Dimensionen erneut vergleichen
        → COMPLETED
```

`social/engines/asset-integrity.js` prüft deshalb auch das **Dateiende**:
PNG muss auf einen `IEND`-Chunk enden, JPEG auf `FF D9`, RIFF auf die
angekündigte Länge. Ein Anfang beweist nichts über einen Rest.

Zustände: `PENDING → GENERATED → COMMITTED → READBACK_VERIFIED →
COMPLETED`, daneben `RECOVERY_REQUIRED`.

Teilweise oder beschädigte Assets gelangen nie in Quality Gates oder
Publishing. **Kein stiller Force-Update-Recovery-Pfad in Produktion**,
wenn dadurch Provenance verloren geht.

---

## 22. Das Ledger sagt, was es beweisen kann

`social/engines/invocation-ledger.js` hält fest, was zu einem
Processing Key geschah. Ein fertiges Ergebnis wird nicht überschrieben
— aber der **abgewiesene Schreibversuch wird festgehalten**: ein
Ledger, das Versuche verschweigt, beantwortet die Frage nicht mehr, wie
oft etwas lief.

Der Beweisstatus reist mit den Daten:

```
LOOP_PROTECTION_OPERATIONALLY_SUPPORTED
```

und **nicht** `FORMALLY_EXHAUSTIVE_RUN_COUNT_PROVEN`. Kein rekursiver
Result-Commit wurde beobachtet; die verfügbare Schnittstelle liefert
keine vollständige Run-Historie. Wer die Daten später liest, soll nicht
annehmen müssen, was sie wert sind.

Alle Schutzschichten bleiben aktiv: schmaler PR-Trigger, Branch-, Pfad-
und Statusgrenzen, `enable_commit_updates=false`, Processing Key,
unveränderliches abgeschlossenes Ergebnis, Invocation Ledger,
idempotente Ergebnisverarbeitung.

### Drei Zustände gehören ins Ledger, zwei davon endgültig

`COMPLETED`, `REJECTED`, `RECOVERY_REQUIRED`.

Ein fehlender Brief, unlesbares JSON oder eine Abweichung in **unserer
eigenen** SHA-Rechnung sind Befunde über die Umgebung oder über uns.
Sie als `REJECTED` einzutragen würde den Schlüssel dauerhaft
verbrennen, obwohl der Agent nichts falsch gemacht hat.

---

## 23. Ein hoher Score ist keine Geschichte

`quant/data/technical/instruments/XOM.json` enthielt die ganze Zeit:
Score-Band, Beiträge je Familie mit ihren Maxima, fertig formulierte
deutsche Trendsätze, vier Momentum-Horizonte, Volatilitätsregime,
Volumen, Datengrundlage — und den Satz

> Methodologischer Setup-Rang 0–100. Keine Wahrscheinlichkeit, keine
> Renditeerwartung.

Extrahiert worden war daraus je ein Feld: `opportunityScore`.

`social/engines/evidence-package.js` baut daraus jetzt **23 belegte
Aussagen über 6 Dimensionen**, jede mit Quelle, Stand und Zeiger ins
Bundle. `RELATIVE_STRENGTH` und `STRUCTURE` stehen ausdrücklich als
**nicht verfügbar** samt Grund — eine fehlende Dimension ist eine
Aussage, keine Lücke.

Das `EVIDENCE_SUFFICIENCY`-Gate davor verlangt mindestens drei
Dimensionen, fünf Aussagen, eine Einordnung und einen datierten Anker.
Eine Opportunity mit hohem Score ist nicht automatisch
veröffentlichungswürdig.

---

## 24. Das Netz gehört nicht in den Zyklus

Der Agent arbeitet asynchron auf einem eigenen Request-Branch. Der
Zyklus liest **Dateien** und geht nicht ins Netz:

```
request-creative.mjs   Brief bauen, ablegen, Ledger REQUESTED
        ↓                     (PR öffnet ein Mensch oder ein Workflow)
   PR-Ereignis  →  ChatGPT Work  →  Ergebnis + Asset auf den Branch
        ↓
ingest-creative.mjs    holen, prüfen, ablegen, Ledger COMPLETED
        ↓
run-social-cycle.mjs   liest nur noch Dateien
```

Ein Zyklus, der während der Inhaltserzeugung ins Netz greift, ist nicht
mehr reproduzierbar: derselbe Stand liefert je nach Zeitpunkt etwas
anderes. Und ein ungeprüftes Ergebnis wäre schon im Kandidaten, bevor
ein Tor es gesehen hätte.

Gelesen wird über **git**, nicht über eine API: der Branch liegt
ohnehin im Klon, git liefert die Bytes unverändert, und der Blob-SHA
lässt sich gegen dieselbe Quelle prüfen, aus der er stammt.

### Kein Ergebnis ist kein Fehler

```
Autoren:
  chatgpt-work  einsatzbereit
  model         nicht verfuegbar
  template      einsatzbereit
```

Fehlt das Ergebnis, meldet der Autor `pending` und die Vorlage
schreibt. Damit das von außen **sichtbar** ist — bei einem asynchronen
Provider genau der Unterschied, auf den es ankommt — nennt der Zyklus
jetzt, wer geschrieben hat:

```
Content: 4 Paket(e) erzeugt, 0 verworfen
   Technisches Setup — XOM: chatgpt-work / chatgpt-work/value_first (2 von 4 Varianten bestanden)
   Technisches Setup — AAPL: template / value-first/state-limit-reason (3 von 4 Varianten bestanden)
```

### Eine Kennung, eine Definition

`contentIdFor(entity, asOf)` steht in `evidence-package.js`, und beide
Seiten rufen dieselbe Funktion: das Skript, das den Request stellt, und
der Zyklus, der das Ergebnis später sucht. Zwei Rechenwege wären zwei
Gelegenheiten zu driften — und eine Drift hieße, dass der Zyklus das
fertige Ergebnis nie findet und es niemandem auffällt.

---

## 25. Eine Entscheidung, die keinen Zustand hatte

Der Owner hatte über `cand_20260917_0363e680` bereits entschieden:
**nicht veröffentlichen, wegen unzureichender Evidenz zurückhalten, und
ausdrücklich keine Ablehnung wegen erwarteter Leistung.**

Bei der Reparatur der Kandidatenkette (§ oben: das Testartefakt im
Freigabeordner) habe ich ihn auf `AWAITING_APPROVAL` gesetzt. Damit war
diese Entscheidung überschrieben.

### Der Fehler war nicht die Reparatur

Das Zustandsvokabular kannte vier Werte:

```
AWAITING_APPROVAL   APPROVED   REJECTED   SUPERSEDED
```

„Zurückgehalten, weil die Evidenz nicht reicht" ist keiner davon. Es
ist keine Freigabe, keine Ablehnung, kein Warten und keine Ersetzung.
Die Entscheidung war damit **nirgends persistiert** — und was nirgends
steht, überschreibt der nächste Vorgang, ohne etwas zu bemerken.

Ein Zustandsraum, in dem sich eine reale Owner-Entscheidung nicht
ausdrücken lässt, produziert diesen Fehler zuverlässig. Die Reparatur
war nur die Gelegenheit.

### Die Linie

`social/engines/owner-decision.js` zieht sie:

| | |
|---|---|
| **entschieden** | `APPROVED`, `REJECTED`, `HELD_FOR_ENRICHMENT` — ein Mensch hat entschieden, nur ein Mensch ändert das |
| **maschinell** | `AWAITING_APPROVAL`, `SUPERSEDED` — der Lauf setzt sie, der Lauf darf sie ändern |

Lauf, Recovery, Test und Kettenreparatur bewegen sich ausschließlich im
maschinellen Teil. Berühren sie einen entschiedenen Zustand, **wirft**
der Guard — er vermerkt nicht und führt trotzdem aus. Ein Vorgang, der
eine Owner-Entscheidung anfassen wollte, hat eine falsche Annahme über
die Welt, und die soll auffallen.

Die Gegenrichtung gilt auch: eine Maschine darf **keinen** entschiedenen
Zustand setzen (`machineCannotDecide`). Ein Lauf, der selbst auf
`REJECTED` ginge, hätte entschieden.

`OD3` prüft jeden entschiedenen Ausgangszustand gegen jeden
Zielzustand, `OD6` dass der Owner weiterhin alles darf, `OD7` dass der
Betrieb nicht mitgesperrt ist, und `PC21` fährt einen echten Lauf gegen
einen zurückgehaltenen Kandidaten: er bleibt unberührt, und der neue
Kandidat entsteht trotzdem.

### `HELD_FOR_ENRICHMENT` ist kein Leistungsurteil

Aus demselben Grund wie `REJECTED`: der Beitrag ist nie erschienen. Er
hat keine Leistung — weder eine gute noch eine schlechte — und geht in
keinen Leistungsvergleich ein (`OD2`).

Die Entscheidung läuft über den normalen Weg, nicht über eine
Handkorrektur an der Datei:

```
node scripts/social/decide-candidate.mjs --candidate <id> --hold --reason "..."
```

`--hold` ohne `--reason` wird abgewiesen. Der Grund sagt, **was fehlt,
damit es weitergeht** — und ohne ihn wäre das Zurückhalten als
Rückmeldung wertlos.

---

## 26. Sechsmal STARTED, kein Ergebnis — und ein Zustand, den es nicht gab

PR #101 meldete **sechsmal** `STARTED` zu **derselben** `delivery_id`
und lieferte nie:

| # | Zeit (UTC) | Abstand | Faktor |
|---|---|---|---|
| 1 | 11:45:48 | — | |
| 2 | 11:51:30 | +5,7 min | |
| 3 | 12:00:34 | +9,1 min | 1,59 |
| 4 | 12:13:39 | +13,1 min | 1,44 |
| 5 | 12:34:53 | +21,2 min | 1,62 |
| 6 | 13:11:37 | +36,7 min | 1,73 |

Der fast konstante Wachstumsfaktor ist die Signatur eines
exponentiellen Backoffs. Das ist ein **Muster in den Zeitstempeln**,
kein bewiesener Mechanismus — die Schnittstelle zeigt keinen.

Der Owner hat die Work-Oberfläche geprüft: mehrere **leere Chats**.
Kein Inhalt, keine Fehlermeldung, kein Abbruchgrund. Auch dort keine
Root Cause.

### Der Anbieter hat keinen Fehlerkanal

Das ist der eigentliche strukturelle Befund. Der Agent kann melden,
dass er **angefangen** hat. Er hat noch nie gemeldet, dass er
**aufgehört** hat. Ein Ausfall sieht deshalb exakt aus wie ein langer
Lauf.

Und der Orchestrator stand still — nicht wegen des Anbieters, sondern
weil es für „nichts Beobachtbares im Fenster" **keinen Zustand gab**.
Dieselbe Diagnose wie bei `HELD_FOR_ENRICHMENT`, eine Ebene tiefer.

### Die Frist ist gemessen, nicht ausgedacht

```
PR #98, verifizierter Lauf mit Text UND Bild
STARTED 09:48:36Z  →  Result-Commit 09:54:21Z  =  345 s
```

Eine Messung ist keine Verteilung. Der Faktor 10 im
`BOOTSTRAP`-Regime ist **Schutz gegen das eigene Nichtwissen**, kein
Quantil — er fällt auf 4 und dann 2, sobald es Streuung zu messen gibt.

```
345 s × 10 = 3450 s = 57,5 min
```

Untergrenze 690 s, damit das Fenster nie den einzigen bekannten
Erfolgsfall abschneidet.

`STALE_NO_RESULT` sagt **einen** Satz: der externe Provider hat im
Fenster nichts Beobachtbares geliefert. Kein Content Failure, kein
Performance Failure, kein Owner Reject, kein Evidence Reject — und
keine Aussage darüber, ob der Lauf beim Anbieter noch läuft. Es ist
**nicht terminal**: taucht später ein Ergebnis auf, darf es verarbeitet
werden. Und es **blockiert den Graphen nicht**.

---

## 27. Das Experiment — und die Kontrolle, die zuerst fehlte

Statt eines blinden Retrys drei isolierte, nicht produktive Anfragen
mit eigenen `content_id`s, `brief_id`s und Processing Keys.

Zuerst kostenlose Evidenz: der **Strukturvergleich** der drei Briefe.

| | PR #97 ✅ | PR #98 ✅ | PR #101 ❌ |
|---|---|---|---|
| Bytes | 1 524 | 2 932 | 11 910 |
| Verschachtelung | 2 | 3 | **3** |
| längster String | 164 | 205 | **176** |
| `evidence` | — | — | 23 |
| Nicht-ASCII | `ß ö ü` | `ß ä ö ü` | **`× – — “ „`** |

Die Verschachtelung ist gleich, der längste String in PR #101 sogar
**kürzer**. Es gibt keine pathologische Struktur. Aber PR #101 trägt
**typografische Zeichen**, die beiden Proofs fehlen — aus den
Quant-Daten: `Band „Konstruktiv"`, `0–100`, `0.83× zum Median`. Eine
zweite Variable, die vorher niemand gesehen hatte.

Daraus der Aufbau:

| | Achse | Bytes | `evidence` | Sonderzeichen |
|---|---|---|---|---|
| **D1** | Struktur bei bewährter Größe | 4 258 | 3 | ja |
| **D2** | Größe allein | 11 984 | — | nein |
| **D3** | **Kontrolle** | 2 891 | — | nein |

### D3 war der Fehler im Aufbau

D1 und D2 variierten gegen einen **historischen** Erfolg, ohne zu
prüfen, ob die Grundlinie **jetzt** noch trägt. D3 ist deshalb der
PR-#98-Brief **wörtlich** — nur `brief_id`, `content_id`,
`fixture_type` und der Asset-Pfad unterscheiden sich, inhaltlich kein
Zeichen.

Ein Experiment, das seine eigene Grundlinie nicht nachmisst, kann einen
Ausfall nicht von einer Nutzlastgrenze unterscheiden. Das war keine
Kleinigkeit: ohne D3 hätten D1 und D2 gemeinsam „beides ist schuld"
ergeben — und das wäre falsch gewesen.

---

## 28. Der Wiederanlauf braucht kein neues Verfahren

Schweigt der Anbieter, muss derselbe Inhalt erneut angefragt werden
können. Das ging nicht, ohne die Idempotenz zu verletzen: derselbe
Brief → derselbe Blob-SHA → derselbe Processing Key → das Ledger weist
den zweiten Anlauf zu Recht ab.

Der Anlauf steht jetzt **im Brief**:

```json
"attempt": 2,
"supersedes_attempt": 1,
"attempt_reason": "Voriger Anlauf ohne beobachtbares Ergebnis."
```

Damit ändern sich seine Bytes, damit sein Blob-SHA, damit sein
Processing Key und damit alle Varianten-Kennungen. Jeder Anlauf ist
ein eigener Vorgang, und die Idempotenzgrenze bleibt exakt dort, wo sie
war.

```
Anlauf 1  sha 8460175fca71  supersedes null
Anlauf 2  sha 61851e27507f  supersedes 1
Anlauf 3  sha ff389571122d  supersedes 2
```

Der Zähler steigt **nicht von selbst**. Er ist ein Parameter, und wer
ihn setzt, hat sich entschieden — eine Automatik wäre genau die
unkontrollierte Retry-Schleife, die es nicht geben soll.

---

## 29. Der Ledger führt sich selbst — und trennt Beobachtung von Notiz

Von sechs `STARTED`-Meldungen standen **zwei** im Ledger: die beiden,
die ich zufällig gesehen und von Hand nachgetragen hatte.

Beim ersten Lauf gegen echte Daten fielen sofort zwei Fehler auf, beide
meine:

**Vier von fünf Handeinträgen trugen erfundene Zeitstempel**, zwei
davon in der Zukunft. Die Auswertung zählte daraufhin neun `STARTED`
statt sechs und hielt einen seit Stunden stehengebliebenen Lauf für
`IN_FLIGHT`.

**Ein negatives Alter fiel durch jeden Fristvergleich.** Eine Aktivität
in der Zukunft ist ein Datenfehler, kein frischer Lauf.

Einträge tragen deshalb `observed`. Nur Beobachtetes geht in die
Auswertung; die Handeinträge bleiben als Provenance stehen. Ein Ledger,
das Beobachtetes und Notiertes vermengt, kann seine einzige Frage nicht
mehr beantworten — und an ihr hängt die Einstufung
`LOOP_PROTECTION_OPERATIONALLY_SUPPORTED`.

Mehrfaches `STARTED` bleibt **sichtbar**. Sechs Anläufe sind eine
Tatsache. Die Idempotenzgrenze liegt woanders: am Processing Key und am
unveränderlichen abgeschlossenen Ergebnis. Sichtbarkeit und
Verarbeitung zu vermengen war der Fehler, der die vier Meldungen
verschluckt hat.

---

## 30. Das Ergebnis: die Nutzlast ist unschuldig

Vier unabhängige Anfragen, vier Wiederholungsfolgen. Die Nutzlasten
könnten unterschiedlicher kaum sein — **die Signatur ist dieselbe**.

| | Brief | `evidence` | Sonderzeichen | n | Folge (min) | Dauer |
|---|---|---|---|---|---|---|
| PR #101 | 11 910 B | 23 | ja | 6 | 5,7 · 9,1 · 13,1 · 21,2 · 36,7 | 86 min |
| D1 | 4 258 B | 3 | ja | 6 | 6,1 · 9,2 · 12,3 · 21,5 · 36,6 | 86 min |
| D2 | 11 984 B | — | nein | 6 | 7,1 · 9,2 · 12,9 · 20,9 · 36,4 | 87 min |
| D3 | **2 891 B** | — | nein | 4+ | 5,9 · 9,5 · 13,1 | läuft |
| PR #98 ✅ | 2 932 B | — | nein | **1** | — | **5 min 45 s** |

Die Streuung zwischen den Läufen beträgt auf einem 36-Minuten-Abstand
**höchstens 1,4 Minuten**. Das ist kein Zufall und keine Last: das ist
ein fester Wiederholungsplan.

### Was damit ausgeschlossen ist

**A — Nutzlastgröße.** D3 ist 2 891 B und scheitert. PR #98 ist
2 932 B und hat geliefert. Zwischen beiden liegen 41 Bytes.

**B — Evidenzstruktur und Zeichen.** D2 trägt weder `evidence` noch
typografische Zeichen und scheitert. D3 erst recht nicht.

**C — der Bildschritt.** PR #98 hat mit demselben Bildauftrag ein
echtes PNG erzeugt.

**D3 ist der Beweis**: derselbe Brief, Zeichen für Zeichen, der um
09:54:21Z ein Ergebnis samt generiertem Bild geliefert hat, liefert
heute nichts — und zwar mit exakt derselben Signatur wie die
Produktionsanfrage.

Der Fehler ist **eingabeunabhängig**. *(Der ursprüngliche zweite Satz dieses Absatzes lautete „Er liegt beim Anbieter.“ Das war falsch — siehe Abschnitt 32.)*

### Was damit *nicht* bewiesen ist

Die **innere** Ursache. Die Work-Oberfläche zeigt leere Chats, diese
Schnittstelle zeigt `STARTED`. Beides zusammen sagt nicht, woran der
Lauf scheitert. `UNKNOWN` bleibt `UNKNOWN` — nur ist der Raum der
Möglichkeiten jetzt erheblich kleiner.

Und nicht bewiesen ist, dass sechs Anläufe das Maximum sind. PR #101,
D1 und D2 hörten nach sechs auf; D3 stand bei Redaktionsschluss bei
vier. Das ist ein konsistentes Bild, kein bewiesener Grenzwert.

---

## 31. Das Experiment hat auch das Messgerät geprüft

Der Kontrolllauf hat einen Fehler in `classify()` sichtbar gemacht.

Die Frist maß die Zeit seit der **letzten** Aktivität. Jede
Backoff-Meldung setzt diese Uhr zurück — ein Anbieter, der unbegrenzt
weiter `STARTED` meldet, wäre damit **nie** stale geworden.

PR #101 wurde es nur, weil seine Wiederholungen nach sechs Versuchen
aufhörten. Also aus Zufall und nicht aus Logik.

Seither zwei Fenster:

| | | |
|---|---|---|
| **Ruhe** | 3 450 s | Wie lange nach einem Lebenszeichen darf noch etwas kommen? |
| **Gesamt** | 10 350 s | Wie lange darf der ganze Vorgang dauern, egal wie oft der Anbieter meldet, dass er wieder anfängt? |

Der Faktor 3 steht im Quelltext mit seiner Begründung: die beobachtete
Folge läuft über 86 Minuten, drei Fristen sind mit 173 Minuten
komfortabel darüber. Ein Experiment, das nur den Prüfling misst und
nicht das Messgerät, hätte diesen Fehler stehen lassen.

---

## 32. Korrektur: der Agent ist nicht gescheitert, er hat gewartet

Abschnitt 30 schloss: *„Der Fehler ist eingabeunabhängig. Er liegt beim
Anbieter."* Der erste Satz stimmt. **Der zweite war falsch.**

Der Owner hat in der ChatGPT-Work-Oberfläche beobachtet, dass die
verbundene GitHub-App eine **Genehmigung** verlangt. Nach *Immer
zulassen* lief der Auftrag `vu-diag-size-20260917` (PR #103)
vollständig durch: Hooks, Caption, Visual Brief, integrierte
Bildgenerierung, Result- und Asset-Commit, `processing.status =
completed`.

### Die Zeit sagt es am deutlichsten

```
6. STARTED   18:28:51Z
Result       18:32:24Z     =  3 min 33 s
Referenz PR #98                5 min 45 s
```

Der sechste Anlauf lief in **normaler Zeit** durch. Es gab keinen
Ausfall, der plötzlich endete — es gab ein Warten, das plötzlich
aufhörte.

### Meine eigenen Daten sprachen für die Genehmigungs-Hypothese

Das ist der unangenehme Teil. Die Gleichförmigkeit der
Wiederholungsfolgen über Nutzlasten von 2 891 B bis 11 984 B — mit
höchstens 1,4 Minuten Abweichung auf einem 36-Minuten-Abstand — habe
ich als Beweis für einen Anbieterfehler gelesen.

Sie ist genau das, was ein **Warten** erzeugt: die Nutzlast spielt
keine Rolle, weil der Lauf sie nie erreicht. Dieselbe Beobachtung, die
bessere Erklärung.

### Was jetzt zusätzlich positiv belegt ist

PR #103 hat **11 984 Bytes** verarbeitet — den größten Brief von allen,
größer als die Produktionsanfrage mit 11 910 B. Die Größenhypothese ist
damit nicht nur ausgeschlossen, sondern **positiv widerlegt**.

### Der Zustand, der daraus folgt

`WAITING_FOR_EXTERNAL_APPROVAL`, und der Name ist mit Bedacht gewählt:

| | |
|---|---|
| **Signal** | ≥ 2 × `STARTED` ohne Ergebnis und ohne Fehler. Ein einzelner Lauf dauert gemessen 345 s — wer wieder anfängt, ist beim ersten Mal nicht fertig geworden |
| **Behauptung** | nur, dass dieses Muster auf eine offene Genehmigung **passt** |
| `approvalStateObservable` | `false` — GitHub sieht diese Genehmigung nicht |
| **blockiert den Graphen** | nein |
| **lernbar als Inhaltsurteil** | **nein** |

Der letzte Punkt ist der wichtigste. Es einer Hook oder einem Beleg
anzulasten, dass ein Mensch eine Genehmigungsabfrage nicht gesehen hat,
wäre die schlimmste Art von gelerntem Unsinn: künftige Inhalte würden
nach einem Kriterium aussortiert, das mit Inhalt nichts zu tun hat.
`isContentJudgement()` schließt `WAITING_FOR_EXTERNAL_APPROVAL`,
`STALE_NO_RESULT`, `PROVIDER_FAILED` und `RECOVERY_REQUIRED`
ausdrücklich aus.

### Und eine Folge für den Wiederanlauf

Steht ein Vorgang auf `WAITING_FOR_EXTERNAL_APPROVAL`, **verweigert**
`recover-creative-request.mjs` den nächsten Anlauf. Ein zweiter Versuch
erzeugte sonst eine **zweite wartende Anfrage** und verdoppelte das
Problem. Der nächste Schritt ist dort kein technischer, sondern ein
Blick in die Work-Oberfläche.

### Was weiterhin offen ist

Warum D1 und D3 nicht ebenfalls durchliefen, obwohl sie im selben
Zeitfenster liefen und *Immer zulassen* gewählt war. Denkbar ist, dass
die Genehmigung pro Lauf und nicht global greift. Das ist **nicht
geprüft** und wird hier nicht behauptet.

`STALE_NO_RESULT` gilt deshalb erst, wenn auch das **Gesamtfenster**
abgelaufen ist. „Stale" heißt „es kommt nichts mehr" — und PR #103 hat
gezeigt, dass nach sechs stillen Anläufen sehr wohl noch etwas kommen
kann.

---

## 33. Erzeugt und nicht zugestellt

PR #106 hat zwei Dinge zugleich gezeigt, die nichts miteinander zu tun
haben:

| | |
|---|---|
| Der Agent hat ein Bild **erzeugt** | Text, Caption, Visual Brief, Ergebnisdokument — einwandfrei, in 146 s, unbeaufsichtigt |
| Das Bild ist nicht **angekommen** | Chunk-Kette bricht bei Offset 416 983 |

Wer das zusammenwirft, lernt Unsinn: dass diese Hook schlecht sei, dass
diese Visual Strategy nicht funktioniere, dass die Evidenz schwach war.
Nichts davon hat mit einem abgerissenen Dateitransfer zu tun.

### Die Forensik, ohne einen einzigen Work-Aufruf

Alle drei realen Assets stammen erkennbar aus demselben Erzeuger:
`IHDR`, `caBX`, dann `IDAT`-Chunks zu **exakt 65 536 Bytes**, ein
kurzer Schluss-`IDAT`, `IEND`.

| | Bytes | IDATs | Kette |
|---|---|---|---|
| PR #98 | 1 794 521 | 28 (27 voll + 1 039) | vollständig |
| PR #103 | 1 262 586 | 19 (18 voll + 59 036) | vollständig |
| **PR #106** | **786 444** | **6, alle voll** | **Bruch @ 416 983** |

Der Unterschied ist nicht der Inhalt, sondern der Weg.

### Maximal belegbarer Befund

Das beschädigte Asset hat einen **einwandfreien Anfang**: Signatur,
`IHDR`, `caBX` und sechs vollständige `IDAT`-Chunks. Ab Offset 416 983
steht kein Chunk-Header mehr. Die Gesamtlänge ist 786 444 Bytes =
**exakt 768 KiB plus zwölf**. Diese zwölf Bytes sehen aus wie ein
`IEND`-Chunk und sind keiner:

```
ist     000000049454e44ae4260820
korrekt 0000000049454e44ae426082
```

Dieselben Ziffern, um **ein Nibble** verschoben. Die Gegenprobe — ob
der ganze Rest ab der Bruchstelle gleichmäßig verschoben ist — fällt
**negativ** aus. Es ist also keine simple Bitverschiebung des Stroms.

**Was daraus nicht folgt: der Mechanismus.** Der Work-interne Transport
ist von hier aus nicht beobachtbar. Die Grenze auf exakt 768 KiB und
der angehängte Pseudo-Terminator sind Beobachtungen, keine Ursache.

### Die Endeprüfung war eine Stichprobe

Sie hat PR #106 gefangen — aber nur, weil die Verschiebung zufällig
genau die vier Bytes traf, auf die sie schaut. Ein Bild mit intaktem
`IEND` und zerstörter Mitte wäre durchgegangen. `AT3` stellt das nach:
die Endeprüfung meldet „vollständig", die Kettenprüfung nicht.

Gelaufen wird jetzt die **ganze Kette**, Chunk für Chunk bis `IEND`,
plus die Prüfung, dass dahinter nichts mehr steht.

---

## 34. `completed` ist nicht `completed`

PR #106 trug `processing.status = "completed"` im selben Commit wie ein
beschädigtes Asset. **Der Agent hat nicht gelogen** — er hat berichtet,
was er von seiner Seite sehen konnte. Nur ist das eine andere Frage als
die, was im Repository liegt.

| | |
|---|---|
| `AGENT_REPORTED_COMPLETED` | der Agent sagt, er sei fertig |
| `VU_VERIFIED_COMPLETED` | wir haben nachgesehen und es stimmt |

Beide stehen nebeneinander im Ergebnis, nie das eine **statt** des
anderen. `VU_VERIFIED_COMPLETED` verlangt alle neun Prüfungen — eine
einzige fehlende genügt:

```
RESULT JSON VALID · IDENTITIES VALID · ASSET EXISTS · MIME VALID
IMAGE STRUCTURE VALID · DIMENSIONS VALID · BYTE SIZE VALID
SHA256 MATCH · FRESH GITHUB READBACK VALID
```

Der eigene Fehlertyp heißt `ASSET_TRANSPORT_INTEGRITY_FAILED` und trägt
`contentJudgement: false`.

---

## 35. Wiederherstellung ohne Geschichtsfälschung

Der erste Bildproof brauchte einen **Force-Update**. Als einmalige
Rettung in Ordnung; als Produktionspfad das Gegenteil von Provenance —
der Beweis, *dass* etwas schiefging, verschwände zusammen mit dem
Schaden.

```
ASSET_TRANSFER_FAILED
  → das beschädigte Asset bleibt liegen: visual-01.failed-01.png
  → ein neuer, unveränderlicher Commit legt die korrekte Fassung daneben
  → frisches Rücklesen vom finalen Commit
  → VU_VERIFIED_COMPLETED
```

Kein History-Rewrite. Wer später fragt, was passiert ist, findet **beide
Fassungen** und den Grund dazwischen.

Und die Quelle muss den Hash tragen, den der Agent angekündigt hat.
Fehlt eine geprüft korrekte Quelle, endet der Weg mit einem Nein
(`AT10`, `AT12`): ein Recovery, das sich seine Wahrheit selbst ausdenkt,
ist keines.

**Der Creative Agent wird dafür nicht erneut aufgerufen.** Er hat seine
Arbeit geleistet; es ist der Transport, der scheiterte. Ihn wegen eines
Dateitransfers noch einmal laufen zu lassen, würfe eine erbrachte
Leistung weg, kostete einen Work-Aufruf und erzeugte ein *anderes* Bild.

### Getestet mit einem bekannt guten Binär

`AT1` schreibt das verifizierte Asset aus dem Bildproof in ein echtes
Wegwerf-Repository, committet, liest **frisch vom Commit** zurück und
vergleicht Typ, Struktur, Abmessungen, Größe und Hash. Byteidentisch.

Damit ist der Transportweg unabhängig von der Bilderzeugung geprüft —
ohne einen einzigen Work-Aufruf. `AT6` hält fest, dass eine Prüfung
gegen den Schreibpuffer nicht zählt: sie prüft nur, dass wir richtig
abgeschrieben haben.
