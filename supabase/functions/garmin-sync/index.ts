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

// ── Cookie helpers ─────────────────────────────────────────────────────────────

// Extract name=value pairs from Set-Cookie headers.
// Uses getSetCookie() (Deno 1.37+ / modern runtime) to get ALL headers correctly,
// falling back to manual comma-splitting which is unreliable with expires dates.
function extractCookies(headers: Headers): string[] {
  // deno-lint-ignore no-explicit-any
  const raw: string[] = typeof (headers as any).getSetCookie === "function"
    // deno-lint-ignore no-explicit-any
    ? (headers as any).getSetCookie()
    : (headers.get("set-cookie") ?? "").split(/,(?=[^;]+=[^;]+;|[^;]+=)/);
  return raw.map((c) => c.split(";")[0].trim()).filter(Boolean);
}

// Merge cookie jars — newer values override older ones by name
function mergeCookies(existing: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();
  for (const c of [...existing, ...incoming]) {
    const name = c.split("=")[0].trim();
    if (name) map.set(name, c);
  }
  return Array.from(map.values());
}

// ── Garmin SSO auth ───────────────────────────────────────────────────────────

async function garminLogin(email: string, password: string): Promise<string> {
  const SERVICE = "https://connect.garmin.com/modern/";
  const SSO = "https://sso.garmin.com/sso/signin";
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  let cookieJar = extractCookies(pageResp.headers);

  // Step 2 — POST credentials
  const formBody = new URLSearchParams({
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
      "Cookie": cookieJar.join("; "),
      "User-Agent": UA,
      "Origin": "https://sso.garmin.com",
      "Referer": `${SSO}?${params}`,
    },
    body: formBody.toString(),
  });

  cookieJar = mergeCookies(cookieJar, extractCookies(postResp.headers));

  const location = postResp.headers.get("location") ?? "";
  let ticket = location.match(/ticket=([^&]+)/)?.[1] ?? "";

  if (!ticket) {
    const body2 = await postResp.text();
    ticket = body2.match(/ticket=([^"&\s<]+)/)?.[1] ?? "";
  }

  if (!ticket) throw new Error("Login failed — check Garmin credentials");

  // Step 3 — Follow all redirects to collect all session cookies
  let nextUrl = `${SERVICE}?ticket=${ticket}`;

  for (let i = 0; i < 6; i++) {
    const resp = await fetch(nextUrl, {
      redirect: "manual",
      headers: {
        "Cookie": cookieJar.join("; "),
        "User-Agent": UA,
      },
    });
    cookieJar = mergeCookies(cookieJar, extractCookies(resp.headers));
    if (resp.status === 200 || resp.status === 204) break;
    const loc = resp.headers.get("location");
    if (!loc) break;
    nextUrl = loc.startsWith("http") ? loc : `https://connect.garmin.com${loc}`;
  }

  return cookieJar.join("; ");
}

// ── Fetch sleep data ──────────────────────────────────────────────────────────

async function fetchSleep(
  cookies: string,
  startDate: string,
  endDate: string
): Promise<SleepRecord[]> {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const baseHeaders = {
    Cookie: cookies,
    "NK": "NT",
    "X-app-ver": "4.60.2.0",
    "User-Agent": UA,
    "DI-Backend": "connectapi.garmin.com",
  };

  // Helper: parse JSON only if response is actually JSON
  async function safeJson(resp: Response): Promise<unknown | null> {
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    try { return await resp.json(); } catch { return null; }
  }

  // Get display name — try multiple endpoints
  let displayName = "";

  const profileResp = await fetch(
    "https://connect.garmin.com/modern/proxy/userprofile-service/socialProfile",
    { headers: baseHeaders }
  );
  if (profileResp.ok) {
    // deno-lint-ignore no-explicit-any
    const profile = await safeJson(profileResp) as any;
    displayName = profile?.displayName ?? profile?.userName ?? "";
  }

  if (!displayName) {
    const settingsResp = await fetch(
      "https://connect.garmin.com/modern/proxy/userprofile-service/userprofile",
      { headers: baseHeaders }
    );
    if (settingsResp.ok) {
      // deno-lint-ignore no-explicit-any
      const settings = await safeJson(settingsResp) as any;
      displayName = settings?.displayName ?? settings?.userName ?? "";
    }
  }

  if (!displayName) {
    throw new Error(
      `Could not resolve Garmin display name — session invalide ? (profile HTTP ${profileResp.status})`
    );
  }

  // Fetch sleep list
  const sleepResp = await fetch(
    `https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailySleepData/${displayName}?startDate=${startDate}&endDate=${endDate}&nonSleepBufferMinutes=60`,
    { headers: baseHeaders }
  );
  if (!sleepResp.ok) {
    throw new Error(`Could not fetch Garmin sleep data (${sleepResp.status})`);
  }

  const raw = await safeJson(sleepResp) as unknown;
  // deno-lint-ignore no-explicit-any
  const rawAny = raw as any;
  const items: unknown[] = Array.isArray(rawAny) ? rawAny : rawAny?.dailySleepDTO ? [rawAny] : [];

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
