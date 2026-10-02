# Backtest- und Evidenz-Methodik

**Skripte:** `scripts/technical/ti-evidence.mjs` (Studie), `quant/engines/technical/ti/outcomes.js` (Simulation, Statistik).
**Ergebnisse:** `quant/data/technical-intelligence/evidence/evidence-1W.json`, `evidence-1D-golden.json`, `cases-*.json.gz`.

## 1. Frage

Nicht „verdient die Strategie Geld?", sondern: **Wie oft erreichte das vom Produkt gezeigte Hauptszenario seine Zielzone 1, bevor es per Schlusskurs ungültig wurde — und ist das häufiger als bei zufälligem Timing mit gleicher Geometrie?** Dazu: Füllquote, Invalidationsquote, Zeit bis Ziel, MAE/MFE, Rendite nach Kosten, Ziel 2, Segmente, Ablation, Kalibrierung, empirisches Elliott, Fibonacci-Häufung.

## 2. Zeitachsen

| Zeitpunkt | Definition |
|---|---|
| Event time | Bar des Pivots/Musters |
| **Detection time t** | Bar, an der ein Pivot der Setup-Skala (scale-2) **bestätigt** wurde. Nur an diesen Zeitpunkten wird analysiert. |
| Analyse | `TI.analyzeAt(P, t)` — dieselbe Funktion wie im Produkt; liest nur Bars ≤ t und Pivots mit `confirmedIndex ≤ t` |
| Outcome | ab t+1 |

Look-ahead-Schutz ist durch Tests belegt (TI-C1/C2, EV2-C1/C2: Ergebnis an t identisch mit abgeschnittener bzw. „vergifteter" Serie).

## 3. Ausführungsregeln (vorab festgelegt, nicht optimiert)

* **Einstieg:** Limit an der nahen Kante der Einstiegszone, gültig 8 Wochen- bzw. 20 Tagesbars ab t+1. **Jede Berührung der Zone ist ein Fill** (Eröffnung jenseits der Kante → Fill zur Eröffnung). Schließt dieselbe Bar jenseits der Invalidation, ist das ein **Verlust**, kein „kein Einstieg" (bis zum Review-Fix wurde dieser Fall verworfen — das schönte die Quote).
* **Kein Einstieg** nur, wenn die Zone im Fenster nie erreicht wird.
* **Ziel 1** wird frühestens in der Bar nach dem Fill gezählt (die Reihenfolge innerhalb der Fill-Bar ist unbekannt → konservativ).
* **Ziel 1** erreicht, wenn das Hoch (bullish) die Zonen-Untergrenze erreicht; Ausstieg dort (bzw. zur Eröffnung, falls darüber).
* **Invalidation** per **Schlusskurs** (wie in der Oberfläche kommuniziert). Ziel und Invalidation in derselben Bar → Invalidation (konservativ).
* **Zeitablauf:** 26 Wochen bzw. 126 Tage → TIMEOUT, Rendite zum Schluss.
* **Kosten:** 10 bp je Seite.
* **Nicht überlappend:** je Titel erst ein neues Signal nach Ausstieg des vorherigen (bzw. nach Ablauf des Einstiegsfensters).
* Ziel 2: zusätzlich gezählt („erreicht vor Invalidation"), ohne Einfluss auf Ausstieg.

## 4. Baselines

1. **Gleiche Geometrie, zufälliges Timing:** für jedes gefüllte Signal 3 Zufallsbars desselben Titels (deterministischer Seed je Titel), Einstieg zum **Schluss** der Zufallsbar, Auswertung ab der Folgebar (Hoch/Tief der Einstiegsbar zählen nicht — Review-Fix), identische prozentuale Abstände zu Ziel 1 und Invalidation. Die Zufallsbars stammen aus der gesamten Historie des Titels, nicht nur aus demselben Zeitraum; die Baseline ist daher je Zeitraum nur näherungsweise vergleichbar. Der **Lift** = Trefferquote − Baseline misst den Wert von Auswahl und Timing.
2. **Martingal-Erwartung** b/(a+b) (Gambler's Ruin): zeigt, dass hohe Trefferquoten oft nur aus naher Ziel-/ferner Stopp-Geometrie entstehen.
3. **Immer long** (Richtungsablation): Anteil positiver Renditen nach 13 Wochen ohne jedes Signal.
4. Je Methodenfamilie **allein** und Konfluenz **ohne** Familie f (Ablation).

## 5. Zeitliche Trennung und Protokoll

| Abschnitt | Zeitraum | Verwendung |
|---|---|---|
| TRAIN | < 2013 | Entwicklung |
| VALIDATION | 2013–2018 | Entwicklung (Gegenprobe) |
| TEST | ≥ 2019 | **einmalig** nach Einfrieren der Methodik (`technical-intelligence-v2.0.0`, Commit `ce9be420a`) |

Während der Entwicklung lief die Studie ausschließlich mit `--dev`; der TEST-Zeitraum wurde **vor** jeder Kennzahl verworfen. Alle Entwicklungsänderungen stehen in `quant/methodology/technical-intelligence-v2.json → protocol.devChangesLogged` (Bugfixes, Wyckoff-Gewicht 0, Rundung). Kein Parameter wurde auf Testdaten angepasst. Nach dem Test vorgenommene Änderungen betreffen nur Anzeige/Alternativen (keine Auswirkung auf Hauptszenario-Geometrie) und sind im Commit-Verlauf nachvollziehbar.

**Protokollabweichung (dokumentiert):** Nach dem ersten TEST-Lauf fand ein adversarialer Review Messfehler (Fill-Regel, Baseline-Einstiegsbar, trivial bestätigte Elliott-Fälle, Datenlage-Look-ahead, Elliott-Invalidationsniveaus). Sie wurden korrigiert und der TEST-Zeitraum **ein zweites Mal** gerechnet. Kein Parameter, Gewicht oder Schwellwert wurde dabei verändert; beide Läufe stehen in TECHNICAL_EVIDENCE.md §0, die Liste in `protocol.postFreezeMeasurementFixes`. Der TEST-Zeitraum gilt damit als **zweimal angesehen**; künftige Methodenänderungen (V2.1) brauchen einen neuen Holdout.

Ehrlicher Hinweis: Ein Pilotlauf auf 120 Titeln (alle Zeiträume) wurde vor Einführung des `--dev`-Modus einmal angesehen; danach nicht mehr.

## 6. Kalibrierung

Methode: Trefferquote je Setup-Zelle (Template × Richtung × Agreement) auf TRAIN, mit Beta-Shrinkage (Gewicht 20) zur Gesamtquote; geprüft auf TEST.
**Gate:** Brier-Skill > 0,01 gegenüber konstanter Train-Quote **und** maximale Reliability-Abweichung ≤ 7 Prozentpunkte **und** n_test ≥ 300.
**Ergebnis:** nicht bestanden (Brier-Skill −0,0021). → Das Produkt zeigt **keine** Wahrscheinlichkeit (`confidence.calibrated = null`).

## 7. Empirisches Elliott

Für jede **erste** Erkennung einer Zählung (dieselbe Zählung wird nicht mehrfach gezählt):

| Setup | Bestätigung (Lehrbuch-Erwartung) | Harte Invalidation | Extensionen |
|---|---|---|---|
| IMPULSE_W3_AFTER_W2 | Kurs über W1-Ende | Schluss unter W1-Ursprung | 1,0 / 1,618 / 2,618 × W1 ab W2-Ende |
| IMPULSE_W5_AFTER_W4 | Kurs über W3-Ende | Schluss unter W1-Ende | 0,618 / 1,0 / 1,618 × W1 ab W4 |
| ZIGZAG_C_AFTER_B / FLAT_C_AFTER_B | Kurs über A-Ende | Schluss jenseits B-Ende (Revisionsgrenze — strenger als die harte Regel) | 0,618 / 1,0 / 1,618 × A ab B |

Ausgeschlossen (und separat gezählt): Fälle, deren Kurs bei Erkennung bereits jenseits des Bestätigungsniveaus lag — sie wären trivial „bestätigt".

Horizont 52 Wochen. Baseline: dieselben relativen Abstände an 3 Zufallsbars. Segmente: Richtung, Klarheit, Unterteilung, höherer Grad, Zeitraum.

## 8. Fibonacci-Häufungstest

Für jede bestätigte Gegenbewegung (scale-2, Pivot k gegen Swing k−2→k−1): Retracement-Verhältnis. Zählung im Band ±1 Prozentpunkt um 38,2/50/61,8/78,6 % gegen den Mittelwert der beiden Nachbarbänder. Verhältnis ≈ 1 → keine Sonderstellung.

## 9. Statistik

Wilson-Intervall (95 %) für Quoten; Lift-KI als Differenz zweier Anteile (Normalnäherung, Baseline-n = Zahl der Zufallseinstiege); Brier-Score und Reliability mit gleich großen Bins. Die Lift-KIs behandeln Signale als unabhängig; Signale desselben Titels und derselben Marktphase sind aber korreliert (Cluster). Die echten Intervalle sind breiter — ein KI-Rand knapp über 0 ist **kein** belastbarer Nachweis. Mehrfachvergleiche: Segmenttabellen sind beschreibend; Aussagen im Produkt stützen sich nur auf vorab definierte Größen (Gesamt, Setup-Zelle) und den TEST-Zeitraum.

## 10. Verzerrungen und Gegenmaßnahmen

| Risiko | Status |
|---|---|
| Look-ahead | ausgeschlossen durch Konstruktion + Tests |
| Repainting | Pivots/Elliott-Karte nicht repaintend; Szenario je Zeitpunkt neu |
| Survivorship | **offen**: nur heute gelistete Titel (Wochen- und Tagesdaten). Delisting-Bündel existiert nur in CI (`build-survivorship-control.mjs`); TI-Studie dort noch nicht angebunden |
| Corporate Actions | splitbereinigt (Tagesdaten: Splits aus Rohkurs + splitFactor rekonstruiert); Dividenden nicht in Rendite (Kursrendite) |
| Overfitting | Einfrieren + einmaliger Test; Gewichte aus Literatur, nicht optimiert |
| Datenlücken Wochenreihen | kein Volumen, keine Spanne (Close-only) → Volumen-/Spannenbefunde dort UNAVAILABLE |
| Wochenkontext im Tages-Backtest | nur abgeschlossene Wochen (bis zu 4 Tage Verzögerung) — konservativ, verschenkt etwas Aktualität |
| Datenlage je Zeitpunkt | Volumen/Schlusskurs-only aus den letzten 252 Bars bis t (vorher: Gesamtserie — Look-ahead, behoben) |
| Liquidität | Wochenstudie ohne Volumenfilter (nicht verfügbar); Consumer-Reihen auf Indexmitglieder ≥ 5 $ beschränkt |

## 11. Reproduktion

```bash
node scripts/technical/ti-evidence.mjs --mode weekly --workers 4          # ≈ 3,5 min
node scripts/technical/ti-evidence.mjs --mode daily --workers 4           # Golden 5
node scripts/technical/ti-evidence.mjs --mode daily --work-dir <dir>      # CI: ganzes Universum
node scripts/technical/ti-evidence.mjs --mode weekly --dev                # Entwicklung (ohne TEST)
```
Deterministisch (Seeds je Titel). Workflow `technical-intelligence-evidence.yml` (manuell) rechnet die Tagesstudie aus der kanonischen Historie.
