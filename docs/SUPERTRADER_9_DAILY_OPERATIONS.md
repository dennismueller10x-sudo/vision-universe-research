# Supertrader 9 – automatischer Tageslauf der Research-Kandidaten

Stand 31.10.2026: gemergt mit #1137 (Workflow, Vertrag) und #1146 (Core, Registry im Dauerbetrieb ohne `activation`). Eingeschaltet ist damit nichts: Solange `SF8_AUTO_PUBLISH` nicht `true` ist, läuft der Rückfall-Zeitplan leer (Job übersprungen), der Anstoß aus `supertrader-signals.yml` entfällt (Job `sf8` übersprungen, z. B. Lauf 41166562555 am 31.10.), und es bleibt nur der manuelle Weg. Der veröffentlichte Stand veraltet deshalb weiter mit jeder Sitzung (Systemzustand `BEHIND_1_SESSIONS`, DQ-SF8-8 rot, siehe unten). Grundlage ist die Owner-Entscheidung vom 29.10.2026 (`docs/SUPERTRADER_8_FIRST_RELEASE.md`): Ein täglicher Zeitplan ist grundsätzlich freigegeben, sobald V1 (S1–S7) erfüllt ist, ohne manuelle Freigabe je Datenstand.

Es gibt keine zweite Pipeline. Erweitert wird nur der bestehende Workflow `.github/workflows/supertrader-sf8-candidates.yml`. Alle 13 Methoden bleiben `LIVE_NOT_APPROVED`, `VALIDATED_TRADE_SIGNAL` bleibt gesperrt, und es gibt keine Orders.

## Warum jetzt

Seit der ersten Veröffentlichung (3e7fc17, Stand 28.10.) veraltet der Kandidatenstand mit jedem Nachtlauf. DQ-SF8-8 vergleicht den Kandidatenschluss mit dem veröffentlichten Schluss derselben Sitzung. Deshalb gilt:

- Nach dem Nachtlauf vom 30.10. ist DQ-SF8-8 für alle 3.225 Kandidaten rot.
- Der Zustandstest in `core/tests` ist auf `main` rot (`DQ-SF8 · Repository-Stand`, 298/299). Das trifft jeden PR, der `core-ci` auslöst.
- Ohne täglichen Stand ist V1-S7 („data-quality ohne ERROR“) **dauerhaft unerreichbar**. Die Regel wird nicht gelockert.

## Ablauf

```
Nachtkette (market-data-refresh: refresh → materialize → freshness-contract)
  → Job supertrader: stößt supertrader-signals.yml an (bestehend)
      → Job sf8 (neu): stößt supertrader-sf8-candidates.yml mit mode=auto an
           (nur main, nur mit SF8_CANDIDATES_ENABLED und SF8_AUTO_PUBLISH; eigener Job, macht die Signale nie rot)
Rückfall: eigener Zeitplan 11:43 UTC Di–Sa, falls der Anstoß ausbleibt
```

Ein Lauf im automatischen Weg:

| # | Schritt | rot heißt |
|---|---|---|
| 1 | Weg bestimmen: `schedule` oder `mode=auto` ist automatisch, nur auf `main` und nur mit `SF8_AUTO_PUBLISH=true` | kein Lauf |
| 2 | Produkt- und Vertragstests `sf-*` | kein neuer Stand |
| 3 | Eingangsprüfung `--require-current`: Marktstand = letzte XNYS-Sitzung, Nebenquellen im Höchstalter (Security Master 60, Namen 45, Wochenreihen/SIC/Kontinuität 10 Tage) | Exit 3, kein neuer Stand |
| 4 | Öffentliche Teile ohne `records/`, Budget 16 MB bzw. 2 MB je Datei | kein neuer Stand |
| 5 | DQ-SF8-1..8 auf dem Laufergebnis, jede Regel PASS mit `checked > 0` | kein neuer Stand |
| 6 | Fingerabdruck | – |
| 7 | **zweiter, unabhängiger Lauf** in ein zweites Verzeichnis, Fingerabdruck | – |
| 8 | **Veröffentlichungsvertrag** `sf8-auto-publication-1.0.0` | BLOCKED: Exit 5, kein Commit |
| 9 | Commit genau des geprüften Verzeichnisses in **einem** Commit, Nachweis als Trailer; Push über `push-with-retry.sh` | – |
| 10 | Alarm: Ein roter automatischer Lauf öffnet bzw. ergänzt ein Issue `pipeline-alarm` (`supertrader-sf8-candidates`); ein grüner schließt es | – |

Das vollständige Ergebnis bleibt 14 Tage als CI-Artefakt erhalten, auch bei Rot: Vertragsdatensätze, DQ-Bericht, Vertragsnachweis.

## Veröffentlichungsvertrag `sf8-auto-publication-1.0.0`

`scripts/supertrader/source-faithful/product/publication-contract.mjs`, Tests `sf-sf9-publication.test.mjs` (SF9-PUB-1…7). Er ersetzt die Freigabe des Fingerabdrucks durch eine technische Prüfung:

| | Prüfung | Grund |
|---|---|---|
| C1 | Zwei Läufe derselben Eingaben im selben Lauf ergeben denselben Fingerabdruck; `summary.inputs` trägt Eingaben-Fingerabdruck und Quelldateien | belegt die Deterministik des Codes. Eingaben, die vom Repository-Stand abweichen, findet er **nicht**: Beide Läufe lesen denselben Checkout, dieselbe Laufzeit und dasselbe `--previous` |
| C2 | DQ-SF8-1..8 vollständig, je PASS mit `checked > 0` | doppelt zu Schritt 5, nachweisbar im Record |
| C3 | `status` = LIVE_NOT_APPROVED / DIAGNOSTIC_NOT_CERTIFIED / LOCKED_FOR_ALL_13 / NONE, 0 `VALIDATED_TRADE_SIGNAL`, dieselben 13 Methoden, alle LIVE_NOT_APPROVED | Der Forschungsstatus kann sich nie automatisch ändern |
| C4 | Schema, alle `versions` (samt `candidateContractSha256`) und die Engine-Version jeder Methode wie im veröffentlichten Stand | Nach einer Modelländerung (eigener PR mit Vorher/Nachher) ist die erste Veröffentlichung manuell |
| C5 | neuer Stand nie älter; gleiche Sitzung = `SKIP_SAME_SESSION` (kein Commit, grün); ohne veröffentlichten Stand BLOCKED | Ein guter Stand wird nie durch einen älteren ersetzt; der Lauf ist idempotent |
| C6 | Kandidaten 50–200 % des veröffentlichten Stands, Titel mit Daten mindestens 90 %, 0 verworfene Eingaben oder Datensätze | Datenbetrieb: ein halbierter Eingang ist ein Datenfehler, kein Marktbefund. Ein Verstoß ändert nichts, er verlangt den manuellen Weg |
| C7 | Registry-Eintrag `supertrader-sf8-candidates` im **Dauerbetrieb**, also ohne `activation` | `ACTIVATING` ist laut Registry nur die erste Veröffentlichung und gilt nur für den manuellen Weg. Der Dauerbetrieb braucht den eigenen Core-PR (V6 e), der das Feld entfernt und die Texte zu Zeitplan und Freigabe korrigiert |

**Nachweis je Veröffentlichung**, dauerhaft in Git als Trailer der Commit-Nachricht:

```
SF8-Contract: sf8-auto-publication-1.0.0
SF8-Fingerprint: <sha256 der öffentlichen Dateien>
SF8-Inputs-SHA256: <summary.inputs.inputsSha256, derselbe Wert wie in summary.json>
SF8-Source-Files-SHA256: <sha256 der Liste summary.inputs.sourceFiles>
SF8-Previous-AsOf: <ersetzter Stand>
SF8-Code-Commit: <main-SHA des Laufs>
SF8-Run: <Lauf-ID>
```

**Nachprüfen:** `main` auf `SF8-Code-Commit` auschecken. Die Eingaben stehen mit SHA-256 in `summary.json`. Ein Lauf mit `--require-current` am selben UTC-Tag ergibt denselben Fingerabdruck; das ist C1 im Lauf selbst.

## Fail closed: was nie passiert

- Ein roter Schritt, ein BLOCKED-Vertrag, eine veraltete Eingabe oder ein Abbruch erzeugt **keinen Commit**. Der veröffentlichte Stand bleibt unverändert.
- Ein älterer Stand ersetzt nie einen neueren (C5). Zwei Läufe gleichzeitig gibt es nicht (Concurrency-Gruppe je Branch, `cancel-in-progress: false`).
- Teilstände gibt es nicht: Das Verzeichnis wird vollständig ersetzt, in genau einem Commit.
- Keine Hochstufung (C3), keine automatische Veröffentlichung nach einer Modelländerung (C4).
- Kein automatischer Weg außerhalb von `main` oder ohne `SF8_AUTO_PUBLISH`.

Der manuelle Weg (`mode=manual`, `commit=true`, `expected_sha256`) bleibt **unverändert**. Über ihn laufen die erste Veröffentlichung nach einer Modelländerung und jeder Fall, den der Vertrag ablehnt.

## Was bewusst nicht enthalten ist

- **Kein Bezug außerhalb von Gate A.** `market-data-refresh.yml` und `scripts/ci/supertrader-chain.mjs` bleiben unverändert. Angestoßen wird aus `supertrader-signals.yml`, das die Kette ohnehin startet.
- **Kein `workflow_run`.** Dieser Auslöser hat auf `main` nachweislich nie gefeuert (Kommentar in `market-data-refresh.yml`, 29.09.2026).
- **Keine Änderung an `core/registry/domains.json`.** Dieser PR ist der Supertrader-Teil von V6 (e) und (f): `registry-guard.mjs` lässt den Eintrag jetzt auch ohne `activation` zu (Dauerbetrieb). Das Feld selbst entfernt ein eigener Core-PR, der auch die Texte korrigiert („(Beta)“, „Owner-Freigabe AUSSTEHEND“, `schedule`). Erst danach besteht der automatische Weg C7. Das ist mit #1146 geschehen (`7bc47f7`): Der Eintrag trägt kein `activation` mehr, C7 ist erfüllt.
- Keine neue DQ-Regel, keine geänderte Grenze, kein neuer Anbieter, keine Secrets (der Alarm nutzt `github.token`).

## Inbetriebnahme (Owner)

| # | Schritt | Voraussetzung |
|---|---|---|
| 1 | Merge dieses PR | erledigt (#1137) |
| 2 | Variable `SF8_CANDIDATES_ENABLED=true` (laut Ablauf der ersten Veröffentlichung nach Lauf B zurück auf `false`; Stand bitte prüfen) | – |
| 3 | Optional, als Probe vor 3a (seit #1146 nicht mehr möglich): ein Lauf `mode=auto` mit `SF8_AUTO_PUBLISH=true` endet mit C7 BLOCKED ohne Commit. Das belegt fail closed | Security Master nicht STALE (vor dem 11.11. oder nach dem Wechsel, PR #1136) |
| 3a | Core-PR V6 (e): `activation` aus dem Eintrag `supertrader-sf8-candidates` entfernen, Texte korrigieren (ab dann ist ein fehlendes Artefakt FAILED) | erledigt (#1146) |
| 4 | Variable `SF8_AUTO_PUBLISH=true`: ab dann Anstoß nach der Nachtkette und Rückfall-Zeitplan | 3a gemergt |
| 5 | Zurücknehmen: `SF8_AUTO_PUBLISH=false` (nur noch manuell) oder `SF8_CANDIDATES_ENABLED=false` (gar nicht) | – |

**V1 und dieser PR.** S7 lässt sich ohne Tageslauf nicht erfüllen (DQ-SF8-8, siehe oben). Ein „erst S1–S7, dann Tageslauf“ blockiert sich deshalb selbst. Zwei ehrliche Wege, beide Owner-Entscheidung:
- **(a)** Merge nach S1, S5, S6 (die Kette ist stabil). S7 wird im ersten automatischen Lauf gemessen: Der Lauf darf nur mit DQ-SF8-1..8 PASS committen, und das core-`data-quality` danach muss ohne ERROR sein.
- **(b)** Bis dahin den Stand vom 28.10. zurücknehmen (Rückweg aus `SUPERTRADER_8_FIRST_RELEASE.md`). Dann ist S7 ohne Kandidaten messbar.

Eine Lockerung von DQ-SF8-8 ist keiner der Wege.

**Bekannte Folge auch im Dauerbetrieb:** Zwischen dem Refresh-Commit der Nachtkette (~03:40 UTC) und dem Kandidaten-Commit (~04:30 UTC, beim Rückfall-Zeitplan 11:43 UTC plus Verspätung) ist DQ-SF8-8 auf `main` rot. In diesem Fenster gilt das auch für den Zustandstest in `core/tests`, und jeder PR mit `core-ci` ist betroffen. S7 ist deshalb nach dem Kandidaten-Commit des Tages zu messen.

Ohne veröffentlichten Stand (`prev.counts.candidates = 0` oder fehlend) bleibt der automatische Weg BLOCKED, bis ein manueller Lauf veröffentlicht.

## Probelauf und S7-Prüfung (30.10.2026, ~10:00 UTC, ohne Commit)

Lokal auf `main` (5e9d2b9) zusammen mit diesem PR. Es wurde nichts committet und kein Lauf ausgelöst.

| Schritt | Ergebnis |
|---|---|
| Eingangsprüfung | `CURRENT`: Stand 29.10., erwartet 29.10. (Materialisierung 9685f63, 06:44 UTC) |
| zwei unabhängige Erzeugungen | 3.840 Kandidaten (2.304 / 1.468 / 68 / 0 VALIDATED), 5.100 Titel; Fingerabdrücke **gleich** `defb6d63…` |
| Budget | 14,2 MB, keine Datei über 2 MB |
| DQ-SF8-1..8 | alle **PASS** (Preisabgleich 0/3.840, Identität 0/3.840, Stufensperren 0/11.585) |
| Vertrag mit heutiger Registry (`ACTIVATING`) | **BLOCKED** (C7), kein Commit. So vorgesehen: Ohne #1146 kein Dauerbetrieb |
| Vertrag mit Registry ohne `activation` (#1146) | `SKIP_SAME_SESSION`: Der Stand vom 29.10. ist schon veröffentlicht, also kein Commit |

**Bereits veröffentlicht:** Der manuelle Weg lief am 30.10. um 07:29 UTC (Lauf 41020409882, Commit 204a517, Stand 29.10.). Sein Fingerabdruck `977c3a03…` weicht vom Probelauf ab, und das ist erwartet: Er rechnete die Änderungen gegen den Stand vom 28.10., der Probelauf gegen den vom 29.10. (`--previous`). Innerhalb eines Laufs sind beide Erzeugungen gleich (C1).

**Löst der erste automatische Lauf den S7-Zirkel auf?**
- **DQ-SF8-8: ja.** Mit dem Stand vom 29.10. ist DQ-SF8-8 auf `main` grün. Der Zustandstest in `core/tests` ist wieder 300/300. Ab dem ersten automatischen Lauf bleibt das jeden Tag so, außer im Fenster zwischen dem Refresh der Nachtkette und dem Kandidaten-Commit (siehe oben). Weder ein Test noch die Registry wird dafür abgeschwächt: Der Vertrag verlangt alle acht Regeln, und #1146 entfernt nur das Feld der ersten Veröffentlichung.
- **S7 insgesamt: noch nicht.** `data-quality` meldet am 30.10. weiter ERROR für DQ-PX-4 (ATYR, AXG, OMEX) und DQ-TW-3 (ATYR, OMEX). Ursache sind Reverse-Splits in Wochenreihe und Technical. Zuständig sind `long-series.yml` und `technical-world.yml`, nicht der Tageslauf. S7 gilt erst, wenn nach dem Kandidaten-Commit eines Tages beides grün ist.

## Prüfungen

- `node --test scripts/supertrader/tests/sf-sf9-publication.test.mjs`: 7/7, jede Vertragsregel mit Gegenprobe.
- `SF8-DAILY-WORKFLOW` (ersetzt `SF8-DAILY-DISABLED`): genau ein Zeitplan; kein `push`, `pull_request` oder `workflow_run`; beide Variablen; automatisch nur auf `main`; Reihenfolge DQ → Fingerabdruck → zweiter Lauf → Vertrag → Commit; Eingaben nur über `env:`; keine Secrets; Alarm; Anstoß nur aus `supertrader-signals.yml`. Gegenproben lokal: Ein zusätzliches `workflow_run`, ein zweiter Zeitplan, ein Job ohne `SF8_AUTO_PUBLISH`, ein fehlender `main`-Schutz, Commit bei `!= BLOCKED` und ein Vertrag mit nur einem Fingerabdruck machen den Test jeweils rot.
