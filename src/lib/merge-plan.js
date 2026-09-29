// ─── FUSION DE DEUX PLANNINGS ────────────────────────────────────────────────
// Deux appareils ont écrit depuis leur dernier accord : on ne choisit pas un
// gagnant, on réunit — séance par séance, jour par jour, champ par champ.
//
// ⚠️ **Réunir à deux voies ne suffit pas.** Face au local et au cloud seuls, une
// séance présente des deux côtés avec deux contenus différents ne dit pas qui
// l'a changée : peut-être le téléphone, peut-être qu'il n'en a qu'une vieille
// copie. L'ancienne règle, « le local gagne », donnait alors raison à la copie
// périmée sur **toutes** les séances qu'il n'avait pas touchées — le PC notait A
// et B, le téléphone notait C hors ligne, et à la reconnexion A et B perdaient
// leur ressenti. Reproduit, et c'est ce qui a vidé un PC sous les yeux de son
// utilisateur.
//
// La troisième voie, c'est la **base** : l'état sur lequel les deux côtés
// étaient d'accord la dernière fois (`lib/sync-meta.js` la garde). Entrée par
// entrée :
//
//   local = base          → seul le cloud a changé : on prend le cloud
//   cloud = base          → seul le local a changé : on prend le local
//   les deux ont changé   → des objets : on descend champ par champ ;
//                           sinon le local gagne (l'appareil en main)
//
// Une entrée absente d'un côté et intacte de l'autre a été **supprimée** : la
// suppression passe (à deux voies, elle revenait). Supprimée d'un côté et
// modifiée de l'autre, elle est gardée — mieux vaut une séance à resupprimer
// qu'une séance perdue.
//
// Sans base (première synchronisation après la mise à jour, base perdue faute
// de place), on retombe sur la réunion à deux voies d'avant : elle ne perd
// jamais ce qui n'existe que d'un côté, c'est tout ce qu'on peut garantir.

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Égalité de contenu, indifférente à l'ordre des clés. Une clé qui vaut
// `undefined` compte comme absente : le JSON la perd de toute façon.
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter(k => a[k] !== undefined);
  const kb = Object.keys(b).filter(k => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

// ── Le cas général ───────────────────────────────────────────────────────────
// Trois versions d'une même valeur ; `undefined` = absente de ce côté.
export function merge3(base, local, cloud) {
  if (deepEqual(local, cloud)) return local;
  if (deepEqual(local, base)) return cloud;
  if (deepEqual(cloud, base)) return local;
  // Les deux côtés ont changé, et pas de la même façon.
  if (local === undefined) return cloud;          // supprimé ici, modifié là-bas : on garde
  if (cloud === undefined) return local;
  if (isObj(local) && isObj(cloud)) return mergeObjects3(isObj(base) ? base : {}, local, cloud);
  if (isKeyedList(local, "id") && isKeyedList(cloud, "id")) {
    return mergeList3(Array.isArray(base) ? base : [], local, cloud, "id");
  }
  return local;
}

function mergeObjects3(base, local, cloud) {
  const out = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(cloud), ...Object.keys(base)])) {
    const v = merge3(base[k], local[k], cloud[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const isKeyedList = (v, key) => Array.isArray(v) && v.every(x => isObj(x) && x[key] != null);

// Clés d'une liste : la valeur de `key`, suffixée pour ses doublons (« a »,
// « a#1 »…) — un doublon écrasé par son jumeau serait une entrée perdue.
function keyed(list, key) {
  const out = [];
  const seen = new Map();
  for (const x of list || []) {
    const k = x?.[key];
    if (k == null) continue;
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    out.push([n ? `${k}#${n}` : String(k), x]);
  }
  return out;
}

const sameSeq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Réunion de deux listes d'objets identifiés (séances d'un modèle, cycles,
// rappels, échéances, journaux par date). L'ordre vient de celui qui a
// réordonné par rapport à la base — un mésocycle glissé sur le PC doit rester
// glissé — et à défaut du cloud ; ce que seul l'autre côté connaît suit.
export function mergeList3(base, local, cloud, key = "id") {
  const B = new Map(keyed(base, key)), L = keyed(local, key), C = keyed(cloud, key);
  const Lm = new Map(L), Cm = new Map(C);
  const merged = new Map();
  for (const k of new Set([...Lm.keys(), ...Cm.keys(), ...B.keys()])) {
    const v = merge3(B.get(k), Lm.get(k), Cm.get(k));
    if (v !== undefined) merged.set(k, v);
  }
  const lSeq = L.map(([k]) => k), cSeq = C.map(([k]) => k), bSeq = [...B.keys()];
  const inter = (a, b) => { const s = new Set(b); return a.filter(k => s.has(k)); };
  const localReordered = !sameSeq(inter(lSeq, bSeq), inter(bSeq, lSeq));
  const order = localReordered ? [...lSeq, ...cSeq] : [...cSeq, ...lSeq];
  const out = [];
  const placed = new Set();
  for (const k of order) {
    if (placed.has(k) || !merged.has(k)) continue;
    placed.add(k);
    out.push(merged.get(k));
  }
  // Sans clé, on ne sait pas suivre une entrée : on garde celles du local.
  return [...out, ...(local || []).filter(x => x?.[key] == null)];
}

// ── Les semaines ─────────────────────────────────────────────────────────────
// { "2026-08-17": [ [séances lundi], …, [séances dimanche] ] }. Une séance se
// suit par son `id` à travers **toutes** les semaines, pas jour par jour : une
// séance déplacée sur le PC pendant qu'on la notait sur le téléphone doit
// arriver au nouveau jour avec son ressenti, pas en double. Sa place est un
// champ comme un autre (`semaine|jour`), fusionné à trois voies.
//
// Deux cas n'ont pas d'identifiant sûr : une séance sans `id` (anciennes
// données) et un `id` partagé par plusieurs séances (planifiées depuis le même
// modèle). Elles se suivent alors par leur place et, sans `id`, leur contenu :
// une modification devient « retirée puis ajoutée », ce qui reste juste.
function flattenWeeks(weeks) {
  const count = new Map();
  for (const days of Object.values(weeks || {})) {
    if (!Array.isArray(days)) continue;
    for (const day of days) for (const s of day || []) {
      if (s?.id != null) count.set(s.id, (count.get(s.id) || 0) + 1);
    }
  }
  const out = new Map();
  for (const [wk, days] of Object.entries(weeks || {})) {
    if (!Array.isArray(days)) continue;
    days.forEach((day, di) => {
      const seen = new Map();
      (day || []).forEach((s, idx) => {
        let k;
        if (s?.id != null && count.get(s.id) === 1) k = `id:${s.id}`;
        else {
          const raw = s?.id != null ? `dup:${s.id}` : `anon:${JSON.stringify(s)}`;
          const n = seen.get(raw) || 0;
          seen.set(raw, n + 1);
          k = `${raw}@${wk}|${di}#${n}`;
        }
        out.set(k, { pos: `${wk}|${di}`, s, idx });
      });
    });
  }
  return out;
}

export function mergeWeeks3(base, local, cloud) {
  const B = flattenWeeks(base), L = flattenWeeks(local), C = flattenWeeks(cloud);
  const byPos = new Map();
  for (const k of new Set([...L.keys(), ...C.keys(), ...B.keys()])) {
    const b = B.get(k), l = L.get(k), c = C.get(k);
    const s = merge3(b?.s, l?.s, c?.s);
    if (s === undefined) continue;
    const pos = merge3(b?.pos, l?.pos, c?.pos) ?? l?.pos ?? c?.pos;
    // Dans un jour : l'ordre local d'abord, puis ce que seul le cloud y a mis.
    const rank = l?.pos === pos ? l.idx : c?.pos === pos ? 1e6 + c.idx : 2e6;
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push({ s, rank });
  }
  const out = {};
  for (const wk of new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})])) {
    const l = local?.[wk], c = cloud?.[wk];
    // Une forme inattendue (pas un tableau de jours) : on n'y touche pas.
    if (!Array.isArray(l) && !Array.isArray(c)) { out[wk] = l !== undefined ? l : c; continue; }
    const len = Math.max(7, Array.isArray(l) ? l.length : 0, Array.isArray(c) ? c.length : 0);
    out[wk] = Array.from({ length: len }, (_, di) =>
      (byPos.get(`${wk}|${di}`) || []).sort((a, b) => a.rank - b.rank).map(x => x.s));
  }
  return out;
}

// ── Le planning entier ───────────────────────────────────────────────────────
const byId   = (b, l, c) => mergeList3(b || [], l || [], c || [], "id");
const byDate = (b, l, c) => mergeList3(b || [], l || [], c || [], "date");
const STRATEGIES = {
  weeks:           (b, l, c) => mergeWeeks3(b || {}, l || {}, c || {}),
  hooper:          byDate,
  sleep:           byDate,
  mesocycles:      byId,
  customCycles:    byId,
  customSessions:  byId,
  quickSessions:   byId,
  reminders:       byId,
  runBlocks:       byId,
  moveSuggestions: byId,
};

export function mergePlans(local, cloud, base) {
  if (!isObj(cloud)) return local;
  if (!isObj(local)) return cloud;
  if (!isObj(base)) return mergePlansTwoWay(local, cloud);
  if (deepEqual(local, cloud)) return local;
  const out = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])) {
    const b = base[k], l = local[k], c = cloud[k];
    let v;
    if (deepEqual(l, c)) v = l;
    else if (deepEqual(l, b)) v = c;
    else if (deepEqual(c, b)) v = l;
    else v = STRATEGIES[k] ? STRATEGIES[k](b, l, c) : merge3(b, l, c);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ── Sans base : la réunion à deux voies d'avant ──────────────────────────────
// Collections réunies par `id`, journaux par date, et le local qui gagne sur
// une entrée présente des deux côtés. Elle ne sait ni propager une suppression
// ni reconnaître une copie périmée : c'est pour ça que la base existe.
function mergeById2(localList, cloudList, key = "id") {
  const local = Array.isArray(localList) ? localList : [];
  const cloud = Array.isArray(cloudList) ? cloudList : [];
  if (!cloud.length) return local;
  const seen = new Set(local.map(x => x?.[key]).filter(v => v != null));
  const extra = cloud.filter(x => x?.[key] != null && !seen.has(x[key]));
  return extra.length ? [...local, ...extra] : local;
}

function mergeWeeks2(localWeeks, cloudWeeks) {
  const out = { ...(cloudWeeks || {}) };
  for (const [week, localDays] of Object.entries(localWeeks || {})) {
    const cloudDays = (cloudWeeks || {})[week];
    if (!Array.isArray(cloudDays)) { out[week] = localDays; continue; }
    out[week] = (Array.isArray(localDays) ? localDays : []).map((day, i) => mergeById2(day, cloudDays[i]));
    if (cloudDays.length > out[week].length) out[week] = [...out[week], ...cloudDays.slice(out[week].length)];
  }
  return out;
}

function mergeNested2(localMap, cloudMap) {
  const out = { ...(cloudMap || {}) };
  for (const [id, localInner] of Object.entries(localMap || {})) {
    out[id] = isObj(localInner) ? { ...(isObj(out[id]) ? out[id] : {}), ...localInner } : localInner;
  }
  return out;
}

const shallow2 = (l, c) => ({ ...(isObj(c) ? c : {}), ...(isObj(l) ? l : {}) });
const STRATEGIES_2 = {
  weeks: mergeWeeks2, weekMeta: shallow2, notes: shallow2, creatine: shallow2, weight: shallow2,
  nutrition: shallow2, profile: shallow2, reminderState: mergeNested2,
  hooper: (l, c) => mergeById2(l, c, "date"), sleep: (l, c) => mergeById2(l, c, "date"),
  mesocycles: mergeById2, customCycles: mergeById2, customSessions: mergeById2, quickSessions: mergeById2,
  reminders: mergeById2, runBlocks: mergeById2, moveSuggestions: mergeById2,
};

function mergePlansTwoWay(local, cloud) {
  const out = { ...cloud, ...local };
  for (const [key, strategy] of Object.entries(STRATEGIES_2)) {
    if (local[key] === undefined && cloud[key] === undefined) continue;
    out[key] = strategy(local[key], cloud[key]);
  }
  return out;
}
