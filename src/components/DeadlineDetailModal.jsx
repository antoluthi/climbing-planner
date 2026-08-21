import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Modal, ModalHeader, ModalBody, ModalFooter, modalTokens } from "./ui/Modal.jsx";
import { Button } from "./ui/Button.jsx";
import { colors } from "../theme/palette.js";

// ─── DEADLINE DETAIL MODAL ────────────────────────────────────────────────────

const TYPE_LABELS = { competition: "Compétition", sortie: "Sortie", objectif: "Objectif" };
const PRIORITY_LABEL = { A: "Priorité A — Principale", B: "Priorité B — Secondaire", C: "Priorité C — Indicatif" };

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function DeadlineDetailModal({ deadline: dl, onClose, onEdit }) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);

  const dateStr = dl.endDate
    ? `${fmtDate(dl.startDate)} → ${fmtDate(dl.endDate)}`
    : fmtDate(dl.startDate);

  const Row = ({ label, children }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 11, color: T.textLight, width: 56, flexShrink: 0, paddingTop: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );

  return (
    <Modal onClose={onClose} maxWidth={400} ariaLabel={dl.label}>
      <ModalHeader
        eyebrow={TYPE_LABELS[dl.type] || dl.type}
        title={dl.label}
        onClose={onClose}
        tint={dl.color}
      />
      <ModalBody style={{ gap: 12 }}>
        <Row label="Date">
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{dateStr}</span>
        </Row>
        <Row label="Priorité">
          <span style={{
            fontSize: 12, fontWeight: 600, color: dl.color,
            background: dl.color + "22", border: `1px solid ${dl.color}44`,
            borderRadius: 10, padding: "2px 10px",
          }}>
            {PRIORITY_LABEL[dl.priority]}
          </span>
        </Row>
        {dl.note && (
          <Row label="Note">
            <span style={{ fontSize: 14, color: T.text, lineHeight: 1.5, fontStyle: "italic" }}>{dl.note}</span>
          </Row>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="md" onClick={onClose}>Fermer</Button>
        <Button variant="primary" size="md" onClick={() => onEdit(dl)} style={{ background: dl.color, color: colors(isDark).onColor }}>
          Modifier
        </Button>
      </ModalFooter>
    </Modal>
  );
}
