import { useState, useEffect, useRef, useCallback } from "react";
import supabase from "../lib/supabase.js";
import { migrateWeekKeys } from "../lib/helpers.js";
import { markDirty, markSynced, writeSyncMeta } from "../lib/sync-meta.js";

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
    // pagehide couvre refresh/navigation web ; visibilitychange couvre le
    // passage en arrière-plan dans la WebView Android (où pagehide ne se
    // déclenche pas quand l'app est tuée depuis les récents). Le flush est
    // idempotent (upsert), un double envoi est sans effet.
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") handlePageHide();
    };
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
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

  // ── Coup d'œil sur la ligne, sans le planning ──
  // Une seule colonne de dates : c'est ce qui permet de demander « y a-t-il du
  // neuf ? » à chaque retour au premier plan sans retélécharger tout le blob.
  // `status` voyage avec, parce que le rôle du compte se résout au même moment.
  const fetchCloudHead = useCallback(async (userId) => {
    if (!supabase || !userId) return null;
    const { data: row, error } = await supabase
      .from("climbing_plans")
      .select("updated_at, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return {
      exists:    !!row,
      updatedAt: row?.updated_at ?? null,
      status:    row ? (row.status ?? null) : undefined,
    };
  }, []);

  const loadFromCloud = useCallback(async (userId) => {
    if (!supabase) return null;
    // `eq(user_id)` n'est PAS une redondance avec RLS : un coach a le droit de
    // lire les lignes de ses athlètes, donc un SELECT sans filtre en renvoie
    // plusieurs et `maybeSingle()` part en erreur. Sans ce filtre, un coach
    // avec au moins un athlète ne chargeait jamais ses propres données.
    const scoped = (q) => (userId ? q.eq("user_id", userId) : q);
    let row = null;
    // Try to read extra columns; fall back gracefully if they don't exist yet.
    const { data: full, error: fullErr } = await scoped(
      supabase.from("climbing_plans").select("data, first_name, last_name, status, updated_at")
    ).maybeSingle();
    if (!fullErr) {
      row = full;
    } else {
      // Columns likely not yet added — fall back to JSONB only
      const { data: slim, error: slimErr } = await scoped(
        supabase.from("climbing_plans").select("data")
      ).maybeSingle();
      // If both queries fail (e.g. JWT expired / not yet refreshed on rapid reload),
      // throw so the caller can skip setCloudLoaded and retry on next session change.
      if (slimErr) throw slimErr;
      row = slim;
    }
    if (!row) return null;
    const blob = row.data ?? {};
    // La colonne status fait autorité pour le rôle. Valeurs : 'coach' |
    // 'athlete' | 'auto' | 'solo' (choix explicite « athlète solo ») |
    // NULL (n'a JAMAIS choisi → l'onboarding rôle doit s'afficher).
    // Dans l'app, 'solo' se traduit par role: null.
    const status = "status" in (row ?? {}) ? row.status : undefined;
    const profile = {
      ...(blob.profile ?? {}),
      ...(row.first_name != null ? { firstName: row.first_name } : {}),
      ...(row.last_name  != null ? { lastName:  row.last_name  } : {}),
      ...(status !== undefined ? { role: status === "solo" ? null : status } : {}),
    };
    const migrated = migrateWeekKeys({ ...blob, profile });
    return { ...migrated, _cloudUpdatedAt: row.updated_at ?? null, _status: status ?? null };
  }, []);

  // Écrit le rôle dans sa colonne — à l'inscription et depuis le compte.
  // « Athlète solo » est stocké comme 'solo' (jamais NULL) : NULL est réservé
  // à « n'a jamais choisi », ce qui rend l'affichage de l'onboarding fiable.
  const writeStatus = useCallback(async (userId, role) => {
    if (!supabase || !userId) return { error: null };
    const { data: saved, error } = await supabase
      .from("climbing_plans")
      .upsert({ user_id: userId, status: role ?? "solo" }, { onConflict: "user_id" })
      .select("updated_at")
      .maybeSingle();
    // L'échec doit remonter : tant que la contrainte CHECK de `status` n'avait
    // pas été élargie à 'solo', l'écriture repartait en 23514 et personne ne le
    // voyait — l'utilisateur croyait avoir choisi son rôle, et l'onboarding
    // revenait au démarrage suivant.
    if (error) return { error };
    // Cette écriture rajeunit la ligne sans toucher au planning : on avance le
    // marqueur pour ne pas déclencher un rapatriement inutile juste après
    // l'onboarding. `dirtyAt`, lui, n'est pas effacé — rien n'a été envoyé.
    if (saved?.updated_at) writeSyncMeta({ userId, syncedAt: saved.updated_at });
    return { error: null };
  }, []);

  // Écriture réelle de la ligne. On relit l'`updated_at` que Postgres a
  // finalement stocké : c'est lui, et pas l'heure de l'appareil, qui devient
  // notre marqueur de synchronisation. Renvoie cette date, ou null si l'écriture
  // n'a pas abouti.
  const writeRow = useCallback(async (planData, userId) => {
    const { data: saved, error } = await supabase
      .from("climbing_plans")
      .upsert(buildRow(planData, userId), { onConflict: "user_id" })
      .select("updated_at")
      .maybeSingle();
    if (error) throw error;
    return saved?.updated_at ?? null;
  }, [buildRow]);

  // Le marqueur local ne suit QUE notre propre ligne : quand un coach
  // enregistre le planning d'un athlète, ça ne dit rien de l'état du sien.
  const isOwnRow = (userId) => !!userId && userId === sessionRef.current?.user?.id;

  const saveToCloud = useCallback((planData, userId) => {
    if (!supabase || !userId) return;
    clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    if (isOwnRow(userId)) markDirty();
    pendingSaveRef.current = { planData, userId }; // pagehide will flush this if debounce is cancelled
    saveTimerRef.current = setTimeout(async () => {
      try {
        const updatedAt = await writeRow(planData, userId);
        pendingSaveRef.current = null; // debounce completed — nothing left to flush
        if (isOwnRow(userId)) markSynced(userId, updatedAt);
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        // Rien n'est perdu : `dirtyAt` reste posé, la prochaine réconciliation
        // (retour au premier plan, relance de l'app) renverra les données.
        setSyncStatus("offline");
      }
    }, 500);
  }, [writeRow]);

  // Immediate upload (no debounce) — used for force-sync & first-login push
  const uploadNow = useCallback(async (planData, userId) => {
    if (!supabase || !userId) return null;
    setSyncStatus("saving");
    try {
      const updatedAt = await writeRow(planData, userId);
      pendingSaveRef.current = null;
      if (isOwnRow(userId)) markSynced(userId, updatedAt);
      setSyncStatus("saved");
      setTimeout(() => setSyncStatus("idle"), 2500);
      return updatedAt;
    } catch {
      setSyncStatus("offline");
      return null;
    }
  }, [writeRow]);

  // Subscribe to realtime changes on the user's own row.
  // Calls onChanged() whenever another device (or tab) saves.
  // Returns an unsubscribe function.
  const subscribeToChanges = useCallback((userId, onChanged) => {
    if (!supabase || !userId) return () => {};
    const channel = supabase
      .channel(`plan_sync_${userId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "climbing_plans",
        filter: `user_id=eq.${userId}`,
      }, onChanged)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Indique si un save est en cours (debounce non encore flushed).
  // Utilisé par le handler Realtime pour éviter d'écraser des modifications locales.
  const hasPendingSave = useCallback(() => pendingSaveRef.current !== null, []);

  return { session, setSession, authChecked, syncStatus, fetchCloudHead, loadFromCloud, saveToCloud, uploadNow, writeStatus, subscribeToChanges, hasPendingSave };
}
