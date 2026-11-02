# Technical Strategie-Akademie – Architektur- und Inhaltsvorbereitung (Paket A0)

Stand 02.11.2026 · Auftrag „Master Completion 3.2“, P4.

Die Akademie ist ein **eigenes Produktpaket**. Bis der Analyse-Assistent (#1245) integriert ist, gibt es nur diese Vorbereitung: kein Code, keine Daten, keine Änderung an `technical/` oder `academy/`.

## 1. Abgrenzung zum Analyse-Assistenten (keine Doppelung)

| | Analyse-Assistent (#1245, `technical/#/assistent`) | Strategie-Akademie (dieses Paket) |
|---|---|---|
| Frage des Nutzers | „Welche Aktien erfüllen heute …?“ | „Wie funktioniert dieser Ansatz, und was weiß man darüber?“ |
| Ergebnis | Trefferliste am Stichtag, Checkliste, Chart | Erklärung, Beispiele, Übung, Evidenz und Grenzen |
| Rechnung | `templates.js#evaluate` auf dem Screener-Datensatz | **keine eigene**: Übungen verlinken in den Assistenten bzw. ins Chart Studio |
| Begriffe | `assistant.js#TERMS` (21 Begriffe) | **dieselbe Quelle**, kein zweites Glossar (§3) |
| Evidenz | Verweise auf vorhandene Auswertungen, Ebene „nachgewiesener Vorteil: nein“ | dieselben Verweise, ausführlicher erklärt |

**Regel:** Was der Assistent rechnet oder definiert, wird in der Akademie nicht neu gebaut, sondern verlinkt oder aus derselben Datei gelesen.

## 2. Ort: Academy-Welt „Strategien, Faktoren & Markt-Evidenz“

Die Plattform hat bereits die Academy (`academy/`, [ARCHITECTURE.md](../../academy/ARCHITECTURE.md)) mit einem Experience-System:
- Shell, Engines und Registries;
- `worlds.json` mit 11 Welten.

Die Welt `strategies-factors-evidence` steht dort auf `planned`. Die Strategie-Akademie wird **diese Welt**, keine zweite Lernumgebung in Technical. Damit gelten:
- Shell und Designsprache der Academy;
- Registries (`concepts.json`, `experiences.json`) statt Code für neue Inhalte;
- die Testmuster der Academy (`node --test` je Engine).

## 3. Eine Begriffsquelle

**Vorschlag (nach dem Merge von #1245):**
- `academy/data/concepts.json` bekommt für technische Begriffe Einträge mit `source: "technical/engine/assistant.js#TERMS.<id>"`.
- Ein Test prüft, dass Titel und Text bytegleich mit `assistant.js` sind.
- Alternative: Die Academy liest `assistant.js` direkt (UMD, `globalThis`). Das ist einfacher, bindet die Academy aber an eine Technical-Datei.
- **Entscheidung A-2.**

## 4. Inhaltsgliederung (8 Lerneinheiten = 8 Analyseziele)

Jede Einheit hat dieselben sechs Abschnitte. Die Abschnitte 1–4 spiegeln die vier Ebenen des Assistenten.

| Abschnitt | Inhalt | Quelle |
|---|---|---|
| 1 Idee | Wie der Ansatz in der Praxis verstanden wird, mit Herkunft der Methode (allgemein, ohne Personen- oder Markennamen, solange A-3 offen ist) | `GOALS[].method`, ausgebaut |
| 2 Messen | Welche Kriterien den Ansatz messbar machen und warum genau diese Schwellen | `GOALS[].options` |
| 3 Historie | Was untersucht wurde: S4 (Wochen-Näherungen 1990–2026), Signal- und Formations-Evidenz (≈ 1 Marktjahr); Einstufung und Grenzen erklärt | S4_TEMPLATE_STUDY.md, SIGNAL_EVIDENCE.md, `formation-evidence.json` |
| 4 Vorteil? | Warum ein nachgewiesener Vorteil fehlt; was ein Nachweis bräuchte (Kosten, OOS, Survivorship) | Assistent `EDGE_TEXT`; Quant-Zertifizierungsgates als Erklärung |
| 5 Ausprobieren | Link in den Assistenten mit voreingestellter Auswahl (`#/assistent/<ziel>?k=…`) und ins Chart Studio | Adressen aus `assistant.js#href` |
| 6 Typische Fehler | z. B. Ausbruch ohne Bestätigung, Kurssprünge in den Daten, „mehr Kriterien = besser“ | Abnahmebefunde (TECHNICAL_ASSISTANT_ABNAHME.md §3) |

**Einheiten:** Trendfolge · Ausbruch · Momentum · Trendwende · Volatilität und Konsolidierung · Unterstützung und Widerstand · Mehrere Zeitrahmen · Kriterien kombinieren.

**Pilot:** „Trendfolge verstehen“. Begründung:
- die meisten Kriterien;
- historische Prüfung vorhanden (S4);
- klarster Fall für „historisch beobachtet, aber kein nachgewiesener Vorteil“.

## 5. Beispiele und Daten

- **Keine neue Kursreihe.** Beispiele sind Links ins Chart Studio mit Live-Daten.
- **Feste historische Beispiele** („so sah ein Ausbruch 2020 aus“) wären ein neues Artefakt mit Kursdaten. Das braucht:
  - einen eigenen Erzeuger (Generierungsregel CLAUDE.md);
  - eine Prüfung der Anzeigerechte; Tiingo-Kurse sind für die Anzeige freigegeben, Rohdaten-Downloads nicht.
  - **Entscheidung A-4**; bis dahin nur Links.
- **Keine Trefferquoten oder Renditen** außer den bereits freigegebenen Evidenzaussagen in ihrer Einstufung. Ein Sprachtest wie im Assistenten (gleiche Sperrliste) wird Teil des Pakets.

## 6. Phasen

| Paket | Inhalt | Voraussetzung | Freigabe |
|---|---|---|---|
| **A0** | dieses Dokument | – | – |
| A1 | Registry-Einträge (Welt auf `available`, 8 Experiences als `planned`), Begriffsquelle nach A-2, Sprachtest | #1245 gemergt, A-1, A-2 | Texte |
| A2 | Pilot „Trendfolge verstehen“ als Experience (Shell der Academy, kein neues Engine-Modul), Browser-QA 360/390/1280 hell/dunkel | A1 | Texte, Veröffentlichung |
| A3 | übrige 7 Einheiten | Pilot abgenommen | Texte |
| A4 | optionale feste Beispiele | A-4 | Daten und Rechte |

## 7. Entscheidungen für den Owner

| # | Frage | Empfehlung |
|---|---|---|
| A-1 | Ort: Academy-Welt `strategies-factors-evidence` (statt eines Lernbereichs in Technical) | ja: eine Lernumgebung für die ganze Plattform |
| A-2 | Begriffsquelle: Academy referenziert `assistant.js#TERMS` mit Gleichheitstest, oder liest die Datei direkt | Referenz mit Gleichheitstest (lose Kopplung, keine Abweichung möglich) |
| A-3 | Namensnennung von Methoden (z. B. „nach Minervini“, „Turtle“) in Lerntexten | wie im Assistenten weiter ohne Personennamen, bis die Rechtsprüfung vorliegt (STRATEGY_TEMPLATES_PLAN.md §7.2) |
| A-4 | feste historische Chartbeispiele als eigenes Artefakt | zurückstellen; Links ins Chart Studio genügen für A1–A3 |
