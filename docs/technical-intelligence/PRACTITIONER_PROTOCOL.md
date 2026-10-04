# Practitioner Reference Benchmark — Protokoll (vorab registriert)

Stand: 04.10.2026, Mission V. Festgelegt und committet **vor** jeder Extraktion von Fällen. Änderungen nur als datierter Nachtrag am Ende (Abschnitt 12), nie stilles Umschreiben.

**Grundsatz:** Eine Praktiker-Zählung ist **PRACTITIONER REFERENCE**, keine **OBJECTIVE GROUND TRUTH**. Gemessen werden zwei getrennte Fragen:
1. *Methodenähnlichkeit* — Wie ähnlich strukturiert Vision Universe (VU) einen historischen Chart wie ein erfahrener Praktiker zum selben Zeitpunkt?
2. *Ergebnis* (separate Studie) — Was geschah danach?

Ziel ist nicht, zu zeigen, dass ein Praktiker recht hat, noch dass Elliott funktioniert. Es werden keine öffentlichen Trefferquoten einzelner Praktiker oder Anbieter abgeleitet (§45, §116).

## 1. Quellen

* Quellenverzeichnis: `quant/data/technical-intelligence/practitioner-v1/source-registry.json` mit Qualitätsmatrix (§4) und interner Stufe A / B / C / REJECT.
* Bewertet wird nach methodischer Transparenz (sichtbare Zählung, Alternativen, Invalidation, Ziele), eindeutigem Zeitstempel, Archivzugang, Kontinuität — **nicht** nach Reichweite.
* Priorität A: HKCM / Philip Hopf / Phantom by HKCM. Dazu mindestens zwei unabhängige Schulen (z. B. Elliott Wave International, ElliottWave-Forecast, More Crypto Online, weitere deutschsprachige und internationale Praktiker).
* Quellenbalance: HKCM-Umfeld höchstens 40 % der eingeschlossenen Fälle. Ist das mangels öffentlicher Alternativen nicht erreichbar, wird es offen berichtet.

## 2. Einschluss (alle Bedingungen)

1. Veröffentlichung nachweislich vor dem bewerteten Ergebnis (zeitgestempelte Originalfundstelle).
2. Eindeutiges Instrument (Aktie, ETF, Index, Krypto, Rohstoff, FX) und rekonstruierbarer Zeitrahmen (Tag oder Woche; Intraday nur, wenn Zeitpunkt und Daten exakt rekonstruierbar).
3. Mindestens eines von: Wellenzählung, Muster, Invalidation, Zielzone.
4. VU-Kursdaten bis zum Analyse-Stichtag vorhanden (direkt oder dokumentierter Proxy, §6).
5. Öffentlich ohne Login zugänglich; keine Umgehung von Zugangsbeschränkungen.

## 3. Ausschluss

Reine Rückblicke; „wie erwartet“-Beiträge ohne verlinkte ursprüngliche Analyse; Erfolgsmeldungen ohne Originalzeitstempel; unlesbare Charts; unklare Instrumente; Reposts ohne Quelle (Original wird gesucht und bevorzugt); Marketingbeiträge ohne strukturelle Aussage; Inhalte hinter Login/Bezahlschranke; Fälle mit Extraktionssicherheit LOW (nur als Kandidat geführt, nicht im Benchmark).

## 4. Stichprobe (gegen Erfolgsauswahl)

* Je Quelle ein **festes Zeitfenster** (Standard: 01.01.2022 – 30.06.2026; abweichend nur, wenn das Archiv kürzer ist — dokumentiert).
* Innerhalb des Fensters werden **alle** geeigneten Analysen der Quelle zu den Zielinstrumenten erfasst, in chronologischer Reihenfolge; ist das zu viel, eine **systematische Stichprobe** (jede k-te Veröffentlichung, k vorab je Quelle notiert) — nie Auswahl nach Ergebnis.
* Zielinstrumente in Priorität: große US-Aktien und Aktienindizes/ETFs (S&P 500, Nasdaq 100, Dow, Russell 2000, Einzelwerte), DAX/Euro Stoxx, danach Krypto, Gold, Öl, FX.
* Ziel: 20–30 Fälle Pilot; danach ≥ 100 Fälle (≥ 200, falls verfügbar).

## 5. Zeitpunkt und Stichtag (kritisch)

* `publication.timestamp` mit Zeitzone aus Plattform-Metadaten bzw. Artikelkopf; Genauigkeit MINUTE / HOUR / DAY.
* `analysisCutoff` = letzter **vollständig bekannter** Bar zum Veröffentlichungszeitpunkt: Tagesbar nur, wenn die Börse des Instruments zum Zeitpunkt bereits geschlossen hatte (US: 16:00 America/New_York; Xetra: 17:30 Europe/Berlin; Krypto: 00:00 UTC Tagesende); sonst Vortag. Wochenbar nur, wenn die Woche abgeschlossen war.
* Bei Genauigkeit DAY: konservativ der letzte Schlusskurs **vor** dem Veröffentlichungsdatum.
* Der Stichtag wird berechnet (`scripts/technical/practitioner/cutoff.mjs`), nie von Hand gesetzt; ein Test prüft, dass er nie nach der Veröffentlichung liegt.

## 6. Instrumentabbildung

Praktiker-Chart und VU-Reihe sind oft nicht dasselbe Instrument (Cash-Index vs. ETF vs. Future vs. CFD; bereinigt vs. unbereinigt). Gespeichert werden Instrumenttyp, Bereinigung, VU-Reihe und Abbildungsgüte (EXACT, PROXY_SAME_UNDERLYING, PROXY_DIFFERENT_INSTRUMENT, UNMAPPED). Preisniveaus von Proxys werden nur relativ (Prozent, ATR-normiert) verglichen. UNMAPPED-Fälle (z. B. DAX ohne VU-Reihe) bleiben Kandidaten und werden gezählt, aber nicht gerechnet.

## 7. Extraktion

* Nur strukturierte Angaben (Schema `practitioner-reference-1.0.0`), eigene Kurzfassung ≤ 400 Zeichen, Fundstellen-Locator (Videozeit, Absatz) mit kurzer Notiz. **Keine** fremden Screenshots, Transkripte oder Volltexte im Repository.
* Sicherheit: HIGH (Zählung/Niveaus klar sichtbar oder ausgesprochen), MEDIUM (einzelne Details unsicher), LOW (zu viele Annahmen → nicht im Benchmark). Unklare Felder heißen UNKNOWN — nichts wird ergänzt.
* Methode: HUMAN_FROM_PRIMARY oder LLM_DRAFT_HUMAN_REVIEWED. **LLM_DRAFT_UNREVIEWED zählt nie.** Für Grad, Wellenlabel, Preisniveau und Zeitrahmen laufen automatische Plausibilitätsprüfungen (Niveau im Kursbereich des Stichtags ±60 %, Zeitrahmen passt zur Wellendauer, Label-Syntax).
* Text und Chart widersprechen sich → `ambiguities`.
* **Doppelextraktion:** mindestens 25 % der Fälle (zufällig, Seed 20261004) werden unabhängig ein zweites Mal extrahiert; Übereinstimmung je Feld wird berichtet; Abweichungen → manuelle Prüfung.
* Bearbeitete/gelöschte Inhalte: dokumentiert; nur die ursprüngliche zeitgestempelte Aussage zählt (`ORIGINAL_PUBLISHED`); Revisionen desselben Praktikers sind eigene, verknüpfte Fassungen (`LATER_REVISION`, `revisionOf`). Eine verschobene Invalidation ersetzt nie rückwirkend die ursprüngliche.
* Duplikate: Video + X-Post + Blog derselben Analyse = **ein** Fall (`caseId`), Original bevorzugt, weitere als `crossPosts`.

## 8. Aufteilung (vor dem ersten VU-Lauf fest)

* **HOLDOUT_SOURCE:** eine vollständige unabhängige Quelle (die zweitgrößte Nicht-HKCM-Quelle nach Fallzahl beim Freeze) bleibt für jede Engine-Entwicklung ungesehen.
* **HOLDOUT_TEMPORAL:** alle Fälle mit Veröffentlichung ab 01.01.2025 aus den übrigen Quellen.
* **DEVELOPMENT / VALIDATION:** übrige Fälle (vor 2025), nach Hash(caseId) 70 / 30.
* Engine-Änderungen dürfen nur DEVELOPMENT ansehen; VALIDATION für Auswahl; beide Holdouts genau einmal.

## 9. Freeze

`PRACTITIONER_REFERENCE_V1`: JSONL-Datei, SHA-256 über die sortierten Zeilen, Bericht `PRACTITIONER_REFERENCE_V1.md` (Methodik, Quellen, Zeitraum, Stichprobe, Ausschlüsse, Verzerrungen, Fallzahl, Grenzen). Korrekturen nach dem Freeze nur als neue Version (V1.1 …) mit Änderungsliste.

**Freeze-Qualitätsgate (§107):** ≥ 2 unabhängige Quellen (besser ≥ 3), ≥ 100 nutzbare Fälle sofern verfügbar, ≥ 70 % HIGH als Ziel, mehrere Instrumente, Jahre und Musterklassen. Nicht erreicht → ehrlich berichten, Benchmark nur als Pilot kennzeichnen.

## 10. Blinder VU-Benchmark

* VU sieht nur eigene Kursreihe bis `analysisCutoff` (kausal, wie im Produkt), keinerlei Praktikerangaben oder spätere Kurse. Engine: Produktion `elliott-3.2.2` (eingefroren). **Kein Tuning vor dem ersten Lauf**; Ergebnis wird eingefroren, erst danach Fehleranalyse.
* Kennzahlen (je Fall, Primärzählung des Praktikers vs. VU):
  A Richtung des Szenarios · B Musterfamilie (Motiv/Korrektur) · C laufende Welle · D Grad exakt · E Grad ±1 · F Primärzählung gleich · G Primär- oder Alternativzählung gleich · H Abstand der Invalidation (absolut, %, ATR-normiert) · I Überlappung der Zielzonen (Anteil, ATR-Abstand) · J Anwendbarkeit/Enthaltung · K laufend vs. bestätigt · **S Strukturelle Szenario-Übereinstimmung** (übergeordnete Richtung + laufende Rolle + nächste Bewegung).
* Enthaltung zählt als eigenes Ergebnis (nicht als falsch); Kennzahlen werden mit und ohne enthaltene Fälle berichtet.
* **Mensch–Mensch:** Fälle gleiches Instrument, Zeitrahmen, Veröffentlichung innerhalb von 5 Handelstagen, verschiedene Quellen → dieselben Kennzahlen zwischen Praktikern; Cohens κ für Richtung und Familie. Keine Mehrheitsentscheidung als „Wahrheit“; gespeichert wird die Verteilung (HIGH PRACTITIONER AGREEMENT / AMBIGUITY).
* Dynamik: Revisionsrate je Praktiker vs. VU-Neuzuordnungsrate im Replay; Erkennungslatenz (erster VU-Stichtag mit gleichem strukturellen Szenario relativ zur Veröffentlichung).
* Konfidenzintervalle: Cluster-Bootstrap nach Quelle und Instrument.

## 11. Ergebnisstudie (separat, optional)

Ziel 1/2 erreicht, Invalidation zuerst, MFE/MAE, Zeit bis Ziel/Invalidation, Revision vor Ergebnis; gleiche Konventionen wie die TI-Methodik (Schlusskurs, gleiche Bar → Invalidation zuerst, Lücken). Pflichtgrenzen: Publikations-, Lösch-, Auswahlverzerrung, unvollständiges Archiv, abweichende Kursquellen, fehlende Intraday-Reihenfolge. Nur interne Methodenforschung, keine Rankings.

## 12. Nachträge

* *(leer)*
