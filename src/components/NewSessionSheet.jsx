import { useState, useEffect, useRef, useMemo } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getChargeColor } from "../lib/charge.js";
import { generateId } from "../lib/storage.js";

// ─── NEW SESSION SHEET ────────────────────────────────────────────────────────
// Bottom-sheet unifiée pour créer une séance, remplace AddSessionChoiceModal.
// Permet 3 entrées rapides : démarrage rapide, récentes, composer en détail.

const QUICK_TEMPLATES = [
  {
    id: "quick-voie-4x4",
    name: "Voie · 4×4",
    type: "Grimpe",
    estimatedTime: 75,
    charge: 6,
    color: "#8b4c20",
    description: "75 min · charge 6",
    blocks: [
      { id: "_qt-w", blockType: "Échauffement", name: "Échauffement", duration: 15, charge: 0, description: "" },
      { id: "_qt-m", blockType: "Grimpe",       name: "4×4 voies",   duration: 45, charge: 6, description: "" },
      { id: "_qt-c", blockType: "Retour au calme", name: "Retour au calme", duration: 15, charge: 0, description: "" },
    ],
  },
  {
    id: "quick-bloc",
    name: "Bloc",
    type: "Grimpe",
    estimatedTime: 90,
    charge: 7,
    color: "#2e6b3f",
    description: "90 min · charge 7",
    blocks: [
      { id: "_qt-w", blockType: "Échauffement", name: "Échauffement", duration: 20, charge: 0, description: "" },
      { id: "_qt-m", blockType: "Grimpe",       name: "Bloc",         duration: 60, charge: 7, description: "" },
      { id: "_qt-c", blockType: "Retour au calme", name: "Retour au calme", duration: 10, charge: 0, description: "" },
    ],
  },
  {
    id: "quick-hangboard",
    name: "Hangboard",
    type: "Exercices",
    estimatedTime: 25,
    charge: 3,
    color: "#d4a843",
    description: "25 min · charge 3",
    blocks: [
      { id: "_qt-w", blockType: "Échauffement", name: "Échauffement doigts", duration: 8, charge: 0, description: "" },
      { id: "_qt-m", blockType: "Suspension",   name: "Max hangs",         duration: 15, charge: 3, description: "" },
    ],
  },
  {
    id: "quick-recup",
    name: "Récup / mobilité",
    type: "Exercice",
    estimatedTime: 30,
    charge: 1,
    color: "#7a9a82",
    description: "30 min · charge 1",
    blocks: [
      { id: "_qt-m", blockType: "Étirements", name: "Mobilité & étirements", duration: 30, charge: 1, description: "" },
    ],
  },
];

function formatRelativeDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diffDays = Math.round((today - d) / 86_400_000);
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "hier";
  if (diffDays < 7) return `il y a ${diffDays} jours`;
  if (diffDays < 14) return "la semaine dernière";
  if (diffDays < 30) return `il y a ${Math.floor(diffDays / 7)} sem.`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function NewSessionSheet({
  // defaultDate disponible si nécessaire dans le futur (préfill heure, etc.)
  // dayLabel — sous-titre affiché en header
  dayLabel,
  catalog,
  weeks,
  onQuickInsert,    // (session) — insert immédiat (chip rapide / récente)
  onCompose,        // (titlePrefill) — ouvre le composer détaillé
  onClose,
}) {
  const { isDark } = useThemeCtx();
  const [title, setTitle] = useState("");
  const [closing, setClosing] = useState(false);
  const inputRef = useRef(null);
  const sheetRef = useRef(null);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };

  // Focus input on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Escape to close
  useEffect(() => {
    const h = e => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // Récentes : 3 dernières séances loggées dans data.weeks (excluant celles sans nom)
  const recent = useMemo(() => {
    const all = [];
    Object.entries(weeks || {}).forEach(([wKey, days]) => {
      const monday = new Date(wKey + "T12:00:00");
      if (isNaN(monday.getTime())) return;
      (days || []).forEach((dayArr, di) => {
        (dayArr || []).forEach(s => {
          if (!s?.name && !s?.title) return;
          const d = new Date(monday);
          d.setDate(monday.getDate() + di);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          all.push({ ...s, _date: iso });
        });
      });
    });
    // dédoubler par nom et garder la plus récente
    const byName = new Map();
    all.sort((a, b) => b._date.localeCompare(a._date));
    for (const s of all) {
      const k = (s.title || s.name || "").trim().toLowerCase();
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, s);
      if (byName.size >= 5) break;
    }
    return Array.from(byName.values()).slice(0, 3);
  }, [weeks]);

  // Chips rapides : on prend les 4 templates de base mais on les remplace par
  // les plus utilisés du catalogue si dispo.
  const quickChips = useMemo(() => {
    if (catalog && catalog.length >= 4) {
      return catalog.slice(0, 4).map(s => ({
        ...s,
        description: [
          s.estimatedTime ? `${s.estimatedTime} min` : null,
          s.charge ? `charge ${s.charge}` : null,
        ].filter(Boolean).join(" · "),
        color: s.type === "Exercice" ? "#60a5fa" : "#8b4c20",
      }));
    }
    return QUICK_TEMPLATES;
  }, [catalog]);

  // Couleurs cohérentes avec le mockup "after" du audit
  const sheetBg = isDark ? "#1a1f1c" : "#fcf8ef";
  const headerBg = isDark ? "#1a1f1c" : "#fcf8ef";
  const surfaceCard = isDark ? "#222a23" : "#ffffff";
  const border = isDark ? "#2a302a" : "#e6dfd1";
  const borderSoft = isDark ? "#252b27" : "#ede5d4";
  const text = isDark ? "#e8e4de" : "#2a2218";
  const textLight = isDark ? "#7a7570" : "#8a7f70";
  const accent = isDark ? "#c8906a" : "#8b4c20";
  const grab = isDark ? "#3a4035" : "#c4beb0";

  const sectionLabel = {
    fontSize: 11,
    fontWeight: 500,
    color: textLight,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontFamily: "'Newsreader', Georgia, serif",
    marginBottom: 8,
    paddingLeft: 18,
  };

  const handleQuickInsert = (template) => {
    onQuickInsert({
      id: generateId(),
      name: title.trim() || template.name,
      title: title.trim() || template.name,
      type: template.type || "Grimpe",
      charge: template.charge ?? 0,
      estimatedTime: template.estimatedTime ?? null,
      blocks: (template.blocks || []).map(b => ({ ...b, id: generateId() })),
      isCustom: true,
    });
  };

  const handleDuplicateRecent = (recentSession) => {
    const { _date: _d, _origIdx: _oi, feedback: _fb, ...rest } = recentSession;
    void _d; void _oi; void _fb;
    onQuickInsert({
      ...rest,
      id: generateId(),
      name: title.trim() || rest.name,
      title: title.trim() || rest.title || rest.name,
      blocks: (rest.blocks || []).map(b => ({ ...b, id: generateId() })),
      isCustom: true,
    });
  };

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: closing ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.32)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 200,
    transition: "background 0.18s ease-out",
    backdropFilter: "blur(2px)",
  };

  const sheetStyle = {
    background: sheetBg,
    width: "100%",
    maxWidth: 520,
    maxHeight: "88vh",
    borderRadius: "18px 18px 0 0",
    boxShadow: "0 -8px 32px rgba(0,0,0,0.20)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transform: closing ? "translateY(100%)" : "translateY(0)",
    transition: "transform 0.18s ease-out",
    border: `1px solid ${border}`,
    borderBottom: "none",
  };

  return (
    <div style={overlayStyle} onClick={handleClose}>
      <div ref={sheetRef} style={sheetStyle} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Nouvelle séance">
        {/* Drag-grab */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: grab, borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{
          padding: "4px 18px 14px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
          background: headerBg,
        }}>
          <div>
            <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 17, fontWeight: 500, color: text, lineHeight: 1.2 }}>
              Nouvelle séance
            </div>
            {dayLabel && (
              <div style={{ fontSize: 12, color: textLight, marginTop: 2 }}>{dayLabel}</div>
            )}
          </div>
          <button
            onClick={handleClose}
            aria-label="Fermer"
            style={{
              background: "none", border: "none", color: textLight, cursor: "pointer",
              fontSize: 18, padding: "0 4px", lineHeight: 1, fontFamily: "inherit",
            }}
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 4 }}>
          {/* Title input */}
          <div style={{ padding: "0 18px 14px" }}>
            <input
              ref={inputRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Nommer la séance…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: surfaceCard,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: "inherit",
                color: text,
                outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = accent + "88")}
              onBlur={e => (e.currentTarget.style.borderColor = border)}
            />
          </div>

          {/* Quick start */}
          <div style={sectionLabel}>Démarrage rapide</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 18px 18px" }}>
            {quickChips.map((q, i) => (
              <button
                key={q.id || i}
                onClick={() => handleQuickInsert(q)}
                style={{
                  textAlign: "left",
                  background: surfaceCard,
                  border: `1px solid ${border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  fontFamily: "inherit",
                  transition: "border-color 0.12s, background 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = accent + "88"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = border; }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: q.color || accent, marginBottom: 2 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: text, lineHeight: 1.3 }}>{q.name}</span>
                <span style={{ fontSize: 11, color: textLight, lineHeight: 1.4 }}>{q.description || ""}</span>
              </button>
            ))}
          </div>

          {/* Récentes */}
          {recent.length > 0 && (
            <>
              <div style={sectionLabel}>Récentes</div>
              <div style={{ padding: "0 18px 14px" }}>
                {recent.map((s, i) => {
                  const c = getChargeColor(s.charge ?? 0);
                  return (
                    <button
                      key={`${s.id || s.name}-${i}`}
                      onClick={() => handleDuplicateRecent(s)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 4px",
                        width: "100%",
                        background: "none",
                        border: "none",
                        borderTop: i === 0 ? "none" : `1px solid ${borderSoft}`,
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = isDark ? "#202622" : "#f5efe0"}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <div style={{ width: 4, height: 28, borderRadius: 2, background: c, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.title || s.name}
                        </div>
                        <div style={{ fontSize: 11, color: textLight, marginTop: 1 }}>
                          {formatRelativeDate(s._date)}
                          {s.estimatedTime ? ` · ${s.estimatedTime} min` : ""}
                        </div>
                      </div>
                      {s.charge != null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          padding: "2px 8px", borderRadius: 4,
                          background: c + "22", color: c,
                        }}>
                          {s.charge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer CTA */}
        <div style={{
          padding: "12px 18px 16px",
          borderTop: `1px solid ${border}`,
          background: headerBg,
          flexShrink: 0,
        }}>
          <button
            onClick={() => onCompose(title.trim() || "")}
            style={{
              width: "100%",
              background: accent,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "13px 16px",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "0.03em",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "filter 0.12s",
            }}
            onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.07)"}
            onMouseLeave={e => e.currentTarget.style.filter = "none"}
          >
            Composer en détail →
          </button>
        </div>
      </div>
    </div>
  );
}
