# Gap-Analyse — aktuelle Social-Architektur gegen den North Star

**Stand 2026-09-19.** Gemessen am Repository, nicht an der Erinnerung.
Jede Zahl unten ist im Code nachzählbar.

> Der Auftrag bricht in §24 mitten im Satz ab. Diese Analyse folgt der
> erkennbaren Absicht (CURRENT SOCIAL ARCHITECTURE gegen das SOCIAL
> MEDIA INTELLIGENCE & GROWTH SYSTEM aus §1). Falls nach §24 weitere
> Punkte standen, fehlen sie hier.

---

## 0. Der eine Satz

Das System beantwortet heute hervorragend die Frage **„Ist dieser Text
korrekt und handwerklich gut?"** und hat nie die Frage gestellt
**„Sollte Vision Universe hierüber überhaupt sprechen — und versteht das
jemand?"**

Ein System, das nur seine eigene Fragestellung optimiert, wird darin
immer besser. Dass die Frage selbst die falsche war, kann es aus sich
heraus nicht bemerken.

---

## 1. Der strukturelle Kern: `topic` entsteht aus einem Instrument

In `signals.js` gilt:

```js
var topic = event.topic || (definition.label + (event.entity ? " — " + event.entity : ""));
```

Daraus wurde `"Technisches Setup — XOM"`. Das ist kein Content-Konzept,
das ist ein Datenbankereignis mit einem Bindestrich.

**Gemessen:** 12 Signaltypen. **10 davon sind an ein einzelnes
Instrument gebunden**, 2 sind breiter (`REGIME_CHANGE`,
`SECTOR_ROTATION`). **0 sind thematisch, edukativ, vergleichend oder
evergreen-konzeptuell.**

Das Content Universe **ist** das Ticker-Universum. §5 verlangt das
Gegenteil, und zwar nicht als Erweiterung der Liste, sondern als
Umkehrung der Reihenfolge:

| heute | North Star (§3) |
|---|---|
| `INTERNAL SIGNAL → HOOK` | `SOCIAL OPPORTUNITY → AUDIENCE FRAMING → STORY → HOOK` |

Die Opportunity Engine (`opportunity.js`) ist dabei **nicht** das
Problem — sie wägt bereits acht Dimensionen ab. Das Problem liegt eine
Stufe davor: sie bekommt nur Kandidaten vorgesetzt, die schon
Instrument-Ereignisse sind. Eine Auswahl kann nichts wählen, was ihr
nie vorgelegt wurde.

---

## 2. Was fehlt — nach Auftrags-Abschnitt

| § | Fähigkeit | Stand | Lücke |
|---|---|---|---|
| 5 | Breites Content Universe | **fehlt** | 10/12 Signale instrumentgebunden, 0 thematisch |
| 6 | Content Portfolio Intelligence | **fehlt** | Kein Begriff von Content Family; kein Mix-Lernen |
| 7 | Social Opportunity zuerst | **teilweise** | Engine vorhanden, Kandidatenmenge zu eng |
| 8 | Audience-First | **fehlt → jetzt begonnen** | siehe §9 |
| 9 | Audience Comprehension Gate | **gebaut** | `audience-fit.js`, 10 Tests |
| 10 | Social-native Hook Intelligence | **teilweise** | Rubrik prüft Handwerk, nicht Audience Fit |
| 11 | Evidence ≠ Story ≠ Public Copy | **vorhanden** | trägt; bleibt |
| 12 | Own Performance Learning | **schmal** | lernt `hook_variant_id`; 11 der 12 Dimensionen fehlen |
| 13 | External Social Intelligence | **deklariert, nicht gebaut** | `PLANNED_SOURCES` kennt `signals.news`, `signals.social`, `signals.audience` — alle blockiert. **Owner Gate** |
| 17–21 | Visual Intelligence | **teilweise** | Technische Integrität vollständig; Bildqualität als Kunst ungeprüft |
| 22 | Work Resource Discipline | **vorhanden** | 1 Key → 1 Job, gemessen eingehalten |

---

## 3. Was trägt und bleibt

Der XOM-Pfad hat echte Architektur bewiesen, und die wird nicht
angefasst:

Evidence Binding · Story Selection · Claim Binding · Fact Check ·
Creative Contract (`FULL_CREATIVE` / `TEXT_REVISION`) · Asset
Provenance · Binärintegrität (PNG-Kettenprüfung, Rücklesen vom
Datenträger) · GitHub-Roundtrip als Transport · Owner States ·
Invocation Ledger · Dispatch-Budget · Versionierte Kandidaten ·
Frequenzgrenzen · Kill Switch · Autonomiestufen.

**821 Tests.** Das ist das Fundament, auf dem der North Star gebaut
wird — nicht daneben.

---

## 4. Die drei Fehlerklassen, die sich wiederholt haben

Sie gelten für die neuen Nodes genauso und stehen hier, damit sie beim
Bauen präsent sind:

1. **Ein Prüfer kann nur finden, was er berechnen kann.** Die
   Score-Lücke war nie ausgerechnet worden — also konnte keine
   Prüfung die falsche Ursachenbehauptung sehen.
2. **Ein zu kleiner Zustandsraum erzeugt keine Lücke, sondern eine
   falsche Erklärung.** `HELD_FOR_ENRICHMENT`,
   `HELD_FOR_CREATIVE_REFINEMENT`, `CONTRACT_MISMATCH`, jetzt
   `HELD_FOR_AUDIENCE_FIT`.
3. **Eine Whitelist, die Felder abschreibt, lässt irgendwann das neue
   liegen.** Heute dreimal an einem Tag: `Authoring.variant()`, der
   Kandidatenbau, `Creative.best()`.

Und eine vierte, neu: **Ein zu weit gebautes Tor ist schlimmer als
keines** — es lässt genau den Fall durch, für den es gebaut wurde, und
liefert dem Durchlassen auch noch eine Begründung.

---

## 5. Owner Gates, die auf dem Weg liegen

- **§13 External Social Intelligence.** Jede reale Quelle braucht
  API-Zugang, Lizenz oder Scraping. `PLANNED_SOURCES` hält die Slots
  bereits offen und nennt die Blocker. Nichts davon wird ohne
  ausdrückliche Freigabe aktiviert.
- **§17 Visual Direction.** Was „hochwertiger Editorial-Look" für
  Vision Universe konkret heißt, ist eine Markenentscheidung. Messbar
  machen lässt sich erst, was benannt ist.
