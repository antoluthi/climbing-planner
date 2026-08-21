import { useState } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { Modal } from "../ui/Modal.jsx";
import { ConfirmModal } from "../ConfirmModal.jsx";
import { colors } from "../../theme/palette.js";
import { RADIUS, Z } from "../../theme/makeStyles.js";
import { PrimaryButton, SecondaryButton, RoundIconButton, SportBadge, SANS, MONO } from "../ui/Ascent.jsx";
import { getDiscipline } from "../../lib/disciplines.js";
import { getChargeColor, chargeLabel } from "../../lib/charge.js";
import { localDateStr } from "../../lib/helpers.js";

// ─── APERÇU D'UNE ÉCHÉANCE ────────────────────────────────────────────────────
// Ce que la modale de séance est à une séance : on ouvre, on lit, et on décide
// ensuite de modifier ou de supprimer.

function fmtDate(iso, opts = { weekday: "long", day: "numeric", month: "long" }) {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", opts);
}

export function EventDetailModal({ event, onEdit, onDelete, onClose }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!event) return null;

  const tone = event.color || c.accent;
  const d = getDiscipline(event.discipline || "custom");
  const today = localDateStr(new Date());
  const days = Math.round(
    (new Date(event.startDate + "T12:00:00") - new Date(today + "T12:00:00")) / 86400000
  );
  const spans = event.endDate && event.endDate > event.startDate;
  const charge = Math.round(event.chargePlanned ?? event.charge ?? 0);
  const notes = (event.notes || event.content || "").toString().trim();

  const countdown = days > 0 ? `J-${days}` : days === 0 ? "Aujourd'hui" : "Passée";

  const label = (txt) => (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
      color: c.textDim, marginBottom: 6,
    }}>{txt}</div>
  );

  return (
    <>
      <Modal onClose={onClose} maxWidth={440} zIndex={Z.modal} ariaLabel={event.name || "Échéance"}>
        {/* ── En-tête, à la couleur de l'échéance ── */}
        <div style={{
          padding: "16px 18px 14px", background: tone + "1e",
          borderBottom: `1px solid ${tone}44`, flexShrink: 0,
          display: "flex", alignItems: "flex-start", gap: 12, fontFamily: SANS,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "1px",
              textTransform: "uppercase", color: tone, marginBottom: 4,
            }}>
              Échéance · {d.label}
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.3px", color: c.text }}>
              {event.name || event.title}
            </div>
          </div>
          <RoundIconButton isDark={isDark} size={32} label="Fermer" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </RoundIconButton>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", fontFamily: SANS }}>
          {/* ── Décompte + dates ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{
              minWidth: 62, textAlign: "center", padding: "10px 8px",
              borderRadius: RADIUS.card, background: tone + "22",
            }}>
              <div style={{ font: `800 20px ${MONO}`, color: tone, lineHeight: 1 }}>{countdown}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.text, textTransform: "capitalize" }}>
                {fmtDate(event.startDate)}
              </div>
              {spans && (
                <div style={{ fontSize: 13, color: c.textMuted, marginTop: 2, textTransform: "capitalize" }}>
                  → {fmtDate(event.endDate)}
                </div>
              )}
            </div>
            <SportBadge disciplineId={d.id} size={32} />
          </div>

          {/* ── Charge ── */}
          <div style={{ marginBottom: 20 }}>
            {label("Charge")}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ font: `800 24px ${MONO}`, color: getChargeColor(charge, isDark), lineHeight: 1 }}>
                {charge}<span style={{ fontSize: 13, opacity: 0.5 }}>/10</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: getChargeColor(charge, isDark) }}>
                {chargeLabel(charge)}
              </span>
            </div>
          </div>

          {/* ── Note ── */}
          {notes && (
            <div>
              {label("Note")}
              <div style={{
                background: c.control, borderRadius: RADIUS.control, padding: 14,
                fontSize: 14, color: c.text, lineHeight: 1.55, whiteSpace: "pre-wrap",
              }}>
                {notes}
              </div>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div style={{
          padding: "12px 18px 16px", borderTop: `0.5px solid ${c.border}`, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10, fontFamily: SANS,
        }}>
          <SecondaryButton
            isDark={isDark} height={44}
            style={{ width: "auto", padding: "0 18px", color: c.danger }}
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer
          </SecondaryButton>
          <PrimaryButton
            isDark={isDark} height={44}
            style={{ flex: 1 }}
            onClick={onEdit}
          >
            Modifier
          </PrimaryButton>
        </div>
      </Modal>

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer cette échéance ?"
          sub={`« ${event.name || event.title} » sera retirée du calendrier.`}
          confirmLabel="Supprimer"
          onConfirm={() => onDelete()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
