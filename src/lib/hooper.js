import { DATA } from "../theme/palette.js";

export function hooperLabel(total) {
  if (total <= 14) return "Bien récupéré";
  if (total <= 17) return "Modérément fatigué";
  if (total <= 20) return "Très fatigué";
  return "Surmenage";
}

export function hooperColor(total, isDark) {
  const scale = isDark ? DATA.hooper.dark : DATA.hooper.light;
  if (total <= 14) return scale[0];
  if (total <= 17) return scale[1];
  return scale[2];
}

// ─── Un journal est complet quand le Hooper l'est ────────────────────────────
// Le poids et la note du jour sont facultatifs : on ne pèse pas tous les
// matins, et il n'y a pas toujours quelque chose à écrire. Le ressenti, lui,
// ne se rattrape pas — c'est donc lui, et lui seul, qui décide si la journée
// est notée. Les quatre curseurs sont exigés : une entrée partielle n'est pas
// un ressenti.
//
// Définie ici plutôt que dans chaque écran : le widget, la cloche et le
// calendrier posent la même question et doivent répondre pareil.
export function isHooperFilled(data, dateISO) {
  const h = (data?.hooper || []).find(e => e.date === dateISO);
  if (!h) return false;
  return [h.sleep, h.fatigue, h.stress, h.soreness].every(v => v != null);
}

// ─── Ce que vaut une note, en toutes lettres ─────────────────────────────────
// Un chiffre de 1 à 7 ne dit rien tout seul, et l'échelle est **inversée** par
// rapport à l'intuition : 1 est le bon côté, 7 le mauvais. Sans phrase, on note
// son sommeil 6 en pensant « j'ai bien dormi ». Chaque cran porte donc sa
// formulation, affichée sous le curseur au moment où on le règle.
//
// Ordre du tableau : index 0 = note 1 (le meilleur) … index 6 = note 7.
export const HOOPER_SCALE = {
  sleep: [
    "Sommeil excellent",
    "Très bon sommeil",
    "Bon sommeil",
    "Sommeil correct",
    "Sommeil moyen",
    "Mauvais sommeil",
    "Très mauvais sommeil",
  ],
  fatigue: [
    "En pleine forme",
    "Très frais",
    "Bien reposé",
    "Légèrement entamé",
    "Fatigué",
    "Très fatigué",
    "Épuisé",
  ],
  stress: [
    "Parfaitement serein",
    "Très détendu",
    "Détendu",
    "Un peu tendu",
    "Tendu",
    "Très stressé",
    "Sous pression permanente",
  ],
  soreness: [
    "Aucune courbature",
    "Muscles très souples",
    "Légère raideur",
    "Quelques courbatures",
    "Courbatures marquées",
    "Très courbaturé",
    "Douleurs importantes",
  ],
};

// La phrase d'une note (1-7) pour un critère. Renvoie "" si l'un des deux
// n'est pas connu — un critère non renseigné n'a rien à dire.
export function hooperScaleLabel(key, value) {
  const scale = HOOPER_SCALE[key];
  if (!scale) return "";
  const i = Math.round(Number(value)) - 1;
  return scale[i] || "";
}

// Teinte d'une note isolée : les deux premiers crans sont bons, les deux
// derniers mauvais, le milieu est neutre. Même lecture que hooperColor() pour
// le total, mais à l'échelle d'un seul critère.
export function hooperScaleColor(value, isDark) {
  const scale = isDark ? DATA.hooper.dark : DATA.hooper.light;
  const v = Number(value);
  if (v <= 2) return scale[0];
  if (v <= 4) return scale[1];
  return scale[2];
}
