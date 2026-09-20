# VU SOCIAL — DER GESCHLOSSENE LOOP IM SCHATTENBETRIEB

Stand: 2026-09-16 · Zweig `claude/vision-universe-social-os-eudjmx`

---

## 1. Das Urteil ist gestaffelt

„Irgendetwas hat sich geändert" wäre ein zu schwaches Kriterium für
Kreislauf-Schließung. Eine hochgezählte Kennzahl ist auch ein Unterschied
und beweist nichts. Der Nachweis unterscheidet deshalb, **was** sich
geändert hat:

| Urteil | Bedeutung |
|---|---|
| `CLOSED_DECISION` | Die inhaltliche Entscheidung selbst ist eine andere. Das ist die Behauptung der Definition of Done. |
| `CLOSED_STATE` | Die Evidenz ist angekommen und hat den Wissensstand verändert, die Entscheidung aber nicht. |
| `NOT_CLOSED` | Die Evidenz hat gar nichts erreicht. |

`CLOSED_STATE` als `CLOSED_DECISION` auszugeben wäre die bequemste Lüge
dieses Projekts. Der Nachweis tut es nicht, und `LC1b` hält das fest.

---

## 2. Die zwei Durchgänge

Beide fahren den **echten** Zyklus als Unterprozess, zweimal, gegen
verschiedene Datenstände. Signale, Code und Konfiguration sind in beiden
Läufen identisch; der einzige Unterschied ist die eingetroffene Evidenz.

### Durchgang A — gemessene Evidenz

**Befund: es gibt derzeit keine messbare reale Performance.**

Der Abruf funktioniert. Die Antwort ist eindeutig:

```
mediaId    17992767560843861
Zustand    UNAVAILABLE
gemessen   0
Fehler     code 100, subcode 33, GraphMethodException
           "Object with ID ... does not exist, cannot be loaded due to
            missing permissions, or does not support this operation."
fbtraceId  AxlLTlX3ASySaPwgIL_qH2L
```

Der eine veröffentlichte Beitrag wurde nach der Prüfung **archiviert**.
Archivierte Medien gibt die Graph API nicht mehr heraus — auch den
Permalink nicht.

Das ist kein Fehler des Systems, sondern eine Tatsache über die
Sichtbarkeit einer API-Ressource. Entscheidend ist, wie das System damit
umgeht: `UNAVAILABLE`, `measured: false`, Metriken auf `null`. **Es macht
daraus keine Reichweite von 0.** Wäre es das, hätte das System gelernt,
dass dieses Format nicht funktioniert — aus einem Archivierungsvorgang.
`PI11` und `PI12` halten das fest.

Der Nachweis meldet für diesen Durchgang folgerichtig:

```
Evidenzzustand         NICHTS_GEMESSEN → NICHTS_GEMESSEN
URTEIL: NOT_CLOSED
```

Der Loop schließt sich mit realen Zahlen erst, wenn es einen sichtbaren
Beitrag gibt. Das ist eine Owner-Entscheidung, kein Baufehler.

### Durchgang A' — die Bestandsbeiträge des Kontos

Die Annahme „der archivierte Testbeitrag ist alles, was es gibt" war
falsch und ließ sich prüfen. Das Konto hat **26 Beiträge**; abgefragt
werden konnten sie erst, nachdem zwei eigene Fehler behoben waren (siehe
§7). Gemessen:

```
REEL   n=9   Reichweite Median 24   Interaktionsrate Median 0,167
FEED   n=7   Reichweite Median  8   Interaktionsrate Median 0,375
```

Ein echtes Signal: Reels erreichen dreimal so viele Menschen, Feed-Posts
haben die doppelte Interaktionsrate je Erreichtem. Die Dimension kommt
von Meta (`media_type`), nicht von uns.

Eingetragen wird nur, was gemessen ist: `visualType` und `performance`.
**Nicht** `archetype` — das System hat ihn für diese Beiträge nie
entschieden, und ihn nachzutragen wäre erfundene Vorgeschichte, die
anschließend als Formatwissen in genau die Entscheidung einflösse, die
der Nachweis prüft.

Das Urteil bleibt `CLOSED_STATE`, und der Grund ist jetzt exakt bekannt.

---

## 2b. Warum aus 16 gemessenen Beiträgen kein Score wird

```
Vergleichsbasis   16 Beiträge — reicht (ab 5)
Coverage           0,24 — verlangt sind 0,50
```

Das Zielmodell hat acht Dimensionen. Belegt sind zwei:

| Dimension | Zustand |
|---|---|
| Reichweite | belegt |
| Interaktionsrate | belegt |
| Verweildauer | nur bei Reels (`ig_reels_avg_watch_time`, jetzt kanonisch in Sekunden) |
| Weiterleitungen | Median 0 — gegen 0 ist kein Verhältnis bildbar |
| Speicherungen | Median 0 — dito |
| Follower-Gewinn | Median 0 — dito |
| Qualität | interne Bewertung, für Bestandsbeiträge nicht vorhanden |
| Markenpassung | dito |

Die drei Nullmediane sind keine Messfehler: diese Beiträge werden
schlicht nicht geteilt, gespeichert oder gefolgt. Und Qualität und
Markenpassung kennt das System nur für Beiträge, die **es selbst**
erzeugt hat — für importierte Bestandsbeiträge gibt es sie nicht.

**Die Schwelle zu senken, bis die vorhandenen Daten genügen, hätte das
mehrdimensionale Modell abgeschafft und den Namen behalten.** Genau davor
soll es schützen: dass nicht eine einzelne Kennzahl die Strategie
bestimmt. Deshalb steht hier ein Befund und keine angepasste Konstante.

---

## 2c. Durchgang B — der Mechanismus (simulierte Evidenz)

```
Evidenzzustand         NICHTS_GEMESSEN → GEMESSEN_NICHT_BEWERTBAR
gemessene Beiträge     0 → 1
davon bewertbar        0 → 0
gewählte Formate       unverändert

URTEIL: CLOSED_STATE
```

Die Messung kommt an. Die Entscheidung bleibt — **und das ist richtig**.
Aus einem Beitrag lässt sich keine Formatempfehlung ableiten; die
Vergleichsbasis verlangt n≥5, die Learning Engine n≥8 je Arm. Das System
zieht die korrekte Folgerung: weiter erkunden.

Die drei Zahlen `gemessen`, `bewertbar` und `belastbar` stehen bewusst
getrennt. Zusammengefasst wäre „nichts gemessen" nicht mehr von
„gemessen, aber noch nicht bewertbar" zu unterscheiden — und jemand
würde später einen Fehler suchen, wo nur eine Stichprobe zu klein ist.



```
Datenpunkte            0 → 16
Formatwissen           0 → 2
Beobachtungen          0 → 3   (davon belastbar: 2)
Strategie-Version      strategy_initial → strat_6dc3a3d7…
gewählte Formate       EXPLAIN_THE_MOVE ×4
                    →  DATA_STORY, DATA_STORY, FUTURE_TECHNOLOGY, FUTURE_TECHNOLOGY

URTEIL: CLOSED_DECISION
```

Die Entscheidung kippt. Sichtbar sind beide Zweige zugleich: zwei
Exploitation (`DATA_STORY`, das belegte Format) und zwei Exploration
(`FUTURE_TECHNOLOGY`, das unbekannteste).

**Die Zahlen dieses Durchgangs sind SIMULIERT** und tragen das in jedem
Eintrag (`performanceProvenance.source = "SIMULATED"`). Sie landen nie in
`social/data`. Bewiesen ist der **Mechanismus**, nicht eine Aussage über
die Wirklichkeit.

---

## 3. Was im Schattenbetrieb passiert

Der Zyklus entscheidet vollständig und sendet nichts:

```json
{ "topic": "Technisches Setup — XOM",
  "archetype": "DATA_STORY", "visualType": "DATA_CARD",
  "plannedHourUtc": 18, "mode": "EXPLOIT",
  "wouldPublish": true, "published": false,
  "withheldBecause": "Shadow-Modus: GLOBAL_AUTOPUBLISH ist aus." }
```

Diese Einträge gehen mit `performance: null` ins Gedächtnis —
**ungemessen, weil ungesendet**. Das ist wichtiger, als es klingt: eine
Schatten-Entscheidung, die als 0 in die Formatstatistik einginge, würde
das System glauben lassen, das Format habe versagt. `LC5` hält fest, dass
sie es nicht tut.

---

## 4. Die Sperren, die aus bleiben

| Sperre | Zustand |
|---|---|
| `GLOBAL_AUTOPUBLISH` | **aus** |
| Autonomiestufe | **0** (Nur Beobachtung) |
| Kill Switch | greift für jeden Provider |
| Meta-Provider | nicht als Publishing-Ziel konfiguriert |

Der Zyklus prüft das selbst, nicht der Aufrufer. Seit dem einen
freigegebenen Testbeitrag ist nichts veröffentlicht worden.

---

## 5. Die Kette, die den Loop trägt

```
social/data/performance.json      gemessene Zahlen, mit Herkunft
social/data/content-memory.json   Beiträge samt Lineage
social/data/strategy-memory.json  Versionskette + Beobachtungen
social/data/experiments.json      laufende Hypothesen
social/data/shadow-decisions.json „würde X um T"
```

Ohne diese Dateien begänne jeder Lauf bei den Startwerten, und der
Kreislauf wäre eine Schleife, die sich nur schnell dreht.

---

## 6. Stand nach dem Anschluss der Zeitdimension (16.09., abends)

```
Evidenz: REAL
Evidenzzustand            NICHTS_GEMESSEN → BEWERTBAR
gemessene Beiträge        0 → 16
davon bewertbar           0 → 16
Vergleichsbasis reicht    false → true
Beobachtungen             0 → 2        (mediaFormat: REEL n=9, CAROUSEL n=7)
davon belastbar           0 → 0
Zeitwissen                0 → 8 Stunden
gewählte Stunde           18 → 18      (Quelle: Startwert, beide Läufe)

URTEIL: CLOSED_STATE
```

Vier Dinge stehen in diesen Zeilen, die vorher nicht darin standen:

1. **16 statt 12.** Vier Messungen waren von einem schmaleren Lauf
   überschrieben worden. Sie sind zurück, und die Ingestion führt
   seitdem zusammen statt zu ersetzen (§8 im Agent-Graph-Dokument).
2. **Die Beobachtungen heißen jetzt `mediaFormat`.** Sie hießen
   `visualType` und bedeuteten etwas anderes.
3. **Zeitwissen 8.** Der Rückkanal für die Stunde ist angeschlossen.
   Vorher wurde dort `null` übergeben.
4. **Quelle: Startwert.** Und das ist kein Rückschritt, sondern die
   Schwelle bei der Arbeit.

### Warum die Stunde trotzdem nicht entscheidet

| Stunde (UTC) | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|
| Beiträge | 2 | 1 | 1 | 1 | 2 | 3 | **4** | 2 |

`minimumSampleForExploit` ist **5**. Die größte Stichprobe ist **4**.

Aus vier Beiträgen zu einer Uhrzeit folgt keine Uhrzeitempfehlung — das
wäre ein Zufall mit Zeitstempel. Die Schwelle nachgeben zu lassen wäre
die einzige Art, das Urteil zu verbessern, **ohne etwas zu lernen**.

`CLOSED_STATE` ist hier deshalb die *richtige* Folgerung. Was fehlt, ist
kein Code: es ist **eine** weitere Messung in einer der belegten
Stunden. `LC11` zeigt an einem gebauten Fall, was dann passiert — die
Quelle springt auf `gemessen`, und die gewählte Stunde kippt.

### Was für den Archetyp-Kanal fehlt, ist etwas anderes

`Formatwissen: 0`, in beiden Läufen. Die 26 Bestandsbeiträge stammen vom
Owner, nicht aus der Pipeline. Sie tragen **keinen Archetyp**, weil das
System nie einen entschieden hat. Ihn nachträglich zu vergeben, damit
das Feld gefüllt aussieht, wäre erfundene Vorgeschichte — und sie flösse
als Formatwissen in genau die Entscheidung ein, die der Nachweis prüft.

Dieser Kanal öffnet sich erst, wenn **selbst erzeugte** Beiträge
veröffentlicht und gemessen sind. Das ist eine Owner-Entscheidung, keine
Implementierungsaufgabe.
