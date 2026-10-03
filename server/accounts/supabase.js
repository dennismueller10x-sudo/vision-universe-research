"use strict";

/* =========================================================================
   Minimaler Supabase-Client (Auth + PostgREST) in reinem Node.

   Wie beim S3-Treiber bewusst ohne Paket: wir brauchen vier Aufrufe
   (User zum Token, select, upsert, update) plus das Loeschen eines Users.

   Der Service-Key umgeht Row-Level-Security. Er existiert nur in der
   Server-Umgebung und erscheint in keiner Antwort und keinem Log.
   ========================================================================= */

class SupabaseError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function createSupabase({ url, anonKey, serviceKey, fetchImpl = globalThis.fetch }) {
  if (!url || !anonKey || !serviceKey) throw new SupabaseError("SUPABASE_NOT_CONFIGURED", 0);
  const service = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };

  async function call(path, { method = "GET", headers = {}, body } = {}) {
    const res = await fetchImpl(url + path, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await res.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); } catch { data = null; }
    }
    return { status: res.status, ok: res.ok, data };
  }

  return {
    /* Prueft ein Zugriffstoken direkt bei Supabase Auth. Das ist teurer als
       eine lokale JWT-Pruefung, erkennt aber auch abgemeldete Sitzungen. */
    async getUser(accessToken) {
      if (!accessToken) return null;
      const res = await call("/auth/v1/user", { headers: { apikey: anonKey, Authorization: "Bearer " + accessToken } });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new SupabaseError("AUTH_UNAVAILABLE", res.status);
      return res.data && typeof res.data.id === "string" ? res.data : null;
    },

    async select(table, query) {
      const res = await call("/rest/v1/" + table + "?" + new URLSearchParams(query).toString(), { headers: service });
      if (!res.ok) throw new SupabaseError("SELECT_FAILED:" + table, res.status);
      return Array.isArray(res.data) ? res.data : [];
    },

    /* onConflict: Spaltenliste. ignoreDuplicates: vorhandene Zeile unveraendert lassen.
       Gibt die tatsaechlich geschriebenen Zeilen zurueck (bei ignore: leer, wenn Dublette). */
    async upsert(table, rows, { onConflict, ignoreDuplicates = false } = {}) {
      const query = onConflict ? "?on_conflict=" + encodeURIComponent(onConflict) : "";
      const res = await call("/rest/v1/" + table + query, {
        method: "POST",
        headers: { ...service, Prefer: "return=representation,resolution=" + (ignoreDuplicates ? "ignore" : "merge") + "-duplicates" },
        body: rows
      });
      if (!res.ok) throw new SupabaseError("UPSERT_FAILED:" + table, res.status);
      return Array.isArray(res.data) ? res.data : [];
    },

    /* PostgREST liefert hoechstens max-rows Zeilen (Supabase: 1000) - also seitenweise. */
    async selectAll(table, query, pageSize = 1000) {
      const rows = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = await this.select(table, { ...query, limit: String(pageSize), offset: String(offset) });
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    },

    async getUserById(userId) {
      const res = await call("/auth/v1/admin/users/" + encodeURIComponent(userId), { headers: service });
      if (res.status === 404) return null;
      if (!res.ok) throw new SupabaseError("GET_USER_FAILED", res.status);
      return res.data && typeof res.data.id === "string" ? res.data : null;
    },

    async update(table, query, patch) {
      const res = await call("/rest/v1/" + table + "?" + new URLSearchParams(query).toString(), {
        method: "PATCH", headers: { ...service, Prefer: "return=minimal" }, body: patch
      });
      if (!res.ok) throw new SupabaseError("UPDATE_FAILED:" + table, res.status);
    },

    async deleteUser(userId) {
      const res = await call("/auth/v1/admin/users/" + encodeURIComponent(userId), { method: "DELETE", headers: service });
      if (!res.ok && res.status !== 404) throw new SupabaseError("DELETE_USER_FAILED", res.status);
    }
  };
}

module.exports = { createSupabase, SupabaseError };
