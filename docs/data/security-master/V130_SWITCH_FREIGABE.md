# Security Master 1.1.0 → 1.3.0: Vorlage zur produktiven Freigabe (Stand 01.11.2026)

**Noch nicht freigegeben.** Dieses Dokument ist die konkrete Vorlage für die Owner-Freigabe. #1119 bleibt zurückgestellt.

## 1. Nachweise (alle auf `main` @ `3af80445a4`)

| Prüfung | Ergebnis |
|---|---|
| Probelauf | 41285528656 (`commit=false`). Folgestand `us-security-master-1.3.0`, 8.055 Zeilen, sha256 **`4d9a0e039c4e9431…`** |
| Freigabeliste | `v130-approved-changes-1.1.0.json` sha256 `0a72def6…`, auf `main` seit #1222. Gate PASS. Nicht freigabefähig: canonical_id 24/25, Deaktivierungen 16/50, Eignung 16/50, Namen 1/200 (XRPN) |
| EDVA | ACTIVE und eignungsfähig auf `tiingo:AMEX:EDVA:2026-08-21`, Name Endovia Health Sciences (SEC, CIK 0001553788) |
| 13 Ticker-Wiederverwendungen | in allen Produktwelten ohne alte Identität (#1206/#1207, #1212–#1214, #1225, #1229) |
| **Simulation** (`main` + die sechs Stammdateien des Probelaufs) | volle Suiten: Quant **dieselben 7 Fehler wie `main`**; Core 308/0; Technical 61/0; Python OK; Testisolation sauber |
| Freeze-Parität | V8, V10, V12, V13, SMF, MCH und Demo-Bindung bestehen im Folgestand. Evidenz-Loader lesen 1.1.0 (`26c82617`), Produkt-Loader lesen `LIVE` (`4d9a0e03`) |
| **Discover-Neubau** im Folgestand (`build-discover-data` + `verify-discover-data`) | Neubau ohne Abweichung. NM3 und Erzeugerbesitz 485 nach dem Neubau grün. Discover-Suite: einziger Fehler NL5, auch auf `main` (#1239) |
| Katalog und Vorschau im Folgestand | Katalog-Generation 1 ohne Verstoß, `export-backtest-review-bundle --check` OK, Abnahmeprotokoll 61/61 |

**Die 7 verbleibenden Quant-Fehler** sind veraltete Test-Fixtures, auf `main` genauso. #1219 (Supertrader-Chat) bzw. #1224 behebt sie. Sie hängen nicht am Stamm.

## 1a. Probelauf vom 02.11.2026: Der Folgestand ändert sich täglich

Lauf **41400342624** (`commit=false`, gleiche Eingaben):
- **Folgestand** sha256 `f10b1c25f2c1ac9d…`, nicht `4d9a0e03…` vom Vortag. Die Ursachen:
  - Der Stamm trägt das Laufdatum (`generatedAt`).
  - Neue Alterungen nach der 30-Tage-Schwelle: Deaktivierungen nicht freigabefähig 16 → **20**, Eignungswechsel 16 → **17**, Namen gezählt 1 → **5**, davon 3 Listeneinträge ungenutzt.
- **Gate:** weiter PASS bei unveränderten Grenzen (canonical_id 24/25).

**Folge:** Eine im Voraus fixierte Hash-Bedingung lässt sich nicht über Tage halten. Freigabeliste, Probelauf, Regression und `commit=true` gehören auf **denselben Tag** (Arbeitspaket H1 in `docs/quant/QUANT_FINAL_HANDOVER.md`). Die Freigabe des Owners nennt deshalb den Lauftag. Die Bedingung lautet: Der Folgestand des produktiven Laufs ist bytegleich mit dem Folgestand des Probelaufs desselben Tages, und die neu erzeugte Liste lässt im Gate keinen Eintrag ungenutzt.

## 2. Freigabe (vom Owner zu erteilen)

> „Ich gebe den produktiven Lauf `security-master-weekly.yml` mit `commit=true`, `allow_version_change=true` und `approved_changes=true` am <Datum> frei. Bedingungen: Am selben Tag werden Probelauf, Neuerzeugung der Freigabeliste, Gate PASS bei unveränderten Grenzen ohne ungenutzten Eintrag und volle Suiten auf dem Folgestand ausgeführt; der produktive Folgestand ist bytegleich mit dem des Probelaufs.“

## 3. Ablauf am Lauftag

1. Probelauf (`commit=false`, gleiche Eingaben). **Stopp**, wenn
   - der Folgestand nicht bytegleich `4d9a0e03…` ist, oder
   - das Gate mit der Liste nicht PASS ohne ungenutzten Eintrag ergibt.

   Dann die Liste am selben Tag neu erzeugen (`build-security-master-approval-list.mjs`) und neu vorlegen. Jeder Tag kann neue Alterungen bringen.
2. **Produktiver Lauf** (`commit=true`, gleiche Eingaben).
3. **Sofort danach** den Marktdaten-Lauf (`market-data-refresh.yml`, manuell) starten. Er baut Discover neu (NM3, Erzeugerbesitz 485).
4. **Generation 1.3.0 eintragen** (eigener PR):
   - Eintrag `us-security-master-1.3.0` in `quant/config/security-master-generations.json` mit sha256, Größe und Git-Blob des Commits;
   - Kopie mit `pin-security-master-generation.cjs --generation us-security-master-1.3.0 --commit <Commit>`.
   - Die Generation 1.1.0 bleibt unverändert und für V8–V13 maßgeblich.
5. **Nachprüfung:** volle Suiten auf `main`; Live-Prüfung Discover und Suche für EDVA und die 13.
6. **Optional, neue Research-Generation:**
   - Katalog-Generation 2 in **neuem** Verzeichnis gegen 1.3.0 (Archiv-Marke `[v13-archive:catalog]` mit eigenem Ausgabepfad); der Builder verweigert das Überschreiben von Generation 1;
   - danach ein Bundle für Generation 2.
   - Bis dahin zeigt die Vorschau Generation 1 (1.1.0). Das ist ausdrücklich gekennzeichnet und bleibt gültig.
7. Danach kann über #1119 entschieden werden.

## 4. Rücknahme

Wie bei #1204: Revert des Übernahme-Commits. Die 1.1.0-Bytes stehen in Git und als eingefrorene Kopie (`26c82617…`). Die Evidenz-Loader sind davon nicht betroffen.
