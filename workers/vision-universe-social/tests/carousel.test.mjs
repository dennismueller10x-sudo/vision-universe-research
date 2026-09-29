/* =========================================================================
   vision-universe-social — CAROUSEL: EIN BEITRAG, MEHRERE SLIDES
   (Owner-Auftrag "WORK OWNS THE POST", 29.09.)

   Ein Carousel ist EIN Kandidat und EIN Beitrag. Diese Tests fahren die
   echten Funktionen des Workers: Abdruck, Schlangenpruefung, Karte und
   den Veroeffentlichungspfad gegen einen Graph-Doppelgaenger.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import { __internals } from "../src/index.js";
import { contentHash } from "../src/redact.js";
import { candidatePage } from "../src/approval-ui.js";
import { createEnv, verbinde, PUBLISH_IG_ID, bildAntwort, jpegBytes } from "./harness.mjs";

const SLIDES = [1, 2, 3].map((n) =>
  "https://research.visionuniverse.de/assets/social/vu-post-20260929-abc-s" + n + ".png");
const CAPTION = "Ein Satz zur Story. Keine Anlageberatung.\n\n#Boerse #KI";
const CID = "vu-post-20260929-abc";

function carouselGraph(options = {}) {
  const aufrufe = [];
  let kind = 0;
  const fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const pfad = url.pathname.split("/").slice(2).join("/");
    const methode = (init && init.method) || "GET";
    aufrufe.push({ pfad, methode, url: rawUrl, params: Object.fromEntries(url.searchParams) });
    const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status,
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers({ "content-type": "application/json" }) });
    if (!url.hostname.includes("graph.")) {
      if (options.fehlendeSlide && rawUrl === options.fehlendeSlide) {
        return { ok: false, status: 404, headers: new Headers() };
      }
      return bildAntwort(jpegBytes(), { typ: "image/jpeg" });
    }
    if (pfad === PUBLISH_IG_ID + "/media" && methode === "POST") {
      if (url.searchParams.get("media_type") === "CAROUSEL") return json({ id: "carousel_1" });
      kind += 1;
      return json({ id: "child_" + kind });
    }
    if (/^child_\d$/.test(pfad) || pfad === "carousel_1") return json({ status_code: "FINISHED" });
    if (pfad === PUBLISH_IG_ID + "/media_publish" && methode === "POST") return json({ id: "media_c1" });
    if (pfad === "media_c1") {
      return json({ id: "media_c1", permalink: "https://www.instagram.com/p/C1/",
        timestamp: "2026-09-29T18:00:00+0000", media_type: "CAROUSEL_ALBUM" });
    }
    return json({ error: { message: "unerwartet: " + pfad, code: 100 } }, 404);
  };
  return { fetchImpl, aufrufe };
}

async function umgebung(options) {
  const g = carouselGraph(options);
  const env = createEnv({ META_IG_ALLOWED_USERNAMES: "visionuniverse", __fetchImpl: g.fetchImpl });
  await verbinde(env);
  return { env, g };
}

async function freigabe(urls) {
  return { candidateId: "cand_x", approvedBy: "owner", approvedAt: "2026-09-29T18:00:00Z",
    contentHash: await contentHash({ contentId: CID, imageUrl: urls[0], imageUrls: urls, caption: CAPTION }) };
}

test("CAR1 · Ein Carousel wird als EIN Beitrag veroeffentlicht: Kinder, Carousel-Container, Freigabe", async () => {
  const { env, g } = await umgebung();
  const antwort = await __internals.publishCore({ contentId: CID, imageUrl: SLIDES[0], imageUrls: SLIDES,
    caption: CAPTION, approval: await freigabe(SLIDES) }, env);
  const body = await antwort.json();
  assert.equal(body.published, true, JSON.stringify(body));
  assert.equal(body.slides, 3);

  const posts = g.aufrufe.filter((a) => a.methode === "POST");
  const kinder = posts.filter((a) => a.params.is_carousel_item === "true");
  assert.equal(kinder.length, 3, "je Slide ein Kind-Container");
  kinder.forEach((k, i) => {
    assert.equal(k.params.image_url, SLIDES[i]);
    assert.equal(k.params.caption, undefined, "Kinder tragen keine Caption");
  });
  const carousel = posts.find((a) => a.params.media_type === "CAROUSEL");
  assert.equal(carousel.params.children, "child_1,child_2,child_3", "Reihenfolge der Slides bleibt");
  assert.equal(carousel.params.caption, CAPTION);
  const publish = posts.filter((a) => a.pfad.endsWith("/media_publish"));
  assert.equal(publish.length, 1, "genau eine Freigabe");
  assert.equal(publish[0].params.creation_id, "carousel_1");
});

test("CAR2 · Eine nachtraeglich veraenderte Slide-Liste passt nicht zur Freigabe", async () => {
  const { env, g } = await umgebung();
  const antwort = await __internals.publishCore({ contentId: CID, imageUrl: SLIDES[0],
    imageUrls: [SLIDES[0], SLIDES[2], SLIDES[1]], caption: CAPTION,
    approval: await freigabe(SLIDES) }, env);
  assert.equal(antwort.status, 409);
  assert.equal((await antwort.json()).error, "approvalMismatch");
  assert.equal(g.aufrufe.filter((a) => a.methode === "POST").length, 0, "nichts angelegt");
});

test("CAR3 · Eine unerreichbare Slide stoppt VOR dem ersten Container", async () => {
  const { env, g } = await umgebung({ fehlendeSlide: SLIDES[1] });
  const antwort = await __internals.publishCore({ contentId: CID, imageUrl: SLIDES[0], imageUrls: SLIDES,
    caption: CAPTION, approval: await freigabe(SLIDES) }, env);
  const body = await antwort.json();
  assert.equal(body.published, false);
  assert.equal(body.stage, "imageCheck");
  assert.equal(body.slide, 2);
  assert.equal(g.aufrufe.filter((a) => a.methode === "POST").length, 0);
});

test("CAR4 · Der Abdruck eines Einzelbilds bleibt byte-gleich; ein Carousel deckt alle Slides ab", async () => {
  const einzel = await contentHash({ contentId: CID, imageUrl: SLIDES[0], caption: CAPTION });
  const alt = await contentHash({ contentId: CID, imageUrl: SLIDES[0], imageUrls: [SLIDES[0]], caption: CAPTION });
  assert.equal(einzel, alt, "eine Liste mit einem Bild ist ein Einzelbild");
  const karussell = await contentHash({ contentId: CID, imageUrl: SLIDES[0], imageUrls: SLIDES, caption: CAPTION });
  assert.notEqual(einzel, karussell);
});

function projektion(item) {
  return { version: __internals.QUEUE_VERSION, source: __internals.QUEUE_SOURCE, countedFiles: false,
    activeCount: 1, generatedAt: "2026-09-29T18:00:00Z", items: [item] };
}

test("CAR5 · Die Schlange nimmt ein Carousel an und weist kaputte Slide-Listen ab", async () => {
  const h = await contentHash({ contentId: CID, imageUrl: SLIDES[0], imageUrls: SLIDES, caption: CAPTION });
  const gut = { candidateId: "cand_x", contentHash: h,
    payload: { contentId: CID, imageUrl: SLIDES[0], imageUrls: SLIDES, caption: CAPTION } };
  assert.equal(__internals.pruefeProjektion(projektion(gut)).ok, true);

  const falscheErste = JSON.parse(JSON.stringify(gut));
  falscheErste.payload.imageUrls = [SLIDES[1], SLIDES[0], SLIDES[2]];
  assert.equal(__internals.pruefeProjektion(projektion(falscheErste)).reason, "badCarousel");

  const http = JSON.parse(JSON.stringify(gut));
  http.payload.imageUrls = [SLIDES[0], "http://example.com/x.png"];
  assert.equal(__internals.pruefeProjektion(projektion(http)).reason, "badCarousel");
});

test("CAR6 · Die Karte zeigt alle Slides wischbar, dazu Story und Quellen", async () => {
  const i = { candidateId: "cand_x", contentHash: "a".repeat(64),
    payload: { contentId: CID, imageUrl: SLIDES[0], imageUrls: SLIDES, caption: CAPTION },
    carousel: { slideCount: 3,
      slides: SLIDES.map((u, n) => ({ index: n + 1, url: u, role: n ? "Einordnung" : "Cover", headline: null })),
      sources: [{ source: "CNBC", url: "https://www.cnbc.com/story", publishedAt: "2026-09-29T08:00:00Z" }],
      story: { whyInteresting: "Weil es Anleger direkt betrifft." } },
    asset: { zustand: "ASSET_PUBLICLY_REACHABLE", url: SLIDES[0], satz: "ok", erreichbar: true },
    anzeige: { hook: { value: "Eine Hook" } }, text: { captionBase: "Ein Satz zur Story. Keine Anlageberatung.",
      hashtags: ["Boerse", "KI"] }, warum: {}, guete: {} };
  const html = await candidatePage(i).text();
  SLIDES.forEach((u) => assert.ok(html.includes(u), "Slide fehlt: " + u));
  assert.match(html, /class="karussell"/);
  assert.match(html, /Slide 3 von 3/);
  assert.match(html, /https:\/\/www\.cnbc\.com\/story/);
  assert.match(html, /Weil es Anleger direkt betrifft/);
});
