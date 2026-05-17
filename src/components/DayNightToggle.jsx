export function DayNightToggle({ isDark, onToggle, size = 22, style = {} }) {
  const sunColor = isDark ? "#e0a875" : "#8b4c20";
  const moonColor = isDark ? "#e0a875" : "#8b4c20";

  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x1: 12 + 6.5 * Math.cos(rad),
      y1: 12 + 6.5 * Math.sin(rad),
      x2: 12 + 9.5 * Math.cos(rad),
      y2: 12 + 9.5 * Math.sin(rad),
    };
  });

  return (
    <button
      onClick={onToggle}
      title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        lineHeight: 0,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={{ display: "block", overflow: "visible" }}
        aria-hidden="true"
      >
        {/* SUN */}
        <g
          style={{
            opacity: isDark ? 0 : 1,
            transform: isDark ? "rotate(120deg) scale(0.5)" : "rotate(0deg) scale(1)",
            transformOrigin: "12px 12px",
            transition: "opacity 0.45s ease, transform 0.45s ease",
          }}
        >
          <circle cx="12" cy="12" r="4.5" fill={sunColor} />
          {rays.map((r, i) => (
            <line
              key={i}
              x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
              stroke={sunColor}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* MOON + stars */}
        <g
          style={{
            opacity: isDark ? 1 : 0,
            transform: isDark ? "rotate(0deg) scale(1)" : "rotate(-120deg) scale(0.5)",
            transformOrigin: "12px 12px",
            transition: "opacity 0.45s ease, transform 0.45s ease",
          }}
        >
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill={moonColor}
          />
          <circle cx="17.5" cy="5.5" r="0.85" fill={moonColor} />
          <circle cx="20" cy="9" r="0.6" fill={moonColor} />
          <circle cx="19" cy="13.5" r="0.5" fill={moonColor} />
        </g>
      </svg>
    </button>
  );
}
