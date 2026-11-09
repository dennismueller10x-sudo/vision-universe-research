# Wackelige Browser-Prüfungen

Inventur 02.11.2026 18:08 UTC bis 09.11.2026 18:08 UTC, main und Pull Requests. 31.921 Actions-Läufe, in Zeitfenster unter 1.000 Treffern zerlegt. Ein Fall zählt nur mit rotem und späterem grünem Job auf demselben Head-Commit; bei Wiederholung alle Versuche einzeln abgefragt. Fehlgeschlagene, abgebrochene und laufende Jobs sind keine positiven Belege. Maschinenlesbare Daten: [browser-qa-20261109-belege.json](browser-qa-20261109-belege.json).

| Prüfung | Rot → Grün | Commit | Befund |
|---|---|---|---|
| frontend | [42573490656, Versuch 1](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/42573490656/attempts/1) → Versuch 2 | `cb3b8fc61336` | Kapitelgedächtnis / asynchrones toggle |
| frontend | [42530363931, Versuch 1](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/42530363931/attempts/1) → Versuch 2 | `9a6bd34ef590` | Kapitelgedächtnis / asynchrones toggle |
| frontend | [42526485204, Versuch 1](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/42526485204/attempts/1) → Versuch 2 | `9df72d9447db` | Navigation / laufende Abrufe (WebKit access control) |
| Browser (Chromium und WebKit/iPhone) | [42499124087, Versuch 1](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/42499124087/attempts/1) → Versuch 2 | `57b592f95a8e` | Navigation / laufende Abrufe (WebKit access control) |
| experience | [42305103271, Versuch 2](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/42305103271/attempts/2) → Versuch 3 | `6d7baa222b0c` | WebKit verliert ursprünglichen Response-Body bei document.write |
| discover-frontend | [42609653389, Versuch 1](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/42609653389/attempts/1) → Versuch 2 | `1d1b21aac0f6` | Kapitelgedächtnis / asynchrones toggle |

## Ursachen und Änderungen

- Discover: Der Test öffnet vorher ein Kapitel. Dessen `toggle`-Handler schreibt asynchron dasselbe localStorage-Gedächtnis, das der spätere Standardtest löscht. Ein fester 50-ms-Aufschub sichert keine Reihenfolge. Die vollständige Titelprüfung läuft jetzt in einem frischen Besucher-Kontext. Sie fordert weiterhin sieben geschlossene Kapitel, drei Story-Sätze, Reihen, Preis und Herkunfts-Navigation. Zusätzlich muss ein bewusst geöffnetes Kapitel nach Reload offen bleiben. Ungefangene Fehler im frischen Kontext bleiben Fehler. Damit entfällt auch der doppelte NVDA-Navigations-/Reload-Pfad des bisherigen Resets.
- VU2 Direktlinks: `response.text()` greift nach `document.open/write/close` auf eine von WebKit bereits verworfene Netzwerkressource zu. Der QA-Server speichert jetzt exakt die an `res.end` übergebenen HTML-Bytes unter einer eindeutigen Antwort-ID. Die Browserantwort liefert diese ID; ausgewertet wird ihre tatsächliche ursprüngliche Antwort, ohne zweiten HTTP-Aufruf und ohne Ersatz-DOM. Eine Antwort ohne Maske bleibt rot. Regression mit fünf parallelen Kontexten pro Runde und Engine.
- Konto: WebKit protokollierte Abrufe nach `/v1/me` und `/v1/watchlist` beim Dokumentwechsel als Access-Control-Fehler. Vor Navigation und Kontextende werden die laufenden Abrufe des bisherigen Dokuments abgewartet. Kein Konsolenfehler wird ausgefiltert; eine nie ruhende Seite scheitert am Browser-Timeout. Die fünf vollständigen Wiederholungen sind noch in Arbeit.

Für Service Worker oder Cache als Ursache fehlt in diesen Logs ein eigener Beleg; sie werden nicht vorsorglich deaktiviert. Keine Prüfung wird übersprungen. Kein Workflow, Produktcode, core/registry oder Company Intelligence geändert.

## Abgrenzung

`shell-shell` zeigte auf den gesichteten heutigen Branches ein veraltetes Produktraster und Icons; VU2 erwartete noch unmittelbare Magazin-/Report-Links statt der Insights-Kachel. Diese Fehler sind nicht als Rot→Grün auf demselben Commit bestätigt und werden nicht zu Flakes umgedeutet. Die drei grünen Wiederholungen von CI-Lauf 42575603979 hatten in den Jobdaten bereits durchgehend grüne Discover-Frontend-Jobs und zählen nicht als zusätzlicher roter Fall.

## Wiederholungen

Titelprüfung: fünf aufeinanderfolgende Erfolge je Engine (Chromium und WebKit), inklusive unveränderter Anforderungen und Persistenz-Gegenprobe. Exakte Zeiten im JSON-Beleg. Direkte Maskenprüfung: `node --test scripts/quality/tests/delivered-document.browser.test.mjs`, fünf Runden je Engine, je fünf gleichzeitige Kontexte; geschützte und ungeschützte Antwort gegengeprüft. Konto-Gesamtreisen und vollständige Release-Suiten: noch laufend, kein vollständiges grünes Ergebnis behauptet.

Keine geänderte Prüfdatei steht in der wirksamen UI-Byte-Sperre (Basis plus Revisionen); deshalb ist keine UI-Schutz-Revision erforderlich. Bericht wird von den geänderten Prüfungen als Beleg referenziert.
