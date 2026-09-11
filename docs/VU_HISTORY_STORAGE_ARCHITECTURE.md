# VU Historienablage — dauerhafter Speicher fuer Kursreihen

**Stand:** 2026-09-11 · **Format:** `bar-codec-1.0.0` ·
**Ablage:** `history-store-1.0.0` · **Status:** implementiert und an einer
echten Stichprobe geprueft — **kein Backfill gestartet**

---

## 0. Warum es diese Schicht gibt

Der Befund, der sie ausgeloest hat, steht in zwei CI-Laeufen:

```
Lauf 34374652149  "Arbeitsablage sichern, solange sie handlich ist"  SKIPPED
Lauf 34486165298  "Arbeitsablage sichern, solange sie handlich ist"  SKIPPED
```

Der Cache-Schritt sichert nur unter 2.500 MB. Ein FULL_UNIVERSE-Bestand
ist **7.566 MB**. Er fiel nie hinein — in keinem Lauf.

Damit war **"nur die neuen Titel nachladen" nie moeglich**. Jeder Lauf
war ein Erstimport ueber alles. Ich hatte in
`backfill-estimate.json` `existingHistoriesReusable: true` geschrieben und
dabei `resumable.status: COMPLETE` gelesen, aber nicht geprueft, ob der
Cache ueberhaupt gespeichert wurde. Er wurde es nicht. Diese Schicht macht
die Zusage wahr.

---

## 1. Gewaehlter Speicheranbieter

**Cloudflare R2.** S3-kompatibel, 10 GB Speicher frei, 1 Mio.
Class-A-Operationen (Schreiben) und 10 Mio. Class-B (Lesen) je Monat
frei — und **keine Egress-Gebuehren**.

Egress ist das Kriterium, das die Entscheidung traegt. Ein Chart-Backend
liest Historien dauernd; bei jedem Anbieter mit Ausgangsverkehrskosten
waechst die Rechnung mit der Nutzung, also genau dann, wenn das Produkt
funktioniert.

| Anbieter | Frei | Egress | Urteil |
|---|---|---|---|
| **Cloudflare R2** | 10 GB, 1M/10M Ops | **0 $** | **gewaehlt** |
| Backblaze B2 | 10 GB | frei bis 3× Bestand/Tag | dokumentierter Rueckfall |
| Vercel Blob | ~1 GB (Hobby) | berechnet | 1,21 GB sprengt die Freigrenze sofort |
| AWS S3 | 5 GB, nur 12 Monate | 0,09 $/GB | Egress unvertretbar fuer ein Chart-Backend |
| Supabase / Neon | 0,5–1 GB | — | zu klein |

**Der Anbieter ist keine Einbahnstrasse.** Der Treiber spricht S3 mit
Signature V4; ein Wechsel zu B2, MinIO oder S3 ist eine Adresse und eine
Region, kein Umbau. Genau deshalb ist die Wahl vertretbar, bevor
Europa-Daten dazukommen.

**Was NICHT infrage kam:** Git (Lizenz + Groesse), GitHub-Actions-Cache
(10 GB Kontingent, 2.500-MB-Schranke, Verdraengung nach 7 Tagen),
CI-Artefakte (90 Tage sind kein "dauerhaft").

---

## 2. Speicherformat

**Positionszeilen in JSON, zstd-komprimiert.** Ein Objekt je Titel.

Die naheliegende Antwort war Parquet. Sie wurde **gemessen statt
geglaubt**, an fuenf echten Tiingo-Reihen mit 14.685 Kerzen:

| Variante | B/Kerze | 7.800 Titel |
|---|---:|---:|
| volles JSON (heute) | 363,7 | 10,79 GB |
| JSON ohne Konstanten | 266,1 | 7,90 GB |
| JSON + zstd | 45,2 | 1,34 GB |
| echte Spaltenablage + zstd | 44,0 | 1,30 GB |
| Spalten + Byte-Shuffle + zstd | 48,6 | 1,44 GB |
| **Positionszeilen + zstd** | **40,7** | **1,21 GB** |

Zwei Ergebnisse, die man nicht raten kann:

* Der **Byte-Shuffle schadet** (48,6 statt 44,0). Er hilft bei
  Messreihen; Kursmantissen sind hochentrop, und das Umsortieren
  zerreisst die Wiederholungen, die zstd sonst findet.
* Eine **echte Spaltenablage bringt keine 8 Prozent** gegenueber
  Positionszeilen. Parquet dafuer haette eine Abhaengigkeit gekostet —
  dieses Repository hat keine, und ein Parquet-Leser im Browser ist
  teurer als der ganze Gewinn. **Node 22 bringt zstd mit.**

**Verlustfrei, und zwar zeichengleich.** `decode(encode(x))` ergibt
dieselbe Kerze in derselben Feldfolge; geprueft an allen fuenf echten
Reihen (HS01). Ein Feld, das Tiingo morgen ergaenzt, ueberlebt (HS03).
Kodierung wird an den Magic Bytes erkannt, nicht angenommen; `gzip` steht
als Rueckfallebene bereit (HS02).

---

## 3. Geschaetzte Groesse fuer 7.800 Titel

**1,21 GB komprimiert** (unkomprimiert 10,79 GB) — Faktor **8,9**.

Grundlage: 40,7 B/Kerze gemessen × 7.800 Titel × 4.085 Kerzen. Die 4.085
sind nicht geschaetzt, sondern aus `gate-FULL_UNIVERSE.json` gelesen:
23.218.412 Kerzen ueber 5.684 Titel.

Ausbau auf US + Europa + Deutschland + ETFs (grob 4–6×): **5–7 GB** —
weiterhin innerhalb der Freigrenze.

---

## 4. Geschaetzte laufende Kosten

**0,00 $/Monat** beim heutigen Stand.

| Posten | Menge | R2-Freigrenze | Kosten |
|---|---:|---:|---:|
| Speicher | 1,21 GB | 10 GB | 0 $ |
| Schreiben (Class A) | ~7.800 Erstlauf + ~7.800/Tag | 1 Mio./Monat | 0 $ |
| Lesen (Class B) | Chart-Backend + Faktorlaeufe | 10 Mio./Monat | 0 $ |
| Egress | beliebig | — | **0 $** |

Ueber der Freigrenze: 0,015 $/GB-Monat. Selbst 50 GB (voller
Mehrmarktausbau) waeren rund **0,60 $/Monat**.

---

## 5. Objektstruktur je Titel

```
v1/tiingo/daily/US/AAPL.json.zst        # eine Reihe, ein Objekt
v1/tiingo/daily/US/BRK-B.json.zst
v1/tiingo/daily/US/BAC~2DP~2DE.json.zst # Sonderzeichen als ~HEX
v1/tiingo/daily/US/_index.json.zst      # was liegt da, bis wann
```

`v1` ist die Layoutversion, `tiingo` der Anbieter, `daily` die
Aufloesung, `US` der Markt. Europa wird `.../daily/DE/`, Minutendaten
werden `.../minute/US/` — der Ausbau braucht kein neues Schema.

**Schluessel sind umkehrbar und kollisionsfrei.** `BRK-B` und `BRK.B`
duerfen nie dieselbe Datei werden, sonst ist eine der beiden Historien
still weg (HS10).

Jedes Objekt traegt seine Eckdaten als `x-amz-meta-*`: `ticker`, `bars`,
`first`, `last`, `format`, `sha256`. Dadurch beantwortet ein HEAD die
Frage "bis wann habe ich das?", ohne das Objekt zu entpacken.

---

## 6. Schreibweg

```
Gate-Lauf  ->  .market-cache/tiingo/daily/<securityId>.json
           ->  sync-history-store.mjs --push
           ->  encode(zstd)  ->  PUT v1/tiingo/daily/US/<TICKER>.json.zst
           ->  Index aktualisieren
```

`--push` benutzt `appendSeries`, nicht `putSeries`: ein zweiter Lauf
**ergaenzt** eine vorhandene Reihe, statt sie zu ersetzen. Liegt nichts
da, ist das Ergebnis dasselbe wie ein Schreiben.

Zugangsdaten kommen ausschliesslich aus der Umgebung
(`VU_HISTORY_S3_*`), nie aus einer Datei im Repository. Der Treiber gibt
sie auch im Fehlerfall nicht aus (HS32).

---

## 7. Leseweg

```
GET v1/tiingo/daily/US/<TICKER>.json.zst  ->  decode  ->  bars[]
```

Zwei Verbraucher, ein Weg:

* **Faktor- und Technical-Engines** — `sync-history-store.mjs --pull`
  fuellt `.market-cache` vor dem Lauf (siehe 10).
* **VU2-Chart-Backend** — `store.getSeries(ticker)` serverseitig
  (siehe 11).

Ein fehlendes Objekt ist `null` und kein Fehler: es ist der Grund, warum
der Gate-Lauf den Titel danach holt.

---

## 8. Taegliche Fortschreibung

Kein Neuabruf. Fuer jeden Titel:

1. `last` aus dem Index lesen (ein GET fuer das ganze Universum)
2. Tiingo ab `last` abfragen — **einschliesslich** dieses Tages
3. `mergeBars` zusammenfuehren
4. Objekt neu schreiben (~160 KB), Index fortschreiben

**Warum die Ueberlappung.** Eine Kapitalmassnahme aendert alte
`adjustedClose`-Werte **rueckwirkend**. Deshalb gilt: bei gleichem Datum
gewinnt die **neue** Kerze (HS04, `RETROACTIVE_ADJUSTMENT_WINS`). Wer die
alte behielte, fuehrte eine Reihe, die nach einem Split still falsch ist.

Kosten je Tag: ~7.800 Anfragen an Tiingo, ~7.800 PUT — rund 0,8 % des
Schreibkontingents.

---

## 9. Fortsetzbarkeit und Wiederherstellung

Drei Ebenen, absteigend im Vertrauen:

1. **Index** (`_index.json.zst`) — ein GET sagt, was da ist. Der
   Normalfall.
2. **LIST + HEAD** — geht der Index verloren oder ist er aelter als der
   Bestand, sagt der Speicher es selbst. Fuer 7.800 Titel: 8 LIST-Seiten
   und 7.800 HEAD, beides Class B, beides frei.
3. **Die Objekte** — sind die Wahrheit. Der Index ist Bequemlichkeit.

`planBackfill()` vergleicht Universum gegen Speicher und teilt in
**full** (fehlt), **incremental** (veraltet), **current** (aktuell) und
**extra** (im Speicher, nicht mehr im Universum). Ein abgebrochener Lauf
setzt fort, indem er den Plan neu rechnet — er braucht keinen
Checkpoint, der den Runner ueberleben muesste.

**`extra` wird nicht geloescht.** Ein Titel, der aus dem Universum
faellt, kostet Platz und sonst nichts — und ist noch da, wenn er
zurueckkommt (HS24).

> **Ein Fehler, den der Test gefunden hat:** der erste Entwurf las die
> Metadaten aus dem LIST-Ergebnis. Gegen das Dateisystem ging das gut.
> Gegen einen echten S3-Dienst waere ein Index aus lauter `null`
> entstanden — **ListObjectsV2 gibt `x-amz-meta-*` nicht heraus.** Genau
> dafuer laeuft dieselbe Ablage im Test gegen beide Treiber.

---

## 10. Weg zu Faktoren und Technical

**Ohne Aenderung an einer einzigen Engine.**

`market-store.js`, `build-market-factors.mjs`, `run-scale-gate.mjs` und
die Technical-Engines lesen alle aus
`.market-cache/<provider>/daily/<securityId>.json`. Diese Schnittstelle
ist erprobt und wird auch von Arbeiten benutzt, die gerade laufen und die
dieser Strang nicht anfassen darf.

Also bleibt sie. `sync-history-store.mjs --pull` stellt das Verzeichnis
vor dem Lauf aus der Ablage her; `--push` traegt es danach zurueck. Kein
Faktor-, Qualitaets- oder Technical-Skript aendert sich um eine Zeile.

---

## 11. Weg zum VU2-Chart

Der Browser spricht **nie** direkt mit dem Objektspeicher.

```
Browser  ->  VU2-Backend (Vercel Function)
                 |-- Berechtigung pruefen
                 |-- store.getSeries(ticker)     [serverseitig, R2]
                 |-- Anzeigepolitik anwenden
                 `-> JSON an den Browser
```

Das ist keine Umstaendlichkeit, sondern die Lizenzschranke: rohe
Anbieterkurse duerfen nicht oeffentlich ausgeliefert werden. Ein
privater Eimer mit serverseitigem Schluessel erzwingt, was eine
oeffentliche URL nur zusagen koennte. Dass zstd im Browser noch nicht
ueberall verfuegbar ist, ist hier kein Nachteil — der Weg ueber das
Backend ist ohnehin der einzige erlaubte.

**Noch nicht gebaut:** die VU2-Seite gehoert in den Produktstrang und
wird hier nicht angefasst.

---

## 12. Lizenz und Sicherheit

* Rohe Kurse gehen **nicht** ins Repository — der Eimer ist privat.
* Zugangsdaten kommen aus der Umgebung, gehoeren in GitHub-Secrets und
  erscheinen in keinem Bericht und keinem Log.
* Ausgeliefert werden nur **Anzahlen und Byte-Groessen**
  (`quant/data/market/history/*.json`). Die Hygienepruefung deckt den
  Pfad jetzt mit ab — geprueft wird das Artefakt, nicht die Absicht.
* Die AWS-Testvektoren im Test sind **veroeffentlichte
  Dokumentationswerte**, keine Zugangsdaten. Sie stehen zusammengesetzt
  da, damit die Geheimnispruefung scharf bleiben kann.

---

## 12a. Die Nullkostenschranke

Waehrend der Entwicklung darf die Ablage **nichts** kosten. Das ist eine
Betriebsregel, keine Sparsamkeit: eine Rechnung, die durch einen
automatischen Lauf entsteht, hat niemand entschieden.

### Gegen was geplant wird

| | Freigrenze | **Sicherheitsgrenze** | Abstand |
|---|---:|---:|---:|
| Speicher | 10 GB | **8,0 GB** | 20 % |
| Class A (Schreiben, LIST) | 1.000.000 | **750.000** | 25 % |
| Class B (Lesen, HEAD) | 10.000.000 | **7.500.000** | 25 % |

Der Abstand faengt ab, was eine Schaetzung nicht wissen kann: ein
zweiter Lauf am selben Tag, ein Wiederherstellungslauf, eine Reihe, die
laenger ist als der Durchschnitt.

**LIST zaehlt als Class A**, obwohl es nichts schreibt. Wer es als
Lesevorgang einplant, verschaetzt sich beim Wiederaufbau genau an der
Stelle, die weh tut.

### Die Rechnung laeuft VORHER

`scripts/market/preflight-zero-cost.mjs` laeuft vor **jedem** Backfill,
Massenupload, Tagesabgleich, Wiederherstellungs- und Reindex-Lauf. Ein
Lauf, der bei Objekt 6.000 merkt, dass er die Freigrenze reisst, hat sie
schon gerissen.

Ausgegeben werden die Kennzahlen, die der Eigentuemer verlangt hat:
`CURRENT_STORAGE_BYTES`, `PROJECTED_STORAGE_BYTES`, `ESTIMATED_CLASS_A`,
`ESTIMATED_CLASS_B`, `PROJECTED_FREE_TIER_USAGE_PERCENT`.

Bei Ueberschreitung: **`ZERO_COST_GUARD_BLOCKED`**, Austrittscode 3,
kein Byte geschrieben, keine automatische Fortsetzung — mit Angabe,
welche Grenze, durch welche Operation, und `OWNER DECISION REQUIRED`.

### Die Schranke ist hart, nicht beratend

Drei Ebenen, damit sie sich nicht vergessen laesst:

1. **Ablage ohne Budget schreibt nicht.** `createHistoryStore` wirft,
   wenn gegen einen kostenpflichtigen Dienst ohne Budget geschrieben
   werden soll. Gegen ein Verzeichnis darf es fehlen — dort kostet
   nichts.
2. **Das Budget wird gelesen, nicht gerechnet.** `sync-history-store.mjs`
   liest `preflight.json`; fehlt es, gilt es nicht der laufenden
   Operation oder hat es nicht freigegeben, bricht der Lauf mit Code 3
   ab. Ein Skript, das sich sein eigenes Budget ausstellt, ist keine
   Schranke.
3. **Das Budget wirft im Lauf.** Ein Schaetzfehler fuehrt zum Abbruch,
   nicht zum Weiterschreiben.

### Keine unnoetigen Schreibvorgaenge

Der teuerste Fehler waere ein taeglicher Lauf, der jedes Objekt neu
schreibt, obwohl sich nichts geaendert hat. Zwei Sperren:

* **Kein neuer Tag → kein Schreibvorgang.** `mergeBars` unterscheidet
  `identical` von `replaced`: gleicher Tag UND gleicher Inhalt ist keine
  Ersetzung. Ohne diese Unterscheidung schreibt der Tagesabgleich alle
  7.800 Objekte neu, weil er mit einem Tag Ueberlappung holt.
* **Gleicher Inhalt → kein Schreibvorgang.** Vor jedem `PUT` wird der
  SHA-256 des fertigen Objekts gegen den gespeicherten gehalten. Die
  Kompression ist deterministisch, also heisst gleicher Hash:
  identisches Objekt.

Gemessen an drei echten Reihen ueber drei Laeufe:

```
Lauf 1   Class A 5   geschrieben 3
Lauf 2   Class A 1   geschrieben 0   (nur der Nutzungsstand)
Lauf 3   Class A 1   geschrieben 0
```

### Nutzungsstand je Monat

`v1/_usage/tiingo-US-YYYY-MM.json` liegt **im Eimer**, nicht im Runner:
ein Stand, der bei jedem Lauf wieder bei null anfaengt, meldet nie eine
Ueberschreitung — er meldet jeden Lauf als den ersten des Monats. Ein
Stand aus einem anderen Monat wird nicht uebernommen.

Operationen summieren sich, **Speicher ist ein Stand** und wird gesetzt.
Wer ihn addiert, meldet nach zehn Laeufen das Zehnfache dessen, was im
Eimer liegt.

Der Nutzungsstand wird **auch nach einem Lauf ohne Aenderung**
fortgeschrieben: seine Lesevorgaenge haben stattgefunden und zaehlen.

### Was der Treiber nicht kann

Gesperrt auf Ebene der Anfrage, nicht der Absicht: Speicherklassen
(`x-amz-storage-class`), Aufbewahrungsregeln (`?lifecycle`),
Versionierung, Replikation, Inventar/Analytics/Metriken, Object Lock,
KMS-Verschluesselung, R2 Data Catalog und `DELETE`. Erlaubt sind
ausschliesslich `GET`, `PUT`, `HEAD` und die sechs LIST-Parameter.

Wer eines davon braucht, aendert die Liste — und **trifft damit eine
Entscheidung, statt eine zu umgehen**.

### Trockenlauf

`--dry-run` rechnet vollstaendig und schreibt nichts: Groessen und
Operationen werden ermittelt, kein Objekt entsteht, kein Schreibbudget
wird verbraucht.

### Die Pflichtrechnung fuer den 7.800er-Backfill

`preflight-backfill-7800.json`, erzeugt mit
`--operation BACKFILL --symbols 7800`:

| Kennzahl | Wert | Grenze | Auslastung |
|---|---:|---:|---:|
| `CURRENT_STORAGE_BYTES` | 0 | — | — |
| `PROJECTED_STORAGE_BYTES` | 1.296.824.100 (1,30 GB) | 8,0 GB | 16,2 % |
| `ESTIMATED_CLASS_A` | 7.886 | 750.000 | 1,1 % |
| `ESTIMATED_CLASS_B` | 15.600 | 7.500.000 | 0,2 % |
| `PROJECTED_FREE_TIER_USAGE_PERCENT` | **12,97 %** | 100 % | — |

**`ZERO_COST_GUARD_PASSED`.** Der Backfill bleibt unter allen
Sicherheitsgrenzen.

Dauerbetrieb gegengerechnet (ZC51): 30 Tage Tagesabgleich ueber 7.800
Titel bleiben ebenfalls darunter. Und ZC52 zeigt, dass die Schranke beim
Ausbau auf ~60.000 Titel **im Monat ausloest** — sie meldet den Ausbau,
bevor ihn jemand startet. Das ist ihr Zweck.

## 13. Ablauf des spaeteren 7.800er-Backfills

**Er ist nicht gestartet und braucht die Freigabe des Eigentuemers.**

Voraussetzung: R2-Eimer angelegt und fuenf Secrets hinterlegt
(`VU_HISTORY_S3_ENDPOINT`, `_BUCKET`, `_REGION`, `_ACCESS_KEY_ID`,
`_SECRET_ACCESS_KEY`).

```
 1  Wertpapierstamm bauen            (~6 s, 0 Kurs-Anfragen)
 2  Universum anhaengend erweitern   5.684 + 2.116 = 7.800
 3  VORABRECHNUNG                    preflight-zero-cost --operation BACKFILL
                                     BLOCKED -> Abbruch, Eigentuemer entscheidet
 4  --pull aus der Ablage            beim ERSTEN Lauf leer
 5  Plan rechnen                     full / incremental / current
 6  Gate laufen lassen               holt NUR, was der Plan nennt
 7  --push in die Ablage             mit dem Budget aus Schritt 3
 8  Nutzungsstand fortschreiben      im Eimer, nicht im Runner
 9  Faktoren + Technical             aus .market-cache wie bisher
10  Die sieben Aggregate neu bauen
11  Qualitaet, Hygiene, Regression
12  Berichte committen
```

Schritt 3 ist keine Formsache: ohne freigegebene Vorabrechnung bricht
Schritt 7 mit Code 3 ab, bevor ein Byte hinausgeht.

**Erster Lauf:** ~7.803 Anfragen, ~78 min Abruf, ~5,9 GB Download,
~10,9 GB Platte im Runner (von ~14 GB frei — knapp, aber gemessen
machbar: der 5.684er-Lauf brauchte 7,4 GB).

**Jeder weitere Lauf:** nur noch die Luecke. Bei taeglicher
Fortschreibung ~7.800 kleine Anfragen statt einer Stunde Vollabruf —
**das ist der Gewinn dieser Schicht**.

---

## Geprueft

`node scripts/market/verify-history-store.mjs` — acht Pruefungen an
fuenf **echten** Tiingo-Reihen (14.685 Kerzen), alle bestanden:

```
WRITE_READ_BYTE_EXACT        5 echte Reihen, 14.685 Kerzen
INDEX_ROUNDTRIP              5 Titel im Index
INDEX_REBUILD_FROM_STORAGE   5 Titel aus LIST+HEAD wiederhergestellt
INCREMENTAL_APPEND           +1 Kerze statt 2.937 neu zu holen
RETROACTIVE_ADJUSTMENT_WINS  geaenderte alte Kerze ersetzt die alte
NO_DUPLICATE_DATES           2.938 Kerzen, 2.938 verschiedene Tage
BACKFILL_PLAN                neu 1, nachzuladen 4, aktuell 1
SIZE_WITHIN_FREE_TIER        1,21 GB fuer 7.800 Titel
```

Dazu 17 Tests in `quant/tests/history-store.test.mjs`, darunter
**Signature V4 gegen die veroeffentlichten AWS-Testvektoren** (GET, PUT
mit Metadaten, LIST mit Abfrageparametern) und dieselbe Ablage gegen
einen echten HTTP-Dienst. 752 Tests im Repository, alle gruen.

**Was noch NICHT geprueft ist:** ein echter R2-Eimer. Dafuer fehlen die
Zugangsdaten, und `apimedia`/`r2`-Adressen sind aus der Arbeitsumgebung
gesperrt. Der Nachweis gegen den echten Dienst laeuft mit
`node scripts/market/verify-history-store.mjs --s3`, sobald die Secrets
hinterlegt sind — er schreibt dabei unter `verify/v1` und nicht in die
Produktionsdaten.
