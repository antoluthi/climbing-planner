export function ClimbingPlannerLogo({ isDark, size = 36 }) {
  const hexFill   = isDark ? "#e0a875" : "#8a7055";
  const circleFill = isDark ? "#b8651a" : "#5c4030";
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size, flexShrink: 0 }}>
      <path d="M20 6L32 12V28L20 34L8 28V12L20 6Z" fill={hexFill} />
      <circle cx="20" cy="20" r="4" fill={circleFill} />
    </svg>
  );
}
