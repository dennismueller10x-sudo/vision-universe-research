# Elliott Setup Evidence (Library V1)

Stand: 07.10.2026 (Mission X).

Tabellen (generiert): [hsab/MISSION10_SETUP_TABLES.md](hsab/MISSION10_SETUP_TABLES.md). Daten: `quant/data/technical-intelligence/elliott-setups/`:
* `setup-eval-w-dev.json` und `setup-eval-w-val.json`;
* `setup-decision.json`;
* `setup-evidence-records.json`.

## Datenlage und Belastbarkeit

| Phase | Daten | Rolle | Belastbarkeit |
|---|---|---|---|
| DEV | Wochen-Überlebende, Titelhälfte 0/2: 193.826 Erkennungspunkte, 23.700 Kandidaten; ohne die 284 Per-Bar-Titel | Implementierung, Fehlersuche | Entwicklung |
| VAL | Titelhälfte 1/2: 188.236 Erkennungspunkte, 23.140 Kandidaten | erste Auswertung **nach** dem Freeze `82f7456` | **VALIDATION_ON_CONSUMED_DATA** (Kurse in Mission I–IX gesehen; diese Definitionen nie) |
| prospektiv | ab Woche 2026-09-25 | einzige saubere Bestätigung | Register läuft |

Es gibt keine unberührten Wochendaten. LEVEL 3 (ROBUST EDGE) ist historisch nicht erreichbar.

## Methode

**Ereignis:** erstes Auftreten eines Setups je Elliott-Zählung. Für PURE zählt das erste *angezeigte* Auftreten.

**Ergebnis** (26 Wochen, `structural-outcomes.cjs`):
* Ziel = nahe Kante der primären Projektionszone vor einem Schluss jenseits der Invalidation;
* Zeitablauf = kein Erfolg;
* Bestätigung = Schluss jenseits des Bestätigungsniveaus vor dem Ausgang;
* R winsorisiert auf ±5.

**Kontrollen:**
* D: gleiches Datum, andere Titel, gleiche Abstände in ATR;
* T: zusätzlich gleicher Trend;
* TR: zusätzlich gleicher RS26-Quintil-Status = das Basis-Setup ohne Elliott;
* C: gleiche Aktie, 26–104 Wochen entfernt.

**Langfristig** (nur Aufwärts-Setups): 6/12/24/36 Monate gegen nicht markierte Titel am selben Datum, alle bzw. Trend × RS.

**Bootstrap:** Titel × Halbjahr (kurz) bzw. Titel × Jahr (lang), B = 500.

## Ergebnis je Setup (VAL; DEV in Klammern)

### S1 Frühe Welle-3-Ausdehnung — **INSUFFICIENT EVIDENCE**

* **Angezeigt (PURE):** 0 Fälle in DEV und VAL. Die eingefrorene Engine setzt eine laufende Welle 2/3 nie als angezeigte Primärzählung, als Primärzählung überhaupt nur 2 (2) Mal.
* **Forschungskohorte RESEARCH_ONLY_INTERNAL_WAVE3** (Mission IX, Quartalsenden, verbraucht, explorativ):
  * 5×/24M gegen vergleichbare Titel: 1,35 [1,06; 1,65] VAL, 1,40 DEV;
  * 2×/12M: 1,16;
  * kein Renditevorteil: gedeckelter Überschuss ≈ 0, Median unter der Basis;
  * nicht über RS26 hinaus gesichert (innerhalb RS26 Top 20 %: 1,40 [0,84; 2,04]).
* **Asymmetrischer Wert?** Mehr Extremfälle in beide Richtungen, keine bessere Erwartung. Die Frage ist nur prospektiv zu klären; die Kohorte wird dafür registriert.

### S2 Welle 4 → Welle 5 — **INSUFFICIENT EVIDENCE**

Angezeigt: 0 (0). Als nicht angezeigte Primärzählung 51 (58) Fälle. Lift gegen D +1,0 Pp. in DEV, beidseitig weite KI. Keine Aussage möglich.

### S3 Abgeschlossene Korrektur → Fortsetzung — **STRUCTURAL ONLY** (angezeigt)

**PURE, n = 182 (172):**

| Kennzahl | VAL | DEV |
|---|---|---|
| Ziel 1 vor Invalidation | 36,8 % | 40,1 % |
| Kontrolle D (gleiche Geometrie) | 36,1 % | 40,9 % |
| Lift D | +0,7 Pp. [−6,0; +7,0] | −0,8 Pp. |
| Lift gegen Trend+RS | +0,5 Pp. [−5,6; +6,7] | −2,7 Pp. |

* Geometrie: Ziel 3,8 ATR, Invalidation 5,2 ATR, Chance/Risiko 0,75. Payoff 0,91.
* E[R] −0,15 [−0,31; −0,00].
* Zuerst invalidiert 28 %, Umdeutung vor Auflösung 24 %, Zeitablauf 35 %.
* Abdeckung 0,10 % der Erkennungspunkte.

**Lesart:** Die Szenario-Logik (Bestätigung, Invalidation, Zone) ist sauber definiert und tritt regelmäßig angezeigt auf. Sie trifft aber nicht häufiger als dieselbe Geometrie an zufälligen Titeln.

**Nicht angezeigte Primärzählung (ENGINE_PRIMARY), n = 15.010 (13.777): REJECT.**
* Lift gegen D −2,2 Pp. [−3,0; −1,3] (DEV −1,0 [−1,8; −0,1]), gegen Trend+RS −2,2, gegen dieselbe Aktie −5,7.
* Langfristig (aufwärts) schlechter als der Markt am selben Datum: 24M −2,6 % [−5,1; −0,1]; 2×-Häufigkeit nur 0,80× der Basis.

Die überwiegend enthaltenen Korrektur-Zählungen tragen eher negative Information.

### S4 Dreieck → Schlussstoß — **INSUFFICIENT EVIDENCE** (angezeigt)

* **Angezeigt:** n = 17 (15), keine Aussage.
* **Nicht angezeigte Primärzählung, n = 2.081 (1.811): STRUCTURAL ONLY.**
  * Ziel 1 vor Invalidation 25,4 % gegen 24,0 % (Lift +1,5 [−0,4; +3,3]; DEV +0,4).
  * Gegen Trend+RS −0,6.
  * Chance/Risiko 2,4, Payoff 3,0, E[R] +0,01 [−0,07; +0,09].
  * Langfristig neutral bis schwächer (2×-Häufigkeit 0,45–0,94× der Basis).

### Modifikator höherer Grad (M_HD_ALIGNED) — **INSUFFICIENT EVIDENCE**

Bei abgeschlossenen Mustern ist der Modifikator praktisch nie erfüllt (0 angezeigte Fälle). Die laufende Welle des höheren Grades enthält die gerade beendete Korrektur und zeigt daher gegen die Setup-Richtung. Er wird nicht umdefiniert (Freeze). Eine andere Lesart ist eine Hypothese für V2.

## Pure gegen RS gegen Confirmed

| S3 | n VAL (DEV) | Lift D VAL (DEV) | Lift Trend+RS VAL (DEV) |
|---|---|---|---|
| PURE | 182 (172) | +0,7 (−0,8) | +0,5 (−2,7) |
| PURE_RS | 40 (39) | +6,5 [−10,5; +23,5] (−9,7) | +13,5 (−16,9) |
| CONFIRMED | 24 (24) | +13,3 [−4,2; +30,9] (−4,2) | +21,3 [+3,1; +39,5] (−11,2) |

RS und die volle Bestätigung machen das Setup sehr selten (24–40 Fälle je Hälfte). Die Vorzeichen widersprechen sich zwischen DEV und VAL. Das ist **keine** Evidenz für einen Bestätigungseffekt, sondern Rauschen kleiner Zahlen. Die Frage, ob RS das Setup verbessert, kann nur das prospektive Register mit genug Fällen beantworten.

## Höchste historische Trefferquote — richtig gelesen

Unter den Setups mit n ≥ 100 je Hälfte hat **S3 PURE** die höchste Quote: 40,1 % (DEV) bzw. 36,8 % (VAL).
* **Geometrie:** Ziel 3,7–3,8 ATR, Invalidation 4,5–5,2 ATR, Chance/Risiko 0,63–0,75.
* **Gematchte Basis:** 40,9 % / 36,1 %.
* **Payoff:** 0,87 / 0,91.
* **Abdeckung:** rund 0,1 % der Erkennungspunkte (ein angezeigtes Ereignis je ≈ 1.000 Titel-Erkennungen).

Höhere Quoten (50–58 %) gibt es nur in den sehr seltenen RS- und Confirmed-Varianten, und dort bei Chance/Risiko 0,27–0,44, also nahen Zielen.

## Antwort auf die Kernfrage

**Fügt Elliott etwas über RS, Trend und Struktur hinaus hinzu?** Historisch nein.
* Kein Setup erreicht LEVEL 1 (positive Erwartung) oder LEVEL 2 (Lift gegen dieselbe Geometrie und gegen Trend+RS).
* Die häufigste nicht angezeigte Zählung (abgeschlossene Korrektur) ist systematisch leicht schlechter als dieselbe Geometrie.
* Das einzige explorativ positive Signal (interne Welle-3-Kandidaten) zeigt keine bessere Erwartung und ist über RS hinaus nicht gesichert.
