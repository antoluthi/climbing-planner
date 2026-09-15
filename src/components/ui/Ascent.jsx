import { colors, DATA } from "../../theme/palette.js";
import { RADIUS } from "../../theme/makeStyles.js";
import { getDiscipline } from "../../lib/disciplines.js";

// ─── PRIMITIVES « ASCENT » ────────────────────────────────────────────────────
// Les six motifs que le prototype répète d'un écran à l'autre. Les extraire ici
// évite de les recopier dans chaque vue — et fait que retoucher un rayon ou une
// épaisseur de filet se fait à un seul endroit.
//
// Toutes les couleurs viennent de la palette : aucun littéral ici.

export const SANS = "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";
export const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// ── Carte ────────────────────────────────────────────────────────────────────
export function Card({ isDark, children, padding = 20, radius = 18, style, onClick }) {
  const c = colors(isDark);
  return (
    <div
      onClick={onClick}
      style={{
        background: c.card,
        border: `1px solid ${c.border}`,
        borderRadius: radius,
        padding,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Filet de séparation interne — 0.5px, plutôt que d'imbriquer des cartes.
export function Divider({ isDark }) {
  return <div style={{ height: 0.5, background: colors(isDark).border }} />;
}

// Carte à lignes : chaque enfant est séparé par un filet, sans padding externe.
export function RowCard({ isDark, children, style }) {
  const c = colors(isDark);
  return (
    <div style={{
      background: c.card, border: `1px solid ${c.border}`,
      borderRadius: 16, overflow: "hidden", ...style,
    }}>
      {children}
    </div>
  );
}

export function Row({ isDark, label, value, onClick, last = false, children }) {
  const c = colors(isDark);
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "14px 16px", minHeight: 48,
        borderBottom: last ? "none" : `0.5px solid ${c.border}`,
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <span style={{ fontSize: 14, color: c.textMuted, fontFamily: SANS }}>{label}</span>
      {children ?? <span style={{ fontSize: 14, fontWeight: 600, color: c.text, fontFamily: SANS }}>{value}</span>}
    </div>
  );
}

// ── Titre de page ────────────────────────────────────────────────────────────
// Le grand titre en tête d'écran (Accueil, Calendrier, Cycles, Stats,
// Bibliothèque). `right` accueille l'action principale de la page.
export function PageTitle({ isDark, children, right, style }) {
  const c = colors(isDark);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, marginBottom: 14, ...style,
    }}>
      <div style={{
        fontSize: 26, fontWeight: 800, letterSpacing: "-0.3px",
        color: c.text, fontFamily: SANS, minWidth: 0,
      }}>
        {children}
      </div>
      {right}
    </div>
  );
}

// ── Intitulé de section ──────────────────────────────────────────────────────
export function SectionLabel({ isDark, children, style }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
      color: colors(isDark).textDim, fontFamily: SANS, margin: "0 4px 8px", ...style,
    }}>
      {children}
    </div>
  );
}

// ── Valeur chiffrée (rendu « data ») ─────────────────────────────────────────
export function StatValue({ isDark, value, unit, accent = false, size = 18 }) {
  const c = colors(isDark);
  return (
    <div>
      <div style={{ font: `700 ${size}px ${MONO}`, color: accent ? c.accent : c.text }}>{value}</div>
      {unit && <div style={{ fontSize: 11, color: c.textDim, fontFamily: SANS, marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

// ── Badge lettré d'un sport ──────────────────────────────────────────────────
export function SportBadge({ disciplineId, size = 28, radius }) {
  const d = getDiscipline(disciplineId);
  const color = DATA.sports[disciplineId] || DATA.sports.custom;
  return (
    <div
      title={d?.label || ""}
      style={{
        width: size, height: size, borderRadius: radius ?? size / 2,
        background: `${color}24`,           // ≈ 14 % d'opacité
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        font: `700 ${Math.round(size * 0.45)}px ${MONO}`, color,
      }}
    >
      {(d?.label || "?").charAt(0).toUpperCase()}
    </div>
  );
}

// Pastille ronde d'un sport (point sous un numéro de jour)
export function SportDot({ disciplineId, size = 5, color }) {
  const value = color || DATA.sports[disciplineId] || "transparent";
  return <div style={{ width: size, height: size, borderRadius: size, background: value, flexShrink: 0 }} />;
}

// ── Sélecteur segmenté (pill) ────────────────────────────────────────────────
export function Segmented({ isDark, options, value, onChange, style, disabled = false, title }) {
  const c = colors(isDark);
  return (
    <div title={title} style={{
      display: "flex", background: c.control, borderRadius: RADIUS.pill, padding: 3, gap: 2,
      // Éteint plutôt que masqué : un sélecteur qui disparaît laisse croire que
      // l'autre écran n'existe plus.
      opacity: disabled ? 0.55 : 1, ...style,
    }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: RADIUS.pill, border: "none",
              cursor: disabled ? "default" : "pointer",
              fontSize: 13, fontWeight: 700, fontFamily: SANS,
              background: active ? c.accent : "transparent",
              color: active ? c.textOnAccent : c.textMuted,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Interrupteur pill ────────────────────────────────────────────────────────
export function PillToggle({ isDark, checked, onChange, label }) {
  const c = colors(isDark);
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      style={{
        width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
        background: checked ? c.accent : c.control, position: "relative",
        transition: "background 0.15s", flexShrink: 0, padding: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: checked ? 21 : 3,
        width: 20, height: 20, borderRadius: 10, background: c.onColor,
        transition: "left 0.15s",
      }} />
    </button>
  );
}

// ── Bouton rond d'icône ──────────────────────────────────────────────────────
export function RoundIconButton({ isDark, onClick, children, size = 36, label }) {
  const c = colors(isDark);
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: size, height: size, borderRadius: size / 2, background: c.control,
        border: "none", color: c.text, cursor: "pointer", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── Boutons pleine largeur ───────────────────────────────────────────────────
export function PrimaryButton({ isDark, onClick, children, height = 48, style }) {
  const c = colors(isDark);
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", height, borderRadius: RADIUS.pill, border: "none", cursor: "pointer",
        background: c.accent, color: c.textOnAccent,
        fontSize: 15, fontWeight: 700, fontFamily: SANS, letterSpacing: "0.2px", ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ isDark, onClick, children, height = 40, style }) {
  const c = colors(isDark);
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", height, borderRadius: RADIUS.pill, border: "none", cursor: "pointer",
        background: c.control, color: c.text,
        fontSize: 13, fontWeight: 700, fontFamily: SANS, ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Chip sélectionnable ──────────────────────────────────────────────────────
// Prend la couleur du sport quand elle est fournie, l'accent sinon.
export function Chip({ isDark, label, active, onClick, color, size = "md", style }) {
  const c = colors(isDark);
  const tone = color || c.accent;
  const sm = size === "sm";
  return (
    <button
      onClick={onClick}
      style={{
        padding: sm ? "6px 12px" : "10px 16px", borderRadius: RADIUS.pill, cursor: "pointer",
        fontSize: sm ? 12 : 14, fontWeight: 600, fontFamily: SANS,
        background: active ? `${tone}24` : c.control,
        color: active ? tone : c.textMuted,
        border: `1.5px solid ${active ? tone : "transparent"}`,
        ...style,
      }}
    >
      {label}
    </button>
  );
}

// ── Case ronde à cocher (rappels) ────────────────────────────────────────────
export function RoundCheck({ isDark, checked, onChange, label }) {
  const c = colors(isDark);
  return (
    <button
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
        background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%",
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: 11, flexShrink: 0,
        border: `1.5px solid ${checked ? c.accent : c.borderStrong}`,
        background: checked ? c.accent : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke={c.textOnAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div style={{ fontSize: 14, color: c.text, flex: 1, fontFamily: SANS }}>{label}</div>
    </button>
  );
}

// ── Barre de progression ─────────────────────────────────────────────────────
export function ProgressBar({ isDark, ratio }) {
  const c = colors(isDark);
  const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
  return (
    <div style={{ height: 5, borderRadius: 3, background: c.control, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: c.accent }} />
    </div>
  );
}

// ── Barre d'objectif ─────────────────────────────────────────────────────────
// Trois segments bout à bout : ce qui est fait, ce qui est encore au planning,
// ce qu'il reste. Trois teintes qui descendent — signature, orange en retrait,
// piste neutre — parce que c'est un classement, pas trois catégories.
//
// Deux détails qui font la lisibilité :
//  · un filet de 2 px à la couleur de la carte sépare les segments, sinon deux
//    oranges voisins se lisent comme un seul bloc ;
//  · quand le total dépasse l'objectif, la barre se met à l'échelle du total et
//    un repère marque l'endroit où l'objectif se trouvait. Saturer à 100 %
//    cacherait de combien on a débordé.
export function GoalBar({ isDark, segments, height = 8 }) {
  const c = colors(isDark);
  const { done = 0, planned = 0, over, goalMark } = segments || {};
  const seg = (w, background, key) => w <= 0 ? null : (
    <div key={key} style={{
      width: `${w}%`, background, height: "100%",
      borderRight: `2px solid ${c.card}`, boxSizing: "border-box",
    }} />
  );
  return (
    <div style={{
      position: "relative", height, borderRadius: height / 2,
      background: c.borderStrong, overflow: "hidden", display: "flex",
    }}>
      {seg(done, c.accent, "done")}
      {seg(planned, c.accentSoft, "planned")}
      {over && goalMark != null && (
        <div style={{
          position: "absolute", left: `${goalMark}%`, top: 0, bottom: 0,
          width: 2, background: c.card,
        }} />
      )}
    </div>
  );
}

// ── Icône bibliothèque ───────────────────────────────────────────────────────
// Deux livres droits et un troisième appuyé dessus. Partagée entre la barre du
// bas et le bouton du formulaire de séance : une seule silhouette pour un seul
// endroit de l'app.
export function LibraryIcon({ size = 20, strokeWidth = 1.8 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <rect x="3.6" y="6" width="4.6" height="13.5" rx="1.3" />
      <rect x="9.2" y="4.5" width="4.6" height="15" rx="1.3" />
      <rect x="14.8" y="6.6" width="4.6" height="12.9" rx="1.3" transform="rotate(13 14.8 19.5)" />
    </svg>
  );
}

// ── Avatar initiales ─────────────────────────────────────────────────────────
export function InitialsAvatar({ isDark, initials, size = 40, onClick, photoUrl }) {
  const c = colors(isDark);
  return (
    <button
      onClick={onClick}
      aria-label="Compte"
      style={{
        width: size, height: size, borderRadius: size / 2, border: "none", padding: 0,
        background: c.accentBg, cursor: onClick ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {photoUrl
        ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ font: `700 ${Math.round(size * 0.35)}px ${MONO}`, color: c.accent }}>{initials}</span>}
    </button>
  );
}
