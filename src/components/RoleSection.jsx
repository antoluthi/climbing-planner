import { useRef, useState } from "react";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal.jsx";
import { Button } from "./ui/Button.jsx";
import { colors } from "../theme/palette.js";
import { RADIUS } from "../theme/makeStyles.js";
import { SANS } from "./ui/Ascent.jsx";
import { toast } from "../lib/toast.js";

// ─── SECTION RÔLE ────────────────────────────────────────────────────────────
// Le rôle vit dans la colonne `status` de `climbing_plans` : c'est elle qui fait
// autorité pour toutes les permissions, et le changement suit donc l'utilisateur
// d'un appareil à l'autre.
//
// On en change une fois tous les jamais. Le compte affiche donc l'état, et rien
// d'autre ; le choix se fait derrière un bouton, après un écran qui dit ce que
// ça change. Trois temps : état → conséquences → sélection.
//
// Un piège mérite le détour : le lien coach-athlète est une ligne de
// `coach_athletes`, et c'est CETTE ligne — pas le rôle — que lit la RLS pour
// autoriser un coach à ouvrir le planning d'un athlète. Quitter le rôle coach
// sans toucher aux liens laisserait donc un accès en écriture à quelqu'un qui
// n'est plus coach, sans rien dans l'interface pour s'en rendre compte. D'où
// l'avertissement, la confirmation, et la suppression des liens qui va avec.
//
// « Autonome » ('auto') a été retiré : il ne se distinguait de « Coach » nulle
// part. Les comptes encore marqués ainsi sont lus comme coach (`DataProvider`).

const ROLES = [
  { value: null,      label: "Athlète solo",  desc: "Vous gérez votre planning vous-même." },
  { value: "athlete", label: "Athlète suivi", desc: "Votre coach gère vos cycles ; ils sont en lecture seule." },
  { value: "coach",   label: "Coach",         desc: "Vous suivez d'autres athlètes, en plus de votre planning." },
];

const roleOf = (value) => ROLES.find(r => r.value === (value ?? null)) ?? ROLES[0];

export function RoleSection({ isDark, styles, accountRole, athletes = [], onChangeRole, onRemoveAthlete }) {
  // null = fermé · "warn" = conséquences · "pick" = sélection
  const [step, setStep] = useState(null);
  // `undefined` = pas de confirmation en cours. Le rôle, lui, peut valoir null
  // (athlète solo) — d'où l'enveloppe { role } plutôt qu'une valeur nue.
  const [pending, setPending] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const confirmingRef = useRef(false);

  const c = colors(isDark);
  const current = accountRole ?? null;
  const currentRole = roleOf(current);
  const linked = athletes.length;
  const losesAthletes = current === "coach" && linked > 0;

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
      toast.success(`Rôle : ${roleOf(role).label}`);
      setStep(null);
    } finally {
      setSaving(false);
      setPending(undefined);
    }
  };

  const select = (role) => {
    if (saving || role === current) return;
    // Seul cas à reconfirmer : on renonce au rôle coach alors que des athlètes
    // sont encore rattachés. On referme le sélecteur — deux modales empilées
    // sur un téléphone, personne n'y gagne ; annuler ramène au choix.
    if (losesAthletes && role !== "coach") {
      setPending({ role });
      setStep(null);
      return;
    }
    apply(role, false);
  };

  return (
    <div style={styles.profileSection}>
      <div style={styles.profileSectionTitle}>Rôle</div>

      {/* ── L'état, au repos ── */}
      <div style={{
        background: c.card, border: `1px solid ${c.border}`, borderRadius: RADIUS.card,
        padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.text, fontFamily: SANS }}>
            {currentRole.label}
          </div>
          <div style={{ fontSize: 12, color: c.textMuted, lineHeight: 1.4, marginTop: 2, fontFamily: SANS }}>
            {currentRole.desc}
          </div>
        </div>
        <button
          onClick={() => setStep("warn")}
          style={{
            flexShrink: 0, background: c.control, border: "none", borderRadius: RADIUS.pill,
            color: c.text, fontSize: 12, fontWeight: 700, fontFamily: SANS,
            padding: "8px 14px", cursor: "pointer",
          }}
        >
          Modifier le rôle
        </button>
      </div>

      {/* ── Étape 1 : ce que ça change ── */}
      {step === "warn" && (
        <Modal onClose={() => setStep(null)} maxWidth={420} ariaLabel="Modifier le rôle">
          <ModalHeader eyebrow="Rôle" title="Ce que le rôle décide" onClose={() => setStep(null)} />
          <ModalBody style={{ gap: 14 }}>
            <div style={{ fontSize: 13, color: c.textMuted, lineHeight: 1.55 }}>
              Le rôle décide de ce que l'app vous laisse faire, et s'applique à
              tous vos appareils dès que vous le changez.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              <li style={{ fontSize: 13, color: c.text, lineHeight: 1.5 }}>
                <b>Athlète suivi</b> : vos cycles passent en lecture seule — seul
                votre coach peut les modifier.
              </li>
              <li style={{ fontSize: 13, color: c.text, lineHeight: 1.5 }}>
                <b>Coach</b> : vous pouvez inviter des athlètes et ouvrir leur
                planning. Ils doivent accepter l'invitation.
              </li>
              <li style={{ fontSize: 13, color: c.text, lineHeight: 1.5 }}>
                <b>Athlète solo</b> : vous gardez la main sur votre planning,
                sans personne autour.
              </li>
            </ul>
            <div style={{ fontSize: 13, color: c.textMuted, lineHeight: 1.55 }}>
              Votre planning, vos séances et votre historique ne bougent pas.
            </div>
            {losesAthletes && (
              <div style={{
                background: c.warnBg, border: `1px solid ${c.warnBorder}`,
                borderRadius: RADIUS.control, padding: "10px 12px",
                fontSize: 12, color: c.warn, lineHeight: 1.5,
              }}>
                Vous suivez {linked} athlète{linked > 1 ? "s" : ""}. Quitter le
                rôle coach supprimera {linked > 1 ? "ces liens" : "ce lien"} et
                vous perdrez l'accès à leur planning — ils devront vous
                réinviter.
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" size="md" onClick={() => setStep(null)}>Annuler</Button>
            <Button variant="primary" size="md" onClick={() => setStep("pick")}>Continuer</Button>
          </ModalFooter>
        </Modal>
      )}

      {/* ── Étape 2 : le choix ── */}
      {step === "pick" && (
        <Modal onClose={() => setStep(null)} maxWidth={420} ariaLabel="Choisir un rôle">
          <ModalHeader eyebrow="Rôle" title="Choisir un rôle" onClose={() => setStep(null)} />
          <ModalBody style={{ gap: 0, padding: 0 }}>
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
                    textAlign: "left", padding: "14px 20px",
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
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" size="md" onClick={() => setStep("warn")}>Retour</Button>
          </ModalFooter>
        </Modal>
      )}

      {pending && (
        <ConfirmModal
          title="Renoncer au rôle coach ?"
          sub={`Les liens avec vos ${linked} athlète${linked > 1 ? "s" : ""} seront supprimés, et vous perdrez l'accès à leur planning. Ils devront vous réinviter pour revenir en arrière.`}
          confirmLabel="Changer de rôle"
          // ConfirmModal appelle onClose juste après onConfirm : sans ce
          // drapeau, valider rouvrirait le sélecteur qu'on vient de quitter.
          onConfirm={() => { confirmingRef.current = true; apply(pending.role, true); }}
          onClose={() => {
            setPending(undefined);
            if (!confirmingRef.current) setStep("pick");
            confirmingRef.current = false;
          }}
        />
      )}
    </div>
  );
}
