# Mission IX: Methodik- und Code-Red-Team

Stand: 07.10.2026. Unabhängige, rein lesende Prüfung durch einen getrennten Agenten. Sie fand **vor** dem Freeze der Präregistrierung und vor dem einmaligen Öffnen von A9_CONFIRM statt.

Geprüft wurden:
* `MISSION9_PREREGISTRATION.md` (Entwurf) und `protocol9.json`;
* `track-a.mjs`, `track-b.mjs`, `evaluate.mjs`, `replay.mjs` und `case-study.mjs`;
* der Workflow `technical-intelligence-mission9.yml`;
* die Tests.

Die Prüfung umfasste eine eigene Nachrechnung über alle 6.349 Wochenreihen.

## Befunde und Behebung

| # | Schwere | Befund | Behebung |
|---|---|---|---|
| H1 | HOCH | Der Einmal-Schutz der Bestätigung prüfte nur die Datei an der Branch-Spitze. Umgehbar durch Löschen der Ergebnisdatei, durch einen anderen `claude/**`-Branch (Concurrency je Branch) oder durch Wiederholen nach Fehlschlag. | Globale Concurrency. Öffnungsmarke `a9-confirm-opened.json` wird **vor** Stage 2 gepusht. Abbruch, wenn Marke oder Ergebnis auf **irgendeinem** Branch existiert (`git log --all`, volle Historie). Ein abgebrochener Lauf ist verbraucht. |
| H2 | HOCH | Nur der letzte Commit wurde gegen Änderungen geprüft. Regeländerung in Commit A plus leerer Öffnungs-Commit B wäre durchgegangen. Entscheidungscode lag nicht im Hash. | Öffnungs-Commit muss `freeze=<sha>` tragen. Der Freeze-Commit muss Vorfahr sein, `protocol9` dort PREREGISTERED mit passendem Hash. `git diff` Freeze..HEAD über `scripts/technical`, `quant/engines`, Workflow und Präregistrierung muss leer sein. HEAD muss `GITHUB_SHA` sein. Leerer `freeze.engineFiles` wird abgewiesen. |
| H3 | HOCH | Das Anomalie-Tor von Track B prüfte `[t−52, t+H]`. Einheiten fielen wegen Sprüngen **nach** t heraus, also wegen des Ergebnisses. Das entfernte 24 % der 10×- und 12 % der 5×-Gewinner. | Tor nur noch `[t−52, t]` (kausal). Die alte Variante bleibt als Sensitivität (`--gate full`). Der Anteil markierter Einheiten mit späterem Sprung wird berichtet (`futureJumpShare`). Test M9-B2. |
| H4 | HOCH | `--min-price` auf split-bereinigten Kursen ist Look-ahead (bereinigter Kurs < 1 $ ⇔ spätere Splits; 5×-Quote 26 % gegen 1,9 %). | Option entfernt (Abbruch bei Verwendung). Die Mindestkurs-Sensitivität ist verworfen; die Datei `trackb-w-dev-minprice1.json` wurde gelöscht. CI-Lauf ersetzt durch `--gate full`. |
| M1 | MITTEL | Track-B-Bootstrap mit Jahresblöcken bei 24/36-Monats-Fenstern: Die Zeit-Unsicherheit ist unterschätzt. DEV/VAL teilen den Kalender. | Zeitblöcke ≥ Horizont (1/1/2/3 Jahre). Im Bericht: VAL prüft neue Titel, keine neuen Zeiträume. |
| M2 | MITTEL | Die Schicht-Erwartung enthielt die anderen markierten Einheiten; Signale, die ihre Schichten dominieren, wurden gegen 1 gezogen. | Vergleich nur gegen **nicht markierte** Einheiten derselben Schicht. Der markierte Anteil je Schicht und die Einheiten ohne Vergleich werden berichtet. |
| M3 | MITTEL | Track-B- und Elliott-Regeln entstanden nach Datensicht. Die Freeze-Notiz wurde erst mit den VAL-Ergebnissen committet, der VAL-Lauf startete vor der Notiz. `earlyUp` entstand nach der PLTR-Fallstudie. „Wellen 1–3“ ist nicht „vor Welle 3“. Es gab keine mechanische Track-B-Regel. | Offen in der Präregistrierung dargelegt. Track B und Elliott sind **explorativ mit Gegenprobe auf verbrauchten Daten**. Zusätzlich die breite Definition `EW_INT_UP_ANY_OPEN`. Bezeichnung korrigiert. `decide-m9.mjs` implementiert die Regeln mechanisch. Statt eines „Überschusses ohne Top 5 %“ gilt der symmetrisch gedeckelte Überschuss (4×) mit KI. Ein nur einseitig gestutzter Überschuss wäre strukturell negativ; das zeigte ein erster Versuch, der deshalb verworfen wurde. |
| M4 | MITTEL | Die Bestätigung konnte nur den Nullbefund bestätigen. Mission-VIII-Tagesbefunde (gleicher Kalender, gleiche Engine) fehlten unter „schon gesehen“. Die Wochen-Quantile dienen als Tagesschwellen. | Ergebnis INCONCLUSIVE, wenn das KI eine hohe Trefferquote nicht ausschließt. Mission-VIII-Tagesbefund in §1. Die tatsächliche Abdeckung der Stufen wird berichtet. |
| M5 | MITTEL | Kontrolle D enthält keinen Trend; HAC hätte reine Trendinformation als Treffsicherheit gezählt. b/(a+b) ist kein gültiger Random-Walk-Maßstab für die Outcome-Regel. | HAC verlangt zusätzlich einen Lift gegen Kontrolle E (Trend, ATR%-Terzil). b/(a+b) ist nur Orientierung und offen so benannt. |
| M6 | MITTEL | Die Stichprobenprüfung vertraute dem Manifest: Disjunktheit, Fenster und saubere Dateien wurden nicht geprüft. | `evaluate.mjs` prüft `disjointFrom`, Erkennungsfenster und `dirtyEngineFiles`. Der Workflow vergleicht den Symbol-Hash der Bestätigungs-Stage-1 mit der Dev-Stage-1. |
| L | NIEDRIG | Marke irgendwo im Betreff (auch „Revert …“); Abbruch wartender Läufe; Hash-Wortlaut; FAV-Grenze 1,33 gegen 1,3334; kI = 0; Positiv-Liste der Hygiene; „Vorquartal“ = voriges Array-Element. | Marke nur am Betreffanfang. Push-Disziplin: während des Laufs kein Push. Wortlaut präzisiert (`D:`-Präfix, erste 32 Bit). FAV = 4/3. kI ≤ 0 wird nicht klassiert. Abgeleitete Verhältnisse wie Renditen sind keine Kurse und bleiben erlaubt. Früherkennung nutzt echte Kalenderquartale. |

## Was das Red Team als korrekt bestätigte

* Holm-Stufen und einseitiger p-Wert.
* Disjunktheitslogik: Der Symbol-Hash `457ce200…` von Mission VIII wird reproduziert.
* Ereignis-Export bleibt runner-privat.
* Stage-2-Ergebnisse erscheinen nicht im Log.

## Folgen für die Ergebnisse

* **Track A (DEV/VAL):** HA1 bleibt mit der strengeren Regel bei NO_HIGH_ACCURACY_EDGE. Die obere Treffer-Grenze liegt in allen symmetrischen und günstigen Stufen unter 60 %. Gegen Kontrolle E schrumpft der Lift in SYM von +2,2 auf +1,5 Pp.
* **Track B:** DEV/VAL wurden mit dem korrigierten Code (H3, M1, M2) neu gerechnet; maßgeblich sind die neuen Zahlen (`trackb-w-dev.json`, `trackb-w-val.json`).
