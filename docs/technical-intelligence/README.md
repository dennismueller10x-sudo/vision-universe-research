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
| [ELLIOTT_ENGINE_QUALITY_PREREG.md](ELLIOTT_ENGINE_QUALITY_PREREG.md) | vorab registriertes Engine-Quality-Gate (Korpus v2, Splits, Änderung 1) |
| [ELLIOTT_ENGINE3_REPORT.md](ELLIOTT_ENGINE3_REPORT.md) | Engine 3.x: Architektur, HOLDOUT-1/2, Red-Team, Vorher/Nachher |
| [ELLIOTT_HOLDOUT3_PREREG.md](ELLIOTT_HOLDOUT3_PREREG.md) | Mission III: HOLDOUT-3-Vorab-Registrierung (Generatoren C1/C2/C3, beobachtbare Wahrheit, Gates G1–G15, D2) |
| [ELLIOTT_ENGINE32_REPORT.md](ELLIOTT_ENGINE32_REPORT.md) | Engine 3.2: Ursachen G5/hohes Rauschen, verworfene Wege, HOLDOUT-3, Migration, UI-Audit |
| [reviews/](reviews/) | unabhängiges Red-Team 3.2 und Generator-Audit |
| [ELLIOTT_VALIDATION_REPORT.md](ELLIOTT_VALIDATION_REPORT.md) | Bestätigungs-/Replikationsstudie, Referenzset, Audit-Stichprobe, Qualitätskalibrierung |
| [TECHNICAL_EDGE_RESEARCH.md](TECHNICAL_EDGE_RESEARCH.md) | Ergebnis-Matrix aller Methoden, KEEP/DOWNWEIGHT/REMOVE, Produkttrennung |
| [API_V3_MIGRATION.md](API_V3_MIGRATION.md) | v2 → v3: Overlays, Klarheit, Evidenzbadges, Replay |

Kurzfassung der Evidenz (Nachlauf mit Engine 2.2 und Elliott-Gewicht 0, siehe TECHNICAL_EVIDENCE §0b): Hauptszenarien erreichen Zielzone 1 im Test (2019–2026, 46.544 Fälle) in **35,6 %** der Fälle gegenüber **35,9 %** bei zufälligem Timing mit gleicher Geometrie — **kein messbarer Vorteil**. Kalibrierung nicht bestanden → keine Wahrscheinlichkeiten. Fibonacci-Niveaus ohne Häufung. Elliott-Lesarten bringen in der vorab registrierten Prüfung keinen Prognosebeitrag, auch nicht die Konsistenz mit dem höheren Grad (H4). Das Chartbild ist Einordnung, kein Signalgeber.

**Elliott (Mission II):** Die vorab registrierte Studie (1.784 Reihen, 69.791 Ereignisse, Walk-forward, Cluster-Bootstrap, Holm) bestätigt **keinen** Prognosebeitrag des Elliott-Labels (H1–H5, H7); bestätigt ist nur ein Timing-Effekt (H6), der ebenso ohne Elliott-Fortsetzungslabel auftritt. Count Quality steigt nicht mit dem späteren Ergebnis (HIGH − LOW +1,4 pp, n. s.). Entscheidung: **Elliott = Kontext**, Konfluenzgewicht 0; im Produkt als Strukturbeschreibung mit Regel-Audit, Quelle je Regel und Anwendbarkeit (inkl. „keine verlässliche Zählung").

**Elliott Engine 3 (Quality Remediation):** Auf getrennten synthetischen Fällen (HOLDOUT-2) erkennt Engine 3.1 das Muster in 51,3 % der Fälle als Hauptzählung (2.2: 0,4 %), den Grad in 51,9 % (2.2: 0,4 %). Ausgegebene Zählungen verletzen keine harte Regel mehr, und falsche Sicherheit sinkt auf 15 % (2.2: 100 %). Das Gate ist **nicht** bestanden (grober Grad-Fehler 29 %, hohes Rauschen 10 %). Deshalb kein Prognose-Backtest; Status „Experimentelles Strukturmodell“, keine Expertenvalidierung. Siehe [ELLIOTT_ENGINE3_REPORT.md](ELLIOTT_ENGINE3_REPORT.md).

**Mission III (Engine 3.2):** Produktion läuft auf Engine 3.2 (experimentelles Strukturmodell, Konfluenzgewicht 0). HOLDOUT-3 (realitätsnähere Generatoren, einmal ausgewertet): **nicht bestanden** — 0 Regelverstöße, falsche Sicherheit 14,9 %, Neuzuordnungen halb so häufig wie 2.2, aber Erkennung 42,9 % (≥ 45 %), grober Gradfehler 32,5 % (≤ 25 %), hohes Rauschen 6,2 %. Siehe [ELLIOTT_ENGINE32_REPORT.md](ELLIOTT_ENGINE32_REPORT.md).

## Mission IV (Abschluss)

* [MISSION4_FINAL_REPORT.md](MISSION4_FINAL_REPORT.md) — Abschlussbericht, Statustabelle, Selbstkritik
* [MISSION6_FINAL_REPORT.md](MISSION6_FINAL_REPORT.md) — Mission VI: Impuls-Forensik, OHLC-Studie, Human-Audit, Entscheidung „kein Engine 3.3“
  * [ELLIOTT_IMPULSE_FORENSICS.md](ELLIOTT_IMPULSE_FORENSICS.md) · [OHLC_ELLIOTT_STUDY.md](OHLC_ELLIOTT_STUDY.md) · [PRACTITIONER_HUMAN_AUDIT.md](PRACTITIONER_HUMAN_AUDIT.md) · [ELLIOTT_ENGINE33_REPORT.md](ELLIOTT_ENGINE33_REPORT.md) · [reviews/ELLIOTT_33_REDTEAM.md](reviews/ELLIOTT_33_REDTEAM.md)
* [PRACTITIONER_CONSENSUS_BENCHMARK.md](PRACTITIONER_CONSENSUS_BENCHMARK.md) — Mission VII: Konsens mehrerer Praktiker. 0 starke Konsensfälle, 5 Widersprüche, 0 Konsens-Impulse; Entscheidung „kein Engine 3.3“ (Fall B + D)
  * [PRACTITIONER_CONSENSUS_MINING_LOG.md](PRACTITIONER_CONSENSUS_MINING_LOG.md) · [reviews/CONSENSUS_REDTEAM.md](reviews/CONSENSUS_REDTEAM.md) · Protokoll-Nachträge 7–9 in [PRACTITIONER_PROTOCOL.md](PRACTITIONER_PROTOCOL.md)
* [FINAL_OPEN_ITEM_MATRIX.md](FINAL_OPEN_ITEM_MATRIX.md) — alle offenen Punkte Mission I–IV
* [STATISTICS_AUDIT.md](STATISTICS_AUDIT.md) — Cluster-Bootstrap, Mehrfachtests, zeitraumgleiche Baseline
* Reviews: [Code-Review](reviews/MISSION4_CODE_REVIEW.md), [Red-Team 2](reviews/MISSION4_REDTEAM_2.md), [Generator-Audit 2](reviews/ELLIOTT_GENERATOR_AUDIT_2.md), [Sprachaudit](reviews/REGULATORY_LANGUAGE_AUDIT.md)
