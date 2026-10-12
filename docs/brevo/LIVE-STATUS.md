# Brevo: belegter Kontostand und Listenansicht

Stand: 12. Oktober 2026. Letzter Listen-Leseabgleich: 12:07 Uhr Europe/Berlin. **Import vorbereitet, noch nicht durchgeführt.** Alle heutigen Brevo-Aufrufe waren GET-Leseprüfungen. Keine neuen Listen oder Merkmale, kein Kontaktimport und kein E-Mail-Versand.

## Setup-Nachweis und erneuter Leseabgleich

PR [544](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/544) und [545](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/545) sind gemergt. PR 545 wurde am 10. Oktober mit ausdrücklicher Freigabe nach aktuellen Checks gemergt (`a72978dca497528d9695d0695fe67a570e2efdac`): 133/133 Core-Tests und 37 Brevo-Prüfungen erfolgreich. Der ältere rote Core-Check bleibt als News-/Company-Master-Baselinefehler im historischen [Merge-Prüfbericht](MERGE-REVIEW.md) dokumentiert. Keine Gates oder fremden Produktdateien wurden durch den Brevo-PR geändert.

| Nachweis | Ergebnis |
|---|---|
| [Setup 38061539873](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38061539873), 10. Oktober, 16:55 Uhr Europe/Berlin | erfolgreich; VU-Listen IDs 4, 5 und 6; 0 Kontakte importiert, 0 E-Mails versendet |
| [Anschließender API-Audit 38061582213](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38061582213), 10. Oktober, 16:56 Uhr | dieselben drei IDs gelesen; 10 von 10 kompatiblen VU-Merkmalen, keine Typkonflikte |
| [Regulärer API-Audit 38233376781](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38233376781), 12. Oktober, 11:59 Uhr | dieselben drei IDs erneut gelesen; kostenloser Tarif, 10 Merkmale, 1 Kontakt, 1 aktiver Absender, 1 registrierte Domain |
| [Konto-/Ordner-Audit 38234286301](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38234286301), 12. Oktober, 12:07 Uhr | vollständiges Listeninventar, drei Einzelabrufe und Ordnerabrufe stimmen überein; jede VU-Liste genau einmal vorhanden, Ordner ID 3, alle leer |

Die historischen Setup-/Audit-Läufe wurden erneut anhand ihres Status, Dispatch-Commits und ihrer zulässigen JSON-Zählwertausgaben geprüft. Beide liefen auf Commit `a72978dc...`. Der neue reguläre Audit lief auf `d6b2737bfda1a25bf5dab7d9380ed24297150aac`; die manuelle Konto-/Ordnerprüfung auf einem isolierten Betriebsbranch mit fest gepinntem, rein lesendem Code. Der normale Admin-Guard auf dem Standardbranch blieb unverändert.

## Konto, Ordner und Oberflächenfilter

Der private Vergleich mit der vom Owner genannten Kontobezeichnung passt zum Geschäftsnamen; der vollständige API-Unternehmensname enthält lediglich einen Rechtsform-/Schreibzusatz. Ein exakter kurzer Textvergleich meldete deshalb zunächst eine Abweichung. Die verfeinerte Prüfung berücksichtigt ausschließlich bekannte Rechtsform- und Schreibvarianten und gibt nur den Vergleichsstatus aus. Aus dieser Namensabweichung wird **kein falscher API-Schlüssel oder anderes Konto behauptet**.

Die aktive Browser-Sitzung wurde nicht eingesehen. Der Vergleich einer Unternehmensbezeichnung allein beweist keine eindeutige Kontonummer oder Login-Identität. Eine vollständig bestätigte Gleichheit von API-Konto und Browser-Sitzung wird deshalb nicht behauptet. Keine Kontoadresse, vollständigen Identitätswerte, fremden Listen-/Ordnernamen, Rohantworten, Schlüsselwerte oder Schlüsselfingerprints wurden ausgegeben.

Der ungefilterte API-Abruf liefert insgesamt 4 Listen in 2 Ordnern. Alle drei Ziel-Listen liegen in **„Vision Universe“ (Ordner-ID 3)** und wurden zusätzlich über `GET /contacts/lists/{id}` sowie `GET /contacts/folders/3/lists` bestätigt:

| Liste | Listen-ID | Ordner-ID | Kontakte |
|---|---:|---:|---:|
| VU \| Newsletter | 4 | 3 | 0 |
| VU \| App-Warteliste | 5 | 3 | 0 |
| VU \| Newsletter-Test | 6 | 3 | 0 |

Ein aktuell ausgewählter Oberflächenordner oder ein Suchfilter ist über diese API nicht sichtbar. Dass ein Filter die Listen tatsächlich ausblendet, ist **nicht nachgewiesen**. Die dokumentierte Ordnerauswahl kann die Listenansicht jedoch auf einen anderen Ordner begrenzen.

**Listenabgleich erledigt:** Der Owner bestätigt die Listen 4, 5 und 6 als sichtbar und leer. Keine weitere Listenansicht oder Neuanlage erforderlich.

## API-Import und einmalige private Übergabe

PR 609 wurde nach erfolgreichen relevanten Checks gemergt (`54acec5889dc65b8b914531ab3d3affcbc58a902`). Der bisherige manuelle Importauftrag ist durch den aktuellen API-Importauftrag ersetzt.

Der tatsächliche [Actions-Import-Preview 38251453506](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38251453506) scheiterte vor Kontaktabgleich und Mutation: `BREVO_IMPORT_PAYLOAD` fehlt oder ist zu groß. Aus dieser kombinierten Fehlermeldung wird nicht behauptet, die Existenz des Secrets sei unabhängig nachgewiesen. Der Zugang erhält beim Secret-Übergabe-Endpunkt HTTP 403; kein API-Schlüssel steht im lokalen Prozess zur Verfügung. Deshalb fehlt weiterhin der **private Adressvergleich** mit dem bestehenden Brevo-Kontakt. Ein Brevo-Export wird dafür nicht benötigt.

Ein neues privates Paket enthält exakt 137 angemeldete Kandidaten (135 regulär, zwei intern, fünf Käufer), feste Ziel-IDs 4/5/6 und die konservative Importpolicy. Alle 13 Nicht-Abonnenten sind ausgeschlossen. Gzip/Base64-Payload: 6.236 Byte, lokal mit `0600` außerhalb von Git, Roundtrip validiert. Base64 ist keine Verschlüsselung; Datei und Übergabe bleiben privat. Originaldatei und ursprüngliche CSVs unverändert. Private Downloads werden ausschließlich im bestätigten Owner-Bereich bereitgestellt; unbegrenzte Speicherung wird nicht zugesagt.

**Einmaliger Betreiber-Schritt:** vollständigen privaten Payload als Repository-Actions-Secret `BREVO_IMPORT_PAYLOAD` hinterlegen. Danach kann Actions den Bestandsabgleich selbst ausführen. Keine weiteren Import-Secrets, API-Schlüsselexporte oder dauerhaft manuellen CSV-Importe. Details: [API-EXECUTION.md](API-EXECUTION.md).

Aktive Automationen sind weiterhin nicht tatsächlich vollständig geprüft. Im aktuellen Arbeitszugang stehen keine Automationsscreenshots zur Verfügung. Zusätzlich benötigt wird nur **Automatisierungen → Workflows → Aktiv**, einschließlich klassischer Workflows/aller Seiten; bei aktiven Workflows deren Eintrittstrigger und Kontaktfilter. Nachweis an exakten privaten Payload und höchstens 24 Stunden alten tatsächlichen Prüfzeitpunkt binden. Keine automatischen Prüfaussagen und keine pauschale Deaktivierung.

Separater Newsletter-Ausführungsweg vorbereitet, noch nicht auf main aktiviert: manuelle Entwurfs-/Versionsprüfung, geschützter Vorabtest, separate geschützte Hauptfreigabe und dauerhafte Reservierungen ohne personenbezogene Daten. GitHub liefert beim Einrichten der benötigten Review-Umgebung ebenfalls HTTP 403. Keine vorhandene Review-Umgebung eingerichtet, keine Entwürfe, keine Tests oder Newsletter gesendet. Ein einmaliger Owner-Review-Gate-Schritt ist daher zusätzlich für den **späteren Versand**, nicht den Import, erforderlich.

## Tatsächlicher weiterer Stand

| Gegenstand | Belegter Stand |
|---|---|
| Tarif | free; keine Buchung oder Tarifänderung |
| VU-Merkmale | 10 von 10 vorhanden, keine Typkonflikte |
| Kontaktinventar | 1 bestehender Kontakt; privater Abgleich mit Shopify-Dateien weiterhin offen |
| Einwilligung/Sperren | Audit vom 10. Oktober: globale E-Mail-Sperre false, keine protokollierte Abmeldung, Listen-Abmeldedaten nicht geliefert und VU-Einwilligung ungeklärt; keine Anmeldung daraus abgeleitet |
| Interne Testempfänger | eindeutig privat vorbereitet; noch nicht als VU-Testkontakte eingerichtet |
| Segmente | 0; Käufersegment weiterhin in der UI anzulegen |
| Absender | 1, aktiv laut API; Adresse bleibt privat |
| Domain | 1 registriert; Bestätigung und Authentifizierung fehlen laut aktuellem Audit |
| DNS-Werte | am 10. Oktober tatsächlich abgerufen und ausschließlich privat bereitgestellt; keine DNS-Änderung |
| Aktive Automationen | tatsächliche vollständige Prüfung weiterhin über Brevo-UI erforderlich |
| Kontaktimport / Newsletter- und Testversand | nicht durchgeführt |

135 reguläre Kontakte und zwei interne Testkontakte sind vorbereitet; 13 Nicht-Abonnenten bleiben auf ausdrücklichen Wunsch zurückgestellt. Insgesamt sechs Käufer, davon einer nicht angemeldet. Der Bestands-/Sperrenabgleich, die tatsächliche Automationsprüfung und die Kontozuordnung/Listenansicht müssen vor jedem Import abgeschlossen sein. Alle 150 Kontakte bleiben zurückgestellt. Keine Bestandskontakte in die App-Warteliste übernehmen und keine vorhandenen Sperren oder Abmeldungen aufheben.

## Bereits behobener HTTP 403 und Vorlagenstand

Der erste [Audit 37934324872](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37934324872) meldete HTTP 403 ohne Endpoint-Angabe. Die frühere Zuordnung zu `/account` war nicht belegt. Die gezielte Diagnose bestätigte `/account` mit HTTP 200 und `/senders` mit 403 / Cloudflare 1010. Der explizite `User-Agent: VisionUniverse-Brevo/1.0` behob die Client-Signatur-Sperre; diese Korrektur ist mit PR 545 bereits auf `main` wirksam. Keine Schlüsselrotation oder Änderung der IP-/DNS-Konfiguration war dafür erforderlich.

Die E-Mail-Vorlage liegt als `newsletter.html.tmpl` vor, damit der vorhandene Website-Navigations-Sync kein CSS/JavaScript hineinschreibt. Die privaten manuellen CSVs verwenden Brevos dokumentierte Boolean-Werte `Yes`/`No`; Originalexport und private API-JSON bleiben außerhalb des Repositories. Es gibt keinen freigegebenen Newsletter-Inhalt und keine Versandfreigabe.

Private CSVs, DNS-Werte, Downloadreferenzen und personenbezogene Prüfberichte gehören nicht in dieses öffentliche Dokument. Ein bestätigter privater Upload ist keine Zusage unbegrenzter Aufbewahrung. Die genaue Spaltenzuordnung und verbleibenden Importbedingungen stehen in der [README](README.md#verbleibende-schritte-in-brevo--in-dieser-reihenfolge).
