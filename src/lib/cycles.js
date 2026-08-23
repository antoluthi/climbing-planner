import { addDays, localDateStr } from "./helpers.js";

// ─── CHAÎNAGE DES MÉSOCYCLES ─────────────────────────────────────────────────
// Encoder un plan revenait à saisir une date par mésocycle, à la main, et à
// toutes les décaler dès qu'un bloc changeait de durée. Ici une seule date est
// saisie — **l'ancre** — et les autres en découlent : ceux d'après commencent
// quand le précédent finit, ceux d'avant remontent d'autant de semaines.
//
// L'ancre n'est pas une nouvelle représentation : `startDate` reste écrite sur
// chaque mésocycle (c'est ce que lisent `getMesoForDate`, la timeline et les
// vues). Le drapeau `anchor` dit seulement laquelle des dates est saisie et
// laquelle est calculée.

const parseDay = (s) => new Date(s + "T00:00:00");

export function weeksOf(meso) {
  const n = Math.round(Number(meso?.durationWeeks));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Quelle date fait autorité : l'ancre explicite, sinon la première datée.
// `null` = aucune date nulle part, il n'y a rien à chaîner.
export function resolveAnchorId(mesocycles) {
  const list = mesocycles || [];
  const explicit = list.find(m => m.anchor && m.startDate);
  if (explicit) return explicit.id;
  const dated = list.find(m => m.startDate);
  return dated ? dated.id : null;
}

// Réécrit `startDate` sur toute la liste à partir de l'ancre. Renvoie la liste
// d'origine si rien ne bouge — un plan déjà cohérent ne doit pas se rendre
// « modifié » à chaque passage (la synchro le repousserait pour rien).
export function recomputeMesoDates(mesocycles, anchorId = null) {
  const list = mesocycles || [];
  const id = anchorId ?? resolveAnchorId(list);
  const at = list.findIndex(m => m.id === id);
  if (at < 0 || !list[at].startDate) return list;

  const out = list.slice();
  let changed = false;
  const write = (k, date) => {
    const iso = localDateStr(date);
    if (out[k].startDate === iso) return;
    out[k] = { ...out[k], startDate: iso };
    changed = true;
  };

  let cursor = parseDay(list[at].startDate);
  for (let k = at; k < out.length; k++) {
    write(k, cursor);
    cursor = addDays(cursor, weeksOf(out[k]) * 7);
  }

  cursor = parseDay(list[at].startDate);
  for (let k = at - 1; k >= 0; k--) {
    cursor = addDays(cursor, -weeksOf(list[k]) * 7);
    write(k, cursor);
  }

  return changed ? out : list;
}

// Ancre choisie à la main : ce mésocycle garde la date saisie, les autres
// suivent. Une date vide est ignorée — effacer un champ ne doit pas effacer
// la planification entière.
export function setAnchor(mesocycles, id, startDate) {
  const list = mesocycles || [];
  if (!startDate) return list;
  const next = list.map(m => {
    if (m.id === id) return { ...m, anchor: true, startDate };
    return m.anchor ? { ...m, anchor: false } : m;
  });
  return recomputeMesoDates(next, id);
}

// Réarrangement libre : l'ancre garde sa date où qu'elle atterrisse, le reste
// se rechaîne autour.
export function moveMeso(mesocycles, from, to) {
  const list = mesocycles || [];
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return recomputeMesoDates(out);
}

// Fin (exclusive) d'un mésocycle — le jour où le suivant commence.
export function mesoEndDate(meso) {
  if (!meso?.startDate) return null;
  return addDays(parseDay(meso.startDate), weeksOf(meso) * 7);
}

// Dates de début de chaque microcycle, chaînées depuis le mésocycle.
export function microStarts(meso) {
  if (!meso?.startDate) return [];
  let cursor = parseDay(meso.startDate);
  return (meso.microcycles || []).map(micro => {
    const start = cursor;
    cursor = addDays(cursor, weeksOf(micro) * 7);
    return start;
  });
}

// Dernier jour du bloc — celui qu'on lit sur un calendrier, pas le premier du
// suivant.
export function mesoLastDay(meso) {
  const end = mesoEndDate(meso);
  return end ? addDays(end, -1) : null;
}
