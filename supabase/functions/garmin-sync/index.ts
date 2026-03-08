// Supabase Edge Function — Garmin Connect sleep sync
// Logs into Garmin Connect, fetches recent sleep data, returns parsed records.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SleepRecord {
  date: string;
  total: number; // minutes
  deep: number;
  light: number;
  rem: number;
  awake: number;
  score: number | null;
}

// ── Garmin SSO auth ───────────────────────────────────────────────────────────

async function garminLogin(email: string, password: string): Promise<string> {
  const SERVICE = "https://connect.garmin.com/modern/";
  const SSO = "https://sso.garmin.com/sso/signin";
  const UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

  const params = new URLSearchParams({
    service: SERVICE,
    webhost: "olc.garmin.com",
    source: "https://connect.garmin.com/signin/",
    redirectAfterAccountLoginUrl: SERVICE,
    redirectAfterAccountCreationUrl: SERVICE,
    gauthHost: "https://sso.garmin.com/sso",
    locale: "en_US",
    id: "gauth-widget",
    cssUrl: "https://connect.garmin.com/gauth/custom-osm-v1.css",
    clientId: "GarminConnect",
    rememberMeShown: "true",
    rememberMeChecked: "false",
    createAccountShown: "true",
    openCreateAccount: "false",
    displayNameShown: "false",
    consumeServiceTicket: "false",
    initialFocus: "true",
    embedWidget: "false",
    generateExtraServiceTicket: "true",
    generateTwoExtraServiceTickets: "false",
    generateNoServiceTicket: "false",
    mfaRequired: "false",
    performMFACheck: "false",
  });

  // Step 1 — GET login page → CSRF token + cookies
  const pageResp = await fetch(`${SSO}?${params}`, {
    headers: { "User-Agent": UA },
  });
  const html = await pageResp.text();
  const csrfMatch = html.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Could not retrieve CSRF token from Garmin login page");

  const csrf = csrfMatch[1];
  const pageCookies = (pageResp.headers.get("set-cookie") ?? "")
    .split(/,(?=[^;]+=[^;]+;)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean);

  // Step 2 — POST credentials
  const body = new URLSearchParams({
    username: email,
    password,
    embed: "false",
    _csrf: csrf,
  });

  const postResp = await fetch(`${SSO}?${params}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": pageCookies.join("; "),
      "User-Agent": UA,
      "Origin": "https://sso.garmin.com",
      "Referer": `${SSO}?${params}`,
    },
    body: body.toString(),
  });

  const postCookies = (postResp.headers.get("set-cookie") ?? "")
    .split(/,(?=[^;]+=[^;]+;)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean);

  const location = postResp.headers.get("location") ?? "";
  let ticket = location.match(/ticket=([^&]+)/)?.[1] ?? "";

  if (!ticket) {
    // Sometimes Garmin embeds the ticket in the response body
    const body2 = await postResp.text();
    ticket = body2.match(/ticket=([^"&\s<]+)/)?.[1] ?? "";
  }

  if (!ticket) throw new Error("Login failed — check Garmin credentials");

  // Step 3 — Exchange ticket for session cookies
  const allCookies = [...pageCookies, ...postCookies];
  const ticketResp = await fetch(`${SERVICE}?ticket=${ticket}`, {
    redirect: "manual",
    headers: {
      "Cookie": allCookies.join("; "),
      "User-Agent": UA,
    },
  });

  const sessionCookies = (ticketResp.headers.get("set-cookie") ?? "")
    .split(/,(?=[^;]+=[^;]+;)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean);

  return [...allCookies, ...sessionCookies].join("; ");
}

// ── Fetch sleep data ──────────────────────────────────────────────────────────

async function fetchSleep(
  cookies: string,
  startDate: string,
  endDate: string
): Promise<SleepRecord[]> {
  const UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
  const baseHeaders = {
    Cookie: cookies,
    "NK": "NT",
    "X-app-ver": "4.60.2.0",
    "User-Agent": UA,
    "DI-Backend": "connectapi.garmin.com",
  };

  // Get display name
  const profileResp = await fetch(
    "https://connect.garmin.com/modern/proxy/userprofile-service/socialProfile",
    { headers: baseHeaders }
  );
  if (!profileResp.ok) throw new Error("Could not fetch Garmin profile");
  const profile = await profileResp.json();
  const displayName: string = profile.displayName ?? profile.userName ?? "";
  if (!displayName) throw new Error("Could not resolve Garmin display name");

  // Fetch sleep list
  const sleepResp = await fetch(
    `https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailySleepData/${displayName}?startDate=${startDate}&endDate=${endDate}&nonSleepBufferMinutes=60`,
    { headers: baseHeaders }
  );
  if (!sleepResp.ok) throw new Error("Could not fetch Garmin sleep data");

  const raw = await sleepResp.json();
  const items: unknown[] = Array.isArray(raw) ? raw : raw?.dailySleepDTO ? [raw] : [];

  const toMin = (s: number | null | undefined): number =>
    s ? Math.round(s / 60) : 0;

  const records: SleepRecord[] = [];
  for (const item of items) {
    // deno-lint-ignore no-explicit-any
    const dto: any = (item as any)?.dailySleepDTO ?? item;
    if (!dto) continue;
    const date: string = dto.calendarDate ?? dto.sleepStartTimestampGMT?.slice(0, 10) ?? "";
    if (!date) continue;
    const total = toMin(dto.sleepTimeSeconds);
    if (total === 0) continue;
    records.push({
      date,
      total,
      deep:  toMin(dto.deepSleepSeconds),
      light: toMin(dto.lightSleepSeconds),
      rem:   toMin(dto.remSleepSeconds),
      awake: toMin(dto.awakeSleepSeconds),
      score: dto.sleepScores?.overall?.value ?? null,
    });
  }
  return records;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { email, password, days = 30 } = await req.json();
    if (!email || !password) throw new Error("Missing email or password");

    const endDate   = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const cookies = await garminLogin(email, password);
    const records = await fetchSleep(cookies, startDate, endDate);

    return new Response(JSON.stringify({ records }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
