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
