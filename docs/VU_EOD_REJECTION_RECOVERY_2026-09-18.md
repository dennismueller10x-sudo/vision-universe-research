# EOD-Freshness: Ursache, Wiederherstellung, Wächter

**Auftrag:** Owner-Entscheidung vom 18.09.2026, „P0 DATA FRESHNESS RECOVERY —
EOD REJECTION CHECKPOINT". Eigener Recovery-Loop, getrennt vom V4.1-Release.
**Betroffen:** Tageskurse (EOD) des Produktuniversums.
**Nicht betroffen und nicht angefasst:** Intraday, Realtime, Fundamentals,
V4.1-Oberfläche.

---

## 1. Was passiert ist

| Zeitpunkt | Ereignis |
|---|---|
| **15.09.2026** | Letzter Lauf, der Tageskurse übernommen hat. Stand der Reihen: `2026-09-15`. |
| **16.09.2026, 22:41 UTC** | Abendlauf. Für jeden Titel steht genau **eine** neue Bar zur Verfügung — der Schluss des Tages. Die Qualitätsprüfung verlangt mindestens zwei Bars. **6.831 von 6.876 Titeln werden mit `too_few_bars` abgelehnt**, jede Ablehnung sperrt ihren Titel sieben Tage. |
| **17.09.2026** | Der Lauf überspringt die gesperrten Titel, holt 45, meldet **Erfolg**. |
| **17.09.2026, 23:21 UTC** | Der Freshness-Monitor schlägt an: „Tageskurse STALE: asOf 2026-09-15, erwartet 2026-09-17". Der Monitor ist rot, der Datenlauf grün. |
| **18.09.2026, 05:13 UTC** | Mein manueller Recovery-Versuch: derselbe Lauf, dasselbe Ergebnis — 45 geholt, 6.831 übersprungen, 90 Byte empfangen. Die Sperre, nicht das Kontingent, war der Grund. |

Dazwischen wurden der **16. und der 17.09. gehandelt**. Die Oberfläche hat
nichts Falsches behauptet — der Freshness-Vertrag schrieb „Schluss Di.,
15.09. · nicht aktuell" —, aber sie zeigte zwei Sitzungen alte Kurse.

## 2. Der Beleg

Nicht erschlossen, sondern nachgelesen: `quant/data/market/tiingo-status.json`
führt jeden Titel einzeln.

```
securities: 6876
  "qualityCheckFailed (deferred)": 6831
  "keineNeuenTage":                  45

Beispiel: {"ticker":"A","ok":false,"reason":"qualityCheckFailed","deferred":true,
           "message":"too_few_bars","rejectedAt":"2026-09-16T22:41:11.004Z"}
```

**Ein einziger Code. Eine einzige Minute. 6.831 Titel.** Ein Ereignis, kein
Dauerzustand — und kein einziger dieser Titel war „kaputt".

## 3. Die Ursache

`scripts/market/ingest-tiingo.mjs` holt inkrementell: ab dem Tag nach der
letzten gespeicherten Bar. An einem normalen Handelstag ist das **genau eine
Bar**. Die Prüfung (`quant/engines/market-quality.js`, `minBars: 2`) lehnt
eine einzelne Bar ab — zu Recht: an einer einzelnen Bar lässt sich weder
Reihenfolge noch Lücke noch Split prüfen.

Der **strikte EOD-Pfad** löste das längst. Er stellt die letzte
*gespeicherte* Bar als Anschluss vor das neue Material:

```js
const validationInput = STRICT_INCREMENTAL ? [...store.readBars(id).bars.slice(-1), ...bars] : bars;
//                      ^^^^^^^^^^^^^^^^^^ nur hier - und genau das war die Lücke
```

Der **reguläre Pfad** tat es nicht. Deshalb konnte ein ganz normaler
Dienstagabend das ganze Universum sperren.

Zwei Dinge kamen zusammen, und erst zusammen ergaben sie den Stillstand:

1. Eine Ablehnung, die das **Abfragefenster** beschreibt, wurde wie ein
   Befund über das **Instrument** behandelt.
2. Die Sperre war eine feste Zahl — sieben Tage, unabhängig von der Ursache.

## 4. Klassifikation der 6.831 (die sechs Fragen des Owners)

| Frage | Antwort |
|---|---|
| **1. Warum ursprünglich abgelehnt?** | Alle 6.831 mit `too_few_bars`: der inkrementelle Abruf lieferte eine einzelne Bar. |
| **2. Welche Gründe sind permanent?** | **Keiner davon.** Strukturell wären `insufficient_history`, `unknown_security`, `not_supported` — und auch die erst nach Bestätigung. |
| **3. Welche sind temporär?** | Alle 6.831. |
| **4. Welche entstanden nur aus einem früheren Daten-/Provider-/Qualitätszustand?** | Alle 6.831 — genauer: aus dem Abfragefenster, nicht einmal aus den Daten. |
| **5. Wann zuletzt geprüft?** | 16.09.2026, 22:41 UTC. Seitdem **kein einziges Mal** — die Sperre lief bis zum 23.09. |
| **6. Warum verhindert sie heute den Abruf?** | Die Prüfung stand **vor** der Anfrage: `rejected[id]` jünger als sieben Tage → `continue`, ohne Provider-Kontakt. |

## 5. Die neue Ordnung

`quant/engines/rejection-lifecycle.js` — eine Ablehnung wird nach ihrer
Ursache behandelt, nicht nach einer Zahl:

| Klasse | Wann | Frist bis zum nächsten Versuch |
|---|---|---|
| **TEMPORARY_REJECT** (Fensterartefakt) | `too_few_bars` aus einem inkrementellen Abruf | **0** — der nächste Lauf fragt sofort wieder |
| **TEMPORARY_REJECT** | Anbieter-, Daten- oder Qualitätszustand | 20 h; bei Wiederholung derselben Ursache verdoppelnd, **höchstens 7 Tage** |
| **PERMANENT_REJECT** | strukturell ungeeignet, **mindestens zweimal bestätigt** | 30 Tage — kein täglicher Versuch, aber auch kein Ausschluss auf Dauer |
| **STALE_REJECT** | Ablehnung älter als ihre Frist | sofort neu prüfen |
| **RECOVERED** | Titel liefert wieder gültige Daten | Eintrag verschwindet, normaler Tageslauf |

Drei Regeln, die daraus folgen und die es vorher nicht gab:

* **Kein Titel bleibt dauerhaft ausgeschlossen**, weil ein Lauf ihn einmal
  abgelehnt hat. Auch PERMANENT läuft ab.
* **Eine einzelne Messung macht kein Instrument ungeeignet** — strukturell
  gilt erst ab der zweiten Bestätigung derselben Ursache.
* **Wer sich erholt, wird freigegeben**: ein erfolgreicher Abruf löscht den
  Eintrag, statt ihn stehen zu lassen.

## 6. Der Root-Cause-Fix

Der reguläre Pfad stellt jetzt denselben Anschluss voran wie der strikte.
Die gespeicherte Bar wird **weder neu geholt noch verändert** — sie ist
Beleg, nicht Zulieferung, und wird vor dem Zusammenführen wieder entfernt.
Liefert der Anbieter sie mit (inklusives `startDate`), wird die
Überschneidung verworfen, bevor geprüft wird.

Das ist **strenger** als vorher: der neue Tag muss jetzt an den Bestand
anschließen — Reihenfolge, Lücke, Split werden wirklich geprüft, statt an
„zu wenig Material" zu scheitern.

## 7. Der Wächter

`scripts/market/assert-daily-lifecycle-health.mjs`, Regel aus
`quant/engines/daily-lifecycle-health.js`:

| Zustand | Bedingung |
|---|---|
| **PASS** | ≥ 90 % des Universums wirklich geprüft **und** Tageskurse auf der letzten abgeschlossenen Sitzung |
| **WARNING** | 60–90 % geprüft, oder eine Sitzung Rückstand, oder kein lesbarer Datenstand |
| **FAIL** | < 60 % geprüft, **oder** ≥ 2 Sitzungen Rückstand, **oder** mehr als die Hälfte des Universums im Ablehnungsregister |

**Zurückgestellte Titel zählen ausdrücklich nicht als geprüft** — genau ihr
stilles Verschwinden war der Fehler.

Auf dem Stand vor der Wiederherstellung:

```
  Universum:            6876
  geprueft:             45 (1 %)
  zurueckgestellt:      6831
  Tageskurse Stand:     2026-09-15  erwartet 2026-09-17
  Sitzungen zurueck:    2

  - nur 45 von 6876 Titeln geprueft (1 %), 6831 zurueckgestellt
  - Tageskurse 2 Sitzungen zurueck (Stand 2026-09-15, erwartet 2026-09-17)

URTEIL: FAIL
```

Der Wächter läuft im Refresh-Workflow mit `--strict`: ein Lauf wie der vom
17.09. kann nicht mehr grün melden.

## 8. Tests

| Datei | Inhalt |
|---|---|
| `quant/tests/rejection-lifecycle.test.mjs` | 11 Tests. RL-1 ist der Vorfall selbst; RL-10 stellt das Register mit 6.834 Einträgen nach; RL-4 hält fest, dass auch PERMANENT abläuft; RL-11 prüft die wachsende Frist. |
| `quant/tests/daily-lifecycle-health.test.mjs` | 8 Tests. DLH-1 ist der Zustand „45 geholt / 6.831 übersprungen / 2 Sitzungen alt" → **FAIL**. DLH-8 hält fest, dass Zurückgestellte nicht als geprüft zählen. |
| `quant/tests/market-eod-cli.test.mjs` | Der bestehende Test zur Sperre über den Tageswechsel ist **umgeschrieben statt gelöscht**: das Register überlebt den Reset (unverändert), eine frische Ablehnung ruht, eine abgelaufene wird wieder gefragt. Dazu neu: **ein Tageslauf mit genau einer neuen Bar wird übernommen** — der Vorfall als Regressionstest. |


## 9. Der Recovery-Lauf — die Zahlen

Wiederhergestellt hat **Lauf 35382249695**, gestartet 18.09.2026 um
18:47 UTC, Abruf 18:48–19:52 (64 Minuten), veröffentlicht 19:57 als
`18ea58f7c0`. Es war der sechste Anlauf; die fünf davor stehen in §9a,
weil ein Bericht, der sie verschweigt, die Kosten verschweigt.

### Die elf geforderten Zahlen

| | |
|---|---|
| **Ablehnungen vorher** | **6.831** — alle mit dem Code `too_few_bars`, alle aus derselben Minute (16.09.2026, 22:41:11 UTC) |
| **permanente Ablehnungen** | **0** — kein einziger Titel ist strukturell ungeeignet |
| **temporäre Ablehnungen** | **420** TEMPORARY_REJECT (364 zum zweiten Mal gesehen, Frist 40 h; 56 zum ersten Mal, Frist 20 h) |
| **recovered** | **6.829 von 6.831** — nur zwei Titel tragen den Code `too_few_bars` heute noch |
| **weiterhin abgelehnt** | **422** im Lauf, **423** im Register nach dem Lauf |
| **tatsächlich abgefragte Titel** | **6.456** von 6.876 (93,9 %); 420 lagen in einer laufenden Frist und wurden bewusst nicht gefragt |
| **erfolgreich aktualisierte Titel** | **6.454** |
| **neuestes `asOf`** | **2026-09-17** — die letzte abgeschlossene US-Sitzung zum Zeitpunkt des Laufs |
| **Provider-Fehler** | **0** |
| **Datenqualitätsfehler** | **422** — davon 420 `adjustment_status_contradicted` und 2 `too_few_bars` |
| **Request-Verbrauch** | **6.456** Anfragen; Kontingent Tag 6.456/50.000, Stunde 5.964/7.500 |

Die Differenz zwischen 422 und 423 glätte ich nicht: der Statusbericht
zählt die Titel, die in diesem Lauf abgelehnt wurden, das Register den
Bestand danach. Ein Eintrag mehr im Register als im Lauf heißt, dass ein
Titel aus einem früheren Lauf noch in seiner Frist liegt und in diesem
gar nicht vorkam.

### Was die 422 wirklich sind

Sie sind **nicht** der Vorfall. 420 von ihnen tragen
`adjustment_status_contradicted` — ein Qualitätsbefund über die
Bereinigungsstufe des Anbieters, der mit dem Fenster-Artefakt vom 16.09.
nichts zu tun hat und der die neue Ordnung genau so durchläuft, wie sie
gedacht ist: erste Ablehnung 20 h Ruhe, zweite 40 h, Verdopplung bis
höchstens eine Woche.

Übrig bleiben zwei echte `too_few_bars`: **BNRG** und **JAB**, beide mit
genau einer Bar im Bestand. „Zu wenige Bars (1). Eine Reihe unter 2
Punkten lässt keine Prüfung und keine Faktorberechnung zu." Das ist
diesmal kein Fensterfehler, sondern die Wahrheit über zwei Titel ohne
Historie.

### Der Zustand danach, gegen die tatsächliche Sitzung geprüft

```
Tageskurse    asOf 2026-09-17   erwartet 2026-09-17   LAST_SESSION
Rückstand     0 Sitzungen       (vorher: 2)
Wächter       PASS              (vorher: FAIL)
              6.456 von 6.876 geprüft = 93,9 %
```

Stichprobe an den fünf Titeln des Realtime-Smoke — kompakte Reihen,
volle Historie und Discover-Daten tragen denselben Stand:

```
AAPL  270 Punkte, letzter ["2026-09-17", 337.00]
NVDA  270 Punkte, letzter ["2026-09-17", 219.34]
MSFT  270 Punkte, letzter ["2026-09-17", 497.75]
PANW  270 Punkte, letzter ["2026-09-17", 375.06]
VLO   270 Punkte, letzter ["2026-09-17", 412.53]

golden-preview/daily  2.944 Bars je Titel, letzter 2026-09-17
discover/data         5.951 Titel mit Kursreihe, erzeugt 19:55:40
```

## 9a. Fünf Läufe, die nichts veröffentlicht haben

Der Abruf hat sechsmal stattgefunden, veröffentlicht wurde einmal. Das
gehört in den Bericht, weil es rund 30.000 Provider-Anfragen und einen
halben Tag gekostet hat. Vier der fünf Fehlschläge waren meine.

| Lauf | Kam bis | Woran gescheitert |
|---|---|---|
| 35323730134 | Nachrechnung | Der Verifier verlangte, was ein anderer Vertrag verbietet: VLO führte drei **Ranglisten** an, und an einer Rangliste darf die Diversity-Regel nichts ändern (`ac5d05a6e`) |
| 35349647216 | Regressionssuite | Mein Feldname `rejectionLedger.open` — in einem ausgelieferten Artefakt ist `open` der Eröffnungskurs (`3db972ba5`) |
| 35358214593 | Regressionssuite | Dieselbe Rangliste-Behauptung, an einer **zweiten** Stelle, die ich beim ersten Mal übersehen hatte (`d55cb2365`) |
| 35366297664 | `git add` | `rejection-ledger.json` entstand nicht immer, und `git add` bricht bei unbekanntem Pfad mit exit 128 ab (`2be7f8976`) |
| 35374148077 | Rebase | Echter Konflikt: Intraday-Lauf und EOD-Refresh schreiben **dieselben** erzeugten Dateien (`2c731b4a8`) |

Keiner dieser Fehlschläge hat Kursdaten verloren — die Bars lagen jeweils
in der Arbeitsablage, und der nächste Lauf setzte darauf auf. Verloren
sind Anfragen und Zeit.

### Ein Nachtrag, der unangenehm ist

Beim Nachrechnen der Zahlen fiel auf, dass der Schritt
„Ablehnungsregister klassifizieren" `checkpointsFound: 0` meldete,
während derselbe Lauf ein Register mit 423 Einträgen führte.
`market-store.js` schreibt Checkpoints nach
`<ablage>/<anbieter>/checkpoints/<runId>.json`, `classify-rejections.mjs`
suchte eine Ebene höher. **Das Skript war in jedem Lauf wirkungslos**,
und der Schritt „fällige Ablehnungen freigeben" hat nie eine einzige
freigegeben — beide meldeten Erfolg.

Dass die Wiederherstellung trotzdem gelungen ist, liegt allein an der
Ursachenkorrektur im Ingest: der Anschlussbar und
`RejectionLifecycle.darfAbfragen`. Die Klassifikation war Beiwerk, das
aussah, als täte es etwas.

Korrigiert in `d4a2963a31`. Der Test, der es hätte finden müssen, war
mitschuldig: CR-2 schrieb den Checkpoint dorthin, wo *ich* ihn vermutet
hatte. CR-3 lässt jetzt den echten Store schreiben und verlangt, dass das
Skript ihn findet — ohne die Korrektur fällt er, mit ihr besteht er.

## 10. Was nicht angefasst wurde

Intraday-Snapshots, die Realtime-Architektur (Cloudflare Worker, Durable
Object, Tiingo-Verbindung), die Fundamentaldaten und die V4.1-Oberfläche.
Der Fehler lag im EOD-Pfad; dort wurde er behoben, und nirgends sonst.
