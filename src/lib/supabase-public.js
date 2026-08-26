import { createClient } from "@supabase/supabase-js";

// ─── CLIENT PUBLIC (LECTURE SEULE) ───────────────────────────────────────────
// Un second client, volontairement **sans session** : ses requêtes partent avec
// la clé anon comme jeton, donc PostgREST les exécute au rôle `anon`.
//
// Deux conséquences, et c'est tout l'intérêt :
//
//  1. Un compte connecté peut lire un planning public **sans nouvelle policy** :
//     celle qui existe (`is_public = true`) est écrite `TO anon`, et ne
//     s'appliquerait donc pas aux requêtes d'un utilisateur authentifié.
//  2. Ce chemin ne peut lire **que** ce que le public peut lire. Les politiques
//     du compte — sa propre ligne, celles de ses athlètes s'il est coach — ne
//     s'appliquent pas ici : impossible d'afficher par accident une ligne
//     privée dans un écran présenté comme public.
//
// Le `storageKey` diffère de celui du client principal et `persistSession` est
// faux : ce client n'écrit jamais rien dans le stockage local et ne peut pas
// hériter d'une session.
const publicSupabase = import.meta.env.VITE_SUPABASE_URL
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "climbing-planner-public",
      },
    })
  : null;

// Les plannings marqués publics : de quoi dresser la liste (nom, avatar).
export async function fetchPublicPlans() {
  if (!publicSupabase) return [];
  const { data: rows, error } = await publicSupabase
    .from("climbing_plans")
    .select("user_id, first_name, last_name, data")
    .eq("is_public", true);
  if (error || !rows) return [];
  return rows
    .map(r => ({
      userId: r.user_id,
      firstName: r.first_name || r.data?.profile?.firstName || "",
      lastName: r.last_name || r.data?.profile?.lastName || "",
      avatarUrl: r.data?.profile?.avatarUrl || null,
    }))
    .filter(p => p.firstName || p.lastName)
    .sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName, "fr"));
}

export default publicSupabase;
