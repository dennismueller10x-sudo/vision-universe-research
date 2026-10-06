# Coverage–Accuracy Report (Mission VIII, §28–§31, §107)

Abdeckung = Anteil aller zulässigen Analysezeitpunkte, an denen VU ein gerichtetes Szenario dieser Stufe zeigt. „wertbar“ = ohne Szenarien, deren Ziel 1 bei Anzeige schon erreicht oder deren Grenze schon gebrochen ist. Erfolg = PSS. Baseline = Kontrolle D. Umdeutung = Richtungswechsel vor Auflösung, je Bar (Stichprobe, nur Woche).

Stufen-Schwellen: |Einigkeit| ≥ 0,6028 (Top 50 %), 0,7793 (Top 25 %), 0,8706 (Top 10 %). Die Schwellen sind auf W_DEV bestimmt und vor W_VAL eingefroren.

## 1. Woche — Final Holdout (delistete Kohorte)

| Selektivität | n | Abdeckung (wertbar) | Erfolg | Baseline D | Lift (KI) | Umdeutung je Bar |
|---|---|---|---|---|---|---|
| alle gezeigten | 11.274 | 92,2 % (84,2 %) | 57,1 % | 54,6 % | +2,5 (+1,4 … +3,5) | 16,3 % |
| nicht gemischt | 10.122 | 83,2 % (76,0 %) | 57,0 % | 54,4 % | +2,6 (+1,4 … +3,9) | 14,1 % |
| Klarheit ≠ mehrdeutig | 10.015 | 82,3 % (75,1 %) | 57,0 % | 54,4 % | +2,7 (+1,3 … +3,9) | 14,0 % |
| Klarheit CLEAR | 7.494 | 61,7 % (55,8 %) | 57,2 % | 54,2 % | +3,0 (+1,5 … +4,5) | 11,6 % |
| Einigkeit Top 50 % | 5.698 | 46,9 % (42,0 %) | 57,7 % | 54,4 % | +3,3 (+1,6 … +5,0) | 11,6 % |
| Einigkeit Top 25 % | 2.834 | 23,9 % (20,8 %) | 57,8 % | 53,9 % | +3,9 (+1,7 … +6,1) | 6,5 % |
| Einigkeit Top 10 % | 1.107 | 9,3 % (7,9 %) | 57,1 % | 52,1 % | +5,0 (+1,1 … +9,0) | 8,5 % |
| Elliott spricht | 75 | 0,6 % | 65,3 % | 59,7 % | +5,6 (−8,0 … +19,2) | – |

## 2. Tag — Holdout (1.200er-Stichprobe, 2017–2026)

| Selektivität | n | Abdeckung (wertbar) | Erfolg | Baseline D | Lift (KI) |
|---|---|---|---|---|---|
| alle gezeigten | 38.618 | 90,3 % (84,3 %) | 69,1 % | 68,1 % | +1,0 (+0,4 … +1,6) |
| Klarheit CLEAR | 24.526 | 56,2 % (52,1 %) | 70,1 % | 69,0 % | +1,1 (+0,4 … +1,8) |
| Einigkeit Top 50 % | 18.942 | 42,6 % (39,3 %) | 70,4 % | 69,2 % | +1,2 (+0,4 … +2,0) |
| Einigkeit Top 25 % | 9.282 | 20,0 % (18,2 %) | 70,7 % | 69,2 % | +1,5 (+0,6 … +2,6) |
| Einigkeit Top 10 % | 4.778 | 10,3 % (9,3 %) | 70,7 % | 69,0 % | +1,7 (+0,2 … +3,3) |
| Elliott spricht | 113 | 0,3 % | 73,5 % | 67,1 % | +6,4 (−0,6 … +13,4) |

Woche DEV/VAL: dieselbe Monotonie (`hsab/HSAB_TABLES.md`), von +2,1 bei 93 % bis +3,9 Pp. bei 9 % Abdeckung.

## 3. Wird VU deutlich genauer, wenn es nur bei den klarsten Strukturen spricht?

**Nein, nicht deutlich.**
* Der Lift gegen gematchte Kontrollen wächst monoton:
  * Woche von +2,5 auf +5,0 Pp. bei 9 % Abdeckung;
  * Tag von +1,0 auf +1,7 Pp. bei 10 % Abdeckung.
* Die **absolute** Erfolgsquote ändert sich kaum (Woche 57 → 58 %, Tag 69 → 71 %). Der Lift wächst vor allem, weil die Kontrollquote in den Top-Stufen sinkt: weitere Ziele, schwierigere Phasen.
* Auch die engste Stufe besteht die Gates nicht; sie wurden dort nicht registriert und nicht geprüft.

## 4. Enthaltung (§30)

* VU enthält sich (kein gerichtetes Szenario) an 7–10 % der Analysezeitpunkte, fast immer als Seitwärts-Szenario („Spanne“).
* Gegenprobe: das einfache Modell TREND_ONLY an Punkten mit gegen ohne VU-Szenario, als Barriere-Lift:
  * Woche +2,1 gegen −0,2 Pp.;
  * Tag +1,7 gegen +0,2 Pp.
* Die Enthaltungsintervalle schließen 0 ein. Die Richtung stimmt, der Nachweis fehlt: **Enthaltungswert NOT ESTABLISHED.**
* VU ist **nicht selektiv**: Es spricht an > 90 % der Zeitpunkte.

## 5. Strukturklarheit (§31)

| Klarheit | Woche Holdout: Lift / Umdeutung je Bar / Median bis Umdeutung | DEV: Umdeutung je Bar | Tag Holdout: Lift / Invalidation zuerst |
|---|---|---|---|
| CLEAR | +3,0 / 11,6 % / 9 Wochen | 12,5 % | +1,1 / 28,1 % |
| MODERATE | +1,7 / 20,5 % / 3 Wochen | 26,4 % | +1,1 / 30,6 % |
| AMBIGUOUS | +0,8 / 34,0 % / 3 Wochen | 42,5 % | +0,2 / 32,3 % |

* **Strukturklarheit misst Stabilität und Eindeutigkeit**, und das zuverlässig über DEV, VAL und Holdout.
* Sie steht nur schwach mit dem Ergebnis in Zusammenhang. Sie darf nicht als Trefferwahrscheinlichkeit erscheinen.

## 6. Kalibrierung (§80–§81)

* Ordinale Stufen sind monoton im Lift, nicht in der absoluten Quote.
* Es gibt kein kalibriertes Wahrscheinlichkeitsmodell; die frühere Kalibrierung ist nicht bestanden.
* Keine Prozent-Wahrscheinlichkeit im Produkt.
