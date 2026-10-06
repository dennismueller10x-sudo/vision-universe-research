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
  ausgerollt.

> **OWNER-ESKALATION 2 — beantwortet am 21.09.2026.** Die ursprüngliche Bitte
> lautete auf ein persönliches Token mit `actions:write`. Der Eigentümer hat
> stattdessen eine **GitHub App** angelegt (App ID 5023229, installiert auf genau
> diesem Repository, Berechtigung *Actions: read and write*) — die bessere Antwort:
> ein PAT hängt an einem Menschen und gilt bis zum Widerruf, ein
> Installationstoken gehört einer Sache und gilt eine Stunde.
>
> Offen bleibt genau ein Schritt, den nur der Eigentümer tun kann: den privaten
> Schlüssel einmalig als Cloudflare-Secret `GITHUB_APP_PRIVATE_KEY` hinterlegen.
> Er läuft dabei **nicht** durch GitHub Actions — siehe §12a.

---

### 12a. Wie der Wecker sich ausweist

```
Privater Schluessel  (Cloudflare-Secret, verlaesst den Worker nie)
   -> JWT, RS256, gueltig 9 Minuten (iat -60 s gegen Uhrendrift)
   -> GET  /repos/{repo}/installation          -> Installation ID
   -> POST /app/installations/{id}/access_tokens -> Token, 1 Stunde
   -> POST /repos/{repo}/actions/workflows/intraday-pacemaker.yml/dispatches
   -> die bestehende Pipeline, unveraendert
```

Drei Entscheidungen, die nicht offensichtlich sind:

**Die Installation ID wird ermittelt, nicht konfiguriert.** Ein Aufruf gegen
`GET /repos/{repo}/installation` liefert sie. Ein weiterer Wert von Hand wäre
ein weiterer Wert, der falsch sein kann — und der beim Neuinstallieren der App
still veraltet. Fällt der Tokentausch fehl, wird die gemerkte ID verworfen,
statt bei jedem weiteren Takt an demselben alten Wert zu scheitern.

**`workflow_dispatch`, nicht `repository_dispatch`.** Der Taktgeber hört auf
beides, aber die Wahl fällt nach der Berechtigung, nicht nach Geschmack:

| Eingang | verlangt |
|---|---|
| `POST /repos/{repo}/dispatches` | **Contents: write** |
| `POST /repos/{repo}/actions/workflows/{x}/dispatches` | **Actions: write** |

Die App hat Actions read and write und sonst nichts. Über `repository_dispatch`
bekäme sie bei jedem Takt ein 403 — ein ausgerollter, tickender Wecker, der
nichts auslöst. Das fällt in keinem Einheitstest auf, in dem der Dispatch nur
„ok" antwortet; deshalb steht die Wahl des Eingangs als Test fest (WK-19).

**Beide PEM-Formate werden gelesen.** GitHub liefert PKCS#1
(`BEGIN RSA PRIVATE KEY`), WebCrypto liest nur PKCS#8. Statt den Eigentümer zu
einer `openssl`-Umwandlung zu zwingen — ein Schritt mehr, bei dem eine zweite
Kopie des Schlüssels auf der Platte liegen bleibt — legt der Worker die
PKCS#8-Hülle selbst herum. Das ist reine DER-Verpackung, keine Kryptografie.
WK-12 beweist es von der harten Seite: beide Wege, derselbe Zeitstempel,
**bytegleiche Signatur**.

**Der Schlüssel berührt GitHub nie.** Der frühere Deploy-Workflow reichte ein
PAT aus einem GitHub-Secret nach Cloudflare weiter. Dieser Schritt ist
ersatzlos entfernt. Ein Schlüssel, der durch einen Actions-Lauf läuft,
existiert danach an drei Orten statt an einem. Der Workflow rollt jetzt aus und
sieht **nach**, ob das Secret bei Cloudflare liegt (`wrangler secret list` nennt
Namen, nie Werte) — hinterlegt wird es vom Eigentümer direkt.

---

### 12b. Der gemessene Befund zur Auslieferung, und was daraus folgte

Am 21.09.2026 um 17:22:33 UTC, mit dem vom Wecker gestarteten Block im
Betrieb, urteilte der Wächter gegen die veröffentlichte Seite:

```
Intraday-Auslieferung · 13:22:33 New York · OPEN
  erwartete Sitzung   2026-09-21
  im Repository       2026-09-21  (3 min alt)
  ausgeliefert        2026-09-21
  letzter Zyklus      vor 6 min

  FAIL    Die Auslieferung ist 15 min hinter dem Repository.
```

**Die Daten waren drei Minuten alt. Was der Browser bekam, war fünfzehn
Minuten alt.** Der Takt war repariert, die Auslieferung nicht — und zwar
als einziger verbleibender Punkt der Kette.

Warum: ein Push mit `GITHUB_TOKEN` erzeugt keinen Workflow-Lauf
(Rekursionsschutz), und `workflow_run` feuert erst bei `completed` — ein
Block, der den Takt fünf Stunden hält, ist fünf Stunden lang nicht
completed. Die Zwischenlösung war ein `*/5`-Zeitplan, also genau der
Mechanismus, dessen Ausfall den Vorfall ausgelöst hat; er hat während
des Nachweises **kein einziges Mal** gefeuert (`event: schedule`,
`total_count: 0`).

Mit der App lag die Lösung bereits vor: derselbe Wecker, dieselbe
`Actions: write`-Berechtigung, derselbe `workflow_dispatch` — nur auf
`pages-release.yml` statt auf den Taktgeber. **Kein neuer Dienst, keine
zweite Pipeline, kein zusätzliches Recht.** WK-23 prüft das von der
harten Seite: keine `Contents`-Aufrufe, kein `repository_dispatch` —
sonst müsste der Eigentümer die App nachkonfigurieren, ohne es zu
merken.

Gegen den Stau: läuft oder **wartet** schon ein Pages-Lauf, wird nichts
angestoßen. Die Gruppe `pages-production` lässt ohnehin nur einen
zugleich zu; ohne diese Prüfung entstünde eine Warteschlange, die den
Stand älter macht statt frischer — an diesem Tag brauchte ein gestauter
Pages-Lauf 7:33 statt 97 Sekunden. WK-21 prüft beide Zustände. Und ein
gescheitertes Wecken hält die Auslieferung nicht auf (WK-22): auch wenn
der Takt nicht anspringt, kann ein frisch geschriebener Stand dastehen,
der nur noch ausgeliefert werden muss.

---

### 12c. Produktionsnachweis der App-Authentifizierung (21.09.2026)

**Der Schlüssel liegt bei Cloudflare.** Zwei unabhängige Belege im selben
Lauf (`35632934608`): `wrangler secret list` nennt `GITHUB_APP_PRIVATE_KEY`,
und der Zustandspunkt des Weckers sagt dasselbe — `ausweis: github-app`,
`appIdHinterlegt: true`, `schluesselHinterlegt: true`, und nichts darüber
hinaus.

**Der erste Takt, den nicht ich ausgelöst habe.** Um 17:09:11 wurde der bis
dahin laufende, von Hand gestartete Block abgebrochen. Um **17:10:46** legte
GitHub Lauf `35630336530` an:

```
event:            workflow_dispatch
actor:            vision-universe-automation[bot]   (App ID 332136878)
triggering_actor: vision-universe-automation[bot]
```

Nicht `dennismueller10x-sudo`. Damit ist die ganze Kette belegt — ohne
gültiges JWT gäbe es keine Installation, ohne Installation kein Token, ohne
Token keinen Dispatch, und ohne Dispatch keinen Lauf.

**Drei aufeinanderfolgende echte Cron-Takte**, mitgehört an der Quelle
(`wrangler tail`, Lauf `35632934608`, 17:35:46 – 17:52:46):

```
Ereignisse des Weckers: bereitsWach, ausgeliefert, bereitsWach,
                        ausgeliefert, bereitsWach, ausgeliefert
Zeilen mit Cron-Ausloeser: 3   ("cron": "*/5 13-21 * * 1-5")
Takte: 3 · in Ordnung: 6 · Fehlerereignisse: 0
BESTANDEN
```

`bereitsWach` ist dabei mehr, als es klingt: um es überhaupt sagen zu
können, muss der Wecker ein JWT signiert, die Installation ermittelt, ein
Token geholt und damit die Actions-API gelesen haben. Drei Takte, drei Mal
vollständige Kette, null Fehlerereignisse. Dass kein `installationErmittelt`
mehr auftaucht, ist der Zwischenspeicher: Token und Installation werden
wiederverwendet, solange sie gelten (WK-15).

**Dreizehn aufeinanderfolgende Zyklen** aus diesem von Cloudflare
gestarteten Block:

| Zyklus | Beginn (UTC) | Ende | Snapshots | Takt |
|---|---|---|---|---|
| 1 | 17:11:18 | 17:16:19 | 498 | — |
| 2 | 17:16:21 | 17:21:23 | 480 | 5:04 |
| 3 | 17:21:25 | 17:26:26 | 486 | 5:04 |
| 4 | 17:26:32 | 17:31:34 | 494 | 5:08 |
| 5 | 17:31:41 | 17:36:43 | 490 | 5:09 |
| 6 | 17:36:49 | 17:41:50 | 480 | 5:08 |
| 7 | 17:41:52 | 17:46:54 | 489 | 5:03 |
| 8 | 17:46:56 | 17:51:57 | 485 | 5:03 |
| 9 | 17:51:59 | 17:57:01 | 491 | 5:03 |
| 10 | 17:57:03 | 18:02:04 | 486 | 5:04 |
| 11 | 18:02:10 | 18:07:12 | 488 | 5:08 |
| 12 | 18:07:14 | 18:12:15 | 490 | 5:03 |
| 13 | 18:12:22 | 18:17:24 | 487 | 5:08 |

**Die Kette, Ende zu Ende:**

```
17:55:34  PASS      im Repository 6 min alt · letzter Zyklus vor 9 min
18:06:55  WARNING   "Letzter Taktzyklus vor 10 min"  -> Messfehler, siehe unten
18:16:26  PASS      im Repository 6 min alt · letzter Zyklus vor 4 min
```

Die WARNING dazwischen war **kein Produktionsbefund, sondern mein eigener
Messfehler**: der Wächter zählte ab dem Beginn des letzten Zyklus, verglich
aber mit dem Abstand zwischen zwei Beginnen. Ein Zyklus beginnt alle 5:04
und dauert 5:02 — das Alter pendelt dadurch zwischen 0 und gut zehn
Minuten, die Schwelle liegt bei neun. Etwa jede fünfte Messung hätte
grundlos angeschlagen. Gemessen wird jetzt ab dem **Ende** eines Zyklus;
WD-16 bis WD-19 halten die Regel samt Gegenproben fest.

**Browser**, Realtime Production Smoke `35635434172`, 14:00 New York:

```
PASS · 14 von 14 · realtimeVerified true
AAPL 28 Ticks   "Heute · Stand 13:45 · nicht aktuell"  ->  "Markt geoeffnet · Live"
MSFT 16 Ticks   "Heute · Stand 13:55"                  ->  "Markt geoeffnet · Live"
PANW  8 Ticks   "Heute · Stand 13:50"                  ->  "Markt geoeffnet · Live"
NVDA 38 Ticks   "Markt geoeffnet · Live"
VLO   4 Ticks   "Markt geoeffnet · Live"
```

Die Etiketten sind hier der eigentliche Beleg: „Stand 13:55" bei einem Lauf
um 14:00 ist ein fünf Minuten alter, ausgelieferter Stand. Am Vormittag, vor
der Ergänzung, trug dieselbe Seite um 11:23 den Stand von 11:10.

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

Der Auftrag verlangt drei. Gemessen wurden fünf, ohne Unterbrechung, in
einem einzigen Block `35618350851` (`workflow_dispatch`, 21.09.2026).
Quellen: `quant/data/market/intraday/pacemaker-ledger.json` und die
git-Commitzeiten auf `main`.

| | Zyklus 1 | Zyklus 2 | Zyklus 3 | Zyklus 4 | Zyklus 5 |
|---|---|---|---|---|---|
| Abruf Beginn (UTC) | 15:21:43 | 15:26:51 | 15:31:59 | 15:37:04 | 15:42:08 |
| New York | 11:21:43 | 11:26:51 | 11:31:59 | 11:37:04 | 11:42:08 |
| Abruf Ende | 15:26:45 | 15:31:53 | 15:37:02 | 15:42:06 | 15:47:10 |
| **Abrufdauer** | **5:02** | **5:02** | **5:02** | **5:02** | **5:02** |
| Snapshots geschrieben | 505 | 492 | 489 | 491 | 488 |
| Anfragen | 527 | 527 | 527 | 527 | 527 |
| Commit | 15:26:45 | 15:31:54 | 15:37:02 | 15:42:06 | 15:47:10 |
| Push | 15:26:51 | 15:31:59 | 15:37:04 | 15:42:08 | 15:47:12 |
| Commit-SHA | `4104115f79` | `537db1d2bf` | `6a01740b96` | `a0f5b82c5b` | `5e2498a498` |

**Gemessener Takt: 5:08 · 5:08 · 5:05 · 5:04.** Kein einziges
GitHub-Zeitplan-Ereignis war dafür nötig — ein Lauf hält den Takt selbst.

Zum Vergleich der Takt VOR der Korrektur der Wartezeit-Regel: 14:53:36,
15:00:01, dann erst 15:10 — **rund zehn Minuten**. Und davor, im alten
Zustand: zwischen 13:09 und 14:13 UTC überhaupt kein Lauf.

Der Abstand von 5:08 statt 5:00 ist kein Schlupf, sondern die Rechnung:
der Abruf braucht 5:02 (527 Titel bei höchstens 100 Anfragen je Minute,
§8), Commit und Push brauchen die restlichen sechs Sekunden. Die
Wartezeit-Regel wartet dann null Sekunden, weil der Zyklus länger
gedauert hat als das Intervall — schneller geht es nicht, solange die
Anbietergrenze nicht belegt höher liegt (Owner Escalation 1).

### Die Kette, Ende zu Ende gemessen

Die drei Wächterläufe am Ende des Blocks messen nicht die Daten, sondern
den Weg vom Repository in den Browser:

```
15:42:07  FAIL     auslieferungZuWeitHinterher · 30 min hinter dem Repository
15:47:52  FAIL     auslieferungZuWeitHinterher · 35 min hinter dem Repository
15:50:21  WARNING  auslieferungHinterher       · 10 min hinter dem Repository
```

Dazwischen liegt Pages-Lauf `35620629344` (Kopf `6a01740b96`, Zyklus 3),
angelegt 15:41:19, **fertig 15:48:52** — 7:33 statt der üblichen ~97
Sekunden, weil die Gruppe `pages-production` verstopft war. Der Wächter
um 15:47:52 lief sechsundzwanzig Sekunden davor und meldete deshalb noch
FAIL. Das ist kein Messfehler, sondern genau die Trennschärfe, die §16
verlangt: der Wächter urteilt über den Zustand, den der Browser in diesem
Moment sieht, nicht über den, der gleich kommt.

Die letzte Messung, gegen die frisch ausgelieferte Seite:

```
Intraday-Auslieferung · 11:50:21 New York · OPEN
  erwartete Sitzung   2026-09-21
  im Repository       2026-09-21  (5 min alt)
  ausgeliefert        2026-09-21
  letzter Zyklus      vor 8 min

  WARNING Die Auslieferung ist 10 min hinter dem Repository.

URTEIL: WARNING
```

Damit ist die Kette **Provider → Ingest → Commit → Push → Pages →
Browser** zum ersten Mal an diesem Tag geschlossen und in einer Zahl
gemessen: zehn Minuten. Die Hälfte davon ist der Takt selbst (ein
Zyklus ist im Mittel 2:30 alt, wenn man ihn abfragt), die andere Hälfte
die Pages-Auslieferung.

WARNING statt PASS heißt: die Seite zeigt die richtige Sitzung und einen
ehrlich datierten Stand, aber sie liegt weiter hinter dem Repository als
das Ziel von §22. Solange der automatische Auslöser fehlt (Owner
Escalation 2), bleibt das so — und der Wächter sagt es in jedem Lauf,
statt es zu verschweigen.

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

**Ausgerollt am 21.09.2026, 15:59 UTC** (Lauf `35622518554`):

```
Uploaded vu-intraday-waker (1.21 sec) · 3,09 KiB · Startzeit 2 ms
Deployed vu-intraday-waker triggers · schedule: */5 13-21 * * 1-5
Bindings: env.GITHUB_REPO (Umgebungsvariable)  — mehr nicht
Schritt "Token hinterlegen": entfernt (der Schluessel laeuft nicht durch Actions)
Schluesselpruefung: 24.711 Dateien, 0 Funde
```

Der Wecker läuft und tickt. Er meldet bei jedem Takt `keinSchluessel` und
löst nichts aus, bis der Eigentümer den App-Schlüssel hinterlegt (§12a) — er
fällt nicht still aus, sondern laut. Ein zweiter Worker neben `vu-live`;
`vu-live` selbst wurde nicht angefasst.

Geprüft durch `PM-17`, `PM-18`, `WK-7`, `WK-8`, `WK-10`.

---

## 18. Tests

| Datei | Fälle | Deckt Auftrag §21 |
|---|---|---|
| `quant/tests/pacemaker.test.mjs` | 20 | 1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 18 |
| `quant/tests/delivery-watchdog.test.mjs` | 15 | 8, 11, 12, 13, 17, 19, 20 |
| `worker-waker/tests/waker.test.mjs` | 10 | 2, 15, 17, 18 |
| `quant/tests/intraday-delivery-contract.test.mjs` | 12 | 7, 9, 10, 16 — und ID-10 prüft, dass **jeder** der zwanzig Fälle einen benannten Test hat |
| **Summe neu** | **66** | |

Die neun zusätzlichen Fälle (WK-11 bis WK-19) prüfen die
GitHub-App-Authentifizierung: JWT-Struktur und **nachgerechnete** Signatur,
beide PEM-Formate mit bytegleichem Ergebnis, abgewiesener Murks, Ermittlung der
Installation ID, Wiederverwendung und Erneuerung des Tokens, ein eigener Name
für jede der sechs Bruchstellen, kein Schlüsselmaterial in Protokoll oder
Statuspunkt, und der Eingang, der zur vergebenen Berechtigung passt.

Scharfe Regeln mit Gegenprobe: PM-3/PM-4, PM-10/PM-11, PM-12/PM-13,
WD-1/WD-2, WD-6/WD-7, WD-12/WD-13, WK-2/WK-3, WK-7/WK-10, WK-12/WK-13,
ID-2/ID-2b.

**Gesamtlauf `node --test quant/tests/*.test.mjs` auf dem Stand dieses
Berichts: 1320 Tests, 1315 grün, 5 rot.** Die fünf roten sind nicht aus
diesem Auftrag und wurden nicht angefasst:

```
529  real observations reproduce two known MSFT rule transitions …
534  approved scope is preserved and denied raw display prevents history reads
535  overflow, insufficient comparison history and pre-close snapshots fail closed
536  unavailable coverage retains the requested company identity
637  canonical product universe projects the full capability set …
```

Sie stammen aus `market-signal-contract.test.mjs` und
`product-services.test.mjs` und waren bereits auf `2cb2c99062` rot — dem
letzten Quant-2.0-Commit **vor** dieser Arbeit. Nachgewiesen über einen
Arbeitsbaum auf genau diesem Commit. Sie gehören dem Quant-2.0-Strang;
dort zu reparieren wäre ein Eingriff in einen fremden Workstream.

---

## 19. Rollback

| Schritt | Wirkung |
|---|---|
| `intraday-pacemaker.yml` löschen oder Zeitplan entfernen | Taktgeber aus |
| in `intraday-snapshots.yml` `- cron: '*/5 13-21 * * 1-5'` wieder eintragen | alter Takt zurück |
| Zeitplan aus `pages-release.yml` entfernen | Brücke zurück |
| `npx wrangler delete` im Ordner `worker-waker/` | Wecker weg; `vu-live` unberührt |
| `worker-waker/` löschen | entfernt den Bauplan; der ausgerollte Worker bleibt, bis er geloescht wird |

Alles in einem Commit reversibel. Keine Datenmigration, kein Schemawechsel,
keine geänderten Verträge.

---

## 20. Verbleibende echte Risiken

1. ~~Dem Wecker fehlt das Token.~~ **Erledigt am 21.09.2026.** Der Eigentümer
   hat eine GitHub App angelegt und ihren privaten Schlüssel als
   Cloudflare-Secret hinterlegt; der Wecker startet seither den Takt und stößt
   die Auslieferung an, beides über `Actions: write`. Nachgewiesen in §12c.
   Was bleibt: der externe Puls ist jetzt ein **einzelner**. Fällt Cloudflare
   aus, greift der stündliche GitHub-Zeitplan als Rückfallebene — eine Lücke
   von bis zu einer Stunde statt einer unbegrenzten.

2. **Der Fünf-Minuten-Takt ist nicht erreichbar**, solange das Providerlimit
   unbelegt ist. Der gemessene ehrliche Takt ist 5:04 bis 5:08 — der Abruf
   allein braucht 5:02 bei 527 Titeln und höchstens 100 Anfragen je Minute.
   Näher als acht Sekunden kommt man dem Ziel nicht, ohne die Grenze zu
   belegen. (Eskalation 1)
3. **Der Sitzungsbeginn bleibt dünn.** Kein Fix möglich — der Anbieter liefert
   nicht. Die Aktienseite überbrückt es über den Realtime-Strom, die
   Discover-Flächen nicht.
4. **Die Actions-Last anderer Workstreams bleibt.** Quant 2.0 und Social OS
   erzeugten am 21.09. 100 Push-Läufe in 92 Minuten. Der Taktgeber ist dagegen
   robuster, nicht immun.
5. **Ein Block kann sterben**, ohne dass jemand es merkt, bis das nächste
   stündliche Ereignis greift — bis zu einer Stunde. Genau die Lücke, die (c)
   schließen würde.
