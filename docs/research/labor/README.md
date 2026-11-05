# Strang G – Strategie-Labor

**Forschung, nicht zertifiziert.** Systematische Suche nach einer Strategie aus Daten und Werkzeugen von Vision Universe,
die den S&P 500 (SPY-Gesamtrendite) nach Kosten schlägt. Regeln: [PROTOKOLL.md](PROTOKOLL.md), vor dem ersten Lauf
eingefroren (Commit `d1df7d9b09`, SHA-256 `ddf9e9df…`, im Runner geprüft).

## Ablauf

| Phase | Auslöser | Ergebnis im Repository |
|---|---|---|
| dev (Suche 2016–2023, Walk-forward, Auswahl) | Commit-Marke `[labor:dev]` oder manuell | `runs/selection.json` (Kandidaten, Zustände, Hashes), `runs/dev.sealed.json` |
| test (Prüfung 2024-01-01 bis 2026-10-02) | `[labor:test]`, verlangt `selection.json` | `runs/test-public.json` (je Kandidat bestanden ja/nein), `runs/test.sealed.json` |
| holdout (2008–2015, max. 2 Finalisten) | `[labor:holdout]`, verlangt `HOLDOUT_FREIGABE.md` der Steuerung | `runs/holdout-public.json`, `runs/holdout.sealed.json` |

Workflow: `.github/workflows/research-labor.yml` (Bündel `research`). Eingaben nur im Runner: Tagesbalken (R2), delistete
Titel (V13), SEC companyfacts (ORIGINAL), SEC Insider Transactions Data Sets. Renditezahlen stehen nur in den versiegelten
Dateien (RSA-OAEP + AES-256-GCM an `empfaenger.pem`); der Owner erhält sie als privates Artifact.

## Code (`scripts/research/labor/`)

| Datei | Inhalt |
|---|---|
| `protocol.cjs` | Fenster, Kosten, Katalog der 78 Varianten, Protokoll-Hash |
| `signals.cjs` | Momentum 6-1, 52-Wochen-Hoch, Insider, SUE, Kombinationen, Ridge |
| `stock-engine.cjs` | Auswahl und Ablauf auf dem E3-Ledger (Parität getestet), BIL-Verzinsung des Cash |
| `etf-engine.cjs` | ETF-Trendfolge, Zinsfilter, Rotation, Sektoren |
| `stats.cjs`, `evaluate.cjs` | DSR, White's Reality Check, Block-Bootstrap, Auswahl, Walk-forward, Urteile |
| `build-insider.mjs`, `build_sue.py` | Point-in-Time-Ereignisse aus SEC-Daten |
| `run-labor.cjs`, `seal.cjs` | Phasen, Versiegelung |

```bash
node --test scripts/research/labor/*.test.cjs scripts/research/labor/*.test.mjs
python3 -m unittest discover -s scripts/research/labor/tests -p 'test_*.py'
```

Die Tests nutzen synthetische Daten (Softwarevalidierung, keine Studienaussage). Keine Produktdateien, keine Fachmodelle geändert.
