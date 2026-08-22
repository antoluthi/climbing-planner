// ─── MARQUEUR DE SYNCHRONISATION ─────────────────────────────────────────────
// Ce que cet appareil sait de l'état du cloud, rangé à côté du planning :
//
//   userId    — à qui appartiennent les données locales
//   syncedAt  — l'`updated_at` de la ligne cloud lors de notre dernier échange
//               réussi. C'est une valeur **produite par Postgres**, qu'on se
//               contente de recopier.
//   dirtyAt   — heure locale de la dernière modification pas encore confirmée
//               par le serveur ; null quand tout est passé.
//
// Comparer `syncedAt` à l'`updated_at` courant de la ligne répond à la seule
// question qui compte — « quelqu'un d'autre a-t-il écrit depuis ? » — et les
// deux valeurs viennent de la même horloge (celle du serveur), donc la
// comparaison tient même si l'appareil est réglé de travers. `dirtyAt` vient
// de l'horloge locale : il ne sert qu'à départager le cas où les deux côtés
// ont changé, et c'est le seul endroit où un décalage d'horloge peut jouer.

const KEY = "climbing_planner_sync_v1";

export function readSyncMeta() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { userId: null, syncedAt: null, dirtyAt: null };
    const parsed = JSON.parse(raw);
    return {
      userId:   parsed.userId   ?? null,
      syncedAt: parsed.syncedAt ?? null,
      dirtyAt:  parsed.dirtyAt  ?? null,
    };
  } catch {
    return { userId: null, syncedAt: null, dirtyAt: null };
  }
}

export function writeSyncMeta(patch) {
  try {
    const next = { ...readSyncMeta(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return readSyncMeta();
  }
}

// Une modification locale attend d'être envoyée. On garde la PREMIÈRE heure
// non synchronisée : c'est l'ancienneté de la divergence qui nous intéresse,
// pas celle de la dernière frappe.
export function markDirty(at = new Date().toISOString()) {
  const meta = readSyncMeta();
  if (meta.dirtyAt) return meta;
  return writeSyncMeta({ dirtyAt: at });
}

export function markSynced(userId, syncedAt) {
  return writeSyncMeta({ userId, syncedAt: syncedAt ?? null, dirtyAt: null });
}

export function clearSyncMeta() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// ─── LA DÉCISION ─────────────────────────────────────────────────────────────
// Pure, sans réseau ni stockage : elle prend l'état des deux côtés et rend le
// geste à faire. C'est la seule règle de synchronisation de l'app.
//
//   "pull"  — le cloud a du neuf, on l'adopte
//   "push"  — le local a du neuf, on l'envoie
//   "reset" — les données locales appartiennent à quelqu'un d'autre et le
//             compte n'a pas encore de ligne : on repart d'un planning vierge
//   "idle"  — les deux côtés sont d'accord, rien à faire
const ts = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? 0 : t; };

export function decideSync({ hasCloudRow, cloudUpdatedAt, meta, userId }) {
  const localOwner = meta?.userId ?? null;
  const foreignData = localOwner != null && localOwner !== userId;

  // Pas encore de ligne : ce compte n'a jamais rien enregistré.
  if (!hasCloudRow) return foreignData ? "reset" : "push";

  // Le localStorage est partagé par navigateur : des données appartenant à un
  // autre compte ne doivent jamais remonter dans celui-ci.
  if (foreignData) return "pull";

  const known = ts(meta?.syncedAt);
  const cloud = ts(cloudUpdatedAt);
  const dirty = ts(meta?.dirtyAt);

  // On n'a jamais rien synchronisé pour ce compte sur cet appareil, ou la
  // ligne a bougé depuis notre dernier échange : quelqu'un d'autre a écrit.
  if (!known || cloud > known) {
    // On ne reprend le dessus que si nos modifications sont plus récentes que
    // cette écriture-là. Sinon le cloud gagne — c'est le cas courant : on
    // ouvre l'app sur un appareil resté en arrière-plan pendant qu'on
    // travaillait sur l'autre.
    return dirty && dirty > cloud ? "push" : "pull";
  }

  // La ligne cloud, c'est notre propre dernier envoi.
  return dirty ? "push" : "idle";
}
