# Mission IV — Abschlussbericht (Finalization, Expert Validation, Engine 3.3, Product Completion)

Stand: 04.10.2026. Branch `claude/vision-universe-technical-intelligence-cxarnz` (kein Merge, kein PR). Alle Zahlen stammen aus Dateien im Repository; Pfade sind angegeben.

> **Grundsatz (§115):** Vision Universe behauptet nicht, Elliott automatisiert zu haben. Die Elliott-Schicht ist ein **experimentelles Strukturmodell**, hat ihr vorab registriertes Qualitäts-Gate **nicht bestanden** und ist **nicht expert-validiert**. Die technischen Szenarien haben **keinen belegten Prognosevorteil**.

## 1 Executive Summary

* Alle intern lösbaren Punkte aus Mission I–III sind erledigt oder mit Begründung verworfen (FINAL_OPEN_ITEM_MATRIX.md). Offen sind nur echte externe Abhängigkeiten: Expertenannotation, R2/CI-Daten (Tagesuniversum, Survivorship), Earnings-/Corporate-Event-/Index-Historie, juristische Prüfung, Push/E-Mail-Infrastruktur, Nutzerstudie.
* **Kein Engine 3.3, kein HOLDOUT-4** (§107–§109): Die Vorstudie fand keine Verbesserung der Mustererkennung. Stattdessen `elliott-3.2.2`: abgeschlossene WXY höchstens NIEDRIG (nur weniger Aussagen; nach dem Holdout, nur in-sample gemessen, offengelegt).
* **Schwerer Produktfehler gefunden und behoben:** ~6 % der Titel trugen unmögliche Kursniveaus (z. B. ACON Ziel −2.695), dazu absurde Szenarien auf toten oder gebundenen Kursreihen (CRV bis 392 : 1) und Elliott-geformte Szenarien trotz Enthaltung. Behoben in `ti-scenario-1.2.1`, Tests M4-5/M4-6.
* **Statistik ehrlicher:** zweiseitiger Cluster-Bootstrap; kein Setup und keine Methode bleibt signifikant. Neue Sensitivität mit Baseline aus demselben Zeitraum zeigt einen **negativen** Lift (siehe §10).
* Integration: Screener-Felder, VU-Ask-Werkzeug, Watchlist-Ereignisse in der App, Discover ohne abweichendes V1-Urteil, V1-Technikseite abgelöst, Methodikseite aktuell, professionelle Chartbild-Ansicht.
* Pflicht-Reviews: Code-Review, Generator-Audit 2, Red-Team 2, regulatorisches Sprachaudit — alle Befunde mit BLOCKER/CRITICAL/HIGH behoben oder offengelegt.

## 2 Open Item Audit

Vollständige Matrix: [FINAL_OPEN_ITEM_MATRIX.md](FINAL_OPEN_ITEM_MATRIX.md) (Spalten Item, Ursprung, Status, technisch lösbar?, externe Abhängigkeit?, Blocker, Aktion, Ergebnis, finaler Status).

## 3 Engine Status

`elliott-3.2.2`, Regelwerk `elliott-rules-3.1.0`, Konfluenzgewicht 0, Status `EXPERIMENTAL_STRUCTURE_MODEL`. HOLDOUT-3 (gemessen an 3.2.0): **FAIL** (G2 42,9 %, G3 55,9 %, G4 43,6 %, G5 32,5 %, G9 6,2 %, G13 60 %, D2). 3.2.1 (Datenlage Tagesreihen) und 3.2.2 (WXY-Deckel) sind spätere Änderungen ohne Holdout-Urteil (Freeze-Records `elliott-validation/freeze-elliott-3.2.{1,2}.json`).

## 4 Engine 3.3 / No-3.3 Decision

**Entscheidung: kein 3.3, kein HOLDOUT-4.** Grundlage (VALIDATION, nicht HOLDOUT; `elliott-validation/engine33/`):

| Befund | Wert |
|---|---|
| WXY-Prior 0,65 → 0,40 → 0,25 | G1 C1 28,9 → 28,0 → 27,2; C2 59,4 → 59,8 → 59,0; C3 28,4 → 27,5 → 27,2 — kein Gewinn |
| Laufende Muster | 8,7 % richtig, 48,6 % als abgeschlossen gelesen, Anwendbarkeit invers (AUC 0,33) |
| Abgeschlossene Muster | Anwendbarkeit trennt (AUC 0,88), ohne Enthaltung 84 % richtig |
| Sichere WXY (3.2.1) | 96 richtig, 170 falsch (137 davon laufende Impulse/Diagonalen/Dreiecke) |
| 3.2.2 (WXY höchstens NIEDRIG) | sichere Aussagen auf laufenden Mustern 182 → 45; Präzision ohne Enthaltung 84,2 → 89,0 % |
| Woche/Tag | naiv 60–65 % gegen Zufallsbasis ≈ 50 %; hierarchiegerecht 52–59 % gegen ≈ 49 %; je nach Spezifikation 40–69 % (nicht robust) |

Muster, Grad und hohes Rauschen (G2–G5, G9) und G13 ändern sich durch nichts davon. Ein HOLDOUT-4 wäre vorhersehbar FAIL und damit sinnlos (§109). Weitere Feature-Entwicklung wäre Generator-Overfit (§108; Generator-Audit 2: Kopplung von Generator und Engine).

## 5 Expert Validation System

Blinde Werkbank `quant/research/elliott-workbench/` (README für Experten): 210 Fälle unabhängig vom Ergebnis gezogen (150 stratifizierte Referenzfälle nach Struktur, Regime, Volatilität, Größe; 44 Praktiker-, 16 synthetische Fälle), 30 als EXPERT_HOLDOUT versiegelt; HOLDOUT-Emittenten ausgeschlossen. Engine-Antworten getrennt in `cases-sealed.json` (SHA-256 im Manifest, Prüfung beim Aufdecken), keine Engine-Daten vor dem Absenden im DOM (Playwright 22/22). Doppel-/Dreifachannotation, Audit-Log, JSON/CSV-Import/-Export mit Duplikat-/Konfliktprüfung, pseudonyme Annotator-IDs. Auswertung `scripts/technical/elliott-expert-agreement.mjs` (Mensch↔Engine, Mensch↔Mensch, Cohens/Fleiss' κ, Krippendorffs α; Selbsttest 23/23). Kein LLM als Ersatzexperte.

## 6 Expert Annotation Status

**BLOCKED – no expert annotations.** Das System ist nicht expert-validiert.

## 7 HOLDOUT-4 Status

Nicht vorbereitet und nicht gelaufen — bewusst (§4).

## 8 Daily / Intraday / Volume

Tagesdaten des Universums nur in R2/CI; der Workflow `technical-intelligence-evidence.yml` ist auf GitHub erst nach Merge auf den Default-Branch startbar (404 auf dem Feature-Branch) → Owner-Aktion. Lokal: 5 Golden-Titel (OHLCV), 6.505 Jahres-Tagesschlussreihen ohne Volumen. Intraday: nur 5-Minuten-Snapshots einzelner Tage, keine Historie → BLOCKED. Volumen nur in Tagesdaten.

## 9 Survivorship

Code-Pfad `--delisted` in `ti-evidence.mjs` vorhanden; das Delisting-Bündel liegt nur privat in CI und wird dort noch nicht übergeben. Lokale Studien: SURVIVORS_ONLY → BLOCKED (Daten).

## 10 Bootstrap / Statistics

[STATISTICS_AUDIT.md](STATISTICS_AUDIT.md): zweiseitiger Cluster-Bootstrap (Titel, Kalenderquartal, Cameron–Gelbach–Miller), B = 1.000, breitestes Intervall maßgeblich; jede Zeile als vorab registriert / beschreibend / explorativ markiert, BH-q-Werte. Ergebnis (Woche, ti-scenario-1.2.1): Gesamt n = 110.120 gefüllte Signale, Trefferquote Zielzone 1 35,6 % gegen Baseline 35,4 %, Lift +0,19 pp (Cluster-KI −0,65 … +1,03); TEST (vorab registriert) n = 46.509, Lift −0,36 pp (Cluster-KI −1,81 … +1,09; zuvor Normal-KI ±0,5) — **kein Vorteil**. Keine Methode gilt mehr als „gestützt“; TIMING_EARLY „bestätigt“ stammt aus Mission II mit Engine 2.2 und ist für 3.x nicht neu gemessen. **Neue Sensitivität (nicht vorab registriert):** Zufallseinstiege nur im Zeitraum ±2 Jahre um das Signal: TEST −2,73 pp (KI −4,31 … −1,14), TRAIN −2,16 pp, VALIDATION −2,09 pp, gesamt −2,39 pp (KI −3,26 … −1,51) — gegen Zufallseinstiege aus derselben Marktphase schneiden die Szenarien **signifikant schlechter** ab. Interpretation offen (Regime-Konditionierung der Baseline vs. echter Nachteil); nicht vorab registriert, daher kein Urteil, aber ein klarer Warnhinweis gegen jede Vorteilsbehauptung. Der TEST-Zeitraum ist inzwischen mehrfach angesehen (offengelegt).

## 11 Alerts

`diffRun`: keine Ereignisse aus Ausgangszustand, Methodenwechsel (Schlüssel aus Engine-, Regel-, Szenario-, Bundle-Versionen plus Hash über Engine-Code und Evidenz-Tabellen) oder unverändertem Datenstand; neue Titel ohne Vorzeile erzeugen keine Ereignisse. Letzter Lauf: `suppressed: METHODOLOGY_CHANGED`, 0 Ereignisse. In-App: Watchlist-Abschnitt auf der Quant-Startseite (nur aus sauberen Läufen). Push/E-Mail: BLOCKED (Infrastruktur).

## 12 AI / VU Ask

Werkzeug `getChartbildLage` (`ti/ai-tools.js`): strukturierte Werte aus dem Index (Ausblick, Struktur, Hauptszenario, Elliott-Status experimentell/nicht validiert/Enthaltung), unplausible Niveaus zurückgehalten, Haftungshinweis; Worker-Schalter `chartbild` (Einzeltitel), „soll ich kaufen“ bleibt Prognosefrage. Das Sprachmodell sieht die Werte nicht (Architektur: Rechnen im Browser).

## 13 API / Data

API `vu-ti-api-3.0.0`; jede Zeile mit Engine-, Regel-, Daten- und API-Version; `dataQuality.stalePriceBars` und Index-Feld `stale` für tote Reihen. Umfang ≈ 52 MB gz (Pro-Ansicht zeigt die Elliott-Hypothese bewusst auch bei Enthaltung). Produktdaten neu gebaut: 5.292 Titel (5.287 Woche, 5 Tag), 623 Shards, ≈ 53 MB; 0 Titel mit unplausiblen Niveaus (vorher 328), 247 tote Reihen ohne Szenario, 568 Titel ohne Einstiegszone; Elliott-Anwendbarkeit HOCH 4, MITTEL 46, NIEDRIG 5.242 (99,1 % Enthaltung); Ausblick abwärts 2.276, aufwärts 2.183, gemischt 491, seitwärts 342; Alerts `METHODOLOGY_CHANGED`, 0 Ereignisse.

## 14 Discover / Screener

Discover zeigt kein abweichendes V1-Elliott-Urteil mehr, sondern verlinkt das Chartbild. Screener: „Chartbild-Ausblick“, „Kursstruktur“, „Elliott-Strukturklarheit“ (Pro) aus dem Index; veraltete (> 28 Tage zum Baudatum) und tote Reihen bleiben leer.

## 15 UI / Professional Mode

Pro-Ansicht: Elliott-Übersichtskarte (bevorzugte Lesart oder „Keine verlässliche Zählung“, Grad, Status, Klarheit, Anwendbarkeit, Version, Ungültigkeits-/Umzählgrenze), Tabs (Regeln, Alternativen, Grad & Kontext, Historie, Evidenz, Quellen; Tastaturbedienung), Methodenkarten (Trend, S/R, Fibonacci, Momentum/Volumen, Formationen/Wyckoff, Konfluenz) mit Details auf Abruf. Szenario-Titel in Klartext („Aufwärtstrend setzt sich fort“, „Größere Trendwende“ …). Tote Reihen: Hinweis statt Chartbild.

## 16 Mobile

Bildschirm-Audit mit echtem Browser und echten Daten, Breiten 390, 430, 768, 1280, 1440 (`scripts/technical/chartbild-ui-audit.mjs`), sechs Lagen: AAPL (aufwärts, Elliott enthalten), ABT (abwärts), ADM (gemischt), HCTI (Elliott HOCH), ACHL (tote Reihe → Hinweis statt Chartbild), ABBV (früherer 404). Je 45 Ansichten: **0** horizontale Überläufe, 0 abgeschnittene Texte, 0 Tippflächen < 40 px, 0 überlappende Wellenmarken; Konsolenfehler nur anfangs bei HCTI (optionale Discover-Daten → behoben, jetzt 0); Ladezeit ≤ 1,2 s. Repräsentative Bilder (390/768/1440, einfach/Pro) in `docs/technical-intelligence/ui-audit/m4/<Titel>/`; die übrigen Bilder wurden aus Platzgründen nicht eingecheckt (Prüfergebnisse in `ui-audit.json`). Keine Nutzerstudie

## 17 Bug Fixes

ABBV 404 (Golden-Daily nur für vorhandene Titel); V1-Technikseite → Chartbild; Migrations-Alarme; unmögliche Kursniveaus (Measured Move prozentual, Faktor-, ATR- und Anteilsgrenzen); tote/gebundene Reihen; Elliott-Formung trotz Enthaltung; Zielzonen berühren sich nicht mehr; `typePrior` über `input.engine` wirkungslos; Methodikseite verlor Überschrift beim Neuerzeugen; Alerts für neue Titel; Veraltungsbezug im Screener/Ask; leerer Symbol-Link in Discover; „Wochenchart“ bei Tagestiteln. „Kursverlauf“-Überschrift: kein Fehler (absichtlich nur für Screenreader).

## 18 Performance

Produktbau 4 Worker ≈ 75 min für 5.292 Titel; Wochen-Evidenz ≈ 100 min (Engine 3.x ≈ 12× teurer als 2.x); Tages-Golden ≈ 1 min.

## 19 Tests

`node --test quant/tests/*.test.mjs`: **2.209 bestanden, 0 fehlgeschlagen**; Screener, Discover, VU-Ask-Worker, Ask: **379 bestanden, 0 fehlgeschlagen, 5 übersprungen** (Datenabhängigkeit). Neue Regressionstests: M4-1 Wochenend-Lücken, M4-2 Migrations-/Neutitel-Alerts, M4-3 WXY auf Lehrbuchstrukturen, M4-4 API-Versionen, M4-5 Kollaps-Niveaus (ACON, AIXI, BYND, BRNX, ATOS), M4-6 tote Reihen, Elliott-Formung, Einstiegs- und CRV-Grenzen (ALPN, VLCN, TALK, SLAB, GRDX …); Screener-Veraltung; Werkbank-Selbsttest 23/23, Playwright 22/22. Kausalitätstest (vergiftete Zukunft) fing während der Arbeit einen eigenen Look-ahead-Fehler

## 20 Red Team

[reviews/MISSION4_REDTEAM_2.md](reviews/MISSION4_REDTEAM_2.md): 1 CRITICAL (tote Reihen), 3 HIGH (Elliott formt trotz Enthaltung; Einstieg bis 2× Kurs; 3.2.2 nach Holdout), 5 MEDIUM, 4 LOW — CRITICAL/HIGH behoben bzw. offengelegt (ti-scenario-1.2.x, Freeze-Record, Methodik-Vertrag). Code-Review [reviews/MISSION4_CODE_REVIEW.md](reviews/MISSION4_CODE_REVIEW.md): 1 BLOCKER (Daten nicht neu gebaut → behoben), 5 MINOR (behoben).

## 21 Generator Audit

[reviews/ELLIOTT_GENERATOR_AUDIT_2.md](reviews/ELLIOTT_GENERATOR_AUDIT_2.md): **Korpus taugt nicht als Qualitäts-Gate**, nur als Regressions-/Plausibilitätsprüfung — Generator–Engine-Kopplung (ohne Unterteilung fällt G1 von 31/56 % auf 2 %), mean-revertierendes Rauschen (Varianzverhältnis 0,07–0,12 statt 0,61–0,80), zirkuläre beobachtbare Wahrheit; Audit-1-Befunde nur für C2 behoben. Folge: Auch die Gate-Urteile aller Holdouts sind nur eingeschränkt aussagekräftig.

## 22 Regulatory Status

**LEGAL REVIEW REQUIRED** ([reviews/REGULATORY_LANGUAGE_AUDIT.md](reviews/REGULATORY_LANGUAGE_AUDIT.md)): Begriffe „Einstiegszone“, „Ziel“, „Chance gegen Risiko“ und personalisierte Watchlist-Ereignisse.

## 23 Limitations

[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) Nr. 1–51.

## 24 Final Open Item Matrix

[FINAL_OPEN_ITEM_MATRIX.md](FINAL_OPEN_ITEM_MATRIX.md).

## 25 Git / CI

Alle Commits auf `claude/vision-universe-technical-intelligence-cxarnz` gepusht; kein Merge, kein PR. CI: Push-Workflows laufen auf dem Branch (überwiegend übersprungen/abgebrochen durch Folgecommits); `quant-ci` hat für den Branch keine Läufe; der manuelle Evidenz-Workflow ist erst nach Merge startbar.

## 26 Final Status

| Bereich | Status |
|---|---|
| Elliott Engine Quality | **FAIL** (HOLDOUT-3; kein 3.3, kein HOLDOUT-4) — experimentelles Strukturmodell |
| Expert Validation | **BLOCKED** (Werkbank fertig, keine Annotationen) |
| Forecast Evidence | **NOT ESTABLISHED** (kein Vorteil; zeitraumgleiche Baseline negativ) |
| Product Migration | **DONE** (elliott-3.2.2, ti-scenario-1.2.1, neu gebaut) |
| Professional UI | **DONE** |
| Mobile UI | **DONE** (Audit 390/430/768 ohne Befund; keine Nutzerstudie) |
| Daily | **BLOCKED** (R2/CI, Owner-Merge) |
| Intraday | **BLOCKED** (keine Historie) |
| Survivorship | **BLOCKED** (Daten nur in CI) |
| Alerts | **PARTIAL** (in-App DONE, Push/E-Mail BLOCKED) |
| AI Integration | **DONE** (strukturiertes Werkzeug; Modell sieht Werte nicht) |
| Regulatory | **LEGAL REVIEW REQUIRED** |

## Selbstkritik (§114)

1. **Production-grade:** Datenpipeline mit Versionierung, kausale Analyse (Vergiftungstest), Plausibilitätsgrenzen der Kursniveaus, migrationssichere Alerts, Screener-/Ask-Integration, Statistik mit Cluster-Intervallen — als *beschreibendes* Werkzeug.
2. **Experimental:** die gesamte Elliott-Schicht (Zählung, Anwendbarkeit, 3.2.2-Deckel).
3. **Ausschließlich deskriptiv:** Szenarien, Konfluenz, Trend, Momentum, Struktur, Formationen, Fibonacci, Wyckoff, Volumen.
4. **Forecast validated:** nichts. TIMING_EARLY war in Mission II mit Engine 2.2 bestätigt, ist aber für 3.x nicht neu gemessen und kein Prognosevorteil der Zählung.
5. **Expert validated:** nichts.
6. **Kritischste Datenlücke:** Tagesdaten des Universums mit Volumen und delisteten Titeln (nur in CI) — ohne sie ist jede Evidenz Wochenschluss und survivorship-verzerrt.
7. **UI-Schwäche:** Die Szenario-Begriffe („Einstiegszone“, „Ziel“, CRV) wirken handlungsleitend, obwohl kein Vorteil belegt ist; Pro-Ansicht ist für Laien dicht; keine Nutzerstudie.
8. **Methodische Schwäche:** Der einzige Gütemaßstab der Engine ist ein selbst gebauter Generator, der mit der Engine gekoppelt ist; laufende Muster werden nicht erkannt.
9. **Externe Abhängigkeit:** echte, unabhängige Expertenannotationen.
10. **Externer Quant:** (a) zeitraumgleiche Baseline negativ — Szenarien schlechter als Zufall im selben Regime; (b) TEST mehrfach angesehen, Survivorship ungelöst; (c) Schwellen der Plausibilitätsgrenzen (Faktor 3, 12 ATR, 35 %) sind gesetzt, nicht geschätzt.
11. **Elliott-Praktiker:** (a) Grad und Kontext werden aus Pivots statt aus dem Gesamtbild abgeleitet (Beispiel HCTI: „Neuzuordnung bei 69.322“ bei Kurs 0,74 — formal korrekt aus split-bereinigter Historie, praktisch bedeutungslos); (b) laufende Impulse werden als fertige Korrekturen gelesen; (c) Enthaltung in 99 % der Fälle — „das Werkzeug zählt praktisch nie“.
12. **Consumer:** (a) meist „keine verlässliche Zählung“ — wofür dann Elliott? (b) Szenarien mit Einstieg und Ziel, aber der Hinweis „kein Vorteil belegt“ — verwirrend; (c) zu viele Fachbegriffe in der Pro-Ansicht.
