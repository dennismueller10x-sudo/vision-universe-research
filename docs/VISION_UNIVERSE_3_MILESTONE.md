# Vision Universe 3.0 – Meilenstein 20.10.2026

Stand 21.10.2026 nach #817. Vision Universe 3.0 (VU3) ist bis auf **einen offenen Punkt** umgesetzt (siehe unten).

## Offene Punkte

| # | Punkt | Status | Abhängigkeit | Nächster Schritt |
|---|---|---|---|---|
| ~~OFFEN 1~~ | Fundamental im globalen Menü und eigenes Dock | umgesetzt (#817) | – | – |
| **OFFEN 2** | Europäische Kursdaten (Discover #778, u. a. Rheinmetall) | in Klärung | separater Codex-Auftrag mit Marketstack | Keine parallelen Änderungen oder Daten-Rebuilds. Nach der Behebung die temporäre Gate-Ausnahme zurücknehmen (siehe unten) |

### Temporäre Ausnahme im Discover-Gate (#819)

Seit #819 (vom Owner am 21.10.2026 freigegeben) blockiert der unveränderte Rheinmetall-Fehler das Discover-Browser-Gate nicht mehr. Die Ausnahme ist **temporär**:
- Sie greift nur für die Route `rheinmetall`, nur bei genau dieser Fehlersignatur und nur solange der Fingerabdruck über die europäischen Daten- und Codepfade gleich bleibt (`scripts/discover/known-defects.json`).
- Sie bleibt in jedem Lauf sichtbar (`::warning::`, Bericht, Job-Zusammenfassung). Alle anderen Fehler blockieren weiter.
- Das Zeitlimit des `frontend`-Jobs in `discover-frontend-ci.yml` ist vorübergehend 75 statt 35 Minuten, weil jeder Rheinmetall-Ladevorgang bis zum Prüf-Zeitlimit wartet (grüner Lauf auf #819: 56 Minuten).

**Rücknahme nach Behebung von #778:**
1. Eintrag `rheinmetall-europe-unavailable` aus `scripts/discover/known-defects.json` entfernen. Ändern die Codex-Daten den Fingerabdruck, greift die Ausnahme ohnehin nicht mehr.
2. Das Gate muss danach ohne Ausnahme grün sein.
3. `timeout-minutes` des `frontend`-Jobs auf 35 zurücksetzen, sofern die Laufzeit des grünen Laufs deutlich darunter liegt (vor dem Fehler: 13–17 Minuten).

## Umgesetzt

### Visual First in den bestehenden Welten
- Visual-First-Bausteine in Quant, Technik, Supertrader, Screener, Vorsorge, Hedgefonds, Elliott und Discover-US (#759–#783, #794).
- Kontrastlücken behoben: Screener-Startseite hell (#799), Supertrader „Regelwechsel“ dunkel (#798).
- Dashboard für Kunden: Debug-Badges entfernt, vom Dock verdeckte letzte Kachel korrigiert (#796).

### Regressionsprüfung (VU3 PR 11, #801)
- `scripts/quality/vu3-regression-qa.mjs`, CI-Job `vu3-regression` in `shell-ci.yml`, Chromium und WebKit (iPhone).
- Prüft:
  - Wege zwischen den Welten bei derselben Aktie
  - Farbschema über alle Welten
  - Visual-First-Bausteine je Welt (inkl. Fundamental 1.1–1.3)
  - axe-Kontrast über 25 Routen, hell/dunkel × 390/1440 px
- Europa-Routen sind ausgenommen, solange OFFEN 2 besteht.

### Fundamental 1.0 (VU3 PR 10)
Neue Produktwelt `/fundamental/` für US-Unternehmen. Sie liest nur bestehende, ausgelieferte Discover-Daten (Aktiendateien, Suchliste, Themen- und Regelzeilen). Es gibt keinen neuen Abruf, keinen Score und keine Empfehlung.

| PR | Inhalt |
|---|---|
| #800 | Welt, Kennzahlen, Verlauf je Geschäftsjahr, Datenlage, Quelle je Jahr mit Link zur SEC-Meldung, Methodik |
| #803 | Fundamental im Aktien-Navigator aktiv (5.066 von 6.130 US-Aktien mit SEC-Zahlen) |
| #806 | Wachstum (3/5/10 J), Profitabilität („Vom Umsatz zum Free Cashflow“, Margen, Eigenkapitalrendite), Bewertung (KGV-Skala zum Marktmedian, KUV, FCF-Rendite), Bilanz |
| #807 | „Im Vergleich“: gleicher kuratierter Sektor oder gleiches Discover-Thema mit ähnlichster Umsatzgröße; Wachstum, Profitabilität und Bewertung als Balken je Unternehmen |
| #808 | Startseite „Entdecken“: sechs Discover-Zeilen mit reinen SEC-Regeln als Kennzahl-Kacheln |
| #810 | Visuelle Gesamtprüfung iPhone/Desktop: Skalen beschriftet, wischbare Leisten mobil, keine Sackgasse |

Grundsätze in allen Teilen:
- Lücken bleiben sichtbar („keine Angabe“, „nicht vergleichbar“, „nicht plausibel“), es wird nichts geschätzt.
- Gleiche Definitionen auf Unternehmensseite, im Vergleich und auf der Startseite. Ein Test hält die Übereinstimmung mit den Discover-Zeilen fest.
- Richtungen werden ▲/▼ plus Text gezeigt, nie nur über Farbe.
- Kontrast nach WCAG AA.

Live-Prüfung 20.10.:
- Ausgeliefert sind `fundamental-model-1.3.0` und die Bausteine aus #810.
- Alle genutzten Dateien antworten mit 200. Der ausgelieferte Modell-Code läuft fehlerfrei gegen die ausgelieferten Daten (NVDA, KO, JPM, AAL, PLTR, BRK-B; sechs Startseiten-Zeilen mit je 30 Kacheln).
- Die regulären Pages-Releases 39452903840, 39454588097 und 39456619063 sind grün, inklusive Produktions-Smoke durch den Research-Zugangsschutz.

### Betrieb
- **Company Intelligence:**
  - Ursache des Produktions-Rollbacks (B4): Ein reiner Bookkeeping-Fehler in `observe` schloss das Gate. Seit #795 bleibt das Gate bei Bookkeeping-Fehlern offen; Live-, Daten-, Generations- und Sicherheitsfehler schließen es weiterhin.
  - Das Gate wurde nach einmaliger Owner-Freigabe wieder geöffnet. Live-QA und B4 wurden bestanden (Lauf 39389451240: Generation `aeb73c4f…`, Live-Verifikation 16/16, observe PASS).
  - Regulärer Betrieb alle 4 Stunden.
- **Vorsorge:** täglicher Neubau des ETF-Stamms aus eingecheckten Daten ohne Anbieterabruf (`vorsorge-daily-rebuild.yml`, #802). Das Reproduzierbarkeits-Gate ist damit nicht mehr dauerhaft veraltet.

## Hinweis zur lokalen Prüfung

`vu3-regression-qa.mjs` meldet lokal den Elliott-Baustein `.el-splitrow` als fehlend, weil `elliott-home.json` erst im Release-Bau entsteht und nie committet wird (EH-19). In der CI wird sie gebaut.
