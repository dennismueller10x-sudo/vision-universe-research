# Stock Page Session Truth: ein Quellzustand statt fünf verstreuter Flags

**Auftrag:** Owner Decision vom 19.09.2026 („P0 STOCK PAGE SESSION TRUTH FIX"),
nach dem Nebius-Befund vom 18.09.2026.
**Produktion:** `https://research.visionuniverse.de/discover/`
**Auslöser:** Screenshot vom iPhone, 22:08 deutscher Zeit = **16:08 New York**,
acht Minuten nach Handelsschluss: ein Chart, der um 15:50 endet, beschriftet
„Heute · Stand 15:50 · Schluss folgt", Fußnote „5-Minuten-Kurse".

---

## 1. Stop-Kriterien

| Kriterium | Stand | Beleg |
|---|---|---|
| SOURCE_STATE | **PASS** | `source-state.js`, vier Zustände, 18 Tests |
| CONSUMER_CLOSE_PRIORITY | **PASS** | `intraday-scope.js`, 5 Tests inkl. Vorfall + Gegenprobe |
| REGULAR_COMPLETE_TRUTH | **PASS** | `fetchedAfterClose` × `coversFinalSlot`; 1.157 Snapshots korrigiert |
| FINAL_SESSION | **PASS** | Production Proof, 6/6 Titel, `data-source-state="FINAL_SESSION"` |
| NBIS | **PASS** | „Heute · Schluss 16:00", vollständiger Verlauf, eingefroren |
| COVERAGE_SAMPLE | **PASS** | 17 Titel, 0 Befunde, `source-state-coverage.json` |
| ZERO_COST_MODE | **PASS** | HARD, `PAID_SERVICES_ENABLED = 0` |
| CRITICAL_BLOCKERS | **0** | — |

## 2. Root Cause — drei Ursachen, die zusammenfielen

**Kein Nebius-Problem.** NBIS ist sauber gemappt (`NBIS` → `ref_NBIS`, NASDAQ,
`product_eligibility: ELIGIBLE`), steht im Live-Scope der 519 Discover-Titel,
und für den Strom gibt es **keine Titel-Allowlist** — der Client abonniert das
Symbol, das die Seite zeigt. Kein Mapping-, Coverage- oder
Subscription-Problem. Zum Zeitpunkt des Screenshots war die Börse geschlossen;
es konnte per Vertrag keinen Strom geben.

Alle 519 Titel standen zu diesem Zeitpunkt auf `regularComplete: false`.

### 2.1 Die Prioritätsumkehr (die eigentliche Ursache)

Um **16:02 New York** — zwei Minuten nach der Glocke — entschied der
Intraday-Lauf `universe`, weil erst 519 von 6.876 Dateien der Sitzung vorlagen
(7,5 %):

```js
const deckung = sessionCoverage(session.sessionDate);   // 0,075
SCOPE = deckung < UNIVERSE_COVERAGE ? "universe" : "discover";
```

Der Universumslauf braucht ~70 Minuten, und die Concurrency-Gruppe stellte
jeden Fünf-Minuten-Lauf dahinter in die Warteschlange (Lauf 320 abgebrochen,
321 wartend). **Die 519 Titel, die auf Discover überhaupt sichtbar sind,
bekamen ihren Schlussstand als Letzte** — bis etwa 17:15.

Wartung am Gesamtuniversum ging vor der Frische dessen, was ein Mensch
anschauen kann.

### 2.2 `regularComplete` war eine Aussage über die Uhr

```js
var regularComplete = nowMs >= closeMs;
```

Nach 16:00 galt jeder Snapshot als komplett — auch einer, der um 15:50 endet.
Das Etikett hätte dann „Heute · Schluss 16:00" behauptet, eine **stärkere**
Unwahrheit als „Schluss folgt".

### 2.3 Der Zustand war nirgends explizit

Der sichtbare Status entstand aus fünf Größen — `freshnessState`, `isLive`,
`partial`, `streaming`, `regularComplete` —, und „5-Minuten-Kurse" stand in
Kopfzeile *und* Fußnote **unbedingt**, auch wenn der laufende Kurs den letzten
Punkt gesetzt hatte.

### 2.4 Eine Korrektur an meiner eigenen Analyse

Zwischendurch hatte ich gemeldet, 4.910 Titel behaupteten einen Schluss, den
ihre Reihe nicht trägt. **Das war falsch gelesen.** Die Bars sind auf den
Bar-**Anfang** gestempelt: eine volle Sitzung endet auf **15:55**, nicht auf
16:00 — der 16:00-Stempel gehört in die Nachbörse. NBIS hat 78 reguläre Bars
von 09:30 bis 15:55, exakt die 78 Slots einer vollen Sitzung. Ich hatte
`asOfLocal` verwendet, das die nachbörslichen Bars mitzählt.

Die ehrliche Zahl steht in §4.

## 3. Der Quellzustand

`quant/engines/realtime/source-state.js` leitet ab, was vorher verstreut war:

| Zustand | Bedingung | Consumer-Status |
|---|---|---|
| **REALTIME** | Börse offen **und** frischer Tick | „Markt geöffnet · Live" |
| **SNAPSHOT** | Börse offen, kein Tick, Snapshot im Takt | „Heute · Stand HH:MM" |
| **FINAL_SESSION** | Sitzung vorbei **und** nach Schluss geholt | „Heute · Schluss 16:00" |
| **STALE** | alles andere | ehrlich gekennzeichnet, nie final |

Drei Folgen:

- **„Schluss folgt" ist abgeschafft** (Regel 5/6). Ein geschlossener Markt ohne
  Abschluss ist STALE und heißt „Heute · Stand 15:50 · Schluss fehlt noch".
- **Die Quellenbezeichnung folgt dem Zustand** (Regel 2). Bei REALTIME steht
  „5-Minuten-Kurse, fortgeschrieben mit dem laufenden Kurs".
- Der Zustand steht als `data-source-state` im Markup, damit die QA ihn liest
  statt ihn aus Texten zu erraten.

## 4. `regularComplete` — Daten statt Uhr

Getrennt wird, was zwei verschiedene Dinge sind:

```
fetchedAfterClose   Die Abfrage lief NACH dem Schluss. Es kann keine
                    reguläre Bar mehr kommen.        (Tatsache über den Abruf)
coversFinalSlot     Die Reihe enthält den letzten Slot der Sitzung
                    (Schluss minus ein Intervall).   (Tatsache über die Daten)
regularComplete     Beides zusammen.
```

Damit bekommt ein illiquider Titel kein falsches „Schluss 16:00" — aber auch
kein ewiges STALE: es kommt ja nichts mehr. Er zeigt
**„Heute · Schluss · letzter Kurs 15:45"**.

**Migration ohne eine einzige Provider-Anfrage.** Die ausgelieferten Snapshots
stammen vom alten Code und sind durch die Unveränderlichkeitsregel eingefroren;
die fehlenden Felder stehen aber in den Dateien selbst.
`scripts/market/migrate-intraday-completeness.mjs` leitet sie ab:

```
Snapshots geprüft: 10.474
Felder ergänzt:    10.474
Davon verlieren den Anspruch "komplett": 1.157
  2026-09-17 AAAP:    letzter 15:50, Slot 15:55
  2026-09-17 ABR-P-D: letzter 15:30, Slot 15:55
  2026-09-17 ACGC:    letzter 10:55, Slot 15:55
```

Für den 18.09.: **4.633 vollständig, 567 abgeschlossen ohne späten Handel.**

## 5. Die Kadenz nach der Glocke

`quant/engines/realtime/intraday-scope.js`, als prüfbare Funktion statt als
Kommentar:

```
Börse offen                          -> discover
Börse zu, Discover unversiegelt      -> discover   (ZUERST)
Börse zu, versiegelt, Universum offen-> universe
Börse zu, versiegelt, Universum voll -> discover
```

Fünf Tests, darunter der Vorfall selbst (16:02, Universum bei 7,5 %,
unversiegelt → `discover`) und die Gegenprobe, dass ein unversiegelter Umfang
bei **keiner** Universumsdeckung auf `universe` kippt.

## 6. Regression

**18 Tests am Quellzustand**, an den Zeitpunkten des Auftrags: 15:50 und 15:55
vor Schluss, der Übergang, 16:01 mit unvollständigen Daten, vollständiger
Schluss, Realtime-Ausfall, Wochenende, Feiertag, verkürzte Sitzung.

Dazu die Gegenproben:

- jeder der vier Zustände kommt vor (nicht nur einer)
- „Markt geöffnet · Live" steht **nur** bei REALTIME
- „5-Minuten-Kurse" allein steht nur, wenn der Strom nichts beigetragen hat
- **SS-16**: `var regularComplete = nowMs >= closeMs;` darf nirgends mehr stehen
- **SS-17**: „Schluss folgt" darf nicht mehr im Code vorkommen
- **SS-18**: die Gegenprobe, dass die Kommentarentfernung in SS-17 keine
  Attrappe ist

SS-17 schlug beim ersten Lauf an — an meinen eigenen Kommentaren, in denen der
Satz zu Recht steht. Statt die Zusage zu lockern, entfernt der Test jetzt
Kommentare wirklich.

**IS3 wurde geschärft, nicht gelockert:** eine Reihe, die um 09:45 endet, ist
unveränderlich, aber nicht vollständig — plus die fehlende Hälfte, dass eine
Reihe bis zum letzten Slot wirklich vollständig ist.

Summen: **1.169 Quant-Tests, 226 Discover-Tests, 63.833 Verifier-Prüfungen.**

## 7. Coverage-Proof

`scripts/discover/assert-source-state-coverage.mjs` fragt die Engine, die die
Oberfläche speist. Der erste Lauf war zu schwach: die Stichprobe enthielt nur
vollständige Titel, die schärfste Prüfung löste nie aus. **Eine Prüfung, die
nie auslöst, beweist nichts über sich selbst.** Jetzt wird ein unvollständiger
Titel aus den Daten gesucht und zur Pflicht gemacht.

```
NBIS   FINAL_SESSION  15:55  voll  "Heute · Schluss 16:00"
AAPL   FINAL_SESSION  15:55  voll  "Heute · Schluss 16:00"
NVDA   FINAL_SESSION  15:55  voll  "Heute · Schluss 16:00"
MSFT   FINAL_SESSION  15:55  voll  "Heute · Schluss 16:00"
PANW   FINAL_SESSION  15:55  voll  "Heute · Schluss 16:00"
VLO    FINAL_SESSION  15:55  voll  "Heute · Schluss 16:00"
ATHS   FINAL_SESSION  15:45  teil  "Heute · Schluss · letzter Kurs 15:45"
+ 10 zufällige (deterministisch gezogen)

Urteil: PASS — 17 Titel, 0 Befunde, kein stiller Rückfall
```

## 8. Production Proof

Lauf **35423365022**, `2026-09-19T05:14:10Z` = **01:14 New York**, Markt
geschlossen, echter Browser, veröffentlichte Seite:

```
NBIS   FINAL_SESSION   "Heute · Schluss 16:00"
AAPL   FINAL_SESSION   "Heute · Schluss 16:00"
NVDA   FINAL_SESSION   "Heute · Schluss 16:00"
MSFT   FINAL_SESSION   "Heute · Schluss 16:00"
PANW   FINAL_SESSION   "Heute · Schluss 16:00"
VLO    FINAL_SESSION   "Heute · Schluss 16:00"

ok  keinStromBeiGeschlossenerBoerse   ok  quellzustandGesetzt
ok  snapshotBeiGeschlossenerBoerse    ok  finalOderEhrlichStale
ok  keinLiveBeiGeschlossenerBoerse    ok  keineVertroestung
ok  keineFehler   ok  abrissGemeldet   ok  chartBleibt

Ergebnis: UNKNOWN (marketClosed:CLOSED), realtimeVerified: false
```

Genau die Seite, auf der der Eigentümer „Stand 15:50 · Schluss folgt" gelesen
hat, zeigt den vollständigen, eingefrorenen Verlauf.

Das Urteil lautet **UNKNOWN, nicht PASS**: der Lauf hat die Realtime-Zusage
nicht geprüft und sagt das, statt es zu verschweigen.

## 9. Was heute nicht bewiesen werden konnte

**SNAPSHOT → REALTIME → FINAL_SESSION** ist heute nicht nachweisbar — es ist
Samstag, die Börse ist geschlossen. Der Auftrag verbietet ausdrücklich, das
durch Mock-Daten zu ersetzen, und das ist hier auch nicht geschehen: der
Deckungsnachweis lief ohne Strom und vermerkt das in seinem eigenen Bericht.

Dieser Nachweis bleibt offen und gehört an den nächsten regulären Handelstag
(Montag, 21.09.2026). Der Rauchtest trägt die Zusagen dafür bereits.

## 10. Was nicht angefasst wurde

Zero-Cost-Realtime-Architektur unverändert. Cloudflare nicht ersetzt. Keine
Paid Services. V4.1-Design unverändert — keine Zeile an Layout, Farben oder
Aufbau. Fundamentals, Quant und SEC nicht berührt.
