"""Lokaler Fake fuer GitHub-, Cloudflare-, Brevo- und B2-Auth-APIs mit synthetischen Daten.

  python3 fake_api.py <port>

Pfade:
  /gh/...      GitHub REST (Repo synth/demo), paginiert mit Link-Kopf
  /cf/...      Cloudflare (KV-Keys mit Cursor, Werte, DNS-Export, Worker)
  /brevo/...   Brevo (Kontakte paginiert, Listen, Attribute)
  /b2auth/<rolle>  b2_authorize_account mit vorgegebenen Capabilities
Alle Antworten sind erfunden. Authorization-Kopf wird nur auf Vorhandensein geprueft.
"""
import json
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ISSUES = [{"number": i, "title": f"Synthetisches Issue {i}", "updated_at": f"2026-10-{(i % 28) + 1:02d}T00:00:00Z",
           "pull_request": {} if i % 2 else None} for i in range(1, 251)]
PULLS = [{"number": i, "updated_at": f"2026-10-{(i % 28) + 1:02d}T00:00:00Z"} for i in range(1, 251, 2)]
KV = {f"key-{i:04d}": json.dumps({"n": i, "synthetic": True}) for i in range(2500)}
CONTACTS = [{"id": i, "email": f"person{i}@example.invalid", "listIds": [4]} for i in range(2345)]
CAPS = {
    "writer": ["listBuckets", "listFiles", "readFiles", "writeFiles", "readBuckets"],
    "writer-with-delete": ["listBuckets", "listFiles", "readFiles", "writeFiles", "deleteFiles"],
    "unrestricted": ["listBuckets", "listFiles", "readFiles", "writeFiles"],
    "anchor": ["listBuckets", "listFiles", "readFiles", "writeFileLegalHolds", "readFileLegalHolds"],
}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, headers=None, raw=False):
        data = body if raw else json.dumps(body).encode()
        self.send_response(code)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def page(self, items, q):
        per = int(q.get("per_page", ["30"])[0])
        page = int(q.get("page", ["1"])[0])
        chunk = items[(page - 1) * per: page * per]
        headers = {}
        if page * per < len(items):
            nq = dict((k, v[0]) for k, v in q.items())
            nq["page"] = page + 1
            headers["Link"] = f'<http://{self.headers["Host"]}{self.path.split("?")[0]}?{urllib.parse.urlencode(nq)}>; rel="next"'
        self.send(200, chunk, headers)

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(u.query)
        p = u.path
        if p == "/b2auth/key":
            # echte Schluesselpruefung nachbilden: Basic-Auth -> angelegter Schluessel oder (alter) Master
            import base64
            user = base64.b64decode(self.headers.get("Authorization", "Basic ").split(" ", 1)[1] or b"").decode().split(":")[0]
            if user in KEYS:
                return self.send(200, {"apiInfo": {"storageApi": {"allowed": {"capabilities": KEYS[user]["caps"],
                                                                              "buckets": [{"id": b} for b in KEYS[user]["buckets"]]}}}})
            if user == "m" and not STATE["rotated"]:
                return self.send(200, {"accountId": "acc", "authorizationToken": "tok",
                                       "apiInfo": {"storageApi": {"apiUrl": f"http://{self.headers['Host']}/b2",
                                                                  "s3ApiUrl": "https://s3.eu-central-003.backblazeb2.com"}}})
            return self.send(401, {"code": "unauthorized"})
        if p == "/b2auth/master":
            return self.send(200, {"accountId": "acc", "authorizationToken": "tok",
                                   "apiInfo": {"storageApi": {"apiUrl": f"http://{self.headers['Host']}/b2",
                                                              "s3ApiUrl": "https://s3.eu-central-003.backblazeb2.com"}}})
        if p.startswith("/b2auth/"):
            role = p.split("/")[2]
            buckets = [] if role == "unrestricted" else [{"id": "b1", "name": "vu-backup"}]
            return self.send(200, {"apiInfo": {"storageApi": {"allowed": {"capabilities": CAPS[role], "buckets": buckets}}}})
        if p.startswith("/gh/"):
            if "Authorization" not in self.headers:
                return self.send(401, {"message": "auth"})
            p = p[3:]
            base = "/repos/synth/demo"
            if p == base:
                return self.send(200, {"full_name": "synth/demo", "private": True})
            if p == base + "/issues":
                return self.page(ISSUES, q)
            if p == base + "/pulls":
                return self.page(PULLS, q)
            if p.startswith(base + "/pulls/") and p.endswith("/reviews"):
                return self.page([{"id": 1, "state": "APPROVED"}], q)
            if p in (base + "/issues/comments", base + "/pulls/comments", base + "/labels", base + "/tags", base + "/branches", base + "/milestones", base + "/releases"):
                return self.page([{"id": 1}], q)
            if p == base + "/actions/workflows":
                return self.send(200, {"total_count": 2, "workflows": [{"id": 1}, {"id": 2}]})
            if p == base + "/actions/secrets":
                return self.send(200, {"total_count": 1, "secrets": [{"name": "SYNTH_SECRET"}]})
            return self.send(403, {"message": "forbidden"})   # optionale Endpunkte: keine Rechte
        if p.startswith("/cf/"):
            p = p[3:]
            if "/storage/kv/namespaces/" in p and p.endswith("/keys"):
                keys = sorted(KV)
                start = int(q.get("cursor", ["0"])[0])
                chunk = keys[start:start + 1000]
                cursor = str(start + 1000) if start + 1000 < len(keys) else ""
                return self.send(200, {"success": True, "result": [{"name": k} for k in chunk], "result_info": {"cursor": cursor}})
            if "/values/" in p:
                key = urllib.parse.unquote(p.rsplit("/values/", 1)[1])
                return self.send(200, KV[key].encode(), raw=True)
            if p.endswith("/dns_records/export"):
                return self.send(200, b"example.invalid. 300 IN A 192.0.2.1\n", raw=True)
            if p.endswith("/dns_records"):
                return self.send(200, {"success": True, "result": [{"id": "r1"}], "result_info": {"total_pages": 1}})
            if p.endswith("/workers/scripts"):
                return self.send(200, {"success": True, "result": [{"id": "synth-worker"}], "result_info": {"total_pages": 1}})
            if p.endswith("/settings") or p.endswith("/schedules"):
                return self.send(200, {"success": True, "result": {"bindings": [{"name": "KV", "type": "kv_namespace"}]}})
            if p.endswith("/storage/kv/namespaces"):
                return self.send(200, {"success": True, "result": [{"id": "ns1"}], "result_info": {"total_pages": 1}})
            return self.send(404, {"success": False})
        if p.startswith("/brevo/"):
            p = p[6:]
            limit = int(q.get("limit", ["50"])[0])
            offset = int(q.get("offset", ["0"])[0])
            if p == "/contacts":
                return self.send(200, {"contacts": CONTACTS[offset:offset + limit], "count": len(CONTACTS)})
            if p == "/contacts/lists":
                return self.send(200, {"lists": [{"id": 4}], "count": 1})
            if p == "/contacts/attributes":
                return self.send(200, {"attributes": []})
            return self.send(401, {"message": "Key not authorized"})
        self.send(404, {})


DELETED_KEYS = []
KEYS = {}
STATE = {"rotated": False}


def do_post(self):
    body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
    if self.path == "/b2/b2api/v3/b2_list_buckets":
        name = body.get("bucketName")
        locked = name != "unlocked-test"
        return self.send(200, {"buckets": [{
            "bucketId": "b1", "bucketName": name, "bucketType": "allPublic" if name == "public-test" else "allPrivate",
            "defaultServerSideEncryption": {"value": {"mode": "SSE-B2", "algorithm": "AES256"}},
            "fileLockConfiguration": {"value": {"isFileLockEnabled": locked,
                                                "defaultRetention": {"mode": "compliance", "period": {"duration": 30, "unit": "days"}} if locked else {}}},
            "lifecycleRules": []}]})
    if self.path == "/b2/b2api/v4/b2_create_key":
        # Name "unbound-*": simuliert eine Antwort ohne Bucket-Bindung (Skript muss den Schluessel loeschen)
        bound = [] if body["keyName"].startswith("unbound") else body.get("bucketIds", [])
        kid = "synthetic-key-id" if body["keyName"].startswith(("unbound", "t-", "x")) else f"kid-{body['keyName']}"
        KEYS[kid] = {"caps": body["capabilities"], "buckets": bound}
        return self.send(200, {"keyName": body["keyName"], "applicationKeyId": kid,
                               "applicationKey": "synthetic-app-key", "capabilities": body["capabilities"], "bucketIds": bound})
    if self.path == "/b2/b2api/v4/b2_delete_key":
        DELETED_KEYS.append(body.get("applicationKeyId"))
        return self.send(200, {"applicationKeyId": body.get("applicationKeyId")})
    if self.path == "/b2/rotate-master":
        STATE["rotated"] = True
        return self.send(200, {})
    if self.path == "/b2/deleted-keys":
        return self.send(200, {"deleted": DELETED_KEYS})
    self.send(404, {})


H.do_POST = do_post

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
