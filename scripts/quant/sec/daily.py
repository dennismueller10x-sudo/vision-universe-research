"""Der taegliche Incremental-Lifecycle der SEC-Fundamentalschicht.

Die historische Basis ist einmal aufgebaut und in R2 persistiert. Ab
hier gilt: einmal am Tag den SEC-Tagesindex lesen, die Emittenten mit
neuen oder geaenderten Filings bestimmen, GENAU diese neu holen und
normalisieren, persistieren, zurueckladen, die abhaengigen Artefakte
selektiv nachziehen und Bericht erstatten. Kein Full Backfill im
Normalbetrieb.

Aenderungserkennung: master.{YYYYMMDD}.idx aus dem EDGAR daily-index -
EINE Anfrage je Kalendertag seit dem letzten Lauf, pipe-getrennt,
mit CIK, Formular, Datum und Akzessionsnummer. Die Uebersicht je
Emittent (submissions) wird nur fuer die betroffenen Emittenten
geholt, und zwar frisch. Unveraenderte Emittenten kosten keine
Anfrage.

Point-in-Time: die Normalisierung ist deterministisch ueber den
vollen companyfacts-Stand des Emittenten. Ein neues Filing fuegt
Beobachtungen mit seiner eigenen Akzessionsnummer und seinem
Einreichungsdatum hinzu; nichts Frueheres wird ueberschrieben. Ein
Amendment ist eine weitere Beobachtung derselben Zelle, spaeter
datiert - die Restatement-Kette liegt in restatements.py und bleibt
historisch rekonstruierbar.
"""
import json
import logging
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .http_client import SECHTTPError
from .provider import AMENDMENT_FORMS, PERIODIC_FORMS, normalize_cik
from .version import NORMALIZATION_LOGIC_VERSION, version_stamp

LOGGER = logging.getLogger("vu.sec.daily")

ROOT = Path(__file__).resolve().parents[3]
DAILY_DIR = ROOT / "quant" / "data" / "fundamentals" / "daily"
STATE_PATH = DAILY_DIR / "state.json"
STATE_VERSION = 1

DAILY_INDEX_URL = "https://www.sec.gov/Archives/edgar/daily-index/{year}/QTR{quarter}/master.{ymd}.idx"
WATCHED_FORMS = PERIODIC_FORMS

# Weiter als das schaut der Tagesindex nicht zurueck. Wer laenger als
# 45 Tage nicht gelaufen ist, laesst die uebrigen Emittenten ueber die
# Signaturpruefung (submissions je Emittent) nachziehen - das ist der
# teure, aber vollstaendige Weg, und er ist ausdruecklich nicht der
# Normalfall.
MAX_INDEX_DAYS = 45
FIRST_RUN_LOOKBACK_DAYS = 7
# Ein Emittent, der so oft hintereinander scheitert, bleibt in der
# Schlange stehen und wird im Bericht genannt - nicht endlos versucht.
MAX_ATTEMPTS = 5
# Wie viele Akzessionsnummern je Emittent der State erinnert.
REMEMBERED_ACCESSIONS = 12

STATUS_SUCCESS = "SUCCESS"
STATUS_PARTIAL = "PARTIAL_SUCCESS"
STATUS_FAILURE = "FAILURE"

DOWNSTREAM_TARGETS = ("Fundamental History", "Quant", "Factor DNA", "Screener", "Rankings",
                      "Compare", "Strategy Lab", "Backtesting Data", "Atlas / AI")


def _utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ------------------------------------------------------------------ index

def quarter_of(day):
    return (day.month - 1) // 3 + 1


def index_url(day):
    return DAILY_INDEX_URL.format(year=day.year, quarter=quarter_of(day), ymd=day.strftime("%Y%m%d"))


def parse_master_index(text):
    """master.idx: Kopf, Trennlinie, dann CIK|Name|Formular|Datum|Dateiname."""
    rows = []
    started = False
    for line in text.splitlines():
        if not started:
            if line.startswith("----"):
                started = True
            continue
        parts = line.split("|")
        if len(parts) < 5:
            continue
        cik, name, form, filed, filename = (p.strip() for p in parts[:5])
        if not cik.isdigit():
            continue
        accession = Path(filename).stem
        rows.append({"cik": cik.zfill(10), "name": name, "form": form, "filed": filed,
                     "accession": accession, "filename": filename})
    return rows


def fetch_index_day(client, day, today=None):
    """Der Tagesindex eines Kalendertags, oder None an Tagen ohne Index."""
    today = today or date.today()
    url = index_url(day)
    try:
        # Der Index von heute waechst noch; der von gestern ist fertig.
        payload = client.get_bytes(url, use_cache=(day < today))
    except SECHTTPError as exc:
        if exc.status == 404:
            return None
        raise
    return parse_master_index(payload.decode("latin-1", errors="replace"))


def sec_changes(client, since, until, universe_ciks, today=None):
    """Neue Filings beobachteter Formulare je Emittent des Universums.

    Gibt ({cik: [filing, ...]}, index_bericht) zurueck. `since` ist der
    erste Tag, der noch nicht gelesen wurde; `until` der letzte (heute).
    """
    changes = {}
    checked, missing, rows_total = [], [], 0
    day = since
    while day <= until:
        rows = fetch_index_day(client, day, today=today)
        if rows is None:
            missing.append(day.isoformat())
        else:
            checked.append(day.isoformat())
            rows_total += len(rows)
            for row in rows:
                if row["form"] not in WATCHED_FORMS or row["cik"] not in universe_ciks:
                    continue
                changes.setdefault(row["cik"], []).append(row)
        day += timedelta(days=1)
    return changes, {"daysChecked": checked, "daysWithoutIndex": missing,
                     "indexRows": rows_total}


# ------------------------------------------------------------------ state

def empty_state():
    return {"version": STATE_VERSION, "LAST_SUCCESSFUL_RUN": None, "LAST_SEC_CHECK": None,
            "NORMALIZATION_LOGIC_VERSION": NORMALIZATION_LOGIC_VERSION,
            "ISSUER_LAST_PROCESSED": {}, "runs": []}


def load_state(path=None):
    path = Path(path or STATE_PATH)
    if not path.exists():
        return empty_state()
    state = json.loads(path.read_text(encoding="utf-8"))
    state.setdefault("ISSUER_LAST_PROCESSED", {})
    state.setdefault("runs", [])
    return state


def save_state(state, path=None):
    path = Path(path or STATE_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1, ensure_ascii=False, sort_keys=True) + "\n",
                   encoding="utf-8")
    tmp.replace(path)
    return path


def issuer_state_from_document(document):
    """Der Stand eines Emittenten, wie ihn das gespeicherte Factbook belegt."""
    latest = document.get("latest_filing") or {}
    return {
        "LATEST_ACCESSION": latest.get("accession"),
        "LATEST_FILED_AT": latest.get("filing_date"),
        "LATEST_ACCEPTED_AT": latest.get("acceptance_datetime"),
        "LATEST_FORM": latest.get("form"),
        "PROCESSED_AT": document.get("generated_at_utc"),
        "NORMALIZATION_LOGIC_VERSION": (document.get("versions") or {}).get("normalization_logic"),
        "accessions": [a for a in [latest.get("accession")] if a],
    }


def bootstrap_state(state, store, ciks=None):
    """Emittenten ohne State-Eintrag aus dem Speicher nachtragen.

    Der Speicher IST der Beweis, was verarbeitet wurde: die historische
    Basis wurde ohne diesen State aufgebaut, und niemand soll sie dafuer
    erneut holen.
    """
    known = state["ISSUER_LAST_PROCESSED"]
    added = 0
    for cik in (ciks if ciks is not None else store.list_companies()):
        cik = normalize_cik(cik)
        if cik in known:
            continue
        document = store.read_company(cik)
        if document is None:
            continue
        known[cik] = issuer_state_from_document(document)
        added += 1
    return added


def is_new_for(entry, filing):
    """Ist dieses Filing fuer den Emittenten noch nicht verarbeitet?"""
    if entry is None:
        return True
    if filing["accession"] in (entry.get("accessions") or []):
        return False
    if filing["accession"] == entry.get("LATEST_ACCESSION"):
        return False
    latest_filed = entry.get("LATEST_FILED_AT") or ""
    return filing["filed"] >= latest_filed


# ------------------------------------------------------------------- plan

def plan_run(state, changes, universe_ciks, store, checkpoint_state=None, ciks_override=None):
    """Wer wird heute verarbeitet - und warum."""
    known = state["ISSUER_LAST_PROCESSED"]
    stored = set(store.list_companies())
    todo = {}                      # cik -> {"reason": ..., "filings": [...]}

    if ciks_override:
        for cik in ciks_override:
            todo[normalize_cik(cik)] = {"reason": "REQUESTED", "filings": []}
        return todo, {"changed": 0, "newIssuers": 0, "retried": 0, "requested": len(todo)}

    changed = 0
    for cik, filings in changes.items():
        fresh = [f for f in filings if is_new_for(known.get(cik), f)]
        if fresh:
            todo[cik] = {"reason": "NEW_FILING", "filings": fresh}
            changed += 1

    new_issuers = 0
    for cik in sorted(universe_ciks):
        if cik not in stored and cik not in todo:
            todo[cik] = {"reason": "NEW_ISSUER", "filings": []}
            new_issuers += 1

    retried = 0
    for cik in list((checkpoint_state or {}).get("retry_queue") or []):
        attempts = ((checkpoint_state or {}).get("failed", {}).get(cik) or {}).get("attempts", 0)
        if cik in todo:
            continue
        if attempts >= MAX_ATTEMPTS:
            continue
        todo[cik] = {"reason": "RETRY", "filings": []}
        retried += 1
    return todo, {"changed": changed, "newIssuers": new_issuers, "retried": retried, "requested": 0}


# ------------------------------------------------------------------- run

def _observation_counts(document):
    out = Counter()
    for timeline in ((document or {}).get("factbook") or {}).get("timelines") or []:
        out[timeline.get("metric")] += len(timeline.get("observations") or [])
    return out


def _accession_dupes(document):
    """Zellen, in denen dieselbe Akzessionsnummer zweimal beobachtet ist."""
    dupes = 0
    for timeline in ((document or {}).get("factbook") or {}).get("timelines") or []:
        seen = Counter((o.get("provenance") or {}).get("accession")
                       for o in timeline.get("observations") or [])
        dupes += sum(1 for n in seen.values() if n > 1)
    return dupes


def run_daily(pipeline, client, universe_ciks, state, today=None, since=None,
              ciks_override=None, dry_run=False, checkpoint=None, log=None):
    """Ein Tageslauf. Gibt den Health Report (§16) zurueck und schreibt den State."""
    say = log or (lambda *_: None)
    started = time.monotonic()
    today = today or date.today()
    store = pipeline.fact_store
    checkpoint = checkpoint or pipeline.checkpoint
    cp_state = checkpoint.load()

    bootstrapped = bootstrap_state(state, store)

    # --- 1. Aenderungen erkennen
    if since is None:
        last = state.get("LAST_SEC_CHECK")
        # Der erste Lauf ohne State schaut eine Woche zurueck: die Basis
        # stammt aus dem Sammelarchiv, und dessen Stand ist bis zu einige
        # Tage alt. Danach beginnt jeder Lauf beim letzten Check.
        since = (date.fromisoformat(last) if last else today - timedelta(days=FIRST_RUN_LOOKBACK_DAYS))
    if today - since > timedelta(days=MAX_INDEX_DAYS):
        say(f"  Letzter Index-Check liegt {(today - since).days} Tage zurueck - "
            f"Tagesindex nur fuer die letzten {MAX_INDEX_DAYS} Tage.")
        since = today - timedelta(days=MAX_INDEX_DAYS)
    changes, index_report = ({}, {"daysChecked": [], "daysWithoutIndex": [], "indexRows": 0})
    if not ciks_override:
        changes, index_report = sec_changes(client, since, today, universe_ciks, today=today)
    new_filings = sum(len(v) for v in changes.values())
    amendments = sum(1 for v in changes.values() for f in v if f["form"] in AMENDMENT_FORMS)

    todo, plan = plan_run(state, changes, universe_ciks, store, cp_state, ciks_override)
    say(f"  Index: {len(index_report['daysChecked'])} Tage gelesen, {new_filings} Filings "
        f"beobachteter Formulare im Universum, {len(todo)} Emittenten zu verarbeiten "
        f"({plan['changed']} geaendert, {plan['newIssuers']} neu, {plan['retried']} Retry)")

    # --- 2. genau diese Emittenten verarbeiten
    updated, unchanged, failed = [], [], []
    for cik in sorted(todo):
        item = todo[cik]
        if dry_run:
            continue
        before = store.read_company(cik)
        before_counts = _observation_counts(before)
        attempts = (cp_state.get("failed", {}).get(cik) or {}).get("attempts", 0)
        try:
            outcome = pipeline.ingest_company(cik, fresh=True)
        except Exception as exc:  # noqa: BLE001 - die Schlange ist der Zweck
            LOGGER.exception("daily: ingest failed cik=%s", cik)
            cp_state = checkpoint.mark_failed(cp_state, cik, exc)
            checkpoint.save(cp_state)
            failed.append({"cik": cik, "reason": item["reason"], "error": str(exc)[:300],
                           "attempts": attempts + 1})
            continue
        cp_state = checkpoint.mark_completed(cp_state, cik, {"status": outcome["status"]})
        checkpoint.save(cp_state)
        if outcome["status"].upper() == "UNCHANGED":
            unchanged.append(cik)
            entry = state["ISSUER_LAST_PROCESSED"].setdefault(cik, {})
            seen = list(entry.get("accessions") or [])
            for f in item["filings"]:
                if f["accession"] not in seen:
                    seen.append(f["accession"])
            entry["accessions"] = seen[-REMEMBERED_ACCESSIONS:]
            save_state(state)
            continue
        after = store.read_company(cik)
        after_counts = _observation_counts(after)
        metrics_changed = sorted(m for m in set(before_counts) | set(after_counts)
                                 if before_counts.get(m, 0) != after_counts.get(m, 0))
        entry = issuer_state_from_document(after)
        seen = list((state["ISSUER_LAST_PROCESSED"].get(cik) or {}).get("accessions") or [])
        for acc in [f["accession"] for f in item["filings"]] + entry["accessions"]:
            if acc and acc not in seen:
                seen.append(acc)
        entry["accessions"] = seen[-REMEMBERED_ACCESSIONS:]
        entry["PROCESSED_AT"] = _utcnow()
        state["ISSUER_LAST_PROCESSED"][cik] = entry
        save_state(state)
        updated.append({
            "cik": cik, "issuerId": "iss_cik_" + cik, "reason": item["reason"],
            "filings": [{"form": f["form"], "accession": f["accession"], "filed": f["filed"]}
                        for f in item["filings"]],
            "latestAccession": entry["LATEST_ACCESSION"], "latestFiledAt": entry["LATEST_FILED_AT"],
            "latestAcceptedAt": entry["LATEST_ACCEPTED_AT"], "latestForm": entry["LATEST_FORM"],
            "metricsChanged": metrics_changed,
            "observationsBefore": sum(before_counts.values()),
            "observationsAfter": sum(after_counts.values()),
            "annualTimelines": sum(1 for t in (after.get("factbook") or {}).get("timelines") or []
                                   if t.get("fiscal_period") == "FY"),
            "quarterlyTimelines": sum(1 for t in (after.get("factbook") or {}).get("timelines") or []
                                      if t.get("fiscal_period") != "FY"),
            "accessionDuplicates": _accession_dupes(after),
            "wasNew": before is None,
        })

    # --- 3. Bilanz
    if failed and not updated and not unchanged and todo:
        status = STATUS_FAILURE
    elif failed:
        status = STATUS_PARTIAL
    else:
        status = STATUS_SUCCESS
    if not dry_run and status != STATUS_FAILURE:
        state["LAST_SEC_CHECK"] = today.isoformat()
        state["LAST_SUCCESSFUL_RUN"] = _utcnow()
        state["NORMALIZATION_LOGIC_VERSION"] = NORMALIZATION_LOGIC_VERSION
    retry_queue = list(cp_state.get("retry_queue") or [])
    report = {
        "schema_version": 1,
        "RUN_DATE": today.isoformat(),
        "RUN_STARTED_AT": _utcnow(),
        "STATUS": status,
        "DRY_RUN": dry_run,
        "LAST_SUCCESSFUL_RUN": state.get("LAST_SUCCESSFUL_RUN"),
        "LAST_SEC_CHECK": state.get("LAST_SEC_CHECK"),
        "SEC_INDEX": index_report,
        "SEC_CHANGES_FOUND": new_filings,
        "NEW_FILINGS": new_filings - amendments,
        "AMENDMENTS_FOUND": amendments,
        "ISSUERS_CHECKED": len(universe_ciks),
        "ISSUERS_CHANGED": plan["changed"],
        "NEW_ISSUERS": plan["newIssuers"],
        "RETRIED": plan["retried"],
        "ISSUERS_UPDATED": len(updated),
        "NO_CHANGE": len(universe_ciks) - len(todo) + len(unchanged),
        "UNCHANGED_ISSUERS_REPROCESSED": 0,
        "FAILED_ISSUERS": len(failed),
        "RETRY_QUEUE": len(retry_queue),
        "FACTBOOKS_UPDATED": len(updated),
        "ANNUAL_HISTORIES_UPDATED": sum(1 for u in updated if u["annualTimelines"]),
        "QUARTERLY_HISTORIES_UPDATED": sum(1 for u in updated if u["quarterlyTimelines"]),
        "PIT_HISTORIES_UPDATED": len(updated),
        "ACCESSION_DUPLICATES": sum(u["accessionDuplicates"] for u in updated),
        "STATE_BOOTSTRAPPED": bootstrapped,
        "NORMALIZATION_LOGIC_VERSION": NORMALIZATION_LOGIC_VERSION,
        "versions": version_stamp(pipeline.registry.version),
        "updated": updated,
        "unchanged": unchanged,
        "failed": failed,
        "retryQueue": retry_queue,
        "requests": dict(getattr(client, "stats", {}) or {}),
        "TOTAL_RUNTIME_SECONDS": round(time.monotonic() - started, 1),
    }
    if not dry_run:
        state["runs"] = (state.get("runs") or [])[-29:] + [{
            "RUN_DATE": report["RUN_DATE"], "STATUS": status, "ISSUERS_UPDATED": len(updated),
            "FAILED_ISSUERS": len(failed), "SEC_CHANGES_FOUND": new_filings}]
        save_state(state)
    return report


# ------------------------------------------------------------- downstream

def updated_issuers_manifest(report, extra=None):
    """UPDATED_ISSUERS fuer die nachgelagerten Module - maschinenlesbar."""
    return {
        "schema_version": 1,
        "generated_at_utc": _utcnow(),
        "RUN_DATE": report["RUN_DATE"],
        "STATUS": report["STATUS"],
        "UPDATED_ISSUERS": [
            {"issuerId": u["issuerId"], "cik": u["cik"], "reason": u["reason"],
             "latestAccession": u["latestAccession"], "latestFiledAt": u["latestFiledAt"],
             "latestAcceptedAt": u["latestAcceptedAt"], "latestForm": u["latestForm"],
             "metricsChanged": u["metricsChanged"], "wasNew": u["wasNew"]}
            for u in report["updated"]],
        "INVALIDATE": list(DOWNSTREAM_TARGETS),
        "note": "Nur diese Emittenten haben neue oder geaenderte Fundamentals. Module, die "
                "je Emittent zwischenspeichern, aktualisieren genau diese; alles andere ist "
                "unveraendert. Kein Frontend liest diese Datei direkt.",
        **(extra or {}),
    }
