"""SEC Financial Statement Data Sets as a supplement to companyfacts.

WARUM ES DAS BRAUCHT

companyfacts.zip fehlt fuer manche Meldungen jeder Fakt, obwohl die Meldung
als (Inline-)XBRL eingereicht wurde: am 25.10.2026 bei 225 juengsten
periodischen Meldungen des Produktuniversums (Abbott 10-Q vom 28.07.2026,
Clorox 10-K vom 07.08.2026, ...). Die SEC veroeffentlicht dieselben
XBRL-Zahlen vierteljaehrlich ein zweites Mal, als "Financial Statement Data
Sets" (DERA, sub.txt + num.txt). Dort stehen 208 dieser 225 Meldungen.

Gemessen an 400 zufaelligen Meldungen, die in beiden Quellen stehen, sind
alle 7.039 verglichenen Werte identisch. Es wird also nichts geschaetzt: der
Wert ist der der Meldung, nur aus der zweiten SEC-Veroeffentlichung.

WAS ES NICHT TUT

  - Es ersetzt nie einen Fakt aus companyfacts. Ergaenzt werden nur
    Meldungen (Accessions), von denen companyfacts gar nichts enthaelt.
  - Die Data Sets runden das Periodenende auf das Monatsende (AMD Q2 2026:
    20260630 statt 2026-06-27) und nennen keinen Periodenbeginn, nur die
    Zahl der Quartale. Exakt ist das nur fuer Emittenten, deren Perioden am
    Monatsende enden. Ein Emittent mit 52/53-Wochen-Kalender (Coca-Cola,
    General Dynamics, NXP ...) wird deshalb NICHT ergaenzt - lieber eine
    Luecke als ein verschobenes Datum.
  - Nur Standard-Taxonomien (us-gaap, ifrs-full, dei, srt), nur Werte ohne
    Segment- oder Co-Registrant-Dimension - genau das, was companyfacts
    auch enthaelt.
"""
import calendar
import csv
import io
import logging
import zipfile
from datetime import date

from pathlib import Path

from .provider import PERIODIC_FORMS, normalize_cik
from .sic_history import FSDS_URL

LOGGER = logging.getLogger("vu.sec.fsds")

SOURCE_LABEL = "SEC Financial Statement Data Sets"

# version in num.txt: "us-gaap/2026", "ifrs/2026", ... - eigene Tags tragen
# die Accession als version und werden nicht uebernommen.
TAXONOMY_BY_VERSION = {"us-gaap": "us-gaap", "ifrs": "ifrs-full", "dei": "dei", "srt": "srt"}

# Ob ein Emittent heute am Monatsende abschliesst, entscheiden seine
# Hauptberichtsperioden der letzten drei Jahre: Periodenenden mit mindestens
# so vielen Fakten. Aeltere Jahre zaehlen nicht (Johnson Controls, Pentair,
# Cadence meldeten bis 2015/2022 in 52/53-Wochen-Perioden und schliessen
# seither am Monatsende ab), einzelne Stichtage auch nicht (ein
# Uebernahmedatum mit einem Fakt ist kein Kalender).
RECENT_YEARS = 3
MAIN_PERIOD_FACTS = 10


def recent_quarters(as_of, count=4):
    """The `count` most recent calendar quarters BEFORE as_of's quarter, newest first.

    The data set of a quarter is published early in the following quarter, so
    the current quarter never has one yet.
    """
    year, quarter = as_of.year, (as_of.month - 1) // 3 + 1
    out = []
    for _ in range(count):
        quarter -= 1
        if quarter == 0:
            year, quarter = year - 1, 4
        out.append(f"{year}q{quarter}")
    return out


def fetch_recent(client, cache_dir, as_of, count=4, log=print):
    """Download the data sets of the `count` most recent quarters; paths of those that exist.

    A quarter the SEC has not published yet is reported and skipped - the
    supplement is a completion, never a reason to fail the run.
    """
    paths = []
    for quarter in recent_quarters(as_of, count):
        target = Path(cache_dir) / "fsds" / f"{quarter}.zip"
        try:
            path, size, cached = client.download_to(FSDS_URL.format(quarter=quarter), target)
        except Exception as exc:  # noqa: BLE001 - ein fehlendes Quartal bricht nichts ab
            log(f"  fsds {quarter}: nicht verfuegbar ({str(exc)[:160]})")
            continue
        log(f"  fsds {quarter}: {size / 1e6:.1f} MB {'aus dem Cache' if cached else 'geladen'}")
        paths.append(str(path))
    return paths


def _iso(yyyymmdd):
    text = str(yyyymmdd or "").strip()
    if len(text) != 8 or not text.isdigit():
        return None
    return f"{text[:4]}-{text[4:6]}-{text[6:]}"


def _start_for(end_iso, quarters):
    """First day of the period ending on the month end `end_iso` and spanning `quarters`."""
    year, month = int(end_iso[:4]), int(end_iso[5:7])
    month -= 3 * quarters - 1
    while month <= 0:
        year, month = year - 1, month + 12
    return date(year, month, 1).isoformat()


def _rows(archive, name):
    with archive.open(name) as handle:
        yield from csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8", errors="replace"),
                                  delimiter="\t")


def load_supplement(archive_paths, ciks, concepts=None):
    """{cik: {accession: Filing}} from FSDS archives.

    Only periodic forms of the wanted CIKs; only standard-taxonomy values
    without segments or co-registrant; with `concepts` ({(taxonomy, concept)},
    the registry's accepted concepts) only those - everything else would be
    read and thrown away by normalization, and across 5,000 issuers and four
    quarters it is millions of rows. A per-share value (tag datatype perShare)
    gets the companyfacts unit "<currency>/shares".
    """
    wanted = {normalize_cik(c) for c in ciks}
    out = {}
    for path in archive_paths:
        with zipfile.ZipFile(path) as archive:
            filings = {}
            for row in _rows(archive, "sub.txt"):
                cik = normalize_cik(row.get("cik"))
                form = (row.get("form") or "").strip()
                if cik in wanted and form in PERIODIC_FORMS:
                    fy = row.get("fy")
                    filings[row["adsh"]] = Filing(cik, row["adsh"], form, _iso(row.get("filed")),
                                                  int(fy) if str(fy).isdigit() else None, row.get("fp") or None)
            if not filings:
                continue
            per_share = {(row["tag"], row["version"]) for row in _rows(archive, "tag.txt")
                         if row.get("datatype") == "perShare"}
            for row in _rows(archive, "num.txt"):
                filing = filings.get(row["adsh"])
                if filing is None or row.get("segments") or row.get("coreg") or not row.get("value"):
                    continue
                taxonomy = TAXONOMY_BY_VERSION.get((row.get("version") or "").split("/", 1)[0])
                if taxonomy is None or (concepts is not None and (taxonomy, row["tag"]) not in concepts):
                    continue
                end = _iso(row.get("ddate"))
                if end is None:
                    continue
                try:
                    value = float(row["value"])
                    quarters = int(row.get("qtrs") or 0)
                except ValueError:
                    continue
                unit = row.get("uom") or ""
                if (row["tag"], row["version"]) in per_share and "/" not in unit:
                    unit += "/shares"
                filing.values.append((taxonomy, row["tag"], unit, end,
                                      _start_for(end, quarters) if quarters > 0 else None, value))
            for accn, filing in filings.items():
                if filing.values:
                    out.setdefault(filing.cik, {})[accn] = filing
    return out


class Filing:
    """One periodic filing from a data set: its metadata and its values as compact tuples."""
    __slots__ = ("cik", "accession", "form", "filed", "fy", "fp", "values")

    def __init__(self, cik, accession, form, filed, fy, fp):
        self.cik, self.accession, self.form, self.filed, self.fy, self.fp = cik, accession, form, filed, fy, fp
        self.values = []   # (taxonomy, concept, unit, end, start or None, value)

    def entries(self):
        """(taxonomy, concept, unit, companyfacts-shaped entry) per value."""
        for taxonomy, concept, unit, end, start, value in self.values:
            entry = {"end": end, "val": value, "accn": self.accession, "fy": self.fy, "fp": self.fp,
                     "form": self.form, "filed": self.filed}
            if start:
                entry["start"] = start
            yield taxonomy, concept, unit, entry


def _is_month_end(iso):
    year, month, day = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
    return day == calendar.monthrange(year, month)[1]


def month_end_calendar(company_facts):
    """True when the issuer's recent main reporting periods end on month ends.

    Measured on its duration facts in companyfacts: the period ends of the
    last RECENT_YEARS years that carry at least MAIN_PERIOD_FACTS facts (all of
    them if none does). An issuer without any is not judged (False) - the
    supplement then stays away.
    """
    from collections import Counter
    ends = Counter()
    for concepts in (company_facts.get("facts") or {}).values():
        for body in (concepts or {}).values():
            for entries in ((body or {}).get("units") or {}).values():
                for entry in entries or []:
                    if entry.get("start") and entry.get("end") and (entry.get("form") or "") in PERIODIC_FORMS:
                        ends[entry["end"]] += 1
    if not ends:
        return False
    latest = max(ends)
    since = f"{int(latest[:4]) - RECENT_YEARS}{latest[4:]}"
    recent = {end: n for end, n in ends.items() if end > since}
    main = [end for end, n in recent.items() if n >= MAIN_PERIOD_FACTS] or list(recent)
    return all(_is_month_end(end) for end in main)


def supplement_company_facts(company_facts, filings):
    """(payload, added accessions): FSDS filings companyfacts has nothing of, merged in.

    `filings` is one CIK's {accession: Filing} from load_supplement. Nothing
    already in companyfacts is touched; a week-based issuer gets nothing.
    """
    if not filings:
        return company_facts, []
    present = {entry.get("accn")
               for concepts in (company_facts.get("facts") or {}).values()
               for body in (concepts or {}).values()
               for entries in ((body or {}).get("units") or {}).values()
               for entry in entries or []}
    missing = sorted(accn for accn in filings if accn not in present)
    if not missing or not month_end_calendar(company_facts):
        return company_facts, []
    import copy
    merged = copy.deepcopy(company_facts)
    facts = merged.setdefault("facts", {})
    for accn in missing:
        for taxonomy, concept, unit, entry in filings[accn].entries():
            units = facts.setdefault(taxonomy, {}).setdefault(concept, {"units": {}}).setdefault("units", {})
            units.setdefault(unit, []).append(entry)
    return merged, missing
