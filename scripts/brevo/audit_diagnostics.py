"""One read-only /account audit. Never emit secrets, response bodies or account data."""
import json
import os
import re
import urllib.error
import urllib.request
from client import Client, audit
from prepare import Blocked

ENDPOINT = "https://api.brevo.com/v3/account"
BRANCH = "refs/heads/fix/brevo-audit-diagnostics"
SAFE_CODES = frozenset(("permission_denied", "unauthorized", "access_denied", "forbidden",
                       "invalid_parameter", "missing_parameter", "document_not_found",
                       "method_not_allowed", "account_under_validation", "ip_not_authorized"))
# Exact known generic messages only. Unknown text may contain names, addresses or credentials.
SAFE_MESSAGES = (
    "Key not found", "API key not found", "API key does not exist", "Invalid API key",
    "API key is invalid", "Your API key is not valid", "Unauthorized", "Permission denied",
    "Access denied", "Forbidden", "IP is not authorized", "Your account is not activated",
    "Your account is not validated", "Account under validation", "Invalid authentication",
    "Authentication failed", "Not found", "Invalid api-key", "Unauthorized: key not found",
    "You do not have access to this feature", "You don't have access to this feature",
    "You do not have permission to access this endpoint", "Permission denied to access this resource",
    "This endpoint is not allowed for your account", "This endpoint is not available for your account",
    "You cannot access this feature on your current plan", "This feature is not available on your plan",
    "This endpoint is only accessible to master accounts", "This API is only accessible to master accounts",
    "This endpoint is only available to enterprise accounts", "This feature is not enabled for your account",
    "You do not have access to this functionality", "Access to this endpoint is forbidden",
    "Your SMTP account is not yet activated", "Your SMTP account is not activated",
    "SMTP account is not activated", "Your SMTP account is not available",
    "Your transactional account is not activated", "Your account is disabled",
    "This endpoint is only accessible to SMTP users", "Please contact support",
)
# Generic error vocabulary only: no names, addresses, URLs, IPs, numbers or opaque identifiers.
SAFE_WORDS = frozenset(re.findall(r"[a-z]+(?:'[a-z]+)?", " ".join(SAFE_MESSAGES).lower())) | frozenset(
    "we have has the it are you you're yours do does don't doesn't cannot can't can could currently "
    "user users role rights restricted required denied unauthorized unauthorised authorized authorised "
    "service services transactional email smtp marketing campaigns segment segments domain domains "
    "attribute attributes resource resources pending activation verification activated disabled inactive "
    "suspended rejected blocked key keys authenticating authentication free starter business enterprise "
    "subscription insufficient enough access please our support team more information only endpoint "
    "endpoints account accounts in on from to by with without an a if and or but version feature features "
    "operation action request invalid error forbidden this enabled enable status under validation "
    "available include includes include included plan plans no api api's api-key permission permissions "
    "not is at for yet needs need use using contact limited login denied functionality accepted "
    "sender senders list lists campaign deactivated deactivate us check due reason reasons because "
    "set activated activate activation validated validate invalid credentials authorization forbidden "
    "authorization authorisation enable enabling enabled disabled disabling get read read-only "
    "retrieve fetching unable failed granted allowed grant valid validate value wrong unavailable "
    "still before after or required email emails activated activation blocked not_activation "
    "been being fully sending send sent mail messages message reason reasons time until complete completed "
    "process processing request requests review reviewing reviewed rejected reject approved approve "
    "link button page dashboard settings security new generate verification confirm confirmed confirming".split())


def secret_status(key):
    trimmed = key.strip()
    return {"secret_present": bool(key),
            "key_format": "api_v3" if trimmed.startswith("xkeysib-") else (
                "smtp" if trimmed.startswith("xsmtpsib-") else "unrecognized"),
            "surrounding_whitespace": key != trimmed,
            "surrounding_quotes": len(trimmed) > 1 and trimmed[0] == trimmed[-1] and trimmed[0] in "\"'"}


def safe_error(raw, key):
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError):
        return {"error_code": None, "error_message": None, "response_kind": "non_json"}
    if not isinstance(data, dict):
        return {"error_code": None, "error_message": None, "response_kind": "non_object_json"}
    fields = {k.casefold(): v for k, v in data.items() if isinstance(k, str)}
    if isinstance(fields.get("error"), dict):
        fields = {k.casefold(): v for k, v in fields["error"].items() if isinstance(k, str)}
    code = next((fields.get(k) for k in ("code", "error_code", "errorcode", "error")
                 if fields.get(k) is not None), None)
    message = next((fields.get(k) for k in ("message", "error_message", "errormessage", "error_description", "detail", "error")
                    if isinstance(fields.get(k), str)), None)
    allowed_code = (code if type(code) is int and 0 <= code <= 65535 else
                    code if isinstance(code, str) and code != key and (
                        code.casefold() in SAFE_CODES
                        or (re.fullmatch(r"[a-z_]{1,64}", code) is not None
                            and all(w in SAFE_WORDS for w in code.split("_")))
                        or (code.isdecimal() and len(code) <= 5 and 0 <= int(code) <= 65535)) else None)
    allowed_message = None
    if isinstance(message, str) and len(message) <= 4096:
        # Preserve the actual generic Brevo message when it exactly matches the allowlist.
        normalized = message.strip().casefold()
        generic = re.fullmatch(r"[A-Za-z ',.!?:;-]+", message.strip()) is not None
        words = re.findall(r"[a-z]+(?:'[a-z]+)?", normalized)
        allowed = any(normalized == s.casefold() for s in SAFE_MESSAGES) or (
            generic and len(words) >= 2 and all(w in SAFE_WORDS for w in words))
        if allowed and (not key or key not in message):
            allowed_message = message.strip()
        elif not key or key not in message:
            # Generic independent sentences may be retained; any unknown sentence is withheld whole.
            kept = []
            for sentence in re.split(r"(?<=[.!?])\s+", message.strip()):
                words = re.findall(r"[a-z]+(?:'[a-z]+)?", sentence.casefold())
                if (re.fullmatch(r"[A-Za-z ',.!?:;-]+", sentence) is not None
                        and len(words) >= 2 and all(w in SAFE_WORDS for w in words)):
                    kept.append(sentence)
            if kept:
                allowed_message = " ".join(kept) + " [additional text withheld]"
    return {"error_code": allowed_code, "error_message": allowed_message, "response_kind": "json",
            "message_withheld": allowed_message is None,
            "error_field_types": {k: ("string" if isinstance(fields[k], str) else "number" if type(fields[k]) is int
                else "object" if isinstance(fields[k], dict) else "other") for k in ("error_code", "detail") if k in fields},
            "error_fields_present": [k for k in ("code", "error_code", "errorcode", "message", "error_message",
                "errormessage", "error_description", "detail", "error") if k in fields]}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def audit_stage(path):
    clean = path.split("?", 1)[0]
    allowed = {"/account", "/senders", "/senders/domains", "/contacts/segments",
               "/contacts/attributes", "/contacts", "/contacts/lists"}
    if clean in allowed:
        return clean
    if clean.startswith("/senders/domains/"):
        return "/senders/domains/{domain}"
    raise Blocked("Endpoint außerhalb des reinen Audits.")


class ReadOnlyAudit(Client):
    def __init__(self, key, opener=None):
        self._key = key
        self.mode = "audit"
        self.transport = opener or urllib.request.build_opener(NoRedirect())
        self.stages = []
        self.error = None

    def call(self, method, path, body=None, missing=False):
        stage = audit_stage(path)
        if method != "GET" or body is not None:
            raise Blocked("Nur lesende Audit-Aufrufe sind erlaubt.")
        request = urllib.request.Request("https://api.brevo.com/v3" + path, method="GET",
            headers={"api-key": self._key, "Accept": "application/json", "Content-Type": "application/json"})
        try:
            with self.transport.open(request, timeout=30) as response:
                self.stages.append({"endpoint": stage, "http_status": response.status})
                # Account/contact/sender data are consumed by the existing aggregate audit only.
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            self.stages.append({"endpoint": stage, "http_status": exc.code})
            raw = exc.read(16385)
            self.error = {"endpoint": stage, "http_status": exc.code,
                          **(safe_error(raw, self._key) if len(raw) <= 16384 else {
                              "error_code": None, "error_message": None, "response_kind": "too_large"})}
            raise Blocked("Audit-Abruf abgelehnt.") from None


def diagnose_audit(key, opener=None):
    result = {"operation": "audit", "scope": "existing read-only audit", "auth_header": "api-key",
              **secret_status(key)}
    if not key:
        return {**result, "stages": [], "audit_complete": False}
    client = ReadOnlyAudit(key, opener)
    try:
        summary = audit(client)
    except Exception:
        return {**result, "stages": client.stages, "audit_complete": False, "error": client.error}
    return {**result, "stages": client.stages, "audit_complete": True, "summary": summary}


def diagnose(key, opener=None):
    result = {"operation": "audit", "scope": "GET /v3/account", "auth_header": "api-key",
              **secret_status(key)}
    if not key:
        return {**result, "request_attempted": False, "http_status": None}
    request = urllib.request.Request(ENDPOINT, method="GET",
        headers={"api-key": key, "Accept": "application/json", "Content-Type": "application/json"})
    try:
        transport = opener or urllib.request.build_opener(NoRedirect())
        with transport.open(request, timeout=30) as response:
            # Success body contains account PII: never read it or return it.
            return {**result, "request_attempted": True, "http_status": response.status}
    except urllib.error.HTTPError as exc:
        raw = exc.read(16385)
        error = safe_error(raw, key) if len(raw) <= 16384 else {
            "error_code": None, "error_message": None, "response_kind": "too_large"}
        return {**result, "request_attempted": True, "http_status": exc.code, **error}
    except Exception:
        return {**result, "request_attempted": True, "http_status": None,
                "error_code": "local_request_error", "error_message": None}


def main():
    # This temporary job is authorized only for the current targeted audit, not general admin work.
    if not (os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
            and os.environ.get("GITHUB_REF") == BRANCH
            and os.environ.get("BREVO_OPERATION") == "audit"):
        print("Audit-Diagnose gesperrt: falscher Branch, Trigger oder Modus.")
        return 1
    result = diagnose_audit(os.environ.get("BREVO_API_KEY", ""))
    print(json.dumps(result, ensure_ascii=True))
    return 0 if result.get("audit_complete") else 1


if __name__ == "__main__":
    raise SystemExit(main())
