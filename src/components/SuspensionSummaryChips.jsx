export function SuspensionSummaryChips({ config, muted }) {
  if (!config) return null;
  const c = config;
  const weightLabel = () => {
    if (c.armMode === "one") {
      const parts = [];
      if (c.targetWeightLeft  != null) parts.push(`G:${c.targetWeightLeft > 0 ? "+" : ""}${c.targetWeightLeft}kg`);
      if (c.targetWeightRight != null) parts.push(`D:${c.targetWeightRight > 0 ? "+" : ""}${c.targetWeightRight}kg`);
      return parts.join(" / ");
    }
    if (c.targetWeight == null) return null;
    const sign = c.targetWeight > 0 ? "+" : "";
    return `${sign}${c.targetWeight}kg`;
  };
  const w = weightLabel();
  return (
    <>
      {c.hangTime && c.restTime && <span>{c.hangTime}s / {c.restTime}s</span>}
      {c.sets && c.reps && <span>{c.sets}×{c.reps}</span>}
      {c.gripSize && <span>{c.gripSize}mm</span>}
      {c.gripType && <span>{c.gripType}</span>}
      {w && <span style={{ color: "#a78bfa" }}>{w}</span>}
    </>
  );
}
