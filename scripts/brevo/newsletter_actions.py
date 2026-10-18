"""Separate manual newsletter executor: durable sanitized ledger, no PII artifacts."""
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from client import Client
from prepare import Blocked
from transfer import trusted_dispatch

STATE_BRANCH = "brevo-newsletter-state"
STATE_PATH = "brevo-newsletter-ledger.json"


def trusted_newsletter():
    branch = os.environ.get("BREVO_DEFAULT_BRANCH", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    return trusted_dispatch() and os.environ.get("GITHUB_WORKFLOW_REF") == (
        repo + "/.github/workflows/brevo-newsletter.yml@refs/heads/" + branch)


class Github:
    def call(self, method, path, body=None, missing=False):
        repo = os.environ.get("GITHUB_REPOSITORY", "")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo) or not path.startswith("/") or ".." in path:
            raise Blocked("Ungültiger Repository-Zugriff.")
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs): return None
        req = urllib.request.Request("https://api.github.com/repos/"+repo+path,
            data=None if body is None else json.dumps(body).encode(),method=method,
            headers={"Authorization":"Bearer "+os.environ.get("GITHUB_TOKEN", ""),
                     "Accept":"application/vnd.github+json","Content-Type":"application/json",
                     "X-GitHub-Api-Version":"2022-11-28",
                     "User-Agent":"VisionUniverse-Brevo/1.0"})
        try:
            with urllib.request.build_opener(NoRedirect).open(req,timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if missing and e.code==404: return None
            raise Blocked("Dauerhafte Freigabe-/Zustandsspeicherung abgelehnt (HTTP %d)."%e.code) from None
        except Exception:
            raise Blocked("Dauerhafter Zustand unklar; kein Brevo-Aufruf wiederholen.") from None


def validate_ledger(state):
    """Only IDs, versions, reservations and keyed bindings; never addresses/content."""
    if (not isinstance(state,dict) or set(state)!={"drafts","campaigns"}
            or any(not isinstance(state[k],dict) for k in state)):
        raise Blocked("Ungültiges Versandregister.")
    hex64=lambda v:isinstance(v,str) and re.fullmatch(r"[a-f0-9]{64}",v) is not None
    integer=lambda v:type(v) is int and v>0
    for key,value in state["drafts"].items():
        if not hex64(key) or not isinstance(value,dict) or not (
            value=={"state":"pending"} or set(value)=={"id"} and integer(value["id"])):
            raise Blocked("Entwurfsregister enthält unzulässige Daten.")
    for cid,c in state["campaigns"].items():
        if not re.fullmatch(r"[1-9][0-9]*",cid) or not isinstance(c,dict) or set(c)-{
                "recipients","sender_id","sender_name_sha256","tests","send","approvals","creation_recoveries"}: raise Blocked("Kampagnenregister enthält unzulässige Daten.")
        if not integer(c.get("sender_id")): raise Blocked("Absender-ID im Register fehlt.")
        if "sender_name_sha256" in c and not hex64(c["sender_name_sha256"]):
            raise Blocked("Ungültige Absendernamensbindung.")
        r=c.get("recipients",{})
        if not isinstance(r,dict) or set(r)-{"listIds","segmentIds","exclusionListIds"} or any(
                not isinstance(v,list) or any(not integer(i) for i in v) for v in r.values()):
            raise Blocked("Unzulässige Register-Zielgruppe.")
        if c.get("send") not in (None,"pending","api_accepted"): raise Blocked("Unzulässige Versandreservierung.")
        recoveries=c.get("creation_recoveries",{})
        if not isinstance(recoveries,dict) or any(not hex64(k) or not integer(v) for k,v in recoveries.items()):
            raise Blocked("Unzulässiger Erstellungskorrektur-Nachweis.")
        if not isinstance(c.get("tests",{}),dict): raise Blocked("Ungültiges Testregister.")
        for version,t in c.get("tests",{}).items():
            if not hex64(version) or not isinstance(t,dict) or set(t) not in (
                    {"state","test_identity"}, {"state","test_identity","preview_id"}) or t["state"] not in (
                    "pending","api_accepted") or not hex64(t["test_identity"]) or (
                    "preview_id" in t and (not integer(t["preview_id"]) or str(t["preview_id"]) == cid)):
                raise Blocked("Unzulässige Testreservierung.")
        if not isinstance(c.get("approvals", {}), dict):
            raise Blocked("Ungültiges Freigaberegister.")
        for run_id, approval in c.get("approvals", {}).items():
            if (not re.fullmatch(r"[1-9][0-9]*", run_id) or not isinstance(approval, dict)
                    or set(approval) != {"operation", "version", "approval_sha256", "actor_id"}
                    or approval["operation"] not in ("test", "preview", "send")
                    or not hex64(approval["version"]) or not hex64(approval["approval_sha256"])
                    or not integer(approval["actor_id"])):
                raise Blocked("Freigaberegister enthält unzulässige Daten.")
    return state


class Ledger:
    def __init__(self, github): self.github,self.sha=github,None
    def load(self):
        d=self.github.call("GET","/contents/"+STATE_PATH+"?ref="+STATE_BRANCH,missing=True)
        if d is None: raise Blocked("Dauerhaftes Versandregister fehlt; einmalig initialize ausführen, nie zurücksetzen.")
        self.sha=d["sha"]
        return validate_ledger(json.loads(base64.b64decode(d["content"])))
    def save(self,state):
        validate_ledger(state)
        if not self.sha: raise Blocked("Versionsgebundene Registersicherung fehlt.")
        d=self.github.call("PUT","/contents/"+STATE_PATH,{"message":"Brevo: sanitized newsletter reservation",
            "branch":STATE_BRANCH,"sha":self.sha,
            "content":base64.b64encode(json.dumps(state,sort_keys=True).encode()).decode()})
        self.sha=d["content"]["sha"]
    def initialize(self):
        if self.github.call("GET","/git/ref/heads/"+STATE_BRANCH,missing=True) is not None:
            self.load();return {"ledger":"already initialized"}
        main=self.github.call("GET","/git/ref/heads/"+os.environ["BREVO_DEFAULT_BRANCH"])
        self.github.call("POST","/git/refs",{"ref":"refs/heads/"+STATE_BRANCH,"sha":main["object"]["sha"]})
        self.github.call("PUT","/contents/"+STATE_PATH,{"message":"Brevo: initialize sanitized newsletter ledger",
            "branch":STATE_BRANCH,"content":base64.b64encode(b'{"drafts":{},"campaigns":{}}').decode()})
        return {"ledger":"initialized","emails_sent":0}


class NewsletterClient(Client):
    def __init__(self,operation,campaign_id=0):
        super().__init__();self.operation,self.campaign_id=operation,campaign_id
        self.preview_id=None
        self.preview_recipients=None
        self.preview_recovery=False
    def call(self,method,path,body=None,missing=False):
        clean=path.split("?",1)[0]
        read=method=="GET" and (clean in ("/account","/senders","/contacts/lists") or
            clean.startswith("/senders/domains/") or clean.startswith("/contacts/") or clean=="/contacts" or
            clean=="/emailCampaigns/"+str(self.campaign_id) or
            self.preview_id is not None and clean=="/emailCampaigns/"+str(self.preview_id))
        read=read or (method=="GET" and self.operation=="preview" and self.preview_recovery and clean=="/emailCampaigns")
        write=method=="POST" and ((self.operation=="draft" and clean=="/emailCampaigns") or
            (self.operation=="test" and clean=="/emailCampaigns/%d/sendTest"%self.campaign_id) or
            (self.operation=="send" and clean=="/emailCampaigns/%d/sendNow"%self.campaign_id))
        if self.operation=="preview" and method=="POST":
            write = (clean=="/emailCampaigns" and self.preview_id is None and
                self.preview_recipients is not None and isinstance(body,dict) and
                body.get("recipients")==self.preview_recipients and body.get("type")=="classic" and
                not any(body.get(k) for k in ("scheduledAt","abTesting","sendAtBestTime"))) or (
                self.preview_id is not None and self.preview_id!=self.campaign_id and
                clean=="/emailCampaigns/%d/sendNow"%self.preview_id and body is None)
        if not (read or write): raise Blocked("Newsletter-Aufruf liegt außerhalb der konkreten Operation.")
        result=super().call(method,path,body,missing)
        if method=="POST" and clean=="/emailCampaigns" and self.operation=="draft": self.campaign_id=result["id"]
        if method=="POST" and clean=="/emailCampaigns" and self.operation=="preview":
            candidate=result.get("id")
            if type(candidate) is not int or candidate<1 or candidate==self.campaign_id:
                raise Blocked("Vorabkampagnen-ID ungültig; kein Versand.")
            self.preview_id=candidate
        return result


def run():
    if not trusted_newsletter(): raise Blocked("Newsletter nur im separaten manuellen Standardbranch-Workflow.")
    operation=os.environ.get("BREVO_NEWSLETTER_OPERATION")
    if operation not in ("initialize","draft","check","test","preview","send"): raise Blocked("Ungültige Newsletter-Operation.")
    dry_flag=os.environ.get("BREVO_DRY_RUN","false")
    if dry_flag not in ("true","false") or dry_flag=="true" and operation not in ("test","preview","send"):
        raise Blocked("Freigabeprüfung ohne Versand ist nur für test/preview/send zulässig.")
    dry_run=dry_flag=="true"
    github=Github();ledger=Ledger(github)
    if operation=="initialize": return ledger.initialize()
    try: config=json.loads(os.environ.pop("BREVO_NEWSLETTER_CONFIG",""))
    except Exception: raise Blocked("Private Newsletter-Konfiguration fehlt.") from None
    if not isinstance(config,dict): raise Blocked("Private Newsletter-Konfiguration ungültig.")
    cid=int(os.environ.get("BREVO_CAMPAIGN_ID") or 0)
    client=NewsletterClient("check" if dry_run else operation,cid)
    from campaigns import Process
    process=Process(client,config,ledger=ledger)
    try:
        if operation=="draft":
            source=os.environ.get("BREVO_NEWSLETTER_SOURCE","secret")
            if source=="secret":
                content=json.loads(os.environ.pop("BREVO_NEWSLETTER_CONTENT",""))
            else:
                from newsletter_content import repository_content
                content=repository_content(source,client)
            return process.draft(content)
        if cid<1: raise Blocked("Konkrete Kampagnen-ID fehlt.")
        if operation=="check":
            state,fingerprint,addresses=process.current(cid)
            attempt=state.get("tests",{}).get(fingerprint,{})
            result={"campaign_id":cid,"version":fingerprint,"production_sent":False,
                "test_api_accepted":attempt.get("state")=="api_accepted" and
                    attempt.get("test_identity")==process.test_identity(addresses),
                "requires_owner_approval":True}
            if attempt.get("preview_id"):
                from newsletter_preview import preview_report
                client.preview_id=attempt["preview_id"]
                result.update(preview_report(client,client.preview_id,addresses))
            return result
        expected=os.environ.get("BREVO_EXPECTED_VERSION","")
        if not re.fullmatch(r"[a-f0-9]{64}",expected) or os.environ.get("BREVO_AUTHORIZE_SEND")!="true":
            raise Blocked("Ausdrückliche Freigabe der konkreten Kampagnenversion fehlt.")
        from newsletter_approval import authorize_dispatch, reserve_approval
        receipt=authorize_dispatch(github,operation,cid,expected)
        _,actual,_=process.current(cid)
        if actual!=expected: raise Blocked("Inhalt seit Versionsfreigabe geändert; neuer Vorabtest erforderlich.")
        if dry_run:
            if operation=="send": process.check(cid)
            if operation=="preview":
                from newsletter_preview import preview_audience
                from client import structures
                preview_audience(client,config,structures(client))
            return {"campaign_id":cid,"version":actual,"operation":operation,
                "approval_valid":True,"dry_run":True,"emails_sent":0,"production_sent":False}
        reserve_approval(process,cid,receipt)
        if operation=="test": return process.test(cid,True,expected_version=expected)
        if operation=="preview":
            from newsletter_preview import preview
            return preview(process,cid,expected,authorized=True,github=github)
        return process.send(cid,{"campaign_id":cid,"version":expected,"explicit_owner_approval":True,
            "approval_reference":"owner dispatch "+str(receipt["run_id"])+" / "+receipt["approval_sha256"]},True)
    finally: process.close()


if __name__=="__main__":
    try: print(json.dumps(run(),ensure_ascii=False))
    except Blocked as error:
        print("Gesperrt: "+str(error))
        raise SystemExit(1) from None
    except Exception:
        print("Gesperrt: privaten Inhalt, konkrete Owner-Freigabe und dauerhaftes Register prüfen; keine Rohdaten/automatischen Wiederholungen.")
        raise SystemExit(1) from None
