"""Curated artwork/content with synthetic API responses; never sends real mail."""
from email.message import Message
import json
import unittest
from unittest.mock import MagicMock, patch
import test_safety as safety
from campaigns import render
from newsletter_content import DIRECTORY, repository_content
from prepare import Blocked


class AppNewsletter(unittest.TestCase):
    setUp = safety.Safety.setUp
    tearDown = safety.Safety.tearDown
    process = safety.Safety.process

    def content(self):
        content = json.loads((DIRECTORY / "content.json").read_text())
        revision = content.pop("image_revision")
        content.pop("image_sha256")
        content.pop("sender_domain")
        content["sender_id"] = 1
        content["image_url"] = ("https://raw.githubusercontent.com/dennismueller10x-sudo/vision-universe-research/"
            + revision + "/scripts/brevo/content/vision-universe-app/iphone-motiv.png")
        return content

    def response(self, body=None):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = (DIRECTORY / "iphone-motiv.png").read_bytes() if body is None else body
        response.headers = Message()
        response.headers["Content-Type"] = "image/png"
        opener = MagicMock()
        opener.open.return_value = response
        return opener

    def test_preserves_approved_layout_subject_and_real_unsubscribe_tag(self):
        content = self.content()
        result = render(content)
        self.assertEqual(content["subject"], "Investieren mit Weitblick. Vision Universe. Die App.")
        self.assertNotIn("kommt aufs iPhone", result)
        self.assertNotIn("data:image", result)
        self.assertNotIn("<script", result)
        self.assertNotIn("$", result)
        self.assertEqual(result.count("{{ unsubscribe }}"), 1)
        self.assertIn('href="{{ unsubscribe }}"', result)
        self.assertIn('href="https://www.visionuniverse.de/impressum/"', result)
        self.assertIn("Bahnhofplatz 15, 74189 Weinsberg, Deutschland", result)
        self.assertIn("@media", result)
        self.assertIn("Bald verfügbar", result)
        self.assertNotIn('href="Bald', result)

    def test_custom_content_is_escaped_and_arbitrary_layouts_and_images_block(self):
        content = self.content()
        content["intro"] = '<img src="tracking"> & test'
        self.assertIn("&lt;img", render(content))
        for layout in ("../newsletter", "unknown"):
            with self.assertRaises(Blocked): render({**content, "layout":layout})
        for image in ("data:image/png;base64,AA", "http://example.invalid/a.png", "https://example.invalid/a.png"):
            with self.assertRaises(Blocked): render({**content, "image_url":image})
        with self.assertRaises(Blocked): render({**content, "company_details_verified":False})

    def test_loads_only_curated_source_and_hash_checks_public_artwork_without_api_key(self):
        class Sender:
            def call(self, method, path):
                self_request = (method,path)
                assert self_request == ("GET","/senders")
                return {"senders":[{"id":1,"active":True,"email":"synthetic@visionuniverse.de"}]}
        opener = self.response()
        with patch("newsletter_content.urllib.request.build_opener", return_value=opener):
            content = repository_content("vision-universe-app", Sender())
        self.assertEqual(content, self.content())
        request = opener.open.call_args.args[0]
        self.assertNotIn("api-key", {k.lower():v for k,v in request.header_items()})
        self.assertNotIn("Authorization", dict(request.header_items()))
        with self.assertRaises(Blocked): repository_content("../../private", Sender())

    def test_unreachable_or_changed_artwork_and_ambiguous_sender_block_before_any_campaign_post(self):
        class Sender:
            def call(self, method, path):
                assert method == "GET" and path == "/senders"
                return {"senders":[{"id":i,"active":True,"email":"synthetic@visionuniverse.de"} for i in (1,2)]}
        for opener in (self.response(b"changed"), self.response()):
            with patch("newsletter_content.urllib.request.build_opener", return_value=opener):
                with self.assertRaises(Blocked): repository_content("vision-universe-app", Sender())
        opener = self.response()
        opener.open.side_effect = OSError("synthetic failure")
        with patch("newsletter_content.urllib.request.build_opener", return_value=opener):
            with self.assertRaises(Blocked): repository_content("vision-universe-app", Sender())

    def test_app_draft_stays_unscheduled_and_deduplicated_with_internal_list_excluded(self):
        p = self.process()
        content = self.content()
        p.draft(content)
        p.draft(content)
        posts = [body for method,path,body in self.fake.calls if method == "POST"]
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["recipients"], {"listIds":[1],"exclusionListIds":[3]})
        self.assertNotIn("scheduledAt", posts[0])
        self.assertEqual(self.fake.campaign["status"], "draft")
        self.assertFalse(any(path.endswith(("sendTest", "sendNow")) for _,path,_ in self.fake.calls))
        p.test(8, True)  # synthetic API only
        self.fake.campaign["htmlContent"] += "<!-- changed content -->"
        with self.assertRaises(Blocked): p.check(8)


if __name__ == "__main__": unittest.main()
