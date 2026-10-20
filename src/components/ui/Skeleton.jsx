import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { colors } from "../../theme/palette.js";

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
  const baseBg = colors(isDark).borderSubtle;
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

// Stats : la silhouette de la page, dans l'ordre où elle s'affiche — titre,
// sélecteur de période, les quatre cartes du résumé, puis un graphe.
export function DashboardSkeleton() {
  const { isDark } = useThemeCtx();
  const surface = colors(isDark).card;
  const border  = colors(isDark).borderSubtle;
  const card = { background: surface, border: `1px solid ${border}`, borderRadius: 16 };
  return (
    <div
      role="status"
      aria-label="Chargement des statistiques"
      style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 600, margin: "0 auto", width: "100%" }}
    >
      <Skeleton width={90} height={26} />
      <Skeleton width="100%" height={36} radius={999} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton width="45%" height={10} />
            <Skeleton width="60%" height={20} />
          </div>
        ))}
      </div>
      <div>
        <Skeleton width={70} height={11} style={{ marginBottom: 10 }} />
        <div style={{ ...card, padding: 16 }}>
          <Skeleton width="100%" height={190} radius={6} />
        </div>
      </div>
    </div>
  );
}

// AccueilView skeleton : header + grosse phrase + liste de séances du jour
export function AccueilSkeleton() {
  const { isDark } = useThemeCtx();
  const surface = colors(isDark).card;
  const border  = colors(isDark).borderSubtle;
  return (
    <div
      role="status"
      aria-label="Chargement de l'accueil"
      style={{ position: "relative", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20, minHeight: 320 }}
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
  const surface = colors(isDark).card;
  const border  = colors(isDark).borderSubtle;

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
