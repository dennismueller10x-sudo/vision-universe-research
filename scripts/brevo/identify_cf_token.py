"""Read only the identity of CLOUDFLARE_API_TOKEN; never change token policies."""
import json
import os
import re
import urllib.error
import urllib.request

BRANCH = "refs/heads/feat/brevo-domain-authentication"


def get(path, key):
    if not re.fullmatch(r"/(?:user/tokens/verify|accounts/[a-f0-9]{32}/tokens/(?:verify|[a-f0-9]{32}))", path):
        raise ValueError("Read outside token identity scope")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    request = urllib.request.Request("https://api.cloudflare.com/client/v4" + path,
        method="GET", headers={"Authorization": "Bearer " + key,
            "Accept": "application/json", "User-Agent": "VisionUniverse-Brevo/1.0"})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            data = json.load(response)
            return data.get("result") if data.get("success") is True else None
    except urllib.error.HTTPError:
        return None  # Never print an API body, header, credential or unrelated name.


def identify():
    key = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not key:
        raise ValueError("Missing credential")
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    if not re.fullmatch(r"[a-f0-9]{32}", account):
        match = re.fullmatch(r"https://([a-fA-F0-9]{32})\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com/?",
                            os.environ.get("VU_HISTORY_S3_ENDPOINT", ""))
        account = match[1].lower() if match else ""
    paths = (["/accounts/" + account + "/tokens/verify"] if account else []) + ["/user/tokens/verify"]
    for path in paths:
        result = get(path, key)
        if not isinstance(result, dict) or result.get("status") != "active":
            continue
        token_id = result.get("id")
        if not isinstance(token_id, str) or not re.fullmatch(r"[a-f0-9]{32}", token_id):
            raise ValueError("Verification returned no valid token ID")
        name = result.get("name")
        if path.startswith("/accounts/"):
            details = get("/accounts/" + account + "/tokens/" + token_id, key)
            if isinstance(details, dict) and details.get("id") == token_id:
                name = details.get("name")
        # Token ID and its own optional name are the only allowed output.
        return {"token_id": token_id, "token_name": name if isinstance(name, str) else None}
    raise ValueError("Token verification failed")


if __name__ == "__main__":
    try:
        repo = os.environ.get("GITHUB_REPOSITORY", "")
        if (os.environ.get("GITHUB_ACTIONS") != "true" or
            os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch" or
            os.environ.get("GITHUB_REF") != BRANCH or
            os.environ.get("GITHUB_WORKFLOW_REF") != repo + "/.github/workflows/brevo-admin.yml@" + BRANCH):
            raise ValueError("Not the approved manual operator workflow")
        print(json.dumps(identify(), ensure_ascii=True))
    except Exception:
        print("Token-ID nicht ermittelbar; keine Schlüsselwerte oder Rohantworten ausgegeben.")
        raise SystemExit(1) from None
