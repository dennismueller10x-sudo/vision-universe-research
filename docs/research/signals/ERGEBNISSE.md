# E4 / S1 – Welche Trade-Setups funktionieren nachweislich?

**Forschung, nicht zertifiziert. Kein belastbarer Überlegenheitsnachweis.** Alle Familien erhalten das vorregistrierte Urteil „zu wenig Fälle“. Die verfügbaren Ausführungsdaten umfassen nur fünf heute gelistete, gezielt ausgewählte Golden-Preview-Aktien. Das ist kein repräsentatives Universum. Ein hoher Rang ist kein bestätigtes Signal.

## Reproduzierbarkeit und Abdeckung

- Basis-main: `3a5ab8bc24bbcfb96630f7094831e22acded9688`; Protokoll separat VOR Lauf eingefroren: `10b0021c987bdc41ed5320b1f32a82f520e54d00`. SHA256: `75a0b43f322bacf3877f725d85994851f3ffe5ca48a648d1b14865f353dfef08`. Das Protokoll wurde nach dem Lauf nicht verändert.
- Tägliches Raster, 2016-01-01 bis 2026-11-04, mindestens 300 Balken Warm-up. 2026 ist unvollständig; 2008–2015 wurden nicht auf Ergebnisse untersucht.
- 6225 lange Discover-Dateien, davon 0 mit vollständigen OHLC; 6679 kurze tägliche Discover-Dateien, davon 0 mit vollständigen OHLC. Diese Schlusskursreihen können keinen nächsten Open und keine Intraday-Berührung belegen.
- 5 echte tägliche OHLC-Dateien: AAPL, JPM, MSFT, NVDA, XOM. Alle fünf ausgewertet. Die Rohdaten beginnen 2015; verwendet nur als Warm-up vor 2016. Umfang, Grenzen und Datei-Hashes stehen in [manifest.json](results/manifest.json). Weitere Repo-Quellen wie Intraday-, FX-, technische Snapshots und Multi-Asset-Schlussreihen erweitern diese historische Aktien-OHLC-Abdeckung nicht.
- **Survivorship Bias:** nur heute gelistete Titel, keine Delistings, zusätzlich Auswahlverzerrung der Golden Five. Wenige große Gewinner können Ergebnisse dominieren. S2 ist zwingend.
- Kursrenditen ohne Dividenden, kein Gesamtrenditenachweis. SPY liefert tägliche splitbereinigte Schlüsse, keine Opens: exakter SPY-Vergleich **nicht verfügbar**. Der ausgewiesene Proxy ist Schluss vor Eintritt bis Schluss am Ausstiegstag, separat und deskriptiv.

## Inventur und feste Ausführung

Die sechs angefragten Engine-Dateien und die notwendige klassische Szenario-Kette sind im [Protokoll](PROTOKOLL.md) inventarisiert. Keine Engine wurde geändert. Klassische Defaults, optionale Elliott-/Annotations-/Multi-Timeframe-Module aus; Benchmark nicht als Erkennungsinput verwendet. Keine Vermischung mit der anderen TI-Szenarioengine.

„Unterstützung“ ist die vorhandene PULLBACK_TO_SUPPORT-Bezeichnung: Sie kann allein aus Retracement entstehen; die Richtung ist die vorhandene Familienkaskade, kein zusätzlicher bullischer SMA-Filter. „Widerstandsausbruch“ meint BREAKOUT_RETEST, nicht jede beliebige neue Höchstmarke. Eine 50-Tage-Linie als Merkmal ist kein handelbares Setup. RANGE_BREAKOUT_UP bleibt bedingt und wird niemals ohne Engine-Aktivierung gehandelt. Tiefere Korrektur ist als weitere vorhandene Long-Familie aufgenommen. Die bearischen Spiegelungen und Radarereignisse ohne Stopp/Ziel gehören nicht zu dieser Long-Studie.

Einstieg nächster Tages-Open; Stopp aus trade-setup.js; konservative erste Zielkante targets[0].zoneLow; keine nachgezogenen Marken. Maximal 60 Handelstage einschließlich Einstieg. Kauf/Verkauf je 10 bp auf tatsächliches Notional. R ist Open minus Stopp vor Kosten. Treffer = Netto-R > 0; Verluste werden mit negativem Vorzeichen gezeigt. Beide Tagesberührungen: Stopp zuerst; Gaps zum tatsächlichen Open. Vollständige 60-Tage-Fenster erforderlich, Randfälle separat. Je Aktie/Familie keine überlappenden Trades.

## Rangliste

Reihenfolge nur nach Netto-Erwartungswert in R, keine Auswahl anhand von Signifikanz. „Signale“ sind aktive vollständige Setup-Beobachtungen nach Ausschluss belegter Überschneidungen, noch vor Gap-/Daten-/Randprüfung; „Trades“ sind ausführbare abgeschlossene Fälle.

| Rang / Setup | Signale | Trades | Aktien / Quartale | Treffer | Ø Gewinn R | Ø Verlust R | Brutto R | Netto-EW R | Urteil |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Ausbruch / Struktur-Retest | 139 | 123 | 5 / 39 | 69.9 % | 0.534 | -0.833 | 0.141 | 0.123 | zu wenig Fälle |
| 2. Rücksetzer an Unterstützung (Engine-Proxy) | 197 | 165 | 5 / 39 | 64.2 % | 0.768 | -1.067 | 0.145 | 0.112 | zu wenig Fälle |
| 3. Tiefere Korrektur | 106 | 95 | 5 / 35 | 51.6 % | 1.217 | -1.076 | 0.153 | 0.107 | zu wenig Fälle |
| 4. Rücksetzer SMA50 (nicht geliefert) | 0 | 0 | 0 / 0 | n. v. | n. v. | n. v. | n. v. | n. v. | zu wenig Fälle |
| 5. Seitwärtsausbruch (nur bedingt) | 0 | 0 | 0 / 0 | n. v. | n. v. | n. v. | n. v. | n. v. | zu wenig Fälle |

## Halten und SPY

Halten derselben Aktie beginnt am identischen Open und endet zum Schluss des tatsächlichen Exit-Tages. Beide tragen identische Kosten und denselben Aktien-R-Nenner. Das misst die Wirkung der Exitregeln; es beweist weder Timing-Alpha noch Überlegenheit gegenüber dauerhaftem Halten. Bei einem Stopp-/Ziel-Exit intraday hat Halten eine zusätzliche Resttagsexposition. Ohne Intraday-Daten ist Gleichheit des Zeitpunkts nicht prüfbar. Es sind gleiche Handelstage, keine identischen Uhrzeiten. SPY-Proxy wird auf den Risikoanteil der jeweiligen Aktie normiert; er ist keine SPY-eigene Stopprendite.

| Setup | Ø Tage | Netto-Rendite | Netto R | Aktie halten R | Differenz R | SPY-Proxy R | Differenz Proxy R | SPY exakt | p Aktie | Holm p Aktie |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ausbruch / Struktur-Retest | 30.423 | 2.1 % | 0.123 | 0.128 | -0.005 | 0.067 | 0.056 | n. v. | 1.000 | 1.000 |
| Rücksetzer an Unterstützung (Engine-Proxy) | 17.430 | 0.8 % | 0.112 | 0.102 | 0.010 | -0.011 | 0.122 | n. v. | 0.410 | 1.000 |
| Tiefere Korrektur | 13.274 | 0.3 % | 0.107 | 0.087 | 0.019 | 0.086 | 0.021 | n. v. | 0.280 | 1.000 |
| Rücksetzer SMA50 (nicht geliefert) | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | 1.000 | 1.000 |
| Seitwärtsausbruch (nur bedingt) | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | 1.000 | 1.000 |

Einseitiger Wild-Cluster-Test über Eintrittsquartale, 9999 deterministische Ziehungen; Holm über alle 10 geplanten Hypothesen. Fehlende Familien und exakte SPY-Tests bleiben mit p=1 enthalten. Einträge mit null Trades haben p=1 als konservativen Platzhalter, keinen gemessenen Effekt. Marktphasen werden nicht zusätzlich getestet. Die Mindestabdeckung von 100 Trades, 20 Aktien und 20 Quartalen ist für keine Familie erreicht. Die Fünf-Aktien-Auswahl kann keinen abgesicherten Gewinner liefern.

## Marktphasen

SPY als S&P-500-Proxy: Schluss am Signaltag ≥ täglicher SMA200 oder darunter. Keine Wochenapproximation und kein nachträglicher Marktfilter.

| Setup | Phase | Trades | Treffer | Ø Gewinn R | Ø Verlust R | Netto-EW R | Aktie halten R | Differenz Aktie R | SPY-Proxy R |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ausbruch / Struktur-Retest | ABOVE_200 | 109 | 68.8 % | 0.547 | -0.817 | 0.121 | 0.130 | -0.009 | 0.088 |
| Ausbruch / Struktur-Retest | BELOW_200 | 14 | 78.6 % | 0.448 | -1.016 | 0.134 | 0.108 | 0.026 | -0.092 |
| Ausbruch / Struktur-Retest | UNAVAILABLE | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |
| Rücksetzer an Unterstützung (Engine-Proxy) | ABOVE_200 | 147 | 66.7 % | 0.767 | -1.030 | 0.168 | 0.180 | -0.012 | 0.076 |
| Rücksetzer an Unterstützung (Engine-Proxy) | BELOW_200 | 18 | 44.4 % | 0.773 | -1.249 | -0.350 | -0.540 | 0.190 | -0.715 |
| Rücksetzer an Unterstützung (Engine-Proxy) | UNAVAILABLE | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |
| Tiefere Korrektur | ABOVE_200 | 87 | 50.6 % | 1.261 | -1.080 | 0.104 | 0.102 | 0.002 | 0.089 |
| Tiefere Korrektur | BELOW_200 | 8 | 62.5 % | 0.828 | -1.021 | 0.135 | -0.068 | 0.202 | 0.047 |
| Tiefere Korrektur | UNAVAILABLE | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |
| Rücksetzer SMA50 (nicht geliefert) | ABOVE_200 | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |
| Rücksetzer SMA50 (nicht geliefert) | BELOW_200 | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |
| Rücksetzer SMA50 (nicht geliefert) | UNAVAILABLE | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |
| Seitwärtsausbruch (nur bedingt) | ABOVE_200 | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |
| Seitwärtsausbruch (nur bedingt) | BELOW_200 | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |
| Seitwärtsausbruch (nur bedingt) | UNAVAILABLE | 0 | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. | n. v. |

## Ausschlüsse und Ausführungsprüfung

| Setup | Aktive Beob. | Nicht aktiv¹ | Unvollständig | Überlappung | Gap-Einstieg | Rechtszensiert | Ungültiges Fenster | Beide berührt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ausbruch / Struktur-Retest | 352 | 321 | 0 | 213 | 1 | 15 | 0 | 0 |
| Rücksetzer an Unterstützung (Engine-Proxy) | 802 | 7070 | 0 | 605 | 1 | 31 | 0 | 0 |
| Tiefere Korrektur | 325 | 8220 | 0 | 219 | 0 | 11 | 0 | 0 |
| Rücksetzer SMA50 (nicht geliefert) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Seitwärtsausbruch (nur bedingt) | 0 | 1757 | 0 | 0 | 0 | 0 | 0 | 0 |

¹ Das JSON-Feld conditionalObservations zählt alle nicht aktiven Zustände der jeweiligen Familie, auch Warten/geschwächt; es ist keine Anzahl bestätigter Ausbruchssignale. SMA50 wird nicht geliefert. Die null Trades bei Seitwärtsausbruch bedeuten fehlende Engine-Aktivierung, keine gemessene schlechte Trefferquote.

## Empfehlung für S2

Als **unbestätigte Forschungskandidaten** nach der vorregistrierten Hürde (Netto-EW > 0 und Aktiendifferenz > 0): Rücksetzer an Unterstützung (Engine-Proxy), Tiefere Korrektur. Die Rangfolge ersetzt keinen Nachweis.

C/B benötigt für einen vollständigen S1-/S2-Nachweis tägliche OHLC aller vorgesehenen Aktien und SPY, breites Universum inklusive delisteter Titel, unveränderte Regeln und den unangetasteten Holdout 2008–2015. SMA50 und der nur bedingte Seitwärtsausbruch können auf Basis der jetzigen Engines nicht als getestete erfolgreiche Strategien ausgegeben werden. Kein Setup für S3 freigeben.

Die Zahlen stehen maschinenlesbar in [results.json](results/results.json); jede Ausführung mit Zeitpunkten, Setup-ID, Marken, R, Kostenwirkung und Vergleich in [trades.jsonl](results/trades.jsonl). Diese Dateien enthalten Forschungsableitungen, keine vollständigen neuen Anbieter-Kursreihen.
