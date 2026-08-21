import { useEffect, useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { Modal, ModalHeader, ModalBody, modalTokens } from "./ui/Modal.jsx";
import { Button } from "./ui/Button.jsx";
import { BellIcon } from "./NotificationBell.jsx";
import { colors } from "../theme/palette.js";

// ─── PANNEAU DE NOTIFICATIONS ─────────────────────────────────────────────────
// Liste des notifications reçues. Deux familles :
//  - actionnables : coach_request → boutons Accepter / Refuser (c'est
//    l'acceptation qui crée le lien coach-athlète, consentement mutuel) ;
//  - informatives : plan_update / coach_accepted / coach_declined —
//    marquées lues à l'ouverture du panneau.

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} jours`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function weekLabel(weekKey) {
  // weekKey = "YYYY-MM-DD" (lundi)
  const d = new Date(weekKey + "T12:00:00");
  if (isNaN(d)) return null;
  return `semaine du ${d.getDate()} ${d.toLocaleDateString("fr-FR", { month: "short" })}`;
}

function notifText(n) {
  const name = n.payload?.fromName || "Quelqu'un";
  switch (n.type) {
    case "coach_request":
      return { title: name, body: "souhaite devenir ton coach. Il pourra voir et modifier ton planning." };
    case "coach_accepted":
      return { title: name, body: "a accepté ton invitation. Retrouve-le dans « Mes athlètes »." };
    case "coach_declined":
      return { title: name, body: "a décliné ton invitation." };
    case "plan_update": {
      const weeks = (n.payload?.weeks || []).map(weekLabel).filter(Boolean);
      const parts = [];
      if (weeks.length) parts.push(weeks.join(", "));
      if (n.payload?.cyclesChanged) parts.push("cycles");
      return {
        title: name,
        body: `a mis à jour ton planning${parts.length ? ` — ${parts.join(" · ")}` : ""}.`,
      };
    }
    default:
      return { title: "", body: n.type };
  }
}

export function NotificationsPanel({
  notifications, onClose, onRespondRequest, onMarkInfosRead,
}) {
  const { isDark } = useThemeCtx();
  const T = modalTokens(isDark);
  const [busyId, setBusyId] = useState(null);

  // Les notifications informatives sont considérées lues dès que le panneau
  // est ouvert ; les demandes restent en attente d'une réponse explicite.
  useEffect(() => { onMarkInfosRead?.(); }, []); // eslint-disable-line

  const respond = async (n, accept) => {
    setBusyId(n.id);
    await onRespondRequest(n, accept);
    setBusyId(null);
  };

  const typeIcon = (type) => {
    const map = {
      coach_request:  "🤝",
      coach_accepted: "✓",
      coach_declined: "✗",
      plan_update:    "📅",
    };
    return map[type] || "•";
  };

  return (
    <Modal onClose={onClose} maxWidth={420} ariaLabel="Notifications">
      <ModalHeader
        eyebrow="Activité"
        title="Notifications"
        onClose={onClose}
      />
      <ModalBody style={{ gap: 8, padding: "12px 14px" }}>
        {notifications.length === 0 && (
          <div style={{
            padding: "36px 20px", textAlign: "center",
            color: T.textLight, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 10,
          }}>
            <span style={{ opacity: 0.5 }}><BellIcon size={26} /></span>
            <span style={{ fontSize: 13 }}>Rien pour l'instant.</span>
            <span style={{ fontSize: 11, lineHeight: 1.5 }}>
              Tu retrouveras ici les invitations de coaching et les
              modifications apportées à ton planning.
            </span>
          </div>
        )}

        {notifications.map(n => {
          const { title, body } = notifText(n);
          const isRequest = n.type === "coach_request";
          const pending = isRequest && n.status === "unread";
          const answered = isRequest && (n.status === "accepted" || n.status === "declined");
          const unread = n.status === "unread";
          return (
            <div
              key={n.id}
              style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                background: unread ? (colors(isDark).surface) : T.surface,
                border: `1px solid ${unread ? T.accent + "44" : T.border}`,
                borderRadius: 10, padding: "10px 12px",
              }}
            >
              <span style={{ fontSize: 15, lineHeight: "20px", flexShrink: 0 }}>{typeIcon(n.type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.text, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 600 }}>{title}</span> {body}
                </div>
                <div style={{ fontSize: 10, color: T.textLight, marginTop: 3 }}>
                  {timeAgo(n.created_at)}
                  {answered && (
                    <span style={{ marginLeft: 6, fontWeight: 600, color: n.status === "accepted" ? (colors(isDark).success) : T.textLight }}>
                      {n.status === "accepted" ? "· Acceptée" : "· Refusée"}
                    </span>
                  )}
                </div>
                {pending && (
                  <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                    <Button
                      variant="primary" size="sm"
                      disabled={busyId === n.id}
                      onClick={() => respond(n, true)}
                    >
                      {busyId === n.id ? "…" : "Accepter"}
                    </Button>
                    <Button
                      variant="secondary" size="sm"
                      disabled={busyId === n.id}
                      onClick={() => respond(n, false)}
                    >
                      Refuser
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </ModalBody>
    </Modal>
  );
}
