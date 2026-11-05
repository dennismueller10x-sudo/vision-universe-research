# Signal-Studie E4 / S1

Forschung, nicht zertifiziert. [Protokoll](PROTOKOLL.md) vorregistriert im eigenen ersten Commit, danach unverändert. [Ergebnisse und Rangliste](ERGEBNISSE.md), [Prüfstand](VALIDIERUNG.md). **S2** (1.000 Titel, 2016–2026, exakter SPY): [Registrierung](S2_REGISTRIERUNG.md), [Ergebnis](S2_ERGEBNIS.md).

Aus dem Repository-Wurzelverzeichnis (keine Abhängigkeiten):

```sh
node --test scripts/research/signals/study.test.mjs
node scripts/research/signals/study.mjs --out /tmp/e4-results
node scripts/research/signals/report.mjs --results /tmp/e4-results --out /tmp/e4-report.md
node scripts/research/signals/verify.mjs --results /tmp/e4-results --out /tmp/e4-verification.json
node scripts/quality/check-test-isolation.mjs --suite 'scripts/research/signals/study.test.mjs'
```

Für numerische Reproduktion den Stand dieses Branches mit seinen eingefrorenen Eingangsdaten verwenden. Neuere Datenstände sind ein neuer Lauf und ändern die Hashes. `study.mjs` lädt lokale Daten; es ruft keinen Kursanbieter auf. Die beiden Ausgabeverzeichnisse sind frei wählbar; Tests schreiben keine Forschungs- oder Produktartefakte. Der Berichtserzeuger bekommt eine separate Ausgabedatei. `verify.mjs` läuft vom Repository-Wurzelverzeichnis und prüft Eingangs-/Engine-Hashes, Protokoll, Trades, Kosten, Ausschlüsse und Aggregationen gegen den Ergebnisstand.

Artefakte:

- `results/manifest.json`: Basis-main, Protokoll-Commit/Hash, Node-Version, Datei-für-Datei-Abdeckung und Hashes der Engines und Daten.
- `results/trades.jsonl`: jede abgeschlossene Ausführung mit Setup-ID, Signal-/Eintritts-/Ausstiegsdatum, eingefrorenen Marken, R, Kostenwirkung und Vergleichen.
- `results/results.json`: alle Familien, verworfene Beobachtungen, Marktphasen und Holm-korrigierte Tests; `null` heißt nicht verfügbar.
- `results/verification.json`: unabhängige Buchhaltungsprüfung und Hashes des verwendeten Codes/Ergebnisstands.

**Datengrenze:** Discover-Langreihen sind nur wöchentlich, die kurzen Reihen tägliche Schlüsse. Beides genügt nicht für nächsten Open und Stopp-/Zielberührungen. Die fünf echten Aktien-OHLC-Reihen werden vollständig genutzt. SPY-Open fehlt. Daher ist dies eine eingeschränkte S1-Auswertung, kein vollständiger Universumsnachweis und keine Freigabe für Live-Signale. 2008–2015 bleibt S2 vorbehalten; 2015 wird nur für Indikator-Warm-up verwendet.
