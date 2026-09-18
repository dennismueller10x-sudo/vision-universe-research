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


## 9. Der Recovery-Lauf

**Läuft zum Zeitpunkt dieses Eintrags** (Lauf 35323730134 auf `main`,
gestartet 18.09.2026 08:18 UTC). Der Ablauf, in dieser Reihenfolge:

1. **Register klassifizieren** (Bericht, kein Eingriff)
2. **Fällige Ablehnungen freigeben** — genau die, die die Ordnung erlaubt
3. **Tageskurse holen**, inkrementell, mit Anschlussbar und Budgetgrenze
   (`--request-budget=7500`, Anbieter-Takt 100 Anfragen/Minute → rund
   70 Minuten für das ganze Universum)
4. **Folgeketten in Abhängigkeitsreihenfolge**: Faktoren → Technical
   Intelligence/Elliott/SEC-Quant-Panel → Nachrechnung gegen die Engines →
   Discover-Daten → Capability-Matrix
5. **Hygiene, Freshness, Gesundheitsurteil** (`--strict`), Regressionssuite
6. **Commit und Push**

Die Zahlen des Laufs — Ablehnungen vorher, permanent, temporär, recovered,
weiterhin abgelehnt, tatsächlich abgefragte Titel, erfolgreich
aktualisierte, neuestes `asOf`, Provider-Fehler, Datenqualitätsfehler,
Request-Verbrauch — werden hier nachgetragen, sobald er durch ist. Bis
dahin steht in diesem Abschnitt bewusst keine Zahl: ein laufender Lauf ist
kein Ergebnis.

## 10. Was nicht angefasst wurde

Intraday-Snapshots, die Realtime-Architektur (Cloudflare Worker, Durable
Object, Tiingo-Verbindung), die Fundamentaldaten und die V4.1-Oberfläche.
Der Fehler lag im EOD-Pfad; dort wurde er behoben, und nirgends sonst.
