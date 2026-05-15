import { useState, useEffect, useRef, useCallback } from "react";
import supabase from "../lib/supabase.js";

export function useSessionsCatalog(userId) {
  const [catalog, setCatalog] = useState([]);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const fetchCatalog = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("sessions_catalog")
      .select("id, type, name, charge, min_recovery, estimated_time, description, extra, user_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (error || !data) return;
    setCatalog(data.map(r => ({
      id: r.id,
      type: r.type,
      name: r.name,
      charge: r.charge,
      minRecovery: r.min_recovery ?? undefined,
      estimatedTime: r.estimated_time ?? undefined,
      description: r.description ?? undefined,
      isCustom: r.user_id != null,
      ...(r.extra || {}),
    })));
  }, []);

  // Re-fetch when userId changes (e.g. Supabase auth session restored asynchronously)
  useEffect(() => { fetchCatalog(); }, [fetchCatalog, userId]);

  const saveUserSession = useCallback(async (session) => {
    const uid = userIdRef.current;
    if (!supabase || !uid) return null;
    const extra = {};
    if (session.warmup)   extra.warmup   = session.warmup;
    if (session.main)     extra.main     = session.main;
    if (session.cooldown) extra.cooldown = session.cooldown;
    if (session.location) extra.location = session.location;
    if (session.blocks?.length) extra.blocks = session.blocks;  // composition de blocs
    // Base : ne contient PAS user_id ; on l'ajoute seulement sur INSERT pour
    // ne pas écraser le créateur original lors d'un edit par un autre
    // utilisateur (catalogue partagé).
    const base = {
      type: session.type,
      name: session.name,
      charge: session.charge,
      min_recovery: session.minRecovery ?? null,
      estimated_time: session.estimatedTime ?? null,
      extra: Object.keys(extra).length ? extra : null,
      is_active: true,
      sort_order: 999,
    };
    let dbError;
    if (session.isCustom && typeof session.id === "number") {
      const { error } = await supabase.from("sessions_catalog").update(base).eq("id", session.id);
      dbError = error;
    } else {
      const { error } = await supabase.from("sessions_catalog").insert({ ...base, user_id: uid });
      dbError = error;
    }
    if (dbError) {
      console.error("[sessions_catalog] erreur DB:", dbError.code, dbError.message, dbError.details, "\nrow envoyé:", base);
      return null;
    }
    fetchCatalog();
  }, [fetchCatalog]);

  const deleteUserSession = useCallback(async (id) => {
    if (!supabase) return;
    await supabase.from("sessions_catalog").delete().eq("id", id);
    fetchCatalog();
  }, [fetchCatalog]);

  return { catalog, saveUserSession, deleteUserSession };
}
