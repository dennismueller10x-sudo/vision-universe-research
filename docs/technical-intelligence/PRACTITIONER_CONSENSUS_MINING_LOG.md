# Practitioner Consensus Reference — Mining-Protokoll (Mission VII)

Stand 05.10.2026. **PRACTITIONER CONSENSUS REFERENCE, nicht Ground Truth.** Extraktion LLM-dual aus der Primärquelle, nicht menschlich geprüft (Nachtrag 2). Grundlage: Nachtrag 7 (`PRACTITIONER_PROTOCOL.md`). Diese Sitzung hat nur Metadaten abgerufen, Kandidaten ausgewählt (Skript) und extrahiert. **Kein Freeze, keine Konsensklassen, kein Vergleich mit Ausgangsfällen, keine VU-Läufe.** Die Extrahierenden haben weder Ausgangsfälle noch VU-Ausgaben oder spätere Kurse gesehen. Keine V1-Zeile wurde gelesen; Holdout-Ausgangsfälle wurden nur über ihre Fallkennung verknüpft.

## 1. Ergebnis in Kürze

| Kennzahl | Wert |
|---|---|
| neue TradingView-Rahmen (Nachtrag 7 b) | 11 Autoren, 2.053 qualifizierende Ideen |
| Ausgangsfälle mit ≥ 1 Kandidat | 35 von 78 (geöffnet 21, versiegelt 14) |
| ausgewählte Kandidaten (je Fall × Fremdfamilie) | 83 Verknüpfungen, 82 verschiedene Fundstellen |
| davon unerreichbar (HKCM, YouTube-Sperre) | 3 (nicht umgangen) |
| bearbeitet (A + B, ggf. C) | 79 Fundstellen, 0 unbearbeitet |
| Status der 79 Zeilen | INCLUDED 13 · CANDIDATE 8 · EXCLUDED 58 |
| geöffnete Ausgangsfälle mit ≥ 1 INCLUDED-Referenz | 7 von 21 (8 INCLUDED-Verknüpfungen) |
| versiegelte Ausgangsfälle | nur Anzahlen: 40 Verknüpfungen an 14 Fälle, davon 5 INCLUDED an 4 Fälle |
| Schiedsdurchgänge C | 3 |
| Agentenläufe | 161 (A 79, B 79, C 3) |
| Kostenschätzung | ≈ 97 USD + Koordination ≈ 10 USD → **≈ 105 USD** (Budget 150 USD) |
| Tests `node --test quant/tests/practitioner-*.test.mjs` | grün an jedem Checkpoint-Commit (Skript committet nur bei `# fail 0`) |

Hauptbefund: **51 von 79** Fundstellen zählen im Intraday-Chart (1H/4H) und sind nach § 2.2 ausgeschlossen. Das betrifft vor allem die neuen TradingView-Autoren mit kurzfristigen BTC-Ideen (EduwaveTrading 14/14, pejman_zwin 7/7, Mehdi_Abbasi_EWP 4/5) und EWF-„Chart Of The Day“-Beiträge. Der Konsens-Rahmen ist dadurch dünn: 13 INCLUDED-Referenzen auf 11 Ausgangsfälle.

## 2. TradingView-Rahmen (Aufgabe 1)

Abruf am 05.10.2026 über `GET https://www.tradingview.com/api/v1/ideas/?by=<Autor>` (öffentlich, ohne Login, nur Metadaten). Rahmen mit denselben Regeln wie `tradingview-frame.py` (Nachtrag 5 d: Fenster 2022-01-01 bis 2026-06-30, Zielinstrumente US-Indizes/-Aktien/-ETFs/BTC, „Elliott“/„wave“ in Titel oder Kurzbeschreibung). Skript: `scripts/technical/practitioner/tradingview-consensus-frames.py`; Dateien: `practitioner-v1/consensus/frames/tv-<autor>.json` (Format wie `frames/tv-cryptoknee.json`, ohne Ziehung). Quellenverzeichnis: je Autor eine eigene `sourceFamily` `tv-<autor>`, Stufe C (vorläufig), `provisional: true`.

| Autor | Ideen im Rahmen | Jahre | abgerufen | frühestes abgerufenes Datum | Qualifikation 04.10. |
|---|---:|---|---:|---|---:|
| Mehdi_Abbasi_EWP | 144 | 2023–2026 | 1.000 (API-Grenze) | 2023-07-26 | 144 |
| M_Gheysvandi | 43 | 2023–2026 | 180 | 2020-07-29 | 43 |
| ThePennyMan | 56 | 2023–2026 | 102 | 2023-06-16 | 56 |
| TSuth | 418 | 2022–2026 | 573 | 2022-09-09 | 418 |
| EduwaveTrading | 350 | 2022–2026 | 920 | 2021-06-27 | 350 |
| TheExpert_81 | 47 | 2022, 2024–2026 | 240 | 2020-06-22 | 47 |
| ElliottChart | 533 | 2024–2026 | 780 | 2019-01-16 | 533 |
| DigitalSurfTrading | 57 | 2022–2026 | 200 | 2021-02-13 | 43 |
| SteveTan | 51 | 2022–2024 | 780 | 2021-11-16 | 51 |
| discobiscuit | 123 | 2023–2026 | 296 | 2021-08-14 | 123 |
| pejman_zwin | 231 | 2023–2026 | 1.000 (API-Grenze) | 2022-07-03 | 231 |
| **Summe** | **2.053** | | | | |

Keine nicht öffentlichen Ideen im Fenster. Die Zahlen stimmen mit `tradingview-qualification.json` überein, außer bei DigitalSurfTrading (57 statt 43): Am 05.10. lieferte die API 200 statt 140 Ideen.

## 3. Kandidatenauswahl (Aufgabe 2)

`node scripts/technical/practitioner/consensus-match.mjs` (Commit `aaed1804`), unverändert. Es gab keine Auswahl von Hand. Fenster nach Nachtrag 7 d: 13 Fälle mit ±5, 21 mit ±10 und 44 mit ±20 Handelstagen. Verteilung der Fremdfamilien je Fall: 0 → 43, 1 → 15, 2 → 7, 3 → 4, 4 → 6, 5 → 1, 6 → 1, 7 → 1.

Ausgewählte Fundstellen je Familie: ewf 17, eduwavetrading 14, pejman_zwin 7, tiedje 6, digitalsurftrading 6, stevetan 6, mehdi_abbasi_ewp 5, theexpert_81 3, yuchaosng 3, thefifthwave 3, discobiscuit 3, cryptoknee 4, tsuth 2, m_gheysvandi 1, hkcm 3 (YOUTUBE_BLOCKED). Die Fundstelle `tv-digitalsurftrading` SPX vom 08.12.2022 ist für zwei Ausgangsfälle die nächste; sie wurde einmal extrahiert und doppelt verknüpft.

**Geöffnete Ausgangsfälle** (Familie: Status, Abstand in Handelstagen):

| Ausgangsfall | Fenster | Verknüpfungen |
|---|---:|---|
| ewf\|CAT\|2023-01-08 | 20 | tiedje EXCL (−12) |
| ewf\|COIN\|2023-12-05 | 20 | tv-tsuth CAND (+13) |
| ewf\|DIS\|2023-01-02 | 10 | tiedje EXCL (+6) |
| ewf\|NVDA\|2023-08-15 | 10 | tiedje CAND (+8) |
| ewf\|ZM\|2022-08-16 | 20 | tiedje INCL (−17) |
| tv-cryptoknee\|BTCUSD\|2022-03-26 | 5 | eduwavetrading EXCL (0), stevetan CAND (+4) |
| tv-cryptoknee\|BTCUSD\|2022-09-04 | 10 | digitalsurftrading INCL (0), eduwavetrading EXCL (−1), theexpert_81 CAND (+1), thefifthwave EXCL (−8) |
| tv-cryptoknee\|BTCUSD\|2023-01-18 | 5 | eduwavetrading EXCL (+3), thefifthwave EXCL (−4) |
| tv-cryptoknee\|BTCUSD\|2023-09-16 | 10 | eduwavetrading EXCL (0), mehdi_abbasi_ewp EXCL (−3), stevetan INCL (+5) |
| tv-cryptoknee\|BTCUSD\|2024-04-28 | 5 | pejman_zwin EXCL (0), mehdi_abbasi_ewp EXCL (−3) |
| tv-cryptoknee\|SPY\|2022-12-06 | 5 | digitalsurftrading EXCL (+2) |
| tv-cryptoknee\|TSLA\|2022-12-28 | 10 | ewf EXCL (0), tv-tsuth EXCL (+2), stevetan INCL (−3) |
| tv-thefifthwave\|BTCUSD\|2023-01-29 | 5 | discobiscuit CAND (−1), eduwavetrading EXCL (−1), ewf EXCL (+1), cryptoknee INCL (−3) |
| tv-thefifthwave\|BTCUSD\|2023-04-17 | 5 | eduwavetrading EXCL (−1), ewf EXCL (−3) |
| tv-thefifthwave\|BTCUSD\|2023-07-10 | 5 | eduwavetrading EXCL (−2) |
| tv-thefifthwave\|BTCUSD\|2024-08-31 | 5 | tiedje EXCL (−1), pejman_zwin EXCL (−1) |
| tv-thefifthwave\|SPY\|2022-12-03 | 5 | digitalsurftrading EXCL (+4), cryptoknee INCL (+2) |
| tv-yuchaosng\|BTCUSD\|2024-03-22 | 5 | eduwavetrading EXCL (+1), mehdi_abbasi_ewp EXCL (−2), pejman_zwin EXCL (+2), ewf EXCL (+4) |
| tv-yuchaosng\|BTCUSD\|2024-09-29 | 5 | tiedje EXCL (+2), pejman_zwin EXCL (+3), hkcm UNREACHABLE (+5) |
| tv-yuchaosng\|QQQ\|2024-01-21 | 5 | ewf EXCL (+4) |
| tv-yuchaosng\|SPY\|2024-07-20 | 5 | ewf INCL (0), discobiscuit INCL (+3) |

**Versiegelte Ausgangsfälle (Nachtrag 7 a, nur Anzahlen):** 14 Fälle mit mindestens einem Kandidaten, zusammen 40 Verknüpfungen. Davon INCLUDED 5 (an 4 Fällen), CANDIDATE 3, EXCLUDED 30, UNREACHABLE 2. Die Verknüpfungen liegen in `consensus/sealed/links-sealed.json`. Die Referenzzeilen selbst stehen in `consensus/references.jsonl`; sie enthalten keine Angaben zum Ausgangsfall.

## 4. Extraktion (Aufgabe 3)

**Reihenfolge.** Zuerst alle Kandidaten der geöffneten Ausgangsfälle in der Reihenfolge der Fallkennung (k001–k042), danach die der versiegelten (k043–k082).

**Verfahren** wie in Phase 2 (Nachträge 2–4):
* Zwei unabhängige Durchgänge A und B, je ein eigener Agent mit derselben Anweisung. Gesehen haben sie nur die Quelle, die Plattform-Metadaten und das Fokusinstrument (aus der Fallkennung).
* Anweisungen: nur `/tmp`, nicht im Repository.
* Kernfeld-Abgleich mit `dual-extraction.mjs`; Schiedsdurchgang C nur für strittige Felder.
* C-Skip-Regel aus Phase 2: Sind A und B im Zeitrahmen INTRADAY, MIXED oder UNKNOWN einig, gibt es keinen Schiedsdurchgang.
* Sicherheit HIGH nur bei voller Übereinstimmung.
* Status nach V1:
  * Zeitrahmen ≠ 1D/1W/1M → EXCLUDED.
  * Ohne VU-Reihe, VU-Reihe deckt den Stichtag nicht ab (§ 2.4), Plausibilitätsband (Nachtrag 4) verletzt oder Sicherheit LOW → CANDIDATE.
* Zusammenführung: `scripts/technical/practitioner/consensus-assemble.mjs`. Die Zeilen validieren gegen Schema 1.2.0 (`viewKind: ORIGINAL_PUBLISHED`, eigene `referenceId` mit Endung `_mc`, eigene `caseId`).

**Status je Familie** (Zeilen):

| Familie | Fundstellen | INCLUDED | CANDIDATE | EXCLUDED |
|---|---:|---:|---:|---:|
| ewf | 17 | 1 | 1 | 15 |
| tv-eduwavetrading | 14 | 0 | 0 | 14 |
| tv-pejman_zwin | 7 | 0 | 0 | 7 |
| tiedje | 6 | 1 | 1 | 4 |
| tv-stevetan | 6 | 3 | 1 | 2 |
| tv-digitalsurftrading | 5 | 2 | 0 | 3 |
| tv-mehdi_abbasi_ewp | 5 | 1 | 0 | 4 |
| tv-cryptoknee | 4 | 2 | 0 | 2 |
| tv-discobiscuit | 3 | 1 | 1 | 1 |
| tv-theexpert_81 | 3 | 1 | 1 | 1 |
| tv-thefifthwave | 3 | 0 | 1 | 2 |
| tv-yuchaosng | 3 | 0 | 1 | 2 |
| tv-tsuth | 2 | 0 | 1 | 1 |
| tv-m_gheysvandi | 1 | 1 | 0 | 0 |
| **Summe** | **79** | **13** | **8** | **58** |

hkcm: 3 Verknüpfungen UNREACHABLE (ohne Zeile).

INCLUDED nach Zeitrahmen: 1D 6, 1W 5, 1M 2. Sicherheit: HIGH 10, MEDIUM 3.

**Gründe für EXCLUDED (58):**

| Grund | Anzahl |
|---|---:|
| § 2.2 Zeitrahmen INTRADAY | 49 |
| § 3 keine Analyse des Zielinstruments (A und B unabhängig) | 4 |
| § 2.2 Zeitrahmen UNKNOWN (Tiedje-Screener, Tiedje-Video) | 2 |
| SOURCE_UNREACHABLE (A und B; Video hinter Bot-Prüfung bzw. 88-min-Livestream) | 2 |
| § 3 keine Zählung/Muster/Invalidation/Ziel (mechanische Screener-Tabelle) | 1 |

Bei den vier Fällen „keine Analyse des Zielinstruments“ hatte der Titelabgleich falsch angeschlagen: „BNB/BTC“ für BTC, „NASDAQ: TWST“ für QQQ, sowie zwei weitere Treffer an versiegelten Fällen, darunter einer für QQQ und einer für Gold, beide zusätzlich Intraday. Insgesamt zählen 51 Fundstellen im Intraday-Chart.

**Gründe für CANDIDATE (8):**

| Grund | Anzahl |
|---|---:|
| Plausibilitätsband (Nachtrag 4) | 4 |
| § 2.4 VU-Tagesreihe deckt den Stichtag nicht ab (US-Aktien-1D vor 09/2025) | 3 |
| § 2.3 weder Zählung noch Invalidation noch Zielzone (nur Trendlinie, nicht ausgeschlossen) | 1 |

Bei allen 13 INCLUDED-Verknüpfungen stimmt das Instrument der Referenz mit dem des Ausgangsfalls überein (`anchorInstrumentMatch: true`). Abweichungen treten nur bei EXCLUDED-Zeilen auf (Intraday-Charts anderer Werte, falsche Titeltreffer).

## 5. A↔B-Übereinstimmung je Kernfeld

Basis: 77 Fundstellen, in denen A und B die Quelle erreicht haben.

| Kernfeld | gleich | abweichend | nicht genannt | Übereinstimmung |
|---|---:|---:|---:|---:|
| Familie | 71 | 2 | 4 | 97,3 % |
| aktuelle Welle | 62 | 7 | 8 | 89,9 % |
| Richtung | 73 | 2 | 2 | 97,3 % |
| Invalidation (±1 %) | 37 | 1 | 39 | 97,4 % |
| Zeitrahmen | 73 | 1 | 3 | 98,6 % |
| Instrument | 75 | 2 | 0 | 97,4 % |

Die Werte liegen höher als in Phase 2. Grund ist vor allem der hohe Anteil eindeutiger Intraday-Ideen.

Schiedsdurchgänge C gab es 3: k005 (Instrument „ZOOM“ gegenüber ZM), k045 und k064 (aktuelle Welle). Die übrigen Abweichungen betreffen Zeilen, die nach der C-Skip-Regel ohnehin EXCLUDED sind.

## 6. Unerreichbare Quellen

* HKCM (YouTube): 3 ausgewählte Kandidaten, als UNREACHABLE verknüpft. Kein Abruf, keine Umgehung.
* Tiedje „Video-Analyse“ (2 Fundstellen): Die Analyse steckt im eingebetteten YouTube-Video. Ergebnis: SOURCE_UNREACHABLE bzw. Zeitrahmen UNKNOWN. Nicht umgangen.
* DigitalSurfTrading „Live stream“: Der Inhalt ist nur im 88-minütigen Video. SOURCE_UNREACHABLE.

## 7. Kosten

161 Agentenläufe (A 79, B 79, C 3), je ≈ 52–68 k Tokens. Gerechnet mit ≈ 0,60 USD je Lauf wie in Phase 2 ergibt das ≈ 97 USD. Dazu kommen Koordination und Metadatenabruf (11 Ideen-Listen, 23 Plattform-Metadatenabrufe), zusammen **≈ 105 USD**. Es gab keine abgebrochenen Läufe. Die Zahl ist eine Schätzung, keine Abrechnung.

## 8. Abweichungen und Entscheidungen (offengelegt)

1. **Reihenfolge** (Nachtrag 7 l: „geöffnete Impulsfälle zuerst“): nicht umsetzbar, ohne Ausgangszeilen zu lesen. Auf Anweisung des Auftraggebers wurden die geöffneten Fälle zuerst bearbeitet, in der Reihenfolge der Fallkennung. Die Reihenfolge ist ohne Folgen, weil alle Kandidaten bearbeitet wurden (kein Budgetstopp).
2. **API-Grenze 1.000 Ideen** (Mehdi_Abbasi_EWP, pejman_zwin): Die öffentliche Liste endet bei 1.000 Einträgen. Ideen vor 2023-07-26 bzw. vor ≈ 2022-07 fehlen deshalb im Rahmen. Eine zweite Sortierung (`sort=recent`) lieferte dieselben 1.000 Einträge. Keine Umgehung; im Rahmen als `coverage.truncatedByApiCap` vermerkt.
3. **Extraktionsanweisung rekonstruiert:** Die Phase-2-Anweisungen und das Montage-Skript lagen nicht im Repository. Die neue Anweisung setzt die Feldregeln der Nachträge 2–4 und der README um. Das neue Skript `consensus-assemble.mjs` übernimmt die dokumentierten Phase-2-Korrekturen:
   * Wellenlabels (Korrektur 5): eingekreiste Ziffern → „((n))“, Doppellabels → UNKNOWN.
   * Instrument-Namensabgleich (Korrektur 1): C bestätigt das Instrument; gilt dann die erste abbildbare Schreibweise von A/B.
4. **Präzisierung nach der Pilotfundstelle k001:**
   * Anlass: Tiedje-ICE-Screener-Tabelle, A und B unsicher.
   * Neue Regel: Stop- und Zielwerte allein aus einer mechanischen Screener- oder Signaltabelle gelten als „NO_STRUCTURE“, wie die V1-Ausschlüsse „ICE-Screener-Tabelle, keine Zählung“.
   * Gilt ab k002. k001 ist davon unberührt: A und B gaben übereinstimmend Zeitrahmen UNKNOWN an → EXCLUDED.
5. **Fehler im Zusammenführungsskript (behoben vor Commit `748bbea7`):** Die Validierung lief zunächst mit Status CANDIDATE. Dadurch griff § 2.3 nicht, und eine Zeile ohne Zählung (tv-yuchaosng QQQ, 10.03.2025) wäre INCLUDED gewesen. Der Coordinator-Test `practitioner-consensus` hat das bemerkt. Jetzt wird als INCLUDED validiert; die Zeile ist CANDIDATE.
6. **levelScale:**
   * EXACT: 1, außer der Chartkurs weicht > 5 % vom VU-Schluss am Stichtag ab; dann das Verhältnis, mit Warnung.
   * Proxy: VU-Schluss / Chartkurs, sonst der Kartenwert.
   * Kurse nur bis zum Stichtag (`barsUntil`), kein Engine-Lauf.
7. **Bearbeitungszeitstempel:**
   * EWF: `modified_gmt` mehr als 60 min nach Veröffentlichung → `editedAfterPublication: UNKNOWN` (Nachtrag 3.3).
   * TradingView: Updates sind Anhänge → `NO`.
   * Tiedje: kein `dateModified` → `NO`.
8. **Überschneidung mit V1 nicht geprüft:** Eine Fundstelle kann zugleich eine V1-Zeile ihrer eigenen Quelle sein (z. B. EWF-Beiträge). Ein Abgleich hätte V1-Zeilen gelesen, auch versiegelte; er wurde daher nicht gemacht. Die neuen Zeilen haben eigene `referenceId`s (`_mc`). Ihre `caseId` kann formal einer V1-`caseId` gleichen. Die Duplikaterkennung liegt beim Auftraggeber (`detectDuplicates` in `run-consensus.mjs`).
9. **Falsche Titeltreffer** des Abgleichs (TWST/LCID für QQQ, BNB/BTC, GDX für Gold) wurden nicht von Hand entfernt. Sie wurden extrahiert und nach § 3 ausgeschlossen bzw. als Intraday ausgeschlossen. Kein Nachtrag 8: Die Fenster- und Auswahlregel blieb unverändert, und die Extraktion fängt solche Treffer ab.
10. **Verknüpfungsfelder:** Zusätzlich zu den vorgegebenen Feldern trägt jede Verknüpfung `anchorInstrumentMatch` (vuSymbol der Referenz = Symbol der Fallkennung). Nicht verknüpfte, unerreichbare Kandidaten tragen `referenceId: null`.

## 9. Restrisiken

* Die LLM-Extraktoren haben allgemeines Wissen über den späteren Marktverlauf. Nach eigener Angabe haben sie es nicht genutzt; in keiner Ausgabe ist `usedOwnMarketKnowledge` gesetzt.
* Die Kandidatenauswahl hängt an Titel- bzw. Symbol-Aliasen. Fundstellen ohne Instrument im Titel fehlen (z. B. Tiedje-Sammelartikel „DOW – …“ werden nur über genannte Einzelwerte gefunden).
* Der Konsens wird nur aus INCLUDED-Referenzen gebildet: 13 Zeilen, 8 davon an geöffneten Fällen. Die Mehrheit der geöffneten Fälle bleibt voraussichtlich D SINGLE. Die Klassifikation macht der Auftraggeber.

## Nachtrag 9: zwei weitere Fundstellen

Anlass: Nachtrag 9 a (ergänzte TradingView-Aliase SPY `SPXUSD/SPX500/SPX500USD`, QQQ `NAS100/NAS100USD/NDQ`). Der erneute Lauf von `consensus-match.mjs` (hier nur nach `/tmp`, die Abgleichsdatei verantwortet der Auftraggeber) ergibt 3 neue Verknüpfungen an geöffneten Ausgangsfällen. Eine davon ist eine eingefrorene geöffnete V1-Fundstelle (tv-thefifthwave SPXUSD, 03.12.2022); sie wird nach Nachtrag 9 b nicht neu extrahiert. Versiegelte Fälle: keine Änderung. Neu extrahiert, mit unverändertem Verfahren (A und B unabhängig, C-Skip-Regel, Zusammenführung mit `consensus-assemble.mjs`):

| Nr. | Fundstelle | verknüpft mit | Zeitrahmen | Status | Grund |
|---|---|---|---|---|---|
| k083 | tv-eduwavetrading, 04.12.2022, „Shorts for SPX500USD if it reaches the 4H supply?“ | tv-cryptoknee\|SPY\|2022-12-06 (−1, Fenster 5), tv-thefifthwave\|SPY\|2022-12-03 (0, Fenster 5) | INTRADAY (4H) | EXCLUDED | § 3 (A und B unabhängig): nur Angebots-/Nachfragezonen, keine Zählung, kein Muster, keine Invalidation, kein Zahlenziel |
| k084 | tv-eduwavetrading, 21.07.2024, „Big correction down for SPX500USD“ | tv-yuchaosng\|SPY\|2024-07-20 (0, Fenster 5) | INTRADAY | EXCLUDED | § 2.2 Zeitrahmen INTRADAY |

**A↔B:**
* k083: Richtung, Zeitrahmen und Instrument gleich; Familie, Welle und Invalidation von beiden nicht genannt.
* k084: Familie (MOTIVE), Welle ((4)), Richtung (DOWN), Zeitrahmen und Instrument gleich; Invalidation nicht genannt.
* Kein Schiedsdurchgang. Sicherheit beider Zeilen HIGH.

**Kosten:** 4 Agentenläufe ≈ 2,40 USD. Gesamt Mission VII damit ≈ 107 USD.

**Bestand danach:** 81 Zeilen in `consensus/references.jsonl` (INCLUDED 13 · CANDIDATE 8 · EXCLUDED 60). `consensus/links.json`: 46 Verknüpfungen an geöffnete Ausgangsfälle.
