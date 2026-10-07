# Technical Intelligence Claims Matrix (Mission VIII, §102)

* Evidenzversion: `technical-intelligence-evidence-2.0.0` (`quant/data/technical-intelligence/historical-accuracy/technical-intelligence-evidence-v2.json`).
* Methodik: `VU-HSAB hsab-1.0.0`.
* Engine: `ti-scenario-1.2.1` / `elliott-3.2.2`.
* **Jede Engine-Änderung setzt alle Zeilen auf „bis zur Revalidierung nicht verwenden“.**
* **LEGAL REVIEW REQUIRED** für jede veröffentlichte Formulierung.

Klassen: SUPPORTED · SUPPORTED WITH QUALIFICATION · NOT SUPPORTED · MISLEADING / DO NOT USE

| # | Aussage | Klasse | Begründung (Evidenz) | Zulässige Formulierung / Pflichtzusätze |
|---|---|---|---|---|
| 1 | „VU erzielte historisch X % Szenario-Treffsicherheit.“ | **MISLEADING / DO NOT USE** | Die Quote (57–69 %) ist überwiegend Geometrie; Kontrollen gleicher Abstände erreichen 55–68 %. | — |
| 2 | „Rund 70 % unserer Szenarien erreichten ihr erstes Ziel.“ | **MISLEADING / DO NOT USE** | Tag 69,1 % gegen 68,1 % Kontrolle; Woche 57–60 %. | — |
| 3 | „Unsere Hauptszenarien erreichten ihr erstes Ziel etwa so oft wie zufällige Vergleichsfälle mit denselben Abständen.“ | **SUPPORTED WITH QUALIFICATION** | Lift +1,0 (Tag) bis +2,5 Pp. (Woche); Gates G2/G4 verfehlt. | „In einer historischen Nachrechnung (US-Aktien, Tag 2017–2026, Woche 1993–2026, einschließlich delisteter Titel ab 2018) erreichte das jeweils gezeigte Hauptszenario sein erstes Ziel etwa so oft wie zufällig gewählte Vergleichsfälle mit gleichen Abständen. Ein verlässlicher Prognosevorteil ist damit nicht belegt.“ Zusätze: Zeitraum, Universum, Survivorship-Status, Evidenzversion. |
| 4 | „Klare Strukturen schnitten besser ab.“ | **NOT SUPPORTED** (als Ergebnisaussage) | +3,0 vs. +0,8 Pp. (Woche); Tag +1,1 vs. +0,2; klein, Gates nicht geprüft. | — |
| 5 | „Bei klarer Struktur wird das Szenario seltener umgedeutet.“ | **SUPPORTED** | Umdeutung je Bar CLEAR 11,6–12,5 % gegen AMBIGUOUS 34–43 %, in DEV, VAL und Holdout. | „Wenn das Chartbild als ‚klar‘ eingestuft ist, wechselte die Lesart historisch deutlich seltener, bevor sie sich auflöste (rund jedes achte gegenüber jedem dritten Szenario).“ Zusatz: „Klarheit beschreibt die Eindeutigkeit, keine Trefferwahrscheinlichkeit.“ |
| 6 | „VU schlug zufälliges Timing.“ | **NOT SUPPORTED** | Gegen zeitnahe Zeitpunkte derselben Aktie −1,7 bis −3,4 Pp.; gegen die ganze Historie derselben Aktie ±0. | — |
| 7 | „VU schlug zufällig gewählte Aktien am selben Tag.“ | **SUPPORTED WITH QUALIFICATION** (nur intern) | +1,0 / +2,5 Pp., signifikant, aber nicht relevant (Tag) bzw. gegen Gegenrichtung nicht robust. | Nicht für Kundenkommunikation; nur intern als Forschungsbefund. |
| 8 | „Technische Konfluenz verbessert die Ergebnisse.“ | **NOT SUPPORTED** | Monoton nach Einigkeit, aber klein (Tag +1,0 → +1,7 Pp.) und korreliert. Full TI ≈ Trend allein. | Zulässig nur beschreibend: „Mehrere Verfahren zeigen in dieselbe Richtung.“ |
| 9 | „Elliott verbessert die Prognose.“ | **NOT SUPPORTED** | Spricht < 1 %, formt nie ein Szenario; keine messbare Wirkung. | — |
| 10 | „VU-Elliott-Wellen sind zu X % richtig.“ | **MISLEADING / DO NOT USE** | Keine objektive Wahrheit für Wellenlabels; Praktiker widersprechen sich. | — |
| 11 | „Dieses Setup hat X % Wahrscheinlichkeit.“ | **MISLEADING / DO NOT USE** | Kein kalibriertes Modell; historische Häufigkeit ≠ heutige Wahrscheinlichkeit. | — |
| 12 | „Ziel 1 wurde historisch in X % erreicht.“ | **SUPPORTED WITH QUALIFICATION** | nur mit Kontrollquote. | „Ziel 1 wurde in X % erreicht, bevor die Grenze per Schlusskurs brach; vergleichbare Zufallsfälle mit gleichen Abständen erreichten es in Y %.“ Zusätze: Zeitraum, n, Abdeckung, Universum, Survivorship, Evidenzversion, „keine Wahrscheinlichkeit“. **Nie X ohne Y.** |
| 13 | „VU schlug ein einfaches Trendmodell.“ | **NOT SUPPORTED** | Full TI = TREND_ONLY (98,6–99,9 %); gleichauf mit dem SMA-Trend; Rücksetzer-im-Trend besser. | — |
| 14 | „VU ordnet Struktur, Zonen und Grenzen nachvollziehbar und ohne Blick in die Zukunft.“ | **SUPPORTED** | Kausales Replay, Präfix-Identität, Record-Audit ohne unmögliche Niveaus. | „Die Analyse nutzt nur Kurse bis zum jeweiligen Tag und ändert vergangene Einstufungen nicht nachträglich.“ |
| 15 | „Szenarien helfen, Risiko und Ungültigkeit vorab festzulegen.“ | **SUPPORTED** (Produktwert, keine Prognose) | Deskriptive Funktion. | „Das Chartbild zeigt, ab welchem Kurs eine Lesart nicht mehr gilt.“ Zusatz: „Das ist keine Prognose.“ |
| 16 | „Unsere Szenarien liefern einen positiven Erwartungswert.“ | **MISLEADING / DO NOT USE** | Ereignis-R im Mittel −0,1 bis −0,2 R. | — |
| 17 | „Historische Evidenz: N Fälle, Erfolg X %, Vergleich Y %, Lift Z Pp.“ (Produkt-Panel §108) | **SUPPORTED WITH QUALIFICATION** | Datenvertrag vorhanden; Vorteil nicht belegt. | Nur mit allen Feldern und dem Satz „kein belegter Prognosevorteil“; Lift nie allein; vorher Legal Review. |

| 18 | „Unter fairen Abständen (Ziel ≈ Grenze) trifft VU deutlich häufiger als der Zufall.“ (Mission IX, Track A) | **NOT SUPPORTED** | Symmetrisch 49 % gegen 47 % (Woche, Lift +2 Pp., gegen Trend-Kontrolle E +1,5); obere KI-Grenze 51 %. Tag: siehe MISSION9_FINAL_REPORT.md. | — |
| 19 | „Historisch erreichte dieses Setup X % Erfolg bei Y:1 Chance/Risiko und Z % Abdeckung.“ | **SUPPORTED WITH QUALIFICATION** (werblich wertlos) | Zahlen existieren je CRV-Klasse, aber nur mit der Kontrollquote gleicher Abstände sinnvoll. | Nur zusammen: Erfolg, Kontrollquote gleicher Abstände, Payoff, Abdeckung, n, Zeitraum. LEGAL REVIEW REQUIRED. |
| 20 | „VU-bullische Titel wurden häufiger zu 3×/5×-Gewinnern.“ (Track B) | **NOT SUPPORTED** (Gegenteil gemessen) | 5×/24M gegen vergleichbare Titel 0,62 / 0,64 (DEV/VAL), gegen Quartalsdurchschnitt 0,55–0,57. | — |
| 21 | „VU erkannte X % späterer 5×-Gewinner früh.“ | **MISLEADING / DO NOT USE** | 47–51 % der Episoden bei 44 % Abdeckung; relative Stärke erreicht dasselbe mit 20 % Abdeckung. | — |
| 22 | „Frühe Elliott-Welle-3-Strukturen kündigen große Gewinner an.“ | **NOT SUPPORTED** (für das Produkt) | Angezeigte Zählung zeigt sie praktisch nie. Ein internes, nicht angezeigtes Merkmal ist explorativ mit 1,35–1,4× mehr 5×-Fällen verbunden, ohne Renditevorteil und nicht über relative Stärke hinaus gesichert. | — |

## Pflichtregeln für jede historische Zahl

1. Erfolgsquote **immer** mit Kontrollquote, Lift, n, Abdeckung, Zeitraum, Universum.
2. Survivorship-Status nennen. Woche: Überlebende plus delistete Titel ab 2018; Tag: nur Überlebende.
3. „Historische Häufigkeit, keine Wahrscheinlichkeit.“
4. Evidenzversion und Engine-Version nennen. Bei Engine-Wechsel wird die Zahl zurückgezogen, bis sie neu gemessen ist.
5. Keine Galerie nur mit Erfolgen. Beispiele immer mit Fehlschlägen (§110).
