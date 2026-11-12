# Laufzeit der CI-Prüfungen (Berichtsdatei 20261110)

Erhoben am 09.11.2026, bis 18:08 UTC. Je ci.yml und Produkt-Prüfworkflow die letzten bis zu 50 Pull-Request-Läufe (968 Läufe über 21 Workflow-Identitäten). Alte und gebündelte Workflows getrennt, damit gleichnamige Jobs verschiedener Inhalte nicht vermischt werden. Nur erfolgreich abgeschlossene Jobs für die Laufzeitmediane; abgebrochene, übersprungene, fehlgeschlagene und laufende Jobs ausgeschlossen, Stichprobengröße pro Job angegeben. Dauer = completed_at − started_at, also ohne Warteschlange. Jeweils letzter Versuch eines Laufs. Alle Job-/Schrittwerte und Run-/Job-IDs im [Beleg](ci-laufzeit-20261110-belege.json).

| Job | n | Median | Größte Schritte und Ursache |
|---|---:|---:|---|
| shell-ci.yml / shell | 27 | 2090.0 s | Browser QA (Chromium 390, 430, 768, 1024, 1440 · WebKit iPhone 390, 430 and 1024): 1820.0 s; Build exact Pages delivery artifact: 161.0 s |
| ci.yml / shell-shell | 13 | 2002.0 s | Browser QA (Chromium 390, 430, 768, 1024, 1440 · WebKit iPhone 390, 430 and 1024): 1735.0 s; Build exact Pages delivery artifact: 142.0 s |
| social-ci.yml / test | 40 | 1313.0 s | Suiten und Test-/Produktionsisolation messen: 627.5 s; Der bestehende Quant-Bereich bleibt unberuehrt: 316.5 s |
| shell-ci.yml / vu3-regression | 31 | 1262.0 s | VU3 regression (Chromium all sections · WebKit iPhone journeys, theme, Visual First): 998.0 s; Build exact Pages delivery artifact: 158.0 s |
| ci.yml / shell-vu3-regression | 18 | 1220.0 s | VU3 regression (Chromium all sections · WebKit iPhone journeys, theme, Visual First): 974.5 s; Build exact Pages delivery artifact: 149.5 s |
| ci.yml / technical | 17 | 1212.0 s | Strategie-Akademie (360/390/1280 px, Hell/Dunkel, alle 32 Lektionen): 981.0 s; Run actions/checkout@v4: 61.0 s |
| technical-ci.yml / test | 32 | 1164.5 s | Strategie-Akademie (360/390/1280 px, Hell/Dunkel, alle 32 Lektionen): 930.5 s; Run actions/checkout@v4: 63.0 s |
| ci.yml / supertrader | 7 | 1054.0 s | Quant-2.0-Regression (bestehende Tests): 365.0 s; Exaktes Pages-Auslieferungsartefakt bauen: 160.0 s |
| supertrader-ci.yml / gates | 26 | 1017.5 s | Quant-2.0-Regression (bestehende Tests): 367.5 s; Exaktes Pages-Auslieferungsartefakt bauen: 159.0 s |
| ci.yml / vu2-browser-qa | 15 | 973.0 s | Direct links through the active access gate, slow networks and parallel loads: 399.0 s; Test desktop and mobile preview: 185.0 s |

## Befund

Die Shell-QA dominiert mit seriellen Browser-Routen und pro Navigation/Reload `networkidle` plus 500 ms festem Warten. Danach folgt VU3 mit seriellen Reisen. Technical prüft sechs Kombinationen × 32 Lektionen × drei Szenen einschließlich axe, Quiz und Speicherzustand. Social und Supertrader führen große Regressionen und Isolation aus. Der Pages-Neubau kostet mehrfach etwa 140–160 Sekunden; Checkout typischerweise 58–64 Sekunden. Playwright-Installation ist in diesen langsamsten Browserjobs wegen des Container-Images nicht der Hauptanteil.

## Versuch im Prüfcode (zurückgenommen)

Ein erster Entwurf (#1760) ersetzte in der Shell-QA `networkidle` plus 500 ms durch das Warten auf vorhandenen Kopf und Dock, fertige Schriften und beendete Shell-Animationen. Auf dem aktuellen `main` lief er in der Shell-CI (Lauf 43242962859, 12.11.2026) rot: Auf `/supertrader/…` und `/screener/?view=build` war die Produkt-Leiste zum Messzeitpunkt noch nicht da („keine Produkt-Leiste“), und `/konto/` brach mit „Execution context was destroyed“ ab. Das alte Warten fängt die späte Shell-Montage dieser Seiten ab. Der Code wurde zurückgenommen; die Shell-QA bleibt unverändert. Eine Beschleunigung ist damit weder belegt noch behauptet.

## Ausschließlich Vorschläge für Workflows

- Pages-Artefakt je Commit einmal bauen und identisch an Browser-Jobs weiterreichen; Byte-/Release-ID-Gates beibehalten.
- Checkout mit gemessenem sparse checkout auf die benötigten Produkt-/Datenpfade begrenzen; Referenz- und Git-Vertragstests erhalten.
- Playwright-Version und Container gemeinsam pinnen; Cache nach OS, Node, Lockdatei und Browserrevision trennen.
- Browser-/Viewport-Matrix in unabhängige Jobs teilen, alle bisherigen Kombinationen erhalten und Befunde als Artefakte zusammenführen.
- Unveränderte große Regressionen pro Commit einmal ausführen und als benötigten Check referenzieren; Isolation nicht abschalten.
- Abhängigkeits- und Build-Caches nur mit vollständigem Eingangsfingerabdruck und kalter Gegenprobe verwenden.

Diese Vorschläge wurden nicht in .github/workflows umgesetzt.
