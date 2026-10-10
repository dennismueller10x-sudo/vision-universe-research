"""Inspect domain registration after ambiguity; never repeat a POST."""
import json
import os
from domain_prepare import DomainPreparation, DOMAIN, BRANCH, seal
from prepare import Blocked

RECORD_NAMES = {"brevo_code", "dkim", "dkim1", "dkim2", "dkim_1", "dkim_2", "dkim_record",
                "dkim1_record", "dkim2_record", "dkim_record1", "dkim_record2", "dmarc", "dmarc_record"}


class ReadOnlyDomain(DomainPreparation):
    def call(self, method, path, body=None, missing=False):
        if method != "GET" or body is not None:
            raise Blocked("Nach unklarem Ausgang ausschließlich Domainabrufe erlaubt.")
        return super().call(method, path, missing=missing)


def inspect(client):
    config = client.call("GET", "/senders/domains/"+DOMAIN, missing=True)
    if config is None:
        return {"operation":"audit", "domain_registered":False, "emails_sent":0, "dns_changes":0}
    records = config.get("dns_records") or {}
    names = [name if name in RECORD_NAMES else "withheld" for name in records]
    safe = {}
    for name, record in records.items():
        if name not in RECORD_NAMES or not isinstance(record, dict): continue
        safe[name] = {k:record[k] for k in ("host_name","type","value","status") if k in record}
    private = {"domain":DOMAIN, "verified":config.get("verified") is True,
               "authenticated":config.get("authenticated") is True, "dns_records":safe}
    return {"operation":"audit", "domain_registered":True, "verified":private["verified"],
            "authenticated":private["authenticated"], "dns_record_names":names,
            "sealed_dns_configuration":seal(private), "emails_sent":0, "dns_changes":0}


def main():
    try:
        if not (os.environ.get("GITHUB_ACTIONS")=="true" and os.environ.get("GITHUB_EVENT_NAME")=="workflow_dispatch"
                and os.environ.get("GITHUB_REF")==BRANCH and os.environ.get("BREVO_OPERATION")=="audit"):
            raise Blocked("Nur der manuelle GET-Domainabruf ist freigegeben.")
        print(json.dumps(inspect(ReadOnlyDomain())))
    except Blocked as exc:
        # Blocked messages are fixed application text or a numeric HTTP status only.
        print("Gesperrt: "+str(exc))
        raise SystemExit(1) from None
    except Exception:
        print("Gesperrt: Domainantwort privat prüfen; keine Rohantwort und kein Retry.")
        raise SystemExit(1) from None


if __name__=="__main__": main()
