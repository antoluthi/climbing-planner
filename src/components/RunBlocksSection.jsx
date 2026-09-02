import { useState } from "react";
import { colors } from "../theme/palette.js";
import { RADIUS } from "../theme/makeStyles.js";
import { getMondayOf, addDays, localDateStr } from "../lib/helpers.js";
import {
  blockWeekTargets, blockWeekMonday, blockLastDay, overlappingBlockIds,
} from "../lib/run-goals.js";
import { WeekStepper, ColorDot, Chevron } from "./ui/CycleFields.jsx";

// ─── BLOCS DE COURSE ─────────────────────────────────────────────────────────
// Une piste à part, sous les mésocycles. Un plan de course se raisonne en
// volume hebdomadaire qui monte doucement — pas en charge de séance —, et il a
// besoin de trous : quatre semaines de montée, une coupure, on repart.
//
// D'où deux différences assumées avec les mésocycles :
//  · chaque bloc porte SA date de début, sans chaînage. Le chaînage colle les
//    blocs bout à bout, ce qui rend impossible la semaine vide voulue ;
//  · la durée ne se règle pas au jugé : elle découpe le bloc en semaines
//    numérotées, dont chacune affiche l'objectif que la progression lui donne.

const fmt = (d) => d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";

export function RunBlocksSection({
  blocks, isDark, canEdit,
  // La suppression passe par `onAskDelete` : c'est CyclesView qui porte la
  // confirmation, pour tous les types de bloc à la fois.
  onAdd, onUpdate, onSetOverride, onAskDelete,
}) {
  const c = colors(isDark);
  const chevauchent = overlappingBlockIds(blocks);
  // Affichés par date, comme ils seront lus : l'ordre de création n'a pas de
  // sens sur une piste où chaque bloc porte sa propre date.
  const tries = [...(blocks || [])].sort((a, b) =>
    (a.startDate || "9999").localeCompare(b.startDate || "9999"));

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: c.textMuted, marginBottom: 10,
      }}>Course — objectif hebdomadaire</div>

      {tries.length === 0 && (
        <div style={{
          fontSize: 12, color: c.textMuted, lineHeight: 1.5,
          background: c.card, border: `1px solid ${c.border}`,
          borderRadius: 16, padding: "14px 14px",
        }}>
          Aucun bloc. Un bloc, c’est un volume de départ et une progression —
          par exemple 30 km puis +10 % par semaine pendant 4 semaines.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tries.map(b => (
          <RunBlockCard
            key={b.id}
            block={b}
            isDark={isDark}
            canEdit={canEdit}
            overlaps={chevauchent.has(b.id)}
            onUpdate={onUpdate}
            onSetOverride={onSetOverride}
            onAskDelete={onAskDelete}
          />
        ))}
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          style={{
            marginTop: 10, fontSize: 12, color: c.accent,
            background: c.accentFaint, border: `1px dashed ${c.accentBorder}`,
            borderRadius: 999, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit",
          }}
        >＋ Bloc de course</button>
      )}
    </div>
  );
}

function RunBlockCard({ block, isDark, canEdit, overlaps, onUpdate, onSetOverride, onAskDelete }) {
  const c = colors(isDark);
  const [open, setOpen] = useState(false);
  const targets = blockWeekTargets(block);
  const last = blockLastDay(block);
  const total = Math.round(targets.reduce((a, t) => a + t.km, 0));

  const fieldBase = {
    background: c.inputBg, border: "none", borderRadius: RADIUS.control,
    color: c.text, fontFamily: "inherit", padding: "8px 10px", fontSize: 13,
    minWidth: 0,
  };
  const num = { ...fieldBase, width: 68, fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{
      background: c.card, border: `1px solid ${overlaps ? c.warnBorder : c.border}`,
      borderRadius: 16, padding: "10px 12px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ColorDot color={block.color || c.accent} c={c}
                  onChange={v => onUpdate(block.id, { color: v })} />
        <input
          style={{ ...fieldBase, flex: 1, fontWeight: 600, fontSize: 14 }}
          value={block.label || ""}
          disabled={!canEdit}
          onChange={e => onUpdate(block.id, { label: e.target.value })}
          placeholder="Nom du bloc…"
        />
        {canEdit && (
          <button
            type="button"
            onClick={() => onAskDelete({ type: "runBlock", id: block.id, label: block.label })}
            aria-label="Supprimer ce bloc de course"
            style={{
              width: 30, height: 30, borderRadius: 999, flexShrink: 0,
              border: "none", background: "none", color: c.textDim,
              fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            }}
          >✕</button>
        )}
      </div>

      {/* Début · durée. La date est ramenée au lundi : un objectif hebdomadaire
          qui commencerait un mercredi ne voudrait rien dire. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <input
          type="date"
          value={block.startDate || ""}
          disabled={!canEdit}
          onChange={e => {
            const v = e.target.value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < "2000-01-01") return;
            onUpdate(block.id, { startDate: localDateStr(getMondayOf(new Date(v + "T12:00:00"))) });
          }}
          title="Première semaine du bloc"
          style={{ ...fieldBase, fontSize: 12, colorScheme: isDark ? "dark" : "light", padding: "7px 9px" }}
        />
        <WeekStepper
          isDark={isDark}
          value={block.durationWeeks}
          onChange={n => canEdit && onUpdate(block.id, { durationWeeks: n })}
          max={24}
        />
      </div>

      {/* Volume de départ · progression */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.textMuted }}>
          Départ
          <input
            type="number" min="0" step="1" style={num} disabled={!canEdit}
            value={block.baseKm ?? ""}
            onChange={e => onUpdate(block.id, { baseKm: e.target.value === "" ? 0 : Number(e.target.value) })}
          /> km
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.textMuted }}>
          Progression
          <input
            type="number" step="1" style={num} disabled={!canEdit}
            value={block.increasePct ?? ""}
            onChange={e => onUpdate(block.id, { increasePct: e.target.value === "" ? 0 : Number(e.target.value) })}
          /> %/sem.
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {last && (
          <span style={{ fontSize: 11, color: c.textMuted }}>
            jusqu’au {last.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} · {total} km au total
          </span>
        )}
        {overlaps && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: c.warn,
            background: c.warnBg, borderRadius: 999, padding: "3px 8px",
          }}>Chevauche un autre bloc</span>
        )}
      </div>

      {/* Le détail semaine par semaine, replié : la carte doit d'abord dire le
          plan d'ensemble. C'est là qu'on force une décharge. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 10,
          background: "none", border: "none", padding: "2px 0",
          color: c.textMuted, fontSize: 11, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        <Chevron open={open} />
        {targets.length} semaine{targets.length > 1 ? "s" : ""}
        {targets.some(t => t.overridden) ? " · dont une réglée à la main" : ""}
      </button>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {targets.map(t => {
            const monday = blockWeekMonday(block, t.week);
            return (
              <div key={t.week} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: c.surface2, borderRadius: RADIUS.control, padding: "7px 10px",
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: c.text, width: 26, flexShrink: 0 }}>
                  S{t.week + 1}
                </span>
                <span style={{ fontSize: 11, color: c.textMuted, flex: 1, minWidth: 0 }}>
                  {monday ? `${fmt(monday)} – ${fmt(addDays(monday, 6))}` : "sans date"}
                </span>
                <input
                  type="number" min="0" step="1" style={{
                    ...num, width: 62, padding: "6px 8px",
                    color: t.overridden ? c.accent : c.text,
                    fontWeight: t.overridden ? 600 : 400,
                  }}
                  disabled={!canEdit}
                  value={t.km}
                  onChange={e => onSetOverride(block.id, t.week, e.target.value)}
                  aria-label={`Objectif de la semaine ${t.week + 1}`}
                />
                <span style={{ fontSize: 11, color: c.textMuted }}>km</span>
                {/* Rendre la semaine à la courbe. Sans ce bouton, un forçage
                    ne s'annulerait qu'en retapant la valeur calculée. */}
                <button
                  type="button"
                  onClick={() => onSetOverride(block.id, t.week, null)}
                  disabled={!canEdit || !t.overridden}
                  title={t.overridden ? `Revenir à la progression (${t.theoretical} km)` : "Suit la progression"}
                  aria-label="Revenir à la progression"
                  style={{
                    width: 24, height: 24, borderRadius: 999, flexShrink: 0, border: "none",
                    background: "none", fontFamily: "inherit", fontSize: 12,
                    color: t.overridden ? c.textMuted : "transparent",
                    cursor: t.overridden ? "pointer" : "default",
                  }}
                >↺</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
