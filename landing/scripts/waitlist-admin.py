"""Private Actions operator: inspect DOI prerequisites; never send or log PII."""
import json
import os
import re
import urllib.error
import urllib.request
import secrets
from pathlib import Path

TEMPLATE = "VU | App-Warteliste | DOI | v1"
CONFIRMATION_TEMPLATE = "VU | App-Warteliste | Anmeldung bestätigt | v1"
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
        try: value=json.loads(error.read(65536))
        except Exception: value={}
        return error.code, {"safe_codes":[x.get("code") for x in value.get("errors",[]) if type(x.get("code")) is int]}


def run():
    operation=os.environ.get("WAITLIST_OPERATION","audit")
    if operation not in ("audit","setup"):raise ValueError("Invalid operation")
    report = {"operation": operation, "emails_sent": 0, "contacts_changed": 0}
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
    confirmation_matches=[t for t in templates if t.get("name")==CONFIRMATION_TEMPLATE]
    report["confirmation_template_ids"]=[t["id"] for t in confirmation_matches]
    report["transactional_templates_readable"] = True
    attributes = brevo("/contacts/attributes").get("attributes", [])
    report["app_attribute_types"] = {name: next((a.get("type") for a in attributes if a.get("name") == name), None) for name in ATTRIBUTES}
    if operation=="setup":
        if not report["brevo_free"] or not report["domain_verified"] or not report["domain_authenticated"] or len(report["eligible_sender_ids"])!=1 or len(matches)>1 or len(confirmation_matches)>1:
            raise ValueError("Brevo prerequisites inconsistent")
        if any(t not in (None,"text") for t in report["app_attribute_types"].values()):raise ValueError("Attribute type conflict")
        for name,kind in report["app_attribute_types"].items():
            if kind is None:
                status,_=api("https://api.brevo.com/v3","/contacts/attributes/normal/"+name,key,"POST",{"type":"text"})
                if status not in (200,201,204):raise ValueError("Attribute setup failed")
        if not matches:
            html=Path(__file__).resolve().parents[1].joinpath("mail/app-doi.html").read_text()
            if '{{ params.DOIurl }}' not in html:raise ValueError("DOI placeholder missing")
            status,value=api("https://api.brevo.com/v3","/smtp/templates",key,"POST",{
                "templateName":TEMPLATE,"subject":"Bestätige deine Anmeldung zur App-Warteliste",
                "sender":{"id":report["eligible_sender_ids"][0],"name":"Vision Universe"},
                "htmlContent":html,"isActive":True,"tag":"optin"})
            if status not in (200,201) or type(value.get("id")) is not int:raise ValueError("Template setup failed")
            report["doi_template_ids"]=[value["id"]]
        template=brevo("/smtp/templates/"+str(report["doi_template_ids"][0]))
        html=Path(__file__).resolve().parents[1].joinpath("mail/app-doi.html").read_text()
        if template.get("htmlContent")!=html:
            if template.get("name")!=TEMPLATE:raise ValueError("Template ownership conflict")
            status,_=api("https://api.brevo.com/v3","/smtp/templates/"+str(report["doi_template_ids"][0]),key,"PUT",{"htmlContent":html})
            if status not in (200,204):raise ValueError("Own template update failed")
            template=brevo("/smtp/templates/"+str(report["doi_template_ids"][0]))
        report["doi_template_active"]=template.get("isActive") is True
        report["doi_template_contains_api_link"]='{{ params.DOIurl }}' in template.get("htmlContent","")
        report["doi_template_matches_repository"]=template.get("htmlContent")==html
        if not report["doi_template_active"] or not report["doi_template_contains_api_link"]:raise ValueError("Template not suitable")
        report["app_attribute_types"]={name:next((a.get("type") for a in brevo("/contacts/attributes")["attributes"] if a.get("name")==name),None) for name in ATTRIBUTES}
        confirmation_html=Path(__file__).resolve().parents[1].joinpath("mail/app-confirmed.html").read_text()
        if not confirmation_matches:
            status,value=api("https://api.brevo.com/v3","/smtp/templates",key,"POST",{
                "templateName":CONFIRMATION_TEMPLATE,"subject":"Deine App-Anmeldung ist bestätigt – dein Abmeldelink",
                "sender":{"id":report["eligible_sender_ids"][0],"name":"Vision Universe"},
                "htmlContent":confirmation_html,"isActive":True,"tag":"vu-app-confirmation"})
            if status not in (200,201) or type(value.get("id")) is not int:raise ValueError("Confirmation template setup failed")
            report["confirmation_template_ids"]=[value["id"]]
        confirmation=brevo("/smtp/templates/"+str(report["confirmation_template_ids"][0]))
        report["confirmation_template_active"]=confirmation.get("isActive") is True
        report["confirmation_template_matches_repository"]=confirmation.get("htmlContent")==confirmation_html
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
        if not check["existing_project_matches"]:break
        check["runtime_bindings"] = {stage: {n: variables.get(n, {}).get("type") for n in ("BREVO_API_KEY", "WAITLIST_TOKEN_KEY", "WAITLIST_DB", "WAITLIST_PUBLIC_ENABLED", "WAITLIST_PRIVACY_APPROVED", "WAITLIST_E2E_VERIFIED")} for stage, config in project.get("deployment_configs", {}).items() for variables in [config.get("env_vars", {})]}
        status, data = api("https://api.cloudflare.com/client/v4", "/accounts/" + account_id + "/d1/database?per_page=100", token)
        check["d1_read_http"] = status
        check["d1_error_codes"]=data.get("safe_codes",[])
        if status == 200 and data.get("success") is True:
            databases=[d for d in data.get("result",[]) if d.get("name")=="vu-app-waitlist"]
            check["waitlist_databases"] = len(databases)
            if operation=="setup" and len(databases)<=1:
                if not databases:
                    status,created=api("https://api.cloudflare.com/client/v4","/accounts/"+account_id+"/d1/database",token,"POST",{"name":"vu-app-waitlist","jurisdiction":"eu"})
                    check["d1_create_http"]=status
                    if status in (200,201) and created.get("success") is True:databases=[created["result"]]
                if databases:
                    database_id=databases[0].get("uuid")
                    if not isinstance(database_id,str) or not re.fullmatch(r"[a-f0-9-]{36}",database_id):raise ValueError("Invalid D1 identifier")
                    schema=Path(__file__).resolve().parents[1].joinpath("server/schema.sql").read_text()
                    for statement in schema.split(';'):
                        if statement.strip():
                            status,result=api("https://api.cloudflare.com/client/v4","/accounts/"+account_id+"/d1/database/"+database_id+"/query",token,"POST",{"sql":statement})
                            if status!=200 or result.get("success") is not True:raise ValueError("D1 schema setup blocked")
                    check["d1_schema_ready"]=True
                    check["_database_id"]=database_id
        if operation=="setup":
            # Do not re-submit opaque existing secrets or overwrite unrelated bindings.
            configs=project.get("deployment_configs",{})
            safe=all(c.get("env_vars",{}).get(n,{}).get("type") in (None,"secret_text") for c in configs.values() for n in ("BREVO_API_KEY","WAITLIST_TOKEN_KEY"))
            check["safe_runtime_secret_setup"]=safe
            if safe:
                token_key=secrets.token_hex(32)
                # PATCH merges supplied keys; omitted existing keys are retained.
                changes={stage:{"env_vars":{
                    "WAITLIST_DOI_TEMPLATE_ID":{"type":"plain_text","value":str(report["doi_template_ids"][0])},
                    "WAITLIST_CONFIRMATION_TEMPLATE_ID":{"type":"plain_text","value":str(report["confirmation_template_ids"][0])},
                    "WAITLIST_PUBLIC_ENABLED":{"type":"plain_text","value":"false"},
                    "WAITLIST_PRIVACY_APPROVED":{"type":"plain_text","value":"false"},
                    "WAITLIST_E2E_VERIFIED":{"type":"plain_text","value":"false"}}} for stage,config in configs.items()}
                for stage,config in configs.items():
                    for secret_name,secret_value in (("BREVO_API_KEY",key),("WAITLIST_TOKEN_KEY",token_key)):
                        if secret_name not in config.get("env_vars",{}):changes[stage]["env_vars"][secret_name]={"type":"secret_text","value":secret_value}
                    if stage=="preview" and os.environ.get("BREVO_DOI_TEST_EMAIL"):
                        changes[stage]["env_vars"]["WAITLIST_TEST_EMAIL"]={"type":"secret_text","value":os.environ["BREVO_DOI_TEST_EMAIL"]}
                        if "WAITLIST_TEST_ACCESS_TOKEN" not in config.get("env_vars",{}):changes[stage]["env_vars"]["WAITLIST_TEST_ACCESS_TOKEN"]={"type":"secret_text","value":secrets.token_hex(32)}
                    if check.get("d1_schema_ready"):
                        existing=config.get("d1_databases",{}).get("WAITLIST_DB")
                        if existing and existing.get("id")!=check["_database_id"]:raise ValueError("Existing D1 binding conflict")
                        changes[stage]["d1_databases"]={**config.get("d1_databases",{}),"WAITLIST_DB":{"id":check["_database_id"]}}
                status,value=api("https://api.cloudflare.com/client/v4","/accounts/"+account_id+"/pages/projects/vision-universe",token,"PATCH",{"deployment_configs":changes})
                check["runtime_setup_http"]=status
                check["runtime_setup_error_codes"]=value.get("safe_codes",[])
                if status==200 and value.get("success") is True:
                    status,value=api("https://api.cloudflare.com/client/v4","/accounts/"+account_id+"/pages/projects/vision-universe",token)
                    check["secret_types_verified"]=status==200 and all(c.get("env_vars",{}).get(n,{}).get("type")=="secret_text" for c in value.get("result",{}).get("deployment_configs",{}).values() for n in ("BREVO_API_KEY","WAITLIST_TOKEN_KEY"))
                    before={s:{n:v for n,v in c.get("env_vars",{}).items() if n not in changes[s]["env_vars"]} for s,c in configs.items()}
                    check["other_env_unchanged"]=status==200 and all(value["result"]["deployment_configs"][s]["env_vars"].get(n)==v for s,variables in before.items() for n,v in variables.items())
                    check["existing_project_configuration_unchanged"]=status==200 and all(value["result"].get(n)==project.get(n) for n in ("name","source","build_config","production_branch","domains"))
            check.pop("_database_id",None)
        report["lists_after"]=[{"id":n,"count":brevo("/contacts/lists/"+str(n)).get("totalSubscribers")} for n in (4,5,6)]
        report["list_counts_unchanged"]=report["lists"]==report["lists_after"]
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
