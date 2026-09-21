# VISION UNIVERSE — Intraday Delivery Reliability

**Auftrag:** Owner, 21.09.2026 — P0 Production Fix
**Betroffen:** kanonische Market-/Intraday-/Realtime-Infrastruktur (Discover 1.0, später 2.1)
**Nicht betroffen:** Discover 2.1 (eigener Workstream), Realtime-Architektur, Cloudflare-Worker `vu-live`

---

## 1. Agent-Graph

```
  IDR-A  Timing-Audit ───┐
                         ├──> IDR-C  Trigger ──> IDR-H  Production Proof ──> Report
  IDR-B  Providerbudget ─┘         │
                                   ├──> IDR-D  Fast Path
                                   ├──> IDR-E  Watchdog ──> IDR-F  Recovery
                                   └──> IDR-G  Regression
```

| Knoten | Rolle | Quality Gate | Recovery Path |
|---|---|---|---|
| IDR-A | misst die Kette, schätzt nicht | jeder Zeitanteil eine gemessene Zahl | — |
| IDR-B | belegt das Providerbudget | Beleg oder UNKNOWN, nie Annahme | UNKNOWN ⇒ Drossel bleibt |
| IDR-C | zuverlässiger Trigger | Takt hält ohne Zeitplan-Ereignis | Wächter holt einen Zyklus nach |
| IDR-D | zeitkritisch von Folgearbeit trennen | keine zweite Source of Truth | — |
| IDR-E | Wächter über die ganze Kette | Anlassfall ist FAIL | drei Kontrollpfade |
| IDR-F | Reparatur ohne Trigger-Sturm | Deduplication, gemeinsame Concurrency | zweite Prüfung vor dem Holen |
| IDR-G | Regression | 20 Fälle, scharfe mit Gegenprobe | — |
| IDR-H | Produktionsnachweis | drei aufeinanderfolgende Zyklen | — |

**Owner-Eskalationen** (§9, §25 B): zwei, beide unten benannt — das GitHub-Token für den
externen Wecker und die Anfrage nach dem echten Providerlimit.

---

## 2. Root Cause

Am 21.09.2026 stand die Consumer-Ansicht von **09:09 bis 10:13 New Yorker Zeit** auf
dem Stand vom Freitag. Zwei getrennte Ursachen, plus eine dritte, die erst der Fix
sichtbar machte:

**(1) Der Zeitplan erzeugte keine Läufe.**
Letzter geplanter Intraday-Lauf: 13:09 UTC = 09:09 New York, Phase PRE_MARKET.
Danach über eine Stunde kein weiterer — nicht `failed`, nicht `cancelled`,
sondern **gar nicht angelegt**. Ein nicht angelegter Lauf hinterlässt keine Spur.

**(2) Der Anbieter trägt den Sitzungsbeginn nicht.**
Manuelle Läufe um 09:38 (527 Titel) und 09:46 (8 Titel) ergaben je **0 reguläre
Bars**, `discarded: 0` — der Anbieter lieferte eine leere Liste, unsere Filter
verwarfen nichts. Um 10:13 dann 8 von 8 Titeln mit je 4 Punkten ab 09:55.

**(3) Der Taktgeber reparierte die Daten und brach die Auslieferung.**
Erst nach dem Fix sichtbar: der neue Takt schrieb alle fünf Minuten einen frischen
Stand nach `main`, und **nichts lieferte ihn aus**. Der erste Lauf des neuen
Wächters hat es gemessen: *„Die Auslieferung ist 40 min hinter dem Repository."*

---

## 3. Belegt gegen vermutet

| Aussage | Status | Beleg |
|---|---|---|
| Zwischen 13:09 und 14:13 UTC entstand kein Zeitplan-Lauf | **belegt** | Actions-API, `event: schedule`, Lauf #419 dann nichts |
| In denselben 92 Minuten entstanden 100 push-ausgelöste Läufe | **belegt** | Actions-API, 12:07–13:39 UTC, 40 + 60 je Stunde |
| GitHub verwirft Zeitplan-Ereignisse unter hoher Actions-Last | **dokumentiertes Plattformrisiko** | GitHub-Dokumentation |
| **Diese 100 Läufe waren die alleinige Ursache** | **NICHT belegt** | Korrelation, kein Kausalitätsnachweis. GitHub nennt keinen Grund für ein nicht angelegtes Ereignis. |
| Der Anbieter liefert am Sitzungsbeginn verzögert | **belegt, zweimal beobachtet** | 21.09.: 09:38 und 09:46 je 0 Bars, ab 10:13 vollständig. 18.09.: 09:36 erst 37/524, 09:58 dann 495/524 |
| **Der Anbieter braucht immer 25 Minuten** | **NICHT belegt** | Zwei Sitzungen sind eine Beobachtung, kein Vertrag. Nirgends hartkodiert. |
| Der Realtime-Pfad funktioniert | **belegt** | Smoke 10:16 NY: AAPL 41, NVDA 43, MSFT 23, PANW 8, VLO 8 Ticks, `realtimeVerified: true` |
| `realtimeStream FAILED` im Prüfer = Strom defekt | **widerlegt** | Der Prüfer öffnet eine zweite Verbindung neben der des Durable Object; die Produktion bekam in derselben Minute 41 Ticks |

---

## 4. Alte Triggerarchitektur

```
  cron */5 13-21 UTC ──> intraday-snapshots.yml ──> ingest ──> commit+push
                                     │
                                     └─(workflow_run, completed)──> pages-release.yml
```

**78 Zeitplan-Ereignisse je Sitzung.** Jedes eine Gelegenheit zu scheitern, jedes
Scheitern unsichtbar. Zusätzlich: ein Lauf dauert 5:27 bei einem Takt von 5:00 —
die Concurrency-Gruppe brach am 18.09. vier von fünf Läufen ab (Läufe 325–328
`cancelled`, 329 `success`). Der effektive Takt war nie fünf Minuten.

---

## 5. Neue Triggerarchitektur

```
  stündlich (Rückfall) ─┐
  workflow_dispatch ────┼──> intraday-pacemaker.yml
  repository_dispatch ──┘         │  (ein Lauf hält den Takt, Block ≤ 5 h 45)
         ▲                        │
         │                        ├─ Zyklus: ingest ──> commit ──> push
  Cloudflare Cron                 ├─ Zyklus: Wächter prüft die ganze Kette
  (worker-waker/)                 └─ Blockende: Capability + Produktfähigkeiten
  AUSSTEHEND: Token

  cron */5 ──> pages-release.yml ──> Browser        (Brücke, siehe §10)
```

**Aus 78 Gelegenheiten zu scheitern werden zwei.** Der stündliche Zeitplan legt
während eines laufenden Blocks einen Nachfolger in die Warteschlange;
`cancel-in-progress: false` lässt ihn warten und er übernimmt in der Sekunde,
in der der Vorgänger endet. Fällt ein Ereignis aus, ist die Lücke höchstens eine
Stunde statt unbegrenzt.

Die Regel steht als reine Funktion in `quant/engines/realtime/pacemaker.js` —
prüfbar, statt als Kommentar in einer YAML-Datei zu verdunsten.

---

## 6. Pipeline-Timing vorher

Gemessen an Lauf 35603810777 (13:09 UTC) und Pages-Lauf 144:

| Abschnitt | Zeit |
|---|---|
| Warteschlange + Job-Start | 4 s |
| Checkout | 23 s |
| Node-Einrichtung | 1 s |
| Zugangsprüfung + Umfang | < 1 s |
| **Provider-Abruf (527 Titel)** | **5:01** |
| Secrets-Scan, Hygiene, Capability, Produktfähigkeiten, Freshness | 13 s |
| Commit + Push | 7 s |
| Pages-Build + Deployment | 1:37 |
| **Trigger → Browser** | **≈ 7:26** |

**Critical Path: der Abruf.** 527 Titel ÷ 100 Anfragen je Minute = 5:01 von 5:27
Laufzeit. Alles andere zusammen sind 21 Sekunden.

---

## 7. Pipeline-Timing nachher

Gemessen an den Zyklen des Taktgebers, Lauf 35614593521 (siehe Register
`quant/data/market/intraday/pacemaker-ledger.json`):

| Abschnitt | Zeit | Änderung |
|---|---|---|
| Warteschlange + Checkout + Node | **0 s ab Zyklus 2** | entfällt — ein Block, ein Checkout |
| Provider-Abruf | 5:01 | unverändert (§7 bindet, siehe §8) |
| Commit + Push + Wächter | ~20 s | Wächter neu |
| Capability + Produktfähigkeiten | **0 s je Zyklus** | ans Blockende verschoben |
| Pages (Brücke */5) | ≤ 5:00 Wartezeit + 1:37 | |

**Gemessener Takt: 5:08** (Block 35618350851, vier Zyklen, siehe §15).

Die erste Fassung der Wartezeit-Regel ergab **zehn Minuten** (14:53:36, 15:00:01,
dann 15:10) — ein 5:01-Zyklus endet eine Sekunde nach dem Rasterpunkt und wartete
daraufhin einen ganzen weiteren. Korrigiert: gewartet wird nur noch, wenn der
Zyklus schneller war als das Intervall.

Der Zieltakt von exakt fünf Minuten bleibt mit diesem Abruf **nicht erreichbar** —
siehe §8. Über eine Sitzung spart der Taktgeber 78 Checkouts und 78
Node-Einrichtungen: rund 390 statt 429 Runner-Minuten.

---

## 8. Providerbudget

`scripts/market/verify-request-limits.mjs`, Lauf vom 21.09.2026:

```
verdict.status          UNKNOWN
verdict.classification  PROVIDER_CONFIRMATION_REQUIRED
verdict.lowerBound      5000   (Anfragen je Stunde, ohne Ablehnung durchgegangen)
```

Tiingo nennt sein Kontingent **weder in einem Kontoendpunkt noch in
Antwortköpfen**. Die 100 Anfragen je Minute in `COMMERCIAL_LIMITS` tragen die
Kennzeichnung `SAFETY_CEILING`, `providerObserved.status` steht auf `UNKNOWN`,
`http429Seen` ist `false`. Es ist **unsere** Zahl, nicht Tiingos.

§7 des Auftrags bindet: *keine aggressivere Parallelisierung ohne Beleg.* Die
Drossel bleibt.

> **OWNER-ESKALATION 1:** Beim Anbieter erfragen, was dieses Konto wirklich
> erlaubt (Vertrag/Support). Mit einer belegten Grenze von etwa 300 Anfragen je
> Minute fiele der Abruf von 5:01 auf 1:45 — und der Fünf-Minuten-Takt wäre
> erreichbar, ohne an der Auslieferung zu drehen.

---

## 9. Verhalten am Sitzungsbeginn

Beobachtet, nicht kodiert:

| Zeitpunkt | Ergebnis |
|---|---|
| 18.09., 09:36 NY | 37 von 524 Titeln |
| 18.09., 09:58 NY | 495 von 524 |
| 21.09., 09:38 NY | 0 von 527, `bars: 0, discarded: 0` |
| 21.09., 09:46 NY | 0 von 8 Blue Chips |
| 21.09., 10:13 NY | 8 von 8, je 4 Punkte, erste Bar 09:55 |

Es gibt **keine 25-Minuten-Regel im Code**. Das System reagiert datengetrieben:
liegen heutige Bars vor, ist der Snapshot aktuell; liegen keine vor, zeigt die
Seite den letzten vorhandenen Stand und sagt, von wann er ist. Kommt ein echter
Tick über den Cloudflare-Strom, darf die Aktienseite REALTIME werden — unabhängig
davon, ob 5-Minuten-Bars schon existieren.

Daten & Quellen nennt es jetzt sachlich: *„Unmittelbar nach Handelsbeginn kann der
Tagesverlauf noch verzögert oder unvollständig sein — die Seite zeigt dann den
letzten vorhandenen Stand und sagt, von wann er ist."*

---

## 10. Snapshot Delivery

Die dritte Ursache, die erst der Fix sichtbar machte. Zwei Plattformregeln treffen
sich unglücklich:

1. Ein Push mit `GITHUB_TOKEN` löst keinen Workflow-Lauf aus (Rekursionsschutz).
   Deshalb hängt `pages-release.yml` an `workflow_run`.
2. `workflow_run` feuert bei `completed`. Ein Block, der den Takt fünf Stunden
   hält, ist fünf Stunden lang nicht `completed`.

Der Taktgeber hat damit die Datenfrische repariert und die Auslieferung gebrochen.

**Saubere Lösung:** ein Zyklus = ein Workflow-Lauf, von außen geweckt. Braucht das
Token aus Eskalation 2.

**Brücke bis dahin:** `pages-release.yml` bekommt einen Fünf-Minuten-Zeitplan im
Sitzungsfenster.

> **GEMESSEN UM 15:40 UTC — DIE BRÜCKE HAT NICHT GEHALTEN.** Seit dem Eintragen
> des Zeitplans um 15:02 hat GitHub **null** Läufe daraus erzeugt
> (`event: schedule`, `total_count: 0`). Die Auslieferung während des
> Produktionsnachweises lief ausschließlich über **meine eigenen Pushes** — die
> erzeugen ein `push`-Ereignis, weil sie nicht mit `GITHUB_TOKEN` erfolgen.
>
> Damit ist die Brücke auf genau dieselbe Mechanik gebaut, die den Vorfall
> ausgelöst hat, und sie versagt aus demselben Grund. Der Wächter hat es
> gemeldet: *„Die Auslieferung ist 20 min hinter dem Repository."*
>
> **Jeder zero-cost-Auslöser in diesem Repository geht über GitHubs Zeitplan,
> und GitHubs Zeitplan ist das Problem.** Das ist kein Konstruktionsfehler mehr,
> den ich beheben könnte — es ist die objektive Grenze ohne das Token aus
> Eskalation 2. Sie teilt den Failure Mode, der den Vorfall ausgelöst hat — aber
sie ist ein **anderer** Workflow als der Taktgeber und fällt unabhängig aus. Ein
verpasster Takt kostet hier fünf Minuten Auslieferung statt einer Stunde
Datenstillstand. Der Taktgeber steht zusätzlich in der `workflow_run`-Liste, damit
der letzte Stand eines Blocks sicher hinausgeht.

---

## 11. Realtime: unverändert

Nicht angefasst: `worker/src/vu-live.mjs`, das Durable Object, der
Subscription Manager, der Client-Hub, die Source-State-Engine. Kein neuer
WebSocket-Dienst, kein zweites Durable Object.

Belegt funktionsfähig am 21.09.2026, 10:16:12 New York, gegen die veröffentlichte
Seite:

```
result PASS · realtimeVerified true
AAPL 41 Ticks (erster nach 249 ms) · NVDA 43 · MSFT 23 · PANW 8 · VLO 8
VLO: "Heute · Stand 10:10"  →  "Markt geöffnet · Live"   (SNAPSHOT → REALTIME)
```

Der Übergang SNAPSHOT → REALTIME ist damit **in Produktion mit echten Daten**
nachgewiesen — der Nachweis, der am 19.09. als „an einem geschlossenen Samstag
unmöglich" offen bleiben musste.

---

## 12. Wächter

`quant/engines/realtime/delivery-watchdog.js` + `scripts/market/assert-intraday-delivery.mjs`.

Er prüft nicht Schritte, sondern die Kette, und holt sich dafür **zwei** Stände:
was im Repository liegt und was der Browser bekommt. Ohne den zweiten Abruf meldete
er PASS, während ein Mensch Freitag sieht.

| Befund | Schweregrad |
|---|---|
| Markt offen, ausgelieferte Sitzung ≠ laufende | FAIL |
| kein Taktzyklus verzeichnet | FAIL |
| letzter Zyklus älter als 2 × Takt + Zuschlag | FAIL |
| Stand älter als 3 × Takt + Zuschlag | FAIL |
| Auslieferung auf anderer Sitzung als das Repository | FAIL |
| Auslieferung > 2 × Takt hinterher | FAIL |
| Takt verspätet / Stand älter als 2 × Takt / Zyklus fehlgeschlagen | WARNING |
| Auslieferung nicht gemessen | WARNING |

**Erster Produktionslauf, 14:55:54 UTC:** FAIL, `auslieferungZuWeitHinterher`,
*„Die Auslieferung ist 40 min hinter dem Repository."* Korrekt — und die Reparatur
sprang korrekt **nicht** an, weil ein Auslieferungsrückstand kein weiterer Abruf heilt.

### Drei Kontrollpfade — und die Lücke, die benannt bleibt

- **(a) im Taktgeber, nach jedem Zyklus.** Hängt nicht am Zeitplan, weil der Block
  bereits läuft. Findet alles außer: *es läuft gar kein Block.*
- **(b) eigener Workflow, alle 15 Minuten.** Mit **demselben** Failure Mode wie der
  ausgefallene Zeitplan. Das steht so in der Datei.
- **(c) Cloudflare-Wecker.** Der einzige wirklich unabhängige Pfad. Gebaut, getestet,
  nicht ausgerollt.

> **OWNER-ESKALATION 2:** Ein GitHub-Token mit `actions:write` (fine-grained PAT,
> nur dieses Repository) als Cloudflare-Secret `GITHUB_DISPATCH_TOKEN`. Damit
> schließt sich sowohl die Wächter-Lücke als auch die Auslieferungs-Brücke aus §10:
> ein Zyklus wird dann wieder ein Workflow-Lauf, und Pages feuert wie früher über
> `workflow_run`. Ohne dieses Token ist keine der beiden Lücken zero-cost
> schließbar.

---

## 13. Recovery

Ein Workflow kann mit `GITHUB_TOKEN` keinen anderen Workflow auslösen — GitHub
unterbindet das gegen Rekursion. Der Wächter kann den Taktgeber also **nicht wecken**.
Er tut deshalb das Ehrlichere: er holt **einen** Zyklus selbst nach.

- nur bei `keinZyklus`, `taktAusgefallen`, `falscheSitzung` — ein zu alter Stand,
  weil der Anbieter nichts liefert, ist mit einem weiteren Abruf nicht zu heilen
- **zweite Prüfung vor dem Holen**: meist hat sich die Lage inzwischen erledigt
- Concurrency-Gruppe `intraday-pacemaker`, gemeinsam mit dem Taktgeber — nie zwei
  Schreiber auf denselben Dateien
- der Cloudflare-Wecker prüft vor jedem Wecken, ob schon ein Block läuft (`WK-2`)

---

## 14. Concurrency

| | vorher | nachher |
|---|---|---|
| Gruppe | `intraday-snapshots` | `intraday-pacemaker` |
| `cancel-in-progress` | false | false |
| Folge | 4 von 5 Läufen am 18.09. `cancelled` | Nachfolger **wartet** und übernimmt nahtlos |
| Zweiter Schreiber | möglich | ausgeschlossen (Wächter-Reparatur teilt die Gruppe) |

Der Fünf-Minuten-Zeitplan von `intraday-snapshots.yml` ist entfernt; dort bleiben
der Universumslauf nach Schluss, der Handbetrieb und die Marke auf
Entwicklungsbranches. Zwei Workflows auf denselben Dateien wären ein Wettlauf um
denselben Ref.

---

## 15. Drei aufeinanderfolgende Produktionszyklen

Block `35618350851`, Lauf per `workflow_dispatch`, gemessen am 21.09.2026
(Quelle: `quant/data/market/intraday/pacemaker-ledger.json` und die
git-Commitzeiten auf `main`):

| | Zyklus 1 | Zyklus 2 | Zyklus 3 | Zyklus 4 |
|---|---|---|---|---|
| Auslöser (New York) | 11:21:43 | 11:26:51 | 11:31:59 | 11:37:07 |
| Provider-Abruf Beginn | 15:21:43 | 15:26:51 | 15:31:59 | 15:37:07 |
| Provider-Abruf Ende | 15:26:44 | 15:31:53 | 15:37:01 | 15:42:06 |
| **Abrufdauer** | **5:01** | **5:02** | **5:02** | **4:59** |
| Snapshot geschrieben | 505 | 492 | 489 | 491 |
| Anfragen | 527 | 527 | 527 | 527 |
| Commit | 15:26:45 | 15:31:53 | 15:37:01 | 15:42:06 |
| Push | 15:26:51 | 15:31:59 | — | — |
| Commit-SHA | `cdf73c142c` | `7d6ece858c` | `6a01740b96` | `8e1b…` |
| Wächter | FAIL | FAIL | — | — |

**Gemessener Takt: 5:08** (15:21:43 → 15:26:51 → 15:31:59 → 15:37:07).
Kein einziges GitHub-Zeitplan-Ereignis war dafür nötig.

Zum Vergleich der Takt VOR der Korrektur der Wartezeit-Regel: 14:53:36,
15:00:01, dann erst 15:10 — **rund zehn Minuten**.

Die leeren Felder in Zyklus 3 und 4 sind kein Fehler: ein Zyklus wird zweimal
ins Register geschrieben — vor dem Commit (damit er in demselben Commit landet
wie die Daten, die er beschreibt) und im nächsten Durchgang, wenn Commit-,
Push- und Wächterzeitpunkt feststehen. Die letzten beiden Zeilen holen das
beim jeweils folgenden Zyklus nach.

### Der Wächter sagt FAIL — und hat recht

```
checkedAt 2026-09-21T15:31:59Z · Markt OPEN · 11:31:59 New York
snapshotSession   2026-09-21   snapshotAgeMinutes   2
deliveredSession  2026-09-21   generatedAt          15:14:46
FAIL  auslieferungZuWeitHinterher - Die Auslieferung ist 20 min hinter dem Repository.
```

Die Daten im Repository sind zwei Minuten alt. Was der Browser bekommt, ist
zwanzig Minuten alt. **Die Datenfrische ist repariert, die Auslieferung nicht** —
und der Wächter verschweigt es nicht, sondern meldet es in jedem Zyklus.

## 16. Browser-Nachweis

Realtime Production Smoke, Lauf `35618520773`, 11:23:45 New York, gegen die
veröffentlichte Seite:

```
result PASS · realtimeVerified true · 14 von 14 Prüfungen

AAPL  35 Ticks · erster nach   249 ms · 33 Chart-Updates · REALTIME
NVDA  43 Ticks · erster nach   249 ms · 34 Chart-Updates · REALTIME
MSFT  23 Ticks · erster nach 1.999 ms · 22 Chart-Updates · REALTIME
      Etiketten: "Heute · Stand 11:10 · nicht aktuell"  →  "Markt geöffnet · Live"
```

MSFT hält den Übergang **SNAPSHOT → REALTIME** fest: die Seite zeigte zuerst
den ausgelieferten Snapshot samt ehrlichem „nicht aktuell", und nach knapp zwei
Sekunden übernahm der Strom. Kein Mock, echte Ticks, offene Sitzung.

Nebenbei belegt dasselbe Etikett den Befund aus §15 von der anderen Seite: um
11:23 trug die Seite den Stand von 11:10.

---

## 17. Zero-Cost-Nachweis

| | |
|---|---|
| `ZERO_COST_MODE` | HARD |
| `PAID_SERVICES_ENABLED` | 0 |
| Repository | **öffentlich** — Actions-Minuten unbegrenzt und kostenlos |
| Runner-Minuten je Sitzung | **390 statt 429** (78 Checkouts entfallen) |
| Cloudflare-Wecker | eigener Worker, kein DO, kein KV/R2/D1, kein `usage_model` |
| Wecker-Kontingent | 78 Auslösungen je Sitzung = 0,078 % von 100.000/Tag |
| Neue kostenpflichtige Dienste | keine |

Geprüft durch `PM-17`, `PM-18`, `WK-7`, `WK-8`, `WK-10`.

---

## 18. Tests

| Datei | Fälle | Deckt Auftrag §21 |
|---|---|---|
| `quant/tests/pacemaker.test.mjs` | 19 | 1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 18 |
| `quant/tests/delivery-watchdog.test.mjs` | 15 | 8, 11, 12, 13, 17, 19, 20 |
| `worker-waker/tests/waker.test.mjs` | 10 | 2, 15, 17, 18 |

Scharfe Regeln mit Gegenprobe: PM-3/PM-4, PM-10/PM-11, PM-12/PM-13,
WD-1/WD-2, WD-6/WD-7, WD-12/WD-13, WK-2/WK-3, WK-7/WK-10.

Bestehende Tests unverändert: 1297 quant-Tests grün.

---

## 19. Rollback

| Schritt | Wirkung |
|---|---|
| `intraday-pacemaker.yml` löschen oder Zeitplan entfernen | Taktgeber aus |
| in `intraday-snapshots.yml` `- cron: '*/5 13-21 * * 1-5'` wieder eintragen | alter Takt zurück |
| Zeitplan aus `pages-release.yml` entfernen | Brücke zurück |
| `worker-waker/` löschen | nie ausgerollt, keine Wirkung |

Alles in einem Commit reversibel. Keine Datenmigration, kein Schemawechsel,
keine geänderten Verträge.

---

## 20. Verbleibende echte Risiken

1. **Der externe Wecker fehlt.** Ohne ihn hängen sowohl der Rückfall-Wächter als
   auch die Auslieferungs-Brücke am selben Zeitplanmechanismus, der ausgefallen
   ist. Sie fallen unabhängig voneinander aus — das ist besser, aber nicht gut.
   (Eskalation 2)
2. **Der Fünf-Minuten-Takt ist nicht erreichbar**, solange das Providerlimit
   unbelegt ist. Der ehrliche Takt ist ~6:25. (Eskalation 1)
3. **Der Sitzungsbeginn bleibt dünn.** Kein Fix möglich — der Anbieter liefert
   nicht. Die Aktienseite überbrückt es über den Realtime-Strom, die
   Discover-Flächen nicht.
4. **Die Actions-Last anderer Workstreams bleibt.** Quant 2.0 und Social OS
   erzeugten am 21.09. 100 Push-Läufe in 92 Minuten. Der Taktgeber ist dagegen
   robuster, nicht immun.
5. **Ein Block kann sterben**, ohne dass jemand es merkt, bis das nächste
   stündliche Ereignis greift — bis zu einer Stunde. Genau die Lücke, die (c)
   schließen würde.
