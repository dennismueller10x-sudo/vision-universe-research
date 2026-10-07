# Mission IX: Genauigkeit unter fairer Geometrie, asymmetrische Gewinner und Wave 3

Stand: 07.10.2026. Engine eingefroren: `ti-scenario-1.2.1` / `elliott-3.2.2` (Datei-Hashes identisch mit dem Mission-VIII-Freeze).

Unterlagen:
* Präregistrierung: [MISSION9_PREREGISTRATION.md](MISSION9_PREREGISTRATION.md) (Freeze-Commit `82fcbca1`);
* Öffnungsprotokoll: [MISSION9_OPENING_LOG.md](MISSION9_OPENING_LOG.md);
* Tabellen: [hsab/MISSION9_TABLES.md](hsab/MISSION9_TABLES.md);
* Red Team: [reviews/MISSION9_METHODOLOGY_REDTEAM.md](reviews/MISSION9_METHODOLOGY_REDTEAM.md);
* Evidenz: `quant/data/technical-intelligence/historical-accuracy/mission9/` und `technical-intelligence-evidence-v3.json`.

---

## Die zwei Fragen

### Frage 1: Erreicht Vision Universe eine echt hohe Trefferquote, wenn Ziel-/Invalidationsgeometrie und Marktbasis kontrolliert sind?

**Nein.**

Hohe Trefferquoten von VU entstehen dort, wo das Ziel nah und die Invalidation weit weg liegt:
* Woche: CRV < 0,5 mit 71 % Treffern; Tag (Mission VIII): 69 %.
* Eine Kontrolle mit **denselben** Abständen am selben Tag trifft dort ebenfalls 69 %.

Bei fairer, symmetrischer Geometrie (Ziel ≈ Invalidation, CRV 0,75–1,33):
* VU trifft 49 % gegen 47 % der Kontrolle.
* Die obere 95-%-Grenze der Trefferquote liegt bei 51 %.

Keine Teilmenge erreicht ≥ 60 % mit ≥ +5 Pp. Vorsprung, weder nach Klarheit noch nach Übereinstimmung, weder symmetrisch noch günstig. Der echte Vorsprung beträgt in jeder Geometrie-Klasse +1 bis +4 Pp. und entspricht dem, was der einfache Trend allein liefert (Differenz FULL − TREND_ONLY ≤ 0,3 Pp.).

Bestätigung auf 1.200 neuen Titeln (Tag, einmal geöffnet): **NO HIGH-ACCURACY EDGE**.
* Bei nahen Zielen (CRV < 0,5) trifft VU 81,2 %, die Kontrolle gleicher Abstände 80,7 %.
* Symmetrisch trifft VU 54,9 % gegen 53,2 % (Lift +1,7 Pp. [0,2; 3,1]; gegen die Trend-Kontrolle E +1,2). Die obere Grenze der Trefferquote liegt bei 57,5 %.
* Keine Stufe erfüllt das Kriterium.

### Frage 2: Schafft VU einen überlegenen Erwartungswert, indem es seltene langfristige Extremgewinner früh erkennt, auch bei geringerer Trefferquote?

**Nein, eher das Gegenteil.**

Ein bullisches VU-Bild senkt die Chance, dass ein Titel binnen 24 Monaten 5× macht (+400 %):
* gegenüber vergleichbaren Titeln mit gleichem Trend, gleichem Momentum-, Volatilitäts- und Abstands-Terzil und gleichem Alter um rund ein Drittel: Verhältnis 0,62 bzw. 0,64, beide 95-%-KI < 1, auf zwei getrennten Titelhälften;
* gegenüber dem Gesamtmarkt desselben Quartals um rund 45 %;
* in der delisteten Kohorte ebenso: 0,65 [0,44; 0,91].

Extremgewinner kommen überwiegend aus Lagen, die VU (zu Recht nach seiner Logik) nicht bullisch nennt.

Einfache relative Stärke (26 Wochen, Top 20 %) leistet mehr als jedes VU-Signal (Verhältnis 1,5–1,7). Ihr Renditevorteil nach Deckelung der Ausreißer ist klein (+1 bis +4 %) und nicht in jeder Stichprobe gesichert. Das ist ein bekannter einfacher Faktor, keine VU-Leistung.

Ein **intern** gefundener, vom Produkt **nicht angezeigter** Elliott-Kandidat („frühe Aufwärts-Motivwelle“) erhöht die 5×-Häufigkeit um etwa 1,35–1,4×. Das gilt nur explorativ, auf verbrauchten Daten und ohne Renditevorteil. Ein Zusatzwert über relative Stärke hinaus ist nicht gesichert.

---

## 1. Was gemessen wurde und wie belastbar es ist

| Teil | Daten | Status | Belastbarkeit |
|---|---|---|---|
| Track A Woche | Überlebende, DEV (Bucket 0/2, 94.685 Ereignisse), VAL (1/2, 91.936) | verbrauchte Daten | Entwicklung und Validierung |
| Track A Tag | **A9_CONFIRM:** 1.200 Stammaktien mit Hash-Rang 1200–2399, disjunkt zu Mission VIII, 2017–2026 | einmal geöffnet nach Präregistrierung | **bestätigend (bedingt: Kalender bekannt)** |
| Track B | Titel × Quartal (≥ 160 Wochen Historie). DEV 150.933, VAL 147.759 Einheiten; delistete Kohorte als Sensitivität | verbrauchte Daten | **explorativ mit Gegenprobe**; kein frischer Holdout möglich |
| Wave 3 | interne Elliott-Kandidaten an Quartalsenden (Forensik-Haken). DEV 75.288, VAL 75.555 Einheiten | verbrauchte Daten | explorativ; VAL-Erwartung vorab committet |
| Fallstudie PLTR | ein Titel | — | nur Erklärung |

Ehrliche Herabstufung: Für die Wochenengine und für alle Langfrist-Horizonte gibt es keinen unberührten Datensatz. Die Delisted-Kohorte ist im Mission-VIII-Holdout verbraucht; prospektive Daten reichen für 6–36 Monate nicht. Deshalb erreicht nur Track A (Tag) Bestätigungsniveau.

---

## 2. Track A: Genauigkeit × Geometrie × Basis × Abdeckung (§44)

Ereignis: angezeigtes Hauptszenario am Erkennungszeitpunkt. Treffer: Ziel 1 vor einem Schluss jenseits der Invalidation, innerhalb von 26 Wochen bzw. 126 Tagen.
* Kontrolle D: gleiches Datum, andere Titel, **gleiche Abstände in ATR**.
* Kontrolle E: zusätzlich einfacher Trend und ATR%-Terzil.
* CRV: Zielabstand / Invalidationsabstand.

**Woche (DEV / VAL), nach CRV** (ausführlich in MISSION9_TABLES.md):

| CRV-Klasse | Anteil | Treffer VU | Kontrolle D | Lift Pp. [95 %] | Payoff (Ø Gewinner / Ø Verlierer, R) | E[R] strukturell | Lift TREND_ONLY |
|---|---|---|---|---|---|---|---|
| < 0,5 (nahes Ziel) | 43 % | 71,0 / 71,5 % | 69,2 / 69,1 % | +1,8 / +2,4 | 0,24 | −0,13 / −0,12 | +2,0 / +2,2 |
| 0,5–0,75 | 24 % | 58,1 / 58,8 % | 55,4 / 55,9 % | +2,7 / +2,9 | 0,55 | −0,11 / −0,10 | +2,6 / +2,8 |
| **0,75–1,33 symmetrisch** | 24 % | **49,3 / 49,2 %** | 47,1 / 47,3 % | **+2,2 [1,3; 3,0] / +1,9 [1,0; 2,9]** | 0,83 / 0,84 | −0,11 | +2,4 / +2,0 |
| 1,33–2 | 7 % | 38,7 / 39,0 % | 36,6 / 37,4 % | +2,1 / +1,5 | 1,33 | −0,12 / −0,11 | +1,8 / +1,0 |
| 2–3 | 2 % | 28,9 / 28,1 % | 29,0 / 28,9 % | −0,1 / −0,8 | 2,0–2,1 | −0,14 / −0,13 | +0,8 / −0,4 |
| ≥ 3 | 1 % | 22,4 / 18,9 % | 22,0 / 21,3 % | +0,4 / −2,4 | 2,7–3,0 | −0,23 / −0,31 | −0,6 / −2,5 |

**Tag, A9_CONFIRM (einmalig, 1.200 neue Titel, 2017–2026)**, gleiche Klassen:

| CRV-Klasse | Anteil | Treffer VU | Kontrolle D | Lift Pp. [95 %] | Lift gg. E | Payoff | E[R] | Lift TREND_ONLY |
|---|---|---|---|---|---|---|---|---|
| alle | 100 % | 69,1 % | 67,9 % | +1,2 [0,4; 2,0] | +0,9 | 0,43 | −0,01 | +1,4 |
| < 0,5 | 50 % | 81,2 % | 80,7 % | +0,5 [−0,3; 1,3] | — | 0,21 | −0,02 | +0,8 |
| 0,5–0,75 | 22 % | 64,9 % | 63,3 % | +1,6 [0,5; 2,7] | — | 0,52 | −0,01 | +2,1 |
| **0,75–1,33 symmetrisch** | 20 % | **54,9 %** | 53,2 % | **+1,7 [0,3; 3,2]** | +1,2 | 0,79 | −0,02 | +1,8 |
| 1,33–2 | 6 % | 46,1 % | 42,8 % | +3,2 [0,5; 5,9] | +3,6 | 1,20 | +0,02 | +2,3 |
| 2–3 | 2 % | 35,8 % | 32,7 % | +3,1 [−1,4; 7,5] | — | 1,87 | +0,03 | +1,3 |
| ≥ 3 | 1 % | 26,8 % | 26,0 % | +0,8 [−4,2; 5,8] | — | 2,60 | −0,06 | +1,1 |

Die Selektivitätsschwellen (Wochen-Quantile) markieren auf Tagesdaten 23 % (TOP25) bzw. 12 % (TOP10) der Ereignisse.

**Antworten (§44):**
1. **Hochgenaue Teilmenge?** Nein. Weder auf DEV noch auf VAL erfüllt eine Klasse oder Stufe das vorab festgelegte Kriterium: ≥ 60 % Treffer, ≥ +5 Pp. gegen D **und** E, CRV ≥ 0,75. Die obere KI-Grenze der Trefferquote liegt überall bei fairer Geometrie unter 60 %. Tag (A9_CONFIRM): ebenfalls nein. In keiner Klasse und keiner Stufe schließt das KI eine hohe Trefferquote nicht aus (HA1 = NO_HIGH_ACCURACY_EDGE, vorab registriert, einmal geöffnet).
2. **Trefferquote:**
   * symmetrisch 49 % (Woche);
   * beste selektive Stufe SYM·AGREEMENT_TOP10 54 % (n ≈ 1.780, 2 % der Ereignisse);
   * Tag: symmetrisch 54,9 % gegen 53,2 %; beste Stufe SYM·CLEAR 55,5 % (Lift +2,5 [0,5; 4,4], nach Holm nicht signifikant).
3. **Gematchte Basis:** symmetrisch 47 % (Kontrolle D). Gegen Kontrolle E schrumpft der Lift auf +1,5 / +1,6 Pp.
4. **Lift:** +2 Pp. symmetrisch. Selektiv bis +4,9 / +5,7 Pp. (SYM·AGREEMENT_TOP10, KI ab +2,3 Pp.), dort aber nur 54 % Treffer.
5. **Geometrie:** Die hohe Gesamtquote (59–60 % Woche, 69 % Tag) entsteht durch nahe Ziele. 43 % aller Wochenszenarien haben CRV < 0,5: Ziel im Median 1,1 ATR, Invalidation 4,3 ATR.
6. **Payoff:** 0,24 bei CRV < 0,5, 0,83 symmetrisch, 1,3–3,0 günstig. Payoff und Trefferquote tauschen sich fast genau wie bei Zufall.
7. **Erwartung:** strukturell negativ in jeder Klasse (−0,10 bis −0,31 R, Mittel −0,11 bis −0,12 R). Der Grund ist die Ausgangsregel: Zeitablauf zählt als Fehlschlag, die Invalidation wird per Schluss gemessen. Gegen die Kontrolle D bleibt ein kleiner Überschuss von +0,03 bis +0,04 R. Ausführung nach Kosten (Woche, alle): −0,33 % je Trade gegen −0,99 % der gematchten Kontrolle. Tag: strukturell −0,01 R [−0,05; +0,02], Überschuss gegen D +0,02 R [+0,00; +0,04]; Ausführung nach Kosten +0,17 % je Trade. Der gematchte Ausführungsvergleich ist auf Tagesdaten unbrauchbar: ungedeckelte Short-Verluste bei Datenaussprüngen dominieren das Kontrollmittel (−37 %). Er wird nicht verwendet (Grenze 83).
8. **Abdeckung:** symmetrisch 24 % der Ereignisse; die selektiven Stufen 2–5 %.
9. **Stichprobe:** Woche 94.685 / 91.936 Ereignisse. Tag 39.110 Ereignisse aus 915 Titeln (1.200 gezogen, 940 mit ausreichender Historie), 86.802 Analysezeitpunkte.
10. **Out-of-sample:** DEV → VAL repliziert alle vier vorab notierten Aussagen. Tagesbestätigung: ja, als Nullbefund. Auf neuen, disjunkten Titeln: NO_HIGH_ACCURACY_EDGE; Gesamtlift +1,2 Pp. [0,3; 2,0] (Mission VIII Tag: +1,0); gegen zeitnahe Zeitpunkte derselben Aktie −1,6 Pp. [−3,6; +0,4]; gegen die Gegenrichtung +1,2 [−2,0; +4,2]. Die Selektivität (HA2) ist auf Tagesdaten **nicht** nachweisbar: Top 10 % +1,8 Pp. [−0,1; +3,6], nach Holm nicht signifikant. Der Wochenbefund von +4–6 Pp. bestätigt sich hier nicht.
11. **Besser als Trend allein?** Nein. TREND_ONLY erzielt in jeder Klasse denselben Lift (Differenz ≤ 0,3 Pp. gesamt und symmetrisch; HA4).
12. **Kommerziell bedeutsam?** Nein, nicht als Treffsicherheit. „70 % Treffer“ wäre irreführend, weil eine zufällige Auswahl mit denselben Abständen fast genauso oft trifft.

---

## 3. Track B: asymmetrische Langfrist-Gewinner (§45)

**Einheiten:** jede Aktie (≥ 160 Wochen Historie) an jedem Quartalsende, ohne Vorauswahl von Gewinnern.
* Signal: VU-Zustand bis zu diesem Datum.
* Erfolg: Höchstkurs innerhalb von 6/12/24/36 Monaten ≥ 2×/3×/5×/10× des Kurses am Quartalsende.
* Vergleich (nach Red Team): **nicht markierte** Einheiten derselben Schicht (Quartal × Trend × Terzile Momentum 52W / Volatilität / Abstand zum 52W-Hoch × Alter), zusätzlich der Rest des Quartals („Datum“).
* Datenqualität: Sprünge > ×4 in [t−52, t] schließen aus.

**24 Monate, DEV / VAL:**

| Signal | Abdeckung | Recall 2× / 5× / 10× | Präzision 5× | Fehlentdeckung 5× | 5× gg. Schicht [95 %] | 5× gg. Datum | Median 24M | gedeckelter Überschuss |
|---|---|---|---|---|---|---|---|---|
| Basis (alle) | 100 % | — | 2,3 % / 2,1 % | 97,4 / 97,6 % | — | 1 | 8,8 / 9,6 % | — |
| **VU_BULL** | 44 / 45 % | 38 / 24 / 20 % · 39 / 26 / 23 % | 1,31 / 1,26 % | 98,6 % | **0,62 [0,53; 0,71] / 0,64 [0,55; 0,74]** | 0,55 / 0,57 | 8,5 / 10,0 % | −1,5 / +0,5 % |
| VU_BULL_CLEAR | 30 % | 26 / 17 / 13 % | 1,37 / 1,26 % | 98,6 % | 0,80 / 0,72 | 0,62 / 0,61 | 7,5 / 9,1 % | ≈ 0 |
| VU_BULL_STRONG | 12 % | 11 / 6 / 4–5 % | 1,36 / 1,19 % | 98,6 % | 0,78 / 0,78 | 0,68 / 0,65 | 6,1 / 8,0 % | ≈ 0 |
| VU_BULL ∧ Trend ∧ Momentum | 11 % | — | ≈ 2,1 % | ≈ 98 % | 0,81 / 0,82 | 0,90 / 0,96 | — | ≈ 0 |
| RS26 Top 20 % (einfach) | 20 % | 25 / 23 / 21 % · 25 / 24 / 24 % | 2,63 / 2,45 % | 97,1 / 97,2 % | **1,49 / 1,53** | 1,07 | 7,4 / 8,1 % | +1,7 / +2,1 % |
| 52W-Ausbruch (einfach) | 9 % | 7 / 4 / 3 % | 1,22 / 1,16 % | 98,7 % | 1,42 / 1,91 | 0,59 / 0,61 | 8,3 / 9,5 % | ≈ 0 |
| Trend ∧ Momentum Top 20 % | 17 % | 20 / 15 / 13 % | 1,99 / 1,81 % | 97,8 % | 0,96 / 1,09 | 0,85 / 0,86 | 6,5 / 7,9 % | ≈ 0 |

**Antworten (§45):**
1. **Erkennt VU künftige Extremgewinner früh?** Nein. Bullische VU-Zustände wählen Extremgewinner **seltener** aus als vergleichbare Titel ohne dieses Signal. Das gilt auf DEV und VAL, für alle vier VU-Varianten und mit oberer KI-Grenze < 1 (`decide-m9.mjs`: `vuBullHarmsSuperwinnerSelection`). Gegen den Quartalsdurchschnitt ist es noch deutlicher (0,55–0,68).
2. **Fangquote 2× (24M):** VU_BULL 38–39 % bei 44–45 % Abdeckung, also weniger als eine Zufallsauswahl gleicher Größe.
3. **3×:** 31–33 %.
4. **5×:** 24–26 %.
5. **10×:** 20–23 %.
6. **Fehlentdeckung:** 98,6 % der VU-bullischen Einheiten werden kein 5×. 84 % werden kein 2×.
7. **Median-Gewinner:** 38 % (VU_BULL), 39 % (Basis), 46 % (RS26).
8. **Ø-Gewinner:** 71–73 % (VU_BULL) gegen 81–104 % (Basis). Das Basis-Mittel ist von Datenausreißern nach t mitgetrieben; siehe 15.
9. **Median-Verlierer:** −27 / −26 %.
10. **Ø-Verlierer:** −32 %.
11. **MFE (Median des höchsten Kurses im Horizont):** +36 bis +37 % (VU_BULL), +38 % (Basis), +45 % (RS26).
12. **MAE (Median des tiefsten Rücksetzers):** −22 / −21 % (VU_BULL), −23 / −22 % (Basis), −27 / −26 % (RS26).
13. **Payoff-Verhältnis:** 2,2–2,3 (VU_BULL) gegen 2,4–3,1 (Basis).
14. **Erwartung (Kauf am Quartalsende, 24 Monate halten, ohne Kosten):**
    * VU_BULL: Mittel +22,7 / +30,2 %, Median +8,5 / +10,0 %;
    * gegen die Schicht ungedeckelt −7,8 / +5,0 % (Vorzeichen instabil);
    * mit 4×-Deckel −1,5 / +0,5 % (≈ 0).
15. **Konzentration:** In der Basis tragen die obersten 1 % der Einheiten 29–43 % aller Gewinne, die obersten 5 % 49–60 %. VU_BULL: Top 5 % = 46–48 %.
16. **Ohne die größten Gewinner:**
    * Basis-Mittel ohne Top 1 %: 19,8 / 19,7 %; ohne Top 5 %: 10,0 / 10,3 %.
    * VU_BULL ohne Top 5 %: 8,7 / 9,8 %.
    * Mit Ausschluss auch späterer Datensprünge (Sensitivität) sinken die Mittel zusätzlich. Ein Teil der extremen Mittel sind Datenfehler (Splits) nach t.
    * Kein VU-Signal behält danach einen Vorsprung, weil es vorher keinen hatte.
17. **Bringt Wave 3 / Motivinformation etwas über Trend und Momentum hinaus?** Siehe §4: Der **angezeigte** Elliott-Zustand nein (spricht fast nie). Ein **interner** Kandidat zeigt eine höhere Extremhäufigkeit. Über RS26 bzw. Trend+Momentum hinaus ist das nicht gesichert (KI enthalten 1).
18. **Reicht eine einfache Alternative?** Ja, sie ist sogar besser. RS26 Top 20 % liegt bei 1,49 / 1,53 (delistet 1,69) und hat mit 2,6 / 2,5 % die doppelte 5×-Präzision von VU_BULL. Ihr gedeckelter Überschuss (24M) beträgt +1,7 % [−1,1; +4,5] / +2,1 % [−0,5; +4,7] / delistet +4,1 % [+0,2; +8,3]: klein, nur teilweise gesichert, vor Kosten.
19. **Hält es mit delisteten Titeln?** Delistete Kohorte (CI, verbraucht, Sensitivität): ja, gleiche Richtung. In der delisteten Kohorte (18.810 Einheiten aus 1.430 Listings, 49 % der Einheiten enden mit dem Delisting im Horizont) liegt VU_BULL 5×/24M gegen die Schicht bei 0,65 [0,44; 0,91]; mit Zukunftsausschluss 0,72 [0,48; 1,00]; gegen das Quartal 0,49. RS26 liegt bei 1,69 [1,17; 2,26], gegen das Quartal aber unter 1 (0,82). VU-bullische Einheiten enden ebenso oft im Delisting wie die Basis (48 % gegen 49 %).
20. **Out-of-sample?** DEV → VAL (neue Titel, gleicher Kalender) repliziert. Eine frische Bestätigung ist nicht möglich (§1).

**Früherkennung:**
* VU_BULL markierte in den vier Quartalen vor einer 5×-Episode 47 / 51 % der Episoden, im Median 4 Quartale früher. Ab dem Signal blieb im Median noch ein Höchst-Vielfaches von 2,2.
* RS26 markiert bei weniger als halber Abdeckung (20 % gegen 44 %) gleich viele Episoden (47 / 51 %) und lässt mehr Restbewegung (2,6–2,8).
* Ein abdeckungsgleicher Zufallsvergleich fehlt für diese Kennzahl (Grenze).

**Portfolio-Simulation:** nicht gerechnet. Die vorgegebene Reihenfolge verlangt zuerst Evidenz auf Signalebene, und kein VU-Signal hat sie.

---

## 4. Elliott / Wave 3

**Angezeigte Zählung:**
* Eine laufende, nicht enthaltene Aufwärts-Motivwelle zeigt das Produkt an Quartalsenden praktisch nie: 2 von 75.288 (DEV) bzw. 4 von 75.555 (VAL) Titel-Quartalen.
* An Erkennungspunkten ist die Zählung in ≈ 2,7 % motivisch, fast immer als abgeschlossene Welle 5.
* Als Prognosemerkmal ist die angezeigte Zählung nicht auswertbar.

**Interne Kandidaten** (ausgabeneutrale Forensik-Haken; bester interner IMPULSE-Kandidat aufwärts, unvollständig, Welle 2 abgeschlossen oder Welle 3 laufend, letzte Marke ≤ 4 Wochen alt). Diese Kandidaten verwirft das Produkt zugunsten einer anderen Primärzählung.

| | DEV (Bucket 0/4) | VAL (Bucket 1/4; Erwartung vorab committet) |
|---|---|---|
| Abdeckung | 6,5 % | 6,7 % |
| 5×/24M gg. Schicht | 1,40 [1,09; 1,75] | 1,35 [1,06; 1,65] |
| 2×/12M gg. Schicht | 1,15 [1,04; 1,26] | 1,16 [1,05; 1,26] |
| breiteste Lesart (jeder offene Aufwärts-Impuls), 5×/24M | 1,35 [1,05; 1,64] | 1,41 [1,16; 1,63] |
| Sensitivität: Ausschluss auch späterer Datensprünge | 1,32 [0,99; 1,65] | 1,39 [1,07; 1,71] |
| gedeckelter Überschuss 24M | +1,8 % [−2,1; +5,7] | +0,3 % [−3,7; +4,3] |
| Median 24M (Basis) | 5,4 % (8,8 %) | 6,7 % (9,95 %) |
| **innerhalb RS26 Top 20 %**, 5×/24M | 1,33 [0,79; 1,87] | 1,40 [0,84; 2,04] |
| innerhalb Trend ∧ Momentum, 5×/24M | 1,61 [0,80; 2,42] | 1,48 [0,82; 2,13] |

**Lesart:**
* Der Kandidat markiert Titel mit **breiterer Ergebnisverteilung**: mehr 5×-Fälle, aber einen niedrigeren Median, keinen Renditevorteil und eine größere Rücksetzer-Tiefe.
* Das passt zu einer scharfen Erholung von einem Tief, die die grobe Schichtung nicht vollständig abbildet (Grenze 78).
* Gegenüber einfacher relativer Stärke ist ein Zusatzwert in der Richtung plausibel, aber nicht nachgewiesen.

**Weekly vs. Daily:**
* Track A ist auf Tag und Woche gleich: geometrie-dominiert, Lift von +1 bis +2 Pp.
* Track B und Wave 3 sind nur auf Wochenbasis gemessen, weil Langfrist-Horizonte Tageshistorie über viele Jahre und Titel bräuchten.
* Die Tages-Elliott-Zählung spricht in < 1 % der Analysezeitpunkte (Mission VIII).

**Mechanische Einstufung** (`decide-m9.mjs`): INCREMENTAL PREDICTIVE VALUE, nur für das **interne** Merkmal, nur für die Häufigkeit extremer Aufwärtsbewegungen, explorativ auf verbrauchten Daten. Daraus folgen **keine** Produktänderung und keine Kundenaussage. Für das **angezeigte** Elliott bleibt es bei STRUCTURAL LANGUAGE ONLY (Mission VIII: EXPERIMENTAL_ONLY_STRUCTURAL_LANGUAGE).

---

## 5. Fallstudie Palantir (nur Erklärung, nach der Universumsstudie)

**Verifizierte öffentliche Quellen:**

| Quelle | Datum | Kurs | Zeitrahmen | Struktur | Ziel | Invalidation |
|---|---|---|---|---|---|---|
| TradingView, Nutzer „Mendenmein-Capital“, „Weekend special: Will 2023 be a better year?“ | 21.01.2023 | ≈ 7,0 $ | mehrmonatig / langfristig | drei bärische Wellen beendet, letzte als Ending Diagonal; Mikrozählung Welle (v) | kurzfristig 7,24–7,70 $; langfristig 80 $ (vom Autor am 07.01.2025 als „x10“ erreicht gemeldet) | nicht angegeben |
| Elliottwave-Forecast („EWFLuis“), „Palantir (PLTR) May Have Ended a Bearish Cycle Since 2021“ | 04.04.2023 | ≈ 9–10 $ (Welle (1) bei 10,31 $) | Tag | Zickzack (II) 45,00 → 5,97 $ beendet; Welle (1) fertig, Welle (2) läuft | keine Zahl | **unter 5,97 $** |
| Gegenbeispiel: TradingView „allyhamed123“, „Palantir Technical Analysis“ | 03.06.2021 | ≈ 24 $ | — | „entering a wave 3“ | **86–126 $ in ≈ 12 Monaten** | nicht angegeben |

Das Gegenbeispiel scheiterte: PLTR fiel danach auf ≈ 6 $ (Dezember 2022). Die Zahl „HKCM 1.675 %“ ist nur sekundär belegt und wird nicht verwendet. Die FXStreet-Fassung war nicht abrufbar; verwendet wurde der Originalbeitrag auf elliottwave-forecast.com.

**Was zeigte das eingefrorene VU am selben Datum** (Wochendaten bis zum Stichtag; 121–131 Wochen Historie, unter dem Studienminimum von 160, das Produkt rechnet trotzdem)?

| Datum | VU-Ausblick | Hauptszenario | angezeigtes Elliott | interner bester Impuls | 52W-Rendite / Abstand 52W-Hoch | danach 104 Wochen |
|---|---|---|---|---|---|---|
| 03.06.2021 (28.05.) | NEUTRAL, ambig | Range | Zickzack, enthält sich | abwärts, 4 Wellen | — / 65 % | 0,60× |
| 20.01.2023 | **BEARISH, klar** | Fortsetzung abwärts | WXY abgeschlossen, enthält sich | abwärts, 4 Wellen | −48 % / 51 % | **10,2×** |
| 31.03.2023 | **BEARISH, klar** | Rücksetzer abwärts | WXY Welle Y, enthält sich | **aufwärts, 3 Wellen, offen (Rang 19)** | −39 % / 67 % | **10,2×** |
| 29.09.2023 | gemischt, ambig | — | Zickzack C | abwärts, 5 Wellen | +97 % / 88 % | 11,1× |
| 27.09.2024 | **erstmals BULLISH, klar** | Fortsetzung aufwärts | WXY | — | +130 % / 99 % | 5,1× |

**Antworten:**
* VU zeigte am 20.01. und 31.03.2023 **keine** Motivstruktur, **kein** mögliches Wave 3, **keinen** Trend, **kein** Momentum und **keinen** Ausbruch, sondern ein klares **bärisches** Bild.
* Erst im September 2024, nach rund 5× Anstieg, wurde VU klar bullisch.
* Intern lag am 31.03.2023 eine offene Aufwärts-Impulslesart vor (Welle 3 markiert, laufend). Die Engine stufte sie auf Rang 19 herab, das Produkt zeigte sie nie. Genau dieses interne Merkmal ist in der Universumsstudie explorativ mit mehr Extremgewinnern verbunden; der PLTR-Fall ist dafür **kein** Beleg.
* Die Definition entstand nach Sichtung dieses Falls; das ist offengelegt.
* Der Fall wurde nicht zur Kalibrierung verwendet.

---

## 6. Entscheidungsmatrix (§70)

| Bereich | Einstufung | Belastbarkeit |
|---|---|---|
| **Track A** | **NO HIGH-ACCURACY EDGE** | Woche: DEV/VAL verbraucht; Tag: einmalige Bestätigung auf neuen Titeln |
| **Track B** | **NO ASYMMETRIC EDGE** (VU-Signale wählen Extremgewinner unterdurchschnittlich aus) | explorativ mit Gegenprobe, verbrauchte Daten |
| **Elliott / Wave 3** | angezeigt: **STRUCTURAL LANGUAGE ONLY**; intern: **INCREMENTAL PREDICTIVE VALUE (explorativ, nur Extremhäufigkeit, kein Ertrag, nicht über RS hinaus gesichert)** | explorativ, VAL vorab committet |
| Gesamtklasse TI (Mission VIII) | unverändert **C: descriptive / decision support** | — |

---

## 7. Kundenaussagen (§71)

Bereit ist keine. Geprüft:

| Mögliche Aussage | Evidenz | Status |
|---|---|---|
| „Historisch erreichte dieses Setup X % Erfolg bei Y:1 und Z % Abdeckung.“ | Zahlen existieren, z. B. symmetrisch 49 % bei 0,83:1 und 24 % Abdeckung. Eine zufällige Auswahl gleicher Geometrie erreicht aber 47 %. | **ABGELEHNT** ohne die Vergleichszahl. Mit Pflicht-Vergleich (49 % gegen 47 %) **wahr, aber werblich wertlos**; LEGAL REVIEW REQUIRED. |
| „VU-Bullish-Titel wurden X-mal häufiger 3×-Gewinner als vergleichbare Titel.“ | Faktor < 1 (0,62–0,9) | **ABGELEHNT** (die Aussage wäre falsch) |
| „VU erkannte X % späterer 5×-Gewinner, bevor Y % der Bewegung gelaufen war.“ | 47–51 % der Episoden bei 44 % Abdeckung; RS26 gleich viel bei 20 % | **ABGELEHNT** (irreführend ohne Abdeckungsvergleich; einfache Alternative besser) |
| „Frühe Wave-3-Strukturen gingen häufiger 5×.“ | nur intern, nicht angezeigt; explorativ; kein Ertrag | **ABGELEHNT** |
| Ehrliche Produkt-Sprache: „Die Szenarien beschreiben die Struktur. Ihre Trefferquote hängt vor allem vom Abstand der Ziele ab und liegt nur wenige Punkte über einer zufälligen Auswahl mit gleichen Abständen.“ | Track A | **VERTRETBAR**, LEGAL REVIEW REQUIRED |

---

## 8. Selbstkritik (§73)

1. **Unbeabsichtigt auf 70 % optimiert?** Nein. Nichts wurde getunt; die Engine ist hash-gleich eingefroren. Die 69–71 % bestehen und sind Geometrie. Die Studie zeigt das, statt es zu nutzen.
2. **Erklärt günstige Geometrie die hohe Trefferquote?** Ja, vollständig bis auf +1 bis +2 Pp.
3. **Erklärt Markt-Drift das Ergebnis?** Teilweise. Bärische Szenarien haben höhere Lifts (+3 bis +4,6 Pp.), aber eine stark negative Erwartung (−0,2 bis −0,3 R). Bullische Szenarien profitieren von der Aufwärtsdrift, die Kontrolle D ebenso.
4. **Erklärt einfacher Trend das Ergebnis?** Ja. TREND_ONLY hat in jeder Klasse denselben Lift; gegen Kontrolle E schrumpft der Lift weiter.
5. **Erklärt Momentum oder relative Stärke das Ergebnis?** Für Track B ist relative Stärke die **bessere** Alternative. VU-Bullishness ist eher ein Trend-Reife-Merkmal und keine Frühindikation.
6. **Erzeugten wenige Superwinner allen Payoff?** In der Basis ja, zu großen Teilen: Top 5 % = 49–60 % der Gewinne. Bei VU-Signalen gab es keinen Payoff-Vorsprung, der hätte verschwinden können.
7. **Überlebt die Kante das Entfernen der Top-Gewinner?** Es gab keine VU-Kante. Für die internen Wave-3-Kandidaten verschwindet der Mittelwertvorteil bereits mit dem 4×-Deckel.
8. **Überlebt sie delistete Titel?** Es gab keine VU-Kante. Die Unterauswahl von Extremgewinnern zeigt sich auch in der delisteten Kohorte (0,65 [0,44; 0,91]).
9. **Bringt Wave 3 etwas inkrementell?** Angezeigt nein. Intern explorativ mehr Extremhäufigkeit, ohne Ertrag und nicht über RS hinaus gesichert.
10. **War die Woche nützlicher als der Tag?** Für Genauigkeit gleich (geometrie-dominiert). Für Langfrist-Fragen ist nur die Woche messbar.
11. **Wie viel Abdeckung ist nötig?** Selektivität kostet viel Abdeckung für wenig Lift. Woche: Top 10 % Übereinstimmung bringen +4–6 Pp. bei 2 % Abdeckung, ohne die 60-%-Schwelle zu erreichen. Tag (Bestätigung): nicht einmal das ist nachweisbar (+1,8 Pp., KI enthält 0).
12. **Kommerziell bedeutsam?** Nicht als Prognosevorteil. Der Wert bleibt beschreibend (Klasse C).
13. **Ist eine Kundenaussage bereit?** Nein (§7).
14. **Was würde ein externer Quant am meisten kritisieren?**
    * Track B und Wave 3 liegen auf verbrauchten Daten, mit nach Datensicht formulierten Regeln.
    * Die Schichtung ist grob.
    * Split-bereinigte Wochenkurse enthalten Datenfehler, die Mittelwerte verzerren.
    * Die Tagesbestätigung liegt im bekannten Kalender.
    * Die Outcome-Regel (Touch gegen Schluss, Zeitablauf als Fehlschlag) macht die strukturelle Erwartung negativ und vergleicht nur relativ.
    * Für Track B gibt es keine Transaktionskosten und keine Liquiditätsfilter.
15. **Nächster Forschungsschritt:**
    1. Prospektiv: ab 2026-10 die internen Wave-3-Kandidaten und RS26 je Quartal **einfrieren und mitschreiben** (Zeitstempel, Hash). Auswertung frühestens nach 12/24 Monaten. Das ist die einzige saubere Bestätigung für Track B / Wave 3.
    2. Unbereinigte Kurse beziehen, um Split-Artefakte zu trennen.
    3. Den Produkt-Befund „Ziel 1 bei Anzeige bereits erreicht“ (9,8 %) beheben, damit Trefferquoten nicht weiter durch triviale Ziele geschönt werden.
    4. Keine Engine-Änderung auf Basis dieser explorativen Befunde.

---

## 9. Was diese Mission nicht getan hat

* Keine Änderung an Engine, Elliott, Szenario-Schwellen, Zielen oder Invalidation; kein Elliott 3.3.
* Kein Wiederöffnen eines Mission-VIII-Holdouts als Bestätigung. Die Delisted-Kohorte ist nur Sensitivität.
* Kein Start bei bekannten Gewinnern. PLTR wurde erst nach der Universumsstudie angesehen.
* Keine Web-Recherche über die PLTR-Quellen hinaus (fünf Suchanfragen, fünf Seitenabrufe).
