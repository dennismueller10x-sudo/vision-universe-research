"""Narrow Brevo/Cloudflare DNS executor; secrets/records remain in memory."""
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from client import Client, free_account
from prepare import Blocked

DOMAIN = "visionuniverse.de"
OPS_BRANCH = "feat/brevo-domain-authentication"
TOKEN_NAMES = ("BREVO_CLOUDFLARE_DNS_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_TOKEN", "CF_API_TOKEN", "CLOUDFLARE_API")


class APIError(Blocked):
    def __init__(self, status, codes):
        self.status, self.codes = status, codes
        super().__init__("API-Zugriff abgelehnt (HTTP %s; Codes %s)." % (status, codes))


def canonical(value):
    return value.strip().rstrip(".").lower()


def txt(value):
    # CF can return the same TXT string with an outer DNS quote pair.
    return value[1:-1] if value.startswith('"') and value.endswith('"') else value


def expected_records(config):
    if canonical(config.get("domain", "")) != DOMAIN:
        raise Blocked("Brevo-Konfiguration gehört nicht zur beauftragten Domain.")
    result = []
    for key, record in config.get("dns_records", {}).items():
        normalized = re.sub(r"[^a-z0-9]", "", key.lower())
        if normalized == "brevocode": role = "brevo_code"
        elif re.fullmatch(r"dkim[12]?record", normalized): role = normalized
        else: continue  # DMARC, SPF and all unrelated records are out of scope.
        # Current API retains an empty legacy TXT DKIM slot alongside CNAME slots.
        if record is None and role != "brevo_code": continue
        if not isinstance(record, dict): raise Blocked("Unvollständige Brevo-DNS-Antwort.")
        name = canonical(record.get("host_name", ""))
        if name in ("", "@", DOMAIN): name = DOMAIN
        elif not name.endswith("."+DOMAIN): name += "."+DOMAIN
        kind, content = record.get("type"), record.get("value")
        if not isinstance(content, str) or not content or any(c in content for c in "\r\n"):
            raise Blocked("Brevo-DNS-Wert ist unvollständig.")
        if role == "brevo_code":
            if kind != "TXT" or name != DOMAIN or not re.fullmatch(r"brevo-code:[a-fA-F0-9]{16,128}", content):
                raise Blocked("Unerwarteter Brevo-Code-Datensatz; keine DNS-Änderung.")
        elif ("_domainkey" not in name.split(".") or not name.endswith("."+DOMAIN)
                or kind not in ("TXT", "CNAME")):
            raise Blocked("DKIM-Host liegt außerhalb des freigegebenen Umfangs.")
        if kind == "CNAME":
            content = canonical(content)
            if not content.endswith(".dkim.brevo.com"):
                raise Blocked("DKIM-Ziel ist kein Brevo-Authentifizierungsziel.")
        result.append({"role":role, "type":kind, "name":name, "content":content})
    if sum(r["role"] == "brevo_code" for r in result) != 1 or not 1 <= len(result)-1 <= 2:
        raise Blocked("Brevo-Code oder DKIM-Zuordnung fehlt/ist mehrdeutig.")
    if len({r["name"] for r in result}) != len(result):
        raise Blocked("Brevo-DNS-Zuordnung ist mehrdeutig.")
    return sorted(result, key=lambda r:r["role"])


def equivalent(existing, expected):
    if existing.get("type") != expected["type"] or canonical(existing.get("name", "")) != expected["name"]:
        return False
    content = existing.get("content", "")
    return (canonical(content) if expected["type"] == "CNAME" else txt(content)) == expected["content"]


def plan(records, expected):
    result = []
    for target in expected:
        same = [r for r in records if canonical(r.get("name", "")) == target["name"]]
        if target["type"] == "TXT":
            # Preserve website/other TXT at apex; only our verification token is relevant.
            if target["role"] == "brevo_code":
                same = [r for r in same if r.get("type") == "TXT" and txt(r.get("content", "")).startswith("brevo-code:")]
            else:
                same = [r for r in same if r.get("type") in ("TXT", "CNAME")]
        delegated = any(r.get("type") == "NS" and canonical(r.get("name", "")) != DOMAIN and
            (target["name"] == canonical(r["name"]) or target["name"].endswith("."+canonical(r["name"]))) for r in records)
        if delegated or len(same)>1 or (same and not equivalent(same[0], target)):
            raise Blocked("Widersprüchlicher Brevo-Code/DKIM-Datensatz oder DNS-Delegation; keine Überschreibung.")
        if not same: action = "create"
        elif target["type"] == "CNAME" and same[0].get("proxied") is not False: action = "dns_only"
        else: action = "unchanged"
        result.append({"target":target,"action":action,"record_id":same[0]["id"] if same else None})
    return result


def protected_snapshot(records, allowed_ids):
    fields = ("id", "type", "name", "content", "ttl", "proxied", "priority", "data", "settings", "comment", "tags")
    selected = [{k:r.get(k) for k in fields} for r in records if r["id"] not in allowed_ids]
    return hashlib.sha256(json.dumps(sorted(selected,key=lambda r:r["id"]),sort_keys=True).encode()).hexdigest()


class DomainBrevo(Client):
    def call(self, method, path, body=None, missing=False):
        if (method,path) not in (("GET","/account"),("GET","/senders/domains/"+DOMAIN),
                ("PUT","/senders/domains/"+DOMAIN+"/authenticate")):
            raise Blocked("Nur Domain-Lesen und DNS-Authentifizierung erlaubt; kein E-Mail-Endpunkt.")
        return super().call(method,path,body,missing)


class Cloudflare:
    def __init__(self, name, key, global_email=None):
        self.name,self.key,self.global_email = name,key,global_email
        self.zone = None
        self.expected = []
        self.allowed_updates = set()
        self.account = None
    def call(self, method, path, body=None):
        allowed_read = method == "GET" and (path.startswith("/zones?") or path=="/user/tokens/verify" or
            (self.account and path == "/accounts/"+self.account+"/tokens/verify") or
            (self.zone and re.fullmatch(r"/zones/"+self.zone+r"/dns_records(?:\?.*)?(?:/[a-f0-9]{32})?",path)))
        allowed_write = self.zone and ((method == "POST" and path == "/zones/"+self.zone+"/dns_records") or
            (method == "PATCH" and re.fullmatch(r"/zones/"+self.zone+r"/dns_records/[a-f0-9]{32}",path) and body=={"proxied":False}))
        if not (allowed_read or allowed_write): raise Blocked("Cloudflare-Aufruf außerhalb des DNS-Umfangs.")
        if method == "PATCH" and path.rsplit("/",1)[-1] not in self.allowed_updates:
            raise Blocked("Nur zuvor passend geprüfte DKIM-CNAMEs dürfen auf DNS only wechseln.")
        if method == "POST" and (not isinstance(body,dict) or set(body)-{"name","type","content","ttl","proxied"}
                or not any(equivalent(body,r) for r in self.expected)
                or body.get("proxied",False) is not False):
            raise Blocked("Nur exakt von Brevo gelesene Code-/DKIM-Datensätze dürfen entstehen.")
        headers={"Content-Type":"application/json","Accept":"application/json","User-Agent":"VisionUniverse-Brevo/1.0"}
        if self.global_email: headers.update({"X-Auth-Key":self.key,"X-Auth-Email":self.global_email})
        else: headers["Authorization"]="Bearer "+self.key
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs): return None
        request=urllib.request.Request("https://api.cloudflare.com/client/v4"+path,method=method,
            headers=headers,data=None if body is None else json.dumps(body).encode())
        status=200
        try:
            with urllib.request.build_opener(NoRedirect).open(request,timeout=30) as response:
                data=json.load(response)
        except urllib.error.HTTPError as error:
            status=error.code
            try: data=json.loads(error.read(65536))
            except Exception: data={}
        except Exception: raise Blocked("Cloudflare-Ausgang unklar; vor Wiederholung nur lesen.") from None
        if data.get("success") is not True:
            codes=[e.get("code") for e in data.get("errors",[]) if type(e.get("code")) is int]
            raise APIError(status,codes) from None
        return data
    def records(self):
        result,page=[],1
        while page<=1000:
            data=self.call("GET","/zones/%s/dns_records?per_page=100&page=%d"%(self.zone,page))
            if not isinstance(data.get("result"),list):raise Blocked("DNS-Inventar unvollständig.")
            result.extend(data["result"])
            total=data.get("result_info",{}).get("total_pages")
            if len(data["result"])<100 or type(total) is int and page>=total:return result
            page+=1
        raise Blocked("DNS-Inventar überschreitet den Prüfrahmen.")


def run(operation, authorized=False):
    if operation not in ("audit","apply","verify") or operation!="audit" and not authorized:
        raise Blocked("Konkrete DNS-/Domainänderung nicht autorisiert.")
    brevo=DomainBrevo();free_account(brevo)
    config=brevo.call("GET","/senders/domains/"+DOMAIN)
    expected=expected_records(config)
    report={"domain":DOMAIN,"brevo_values_read":True,"required_brevo_records":len(expected),
            "dkim_cnames":sum(r["type"]=="CNAME" for r in expected),
            "verified":config.get("verified") is True,"authenticated":config.get("authenticated") is True,
            "dns_created":0,"dns_only_updates":0,"emails_sent":0,"cloudflare_candidates":[]}
    clients=[Cloudflare(n,os.environ[n]) for n in TOKEN_NAMES if os.environ.get(n)]
    if os.environ.get("CLOUDFLARE_API_KEY") and os.environ.get("CLOUDFLARE_EMAIL"):
        clients.append(Cloudflare("CLOUDFLARE_API_KEY",os.environ["CLOUDFLARE_API_KEY"],os.environ["CLOUDFLARE_EMAIL"]))
    for cf in clients:
        check={"secret":cf.name,"zone_read":False,"dns_read":False}
        report["cloudflare_candidates"].append(check)
        account=os.environ.get("CLOUDFLARE_ACCOUNT_ID","")
        if not account:
            match=re.fullmatch(r"https://([a-fA-F0-9]{32})\.(?:[a-z]+\.)?r2\.cloudflarestorage\.com/?",os.environ.get("VU_HISTORY_S3_ENDPOINT",""))
            account=match[1].lower() if match else ""
        if re.fullmatch(r"[a-f0-9]{32}",account):cf.account=account
        if not cf.global_email:
            # Account-owned tokens use a different verification endpoint; actual
            # zone/DNS access is the authority, not a user-token-only diagnostic.
            for endpoint,kind in [("/user/tokens/verify","user")]+(
                    [("/accounts/"+cf.account+"/tokens/verify","account")] if cf.account else []):
                try:
                    active=cf.call("GET",endpoint).get("result",{}).get("status")=="active"
                    check["token_active"]=active
                    if active:check["token_type"]=kind;break
                except APIError as error:
                    check[kind+"_verify_http"]=error.status;check[kind+"_verify_codes"]=error.codes
        stage="zone_read"
        try:
            zones=cf.call("GET","/zones?name="+DOMAIN+"&per_page=50")["result"]
            zones=[z for z in zones if canonical(z.get("name",""))==DOMAIN]
            if len(zones)!=1:
                check.update(zone_matches=len(zones),needed="Zone / Zone / Read plus access to visionuniverse.de");continue
            cf.zone=zones[0]["id"]
            if not re.fullmatch(r"[a-f0-9]{32}",cf.zone):raise Blocked("Ungültige Zone-ID.")
            check["zone_read"]=True
            stage="dns_read"
            records=cf.records();check["dns_read"]=True
        except APIError as error:
            check.update(http=error.status,codes=error.codes,stage=stage,
                needed="Valid Cloudflare token / appropriate token type / IP policy" if error.status==401 else
                       "Zone / DNS / Edit" if check["zone_read"] else "Zone / Zone / Read and authorized zone resource")
            continue
        changes=plan(records,expected)
        cf.expected=expected
        cf.allowed_updates={c["record_id"] for c in changes if c["action"]=="dns_only"}
        report.update(cloudflare_secret=cf.name,existing_dns_records=len(records),
            missing_brevo_records=sum(c["action"]=="create" for c in changes),
            proxied_dkim_to_fix=sum(c["action"]=="dns_only" for c in changes))
        if operation=="audit":return report
        if operation=="apply":
            allowed_ids={c["record_id"] for c in changes if c["record_id"]}
            before=protected_snapshot(records,allowed_ids)
            for change in changes:
                # Re-read and conflict-check before each mutation; never overwrite content.
                latest=plan(cf.records(),expected)
                current=next(c for c in latest if c["target"]["role"]==change["target"]["role"])
                try:
                    if current["action"]=="create":
                        body={k:v for k,v in current["target"].items() if k in ("type","name","content")}
                        body["ttl"]=1
                        if body["type"]=="CNAME":body["proxied"]=False
                        value=cf.call("POST","/zones/"+cf.zone+"/dns_records",body)["result"]
                        allowed_ids.add(value["id"]);report["dns_created"]+=1
                    elif current["action"]=="dns_only":
                        cf.call("PATCH","/zones/"+cf.zone+"/dns_records/"+current["record_id"],{"proxied":False})
                        report["dns_only_updates"]+=1
                except APIError as error:
                    report.update(blocked=True,write_http=error.status,write_codes=error.codes,
                        needed="Zone / DNS / Edit for visionuniverse.de")
                    return report
            after=cf.records()
            if protected_snapshot(after,allowed_ids)!=before:
                raise Blocked("Unbeteiligte DNS-Einträge verändert; keine automatische Rücksetzung oder Authentifizierung.")
            if any(c["action"]!="unchanged" for c in plan(after,expected)):
                raise Blocked("Brevo-DNS-Rückprüfung fehlt; keine Authentifizierung.")
            report["other_dns_unchanged"]=True
        elif any(c["action"]!="unchanged" for c in changes):
            report.update(blocked=True,verification_waits_for_correct_dns=True);return report
        # DNS-only verification API, never sender confirmation or email.
        brevo.call("PUT","/senders/domains/"+DOMAIN+"/authenticate")
        current=brevo.call("GET","/senders/domains/"+DOMAIN)
        report.update(verified=current.get("verified") is True,authenticated=current.get("authenticated") is True)
        return report
    report.update(blocked=True,missing_usable_cloudflare_access=True)
    return report


if __name__=="__main__":
    try:
        repo=os.environ.get("GITHUB_REPOSITORY","")
        branch=os.environ.get("GITHUB_REF","")
        if (os.environ.get("GITHUB_ACTIONS")!="true" or os.environ.get("GITHUB_EVENT_NAME")!="workflow_dispatch" or
                branch!="refs/heads/"+OPS_BRANCH or os.environ.get("GITHUB_WORKFLOW_REF")!=
                repo+"/.github/workflows/brevo-admin.yml@"+branch):
            raise Blocked("Nur expliziter geprüfter Domain-Betriebsworkflow erlaubt.")
        print(json.dumps(run(os.environ.get("BREVO_DNS_OPERATION","audit"),os.environ.get("BREVO_DNS_AUTHORIZE")=="true")))
    except Blocked as error:
        print("Gesperrt: "+str(error));raise SystemExit(1) from None
    except Exception:
        print("Gesperrt: Domainprüfung unvollständig; keine Rohdaten, Schlüssel oder automatischen Wiederholungen.")
        raise SystemExit(1) from None
