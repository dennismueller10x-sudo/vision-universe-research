# Quant V9 – Übergabe 1.0.0

Stand: 27.10.2026. Diese Übergabe sichert den technischen V8-Abschluss; sie startet keine neue Research-Implementierung. Der fachliche Status bleibt **V8_PARTIALLY_VALIDATED**: **13/13 implementiert, 4/13 scoped abgenommen, 4/7 Erweiterungsmethoden, 0/6 Produktzertifizierungen**, `productionApproved=false`.

## Unveränderliche Ausgangsbasis

- PR [#976](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/976), V8-Abschluss-Head `bcfe76098b55fd919fe2dff5f3032c5b73a4f176`; ausführbarer Prüfstand `8a56478b1eda02bef146159a98548c67f86964f1`, integrierter wissenschaftlicher Main `1dfccf81d579da5f1da603e895b9dbe0ea5d4bd6`. Der tatsächliche spätere Merge-Commit ist dem PR-Mergereceipt zu entnehmen; diese Vorabübergabe behauptet keinen bereits erfolgten Merge.
- Beim technischen Abschluss beobachteter Main: `b9aa78e67930b11cf1646bd2dac05b3cce28242f`. Keine Überschneidung seiner Änderungen mit den 79 V8-Pfaden. Ein echter Git-Dreiwege-Mergebaum ist konfliktfrei; alle 57 bestehenden Research-Abhängigkeiten und sämtliche gesicherten V8-Pfade sind unverändert. Deshalb keine erneute Berechnung gültiger wissenschaftlicher Generationen und keine unnötige Main-Integration.
- [Sicherungsmanifest 1.0.0](v9/v8-securement-1.0.0.json): SHA-256/Git-Blobs der V8-Dateien und gemeinsamen Research-Einstiege; alle 54 Einträge des alten [V8-Artefaktmanifests](v8/artifact-manifest.json) erneut geprüft. Die sechs V8-Abschlussberichte und alten Prüfbelege bleiben unverändert und beschreiben ihren damaligen Abschlusszeitpunkt.
- Verbindliche Detailbelege: [V8-Abschluss](BACKTEST_V8_FINAL.md), [Evidenzmatrix](BACKTEST_V8_EVIDENCE_MATRIX.md), [Daten](BACKTEST_V8_DATA_RECOVERY.md), [Methoden](BACKTEST_V8_METHOD_VALIDATION.md), [Realstudien](BACKTEST_V8_REAL_STUDIES.md), [Validierung](BACKTEST_V8_VALIDATION.md).

## Bereits erschlossene Bestände und Wiederaufnahme

| Bestand | Gesicherter Umfang / Zugang | Grenze |
|---|---|---|
| Discover / Tiingo / SEC | 20.228 Dateien, 11.771.237.597 Bytes; vorhandene Main-Actions-Caches und authentifizierter Tiingo-Cache im Kontext `main`. Exakte Cachekeys und Run-/Artefakt-IDs: [Restoreprovenienz](v8/archive-restore-provenance.json). | Inhaltsprüfung teilweise; 12.492 Daily-Vintages / 7.198 Ticker sind keine historische Common-Stock-Population. Cache-Retention nicht garantiert. |
| Normalisierte SEC-Factbooks | 5.481 Factbooks, 8.097.124 Timelines, 19.165.389 Beobachtungen; gespeicherte Accessions/Restatements. | Keine unabhängige numerische Rohbodyparität aller Fakten und keine pauschale PIT-Abnahme. |
| SEC-Originale | Zwölf zusätzliche Acceptance-Accessions, 1.607/1.607 zeitliche Originalparitäten; V7: acht XBRL-Originale / 23 Faktenparitäten erhalten. | Acceptance ist nicht automatisch die früheste Unternehmenspublikation. |
| R2-Historien | Bestehende `VU_HISTORY_S3_*`-Bindings in Actions funktionieren; Index mit 7.803 Symbolen. Vorhandene manuelle Read-only-Jobs in `quant-ci.yml`, standardmäßig aus. | Keine Vollqualifikation beliebiger Präfixe, Memberships oder privater Backtestgenerationen. |
| CA-Rekonstruktion | 14 vorregistrierte Vintagekonflikte erklärt; elf private Preisgenerationen, unabhängige Python-Parität, vier abgeschlossene Trades. | Null zusätzliche qualifizierte Listings und null kanonische Reparaturen durch V8. GCTK/PPCB/SBFM bleiben gehalten. |
| Wochenuniversum | 6.190 Kandidaten, 4.449 eingeschränkt verwendbar; exakte FRMEP-/MBINM-Konfliktholds. | Keine repräsentative historische primäre US-Common-Population einschließlich Delistings. |

Die frühere lokale Sitzung verwendete `/workspace/v8-private` für Rohinputs und Generationen. Das ist keine dauerhafte Archivzusage. Reproduktion über gespeicherte Quellenversionen, Hashes und bestehende autorisierte Caches/R2; keine Rohdaten in Git veröffentlichen. Lokale Secrets fehlen, aber fehlende Actions-/R2-/Tiingo-Berechtigung ist für die geprüften Wege **nicht** belegt. Vor neuen Abrufen zuerst gespeicherte Bestände nutzen; keine Käufe oder unbudgetierten Vollabrufe.

## Verbleibende fachliche Arbeit, priorisiert

1. **Historische Identität und Total Return:** 180 mehrdeutige Identitäten, 600 CA-Holds, 218 Wochenlücken und vier unbelegte terminale Werte. Quellenintervalle, Primärlisting und Aktiengattung belegen; FRMEP/MBINM nicht heuristisch historisch umklassifizieren. Keine erfundenen Terminalwerte oder Lückenfüllung.
2. **SEC/PIT und Faktoren:** 911 Verfügbarkeits-/Periodenkontexte sowie Fiscal-Year-Wert 43.830 quellenbezogen untersuchen; tatsächliche Originalvintages und historische Querschnitte qualifizieren. Keine Rückdatierung von `as_of_latest` oder späteren Restatements.
3. **Drei partielle Erweiterungsmethoden:** Sensitivität benötigt tragfähige Stationaritäts-/Abhängigkeitsnachweise über das selektierte Survivor-Trio hinaus; Event-Driven mehr ursprüngliche Publikationszeiten/-kategorien und Revisionen; Portfolio-Rebalancing tatsächliche historische Inputs/Memberships, Dividendenzahlungstage und belegte terminale Cash-/Stockereignisse. Ex-Tag ist kein erfundener Zahlungstag.
4. **Sechs Backtest-Arten:** Marktpopulation, ursprüngliche Signale/Setups, Kontrollen, Zeitcluster, gereifte Outcomes, Kosten, Benchmarks, PIT-Faktoren und Survivorship bleiben beschränkt. Bestehende Studien verbessern, bestehende Engines weiterverwenden; keine Parallelarchitektur.
5. **Echte Bestätigung:** Die explorierte Historie bleibt Entwicklungs-/retrospektive Evidenz. Rechenparität und Quellenunabhängigkeit sind kein unangetasteter Prognoseholdout. Neue bestätigende Studien vor Auswertung registrieren; negative/unklare Ergebnisse zulassen.

Erhaltene Abnahmen: Monte Carlo (bedingtes empirisches Resampling), OOS-Expositionsverwaltung, vollständige entwicklungsbezogene Walk-Forward-Kette (je sechs Rolling-/Expanding-Fenster, 876 Testgelegenheiten) und beschreibende ex-post-Regimeanalyse. Keine dieser Abnahmen zertifiziert eine Tradingstrategie.

**Offene normative Entscheidung:** [Setup-Vorlage 1.0.1](v8/setup-decision-current.json): 4.137 Originalereignisse auf 20 Ereignistagen, zwei Monaten und sechs ISO-Wochen; Erzeuger zählt Monate, aktiver Vertrag nennt 20 unabhängige Wochen. Vorgeschlagene Vertragsversion 1.1.0 ist **nicht genehmigt/aktiviert**. M6-, OOS-, Reife- und Freigabegates bleiben wirksam; fehlende Daten sind durch Freigabe nicht ersetzbar.

## Technischer Abschluss und Grenzen

Die versiegelte Quant-CI auf `8a56478b` bestand 3.142 Tests; Core/SEC/PIT/Consumer, Isolation und unabhängige Python-Prüfungen sind hashgebunden dokumentiert. Auf Abschluss-Head `bcfe7609` sind inzwischen auch Quant-, Core-, SEC-, Browser-, Packaging-, FX- und CI-Config-Prüfungen erfolgreich. Der Vercel-Kontext scheitert separat am externen Build-Kontingent. Main meldet keine vorgeschriebenen Statuschecks/Reviewfreigaben; keine Reviews oder offenen Reviewthreads vorhanden. Keine Schutzumgehung oder Selbstfreigabe.

Der bestehende Workflow [pages-release.yml](../../.github/workflows/pages-release.yml) startet auf jedem Main-Push und erlaubt `deploy` für Nicht-PR-Ereignisse. Ein regulärer Merge kann deshalb eine automatische Pages-Auslieferung auslösen. Ein ausdrücklich verlangter Abschluss **ohne Deployment** benötigt vor dem Merge eine Klärung dieser bestehenden Automatik; sie wird in diesem Auftrag nicht verändert oder umgangen. Kein separater Deployment-Dispatch, keine Produktaktivierung, keine Änderung an Frontend, aktiven Zertifizierungsgates, Scheduler oder Produktstatus.
