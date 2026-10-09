"""Version stamps for everything that can change the meaning of a stored number.

Every normalized fact carries these versions so that a later change to a concept
mapping or a formula is detectable in already-persisted data (Phase 4 § 21).
Bump the matching constant whenever the behaviour it names changes.
"""

# Shape of the persisted normalized fact records.
NORMALIZATION_SCHEMA_VERSION = "1.0.0"

# Semantics of period assignment, YTD de-accumulation and PIT resolution.
#
# 1.1.0 — cover-date instants (dei:EntityCommonStockSharesOutstanding) are
#         assigned to the last CLOSED reporting period instead of the period
#         their cover date falls into; a standalone quarter is no longer
#         reconstructed from cumulative periods that are out of order.
#
# 1.2.0 — a cover-date instant no longer publishes its cover date as the cell's
#         period end. The end date comes from what the company itself reported
#         for the same fiscal period.
#
# 1.3.0 — a borrowed period end must not fall after the cover date. Version
#         1.2.0 shipped without that guard, and in the early years the fiscal
#         calendar cannot place unambiguously it borrowed a date a full year
#         later, so a filing appeared to know a balance sheet that had not
#         happened yet.
#
# 1.4.0 — availability reduced to a date never moves earlier than the official
#         filing date (an acceptance timestamp legitimately falls on the
#         previous day), and a derived fact cites the filing that made it
#         knowable rather than the first of its inputs.
#
# 1.5.0 — a fiscal-year label taken from an annual filing's own `fy` field is
#         refused when it would repeat or precede the previous fiscal year.
#         NVDA's 10-Ks for the years ending January 2011 to January 2014 tag it
#         one year low, which produced two fiscal years labelled 2010, no 2014,
#         and four years off by one.
#
# 1.6.0 — EBITDA ist ableitbar. Die Metrikregistry 1.1.0 mappt
#         depreciation_and_amortization; damit faellt der Eintrag aus
#         UNSUPPORTED_METRICS weg und der Wert wird gerechnet statt
#         weggelassen. Fuer jeden bereits gespeicherten Factbook heisst
#         das: neu normalisieren, sonst fehlt EBITDA dort weiter und
#         niemand merkt es.
# 1.7.0 — Fremdwaehrungen und die IFRS-Taxonomie.
#
#         Zwei Mauern fielen gleichzeitig, und beide standen vor
#         denselben Emittenten. 35 Kennzahlen akzeptierten nur `USD`;
#         Unilever meldet in EUR, Canadian National in CAD, und ein
#         korrekt gemapptes Konzept scheiterte trotzdem an der Einheit.
#         Und die Registry kannte ausschliesslich us-gaap - fuer einen
#         20-F-Einreicher gab es also gar nichts zu mappen.
#
#         Jetzt gilt: jede ISO-Waehrung dort, wo USD galt, UMGERECHNET
#         WIRD NICHTS (ein Kurs von heute auf eine Periode von 2012
#         waere geraten und zerstoerte die Point-in-Time-Eigenschaft),
#         die Waehrung steht am Wert, und die Registry 1.2.0 mappt 31
#         gemessene ifrs-full-Konzepte plus die Bilanzidentitaet
#         LiabilitiesAndStockholdersEquity.
#
#         Fuer jeden gespeicherten Factbook heisst das: neu
#         normalisieren. Ohne diesen Versionssprung wuerden die 5.437
#         zwischengespeicherten Emittenten als aktuell gelten, der Lauf
#         meldete Erfolg, und von der ganzen Mapping-Arbeit kaeme nichts
#         an.
# 1.8.0 — Perioden vor dem ersten und ohne ein volles Geschaeftsjahr.
#
#         Zwei Luecken im Kalender, beide gemessen an Emittenten, die
#         trotz gemappter Taxonomie keinen einzigen Wert lieferten
#         (UNPLACEABLE_PERIOD ohne UNKNOWN_CONCEPT):
#
#         (a) Die Eroeffnungsbilanz im ersten Jahresabschluss ist genau
#             ein Jahr vor dem ersten Geschaeftsjahresende datiert, ein
#             40-F traegt drei Vergleichsjahre. Der Kalender projizierte
#             nur nach vorn; alles vor dem ersten bekannten Jahresende
#             war unplatzierbar. Jetzt wird - spiegelbildlich zur
#             Vorwaertsprojektion - rueckwaerts auf Jahrestage
#             projiziert, das Label relativ zum naechsten verankerten
#             Jahr vergeben. Projektionen laufen ueber Kalender-
#             Jahrestage statt ueber 365 Tage, damit ein Schaltjahr
#             das Jahresende nicht in das Nachbarjahr driften laesst.
#
#         (b) Ein Rumpf-Erstgeschaeftsjahr (Mai bis Dezember) erzeugt
#             keine FY-Dauer; ohne eine solche kannte der Kalender kein
#             Jahresende, und JEDER Fakt des Emittenten war
#             unplatzierbar - auch die Bilanz, deren Stichtag der
#             Jahresabschluss selbst nennt. Fehlt jede FY-Dauer, gilt
#             jetzt der Bilanzstichtag des Jahresabschlusses (Formular
#             10-K/20-F/40-F, fp=FY) als Jahresende, ersatzweise das
#             bei der SEC registrierte Jahresende (MMDD) auf den
#             tatsaechlich gemeldeten Stichtagen - auch ueber die
#             Kalendergrenze hinweg (0101, 0103). Gemessen an Lauf 16:
#             ALLE 69 verbliebenen Emittenten ohne Wert hatten einen
#             leeren Kalender; 35 davon hatten nur 10-Qs eingereicht,
#             deren Q1-Bericht die Vorjahresbilanz als Vergleich traegt.
#             Erfunden wird kein Datum; die Herkunft steht als
#             anchor_source am Kalender.
#             Die Rumpfperiode selbst bleibt UNEXPECTED_DURATION - ein
#             Siebenmonatsumsatz ist kein Jahresumsatz.
#
#         (c) Die Branchenschicht (§10). Banken, Versicherer und REITs
#             bekommen im kanonischen Buendel einen EIGENEN Block
#             `industrySpecificMetrics` mit eigenen metricIds; der
#             Kernvertrag in `facts` bleibt unveraendert. Welche
#             Konzepte die Schicht traegt, sagt die Registry - gemessen
#             am Vokabular der Emittenten ohne `revenue`, nicht aus dem
#             Gedaechtnis.
# 1.9.0 — Das registrierte Jahresende traegt auch ohne einen Bericht
#         auf dem Jahresende. Gemessen an Lauf 34766155710: die letzten
#         drei Emittenten ohne Wert waren im Fruehjahr gegruendete
#         Gesellschaften mit 10-Qs fuer Q2 und Q3 und noch keiner
#         Vorjahresbilanz - nichts war auf einem Jahresende datiert, und
#         der Kalender blieb leer. Die bei der SEC registrierten
#         Jahresenden, die die gemeldeten Stichtage einrahmen, sind
#         die eigene Erklaerung des Emittenten; sie werden auf die
#         Jahre projiziert, in denen er gemeldet hat. Rumpfperioden ab
#         Gruendung bleiben UNEXPECTED_DURATION.
# 1.10.0 — Geschaeftsjahresgrenzen nur aus Jahresberichten (10-K, 20-F, 40-F,
#          10-KT, auch /A), und eine Zwoelfmonatsperiode, die nicht auf einem
#          Geschaeftsjahresende endet, wird nicht als FY gefuehrt. Amazon
#          meldet in jedem 10-Q Zwoelfmonatswerte; die Kalendergrenzen aus
#          allen FY-Dauern zerlegten das Jahr in Halbjahre, Q2 hiess Q1 und
#          FY2025 trug den Juni-Wert. Gemessen im Bulk-Archiv: ~250 von 5 066
#          Emittenten mit mindestens einem solchen Jahr.
# 1.11.0 — Fundamental-Data-Integrity-Audit (2026-10-07, 98 Emittenten gegen
#          SEC-Erstmeldungen): (a) Geschaeftsjahresenden nur aus Zwoelfmonats-
#          angaben im Zyklus des eigenen Berichtsjahres eines Jahresberichts -
#          eine Kalenderjahr-Steuersatzangabe im Deere-10-K verschob alle
#          FY2018-Quartale (10 von 98 Emittenten betroffen); (b) Betraege je
#          Aktie werden nicht aus Jahres- oder Kumulwerten abgeleitet (EPS ist
#          nicht additiv; Replimune Q4 FY2021 -0.41 statt gemeldet -0.42);
#          (c) Geschaeftsjahreslabels bei 52/53-Wochen-Jahren mit Ende mal Ende
#          Dezember, mal Anfang Januar ueber den Jahresmittelpunkt; nie zwei Jahre
#          mit demselben Label (Cerner FY2010 und FY2011 trugen beide "2011").
# 1.12.0 — Waehrung vor Konzeptprioritaet innerhalb einer Einreichung: ein
#          Kandidat in einer anderen Waehrung als die Mehrzahl der Geldbetraege
#          derselben Einreichung verliert gegen einen in deren Waehrung. CECO
#          meldet seit 2024 in jedem 10-Q/10-K "Revenues" = 750 Mio. EUR neben
#          dem USD-Umsatz; mit Revenues als Gesamtumsatz (Registry 1.7.0) wurde
#          der EUR-Betrag zum Umsatz. Gefunden in der Consumer-Wirkungsanalyse
#          des Audits, nach dem Holdout (Data-Freeze v2).
# 1.13.0 — Ein Gesamtkonzept (Registry "aggregate", us-gaap:Revenues) gilt in
#          einer Einreichung nur, wenn es nicht kleiner ist als ein anderes
#          Konzept derselben Kennzahl und Waehrung. FLS meldet in jedem 10-Q
#          Revenues = 0, PESI im 10-K 642.000 neben 61,7 Mio. Vertragsumsatz;
#          mit Revenues als Gesamtumsatz (Registry 1.7.0) gewann der Teilbetrag.
#          Gefunden in der universumsweiten Consumer-Gegenprobe (Data-Freeze v3).
# 1.14.0 — Ein Quartal wird nur aus zwei Kumulwerten DESSELBEN Konzepts
#          abgeleitet (YTD-Differenz, FY - 9M). NTRS meldet im 10-K den
#          Gesamtertrag (Revenues), in den 10-Qs nur den Vertragsumsatz; FY
#          minus 9M ergab ein "Q4" von 4.376 Mio. bei Quartalen um 1,25 Mrd.
#          Sonst bleibt das Quartal eine Luecke (wie in der Ground Truth).
# 1.15.0 — Red-Team-Korrektur von 1.13/1.14: (a) ein Gesamtkonzept faellt nur weg,
#          wenn es nicht positiv ist oder unter der Haelfte eines anderen Konzepts
#          derselben Einreichung liegt (Teilbetraege FLS/PESI/VTSI/GEN/VRRM <= 12 %;
#          Nettogesamtumsatz mit negativem Bestandteil UPST/PXD/FCX/PENN 80-98 %);
#          (b) ein Quartal wird ueber das Konzept abgeleitet, das beide Kumulwerte
#          gemeldet haben (gleiche Einreichung, Flags ALT:); ohne Beleg fuer einen
#          Unterschied wie bisher. 1.14.0 verwarf auch korrekte Ableitungen (NVDA
#          Q4 FY2021 5.003 Mio.); die Ground Truth leitet sie ab.
# 1.16.0 — TTM-Integritaet und E12. Ein TTM ist die Summe von vier berichteten
#          Quartalen mit verschiedenen Enden im Abstand von 12-17 Wochen (FUBO:
#          ein Quartal in zwei Rasterplaetzen, TTM-Umsatz 6,09 Mrd.), je Aktie aus
#          einer Konzeptklasse (gesamt vs. fortgefuehrt, Capital Southwest) und
#          auf einer Aktienbasis (Piper-Sandler-Split 4:1, Summe 11,65); additiv
#          bei belegtem Konzeptunterschied im gemeinsamen Konzept, sonst keines.
#          Kein Ersatz durch das Geschaeftsjahr. E12: gewichtete Aktienzahlen
#          sind Durchschnitte, nicht additiv (CSWC Q4 FY2026: 1,0 statt ~68 Mio.).
# 1.17.0 — Umsatz-Mehrdeutigkeit aus Belegen der Einreichung statt 50-%-Regel:
#          ist us-gaap:Revenues kleiner als ein anderes Umsatzkonzept derselben
#          Zelle, entscheidet die Ergebnisrechnung der Einreichung (Statement-
#          Rolle, Presentation/Calculation, quant/config/sec-revenue-statement-
#          evidence.json). Ohne eindeutigen Beleg bleibt die Zelle leer
#          (AMBIGUOUS > GUESSED). Die Regel widersprach den Belegen in 448
#          Zellen (EQT-Nettogesamtumsatz verworfen, Escalade-Anhangwert behalten).
# 1.18.0 — F-TTM-1 (TTM-Holdout): ein Fenster nur aus EPS fortgefuehrter
#          Bereiche ist kein EPS-TTM (VF Corp 2009: Latest-Sicht stellte alle
#          vier Quartale auf das 10-K-Vergleichs-EPS fortgefuehrter Bereiche um).
#          Nach der Holdout-Auswertung behoben, nicht holdout-validiert.
# 1.19.0 — Red Team der TTM-Logik: (1) Splits unter 1,5:1 (5:4, 4:3) zwischen
#          zwei Quartalen sperren das EPS-TTM (Neogen, Wilson Bank); (2) eine
#          Einreichung mit zwei Perioden in einer Zelle laesst die Zelle leer,
#          und ein Fenster vor dem juengsten veroeffentlichten Geschaeftsjahr ist
#          kein TTM (VF Corp nach dem Geschaeftsjahreswechsel); (3) das eigene
#          Jahresende einer Einreichung ist ihr haeufigstes, nicht ihr spaetestes
#          Zwoelfmonatsende (Hovnanian: Kalenderjahr-Steuersaetze verschoben die
#          Fiskaljahre um +3); (4) EPS, das um eine Groessenordnung nicht zu
#          Ergebnis und Aktien passt, wird nicht summiert (Churchill Downs
#          -590000); (5) keine Summe ueber Einheiten/Waehrungen; (6) der im Beleg
#          genannte Umsatz-Zeilenbegriff wird genau gewaehlt. restatements.py
#          gehoert jetzt zu den Normalisierungsquellen.
# 1.20.0 — TTM-Holdout v2 (FAIL): (1) F-TTM-2: ein Geschaeftsjahr ausserhalb
#          350-380 Tagen ist ein Uebergangsjahr; seine Perioden haben keinen
#          Quartalsslot, und ein Index ausserhalb 1..4 wird nicht mehr auf 4
#          geklemmt (Multi-Fineline FY2015, 15 Monate: Okt-Dez 2015 lag auf dem
#          Slot von Jul-Sep 2015, das TTM endete ein Quartal zu frueh). (2) Ein
#          TTM ist eine Kette tatsaechlicher Perioden: je 77-119 Tage, Beginn
#          0-8 Tage nach dem Ende der vorigen, zusammen 357-374 Tage; sonst
#          TTM_STUB_PERIOD (Rumpfperiode nach Fresh Start, Denbury 2020) bzw.
#          TTM_PERIODS_NOT_CONTIGUOUS. Abgeleitete Quartale beginnen am Tag nach
#          dem abgezogenen Kumulwert. (3) F-TTM-3: zwei Fassungen zum selben
#          Zeitpunkt mit verschiedenen Werten sind AMBIGUOUS_SAME_DAY (keine
#          Entscheidung per Formular/Accession) bis zur naechsten eindeutigen
#          Fassung (Landmark Apartment Trust 2013-03-20: 10-K vs. 10-Q/A);
#          eine Rundungsdifferenz (relativ < 1e-4) ist kein Widerspruch. Eine
#          Jahresbilanz am Ende eines Uebergangsjahres bleibt FY (vor dem
#          Freeze nachgezogen: die Slot-Regel liess sie zuerst fallen).
#          Red Team vor dem Freeze: (a) ein Quartal aus zwei Kumulwerten nur bei
#          gleichem Beginn (Best Buy FY2013, Wendy's FY2009); (b) eine am selben
#          Tag mehrdeutige Zelle wird nicht abgeleitet (Rayonier 2013 Q2);
#          (c) jede Quartalszelle sitzt auf ihrem Kalenderslot; (d) Kette -3..+8
#          Tage (Vishay, Loews); (e) ein EPS, das unter 1.000 Aktien impliziert,
#          ist kein EPS (Stanley Black & Decker 10-Q/A 2022); (f) eine neuere
#          sichtbare Periode derselben Kennzahl, auch eine nicht einordbare
#          (Quartal eines Uebergangsjahres), macht ein aelteres Fenster nicht
#          aktuell: TTM_WINDOW_NOT_CURRENT (e.l.f. Beauty 2019, Royal Gold 2022);
#          (g) ein Jahresende nach dem Einreichungsdatum ist kein Geschaeftsjahr
#          (Nucor 10-K 2011: Annahme fuer 2027).
#
# 1.21.0 — TTM-Holdout v3 (FAIL gegen 1.20.0): (1) F-TTM-4: ein Jahresbericht
#          traegt das Geschaeftsjahr VOR einem Wechsel des Jahresendes auf dem
#          alten Zyklus (8point3 2013-12-30..2014-12-28 vor dem Uebergangs-
#          zeitraum 2014-12-29..2015-11-30). Die Zyklusregel (Deere, Hovnanian)
#          verwarf es, der Kalender schrieb das neue Jahresende rueckwaerts fort
#          und das Uebergangsjahr bekam Quartalsslots. Jetzt folgt der Kalender
#          der Periodenkette des Berichts rueckwaerts: ein 12-Monats-Zeitraum
#          direkt (-3..+8 Tage) vor einem anerkannten Geschaeftsjahr ist dessen
#          Vorjahr, ein kuerzerer Zeitraum auf dem Zyklus des Berichts direkt
#          davor, dem selbst ein 12-Monats-Zeitraum vorausgeht, ist ein
#          Uebergangszeitraum (Diamond S 2018-04-01..12-31; Multi-Fineline
#          10-KT 2014-10-01..12-31). Ein Zeitraum, der ein anerkanntes
#          Geschaeftsjahr ueberlappt, zaehlt nie. (2) F-TTM-5: ein Jahresbericht
#          ist nach seinem eigenen Jahresende eingereicht; ein 12-Monats-
#          Zeitraum, der mehr als ein Jahr vor der Einreichung endete, ist ein
#          Vergleichsjahr und kein Anker der Jahreskennung (FairPoint FY2011,
#          geteilt in Predecessor/Successor: 2010-12-31 wurde "FY2011", jede
#          spaetere Kennung +1).
NORMALIZATION_LOGIC_VERSION = "1.21.0"

# Bumped by quant/config/sec-metric-registry.json itself; this is the minimum the
# code understands.
METRIC_REGISTRY_MIN_VERSION = 1

# Derived-metric formulas. Bump on any change to derived.py's arithmetic.
# 1.2.0 — abgeleitete Groessen vermischen keine Waehrungen mehr und
#         tragen die Waehrung ihrer Eingangsgroessen statt pauschal USD.
FORMULA_VERSION = "1.2.0"

# The SEC access adapter (endpoints, fair-access behaviour).
PROVIDER_ADAPTER_VERSION = "sec-edgar-1.0.0"

# Data quality rule set.
QUALITY_RULES_VERSION = "1.0.0"


# Files whose content defines NORMALIZATION_LOGIC_VERSION. Changing any of them
# changes the meaning of stored facts, so the version above has to move with
# them — otherwise `pipeline._is_current` treats a cached factbook as current
# and the new logic never runs. That happened once: a cover-date fix was
# deployed, every run reported success, and nothing was re-normalized.
# test_version_discipline.py turns that into a failing test instead.
NORMALIZATION_SOURCES = (
    "normalize.py", "fiscal.py", "periods.py", "derived.py", "canonical.py",
    "restatements.py",
)

# sha256 over NORMALIZATION_SOURCES, recorded when the version above was last
# bumped. Update BOTH together.
NORMALIZATION_SOURCE_DIGEST = (
    "19700277c0fa8dc5d49c37a225429df2586f1d3f60b9fcde01908e768a045a0e"
)


def normalization_source_digest():
    """Hash of the modules that define normalization semantics.

    Git stores these Python sources with LF. A Windows checkout may expose the
    identical blobs as CRLF through core.autocrlf; line-ending conversion does
    not change Python semantics and must not look like a normalization change.
    """
    import hashlib
    from pathlib import Path

    here = Path(__file__).resolve().parent
    digest = hashlib.sha256()
    for name in NORMALIZATION_SOURCES:
        digest.update(name.encode("utf-8"))
        digest.update((here / name).read_bytes().replace(b"\r\n", b"\n"))
    return digest.hexdigest()


def version_stamp(metric_registry_version=None):
    """Return the full version block embedded in every generated artifact."""
    stamp = {
        "normalization_schema": NORMALIZATION_SCHEMA_VERSION,
        "normalization_logic": NORMALIZATION_LOGIC_VERSION,
        "formula": FORMULA_VERSION,
        "provider_adapter": PROVIDER_ADAPTER_VERSION,
        "quality_rules": QUALITY_RULES_VERSION,
    }
    if metric_registry_version is not None:
        stamp["metric_registry"] = metric_registry_version
    stamp["revenue_evidence"] = revenue_evidence_version()
    return stamp


def revenue_evidence_version():
    """Version of quant/config/sec-revenue-statement-evidence.json (None if absent)."""
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parents[3] / "quant" / "config" / "sec-revenue-statement-evidence.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8")).get("version")
