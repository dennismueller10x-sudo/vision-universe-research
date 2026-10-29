# V13-Research-Archiv: Sicherung, Schlüssel, Wiederherstellung

Privates Archiv der V13-/V13b-Rohdaten und Studieninputs. Die Daten stehen nicht im Repository; hier liegen nur Manifest, öffentlicher Schlüssel, Skripte und diese Anleitung.

## Inhalt ([manifest-1.0.0.json](manifest-1.0.0.json))

| Teil | Inhalt | Dateien | Bytes (verschlüsselt) |
|---|---|---:|---:|
| `v13-raw` | entschlüsselte Tiingo-Abrufe der vier Läufe (Tagesdaten aller 4.278 Ticker, Zusammenfassungen, Chiffretext-Hashes) | 15 | 323.911.712 |
| `v13-derived` | qualifizierte Wochenreihen (Register 1.0.0), Large-Cap-SEC-Belege und Fakten, Zwischenregister | 2.587 | 146.370.592 |
| `v13-studies` | Ereignisdateien der Studien S1–S3 (F0/F1/F1c/F1w) | 50 | 238.766.112 |
| `v13b-hist` | SEC-Dokumente und Ergebnisse HIST (28 Sturzfälle, SPX-Endwerte), Reihen Register 1.1.0, Abrufprotokoll | 1.271 | 277.575.712 |
| `v13b-f1w` | Ereignisdateien F1d (Studie 2.0.0) | 19 | 67.153.952 |
| `v12-listref` | V12-Listingreferenz (Referenzketten, Delisting-Register und -Gründe, HMAC-Schlüssel der chainIds, Tiingo-Tickerliste, EDGAR-Cache), Voraussetzung für `qualify.py` | 7.634 | 129.648.672 |

Nicht enthalten ist der private Transportschlüssel des Tiingo-Abrufs. Er wird nur für die abgelaufenen Abruf-Artefakte gebraucht.

## Verschlüsselung und Schlüsselverwaltung

- Jeder Teil hat einen eigenen zufälligen 256-Bit-Datenschlüssel; verschlüsselt wird mit `openssl enc -aes-256-cbc -pbkdf2 -iter 100000`.
- Jeder Datenschlüssel ist mit RSA-4096-OAEP-SHA256 an den **Archivschlüssel** gebunden und steht so im Manifest (`wrappedKeyB64`).
  - Öffentlicher Teil: [archive-pub.pem](archive-pub.pem), SHA-256 der DER-Form `1b38092a…266b5d`.
- **Privater Archivschlüssel:** nie in Git. Er liegt in der Sitzung, in der das Archiv gebaut wurde, und muss vom Owner dauerhaft abgelegt werden:
  1. als Repository-Secret `V13_ARCHIVE_PRIVATE_KEY`, damit künftige Actions-Workflows wiederherstellen können;
  2. zusätzlich offline, z. B. im Passwortmanager.

  Ohne diesen Schlüssel ist das Archiv nicht lesbar.
- Integrität: Das Manifest im Repository bindet SHA-256 von Chiffre- und Klartext; jeder Teil enthält ein Inventar (`_inventory.tsv`) mit SHA-256 je Datei.

## Speicherort

- Bestehender privater R2-Eimer, Präfix `research-snapshots/quant-v13/archive-1.0.0/`, wie die Supertrader-Snapshots. Zugang nur über die Actions-Secrets `VU_HISTORY_S3_*`.
- Kosten: Das Archiv umfasst 1,18 GB. Die R2-Freigrenze liegt bei 10 GB, die Nullkostenschranke des Projekts bei 8 GB; `presign.mjs --mode put` prüft die Belegung vor dem Upload und bricht über der Schranke ab.
- Unveränderlich: Ist der Präfix belegt, wird nicht überschrieben. Eine neue Version bekommt einen neuen Präfix.

## Ablauf

1. **Bauen:** `scripts/quant/v13/archive/build-archive.sh <scratchpad> <out> archive-pub.pem manifest.json`, lokal und ohne Netz.
2. **Lokale Probe:** `restore-archive.sh manifest.json <out> archive-priv.pem <ziel>`. Sie prüft Chiffre-, Klartext- und Datei-Hashes.
   - Am 29.10.2026 ausgeführt: alle 6 Teile und 11.576 Dateien identisch.
   - Zusätzlich lädt `research-delisted-series.cjs` alle 1.675 QUALIFIED- und 1.826 ladbaren Reihen hashgebunden aus der wiederhergestellten Kopie.
3. **Upload:**
   1. Commit mit Marke `[v13-archive:put]` auf einen `claude/**`-Branch. Der Workflow `quant-v13-archive.yml` legt verschlüsselte, 3 h gültige PUT-URLs als Artefakt ab.
   2. `transfer.sh put <artefakt> archive-priv.pem <out> manifest.json` lädt hoch und prüft die Hashes.
   3. Voraussetzung: Die Umgebung, die hochlädt, erreicht `*.r2.cloudflarestorage.com`.
4. **Prüfung in R2:** Marke `[v13-archive:verify]`. Der Workflow liest jedes Objekt und vergleicht es mit dem Manifest.
5. **Wiederherstellung:** Marke `[v13-archive:get]`, dann `transfer.sh get …` und `restore-archive.sh`.
   - In künftigen Actions-Workflows: direkt über den S3-Treiber (`scripts/market/storage/s3-driver.mjs`) lesen und mit dem Secret `V13_ARCHIVE_PRIVATE_KEY` entschlüsseln.

## Stand (29.10.2026)

| Schritt | Ergebnis |
|---|---|
| Bau und lokale Wiederherstellung | ausgeführt: 6/6 Teile und 11.576 Dateien hash-identisch; Reihen laden hashgebunden |
| R2-Lesezugriff und Kapazität (Run 40943780307, `[v13-archive:usage]`) | Eimer 95.170 Objekte, 4.775.085.305 B; mit Archiv 5,96 GB, unter der Schranke von 8 GB; Präfix leer |
| Upload | **nicht ausgeführt**: Die Sitzungsumgebung erreicht `*.r2.cloudflarestorage.com` nicht (Netzwerkrichtlinie). Nötig ist die Freigabe dieses Hosts in den Netzwerkeinstellungen der Umgebung; danach `[v13-archive:put]` → `transfer.sh put` → `[v13-archive:verify]` → `[v13-archive:get]` → `restore-archive.sh` |
| Ablage des privaten Archivschlüssels | Owner-Schritt (Secret `V13_ARCHIVE_PRIVATE_KEY` und offline) |

Bis zum Upload liegt das Archiv nur in der temporären Sitzung. Bei Verlust lässt es sich größtenteils neu erzeugen:
- Tiingo-Abruf über `claude/v13-delisted-fetch-4ho3rd`, 8.620 Anfragen;
- SEC-Dokumente über die Abrufskripte;
- Studien neu rechnen.

Die Register binden jede Reihe per SHA-256, sodass ein Neubau prüfbar ist.
