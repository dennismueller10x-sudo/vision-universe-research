# Vorab-Registrierung: Elliott-Validierung (Master Mission II, §29)

**Status:** festgelegt und committet **vor** dem ersten Lauf auf der Bestätigungsstichprobe.
Commit-Datum: 02.10.2026. Der Git-Verlauf belegt die Reihenfolge: Dieses Dokument und der auswertende Code
(`scripts/technical/lib/validation-stats.cjs → hypotheses()`) entstehen in einem Commit vor `report-confirmatory-*.json`.

## 1. Warum eine neue Stichprobe

Der Zeitraum ab 2019 wurde in der ersten Studie zweimal angesehen (TECHNICAL_EVIDENCE §0) und ist als Holdout verbraucht. Einen unberührten neuen **Zeitraum** gibt es nicht (Daten enden 2026-09). Deshalb:

* **Titel-Holdout:** Titel mit `fnv1a(ticker) mod 10 < 3` bilden die **Bestätigungsstichprobe** (≈ 30 %, 1.885 Reihen; nach Änderung 1 #5 — nur Stammaktien — 1.784 Reihen ausgewertet), alle anderen die **explorative Stichprobe**. Die Partition ist deterministisch und unabhängig von Daten oder Ergebnissen (`partitionOf()` in `scripts/technical/elliott-validation.mjs`).
* **Zeitliche Trennung zusätzlich:** Walk-forward über fünf Zeitblöcke (F1 < 2005, F2 2005–10, F3 2011–16, F4 2017–21, F5 ≥ 2022). Jeder Block wird nur mit Modellen bewertet, die auf früheren Blöcken trainiert wurden.
* **Ehrliche Einschränkung:** Die Bestätigungstitel waren Teil der aggregierten Wochenstudie (ti-evidence, 2026-10). Diese hatte eine andere Frage (Szenario-Trefferquote) und andere Ereignisse; die hier geprüften Ereignisse, Merkmale und Hypothesen wurden auf diesen Titeln nie ausgewertet. Eine teilweise Kontamination (gleiche Kursreihen) ist nicht auszuschließen.

## 2. Was gemessen wird (unverändert aus der explorativen Phase)

* **Engine:** `elliott-2.2.0` mit Persistenz (`--sticky`), Regelwerk `elliott-rules-2.0.1`, Methodik-Parameter in `elliott-v2.js DEFAULTS` (eingefroren mit diesem Commit).
* **Ereignis:** erste Bar nach Bestätigung eines Legs L=(a→b) auf der Analyseskala der Engine, an der der Schlusskurs L um 38,2–88,6 % zurückgelaufen ist; je Leg höchstens ein Ereignis.
* **Ergebnis:** Kurs überschreitet b vor einem Schluss jenseits a, Horizont 52 Wochen; gleiche Bar = Misserfolg; offene Fälle (Datenende) ausgeschlossen, Zeitablauf ausgeschlossen (Anzahl berichtet).
* **Elliott-Label:** CONT / REV / NONE wie in `processSymbol()` definiert.
* **Basismodell (BASE):** logistische Regression mit Richtung, Trendkontext, Momentum (Vorzeichen, Z-Wert), Volatilitäts-Perzentil, Marktregime (SPY 26 W), Rücklauftiefe, Leggröße (ATR, Bars), Kursniveau, Geometrie b/(a+b), Indexmitgliedschaft, Sektor. L2 = 1.
* **Elliott-Merkmale:** Label, Count Quality, höherer Grad, Klarheit.
* **Unsicherheit:** 95 %-Intervalle aus Cluster-Bootstrap nach Titel **und** nach Kalenderjahr (je 1.000 Ziehungen, AUC 200); berichtet wird das breitere Intervall.

## 3. Hypothesen (Richtung, Kriterium)

| ID | Hypothese | Statistik | „bestanden", wenn |
|---|---|---|---|
| H1 | Elliott-Merkmale verbessern das Basismodell out-of-sample | ΔLogLoss (BASE+ELLIOTT − BASE), gepoolt walk-forward | obere KI-Grenze < 0 |
| H2 | Gleiche Struktur mit Fortsetzungs-Label erreicht das Leg-Ende häufiger als ohne Label | geschichtete Differenz (Richtung, Trend, Momentum, Volatilitätsdrittel, Regime, Zeitblock, Leggröße, Tiefe, Geometrie) | untere KI-Grenze > 0 |
| H3 | Die besten 20 % nach Count Quality (Schwelle nur aus früheren Blöcken) übertreffen das Basismodell | mittlerer Überschuss y − p_BASE | untere KI-Grenze > 0 |
| H4 | Konsistenz mit dem höheren Grad (≥ 0,8) schlägt Konflikt (< 0,5) | Differenz der Überschüsse | untere KI-Grenze > 0 |
| H5 | Elliott-Fortsetzung bei hoher Volatilität (oberes Drittel) besser als bei niedriger (unteres Drittel) — Regime-Hypothese aus der ersten Studie | Differenz der Überschüsse | untere KI-Grenze > 0 |
| H6 | Einstieg in der laufenden Gegenbewegung schlägt den Einstieg erst nach Engine-Bestätigung (Erkennungsverzug) | Differenz der Überschüsse gegen Zufall gleicher Geometrie | untere KI-Grenze > 0 |
| H7 | Fibonacci-Konfluenz (≥ 2 Niveaus aus anderen Ankern) am Einstieg besser als keine | Differenz der Überschüsse | untere KI-Grenze > 0 |

**Mehrfachtests:** Holm-Korrektur über H1–H7 (einseitige p-Werte aus der Normalnäherung der Bootstrap-Intervalle), α = 0,05.

## 4. Entscheidungsregeln für das Produkt (vorab)

| Ergebnis auf der Bestätigungsstichprobe | Einstufung Elliott |
|---|---|
| H1 **und** H2 bestehen (Holm) | KEEP – CORE (Prognosebeitrag belegt) → Evidenz-Status „Gestützt" |
| genau eine von H2/H3/H4/H5 besteht (Holm), H1 nicht | KEEP – EXPERIMENTAL (nur der bestandene Teilaspekt, als „Experimentell" gekennzeichnet) |
| keine besteht | KEEP – CONTEXT ONLY (Struktursprache, Szenario-Rahmen, keine Prognose; Richtungsgewicht in der Konfluenz → 0) |
| Elliott verschlechtert das Modell (H1: untere KI-Grenze > 0) | wie CONTEXT ONLY, zusätzlich ausdrücklicher Hinweis |

Fibonacci (H7) analog: bestanden → „Experimentell"; sonst bleibt Fibonacci nur Konfluenz-Beschreibung.
H6 entscheidet über die Produktdarstellung: bestanden → entwickelnde Zählungen werden als Schlüsselzone hervorgehoben; nicht bestanden → kein Hinweis auf einen Vorteil früher Erkennung.

## 5. Was nach dem Öffnen nicht mehr geändert wird

Ereignisdefinition, Ergebnisdefinition, Merkmale, Modelle, Schwellen, Engine-Parameter, Partition. Jede spätere Änderung wäre eine neue explorative Runde und bräuchte einen neuen Holdout. Fehler in der **Messung** (wie in der ersten Studie) würden offen berichtet, korrigiert und beide Läufe dokumentiert.

## Änderung 1 (vor dem Öffnen der Bestätigungsstichprobe, 02.10.2026)

Ein unabhängiger Methodenreview der Studie fand **Messfehler**. Sie wurden behoben, bevor ein einziger Lauf auf der Bestätigungsstichprobe stattfand (Git-Verlauf). Die Hypothesen H1–H7 und die Entscheidungsregeln bleiben inhaltlich gleich; geändert wurde die Messung:

| # | Befund (Review) | Änderung |
|---|---|---|
| 1 | H6: Bestätigte Einstiege jenseits des Ursprungs a wurden als „sofort gestoppt" gezählt, jenseits b dagegen verworfen → Vorzeichen von H6 verfälscht | Bestätigter Einstieg nur, wenn der Kurs dann noch **zwischen a und b** liegt; H6 nur über diese gepaarten Fälle |
| 2 | Label: NONE kam praktisch nie vor; CONT/REV = „Muster unvollständig/abgeschlossen" | Ereignisse jetzt unabhängig von der Engine (Punkt 3) → NONE = Rücklauf, den die Hauptzählung nicht als jüngste Welle führt; H2 vergleicht CONT gegen REV+NONE |
| 3 | Ereignisse hingen von der Skalenwahl der Engine ab | Ereignisse auf **allen** Skalen 2–4, je Preisextrem nur eines (Skala, auf der es zuerst feuert); Label der Engine an derselben Bar |
| 4 | Kursniveau (splitbereinigt) ist Zukunftswissen | `logPrice` aus dem Basismodell entfernt; Kurs-Segmente entfallen |
| 5 | Indexmitgliedschaft und Sektor von heute; Vorzugsaktien/Optionsscheine im Universum | `index`, `sector` aus dem Basismodell entfernt; nur Stammaktien (`EQUITY_COMMON`, ohne Ticker mit „_") |
| 6 | Partition trennte Emittenten (ABR / ABR_P_D) | Partition und Cluster-Bootstrap nach **Emittenten-Wurzel** (`issuerRoot`): `fnv1a(root) mod 10 < 3` |
| 7 | Offene Ergebnisse am Datenende selektiv | Ereignisse und Zufallsziehungen nur mit vollen 52 Bars Zukunft |
| S1 | H2-Strata zu fein (Abdeckung 57 %) | H2-Strata: Richtung, Trendkontext, Volatilitätsdrittel, Zeitblock, Geometrie-Klasse; H2 gilt nur bei ≥ 80 % Abdeckung |
| S2 | Holm und KI-Regel uneinheitlich | „bestätigt" = KI-Kriterium **und** Holm |
| S3 | kein Purge im Walk-forward | Trainingsereignisse innerhalb eines Jahres vor Testbeginn entfallen |
| S5 | H3: Bindungen bei Count Quality | Anteil der tatsächlich ausgewählten Fälle wird berichtet |
| E | `detectionLatency` las feinste Pivots ohne Bestätigungsfilter (Engine) | nur Pivots mit `confirmedIndex ≤ asOf` |

Nicht geändert (bewusst, konservativ): Zufallsziehungen dürfen den Ereigniszeitraum überlappen (zieht Unterschiede Richtung 0); Volatilitätsdrittel relativ zur eigenen Historie (in H5 so benannt).

## 6. Abweichungen nach Vorliegen der Ergebnisse

**Abweichung 1 — Produktfolge von H6 (offen gelegt, konservativer als registriert).** Registriert war: „H6 bestanden → entwickelnde Zählungen werden als Schlüsselzone hervorgehoben". H6 ist bestanden (+3,9 Pp., 95 %-KI +2,6 … +5,2). Umgesetzt wurde stattdessen nur eine Zeitpunkt-Aussage auf der Methodikseite (`TIMING_EARLY`, Rolle CONTEXT); entwickelnde Zählungen erhalten keine zusätzliche Hervorhebung. Gründe: (a) Die Einstiegszone des Chartbilds liegt bereits im laufenden Rücklauf (Retracement-Band 38,2–61,8 %), eine Hervorhebung würde nichts Neues zeigen; (b) H6 misst einen Zeitpunkt-Effekt — bei Rückläufen ohne Fortsetzungs-Lesart zeigt sich dieselbe Richtung (Differenz +2,2 Pp., nicht separat getestet), der Effekt ist also nicht als Elliott-spezifisch belegt; (c) H1–H5 sind nicht bestätigt, eine visuelle Aufwertung von Elliott-Zählungen widerspräche der Einstufung CONTEXT ONLY. Diese Abweichung ändert keine Zahl und keine Hypothese.
