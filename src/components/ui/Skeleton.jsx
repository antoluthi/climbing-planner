import { useThemeCtx } from "../../theme/ThemeContext.jsx";

// ─── SKELETON ─────────────────────────────────────────────────────────────────
// Silhouette d'attente avec animation de pulse douce (pas de spinner).
// Utilise la classe CSS .cp-skeleton définie dans index.css.

export function Skeleton({
  width,
  height,
  radius = 6,
  style: extra,
}) {
  const { isDark } = useThemeCtx();
  const baseBg = isDark ? "#2a302a" : "#e6dfd1";
  return (
    <div
      className="cp-skeleton"
      aria-hidden="true"
      style={{
        background: baseBg,
        width: width ?? "100%",
        height: height ?? 16,
        borderRadius: radius,
        ...extra,
      }}
    />
  );
}

// Dashboard stats skeleton : 3 cards de chiffres + 2 zones graphique
export function DashboardSkeleton() {
  const { isDark } = useThemeCtx();
  const surface = isDark ? "#1f2421" : "#ffffff";
  const border  = isDark ? "#2a302a" : "#e6dfd1";
  return (
    <div
      role="status"
      aria-label="Chargement des statistiques"
      style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}
    >
      {/* Title */}
      <Skeleton width={120} height={14} />

      {/* 3 stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            background: surface, border: `1px solid ${border}`,
            borderRadius: 8, padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <Skeleton width={60} height={24} />
            <Skeleton width="60%" height={10} />
          </div>
        ))}
      </div>

      {/* Chart 1 */}
      <div>
        <Skeleton width={100} height={11} style={{ marginBottom: 10 }} />
        <div style={{
          background: surface, border: `1px solid ${border}`,
          borderRadius: 8, padding: 14,
        }}>
          <Skeleton width="100%" height={180} radius={4} />
        </div>
      </div>

      {/* Chart 2 */}
      <div>
        <Skeleton width={140} height={11} style={{ marginBottom: 10 }} />
        <div style={{
          background: surface, border: `1px solid ${border}`,
          borderRadius: 8, padding: 14,
        }}>
          <Skeleton width="100%" height={140} radius={4} />
        </div>
      </div>
    </div>
  );
}

// AccueilView skeleton : header + grosse phrase + liste de séances du jour
export function AccueilSkeleton() {
  const { isDark } = useThemeCtx();
  const surface = isDark ? "#1f2421" : "#ffffff";
  const border  = isDark ? "#2a302a" : "#e6dfd1";
  return (
    <div
      role="status"
      aria-label="Chargement de l'accueil"
      style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}
    >
      <Skeleton width={80} height={11} />
      <Skeleton width="80%" height={28} />
      <Skeleton width="60%" height={28} />
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            background: surface, border: `1px solid ${border}`,
            borderRadius: 10, padding: 12,
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <Skeleton width={4} height={36} radius={2} />
            <div style={{ flex: 1 }}>
              <Skeleton width="40%" height={10} />
              <div style={{ height: 6 }} />
              <Skeleton width="70%" height={14} />
            </div>
            <Skeleton width={30} height={20} radius={10} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Card-shaped skeleton pour les listes de séances
export function SessionCardSkeleton({ count = 3 }) {
  const { isDark } = useThemeCtx();
  const surface = isDark ? "#1f2421" : "#ffffff";
  const border  = isDark ? "#2a302a" : "#e6dfd1";

  return (
    <div
      role="status"
      aria-label="Chargement des séances"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: 14,
            display: "flex",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <Skeleton width={4} height={48} radius={2} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skeleton width="40%" height={11} />
            <Skeleton width="75%" height={15} />
            <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
              <Skeleton width={48} height={16} radius={10} />
              <Skeleton width={60} height={16} radius={10} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <Skeleton width={30} height={20} radius={14} />
            <Skeleton width={28} height={28} radius={14} />
          </div>
        </div>
      ))}
    </div>
  );
}
