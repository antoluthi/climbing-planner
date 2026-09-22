// Serveur CalDAV en lecture seule (RFC 4791 / 4918).
// Endpoint : /api/caldav/:token/  ou  /api/caldav/:token/:uid.ics
// Auth : le jeton est dans le chemin (pas d'authentification HTTP).
//
// Ce fichier commence par « _ » : ce n'est pas une route, c'est le gestionnaire
// que **deux** routes réexportent —
//   · `caldav/[...path].js`       → /api/caldav/:token
//   · `caldav/[token]/[file].js`  → /api/caldav/:token/:file
//
// Pourquoi deux, alors que le catch-all devrait suffire : en production, il ne
// matche **qu'un seul** segment. Deux segments n'atteignaient jamais la
// fonction — Vercel répondait sa propre page 404 (« NOT_FOUND ») — si bien que
// l'URL .ics de chaque séance était morte pendant que PROPFIND Depth:1 les
// publiait consciencieusement. Un client qui suit la liste ne trouve alors
// aucune de ses séances.
//
// Le gestionnaire ne fait que trois choses : trouver la ligne, décider de la
// méthode, poser les en-têtes. Tout le protocole vit dans `./_caldav.js`, qui
// n'importe rien et se teste sous Node (`npm run test:caldav`).

import { createClient } from "@supabase/supabase-js";
import {
  extractEvents, buildSingleICS, buildFullICS, etagFor, diagnose,
  parseDavRequest, buildPropfind, buildReport, uidFromHref,
  pathSegments,
} from "./_caldav.js";

// Ce qu'on sait faire. `Allow` et `Access-Control-Allow-Methods` doivent dire
// la même chose, et les deux doivent partir sur **toutes** les réponses —
// y compris les erreurs : un client qui découvre le service interroge aussi les
// chemins parents, et une réponse sans `DAV:` lui fait conclure « pas un
// serveur CalDAV ».
const METHODS = "OPTIONS, GET, HEAD, PROPFIND, REPORT";

// L'accent de la DA, au format Apple (RRGGBBAA).
const ACCENT = "#FF4500FF";

function setCommonHeaders(res) {
  res.setHeader("DAV", "1, 3, calendar-access");
  res.setHeader("Allow", METHODS);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Depth, Prefer, Accept, If-None-Match");
  res.setHeader("Access-Control-Allow-Methods", METHODS);
  res.setHeader("Access-Control-Expose-Headers", "DAV, ETag, Allow");
  res.setHeader("Cache-Control", "no-store");
}

// Le corps d'un PROPFIND / REPORT arrive soit déjà lu par le runtime (`req.body`,
// chaîne ou Buffer selon le Content-Type), soit à lire sur le flux.
async function readBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") {
    // `@vercel/node` parse le JSON ; un corps XML ne passe jamais par là, mais
    // on ne veut pas renvoyer « [object Object] » au parseur.
    return "";
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

function sendXml(res, status, body) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.status(status).send(body);
}

export default async function handler(req, res) {
  // Les en-têtes d'abord : même une erreur de jeton doit ressembler à du DAV.
  setCommonHeaders(res);

  const parts = pathSegments(req);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Lecture seule — et on le dit avec `Allow`, que le client lit pour savoir
  // quoi proposer.
  if (["PUT", "POST", "DELETE", "PATCH", "MKCALENDAR", "MKCOL", "PROPPATCH", "COPY", "MOVE", "LOCK", "UNLOCK", "ACL"].includes(req.method)) {
    res.status(405).send("This calendar is read-only");
    return;
  }
  if (!["GET", "HEAD", "PROPFIND", "REPORT"].includes(req.method)) {
    res.status(405).send("Method not allowed");
    return;
  }

  const token = parts[0];
  // 404 et non 400 : sur un chemin parent (`/api/caldav/`), la découverte de
  // service attend « rien ici », pas « ta requête est invalide ».
  if (!token || token.length < 8) {
    res.status(404).send("Calendar not found");
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(503).send("Server misconfigured — missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let rows, error;
  try {
    ({ data: rows, error } = await supabase
      .from("climbing_plans")
      .select("data, first_name, last_name, updated_at")
      .filter("data->profile->>calendarToken", "eq", token)
      .limit(1));
  } catch (e) {
    res.status(502).send("Upstream error: " + (e?.message || "unknown"));
    return;
  }

  if (error || !rows?.length) {
    res.status(404).send("Calendar not found — invalid or revoked token");
    return;
  }

  const row = rows[0];
  const planData = row.data;
  const firstName = row.first_name || planData?.profile?.firstName || "";
  const displayName = `Planning Escalade${firstName ? " — " + firstName : ""}`;
  const ctag = row.updated_at || new Date().toISOString();
  const syncToken = "urn:climbing-planner:sync:" + ctag;

  let events;
  try {
    events = extractEvents(planData);
  } catch (e) {
    // Une donnée mal formée ne doit pas faire passer le endpoint pour mort :
    // un 500 ici, et le client conclut que l'URL n'est pas un service CalDAV.
    console.error("[caldav] extractEvents failed", e);
    events = [];
  }

  const baseHref = `/api/caldav/${encodeURIComponent(token)}/`;
  // Second segment : le fichier d'un événement, ou `diag.json`. Il est encodé
  // dans les href qu'on publie, donc décodé ici avant comparaison.
  const second = parts[1] || null;

  // ── Diagnostic ──────────────────────────────────────────────────────────────
  // Des mesures, jamais du contenu. Prévu pour être ouvert dans un navigateur
  // et recopié tel quel quand un client refuse le calendrier sans dire
  // pourquoi. Protégé par le même secret que le reste — qui a l'URL a déjà
  // tout le calendrier.
  //
  // Deux orthographes, et la première existe parce que la seconde s'est perdue
  // en route : `?diag=1` sur une URL terminée par « / » passe par la réécriture
  // de `vercel.json`, et la chaîne de requête n'arrive pas jusqu'ici. Un
  // **segment de chemin** ne traverse aucune réécriture — c'est celui qu'on
  // donne à lire.
  if (req.method === "GET" && (second === "diag.json" || isTruthy(queryParam(req, "diag")))) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify({
      ...diagnose({ planData, events, baseHref, displayName, ctag, syncToken, color: ACCENT }),
      // Ce que la fonction a réellement reçu. C'est ce qui dit si la chaîne de
      // requête survit à la réécriture — le jeton est masqué, ce JSON circule.
      request: {
        method: req.method,
        url: redactToken(req.url, token),
        queryKeys: Object.keys(req.query || {}),
        sawDiagParam: queryParam(req, "diag") != null,
        via: second === "diag.json" ? "path" : "query",
      },
    }, null, 2));
    return;
  }

  const eventFile = second ? uidFromHref(second) : null;
  const event = eventFile ? events.find((e) => e.uid === eventFile) : null;

  if (eventFile && !event) {
    res.status(404).send("Event not found");
    return;
  }

  // ── GET / HEAD ──────────────────────────────────────────────────────────────
  if (req.method === "GET" || req.method === "HEAD") {
    const body = event
      ? buildSingleICS(event.uid, event.session, event.date, event.endDate)
      : buildFullICS(events, displayName);
    const etag = event
      ? etagFor(event.uid, event.session, event.date, event.endDate)
      : `"${Buffer.byteLength(body, "utf8").toString(16)}-${ctag}"`;

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("ETag", etag);
    if (!event) {
      res.setHeader("Content-Disposition", 'inline; filename="climbing-planner.ics"');
    }
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).send(req.method === "HEAD" ? "" : body);
    return;
  }

  const request = parseDavRequest(await readBody(req));

  // ── PROPFIND ────────────────────────────────────────────────────────────────
  if (req.method === "PROPFIND") {
    const depth = String(req.headers["depth"] ?? "0").trim().toLowerCase();
    sendXml(res, 207, buildPropfind({
      baseHref, displayName, ctag,
      color: ACCENT,
      events,
      depth: event ? "0" : depth,
      event,
      request,
    }));
    return;
  }

  // ── REPORT ──────────────────────────────────────────────────────────────────
  if (req.method === "REPORT") {
    // Un REPORT posé sur un .ics ne porte que sur cette ressource.
    const scope = event ? [event] : events;
    const { status, body } = buildReport({ baseHref, events: scope, request, syncToken });
    sendXml(res, status, body);
    return;
  }

  res.status(405).send("Method not allowed");
}


// Un paramètre de requête, que le runtime l'ait déjà analysé ou non.
function queryParam(req, name) {
  const v = req.query?.[name];
  if (v != null) return Array.isArray(v) ? v[0] : v;
  const qs = (req.url || "").split("?")[1];
  if (!qs) return null;
  return new URLSearchParams(qs).get(name);
}

function isTruthy(v) {
  return v != null && v !== "" && v !== "0" && String(v).toLowerCase() !== "false";
}

// Le jeton est un secret : il ne doit pas repartir dans un JSON qu'on demande à
// quelqu'un de recopier, même si c'est lui qui l'a en main.
function redactToken(url, token) {
  return String(url || "").split(token).join("<token>");
}
