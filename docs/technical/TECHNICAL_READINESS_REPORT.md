# Technical – Readiness-Bericht

**Stand:** 30.10.2026, nach der Produktionsprüfung (E3 06:47 UTC, A1 12:40 UTC) und der Integration von AP8 (L1–L5, S1, S3). Daten-Stichtag 29.10.2026, 5.661 Titel.
Erste Fassung 29.10.2026 (`ebf0bfc`), damals mit A1 und E3 offen.
Grundlage ist die Completion-Matrix in [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md). Dieser Bericht fasst sie zusammen und ergänzt Messungen an der Produktion.

## 1. Ergebnis

- **Kernfunktionen sind fertig und in Produktion belegt:** Indikatoren, Kerzenmuster, Formationen, universumsweiter Screener mit Tag/Woche/Monat, Chart Studio, gespeicherte Suchstrategien, Zeitbezug und Datenqualität, beschreibende Evidenz.
- **Kein P0/P1-Punkt mehr offen (30.10.):**
  - **A1 ✔:** Der Zeitplan-Lauf von technical-world hat am 30.10. ohne Handstart committet (`b65def8`), ebenso am 29.10. (`26a0360`). Er startet aber 5–6 Stunden spät (§4).
  - **E3 ✔:** Die 21 Wochen- und Monatsspalten aus AP4 sind belegt, DQ-TW-1..7 PASS (SCREENER_FIELDS_AP4.md §5a).
- **Strategie-Vorlagen (AP8) in Produktion:**
  - 13 Vorlagen, darunter „Etablierter Aufwärtstrend“ (8 Kriterien).
  - Felder aus L1–L5: SMA 150, Richtung der SMA 200, Abstand zum 52-Wochen-Tief, RS-Rang, Ausbruchsrichtung.
  - Kriterien-Checkliste in Liste und Chart Studio.
  - DQ-TW-8 überwacht Lunten-Tiefs.
- **Bewusst zurückgestellt (Owner, 29.10.):**
  - Wochenchart mit Kerzen und Formationen (E4/D5);
  - kostenpflichtige KI-Suche (F5);
  - Ursachenklärung der beendeten Reihen per Anbieterabruf (A4).
  - Keiner dieser Punkte erzeugt falsche Signale; die Schutzmaßnahmen sind aktiv.

## 1a. Product Readiness: Abschlussphase 30.10.2026

### Live-Prüfung (nachgewiesen)

- **Was geprüft wird:** Workflow `technical-live-qa.yml` mit Skript `scripts/technical/world/live-qa.mjs` gegen `research.visionuniverse.de`:
  - iPhone-Breite 390 px, mobil, DPR 3;
  - angemeldet über den bestehenden autorisierten Testzugang (Secret `RESEARCH_ACCESS_PASSWORD`, wie die Vorsorge- und Supertrader-Prüfungen); der Wert wird nie ausgegeben;
  - das Zugangstor wird nur geprüft, nie verändert.
- **Wann:** nach jeder Pages-Auslieferung und auf Zuruf.
- **Lauf 41086988135** (16:08 UTC, vor #1170) und **Lauf 41090743880** (16:32 UTC, nach #1170):
  - Zugangstor ohne Anmeldung sichtbar, App verdeckt;
  - alle **13 Vorlagen** geöffnet;
  - Zähler „Erfüllt / Fast erfüllt / Unvollständig“ = `index-v1.json` der Seite, bei allen 13;
  - keine Konsolenfehler, keine fehlgeschlagenen Anfragen, kein seitliches Scrollen;
  - Chart-Studio-Prüfleiste des ersten Treffers zeigt „alle Kriterien erfüllt“;
  - Screenshots je Vorlage im Artefakt `technical-live-qa`.

| Vorlage | Kriterien | Erfüllt | Fast | Unvollständig |
|---|---|---|---|---|
| Etablierter Aufwärtstrend | 8 | 685 | 440 | 1 |
| Aufwärtstrend, vereinfacht | 5 | 920 | 608 | 1 |
| Trendfolge | 4 | 521 | 1.014 | 0 |
| Über SMA 200 | 1 | 2.068 | – | – |
| Dreieck in Bildung | 1 | 362 | – | – |
| Dreieck in Bildung, im Aufwärtstrend | 2 | 225 | – | – |
| Dreieck mit Ausbruch nach oben | 1 | 169 | – | – |
| Dreiecksformationen | 1 | 864 | – | – |
| Bullische Flaggen und Wimpel | 1 | 57 | – | – |
| Volatilitätskontraktion | 1 | 109 | – | – |
| Breakout-Kandidaten | 1 | 749 | – | – |
| 52-Wochen-Hochs | 1 | 153 | – | – |
| 200-Wochen-Hochs | 1 | 152 | – | 670 (ohne 200-Wochen-Historie) |

### Mobile Messwerte (Produktion, Profil „mobil-einfach“)

- **Profil:** CPU ×4, 150 ms Latenz, 1,6 Mbit/s, 390 px.
- **Messpunkt:** Gemessen wird bis zur sichtbaren Antwort.
- **Nutzerpfad für „erste Vorlage“:** Liste lesen (3 s), dann antippen.

| Schritt | vor #1170 | nach #1170 |
|---|---|---|
| Kaltstart bis Vorlagenliste | 2,1 s | 1,6 s |
| Erste Vorlage mit Treffern (lädt den Screener-Datensatz) | 8,3 s | **5,0 s** |
| Wechsel zwischen Vorlagen (Median / Max, 12 Wechsel) | 95 / 129 ms | 69 / 84 ms |
| Screener aus einer Vorlage | 0,30 s | 0,20 s |
| Abfrage-Engine im Browser (8 Kriterien, ganzes Universum) | 5 ms | 3 ms |
| Chart Studio eines Titels | 2,9 s | 2,8 s |

- **Engpass:** der Screener-Datensatz (gzip 1,5 MB, 160 Spalten).
- **Behoben mit #1170:**
  - Die Vorlagenliste lädt den Datensatz im Leerlauf vor (nicht bei „Datensparen“).
  - Die Vorlage zeigt beim Laden einen Zustand statt einer leeren Seite.
- **Weitere Verkürzung:** nur über einen kleineren Datensatz, z. B. eine Spaltengruppe für Vorlagen. Das ist eine Vertragsänderung mit eigenem PR.
- **Grenze der Messung:** Die Messung ist eine Emulation im CI-Browser; ein echtes einfaches Mobilgerät wurde nicht gemessen.

### Datenqualität der Spitzentreffer

[DQ_TOP20_ESTABLISHED_UPTREND.md](DQ_TOP20_ESTABLISHED_UPTREND.md):
- **GIBO (Platz 1):** wahrscheinlich ein unbereinigter Reverse-Split 1:20 am 30.06.
  - RS-Rang 100 und der Treffer sind Artefakte; DQ-PX-3 meldet die Reihe.
  - Im Produkt ist der Titel nicht gekennzeichnet.
- **Sonst unauffällig:** Die übrigen 19 sind plausibel. Darunter sind echte Ereignistage (MRNA, REPL, SLN), zwei korrekt bereinigte Splits (ZCSH, BUUU) und Penny- bzw. illiquide Titel (ABLV, CYPH, USIO).
- Keine Korrektur, keine Methodikänderung; drei Optionen liegen zur Entscheidung vor.

### Betriebszeit

- **#1168 (Workflow, wartet auf Freigabe):**
  - technical-world startet nach dem erfolgreichen Marktdaten-Refresh (fertig 04:00–07:00 UTC) statt per Zeitplan.
  - Der Zeitplan startet 5–6 h spät (10:25–11:27 UTC); das betrifft alle Zeitpläne des Repositorys.
  - Der Zeitplan bleibt als Rückfall.
- **Details:** [TECHNICAL_SCHEDULE.md](TECHNICAL_SCHEDULE.md) (im PR).
- **Nachweis:** erst mit dem ersten Nachtlauf nach dem Merge.

### Verbleibende Einschränkungen

1. **GIBO** steht mit einem Datenfehler auf Platz 1 der Acht-Kriterien-Vorlage, bis die Quelle bereinigt oder eine Kennzeichnung freigegeben ist.
2. **Erste Vorlage mobil:** 5 s auf dem emulierten einfachen Profil. Die Datensatzgröße ist der Grenzfaktor.
3. **Datensatz erst gegen 11:20 UTC aktuell**, solange #1168 nicht gemergt ist.
4. **Echte Geräte:** Die Live-Prüfung ist automatisiert (Chromium, emuliert). Eine Sichtprüfung auf einem echten iPhone (Safari) ist nicht belegt.
5. **Zurückgestellt (Owner):** S4 (historische Auswertung), Wochenchart mit Kerzen (E4/D5), KI-Suche (F5).

## 2. Abgeschlossene Kernfunktionen

| Bereich | Umfang in Produktion | Nachweis |
|---|---|---|
| Indikatoren | 92 im Katalog, 52 als Screener-Feld, 31 im Chart | B1/B2: jeder gegen naive Formel und gegen TA-Lib 0.8.2 bzw. pandas-ta auf echten Kursen |
| Kerzenmuster | 62 erkannt; 27 im Screener (Tag, Woche, Monat) und als Chart-Marker | TA-Lib-Abgleich, Kausalität (C1–C3) |
| Formationen | 24 Typen in Screener und Chart, Lebenszyklus (in Bildung, bestätigt, invalidiert) | Validator 11.387/11.387 regelkonform; 1.856/1.856 Bestätigungen jenseits der gezeichneten Linie; keine Rückdatierung (D1–D4) |
| Screener | 83 Abfragefelder, 160 Spalten, UND/ODER-Gruppen, Zeitrahmen je Filter, 13 Strategie-Vorlagen mit Kriterien-Checkliste (AP8), regelbasierte Suche in Worten | Abfrage über das Universum < 100 ms (Budget-Test); Vertrag `screener-contract` |
| Mehrfach-Zeitrahmen | Woche und Monat aus der vollen Tageshistorie, nur abgeschlossene Perioden | L7: 18 Spalten mit 94–96 % belegt (29.10.); AP4: 21 Spalten belegt, DQ-TW-1..7 PASS (30.10.) |
| Chart Studio | Kurs, 13 Schichten, 11 Unterfenster, Formationslinien, Kerzenmarken, relative Stärke, Zeiträume, hell/dunkel | Browser-QA 390/1280 px in CI; E2E Zeile = Chart (26 Indikatorspalten, RS, Formationen, Kerzen, eingefroren 233/233) |
| Gespeicherte Strategien | Speichern, Umbenennen, Export/Import, Migration alter Formate | `technical-saved-migration.test.mjs` |
| Zeitbezug | Ereignisse nur für Titel am Stichtag; eingefrorene Reihen ohne Analysefelder und mit Hinweis | AP1, DQ-TW-6 (0/312) |
| Evidenz (beschreibend) | Formationen, 18 Indikator-Ereignisse, 77 Kerzenmuster; nur auf der Methodik-Seite | H1–H4; drei Ebenen getrennt, kein Handelsvorteil behauptet (#1109) |

## 3. Tatsächliche Produktionsnachweise

Gemessen an `research.visionuniverse.de` am 29.10.2026, gegen 13 Uhr UTC.

| Nachweis | Ergebnis |
|---|---|
| Live-Stand | `meta.json`: Stichtag 28.10., erzeugt 29.10. 03:38 UTC; Versionen screen-row 1.11.0, query 1.11.0, indicators 1.6.0, formations 1.4.0 |
| Universum | 5.659 Zeilen: 5.347 aktuell, 312 hinter dem Stichtag oder eingefroren (gekennzeichnet), 0 ohne Bündel |
| Wochenwerte | 5.652 Titel mit Wochenreihe, 4.745 mit 200 Wochen; alle 5.659 Woche/Monat aus der Tageshistorie |
| Ladegrößen (gzip, wie ausgeliefert) | Index der Startseite 59 KB · Screener-Datensatz 1,36 MB · Chart je Titel rund 56 KB (NVDA) · Evidenzdateien 2–4 KB · Cache 10 min |
| Erzeugerlauf | Screener 42 s (Budget 120 s); dazu Formations-Evidenz rund 110 s und Signal-Evidenz rund 150 s (lokal gemessen); Workflow-Grenze 30 min |
| Nachtlauf 28./29.10. | market-data-refresh 40803128385 grün, Materialisierung `94d7b46`, technical-world `92b010e` (per `workflow_dispatch`, kein Anbieterabruf). **Korrektur:** Der Zeitplan-Lauf hat am 29.10. ebenfalls selbst committet (`26a0360`, 11:31 UTC); die erste Fassung dieses Berichts sagte fälschlich, er habe nichts zu committen gefunden |
| Nachtlauf 29./30.10. | Materialisierung `9685f63` (06:44 UTC). technical-world ohne Handstart: `workflow_run` nach „Lange Kursreihen“ committet `21ffbff` (11:08 UTC), Zeitplan-Lauf 41047225923 committet `b65def8` (11:23 UTC) |
| AP8 Integration 30.10. | L1–L5 nacheinander gemergt, je mit Neubau durch den Erzeuger; die bisherigen 150 Spalten blieben byte-gleich, nur Versionen und Laufzeit in `meta.json` änderten sich. Danach S1 und S3. „Etablierter Aufwärtstrend“ am Stichtag 29.10.: 685 erfüllt, 440 fast erfüllt, 1 unvollständig; unabhängige Nachrechnung aus den Tagesbars 1.126/1.126 ohne Abweichung; DQ-TW-1..8 PASS |
| Datenqualität | DQ-TW-1..8 PASS (30.10., Integrationsstand); DQ-PX-4 gehört zur langen Wochenreihe (`long-series.yml`), nicht zu Technical |
| Tests | technical 45/45, core 300/300, quant technical 555/555 (30.10.); Test-Isolation: kein Test schreibt Produktionsdaten |
| Browser | Technical-Browser-QA in `technical-ci.yml` (390/1280 px, hell/dunkel, alle Ansichten) bei jedem PR; Methodik-Abschnitt Evidenz mobil geprüft (#1109) |

## 4. Verbleibende P0/P1-Punkte

| Punkt | Prio | Stand | Was „erledigt“ heißt |
|---|---|---|---|
| A1 nächtliche Kette ohne Handeingriff | P0 | ✔ 30.10.: Zeitplan-Lauf committet selbst (`b65def8`), am 29.10. ebenso (`26a0360`). Verbleibend: Start 5–6 h nach 05:10 UTC (27.10. 10:25, 28.10. 11:15, 29.10. 11:27, 30.10. 11:19 UTC) | **Vorschlag gegen die Verspätung** (Workflow-PR, ADR-005, braucht keine Datenänderung): „Marktdaten-Refresh“ zusätzlich unter `workflow_run` eintragen. Die Materialisierung läuft dort als `workflow_call` und löst deshalb keinen eigenen `workflow_run` aus. Heute greifen der Zeitplan und der `workflow_run` nach „Lange Kursreihen“ |
| E3 Zeitrahmen-Wechsel (AP4) | P1 | ✔ 30.10. | Füllraten gegen SCREENER_FIELDS_AP4.md §3 passend, DQ-TW-5 0/60 (§5a) |

Damit ist kein P0/P1-Kriterium offen.

## 5. Bewusst zurückgestellt

| Punkt | Entscheidung | Schutz bzw. Ersatz im Produkt |
|---|---|---|
| A4 Ursache beendeter Reihen | 29.10.: kein zusätzlicher Anbieterabruf | Kennzeichnung „hinter dem Stichtag“ / „eingefroren“, Ereignisfelder `null`, DQ-TW-6 |
| E4/D5 Wochenchart mit Kerzen und Formationen | 29.10.: vorläufig Option A, späteres Paket nach Lizenzklärung | Wochen-Schlusslinie mit SMA 10/40; Wochenfelder im Screener |
| F5 KI-Suche | 29.10.: zurückgestellt | Regelbasierte Suche in Worten (`query-text.js`) |
| AP7 weitere Spezialindikatoren und seltene Muster | P2, nur nach Relevanz | 68 Indikatoren und 35 Kerzenmuster sind im Katalog, aber nicht im Produkt |

## 6. Übergabe an die mobile Frontend-Integration

Die Anforderungen gelten für jede neue mobile Oberfläche, ob Web oder App.

**Daten und Pfade** (Vertrag: [DATA_CONTRACT.md](DATA_CONTRACT.md)):
- `/technical/data/meta.json`: Stichtag, Versionen, Zählungen. Zuerst laden.
- `/technical/data/index-v1.json` (59 KB): Startseite und Vorlagen-Zähler.
- `/technical/data/screener-v1.json`: spaltenweise, 160 Spalten, Schema `vu-technical-screener-1.0.0`.
  - Für mobile Netze ist das die größte Last.
  - Empfehlung für das Mobilprojekt: erst laden, wenn der Screener geöffnet wird, so wie heute.
  - Eine Aufteilung in Spaltengruppen wäre eine Vertragsänderung und braucht einen eigenen PR.
- Chart je Titel: `/quant/data/product/technical-signals-v1/by-ticker/<T>.json.gz` (rund 56 KB); Rückfall auf den Shard über `model.js#technicalPaths`.
- `formation-evidence.json` und `signal-evidence.json`: nur für die Methodik-Seite.

**Rechnung nicht neu bauen:** Die Engines sind UMD-Module und laufen im Browser.
- Für Abfragen gilt `technical-query.js#evaluate`; das Ergebnis enthält `funnel`, also wie viele Titel nach jedem Filter übrig bleiben.
- Texte und Zustände kommen aus `technical/engine/model.js`, Indikatoren aus `indicators.js`.
- Eine zweite Implementierung in der App würde den E2E-Vergleich Zeile = Chart aushebeln.

**Zustände, die jede Oberfläche zeigen muss:**
- `fresh = false`: „Kurs vom …“; Ereignisfilter liefern für diese Titel kein Ergebnis.
- Eingefrorene Reihe: „Kurs unverändert seit spätestens …“. Das ist ein Datenqualitätshinweis, kein bestätigtes Delisting. Keine Befunde, keine Niveaus.
- `null` heißt „unbekannt“, nicht „nein“. Eine Anzeige darf `null` nicht als Falsch darstellen.
- Woche und Monat: Spalten `feld@1W`, `feld@1M`. 52-Wochen-Tief und -Hoch stehen am Tag auf Tagestief bzw. -hoch, in Woche und Monat auf dem Schlusskurs. Die Beschriftung kommt aus `technical-query.js#labelOf`.

**Aussagen und Texte:**
- Drei Ebenen getrennt halten:
  - Ereignis;
  - historische Beobachtung (nur Methodik-Seite);
  - Handelsvorteil, den es nicht gibt.
- Keine Bezeichnung als Kauf- oder Verkaufssignal, keine Renditeversprechen.
- Evidenzzahlen nicht neben einzelne Treffer oder Chart-Marken setzen.

**Gespeicherte Strategien:**
- Format `vu-technical-screens-1` in `localStorage`, mit Migration (`model.js#migrateParams`).
- Eine App, die Strategien serverseitig speichert, übernimmt Export/Import unverändert.

**Qualitätsmaßstab:**
- 390 px ist die Referenzbreite, 360 px geprüft.
- Kein horizontales Scrollen der Seite, Tabellen mit Umbruch.
- Abfrage ≤ 100 ms auf dem Desktop; auf einem einfachen Mobilgerät ist das noch nicht gemessen und gehört in die Abnahme des Mobilprojekts.
- Geschützte Dateien (`ui-protection.json`) und Release-Stempel (`?v=<Hash>`) gelten weiter.
