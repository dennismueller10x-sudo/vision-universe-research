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
53. **Elliott liest nur Schlusskurse** (Mission VI): `elliott-v3.js` nutzt `series.close`, auch wenn OHLC vorliegt; Hoch/Tief wirken nur über die ATR. Der Test mit Hoch/Tief-Pfad und Tagesauflösung (OHLC_ELLIOTT_STUDY.md) brachte keine bessere Impulserkennung.
54. **Impulse werden intern gefunden, aber nie ausgegeben** (ELLIOTT_IMPULSE_FORENSICS.md): In 25/25 Practitioner-Impulsfällen gibt es gültige Impulslesarten. Sie verlieren im Rang durch Unterteilung (60 %), Vollständigkeits-Heuristik (24 %) und Dominanz (16 %). Synthetisch werden laufende Motivmuster nur zu ≈ 11 % als Motiv gelesen.
55. **Kein Engine 3.3** (ELLIOTT_ENGINE33_REPORT.md): Der Kandidat `elliott-3.3.0-rc1` ist nicht eingefroren (Red-Team §57). Der Practitioner-Holdout bleibt versiegelt.
56. **Versiegelung nur prozedural:** Holdout-Labels liegen im Klartext im Repository. Derselbe Agent hat sie extrahiert und die Engine untersucht. Die Versiegelung beruht auf Werkzeugen, die Holdout-Zeilen vor dem Lesen verwerfen, nicht auf Zugriffsschutz.
57. **Datenabweichung ältere Wochen NVDA/TSLA:** `discover-series-long` und die Split-Rekonstruktion aus Rohkurs + splitFactor weichen in älteren Wochen ab (NVDA 292/≈ 700, TSLA 34/652). Die Ursache ist ungeklärt.
58. **Kein menschlicher Extraktions-Audit:** Paket, Seite und Import sind fertig (Status READY), aber es gibt keinen Reviewer und keine Ergebnisse. MEDIUM-Fälle bleiben ungeprüft.
59. **Kaum unabhängige Praktiker-Überdeckung** (PRACTITIONER_CONSENSUS_BENCHMARK.md): Nur 6 von 35 geöffneten Fällen haben eine unabhängige Referenz auf gleichem Zeitrahmen; 53 von 81 Konsens-Fundstellen zählen im Intraday-Chart. Starker Konsens: 0; Konsens-Impuls: 0.
60. **Praktiker widersprechen sich meist im Szenario:** Das strukturelle Szenario stimmt in 1 von 5 Postpaaren überein, Familie 3/5, Ziele 0/2. Bei n ≤ 5 ist keine Aussage über Schulen oder Autoren belastbar.
61. **Versiegelte Konsens-Zeilen in der Git-Historie:** Bis Commit `7beb66de1` lagen Abgleich- und Referenzzeilen versiegelter Fälle in offenen Dateien (fremde Lesarten, nicht die Ausgangslabels). Seit V1.2 liegen sie unter `consensus/sealed/`; die Historie bleibt (vgl. 56).

## Mission VIII (Historical Structural Accuracy Benchmark, siehe VU_HISTORICAL_ACCURACY_REPORT.md)

62. **Hohe Trefferquoten sind Geometrie.** PSS liegt bei 57–60 % (Woche) und 69–70 % (Tag). Kontrollen mit denselben Abständen erreichen 55–68 %, die Random-Walk-Erwartung b/(a+b) liegt bei 64 %. Ein Lift von +1,0 bis +2,5 Pp. ist nachweisbar, aber nicht robust: Gegen zeitnahe Zeitpunkte derselben Aktie ist er negativ, gegen die Gegenrichtung nicht vorhanden.
63. **Kein unberührter Wochen-Holdout für heute gelistete Titel.** Der finale Wochen-Holdout ist die Delisted-Kohorte (ab 2015 abgerufen, Ereignisse ab 2018). Sie ist nach einem Zukunftsereignis selektiert. Der Tages-Holdout ist bedingt: Kalender wochenweise gesehen, Stichprobe von 1.200 Titeln, nur Überlebende.
64. **Survivorship vor 2018 nicht kontrollierbar.** Es gibt keine Delisting-Historie vor 2015. Ab 2018 beträgt der Effekt auf die absolute Quote ≈ 0,2 Pp.
65. **Split-Bereinigung und Anzeigerundung.** Rundungsschritte relativ zur ATR hängen auf split-bereinigten Kursen von späteren Splits ab. Die Rundung nach außen begünstigt die absolute Quote. Der Lift ist über die ATR-Geometrie der Kontrollen geschützt (Sensitivität unverändert).
66. **Elliott-Persistenz im Hauptlauf nicht nachgebildet.** Hauptszenario, Ausblick und Klarheit sind in 2.597 Proben zu 100 % gleich. Die Elliott-Zählung selbst stimmt nur zu 74–78 % mit der Produkt-Kette überein.
67. **Stage-1-Siegel nicht über Läufe reproduzierbar.** Die Shards hängen von der dynamischen Worker-Verteilung ab. Für den Inhaltsnachweis dienen Titelmenge, Record-Zahl, Jahresverteilung und Engine-Hashes. Ein inhaltsbasiertes Siegel fehlt.
68. **Ereignisse an Pivot-Bestätigungen.** Die Kundensicht an beliebigen Monatsenden zeigt einen kleineren Lift: Woche +1,2, Tag +0,5 Pp., beide nicht signifikant.
69. **Ziel 1 bei Anzeige bereits erreicht** in 9,8 % der angezeigten Szenarien (Status EXTENDED). Das ist ein Produktbefund, offen für einen eigenen PR.
70. **Konfidenzlabel nicht kausal und nicht informativ.** Es liest eine Evidenztabelle aus allen Zeiträumen und zeigt in 99,9 % LOW.
71. **Tagesstudie als Stichprobe.** Je Lauf 600 bzw. 1.200 Titel und keine Per-Bar-Umdeutungsstichprobe auf Tagesbasis. Die Wochenstudie hat keine Liquiditätsfilter (kein Volumen).
72. **Test-Isolation (vorbestehend).** `quant/tests/total-return-verification.test.mjs` schreibt `quant/data/providers/total-return-verification.json`.
73. **Wochen-VAL ohne Per-Bar-Stichprobe.** Der Per-Bar-Hash fällt nur auf DEV-Titel.

## Mission IX (Genauigkeit × Geometrie; asymmetrische Gewinner; siehe MISSION9_FINAL_REPORT.md)

74. **Track B ohne frischen Holdout.** Alle Wochenpfade sind verbraucht: Überlebende in Mission I–IV, Delistete im Mission-VIII-Holdout. Die Horizonte von 6–36 Monaten schließen prospektive Daten aus. Track B und Wave-3 sind darum **explorativ mit Gegenprobe auf verbrauchten Daten**. VAL prüft neue Titel im gleichen Kalender, keine neuen Zeiträume.
75. **Regeln für Track B und Elliott nach Datensicht formuliert.** Die Freeze-Notiz vor VAL war nicht vorab in Git verankert. Der VAL-Lauf startete rund eine Minute vor der Notiz. `earlyUp` entstand nach der PLTR-Fallstudie. Nur die Wave-3-VAL-Erwartung (MISSION9_WAVE3_FREEZE.md) wurde vor der Auswertung committet.
76. **Split-bereinigte Wochenkurse.** Jede Kursschwelle auf bereinigten Kursen ist Look-ahead; der Mindestkurs-Filter wurde verworfen (Red Team H4). Datenanomalien (Sprünge > ×4) nach t erzeugen scheinbare Superwinner. Primär werden nur Sprünge in [t−52, t] ausgeschlossen; die Sensitivität mit Zukunftsausschluss steht in den Tabellen. Die Mittelwerte sind gegen solche Ausreißer empfindlich (Wave-3 DEV: Überschuss-Mittel +19 % → +8 % mit Zukunftsausschluss).
77. **Fette Ränder.** Die Top 5 % der Einheiten tragen 44–53 % (Basis) bzw. bis 82 % (Wave-3-Kandidaten) der Gewinne. Ungedeckelte Mittelwerte schwanken zwischen DEV und VAL im Vorzeichen (VU_BULL −7,8 % / +5,0 %). Aussagen stützen sich auf Häufigkeiten von 2×/5×/10× und auf das 4×-gedeckelte Mittel.
78. **Schichtung grob.** Terzile von Momentum, Volatilität und 52W-Abstand plus Trend und Alter je Quartal. Restunterschiede innerhalb einer Schicht (z. B. eine scharfe Erholung vom Tief) können ein Signal erklären, das in der Schicht nicht abgebildet ist. Die internen Wave-3-Kandidaten sind dafür ein Kandidat.
79. **Wave-3-Merkmal nicht angezeigt.** Der Befund betrifft einen internen, vom Produkt verworfenen Kandidaten (Forensik-Haken), nicht die angezeigte Zählung. Die angezeigte Zählung zeigt eine laufende Aufwärts-Motivwelle praktisch nie (2 bzw. 4 von rund 75.000 Titel-Quartalen je Stichprobe).
80. **Track-A-Bestätigung nur Tag.** A9_CONFIRM prüft die Tagesengine auf neuen Titeln im bekannten Kalender. Für die Wochenengine gibt es keinen frischen Holdout. Die Selektivitätsschwellen sind Wochen-Quantile.
81. **Kein Portfolio-Test.** Mangels Signal-Evidenz wurde keine Portfolio-Simulation gerechnet (vorgegebene Reihenfolge: erst Signal-, dann Portfolio-Evidenz).
82. **Fallstudie PLTR auf Wochenbasis unter der HSAB-Mindesthistorie.** An den Quelldaten im Jahr 2023 lagen nur 121–131 Wochen vor (Studienminimum 160); das Produkt rechnet trotzdem. Die Quellen sind öffentlich, aber nicht vollständig verifizierbar (FXStreet-Seite gesperrt, HKCM-Zahl nur sekundär).
83. **Ausführungsvergleich auf Tagesdaten unbrauchbar.** In A9_CONFIRM liegt das Rendite-Mittel der gematchten Ausführungs-Kontrolle bei −37 % (alle) bzw. −140 % (symmetrisch) je Trade. Ursache: ungedeckelte Short-Verluste auf Kontrolltiteln mit Datensprüngen in der kanonischen Tageshistorie. Die Ereignisrenditen selbst sind plausibel (+0,17 % je Trade). Die Kennzahl war rein beschreibend (HA5) und ist nicht Teil der Entscheidung. Eine Nachrechnung mit Deckelung würde die einmal geöffnete Stichprobe erneut auswerten und unterbleibt.

## Mission X (Elliott Setup Library V1, Prospective Registry; siehe MISSION10_FINAL_REPORT.md)

84. **Die eingefrorene Engine zeigt kaum Setups an.** Angezeigt (nicht enthalten) ist die Primärzählung in ≈ 0,7 % der Wochen-Erkennungspunkte, fast nur als abgeschlossene Korrektur. Eine laufende Impulswelle 2/3 ist nie Primärzählung, Welle 4 kaum. S1/S2 sind als Produkt-Setups leer; S3 hat rund 180, S4 unter 20 angezeigte Fälle je Titelhälfte.
85. **Historische Setup-Evidenz nur auf verbrauchten Daten.** DEV und VAL sind Hälften der Wochen-Überlebenden (Mission I–IX gesehen). VAL wurde erst nach dem Freeze `82f7456` mit diesen Definitionen ausgewertet. Höchste erreichbare Stufe: LEVEL 2; ROBUST EDGE nur prospektiv.
86. **Zwei Elliott-Sichten.** Die historische Setup-Evidenz nutzt die zustandslose Sicht (`previous = null`). Das Produkt führt eine 52-Wochen-Persistenzkette; die Zählung stimmt nur zu 74–78 % überein (Mission VIII). Das Register führt deshalb ab Version 1.1.0 **beide** Sichten: `CUSTOMER_PRODUCT` ist byte-gleich mit dem veröffentlichten Chartbild, `STATELESS_ENGINE` ist die Sicht der Evidenz. Die historische Evidenz gilt nur für die zustandslose Sicht. Für die Kundenprodukt-Sicht gibt es nur die prospektive Messung. Die 284 Per-Bar-Titel des Mission-VIII-Replays (versiegelt mit Kette) sind aus der historischen Setup-Evidenz ausgeschlossen.
87. **Modifikator höherer Grad praktisch nie erfüllt.** Bei abgeschlossenen Mustern zeigt die laufende Welle des höheren Grades gegen die Setup-Richtung (sie enthält die gerade beendete Korrektur). Eine andere Lesart ist nur als V2-Hypothese prospektiv prüfbar.
88. **Bestätigungsvarianten selten.** PURE_RS bzw. CONFIRMED haben 24–40 Fälle je Hälfte mit widersprüchlichen Vorzeichen; keine Aussage, ob RS oder die volle Bestätigung das Setup verbessern.
89. **Projektion = Engine-Zonen.** Ziel 1 ist die nahe Kante der primären Zone (höchstes Gewicht). Liegt der Kurs schon jenseits aller Zonen, gilt das Setup nicht (S3: rund 20 % der Kandidaten). Keine Wahrscheinlichkeiten für Projektionen.
90. **Register-Start.** Der erste Lauf (Woche 2026-09-25) erfasst den **Bestand** bereits qualifizierter Setups (markiert `initialStock`); nur spätere Läufe erfassen Neuzugänge. Der erste Lauf entstand am 07.10.2026 auf den committeten Langreihen; die Kurse nach dem 25.09. lagen vor, wurden aber durch Kürzen der Reihen nicht gelesen.
91. **Register-Takt auf dem Entwicklungsbranch.** Der Zeitplan von GitHub gilt nur auf dem Default-Branch. Bis zum Merge braucht jede Woche einen Lauf per Marke `[elliott-registry]` oder per `workflow_dispatch`. Seit Registry 1.1.0 holt jeder Lauf fehlende Wochen der Reihe nach (vor der Analyse gekürzt, Verspätung in `registrationLagDays`). Eine Woche vor dem letzten Lauf lässt sich weiterhin nicht einfügen (nur vorwärts).
92. **Ledger-Größe.** Jedes Ereignis trägt die volle Zählung (erster Lauf ≈ 4,6 MB). Mit wöchentlich rund 100–200 Neuzugängen wächst das Register um geschätzt 15–25 MB im Jahr.
93. **Kein Volumen, keine Tagesbestätigung in V1.** Wochenreihen haben kein Volumen. Die Tagesebene als Timing-Bestätigung ist nicht Teil von V1.
94. **Kundenprodukt-Sicht = Produktfunktion auf Wochenschluss-Daten.** Das Register rechnet je Woche dieselbe Funktion wie das Chartbild auf der zum Freitag gekürzten Reihe. Das veröffentlichte Chartbild entsteht dagegen auf Zuruf (Stand 04.10.2026, Daten bis 01.10.2026), teils mit einer angebrochenen Woche. Gleich ist die Ausgabe für gleiche Eingangsdaten; das prüft jeder Lauf an einer Stichprobe veröffentlichter Titel (Byte-Gleichheit von `pro.elliott`). Zwischen zwei Produkt-Builds registriert das Register, was das Produkt mit den Daten der Woche zeigen würde.
95. **Tagestitel des Produkts.** Für die Titel, die das Produkt täglich analysiert (heute die 5 Golden-Preview-Titel), nutzt das Register dieselben Tagesdateien. Werden sie nicht erneuert, fallen diese Titel aus der Produktsicht (`PRODUCT_DAILY_DATA_NOT_COVERING_WEEK`). Wird das Produkt je mit der kanonischen Tageshistorie gebaut (`--work-dir`), bricht der Lauf ab, bis das Register dieselbe Quelle bekommt (`PRODUCT_DAILY_SOURCE_IS_CANONICAL_HISTORY_BUT_NO_WORK_DIR`).
96. **Laufzeit.** Die Persistenzkette kostet je Titel rund 2,6 s (Woche) bzw. 5 s (Tag). Ein Wochenlauf über rund 5.100 Titel braucht mit 4 Kernen etwa 60–90 Minuten; das Zeitlimit des Workflows ist 300 Minuten bei höchstens 2 nachgeholten Wochen.
