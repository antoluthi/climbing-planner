import { useState, useEffect, useCallback } from "react";
import supabase from "../lib/supabase.js";

export function useCoachAthletes(userId) {
  const [athletes, setAthletes] = useState([]);

  const fetchAthletes = useCallback(async () => {
    if (!supabase || !userId) { setAthletes([]); return; }
    const { data: relations } = await supabase
      .from("coach_athletes")
      .select("id, athlete_id")
      .eq("coach_id", userId);
    if (!relations?.length) { setAthletes([]); return; }
    const { data: plans } = await supabase
      .from("climbing_plans")
      .select("user_id, first_name, last_name")
      .in("user_id", relations.map(r => r.athlete_id));
    const nameMap = Object.fromEntries((plans || []).map(p => [p.user_id, p]));
    setAthletes(relations.map(r => ({
      relationId: r.id,
      userId:     r.athlete_id,
      firstName:  nameMap[r.athlete_id]?.first_name || "?",
      lastName:   nameMap[r.athlete_id]?.last_name  || "",
    })));
  }, [userId]);

  useEffect(() => { fetchAthletes(); }, [fetchAthletes]);

  const searchAthletes = useCallback(async (term) => {
    if (!supabase || !term.trim()) return [];
    const { data } = await supabase.rpc("search_athletes", { search_term: term.trim() });
    return (data || []).map(r => ({
      userId:    r.user_id,
      firstName: r.first_name || "",
      lastName:  r.last_name  || "",
    }));
  }, []);

  const addAthlete = useCallback(async (athleteUserId) => {
    if (!supabase || !userId) return;
    await supabase.from("coach_athletes").upsert(
      { coach_id: userId, athlete_id: athleteUserId },
      { onConflict: "coach_id,athlete_id" }
    );
    fetchAthletes();
  }, [userId, fetchAthletes]);

  const removeAthlete = useCallback(async (relationId) => {
    if (!supabase) return;
    await supabase.from("coach_athletes").delete().eq("id", relationId);
    fetchAthletes();
  }, [fetchAthletes]);

  return { athletes, searchAthletes, addAthlete, removeAthlete };
}
