// ─── FUSION DE DEUX PLANNINGS ────────────────────────────────────────────────
// Quand deux appareils ont écrit depuis notre dernière synchronisation, écraser
// la ligne perd le travail de l'autre. C'est comme ça qu'une séance saisie sur
// le PC a disparu : le téléphone, qui ne l'avait jamais vue, a poussé sa copie
// par-dessus.
//
// On fusionne donc au lieu d'écraser, entrée par entrée :
//
//   · les collections identifiées (séances, cycles, rappels, échéances) sont
//     réunies par `id` — ce qui existe d'un seul côté est gardé ;
//   · les journaux datés (notes, poids, créatine, nutrition, Hooper, sommeil,
//     coches de rappels) sont réunis par date ;
//   · sur une entrée présente des deux côtés, et pour tout le reste (profil,
//     réglages), **le local gagne** : c'est l'appareil devant lequel quelqu'un
//     est assis.
//
// Limite assumée : une suppression faite sur l'autre appareil pendant la
// fenêtre de divergence peut être annulée par la fusion — l'entrée revient.
// Une séance qui réapparaît se resupprime en deux gestes ; une séance perdue ne
// se retrouve pas.

const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Réunion de deux listes d'objets identifiés. L'ordre local d'abord, puis ce
// que seul le cloud connaissait.
function mergeById(localList, cloudList, key = "id") {
  const local = Array.isArray(localList) ? localList : [];
  const cloud = Array.isArray(cloudList) ? cloudList : [];
  if (!cloud.length) return local;
  const seen = new Set(local.map(x => x?.[key]).filter(v => v != null));
  const extra = cloud.filter(x => x?.[key] != null && !seen.has(x[key]));
  // Sans identifiant des deux côtés, on ne sait pas dédupliquer : on garde le
  // local tel quel plutôt que d'inventer des doublons.
  return extra.length ? [...local, ...extra] : local;
}

// Les semaines : { "2026-08-17": [ [séances lundi], …, [séances dimanche] ] }
function mergeWeeks(localWeeks, cloudWeeks) {
  const out = { ...(cloudWeeks || {}) };
  for (const [week, localDays] of Object.entries(localWeeks || {})) {
    const cloudDays = (cloudWeeks || {})[week];
    if (!Array.isArray(cloudDays)) { out[week] = localDays; continue; }
    out[week] = (Array.isArray(localDays) ? localDays : []).map((day, i) =>
      mergeById(day, cloudDays[i]));
    // Un jour que seul le cloud connaissait (tableau plus long) : on le garde.
    if (cloudDays.length > out[week].length) {
      out[week] = [...out[week], ...cloudDays.slice(out[week].length)];
    }
  }
  return out;
}

// { [id]: { [date]: true } } — deux niveaux, le local gagne sur une même case.
function mergeNested(localMap, cloudMap) {
  const out = { ...(cloudMap || {}) };
  for (const [id, localInner] of Object.entries(localMap || {})) {
    out[id] = isPlainObject(localInner)
      ? { ...(isPlainObject(out[id]) ? out[id] : {}), ...localInner }
      : localInner;
  }
  return out;
}

const byDate = (l, c) => mergeById(l, c, "date");
const shallow = (l, c) => ({ ...(isPlainObject(c) ? c : {}), ...(isPlainObject(l) ? l : {}) });

// Une stratégie par clé. Tout ce qui n'est pas listé garde la valeur locale.
const STRATEGIES = {
  weeks:          mergeWeeks,
  weekMeta:       shallow,
  notes:          shallow,
  creatine:       shallow,
  weight:         shallow,
  nutrition:      shallow,
  profile:        shallow,
  reminderState:  mergeNested,
  hooper:         byDate,
  sleep:          byDate,
  mesocycles:     mergeById,
  customCycles:   mergeById,
  customSessions: mergeById,
  quickSessions:  mergeById,
  reminders:      mergeById,
  runBlocks:      mergeById,
  moveSuggestions: mergeById,
};

export function mergePlans(local, cloud) {
  if (!isPlainObject(cloud)) return local;
  if (!isPlainObject(local)) return cloud;
  const out = { ...cloud, ...local };
  for (const [key, strategy] of Object.entries(STRATEGIES)) {
    if (local[key] === undefined && cloud[key] === undefined) continue;
    out[key] = strategy(local[key], cloud[key]);
  }
  return out;
}
