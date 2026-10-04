# Final Open Item Matrix (Mission I–IV)

Stand: 03.10.2026, Mission IV. Quelle der Punkte: KNOWN_LIMITATIONS.md (Nr. 1–43), ROADMAP.md, Abschlussberichte Mission I–III, Red-Team- und Audit-Dokumente. **Status:** DONE = erledigt und geprüft · REJECTED = bewusst nicht umgesetzt (Begründung) · BLOCKED = nur mit echter externer Abhängigkeit lösbar · PARTIAL = intern Mögliches erledigt, Rest extern.

Das System ist **nicht expert-validiert**. Die Elliott-Engine hat ihr vorab registriertes Qualitäts-Gate (HOLDOUT-3) **nicht bestanden**.

## A. Evidenz und Statistik

| Item | Ursprung | Status vorher | technisch lösbar? | externe Abhängigkeit? | Blocker | Aktion (Mission IV) | Ergebnis | finaler Status |
|---|---|---|---|---|---|---|---|---|
| Kein messbarer Vorteil der Szenarien | KL 1 | dokumentiert | – (Befund) | nein | – | nicht „wegtunen“ (kein Edge-Tuning) | bleibt Befund, Produkt sagt „Einordnung, kein Signal“ | REJECTED (kein Fix nötig; Befund) |
| Cluster-Bootstrap für Lift-KIs | KL 6a, RM 3b | offen | ja | nein | – | zweiseitiger Cluster-Bootstrap (Titel, Quartal, Cameron–Gelbach–Miller), B = 1000, breitestes Intervall | TEST-Lift −0,32 pp, KI −1,73 … +1,09 (vorher ±0,5); kein Setup und keine Methode mehr signifikant | DONE |
| Überlappende Fenster / Mehrfachtests | KL 6, Mission IV | offen | ja | nein | – | jede Zeile als vorab registriert / beschreibend / explorativ markiert, BH-q-Werte je Tabelle und gepoolt | 9 von 11 früher signifikanten explorativen Zeilen entfallen | DONE |
| Survivorship | KL 2, RM 2 | offen | Code ja | ja (Delisting-Bündel nur privat in CI) | Daten nur in R2/CI | Code-Pfad vorbereitet | Lauf nur in CI | PARTIAL → BLOCKED (Daten) |
| Tagesstudie Universum | KL 4, RM 1 | offen | ja | Owner-Aktion (Merge/Start) und R2-Daten nur in CI | `technical-intelligence-evidence.yml` ist auf GitHub nicht registriert (404), solange der Branch nicht gemergt ist | – | Owner-Aktion: Merge oder manueller Start | BLOCKED |
| TEST zweimal angesehen | KL 6b | dokumentiert | nein (Vergangenheit) | – | – | – | bleibt offengelegt | REJECTED (nicht rückgängig zu machen) |
| Baseline über alle Zeiträume | KL 6c | offen | ja | nein | – | zeitraumgleiche Baseline (±104 Wochen) als berichtete Sensitivität; registrierte Baseline unverändert | TEST −2,73 pp (KI −4,31 … −1,14): Szenarien schlechter als Zufall derselben Phase | DONE (Sensitivität) |
| Elliott-Konditionierung | RM 3 | offen | ja | nein | – | Elliott hat Konfluenzgewicht 0; Prognosetest erst nach bestandenem Gate | – | REJECTED (Prognoseprüfung vor Gate verboten) |
| Regime-Hypothese / H4 neuer Holdout | RM 3c, RM-II 4 | offen | ja | ja (Daten ab Freeze, Zeit) | Holdout-Zeitraum existiert noch nicht | – | – | BLOCKED (Zeit/Daten) |

Details: STATISTICS_AUDIT.md. Der TEST-Zeitraum ist inzwischen viermal angesehen (offengelegt).

## B. Elliott-Engine

| Item | Ursprung | Status vorher | technisch lösbar? | externe Abhängigkeit? | Blocker | Aktion | Ergebnis | finaler Status |
|---|---|---|---|---|---|---|---|---|
| Quality Gate HOLDOUT-3 FAIL (G2–G5, G9, G13, D2) | KL 38 | FAIL | teilweise | nein | – | Engine-3.3-Vorstudie (VALIDATION) | keine Verbesserung von Muster/Grad/Rauschen gefunden | REJECTED: kein 3.3, kein HOLDOUT-4 (§107–§109); Urteil FAIL bleibt |
| WXY-Schieflage | Mission IV §19 | offen | ja | nein | – | Ursache: laufende Impulse/Diagonalen/Dreiecke als fertige WXY; Prior-Sweep ohne Gewinn | 3.2.2: abgeschlossene WXY höchstens NIEDRIG; sichere Aussagen auf laufenden Mustern 182 → 45 | DONE (Absenkung), Mustererkennung bleibt Grenze |
| Woche/Tag-Konsistenz 60 % | KL 38, §20 | offen | ja (Messung) | nein | – | hierarchiegerechte Kennzahl + Permutationsbasis | naiv 60–65 % vs. Zufall ≈ 50 %; hierarchisch 52–59 % vs. ≈ 49 %; je nach Spezifikation 40–69 % bei n ≈ 80 ohne Intervall (Red-Team 2 M3) – nicht robust; Gate nicht „zu naiv“, Konsistenz real schwach | DONE (Audit); Gate-Urteil unverändert |
| Laufende Zählungen (D2) | KL 38, RM-III 3 | offen | ja | nein | – | Validierung: Erkennung, Präzision, vorzeitiger Abschluss | 8,7 % richtig, 48,6 % vorzeitig „abgeschlossen“; Anwendbarkeit auf laufenden Stufen invers (AUC 0,33) | DONE (gemessen, offengelegt) |
| Über-Enthaltung (96 %) | Mission III | offen | ja | nein | – | Enthaltungsaudit | ohne Enthaltung 89 % richtig (abgeschlossen), mit Enthaltung 30 %: Enthaltung trennt; hohe Quote ist ehrlich | REJECTED (Absenkung würde falsche Sicherheit erzeugen) |
| Qualitätsmodell nur „fertig vs. laufend“? | §23 | offen | ja | nein | – | AUC innerhalb der Stufen | abgeschlossen 0,88 (trennt echt), laufend 0,33 (versagt) | DONE (Befund; laufend ohnehin NIEDRIG) |
| Gradwahl / hohes Rauschen | KL 26, 33, 39 | offen | nur mit neuer Methode | nein | keine tragfähige Idee ohne Generator-Overfit | – | – | REJECTED (§108) |
| typePrior über input.engine ignoriert | Mission IV | Bug | ja | nein | – | behoben (Standard unverändert) | – | DONE |
| Korpus als Qualitäts-Gate | Generator-Audit 2 (Mission IV) | Gate-Grundlage | nur teilweise | ja (unabhängige Labels, echte Basisraten) | Generator–Engine-Kopplung (Unterteilung, Ursprungsextreme), unrealistisches Rauschen, zirkuläre beobachtbare Wahrheit | Audit 2 dokumentiert; Korpus auf Regressions-/Plausibilitätsprüfung zurückgestuft | Gate-Ergebnisse aller Holdouts sind nur eingeschränkt aussagekräftig | PARTIAL → BLOCKED (unabhängiger Maßstab) |
| Expertenvalidierung | KL 35, 43 | BLOCKED | Infrastruktur ja | ja (echte Experten) | keine Annotationen | blinde Werkbank: 210 Fälle, versiegelte Antworten, Doppelannotation, Kappas, Audit-Log | Status BLOCKED – no expert annotations | BLOCKED |
| Quellen nur Kapitelebene | KL 29 | offen | nein | ja (Volltext/Rechte) | – | – | – | BLOCKED |
| Referenzsammlung synthetisch | KL 30 | offen | nein | ja (Rechte, Experten) | – | – | – | BLOCKED |

## C. Produkt und Integration

| Item | Ursprung | Status vorher | technisch lösbar? | externe Abhängigkeit? | Blocker | Aktion | Ergebnis | finaler Status |
|---|---|---|---|---|---|---|---|---|
| Unmögliche Kursniveaus (6 % der Titel, z. B. ACON Ziel −2.695) | Mission IV (Integration), Red-Team 2 C1/H2 | unentdeckt | ja | nein | – | ti-scenario-1.2.0: Measured Move prozentual, Ziele innerhalb Kurs/3 … Kurs×3, Einstieg ≤ 30 % und Risiko ≤ 50 % vom Kurs, ATR zwischen 0,5 % und 25 % des Kurses, kein Szenario auf toten Reihen (≥ 4 gleiche Wochenschlüsse), Zielzonen ohne Berührung; Tests M4-5, M4-6 | – | DONE |
| Enthaltene Elliott-Zählung formte Szenarien | Red-Team 2 H1/M5 | unentdeckt | ja | nein | – | Elliott formt Einstieg, Invalidation, Ziele, „Erwartete Struktur“ nur bei Anwendbarkeit ≥ MITTEL; strukturelle Konfidenz aus der Anwendbarkeit statt der Klarheit | – | DONE |
| 3.2.2 nach Holdout geändert | Red-Team 2 H3 | – | – | – | – | Abweichung von der Vorab-Registrierung offengelegt (Freeze-Record, Methodik-Vertrag); kein Holdout-Urteil für 3.2.2 | – | DONE (offengelegt) |
| ABBV 404 | Mission III UI-Audit | offen | ja | nein | – | Golden-Daily nur für vorhandene Titel | – | DONE |
| „Kursverlauf“-Überschrift abgeschnitten | Mission III UI-Audit | offen | – | – | – | geprüft: absichtlich nur für Screenreader (`app.css`) | kein Fehler | REJECTED (kein Bug) |
| Migrations-Alarme (132) | Mission III | manuell zurückgesetzt | ja | nein | – | `diffRun`: BASELINE/METHODOLOGY_CHANGED unterdrückt, gleicher Datenstand übersprungen; Methodenschlüssel inkl. Szenario-Version; Test M4-2 | – | DONE |
| Alerts-Zustellung | KL 20, RM 6 | offen | in-App ja | Push/E-Mail ja | keine Zustell-Infrastruktur | Watchlist-Ereignisse auf der Quant-Startseite (nur aus sauberen Läufen) | – | PARTIAL (in-App DONE, Push/E-Mail BLOCKED) |
| VU Ask | KL 21, RM 7 | offen | ja | nein | – | Werkzeug `getChartbildLage` (strukturiert, experimentell, Haftungshinweis, unplausible Niveaus zurückgehalten), Worker-Schalter `chartbild` | Modell sieht die Werte nicht (Architektur) | DONE |
| V1-Technikseite | KL 22, RM 8 | offen | ja | nein | – | Weiterleitung auf Chartbild; Route `technik` zeigt Chartbild | – | DONE |
| Discover | RM 10 | V1-Elliott-Urteil sichtbar | ja | nein | – | abweichendes V1-Urteil entfernt, Link aufs Chartbild | – | DONE |
| Screener-Felder | RM 11 | offen | ja | nein | – | Ausblick, Kursstruktur, Elliott-Strukturklarheit aus dem Index | – | DONE |
| Altversionen (elliott-v1/v2, Technik-V1-Daten) | Mission IV §116 | parallel | teilweise | nein | – | sichtbare Altversionen abgelöst (V1-Seite, Discover-V1-Urteil, Methodikseite); `elliott-v2.js` bleibt als Hilfsbibliothek (23 Aufrufe aus elliott-v3: Notation, Rollen, Projektion), Technik-V1-Daten speisen weiter `product-services.js` und die Materialisierung | – | DONE (sichtbar) / REJECTED (Code-Löschung: noch benötigt) |
| Methodikseite (veraltet elliott-v2) | Mission IV | offen | ja | nein | – | Verträge und erzeugte Seite nennen elliott-3.2.2, Gate FAIL, nicht expert-validiert | – | DONE |
| Datenumfang (52 MB gz) | KL 19 | offen | ja | nein | – | gemessen: 37 % sind Elliott-Daten enthaltender Titel | Pro-Ansicht zeigt bewusst die Hypothese auch bei Enthaltung (Transparenz) | REJECTED (bewusst; Option dokumentiert) |
| Professionelle Ansicht / szenario-first | Mission IV P0 | offen | ja | nein | – | Elliott-Übersichtskarte, Tabs, Methodenkarten, Szenario-Titel in Klartext | – | DONE |
| Earnings-Hinweis | KL 16, RM 5 | offen | teilweise (vergangene Berichtstermine aus SEC-Daten) | ja (künftige Termine) | kein Kalender künftiger Termine | Schätzung aus dem Berichtsrhythmus geprüft und verworfen: ein falscher Termin ist schlechter als keiner | – | REJECTED (Schätzung) / BLOCKED (Kalender) |
| Regulatorische Prüfung | KL 23 | offen | Sprachaudit ja | ja (Jurist) | keine juristische Prüfung | Sprachaudit (Kauf-/Verkaufssprache, Prognosen) | – | LEGAL REVIEW REQUIRED |
| Nutzerstudie | Mission IV | offen | nein | ja (echte Nutzer) | – | – | – | BLOCKED |

## D. Daten

| Item | Ursprung | technisch lösbar? | externe Abhängigkeit? | Aktion | finaler Status |
|---|---|---|---|---|---|
| Tagesdaten Universum | KL 14 | ja | R2/CI | Pipeline existiert (`market-data-refresh.yml` → Materialisierung); lokal nur 5 Golden-Titel | BLOCKED (nur in CI) |
| Intraday-Historie | KL 15 | nein | ja | lokal nur Snapshots einzelner Tage (5-Min-IEX), keine Historie | BLOCKED |
| Volumen | KL 14 | teilweise | ja | Wochenreihen ohne Volumen; Tagesdaten in CI mit Volumen | BLOCKED (lokal) |
| Corporate Events (M&A, Halts) | Mission IV | nein | ja | nur Split-/Dividendenfaktor je Bar | BLOCKED |
| Historische Indexmitgliedschaft | KL 18, RM 14 | nein | ja | nur 2 S&P-500-Stichtage | BLOCKED |
| PIT-Sektor/Marktkapitalisierung | KL 17, RM 13 | nein | ja | – | BLOCKED |

## Offene interne Punkte

Keine. Code-Review (1 BLOCKER, 5 MINOR) und Red-Team 2 (1 CRITICAL, 3 HIGH, 5 MEDIUM, 4 LOW) sind behoben oder offengelegt; siehe MISSION4_FINAL_REPORT.md.
