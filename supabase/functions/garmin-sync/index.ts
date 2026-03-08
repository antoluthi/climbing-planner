// Supabase Edge Function — Garmin Connect sleep sync
// Auth flow: SSO login → OAuth1 preauthorized token → OAuth2 bearer token → API

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Garmin Connect app consumer credentials (used by all open-source clients)
const CONSUMER_KEY    = "fc3e99d2-118c-44b8-914d-3f01d98a0e04";
const CONSUMER_SECRET = "E08WAR897WH6-610JD474-1JJ7344TJ8X";

interface SleepRecord {
  date: string;
  total: number;
  deep: number;
  light: number;
  rem: number;
  awake: number;
  score: number | null;
}

// ── Crypto helpers ─────────────────────────────────────────────────────────────

async function hmacSha1(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}


// ── Cookie helpers ─────────────────────────────────────────────────────────────

function extractCookies(headers: Headers): string[] {
  // deno-lint-ignore no-explicit-any
  const raw: string[] = typeof (headers as any).getSetCookie === "function"
    // deno-lint-ignore no-explicit-any
    ? (headers as any).getSetCookie()
    : (headers.get("set-cookie") ?? "").split(/,(?=[^;]+=[^;]+;|[^;]+=)/);
  return raw.map((c) => c.split(";")[0].trim()).filter(Boolean);
}

function mergeCookies(existing: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();
  for (const c of [...existing, ...incoming]) {
    const name = c.split("=")[0].trim();
    if (name) map.set(name, c);
  }
  return Array.from(map.values());
}

// ── Garmin SSO login ──────────────────────────────────────────────────────────

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

  // Step 1 — CSRF + cookies
  const pageResp = await fetch(`${SSO}?${params}`, { headers: { "User-Agent": UA } });
  const html = await pageResp.text();
  const csrfMatch = html.match(/name="_csrf"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Could not get CSRF token from Garmin login page");

  const csrf = csrfMatch[1];
  let cookieJar = extractCookies(pageResp.headers);

  // Step 2 — POST credentials
  const formBody = new URLSearchParams({ username: email, password, embed: "false", _csrf: csrf });
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

  // Step 3 — Follow all redirects to collect session cookies
  let nextUrl = `${SERVICE}?ticket=${ticket}`;
  for (let i = 0; i < 6; i++) {
    const resp = await fetch(nextUrl, {
      redirect: "manual",
      headers: { "Cookie": cookieJar.join("; "), "User-Agent": UA },
    });
    cookieJar = mergeCookies(cookieJar, extractCookies(resp.headers));
    if (resp.status === 200 || resp.status === 204) break;
    const loc = resp.headers.get("location");
    if (!loc) break;
    nextUrl = loc.startsWith("http") ? loc : `https://connect.garmin.com${loc}`;
  }

  return cookieJar.join("; ");
}

// ── OAuth1 → OAuth2 token exchange ────────────────────────────────────────────

function buildOAuth1Header(
  method: string,
  baseUrl: string,
  oauthParams: Record<string, string>,  // only oauth_* to put in header
  extraSignatureParams: Record<string, string>,  // additional query/body params for signature only
  signature: string,
): string {
  const headerParams = { ...oauthParams, oauth_signature: signature };
  return "OAuth " + Object.entries(headerParams)
    .map(([k, v]) => `${k}="${encodeURIComponent(v)}"`)
    .join(", ");
}

async function buildOAuth1Signature(
  method: string,
  baseUrl: string,
  allParams: Record<string, string>,
  signingKey: string,
): Promise<string> {
  const normalized = Object.entries(allParams)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const base = `${method}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(normalized)}`;
  return await hmacSha1(signingKey, base);
}

async function getOAuth1Token(cookies: string): Promise<{ token: string; tokenSecret: string }> {
  const baseUrl = "https://connectapi.garmin.com/oauth-service/oauth/preauthorized";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  // oauth_callback goes in BOTH the header and the signature
  const oauthParams: Record<string, string> = {
    oauth_callback: "oob",
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_version: "1.0",
  };

  // Signature includes oauth params + query string params
  const allParams = { ...oauthParams, accepts_tos: "true" };
  const signingKey = `${encodeURIComponent(CONSUMER_SECRET)}&`;
  const signature = await buildOAuth1Signature("GET", baseUrl, allParams, signingKey);

  const resp = await fetch(`${baseUrl}?accepts_tos=true`, {
    headers: {
      "Authorization": buildOAuth1Header("GET", baseUrl, oauthParams, {}, signature),
      "Cookie": cookies,
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OAuth1 preauthorized failed (${resp.status}): ${body.slice(0, 300)}`);
  }
  const text = await resp.text();
  const oauthToken = decodeURIComponent(text.match(/oauth_token=([^&\s]+)/)?.[1] ?? "");
  const oauthTokenSecret = decodeURIComponent(text.match(/oauth_token_secret=([^&\s]+)/)?.[1] ?? "");
  if (!oauthToken) throw new Error(`Could not parse OAuth1 token: ${text.slice(0, 200)}`);

  return { token: oauthToken, tokenSecret: oauthTokenSecret };
}

async function getOAuth2Token(oauth1Token: string, oauth1Secret: string): Promise<string> {
  const baseUrl = "https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: oauth1Token,
    oauth_version: "1.0",
  };

  const signingKey = `${encodeURIComponent(CONSUMER_SECRET)}&${encodeURIComponent(oauth1Secret)}`;
  const signature = await buildOAuth1Signature("POST", baseUrl, oauthParams, signingKey);

  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Authorization": buildOAuth1Header("POST", baseUrl, oauthParams, {}, signature),
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OAuth2 exchange failed (${resp.status}): ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error(`No access_token in OAuth2 response: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Fetch sleep data ──────────────────────────────────────────────────────────

async function fetchSleep(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<SleepRecord[]> {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "User-Agent": UA,
  };

  // Get display name directly from connectapi.garmin.com
  const profileResp = await fetch(
    "https://connectapi.garmin.com/userprofile-service/socialProfile",
    { headers }
  );
  if (!profileResp.ok) {
    const body = await profileResp.text().catch(() => "");
    throw new Error(`Profile fetch failed (${profileResp.status}): ${body.slice(0, 200)}`);
  }
  // deno-lint-ignore no-explicit-any
  const profile = await profileResp.json() as any;
  const displayName: string = profile?.displayName ?? profile?.userName ?? "";
  if (!displayName) throw new Error("Could not resolve display name from profile");

  // Fetch sleep directly from connectapi.garmin.com
  const sleepResp = await fetch(
    `https://connectapi.garmin.com/wellness-service/wellness/dailySleepData/${displayName}?startDate=${startDate}&endDate=${endDate}&nonSleepBufferMinutes=60`,
    { headers }
  );
  if (!sleepResp.ok) {
    const body = await sleepResp.text().catch(() => "");
    throw new Error(`Sleep data fetch failed (${sleepResp.status}): ${body.slice(0, 200)}`);
  }

  // deno-lint-ignore no-explicit-any
  const raw = await sleepResp.json() as any;
  const items: unknown[] = Array.isArray(raw) ? raw : raw?.dailySleepDTO ? [raw] : [];

  const toMin = (s: number | null | undefined): number => s ? Math.round(s / 60) : 0;

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

    const cookies    = await garminLogin(email, password);
    const oauth1     = await getOAuth1Token(cookies);
    const accessToken = await getOAuth2Token(oauth1.token, oauth1.tokenSecret);
    const records    = await fetchSleep(accessToken, startDate, endDate);

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
