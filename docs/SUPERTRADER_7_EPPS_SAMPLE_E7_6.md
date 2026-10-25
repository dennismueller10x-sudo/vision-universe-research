# Supertrader 7.0 – EP/PS: größere Intraday-Stichprobe nach Eigentümerentscheidung E7-6

Stand 25.10.2026. Betrifft Kullamägi Episodic Pivot (C09) und Parabolic Short (C10), chart-first. Grundlage: `SUPERTRADER_KK_EP_PS_CHART_FIRST.md`, Abschnitt 8 (Plan E5, Prioritäten 1 und 2).

- **Status:** `DIAGNOSTIC_NOT_CERTIFIED`. EP und PS bleiben `VALIDATION_BLOCKED`, `LIVE_NOT_APPROVED`. Keine Zertifizierung, keine Live-Aktivierung, keine Orders, keine Änderung der Oberfläche.
- **Kennzahlen:** nur versiegelt (Eigentümerschlüssel) auf `claude/supertrader-validation-results`. Hier stehen nur Zählwerte und Hashes.

## 1. Entscheidung E7-6

Wortlaut des Eigentümers: „Ich genehmige einmalig bis zu 550 zusätzliche Tiingo-Intraday-Anfragen innerhalb des bereits bestehenden Budgets, sofern die vorhandene Lizenz die interne Verwendung erlaubt. Die Stichprobe soll vorab nach nachvollziehbaren Kriterien geschichtet werden. Keine Auswahl nach Profitabilität und keine Änderung bisheriger Referenzen.“

Umsetzung in einem Satz: eine vorregistrierte Zusatzstichprobe `CLEAN_EXT_E7_6`, einmal abgerufen (481 Anfragen), ausgewertet neben den unveränderten Referenzen.

## 2. Lizenzgrundlage und Lücke

Die Belege sind bestehende Dokumente; sie lagen vor dem Abruf im Repository vor. Diese Zusammenstellung wurde erst nach dem Abruf committet (Review #920), der Vorregistrierungs-Commit `694b91c` enthält sie nicht:

| Beleg | Inhalt |
|---|---|
| `quant/config/provider-profiles.json`, Tiingo `licensing` | `OWNER_DECLARED_LICENSED` (13.09.2026). Entwicklung, kommerzielle Nutzung, Caching und historische Speicherung sind `OWNER_DECLARED`. Laut Notiz deckt die Erklärung sogar die öffentliche Anzeige von Intraday-Daten. |
| `docs/SUPERTRADER_VALIDATION_INTERNAL.md` | Freigabe vom 01.10.2026: „Abruf, private Speicherung und interne Auswertung im bestehenden Tiingo-Abo“. Nicht abgedeckt: ein neuer kostenpflichtiger Vertrag und die Veröffentlichung neuer Backtest-Kennzahlen. |
| ebenda, Runde 9 | Der bestehende Tiingo-Zugang liefert IEX-Minuten ab 2017. Rechte: nur interne, nicht anzeigende Nutzung; keine Minutenwerte auf der Website. |
| `scripts/supertrader/validation/PREREGISTRATION.json` | `rightsBasis`: dieselbe Owner-Freigabe für Abruf, private Speicherung und interne Auswertung. |
| frühere EP/PS-Läufe | 39931778756, 39933893419 und 39939887192 haben IEX-Minuten unter derselben Freigabe abgerufen. |

Ergebnis: Kein Dokument im Repository widerspricht der internen Forschungsnutzung von Intraday-Daten. Die Erweiterung ist eine interne Auswertung im bestehenden Abo. Sie bringt keinen neuen Anbieter und keine neuen Kosten, und sie veröffentlicht keine Kennzahlen.

**Lücke:** Der Vertragstext liegt dem Repository nicht vor (`contractInRepository: false`). Eine eigene Rechtsprüfung gibt es nicht. `OWNER_DECLARED` ist eine Erklärung des Eigentümers, kein geprüfter Vertragsbeleg. Offen bleiben `aiUsage` und `modelTraining` (`UNKNOWN`). Beides betrifft diese Auswertung nicht: Sie trainiert kein Modell.

## 3. Vorregistrierung (vor dem ersten Abruf committet)

Commit `694b91c57` legt die Regeln fest. Erst danach lief der Planlauf, dann der Abruf. Code: `scripts/supertrader/source-faithful/research/kk-sample-ext-e7-6.mjs`.

| Punkt | Festlegung |
|---|---|
| Kennung | `CLEAN_EXT_E7_6`, Version `kk-sample-ext-e7-6-1.0.0` |
| Vorregistrierungs-Hash | `1422f2efb6eaa0f1f643995679a39f07ae1f196d3b6fe4a02dd258220ce853f8`, festgeschrieben im Test `E7-6-PREREG` |
| Schichten | bestehendes Schema `YEAR_X_LIQUIDITY` aus `kk-sample.mjs`: Jahr des Handelstags × mittlerer Rohdollarumsatz der 20 Sitzungen davor (Grenzen 10 und 100 Mio. USD). Mindestgröße 100 Kandidaten; kleinere Schichten nehmen nicht teil und werden gezählt. |
| Zielanteil je Schicht | PS 3,5 % (35/1000), EP 15 % (15/100), exakt ⌊Anteil × Kandidaten⌋ Tage |
| Auswahl | je Schicht die ersten Tage in der bestehenden Reihenfolge sha256(`TICKER\|Datum`). Gecachte Tage werden weiterverwendet, die nächsten noch nicht gecachten abgerufen. |
| Anfragen je Tag | PS: 1 (Minuten). EP: Minuten 1 + IEX-Volumenbasis 1, jeweils nur wenn sie fehlen |
| Priorität unter der Obergrenze | Schritt 1 (PS) vollständig zuerst, dann Schritt 2 (EP), je in globaler Hash-Reihenfolge der fehlenden Tage. Der Plan endet am ersten Tag, der nicht mehr passt. Ein EP-Tag beginnt nie ohne Platz für beide Anfragen. |
| Obergrenze | 550 HTTP-Versuche einschließlich Wiederholungen, fail closed: Der Plan liegt nie darüber. Der Abruf bricht vor jedem Versuch ab, der sie überschreiten würde (`EXT_E7_6_REQUEST_CAP_REACHED`), und beendet sich dann mit einem Fehler, nicht still. |
| einmalig | Ein privates Ledger wird vor der ersten Anfrage geschrieben. Jeder weitere Abruf wird verweigert (`EXT_E7_6_ALREADY_FETCHED`). |
| Tagessätze | PS: Zieltage mit Minuten. EP: Zieltage mit Minuten und IEX-Basis > 0 (Regel des EP-Gemeinschaftssatzes). |
| Ergebnisunabhängigkeit | Eingaben sind nur Schlüssel, Jahr und Liquidität vor dem Handelstag. Renditen, PnL und spätere Kurse gehen nicht ein (Mutationstest `E7-6-OUTCOME-BLIND`). |
| Referenzen | unverändert. Die Erweiterung schreibt eigene private Cache-Objekte (`kk-epps-v2/ext-e7-6/…`). `BEFORE_FIX`, `CLEAN` und `STRAT_*` werden nur aus dem Referenz-Cache gebildet. |

Workflow-Modi (nur manuell, ohne Commit-Marke):
- `kk-intraday-e76-count`: Plan ohne API-Schlüssel, 0 Anfragen.
- `kk-intraday-e76`: der eine Abruf.
- Die Auswertung läuft im bestehenden Modus `kk-intraday-cache` (0 Anfragen, kein Schlüssel). Er wertet `CLEAN_EXT_E7_6` zusätzlich aus.

## 4. Anfragen: geplant, gezählt, verbraucht

| | Lauf | Anfragen |
|---|---|---|
| Plan E5 (Schätzung) | – | ≈ 548 (PS ≈ 294, EP ≈ 254) |
| Zähllauf | [40184926658](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40184926658) | **481** benötigt: PS 263 Tage = 263, EP 109 Tage × 2 = 218. Keine Kürzung nötig. Plan-Hash `4ce6159bd652…`. Der Lauf selbst stellte 0 Anfragen. |
| Abruf | [40185337539](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40185337539) | **481 verbraucht** von 550 (`COMPLETE`): 372 Minuten-Anfragen, 109 Basis-Anfragen (4hour), alle mit Status 200. Keine Wiederholung. |
| Auswertung | [40185748527](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40185748527) | **0** (`CACHE_ONLY_ZERO_REQUESTS`). Danach ist der Restplan 0, das Ledger steht auf `COMPLETE`. |

Die Schätzung aus E5 lag höher als der Zähllauf, weil sie vom behaltenen Anteil der alten Schichtung ausging. Der Zähllauf geht von den schon gecachten Präfixtagen aus.

## 5. Referenzen unverändert (Beleg)

Lauf 40185748527 läuft auf dem Code dieses Zweigs. Jeder Referenzblock seiner öffentlichen Ausgabe ist identisch mit dem bisher maßgeblichen Lauf 40107434014:
- Kandidaten, `intradayCoverage`, `sampling`, alle EP-Tagessätze und PS-Sätze mit allen `tradesSha256` und `ledgerSha256`;
- Referenz-Cache-Hashes `minuteCacheSha256` `c399a88c…` und `baselineCacheSha256` `911b53b5…`;
- die Tagessatz-Hashes sowie die Register von Stichprobe, EP und PS.

Der Lauf ist jetzt `AUTHORITATIVE`. 40107434014 ist `SUPERSEDED_BY_40185748527_SAME_PUBLIC_RESULTS`. Nur `researchCodeSha256` ist neu, weil das Erweiterungsmodul im Code-Hash steht.

## 6. Schichten vorher und nachher (Anteil der Kandidaten je Schicht)

Spalten:
- **vorher CLEAN:** Tage des Referenz-Tagessatzes `CLEAN` in der Schicht (EP: Gemeinschaftssatz mit Basis > 0).
- **vorher STRAT:** behaltene Tage der bisherigen geschichteten Stichprobe `STRAT_YEAR_X_LIQUIDITY`. Gemeinsamer Anteil PS 2,1 %, EP 11,3 % (bei EP vor der Basisregel).
- **nachher:** `CLEAN_EXT_E7_6`.

### Parabolic Short (Ziel 3,5 %)

Alle 30 Schichten nehmen teil. 2 266 Zieltage, alle mit Minuten, keine Lücke. Gemeinsamer Anteil vorher 2,1 % (48/2 235), nachher 3,4 % (40/1 165). Die Abweichung von 3,5 % kommt nur vom Abrunden auf ganze Tage.

| Schicht | Kandidaten | vorher CLEAN | vorher STRAT | nachher CLEAN_EXT_E7_6 |
|---|---|---|---|---|
| 2017 · ≥ 100 Mio. | 1165 | 35 (3,0 %) | 25 (2,1 %) | 40 (3,4 %) |
| 2017 · 10–100 Mio. | 2686 | 89 (3,3 %) | 57 (2,1 %) | 94 (3,5 %) |
| 2017 · 1–10 Mio. | 2023 | 57 (2,8 %) | 43 (2,1 %) | 70 (3,5 %) |
| 2018 · ≥ 100 Mio. | 983 | 33 (3,4 %) | 21 (2,1 %) | 34 (3,5 %) |
| 2018 · 10–100 Mio. | 2235 | 48 (2,1 %) | 48 (2,1 %) | 78 (3,5 %) |
| 2018 · 1–10 Mio. | 1837 | 57 (3,1 %) | 39 (2,1 %) | 64 (3,5 %) |
| 2019 · ≥ 100 Mio. | 1099 | 37 (3,4 %) | 23 (2,1 %) | 38 (3,5 %) |
| 2019 · 10–100 Mio. | 2591 | 72 (2,8 %) | 55 (2,1 %) | 90 (3,5 %) |
| 2019 · 1–10 Mio. | 2157 | 70 (3,2 %) | 46 (2,1 %) | 75 (3,5 %) |
| 2020 · ≥ 100 Mio. | 1671 | 44 (2,6 %) | 35 (2,1 %) | 58 (3,5 %) |
| 2020 · 10–100 Mio. | 3483 | 117 (3,4 %) | 74 (2,1 %) | 121 (3,5 %) |
| 2020 · 1–10 Mio. | 2270 | 73 (3,2 %) | 48 (2,1 %) | 79 (3,5 %) |
| 2021 · ≥ 100 Mio. | 1624 | 63 (3,9 %) | 34 (2,1 %) | 56 (3,4 %) |
| 2021 · 10–100 Mio. | 3111 | 92 (3,0 %) | 66 (2,1 %) | 108 (3,5 %) |
| 2021 · 1–10 Mio. | 2462 | 73 (3,0 %) | 52 (2,1 %) | 86 (3,5 %) |
| 2022 · ≥ 100 Mio. | 1106 | 32 (2,9 %) | 23 (2,1 %) | 38 (3,4 %) |
| 2022 · 10–100 Mio. | 2228 | 73 (3,3 %) | 47 (2,1 %) | 77 (3,5 %) |
| 2022 · 1–10 Mio. | 1638 | 56 (3,4 %) | 35 (2,1 %) | 57 (3,5 %) |
| 2023 · ≥ 100 Mio. | 1595 | 51 (3,2 %) | 34 (2,1 %) | 55 (3,4 %) |
| 2023 · 10–100 Mio. | 3250 | 90 (2,8 %) | 69 (2,1 %) | 113 (3,5 %) |
| 2023 · 1–10 Mio. | 2138 | 81 (3,8 %) | 45 (2,1 %) | 74 (3,5 %) |
| 2024 · ≥ 100 Mio. | 2112 | 61 (2,9 %) | 45 (2,1 %) | 73 (3,5 %) |
| 2024 · 10–100 Mio. | 4291 | 132 (3,1 %) | 92 (2,1 %) | 150 (3,5 %) |
| 2024 · 1–10 Mio. | 2974 | 78 (2,6 %) | 63 (2,1 %) | 104 (3,5 %) |
| 2025 · ≥ 100 Mio. | 2029 | 67 (3,3 %) | 43 (2,1 %) | 71 (3,5 %) |
| 2025 · 10–100 Mio. | 2934 | 94 (3,2 %) | 63 (2,1 %) | 102 (3,5 %) |
| 2025 · 1–10 Mio. | 1827 | 50 (2,7 %) | 39 (2,1 %) | 63 (3,4 %) |
| 2026 · ≥ 100 Mio. | 2038 | 68 (3,3 %) | 43 (2,1 %) | 71 (3,5 %) |
| 2026 · 10–100 Mio. | 2394 | 80 (3,3 %) | 51 (2,1 %) | 83 (3,5 %) |
| 2026 · 1–10 Mio. | 1265 | 41 (3,2 %) | 27 (2,1 %) | 44 (3,5 %) |

### Episodic Pivot (Ziel 15 %)

27 von 30 Schichten nehmen teil. 2 017 Zieltage, alle mit Minuten und Basis-Antwort, keine Lücke. 166 Zieltage haben keine verwertbare IEX-Basis (zu wenige Sitzungen mit IEX-Volumen) und fallen nach der Regel des Gemeinschaftssatzes heraus. Im Tagessatz bleiben 1 851 Tage.

| Schicht | Kandidaten | vorher CLEAN (Basis > 0) | vorher STRAT (vor Basisregel) | Ziel 15 % (alle mit Minuten) | nachher im Tagessatz (Basis > 0) |
|---|---|---|---|---|---|
| 2017 · ≥ 100 Mio. | 67 | 6 (9,0 %) | 0 (0,0 %) | – (unter 100) | – |
| 2017 · 10–100 Mio. | 293 | 18 (6,1 %) | 33 (11,3 %) | 43 (14,7 %) | 22 (7,5 %) |
| 2017 · 1–10 Mio. | 294 | 25 (8,5 %) | 33 (11,2 %) | 44 (15,0 %) | 24 (8,2 %) |
| 2018 · ≥ 100 Mio. | 85 | 6 (7,1 %) | 0 (0,0 %) | – (unter 100) | – |
| 2018 · 10–100 Mio. | 390 | 35 (9,0 %) | 43 (11,0 %) | 58 (14,9 %) | 36 (9,2 %) |
| 2018 · 1–10 Mio. | 326 | 24 (7,4 %) | 36 (11,0 %) | 48 (14,7 %) | 25 (7,7 %) |
| 2019 · ≥ 100 Mio. | 81 | 7 (8,6 %) | 0 (0,0 %) | – (unter 100) | – |
| 2019 · 10–100 Mio. | 355 | 38 (10,7 %) | 39 (11,0 %) | 53 (14,9 %) | 51 (14,4 %) |
| 2019 · 1–10 Mio. | 304 | 36 (11,8 %) | 34 (11,2 %) | 45 (14,8 %) | 44 (14,5 %) |
| 2020 · ≥ 100 Mio. | 609 | 96 (15,8 %) | 68 (11,2 %) | 91 (14,9 %) | 90 (14,8 %) |
| 2020 · 10–100 Mio. | 1076 | 153 (14,2 %) | 121 (11,2 %) | 161 (15,0 %) | 158 (14,7 %) |
| 2020 · 1–10 Mio. | 764 | 107 (14,0 %) | 86 (11,3 %) | 114 (14,9 %) | 106 (13,9 %) |
| 2021 · ≥ 100 Mio. | 405 | 60 (14,8 %) | 45 (11,1 %) | 60 (14,8 %) | 60 (14,8 %) |
| 2021 · 10–100 Mio. | 679 | 99 (14,6 %) | 76 (11,2 %) | 101 (14,9 %) | 97 (14,3 %) |
| 2021 · 1–10 Mio. | 574 | 75 (13,1 %) | 64 (11,1 %) | 86 (15,0 %) | 79 (13,8 %) |
| 2022 · ≥ 100 Mio. | 245 | 31 (12,7 %) | 27 (11,0 %) | 36 (14,7 %) | 35 (14,3 %) |
| 2022 · 10–100 Mio. | 478 | 65 (13,6 %) | 53 (11,1 %) | 71 (14,9 %) | 70 (14,6 %) |
| 2022 · 1–10 Mio. | 370 | 67 (18,1 %) | 41 (11,1 %) | 55 (14,9 %) | 51 (13,8 %) |
| 2023 · ≥ 100 Mio. | 183 | 37 (20,2 %) | 20 (10,9 %) | 27 (14,8 %) | 26 (14,2 %) |
| 2023 · 10–100 Mio. | 442 | 56 (12,7 %) | 49 (11,1 %) | 66 (14,9 %) | 63 (14,3 %) |
| 2023 · 1–10 Mio. | 409 | 52 (12,7 %) | 46 (11,2 %) | 61 (14,9 %) | 55 (13,4 %) |
| 2024 · ≥ 100 Mio. | 342 | 51 (14,9 %) | 38 (11,1 %) | 51 (14,9 %) | 50 (14,6 %) |
| 2024 · 10–100 Mio. | 702 | 95 (13,5 %) | 79 (11,3 %) | 105 (15,0 %) | 104 (14,8 %) |
| 2024 · 1–10 Mio. | 564 | 90 (16,0 %) | 63 (11,2 %) | 84 (14,9 %) | 80 (14,2 %) |
| 2025 · ≥ 100 Mio. | 466 | 58 (12,4 %) | 52 (11,2 %) | 69 (14,8 %) | 66 (14,2 %) |
| 2025 · 10–100 Mio. | 937 | 142 (15,2 %) | 105 (11,2 %) | 140 (14,9 %) | 132 (14,1 %) |
| 2025 · 1–10 Mio. | 628 | 88 (14,0 %) | 70 (11,1 %) | 94 (15,0 %) | 93 (14,8 %) |
| 2026 · ≥ 100 Mio. | 466 | 61 (13,1 %) | 52 (11,2 %) | 69 (14,8 %) | 69 (14,8 %) |
| 2026 · 10–100 Mio. | 767 | 100 (13,0 %) | 86 (11,2 %) | 115 (15,0 %) | 108 (14,1 %) |
| 2026 · 1–10 Mio. | 468 | 50 (10,7 %) | 52 (11,1 %) | 70 (15,0 %) | 57 (12,2 %) |

Was die Tabelle zeigt:
- **Vor der Basisregel** liegt jede teilnehmende Schicht bei 14,7–15,0 % (vorher 11,3 % gemeinsam). Das ist der Maßstab des Plans E5.
- **Nach der Basisregel** liegen 2020–2026 bei 12,2–14,8 %. 2017 und 2018 bleiben bei 7,5–9,2 %. Dort haben 38–49 % der Zieltage zu wenige Sitzungen mit IEX-Volumen in den 20 Sitzungen davor. Anfang 2017 liegen diese Sitzungen zudem in 2016, für das es keine IEX-Minuten gibt. Die Basis-Antworten sind vorhanden; mehr Abrufe ändern daran nichts.
- **Gemeinsamer Anteil im Tagessatz:** vorher 6,1 % (18/293), nachher 7,5 % (22/293), beide bestimmt von 2017 · 10–100 Mio.
- **Schichten über dem Ziel:** Einige Schichten lagen im bisherigen `CLEAN` über 15 % (etwa 2023 · ≥ 100 Mio. mit 20,2 %). Dort nimmt `CLEAN_EXT_E7_6` genau die ersten 15 % in Hash-Reihenfolge. Der Tagessatz ist deshalb keine Obermenge von `CLEAN`: 258 gecachte EP-Tage liegen außerhalb und sind `NOT_EVALUATED_OUTSIDE_DAY_SET`.

## 7. Auswertung `CLEAN_EXT_E7_6` (Lauf 40185748527, nur Zählwerte)

| Tagessatz | EP REF | EP ohne Volumenregel | EP SF7-D5-Variante | PS REF (abgeschlossen) |
|---|---|---|---|---|
| `CLEAN` (Referenz, unverändert) | 611 | 1 042 | 606 | 228 |
| `STRAT_YEAR_X_LIQUIDITY` (unverändert) | 463 | 818 | – | 150 |
| **`CLEAN_EXT_E7_6`** | **615** | **1 061** | **611** | **262** |

- **EP-Varianten auf `CLEAN_EXT_E7_6` (Trades):** ORH-5 404 · ohne Volumenregel 1 061 · Ruhephase 408 · MA10 617 · MA50 601 · optimistische Fill-Minute 610 · Risiko 0,25 % 616 · Risiko 1 % 578. Alle Ledger sind abgestimmt.
- **EP REF, Ausstiegsgründe:** 392 Stops am selben Tag, 100 Stops an späteren Tagen, 17 Gap-Stops, 101 Schlüsse unter MA20, 3 Delistings, 2 offen.
- **PS-Varianten (abgeschlossen):** Serie ≥ 4: 51 · ohne Beschleunigung 1 416 · erste rote 5-Minuten-Kerze 305 · gescheiterter VWAP-Retest 267 · VWAP-Rückeroberung als Stop 262 · MA20 255 · halb MA10/halb MA20 254.
- **PS mit `ONE_POSITION_PER_TICKER`:** gleich bis auf „ohne Beschleunigung“ (1 414).
- **PS REF, Ausstiegsgründe:** 189 Stops über dem Tageshoch, 18 Gap-Stops, 1 Stop in der Fill-Minute, 54 am MA10-Ziel.
- **Tagessatz-Hashes:** EP `2bcfd0b5…`, PS `ab3399b8…`.
- **Erweiterungs-Cache:** 372 Minuten-Tage, 109 Basen. Die sha256 stehen im Artefakt.

Rendite, Trefferquote, R-Multiple, Drawdown und die Kennzahlen je Schicht liegen nur versiegelt vor. Sie wurden für diese Arbeit nicht gelesen.

## 8. Was die größere Stichprobe ändert und was nicht

Sie ändert:
- PS: von 2,1 % auf 3,4–3,5 % je Schicht, in allen 30 Schichten (Plan-Schritt 1 vollständig).
- EP: 15 % je teilnehmender Schicht vor der Basisregel (Plan-Schritt 2 vollständig).
- Die Stichprobe ist gleichmäßig über Jahr und Liquidität verteilt und vor jedem Ergebnis festgelegt.

Sie ändert nicht:
- **Es bleibt eine Stichprobe.** Abgedeckt sind rund 15 % der EP- und 3,5 % der PS-Kandidaten im IEX-Zeitraum. Das ist keine Vollabdeckung und keine repräsentative Gesamtaussage. Die Readiness-Stufen behalten den Zusatz `_HASH_ORDER_SAMPLE`.
- **Nur IEX:** IEX-Minuten und IEX-Volumen (1–5 % des Marktvolumens), kein konsolidiertes Band, keine Minuten vor 2017.
- **Kein Strategie-Backtest:**
  - EP ist eine chartbasierte Modellstudie ohne Katalysator (`CATALYST_CONFIRMED_ORIGINAL_EP` nie vergeben).
  - PS ist eine hypothetische Einzeltrade-Studie ohne Leihdaten (`BORROW_CONFIRMED_EXECUTABLE_SHORT` nie vergeben).
- **Keine Zertifizierung:** EP und PS bleiben `VALIDATION_BLOCKED`, `LIVE_NOT_APPROVED`.
- **Referenz:** Die Referenz bleibt `CLEAN`. `CLEAN_EXT_E7_6` ist ein zusätzlicher Tagessatz daneben und ersetzt keine Referenz.

## 9. Verbleibende Grenzen der Grundgesamtheit

- EP 2017, 2018 und 2019 mit ≥ 100 Mio. USD: 67, 85 und 81 Kandidaten, also unter der Mindestgröße 100. Diese Schichten fehlen weiter in jeder Schichtung.
- EP 2017 und 2018: Viele Tage haben keine IEX-Volumenbasis (siehe Abschnitt 6). Der Tagessatz kommt dort nur auf 7,5–9,2 %.
- Keine IEX-Minuten vor 2017. EP- und PS-Kandidaten aus 2016 werden gescreent, aber nie simuliert.
- Der Minuten-Cache ist privat und nicht im Snapshot eingefroren. Er ist über seine sha256 reproduzierbar, aber nicht zertifizierbar.

## 10. Betriebshinweise

- **Getrennter Cache:** Die Erweiterung liegt in eigenen privaten Objekten. Die Referenz-Tagessätze lesen nur den Referenzcache.
- **Kein zweiter Abruf:**
  - Der einmalige Abruf ist verbraucht: Lauf 40185337539 mit 481 Anfragen.
  - Nach dem unabhängigen Review (HIGH: die Ledger-Prüfung ist nicht atomar, zwei gleichzeitig gestartete Läufe hätten beide abrufen können) ist der Abrufmodus aus dem Workflow **entfernt**. Ein Test (`sf-runner`) hält fest, dass er nicht mehr startbar ist.
  - Das Ledger bleibt eine zweite Sicherung, aber nicht die einzige.
  - Verfügbar bleiben nur der Planmodus `kk-intraday-e76-count` (0 Anfragen, ohne API-Schlüssel) und die Cache-Auswertung.
  - Eine weitere Aufstockung (Plan-Schritte 3 und 4) braucht eine neue Entscheidung, eine neue Vorregistrierung und einen eigenen PR. Dieser PR muss den Abrufmodus wieder einführen und dabei:
    - das Ledger direkt vor dem Schreiben neu lesen und bedingt schreiben (`If-None-Match`);
    - eine feste Concurrency-Gruppe setzen;
    - Checkpoints während des Abrufs schreiben.
- **Absturz während des Abrufs:** Der Erweiterungsabruf schrieb den Cache erst am Ende, ohne Checkpoint. Ein Absturz hätte den einen Abruf verbraucht, ohne Daten zu sichern. Eingetreten ist das nicht: Der Lauf endete mit `COMPLETE`.
- **Normaler `kk-intraday`-Abruf:** Dieser Modus hat bis zu 6.000 Anfragen je Lauf und kennt den Erweiterungscache nicht. Er würde die Erweiterungstage erneut in den Referenzcache holen und damit die Referenz-Tagessätze verschieben. Das war schon vor diesem PR möglich. Vor jedem solchen Lauf ist eine eigene Entscheidung nötig.
- **Tests:** `scripts/supertrader/tests/sf-kk-e7-6-sample.test.mjs`. Geprüft werden Vorregistrierungs-Hash, unveränderte Referenz-Hashes, Zielanzahl je Schicht, Mutationstest, Plan-Priorität und Obergrenze, Fail-closed-Abbruch (auch bei Wiederholungen), Ledger, 0 Anfragen im Cache-only- und Planlauf sowie die Tagessätze.
