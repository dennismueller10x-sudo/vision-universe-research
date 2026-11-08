# Redesign 2027 – Vorlage für den Umbau des Frontends

Freigegebene Design-Vorlage (Owner, 04.11.2026) für research.visionuniverse.de. Ziel: **1:1-Umsetzung** der Mockups.
Präsentation online (privat): https://claude.ai/artifact/7YtPmpjWAA7TReZdhvVgYe

## Inhalt

| Datei | Zweck |
|---|---|
| `HANDOVER.md` | Bauplan jeder Seite als Text: Kennung (z. B. `Q07`), Adresse heute/neu, Aufbau von oben nach unten, Bausteine C01–C20, Datenquelle, was entfällt. **Hauptquelle für die Umsetzung.** |
| `index.html` | Die Präsentation. Lokal ansehen: `cd docs/design/redesign-2027 && python3 -m http.server 8090`, dann `http://localhost:8090/`. |
| `worlds/*.js` | Die Mockups je Welt als HTML/CSS (Screens `screen(id, …)`, Folien `slide({id, …})`). Maße in px auf 390 × 844. Für 1:1 hier Abstände, Schriftgrößen und Reihenfolge ablesen. |
| `lib.js` | Bausteine der Mockups (Chart, Urteil, Kursbewegung, Kopfzeile, Produkt-Leiste `DOCKS`, Aktienkopf `STOCK`, Perspektiven-Leiste). Referenz für die echten Komponenten. |
| `index.html` `<style>` | Tokens und Klassen der Mockups (`--lime #c8f531`, Graustufen, `.card`, `.chg`, `.vd`, `.dock` …). |
| `now/<ID>.jpg` | Heutige Seite als iPhone-Aufnahme (390 px breit, ganze Länge), Stand 02.11.2026. |
| `BAUKASTEN.md` | Gestaltungsregeln und Baustein-Liste, nach denen die Mockups gebaut wurden. |
| `tools/check.js` | Lädt die Präsentation in Chromium und meldet Fehler (`node tools/check.js docs/design/redesign-2027`). |

Die Präsentation ist **keine Produktivseite**: `docs/` wird nicht ausgeliefert. Nichts hier ändert Daten, Engines oder Gates.

## Grundregeln (aus Folie A3 und Ü3)

1. Nur Weiß, Schwarz, Neongrün `#c8f531`, dazu drei Graustufen. Plus = neongrüne Pille, Minus = schwarze Pille. Kein Rot/Grün.
2. Ein Chart überall (C06): schwarze Linie, neongrüne Fläche, Zeitleiste 1T · 1W · 1M · 1J · 5J · Max. Kerzen nur im Chart Studio (PRO).
3. Ein Urteil überall (C08): Stark · Mittel · Schwach · Keine Aussage.
4. Jede Fachkennzahl mit Erklärung „?“ (C09).
5. Navigation: Kopfzeile oben (Welt links; Suche, Atlas, Profil rechts), Produkt-Leiste je Welt unten mit 5 Plätzen (`DOCKS` in `lib.js`), Menü als Vollbild für den Wechsel zwischen Welten.
6. Eine gemeinsame Aktienseite: Aktienkopf (C04) + Perspektiven-Leiste (C05) statt 9er-Icon-Leiste „Analysewelten“. Ein Preis in allen Welten (ADR-002). Herkunftswelt bestimmt aktive Perspektive und Leiste.
7. Keine erfundenen Zahlen; fehlt etwas, sagt die Seite es.

## Umsetzung in Schritten (je Schritt ein eigener PR, neuer Chat je Schritt)

| Schritt | Folien | Hinweise |
|---|---|---|
| 1 Fundament und Bausteine | A3, C | Tokens + C01–C20 als gemeinsame Komponenten unter `assets/`, der eine Chart als einzige Chart-Komponente |
| 2 Navigation | N1–N3 | `assets/site-navigation.js/.css`: Kopfzeile, Produkt-Leiste je Welt, Menü |
| 3 Gemeinsame Aktienseite | N4–N5, D09, Q07, T06, F06, W05, ST08, H07 | je Welt ein PR; Supertrader nur mit Supertrader-Pfaden (Gate A) |
| 4 Welten | Kapitel 02–10 | Discover-Budget ≤ 180.000 Byte / ≤ 12 Requests; eine Welt pro PR |
| 5 Einstieg und Konto | Kapitel 01 | Konten bleiben ausgeschaltet bis zur Freigabe (`docs/accounts/FREIGABEN.md`) |
| 6 Dunkel und Feinschliff | alle | Browser-QA 390 × 844, Chromium und WebKit |

### Backend-Zusätze (eigene PRs, Owner-Freigabe)

Im Design sichtbar, heute nicht vorhanden: Einsteiger/Fortgeschritten/Profi-Modus und Ziel aus dem ersten Start (Konto-Einstellung), gespeicherte Suchen im Konto, Benachrichtigungen (Kursgrenze, Quartalszahlen, Setups), gemeinsame Aktienadresse `/aktie/<T>` mit Weiterleitungen, Screener-Kriterien aus 13F und Supertrader, Datenquelle für Insider-Käufe. Bis dahin zeigen die Seiten diese Teile als „bald“ oder blenden sie aus, nie mit erfundenen Werten.

### Offene Owner-Entscheidungen

Pro-Preis (Bestellseite 1,00 €/Monat vs. Preisseite „derzeit nicht verfügbar“) · neue Adressen (`/aktie/NVDA`, `/discover/#/swipen`, `/fundamental/#/ranglisten`, `/technical/#/muster`) · Wortwahl der Urteile „Schwacher Markt“ (34 % über 200-Tage-Linie) und „Mittel“ für den NVDA-Chart · Zählweise Backtests „0 von 9“ vs. „0 von 13“.

## Startprompt Schritt 1 (in einem neuen Claude-Code-Chat einfügen)

```
Wir setzen das freigegebene Redesign von research.visionuniverse.de 1:1 um.
Die Vorlage liegt in docs/design/redesign-2027/ (Branch claude/redesign-handover, falls noch nicht gemergt).
Lies zuerst CLAUDE.md, docs/design/redesign-2027/README.md und HANDOVER.md.

Heute ist Schritt 1: Fundament und Bausteine (Folien A3 und C in HANDOVER.md).
- Lege die Design-Tokens (Weiß, Schwarz, #c8f531, drei Graustufen, Schrift Inter, Abstände, Radien) und die Bausteine C01–C20 als gemeinsame Komponenten unter assets/ an, hell und dunkel.
- Maße, Farben und Aufbau 1:1 aus docs/design/redesign-2027/lib.js und dem <style> in docs/design/redesign-2027/index.html übernehmen.
- Der Chart C06 wird die einzige Chart-Komponente (schwarze Linie, neongrüne Fläche, Endpunkt, Zeitleiste 1T·1W·1M·1J·5J·Max); bestehende Charts noch nicht umbauen, nur bereitstellen.
- Baue eine Musterseite (nicht ausgeliefert oder hinter /status/), die alle Bausteine zeigt, und vergleiche sie im Browser auf 390 × 844 mit Folie C der Präsentation.
- Keine Fachmodelle, keine Daten-Artefakte, keine Gates ändern. Tests aus CLAUDE.md laufen lassen.
- Ein eigener Branch und PR nur für diesen Schritt. Am Ende: was fertig ist, Screenshot-Vergleich, offene Punkte.
```

Für die folgenden Schritte denselben Prompt nehmen und nur die Zeile „Heute ist Schritt …“ mit Folien und Hinweisen aus der Tabelle oben ersetzen, z. B. „Heute ist Schritt 4: Welt Quant, Folien Q00–Q09 in HANDOVER.md, Mockups in worlds/03-quant.js“.

## Master-Prompt: alles in einem Durchlauf (Owner-Wunsch 04.11.2026)

Der Owner möchte, dass das ganze Redesign in einem Auftrag umgesetzt wird, ohne Zwischenstopps und Rückfragen. Diesen Text in einen neuen Claude-Code-Chat einfügen:

```
Setze das freigegebene Redesign von research.visionuniverse.de vollständig und 1:1 um, alle Schritte in einem Durchlauf.
Vorlage: docs/design/redesign-2027/ (README.md, HANDOVER.md, Mockups in worlds/*.js, lib.js, index.html).
Lies zuerst CLAUDE.md, README.md und HANDOVER.md.

Arbeitsweise:
- Arbeite autonom alle Schritte der Tabelle „Umsetzung in Schritten“ ab, danach die Backend-Zusätze. Stelle keine Rückfragen und warte nicht auf Freigaben zwischen den Schritten.
- Für offene Entscheidungen gelten diese Vorgaben: Pro-Preis immer aus /v1/plans anzeigen, nichts fest eintragen; neue Adressen wie im Bauplan einführen, alte Adressen leiten weiter; Urteile und Wortwahl wie in den Mockups; Backtests als „0 von 9 Regelversionen“.
- Gates und Budgets aus CLAUDE.md gelten unverändert. Wo ein Gate Pfade trennt, teile die Arbeit selbstständig in getrennte Branches und Pull Requests auf (z. B. Supertrader, Discover, Company Intelligence einzeln). Das ist kein Grund anzuhalten.
- Baue die PRs aufeinander auf (jeder neue Branch startet auf dem vorherigen) und mache sofort mit dem nächsten Schritt weiter, ohne auf Merges zu warten. Öffne jeden PR mit Folien-IDs, Vorher/Nachher-Screenshots auf 390 × 844 und Testergebnissen.
- Keine Fachmodelle, Scores, Rankings oder generierten Daten-Artefakte ändern. Konten, Stripe und Brevo bleiben so geschaltet, wie sie sind; neue Konto-Funktionen bauen und testen, aber keine Produktionsfreigabe umschalten (docs/accounts/FREIGABEN.md).
- Führe eine Fortschrittsliste in docs/design/redesign-2027/PROGRESS.md (je Folien-ID: offen, in Arbeit, fertig, PR-Nummer, Abweichung). Wenn der Chat neu startet oder der Kontext zusammengefasst wird, mach dort weiter.
- Prüfe jede Seite im Browser (Chromium und WebKit, 390 × 844) gegen das Mockup und die Abnahmekriterien (Folie Ü3). Behebe Abweichungen selbst.
- Halte nur an, wenn etwas technisch unmöglich ist (z. B. fehlender Zugang). Dann notiere es in PROGRESS.md, überspringe es und mach mit dem Rest weiter.
- Am Ende: Liste aller PRs, Stand je Folien-ID, offene Punkte.
```
