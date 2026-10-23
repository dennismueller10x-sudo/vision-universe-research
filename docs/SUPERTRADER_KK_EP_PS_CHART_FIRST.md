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
| Workflow | `supertrader-validation.yml` | Modi `kk-intraday`, `kk-intraday-count`, `kk-intraday-smoke` |

Die Engine-Erweiterung lässt alle bestehenden Auftragstypen unverändert. Den Beleg liefert der sf5-Lauf auf diesem Zweig: alle bisherigen Referenzen trade-genau gleich.

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
- Die Abdeckung ist eine deterministische Stichprobe (`HASH_ORDER_SAMPLE`). Weitere Läufe setzen im Cache fort.

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
