# Vision-Universe-Newsletter: eigene Oberfläche, Brevo-DOI-API

Das vorhandene Formular auf www.visionuniverse.de bleibt vollständig im Vision-Universe-Design. Es sendet per same-origin POST an **/api/newsletter/subscribe**. Ein schlanker Advanced-Mode-Worker im bestehenden Pages-Projekt **vision-universe** übernimmt Prüfung und Brevo-Aufruf. Kein Brevo-Formular, Iframe, CAPTCHA-Embed, D1 oder eigene Abmeldedatenbank. Schriften/Assets bleiben lokal.

## Belegter Zugriff und Einrichtung

[Erster Audit 38548517130](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38548517130): GitHub-Secret **BREVO_API_KEY** vorhanden, Free-Tarif, Absender/Domain bestätigt, Kontakte **Liste 4:135 / 5:0 / 6:2**. `CLOUDFLARE_API_TOKEN` kann das bestehende Pages-Projekt lesen; `LANDING_CLOUDFLARE_API_TOKEN` fehlt. Der separate DNS-Token kann keine Pages-Konfiguration lesen. Beide vorhandenen Tokens erhalten beim Lesen der WAF-Ratenregeln **403 / Code 10000**. Kein WAF-Schutz als vorhanden behauptet; keine Token-Rechte geändert, keine DNS-Änderungen.

Die native Vorlage **4** enthält `{{ doubleoptin }}` und passt **nicht** zum API-Endpunkt. Eine separate deutsche Vorlage **VU | Newsletter | DE | API Double Opt In | v1**, Betreff **Bestätige deine Anmeldung zum Vision-Universe-Newsletter**, verwendet `{{ params.DOIurl }}`. Vorlagen 1–4 bleiben unverändert. Erstellungs- und Pages-Secret-Lesebelege werden nach dem gesperrten Setup ergänzt. Kein Schlüssel wird zurückgeliefert, in Dateien geschrieben oder in Logs ausgegeben.

## Genau ein nötiger Kontoschritt für den echten Test

Im Arbeitszugang ist das Hinterlegen von GitHub-Secrets gesperrt: Abruf des Repository-Secret-Public-Key liefert **403 – Resource not accessible by integration**. Eine kontrollierte Testadresse fehlt; sie wird nicht geraten und keine Kundenadresse verwendet.

**GitHub → vision-universe-research → Settings → Secrets and variables → Actions → New repository secret:**

- Name **BREVO_DOI_TEST_EMAIL**.
- Wert **eine neue, von dir kontrollierte Testadresse**, die noch nicht bei Brevo existiert und zu keinem Kunden/Dennis/Ralf gehört.

Danach übernimmt der manuelle Setup-Lauf die Adresse ausschließlich als verschlüsseltes Preview-Secret. Bestehender Brevo-Schlüssel und Cache-Schlüssel werden mit vorhandenen Pages-Rechten serverseitig hinterlegt; kein neuer Cloudflare-Token, kein D1 und kein Brevo-Anmeldeformular nötig. Zugriff auf das Testpostfach bzw. dessen private Prüfung wird zusätzlich für Eingang/Inhalt/Klick benötigt; Passwort oder persönliche Links niemals in PRs/Logs/Artefakte geben. Dieser Kontoschritt ersetzt weder Postfachprüfung noch Datenschutzfreigabe.

## Ablauf und Bestandsschutz

Der Endpoint akzeptiert ausschließlich die echte www-Origin (Production) bzw. die bekannte Branch-Vorschau (Test). JSON oder nativer Formular-POST, maximal 4096 Byte, gültige Adresse, aktive Einwilligung, passende Textversion, leeres Honeypotfeld. Kein externer clientseitiger API-Aufruf und kein Key im Browser. Im Testmodus nur die geheime neue Testadresse; Produktion unterstützt keinen Testbypass.

Vor dem einzigen DOI-Aufruf wird Brevos Bestand privat gelesen. **Jeder vorhandene Kontakt bleibt unangetastet**, unabhängig von Liste, Käuferstatus, Newsletterstatus oder Sperre. Zusätzlich transaktionale Sperrlisten und bereits protokollierte DOI-Anfragen prüfen; unvollständige/fehlgeschlagene Abfragen stoppen den Versand. Plus-Aliase bleiben erhalten, keine anbieterspezifischen Adressänderungen. Kein `PUT /contacts`, kein Unblock, keine normale Kontaktanlage, kein `excludeListIds` und keine Übernahme in Listen 5/6.

Nur **POST /contacts/doubleOptinConfirmation**, `includeListIds:[4]`, passende API-Vorlage und Rückleitung **/newsletter/bestaetigt/**. Keine Einwilligungszeitpunkte, alten DOI-Nachweise oder Contact-Attribute erfinden. Neue Textversion ist **vu-newsletter-v1**; wortgleich in Formular, Mail und Runtime-Prüfung:

> Ich möchte den Vision-Universe-Newsletter per E-Mail erhalten: Neuigkeiten zu Vision Universe, neue Research-Inhalte und Informationen zu seinen Produkten einschließlich des App-Starts. Ich kann mich jederzeit über den Abmeldelink abmelden.

Brevo verarbeitet Mail und Bestätigung. Die eigene Bestätigungsseite ist statisch; direkter Aufruf beweist keine Mitgliedschaft. API 201 beweist nur Annahme, nicht Zustellung. Besucher erhalten eine neutrale Antwort, die weder bestehende Kontakte offenlegt noch eine erfolgte Anmeldung behauptet. Fehlermeldungen und Rückmeldungen bleiben in der eigenen Oberfläche. Ohne JavaScript geht der native POST zur eigenen API und anschließend auf eine eigene gebrandete Hinweis-/Fehlerseite.

## Missbrauchsschutz und Grenzen

- HMAC-basierter IP-Zähler im Cloudflare-Cache: maximal **3 Anfragen je 10 Minuten**; keine Klartext-IP im Cache.
- HMAC-basierte E-Mail-Reservierung vor dem DOI-Aufruf: **24 Stunden**, bleibt auch nach Fehler/Timeout bestehen. Keine automatischen Retries; parallele Aufrufe im selben Isolate werden serialisiert.
- Brevo-Versandereignisse werden über Rechenzentren hinweg geprüft; initiales Budget **50 DOI-Annahmen pro Tag** anhand der vorlagenbezogenen Brevo-Statistik. Unlesbares Budget stoppt den Aufruf.

Der Cache wirkt **pro Cloudflare-Rechenzentrum**, kann früher verworfen werden und ist keine globale atomare Reservierung. Brevo-Ereignisse/Statistiken können verzögert sein. Globale exakt-einmalige Zustellung oder eine harte globale Budgetgarantie werden deshalb nicht behauptet. Das ist bewusst die schlanke Lösung ohne eigene Datenbank. WAF-Regeln sind nicht geprüft/angelegt, Turnstile wird nicht eingebettet. Diese Grenzen sind Teil der technischen und Datenschutzabnahme; kein kostenpflichtiger Tarif/Schutz gebucht.

## Tatsächlicher DOI- und Marketing-Abmeldetest

Noch **nicht durchgeführt**; Testadresse und private Postfachprüfung fehlen. Lokale Mocks sind kein Live-Nachweis.

Der ausschließlich manuell autorisierte E2E-Weg überprüft eine **zuvor nicht vorhandene** Testadresse und hält komplette Bestandsobjekte während des Tests nur im Runner-Speicher. Dann eigene Preview-Anmeldung, vor Klick keine neue Mitgliedschaft in Liste 4, wiederholtes Absenden, echter deutscher Mail-Eingang und echter DOI-Klick, danach genau eine neue Mitgliedschaft. Keine Kunden oder internen Testkontakte benutzen. Originale 135 Objekte, Liste 5/6 und ausgeschlossene 13 werden nicht verändert.

Spätere Newsletter verwenden Brevos **`{{ unsubscribe }}`**. Dieser Link ist bereits in `scripts/brevo/newsletter.html.tmpl` vorgesehen; der normale versionsgebundene Kampagnenprozess bleibt unverändert. Ein transaktionaler SMTP-Abmeldelink oder ein reiner Testversand beweist nicht automatisch eine Marketing-Abmeldung. Der echte Test benötigt deshalb zusätzlich eine **rein administrative Anmeldebestätigung** ausschließlich an den neuen kontrollierten Kontakt, mit nativem Marketing-Abmeldelink. Dafür kurzzeitig eine eindeutig diesem Testlauf zugeordnete Ein-Kontakt-Testliste und ungesendeten Entwurf erstellen; vor dem einen Aufruf Empfänger und Inhalt erneut prüfen. Niemals Liste 4, 5 oder 6 als Versandziel verwenden. Keine reguläre Newsletter-Kampagne. Keine zusätzliche Bestätigung für normale öffentliche Anmeldungen einrichten.

Im Postfach Inhalt und Link prüfen, native Brevo-Abmeldung durchführen und `emailBlacklisted:true` tatsächlich zurücklesen. Der Test darf diesen Wert nicht selbst setzen. Erneutes Absenden muss die Sperre erhalten. Ein abgemeldeter Kontakt kann weiterhin in Liste 4 stehen; das macht ihn nicht versandberechtigt. Brevos Marketing-Sperre und zukünftiger Empfängerausschluss müssen geprüft werden. Die ausschließlich für diesen Lauf erstellte Testliste erst nach belegter Abmeldung entfernen; keine vorhandene Liste löschen. Bei unklarem Sendestatus niemals blind wiederholen.

Zusätzlich tatsächlich prüfen: Anbieterfehler, Offline/Timeout, mobile Darstellung, tatsächliche Cache-/Budgetwirkung und Mail-/Tracking-/Protokollverhalten. Der bekannte Betreiber-Nachweis „keine aktiven Workflows“ stammt vom 12. Oktober; kein neuer UI-Audit wird behauptet. Keine Welcome-Flows oder zusätzlichen Automationen eingerichtet. Vor Veröffentlichung tatsächliche Newsletter-Automationen/unerwartete Zusatzmails prüfen; fremde Workflows nicht pauschal deaktivieren.

## Veröffentlichung bleibt geschlossen

Build-Konfiguration **mode:closed** ist Standard. Öffentlicher Modus verlangt **liveFlowVerified:true**, **privacyReviewed:true** und vollständiges freigegebenes deutsches **privacyHtmlPath**; `data-policy-status="draft"` wird abgelehnt. Runtime benötigt zusätzlich **NEWSLETTER_PUBLIC_ENABLED**, **NEWSLETTER_PRIVACY_APPROVED**, **NEWSLETTER_E2E_VERIFIED** alle true. Setup setzt alle false, kein Merge öffnet das Formular.

**mode:test** ist nur Preview/lokal; auf main/Produktionsbuild verboten. Runtime: **NEWSLETTER_STAGE=preview**, **NEWSLETTER_TEST_MODE=true**, geheime **NEWSLETTER_TEST_EMAIL**. Production kann diesen Bypass nicht nutzen. API-/Rate-Schlüssel nur `secret_text`-Runtime-Bindungen. Build kopiert nur Serverquellcode als `_worker.js`, niemals Secretwerte; Pages behandelt ihn als Backend. Server-/Cache-/Workerquellpfade nach außen 404, keine Anwendungslogs oder personenbezogenen Actions-Artefakte.

[Datenschutzabschnitt 7](datenschutz/index.html) bleibt Entwurf für den API-/Cloudflare-Datenfluss, kurzlebige pseudonyme Cachewerte und tatsächliche Brevo-Verarbeitung. AV-Verträge, Übermittlungen, Logs, Fristen und Tracking müssen konkret geprüft und der Text ausdrücklich freigegeben werden. Nach Änderungen an Inhalt/Einwilligung/Flow echte Abnahme erneuern. Keine Versandbereitschaft ohne diese Belege behaupten.

Offizielle Schnittstellen: [Brevo DOI-API](https://developers.brevo.com/reference/create-doi-contact), [transaktionale Sperrlisten](https://developers.brevo.com/reference/get-transac-blocked-contacts), [Marketing-Abmeldelink](https://help.brevo.com/hc/en-us/articles/209553645-Insert-a-custom-unsubscribe-link-in-your-emails), [Cloudflare Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
