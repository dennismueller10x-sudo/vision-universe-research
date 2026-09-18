# Creative-Agent-Trigger: Produktionstauglichkeit

**Einstufung: `CHATGPT_WORK_TRIGGER_PROVIDER_LIMITATION`**

Analysiert am 2026-09-18 ausschließlich aus vorhandenen Deliveries, PR-
Kommentaren, Ledger und Git-Historie. **Keine neue ChatGPT-Work-Ausführung.**

---

## 1. Die Messung

Acht logische Creative Jobs, alle Zahlen aus den PR-Kommentaren selbst:

| PR | Inhalt | Anlauf | Deliveries | sichtbare Starts | Ergebnis |
|---|---|---|---|---|---|
| 98 | vu-image-trigger-proof | 1 | **1** | **1** | erfolgreich, 345 s |
| 101 | vu-xom-20260911 | 1 | **1** | **6** | nie geliefert |
| 102 | vu-diag-structure | 1 | **1** | **6** | nie geliefert |
| 103 | vu-diag-size | 1 | **1** | **6** | erfolgreich (spät) |
| 104 | vu-diag-baseline | 1 | **1** | **6** | nie geliefert |
| 105 | vu-xom-20260911 | 2 | **1** | **5+** | nie, lief 11 h weiter |
| 106 | vu-permcheck | 1 | **1** | **1** | erfolgreich |
| 108 | vu-xom-20260911 | 3 | **1** | **1** | erfolgreich, 148 s |

**8 Jobs → 8 Deliveries → 32 sichtbare Starts.**

---

## 2. Der entscheidende Befund

Jeder Request-PR trägt **genau eine `delivery_id`**, und *alle* Starts
desselben PRs nennen dieselbe. Beispiele wörtlich aus den Kommentaren:

- PR 101: sechsmal `delivery_id: 2c4ca770-b28d-11f1-9dd2-d4cdebdcbfbd`, jedes Mal `action: opened`
- PR 104: sechsmal `delivery_id: 67f3b790-b2bb-11f1-8373-2f2c97430b72`
- PR 105: fünfmal `delivery_id: 611be490-b2c7-11f1-91e5-90833707ce99`

Der Agent selbst hält auf PR 101 fest:

> *„Six STARTED invocation ledger entries are now visible for the same
> delivery_id; this is not an exactly-one-invocation proof."*

**VU hat nie eine doppelte Delivery erzeugt.** Die Vervielfachung liegt
hinter der Delivery und ist damit für jede GitHub-seitige Konfiguration
unerreichbar.

### Was das über die Trigger-Filter sagt

Ein Filter entscheidet, **ob** eine Delivery entsteht — nicht, wie oft der
Empfänger sie bearbeitet. Geprüft und jeweils als Ursache ausgeschlossen:

| Kandidat | Befund |
|---|---|
| `opened` / `reopened` / `synchronize` | alle 32 Starts melden `action: opened` |
| Commit-Updates | VU pusht **einen** Commit je Request-Branch, vor dem PR |
| **Ergebnis-Commit des Agenten** | **erzeugt keine neue Delivery** (PR 103, 106, 108: Ergebnis-Commit vorhanden, trotzdem eine `delivery_id`) |
| Kommentare | die Agentenkommentare selbst (>20) haben nie einen Lauf ausgelöst |
| Reviews | keine vorhanden |
| Draft-Verhalten | alle acht PRs sind Draft; erfolgreiche wie gescheiterte |
| Titel-/Branch-/Path-Guards | bei allen acht identisch erfüllt |

Die Rekursionsangst über Result-Commits war unbegründet — das ist ein
belegter **Negativbefund**, kein Nicht-Wissen.

---

## 3. Wovon die Vervielfachung tatsächlich abhängt

    Starts bei erfolgreichen Jobs:   1, 1, 1   (und 6 bei PR 103)
    Starts bei gescheiterten Jobs:   6, 6, 6, 5

Jobs, die beim ersten Lauf lieferten, zeigen **genau einen** Start. Jobs,
deren Lauf scheiterte, zeigen fünf bis sechs — und PR 103 lieferte erst
beim sechsten. Die Wiederholung endet, sobald ein Lauf gelingt.

Alle gescheiterten Läufe melden denselben Grund:
`IMAGE_GENERATION_UNAVAILABLE_IN_EVENT_AGENT` — das Bild wurde erzeugt, der
**Binärtransfer nach GitHub** brach ab. PR 105 heute wörtlich:

> *„the event agent had read-only anonymous Git transport and no writable
> credential"*

Die Vervielfachung ist also die anbieterinterne Wiederholung eines
**scheiternden** Laufs, nicht ein Mehrfach-Auslösen.

### Eine Korrelation, ausdrücklich kein Beweis

Die beiden Jobs nach der Owner-Umstellung auf „Alle Aktionen zulassen"
(PR 106 und 108) liefen mit je **einem** Start durch. Alle Mehrfach-Fälle
liegen davor. Das ist n = 2 und eine Korrelation — PR 98 gelang vor der
Umstellung ebenfalls mit einem Start. Als Ursache ist das nicht belegt.

---

## 4. Warum das nicht Fall A ist

Fall A verlangt einen *bounded* Creative-Job-Pfad unter unseren
kontrollierbaren Bedingungen. Der Dispatch ist beschränkt und jetzt auch
erzwungen. Die Wiederholung ist es nicht:

- keine beobachtbare Obergrenze — PR 105 meldete nach **11 h 13 min** noch,
- kein Abbruchsignal, das VU senden könnte,
- kein Zusammenhang mit irgendeiner Einstellung, die VU besitzt.

Ein Pfad, dessen teuerster Zweig unbeschränkt ist, ist nicht bounded. Die
ehrliche Einstufung ist **B**.

### Der eine Hebel — und warum er unbewiesen bleibt

Ein offener Request-PR ist die Fläche, gegen die der Anbieter weiterarbeitet.
PR 105 wurde am 2026-09-18T08:05:15Z geschlossen; seither kein weiterer
Kommentar. **Das beweist nichts:** die letzte Agentenmeldung lag um 05:55,
also 2 h 10 min vor dem Schließen. Die Stille kann ebenso gut vorher
eingetreten sein. Der Hebel bleibt plausibel und unbelegt.

---

## 5. Was VU jetzt erzwingt

Nicht als Ratschlag, sondern fail closed.

| | vorher | jetzt |
|---|---|---|
| Ein Job je `processing_key` | Absicht | `creative-job.js`, wirft |
| Keine parallelen Anläufe je `content_id` | nichts | Budget, geprüft |
| Anlaufgrenze | nur im Recovery-Skript | Budget, geprüft |
| Diagnostische Jobs im Produktionspfad | erlaubt | 0, geprüft |
| Verweigerter Anstoß | **`exit 0`** | `exit 4` |
| Dispatch am Gatter vorbei | möglich (und real: 8 von 8) | CI-Guard, `exit 5` |

### Eine Einschränkung, beobachtet statt vermutet

Der CI-Guard lief auf PR #110 **nicht**. Er liegt bisher nur auf dem
Arbeitsbranch; ein Request-PR gegen `main` bringt den Workflow nicht mit,
und was nicht im Repository des PRs steht, läuft auch nicht. Beobachtet an
den Check-Runs von PR #110: nur Vercel.

Er wird also erst wirksam, wenn er auf `main` steht. Bis dahin ist er
geschriebener, geprüfter, aber nicht laufender Schutz — und das gehört so
gesagt, statt ihn als aktiv zu führen.

Die beiden letzten Zeilen waren echte Löcher. `request-creative.mjs` endete
nach einer Verweigerung mit Rückgabewert 0 — jede Automation, die den
Rückgabewert prüft, las das als „in Ordnung, weiter". Und das Gatter saß vor
dem **Brief**, während ausgelöst wird durch das **Öffnen des PRs**: alle acht
bisherigen Jobs sind daran vorbei entstanden. Dass nie doppelt ausgelöst
wurde, war Sorgfalt und keine Eigenschaft des Systems.

---

## 5a. Nachtrag: PR #110 löste gar nicht aus

Die Analyse oben beruht auf acht Jobs, die **alle** ausgelöst haben —
8 Deliveries auf 8 Dispatches. Der neunte tat es nicht.

| PR | vom Öffnen bis zum ersten Start |
|---|---|
| 104 | 0:58 |
| 105 | 1:04 |
| 101 | 1:07 |
| 108 | 2:04 |
| 98 | 2:09 |
| **110** | **40+ Minuten, kein Start** |

PR #110 erfüllt alle drei bekannten Bedingungen: Branch
`authoring/request/vu-xom-20260911-rev1`, Titel
`VU-AUTHORING-REQUEST: …`, Draft. Kein einziger
`VU_CREATIVE_AGENT_INVOCATION`-Kommentar, kein Ergebnis-Commit, keine
Check-Runs außer Vercel.

Das ändert den Befund aus Abschnitt 2 nicht — VU hat weiterhin keine
Delivery dupliziert — aber es ergänzt ihn um die andere Richtung:

> Die Zustellung ist **nicht nur unbeschränkt nach oben** (32 Starts auf
> 8 Deliveries), sondern **auch nicht verlässlich nach unten**.

Beides liegt hinter der Delivery und ist von VU aus nicht steuerbar. Der
Job steht auf `CREATIVE_JOB_STALE` — „wir haben nichts gesehen", nicht
„es kommt nichts mehr". Kein zweiter Dispatch: ein Request-PR, der nicht
auslöst, wird nicht durch einen zweiten Request-PR beantwortet.

**Was von hier aus nicht beobachtbar ist:** der Zustand der
ChatGPT-Work-Automation selbst. Ob sie aktiv ist, steht auf der
Owner-Seite. Eine Vermutung darüber wäre genau die Sorte Behauptung, die
dieser Bericht sonst vermeidet.

---

## 6. Die Owner-Entscheidung

Die kreative Fähigkeit ist bewiesen und bleibt erhalten. Zu entscheiden ist
der **Produktions-Trigger**. Drei Wege, keiner davon mit kostenpflichtiger API:

### Option 1 — Weiterbetrieb, Risiko begrenzt auf den Bildpfad *(Empfehlung)*

Alle beobachteten Wiederholungen hängen am **Binärtransfer**. Textläufe haben
ihn nie gezeigt (PR 97, Text-Proof: sauber). Die anstehende XOM-Revision ist
**text-only** — sie verwendet das bereits verifizierte Asset aus Attempt 3
wieder und erzeugt kein Bild.

Regel: Bild-erzeugende Jobs nur einzeln und bewusst; Textrevisionen normal.
Kosten heute: eine Ausführung auf dem Pfad, der bisher nie gescheitert ist.

### Option 2 — Trigger von Ereignis auf Warteschlange umstellen

Statt PR-Ereignis eine getaktete Work-Automation, die eine von VU geschriebene
Queue liest. Ob das die anbieterinterne Wiederholung ändert, ist **unbekannt** —
sie liegt hinter der Zustellung, und ein Takt ändert daran möglicherweise
nichts. Kosten: mindestens ein Testlauf, Ergebnis offen.

### Option 3 — Generativen Autor aus dem Produktionspfad nehmen

Der deterministische Template-Autor bleibt und läuft ohne externen Agenten.
Kosten: null Work-Ausführungen — und der Verlust genau der Qualität, wegen
der dieser Provider eingeführt wurde. Der Weg bleibt für Einzelläufe offen.

---

## 7. Zustände, unverändert

    cand_20260917_0363e680   HELD_FOR_ENRICHMENT
    cand_20260918_ca4ea408   HELD_FOR_CREATIVE_REFINEMENT

`GLOBAL_AUTOPUBLISH` aus. `VU_SOCIAL_AUTOPUBLISH` aus. Nichts veröffentlicht.
`WORK_INVOCATIONS_CREATED = 0`.
