"""Discover structured filing candidates through the official French OAM API.

Metadata only: identity linking, fiscal periods and publication interpretation
must be verified in an ingestion manifest. Sentinel market dates are rejected.
This adapter never extracts financial figures from HTML or PDF documents.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from scripts.universe.global_equities import ROOT, OfficialClient, write_json

API = "https://www.info-financiere.gouv.fr/api/explore/v2.1/catalog/datasets/flux-amf-new-prod/records"


def normalize_record(row, isin):
    if row.get("identificationsociete_iso_cd_isi") != isin:
        raise ValueError("OFFICIAL_ISIN_MISMATCH")
    url = row.get("url_de_recuperation") or ""
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "fr.ftp.opendatasoft.com" or parsed.username or parsed.password:
        raise ValueError("OFFICIAL_DOWNLOAD_HOST_UNVERIFIED")
    if not parsed.path.lower().endswith((".zip", ".xhtml", ".xbrl", ".xml")):
        return None
    deposited = datetime.fromisoformat(row["uin_dat_amf"].replace("Z", "+00:00"))
    if deposited.tzinfo is None or deposited > datetime.now(timezone.utc):
        raise ValueError("OFFICIAL_DEPOSIT_TIMESTAMP_INVALID")
    market = row.get("uin_dat_mar")
    try:
        m = datetime.fromisoformat(market.replace("Z", "+00:00")) if market else None
        market_valid = bool(m and m.tzinfo and m <= datetime.now(timezone.utc))
    except ValueError:
        market_valid = False
    return {"documentId": "FR-OAM-" + row["uin_idt_uin"], "sourceSystem": "ESEF", "country": "FR",
            "companyName": row.get("identificationsociete_iso_nom_soc"), "isin": isin,
            "lei": row.get("identificationsociete_iso_cd_lei"), "sourceDocument": url,
            "title": row.get("informationdeposee_inf_tit_inf"), "depositedAt": deposited.isoformat(),
            "marketPublishedAt": market if market_valid else None,
            "publicationStatus": "REQUIRES_VERIFICATION", "sourceRecord": API,
            "issues": [] if market_valid else ["OAM_MARKET_TIMESTAMP_UNUSABLE"],
            "fiscalPeriods": None, "companyId": None}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--isin", required=True)
    p.add_argument("--pages", type=int, default=1)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--page-size", type=int, default=25)
    p.add_argument("--out", type=Path)
    p.add_argument("--offline", action="store_true")
    a = p.parse_args(argv)
    if not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}\d", a.isin) or not 1 <= a.pages <= 3 or not 1 <= a.page_size <= 100 or a.offset < 0:
        p.error("Invalid ISIN, offset or bounded page parameters")
    cache = ROOT / ".market-cache/official-filings/french-oam"
    cache.mkdir(parents=True, exist_ok=True)
    client = OfficialClient(a.pages, "VisionUniverseResearch info@visionuniverse.de")
    candidates, issues, next_offset, total = {}, [], a.offset, 0
    for _ in range(a.pages):
        url = API + "?" + urlencode({"where": "identificationsociete_iso_cd_isi='" + a.isin + "' AND (fichierdecontenu_inf_fic_nom like '%.zip' OR fichierdecontenu_inf_fic_nom like '%.xhtml')",
                                     "limit": a.page_size, "offset": next_offset, "order_by": "uin_dat_amf DESC"})
        source = cache / (hashlib.sha256(url.encode()).hexdigest() + ".json")
        if not source.exists():
            if a.offline:
                raise ValueError("OFFICIAL_OAM_CACHE_MISSING")
            write_json(source, {"retrievedAt": datetime.now(timezone.utc).isoformat(), "source": url,
                                "document": json.loads(client.get(url))})
        raw = json.loads(source.read_text())
        total = raw["document"]["total_count"]
        for row in raw["document"]["results"]:
            try:
                candidate = normalize_record(row, a.isin)
                if candidate:
                    candidate["sourceRecord"] = url
                    candidate["retrievedAt"] = raw["retrievedAt"]
                    candidates[candidate["documentId"]] = candidate
            except (ValueError, KeyError) as e:
                issues.append({"recordId": row.get("uin_idt_uin"), "reason": str(e)[:100]})
        next_offset += len(raw["document"]["results"])
        if next_offset >= total:
            break
    out = a.out or cache / (a.isin + "-candidates.json")
    write_json(out, {"sourceSystem": "FR_OAM", "isin": a.isin, "totalRecords": total,
                    "nextOffset": next_offset if next_offset < total else None,
                    "candidates": list(candidates.values()), "issues": issues})
    print(json.dumps({"candidates": len(candidates), "requests": client.requests,
                      "nextOffset": next_offset if next_offset < total else None, "issues": len(issues), "out": str(out)}))


if __name__ == "__main__":
    main()
