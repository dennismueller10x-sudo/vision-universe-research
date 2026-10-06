# VU Historical Replay Methodology (Mission VIII — Historical Structural Accuracy Benchmark, HSAB)

Code: `scripts/technical/hsab/` (`replay.mjs` Stage 1, `evaluate.mjs` Stage 2, `lib/structural-outcomes.cjs`, `lib/panel.mjs`, `protocol.json`). Tests: `quant/tests/hsab-mission8.test.mjs`. CI: `.github/workflows/technical-intelligence-mission8.yml`.

## 1. Frage

Was hätte Vision Universe einem Anleger an einem historischen Zeitpunkt t gezeigt? Gerechnet wird nur mit Informationen bis t. Danach wird geprüft: Wie oft entwickelte sich der Markt so, wie es das gezeigte Hauptszenario beschrieb, bevor es ungültig wurde? Und wie oft war das bei fair gematchten Kontrollen der Fall?

Gemessen wird **strukturelle Prognosequalität** (Ebene A). Die Ausführung (Ebene B, Einstieg und Rendite) steht nur als Nebeninformation daneben. Exakte Elliott-Label-Treue und Praktiker-Übereinstimmung werden hier **nicht** gemessen.

## 2. Getestetes System

* Produktfunktion `TI.analyzeAt(P, t, { methodology: PRODUCT_METHODOLOGY })`:
  * Szenario `ti-scenario-1.2.1`;
  * Elliott `elliott-3.2.2`, Regelwerk `elliott-rules-3.1.0`, Konfluenzgewicht 0;
  * dieselbe Funktion, die der Produktbau (`build-technical-intelligence.mjs`) nutzt.
* Was der Kunde sieht, wird je Analysezeitpunkt eingefroren:
  * Ausblick, Strukturklarheit (`clarityOf`), Hauptszenario (Richtung, Vorlage, Status, Einstiegszone, Ziel 1/2, Invalidation, Bestätigung, CRV), Alternative;
  * Elliott-Status (Muster, Welle, Anwendbarkeit/Enthaltung, Klarheit, Grad-Übereinstimmung);
  * Methodenstimmen, Formationen, Wyckoff, Volumen/AVWAP, Unterstützung/Widerstand, Fibonacci-Cluster.
* **Kausale Konfidenz:** Das Produkt-Konfidenzlabel liest eine Evidenztabelle, die aus **allen** Zeiträumen gerechnet wurde. Ein historisches Replay mit dieser Tabelle wäre ein Blick in die Zukunft. Im Replay steht deshalb `evidenceTable = null`. Heute zeigt das Produkt für 99,9 % der Titel ohnehin `LOW` (Regel `NO_HISTORICAL_EDGE`). Als Selektivitätsmaß taugt das Konfidenzlabel damit nicht. Das angezeigte Ordinalmaß ist die **Strukturklarheit** (CLEAR / MODERATE / AMBIGUOUS).
* **Elliott-Persistenz:**
  * Das Produkt hält eine Elliott-Lesart über eine 52-Bar-Kette (Hysterese).
  * Im Hauptlauf rechnen die Analysezeitpunkte ohne Vorzustand. Wie stark das abweicht, misst eine Stichprobe (`--persist`): Kette gegen zustandslos, je 10. Erkennung jedes 40. Titels.
  * In der Per-Bar-Stichprobe (`--perbar 20`) läuft die Kette wie im Produkt mit. Elliott-Lebensdauer und Umzählungen werden nur dort gemessen.

## 3. Ereignisse (§18–§20)

* **Analysezeitpunkte:** Bars, an denen ein Pivot der Setup-Skala `scale-2` bestätigt wird. Das ist dasselbe Ereignis wie in `ti-evidence.mjs`: der Moment, in dem sich das Chartbild strukturell ändert. Mindesthistorie 160 Wochen- bzw. 520 Tagesbars.
* **Ereignis:** Das Produkt zeigt an einem Analysezeitpunkt ein gerichtetes Hauptszenario mit Ziel 1 und Invalidation, und für diesen Titel ist kein früheres Ereignis mehr offen.
* **Lebenszyklus:** Bis zur Auflösung (Ziel 1, Invalidation, Zeitablauf) zählen spätere Analysezeitpunkte nicht als neue Prognose. Sie prüfen nur, ob das Produkt umgedeutet hat:
  * `RELABEL`, Typ `DIR_CHANGE`: keine oder andere Richtung;
  * `LEVEL_SHIFT`: gleiche Richtung, aber Invalidation oder Ziel 1 um mehr als 1 ATR verschoben.
* Ein über acht Wochen gezeigtes Szenario zählt also **einmal**. Das Ergebnis gilt immer den beim ersten Anzeigen eingefrorenen Niveaus.
* Abdeckung wird auf Ebene der Analysezeitpunkte gemessen. Der Nenner sind alle zulässigen Analysezeitpunkte; ohne gerichtetes Szenario gilt der Punkt als Enthaltung.

## 4. Outcome-Definitionen (§6, getrennt geführt)

| Kürzel | Definition |
|---|---|
| **PSS (Hauptgröße)** | Ziel 1 berührt (Hoch ≥ Untergrenze bullish, Tief ≤ Obergrenze bearish; Wochenschluss-Reihen: Schluss), **bevor** ein Schluss jenseits der Invalidation liegt, innerhalb H = 26 Wochen / 126 Handelstage ab Anzeige. Kein Einstieg nötig. |
| AMBIGUOUS_SAME_BAR | Ziel 1 und Schluss-Invalidation in derselben Bar. In der Hauptgröße **kein Erfolg**; als Sensitivität wird der Fall als Erfolg gezählt (die Berührung liegt zeitlich vor dem Schluss). |
| TIMEOUT | weder noch bis H → kein Erfolg |
| CENSORED | Reihe endet vor H ohne Auflösung → nicht gewertet (Sensitivität: Misserfolg) |
| TRIVIAL_TARGET | Kurs bei Anzeige schon in/jenseits Ziel 1 → nicht gewertet, gezählt (Produktbefund) |
| ALREADY_INVALID | Kurs bei Anzeige schon jenseits der Invalidation → nicht gewertet |
| Ziel 2 | Ziel 2 berührt, bevor ein Schluss jenseits der Invalidation liegt (nur wenn Ziel 2 existiert) |
| Invalidation zuerst | INVALIDATED oder AMBIGUOUS_SAME_BAR |
| Bestätigung | Schluss jenseits der Bestätigungsmarke vor Auflösung |
| Primär + Alternative | Hauptszenario ODER Alternative (Gegenrichtung) erreicht ihr Ziel 1. **Keine Treffsicherheit**: Die Alternative ist fast immer die Gegenrichtung, die Vereinigung deckt nahezu jede gerichtete Bewegung ab. Berichtet mit dem Anteil „keine der beiden“. |
| Richtung, Barriere | geometrie-neutral: Schluss +2 ATR in Szenario-Richtung vor Schluss −2 ATR, innerhalb H |
| Richtung, fester Horizont | Vorzeichen der Rendite nach 13 Wochen / 63 Tagen; marktbereinigt gegen den Kohorten-Mittelwert am selben Datum |
| Ausführung (Ebene B) | Regeln von `ti-evidence.mjs` (Limit an der Zonenkante, 8 Wochen / 20 Tage Füllfenster, 10 bp je Seite): nur Nebeninformation |

Elliott-Label-Richtigkeit wird **nicht** aus dem Outcome abgeleitet (§7). Die **prospektive Strukturkonsistenz** (§55) ist ein eigenes, operationales Maß:
* je erster Erkennung einer Zählung: Schluss +2 ATR in Elliott-Richtung vor Schluss jenseits der Elliott-Grenze;
* Status CONFIRMED / INVALIDATED / UNRESOLVED;
* in der Per-Bar-Stichprobe zusätzlich RELABELLED_FIRST.

## 5. Kontrollen (§24–§25)

Für die Hauptgröße wird die Geometrie in ATR-Einheiten übertragen: Abstand zu Ziel 1 und zur Invalidation ab dem Anzeigeschluss. Alle Kontrollen werden mit **derselben** Outcome-Funktion ausgewertet.

| Kontrolle | Definition | Ziehungen |
|---|---|---|
| A unbedingt | Pool-Basisrate „immer long/short“ am selben Datum (Richtungsmaße) | – |
| B Zufallszeit | derselbe Titel, zufällige andere Zeit (≥ H Bars Abstand) | 3 |
| C zeitnah | derselbe Titel, Zufallszeit innerhalb ±104 Wochen / ±504 Tage | 3 |
| **D gleiches Datum (Hauptvergleich)** | dasselbe Datum, zufällige andere Titel derselben Kohorte, gleiche Richtung und ATR-Geometrie. Kontrolliert Drift, Marktregime und Geometrie. | 5 |
| E struktur-gematcht | wie D, aber nur Titel mit gleichem **einfachem** Trendzustand (SMA 40 W / 200 T plus Steigung) und gleichem ATR%-Terzil am Datum. Ohne VU-Methode. | 5 |
| F einfache Modelle | immer long, SMA-Trend, 52-Wochen-Momentum, 52-Wochen-Ausbruch, Rücksetzer im Trend, plus VU-eigene Teilmodelle (TREND_ONLY …). Gemessen an denselben Analysezeitpunkten mit Barriere und festem Horizont. | – |

Kontroll-Kandidaten müssen zulässig sein: genug Historie, keine tote Reihe, ATR > 0. Kontrollen, deren Reihe vor der Auflösung endet, sind zensiert, genau wie Ereignisse.

## 6. Ablation und Attribution (§32–§36)

* Die teuren Engines laufen einmal je Analysezeitpunkt. Jede Variante baut das Szenario mit `Sc.build` aus denselben Engine-Ergebnissen.
* Selbstprüfung: Die Variante FULL muss bitgleich das Produkt-Hauptszenario ergeben; sonst bricht der Lauf ab.

| Variante | Eingriff |
|---|---|
| NO_TREND / NO_MOMENTUM / NO_STRUCTURE / NO_HTF / NO_VOLUME | Konfluenzgewicht der Familie = 0 (NO_VOLUME zusätzlich Volumenstatus aus) |
| NO_PATTERN | Gewicht 0 und keine aktiven Formationen (auch keine Ausbruchsvorlage, kein Formationsziel) |
| NO_SR | keine Unterstützungs-/Widerstandszonen in der Geometrie (keine Range-Szenarien) |
| NO_FIB | keine 38,2/61,8-Retracements, keine Fib-Cluster und -Extensionen (50 % bleibt: Dow-Halbierung) |
| NO_ELLIOTT | Elliott formt die Geometrie nicht |
| NO_WYCKOFF | Wyckoff-Zustand neutralisiert |
| TREND_ONLY, STRUCTURE_ONLY, MOMENTUM_ONLY, TREND_STRUCTURE, TREND_MOMENTUM, (Tag:) STRUCTURE_VOLUME, TREND_STRUCTURE_VOLUME | nur diese Familien stimmen ab |

Volatilität ist die Einheit aller Abstände (ATR) und lässt sich nicht ablatieren. Sie wird als Kontext ausgewertet (Regime-Segmente).

## 7. Statistik (§75–§79)

* Zweiweg-Cluster-Bootstrap (Titel × Kalenderquartal, Cameron–Gelbach–Miller), B = 1.000. Berichtet wird das **breiteste** der Intervalle SYMBOL / TIME / TWO_WAY (`validation-stats.cjs twoWayBoot`). Die Quartals-Cluster fangen Querschnitts-Überlappung und überlappende Horizonte auf.
* Lift = Erfolgsquote − Kontrollquote (Kontrolle = Treffer/Ziehungen über alle Ereignisse).
* Mehrfachtests: eine vorab registrierte Hauptgröße. Vorab registrierte Nebengrößen mit Holm-Korrektur, alles Übrige explorativ mit BH-q-Werten bzw. ohne Bestätigungsanspruch.
* Mindestfallzahl für Segmentzeilen: 300 Ereignisse. Kleinere Zeilen werden nur gezählt, nicht bewertet.

## 8. Kausalität (§8–§9)

* **Stage 1** schreibt Records ohne jede Information nach t. Danach entsteht ein Manifest mit SHA-256 je Shard; das Siegel umfasst Shards, Titelliste, Engine-Hashes und Optionen.
* **Stage 2** prüft das Siegel, bevor es Kurse nach t liest.
* Tests:
  * HSAB-C1: Praefix-Identität. Record aus der bei t abgeschnittenen Reihe = Record aus der vollen Reihe, alle Felder einschließlich Erkennungszeitpunkt.
  * HSAB-C2: vergiftete Zukunft.
  * Bestehend: TI-C1/C2, EV2-C1/C2.
* Verbleibende, offengelegte Nicht-Kausalitäten:
  * Split-Bereinigung mit späteren Splits (skaliert Kurse, nicht prozentuale Geometrie; ändert Rundungsschritte);
  * heutige Sektor-Taxonomie in Segmenten;
  * Universum = heute gelistete Titel (außer Delisted-Kohorte).

## 9. Phasen und Siegel

Siehe `HISTORICAL_DATA_USAGE_REGISTER.md` §2 und `protocol.json`:
* `W_VAL` lässt sich erst nach `status = DEV_FROZEN` auswerten.
* `W_HOLDOUT` und `D_HOLDOUT` nur mit `status = PREREGISTERED` und dem SHA-256 der Präregistrierung (`--open-holdout`).
* Der CI-Lauf bricht ab, wenn schon ein Holdout-Ergebnis existiert.
