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

### Durchgang A' — wie es mit einem sichtbaren Beitrag aussähe (n=1)

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

### Durchgang B — simulierte Evidenz (n=16)

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
