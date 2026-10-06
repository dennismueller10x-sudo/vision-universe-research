# R15 – Live-Texte gegen Code und Fundamentaldaten-Architektur

Stand 05.10.2026, nur lesend geprüft. Die Live-Engines laut `scripts/supertrader/build.mjs:83`: Momentum 3.2.0, Weinstein 4.0.0, Darvas 3.0.2, Minervini 2.0.0 und Turtle 2.0.2. Dazu kommt VU Trend 52W 1.0.0 (`engine/rotation-52w.mjs`).
Details stehen in `live-text-audit.json` (56 Aussagen) und `fundamentals-matrix.json`.

## Teil 1 – Ergebnis in Zahlen

- **Geprüfte Aussagen:** 56.
- **Mit Abweichung:** 46 – davon 7 schwer (HIGH), 31 passen nicht zum Code, 27 beschreiben eine abgelöste Version.
- **Je Methode (Abweichungen/geprüft):** Weinstein 14/14, Minervini 10/12, Darvas 6/7, Turtle 6/7, Momentum 5/7, Trend52 1/3, übergreifend 4/6.
- **Bestätigt:** Keine Live-Aussage behauptet „Originalmethode“ oder „TraderFox reproduziert“ (beides wird ausdrücklich verneint). Die R13-Fehler zu Darvas (Gewinnfilter) und Minervini 2.0.0 (EPS) sind in der Doku korrigiert.

## Hauptursache

Die Registry führt Regeln über Versionen hinweg fort. Beim Wechsel der Version wird `strategy_version` einfach überschrieben (`registry-r7.mjs`, `registry-r8.mjs`).

- **Legacy-Markierung wird nicht angezeigt:** Abgelöste Regeln tragen zwar `legacy_only`. Die UI (`supertrader.js:482`, `ruleRow`) zeigt das aber nicht an.
- **Zähler zählen Altregeln mit:** „X Original, Y VU“ (`registry.mjs:668`) enthält auch abgelöste Regeln.
- **Regelkarten zitieren Altregeln:** Mehrere Karten-Abschnitte stehen noch auf Altregeln.
- **Altregeln ohne Markierung:** WEIN-VOL-03, WEIN-ST2-01, WEIN-STOP-VU, MIN-ENTRY-D1, MIN-STOP-VU sowie LC-CONFIRM-CLOSE/LC-MODEL-ENTRY bei den Methoden mit Kauf-Stop.
- **Herkunftsetikett „Original“ (`registry.mjs:664`):** Es wird vergeben, sobald eine Regel kein VU-Flag hat. Deshalb erscheinen auch TraderFox-Regeln (Trend52) und sekundär belegte Minervini-Ausstiege als „Original“.

## Teil 1 – Wichtigste Befunde

**Weinstein 4.0.0 (alle 14 geprüften Aussagen abweichend)**

1. **Trailing-Stop, den es nicht gibt:** Die Prozesskette sagt „Stop wöchentlich 2 % unter die steigende 30-Wochen-Linie nachziehen“ (`process-chain.mjs:34`, als ORIGINAL markiert). Auch die Regelkarte enthält unter „Halten“ WEIN-TRAIL-VU (`registry.mjs:560`).
   - Der Live-Code hat **keinen** Trailing-Stop. Seit 2.0.0 gilt nur der Ausstieg bei Wochenschluss unter der Linie.
   - Dieselbe Karte schreibt im Ausstieg „kein Stop innerhalb der Woche“ – sie widerspricht sich also selbst.
   - R14 hatte das bereits gemeldet; es ist unverändert.
2. **Volumen als Kandidatenfilter:** `process-chain.mjs:29` („Wochenvolumen ≥ 2×“), die Karte „Ungültig“ („Ausbruch ohne Volumen“, WEIN-VOL-01) und WEIN-VOL-03 („Sonst kein Einstieg“) behaupten einen Filter. Der Code (v3/v4) filtert nicht nach Volumen; er verkauft nur beim ersten Gewinn, wenn das Volumen schwach war (WEIN-VOL-04).
3. **Relative Stärke:** Laut Karte „Kandidat“ steigt die RS über 13 Wochen (WEIN-RS-01, Stand 1.1.0). Live prüft Mansfield-RS > 0 erst beim Kauf-Stop.
4. **Veraltete DNA-Felder:** trailing, volume, regime („filtert nicht“) und entry_trigger stehen auf Stand 1.1.0. Live wird nach Markt gefiltert (WEIN-MKT-01).
5. **Etiketten und Fortsetzungskauf:**
   - Die Prozesskette markiert die Schritte Quelle, Einstieg, Halten und Ausstieg als ORIGINAL. `fidelity.mjs` stuft dieselben Schritte als OPERATIONALIZATION ein (nur Sekundärzitate).
   - Für den Fortsetzungskauf (4.0.0) fehlt eine Zeile in der Methodentreue-Tabelle.
   - R13-Doku:90 beschreibt den Fortsetzungskauf falsch als „Rücksetzer zur Ausbruchszone“.
6. **Positionsgröße:** Es greift der Fallback `PORTFOLIO_DEFAULTS` (`model-portfolio.mjs:25`, `portfolio:null`): 0,5 % Risiko, höchstens 20 %, 10 Positionen. Die UI nennt das „VU-Standard“ – nicht falsch, aber ohne den Hinweis, dass der Wert aus Kullamägis Risikospanne stammt (`backtest.mjs:11`, KK-RISK-01). Als ORIGINAL wird er für Weinstein/Darvas nirgends ausgegeben.

**Minervini 2.0.0**

- **Regelkarte (Kandidat/Bestätigung) auf Stand 1.1.0:** Sie nennt 25 % über dem Tief und Bestätigung per Schluss ohne Volumen (MIN-LOW-01/MIN-ENTRY-D1, `registry.mjs:615-617`, plan:608).
  - Live gelten 30 % und MIN-ENTRY-D2 mit mindestens 1,4× Volumen.
- **Prozesskette ungenau:** Beim Ausstieg fehlt die Volumenbedingung, beim Halten MIN-BE-01 (Einstand ab 3R).
- **Widersprüche in der Karte:** „Halten“ sagt „Einstand nicht mechanisch belegt“, „Ausstieg“ enthält ihn aber (und ist als „Original“ markiert); `executable.note` spricht noch von einer „VU-Hilfsregel“.
- **MIN-FUND-HYBRID „Wachstum wird angezeigt“:** `fundamentalsDisplay` steht nur in `signals.json`, die UI rendert es nicht. „Gewinnbeschleunigung“ ist jährliches Net-Income-Wachstum, nicht Quartals-EPS.
- **Veraltete Begründung in `fidelity.mjs:93/106`:** Dort steht, es gebe „SEC nur für heute gelistete Firmen / keine Gewinne zum Stichtag“.
  - Tatsächlich enthält der PIT-Store auch delistete Titel.
  - Der wahre Grund, warum 3.0.0 nicht live ist: Die Version verfehlte die Übernahmebedingung.
- **Portfolio korrekt** (1,25 %, 25 %, progressiv); die Einordnung widerspricht sich aber: Fidelity ORIGINAL, R13-Doku:86 „VU-Annahme“, Prozesskette OPERATIONALIZATION.

**Darvas 3.0.2**

- **Code stimmt:** kein Gewinnfilter, 6 Titel, 1/6 Höchstgewicht, Marktampel.
- **Prozesskette „Portfolioplatz“ als ORIGINAL markiert (`process-chain.mjs:44`):** Der Schritt schließt die TraderFox/VU-Marktampel ein.
- **Marktampel fehlt in Karte und Fidelity:** Weder die Regelkarte noch die Fidelity-Tabelle erwähnt sie.
- **Altregeln:** DAR-ENTRY-01/-D1 behaupten noch „Live wird DAR-ENTRY-D1 gerechnet“.
- **Widerspruch zu Gewinndaten:** Fidelity sagt „keine Gewinndaten zum Stichtag“ und gleichzeitig „liegen seit R11 vor“.

**Turtle 2.0.2**

- **Prozesskette korrekt.**
- **Begründung der Reihenfolge falsch:** Portfolio-Block und `model-portfolio.mjs:22-23,31` sagen „alphabetisch (keine Rangregel in der Quelle)“ – im Widerspruch zur Prozesskette („bought the strongest markets“, MISSING) und zu R14.
- **Altregeln mit „Live“ im Text:** DON-ENTRY-D1 und DON-EXIT-01 („Live: Tagesschluss …“).
- **Veraltete Notizen:** `source_basis.note` („Schluss-Bestätigung“), DNA („Unit-Größe nicht simuliert“).

**Momentum 3.2.0**

- **Prozesskette und Portfolio stimmen** (0,5 %, 25 %, 10 Positionen, Quelle Kullamägi).
- **Altregeln ohne sichtbare Markierung:** Gap-Sperre, Schluss-Einstieg, TREND-01. Auch `source_basis.note` spricht noch von „Einstieg per Tagesschluss“.
- **Karte „Ungültig“: „danach keine Sperre“** gilt nur für LC-SETUP-LOST. Nach Invalidierung (INV-01/02) und Schließung gilt weiterhin die Sperre von 5 Sitzungen (`simulator.mjs:238`).

**Trend52 und übergreifend**

- **Trend52-Prozesskette korrekt.**
- **Trend52-Etiketten:** Karte und Zähler („10 Original“) weisen TraderFox-Regeln als „Original“ aus.
- **Startseite (`supertrader.js:327`):** „per Kauforder … wie in den Originalquellen“. Das gilt nicht für Minervini 2.0.0 (Schluss, dann nächste Eröffnung).
- **Beispiel-Teaser (`supertrader.js:1092`):** Er zeigt Turtle 1.1.0 (Schluss-Bestätigung), nicht die Live-Version.
- **`docs/SUPERTRADER_ENTRY_EXIT_RULES.md`:** Das Dokument steht vollständig auf Stand 30.09. (1.1.0) und erklärt LC-CONFIRM-CLOSE zur Regel „für alle Live-Varianten“.
- **`docs/SUPERTRADER_METHOD_FIDELITY.md`:** „3.1.0 läuft live“; die Runde-7-Matrix ist nicht als historisch gekennzeichnet.

## Teil 1 – Herkunft der Portfolio-Konfiguration je Live-Engine

| Methode | Quelle im Code | Risiko / max. Gewicht / Anzahl | Herkunft in der UI |
|---|---|---|---|
| Momentum 3.2.0 | `kk-breakout-v3` PORTFOLIO | 0,5 % / 25 % / 10, Rang nach RS | korrekt (Kullamägi; Anzahl VU) |
| Weinstein 4.0.0 | **Fallback** PORTFOLIO_DEFAULTS | 0,5 % / 20 % / 10, RS | „VU-Standard“; KK-Herkunft ungenannt |
| Darvas 3.0.2 | `darvas-v302` PORTFOLIO | 0,5 % / 16,7 % / 6, RS, Marktampel | korrekt (TIME + VU); Risiko VU |
| Minervini 2.0.0 | `minervini-v2` PORTFOLIO | 1,25 % / 25 % / 10, progressiv, RS | korrekt |
| Turtle 2.0.2 | `donchian-v2` PORTFOLIO | 2 % bei 2N (1 % je N) / 100 % / 12, alphabetisch | Werte korrekt; Begründung „keine Rangregel in der Quelle“ falsch |

## Teil 2 – Datensätze mit Fundamentaldaten

| Datensatz | Felder | PIT | Genutzt von | Live | Status |
|---|---|---|---|---|---|
| `quant/data/sec/consumer` (5.073 Emittenten) | Umsatz, Bruttogewinn, operatives Ergebnis (Q), Nettogewinn, EPS, OCF, Capex, FCF, Cash, Schulden, Aktienzahl, Eigenkapital, Bilanzsumme, Steuern, D&A, SBC; 13 Jahre / 8 Quartale / TTM | **teilweise**: `as_of_latest`, Einreichungsdatum der zuletzt gemeldeten Fassung, kein Erstwert | CANSLIM-/Piotroski-Teilprüfung (`build.mjs:625`), Discover | ja (nur Teilprüfungen) | vorhanden, für die 5 Methoden nicht integriert |
| Discover `metrics.f_*` | Umsatzwachstum TTM/3y/10y, Nettomarge, FCF-Marge, jährliche NI-Beschleunigung, Margenausweitung 3y, ROE, KGV | nein (Momentaufnahme) | Minervini `fundamentalsDisplay` (`build.mjs:749`) | Daten ja, UI nein | nur Anzeige, nicht gerendert |
| `quant/data/fundamentals/issuers` (5.479) | nur Abdeckungs-Metadaten; Werte liegen in `quant/data/sec/facts` (gitignored, hier nicht vorhanden) | Metadaten melden PIT_READY | Berichte | nein | nur Metadaten |
| `quant/data/sec/canonical` (5 Titel) | alle Kernfelder, filedAt/availableAt/restatementStatus | **ja** | Golden Universe (Quant) | nein | nur PIT-Stichprobe |
| privat `sec-pit-r11` | **nur EPS und Umsatz**, Quartale `[periodEnd, value, firstFiled, derived]`, inkl. delisteter Titel | **ja**, erste Einreichung | `engine/earnings.mjs` → Minervini 3.0.0 | **nein** | integriert, nicht live |
| privat `sec-pit-r12` | wie r11, zusätzlich IFRS und weitere Tags | ja | `audit-r14.mjs` | nein | nur Audit |
| privat `sec-delist-r13` | Delisting-Klasse (Übernahme) | ja | Szenario S1C | nein | keine Fundamentaldaten |
| – | Schätzungen, Überraschungen, 13F, PIT-Branchengruppen | – | – | – | **nicht vorhanden** |

## Teil 2 – Abdeckung der SEPA-Kriterien (Minervini)

- **Integriert, aber nicht live** (PIT, privat, nur Minervini 3.0.0): EPS-Wachstum y/y ≥ 25 %; EPS-Beschleunigung (nur gegen Vorquartal, „Code 33“ verlangt drei Quartale); Umsatzwachstum (nur „> 0 %“).
- **Ableitbar, nicht integriert:** Umsatzbeschleunigung (PIT-Umsatz liegt vor); jährliches EPS-Wachstum, ROE, FCF-Qualität (aus consumer, nicht PIT).
- **Daten vorhanden, aber nicht PIT:**
  - Margenausweitung (Brutto/operativ/netto) – im PIT-Store fehlen Bruttogewinn, operatives Ergebnis und Nettogewinn. Dafür müsste `sec-pit.mjs` um GrossProfit, OperatingIncomeLoss und NetIncomeLoss erweitert werden.
  - Nettogewinn: CANSLIM-C/A nutzt den zuletzt gemeldeten Nettogewinn statt EPS.
- **Nicht vorhanden:** Analystenschätzungen/Revisionen (`pit_gates.json`: analystEstimates = false), Earnings Surprises, 13F/institutionelle Halter (CANSLIM „I“ = CS-I-NA), Branchengruppen-Rang (keine PIT-Gruppenzugehörigkeit), Float.
- **Nicht öffentlich reproduzierbar:** Alle PIT-Tests auf Fundamentaldaten. Die Daten liegen nur im privaten Bucket, das Skript ist öffentlich.

## Empfehlungen (nicht umgesetzt, nur lesend geprüft)

1. **Weinstein-Live-Texte korrigieren** (`process-chain.mjs:29,34`, Regelkarte hold/candidate/invalid, DNA); Etiketten ORIGINAL → OPERATIONALIZATION.
2. **Altregeln in der UI sichtbar machen:** `legacy_only` anzeigen oder ausblenden, fehlende Markierungen nachtragen (WEIN-VOL-03, WEIN-ST2-01, MIN-ENTRY-D1 …), Legacy aus `ruleCounts` herausrechnen.
3. **Herkunftsetiketten:** aus `evidence_status` ableiten statt aus dem VU-Flag; Trend52 als DOCUMENTED_VARIANT ausweisen.
4. **Minervini-Karte auf 2.0.0 bringen:** D2/LOW-02/BE-01 aufnehmen. Den „Angezeigt“-Text entfernen oder die Anzeige tatsächlich rendern.
5. **Turtle-Text** in `model-portfolio.mjs` an R14 angleichen.
6. **Darvas-Prozesskette:** Die Marktampel als VU/DOCUMENTED_VARIANT markieren.
7. **Weinstein/Darvas-Positionsgröße:** Den 0,5-%-Standard als „von Kullamägi übernommen“ benennen.
8. **Doku aktualisieren oder als historisch kennzeichnen:** ENTRY_EXIT_RULES.md und METHOD_FIDELITY.md.
