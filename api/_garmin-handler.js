// Garmin Connect, côté serveur. Une seule route, `api/garmin/[action].js` :
//
//   GET    /api/garmin/status                      la clé est-elle enregistrée ?
//   POST   /api/garmin/key      { apiKey }         vérifier puis enregistrer la clé
//   DELETE /api/garmin/key                          l'oublier
//   GET    /api/garmin/sleep?start=…&end=…         les nuits d'une plage (31 au plus)
//
// Chaque appel porte le jeton Supabase de l'utilisateur (`Authorization:
// Bearer …`) : c'est lui qui dit à qui appartient la clé.
//
// ⚠️ **La clé ne quitte jamais le serveur.** Elle donne accès, pendant
// jusqu'à un an, à toutes les données de santé du compte Garmin : elle vit
// dans `garmin_links`, une table qu'aucun rôle client ne peut lire (RLS sans
// policy, aucun GRANT à anon ni à authenticated, voir la migration
// 20261030). Surtout pas dans `data`, que lisent le coach et, pour un planning
// public, n'importe qui. Le client n'en revoit que les quatre derniers
// caractères.
//
// La logique est dans `handleGarmin`, qui reçoit ses dépendances (Supabase,
// fetch, horloge) : les tests (`api/garmin.test.mjs`) la font tourner contre
// des doublures, sans réseau.

import { createClient } from "@supabase/supabase-js";
import {
  GARMIN_BASE, TOKEN_PATH, SLEEP_PATH, TOKEN_FALLBACK_MS,
  cleanKey, keyHint, jwtExpiry, tokenUsable, parseRange, normalizeSleep,
} from "./_garmin.js";

const METHODS = "GET, POST, DELETE, OPTIONS";
// Une fonction Vercel s'arrête à 10 s. Un échange de clé suivi d'une lecture
// doit tenir dedans, retentative comprise.
const TOKEN_TIMEOUT_MS = 4000;
const DATA_TIMEOUT_MS = 6000;

// Code d'erreur → statut HTTP. Le client lit le code, pas le statut.
const STATUS = {
  not_signed_in: 401, missing_key: 400, bad_dates: 400, range_too_long: 400,
  no_key: 404, not_found: 404, method_not_allowed: 405,
  key_rejected: 422, garmin_forbidden: 422, rate_limited: 429,
  garmin_down: 502, garmin_error: 502, garmin_unreachable: 502, garmin_timeout: 504,
  not_installed: 503, server_misconfigured: 503, store_error: 500,
};
const fail = (error) => ({ status: STATUS[error] || 500, body: { error } });
const ok = (body) => ({ status: 200, body });

function bearer(header) {
  const m = /^Bearer\s+(.+)$/i.exec(String(header || "").trim());
  return m ? m[1].trim() : null;
}

const isTimeout = (e) => e?.name === "TimeoutError" || e?.name === "AbortError";

// ── Garmin ───────────────────────────────────────────────────────────────────

// La clé contre un jeton. 400 / 401 / 403 sur cet échange veulent tous dire la
// même chose pour l'utilisateur : la clé n'est pas (ou plus) bonne.
async function exchangeKey(apiKey, deps) {
  let res;
  try {
    res = await deps.fetch(GARMIN_BASE + TOKEN_PATH, {
      method: "POST",
      headers: { Accept: "*/*", Authorization: `ApiKey ${apiKey}` },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (e) {
    return { error: isTimeout(e) ? "garmin_timeout" : "garmin_unreachable" };
  }
  if (!res.ok) {
    if ([400, 401, 403].includes(res.status)) return { error: "key_rejected" };
    return { error: res.status === 429 ? "rate_limited" : res.status >= 500 ? "garmin_down" : "garmin_error" };
  }
  const token = (await res.text()).trim();
  if (!token) return { error: "garmin_error" };
  return { token, expiresAt: jwtExpiry(token) ?? deps.now() + TOKEN_FALLBACK_MS };
}

async function garminGet(path, params, token, deps) {
  let res;
  try {
    res = await deps.fetch(`${GARMIN_BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
    });
  } catch (e) {
    return { error: isTimeout(e) ? "garmin_timeout" : "garmin_unreachable" };
  }
  if (res.status === 401) return { error: "token_rejected" };
  if (!res.ok) {
    return { error: res.status === 403 ? "garmin_forbidden" : res.status === 429 ? "rate_limited" : res.status >= 500 ? "garmin_down" : "garmin_error" };
  }
  const text = await res.text();
  try {
    return { data: text ? JSON.parse(text) : null };
  } catch {
    return { error: "garmin_error" };
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

function describe(row) {
  return {
    linked: true,
    hint: row.key_hint || "",
    savedAt: row.updated_at || row.created_at || null,
    lastSyncAt: row.last_sync_at || null,
    lastError: row.last_error || null,
  };
}

async function saveKey(userId, body, deps) {
  const apiKey = cleanKey(body?.apiKey);
  if (!apiKey) return fail("missing_key");
  // On vérifie auprès de Garmin **avant** d'enregistrer : une clé mal collée
  // se signale tout de suite, pas à la première synchronisation.
  const t = await exchangeKey(apiKey, deps);
  if (t.error) return fail(t.error);
  const nowIso = new Date(deps.now()).toISOString();
  const row = {
    api_key: apiKey,
    key_hint: keyHint(apiKey),
    access_token: t.token,
    token_expires_at: new Date(t.expiresAt).toISOString(),
    updated_at: nowIso,
    last_error: null,
  };
  await deps.store.save(userId, row);
  return ok(describe(row));
}

async function readSleep(userId, query, deps) {
  const range = parseRange(query);
  if (range.error) return fail(range.error);
  const row = await deps.store.get(userId);
  if (!row) return fail("no_key");

  let token = row.access_token;
  let expiresAt = Date.parse(row.token_expires_at);
  let fresh = false;
  const renew = async () => {
    const t = await exchangeKey(row.api_key, deps);
    if (t.error) return t.error;
    token = t.token; expiresAt = t.expiresAt; fresh = true;
    return null;
  };

  let error = !token || !tokenUsable(expiresAt, deps.now()) ? await renew() : null;
  let res = error ? null : await garminGet(SLEEP_PATH, { startDate: range.start, endDate: range.end }, token, deps);
  // Un jeton peut être révoqué avant l'heure : on en reprend un, une fois.
  if (res?.error === "token_rejected" && !fresh) {
    error = await renew();
    if (!error) res = await garminGet(SLEEP_PATH, { startDate: range.start, endDate: range.end }, token, deps);
  }
  if (!error && res?.error) error = res.error === "token_rejected" ? "key_rejected" : res.error;
  // Ces notes de suivi ne doivent jamais coûter les nuits qu'on vient de
  // lire : un échec d'écriture ici est ignoré.
  const note = (fields) => Promise.resolve().then(() => deps.store.patch(userId, fields)).catch(() => {});
  if (error) {
    await note({ last_error: error });
    return fail(error);
  }

  const nights = normalizeSleep(res.data);
  await note({
    last_sync_at: new Date(deps.now()).toISOString(),
    last_error: null,
    ...(fresh ? { access_token: token, token_expires_at: new Date(expiresAt).toISOString() } : {}),
  });
  return ok({ start: range.start, end: range.end, nights });
}

export async function handleGarmin({ method, action, query, body, authorization }, deps) {
  if (method === "OPTIONS") return { status: 204 };
  const jwt = bearer(authorization);
  const userId = jwt ? await deps.verifyUser(jwt) : null;
  if (!userId) return fail("not_signed_in");

  try {
    if (action === "status") {
      if (method !== "GET") return fail("method_not_allowed");
      const row = await deps.store.get(userId);
      return ok(row ? describe(row) : { linked: false });
    }
    if (action === "key") {
      if (method === "POST") return await saveKey(userId, body, deps);
      if (method === "DELETE") {
        await deps.store.remove(userId);
        return ok({ linked: false });
      }
      return fail("method_not_allowed");
    }
    if (action === "sleep") {
      if (method !== "GET") return fail("method_not_allowed");
      return await readSleep(userId, query, deps);
    }
    return fail("not_found");
  } catch (e) {
    // Table absente ou droits manquants : la migration n'a pas été appliquée.
    if (["PGRST205", "PGRST106", "42P01", "42501"].includes(e?.code)) return fail("not_installed");
    return fail("store_error");
  }
}

// ── Supabase ─────────────────────────────────────────────────────────────────

const TABLE = "garmin_links";
const COLUMNS = "api_key, key_hint, access_token, token_expires_at, created_at, updated_at, last_sync_at, last_error";

function supabaseDeps(env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = ({ error }) => { if (error) throw error; };
  return {
    verifyUser: async (jwt) => {
      const { data, error } = await sb.auth.getUser(jwt);
      return error ? null : data?.user?.id || null;
    },
    store: {
      get: async (id) => {
        const { data, error } = await sb.from(TABLE).select(COLUMNS).eq("user_id", id).maybeSingle();
        if (error) throw error;
        return data;
      },
      // Ligne complète : `upsert` exige toutes les colonnes obligatoires, même
      // quand la ligne existe déjà. Les mises à jour partielles passent par
      // `patch`.
      save: async (id, row) => check(await sb.from(TABLE).upsert({ user_id: id, ...row }, { onConflict: "user_id" })),
      patch: async (id, fields) => check(await sb.from(TABLE).update(fields).eq("user_id", id)),
      remove: async (id) => check(await sb.from(TABLE).delete().eq("user_id", id)),
    },
  };
}

function parseBody(body) {
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  try {
    return JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "{}"));
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  // CORS sur toutes les réponses, erreurs comprises : l'APK appelle depuis
  // `https://localhost`. Pas de cookie, seulement un en-tête Authorization,
  // donc `*` suffit.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", METHODS);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const deps = supabaseDeps(process.env);
  if (!deps) { res.status(503).json({ error: "server_misconfigured" }); return; }

  const out = await handleGarmin({
    method: req.method,
    action: String(req.query?.action || ""),
    query: req.query || {},
    body: parseBody(req.body),
    authorization: req.headers?.authorization,
  }, { ...deps, fetch: globalThis.fetch, now: Date.now });

  if (out.body === undefined) res.status(out.status).end();
  else res.status(out.status).json(out.body);
}
