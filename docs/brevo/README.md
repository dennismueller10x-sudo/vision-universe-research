# Vision Universe: eigenständiges Brevo-System

Diese Integration verwaltet ausschließlich Newsletter und Kontakte in Brevo. Sie ändert keine Website, Landingpage, DNS-Zone, Shopify-Verbindung, Research-Funktion oder bestehende Automationen. Python 3, Standardbibliothek, offizielle Brevo-v3-REST-Schnittstellen; keine neue Plattform, KI-API oder kostenpflichtige Funktion.

Der [Merge-Prüfbericht](MERGE-REVIEW.md) dokumentiert die Prüfung vor dem Merge. Der [Live-Status](LIVE-STATUS.md) enthält den belegten aktuellen Kontostand, Setup-/Lese-Nachweise und die Grenzen des Oberflächenabgleichs. Ein Merge startet keinen Brevo-Lauf.

## Tatsächlicher Stand am 12. Oktober 2026

**Import vorbereitet, noch nicht durchgeführt.** PR 544 und [PR 545](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/545) sind gemergt. Der explizite `User-Agent: VisionUniverse-Brevo/1.0` ist auf `main` wirksam. Der [reguläre Audit vom 12. Oktober](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38233376781) bestätigt den kostenlosen Tarif, einen bestehenden Kontakt, zehn kompatible VU-Merkmale, einen aktiven Absender, eine noch unbestätigte/nicht authentifizierte Domain und keine Segmente.

Die Listenanlage ist durch den erfolgreichen [Setup-Lauf vom 10. Oktober](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38061539873) und den [anschließenden API-Leseabgleich](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38061582213) belegt. Der erneute [Konto-/Ordner-Audit vom 12. Oktober](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38234286301) bestätigt jede Liste sowohl im vollständigen Listeninventar als auch über den Einzelabruf und den Ordnerabruf:

| Liste | ID | Ordner | Kontakte |
|---|---:|---|---:|
| VU \| Newsletter | 4 | Vision Universe, ID 3 | 0 |
| VU \| App-Warteliste | 5 | Vision Universe, ID 3 | 0 |
| VU \| Newsletter-Test | 6 | Vision Universe, ID 3 | 0 |

Der private Vergleich mit der vom Owner genannten Kontobezeichnung ist kompatibel: Die API-Unternehmensbezeichnung unterscheidet sich nur durch einen Rechtsform-/Schreibzusatz. Das allein beweist weder ein anderes Konto noch die Identität der aktiven Browser-Sitzung. Kontoadresse, vollständige Identitätswerte und Rohantworten werden nicht ausgegeben. Ein aktiver Oberflächenfilter ist über die API nicht einsehbar und daher **nicht als Ursache nachgewiesen**. Die drei Listen liegen im spezifischen Ordner „Vision Universe“, ID 3.

Der Owner bestätigt inzwischen sichtbare leere Listen 4, 5 und 6. Der Listenabgleich ist abgeschlossen; keine neue Liste und kein erneutes Setup nötig.

Der aktuelle Auftrag verlangt **API-Import statt dauerhaft manuellem CSV-Import**. Die bestehende Actions-Secret-Übergabe wird verwendet: ein privates Paket enthält 135 reguläre Kandidaten und zwei interne Testkandidaten, keine Nicht-Abonnenten. Der tatsächliche [Import-Preview 38251453506](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38251453506) stoppte vor Kontaktabgleich/Mutation: Übergabe-Secret fehlt oder überschreitet das Limit. Der Codex-Zugang erhält am Actions-Secret-Übergabe-Endpunkt HTTP 403. Ein Betreiber muss den vorbereiteten privaten Payload einmal als `BREVO_IMPORT_PAYLOAD` hinterlegen. Kein erneuter Brevo-Export und kein manueller Brevo-Import erforderlich. Siehe [genauer API-Betriebsweg](API-EXECUTION.md).

| Prüfung des beigefügten Shopify-Exports | Ergebnis |
|---|---:|
| Datensätze geprüft | 150 |
| Gültige eindeutige E-Mail-Adressen | 150 |
| Zusammengeführte Duplikate | 0 |
| Ungültige Adressen / ungeklärte Einwilligungen | 0 / 0 |
| Ausdrücklich angemeldet (`yes`) | 137 |
| Nicht angemeldet (`no`) | 13 |
| Reguläre Abonnenten nach Abzug interner Tests | 135 |
| Käufer mit belegten Bestellungen | 6 |
| Nicht angemeldete Käufer | 1 |
| Datensätze mit Tags | 146 |
| Importiert | 0 |
| Wegen fehlender Live-Prüfung zurückgestellt | 150 |

Die Datei ist UTF-8 ohne BOM, mit 21 Spalten. Alle ursprünglichen Spalten wurden geprüft; die Originaldatei bleibt unverändert außerhalb des Repositories. Der Export enthält keine Einwilligungszeitpunkte und keine Double-Opt-in-Nachweise. `yes` wird als ausdrücklich ausgewiesene Anmeldung behandelt, nicht als erfundener DOI-Nachweis. Käuferstatus beruht allein auf `Total Orders > 0`; Ausgaben, Notizen, Telefonnummern und Straßenadressen werden zur Datenminimierung nicht übernommen. Namen, Land, Shopify-IDs, Bestellzahl und sechs vorhandene Tags werden übernommen. Tags sind kein Einwilligungsnachweis.

Beide internen Testpersonen sind jeweils einem eindeutigen Exportkontakt zugeordnet. Ihre Adressen wurden privat vorbereitet, in Brevo aber noch nicht eingerichtet. Beide Kontakte sind im Export angemeldet und Käufer. Sie werden vom regulären Newsletter ausgenommen. Es ist keine Rückfrage nach Adressen erforderlich.

Tarif, Listen-/Ordnerzuordnung und Merkmals-Zählwerte sind live geprüft, siehe [Live-Status](LIVE-STATUS.md). Der Kontaktstatus-Audit vom 10. Oktober meldete einen nicht global gesperrten bestehenden Kontakt, aber fehlende Listen-Abmeldedaten und ungeklärte VU-Einwilligung; der private Adressabgleich bleibt offen. Aktive Automationen und verifizierte Unternehmensangaben für die Vorlage fehlen weiterhin. Eine Domain ist in Brevo registriert, aber nicht bestätigt oder authentifiziert; konkrete DNS-Werte wurden am 10. Oktober ausschließlich privat bereitgestellt. Ein Käufersegment existiert noch nicht. Versandbereitschaft besteht nicht.

## Struktur und Einwilligungsschutz

`setup` prüft zuerst den kostenlosen Tarif, bestehende Listen und Merkmalsdefinitionen. Passende Listen werden nach exakt übereinstimmendem Namen wiederverwendet. Mehrdeutige Namen und inkompatible Merkmalstypen blockieren; nichts wird gelöscht. Fehlende Listen entstehen im Ordner „Vision Universe“:

- `VU | Newsletter`: nur angemeldete Kontakte; interne Testkontakte ausgeschlossen.
- `VU | App-Warteliste`: bleibt beim Shopify-Import leer; später nur ausdrückliche App-Anmeldungen.
- `VU | Newsletter-Test`: beide internen Empfänger, keine normale Newsletter-Mitgliedschaft.

| Merkmal | Typ | Bedeutung |
|---|---|---|
| `VU_SOURCE` | text | `Shopify-Bestand` |
| `VU_EMAIL_CONSENT` | text | `subscribed`, `not_subscribed`, `unclear`; vorhandene `withdrawn`/`blocked` bleiben geschützt |
| `VU_BUYER` | boolean | belegter Käuferstatus, unabhängig von Einwilligung |
| `VU_INTERNAL_TEST` | boolean | interner Testkontakt |
| `VU_FIRSTNAME`, `VU_LASTNAME`, `VU_COUNTRY` | text | vorhandene Namen und Land; keine erfundenen Werte |
| `VU_SHOPIFY_IDS`, `VU_TAGS` | text | eindeutige IDs/Tags zusammengeführt |
| `VU_SHOPIFY_ORDERS` | float | höchste belegte Bestellzahl pro Kontakt, keine Addition von Exportduplikaten |

Ein dynamisches Segment **„VU | Käufer“** ist in der Brevo-Oberfläche mit `VU_BUYER = true` anzulegen bzw. ein entsprechendes bestehendes Segment wiederzuverwenden. Es enthält auch Käufer ohne Newsletter-Anmeldung und darf deshalb nicht direkt als Newsletter-Zielgruppe dienen. Bei Bedarf **„VU | Newsletter-Käufer“** als UND-Verknüpfung: `VU_BUYER = true`, `VU_EMAIL_CONSENT = subscribed`, `VU_INTERNAL_TEST != true`, E-Mail nicht blockiert. Kampagnen können diese Segment-ID statt der Hauptliste verwenden. Die Integration prüft die tatsächlichen Kontakte der Zielgruppe und schließt die Testliste ausdrücklich aus.

Die aktuelle offizielle API kann Segmente auflisten und als Kampagnenziel auswählen; eine dokumentierte Schnittstelle zum Anlegen dynamischer Kontaktsegmente wurde im offiziellen Client nicht gefunden. Deshalb ist ihre Erstellung als konkreter UI-Schritt vorgesehen, ohne private oder undokumentierte Endpunkte.

Normalisierung: äußere Leerzeichen entfernen, ASCII-Mailboxsyntax prüfen, Groß-/Kleinschreibung für den Dublettenvergleich vereinheitlichen. Plus-Aliase und Punkte bleiben erhalten; keine Providerannahmen. Bei widersprüchlichem Status wird `unclear` gesetzt. Namenskonflikte werden nicht willkürlich aufgelöst. Fehlende Daten ändern keine Einwilligung in eine Anmeldung.

Der private API-Upsert liest bestehende Kontakte vor jeder Mutation. Er setzt für bestehende Kontakte niemals `emailBlacklisted=false` und überschreibt keine SMS-/WhatsApp-Einwilligung oder Sperre. Vorhandene VU-Abmeldungen/Unklarheiten werden nicht durch ein älteres Shopify-`yes` aufgewertet. Bestehender Käuferstatus und höhere Bestellzahlen bleiben erhalten. Ein nicht berechtigter Kontakt wird ausschließlich aus der eigenen Newsletter-Liste ausgetragen; fremde Mitgliedschaften, Kontakte und Listen bleiben bestehen. Für neue nicht angemeldete Kontakte wird die E-Mail-Sperre gesetzt. Jeder Upsert wird erneut gelesen und geprüft. Wiederholungen erstellen keine zusätzlichen Kontakte und führen bei unverändertem Zustand keine Updates aus.

## Geschützte Importvorbereitung

```bash
python3 scripts/brevo/prepare.py /ABSOLUTER/PRIVATER/PFAD/shopify.csv \
  --out /ABSOLUTER/PRIVATER/PFAD/shopify-prepared.private.json \
  --test-identities /ABSOLUTER/PRIVATER/PFAD/test-identities.private.json \
  --csv-dir /ABSOLUTER/PRIVATER/PFAD
```

Die private Testzuordnung enthält `test_1` und `test_2`, jeweils mit `first_name` und `last_names` (Liste ausdrücklich belegter Schreibweisen). Namen und Adressen stehen ausschließlich in privaten Dateien, nicht im Integrationscode. Alle erzeugten Dateien liegen außerhalb des Repositories und erhalten `0600`; der Ablageordner erhält bei Erstellung `0700`. Ausgabe: nur Zählwerte. Kein Kontaktinhalt wird geloggt. Drei CSV-Dateien sind für einen **manuellen Import ausschließlich nachweislich neuer Kontakte** vorbereitet. Die Dateinamen belegen nicht, dass die Kontakte in Brevo fehlen; dieser Abgleich steht noch aus. Boolean-Spalten werden nach dem offiziellen CSV-Format mit `Yes`/`No` geschrieben; die private API-JSON behält echte boolesche Werte:

| Datei | Anzahl | Ziel |
|---|---:|---|
| `newsletter-new-only.csv` | 135 | `VU | Newsletter` |
| `non-subscribers-new-only.csv` | 13 | ohne Newsletter-/Wartelisten-Zuordnung; E-Mail beim Import blockieren |
| `tests-new-only.csv` | 2 | ausschließlich `VU | Newsletter-Test` |

Die CSVs enthalten personenbezogene Daten. Keine Git-Commits, öffentlichen PR-Inhalte, Issues, Actions-Logs oder Actions-Artefakte. Die JSON enthält dieselben vorbereiteten Kontakte und die interne Zuordnung; nur privat verwenden. Die Export-Prüfsumme in der privaten JSON bindet die Vorbereitung an die unveränderte Quelle. Private Importprotokolle aus Brevo ebenfalls nicht öffentlich ablegen.

## Automatisierter Import und tatsächliche Voraussetzungen

1. Privaten Download einmal als Repository-Actions-Secret `BREVO_IMPORT_PAYLOAD` hinterlegen; `BREVO_API_KEY` bleibt unverändert im Runner. Keine Schlüsselübertragung, neuen Plattformen oder weiteren verschlüsselten Import-Secrets.
2. `brevo-admin` auf `main`, Operation `import-preview`: jeden Kandidaten über die API privat mit dem Bestand vergleichen, nur Zählwerte ausgeben. Der Abgleich ist bislang **nicht erfolgt**, weil der tatsächlich ausgeführte Preview vor dem Lesen der Importdaten gesperrt wurde.
3. Brevo → Automatisierungen → Workflows → Aktiv, einschließlich klassischer Workflows und aller Seiten: tatsächlichen Status prüfen. Bei aktiven Workflows jeweils Eintrittstrigger und Kontaktfilter lesen. Kein Import, falls Anlage, Attributänderung oder Listenzugang einen Versandflow auslösen kann. Keine fremden Automationen deaktivieren. Ein Listen-Screenshot belegt keine Automationssicherheit. Aktuell sind keine Automationsscreenshots im Arbeitszugang verfügbar.
4. Nach Code-Merge und tatsächlichem Nachweis: `import` mit maximal 24 Stunden altem Prüfzeitpunkt, SHA256 des privaten Nachweises, exakt passendem `prepared_sha256` und beiden bestätigten Prüfaussagen ausführen. Ein zusätzlicher Review-Secret-Upload ist dafür nicht nötig. Prüfaussagen niemals aus bloßer Importfreigabe oder leerer Liste ableiten.
5. Aktuelle Policy `subscribers_new_or_unchanged_v1`: nur neue ausdrücklich angemeldete Kontakte anlegen (`updateEnabled=false`), Ziel-IDs an private Konfiguration binden, Namen/Merkmale/Käuferstatus übernehmen. Jeder vorhandene unklare, gesperrte, abweichende oder noch nicht passend eingerichtete Treffer bleibt **vollständig unverändert** zurückgestellt. Exakt bereits importierte Kontakte ohne Änderungen überspringen. Keine vorhandene Anmeldung, Sperre oder Mitgliedschaft überschreiben. API-Kollisionen stoppen, kein automatischer Retry.
6. Ziel: regulär ausschließlich Liste 4, intern ausschließlich Liste 6. Liste 5 nicht verwenden; alle 13 Nicht-Abonnenten sind ausgeschlossen. Neue Kontakte nach jedem POST privat zurücklesen; nur anonymisierte Zählwerte protokollieren. Vorbereitungsmengen sind keine zugesicherten Importmengen.
7. Käufersegment wie oben separat vorbereiten. Vor Versand Domain/Absender und Unternehmensangaben verifizieren. Tatsächliche DNS-Werte bleiben privat; keine DNS-Änderung und kein Bestätigungsversand in diesem Auftrag.

CSV-Dateien bleiben als private ursprüngliche Übergabe erhalten; sie sind nicht der dauerhafte Ausführungsweg. Die unveränderte Originaldatei bleibt außerhalb von Git. Die geschützte API-Übergabe enthält weder den API-Schlüssel noch erfundene DOI-/Einwilligungszeiten.

## Verbindlicher Vorabtest und konkrete Versandfreigabe

`brevo-admin` bleibt ohne Kampagnen-/Versandendpunkte. Der separate neue manuelle Workflow `brevo-newsletter.yml` benötigt nach seinem Code-Merge zusätzlich eine verpflichtende Owner-Review-Umgebung und ein dauerhaftes, personenbezogen datenfreies Versandregister. Entwurf, Prüfen, Vorabtest und Hauptversand sind getrennte Operationen; es gibt keinen automatischen Versand nach Merge, Import oder Testerfolg. Der genaue Einrichtungsschritt und Ablauf stehen in [API-EXECUTION.md](API-EXECUTION.md). Diese Erweiterung ist vorbereitet, **noch nicht live erprobt oder auf main aktiviert**.

Actions nutzt keine Kontaktdateien, Caches oder herunterladbaren Artefakte. Der Branch `brevo-newsletter-state` enthält ausschließlich numerische IDs, Inhaltsversionen und Reservierungen sowie eine mit privatem Zufallsschlüssel gebundene Testkennung. Keine E-Mail-Adressen, Namen, Inhalte, Betreffzeilen oder ungeschützten Adresshashes. CAS-Sicherung vor jedem irreversiblen API-Aufruf und globale Concurrency verhindern Wiederholungen über Runner-Neustarts hinweg. Das Register niemals löschen/zurücksetzen. GitHub-API-Commits betreffen nur diesen separaten Branch; kein Checkout-Push auf main oder die Research-Daten.

Für einen späteren vorhandenen sicheren Prozess: private Konfiguration `0600` mit `test_addresses_confirmed=true`, `test_addresses` (die zwei eindeutigen Adressen unter den neutralen Kennungen `test_1`/`test_2`), optional `audience_segment_id`. Diese Konfiguration ist vorbereitet außerhalb des Repositories. Die Content-JSON benötigt `name`, `sender_id`, `subject`, `preheader`, `intro`, `items` (ein bis drei Objekte mit `title`/`text`), `cta_text`, `cta_url`, `company_name`, `company_address`, `company_details_verified=true`. Keine Adressen in öffentlichen Konfigurationsdateien.

```bash
# Entwurf ohne Termin und ohne Versand; Inhalt muss separat freigegeben sein.
python3 scripts/brevo/cli.py draft --config /PRIVAT/config.private.json \
  --content /PRIVAT/content.private.json --state /PRIVAT/campaign-state.private.json

# NUR nach ausdrücklicher Freigabe dieses konkreten Testversands:
python3 scripts/brevo/cli.py test --config /PRIVAT/config.private.json \
  --state /PRIVAT/campaign-state.private.json --campaign-id ID --authorize-send

# Zeigt Kampagnen-ID und Versionshash, keine Empfängeradressen.
python3 scripts/brevo/cli.py check --config /PRIVAT/config.private.json \
  --state /PRIVAT/campaign-state.private.json --campaign-id ID

# NUR nach ausdrücklicher Owner-Freigabe dieser Produktionskampagnenversion:
python3 scripts/brevo/cli.py send --config /PRIVAT/config.private.json \
  --state /PRIVAT/campaign-state.private.json --campaign-id ID \
  --approval /PRIVAT/approval.private.json --authorize-send
```

Die private Freigabe enthält `campaign_id`, den aktuellen `version`-Hash aus `check`, `explicit_owner_approval=true` und `approval_reference` (Verweis auf die tatsächliche ausdrückliche Owner-Anweisung). Ein Programm darf diese Freigabe nicht aus dem bloßen Testerfolg erzeugen. Im aktuellen Auftrag existiert keine Freigabe für Test oder Produktion, und kein Sendebefehl wurde ausgeführt.

Offizieller Vorabtest: `POST /v3/emailCampaigns/{id}/sendTest` mit genau den beiden ausdrücklich konfigurierten Adressen, niemals mit leerer Empfängerliste. Absender-/Domainprüfung, eingerichtete Testkontakte, Listentrennung und tatsächliche Zielgruppen-Einwilligungen sind Voraussetzungen. Der Produktionsentwurf bleibt beim Test unverändert und ungesendet. Subject, HTML, Preheader, Absender, Zielgruppe und sämtliche weiteren Konfigurationsfelder werden versioniert. Änderungen benötigen einen neuen Test; ein alter Test oder eine alte Freigabe genügt nicht.

Beim vorhandenen lokalen Serverweg wird der private Zustand mit Dateisperre, `0600`, atomarem Austausch und `fsync` **vor** jedem mutierenden Kampagnenaufruf dauerhaft geschrieben. Wiederholungen derselben Inhaltsversion erstellen keinen zweiten Entwurf/Test; ein reservierter Produktionsversand blockiert alle Wiederholungen. Netzwerk-/API-Fehler lassen den Zustand `pending`, blockieren Freigabe und Wiederholung und müssen anhand der Brevo-Historie manuell geklärt werden. Kein automatischer Retry nach unbekanntem Versandausgang. Zustand nicht löschen, teilen oder auf mehrere unabhängige Hosts kopieren; genau eine maßgebliche private Ablage und ein Prozessstandort.

Eine erfolgreiche API-Annahme ist **kein Zustellnachweis**. Beide Testempfänger sollen den tatsächlichen Test prüfen; erst anschließend kann der Owner konkret freigeben. CLI-Freigaben sind ein Prozess für autorisierte Betreiber, keine neue Brevo-Rollenverwaltung. Direkte Sendungen in der Brevo-UI oder mit anderen API-Clients können diese Schutzmechanismen umgehen; Brevo-Zugriff entsprechend begrenzen und Kampagnen während Prüfung/Versand nicht parallel bearbeiten. Brevo bietet keinen atomaren Compare-and-Send; Änderungen zwischen letzter Prüfung und Versand sind technisch nicht transaktional ausschließbar. Bis zur Live-Prüfung ist auch die Feldzuordnung des konkreten Kontos nicht als bestätigt zu behandeln.

## Validierung und offizielle Referenzen

```bash
python3 -m unittest discover -s scripts/brevo/tests -v
```

Tests nutzen ausschließlich synthetische Adressen unter `example.invalid`, temporäre private Dateien und einen Fake-Client. Geprüft werden unter anderem CSV-Konflikte, Alias-Erhalt, Einwilligungs-/Sperrenschutz, Wiederholung, fremde Mitgliedschaften, fehlende/stale Automationsprüfung, Testlisten-Ausschluss, Inhaltsänderungen, fehlende Freigabe und unsicherer Versandausgang. Kein Live-Aufruf in Tests; keine Forschungs-/Produktionsdaten werden geschrieben.

Offizielle Quellen, am 9. Oktober 2026 abgeglichen:

- [Brevo API-Referenz](https://developers.brevo.com/reference)
- [Aktueller offizieller Python-Client](https://github.com/getbrevo/brevo-python) und [Referenz](https://github.com/getbrevo/brevo-python/blob/main/reference.md)
- [Kampagnen-Endpunkte](https://github.com/getbrevo/brevo-python/blob/main/src/brevo/email_campaigns/raw_client.py): Erstellung, `sendTest`, `sendNow`
- [Kampagnenzielgruppe beim Erstellen](https://github.com/getbrevo/brevo-python/blob/main/src/brevo/email_campaigns/types/create_email_campaign_request_recipients.py) und [Zielgruppe beim Lesen](https://github.com/getbrevo/brevo-python/blob/main/src/brevo/types/get_campaign_recipients.py)
- [Kontakt-Endpunkte](https://github.com/getbrevo/brevo-python/blob/main/src/brevo/contacts/raw_client.py): Attribute, Listen, Upserts, Segmente
- [Domainkonfiguration](https://github.com/getbrevo/brevo-python/blob/main/src/brevo/domains/types/get_domain_configuration_response.py): `verified`, `authenticated`, `dns_records`

- [Offizielles CSV-Format einschließlich Boolean Yes/No](https://help.brevo.com/hc/en-us/articles/208729849-Create-a-file-to-import-your-contacts)
- [Manueller Kontaktimport und Auswirkungen der Optionen](https://help.brevo.com/hc/de/articles/115000719584-Deine-Kontakte-in-Brevo-importieren)
- [Import der E-Mail-Blocklist](https://help.brevo.com/hc/de/articles/5317230365074-Kontakte-einer-Blocklist-importieren)
