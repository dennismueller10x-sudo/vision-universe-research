# TestFlight-Plan: macOS-Buildweg, Apple-Konfiguration, erster privater Upload

**Stand:** 03.11.2026 (Phase 2) · Nichts davon wurde ausgeführt. Kein Apple-Zugang, kein Upload, keine Veröffentlichung.
Angaben zu Apple-Produkten (Kontingente, Rollen, Xcode-Versionen) sind mein Wissensstand und wurden in dieser Sitzung **nicht** bei Apple geprüft. Sie sind als [prüfen] markiert und vor dem Start gegen die Apple-Dokumentation abzugleichen.

## 1. Was am Repository den Buildweg bestimmt

- Das Repository ist **öffentlich** (anonymer API-Aufruf liefert 200, 03.11.2026). Folge: Xcode Cloud braucht keinen Zugriff auf Privates, aber Apple liest Quellen mit; Secrets dürfen nie im Repository stehen (gilt ohnehin).
- Das iOS-Projekt liegt unter `app/ios/App` (Capacitor 7, **CocoaPods**: `Podfile`). Vor dem Xcode-Build sind nötig: `npm ci`, `npm run build:www` (Bundle der Plugins und `runtime-config.js`), `npx cap sync ios` (führt `pod install` aus).
- Der Web-Teil enthält nur **öffentliche** Werte (Supabase-URL und Publishable Key). Es gibt kein App-Geheimnis im Build.
- Projektregeln für Workflows (CLAUDE.md, ADR-005) gelten: Eingaben nur über `env:`, `permissions: contents: read`, Concurrency mit Ref-Name, Umgebung mit Prüfern für alles mit Geheimnissen, kein Rücksetzen auf `main`.

## 2. Vergleich der Buildwege (aktualisiert 03.11.2026, mit belegten Angaben)

Quellen: [Apple Xcode Cloud, Preise und Einrichtung](https://developer.apple.com/xcode-cloud/), [Apple Xcode Cloud, Start](https://developer.apple.com/xcode-cloud/get-started/), [GitHub-Dokumentation zu gehosteten Runnern](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Image-Beschreibung macos-26](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md), [Apple: SDK-Mindestanforderungen](https://developer.apple.com/news/upcoming-requirements/), [Apple: Einschreibung](https://developer.apple.com/support/enrollment/).

| Kriterium | **Xcode Cloud** | **GitHub Actions mit macOS-Runner** |
|---|---|---|
| **Eigener Mac nötig?** | Der erste Workflow wird laut Apple **in Xcode** eingerichtet („configure a workflow in Xcode“); danach lassen sich Workflows im Web bearbeiten und Builds starten. Ob die Ersteinrichtung rein im Web geht, steht in Apples Seiten nicht, eine Drittquelle verneint es. **Praktisch: einmal ein Mac nötig (geliehen/Mietmac genügt).** | **Nein.** Alles läuft im Browser, mit OpenSSL und auf dem Runner. |
| Laufende Kosten | Im Developer Program enthalten: 25 Compute-Stunden pro Monat, mehr ab 49,99 USD/Monat (100 h). Ein Capacitor-Build braucht grob Minuten, nicht Stunden (Schätzung). | Standard-Runner sind für **öffentliche** Repositories kostenlos und unbegrenzt (GitHub-Doku). Unser Repository ist öffentlich. Bei einem privaten Repository würden macOS-Minuten mit Multiplikator abgerechnet [prüfen]. |
| Fixkosten gleich | Apple Developer Program 99 USD pro Jahr (beide Wege) | dito |
| Signierung | **Apple verwaltet sie (Cloud-Signierung).** Wir halten kein Zertifikat. | Zwei Möglichkeiten: (1) **manuell** mit Distribution-Zertifikat (.p12) und App-Store-Profil, beides ohne Mac erzeugbar (OpenSSL, Developer-Portal im Browser); (2) Cloud-Signierung per API-Schlüssel. **Variante 2 ist unzuverlässig:** Apple-Forenberichte nennen Fehler bei Schlüsseln ohne Admin-Rolle und auf frischen Maschinen. **Empfehlung: Variante 1.** |
| Geheimnisse bei uns | keine | sechs: Team-ID, API-Schlüssel (.p8, Key-ID, Issuer-ID), .p12 plus Passwort, Profil. Alle nur in einer GitHub-Umgebung mit Prüfern. |
| Node/CocoaPods/Xcode | nicht vorinstalliert: `ci_post_clone.sh` installiert per Homebrew; Xcode-Version wählbar | **vorinstalliert** auf `macos-26`: Xcode 26.6 (Standard), CocoaPods 1.17.0, Node 22.23.4 (im Cache), fastlane 2.241.2. Apple verlangt für Uploads seit 28.04.2026 Xcode 26 oder neuer. |
| Anbindung an TestFlight | direkt, Verteilung integriert | Upload per fastlane und API-Schlüssel |
| Nachvollziehbarkeit | Konfiguration liegt bei Apple | Workflow und Fastfile liegen im Repository, Review per PR, Freigabe über Umgebung wie bei den Konten-Workflows |
| Passt zu unseren Regeln | gut | gut (Umgebung mit Prüfern, nur `workflow_dispatch` von `main`, `contents: read`) |
| Fehlersuche | Logs in App Store Connect | Logs in GitHub Actions, von mir lesbar |
| Risiko | Mac-Zugang einmalig organisieren | Signier-Einrichtung (Zertifikat/Profil) ist fehleranfällig; erste Läufe brauchen oft Korrekturen |

**Empfehlung (geändert gegenüber der früheren Fassung): GitHub Actions mit macOS-Runner und manueller Signierung.** Sie ist der einzige Weg, der **ohne eigenen Mac** sicher machbar ist, kostet für unser öffentliches Repository nichts extra, liegt im Repository und ist von mir debuggbar. Xcode Cloud bleibt die Alternative, wenn ein Mac verfügbar ist und Sie keine Zertifikate und Geheimnisse selbst verwalten wollen.
Vorbereitet ist: `app/ci/ios-testflight.workflow.yml.template`, `app/ci/fastlane/Fastfile`, `app/ci/make-signing-request.sh` (alle inaktiv). Schritt-für-Schritt (iPhone und Windows-PC, mit Regeln für Geheimnisse, gemeinsamer Vorprüfung und Vorprüflauf): [TESTFLIGHT_STEP_BY_STEP.md](TESTFLIGHT_STEP_BY_STEP.md).

## 3. Apple-Konfiguration, exakt

| # | Schritt | Wer | Ergebnis |
|---|---|---|---|
| 1 | **Apple Developer Program** beitreten (99 €/Jahr). Als Organisation: D-U-N-S-Nummer, Prüfung kann Tage dauern | Owner | Team-ID, Rolle Account Holder |
| 2 | **Zusätzliche Nutzer** nur mit nötiger Rolle anlegen (App Manager reicht für TestFlight) | Owner | optional |
| 3 | **App-ID** (explizit) registrieren: Bundle-ID `de.visionuniverse.app` (Vorschlag, Verfügbarkeit prüfen). Capabilities: keine | Owner | App-ID |
| 4 | **App-Eintrag in App Store Connect:** Plattform iOS, Name „Vision Universe“ (Verfügbarkeit prüfen), Primärsprache Deutsch, Bundle-ID, SKU | Owner | App-Eintrag |
| 5 | **Interne Tester:** Personen als App-Store-Connect-Nutzer anlegen (bis zu 100); sie installieren über die TestFlight-App. **Keine** Beta-App-Prüfung bei internen Testern [prüfen] | Owner | Testgruppe „Intern“ |
| 6 | **Exportnachweis:** App nutzt nur HTTPS (Standardverschlüsselung). Der Owner beantwortet die Frage in App Store Connect; danach kann `ITSAppUsesNonExemptEncryption` in `Info.plist` gesetzt werden | Owner entscheidet, Claude setzt | keine Rückfrage bei jedem Build |
| 7 | **Datenschutz (App Privacy)** in App Store Connect grob ausfüllen (Konto: E-Mail, Nutzer-ID; Diagnose: keine). Für intern genügt ein Minimum, für den Store Pflicht | Owner | Eintrag |
| 8 | **Xcode Cloud** (nur Alternative, braucht einmal einen Mac): Produkt „Xcode Cloud“ für die App aktivieren, GitHub-App „Xcode Cloud“ mit Zugriff auf **nur dieses Repository** freigeben, Workflow anlegen (siehe 5.) | Owner (Zugriffsfreigabe), Claude liefert Skript und Einstellungen | Workflow |
| 8b | **API-Schlüssel** (GitHub Actions): App Store Connect, Benutzer und Zugriff, Integrationen, Schlüssel mit Rolle App Manager (für Cloud-Signierung gegebenenfalls Admin) [prüfen]; `.p8` einmal laden, als GitHub-Geheimnis in der Umgebung `app-testflight` | Owner | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` |
| 9 | **Öffentliche Build-Werte** liefern: Supabase-URL und Publishable Key (Supabase, Project Settings, API) | Owner | `VU_SUPABASE_URL`, `VU_SUPABASE_PUBLISHABLE_KEY` |
| 10 | **iPhone** des Testers: iOS-Version ≥ Mindestversion der App (`IPHONEOS_DEPLOYMENT_TARGET = 14.0`), TestFlight-App installiert, Einladung angenommen | Tester | Installation |

### Signierung (Voraussetzungen)
- Distribution erfolgt **nur** über App Store Connect (TestFlight), kein Ad-hoc, keine Geräteregistrierung nötig.
- Xcode Cloud: Cloud-Signierung durch Apple, nichts bei uns.
- GitHub Actions: Distribution-Zertifikat (.p12) und App-Store-Profil, in einem temporären Schlüsselbund des Runners (fastlane `setup_ci`). Das ist in der Vorlage umgesetzt. Cloud-Signierung per API-Schlüssel ist laut Apple-Foren fehleranfällig und nicht die Vorlage.
- Niemals ins Repository, in Chat oder PR: `.p8`, `.p12`, Profile, Passwörter.
- `CURRENT_PROJECT_VERSION` muss je Upload steigen (Skript setzt `CI_BUILD_NUMBER` bzw. `GITHUB_RUN_NUMBER`), `MARKETING_VERSION` setzt der Tag bzw. die Eingabe.

## 4. Vorbereitet im Repository (alles inaktiv)

| Datei | Zweck |
|---|---|
| `app/ios/App/ci_scripts/ci_post_clone.sh` | Xcode Cloud: Node und CocoaPods installieren, Web-Teil bauen, `cap sync`, Build-Nummer setzen. Ohne Xcode Cloud ohne Wirkung. |
| `app/ci/ios-testflight.workflow.yml.template` | GitHub-Actions-Vorlage (Hauptweg), liegt außerhalb von `.github/workflows`, Umgebung `app-testflight` mit Prüfern, nur `workflow_dispatch` von `main` |
| `app/ci/fastlane/Fastfile` | Lane `beta`: Signierung, Archiv, TestFlight-Upload |
| `app/ci/make-signing-request.sh` | Schlüssel, CSR und .p12 per OpenSSL ohne Mac (CSR-Schritt hier getestet) |
| `app/README.md` | lokaler Ablauf auf einem Mac |

## 5. Ablauf des ersten privaten TestFlight-Uploads

Maßgeblich ist jetzt [TESTFLIGHT_STEP_BY_STEP.md](TESTFLIGHT_STEP_BY_STEP.md) (GitHub Actions, ohne Mac). Die folgende Tabelle beschreibt den Xcode-Cloud-Weg und gilt nur als Alternative.

| Schritt | Wer | Ergebnis / Prüfung |
|---|---|---|
| 0 | Owner | Entscheidungen: Weg A, Bundle-ID, Namen. Developer-Konto vorhanden (Tabelle 3, Schritte 1 bis 4) |
| 1 | Claude | PR #1280 mergen lassen (Owner gibt frei) oder Branch als Quelle verwenden |
| 2 | Owner | Öffentliche Werte als Workflow-Umgebungsvariablen in Xcode Cloud setzen (Schritt 9) |
| 3 | Owner | Xcode-Cloud-Workflow anlegen: Repository, Projekt `app/ios/App/App.xcworkspace`, Scheme `App`, Plattform iOS, **Auslöser nur Tag `app-v*`**, Aktion Archive, Nach-Aktion „TestFlight (nur interne Tests)“ |
| 4 | Owner | Tag setzen, z. B. `app-v0.1.0`, **nur nachdem er das ausdrücklich beschlossen hat** (kein automatischer Auslöser) |
| 5 | Xcode Cloud | `ci_post_clone.sh`: `npm ci`, `build:www`, `cap sync ios`; Archiv; Upload |
| 6 | Owner | Build erscheint in App Store Connect unter TestFlight; Verarbeitung abwarten; Exportnachweis bestätigen |
| 7 | Tester | Einladung, Installation über TestFlight |
| 8 | Tester + Claude | Gerätetest nach Liste (Abschnitt 6) |

Fehlerfälle: Build-Nummer wiederholt (Skript prüfen), `pod install` scheitert (Podfile, Capacitor-Version), Signierung (Rolle/Vertrag nicht akzeptiert: Vertragsbedingungen in App Store Connect bestätigen), Exportnachweis offen (Build bleibt „Fehlende Compliance“).

## 6. Gerätetest (erster tatsächlicher iPhone-Test)

1. Start, Startbild, Safe Areas (Notch, Home-Indikator) im Hoch- und Querformat.
2. Anmeldung, Abmeldung, App beenden und neu starten (Sitzung bleibt), Flugmodus (Offline-Hinweis, keine Abmeldung).
3. Watchlist-Abgleich mit Web (Eintrag im Web entfernen, in der App prüfen).
4. Die vier Produkte: Bedienbarkeit, Scrollen, Chart-Gesten (Zoom, Fadenkreuz), Tastatur bei Suche, Ladezeit im Mobilfunk.
5. Passwortmaske im Rahmen: Eingabe, Verhalten nach App-Neustart.
6. Speicher (Instruments oder Xcode-Messwerte) und Abstürze.
7. Messwerte aus `PERFORMANCE.md` auf dem Gerät wiederholen.
