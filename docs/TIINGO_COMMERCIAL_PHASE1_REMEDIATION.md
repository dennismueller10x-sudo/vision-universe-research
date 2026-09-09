# TIINGO COMMERCIAL PHASE 1 — NACHARBEIT

Was nach dem Abschlussbericht offen war, und was daraus geworden ist.

Der Bericht zur Phase steht in `TIINGO_COMMERCIAL_PHASE1_ABSCHLUSSBERICHT.md`;
die Architektur in `TIINGO_COMMERCIAL_SCALE_PHASE1.md`. Dieses Dokument
beschreibt ausschließlich die Nacharbeit.

---

## 1. Die 5.000 waren unsere Zahl

**Befund der Vorphase:** FULL_UNIVERSE endete nach exakt 5.000 Anfragen, 686
Titel blieben `UNAVAILABLE`, drei Prüfungen rissen, Urteil FAIL.

**Was wirklich geschah.** Die Einzelzeile eines betroffenen Titels sagt es:

```
"status": "UNAVAILABLE", "reason": "rateLimited",
"message": "Stundenkontingent erschoepft (5000/5000). Naechster freier Platz in 652 s."
```

Diese Meldung stammt aus `quant/engines/market-client.js` — sie entsteht,
**bevor** eine Anfrage hinausgeht. Für diese 686 Titel wurde Tiingo nie
gefragt. Der Anbieter hat in keinem Lauf dieser Phase eine einzige Anfrage
abgelehnt.

Die 5.000 stammen aus `COMMERCIAL_LIMITS.requestsPerHour`, eingeführt in Phase
4A als bewusst konservative Annahme, seit jeher mit `verified: false`.

### Klassifikation (§2)

| Größe | Herkunft |
|---|---|
| `requestsPerMinute` (100) | **SAFETY_CEILING** |
| `requestsPerHour` (5.000) | **SAFETY_CEILING** |
| `requestsPerDay` (50.000) | **SAFETY_CEILING** |
| `bytesPerMonth` | **UNKNOWN** |
| `concurrency` (4) | CONFIG_ASSUMPTION |

Keine dieser Zahlen ist PROVIDER_VERIFIED, ACCOUNT_VERIFIED, RUNTIME_MEASURED
oder DOCUMENTED. Die Klassifikation steht als Feld im Objekt, nicht im
Kommentar: ein Kommentar wird nicht mitgeliefert, wenn jemand das Objekt
ausgibt.

### Was der Anbieter selbst sagt (§3)

`scripts/market/verify-request-limits.mjs` sucht die stärkste sicher
erreichbare Auskunft, in acht Anfragen — ausdrücklich ohne gegen die Wand zu
laufen:

| Rang | Quelle | Ergebnis |
|---|---|---|
| 1 | `/api/test` | antwortet (`"You successfully sent a request"`), **nennt kein Kontingent** |
| 1 | `/account/usage`, `/api/usage` | **existieren nicht** |
| 2 | Dokumentationsseite | **keine Kontingentaussage in abrufbarer Form** |
| 3 | Antwortköpfe | **keine** — Tiingo sendet `allow`, `content-length`, `content-type`, `date`, `server`, `vary`, `x-frame-options`. Kein `X-RateLimit-*`, kein `Retry-After` |
| 4 | Beobachtung | 5.000 Anfragen in einer Stunde **ohne eine einzige Ablehnung** |

**Urteil: `UNKNOWN / PROVIDER_CONFIRMATION_REQUIRED`.**

Belegt ist eine **Untergrenze**: mindestens 5.000/h gehen durch. Wo die
tatsächliche Grenze liegt, sagt der Anbieter nirgends, wo wir ohne Nachfrage
hinsehen können.

Eine Sekundärquelle im Netz nennt „5.000/h" für den Commercial-Tarif. Das
geht als **HEARSAY** in keinen Befund: eine Tarifseite Dritter ist weder eine
Messung noch eine Zusage für diesen Vertrag — und sie wäre ausgerechnet der
Wert, den wir prüfen wollten.

---

## 2. Unvollständig ist nicht gescheitert

FAIL heißt: die Daten taugen nicht. Es heißt **nicht**: wir haben aufgehört zu
fragen.

Der erste FULL_UNIVERSE-Lauf hat das verwechselt. Die drei gerissenen Quoten
wurden über das volle Universum gerechnet, obwohl 686 Titel nie abgerufen
wurden. Eine Quote über einen Nenner, den niemand angefragt hat, misst den
Abbruch und nicht die Daten.

**Neu:** bleiben Titel am eigenen Budget hängen, lautet das Urteil
`INCOMPLETE_RESUMABLE`. Der Bericht trägt dann:

```json
"resumable": {
  "status": "RESUMABLE", "pending": 686, "completed": 4998,
  "cause": "clientBudget",
  "causeNote": "Unser eigenes Stundenbudget, nicht Tiingos Limit. Der Anbieter
                wurde fuer diese Titel nicht gefragt und hat nichts abgelehnt."
}
```

Daneben steht `qualityOfResolved` — die Quote über die Titel, die wirklich
abgerufen wurden. Bei einem Teillauf ist sie die einzige, die etwas über die
Daten aussagt.

Eine Ablehnung **des Anbieters** (HTTP 429) führt ebenfalls zu
`INCOMPLETE_RESUMABLE`, aber mit `cause: "providerLimit"` — und sie wird
gezählt, mit ihren Kontingentköpfen und `Retry-After`. Das ist der Unterschied,
der der Vorphase gefehlt hat.

---

## 3. Checkpoint und Fortsetzen (§4, §6)

Ein Checkpoint bestand schon; drei Dinge fehlten ihm.

| | vorher | jetzt |
|---|---|---|
| Datenstruktur | Liste — Fortsetzen fügte Erledigte erneut an | **Menge** — zweimal fortsetzen = einmal |
| Sicherung | `done.length % 50 === 0` — bei gleichzeitigen Abrufen übersprungen (49 → 51) | **alle 10 s** — eine Uhr lässt sich nicht überspringen |
| Abbruch | Fortschritt seit der letzten Sicherung verloren | **SIGINT/SIGTERM sichern und melden** |

Der schwerwiegendste Fehler saß woanders: ein fortgesetzter Lauf zählte nur,
was **er selbst** abgerufen hatte. Die 4.998 Titel des vorigen Laufs wären
schlicht verschwunden, und der Bericht hätte schlechter ausgesehen als der
Bestand. Ein fortgesetzter Lauf bewertet sie jetzt aus der Arbeitsablage —
ohne eine einzige Anfrage, aber mit ihnen in der Bilanz.

Nachgewiesen in SG14–SG17, gegen einen lokalen Server in Tiingos Antwortform:

- **SG14** Budgetstopp ist `INCOMPLETE_RESUMABLE`, nennt den Urheber, zählt
  `symbolsBlockedByOwnBudget` getrennt von `symbolsRefusedByProvider`
- **SG15** START → Teilmenge → Checkpoint → Fortsetzen → vollständig. Jeder
  Gate-Titel **genau einmal** geholt, kein Titel verloren, und das Ergebnis ist
  identisch mit einem Lauf in einem Zug
- **SG16** ein echtes 429 erscheint als Aussage des Anbieters, mit
  `x-ratelimit-limit` und `retryAfterSeconds`
- **SG17** SIGTERM mitten im Lauf: Checkpoint geschrieben, keine Doppelten,
  Fortsetzen holt nichts erneut, Bilanz vollständig

---

## 4. Was ist diese Zahl? (§7–§11)

Der Strom liefert `[Zeitstempel, Ticker, Kurs]` — drei Felder, kein Typfeld.

**Neu:** während der Messung wird der letzte Stromkurs gegen die Felder der
REST-Kursabfrage gehalten. Verglichen wird auf **Gleichheit**, nicht mit
Toleranz: eine Toleranz träfe bei eng beieinanderliegenden Feldern jedes und
zeigte nichts. In den Bericht geht nur, **welches** Feld getroffen hat — nie
eine Zahl.

**Gemessen, 24 Proben bei offener Börse:**

| Feld | Treffer | in der Antwort vorhanden |
|---|---|---|
| `tngoLast` (Tiingos Referenzkurs) | **13 / 24** | ja |
| `mid` | 7 / 24 | ja |
| `prevClose`, `open`, `high`, `low` | 0 | ja |
| **`last`** (letzter Abschluss) | — | **nein** |
| **`bidPrice` / `askPrice`** | — | **nein** |

**Urteil: `UNSPECIFIED / PROVIDER_CONFIRMATION_REQUIRED`.**

13 von 24 sind eine Mehrheit, aber keine klare: die Schwelle verlangt 60 % und
keinen nahen Zweiten. `mid` mit 7 ist zu nah.

Der bemerkenswertere Teil steht daneben: **ein Abschlusskurs steht in diesem
Zugang nicht einmal zum Vergleich zur Verfügung.** `last`, `bidPrice` und
`askPrice` kommen in der Kursabfrage gar nicht vor — passend zum Befund
`latestQuote: ABSENT` aus der Vorphase. Der häufigste Treffer ist ausgerechnet
Tiingos **Referenzkurs**.

Das beweist nichts. Es macht die Beschriftung „Last Trade" aber deutlich
weniger haltbar als vorher, und genau so steht es im Bericht:
`leadingCandidate` und `absentFields`.

### Die Sperre ist eine Sperre (§10, §11)

`priceSemantics.intradayIntelligence` ist maschinenlesbar:

```json
{ "status": "BLOCKED",
  "blockedUses": ["intradaySignals", "technicalSignalGeneration", "backtesting",
                  "executionSimulation", "tradeBasedVolumeAnalysis", "tradeBasedOHLC"],
  "permittedUses": ["liveMovingChart"],
  "labelling": { "forbidden": ["Last Trade", "Official Trade Price", "Realtime Trade"] },
  "sourceOfTruth": "Die geprueften historischen und Intraday-Datensaetze bleiben
                    die Rechengrundlage, bis die Kursart belegt ist." }
```

Kein Verbot des Charts — ein Verbot, auf dieser Kerze zu rechnen und sie zu
beschriften, als wäre sie etwas Belegtes.

`assert-public-data-hygiene.mjs` setzt das am **erzeugten Artefakt** durch, nicht
an der Absicht des Skripts. Drei Gegenproben in SG19: verbotene Beschriftung
hält an, fehlende Sperre hält an, und der ehrliche Bericht geht durch — auch
wenn er die verbotenen Wörter in seiner eigenen Verbotsliste führt.

---

## 5. Prüfungen über das ganze Universum (§13)

`scripts/market/assert-universe-quality.mjs`. Der Grund für eine eigene Ebene:
**jeder dieser Fehler lässt jeden einzelnen Titel sauber aussehen.**

| Prüfung | findet |
|---|---|
| `duplicateSecurities` | zwei Zeilen mit derselben `securityId` — die zweite überschriebe den Bestand der ersten |
| `tickerCollisions` | ein Ticker auf zwei `securityId`s — im Screener entscheidet die Reihenfolge |
| `nonFiniteNumbers` | NaN/Infinity in einem ausgelieferten Bericht |
| `nullExplosion` | ein Feld, das bei der Mehrheit der Titel leer ist |
| `dateAlignment` | Titel, die zeitlich zurückfallen — einzeln normal, in Gruppen ein Abrufproblem |
| `technicalBundles` | ein angeforderter Titel **ohne jeden Zustand** |
| `relativeStrengthAlignment` | ein Maßstab ohne Bars macht jede relative Stärke leer |
| `accountingConsistency` | eine Bilanz, deren Fächer nicht die Summe ergeben |

Jede ist in SG21–SG28 mit einem absichtlich eingebauten Fehler nachgewiesen —
eine Prüfung, die man nie hat anschlagen sehen, ist keine.

**Eine Prüfung hat sich dabei selbst als falsch erwiesen.** Sie verglich
`evaluated` (analysierte Titel) mit der Fächersumme und meldete auf jedem Gate
einen Fehler. Die beiden dürfen auseinanderliegen: ein Titel mit zu kurzer
Historie geht gar nicht erst durch die Engine, steht aber sehr wohl in einem
Fach. Geprüft wird jetzt, was wirklich gelten muss: **jeder angeforderte Titel
hat ein Fach.**

---

## 6. Eine Marke ohne Wirkung

Der erste Nachbesserungslauf sollte das volle Universum laden und hat
**bewertet — still und grün.**

Es gab zwei Schalter. Der Workflow leerte seinen eigenen (`--assess-only`),
aber das Skript trägt seit dem teuren Vorfall der Vorphase eine **eigene**
Sicherung (`--allow-full-backfill`), und die hat der Workflow nie gesetzt.
Beide Seiten waren für sich richtig; zusammen war die Marke
`[tiingo-full-backfill]` Dekoration.

Die Sicherung im Skript bleibt, wo sie ist — sie hat getan, was sie soll. Der
Workflow löst sie jetzt im selben Zweig, in dem er die Marke liest, und gibt
den Aufruf aus, mit dem er startet.

**SG29** hält die Verbindung fest: Marke, Sicherung und Kommandozeile müssen
zusammenhängen, nicht nur einzeln existieren. Ein Schutz, der sich von außen
aushebeln lässt, ist keiner — und einer, der stillschweigend alles abschaltet,
auch nicht.

---

## 7. Offen — und wo genau

| Frage | Status | Nächster Schritt |
|---|---|---|
| Tatsächliche Stundengrenze des Kontos | **UNKNOWN / PROVIDER_CONFIRMATION_REQUIRED**, Untergrenze ≥ 5.000/h | Beim Anbieter nachfragen. Kein Endpunkt und kein Kopf gibt sie preis |
| Kursart des Stroms | **UNSPECIFIED**, führender Verdacht `tngoLast` | Beim Anbieter nachfragen. Die Nachrichtenform trägt keinen Typ |
| Abo-Grenzen des Stroms | **UNMEASURED** | Nicht durch Dagegenlaufen zu klären |
| Sektor / Branche | **SOURCE_MISSING** | Nicht in diesem Zugang enthalten |
| ADR-Trennung | **UNVERIFIED** | Braucht Firmennamen |
| Weitergabe der Tickerliste | **LEGAL_REVIEW_REQUIRED** | Rechtliche Prüfung |
