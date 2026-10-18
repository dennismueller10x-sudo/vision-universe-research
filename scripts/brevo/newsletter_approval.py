"""Verify the authenticated, version-bound owner dispatch, never the chat text.

The assistant must obtain the real campaign-specific consent before dispatching.
GitHub cannot inspect that conversation: approval_sha256 is a private evidence
reference, not a cryptographic proof that a human approved the message.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
from prepare import Blocked


def load_policy():
    return json.loads((Path(__file__).parent / "newsletter-approval-policy.json").read_text())


def authorize_dispatch(github, operation, campaign_id, version):
    try:
        policy = load_policy()
        owner = policy["owner"]
        reference = os.environ.get("BREVO_APPROVAL_SHA256", "")
        run_id = os.environ.get("GITHUB_RUN_ID", "")
        revision = os.environ.get("GITHUB_SHA", "")
        if (policy["mode"] != "owner-dispatch-v1" or operation not in ("test", "preview", "send")
                or type(campaign_id) is not int or campaign_id < 1
                or not re.fullmatch(r"[a-f0-9]{64}", version)
                or not re.fullmatch(r"[a-f0-9]{64}", reference)
                or not re.fullmatch(r"[1-9][0-9]*", run_id)
                or not re.fullmatch(r"[a-f0-9]{40}", revision)
                or os.environ.get("BREVO_AUTHORIZE_SEND") != "true"):
            raise ValueError()
        if (os.environ.get("GITHUB_REPOSITORY") != policy["repository"]
                or os.environ.get("BREVO_DEFAULT_BRANCH") != policy["default_branch"]
                or os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
                or os.environ.get("GITHUB_REF") != "refs/heads/" + policy["default_branch"]
                or os.environ.get("GITHUB_RUN_ATTEMPT") != "1"
                or os.environ.get("GITHUB_ACTOR") != owner["login"]
                or os.environ.get("GITHUB_ACTOR_ID") != str(owner["id"])
                or os.environ.get("GITHUB_TRIGGERING_ACTOR") != owner["login"]):
            raise ValueError()
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        identity = lambda person: person.get("id") == owner["id"] and person.get("login") == owner["login"]
        inputs = event["inputs"]
        approved = inputs.get("authorize_send")
        dry_value = inputs.get("dry_run", False)
        if dry_value is True or type(dry_value) is str and dry_value == "true":
            dry_run = True
        elif dry_value is False or type(dry_value) is str and dry_value == "false":
            dry_run = False
        else:
            raise ValueError()
        if (not identity(event["sender"])
                or event["repository"]["full_name"] != policy["repository"]
                or inputs.get("operation") != operation
                or inputs.get("campaign_id") != str(campaign_id)
                or inputs.get("expected_version") != version
                or inputs.get("approval_sha256") != reference
                or os.environ.get("BREVO_DRY_RUN", "false") != str(dry_run).lower()
                or not (approved is True or type(approved) is str and approved == "true")):
            raise ValueError()
        run = github.call("GET", "/actions/runs/" + run_id)
        created = dt.datetime.fromisoformat(run["created_at"].replace("Z", "+00:00"))
        age = (dt.datetime.now(dt.timezone.utc) - created).total_seconds()
        if (run.get("id") != int(run_id) or run.get("event") != "workflow_dispatch"
                or run.get("path") != ".github/workflows/brevo-newsletter.yml"
                or run.get("head_branch") != policy["default_branch"]
                or run.get("head_sha") != revision or run.get("run_attempt") != 1
                or run.get("status") != "in_progress" or not -300 <= age <= 86400
                or not identity(run.get("actor", {}))
                or not identity(run.get("triggering_actor", {}))):
            raise ValueError()
        return {"run_id": int(run_id), "operation": operation, "version": version,
                "approval_sha256": reference, "actor_id": owner["id"]}
    except Blocked:
        raise
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        raise Blocked("Konkrete Owner-Freigabe, Dispatch-Identität oder Versionsbindung ungültig; kein Versand.") from None


def reserve_approval(process, campaign_id, receipt):
    # The containing campaign binds the receipt to the exact ID; run IDs are single-use.
    if any(a["approval_sha256"] == receipt["approval_sha256"]
           for campaign in process.state["campaigns"].values()
           for a in campaign.get("approvals", {}).values()):
        raise Blocked("Diese Freigabereferenz wurde bereits verwendet; separate konkrete Freigabe nötig.")
    state = process.state["campaigns"][str(campaign_id)]
    approvals = state.setdefault("approvals", {})
    key = str(receipt["run_id"])
    if key in approvals:
        raise Blocked("Freigabe dieses Ausführungslaufs bereits verwendet; keinen Versand wiederholen.")
    approvals[key] = {k: v for k, v in receipt.items() if k != "run_id"}
    process.save()
