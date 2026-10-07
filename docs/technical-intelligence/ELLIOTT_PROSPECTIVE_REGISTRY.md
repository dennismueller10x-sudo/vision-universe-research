# Elliott Prospective Registry

Stand: 07.10.2026 (Mission X).

* Code: `scripts/technical/elliott-registry/` (`register.mjs`, `ledger.mjs`, `verify.mjs`, `evaluate-registry.mjs`).
* Daten: `quant/data/technical-intelligence/elliott-registry/`.
* Workflow: `.github/workflows/elliott-prospective-registry.yml`.

## Zweck

Alle historischen Wochendaten sind verbraucht. Ob ein Setup der Library V1 echten Wert hat, kann nur eine **Vorab-Aufzeichnung** zeigen: Ab jetzt wird jedes qualifizierende Setup in der Woche eingefroren, in der es erscheint, ohne Zukunftswissen. Ausgewertet wird erst, wenn der jeweilige Horizont abgelaufen ist.

## Ablauf je Lauf (eine abgeschlossene ISO-Woche)

1. **Woche W\*:**
   * letzte ISO-Woche, deren Freitag *vor* dem Stichtag liegt;
   * je Reihe muss der Datenstand den Freitag abdecken, sonst wird der Titel übersprungen;
   * jede Reihe wird **vor** der Analyse auf W\* gekürzt.
2. **Je Titel:** eingefrorene Engine (`elliott-3.2.2` / `ti-scenario-1.2.1`):
   * Elliott-Primärzählung mit Projektionszonen, Alternative, höherem Grad, Anwendbarkeit;
   * Marktstruktur (STRUCTURE-Stimme der Swing-Struktur);
   * einfacher Trend (40-Wochen-Durchschnitt, Steigung 4 Wochen);
   * RS26-Rang im Querschnitt aller Titel der Woche;
   * Setup-Klassifikation mit **derselben** Funktion wie die Historie (`setup-library.mjs`);
   * Forschungskohorte über die ausgabeneutralen Forensik-Haken.
3. **SNAPSHOT** aller analysierten Titel (`snapshots/<Freitag>.jsonl.gz`):
   * Felder: Kurs, ATR, Trend, RS26-Rang, Marktstruktur, Elliott-Zustand, Setup-Status, Forschungs-Flag, Daten-Hash;
   * das ist die **zeitgleiche Kontrollkohorte**: Für jedes Ereignis lässt sich später dieselbe Woche ohne das Setup vergleichen (alle, gleicher Trend, gleicher RS-Status, Trend × RS, Marktstruktur);
   * ein Snapshot wird nie überschrieben.
4. **EVENT** für jedes *neu* qualifizierte Setup (Titel × Setup × Elliott-Zählung). Kohorten:
   * `PRODUCT_SETUP`: angezeigt;
   * `ENGINE_PRIMARY_UNDISPLAYED`: Primärzählung, aber enthalten;
   * `RESEARCH_ONLY_INTERNAL_WAVE3`: interne Kandidaten, nie im Produkt.
5. **REVISION** für offene Ereignisse, aus den Wochenschlüssen nach der Registrierung:

   | Revision | Bedeutung |
   |---|---|
   | CONFIRMED | Bestätigungsniveau überschritten |
   | INVALIDATED | Schluss jenseits der Invalidation (beendet die Verfolgung) |
   | TARGET_REACHED | primäre Projektionszone erreicht |
   | EXTENDED_PROJECTION_REACHED | erweiterte Projektionszone erreicht |
   | RELABELED | die Primärzählung des Titels hat einen anderen Schlüssel |
   | EXPIRED | nach 156 Wochen |

   Jede Revision trägt das tatsächliche Bar-Datum.

## Inhalt eines EVENT (unveränderlich)

* Zeitstempel (`recordedAt`, Registrierungswoche, Bar-Datum), Titel, Kurs, ATR, Zeitebene (1W);
* Setup-Typ, Setup-Version und Spec-Hash;
* Elliott-Version, Primärzählung mit Wellenpreisen, Alternative, Grad, höherer Grad, Anwendbarkeit;
* Invalidation, Bestätigungsniveau samt Status, Projektionszonen (primär, erweitert, Basis), Geometrie in ATR;
* Trend, RS26 (Rang, Top/Bottom 20 %), Marktstruktur, Volumen („NOT_AVAILABLE“: Wochenreihen ohne Volumen);
* Varianten (PURE, PURE_RS, CONFIRMED, PURE_HD), Setup-Status „OPEN“;
* Datenversion (Stand der Reihe, SHA-256 der verwendeten Kurse);
* Codeversion: Git-Commit, Registry-, Ledger- und Library-Version (im RUN-Eintrag desselben Laufs).

## Unveränderlichkeit

* `ledger.jsonl` wird nur angehängt. Jede Zeile trägt `prevHash` und `hash` = SHA-256 über Vorgänger-Hash, Laufnummer, Typ, ID, Verweis, Woche und kanonisches JSON des Inhalts. `HEAD.json` hält den Kopf der Kette.
* `verify.mjs` prüft:
  * die Kette, HEAD und die Snapshot-Hashes;
  * dass jede Revision auf ein früheres Ereignis verweist;
  * mit `--against-git REV`, dass die frühere Fassung ein **Präfix** der jetzigen ist (nichts umgeschrieben).

  Der Workflow prüft vor und nach jedem Lauf.
* Eine Woche wird höchstens einmal registriert. Ein Lauf für eine Woche **vor** dem letzten registrierten Lauf wird abgewiesen (nur vorwärts).
* Tests: `quant/tests/elliott-setups-mission10.test.mjs` (M10-R1 bis R4: Manipulation erkannt, Idempotenz, nur vorwärts, Snapshot-Manipulation erkannt).

## Auswertungsfenster

`evaluate-registry.mjs` wertet je Ereignis die Horizonte 3 / 6 / 12 / 24 / 36 Monate (13 / 26 / 52 / 104 / 156 Wochen) aus. Ein Horizont wird **nur** ausgewertet, wenn die Woche „Registrierung + h“ abgeschlossen ist. Vorher steht er mit der ersten auswertbaren Woche unter `pending`.

**Je Horizont:**
* richtungsbereinigte Rendite (4×-gedeckelt), Median;
* 2×-Häufigkeit (aufwärts);
* Überschuss gegen die Snapshot-Kontrollkohorte derselben Woche: alle, gleicher Trend, gleicher RS-Status, Trend × RS.

**Szenario-Status:** Bestätigung, Invalidation, Ziel, erweiterte Projektion, Umdeutung je Kohorte und Setup.

Das Register selbst ändert die Auswertung nie. Sie ist ein abgeleiteter Bericht (`reports/latest.json`).

### Wie die 12/24/36-Monats-Validierung funktioniert

| Horizont | Erste Auswertung der ersten Kohorte (Registrierung 2026-09-25) |
|---|---|
| 3 Monate | ab Woche 2026-12-25 |
| 6 Monate | ab 2027-03-26 |
| 12 Monate | ab 2027-09-24 |
| 24 Monate | ab 2028-09-22 |
| 36 Monate | ab 2029-09-21 |

* Jede weitere Wochenkohorte verschiebt sich entsprechend.
* Für eine belastbare Aussage je Setup braucht es genug Ereignisse je Kohorte und Horizont. Das sind Hunderte für die Produkt-Setups, die angezeigt sehr selten sind (rund 4–6 je Woche über das Universum, siehe erster Lauf).
* Vor einer Aussage wird eine eigene Präregistrierung mit festen Schwellen (Lift gegen D und Trend × RS, Mindestzahl) committet. Erst danach werden die Daten gesehen.

## Ausführung

* **Default-Branch:** Zeitplan samstags 09:23 UTC; manuell per `workflow_dispatch`.
* **Entwicklungsbranches:** nur mit der Marke `[elliott-registry]` am Anfang des Betreffs. Der Zeitplan von GitHub läuft nur auf dem Default-Branch. Solange Mission X nicht gemergt ist, braucht jede Woche einen Lauf per Marke.
* **Daten:** Die Wochenschlüsse werden im Runner frisch aus der Historienablage gebaut (`publish-long-series.mjs`). Die veröffentlichten Langreihen gehören `long-series.yml` und werden nicht committet. Sie werden im Repository nur monatlich erneuert und genügen deshalb nicht für einen Wochentakt.

## Bisherige Läufe

| Woche | Ort | Titel | Neue Ereignisse | Revisionen | Hinweis |
|---|---|---|---|---|---|
| 2026-09-25 | lokal, committete Langreihen (Stand 2026-10-01) | 4.975 | 1.886 (16 Produkt, 1.592 nicht angezeigt, 278 Forschung), **Bestand** (`initialStock`) | 0 | registriert am 07.10.2026. Spätere Kurse lagen vor, wurden aber durch das Kürzen nicht gelesen. Der RUN-Eintrag nennt Commit `e915052`; der Lauf nutzte zusätzlich die Bestandsmarkierung aus dem Arbeitsstand, committet in `3ba03e9`. |
| 2026-10-02 | CI, frisch gebaute Wochenschlüsse (Lauf auf `9309049`) | 5.122 | 329 (1 Produkt, 219 nicht angezeigt, 109 Forschung) | 425 (130 Umdeutung, 127 Ziel, 72 Bestätigung, 70 erweiterte Projektion, 26 Invalidation) | Ein erster CI-Versuch derselben Woche scheiterte am Push (GitHub-Serverfehler), wurde nicht veröffentlicht und zählt nicht. |

## Grenzen

* Die Registrierung nutzt wie die historische Evidenz die **zustandslose** Engine-Sicht (`previous = null`). Die Produktanzeige führt eine Persistenzkette über 52 Wochen; die Zählungen stimmen laut Mission VIII nur zu 74–78 % überein. PRODUCT_SETUP bedeutet: „angezeigt in der zustandslosen Sicht“. Eine Registrierung mit Produktkette ist ein Kandidat für V1.1.
* Ein Titel ohne Daten für die Woche wird übersprungen und erscheint nicht im Snapshot. Delistings zeigen sich später als fehlende Bars (`delistedOrMissing`).
* Volumen ist auf Wochenbasis nicht verfügbar.
