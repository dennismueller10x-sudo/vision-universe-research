# Mobile App Phase 2: Abschluss PR #1280, Sicherheit, Zielbild, Performance, TestFlight

**Stand:** 03.11.2026 · Vorgänger: [PHASE1_REPORT.md](PHASE1_REPORT.md) · Entscheidung: [ADR-007](../architecture/ADR-007-capacitor-prototype.md)
Kennzeichnung: **[ok]** gemessen oder getestet · **[offen]** nicht verifiziert · **[fehlt]** nicht vorhanden. Nichts wurde deployt, nichts bei Apple oder Google angelegt, kein Merge.

## 1. PR #1280 fertiggestellt

| Punkt | Ergebnis |
|---|---|
| CI-Ergebnisse (Stand nach Phase 1) | 39 Prüfungen: `core`, `contract`, `marker` und die Vorschauen (Cloudflare Pages, Vercel) **erfolgreich**, alle übrigen übersprungen (Pfadfilter), **keine fehlgeschlagen**. Nach den Phase-2-Commits ist die CI neu zu prüfen [offen, läuft nach dem Push]. |
| Nur vorgesehene Dateien | `git diff origin/main...HEAD`: nur `app/`, `docs/mobile/`, `docs/architecture/ADR-007-…` und die zwei vom Owner freigegebenen Pfade `scripts/vu2/build-release.mjs` (eine Zeile) und `quant/tests/release-delivery.test.mjs` (Prüfzeilen für den Ausschluss). Ein Wächtertest in `app/tests/guards.test.mjs` sichert die Liste. |
| `app/` aus der Pages-Auslieferung ausgeschlossen | **[ok]** `permitted()` verweigert `app/…`. |
| Beweis mit vollständigem Release-Test | **[ok]** `bash app/scripts/verify-release.sh <Ordner> <Referenz>`: Rohbuild (83.718 Dateien) gegen einen Referenzbuild **vom selben Stand ohne Ausschluss** (83.754 Dateien): Unterschied ist genau `app/` (36 Dateien) und vier Bauzeitstempel (`generatedAt`). Danach die Schritte aus `pages-release.yml`: Quant-Bundle verkleinern (555 Dateien, 11,9 MB auf 7,7 MB), Code-Kennung, **Production-Smoke über den Release (clean)**, Passwortsperre (4.839 Seiten), **Production-Smoke durch die Passwortsperre (clean)**, `app/` fehlt im Endpaket. |
| Release-Test der Branch-Änderung selbst | `quant/tests/release-delivery.test.mjs` 3/3 bestanden (inkl. neuer `app/`-Zeilen) |
| Bekannte Quant-Fehler nicht repariert | **[ok]** unverändert, siehe Abschnitt 7 |
| Merge von `main` in den Branch | `origin/main` (Datenläufe) wurde eingemischt, damit der Release-Test den aktuellen Stand baut. Der PR-Diff gegen `main` bleibt auf die Pfade oben beschränkt. |

## 2. Sicherheit und Login

Ausführlich: [SECURITY_LOGIN.md](SECURITY_LOGIN.md).

- **Tempolimit:** Direkte Supabase-Anmeldung umgeht das Worker-Limit (10 je IP/5 min, 30 je Adresse/h). Es gelten nur die Supabase-eigenen Grenzen (Höhe nicht abgerufen [offen]). Das Repository setzt dafür nichts. **Für den privaten Test vertretbar, für Öffentliches nicht.**
- **Umsetzung:** Die App hat jetzt zwei umschaltbare Anmeldeschienen (`authTransport`: `supabase` oder `worker`). Die Worker-Schiene ist implementiert und gegen einen simulierten Worker getestet. Der Worker-Teil selbst **fehlt** und ist als **separater PR vorgeschlagen** (`POST /v1/auth/app/login|refresh|logout`, gleiche Limits und Fehlerzustände, Tokens im Antworttext, nur für Anfragen ohne Cookie und ohne Browser-Origin). Es wurde nichts am Worker geändert.
- **Tests (36 App-Tests, davon 10 neu):** Keychain-Zugriffsklasse `whenUnlockedThisDeviceOnly` ohne iCloud-Abgleich und genau ein Eintrag; Ablage scheitert gleich keine Sitzung (`STORAGE_FAILED`); Erneuerung nur ein Aufruf gleichzeitig und Rotation; abgelehnter Refresh löscht den Eintrag; Offline bleibt angemeldet (auch beim Kaltstart mit abgelaufenem Token); Abmelden löscht lokal zuerst; Kontowechsel ersetzt alles; Token tauchen nie in Fehlern oder Konsole auf.
- **Nicht prüfbar ohne Gerät [offen]:** echte Keychain (Neustart, Sperre, Neuinstallation), Supabase-Rotation mit echtem Wiederverwendungsfenster, Erneuerung nach Stunden im Hintergrund.
- **Bestehende Kontrollen nicht umgangen:** Registrierung bleibt im Web (Tor im Worker), Passwortmaske unverändert, kein Service-/Secret-Schlüssel in der App.

## 3. Mobile Oberfläche (Zielbild)

Ausführlich: [UI_INTEGRATION.md](UI_INTEGRATION.md). Kern:

- Der Rahmen (iframe) des Prototyps erzeugt doppelte Navigation, doppelte Scrollbereiche und getrennten Speicher. Er gilt nur bis zum Gerätetest.
- Die Webseite hat bereits eine mobile Bottom-Navigation (`data-vu-dock` in `assets/site-navigation.*`) und UMD-Engines ohne DOM.
- **Etappen:** B = App-Modus im Hauptfenster (kleinster Eingriff: User-Agent-Kennung, gemeinsame Shell blendet Web-Kopf aus, Brücke für Token und Deep Links); C1 = native Tab-Leiste mit Web-Inhalt; C2 = native Kernbildschirme mit den Engines (ADR-004 Stufe 3).
- **Empfehlung:** Etappe B nach dem Gerätetest; Produktmodule bleiben unverändert. Zielbild: native Navigation, eine Anmeldung, Deep Links, ehrlicher Offline-Zustand.
- Keine Änderung an Produktseiten in diesem PR.

## 4. Performance

Ausführlich: [PERFORMANCE.md](PERFORMANCE.md).

- **Korrektur an Phase 1:** `factors-FULL_UNIVERSE.json` (19 MB) wird in Produktion **nicht** für die Quant-Aktie geladen. Der Release-Build erzeugt Faktor-Shards (`product-shards/`), `product-services.js` nimmt sie zuerst. Phase 1 hatte den Quelltext gemessen. **Quant-Aktie im Release: 1,07 MB Wire, 3,6 MB entpackt, 47 Anfragen, 7,2 s gedrosselt** (statt 3,55 MB / 25,7 MB / 21,8 s).
- **Tatsächlich größte Probleme (Release):** Supertrader `signals-core.json` (4,2 MB entpackt), Discover Start (127 Anfragen, kein ruhiger Netzzustand in 20 s), Discover-Aktie (`credits.json` 1,7 MB, `instruments/NVDA.json` 547 KB), `intraday/index.json` (473 KB auf jeder Seite).
- Maßnahmen als Rangliste mit erwartetem Effekt dokumentiert, **nicht umgesetzt** (jeweils Produkt-PR mit Gates). Keine Fachprodukt-Daten verändert.

## 5. TestFlight

Ausführlich: [TESTFLIGHT_PLAN.md](TESTFLIGHT_PLAN.md).

- **Buildweg (geändert in Phase 3):** GitHub Actions mit macOS-Runner und manueller Signierung, weil das ohne eigenen Mac geht. Xcode Cloud braucht für die Ersteinrichtung einen Mac. Siehe [TESTFLIGHT_STEP_BY_STEP.md](TESTFLIGHT_STEP_BY_STEP.md).
- Das Repository ist öffentlich (anonym erreichbar); für Xcode Cloud entsteht daraus kein Zugriffsproblem, Geheimnisse dürfen aber nie ins Repository.
- Vorbereitet (inaktiv): `app/ci/ios-testflight.workflow.yml.template`, `app/ci/fastlane/Fastfile`, `app/ci/make-signing-request.sh`, `app/ios/App/ci_scripts/ci_post_clone.sh` (Xcode Cloud).
- Alle Apple-Angaben (Kontingente, Rollen, Xcode-Versionen) sind mein Wissensstand und mit [prüfen] markiert; ich habe nichts bei Apple abgerufen.

## 6. Was bis zum ersten iPhone-Test noch fehlt, und wer es tut

| # | Was | Wer | Aufwand |
|---|---|---|---|
| 1 | **Apple Developer Program** beitreten (Organisation: D-U-N-S, Wartezeit) | **Owner** | Tage |
| 2 | **App-ID** `de.visionuniverse.app` registrieren und **App-Eintrag** in App Store Connect anlegen (Namen prüfen) | **Owner** | Minuten |
| 3 | **Interne Tester** als App-Store-Connect-Nutzer anlegen, TestFlight auf dem iPhone installieren | **Owner und Tester** | Minuten |
| 4 | **Supabase-URL und Publishable Key** (öffentlich) liefern | **Owner** | Minuten |
| 5 | **Zertifikat, Profil, API-Schlüssel und GitHub-Umgebung `app-testflight`** einrichten (Anleitung: `TESTFLIGHT_STEP_BY_STEP.md`, Phasen 3 bis 5). Ohne Mac möglich. | **Owner** (Claude liefert Skript, Fastfile, Workflow) | etwa 1 Stunde |
| 6 | **Exportnachweis** (nur HTTPS, Standardverschlüsselung) beantworten | **Owner** | Minuten |
| 7 | **PR #1280 prüfen und freigeben**, damit der Stand für Tag und Build feststeht (oder den Branch taggen) | **Owner** | |
| 8 | **Tag `app-v0.1.0` setzen**, erst nach ausdrücklichem Beschluss | **Owner** | Sekunden |
| 9 | Erste Builds **reparieren**: Das Projekt wurde nie gebaut. Mit ein bis drei Durchläufen für `pod install`, Xcode-Version, Info.plist, Privacy Manifest ist zu rechnen. | **Claude** nach den Xcode-Cloud-Logs | je Durchlauf etwa 15 bis 30 Minuten |
| 10 | **Gerätetest** nach Liste in `TESTFLIGHT_PLAN.md` §6, Messwerte nachtragen | **Tester und Claude** | etwa 1 bis 2 Stunden |

Entscheiden muss der Owner außerdem: Direktanmeldung (Schiene `supabase`) für den privaten Test beibehalten (empfohlen, wenige bekannte Tester) und den Worker-PR erst vor dem öffentlichen Start anstoßen.

## 7. Regressionen (lokal, Linux)

Lokal auf Linux, Stand nach den Phase-2-Änderungen:

| Suite | Ergebnis |
|---|---|
| App-Unit-Tests (`cd app && npm test`) | 36/36 bestanden |
| Browser-Machbarkeitsnachweis (`node app/scripts/poc-browser.mjs`) | 22/22 bestanden |
| `core/tests`, `technical/tests`, `scripts/access-gate/build.test.mjs` | 407 Tests, 407 bestanden |
| `quant/tests` | 3922 Tests, 4 fehlgeschlagen (dieselben vier wie in Phase 1, vorbestehend auf `main`, nicht repariert, offener PR #1279 betrifft dasselbe Thema) |
| Release-Test (`app/scripts/verify-release.sh`) | bestanden, siehe Abschnitt 1 |

Hinweis zu einem fünften, nur einmaligen Fehler im Quant-Lauf: `P0.5 --help … schreibt nichts` prüft, dass sich `git status` während des Laufs nicht ändert. Ich habe währenddessen Dokumente geschrieben. Allein ausgeführt besteht der Test (6/6). Es ist kein Fehler des Codes.

Nicht erneut ausgeführt in Phase 2 [offen]: Konten-Suiten, Discover/Supertrader/Screener, Python-Quant-Tests, Datenbank-Tests der Konten (`PG_TEST_URL`). Phase 2 berührt davon nichts außer `permitted()` (Release-Auslieferung), dessen Folgen der Release-Test abdeckt.
