# TestFlight auf Ihrem iPhone: Schritt für Schritt, ohne eigenen Mac

**Stand:** 03.11.2026 · Ziel: Vision Universe **nur für Sie** über TestFlight auf Ihrem iPhone installieren. **Keine** Veröffentlichung im App Store, keine Apple-Prüfung, keine Store-Käufe.
Weg: GitHub Actions mit macOS-Runner und manueller Signierung (Begründung und Vergleich: [TESTFLIGHT_PLAN.md](TESTFLIGHT_PLAN.md) §2).
Kennzeichnung: **[Sie]** nur Sie können das tun · **[Claude]** übernehme ich · **[prüfen]** Angabe aus meinem Wissen oder aus Dritten, vor Ort kurz gegenprüfen.
Nichts davon wurde bisher ausgeführt. Der erste Lauf wird mit hoher Wahrscheinlichkeit ein bis drei Korrekturen brauchen (das Projekt wurde nie gebaut).

## Überblick und Aufwand

| Phase | Wer | Dauer (Schätzung) |
|---|---|---|
| 1 Apple-Konto | Sie | Minuten bis Tage (Organisation) |
| 2 App-ID und App-Eintrag | Sie | 15 Minuten |
| 3 Zertifikat und Profil (ohne Mac) | Sie, mit meinem Skript | 30 Minuten |
| 4 API-Schlüssel | Sie | 10 Minuten |
| 5 GitHub-Umgebung und Geheimnisse | Sie | 20 Minuten |
| 6 Workflow aktivieren | Claude (PR), Sie geben frei | 30 Minuten |
| 7 Build und Upload | Sie lösen aus, Claude beobachtet | 20 bis 40 Minuten je Lauf |
| 8 Installation auf dem iPhone | Sie | 15 Minuten |

Laufende Kosten: 99 USD pro Jahr für das Apple Developer Program. GitHub-Runner mit macOS sind für unser öffentliches Repository kostenlos ([GitHub-Dokumentation](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)).

## Phase 0: Zwei Entscheidungen vorab [Sie]

1. **Einzelperson oder Organisation?**
   - *Einzelperson:* schnell, nur Apple-Konto mit Zwei-Faktor-Anmeldung. Auf dem Store stünde später Ihr persönlicher Name als Verkäufer. Für TestFlight nur für Sie ohne Bedeutung.
   - *Organisation (Firma):* braucht eine D-U-N-S-Nummer, öffentliche Website, Firmen-E-Mail der Domain und rechtliche Vertretungsbefugnis, Prüfung kann dauern ([Apple: Einschreibung](https://developer.apple.com/support/enrollment/)). Sinnvoll, wenn die App später unter dem Firmennamen erscheinen soll. Ein späterer Wechsel von Einzelperson zu Organisation ist aufwendig [prüfen].
   - **Meine Empfehlung:** Wenn ein öffentlicher Store-Start unter dem Firmennamen geplant ist, gleich als Organisation einschreiben und die Wartezeit in Kauf nehmen. Sonst Einzelperson.
2. **Name der App** „Vision Universe“ und Bundle-ID `de.visionuniverse.app`: Verfügbarkeit ist ungeprüft; falls vergeben, ändere ich beides (eine Stelle in `capacitor.config.json` und im Xcode-Projekt).

## Phase 1: Apple Developer Program [Sie]

1. Mit einer Apple-Kennung (Zwei-Faktor-Anmeldung an) beim [Apple Developer Program](https://developer.apple.com/programs/enroll/) einschreiben, per Apple-Developer-App auf dem iPhone oder im Web (Organisation: nur Web).
2. 99 USD pro Jahr bezahlen (lokale Währung möglich). Bestätigung abwarten (Apple nennt bis zu 24 Stunden nach dem Kauf; bei Organisation zusätzlich die Prüfung).
3. In App Store Connect die **Verträge** akzeptieren (Banner „Verträge“, sonst lassen sich Apps nicht anlegen) [prüfen].
4. **Team-ID** notieren (developer.apple.com, Mitgliedschaft). Sie wird später das Geheimnis `APPLE_TEAM_ID`.

## Phase 2: App-ID und App-Eintrag [Sie, im Browser]

1. developer.apple.com, Certificates, Identifiers & Profiles, **Identifiers**, **+**, **App IDs**, Typ **App**: Beschreibung „Vision Universe“, Bundle-ID **Explicit** `de.visionuniverse.app`. Keine zusätzlichen Capabilities. Speichern.
2. appstoreconnect.apple.com, **Apps**, **+**, **Neue App**: Plattform iOS, Name, Primärsprache Deutsch, Bundle-ID aus 1, SKU frei wählbar (z. B. `vu-app-001`), Zugriff „Voll“.
3. In der App unter **TestFlight**, **Interne Tests**: Gruppe „Intern“ anlegen, sich selbst (Account-Inhaber) hinzufügen. Interne Tester brauchen **keine** Apple-Prüfung der Beta-App [prüfen].

## Phase 3: Zertifikat und Profil ohne Mac [Sie]

Sie brauchen einen Rechner mit OpenSSL (Windows: Git Bash oder WSL; Linux; macOS). **Der private Schlüssel entsteht nur auf Ihrem Rechner. Senden Sie ihn niemals in den Chat, in einen PR oder ein Issue.**

1. Repository-Stand mit `app/ci/make-signing-request.sh` holen (aus PR #1280 oder `main`).
2. `bash app/ci/make-signing-request.sh csr <Ihre-Apple-ID-E-Mail>` erzeugt `vu-signing/vu-dist.key` (geheim) und `vu-signing/vu-dist.csr`.
3. developer.apple.com, **Certificates**, **+**, **Apple Distribution**, `vu-dist.csr` hochladen, die `.cer` herunterladen.
4. `bash app/ci/make-signing-request.sh p12 <heruntergeladene.cer>` fragt nach einem neuen Passwort und erzeugt `vu-signing/vu-dist.p12` und `vu-dist.p12.base64`.
5. **Profiles**, **+**, **App Store Connect** (Distribution), die App-ID aus Phase 2, das Zertifikat aus 3 wählen, Namen vergeben (z. B. `VU App Store`), `.mobileprovision` herunterladen und als Base64 speichern (Windows Git Bash/Linux: `base64 -w0 datei.mobileprovision`, macOS: `base64 -i datei.mobileprovision`).
6. Die Dateien `vu-dist.key`, `vu-dist.p12` und das Passwort bewahren Sie sicher auf (Passwortmanager). Das Zertifikat läuft nach einem Jahr ab; dann Schritt 2 bis 5 wiederholen.

## Phase 4: App-Store-Connect-API-Schlüssel [Sie]

1. App Store Connect, **Benutzer und Zugriff**, **Integrationen**, **App Store Connect API**, **Team-Schlüssel**, **+**: Name „GitHub Upload“, Zugriff **App Manager**.
2. **Key-ID** und **Issuer-ID** notieren, die `.p8`-Datei **einmal** laden (später nicht mehr abrufbar).
3. Nur für den Upload gedacht. Bei Verlust: Schlüssel widerrufen und neu anlegen.

## Phase 5: GitHub-Umgebung und Geheimnisse [Sie]

1. GitHub, Repository, **Settings**, **Environments**, **New environment**: Name **`app-testflight`** (genau so).
2. In der Umgebung: **Required reviewers** = Sie selbst; **Deployment branches** = nur `main`.
3. **Environment secrets** anlegen (Werte nie in Chat oder PR):

| Name | Inhalt |
|---|---|
| `APPLE_TEAM_ID` | Team-ID aus Phase 1 |
| `ASC_KEY_ID` | Key-ID aus Phase 4 |
| `ASC_ISSUER_ID` | Issuer-ID aus Phase 4 |
| `ASC_KEY_P8` | gesamter Text der `.p8`-Datei |
| `IOS_DIST_P12_BASE64` | Inhalt von `vu-dist.p12.base64` |
| `IOS_DIST_P12_PASSWORD` | Passwort der `.p12` |
| `IOS_PROFILE_BASE64` | Base64 der `.mobileprovision` |

4. **Environment variables** (öffentlich): `IOS_PROFILE_NAME` (exakter Profilname), `VU_SUPABASE_URL`, `VU_SUPABASE_PUBLISHABLE_KEY` (Supabase, Project Settings, API).

## Phase 6: Workflow aktivieren [Claude, Sie geben frei]

1. **[Sie]** PR #1280 prüfen und freigeben (merge), sobald die relevanten CI-Prüfungen erfüllt sind (Stand: siehe PR).
2. **[Claude]** Kleiner Folge-PR: `app/ci/ios-testflight.workflow.yml.template` nach `.github/workflows/app-ios-testflight.yml` kopieren, Fastfile-Pfad und `macos-26`-Image prüfen, den Workflow-Wächter laufen lassen (`workflow-environments.test.mjs` und `account-ci`). Erst **nach** Phase 5, damit GitHub die Umgebung nicht ungeschützt anlegt.
3. **[Sie]** Folge-PR prüfen und freigeben.

## Phase 7: Build und Upload [Sie lösen aus]

1. GitHub, **Actions**, „App - iOS TestFlight (intern, von Hand)“, **Run workflow**, Branch `main`, Version `0.1.0`.
2. Freigabe der Umgebung `app-testflight` bestätigen (Sie als Prüfer).
3. Der Lauf: `npm ci`, App-Tests, Web-Teil bauen, `cap sync` (CocoaPods), Signierung, Archiv, Upload. **[Claude]** liest die Logs und behebt Fehler in Folge-PRs. Typische Stolpersteine beim ersten Mal: Profil und Zertifikat passen nicht zur Bundle-ID, Signiermodus der Pods, fehlende Info.plist-Angaben, Datenschutz-Manifest, Ablaufdatum des Profils.
4. Ergebnis: Build erscheint in App Store Connect unter TestFlight nach etwa 10 bis 30 Minuten Verarbeitung.

## Phase 8: Installation auf Ihrem iPhone [Sie]

1. In App Store Connect beim Build die Frage zur **Exportkonformität** beantworten (nur HTTPS, Standardverschlüsselung; im Zweifel Rückfrage). Ohne Antwort bleibt der Build „Fehlende Compliance“.
2. Den Build der internen Gruppe „Intern“ zuweisen.
3. Auf dem iPhone: **TestFlight** aus dem App Store laden, mit derselben Apple-Kennung anmelden, „Vision Universe“ installieren.
4. Testen nach Liste in [TESTFLIGHT_PLAN.md](TESTFLIGHT_PLAN.md) §6. Einzelheiten, die ich brauche: Fehlermeldungen, Bildschirmfotos, ob die Passwortmaske nach dem Neustart erneut fragt.
5. Anmeldung in der App: Konto-E-Mail und Passwort wie im Web. Die Anmeldung läuft in dieser Phase direkt gegen Supabase (nur geschlossene TestFlight-Phase, siehe [SECURITY_LOGIN.md](SECURITY_LOGIN.md)).

## Was ausdrücklich nicht passiert
- Kein Store-Antrag, keine Apple-Prüfung, kein externer Tester, keine Store-Käufe.
- Keine Änderung an Web, Worker, Datenbank, Stripe oder an der Passwortmaske.
- Kein Geheimnis im Repository.

## Wenn Sie doch lieber Xcode Cloud nutzen
Voraussetzung ist einmalig ein Mac (geliehen oder gemietet), denn Apple richtet den ersten Workflow in Xcode ein ([Apple](https://developer.apple.com/xcode-cloud/get-started/)). Dafür entfallen Zertifikat, Profil, API-Schlüssel und GitHub-Geheimnisse. Das Skript `app/ios/App/ci_scripts/ci_post_clone.sh` ist vorbereitet. 25 Compute-Stunden pro Monat sind im Developer Program enthalten.
