import { useState } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { Modal } from "../ui/Modal.jsx";
import { colors } from "../../theme/palette.js";
import { RADIUS, Z } from "../../theme/makeStyles.js";
import { PrimaryButton, RoundIconButton, SANS, MONO } from "../ui/Ascent.jsx";
import {
  VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES,
  getNbMouvementsZone, climbingCharge10, getChargeColor, getZoneColor,
} from "../../lib/charge.js";

// ─── CALCULATEUR DE CHARGE (ESCALADE) ─────────────────────────────────────────
// Volume (déduit du nombre de mouvements) × intensité × complexité, ramené sur
// l'échelle 0-10 par climbingCharge10(). Le calcul ne change pas : seule sa
// présentation a été refaite.

export function ChargeCalculatorModal({ initialCharge = 5, onApply, onClose }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);

  const [nbMov, setNbMov]   = useState("");
  const [intens, setIntens] = useState(3);
  const [comp, setComp]     = useState(3);
  const [refOpen, setRefOpen] = useState(false);

  const volZone  = getNbMouvementsZone(parseInt(nbMov, 10));
  const computed = nbMov ? climbingCharge10(volZone, intens, comp) : null;
  const shown    = computed ?? initialCharge;

  const scale = (zones, value, onChange, label) => (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
        color: c.textDim, marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {zones.map(z => {
          const active = z.index === value;
          const tone = getZoneColor(z.index, isDark);
          return (
            <button
              key={z.index}
              onClick={() => onChange(z.index)}
              title={z.label}
              style={{
                flex: 1, height: 38, borderRadius: RADIUS.control, cursor: "pointer",
                background: active ? `${tone}28` : c.control,
                border: `1.5px solid ${active ? tone : "transparent"}`,
                color: active ? tone : c.textMuted,
                font: `700 14px ${MONO}`,
              }}
            >
              {z.index}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: c.textMuted, marginTop: 6 }}>
        {zones[value - 1].label}
      </div>
    </div>
  );

  return (
    <Modal onClose={onClose} maxWidth={440} zIndex={Z.nested + 1} ariaLabel="Calculateur de charge">
      {/* ── En-tête ── */}
      <div style={{ padding: "16px 18px 4px", display: "flex", alignItems: "center", gap: 12, fontFamily: SANS }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px", color: c.text }}>
            Calculateur
          </div>
          <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>
            Volume × intensité × complexité
          </div>
        </div>
        <RoundIconButton isDark={isDark} size={32} label="Fermer" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </RoundIconButton>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 18px 18px", fontFamily: SANS }}>
        {/* ── Volume ── */}
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
          color: c.textDim, marginBottom: 8,
        }}>
          Nombre de mouvements
        </div>
        <input
          autoFocus
          type="number" inputMode="numeric" min="1"
          value={nbMov}
          onChange={e => setNbMov(e.target.value)}
          placeholder="40"
          style={{
            width: "100%", background: c.control, border: "none", outline: "none",
            borderRadius: RADIUS.control, padding: "12px 16px", color: c.text,
            font: `700 18px ${MONO}`,
          }}
        />
        {nbMov ? (
          <div style={{ fontSize: 12, color: c.textMuted, marginTop: 6 }}>
            Zone {volZone} · {VOLUME_ZONES[volZone - 1].label} ({VOLUME_ZONES[volZone - 1].range})
          </div>
        ) : (
          <div style={{ fontSize: 12, color: c.textDim, marginTop: 6 }}>
            Le volume s'en déduit — le reste se règle ci-dessous.
          </div>
        )}

        {scale(INTENSITY_ZONES, intens, setIntens, "Intensité")}
        {scale(COMPLEXITY_ZONES, comp, setComp, "Complexité")}

        {/* ── Résultat ── */}
        <div style={{
          marginTop: 20, padding: "14px 16px", borderRadius: RADIUS.card,
          background: c.control, display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ font: `800 30px ${MONO}`, color: getChargeColor(shown, isDark), lineHeight: 1 }}>
            {shown}<span style={{ fontSize: 14, opacity: 0.5 }}>/10</span>
          </div>
          <div style={{ fontSize: 12, color: c.textMuted, flex: 1, lineHeight: 1.4 }}>
            {computed == null
              ? "Renseigne le nombre de mouvements pour obtenir une charge."
              : `Volume ${volZone} × intensité ${intens} × complexité ${comp}`}
          </div>
        </div>

        <PrimaryButton
          isDark={isDark}
          height={46}
          style={{ marginTop: 12, opacity: computed == null ? 0.45 : 1 }}
          onClick={() => { if (computed != null) onApply(computed); }}
        >
          Appliquer la charge
        </PrimaryButton>

        {/* ── Références ── */}
        <button
          onClick={() => setRefOpen(o => !o)}
          style={{
            display: "block", width: "100%", marginTop: 14, background: "none",
            border: "none", cursor: "pointer", color: c.textMuted,
            fontSize: 12, fontFamily: SANS, textAlign: "center", padding: 6,
          }}
        >
          {refOpen ? "Masquer les échelles" : "Voir les échelles de référence"}
        </button>

        {refOpen && (
          <div style={{ marginTop: 6 }}>
            {[
              ["Volume", VOLUME_ZONES, z => z.range],
              ["Intensité", INTENSITY_ZONES, z => `${z.pct} · ${z.effort}`],
              ["Complexité", COMPLEXITY_ZONES, z => z.desc],
            ].map(([title, zones, detail]) => (
              <div key={title} style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "1px",
                  textTransform: "uppercase", color: c.textDim, marginBottom: 6,
                }}>
                  {title}
                </div>
                <div style={{
                  background: c.card, border: `1px solid ${c.border}`,
                  borderRadius: RADIUS.control, overflow: "hidden",
                }}>
                  {zones.map((z, i) => (
                    <div key={z.index} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      borderBottom: i === zones.length - 1 ? "none" : `0.5px solid ${c.border}`,
                    }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                        background: getZoneColor(z.index, isDark) + "28",
                        color: getZoneColor(z.index, isDark),
                        font: `700 11px ${MONO}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{z.index}</span>
                      <span style={{ fontSize: 12, color: c.text, flex: 1 }}>{z.label}</span>
                      <span style={{ fontSize: 11, color: c.textDim, textAlign: "right" }}>{detail(z)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
