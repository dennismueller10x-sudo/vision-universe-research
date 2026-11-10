/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/scripts/browser-live-qa.mjs

   Ende-zu-Ende im echten Browser: /ask/ auf der Live-Seite, Frage tippen,
   Antwort muss als Ergebnis erscheinen (keine Warnkarte, kein Haengen).
   Laeuft im Deploy-Teil frage-worker mit liveTest. Die Frage ist die des
   Live-Tests, kommt also kostenlos aus dem Archiv des Workers.

   env: SITE_URL, RESEARCH_ACCESS_PASSWORD (Seitenschranke),
        VU_ASK_ACCESS (Zugang zur Fragefunktion, im Workflow der Admin-Key),
        QA_OUT (Bildschirmfotos), NODE_PATH (playwright)
   Gibt nie Schluessel aus.
   ========================================================================= */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { accessStateFor, verifierForKey, STORAGE_KEY } from "../../../scripts/access-gate/build.mjs";

const require = createRequire(import.meta.url);
const pw = require("playwright");
const origin = (process.env.SITE_URL || "https://research.visionuniverse.de").replace(/\/+$/, "");
const out = process.env.QA_OUT || "/tmp/ask-live-qa";
const password = process.env.RESEARCH_ACCESS_PASSWORD;
const askAccess = process.env.VU_ASK_ACCESS;
if (!password) throw Error("RESEARCH_ACCESS_PASSWORD fehlt");
if (!askAccess) throw Error("VU_ASK_ACCESS fehlt");
await mkdir(out, { recursive: true });

export const CHART_QUESTION = "NVIDIA nächste Unterstützung im Chart";
export const QUESTION = "äh zeig mir mal alle Aktien mit neuem Jahreshoch zwischen 300 Millionen und 2 Milliarden, die ins Minervini Raster passen, und den Quant Score";

const browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.setDefaultTimeout(60000);
  const gate = await (await page.request.get(origin + "/__research/config.json")).json();
  const state = accessStateFor(password);
  assert.equal(verifierForKey(state.key), gate.verifier, "Seitenpasswort passt nicht zur Schranke");
  await page.addInitScript(({ key, state, ask }) => {
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem("vu-ask-access", ask);
    localStorage.setItem("vu-ask-read", "0");
  }, { key: gate.storageKey || STORAGE_KEY, state, ask: askAccess });

  const asked = page.waitForResponse((r) => /\/v1\/ask$/.test(new URL(r.url()).pathname) && r.request().method() === "POST", { timeout: 60000 });
  await page.goto(origin + "/ask/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea");
  await page.fill("textarea", QUESTION);
  await page.keyboard.press("Enter");
  const res = await asked;
  const body = await res.json().catch(() => null);
  console.log("Worker:", res.status(), body && (body.ok ? "ok, Quelle " + body.source + ", Status " + body.status : body.reason + " " + (body.code || "")));
  assert.equal(res.status(), 200, "Worker-Antwort");
  await page.waitForSelector(".ak-answer .ak-count, .ak-card-warn", { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + "/ask-website.png", fullPage: true });
  const warn = await page.locator(".ak-turn .ak-card-warn h3").allTextContents();
  const count = await page.locator(".ak-answer .ak-count").first().innerText().catch(() => "");
  const chips = await page.locator(".ak-answer .ak-rc").allInnerTexts();
  console.log("Ergebnis:", count.replace(/\s+/g, " "), "| Regeln:", chips.map((c) => c.replace(/[×\s]+$/g, "").trim()).join(" · "));
  assert.ok(count, "Ergebniszahl sichtbar (Warnkarten: " + warn.join(", ") + ")");
  await page.screenshot({ path: out + "/ask-website.png", fullPage: true });

  /* Zweite Frage: Chartbild-Antwort (Kopf, Preisleiter, eine Pflichtzeile). Kostet beim ersten Mal unter 1 Cent, danach Archiv. */
  const asked2 = page.waitForResponse((r) => /\/v1\/ask$/.test(new URL(r.url()).pathname) && r.request().method() === "POST", { timeout: 60000 });
  await page.goto(origin + "/ask/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea");
  await page.fill("textarea", CHART_QUESTION);
  await page.keyboard.press("Enter");
  const res2 = await asked2;
  assert.equal(res2.status(), 200, "Worker-Antwort Chartbild");
  await page.waitForSelector(".ak-cb-card, .ak-card-warn", { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + "/ask-chartbild.png", fullPage: true });
  const head = await page.locator(".ak-cb-card .ak-cb-head").first().innerText().catch(() => "");
  const ladder = await page.locator(".ak-cb-card .ak-ladder").count();
  const legal = await page.locator(".ak-cb-card .ak-cb-legal").count();
  const heads = await page.locator(".ak-hd .ak-anstop-pill:not([hidden]), .ak-anstop:not([hidden])").count();
  console.log("Chartbild:", head || "(kein Kopf)", "| Preisleiter:", ladder, "| Pflichtzeile:", legal, "| Kopfzeilen mit Herkunft:", heads);
  assert.ok(head, "Chartbild-Kopf sichtbar");
  assert.ok(ladder >= 1 && legal >= 1, "Preisleiter und Pflichtzeile");
  assert.deepEqual(errors, [], "keine Skriptfehler");
  console.log("Browser-Test /ask/: bestanden");
} finally {
  await browser.close();
}
