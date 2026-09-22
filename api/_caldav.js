// Logique CalDAV pure — aucun accès réseau, aucune dépendance.
// La route `api/caldav/[...path].js` n'est qu'une coquille : elle lit la ligne
// Supabase et délègue ici. Tout ce qui est testable l'est depuis ce fichier
// (`npm run test:caldav`).
//
// IMPORTANT : le fichier commence par "_" → Vercel ne le traite pas comme une
// route serverless.
//
// Ce qu'un client attend (DAVx⁵, Apple Calendar, Thunderbird), et ce qui avait
// été laissé de côté dans la première version :
//
//  1. Un `<D:href>` est une URL : tout ce qui n'est pas un caractère de chemin
//     doit être **encodé**. Une séance sans identifiant produisait
//     « …/climbing-2026-09-16-pos-2-Sortie longue, allure 5:30/km.ics » — une
//     espace, une virgule, et surtout une **barre oblique** qui invente un
//     sous-dossier. Le client résout alors un href hors de la collection et
//     jette la réponse.
//  2. Un PROPFIND demande **des propriétés précises**. Répondre autre chose
//     dans un seul propstat 200 marche par chance ; ce qu'on ne connaît pas
//     doit repartir en `404 Not Found` dans un second propstat.
//  3. `<D:sync-token>` était annoncé sans que `sync-collection` ne renvoie
//     jamais de token — un client qui suit l'annonce reçoit un multistatus que
//     RFC 6578 lui interdit d'accepter. On n'annonce désormais que ce qu'on
//     sait faire (`calendar-query`, `calendar-multiget`) ; le ctag suffit à
//     dire « rien n'a changé ».
//  4. Un REPORT ne renvoie plus tout le planning quoi qu'on demande : le
//     `time-range` d'un `calendar-query` est respecté, et un
//     `calendar-multiget` ne renvoie que les href demandés. C'est ce qui borne
//     la taille de la réponse — une fonction Vercel plafonne à 4,5 Mo, et le
//     planning grossit à chaque semaine saisie.

import { buildEventDescription, getEventLocation } from "./_event-fields.js";

export const NS_DAV = "DAV:";
export const NS_CALDAV = "urn:ietf:params:xml:ns:caldav";
export const NS_CS = "http://calendarserver.org/ns/";
export const NS_APPLE = "http://apple.com/ns/ical/";

// ─── Dates ────────────────────────────────────────────────────────────────────

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const pad = (n) => String(n).padStart(2, "0");

function isoDateFrom(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// Les clés de semaine ont un jour été posées sur le dimanche au lieu du lundi.
// Des données non migrées existent encore en base : on recale à la lecture.
function migrateWeekKeys(weeks) {
  if (!weeks || typeof weeks !== "object") return {};
  const result = { ...weeks };
  Object.keys(result).forEach((k) => {
    const d = new Date(k + "T12:00:00Z");
    if (isNaN(d.getTime())) { delete result[k]; return; }
    if (d.getUTCDay() === 0) {
      const key2 = isoDateFrom(addDays(d, 1));
      if (!result[key2]) result[key2] = result[k];
      delete result[k];
    }
  });
  return result;
}

// ─── ICS ──────────────────────────────────────────────────────────────────────

function str(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// XML 1.0 n'offre **aucun** échappement pour les caractères de contrôle : un
// \x0B ou un \x1B dans une note (copié-collé d'un PDF, d'un clavier de
// téléphone, d'une appli de notes) rend le document *mal formé*. Un parseur
// strict — celui de DAVx⁵ en est un — jette alors la réponse entière au lieu
// d'ignorer le caractère fautif, et le client conclut « ce n'est pas du
// CalDAV ». Une moitié de paire de substituts (surrogate) produit le même
// effet. On les retire à la source plutôt que d'espérer qu'ils n'arrivent
// jamais : une seule note mal collée suffirait à casser toute la collection.
const XML_UNSAFE =
  // eslint-disable-next-line no-control-regex -- viser les contrôles est tout le propos
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripXmlUnsafe(s) {
  return str(s).replace(XML_UNSAFE, "");
}

export function hasXmlUnsafe(s) {
  XML_UNSAFE.lastIndex = 0;
  return XML_UNSAFE.test(str(s));
}

function escapeICS(s) {
  // Les contrôles sont retirés ici aussi : RFC 5545 ne les admet pas davantage
  // dans une valeur de propriété.
  return stripXmlUnsafe(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toICSDateTime(date) {
  return (
    date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) +
    "T" + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + "00"
  );
}

export function toICSDateTimeUTC(date) {
  return toICSDateTime(date) + "Z";
}

function toICSDate(date) {
  return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate());
}

// Repli à 75 **octets** (RFC 5545), pas 75 caractères : « é » en compte deux, et
// couper au milieu d'une séquence UTF-8 produit un fichier illisible.
function foldLine(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Ne jamais couper une séquence UTF-8 : recule sur les octets de
    // continuation (10xxxxxx).
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // les lignes suivantes perdent un octet pour l'espace de repli
  }
  return out.join("\r\n ");
}

// ─── Extraction des séances ───────────────────────────────────────────────────

// Un identifiant ICS doit traverser une URL sans dommage. On ne garde donc que
// des caractères sûrs — le reste devient « - ». Deux noms différents peuvent se
// réduire au même squelette : l'index du jour et la position dans la journée
// suffisent à les séparer.
function safeUidPart(s) {
  return str(s).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function parseISODate(value) {
  const d = new Date(str(value) + "T12:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

// Renvoie toutes les séances et échéances du planning, chacune avec un UID
// stable. Rien ici ne doit jeter : une donnée mal formée est ignorée, pas
// propagée en 500 — la fonction sert *toutes* les méthodes du endpoint.
export function extractEvents(planData) {
  const events = [];
  const seen = new Set();
  const push = (event) => {
    if (seen.has(event.uid)) return;
    seen.add(event.uid);
    events.push(event);
  };

  const weeks = migrateWeekKeys(planData?.weeks);

  for (const [mondayISO, days] of Object.entries(weeks)) {
    if (!Array.isArray(days)) continue;
    const monday = parseISODate(mondayISO);
    if (!monday) continue;

    days.forEach((daySessions, dayIndex) => {
      if (!Array.isArray(daySessions)) return;
      const date = addDays(monday, dayIndex);
      const dateISO = isoDateFrom(date);

      daySessions.forEach((session, slotIndex) => {
        if (!session || typeof session !== "object" || !session.name) return;
        // UID stable sur (date + id + horaire) — replie les vrais doublons
        // (même modèle posé deux fois au même horaire). Sans identifiant, on
        // retombe sur la position, qui reste déterministe.
        const baseId = safeUidPart(session.id) || `pos-${dayIndex}-${slotIndex}`;
        const startTime = str(session.startTime);
        const slot = startTime ? `t${startTime.replace(/:/g, "")}` : "allday";
        const uid = `climbing-${dateISO}-${baseId}-${safeUidPart(slot)}@climbing-planner`;
        push({ uid, session, date, endDate: null });
      });
    });
  }

  const quickSessions = Array.isArray(planData?.quickSessions) ? planData.quickSessions : [];
  quickSessions.forEach((qs, i) => {
    if (!qs || typeof qs !== "object" || !qs.name || !qs.startDate) return;
    const startDate = parseISODate(qs.startDate);
    if (!startDate) return;
    const endDate = qs.endDate && qs.endDate !== qs.startDate ? parseISODate(qs.endDate) : null;
    const baseId = safeUidPart(qs.id) || `${safeUidPart(qs.startDate)}-${i}`;
    const uid = `climbing-quick-${baseId}@climbing-planner`;
    // Garde tous les champs (discipline, chargePlanned, notes…) pour que
    // buildEventDescription puisse s'en servir.
    const session = {
      ...qs,
      startTime: qs.allDay ? null : (qs.startTime || null),
      endTime:   qs.allDay ? null : (qs.endTime   || null),
      duration:  qs.allDay ? null : (qs.duration  || null),
      isQuick: true,
      isObjective: !!qs.isObjective,
    };
    push({ uid, session, date: startDate, endDate });
  });

  return events;
}

// ─── Bornes d'un événement ────────────────────────────────────────────────────

function eventEnd(session, date, endDateOverride, startDate, h, m) {
  const endTime = str(session.endTime);
  if (endDateOverride) {
    const end = new Date(endDateOverride);
    if (endTime) {
      const [eh, em] = endTime.split(":").map(Number);
      end.setUTCHours(eh || 0, em || 0, 0, 0);
    } else {
      end.setUTCHours(h + 1, m, 0, 0);
    }
    return end;
  }
  if (endTime) {
    const [eh, em] = endTime.split(":").map(Number);
    let end = new Date(date);
    end.setUTCHours(eh || 0, em || 0, 0, 0);
    if (end <= startDate) end = addDays(end, 1);
    return end;
  }
  const minutes = Number(session.duration) || Number(session.estimatedTime) || 0;
  if (minutes > 0) return new Date(startDate.getTime() + minutes * 60000);
  return new Date(startDate.getTime() + 3600000);
}

// Début / fin d'un événement, pour le filtre `time-range`. Une séance sans
// heure occupe la journée entière.
export function eventBounds({ session, date, endDate }) {
  const startTime = str(session.startTime);
  if (startTime) {
    const [h, m] = startTime.split(":").map(Number);
    const start = new Date(date);
    start.setUTCHours(h || 0, m || 0, 0, 0);
    return { start, end: eventEnd(session, date, endDate, start, h || 0, m || 0) };
  }
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = addDays(endDate || date, 1);
  end.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

// ─── Génération ICS ───────────────────────────────────────────────────────────

export function buildVEVENT(uid, session, date, endDateOverride) {
  const now = toICSDateTimeUTC(new Date());
  const description = buildEventDescription(session);
  const location = getEventLocation(session);

  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${now}`];
  const startTime = str(session.startTime);

  if (startTime) {
    const [h, m] = startTime.split(":").map(Number);
    const startDate = new Date(date);
    startDate.setUTCHours(h || 0, m || 0, 0, 0);
    lines.push(`DTSTART:${toICSDateTime(startDate)}`);
    lines.push(`DTEND:${toICSDateTime(eventEnd(session, date, endDateOverride, startDate, h || 0, m || 0))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${toICSDate(date)}`);
    // DTEND est exclusif → dernier jour + 1
    lines.push(`DTEND;VALUE=DATE:${toICSDate(addDays(endDateOverride || date, 1))}`);
  }

  lines.push(`SUMMARY:${escapeICS(session.name || session.title || "Séance")}`);
  if (location) lines.push(`LOCATION:${escapeICS(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);
  lines.push("END:VEVENT");

  return lines.map(foldLine).join("\r\n");
}

export function buildSingleICS(uid, session, date, endDate) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TractoPlanner//FR",
    "CALSCALE:GREGORIAN",
    buildVEVENT(uid, session, date, endDate),
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}

export function buildFullICS(events, displayName) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TractoPlanner//FR",
    `X-WR-CALNAME:${escapeICS(displayName)}`,
    "X-WR-TIMEZONE:Europe/Paris",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const { uid, session, date, endDate } of events) {
    lines.push(buildVEVENT(uid, session, date, endDate));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// ─── ETag ─────────────────────────────────────────────────────────────────────

// L'ETag doit bouger dès que le .ics change : il couvre donc tout ce que
// buildVEVENT met dans l'événement, pas seulement le nom et l'heure. Sinon un
// client ne rapatrie jamais une note corrigée.
export function etagFor(uid, session, date, endDate) {
  const src = [
    uid, session.name, session.title, session.startTime, session.endTime,
    session.duration, session.estimatedTime, getEventLocation(session),
    buildEventDescription(session),
    date ? toICSDate(date) : "", endDate ? toICSDate(endDate) : "",
  ].map(str).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `"${(h >>> 0).toString(16)}"`;
}

// ─── XML ──────────────────────────────────────────────────────────────────────

export function xe(s) {
  return stripXmlUnsafe(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Un `<D:href>` est une URL : le segment doit être encodé. `encodeURIComponent`
// échappe aussi « / », ce qu'on veut ici — un nom de séance ne doit pas inventer
// de sous-dossier.
export function hrefFor(baseHref, uid) {
  return baseHref + encodeURIComponent(uid + ".ics");
}

function attrValue(attrs, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

function decodeXmlText(s) {
  return str(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// « 20260914T183000Z » → Date. Renvoie null si illisible.
export function parseICSInstant(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(str(value));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  return isNaN(d.getTime()) ? null : d;
}

// Lit un corps de requête WebDAV sans dépendance XML. On n'a besoin que du nom
// de l'élément racine, des propriétés demandées, des href d'un multiget et du
// time-range d'un calendar-query — un scanner de balises suffit, et il ne peut
// pas jeter sur un corps mal formé.
export function parseDavRequest(body) {
  const xml = str(body);
  const out = {
    root: null, allprop: false, propname: false,
    props: [], hrefs: [], timeRange: null, syncToken: null,
  };
  if (!xml.trim()) return out;

  // { préfixe → namespace } ; « xmlns » seul = namespace par défaut.
  const nsOf = new Map([["", ""]]);
  let inProp = false;

  const tagRe = /<(\/?)([A-Za-z_][\w.-]*)(?::([A-Za-z_][\w.-]*))?((?:\s[^<>]*?)?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(xml)) !== null) {
    const closing = m[1] === "/";
    const prefix = m[3] ? m[2] : "";
    const local = m[3] || m[2];
    const attrs = m[4] || "";
    const selfClosing = m[5] === "/";

    if (!closing) {
      const nsRe = /xmlns(?::([A-Za-z_][\w.-]*))?\s*=\s*"([^"]*)"/g;
      let a;
      while ((a = nsRe.exec(attrs)) !== null) nsOf.set(a[1] || "", a[2]);
    }
    const ns = nsOf.get(prefix) ?? "";

    if (closing) {
      if (local === "prop" && ns === NS_DAV) inProp = false;
      continue;
    }
    if (!out.root) out.root = { ns, local };

    if (ns === NS_DAV && local === "allprop") out.allprop = true;
    else if (ns === NS_DAV && local === "propname") out.propname = true;
    else if (ns === NS_DAV && local === "prop") inProp = !selfClosing;
    else if (inProp) out.props.push({ ns, local });
    else if (ns === NS_DAV && local === "href" && !selfClosing) {
      const close = xml.indexOf("<", tagRe.lastIndex);
      out.hrefs.push(decodeXmlText(xml.slice(tagRe.lastIndex, close < 0 ? undefined : close)).trim());
    } else if (ns === NS_CALDAV && local === "time-range") {
      out.timeRange = {
        start: parseICSInstant(attrValue(attrs, "start")),
        end: parseICSInstant(attrValue(attrs, "end")),
      };
    } else if (ns === NS_DAV && local === "sync-token" && !selfClosing) {
      const close = xml.indexOf("<", tagRe.lastIndex);
      out.syncToken = decodeXmlText(xml.slice(tagRe.lastIndex, close < 0 ? undefined : close)).trim();
    }
  }
  return out;
}

// ─── Propriétés ───────────────────────────────────────────────────────────────

// Le jeu renvoyé à un `allprop`, ou à un client qui n'envoie pas de corps.
const COLLECTION_ALLPROP = [
  [NS_DAV, "resourcetype"], [NS_DAV, "displayname"],
  [NS_DAV, "current-user-principal"], [NS_DAV, "principal-URL"], [NS_DAV, "owner"],
  [NS_DAV, "current-user-privilege-set"], [NS_DAV, "supported-report-set"],
  [NS_CALDAV, "calendar-home-set"], [NS_CALDAV, "supported-calendar-component-set"],
  [NS_CALDAV, "supported-calendar-data"], [NS_CALDAV, "calendar-description"],
  [NS_CS, "getctag"], [NS_APPLE, "calendar-color"],
];

// `getcontentlength` n'est **pas** dans le jeu par défaut : le mesurer oblige à
// fabriquer le .ics complet de chaque séance, pour n'en garder qu'un nombre.
// Sur un PROPFIND Depth:1 sans corps — donc allprop — c'est tout le planning
// rendu en pure perte. La propriété reste servie à qui la demande nommément.
const EVENT_ALLPROP = [
  [NS_DAV, "resourcetype"], [NS_DAV, "getcontenttype"], [NS_DAV, "getetag"],
];

const PREFIX = new Map([[NS_DAV, "D"], [NS_CALDAV, "C"], [NS_CS, "CS"], [NS_APPLE, "A"]]);

function tagName(ns, local) {
  const p = PREFIX.get(ns);
  return p ? `${p}:${local}` : local;
}

// Valeur d'une propriété de la collection, ou null si on ne l'a pas.
function collectionProp(ns, local, ctx) {
  const { baseHref, displayName, ctag, color } = ctx;
  const href = `<D:href>${xe(baseHref)}</D:href>`;
  if (ns === NS_DAV) {
    switch (local) {
      case "resourcetype": return "<D:collection/><C:calendar/>";
      case "displayname": return xe(displayName);
      // La collection est son propre principal : il n'y a qu'un compte par
      // jeton, et rien à découvrir au-dessus.
      case "current-user-principal":
      case "principal-URL":
      case "owner": return href;
      // Lecture seule, et le client doit le savoir : sans cette propriété,
      // certains clients proposent d'y écrire puis échouent en 405.
      case "current-user-privilege-set":
        return "<D:privilege><D:read/></D:privilege>"
             + "<D:privilege><D:read-current-user-privilege-set/></D:privilege>";
      // On n'annonce que ce qu'on sait faire. `sync-collection` en faisait
      // partie sans jamais renvoyer de sync-token : un client qui suivait
      // l'annonce recevait une réponse invalide au sens de RFC 6578.
      case "supported-report-set":
        return "<D:supported-report><D:report><C:calendar-query/></D:report></D:supported-report>"
             + "<D:supported-report><D:report><C:calendar-multiget/></D:report></D:supported-report>";
      case "getcontenttype": return "text/calendar; charset=utf-8";
      default: return null;
    }
  }
  if (ns === NS_CALDAV) {
    switch (local) {
      case "calendar-home-set": return href;
      case "supported-calendar-component-set": return '<C:comp name="VEVENT"/>';
      case "supported-calendar-data": return '<C:calendar-data content-type="text/calendar" version="2.0"/>';
      case "calendar-description": return xe(displayName);
      default: return null;
    }
  }
  if (ns === NS_CS && local === "getctag") return xe(ctag);
  if (ns === NS_APPLE && local === "calendar-color") return xe(color);
  return null;
}

function icsOf(ctx) {
  if (ctx._ics == null) {
    ctx._ics = buildSingleICS(ctx.event.uid, ctx.event.session, ctx.event.date, ctx.event.endDate);
  }
  return ctx._ics;
}

function eventProp(ns, local, ctx) {
  const { event, baseHref } = ctx;
  if (ns === NS_DAV) {
    switch (local) {
      case "resourcetype": return "";
      case "getcontenttype": return "text/calendar; charset=utf-8; component=VEVENT";
      case "getetag": return xe(etagFor(event.uid, event.session, event.date, event.endDate));
      case "getcontentlength": return String(Buffer.byteLength(icsOf(ctx), "utf8"));
      case "displayname": return xe(event.session.name || event.session.title || "");
      case "owner": return `<D:href>${xe(baseHref)}</D:href>`;
      default: return null;
    }
  }
  if (ns === NS_CALDAV && local === "calendar-data") return xe(icsOf(ctx));
  return null;
}

// Un `<D:response>` complet : ce qu'on a en 200, ce qu'on n'a pas en 404. C'est
// cette séparation qui manquait — tout repartait en 200, y compris les
// propriétés qu'on ne connaît pas.
function buildResponse(href, requested, resolve, ctx, propname) {
  const found = [];
  const missing = [];
  for (const [ns, local] of requested) {
    if (propname) { found.push(`<${tagName(ns, local)}/>`); continue; }
    const value = resolve(ns, local, ctx);
    if (value == null) missing.push(`<${tagName(ns, local)}/>`);
    else if (value === "") found.push(`<${tagName(ns, local)}/>`);
    else found.push(`<${tagName(ns, local)}>${value}</${tagName(ns, local)}>`);
  }
  const propstats = [];
  if (found.length || !missing.length) {
    propstats.push(`    <D:propstat>
      <D:prop>
        ${found.join("\n        ")}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>`);
  }
  if (missing.length) {
    propstats.push(`    <D:propstat>
      <D:prop>
        ${missing.join("\n        ")}
      </D:prop>
      <D:status>HTTP/1.1 404 Not Found</D:status>
    </D:propstat>`);
  }
  return `  <D:response>
    <D:href>${xe(href)}</D:href>
${propstats.join("\n")}
  </D:response>`;
}

function multistatus(responses, extra = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="${NS_DAV}" xmlns:C="${NS_CALDAV}" xmlns:CS="${NS_CS}" xmlns:A="${NS_APPLE}">
${responses.join("\n")}${extra}
</D:multistatus>
`;
}

// ─── PROPFIND ─────────────────────────────────────────────────────────────────

/**
 * @param {object}      o
 * @param {string}      o.baseHref href de la collection, toujours terminé par « / »
 * @param {string}      o.depth    "0" | "1" | "infinity"
 * @param {object|null} o.event    ressource visée, ou null pour la collection
 */
export function buildPropfind({ baseHref, displayName, ctag, color, events, depth, event, request }) {
  const req = request || {};
  const propname = !!req.propname;
  // Pas de corps, ou `allprop` : on renvoie le jeu utile. C'est le cas de
  // beaucoup de clients, dont `curl -X PROPFIND` sans corps.
  const wantsAll = propname || req.allprop || !req.props?.length;
  const asked = (fallback) => (wantsAll ? fallback : req.props.map((p) => [p.ns, p.local]));

  if (event) {
    return multistatus([
      buildResponse(hrefFor(baseHref, event.uid), asked(EVENT_ALLPROP), eventProp, { event, baseHref }, propname),
    ]);
  }

  const ctx = { baseHref, displayName, ctag, color };
  const responses = [buildResponse(baseHref, asked(COLLECTION_ALLPROP), collectionProp, ctx, propname)];

  if (depth === "1" || depth === "infinity") {
    for (const e of events) {
      responses.push(
        buildResponse(hrefFor(baseHref, e.uid), asked(EVENT_ALLPROP), eventProp, { event: e, baseHref }, propname)
      );
    }
  }
  return multistatus(responses);
}

// ─── REPORT ───────────────────────────────────────────────────────────────────

// Le href d'un multiget est une URL encodée : on la ramène à l'UID.
export function uidFromHref(href) {
  const path = str(href).split("?")[0];
  const last = path.split("/").filter(Boolean).pop() || "";
  let decoded = last;
  try { decoded = decodeURIComponent(last); } catch { /* href non encodé */ }
  return decoded.replace(/\.ics$/i, "");
}

export function inTimeRange(event, range) {
  if (!range || (!range.start && !range.end)) return true;
  const { start, end } = eventBounds(event);
  if (range.start && end <= range.start) return false;
  if (range.end && start >= range.end) return false;
  return true;
}

/**
 * Renvoie { status, body } — 207 pour les rapports qu'on annonce, 403
 * `supported-report` pour les autres (RFC 3253 § 3.1.5).
 */
export function buildReport({ baseHref, events, request, syncToken }) {
  const req = request || {};
  const root = req.root?.local || "calendar-query";
  const propname = !!req.propname;
  const wantsAll = propname || req.allprop || !req.props?.length;
  // Sans `<D:prop>`, un client veut au minimum de quoi identifier la ressource.
  const requested = wantsAll
    ? [[NS_DAV, "getetag"], [NS_CALDAV, "calendar-data"]]
    : req.props.map((p) => [p.ns, p.local]);

  let selected;
  if (root === "calendar-multiget") {
    // On ne renvoie que ce qui est demandé — c'est ce qui borne la réponse une
    // fois la première synchro passée.
    const wanted = new Set(req.hrefs.map(uidFromHref));
    selected = events.filter((e) => wanted.has(e.uid));
  } else if (root === "calendar-query") {
    selected = events.filter((e) => inTimeRange(e, req.timeRange));
  } else if (root === "sync-collection") {
    selected = events;
  } else {
    return {
      status: 403,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<D:error xmlns:D="${NS_DAV}"><D:supported-report/></D:error>
`,
    };
  }

  const responses = selected.map((event) =>
    buildResponse(hrefFor(baseHref, event.uid), requested, eventProp, { event, baseHref }, propname)
  );

  // Un href demandé qu'on ne connaît plus : RFC 4791 veut un 404 explicite,
  // c'est ce qui dit au client que l'événement a été supprimé.
  if (root === "calendar-multiget") {
    const known = new Set(selected.map((e) => e.uid));
    for (const href of req.hrefs) {
      const uid = uidFromHref(href);
      if (!uid || known.has(uid)) continue;
      responses.push(`  <D:response>
    <D:href>${xe(hrefFor(baseHref, uid))}</D:href>
    <D:status>HTTP/1.1 404 Not Found</D:status>
  </D:response>`);
    }
  }

  // RFC 6578 : un multistatus de sync-collection **doit** porter le token. Son
  // absence est ce qui rendait l'ancienne réponse inexploitable.
  const extra = root === "sync-collection"
    ? `\n  <D:sync-token>${xe(syncToken)}</D:sync-token>`
    : "";

  return { status: 207, body: multistatus(responses, extra) };
}

// ─── Diagnostic ───────────────────────────────────────────────────────────────

// `GET …/?diag=1` — de quoi comprendre une panne côté client sans avoir à se
// faire dicter au téléphone le contenu d'une réponse de 2 Mo.
//
// Ce que ça rend : des **mesures**, jamais du contenu. Pas de nom de séance,
// pas de note, pas de lieu. Les seuls textes renvoyés sont des UID signalés
// comme problématiques — et un UID voyage déjà dans chaque href que le
// calendrier publie.
//
// Ce que ça répond, dans l'ordre où on se pose les questions :
//   · la ligne est-elle trouvée, et le blob est-il énorme ?
//   · combien de séances en sortent ?
//   · quelle taille fait chaque réponse, et en combien de temps ?
//     (une fonction Vercel plafonne à 4,5 Mo)
//   · reste-t-il un href qui ne survit pas à un aller-retour d'URL ?
//   · une note contient-elle un caractère que XML interdit ?
export function diagnose({ planData, events, baseHref, displayName, ctag, syncToken, color }) {
  const timed = (fn) => {
    const t0 = Date.now();
    let bytes = null;
    let error = null;
    try {
      bytes = Buffer.byteLength(fn(), "utf8");
    } catch (e) {
      error = String(e?.message || e);
    }
    return { bytes, ms: Date.now() - t0, ...(error ? { error } : {}) };
  };

  const ctx = { baseHref, displayName, ctag, color, events };
  const allProps = { props: [], allprop: true, hrefs: [] };
  const since = new Date(Date.now() - 90 * 86400000);

  // Un href doit traverser une URL et en revenir identique. C'est le test qui
  // aurait attrapé « …/Sortie longue, allure 5:30/km.ics » du premier coup.
  const badHrefs = [];
  for (const e of events) {
    const href = hrefFor(baseHref, e.uid);
    const outside = !href.startsWith(baseHref);
    const nested = href.slice(baseHref.length).includes("/");
    const roundTrip = uidFromHref(href) === e.uid;
    let parses = true;
    try { new URL(href, "https://example.test"); } catch { parses = false; }
    if (outside || nested || !roundTrip || !parses) {
      badHrefs.push({ uid: e.uid, outside, nested, roundTrip, parses });
    }
  }

  // Caractères interdits par XML dans ce que les séances apportent. On compte,
  // on ne recopie pas.
  let unsafeFields = 0;
  for (const e of events) {
    for (const v of Object.values(e.session || {})) {
      if (typeof v === "string" && hasXmlUnsafe(v)) unsafeFields++;
    }
  }

  let blobBytes = null;
  try { blobBytes = Buffer.byteLength(JSON.stringify(planData ?? null), "utf8"); } catch { /* cyclique */ }

  const weeks = planData?.weeks && typeof planData.weeks === "object" ? Object.keys(planData.weeks).length : 0;

  return {
    ok: true,
    row: { found: true, blobBytes, weeks, quickSessions: Array.isArray(planData?.quickSessions) ? planData.quickSessions.length : 0, ctag },
    events: {
      count: events.length,
      withStartTime: events.filter((e) => str(e.session?.startTime)).length,
      allDay: events.filter((e) => !str(e.session?.startTime)).length,
      earliest: events.length ? events.map((e) => isoDateFrom(e.date)).sort()[0] : null,
      latest: events.length ? events.map((e) => isoDateFrom(e.date)).sort().slice(-1)[0] : null,
    },
    responses: {
      icsFeed: timed(() => buildFullICS(events, displayName)),
      propfind0: timed(() => buildPropfind({ ...ctx, depth: "0", request: allProps })),
      propfind1: timed(() => buildPropfind({ ...ctx, depth: "1", request: allProps })),
      reportAll: timed(() => buildReport({ baseHref, events, request: { root: { ns: NS_CALDAV, local: "calendar-query" }, props: [], hrefs: [] }, syncToken }).body),
      report90d: timed(() => buildReport({ baseHref, events, request: { root: { ns: NS_CALDAV, local: "calendar-query" }, props: [], hrefs: [], timeRange: { start: since, end: null } }, syncToken }).body),
    },
    hrefs: { bad: badHrefs.length, sample: badHrefs.slice(0, 5) },
    xml: { unsafeFields },
    limits: { vercelPayloadBytes: 4_500_000 },
  };
}
