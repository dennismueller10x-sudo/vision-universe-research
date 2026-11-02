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

## 3. Ergebnis im Produktionsstand (L1–L5 und S1 auf `main`, Erzeuger, Stichtag 29.10.2026)

Datensatz: automatischer Lauf vom 30.10. (`b65def8`), danach mit L1–L5 je PR mit dem Erzeuger neu gebaut; 5.661 Titel, davon 5.349 mit aktuellem Kurs. Die bisherigen 150 Spalten sind dabei byte-gleich geblieben.

| | Titel |
|---|---|
| alle 8 Kriterien erfüllt | 685 |
| fast erfüllt (genau eines fehlt) | 440 |
| unvollständig (nichts verfehlt, RS-Rang unbekannt) | 1 (ASND) |

Fehlendes Kriterium bei „fast erfüllt“:

| Kriterium | Titel |
|---|---|
| Kurs über SMA 50 | 188 |
| RS-Rang | 56 |
| SMA 150 über SMA 200 | 52 |
| 30 % über dem Tief | 50 |
| SMA 50 über SMA 150/200 | 34 |
| 25 % unter dem Hoch | 33 |
| SMA 200 steigt | 27 |

Erfüllt je Kriterium (5.349 aktuelle Titel):

| # | Kriterium | erfüllt |
|---|---|---|
| 1 | Kurs über SMA 150 und SMA 200 | 1.892 |
| 2 | SMA 150 über SMA 200 | 2.513 |
| 3 | SMA 200 steigt | 2.282 |
| 4 | SMA 50 über SMA 150 und SMA 200 | 1.965 |
| 5 | Kurs über SMA 50 | 2.037 |
| 6 | 30 % über dem Tief | 2.453 |
| 7 | 25 % unter dem Hoch | 2.564 |
| 8 | RS-Rang ≥ 70 | 1.603 (unbekannt bei 14) |

## 4. Prüfung an realen Aktien

- **Unabhängige Nachrechnung:** Für alle 1.126 Titel (erfüllt, fast erfüllt, unvollständig) wurden die acht Kriterien ohne die Engines aus den Tagesbars nachgerechnet:
  - einfache Durchschnitte über die Schlusskurse;
  - 52-Wochen-Tief und -Hoch über 252 Tagesbars;
  - RS-Rang als Perzentil von `rs6m` über die aktuellen Titel.
  - Ergebnis: **0 Abweichungen**.
- **Chart Studio:** Die Checkliste (`templates.js#checklist`) liefert für jeden dieser Titel dieselben Zustände wie die Liste. Geprüft in der Ansicht für MRNA (erfüllt), NVDA (fast erfüllt, Kurs unter SMA 50) und ASND (unvollständig, RS-Rang unbekannt), iPhone-Breite 390 px, ohne seitliches Scrollen.
- **Unbekannte Werte:** Sie gelten nie als erfüllt oder nicht erfüllt. ASND erscheint deshalb nicht unter „fast erfüllt“, sondern unter „unvollständig“.

## 5. Datenqualität: Lunten-Tiefs (Owner-Auflage zu L3)

- **DQ-TW-8** (#1155) prüft bei jedem Lauf für alle aktuellen Titel, ob das 52-Wochen-Tagestief eine Lunte ist (unter der Hälfte von min(Eröffnung, Schluss)).
  - Gemeldet wird jeder vollständige Treffer einer Vorlage mit `distLow52w`, der darauf beruht.
  - Die Regel kennzeichnet nur: keine Kurskorrektur, keine Ausschlussregel.
- **Stand 29.10.:**
  - 6 Titel mit Lunten-Tief: AREB, DRCT, IGC, JL, MBRX, STFS.
  - Keiner erfüllt mehr als 3 der 8 Kriterien.
  - DQ-TW-8 PASS mit 685 geprüften Treffern.
- **Hinweis zur Sortierung:** Ganz oben stehen Titel mit sehr großen Kurssprüngen im Jahr (RS-Rang nahe 100). Die Checkliste und das Chart Studio machen jeden Treffer prüfbar.
