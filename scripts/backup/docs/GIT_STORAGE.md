# Git-Sicherung: Speicherbedarf, Grenzen, Ausweichplan

## Verfahren

| Schritt | Platz auf dem Runner |
|---|---|
| Mirror-Klon (`git clone --mirror`, ein Pack) | 1 x Mirror |
| Voll-Bundle (erster Lauf einer Kette) = Kopf + **Hardlink** auf das Pack | + wenige KB |
| Inkrementelles Bundle (Folgeläufe) | + neue Objekte seit dem letzten Lauf |
| restic liest das Verzeichnis, Mirror wird vorher gelöscht | keine Kopie |
| Wiederherstellung: Pack wird **verschoben**, `git index-pack` schreibt nur den Index | 1 x Pack + Index |

Bisher entstand das Voll-Bundle mit `git bundle create --all` als zweite volle Kopie (2 x Mirror).

Integrität (unverändert streng):
- `git fsck --connectivity-only` auf dem Klon
- Pack-Kopf, SHA-1-Trailer über das ganze Pack, Abgleich mit dem `.idx`
- `git bundle verify` auf das zusammengesetzte Bundle
- SHA-256 von Kopf + Pack in `chain.txt`
- bei der Wiederherstellung: SHA-256 gegen `chain.txt`, `git index-pack` (prüft jedes Objekt), `fsck`, Refs gegen `refs.txt`

## Messung auf einem echten Runner (30.10.2026, `VU Git-Speicherprobe`, Lauf 41036899624)

Nur lesend: Klon des öffentlichen Repos, restic im Trockenlauf gegen ein lokales Wegwerf-Repository, kein Upload.

| Messung | Wert |
|---|---|
| Mirror `vision-universe-research` | 17,2 GB, 2.286 Refs |
| Spitzenbelegung Sicherung | **17,2 GB** |
| Spitzenbelegung inkl. Wiederherstellung und Arbeitskopie | 19,3 GB |
| bisheriges Verfahren, rechnerisch | 34,4 GB (+ Reserve) |
| frei vor dem Klon (nach `free-disk.sh`) | 43,8 GB |
| Spielraum | 26,6 GB |
| Dauer Klon + Prüfung + Lesen | 9 min |
| Dauer Wiederherstellung (index-pack, fsck, Arbeitskopie) | 7 min |
| Wachstum der Historie, 30 / 90 Tage | 12,7 GB / 17,1 GB |

## Grenze

Die Platzprüfung verlangt vor dem Klon `freier Platz ≥ letzter Mirror x 1,15 + 4 GB`. Bei 43,8 GB frei liegt die Grenze bei etwa **34 GB Mirror**.

| Wachstum | erreicht 34 GB nach |
|---|---|
| 12,7 GB/Monat (letzte 30 Tage) | ca. 6 Wochen |
| 5,7 GB/Monat (Mittel der letzten 90 Tage) | ca. 3 Monate |

Vorwarnung: Fällt der Restplatz nach dem Klon unter 16 GB (`VU_GIT_WARN_GB`) oder ist das Repository größer als 26 GB (`VU_REPO_SIZE_WARN_GB`), meldet healthchecks.io eine **Speicherwarnung per E-Mail**. Die Sicherung selbst läuft dann noch. Reicht der Platz nicht, bricht die Git-Sicherung vor dem Klon mit „zu wenig Speicher“ ab. Es wird nichts halb geschrieben, und die bestehende Kette bleibt unberührt.

## Ausweichplan

In dieser Reihenfolge prüfen:

1. **Wachstum an der Quelle** (kostenlos, Produktentscheidung). Die Historie wächst durch Datenläufe, die nach `main` committen. Bei 12,7 GB/Monat erreicht das Repository auch bei GitHub bald Größen, die GitHub nicht mehr empfiehlt. Große, neu erzeugbare Artefakte lassen sich nach R2 verlagern. Das ist ein eigener Produkt-PR und nicht Teil der Sicherung.
2. **Bedarfsgesteuerter Cloud-Runner** (Kosten, Freigabe nötig). Eine Spot-VM mit 100-GB-Platte wird nur für den Lauf gestartet und danach gelöscht, z. B. Google Compute Engine `e2-standard-2` Spot. Größenordnung: wenige Cent je Lauf, rund 1 USD im Monat. Werkzeuge und Ablauf bleiben gleich (`runner/container/`). Nötig sind ein Abrechnungskonto und eine Owner-Freigabe.
3. **GitHub Larger Runner** mit 150 GB SSD: kostenpflichtig je Minute, rund 15 USD im Monat. Nur, wenn 2. nicht in Frage kommt.

Nicht vorgesehen: das Weglassen von `refs/pull/*` oder flache Klone. Beides würde frühere Stände unvollständig sichern.

## Backblaze-Speicher (wichtig vor dem ersten echten Lauf)

Das erste Voll-Bundle hat 17,2 GB, danach kommen bei heutigem Wachstum 6–13 GB im Monat dazu. Der kostenlose Rahmen von B2 liegt bei **10 GB**. Ohne hinterlegte Zahlungsart lehnt B2 weitere Uploads ab. Die erste Git-Sicherung würde dann scheitern.

Kosten mit Zahlungsart: 6,95 USD je TB und Monat, die ersten 10 GB frei.

| | Belegung | Kosten im Monat |
|---|---|---|
| erster Monat | ~ 20–30 GB | ~ 0,15 USD |
| nach 12 Monaten | ~ 90–170 GB | ~ 0,55–1,15 USD |
