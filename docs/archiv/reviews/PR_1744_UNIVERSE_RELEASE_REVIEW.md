# Unabhängige Prüfung von PR #1744

Prüfdatum: 09.11.2026. Eingefrorener Prüfstand: Merge-Commit `a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a` von [PR #1744](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/1744).
Anlass: angekündigte Aktivierung um 01:30 UTC mit `mode=activate` und `scaling_run=42627272710`.

**Urteil:** PR #1744 behebt das Verdrängen einzelner Dispatches, schließt aber den ausfallrelevanten Pfad „Gate zu ohne erfolgreichen Rückweg“ nicht.

## Befunde nach Schwere

### BLOCKER — 46er-Rollback stellt ein geschlossenes Produktionsgate nicht wieder her (c/d)

[scripts/company_intelligence/universe-release.mjs:29](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/universe-release.mjs#L29): `restore46()` restauriert den Legacy-GOOD und setzt den **Universe-Aktivierungszeiger** auf `ROLLBACK_46`. Das separate Produktionsgate bleibt unverändert. Ist es durch Pages auf `DISABLED` gesetzt worden, baut auch der Recovery-Dispatch eine abgeschaltete Auslieferung: [scripts/company_intelligence/production-release.mjs:73](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/production-release.mjs#L73).

Der Workflow dispatcht Recovery lediglich, ohne deren Auslieferung abzuwarten oder die 46er-Verfügbarkeit zu prüfen: [.github/workflows/company-intelligence-universe-release.yml:216](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/.github/workflows/company-intelligence-universe-release.yml#L216). Daten-Rollback vorhanden; Wiederherstellung der Verfügbarkeit nicht garantiert.

### MAJOR — Gate schließen ohne Rollback bleibt ausdrücklich möglich (d)

[scripts/company_intelligence/pages-rollback-decision.mjs:25](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/pages-rollback-decision.mjs#L25) entscheidet bei fehlgeschlagener Freigabe, unbekanntem/unlesbarem Gate oder bereits geschlossenem Gate auf `DISABLE_ONLY`. Danach folgen trotzdem `disable` und OFF-Dispatch: [.github/workflows/pages-release.yml:597](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/.github/workflows/pages-release.yml#L597).

Auch ein wegen Generationenkonflikt abgewiesener Rollback verhindert das Schließen nicht: [scripts/company_intelligence/refresh-run.mjs:204](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/refresh-run.mjs#L204). Zusätzlich existiert der reine OFF-Modus-Disable-Pfad: [.github/workflows/pages-release.yml:613](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/.github/workflows/pages-release.yml#L613). **Ein geschlossenes Gate beweist daher keinen abgeschlossenen Rollback.** Diese Zustände werden durch #1744 nicht beseitigt.

### MAJOR — Erfolg wird vor Abschluss des Pages-Laufs akzeptiert (a/b)

[scripts/company_intelligence/refresh-dispatch-wait.mjs:149](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/refresh-dispatch-wait.mjs#L149) prüft zuerst nur die sichtbare Generation; der Pages-Status wird erst danach ausgewertet. Damit kann das Skript trotz abgebrochenem/fehlgeschlagenem oder noch laufendem Pages-Lauf Erfolg melden, wenn die Zielgeneration sichtbar ist.

Der nachgelagerte Workflow prüft zusätzlich `PASS`, wartet aber ebenfalls nicht auf dessen Live-QA: [.github/workflows/company-intelligence-universe-release.yml:180](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/.github/workflows/company-intelligence-universe-release.yml#L180). Ein Pages-Handler kann anschließend noch das Gate schließen. Die eigene Universe-Live-QA reduziert dieses Zeitfenster, bildet aber keine Abschlussbarriere zum Pages-Lauf.

### MAJOR — Zeitbegrenzung schützt nicht zuverlässig die Recovery-Reserve (a/c)

Der neue Waiter hat nominell 40 Minuten Wartezeit plus 10 Minuten Verlängerung: [scripts/company_intelligence/refresh-dispatch-wait.mjs:155](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/refresh-dispatch-wait.mjs#L155) und [scripts/company_intelligence/refresh-dispatch-wait.mjs:209](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/refresh-dispatch-wait.mjs#L209).

Danach bleibt eine weitere 20-Minuten-Schleife erhalten; deren `fetch()` besitzt keinen Abort-Timeout: [.github/workflows/company-intelligence-universe-release.yml:176](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/.github/workflows/company-intelligence-universe-release.yml#L176). Ein festhängender Request kann diese Schleifenfrist überschreiten. Außerdem berücksichtigt die feste Wartezeit weder bisherige Jobdauer noch verbleibende Rollback-Zeit beim 120-Minuten-Joblimit ([.github/workflows/company-intelligence-universe-release.yml:30](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/.github/workflows/company-intelligence-universe-release.yml#L30)). Die Retries selbst hängen nicht endlos; der Gesamtschritt kann jedoch bis zum Job-Timeout blockieren.

## Konkurrierender Push-Pages-Lauf (b)

Eine andere Generation wird nicht als erwartete Generation akzeptiert. Der Push-Lauf kann den Dispatch verdrängen; maximal zwei Neu-Dispatches folgen. Liefert weiterhin niemand die Zielgeneration, scheitert das Warten.

Die Dispatches sind allerdings nicht auf diese Generation gepinnt ([scripts/company_intelligence/refresh-dispatch-wait.mjs:195](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/refresh-dispatch-wait.mjs#L195)); Pages liest den jeweils aktiven GOOD ([scripts/company_intelligence/production-release.mjs:87](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/a03ba9ed5db9db6c7a8c8ebe97160d48b3d6826a/scripts/company_intelligence/production-release.mjs#L87)). Wird eine andere Generation nach dem Waiter-Erfolg, aber vor der nachgelagerten Prüfung sichtbar, greift wieder die exakte Generationsprüfung; die Live-Stichprobe bindet sich ebenfalls an die erwartete Sample-Generation. Nach bereits erfolgreicher Prüfung verhindert keine Sperre eine spätere konkurrierende Auslieferung.

## Prüfgrenzen

Statische, lesende Codeprüfung des genannten Merge-Stands; keine Produktionsaktionen, keine Änderungen an Workflows oder Skripten. Die Gültigkeit des Scaling-Receipts von Lauf `42627272710` wurde nicht separat nachgewiesen. Die Ausfälle vom 08./09.11. wurden nicht anhand ihrer Laufprotokolle rekonstruiert; der beschriebene Fehlerpfad ist im geprüften Code weiterhin vorhanden. Dieser Bericht enthält keine Aussage über spätere Korrekturen.
