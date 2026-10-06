# VU Historical Accuracy Report — Mission VIII (Historical Structural Accuracy Benchmark)

Stand: 06.10.2026. Branch `claude/vision-universe-mission-viii-7hjwma`.
* Präregistrierung: `HISTORICAL_ACCURACY_PREREGISTRATION.md` (SHA-256 `f75d97f1…`, Commit `df6d58867f8`).
* Holdout-Öffnung: Commit `b2c925807a1`, einmalig, siehe `HOLDOUT_OPENING_LOG.md`.
* Alle Zahlen stammen aus:
  * `quant/data/technical-intelligence/historical-accuracy/{local,ci}/*.json`;
  * dem versionierten Evidenz-Artefakt `technical-intelligence-evidence-v2.json`;
  * vollständige Tabellen: `hsab/HSAB_TABLES.md`.

> **Kernaussage:** Die historische Trefferquote der Hauptszenarien ist hoch, auf Tagesbasis rund **69 %**. Fast alles davon ist Geometrie (nahe Ziele, Invalidation erst per Schluss). Zufällige andere Aktien mit denselben Abständen am selben Tag erreichen **68 %**.
>
> Messbar über dieser Kontrolle liegt ein kleiner Rest: +1,0 Pp. (Tag) bzw. +2,5 Pp. (Woche, delistete Titel). Er hält aber zwei vorab festgelegten Prüfungen nicht stand:
> * derselbe Titel zu zufälligen nahen Zeitpunkten schneidet **besser** ab;
> * die **Gegenrichtung** mit denselben Abständen schneidet nicht schlechter ab.
>
> **Urteil nach den vorab registrierten Regeln:** DETECTABLE BUT NEGLIGIBLE. **Gesamtklassifikation:** C — DESCRIPTIVE / DECISION-SUPPORT VALUE.

## 1. Was wurde getestet?

Das eingefrorene Produkt in genau dem Zustand, den die Präregistrierung festhält:
* Szenario `ti-scenario-1.2.1`;
* Elliott `elliott-3.2.2`, Regelwerk `elliott-rules-3.1.0`, Konfluenzgewicht 0;
* Familiengewichte TREND 0,30 / MOMENTUM 0,20 / STRUCTURE 0,15 / HIGHER_TF 0,15 / VOLUME 0,10 / PATTERN 0,08 / ELLIOTT 0 / WYCKOFF 0;
* Engine-Hashes in `protocol.json → freeze.engineFiles`.

Je Analysezeitpunkt (Pivot-Bestätigung `scale-2`) entstand, nur aus Daten bis t, das, was der Kunde gesehen hätte:
* Ausblick, Strukturklarheit, Hauptszenario mit Ziel 1/2 und Invalidation, Alternative, Elliott-Status;
* dazu 13–17 Ablations-Varianten aus denselben Engine-Ergebnissen.

Messgröße PSS:
* Ziel 1 vor einem Schluss jenseits der Invalidation, innerhalb 26 Wochen / 126 Handelstagen; kein Einstieg nötig.
* Vergleich mit gematchten Kontrollen.

## 2. Wie viele Titel, Szenarien, welcher Zeitraum?

| Phase | Universum | Titel mit Analysezeitpunkten | Ereignisse (gewertet) | Zeitraum der Ereignisse | Status |
|---|---|---|---|---|---|
| W_DEV | Überlebende Woche, Hash-Hälfte 0 | 2.608 | 94.686 | 1993-01 – 2026-04 | Entwicklung (Daten früher gesehen) |
| W_VAL | Überlebende Woche, Hälfte 1 | 2.512 | 91.939 | 1993-01 – 2026-04 | Validierung (Daten früher gesehen) |
| **W_HOLDOUT** | delistete Listings (Woche, Daten ab 2015) | 1.453 | **11.274** | 2018-01 – 2026-01 | **Final Holdout** (unberührt für TI) |
| D_DEV | Tag, 600er-Stichprobe, ≤ 2016-06 | 231 | 21.481 | 1992 – 2016 | Entwicklung |
| **D_HOLDOUT** | Tag, 1.200er-Stichprobe (Stammaktien), 2017-01 – 2026-09 | 961 | **38.618** | 2017-01 – 2026-04 | **Conditional Holdout** |

Zum Universum:
* Stage 1 lief über alle 6.348 Wochenreihen der Überlebenden (5.292 lang genug, 564.191 Records).
* Delisted-Kohorte: 3.082 Listings, 1.619 lang genug.
* Die Wochenhistorie beginnt 1990; zuverlässig mit genügend Titeln ab 1993 (≈ 300 je Hälfte), 2025 über 2.000 je Hälfte (`HSAB_TABLES.md`, Universum).
* **Intraday:** BLOCKED (keine Historie im Bestand).

## 3. Wie viel Survivorship-Bias bleibt?

* **Überlebende Woche:** nur heute gelistete Titel. Die Delisted-Daten reichen erst ab 2015, mit verwendbarer Historie ab 2018.
* **Kombination 2018+ aus beiden Kohorten:**

  | Kohorte | PSS | Lift gegen D |
  |---|---|---|
  | nur Überlebende (n = 83.843) | 59,1 % | +2,8 Pp. |
  | nur Delistete (n = 11.274) | 57,1 % | +2,5 Pp. |
  | kombiniert, gewichtet (n = 95.117) | 58,8 % | +2,8 Pp. |

  Survivorship hebt die absolute Quote ab 2018 um rund **0,2 Pp.**; auf den Lift wirkt sie kaum.
* **Vor 2018 nicht quantifizierbar** (keine Delisting-Historie vor 2015).
* **Tag:** nur Überlebende.
* **Historische Indexmitgliedschaft:** nicht vorhanden (Mitgliedsdaten erst ab 09/2026). Es wurde **kein** Indexuniversum verwendet.

## 4. War das Replay vollständig kausal?

**Ja, mit offengelegten Ausnahmen.**

Nachweise:
* Präfix-Identität: Record aus der bei t abgeschnittenen Reihe = Record aus der vollen Reihe, alle Felder einschließlich Erkennungszeitpunkt (HSAB-C1, 36 + 1.294 Stichproben im Review).
* Vergiftete Zukunft ohne Wirkung (HSAB-C2).
* Konfidenzlabel ohne die aus allen Zeiträumen gerechnete Evidenztabelle.
* Stage-1-Records gesiegelt, bevor Stage 2 Kurse nach t las.
* Panel-Abgleich je Record.

Ausnahmen:
* **Spätere Splits und Anzeigerundung (Code-Review H1).** Auf split-bereinigten Kursen ist der Rundungsschritt relativ zur ATR von späteren Splits abhängig. Lift-Sensitivität ohne grobe Rundung: Woche +2,3, Tag +1,0 Pp., also unverändert.
* Heutige Sektor-Taxonomie in Segmenten.
* **Elliott ohne Vorzustand** im Hauptlauf. Die Produkt-Kette ändert in 2.279 + 318 Proben **nie** das Hauptszenario, den Ausblick oder die Klarheit; die Elliott-Zählung selbst ist zu 74–78 % gleich.
* **Stage-1-Siegel nicht reproduzierbar** über Läufe (dynamische Worker-Verteilung der Shards). Der Holdout-Lauf meldete andere Siegel (`0c8c6d7b…`, `4e5f91fc…`). Titelmenge (SHA-256), Records, Jahresverteilung, Persistenzproben und Engine-Hashes sind identisch. Ein inhaltsbasiertes Siegel ist als Folgeschritt notiert.

## 5. Hauptgröße und Ergebnis

**PRIMARY SCENARIO STRUCTURAL SUCCESS (PSS), Lift gegen Kontrolle D** (gleiches Datum, zufällige andere Titel derselben Kohorte, gleiche Richtung und Abstände in ATR-Einheiten). Zweiweg-Cluster-Bootstrap (Titel × Halbjahr), breitestes Intervall.

| | W_DEV | W_VAL | **W_HOLDOUT** | D_DEV | **D_HOLDOUT** |
|---|---|---|---|---|---|
| PSS (VU) | 59,3 % | 59,6 % | **57,1 %** | 70,2 % | **69,1 %** |
| Kontrolle D | 57,2 % | 57,3 % | **54,6 %** | 69,8 % | **68,1 %** |
| **Lift** (95 %-KI) | +2,1 (+1,5 … +2,6) | +2,2 (+1,6 … +2,8) | **+2,5 (+1,4 … +3,5)** | +0,4 (−0,3 … +1,1) | **+1,0 (+0,5 … +1,5)** |
| Abdeckung (Anteil Analysezeitpunkte mit Szenario) | 93,1 % | 93,3 % | 92,2 % | 90,1 % | 90,3 % |
| Random-Walk-Erwartung b/(a+b) | 64,0 % | 64,1 % | 64,5 % | – | – |
| E (einfacher Trend + ATR-Terzil) | +1,7 | +1,9 | +1,9 | +0,4 | +0,7 |
| P (Timing-gematcht) | +2,3 | +2,4 | +1,6 | +0,8 | +0,7 |
| B (gleicher Titel, Zufallszeit) | +0,1 | +0,1 | −2,8 | +0,2 | −0,9 |
| **C (gleicher Titel, zeitnah)** | **−2,0** | **−2,1** | **−3,4 (−7,2 … +0,5)** | −1,3 | **−1,7 (−3,7 … −0,1)** |
| **Gegenrichtung** (VU − gespiegelt) | +4,3 | +4,7 | **−0,5 (−6,5 … +5,5)** | +2,8 | **+1,0 (−1,6 … +3,5)** |

### Entscheidung nach §5–§6 der Präregistrierung (mechanisch, `report.mjs`)

| Kriterium | Woche (W_HOLDOUT) | Tag (D_HOLDOUT) |
|---|---|---|
| H (Lift > 0, einseitig 2,5 %) | ✅ bestanden | ✅ bestanden |
| Relevanz (Lift ≥ 2,0, untere Grenze ≥ 0,5) | ✅ erfüllt | ❌ (+1,0) |
| G1 Lift gegen P | ✅ | ✅ |
| G2 Lift gegen C, untere Grenze ≥ −0,5 | ❌ | ❌ |
| G3 Lift gegen E ≥ 0 | ✅ | ✅ |
| G4 Gegenrichtung > 0 | ❌ | ❌ |
| G5 gleiches Vorzeichen in allen Sensitivitäten | ✅ | ✅ |
| Äquivalenz (90 %-KI in ±1,5 Pp.) | nein (+1,6 … +3,4) | **ja** (+0,5 … +1,4) |

**Ergebnis: DETECTABLE BUT NEGLIGIBLE.**
* Ein kleiner Lift ist in beiden Holdouts nachweisbar.
* Er ist kein Vorteil im Sinn der vorab registrierten Kriterien.
* Auf Tagesbasis ist er kleiner als die Äquivalenzschwelle.

### Vorab registrierte Nebengrößen (Holm, einseitig)

| | Woche | Tag |
|---|---|---|
| S1 Kundensicht (Monatsraster) | +1,2 (−0,4 … +2,7), nicht signifikant | +0,5 (−0,3 … +1,3), nicht signifikant |
| S2 Ausführungsebene (Einstieg nötig) gegen gematchte Kontrolle | +2,6 (+1,4 … +3,9) ✅ | +1,2 (+0,4 … +1,9) ✅ |
| S3 Erwartungswert in R gegen D | +0,026 R (−0,002 … +0,054), nicht signifikant | +0,012 R (−0,000 … +0,024), nicht signifikant |
| S4 Strukturklarheit CLEAR | +3,0 (+1,5 … +4,5) ✅ | +1,1 (+0,4 … +1,8) ✅ |
| S5 Risk-off | +2,6 (+0,2 … +5,1), Holm nicht signifikant | +2,2 (+0,9 … +3,5) ✅ |

Der Erwartungswert je Szenario ist **negativ**: −0,19 R (Woche, Holdout), −0,11 bis −0,14 R (DEV/VAL). Ein Anleger, der jedem Hauptszenario ab dem Anzeigeschluss gefolgt wäre, hätte im Mittel verloren. Die Kontrollen verlieren ähnlich viel.

## 6. Abdeckung, Enthaltung, Strukturklarheit

Details: `COVERAGE_ACCURACY_REPORT.md`.
* **Selektivität verbessert den Lift monoton, aber auf kleinem Niveau.** Woche, Holdout:

  | Abdeckung | Lift |
  |---|---|
  | 92 % | +2,5 Pp. |
  | 62 % (CLEAR) | +3,0 Pp. |
  | 24 % (Einigkeit Top 25 %) | +3,9 Pp. |
  | 9 % (Top 10 %) | +5,0 Pp. (+1,1 … +9,0) |

  Tag: von +1,0 auf +1,7 Pp. Die **absolute** Quote steigt dabei kaum (57 → 58 % Woche, 69 → 71 % Tag), weil die Kontrollen in diesen Stufen sinken.
* **Enthaltung hilft kaum messbar.** VU enthält sich nur an 8–10 % der Zeitpunkte, fast immer als Seitwärts-Szenario. Das Gegenmodell TREND_ONLY ist dort schwächer (+0,2 vs. +1,7 Pp. Tag; −0,2 vs. +2,1 Woche), die Intervalle der Enthaltungsfälle schließen aber 0 ein.
* **Strukturklarheit bedeutet vor allem Stabilität:**
  * Umdeutung je Bar (Woche): CLEAR 11,6 %, MODERATE 20,5 %, AMBIGUOUS 34,0 % (Holdout); in DEV 12,5 / 26,4 / 42,5 %.
  * Monoton auch im Lift: Woche +3,0 / +1,7 / +0,8; Tag +1,1 / +1,1 / +0,2.
  * Klarheit ist ein **Stabilitäts- und Eindeutigkeitsmaß**, kein Wahrscheinlichkeitsmaß.

## 7. Methoden

Details: `TECHNICAL_METHOD_ATTRIBUTION.md`.
* **Full TI ≈ Trend allein.** 98,6–99,9 % identische Hauptszenarien; gepaarte Differenz −0,2 … 0,0 Pp. Komplexität ohne Zusatzinformation.
* **Den größten Einfluss auf die Szenarien hat Unterstützung/Widerstand.**
  * Ohne S/R ändern sich 91–96 % der Szenarien.
  * Gepaart: DEV/VAL +1,1/+1,3 Pp. (signifikant); Holdout Woche +0,7 (−0,2 … +1,7); Tag −0,7 (−1,4 … +0,1).
  * Nicht stabil.
* **Ohne messbaren Zusatzwert:** Momentum, Struktur, Formationen, Fibonacci, Volumen, höherer Zeitrahmen, Elliott, Wyckoff. Ihr Entfernen verändert den Lift um ≤ 0,3 Pp.; Momentum, Struktur, Volumen, HTF, Elliott und Wyckoff ändern fast nie das Szenario.
* **Konflikt zwischen Familien ist informativ, Einigkeit gering.** VAL: kein Gegenvotum +3,0 Pp., Gegenvotum +1,2, Gemischt +0,4. Vier und mehr stützende Familien +4,5 gegen eine +0,8. Effektiv unabhängige Familien: ≈ 3,5 von 5 (Korrelation 0,4–0,5).
* **Einfache Modelle sind auf der Richtungsprobe gleichwertig oder besser.**
  * Der einfache Rücksetzer-im-Trend schlägt VU auf der Barriere-Probe: +4,0 vs. +1,9 Pp. (Woche), +2,7 vs. +1,5 (Tag).
  * Der SMA-Trend ist gleichauf.
  * Die 13-Wochen-Überrendite der VU-Richtung ist auf Wochenbasis **negativ** (−1,4 % Holdout, −2,6 % DEV).

## 8. Elliott

* Elliott spricht (Anwendbarkeit ≥ MITTEL) an **0,3–0,7 %** der Analysezeitpunkte. Es formt in keinem einzigen Ereignis das Hauptszenario.
* **Wann Elliott spricht:**
  * Woche, Holdout: 75 Ereignisse, PSS 65,3 % gegen D 59,7 %, Lift +5,6 (−8,0 … +19,2).
  * Tag: 113 Ereignisse, +6,4 (−0,6 … +13,4).
  * Zu wenige Fälle für eine Aussage.
* **Die Elliott-Hypothese** (Richtung der bevorzugten Lesart, auch bei Enthaltung) gleichgerichtet mit dem Szenario gegen gegenläufig:

  | | gleichgerichtet | gegenläufig |
  |---|---|---|
  | Woche | +3,2 Pp. | +1,2 Pp. |
  | Tag | +1,7 Pp. | −0,4 Pp. |

  Explorativ und nicht vorab registriert. Ein Hinweis für einen künftigen Test, kein Befund.
* **Prospektive Strukturkonsistenz:**
  * Enthaltene Zählungen bestätigen sich (+2 ATR vor Elliott-Grenze) in 55–62 %; das sind +0,2 bis +1,5 Pp. gegen die Kontrolle.
  * Umzählung vor Auflösung in 38 % der Per-Bar-Fälle.
  * Sprechende Zählungen: n = 6–14.
* **Keine Aussage „X % richtige Elliott-Wellen“.** Es gibt keine objektive Wahrheit für das Label.
* **Rolle: STRUCTURAL LANGUAGE / EXPERIMENTAL ONLY.**

## 9. Umdeutung und Stabilität

* Umdeutung (Richtungswechsel oder Rücknahme) vor Auflösung:
  * je Analysezeitpunkt 7–15 % (Woche), 9,4 % (Tag);
  * je Bar (Stichprobe) 16–19 % (Woche).
* Niveauverschiebung um mehr als 1 ATR vor Auflösung: **62 %**. Die Szenario-Niveaus sind instabil, auch wenn die Richtung bleibt.
* Median bis zur Umdeutung: 3–9 Wochen je nach Klarheit.
* Szenarien, die vor der Auflösung umgedeutet wurden, erreichen ihr Ziel nur zu 30 %. Das ist ex post und kein Prädiktor.

## 10. Stabilität über Zeiträume und Segmente

* **Zeiträume (VAL, explorativ):** vor 2013 +1,8, 2013–2018 +1,5, ab 2019 +3,0 Pp. Gleiche Richtung, unterschiedliche Größe.
* **Richtung:** bärische Szenarien haben einen größeren Lift (Woche +3,6, Tag +1,5) als bullische (+1,1 / +0,6, Intervalle schließen 0 ein). Der Markt-Drift hebt bullische Kontrollen.
* **Volatilität (Tag):**
  * komprimiert +2,1, normal +1,3;
  * erhöht und extrem +0,2;
  * Woche: extrem +4,4, komprimiert +4,3, normal +1,8.
  * Kein konsistentes Muster über Zeitrahmen.
* **Risk-off** (vorab registriert): Woche +2,6 (Holm nicht signifikant), Tag +2,2 ✅.
* **Liquidität (Tag):** < 1 Mio USD +1,8, 1–10 Mio +0,4, ≥ 10 Mio +0,8.
* **Konzentration:** Top-10-Anteil 1,2–2,6 %, HHI ≤ 0,0013. Kein Titel dominiert.

## 11. Antworten auf §115

| # | Frage | Antwort |
|---|---|---|
| 1 | System | `ti-scenario-1.2.1`, `elliott-3.2.2`, Produktmethodik eingefroren (§1) |
| 2 | Wertpapiere | 5.292 Überlebende (Woche), 1.619 delistete Listings, 961 Tagestitel (Holdout) |
| 3 | Szenarien | gewertet: 94.686 + 91.939 (W_DEV/VAL), 11.274 (W_HOLDOUT), 21.481 + 38.618 (Tag); Kalenderraster zusätzlich 37.671 (Woche) / 60.667 (Tag) |
| 4 | Zeitraum | Woche 1993–2026; Holdout Woche 2018–2026; Tag 1992–2016 (DEV), 2017–2026 (Holdout) |
| 5 | Woche/Tag | Woche: Lift +2,1 … +2,5 Pp. Tag: +0,4 … +1,0 Pp. |
| 6 | Survivorship | ab 2018 ≈ 0,2 Pp. auf die absolute Quote; vor 2018 unbekannt; Tag nur Überlebende |
| 7 | kausal? | ja, mit offengelegten Ausnahmen (§4) |
| 8 | Hauptgröße | PSS-Lift gegen D (§5) |
| 9 | PSS | Woche 57,1 % (Holdout), Tag 69,1 % (Holdout) |
| 10 | Baseline | 54,6 % / 68,1 % |
| 11 | Lift | +2,5 / +1,0 Pp. |
| 12 | Abdeckung | 92 % / 90 % der Analysezeitpunkte |
| 13 | Selektivität? | ja, monoton (bis +5,0 Pp. bei 9 % Abdeckung, Woche); klein; absolute Quote steigt kaum |
| 14 | Enthaltung? | kaum messbar (8–10 % Enthaltung, Gegenmodell dort schwächer, n. s.) |
| 15 | Strukturklarheit? | ja für Stabilität (Umdeutung 12 vs. 34 %), schwach für Ergebnis (+3,0 vs. +0,8 Pp.) |
| 16 | meiste Wirkung | Unterstützung/Widerstand (prägt die Geometrie), nicht stabil im Holdout |
| 17 | ohne Wert | Momentum, Struktur, Formationen, Fibonacci, Volumen, HTF, Elliott, Wyckoff (inkrementell) |
| 18 | Full TI vs. Trend | **nicht besser** (≈ identisch) |
| 19 | Elliott? | nein (spricht < 1 %, formt nie) |
| 20 | Umdeutung | 7–19 % Richtung, 62 % Niveaus |
| 21 | über Zeiträume stabil? | Vorzeichen ja, Größe nein |
| 22 | über Sektoren/Titel? | keine Konzentration; Segmente uneinheitlich (`HSAB_TABLES.md`) |
| 23 | finaler Holdout | nachweisbarer, aber vernachlässigbarer Lift; G2 und G4 verfehlt |
| 24 | Red Team | 70 %-Quote ist Geometrie; Metrik- und Kontrollwahl angreifbar → Gates, Gegenrichtung, Kalenderraster, Relevanzregeln (`reviews/MISSION8_METHODOLOGY_REDTEAM.md`) |
| 25 | vertretbare Aussage | siehe `TECHNICAL_INTELLIGENCE_CLAIMS_MATRIX.md`: deskriptive Aussagen und die Stabilitätsbedeutung der Strukturklarheit; Trefferquoten nur mit Kontrollquote |
| 26 | irreführend | „70 % unserer Szenarien treffen“, „X % Wahrscheinlichkeit“, „Elliott-Wellen zu X % richtig“, „besser als Zufall“ ohne Einschränkung |
| 27 | „rund 70 %“-Aussage? | **Nein.** Auf Tagesbasis zahlenmäßig wahr (69,1 %), aber gleich gute Zufallsfälle erreichen 68,1 %. Auf Wochenbasis 57–60 %. |
| 28 | Einordnung | **C — deskriptiv / Entscheidungsunterstützung** |

## 12. Statustabelle (§118)

| Bereich | Status |
|---|---|
| Causal Replay | **PASS** (Ausnahmen offengelegt: Split-Rundung, Elliott ohne Vorzustand im Hauptlauf, nicht reproduzierbares Shard-Siegel) |
| Data Quality | **PASS** (Record-Audit über 564.191 Ausgaben: 0 unmögliche Niveaus, 0 Szenarien auf toten Reihen, 0 Elliott-Formung trotz Enthaltung; Befund: 9,8 % Ziel 1 bei Anzeige schon erreicht) |
| Survivorship Control | **PARTIAL** (ab 2018 kontrolliert, Effekt ≈ 0,2 Pp.; davor unbekannt; Tag nur Überlebende) |
| Final Holdout | **DONE, einmal** (W_HOLDOUT unberührt; D_HOLDOUT bedingt) |
| Primary Scenario Edge | **DETECTABLE BUT NEGLIGIBLE** (Woche +2,5, Tag +1,0 Pp.; G2/G4 verfehlt; Tag äquivalent zu 0 in ±1,5 Pp.) |
| Coverage–Accuracy Relation | **monoton, klein** |
| Abstention Value | **NOT ESTABLISHED** |
| Structure Clarity | **Stabilitätsmaß bestätigt**, kein Prognosemaß |
| Trend Incremental Value | trägt die Richtung; kein Zusatz über einfachen SMA-Trend |
| Structure Incremental Value | **keiner** |
| Momentum Incremental Value | **keiner** |
| Volume Incremental Value | **keiner** (Tag; Woche ohne Volumen) |
| Support/Resistance | prägt die Geometrie; Zusatzwert in DEV/VAL, im Holdout nicht stabil |
| Fibonacci | **keiner** |
| Elliott | **keiner** (spricht < 1 %) |
| Wyckoff | **keiner** |
| Full Technical Intelligence | ≈ Trend allein; kein Mehrwert durch Komplexität |
| Customer Accuracy Claim | **NOT SUPPORTED** (als Vorteils- oder Trefferquotenaussage) |
| Legal Review | **REQUIRED** |

## 13. Selbstkritik (§119)

1. **Stärkstes Ergebnis:** Strukturklarheit ordnet die Stabilität der Szenarien zuverlässig. Umdeutung CLEAR 12 % gegen AMBIGUOUS 34–43 %, in DEV, VAL und Holdout gleich.
2. **Schwächstes Ergebnis:** jede Vorteilsbehauptung.
   * Gegen zeitnahe Zeitpunkte derselben Aktie ist VU schlechter (−2 bis −3 Pp.).
   * Die Gegenrichtung ist im Holdout gleich gut.
3. **Verschwundener Vorteil:** Der D-Lift (+2,5 / +1,0) verschwindet gegen C und gegen die Gegenrichtung. Er ist eher ein **Zeitpunkt-** und **Querschnittseffekt** als Richtungswissen: Szenarien entstehen bei Pivots, in Phasen, in denen nahe Ziele häufiger fallen.
4. **Verbessert Selektivität?** Ja, monoton, aber im Bereich +1 … +5 Pp. Auf Tagesbasis bleibt jede Stufe unter +2 Pp.
5. **Hilft Enthaltung?** Nicht nachweisbar.
6. **Bedeutet Strukturklarheit etwas Prädiktives?** Für Stabilität ja, für das Ergebnis kaum.
7. **Meiste Zusatzinformation:** Unterstützung/Widerstand, in der Entwicklung. Im Holdout nicht stabil.
8. **Keine Zusatzinformation:** Momentum, Struktur, Formationen, Fibonacci, Volumen, HTF, Elliott, Wyckoff.
9. **Full TI besser als Trend allein?** Nein.
10. **Elliott:** nur Struktursprache. Experimentell; spricht zu selten, um etwas zu messen.
11. **Wirtschaftlich bedeutsam?** Nein. Der Erwartungswert je Szenario ist negativ (−0,1 bis −0,2 R); der Lift entspricht +0,01 bis +0,04 R.
12. **Verbleibender Survivorship-Bias:** klein ab 2018, unbekannt davor.
13. **Vertrauenswürdigkeit des Holdouts:**
    * Woche: sauber, aber selektiert (delistete Titel, Historie ab 2015; Treue-Prüfung zeigt keine wesentliche Verzerrung).
    * Tag: bedingt (Kalender wochenweise gesehen, Stichprobe 1.200 Titel, nur Überlebende).
    * Beide liefern dasselbe Bild wie DEV/VAL.
14. **Was ein externer Quant kritisieren würde:**
    * Ereignisse an Pivot-Bestätigungen statt an beliebigen Tagen (das Kalenderraster zeigt +1,2 bzw. +0,5 Pp., nicht signifikant);
    * ATR auf Wochenschlüssen;
    * Kontrollen ohne Matching der Swing-Richtung;
    * nicht reproduzierbares Shard-Siegel;
    * Stichprobe statt Universum auf Tagesbasis.
15. **Technisch wahr, aber irreführend:** „69 % unserer Szenarien erreichten ihr erstes Ziel.“
16. **Wirklich vertretbar:**
    * „Unsere Szenarien erreichen ihr erstes Ziel etwa so oft wie zufällige Vergleichsfälle mit denselben Abständen.“
    * „Eine klare Struktur wird seltener umgedeutet.“
17. **Bereit, historische Evidenz öffentlich zu zeigen?**
    * Nur als **ehrliche Vergleichsdarstellung**: Quote, Kontrollquote und Lift nebeneinander, mit Hinweisen; vorbehaltlich Legal Review.
    * Nicht als Erfolgsquote.
    * Datenvertrag: `technical-intelligence-evidence-v2.json`; Status: kein Produkt-Panel mit Trefferquote.

## 14. Produktbefunde (nicht in dieser Mission geändert, Fachmodell eingefroren)

1. **Ziel 1 bei Anzeige bereits erreicht:**
   * 9,8 % aller angezeigten gerichteten Szenarien (Record-Audit), 10–15 % im Kalenderraster;
   * fast nur im Status EXTENDED, weil die Ziele von der Einstiegszone, nicht vom Kurs, aus gemessen werden;
   * Empfehlung: eigener PR mit Vorher/Nachher-Vergleich (Ziel ausblenden oder als „bereits erreicht“ kennzeichnen).
2. **Konfidenzlabel** zeigt in 99,9 % „LOW“ (`NO_HISTORICAL_EDGE`) und nutzt eine Tabelle aus allen Zeiträumen. Als Selektivitätsmerkmal unbrauchbar; die Strukturklarheit trägt die Information.
3. **Szenario-Niveaus verschieben sich** vor der Auflösung in 62 % um mehr als 1 ATR. Die Darstellung „Ziel/Invalidation“ wirkt fester, als sie ist.
4. **Test-Isolation:** `quant/tests/total-return-verification.test.mjs` schreibt beim Testlauf `quant/data/providers/total-return-verification.json` (Skript ohne `--out`). Vorbestehend; außerhalb dieser Mission.
