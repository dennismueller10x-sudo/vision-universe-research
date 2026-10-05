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

### Nachtrag 5 — 04.10.2026, Skalierung Phase 2 (vor jeder neuen Ziehung; kein VU-Vergleich gesehen)

Anlass: Pilot (Nachträge 3–4, `PRACTITIONER_PILOT_LOG.md`) und Entscheidung des Auftraggebers: gezielte Skalierung, **vorerst ohne HKCM** (YouTube-Sperre; vorläufige YouTube-Rahmen bleiben, keine Umgehung).

a) **EWF-Rahmen eingeschränkt** (nur aus Kategorie-Metadaten, nicht aus Inhalten): Beiträge mit WordPress-Kategorie „Stock Market“ und **ohne** „Chart Of The Day“. Begründung aus Metadaten des Pilots: alle 3 gezogenen „Chart Of The Day“-Beiträge trugen ihre Zählung im 1H-Chart (Serie „Elliott Wave View“); die 1D/1W/1M-Zählungen stammen aus „Stock Market“ ohne diese Kategorie. Andere Kategorien bleiben draußen (keine belastbare Metadaten-Evidenz). Titelregeln unverändert (`frame-rules-1.0.0`). Rahmen im Fenster: 1.381, davon E = 693 (685 ohne die 8 bereits gezogenen Pilotbeiträge).
b) **Neue systematische Ziehung EWF:** Ausbeute-Annahme aus dem Pilot (Stock Market ohne COTD): 3 von 8 INCLUDED ≈ 0,375, konservativ 0,35 (US-Aktien-1D vor 09/2025 bleiben wegen der VU-Datenlücke CANDIDATE). Ziel ≈ 60–70 INCLUDED → k = 4 über die 685 nicht gezogenen Elemente (chronologisch), Start = SHA-256("20261004|phase2|ewf") mod 4 → ≈ 171 Elemente. Pilot-Elemente behalten ihren Status und werden nicht neu gezogen.
c) **Tiedje:** gesamte E-Liste (95) — die 86 noch nicht gezogenen Elemente vollständig.
d) **Dritte Familie TradingView** (Regel vor jeder Sichtung von Ideen-Inhalten): Kandidaten = alle Autoren, die am 04.10.2026 im öffentlichen Tag-Feed „Elliott Wave“ (`/ideas/elliottwaves/`, Seiten 1–42, 976 Ideen) vorkommen, ohne Broker-/Firmenkonten (`is_platinum_broker_idea`) und ohne Konten bestehender Quellenfamilien (z. B. `ew-forecast` = EWF). Qualifiziert ist ein Autor, wenn er laut öffentlicher Ideen-Liste (`/api/v1/ideas/?by=<Autor>`; Metadaten Titel, Kurzbeschreibung, Symbol, Zeitrahmen, Datum, `is_public`) zwischen 2022-01-01 und 2026-06-30 **≥ 40 öffentliche Elliott-Ideen** auf Zielinstrumenten hat, verteilt auf **≥ 3 Kalenderjahre**, und keine nicht öffentlichen Ideen in diesem Zeitraum. „Elliott-Idee“ = Titel oder Kurzbeschreibung enthält „Elliott“ oder „wave“ (die API liefert keine Tags; Abweichung vom Tag-Kriterium dokumentiert). Zielinstrumente = US-Indizes/-Futures/-CFDs (SPX, ES, NDX, NQ, DJI, YM, RUT, RTY und Aliase), US-Aktien und US-ETFs (Börse NASDAQ/NYSE/AMEX/ARCA/BATS), BTC-Paare. Auswahl: bis zu 3 Qualifizierte nach aufsteigendem SHA-256("20261004|tv|"+Autor) — nicht nach Reichweite oder Erfolg; jeder Autor eigene `sourceFamily` (`tv-<autor>`). Rahmen je Autor: seine qualifizierenden Ideen mit Chart-Zeitrahmen 1D/1W/1M (Metadatum), chronologisch; systematische Ziehung k = max(1, ⌊n/20⌋), Start = SHA-256("20261004|phase2|"+sourceId) mod k. Weitere EWT-Analysten werden nicht aufgenommen (Pilot: öffentliche EWT-Beiträge 0/4 benchmarkfähig).
e) **Balance:** HKCM-Grenze derzeit gegenstandslos (0). Keine Familie > 60 % der INCLUDED; wird das überschritten, wird es berichtet, gezogene Elemente werden nicht nachträglich verworfen.
f) **Stopp-Regel (vorab):** Alle neu gezogenen Elemente erhalten eine feste Bearbeitungsreihenfolge = aufsteigend SHA-256("20261004|order|"+sourceId+"|"+id) (quellenübergreifend gemischt, damit ein vorzeitiger Stopp eine Zufallsauswahl der Ziehung hinterlässt). Bearbeitet wird in dieser Reihenfolge, jedes Element vollständig (keine Auslassung); Stopp, sobald **100 INCLUDED** (einschließlich der 5 aus dem Pilot) erreicht sind oder das Rechenbudget (≈ 450 USD für Phase 2) erreicht ist. Nicht mehr bearbeitete Elemente werden als `NOT_PROCESSED` im Rahmen/Protokoll gezählt.
g) **Revisionen:** Für jede INCLUDED-Fassung wird die erste spätere Analyse desselben Autors zum selben Instrument innerhalb von 56 Tagen (aus den Rahmen-Metadaten: gleiches Titel-Instrument/Ticker bzw. gleiches Symbol) als `LATER_REVISION` (`revisionOf`, gleiche `caseId`) doppelt extrahiert; sie zählt nicht zur Fallzahl und hat kein Stichprobengewicht.
h) Extraktion unverändert nach Nachträgen 2–4; kein Freeze, kein Vergleichslauf, keine VU-Ausgaben oder späteren Kurse — den Freeze und den blinden Benchmark führt der Auftraggeber aus.

### Nachtrag 6 — 04.10.2026, nach dem ersten Vergleichslauf auf DEVELOPMENT/VALIDATION, vor jeder Entsiegelung

**Offenlegung:** Dieser Nachtrag ist **nachträglich**. Der Vergleich auf DEVELOPMENT + VALIDATION (35 Fälle, Commit `4faaa3acd`) lief bereits und war ausgewertet. Die Holdouts (HOLDOUT_TEMPORAL 32, HOLDOUT_SOURCE `tiedje` 11) sind weiterhin versiegelt. Für sie gilt dieser Nachtrag als vorab festgelegt. Freeze, Daten und Aufteilung bleiben unverändert (SHA-256 `7af25c9b…f489`). Der ursprüngliche Lauf wird unter `benchmark/archive-v1.0/` aufbewahrt und im Bericht mit beiden Definitionen genannt.

**Anlass (echte Fehler, gefunden im finalen Red-Team §122):**

1. **Kennzahl B/F/G bei abgeschlossenem VU-Muster.** Nachtrag 3 legt fest: Die Praktiker-Familie bzw. das Praktiker-Muster ist die Struktur, *deren Teilwelle die laufende Welle ist*. Ist VUs Hauptmuster abgeschlossen (`complete`), so ist die laufende Bewegung bereits die nächste Welle. `compare.mjs` verglich trotzdem die Familie bzw. das Muster des **abgeschlossenen** VU-Musters. Damit wurden ungleiche Dinge verglichen: die abgeschlossene Vorstruktur gegen die laufende Struktur. In 24 von 33 Fällen war das VU-Muster abgeschlossen.
2. **Ergebnisschicht ohne Folgedaten.** `barsAfter` rief `barsUntil(…, "9999-12-31")` auf. Für Wochenreihen liefert `lastCompleteWeekEnd` dafür ein ungültiges Datum. Die Folge: 0 Bars, die trotzdem als `status: OK` mit `firstEvent: NONE` gezählt wurden. Derselbe Aufruf steckt in der Trajektorie für die Erkennungslatenz.
3. **Erkennungslatenz zensiert.** Gemeldet wird der erste Treffer im Fenster [−10, +10]. Treffer am linken Rand (−10) bedeuten nur „schon zu Fensterbeginn so gelesen“. Der Median ist deshalb keine Latenz.

**Festlegung:**

a) **B, F und G bei abgeschlossenem VU-Hauptmuster.**
* Liefert VU einen höheren Grad, der das Hauptmuster als Welle enthält (`higherDegree.pattern`), so werden Familie und Muster dieser enthaltenden Struktur verglichen. C bleibt unverändert (Label über `inferredNext`).
* Ohne höheren Grad gilt NOT_COMPARABLE (Grund `VU_PATTERN_COMPLETE_NO_CONTAINING_STRUCTURE`).
* Für laufende VU-Muster bleibt alles unverändert. Gleiches gilt für Alternativen in G.

b) **S getrennt berichten.** S wird zusätzlich danach aufgeteilt, ob die VU-Rolle aus der Engine stammt (laufendes Muster) oder vom Vergleich abgeleitet ist (`roleInferred`, abgeschlossenes Muster).

c) **Ergebnisschicht.**
* Folgedaten werden bis zum letzten vorhandenen Bar der Reihe geladen.
* Ein Fall ohne Folgebar erhält `status: NO_FORWARD_DATA` und zählt nicht als ausgewertet.
* Die Trajektorie der Latenz wird ebenso korrigiert.

d) **Latenz.**
* Zusätzlich werden die Treffer am linken Fensterrand gezählt (`leftCensored`).
* Der Bericht nennt den Median nur zusammen mit dieser Zahl.

e) **Berichtsregeln.**
* Familien-κ mit konstantem Bewerter wird als „nicht definiert“ berichtet.
* Revisionsangaben heißen „Anteil revidierter Fälle“.
* A1 wird nur gegen Basisregeln eingeordnet, ohne Aussage „über der Basis“, solange es kein Konfidenzintervall bzw. keinen gepaarten Test gibt.

f) **Weitere Regeln.**
* Die Ergebnisstudie läuft danach erneut, ebenfalls erst nach der neuen Versiegelung.
* Holdouts werden durch diesen Nachtrag **nicht** entsiegelt.

### Nachtrag 7 — 05.10.2026, Mission VII: Konsens mehrerer Praktiker (vor jeder Suche, Extraktion oder Auswertung)

**Zweck.** Unabhängige Analysen derselben historischen Marktlage durch verschiedene Praktiker vergleichen.
* Bezeichnung: **PRACTITIONER CONSENSUS REFERENCE**, nicht Expert Ground Truth.
* Die Ausgangsfälle von PRACTITIONER_REFERENCE_V1 bleiben unverändert.
* Neue Analysen werden als **verknüpfte Referenzen** in einer eigenen Datei geführt (`practitioner-v1/consensus/`).
* Engine `elliott-3.2.2` bleibt unverändert. Kein Engine 3.3, kein Prognosetest.

a) **Ausgangsfälle.** Alle 78 Fälle von V1.
* **Geöffnet (35, DEVELOPMENT/VALIDATION):** volle Auswertung.
* **Holdout (43):**
  * Abgleich nur über die Fallkennung (Quelle|Symbol|Datum); die Holdout-Zeile wird nicht geparst. Neue Referenzen werden extrahiert.
  * Jede Auswertung gegen den Ausgangsfall ist verboten: Konsens, Klasse, Mensch–Mensch, VU. Sie wird in `consensus/sealed/` abgelegt und erst bei einer regulären Holdout-Öffnung berechnet.
  * Berichtet werden nur Anzahlen gefundener Überschneidungen.

b) **Kandidatenrahmen** (vollständige Plattformlisten, keine Suchmaschine; keine Suche nach Erfolg):
* `frames/` aus Nachtrag 5: EWF (alle Beiträge), Tiedje, EWT/Gilburt, HKCM und Phantom.
  * HKCM und Phantom: YouTube-Bot-Prüfung, unerreichbar, wird nicht umgangen.
* **TradingView:** alle 15 nach Nachtrag 5 d qualifizierten Autoren (`tradingview-qualification.json`).
  * Ausgenommen ist `Elliottwave-Forecast` (gleiche Familie wie EWF).
  * Bisher wurden 3 gezogen. Die übrigen 11 kommen als eigene Quellenfamilien hinzu: `tv-<autor>`, je Autor eine Familie.
  * Ihre öffentlichen Ideenlisten werden nur als Metadaten geholt (Titel, Symbol, Zeitrahmen, Datum).

c) **Instrument.**
* Titel-Aliase je vuSymbol, fest im Code (`consensus-match.mjs`, ALIASES).
* Bei TradingView zusätzlich das Symbol-Metadatum (z. B. BTCUSD/BTCUSDT/XBTUSD; SPX/ES/SPY; NDX/NQ/QQQ).
* Proxy-Instrumente nach `instrument-map.json`.

d) **Zeitfenster** (einheitlich, nie fallweise):
* **Tag:** ±5 Handelstage; nur wenn dann nichts gefunden wird, ±10.
* **Woche und Monat sowie Holdouts** (deren Zeitrahmen versiegelt ist): ±10, sonst ±20 Handelstage.
* **Handelstage:** US-Börsentage, für Krypto Kalendertage.
* Je Fall wird das verwendete Fenster gespeichert.
* Liegt eine Analyse außerhalb des Fensters, ist das eine Revision bzw. eine spätere Lage und kein Konsens.

e) **Unabhängigkeit und Auswahl.**
* Gezählt wird nur eine andere Quellenfamilie (`sourceFamily`); HKCM, Hopf und Phantom bilden eine Familie.
* Reposts, Spiegelungen und Cross-Posts derselben Analyse zählen nicht (Duplikatregeln aus V1).
* Je Fremdfamilie wird die zeitlich nächste Fundstelle gewählt, bei Gleichstand die frühere. Höchstens eine Referenz je Familie und Fall.
* Gleich ob vor oder nach dem Ausgangsfall: Jede Referenz hat ihren eigenen Stichtag (ihre Veröffentlichung).

f) **Extraktion** wie in den Nachträgen 2–4 (LLM_DUAL_INDEPENDENT_PRIMARY, Kernfeld-Abgleich, Schlichtung; HIGH nur bei voller Übereinstimmung).
* Die Extrahierenden sehen weder den Ausgangsfall, VU-Ausgaben noch spätere Kurse.
* Status INCLUDED nach den Regeln von V1, also nur die Zeitrahmen 1D, 1W und 1M.
* Keine Screenshots, Transkripte oder Volltexte.

g) **Vergleichsebenen:**

| Ebene | Inhalt | Wann verglichen |
|---|---|---|
| L1 | Familie MOTIVE/CORRECTIVE der Struktur, die die laufende Welle enthält (Nachtrag 3) | Zeitrahmen gleich oder Eltern/Kind (1D ↔ 1W ↔ 1M) |
| L2 | Szenario = Richtung ab jetzt (directionalBias UP/DOWN/SIDEWAYS) | Zeitrahmen gleich oder Eltern/Kind |
| L3 | Musterklasse | nur bei gleichem Zeitrahmen |
| L4 | laufende Welle (normalisiert) | nur bei gleichem Zeitrahmen |
| L5 | Grad, exakt und ±1 | nur bei gleichem Zeitrahmen |
| L6 | Invalidation (Abstand ≤ 2 ATR des Ausgangsfalls oder ≤ 5 %) und Zielzonen-Überlappung | nur bei gleichem Zeitrahmen |

h) **Klassen.** Gezählt werden nur INCLUDED-Referenzen inklusive Ausgangsfall. Es gibt **keine Mehrheitsentscheidung**: Alle gespeicherten Lesarten bleiben erhalten.

| Klasse | Bedingung |
|---|---|
| **A STRONG** | ≥ 2 Familien; alle stimmen in L1 und L2 überein |
| **B PARTIAL** | ≥ 2 Familien; alle stimmen in L2 überein, aber nicht alle in L1 |
| **C DISAGREEMENT** | ≥ 2 Familien; nicht alle stimmen in L2 überein |
| **D SINGLE** | keine weitere INCLUDED-Referenz |

* Die Stärke wird offen ausgewiesen (Anzahl Familien, Zustimmung je Ebene als k/n), ohne Punktzahl.

i) **CONSENSUS_IMPULSE_SET:** geöffnete Fälle, in denen ≥ 2 unabhängige Familien eine Motiv-Lesart haben (Impuls oder Diagonale; L1 = MOTIVE) und in L2 übereinstimmen.

j) **Freeze `PRACTITIONER_CONSENSUS_V1`** mit SHA-256, Fallzahl, Familien, Klassen, Fenstern, Zeitrahmen und Sicherheiten. Der versiegelte Teil bekommt eine eigene Prüfsumme. Commit vor jeder VU-Auswertung.

k) **Danach VU** (`elliott-3.2.2`, unverändert), nur auf geöffneten Fällen, getrennt nach D/A/B/C und CONSENSUS_IMPULSE_SET: Hauptzählung, Alternativen, interne Impulslesart (Forensik) und Enthaltung.

l) **Kostenrahmen.** Der Metadatenabruf der TradingView-Listen und die Extraktion laufen in einer Sitzung mit Netzzugang.
* Obergrenze ≈ 150 USD für Abruf und Extraktion.
* Zeichnet sich mehr ab, wird vorher gestoppt und berichtet.
* Bearbeitungsreihenfolge (vorab): geöffnete Impulsfälle zuerst, dann geöffnete übrige, dann Holdout-Fälle.
