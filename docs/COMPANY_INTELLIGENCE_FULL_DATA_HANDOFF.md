> Aktueller Nachweis vom 7. Oktober: [Accepted-State Recovery](COMPANY_INTELLIGENCE_ACCEPTED_STATE_RECOVERY.md). Der akzeptierte Originalbestand ist inzwischen privat in R2 gesichert und auf unabhängigem Runner exakt wiederhergestellt. Frühere fehlende-Bestandsmeldungen unten sind historische Befunde. Kein Merge und keine öffentliche Aktivierung.

# Company Intelligence — aktueller State Handoff und Full-Data-Preview

Stand: 6. Oktober 2026. Fortsetzung von [#356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356) und [#455](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/455). Kein PR-Merge, kein Produktions- oder Scheduler-Flag geändert, kein Coverage-Crawl gestartet. Arbeit auf dem vorhandenen `feature/company-intelligence-discover-beta`.

## Ergebnis für Dennis

1. **Was ist sichtbar?** Produktion bleibt `DISABLED`. Die bestehende Discover-Integration bleibt erhalten. Lokal sind jetzt zusätzlich die deterministischen Zahlenvergleiche unter „Was hat sich verändert?“ sichtbar. Historische Calls/Webcasts erhalten bei belegten Links einen eigenen Bereich; Aufzeichnungen und Transkripte werden nicht aus Webcast-URLs abgeleitet. Jahresvergleiche heißen Vorjahr, nicht Vorjahresquartal. Ohne Beleg wird kein Bereich erzeugt.
2. **Externe URL:** Keine funktionierende geschützte Full-Data-Vorschau verfügbar. Der alte Vercel-Discover-Pfad antwortet weiterhin mit 404; Vercel meldet auf dem neuen Branch `build-rate-limit`. Ein kostenpflichtiges Upgrade wurde nicht veranlasst. Localhost wird nicht als Kunden-URL ausgegeben.
3. **Wie viele Unternehmen sind wiederhergestellt?** **Null in diesem Task.** Der zuletzt dokumentierte operative Export nennt 5.118 Payloads; diese Zahl wurde nicht durch einen Remote-Restore reproduziert. Der kleinere vorhandene Review-Kandidat umfasst weiterhin 21 Emittenten/22 Kürzel und ist kein Ersatz für den erweiterten Bestand.
4. **Aktueller Bestand dauerhaft gesichert?** Nicht nachgewiesen. Git-Code/Konfiguration und die dokumentierten Fingerprints sind gesichert. Der aktuelle private Ledger und Checkpoint sind hier nicht verfügbar.
5. **Frischer Restore?** Nicht durchgeführt: Ein neuer Actions-Runner konnte den privaten Bucket authentifiziert prüfen, aber keinen Checkpoint im vorgesehenen Rollout-Namespace abrufen. Die Prüfung verweigerte die Initialisierung und brach vor dem Restore ab.
6. **Quellenklassen:** Für eine künftige geschützte Review-Vorschau vorbereitet: nachweislich unternehmenseigene IR-Metadaten, SEC-Fakten und Original-Links. Unbelegte Publisher-/RSS-Wiederverwendung bleibt ausgeschlossen. Keine Full-Data-Vorschau wurde aktiviert; die tatsächliche private Quellenunion wurde nicht als freigegeben behauptet.
7. **Offen:** Privater Checkpoint-Pfad und Stillstand des vorherigen Workers, aktueller R2-Upload/Restore, Prüfung des tatsächlichen Quellenregisters und Exports, geschützter externer Hostingweg, 30–50-Aktien-Abnahme und separate Kundenfreigabe.
8. **Beta bereit zur Freigabe?** Nein. Die unabhängigen Code-/UI-Schutzmaßnahmen sind vorbereitet; der vorgeschriebene Daten- und Preview-Nachweis fehlt.

## Autoritativer Zustand — vier getrennte Ebenen

| Ebene | Tatsächlicher Befund |
|---|---|
| Code | #356 war zu Beginn auf `59d8c2d527c58e3f129cf95abe7bc237664a76fb`, zwei Commits nach dem vorherigen `a64582e…`. Beide Engine-Commits wurden in den #455-Arbeitsbranch übernommen; keine PRs geschlossen oder gemergt. |
| Operativer Datenstand | Letzter berichteter Messzeitpunkt `2026-10-06T11:44:44Z`, Queue-Snapshot `11:46:18Z`, Generation `ad1e580079c82c7e21620766`. Berichtete Coverage: 2.544 News-180d-Emittenten, 1.001 Calls, 1.812 Präsentationen, 402 Transkriptreferenzen, 159 bestätigte kommende Earnings. Nicht lokal nachgezählt und keine Addition historischer Ledgers. |
| Dieser Workspace | Unter `/workspace`, `/tmp` und `/root` kein operativer SQLite-Ledger/privater Checkpoint gefunden. Keine frühere lokale Sammlung. Das beweist nicht, dass der Worker in seinem anderen Workspace beendet ist. #356 sagt weiterhin, dass der Worker aktiv ist. Keine fremden Prozesse/Sperren verändert. |
| Remote / Auslieferung | Authentifizierter privater Bucket ist nicht öffentlich, aber der reguläre Rollout-State-Pointer fehlt. Der vorhandene kleinere Consumer-Kandidat ist `REVIEW_ONLY`; keine Full-Data-Produktion oder geschützte externe Full-Data-Vorschau. |

**Berichteter, nicht hier wiederhergestellter Checkpoint:** SHA256 `44d8fba675ab5df31d646f40c54b0e5f9baf1c07c6c87bdcee993e05a39d01ce`, 29.771.530 komprimierte Bytes; sechs Tabellen logischer Hash `7a36f63d920bcac0aa04639ad9666ff9c83f13bff99771721564ba6b5a672e07`. Letzter dokumentierter Export-Milestone-Code `5f3ce9a48a850e2430ca160735773b2e979f08e3`; der Producer-Pin muss bei einer neueren Checkpoint-Übergabe ebenfalls aktualisiert werden. Die öffentliche Konfiguration speichert ausschließlich diese reduzierten Nachweiswerte.

Git rekonstruiert Master-Identitäten, vorbereitete Profile, Quellendeskriptoren und Parser. Es rekonstruiert **nicht** die akzeptierten Items/Events, vollständigen Laufzeitquellen, Quellengesundheit/Due-Times, Alias-/Korrekturhistorie, private Archive oder Discovery-/Backfill-Checkpoints. Eine Wiederholung der Discovery wäre kein Restore; sie wurde nicht gestartet. Falls der vorherige Workspace verschwindet, können genau diese ungesicherten privaten Daten verloren gehen.

## Authentifizierte R2-Untersuchung

Workspace-Bindings fehlen weiterhin: `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`, `VU_HISTORY_S3_ACCESS_KEY_ID`, `VU_HISTORY_S3_SECRET_ACCESS_KEY`. Der aktuelle Cloud-Runtime meldet keine Secrets/outbound identities. Actions-Secrets-/Variables-Auflistung liefert 403; das wurde **nicht** als Beweis gegen die verfügbare Actions-Ausführung behandelt.

Der bestehende Workflow wurde um `current_restore_only=true` erweitert. Die ursprünglichen mutierenden Jobs behalten ihre Concurrency-Gruppe und werden in diesem Modus übersprungen. Der Read-only-Modus benutzt eine getrennte Gruppe, damit er keinen wartenden Writer-Batch verdrängt. Der erste Probe-Dispatch `37468291320` wurde ohne gestartete Jobs durch die bestehende Pending-Concurrency ersetzt; danach wurde diese Trennung korrigiert. Keine fremden Runs wurden abgebrochen.

Zwei tatsächliche frische Runner:

- [37468491117](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37468491117), Code `4a25bb7f312ccba22f39485e525d5e47fdd5c832`: `VERIFIED_NON_PUBLIC`, `MANAGED_DISABLED_NO_CUSTOM_DOMAINS`; Checkpoint-Pull scheiterte mit dem bisherigen generischen Fehler.
- [37469171087](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37469171087), Code `3ffd3d1a3451d689cff2c6248d4518cefe27ae2c`: erneut private Bucket-Prüfung bestanden; jetzt sicher klassifizierter Fehler **`REMOTE_STATE_MISSING_INITIALIZATION_REQUIRED`**. Kein Initialisieren, kein R2-Schreibzugriff, kein Restore, kein State-Artifact.

Geprüft wurde ausschließlich der bestehende reguläre Branch-Namespace `branch-b153bd74ab50fdc2a7346c75`, aus dem Rollout-Branchnamen abgeleitet. Das beweist dessen fehlenden aktuellen Pointer, nicht die Abwesenheit sämtlicher denkbarer fremder privater Speicherobjekte. Für einen abweichenden autorisierten Checkpoint-Pfad fehlt die Übergabeinformation. Frühere Acceptance-/Pilot-Runs gehören zu anderen Namespaces/Arbeitsbeständen und ersetzen diesen Nachweis nicht.

Die neue `current_state_acceptance.py` akzeptiert nur den berichteten Hash und die Bytezahl, ein frisches Verzeichnis und den sauberen ursprünglichen Producer-Commit. Sie prüft SQLite-Integrität, sämtliche Ledger-/Archivtabellen samt Identitätshashes und Schemahashes, die ursprünglichen sechs Tabellen sowie Generation und erwartete Payloadzahl. Der Export läuft mit dem ursprünglichen Producer und unverändertem Zeitstempel; danach müssen alle operativen Tabellen unverändert sein. Grund: `export_revision()` hasht **alle** Producer-Python-Dateien, daher würde spätere UI-/Handoff-Logik eine andere Generation erzeugen. Die aktuelle Generation darf nicht durch einen neuen leeren oder kleineren Export ersetzt werden.

Der bestehende Online-SQLite-Backup-/Idle-Writer-Mechanismus bleibt unverändert. Ein neuer aktueller Upload muss vom wirklich vorhandenen, ruhenden Bestand ausgehen. Private Checkpoints dürfen weder in Git noch über öffentliche Actions-Artifacts transportiert werden. Der neue Probe-Workflow veröffentlicht ausschließlich aggregierte Hash-/Zählnachweise, wenn die gesamte Prüfung bestanden ist. Hier entstand kein solches erfolgreiches Restore-Artifact.

## Quellenreview und Consumer-Trennung

Der übernommene Code enthält 5.019 Deskriptoren: 2.113 IR_FEED, 1.305 IR_EVENTS, 1.595 IR_MATERIALS und sechs RSS. Das ist **Konfiguration**, nicht das vollständige private Runtime-Register. Die Providerzählung ist in `docs/company-intelligence/full-data-source-review.json` dokumentiert.

| Klasse | Vorgesehene Darstellung / Entscheidung |
|---|---|
| Unternehmenseigene Quellen | Kurzer Titel, echtes Datum, Original-Link, strukturierte Tatsachen. Nur exakte Emittentenidentität, bestehender verifizierter Besitznachweis und freigegebene Hosts. Kein Artikelkörper. |
| SEC / regulatorisch | Strukturierte Geschäfts-/Regulierungsfakten, selbst formulierte Kategorien und Original-Filing-Links. Keine pauschale Lizenzbehauptung für von Unternehmen eingereichte Texte. |
| Q4, GCS, StockPR, WordPress, Investis, Web Driver | Technische Plattformnamen verleihen keine Nutzungsrechte oder Eigentumsautorität. Nur verifizierte unternehmenseigene IR-Instanzen und Metadaten/Original-Referenzen wie oben. |
| GlobeNewswire RSS/Sitemap | Öffentliches Feed/Contributor-Matching belegt den Zugang, keine ausreichend dokumentierte kommerzielle Weiterverwendungsfreigabe. Im vorgeschlagenen Preview-Filter ausgeschlossen. Eine echte unabhängige Erstquellen-Dublette kann nur mit identischem Titel/Datum und belegtem Erstquellen-Link erhalten bleiben. |
| Wallstreet-Online / sonstiges RSS | Die bestehende Dashboard-Notiz ist ohne geprüfte Vertrags-/Nutzungsevidenz kein übertragbarer Consumer-Freibrief. Ausgeschlossen, bis die konkrete Freigabe belegt ist. |
| Business Wire / PR Newswire / andere Publisher | Ungeklärte/restriktive Wiederverwendung bleibt ausgeschlossen. Kein Volltext, kein Abstract und kein Artikelkörper wird übernommen. |

`prepare-public.py --preview-source-registry <separates kombiniertes Register>` kann den bestehenden Consumer-Weg mit dieser konservativen Regel ausführen. Das Register muss aus dem tatsächlich wiederhergestellten privaten Source-Register plus passenden Konfigurationen kommen; die statische Datei allein ist kein Full-State-Ersatz. Der Filter verändert keinen Ledger, entfernt Body-/Excerpt-/Summary-Felder, bewahrt belegte Erstquellen-/SEC-Metadaten und eindeutig bezeichnete Schätzfenster. Der Kandidat trägt Review-Markierung sowohl im Manifest als auch im Payload; normale öffentliche Veröffentlichung bleibt auch nach Entfernen des Manifest-Labels gesperrt.

Eine endgültige kommerzielle Full-Data-Nutzungsfreigabe wird nicht behauptet. Die ursprünglich versuchten allgemeinen Terms-/RSS-Seiten lieferten 404 und wurden ausdrücklich nicht als Lizenzbelege verwendet. Keiner dieser Fehlpfade wird als funktionierende Quelle zitiert.

## Produktprüfung und externe Schutzgrenze

45 eindeutige aktuelle Master-Kürzel/44 Emittenten sind als nächste Review-Kohorte gespeichert: `docs/company-intelligence/full-data-preview-cohort.json`. Enthält die acht vorgeschriebenen Titel, Banken/Versicherungen, Auslands-/ADR-, Industrie-, Healthcare-/Biotech-, Consumer-, Software- und Halbleiterfälle sowie dokumentierte reichhaltige/sparse Beispiele. Jeder Eintrag ist **NOT_REVIEWED_FULL_STATE_UNAVAILABLE**. Market-Cap-Bänder und tatsächliche Modulverfügbarkeit müssen nach Restore gemessen werden; keine erfundene 45-Aktien-Abnahme.

Die lokale UI-Regressionsprüfung verwendet ausschließlich den bereits geprüften kleineren echten Kandidaten `7b08f1b9ec577887228c0d0e`. Die neue lokale Release liegt unter `/workspace/scratch/handoff-review-release`; Port 8785 ist lediglich interne Testinfrastruktur. Die spätere Vollbestands-Anbindung wird daraus nicht abgeleitet. Nachrichten-/Termin-/Call-Positive in Browsertests sind getrennte markierte Testantworten und keine Coverage.

Der bestehende Pages-Workflow deployt beim Nicht-PR-Event Produktion, deshalb wurde er nicht für eine isolierte Preview ausgelöst. `vercel.json` baut weiterhin nur den bestehenden Public-Platzhalter; auf dem geprüften Branch meldet Vercel zusätzlich `build-rate-limit` mit Upgrade-Link. Keine bezahlte Lösung gewählt. `docs/RESEARCH_ACCESS_GATE.md` erklärt ausdrücklich, dass Original-HTML und Datendateien direkt abrufbar bleiben; ein clientseitiges Passwortformular allein erfüllt den geforderten serverseitigen Preview-Schutz nicht. Eine künftige externe Vorschau muss alle HTML-/Consumer-Datenpfade serverseitig schützen und private Ledger/Checkpoints ausschließen. Bestehende Produktionskontrollen wurden nicht gelockert.

## Abgeschlossene unabhängige Qualitätsprüfungen

Getesteter finaler Runtime-Code: `8aab8b45e00937bebc6f8d49ac774e8b45e53cc8`. Nachfolgende Commit-Arbeit dokumentiert die Nachweise, ohne die geprüfte UI zu ändern.

- **Daten/Quellen:** 638 vollständige Python-Featuretests bestanden. Nach den letzten gezielten Filter-/Hash-Helfer-Korrekturen nochmals sieben Quellennutzungstests, drei Restore-Guardtests und 19 Projektions-/Quellverträge bestanden. Der zusätzliche CDN-Vertrag erhält eine ausdrücklich am verifizierten Erstquellen-Event angehängte Präsentation, verweigert dieselbe Referenz ohne diesen Parent. Der Review-Marker bewahrt die ursprüngliche kleinere Katalogbasis; er behauptet keinen Restore.
- **UX/Responsive:** Abschließend 159 Browserfälle bestanden: 120 echte responsive Fälle (22 Discover-Kürzel und acht Quant-Titel bei 390/430/768/1440 px), vier zusätzliche echte dunkle Discover-Fälle bei 390/430 px, drei deaktivierte Modi ohne Consumer-Requests und 32 ausdrücklich simulierte Fehler-/Inhaltsfälle. Letztere prüfen unter anderem Jahresmargen/What Changed, unbekannte Vergleichsbasis, abgesagte Calls, Sommerzeit, date-only, Estimates, Materialtypen und Generationen. Sie sind keine operative Coverage.
- **Speicherung/Publikation:** 46 Node-Featuretests bestanden; Review-Payload ohne Manifest-Label darf weiterhin keine Remote-Mutation auslösen. Acht private/nicht öffentliche Pfade der finalen lokalen Release antworteten mit 404. Keine Operational-DB, Checkpoint oder Credential wird ausgeliefert.
- **Regression:** 2.632 Produktprüfungen bestanden, fünf bestehende Skips, null Fehler. Die vom alten Regressionstest selbst neu erzeugte Total-Return-Prüfdatei wurde nach Ende des Tests ausschließlich aus dem zuvor sauberen HEAD wiederhergestellt; ihr Diff bleibt als lokales Prüfmaterial erhalten. Keine Quant-Faktoren, Scores, Charts oder Stammdaten verändert.
- **Echte Filter-Integration, begrenzt:** Ein separates lokales Smoke-Export des kleineren vorhandenen Kandidaten erhielt alle 21 Emittenten, 19 deutschen Profile, 20 Finanzansichten und 39 SEC-Materiallinks; `REVIEW_ONLY`, null Remote-Schreibzugriffe. Smoke-Generation `44ae1256aa8d0a1853e87866` ist eine lokale Filterprüfung und **nicht** die operative Generation oder die sichtbare Vorschau-Generation.

Eine erste Prüf-Release war während der UI-Korrektur gebaut worden: Discover lud die anschließend aktualisierte gemeinsame Datei, Quant hatte noch eine frühere Kopie im Bundle. Der neue Jahresvergleichsfall deckte diesen Artefaktfehler auf. Danach komplette Release frisch gebaut und sämtliche 154 Standardfälle sowie fünf Dunkelmodus-/Off-Fälle erneut erfolgreich geprüft. Der finale Quant-Bundle enthält die exakt aktuelle gemeinsame UI-Datei; SHA256 `ff4a0b80637c7504a43a1dca0f4c86aded7ef6706e210f53cc5a1b7aff46c735`. Kein unvollständig aktualisiertes Artefakt wird als geprüft ausgegeben.

Reduzierte Fall-/Hashnachweise: `docs/company-intelligence/full-data-handoff-review.json`. Vollständige lokale Logs/Screenshots: `/workspace/scratch/beta-evidence/handoff-final-browser`, `handoff-final-dark` und die `handoff-*-tests*.txt`-Dateien. Screenshots zeigen nur den vorhandenen kleineren echten Kandidaten; eine manuelle Dennis-Abnahme der Full-Data-Preview hat nicht stattgefunden.

## Fortsetzung ohne Neustart

1. Vorherigen Writer am vorgesehenen Checkpoint stoppen lassen und den echten privaten State-Pfad/Checkpoint autorisiert übergeben. Die Rückfrage nennt nur Pfad/Task-Verweis, keine Secrets.
2. Bestehenden konsistenten Pack-Weg verwenden; vollständige private Tabellen/Hashes, Code-Pin und Generation belegen. Über den vorgesehenen privaten R2-Weg authentifiziert hochladen; fehlenden Namespace nur mit diesem nachgewiesenen vollen Bestand ausdrücklich initialisieren.
3. Read-only-Probe mit aktualisiertem passenden Checkpoint-/Producer-Pin ausführen. Den erfolgreichen frischen Restore und unveränderten Export nachweisen, nicht nur Bucket-Zugriff.
4. Tatsächliches Runtime-Quellenregister prüfen; Consumer-Projektion mit den zugelassenen Klassen erstellen. Einen isolierten Review-Namespace verwenden und niemals die reichere Arbeitsgeneration durch eine gefilterte Kohorte ersetzen.
5. Geschützte externe Preview bereitstellen, 45 geplante Titel bei 390/430/Tablet/Desktop in Hell/Dunkel und durch den echten Zugriffsgate prüfen. Daten-/UX-Fehler beheben und neue Release erneut prüfen.
6. Dennis erhält die wirkliche iPhone-URL und Belege; Merge, kontrollierte Kundenaktivierung und neue Scheduler bleiben separate Entscheidungen.

## Exakte offene Blocker

- **STATE_HANDOFF:** Erweiterter Ledger/Archiv/aktueller Checkpoint liegen im fremden vorherigen Workspace; hier nicht zugänglich. Writer-Status außerhalb dieses Workspaces und autorisierter Checkpoint-Pfad sind unbestätigt.
- **R2_CURRENT_RESTORE:** Actions-Credentials sind nutzbar und Bucket-Privacy ist bewiesen; der reguläre Rollout-Namespace-Pointer fehlt. Aktueller Upload, frischer Restore und exakter Re-Export sind nicht erfolgt.
- **SOURCE_USAGE:** Tatsächliche private Quellenunion wurde nicht wiederhergestellt/geprüft. Publisher-Rechte sind unzureichend belegt; konservativer Preview-Filter vorbereitet, Full-Data-Nutzungsfreigabe offen.
- **PROTECTED_EXTERNAL_PREVIEW:** Kein deployter geschützter Full-Data-Host; existierender Vercel-Pfad 404/Build-Rate-Limit, Pages-Weg Produktion, vorhandener Research-Gate clientseitig. Zusätzlich fehlt zuvor der vorgeschriebene verifizierte Full-Data-Export.
- **FULL_DATA_PRODUCT_REVIEW:** Keine 30–50-Aktien-Abnahme aus einem restaurierten Bestand möglich. 45 Titel nur als geplante aktuelle Master-Kohorte dokumentiert.
- **SEPARATE_CUSTOMER_APPROVAL:** Dieser Auftrag erlaubt Vorbereitung und geschützte Preview, weiterhin keinen PR-Merge oder breite Produktionsaktivierung.

Maschinenlesbare Actions-Nachweise: `docs/company-intelligence/current-state-actions.json`. Keine privaten DBs, Checkpoint-Bodies oder Tokens in Git. Abschließende lokale/Remote-HEADs und Clean-Tree-Prüfung stehen im finalen Übergabebefund.
