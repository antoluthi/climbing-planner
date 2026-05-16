import { DEFAULT_SUSPENSION_CONFIG } from "../lib/constants.js";

export function SuspensionInfoCard({ config, isDark }) {
  const c = config ?? DEFAULT_SUSPENSION_CONFIG;
  const text  = isDark ? "#f0e6d0" : "#2a3828";
  const muted = isDark ? "#a89a82" : "#6a7a62";
  const bg    = isDark ? "#1a1410" : "#f4f0ff";
  const bdr   = isDark ? "#3a2e22" : "#d0c4f4";
  const weightStr = c.armMode === "one"
    ? `G: ${c.targetWeightLeft >= 0 ? "+" : ""}${c.targetWeightLeft} kg  /  D: ${c.targetWeightRight >= 0 ? "+" : ""}${c.targetWeightRight} kg`
    : `${c.targetWeight >= 0 ? "+" : ""}${c.targetWeight} kg`;
  return (
    <div style={{ margin: "0 0 0 0", padding: "10px 14px", background: bg, borderTop: `1px solid ${bdr}`, display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 11, color: text }}>
        <span style={{ color: "#a78bfa", fontWeight: 700 }}>
          {c.armMode === "one" ? "Une main" : "Deux mains"}
        </span>
        <span style={{ color: muted }}>
          {c.supportType === "wall" ? "Au mur (PDC ± lest)" : "Au sol (poulie)"}
        </span>
        <span>{c.gripSize} mm · {c.gripType}</span>
        <span>{c.hangTime} s ↓ · {c.restTime} s pause · {c.sets} × {c.reps}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>
        Cible : {weightStr}
      </div>
    </div>
  );
}
