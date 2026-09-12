"""SECProvider — the single SEC/EDGAR access point for fundamentals.

Nothing outside this module (and its http_client) is allowed to call sec.gov for
fundamental data. The UI, the quant engine and the backtester see only the
normalized model.

Endpoints used (all official, no scraping, no third parties):
  https://www.sec.gov/files/company_tickers.json          ticker -> CIK
  https://data.sec.gov/submissions/CIK##########.json     identity + filing index
  https://data.sec.gov/api/xbrl/companyfacts/CIK#####.json  all XBRL facts
  https://data.sec.gov/api/xbrl/companyconcept/...        single concept
  https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip  bulk
"""
import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path

from .http_client import SECHttpClient, SECHTTPError
from .model import CompanyProfile, RawFact
from .version import PROVIDER_ADAPTER_VERSION

LOGGER = logging.getLogger("vu.sec.provider")

TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
TICKER_EXCHANGE_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SUBMISSIONS_PAGE_URL = "https://data.sec.gov/submissions/{name}"
COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
COMPANY_CONCEPT_URL = "https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/{taxonomy}/{concept}.json"
BULK_COMPANY_FACTS_URL = "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip"

# Forms that carry audited/reviewed periodic financial statements. 8-K exhibits
# and S-1s also contain XBRL, but their period semantics are not comparable, so
# they are excluded from the fundamental model rather than silently mixed in.
PERIODIC_FORMS = frozenset({"10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"})
AMENDMENT_FORMS = frozenset({"10-K/A", "10-Q/A", "20-F/A", "40-F/A"})


def normalize_cik(value):
    """Return the 10-digit zero-padded CIK the SEC endpoints expect."""
    if value is None:
        raise ValueError("CIK must not be None")
    digits = str(value).strip().upper().removeprefix("CIK").lstrip("-")
    digits = "".join(ch for ch in digits if ch.isdigit())
    if not digits:
        raise ValueError(f"not a CIK: {value!r}")
    return digits.zfill(10)


def _utcnow_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


PROVIDER_PROFILES_PATH = (
    Path(__file__).resolve().parents[3] / "quant" / "config" / "provider-profiles.json"
)


def load_declared_capabilities(provider_id="sec-edgar", path=PROVIDER_PROFILES_PATH):
    """Capability declaration for a provider, read from the shared profile file.

    Returns {finding: True | False | None}. `None` means "not verified" and must
    never be collapsed into False — the same three-state rule
    `quant/engines/capabilities.js` enforces on the JavaScript side.
    """
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        LOGGER.warning("provider profiles unreadable (%s); treating all capabilities "
                       "as unverified", exc)
        return {}
    profile = (payload.get("providers") or {}).get(provider_id) or {}
    out = {}
    for name, finding in (profile.get("findings") or {}).items():
        value = finding.get("value")
        out[name] = value if value is True or value is False else None
    return out



def _is_iso_date(value):
    """True only for a plausible ISO date. A fact without one has no PIT anchor."""
    if not isinstance(value, str) or len(value) < 10:
        return False
    try:
        date.fromisoformat(value[:10])
    except ValueError:
        return False
    return True


class TickerNotFound(LookupError):
    """Raised when a ticker has no CIK in the SEC's current-registrant map.

    This is expected for delisted issuers: company_tickers.json only lists
    issuers with a currently-assigned ticker (see docs/SEC_COVERAGE_REPORT.md).
    """


class SECProvider:
    """Capabilities: company identification, submissions, facts, filing metadata."""

    ADAPTER_VERSION = PROVIDER_ADAPTER_VERSION

    # Capabilities are NOT declared here. `quant/config/provider-profiles.json`
    # is the repository's single declaration surface for what a provider can and
    # cannot do, and the JS adapter feeds it into `engines/capabilities.js`.
    # A second matrix in Python would be exactly the duplicate the integration
    # audit forbids, and the two would drift.
    PROVIDER_ID = "sec-edgar"


    def __init__(self, client=None):
        self.client = client or SECHttpClient()
        self._ticker_map = None
        self._capabilities = None

    @property
    def DECLARED_CAPABILITIES(self):  # noqa: N802 - mirrors the JS constant name
        """Capabilities as declared in quant/config/provider-profiles.json."""
        if self._capabilities is None:
            self._capabilities = load_declared_capabilities(self.PROVIDER_ID)
        return self._capabilities

    # ------------------------------------------------------------------ identity

    def _load_ticker_map(self):
        if self._ticker_map is None:
            payload = self.client.get_json(TICKER_MAP_URL)
            mapping = {}
            # The file is a dict of positional keys -> {cik_str, ticker, title}.
            rows = payload.values() if isinstance(payload, dict) else payload
            for row in rows:
                ticker = str(row.get("ticker", "")).strip().upper()
                if ticker:
                    mapping[ticker] = {
                        "cik": normalize_cik(row.get("cik_str")),
                        "title": row.get("title"),
                    }
            self._ticker_map = mapping
            LOGGER.info("loaded SEC ticker map: %d tickers", len(mapping))
        return self._ticker_map

    def resolve_ticker(self, ticker):
        """Ticker -> 10-digit CIK. Raises TickerNotFound if the SEC has no mapping."""
        key = str(ticker).strip().upper()
        entry = self._load_ticker_map().get(key)
        if entry is None:
            raise TickerNotFound(
                f"{key} is not in the SEC current-registrant ticker map; "
                "delisted issuers must be addressed by CIK"
            )
        return entry["cik"]

    def try_resolve_ticker(self, ticker):
        try:
            return self.resolve_ticker(ticker)
        except TickerNotFound:
            return None

    # --------------------------------------------------------------- submissions

    def get_submissions(self, cik, include_history=True):
        """Full submissions record with the paged older filings merged in.

        The SEC keeps only the most recent ~1000 filings in `filings.recent`;
        everything older sits in `filings.files[*].name`. Without merging those,
        a company's pre-2015 filing history is silently invisible.
        """
        cik = normalize_cik(cik)
        payload = self.client.get_json(SUBMISSIONS_URL.format(cik=cik))
        if include_history:
            for page in (payload.get("filings", {}) or {}).get("files", []) or []:
                name = page.get("name")
                if not name:
                    continue
                try:
                    extra = self.client.get_json(SUBMISSIONS_PAGE_URL.format(name=name))
                except SECHTTPError as exc:
                    LOGGER.warning("submissions page %s unavailable: %s", name, exc)
                    continue
                recent = payload["filings"]["recent"]
                for column, values in extra.items():
                    recent.setdefault(column, [])
                    recent[column].extend(values)
        payload["_retrieved_at"] = _utcnow_iso()
        return payload

    def get_company_profile(self, cik, submissions=None):
        cik = normalize_cik(cik)
        data = submissions if submissions is not None else self.get_submissions(cik, include_history=False)
        return CompanyProfile(
            cik=cik,
            name=data.get("name") or "",
            tickers=list(data.get("tickers") or []),
            exchanges=list(data.get("exchanges") or []),
            sic=(str(data.get("sic")) if data.get("sic") not in (None, "") else None),
            sic_description=data.get("sicDescription"),
            fiscal_year_end=data.get("fiscalYearEnd"),
            former_names=list(data.get("formerNames") or []),
            entity_type=data.get("entityType"),
            state_of_incorporation=data.get("stateOfIncorporation"),
            retrieved_at=data.get("_retrieved_at") or _utcnow_iso(),
        )

    def get_filing_metadata(self, cik, submissions=None, forms=None):
        """Filing index as a list of dicts, newest first.

        `acceptanceDateTime` is the only field that tells us when a filing became
        publicly visible to the minute; `filingDate` is date granularity only.
        Both are carried through to the PIT layer.
        """
        cik = normalize_cik(cik)
        data = submissions if submissions is not None else self.get_submissions(cik)
        recent = (data.get("filings", {}) or {}).get("recent", {}) or {}
        count = len(recent.get("accessionNumber", []))

        def column(name):
            """One padded column. Built ONCE per column, never inside the loop.

            This used to be called per row, and each call copied the whole
            column. That is quadratic, and with a synthetic fixture of fifty
            filings it looked fine. JPMorgan's real submissions index has ~70k
            filings across 71 pages: the first live run downloaded all 25 MB in
            eight seconds and then sat in this loop for over ten minutes without
            issuing another request. Real data found what the fixtures could not.
            """
            values = recent.get(name) or []
            if len(values) >= count:
                return list(values)
            return list(values) + [None] * (count - len(values))

        accessions = column("accessionNumber")
        form_column = column("form")
        filing_dates = column("filingDate")
        report_dates = column("reportDate")
        acceptance = column("acceptanceDateTime")
        primary_documents = column("primaryDocument")
        is_xbrl_column = column("isXBRL")

        rows = []
        for index in range(count):
            form = (form_column[index] or "").strip()
            if forms is not None and form not in forms:
                continue
            rows.append({
                "cik": cik,
                "accession": accessions[index],
                "form": form,
                "filing_date": filing_dates[index],
                "report_date": report_dates[index] or None,
                "acceptance_datetime": acceptance[index] or None,
                "primary_document": primary_documents[index],
                "is_amendment": form in AMENDMENT_FORMS,
                "is_xbrl": bool(is_xbrl_column[index]),
            })
        rows.sort(key=lambda row: (row["filing_date"] or "", row["accession"] or ""), reverse=True)
        return rows

    # --------------------------------------------------------------------- facts

    def get_company_facts(self, cik):
        cik = normalize_cik(cik)
        payload = self.client.get_json(COMPANY_FACTS_URL.format(cik=cik))
        payload["_retrieved_at"] = _utcnow_iso()
        return payload

    def get_company_concept(self, cik, taxonomy, concept):
        cik = normalize_cik(cik)
        return self.client.get_json(
            COMPANY_CONCEPT_URL.format(cik=cik, taxonomy=taxonomy, concept=concept)
        )

    def iter_raw_facts(self, company_facts, availability=None, taxonomies=None,
                       forms=PERIODIC_FORMS):
        """Flatten a companyfacts payload into immutable RawFact records.

        `availability` maps accession -> ISO datetime the filing became public
        (from get_filing_metadata). When an accession is unknown there, the
        filing date is used and the PIT layer falls back to date granularity.
        """
        cik = normalize_cik(company_facts.get("cik"))
        retrieved_at = company_facts.get("_retrieved_at") or _utcnow_iso()
        availability = availability or {}
        for taxonomy, concepts in (company_facts.get("facts") or {}).items():
            if taxonomies is not None and taxonomy not in taxonomies:
                continue
            for concept, body in (concepts or {}).items():
                for unit, entries in ((body or {}).get("units") or {}).items():
                    for entry in entries or []:
                        form = (entry.get("form") or "").strip()
                        if forms is not None and form not in forms:
                            continue
                        end = entry.get("end")
                        filed = entry.get("filed")
                        value = entry.get("val")
                        if value is None or not _is_iso_date(end) or not _is_iso_date(filed):
                            # Incomplete facts are dropped here and reported by
                            # the quality engine, never repaired by guessing.
                            continue
                        accession = entry.get("accn")
                        yield RawFact(
                            cik=cik,
                            taxonomy=taxonomy,
                            concept=concept,
                            unit=unit,
                            value=float(value),
                            start=entry.get("start"),
                            end=end,
                            accession=accession,
                            form=form,
                            filed=filed,
                            frame=entry.get("frame"),
                            filing_fy=entry.get("fy"),
                            filing_fp=entry.get("fp"),
                            retrieved_at=retrieved_at,
                            available_from=availability.get(accession),
                        )

    # ---------------------------------------------------------------------- bulk

    def open_bulk_company_facts(self, archive_path=None, cache_dir=None):
        """Wahlfreier Zugriff auf das SEC-Sammelarchiv, ohne es in den Speicher zu holen.

        WARUM NICHT EINFACH ALLES LESEN

        `iter_bulk_company_facts` liefert die Emittenten in Archivreihenfolge.
        Wer daraus ein Woerterbuch baut - und genau das tat der erste
        Sammelweg -, haelt die Geschaeftszahlen ALLER gewuenschten
        Emittenten gleichzeitig im Speicher. Apples companyfacts sind rund
        2 MB; bei 7.000 Emittenten waeren das etwa 14 GB. Ein
        GitHub-Runner hat 7. Der Lauf waere nach vierzig Minuten mit
        einem OOM gestorben, mit halbem Bestand und ohne Hinweis auf die
        Ursache.

        Diese Klasse liest stattdessen das Inhaltsverzeichnis des ZIP
        (eine Zeile je Emittent) und holt eine Nutzlast erst, wenn sie
        gebraucht wird. Im Speicher liegt immer nur EIN Emittent, und die
        Reihenfolge der Verarbeitung bleibt unsere - was fuer einen
        begrenzten oder abgebrochenen Lauf entscheidend ist.
        """
        return BulkCompanyFacts(self, archive_path=archive_path, cache_dir=cache_dir)

    def iter_bulk_company_facts(self, ciks=None, archive_path=None):
        """Yield (cik, companyfacts dict) from the SEC bulk companyfacts.zip.

        For an initial import beyond a few hundred issuers this is one request
        instead of one per company, which is what SEC fair access actually asks
        for. The archive is streamed from the cache, never committed.

        `archive_path` reads a local copy instead of fetching. Two reasons, and
        neither is convenience: a run that already downloaded the archive
        should not download it again, and this iteration has to be testable
        without touching sec.gov at all.
        """
        import zipfile

        wanted = {normalize_cik(c) for c in ciks} if ciks else None
        if archive_path is not None:
            handle = Path(archive_path).open("rb")
        else:
            handle = self.client.get_zip(BULK_COMPANY_FACTS_URL)
        # `with` auf dem Dateiobjekt, nicht nur auf dem Archiv: ein
        # offenes Handle auf eine mehrere Gigabyte grosse Datei ist keine
        # Warnung, die man wegdrueckt.
        with handle, zipfile.ZipFile(handle) as archive:
            for info in archive.infolist():
                if not info.filename.startswith("CIK") or not info.filename.endswith(".json"):
                    continue
                cik = normalize_cik(info.filename[3:-5])
                if wanted is not None and cik not in wanted:
                    continue
                with archive.open(info) as handle:
                    payload = json.loads(handle.read())
                payload["_retrieved_at"] = _utcnow_iso()
                payload["_source"] = "bulk_companyfacts_zip"
                yield cik, payload


class BulkCompanyFacts:
    """Ein geoeffnetes SEC-Sammelarchiv mit wahlfreiem Zugriff je CIK.

    Als Kontextmanager zu benutzen; `close()` gibt das Dateihandle frei.
    """

    URL = BULK_COMPANY_FACTS_URL

    def __init__(self, provider, archive_path=None, cache_dir=None):
        import zipfile

        self.provider = provider
        self.downloaded_bytes = 0
        self.from_cache = False
        if archive_path is None:
            cache_dir = Path(cache_dir or ".sec-cache") / "bulk"
            archive_path, size, cached = provider.client.download_to(
                self.URL, cache_dir / "companyfacts.zip")
            self.downloaded_bytes = size
            self.from_cache = cached
        self.archive_path = Path(archive_path)
        self._handle = self.archive_path.open("rb")
        self._zip = zipfile.ZipFile(self._handle)
        # Inhaltsverzeichnis statt Inhalt: rund 15.000 Namen, ein paar
        # hundert Kilobyte - nicht die Gigabyte dahinter.
        self._by_cik = {}
        for info in self._zip.infolist():
            name = info.filename
            if not name.startswith("CIK") or not name.endswith(".json"):
                continue
            self._by_cik[normalize_cik(name[3:-5])] = name
        LOGGER.info("bulk archive opened path=%s issuers=%d",
                    self.archive_path, len(self._by_cik))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False

    def __contains__(self, cik):
        return normalize_cik(cik) in self._by_cik

    def __len__(self):
        return len(self._by_cik)

    @property
    def ciks(self):
        return set(self._by_cik)

    def get(self, cik):
        """Die companyfacts eines Emittenten - oder None, wenn das Archiv ihn nicht fuehrt."""
        key = normalize_cik(cik)
        name = self._by_cik.get(key)
        if name is None:
            return None
        with self._zip.open(name) as handle:
            payload = json.loads(handle.read())
        # DIE CIK AUS DEM DATEINAMEN STEMPELN.
        #
        # Der Einzelabruf liefert `cik` immer; das Sammelarchiv NICHT.
        # 43 der 5.480 Emittenten eines echten Laufs trugen kein
        # cik-Feld, und iter_raw_facts ist daran mit
        # "CIK must not be None" gestorben - mitten im Bestand, nach 61
        # Minuten. Der Dateiname IST die CIK und ist die verlaesslichere
        # Angabe: er kommt aus dem Verzeichnis des Archivs, nicht aus
        # dem Inhalt einer einzelnen Einreichung.
        payload["cik"] = int(key)
        payload["_retrieved_at"] = _utcnow_iso()
        payload["_source"] = "bulk_companyfacts_zip"
        return payload

    def close(self):
        try:
            self._zip.close()
        finally:
            self._handle.close()
