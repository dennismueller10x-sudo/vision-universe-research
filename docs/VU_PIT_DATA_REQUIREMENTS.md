# VU PIT DATA REQUIREMENTS

Was „Point-in-Time" bedeutet, was es **nicht** bedeutet, und woran man einen
Anbieter erkennt, der es liefert.

Umsetzung: `quant/engines/schema.js` (bitemporales Modell),
`quant/engines/gate-tests.js` (Prüfung), `quant/methodology/backtest-evidence-v1.json`

---

## Die Frage

> Kann rekonstruiert werden, was Vision Universe an einem historischen Tag
> tatsächlich hätte wissen können?

Nicht: welche Zahl heute für den 15. März 2019 in der Datenbank steht. Sondern:
welche Zahl am 15. März 2019 dort gestanden hätte.

Der Unterschied ist die gesamte Phase.

## Ein Begriff, zwei Bedeutungen

„Point-in-time" wird in der Finanzdatenwelt für zwei völlig verschiedene Dinge
benutzt, und die Verwechslung ist folgenreich genug, um sie an den Anfang zu
stellen.

**Bedeutung 1 — die Stichtagsrechnung.** Eine Bilanz beschreibt einen Zustand
an einem Tag, im Unterschied zur Gewinn- und Verlustrechnung, die einen
Zeitraum beschreibt. In diesem Sinn ist *jede* Bilanz point-in-time.

**Bedeutung 2 — die bitemporale Verfügbarkeit.** Zu jedem Wert ist bekannt, ab
wann er öffentlich war, sodass sich der Wissensstand eines beliebigen
vergangenen Tages rekonstruieren lässt.

Nur die zweite Bedeutung ist für Backtests relevant. Bei der Recherche zu
Phase 3 fand sich bei einem der Kandidaten genau die erste Bedeutung an
prominenter Stelle — „*Balance sheet data is available on a FY or QTR basis
only due to its point-in-time nature*". Wer das als Beleg für Bedeutung 2
nimmt, qualifiziert einen Anbieter auf einem Missverständnis.

Deshalb steht dieser Befund in `provider-profiles.json` als `UNKNOWN` mit
einem Vermerk, und ein Test hält den Vermerk fest.

## Das bitemporale Modell

Jede Kennzahl trägt zwei Zeitachsen:

| Feld | Bedeutet | Beispiel |
|---|---|---|
| `periodEnd` | Ende des Geschäftszeitraums | 2018-12-31 |
| `reportedAt` | Meldung durch das Unternehmen | 2019-02-14 |
| `filedAt` | Einreichung bei der Aufsicht | 2019-02-15 |
| **`availableAt`** | **ab wann für VU nutzbar** | **2019-02-15** |
| `ingestedAt` | Aufnahme in die VU-Datenbank | 2026-09-04 |
| `revisionId` | Fassung (0 = Erstmeldung) | 0 |
| `restatementStatus` | `original` \| `restated` | original |

`availableAt` ist die Entscheidungsgrenze. Die Regel lautet:

```
availableAt <= decisionTime
```

Ohne Ausweichparameter. Es gibt in der gesamten Engine keine Möglichkeit, sie
zu umgehen — das war eine Festlegung aus V1 und sie gilt unverändert.

`ingestedAt` ist ausdrücklich **nicht** die Entscheidungsgrenze. Der Zeitpunkt,
zu dem ein Wert in die Datenbank kam, sagt nichts darüber, wann er öffentlich
war. Anbieter, die nur diesen Zeitstempel führen, bestehen Gate C nicht.

## Warum `periodEnd` allein nicht reicht

Ein Geschäftsjahr endet am 31.12. Der Bericht erscheint Mitte Februar. Wer
`periodEnd` als Entscheidungsgrenze nimmt, lässt die Strategie sechs Wochen
früher handeln, als es möglich war.

Der naheliegende Notbehelf — ein pauschaler Aufschlag von 45 Tagen — ist eine
Annahme, kein Datum. Der Abstand schwankt:

- zwischen Unternehmen (Größe, Prüfer, Komplexität)
- zwischen Quartalen (Jahresabschlüsse dauern länger als Quartale)
- zwischen Rechtsordnungen
- über die Zeit (Fristen ändern sich)

Und er schwankt nicht zufällig: Unternehmen mit Problemen melden später. Ein
pauschaler Aufschlag ist damit genau dort am ungenauesten, wo es darauf ankommt.

## Die drei Fehler, die ein Backtest nicht überlebt

Alle drei haben eine Eigenschaft gemeinsam, die sie so gefährlich macht: **sie
erzeugen kein Fehlerbild.** Kein Absturz, keine Lücke, keine auffällige Zahl —
nur ein Ergebnis, das ein wenig besser ist als die Wirklichkeit, und zwar immer
in dieselbe Richtung.

### 1. Look-Ahead durch Restatements

Ein Unternehmen meldet 2017 einen Umsatz und korrigiert ihn 2018 nach unten.
Liefert der Anbieter nur den korrigierten Wert, sieht ein Backtest für 2017
eine Zahl, die 2017 niemand kannte.

Besonders tückisch: Korrekturen gehen überdurchschnittlich oft nach unten, und
überdurchschnittlich oft bei Unternehmen, die später Probleme bekommen. Eine
Strategie, die die korrigierten Zahlen sieht, vermeidet genau diese Unternehmen
— mit Wissen, das sie nicht hatte.

→ Gate A, Fixture `MOCK_RESTATEMENT`

### 2. Survivorship Bias

Ein Backtest über die heute noch existierenden Unternehmen misst die
Überlebenden. Die Insolvenzen fehlen — also genau die Fälle, die eine Strategie
hätte vermeiden müssen.

Der Fehler lässt sich nicht durch mehr Daten ausgleichen, weil er nicht in den
Daten liegt, sondern in ihrer Auswahl.

Eine Unterform wird oft übersehen: Anbieter, die Kursreihen delisteter Titel
führen, aber **keine Fundamentaldaten**. Für eine fundamental auswählende
Strategie bleibt so ein Titel unsichtbar, und der Bias besteht fort — eine Ebene
tiefer und schlechter zu bemerken.

→ Gate B, Fixture `MOCK_DELISTED`

### 3. Future Data Leak

Eine Information erscheint im Datensatz, bevor sie öffentlich war. Der
häufigste Weg dorthin ist der oben beschriebene Umgang mit `periodEnd`.

→ Gate C, Fixture `MOCK_FUTURE_DATA_LEAK`

## Was ein Anbieter liefern muss

| Anforderung | Blockierend | Prüfung |
|---|---|---|
| Veröffentlichungszeitpunkt je Kennzahl oder Bericht | ja | Gate C |
| Zeitstempel bezieht sich auf Veröffentlichung, nicht Datenbankaufnahme | ja | Gate C |
| Auch für die Vergangenheit vorhanden, nicht nur für neue Datensätze | ja | Gate C |
| Original und Korrektur unterscheidbar | ja | Gate A |
| Abfrage auf einen Wissensstand einschränkbar | ja | Gate A |
| Delistete Unternehmen abrufbar | ja | Gate B |
| Delistete Unternehmen **mit Fundamentaldaten** | ja | Gate B |
| Ausscheidedatum und -grund | ja | Gate B |
| Kapitalmaßnahmen als Ereignisse | ja | — |
| Total-Return-bereinigte Kurse | ja | siehe `VU_PRICE_ADJUSTMENT_SEMANTICS.md` |
| Historische Kennungen (ISIN/FIGI über Zeit) | nein | — |
| Historische Indexzugehörigkeit | nein | — |

Die vollständige, maschinenlesbare Fassung steht in
`quant/methodology/backtest-evidence-v1.json`.

## Was nicht ausreicht

Diese Liste ist aus der Erfahrung gewachsen, dass die Existenz eines Feldes
nichts über seinen Inhalt sagt:

- ein Feld namens `restated` ohne prüfbaren Inhalt
- eine Änderungshistorie, die den Zeitpunkt der Datenbankaktualisierung führt
- ein einheitlicher Versatz, den der Anbieter selbst geschätzt hat
- eine Liste delisteter Symbole ohne zugehörige Daten
- Delisting-Abdeckung erst ab einem Stichtag nach dem Backtest-Zeitraum
- Kursreihen delisteter Titel ohne Fundamentaldaten
- ein Endpunkt für Original-Filings, aus dem sich der damalige
  Standardwert nicht rekonstruieren lässt

Der letzte Punkt ist der subtilste: manche Anbieter führen die
Original-Einreichungen als Dokumente, ohne dass sich daraus die standardisierte
Kennzahl von damals ableiten ließe. Für eine Strategie, die auf
standardisierten Kennzahlen operiert, ist das nicht dasselbe.

## Der Referenzfall

Der MockProvider erfüllt alle Anforderungen und besteht alle drei Gates. Das
ist kein Selbstlob, sondern ein methodischer Zweck: **eine Spezifikation, die
niemand erfüllen kann, ist keine Spezifikation, sondern eine Ausrede.**

An seinem Verhalten lässt sich ablesen, wie eine bestandene Antwort aussieht:

```js
provider.getFacts("sec_VUF009", { asOf: "2017-09-29", periodEnd: "2017-03-31" })
// -> restatementStatus: "original", value: <höherer Wert>

provider.getFacts("sec_VUF009", { asOf: "2019-09-30", periodEnd: "2017-03-31" })
// -> restatementStatus: "restated",  value: <niedrigerer Wert>
```

Ein realer Anbietertest stellt dieselbe Anfrage — mit einem realen Unternehmen,
dessen Korrektur belegt ist.

## Die Konsequenz für Aussagen

Solange keine dieser Anforderungen erfüllt ist, gilt:

```js
backtestEligibility(resolution)
// -> { allowed: true, realEvidence: false, note: "…" }
```

Der Backtest läuft. Er belegt die Funktionsweise der Engine, nicht die
historische Tragfähigkeit der Strategie. Auch echte Kurse ändern daran nichts,
solange die Fundamentaldaten synthetisch sind — die Auswahlentscheidungen
stammen aus den Fundamentaldaten.

Ab Phase 3 sagt das auch die Datenstandskennung selbst:

```js
describeSnapshot({ universe: "US-EQUITY", date: "2026-09-07" })
// -> evidenceEligible: false
// -> evidenceNote: "Dieser Datenstand ist nicht als Nachweis geeignet. …"
```
