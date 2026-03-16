// Vercel serverless function — GET /api/calendar/:token.ics
// Generates an iCal feed from the user's climbing plan stored in Supabase.
// The :token is a random UUID stored in data.profile.calendarToken (synced via upsert).

const { createClient } = require("@supabase/supabase-js");

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

function escapeICS(str) {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Format a JS Date as ICS floating datetime (no TZ suffix — interpreted in user's local TZ)
function toICSDateTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    "00"
  );
}

// Format a JS Date as ICS all-day date (YYYYMMDD)
function toICSDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
}

function generateICS(planData, displayName) {
  const calName = `Planning Escalade${displayName ? " — " + displayName : ""}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Climbing Planner//FR",
    `X-WR-CALNAME:${escapeICS(calName)}`,
    "X-WR-TIMEZONE:Europe/Paris",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const weeks = planData?.weeks || {};

  for (const [mondayISO, days] of Object.entries(weeks)) {
    if (!Array.isArray(days)) continue;
    // mondayISO is "YYYY-MM-DD" (the Monday of the week)
    const monday = new Date(mondayISO + "T00:00:00");

    days.forEach((daySessions, dayIndex) => {
      if (!Array.isArray(daySessions)) return;
      const date = addDays(monday, dayIndex);

      daySessions.forEach((session, sessionIndex) => {
        if (!session?.name) return;

        const uid = `climbing-${mondayISO}-d${dayIndex}-s${sessionIndex}@climbing-planner`;

        const descParts = [];
        if (session.blockType) descParts.push(session.blockType);
        if (session.duration) descParts.push(`${session.duration} min`);
        if (session.charge) descParts.push(`Charge : ${session.charge}`);
        if (session.description) descParts.push(session.description);

        lines.push("BEGIN:VEVENT");
        lines.push(`UID:${uid}`);

        if (session.startTime) {
          const [h, m] = session.startTime.split(":").map(Number);
          const startDate = new Date(date);
          startDate.setHours(h, m, 0, 0);
          lines.push(`DTSTART:${toICSDateTime(startDate)}`);

          let endDate;
          if (session.endTime) {
            const [eh, em] = session.endTime.split(":").map(Number);
            endDate = new Date(date);
            endDate.setHours(eh, em, 0, 0);
            // If end <= start (crosses midnight), add a day
            if (endDate <= startDate) endDate = addDays(endDate, 1);
          } else if (session.duration) {
            endDate = new Date(startDate.getTime() + session.duration * 60000);
          } else {
            endDate = new Date(startDate.getTime() + 3600000); // 1h default
          }
          lines.push(`DTEND:${toICSDateTime(endDate)}`);
        } else {
          // All-day event — DTEND is exclusive (next day)
          lines.push(`DTSTART;VALUE=DATE:${toICSDate(date)}`);
          lines.push(`DTEND;VALUE=DATE:${toICSDate(addDays(date, 1))}`);
        }

        lines.push(`SUMMARY:${escapeICS(session.name)}`);
        if (descParts.length) {
          lines.push(`DESCRIPTION:${escapeICS(descParts.join(" · "))}`);
        }
        lines.push("END:VEVENT");
      });
    });
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

module.exports = async function handler(req, res) {
  const { token } = req.query;

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
