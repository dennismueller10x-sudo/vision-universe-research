# E4 / S2 – Ergebnis (Methodik, Abdeckung, Urteil)

Forschung, nicht zertifiziert. Kein Handelssignal und keine Empfehlung. Gerechnet nach der [S2-Registrierung](../../../research/signals/S2_REGISTRIERUNG.md) samt Ergänzung 1 (DQ-K5) und dem unveränderten [S1-Protokoll](../../../research/signals/PROTOKOLL.md).

- Rechenlauf: 42030934250 (8 Teile); die Zusammenführung lief in Lauf 42048573686, weil der erste Versuch an einem Importpfad scheiterte. Teilergebnisse wurden nur verschlüsselt zwischen den Jobs übergeben.
- Abdeckung und Urteil: [results-s2/public.json](../../../research/signals/results-s2/public.json).
- Kennzahlen und Trades liegen verschlüsselt für den Owner in [results-s2/results.sealed.owner.json](../../../research/signals/results-s2/results.sealed.owner.json). Prüfsumme des Klartexts: `privateSha256` in `public.json`. Das Repository enthält keine Rendite- oder R-Kennzahlen.

## Methodik in einem Absatz

1.000 vorab gezogene Titel (Seed 20261105), geschichtet in 789 heutige US-Stammaktien und 211 delistete V13-Ketten, ohne Vorzugsaktien. Vollständige Tages-OHLC aus der kanonischen Ablage, delistete Titel aus dem V13-Archiv, Splitnormierung nach ADR-002. Signale ab 2016 mit derselben Erkennung wie S1: Tagesanalyse ohne Vorgriff, Einstieg zum nächsten Open, Stopp und Ziel aus dem Setup, 60 Handelstage, Kosten 10 + 10 bp. Verglichen wird mit dem Halten derselben Aktie und mit SPY exakt vom Open des Einstiegstags bis zum Schluss des Ausstiegstags. Statistik: Cluster-Bootstrap nach Quartalen, Holm über 10 Hypothesen. Primär zählen nur Trades ohne DQ-K5-Sitzung (Tagesverhältnis ≥ 5 oder ≤ 1/5) im Erkennungs- oder Haltefenster. Die Auswertung mit allen Trades läuft als Sensitivität.

## Abdeckung

- Gerechnet: 888 von 1.000 Titeln, davon 207 delistete. Ohne verwertbare Historie, also mit weniger als 300 Balken oder ohne Kursdatei, blieben 111 Titel. Ein Titel hat eine ungültige Historie, keiner ist fehlgeschlagen.
- DQ-K5: 61 Titel haben mindestens eine markierte Sitzung, 122 Trades sind dadurch ausgeschlossen.
- Exakter SPY-Vergleich: für jeden Trade verfügbar, Abdeckung 100 %.

| Familie | Trades (primär) | Titel | Quartale | davon delistet | wegen DQ-K5 ausgeschlossen | Urteil primär | Urteil ohne DQ |
|---|--:|--:|--:|--:|--:|---|---|
| PULLBACK_TO_SUPPORT | 14.877 | 776 | 43 | 1.341 | 54 | nicht besser | nicht besser |
| BREAKOUT_RETEST | 9.932 | 751 | 43 | 921 | 29 | nicht besser | nicht besser |
| DEEPER_CORRECTION | 8.682 | 765 | 43 | 769 | 39 | nicht besser | nicht besser |
| SMA50_PULLBACK_NOT_SUPPLIED | 0 | 0 | 0 | 0 | 0 | zu wenig Fälle | zu wenig Fälle |
| RANGE_BREAKOUT_UP | 0 | 0 | 0 | 0 | 0 | zu wenig Fälle | zu wenig Fälle |

RANGE_BREAKOUT_UP erscheint 245.299-mal als bedingtes Szenario, aber nie als aktives Setup. Nach dem Protokoll wird es ohne Aktivierung durch die Engine nicht gehandelt. SMA50_PULLBACK liefert die Engine nicht. Beides ist wie in S1.

## Urteil

**Keine Signalfamilie ist besser als Halten.** Die drei handelbaren Familien erreichen die Mindestabdeckung (100 Trades, 20 Aktien, 20 Quartale) mit großem Abstand. Bestehen müssten sie alle vier Bedingungen zugleich: positives Netto-R, Vorteil gegen das Halten der Aktie, Vorteil gegen den exakten SPY-Vergleich, beide Tests mit Holm-p ≤ 0,05. Keine Familie schafft das, weder primär noch ohne DQ-Filter. Das Urteil hängt nicht an der Quarantäne.

Einordnung: S2 erweitert das Universum für 2016–2026. Die Jahre 2008–2015 sind keine unberührte Bestätigung und bleiben dafür ausdrücklich unberührt. Eine Bestätigung braucht diese Jahre oder neue Vorwärtsdaten. Laut S1-Protokoll ist eine weitere Variantensuche (S3) bis dahin unzulässig. Das Ergebnis begründet keine Live-Signale und keine öffentliche Aussage über Signalqualität.

## Grenzen

- Stichprobe statt vollem Universum, Population aus heutigen Kursdateien plus qualifizierten V13-Ketten, keine historische Indexmitgliedschaft.
- Delistete Titel stehen nur im Kettenzeitraum des Registers. Ohne verwertbare Historie fallen 11 % der Stichprobe heraus, überwiegend junge Titel mit weniger als 300 Balken.
- DQ-K5 ist eine bewusst weite Obermenge: Auch echte Kursvervielfachungen fallen heraus. Nicht bereinigte 2:1- und 3:1-Splits liegen unter der Schwelle.
- Stopp und Ziel auf Tagesbalken: Berührt ein Tag beide, gilt wie in S1: Stopp zuerst.
