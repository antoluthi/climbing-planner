import { useThemeCtx } from "../theme/ThemeContext.jsx";

export function ConfirmModal({ title, sub, onConfirm, onClose }) {
  const { styles } = useThemeCtx();
  return (
    <div style={styles.confirmOverlay}>
      <div style={styles.confirmModal}>
        <div style={styles.confirmTitle}>{title}</div>
        {sub && <div style={styles.confirmSub}>{sub}</div>}
        <div style={styles.confirmBtnRow}>
          <button style={styles.confirmCancelBtn} onClick={onClose}>Annuler</button>
          <button style={styles.confirmDeleteBtn} onClick={() => { onConfirm(); onClose(); }}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}
