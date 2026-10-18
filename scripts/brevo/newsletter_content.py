"""Curated public campaign content; no recipients, secrets or arbitrary HTML paths."""
import hashlib
import json
from pathlib import Path
import re
import urllib.request
from prepare import Blocked

SOURCE = "vision-universe-app"
DIRECTORY = Path(__file__).resolve().parent / "content" / SOURCE
REPOSITORY = "dennismueller10x-sudo/vision-universe-research"


def repository_content(source, client):
    if source != SOURCE:
        raise Blocked("Unbekannte redaktionelle Newsletter-Vorlage.")
    content = json.loads((DIRECTORY / "content.json").read_text(encoding="utf-8"))
    revision = content.pop("image_revision")
    expected = content.pop("image_sha256")
    if not re.fullmatch(r"[a-f0-9]{40}", revision) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise Blocked("Unveränderliche Bildreferenz fehlt.")
    if hashlib.sha256((DIRECTORY / "iphone-motiv.png").read_bytes()).hexdigest() != expected:
        raise Blocked("Newsletter-Bild weicht vom geprüften Motiv ab.")
    content["image_url"] = ("https://raw.githubusercontent.com/" + REPOSITORY + "/" + revision
        + "/scripts/brevo/content/vision-universe-app/iphone-motiv.png")
    # Read public artwork without forwarding Brevo credentials; fail before creating a draft.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs): return None
    request = urllib.request.Request(content["image_url"], headers={"User-Agent":"VisionUniverse-Brevo/1.0"})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            image = response.read(2_000_001)
            if response.headers.get_content_type() != "image/png" or hashlib.sha256(image).hexdigest() != expected:
                raise Blocked("Öffentliches Newsletter-Bild ist nicht bytegleich verfügbar.")
    except (OSError, ValueError):
        raise Blocked("Newsletter-Bild ist nicht per HTTPS verfügbar; kein Entwurf erstellt.") from None
    domain = content.pop("sender_domain")
    senders = [s for s in client.call("GET", "/senders").get("senders", [])
        if s.get("active") is True and s.get("email", "").rsplit("@", 1)[-1].lower() == domain]
    if len(senders) != 1 or type(senders[0].get("id")) is not int:
        raise Blocked("Für die Newsletter-Domain ist kein eindeutiger bestätigter Absender eingerichtet.")
    content["sender_id"] = senders[0]["id"]
    return content
