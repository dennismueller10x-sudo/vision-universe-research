/* =========================================================================
   vision-universe-social — src/approval.js
   DAS TOR DES APPROVAL CENTERS

   -------------------------------------------------------------------------
   WAS HIER ENTSCHIEDEN WIRD — UND WAS AUSDRUECKLICH NICHT
   -------------------------------------------------------------------------

   Hier entscheidet sich, WER hereinkommt. Nicht, was er sieht, und nicht,
   was daraufhin passiert. Die Warteschlange, die Karte und der Weg zur
   Veroeffentlichung kommen aus Bausteinen, die es bereits gibt:

     die kanonische Zustandsmaschine  social/engines/owner-decision.js
     der Veroeffentlichungspfad       handlePublish in index.js

   Das Approval Center baut keine zweite Warteschlange und keine zweite
   Veroeffentlichung. Es ist die Owner-Oberflaeche VOR einem bewiesenen
   Pfad, nicht neben ihm.

   -------------------------------------------------------------------------
   WARUM DIESE ROUTEN VOR DEM ADMIN-TOR LIEGEN
   -------------------------------------------------------------------------

   Der Router in index.js stellt `requireAdmin` vor alles, was nach dem
   OAuth-Callback kommt. Das ist richtig fuer Endpunkte, die von
   Skripten und Workflows aufgerufen werden — und unbrauchbar fuer einen
   Browser: `requireAdmin` liest nur `Authorization: Bearer` und `?key=`,
   und ein Telefon kann weder das eine mitschicken noch das andere
   benutzen, ohne den Schluessel in die Adresszeile zu schreiben.

   Deshalb liegen `/approval*` VOR diesem Tor und bringen ihr EIGENES
   mit: `requireOwnerSession`. Vor heisst hier nicht offener, sondern
   anders verschlossen.

   DIE WICHTIGE FOLGE, UND SIE IST BEABSICHTIGT: die Sitzung oeffnet
   ausschliesslich `/approval*`. Sie kann `/social/meta/*` nicht
   erreichen — nicht weil es verboten waere, sondern weil `requireAdmin`
   gar kein Cookie liest. Ein Cookie, das den Admin-Schluessel ersetzt,
   waere eine Rechteausweitung durch eine Bequemlichkeit; ein Cookie, das
   nur eine Tuer oeffnet, ist eine Tuer.

   -------------------------------------------------------------------------
   FAIL CLOSED
   -------------------------------------------------------------------------

   Jeder Pfad unter `/approval`, der hier nicht ausdruecklich genannt
   ist, endet verschlossen — nicht bei der 404 des allgemeinen Routers.
   Eine 404 hinter einem Tor sagt "diesen Weg gibt es nicht"; eine 404
   VOR dem Tor saegt daran, ohne es zu merken, und jede kuenftige Route
   unter /approval waere bis zu ihrer eigenen Pruefung offen.
   ========================================================================= */

import {
  createSession, sessionFromRequest, clearSessionCookie, timingSafeEqual
} from "./session.js";
import { signInPage, approvalResponse, landingPage, alterInWorten } from "./approval-ui.js";
import { readQueue } from "./store.js";

const MIN_ADMIN_KEY_LENGTH = 32;

/* ------------------------------------------------------------------ */
/* Das Tor                                                             */
/* ------------------------------------------------------------------ */

/**
 * Prueft die Owner-Sitzung.
 *
 * @returns { ok: true } oder { ok: false, reason, response }
 *
 * `response` ist bewusst schon fertig: ein Aufrufer, der selbst
 * entscheiden muesste, was eine fehlende Sitzung bedeutet, koennte es
 * auch vergessen.
 */
export async function requireOwnerSession(request, env, options = {}) {
  const sitzung = await sessionFromRequest(request, env, options);
  if (sitzung.valid) return { ok: true, reason: null };

  /* Der Grund faerbt nur den Satz auf der Anmeldeseite. Er sagt nichts
     darueber, ob es etwas zu sehen gaebe. */
  const grund = sitzung.reason === "expired" ? "expired"
    : sitzung.reason === "noSession" ? "noSession"
    : "invalid";

  return {
    ok: false,
    reason: sitzung.reason,
    /* Eine abgelaufene oder verfaelschte Sitzung wird beim Abweisen
       geloescht. Sonst traegt der Browser sie bei jedem Versuch weiter
       mit, und der Owner sieht dieselbe Seite, ohne zu verstehen,
       warum seine Anmeldung nicht greift. */
    response: signInPage(grund, sitzung.reason === "noSession"
      ? {} : { "set-cookie": clearSessionCookie() })
  };
}

/* ------------------------------------------------------------------ */
/* Die Anmeldung                                                       */
/* ------------------------------------------------------------------ */

/**
 * Liest den Schluessel aus dem RUMPF — nie aus der URL.
 *
 * Zwei Formen, weil zwei Aufrufer: das Formular des Telefons schickt
 * `application/x-www-form-urlencoded`, ein Test oder ein Skript
 * schickt JSON. Beide legen den Wert in den Rumpf; keine legt ihn in
 * die Adresszeile.
 */
async function schluesselAusRumpf(request) {
  const typ = String(request.headers.get("content-type") || "").toLowerCase();
  try {
    if (typ.includes("application/json")) {
      const body = await request.json();
      return String((body && body.adminKey) || "").trim();
    }
    const form = await request.formData();
    return String(form.get("adminKey") || "").trim();
  } catch (err) {
    return "";
  }
}

/**
 * Tauscht den Admin-Schluessel gegen eine Sitzung.
 *
 * Dass der Schluessel im Rumpf steht und nicht in der URL, ist kein
 * Stilfrage: eine Adresszeile landet im Verlauf, im Screenshot, im
 * Zugriffsprotokoll des Proxys und in jedem Referrer, den die Seite je
 * erzeugt. Ein Rumpf landet in keinem davon.
 */
export async function handleApprovalSession(request, env, options = {}) {
  const erwartet = env.VU_SOCIAL_ADMIN_KEY;

  /* Ohne konfigurierten Schluessel gibt es keine Anmeldung — und
     ausdruecklich auch keinen Notzugang. Ein Worker ohne Schluessel ist
     zu, nicht offen. */
  if (!erwartet || String(erwartet).length < MIN_ADMIN_KEY_LENGTH) {
    return approvalResponse("Nicht konfiguriert", `
<h1>Nicht konfiguriert</h1>
<p class="leise">Auf diesem Worker ist kein Owner-Schluessel hinterlegt.
Ohne ihn gibt es keine Anmeldung und keine Freigabe.</p>`, 503);
  }

  const gegeben = await schluesselAusRumpf(request);

  if (!gegeben || !timingSafeEqual(gegeben, String(erwartet))) {
    /* Keine Auskunft darueber, ob der Schluessel fehlte oder falsch
       war — und keine darueber, ob etwas wartet. */
    return signInPage("wrongKey");
  }

  const sitzung = await createSession(erwartet, options);

  /* 303 und nicht 200: nach einem POST soll im Browser eine GET-Adresse
     stehen. Sonst bietet ein Neuladen an, das Formular noch einmal zu
     senden — mit dem Schluessel darin. */
  return new Response(null, {
    status: 303,
    headers: {
      location: "/approval",
      "set-cookie": sitzung.cookie,
      "cache-control": "no-store, private",
      "referrer-policy": "no-referrer"
    }
  });
}

/** Beendet die Sitzung auf diesem Geraet. */
export function handleApprovalLogout() {
  return signInPage("signedOut", { "set-cookie": clearSessionCookie() });
}

/* ------------------------------------------------------------------ */
/* Der Router unter /approval                                          */
/* ------------------------------------------------------------------ */

/**
 * @returns Response, oder null wenn der Pfad nicht hierher gehoert.
 *
 * Null heisst "nicht meine Route" und NICHT "nicht gefunden": der
 * Aufrufer laeuft dann weiter durch den normalen Router. Alles, was mit
 * `/approval` beginnt, beantwortet diese Funktion selbst — auch das,
 * was es nicht gibt.
 */
export async function routeApproval(request, url, env, options = {}) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/approval" && !path.startsWith("/approval/")) return null;

  const methode = request.method;

  /* --------------------------------------------------- Ohne Sitzung */

  if (path === "/approval/session") {
    if (methode !== "POST") {
      /* Ein GET auf die Anmeldung ist kein Fehler, sondern der
         haeufigste Weg hierher: jemand laedt nach dem Abmelden neu.
         Er bekommt das Formular. */
      return signInPage("noSession");
    }
    return await handleApprovalSession(request, env, options);
  }

  if (path === "/approval/logout") {
    /* Nur POST. Ein GET waere ueber ein fremdes Bild ausloesbar — das
       ist harmlos gegenueber einer Freigabe, aber es ist trotzdem
       jemand anderes, der den Owner abmeldet. */
    if (methode !== "POST") return signInPage("noSession");
    return handleApprovalLogout();
  }

  /* ---------------------------------------------------- Mit Sitzung */

  const tor = await requireOwnerSession(request, env, options);
  if (!tor.ok) return tor.response;

  if (path === "/approval") {
    if (methode !== "GET") {
      return approvalResponse("Nicht erlaubt", `
<h1>Nicht erlaubt</h1>
<p class="leise">Diese Adresse wird gelesen, nicht beschrieben.</p>`, 405);
    }
    return await handleApprovalIndex(request, url, env, options);
  }

  /* Alles Weitere unter /approval ist noch nicht gebaut — und bleibt
     bis dahin verschlossen statt durchzufallen. */
  return approvalResponse("Nicht gefunden", `
<h1>Nicht gefunden</h1>
<p class="leise">Diese Adresse gehoert nicht zum Approval Center.</p>`, 404);
}

/* ------------------------------------------------------------------ */

/* -------------------------------------------------------------------------
   AB WANN EIN STAND ALT IST

   Der Orchestrator laeuft zweimal taeglich. Ein Stand, der aelter ist
   als das, kann keinen Lauf gesehen haben - dann ist entweder der
   Scheduler stehengeblieben oder die Uebertragung gescheitert.

   Vierzehn Stunden lassen einem Lauf Luft, ohne einen ausgefallenen zu
   uebersehen.
   ------------------------------------------------------------------------- */
const STAND_ALT_MS = 14 * 60 * 60 * 1000;

/**
 * Die Startseite hinter der Anmeldung.
 *
 * Sie LIEST die Projektion und rechnet nichts nach. `anzahl` ist
 * `activeCount` aus der kanonischen Zustandsmaschine - nicht die Laenge
 * der Kartenliste. Die beiden koennen auseinanderfallen, und dann ist
 * genau das die Nachricht, die der Owner braucht.
 */
async function handleApprovalIndex(request, url, env, options = {}) {
  const schlange = env.VU_SOCIAL_KV ? await readQueue(env) : null;

  if (!schlange) {
    /* KEINE UEBERTRAGUNG ist nicht KEINE WARTESCHLANGE. Die beiden als
       dasselbe anzuzeigen waere die bequemste Luege dieser Oberflaeche:
       sie saehe aus wie Ruhe und waere Blindheit. */
    return landingPage({ anzahl: null });
  }

  const jetzt = options.now === undefined ? Date.now() : options.now;
  const gebaut = Date.parse(schlange.generatedAt);
  const alterMs = Number.isNaN(gebaut) ? null : jetzt - gebaut;

  return landingPage({
    anzahl: schlange.activeCount,
    items: (schlange.items || []).map((i) => ({
      candidateId: i.candidateId,
      thema: i.anzeige && i.anzeige.thema ? i.anzeige.thema.value : null,
      hook: i.anzeige && i.anzeige.hook ? i.anzeige.hook.value : null
    })),
    held: schlange.held || [],
    decided: schlange.decided || [],
    alter: alterMs === null ? null : alterInWorten(alterMs),
    veraltet: alterMs !== null && alterMs > STAND_ALT_MS
  });
}

export { STAND_ALT_MS };

export { MIN_ADMIN_KEY_LENGTH };
