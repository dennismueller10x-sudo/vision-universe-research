# Bekannte Grenzen (ehrlich)

## Evidenz
1. **Kein messbarer Vorteil.** Hauptszenarien erreichen Zielzone 1 im Test so oft wie Zufall mit gleicher Geometrie (−0,2 pp, KI −0,7 … +0,3); nach Kosten im Mittel kein Ertrag. Ein früher berichteter Vorteil von +1,8 pp war ein Messartefakt. Das Chartbild ist Einordnung, kein Signalgeber.
2. **Survivorship.** Wochen- und Tagesstudie enthalten nur heute gelistete Titel. Absolute Quoten können überhöht sein. Das Delisting-Bündel (CI) ist noch nicht angebunden.
3. **Konfidenz-Label ohne Trennschärfe.** Hoch/Mittel/Niedrig unterscheiden die Trefferquote nicht; deshalb „Einigkeit der Verfahren" und keine Prozentwerte. Kalibrierung nicht bestanden.
4. **Tagesstudie nur 5 Titel lokal.** Tageszahlen (n = 213) sind nicht belastbar; Universum-Tagesstudie erst nach Start von `technical-intelligence-evidence.yml`.
5. **Bearische Szenarien** zeigen negative Ø-Renditen (Aufwärtsdrift, Survivorship). Sie bleiben als Lesart sichtbar, aber die Evidenz wird mitgezeigt.
6. **Segment-Mehrfachvergleiche.** Segmenttabellen sind beschreibend; einzelne auffällige Segmente sind nicht für Mehrfachtests korrigiert.
6a. **Konfidenzintervalle zu eng.** Lift-KIs behandeln Signale als unabhängig; Signale desselben Titels und derselben Marktphase sind korreliert. Ein Cluster-Bootstrap (nach Titel und Monat) fehlt noch.
6b. **TEST zweimal angesehen.** Nach Messfehler-Korrekturen aus dem Review wurde der TEST-Zeitraum ein zweites Mal gerechnet (ohne Parameteränderung). Für V2.1-Änderungen ist ein neuer Holdout nötig.
6c. **Baseline über alle Zeiträume.** Die Zufallsbars der Baseline stammen aus der gesamten Historie des Titels, nicht nur aus dem Zeitraum des Signals.

## Methodik
7. **Elliott bleibt mehrdeutig und ohne Prognosewert.** Viele Zählungen haben niedrige Klarheit; Alternativen werden immer gezeigt. Elliott hat empirisch keinen Richtungswert, und Lehrbuch-Erwartungen (W3 > W1, C > A) treffen seltener ein als Zufall mit gleichen Abständen (ob Konditionierungseffekt, ist offen).
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

## Master Mission II (Elliott-Validierung, Produkt v3)

24. **Elliott ohne Prognosebeitrag.** Vorab registrierter Test auf unabhängigen Titeln: kein inkrementeller Wert gegenüber gleicher Kursstruktur (H1/H2). Elliott ist im Produkt Kontext ohne Richtungsstimme.
25. **Count Quality ist nicht kalibriert.** Hohe Qualität heißt nur bessere Übereinstimmung mit den dokumentierten Regeln, nicht höhere Trefferwahrscheinlichkeit (hoch − niedrig +1,4 Pp., nicht signifikant).
26. **Gradwahl bleibt die größte Lücke.** Die Engine zählt in der Audit-Stichprobe nur in 37/80 Fällen auf dem Grad der betrachteten Struktur; Flats werden eine Skala zu tief gezählt (0/3 Lehrbuch-Flats erkannt).
27. **Zwangszählung.** Zählung an 99,9 % aller Wochen; Enthaltung nur bei 12 %. Strengere Enthaltung würde die Prognose nicht verbessern (Studie), aber ehrlicher wirken — Abwägung offen.
28. **Neuzuordnungen.** Trotz Persistenz wechselt die Lesart an 6,4 % aller Wochen ohne Abschluss oder Bruch; mittlere Lebensdauer 5 Wochen.
29. **Fundstellen nur auf Kapitelebene.** Regelquellen (Frost & Prechter, EWI) wurden nicht gegen den Volltext geprüft (nicht im Zugriff).
30. **Referenzsammlung synthetisch.** Lehrbuchstrukturen sind aus Textbeschreibungen rekonstruiert, keine echten dokumentierten Marktbeispiele (Rechte, Datenverfügbarkeit).
31. **Persistenz macht die Analyse pfadabhängig.** Das Ergebnis an t hängt (kausal) vom Vortageszustand ab; die Produktdaten nutzen 52 Wochen Vorlauf. `TI.analyzeAt` ohne Vorzustand kann in seltenen Fällen eine andere, gleich gute Lesart zeigen.
32. **Replay nur für Indexmitglieder** (Datenmenge); andere Titel ohne Zeitreise.

## Elliott Engine 3 (Quality Remediation, siehe ELLIOTT_ENGINE3_REPORT.md)

33. **Quality Gate nicht bestanden.** Engine 3.1 besteht auf HOLDOUT-2 G1–G4 und G6–G11, verfehlt aber G5 (grober Grad-Fehler 29 % statt ≤ 25 %) und das Gate für hohes Rauschen (Haupttreffer 10 % statt ≥ 20 %). Deshalb kein Prognose-Backtest; Status „Experimentelles Strukturmodell".
34. **Echte Wochencharts ≈ hohes Rauschen.** Auf den meisten echten Charts enthält sich Engine 3 (Anwendbarkeit HOCH nur in wenigen Prozent der Wochen). Das ist beabsichtigt, heißt aber: Meist gibt es keine verlässliche Zählung.
35. **Keine Expertenvalidierung.** Keine Annotationen durch Elliott-Praktiker. Praktiker-Referenzen sind ungeprüfte Suchzusammenfassungen (Seitenabruf blockiert). Die Werkbank für blinde Annotation ist vorbereitet, aber nicht genutzt.
36. **Korpus vom selben Autor wie die Engine.** Layout B mildert die Generator-Kopplung, ersetzt aber keine unabhängigen Daten.
37. **Produkt läuft weiter auf Engine 2.2.** Engine 3.1 ist per Methodik-Option verfügbar; das Pro-Panel kann ihre Felder bereits anzeigen.

## Mission III (Engine 3.2, HOLDOUT-3)

38. **Engine-Quality-Gate erneut nicht bestanden (HOLDOUT-3).** Gepoolt C1/C2/C3: Hauptzählung 42,9 % (≥ 45), Haupt+Alt 55,9 % (≥ 60), Grad 43,6 % (≥ 50), grober Gradfehler 32,5 % (≤ 25), hohes Rauschen 6,2 % (≥ 20), Woche/Tag-Richtung 60 % (≥ 70), laufende Muster mit HOCH immer falsch. Kein Prognose-Backtest.
39. **Auf realitätsnahen Generatoren schwach.** Auf C1/C3 (Kontext ohne Elliott-Bezug, realistische Rauschcluster bzw. echte Renditen) erkennt 3.2 nur rund ein Drittel der sichtbaren Muster; auf dem unabhängigen C2 rund 57 %.
40. **Echte Wochencharts ≈ hohes Rauschen.** Dort enthält sich die Engine fast immer (Anwendbarkeit HOCH in 0,5 % der Wochen im Holdout-Fenster). Laufende Zählungen erscheinen nur als „mögliche Welle“.
41. **Beobachtbare Wahrheit selektiert.** Das Gate wertet nur Fälle, deren Muster im Kursbild regelkonform ist (69,5 % bei n/l/m, 27,7 % bei hohem Rauschen); strikte Werte liegen 10–15 Punkte niedriger und werden immer mitberichtet.
42. **Generatoren vom selben Projekt.** C2 ist im Code unabhängig, im Entwurf an dieselbe Aufgabenbeschreibung gebunden; Rauschen mean-revertierend (Varianzverhältnis 0,1 statt 0,56 bei echten Aktien).
43. **Keine Expertenvalidierung.** Blindmodus und Übereinstimmungsauswertung sind gebaut (`?blind=1`, `elliott-expert-agreement.mjs`), aber es liegen keine Annotationen vor (Status BLOCKED).

## Mission IV (Abschluss, siehe FINAL_OPEN_ITEM_MATRIX.md)

44. **Kein Engine 3.3, kein HOLDOUT-4.** Die Vorstudie auf VALIDATION fand keine Änderung, die Muster, Grad oder hohes Rauschen verbessert (WXY-Prior-Sweep ohne Gewinn). Ein HOLDOUT-4 wäre vorhersehbar erneut FAIL. Das HOLDOUT-3-Urteil FAIL gilt.
45. **Laufende Muster werden kaum erkannt.** Auf VALIDATION sind laufende Hauptzählungen zu 8,7 % richtig; 48,6 % werden als abgeschlossen gelesen (meist als WXY). Der Anwendbarkeitswert ist auf laufenden Stufen invers (AUC 0,33). Engine 3.2.2 senkt deshalb abgeschlossene WXY auf NIEDRIG; verbleibende sichere Aussagen auf laufenden Mustern: 45 (alle falsch) statt 182.
46. **Korpus taugt nicht als Qualitäts-Gate** (Generator-Audit 2): Generator und Engine teilen Annahmen (Unterteilung, Ursprungsextreme), Rauschen ist mean-revertierend (Varianzverhältnis 0,07–0,12 statt 0,61–0,80 echt), die beobachtbare Wahrheit nutzt den Unterteilungsklassifikator der Engine und schließt fast nur Fehlschläge aus. Er bleibt Regressions- und Plausibilitätsprüfung.
47. **Woche/Tag-Konsistenz real schwach.** Hierarchiegerechte Kennzahl 52–59 % gegenüber Zufallsbasis ≈ 49 %; kein Titel ist auf beiden Zeitebenen gleichzeitig anwendbar.
48. **Unmögliche Kursniveaus bis Mission IV.** Rund 6 % der Titel trugen Ziele ≤ 0 oder Niveaus > Faktor 10 vom Kurs, tote/gebundene Reihen absurde CRV; behoben in ti-scenario-1.2.1 und neu gebaut (0 Titel mit unplausiblen Niveaus). Die Grenzen (Faktor 3, 12 ATR, 30/35 % vom Kurs, ATR 1,5–25 %) sind gesetzt, nicht geschätzt. Auf Kursen unter 1 USD rundet die Preisstufe grob.
52. **Szenarien schlechter als Zufall derselben Phase** (Sensitivität, nicht vorab registriert): TEST −2,73 pp gegenüber zeitraumgleicher Baseline.
49. **Alerts nur in der App.** Push/E-Mail fehlen (keine Zustell-Infrastruktur).
50. **VU Ask:** Das Sprachmodell sieht die Chartbild-Werte nicht; die Werte stammen deterministisch aus dem Index im Browser.
51. **Regulatorik:** Begriffe „Einstiegszone“, „Ziel“ und personalisierte Watchlist-Ereignisse — LEGAL REVIEW REQUIRED.
