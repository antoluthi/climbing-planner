import { DEFAULT_SUSPENSION_CONFIG } from "../lib/constants.js";
import { colors, DATA } from "../theme/palette.js";

export function SuspensionInfoCard({ config, isDark }) {
  const c = config ?? DEFAULT_SUSPENSION_CONFIG;
  const text  = colors(isDark).textCard;
  const muted = colors(isDark).textDim;
  const bg    = colors(isDark).infoBg;
  const bdr   = colors(isDark).infoBg;
  const weightStr = c.armMode === "one"
    ? `G: ${c.targetWeightLeft >= 0 ? "+" : ""}${c.targetWeightLeft} kg  /  D: ${c.targetWeightRight >= 0 ? "+" : ""}${c.targetWeightRight} kg`
    : `${c.targetWeight >= 0 ? "+" : ""}${c.targetWeight} kg`;
  return (
    <div style={{ margin: "0 0 0 0", padding: "10px 14px", background: bg, borderTop: `1px solid ${bdr}`, display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 11, color: text }}>
        <span style={{ color: DATA.blocks["Suspension"], fontWeight: 700 }}>
          {c.armMode === "one" ? "Une main" : "Deux mains"}
        </span>
        <span style={{ color: muted }}>
          {c.supportType === "wall" ? "Au mur (PDC ± lest)" : "Au sol (poulie)"}
        </span>
        <span>{c.gripSize} mm · {c.gripType}</span>
        <span>{c.hangTime} s ↓ · {c.restTime} s pause · {c.sets} × {c.reps}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: DATA.blocks["Suspension"] }}>
        Cible : {weightStr}
      </div>
    </div>
  );
}
