# Strang B – Supertrader-Backtest (Stand 04.11.2026)

Plan: [PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md). Produktdokument: [SUPERTRADER_9_HANDOVER.md](../SUPERTRADER_9_HANDOVER.md) §0.1.
Alle Backtest-Ergebnisse sind **Forschung, nicht zertifiziert**. Keine öffentlichen Renditeaussagen ohne Owner.

## Fertig
- V1 = Top 5 (C01, C02, C03, C08, C12); Lesarten PS-C01, PS-C03, PS-C08, PS-C12, FP-ST-03, FP-ST-05 entschieden (#1327). Die übrigen acht Methoden sind im Produkt „in Forschung“.
- V13-Studie (A gegen A + V13-Delisting-Ketten, Top 5, Archiv 1.2.0, DQ-K5-Quarantäne) erstmals gestartet: Lauf 41861419543. Secrets `VU_HISTORY_S3_*` und `V13_ARCHIVE_PRIVATE_KEY` sind vorhanden, das Archiv ließ sich laden und entschlüsseln.

## Offen
- Historischer Backtest Top 5 mit Kennzahlen je Methode (Trades, Trefferquote, Rendite, max. Verlust, SPY, Kosten): Runner und Workflow in #1328, danach Lauf und interne Auswertung.
- Kandidaten-Tageslauf frisch (Stand 30.10.): manueller Lauf A ohne Commit (41862433422), danach Lauf B mit Commit.
- Papierhandel SF6-PAPER-2027: #1272 → #1268 → #1273 (Core) → #1270 (Forward-Pfad, R6 und Folge-Commit). Merge vor dem 01.12.2026, Frist 31.12.2026.
- Lizenzangebote Kapitalmaßnahmen (FP-ST-01): Vergleichstabelle, nichts kaufen.

## Braucht Owner
- Repo-Variable `SF8_AUTO_PUBLISH=true` setzen. Empfehlung: jetzt. Jede Veröffentlichung prüft der Vertrag C1–C7 (fail closed). Bis dahin halte ich den Stand mit manuellen Läufen frisch.
- Buch (englische Originalausgabe Minervini) für FP-ST-05: Ausgabe, nur mit Freigabe. C06 und C07 bleiben bis dahin in Forschung.
- Öffentliche Darstellung von Backtest-Renditen: nur mit Freigabe.
