/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/src/claude.mjs

   DER EINE AUFRUF AN DIE CLAUDE-API

   Ohne SDK, wie jeder andere Anbieter-Client in diesem Repository (siehe
   scripts/market/storage/s3-driver.mjs): eine einzige POST-Anfrage an
   /v1/messages. Die Antwort ist durch Structured Outputs an OUTPUT_SCHEMA
   gebunden; Denken ist bei Haiku 4.5 ohne ausdrueckliche Anforderung aus,
   die Ausgabe also kurz und planbar.

   Der Schluessel bleibt im Worker. Er erreicht nie den Browser und steht
   nie in einer Fehlermeldung.
   ========================================================================= */
import { SYSTEM_PROMPT, OUTPUT_SCHEMA } from "./catalog.mjs";

export const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 25000;

export function buildRequest({ model, question, maxOutputTokens }) {
  return {
    model,
    max_tokens: maxOutputTokens,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: question }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  };
}

export function promptChars(question) { return SYSTEM_PROMPT.length + JSON.stringify(OUTPUT_SCHEMA).length + question.length; }

/**
 * @returns {Promise<{ok:true, output:object, usage:object}
 *                  |{ok:false, error:string, billed:boolean|null, usage?:object}>}
 *   billed: true = berechnet, false = sicher nicht berechnet,
 *           null = unbekannt (Zeitueberschreitung, Verbindungsabbruch)
 */
export async function interpret({ apiKey, model, question, maxOutputTokens, fetchImpl = fetch }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(buildRequest({ model, question, maxOutputTokens })),
      signal: ctrl.signal,
    });
  } catch (e) {
    return { ok: false, error: "UPSTREAM_UNREACHABLE", billed: null };
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) {
    /* Abgelehnte Anfragen (4xx/5xx) berechnet Anthropic nicht. 400 mit
       "credit balance" heisst: das Prepaid-Guthaben ist leer - genau die
       Sicherung, die greifen soll. */
    const type = body && body.error && body.error.type;
    return { ok: false, error: res.status === 429 ? "UPSTREAM_RATE_LIMIT" : "UPSTREAM_" + (type || res.status), billed: false };
  }
  const usage = body && body.usage;
  if (!body || body.stop_reason === "refusal") return { ok: false, error: "REFUSED", billed: true, usage };
  if (body.stop_reason === "max_tokens") return { ok: false, error: "TRUNCATED", billed: true, usage };
  const block = (body.content || []).find((b) => b.type === "text");
  try {
    return { ok: true, output: JSON.parse(block.text), usage };
  } catch (e) {
    return { ok: false, error: "UNPARSEABLE", billed: true, usage };
  }
}
