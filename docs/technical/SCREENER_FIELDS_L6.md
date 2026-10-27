# Screener-Felder L6: ROC, Inside Bar, NR7, Kerzenmuster

Stand 27.10.2026. Fachmodell-PR, braucht die Freigabe des Owners. Versionen: `technical-screen-row-1.7.0`, `technical-query-1.7.0`, `technical-query-text-1.6.0`. Nur Tageszeitrahmen; Woche/Monat folgen in L7.

## 1. Neue Felder

| Feld | Art | Definition | Prüfraum / Verfügbarkeit |
|---|---|---|---|
| `roc63`, `roc126`, `roc252` | Anteil | Schluss heute / Schluss vor 63, 126, 252 Handelstagen − 1. Gleiche Einheit wie `roc21`. | Zwei Schlusskurse genügen, daher exakt auf dem 270-Bar-Fenster. `roc252` braucht 253 Bars. |
| `insideBar` | ja/nein | Hoch < Vortageshoch und Tief > Vortagestief (strikt, Katalog `insideBar`) | ab Bar 2 |
| `nr7` | ja/nein | Tagesspanne ist die kleinste der letzten 7; Gleichstand zählt als schmalste (Katalog `nr7`) | ab Bar 7 |
| `candleBullish`, `candleBearish` | Liste | Kerzenmuster mit Richtung am Stichtag (`candlesticks.js`, 24 Muster mit Richtung) | `null`, wenn am Stichtag nicht alle Muster entscheidbar sind |
| `candleNeutral` | Liste | Doji, Long-Legged Doji, Spinning Top am Stichtag (ohne Richtung) | wie oben |
| `candleBullDays`, `candleBearDays` | Tage | Handelstage seit dem jüngsten bullischen bzw. bärischen Muster (0 = Stichtag) | `candleWindow` = Bars vom Stichtag rückwärts, an denen alle Muster entscheidbar sind |

**Kausalität:**
- Jede Bar wird nur aus Bars bis zu ihr selbst bewertet.
- „Tage seit“ folgt der Konvention der Ereignisfelder (B12): Feld leer und Fenster gesetzt heißt kein Ereignis im Prüfraum; beides leer heißt nicht prüfbar.

**Neutrale Muster** zählen nie in „Tage seit“. Die Richtung je Muster steht in `candlesticks.js` (`direction`).

**Abfragetext:**
- Kanonisch: `kerze-bull:hammer,engulfing`, `kerze-baer:…`, `kerze-neutral:…`.
- Natürlich: „Inside Bar“, „NR 7“, „bullische Kerze in den letzten 3 Tagen“, „Jahresperformance > 20 %“ bzw. „3-/6-/12-Monats-Performance“.
- `roc63` usw. als Feld-Id.

## 2. Vorher/Nachher (5.657 Titel, Stand 26.10.2026, Erzeuger `build-screener.mjs`)

| | vorher (1.6.0) | nachher (1.7.0) |
|---|---|---|
| Spalten | 83 | 94 (+11) |
| bestehende Spalten | – | **byte-gleich** (alle 83) |
| `screener-v1.json` | 4.901.229 B | 5.263.602 B (+7,4 %) |
| Laufzeit Erzeuger | 34 s | 81 s (Kerzenerkennung je Titel über 270 Bars) |

**Neue Werte heute:**

| Feld | Ergebnis |
|---|---|
| `roc63`, `roc126`, `roc252` | 5.657 von 5.657 gesetzt |
| `insideBar` | 748 ja (13 %) |
| `nr7` | 1.255 ja (22 %, viele ruhige Titel mit gleichen Spannen) |
| `candleBullish` | 919 Titel mit Muster: Harami 251, Engulfing 143, Inverted Hammer 138, Hammer 113, Harami Cross 92, … |
| `candleBearish` | 1.092 Titel mit Muster: Engulfing 320, Harami 197, Gravestone Doji 178, Marubozu 146, Shooting Star 120, … |
| `candleNeutral` | 1.666 Titel: Spinning Top 1.336, Doji 1.129, Long-Legged Doji 974 |
| `candleBullDays`, `candleBearDays` | gesetzt bei 5.400 bzw. 5.397 Titeln, Median 3 Tage. Einzelne Kerzenmuster sind häufig; das Feld eignet sich für „heute“ oder „in den letzten 1–3 Tagen“, nicht als seltenes Signal. |
| nicht entscheidbar | 244 Titel (davon 168 mit ATR 0, ruhende Titel ohne Kursbewegung). Die Muster bleiben dort `null` statt „kein Muster“. |

## 3. Tests

`quant/tests/technical-screener-l6.test.mjs` prüft an echten AAPL-Tagesbars:
- **ROC:** exakt gleich dem Katalog-ROC / 100.
- **Inside Bar und NR7:** an 60 abgeschnittenen Ständen unabhängig nachgerechnet.
- **Kerzenlisten:** an 80 Ständen gleich `candlesticks.atCutoff`, nach Richtung getrennt.
- **„Tage seit“:** über abgeschnittene Reihen kausal. Am Tag t − d liegt ein Muster vor, an keinem späteren Tag.
- **Ruhender Titel:** liefert `null`.
- **Abfragen:** Abfrage- und Text-Rundreise.

Die bestehenden Rundreise-Tests (`technical-query-text.test.mjs`) erfassen die neuen Felder automatisch über alle Felder.

## 4. Nicht Teil dieses PRs

- Woche/Monat (L7).
- Chartdarstellung der Kerzenmuster.
- Kein Frontend: `/technical/` zeigt neue Felder über die bestehende Feldliste (`technical-query.js` FIELDS), ohne Code-Änderung an der Oberfläche.
