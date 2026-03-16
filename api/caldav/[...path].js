// Vercel serverless function — CalDAV server (read-only)
// RFC 4791 — minimal CalDAV calendar access
// Endpoint: /api/caldav/:token/  or  /api/caldav/:token/:uid.ics
// Auth: token in URL path (no HTTP Basic Auth needed)

import { createClient } from "@supabase/supabase-js";

// ─── Date helpers ──────────────────────────────────────────────────────────────

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function migrateWeekKeys(weeks) {
  if (!weeks) return weeks;
  const result = { ...weeks };
  Object.keys(result).forEach((k) => {
    const d = new Date(k + "T12:00:00Z");
    if (d.getUTCDay() === 0) {
      const corrected = addDays(d, 1);
      const pad = (n) => String(n).padStart(2, "0");
      const key2 = `${corrected.getUTCFullYear()}-${pad(corrected.getUTCMonth() + 1)}-${pad(corrected.getUTCDate())}`;
      if (!result[key2]) result[key2] = result[k];
      delete result[k];
    }
  });
  return result;
}

// ─── ICS formatters ───────────────────────────────────────────────────────────

function escapeICS(str) {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toICSDateTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    "00"
  );
}

function toICSDateTimeUTC(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    "00Z"
  );
}

function toICSDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate())
  );
}

function foldLine(line) {
  const MAX = 75;
  if (line.length <= MAX) return line;
  let result = "";
  let pos = 0;
  while (pos < line.length) {
    if (pos === 0) {
      result += line.slice(0, MAX);
      pos = MAX;
    } else {
      result += "\r\n " + line.slice(pos, pos + MAX - 1);
      pos += MAX - 1;
    }
  }
  return result;
}

// ─── Event extraction ─────────────────────────────────────────────────────────

function extractEvents(planData) {
  const events = [];
  const weeks = migrateWeekKeys(planData?.weeks || {});

  for (const [mondayISO, days] of Object.entries(weeks)) {
    if (!Array.isArray(days)) continue;
    const monday = new Date(mondayISO + "T12:00:00Z");

    days.forEach((daySessions, dayIndex) => {
      if (!Array.isArray(daySessions)) return;
      const date = addDays(monday, dayIndex);

      daySessions.forEach((session, sessionIndex) => {
        if (!session?.name) return;
        const uid = `climbing-${mondayISO}-d${dayIndex}-s${sessionIndex}@climbing-planner`;
        events.push({ uid, session, date });
      });
    });
  }

  return events;
}

// ─── ICS generation ───────────────────────────────────────────────────────────

function buildVEVENT(uid, session, date) {
  const now = toICSDateTimeUTC(new Date());
  const descParts = [];
  if (session.blockType) descParts.push(session.blockType);
  if (session.duration) descParts.push(`${session.duration} min`);
  if (session.charge) descParts.push(`Charge : ${session.charge}`);
  if (session.description) descParts.push(session.description);

  const lines = [];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${now}`);

  if (session.startTime) {
    const [h, m] = session.startTime.split(":").map(Number);
    const startDate = new Date(date);
    startDate.setUTCHours(h, m, 0, 0);
    lines.push(`DTSTART:${toICSDateTime(startDate)}`);

    let endDate;
    if (session.endTime) {
      const [eh, em] = session.endTime.split(":").map(Number);
      endDate = new Date(date);
      endDate.setUTCHours(eh, em, 0, 0);
      if (endDate <= startDate) endDate = addDays(endDate, 1);
    } else if (session.duration) {
      endDate = new Date(startDate.getTime() + session.duration * 60000);
    } else {
      endDate = new Date(startDate.getTime() + 3600000);
    }
    lines.push(`DTEND:${toICSDateTime(endDate)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${toICSDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${toICSDate(addDays(date, 1))}`);
  }

  lines.push(`SUMMARY:${escapeICS(session.name)}`);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${escapeICS(descParts.join(" · "))}`);
  }
  lines.push("END:VEVENT");

  return lines.map(foldLine).join("\r\n");
}

function buildSingleICS(uid, session, date) {
  const vevent = buildVEVENT(uid, session, date);
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Climbing Planner//FR",
      "CALSCALE:GREGORIAN",
      vevent,
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n"
  );
}

function buildFullICS(events, displayName) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Climbing Planner//FR",
    `X-WR-CALNAME:${escapeICS(displayName)}`,
    "X-WR-TIMEZONE:Europe/Paris",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const { uid, session, date } of events) {
    lines.push(buildVEVENT(uid, session, date));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// ─── ETag ─────────────────────────────────────────────────────────────────────

function etagFor(uid, session) {
  const src = uid + (session.name || "") + (session.startTime || "") + (session.duration || "");
  let h = 0;
  for (let i = 0; i < src.length; i++) {
    h = Math.imul(31, h) + src.charCodeAt(i);
    h |= 0;
  }
  return `"${(h >>> 0).toString(16)}"`;
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

function xe(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── CalDAV XML responses ─────────────────────────────────────────────────────

function xmlPropfindCollection(href, displayName, ctag) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/">
  <D:response>
    <D:href>${xe(href)}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>
          <D:collection/>
          <C:calendar/>
        </D:resourcetype>
        <D:displayname>${xe(displayName)}</D:displayname>
        <D:current-user-principal>
          <D:href>${xe(href)}</D:href>
        </D:current-user-principal>
        <C:calendar-home-set>
          <D:href>${xe(href)}</D:href>
        </C:calendar-home-set>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
        </C:supported-calendar-component-set>
        <CS:getctag>${xe(ctag)}</CS:getctag>
        <D:sync-token>${xe("urn:climbing-planner:sync:" + ctag)}</D:sync-token>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
}

function xmlPropfindCollectionDepth1(baseHref, displayName, ctag, events) {
  const collectionEntry = `  <D:response>
    <D:href>${xe(baseHref)}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:displayname>${xe(displayName)}</D:displayname>
        <CS:getctag>${xe(ctag)}</CS:getctag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;

  const eventEntries = events
    .map(({ uid, session }) => {
      const etag = etagFor(uid, session);
      return `  <D:response>
    <D:href>${xe(baseHref + uid + ".ics")}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:getcontenttype>text/calendar; charset=utf-8</D:getcontenttype>
        <D:getetag>${xe(etag)}</D:getetag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/">
${collectionEntry}
${eventEntries}
</D:multistatus>`;
}

function xmlPropfindEvent(href, etag) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>${xe(href)}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:getcontenttype>text/calendar; charset=utf-8</D:getcontenttype>
        <D:getetag>${xe(etag)}</D:getetag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
}

function xmlReport(baseHref, events) {
  const entries = events
    .map(({ uid, session, date }) => {
      const etag = etagFor(uid, session);
      const ics = buildSingleICS(uid, session, date);
      return `  <D:response>
    <D:href>${xe(baseHref + uid + ".ics")}</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>${xe(etag)}</D:getetag>
        <C:calendar-data>${xe(ics)}</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
${entries}
</D:multistatus>`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { path: pathParts } = req.query;
  const parts = Array.isArray(pathParts)
    ? pathParts
    : pathParts
    ? [pathParts]
    : [];

  const token = parts[0];
  if (!token || token.length < 8) {
    res.status(400).send("Missing or invalid token");
    return;
  }

  // Common headers for all responses
  res.setHeader("DAV", "1, 3, calendar-access");
  res.setHeader("Allow", "OPTIONS, GET, HEAD, PROPFIND, REPORT");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Depth, Prefer, Accept"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "OPTIONS, GET, HEAD, PROPFIND, REPORT"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Write methods → 405 read-only
  if (["PUT", "DELETE", "MKCALENDAR", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "OPTIONS, GET, HEAD, PROPFIND, REPORT");
    res.status(405).send("This calendar is read-only");
    return;
  }

  // Connect to Supabase with service role key
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    res.status(503).send("Server misconfigured — missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("climbing_plans")
    .select("data, first_name, last_name, updated_at")
    .filter("data->profile->>calendarToken", "eq", token)
    .limit(1);

  if (error || !rows?.length) {
    res.status(404).send("Calendar not found — invalid or revoked token");
    return;
  }

  const planData = rows[0].data;
  const firstName =
    rows[0].first_name || planData?.profile?.firstName || "";
  const displayName = `Planning Escalade${firstName ? " — " + firstName : ""}`;
  const ctag = rows[0].updated_at || new Date().toISOString();

  const events = extractEvents(planData);

  // Base collection href (always ends with /)
  const baseHref = `/api/caldav/${token}/`;

  // Second path segment: event file (e.g. "climbing-2026-03-09-d0-s0@climbing-planner.ics")
  const eventFile = parts[1] || null;

  // ── GET / HEAD ────────────────────────────────────────────────────────────
  if (req.method === "GET" || req.method === "HEAD") {
    if (eventFile) {
      const uid = eventFile.replace(/\.ics$/i, "");
      const event = events.find((e) => e.uid === uid);
      if (!event) {
        res.status(404).send("Event not found");
        return;
      }
      const icsContent = buildSingleICS(event.uid, event.session, event.date);
      const etag = etagFor(event.uid, event.session);
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).send(req.method === "HEAD" ? "" : icsContent);
    } else {
      // Collection GET → full ICS feed (fallback for iCal clients)
      const icsContent = buildFullICS(events, displayName);
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="climbing-planner.ics"`
      );
      res.setHeader("Cache-Control", "no-cache");
      res.status(200).send(req.method === "HEAD" ? "" : icsContent);
    }
    return;
  }

  // ── PROPFIND ──────────────────────────────────────────────────────────────
  if (req.method === "PROPFIND") {
    const depth = (req.headers["depth"] || "0").trim();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    if (eventFile) {
      const uid = eventFile.replace(/\.ics$/i, "");
      const event = events.find((e) => e.uid === uid);
      if (!event) {
        res.status(404).send("Not found");
        return;
      }
      const etag = etagFor(event.uid, event.session);
      const href = `${baseHref}${event.uid}.ics`;
      res.status(207).send(xmlPropfindEvent(href, etag));
    } else if (depth === "1") {
      res
        .status(207)
        .send(
          xmlPropfindCollectionDepth1(baseHref, displayName, ctag, events)
        );
    } else {
      res.status(207).send(xmlPropfindCollection(baseHref, displayName, ctag));
    }
    return;
  }

  // ── REPORT ────────────────────────────────────────────────────────────────
  if (req.method === "REPORT") {
    // We ignore the filter body and return all events
    // (calendar clients will apply any date-range filtering on their side)
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.status(207).send(xmlReport(baseHref, events));
    return;
  }

  res.status(405).send("Method not allowed");
}
