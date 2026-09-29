import { useState, useEffect, useRef, useCallback } from "react";
import supabase from "../lib/supabase.js";
import { migrateWeekKeys } from "../lib/helpers.js";


// Les colonnes plates envoyées à côté du blob JSONB. `status` n'y est pas :
// c'est la colonne du rôle, écrite seulement par `writeStatus`.
function buildRow(planData, userId) {
  return {
    user_id:    userId,
    data:       planData,
    first_name: planData?.profile?.firstName ?? null,
    last_name:  planData?.profile?.lastName  ?? null,
    updated_at: new Date().toISOString(),
  };
}

// ── Écriture de la ligne, sans écraser personne ─────────────────────────────────────────────
// L'écriture est **conditionnelle** : on ne remplace la ligne que si son
// `updated_at` est bien celui sur lequel nos données sont bâties
// (`expectedAt`). Sinon un autre appareil a écrit entre-temps, l'UPDATE ne
// touche aucune ligne, et on le sait : `{ ok: false }`. La fusion n'est pas
// faite ici — c'est le moteur de `DataProvider` qui la mène, avec la base.
//
// ⚠️ `expectedAt` doit décrire **les données envoyées**, pas l'état du
// marqueur au moment de l'envoi. C'est ce décalage qui a vidé un PC : un
// téléphone resté sur l'ancien état notait une séance, le rapatriement
// arrivait pendant les 500 ms d'attente de l'envoi et avançait le marqueur, et
// l'envoi partait avec les données d'avant et la date d'après — la garde
// passait, le téléphone écrasait tout ce que le PC avait fait.
async function writeGuarded(planData, userId, expectedAt) {
  const { data: rows, error } = await supabase
    .from("climbing_plans")
    .update(buildRow(planData, userId))
    .eq("user_id", userId)
    .eq("updated_at", expectedAt)
    .select("updated_at");
  if (error) throw error;
  return rows?.length ? { ok: true, updatedAt: rows[0].updated_at ?? null } : { ok: false };
}

// Premier envoi (le compte n'a pas encore de ligne) ou remise à zéro
// anti-fuite : il n'y a rien à préserver, l'upsert est franc.
async function upsertRow(planData, userId) {
  const { data: saved, error } = await supabase
    .from("climbing_plans")
    .upsert(buildRow(planData, userId), { onConflict: "user_id" })
    .select("updated_at")
    .maybeSingle();
  if (error) throw error;
  return saved?.updated_at ?? null;
}

export function useSupabaseSync() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(!supabase); // true immediately if no Supabase
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle"|"saving"|"saved"|"offline"
  const saveTimerRef   = useRef(null);
  // Vue athlète seulement : c'est le seul chemin qui passe encore par
  // `saveToCloud`. La ligne du compte, elle, est confiée au moteur de
  // `DataProvider`, qui a son propre envoi de secours — conditionnel.
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
    // 'athlete' | 'solo' (choix explicite « athlète solo ») | NULL (n'a JAMAIS
    // choisi → l'onboarding rôle doit s'afficher). 'auto' est une valeur
    // historique, lue comme coach. Dans l'app, 'solo' se traduit par role: null.
    const status = "status" in (row ?? {}) ? row.status : undefined;
    const displayRole = status === "solo" ? null : status === "auto" ? "coach" : status;
    const profile = {
      ...(blob.profile ?? {}),
      ...(row.first_name != null ? { firstName: row.first_name } : {}),
      ...(row.last_name  != null ? { lastName:  row.last_name  } : {}),
      ...(status !== undefined ? { role: displayRole } : {}),
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
    // ⚠️ Le marqueur n'avance **pas** : cette écriture rajeunit la ligne sans
    // qu'on sache si quelqu'un d'autre l'avait modifiée juste avant. L'avancer
    // ferait croire à cet appareil qu'il connaît la dernière version — et son
    // prochain envoi passerait la garde par-dessus celle de l'autre. Le prix :
    // un rapatriement à la prochaine passe, qui ne change rien.
    void saved;
    return { error: null };
  }, []);

  // Le planning d'un **athlète**, modifié par son coach en vue athlète. Aucun
  // marqueur ne décrit cette ligne sur cet appareil : l'écriture reste un
  // upsert simple, comme avant. (La ligne du compte ne passe plus par ici.)
  const saveToCloud = useCallback((planData, userId) => {
    if (!supabase || !userId) return;
    clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    pendingSaveRef.current = { planData, userId }; // pagehide will flush this if debounce is cancelled
    saveTimerRef.current = setTimeout(async () => {
      try {
        await upsertRow(planData, userId);
        pendingSaveRef.current = null; // debounce completed — nothing left to flush
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        setSyncStatus("offline");
      }
    }, 500);
  }, []);

  // Ce que l'indicateur de synchronisation affiche, posé par le moteur.
  const reportSync = useCallback((status) => {
    setSyncStatus(status);
    if (status === "saved") setTimeout(() => setSyncStatus(s => (s === "saved" ? "idle" : s)), 2000);
  }, []);

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

  return {
    session, setSession, authChecked, syncStatus, reportSync,
    fetchCloudHead, loadFromCloud, writeGuarded, upsertRow, saveToCloud, writeStatus, subscribeToChanges,
  };
}
