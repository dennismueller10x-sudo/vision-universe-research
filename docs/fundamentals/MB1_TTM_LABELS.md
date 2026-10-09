# M-B1 – TTM bedeutet TTM (Screener, Discover)

Migrationsblocker M-B1 aus `docs/FUNDAMENTAL_DATA_MIGRATION.md` (PR #481, Kern 1.19.0). Unter einem TTM-Label darf kein Wert des Geschäftsjahres stehen. Ein fehlendes TTM wird nicht still durch FY ersetzt.

## Semantik

| Größe | Definition | Fehlt sie |
|---|---|---|
| `EPS_TTM_DILUTED` | Summe von vier gemeldeten Quartalen, vom Kern geprüft (`eps.ttmDiluted.status = VERIFIED`) | leer, mit Grund |
| `EPS_FY_DILUTED` | verwässertes Gesamt-EPS des letzten Geschäftsjahres (eigene Spalte, eigenes Label) | leer; EPS nur aus fortgeführten Bereichen zählt nicht |
| `PE_TTM` | Kurs / `EPS_TTM_DILUTED` | leer |
| `PE_FY` | Kurs / `EPS_FY_DILUTED` | leer |

Weitere Regeln:
- Discover zeigt das KGV mit seiner Basis: „12 Monate“, wenn ein geprüftes TTM-EPS vorliegt, sonst „Geschäftsjahr“.
- Vergleiche über das Universum laufen auf **einer** Basis: KGV des Geschäftsjahres. Das betrifft Median, „Qualität zum Preis“, Ähnlichkeit, „günstiger bewertete Alternativen“ und den Klartext „moderat bewertet“.
- Das frühere zusammengesetzte EPS (TTM-Jahresüberschuss geteilt durch die Aktienzahl des Geschäftsjahres) entfällt.
- Bundles **ohne** `eps`-Block, also main vor Kern 1.16.0, gelten als „TTM-EPS nicht geprüft“ (`EPS_TTM_NOT_VERIFIED_BY_CORE`). Ihr `ttm.eps_diluted` summierte ein aus FY − 9M abgeleitetes Q4 und wird nicht gezeigt.

## Die Kette (vorher → nachher)

**Quelle:** `quant/data/sec/consumer` → `discover/engines/fundamentals.js` (`fromBundle`, `latest`) → `discover/engines/unternehmen.js` (`ausConsumerBundle`) → `scripts/discover/build-discover-data.mjs` (Metriken `f_*`, Bewertungsobjekte) → `scripts/screener/build-universe.mjs` → `screener/engine/fields.js` und die UI.

**Discover-Engines und Daten**
- **`latest().ttm.eps_diluted`:** vorher jedes Bundle-TTM, nachher nur bei VERIFIED. Neu ist `latest().eps` mit `ttmDiluted` und `fyDiluted`.
- **Geschäftszahlen-Karte:**
  - `umsatzTTM`/`gewinnTTM` trugen bei Basis FY den Jahreswert. Jetzt sind sie nur bei Basis TTM gesetzt; die neutralen Felder `umsatz`/`gewinn` tragen die Basis.
  - Das KGV steht in `kgv` mit `kgvBasis` (TTM/FY). Getrennt stehen `kgvTtm`, `kgvFy`, `epsTtm` und `epsFy`.
- **Discover-Metriken:**
  - `f_pe` ist jetzt nur das TTM-KGV; neu ist `f_peFy`.
  - `f_ps`, `f_fcfYield` und `f_revenueGrowthTTM` sind nur bei TTM-Basis gesetzt.
  - Die Bewertungsobjekte tragen jede Basis benannt.
- **Discover-UI:** KGV-Label und -Erklärung mit Basis. Der Marktvergleich erfolgt ausdrücklich auf Geschäftsjahresbasis.

**Screener**
- **TTM-Spalten nur aus echten TTM-Werten:**
  - `eps`, `pe`;
  - `revenue`, `evSales`;
  - `fcf`;
  - `evEbitda`;
  - `revGrowth`, `niGrowthTtm`;
  - `ps`, `fcfYield`.
- **Neue FY-Spalten:** `epsFy` „Gewinn je Aktie (Geschäftsjahr, verwässert)“ mit Preset „Positiv“ und `peFy` „KGV (Geschäftsjahr)“ mit den Presets des KGV.
- **PEG:** KGV und EPS-CAGR stammen jetzt beide aus dem Geschäftsjahr. Vorher wurde ein KGV gemischter Basis durch die FY-CAGR geteilt.
- **Bewertungsfamilie im Ranking:** nutzt `peFy` als vergleichbares KGV.

## Filtersemantik

| Filter | Name behauptet | maß vorher | misst jetzt |
|---|---|---|---|
| EPS (TTM) positiv | TTM | TTM aus FY − 9M (3.394 auf main) oder still FY (885 bzw. 3.811 Titel) | nur geprüftes TTM |
| EPS (Geschäftsjahr) positiv | – | – | neues Feld, FY |
| EPS-Wachstum | FY | FY | unverändert |
| EPS-CAGR 3J | FY | FY | unverändert |
| Gewinnwachstum (TTM) | TTM | bei Basis FY der Jahresvergleich (586 bzw. 738 Titel) | nur TTM |
| Umsatzwachstum (TTM) | TTM | bei Basis FY der Jahresvergleich (1.070 bzw. 1.311 Titel) | nur TTM |
| KGV (TTM) < 15 / < 25 / 15–30 | TTM | gemischte Basis | nur TTM |
| KGV (Geschäftsjahr) | – | – | neues Feld, FY |

Filtergrenzen sind unverändert. Die Trefferzahlen werden nicht zurückoptimiert.

## Wirkung

Gemessen über alle 5.072 Bundles, Daten in `docs/fundamentals/mb1-impact.json`.

| | main-Bundles: vorher | main-Bundles: nachher | Kern-1.19-Bundles: vorher | Kern-1.19-Bundles: nachher |
|---|---|---|---|---|
| EPS unter TTM-Label gezeigt | 4.279 (davon 885 FY) | 0 | 3.949 (davon 3.811 FY) | 138 |
| EPS (TTM) positiv | 2.433 | 0 | 2.218 | 103 |
| EPS (Geschäftsjahr) verfügbar | – | 3.903 | – | 3.876 |
| EPS (Geschäftsjahr) positiv | – | 2.203 | – | 2.181 |
| KGV vorhanden | 2.318 (Basis gemischt) | FY 2.202 | 2.305 (davon 1.553 aus TTM-Gewinn ÷ Aktien) | TTM 86 / FY 2.091 |
| KGV (TTM) < 15 / < 25 / 15–30 | 536 / 844 / 437 | 0 / 0 / 0 | 534 / 830 / 434 | 25 / 35 / 19 |
| KGV (GJ) < 15 / < 25 / 15–30 | – | 453 / 740 / 405 | – | 448 / 735 / 406 |
| Umsatz unter TTM-Label | 4.188 (davon 1.164 FY) | 3.024 | 4.186 (davon 1.181 FY) | 3.005 |

Mit Kern 1.19 fällt der Filter „EPS (TTM) positiv“ von 2.218 auf 103 Titel. Grund ist die Korrektheit des Kerns: Q4-EPS ist in SEC-XBRL fast nie gemeldet. Der Geschäftsjahreswert steht separat zur Verfügung.

Gefüllte Screener-Spalten mit main-Bundles (5.700 Titel; Screener-Lauf über die mit M-B1 neu gebauten Discover-Daten):

| Spalte | main | M-B1 |
|---|---|---|
| `eps` | 3751 | 0 |
| `epsFy` | – | 3370 |
| `pe` | 1981 | 0 |
| `peFy` | – | 1897 |
| `peg` | 810 | 825 |
| `revenue` | 3746 | 2982 |
| `revGrowth` | 3869 | 2944 |
| `niGrowthTtm` | 2366 | 1756 |
| `ps` | 3265 | 2825 |
| `fcfYield` | 3463 | 2647 |
| `fcf` | 3432 | 2782 |
| `evEbitda` | 928 | 860 |
| `evSales` | 1410 | 1249 |

## Abhängigkeit

Dieser PR ist unabhängig von #481 und kann **vor** dem Kern gemergt werden:
- Auf main-Bundles zeigt er kein TTM-EPS, weil keines geprüft ist.
- Ab Kern 1.16 zeigt er die geprüften Werte.

Es gibt keinen Zeitpunkt, an dem ein FY-Wert unter einem TTM-Label steht.
