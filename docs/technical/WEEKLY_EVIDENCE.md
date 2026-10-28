# Langfristige Evidenz technischer Signale auf Wochenbasis

Stand 28.10.2026, Daten bis 23.10.2026.
- Skript: `scripts/technical/weekly-evidence.mjs`. Es schreibt nur mit `--out` und ist kein Produktartefakt.
- Test der Bausteine: `quant/tests/technical-weekly-evidence.test.mjs`.

Die Tagesauswertungen ([CANDLESTICK_EVIDENCE.md](CANDLESTICK_EVIDENCE.md), [INDICATOR_EVIDENCE.md](INDICATOR_EVIDENCE.md)) decken im Kern ein Jahr und ein Marktregime ab. Diese Auswertung nutzt die langen Wochenreihen und erfasst damit mehrere Marktphasen: 2000–2002, 2008–2009, 2020 und 2022. Sie beschreibt, was nach einem Signal im Mittel geschah. Sie empfiehlt nichts.

## Daten und Methode

**Kursdaten:**
- `discover-series-long`: Wochenschlüsse, splitbereinigt.
- 5.682 Titel mit mindestens 60 Wochen, von 1990 bis Oktober 2026, im Median rund 10 Jahre je Titel.
- Es gibt nur Schlusskurse. Die Signale brauchen deshalb weder Hoch und Tief noch Volumen.

**Marktphase:** SPY täglich ab 1995. „SPY ↑“ heißt: Wochenschluss über der eigenen 40-Wochen-Linie.

**Kausalität:**
- Ein Signal an Woche t nutzt nur Wochenschlüsse bis t.
- Gemessen wird ab dem Schluss von Woche t. Zur Robustheit gibt es einen Lauf mit einer Woche Verzug: Messung ab t+1.
- Wochen werden über den Kalender ausgerichtet. Fehlt einem Titel eine Woche, entsteht dort kein Signal und kein Messschritt.

**Maß:**
- Rendite über H = 4, 13 und 26 Wochen, minus dem Mittel aller Titel mit Schluss in denselben beiden Wochen (mindestens 100 Titel).
- Bärische Signale gehen mit umgekehrtem Vorzeichen ein. „In Richtung“ heißt also für sie: Der Titel fiel relativ.
- Einzelwerte werden auf ±100 % begrenzt.
- Mittel und 95-%-Intervall über Datums-Cluster, Bonferroni über alle Zeilen × Horizonte (z = 3,24).

**Schutz vor Überoptimierung:**
- Die sechs Kombinationen standen vor dem ersten Lauf im Code und sind eingefroren; der Test prüft die Liste.
- Gemeldet werden alle Zeilen, nichts wird nach dem Ergebnis ausgewählt.
- Ergebnisse stehen getrennt für bis 2015 und ab 2016. Eine Aussage gilt nur, wenn beide Teile dasselbe Vorzeichen haben und sie auch die Robustheitsläufe übersteht: 1 Woche Verzug und Schluss ≥ 5 $.

**Grenzen:**
- **Survivorship Bias.** Die Reihen enthalten nur heute gelistete Titel; insolvente oder übernommene Titel fehlen. Bärische Signale sehen dadurch schwächer aus, als sie waren: Titel, die nach einem neuen Tief verschwanden, fehlen in der Messung. Bullische Signale sehen tendenziell besser aus. Der Querschnittsabzug mildert das, beseitigt es aber nicht.
- **Gleichgewichteter Querschnitt.** Kleinwerte haben viel Gewicht. Der Lauf ab 5 $ prüft das.
- **Illiquide Titel.** Manche Reihen haben über Wochen unveränderte Schlüsse und einzelne Kurssprünge.

## Ergebnis (H = 13 Wochen, Überrendite in Signalrichtung)

**·** = signifikant nach Bonferroni.

| Signal | Ereignisse | alle | bis 2015 | ab 2016 | SPY ↑ | SPY ↓ | 1 W Verzug | ≥ 5 $ |
|---|---|---|---|---|---|---|---|---|
| Schluss kreuzt die 40-Wochen-Linie aufwärts | 178.514 | -1,16 ± 0,18 % **·** | -1,42 ± 0,22 % **·** | -0,54 ± 0,32 % **·** | -0,78 ± 0,19 % **·** | -2,19 ± 0,51 % **·** | -0,50 ± 0,18 % **·** | -1,94 ± 0,19 % **·** |
| Schluss kreuzt die 40-Wochen-Linie abwärts | 178.396 | -0,35 ± 0,17 % **·** | -0,22 ± 0,21 % | -0,64 ± 0,27 % **·** | -0,48 ± 0,19 % **·** | 0,14 ± 0,43 % | 0,16 ± 0,17 % | 0,83 ± 0,18 % **·** |
| 10- kreuzt 40-Wochen-Linie aufwärts | 65.814 | -0,69 ± 0,30 % **·** | -0,97 ± 0,37 % **·** | -0,03 ± 0,45 % | -0,35 ± 0,29 % | -1,68 ± 0,88 % **·** | -0,49 ± 0,30 % | -1,65 ± 0,30 % **·** |
| 10- kreuzt 40-Wochen-Linie abwärts | 65.552 | -0,03 ± 0,27 % | 0,29 ± 0,35 % | -0,77 ± 0,41 % **·** | -0,03 ± 0,31 % | 0,10 ± 0,65 % | 0,24 ± 0,27 % | 0,98 ± 0,28 % **·** |
| Neues 52-Wochen-Schlusshoch (erstes nach 4 Wochen) | 101.395 | 0,35 ± 0,30 % | 0,27 ± 0,37 % | 0,56 ± 0,50 % | 1,00 ± 0,27 % **·** | -1,34 ± 1,01 % | 0,64 ± 0,29 % **·** | -0,45 ± 0,31 % |
| Neues 52-Wochen-Schlusstief (erstes nach 4 Wochen) | 77.650 | 0,08 ± 0,40 % | -0,49 ± 0,49 % | 1,43 ± 0,63 % **·** | 0,56 ± 0,51 % | -0,96 ± 0,64 % | 1,22 ± 0,39 % **·** | 2,09 ± 0,43 % **·** |
| Wochen-RSI 14 von unten über 30 | 42.840 | -2,01 ± 0,67 % **·** | -1,82 ± 0,87 % **·** | -2,43 ± 0,95 % **·** | -2,43 ± 0,85 % **·** | -1,31 ± 1,11 % | -1,75 ± 0,66 % **·** | -3,74 ± 0,67 % **·** |
| Wochen-RSI 14 von oben unter 70 | 81.530 | -1,58 ± 0,38 % **·** | -1,64 ± 0,46 % **·** | -1,43 ± 0,68 % **·** | -1,76 ± 0,37 % **·** | -1,01 ± 1,25 % | -1,25 ± 0,38 % **·** | -0,39 ± 0,38 % |
| Wochen-RSI über 30 bei Schluss über der 40-Wochen-Linie *(Kombination)* | 298 | -17,73 ± 4,57 % **·** | -10,93 ± 6,16 % **·** | -23,73 ± 6,53 % **·** | -15,77 ± 5,77 % **·** | n = 77 | -13,95 ± 4,66 % **·** | -21,15 ± 5,30 % **·** |
| Neues 52-Wochen-Hoch bei 10- über 40-Wochen-Linie *(Kombination)* | 96.479 | 0,45 ± 0,30 % | 0,31 ± 0,36 % | 0,78 ± 0,49 % | 1,07 ± 0,27 % **·** | -1,14 ± 0,98 % | 0,69 ± 0,29 % **·** | -0,37 ± 0,31 % |
| Neues 52-Wochen-Tief bei 10- unter 40-Wochen-Linie *(Kombination)* | 71.675 | 0,01 ± 0,41 % | -0,53 ± 0,51 % | 1,26 ± 0,64 % **·** | 0,42 ± 0,53 % | -1,03 ± 0,67 % | 1,14 ± 0,40 % **·** | 2,01 ± 0,45 % **·** |
| Schluss über 40-Wochen-Linie bei SPY über seiner 40-Wochen-Linie *(Kombination)* | 132.300 | -0,78 ± 0,19 % **·** | -1,07 ± 0,25 % **·** | -0,30 ± 0,30 % | -0,78 ± 0,19 % **·** | n = 0 | -0,20 ± 0,19 % | -1,42 ± 0,20 % **·** |
| Wochen-RSI unter 70 bei Schluss unter der 40-Wochen-Linie *(Kombination)* | 485 | 1,88 ± 3,67 % | -5,19 ± 4,71 % | 8,82 ± 5,44 % | 1,17 ± 4,18 % | 9,15 ± 7,15 % | 2,03 ± 3,78 % | 3,27 ± 3,93 % |
| 10- über 40-Wochen-Linie bei Wochen-RSI über 50 *(Kombination)* | 58.496 | -0,60 ± 0,30 % **·** | -0,78 ± 0,39 % **·** | -0,19 ± 0,44 % | -0,34 ± 0,31 % | -1,55 ± 0,88 % **·** | -0,36 ± 0,31 % | -1,52 ± 0,31 % **·** |

## Einordnung

**Robust**, also in beiden Zeiträumen gleiches Vorzeichen und in den Robustheitsläufen bestätigt:

| Befund | Lesart |
|---|---|
| Wochen-RSI 14 verlässt die überverkaufte Zone | Die Titel liefen danach **schlechter** als der Markt: −2,0 % (alle), −3,7 % (≥ 5 $), vor und nach 2016 signifikant. Eine Erholung nach diesem Signal setzte sich im Mittel nicht fort. |
| Schluss kreuzt die 40-Wochen-Linie aufwärts | Schwächer als der Markt: −1,2 % (alle), −1,9 % (≥ 5 $). Mit einer Woche Verzug −0,5 %, ab 2016 dann nicht signifikant. |
| Neues 52-Wochen-Tief (bärisch) | Mit einer Woche Verzug und ab 5 $ **setzt sich der Rückgang fort**: +1,2 % bzw. +2,1 % in Richtung, vor und nach 2016 gleich. Ohne Verzug ist das Vorzeichen uneinheitlich. Die erste Woche nach dem Tief bringt im Mittel eine Gegenbewegung. Survivorship Bias schwächt diesen Befund, der wahre Effekt dürfte größer sein. |

**Nicht robust:**
- 52-Wochen-Hoch: positiv nur bei SPY ↑ und ab 5 $ verschwunden.
- Die Kreuzungen der 10- und 40-Wochen-Linie (Golden/Death Cross auf Wochenbasis): Vorzeichen uneinheitlich zwischen den Zeiträumen.
- Wochen-RSI unter 70: ab 5 $ nicht signifikant.

**Kombinationen bringen nichts über ihr Basissignal hinaus:**
- „52-Wochen-Hoch im Aufwärtstrend“, „52-Wochen-Tief im Abwärtstrend“ und „40-Wochen-Kreuzung bei steigendem Markt“ liegen innerhalb der Intervalle ihres Basissignals. Die meisten Basissignale erfüllen die Zusatzbedingung ohnehin.
- „RSI über 30 bei Schluss über der 40-Wochen-Linie“ (298 Ereignisse) fängt fast nur einwöchige Kurssprünge illiquider Titel aus tiefen Kursen ab. Das starke Minus ist die Rückbewegung nach dem Sprung, kein nutzbarer Befund.
- „RSI unter 70 im Abwärtstrend“ (485 Ereignisse) ist zu selten für eine Aussage.

**Gesamtbild:**
- Auch über 36 Jahre und mehrere Marktphasen zeigen klassische Kaufsignale auf Wochenbasis keine Überrendite. Erholungssignale liefen eher schlechter als der Markt.
- Der einzige richtungsgleiche robuste Befund ist die Fortsetzung neuer 52-Wochen-Tiefs. Er passt zum bekannten Momentum am unteren Ende.
- Für den Screener heißt das wie bisher: Die Felder beschreiben, sie sind keine Signale mit Erwartungswert.

## Aufruf

```bash
node scripts/technical/weekly-evidence.mjs                    # Hauptlauf (alle Titel, ohne Verzug)
node scripts/technical/weekly-evidence.mjs --delay 1          # Einstieg eine Woche später
node scripts/technical/weekly-evidence.mjs --min-close 5      # nur Signale bei Schluss >= 5 $
```

Laufzeit rund 35 s. Die Konsolenausgabe zeigt H = 13; die Werte für 4 und 26 Wochen sowie für die Zeiträume bis 2009, 2010–2019 und ab 2020 stehen im JSON (`--out`).
