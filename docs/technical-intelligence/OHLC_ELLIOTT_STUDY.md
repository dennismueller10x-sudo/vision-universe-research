# OHLC-Elliott-Studie — Close-only vs. Hoch/Tief (Mission VI, Track C)

Stand: 05.10.2026. Kein Prognosetest. **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.** Holdouts versiegelt.

Ergebnisdateien in `quant/data/technical-intelligence/elliott-forensics/`:
* `ohlc-experiment.json` und `ohlc-experiment-budget250k.json` (CI-Lauf `ba4528f74`);
* `impulse-forensics-3.2.2.json`.

Werkzeuge in `scripts/technical/elliott-forensics/`: `ohlc.mjs`, `ohlc-experiment.mjs`, `fetch-ohlc.mjs`. Der Workflow ist `.github/workflows/elliott-ohlc-study.yml`. Er läuft nur mit Marke im Betreff und holt die Kurse runner-privat. Committet werden nur Kennzahlen.

## 1. Was die Elliott-Engine heute bekommt (§17)

| Pfad | Eingang | Volumen | Bereinigung |
|---|---|---|---|
| Produktion, Universum (≈ 6.348 Reihen) | Wochenschlüsse `discover-series-long`, O = H = L = C | nein | split-bereinigt, nicht dividendenbereinigt |
| Produktion, Golden Five (AAPL, JPM, MSFT, NVDA, XOM) | Tages-OHLCV (`golden-preview`) | ja | split-bereinigt aus Rohkurs + splitFactor (`Canonical.fromPriceBars`), O/H/L/C gemeinsam |
| Practitioner-Replay (Mission V) | Wochenschluss bzw. Tagesschluss (`multi-asset` für BTC/ETFs) | nein | wie Produktion |

**Zentrale Feststellung:** `elliott-v3.js` liest ausschließlich `series.close`. Das gilt für den Pivot-Pool, die Wellenpreise, die Extreme innerhalb der Wellen und die Unterteilung. Liegt Hoch/Tief vor, wirkt es nur über die ATR auf die Pool-Schwelle. **Elliott ist in VU strukturell eine Schlusskurs-Methode, auch dort, wo OHLC geliefert wird.**

## 2. Vorhandene Daten (§18, §70)

* **Kanonische Tageshistorie (R2):** Tiingo-EOD, Rohkurs, OHLCV, splitFactor und divCash, für 7.802 von 7.803 US-Titeln (`history/CANONICAL_SOURCE.json`).
  * Sie ist nur runner-privat nutzbar. Die Weitergabe ist **LEGAL_REVIEW_REQUIRED** (`assert-public-data-hygiene.mjs`).
* **US-ETFs und BTC:** Tages-OHLC über denselben Anbieter abrufbar (Tiingo EOD bzw. Crypto). Im CI-Lauf geprüft: 31 Symbole, je eine Anfrage.
* **International:** Indizes wie N225 und FEZ liegen nur als Schlusskurs vor. Internationale Einzeltitel gibt es nicht. OHLC für Elliott außerhalb der USA: **nicht vorhanden**.
* **Ergebnis:** Täglich und wöchentlich (aggregiert) ist OHLC für alle US-Titel des Universums technisch verfügbar, nur nicht im öffentlichen Datenbaum. Ein neuer Anbieter ist nicht nötig (§19).

## 3. Versuchsaufbau (§20, §25–§29, §88–§89)

**Modi**, alle mit derselben Engine `elliott-3.2.2` und unveränderten Regeln:

| Modus | Eingang |
|---|---|
| A0 | Replay-Eingang (Produktion) |
| A | Schlusskurse aus OHLC (Konsistenzprüfung) |
| B | **Hoch/Tief-Pfad**: Monowellen nach Neely, je Bar zwei Punkte in angenommener Reihenfolge — Schluss ≥ Eröffnung → erst Tief, dann Hoch |
| C | Wochenfälle in Tagesauflösung, Schlusskurse |
| D | Wochenfälle in Tagesauflösung, Hoch/Tief |

**Daten:** Split-bereinigt für O, H, L und C gemeinsam. Wochen: Eröffnung des ersten Tages, Maximum, Minimum, letzter Schluss, Volumen als Summe. Nur abgeschlossene Wochen bis zum Stichtag, Wochenenden sind keine Lücken. Getestet in `quant/tests/elliott-forensics.test.mjs`.

**Annahme:** Die Reihenfolge von Hoch und Tief innerhalb einer Bar ist ohne Intraday-Daten unbekannt. Das ist die Hauptunsicherheit von Modus B/D.

**Konsistenz:** Die aus OHLC gebildeten Schlüsse stimmen mit dem Replay überein, mit zwei Ausnahmen:
* NVDA: 292 von ≈ 700 Wochen weichen ab.
* TSLA: 34 von 652 Wochen weichen ab.

Beide betreffen nur ältere Wochen und deuten auf eine abweichende Split-Rekonstruktion zwischen `discover-series-long` und Rohkurs + splitFactor hin. **Offener Datenbefund**, siehe KNOWN_LIMITATIONS.

## 4. Ergebnisse: Practitioner-Fälle (DEV + VAL, 25 Impulsfälle, CI, Standardbudget)

| Modus | Impulsfälle mit Motiv-Hauptzählung | Impuls als Alternative | praktikernahe Impulslesart vorhanden | davon unter den Top 10 | Motivwellen als Motiv erkannt | Enthaltung | Suche abgeschnitten | Median ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A0 Close (Produktion) | 0/25 | 0 | 12 | 0 | 17/49 | 100 % | 46 % | 44 |
| A Close aus OHLC | 0/25 | 0 | 12 | 0 | 17/48 | 100 % | 46 % | 38 |
| B Hoch/Tief | 0/25 | 0 | 4 | 0 | 11/64 | 100 % | 97 % | 79 |
| C Tag, Close (nur 1W) | 0/12 | 1 | 4 | 0 | 6/26 | 100 % | 100 % | 65 |
| D Tag, Hoch/Tief (nur 1W) | 1/12 | 1 | 3 | 0 | 6/27 | 94 % | 100 % | 98 |

Mit gleichem, zehnfachem Suchbudget (250.000 Knoten für alle Modi) bleibt das Bild gleich: B 0/25, C 1/12, D 0/12. Die Laufzeit von B steigt auf 221 ms.

## 5. Ergebnisse: Produktionstitel (§71–§73)

12 Titel, 4 Stichtage, je Tag und Woche, also 96 Paare A gegen B. Profile:
* Trend: AAPL, MSFT;
* Zyklus/seitwärts: JPM, XOM, KO, F;
* Wachstum, volatil: NVDA, AMD;
* Splits: AMZN, TSLA;
* Gaps: GME;
* Small Cap: PLUG.

| Kennzahl | A Close | B Hoch/Tief |
|---|---:|---:|
| Muster geändert | – | 60 % |
| Familie geändert | – | 9 % |
| Anwendbarkeit geändert | – | 0 % |
| Regelstatus geändert | – | 0 % |
| Hauptzählung motiv | 7 % | 4 % |
| Enthaltung | 100 % | 100 % |
| Suche abgeschnitten | 53 % | 100 % |
| Median ms | 42 | 69 |

## 6. Methodenbasis Kursextreme (§22, §23)

* **Klassische Theorie (EWP, Frost & Prechter):** Die Regeln beziehen sich auf den Kursverlauf der Wellen bis zu ihren Extremen. Das „orthodoxe Ende“ (Kap. 2) kann vom Kursextrem abweichen. Einen Schlusskurs-Modus schreibt EWP nicht vor. VU prüft deshalb seit 3.1 die harten Regeln auch gegen die Extreme innerhalb jeder Welle, auf Schlusskursen.
* **NEoWave (Neely):** Monowellen aus Hoch und Tief jeder Periode in der Reihenfolge ihres Auftretens. Das ist die Vorlage für Modus B. Die Ähnlichkeitsregel stammt ebenfalls aus NEoWave; VU führt sie laut Quellenmatrix nicht als Regel.
* **Praktiker-Konvention:** Die Fundstellen zeigen fast ausnahmslos Kerzen- oder OHLC-Charts (TradingView, EWF), oft auf Futures oder CFDs.
* **VU-Umsetzung:** nur Schlusskurse (Abschnitt 1).
* **Wörtliche Belegstellen:** Für EWP zur Frage Schluss gegen Extrem ist sie offen. Diese Studie stützt sich nicht auf eine solche Aussage, sondern misst.

## 7. Schluss (§93 Fragen 7–9)

* **OHLC verbessert die Motiv-/Impulserkennung nicht wesentlich:**
  * 0/25 → 0/25 (B); 0/12 → 1/12 (D).
  * Die Motivwellen werden mit Hoch/Tief nicht häufiger als 5er-Struktur erkannt (17/49 → 11/64).
* **Hoch/Tief verschiebt vor allem Wellenenden:** Das Muster wechselt in 60 % der Fälle, die Familie kaum (9 %). Die Suche braucht etwa das Doppelte an Zeit und wird fast immer abgeschnitten.
* **Wichtigste OHLC-Komponente:** Keine trägt messbar zur Impulserkennung bei. Am stärksten verändert die Tagesauflösung für Wochenfälle (C/D) die gewählten Muster.
* **Entscheidungsbaum §51, Fall A (Daten zuerst): nicht zutreffend.**
  * OHLC wird **keine** formale Voraussetzung für die heutige Engine.
  * `DATA_REQUIREMENTS.md` hält fest: Elliott in VU ist Close-only. Ein OHLC-Pfad wäre ein eigenes Projekt mit Intraday-Reihenfolge. Lohnend ist er erst, wenn die Ursache im Rang (siehe ELLIOTT_IMPULSE_FORENSICS.md) behoben ist.
* **Kosten und Caching (§73–§74):** Ein HL-Pfad verdoppelt die Punkte und etwa die Rechenzeit; bei gleichem Suchbudget wird die Suche häufiger abgeschnitten. Ohne Nutzen ist kein Umbau gerechtfertigt.
