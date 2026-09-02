import { getMondayOf, addDays, weekKey } from "./helpers.js";

// ─── OBJECTIF DE KILOMÈTRES PAR SEMAINE ──────────────────────────────────────
// Un plan de course se raisonne en volume hebdomadaire qui monte doucement, pas
// en charge de séance. D'où une piste à part, à côté des mésocycles : des blocs
// de N semaines, chacun avec un volume de départ et une progression en pour-
// cent, séparés par des semaines vides quand on veut couper.
//
// Deux décisions à connaître :
//
// 1. **Une semaine écrite à la main ne déplace pas la courbe.** Forcer la 4ᵉ
//    semaine à 30 km au lieu des 48 calculés ne change que cette semaine : la
//    5ᵉ repart de la courbe théorique (48 × 1,10). C'est ce qui fait qu'une
//    décharge reste une exception, au lieu de faire redescendre tout le plan
//    avec elle.
//
// 2. **Course et trail comptent, le vélo non.** Un kilomètre à pied et un
//    kilomètre à vélo ne veulent pas dire la même chose pour les jambes ; les
//    additionner rendrait l'objectif faux.

export const RUN_DISCIPLINES = ["running", "trail"];

export const DEFAULT_RUN_BLOCK = {
  label: "Bloc de course",
  durationWeeks: 4,
  baseKm: 30,
  increasePct: 10,
};

const round1 = (n) => Math.round(n * 10) / 10;

// Une valeur forcée peut arriver en chaîne depuis un champ de saisie, et "" y
// veut dire « pas de forçage » — à ne pas confondre avec 0, qui est une semaine
// de repos volontaire.
function forcedValue(overrides, i) {
  const v = overrides?.[i];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** L'objectif de chaque semaine d'un bloc, dans l'ordre. */
export function blockWeekTargets(block) {
  const n = Math.max(1, Math.round(Number(block?.durationWeeks) || 1));
  const base = Math.max(0, Number(block?.baseKm) || 0);
  const pct = Number(block?.increasePct) || 0;
  return Array.from({ length: n }, (_, i) => {
    // La courbe ne dépend QUE de l'index : c'est ce qui rend un forçage local.
    const theoretical = round1(base * Math.pow(1 + pct / 100, i));
    const forced = forcedValue(block?.overrides, i);
    return {
      week: i,
      km: forced != null ? round1(forced) : theoretical,
      theoretical,
      overridden: forced != null,
    };
  });
}

/** Le premier jour (lundi) de la semaine `i` d'un bloc. */
export function blockWeekMonday(block, i) {
  if (!block?.startDate) return null;
  return addDays(getMondayOf(new Date(block.startDate + "T12:00:00")), i * 7);
}

/** Le dernier jour couvert par un bloc — pour l'afficher en toutes lettres. */
export function blockLastDay(block) {
  const n = Math.max(1, Math.round(Number(block?.durationWeeks) || 1));
  const start = blockWeekMonday(block, 0);
  return start ? addDays(start, n * 7 - 1) : null;
}

/**
 * L'objectif qui couvre la semaine de `date`, ou `null`.
 *
 * Les blocs sont parcourus par date de début, pas dans l'ordre de la liste :
 * réarranger les cartes ne doit pas changer quelle semaine l'emporte quand deux
 * blocs se chevauchent (ce que l'éditeur signale par ailleurs).
 */
export function goalForWeek(blocks, date) {
  const monday = getMondayOf(date);
  const dated = (blocks || [])
    .filter(b => b?.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const b of dated) {
    const start = getMondayOf(new Date(b.startDate + "T12:00:00"));
    // Arrondi plutôt qu'une division sèche : un changement d'heure met 23 ou
    // 25 heures dans une journée, et deux lundis ne sont alors plus à un
    // multiple exact de 86 400 000 ms.
    const i = Math.round((monday - start) / 86400000) / 7;
    if (!Number.isInteger(i) || i < 0) continue;
    const targets = blockWeekTargets(b);
    if (i >= targets.length) continue;
    return { ...targets[i], block: b, weeks: targets.length };
  }
  return null;
}

/** Deux blocs qui se recouvrent : l'éditeur doit pouvoir le dire. */
export function overlappingBlockIds(blocks) {
  const spans = (blocks || [])
    .filter(b => b?.startDate)
    .map(b => ({
      id: b.id,
      from: +getMondayOf(new Date(b.startDate + "T12:00:00")),
      to: +blockLastDay(b),
    }))
    .sort((a, b) => a.from - b.from);
  const bad = new Set();
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].from <= spans[i - 1].to) {
      bad.add(spans[i].id);
      bad.add(spans[i - 1].id);
    }
  }
  return bad;
}

/**
 * Les kilomètres d'une semaine, séparés en trois : ce qui est fait, ce qui est
 * encore au planning, et ce qu'il reste avant l'objectif.
 *
 * Une séance **manquée** ne compte nulle part : elle n'a pas été courue, et la
 * garder en « planifié » laisserait croire que la semaine peut encore être
 * bouclée alors qu'elle est passée.
 */
export function weekRunKm(data, date) {
  const days = data?.weeks?.[weekKey(getMondayOf(date))] || [];
  let done = 0, planned = 0;
  for (const day of days) {
    for (const s of day || []) {
      if (!s || !RUN_DISCIPLINES.includes(s.discipline)) continue;
      const km = Number(s.metrics?.distanceKm);
      if (!Number.isFinite(km) || km <= 0) continue;
      const fb = s.feedback;
      if (fb?.done === true) done += km;
      else if (fb?.done !== false && fb?.status !== "not_done") planned += km;
    }
  }
  return { done: round1(done), planned: round1(planned) };
}

/** Tout ce qu'il faut pour dessiner la semaine : objectif, réalisé, prévu. */
export function weekRunSummary(data, blocks, date) {
  const goal = goalForWeek(blocks, date);
  const { done, planned } = weekRunKm(data, date);
  return {
    goal: goal ? goal.km : null,
    done, planned,
    block: goal?.block || null,
    weekIndex: goal ? goal.week : null,
    weeks: goal ? goal.weeks : null,
    overridden: !!goal?.overridden,
  };
}

/**
 * La géométrie de la barre, en pourcentages — trois segments bout à bout.
 *
 * Quand le total dépasse l'objectif, la barre se met à l'échelle du total
 * plutôt que de saturer : on voit de combien on a débordé, et un repère marque
 * l'endroit où l'objectif se trouvait.
 */
export function goalBarSegments(done, planned, goal) {
  const d = Math.max(0, done || 0);
  const p = Math.max(0, planned || 0);
  const g = Math.max(0, goal || 0);
  const total = d + p;
  const scale = Math.max(g, total);
  if (scale <= 0) return { done: 0, planned: 0, remaining: 0, over: false, goalMark: null };
  const pctOf = (v) => (v / scale) * 100;
  return {
    done: pctOf(d),
    planned: pctOf(p),
    remaining: Math.max(0, pctOf(g - total)),
    over: total > g && g > 0,
    goalMark: total > g && g > 0 ? pctOf(g) : null,
  };
}
