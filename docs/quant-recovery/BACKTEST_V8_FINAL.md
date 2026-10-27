# V8 – Abschluss

**V8_PARTIALLY_VALIDATED.** Technisch implementiert: **13/13**. Im definierten Methodenscope abgenommen: **4/13**, entsprechend **4/7 Erweiterungsmethoden**. Offiziell zertifizierte Backtest-Arten: **0/6**. Keine Produktaktivierung und kein Merge des V8-PR.

## Repository und Nachweise

Ausgangs-Main war `e8cd0c7920b4304340901e352ddad495097abe90`. Die verbindliche Übergabe und ursprünglichen Verträge sind hashgebunden gesichert. Während der unterbrochenen Sitzung wurden parallele Main-Änderungen erhalten und zuletzt **Main `1dfccf81d579da5f1da603e895b9dbe0ea5d4bd6`** integriert. Der abschließend geprüfte ausführbare V8-Head ist **`8a56478b1eda02bef146159a98548c67f86964f1`**; anschließende Abschlusscommits ergänzen ausschließlich Berichte und Nachweise.

Nach dem wissenschaftlichen Freeze wurde zusätzlich Main `2f8d11beb689622b1bd0f61dde59ed3a67858bbe` beobachtet. Die Git-Blob-Prüfung bestätigt **57 unveränderte bestehende Research-Daten-/Codeabhängigkeiten**; fünf V8-eigene Pfade fehlen erwartungsgemäß in beiden Main-Bäumen. Diese späteren Technical-/Fundamental-/Produktweltänderungen werden nicht als V8-Arbeit oder nachträglich umbenannte Rechengeneration ausgegeben. Der versiegelte lokale Integrationsstand bleibt `1df…`; die aktuelle PR-Kompatibilitäts-CI ist davon separat. [Abgleich](v8/post-freeze-main-review.json).

[Draft-PR #976](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/976), Branch `research/quant-v8-recovery`. Kein automatischer Merge, keine geschützte Produktstatusänderung. Die bestehenden Research-Engines, der Wochenadapter, der Portfolioledger und `scripts/quant/run-research.cjs` bleiben die Architektur.

## Fachlicher Fortschritt

| Bereich | V8-Ergebnis |
|---|---|
| Monte Carlo / OOS-Verwaltung | Die beiden V7-Abnahmen bleiben in ihrem bisherigen Scope erhalten; keine Bestätigung einer Tradingregel. |
| Walk-Forward | **Neu scoped abgenommen:** vollständige Fit-/Select-/Testkette, sechs besetzte Fenster je Rolling/Expanding, jeweils 876 eindeutige Testgelegenheiten; gereifte Labels, konservatives Purging, sieben Tage Embargo und unabhängige Python-Parität. Bekannte Entwicklungsdaten, kein unangetasteter Holdout und kein finanziertes Portfolio. |
| Marktregime | **Neu scoped abgenommen:** sämtliche 7.880 beschreibenden ex-post-Labels, 581 Trendepisoden und 47 Volatilitätsepisoden unabhängig nachgerechnet. Keine unabhängigen Cluster oder frühere PIT-Tradingverfügbarkeit behauptet. |
| Parameter-Sensitivität | 36 tatsächliche Parameterpunkte × zwei deklarierte Kalenderblockdesigns = 72 Konfigurationen; nominale und Holm-Ergebnisse getrennt. 144.662 Python-Vergleiche einschließlich 402 Quellenpreisvergleichen. Stationaritäts-/Mischungsannahmen bleiben ungeprüft, deshalb keine volle Inferenzabnahme. |
| Event-Driven | Zwölf zusätzliche originale SEC-Acceptance-Nachweise; zwölf Vier-Wochen-Outcomes und vier zusätzliche Tagesvarianten derselben Ereignisprobe. Keine 16 unabhängigen Ereignisse, keine erfundenen Earningszeiten. |
| Portfolio-Rebalancing | Geprüfte reale Preisbuchführung erhalten. Rohdatenzugriff ist hergestellt; tatsächliche Dividendenzahlungstage und ursprüngliche Ankündigungsverfügbarkeit fehlen in den geprüften Tagesformaten. Ex-Tag-Ansprüche werden nicht als sofort investierbares Cash fingiert. |

Die sechs Backtest-Arten bleiben fachlich begrenzte Realstudien. Signal Backtest erhält die vollständige Entwicklungs-Auswahlkette über die fünf unveränderten Regeln; Same Stock Replay zusätzlich die unten beschriebenen quellenkorrigierten Preisgenerationen. Patternkontrollen, Setuprekonstruktionen, ursprüngliche Setup-Veröffentlichungen, Strategie- und Faktorstudien bleiben sauber getrennt. Offene M6-, PIT-, Membership-, Reife- und Freigabegates werden nicht umgangen.

## Tatsächlich erschlossene Daten

- Bestehende Discover-/Tiingo-/SEC-Caches: **20.228 Dateien, 11.771.237.597 Bytes**; Tiingo über den vorhandenen Schlüssel erfolgreich entschlüsselt. 12.492 Daily-Vintages betreffen 7.198 unterschiedliche Ticker, keine ebenso große qualifizierte historische Common-Stock-Population. Die Inhaltsprüfung bleibt wegen ausdrücklich ausgewiesener Größen-/Formatgrenzen teilweise.
- **5.481 normalisierte SEC-Factbooks**, 8.097.124 Timelines und **19.165.389 Beobachtungen** inventarisiert. Gespeicherte Source-Hashverweise sind keine unabhängig nachgerechneten Rohbodyparitäten aller Fakten.
- **1.607/1.607** gespeicherte Verfügbarkeitszeiten aus den zwölf Original-Accessions stimmen überein. Die acht V7-XBRL-Originale/23 Faktenparitäten werden unverändert erhalten und nicht neu gezählt.
- R2 tatsächlich erreichbar: vorhandener Historienindex mit **7.803 Symbol-Einträgen**, drei Leseoperationen und 471.733 gemessenen Bytes. Keine fehlenden R2-/Tiingo-Archivberechtigungen im verwendeten Actions-Zugang nachgewiesen.
- 911 Perioden-/Verfügbarkeits-Prüffälle und der unplausible Fiscal-Year-Wert 43.830 bleiben ungeklärt. Daraus wird weder gültige PIT-Abdeckung noch ein gültiger historischer Jahresbereich abgeleitet.

Die elf benannten Referenzlistings und die feste Drei-Titel-Sensitivitätskohorte sind selektierte heutige Überlebende. Der Zielscope historischer primärer US-Stammaktien an NYSE, Nasdaq und NYSE American einschließlich Delistings bleibt unerfüllt. Keine heutige Auswahl wird zur damaligen Marktpopulation umetikettiert.

## Belegte Korrekturen und reale CA-Studien

**Zwei fehlerhafte Research-Zulassungen korrigiert:** FRMEP und MBINM werden anhand originaler SEC-Coverseiten und exakter Listingidentitäten als Preferred-Quellenkonflikt zurückgehalten. Keine vollständigen historischen Klassenintervalle erfunden; **null vollständige historische Identitätsrekonstruktionen**. Alte oder während des Abrufs geänderte, ungebundene Klassifikationsgenerationen liefern keine Performance mehr. Aktuelle Wochenqualifikation: 6.190 Kandidaten, **4.449 eingeschränkt verwendbar**, 1.741 ausgeschlossen.

Von 102 CA-Nachprüfungen aus den ursprünglichen Caches blieb jeder Fall unter dem bestehenden Hold. Die spätere R2-Untersuchung bearbeitet einen **anderen, vorab vollständig registrierten Nenner von 14** auf Main beobachteten Tages-/Wochen-Niveaukonflikten. Alle 14 sind durch tatsächliche Splitfaktoren und getrennte alte/neue Adjustierungsvintages erklärt; **22.726 Rohkurspunkte, 4.735 Wochenpunkte und 3.780 Tagespunkte** wurden unabhängig geprüft. Die alten Wochenkurse können in ihrem ursprünglichen Vintage korrekt gewesen sein; V6-/V7-Ergebnisse werden nicht als fehlerhaft umgeschrieben.

**Elf korrigierte private Preisgenerationen** bestehen den unveränderten Adapter und wurden mit der vorhandenen Weekly-Engine, exakter Wiederholung, immutable Generationen und Python-Ledgerparität gerechnet; insgesamt vier abgeschlossene Trades. GCTK, PPCB und SBFM behalten ihre bisherigen CA-Holds. **Null zusätzliche qualifizierte Listingidentitäten, null kanonische Datenreparaturen durch V8.** Die Quellenkorrektur erhöht die belegte Vintage-/Rechenqualität, nicht den Universumsnenner.

Der unabhängige Quellenverifier musste den tatsächlich verwendeten Publishervertrag prüfen: binäre Gleitkommaarithmetik und dessen Rundung unterscheiden sich an Halbgrenzen von idealer Decimal-HALF-UP-Arithmetik. Die korrigierte Python-Referenz fordert exakte Gleichheit zum Publisher; Decimal-Abweichungen werden separat berichtet. Keine verbreiterte Ergebnistoleranz. Beide Prüfstände bleiben erhalten.

Die nachfolgende kanonische Aktualisierung der 14 Wochenreihen stammt aus dem parallelen Main-Commit `6aa8f9757003397bd6524b79c9bd0bfdd9ff056c`, nicht aus V8. Aktueller Main-DQ-Stand: **WARN, null ERROR-Regeln**; 93 zurückliegende Reihen und 302 Sprungwarnungen bleiben sichtbar. Die vorherigen Main-Fehlerstände werden nicht rückwirkend grün bezeichnet.

## Validierung, Grenzen und Entscheidungen

[Remote-CI auf exakt Head `8a56478b1e…`](v8/remote-ci.json): Quant **3.142/3.142**, null Fehler/Skip/TODO; Core, SEC, PIT, Consumer und weitere abgeschlossene Fachchecks erfolgreich. Versionierte lokale Gesamt-/Isolationsnachweise, ergänzende Main-Gegenproben, Python-Referenzen und Ressourcen sind im [Validierungsbericht](BACKTEST_V8_VALIDATION.md) detailliert abgegrenzt. Der lokale Übergang zwischen Datenständen wird nicht als vollständig eingefrorener f10-Datenlauf ausgegeben. Zwei CPU-Kerne/8 GiB; keine OOM-Kills. Externe Vercel-Kontingentfehler werden separat erhalten, ohne Kauf, Upgrade oder Deployment-Retry.

Unabhängige Rechenimplementierungen und ursprüngliche SEC-Zeitquellen sind zusätzliche Prüfwege, keine unangetastete Prognoseevidenz. Für keine Handelsregel wird ein neuer unabhängiger Holdout behauptet. Die 600 CA-Holds, 218 Wochenlücken, 180 mehrdeutigen Identitäten und vier ungeklärten inaktiven Terminalfälle bleiben fachliche Grenzen. Kein Null-/Last-Price-Terminalfallback und keine Lückeninterpolation.

Die konkrete normative Vorlage bleibt der Setup-Wochen-/Monatsvertrag: aktuell **4.137 Originalereignisse auf 20 Ereignistagen, zwei Monaten und sechs ISO-Wochen**. Der Erzeuger zählt Monate, der Vertrag nennt 20 unabhängige Wochen; auch ein Wochenzähler allein beweist keine Unabhängigkeit. [Vorlage 1.0.1](v8/setup-decision-current.json), vorgeschlagene Vertragsversion 1.1.0: **nicht genehmigt oder aktiviert**. Weitere fehlende Originalvintages, historische Memberships, Dividendenerklärungen/Zahlungstage und terminale Ereignisse sind Daten-/Evidenzabhängigkeiten, keine durch Freigabe ersetzbaren Nachweise.

Frontend, Navigation, Menüs, Charts, Themes und andere Produktwelten sind gegenüber dem integrierten Main unverändert. Keine Preview angefordert, keine öffentliche Backtest-Auslieferung, keine Produktaktivierung, kein produktiver Scheduler geändert, kein zusätzlicher Datenanbieter und keine Vertragsänderung. Die ausschließlich manuellen Archivjobs verwenden bestehende Zugänge und führen keine R2-Schreiboperationen oder kostenpflichtigen Provider-Neuabrufe durch. Private Raw-Inputs/Runner-Generationen und Cache-Retention sind keine neue dauerhafte Archivzusage.

[Matrix](BACKTEST_V8_EVIDENCE_MATRIX.md) · [Datenrettung](BACKTEST_V8_DATA_RECOVERY.md) · [Methoden](BACKTEST_V8_METHOD_VALIDATION.md) · [Realstudien](BACKTEST_V8_REAL_STUDIES.md) · [Validierung](BACKTEST_V8_VALIDATION.md).
