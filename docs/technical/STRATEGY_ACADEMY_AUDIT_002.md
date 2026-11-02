# Strategie-Akademie · kritisches Audit CODEX 002

Geprüfte Ausgangsversion: PR #1253, `272b226018869a03459f64c9dc4d46e67a791ee7`. Stand: 02.11.2026. Abhängigkeit: offener Draft-PR #1245, Kopf `97b15816089c91e28c577c5c24c5f3a2e4c6f66b`.

## Prüfmethode und Grenzen

Alle 32 Lektionen wurden im zweiten, kritischen Durchgang nach den acht Auftragskriterien geprüft: fachliche Richtigkeit, Einsteigerverständlichkeit, Reihenfolge, Vollständigkeit, Vereinfachungen, Grenzen, Quizinhalt und tatsächliche Funktion. Die vollständige Einzelbewertung mit allen acht Kriterien je Lektion steht in [lesson-audit.json](academy-audit-qa/lesson-audit.json). Der neue semantische Prüfvertrag ist vom ursprünglichen Schema und Laufzeit-Antwortvergleich getrennt. Damit erkennen die Tests auch fachlich falsche Inhalte, die formal gültig sind.

Dies ist keine durch eine andere Person durchgeführte externe Fachzertifizierung und kein Nutzertest mit rekrutierten Einsteigern. Die didaktische Bewertung beruht auf konkreten Inhaltsbefunden und reproduzierten Browserwegen. Die separaten Erwartungen und externen Quellen machen den zweiten Prüfdurchgang nachprüfbar; freie Textwahrheit lässt sich durch Regex-Tests allein nicht beweisen.

## Nachgewiesene Befunde und Korrekturen

| Befund | Bedeutung | Korrektur und Gegenprüfung |
|---|---|---|
| A01 Praxisziel vorhanden, aber falsch | SMA-Lektion kündigte etablierte Trendvorlage an, führte zu Trendfolge; Datenqualität führte zu Kombination; Zielwahl führte direkt zu Kombination; Bollinger begann beim Ruhephasen-Assistenten | Passende Ziele gewählt; 32 erwartete Praxiszuordnungen unabhängig hinterlegt, vorhandene falsche Ziele als Negativfälle getestet; alle Praxislinks im Browser geöffnet und Rückkehr geprüft |
| A02 Quiz zu UND zu pauschal | Zusätzliche Bedingung kann die Trefferliste unverändert lassen | Fachlich genaue Antwort und Erklärung; Rückfall auf alte Antwort wird erkannt |
| A03 ATR-Definition unvollständig | Drei Abstände genannt, aber Maximum nicht ausdrücklich erklärt | Maximum, Wilder14 und Unterschied TR/ATR; Zahlenbeispiel Vorschluss100/H106/L104: TR6, nicht2; unabhängig nachgerechnet |
| A04 Relative Stärke ohne klare Einheit | Differenz, absoluter Verlust und Rang konnten verwechselt werden | SPY als ETF, Differenz in Prozentpunkten, +5pp bei absolut −5%; Anwendungsquiz |
| A05 Begriffe kamen zu spät | EMA nicht eingeführt, SMA im Strukturpfad; Kerzenmuster mit geometrischer Formation verknüpft | Vorabbegriffe oberhalb der Grundlagen; EMA, SPY, Slippage und Kerzenmuster ergänzt; falsche Glossarzuordnung ersetzt |
| A06 Wichtige Abgrenzungen fehlten | RSI-Skala könnte als Wahrscheinlichkeit gelesen werden, MTF-Feldname als200Wochen; SMA200-Vergleich als täglicher Anstieg | Wilder/Skala erklärt; reale Zuordnung200D/40W/10M und21-Sitzungen-Vergleich genannt; keine Fachmodelle geändert |
| A07 Vergleichszeiträume unklar | +10 und danach+2 belegen ohne gleiche Zeitspanne keine Verlangsamung | Gleich lange Abschnitte in Beispiel, Erklärung und Lernbild |
| A08 Wiederholungen | Identischer64-Wort-Block in allen 32 Lektionen plus je Pfad vierfach wiederholte Übungsanweisung | Gemeinsame Hinweise gestrafft, Übungsanweisung einmal pro Pfad; im Schnitt273→202 Wörter, Spannweite173–258 statt262–287 (gleiche Messung, ohne Feedback doppelt zu zählen) |
| A09 Fehlender Rückweg und Zustandsverlust | Analyse öffnen verließ die Lektion; Auswahl/Feedback und Leseposition gingen verloren | Tab-lokale Wiederaufnahme, sichtbarer Rücklink auf Technical-Ansichten, Quiz- und Scrollzustand; Reload des Praxisziels und Browser-Zurück geprüft |
| A10 Veraltetes Quizfeedback | Nach Antwortwechsel blieb vorheriges Richtig/Falsch stehen | Bei Änderung Feedback zurücksetzen und erneute Prüfung verlangen; Browserregression |
| A11 Abschlüsse ignorierten Lektionsversion | Nur globale Inhaltsversion geprüft | Revisionskarte pro Abschluss; geänderte Lektionen neu abschließen, unveränderte erhalten; Legacy-v1 konservativ migrieren, Hinweis bei geänderten Inhalten |
| A12 Lehrbeispiele zu leicht abfragbar | Viele Fragen prüften nur, ob eine Erfolgsgarantie abzulehnen ist | Vier Zahlen-/Anwendungsfragen (SMA, RS, MACD, TR), übrige zutreffende Fragen erhalten;32 falsche aber schema-gültige Lösungsschlüssel als Gegenfälle |

Die substanziellen ersten Grundlagenabsätze wurden in allen 32 Lektionen erhalten. Ergänzungen betreffen belegte Erklärungslücken. Beispiele, Risiken und Fragen ohne fachlichen Befund bleiben bestehen. Die 32 Kürzungen entfernen dieselben zwei wiederholten Zusatzabsätze; sie sind keine32 neuen Fachentscheidungen.19 Lektionen erhielten wegen geänderter Lernanforderungen/Praxiszuordnung Revision 2;13 bleiben Revision 1. `contentVersion` bleibt1: Das Format und die Identitäten bleiben kompatibel, Abschlüsse werden jetzt pro Lektion geprüft.

## Didaktische Bewertung der acht Pfade

| Pfad | Bewertung und Reihenfolge | verbleibende praktische Grenze |
|---|---|---|
| Chart und Marktstruktur | Kerze→Struktur→Zonen→Routine sinnvoll. Zahlenkerze und Zonenbeispiel verständlich; OHLC erklärt, SMA vorab erreichbar | OHLC verrät weiterhin keine Reihenfolge innerhalb der Sitzung |
| Trendfolge | Struktur→Durchschnitte→RS→acht Kriterien sinnvoll. Arithmetik und relativer Verlust werden nun tatsächlich angewendet | Kriterien beschreiben einen Stichtag; RS-Rang ist universumsabhängig |
| Breakouts | Bildung→Bestätigung→Volumen→Scheitern sinnvoll. Median und Invalidierung verständlicher; Historie und Regeln richtig auffindbar | Kein garantierter Verlauf; Regeln bleiben formationstypabhängig |
| Momentum | Richtung→RSI→MACD→Kombination sinnvoll. EMA und unterschiedliche Nulllinien rechtzeitig erklärt | Daten überlappen; mehrere Kennzahlen sind keine unabhängigen Stimmen |
| Volatilität und Risiko | Schwankung→ATR→Bänder→Ausführung sinnvoll. TR-Lückenbeispiel und Stopptypen erhöhen konkreten Lernwert | Kein Positionsrechner/Handelsauftrag; Kosten, Lücken und Nichtausführung bleiben reale Grenzen |
| Trendwechsel | Gegenbewegung→Divergenz→Kerzen→Widersprüche sinnvoll. Musterarten im Glossar richtig getrennt | Manuelle Vergleichspunkte können rückblickend selektiv sein |
| Multi-Timeframe | Balken→Abschluss→Uneinigkeit→Routine sinnvoll. Tatsächliche Filterfenster explizit statt aus Feldnamen zu erraten | Lange Schlusslinie ist keine OHLC-Historie; kein eigener Score |
| Eigene Routine | Frage→Filter→Daten→Dokumentation sinnvoll. Zielwahl und Datenprüfung führen jetzt an den angekündigten Ort | Akademiefortschritt ist kein Analysejournal; Trefferlisten verändern sich |

Für Einsteiger empfiehlt sich Pfad1 zuerst, danach Wahl nach Analysefrage. Es gibt keine neue Pflichtreihenfolge oder Zwangsfreischaltung. Die kürzeren Lektionen sind absichtlich nicht mit Fülltext auf 250 Wörter gebracht. Der Umfangstest schützt nun120–450 Wörter plus Pflichtbausteine; der ursprüngliche Richtwert war kein didaktisches Gütesiegel. Die einzelne Grenze und das Gegenbeispiel bleiben in jeder Lektion sichtbar.

## Fachquellen und Einordnung

Alle folgenden Webquellen wurden am 02.11.2026 erfolgreich abgerufen. Response-Hashes und URL stehen im JSON-Prüfbeleg. Definitionen und Einschränkungen wurden abgeglichen; allgemeine Handelssignal-Deutungen dieser Seiten werden weder als Regeln noch als nachgewiesener Vorteil übernommen.

| Quelle | Quellenart | konkret geprüft |
|---|---|---|
| [John Bollinger: Bollinger Band Rules](https://www.bollingerbands.com/bollinger-band-rules) | Primärquelle des Entwicklers | Regeln6/7: Bandberührung allein kein Signal, Bandlaufen im Trend;9:20/2 Standard;14: keine Normalverteilungs-/95%-Garantie |
| [SEC Investor.gov: Types of Orders](https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work/types-orders) | Primärquelle der Aufsicht zu Ordermechanik | Markt-/Limitauftrag, Stop wird Marktauftrag; Preis-/Ausführungsgrenzen |
| [Fidelity: RSI](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI) | ergänzende Fachliteratur, kein Erfinderoriginal |0–100,30/70-Konvention, Verharren im starken Trend, Divergenz und Wilder-Definition |
| [Fidelity: MACD](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/macd) | ergänzende Fachliteratur | EMA12−26, Signal EMA9, Nulllinie und Kreuzungen; keine Erfolgsquote daraus abgeleitet |
| [Fidelity: ATR](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr) | ergänzende Fachliteratur | Maximum der drei True-Range-Spannen, Glättung, fehlende Richtung |
| [Fidelity: SMA](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/sma) | ergänzende Fachliteratur | arithmetischer Durchschnitt, Perioden, Verzögerung |
| [Fidelity: Support and Resistance](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/support-and-resistance) | ergänzende Fachliteratur | übliche Zoneninterpretation; ausdrücklich keine garantierten Barrieren daraus gemacht |

Für die konkrete Produktdefinition sind interne Primärverträge maßgeblich: `indicators.js`/Katalog (RSI, MACD, ATR, SMA, Bollinger, relatives Volumen), `templates.js#establishedUptrend` (acht Kriterien), `multi-timeframe.js#SPECS` (40W/10M und abgeschlossene Perioden), `assistant.js` (Praxisziele), `model.js#CHART_LAYERS/CHART_PANES/FIELD_CHART` (vorhandene Darstellung), `FORMATION_VALIDATION.md` und bestehende Formationsregeln (Bestätigung/Invalidierung). Interne Quellenlinks bleiben am unveränderlichen Originalsnapshot; diese geprüften Definitionen haben sich im eingebundenen #1245-Stand nicht geändert. Wilder als Urheber wird in RSI/ATR-Fachliteratur genannt; ein nicht vollständig eingesehenes Erfinderbuch wird nicht als direkt geprüfte Quelle ausgegeben.

## Regression und Browsernachweise

Neue Prüfungen: fachlich falscher Lösungsschlüssel für jede der 32 Fragen; existierendes aber falsches Praxisziel; numerische Lehrbeispiele unabhängig vom Quiz ausgewertet; Glossarabweichungen, vertauschte MACD-Subtraktion, fehlendes TR-Maximum und falsche MTF-Fenster; konkrete Prognoseversprechen; Lektionsrevision/Legacy/globaler Versionssprung; ungültige oder veraltete Wiederaufnahmezustände. Der semantische Vertrag ersetzt kein offenes zukünftiges Fachreview, verhindert aber die nachgewiesenen Rückfälle.

Browser: alle32 Lektionen bei 360/390/1280px, hell/dunkel. Zusätzlich jeden Praxislink öffnen und zur selben Lektion zurückkehren; Quizwechsel, Tastatur, Wiederaufnahme inklusive Reload, Fokus, Touchgrößen, Glossar, Vor/Zurück, Leerantwort, Zurücksetzen, Ladefehler/Wiederholen und Speichersperre prüfen. Axe-Core4.10.3 prüft Katalog, Kerze, MACD, ATR und lange Risikolektion in allen sechs Ansichten (WCAG2A/AA und2.1AA). Diese Templateprüfung ist kein Anspruch auf vollständige manuelle WCAG-Zertifizierung.

Beim ersten erweiterten Browserlauf wartete eine Scrollprüfung nicht auf den vorgesehenen nächsten Animationsframe. Der Nachlauf mit zustandsbasierter Wartebedingung bestand in allen sechs Ansichten; kein pauschaler Sleep und keine entfernte Funktionsprüfung. Aktuelle Berichte und Screenshots liegen unter [academy-audit-qa](academy-audit-qa/). Mobile Browseremulation ist kein physischer iPhone-/Safari-Test.

## Abhängigkeit, Integration und offene Entscheidungen

PR#1245 bleibt unverändert auf seinem eigenen Branch. #1253 enthält dessen Commit97b1581 als Vorfahren und zielt weiter auf `claude/technical-assistant-t1-t3`. Dieser Audit verändert ausschließlich Akademie-Dateien, ihre Tests/Dokumentation, den erforderlichen Rücklink-Hook in `technical/app.js` und die isolierte QA-Abhängigkeit der vorhandenen Technical-CI.

Reihenfolge: Owner nimmt #1245 ab und lässt ihn in main integrieren; dann #1253 auf main umstellen, etwaige reine Integrationskonflikte auf dem Akademie-Branch beheben und CI gegen die neue Basis erneut prüfen; anschließend Owner-Abnahme von #1253 und gesondert autorisierter Merge. Hier wurde kein PR und kein main-Branch gemergt. Quant, Supertrader, Security Master, Kursdaten, Formeln und Strategieregeln bleiben unverändert. Vercel-Tarif-/Hostingänderungen sind ausgeschlossen.

## Aktuelle lokale Ergebnisse

| Prüfung | Ergebnis |
|---|---|
| Vollständige Technical-Suite | 80/80 |
| Davon Akademie-Tests | 13/13, sieben neue Audit-Prüfgruppen |
| Vollständige Core-Suite | 308/308 |
| Erweiterte Akademie-Browserprüfung | 44/44 Prüfgruppen;192 Lektionsaufrufe und192 Praxis-/Rückkehrwege |
| Axe-Core auf gemeinsamen Ansichten | 30 Prüfungen, keine A/AA-Verstöße |
| Bestehende Technical-Browserprüfung | 66/66 |
| Vollständige Technical-Testisolation | keine Produktionsdatei verändert |
| Schutzpfad-Diff und Whitespace | ohne Befund |

Zusätzlich führt ein realistischer Browserweg von RSI über den vorhandenen Chartpicker zu NVDA, aktiviert das vorhandene RSI-Unterfenster und kehrt zur Lektion zurück. Ein weiterer Weg führt von Filter kombinieren über den Assistenten in den vorhandenen Screener-Baukasten und zurück. Dabei werden vorhandene veröffentlichte Daten nur gelesen, ohne historische Ergebnisse zu erfinden.

Aktuelle maschinenlesbare Ergebnisse: [test-results.json](academy-audit-qa/test-results.json), [erweiterter Browserbericht](academy-audit-qa/report.json), [bestehender Browserbericht](academy-audit-qa/existing-browser-report.json). Screenshots wurden bei390px in hell/dunkel für Kerze, MACD und ATR visuell kontrolliert; Inhalte und Diagrammbeschriftungen sind lesbar und ohne seitlichen Überlauf.

Reproduktion zusätzlich zum bestehenden Prüfablauf:

```bash
node --test 'technical/tests/technical-academy*.test.mjs'
node scripts/quality/check-test-isolation.mjs --suite 'technical/tests/*.test.mjs'
npm install --prefix /tmp/tc-qa playwright@1.58.2 axe-core@4.10.3
NODE_PATH=/tmp/tc-qa/node_modules node scripts/technical/world/academy-browser-qa.mjs --out /tmp/academy-audit
```

GitHub-CI und Merge-Status werden am aktuellen PR-Kopf zusätzlich geprüft und im PR-Text aktualisiert. Lokale Ergebnisse werden nicht als noch ausstehender Remote-Erfolg ausgegeben. Vercel meldet für den ersten Audit-Implementierungscommit wieder Erfolg; keine Tarif- oder Hostingänderung wurde vorgenommen.

**Neue fachliche Owner-Entscheidungen: keine.** Ausstehend ist die reguläre Owner-Abnahme der Texte und Praxisführung; der Integrationsweg hängt am noch offenen #1245. Externe CI-/Hostingzustände werden separat berichtet und nicht als redaktionelle Entscheidungen ausgegeben.
