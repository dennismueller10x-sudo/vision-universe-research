"""Storage abstraction for the SEC fundamental core.

The Quant Engine, the screener and the backtester talk to `FactStore` only.
Today the implementation is gzipped JSON on disk, which fits this repository's
static GitHub Pages architecture and needs no service. Moving to DuckDB,
Parquet or PostgreSQL later means writing another FactStore — normalization,
PIT resolution, derived metrics and the backtest bridge do not change.

Two stores, deliberately separate (Phase 4 § 6):
  RawStore   append-only SEC payloads. Never overwritten, never edited.
  FactStore  normalized VU facts, regenerable from the raw layer at any time.
"""
import gzip
import hashlib
import json
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path

LOGGER = logging.getLogger("vu.sec.store")

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RAW_DIR = Path(os.environ.get("SEC_RAW_DIR") or (ROOT / "quant" / "data" / "raw"))
DEFAULT_FACT_DIR = Path(os.environ.get("SEC_FACT_DIR") or (ROOT / "quant" / "data" / "facts"))
DEFAULT_STATE_DIR = Path(os.environ.get("SEC_STATE_DIR") or (ROOT / ".quant-state"))


def _utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class RawStore(ABC):
    """Immutable SEC payload archive."""

    @abstractmethod
    def put(self, cik, kind, payload):
        """Persist a raw payload; returns its content hash. Never overwrites."""

    @abstractmethod
    def get_latest(self, cik, kind):
        """Most recent stored payload for (cik, kind), or None."""

    @abstractmethod
    def versions(self, cik, kind):
        """Metadata for every stored snapshot, oldest first."""


class JsonRawStore(RawStore):
    """One gzipped JSON file per (cik, kind, content hash), plus an index.

    Content addressing makes re-ingestion idempotent: fetching an unchanged
    companyfacts payload twice stores it once and records a second sighting.
    """

    def __init__(self, directory=DEFAULT_RAW_DIR):
        self.directory = Path(directory)

    def _company_dir(self, cik):
        return self.directory / str(cik)

    def _index_path(self, cik):
        return self._company_dir(cik) / "index.json"

    def _read_index(self, cik):
        path = self._index_path(cik)
        if not path.exists():
            return {"cik": str(cik), "snapshots": []}
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _content_hash(payload):
        """Hash the SEC payload only.

        Keys we add ourselves (``_retrieved_at``, ``_source``) are stripped
        first: they change on every fetch, and hashing them would make an
        unchanged SEC payload look new on every run, defeating both content
        addressing and idempotent re-ingestion.
        """
        if isinstance(payload, dict):
            payload = {key: value for key, value in payload.items()
                       if not str(key).startswith("_")}
        body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return body, hashlib.sha256(body).hexdigest()

    def put(self, cik, kind, payload):
        cik = str(cik)
        body, digest = self._content_hash(payload)
        target = self._company_dir(cik) / f"{kind}.{digest[:16]}.json.gz"
        target.parent.mkdir(parents=True, exist_ok=True)
        index = self._read_index(cik)
        existing = next((row for row in index["snapshots"]
                         if row["kind"] == kind and row["sha256"] == digest), None)
        if existing is None:
            with gzip.open(target, "wb") as handle:
                handle.write(body)
            index["snapshots"].append({
                "kind": kind, "sha256": digest, "path": target.name,
                "bytes": len(body), "first_seen": _utcnow(), "last_seen": _utcnow(),
                "sightings": 1,
            })
        else:
            # Same bytes as before: record the sighting, leave the archive alone.
            existing["last_seen"] = _utcnow()
            existing["sightings"] = existing.get("sightings", 1) + 1
        self._index_path(cik).write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
        return digest

    def snapshot_record(self, cik, kind, digest):
        """Index entry for one stored snapshot, or None.

        ``first_seen`` is when this exact payload was first retrieved, which is
        the retrieval timestamp that belongs in provenance: it is stable across
        re-runs of unchanged data and moves only when the SEC data itself does.
        """
        for row in self._read_index(str(cik))["snapshots"]:
            if row["kind"] == kind and row["sha256"] == digest:
                return row
        return None

    def get_latest(self, cik, kind):
        index = self._read_index(cik)
        rows = [row for row in index["snapshots"] if row["kind"] == kind]
        if not rows:
            return None
        row = max(rows, key=lambda item: item["last_seen"])
        path = self._company_dir(cik) / row["path"]
        with gzip.open(path, "rb") as handle:
            return json.loads(handle.read())

    def versions(self, cik, kind=None):
        rows = self._read_index(cik)["snapshots"]
        if kind is not None:
            rows = [row for row in rows if row["kind"] == kind]
        return sorted(rows, key=lambda row: row["first_seen"])


class FactStore(ABC):
    """Normalized Vision Universe facts, addressable by company."""

    @abstractmethod
    def write_company(self, cik, document):
        """Persist the full normalized document for one company."""

    @abstractmethod
    def read_company(self, cik):
        """Return the stored document, or None."""

    @abstractmethod
    def list_companies(self):
        """CIKs currently stored."""

    @abstractmethod
    def write_manifest(self, manifest):
        """Persist the store-level manifest (versions, coverage, run metadata)."""

    @abstractmethod
    def read_manifest(self):
        """Return the manifest, or None."""


class JsonFactStore(FactStore):
    """One JSON file per company plus a manifest, small enough to serve statically."""

    MANIFEST_NAME = "manifest.json"

    def __init__(self, directory=DEFAULT_FACT_DIR, compress=False):
        self.directory = Path(directory)
        self.compress = compress

    def _path(self, cik):
        suffix = ".json.gz" if self.compress else ".json"
        return self.directory / f"{str(cik)}{suffix}"

    def write_company(self, cik, document):
        path = self._path(cik)
        path.parent.mkdir(parents=True, exist_ok=True)
        body = json.dumps(document, indent=2, sort_keys=False) + "\n"
        if self.compress:
            with gzip.open(path, "wt", encoding="utf-8") as handle:
                handle.write(body)
        else:
            path.write_text(body, encoding="utf-8")
        LOGGER.info("stored facts cik=%s bytes=%d", cik, len(body))
        return path

    def read_company(self, cik):
        path = self._path(cik)
        if not path.exists():
            return None
        if self.compress:
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)
        return json.loads(path.read_text(encoding="utf-8"))

    def list_companies(self):
        if not self.directory.exists():
            return []
        suffix = ".json.gz" if self.compress else ".json"
        return sorted(
            path.name[: -len(suffix)]
            for path in self.directory.glob(f"*{suffix}")
            if path.name != self.MANIFEST_NAME
        )

    def write_manifest(self, manifest):
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self.directory / self.MANIFEST_NAME
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return path

    def read_manifest(self):
        path = self.directory / self.MANIFEST_NAME
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))


class CheckpointStore:
    """Resumable import state: progress, failures and a retry queue.

    An import of 2000 companies that dies at company 312 resumes at 312.
    """

    def __init__(self, directory=DEFAULT_STATE_DIR, run_id="default"):
        self.directory = Path(directory)
        self.run_id = run_id
        self.path = self.directory / f"checkpoint-{run_id}.json"

    def load(self):
        if not self.path.exists():
            return {"run_id": self.run_id, "started_at": _utcnow(), "completed": {},
                    "failed": {}, "retry_queue": [], "last_cik": None}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, state):
        self.directory.mkdir(parents=True, exist_ok=True)
        state["updated_at"] = _utcnow()
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        tmp.replace(self.path)
        return self.path

    def mark_completed(self, state, cik, detail):
        state["completed"][str(cik)] = {"at": _utcnow(), **detail}
        state["failed"].pop(str(cik), None)
        state["retry_queue"] = [item for item in state["retry_queue"] if item != str(cik)]
        state["last_cik"] = str(cik)
        return state

    def mark_failed(self, state, cik, error):
        record = state["failed"].get(str(cik), {"attempts": 0})
        record["attempts"] += 1
        record["at"] = _utcnow()
        record["error"] = str(error)
        state["failed"][str(cik)] = record
        if str(cik) not in state["retry_queue"]:
            state["retry_queue"].append(str(cik))
        state["last_cik"] = str(cik)
        return state

    def is_completed(self, state, cik):
        return str(cik) in state["completed"]

    def reset(self):
        if self.path.exists():
            self.path.unlink()
