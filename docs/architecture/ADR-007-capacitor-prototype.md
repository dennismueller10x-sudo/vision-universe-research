# ADR-007: Capacitor als begrenzter iOS-Prototyp

**Status:** vom Owner bestätigt (03.11.2026, Phase 2), begrenzter Prototyp. **ADR-004 bleibt gültig.** Diese Entscheidung ersetzt sie nicht und ändert die Reihenfolge PWA → `/v1/` → Expo nicht.
Messwerte und Ergebnis: [docs/mobile/PHASE1_REPORT.md](../mobile/PHASE1_REPORT.md).

## Anlass

ADR-004 hat einen Capacitor-Wrapper abgelehnt, weil die Seiten heute große JSON-Dateien laden, keinen Offline-Zustand haben und Web-Schulden in die App trügen.
Der Owner hat am 03.11.2026 einen **begrenzten technischen Prototyp** zugelassen, um diese Annahmen zu messen statt zu vermuten.
Die langfristige Wahl zwischen Capacitor und Expo fällt erst nach den Testergebnissen auf einem echten iPhone.

## Entscheidung

1. **Capacitor 7 nur als Prototyp**, in einem eigenständigen Verzeichnis `app/`. Das Verzeichnis hat eine eigene `package.json` und eigene Tests. Keine Webseite, kein Workflow, kein Worker und keine Datenpipeline hängt davon ab.
2. **Der Prototyp verändert nichts am Bestehenden.** Keine Änderung an GitHub Pages, `workers/vu-account`, Supabase, Stripe oder Workflows. Die Webseiten bleiben unverändert.
3. **Schmale native Hülle (Shell) statt gebündelter Produkte.**
   - Im App-Bundle liegt nur die Shell (`app/www`, rund 30 KB ohne Plugin-Bundle): Tab-Leiste, Konto, Watchlist, Offline-Hinweis.
   - Die Produktbereiche Discover, Quant, Technical und Supertrader werden zur Laufzeit von `research.visionuniverse.de` in einem Rahmen geladen. Es werden **keine Daten und keine Produktseiten gebündelt.**
   - Konto und Watchlist sind in der Shell gebaut und sprechen die Konto-API mit Bearer-Token. Darüber lässt sich die Synchronisierung zwischen Web und App messen.
4. **Anmeldung mit Bearer-Token, ohne Worker-Änderung.**
   - Die App meldet sich direkt bei Supabase Auth an (Passwort-Grant und Refresh-Grant). Der Worker prüft das JWT bereits als `Authorization: Bearer` (`workers/vu-account/src/auth.mjs`), Anfragen mit Bearer sind von der CSRF-Prüfung ausgenommen. Es gibt nur **eine** Benutzer-ID für Web und App.
   - Das Token liegt **nie in `localStorage`, `sessionStorage`, Cookies oder IndexedDB.** Nativ: iOS-Keychain über `@aparajita/capacitor-secure-storage`, Zugriffsklasse `whenUnlockedThisDeviceOnly` (kein iCloud-Abgleich). Im Browser (nur Entwicklung und Test): Arbeitsspeicher. Ein Wächtertest sichert das.
   - Offline ist keine Abmeldung. Ein vom Server abgelehnter Refresh-Token meldet ab. Refresh läuft einmalig gleichzeitig (Single-Flight), weil Supabase Refresh-Tokens rotiert.
   - **Keine Registrierung in der App.** Die Registrierung hat im Worker ein Tor (`VU_REGISTRATION_ENABLED`, Positivliste). Ein direkter Supabase-Signup würde es umgehen. Registrierung bleibt im Web.
5. **Research-Passwortmaske bleibt unverändert.** Sie liegt über den Seiten im Rahmen. Die App umgeht sie nicht und liest ihren Schlüssel nicht. Wer testet, gibt das Passwort wie im Browser ein.
6. **Keine Zahlungen.** Weder Stripe noch StoreKit noch RevenueCat. Ein Wächtertest verbietet entsprechende Bezeichner in `app/www`.
7. **Keine Veröffentlichung.** Kein Store-Eintrag, kein öffentlicher TestFlight-Link. Nächster Meilenstein ist ein interner TestFlight-Build (ohne App-Review), erst nach der Entscheidung unten.

## Wie statische Dateien, mobile API und dynamische Daten zusammenspielen

| Schicht | Quelle | Sicherheit |
|---|---|---|
| Shell (HTML, JS, CSS, Icons) | App-Bundle | Content-Security-Policy ohne `unsafe-inline`/`unsafe-eval`, feste Verbindungsziele |
| Marktdaten und Produktseiten | `research.visionuniverse.de` (statisch, CDN) | öffentlich gecacht, Passwortmaske unverändert |
| Konto, Watchlist, Entitlements | `konto.visionuniverse.de` `/v1/*` mit Bearer | JWT-Prüfung im Worker, RLS in Supabase |
| Anmeldung | Supabase Auth (`/auth/v1/token`) mit Publishable Key | nur der öffentliche Schlüssel in der App, kein Service-Schlüssel |
| Token | Keychain | nie im Web-Speicher |

Native HTTP-Aufrufe (`CapacitorHttp`) laufen ohne CORS. Dadurch ist keine Änderung der Origin-Liste im Worker nötig. Der Rahmen lädt Seiten, die weder `X-Frame-Options` noch `frame-ancestors` senden (am 03.11.2026 für `research.visionuniverse.de` gemessen). Ändert sich das, bricht die Einbettung. Das ist ein Risiko dieses Ansatzes.

## Folgen

- Neue Abhängigkeiten gibt es nur in `app/` (Capacitor, ein Keychain-Plugin, esbuild als Build-Werkzeug). CLAUDE.md „Node 22 ohne Abhängigkeiten“ gilt für die Web-Pipeline weiter.
- `app/` wird **nicht** mit der Webseite ausgeliefert: `permitted()` in `scripts/vu2/build-release.mjs` schließt `app/` aus (Owner-Freigabe Phase 2). Nachweis: vollständiger lokaler Release-Ablauf mit Vergleich gegen einen Build ohne Ausschluss, siehe Bericht und `app/scripts/verify-release.sh`.
- Die großen JSON-Dateien aus ADR-004 bleiben das eigentliche Problem. Die Messung steht im Bericht, die Maßnahmen sind **dokumentiert, nicht umgesetzt**, weil sie Fachprodukte berühren (eigene PRs je Produkt).

## Ausstiegskriterien (Wechsel zu Expo, ADR-004 Stufe 3)

Der Prototyp wird beendet und Expo vorgezogen, wenn auf einem echten iPhone eines davon eintritt:

1. Chart-Gesten (Technical, Quant) kollidieren mit dem Rahmen und lassen sich nicht ohne Eingriff in die Seiten beheben.
2. Quant-Aktie lädt im Mobilfunk über 15 s bis zur Bedienung, oder die WebView wird wegen Speicher neu geladen.
3. Die Passwortmaske oder Drittanbieter-Speicher-Regeln (ITP) machen den Rahmen für Tester unbrauchbar.
4. Eine Store-Prüfung nach Richtlinie 4.2 ist für eine Webhülle nicht realistisch (Einschätzung vor dem öffentlichen Start, nicht jetzt).

Gemessene Werte stehen im Bericht; die Schwellen sind Vorschläge und vom Owner zu bestätigen.

## Bestätigung und Stand Phase 2 (03.11.2026)

Owner-Entscheidungen: Capacitor bis zum privaten TestFlight-Gerätetest fortführen; ADR-007 als begrenzter Prototyp bestätigt, ADR-004 bleibt; **keine Store-Käufe** in der ersten Testversion; Research-Passwortmaske unverändert; keine produktiven Deployments und keine eigenständigen Merges; Icon und Startbild bleiben vorläufig.

Ergänzungen:
- **Anmeldeschiene umschaltbar** (`authTransport`: `supabase` oder `worker`). Direkt-Supabase umgeht das Tempolimit des Workers und ist nur für den privaten Test vertretbar. Der Worker-Weg ist als Vorschlag spezifiziert ([SECURITY_LOGIN.md](../mobile/SECURITY_LOGIN.md)) und braucht einen eigenen PR.
- **Rahmen sind Prototyp.** Das Zielbild ohne Verschachtelung steht in [UI_INTEGRATION.md](../mobile/UI_INTEGRATION.md) (Etappe B: App-Modus im Hauptfenster).
- **Messung korrigiert:** Phase 1 hat die Quant-Aktie überschätzt (Quelltext statt Release). Siehe [PERFORMANCE.md](../mobile/PERFORMANCE.md).
- **Buildweg:** Empfehlung Xcode Cloud für den ersten privaten Upload, GitHub-Actions-Vorlage inaktiv bereitgestellt ([TESTFLIGHT_PLAN.md](../mobile/TESTFLIGHT_PLAN.md)).
