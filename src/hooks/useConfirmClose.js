import { useRef, useState, useCallback } from "react";

// ─── useConfirmClose ──────────────────────────────────────────────────────────
// Hook utilitaire qui protège la fermeture d'une modale contenant du contenu
// modifiable. Si dirty == true, demande confirmation avant de fermer.
//
// Utilisation :
//   const { requestClose, markDirty, confirmOpen, confirmProps } = useConfirmClose(onClose);
//   ...
//   <button onClick={requestClose}>Annuler</button>
//   ...
//   {confirmOpen && <ConfirmModal {...confirmProps} />}
//
// Pour suivre l'état dirty automatiquement, on peut wrapper les setters :
//   const setTitle = wrapSetter(_setTitle, markDirty);
// Ou directement appeler markDirty() au onChange.

export function useConfirmClose(onClose, {
  title = "Abandonner les modifications ?",
  sub  = "Tes modifications seront perdues.",
  confirmLabel = "Abandonner",
  cancelLabel  = "Continuer",
} = {}) {
  const dirtyRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);
  const markPristine = useCallback(() => { dirtyRef.current = false; }, []);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      setConfirmOpen(true);
    } else {
      onClose();
    }
  }, [onClose]);

  const confirmProps = {
    title,
    sub,
    confirmLabel,
    cancelLabel,
    onConfirm: onClose,
    onClose: () => setConfirmOpen(false),
  };

  return { requestClose, markDirty, markPristine, confirmOpen, confirmProps, isDirty: () => dirtyRef.current };
}
