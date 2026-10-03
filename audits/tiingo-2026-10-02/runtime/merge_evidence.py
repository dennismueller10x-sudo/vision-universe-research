"""Merge downloaded evidence, preserving provenance and avoiding false access claims.
Usage: python merge_evidence.py PRIMARY.json SUPPLEMENTAL.json
Writes only this audit's runtime/account_evidence.json and endpoint matrix.
"""
from pathlib import Path
import collections
import datetime as dt
import json
import sys

HERE = Path(__file__).resolve().parent


def family(url):
    if "/utilities/search" in url: return "symbol_search"
    if "/fundamentals/meta" in url: return "equity_fundamental_metadata"
    if "/fundamentals/definitions" in url: return "equity_fundamental_definitions"
    if "/fundamentals/" in url: return "equity_fundamental_data"
    if "/funds/" in url: return "fund_fee_metrics" if "/metrics" in url else "fund_fee_metadata"
    if "/corporate-actions/" in url: return "corporate_actions"
    if "/tiingo/daily/" in url: return "eod_history" if "/prices" in url else "eod_metadata"
    if "/iex" in url: return "iex_intraday" if "/prices" in url else "iex_quote"
    if "/boats" in url: return "boats_overnight_quote"
    return "authentication_test"


def merge(paths):
    if not paths:
        raise ValueError('At least one collected evidence file is required')
    runs = []
    rows = []
    for p in paths:
        x = json.loads(p.read_text())
        runs.append({k:v for k,v in x.items() if k != "responses"})
        for r in x["responses"]:
            rows.append({**r,"sourceRunId":x.get("runId"),"sourceCommit":x.get("commit"),
                         "sourceEvidenceFile":p.name})
    # Preserve all responses if a URL was accidentally repeated; do not hide costs.
    combined = {"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "authentication": "CONFIGURED" if all(x.get("authentication")=="CONFIGURED" for x in runs) else "INCOMPLETE",
                "runId": [x.get("runId") for x in runs], "runs": runs,
                "actualRequests":len(rows), "uniqueRequestedUrls":len({r["url"] for r in rows}),
                "responses":rows,
                "warning":"Sample account evidence is not exhaustive EOD entitlement enumeration. HTTP200 with empty data does not establish price support; quote access does not establish live freshness."}
    (HERE/"account_evidence.json").write_text(json.dumps(combined,indent=2)+"\n")
    groups=collections.defaultdict(list)
    for r in rows: groups[family(r["url"])].append(r)
    matrix=[]
    for name,rr in sorted(groups.items()):
        fields=set()
        for r in rr:
            if r["status"] != 200: continue
            p=r.get("payload")
            for obj in p if isinstance(p,list) else [p]:
                if isinstance(obj,dict): fields.update(obj)
        successful=[r for r in rr if r["status"]==200]
        matrix.append({"family":name,"requestCount":len(rr),
                       "statusCounts":dict(collections.Counter(str(r["status"]) for r in rr)),
                       "nonemptyHttp200":sum(bool(r.get("payload")) for r in successful),
                       "emptyHttp200":sum(not bool(r.get("payload")) for r in successful),
                       "observedFields":sorted(fields),
                       "evidence":[{"url":r["url"],"status":r["status"],"sourceRunId":r["sourceRunId"],
                                   "references":r["references"]} for r in rr]})
    (HERE/"tiingo_endpoint_inventory.json").write_text(json.dumps({"generatedAt":combined["generatedAt"],
        "families":matrix,"quotaHeaders":[{"url":r["url"],"headers":r["headers"]}for r in rows
        if any("limit" in k.lower() or "retry" in k.lower() for k in r.get("headers",{}))],
        "geographyAndEntitlementWarning":"Families and observed fields apply to requested instrument samples. Denial statuses alone do not distinguish missing instruments, provider policy and product licensing; inspect recorded provider messages."},indent=2)+"\n")
    return combined


if __name__ == "__main__":
    x=merge([Path(p)for p in sys.argv[1:]])
    print(json.dumps({"actualRequests":x["actualRequests"],"uniqueUrls":x["uniqueRequestedUrls"],"runIds":x["runId"]}))
