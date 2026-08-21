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
