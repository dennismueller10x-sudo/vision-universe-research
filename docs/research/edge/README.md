# E3 – Edge-Studie

Status: **Vorbereitung, empirischer Teil blockiert**. Kein belastbarer Sieger bestimmt. Der Bericht ist ausdrücklich kein abgeschlossener Backtest.

- [Unveränderliches Protokoll](PROTOKOLL.md), vor dem ersten E3-Lauf als eigener Commit festgehalten.
- [Vollständiger Vorbereitungsbericht mit 96 Varianten](BERICHT.md).
- [Maschinenlesbare Vorprüfung](preflight.json): Benchmarkquellen mit SHA-256, Daten-/Adapterblocker, jede Variante ohne erfundene Kennzahlen.
- [Validierung](VALIDIERUNG.md).

```bash
node --test scripts/research/edge/study.test.cjs
node scripts/research/edge/preflight.cjs --out docs/research/edge
```

Die Vorprüfung liest ETF-Metadaten aus dem festgehaltenen Quellcommit (auch im Teilcheckout), öffnet keine Holdout-Renditen und schreibt nur in den angegebenen Unterordner von `docs/research/edge/`. Exit **2** bedeutet erwartungsgemäß BLOCKED; Exit 0 wird derzeit nicht ausgegeben, da noch kein geprüfter Strategieadapter existiert. Ein anderer Protokoll-Hash führt zum Abbruch. Bestehende Berichte im Zielordner werden reproduzierbar ersetzt; PROTOKOLL.md wird nie geschrieben.

`study.cjs` enthält reine Statistikfunktionen und den vollständigen Variantenkatalog. `pairedTest` verwendet gepaarte Wochenrenditen; `holm` muss später mit genau 192 p-Werten einschließlich p=1 für fehlgeschlagene Tests aufgerufen werden. Diese Hilfsfunktionen sind noch kein Studienrunner: Es fehlen die im Bericht aufgeführten Ausführungsadapter, die Entwicklungs-Auswahl mit Hash-Sperre und die anschließende gemeinsame Auswertung. Sie dürfen nicht mit fertigen alten Equity-Kurven als angeblich neuem Holdout gespeist werden.

Keine neuen Datenanbieter, Produktdateien, Fachmodelle oder Workflows. Alle Änderungen dieses PR liegen in den beiden für E3 erlaubten Pfaden.
