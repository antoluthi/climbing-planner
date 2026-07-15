// ─── CLOCHE DE NOTIFICATIONS ──────────────────────────────────────────────────
// Icône cloche (SVG trait, hérite de currentColor) + pastille du nombre de
// notifications non lues. Ouvre le NotificationsPanel.

export function BellIcon({ size = 18 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function NotificationBell({ unreadCount, onClick, isDark, active }) {
  const accent = isDark ? "#e0a875" : "#8b4c20";
  const badgeBg = isDark ? "#f08070" : "#b83030";
  return (
    <button
      onClick={onClick}
      aria-label={unreadCount > 0 ? `Notifications — ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Notifications"}
      title="Notifications"
      style={{
        position: "relative",
        background: active ? (isDark ? "#3a2616" : "#ecddd4") : "none",
        border: `1px solid ${active ? accent : (isDark ? "#3a2e22" : "#ddd0c2")}`,
        borderRadius: 8,
        width: 32, height: 32,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: unreadCount > 0 ? accent : (isDark ? "#a89a82" : "#8a7f70"),
        cursor: "pointer", padding: 0, flexShrink: 0,
      }}
    >
      <BellIcon />
      {unreadCount > 0 && (
        <span style={{
          position: "absolute", top: -5, right: -5,
          minWidth: 15, height: 15, borderRadius: 8,
          background: badgeBg, color: "#fff",
          fontSize: 9, fontWeight: 700, lineHeight: "15px",
          padding: "0 3px", textAlign: "center",
          boxShadow: `0 0 0 2px ${isDark ? "#1a1410" : "#ede7de"}`,
        }}>
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
