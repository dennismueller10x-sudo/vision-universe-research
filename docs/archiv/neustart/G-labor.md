# Strang G – Strategie-Labor

Stand: **05.11.2026**. Auftrag: systematisch suchen, mit welcher Strategie aus VU-Daten Anleger den S&P 500 schlagen.
Methodik: [docs/archiv/research/labor/README.md](../research/labor/README.md), Regeln: [PROTOKOLL.md](../../research/labor/PROTOKOLL.md).

## Fertig
- Protokoll vorregistriert und eingefroren (78 Varianten in 10 Familien, DEV 2016–2023, Prüfung 2024–2026-10, Holdout 2008–2015).
- Runner, Signale, ETF-Engine, Statistik, Versiegelung, Workflow `research.yml`, Teil `labor` (vormals `research-labor.yml`), Tests.

- **Suche gerechnet** (Lauf 42023060404): 78/78 Varianten, keine erfüllt die Zulassungsregeln. **Urteil: keine Strategie besteht.**
  Prüfung und Holdout entfallen nach Protokoll; der Holdout 2008–2015 bleibt unberührt. Bericht: [BERICHT.md](../../research/labor/BERICHT.md),
  Zahlen nur im privaten Artifact an den Owner.

## Offen
- Datenbefund an Strang C: nicht bereinigte Reverse-Splits kleiner Titel im Quant-Panel (DQ-K5-Quarantäne fehlt dort).
- Mögliche Folgestudie (neue Registrierung): Qualität + Insider-Käufe, nur auf unberührten Daten.

## Braucht Owner
- Nichts. Ergebnisse mit Zahlen kommen als privates Artifact.
