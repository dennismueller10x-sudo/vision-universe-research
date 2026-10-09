"""No implicit send: audit/setup are the only operations available in Actions."""
import argparse
import json
import os
from client import Client, audit, setup
from campaigns import Process
from import_contacts import import_contacts
from prepare import Blocked, private_path, private_write


def read_private(path):
    path = private_path(path)
    if path.stat().st_mode & 0o077:
        raise Blocked("Private Eingabedatei benötigt Dateirechte 0600.")
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("operation", choices=("audit", "setup", "domain", "import", "draft", "test", "check", "send"))
    p.add_argument("--prepared")
    p.add_argument("--review")
    p.add_argument("--config")
    p.add_argument("--content")
    p.add_argument("--state")
    p.add_argument("--approval")
    p.add_argument("--domain")
    p.add_argument("--out")
    p.add_argument("--campaign-id", type=int)
    p.add_argument("--authorize-send", action="store_true")
    args = p.parse_args()
    proc = None
    try:
        if os.environ.get("GITHUB_ACTIONS") and args.operation not in ("audit", "setup"):
            raise Blocked("In Actions sind nur datensparsame Prüfung und Struktureinrichtung erlaubt.")
        client = Client()
        if args.operation == "audit":
            result = audit(client)
        elif args.operation == "setup":
            result = {"vu_lists": setup(client), "contacts_imported": 0, "emails_sent": 0}
        elif args.operation == "domain":
            from urllib.parse import quote
            # Store full Brevo-provided DNS records privately; do not print them or change DNS.
            private_write(args.out, json.dumps(client.call("GET", "/senders/domains/" + quote(args.domain, safe="")), indent=2))
            result = {"domain_configuration": "Privat gespeichert; keine DNS-Änderung"}
        elif args.operation == "import":
            result = import_contacts(client, read_private(args.prepared), read_private(args.review))
        else:
            proc = Process(client, read_private(args.config), args.state)
            if args.operation == "draft":
                result = proc.draft(read_private(args.content))
            elif args.operation == "test":
                result = proc.test(args.campaign_id, args.authorize_send)
            elif args.operation == "check":
                result = proc.check(args.campaign_id)
            else:
                result = proc.send(args.campaign_id, read_private(args.approval), args.authorize_send)
        print(json.dumps(result, ensure_ascii=False))
    except Blocked as exc:
        print("Gesperrt: " + str(exc))
        raise SystemExit(1) from None
    except Exception:
        # Never expose tracebacks: library exceptions may contain emails/URLs/request bodies.
        print("Gesperrt: Eingaben, privaten Zustand und Brevo-Konfiguration prüfen; keine automatische Wiederholung.")
        raise SystemExit(1) from None
    finally:
        if proc:
            proc.close()


if __name__ == "__main__":
    main()
