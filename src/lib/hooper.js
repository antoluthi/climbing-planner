export function hooperLabel(total) {
  if (total <= 14) return "Bien récupéré";
  if (total <= 17) return "Modérément fatigué";
  if (total <= 20) return "Très fatigué";
  return "Surmenage";
}

export function hooperColor(total, isDark) {
  if (total <= 14) return isDark ? "#4ade80" : "#2a7d4f";
  if (total <= 17) return "#f97316";
  return "#f87171";
}
