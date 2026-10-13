"""Private Actions operator: inspect DOI prerequisites; never send or log PII."""
import json
import os
import re
import urllib.error
import urllib.request

TEMPLATE = "VU | App-Warteliste | DOI | v1"
ATTRIBUTES = ("VU_APP_REQUEST_ID", "VU_APP_PURPOSE", "VU_APP_CONSENT_VERSION")


def api(origin, path, key, method="GET", body=None):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    headers = {"Accept": "application/json", "User-Agent": "VisionUniverse-Waitlist/1.0"}
    headers["api-key" if origin == "https://api.brevo.com/v3" else "Authorization"] = key if origin == "https://api.brevo.com/v3" else "Bearer " + key
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(origin + path, method=method, headers=headers,
        data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            raw = response.read()
            value = json.loads(raw) if raw else {}
            return response.status, value
    except urllib.error.HTTPError as error:
        return error.code, {}  # No headers, credentials, bodies or sensitive URLs.


def run():
    report = {"operation": "audit", "emails_sent": 0, "contacts_changed": 0}
    key = os.environ.get("BREVO_API_KEY", "")
    def brevo(path):
        status, value = api("https://api.brevo.com/v3", path, key)
        if status != 200:
            raise ValueError("Brevo prerequisite inaccessible (HTTP %d)" % status)
        return value
    account = brevo("/account")
    report["brevo_free"] = any(p.get("type") == "free" for p in account.get("plan", []))
    report["lists"] = [{"id": n, "count": brevo("/contacts/lists/" + str(n)).get("totalSubscribers")} for n in (4, 5, 6)]
    senders = brevo("/senders").get("senders", [])
    report["eligible_sender_ids"] = [s["id"] for s in senders if s.get("active") is True and s.get("email", "").endswith("@visionuniverse.de")]
    domain = brevo("/senders/domains/visionuniverse.de")
    report["domain_verified"] = domain.get("verified") is True
    report["domain_authenticated"] = domain.get("authenticated") is True
    templates = []
    for offset in range(0, 10000, 50):
        page = brevo("/smtp/templates?limit=50&offset=" + str(offset)).get("templates", [])
        templates.extend(page)
        if len(page) < 50:
            break
    matches = [t for t in templates if t.get("name") == TEMPLATE]
    report["doi_template_ids"] = [t["id"] for t in matches]
    report["transactional_templates_readable"] = True
    attributes = brevo("/contacts/attributes").get("attributes", [])
    report["app_attribute_types"] = {name: next((a.get("type") for a in attributes if a.get("name") == name), None) for name in ATTRIBUTES}
    report["controlled_test_address_secret_set"] = bool(os.environ.get("BREVO_DOI_TEST_EMAIL"))
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    if not re.fullmatch(r"[a-f0-9]{32}", account_id):
        match = re.fullmatch(r"https://([a-f0-9]{32})\.r2\.cloudflarestorage\.com/?", os.environ.get("VU_HISTORY_S3_ENDPOINT", ""))
        account_id = match[1] if match else ""
    report["cloudflare"] = []
    for name in ("LANDING_CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_TOKEN"):
        token = os.environ.get(name)
        if not token or not account_id:
            continue
        status, data = api("https://api.cloudflare.com/client/v4", "/accounts/" + account_id + "/pages/projects/vision-universe", token)
        check = {"secret": name, "pages_read_http": status}
        report["cloudflare"].append(check)
        if status != 200 or data.get("success") is not True:
            continue
        project = data["result"]
        source = project.get("source", {}).get("config", {})
        check["existing_project_matches"] = project.get("name") == "vision-universe" and source.get("repo_name") == "vision-universe-research" and source.get("owner") == "dennismueller10x-sudo" and project.get("build_config", {}).get("root_dir") == "landing"
        check["runtime_bindings"] = {stage: {n: variables.get(n, {}).get("type") for n in ("BREVO_API_KEY", "WAITLIST_TOKEN_KEY", "WAITLIST_DB", "WAITLIST_PUBLIC_ENABLED", "WAITLIST_PRIVACY_APPROVED", "WAITLIST_E2E_VERIFIED")} for stage, config in project.get("deployment_configs", {}).items() for variables in [config.get("env_vars", {})]}
        status, data = api("https://api.cloudflare.com/client/v4", "/accounts/" + account_id + "/d1/database?per_page=100", token)
        check["d1_read_http"] = status
        if status == 200 and data.get("success") is True:
            check["waitlist_databases"] = sum(d.get("name") == "vu-app-waitlist" for d in data.get("result", []))
        break
    return report


if __name__ == "__main__":
    try:
        if (os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or
            os.environ.get("GITHUB_REF") != "refs/heads/feat/brevo-app-waitlist-doi"):
            raise ValueError("Only manual isolated operator workflow")
        print(json.dumps(run()))
    except Exception as error:
        print("Prerequisite audit blocked; no raw response or credentials emitted.")
        raise SystemExit(1) from None
