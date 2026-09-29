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

export function clearSyncMeta() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  writeSyncBase(null, null);
}

// ─── LA BASE ─────────────────────────────────────────────────────────────────────────
// Le planning tel que le cloud le contenait à `syncedAt` : l'état sur lequel
// cet appareil et le cloud étaient d'accord la dernière fois. C'est la
// troisième voie de la fusion (`lib/merge-plan.js`) : sans elle, impossible de
// savoir si une séance différente ici a été modifiée ici, ou si on n'en a
// qu'une vieille copie.
//
// Elle porte la date qu'elle décrit (`at`) et ne sert que si c'est **bien**
// celle du marqueur : une base qui ne correspondrait plus à `syncedAt` ferait
// prendre des modifications d'ailleurs pour des modifications d'ici.
//
// Elle double la place du planning en localStorage. Si elle ne tient plus, on
// la jette : la fusion retombe sur deux voies, ce qui vaut mieux qu'un
// planning qui ne s'enregistrerait plus.
const BASE_KEY = "climbing_planner_base_v1";
let baseCache;   // { at, data } | null — undefined : pas encore lue

export function readSyncBase(at) {
  if (baseCache === undefined) {
    try { baseCache = JSON.parse(localStorage.getItem(BASE_KEY) || "null"); } catch { baseCache = null; }
  }
  if (!baseCache || !at || baseCache.at !== at) return null;
  return baseCache.data ?? null;
}

export function writeSyncBase(at, data) {
  baseCache = at && data ? { at, data } : null;
  try {
    if (baseCache) localStorage.setItem(BASE_KEY, JSON.stringify(baseCache));
    else localStorage.removeItem(BASE_KEY);
  } catch {
    dropSyncBase();
  }
}

// Place perdue au profit du planning lui-même (`saveData`) : c'est lui qui compte.
export function dropSyncBase() {
  baseCache = null;
  try { localStorage.removeItem(BASE_KEY); } catch { /* ignore */ }
}

// Un échange vient d'aboutir : le cloud contient `base` à la date `syncedAt`.
// `dirty` : reste-t-il du local que cet échange n'a pas emporté ?
export function settleSync({ userId, syncedAt, base, dirty = false }) {
  writeSyncBase(syncedAt, base);
  const prev = readSyncMeta();
  return writeSyncMeta({
    userId,
    syncedAt: syncedAt ?? null,
    dirtyAt: dirty ? (prev.dirtyAt || new Date().toISOString()) : null,
  });
}

// ─── LA DÉCISION ─────────────────────────────────────────────────────────────
// Pure, sans réseau ni stockage : elle prend l'état des deux côtés et rend le
// geste à faire. C'est la seule règle de synchronisation de l'app.
//
//   "pull"  — le cloud a du neuf, on l'adopte
//   "push"  — le local a du neuf, on l'envoie
//   "merge" — les DEUX ont bougé depuis notre dernier échange
//   "reset" — les données locales appartiennent à quelqu'un d'autre et le
//             compte n'a pas encore de ligne : on repart d'un planning vierge
//   "idle"  — les deux côtés sont d'accord, rien à faire
//
// Une note sur « merge ». La version précédente départageait les deux côtés à
// la date : le plus récent gagnait, l'autre passait à la trappe. C'est une
// perte garantie dès que chacun a ajouté quelque chose de son côté — et c'est
// exactement ce qu'on cherche à ne plus faire. On réunit donc les deux
// versions (`lib/merge-plan.js`) au lieu de choisir.
//
// Conséquence heureuse : `dirtyAt` n'est plus jamais comparé à une date
// serveur. Il ne répond plus qu'à « reste-t-il quelque chose à envoyer ? »,
// et l'horloge de l'appareil cesse d'avoir son mot à dire.
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
  const hasUnsent = !!meta?.dirtyAt;

  // On n'a jamais rien synchronisé pour ce compte sur cet appareil, ou la
  // ligne a bougé depuis notre dernier échange : quelqu'un d'autre a écrit.
  if (!known || cloud > known) return hasUnsent ? "merge" : "pull";

  // La ligne cloud, c'est notre propre dernier envoi.
  return hasUnsent ? "push" : "idle";
}
