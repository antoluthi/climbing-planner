import supabase from "./supabase.js";

// ─── AVATAR STORAGE ──────────────────────────────────────────────────────────
// Upload de l'avatar utilisateur dans le bucket Supabase Storage `avatars`.
// Path : {userId}.{ext}  (jpg ou png selon le type d'origine).
// Le bucket doit être public en lecture (voir supabase/migrations/
// 20260512_avatars_bucket.sql pour les policies INSERT/UPDATE/DELETE).

const BUCKET = "avatars";

// Convertit un data URL ("data:image/...;base64,...") en Blob.
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

// Upload l'avatar et renvoie l'URL publique. Cache-bust via query param.
export async function uploadAvatar(userId, dataUrl) {
  if (!supabase) throw new Error("Supabase non configuré");
  if (!userId) throw new Error("Pas d'utilisateur authentifié");
  if (!dataUrl) throw new Error("Pas de photo à uploader");

  const blob = await dataUrlToBlob(dataUrl);
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `${userId}.${ext}`;

  // Supprime l'ancien fichier de l'autre extension (jpg↔png) pour éviter les
  // résidus. Ignore l'erreur (le fichier peut ne pas exister).
  const otherExt = ext === "jpg" ? "png" : "jpg";
  await supabase.storage.from(BUCKET).remove([`${userId}.${otherExt}`]).catch(() => {});

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      upsert: true,
      cacheControl: "3600",
      contentType: blob.type || `image/${ext}`,
    });
  if (error) throw error;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("URL publique introuvable");
  // Cache-bust pour forcer le refresh dans le navigateur après update.
  return `${pub.publicUrl}?v=${Date.now()}`;
}

// Supprime l'avatar (les deux extensions, par sécurité).
export async function deleteAvatar(userId) {
  if (!supabase || !userId) return;
  try {
    await supabase.storage.from(BUCKET).remove([`${userId}.jpg`, `${userId}.png`]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[avatar] delete failed:", e);
  }
}
