# Interne Kontakte zusätzlich in der Hauptliste

Auf ausdrücklichen Owner-Auftrag dürfen die beiden bereits privat bestätigten
Testkontakte zusätzlich Mitglied von **VU | Newsletter (4)** sein.
**VU | Newsletter-Test (6)** bleibt erhalten. Liste 5 bleibt unberührt.
Dies ist eine Ausnahme von der ausschließlichen Testlisten-Zuordnung des
ursprünglichen Shopify-Imports, keine erneute Anmeldung oder DOI-Bestätigung.

Der manuelle Workflow `brevo-internal-membership.yml` liest die zwei Adressen aus
dem bestehenden Secret `BREVO_NEWSLETTER_CONFIG` ausschließlich im Runner.
`preview` gleicht vorhandene Kontakte privat ab und schreibt nichts.
`apply` fügt ausschließlich vorhandene Kontakt-IDs additiv zu Liste 4 hinzu und
liest anschließend Mitgliedschaften, Merkmale und Sperren erneut zurück.
Keine Kontaktanlage, Attributänderung, Entsperrung, Listenentfernung oder
Versandendpunkte sind erlaubt. Bereits passende Mitgliedschaften werden nicht
erneut geschrieben. Ungeklärte oder widerrufene Einwilligungen werden
zurückgestellt; global gesperrte Testkontakte blockieren den Vorgang.

Vor `apply` muss tatsächlich geprüft sein, dass Listenzugänge keine aktive
Automation auslösen: Brevo → Automatisierungen → Workflows → Aktiv, auch
klassische Workflows und weitere Seiten prüfen. Der private Nachweis wird mit
Zeitpunkt (höchstens 24 Stunden), `import_triggers_excluded=true` und SHA256
referenziert. Der Hash ist eine Nachweisreferenz, kein unabhängiger Beweis.
Nur ein neuer manueller Lauf durch den konfigurierten Owner auf main ist erlaubt.
Das Secret, Adressen und API-Antworten erscheinen weder in Git noch in Logs oder
herunterladbaren Artefakten; die Ausgabe enthält nur feste Statuswerte und Zahlen.

Die regulären Newsletter-Kampagnen **schließen Liste 6 weiterhin aus**, damit
interne Empfänger bei einem Hauptversand nicht versehentlich zusätzlich
angeschrieben werden. Die zusätzliche Hauptlisten-Mitgliedschaft ändert diese
Versandregel nicht. Die separate Vorabkampagne adressiert weiterhin ausschließlich
die privat geprüften exakt zwei Mitglieder von Liste 6; dabei wird Liste 4 nicht
ausgeschlossen, weil das jetzt beide Testempfänger unterdrücken würde.
Liste 5 bleibt beim Vorabversand ausgeschlossen.

Der bisherige Bestandsimport und sein Einwilligungsschutz bleiben unverändert.
Nach dieser Ausnahme kann ein erneuter Bestandsimport die beiden abweichenden
Bestandskontakte sicher zurückstellen; er entfernt ihre neue Mitgliedschaft nicht.
Ein erfolgreicher Code-Merge führt weder den Workflow aus noch sendet er E-Mails.
Den tatsächlichen Änderungsstand belegt erst ein erfolgreicher `apply`-Lauf samt
API-Leseabgleich; ein PR oder ein Preview allein ist kein Ausführungsnachweis.
