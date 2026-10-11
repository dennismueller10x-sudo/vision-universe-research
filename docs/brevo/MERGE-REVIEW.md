# PR 544: Merge-Prüfung und Betrieb nach Freigabe

**Historischer Prüfstand vor der Owner-Freigabe.** Der tatsächliche Stand nach dem Merge steht in [LIVE-STATUS.md](LIVE-STATUS.md). Zum Zeitpunkt dieser Prüfung war kein Merge, Brevo-Import oder E-Mail-Versand ausgeführt. Der PR ist technisch vorbereitet; der rote allgemeine Core-Check bleibt ein offener, belegter Baselineblocker. Der Check wurde weder umgangen noch abgeschwächt. Persönliche Namen, Kontaktadressen und private Datei-/Downloadreferenzen gehören nicht in diesen öffentlichen Bericht.

## Nachweis des Core-Baselinefehlers

[Core-Lauf 37919091048](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37919091048) für `5e22886ccde6286323bcc4814ca8834a50abac06`: 94 Tests, 93 erfolgreich, genau ein Fehler in `core/tests/golden-paths.test.mjs:134`. Der Test „Stock · News: Stand erkennbar, Veraltung angezeigt, jede Meldung zu einer Security“ liefert:

```text
DVN / CRGY: NOT_IN_COMPANY_MASTER
SLYG: NOT_IN_COMPANY_MASTER
```

Der exakt gleiche Test wurde lokal auf dem unveränderten PR-Basiscommit `6f26b4e958a0c96bb3ddbe4aa0c20bfe85799c1c` separat reproduziert, mit genau diesen beiden Meldungen. Alle sieben gelesenen Git-Blobs sind zwischen Basiscommit, bisherigem Brevo-HEAD und dem geprüften aktuellen `main`-Commit `beaaabb66a1e8d7d822c0fd9363e7499f06a6d60` identisch: `core/client.js`, `core/identity.js`, `core/tests/golden-paths.test.mjs`, `dashboard/data/news_feed.json`, `news/news.js` und die beiden Instrument-Shards unter `quant/data/universe/instruments/`. Der Brevo-PR ändert keinen dieser Pfade; der Core-Lauf lädt die Brevo-Integration nicht.

Das belegt einen vorhandenen News-/Company-Master-Fehler, keine Brevo-Regression. Ein älterer roter `main`-Lauf allein wäre kein Nachweis gewesen: Lauf 37796654829 scheiterte im separaten `live`-Job, nicht in diesem Core-Test. Er wird ausdrücklich nicht als Beleg für den News-Fehler verwendet.

Bis zur separaten Fehlerbehebung oder einer ausdrücklichen Owner-Entscheidung über den belegten Baselinefehler bleibt der PR **nicht durchgehend grün**. Die Research-Dateien und ihre Gates werden in diesem Auftrag nicht geändert. Branch-Protection-Metadaten sind mit diesem Zugang nicht vollständig lesbar (HTTP 403); eine technische Merge-Sperre durch Regeln wird deshalb nicht behauptet. Der beobachtete rote Check bleibt sichtbar und muss vor Merge-Freigabe bewertet werden.

Die abgeschlossenen ursprünglichen Brevo-Prüfungen, CI Config, Currency-Contract/Marker und Vercel-Status sind erfolgreich; `live` und `measure` waren vorgesehen übersprungen. Vercel meldete „Canceled by Ignored Build Step“ und führte kein Preview-Build für diese Änderung aus. Die neu ergänzten Schutzprüfungen werden nach Push erneut in den PR-Checks ausgeführt; ihre endgültigen Run-Links stehen im PR-Bericht.

## Sicherheit des Admin-Workflows

- Einziger Trigger ist `workflow_dispatch`. Ein Merge, Push, PR, Zeitplan oder Abschluss eines anderen Workflows führt keinen Brevo-Aufruf aus.
- Job-Guard verlangt den tatsächlichen Standardbranch aus dem GitHub-Ereignis. Checkout ist auf den Dispatch-Commit `${{ github.sha }}` festgelegt, mit fest gepinnter Checkout-Action und `persist-credentials=false`.
- Der Python-Einstieg prüft Branch und Ereignistyp erneut. Workflow-Eingaben gehen nur über `env`, werden auf vier feste Operationen beschränkt und nicht in Shell-Code interpoliert.
- Tokenberechtigung ausschließlich `contents: read`; kein Commit, Push, Merge, Deployment oder DNS-Endpunkt. Globale Concurrency-Gruppe verhindert parallele Imports dieses Workflows.
- Keine Versandoption und keine Kampagnen-/SMTP-Aufrufe im Actions-Client. `sendTest` und `sendNow` sind in Actions gesperrt, auch bei einem CLI-Aufruf außerhalb der Workflow-Auswahlliste.
- Kein `set -x`, kein Umgebungsdump, keine API-Antworten, Kontaktadressen oder Payloads in Logs. API-Fehler geben nur Status oder allgemeine Fehler aus. Audit-Ausgabe ist auf bekannte Tarifwerte, Listen-IDs, Zählwerte und Prüfstatus beschränkt.
- Keine Artefakte, Caches oder hochgeladenen Kontaktexporte. Importdaten werden aus einem temporären Secret im Arbeitsspeicher verarbeitet; keine Übergabedatei wird auf dem Runner geschrieben.

Die vorherige Möglichkeit, den Admin-Workflow mit dem Repository-Secret auf einem beliebigen Branch auszuführen, wurde geschlossen. Das ist eine neue Brevo-Härtung, unabhängig vom Core-Baselinefehler. Repository-Schreibrechte müssen auf vertrauenswürdige Betreiber begrenzt bleiben: Besitzer anderer Workflows können auf ungeschützten Branches eigene Secret-Zugriffe programmieren. Der Brevo-PR verändert keine globalen Repository-Berechtigungen oder fremden Workflows.

## Was nach einem genehmigten Merge möglich ist

**Der Merge selbst startet nichts in Brevo.** Anschließend kann der Owner den Admin-Workflow auf dem Standardbranch manuell aufrufen:

| Operation | Automatisch ausgeführte Schritte | Voraussetzung |
|---|---|---|
| `audit` | Brevo-Zugang, Tarif, Kontaktanzahl, vorhandene VU-Listen/Merkmale, Segmente, aktive Absender, Domainbestätigung und Authentifizierung prüfen; nur Aggregate ausgeben | Funktionsfähiges `BREVO_API_KEY` |
| `setup` | kostenlosen Tarif bestätigen; kompatible Merkmale und drei VU-Listen wiederverwenden/anlegen | keine widersprüchliche bestehende Struktur |
| `import-preview` | alle 150 vorbereiteten Kontakte mit bestehenden Kontakten abgleichen; bestehende Sperren, neue/vorhandene Kontakte, interne Tests, Käufer und tatsächlich berechtigte reguläre Empfänger zählen; keine Mutation | temporäres `BREVO_IMPORT_PAYLOAD`, eingerichtete Listen |
| `import` | konservativer Upsert, Test-/Hauptlistentrennung, Käufermerkmale, Rückprüfung und Wiederholbarkeit | zusätzlich aktueller echter Automationsprüfbericht in `BREVO_IMPORT_REVIEW` |

Die Exportmengen 135 regulär, 2 intern und 13 nicht angemeldet sind die vorbereiteten Gruppen. Bestehende Brevo-Sperren/Abmeldungen können die tatsächlich berechtigte Newsletter-Zahl verringern. Die Integration hebt sie niemals auf. Die App-Warteliste wird durch den Import nicht befüllt. Fehlender bestehender Sperrstatus blockiert vor der ersten Kontaktmutation. Netzwerkfehler können einen Teilimport hinterlassen; nach privater Prüfung ist der Kontakt-Upsert wiederholbar, ohne bestehende Sperren aufzuheben oder einen zusätzlichen Kontakt anzulegen.

## Geschützter Übergabeweg vor einem manuellen CSV-Import

Für das kleine Bestandsvolumen ist keine zusätzliche Speicherplattform nötig. GitHub speichert Actions-Secrets verschlüsselt. Die lokale Base64-/Gzip-Datei ist **nicht** verschlüsselt; sie bleibt privat mit `0600` und wird niemals als Datei in Git, Workflow-Input oder Artefakt abgelegt.

```bash
python3 scripts/brevo/transfer.py /PRIVAT/shopify-prepared.private.json \
  --out /PRIVAT/import-payload.b64 --manifest /PRIVAT/transfer-manifest.private.json

# Nur mit einem bereits autorisierten Zugang mit Actions-Secret-Schreibrecht:
gh secret set BREVO_IMPORT_PAYLOAD \
  --repo dennismueller10x-sudo/vision-universe-research < /PRIVAT/import-payload.b64
```

Keine `--body`-Argumente mit Kundeninhalten, keine Shell-History mit Payloads, kein Ausdruck des Secret-Werts. Ein Owner kann das Paket alternativ privat über GitHubs Actions-Secrets-Einstellungen hinterlegen. Der API-Zugriff auf `/actions/secrets/public-key` wurde tatsächlich versucht und mit HTTP 403 abgewiesen; der aktuelle Codex-Zugang kann die Übergabe derzeit nicht ausführen. Es wurde kein vorhandener sicherer Serverzugang gefunden und kein öffentlicher Research-Speicher als Kontaktablage wiederverwendet.

Nach `audit`/`setup` und Upload zunächst `import-preview` starten. Anschließend **alle aktiven Marketingautomationen in der Brevo-UI** prüfen: Kontaktanlage, Kontaktänderung, Listenzugang, globale Zielgruppen und Welcome-/DOI-Flows. Die offizielle API liefert Kontoinformationen über Marketing Automation, aber keine vollständige Aufzählung der aktiven Marketing-Flows und keinen verlässlichen pauschalen Unterdrückungsschalter für Kontakt-Upserts. Keine Prüfung durch einen automatisch erfundenen Nachweis ersetzen. Wenn irgendein Importereignis einen Flow auslösen könnte und keine bereits sichere Ausschlussregel besteht, bleibt der Import gesperrt. Keine fremden Automationen pauschal deaktivieren.

Der tatsächliche private Prüfbericht muss die in [README](README.md#privater-api-import--nur-mit-vorhandenem-sicheren-serverzugang) beschriebenen Felder enthalten, einschließlich beider Prüfsummen und aller realen Listen-IDs. Kein Nachweis wurde vorab ausgefüllt. Bei vorhandenem echten Nachweis:

```bash
gh secret set BREVO_IMPORT_REVIEW \
  --repo dennismueller10x-sudo/vision-universe-research < /PRIVAT/automation-review.private.json
```

Erst dann `import` manuell aufrufen. Nach Abschluss und Prüfung beide **temporären** Secrets entfernen:

```bash
gh secret delete BREVO_IMPORT_PAYLOAD --repo dennismueller10x-sudo/vision-universe-research
gh secret delete BREVO_IMPORT_REVIEW --repo dennismueller10x-sudo/vision-universe-research
```

`BREVO_API_KEY` bleibt bestehen; weder lesen noch übertragen oder löschen. Der Workflow besitzt bewusst kein Secret-Verwaltungsrecht und löscht die temporären Secrets deshalb nicht selbst. Die Entfernung bleibt ein expliziter Betreiber-Schritt.

## Manuelle Restpunkte und private Downloads

1. Rotes Core-Gate separat beheben oder über den belegten Baselinefehler entscheiden; PR 544 anschließend ausdrücklich zum Merge freigeben. Dieser Auftrag führt keinen Merge aus.
2. Temporäre Actions-Secrets mit einem berechtigten Betreiberzugang hochladen; der derzeitige Zugang hat nachweislich HTTP 403. Solange die sichere Übergabe fehlt, keine Kontaktdatei auf öffentliche Ersatzwege ausweichen lassen.
3. Aktive Automationen in Brevo prüfen und erst bei belegter Sicherheit einen aktuellen privaten Prüfbericht erstellen. Solange dieser fehlt, ist der echte Import gesperrt.
4. Käufersegment `VU_BUYER=true` in der Brevo-UI erstellen bzw. ein passendes Segment wiederverwenden. Keine automatische Newsletter-Anmeldung daraus ableiten.
5. Fehlende Absenderbestätigung in Brevo durchführen. Fehlende Domainbestätigung/Authen­tifizierung samt den **tatsächlich von Brevo angegebenen** Brevo-Code-/DKIM-/ggf. DMARC-Records privat dokumentieren. Der Audit kann Zählwerte/Mängel melden; die konkreten DNS-Werte stehen in der Brevo-UI oder einer privaten Domain-API-Abfrage, nicht im öffentlichen Log. Aktuell sind alle Konto-/Domainwerte ungeprüft; keine DNS-Änderung ausführen.

Die drei CSV-Fallbacks und ein vollständiges privates Übergabepaket mit Originalexport, vorbereiteter JSON, Zuordnung und komprimiertem Secret-Payload werden in der privaten ChatGPT-Dateiablage bereitgestellt. Zugriff ausschließlich für den Owner wird vor Upload geprüft; Upload-Referenzen und SHA-256 werden privat nachgeprüft. Private Referenzen stehen nur in der privaten Übergabe, nicht in diesem öffentlichen Repository. Ein lokaler Pfad ist kein Sicherungsnachweis. Auch ein bestätigter Upload ist keine Zusage unbegrenzter Aufbewahrung; der Owner sollte das Paket zusätzlich in seiner vorhandenen privaten Ablage sichern.

Beim manuellen Fallback ist die konkrete CSV-Zuordnung in der [README](README.md#geschützte-importvorbereitung) beschrieben. Bestehende Kontakte werden im UI-Import nicht aktualisiert; ihr vollständiger Abgleich bleibt dann eine zusätzliche private Einzelprüfung. Der automatisierte Upsert ist vorzuziehen, sobald der sichere Secret-Transfer und die Automationsprüfung möglich sind.
