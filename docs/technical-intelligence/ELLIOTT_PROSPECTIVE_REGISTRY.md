# Elliott Prospective Registry

Stand: 07.10.2026 (Mission X; Registry 1.1.0).

* Code: `scripts/technical/elliott-registry/` (`register.mjs`, `product-view.mjs`, `ledger.mjs`, `verify.mjs`, `evaluate-registry.mjs`).
* Daten: `quant/data/technical-intelligence/elliott-registry/`.
* Workflow: `.github/workflows/elliott-prospective-registry.yml`.

## Zweck

Alle historischen Wochendaten sind verbraucht. Ob ein Setup der Library V1 echten Wert hat, kann nur eine **Vorab-Aufzeichnung** zeigen: Ab jetzt wird jedes qualifizierende Setup in der Woche eingefroren, in der es erscheint, ohne Zukunftswissen. Ausgewertet wird erst, wenn der jeweilige Horizont abgelaufen ist.

## Zwei Sichten (ab Registry 1.1.0)

| Sicht | Elliott-Ausgabe | Kohorten | Wozu |
|---|---|---|---|
| `CUSTOMER_PRODUCT` | **dieselbe wie im Kundenprodukt** (Kursstruktur/Chartbild, `technical-intelligence/v3`): `analyzeProduct` mit Persistenzkette (26 + 26 Bars), Produkt-Zeitebene (Tagesanalyse für die Tagestitel des Produkts, sonst Woche), Produkt-Optionen (`productOpts`) | `CUSTOMER_PRODUCT_SETUP` (angezeigt), `CUSTOMER_PRODUCT_PRIMARY_UNDISPLAYED` | prospektive Messung dessen, was Kunden sehen |
| `STATELESS_ENGINE` | zustandslose Engine-Sicht (`previous = null`), wie die historische Evidenz | `PRODUCT_SETUP`, `ENGINE_PRIMARY_UNDISPLAYED`, `RESEARCH_ONLY_INTERNAL_WAVE3` (wie 1.0.0) | prospektive Bestätigung der historischen Evidenz |

* `product-view.mjs` ruft dieselben Funktionen wie der Produkt-Build auf: `analyzeProduct` (`lib/ti-product.mjs`) sowie `workCtx`, `productOpts` und `slim` (`build-technical-intelligence.mjs`). Es gibt keine Kopie. `productOpts` wurde dafür nur herausgezogen; die Produktausgabe ändert sich dadurch nicht.
* **Identitätsprüfung vor jedem Lauf:**
  * Stichprobe: alle Tagestitel und 120 Wochentitel des veröffentlichten Produkts.
  * Diese Titel werden auf den Eingangsdaten des Produkts nachgerechnet: die committeten Langreihen bzw. die Golden-Preview-Tagesdateien, ungekürzt bis zum veröffentlichten Stand.
  * `pro.elliott` muss **Byte für Byte** dem veröffentlichten Shard entsprechen.
  * Bei einer Abweichung, oder wenn kein Titel vergleichbar ist, wird **nichts** geschrieben.
  * Das Ergebnis steht im RUN-Eintrag (`productView.identity`). `verify.mjs` weist einen Lauf mit Produktsicht ohne bestätigte Identität zurück.
  * Lokal am 07.10.2026: 43 von 43 vergleichbaren Titeln identisch, davon 5 Tagestitel.
* Je Titel speichert der Snapshot `pv` mit:
  * Zeitebene, Bar-Datum, Muster, Welle, Enthaltung, Persistenzschlüssel, Anwendbarkeit, Umdeutungsrisiko;
  * `sha`, den Fingerabdruck der veröffentlichten Form von `pro.elliott`;
  * Setup-Status.

  Produkt-Ereignisse tragen denselben Fingerabdruck (`productElliottSha`).
* Kurs und ATR der Setup-Geometrie kommen in der Produktsicht aus der Produktrechnung. Trend, RS26 und Marktstruktur sind für beide Sichten gleich. Die Setup-Klassifikation ist dieselbe Funktion (`setup-library.mjs`).
* Umdeutung (`RELABELED`) wird je Sicht gegen die eigene Primärzählung geprüft. Die Kontrollkohorte der Auswertung schließt je Sicht Titel mit demselben Setup aus.
* Bestand: Der erste Lauf mit Produktsicht markiert seine Produkt-Ereignisse als `initialStock` (`productView.initialStockRun`).
* Bestehende Einträge (Version 1.0.0) bleiben unverändert. Die Kette läuft über beide Versionen weiter.

## Projektionsthese (ab Registry 1.2.0)

* Neue `CUSTOMER_PRODUCT`-Ereignisse tragen zusätzlich `projectionThesis` (Elliott Projection Engine `elliott-projection-1.0.0`, siehe [ELLIOTT_PROJECTION_ENGINE.md](ELLIOTT_PROJECTION_ENGINE.md)) und `projectionEngine`; der RUN-Eintrag nennt `code.projection`.
* Eingabe ist dieselbe veröffentlichte Form `pro.elliott` wie die Produktanalyse derselben Zeitebene (die These gehört zur Zählung des Ereignisses). Für Tagestitel zeigt das Chartbild zusätzlich die Wochen-These (`projectionWeekly`); sie wird im Lebenszyklus-Store des Produkts verfolgt, nicht als Register-Ereignis. Die Relative Stärke ist der RS26-Rang des Registerlaufs.
* Nach einer Setup-Invalidation läuft nur die Verfolgung der Projektionsthese weiter, bis sie selbst ungültig wird (`PROJECTION_INVALIDATED`); Ereignisse ohne These verhalten sich wie bisher.
* Zusätzliche Revisionsarten nur für Ereignisse mit Projektionsthese: `PROJECTION_BASE_REACHED`, `PROJECTION_EXTENDED_REACHED`, `PROJECTION_EXTREME_REACHED`, `PROJECTION_INVALIDATED`.
* Frühere Ereignisse und Revisionen bleiben unverändert; Kohorten, Setup-Library und Auswertung sind unverändert.

## Motiv-Alternative (ab Registry 1.3.0)

* Kohorte `CUSTOMER_PRODUCT_MOTIVE_ALTERNATIVE`: die im Chartbild angezeigte Motiv-Alternative (Projection Engine 1.1.0, „Mögliche Welle 3 · Alternative Lesart“) wird je Titel × Lesart einmal eingefroren: `interpretation: "ALTERNATIVE"`, Welle, Grad, Rang im Kandidatenpool, Zonen, Invalidation, Bestätigungsstatus, Engine- und Projektionsversion. Revisionen `PROJECTION_*` wie bei 1.2.0.
* Der erste Lauf mit 1.3.0 markiert seine Motiv-Ereignisse als Bestand (`initialStock`).
* `RESEARCH_ONLY_INTERNAL_WAVE3`: `productVisible` wird ab 1.3.0 wahrheitsgemäß gesetzt (vorher fest `false`), weil derselbe interne Kandidat jetzt im Produkt erscheinen kann. Die Definition der Forschungskohorte ist unverändert; frühere Einträge bleiben unverändert.

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

## Ausführung und Betriebssicherheit

* **Ort:** `main`. Seit der Produktmigration Technical Intelligence v3 (Oktober 2026) liegen das Register und das Kundenprodukt auf demselben Branch.
  * Die Kundenprodukt-Sicht misst das Chartbild von `main`.
  * Die Einträge bis Woche 2026-10-02 entstanden auf dem Forschungsbranch und wurden byte-gleich übernommen; die Kette ist unverändert.
  * Der Forschungsbranch registriert nicht mehr.
* **Zeitpläne (nur Default-Branch):**
  * Sa 09:23, So 07:47, Mo 06:17, Mi 05:41 UTC.
  * Der erste registriert die Woche. Die anderen holen nach, wenn ein Lauf gescheitert ist.
  * Ist nichts fällig, endet ein Lauf nach der Stufe „Fällig?“, ohne Datenabruf (`register.mjs --pending`).
* **Übergang (abgeschlossen):** Bis ein direkter Lauf auf `main` verifiziert war, starteten die vier Zeitpläne den Register-Workflow über `elliott-registry-dispatcher.yml`. Seitdem liegen sie im Register-Workflow selbst; der Dispatcher ist entfernt.
* **Manuell:** `workflow_dispatch` (Eingabe `max_weeks`, 1–4).
* **Nachholen:**
  * Ohne `--week` registriert ein Lauf die fehlenden abgeschlossenen Wochen nach dem letzten Lauf der Reihe nach, im Workflow höchstens 2.
  * Jede Woche wird vor der Analyse gekürzt. Die Verspätung steht im RUN-Eintrag (`registrationLagDays`).
  * Scheitert eine spätere Woche, bleiben die früheren registriert und werden committet; der Lauf endet trotzdem rot (Exit 3).
* **Abdeckungs-Sperre:** Es wird nichts geschrieben, wenn
  * weniger als 90 % der Titel des vorigen Laufs analysierbar sind (z. B. weil der Datenabruf alte Reihen lieferte), oder
  * die Produktsicht für weniger als 90 % der analysierten Titel gelingt.
* **Datenabgleich:** Die committeten Langreihen (Eingang des veröffentlichten Produkts) werden vor dem Datenabruf gesichert. Je Titel wird verglichen, ob die frisch gebauten Wochenschlüsse in den gemeinsamen abgeschlossenen Wochen gleich sind (`productView.inputAgreement`).
* **Push:**
  * `scripts/ci/push-with-retry.sh` (neu holen, neu aufsetzen, erneut schieben).
  * Scheitert der Push, ist nichts veröffentlicht. Der nächste Zeitplan registriert die Woche dann neu (idempotent, weil das entfernte Register sie nicht kennt).
  * Keine eigenen Pushes auf den Branch, während ein Registerlauf ansteht oder läuft.
* **Alarm:** Jeder rote Lauf öffnet ein Issue „Elliott-Registry: Wochenlauf fehlgeschlagen“ oder kommentiert es, mit Link zum Lauf. Jeder Lauf schreibt eine Zusammenfassung.
* **Zeitlimit:** 300 Minuten. Eine Woche über das Universum braucht etwa 60–90 Minuten, weil die Persistenzkette rund 2,6 s je Wochentitel kostet.
* **Daten:** Die Wochenschlüsse werden im Runner frisch aus der Historienablage gebaut (`publish-long-series.mjs`). Die veröffentlichten Langreihen gehören `long-series.yml` und werden nicht committet. Sie werden im Repository nur monatlich erneuert und genügen deshalb nicht für einen Wochentakt.

## Bisherige Läufe

| Woche | Ort | Titel | Neue Ereignisse | Revisionen | Hinweis |
|---|---|---|---|---|---|
| 2026-09-25 | lokal, committete Langreihen (Stand 2026-10-01) | 4.975 | 1.886 (16 Produkt, 1.592 nicht angezeigt, 278 Forschung), **Bestand** (`initialStock`) | 0 | registriert am 07.10.2026. Spätere Kurse lagen vor, wurden aber durch das Kürzen nicht gelesen. Der RUN-Eintrag nennt Commit `e915052`; der Lauf nutzte zusätzlich die Bestandsmarkierung aus dem Arbeitsstand, committet in `3ba03e9`. |
| 2026-10-02 | CI, frisch gebaute Wochenschlüsse (Lauf auf `9309049`) | 5.122 | 329 (1 Produkt, 219 nicht angezeigt, 109 Forschung) | 425 (130 Umdeutung, 127 Ziel, 72 Bestätigung, 70 erweiterte Projektion, 26 Invalidation) | Ein erster CI-Versuch derselben Woche scheiterte am Push (GitHub-Serverfehler), wurde nicht veröffentlicht und zählt nicht. |

## Grenzen

* Die Läufe 2026-09-25 und 2026-10-02 (Version 1.0.0) haben nur die **zustandslose** Sicht. `PRODUCT_SETUP` bedeutet dort „angezeigt in der zustandslosen Sicht“, nicht „vom Kunden gesehen“. Die Kundenprodukt-Sicht beginnt mit dem ersten Lauf von 1.1.0 (Bestand markiert).
* Das veröffentlichte Chartbild baut `technical-intelligence-build.yml` neu, sobald sich seine Eingaben ändern (täglich geprüft und nach `long-series.yml`). Das Register rechnet je Woche dieselbe Funktion auf der zum Freitag gekürzten Reihe. Für gleiche Eingangsdaten ist die Ausgabe gleich; die Identitätsprüfung belegt das bei jedem Lauf. Zwischen zwei Produkt-Builds steht im Register, was das Produkt mit den Daten der Woche zeigen würde.
* Ein Titel ohne Daten für die Woche wird übersprungen und erscheint nicht im Snapshot. Delistings zeigen sich später als fehlende Bars (`delistedOrMissing`).
* Volumen ist auf Wochenbasis nicht verfügbar.
