import { useId } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import "./Caillou.css";

// ─── CAILLOU ──────────────────────────────────────────────────────────────────
// Mascotte galet. Animation CSS pure, classes pebble--{state}.
// Couleurs via tokens du thème (rock1...rockIris) exposés en CSS custom props.

const STATES = ["idle", "sleep", "loading", "success", "error", "curious", "rainy", "micro"];

export function Caillou({ state = "idle", size = 120, "aria-label": ariaLabel }) {
  const { styles: t, isDark } = useThemeCtx();
  const safeState = STATES.includes(state) ? state : "idle";
  const reactId = useId().replace(/:/g, "");
  // SVG defs need unique IDs since multiple Caillou may co-exist on the page.
  const id = `pb-${reactId}`;
  const gradId = `${id}-grad`;
  const shineId = `${id}-shine`;
  const innerId = `${id}-inner`;
  const grainId = `${id}-grain`;
  const clipId = `${id}-clip`;

  // Light highlight color for the eyes — adapts subtly to theme
  const eyeHi = isDark ? "#f6efd9" : "#fdf7e3";
  const irisHi = isDark ? "#e0a875" : "#8b4c20";
  const eyeSocket = "#0d0905";

  const a11y = ariaLabel
    ? { role: "img", "aria-label": ariaLabel }
    : { "aria-hidden": "true" };

  return (
    <span
      style={{
        // CSS custom properties consumed by the SVG via fill="var(--rock-…)"
        "--rock-1": t.rock1,
        "--rock-2": t.rock2,
        "--rock-3": t.rock3,
        "--rock-shine": t.rockShine,
        "--rock-edge": t.rockEdge,
        "--rock-iris": t.rockIris,
        "--rock-iris-hi": irisHi,
        display: "inline-flex",
        lineHeight: 0,
      }}
    >
      <svg
        className={`pebble pebble--${safeState}`}
        viewBox="0 0 320 320"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        {...a11y}
      >
        <defs>
          <radialGradient id={gradId} cx="40%" cy="32%" r="78%">
            <stop offset="0%" stopColor="var(--rock-1)" />
            <stop offset="55%" stopColor="var(--rock-2)" />
            <stop offset="100%" stopColor="var(--rock-3)" />
          </radialGradient>
          <radialGradient id={shineId} cx="32%" cy="22%" r="35%">
            <stop offset="0%" stopColor="var(--rock-shine)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--rock-shine)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={innerId} cx="50%" cy="82%" r="65%">
            <stop offset="55%" stopColor="var(--rock-edge)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--rock-edge)" stopOpacity="0.55" />
          </radialGradient>
          <filter id={grainId} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <clipPath id={clipId}>
            <path d="M 56 238 C 28 230, 22 196, 38 156 C 54 118, 92 88, 140 82 C 180 78, 224 90, 256 124 C 286 154, 296 200, 280 230 C 264 248, 96 248, 56 238 Z" />
          </clipPath>
        </defs>

        <ellipse className="shadow" cx="160" cy="246" rx="88" ry="4.5" fill="#000" opacity="0.7" />

        <g className="body-group">
          <path
            d="M 56 238 C 28 230, 22 196, 38 156 C 54 118, 92 88, 140 82 C 180 78, 224 90, 256 124 C 286 154, 296 200, 280 230 C 264 248, 96 248, 56 238 Z"
            fill={`url(#${gradId})`}
            stroke="var(--rock-edge)"
            strokeWidth="1.5"
          />
          <g clipPath={`url(#${clipId})`}>
            <ellipse cx="140" cy="118" rx="86" ry="36" fill={`url(#${shineId})`} />
            <rect x="0" y="0" width="320" height="320" fill={`url(#${innerId})`} />
            <g fill="var(--rock-shine)" opacity="0.55">
              <circle cx="100" cy="170" r="1.2" />
              <circle cx="186" cy="118" r="1" />
              <circle cx="240" cy="178" r="1.1" />
              <circle cx="158" cy="206" r="0.9" />
            </g>
            <g fill="var(--rock-edge)" opacity="0.5">
              <circle cx="138" cy="158" r="0.8" />
              <circle cx="214" cy="146" r="0.7" />
            </g>
            <rect x="0" y="0" width="320" height="320" filter={`url(#${grainId})`} fill="black" opacity="0.35" />
          </g>

          {/* Cheek blush */}
          <ellipse cx="98" cy="184" rx="14" ry="6" fill={t.accent} opacity="0.12" />
          <ellipse cx="226" cy="184" rx="14" ry="6" fill={t.accent} opacity="0.12" />

          {/* Brows (visible on error) */}
          <g className="brows">
            <path className="brow" d="M118 146 Q126 142, 134 146" stroke="var(--rock-edge)" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.5" />
            <path className="brow" d="M186 146 Q194 142, 202 146" stroke="var(--rock-edge)" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.5" />
          </g>

          {/* Left eye */}
          <g>
            <ellipse cx="126" cy="168" rx="11" ry="9" fill="var(--rock-edge)" opacity="0.18" />
            <ellipse cx="126" cy="168" rx="8.5" ry="8.5" fill={eyeSocket} />
            <circle className="pupil" cx="126" cy="168" r="6.5" fill="var(--rock-iris)" />
            <circle cx="124" cy="165" r="2" fill={eyeHi} />
            <circle cx="129" cy="170.5" r="0.9" fill={eyeHi} opacity="0.6" />
            <rect className="lid-top" x="115" y="158" width="22" height="11" rx="2" fill={`url(#${gradId})`} />
            <path className="lash" d="M119 168 Q126 171, 133 168" stroke="var(--rock-edge)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </g>

          {/* Right eye */}
          <g>
            <ellipse cx="194" cy="168" rx="11" ry="9" fill="var(--rock-edge)" opacity="0.18" />
            <ellipse cx="194" cy="168" rx="8.5" ry="8.5" fill={eyeSocket} />
            <circle className="pupil" cx="194" cy="168" r="6.5" fill="var(--rock-iris)" />
            <circle cx="192" cy="165" r="2" fill={eyeHi} />
            <circle cx="197" cy="170.5" r="0.9" fill={eyeHi} opacity="0.6" />
            <rect className="lid-top right" x="183" y="158" width="22" height="11" rx="2" fill={`url(#${gradId})`} />
            <path className="lash" d="M187 168 Q194 171, 201 168" stroke="var(--rock-edge)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </g>

          {/* Mouth */}
          <path className="mouth" d="M148 192 Q160 198, 172 192" stroke="var(--rock-edge)" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.7" />
        </g>

        {/* Loading orbits */}
        <g className="orbits">
          <g transform="translate(160, 160)">
            <g className="orbit"><circle cx="0" cy="-118" r="4" fill={t.accent} /></g>
            <g className="orbit orbit-2"><circle cx="0" cy="-118" r="3" fill={t.accent} opacity="0.65" /></g>
            <g className="orbit orbit-3"><circle cx="0" cy="-118" r="2" fill={t.accent} opacity="0.4" /></g>
          </g>
        </g>

        {/* Sleep zzz */}
        <g className="zzz-group" fontFamily="'Newsreader', Georgia, serif" fontStyle="italic" fill={t.textMuted}>
          <text className="zzz"   x="232" y="118" fontSize="20">z</text>
          <text className="zzz zzz-2" x="240" y="106" fontSize="16">z</text>
          <text className="zzz zzz-3" x="246" y="96"  fontSize="13">z</text>
        </g>

        {/* Success sparks */}
        <g className="sparks" fill={t.accent}>
          <path className="spark" d="M80 88 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 z" />
          <path className="spark" d="M252 110 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 z" style={{ animationDelay: "0.2s" }} />
          <path className="spark" d="M260 200 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z" style={{ animationDelay: "0.4s" }} />
        </g>

        {/* Rainy drops */}
        <g className="drops" fill="var(--rock-iris-hi)" opacity="0.7">
          <ellipse className="drop"   cx="90"  cy="60" rx="1.4" ry="3" />
          <ellipse className="drop drop-2" cx="140" cy="60" rx="1.4" ry="3" />
          <ellipse className="drop drop-3" cx="200" cy="60" rx="1.4" ry="3" />
          <ellipse className="drop drop-4" cx="244" cy="60" rx="1.4" ry="3" />
        </g>
      </svg>
    </span>
  );
}
