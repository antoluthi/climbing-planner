import { addDays, localDateStr, weekKey, getMondayOf, isEventItem } from "./helpers.js";
import { isHooperFilled } from "./hooper.js";

// ─── CE QUI RESTE À NOTER ────────────────────────────────────────────────────
// Deux oublis se rattrapent, et aucun des deux ne se voyait dans l'app : le
// ressenti du jour, et le retour sur une séance passée. Le tiroir d'Android le
// disait (lib/notifications.js), la cloche non — donc depuis un navigateur, ou
// l'app rouverte après avoir balayé la notification, plus rien ne le rappelait.
//
// Rien n'est stocké : la liste se **déduit** du planning à chaque rendu. Une
// notification en base demanderait d'être créée, synchronisée puis effacée au
// moment exact où la journée est notée — trois occasions de mentir. Ici, noter
// son ressenti fait disparaître la ligne, par construction.
//
// Les deux fenêtres reprennent celles des notifications Android, pour que les
// deux systèmes disent la même chose : trois jours pour le ressenti, sept pour
// les séances.

const HOOPER_DAYS = 3;
const FEEDBACK_DAYS = 7;
const DEFAULT_LEN_MIN = 90;   // séance sans durée : due 1 h 30 après le départ

// Une séance notée n'a plus rien à demander. Un ressenti *neutre* (statut
// retiré, notes seules) n'est pas une séance notée — c'est même l'inverse.
function isSettled(s) {
  const f = s?.feedback;
  return !!f && (f.done != null || f.status != null);
}

// La séance est-elle derrière nous ? Un jour révolu, oui. Aujourd'hui, seulement
// une fois l'heure de fin passée — réclamer un ressenti à midi pour une séance
// de 19 h n'a aucun sens. Sans heure de départ, on attend le lendemain.
function isOver(session, date, now) {
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (day < today) return true;
  if (day > today) return false;
  if (!session.startTime) return false;
  const [h, m] = String(session.startTime).split(":").map(Number);
  const end = new Date(date);
  end.setHours(h || 0, m || 0, 0, 0);
  return new Date(end.getTime() + (Number(session.estimatedTime) || DEFAULT_LEN_MIN) * 60000) <= now;
}

// Renvoie les lignes à afficher, les plus récentes d'abord. Chacune porte de
// quoi l'ouvrir : une date pour le journal, une position (semaine, jour, index)
// pour une séance.
export function pendingItems(data, now = new Date()) {
  const out = [];
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  // ── Ressenti du jour ──
  for (let i = 0; i < HOOPER_DAYS; i++) {
    const date = addDays(today, -i);
    const dateISO = localDateStr(date);
    if (isHooperFilled(data, dateISO)) continue;
    out.push({
      id: `hooper:${dateISO}`,
      kind: "hooper",
      dateISO,
      daysAgo: i,
      // Trois lignes « Ressenti du jour » d'affilée ne se distinguent pas :
      // les journées passées portent donc leur nom.
      title: i === 0 ? "Ressenti du jour"
        : i === 1 ? "Ressenti d'hier"
        : `Ressenti de ${date.toLocaleDateString("fr-FR", { weekday: "long" })}`,
      body: i === 0
        ? "Sommeil, fatigue, stress, courbatures — une minute."
        : "Journée passée sans ressenti noté.",
    });
  }

  // ── Retours de séance ──
  for (let i = 0; i < FEEDBACK_DAYS; i++) {
    const date = addDays(today, -i);
    const dateISO = localDateStr(date);
    const wKey = weekKey(getMondayOf(date));
    const dayIndex = (date.getDay() + 6) % 7;
    const list = data?.weeks?.[wKey]?.[dayIndex] || [];
    list.forEach((s, sessionIndex) => {
      if (!s || isEventItem(s) || isSettled(s) || !isOver(s, date, now)) return;
      out.push({
        id: `feedback:${s.id || `${dateISO}-${sessionIndex}`}`,
        kind: "feedback",
        dateISO,
        daysAgo: i,
        weekKey: wKey,
        dayIndex,
        sessionIndex,
        title: s.name || "Séance",
        body: "Séance passée sans retour.",
      });
    });
  }

  return out.sort((a, b) => a.daysAgo - b.daysAgo);
}
