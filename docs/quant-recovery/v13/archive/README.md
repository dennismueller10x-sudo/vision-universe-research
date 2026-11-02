# V13-Research-Archiv: Sicherung, Schlüssel, Wiederherstellung

Privates Archiv der V13-/V13b-Rohdaten und Studieninputs. Die Daten stehen nicht im Repository; hier liegen nur Manifest, öffentlicher Schlüssel, Skripte und diese Anleitung.

## Generation 2.0.0 (02.11.2026) – gültige Generation

**Gültige Version: 2.0.0** ([../../v13-archive-gen2/manifest-2.0.0.json](../../v13-archive-gen2/manifest-2.0.0.json), SHA-256 `2a95196e…ccac96`), R2-Präfix `research-snapshots/quant-v13/archive-2.0.0/`. Das Manifest liegt in einem neuen Verzeichnis, weil `v13/` eingefroren ist (SMF-1 erlaubt nur neue Verzeichnisse).

### Anlass: Befund zur Schlüsselableitung (01.11.2026)

`build-archive.sh` erzeugte je Teil 32 Binärbytes (`openssl rand -out <key> 32`) und verschlüsselte mit `openssl enc … -pass file:<key>`. `-pass file:` liest nur bis zum ersten `\n` bzw. NUL. Die wirksame Passphrase war damit bei etwa 22 % der Teile gekürzt (≈3 % höchstens 3 Byte, ≈0,8 % leer). Gleiches galt für den URL-Schritt des Workflows (`k.bin`); diese Artefakte waren 1 Tag gültig und sind abgelaufen. Die RSA-Bindung (OAEP-SHA-256) ist nicht betroffen.

Behoben: Verschlüsselt wird nur noch über [seal-part.sh](../../../../scripts/quant/v13/archive/seal-part.sh). Der Datenschlüssel ist dort `openssl rand -hex 32` (64 Hex-Zeichen + LF), die wirksame Passphrase hat also immer 64 Zeichen. Format und Rundlauf werden vor der Ausgabe geprüft. `build-archive.sh` und `[v13-archive:regen]` nutzen diesen Weg.

### Schlüsselprüfung je Generation (`[v13-archive:keyaudit]`, Runs 41398544194 für 1.x und 41399813949 für 1.x + 2.0.0)

Im Job wird jeder `wrappedKeyB64` mit `V13_ARCHIVE_PRIVATE_KEY` entpackt. Gemeldet werden nur die Länge und die wirksame Länge (Bytes vor `\n`/NUL); Schlüsselbytes und ihre Hashes werden nicht ausgegeben.

| Generation | in R2 | Teile | weak (< 32) | leer | ≤ 3 B | betroffene Teile (wirksame Länge) |
|---|---|---:|---:|---:|---:|---|
| 1.0.0 | nie hochgeladen | 6 | 1 | 0 | 1 | `v13b-hist` (3 B) |
| 1.1.0 | nie hochgeladen | 7 | 2 | 0 | 0 | `v13b-hist` (31 B), `v13b-f1w` (16 B) |
| 1.2.0 | ja, `archive-1.2.0/` | 8 | 1 | 0 | 0 | `v13-raw` (18 B) |
| 2.0.0 | ja, `archive-2.0.0/` | 8 | 0 | 0 | 0 | keine; alle 64 Zeichen (65 B, Hex + LF) |

Alle anderen Teile hatten die vollen 32 Byte. Kein hochgeladener Teil hatte eine leere Passphrase. Der schwächste hochgeladene Teil (`v13-raw` in 1.2.0) hatte 18 zufällige Bytes, also 144 Bit. Das liegt unter der Vorgabe von 256 Bit, war aber praktisch nicht zu erraten. Die gewickelten Datenschlüssel stehen absichtlich im öffentlichen Manifest. Sie sind nur mit dem privaten Archivschlüssel lesbar.

### Neue Generation (`[v13-archive:regen]`, Run 41398712451)

- Je Teil wird das 1.2.0-Objekt aus R2 gelesen und gegen `manifest-1.2.0.json` geprüft: Chiffretext, Klartext-Tar, Inventar und jede Datei.
- Danach wird **derselbe Klartext-Tar** (bytegleich) mit einem neuen Hex-Schlüssel verschlüsselt und nur unter `archive-2.0.0/` hochgeladen.
- Schutz vor Überschreiben:
  - Der Präfix muss leer sein.
  - Vor jedem PUT prüft ein HEAD, ob das Objekt schon existiert; dann bricht der Lauf ab.
  - Nach dem PUT wird die Größe per HEAD geprüft.
  - Der alte Präfix wird nur gelesen. Der Bericht meldet `oldPrefixWritten: false`, `overwrites: 0`.
- `plainSha256`, `plainBytes`, `inventorySha256` und `files` je Teil sind identisch mit 1.2.0. Neu sind nur `cipherSha256`, `cipherBytes` und `wrappedKeyB64`.
- Eimer vor dem Upload: 95.179 Objekte, 6.277.217.606 B. Dazu kommen 1.500.498.176 B, zusammen also 7,78 GB. Das liegt unter der Nullkostenschranke von 8 GB, aber nur knapp.

### Unabhängige Wiederherstellung (`[v13-archive:verify2]`, Run 41399476800)

Eigener Lauf auf einem frischen Runner (anderer Runner als der regen-Lauf). Er liest nur `archive-2.0.0/`, entschlüsselt mit dem Secret und prüft je Teil:
- den Chiffretext gegen 2.0.0;
- den Klartext gegen 2.0.0 **und** gegen 1.2.0;
- das Inventar und jede Datei;
- das Schlüsselformat (65 B, wirksam 64);
- dass Chiffretext und gewickelter Schlüssel sich von 1.2.0 unterscheiden.

Außerdem müssen das Manifest-Objekt im Eimer und das committete Manifest bytegleich sein, und unter dem Präfix dürfen keine fremden Objekte liegen.

**Ergebnis: OK.** 8/8 Teile und 11.616 Dateien sind identisch, kein schwacher Schlüssel.

### Alte Generation 1.2.0: bleibt, Löschentscheidung offen

Die Objekte unter `research-snapshots/quant-v13/archive-1.2.0/` (8 Teile und `manifest.json`) und alle Manifeste 1.x im Repository bleiben unverändert. Nichts wurde gelöscht, überschrieben oder ersetzt. Ob 1.2.0 gelöscht wird, entscheidet der Owner gesondert. Diese Anleitung schlägt die Löschung nur vor, sie führt sie nicht aus. Bis dahin belegen beide Generationen zusammen etwa 3,0 GB. Ein weiterer voller Archivstand passt nicht mehr unter die 8-GB-Schranke.

Leser des Archivs (`[v13-archive:restore|demos|catalog]`) lesen weiterhin 1.2.0, weil der Inhalt bytegleich ist. Sie werden in einem eigenen Schritt auf 2.0.0 umgestellt, spätestens vor einer Löschung von 1.2.0.

## Inhalt ([manifest-1.2.0.json](manifest-1.2.0.json), Inhalt identisch in 2.0.0)

**Version 1.2.0** (30.10.2026, abgelöst durch 2.0.0): wie 1.1.0, zusätzlich der Teil `v10-factor-panel` (privates V10-PIT-Faktorpanel `panel.jsonl.gz`, 124.354.592 B, Voraussetzung der Faktor-Demofälle des Backtest-Runners). Alle Teile sind neu verschlüsselt. 1.0.0 und 1.1.0 wurden nie hochgeladen; sie bleiben nur als Protokoll im Repo.

Version 1.1.0 ergänzt den Teil `v13c-study` (V13c-Läufe, 39 Dateien, 192.716.832 B). Alle Teile sind mit neuen Datenschlüsseln neu verschlüsselt. [manifest-1.0.0.json](manifest-1.0.0.json) bleibt nur als Protokoll der ersten lokalen Prüfung erhalten; es wurde nie hochgeladen und beschreibt keine vorhandenen Objekte.

| Teil | Inhalt | Dateien | Bytes (verschlüsselt) |
|---|---|---:|---:|
| `v13-raw` | entschlüsselte Tiingo-Abrufe der vier Läufe (Tagesdaten aller 4.278 Ticker, Zusammenfassungen, Chiffretext-Hashes) | 15 | 323.911.712 |
| `v13-derived` | qualifizierte Wochenreihen (Register 1.0.0), Large-Cap-SEC-Belege und Fakten, Zwischenregister | 2.587 | 146.370.592 |
| `v13-studies` | Ereignisdateien der Studien S1–S3 (F0/F1/F1c/F1w) | 50 | 238.766.112 |
| `v13b-hist` | SEC-Dokumente und Ergebnisse HIST (28 Sturzfälle, SPX-Endwerte), Reihen Register 1.1.0, Abrufprotokoll | 1.271 | 277.575.712 |
| `v13b-f1w` | Ereignisdateien F1d (Studie 2.0.0) | 19 | 67.153.952 |
| `v13c-study` | private Läufe der V13c-Studie 3.0.0 (F1'/F1w'/F1d', S3') | 39 | 192.716.832 |
| `v10-factor-panel` | privates V10-PIT-Faktorpanel (SEC-companyfacts-PIT) | 1 | 124.354.592 |
| `v12-listref` | V12-Listingreferenz (Referenzketten, Delisting-Register und -Gründe, HMAC-Schlüssel der chainIds, Tiingo-Tickerliste, EDGAR-Cache), Voraussetzung für `qualify.py` | 7.634 | 129.648.672 |

Nicht enthalten ist der private Transportschlüssel des Tiingo-Abrufs. Er wird nur für die abgelaufenen Abruf-Artefakte gebraucht.

## Verschlüsselung und Schlüsselverwaltung

- Jeder Teil hat einen eigenen zufälligen 256-Bit-Datenschlüssel, ab 2.0.0 als Hex-Zeile (`seal-part.sh`). Verschlüsselt wird mit `openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -pass file:`. Die Integrität sichern die SHA-256-Werte im committeten Manifest, nicht der Modus.
- Jeder Datenschlüssel ist mit RSA-4096-OAEP-SHA256 an den **Archivschlüssel** gebunden und steht so im Manifest (`wrappedKeyB64`).
  - Öffentlicher Teil: [archive-pub.pem](archive-pub.pem), SHA-256 der DER-Form `1b38092a…266b5d`.
- **Privater Archivschlüssel:** nie in Git. Er liegt in der Sitzung, in der das Archiv gebaut wurde, und muss vom Owner dauerhaft abgelegt werden:
  1. als Repository-Secret `V13_ARCHIVE_PRIVATE_KEY`, damit künftige Actions-Workflows wiederherstellen können;
  2. zusätzlich offline, z. B. im Passwortmanager.

  Ohne diesen Schlüssel ist das Archiv nicht lesbar.
- Integrität: Das Manifest im Repository bindet SHA-256 von Chiffre- und Klartext; jeder Teil enthält ein Inventar (`_inventory.tsv`) mit SHA-256 je Datei.

## Speicherort

- Bestehender privater R2-Eimer, Präfixe `research-snapshots/quant-v13/archive-2.0.0/` (gültig) und `…/archive-1.2.0/` (alt, bleibt bis zur Löschentscheidung), wie die Supertrader-Snapshots. Zugang nur über die Actions-Secrets `VU_HISTORY_S3_*`.
- Kosten: Das Archiv umfasst 1,50 GB. Die R2-Freigrenze liegt bei 10 GB, die Nullkostenschranke des Projekts bei 8 GB; `presign.mjs --mode put` prüft die Belegung vor dem Upload und bricht über der Schranke ab.
- Unveränderlich: Ist der Präfix belegt, wird nicht überschrieben. Eine neue Version bekommt einen neuen Präfix.

## Ablauf

1. **Bauen:** `scripts/quant/v13/archive/build-archive.sh <scratchpad> <out> archive-pub.pem manifest.json`, lokal und ohne Netz.
2. **Lokale Probe:** `restore-archive.sh manifest.json <out> archive-priv.pem <ziel>`. Sie prüft Chiffre-, Klartext- und Datei-Hashes.
   - Am 30.10.2026 mit Version 1.2.0 ausgeführt: alle 8 Teile und 11.616 Dateien identisch; das Faktorpanel ist bytegleich mit dem Original. (1.1.0 am 29.10.2026: 7 Teile, 11.615 Dateien.)
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
| Bau und lokale Wiederherstellung | ausgeführt (1.2.0): 8/8 Teile und 11.616 Dateien hash-identisch; Reihen laden hashgebunden |
| R2-Lesezugriff und Kapazität (Run 40943780307, `[v13-archive:usage]`) | Eimer 95.170 Objekte, 4.775.085.305 B; mit Archiv 1.2.0 (1,50 GB) 6,28 GB, unter der Schranke von 8 GB; Präfix leer |
| Upload | **nicht ausgeführt**: Die Sitzungsumgebung erreicht `*.r2.cloudflarestorage.com` nicht (Netzwerkrichtlinie). Nötig ist die Freigabe dieses Hosts in den Netzwerkeinstellungen der Umgebung; danach `[v13-archive:put]` → `transfer.sh put` → `[v13-archive:verify]` → `[v13-archive:get]` → `restore-archive.sh` |
| Ablage des privaten Archivschlüssels | Owner-Schritt (Secret `V13_ARCHIVE_PRIVATE_KEY` und offline) |

Bis zum Upload liegt das Archiv nur in der temporären Sitzung. Bei Verlust lässt es sich größtenteils neu erzeugen:
- Tiingo-Abruf über `claude/v13-delisted-fetch-4ho3rd`, 8.620 Anfragen;
- SEC-Dokumente über die Abrufskripte;
- Studien neu rechnen.

Die Register binden jede Reihe per SHA-256, sodass ein Neubau prüfbar ist.
