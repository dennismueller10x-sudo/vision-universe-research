# Strategie-Vorlage S3: „Etablierter Aufwärtstrend“ (8 Kriterien)

**Teil des Pakets AP8** ([STRATEGY_TEMPLATES_PLAN.md](STRATEGY_TEMPLATES_PLAN.md)).
- Baut auf S1 (Vorlagen-Modell) und den Fachmodell-Feldern aus S2 auf: L1 SMA 150, L2 Richtung der SMA 200, L3 Abstand zum 52-Wochen-Tief, L4 RS-Rang, L5 Ausbruchsrichtung.
- **Angeboten wird die Vorlage erst, wenn alle benötigten Felder im Abfragekatalog stehen** (`templates.js#available`). Vor der Freigabe der S2-PRs ist sie unsichtbar.
- **Kein Name einer Person oder eines Anbieters im Produkt**, keine Andeutung einer offiziellen Verbindung oder Zertifizierung (Owner-Entscheidung 30.10., Test).

## 1. Kriterien

| # | Kriterium | Felder | Begründung im Produkt |
|---|---|---|---|
| 1 | Kurs über SMA 150 und SMA 200 | `aboveSma150` und `aboveSma200` | Mittel- und langfristiger Trend zeigen nach oben. |
| 2 | SMA 150 über SMA 200 | `sma150AboveSma200` | Die langfristigen Durchschnittslinien stehen in Aufwärtsordnung. |
| 3 | SMA 200 steigt seit mindestens einem Monat | `sma200Rising` (21 Handelstage) | Die 200-Tage-Linie liegt höher als vor 21 Handelstagen. |
| 4 | SMA 50 über SMA 150 und SMA 200 | `sma50AboveSma150` und `sma50AboveSma200` | Der kürzere Durchschnitt führt die längeren an. |
| 5 | Kurs über SMA 50 | `aboveSma50` | Auch kurzfristig liegt der Kurs über seinem Durchschnitt. |
| 6 | Mindestens 30 % über dem 52-Wochen-Tief | `distLow52w ≥ 0,30` (Tagestief) | Der Kurs hat sich deutlich vom Jahrestief gelöst. |
| 7 | Höchstens 25 % unter dem 52-Wochen-Hoch | `distHigh52w ≥ −0,25` | Der Kurs ist nicht weit vom Jahreshoch entfernt. |
| 8 | RS-Rang mindestens 70 | `rsRank ≥ 70` | Die relative Stärke über 6 Monate gehört zum oberen Drittel aller aktuellen Aktien. |

- **Kriterien 1 und 4** bestehen aus zwei Bedingungen und zählen als ein Kriterium. Eine nicht erfüllte Bedingung macht das Kriterium „nicht erfüllt“; sonst macht eine unbekannte es „unbekannt“ (Test).
- **Wie jede Vorlage:**
  - nur Titel mit aktuellem Kurs;
  - „Fast erfüllt“ heißt genau ein tatsächlich nicht erfülltes Kriterium;
  - „Unvollständig“ heißt: nichts verfehlt, aber etwas unbekannt;
  - Sortierung nach RS-Rang.
- **Keine Renditen, keine Trefferquoten:** Historische Tests sind S4 und brauchen eine eigene Freigabe.

## 2. Weitere S3-Änderung

„Dreieck mit Ausbruch nach oben“ nutzt mit L5 das Abfragefeld `formationConfirmedUp`.
- Ohne L5 bleibt es bei der Richtung aus der Spalte `formations`.
- Beide Wege liefern dieselben Titel (Test).
- Mit L5 ist die Vorlage im Screener-Baukasten vollständig anpassbar.

## 3. Ergebnis auf dem Probestand (S1 + L1–L5 zusammengeführt, Stichtag 28.10.2026)

| | Titel |
|---|---|
| alle 8 Kriterien erfüllt | 639 |
| fast erfüllt (genau eines fehlt) | 446 |
| unvollständig | 1 |

Fehlendes Kriterium bei „fast erfüllt“:

| Kriterium | Titel |
|---|---|
| Kurs über SMA 50 | 215 |
| RS-Rang | 55 |
| 30 % über dem Tief | 44 |
| SMA 150 über SMA 200 | 43 |
| 25 % unter dem Hoch | 33 |
| SMA 200 steigt | 29 |
| SMA 50 über SMA 150/200 | 27 |

Erfüllt je Kriterium (5.347 aktuelle Titel):

| # | Kriterium | erfüllt |
|---|---|---|
| 1 | Kurs über SMA 150 und SMA 200 | 1.801 |
| 2 | SMA 150 über SMA 200 | 2.498 |
| 3 | SMA 200 steigt | 2.265 |
| 4 | SMA 50 über SMA 150 und SMA 200 | 1.985 |
| 5 | Kurs über SMA 50 | 1.842 |
| 6 | 30 % über dem Tief | 2.406 |
| 7 | 25 % unter dem Hoch | 2.524 |
| 8 | RS-Rang ≥ 70 | 1.602 (unbekannt bei 15) |

**Hinweis zur Sortierung:** Ganz oben stehen Titel mit sehr großen Kurssprüngen im Jahr (RS-Rang nahe 100). Ein Teil davon kann auf Datenqualität beruhen (SCREENER_FIELDS_AP8_L3.md §2). Die Checkliste und das Chart Studio machen das je Titel prüfbar.
