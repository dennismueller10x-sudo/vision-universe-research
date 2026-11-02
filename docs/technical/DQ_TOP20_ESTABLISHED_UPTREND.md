# Datenqualität: die 20 höchstplatzierten Treffer von „Etablierter Aufwärtstrend“

Prüfung am 30.10.2026 auf dem Produktionsstand (Stichtag 29.10.).
- Sortierung wie im Produkt: RS-Rang absteigend.
- Geprüft wurden die Tagesbars der Materialisierung (`technical-signals-v1`) über 126 Handelstage. Das ist das Fenster von `rs6m`.
- **Keine Kurskorrektur und keine Änderung der Ranking-Methodik**: Beides bräuchte eine Freigabe.

## 1. Methode

Je Titel wurde geprüft:
- größter Tagessprung (Schluss zu Schluss) und Anteil dieses einen Tages an der 6-Monats-Rendite (log);
- Sprünge ab ×1,5 oder ×0,6, mit dem Volumen am Sprungtag im Verhältnis zum Median der 20 Tage davor;
- Split-Muster: ganzzahliger Faktor ±2 % ohne Kennzeichen;
- Kapitalmaßnahmen-Kennzeichen in den Bars (`corporateActionFlags`);
- Kurs unter 1 $ im Fenster;
- Median-Tagesumsatz der letzten 20 Tage.

Bewertung eines Sprungs:
- **Echtes Ereignis:** hohes Volumen am Sprungtag (Vielfaches des Medians).
- **Datenverdacht:** Ein Faktorsprung bei niedrigem Volumen und mit Eröffnung ≈ Vielfaches des Vortagesschlusses spricht für einen unbereinigten Split.

## 2. Ergebnis

| # | Titel | RS-Rang | 6 Monate | größter Tag | Umsatz Mio. $/Tag | Bewertung |
|---|---|---|---|---|---|---|
| 1 | GIBO | 100 | 5533,6 % | 2026-06-30 · ×18,16 | 3,3 | **Datenfehler (Verdacht stark):** 30.06. Schluss 1,25 → 22,70, Eröffnung 24,74 ≈ 20 × 1,25, Volumen 0,3 × Median. Unbereinigter Reverse-Split 1:20; kein Kapitalmaßnahmen-Kennzeichen in den Bars, Reihe als „SPLIT_ADJUSTED“ ausgewiesen. DQ-PX-3 meldet ihn bereits. RS-Rang 100 und Treffer sind Artefakte |
| 2 | MRNA | 99,9 | 384,9 % | 2026-08-19 · ×2,77 | 3734,4 | Einzelsprung 19.08. ×2,77 bei 36,7-fachem Volumen: echtes Ereignis, Daten plausibel |
| 3 | REPL | 99,9 | 576,7 % | 2026-07-31 · ×2,07 | 21,8 | zwei Sprünge (29.05. ×1,86; 31.07. ×2,07) bei 9- bzw. 10-fachem Volumen: Ereignisse, plausibel |
| 4 | ABLV | 99,8 | 290,5 % | 2026-10-13 · ×1,30 | 0,3 | Penny-Phase (Tief 0,60 $), Tagesumsatz 0,33 Mio. $; Einbruch 12.10. ×0,56 bei 6-fachem Volumen: plausibel, aber illiquide |
| 5 | RCEL | 99,8 | 286,8 % | 2026-08-07 · ×1,64 | 5,2 | unauffällig |
| 6 | ZCSH | 99,8 | 330,1 % | 2026-05-20 · ×1,28 | 43,6 | Split am 30.09. gekennzeichnet, Reihe ohne Sprung: korrekt bereinigt |
| 7 | BUUU | 99,7 | 265 % | 2026-05-06 · ×1,25 | 3,7 | Split am 26.10. gekennzeichnet, Reihe ohne Sprung: korrekt bereinigt |
| 8 | CYPH | 99,7 | 272,3 % | 2026-06-08 · ×1,37 | 32,6 | Penny-Phase (Tief 0,52 $); Einbruch 05.06. ×0,53 bei 7-fachem Volumen: plausibel |
| 9 | OABI | 99,7 | 276,3 % | 2026-08-07 · ×1,38 | 6,0 | unauffällig |
| 10 | TXG | 99,7 | 269,8 % | 2026-07-09 · ×1,15 | 292,2 | unauffällig |
| 11 | ABCL | 99,6 | 215,2 % | 2026-08-10 · ×1,35 | 48,4 | unauffällig |
| 12 | CDNA | 99,6 | 243,7 % | 2026-07-16 · ×1,36 | 95,8 | unauffällig |
| 13 | SMWB | 99,6 | 219,6 % | 2026-08-12 · ×1,21 | 3,4 | unauffällig |
| 14 | OKTA | 99,5 | 201,2 % | 2026-05-29 · ×1,30 | 578,5 | unauffällig |
| 15 | GRAL | 99,4 | 191,7 % | 2026-09-21 · ×1,34 | 121,0 | unauffällig |
| 16 | TEAM | 99,4 | 197,6 % | 2026-08-07 · ×1,35 | 460,2 | unauffällig |
| 17 | TWST | 99,4 | 196,7 % | 2026-08-19 · ×1,23 | 392,6 | unauffällig |
| 18 | SLN | 99,3 | 170,9 % | 2026-10-19 · ×2,26 | 16,9 | Einzelsprung 19.10. ×2,26 bei 73,6-fachem Volumen, danach fast unverändert bei 19,6: Muster eines Übernahmeangebots zum Festpreis; Daten plausibel, „Trend“ fachlich ein Sonderfall |
| 19 | USIO | 99,3 | 180,2 % | 2026-05-14 · ×1,21 | 0,4 | Tagesumsatz 0,45 Mio. $: illiquide, sonst unauffällig |
| 20 | HNGE | 99,2 | 162,1 % | 2026-08-07 · ×1,12 | 173,5 | unauffällig |

**Zusammenfassung:**
- **1 Datenfehler: GIBO, Platz 1.** Wahrscheinlich ein unbereinigter Reverse-Split 1:20 am 30.06.2026.
  - Die 6-Monats-Rendite (+5.534 %), der RS-Rang 100 und der Treffer beruhen darauf.
  - Die bestehende Regel DQ-PX-3 (unplausible Tagessprünge) meldet die Reihe bereits.
  - DQ-TW-8 (Lunten-Tief) greift hier nicht, weil es kein Lunten-Tief ist.
  - Im Produkt ist der Titel nicht gekennzeichnet.
- **2 korrekt bereinigte Splits:** ZCSH und BUUU.
- **3 Titel mit einzelnen großen Ereignistagen bei sehr hohem Volumen:** MRNA, REPL und SLN.
  - Die Daten sind plausibel.
  - SLN zeigt das Muster eines Übernahmeangebots (Kurs seit dem Sprung fest bei 19,6).
- **Penny-Phasen:** ABLV und CYPH. **Geringer Umsatz** (unter 1 Mio. $ am Tag): ABLV und USIO.
- **Übrige 11 Titel:** unauffällig.
- **RS-Werte:**
  - Alle 20 liegen zwischen 99,2 und 100. Der RS-Rang ist ein Perzentil und unterscheidet an der Spitze kaum noch.
  - Die Reihenfolge der ersten 20 folgt praktisch der Höhe der 6-Monats-Rendite (162 % bis 5.534 %).

## 3. Optionen zur Entscheidung (nicht umgesetzt)

1. **GIBO an der Quelle bereinigen.**
   - Das gehört zur Marktdaten-Domäne: Split-Faktor aus dem Anbieter nachziehen, wie bei A4.
   - Braucht einen Anbieterabruf und deshalb eine Freigabe.
   - Danach rechnet der Erzeuger alles automatisch neu.
2. **Kennzeichnung im Produkt ohne Ausschluss.**
   - Ein Titel mit einer DQ-PX-3-Meldung im 126-Tage-Fenster bekommt in der Vorlage und im Chart Studio den Hinweis „Datenverdacht: Kurssprung ×18 am 30.06.“.
   - Neues Feld im Datenvertrag, Vorher/Nachher-Nachweis nötig.
3. **Neue Ausschlussregel:** Ein solcher Titel gilt beim RS-Kriterium als „unbekannt“.
   - Das ist eine Änderung der Ranking- bzw. Vorlagenlogik und braucht eine eigene Freigabe mit Vorher/Nachher.
   - Auf dem Stand vom 29.10. beträfe sie in den Top 20 nur GIBO.

Empfehlung: Option 1, dazu Option 2 als dauerhafte Kennzeichnung. Option 3 nur, wenn Option 1 nicht möglich ist.
