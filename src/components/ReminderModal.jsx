import { useState, useEffect, useRef } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { ConfirmModal } from "./ConfirmModal.jsx";
import { useConfirmClose } from "../hooks/useConfirmClose.js";
import { Z } from "../theme/makeStyles.js";
import { Button } from "./ui/Button.jsx";
import {
  REMINDER_COLORS,
  WEEKDAY_PRESETS,
  DAY_NAMES_TWO,
  newReminderId,
  formatRecurrence,
} from "../lib/reminders.js";

// ─── REMINDER MODAL ──────────────────────────────────────────────────────────
// Création / édition d'un rappel journalier.

export function ReminderModal({ reminder, onSave, onDelete, onClose }) {
  const { isDark } = useThemeCtx();
  const isEditing = !!reminder?.id;
  const { requestClose, markDirty, markPristine, confirmOpen, confirmProps } = useConfirmClose(onClose);
  const wrap = setter => v => { markDirty(); setter(v); };

  const [name, _setName] = useState(reminder?.name || "");
  const setName = wrap(_setName);
  const [color, _setColor] = useState(reminder?.color || REMINDER_COLORS[0]);
  const setColor = wrap(_setColor);

  const initialKind = reminder?.recurrence?.kind || "daily";
  const initialDays = reminder?.recurrence?.days || [1, 2, 3, 4, 5];
  const [recKind, _setRecKind] = useState(initialKind);
  const setRecKind = wrap(_setRecKind);
  const [recDays, _setRecDays] = useState(initialDays);
  const setRecDays = wrap(_setRecDays);
  const toggleDay = (d) => {
    setRecDays(recDays.includes(d) ? recDays.filter(x => x !== d) : [...recDays, d].sort());
  };
  const applyPreset = (days) => setRecDays(days.slice());

  const [startDate, _setStartDate] = useState(reminder?.startDate || "");
  const setStartDate = wrap(_setStartDate);
  const [endDate, _setEndDate] = useState(reminder?.endDate || "");
  const setEndDate = wrap(_setEndDate);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleRef = useRef(null);
  useEffect(() => {
    if (!isEditing) {
      const t = setTimeout(() => titleRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isEditing]);

  // ── Tokens ──
  const paper        = isDark ? "#1f2421" : "#fcf8ef";
  const paperDim     = isDark ? "#1a1f1c" : "#f7f1e2";
  const surfaceCard  = isDark ? "#1f2421" : "#ffffff";
  const surfaceInput = isDark ? "#1a1f1c" : "#fcf8ef";
  const border       = isDark ? "#2a302a" : "#e6dfd1";
  const borderStrong = isDark ? "#3a4035" : "#d8d0bf";
  const text         = isDark ? "#e8e4de" : "#2a2218";
  const textMid      = isDark ? "#a4a09a" : "#5a4d3c";
  const textLight    = isDark ? "#7a7570" : "#8a7f70";
  const accent       = isDark ? "#c8906a" : "#8b4c20";

  const labelStyle = {
    fontSize: 11, fontWeight: 600, color: textLight,
    letterSpacing: "0.07em", textTransform: "uppercase",
    marginBottom: 8, display: "block",
  };
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: surfaceInput, border: `1px solid ${border}`,
    borderRadius: 8, padding: "10px 12px",
    fontSize: 13, fontFamily: "inherit", color: text,
    outline: "none",
  };

  const canSave = name.trim().length > 0
    && (recKind === "daily" || (Array.isArray(recDays) && recDays.length > 0));

  const handleSave = () => {
    if (!canSave) return;
    markPristine();
    const recurrence = recKind === "daily"
      ? { kind: "daily" }
      : { kind: "weekdays", days: recDays.slice().sort((a, b) => a - b) };
    const payload = {
      id: reminder?.id || newReminderId(),
      name: name.trim(),
      color,
      recurrence,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      createdAt: reminder?.createdAt || new Date().toISOString(),
    };
    onSave(payload);
  };

  // Cmd/Ctrl+Enter to save, Esc to close
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; });
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") requestClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveRef.current?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div
      role="dialog" aria-modal="true" aria-label={isEditing ? "Modifier le rappel" : "Nouveau rappel"}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)",
        zIndex: Z.nested, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div style={{
        background: paper, border: `1px solid ${borderStrong}`,
        borderRadius: 16, width: "100%", maxWidth: 440, maxHeight: "92vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px 12px",
          background: isDark
            ? `linear-gradient(180deg, ${paper}, ${paperDim})`
            : `linear-gradient(180deg, ${paper} 0%, ${paperDim} 100%)`,
          borderBottom: `1px solid ${border}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 20, fontWeight: 500, color: text, lineHeight: 1.15 }}>
            {isEditing ? "Modifier le rappel" : "Nouveau rappel"}
          </div>
          <button
            onClick={requestClose}
            aria-label="Fermer"
            style={{
              background: "none", border: `1px solid ${border}`, borderRadius: "50%",
              color: textLight, padding: 0, width: 28, height: 28,
              cursor: "pointer", fontSize: 14, fontFamily: "inherit", lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 8px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Nom */}
          <div>
            <label style={labelStyle}>Nom</label>
            <input
              ref={titleRef}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex : Étirements épaules, Vitamine D, méditation…"
              style={{
                ...inputStyle,
                fontFamily: "'Newsreader', Georgia, serif",
                fontSize: 17, fontWeight: 500,
                padding: "11px 14px",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = accent + "88")}
              onBlur={e => (e.currentTarget.style.borderColor = border)}
            />
          </div>

          {/* Couleur */}
          <div>
            <label style={labelStyle}>Couleur</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {REMINDER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Couleur ${c}`}
                  style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: c, cursor: "pointer", border: "none", padding: 0,
                    boxShadow: color === c
                      ? `0 0 0 2px ${text}, 0 0 0 4px ${c}`
                      : "0 1px 3px rgba(0,0,0,0.15)",
                    transition: "box-shadow 0.15s",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Récurrence */}
          <div>
            <label style={labelStyle}>Récurrence</label>
            <div style={{ display: "flex", gap: 6, marginBottom: recKind === "weekdays" ? 12 : 0 }}>
              {[
                ["daily",    "Tous les jours"],
                ["weekdays", "Jours choisis"],
              ].map(([kind, label]) => {
                const active = recKind === kind;
                return (
                  <button
                    key={kind}
                    onClick={() => setRecKind(kind)}
                    style={{
                      flex: 1, padding: "9px 10px",
                      background: active ? color + "22" : surfaceCard,
                      border: `1px solid ${active ? color : border}`,
                      borderRadius: 8, color: active ? text : textMid,
                      fontSize: 12, fontWeight: active ? 600 : 500,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >{label}</button>
                );
              })}
            </div>

            {recKind === "weekdays" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                  {[1, 2, 3, 4, 5, 6, 0].map(d => {
                    const active = recDays.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        style={{
                          padding: "8px 0",
                          background: active ? color : surfaceCard,
                          border: `1px solid ${active ? color : border}`,
                          borderRadius: 8,
                          color: active ? "#1a1f1c" : textMid,
                          fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >{DAY_NAMES_TWO[d]}</button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {WEEKDAY_PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p.days)}
                      style={{
                        background: "transparent",
                        border: `1px dashed ${border}`,
                        borderRadius: 12, padding: "4px 10px",
                        fontSize: 11, color: textMid,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >{p.label}</button>
                  ))}
                </div>
              </>
            )}
            <div style={{ fontSize: 11, color: textLight, marginTop: 8 }}>
              {formatRecurrence({ kind: recKind, days: recDays })}
            </div>
          </div>

          {/* Plage */}
          <div>
            <label style={labelStyle}>
              Plage <span style={{ textTransform: "none", letterSpacing: 0, fontStyle: "italic", color: textLight, fontWeight: 400 }}>
                — optionnel, laisser vide pour un rappel sans fin
              </span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: textLight, marginBottom: 4 }}>Du…</div>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: textLight, marginBottom: 4 }}>Au…</div>
                <input type="date" value={endDate} min={startDate || undefined}
                  onChange={e => setEndDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 18px",
          background: paperDim, borderTop: `1px solid ${border}`,
          display: "flex", gap: 10, alignItems: "center",
        }}>
          {isEditing && onDelete && (
            <Button
              variant="ghost" size="md"
              onClick={() => setConfirmDelete(true)}
              style={{ color: isDark ? "#e87878" : "#b83030" }}
            >Supprimer</Button>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="md" onClick={requestClose}>Annuler</Button>
          <Button variant="primary" size="md" disabled={!canSave} onClick={handleSave}>
            {isEditing ? "Enregistrer" : "Créer"}
          </Button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer ce rappel ?"
          sub="L'historique des coches sera également supprimé."
          confirmLabel="Supprimer"
          onConfirm={() => { markPristine(); onDelete?.(reminder.id); onClose(); }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
      {confirmOpen && <ConfirmModal {...confirmProps} />}
    </div>
  );
}
