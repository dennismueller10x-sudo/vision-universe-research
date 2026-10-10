"""Register the active sender's VU domain; privately seal only DNS configuration.

No contact, sender-validation, authenticate, send, DNS-provider, or delete calls.
The normal admin workflow on main is unchanged. This is a pinned one-off job.
"""
import base64
import json
import os
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from client import Client, free_account
from prepare import Blocked

DOMAIN = "visionuniverse.de"
BRANCH = "refs/heads/ops/brevo-contact-audit-20261010"


class DomainPreparation(Client):
    def call(self, method, path, body=None, missing=False):
        allowed = (method == "GET" and body is None and path in (
            "/account", "/senders", "/senders/domains", "/senders/domains/" + DOMAIN)) or (
            method == "POST" and path == "/senders/domains" and body == {"name": DOMAIN})
        if not allowed:
            raise Blocked("Nur Abruf und Registrierung der bestehenden VU-Absenderdomain erlaubt.")
        return super().call(method, path, body, missing)


def seal(payload):
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    key = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    public = serialization.load_pem_public_key(Path(__file__).with_name("dns-transfer-public.pem").read_bytes())
    sealed_key = public.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                                algorithm=hashes.SHA256(), label=None))
    ciphertext = AESGCM(key).encrypt(nonce, raw, b"VU-Brevo-DNS-20261010")
    return {"version": 1, "sealed_key": base64.b64encode(sealed_key).decode(),
            "nonce": base64.b64encode(nonce).decode(),
            "ciphertext": base64.b64encode(ciphertext).decode()}


def prepare_domain(client):
    # Validate encryption before any mutation; no automatic retry after ambiguity.
    seal({"preflight": True})
    free_account(client)
    senders = client.call("GET", "/senders").get("senders") or []
    if not any(s.get("active") is True and isinstance(s.get("email"), str)
               and s["email"].rsplit("@", 1)[-1].lower() == DOMAIN for s in senders):
        raise Blocked("Aktiver bestehender Absender auf der VU-Domain nicht bestätigt.")
    domains = client.call("GET", "/senders/domains").get("domains") or []
    matches = [d for d in domains if d.get("domain_name") == DOMAIN]
    if len(matches) > 1:
        raise Blocked("Mehrdeutige Domainkonfiguration; keine Änderung.")
    created = not matches
    if created:
        client.call("POST", "/senders/domains", {"name": DOMAIN})
    config = client.call("GET", "/senders/domains/" + DOMAIN)
    # No sender addresses, contacts, account details or credentials are sealed.
    records = config.get("dns_records")
    if not isinstance(records, dict) or not records:
        raise Blocked("DNS-Daten fehlen; Registrierung privat im Konto prüfen.")
    safe_records = {}
    for name, record in records.items():
        if not isinstance(record, dict) or name not in (
                "brevo_code", "dkim_record", "dkim1_record", "dkim2_record", "dmarc_record"):
            raise Blocked("Unbekanntes DNS-Format; keine öffentliche Rohantwort.")
        safe_records[name] = {k: record[k] for k in ("host_name", "type", "value", "status") if k in record}
    if not ("brevo_code" in safe_records and any(k.startswith("dkim") for k in safe_records)):
        raise Blocked("DNS-Authentifizierungsdaten unvollständig.")
    private = {"domain": DOMAIN, "verified": config.get("verified") is True,
               "authenticated": config.get("authenticated") is True, "dns_records": safe_records}
    return {"operation": "setup", "scope": "VU sender domain registration only",
            "domain_registered": True, "domain_created": created,
            "verified": private["verified"], "authenticated": private["authenticated"],
            "dns_record_count": len(safe_records), "sealed_dns_configuration": seal(private),
            "dns_changes": 0, "contacts_imported": 0, "emails_sent": 0}


def main():
    try:
        if not (os.environ.get("GITHUB_ACTIONS") == "true" and
                os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and
                os.environ.get("GITHUB_REF") == BRANCH and os.environ.get("BREVO_OPERATION") == "setup"):
            raise Blocked("Nur die ausdrücklich manuelle Domainvorbereitung ist freigegeben.")
        print(json.dumps(prepare_domain(DomainPreparation()), ensure_ascii=False))
    except Exception:
        print("Gesperrt: Domainvorbereitung unklar; Kontostand prüfen, kein automatischer Retry und keine Rohantwort.")
        raise SystemExit(1) from None


if __name__ == "__main__": main()
