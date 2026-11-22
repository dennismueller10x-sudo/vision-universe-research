# Barrierefreiheit (WCAG 2.2 AA): Befunde und Stand

Stand 22.11.2026 · Prüfung `scripts/quality/a11y-axe-qa.mjs` (axe-core 4.10.3 über Playwright, gegen den gebauten Release-Stand, abgemeldet, ohne Research-Passwort).
Seiten: Start, Willkommen, Discover (Start, Aktie, Suche, Europa), Quant (Start, Aktie), Technical, Supertrader, Mein Dashboard, Konto, Anmelden, Aktienübersicht `/aktie/`;
je Hell und Dunkel, 1440 px und 390 px. In CI läuft sie im Job `shell-browser-qa (chromium-390)` strikt gegen `scripts/quality/a11y-baseline.json` (die Basis darf nur kleiner werden).

## Ergebnis der automatischen Prüfung

| Regel (WCAG) | Schwere | Vorher | Nachher |
|---|---|---|---|
| `label-content-name-mismatch` (2.5.3 Beschriftung im Namen) | serious | Willkommen 12–13, Discover-Start 23–33, Discover-Aktie 20, Quant 2–3, Technical 1, Supertrader 16, Dashboard/Konto 1 (Desktop) | 0 |
| `scrollable-region-focusable` (2.1.1 Tastatur) | serious | `/aktie/` 1 | 0 |
| `color-contrast` | – | keine Verletzung; 3 bis 57 Knoten je Seite „zu prüfen“ (Text auf Bildern, Verläufen, Überlagerungen) | Sichtprüfung unten |

Alle übrigen Regeln (Namen, Rollen, Sprache, Landmarken, ARIA, Zielgröße 24 px, Farbe allein) ohne Befund.

## Manuell

| Bereich | Befund | Schwere | Stand |
|---|---|---|---|
| Kontrast auf Bildern (Willkommen, Insights-Karten, Story-Kreise) | Weiße Schrift auf dunklem Verlauf, Sichtprüfung hell/dunkel ohne Auffälligkeit | – | ohne Änderung |
| Tastatur | Fokusreihenfolge folgt der Leserichtung, keine positiven `tabindex`, Überspringen-Link auf allen Produktseiten außer Start, Mein Dashboard, Konto | niedrig | behoben: Sprunglink im Rahmen |
| Fokus sichtbar | `.tc-ts-input` (Technical-Screener, Ticker-Feld) ohne sichtbaren Fokus (`outline:none`, kein Ersatz) | mittel | behoben: Rahmen um das Feld bei Fokus (`.tc-ts-field:focus-within`) |
| Touch-Ziele (390 px) | alle ≥ 24 px (2.5.8 erfüllt); unter 44 px: Zeitraum-Knöpfe Quant 33–43 px breit, Chips Discover 34 px hoch, Fragezeichen-Knopf in der Suche 38 px, „Verdient gut …“-Reiter Quant 36 px; Text-Links „Alle ›“ in Quant 18 px | niedrig | Quant-Links auf 44 px Trefferfläche gebracht, Rest offen (Design) |
| Chart-Beschriftung | Diagramme tragen `role="img"` mit `aria-label`; Prozentwerte lesen als „Plus 71 Prozent“ | – | ohne Änderung |
| Kennzahl-Karten | Name aus sichtbarem Inhalt, Zusatz (Platz, Kürzel, Zeitraum) als verstecktes Wort dahinter | mittel | behoben (Discover, Willkommen, Supertrader) |
| Fehlermeldungen (Konto) | Meldung stand in höflicher Statusregion, Felder ohne Bezug zur Meldung | mittel | behoben: Fehler als `role="alert"`, Felder `aria-describedby`, Markierung fällt beim Tippen |
| Zwei `h1` auf `/aktie/` | Hinweis, kein WCAG-Verstoß | niedrig | offen |

## Dateien unter UI-Schutz (Owner-Freigabe 22.11.2026, nur Beschriftungen und Sprunglink)

| Datei | Änderung |
|---|---|
| `assets/site-navigation.js` | Welten-Knopf: Name aus dem sichtbaren Inhalt („Home Start: Bereiche öffnen“) statt `aria-label`; Sprunglink „Zum Inhalt“ als erstes Element, nur wo die Seite keinen eigenen hat (Start, Mein Dashboard, Konto u. a.). Der KI-Knopf bleibt (axe 4.10.3 ohne Befund). |
| `assets/stock-navigator.js` | `aria-label` am Link „NVIDIA · Übersicht“ entfernt. |
| `quant/app/pages.js` | Marktlage-Kachel: `aria-label` entfernt, „Alle Maße öffnen“ als verstecktes Wort. |
| `quant/app/page-stock.js` | Kapitel-Knopf: Name aus der Zahl plus verstecktem Wort „Kapitel: alle öffnen oder schließen“. |

Revisionen: `docs/quality/ui-protection-revisions/barrierefreiheit-*.json`. Die Basis in `scripts/quality/a11y-baseline.json` ist leer.
