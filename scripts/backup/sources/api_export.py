"""Exporte aus HTTP-APIs in ein Verzeichnis (nur lesende Aufrufe).

  api_export.py github-meta   <out-dir>   (VU_GITHUB_TOKEN, VU_GITHUB_REPOS="owner/repo ...")
  api_export.py gh-artifacts  <out-dir>   (VU_GITHUB_TOKEN, VU_GITHUB_REPOS, VU_ARTIFACT_ALLOWLIST)
  api_export.py cf-kv         <out-dir>   (VU_CF_API_TOKEN, VU_CF_ACCOUNT_ID, VU_CF_KV_NAMESPACES="name=id ...")
  api_export.py cf-config     <out-dir>   (VU_CF_API_TOKEN, VU_CF_ACCOUNT_ID, VU_CF_ZONE_IDS="name=id ...")
  api_export.py brevo         <out-dir>   (VU_BREVO_API_KEY)

Jeder Export schreibt <out-dir>/export.json mit Zaehlern ("records") und einer Liste
optionaler Endpunkte, die nicht erreichbar waren ("unavailable"). Fehlende Rechte an
optionalen Endpunkten sind kein Abbruch; fehlende Rechte an Pflicht-Endpunkten schon
(Exit 4). Netzwerkfehler werden dreimal wiederholt. Es werden nie Kopfzeilen oder
Tokens geschrieben oder ausgegeben.

API-Basen sind ueber VU_GITHUB_API, VU_CF_API, VU_BREVO_API umstellbar (Tests).
"""
import calendar
import fnmatch
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

GITHUB_API = os.environ.get("VU_GITHUB_API", "https://api.github.com")
CF_API = os.environ.get("VU_CF_API", "https://api.cloudflare.com/client/v4")
BREVO_API = os.environ.get("VU_BREVO_API", "https://api.brevo.com/v3")
USER_AGENT = "vu-backup/1 (read-only export)"


class Unavailable(Exception):
    """Endpunkt verweigert (401/403/404) - Rechte oder Funktion fehlen."""


def request(url, headers, raw=False, retries=3):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **headers})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
                link = resp.headers.get("Link", "")
                return (body if raw else json.loads(body or b"null")), link
        except urllib.error.HTTPError as err:
            if err.code in (401, 403, 404, 410):
                raise Unavailable(f"HTTP {err.code}") from None
            if err.code == 429 or err.code >= 500:
                wait = int(err.headers.get("Retry-After") or (5 * 4 ** attempt))
            else:
                raise
        except (urllib.error.URLError, TimeoutError):
            wait = 5 * 4 ** attempt
        if attempt == retries:
            raise RuntimeError(f"nach {retries + 1} Versuchen nicht erreichbar: {urllib.parse.urlsplit(url).path}")
        time.sleep(min(wait, 120))


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(data, fh, indent=1, sort_keys=True, ensure_ascii=False)


# ---------------------------------------------------------------- GitHub

def gh_headers():
    token = os.environ.get("VU_GITHUB_TOKEN", "")
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        h["Authorization"] = "Bearer " + token
    return h


def gh_pages(path, params=None):
    params = dict(params or {}, per_page=100)
    url = f"{GITHUB_API}{path}?{urllib.parse.urlencode(params)}"
    items = []
    while url:
        data, link = request(url, gh_headers())
        if isinstance(data, dict):
            # z.B. {"total_count":..,"artifacts":[..]} oder {"secrets":[..]}
            data = next((v for k, v in data.items() if isinstance(v, list)), [])
        items.extend(data)
        url = None
        for part in link.split(","):
            if 'rel="next"' in part:
                url = part[part.find("<") + 1:part.find(">")]
    return items


def github_meta(out):
    counts, unavailable = {}, []
    required = {"issues", "pulls"}
    for repo in os.environ.get("VU_GITHUB_REPOS", "").split():
        base = f"/repos/{repo}"
        safe = repo.replace("/", "__")
        endpoints = {
            "repo": (base, None),
            "issues": (f"{base}/issues", {"state": "all"}),            # enthaelt PRs
            "pulls": (f"{base}/pulls", {"state": "all"}),
            "issue-comments": (f"{base}/issues/comments", None),
            "review-comments": (f"{base}/pulls/comments", None),
            "labels": (f"{base}/labels", None),
            "milestones": (f"{base}/milestones", {"state": "all"}),
            "releases": (f"{base}/releases", None),
            "tags": (f"{base}/tags", None),
            "branches": (f"{base}/branches", None),
            "rulesets": (f"{base}/rulesets", None),
            "workflows": (f"{base}/actions/workflows", None),
            "secret-names": (f"{base}/actions/secrets", None),       # nur Namen, nie Werte
            "variables": (f"{base}/actions/variables", None),
            "environments": (f"{base}/environments", None),
            "hooks": (f"{base}/hooks", None),
            "deploy-keys": (f"{base}/keys", None),
            "pages": (f"{base}/pages", None),
        }
        for name, (path, params) in endpoints.items():
            try:
                if name in ("repo", "pages"):
                    data, _ = request(f"{GITHUB_API}{path}", gh_headers())
                else:
                    data = gh_pages(path, params)
            except Unavailable as err:
                if name in required:
                    raise SystemExit(f"Pflicht-Endpunkt {name} fuer {repo} nicht lesbar ({err})") from None
                unavailable.append(f"{repo}:{name} ({err})")
                continue
            if name == "deploy-keys":
                data = [{k: d.get(k) for k in ("id", "title", "read_only", "created_at")} for d in data]
            write_json(os.path.join(out, safe, f"{name}.json"), data)
            counts[f"{repo}:{name}"] = len(data) if isinstance(data, list) else 1
        # Reviews je PR: ohne Vorstand fuer alle; mit Vorstand (VU_GITHUB_META_PREV_DIR, letzter
        # Export) nur fuer seither geaenderte PRs, der Rest wird uebernommen. So enthaelt jeder
        # Snapshot alle Reviews, auch wenn aeltere Snapshots spaeter entfallen.
        pulls = json.load(open(os.path.join(out, safe, "pulls.json")))
        reviews, since = {}, ""
        prev_dir = os.environ.get("VU_GITHUB_META_PREV_DIR", "")
        try:
            prev_meta = json.load(open(os.path.join(prev_dir, "export.json")))
            reviews = {int(k): v for k, v in json.load(open(os.path.join(prev_dir, safe, "reviews.json"))).items()}
            t = time.strptime(prev_meta["createdAt"], "%Y-%m-%dT%H:%M:%SZ")
            since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(calendar.timegm(t) - 2 * 86400))
        except (OSError, ValueError, KeyError):
            reviews, since = {}, ""
        for pr in pulls:
            if since and pr.get("updated_at", "") < since:
                continue
            try:
                reviews[pr["number"]] = gh_pages(f"{base}/pulls/{pr['number']}/reviews")
            except Unavailable as err:
                unavailable.append(f"{repo}:reviews#{pr['number']} ({err})")
        write_json(os.path.join(out, safe, "reviews.json"), reviews)
        counts[f"{repo}:reviews"] = len(reviews)
    return counts, unavailable


def gh_artifacts(out):
    patterns = os.environ.get("VU_ARTIFACT_ALLOWLIST", "").split()
    counts, unavailable, saved = {}, [], []
    for repo in os.environ.get("VU_GITHUB_REPOS", "").split():
        try:
            arts = gh_pages(f"/repos/{repo}/actions/artifacts")
        except Unavailable as err:
            unavailable.append(f"{repo}:artifacts ({err})")
            continue
        newest = {}
        for a in arts:
            if a.get("expired") or not any(fnmatch.fnmatch(a["name"], p) for p in patterns):
                continue
            if a["name"] not in newest or a["created_at"] > newest[a["name"]]["created_at"]:
                newest[a["name"]] = a
        for name, a in sorted(newest.items()):
            body, _ = request(a["archive_download_url"], gh_headers(), raw=True)
            digest = hashlib.sha256(body).hexdigest()
            expected = (a.get("digest") or "").removeprefix("sha256:")
            if expected and expected != digest:
                raise SystemExit(f"Artefakt {name}: Pruefsumme passt nicht")
            path = os.path.join(out, repo.replace("/", "__"), f"{name}--{a['id']}.zip")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "wb").write(body)
            saved.append({"repo": repo, "name": name, "id": a["id"], "bytes": len(body), "sha256": digest,
                          "createdAt": a["created_at"], "expiresAt": a["expires_at"], "digestVerified": bool(expected)})
        counts[repo] = len(newest)
    write_json(os.path.join(out, "artifacts-index.json"), saved)
    return counts, unavailable


# ---------------------------------------------------------------- Cloudflare

def cf_headers():
    return {"Authorization": "Bearer " + os.environ["VU_CF_API_TOKEN"]}


def cf_list(path):
    items, cursor, page = [], None, 1
    while True:
        params = {"per_page": 1000, "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        elif page > 1:
            params["page"] = page
        data, _ = request(f"{CF_API}{path}?{urllib.parse.urlencode(params)}", cf_headers())
        result = data.get("result") or []
        items.extend(result)
        info = data.get("result_info") or {}
        cursor = info.get("cursor")
        if cursor:
            continue
        if info.get("total_pages", 1) > page and result:
            page += 1
            continue
        return items


def cf_kv(out):
    account = os.environ["VU_CF_ACCOUNT_ID"]
    counts = {}
    for entry in os.environ.get("VU_CF_KV_NAMESPACES", "").split():
        name, ns = entry.split("=", 1)
        base = f"/accounts/{account}/storage/kv/namespaces/{ns}"
        keys = cf_list(f"{base}/keys")
        path = os.path.join(out, f"{name}.jsonl")
        os.makedirs(out, exist_ok=True)
        with open(path, "w") as fh:
            for k in keys:
                raw, _ = request(f"{CF_API}{base}/values/{urllib.parse.quote(k['name'], safe='')}", cf_headers(), raw=True)
                try:
                    value = raw.decode("utf-8")
                    encoding = "utf-8"
                except UnicodeDecodeError:
                    import base64
                    value, encoding = base64.b64encode(raw).decode(), "base64"
                fh.write(json.dumps({"key": k["name"], "expiration": k.get("expiration"), "metadata": k.get("metadata"),
                                     "encoding": encoding, "value": value}, ensure_ascii=False) + "\n")
        counts[name] = len(keys)
    return counts, []


def cf_config(out):
    account = os.environ["VU_CF_ACCOUNT_ID"]
    counts, unavailable = {}, []

    def save(name, fn):
        try:
            data = fn()
        except Unavailable as err:
            unavailable.append(f"{name} ({err})")
            return None
        if isinstance(data, (bytes, bytearray)):
            os.makedirs(out, exist_ok=True)
            open(os.path.join(out, name), "wb").write(data)
            counts[name] = 1
        else:
            write_json(os.path.join(out, name + ".json"), data)
            counts[name] = len(data) if isinstance(data, list) else 1
        return data

    for entry in os.environ.get("VU_CF_ZONE_IDS", "").split():
        zname, zid = entry.split("=", 1)
        save(f"dns-{zname}.bind", lambda zid=zid: request(f"{CF_API}/zones/{zid}/dns_records/export", cf_headers(), raw=True)[0])
        save(f"dns-{zname}", lambda zid=zid: cf_list(f"/zones/{zid}/dns_records"))
    scripts = save("workers", lambda: cf_list(f"/accounts/{account}/workers/scripts")) or []
    for s in scripts:
        sid = s.get("id")
        # settings: Bindings und Namen der Secrets, keine Werte
        save(f"worker-{sid}-settings", lambda sid=sid: request(f"{CF_API}/accounts/{account}/workers/scripts/{sid}/settings", cf_headers())[0].get("result"))
        save(f"worker-{sid}-schedules", lambda sid=sid: request(f"{CF_API}/accounts/{account}/workers/scripts/{sid}/schedules", cf_headers())[0].get("result"))
    save("kv-namespaces", lambda: cf_list(f"/accounts/{account}/storage/kv/namespaces"))
    return counts, unavailable


# ---------------------------------------------------------------- Brevo

def brevo(out):
    headers = {"api-key": os.environ["VU_BREVO_API_KEY"], "Accept": "application/json"}

    def paged(path, key, limit):
        items, offset = [], 0
        while True:
            data, _ = request(f"{BREVO_API}{path}?limit={limit}&offset={offset}", headers)
            batch = (data or {}).get(key) or []
            items.extend(batch)
            offset += len(batch)
            if len(batch) < limit or offset >= (data or {}).get("count", offset):
                return items

    counts, unavailable = {}, []
    contacts = paged("/contacts", "contacts", 1000)       # Pflicht
    write_json(os.path.join(out, "contacts.json"), contacts)
    counts["contacts"] = len(contacts)
    for name, path, key, limit in (("lists", "/contacts/lists", "lists", 50),
                                   ("folders", "/contacts/folders", "folders", 50),
                                   ("campaigns", "/emailCampaigns", "campaigns", 100)):
        try:
            data = paged(path, key, limit)
        except Unavailable as err:
            unavailable.append(f"{name} ({err})")
            continue
        write_json(os.path.join(out, f"{name}.json"), data)
        counts[name] = len(data)
    for name, path in (("attributes", "/contacts/attributes"), ("senders", "/senders")):
        try:
            data, _ = request(f"{BREVO_API}{path}", headers)
        except Unavailable as err:
            unavailable.append(f"{name} ({err})")
            continue
        write_json(os.path.join(out, f"{name}.json"), data)
        counts[name] = 1
    return counts, unavailable


EXPORTS = {"github-meta": github_meta, "gh-artifacts": gh_artifacts, "cf-kv": cf_kv, "cf-config": cf_config, "brevo": brevo}

if __name__ == "__main__":
    kind, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    try:
        counts, unavailable = EXPORTS[kind](out)
    except Unavailable as err:
        print(f"Pflicht-Endpunkt nicht lesbar: {err}", file=sys.stderr)
        sys.exit(4)
    except KeyError as err:
        print(f"Konfiguration fehlt: {err}", file=sys.stderr)
        sys.exit(3)
    records = sum(v for v in counts.values() if isinstance(v, int))
    write_json(os.path.join(out, "export.json"), {"kind": kind, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                                  "counts": counts, "records": records, "unavailable": unavailable})
    print(json.dumps({"records": records, "unavailable": len(unavailable)}))
