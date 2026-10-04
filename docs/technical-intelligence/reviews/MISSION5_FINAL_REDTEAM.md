# Mission V — Finales Red-Team (§122)

Stand: 04.10.2026. Unabhängiger, nur lesender Prüfauftrag nach Freeze, erstem Vergleichslauf und erster Ergebnisstudie.

## Geprüft und in Ordnung

**Reihenfolge der Commits:**
* Nachtrag 5 `3bd4f414e`
* Ziehung `b9f3a4f1f`
* Freeze `8985c6a06`
* Vergleich mit Versiegelung `4faaa3acd`
* Ergebnisstudie `8bfd31071`

**Prüfsummen.** Die Prüfsumme des Freeze und die Hashes der Versiegelung lassen sich nachrechnen.

**Kein Holdout-Leck:**
* Replay und Vergleich enthalten nur die 35 Fälle aus DEVELOPMENT und VALIDATION.
* Es gibt kein Entsiegelungsprotokoll.
* QUARANTINE 0 ist plausibel (Abstand der Stichtage größer als 20 Handelstage).

**Zahlen in den Berichten.** A1–S, J, Teilmengen, Aufteilung und HIGH-Anteil stimmen mit den JSON-Ausgaben überein.

## Befunde und Behandlung

| # | Schwere | Befund | Behandlung |
|---|---|---|---|
| 1 | CRITICAL | Bei abgeschlossenem VU-Hauptmuster verglich B/F/G die Familie bzw. das Muster des abgeschlossenen Musters (`compare.mjs`). Nach Nachtrag 3 ist aber die enthaltende Struktur der laufenden Welle gemeint. Der Satz „WXY-Bias gegen Praktiker bestätigt“ war damit nicht gedeckt. | Nachtrag 6 a (`7c90df6f8`), Korrektur und Test (`1676e1124`), neuer Lauf (`61b930627`). B jetzt 6/18 vergleichbar. Die Aussage ist zurückgenommen. Belegt bleibt: kein IMPULSE in 41 Wiedergaben. |
| 2 | HIGH | 2 BTC-Ergebnisfälle hatten 0 Folgebars („9999-12-31“ erzeugte ein ungültiges Wochenende), zählten aber als ausgewertet. | Nachtrag 6 c: Datum 2099-12-31 und Status `NO_FORWARD_DATA`, Test. Die Fälle haben jetzt 52 Folgewochen. Neue Ergebnisstudie `8d4393be7`. |
| 3 | HIGH | Latenz-Median −10 = linker Fensterrand (13/19 Treffer), keine Latenz. | Nachtrag 6 d: Zähler `leftCensored`; der Bericht nennt die Latenz „nicht bestimmbar“. |
| 4 | MEDIUM | S beruht überwiegend auf einer im Vergleich abgeleiteten Rolle. | S wird getrennt berichtet: Engine 3/9, abgeleitet 13/24. |
| 5 | MEDIUM | Revisionsrate war als „Revisionen je Fall“ beschriftet, gemeint war der Anteil revidierter Fälle. | Bericht korrigiert. |
| 6 | MEDIUM | Familien-κ = 0 bei konstantem Bewerter. | Wird als „nicht definiert“ berichtet. |
| 7 | MEDIUM | A1 gegen die naive Basis zu stark formuliert. | „Nicht von der Basis unterscheidbar“. Eine Momentum-Basis bleibt offen. |
| 8 | MEDIUM (Verdacht) | Schlusskurs-Eingang (O = H = L = C) kann die Engine benachteiligen. | Als Störfaktor berichtet. Engine 3.3 ist nur „indiziert“; zuerst Diagnose OHLC gegen Schlusskurs. |
| 9 | LOW | BTC-Zählung falsch (20 statt 26 Zeilen). | Korrigiert. |
| 10 | LOW | Formulierungen: „ohne KI“, „kein Rauschen“, „widerlegt“, Aussage zu geschlichteten Fällen. | Korrigiert bzw. abgeschwächt. |
| 11 | LOW | Unterer Median in `aggregateOutcomes`. | Dokumentiert; bei n = 33 ohne Wirkung. |

## Folge für die Entscheidungen

* Die Entscheidung „Engine 3.3 Needed: YES (WXY-Bias)“ ist ersetzt durch **INDICATED, NOT CONFIRMED** (kein Impuls; Ursache ungeklärt).
* Pfad: **C für das Produkt.** In der Forschung kommt die Diagnose vor jedem Bau.
* Die Holdouts sind weiterhin versiegelt.
