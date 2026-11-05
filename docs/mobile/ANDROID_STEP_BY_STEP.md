# Android: erste interne Testversion, Schritt für Schritt (Windows-PC, Browser)

**Stand:** 05.11.2026 · Ziel: signiertes App-Bundle (AAB) bauen und in der **internen Testspur** der Play Console bereitstellen. Keine Veröffentlichung, keine Käufe, kein automatischer Upload zu Google.
Gleiche Geheimnisregeln wie bei iOS ([TESTFLIGHT_STEP_BY_STEP.md](TESTFLIGHT_STEP_BY_STEP.md), „Regeln für alle Geheimnisse“): Schlüssel, Passwort und Base64-Werte nur in Passwortmanager und GitHub-Geheimnisse, nie in Chat, Commit oder Screenshot.
Stand der Technik: Bauprobe `app-android-build.yml` (ungesignt, läuft bei Änderungen unter `app/`) und `app-android-release.yml` (signiert, nur von Hand, Standard Vorprüfung).

## 1. Umgebung `app-android` in GitHub [Sie]
Repository → **Settings** → **Environments** → **New environment**: Name `app-android`. **Required reviewers** = Sie, **Prevent self-review** aus, **Admin-Bypass** aus, **Deployment branches** = nur `main`. Genau wie bei `app-testflight`.

## 2. Upload-Schlüssel erzeugen [Sie, Git Bash]
Git for Windows enthält OpenSSL; Java ist nicht nötig. Repository als ZIP von `main` entpacken, in Git Bash dorthin wechseln:
```bash
bash app/ci/make-android-upload-key.sh create
```
Es fragt ein **neues Passwort (mindestens 16 Zeichen)**: im Passwortmanager speichern. Ergebnis in `~/vu-android-signing`: `vu-android-upload.p12` (**geheim**, Alias `upload`) und `vu-android-upload-cert.pem` (nicht geheim, für einen späteren Schlüssel-Reset aufbewahren). Beides zusätzlich in den Passwortmanager (Datei-Anhang). Das Skript verweigert Git-Ordner und Cloud-Ordner (OneDrive usw.).

## 3. Geheimnisse und Variablen [Sie]
In der Umgebung `app-android`:

| Art | Name | Wert |
|---|---|---|
| Secret | `ANDROID_UPLOAD_KEYSTORE_BASE64` | `bash app/ci/make-android-upload-key.sh clip` legt das Base64 in die Zwischenablage; einfügen; Zwischenablage danach leeren (Win+V) |
| Secret | `ANDROID_UPLOAD_KEYSTORE_PASSWORD` | das Passwort aus Schritt 2 |
| Variable | `VU_SUPABASE_URL` | Supabase-URL (öffentlich) |
| Variable | `VU_SUPABASE_PUBLISHABLE_KEY` | **Publishable** Key, nie den Secret-/Service-Schlüssel |

Danach `bash app/ci/make-android-upload-key.sh clean` (löscht den Arbeitsordner), **erst wenn** Passwortmanager und GitHub alles haben.

## 4. Vorprüfung [Sie lösen aus, Claude liest]
Actions → **App - Android signiert (intern, von Hand)** → **Run workflow**, Branch `main`, Haken **preflight_only** an (Standard) → Freigabe bestätigen. Geprüft werden: Geheimnisse da, Keystore öffnet sich, privater Schlüssel vorhanden, Zertifikat gültig bis mindestens 2033. Es werden keine Werte ausgegeben (nur Ablaufdatum und der öffentliche Fingerabdruck).

## 5. Signiertes Bundle bauen [Sie]
Wieder **Run workflow**, Version `0.1.0`, **preflight_only aus**, Freigabe bestätigen (ca. 5 Minuten). Am Ende des Laufs unter **Artifacts** `vision-universe-android-aab` herunterladen (ZIP entpacken: `vision-universe-0.1.0-<Nr>.aab`). Das Artefakt liegt 7 Tage dort und enthält nur die App, keinen Schlüssel.

## 6. In die interne Testspur hochladen [Sie, Play Console]
1. App „Vision Universe“ → **Testen und veröffentlichen** → **Testen** → **Interner Test** → **Neuen Release erstellen**.
2. Beim ersten Mal fragt Google nach **Play App Signing**: **zustimmen** (Google verwaltet den App-Signaturschlüssel, Ihr Upload-Schlüssel beweist nur den Upload).
3. `.aab` hochladen, Release-Name vorgeschlagen lassen, **Speichern**, **Release prüfen**, **Einführung starten (interner Test)**.
4. Tester (Ihre E-Mail-Liste „Test Vision Universe“) bekommen den Testlink: im Reiter **Tester** „Link kopieren“, auf dem Android-Gerät öffnen (mit der eingetragenen Google-Adresse angemeldet), **Tester werden**, App installieren.
5. Meldet Google beim Hochladen etwas zum **Ziel-API-Level** oder zu fehlenden Angaben, Fehlertext ohne Zugangsdaten an Claude geben.

## 7. Spätere Updates
Neue Version nur bei Änderungen an der App-Hülle (siehe [ANDROID_PLAN.md](ANDROID_PLAN.md)): Schritt 5 (höhere Laufnummer automatisch) und 6 wiederholen. Webseiten-Inhalte und Design kommen live aus dem Web, ohne neues Bundle.
