import { useState } from "react";
import { colors } from "../theme/palette.js";
import { fetchPublicPlans } from "../lib/supabase-public.js";

// ─── PLANNINGS PUBLICS ───────────────────────────────────────────────────────
// Voisin du réglage « Planning public » : c'est la même idée des deux côtés —
// ce que je partage, ce que je peux regarder. La liste ne se charge qu'à
// l'ouverture, et par le client public (cf. lib/supabase-public.js) : cet écran
// ne voit rien de plus qu'un visiteur sans compte.
export function PublicPlansSection({ isDark, styles, currentUserId, onOpen }) {
  const c = colors(isDark);
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState(null);   // null = pas encore chargé

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && plans === null) setPlans(await fetchPublicPlans());
  };

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Plannings publics</div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ fontSize: 11, color: c.textMuted, maxWidth: 260, lineHeight: 1.4 }}>
          Les plannings que d’autres ont rendus publics — leurs séances et leurs
          cycles, en lecture seule.
        </div>
        <button
          onClick={toggle}
          style={{
            flexShrink: 0, border: `1px solid ${c.border}`, borderRadius: 999,
            background: "none", color: c.text, fontFamily: "inherit",
            fontSize: 12, fontWeight: 600, padding: "7px 14px", cursor: "pointer",
          }}
        >
          {open ? "Masquer" : "Parcourir"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {plans === null && (
            <div style={{ fontSize: 12, color: c.textMuted, padding: "6px 0" }}>Chargement…</div>
          )}
          {plans?.length === 0 && (
            <div style={{ fontSize: 12, color: c.textMuted, fontStyle: "italic", padding: "6px 0" }}>
              Aucun planning public pour l’instant.
            </div>
          )}
          {plans?.map(p => {
            const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
            const mine = p.userId === currentUserId;
            return (
              <button
                key={p.userId}
                onClick={() => onOpen(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  background: c.card, border: `1px solid ${c.border}`, borderRadius: 12,
                  padding: "9px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
              >
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: c.accentBg, color: c.accent,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {[p.firstName?.[0], p.lastName?.[0]].filter(Boolean).join("").toUpperCase()}
                  </div>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: c.text, flex: 1, minWidth: 0 }}>
                  {full}
                </span>
                {mine && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    color: c.accent, background: c.accentBg, borderRadius: 999, padding: "3px 8px",
                  }}>toi</span>
                )}
                <span style={{ color: c.textDim, fontSize: 13 }}>→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
