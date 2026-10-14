# Vision-Universe-Newsletter mit nativem Brevo-Formular

Dauerhaftes Newsletter-System für Neuigkeiten zu Vision Universe, neue Research-Inhalte und Informationen zu seinen Produkten einschließlich des App-Starts. Der App-Start ist ein Newsletter-Thema. Name, Einwilligung und Empfängerliste bleiben allgemein.

Das Formular verwendet ausschließlich **VU | Newsletter (ID 4)**. Die 135 Bestandsabonnenten werden nicht erneut angemeldet; keine Änderung ihrer Einwilligung/Sperren und keine rückwirkenden DOI-Nachweise. **VU | App-Warteliste (5)** und **VU | Newsletter-Test (6)** werden nicht verwendet oder geändert. Die 13 Nicht-Abonnenten bleiben ausgeschlossen. Keine Kampagne oder E-Mail wird durch die Einrichtung versendet.

## Konkreter Brevo-Klickweg

Im bestehenden Konto RAM Consulting, keine neue Liste erstellen:

1. **Marketing → Formulare → Anmeldung → Anmeldeformular erstellen → Ganze Seite/eingebettet**. Exakter Name: **VU | Newsletter | DE | Anmeldung**. E-Mail-Feld und DSGVO-Felder; Einwilligung verpflichtend und nicht vorausgewählt. Keine Produkt-/Wartelisten-Auswahl, Käufermerkmale oder kostenpflichtigen Einwilligungsgruppen. Einwilligung exakt wie in der DOI-Mail:

   > Ich möchte den Vision-Universe-Newsletter per E-Mail erhalten: Neuigkeiten zu Vision Universe, neue Research-Inhalte und Informationen zu seinen Produkten einschließlich des App-Starts. Ich kann mich jederzeit über den Abmeldelink abmelden.

   Datenschutzlink **https://www.visionuniverse.de/datenschutz/**, noch Entwurf. Brevo als Verarbeiter benennen. Original-Logo, weiß/schwarz, gut lesbare Schrift; mobile Vorschau und tatsächlich eingerichtetes CAPTCHA prüfen. Dessen Secret ausschließlich in Brevo hinterlegen, nicht im Repository/Build. Für Brevo-Iframe nennt der Anbieter `sibforms.com` als CAPTCHA-Hostingdomain.
2. **Listen:** ausschließlich **VU | Newsletter (ID 4)** markieren; **Liste 5 und 6 abwählen**. Keine Bestandskontakte importieren, neu anmelden, aktualisieren oder zur DOI-Bestätigung auffordern. Kein Attribut-Massenupdate, keine Sperren aufheben. Bestehende Newsletter-Einwilligungen werden durch die neue Formular-Konfiguration nicht als DOI interpretiert.
3. **Einstellungen → Doppelte Bestätigungsmail**: **VU | Newsletter | DE | Double Opt In | v1** auswählen. Exakte Template-ID wird nach API-Erstellung unten dokumentiert. Betreff: **Bestätige deine Anmeldung zum Vision-Universe-Newsletter**. Button „Newsletter-Anmeldung bestätigen“, Brevo-Linktyp **Double Opt-in** / `{{ doubleoptin }}`. Die tatsächliche Auswahl und Linkauflösung prüfen; eine per API angelegte Vorlage ist noch kein Live-Nachweis. **Finale Bestätigungsmail aus**. Alte App-Vorlagen 1/2/3 nicht auswählen oder bearbeiten.
4. Deutsche Rückmeldungen: Erfolg **„Bitte bestätige deine E-Mail-Adresse. Erst nach dem Klick ist deine neue Newsletter-Anmeldung bestätigt.“**; ungültige Adresse **„Gib eine gültige E-Mail-Adresse ein.“**; Pflichtfeld **„Bitte fülle dieses Feld aus.“**; Fehler **„Deine Anmeldung konnte nicht verarbeitet werden. Versuche es später erneut.“**. Rückleitung nach Absenden **/newsletter/bestaetigen/**, nach gültigem Mail-Klick **/newsletter/bestaetigt/**. Für den privaten Test zunächst die vorhandene PR-Vorschau `https://feat-brevo-app-waitlist-doi.vision-universe.pages.dev` verwenden. Die alte Branch-Bezeichnung ist nur der bestehende technische Vorschauhost, kein Formular-/Systemname. Beide Seiten sind statisch; ein direkter Aufruf bestätigt keine Anmeldung. Nach Veröffentlichung auf `https://www.visionuniverse.de` umstellen und Rückleitung erneut prüfen.
5. **Teilen → Iframe → Fertig**: vollständige **src-Adresse des Anmeldeformulars** bereitstellen. Kein Simple-HTML-Export, weil dieser CAPTCHA und Provider-Rückmeldungen nicht vollständig unterstützt. Noch nicht öffentlich einbetten oder verlinken.
6. **Marketing → Formulare → Abmeldung → Neues Abmeldeformular**. Exakter Name: **VU | Newsletter | DE | Abmeldung**. Deutsch und gleiche Gestaltung. Hinweis **„Hier kannst du dich vom Vision-Universe-Newsletter abmelden.“**; Erfolg **„Du bist abgemeldet und erhältst keine weiteren Marketing-E-Mails von Vision Universe.“**; Fehler **„Die Abmeldung konnte nicht abgeschlossen werden. Versuche es erneut.“**. Brevos native Abmeldebestätigung auf der Providerseite; keine zusätzliche Abmeldemail. **Teilen → gehostete URL → Fertig**, vollständige **Abmeldeformular-URL** bereitstellen. Brevos Standardabmeldung kann Marketing kontoweit sperren. Die tatsächliche Sperrwirkung muss geprüft werden, auch wenn der Kontakt weiterhin in Liste 4 bleibt.

**Die zwei anschließend benötigten URLs:** (1) Iframe-`src` des gespeicherten Anmeldeformulars → `formUrl` / `BREVO_FORM_URL`; (2) gehosteter Link des gespeicherten Abmeldeformulars → `unsubscribeFormUrl` / `BREVO_UNSUBSCRIBE_FORM_URL`. Beide tatsächlichen Werte liefert Brevo erst nach Speicherung; hier werden keine Beispieladressen als reale Werte ausgegeben.

Für spätere Newsletter Brevos vorgesehenen Abmeldelink (`{{ unsubscribe }}` im passenden Brevo-Maileditor) mit deutscher Provider-Abmeldeseite verwenden. Die tatsächliche Linkauflösung prüfen. Die statische Bestätigungsseite kann den gehosteten Abmeldelink schon während des privaten Tests erhalten: nur `BREVO_UNSUBSCRIBE_FORM_URL` in Preview setzen und `BREVO_FORM_URL` leer lassen. Die öffentliche Anmeldung bleibt dabei gesperrt. Keine eigene Abmeldelogik oder Tokens.

## Vorlagenprüfung und tatsächliche Einrichtung

Die vorhandenen App-Vorlagen **1, 2 und 3** bleiben erhalten. Die verfügbare Brevo-API kann Vorlagen und templategefilterte Versandereignisse lesen; daraus folgt keine vollständige Aussage zu aktuellen Formular-/Automationsbindungen. Diese Bindungen sind im verfügbaren Zugang nicht einsehbar. Deshalb werden keine möglicherweise verwendeten Vorlagen unbemerkt umgeschrieben. Eine neue, eindeutig benannte deutsche Newsletter-Vorlage ist vorgesehen; ihr tatsächlicher Erstellungs-/Leseabgleich wird nach dem Operatorlauf hier ergänzt.

Die frühere Bereinigung ausschließlich für den Eigenbau eingeführter Pages-Variablen ist abgeschlossen: [Bereinigung](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38516564179) und [unabhängiger Leseabgleich](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38516667514). Bestehende GitHub-/DNS-/Social-Secrets wurden erhalten. Kein D1, eigener Worker oder DOI-Endpunkt gehört zum finalen PR. Das ursprüngliche manuelle Pages-GET-Audit bleibt unverändert.

## Bestands- und Versandfreigabe

Das Formular ist ausschließlich für neue freiwillige Newsletter-Anmeldungen. Keine Shopify-/Wartelisten-Übernahme und kein erneuter DOI-Versand an die 135 vorhandenen Newsletter-Kontakte. Neue native DOI-Nachweise dürfen nur aus dem tatsächlich ausgeführten neuen Formularprozess stammen; ein globales `DOUBLE_OPT-IN`-Attribut ersetzt keine belegte Formular-/Textversion. Das Formular darf bestehende Sperren nicht still aufheben. Die Wirkung bei wiederholter Anmeldung wird mit der neuen kontrollierten Testadresse geprüft, nie mit Bestandskunden oder Dennis/Ralf.

Vor dem echten Test vorhandene **Automatisierungen → Workflows → Aktiv**, klassische Workflows und alle Seiten prüfen: Kontaktanlage, dieses Formular, Attributänderung und Liste 4 dürfen keine unerwünschten Zusatzmails auslösen. Keine fremde Automation pauschal deaktivieren. Historische Betreiberangaben nicht als aktuellen eigenen Audit ausgeben. Im Auftrag wird keine Welcome-Serie eingerichtet.

## Echter DOI-/Abmeldetest und Datenschutz

Noch nicht live durchgeführt. Benötigt werden die zwei tatsächlichen Brevo-Formular-URLs sowie privat eine neue kontrollierte Adresse mit Postfachprüfung. Es fehlt eine angemeldete Brevo-Oberflächensitzung bzw. ein verfügbarer dokumentierter API-Verwaltungsweg für native Formulare; die einmalige Einrichtung oben erfolgt deshalb in Brevo. Keine Cloudflare-D1- oder zusätzliche API-Token-Einrichtung.

- Vorher neue Testadresse privat auf Nichtvorhandensein prüfen; vollständige Bestandsobjekte von Liste 4/5/6 privat vergleichen. Die 135 Bestandsabonnenten werden niemals als Test benutzt.
- Absenden mit Einwilligung, echte deutsche DOI-Mail im Postfach prüfen; vor dem Klick keine bestätigte neue Mitgliedschaft in **Liste 4**. API-Annahme oder Erfolgsbanner ist kein Zustellnachweis.
- Gültigen DOI-Link klicken, genau eine neue Mitgliedschaft in Liste 4 und tatsächlichen Formularnachweis prüfen. Nur die neue Testadresse darf sich dadurch ändern; Liste 5/6 und die 135 Altobjekte unverändert.
- Wiederholte Anmeldung vor/nach Bestätigung, fehlende Einwilligung, ungültige Adresse, CAPTCHA und Anbieterfehler prüfen. Keine unbelegte providerseitige Idempotenz behaupten.
- Den nativen Abmeldelink auf der Bestätigungsseite nutzen; deutsche Erfolgsmeldung und tatsächlichen Marketing-Sperrstatus über Brevo rücklesen. Eine erhaltene Listenmitgliedschaft macht einen abgemeldeten Kontakt nicht versandberechtigt. Eine spätere Empfängerauswahl muss Brevo-Sperren ausschließen; keine echte Kampagne zum Nachweis versenden.
- Wiederholte Abmeldung und erneutes Absenden nach Abmeldung prüfen; keine stille Entsperrung. Kein rückwirkender DOI für importierte Kontakte. Echte mobile Providerdarstellung und Logging/Tracking privat prüfen, keine Adressen oder persönlichen Links in Logs/PRs/Artefakten.

[Datenschutzabschnitt 7](datenschutz/index.html) beschreibt den allgemeinen Newsletter und den nativen Brevo-Iframe-Datenfluss. Er bleibt Entwurf. Konkrete Vertragsparteien/AV-Verträge, Übermittlungsgrundlagen, Protokoll-/Nachweis-/Löschfristen und tatsächliche Tracking-/CAPTCHA-Verfahren müssen geprüft und der konkrete Text ausdrücklich freigegeben werden.

## Konfiguration und Tests

Zum Öffnen der öffentlichen Anmeldung sind beide geprüften Brevo-URLs, `liveFlowVerified:true`, `privacyReviewed:true` und ein vollständiges freigegebenes deutsches `privacyHtmlPath` erforderlich. Der vorhandene `data-policy-status="draft"`-Text wird auch bei gesetztem Flag abgelehnt. Die Freigaben beziehen sich ausschließlich auf den Newsletter-DOI-/Abmeldeweg und Datenschutz, nicht auf App-Start oder Wartelistenbereitschaft. Nach Änderungen an Formular, Mail, Einwilligung oder Abmeldung die echte Abnahme erneuern.

Die Konfiguration und der Standardbuild bleiben gesperrt. Keine API-Keys im Browser/Build; keine eigene Speicherung oder Anmelde-API. Ohne Freigaben lädt die Seite kein Brevo-Iframe/CAPTCHA. Der bestehende Produktions-Datenschutzgate bleibt erhalten. Ein Merge allein öffnet kein Formular.

Synthetische Tests prüfen Provider-URL-Grenzen, Sperren, Mailplatzhalter und wortgleiche Einwilligung, statische Ausgabe/Secretfreiheit und den Abmeldelink bei weiter gesperrter Anmeldung. Browser prüft Layout/200-%-Reflow und abgefangene Iframe-Einbindung. Provider-Auswahl, Inbox, DOI und tatsächliche Abmeldung bleiben davon getrennte Live-Nachweise.

Offizielle Anleitung: [Brevo-Anmeldeformular](https://help.brevo.com/hc/en-us/articles/208771869-Create-a-sign-up-form-in-Brevo), [native DOI-Vorlage](https://help.brevo.com/hc/en-us/articles/360019540880-Create-a-custom-double-opt-in-DOI-email-template-for-a-sign-up-form-created-in-Brevo), [gehostetes Abmeldeformular](https://help.brevo.com/hc/en-us/articles/360022160120-Customize-an-unsubscribe-form-to-embed-on-a-website-or-share-through-a-hosted-page), [templategefilterte Ereignisse](https://developers.brevo.com/reference/get-email-event-report).
