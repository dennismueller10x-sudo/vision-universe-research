# Technical – Analyse-Assistent (Master Completion 3.0, T1–T3)

Stand 02.11.2026 · `technical-assistant-1.0.0` · Datenstand 30.10.2026 (5.663 Titel)

Auftrag „Master Product Completion 3.0“, Teil Technical: Ein neuer Nutzer soll ohne tiefes Indikatorwissen eine technische Analyse auswählen, durchführen, nachvollziehen und ihre Grenzen verstehen. Dieses Dokument beschreibt Konzept (T1), Umsetzung (T2), Prüfung (T3) und die übernommenen Betriebsprüfungen aus [TECHNICAL_COMPLETION_2_0.md](TECHNICAL_COMPLETION_2_0.md).

**Leitplanken (eingehalten):**
- Keine Änderung an Fachmodellen, Feldern, Vorlagen oder Daten. Kein neues Artefakt, keine Änderung an `technical/data`.
- Keine zweite Berechnungslogik: Der Assistent setzt nur vorhandene Filter zusammen.
- Keine Trefferquoten, keine Renditen, keine Kaufempfehlungen.
- Keine globale Neugestaltung: Der Assistent ist eine zusätzliche Ansicht innerhalb von Technical (`#/assistent`).

## T1 – Strategie- und Anwendungsbibliothek

### Vier Ebenen, für jedes Ziel getrennt ausgewiesen

| Ebene | Bedeutung | Quelle im Produkt |
|---|---|---|
| Allgemein erklärte Methodik | wie der Ansatz üblicherweise verstanden wird; Beschreibung, keine Aussage | `GOALS[].method` |
| Messbare Suchkriterien | eindeutige Filter aus `technical-query.js`, im Chart Studio nachprüfbar | `GOALS[].options` |
| Historisch untersuchte Beobachtung | Verweis auf vorhandene Auswertungen mit ihrer Einstufung; **keine neue Zahl** | `GOALS[].evidence` → `signal-evidence.json`, `formation-evidence.json`, S4 |
| Statistisch nachgewiesener Vorteil | **für kein Ziel nachgewiesen** | `EDGE_TEXT` |

Der Test „Evidenz-Verweise existieren …“ prüft jeden Verweis gegen die Artefakte. Wird eine verwiesene Indikatorzeile künftig als `WITH_DIRECTION` eingestuft, schlägt er fehl. Dann muss der Text neu geprüft werden.

### Acht Analyseziele aus den 13 Vorlagen

| Ziel | Frage | Vorgeschlagene Kriterien (Voreinstellung fett) | zusätzlich wählbar | verwandte Vorlagen | historisch untersucht |
|---|---|---|---|---|---|
| Trendfolge | intakter Aufwärtstrend? | **Kurs > SMA 50, Kurs > SMA 200, SMA 50 > SMA 200, ADX > 25** | SMA 200 steigt, Aufwärtsstruktur, RS-Rang ≥ 70 | Trendfolge, Aufwärtstrend vereinfacht, Etablierter Aufwärtstrend | S4 (3 Wochen-Näherungen): ab 2016 kein Überschuss ggü. SPY; ADX-Vorlage nicht testbar |
| Ausbruch | Widerstand/Range per Schluss überwunden? | **bestätigter Ausbruch (Widerstand, Range), relatives Volumen ≥ 1,5** | Schluss > 20-Tage-Hoch, Dreieck nach oben, Kurs > SMA 200 | Breakout, Dreieck mit Ausbruch nach oben, 52-Wochen-Hochs | Formations-Evidenz (≈ 1 Jahr, beschreibend), Donchian: kein gesicherter Unterschied |
| Momentum | stärker als der Markt? | **RS-Rang ≥ 80, ROC 63 > 0, MACD-Histogramm > 0** | RSI < 70, Kurs > SMA 50 | Etablierter Aufwärtstrend, 52-Wochen-Hochs | S4: ab 2016 kein Überschuss; MACD-Kreuzung: kein gesicherter Unterschied |
| Trendwende | erste Hinweise nach einem Rückgang? | **über SMA 200 gekreuzt (≤ 10 Tage), MACD-Histogramm > 0** | Umkehrformation nach oben, RSI-Austritt aus < 30, bullische Kerze | Über SMA 200 | Kreuzung SMA 200, RSI-Austritt, Golden Cross: kein gesicherter Unterschied |
| Volatilität und Konsolidierung | ungewöhnlich ruhig? | **Bollinger-Enge, Kurs > SMA 200** | Volatilitätskontraktion, NR7, Inside Bar, Choppiness > 61,8 | Volatilitätskontraktion, Dreieck im Aufwärtstrend, Flaggen | Formations-Evidenz (beschreibend) |
| Unterstützung und Widerstand | nahe an wichtigen Marken? | **≤ 5 % unter 52-W-Hoch, Kurs > SMA 200** | Seitwärtsrange, steigende Unterstützungslinie | 52-W-Hochs, 200-W-Hochs, Breakout | S4 (52/200-W-Hochs): ab 2016 kein Überschuss |
| Bestätigung über Zeitrahmen | Tag, Woche, Monat einig? | **über SMA 200 / 40-W-Linie / 10-M-Linie** | MACD Tag, MACD Woche | Über SMA 200, 200-W-Hochs | S4 (Wochenregel); Kombination nicht gesondert untersucht |
| Kriterien kombinieren | eigene Kombination | **Kurs > SMA 200** | RS-Rang, offenes Dreieck, Volumen, Bollinger-Enge, ADX | Dreieck im Aufwärtstrend, Aufwärtstrend vereinfacht | nicht untersucht |

Alle 13 Vorlagen bleiben unverändert und erreichbar. Jede Vorlage ist mindestens einem Ziel zugeordnet: Trendfolge, Etablierter Aufwärtstrend, Aufwärtstrend vereinfacht, Über SMA 200, Breakout, Dreieck mit Ausbruch nach oben, 52-Wochen-Hochs, 200-Wochen-Hochs, Volatilitätskontraktion, Dreieck im Aufwärtstrend und Flaggen direkt. Dreieck in Bildung und Dreiecksformationen sind über die Bausteine „offenes Dreieck“ und „Dreieck nach oben“ abgedeckt.

21 Begriffe werden beim jeweils ersten Kriterium erklärt (`TERMS`), z. B. SMA, ADX, RS-Rang, Ausbruch, relatives Volumen, Bollinger-Enge und Zeitrahmen.

## T2 – Geführte Strategieanwendung

**Ansichten:** `#/assistent` (Auswahl) und `#/assistent/<ziel>[?k=<Kriterien>][&zeige=fast|offen]`. Neuer Reiter „Assistent“ und Einstieg „Analyse starten“ auf der Startseite.

| Schritt des Auftrags | Umsetzung |
|---|---|
| 1. Analyseziel wählen | 8 Karten mit Frage in Alltagssprache |
| 2. Zweck erklären | „Zweck“ und aufklappbar „Wie diese Analyse üblicherweise verstanden wird“ |
| 3. Indikatoren und Filter vorschlagen | Kriterien mit Voreinstellung und Begründung, an/aus per Kontrollkästchen; Begriff beim ersten Vorkommen |
| 4. Abfrage sichtbar und bearbeitbar | „So sucht der Screener“ (`Q.describe`) und „Im Screener bearbeiten“ (`#/screener?z=<ziel>&k=…`, dieselben Filter im Baukasten) |
| 5. Screener liefert Ergebnisse | `templates.js#evaluate`: Erfüllt / Fast erfüllt / Unvollständig, Trichter je Kriterium |
| 6. erfüllt, nicht erfüllt, unbekannt | ✓ / ✗ / ? je Kriterium und Treffer, „Nicht erfüllt: …“, „Unbekannt: …“; unbekannt zählt nie als erfüllt |
| 7. Chart Studio zeigt die Daten | Treffer öffnet `#/chart/<T>?z=<ziel>&k=…`: Prüfleiste mit Werten je Kriterium und passende Schichten bzw. Unterfenster (`FIELD_CHART`) |
| 8. Grenzen erklären | „Was die Analyse sagt – und was nicht“: vier Ebenen, Grenzen, Link zur Methodik, verwandte Vorlagen |

**Eine Rechnung:**
- `technical/engine/assistant.js` (UMD) baut aus Ziel und Auswahl eine Vorlage im Format von `templates.js`.
- Ausgewertet wird ausschließlich mit `templates.js#evaluate`/`#checklist` auf `technical-query.js#predicate`.
- Wie bei jeder Vorlage gilt die Voraussetzung „aktueller Kurs“ (`fresh`).
- Die Trefferkarte (`checklistHit`) ist aus der Vorlagenansicht herausgelöst und wird von beiden Ansichten genutzt.
- Die Prüfleiste im Chart Studio löst `?v=` (Vorlage) und `?z=` (Analyseziel) über `panelSource` auf.

**Geänderte Dateien:**
- neu: `technical/engine/assistant.js`, `technical/tests/technical-assistant.test.mjs`;
- geändert: `technical/app.js` (Ansicht, Reiter, Startseite, Screener `z=`, Prüfleiste), `technical/engine/model.js` (Route `assistent`), `technical/index.html` (Skript), `technical/technical.css` (Abschnitt „Analyse-Assistent“), `scripts/technical/world/browser-qa.mjs` (Prüfung „Assistent“).

**Trefferzahlen mit Voreinstellung** (Stand 30.10., 5.344 aktuelle Titel, 319 ohne aktuellen Kurs nicht eingeordnet):

| Ziel | Kriterien | Erfüllt | Fast erfüllt |
|---|---|---|---|
| Trendfolge | 4 | 517 | 863 |
| Ausbruch | 2 | 218 | – |
| Momentum | 3 | 547 | 1.019 |
| Trendwende | 2 | 552 | – |
| Volatilität und Konsolidierung | 2 | 360 | – |
| Unterstützung und Widerstand | 2 | 508 | – |
| Bestätigung über Zeitrahmen | 3 | 1.886 | 51 |
| Kriterien kombinieren | 1 | 1.931 | – |

„Fast erfüllt“ erscheint wie bei den Vorlagen erst ab 3 Kriterien.

## T3 – Nutzbarkeit und Fachqualität

| Prüfung | Ergebnis |
|---|---|
| `node --test technical/tests/technical-assistant.test.mjs` | 6/6: Definitionen, Sprachprüfung (Kauf/Rendite/Trefferquote/Namen/Prognose), **Einordnung = Abfrage-Engine** (für jedes Ziel mit Voreinstellung, allen Kriterien und einem Kriterium: Screener-Trefferzahl = „Erfüllt“, jeder Zustand = Prädikat), Adressen, Evidenz-Verweise gegen die Artefakte, Laufzeit (alle 8 Ziele < 150 ms) |
| `node --test "technical/tests/*.test.mjs"` | 67/67 |
| `node --test "core/tests/*.test.mjs"` | 308/308 |
| Browser-QA `scripts/technical/world/browser-qa.mjs` (360/390/1280 px, hell/dunkel) | 66/66. Neue Prüfung „Assistent“: Auswahl, Schritte 2–6, vier Ebenen mit „Nicht nachgewiesen“, Begriff aufklappen, Kriterium an → Adresse und Treffer ändern sich, Screener-Trefferzahl = Assistent, Treffer → Chart Studio mit Prüfleiste, leere Auswahl und unbekanntes Ziel mit verständlichem Zustand, kein horizontales Scrollen, keine Konsolenfehler |
| Sichtprüfung iPhone-Breite 390 px, hell und dunkel | lokal per Screenshot geprüft: Kontrollkästchen und Begriffe mit ≥ 44 px Zielfläche, kein Textüberlauf, Begriffe nur beim ersten Vorkommen |
| DQ-TW-1..8 | PASS (lokal, Datenstand 30.10.) |

**Sprache:**
- Historische Aussagen stehen nur in der Ebene „Historisch untersucht“, in der Vergangenheitsform und mit Einstufung.
- Jede Grenze ist ausgeschrieben, unter anderem „sagt nichts über künftige Kurse“ und „Mehr Kriterien bedeuten weniger Treffer, nicht automatisch bessere“.

## Übernommene Betriebsprüfungen aus Completion 2.0

| Punkt | Nachweis 02.11.2026 | Status |
|---|---|---|
| B1 Nachtlauf ohne Handeingriff | Automatischer Lauf `c307119` (01.11., 19:53 UTC, vision-universe-bot), Stichtag 30.10. = letzte abgeschlossene Sitzung. Der Lauf vom 31.10. schrieb nicht, weil der Datenvertrag Choppiness > 100 ablehnte; behoben mit `e8e4038` (Vertrag 1.2.1). DQ-TW-1..8 PASS. | ✔ |
| B2 GIBO-Bereinigung in der Pipeline | GIBO am Stichtag 30.10.: keine Kurssprung-Kennzeichnung mehr (`suspectJumpAt` leer), `rs6m` 1,58 statt 55,27 vorher. „Etablierter Aufwärtstrend“: 7/8, fast erfüllt, nicht erfüllt wie im Vorher/Nachher erwartet. | ✔ |
| K3 Mobile Performance live | Live-Messung über `technical-live-qa.yml` nach dem nächsten Deploy | offen (Lauf, kein Code) |
| GRAL, AGIO u. a. Verdachtsfälle | Belege der Marktdaten-Domäne | offen (Marktdaten-Domäne) |
| Lange Wochen-OHLC, KI-Suche, S4 als Produktaussage | Owner-Entscheidungen (Completion 2.0 §G) | blockiert, unverändert |

## Grenzen und offene Punkte

- Ein Analyseziel ist keine gespeicherte Strategie. Speichern geht über „Im Screener bearbeiten“ und dort „Speichern“ (bestehender Weg).
- Die Texte der Ziele und Begriffe sind Produktsprache. Vor einer öffentlichen Hervorhebung, etwa als Startseiten-Hero, sollte der Owner sie lesen. Der Assistent selbst erweitert nur die Navigation innerhalb von Technical.
- Historische Prüfungen gibt es nur für die fünf S4-Wochen-Näherungen; Formations-, Ausbruchs- und ADX-Vorlagen brauchen die Tages-OHLC-Historie (Completion 2.0 §G).
