> Aktueller Nachweis vom 7. Oktober: [Accepted-State Recovery](COMPANY_INTELLIGENCE_ACCEPTED_STATE_RECOVERY.md). Der akzeptierte Originalbestand ist inzwischen privat in R2 gesichert und auf unabhängigem Runner exakt wiederhergestellt. Frühere fehlende-Bestandsmeldungen unten sind historische Befunde. Kein Merge und keine öffentliche Aktivierung.

# Company Intelligence — sichere Übergabe und Discover-Beta

**Historischer Bericht der ersten Discover-Aufbereitung.** Die aktuelle Fortsetzung und die inzwischen authentifizierte R2-Untersuchung stehen in [COMPANY_INTELLIGENCE_FULL_DATA_HANDOFF.md](COMPANY_INTELLIGENCE_FULL_DATA_HANDOFF.md). Der aktuelle Rollout-Pointer fehlt im privaten Speicher; die frühere Aussage über fehlende lokale Credentials darf nicht mit fehlenden Actions-Credentials gleichgesetzt werden.

Stand: 6. Oktober 2026. Bestehender PR: [#356](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/356), weiterhin offen, Draft und unmerged. Arbeit bewusst auf `feature/company-intelligence-discover-beta`, ausgehend von `a64582e346aa305db037e0e1b1c02a2dffb7765a`. Separater Draft zur Prüfung: [PR #455](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/455), Basis ist der unveränderte Rollout-Branch. Keine Änderung der Produktions-Zugriffskontrollen, Feature-Flags oder Scheduler.

## Hauptbericht

1. **Was sieht ein Kunde?** In der bestehenden Produktion ist Company Intelligence weiterhin deaktiviert. Die lokale, echte Discover-Aktienseite zeigt jetzt einen deutschen Unternehmensüberblick, belegte Geschäftszahlen mit Vergleichsbasis und Originalberichte. Nachrichten und Termine fehlen in diesem Kandidaten und werden als fehlend bezeichnet. Die fünf gewünschten Bereiche sind in der bestehenden gemeinsamen Discover-/Quant-Komponente geordnet; es gibt keine zweite Demo-Implementierung. Veraltete und nur teilweise vorhandene Zahlen bleiben sichtbar gekennzeichnet.

2. **Was wurde tatsächlich geprüft?** Die 22 bereits freigegebenen Preview-Kürzel stehen für 21 Emittenten: AAPL, NVDA, TSLA, MSFT, XPEV, PLTR, SOFI, ROOT, U, XYZ, TOST, TGT, AFRM, META, GOOG, GOOGL, ACU, CHE, AOS, RARE, PYXS und VEON. 19 Emittenten haben vorbereitete deutsche Profile. 18 haben zentrale Ergebniskennzahlen; XPEV und VEON haben nur ältere Bilanzwerte. ACU hat keine geprüften Geschäftszahlen. CHE hat kein Profil; der ungeeignete Alphabet-Text wird für beide Aktienklassen zurückgehalten. Es sind 19 Jahresberichte und 20 zusätzliche Zahlenquellen verlinkt. Keine News, Calls, Transkripte, Webcasts oder kommenden Termine aus dem verlorenen/fehlenden erweiterten Ledger werden als vorhanden gezählt.

3. **Wo ist die Vorschau?** Der lokale Server läuft auf `http://127.0.0.1:8784`. Beispiel: [Discover AAPL](http://127.0.0.1:8784/discover/?company-intelligence=preview#/s/US_REAL/AAPL). Dieser Loopback-Pfad funktioniert im Workspace und ist **keine extern erreichbare Kunden-URL**. Die echte Release liegt außerhalb des Repositories unter `/workspace/scratch/discover-beta-verified-release`. Screenshots und Prüfberichte liegen unter `/workspace/scratch/beta-evidence`. Der vorhandene Vercel-Link aus PR #356 liefert keine Discover-Vorschau; dieser Hostingweg baut hier nur einen Platzhalter. Eine geschützte externe Vorschau bleibt offen. Kein Produktionszugang wurde dafür gelockert.

4. **Ist der aktuelle Bestand extern gesichert und frisch wiederhergestellt?** **Nein, nicht nachgewiesen.** Dieser frische Workspace enthält keinen operativen SQLite-Ledger, kein Archiv und keinen aktuellen privaten Checkpoint. Der bestehende Pack-Befehl verweigert den fehlenden Bestand mit `CHECKPOINT_STATE_MISSING`. Die R2-Prüfung meldet `MISSING_R2_BINDINGS`; kein Upload und kein Restore wurden ausgeführt. Frühere authentifizierte Tests betreffen andere, kleinere Arbeitsbestände. Sie ersetzen den Nachweis für die zuletzt berichtete erweiterte Generation nicht. Der aktuelle Profilkatalog und vorhandene SEC-Verbraucherdaten sind hingegen in Git gesichert. Ein ausdrücklich als `REVIEW_ONLY` markierter Consumer-Kandidat wurde direkt daraus erstellt, ohne SQLite oder Ersatz-Ledger.

5. **Was fehlt zur Kundenfreigabe?** Übergabe des aktuellen privaten Bestands an einer ruhenden Checkpoint-Grenze; authentifizierter Upload und frischer vollständiger Restore mit exakter Identitäts-/Tabellen-/Generationsprüfung; anschließender Export aus diesem Restore. Zusätzlich sind die kommerziellen Nutzungsgrundlagen der gewählten Quellen und deutschen Aufbereitung zu dokumentieren und freizugeben. Dann den endgültigen, begrenzten Consumer-Kandidaten und eine geschützte externe Vorschau prüfen und separat Kundenfreigabe/Flags bestätigen. Ein Merge von #356 ist keine Voraussetzung für diese unabhängigen Vorarbeiten. Keine 80–90-%-Coverage als Startbedingung.

6. **Welche Kosten sind zu erwarten?** Für die derzeit nur lokale Vorbereitung entstehen keine neuen Provider-, KI-, Übersetzungs- oder Transkriptionskosten und kein aktivierter laufender Cloud-Job. Eine spätere Kohorte mit den 45 im Code vorhandenen eigenen Quellen hätte modelliert 3.600 Quellabfragen/Monat. Bei sechs angenommenen Acht-Minuten-Läufen täglich sind das 1.440 Actions-Minuten; dies ist eine Annahme, keine neue Laufzeitmessung. Standard-Actions im bestätigten öffentlichen Repository haben keinen Compute-Preis. R2 kann bei freien Account-Kontingenten $0 zusätzlich kosten; ohne freie Kontingente liegt das kleine Volländerungs-/Rundungsszenario ungefähr bei $4,86/Monat, vor anderem Account-Verbrauch. Account-Billing ist nicht authentifiziert. Vollbetrieb und initiale Bearbeitung sind separat unten modelliert. Scheduler bleiben aus.

7. **Wie funktioniert Rollback?** Feature zuerst über die vorhandenen Gates deaktivieren: keine UI und null Consumer-Anfragen ohne Preview-Opt-in. Der Speicher hält zwei Consumer- und zwei private Slots. Objekte werden vollständig geprüft, dann der Pointer zuletzt umgestellt. Vor einem Update wird eine vollständig intakte Vorgängergeneration bestimmt; die letzte intakte Generation bleibt bei fehlgeschlagenem Upload erhalten. Die Release-Auslieferung kopiert beide Consumer-Generationen vor dem Index und behält bei Fehlern den deaktivierten Index. Ein älterer Daten-Pointer muss mit dem dazu passenden funktionierenden Release zurückgestellt werden; abgelaufene Snapshots bleiben gesperrt. Im noch nicht veröffentlichten Kandidaten gibt es keine Produktionsgeneration zurückzurollen.

8. **Welche Einschränkungen sieht man?** Fehlende deutsche Beschreibungen, keine vorhandenen News/Termine, kein Umsatz/Ergebnis bei den zwei nur mit Bilanzwerten belegten Auslandsfällen, ältere Zahlen und der Stand der zugrunde liegenden Daten. Das Aufbereitungsdatum wird nicht zum Datum eines Ereignisses oder zur heutigen Geschäftszahl erklärt. Webcasts, Aufzeichnungen, Aktionärsbriefe und Transkripte haben getrennte Bezeichnungen. Bei nicht lieferbaren oder widersprüchlichen Generationen wird eine kurze Nichtverfügbarkeitsmeldung gezeigt.

**Freigabeempfehlung:** Noch keine Kundenfreigabe. Nach Übergabe-/Restore- und Nutzungsnachweis zuerst die bereits geprüfte Kohorte mit Profilen, vorhandenen Zahlen und Berichtslinks freigeben. Nachrichten/Termine nur aus einem tatsächlich wiederhergestellten und separat geprüften Bestand ergänzen. Der langfristige Coverage-Ausbau ist kein Blocker für diese begrenzte Produktfassung.

## Vier getrennte Bestände und Writer-Übergabe

| Zustand | Tatsächlicher Nachweis |
|---|---|
| A — GitHub-Code/Konfiguration/Dokumentation | Rollout-Remote `a64582e…`; gegenüber extern geprüftem `e80b8b0…` genau ein neuer Commit: WordPress-Namensabgrenzung, beobachtete Collections und zugehörige Tests/Quellendeskriptoren. Kein Reset. Der Beta-Code ist auf einem eigenen Branch remote gesichert. |
| B — dieser Workspace | Frischer Clone; 3.678 vorbereitete englische Profile, 5.001 Quellendeskriptoren und bestehende Master-/SEC-Verbraucherdaten. Kein operativer privater Ledger, HTTP-Cache, Discovery-/Backfill-Checkpoint oder erweiterter Export. Keine SQLite-Datenbank angelegt. |
| C — extern wiederherstellbar | Git-Inhalte sind reproduzierbar. Historische R2-Pilot-/Acceptance-Nachweise existieren, deren Inhalt ist hier mangels Credentials nicht abrufbar. Externe Wiederherstellbarkeit der aktuellen erweiterten Generation ist ungeklärt. GitHub-Artefaktlisten enthalten Release-/Browsernachweise, keinen aktuellen privaten Ledger. Private Checkpoints dürfen nicht über öffentliche Actions-Artefakte übertragen werden. |
| D — tatsächlich öffentliche Website | `https://research.visionuniverse.de/company-intelligence/data/index.json` antwortete mit `DISABLED`, leeren `companies` und `tickers`. `/discover/` zeigte die vorhandene Zugangsschranke. Kein erweitertes Datenangebot wurde daraus abgeleitet. |

Es gab in dieser Umgebung vor Beginn keine früheren Sammelprozesse und keine private Writer-Sperre. Das beweist nicht, dass ein Task in einer anderen Umgebung beendet ist. GitHub-CI-Status wurde ausdrücklich nicht als Codex-Task-Status verwendet. Der bisherige Bericht sagt „Discovery continues“. Die Rückfrage nach Writer-Status und einem autorisierten privaten Checkpoint-Pfad blieb während der unabhängigen UI-Arbeit offen. Keine fremde Sperre entfernt, kein Batch gestartet, kein Push auf den aktiven Rollout-Branch.

Der direkte Git-Push hatte keine Git-Authentifizierung. Der vorhandene autorisierte GitHub-Git-API-Weg hat öffentliche Blobs, Tree und Commit mit exakt denselben lokalen SHA-Werten gesichert. Keine Credentials im Chat oder Repository, kein Force-Push.

## Release-Kandidat und Provenienz

- Getesteter Produktcode: `1468ca523762e61f70e9bce4ae16a432df8f4984`. Die nachfolgende Handoff-Korrektur betrifft Tests, Publikationsschutz und Dokumentation; die sichtbaren Release-Dateien bleiben dieselben.
- Consumer-Generation: `7b08f1b9ec577887228c0d0e`.
- Aufbereitungszeit: `2026-10-06T10:46:01Z`; zugrunde liegende Geschäftszahlen: überwiegend `2026-09-23` als Quellenstand, individuelle Berichtsenden im Prüfinventar.
- 21 Unternehmenspayloads, 43 manifestgelistete Dateien, 263.703 Bytes; größtes Payload 14.851 Bytes. Manifest-SHA256: `43c6dfaeb9717b9d7b4e4ad9023f1fe5b65caf063e00cbd0a02376afacb65dc7`.
- `REVIEW_ONLY`, `operationalLedgerRestored=false`. Der Publisher verweigert diesen Kandidaten auch dann, wenn jemand nur das Manifest-Label entfernt: Payloads enthalten die Review-Basis bzw. den redaktionellen Review-Status.
- Alle 43 Dateihashes und Bytezahlen geprüft. Jeder Profiltext ist an SHA256 der vorbereiteten Quellbeschreibung und an die Originalquellenhashes gebunden. Geänderte Quellen oder Beschreibungen erhalten keine veraltete deutsche Zusammenfassung.
- Deutsch-Aufbereitung: `company-profile-editorial-de-1`, kurze manuell vorbereitete sachliche Paraphrasen. Quellparser im Code: `company-profile-parser-1.0.20`; der Katalog bewahrt die ursprünglichen Parser-/Quellversionen je Profil. Keine Live-Übersetzung, kein Modell-Aufruf und keine Generierung pro Besucher.
- Nutzungsstatus: `REVIEW_ONLY` / `PENDING_COMMERCIAL_REVIEW`. Erreichbarkeit und öffentliches Filing sind kein pauschaler kommerzieller Wiederverwendungsnachweis. Nur Faktenzusammenfassungen und Original-Links; keine Artikelkörper, PDFs, Audio oder Transkripte gespiegelt. Nachrichtenanbieter mit ungeklärter Nutzungsgrundlage sind in diesem Kandidaten nicht enthalten.
- Originalquellenhashes wurden aus dem gesicherten vorbereiteten Katalog übernommen. Die privaten ursprünglichen Rohdokumente sind hier nicht vorhanden; kein erneuter exakter Body-Hash-Abgleich dieser Dokumente wird behauptet. Alle 39 Berichts-/Zahlenlinks wurden mit HEAD geprüft und antworteten mit HTTP 200.

Der **nur übernommene** letzte operative Bericht nennt Generation `76a78c65419e9d0ac00b2e0b`, Messzeit `2026-10-06T10:07:32Z`, Checkpoint-SHA256 `845286c361be3d793e91da4d2ec5e7f8389f115d5917be71d5035ec26077f7e9`, 30.419.075 komprimierte Bytes und logischen Hash `9bbfaa70bc72470d6e014a99a7e4bf989ad8d0106aafe04fb2a99708af0c5e2d`. Diese Werte sind **kein neuer lokaler oder Remote-Restore-Nachweis**. Historische Ledgerzahlen wurden nicht addiert; auch frühere Probes und Acceptance-Canaries werden nicht als Kunden-Coverage gezählt.

## Drei unterschiedliche Reviews

**1 — Daten und Quellen.** Alle 3.678 ursprünglichen Profile bestehen den technischen Profilvertrag; 3.678 sind Englisch, 606 kürzer als 160 Zeichen. Eine Heuristik markiert 182 Texte mit Missions-/Werbe-/Prioritätswortlaut als Prüfbedarf, nicht als abschließendes Qualitätsurteil. Die manuelle Kohortenprüfung hielt den Alphabet-Prioritätentext zurück, entfernte Werbeaussagen aus der deutschen Aufbereitung und verwendete nur konkrete belegte Tätigkeiten. Der technische Vertrag allein wurde nicht als kundenfertiges Profil gezählt. ROOT prüft Namensmehrdeutigkeit, ACU/PYXS/RARE kleinere Unternehmen, XPEV/VEON ADR-/Auslandsfälle, GOOG/GOOGL mehrere Aktienklassen. XPEV/VEON lieferten nur Bilanzwerte: CNY bleibt CNY, kein erfundener Umsatz oder Vergleich. Die Zahlen bleiben retrospektiv und es werden keine Mitarbeiterzahlen eingeführt.

**2 — Verständnis und mobile Darstellung.** Echte gepackte Discover-Seiten, alle 22 Kürzel bei 390/430/768/1.440 px; zusätzlich acht Quant-Titel in denselben Größen. Die Prüfung umfasst Profilverfügbarkeit, echte Finanzverfügbarkeit, ältere Bilanzwerte, fehlende News/Termine, Quellen-Touchflächen und horizontale Überläufe. Der anfängliche durch vorhandene Discover-CSS überschreibende Innenabstand und Überschriftenumbruch wurde korrigiert. Separate Fälle prüfen fehlenden Index, widersprüchliche Lookup-/Payloadgenerationen, fehlendes Profil, Duplikate, alte Nachrichten, abgesagte/vergangene Termine, date-only, getrennte Ergebnisveröffentlichung/Call, Schätzfenster, Berliner Sommerzeitwechsel, Webcast/Brief ohne Aufzeichnungs-/Transkriptbehauptung, unsichere Links und mehrdeutige Identität. Positive News-/Termin-/Call-Fälle sind **markierte Browser-Testantworten**, keine vorhandene Coverage des Kandidaten. Screenshots enthalten reale Daten; lange Kapitelaufnahmen blenden nur für die Aufnahme die feste Navigation aus. Separate Viewport-Aufnahmen behalten sie bei.

Eine lokale AAPL-Messung ergab ca. 2,68 Sekunden einschließlich einer Sekunde Stabilitätswartezeit für Preview und 1,79 Sekunden für deaktivierten Modus. Der gemessene gesamte Layout-Shift war in beiden Fällen identisch (ca. 0,068). Das ist eine begrenzte lokale Vergleichsmessung, keine Aussage über externe Hosting-/Netzwerklatenz oder alle Titel.

**3 — Speicherung, Publikation und Rückfall.** Bestehende SQLite-Online-Backup-Implementierung, nicht erzwungene Writer-Sperre, Integritätsprüfung und Restore nur in ein frisches Verzeichnis bleiben erhalten. Neue Consumer-Vorprüfung erfolgt vor jeder Remote-Mutation: Hashes, Datenpfade, Generation/Datum, Ticker-/Issuer-Identität, vollständige Shards/Arrays. Leerer/schrumpfender Issuerbestand wird abgewiesen; Verlust von mehr als 25 % eines vorhandenen Profil-/Finanz-/News-/Earnings-/Call-/Materialbestands wird abgewiesen. Legitime größere Reduktionen benötigen eine explizit neu geprüfte Releaseplanung; sie werden nicht automatisch veröffentlicht. Zeitablauf kommende Termine fällt nicht unter diese Mengenregel. Die aktuell intakte Generation wird vollständig gelesen; bei beschädigter aktiver Generation wird die vollständig intakte Vorgängergeneration geschützt. Legacy-Manifeste erhalten dabei gemessene Inhaltsbaselines. Fehler lassen die letzte intakte Generation unüberschrieben. Zwei Slots, Pointer zuletzt, vorhandener Download-Pointer-Abgleich und Feature-Off bleiben erhalten. Sieben Preview-Pfadprüfungen für Ledger, State, Quellkatalog, Scripts und Dokumentation antworteten mit 404.

## Tests und Regressionsumfang

- 612 Python-Featuretests bestanden; einschließlich der drei neuen Source-Hash-/Sprach-/Review-Verträge. Nach der letzten reinen Textkürzung die drei betroffenen redaktionellen Tests nochmals bestanden.
- 44 Node-Featuretests bestanden: zusätzliche Prüfungen für vorab beschädigte Dateien, kleinere Kohorten, Review-Only-Veröffentlichung, Inhaltsschwund, widersprüchliche Aufbereitungszeit sowie Schutz der letzten intakten Generation nach Slot-Korruption und fehlgeschlagenem Upload.
- 2.578 Produkt-/Regressionsprüfungen bestanden, fünf bestehende Skips, null Fehler: Quant, Discover, Supertrader, Screener, Zugangsschranke und Release-Ressourcenbudget.
- Ein bestehender Regressionstest schrieb seine generierte `quant/data/providers/total-return-verification.json` neu. Sein Diff wurde außerhalb des Repositories als Prüfmaterial erhalten und die ausschließlich testbedingte Änderung aus dem zuvor sauberen HEAD wiederhergestellt. Keine Quant-Daten-/Faktor-/Score-/Chart-Änderung wird ausgeliefert.
- Abschließende Browserabnahme: 120 reale responsive Fälle, zwei deaktivierte Modi ohne Requests, 26 gesonderte Fehlerfälle und zwei Zusatzreviews (Dunkelmodus/CNY sowie simulierter Quellen-404 mit Navigations-Dispose), insgesamt 150 Fälle bestanden. Eine Groß-/Kleinschreibungsassertion für den Schätzhinweis wurde im Test korrigiert; die bereits vollständig bestandene Real-Datenphase wurde aus ihrem Fortschrittslog gesichert, die Fehlerphase separat vollständig wiederholt. Browserbefund und das sichere reduzierte Inventar: `docs/company-intelligence/discover-beta-review.json`. Vollständige lokale Nachweise/Screenshots: `/workspace/scratch/beta-evidence`.

## Kosten und Betrieb — getrennte Szenarien

| Bereich | Annahmen / Grenzen |
|---|---|
| Initiale Aufbereitung dieses Kandidaten | 19 kurze deutsche Profile manuell, vorhandene Fakten offline wiederverwendet; 39 HEAD-Linkprüfungen. Kein Volluniversum-Crawl, keine neue API-Abhängigkeit. Lokale Tests/Builds sind keine Actions-Minuten. Kein Geldpreis für späteres vollständiges redaktionelles Lektorat behauptet. |
| Laufende gewählte Kohorte | 45 bekannte eigene Quellendeskriptoren, 120 geplante Abfragen/Tag bzw. 3.600/Monat, vor SEC/Robots/Retry. Nachrichten etwa vierstündlich, Materialien/Events gemäß vorhandenen langsameren Intervallen, Profile ereignisgetrieben/langsam. Acht Minuten/Lauf angenommen: 1.440 Actions-Minuten/Monat; nicht gemessene aktuelle Pipeline-Laufzeit. |
| Beta-Consumer und privater Zustand | 43 Consumer-Assets, zwei Slots; 8.460 PUT und 23.940 Prüf-GET/Monat bei Volländerung und intaktem Vorgänger. Bei zusätzlicher Vorgängerslot-Recovery höchstens 31.680 öffentliche Prüf-GET. Private Sicherung separat 540 PUT/900 GET. Private Größe mangels neuem Bestand ungemessen; mit nur als Sizing übernommenen 30,4 MB etwa 0,061 GB für zwei volle private und zwei Consumer-Slots. Keine kleinere Beta-DB überschreibt den erweiterten Bestand. |
| Besucher | Maximal 15.591 Bytes bzw. im Mittel 12.932 Bytes für die drei Company-Intelligence-JSON-Dateien einer Aktienseite, ohne HTTP-Header und bestehenden App-/Chartverkehr. Der vorhandene Pages-Downloadweg serviert vorbereitete statische Exporte; Besucher erzeugen keine R2-Quellabfrage/Übersetzung. |
| Späterer Gesamtbetrieb | Die 5.001 im Code vorhandenen Deskriptoren ergeben modelliert 482.250 Quellabfragen/Monat und mindestens 16.069 Minuten serielle Zwei-Sekunden-Pausen, ohne HTTP-Latenz/Robots/Retry. 17 Kapazitäts-Lanes mit je 160 Anfragen wären vor Zusatzarbeit erforderlich; bei acht angenommenen Minuten/Lane 24.480 aggregierte Actions-Minuten. Das fehlende Laufzeitregister kann weitere Quellen enthalten: kein exakter Vollbestandsplan wird behauptet. Dies ist vom Quellregister berechnet, nicht vom Beta-Pilot hochgerechnet. |
| Spätere Gesamtspeicherung | Nur aus dem vorherigen Bericht übernommenes Sizing: 5.116 Payloads/5.755 Assets/139,6 MB. Volländerungsmodell etwa 1.037.160 PUT inkl. privater Pointer, 3.109.320 Prüf-/Restore-GET mit intaktem Vorgänger; mit zusätzlicher Slot-Recovery höchstens 4.145.220 GET. Rundungsszenario ohne freie R2-Quoten ungefähr $10,45–10,81/Monat, vor anderem Accountverkehr. Diese Größen wurden hier nicht aus dem fehlenden Ledger nachgemessen. |

R2 Standard: $0,015/GB-Monat, $4,50 je Million Class-A-Operationen und $0,36 je Million Class-B-Operationen, mit Abrechnungseinheiten-/Account-Rundung; freie Account-Kontingente 10 GB, eine Million A und zehn Millionen B. GitHub Standard-Public-Runner haben keinen Compute-Preis; der illustrative private Runnerpreis $0,006/Minute ergäbe für das Beta-Acht-Minuten-Modell $8,64 vor privaten Freiminuten. Account-Verbrauch, Artifact-/Cache-Kosten und spätere Daten-/Besucherlast bleiben unauthentifiziert. Preisquellen: [R2](https://developers.cloudflare.com/r2/pricing/) und [GitHub](https://docs.github.com/en/billing/reference/actions-runner-pricing), aus der bestehenden Dokumentationsprüfung vom 5. Oktober übernommen.

## Reproduzierbare lokale Vorschau

Alle Ausgabeverzeichnisse müssen frisch und außerhalb des Repositories liegen. Der Builder liest nur das gesicherte Master-/Profil-/SEC-Faktenmaterial und erstellt **keinen Ledger**.

```bash
python3 scripts/company_intelligence/prepare-discover-beta.py \
  --out /tmp/vu-beta-consumer --report /tmp/vu-beta-review.json
node scripts/vu2/build-release.mjs --output=/tmp/vu-beta-site
node scripts/company_intelligence/stage-discover-preview.mjs \
  --consumer /tmp/vu-beta-consumer --release /tmp/vu-beta-site
python3 -m http.server 8784 --bind 127.0.0.1 --directory /tmp/vu-beta-site
# In einem zweiten Terminal, mit der vorhandenen optionalen Playwright-Installation:
node scripts/company_intelligence/discover-beta-qa.mjs \
  --url http://127.0.0.1:8784 --candidate /tmp/vu-beta-review.json --out /tmp/vu-beta-browser
```

Der Stager akzeptiert nur eine frische deaktivierte lokale Release. Er ruft keine Remote-Speicheroperation auf. Der reguläre Publisher verweigert Review-Kandidaten. Die bestehende Feature-Kohorte bleibt unverändert und Stage 0 bleibt Standard.

## Exakte offene Blocker

- **STATE_HANDOFF:** Aktueller erweiterter privater Ledger/Archiv und Discovery-/Backfill-/Quellen-/Alias-/Korrekturzustand fehlen in diesem frischen Workspace. Writer-Status und autorisierter aktueller Backup-Pfad außerhalb dieses Workspaces nicht bestätigt.
- **R2_CURRENT_RESTORE:** Die Bindungen `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`, `VU_HISTORY_S3_ACCESS_KEY_ID`, `VU_HISTORY_S3_SECRET_ACCESS_KEY` fehlen. Die Repository-API für Actions-Secrets und Variables antwortet zusätzlich mit `403 Resource not accessible by integration`. Credentials wurden nicht im Chat angefordert. Kein Initialisieren eines alten Namespace, kein Ersatzbestand, kein Upload, kein frischer Remote-Restore.
- **SOURCE_USAGE:** Kommerzielle Nutzungsprüfung der gewählten Quellen/Aufbereitung offen. Neue deutsche Profile und der Kandidat bleiben `REVIEW_ONLY`; keine News-Reuse-Freigabe aus öffentlicher Erreichbarkeit abgeleitet.
- **PROTECTED_EXTERNAL_PREVIEW:** Kein hier autorisiert konfigurierter geschützter Frontend-Preview-Host. Loopback-Vorschau und Screenshots funktionieren; vorhandener Vercel-Pfad ist kein Frontend. Produktions-Zugangsschranke unverändert.
- **SEPARATE_CUSTOMER_APPROVAL:** Auftrag erlaubt Vorbereitung, nicht Merge, öffentliche Standardaktivierung oder neue öffentliche Scheduler. Diese Schritte wurden nicht ausgeführt.

```text
CODE-REMOTE-PRESERVED: YES
CURRENT-DATA-REMOTE-PRESERVED: NO
FRESH-RESTORE-VERIFIED: NO
CUSTOMER-PREVIEW-READY: NO (lokale Produktvorschau vorhanden; externe Kunden-URL fehlt)
CONTROLLED-BETA-READY: NO
PUBLIC-ACTIVATION-PERFORMED: NO
PR: #356 unverändert; #455 separater Draft auf Basis des Rollout-Branches
BRANCH: feature/company-intelligence-discover-beta
LOCAL-HEAD: finaler geprüfter Branch-HEAD, siehe Git-Ref / Abschlussbericht
REMOTE-HEAD: finaler geprüfter Branch-HEAD, siehe Git-Ref / Abschlussbericht
DATA-GENERATION: 7b08f1b9ec577887228c0d0e (REVIEW_ONLY; nicht die erweiterte operative Generation)
PREVIEW-URL: http://127.0.0.1:8784/discover/?company-intelligence=preview#/s/US_REAL/AAPL (nur Workspace)
EXACT-REMAINING-BLOCKERS: STATE_HANDOFF; R2_CURRENT_RESTORE; SOURCE_USAGE; PROTECTED_EXTERNAL_PREVIEW; SEPARATE_CUSTOMER_APPROVAL
```
