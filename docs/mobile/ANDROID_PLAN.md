# Android-App „Vision Universe“: schlanker Entwicklungsplan

**Stand:** 04.11.2026 · Planung, nichts davon ist umgesetzt. **Priorität bleibt der erste iPhone-Test über TestFlight**; Android läuft parallel und darf iOS nicht verzögern (eigene PRs, eigener Workflow, keine Änderung an der iOS-Pipeline).
Kennzeichnung: **[Sie]** nur Sie · **[Claude]** ich · **[prüfen]** Angabe aus meinem Wissen über Google-Regeln, vor Ort gegenprüfen.

## 1. Ziel und Grenzen
- App-Name **Vision Universe**, Paket-ID **`de.visionuniverse.app`** (wie iOS; Verfügbarkeit zeigt sich beim Anlegen der App in der Play Console).
- Erstes Ziel: **interne Google-Play-Testversion** (nur Sie und eingeladene Tester), **keine öffentliche Veröffentlichung, keine Käufe**.
- Gleiche Konten wie das Web: Supabase-Login, gleiche Premium-Berechtigungen. Stripe-Web, Worker, Datenbank und Passwortmaske bleiben unverändert. Keine Service-Role-Schlüssel in der App.

## 2. Was am Capacitor-Projekt schon passt
- `app/` ist plattformneutral: Web-Teil `www/`, Login/Token-Logik in `www/js` (`auth.js`, `api.js`, `token-store.js`), `capacitor.config.json` mit `appId` und `appName`.
- Token-Speicher: `@aparajita/capacitor-secure-storage` nutzt auf Android den **Android Keystore** (Kommentar in `token-store.js`). Die iOS-Zugriffsklasse (`KeychainAccess`) wird auf Android ignoriert; **[Claude] prüft das im ersten Lauf** und stellt sicher, dass nie auf localStorage zurückgefallen wird (vorhandener Wächtertest).
- Was fehlt: `@capacitor/android` (Abhängigkeit), das Verzeichnis `app/android/`, Icons/Splash für Android (`app/resources` hat Vorlagen, `@capacitor/assets` erzeugt sie), ein `android`-Block in der Capacitor-Konfiguration.

## 3. Schritte (klein, in dieser Reihenfolge)
| # | Schritt | Wer |
|---|---|---|
| A1 | `@capacitor/android@^7` ergänzen, `npx cap add android`, Projekt in `app/android/` einchecken (ohne Build-Artefakte, `.gitignore` für `build/`, `local.properties`, `*.jks`, `*.keystore`) | Claude, PR |
| A2 | Android-Konfiguration: `android.allowMixedContent=false`, `server.androidScheme="https"`, Navigation nur `research.visionuniverse.de` (wie iOS), Namen/Icons, `minSdk` laut Capacitor 7 (API 23), `targetSdk` auf die aktuell von Google verlangte Stufe [prüfen] | Claude, PR |
| A3 | Wächtertests wie bei iOS: keine Schlüsseldateien im Repo, Workflow-Rumpf, kein Auto-Upload | Claude, PR |
| A4 | Workflow `app-android-internal.yml`: **nur von Hand**, `ubuntu-latest` (kein macOS nötig, schneller und günstiger), JDK 21, Gradle `bundleRelease` → **AAB**, Standard „nur bauen und prüfen“ (`upload` aus), Umgebung `app-android` mit Pflichtprüfer wie `app-testflight` | Claude, PR |
| A5 | Erster **Debug-/Unsigned-Build** in CI (nur Kompilierung, Tests, Größe), ohne Schlüssel | Claude |
| A6 | Upload-Schlüssel (Keystore) **nur lokal auf Ihrem PC** erzeugen, in Passwortmanager und GitHub-Secrets; Google verwaltet den App-Signaturschlüssel (Play App Signing) [prüfen] | Sie |
| A7 | Erster Upload des AAB in die **Play Console von Hand** (interne Testspur), dann optional automatisiert über einen Dienstkonto-Schlüssel (Secret `PLAY_SERVICE_ACCOUNT_JSON`, nur in der Umgebung) [prüfen: Google verlangt für die API einen vorhandenen App-Eintrag] | Sie / Claude |
| A8 | Tester per E-Mail in die interne Testspur einladen, App über den Testlink installieren | Sie, Android-Gerät |

## 4. Google-Play-Konto (Organisation, RAM Consulting UG) [prüfen]
- Einmalige Gebühr 25 USD. Organisationskonto braucht **D-U-N-S-Nummer** (haben Sie bereits für Apple), Firmenangaben, Website, Kontaktdaten, Verifizierung von Telefon und E-Mail und Identitätsprüfung.
- Interne Tests: bis zu 100 Tester, keine Prüfung durch Google in der Regel. Die 12-Tester-/14-Tage-Pflicht gilt für **private** Konten, nicht für Organisationskonten [prüfen].
- Für den späteren öffentlichen Release: Datenschutzerklärung-URL, Data-Safety-Formular, Inhaltsfreigabe, Zielgruppenangaben. Für die interne Testversion nur Grundangaben.
- Zahlungen: In der ersten Beta **keine Käufe**. Für digitale Inhalte in der Play-Store-App verlangt Google später in der Regel Play Billing; das entscheiden wir nach dem Gerätetest (wie bei iOS), nicht jetzt.

## 5. Risiken
- **iframes im Android-WebView**: wie bei iOS Prototyp-Lösung; Android-WebView kann sich bei Cookies/CSP anders verhalten. Wird im ersten Gerätetest geprüft.
- **Gradle/SDK-Versionen** ändern sich; wir pinnen sie im Workflow wie bei iOS (Wächtertest `workflow-npx-pinned`).
- **Zwei Plattformen, ein `app/`-Ordner**: Änderungen an `www/` wirken auf beide. Deshalb eigene Tests und getrennte Workflows.

## 6. Nicht Teil dieses Plans
Öffentliche Veröffentlichung, Käufe/Play Billing, Push-Nachrichten, Biometrie, Etappe B (App-Modus statt iframes) und alles an Quant/Elliott/Supertrader.
