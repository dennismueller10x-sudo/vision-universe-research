/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/rss-parse.test.mjs
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../engines/rss-parse.js");

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Test Feed</title>
<item>
  <title><![CDATA[Nvidia &amp; OpenAI announce 100 billion deal]]></title>
  <link>https://example.com/a</link>
  <description><![CDATA[Nvidia said Monday it would invest <b>100 billion</b> dollars.]]></description>
  <pubDate>Wed, 23 Sep 2026 06:00:00 GMT</pubDate>
</item>
<item>
  <title>Plain title without CDATA</title>
  <link>https://example.com/b</link>
  <description>Plain description &amp; text</description>
  <pubDate>Wed, 23 Sep 2026 07:00:00 GMT</pubDate>
</item>
<item>
  <title></title>
  <link>https://example.com/c</link>
</item>
</channel></rss>`;

test("RP1 · parseRss() findet alle Items mit Titel", () => {
  const items = R.parseRss(FIXTURE, "TestSource");
  assert.equal(items.length, 2);
});

test("RP2 · parseRss() loest CDATA und HTML-Entities auf", () => {
  const items = R.parseRss(FIXTURE, "TestSource");
  assert.equal(items[0].title, "Nvidia & OpenAI announce 100 billion deal");
  assert.equal(items[0].description, "Nvidia said Monday it would invest 100 billion dollars.");
});

test("RP3 · parseRss() traegt die Quelle mit", () => {
  const items = R.parseRss(FIXTURE, "TestSource");
  assert.equal(items[0].source, "TestSource");
});

test("RP4 · parseRss() liefert lesbare pubDate-Strings", () => {
  const items = R.parseRss(FIXTURE, "TestSource");
  assert.equal(isNaN(new Date(items[0].pubDate).getTime()), false);
});

test("RP5 · parseRss() wirft nie — kaputtes Dokument liefert leere Liste", () => {
  assert.deepEqual(R.parseRss("kein xml", "x"), []);
  assert.deepEqual(R.parseRss(null, "x"), []);
  assert.deepEqual(R.parseRss(undefined, "x"), []);
  assert.deepEqual(R.parseRss("", "x"), []);
});

test("RP6 · parseRss() ueberspringt Items ohne Titel statt sie leer einzutragen", () => {
  const items = R.parseRss(FIXTURE, "TestSource");
  assert.ok(!items.some((i) => i.link === "https://example.com/c"));
});
