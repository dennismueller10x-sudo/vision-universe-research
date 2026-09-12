"""Ingestion pipeline: five companies today, thousands later, same code path.

Nothing here is parameterised by ticker or by company. `ingest_company` takes a
CIK; `ingest_universe` takes a list of them. The five validation companies are
an input file, not a branch in the code.

Incremental updates work off the submissions index: if a company has filed
nothing new since the last stored run, the (large) companyfacts payload is not
fetched at all. Checkpointing makes a 2000-company import resumable at the
company it died on.
"""
import logging
import time
from datetime import datetime, timezone

from . import quality as quality_module
from .fiscal import FiscalCalendar
from .normalize import build_availability_map, normalize_company
from .provider import PERIODIC_FORMS, SECProvider, normalize_cik
from .registry import MetricRegistry
from .restatements import POLICY_AS_OF_LATEST, POLICY_LATEST_KNOWN
from .store import CheckpointStore, JsonFactStore, JsonRawStore
from .version import version_stamp

LOGGER = logging.getLogger("vu.sec.pipeline")

STATUS_INGESTED = "INGESTED"
STATUS_UNCHANGED = "UNCHANGED"
STATUS_FAILED = "FAILED"


def _utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class IngestionPipeline:
    def __init__(self, provider=None, registry=None, raw_store=None, fact_store=None,
                 checkpoint=None, run_id="default"):
        self.provider = provider or SECProvider()
        self.registry = registry or MetricRegistry.load()
        self.raw_store = raw_store or JsonRawStore()
        self.fact_store = fact_store or JsonFactStore(compress=True)
        self.checkpoint = checkpoint or CheckpointStore(run_id=run_id)

    # ------------------------------------------------------------ single company

    def latest_filing_signature(self, filing_metadata):
        """Cheap change detector: newest periodic filing this company has made."""
        periodic = [row for row in filing_metadata if row["form"] in PERIODIC_FORMS]
        if not periodic:
            return None
        newest = max(periodic, key=lambda row: (row["filing_date"] or "", row["accession"] or ""))
        return {"accession": newest["accession"], "filing_date": newest["filing_date"],
                "form": newest["form"], "periodic_filings": len(periodic)}

    def ingest_company(self, cik, force=False, company_facts=None):
        """Fetch, archive, normalize, quality-check and store one company.

        `company_facts` accepts a payload that was already retrieved — that is
        what the bulk path hands in. It changes nothing about normalization,
        archiving or provenance: the payload is stored and hashed exactly as a
        per-company fetch would be, and it carries its own `_source`.
        """
        cik = normalize_cik(cik)
        started = time.monotonic()

        submissions = self.provider.get_submissions(cik)
        submissions_hash = self.raw_store.put(cik, "submissions", submissions)
        # Stamp the retrieval time from the archive before anything reads it, so
        # the profile is derived from a stable timestamp too (see below).
        submissions_snapshot = self.raw_store.snapshot_record(
            cik, "submissions", submissions_hash)
        if submissions_snapshot is not None:
            submissions["_retrieved_at"] = submissions_snapshot["first_seen"]
        profile = self.provider.get_company_profile(cik, submissions)
        filing_metadata = self.provider.get_filing_metadata(cik, submissions)

        signature = self.latest_filing_signature(filing_metadata)
        stored = self.fact_store.read_company(cik)
        if stored and not force and self._is_current(stored, signature):
            LOGGER.info("cik=%s unchanged since %s; skipping companyfacts fetch",
                        cik, signature and signature["filing_date"])
            return {"cik": cik, "status": STATUS_UNCHANGED, "signature": signature,
                    "seconds": round(time.monotonic() - started, 2)}

        if company_facts is None:
            company_facts = self.provider.get_company_facts(cik)
        facts_hash = self.raw_store.put(cik, "companyfacts", company_facts)

        # Provenance records when this payload was FIRST retrieved, not when
        # this run happened. Re-normalizing unchanged SEC data must produce a
        # byte-identical factbook, or every run would churn the store and no
        # diff would mean anything.
        snapshot = self.raw_store.snapshot_record(cik, "companyfacts", facts_hash)
        if snapshot is not None:
            company_facts["_retrieved_at"] = snapshot["first_seen"]

        availability = build_availability_map(filing_metadata)
        raw_facts = list(self.provider.iter_raw_facts(
            company_facts, availability=availability, forms=PERIODIC_FORMS))

        calendar = FiscalCalendar.from_raw_facts(
            cik, raw_facts, fiscal_year_end_hint=profile.fiscal_year_end)
        result = normalize_company(cik, raw_facts, self.registry, profile=profile,
                                   filing_metadata=filing_metadata, calendar=calendar)
        findings, summary = quality_module.run_all(
            raw_facts, result.factbook, self.registry, result.issues)

        document = {
            "cik": cik,
            "generated_at_utc": _utcnow(),
            "versions": version_stamp(self.registry.version),
            "raw_companyfacts_sha256": facts_hash,
            "latest_filing": signature,
            "filing_years": _filing_years(filing_metadata),
            "filing_index": _filing_index(filing_metadata),
            "profile": profile.to_dict(),
            "calendar": calendar.to_dict(),
            "stats": result.stats,
            "quality": {"summary": summary, "findings": findings},
            "factbook": result.factbook.to_dict(),
        }
        self.fact_store.write_company(cik, document)
        return {
            "cik": cik, "status": STATUS_INGESTED, "signature": signature,
            "stats": result.stats, "quality": summary,
            "seconds": round(time.monotonic() - started, 2),
        }

    def _versions_current(self, stored):
        """Was this document produced by the code that is running now?

        A mapping, formula or normalization change invalidates stored output by
        design. This needs no network access, so both the resume path and
        `_is_current` can ask it.
        """
        return stored.get("versions") == version_stamp(self.registry.version)

    def _is_current(self, stored, signature):
        """A stored document is current only if versions AND filings both match."""
        if signature is None:
            return False
        if not self._versions_current(stored):
            return False
        return stored.get("latest_filing") == signature

    # ----------------------------------------------------------------- universe

    def ingest_universe(self, entries, resume=True, force=False, limit=None,
                        max_attempts=3, bulk=False, bulk_archive=None):
        """Ingest many companies with checkpointing, a failure log and a retry queue.

        `bulk=True` takes the XBRL facts from the SEC's bulk archive instead of
        asking for each issuer separately. For five companies that is a
        detour; for five thousand it is the difference between ~10.000
        requests and ~5.000 plus one, and SEC fair access is the reason this
        option exists at all (§25). What it does NOT remove is the submissions
        request per company: the filing index decides which facts are
        comparable and when each became public, and there is no bulk form of
        it. Anyone scaling this further has to start there.
        """
        state = self.checkpoint.load() if resume else {
            "run_id": self.checkpoint.run_id, "started_at": _utcnow(),
            "completed": {}, "failed": {}, "retry_queue": [], "last_cik": None,
        }
        results = []
        processed = 0

        archive = None
        bulk_source = None
        if bulk:
            wanted = [normalize_cik(e["cik"] if isinstance(e, dict) else e) for e in entries]
            # WAHLFREIER ZUGRIFF, KEIN WOERTERBUCH.
            #
            # Die erste Fassung las alle gewuenschten Emittenten in ein
            # dict. Bei fuenf Emittenten faellt das nicht auf; bei 7.000
            # sind es rund 14 GB und der Lauf stirbt mitten im Bestand.
            # Das Archiv wird deshalb auf Platte gestroemt und je Emittent
            # eine Nutzlast gelesen.
            archive = self.provider.open_bulk_company_facts(archive_path=bulk_archive)
            vorhanden = len(archive.ciks & set(wanted))
            bulk_source = {"requested": len(wanted), "found_in_archive": vorhanden,
                           "issuers_in_archive": len(archive),
                           "archive": bulk_archive or "sec.gov bulk companyfacts.zip",
                           "archive_path": str(archive.archive_path),
                           "downloaded_bytes": archive.downloaded_bytes,
                           "from_cache": archive.from_cache,
                           "access": "random_access_no_preload"}
            LOGGER.info("bulk companyfacts: %d of %d requested issuers in the archive "
                        "(archive holds %d)", vorhanden, len(wanted), len(archive))

        try:
            outcome = self._ingest_entries(entries, state, results, archive, bulk, bulk_source,
                                           resume=resume, force=force, limit=limit,
                                           max_attempts=max_attempts)
        finally:
            if archive is not None:
                archive.close()
        return outcome

    def _ingest_entries(self, entries, state, results, archive, bulk, bulk_source,
                        resume=True, force=False, limit=None, max_attempts=3):
        processed = 0
        for entry in entries:
            cik = normalize_cik(entry["cik"] if isinstance(entry, dict) else entry)
            if limit is not None and processed >= limit:
                break
            if resume and self.checkpoint.is_completed(state, cik):
                stored = self.fact_store.read_company(cik)
                if stored is None:
                    # The checkpoint says done but the stored document is gone
                    # (cleared cache, cleaned working copy, failed write).
                    # Trusting the checkpoint alone would silently leave a hole
                    # in the store.
                    LOGGER.warning("cik=%s marked completed but not present in "
                                   "the fact store; re-ingesting", cik)
                    state["completed"].pop(cik, None)
                elif not self._versions_current(stored):
                    # The checkpoint answers "did this run already do this
                    # company", NOT "is the stored document still valid". Only
                    # _is_current answers the second question, and the skip
                    # above jumped over it: with a warm cache a changed
                    # normalization was never applied while every step still
                    # reported success. The version stamp is local, so this
                    # costs no request.
                    LOGGER.info("cik=%s stored under an older version stamp; "
                                "re-normalizing", cik)
                    state["completed"].pop(cik, None)
                elif not force:
                    continue
            attempts = state["failed"].get(cik, {}).get("attempts", 0)
            if attempts >= max_attempts:
                LOGGER.warning("cik=%s skipped: %d failed attempts", cik, attempts)
                continue
            processed += 1
            try:
                outcome = self.ingest_company(
                    cik, force=force,
                    company_facts=archive.get(cik) if archive is not None else None)
                state = self.checkpoint.mark_completed(state, cik, {
                    "status": outcome["status"],
                    "latest_filing": (outcome.get("signature") or {}).get("accession"),
                })
                results.append(outcome)
            except Exception as exc:  # noqa: BLE001 - the failure log is the point
                LOGGER.exception("ingest failed cik=%s", cik)
                state = self.checkpoint.mark_failed(state, cik, exc)
                results.append({"cik": cik, "status": STATUS_FAILED, "error": str(exc)})
            finally:
                # Written after every company so a crash resumes at the next one.
                self.checkpoint.save(state)

        manifest = {
            "generated_at_utc": _utcnow(),
            "versions": version_stamp(self.registry.version),
            "provider_adapter": self.provider.ADAPTER_VERSION,
            "companies": self.fact_store.list_companies(),
            "run": {
                "run_id": state["run_id"],
                "processed": processed,
                "completed": len(state["completed"]),
                "failed": len(state["failed"]),
                "retry_queue": list(state["retry_queue"]),
                "facts_source": "bulk_companyfacts_zip" if bulk else "per_company_api",
                "bulk": bulk_source,
            },
        }
        self.fact_store.write_manifest(manifest)
        return {"results": results, "state": state, "manifest": manifest}

    def retry_failed(self, max_attempts=3):
        state = self.checkpoint.load()
        queue = list(state.get("retry_queue", []))
        if not queue:
            return {"results": [], "state": state, "manifest": self.fact_store.read_manifest()}
        return self.ingest_universe([{"cik": cik} for cik in queue], resume=True,
                                    max_attempts=max_attempts)

    def refresh_since(self, since, entries=None):
        """Re-ingest only companies with a periodic filing on or after `since`."""
        candidates = entries if entries is not None else [
            {"cik": cik} for cik in self.fact_store.list_companies()
        ]
        due = []
        for entry in candidates:
            cik = normalize_cik(entry["cik"] if isinstance(entry, dict) else entry)
            try:
                submissions = self.provider.get_submissions(cik, include_history=False)
                filings = self.provider.get_filing_metadata(cik, submissions)
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("refresh check failed cik=%s: %s", cik, exc)
                due.append({"cik": cik})
                continue
            newest = self.latest_filing_signature(filings)
            if newest and (newest["filing_date"] or "") >= str(since):
                due.append({"cik": cik})
        LOGGER.info("refresh_since %s: %d of %d companies due", since, len(due), len(candidates))
        return self.ingest_universe(due, resume=False)


def _filing_years(filing_metadata):
    """Periodic-filing counts per calendar year of the report date.

    The coverage matrix needs to tell "the company filed but the filing carries
    no usable XBRL" apart from "the company did not file at all".
    """
    years = {}
    for row in filing_metadata or []:
        if row["form"] not in PERIODIC_FORMS:
            continue
        stamp = row.get("report_date") or row.get("filing_date")
        if not stamp:
            continue
        year = str(stamp)[:4]
        bucket = years.setdefault(year, {"forms": {}, "count": 0, "xbrl": 0})
        bucket["forms"][row["form"]] = bucket["forms"].get(row["form"], 0) + 1
        bucket["count"] += 1
        if row.get("is_xbrl"):
            bucket["xbrl"] += 1
    return dict(sorted(years.items()))


def _filing_index(filing_metadata):
    """Compact periodic-filing index, kept for the canonical Filing records."""
    return [
        {
            "accession": row["accession"],
            "form": row["form"],
            "filing_date": row["filing_date"],
            "report_date": row["report_date"],
            "acceptance_datetime": row["acceptance_datetime"],
            "is_amendment": row["is_amendment"],
        }
        for row in filing_metadata or []
        if row["form"] in PERIODIC_FORMS and row.get("report_date")
    ]


def export_inspector_view(document, registry, as_of=None, annual_years=12,
                          quarterly_years=5, policy=POLICY_LATEST_KNOWN):
    """A compact, committable view of one company for the data inspector UI.

    The full factbook stays out of the repository; this is the small slice a
    human needs to eyeball values, periods, availability dates and provenance.
    """
    from .periods import PeriodResolver
    from .restatements import CompanyFactBook, FactTimeline, Observation
    from .model import Provenance, CompanyProfile

    factbook = _rehydrate(document)
    resolver = PeriodResolver(factbook, registry)
    years = factbook.fiscal_years()
    annual_scope = years[-annual_years:] if years else []
    quarterly_scope = years[-quarterly_years:] if years else []

    from .derived import reconstruct

    rows = []
    for metric in registry.names():
        for fiscal_year in annual_scope:
            fact = resolver.annual(metric, fiscal_year, as_of, policy=policy)
            rows.append(_row(fact))
        for fiscal_year in quarterly_scope:
            for index in range(1, 5):
                fact = resolver.quarter(metric, fiscal_year, index, as_of, policy=policy)
                rows.append(_row(fact))

    # Derived metrics are canonical output too -- freeCashFlow, netDebt,
    # investedCapital and accruals all reach a consumer -- but they come from
    # derived.reconstruct rather than the registry, so iterating the registry
    # alone left four of the thirteen published metrics invisible in the very
    # tool built to inspect them. Their provenance is the subtlest of the lot,
    # which is exactly why it has to be visible.
    for fiscal_year in annual_scope:
        for fact in reconstruct(resolver, fiscal_year, "FY", as_of, policy=policy).values():
            rows.append(_row(fact))
    for fiscal_year in quarterly_scope:
        for index in range(1, 5):
            derived = reconstruct(resolver, fiscal_year, f"Q{index}", as_of, policy=policy)
            for fact in derived.values():
                rows.append(_row(fact))

    return {
        "cik": document["cik"],
        "generated_at_utc": _utcnow(),
        "versions": document["versions"],
        "profile": document["profile"],
        "calendar": document["calendar"],
        "quality_summary": document["quality"]["summary"],
        # A count of errors without the errors is half a report. ERROR-severity
        # findings are few by design, so they travel with the view; WARNING and
        # INFO stay in the (untracked) factbook, where UNKNOWN_CONCEPT alone runs
        # to tens of thousands per company.
        "quality_errors": _error_findings(document),
        "as_of": str(as_of) if as_of else None,
        "policy": policy,
        "scope": {"annual_years": annual_scope, "quarterly_years": quarterly_scope},
        "rows": [row for row in rows if row is not None],
    }


def _error_findings(document, limit=50):
    findings = [finding for finding in document["quality"]["findings"]
                if finding.get("severity") == "ERROR"]
    return {
        "total": len(findings),
        "shown": min(len(findings), limit),
        "findings": findings[:limit],
    }


def _row(fact):
    if fact is None:
        return None
    if not fact.available:
        # Unavailable cells are exported too: the inspector must show WHY a
        # number is absent, not silently omit the row.
        return {
            "metric": fact.metric, "fiscal_year": fact.fiscal_year,
            "fiscal_period": fact.fiscal_period, "value": None,
            "available": False, "reason": fact.reason, "flags": fact.flags,
        }
    provenance = fact.provenance
    return {
        "metric": fact.metric,
        "fiscal_year": fact.fiscal_year,
        "fiscal_period": fact.fiscal_period,
        "value": fact.value,
        "unit": fact.unit,
        "period_start": fact.period_start,
        "period_end": fact.period_end,
        "available": True,
        "available_from": provenance.available_from,
        "filed": provenance.filed,
        "form": provenance.form,
        "accession": provenance.accession,
        "concept": f"{provenance.taxonomy}:{provenance.concept}" if provenance.concept else None,
        "source": provenance.source,
        "transformation": provenance.transformation,
        # A derived number has no SEC concept and must not pretend to one; what
        # it has instead is a formula version and the inputs it was built from.
        "formula_version": provenance.formula_version,
        "inputs": list(provenance.inputs or []),
        "quality": fact.quality,
        "flags": fact.flags,
    }


def _rehydrate(document):
    """Rebuild a CompanyFactBook from a stored document."""
    from .model import CompanyProfile, Provenance
    from .restatements import CompanyFactBook, FactTimeline, Observation

    profile_payload = dict(document.get("profile") or {})
    profile_payload.pop("is_financial", None)
    profile = CompanyProfile(**profile_payload) if profile_payload else None
    calendar = FiscalCalendar.from_dict(document.get("calendar"))
    factbook = CompanyFactBook(document["cik"], profile=profile, calendar=calendar)
    for timeline in document["factbook"]["timelines"]:
        for observation in timeline["observations"]:
            provenance = Provenance(**observation["provenance"])
            factbook.add_observation(
                timeline["metric"], timeline["fiscal_year"], timeline["fiscal_period"],
                Observation(
                    value=observation["value"], unit=observation["unit"],
                    provenance=provenance, available_from=observation["available_from"],
                    filed=observation["filed"], quality=observation["quality"],
                    flags=observation["flags"], period_start=observation["period_start"],
                    period_end=observation["period_end"],
                ),
            )
    return factbook
