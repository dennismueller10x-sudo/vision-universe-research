# Strang D – Frontend (Stand 04.11.2026)

**Fortschritt je Folie: [`docs/design/redesign-2027/PROGRESS.md`](../design/redesign-2027/PROGRESS.md)** (Owner-Chat, führt diese Datei fort).

Vorlage: Präsentation „Vision Universe Redesign“ (Mockups 390 × 844, Kennungen A1–Ü4) und „Vision Universe iPhone-Konzept“.
Regeln: nur Darstellung (Shell, Navigation, Dock, Tokens, Produktseiten). Keine Engines, Scores, Daten, Pipelines.
Ein PR pro Ergebnis, Browser-QA auf 390 px und Desktop, hell und dunkel. Bilder liegen auf dem Zweig
[`neustart/d-evidence`](https://github.com/dennismueller10x-sudo/vision-universe-research/tree/neustart/d-evidence/neustart-d) (nicht in `main`).

## Fertig

| Ergebnis | PR | Mockups | Nachweis |
|---|---|---|---|
| Technical-QA kennt das neue Menü (Vorbereitung) | #1330 | N3 | Prüft beide Menü-Generationen |
| Shell und Dock: Tokens, Kopfzeile, Produkt-Leiste, Menü, Bausteine C01–C20 | #1331 | A3, C, N1–N3 | [Vorher/Nachher](https://github.com/dennismueller10x-sudo/vision-universe-research/tree/neustart/d-evidence/neustart-d/01-shell) |

Inhalt „Shell und Dock“:
- Kopfzeile (C01): links die Welt (HUD-Icon + Name) oder das Logo, rechts Suche, Atlas, Mein Bereich. 56 px mobil, 64 px Desktop.
- Produkt-Leiste (C02): schwarz, 5 Plätze, erster Platz breiter, aktiver Platz neongrün. Beschriftungen nach Mockup, soweit die Route heute existiert:
  Discover „Swipen“, Technical „Chart“, Vorsorge „Planer“, Screener „Filter · Treffer · Gespeichert“ (Watchlist ist Reiter unter Gespeichert), Hedgefonds „Investoren · Aktien · Smart Money“ (Datenbank ist Reiter unter Investoren).
- Menü (C03): Vollbild schwarz (Desktop: Seitenleiste 440 px), Suchfeld mit Atlas, 3 × 3 Produkte mit Kurzbeschreibung, aktuelle Welt neongrün, „In <Welt>“ mit allen Unterseiten der aktuellen Welt, Mein Bereich, Weitere Produkte, Hell/Dunkel und Währung. Keine Route fällt weg.
- Farbschema wechselt im Menü (Hell/Dunkel) statt im Kopf.
- Inter selbst gehostet (`assets/fonts`), `font-display:swap`.
- Bausteine als Opt-in-Klassen in `assets/site-navigation.css` (siehe `docs/PREMIUM_DESIGN_SYSTEM_2.md`, Abschnitt Redesign).

## Offen (Reihenfolge)

1. Startseite (E01), Willkommen (E02), Mein Dashboard (E08) mit Leiste „Mein Bereich“.
2. Discover: Aktienseite D09 mit Aktienkopf C04 und Perspektiven-Leiste C05, dann D01–D08. Budget ≤ 180.000 Byte, ≤ 12 Requests.
3. Quant, Technical, Fundamental, Elliott, Hedgefonds, Vorsorge, Screener; Supertrader in eigenem PR (Gate A).
4. Neue Leisten-Routen, die heute fehlen, kommen mit dem jeweiligen Produkt-PR: Technical „Muster“ (`#/muster`), Fundamental „Ranglisten · Branchen“, Elliott „Methodik“.
5. Backtest-Ansicht im neuen Design, beschriftet „Forschung, nicht zertifiziert“ (Daten von Strang C).

## Entscheidungen (nach dokumentierter Empfehlung, ohne Rückfrage)

- Menü behält alle bisherigen Ziele: Unterseiten der aktuellen Welt stehen unter „In <Welt>“, statt Unterseiten aller Welten auf einmal.
- Kursfarben (Rot/Grün) bleiben bis zum Umbau der jeweiligen Welt; die Bausteine C07/C08 zeigen Richtung mit ▲ neongrün und ▼ schwarz.
- Header-Profil führt nach `/mein-dashboard/`; Konten bleiben bis zur Freigabe ausgeschaltet.

## Braucht Owner

Nichts. (Geld, Recht, öffentliche Renditeaussagen und Löschen sind nicht berührt.)
