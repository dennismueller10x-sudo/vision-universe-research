"""Historische SIC-Beobachtungen (Point-in-Time) aus offiziellen SEC-Quellen.

Die aktuelle SIC (`data.sec.gov/submissions`, Feld `sic`) ist ein Zustand von
heute und wird hier NIE verwendet. Historisch belegt ist eine SIC nur dort, wo
die SEC sie zum Einreichungszeitpunkt festgehalten hat:

  FSDS_SUB       Financial Statement Data Sets, `sub.txt` je Quartal (ab 2009q1).
                 Readme der SEC: "sic - Four digit code assigned by the SEC as of
                 the filing date". `accepted` ist minutengenau, Eastern Time.
  FILING_HEADER  `Archives/edgar/data/<cik>/<acc>/<acc>.hdr.sgml`: ASSIGNED-SIC
                 des jeweiligen Unternehmensblocks, ACCEPTANCE-DATETIME
                 sekundengenau (Eastern Time); in alten Filings fehlt sie, dann
                 gilt das Einreichungsdatum (Tagesgenauigkeit).

Jede Beobachtung sagt nur: "Zum Zeitpunkt knownAt war oeffentlich, dass die SEC
dem Registranten diese SIC zugewiesen hatte." Gueltigkeit zwischen zwei
Beobachtungen ist eine Ableitung (INFERRED_INTERVAL), keine Tatsache.

Abruf ausschliesslich ueber `http_client.SECHttpClient` (Fair Access). Aus den
Quartals-ZIPs wird per HTTP-Range nur `sub.txt` gelesen (~0,5 MB statt ~100 MB).

Standard-Library only.
"""
import gzip
import hashlib
import html
import json
import re
import struct
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

SCHEMA_VERSION = "sic-history/1.0.0"
# Parser- und Bereinigungslogik. Erhoehen, wenn sich die Bedeutung einer Beobachtung aendert.
LOGIC_VERSION = "1.0.0"


def stamp(generated_at):
    """Stempel nach der Konvention von quant/data/sec (test_workflows.GeneratedArtifactTests).

    generated_at ist der Beobachtungsstand der Quellen, nicht die Uhrzeit des Builds:
    so bleibt ein Rebuild aus denselben Rohdaten byte-gleich.
    """
    return {"schema_version": SCHEMA_VERSION, "generated_at_utc": generated_at,
            "versions": {"sic_history_schema": SCHEMA_VERSION, "sic_history_logic": LOGIC_VERSION}}
FSDS_URL = "https://www.sec.gov/files/dera/data/financial-statement-data-sets/{quarter}.zip"
HEADER_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{nodash}/{accession}.hdr.sgml"
FIRST_FSDS_QUARTER = "2009q1"
EASTERN = ZoneInfo("America/New_York")

SOURCE_FSDS = "FSDS_SUB"
SOURCE_HEADER = "FILING_HEADER"
SOURCE_CODES = {SOURCE_FSDS: "F", SOURCE_HEADER: "H"}

PRECISION_SECOND = "SECOND"
PRECISION_MINUTE = "MINUTE"
PRECISION_DAY = "DAY"

# FSDS-Quartale, deren `sic` nachweislich nicht durchgaengig dem Filing-Header
# entspricht (Kreuzpruefung 20.10.2026: 25 von 60 Paaren in 2013q4-2014q2 falsch,
# 0 von 392 ausserhalb; A-X-A-Ausreisser 2013q3 0,17 %, 2013q4 1,61 %, 2014q1
# 0,61 %, 2014q2 0,15 %, sonst <= 0,03 %). Werte aus diesen Quartalen gelten nur,
# wenn ein Header sie bestaetigt oder sie der letzten vertrauenswuerdigen
# frueheren Beobachtung gleichen (dann behaupten sie keinen Wechsel).
FSDS_SUSPECT_QUARTERS = frozenset({"2013q3", "2013q4", "2014q1", "2014q2"})

FLAG_CONFLICT = "CONFLICT"
FLAG_SUSPECT_CONSISTENT = "SUSPECT_WINDOW_CONSISTENT_WITH_PRIOR"

# Spalten aus sub.txt, die eine Beobachtung braucht. Alles andere bleibt im Rohstand.
FSDS_FIELDS = ("adsh", "cik", "name", "sic", "form", "filed", "accepted", "countryinc", "afs")

_SIC_RE = re.compile(r"^\d{4}$")
_ACCESSION_RE = re.compile(r"^\d{10}-\d{2}-\d{6}$")


class SicSourceError(RuntimeError):
    """Rohquelle unbrauchbar (Format, Pruefsumme, Range). Fuehrt zur Quarantaene."""


# ---------------------------------------------------------------------------
# Zeit: Eastern Time der SEC -> UTC, konservativ fuer knownAt


def quarter_range(first, last):
    """'2009q1'..'2010q2' -> Liste der Quartale (inklusive)."""
    fy, fq = int(first[:4]), int(first[5])
    ly, lq = int(last[:4]), int(last[5])
    out = []
    while (fy, fq) <= (ly, lq):
        out.append(f"{fy}q{fq}")
        fq += 1
        if fq == 5:
            fy, fq = fy + 1, 1
    return out


def _iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def eastern_to_utc(local):
    """naive datetime in America/New_York -> aware UTC datetime.

    Mehrdeutige Herbst-Stunde: fold=1 (die spaetere Instanz) - konservativ.
    """
    return local.replace(tzinfo=EASTERN, fold=1).astimezone(timezone.utc)


def known_at(accepted_local, precision, filing_date):
    """Fruehester belegter Zeitpunkt der oeffentlichen Verfuegbarkeit (UTC, ISO).

    SECOND: Acceptance-Zeitpunkt. MINUTE (FSDS schneidet Sekunden ab): Ende der
    Minute, damit eine Beobachtung nie vor ihrer tatsaechlichen Annahme sichtbar
    wird. DAY: Ende des Einreichungstags in Eastern Time.
    """
    if precision == PRECISION_SECOND:
        return _iso(eastern_to_utc(accepted_local))
    if precision == PRECISION_MINUTE:
        return _iso(eastern_to_utc(accepted_local.replace(second=59, microsecond=0)))
    day = datetime.strptime(filing_date, "%Y-%m-%d")
    return _iso(eastern_to_utc(day.replace(hour=23, minute=59, second=59)))


def _fmt_date(yyyymmdd):
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:8]}"


def normalize_cik(value):
    digits = str(value).strip()
    if not digits.isdigit() or int(digits) <= 0:
        raise ValueError(f"invalid CIK {value!r}")
    return digits.zfill(10)


def normalize_sic(value):
    """'5961' -> '5961'; '' / '0000' / Unsinn -> None (keine SIC zugewiesen)."""
    text = (value or "").strip()
    if text.isdigit() and len(text) < 4:
        text = text.zfill(4)
    if not _SIC_RE.match(text) or text == "0000":
        return None
    return text


# ---------------------------------------------------------------------------
# ZIP-Mitglied per Range lesen


def _central_directory(client, url):
    tail, total = client.get_range(url, -65536)
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0:
        raise SicSourceError(f"{url}: end of central directory not found")
    _, _, _, _, count, cd_size, cd_offset, _ = struct.unpack("<IHHHHIIH", tail[pos:pos + 22])
    start_in_tail = len(tail) - (total - cd_offset)
    if start_in_tail < 0:
        raise SicSourceError(f"{url}: central directory larger than probe")
    cd = tail[start_in_tail:start_in_tail + cd_size]
    members, p = {}, 0
    for _ in range(count):
        (sig, _, _, _, method, _, _, crc, csize, usize, fnl, exl, cml, _, _, _,
         offset) = struct.unpack("<IHHHHHHIIIHHHHHII", cd[p:p + 46])
        if sig != 0x02014B50:
            raise SicSourceError(f"{url}: bad central directory entry")
        name = cd[p + 46:p + 46 + fnl].decode("utf-8", "replace")
        members[name] = {"method": method, "crc32": crc, "compressed": csize,
                         "uncompressed": usize, "offset": offset}
        p += 46 + fnl + exl + cml
    return members, total


def fetch_zip_member(client, url, member):
    """Liest genau ein Mitglied eines entfernten ZIP (deflate) und prueft CRC32.

    Returns (bytes, meta) mit meta = {zipBytes, crc32, compressed, uncompressed, sha256}.
    """
    members, total = _central_directory(client, url)
    entry = members.get(member)
    if entry is None:
        raise SicSourceError(f"{url}: member {member} missing")
    if entry["method"] != 8:
        raise SicSourceError(f"{url}: member {member} not deflated")
    # lokaler Header: 30 Byte + Name + Extra; Extra-Laenge kennt nur der lokale Header
    head, _ = client.get_range(url, entry["offset"], entry["offset"] + 29)
    if head[:4] != b"PK\x03\x04":
        raise SicSourceError(f"{url}: bad local header for {member}")
    fnl, exl = struct.unpack("<HH", head[26:30])
    data_start = entry["offset"] + 30 + fnl + exl
    body, _ = client.get_range(url, data_start, data_start + entry["compressed"] - 1)
    raw = zlib.decompress(body, -15)
    if len(raw) != entry["uncompressed"] or (zlib.crc32(raw) & 0xFFFFFFFF) != entry["crc32"]:
        raise SicSourceError(f"{url}: CRC/size mismatch for {member}")
    return raw, {
        "zipBytes": total,
        "crc32": f"{entry['crc32']:08x}",
        "compressed": entry["compressed"],
        "uncompressed": entry["uncompressed"],
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


# ---------------------------------------------------------------------------
# Parser


def parse_fsds_sub(raw, quarter):
    """sub.txt (Bytes) -> (observations, quarantine)."""
    text = raw.decode("utf-8", "replace")
    lines = text.split("\n")
    header = lines[0].rstrip("\r").split("\t")
    missing = [f for f in ("adsh", "cik", "sic", "form", "filed", "accepted") if f not in header]
    if missing:
        raise SicSourceError(f"{quarter}: sub.txt lacks columns {missing}")
    idx = {name: header.index(name) for name in FSDS_FIELDS if name in header}
    observations, quarantine = [], []
    for line_no, line in enumerate(lines[1:], start=2):
        line = line.rstrip("\r")
        if not line:
            continue
        cols = line.split("\t")
        get = lambda f: cols[idx[f]].strip() if f in idx and idx[f] < len(cols) else ""
        row = {f: get(f) for f in FSDS_FIELDS}
        problem = None
        try:
            cik = normalize_cik(row["cik"])
        except ValueError:
            problem, cik = "INVALID_CIK", None
        if not problem and not _ACCESSION_RE.match(row["adsh"]):
            problem = "INVALID_ACCESSION"
        accepted = None
        if not problem:
            try:
                accepted = datetime.strptime(row["accepted"][:16], "%Y-%m-%d %H:%M")
            except ValueError:
                problem = "MISSING_ACCEPTANCE"
        if not problem and not re.match(r"^\d{8}$", row["filed"]):
            problem = "MISSING_FILING_DATE"
        if problem:
            quarantine.append({"source": SOURCE_FSDS, "quarter": quarter, "line": line_no,
                               "reason": problem, "adsh": row["adsh"], "cik": row["cik"]})
            continue
        filing_date = _fmt_date(row["filed"])
        observations.append({
            "cik": cik,
            "sic": normalize_sic(row["sic"]),
            "accession": row["adsh"],
            "form": row["form"],
            "filingDate": filing_date,
            "acceptedLocal": accepted.strftime("%Y-%m-%dT%H:%M"),
            "precision": PRECISION_MINUTE,
            "knownAt": known_at(accepted, PRECISION_MINUTE, filing_date),
            "name": row["name"],
            "source": SOURCE_FSDS,
            "sourceRef": quarter,
        })
    return observations, quarantine


_TAG_RE = re.compile(r"<([A-Z0-9-]+)>([^\n<]*)")
_BLOCK_ROLES = ("FILER", "SUBJECT-COMPANY", "FILED-BY", "ISSUER", "REPORTING-OWNER")


def parse_header(raw, cik, accession):
    """`.hdr.sgml` -> eine Beobachtung fuer `cik` (oder Quarantaene-Eintrag).

    Ein Header kann mehrere Unternehmensbloecke tragen (Co-Registranten,
    Subject Company). Genommen wird ausschliesslich der Block mit genau diesem
    CIK. Fehlt er, wird nichts geraten.
    """
    cik = normalize_cik(cik)
    text = raw.decode("latin-1")
    top = {}
    blocks, current = [], None
    for line in text.split("\n"):
        line = line.strip()
        role = line[1:-1] if line.startswith("<") and line.endswith(">") else None
        if role in _BLOCK_ROLES:
            current = {"role": role}
            blocks.append(current)
            continue
        if role and role.startswith("/") and role[1:] in _BLOCK_ROLES:
            current = None
            continue
        m = _TAG_RE.match(line)
        if not m:
            continue
        tag, value = m.group(1), m.group(2).strip()
        if current is not None:
            current.setdefault(tag, value)
        else:
            top.setdefault(tag, value)
    matches = [b for b in blocks if b.get("CIK") and normalize_cik(b["CIK"]) == cik]
    sics = {normalize_sic(b.get("ASSIGNED-SIC")) for b in matches}
    base = {"source": SOURCE_HEADER, "accession": accession, "cik": cik}
    if not matches:
        return None, dict(base, reason="CIK_NOT_IN_HEADER")
    if len(sics) > 1:
        return None, dict(base, reason="CONFLICTING_SIC_IN_HEADER", sics=sorted(s or "" for s in sics))
    filing_date = top.get("FILING-DATE", "")
    if not re.match(r"^\d{8}$", filing_date):
        return None, dict(base, reason="MISSING_FILING_DATE")
    filing_date = _fmt_date(filing_date)
    # "<SEC-HEADER>... : 19980331" - Erzeugungstag des Headers; ohne Acceptance-Zeit
    # gilt das Ende des spaeteren Tags (1998: Filing 30.03., Header 31.03.).
    stamp = re.search(r"<SEC-HEADER>[^\n]*:\s*(\d{8})", text)
    day_basis = max(filing_date, _fmt_date(stamp.group(1))) if stamp else filing_date
    acc = top.get("ACCEPTANCE-DATETIME", "")
    if re.match(r"^\d{14}$", acc):
        local = datetime.strptime(acc, "%Y%m%d%H%M%S")
        precision, accepted_local = PRECISION_SECOND, local.strftime("%Y-%m-%dT%H:%M:%S")
    else:
        local, precision, accepted_local = None, PRECISION_DAY, None
    block = matches[0]
    return {
        "cik": cik,
        "sic": normalize_sic(block.get("ASSIGNED-SIC")),
        "accession": accession,
        "form": top.get("TYPE", ""),
        "filingDate": filing_date,
        "acceptedLocal": accepted_local,
        "precision": precision,
        "knownAt": known_at(local, precision, day_basis),
        "name": block.get("CONFORMED-NAME", ""),
        "role": block["role"],
        "source": SOURCE_HEADER,
        "sourceRef": accession,
    }, None


# ---------------------------------------------------------------------------
# Rohspeicher (unveraenderlich, hash-gepinnt) und Manifest


class RawStore:
    """Rohdaten fuer den deterministischen Rebuild. Inhalt gzip mit mtime=0."""

    def __init__(self, root):
        self.root = Path(root)

    def _path(self, kind, key):
        return self.root / kind / f"{key}.gz"

    def has(self, kind, key):
        return self._path(kind, key).exists()

    def put(self, kind, key, raw):
        path = self._path(kind, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        with open(tmp, "wb") as handle:
            handle.write(gzip.compress(raw, mtime=0))
        tmp.replace(path)

    def get(self, kind, key):
        return gzip.decompress(self._path(kind, key).read_bytes())


def ingest_fsds_quarter(client, store, quarter, observed_at):
    """Holt sub.txt eines Quartals in den Rohspeicher. Returns Manifest-Eintrag."""
    url = FSDS_URL.format(quarter=quarter)
    raw, meta = fetch_zip_member(client, url, "sub.txt")
    store.put("fsds", quarter, raw)
    return dict(meta, kind="fsds", key=quarter, url=url, member="sub.txt", observedAt=observed_at)


def ingest_header(client, store, cik, accession, observed_at):
    cik = normalize_cik(cik)
    url = HEADER_URL.format(cik=int(cik), nodash=accession.replace("-", ""), accession=accession)
    raw = client.get_bytes(url, use_cache=False)
    key = f"{cik}_{accession}"
    store.put("header", key, raw)
    return {"kind": "header", "key": key, "url": url, "cik": cik, "accession": accession,
            "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "observedAt": observed_at}


def verify_and_load(store, entry):
    raw = store.get(entry["kind"], entry["key"])
    digest = hashlib.sha256(raw).hexdigest()
    if digest != entry["sha256"]:
        raise SicSourceError(f"{entry['kind']}/{entry['key']}: sha256 {digest} != pinned {entry['sha256']}")
    return raw


# ---------------------------------------------------------------------------
# Aufbau: Beobachtungen -> PIT-Historie je CIK


def _obs_sort_key(o):
    return (o["knownAt"], o["accession"], o["source"])


def build_history(manifest, store, sic_codes=None, cik_filter=None):
    """Deterministischer Aufbau aus Manifest + Rohspeicher (kein Netz).

    Gibt {issuers, quarantine, crosscheck, stats} zurueck. Gleiches Manifest +
    gleiche Rohdaten -> byte-identisches Ergebnis.
    """
    by_cik, quarantine = {}, []
    for entry in sorted(manifest["sources"], key=lambda e: (e["kind"], e["key"])):
        raw = verify_and_load(store, entry)
        if entry["kind"] == "fsds":
            obs, bad = parse_fsds_sub(raw, entry["key"])
            quarantine.extend(bad)
        else:
            ob, bad = parse_header(raw, entry["cik"], entry["accession"])
            obs = [ob] if ob else []
            if bad:
                quarantine.append(bad)
        for o in obs:
            if cik_filter is not None and o["cik"] not in cik_filter:
                continue
            o["observedAt"] = entry["observedAt"]
            by_cik.setdefault(o["cik"], []).append(o)

    fsds_quality = measure_fsds_outliers(by_cik)
    # Quellenabgleich: dieselbe Accession aus FSDS und Header muss dieselbe SIC tragen.
    crosscheck = {"compared": 0, "agree": 0, "disagree": []}
    issuers = {}
    for cik in sorted(by_cik):
        merged = {}
        for o in sorted(by_cik[cik], key=lambda x: (x["accession"], x["source"], x.get("sourceRef", ""))):
            prior = merged.get(o["accession"])
            if prior is None:
                merged[o["accession"]] = o
                continue
            if {prior["source"], o["source"]} == {SOURCE_FSDS, SOURCE_HEADER}:
                fs = prior if prior["source"] == SOURCE_FSDS else o
                hd = o if fs is prior else prior
                if prior.get("crosschecked"):
                    continue  # dieselbe Accession aus einem zweiten FSDS-Quartal: schon verglichen
                crosscheck["compared"] += 1
                if fs["sic"] == hd["sic"]:
                    crosscheck["agree"] += 1
                else:
                    crosscheck["disagree"].append({"cik": cik, "accession": o["accession"], "quarter": fs["sourceRef"],
                                                   "fsds": fs["sic"], "header": hd["sic"]})
                    quarantine.append({"source": "CROSSCHECK", "cik": cik, "accession": o["accession"],
                                       "quarter": fs["sourceRef"], "reason": "FSDS_HEADER_SIC_MISMATCH",
                                       "fsds": fs["sic"], "header": hd["sic"], "resolution": "HEADER_USED"})
                # Der Header ist die Primaerquelle (sekundengenau, zum Einreichungszeitpunkt archiviert).
                merged[o["accession"]] = dict(hd, crosschecked=True)
            # dieselbe Accession aus zwei FSDS-Quartalen: die erste (nach Quartal) bleibt
        kept, last_trusted = [], None
        for o in sorted(merged.values(), key=_obs_sort_key):
            suspect = o["source"] == SOURCE_FSDS and o["sourceRef"] in FSDS_SUSPECT_QUARTERS
            if suspect:
                if last_trusted is None or o["sic"] != last_trusted:
                    quarantine.append({"source": SOURCE_FSDS, "cik": cik, "accession": o["accession"],
                                       "quarter": o["sourceRef"], "reason": "FSDS_SUSPECT_WINDOW_UNCONFIRMED",
                                       "fsds": o["sic"], "priorTrusted": last_trusted, "resolution": "DROPPED"})
                    continue
                o = dict(o, flag=FLAG_SUSPECT_CONSISTENT)
            else:
                last_trusted = o["sic"]
            kept.append(o)
        if kept:
            issuers[cik] = _issuer_record(cik, kept)

    stats = {
        "issuers": len(issuers),
        "observations": sum(len(v["observations"]) for v in issuers.values()),
        "sicChanges": sum(len(v["runs"]) - 1 for v in issuers.values() if v["runs"]),
        "sicChangesBetweenCodes": sum(1 for v in issuers.values() for a, b in zip(v["runs"], v["runs"][1:])
                                      if a["sic"] and b["sic"]),
        "quarantined": len(quarantine),
    }
    return {"issuers": issuers, "quarantine": quarantine, "crosscheck": crosscheck, "stats": stats,
            "fsdsQuality": fsds_quality}


def measure_fsds_outliers(by_cik):
    """Je FSDS-Quartal: Anteil A-X-A-Ausreisser (Wert weicht von beiden Nachbarn ab, die sich gleichen).

    Nur FSDS-Beobachtungen, vor jeder Bereinigung. Reine Messung; die Bereinigung
    folgt aus FSDS_SUSPECT_QUARTERS und der Header-Kreuzpruefung.
    """
    total, spikes = {}, {}
    for obs in by_cik.values():
        seq = sorted((o for o in obs if o["source"] == SOURCE_FSDS), key=_obs_sort_key)
        seen, uniq = set(), []
        for o in seq:
            if o["accession"] not in seen:
                seen.add(o["accession"])
                uniq.append(o)
        for i, o in enumerate(uniq):
            q = o["sourceRef"]
            total[q] = total.get(q, 0) + 1
            if 0 < i < len(uniq) - 1 and uniq[i - 1]["sic"] == uniq[i + 1]["sic"] != o["sic"]:
                spikes[q] = spikes.get(q, 0) + 1
    return {q: {"observations": total[q], "outliers": spikes.get(q, 0),
                "rate": round(spikes.get(q, 0) / total[q], 5)} for q in sorted(total)}


def _issuer_record(cik, observations):
    """Beobachtungen -> Laeufe gleicher SIC. Widersprueche am selben knownAt -> CONFLICT."""
    compact, runs, conflicts = [], [], []
    by_time = {}
    for o in observations:
        by_time.setdefault(o["knownAt"], set()).add(o["sic"])
    for o in observations:
        conflict = len(by_time[o["knownAt"]]) > 1
        compact.append([o["knownAt"], o["sic"], o["accession"], o["form"], SOURCE_CODES[o["source"]],
                        o["precision"][0], FLAG_CONFLICT if conflict else o.get("flag", "")])
        if conflict:
            conflicts.append(o["accession"])
            continue
        if runs and runs[-1]["sic"] == o["sic"]:
            runs[-1]["lastKnownAt"] = o["knownAt"]
            runs[-1]["lastAccession"] = o["accession"]
            runs[-1]["n"] += 1
        else:
            runs.append({"sic": o["sic"], "firstKnownAt": o["knownAt"], "firstAccession": o["accession"],
                         "lastKnownAt": o["knownAt"], "lastAccession": o["accession"], "n": 1})
    return {
        "cik": cik,
        "names": sorted({o["name"] for o in observations if o.get("name")}),
        "observations": compact,
        "runs": runs,
        "conflicts": conflicts,
    }


def sic_code_table(raw_html):
    """Offizielle SEC-SIC-Liste (HTML) -> {code: {description, office}}."""
    text = raw_html.decode("utf-8", "replace")
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.S | re.I)
    table = {}
    for row in rows:
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]
        if len(cells) >= 3 and _SIC_RE.match(cells[0]):
            clean = lambda t: html.unescape(re.sub(r"\s+", " ", t))
            table[cells[0]] = {"office": clean(cells[1]), "description": clean(cells[2])}
    return table


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


# ---------------------------------------------------------------------------
# Orchestrierung: Abruf mit Budget, Build, Ausgabe


class RequestBudget:
    """Harte Obergrenze je Lauf. Ein ueberschrittenes Budget bricht ab, statt weiterzuladen."""

    def __init__(self, client, max_requests):
        self.client, self.max_requests = client, max_requests
        self.start = client.stats["requests"]

    def used(self):
        return self.client.stats["requests"] - self.start

    def check(self, needed=0):
        if self.used() + needed > self.max_requests:
            raise SicSourceError(f"request budget exhausted ({self.used()}/{self.max_requests})")


def load_manifest(path):
    path = Path(path)
    if path.exists():
        return json.loads(path.read_text())
    return {"schemaVersion": SCHEMA_VERSION, "sources": []}


def save_manifest(path, manifest):
    manifest["sources"].sort(key=lambda e: (e["kind"], e["key"]))
    manifest.update(stamp(max((e["observedAt"] for e in manifest["sources"]), default=None)))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n")


def fetch_fsds(client, store, manifest, quarters, observed_at, budget, refresh=False, log=print):
    """Inkrementell: bekannte Quartale werden nicht erneut geladen (ausser refresh)."""
    have = {e["key"]: e for e in manifest["sources"] if e["kind"] == "fsds"}
    added, changed = [], []
    for quarter in quarters:
        if quarter in have and not refresh and store.has("fsds", quarter):
            continue
        budget.check(3)
        try:
            entry = ingest_fsds_quarter(client, store, quarter, observed_at)
        except Exception as exc:  # noqa: BLE001 - jede Quellenstoerung wird protokolliert
            log(f"fsds {quarter}: {exc}")
            manifest.setdefault("failures", []).append({"kind": "fsds", "key": quarter, "error": str(exc)[:300], "at": observed_at})
            continue
        old = have.get(quarter)
        if old and old["sha256"] != entry["sha256"]:
            # Die SEC hat das Quartal neu veroeffentlicht: alter Pin bleibt im Protokoll.
            changed.append({"key": quarter, "old": old["sha256"], "new": entry["sha256"]})
            manifest["sources"].remove(old)
        elif old:
            manifest["sources"].remove(old)
        manifest["sources"].append(entry)
        added.append(quarter)
        log(f"fsds {quarter}: {entry['uncompressed']} bytes sha256={entry['sha256'][:12]}")
    if changed:
        manifest.setdefault("republished", []).extend(changed)
    return added, changed


def fetch_headers(client, store, manifest, targets, observed_at, budget, log=print, workers=4):
    """targets: [(cik, accession)]. Bereits gepinnte Header werden nicht erneut geladen.

    Parallel mit `workers` Threads; das Tempo begrenzt der gemeinsame Rate-Limiter des
    Clients (Fair Access), nicht die Thread-Zahl. Das Budget wird VOR dem Start gegen
    die ganze Liste geprueft - kein halber Lauf.
    """
    from concurrent.futures import ThreadPoolExecutor
    have = {e["key"] for e in manifest["sources"] if e["kind"] == "header"}
    todo, seen = [], set()
    for cik, accession in targets:
        key = f"{normalize_cik(cik)}_{accession}"
        if key in seen or (key in have and store.has("header", key)):
            continue
        seen.add(key)
        todo.append((cik, accession, key))
    budget.check(len(todo))

    def one(item):
        cik, accession, key = item
        try:
            return key, ingest_header(client, store, cik, accession, observed_at), None
        except Exception as exc:  # noqa: BLE001 - jede Quellenstoerung wird protokolliert
            return key, None, str(exc)[:300]

    added = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for key, entry, error in pool.map(one, todo):
            if error:
                log(f"header {key}: {error}")
                manifest.setdefault("failures", []).append({"kind": "header", "key": key, "error": error, "at": observed_at})
                continue
            manifest["sources"].append(entry)
            added.append(key)
    return added


def shard_of(cik):
    return normalize_cik(cik)[-3:]


def write_outputs(out_dir, built, manifest, sic_codes, generated_from):
    """Schreibt Shards + Index. Inhalt haengt nur von Manifest und Rohdaten ab."""
    out = Path(out_dir)
    (out / "issuers").mkdir(parents=True, exist_ok=True)
    shards = {}
    for cik, rec in built["issuers"].items():
        shards.setdefault(shard_of(cik), {})[cik] = rec
    for name in sorted(shards):
        payload = (dumps({"schemaVersion": SCHEMA_VERSION, "issuers": shards[name]}) + "\n").encode()
        (out / "issuers" / f"{name}.json.gz").write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    sources = manifest["sources"]
    fsds = sorted(e["key"] for e in sources if e["kind"] == "fsds")
    observed_through = max((e["observedAt"] for e in sources), default=None)
    index = {
        **stamp(observed_through),
        "schemaVersion": SCHEMA_VERSION,
        "generatedFrom": generated_from,
        "manifestSha256": hashlib.sha256(dumps(sources).encode()).hexdigest(),
        "observationFields": ["knownAt", "sic", "accession", "form", "source", "precision", "flag"],
        "flags": [FLAG_CONFLICT, FLAG_SUSPECT_CONSISTENT],
        "fsdsSuspectQuarters": sorted(FSDS_SUSPECT_QUARTERS),
        "sourceCodes": {"F": SOURCE_FSDS, "H": SOURCE_HEADER}, "precisionCodes": {"S": PRECISION_SECOND, "M": PRECISION_MINUTE, "D": PRECISION_DAY},
        "fsdsQuarters": fsds,
        "fsdsLastQuarter": fsds[-1] if fsds else None,
        "headers": sum(1 for e in sources if e["kind"] == "header"),
        "observedThrough": observed_through,
        "shards": sorted(shards),
        "stats": built["stats"],
        "crosscheck": dict({k: (len(v) if isinstance(v, list) else v) for k, v in built["crosscheck"].items()},
                           disagreeByQuarter=_count(built["crosscheck"]["disagree"], "quarter")),
        "fsdsQuality": built["fsdsQuality"],
        "semantics": {
            "knownAt": "fruehester belegter Zeitpunkt der oeffentlichen Verfuegbarkeit (UTC); MINUTE -> Ende der Minute, DAY -> 23:59:59 ET des Einreichungstags",
            "observation": "SIC, die die SEC dem Registranten zum Einreichungszeitpunkt zugewiesen hatte",
            "validity": "zwischen zwei Beobachtungen nur INFERRED_INTERVAL; keine belegte Gueltigkeit",
            "currentSic": "nicht enthalten; die heutige SIC aus data.sec.gov/submissions wird nie rueckdatiert",
        },
    }
    (out / "index.json").write_text(json.dumps(index, indent=1, sort_keys=True, ensure_ascii=False) + "\n")
    (out / "sic-codes.json").write_text(json.dumps(dict(sic_codes, **stamp(observed_through)), indent=1, sort_keys=True, ensure_ascii=False) + "\n")
    (out / "quarantine.json").write_text(json.dumps({**stamp(observed_through), "count": len(built["quarantine"]),
                                                    "byReason": _count(built["quarantine"], "reason"),
                                                    "entries": built["quarantine"][:2000]}, indent=1, sort_keys=True) + "\n")
    return index


def _count(rows, key):
    out = {}
    for r in rows:
        out[r.get(key)] = out.get(r.get(key), 0) + 1
    return dict(sorted(out.items(), key=lambda kv: str(kv[0])))


SIC_CODES_URL = "https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list"


def build_and_write(manifest, store, out_dir):
    codes_entry = next((e for e in manifest["sources"] if e["kind"] == "siccodes"), None)
    sic_codes = {"source": None, "codes": {}}
    if codes_entry:
        sic_codes = {"source": {"url": codes_entry["url"], "sha256": codes_entry["sha256"],
                                "observedAt": codes_entry["observedAt"],
                                "note": "aktuelle SEC-Liste; Beschreibungen sind nicht zeitpunktbezogen"},
                     "codes": sic_code_table(verify_and_load(store, codes_entry))}
    data_manifest = dict(manifest, sources=[e for e in manifest["sources"] if e["kind"] != "siccodes"])
    built = build_history(data_manifest, store)
    out_dir = Path(out_dir)
    if (out_dir / "issuers").exists():
        for old in list((out_dir / "issuers").glob("*.json")) + list((out_dir / "issuers").glob("*.json.gz")):
            old.unlink()
    generated_from = {"schemaVersion": SCHEMA_VERSION, "sources": len(manifest["sources"])}
    return write_outputs(out_dir, built, data_manifest, sic_codes, generated_from)


def compare_trees(a, b):
    diff = []
    pick = lambda root: {p.relative_to(root).as_posix() for p in Path(root).rglob("*.json*")
                         if p.name != "manifest.json"}
    names = pick(a) | pick(b)
    for name in sorted(names):
        pa, pb = Path(a) / name, Path(b) / name
        if not pa.exists() or not pb.exists() or pa.read_bytes() != pb.read_bytes():
            diff.append(name)
    return diff


def hydrate(client, store, manifest, budget, log=print):
    """Laedt fehlende Rohdaten genau der gepinnten Quellen nach und prueft sha256.

    Fuer einen frischen Runner ohne Rohspeicher. Eine Abweichung heisst: die SEC hat
    die Datei veraendert. Dann bricht der Lauf ab; neu gepinnt wird nur bewusst
    (fetch-fsds --refresh), nie still.
    """
    fetched, mismatched = 0, []
    for entry in sorted(manifest["sources"], key=lambda e: (e["kind"], e["key"])):
        if store.has(entry["kind"], entry["key"]):
            continue
        if entry["kind"] == "fsds":
            budget.check(3)
            raw, _ = fetch_zip_member(client, entry["url"], entry.get("member", "sub.txt"))
        else:
            budget.check(1)
            raw = client.get_bytes(entry["url"], use_cache=False)
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            mismatched.append(f"{entry['kind']}/{entry['key']}")
            continue
        store.put(entry["kind"], entry["key"], raw)
        fetched += 1
    if mismatched:
        raise SicSourceError(f"{len(mismatched)} gepinnte Quellen haben sich geaendert: {mismatched[:10]}")
    log(f"hydrate: {fetched} Quellen nachgeladen")
    return fetched


SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SUBMISSIONS_PAGE_URL = "https://data.sec.gov/submissions/{name}"
# Vom Emittenten selbst eingereichte Formulare. Insider- (3/4/5) und Fremdformulare
# (SC 13D/G) tragen den Emittenten nur als Subject/Issuer und bleiben aussen vor.
ISSUER_FORMS = frozenset({
    "10-K", "10-K405", "10-KT", "10-Q", "10-K/A", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A", "6-K", "8-K",
    "S-1", "S-1/A", "F-1", "F-1/A", "S-4", "F-4", "424B4", "DEF 14A", "10-12B", "10-12G", "20FR12B", "40FR12B",
})


def _quarter_of(day):
    return f"{day[:4]}q{(int(day[5:7]) - 1) // 3 + 1}"


def plan_gap_headers(client, gaps, first_known, budget, log=print, workers=4):
    """Header-Ziele fuer Zeitpunkte vor der ersten Beobachtung.

    gaps: {cik: fruehester unbedeckter Tag}; first_known: {cik: knownAt der ersten Beobachtung | None}.
    Je CIK: das letzte Emittentenfiling am oder vor dem Lueckenbeginn (gibt es keines, etwa vor
    einem Boersengang: das erste danach) und je Kalenderjahr bis zur ersten Beobachtung das letzte
    Emittentenfiling. Die Submissions-Liste liefert nur Accession, Formtyp und Datum - ihre SIC
    (heutiger Stand) wird nicht gelesen.
    """
    from concurrent.futures import ThreadPoolExecutor
    budget.check(len(gaps))

    def listing(cik10, start):
        doc = client.get_json(SUBMISSIONS_URL.format(cik=cik10))
        cols = [doc.get("filings", {}).get("recent", {})]
        for page in doc.get("filings", {}).get("files", []):
            if page.get("filingTo", "9999") >= f"{int(start[:4]) - 2}-01-01" and page.get("filingFrom", "0000") <= start:
                budget.check(1)
                cols.append(client.get_json(SUBMISSIONS_PAGE_URL.format(name=page["name"])))
        filings = []
        for c in cols:
            for acc, form, day in zip(c.get("accessionNumber", []), c.get("form", []), c.get("filingDate", [])):
                if form in ISSUER_FORMS:
                    filings.append((day, acc))
        return sorted(filings)

    def one(cik):
        cik10 = normalize_cik(cik)
        start = gaps[cik]
        try:
            filings = listing(cik10, start)
        except Exception as exc:  # noqa: BLE001
            return cik10, [], str(exc)[:200]
        end = (first_known.get(cik10) or "9999-12-31")[:10]
        before = [f for f in filings if f[0] <= start]
        after = [f for f in filings if start < f[0] < end]
        chosen = {before[-1][1]} if before else ({after[0][1]} if after else set())
        per_year = {}
        for day, acc in after:
            per_year[day[:4]] = acc
        chosen |= set(per_year.values())
        return cik10, sorted(chosen), None

    targets = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for cik10, accs, error in pool.map(one, sorted(gaps)):
            if error:
                log(f"submissions {cik10}: {error}")
            targets.extend([cik10, a] for a in accs)
    return targets
