import { useState, useEffect, useCallback } from "react";
import supabase from "../lib/supabase.js";

// ─── useNotifications ─────────────────────────────────────────────────────────
// Cloche in-app (table `notifications`, migration 20260715).
// Types :
//   coach_request  — un coach invite l'utilisateur à être suivi (actionnable)
//   coach_accepted — l'athlète a accepté l'invitation (info, côté coach)
//   coach_declined — l'athlète a décliné (info, côté coach)
//   plan_update    — le coach a modifié le planning de l'athlète (info)
//
// Le lien coach_athletes est créé UNIQUEMENT ici, par l'athlète qui accepte
// (consentement mutuel — la policy RLS n'autorise que athlete_id = auth.uid()).

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]); // reçues, plus récentes d'abord
  const [sentInvites, setSentInvites] = useState([]);     // invitations coach_request envoyées

  const fetchAll = useCallback(async () => {
    if (!supabase || !userId) { setNotifications([]); setSentInvites([]); return; }
    const [{ data: received }, { data: sent }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, from_user_id, type, payload, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("notifications")
        .select("id, user_id, type, status, created_at")
        .eq("from_user_id", userId)
        .eq("type", "coach_request")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setNotifications(received || []);
    setSentInvites(sent || []);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Temps réel : toute nouvelle notification / changement de statut rafraîchit.
  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchAll]);

  const unreadCount = notifications.filter(n => n.status === "unread").length;

  // Marque lues les notifications informatives (les demandes de coaching
  // restent actionnables jusqu'à Accepter/Refuser).
  const markInfosRead = useCallback(async () => {
    if (!supabase || !userId) return;
    const ids = notifications
      .filter(n => n.status === "unread" && n.type !== "coach_request")
      .map(n => n.id);
    if (!ids.length) return;
    setNotifications(list => list.map(n => ids.includes(n.id) ? { ...n, status: "read" } : n));
    await supabase.from("notifications").update({ status: "read" }).in("id", ids);
  }, [userId, notifications]);

  // ── Coach : inviter un athlète ──
  const sendCoachRequest = useCallback(async (athleteUserId, fromName) => {
    if (!supabase || !userId) return { error: "offline" };
    // Une seule invitation en attente par personne.
    const pending = sentInvites.find(i => i.user_id === athleteUserId && i.status === "unread");
    if (pending) return { error: "already_pending" };
    const { error } = await supabase.from("notifications").insert({
      user_id: athleteUserId,
      from_user_id: userId,
      type: "coach_request",
      payload: { fromName },
    });
    if (!error) fetchAll();
    return { error: error?.message ?? null };
  }, [userId, sentInvites, fetchAll]);

  // ── Athlète : répondre à une invitation ──
  const respondCoachRequest = useCallback(async (notif, accept, myName) => {
    if (!supabase || !userId) return { error: "offline" };
    if (accept) {
      // C'est CE insert qui crée le lien coach-athlète (RLS : athlète only).
      // ignoreDuplicates : si le lien existe déjà, no-op (pas de policy UPDATE
      // sur coach_athletes, un upsert-update échouerait).
      const { error } = await supabase.from("coach_athletes").upsert(
        { coach_id: notif.from_user_id, athlete_id: userId },
        { onConflict: "coach_id,athlete_id", ignoreDuplicates: true }
      );
      if (error) return { error: error.message };
    }
    await supabase.from("notifications")
      .update({ status: accept ? "accepted" : "declined" })
      .eq("id", notif.id);
    // Informer le coach de la réponse.
    if (notif.from_user_id) {
      await supabase.from("notifications").insert({
        user_id: notif.from_user_id,
        from_user_id: userId,
        type: accept ? "coach_accepted" : "coach_declined",
        payload: { fromName: myName },
      }).then(() => {}, () => {});
    }
    fetchAll();
    return { error: null };
  }, [userId, fetchAll]);

  // ── Coach : notifier l'athlète d'une mise à jour de planning ──
  const notifyPlanUpdate = useCallback(async (athleteUserId, fromName, summary) => {
    if (!supabase || !userId || !athleteUserId) return;
    await supabase.from("notifications").insert({
      user_id: athleteUserId,
      from_user_id: userId,
      type: "plan_update",
      payload: { fromName, ...summary },
    }).then(() => {}, () => {});
  }, [userId]);

  return {
    notifications, sentInvites, unreadCount,
    markInfosRead, sendCoachRequest, respondCoachRequest, notifyPlanUpdate,
    refreshNotifications: fetchAll,
  };
}
