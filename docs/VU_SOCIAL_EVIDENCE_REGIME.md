# VU SOCIAL — DAS EVIDENZREGIME

Stand: 2026-09-16 · Zweig `claude/vision-universe-social-os-eudjmx`
Owner-Entscheidung: **A — BOOTSTRAP als versioniertes Regime**, nicht als
dauerhaft reduziertes Zielmodell.

---

## 1. Das Problem, das es löst

Das kanonische Zielmodell hat neun Dimensionen. Ein junges Konto liefert
zwei. Daraus folgen zwei falsche Wege und ein richtiger:

| | |
|---|---|
| **Falsch** | Fehlende Dimensionen als 0 verrechnen. Dann lernt das System, dass jeder Beitrag schlecht war — aus der Tatsache, dass dieses Konto überhaupt keine Speicherungen hat. |
| **Falsch** | Die Mindestabdeckung senken, bis die Daten genügen. Das schafft das mehrdimensionale Modell ab und behält den Namen. |
| **Richtig** | Ausdrücklich sagen, welche Dimensionen die Datenlage trägt, warum die übrigen ausgeschlossen sind, und jede Bewertung damit etikettieren. |

Die kanonische Mindestabdeckung von 50 % bleibt **unangetastet**. `ER15`
prüft das ausdrücklich: derselbe Schnappschuss bekommt kanonisch keinen
Score und im Regime einen.

---

## 2. Vier Ausschlussgründe, vier Antworten

Der Wert des Moduls liegt nicht im Ausschließen, sondern im
Unterscheiden:

| Zustand | Bedeutung | Was hilft |
|---|---|---|
| `NOT_APPLICABLE` | Die Plattform kennt die Größe für diesen Medientyp nicht | nichts — mehr messen ändert daran nichts |
| `INSUFFICIENT_EVIDENCE` | Zu wenige Messwerte (< 5) | mehr Beiträge |
| `DEGENERATE` | Alle Werte gleich, oder Median 0 | mehr Engagement, nicht mehr Daten |
| `NO_INPUT` | Interne Bewertung, die es nur für selbst erzeugte Beiträge gibt | eigene Beiträge veröffentlichen |

Wer diese vier zusammenfasst, sucht Fehler an der falschen Stelle. Ein
Bildbeitrag mit „zu wenig Daten" bei der Verweildauer brächte jemanden
dazu, mehr Bilder zu messen — und die Verweildauer gibt es dort gar
nicht.

---

## 3. Kohorten: ein Reel ist kein Bildbeitrag

Verweildauer gibt es beim einen und nicht beim anderen. Reichweite
bedeutet bei beiden etwas anderes. Beurteilt, verglichen und bewertet
wird deshalb **je Medientyp**, mit eigener Vergleichsbasis.

Ein gemeinsamer Median wäre eine Zahl, die keinen von beiden beschreibt.

Gemessen am realen Konto:

```
REEL       n=7   Reichweite Median 24   aktiv: reach, engagement
CAROUSEL   n=5   Reichweite Median  8   aktiv: reach, engagement
```

---

## 4. Übergänge kommen aus der Messung

Kein Datum, keine Handeingabe:

| Regime | Belegte Gewichtung | Stichprobe |
|---|---|---|
| `MATURE` | ≥ 85 % | ≥ 50 |
| `GROWING` | ≥ 45 % | ≥ 20 |
| `BOOTSTRAP` | darunter | — |

Das Gesamtregime ist das **niedrigste** der Kohorten. Eine Anlage, die
sich MATURE nennt, weil eine von zwei Kohorten reif ist, behandelte die
andere mit einer Zuversicht, die es dort nicht gibt (`ER13`).

Sobald Saves, Shares, Follower-Wachstum oder — für eigene Beiträge —
Qualität und Markenpassung belastbar werden, steigt der Anteil der
belegten Gewichtung von selbst, und das Regime wandert mit.

---

## 5. Keine Rückwirkung

Ein Wert aus `BOOTSTRAP` und einer aus `MATURE` sind **verschiedene
Größen mit demselben Namen**. Deshalb:

- Jede Bewertung trägt ihr Regime (`performanceRegime`) und die
  Methodik-Version (`1.0.0+bootstrap.reel`).
- Die Learning Engine vergleicht **nur innerhalb eines Regimes**. In
  einem gemeinsamen Mittelwert sähe der Regimewechsel wie eine
  Verbesserung aus.
- Historische Strategieversionen werden **nicht umgeschrieben**. Sie
  bleiben gültig *für ihr Regime*.
- Die Regime-Kette liegt **getrennt** von der Versionskette: ein
  Regimewechsel ändert den Maßstab, nicht die Absicht. Beides in einen
  Topf zu werfen hieße, dass „die Strategie hat sich geändert" zwei
  verschiedene Dinge bedeuten kann.

Festgehalten wird pro Übergang: `evidenceRegime`, aktive Dimensionen,
ausgeschlossene Dimensionen samt Grund und Zustand, Stichprobengröße,
Anteil der belegten Gewichtung, Vergleichsbasis, Methodik-Version,
Zeitpunkt und Übergangsgrund.

---

## 6. Keine zweite Bewertungslogik

Das Modul **bewertet nichts**. Es entscheidet, woran bewertet werden
darf, und übergibt das Ergebnis als Methodik an `performance.score` —
dieselbe Engine wie zuvor, andere Gewichte, auf 1 normiert.

Eine zweite Bewertungslogik wäre der Ort, an dem dieselbe Regel später
zweimal steht und eine davon falsch ist.
