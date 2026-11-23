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
| Touch-Ziele (390 px) | alle ≥ 24 px (2.5.8 erfüllt). 23.11.2026: Trefferfläche 44 px für „Alle ›“ (Quant und `vu-sect`), Such-KI-Knopf, Insights-Link auf Willkommen; Discover-Chips und Quant-Reiter haben 44 px über `::after`. Offen, gesperrt: Zeitraum-Knöpfe 33–43 px breit (`.vu-ranges button` in `assets/site-navigation.css`, Vorschlag `min-width:44px` prüfen auf 320 px), Link „NVIDIA · Übersicht“ 30 px hoch (`assets/stock-navigator.css`, Vorschlag Trefferfläche per `::before`) | niedrig | teilweise behoben |
| Chart-Beschriftung | Diagramme tragen `role="img"` mit `aria-label`; Prozentwerte lesen als „Plus 71 Prozent“ | – | ohne Änderung |
| Kennzahl-Karten | Name aus sichtbarem Inhalt, Zusatz (Platz, Kürzel, Zeitraum) als verstecktes Wort dahinter | mittel | behoben (Discover, Willkommen, Supertrader) |
| Fehlermeldungen (Konto) | Meldung stand in höflicher Statusregion, Felder ohne Bezug zur Meldung | mittel | behoben: Fehler als `role="alert"`, Felder `aria-describedby`, Markierung fällt beim Tippen |
| Zwei `h1` auf `/aktie/` | Das zweite `h1` („Welche Aktie willst du sehen?“) steht in `#ak-none`, das bei gültigem Kürzel `display:none` ist (nicht im Zugänglichkeitsbaum) | – | kein Befund |

## Dateien unter UI-Schutz (Owner-Freigabe 22.11.2026, nur Beschriftungen und Sprunglink)

| Datei | Änderung |
|---|---|
| `assets/site-navigation.js` | Welten-Knopf: Name aus dem sichtbaren Inhalt („Home Start: Bereiche öffnen“) statt `aria-label`; Sprunglink „Zum Inhalt“ als erstes Element, nur wo die Seite keinen eigenen hat (Start, Mein Dashboard, Konto u. a.). Der KI-Knopf bleibt (axe 4.10.3 ohne Befund). |
| `assets/stock-navigator.js` | `aria-label` am Link „NVIDIA · Übersicht“ entfernt. |
| `quant/app/pages.js` | Marktlage-Kachel: `aria-label` entfernt, „Alle Maße öffnen“ als verstecktes Wort. |
| `quant/app/page-stock.js` | Kapitel-Knopf: Name aus der Zahl plus verstecktem Wort „Kapitel: alle öffnen oder schließen“. |

Revisionen: `docs/quality/ui-protection-revisions/barrierefreiheit-*.json`. Die Basis in `scripts/quality/a11y-baseline.json` ist leer.
