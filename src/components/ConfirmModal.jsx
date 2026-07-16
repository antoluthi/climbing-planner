import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Modal, modalTokens } from "./ui/Modal.jsx";
import { Button } from "./ui/Button.jsx";

// Dialogue de confirmation minimaliste. API inchangée — utilisé partout
// (suppressions, abandon de modifications via useConfirmClose).
export function ConfirmModal({
  title, sub, onConfirm, onClose,
  confirmLabel = "Supprimer", cancelLabel = "Annuler",
  danger = true,
}) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);

  return (
    <Modal onClose={onClose} maxWidth={340} ariaLabel={title}>
      <div style={{ padding: "22px 22px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 20, fontWeight: 500, color: T.text, lineHeight: 1.25,
        }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.5 }}>{sub}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <Button variant="secondary" size="md" onClick={onClose}>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} size="md" onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
