import { useState, useEffect, useCallback } from "react";
import supabase from "../lib/supabase.js";

export function useCommunitySessionsSync(session) {
  const [communitySessions, setCommunitySessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchCommunity = useCallback(async () => {
    if (!supabase || !session) { setCommunitySessions([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("community_sessions")
      .select("session, user_id")
      .order("updated_at", { ascending: false });
    if (data) setCommunitySessions(data.map(r => ({ ...r.session, _communityUserId: r.user_id })));
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchCommunity(); }, [fetchCommunity]);

  const pushToCommunity = useCallback(async (customSession, userId) => {
    if (!supabase || !userId) return;
    await supabase.from("community_sessions").upsert({
      user_id: userId,
      session_id: String(customSession.id),
      session: customSession,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,session_id" });
    await fetchCommunity();
  }, [fetchCommunity]);

  const deleteFromCommunity = useCallback(async (sessionId, userId) => {
    if (!supabase || !userId) return;
    await supabase.from("community_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("session_id", String(sessionId));
    await fetchCommunity();
  }, [fetchCommunity]);

  return { communitySessions, loading, pushToCommunity, deleteFromCommunity, fetchCommunity };
}
