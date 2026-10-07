# Mission IX: Wave-3-Freeze vor VAL (Bucket 1/4)

Committet **vor** der Auswertung der Wave-3-VAL-Stichprobe. Die VAL-Forensik (`replay.mjs --grid quarter --forensics`, Bucket 1/4) läuft noch; Ergebnisse gibt es keine. Definitionen: `track-b.mjs` (Freeze-Commit `82fcbca1`). Entscheidung: `decide-m9.mjs` `decideElliott`.

Status: **explorativ** (siehe Präregistrierung §4, Offenlegung). VAL prüft neue Titel im gleichen Kalender.

DEV-Befund (Bucket 0/4, 75.288 Einheiten). Vergleich gegen nicht markierte Einheiten derselben Schicht:

| Signal | 5×/24M [95 %] | 2×/12M [95 %] | gedeckelter Überschuss 24M [95 %] | Median 24M (Basis 8,8 %) | Top-5-%-Anteil |
|---|---|---|---|---|---|
| EW_INT_UP_EARLY | 1,40 [1,09; 1,75] | 1,15 [1,04; 1,26] | +1,8 % [−2,1; +5,7] | 5,4 % | 82 % |
| EW_INT_UP_ANY_OPEN | 1,35 [1,05; 1,64] | 1,18 [1,08; 1,28] | +0,1 % [−2,7; +2,9] | 6,6 % | 78 % |

Vorab festgelegte Erwartungen für VAL:
* **HE1:** EW_INT_UP_EARLY, 5×/24M, Schichtvergleich: Untergrenze > 1.
* **HE2:** EW_INT_UP_ANY_OPEN, 5×/24M: Untergrenze > 1.
* **HE3:** Kein robuster Renditevorteil: Das 95-%-KI des gedeckelten Überschusses (24M) enthält 0, und der Median der 24M-Rendite liegt nicht über dem der Basis.
* **HE4:** Mit `--gate full` (Ausschluss auch bei Sprüngen nach t) bleibt der 5×/24M-Punktwert von EW_INT_UP_EARLY > 1. Andernfalls gilt der DEV-Befund als Datenanomalie-verdächtig.

Wenn HE1 und HE2 auf VAL halten, ergibt sich nach §4 höchstens „INCREMENTAL PREDICTIVE VALUE (explorativ, verbrauchte Daten)“ für ein **nicht angezeigtes** internes Merkmal. Für das Produkt folgt daraus nichts ohne eine prospektive Bestätigung.
