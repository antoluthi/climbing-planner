import { useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Modal, ModalHeader, ModalBody, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { Button } from "./ui/Button.jsx";
import { colors } from "../theme/palette.js";

// Choix du rôle au 1er login. C'est une porte d'entrée : pas de fermeture
// (ni Esc, ni clic-extérieur), un choix explicite requis avant de continuer.
const ROLES = [
  { value: null,      label: "Athlète solo",   desc: "Vous gérez votre planning vous-même." },
  { value: "coach",   label: "Coach",          desc: "Vous créez et modifiez les cycles de vos athlètes." },
  { value: "athlete", label: "Athlète suivi",  desc: "Votre coach gère vos cycles. Ils sont en lecture seule." },
];

export function RoleOnboardingModal({ onSelect }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const [selected, setSelected] = useState(undefined); // undefined = rien choisi
  const chosen = selected !== undefined;

  return (
    <Modal maxWidth={420} dismissOnBackdrop={false} closeOnEsc={false} ariaLabel="Quel est votre rôle ?">
      <ModalHeader eyebrow="Bienvenue" title="Quel est votre rôle ?" />
      <ModalBody style={{ gap: 12 }}>
        <p style={{ fontSize: 12, color: T.textLight, lineHeight: 1.5, margin: 0 }}>
          Ce choix est permanent. Contactez votre administrateur pour le modifier.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ROLES.map(opt => {
            const active = selected === opt.value;
            return (
              <button
                key={String(opt.value)}
                onClick={() => setSelected(opt.value)}
                aria-pressed={active}
                style={{
                  textAlign: "left", cursor: "pointer",
                  background: active ? (colors(isDark).surface) : T.surface,
                  border: `1.5px solid ${active ? T.accent : T.border}`,
                  borderRadius: 10, padding: "14px 16px",
                  transition: "border-color 0.15s, background 0.15s",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: active ? T.accent : T.text, marginBottom: 3 }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.4 }}>{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" size="md" fullWidth disabled={!chosen} onClick={() => chosen && onSelect(selected)}>
          Confirmer
        </Button>
      </ModalFooter>
    </Modal>
  );
}
