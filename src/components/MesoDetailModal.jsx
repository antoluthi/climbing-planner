import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { colors } from "../theme/palette.js";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal.jsx";
import { Button } from "./ui/Button.jsx";
import { RichText } from "./RichText.jsx";
import { mesoLastDay, microStarts, weeksOf } from "../lib/cycles.js";
import { addDays } from "../lib/helpers.js";

// ─── DÉTAIL D'UN MÉSOCYCLE ───────────────────────────────────────────────────
// L'objectif d'un bloc était le seul à ne se lire nulle part : la timeline
// n'ouvrait sa bulle que sur les microcycles, et le formulaire ne montrait
// qu'une ligne de champ. Ici tout le bloc se lit d'un coup — sa plage, où on en
// est dedans, son objectif en toutes lettres, puis chaque microcycle avec le
// sien.

const fmt = (d, withYear = false) => d?.toLocaleDateString("fr-FR", {
  day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}),
});

const parseDay = (s) => new Date(s + "T00:00:00");

// « Semaine 2 sur 4 » quand aujourd'hui tombe dans le bloc.
function weekPosition(start, weeks) {
  if (!start) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - start) / 864e5);
  if (days < 0 || days >= weeks * 7) return null;
  return { week: Math.floor(days / 7) + 1, of: weeks };
}

export function MesoDetailModal({ meso, focusMicroId = null, onClose }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  if (!meso) return null;

  const tint = meso.color || c.accent;
  const weeks = weeksOf(meso);
  const start = meso.startDate ? parseDay(meso.startDate) : null;
  const last = mesoLastDay(meso);
  const pos = weekPosition(start, weeks);
  const micros = meso.microcycles || [];
  const starts = microStarts(meso);

  return (
    <Modal onClose={onClose} maxWidth={460} ariaLabel={`Détail de ${meso.label}`}>
      <ModalHeader eyebrow="Mésocycle" title={meso.label} tint={tint} onClose={onClose} />
      <ModalBody>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: c.textCard }}>
            {start ? `${fmt(start)} → ${fmt(last, true)}` : "Sans date"}
          </span>
          <span style={{ fontSize: 13, color: c.textMuted }}>·</span>
          <span style={{ fontSize: 13, color: c.textCard }}>{weeks} semaine{weeks > 1 ? "s" : ""}</span>
          {pos && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              color: tint, background: tint + "22", borderRadius: 999, padding: "3px 9px",
            }}>
              Semaine {pos.week} sur {pos.of}
            </span>
          )}
        </div>

        <Section label="Objectif du bloc" c={c}>
          {meso.description?.trim()
            ? <RichText text={meso.description} />
            : <Empty c={c}>Aucun objectif noté pour ce mésocycle.</Empty>}
        </Section>

        <Section label={`Microcycles${micros.length ? ` · ${micros.length}` : ""}`} c={c}>
          {micros.length === 0 && <Empty c={c}>Ce bloc n’est pas découpé en microcycles.</Empty>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {micros.map((micro, i) => {
              const mw = weeksOf(micro);
              const ms = starts[i] || null;
              const me = ms ? addDays(ms, mw * 7 - 1) : null;
              const focus = micro.id === focusMicroId;
              return (
                <div key={micro.id} style={{
                  background: focus ? tint + "1a" : c.card,
                  border: `1px solid ${focus ? tint + "66" : c.border}`,
                  borderRadius: 12, padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: c.text, flex: 1, minWidth: 0 }}>
                      {micro.label}
                    </span>
                    <span style={{ fontSize: 11, color: c.textMuted, flexShrink: 0 }}>
                      {mw} sem.
                    </span>
                  </div>
                  {ms && (
                    <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                      {fmt(ms)} → {fmt(me)}
                    </div>
                  )}
                  {micro.description?.trim() && (
                    <div style={{ marginTop: 6 }}>
                      <RichText text={micro.description} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>Fermer</Button>
      </ModalFooter>
    </Modal>
  );
}

function Section({ label, c, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
        color: c.textMuted, marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  );
}

function Empty({ c, children }) {
  return (
    <div style={{ fontSize: 13, color: c.textMuted, fontStyle: "italic" }}>{children}</div>
  );
}
