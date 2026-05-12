import { useEffect } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Button } from "./ui/Button.jsx";

export function ConfirmModal({ title, sub, onConfirm, onClose, confirmLabel = "Supprimer", cancelLabel = "Annuler" }) {
  const { styles } = useThemeCtx();

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div style={styles.confirmOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.confirmModal} role="alertdialog" aria-modal="true" aria-label={title}>
        <div style={styles.confirmTitle}>{title}</div>
        {sub && <div style={styles.confirmSub}>{sub}</div>}
        <div style={styles.confirmBtnRow}>
          <Button variant="secondary" size="md" onClick={onClose}>{cancelLabel}</Button>
          <Button variant="danger" size="md" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
