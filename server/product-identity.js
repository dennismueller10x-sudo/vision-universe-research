"use strict";

function symbol(value) {
  const result = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9.-]{1,12}$/.test(result) ? result : null;
}

function shardKey(value) {
  return String(value).replace(/[^A-Z0-9]/g, "_").slice(0, 2).padEnd(2, "_");
}

async function defaultLoader(path) {
  if (typeof globalThis.__VU_IDENTITY_TEST_LOADER === "function") return globalThis.__VU_IDENTITY_TEST_LOADER(path);
  const origin = String(process.env.VU_PUBLIC_DATA_ORIGIN || "https://research.visionuniverse.de").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) throw new Error("INVALID_ORIGIN");
  const response = await fetch(origin + "/" + path.replace(/^\/+/, ""), { headers: { Accept: "application/json" }, redirect: "error" });
  if (!response.ok) throw new Error("IDENTITY_SOURCE_UNREACHABLE");
  return response.json();
}

async function resolveIdentity(ref, { loadJSON = defaultLoader } = {}) {
  const requested = symbol(ref && (ref.ticker || ref.symbol));
  const requestedId = ref && (ref.securityId || ref.instrumentId);
  if (!requested && !requestedId) return { state: "INVALID_IDENTITY", identity: null };
  if (!requested) return { state: "INVALID_IDENTITY", identity: null };
  let shard;
  try {
    shard = await loadJSON("quant/data/universe/instruments/" + shardKey(requested) + ".json");
  } catch {
    return { state: "SOURCE_MISSING", identity: null };
  }
  const candidates = (shard.instruments || []).filter((row) => row.symbol === requested);
  const row = requestedId
    ? candidates.find((item) => item.instrumentId === requestedId || (item.legacyIds || []).includes(requestedId))
    : candidates.find((item) => item.primaryListing) || candidates[0];
  if (!row) return { state: "SYMBOL_NOT_SUPPORTED", identity: null };
  if (row.productEligibility !== "ELIGIBLE" || !row.masterMemberId) {
    return { state: "NOT_ELIGIBLE", identity: null };
  }
  if (!/^vu_[a-f0-9]+$/.test(row.instrumentId) || !(row.legacyIds || []).includes(row.masterMemberId)) {
    return { state: "INVALID_IDENTITY", identity: null };
  }
  if (row.cik && (row.issuerId !== "iss_cik_" + row.cik || !/^\d{10}$/.test(row.cik))) {
    return { state: "INVALID_IDENTITY", identity: null };
  }
  return {
    state: "AVAILABLE",
    identity: {
      securityId: row.instrumentId,
      instrumentId: row.instrumentId,
      masterMemberId: row.masterMemberId,
      issuerId: row.issuerId || null,
      cik: row.cik || null,
      ticker: row.symbol,
      name: row.companyName || row.symbol,
      productEligibility: row.productEligibility
    }
  };
}

module.exports = { resolveIdentity, shardKey, symbol };
