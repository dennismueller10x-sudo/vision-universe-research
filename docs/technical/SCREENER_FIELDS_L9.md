# Screener-Felder L9: weitere Katalogindikatoren

Stand 28.10.2026. Fachmodell-PR, braucht die Freigabe des Owners.

Versionen:
- `technical-screen-row-1.9.0`
- `technical-query-1.9.0`
- `technical-query-text-1.7.0`

Nur Tageszeitrahmen. Jedes Feld ist der Wert des Indikatorkatalogs am Stichtag. Die Katalogwerte sind gegen TA-Lib bzw. pandas-ta geprüft (INDICATORS_EXTERNAL_REFERENCE.md).

## 1. Neue Felder

| Feld | Art | Definition (Katalog) | fehlt (`null`), wenn |
|---|---|---|---|
| `vortexBull` | ja/nein | Vortex VI+ > VI− (14) | keine Kursbewegung im Fenster |
| `choppiness14` | Zahl 0–100 | Choppiness Index 14: unter 38,2 Trend, über 61,8 seitwärts | keine Kursbewegung im Fenster |
| `newHigh20d`, `newLow20d` | ja/nein | Schluss über dem höchsten Hoch bzw. unter dem tiefsten Tief der 20 Vortage (Donchian-Ausbruch) | weniger als 21 Bars |
| `elderImpulse` | +1/0/−1 | +1, wenn EMA 13 und MACD-Histogramm (12/26/9) steigen; −1, wenn beide fallen; sonst 0 | Aufwärmphase |
| `zScore20` | Zahl | (Schluss − SMA 20) / Standardabweichung 20 | Streuung 0 |
| `hmaRising` | ja/nein | Hull MA 20 höher als am Vortag | Aufwärmphase |
| `ulcer14` | Anteil | Ulcer Index 14: Rückschlagsrisiko vom 14-Tage-Hoch | Aufwärmphase |
| `histVol20` | Anteil | Historische Volatilität 20 Tage, annualisiert (252) | Aufwärmphase |
| `connorsRsi` | Zahl 0–100 | Connors RSI 3/2/100 | weniger als 102 Bars |
| `distChandelierLong` | Anteil | Schluss / Chandelier-Stop lang (22, 3·ATR) − 1 | Aufwärmphase |

**Kausalität:** Alle Felder nutzen nur Bars bis zum Stichtag. Der Test prüft das an 40 abgeschnittenen Ständen.

**Ruhende Titel:** Bei Titeln ohne Kursbewegung gilt:
- Nicht entscheidbare Felder sind `null`.
- Felder mit eindeutigem Wert bleiben gesetzt: `histVol20` = 0, `elderImpulse` = 0, `hmaRising` = nein, kein Ausbruch.

**Wortsuche:** Neu verstanden werden:
- „neues 20-Tage-Hoch“, „20-Tage-Tief“, „Donchian-Ausbruch“
- „Vortex positiv/negativ“
- „Hull MA steigt/fällt“
- „Elder Impulse grün/rot“

Als Kennzahlen gibt es Connors RSI, Z-Score, Choppiness, historische Volatilität, Ulcer Index und den Abstand zum Chandelier-Stop.

**Keine Signale mit Erwartungswert:** Die Felder beschreiben den Zustand. Wie bei den übrigen Indikatoren versprechen sie keine Wirkung (INDICATOR_EVIDENCE.md, WEEKLY_EVIDENCE.md).

## 2. Vorher/Nachher

Grundlage: 5.657 Titel, Stand 26.10.2026, Erzeuger `build-screener.mjs --no-evidence`, einmal mit `main`-Code, einmal mit diesem PR.

| | vorher (1.8.0) | nachher (1.9.0) |
|---|---|---|
| Spalten | 123 | 134 (+11) |
| bestehende 123 Spalten | – | **byte-gleich** |
| neue Spalten | – | kein `undefined`, kein `NaN` |
| `screener-v1.json` | 5.760.981 B | 6.123.034 B (+6,3 %) |
| Laufzeit Erzeuger | 83 s | 84 s (mit #1032 rund 40 s) |

**Neue Werte:**

| Feld | gesetzt | `null` | Verteilung |
|---|---|---|---|
| `vortexBull` | 5.467 | 190 | ja bei 2.207 |
| `choppiness14` | 5.467 | 190 | p10 32,3 · Median 48,6 · p90 63,4 |
| `newHigh20d` / `newLow20d` | 5.657 | 0 | ja bei 257 / 415 |
| `elderImpulse` | 5.657 | 0 | p10 −1 · Median 0 · p90 +1 |
| `zScore20` | 5.548 | 109 | p10 −1,71 · Median −0,41 · p90 1,80 |
| `hmaRising` | 5.657 | 0 | ja bei 2.755 |
| `ulcer14` | 5.582 | 75 | Median 5,9 % · p90 24,5 % |
| `histVol20` | 5.657 | 0 | p10 12,7 % · Median 37,3 % · p90 96,4 % |
| `connorsRsi` | 5.657 | 0 | p10 18,9 · Median 46,3 · p90 77,6 |
| `distChandelierLong` | 5.636 | 21 | p10 −20 % · Median +0,95 % · p90 +9,4 % |

Die 190 `null` bei Vortex und Choppiness betreffen ruhende Titel ohne Kursbewegung im 14-Tage-Fenster, vgl. L6: 168 Titel mit ATR 0.

**Datenqualität:** DQ-TW-1..4 sind grün. DQ-TW-2 prüft jetzt 72 statt 61 Katalogfelder.

## 3. Tests

`quant/tests/technical-screener-l9.test.mjs`:
- Jedes Feld steht im Abfragekatalog (nur Tag) und als Spalte in der Zeile.
- **An 40 abgeschnittenen Ständen gleich dem Katalog:**
  - Vortex, Choppiness, Elder Impulse, Z-Score, Hull MA, Ulcer, HV, Connors RSI, Chandelier.
  - Die Ausbrüche sind direkt aus den Bars nachgerechnet, mit einem Zähler gegen Leerlauf.
- Kurze Historie: Connors RSI ist `null`, nicht geschätzt.
- Ruhender Titel: die nicht entscheidbaren Felder sind `null`.
- Wortsuche: Validierung und Text-Rundreise der neuen Begriffe.
