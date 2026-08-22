import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { colors } from "../theme/palette.js";
import { RADIUS } from "../theme/makeStyles.js";
import { SANS } from "./ui/Ascent.jsx";
import { toast } from "../lib/toast.js";

// ─── SECTION RÔLE ────────────────────────────────────────────────────────────
// Le rôle se change ici, plus seulement à l'inscription. Il vit dans la colonne
// `status` de `climbing_plans` : c'est elle qui fait autorité pour toutes les
// permissions, et le changement suit donc l'utilisateur d'un appareil à l'autre.
//
// Un piège mérite le détour : le lien coach-athlète est une ligne de
// `coach_athletes`, et c'est CETTE ligne — pas le rôle — que lit la RLS pour
// autoriser un coach à ouvrir le planning d'un athlète. Quitter le rôle coach
// sans toucher aux liens laisserait donc un accès en écriture à quelqu'un qui
// n'est plus coach, sans rien dans l'interface pour s'en rendre compte. D'où la
// confirmation, et la suppression des liens qui va avec.
//
// Trois rôles, plus quatre : « Autonome » ('auto') a été retiré, il ne se
// distinguait de « Coach » nulle part dans l'app. Les comptes encore marqués
// 'auto' en base sont lus comme coach (`DataProvider`), donc rien ne change
// pour eux.

const ROLES = [
  { value: null,      label: "Athlète solo",  desc: "Vous gérez votre planning vous-même." },
  { value: "athlete", label: "Athlète suivi", desc: "Votre coach gère vos cycles ; ils sont en lecture seule." },
  { value: "coach",   label: "Coach",         desc: "Vous suivez d'autres athlètes, en plus de votre planning." },
];

export function RoleSection({ isDark, styles, accountRole, athletes = [], onChangeRole, onRemoveAthlete }) {
  // `undefined` = pas de confirmation en cours. Le rôle, lui, peut valoir null
  // (athlète solo) — d'où l'enveloppe { role } plutôt qu'une valeur nue.
  const [pending, setPending] = useState(undefined);
  const [saving, setSaving] = useState(false);

  const c = colors(isDark);
  const current = accountRole ?? null;
  const linked = athletes.length;

  const apply = async (role, dropLinks) => {
    setSaving(true);
    try {
      if (dropLinks) {
        for (const a of athletes) await onRemoveAthlete?.(a.relationId);
      }
      const { error } = (await onChangeRole?.(role)) || {};
      if (error) {
        toast.error("Le rôle n'a pas pu être enregistré. Réessayez plus tard.");
        return;
      }
      toast.success(`Rôle : ${ROLES.find(r => r.value === role)?.label}`);
    } finally {
      setSaving(false);
      setPending(undefined);
    }
  };

  const select = (role) => {
    if (saving || role === current) return;
    // Seul cas à confirmer : on renonce au rôle coach alors que des athlètes
    // sont encore rattachés.
    if (current === "coach" && role !== "coach" && linked > 0) {
      setPending({ role });
      return;
    }
    apply(role, false);
  };

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Rôle</div>

      <div style={{
        background: c.card, border: `1px solid ${c.border}`,
        borderRadius: RADIUS.card, overflow: "hidden",
      }}>
        {ROLES.map((opt, i) => {
          const active = opt.value === current;
          return (
            <button
              key={String(opt.value)}
              onClick={() => select(opt.value)}
              disabled={saving}
              aria-pressed={active}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                textAlign: "left", padding: "13px 16px",
                background: active ? c.accentBg : "transparent",
                border: "none",
                borderTop: i === 0 ? "none" : `0.5px solid ${c.border}`,
                cursor: saving ? "default" : "pointer",
                fontFamily: SANS,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: active ? c.accent : c.text }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 12, color: c.textMuted, lineHeight: 1.4, marginTop: 2 }}>
                  {opt.desc}
                </div>
              </div>
              <span style={{ fontSize: 15, color: c.accent, width: 16, flexShrink: 0 }}>
                {active ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: c.textDim, marginTop: 8, lineHeight: 1.5 }}>
        Le changement s'applique à tous vos appareils.
        {current === "coach" && linked > 0
          && ` Vous suivez ${linked} athlète${linked > 1 ? "s" : ""}.`}
      </div>

      {pending && (
        <ConfirmModal
          title="Renoncer au rôle coach ?"
          sub={`Les liens avec vos ${linked} athlète${linked > 1 ? "s" : ""} seront supprimés, et vous perdrez l'accès à leur planning. Ils devront vous réinviter pour revenir en arrière.`}
          confirmLabel="Changer de rôle"
          onConfirm={() => apply(pending.role, true)}
          onClose={() => setPending(undefined)}
        />
      )}
    </div>
  );
}
