# Vercel-Tageslimit: Was der rote „Vercel“-Status bedeutet

**Stand:** 03.11.2026 · reine Dokumentation, keine Änderung an Code, Konfiguration oder Vercel-Konto.

## Symptom

Auf einem Pull Request zeigt GitHub einen roten Status „Vercel“ mit dem Text:

```
Resource is limited - try again in 24 hours (more than 100, code: "api-deployments-free-per-day").
```

Beobachtet am 28.09.2026 (Quant-Release, im Kopf von `scripts/vu2/vercel-should-build.mjs` beschrieben) und am 03.11.2026 auf PR #1280 (Commit `9907bed`, 11:45 UTC, Kommentar des Vercel-Bots; ein früherer Push desselben PR um 11:15 UTC wurde von Vercel „Ignored“).

## Ursache

- Das Vercel-Projekt (`vision-universe-research`) läuft laut Meldung im **kostenlosen Tarif**. Dort gelten höchstens **100 Deployments pro Tag je Konto**. Jeder Push auf jeden Branch mit Vercel-GitHub-App kann eines verbrauchen.
- Es ist ein Kontingent des **Kontos**, kein Fehler im Code. Die Meldung sagt nichts über den Inhalt des PR.
- Vercel liefert hier nur die drei Serverless-Funktionen `api/history.js`, `api/intraday.js`, `api/status.js` und einen Platzhalter (`.vercel-public/index.html`, 197 Byte) aus. Das Frontend kommt von GitHub Pages und Cloudflare ([`scripts/vu2/vercel-should-build.mjs`](../../scripts/vu2/vercel-should-build.mjs), [`vercel.json`](../../vercel.json), [`.vercelignore`](../../.vercelignore)).
- ADR-006 hält fest: Der Vercel-Hobby-Tarif ist für **nicht kommerzielle** Nutzung gedacht. Das Projekt ist deshalb bewusst auf diese drei Funktionen begrenzt.

## Was bereits vorhanden ist

`vercel.json` setzt `"ignoreCommand": "node scripts/vu2/vercel-should-build.mjs"`. Für **Vorschauen** (nicht Produktion) bricht der Build ab, wenn der Commit keine dieser Pfade ändert: `api/`, `server/`, `vercel.json`, `.vercelignore`, `scripts/vu2/build-vercel-public.mjs`. Die Produktion baut immer. **Ist die Liste der geänderten Dateien nicht ermittelbar** (zum Beispiel in einem flachen Klon), gilt „im Zweifel bauen“, und dann kostet jeder Push ein Deployment. Der Test `quant/tests/vercel-preview-boundary.test.mjs` sichert die Richtung der Exit-Codes.

Vermutung für den 03.11.2026 (**nicht verifiziert**, das Vercel-Dashboard ist nicht lesbar): Das Tageslimit war durch viele PR-Pushes und Datenläufe schon ausgeschöpft, und der Commit von 11:45 UTC hat entweder die Zweifelsregel getroffen oder wurde gezählt, bevor er als „Ignored“ endete. Welche der beiden Möglichkeiten zutrifft, zeigt nur das Build-Log im Vercel-Dashboard.

## Wirkung

| Frage | Antwort |
|---|---|
| Blockiert der rote Status einen Merge? | **Nein.** Auf `main` gelten nur der Regelsatz „Schutz vor Verlust“ (kein Löschen, kein Force-Push) und keine erforderlichen Prüfungen (Stand 03.11.2026, per öffentlicher API gelesen; die klassische Branch-Protection ist ohne Admin-Token nicht lesbar). |
| Betrifft er Produktion? | Nein. Produktions-Deployments baut Vercel unabhängig von der Vorschau-Regel. Ob ein Tageslimit auch Produktion-Deployments blockieren würde, ist **nicht geprüft**. |
| Sagt er etwas über die Qualität? | Nein. Die Vorschau wäre ohnehin der Platzhalter. Maßgeblich sind die GitHub-Actions-Prüfungen (Core, Shell, Pages-Release, Screener, Quant). |

## Mögliche Gegenmaßnahmen (Entscheidung beim Owner, nichts davon ist umgesetzt)

1. **Nichts tun, rot ignorieren.** Das Kontingent setzt sich nach 24 Stunden zurück. Ein roter Vercel-Status ist dann kein Merge-Grund.
2. **Vorschauen im Vercel-Dashboard abschalten** (Project Settings, Git: Preview Deployments für nicht-produktive Branches deaktivieren) oder die „Ignored Build Step“-Regel um weitere Branch-Präfixe ergänzen (`claude/*`, `authoring/*`, `backup/*`). Eine Änderung an `vercel.json` oder `vercel-should-build.mjs` ist ein eigener PR mit dem Test `vercel-preview-boundary`.
3. **Tarif wechseln.** Vercel Pro hebt das Tageslimit und erlaubt kommerzielle Nutzung (ADR-006 nennt Pro ohnehin, sobald Zahlungen laufen). Kostenfrage des Owners.
4. **Vercel-GitHub-App für das Repository einschränken** (nur Produktion). Folge: keine Vorschauen mehr für PRs, aber auch kein Kontingentverbrauch.

## Einordnung für PRs

Bewertet wird ein PR an den **GitHub-Actions-Prüfungen**. Ein roter Vercel-Status mit dieser Meldung wird im PR-Text als „extern, Tageslimit“ vermerkt und nicht als Codefehler behandelt. Hat der Status eine andere Meldung, wird das Build-Log gelesen.
