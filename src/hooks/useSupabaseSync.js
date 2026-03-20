import { useState, useEffect, useRef, useCallback } from "react";
import supabase from "../lib/supabase.js";
import { migrateWeekKeys } from "../lib/helpers.js";

export function useSupabaseSync() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(!supabase); // true immediately if no Supabase
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle"|"saving"|"saved"|"offline"
  const saveTimerRef   = useRef(null);
  const pendingSaveRef = useRef(null); // { planData, userId } — flushed via keepalive on pagehide
  const sessionRef     = useRef(null); // always-fresh session token for the pagehide handler

  // Keep sessionRef current without re-registering the pagehide listener on every token refresh.
  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Stale/invalid token in storage → wipe it cleanly
        supabase.auth.signOut().catch(() => {});
        setSession(null);
      } else {
        setSession(session);
      }
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      // TOKEN_REFRESHED failure emits SIGNED_OUT — nothing extra needed,
      // but if we still have stale keys we force-clear them here.
      if (event === "SIGNED_OUT" && !session) {
        try { Object.keys(localStorage).filter(k => k.includes("supabase")).forEach(k => localStorage.removeItem(k)); } catch {}
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // On page hide (refresh / navigation), flush any pending debounced save via a keepalive fetch.
  // Unlike a normal Supabase call, fetch({ keepalive: true }) is guaranteed to complete even
  // when the page is being unloaded — this is the browser's intended API for this exact case.
  useEffect(() => {
    if (!supabase) return;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const handlePageHide = () => {
      const pending = pendingSaveRef.current;
      const token   = sessionRef.current?.access_token;
      if (!pending || !token) return;
      const row = {
        user_id:    pending.userId,
        data:       pending.planData,
        first_name: pending.planData?.profile?.firstName ?? null,
        last_name:  pending.planData?.profile?.lastName  ?? null,
        updated_at: new Date().toISOString(),
      };
      fetch(`${url}/rest/v1/climbing_plans`, {
        method:    "POST",
        keepalive: true,
        headers: {
          "Content-Type":  "application/json",
          "apikey":        key,
          "Authorization": `Bearer ${token}`,
          "Prefer":        "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(row),
      });
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []); // refs only — no deps needed

  // Build the flat columns synced alongside the JSONB blob.
  // status is NOT included — it is admin-only (set once at onboarding or via DB).
  const buildRow = useCallback((planData, userId) => ({
    user_id:    userId,
    data:       planData,
    first_name: planData?.profile?.firstName ?? null,
    last_name:  planData?.profile?.lastName  ?? null,
    updated_at: new Date().toISOString(),
  }), []);

  const loadFromCloud = useCallback(async () => {
    if (!supabase) return null;
    // Try to read extra columns; fall back gracefully if they don't exist yet.
    let row = null;
    const { data: full, error: fullErr } = await supabase
      .from("climbing_plans")
      .select("data, first_name, last_name, status, updated_at")
      .maybeSingle();
    if (!fullErr) {
      row = full;
    } else {
      // Columns likely not yet added — fall back to JSONB only
      const { data: slim, error: slimErr } = await supabase
        .from("climbing_plans")
        .select("data")
        .maybeSingle();
      // If both queries fail (e.g. JWT expired / not yet refreshed on rapid reload),
      // throw so the caller can skip setCloudLoaded and retry on next session change.
      if (slimErr) throw slimErr;
      row = slim;
    }
    if (!row) return null;
    const blob = row.data ?? {};
    const profile = {
      ...(blob.profile ?? {}),
      ...(row.first_name != null ? { firstName: row.first_name } : {}),
      ...(row.last_name  != null ? { lastName:  row.last_name  } : {}),
      // status column is authoritative for role (overrides blob value)
      ...("status" in (row ?? {}) ? { role: row.status } : {}),
    };
    const migrated = migrateWeekKeys({ ...blob, profile });
    return { ...migrated, _cloudUpdatedAt: row.updated_at ?? null };
  }, []);

  // Write status to its own column — called only from onboarding.
  const writeStatus = useCallback(async (userId, role) => {
    if (!supabase || !userId) return;
    await supabase
      .from("climbing_plans")
      .upsert({ user_id: userId, status: role }, { onConflict: "user_id" });
  }, []);

  const saveToCloud = useCallback((planData, userId) => {
    if (!supabase || !userId) return;
    clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    pendingSaveRef.current = { planData, userId }; // pagehide will flush this if debounce is cancelled
    saveTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("climbing_plans")
          .upsert(buildRow(planData, userId), { onConflict: "user_id" });
        if (!error) pendingSaveRef.current = null; // debounce completed — nothing left to flush
        setSyncStatus(error ? "offline" : "saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        setSyncStatus("offline");
      }
    }, 500);
  }, [buildRow]);

  // Immediate upload (no debounce) — used for force-sync & first-login push
  const uploadNow = useCallback(async (planData, userId) => {
    if (!supabase || !userId) return;
    setSyncStatus("saving");
    try {
      const { error } = await supabase
        .from("climbing_plans")
        .upsert(buildRow(planData, userId), { onConflict: "user_id" });
      setSyncStatus(error ? "offline" : "saved");
      setTimeout(() => setSyncStatus("idle"), 2500);
    } catch {
      setSyncStatus("offline");
    }
  }, [buildRow]);

  return { session, setSession, authChecked, syncStatus, loadFromCloud, saveToCloud, uploadNow, writeStatus };
}
