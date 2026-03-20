import { useState, useEffect, useRef, useCallback } from "react";
import supabase from "../lib/supabase.js";

export function useSessionBlocks(userId) {
  const [blocks, setBlocks] = useState([]);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const fetchBlocks = useCallback(async () => {
    if (!supabase) return;
    let { data, error } = await supabase
      .from("session_blocks")
      .select("id, block_type, name, duration, charge, description, config")
      .eq("is_active", true)
      .order("block_type", { ascending: true })
      .order("name",       { ascending: true });
    // Colonne config absente (migration pas encore appliquée) → retry sans config
    if (error?.code === "PGRST204" || (error && !data)) {
      ({ data, error } = await supabase
        .from("session_blocks")
        .select("id, block_type, name, duration, charge, description")
        .eq("is_active", true)
        .order("block_type", { ascending: true })
        .order("name",       { ascending: true }));
    }
    if (error || !data) return;
    setBlocks(data.map(r => ({
      id: r.id,
      blockType: r.block_type,
      name: r.name,
      duration: r.duration ?? undefined,
      charge: r.charge ?? 0,
      description: r.description ?? "",
      config: r.config ?? null,
    })));
  }, []);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks, userId]);

  const saveBlock = useCallback(async (block) => {
    const uid = userIdRef.current;
    if (!supabase || !uid) return;
    const row = {
      block_type: block.blockType,
      name: block.name,
      duration: block.duration ?? null,
      charge: block.charge ?? 0,
      description: block.description || null,
      config: block.config ?? null,
      is_active: true,
    };
    const rowNoConfig = { ...row };
    delete rowNoConfig.config;
    const tryOp = async (rowObj) => {
      if (block.id && typeof block.id === "number") {
        return supabase.from("session_blocks").update(rowObj).eq("id", block.id);
      }
      return supabase.from("session_blocks").insert({ ...rowObj, created_by: uid });
    };
    let { error } = await tryOp(row);
    // Fallback si colonne config absente (migration pas encore appliquée)
    if (error?.code === "PGRST204") {
      ({ error } = await tryOp(rowNoConfig));
    }
    if (error) console.error("[saveBlock]", error.message);
    fetchBlocks();
  }, [fetchBlocks]);

  const deleteBlock = useCallback(async (id) => {
    if (!supabase) return;
    await supabase.from("session_blocks").delete().eq("id", id);
    fetchBlocks();
  }, [fetchBlocks]);

  return { blocks, saveBlock, deleteBlock };
}
