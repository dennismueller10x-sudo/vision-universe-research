"""One-off GET-only account-label/folder verification; no identity values logged."""
import hashlib
import json
import os
import re
import unicodedata
from client import Client, LISTS, positive_id
from prepare import Blocked

BRANCH = "refs/heads/ops/brevo-account-audit-20261012"
# Digest of the owner-provided business label, not of any fetched identity or API key.
# The expected label and actual account/company fields are never printed.
EXPECTED_LABEL_DIGEST = "6d0e88f466b748d4db9d6f3082c20cc4452b6e05958e93151ff4836932d6cb07"
EXPECTED_COMPACT_DIGEST = hashlib.sha256(b"ramconsulting").hexdigest()
EXPECTED_IDS = {"VU | Newsletter":4, "VU | App-Warteliste":5, "VU | Newsletter-Test":6}


class ReadOnlyStructure(Client):
    def call(self, method, path, body=None, missing=False):
        clean = path.split("?", 1)[0]
        allowed = clean in ("/account", "/contacts/lists", "/contacts/folders") or bool(
            re.fullmatch(r"/contacts/lists/[1-9][0-9]*(?:/contacts)?",clean)) or bool(
            re.fullmatch(r"/contacts/folders/[1-9][0-9]*(?:/lists)?",clean))
        if method != "GET" or body is not None or not allowed:
            raise Blocked("Nur fest begrenzte Konto-/Listen-/Ordner-Leseabrufe erlaubt.")
        return super().call(method,path,missing=missing)


def label_check(account):
    value = account.get("companyName")
    if not isinstance(value,str) or not value.strip(): return "field_unavailable"
    normalized = " ".join(unicodedata.normalize("NFC",value).casefold().split())
    if hashlib.sha256(normalized.encode()).hexdigest()==EXPECTED_LABEL_DIGEST: return "matches"
    if hashlib.sha256(normalized.replace(" ","").encode()).hexdigest()==EXPECTED_COMPACT_DIGEST:
        return "matches_spacing_variant"
    return "differs"


def label_context(account):
    value=account.get("companyName")
    if not isinstance(value,str): return {"expected_business_words_present":False,"vu_brand_label_match":False}
    words=re.findall(r"[a-z]+",unicodedata.normalize("NFC",value).casefold())
    return {"expected_business_words_present":{"ram","consulting"}.issubset(words),
            "vu_brand_label_match":"".join(words)=="visionuniverse"}


def summarize(client):
    account=client.call("GET","/account")
    lists=client.pages("/contacts/lists","lists")
    folders=client.pages("/contacts/folders","folders")
    details=[]
    for name in LISTS:
        matches=[x for x in lists if x.get("name")==name]
        row={"name":name,"matches":len(matches),"expected_id":EXPECTED_IDS[name]}
        if len(matches)==1:
            lid=positive_id(matches[0].get("id"))
            detail=client.call("GET","/contacts/lists/"+str(lid))
            fid=positive_id(detail.get("folderId"))
            folder=client.call("GET","/contacts/folders/"+str(fid))
            # Folder-scoped read independently verifies placement in the full inventory.
            scoped=client.pages("/contacts/folders/"+str(fid)+"/lists","lists")
            count=client.call("GET","/contacts/lists/"+str(lid)+"/contacts?limit=1&offset=0").get("count")
            row.update({"id":lid,"expected_id_matches":lid==EXPECTED_IDS[name],"folder_id":fid,
                "folder_label":"Vision Universe" if folder.get("name")=="Vision Universe" else "withheld_other_label",
                "folder_scoped_read_contains_list":any(x.get("id")==lid for x in scoped),
                "list_detail_matches_inventory":detail.get("id")==lid and detail.get("name")==name,
                "contacts_count":count if type(count) is int and count>=0 else None})
        details.append(row)
    return {"operation":"audit","scope":"account-label and unfiltered folder/list GET verification",
            "account_company_label_comparison":label_check(account),
            "account_company_label_context":label_context(account),
            "account_company_field_available":isinstance(account.get("companyName"),str),
            "all_lists_count":len(lists),"all_folders_count":len(folders),"vu_lists":details,
            "ui_filter_status":"not observable through API; no browser session available",
            "contacts_imported":0,"emails_sent":0,"lists_created":0}


def main():
    try:
        if not (os.environ.get("GITHUB_ACTIONS")=="true" and os.environ.get("GITHUB_EVENT_NAME")=="workflow_dispatch"
                and os.environ.get("GITHUB_REF")==BRANCH and os.environ.get("BREVO_OPERATION")=="audit"):
            raise Blocked("Nur der manuelle Konto-/Ordner-Leseabgleich ist freigegeben.")
        print(json.dumps(summarize(ReadOnlyStructure()),ensure_ascii=False))
    except Exception:
        print("Gesperrt: Konto-/Ordner-Audit unvollständig; keine Identitätswerte oder Rohantworten ausgegeben.")
        raise SystemExit(1) from None


if __name__=="__main__": main()
