# Strang C – Quant-Backtest und qualifizierte Portfolios (Abschluss)

Stand: **05.11.2026**, Strang abgeschlossen (Owner-Entscheidung). Plan: [PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md). Fachdokument: [PORTFOLIO_STANDARD.md](../quant/PORTFOLIO_STANDARD.md).

Alles hier ist **Forschung, nicht zertifiziert**. Öffentlich wird keine Rendite gezeigt. Der öffentliche Export (`export-public-model-portfolios.cjs`) bleibt gesperrt, bis die Owner-Freigabe „Freigabe öffentliche Backtest-Darstellung“ im Plan steht und die Rechtsberatung zugestimmt hat.

## Was automatisch läuft

**Nach Zeitplan läuft nur `quant-model-depots.yml`** (samstags 07:23 UTC). Er rechnet die öffentlichen Musterdepots vorwärts und committet genau `quant/data/product/model-depots-v1.json`. Die beiden Forschungs-Workflows starten nur manuell oder über eine Marke in der Commit-Nachricht auf `claude/**`. Sie rechnen auf R2-Tagesbalken und dem privaten V13-Archiv, die nur im Runner liegen:

| Workflow | Auslöser | rechnet | schreibt |
|---|---|---|---|
| `quant-portfolio-research.yml` | manuell, `[quant-portfolio-research]`, `[edge-e3:dev-quant\|test-quant]` | Musterportfolios mit Sensitivitäten und DQ-K5 Vorher/Nachher, oder eine E3-Phase | `docs/quant/research/portfolio-v1/`, `workers/vu-account/data/model-portfolios-bundle.json`, `docs/research/edge/` |
| `research-signals-s2.yml` | manuell, `[signals-s2]`; Eingabe `from_run` führt nur zusammen | S2 in 8 Teilen, Teilergebnisse verschlüsselt | `docs/research/signals/results-s2/` |

Die interne Vorschau `/konto/admin/backtests/` ist mit Sitzung und Rolle `backtest_reviewer` zugänglich und liest das Paket über die Worker-Route `/v1/admin/backtests/portfolios`. Der Worker lehnt Pakete mit falschen Kennzeichen, falschem Hash oder zu jungen Beständen ab.

## Wo die Ergebnisse liegen

| Ergebnis | Urteil | Dateien |
|---|---|---|
| **Quant-Musterdepots (öffentlich, ab 05.11.2026 vorwärts)** | Rechenmodell, kein echtes Geld: Bestand mit Aufnahmedatum und -kurs, Protokoll rein/raus, monatliche Umschichtung. Die Wertentwicklung wird erst nach Owner-Freigabe gezeigt. | `/quant/musterdepots/`, `quant/data/product/model-depots-v1.json`, [PORTFOLIO_STANDARD.md](../quant/PORTFOLIO_STANDARD.md) „Musterdepots“ |
| Musterportfolios (5 Profile, 2012-01 bis 2026-10, Gesamtrendite inkl. delisteter Titel) | Keines schlägt SPY TR (14,9 % p. a.): Defensive Quality 13,4 %, Momentum Leader 12,9 %, Value Momentum 12,6 %, Quality Compounder 10,9 %, GARP 6,0 %. Mit DQ-K5 höchstens −0,1 Prozentpunkte. | [MODEL_PORTFOLIOS.md](../quant/research/portfolio-v1/MODEL_PORTFOLIOS.md), `docs/quant/research/portfolio-v1/model-portfolios.json` |
| E3 Edge-Studie (96 Varianten, eingefrorenes Protokoll) | Vorab gewählt: Momentum Leader N20/13 W, im Prüfteil 2020–2026 9,3 % gegen SPY 15,4 %. 84 Varianten „schlägt nicht“, 12 Supertrader-Varianten blockiert. | [BERICHT.md](../research/edge/BERICHT.md), `docs/research/edge/runs/*.json` |
| E4/S1 Signal-Studie (5 Titel) | eingeschränkt, siehe Bericht | [ERGEBNISSE.md](../research/signals/ERGEBNISSE.md) |
| E4/S2 Signal-Studie (1.000 Titel, 2016–2026, exakter SPY) | Keine Familie besser als Halten, mit und ohne DQ-K5 | [S2_ERGEBNIS.md](../research/signals/S2_ERGEBNIS.md), [S2_REGISTRIERUNG.md](../research/signals/S2_REGISTRIERUNG.md) |

**Bestände:** Das Backtest-Ergebnis und sein Paket führen nur den Bestand der letzten Umschichtung, die mindestens 12 Monate vor dem Ende liegt (`holdingsSnapshot`, #1462). Heutige Bestände zeigen nur die öffentlichen Musterdepots (Owner-Entscheidung 06.11., Plan §11).

## Versiegelte Dateien öffnen (nur Owner)

Die S2-Kennzahlen (Netto-R, Differenz gegen Halten und den exakten SPY, Marktphasen, alle Trades) liegen in `docs/research/signals/results-s2/results.sealed.owner.json`. Sie sind verschlüsselt an `scripts/supertrader/validation/results-public-key.pem` (RSA-OAEP-256 + AES-256-GCM + gzip). Öffnen mit dem privaten Owner-Schlüssel, aus dem Repository-Wurzelverzeichnis:

```bash
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { decryptSealed } from './scripts/supertrader/validation/lib.mjs';
const plain = decryptSealed(readFileSync(process.argv[1], 'utf8'), readFileSync('docs/research/signals/results-s2/results.sealed.owner.json', 'utf8'));
writeFileSync(process.argv[2], plain);" /pfad/zum/owner-key.pem /tmp/s2-results.json
```

Prüfsumme: `sha256sum /tmp/s2-results.json` muss `privateSha256` in `results-s2/public.json` ergeben. Wichtige Felder: `families[].netR`, `deltaHoldR`, `deltaSpyExactR`, `pHoldHolm`, `pSpyExactHolm`, `regimes.ABOVE_200|BELOW_200`, `familiesWithoutDq`. Den Klartext nicht committen.

## Offen


- **`test_canonical_market.py`:** Neuabnahme der Deckungskennzahlen über `coverage-metrics.yml`, mit R2 und `coverage-delta` je Titel. Ändern sich die Kennzahlen, Stand 6.686/6.683/5.644 → neues Produktuniversum (6.577), dann die Konstanten in `ABGENOMMEN` mit Begründung nachziehen. Geht erst, wenn die übrigen roten Quant-Tests grün sind, denn der Workflow fährt die ganze Suite.
- `backtest-runner.cjs#setupOosFromCertificationPath` an A4 angleichen (berührt CODE_FILES → Demo-Neubau, eigener PR). Setup-OOS-Gate frühestens um den 2028-01-08 messbar.
- Bestätigung von S2 und E3 nur auf unberührten Jahren (2008–2015) oder neuen Vorwärtsdaten. Eine weitere Variantensuche ist bis dahin unzulässig. Value Momentum N20 steht nur als Hypothese für eine spätere Holdout-Studie.
- Eine Liquiditätsgrenze für Supertrader-Varianten wäre eine neue, vorab registrierte Variante (nicht E3).

## Braucht Owner

- **Wertentwicklung der Musterdepots öffentlich zeigen:** Das ist eine öffentliche Renditeaussage. Freigabe durch den Satz „Freigabe Musterdepot-Wertentwicklung“ als Owner-Entscheidung in Plan §11. Der nächste Lauf von `quant-model-depots.yml` veröffentlicht sie dann, die Seite zeigt sie ohne weitere Änderung.

- **Geschäftskonto für die Vorschau:** registrieren (eigene E-Mail, nicht das Konto mit `pricing_admin`) und die Rolle `backtest_reviewer` per SQL vergeben. Anleitung: [BACKTEST_VORSCHAU_AKTIVIERUNG.md](../accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md), Abschnitt 2.
- **Öffentliche Darstellung von Renditen:** eigene Freigabe (öffentliche Renditeaussage) mit Rechtsberatung. Nach Owner-Linie nur für eine Methode, die den S&P 500 in einem vorab registrierten Test schlägt. Das tut derzeit keine.

## Übergaben

- **A:** `quant-portfolio-research.yml` und `research-signals-s2.yml` sind im Bündel `research` (`core/registry/workflow-bundles.json`).
- **D2:** Musterportfolio-Anzeige. Datenform `portfolios[].holdings = {asOf, delayDays, positions[{ticker, weight}]}`, Kurve in `chart`, nur historisch.
- **B und G:** `lastHoldings` in `scripts/supertrader/house/analyze.mjs` und `scripts/research/labor/` unterliegen derselben Owner-Linie (§11).
