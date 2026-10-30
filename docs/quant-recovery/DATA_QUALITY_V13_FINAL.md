# V13 – Abschlussbericht: nachgeladene delistete Kursreihen, wirksame Datenkorrekturen, Vergleichsstudien

Stand 29.10.2026. Evidenzarten SOURCE_EVIDENCE (Register) und HISTORICAL_DEVELOPMENT_STUDY (Studien); alles `NOT_CERTIFIED`,
`productionApproved: false`. Kein Merge, keine Produktaktivierung, kein Frontend, keine Gate-Änderung, kein neuer Anbieter.

## 1. Delistete Titel (höchste Priorität)

- **Vorprüfung:** Der Bestand (V12 LISTREF) hatte für die 4.322 Kandidaten keine Reihe.
  - Kosten und Limits: Tiingo Commercial (Pauschaltarif, Freigabe des Owners vom 13.09.2026), Budget ≤ 7.500 Anfragen je Lauf. Kein Zusatzentgelt.
  - Wiederverwendete Ticker liefern nur das neueste Listing; diese Fälle werden erkannt und ausgeschlossen.
- **Abruf:** Branch `claude/v13-delisted-fetch-4ho3rd`, Workflow `quant-v13-delisted-fetch.yml` (nur `contents: read`, committet nichts).
  - Vier Läufe, 6 Batches, Checkpoint je Lauf in `scripts/quant/v13/delisted/checkpoint.json` (Batch 5 als Rauchtest, dann 0–2 und 3–4).
  - 8.620 Anfragen: alle HTTP 200, 4 Netzfehler im Wiederholungsversuch behoben.
  - 4.274 von 4.278 Tickern mit Kursen.
  - Das Ergebnis liegt nur verschlüsselt als Artefakt (RSA-OAEP + AES-256) und privat im Scratchpad. Im Repository stehen nur Zählungen, Schlüssel-IDs und Hashes.
  - Kontrollen: 10 gehaltene Titel stimmen auf allen 1.921 Wochen innerhalb von 0,5 % mit unseren Reihen überein.
- **Qualifikation:** Protokoll [1.0.0](v13/delisted/protocol-1.0.0.json), vor Datensicht registriert. Nachträge [1.0.1](v13/delisted/protocol-amendment-1.0.1.json) (vor dem ersten Lauf) und [1.0.2](v13/delisted/protocol-amendment-1.0.2.json) (nur Kennungen).
  - Geprüft werden Identität (CIK-Verknüpfung, Intervall), Abdeckung (≥ 55 Wochen, lückenlos), Delisting (SEC 25/15-12B im Fenster), Kapitalmaßnahmen (jeder splitgroße Sprung braucht einen Anbieter-Split und stimmt mit adjClose überein) und Endwert-Szenarien.
  - Ergebnis im [Register 1.0.0](v13/delisted/register-1.0.0.json):

| Status | Ketten |
|---|---:|
| **QUALIFIED** (SEC-belegtes Ende) | **1.675** (1.130 Fusion, 56 Notlage, 489 unbekannt) |
| nur Kurs, Ende zensiert | 151 |
| keine CIK-Verknüpfung | 1.819 |
| unerklärter splitgroßer Sprung | 209 |
| neueres Listing desselben Tickers | 162 |
| zu kurz / Lücken / Identität / Ausreißer / CA-Abweichung / nicht geliefert | 306 |

- **Abdeckung** ([coverage-1.0.0.json](v13/delisted/coverage-1.0.0.json)):

| Jahr | gegen Anbieterreferenz vorher → nachher | SEC-Delisting-Ereignisse mit Kursreihe |
|---|---|---|
| 2005 | 57,9 % → 74,1 % | 0 → 0 von 234 |
| 2009 | 53,5 % → 71,3 % | 0 → 12 von 620 |
| 2015 | – | 3 → 125 von 413 |
| 2018 | 62,0 % → 75,6 % | 1 → 125 von 388 |
| 2022 | 71,1 % → 82,5 % | – |
| 2024 | 81,6 % → 86,6 % | 22 → 134 von 504 |
| gesamt | – | **94 → 1.758 von 12.161** |

  - PIT-S&P-500-Austritte ohne Folgekurs: 39 von 748 jetzt mit belegtem Kurs.
  - Vor 2009 bleibt die Lücke, weil die Anbieterliste dort kaum delistete Listings führt.
- **Research-Modul:** `quant/engines/research-delisted-series.cjs` bindet die privaten Reihen über chainId, Status und pointsSha256 an das öffentliche Register (fail closed). Es ist kein Loader-Schalter, und der Produktpfad ist unberührt.

## 2. Git-Historie von PR #1091

- Vor der Bereinigung gesichert in [v13/provenance](v13/provenance/pr1091-history-before-rewrite.json): Reihenfolge, Zeitstempel und SHA-256 aller Protokolldateien je Commit sowie die alt→neu-Zuordnung der 134 Commits.
- Die zwei Dateien mit zeilenweisen Anbietermetadaten (`v12/listref/fetch-candidates-1.0.2.json`, `delisting-register-1.0.2.json.gz`) wurden mit filter-branch aus `origin/main..HEAD` entfernt; Baum identisch.
  - Freeze-Chronologie 1.0.1 zeigt auf die neuen Commits, 1.0.0 bleibt hashgebunden erhalten.
  - Force-push mit Lease.
- Geprüft: keine der 989 Remote-Branches enthält die alten Commits.
- **Hinweis:** GitHub hält überschriebene Commits per SHA und über `refs/pull/1091/*` eventuell weiter erreichbar. Eine vollständige Löschung kann nur der GitHub-Support oder der Owner veranlassen. Main und fremde Branches wurden nicht umgeschrieben.

## 3. Große Titel (AAPL, ABT, MS, USB, DD, COR, DOC)

Neue Methode [v13/largecap](v13/largecap/README.md):
- Protokoll vor jedem Abruf registriert.
- Preisbänder aus SEC-Kurstabellen und Rückkaufpreisen, Symbolketten mit Änderungsbeleg.
- Unabhängige Python-Prüfung: identische Intervalle; 78 konservative Befunde, nicht angewandt.

Alle sieben sind nur in geschlossenen Intervallen freigeschaltet:

| Titel | Intervall | Wochen |
|---|---|---:|
| AAPL | 2012-10 – 2025-09 | 678 |
| ABT | 2022-08 – 2026-06 | 204 |
| MS | 2008-09 – 2026-06 | 930 |
| USB | 2001-04 – 2026-06 | 1.317 |
| DD | 2017-11 – 2024-01 | 326 |
| COR | 2016-07 – 2026-06 | 522 |
| DOC | 2024-03 – 2026-04 | 113 |

Option `identityEvidenceProtocolV13Largecap` (eigene Liste, setzt V12 voraus): QUALIFIED 4.588 → 4.595.

## 4. Loader-Optionen

`identityEvidenceProtocolV10`, `identityEvidenceProtocolV12` und `identityEvidenceProtocolV13Largecap` sind nur für ausdrücklich aktiviertes Offline-Research freigegeben. Für Produktentscheidungen und Zertifizierungen gelten sie nicht.
- Der Default von `createResearchLoader` ohne Optionen ist der Produktadapter, byte-identisch.
- `weekly-real-adapter.cjs` und die Zertifizierungsgates sind unverändert; Tests prüfen das.

## 5. Protokolle

Registrierte und nachträgliche Änderungen sind getrennt versioniert, je mit Hash und Commit vor dem betroffenen Lauf.
- V13 delisted: Nachträge 1.0.1 (vor dem ersten Lauf) und 1.0.2 (nur Kennung).
- V13 Studien: Nachtrag 1.0.1, vor jeder Auswertung; F1w nur als Sensitivität.
- V13 largecap: Nachtrag 1.0.1, nach Formatsichtung und vor jeder Bandprüfung.

Nachträgliche Verbesserungen (Parserlücken, AAPL bis 2026-06) sind nur explorativ benannt, nicht angewandt.

## 6. Produkt-PRs (Entwürfe, je eigener Branch, CI grün, kein Merge)

| PR | Inhalt | Vorher → nachher |
|---|---|---|
| #1117 | Research-Portfolio: Vollverkauf ohne Rundungsrest | Rest bei 1e6/1e9 → 0 |
| #1118 | `cli.py consumer`: Coverage/Historie folgen `--out` | Testlauf schrieb in `quant/data/sec` → nicht mehr |
| #1119 | Security Master: SEC-belegtes Delisting → INACTIVE | 132 Zeilen ACTIVE → INACTIVE; **Owner-Freigabe nötig** (Refresh-Gate G7, Reihenfolge zur 1.3.0-Freigabe) |
| #1120 | Börsenwert bei XBRL-Skalenfehler zurückhalten (market-cap-1.2.0) | 3.788 → 3.786 Börsenwerte (LTM, CSHR – CSHR bewusster Fehlalarm) |
| #1121 | Belegte Spin-offs bereinigen Aktienzahl/EPS nicht | 78 → 0 falsche Bereinigungen; GE GJ 2023 121 → 152 Mrd. USD |

## 7. Wiederholte Studien ([v13/studies](v13/studies/README.md))

Registrierung [1.0.0](v13/delisted/study-registration-1.0.0.json) vor Datenempfang; Nachtrag 1.0.1 vor jeder Auswertung.
- Gleiche Regeln, Perioden, Kosten und Benchmark wie in V10–V12.
- Unabhängige Python-Prüfung: 20.717 Prüfungen, 0 Fehler. F0 reproduziert V10 exakt (60/60 Zellen).

**Populationen:**
- F0: 4.329 Listings.
- F1 (registriert): 4.719, davon +390 delistete Ketten. Die Wochenlabel-Regel schließt 1.186 Ketten aus, deren letzter Handelstag vor dem Modaltag der Woche liegt.
- F1w (Sensitivität): 5.905, davon +1.576 delistete Ketten.

**Ergebnisse:**
- **S1 Signale:**
  - SPY-Überrendite verschiebt sich um −0,01 … +0,14 PP (F1) bzw. 0,00 … +0,33 PP (F1w).
  - Holm-Ablehnungen 7 (F0, F1), 9 (F1w); **keine SPY-Überrendite-Zelle signifikant** in irgendeinem Frame.
  - Endwert-Szenarien verbreitern Zellen um median 0,05 PP. Gesamtrendite auf dem delisteten Teil +1,6 … +1,8 PP bei h52. Kosten ≈ 0,3 PP je Ereignis.
- **S2 gleichgewichtete Population 2000–2025** (wöchentlich rebalanciert): F0 13,86 %, F1 13,82 % (Band bis 13,65 %), F1w 13,81 % (bis 13,35 %), SPY 6,17 %.
- **S3 PIT-S&P-500:** 38 begrenzte Austritte durch belegte Kurse ersetzt. Survivorship-Term FATE 0,76 → 0,73 PP, Untergrenze LOWER 3,98 → 3,48 PP.
- **Zerlegung:** Population/Survivorship (F1−F0) und Delisting-Endwerte wirken im Bereich von Zehntel-PP. Gesamtrendite und Kosten wirken stärker als die Populationserweiterung. Die Selektion gegen die Basisrate verschiebt sich um −0,05 … +0,09 PP.

**Lesart:**
- Die Erweiterung um belegte Delistings ab 2010 ändert die V10–V12-Befunde nur in Zehntel-Prozentpunkten.
- Das ist kein Nachweis von Alpha, und kein Beleg, dass Strategien grundsätzlich keinen Mehrwert erzeugen können.
- Grenzen:
  - Delistings vor 2010 sind kaum abgedeckt.
  - 28 der 209 CA-unaufgelösten Ketten enden binnen eines Jahres nach einem Sturz, der Survivor-Tilt bleibt deshalb möglich.
  - Die Fusionsgegenleistung ist nicht verifiziert, nur als Band gerechnet.

## 8. Offene Freigaben

1. #1119: einmalige Gate-Freigabe und Reihenfolge zur 1.3.0-Umstellung.
2. MS 2008: strengere Intervallgrenze (neue Version) ja oder nein.
3. F1w als Frame-Regel für delistete Reihen: nur über eine neue Registrierung.
4. Belege vor 2010 (andere Endbelege oder Quellen) und die 28 Sturz-Kandidaten: Einzelprüfung.
5. GitHub-Support für die vollständige Löschung der überschriebenen PR-Commits, falls gewünscht.
6. Merge von PR #1091 und der fünf Produkt-PRs: Owner.
