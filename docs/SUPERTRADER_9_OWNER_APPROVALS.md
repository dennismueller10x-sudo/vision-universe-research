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

## 10. Nachtrag 30.10.2026, ~10:00 UTC: Owner-Entscheidungen und Abschlusslauf

| Bereich | Stand |
|---|---|
| A SEC-Consumer | **#1098 gemergt** (Merge-Commit `753de56`). Den Head habe ich vorher gegen `main` 7d20956 geprüft: 11/11, keine Schutzfunktion abgeschwächt. Der Nachweis für S5 kommt erst mit dem geplanten Lauf am Mo 02.11., 07:30 UTC; die Auswertung ist für 14:00 UTC vorgemerkt. Die Alarm-Lücke schließt Draft #1156 |
| B V13-Archiv | **nicht gesichert.** Gültig ist Archiv **1.2.0** mit 8 Teilen, 1,50 GB (`manifest-1.2.0.json` in Draft #1140). Laut Quant-Sitzung stimmen alle 8 Teile mit dem Manifest überein, der private Schlüssel liegt vor, und die Restore-Probe für `v13-derived` war hash-identisch. Die Daten liegen aber **nur im Container dieser einen Sitzung**. Blocker: Die Umgebung erreicht `*.r2.cloudflarestorage.com` nicht (HTTP 000), und das Secret `V13_ARCHIVE_PRIVATE_KEY` fehlt (Lauf 41011143637) |
| C Security Master | **Gate-Freigabe über #1143** (Owner-Entscheidung 30.10.). ONEOK bleibt im Gate blockiert, bis ein Erzeuger-PR die identischen `canonical_id` zusammenführt. #1136 ist abgelöst, nicht mergen. Die unabhängigen Teile stehen in **#1159** (gestapelt auf #1100), dort Pflicht: die Backtest-Identitätssperre. Probelauf: **72 IDs**, darunter 34 Tickerwiederverwendungen, 22 geänderte Startdaten, 14 weiterlaufende Reihen, 1 entfallendes Listing und ONEOK. Wirkung: 6.397 → 6.150 backtestfähig, **0 neu backtestfähig**, keine Zusammenführung über das Symbol, übrig nur 9 reine Börsennamen-Wechsel. Dazu Freeze 546 Dateien inklusive V13c INTACT (Betriebsunterlagen `v13/archive/` ausgenommen) und der Alarm. 138/138/127 sind bestätigt, 133 ist widerlegt. Review eingearbeitet. Quant 3.674 Tests, 0 Fehler |
| D Tageslauf | Der manuelle Lauf 41020409882 hat am 30.10. den Stand vom 29.10. veröffentlicht (204a517). DQ-SF8-8 ist auf `main` grün, Core 300/300. Probelauf des automatischen Wegs: zwei Erzeugungen gleich, DQ-SF8-1..8 PASS, Vertrag ohne #1146 BLOCKED (C7), mit #1146 SKIP_SAME_SESSION. #1137 und #1146 zusammen: 317/317 |
| S7 | noch offen: DQ-PX-4 (ATYR, AXG, OMEX) und DQ-TW-3 (ATYR, OMEX). Zuständig ist der Reparaturlauf, nicht der Tageslauf |

### Was der Owner einmalig einstellen muss (V13-Archiv, vor 05.11.)

1. **Netzwerk:** In der Umgebung der Sitzung „Vision Universe Quant V10 Backtesting“ unter Network access → Allowed domains `*.r2.cloudflarestorage.com` freigeben (https://code.claude.com/docs/en/cloud-environments#network-access). Danach dort die Erreichbarkeit prüfen lassen.
2. **Schlüssel:** Den privaten Archivschlüssel `archive-priv.pem` aus dem Scratchpad derselben Sitzung (Pfad nennt die Sitzung) als Repository-Secret `V13_ARCHIVE_PRIVATE_KEY` **und** offline ablegen.
3. Die Sitzung führt dann `[v13-archive:keycheck]` → `[v13-archive:put]` mit `transfer.sh put` → `[v13-archive:verify]` → `[v13-archive:restore]` aus.
   - Erst `verify` mit allen 8 `cipherSha256` gilt als Sicherung.
   - **Wichtig:** Die Daten bestehen nur, solange dieser Container lebt. Eine neue Sitzung hat sie nicht.

### Merge-Reihenfolge Security Master (Stand 30.10., nach der Owner-Entscheidung zu #1143)

1. #1100 (Freeze-Werkzeug) → #1159 (Identitätssperre, Freeze V10–V13c, Alarm); daneben #1101 (Nachweis 138/138/127).
2. #1143 (Freigabeliste 1.1.0) und der Erzeuger-PR für identische `canonical_id` (ONEOK und 7 weitere, noch nicht vorhanden).
3. Neuer Probelauf `commit=false` → PASS → am selben Tag `commit=true`. Das ist eine Owner-Freigabe; Frist ist das Laufdatum 10.11.
4. Sperrliste aus dem committeten Stamm, dann `build-post-switch --blocklist` und `compare --approved … --blocklist …`. Den Leser umstellen nur mit eigener Freigabe.
5. Erst danach #1119.

## 11. Nachtrag 30.10.2026, ~15:30 UTC: Integration nach Owner-Auftrag A

| PR | Merge-Commit | Geprüfter Head | CI auf dem Head | Nach dem Merge auf `main` |
|---|---|---|---|---|
| #1100 Freeze-Werkzeug | `b8efea8` | main eingemischt | grün | Quant 3.679/0 |
| #1101 Nachweis 138/138/127 | `7276a7a` | `825fd10` | Quant CI, Core ×2, contract, package, validate grün | Quant 3.686/0, Core 300/0 |
| #1159 Identitätssperre, Freeze, Alarm | `8f12165` | `ff61e2d` | Quant CI, Core, SEC CI, FX, CI Config, Pages grün | Freeze `verify-repo` INTACT, Security-Master-Tests 30/0, Quant 3.694/0, Core 300/0, Testisolation sauber |

- **Freeze:** 550 Dateien. Alle 241 Dateien aus #1100 und **alle 546 aus #1136 sind hash-gleich enthalten**. Ausgenommen sind nur zwei Betriebsunterlagen, jede einzeln benannt (`frozen.notFrozen`): `docs/quant-recovery/v13/archive/README.md` und laufende `SESSION_HANDOVER_JJJJ-MM-TT.md`. Die Archiv-Manifeste 1.0.0–1.2.0 und `archive-pub.pem` sind eingefroren. Eine Fortschreibung der Archivunterlagen hebt den Schutz der Ergebnisse also nicht auf.
- **#1136 geschlossen**, mit Datei-für-Datei-Abgleich im PR. Der zweite Freigabeweg (Nachhol-Drift im Gate) wurde bewusst nicht übernommen. Die Gate-Freigabe läuft allein über #1143.
- **V13-Archiv 1.2.0: gesichert und unabhängig wiederhergestellt.** Belegt sind `put` 41068077861, `verify` 41069005168 (8/8 gegen `manifest-1.2.0.json`), `get` 41069696417 und **Runner-Restore 41073334070** (Secret gesetzt, `keycheck` OK, 8/8 Teile OK, 11.616 Dateien; selbst im Log geprüft). Offen bleibt nur ein Owner-Schritt, den ich nicht prüfen kann: die Offline-Kopie von `archive-priv.pem`.
- **ONEOK (#1163, Draft):** Register mit SEC-Beleg, fail closed. OKE und TEL sind aufgelöst (8-K12B nach 12g-3(a), 1:1, Reihe durchgehend). FUN, HUT, BAM, CCSI, NYXH und UHAL-B bleiben offen. Die Version bleibt 1.3.0 (Bindung an #1143). CI grün. Nicht gemergt, kein Lauf.
- **Tageslauf:** Die Research-Kandidaten auf `main` stehen auf 29.10. (`204a517`), die Signale auf 29.10. (`0271f7b`). Der Handelstag 30.10. kommt mit der Nachtkette. #1137 und #1146 sind vorbereitet, nicht gemergt.

### Security Master vor dem Laufdatum 10.11.: Was noch fehlt

1. Merge von #1143 (Freigabeliste 1.1.0) und #1163 (Doppelzeilen). Danach die Freigabeliste aus #1143 neu erzeugen, weil sich mit OKE/TEL die Zählung ändert. Dann G1–G10 unverändert prüfen.
2. Probelauf `commit=false` → PASS → am selben Tag `commit=true`. **Owner-Freigabe.**
3. Sperrliste aus dem committeten Stamm, `build-post-switch --blocklist --prev-master`, `compare --approved --blocklist`. Den Leser umstellen nur mit abschließender Freigabevorlage.

## 12. Stand 30.10.2026, ~16:30 UTC: Tageslauf, V1, Datenqualität, V13-Archiv

Die alte Quant-Sitzung wird archiviert. Was eine neue Quant-Sitzung übernimmt: `docs/SUPERTRADER_9_QUANT_UEBERGABE_20261030.md`. Am Security Master hat diese Sitzung nichts begonnen.

### 12.1 Täglicher Kandidatenlauf (#1137 → #1146), nicht gemergt

| | #1137 (Supertrader) | #1146 (Core, nur `core/registry/domains.json`) |
|---|---|---|
| Head nach Einmischen von `main` 8f12165 | `fa792e8` | `a41da8c` |
| Konflikte | keine | keine |
| Lokal allein | Supertrader 950/0, Core 300/0, Gate A OK | Supertrader 943/**2**, Core 300/0 |
| Lokal zusammen | Supertrader 950/0, Core 300/0 | |
| CI | Core, CI Config, FX grün; Supertrader Quality Gates siehe PR | Core **rot** mit genau denselben 2 Tests |

Die 2 roten Tests in #1146 allein sind die dokumentierte Reihenfolge, kein neuer Fehler: `SF2-LEGACY-ISOLATION` und `SF-PRODUCT-NO-RUN-INTEGRATION` (`SF8_DOMAIN_ACTIVATION_NOT_ALLOWED`). Erst der Registry-Guard aus #1137 lässt den Dauerbetrieb ohne `activation` zu. Auf `main` sind beide grün (943/0). Deshalb gilt: **#1137 → #1146 → Variable `SF8_AUTO_PUBLISH=true`** (`docs/SUPERTRADER_9_DAILY_OPERATIONS.md`). Jeder dieser Schritte ist eine Owner-Freigabe. Der Vertrag bleibt fail closed: Ein roter Lauf überschreibt keinen guten Stand, DQ-SF8-1..8 sind unverändert.

### 12.2 V1-Stabilität S1–S7 (Kriterien unverändert, nur echte Läufe)

| # | Stand | Beleg |
|---|---|---|
| S1 | **2 von 5** | 40803128385 (29.10.) und 40989532165 (30.10., Start 02:04, Ende 06:49) grün, beide `schedule`. Frühestens erfüllt mit dem Lauf am 04.11. |
| S2 | offen, bisher ohne Eingriff | kein Heil-Dispatch seit 27.10. |
| S3 | **erfüllt** | unverändert |
| S4 | offen | Reparaturlauf `long-series` 30.10. (41044254369) grün. DQ-PX-4 heute PASS (ATYR, AXG, OMEX geheilt). Samstags-Volllauf 31.10. steht aus |
| S5 | 1 von 2 | #1098 gemergt. Der nächste geplante Lauf ist Mo 02.11., 07:30 UTC, die Auswertung um 14:00 UTC ist vorgemerkt |
| S6 | **nicht erfüllt** | Der Stamm ist vom 11.09. (rund 49 Tage alt). Hängt am Lauf über #1143 und #1163 (Quant-Übergabe). Frist ist das Laufdatum 10.11. |
| S7 | **nicht erfüllt** | `data-quality` auf `main` 8f12165: **keine ERROR-Regel mehr** (DQ-PX-4, DQ-TW-3, DQ-SF8-8 PASS). DQ-PX-3 300 (Niveau 27.10.: 302) erfüllt. **DQ-PX-2 104 > 93** nicht erfüllt. `system-health`: SF8-Kandidaten und Supertrader gesund; Security Master STALE, US-Wertpapierstamm DEGRADED |

Ergebnis: **V1 nicht erfüllt.** Frühester Termin ist der 04.11. (S1), aber nur mit erneuertem Stamm (S6, S7).

### 12.3 Offene Datenqualität

- **DQ-PX-2 (104 Kursreihen ohne letzte Sitzung):** 95 davon liegen 5 und mehr Sitzungen zurück, z. B. AVB, CRNX, DBRG und die DBRG-Vorzugsaktien. Die Regel sagt selbst: „Delistete oder ausgesetzte Titel bleiben hier stehen, bis das Universum sie entfernt.“ Dazu passt DQ-ID-4 mit 112 Widersprüchen zwischen Stamm und Tagesreihe. Ursache ist der veraltete Stamm vom 11.09., nicht der Tageslauf. Erwartung: Der Stammlauf über #1143 löst den größten Teil. Das ist zu prüfen und nicht vorweggenommen. Keine Toleranz geändert.
- **DQ-PX-6/PX-7** (eingefrorene Kursenden 458/341), **DQ-SEC-1/2** (18/25): WARN. Kein V1-Kriterium, unverändert.
- **DQ-SF8-1..8:** PASS. Nicht gelockert.

### 12.4 V13-Archiv vor dem 05.11.2026

**Gesichert und unabhängig wiederhergestellt.** Belegt sind `put` 41068077861, `verify` 41069005168 (8/8), `get` 41069696417 und Runner-Restore **41073334070** (`keycheck` OK, 8/8 Teile, 11.616 Dateien). Workflow, `transfer.sh`, `restore-archive.sh`, `manifest-1.2.0.json` und `archive-pub.pem` sind auf `main` bytegleich mit dem Stand dieses Restores (`5ffe147`) und eingefroren.

Damit keine Daten verloren gehen, braucht es nur noch den Owner:
1. **Offline-Kopie von `archive-priv.pem` sicherstellen, solange die alte Quant-Sitzung noch nicht archiviert ist.** Die Datei liegt im Scratchpad dieser Sitzung. Ein GitHub-Secret lässt sich nicht auslesen. Ohne Offline-Kopie hängt das ganze Archiv an `V13_ARCHIVE_PRIVATE_KEY`. Falls die Kopie schon im Passwortmanager liegt (so steht es in #1158), ist nichts weiter zu tun.
2. **`V13_ARCHIVE_PRIVATE_KEY` nicht überschreiben oder löschen, keinen neuen Schlüssel erzeugen.** Ein neuer Schlüssel macht die vorhandenen Teile unlesbar.
3. Optional: #1158 mergen (nur Doku, CI grün). Für die Wiederherstellung nicht nötig.
4. Kontrolle jederzeit ohne Datenbewegung: ein Commit mit der Marke `[v13-archive:keycheck]`.
