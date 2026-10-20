import { useState } from "react";
import { createPortal } from "react-dom";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal.jsx";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { colors, DATA } from "../theme/palette.js";
import { Chip, SectionLabel, PrimaryButton, SANS } from "./ui/Ascent.jsx";
import { quickRanges, cycleRanges, rangeLabel, rangeError, rangeDays } from "../lib/stats.js";

// ─── PÉRIODE À ANALYSER ──────────────────────────────────────────────────────
// Trois façons de choisir une plage pour les stats, de la plus rapide à la plus
// précise :
//   · un raccourci (30 derniers jours, 3 derniers mois…), appliqué d'une touche ;
//   · un **cycle du plan** : analyser un bloc entier sans recopier ses dates,
//     celles de l'éditeur et du calendrier (`cycleRanges`) ;
//   · deux dates précises, avec le calendrier du téléphone.
//
// La modale commune (`ui/Modal.jsx`) porte la pile de calques : le bouton
// retour d'Android la ferme, et le carrousel d'onglets ne part pas sous le doigt.
//
// ⚠️ Portée dans `<body>`, comme les bulles (`ui/Popover.jsx`). Rendue dans la
// page, elle vivrait dans un calque du carrousel, qui porte `will-change:
// transform` : un contexte d'empilement, et le repère de ses `position: fixed`.
// La barre du bas passait alors par-dessus (et restait touchable), et la feuille
// se décalait d'autant que la page avait défilé.

export function StatsRangePicker({ todayISO, initial, mesocycles, onApply, onClose }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const [start, setStart] = useState(initial?.start || todayISO);
  const [end, setEnd] = useState(initial?.end || todayISO);
  const quick = quickRanges(todayISO);
  const cycles = cycleRanges(mesocycles, todayISO);
  const error = rangeError(start, end);
  const days = error ? 0 : rangeDays(start, end);

  const apply = (sel) => { onApply({ range: "custom", ...sel }); onClose(); };
  const field = {
    width: "100%", background: c.control, border: `1px solid ${c.border}`, borderRadius: 12,
    padding: "10px 12px", color: c.text, fontSize: 15, fontWeight: 600, fontFamily: SANS,
    colorScheme: isDark ? "dark" : "light", outline: "none",
  };

  return createPortal(
    <Modal onClose={onClose} maxWidth={420} ariaLabel="Période à analyser">
      <ModalHeader eyebrow="Statistiques" title="Période à analyser" onClose={onClose} />
      <ModalBody style={{ gap: 18 }}>
        <div>
          <SectionLabel isDark={isDark} style={{ margin: "0 2px 8px" }}>Rapide</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {quick.map(q => (
              <Chip key={q.key} isDark={isDark} size="sm" label={q.label}
                    onClick={() => apply({ start: q.start, end: q.end })} />
            ))}
          </div>
        </div>

        {cycles.length > 0 && (
          <div>
            <SectionLabel isDark={isDark} style={{ margin: "0 2px 8px" }}>Par cycle</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {cycles.map(cy => (
                <button
                  key={cy.id}
                  type="button"
                  onClick={() => apply({ start: cy.start, end: cy.end, label: cy.label })}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", width: "100%",
                    background: c.card, border: `1px solid ${c.border}`, borderRadius: 14,
                    cursor: "pointer", fontFamily: SANS, textAlign: "left",
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 5, flexShrink: 0, background: cy.color || DATA.fallback }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: c.text,
                                 overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cy.label}
                    {cy.status !== "past" && (
                      <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 6, color: cy.status === "current" ? c.accent : c.textMuted }}>
                        {cy.status === "current" ? "en cours" : "à venir"}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: c.textMuted, whiteSpace: "nowrap" }}>{rangeLabel(cy.start, cy.end, todayISO)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <SectionLabel isDark={isDark} style={{ margin: "0 2px 8px" }}>Dates précises</SectionLabel>
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 11, color: c.textMuted, margin: "0 0 4px 2px" }}>Du</span>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} style={field} />
            </label>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 11, color: c.textMuted, margin: "0 0 4px 2px" }}>Au</span>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={field} />
            </label>
          </div>
          {error && <div style={{ fontSize: 12, color: c.danger, margin: "8px 2px 0" }}>{error}</div>}
        </div>
      </ModalBody>
      <ModalFooter>
        <PrimaryButton
          isDark={isDark}
          height={44}
          onClick={error ? undefined : () => apply({ start, end })}
          style={{ opacity: error ? 0.45 : 1, cursor: error ? "default" : "pointer" }}
        >
          {error ? "Analyser" : `Analyser ${days > 1 ? `ces ${days} jours` : "ce jour"}`}
        </PrimaryButton>
      </ModalFooter>
    </Modal>,
    document.body,
  );
}
