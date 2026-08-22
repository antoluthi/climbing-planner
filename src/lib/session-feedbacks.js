import supabase from "./supabase.js";

// ─── RESSENTIS EN BASE ───────────────────────────────────────────────────────
// Le miroir Supabase des retours de séance : c'est lui que lit l'historique
// « Retours athlètes » de la bibliothèque. Le planning, lui, vit dans le blob
// `climbing_plans.data` — un échec ici ne perd donc jamais le ressenti côté
// athlète (stats, charge, écart), il le rend seulement invisible au coach.
//
// `session_feedbacks.session_id` a été créée en INT, du temps où les séances
// venaient d'un catalogue numéroté. Un identifiant est aujourd'hui une chaîne
// (`generateId()`, ex. « c_brmgrpkcmt3hp1ac ») : Postgres rejetait donc chaque
// écriture en 22P02 — « invalid input syntax for type integer » — et la table
// restait vide. La migration `20260822_session_feedbacks_text_id.sql` passe la
// colonne en TEXT ; tant qu'elle n'est pas appliquée sur un projet, on réécrit
// sans l'identifiant : le couple (nom de séance, date) porte déjà la clé
// d'unicité de la table.

let dropSessionId = false; // vrai dès qu'on a constaté une colonne encore en INT

export async function upsertSessionFeedback(row) {
  if (!supabase || !row?.user_id) return null;

  const write = (payload) => supabase
    .from("session_feedbacks")
    .upsert(payload, { onConflict: "user_id,session_name,feedback_date" });

  const { session_id: _sessionId, ...withoutId } = row;
  void _sessionId;

  if (dropSessionId) return (await write(withoutId)).error ?? null;

  const { error } = await write(row);
  if (!error) return null;
  if (error.code === "22P02") {
    dropSessionId = true;
    const { error: retryError } = await write(withoutId);
    return retryError ?? null;
  }
  return error;
}
