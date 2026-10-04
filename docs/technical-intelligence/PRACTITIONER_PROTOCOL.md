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

### Nachtrag 1 — 04.10.2026, nach Pipeline-Red-Team (vor jeder Extraktion, keine Daten vorhanden)

Grundlage: `reviews/PRACTITIONER_PIPELINE_REDTEAM.md`. Es existiert noch kein einziger Fall; die Änderungen sind daher keine nachträgliche Anpassung an Ergebnisse.

1. **Richtung (C1):** Zwei getrennte Größen statt einer. *A1* = Richtung der laufenden Welle („nächste Bewegung ab jetzt“), *A2* = Bewegung nach Abschluss der laufenden Welle. VU: A1 = Richtung der laufenden Welle, A2 = `nextMove`. Strukturelles Szenario S nutzt A1 und Rolle. Praktiker „seitwärts“ ist NOT_COMPARABLE, nicht „abweichend“.
2. **Stichprobenrahmen (H5):** Je Quelle werden vor der ersten Extraktion im Quellenverzeichnis festgehalten: Zeitfenster, Archivliste als Rahmen (chronologisch vollständige Liste aller Beiträge im Fenster, aus der Plattform-Übersicht, nicht aus der Websuche), Schrittweite k und Startindex (aus Seed 20261004). Die Discovery-Queue dient nur dem Auffinden von Quellen, **nie** als Stichprobe. Beiträge mit Erfolgs-/Rückblickstitel werden im Rahmen gezählt und als ausgeschlossen dokumentiert, nicht still übersprungen.
3. **Extraktion ohne Ergebniswissen (H6):** Extrahierende arbeiten mit der Kursansicht bis zum Stichtag (Vergleichsseite, Blindmodus) und notieren vor der Extraktion, ob ihnen der spätere Verlauf des Instruments bekannt ist (`ambiguities`: „Ergebnis bekannt“). Primär = die vom Praktiker ausdrücklich als bevorzugt/Hauptszenario bezeichnete Zählung; ohne ausdrückliche Bezeichnung die zuerst und ausführlichste gezeigte; nicht entscheidbar → `UNKNOWN`. Für bearbeitete Beiträge gilt nur ein belegter Originalzustand (Archiv-Snapshot oder Plattform-Versionsverlauf); sonst `editedAfterPublication: UNKNOWN` und Sicherheit höchstens MEDIUM.
4. **Aufteilung (H3):** Zusätzlich zu Quelle und Zeit wird nach Instrument-Zeit-Clustern getrennt: Kein Holdout-Fall darf mit einem Entwicklungsfall dasselbe VU-Instrument und einen Stichtag innerhalb ±20 Handelstagen teilen (sonst wandert der Entwicklungsfall in QUARANTINE). Revisionen und Cross-Posts erben die Aufteilung ihres Originals.
5. **Versiegelte Holdouts (H4):** Holdout-Kennzahlen werden nur mit ausdrücklicher Entsiegelung berechnet; die Holdout-Quelle wird im Freeze-Manifest festgeschrieben.
6. **Mindestgrößen (H7):** Konfidenzintervalle erst ab 5 Clustern, κ erst ab 20 Paaren; HKCM und Phantom by HKCM gelten als **eine** Quellenfamilie (nicht unabhängig) für Mensch–Mensch-Vergleich, Cluster und die 40-%-Grenze.
7. **Zeitstempel (MEDIUM):** Veröffentlichungen mit Genauigkeit DAY werden in der Zeitzone der Quelle interpretiert, nicht der des Lesers. Bei verzögerter öffentlicher Freigabe (z. B. ElliottWaveTrader, 72 h) gilt der belegte Zeitpunkt der Erstveröffentlichung; ist er nicht belegt, wird der Fall ausgeschlossen (sonst sähe VU mehr Daten als der Praktiker hatte).
8. **Vorbelastung:** Die Engine wurde in Mission II gegen 31 ElliottWave-Forecast-Fundstellen aus Suchzusammenfassungen geprüft (Datensatz später geleert). Fälle dieser Quelle aus demselben Zeitraum werden markiert und separat berichtet.
9. **Ergebnis getrennt:** Die Ergebnisstudie läuft als eigener Schritt erst nach versiegeltem Methodenvergleich desselben Freeze-Hashes.

### Nachtrag 2 — 04.10.2026, nach Zugangsprüfung (vor jeder Extraktion, keine Daten vorhanden)

**Anlass (echte Lücke, keine Ergebnisanpassung):** Abschnitt 7 setzt menschliche Extrahierende voraus (`HUMAN_FROM_PRIMARY` oder `LLM_DRAFT_HUMAN_REVIEWED`). Es stehen keine Menschen zur Verfügung; jede Extraktion wäre `LLM_DRAFT_UNREVIEWED` und zählte nach §7 nie. Zugleich entsteht ein neues Kontaminationsrisiko: Ein Sprachmodell kennt den späteren Marktverlauf 2022–2026 aus seinem Training.

1. **Neue Methode `LLM_DUAL_INDEPENDENT_PRIMARY`** (Schema 1.2.0): zwei unabhängige Extraktionsdurchgänge (A, B) aus der **Primärquelle** (Videobilder, Text, Post), getrennte Agenten, keiner sieht den anderen. Jedes Feld mit Fundstelle (Videozeit/Absatz/Bild). Automatische Plausibilitätsprüfung (§7).
2. **Annahme in den Benchmark nur bei Übereinstimmung der Kernfelder** zwischen A und B: Musterfamilie, laufende Welle, Richtung ab jetzt (A1), Invalidation (±1 %, wo genannt), Zeitrahmen, Instrument. Abweichung → Schiedsdurchgang C mit Belegstellen; bleibt sie bestehen → Feld `UNKNOWN`. Sind dadurch weniger als zwei Kernfelder bekannt → Sicherheit LOW (nicht benchmarkfähig).
3. **Sicherheit HIGH** nur, wenn A und B in allen genannten Kernfeldern übereinstimmen und die Angaben als sichtbare Labels oder ausdrückliche Aussage belegt sind; sonst MEDIUM.
4. **Kontaminationsschutz:** Extrahierende Agenten erhalten ausdrücklich nur die Quelle, keine Kursdaten nach dem Stichtag, und dürfen nur festhalten, was die Quelle zeigt oder sagt — nie aus eigenem Marktwissen ergänzen. Restrisiko (Modellwissen über den späteren Verlauf) wird in allen Berichten genannt.
5. **Kennzeichnung:** Alle Ergebnisse auf diesem Datensatz tragen „Extraktion: LLM-dual aus Primärquelle, nicht menschlich geprüft“. Eine menschliche Prüfstichprobe (≥ 20 %, gezogen mit Seed 20261004) bleibt als offener Punkt (BLOCKED bis Menschen verfügbar); ihr Ergebnis kann den Datensatz nur als neue Version ändern.
6. **Doppelextraktion** damit 100 % statt 25 %; die Übereinstimmung A↔B je Feld ist zugleich die Messung der Extraktionssubjektivität (§26 des Auftrags).
7. **Zugang:** Nicht erreichbar: elliottwave.com (403 der Seite), de.investing.com (403 der Seite), web.archive.org (keine Verbindung). Keine Umgehung. Bearbeitungen werden nur über Plattformhinweise erkannt (X-Hinweis „bearbeitet“, Artikel „aktualisiert“); YouTube-Videoinhalte sind nach Veröffentlichung nicht änderbar (Titel/Beschreibung schon). Ohne Archiv gilt `editedAfterPublication: UNKNOWN` nur dort, wo ein Plattformhinweis auf Bearbeitung besteht; dann Sicherheit höchstens MEDIUM.
8. **Videos:** Rohvideos, Einzelbilder und Untertitel werden nur temporär außerhalb des Repositorys verarbeitet und nicht gespeichert (§8 des Auftrags).


### Nachtrag 3 — 04.10.2026, im Pilot (vor Verwendung der betroffenen Daten; noch keine Zeile in references.jsonl, kein VU-Vergleich gesehen)

**Anlass (echte Lücke):** Die ersten Pilot-Doppelextraktionen zeigen, dass „Muster/Familie“ ohne Definition unterschiedlich gelesen wird: ewf2 — Durchgang A nimmt das Muster der Folge, in der die laufende Welle ((iii)) liegt (Impuls, MOTIVE), Durchgang B den übergeordneten Zickzack (2) (CORRECTIVE); ewf7 — beide nehmen „ZIGZAG“ für die laufende Welle IV, obwohl IV ein Label des übergeordneten Impulses ist. Die Pipeline (`lib.mjs` PATTERN_LABELS/roleOfLabel, `compare.mjs` Kennzahl B) und VU setzen dagegen voraus: `pattern` ist die Struktur, deren Teilwelle `currentWave` ist. Ohne Festlegung wären Kennzahl B und die Kernfeld-Übereinstimmung „family“ nicht definiert.

1. **Definition:** `primary.pattern`/`primary.family` = das Muster, in dem die laufende Welle (`currentWave`) ein Label ist (die *enthaltende* Struktur); `currentWaveRole` = Rolle dieser Welle darin. Die innere Struktur der laufenden Welle (z. B. „Welle IV läuft als Zickzack“) steht nur in `structuralScenario`/Evidenz, nicht in `pattern`. Beispiel: „Welle IV eines Impulses läuft als ((A))-((B))-((C))“ → pattern IMPULSE, family MOTIVE, currentWave IV, currentWaveRole CORRECTIVE, directionalBias DOWN.
2. **Schiedsdurchgang auch bei Inkonsistenz:** Weichen A und B in „family“ ab **oder** passt das Label nicht zum Muster nach Punkt 1 (Validator-Hinweis „Label passt nicht zu Muster“), wendet der Schiedsdurchgang C Punkt 1 auf die Belegstellen an. Das Ergebnis ist dann höchstens MEDIUM.
3. **Sicherheit (Präzisierung zu Nachtrag 2 Punkt 3):** Stufen beide Durchgänge ihre eigene Sicherheit als LOW ein → LOW (nur Kandidat); einer → höchstens MEDIUM. Plattform-Bearbeitungsmetadaten (WordPress `modified_gmt` bzw. JSON-LD `dateModified` mehr als 60 min nach der Veröffentlichung) gelten als Plattformhinweis im Sinne von Nachtrag 2 Punkt 7 → `editedAfterPublication: "UNKNOWN"` mit Notiz, Sicherheit höchstens MEDIUM.
4. **Instrument-Kernfeld:** verglichen über die Alias-Auflösung der `instrument-map.json` (`scripts/technical/practitioner/dual-extraction.mjs`, `instrumentKeyOf`), nicht über den Rohtext („$DAX-XET“ = „DAX Index“).
5. **Ausschluss:** Setzen A und B unabhängig einen Ausschlussgrund (Rückblick, kein Strukturinhalt) → `EXCLUDED` mit diesem Grund; nur einer → Schiedsdurchgang.
6. **Eingebettete Videos in Artikeln:** Ist ein eingebettetes YouTube-Video wegen Bot-Prüfung nicht abrufbar, wird aus Text und Charts extrahiert und das in `ambiguities` vermerkt; die Fundstellen beziehen sich dann nur auf Text/Bilder.

### Nachtrag 4 — 04.10.2026, im Pilot (vor Festlegung des Status der betroffenen Zeilen; kein VU-Vergleich gesehen)

**Anlass (echte Lücke):** Die Plausibilitätsprüfung §7 („jedes Niveau im Kursbereich des Stichtags ±60 %“) soll Skalierungs- und Abbildungsfehler finden. Im Pilot verwirft sie systematisch **richtig extrahierte** Niveaus von Wochen-/Monatszählungen: Invalidierungen am Tief einer übergeordneten Welle II (Gartner 1M: 4,87 bei Kurs ≈ 247; Robinhood 1W: 6,81 bei ≈ 118; Palantir 1D: 22,04 bei ≈ 132) und Wellenstarts an weit entfernten Hochs (Bitcoin 1W: Welle I bei 68 979 bei ≈ 30 300). Diese Fälle würden allein wegen ihres Zeitrahmens aus dem Benchmark fallen (Auswahlverzerrung gegen große Grade).

1. **Zonen und Trigger** (`targetZones`, `entryZones`, `keySupportZones`, `alternatives[].trigger`): 1D (und kürzer) wie bisher ±60 % um den VU-Schluss am Stichtag (nach Skalierung); 1W/1M −90 % … +400 %.
2. **Ankerpunkte** (`invalidation.price`, `primary.waveStartPrice`): liegen an vergangenen Wendepunkten und dürfen weiter entfernt sein — zulässig innerhalb Faktor 10 (1D) bzw. Faktor 100 (1W/1M) um den VU-Schluss.
3. Grobe Skalierungsfehler (z. B. SPX-Niveaus ohne Faktor 0,1 auf SPY) bleiben über die Zonen erkennbar; Fälle ohne Zonen mit nur einem Ankerpunkt sind schwächer geprüft (berichtet).
4. Umsetzung: `lib.mjs` `plausibilityChecks`, Test in `quant/tests/practitioner-benchmark.test.mjs`.
