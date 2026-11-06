# Quant V10 – Übergabe 1.0.0

Stand: 28.10.2026. Diese Übergabe sichert den integrierten V9-Abschluss, die sieben freigegebenen Folge-PRs und die freigegebene Testreparatur #1054. Sie startet keine neue Implementierung.

**Fachlicher Status: V9_METHODS_ACCEPTED_WITH_LIMITED_SCOPE**

| Kennzahl | Stand |
|---|---|
| technisch implementiert | 13/13 |
| im dokumentierten Scope methodisch abgenommen | 7/13 (7/7 Erweiterungsmethoden) |
| zertifizierte Backtest-Arten | **0/6** |
| `productionApproved` | `false` |

Die Abnahmen gelten ausschließlich methodisch und nur im dokumentierten, begrenzten Scope (Owner-Freigabe vom 28.10.2026). Für Portfolio-Rebalancing umfasst das nur die belegte Buchführungsmechanik.

## Integrierte Ausgangsbasis

Maschinenlesbare Fassung: [v10/handoff-1.0.0.json](v10/handoff-1.0.0.json), erzeugt mit `python3 scripts/quant/v10/build-handoff.py --out …` aus den V9-Belegen.

| PR | Inhalt | Merge-Commit auf main |
|---|---|---|
| #1028 | V9-Research, Berichte und Belege | `4036674271` |
| #1042 | PZZA-Split-Ergänzung in den Kursreihen-Herausgebern | `daa5a94867` |
| #1036 | Research-Ledger 1.2.0 | `62ac2e6470` |
| #1041 | Research-Identitätsregister, 5 Bindungen | `d743d342e1` |
| #1043 | SEC-Pipeline P1–P4 und DQ-SEC-1/2/3 | `d71fbbe642` |
| #1046 | SEC-geprüftes CA-Register, 24 Ereignisse / 23 Reihen | `3a93aeb8fd` |
| #1034 | DQ-PX-6/7, DQ-ID-4 | `a378b29cc6` |
| #1054 | Reparatur nach #1028/#1043: Bulk-Archiv-Wächter überspringt die Offline-Research-Ordner `v9/` und `v9_followups/`; Produktionsmodule und Verhaltens-Assertions unverändert | `5b5639f44d` |

**Keine Datei unter `*/data` wurde durch diese PRs geändert.** Die Datenwirkungen entstehen erst durch die bestehenden Erzeuger:

- **#1043:** Der nächste Lauf von `sec-consumer-fundamentals.yml` (Mo 07:30 UTC) schreibt alle 5.063 Bundles mit `normalization_logic` 1.14.0 neu, 416 davon mit neuem Inhalt. Danach folgen `product-intelligence-materialization.yml` sowie `update-sec-fundamentals`/`sec-fundamentals-daily`. Bei Übergabe zeigen die committeten Bundles noch 1.13.0.
- **#1042:** Der nächste `long-series.yml`-Volllauf (07.11.2026) oder ein Lauf mit `only=PZZA` halbiert die Wochenschlüsse von ref_PZZA vor dem 30.12.2013.
- **Research-Optionen:** Sie bleiben standardmäßig aus; kein produktiver Pfad importiert sie.
  - `createResearchLoader` default: 4.449
  - mit Identität: 4.453
  - mit Identität und CA: 4.476
  - TRAK nur mit gesondertem Cover-Flag; laut Owner von produktiver Zulassung ausgeschlossen.

## Die sechs Backtest-Zertifizierungen

Quelle: [Zertifizierungsreife](v9/certification-readiness-1.0.0.json).

| Art | Blocker | Klasse | Frühestens |
|---|---|---|---|
| SAME_STOCK_REPLAY | Survivor by construction; beschreibt, prüft keine Regel | strukturell | nur mit neuem Studiendesign (Fallauswahl aus damaliger Population) |
| PATTERN_EVIDENCE | Survivorship teilweise unquantifiziert; Kursrendite statt Gesamtrendite; Studie erklärt sich selbst als nicht zertifiziert | Evidenz/strukturell | nach TR-Studie und quantifizierter Survivorship |
| SIGNAL_BACKTEST | keine der 5 Regeln zertifiziert; Survivorship-Kontrolle nur Sensitivität ab 2016 | Evidenz | V9: kein belegter Überschuss ggü. SPY für NEW_52W_HIGH |
| SETUP_BACKTEST | 21/120 Stichtage, 46/180 Tage, 0/100 M6-Ergebnisse, 0/20 Titel, Monatszähler 2/20, OOS und Varianten nicht messbar, Kursrendite | Zeit + Norm | erste M6-Reife 26.03.2027; Unabhängigkeit siehe unten |
| STRATEGY_BACKTEST | Membership- und Faktorhistorie je 2/24 Monate | Zeit | 2028-08 (Schätzung aus der Zertifizierungsreife) |
| FACTOR_RANKING_BACKTEST | Faktorhistorie 2/24, abgeschlossene Forward-Monate 0/12, Membership 2/24 | Zeit | Forward 2028-01, Historie 2028-08 |

Historische Rückrechnungen ersetzen keine vorwärts gesammelte veröffentlichte Historie.

## Offene normative Entscheidung: Setup-Unabhängigkeit

**Owner 28.10.2026: nicht freigegeben; der Vertrag bleibt unverändert.**

Analyse ([setup-independence-1.0.0.json](v9/setup-independence-1.0.0.json)):
- Die 4.137 Ereignisse entsprechen für den mittleren M6-Ausgang nur **N_eff ≈ 17** (roh) bzw. ≈ 13 (SPY-Überschuss).
- 20 Wochen × 200 Titel ergäben N_eff ≈ 22.
- Weder Monats- noch ISO-Wochenzähler messen Unabhängigkeit.

Vorlage für eine spätere Entscheidung:
- das Zählfeld ehrlich benennen;
- ein eigenes Gate aus Mindest-N_eff unter einem vorregistrierten Block-/Clustermodell plus einer Mindestzahl nicht überlappender M6-Blöcke.

## Datenlücken und offene fachliche Probleme

1. **Historische Population:** Es gibt keine historische primäre US-Common-Population inklusive Delistings und keine Original-Membership-Historie. Alle Studien laufen auf heutigen Survivors.
2. **Identität:**
   - 180 mehrdeutige IDs bleiben gesperrt. 132 quellenbelegte Bindungen liegen nur als V9-Vorschlag vor, nicht freigegeben.
   - EFOR und SUNE bleiben gehalten.
   - TRAK hat keinen Preisbeleg.
   - 19 IDs sind ungelöst.
3. **Corporate Actions:**
   - 577 CA-Holds bleiben im Standardpfad.
   - Ungeprüft sind 440 Ereignisse vor 2011, 240 mit offener Identität und 215 ohne einklammernde Filings.
   - Spin-offs (ABT/AbbVie u. a.) sind nicht als Gesamtrendite modelliert.
   - Keine weiteren CA-Fälle ohne unabhängige Quellenprüfung.
4. **Eingefrorene Kursenden:** Gemeldet werden 341 Wochen- und 475 Tagesreihen sowie 103 Widersprüche zwischen Stamm und Reihe (DQ-PX-6/7, DQ-ID-4, nur WARN).
   - Ein Stamm-Erzeuger-Fix (INACTIVE bei Stale-Tail plus Form 25/15) ist offen.
   - Ebenfalls offen: ein Adapter-Sperrgrund und eine Discover-Kennzeichnung.
5. **Wochenlücken:** 218 Reihen mit 641 Lücken bleiben ungefüllt; Interpolation ist verboten.
6. **SEC/PIT:**
   - CAPS hat eine Lücke im Fiskalkalender (DQ-SEC-1 bleibt 2 nach Neubau).
   - 520 zukunftsdatierte Fälle sind nur per Stichprobe klassifiziert.
   - Acceptance bleibt Obergrenze, nicht Veröffentlichungszeit.
7. **Dividenden und Total Return:**
   - Belegte Zahlungstage nur für MSFT und WMT vollständig; JPM 15/47, XOM 14/47, META 1/11.
   - Ex-Tage nicht aus Quellen.
   - Zahlungseingang terminaler Barbeträge unbelegt (NOT_STATED, nie investierbar).
8. **Anbieter- und Stammfehler:**
   - Nachlaufende Wiederholungsschlüsse nach dem letzten Handelstag (CRNX, LBRDK, DBRG, WBS).
   - SAN im Stamm als `EQUITY_COMMON` statt ADS.
   - Die Bulk-`submissions.zip` liefert Annahmezeiten mit +4/5 h Versatz; sie wird nicht genutzt.
9. **Bestätigung:** Die prospektive 8-K-Kohorte ist registriert und ab 29.04.2027 auswertbar; kein anderer unberührter Holdout existiert.

## Arbeitsregeln für V10

- Unveränderte Gates.
- Fachmodelle nur in eigenen PRs mit Vorher/Nachher.
- Keine erzeugten Artefakte von Hand ändern.
- SEC über den bestehenden Fair-Access-Client mit ≤ 2 Anfragen/s je Strang.
- Keine neuen kostenpflichtigen Anbieter.
- Produktlesepfade (`weekly-real-adapter.cjs`, `corporate-action-evidence.js`, Backtest-Frische-Codes) nur mit gesonderter Freigabe ändern; Research-Erweiterungen über `research-weekly-loader.cjs`.
