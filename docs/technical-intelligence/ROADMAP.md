# Roadmap (nur echte Folgeschritte)

## Als Nächstes (geringer Aufwand, hoher Nutzen)
1. **Tages-Evidenz für das Universum** — Workflow `technical-intelligence-evidence.yml` starten (manuell, liest nur R2). Danach zeigt jede Tagesanalyse belastbare Tages-Evidenz.
2. **Survivorship-Kontrolle** — das private Delisting-Bündel (`build-survivorship-control.mjs`) in `ti-evidence.mjs` einlesen; Ergebnis unter beiden Delisting-Annahmen ausweisen.
3. **Elliott-Konditionierung klären** — Baseline „beliebiger bestätigter Swing gleicher Skala" statt unbedingter Zufallsbar; trennt Elliott-Effekt von „nach bestätigtem Rücklauf".
3a. **V2.1 Elliott-Ranking** — höheren Grad stärker, Unterteilung schwächer gewichten (TECHNICAL_EVIDENCE §6); Bewertung nur auf einem **neuen** Holdout (Daten ab Freeze-Datum oder Sektor-Holdout) — TEST ist zweimal angesehen.
3b. **Cluster-Bootstrap** (Titel × Monat) für alle Lift-Intervalle.
3c. **Regime-Hypothese prüfen** — Risk-off/extreme Volatilität (+2,4 … +3,1 pp) auf neuem Holdout, vorab registriert.
4. **Konflikt-Warnung höherer Grad** in der Einfach-Ansicht („Die große Wellenstruktur spricht dagegen"), da empirisch stärkster Elliott-Effekt.
5. **Earnings-Hinweis** — Termine aus der Fundamentaldaten-Pipeline anbinden; Hinweis „Bericht in X Tagen – erhöhtes Ereignisrisiko", nicht Teil der Konfluenz.

## Danach
6. **Alerts zustellen** — `alerts.json` an Watchlist/Benachrichtigungen (Worker) anbinden.
7. **VU Ask** — `ti/ai-tools.js` im Worker `vu-ask` registrieren; Antworttests gegen die Faktenliste (keine fremden Zahlen).
8. **Ablösung V1-Technikseite** — `/technik` auf die V2-Daten umstellen oder auf `/chartbild` umleiten.
9. **Kalibrierung neu prüfen** mit Tages-Universum und Merkmalen (Regime, höherer Grad); Gate unverändert.
10. **Discover-Integration** — `discover-rows.json` als Reihen auf der Discover-Startseite.
11. **Screener-Felder** — Index-Zeilen (`index.json.gz`) als Felder im Quant Screener (Status, Distanz zur Zone, Elliott-Welle, Formation).

## Benötigt neue Daten
12. Intraday-Historie (Ausführungs-Zeitrahmen, echter AVWAP).
13. Point-in-Time-Sektor/Marktkapitalisierung (Segmente).
14. Historische Indexmitgliedschaft (Universum zum Stichtag).

## Nach Master Mission II (Elliott-Validierung)

1. **Grad-Hierarchie neu bauen** — „größter vollständiger Grad zuerst": eine fertige Struktur auf der gröberen Skala, die die feinere Zählung enthält, gewinnt (behebt Flats/Unterwellen-Zählung). Prüfung nur auf Synthetik/Referenzsammlung, Bewertung auf neuem Holdout.
2. **Start an markanten Extremen** und **Preis-Proportion** gleicher Grade als Rangkriterium (heute nur Audit).
3. **Strengere, vorab registrierte Enthaltung** (z. B. Mehrdeutigkeit + Neuzuordnungen) — Ziel Ehrlichkeit, nicht Trefferquote.
4. **H4 (höherer Grad) auf neuem Holdout** — einzige knapp verfehlte Elliott-Hypothese (p = 0,06); vorab registrieren, Daten ab 2026-10 abwarten oder Tagesdaten-Universum.
5. **Zeitpunkt-Wissen produktiv machen** — H6 bestätigt: früher Einstieg in der laufenden Gegenbewegung schlägt späte Bestätigung (unabhängig von Elliott). Im Produkt als Erklärung der Schlüsselzone, nicht als Signal.
6. **Echte Referenzbeispiele** — dokumentierte historische Zählungen (Indizes) mit Rechteklärung; manuelle Prüfung der 80er-Audit-Stichprobe durch einen Elliott-Praktiker.
7. **Survivorship** — Delisting-Bündel anbinden und Studie wiederholen.
