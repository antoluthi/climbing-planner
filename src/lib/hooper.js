export function hooperLabel(total) {
  if (total <= 14) return "Bien récupéré";
  if (total <= 17) return "Modérément fatigué";
  if (total <= 20) return "Très fatigué";
  return "Surmenage";
}

export function hooperColor(total, isDark) {
  if (total <= 14) return isDark ? "#82c894" : "#82c894";
  if (total <= 17) return "#f0a060";
  return "#f08070";
}
