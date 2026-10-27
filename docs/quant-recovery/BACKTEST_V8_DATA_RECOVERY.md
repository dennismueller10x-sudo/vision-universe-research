# V8 – Datenerschließung und belegte Korrekturen

V8 hat den in V7 fehlenden **Inhaltszugriff auf bestehende private Actions-Archive tatsächlich hergestellt**. Dafür wurden die vorhandenen Main-Caches für Discover, Tiingo und SEC ausschließlich wiederhergestellt; der vorhandene Tiingo-Schlüssel öffnete den authentifizierten Cache im ursprünglichen `main`-Kontext. Keine Provider-Neuabrufe, Cache-Neuschreibungen oder Produktionsschreibvorgänge waren dafür erforderlich. Lokales Fehlen von Secrets ist deshalb ausdrücklich **kein** Beleg für fehlende historische Daten oder fehlende bestehende Berechtigungen.

Das private maschinenlesbare Inventar liegt unter `/workspace/v8-private/archive-inventory.json`, die vollständige aktuelle Listingqualifikation unter `/workspace/v8-private/inventory/weekly-qualification.json`. Die Sitzung ist keine zugesagte dauerhafte Rohdatenablage. Reproduzierbare zugelassene Quellen bleiben die bestehenden Caches und Original-SEC-URLs; nur abgeleitete Inventar-/Validierungsberichte gehören in Git. [Inventarübersicht](v8/archive-inventory-summary.json), [Zugriffsprovenienz](v8/archive-restore-provenance.json).

## Tatsächlicher Archivzugriff

Der erste kontrollierte Lauf [40345969062](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40345969062) stellte alle drei Caches wieder her und entschlüsselte Tiingo erfolgreich. Anschließend scheiterte der damalige Inventarscan an seinem zu kleinen Gesamtbytebudget; dieser Versuch ist keine bestandene Inventarprüfung.

Der erste abgeschlossene Scan [40347386211](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40347386211) ist unter [archive-assessment-initial.json.gz](v8/archive-assessment-initial.json.gz) unverändert gesichert. Er erschloss 20.228 Dateien mit 11.771.237.597 Bytes. 20.091 JSON-/Gzip-Dateien wurden gelesen; 76 JSON-Dateien oberhalb der 64-MiB-Einzelgrenze blieben ausgeschlossen, 33 undurchsichtige Binärarchive wurden nicht als JSON ausgegeben und 28 SEC-Antworten waren kein JSON. Die Metadatenerfassung war vollständig, die Inhaltsqualifikation ausdrücklich `PARTIAL`.

Der Scan umfasst 12.492 Tagesreihen-/Cachevintages zu 7.198 verschiedenen Tickersymbolen, nicht ebenso viele identifizierte historische Wertpapiere. 7.614 Reihen-/Vintageprüfungen beziehungsweise 4.792 verschiedene Tickersymbole bestanden die bestehende Corporate-Action-Faktorkohärenzprüfung. Der beobachtete Quelldatumsbereich reicht vom 03.05.1973 bis 23.10.2026. Diese Spanne gilt über den Bestand, nicht für jedes Listing. Aktuelle Symbolidentität, historische US-Stammaktienzugehörigkeit, Repräsentativität und vollständige Delistings sind damit nicht bewiesen.

Der erste abgeschlossene Erkenner zählte originale `companyfacts.facts`-Strukturen. Die 5.481 vorhandenen normalisierten SEC-Factbooks haben jedoch die bestehende `factbook.timelines[].observations[]`-Struktur. Ihre Dateien waren bereits gelesen; eine Null im damaligen Feld `secFacts` bezeichnet daher **keine fehlenden SEC-Fakten**. Die anschließende schemaangepasste Qualifikation erfasst diese vorhandenen Felder ausdrücklich getrennt: Verfügbarkeit mit/ohne Uhrzeit, fehlende Zeiten, Periodenchronologie, Accessionprovenienz, gespeicherte Restatements und Filingindex. Der nachfolgende Ergebnisbericht bindet diesen separaten Scan an seinen eigenen Code und seine eigene Runtime.

## Konkrete Identitätskorrekturen

Zwei bisher tatsächlich zugelassene Common-Stock-Research-Inputs wurden anhand von SEC-Originalquellen korrigiert. Die Korrektur ist ein belegter Konflikt-Hold für die exakt benannte Listingidentität; sie erfindet keine vollständige historische Preferred-Klassifikation.

| Listing | Alte Zulassung | Originalbeleg | Korrigiertes Research-Verhalten |
|---|---|---|---|
| `ref_FRMEP`, `tiingo:NASDAQ:FRMEP:2022-04-01` | `EQUITY_COMMON`, 239 Wochenbars vom Adapter zugelassen | FRME 10-K, Accession `0000712534-26-000022`, eingereicht 25.02.2026; Cover nennt eine Depositary-Beteiligung an Series-A-Preferred-Aktien | `ORIGINAL_SOURCE_CLASSIFICATION_CONFLICT`, kein Performance-Payload |
| `ref_MBINM`, `tiingo:NASDAQ:MBINM:2022-09-23` | `EQUITY_COMMON`, 214 Wochenbars vom Adapter zugelassen | MBIN 10-K, Accession `0001104659-26-021549`, eingereicht 27.02.2026; Cover nennt eine Depositary-Beteiligung an Series-D-Preferred-Aktien | gleicher exakt belegter Konflikt-Hold |

[Quellen, Prefix-Hashes, Gültigkeit und Wirkungen](v8/identity-source-validation.json) und die versionierte Datentabelle `quant/engines/research-classification-evidence.cjs` binden jede Entscheidung an Listing, Accession und Originalquelle. Die Hashes beziehen sich ausdrücklich auf gelesene 2-MiB-Prefixe, nicht auf vollständige Filings. Frühere Gattungs-/Tickerintervalle bleiben ungeklärt. Keine Ticker-Suffixheuristik und keine Vermischung verschiedener Securities.

Die bestehende private Generationenbildung bindet diese Identitätsevidenz als Abhängigkeit. Ein älteres Ergebnis ohne diese Bindung oder mit veränderter Evidenz wird über die vorhandene Identitätsinvalidierung zurückgehalten. Die Leserkomposition prüft die Evidenzbytes zusätzlich nach asynchronem Lesen erneut. Regressionen prüfen beide realen Ablehnungen, abweichende kanonische IDs, Quellenbindung, blockierte Materialisierung ohne Finanzdaten, alte bereits berechnete FRMEP-Ergebnisse und eine Evidenzänderung während des Lesens. Andere Produktmaster und aktive Zertifizierungsverträge wurden nicht umgeschrieben.

**Zähler:** zwei korrigierte Research-Zulassungen; **null vollständig rekonstruierte historische Listingidentitäten**. [Aktuelle Gesamtqualifikation](v8/weekly-qualification.json): 6.190 Kandidaten, 4.449 eingeschränkt qualifizierte Wochenreihen, 1.741 ausgeschlossene Reihen. Der Rückgang von 4.451 auf 4.449 beseitigt zwei falsche Zulassungen.

## Corporate Actions, Lücken und Terminalwerte

Die wiedergewonnenen Tagesarchive wurden mit dem bestehenden Return-/Corporate-Action-Code untersucht. Nur bei unveränderten Wochenkursen und vollständiger belegter Tages-/Wochenparität durfte neue Action-Evidenz dem vorhandenen Adapter vorgelegt werden. 102 unterschiedliche bereits gehaltene Listings erreichten diese Nachprüfungsstufe; **alle 102 blieben `CORPORATE_ACTION_UNRESOLVED`**. Es gibt daraus null zusätzliche qualifizierte Listings, null gelöste vollständige Corporate-Action-Fälle und null neue finanzierte Ledgerstudien. Der Befund wird nicht durch einen lockeren Status ersetzt.

Die verbleibenden 600 Corporate-Action-Holds, 218 Wochenlücken, 180 mehrdeutigen Identitäten und vier inaktiven Listings ohne belegten Terminalwert bleiben erhalten. Kein Null-/Last-Price-Terminalwert, keine Lückeninterpolation und keine unbelegte Kursänderung. Der neue Diagnosepfad kann tatsächlich neu qualifizierte Fälle begrenzt mit der vorhandenen Weekly-Engine, exakter Wiederholung, privater immutable Generation und unabhängiger Python-Rechnung weiterführen; die vorliegende Archivprüfung erzeugte dafür keine zulässigen neuen Fälle.

## Neue SEC-Originalnachweise

Die deterministische früheste/mittlere/späteste Accessionprobe von JPM, MSFT, NVDA und XOM lieferte **12/12 originale Accession-/Acceptance-Paritäten**. Der Prefix-Plan begrenzt einen Netzlauf auf zwölf Requests und 786.432 gelesene Bytes; die dokumentierte Offlinewiederholung benötigte null Requests. [Ergebnis](v8/sec-acceptance-validation.json). Die acht V7-XBRL-Originale und ihre 23 Faktenparitäten werden nicht als neue V8-Faktenbelege doppelt gezählt.

Geprüft wurden SEC-Acceptance und gespeichertes `available_from`, einschließlich Zeitzonenumrechnung. Das belegt keine frühere Unternehmensveröffentlichung oder Earnings-Uhrzeit. Die nachfolgenden Realstudien verwenden diese Originalereignisse mit ihren jeweils ausgewiesenen Tages-/Wochenmodellgrenzen; siehe [Realstudien](BACKTEST_V8_REAL_STUDIES.md). Vorhandene normalisierte Faktentimelines sind ein anderer Belegtyp als ursprüngliche Original-XBRL-Vintages; spätere Restatements werden nicht rückdatiert.

## Verbleibende Zugänge und Datenabhängigkeiten

| Bestand | Nachgewiesener Zustand | Verbleibende Grenze |
|---|---|---|
| Discover-/Tiingo-/SEC-Actions-Caches | Metadaten und tatsächlicher Inhalt erreichbar; vorhandene Tiingo-Entschlüsselung erfolgreich | Cache-Retention ist keine dauerhafte Archivzusage; Inhaltsgrenzen ausdrücklich im Scan |
| Dauerhafte R2-/S3-Objekte | bestehender Zugangsmechanismus im Repository, lokale `VU_HISTORY_S3_*`-Bindungen nicht vorhanden | Objektbestand und tatsächliche R2-Berechtigung in dieser Sitzung nicht geprüft; nicht als fehlende Datenquelle klassifiziert |
| Private V7-Generationen `/workspace/v7-private` | in dieser neuen Laufzeit nicht vorhanden | kein Nachweis, dass dauerhafte Originalbestände anderswo fehlen |
| Original-Membershiparchive | 22 vorhandene Dateien, benannte Daten 15.09.–24.10.2026 | keine vollständige frühere Marktpopulation |
| Original-Faktorarchive | 23 vorhandene Dateien, benannte Daten 18.09.–23.10.2026 | kein vollständiges ursprüngliches langfristiges Faktorvintagearchiv |
| Produktregimehistorie | 20 vorhandene Dateien, benannte Daten 10.09.–23.10.2026 | getrennt von ex-post-SPY-Rekonstruktion |

Es wurde kein Datenanbieter hinzugekauft, kein Vertrag geändert und kein dauerhaftes neues Lizenz-/Produktgate geschaffen. Fehlende lokale Providerkeys blockieren den inzwischen belegten Actions-Archivzugriff nicht. Noch nötige normative Entscheidungen betreffen den gesondert ausgewiesenen Setup-Wochen-/Monatsvertrag; sie ersetzen keine fehlenden historischen Daten.
