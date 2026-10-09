# Vision Universe: eigenständiges Brevo-System

Diese Integration verwaltet ausschließlich Newsletter und Kontakte in Brevo. Sie ändert keine Website, Landingpage, DNS-Zone, Shopify-Verbindung, Research-Funktion oder bestehende Automationen. Python 3, Standardbibliothek, offizielle Brevo-v3-REST-Schnittstellen; keine neue Plattform, KI-API oder kostenpflichtige Funktion.

## Tatsächlicher Stand am 9. Oktober 2026

**Import vorbereitet, noch nicht durchgeführt.** Kein Brevo-API-Aufruf und kein E-Mail-Versand wurden ausgeführt. Die Umgebung besitzt keinen Brevo-Schlüssel. Der Owner hat das vorhandene Actions-Secret `BREVO_API_KEY` benannt; dessen Existenz konnte wegen fehlender Berechtigung zur Secret-Metadatenabfrage nicht unabhängig bestätigt werden. Der Schlüssel wird niemals ausgelesen, zurückgeliefert, persistiert oder protokolliert.

Ein neuer `workflow_dispatch`-Workflow wird erst verfügbar, wenn seine Definition auf dem Standardbranch liegt. Der Auftrag erlaubt keinen Merge. Es gibt auf `main` keinen vorhandenen Brevo-Workflow. Bestehende Research-Workflows werden nicht als Ersatz für beliebige API-Aufrufe verändert oder zweckentfremdet. Es ist kein geschützter CSV-Transfer zu Actions eingerichtet; Kontaktdaten werden weder als Workflow-Input noch als Secret, Git-Datei, Cache oder Actions-Artefakt übertragen.

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

Brevo-Tarif, vorhandene Listen/Segmente, Automationen, Absender, Unternehmensangaben und Domainstatus sind mangels Live-Zugang **ungeprüft**. Es wurden keine Listen oder Segmente im Konto eingerichtet. Versandbereitschaft besteht derzeit nicht.

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

Die private Testzuordnung enthält `test_1` und `test_2`, jeweils mit `first_name` und `last_names` (Liste ausdrücklich belegter Schreibweisen). Namen und Adressen stehen ausschließlich in privaten Dateien, nicht im Integrationscode. Alle erzeugten Dateien liegen außerhalb des Repositories und erhalten `0600`; der Ablageordner erhält bei Erstellung `0700`. Ausgabe: nur Zählwerte. Kein Kontaktinhalt wird geloggt. Drei CSV-Dateien sind für einen **manuellen Import ausschließlich neuer Kontakte** vorbereitet:

| Datei | Anzahl | Ziel |
|---|---:|---|
| `newsletter-new-only.csv` | 135 | `VU | Newsletter` |
| `non-subscribers-new-only.csv` | 13 | ohne Newsletter-/Wartelisten-Zuordnung; E-Mail beim Import blockieren |
| `tests-new-only.csv` | 2 | ausschließlich `VU | Newsletter-Test` |

Die CSVs enthalten personenbezogene Daten. Keine Git-Commits, öffentlichen PR-Inhalte, Issues, Actions-Logs oder Actions-Artefakte. Die JSON enthält dieselben vorbereiteten Kontakte und die interne Zuordnung; nur privat verwenden. Die Export-Prüfsumme in der privaten JSON bindet die Vorbereitung an die unveränderte Quelle. Private Importprotokolle aus Brevo ebenfalls nicht öffentlich ablegen.

## Verbleibende Schritte in Brevo – in dieser Reihenfolge

1. Der Owner muss den PR separat prüfen und übernehmen, wenn der Workflow genutzt werden soll. Dieser Auftrag führt keinen Merge aus. Danach Actions → **„Brevo | Prüfung und Struktur (kein Versand)“** → Run workflow → `audit`, anschließend `setup`. Beide Optionen senden keine E-Mail und importieren keine Kontakte. Der erste Lauf prüft die Existenz/Funktion des Secrets praktisch. Falls der Tarif nicht als `free` bestätigt wird, stoppt `setup`; es wird weder umgebucht noch gekauft. Alternativ dieselben Listen und Merkmale manuell in Brevo anlegen, ohne Zugangsschlüssel an Codex zu übergeben.
2. **Vor jedem Kontaktimport sämtliche aktiven Brevo-Automationen in der UI prüfen**: Eintritt bei Kontaktanlage, Merkmalsänderung, Listenzugang, globaler Zielgruppe, Welcome-/DOI-/Kauf-Flows. Der normale Brevo-v3-Client bietet keine vollständige Auflistung dieser Marketingautomationen und keinen verlässlich dokumentierten globalen Import-Schalter zur Unterdrückung. `disableNotification` betrifft eine Importbenachrichtigung und ist keine Automationsunterdrückung. Keine Automationen pauschal deaktivieren. Wenn irgendein Importereignis eine bestehende Automation auslösen kann und keine sichere vorhandene Ausschlussregel besteht: **Import nicht ausführen**, genaue betroffene Automation/Trigger privat festhalten. Die Integration bleibt gesperrt.
3. Wenn Schritt 2 nachweislich sicher ist: Brevo → Kontakte → **Kontakte importieren → Datei hochladen**, vorbereitete CSV wählen, `EMAIL` auf E-Mail und alle `VU_*`-Spalten auf gleichnamige Merkmale zuordnen. **Aktualisierung bestehender Kontakte ausschalten**; bestehenden Status, Sperren und Einwilligungen nicht ändern. Falls die Oberfläche das Ignorieren bestehender Kontakte nicht eindeutig erlaubt, anhalten. So werden vorhandene Sperren nicht überschrieben. `newsletter-new-only.csv` der Hauptliste, `tests-new-only.csv` nur der Testliste zuordnen. `non-subscribers-new-only.csv` ohne Haupt-/Test-/Warteliste importieren und diese neuen Kontakte im Import für E-Mail-Kampagnen blockieren. Falls der UI-Importer zwingend eine Zielliste verlangt oder die E-Mail-Sperre nicht eindeutig anbietet, diesen dritten Teil anhalten und den privaten API-Upsert verwenden. Keine zusätzliche Dauerliste zur Vereinfachung erzeugen.
4. **Vorhandene Kontakte sind im manuellen neuen-only-Import bewusst übersprungen.** Ein vollständiger Abgleich benötigt den privaten API-Upsert oder eine individuelle Prüfung vorhandener Kontakte in Brevo. Besonders die beiden internen Kontakte: vorhandene Sperren beibehalten, `VU_INTERNAL_TEST=true` setzen, Testliste zuordnen, aus der eigenen Hauptliste austragen. Bei Sperre keinen Testversand ermöglichen. Kein erneutes Anmelden aus dem Export erzwingen. Importsummen und vorhandene/übersprungene Kontakte im privaten Brevo-Importbericht kontrollieren; die Zahlen oben sind Vorbereitung, keine importierten Mengen.
5. Käufersegment wie oben anlegen. Stichproben zu Bestellzahl, Namen, Tags und Einwilligung prüfen. Hauptliste, Testliste, leere App-Warteliste und blockierte Kontakte kontrollieren. Einen wiederholten Import mit ausgeschalteten Updates darf es ohne neue Kontaktanlage geben; beim API-Upsert wird der unveränderte Zustand ohne erneute Updates übersprungen.
6. Brevo → Einstellungen → Absender/Domains: vorhandenen Absender wählen, Bestätigung und authentifizierte Domain prüfen. Fehlende Absenderbestätigung über die Brevo-UI durchführen. Die von Brevo tatsächlich angegebenen DNS-Records für Brevo-Code/DKIM/ggf. DMARC privat dokumentieren. **Es liegen derzeit keine abgerufenen DNS-Werte vor.** Keine geratenen Werte verwenden, keine DNS-Änderung in diesem Auftrag, keine bestehenden SPF/DKIM/DMARC/MX-Einträge pauschal ersetzen. Ein vorhandener sicherer Server kann `cli.py domain --domain DOMAIN --out /PRIVAT/domain.private.json` nutzen; Ausgabe enthält keine Domain-/Kontaktdaten, die Datei enthält die tatsächliche API-Konfiguration.
7. Verifizierte Absender-ID und Unternehmensname/Postanschrift ergänzen; freigegebenen Newsletter-Inhalt bereitstellen. Vorlage allein ist kein freigegebener Newsletter. Die Vorlage verweist auf das vorhandene Original-Logo in einem fest gepinnten öffentlichen Repository-Commit, nutzt Weiß/Schwarz, Inter mit E-Mail-Fallbacks, mobile Schriftgrößen und den Brevo-Abmeldelink `{{ unsubscribe }}`. Keine Rechts-/Unternehmensangaben oder Aussagen werden erfunden.

## Privater API-Import – nur mit vorhandenem sicheren Serverzugang

Kein zusätzlicher Server wurde eingerichtet. Keine Übertragung des Schlüssels aus Actions. Falls später bereits ein geeigneter sicherer Prozess existiert, kann er `BREVO_API_KEY` direkt aus seiner Secretverwaltung verwenden. Keine Schlüsseldatei oder Kommandozeilenwerte.

Der private Automationsprüfbericht muss enthalten: `reviewed_at` (ISO-8601 mit Zeitzone, maximal 24 Stunden alt), `source_sha256` aus der vorbereiteten JSON, `list_ids` (Zuordnung aller drei Namen zu den realen IDs), `all_active_automations_checked=true`, `no_contact_create_update_or_list_entry_triggers=true`, `reviewer`, `evidence_note`. Diese Aussagen müssen auf einer tatsächlichen UI-Prüfung beruhen; sie dürfen nicht automatisch vorausgefüllt werden. Der aktuelle Auftrag erzeugt **keinen** solchen Nachweis.

```bash
python3 scripts/brevo/cli.py import \
  --prepared /PRIVAT/shopify-prepared.private.json --review /PRIVAT/automation-review.private.json
```

## Verbindlicher Vorabtest und konkrete Versandfreigabe

Es gibt **keinen** Versandworkflow mit automatisch zugänglichem Actions-Secret. `brevo-admin` erlaubt nur Audit/Setup. Alle Import-, Kampagnen- und Versandbefehle sind in Actions gesperrt, solange kein privater dauerhafter Zustand und geschützter Übergabeweg eingerichtet sind. Ein Actions-Cache oder herunterladbares Artefakt wird nicht als Senderegister verwendet.

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

Der private Zustand wird mit Dateisperre, `0600`, atomarem Austausch und `fsync` **vor** jedem mutierenden Kampagnenaufruf dauerhaft geschrieben. Wiederholungen derselben Inhaltsversion erstellen keinen zweiten Entwurf/Test; ein reservierter Produktionsversand blockiert alle Wiederholungen. Netzwerk-/API-Fehler lassen den Zustand `pending`, blockieren Freigabe und Wiederholung und müssen anhand der Brevo-Historie manuell geklärt werden. Kein automatischer Retry nach unbekanntem Versandausgang. Zustand nicht löschen, teilen oder auf mehrere unabhängige Hosts kopieren; genau eine maßgebliche private Ablage und ein Prozessstandort.

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
