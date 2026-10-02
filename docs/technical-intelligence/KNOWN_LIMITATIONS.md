# Bekannte Grenzen (ehrlich)

## Evidenz
1. **Kleiner Vorteil.** Hauptszenarien erreichen Zielzone 1 im Test 1,8 Prozentpunkte häufiger als Zufall mit gleicher Geometrie; nach Kosten im Mittel kein Ertrag. Das Chartbild ist Einordnung, kein Signalgeber.
2. **Survivorship.** Wochen- und Tagesstudie enthalten nur heute gelistete Titel. Absolute Quoten können überhöht sein. Das Delisting-Bündel (CI) ist noch nicht angebunden.
3. **Konfidenz-Label ohne Trennschärfe.** Hoch/Mittel/Niedrig unterscheiden die Trefferquote nicht; deshalb „Einigkeit der Verfahren" und keine Prozentwerte. Kalibrierung nicht bestanden.
4. **Tagesstudie nur 5 Titel lokal.** Tageszahlen (n = 213) sind nicht belastbar; Universum-Tagesstudie erst nach Start von `technical-intelligence-evidence.yml`.
5. **Bearische Szenarien** zeigen negative Ø-Renditen (Aufwärtsdrift, Survivorship). Sie bleiben als Lesart sichtbar, aber die Evidenz wird mitgezeigt.
6. **Segment-Mehrfachvergleiche.** Segmenttabellen sind beschreibend; einzelne auffällige Segmente sind nicht für Mehrfachtests korrigiert.
6a. **Konfidenzintervalle zu eng.** Lift-KIs behandeln Signale als unabhängig; Signale desselben Titels und derselben Marktphase sind korreliert. Ein Cluster-Bootstrap (nach Titel und Monat) fehlt noch.
6b. **TEST zweimal angesehen.** Nach Messfehler-Korrekturen aus dem Review wurde der TEST-Zeitraum ein zweites Mal gerechnet (ohne Parameteränderung). Für V2.1-Änderungen ist ein neuer Holdout nötig.
6c. **Baseline über alle Zeiträume.** Die Zufallsbars der Baseline stammen aus der gesamten Historie des Titels, nicht nur aus dem Zeitraum des Signals.

## Methodik
7. **Elliott bleibt mehrdeutig.** Viele Zählungen haben niedrige Klarheit; Alternativen werden immer gezeigt. Elliott hat empirisch keinen Richtungswert.
8. **Unterteilungsprüfung** hängt von der Auflösung der feineren Pivot-Skala ab und brachte keinen messbaren Mehrwert; ihr Ranggewicht ist (noch) 0,22 — Anpassung erst mit neuem Testzeitraum (V2.1), um Testdaten nicht zu „verbrauchen".
9. **Grammatik vereinfacht:** keine Triple-Kombinationen; Positionsregeln (z. B. Dreieck nie Welle 2) nur über Rang/Grammatik, nicht als Gate zwischen Graden.
10. **Wyckoff** ist heuristisch quantifiziert, ohne externe Validierung; Gewicht 0.
11. **AVWAP und Volumenprofil** sind tagesbasierte Näherungen (keine Intraday-/Tickdaten).
12. **Chartformationen** sind regelbasiert auf Swing-Ebene (scale-2); kleinere Formationen werden nicht erkannt; Erkennung bewusst konservativ.
12a. **Wochenkontext im Tagesmodus** nutzt nur abgeschlossene Wochen (bis zu 4 Handelstage Verzögerung) — bewusst konservativ.
12b. **Kalibrierter Pfad ungenutzt.** Der Code für kalibrierte Wahrscheinlichkeiten existiert, wird aber nie aktiv, solange das Gate nicht besteht (derzeit nicht).
12c. **Expandierende Dreiecke** haben keine harte Preisgrenze; ihre Invalidation ist die Revisionsgrenze (Start der laufenden Welle).
13. **Gewichte** der Konfluenz stammen aus Evidenzgraden der Literatur, nicht aus einer Optimierung (bewusst, gegen Overfitting) — empirisch gelernte Gewichte erst nach Bestätigung auf neuem Holdout.

## Daten
14. Mehrheit der Titel lokal nur **Wochenschluss** (kein Volumen, keine Kerzen); Tagesanalyse für das Universum entsteht in CI.
15. Keine Intraday-Historie → kein Ausführungs-Zeitrahmen.
16. Keine Earnings-Termine im TI-Kontext; Ereignisrisiko wird noch nicht angezeigt.
17. Sektor nur als aktuelle SIC-Division; keine Marktkapitalisierung für Segmente.
18. Discover-Reihen nutzen heutige Indexmitgliedschaft.

## Produkt / Technik
19. API v2 ≈ 28 MB gz im Repository (wie bestehende Technical-Produktdaten); tägliche Neuberechnung erzeugt Git-Volumen.
20. Alerts: Datenmodell und Ableitung vorhanden, keine Zustellung (Push/E-Mail).
21. VU Ask: Werkzeugdefinitionen (`ti/ai-tools.js`) vorhanden, Anbindung an den Worker `vu-ask` noch nicht verdrahtet.
22. Die bestehende V1-Technikseite (`/technik`) läuft parallel; zwei Szenario-Darstellungen existieren, bis V1 abgelöst wird.
23. Regulatorische Prüfung (MAR/MiFID) der Szenario-Darstellung bleibt ein separates Gate vor öffentlichem Start (wie bei V1).
