# Quant – Bandsemantik (Owner-Gate BAND_SEMANTICS)

Stand 05.10.2026 · Entscheidung: **Variante B – Stufe = gezählte Position** · Fassung `factor-band-2.0.0`
Maschinenlesbar: [`quant/methodology/factor-bands-v2.json`](../quant/methodology/factor-bands-v2.json)

## Gemessen (Faktor-Artefakt 49c47ee, Stichtag 02.10.2026)

| Faktor | n | p10 | p25 | p50 | p75 | p90 | „sehr stark“ mit festen Grenzen | „sehr schwach“ mit festen Grenzen |
|---|---|---|---|---|---|---|---|---|
| Bilanz- & Ergebnisqualität | 3.776 | 32,1 | 41,8 | 52,0 | 60,6 | 67,9 | **0,0 %** | 4,8 % |
| Wachstum | 3.324 | 25,1 | 36,2 | 49,3 | 64,5 | 75,8 | 1,9 % | 9,8 % |
| Kursstärke | 5.760 | 16,0 | 33,3 | 51,4 | 68,9 | 82,1 | 3,7 % | 17,4 % |
| Bewertung | 2.566 | 25,6 | 38,5 | 52,2 | 66,7 | 77,7 | 1,7 % | 9,6 % |
| Profitabilität | 1.994 | 19,7 | 36,8 | 52,5 | 68,5 | 81,5 | 2,9 % | 13,3 % |
| Erwartungstrend | 0 | – | – | – | – | – | gesperrt (keine lizenzierte PIT-Quelle) | |
| Risiko | 5.760 | 16,5 | 31,0 | 54,6 | 75,4 | 87,4 | 7,1 % | 18,5 % |

- **Branchenvorlagen** (Standard, Banken, Versicherer, REITs): Median je Faktor 46,9–60,1.
- **SIC-Divisionen**: Median 45,4–55,0.
- **Datenreich vs. datenarm** (volles vs. reduziertes Kennzahlgewicht): Mediane höchstens 2,5 Punkte auseinander.
- **Zeitliche Stabilität** (28.09. → 02.10.): p10/p50/p90 höchstens 1,1 Punkte verschoben; gleiche feste Stufe bei 84–98 % der Titel.

## Was der Wert bedeutet

Ein Faktorwert ist das gewichtete Mittel von Rangplätzen (70 % Vergleichsgruppe, 30 % Gesamtmarkt). Daran zeigen sich zwei Dinge:

- In der Engine gibt es **keine absolute Schwelle**: Der Wert ist durch seine Bauart relativ.
- Der Median liegt in jeder Vorlage und jeder Division bei 50. Genau das erzeugen Perzentile.

Die Ursprungsmethodik (`quant-v2.json`) benennt die Bänder als Anteile: „Top 10%“ … „Bottom quartile“, Semantik „Relative rank“.

## Entscheidung

Die Owner-Präferenz A („80 soll heute und in einem Jahr dasselbe heißen“) setzt einen absolut gebauten Wert voraus. Den gibt es in dieser Engine nicht. Feste Grenzen auf ein Mittel aus Rangplätzen ergeben trotzdem eine relative Einordnung, nur mit je Faktor zufälligen Anteilen: Quality wird nie „sehr stark“, Risiko bei 7,1 %. Das ist die Mischsemantik, die ausgeschlossen werden sollte.

Nach der Entscheidungsregel (relativ konstruiert → Perzentilbänder versionieren, neu rechnen, feste Grenzen ablösen) gilt daher:

- **Stufe** = Position unter allen bewerteten Aktien desselben Faktors und Stichtags.
- Grenzen: stärkste 10 % · 75–90 % · 45–75 % · 25–45 % · schwächstes Viertel.
- **Angezeigte Position** („höher als X % der bewerteten Aktien“) ist **dieselbe Zählung**.
- **Faktorwert** bleibt unverändert und steht als Zahl daneben.
- **Strategien und Screener** filtern weiter auf den Wert. Die Oberfläche nennt das eine Schwelle auf den Wert, keine Stufe.

Die Grenze von B bleibt offen benannt: Eine mittelmäßige Aktie kann „sehr stark“ sein, wenn das Universum schwächer ist. Über die Zeit ist eine Stufe nur relativ vergleichbar. Das steht in der Methodik.

## Wirkung (gemessen auf demselben Artefakt)

**Sichtbare Stufen**

- 7.797 von 23.180 Stufen (33,6 %) ändern sich; 4.198 von 5.816 Titeln haben mindestens eine geänderte Stufe.
- Danach gilt je Faktor exakt 10 / 15 / 30 / 20 / 25 %.

**Weitere Bereiche**

| Bereich | Wirkung |
|---|---|
| Faktorwerte | unverändert, 0 von 46.207 Zellen |
| Strategie-Treffer | unverändert (Bedingungen auf Werte) |
| Screener-Treffer | unverändert. Nur die Stufenwörter in den Zeilen folgen der Position; der Text nennt die 70 eine Schwelle auf den Wert. |
| Radar | 689 Ereignisse unverändert. Die erste Berechnung nach dem Wechsel unterdrückt 196 Stufenwechsel des Paars 01.→02.10. als Methodikwechsel (`factorBandSince`). Danach zählen Stufenwechsel nach Position. |
| Watchlist | folgt dem Radar, keine Scheinmeldungen |

**Prominente Titel** (Wert → Stufe vorher → nachher, Position)

- NVDA:
  - Bilanzqualität 43 schwach (27,9 %), unverändert;
  - Wachstum 87 stark → sehr stark (97,3 %).
- AAPL:
  - Bilanzqualität 62 durchschnittlich → stark (77,4 %);
  - Risiko 89 niedrig → sehr niedrig (92,2 %).
- MSFT:
  - Kursstärke 71 → stark (77,9 %);
  - Bewertung 46 → teuer (39,6 %).
- JPM:
  - Wachstum 75 → stark (88,9 %);
  - Bewertung 27 teuer → sehr teuer (10,9 %).
- META: Bilanzqualität 73 durchschnittlich → sehr stark (96,6 %).
- AMZN: Wachstum 75 → stark, Kursstärke 72 → stark.
- GOOG / GOOGL: unverändert.
