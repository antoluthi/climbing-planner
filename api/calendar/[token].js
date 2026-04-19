// Vercel serverless function — GET /api/calendar/:token.ics
// Generates an iCal feed from the user's climbing plan stored in Supabase.
// The :token is a random UUID stored in data.profile.calendarToken (synced via upsert).

import { createClient } from "@supabase/supabase-js";

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Mirror of the frontend migrateWeekKeys: correct keys that were stored as
// UTC midnight of the local Monday (off-by-one for UTC+ users).
// A Sunday key (getDay() === 0 at noon UTC) is the tell-tale sign.
function migrateWeekKeys(weeks) {
  if (!weeks) return weeks;
  const result = { ...weeks };
  Object.keys(result).forEach(k => {
    const d = new Date(k + "T12:00:00Z"); // noon UTC → unambiguous date
    if (d.getUTCDay() === 0) { // Sunday = stored as UTC midnight of local Monday
      const corrected = addDays(d, 1);
      const pad = n => String(n).padStart(2, "0");
      const key2 = `${corrected.getUTCFullYear()}-${pad(corrected.getUTCMonth() + 1)}-${pad(corrected.getUTCDate())}`;
      if (!result[key2]) result[key2] = result[k];
      delete result[k];
    }
  });
  return result;
}

function escapeICS(str) {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Format a JS Date as ICS floating datetime (no TZ suffix — interpreted in user's local TZ).
// We use UTC getters because on the server all dates are constructed in UTC.
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

// Format a JS Date as UTC ICS datetime (for DTSTAMP — always UTC)
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

// Fold ICS lines longer than 75 octets (RFC 5545 §3.1)
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

// Format a JS Date as ICS all-day date (YYYYMMDD). Uses UTC getters.
function toICSDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate());
}

function isoDateFrom(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function writeEvent(lines, uid, session, date, now, endDateOverride) {
  const descParts = [];
  if (session.blockType) descParts.push(session.blockType);
  if (session.duration) descParts.push(`${session.duration} min`);
  if (session.charge) descParts.push(`Charge : ${session.charge}`);
  if (session.description) descParts.push(session.description);

  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${uid}`);
  lines.push(`DTSTAMP:${now}`);

  if (session.startTime) {
    const [h, m] = session.startTime.split(":").map(Number);
    const startDate = new Date(date);
    startDate.setUTCHours(h, m, 0, 0);
    lines.push(`DTSTART:${toICSDateTime(startDate)}`);

    let endDate;
    if (endDateOverride) {
      endDate = new Date(endDateOverride);
      if (session.endTime) {
        const [eh, em] = session.endTime.split(":").map(Number);
        endDate.setUTCHours(eh, em, 0, 0);
      } else {
        endDate.setUTCHours(h + 1, m, 0, 0);
      }
    } else if (session.endTime) {
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
    const lastDay = endDateOverride || date;
    lines.push(`DTEND;VALUE=DATE:${toICSDate(addDays(lastDay, 1))}`);
  }

  lines.push(`SUMMARY:${escapeICS(session.name)}`);
  if (session.address) lines.push(`LOCATION:${escapeICS(session.address)}`);
  if (descParts.length) lines.push(`DESCRIPTION:${escapeICS(descParts.join(" · "))}`);
  lines.push("END:VEVENT");
}

function generateICS(planData, displayName) {
  const calName = `Planning Escalade${displayName ? " — " + displayName : ""}`;
  const now = toICSDateTimeUTC(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Climbing Planner//FR",
    `X-WR-CALNAME:${escapeICS(calName)}`,
    "X-WR-TIMEZONE:Europe/Paris",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const seen = new Set();
  const writeIfNew = (uid, session, date, endDate) => {
    if (seen.has(uid)) return;
    seen.add(uid);
    writeEvent(lines, uid, session, date, now, endDate);
  };

  const weeks = migrateWeekKeys(planData?.weeks || {});

  for (const [mondayISO, days] of Object.entries(weeks)) {
    if (!Array.isArray(days)) continue;
    const monday = new Date(mondayISO + "T12:00:00Z");

    days.forEach((daySessions, dayIndex) => {
      if (!Array.isArray(daySessions)) return;
      const date = addDays(monday, dayIndex);
      const dateISO = isoDateFrom(date);

      daySessions.forEach((session) => {
        if (!session?.name) return;
        const baseId = session.id || `pos-${dayIndex}-${session.name}`;
        const slot = session.startTime ? `t${session.startTime.replace(":", "")}` : "allday";
        const uid = `climbing-${dateISO}-${baseId}-${slot}@climbing-planner`;
        writeIfNew(uid, session, date);
      });
    });
  }

  // Séances personnalisées (quickSessions)
  const quickSessions = Array.isArray(planData?.quickSessions) ? planData.quickSessions : [];
  quickSessions.forEach((qs) => {
    if (!qs?.name || !qs.startDate) return;
    const startDate = new Date(qs.startDate + "T12:00:00Z");
    if (isNaN(startDate.getTime())) return;
    const endDate = qs.endDate && qs.endDate !== qs.startDate
      ? new Date(qs.endDate + "T12:00:00Z")
      : null;
    const uid = `climbing-quick-${qs.id || qs.startDate + "-" + qs.name}@climbing-planner`;
    const session = {
      id: qs.id,
      name: qs.name,
      startTime: qs.allDay ? null : (qs.startTime || null),
      endTime: qs.allDay ? null : (qs.endTime || null),
      duration: qs.allDay ? null : (qs.duration || null),
      description: qs.content || null,
      address: qs.location || null,
    };
    writeIfNew(uid, session, startDate, endDate && !isNaN(endDate.getTime()) ? endDate : null);
  });

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export default async function handler(req, res) {
  let { token } = req.query;
  // Strip .ics extension if present (Vercel includes it in the path param)
  if (token) token = token.replace(/\.ics$/i, "");

  if (!token || token.length < 8) {
    res.status(400).send("Invalid token");
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    res.status(503).send("Server misconfigured — missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Look up the user by calendarToken stored in the JSONB data column
  const { data: rows, error } = await supabase
    .from("climbing_plans")
    .select("data, first_name, last_name")
    .filter("data->profile->>calendarToken", "eq", token)
    .limit(1);

  if (error || !rows?.length) {
    res.status(404).send("Calendar not found — the link may be invalid or revoked");
    return;
  }

  const planData = rows[0].data;
  const firstName = rows[0].first_name || planData?.profile?.firstName || "";

  const icsContent = generateICS(planData, firstName);

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="climbing-planner.ics"`);
  res.setHeader("Cache-Control", "no-cache, no-store, max-age=0");
  res.status(200).send(icsContent);
};
