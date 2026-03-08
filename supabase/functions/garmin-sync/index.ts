// Supabase Edge Function — Garmin Connect sleep sync

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONSUMER_KEY    = "fc3e99d2-118c-44b8-914d-3f01d98a0e04";
const CONSUMER_SECRET = "E08WAR897WH6-610JD474-1JJ7344TJ8X";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface SleepRecord {
  date: string;
  total: number;
  deep: number;
  light: number;
  rem: number;
  awake: number;
  score: number | null;
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

  const params = new URLSearchParams({
    service: SERVICE, webhost: "olc.garmin.com",
    source: "https://connect.garmin.com/signin/",
    redirectAfterAccountLoginUrl: SERVICE,
    redirectAfterAccountCreationUrl: SERVICE,
    gauthHost: "https://sso.garmin.com/sso",
    locale: "en_US", id: "gauth-widget",
    cssUrl: "https://connect.garmin.com/gauth/custom-osm-v1.css",
    clientId: "GarminConnect", rememberMeShown: "true", rememberMeChecked: "false",
    createAccountShown: "true", openCreateAccount: "false", displayNameShown: "false",
    consumeServiceTicket: "false", initialFocus: "true", embedWidget: "false",
    generateExtraServiceTicket: "true", generateTwoExtraServiceTickets: "false",
    generateNoServiceTicket: "false", mfaRequired: "false", performMFACheck: "false",
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
    method: "POST", redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieJar.join("; "), "User-Agent": UA,
      "Origin": "https://sso.garmin.com", "Referer": `${SSO}?${params}`,
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

// ── Approach A: Cookie + AJAX headers (simpler) ───────────────────────────────

async function fetchSleepWithCookies(
  cookies: string,
  startDate: string,
  endDate: string,
): Promise<SleepRecord[] | null> {
  // AJAX headers tell Garmin's proxy to return JSON instead of the SPA HTML
  const h = {
    "Cookie": cookies,
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    "NK": "NT",
    "X-app-ver": "4.60.2.0",
    "Origin": "https://connect.garmin.com",
    "Referer": "https://connect.garmin.com/modern/",
    "DI-Backend": "connectapi.garmin.com",
  };

  const profileResp = await fetch(
    "https://connect.garmin.com/modern/proxy/userprofile-service/socialProfile",
    { headers: h }
  );
  const profileCt = profileResp.headers.get("content-type") ?? "";
  if (!profileResp.ok || !profileCt.includes("json")) return null;

  // deno-lint-ignore no-explicit-any
  const profile = await profileResp.json() as any;
  const displayName: string = profile?.displayName ?? profile?.userName ?? "";
  if (!displayName) return null;

  const sleepResp = await fetch(
    `https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailySleepData/${displayName}?startDate=${startDate}&endDate=${endDate}&nonSleepBufferMinutes=60`,
    { headers: h }
  );
  if (!sleepResp.ok) return null;
  // deno-lint-ignore no-explicit-any
  const raw = await sleepResp.json() as any;
  return parseSleepRecords(raw);
}

// ── Approach B: OAuth1 → OAuth2 Bearer token ─────────────────────────────────

async function hmacSha1(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  // base64 encode
  let b = "";
  new Uint8Array(sig).forEach(byte => { b += String.fromCharCode(byte); });
  return btoa(b);
}

async function oauth1Sign(
  method: string, url: string,
  params: Record<string, string>,
  consumerSecret: string, tokenSecret = "",
): Promise<string> {
  const normalized = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const base = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(normalized)}`;
  const key  = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return hmacSha1(key, base);
}

async function getOAuth1Token(cookies: string): Promise<{ token: string; tokenSecret: string }> {
  const url = "https://connectapi.garmin.com/oauth-service/oauth/preauthorized";
  const ts    = Math.floor(Date.now() / 1000).toString();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  // oauth_callback goes in query string (not Authorization header), like garth Python does
  const oauthBase: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts,
    oauth_version: "1.0",
  };
  // Signature includes both oauth params AND query params
  const allForSig = { ...oauthBase, oauth_callback: "oob", accepts_tos: "true" };
  const sig = await oauth1Sign("GET", url, allForSig, CONSUMER_SECRET);

  const authHeader = "OAuth " + Object.entries({ ...oauthBase, oauth_signature: sig })
    .map(([k, v]) => `${k}="${encodeURIComponent(v)}"`).join(", ");

  const resp = await fetch(`${url}?oauth_callback=oob&accepts_tos=true`, {
    headers: { "Authorization": authHeader, "Cookie": cookies, "User-Agent": UA },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OAuth1 preauthorized failed (${resp.status}): ${body.slice(0, 400)}`);
  }
  const text = await resp.text();
  const oauthToken  = decodeURIComponent(text.match(/oauth_token=([^&\s]+)/)?.[1] ?? "");
  const oauthSecret = decodeURIComponent(text.match(/oauth_token_secret=([^&\s]+)/)?.[1] ?? "");
  if (!oauthToken) throw new Error(`Could not parse OAuth1 token from: ${text.slice(0, 200)}`);
  return { token: oauthToken, tokenSecret: oauthSecret };
}

async function getOAuth2Token(oauth1Token: string, oauth1Secret: string): Promise<string> {
  const url = "https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0";
  const ts    = Math.floor(Date.now() / 1000).toString();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const oauthBase: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts,
    oauth_token: oauth1Token,
    oauth_version: "1.0",
  };
  const sig = await oauth1Sign("POST", url, oauthBase, CONSUMER_SECRET, oauth1Secret);
  const authHeader = "OAuth " + Object.entries({ ...oauthBase, oauth_signature: sig })
    .map(([k, v]) => `${k}="${encodeURIComponent(v)}"`).join(", ");

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Authorization": authHeader, "User-Agent": UA },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OAuth2 exchange failed (${resp.status}): ${body.slice(0, 400)}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error(`No access_token: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function fetchSleepWithOAuth2(
  cookies: string,
  startDate: string,
  endDate: string,
): Promise<SleepRecord[]> {
  const oauth1 = await getOAuth1Token(cookies);
  const token  = await getOAuth2Token(oauth1.token, oauth1.tokenSecret);

  const h = { "Authorization": `Bearer ${token}`, "User-Agent": UA };

  const profileResp = await fetch(
    "https://connectapi.garmin.com/userprofile-service/socialProfile", { headers: h });
  if (!profileResp.ok) {
    const body = await profileResp.text().catch(() => "");
    throw new Error(`Profile failed (${profileResp.status}): ${body.slice(0, 200)}`);
  }
  // deno-lint-ignore no-explicit-any
  const profile = await profileResp.json() as any;
  const displayName: string = profile?.displayName ?? profile?.userName ?? "";
  if (!displayName) throw new Error("No displayName in profile");

  const sleepResp = await fetch(
    `https://connectapi.garmin.com/wellness-service/wellness/dailySleepData/${displayName}?startDate=${startDate}&endDate=${endDate}&nonSleepBufferMinutes=60`,
    { headers: h });
  if (!sleepResp.ok) {
    const body = await sleepResp.text().catch(() => "");
    throw new Error(`Sleep failed (${sleepResp.status}): ${body.slice(0, 200)}`);
  }
  // deno-lint-ignore no-explicit-any
  return parseSleepRecords(await sleepResp.json() as any);
}

// ── Sleep record parser ───────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function parseSleepRecords(raw: any): SleepRecord[] {
  const items: unknown[] = Array.isArray(raw) ? raw : raw?.dailySleepDTO ? [raw] : [];
  const toMin = (s: number | null | undefined): number => s ? Math.round(s / 60) : 0;
  const records: SleepRecord[] = [];
  for (const item of items) {
    // deno-lint-ignore no-explicit-any
    const dto: any = (item as any)?.dailySleepDTO ?? item;
    if (!dto) continue;
    const date = dto.calendarDate ?? dto.sleepStartTimestampGMT?.slice(0, 10) ?? "";
    if (!date) continue;
    const total = toMin(dto.sleepTimeSeconds);
    if (total === 0) continue;
    records.push({
      date, total,
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

    // Try approach A first (cookies + AJAX headers) — simpler
    let records = await fetchSleepWithCookies(cookies, startDate, endDate);

    // Fall back to approach B (OAuth2 Bearer token) if A didn't return data
    if (!records) {
      records = await fetchSleepWithOAuth2(cookies, startDate, endDate);
    }

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
