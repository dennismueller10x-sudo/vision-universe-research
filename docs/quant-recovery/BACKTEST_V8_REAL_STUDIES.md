# V8 – inkrementelle Realstudien

V8 ergänzt echte Ausführungsnachweise zu den bestehenden Engines. [Ergebnisse](v8/real-studies.json) und [unabhängige Python-Parität](v8/real-studies-parity.json) binden Studien und Eingaben über Hashes. Vollständige finale Inputs/Outputs liegen ausschließlich unter `/workspace/v8-private/real-studies-main-1df/`; ältere Generationen bleiben unverändert erhalten. Abschließend integriert ist Main `1dfccf81d579da5f1da603e895b9dbe0ea5d4bd6`, wissenschaftlich neu gebunden auf V8-Codehead `8a56478b1eda02bef146159a98548c67f86964f1`. Der Stichtag bleibt 23.10.2026. Die beiden zuletzt geänderten SPY-/Katalogquelldateien erzeugen eine neue Provenienz; sämtliche nicht zusammenfassenden Recheninputs und Ergebnisse sind gegenüber der vorherigen f10-Generation bytegleich. Alle 27 neu generierten JSONs wurden exakt wiederholt und unabhängig geprüft. Die Sitzung ist keine dauerhafte Archivzusage. [Finaler Integrationsbeleg](v8/study-main-final-integration.json).

## Population und Nenner

Unverändert elf benannte V7-Referenzlistings: A, ARM, GE, IBM, JPM, META, MSFT, NVDA, TSLA, WMT und XOM. Es sind ausgesuchte heutige Überlebende mit qualifizierten Wochenpreisen, keine damalige US-Marktpopulation. Instrument-/Listingprüfung erfolgt über den bestehenden Adapter und aktuellen Master; historische Klassifikations-/Membershipvollständigkeit wird nicht behauptet. Vollständiger Auswahlnenner dieser Studie ist elf angeforderte und elf nutzbare Referenzlistings. Der Nenner des historischen US-Marktes bleibt unbekannt. Alle fünf bestehenden Signalregeln bleiben unverändert.

PRICE_RETURN in USD auf ex-post splitbereinigten Preisen. Gebühren 10 bps und Slippage 5 bps je Seite sind Modellannahmen. SPY wird auf exakt gemeinsamen Daten ohne Kosten verglichen, ohne Rückverlängerung vor Existenz. Dividenden, reale Spreads, Impact, historische Ausführbarkeit und vollständige Terminalereignisse werden nicht unterstellt.

## Vollständiges Walk-Forward

V7 hatte nur die Partitionierung samt einem leeren Validierungsfenster gezeigt. V8 führt registrierte, quellcodegehashte Fit-/Select-/Testcallbacks tatsächlich aus. Kalenderbeginn 2000; Training 260 Wochen, Validation 156, Test 156, Schritt 156, sieben Tage Embargo. Informationsintervalle beginnen konservativ 53 beobachtete Wochen vor dem Signal, Labels enden am beobachteten 13-Wochen-Exit nach einer Woche Entrydelay. Beide Modi verwenden sechs vollständige Fenster. Unvollständige Restfenster werden durch die bestehende Engine nicht ausgegeben.

Training lässt nur Regeln mit positivem Trainmittel zu; Cash bleibt immer verfügbar. Validation wählt die Regel mit dem höchsten Nettoertrag über alle Kandidatenereignisse; nicht gewählte Regeln zählen null, Gleichstand wird lexikographisch aufgelöst. Test wertet die festgelegte Regel auf allen Testgelegenheiten aus. Callbacks sind reine Funktionen ohne Zugriff auf spätere Labels; JavaScript ist kein Sicherheits-Sandbox.

| Modus | Train je Fenster | Validation | Test | Einmalige Testgelegenheiten |
|---|---:|---:|---:|---:|
| Rolling | 157–207 | 60–92 | 120–161 | 876 |
| Expanding | 165–859 | 60–92 | 120–161 | 876 |

Der Mittelwert beträgt in beiden Modi 1,2152 % pro Kandidatenereignisgelegenheit. Die ausgewählten Modelle sind hier identisch; die Modi liefern keine zwei unabhängigen Bestätigungen. Der Endpunkt ist ein Ausführungsnachweis einer registrierten Auswahl auf bekannten Daten, kein finanziertes Portfolio, keine annualisierte Strategieperformance und kein profitabler Edgebeleg. Der private Entwicklungsplan speichert den tatsächlichen Registrierungszeitpunkt am 26.10.2026 und wird bei identischer Wiederholung wiederverwendet. Diese Registrierung auf bereits explorierter Historie erzeugt keinen damaligen Holdout.

Im gesamten Signalnenner bleiben 1.555 Ereignisse, davon 1.532 gereift und 23 unreif, ausgewiesen; die Walk-Forward-Rechnung verwendet davon die gereiften Ereignisse im deklarierten Kalender. Python rekonstruiert unabhängig jede Rollenbelegung und jeden Ausschluss einschließlich Purging/Embargo, trainiert/selektiert die Modelle erneut und vergleicht alle aggregierten Testwerte. Sämtliche zwölf ausgeführten Fenster besitzen besetzte, gereifte Rollen.

## Ex-post-Regime mit Episoden

7.880 tägliche SPY-Labels: 126 Handelstage Trend, Band ±5 %, 63 Renditen Stichprobenvolatilität, Annualisierung 252, Schwelle 25 %. Die vorhandene Regimeengine bleibt erhalten. Zusätzlich werden zusammenhängende Episoden mit Anfang/Ende, Labelzahl und tatsächlich exakt datumszugeordneten Ereignissen ausgewiesen. Fehlende Labels werden nicht gefüllt.

581 Trendepisoden und 47 Volatilitätsepisoden sind rechnerische Zustandsläufe. Davon sind 23 Hochvolatilitätsläufe mit 1.022 Labels, 24 Niedrigvolatilitätsläufe mit 6.858 Labels. 138 Signalereignisse können keinem exakten SPY-Labeldatum zugeordnet werden und bleiben unbekannt. Python berechnet alle Trends, Volatilitäten, Zustände und Episodenzuordnungen unabhängig nach.

Die Episoden sind keine nachgewiesen unabhängigen Zeitcluster. Benachbarte Zustandsläufe, gleitende Fenster, mehrere Titel und überlappende 13-Wochen-Outcomes bleiben abhängig. Engineintervalle werden nicht für Signifikanz oder Abnahme herangezogen. Frühere Datenverfügbarkeit und eine PIT-Regime-Handelsstrategie sind damit nicht belegt. Der abnahmefähige Scope ist ausschließlich die reproduzierbare beschreibende historische Zustands-/Episodenanalyse.

## Originale SEC-Acceptanceereignisse

[Zwölf Originalheader](v8/sec-acceptance-validation.json) belegen Accessionidentität und SEC-Acceptance gegen gespeicherte Verfügbarkeitszeiten. Vier aktuelle Ereignisse besitzen vollständige tägliche Preisfenster; acht frühere Header liegen vor Beginn der gespeicherten Daily-Reihen und werden explizit ausgeschlossen. Die Auswahl früh/mittel/spät ist eine Quellenprobe, kein repräsentativer SEC-Ereignisnenner.

Für JPM, MSFT, NVDA und XOM wird jeweils das letzte qualifizierte Acceptanceereignis mit einem 20-Handelstage-Preisoutcome ausgewertet: 4 erwartet, 4 beobachtet, 0 unreif, 0 zensiert. Entry ist der erste beobachtete Tagesschluss strikt nach Acceptance. Tagesdaten bestimmen die vorhandenen Sessiondaten; der bestehende Kalender liefert ergänzend modellierte reguläre Schlusszeiten samt DST und verkürzten Schlüssen. Dies beweist keine originale historische Kursverfügbarkeit oder einen tatsächlichen Livefill. SEC-Acceptance ist weder Unternehmensveröffentlichung noch Earningszeit. Python prüft Entry-/Exitwahl, UTC-Umrechnung und sämtliche Nettorenditen unabhängig.

Zusätzlich werden **alle zwölf original verifizierten Acceptanceereignisse** auf den bereits vorhandenen langen Wochenreihen untersucht. Der vorhandene Modus `OBSERVED_WEEKLY_DATES` wählt den ersten tatsächlich gespeicherten Wochenschluss auf einem strikt späteren Datum; der Outcome umfasst vier beobachtete Wochenbars. Dadurch sind auch die acht vor der Daily-Abdeckung liegenden Originalereignisse historisch auswertbar, ohne alte Intraday-Schlusszeiten zu erfinden. Erwartet und beobachtet: 12/12, keine unreifen oder zensierten Fälle. Python prüft für alle zwölf Ereignisse die unabhängige Datumsauswahl und Nettoarithmetik. Diese Wochenstudie und die tägliche Vierer-Teilstudie überlappen in den Quellen; sie sind keine 16 unabhängigen Ereignisse und verwenden unterschiedliche Horizont-/Ausführungsmodelle.

## Andere Backtest-Arten und Portfolio

Same Stock Replay, Pattern, Setup, Strategie und Ranking behalten ihre V7-Ergebnisse. Der neue Walk-Forward-Nachweis verwendet alle fünf realen Signalregeln, löst aber keine Survivorship-, Membership-, Finanzierung- oder Unabhängigkeitslücke. Setup-Wochenproxies bleiben von M3/M6-Verträgen getrennt; offene Horizonte bleiben offen. Die [versionierte Wochen-/Monatsentscheidung](v8/setup-decision.json) verändert keine Gates.

Die zusätzliche [Sensitivitätsstudie](BACKTEST_V8_METHOD_VALIDATION.md) umfasst 36 Parameterpunkte in der festen JPM/MSFT/NVDA-Kohorte mit zwei deklarierten Kalenderblockdesigns. Sie ergänzt abhängigkeitsbewusste bedingte Rechenprüfungen, bleibt wegen ungeprüfter Inferenzannahmen partiell validiert.

Die drei V7-Preisportfolios bleiben unabhängig nachgerechnete Cash-/Drift-/Kostenstudien. Ohne neue belegte Dividend-/CA-/Terminaldaten wird keine vollständige Total-Return- oder PIT-Profilstrategieabnahme behauptet und keine unveränderte Generation erneut voll berechnet.

Reproduktion unter Node 22, nach vorhandenem begrenztem SEC-Headerabruf:

```sh
node scripts/quant/run-v8-real-studies.cjs /private/v8/real-studies /private/v8/sec-headers/acceptance-validation.json
python3 scripts/quant/verify-v8-real-studies.py /private/v8/real-studies
```

Ohne dritten Parameter werden WF und Regime offline ausgeführt; Originalevents bleiben ausdrücklich `NOT_SUPPLIED`. Private Rohdaten werden nicht veröffentlicht. Kein Produktstatus wird verändert.

Exakte Wiederholung: Die 27 privaten JSON-Dateien der abschließenden Realstudien wurden unter identischer Node-22-Runtime bytegleich regeneriert; auch der unabhängige Python-Bericht war bytegleich. Der frühere exakte Vier-Dateien-Nachweis der Sensitivitätsgeneration bleibt erhalten; deren unveränderte 17 Quellen-/Codebindungen in 16 unterschiedlichen Dateien und die identische Node-Binärdatei wurden auf dem integrierten Main erneut geprüft. Eine zusätzliche Python-Gegenrechnung bestätigt 144.662 Vergleiche und 402 Quellenpreis-Outcomes. Die unveränderten Bootstrapwerte wurden wiederverwendet, nicht als neue numerische Generation umetikettiert. [Reproduktionsnachweis](v8/study-reproduction.json) · [Main-Integrationsvergleich](v8/study-main-integration.json). Unveränderte V7-Monte-Carlo- und Portfolio-Generationen wurden nicht redundant neu berechnet.

## Integration des fortgeschriebenen Main

Der EOD-Refresh ergänzt SPY und die vier Daily-Referenzreihen um den 26.10.2026. Der unveränderte Wochenstudien-Stichtag ist **23.10.2026**. Neue Benchmark- und Daily-Eingaben werden deshalb vor der Übergabe an die bestehenden Engines ausdrücklich auf diesen Stichtag begrenzt; Python prüft diese Grenze unabhängig. Keine späteren Kurse gelangen in die frühere Studie. Die vollständigen aktuellen Quelldateien bleiben durch ihre tatsächlichen Hashes gebunden.

Die Daily-Fenster rollen von 29.09.2025 auf 30.09.2025 weiter. Nach der Stichtagsbegrenzung bleiben je Titel 269 Kursbeobachtungen; sämtliche 269 gemeinsamen alten/neuen Preise sind exakt identisch. Die vier qualifizierten SEC-Daily-Outcomes behalten ihren vollständigen Zeitraum. Alle Signalresultate sind bytegleich zur vorherigen Generation; Walk-Forward-Modelle und Testwerte, sämtliche Regime-/Episodenergebnisse sowie die zwölf Wochen- und vier Tages-Outcomes bleiben numerisch identisch. Geänderte Rohquellen- und Ergebnisbindungen werden als neue Generation dokumentiert, ohne alte Ergebnisse zu überschreiben.

## Elf zusätzliche quellenkorrigierte Preis-Ledgerfälle

Die [R2-Quellenuntersuchung](v8/r2-ca-assessment.json) registriert alle 14 auf dem älteren Main-Stand f10 beobachteten Niveaukonflikte. Alle 14 sind unabhängig zum tatsächlichen Publishervertrag nachgerechnet; elf private neu adjustierte Generationen bestehen den unveränderten Wochenadapter. Die vorhandene Weekly-Engine und ihre Python-Referenz prüfen diese elf Fälle vollständig, einschließlich insgesamt vier abgeschlossener Trades. Neun Fälle ohne abgeschlossenen Trade sind gültige Cash-/Markierungsfälle, keine neun zusätzlichen Tradingbestätigungen. GCTK, PPCB und SBFM bleiben gehalten. Die elf Listings waren bereits zuvor verwendbar: kein neuer Universumsnenner, keine weitere Methodenabnahme und kein wirtschaftlicher Edge behauptet. Rohkurse und volle Resultate bleiben privat; abgeleitete Zähler, Hashes und Kennzahlen sind im Bericht nachvollziehbar. [Abgegrenzte Zähler](v8/r2-ca-accounting.json).
