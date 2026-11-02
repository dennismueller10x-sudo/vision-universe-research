# Technical: Betriebszeit des Screener-Datensatzes

Stand 30.10.2026. Betrifft `.github/workflows/technical-world.yml`. Der Erzeuger (`build-screener.mjs`) und die Daten bleiben unverändert.

## 1. Befund

| Tag | Zeitplan (05:10 UTC) gestartet | Marktdaten-Refresh fertig (Materialisierung committet) |
|---|---|---|
| 27.10. | 10:25 | 03:59 (Lauf rot, Rückfall nötig) |
| 28.10. | 11:15 | 02:42 (Lauf rot) |
| 29.10. | 11:27 | 04:07 |
| 30.10. | 11:19 | 06:49 |

## 2. Ursache

- **GitHub startet die Zeitpläne dieses Repositorys stundenlang spät.** Das betrifft nicht nur Technical:
  - Supertrader Production Smoke, Zeitplan 13:43 UTC: Start 18:55–19:31 UTC;
  - Marktdaten-Refresh, Zeitplan 22:30 UTC: Start 01:31–02:04 UTC.
  - Eine andere Cron-Zeit behebt das nicht.
- **Der vorgesehene ereignisgesteuerte Weg greift nicht.**
  - technical-world reagiert per `workflow_run` auf „Quant 2.0 Product Intelligence Materialization“.
  - Im Nachtlauf läuft die Materialisierung aber als `workflow_call` im Marktlauf. Ihr eigener `workflow_run`-Lauf wird übersprungen (Audit 26.10.2026).
  - Deshalb hat bisher nur der verspätete Zeitplan den Datensatz gebaut, an Tagen mit Wochenreihen auch „Lange Kursreihen“.

## 3. Lösung

- **Neuer Auslöser:** `workflow_run` auch auf „Marktdaten-Refresh (Produktuniversum, Tageskurse + Faktoren + Discover)“.
  - Dieser Lauf ist erst fertig, wenn die Materialisierung committet hat.
  - Der Datensatz entsteht dann gegen 04:00–07:00 UTC statt gegen 11:20 UTC.

## 4. Schutzmaßnahmen

- **Nur nach Erfolg:** Der Auslöser greift nur bei `conclusion == success` auf `main` und nie nach einem Push-Lauf.
  - Push-Läufe auf `claude/**` sind übersprungen oder Probeläufe.
- **Rückfall:**
  - Der Zeitplan 05:10 UTC bleibt. Scheitert der Marktlauf (wie am 27./28.10.), baut er den Datensatz wie bisher.
  - `workflow_dispatch` bleibt für den Notfall.
- **Mehrfachläufe sind harmlos:**
  - Mehrere Auslöser am Tag (Marktlauf, Lange Kursreihen, Zeitplan) laufen nacheinander (Concurrency je Branch, kein Abbruch).
  - Unveränderte Daten erzeugen keinen Commit.
- **Unverändert:**
  - Checkout der Branch-Spitze, Commit nur `technical/data`, Push über `push-with-retry.sh` (ADR-005);
  - Engine- und Vertragstests vor dem Commit.
- **Test** `technical/tests/technical-world-workflow.test.mjs`:
  - Die Auslöser-Namen sind die `name:`-Zeilen der Vorläufe. Ein Umbenennen würde den Auslöser sonst still abschalten.
  - Der Rückfall-Zeitplan bleibt.
  - Die Bedingungen und die ADR-005-Regeln sind erfüllt.

## 5. Nachweis nach dem Merge

- Der erste Nachtlauf nach dem Merge muss einen technical-world-Lauf mit Ereignis `workflow_run` vom Marktdaten-Refresh zeigen.
- Dieser Lauf muss vor dem Zeitplan-Lauf committen.
- Bis dahin gilt die Lösung als ungeprüft.
