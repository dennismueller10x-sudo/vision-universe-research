# Red-Team: PRACTITIONER_CONSENSUS_V1_1 (Mission VII, §33)

Stand: 05.10.2026.

**Prüfer:** unabhängiger Agent, nur lesend.
* Er hat weder versiegelte Referenzzeilen noch Holdout-Labels gelesen.
* Holdout-URLs hat er nur blind abgeglichen, als Zählung.

**Ergebnis:** 4 bestätigte Mängel, alle vor der endgültigen Interpretation behoben (Nachtrag 9, Freeze V1.2).

## Integritätsprüfung

Alle Prüfungen bestanden.

| Prüfung | Ergebnis |
|---|---|
| SHA-256 Freeze ↔ Manifest ↔ Benchmark | stimmt; die Auswertung verweigert manipulierte Freezes |
| Freeze in neuem Verzeichnis | identische Prüfsummen und Klassen (C 4, D 28, E 2, B 1, A 0, Impuls-Set 0) |
| Abgleich `matchCase` für 35 geöffnete Fälle | 0 Abweichungen zu `match-candidates.json` |
| Mensch-Mensch-Kennzahlen aus dem jsonl nachgerechnet | identisch (L1 3/5, L2 1/5, L3 3/4, L4 2/4, Ziele 0/3) |
| `practitioner-consensus.test.mjs` | 7/7 |

## Befunde und Behebung

| # | Risiko (§33) | Schwere | Urteil | Befund | Behebung |
|---|---|---|---|---|---|
| 1 | Datumsfenster / Auswahl | MITTEL | **bestätigt** | Alias-Lücke: SPY ohne `SPXUSD`/`SPX500`/`SPX500USD`, QQQ ohne `NAS100`/`NAS100USD`/`NDQ`. Dasselbe Postpaar SPX (thefifthwave 03.12.2022 / cryptoknee 06.12.2022) war mit dem einen Post als Ausgang C, mit dem anderen D. | Nachtrag 9 a: Aliase ergänzt und Abgleich für alle Fälle neu. 3 neue offene Verknüpfungen: 2 neue Fundstellen, extrahiert, beide INTRADAY → EXCLUDED; 1 eingefrorene V1-Zeile. cryptoknee SPY 06.12.2022: D → C. |
| 2 | Holdout-Kontamination | MITTEL | **bestätigt** (indirekt) | Abgleich-Zeilen versiegelter Fälle (14 mit URL, Titel, Datum) und 38 nur versiegelt verknüpfte Referenzzeilen lagen in offenen Dateien. Über die URL ließ sich `links-sealed.json` rekonstruieren, also fremde Lesarten zu versiegelten Fällen. Ausgangslabels selbst: 0 Treffer. | Nachtrag 9 c: verschoben nach `consensus/sealed/match-candidates-sealed.json` und `consensus/sealed/references-sealed.jsonl`; offen nur Anzahlen. Die frühere Git-Historie enthält sie weiter (offengelegt, KNOWN_LIMITATIONS 56). |
| 3 | Holdout-Kontamination | NIEDRIG–MITTEL | plausibel (latent) | Der Leck-Schutz prüfte nur die Fallkennung. Revisionen tragen die Kennung des Ursprungsfalls. | Nachtrag 9 b: zusätzlich URL-Abgleich gegen versiegelte V1-Zeilen, nur per Muster gelesen, ohne Parsen; Test. |
| 4 | Auswahlverzerrung | MITTEL | **bestätigt** | Eine einzige Plausibilitätsregel (Nebenzone 18.000) entschied die Klasse von cryptoknee BTC 26.03.2022. Zwei Referenzen waren nur CANDIDATE, weil die VU-Reihe fehlt. | Nachtrag 9 e: Sensitivität im Manifest. Hauptklassen unverändert nach Vorab-Regel. |
| 5 | Duplikate | NIEDRIG | bestätigt | Die Neuextraktionen zweier geöffneter V1-Fundstellen wurden mitgezählt; die Duplikatrichtung kippte durch Sekunden- gegen Minutengenauigkeit. Manifest-Summen zählten dieselbe Fundstelle doppelt. | Nachtrag 9 b/d: Die eingefrorene V1-Zeile vertritt die Fundstelle. Duplikate minutengenau; Mensch-Mensch-Paare und Manifest-Summen je URL. Für Mission V neutral geprüft (identische Duplikatliste). |
| 6 | Datumsfenster | NIEDRIG | bestätigt (Doku) | `tradingDaysBetween` zählt Mo–Fr ohne Feiertage, nicht „US-Börsentage“. Das ist konservativ; nur CAT 08.01.2023 hätte Fenster 10 statt 20, bei gleicher Klasse. Fenster-Missbrauch: **verworfen**. Alle Abstände liegen im Fenster, erweitert wurde nur ohne Treffer im engen Fenster. | Nachtrag 9 f: dokumentiert; die Zählung bleibt. |
| 7 | Zeitrahmen-Mismatch | – | verworfen | Eltern/Kind-Paare sind vollständig NOT_COMPARABLE. Lücke: Die Gruppen E/UNDETERMINED fehlten in der VU-Tabelle. | Nachtrag 9 g: Gruppen ergänzt; Familienpaare nur auf gleichem Zeitrahmen. |
| 8 | Familien-Leck | – | verworfen | Jede `tv-*`-Quelle ist eine eigene Familie, ohne Kollision mit V1. Offen: Verbindungen zwischen einzelnen TradingView-Autoren oder zu EWF sind offline nicht prüfbar; keiner davon steht in einer offenen INCLUDED-Verknüpfung. | offengelegt |
| 9 | Extraktionsfehler | NIEDRIG | plausibel | Stichprobe von 9 Referenzen überwiegend konsistent. Zwei Ausnahmen: (1) `pr_tv-mehdi_abbasi_ewp_20250310_qqq_mc` ist in Grad und Familie mehrdeutig und INCLUDED; sie hängt nur an versiegelten Fällen. (2) digitalsurftrading BTC 04.09.2022: Die Richtung DOWN folgt aus einem Wellen-4-Rest von ≈ 48 h; der Fall ist E, ohne Wirkung. | offengelegt; für eine künftige Holdout-Nutzung zur menschlichen Prüfung vormerken |
| 10 | Mehrheitsentscheid | – | verworfen | Ein widersprechendes Paar ergibt C; A verlangt Einigkeit aller Paare; die Stärke wird nur als k/n ausgewiesen. | – |
| 11 | Auswahlverzerrung | NIEDRIG–MITTEL | plausibel | Die Autorenwahl stammt aus dem Feed `/ideas/elliottwaves/` (≥ 40 Ideen, ≥ 3 Jahre). Das bringt Survivorship, also nur 2026 noch aktive Autoren, und bevorzugt fleißige Autoren. Die API-Grenze von 1.000 Ideen schneidet Mehdi_Abbasi_EWP (ab 2023-07) und pejman_zwin ab. | offengelegt (Bericht §7) |
| 12 | Versteckte Erfolgsauswahl | – | verworfen | Abgleich nur über Instrument-Aliase und Chart-Symbol; keine Ergebniswörter. | – |
| 13 | Nachträgliche Änderung | NIEDRIG | offengelegt | Nachtrag 8 kam nach dem ersten VU-Lauf. VU enthält sich in V1 und V1.1 überall; die Änderung begünstigt VU nicht. | V1/V1.1 archiviert |

## Wirkung der Behebung (V1.1 → V1.2)

| | V1.1 | V1.2 | V1.2 Sensitivität |
|---|---:|---:|---:|
| C_DISAGREEMENT | 4 | **5** | 6 |
| B_PARTIAL | 1 | 1 | 1 |
| E_TIMEFRAME_ONLY | 2 | 2 | 4 |
| D_SINGLE | 28 | **27** | 24 |
| A_STRONG | 0 | 0 | 0 |
| Konsens-Impuls-Set | 0 | 0 | 0 |
| Mensch-Mensch L1 / L2 | 3/5 · 1/5 | 3/5 · 1/5 | – |
| Mensch-Mensch Ziele | 0/3 | 0/2 (Paar-Dedup) | – |

**Kein Befund kehrt die Aussage um:**
* Es gibt keinen einzigen starken Konsens.
* Es gibt keinen Konsens-Impuls.
* Widerspruch überwiegt.
