# VU Technical Intelligence („Chartbild", API v3)

| Dokument | Inhalt |
|---|---|
| [TECHNICAL_INTELLIGENCE_ARCHITECTURE.md](TECHNICAL_INTELLIGENCE_ARCHITECTURE.md) | Datenfluss, Module, Kausalität, Schema, API v3, Performance |
| [METHOD_RESEARCH.md](METHOD_RESEARCH.md) | Quellen, Evidenzgrade, **Method Traceability Matrix**, Research → Entscheidung |
| [ELLIOTT_SPECIFICATION.md](ELLIOTT_SPECIFICATION.md) | Regelklassen, Musterklassen, Grade, Ranking, Invalidation, Projektion |
| [BACKTEST_METHODOLOGY.md](BACKTEST_METHODOLOGY.md) | Erkennungszeitpunkt, Ausführungsregeln, Baselines, Splits, Kalibrierungs-Gate |
| [TECHNICAL_EVIDENCE.md](TECHNICAL_EVIDENCE.md) | Ergebnisse: Trefferquoten, Ablation, empirisches Elliott, Fibonacci |
| [UI_UX_SPEC.md](UI_UX_SPEC.md) | Seiten, Chart, Einfach/Profi, Mobil, Barrierefreiheit, Design-Review |
| [DATA_REQUIREMENTS.md](DATA_REQUIREMENTS.md) | Datenlage je Modul und Verhalten bei Fehlen |
| [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) | ehrliche Grenzen |
| [ROADMAP.md](ROADMAP.md) | echte Folgeschritte |
| [QUALITY_GATES.md](QUALITY_GATES.md) | Gates und ihr Status |
| [ELLIOTT_AUDIT.md](ELLIOTT_AUDIT.md) | forensisches Audit der Elliott-Engine (Fehlerklassen A–H, Regelkarte) |
| [ELLIOTT_RULE_MATRIX.md](ELLIOTT_RULE_MATRIX.md) | quellengebundene Regelmatrix: Regel, Guideline, VU-Merkmal; Quelle, Klasse, Test (generiert) |
| [PREREGISTRATION.md](PREREGISTRATION.md) | vorab registrierte Elliott-Hypothesen H1–H7, Entscheidungsregel, Amendment 1 |
| [ELLIOTT_VALIDATION_REPORT.md](ELLIOTT_VALIDATION_REPORT.md) | Bestätigungs-/Replikationsstudie, Referenzset, Audit-Stichprobe, Qualitätskalibrierung |
| [TECHNICAL_EDGE_RESEARCH.md](TECHNICAL_EDGE_RESEARCH.md) | Ergebnis-Matrix aller Methoden, KEEP/DOWNWEIGHT/REMOVE, Produkttrennung |
| [API_V3_MIGRATION.md](API_V3_MIGRATION.md) | v2 → v3: Overlays, Klarheit, Evidenzbadges, Replay |

Kurzfassung der Evidenz (Nachlauf mit Engine 2.2 und Elliott-Gewicht 0, siehe TECHNICAL_EVIDENCE §0b): Hauptszenarien erreichen Zielzone 1 im Test (2019–2026, 46.544 Fälle) in **35,6 %** der Fälle gegenüber **35,9 %** bei zufälligem Timing mit gleicher Geometrie — **kein messbarer Vorteil**. Kalibrierung nicht bestanden → keine Wahrscheinlichkeiten. Fibonacci-Niveaus ohne Häufung. Elliott-Lesarten bringen in der vorab registrierten Prüfung keinen Prognosebeitrag, auch nicht die Konsistenz mit dem höheren Grad (H4). Das Chartbild ist Einordnung, kein Signalgeber.

**Elliott (Mission II):** Die vorab registrierte Studie (1.784 Reihen, 69.791 Ereignisse, Walk-forward, Cluster-Bootstrap, Holm) bestätigt **keinen** Prognosebeitrag des Elliott-Labels (H1–H5, H7); bestätigt ist nur ein Timing-Effekt (H6), der ebenso ohne Elliott-Fortsetzungslabel auftritt. Count Quality steigt nicht mit dem späteren Ergebnis (HIGH − LOW +1,4 pp, n. s.). Entscheidung: **Elliott = Kontext**, Konfluenzgewicht 0; im Produkt als Strukturbeschreibung mit Regel-Audit, Quelle je Regel und Anwendbarkeit (inkl. „keine verlässliche Zählung").
