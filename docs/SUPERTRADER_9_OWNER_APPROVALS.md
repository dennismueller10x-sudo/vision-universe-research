# Supertrader 9 – Betriebsstand, offene Owner-Entscheidungen und Merge-Reihenfolge

Stand 30.10.2026, ~07:00 UTC, `main` `adbc2f04`. Dieses Dokument bündelt die Ergebnisse von Supertrader 9 (Datenbetrieb, historische Validierung, Zertifizierungsvorbereitung) und die Freigaben, die nur der Owner geben kann. Es wurde nichts gemergt, kein Lauf ausgelöst und keine Variable gesetzt. Alle 13 Methoden bleiben `LIVE_NOT_APPROVED`.

Einzelberichte:
- [SUPERTRADER_9_V1_STATUS_20261030.md](SUPERTRADER_9_V1_STATUS_20261030.md): S1–S7 mit Lauf-IDs.
- [SUPERTRADER_9_CERTIFICATION_READINESS.md](SUPERTRADER_9_CERTIFICATION_READINESS.md): alle 13 Methoden.
- `docs/SUPERTRADER_9_DAILY_OPERATIONS.md`: Tageslauf, in #1137.
- `docs/SUPERTRADER_9_V13_DELISTED_REUSE.md`: V13-Studie, in #1142.
- `docs/data/SECURITY_MASTER_WEEKLY.md`: Security Master, in #1100, #1101 und #1136.

## 1. Betriebsstand des Live-Supertraders

| Punkt | Stand |
|---|---|
| Veröffentlicht | `supertrader/data/sf-candidates/`, Commit 3e7fc17 (Lauf 40924915352, 29.10.), Marktstand 28.10. |
| Fingerabdruck | 518 Dateien, nachgerechnet am 30.10.: `9eab2282…372d` = der freigegebene Fingerabdruck |
| Inhalt | 3.225 Kandidaten in 1.831 Aktien: 2.091 Chart, 1.078 bestätigt, 56 modelliert, 0 VALIDATED |
| Aktualität | **veraltet seit dem Nachtlauf 30.10.** Die Seite zeigt „nicht aktuell“; DQ-SF8-8 ist für 3.225/3.225 rot |
| Folge auf `main` | Der Zustandstest `DQ-SF8 · Repository-Stand` in `core/tests` ist rot (298/299) und trifft jeden PR mit `core-ci` |
| Tageslauf | nicht aktiv; vorbereitet in #1137 und #1146 |
| Eingangsprüfung | ab Laufdatum **11.11.2026 STALE**, weil der Security Master dann 60 Tage alt ist |

## 2. Security Master

- **Status:** Der Klassifiziererwechsel 1.1.0 → 1.3.0 ist vorbereitet (#1100 Freeze, #1101 Nachweis).
  - Die Zählung **138 Typwechsel / 138 Eignungswechsel / 127 entfallende backtestfähige IDs** ist am 30.10. bytegleich reproduziert.
  - **133 ist widerlegt.** Keine Zählung ergibt 133; die alte Herleitung „127 + 14 − 4“ ergibt 137.
- **Neu (#1136):** Der vorbereitete Lauf würde blockiert, mit und ohne v130-Freigabe. Das zeigen der echte Lauf 40942100928 vom 29.10. und ein Probelauf ohne Commit vom 30.10.
  - Ursache sind sieben Wochen Anbieterdrift: 85 `canonical_id`-Wechsel, 104 Delistings, 85 Eignungswechsel, 592 Namenswechsel, 1 neue Doppelung (ONEOK).
  - #1136 macht diese Drift **eng und gebunden freigebbar**, ohne eine Grenze anzuheben.
  - Offen bleiben zwei Owner-Punkte: die Tickerwiederverwendung (35 IDs) und die OKE-Doppelung.
- **Archivierung:** Das Freeze-Manifest umfasst alles unter `docs/quant-recovery/` (550 Dateien, V5.1–V13c). Private Generationen werden vor dem Wechsel mit `freeze` gesichert; neue nur in einer neuen Wurzel (`build-post-switch`, `compare`).
- **Hash und Provenienz:** `masterHash` bleibt der SHA-256 der Datei. #1141 setzt die Schritte 2 und 3 des Inhalts-Fingerabdrucks um:
  - Neue Snapshots tragen `masterContentHash`.
  - Freshness meldet `SECURITY_MASTER_UNCHANGED_CONTENT`, wenn nur flüchtige Felder wechseln.
  - Der Leser hält solche Generationen weiter zurück; ob er sie ausliefert, ist Schritt 4 (eigene Entscheidung).
  - Damit braucht ein fachlich unveränderter Wochenlauf künftig keinen Backtest-Neubau.
- **Wartbarer Prozess:** Wöchentlicher Lauf mit Gate G1–G10 und `SKIP_NO_MATERIAL_CHANGE`. Der Zeitplan (P6) ist ein eigener PR nach dem Wechsel, nicht vorbereitet.
- **Bei #1119** (SEC-belegte Delistings, 132 Zeilen) überlagern sich die G7-Freigaben. Erst nach dem Wechsel mergen.

## 3. Täglicher Betrieb

- **#1137 (Gate A):** Der bestehende Workflow wird an die Nachtkette gekoppelt. Den Anstoß gibt `supertrader-signals.yml`; dazu kommt ein Rückfall-Zeitplan.
- **Veröffentlichungsvertrag** `sf8-auto-publication-1.0.0` statt manuellem Fingerabdruck:
  - zwei unabhängige Läufe;
  - DQ-SF8-1..8 PASS;
  - Forschungsstatus unverändert;
  - dieselben Fachmodelle;
  - nie älter als der veröffentlichte Stand;
  - Plausibilität;
  - Dauerbetrieb in der Registry.
- **Bei Verstoß:** kein Commit, Alarm-Issue. Der gute Stand bleibt stehen.
- **#1146 (Core):** entfernt `activation`, setzt V6 (e) um.
- **Voraussetzungen:** V1 (siehe 4.), Security Master vor dem 11.11., die Variablen `SF8_CANDIDATES_ENABLED` und `SF8_AUTO_PUBLISH`.
- Das unabhängige Review ergab einen MAJOR (ACTIVATING durfte den Dauerbetrieb tragen). Er ist behoben.

## 4. V1-Stabilität (unverändert S1–S7)

| | Stand 30.10. | frühestens |
|---|---|---|
| S1 | 1 von 5 (40803128385); Lauf 40989532165 lief um 07:00 noch | 04.11. |
| S2 | offen, kein Eingriff | mit S1 |
| S3 | erfüllt | – |
| S4 | offen; ENLV, NUWE, PARA, SCAG am 29.10. durch den Reparaturlauf geheilt (f8114f6); neu ATYR, OMEX, AXG (Reverse-Splits), Reparatur 30.10. ausstehend | 31.10. |
| S5 | 1 von 2; der Montagslauf am 02.11. scheitert ohne #1098 sicher | 02.11. (nur mit #1098) |
| S6 | nicht erfüllt: Master 48,6 Tage alt, Wochenlauf blockiert | nach #1136 und Freigabe |
| S7 | nicht erfüllt: DQ-PX-4/TW-3 (ATYR/OMEX/AXG), DQ-SF8-8 3.225 | strukturell erst mit Tageslauf |

- **PARA** ist kein Ticker-Fall Paramount: `ref_PARA` ist Banzai International mit regulärer Split-Kette. Paramount Skydance ist `ref_PSKY`.
- Die geheilten Fälle zeigen: Der Reparaturmechanismus funktioniert, aber mit einem Fenster von etwa 7 Stunden.
- **Ohne Alarm** liefen die drei roten SEC-Consumer-Läufe und der rote Security-Master-Lauf, weil beiden Workflows der Alarmschritt fehlt (Vorschlag F6).

## 5. Quant V13 für Supertrader (#1142)

- **Verfügbar ist nur das öffentliche Register:** 4.322 Ketten, davon **1.675 QUALIFIED** (bestätigt), ohne Ticker, Intervalle und Kurse.
- **Nicht in dieser Umgebung:** die privaten Reihen. Sie liegen verschlüsselt in Actions-Artefakten, **die am 05.11.2026 ablaufen**, und im Archiv 1.1.0 der früheren Sitzung; der R2-Upload ist nicht erfolgt.
- **Zählungen:** 390 und 1.576 sind bestätigt, gelten aber für Wochen-Frames der Quant-Studien. Für Supertrader-Tagesbalken bleiben ab 2015 höchstens 1.522 Kandidaten.
- **Lücke vor 2010:** bestätigt.
- **Geliefert:** ein reproduzierbarer A/B-Runner mit eingefrorenen Parametern und Vorab-Registrierung, außerdem 13 Tests mit synthetischen Daten. Keine echten Ergebnisse, keine erfundenen Zahlen.
- **Rechte:** Eine ausdrückliche Freigabe der V13-Reihen für Supertrader und die Veröffentlichung von Kennzahlen fehlen.

## 6. Zertifizierung

Keine Methode ist zertifizierungsreif:
- CC-5 ist offen: 83 Quarantänesitzungen ohne lizenzierte CA-Quelle.
- CC-8 ist offen: Out-of-Sample erst mit Paper 2027.

Reihenfolge nach Validierbarkeit mit vorhandenen Daten: **C02, C01, C08, C12, C03, C07, C06, C13, C11, C05, C04, C09, C10**. Begründung je Methode im Zertifizierungsbericht.

## 7. PRs

| PR | Inhalt | Gate | Tests | Review |
|---|---|---|---|---|
| #1098 | SEC-Consumer-Tests (vorbestehend) | Quant | lt. PR | – |
| #1100 / #1101 | Freeze / Nachweis 1.3.0 (vorbestehend) | Quant | SMF, SMW-11 | vorbestehend |
| **#1136** | Nachholdrift, Freeze V10–V13c | Quant | Quant 3.581/0 | unabhängig, eingearbeitet |
| **#1141** | Inhalts-Fingerabdruck Schritt 2+3 | Quant/Server | Quant 3.581/0, Isolation OK | – |
| **#1137** | Tageslauf, Veröffentlichungsvertrag | Supertrader A | Supertrader 949/0 | unabhängig, eingearbeitet |
| **#1146** | Registry Dauerbetrieb (V6 e) | Core | Core 298/299 (bekannt) | – |
| **#1142** | V13-Vergleichsstudie (isoliert) | Supertrader A | Supertrader 955/0, Isolation OK | – |
| dieser PR | Berichte S9 (nur Doku) | Supertrader A | – | – |
| #1099 | V1-Stand 29.10. (nur Doku) | Supertrader A | – | durch den Stand vom 30.10. ersetzt; schließen oder als Verlauf mergen |
| #1119 | SEC-Delisting-Ableitung | Quant | lt. PR | erst nach dem Wechsel |

## 8. Merge-Reihenfolge und Fristen

1. **Bis Mo 02.11., 07:30 UTC:** #1098. Ohne ihn scheitert der geplante SEC-Consumer-Lauf sicher, und S5 verschiebt sich auf frühestens 09.11.
2. **Bis 05.11.:** V13-Archiv sichern (R2-Upload, Schlüssel ablegen), sonst ist ein Neuabruf nötig (8.620 Anfragen). Das ist unabhängig vom Merge von #1142.
3. **Bis 10.11.:** #1100 → #1101 → #1136, dann die Freigabe unten, Drift neu messen, Lauf 1 (`commit=false`), Lauf 2 (`commit=true`).
4. Nach dem Wechsel: #1141 (Hash-Vertrag, eigene Freigabe), dann #1119 (eigene G7-Freigabe), danach die Erzeuger-PRs für Survivorship-Kontrolle und Emerging Leaders sowie der Wochen-Zeitplan P6.
5. Tageslauf: #1137 → #1146 → Variablen. Dafür V1-Weg (a) oder (b) wählen (`SUPERTRADER_9_DAILY_OPERATIONS.md`).
6. Berichte: dieser PR; #1142 als Draft bis zur Datenfreigabe.

## 9. Gebündelte Freigabevorlage

```
Supertrader 9 – Owner-Freigaben (eine Zeile je Entscheidung)

A  SEC-Consumer
[ ] #1098 mergen (vor 02.11., 07:30 UTC)

B  Security Master (vor 11.11.)
[ ] #1100, #1101, #1136 mergen (in dieser Reihenfolge)
[ ] Klassifiziererwechsel 1.1.0 → 1.3.0: 138 Typ-/138 Eignungswechsel, 127 IDs entfallen; „133“ als falsch bestätigt
[ ] Nachholdrift (drift-lists.md) freigeben: Delistings, canonical_id, Eignung true → false, SEC-Namen
[ ] Tickerwiederverwendung, 35 IDs, als mehrdeutig übernehmen (--include-ticker-reuse)   ja / nein
[ ] OKE-Doppelung freigeben (ONEOK danach nicht backtestfähig) (--include-duplicates)     ja / nein
       (ein Nein bei einer der beiden Zeilen blockiert den Wechsel; ab 11.11. steht dann der Tageslauf)
[ ] privater freeze erstellt: filesSha256 ________
[ ] Lauf 1 commit=false (allow_version_change, approved_changes, approved_drift): Lauf ____  Gate PASS
[ ] Lauf 2 commit=true: Lauf ____
[ ] #1141 Inhalts-Fingerabdruck (additiver Hash-/Freshness-Vertrag)                        ja / später
[ ] #1119 erst nach dem Wechsel, mit eigener G7-Freigabe                                    ja / später

C  Täglicher Betrieb
[ ] V1-Weg: (a) Merge nach S1, S5, S6; S7 im ersten automatischen Lauf   oder   (b) Stand 28.10. zurücknehmen
[ ] #1137, dann #1146 mergen
[ ] Variablen: SF8_CANDIDATES_ENABLED=true, danach SF8_AUTO_PUBLISH=true

D  Quant V13 / Studie
[ ] V13-Reihen dürfen für Supertrader-Research genutzt werden                              ja / nein
[ ] Kennzahlen der Studie dürfen veröffentlicht werden                                      ja / nur intern
[ ] Archiv vor 05.11. nach R2 sichern (Netzfreigabe *.r2.cloudflarestorage.com, Secret V13_ARCHIVE_PRIVATE_KEY)

E  Kleinere Folge-PRs (keine Modelländerung, noch nicht vorbereitet)
[ ] F6 Alarm für sec-consumer-fundamentals.yml und security-master-weekly.yml
[ ] F3 Erzeuger bzw. Registry für eligibility.json (securityMaster ohne Workflow, Health STALE)
[ ] F7 diagnose.mjs um den Tag/Woche-Vergleich (DQ-PX-4)
[ ] Identitätsprüfung der 14 Titel mit weiterlaufender Reihe (u. a. PCLN, NYNY) und ref_BNZI/ref_PARA

Freigegeben: ____________  Datum: __________
```
