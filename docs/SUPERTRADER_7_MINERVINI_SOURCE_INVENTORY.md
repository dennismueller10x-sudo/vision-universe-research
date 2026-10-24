# Supertrader 7.0 – Minervini: Quelleninventur und Zuordnung je Regel

Stand: 24. Oktober 2026. Auftrag des Eigentümers vom 24.10.2026: keine pauschale Aussage mehr, Minervini-Quellen fehlten, ohne Inventur und Zuordnung zur einzelnen Regel.

Maschinenlesbar und generiert:
- Inventur: `scripts/supertrader/source-faithful/artifacts/STRATEGY-MINERVINI-SOURCE-INVENTORY.json`, Builder `completion/build-minervini-source-inventory.mjs`. Ein Test verlangt, dass jede Vertragsregel und jede Modellannahme klassifiziert ist und jede zitierte Seite belegt ist.
- Neu gelesene Befunde: `evidence/MINERVINI-SF7-FINDINGS.json` mit 346 Befunden, Builder `evidence/minervini-sf7-findings.mjs`.
  - Jeder Befund hat Seite, deutsche Paraphrase, Modalität, Zahlen und einen SHA-256 des Originalzitats.
  - Buchtext liegt nicht im Repository (wie bei #709).
- Code: `research/minervini-sf7.mjs`, Runner `research/run-sf7-minervini.mjs`, Workflow-Modus `sf7-minervini`.
- Tests: `scripts/supertrader/tests/sf-sf7-minervini.test.mjs`.

---

## Kurzantwort

- **Das bereitgestellte Material ist vollständig vorhanden und lesbar.** Die drei Minervini-Bücher aus Ihrer Dropbox (Bereitstellung 13.10.2026) sind heute byte-identisch verfügbar: Der SHA-256 aller drei PDFs entspricht der #709-Quellenbibliothek. Alle Seiten wurden in 7.0 erneut gelesen.
- **Die Aussage „nur über Übersetzungen“ ist für die Bücher zutreffend, aber unvollständig.**
  - Bereitgestellt wurden die indonesische Fassung von *Trade Like a Stock Market Wizard*, die indonesische Fassung von *Momentum Masters* und die lizenzierte vietnamesische Fassung von *Think & Trade Like a Champion*. Englische Ausgaben waren nicht dabei. Das ist eine **fehlende Quellenverfügbarkeit im Projekt**, keine Lücke in Minervinis Methode.
  - Übersehen wurde: #709 hatte bereits **neun englische, im Wortlaut geprüfte Antworten Minervinis** erfasst (Interview 2018, W-MIN18). Sie erreichten die Verträge nie, weil der Extraktor von Supertrader 2.0 ihren Methodenkontext nicht zuordnete. Das ist in 7.0 behoben.
- **Die Regeln wurden nicht vollständig übernommen.**
  - #709 hat alle Seiten indexiert, Regeln aber nur gezielt herausgezogen.
  - Aus *Think & Trade Like a Champion* (272 Seiten) kamen nur 8 Zeilen, alle von den Seiten 193–232.
  - Die Neulesung ergibt 346 relevante Befunde. 154 davon deckt keine #709-Zeile ab, 190 nur teilweise.
- **Was sich dadurch ändert:**
  - Eine Regel ist erstmals `SOURCE_EXACT`: Gestaffelte Stops erhöhen das geplante Risiko nie (englischer Originalwortlaut).
  - Drei Quellendifferenzen sind präzise belegt; eine davon ist zugunsten der Referenz aufgelöst.
  - Drei neue, quellengestützte Forschungsvarianten und zwei Diagnosen kommen hinzu.
  - Kein Regelstatus der Referenz wird aufgewertet. Die Buchregeln bleiben übersetzungsabhängig. CC-1 ist weiterhin nicht erfüllt, weil der englische Buchwortlaut im Projekt fehlt.

## 1. Welche Minervini-Unterlagen wurden bereitgestellt?

Bereitgestellt wurde der Dropbox-Stamm mit 13 PDFs, gelesen in #709 am 13.10.2026. Minervini betreffen:

| ID | Werk | Sprache | Seiten | Status #709 | SHA-256 (PDF) |
|---|---|---|---|---|---|
| B12 | *Trade Like a Stock Market Wizard* (2013) | Indonesisch, maschinennahe Übersetzung | 442 | BOOK_COMPLETE | `2ba966ed…` |
| B07 | *Momentum Masters* (2015; Minervini, Ryan, Zanger, Ritchie) | Indonesisch, inoffizielle Übersetzung | 113 | BOOK_COMPLETE | `d3fd7f0f…` |
| B03 | *Think & Trade Like a Champion* (2017) | Vietnamesisch, lizenzierte Übersetzung | 272 | BOOK_COMPLETE | `ad332a52…` |
| W-MIN18 | Interview Stockopedia, 17.04.2018 (nur Minervinis Antworten) | **Englisch**, Wortlaut geprüft | – | WEB_PRIMARY | – |

Die übrigen Bücher im Dropbox-Stamm enthalten kein Minervini-Interview:
- Schwager: *Market Wizards* (1989), *The New Market Wizards* (pt), *Unknown Market Wizards* (fr);
- außerdem Graham, Faith, O'Neil, Love, Darvas, Weinstein, Livermore.

Minervinis Kapitel steht in *Stock Market Wizards* (2001). Dieses Buch wurde nicht bereitgestellt.

## 2. Was ist heute im Projekt vorhanden?

| Quelle | Heute | Nachweis |
|---|---|---|
| B12, B07, B03 | **vorhanden, byte-identisch** | Download aus der Dropbox am 24.10.2026; SHA-256 und Dropbox-Content-Hash gleich #709 |
| W-MIN18 | **erfasst, hier nicht erneut abrufbar** | Die neun Zeilen sind am 13.10.2026 im Wortlaut geprüft. Am 24.10. antwortet die Seite diesem Container mit HTTP 403; die Archivkopie (web.archive.org, 06.12.2022) ist von hier nicht erreichbar. Die Zeilen bleiben unverändert und gelten als nicht erneut verifiziert. |
| englische Buchausgaben | **nicht im Projekt** | nie bereitgestellt; nicht beschafft (keine unzulässige Beschaffung) |

Text der Seiten:
- B12: Textebene (pdftotext).
- B07: Dropbox-Textextraktion.
- B03: Das PDF ist ein reiner Bildscan. Für 7.0 wurde es per OCR gelesen (tesseract, Vietnamesisch). Ziffern sind OCR-empfindlich, Zweifelsfälle sind markiert.

## 3. Wurden die Regeln vollständig übernommen?

**Nein.** Die 132 #709-Minervini-Zeilen sind vor 7.0 so verarbeitet worden:

| | Anzahl |
|---|---|
| #709-Zeilen insgesamt (B12 90, B07 25, B03 8, W-MIN18 9) | 132 |
| davon im Evidenz-Extrakt vor 7.0 | 123 (die 9 englischen W-MIN18-Zeilen fehlten) |
| nach 7.0 in einer Vertragsregel verwendet | 53 |
| nach 7.0 nur als Kontext oder Prüffrage ausgeschlossen (mit Begründung) | 79 |
| nach 7.0 unberücksichtigt | 0 |

Die Neulesung (346 Befunde) zeigt, wo die Extraktion verkürzt war:
- **B03:** 95 Befunde statt 8 Zeilen, unter anderem:
  - Trend Template mit eigener RS-Linien-Bedingung;
  - Power-Play-Ausnahme bei Konsolidierung ≤ 10 %;
  - Pyramidisieren ohne Risikoerhöhung, Positionsaufbau über Gewinnserien;
  - Verstoßliste nach dem Ausbruch, Climax-Signale.
- **B12:** 178 Befunde, unter anderem:
  - Flat Base mit 10–15 %-Grenze;
  - Stop bei der Hälfte des Durchschnittsgewinns, absolut ≤ 10 %;
  - größter Tagesrückgang seit Beginn von Stage 2 als Verkaufssignal;
  - Basiszählung, Tiefenbänder, Cheat-Vorlauf (≥ 25–100 % in 3–36 Monaten).
- **B07:** 73 Befunde, unter anderem:
  - kein Nachjagen über einige Prozent;
  - Verkauf bei 2–6R, Verstoßliste;
  - eigene RS-Definition gegen Markt und Gruppe;
  - Positionszahl und -größe.

23 Befunde tragen eine Übersetzungs- oder OCR-Markierung, darunter Negationsumkehr, Richtungsumkehr und verstümmelte Ziffern. Diese Zweifel sind der eigentliche Grund, warum Buchregeln ohne englischen Wortlaut nicht `SOURCE_EXACT` werden.

## 4. Welche Regeln lassen sich jetzt präziser belegen?

Ich habe jeden Befund, der eine Vertragsregel, Variante oder Diagnose verändert, selbst am Seitentext geprüft.

| Regel | vorher | jetzt | Beleg |
|---|---|---|---|
| Gestaffelte Stops (neu `MIN-SF-STAGGER`) | – | **SOURCE_EXACT**: Staffeln verteilen das geplante Risiko um, erhöhen es nie | W-MIN18 (englisch, HIGH) |
| Maximaler Stop 10 % (`MIN-SF-STOP`, `-PP-STOP`) | nur Übersetzung | **englisch bestätigt** („generally 8–10 %“, keine volatilitätsweiten Stops). Dieselbe Grenze steht in B12 (S. 370, 399), B07 (S. 72, 74) und B03 | W-MIN18, B12, B07 |
| Positionsgröße / Risiko je Trade (`MIN-SF-SIZE`) | Kontext | 1,25–2,5 % „sollte nicht überschreiten“ (B03 S. 193); Pilotpositionen und progressive Exposure englisch belegt | B03, W-MIN18 |
| Trend Template 1–4, 7, 8 | eine Übersetzung | **zwei unabhängige Übersetzungen zweier Bücher** (B12 2013, B03 2017) mit identischen Zahlen | B12 S. 114, B03 S. 143 |
| Trend Template „über dem 52-Wochen-Tief“ | 30 % | **Übersetzungs- bzw. Ausgabendifferenz belegt**: B12 30 %, B03 25 %, B12 S. 101 „25 bis 30 %“. Referenz bleibt 30 %, Variante `ALT-SEPA-TT6-25` | B12, B03 |
| Relative Stärke (TT-8) | DATA_BLOCKED | IBD-Rating bleibt gesperrt (Daten). Minervinis **eigene RS-Linien-Bedingung** ist berechenbar: nicht im Abwärtstrend, ≥ 6 Wochen steigend. Variante `ALT-SEPA-RS-LINE` | B03 S. 143, 168 |
| Power Play: Enge ≤ 10 % oder VCP (`MIN-SF-PP-TIGHT`) | Übersetzung | **Konflikt aufgelöst**: B12 S. 341 verlangt VCP-Merkmale, B03 S. 189 nimmt Basen ≤ 10 % Tiefe davon aus. Das ist genau die Referenzlesart; keine Variante nötig | B12, B03 |
| Power Play: Korrektur 20–25 % | Spanne | B03: höchstens 20 %, bei niedrigpreisigen Titeln etwa 25 %. „Niedrigpreisig“ ist nicht beziffert | B03 S. 189 |
| VCP / Flat Base | Flat Bases ausgeschlossen (strikter Proxy) | Flat Base ohne eigenen Pivot: Kauf über dem Basishoch bei ≤ 10–15 % Korrektur. Variante `ALT-SEPA-FLAT-BASE` | B12 S. 306 |
| Einstand / Stop-Anhebung | 3R | 2–3R (B12 S. 410); B03 S. 126: bei 3R anheben, bei 2R mindestens Einstand (Übersetzungsmarkierung). Die bestehenden Varianten FREEROLL-2R/3R decken beide Enden ab | B12, B03 |
| Verkauf | manuell | konkrete Signale belegt: größter Tages- oder Wochenrückgang seit Stage-2-Beginn (B12 S. 130), Verstoßliste (B07 S. 91, B03 S. 47–51), 2–6R (B07 S. 90). Diagnose `largestDeclineSignal` | B12, B07, B03 |
| Fundamentals bestätigen nur mit Kurs (`MIN-SF-PRICE-CONFIRM`) | Übersetzung | englisch belegt; maschinell abgeleitet: kein Einstieg ohne Pivot-Durchbruch | W-MIN18 |

## 5. Was fehlt im Material, und wo fehlt nur die Mathematik?

Jede Vertragsregel und jede Modellannahme ist einer Klasse zugeordnet (Artefakt `classification`). Zählung über 59 Regeln und Annahmen; eine Regel kann mehrere Klassen tragen:

| Klasse | Anzahl | Bedeutung |
|---|---|---|
| SOURCE_PRESENT_TRANSLATION | 21 | Regel steht vollständig in den Büchern; nur der englische Wortlaut fehlt im Projekt |
| SOURCE_PRESENT_ENGLISH | 6 | Regel steht in Minervinis eigenen englischen Worten (W-MIN18) |
| SOURCE_CONFLICT_TRANSLATION | 1 | Übersetzungen drucken verschiedene Werte (52-Wochen-Tief) |
| OPERATIONALIZATION_OPEN | 20 | Regel vorhanden, mathematische Definition fehlt |
| METHOD_DISCRETION | 12 | Minervini beschreibt den Schritt selbst als Urteil |
| DATA_MISSING | 6 | Regel klar, historische Daten fehlen |
| ABSENT_FROM_MATERIAL | 6 | nicht im Material: Ordertyp, Setup-Lebensdauer, Kosten, Abrechnung, Flat-Base-Länge, Forschungsdesign |

**Nur die Operationalisierung fehlt** (Auswahl):
- wie „MA200 steigt ≥ 1 Monat“ gemessen wird;
- ob das 52-Wochen-Hoch bzw. -Tief Schluss- oder Intraday-Werte sind;
- Konstruktion des Pivots;
- „einige Prozent“ als Grenze für das Nachjagen;
- Messung der Kontraktionen;
- Beginn von Stage 2;
- „niedrigpreisig“ beim Power Play;
- „starkes Volumen“ am Beginn eines Power Play;
- Stop-Platzierung innerhalb der 10 %-Grenze.

**Fehlt wirklich im Material** (in keinem Buch):
- Ordertyp, Setup-Lebensdauer, Kosten;
- Mindestlänge einer Flat Base.

**Bewusst Ermessen:** relative Priorität, Earnings-Qualität, Gültigkeit des VCP, Verkaufsregeln. Minervini: „selling is more subjective“ (englisch).

## 6. Probleme, die nichts mit den Büchern zu tun haben

| ID | Problem | betrifft |
|---|---|---|
| D-IBD-RS | Historie des IBD-RS-Ratings (proprietär) | TT-8 |
| D-ESTIMATES | PIT-Schätzungen, Revisionen, Überraschungen, Guidance | Priorität, Fundamentals |
| D-EPS-Q4 | abgeleitete Q4-EPS nicht split-korrigierbar (6.0: 405 Fälle) | Fundamentals |
| D-INTRADAY | Intraday-Volumen und Reihenfolge im Tagesbalken | Entry-Timing, Intrabar, Stop-Fill |
| D-V4D1 | nicht deklarierte Kapitalmaßnahmen: SEPA 0 %, Power Play 0,99 % (6.0) | CC-5 |
| D-SURVIVORSHIP-HOLDOUT, D-OOS | Holdout bereits genutzt und survivorship-belastet; unberührtes Fenster erst SF6-PAPER-2027 | CC-8 |

## 7. Umsetzung im Code

Die 4.0-Engine bleibt unverändert:
- Code-Fingerabdruck `b1d81fb8…`;
- Varianten-Registry `f13ea350…`, im Test gepinnt;
- das Paper-Protokoll SF6-PAPER-2027 pinnt weiterhin dieselben Werte.

`research/minervini-sf7.mjs` ändert nur den Setup-Index und nutzt sonst die Referenzkonfiguration:

| Variante | Quelle | Änderung gegenüber REF |
|---|---|---|
| ALT-SEPA-FLAT-BASE | B12 S. 306 | Flat Bases ≤ 15 % mit Pivot am Basishoch kommen hinzu, wo REF kein striktes Setup hat |
| ALT-SEPA-TT6-25 | B03 S. 143, B12 S. 101 | 25 % statt 30 % über dem 52-Wochen-Tief |
| ALT-SEPA-RS-LINE | B03 S. 143 | nur Setups mit über 6 Wochen steigender RS-Linie (Kurs / SPY) |

Weitere Bausteine:
- **Diagnosen auf den REF-Trades** (nur Zählung, nie Gate):
  - größter Tagesrückgang seit Stage-2-Beginn (B12 S. 130);
  - geplanter Verlust gegenüber der Hälfte des PIT-Durchschnittsgewinns (B12 S. 398–399).
- **Modellannahmen** `MA-MIN7-*` sind vor jedem 7.0-Ergebnis festgeschrieben (Registry `a69ea6f4…`, Test).
- **Lauf `sf7-minervini`:** REF muss die maßgeblichen 4.0-Ledger-Hashes reproduzieren, sonst bricht der Lauf ab. Ergebnis: siehe Abschlussbericht 7.0.

## 8. Was bleibt

- **CC-1 für SEPA und Power Play:** Der englische Buchwortlaut fehlt im Projekt. Entweder stellen Sie rechtmäßig eine englische Ausgabe bereit, oder Sie entscheiden ausdrücklich, ob zwei übereinstimmende Übersetzungen als Beleg genügen. Ich habe diese Entscheidung nicht vorweggenommen.
- **CC-3:** Die manuellen Entscheidungen bleiben Ermessen der Methode.
- **CC-4:** Das IBD-RS-Rating bleibt gesperrt. Die RS-Linie ist eine Forschungsvariante, kein Ersatz.
