# Supertrader – Kullamägi Episodic Pivot (C09) und Parabolic Short (C10), chart-first

Stand 23.10.2026.
- **Owner-Vorgabe:** keine News- oder Katalysator-Datenbank, kein neuer Anbieter, keine neuen Kosten, keine Massendownloads.
- **Status:** Alle Ergebnisse sind `DIAGNOSTIC_NOT_CERTIFIED`; Kennzahlen liegen verschlüsselt auf `claude/supertrader-validation-results`.
- **Keine Freigabe:** keine Live-Aktivierung, keine Orders.

## 1. Was gebaut wurde

| Baustein | Datei | Inhalt |
|---|---|---|
| Intraday-Bausteine | `research/kk-intraday.mjs` | echte IEX-Minuten je Sitzung, Identitätsprüfung an der Eröffnung, Opening Range (mit offizieller Eröffnung), laufender IEX-VWAP, 5-Minuten-Kerzen. Keine Minute wird aus einem Tagesbalken abgeleitet. |
| EP-Lifecycle | `research/kk-ep-lifecycle.mjs` | Tagesscreen (Gap der offiziellen Eröffnung ≥ 10 %, KK-015) und Intraday-Bestätigung: ORH-1-Bruch, IEX-Volumentempo (KK-016/-037), Stop am Tagestief vor der Kaufminute mit KK-034 (≤ 1,5 ADR20, sonst Ablehnung), Ausstieg Schluss unter MA20. Läuft auf der gemeinsamen Research-Engine mit dem neuen Auftragstyp `INTRADAY_RESOLVED`. |
| PS-Modellstudie | `research/kk-ps-study.mjs` | Tagesscreen (beschleunigte Aufwärtstage, KK-018), Short unter dem 5-Minuten-ORL (KK-020), Stop über dem Tageshoch (KK-022), Eindeckung am MA10 (KK-023). Trade-Ebene, kein Short-Portfolio. |
| Runner | `research/run-kk-intraday.mjs` | Ebene A: Screens auf dem eingefrorenen Snapshot. Ebene B: IEX-Minuten nur für Kandidatentage. Je Lauf höchstens 6 000 HTTP-Versuche, davon 2/3 für EP (Basis und Minuten je Tag). Abrufreihenfolge deterministisch nach sha256(`TICKER|Datum`); privater Cache in 16 Shards, fortsetzbar. |
| Readiness | `completion/build-kk-ep-ps.mjs` | `artifacts/STRATEGY-KK-EP-PS-CHART.json` |
| Stichprobe (6.0) | `research/kk-sample.mjs` | saubere Hash-Präfixe je Methode, EP-Gemeinschaftssatz, Schichtung mit gleichem Anteil je Schicht (Abschnitt 8) |
| Workflow | `supertrader-validation.yml` | Modi `kk-intraday`, `kk-intraday-count`, `kk-intraday-smoke`, `kk-intraday-cache` (6.0) |

Die Engine-Erweiterung lässt alle bestehenden Auftragstypen unverändert. Beleg: sf5-Lauf [39939890956](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39939890956) auf diesem Zweig. Alle 41 SF5-Varianten sind trade-genau gleich dem Lauf 39937731507 (Trades, Ausstiegsgründe, Trade- und Ledger-Hash).

## 2. Drei Klassen, strikt getrennt

| EP | PS | vergeben? |
|---|---|---|
| `CHART_EP_CANDIDATE` (Tagesscreen) | `PS_CHART_CANDIDATE` | ja |
| `INTRADAY_CONFIRMED_CHART_EP_SETUP` (echte IEX-Minuten) | `INTRADAY_CONFIRMED_CHART_PS_SETUP` | ja |
| `CATALYST_CONFIRMED_ORIGINAL_EP` | `BORROW_CONFIRMED_EXECUTABLE_SHORT` | **nie**: keine Katalysator- bzw. Leihdaten (`EP_ORIGINAL_CLASS_ASSIGNABLE = false`, `PS_EXECUTABLE_CLASS_ASSIGNABLE = false`) |

Die Vertragsstatus der Originalregeln ändern sich nicht. C09 und C10 bleiben `PARTIAL_DATA_BLOCKED` / `NOT_MEASURABLE`.

## 3. Tiingo-Intraday: was belegt ist

**Probe 39931778756 (88 Anfragen):**
- Für alle 17 geprüften EP/PS-Tage gibt es IEX 1- und 5-Minuten-Balken.
- 5-Minuten-Balken sind identisch mit aggregierten 1-Minuten-Balken.
- Der IEX-Anteil am Tagesvolumen liegt bei 1,0–4,8 %.
- Hoch und Tief stimmen meist auf 0,1 % mit dem Tagesbalken überein. Die Eröffnungsauktion ist kein IEX-Print.
- Der konsolidierte Beta-Endpunkt liefert keine Volumina.

**Probe 39933893419:** `1day` wird abgelehnt. `4hour` liefert die IEX-Tagesvolumina von 23 Sitzungen in einer Anfrage.

**Kandidaten (Zähllauf 39935841797):**

| | Kandidaten gesamt | im IEX-Zeitraum (ab 2017) |
|---|---|---|
| EP | 14 995 | 13 769 |
| PS | 76 491 | 65 216 |

Alle IEX-Tage abzurufen hieße rund 93 000 Anfragen. Das ist ein Massenabruf und unterbleibt.

**Lauf 39939887192 (Commit `b6c15dd07`):**
- 6 000 Anfragen, alle mit Status 200.
- EP: 2 000 Tage mit Minuten, davon 1 828 mit IEX-Volumenbasis; 172 Tage haben unter 15 Basistage mit IEX-Volumen.
- PS: 2 065 Tage mit Minuten.
- 73 der 4 000 abgerufenen Tage waren leer (kein IEX-Handel).
- Die Abdeckung ist eine deterministische Stichprobe (`HASH_ORDER_SAMPLE`): EP 2 000 von 13 769 Tagen (14,5 %), PS 2 065 von 65 216 (3,2 %).
  - Ausgewählt wird nach sha256(`TICKER|Datum`). Das ist unabhängig vom Ergebnis, aber weder nach Jahr, Marktphase noch Liquidität geschichtet.
  - **Die Ergebnisse sind kein repräsentativer Gesamtbacktest** und lassen sich nicht auf alle Kandidaten hochrechnen.
  - Weitere Läufe setzen im Cache fort.

**Grenzen der Daten:**
- **Volumen:** IEX-Volumen wird nur mit IEX-Volumen verglichen und nie als Marktvolumen behandelt.
- **Lizenz:** Minutenwerte dienen nur interner, nicht anzeigender Nutzung. Sie stehen ausschließlich im privaten Cache und in verschlüsselten Ergebnissen.

## 4. Ergebnisse des Laufs 39939887192 (öffentlich nur Zählwerte)

**EP-Referenz:** 611 Trades (609 geschlossen), alle 9 Varianten abgestimmt.
- **Ausstiegsgründe:** 389 Stops am selben Tag (aus Minuten entschieden), 99 Stops an späteren Tagen, 17 Gap-Stops, 101 Schlüsse unter MA20, 3 Delistings.
- **Nicht ausgeführt:**
  - 11 748 Tage nicht abgerufen (Stichprobe)
  - 702 vor 2017
  - 141 ohne Opening Range
  - 103 ohne IEX-Basis
  - 101 ohne IEX-Print in den ersten 5 Minuten
  - 76 Identität an der Eröffnung verfehlt
  - 64 durch KK-034 abgelehnt (Stop zu weit)
  - 36 ohne Minuten

Befund: Rund zwei Drittel der Referenz-Trades enden am Einstiegstag. Ursache sind der enge Stop am Tagestief vor der Kaufminute (KK-034) und der ORH-1-Einstieg. Das ist eine Eigenschaft des Modells und keine Aussage über den Originalansatz.

**EP-Varianten (Trades):** ORH-5 403 · ohne Volumenregel 1 106 · Ruhephase (Vorlauf ≤ 50 %) 406 · MA10 613 · MA50 598 · optimistische Fill-Minute 607 · Risiko 0,25 % 612 · Risiko 1 % 581.

**PS-Referenz:** 239 geschlossene hypothetische Shorts.
- **Ausstiegsgründe:** 166 Stops über dem Tageshoch, 16 Gap-Stops, 1 Stop in der Fill-Minute, 56 am MA10-Ziel.

**PS-Varianten (geschlossen):** Serie ≥ 4 Tage 49 · ohne Beschleunigung 1 301 · erste rote 5-Minuten-Kerze 276 · gescheiterter VWAP-Retest 246 · VWAP-Rückeroberung als Stop 239 · MA20 232 · halb MA10/halb MA20 231.

Die Kennzahlen (Rendite, Trefferquote, R-Multiple, Drawdown) liegen verschlüsselt vor. Sie sind Modellstudien auf einer Stichprobe, ohne Leihkosten bei PS, und keine Strategie-Backtests.

**Shorts:** Jeder PS-Trade ist ein hypothetischer Leerverkauf einer Einheit. Ob die Aktie an dem Tag leihbar war, ob ein Locate verfügbar war und was die Leihe gekostet hätte, ist unbekannt (KK-030 `DATA_BLOCKED`). Kein simulierter Short ist als historisch tatsächlich ausführbarer Leerverkauf ausgewiesen; die Klasse `BORROW_CONFIRMED_EXECUTABLE_SHORT` wird nie vergeben.

## 5. Neue Readiness-Stufen

| | Stufe | Live |
|---|---|---|
| C09 Episodic Pivot | `CHART_EP_INTRADAY_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE` | `LIVE_NOT_APPROVED` |
| C10 Parabolic Short | `CHART_PS_TRADE_LEVEL_SHORT_MODEL_STUDY_IEX_VENUE_HASH_ORDER_SAMPLE` | `LIVE_NOT_APPROVED` |

Der Zusatz `_HASH_ORDER_SAMPLE` entfällt erst, wenn ein Lauf alle Kandidatentage abdeckt.

## 6. Verbleibende Blocker

**EP:**
- Katalysator (Identität, Zeitpunkt; KK-015/-038/-039/-040): `DATA_BLOCKED` nach Owner-Entscheidung.
- Konsolidiertes Intraday-Volumen fehlt; KK-016/-037 werden nur auf IEX gelesen.
- Keine Minuten vor 2017.
- Der Minuten-Cache ist privat und nicht im Snapshot eingefroren. Er ist über seinen sha256 im Beleg reproduzierbar, aber nicht zertifizierbar.
- Stichprobe statt Vollabdeckung (Budget).

**PS:**
- Leihbarkeit, Locates und Gebühren (KK-030) fehlen: `DATA_BLOCKED`.
- Kein Short-Buch auf der Engine.
- IEX-VWAP statt konsolidiertem VWAP.
- Keine Minuten vor 2017.
- Stichprobe.

**Beide:** Offene manuelle Entscheidungen KK-MR-CATALYST, KK-SF-EP-SIDEWAYS und KK-SF-SIZE.

## 7. Modellannahmen

Vollständig im Artefakt (`modelAssumptions`):
- Gap-Screen 10 %
- Mindesthistorie
- Identität an der Eröffnung (Ganztagesabgleich nur als Evidenz)
- Volumentempo PACE_20 mit 15-Tage-Basis
- ORH-1 bzw. ORL-5 mit offizieller Eröffnung
- Fill nie besser als das Niveau
- Fill-Minute pessimistisch
- Minuten nach dem Fill wie gedruckt
- MA-Ausstiege
- Risiko 0,5 %
- Kosten 10 bp + 1 bp

Keine davon ist eine Originalregel.

## 8. Supertrader 6.0: saubere Stichprobe, Cache-only, Schichtung

Auftrag: zuerst vorhandene Daten und den Cache nutzen, keine zusätzlichen Abrufe. Die Referenzkonfigurationen von EP und PS bleiben unverändert. Geändert haben sich nur die Tagessätze, die Berichterstattung und der Median.

**Befunde des Reviews (am Code 1.1.0 geprüft):**

| # | Befund | vorher | nachher |
|---|---|---|---|
| 1 | PS-Stichprobe verzerrt (`run-kk-intraday.mjs` 1.1.0, Zeilen 215–231) | EP und PS laufen in **derselben** sha256-Reihenfolge, EP zuerst. Die PS-Schleife überspringt bereits gecachte Tage. PS-Tage, die zugleich EP-Kandidaten sind (Gap ≥ 10 %), liegen damit bis zur EP-Grenze (14,5 %) im Cache, alle anderen nur bis zur PS-Grenze (3,1 %). Lauf 39939887192: 65 der 2 065 PS-Tage stammen aus der EP-Schleife, in einem unverzerrten PS-Präfix wären es geschätzt rund 14 (etwa 4,5-fach überrepräsentiert). | PS wird nur auf seinem eigenen Hash-Präfix ausgewertet (`CLEAN`). Gecachte Tage dahinter, die nur über den EP-Pfad kamen, fallen weg und werden gezählt. |
| 2 | EP-Varianten auf verschiedenen Tagessätzen (`kk-ep-lifecycle.mjs` 1.1.0, Zeile 113) | Ein Tag ohne nutzbare IEX-Basis ist unter PACE_20 `NOT_EXECUTED_NO_IEX_VOLUME_BASELINE` (REF: 103 Tage), unter `ALT-NO-VOLUME-RULE` aber handelbar. Über den PS-Pfad gecachte EP-Tage ohne Basis gab es im Lauf 39939887192 nicht (das PS-Präfix war kürzer als das EP-Präfix), der Code ließ sie aber zu. | Alle EP-Varianten laufen auf einem gemeinsamen Tagessatz: EP-Präfix, Minuten und Basis > 0. Ausgeschlossene Tage werden je Grund gezählt; gecachte Tage außerhalb des Satzes sind für jede Variante `NOT_EVALUATED_OUTSIDE_DAY_SET`. |
| 3a | Offene PS-Trades (`kk-ps-study.mjs` 1.1.0, Zeile 151; Runner Zeilen 273–278) | `OPEN_AT_DATA_END` (auch Delistings) erscheint nur in der Statuszählung, nie in den Kennzahlen. | Öffentlich gezählt (auch nach Endursache). Versiegelt zwei Kennzahlensätze: `closedOnly` (Referenz, gleiche Population wie bisher) und `withOpenMarked` (offene Shorts zum letzten Schlusskurs mit Ausstiegskosten). |
| 3b | Überlappende PS-Trades | Aufeinanderfolgende Kandidatentage derselben Serie laufen als unabhängige, überlappende Trades. | Bleibt die Referenz (`INDEPENDENT`). Neu ist die vorregistrierte Berichtsvariante `ONE_POSITION_PER_TICKER`: Ein Kandidat entfällt, solange ein früherer PS-Trade desselben Wertpapiers offen ist (Eindeckung am Kandidatentag zählt als offen). |
| 4 | Median (`run-kk-intraday.mjs` 1.1.0, Zeile 278) | `rs[floor(n/2)]`, bei gerader Anzahl der obere Median. | Echter Median. Betrifft nur versiegelte Mediane von Varianten mit gerader Trade-Zahl; nichts Festgeschriebenes ändert sich. |

**Saubere Präfixe (Modellannahme `MA-SAMPLE-CLEAN-PREFIX`):**
- EP: bis zum höchsten Rang eines EP-Tages mit gecachter Basis. Basen ruft nur der EP-Pfad ab.
- PS: bis zum höchsten Rang eines gecachten PS-Tages, der kein EP-Kandidat ist. Nur der PS-Pfad kann ihn geladen haben.
- Lücken im Präfix (Anfrage ohne endgültige Antwort) werden gezählt und bleiben „nicht abgerufen“.

**Cache-only (`--cache-only`, Workflow-Modus `kk-intraday-cache`):**
- Beide Abrufschleifen werden vollständig übersprungen, der Runner prüft 0 Anfragen.
- Der Workflow übergibt in diesem Modus keinen API-Schlüssel.
- Wie die anderen kk-Modi nur mit Snapshot und `research-v1`.
- Der Cache wird nur gelesen, nie geschrieben.

**Auswertungen je Lauf (Tagessätze):**
- `BEFORE_FIX`: das Verhalten von 1.1.0, nur zum Vorher/Nachher-Vergleich.
- `CLEAN`: die Referenz.
- `STRAT_YEAR_X_LIQUIDITY` und `STRAT_YEAR_X_LIQUIDITY_X_REGIME`: geschichtete Stichproben.

**Schichtung (vor jedem 6.0-Ergebnis festgelegt, `research/kk-sample.mjs`):**
- **Jahr** des Handelstags.
- **Liquidität:** mittlerer Rohdollarumsatz der 20 Sitzungen vor dem Handelstag. Feste Grenzen 10 Mio. und 100 Mio. USD, nominal. Feste Grenzen statt Terzilen, weil Terzile spätere Kandidaten verwenden würden; die Untergrenze ist das Universum (1 Mio.).
- **Regime (optional):** SPY-Schluss des Vortags über oder unter seinem 200-Tage-Durchschnitt.
- Alle Merkmale sind zum Entscheidungszeitpunkt bekannt.
- **Gleicher Anteil je Schicht:** f = Minimum über die Schichten mit mindestens 100 Kandidaten von (gecachte Präfix-Tage / Kandidaten). Jede dieser Schichten behält ihre ersten ⌊f × Kandidaten⌋ Tage in Hash-Reihenfolge. Kleinere Schichten fallen heraus und werden gezählt.
- EP: die geschichtete Stichprobe wird zusätzlich mit dem Gemeinschaftssatz geschnitten.

**Was öffentlich ist:** Zählwerte je Schicht (Kandidaten, gecacht, behalten), Tagessatz-Hashes, Status- und Ausstiegszählungen. Kennzahlen je Schicht stehen nur in der verschlüsselten Datei.

**Grenzen:**
- **Eine deterministische Hash-Stichprobe ist nicht automatisch repräsentativ.** Sie ist ergebnisunabhängig, kann aber zufällig nach Jahr, Liquidität oder Marktphase schief liegen.
- Die Schichtung gleicht den Anteil je Schicht an. Sie bleibt eine Stichprobe und ersetzt keinen Gesamtbacktest.
- Alle neuen Schwellen (Liquiditätsgrenzen, SMA 200, Mindestgröße 100) sind gekennzeichnete Forschungskonventionen (`MODEL_ASSUMPTION`), keine Kullamägi-Regeln.

**Festgeschriebene Fingerabdrücke:**
- Beide Varianten-Register haben neue Hashes: EP 1.2.0 (Tagessatz-Haken), PS 1.2.0 (Überlappungsreferenz und Berichtsvariante im Fingerabdruck).
- Der Lauf 39939887192 läuft auf dem alten Code. Er ist jetzt `PRE_6_0_REFERENCE` (Vorher-Seite) und nicht mehr `AUTHORITATIVE`.
- Das Artefakt meldet `CACHE_ONLY_RERUN_PENDING`, bis ein `kk-intraday-cache`-Lauf auf dem aktuellen Code eingetragen ist.
