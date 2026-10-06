# Technical Method Attribution (Mission VIII)

Quelle: `hsab/HSAB_TABLES.md` (Ablation gepaart, Ablation eigene Ereignisse, Richtung, Familienbedingungen, Konfluenz). Alle Werte sind Pp.-Lifts von PSS gegen die Kontrolle D, Cluster-KI 95 %. Ablation und Familienbedingungen sind **explorativ** (nicht vorab registriert).

## 1. Wie die Familien wirken

**Abstimmen** (Konfluenz-Richtung): Trend 0,30, Momentum 0,20, Struktur 0,15, höherer Zeitrahmen 0,15 (nur Tag), Volumen 0,10 (nur Tag), Formationen 0,08. Elliott und Wyckoff stimmen mit Gewicht 0 nicht ab.

**Die Geometrie formen:**
* Unterstützung/Widerstand: Einstieg, Ziele, Invalidation;
* Fibonacci: Retracements 38,2/61,8, Cluster, Extensionen;
* Formationen: Ausbruchsvorlage, Formationsziel;
* Elliott: nur bei Anwendbarkeit ≥ MITTEL;
* Volatilität/ATR: Einheit aller Abstände; lässt sich nicht ablatieren.

**Gepaarte Ablation:**
* An denselben Ereignissen wird das Szenario der Variante zum selben Zeitpunkt gerechnet.
* Δ = (Erfolg − Kontrolle)_FULL − (Erfolg − Kontrolle)_Variante.
* Δ > 0 heißt: die Familie verbessert das Ergebnis.

## 2. Methoden-Evidenz-Matrix (§106)

„identisch“ = Anteil der Ereignisse, deren Hauptszenario ohne die Familie gleich bleibt.

| Methode | identisch (W_HOLD / D_HOLD) | Δ gepaart W_DEV | Δ W_VAL | **Δ W_HOLDOUT** | **Δ D_HOLDOUT** | Richtung allein: Barriere-Lift (W_HOLD / D_HOLD) | Stabilität | **Rolle** |
|---|---|---|---|---|---|---|---|---|
| Trend | 84,9 % / 94,4 % (ohne Trend: 80–82 % behalten ein Szenario) | −0,2 | – | +0,2 (−0,9 … +1,2) | +0,0 (−0,3 … +0,4) | TREND_ONLY +2,0 / +1,6 (≈ FULL +1,9 / +1,5) | stabil | **FORECAST CONTRIBUTOR (Richtungsträger), ohne Zusatz über einfachen SMA-Trend** |
| Marktstruktur | 99,5 % / 100 % | −0,1 | – | +0,3 (−0,4 … +0,9) | −0,0 (−0,3 … +0,2) | STRUCTURE_ONLY +1,0 / +1,1 | stabil | **STRUCTURAL DESCRIPTION** |
| Momentum | 100 % / 100 % | −0,2 | – | +0,0 (−0,6 … +0,6) | −0,0 (−0,3 … +0,2) | MOMENTUM_ONLY +1,5 / +1,1 | stabil | **NO MEASURABLE VALUE** (inkrementell) / FILTER (Widerspruch senkt Lift: VAL stützt +2,8, widerspricht +0,4) |
| Volatilität | nicht ablatierbar | – | – | – | – | – | – | **FILTER / CONTEXT** (Regime-Segmente uneinheitlich: Tag komprimiert +2,1, extrem +0,2; Woche extrem +4,4) |
| Volumen | – / 100 % | – | – | (Woche ohne Volumen) | −0,0 (−0,3 … +0,2) | STRUCTURE_VOLUME +0,4 (n. s.) | – | **NO MEASURABLE VALUE** |
| Höherer Zeitrahmen | – / 100 % | – | – | – | −0,2 (−0,5 … +0,1) | – | – | **NO MEASURABLE VALUE** |
| Unterstützung/Widerstand | **9,2 % / 4,2 %** | **+1,1 (+0,7 … +1,5)** | **+1,3 (+0,9 … +1,8)** | +0,7 (−0,2 … +1,7) | −0,7 (−1,4 … +0,1) | NO_SR +1,8 / +1,4 | **instabil** (Vorzeichen im Tages-Holdout negativ) | **STRUCTURAL DESCRIPTION** (prägt die Geometrie; kein stabiler Prognosebeitrag) |
| AVWAP | – | – | – | – | Teil der Volumenstimme | – | – | **STRUCTURAL DESCRIPTION** (nur Tag; keine eigene Wirkung messbar) |
| Fibonacci | 32,8 % / 32,9 % | +0,1 | – | +0,1 (−0,7 … +0,9) | −0,3 (−0,7 … +0,1) | – | stabil null | **REMOVE FROM FORECAST WEIGHTING** (ohne Gewicht; bleibt beschreibend) |
| Chartformationen | 90,5 % / 94,1 % | 0,0 | – | −0,0 (−0,6 … +0,5) | −0,1 (−0,4 … +0,2) | – | stabil null | **STRUCTURAL DESCRIPTION** |
| Elliott | 99,9 % / 100 % | −0,0 | – | +0,3 (−0,2 … +0,8) | −0,1 (−0,4 … +0,2) | – | – | **EXPERIMENTAL / STRUCTURAL LANGUAGE** |
| Wyckoff | 100 % / 100 % | −0,2 | – | +0,1 (−0,5 … +0,6) | −0,2 (−0,4 … +0,1) | – | – | **NO MEASURABLE VALUE** (beschreibend) |
| Konfluenz (Einigkeit) | – | – | – | – | – | – | – | **FILTER** (monoton: Woche +2,5 → +5,0 Pp. bei 92 → 9 % Abdeckung; Tag +1,0 → +1,7) |
| Full TI | – | Lift +2,1 | +2,2 | **+2,5 (+1,4 … +3,5)** | **+1,0 (+0,5 … +1,5)** | +1,9 / +1,5 | Vorzeichen stabil | **DESCRIPTIVE / DECISION SUPPORT** (≈ Trend allein) |

## 3. Redundanz (§35)

Korrelation der Familienstimmen über alle Analysezeitpunkte (W_DEV):
* Trend–Momentum 0,4, Trend–Struktur 0,5, Momentum–Struktur 0,5;
* effektiv unabhängige Familien ≈ 3,5 von 5.

Weil Trend 0,30 und der Rest kaum Zusatzinformation tragen, entscheidet der Trend fast allein über die Richtung (TREND_ONLY = FULL in 98,6–99,9 %).

## 4. Konfluenz und Konflikt (§47–§49)

* **Anzahl stützender Familien** (VAL): 1: +0,8 · 2: +1,7 · 3: +2,2 · ≥ 4: +4,5 Pp. Monoton, aber die Familien sind korreliert.
* **Konflikt informiert:**
  * kein Gegenvotum +3,0;
  * mindestens ein Gegenvotum +1,2;
  * Ausblick „Gemischt“ +0,4 (n. s.).
* Ein Gegenvotum ist eher ein Warnsignal als vier gleichgerichtete Stimmen ein Kaufsignal.

## 5. Einfache Modelle (§82–§83, §105)

Barriere ±2 ATR, Lift gegen Titel desselben Datums:

| Modell | Woche Holdout | Tag Holdout |
|---|---|---|
| Full TI | +1,9 (Abdeckung 92 %) | +1,5 (90 %) |
| SMA-Trend 40 W / 200 T | +1,9 (79 %) | +1,5 (81 %) |
| 52-Wochen-Momentum | +0,7 | +1,4 |
| **Rücksetzer im Trend** | **+4,0** (31 %) | **+2,7** (26 %) |
| 52-Wochen-Ausbruch | −0,2 | −1,0 |
| immer long | −0,5 | +0,1 |

**Full TI ist nicht besser als der einfache SMA-Trend.** Der einfache Rücksetzer-im-Trend ist auf der Richtungsprobe deutlich besser, bei geringerer Abdeckung. Die 13-Wochen-Überrendite der VU-Richtung ist auf Wochenbasis negativ (−1,4 % Holdout), auf Tagesbasis leicht positiv (+1,4 %).

## 6. Empfehlungen (kein Eingriff in dieser Mission)

1. Konfluenz-Komplexität nicht als Prognosequalität darstellen. „Mehrere Verfahren sind sich einig“ ist zulässig als Beschreibung der Klarheit.
2. Fibonacci bleibt reine Beschreibung (bestätigt seit Mission I).
3. Ein Kandidat für einen eigenen Forschungs-PR mit Vorher/Nachher und neuem Holdout: Rücksetzer-im-Trend als Vorlage.
4. Elliott unverändert experimentell, ohne Prognosegewicht.
