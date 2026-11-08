# Vorab-Protokoll: Lückenbewusster Forschungs-Backtest Deutschland (E9 Weg 6, Pilot)

**Status: EINGEFROREN VOR DEM LAUF (07.11.2026).** Das Pilotskript `scripts/research/europe-gap-aware/pilot.mjs` prüft den SHA-256 dieser Datei und verweigert sonst den Lauf. Genau ein Lauf; keine Parametersuche, keine Wiederholung mit geänderten Regeln. Forschung, nicht zertifiziert. Herleitung: [E9-Bericht §6](../../reports/europe-gap-solutions-20261107/README.md).

## Frage

Läuft ein Backtest auf lückenhaften europäischen Reihen technisch ehrlich durch, wenn Lücken als „Ausführung nicht belegt“ behandelt werden – und wie viele Trades und zensierte Episoden entstehen dabei? Rendite und Benchmarkvergleich sind Nebenergebnis und gehen nur versiegelt an den Owner.

## Daten (nur Vorhandenes, kein Anbieterabruf)

- Kurse: veröffentlichte Discover-Reihen `discover/data/europe/series-long/<securityId>.json` (Marketstack, Schlusskurs `RAW_UNADJUSTED`, EUR). Nur Schlusskurse; Eröffnung, Hoch, Tief und Volumen liegen nicht vor.
- Kalender und Lücken: `docs/reports/europe-continuity-449-20261012/` (Gap-Inventar und geprüfter Kalender, Stand bis 09.10.2026). Erwartete Sessions = Kalendertage im Anzeigefenster minus geprüfte Schließtage. Beobachtet = Schlusskurs in der Reihe an einer erwarteten Session.
- Identitätsstatus: `catalogIdentity` aus `docs/reports/europe-marketstack-support-report-20261103/europe_gap_impact_report.json`.
- Es wird nichts interpoliert, nichts aufgefüllt, keine Kurse werden committet.

## Kandidatenuniversum

XETR-Titel mit `catalogIdentity = VERIFIED`, die in mindestens einem vollen Kalenderjahr 2011–2025 die E9-Jahresregel erfüllen (ganzes Jahr im Anzeigefenster, ≥ 200 beobachtete Sessions, ≥ 98 % Abdeckung, kein Identitäts-Bruchintervall im Jahr). Erwartet: **149 Titel**; das Skript bricht bei Abweichung ab. Diese Liste nutzt heutiges Wissen (Survivorship, heutige Identität, Jahresabdeckung) und ist nur der **Kandidatenkreis**; sie wird im Ergebnis als Auswahlverzerrung ausgewiesen.

## Zulassung je Tag (nur bis dahin bekannte Daten)

Ein Titel ist am Entscheidungstag t zugelassen, wenn (a) t beobachtet ist, (b) die 200 unmittelbar vorhergehenden erwarteten Sessions alle beobachtet sind und (c) von den letzten 252 erwarteten Sessions bis einschließlich t mindestens 98 % beobachtet sind. Spätere Abdeckung spielt keine Rolle. Entscheidungsfenster 01.01.2011–31.12.2025; Daten vor 2011 nur zum Aufwärmen.

## Lückenregeln

1. Eine Lücke (erwartete, nicht beobachtete Session) bedeutet: **keine Ausführung belegt**. An Lückentagen wird nichts gekauft oder verkauft, keine Order gilt als ausgeführt.
2. Indikatoren werden nach jeder Lücke neu aufgebaut: Jede Strategie läuft getrennt je zusammenhängendem Abschnitt beobachteter Sessions; es gibt keinen Zustand über eine Lücke hinweg.
3. Eine offene Position, deren Abschnitt an einer Lücke endet, wird **zensiert**: nicht zum letzten Kurs glattgestellt, keine Nullrendite unterstellt. Ihr Ergebnis bis zur letzten gesicherten Beobachtung wird getrennt geführt und nie mit abgeschlossenen Trades vermischt. Gleiches gilt für Positionen, die am Studienende (31.12.2025) offen sind (eigene Kategorie „Studienende“).
4. Eine bestätigte, aber an einer Lücke nicht ausführbare Einstiegs- oder Ausstiegsorder wird als „nicht ausgeführt“ gezählt.
5. Kein Look-ahead: Es wird nie vor einer erst später sichtbaren Lücke liquidiert; Zulassung und Signale lesen nur Sessions bis t.

## Strategie T1: Donchian/Turtle 1.1.0 (Supertrader, unverändert)

`scripts/supertrader/engine/strategies/donchian.mjs` (Version 1.1.0, Tagesvariante mit Schlusskurs-Bestätigung) über den unveränderten Simulator `scripts/supertrader/engine/simulator.mjs` und `computeIndicators`. 1.1.0 statt 2.0.0, weil 2.0.0 einen Kauf-Stop im Tagesverlauf (Tageshoch) braucht, der ohne Hoch/Tief nicht belegbar ist.

Datenbedingte Abbildung, kein Regelwechsel (in einem Satz je Punkt, Owner-Lesart nach CLAUDE.md von Claude entschieden):
- Nur Schlusskurse: Eröffnung, Hoch und Tief jeder Session werden gleich dem Schlusskurs gesetzt. Damit wird die „nächste Eröffnung“ zum nächsten beobachteten Schlusskurs, Kanäle und N (20-Tage-Mittel der True Range) beruhen auf Schlusskursen, und ein Stop gilt erst bei Schluss auf oder unter dem Stop (Ausführung zum Schlusskurs).
- DON-LIQ-VU: Dollar-Volumen und Tagesspanne (ADR) sind ohne Volumen und Hoch/Tief nicht auswertbar und werden als erfüllt gesetzt; Mindestkurs 10 EUR und Kanalbreite ≥ 2 % bleiben aktiv.
- Kosten wie im Simulator (10 bp Slippage je Seite, 1 bp Kommission je Seite).
- Portfolio: `runPortfolio` mit `PORTFOLIO_DEFAULTS` (Standard-Portfolio wie bei 1.1.0), nur über abgeschlossene Trades; zensierte Episoden sind ausgeschlossen und werden gezählt.

## Strategie Q1: 12-1-Momentum, oberes Quintil (Quant-nah, einfache Regel)

Definition wie `quant/engines/factors.js` (`momentum12m1m` = Kurs vor 21 Sessions / Kurs vor 252 Sessions − 1), hier auf Rohschlusskursen (keine Dividenden-/Split-Anpassung verfügbar – Datenbeschränkung). Am ersten XETR-Handelstag jedes Monats: zugelassene Titel mit 253 zusammenhängend beobachteten Sessions bis t ranken; oberes Quintil (`ceil(n/5)`), gleichgewichtet. Einstieg zum Schlusskurs der nächsten Session, Ausstieg zum Schlusskurs der Session nach dem nächsten Rebalancing-Termin; jede Session dazwischen muss beobachtet sein, sonst Zensur nach Regel 3. Kosten 22 bp je Episode (Ein- und Ausstieg, je 10 bp Slippage + 1 bp Kommission). Periodenrendite = Mittel der abgeschlossenen Episoden.

## Benchmark

Kein DAX-Index und kein DAX-ETF ist in den vorhandenen Daten (Europa-Katalog: 449 Aktien; Tiingo-/US-Daten ohne DAX) – kein neuer Anbieter. Daher **gleichgewichtetes Universum**: dieselbe Episodenlogik wie Q1 über alle Titel, die am Termin die Q1-Zulassung erfüllen.

## Ausgaben

- Öffentlich (`runs/pilot-public.json`): nur Zählungen (Titel, zugelassene Titeljahre, Segmente, Trades, zensierte Episoden je Grund, nicht ausgeführte Orders, Perioden, Episoden), Hashes der Eingaben, Protokoll-SHA und Protokoll-Commit. **Keine Rendite, keine Kennzahl, kein Kurs.**
- Versiegelt für den Owner (`runs/pilot.sealed.json`, Schlüssel `scripts/supertrader/validation/results-public-key.pem`): Trade- und Periodenstatistik, Portfolio- und Benchmarkkennzahlen je Jahr, Ergebnis zensierter Episoden bis zur letzten Beobachtung (getrennt), Anzahl Trades über einem Tagessprung > 60 % (mögliche ungeklärte Kapitalmaßnahme).
- Öffentliche Bezeichnung: „Forschung, nicht zertifiziert“. Keine öffentliche Aussage über Rendite oder Vorteil gegenüber einer Benchmark.
