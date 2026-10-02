# Chartbild — UI/UX-Spezifikation

**Seiten:** `/quant/#/aktie/<T>/chartbild` (Einfach | Profi), `/quant/#/chartlagen` (Übersicht), `/quant/#/methodik/chartbild` (Methodik & Evidenz), Teaser auf `/quant/#/aktie/<T>`.
**Dateien:** `quant/app/page-chartbild.js`, `quant/ui/ti-chart.js`, `quant/app/chartbild.css`, Texte `quant/engines/technical/ti/explain.js`.
**Sprache:** Deutsch, Produktsprache nach `product-language-v1.json` (keine „Intelligence"-Überschrift, kein „Kursziel", keine Prozent-Wahrscheinlichkeit, „Szenario/Zone/Bedingung").

## 1. Prinzipien

* **Ergebnis vor Methode.** Reihenfolge: Ausblick → Zonen → Chart → Szenarien → Warum → Evidenz → Zeitebenen → Profi.
* **Simple on the surface:** Einsteiger sehen einen Satz, vier Zahlen und einen Chart. Methode, Regeln und Quellen liegen eine Ebene tiefer (Profi).
* **Keine Scheingenauigkeit:** Zonen statt Punkte, gerundet auf Anzeigeschritte (≥ 200 $: 1 $, ≥ 50 $: 0,5 $, …), nach außen gerundet; Nachkommastellen nur, wo nötig.
* **Ehrlichkeit sichtbar:** Trefferquote immer neben Zufalls-Baseline; „Historisch kein Vorteil" wird ausgesprochen; Widersprüche zwischen Verfahren erscheinen als ✕ und „Gemischt".
* **Farbe nie allein:** Zonen tragen Text-Labels, Ungültig-Linie gestrichelt, Prüfpunkte mit ✓ ✕ ○ – und Screenreader-Wort.

## 2. Konsumenten-Ansicht (Antwort auf die 8 Fragen)

| Frage | Element |
|---|---|
| Was passiert gerade? | Hero: Ausblick in großer Schrift (Aufwärts/Abwärts/Seitwärts/Gemischt) + Lage („Rücksetzer im Aufwärtstrend") |
| Wahrscheinlichstes Szenario? | „Hauptszenario"-Karte (bewusst nicht „wahrscheinlichstes" — keine kalibrierte Wahrscheinlichkeit) + Erklärsatz |
| Interessante Zone? | Kachel „Einstiegszone 217–221" + Status („Kurs nähert sich der Zone") |
| Mögliche Ziele? | Kacheln Zielzone 1/2 |
| Wann falsch? | Kachel „Ungültig unter 208 · per Schlusskurs", rote gestrichelte Linie |
| Warum? | „Warum dieses Bild?" — bis 6 Prüfpunkte in Alltagssprache |
| Wie stark ist die Evidenz? | „Historische Evidenz": vergleichbare Lagen, Ziel-1-Quote, Zufall mit gleichem Abstand, typische Dauer (Quartile), Urteil |
| Welche Alternative? | Szenario-Karten Alternative + Randszenario, im Chart umschaltbar |

Hero-Chips: „Einigkeit der Verfahren: Hoch/Mittel/Niedrig" (Tooltip: keine Wahrscheinlichkeit) und die vereinfachte Wellenlesart („Möglicherweise letzter Schub der Bewegung", „Zwischenkorrektur innerhalb einer größeren Bewegung"). Keine Notation wie `((iii))` in der Einfach-Ansicht.

## 3. Chart

* SVG (scharf, zugänglich, druckbar; 63–260 Bars). Kerzen (Tag) bzw. Linie mit Fläche (Wochenschluss).
* **Szenario-Raum** rechts von „Heute" (24–30 % der Breite, leicht abgesetzt), Text „Szenario · keine Vorhersage": stilisierter Pfad Kurs → Einstiegszone → Ziel 1 → Ziel 2 mit wachsendem Korridor. **Keine Zeitachse** im Szenario-Raum (Pfad ist Bedingungsfolge, keine Terminprognose).
* Bänder: Einstieg (Lime), Ziele (Blau), Alternative (Violett, gestrichelt), Risikobereich zwischen Einstieg und Ungültig-Linie (rot schraffiert, nur im Szenario-Raum).
* Zonen außerhalb des Kursbereichs → Hinweis „↑ weitere Zone bei …" statt Stauchung des Charts.
* Steuerung: Zeitraum (3 M/6 M/1 J bzw. 1/3/5 J), Kerzen/Linie, Wellen an/aus; Szenario-Wechsel durch Antippen der Karte.
* Interaktion: Fadenkreuz mit Datum und Kurs (Maus/Touch); Fokusrahmen; `role="img"` mit `title`/`desc` (Zonen in Worten).
* Mobil (< 520 px): Labels nur „Ziel 1"/„Ungültig 208" (Zahlen stehen in den Kacheln), Chart 400 px hoch.

## 4. Profi-Ansicht

Umschalter „Einfach | Profi" (gemerkt in `localStorage`, `?ansicht=profi` als Link). Inhalt (aufklappbar, wird erst beim Öffnen gebaut):
1. **Elliott-Wellen**: Haupt- und bis zu 2 Alternativzählungen mit Notation, Datum/Preis je Welle, Unterwellen, harte Regelgrenze, Neuzuordnungsgrenze, Projektionszonen mit Relation, Rangbestandteile; höherer Grad; **Regelprüfung** (Regeltext, Quelle, Klasse, Ergebnis erfüllt/verletzt/offen); Richtlinienwerte; historische Karte.
2. Hochs, Tiefs und Trend (Primary/Secondary/Short-Term mit Kipp-Niveaus, Weinstein-Stufe).
3. Unterstützungen, Widerstände, Fibonacci-Konfluenz (+ VU-Befund zu Fibonacci).
4. Bewegungsstärke (RSI, Divergenz), Schwankung (ATR, Regime), Volumen (RVOL, Up/Down, AVWAP, Volumenprofil).
5. Chartformationen und Wyckoff (Ereignisse, Phase; Hinweis „beschreibend").
6. Konfluenz und Methodik (Familien, Richtung, Gewicht, Methodikdatei, Regelwerk).
7. Frühere Fälle bei diesem Titel (Historical Replay: Datum, Lage, Ausgang, Dauer).

## 5. Übersicht „Technische Lagen"

Chip-Reihe (horizontal scrollbar) mit offengelegter Regel je Reihe: Nahe einer Einstiegszone · Frische Ausbrüche · Stärkste Aufwärtsstrukturen · Mögliche Trendwenden · Wellenstruktur: Welle 3 möglich · Hohe Einigkeit. Nur Mitglieder von S&P 500/Nasdaq-100/Dow mit Kurs ≥ 5 $ (Liquidität). Kacheln: Kürzel, Lage, Zone, Zeitebene, Einigkeit. Diese Reihen liegen als `discover-rows.json` auch für Discover bereit.

## 6. Mobile First

* Keine horizontale Seitenverschiebung (geprüft bei 390 px: `scrollWidth ≤ innerWidth`).
* Zonen-Kacheln und Szenario-Karten als Wisch-Leisten (Scroll-Snap), Karten 86 % Breite.
* Bedienelemente ≥ 38–44 px, Pillen.
* Bottom-Dock der Quant-App bleibt; Inhalte darüber nicht verdeckt (Seitenabstand).

## 7. Barrierefreiheit

Kontrast auf dunkler Fläche (Lime/Blau/Rot auf #0b0d10), Status nie nur über Farbe, `aria-pressed` an Umschaltern, `role="region"` am Chart, Screenreader-Beschreibung der Zonen, `prefers-reduced-motion` schaltet die Pfad-Animation ab.

## 8. Design-Review (durchgeführt, 02.10.2026)

Screenshots Desktop 1280 px und Mobil 390 px für NVDA (Tag), AAPL (Profi), AMZN (Woche), Übersicht, Methodik. Behobene Befunde: horizontales Überlaufen der Wisch-Leisten (negative Ränder), überlappende Zonen-Labels mobil, „Szenario"-Hinweis kollidierte mit Ziel-Labels, doppelte Familienbezeichnung („Wellenstruktur: Wellenstruktur"), Transliteration (ue/ae) in Engine-Texten, identische Diagonal-Alternativen, illiquide Titel/Vorzugsaktien in Reihen, „95,0" statt „95".

## 9. Marketing-Tauglichkeit

Der Hero (Ausblick in 80–90 px Schrift, vier Zonen-Kacheln, Chart mit Bändern) ist als Screenshot ohne Kontext lesbar. Teilbare Fassung: `?ansicht=profi` für Fachpublikum. Keine Marketingzahlen ohne Methodik (alle Quoten verlinkt auf `#/methodik/chartbild`).
