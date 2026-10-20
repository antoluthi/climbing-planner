import { useState, useRef, useEffect, useMemo } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { getMondayOf, addDays, localDateStr } from "../lib/helpers.js";
import { getSessionCharge } from "../lib/charge.js";
import { hooperLabel, hooperColor } from "../lib/hooper.js";
import { getActiveRemindersForDate, isReminderCheckedOn } from "../lib/reminders.js";
import { itemsBetween, EVENT_KEY } from "../lib/stats.js";
import { colors, DATA } from "../theme/palette.js";
import { Chip, Card, SectionLabel, SportDot, SecondaryButton, SANS, MONO } from "./ui/Ascent.jsx";

// ─── RÉGULARITÉ (heatmap façon GitHub) ───────────────────────────────────────
// L'année écoulée, jour par jour, quelle que soit la période choisie plus haut
// (le titre le dit). Trois lectures : la charge, le Hooper, les rappels.
//
// Au doigt, une case se touche : son détail s'affiche sous la grille, où il ne
// cache rien et ne sort jamais de l'écran. La case touchée se repère même dans
// l'interstice entre deux cases : on calcule la colonne et la ligne depuis la
// position du doigt, plutôt que de compter sur une cible de 11 px.
//
// La charge d'un jour est celle du calendrier (`index`, construit par la page
// avec `buildDayIndex`) : séances et échéances, une séance manquée valant 0.

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;
const WEEKS = 53;
// Une ligne sur deux porte son initiale : lundi, mercredi, vendredi, dimanche.
const DAY_LABELS = ["L", "", "M", "", "V", "", "D"];
const DAY_COL_W = 14 + 4;

const METRICS = [
  { value: "charge", label: "Charge" },
  { value: "hooper", label: "Hooper" },
  { value: "reminders", label: "Rappels" },
];

export function ActivityHeatmap({ data, index, onOpenDay }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const [metric, setMetric] = useState("charge");
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const todayISO = localDateStr(new Date());

  // Les valeurs de chaque jour ne dépendent que des données : les couleurs,
  // la métrique et la case touchée se calculent au rendu, sans tout refaire.
  const weeks = useMemo(() => {
    const today = new Date(todayISO + "T12:00:00");
    const hooperByDate = new Map((data.hooper || []).filter(h => h?.date).map(h => [h.date, h]));
    const reminders = data.reminders || [];
    const reminderState = data.reminderState || {};
    const startMonday = addDays(getMondayOf(today), -(WEEKS - 1) * 7);
    return Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => {
      const date = addDays(startMonday, w * 7 + d);
      const dateStr = localDateStr(date);
      const e = index?.get(dateStr);
      let charge = 0, sessionCount = 0;
      if (e) {
        // Une séance manquée vaut 0 : `getSessionCharge` le sait déjà.
        for (const s of e.sessions) { sessionCount++; charge += getSessionCharge(s); }
        for (const ev of e.events) charge += getSessionCharge(ev);
      }
      const h = hooperByDate.get(dateStr);
      const active = getActiveRemindersForDate(reminders, date);
      const missed = active.filter(r => !isReminderCheckedOn(reminderState, r.id, dateStr)).length;
      return {
        date, dateStr,
        isFuture: dateStr > todayISO,
        isToday: dateStr === todayISO,
        charge, sessionCount,
        hooper: h?.total ?? null,
        remindersActive: active.length,
        remindersMissed: missed,
        remindersDetail: active.map(r => ({ id: r.id, name: r.name, checked: isReminderCheckedOn(reminderState, r.id, dateStr) })),
      };
    }));
  }, [data, index, todayISO]);

  const empty = c.surface2;
  const colorOf = (day) => {
    if (day.isFuture) return c.card;
    if (metric === "charge") {
      const v = day.charge;
      if (!v) return empty;
      const lv = isDark ? DATA.heatmap.charge.dark : DATA.heatmap.charge.light;
      return v <= 2 ? lv[0] : v <= 5 ? lv[1] : v <= 8 ? lv[2] : v <= 12 ? lv[3] : lv[4];
    }
    if (metric === "hooper") {
      // La même échelle que le journal et la section Récupération.
      return day.hooper == null ? empty : hooperColor(day.hooper, isDark);
    }
    // Rappels : le nombre de rappels **manqués**. Un jour sans rappel dû reste
    // neutre, et la journée en cours n'a encore rien manqué tant qu'il reste
    // quelque chose à cocher.
    if (day.remindersActive === 0) return empty;
    if (day.isToday && day.remindersMissed > 0) return empty;
    const lv = isDark ? DATA.heatmap.reminders.dark : DATA.heatmap.reminders.light;
    return lv[Math.min(day.remindersMissed, lv.length - 1)];
  };

  const maxWeeks = containerWidth > 0
    ? Math.min(WEEKS, Math.max(4, Math.floor((containerWidth - DAY_COL_W) / STEP)))
    : WEEKS;
  const visible = weeks.slice(-maxWeeks);

  const monthLabels = [];
  visible.forEach((week, wi) => {
    const d = week[0].date;
    if (wi === 0 || d.getDate() <= 7) {
      const prev = monthLabels[monthLabels.length - 1];
      if (!prev || wi - prev.wi >= 3) monthLabels.push({ wi, label: d.toLocaleDateString("fr-FR", { month: "short" }) });
    }
  });

  // Toucher la grille : la case sous le doigt, interstices compris.
  const pick = (e) => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return;
    const col = Math.floor((e.clientX - r.left) / STEP);
    const row = Math.floor((e.clientY - r.top) / STEP);
    const day = visible[col]?.[row];
    if (!day || day.isFuture) return;
    setSelected(s => (s === day.dateStr ? null : day.dateStr));
  };

  const sel = selected ? weeks.flat().find(d => d.dateStr === selected) : null;
  const legend = metric === "hooper"
    ? { swatches: [hooperColor(10, isDark), hooperColor(16, isDark), hooperColor(20, isDark)], ends: ["Bien récupéré", "Très fatigué"] }
    : metric === "reminders"
      ? { swatches: isDark ? DATA.heatmap.reminders.dark : DATA.heatmap.reminders.light, ends: ["Aucun manqué", "4 et +"] }
      : { swatches: isDark ? DATA.heatmap.charge.dark : DATA.heatmap.charge.light, ends: ["Moins", "Plus"] };

  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <SectionLabel isDark={isDark}>Régularité</SectionLabel>
        <span style={{ fontSize: 12, color: c.textMuted, margin: "0 4px 8px" }}>sur un an</span>
      </div>
      <Card isDark={isDark} padding={16} radius={16}>
        <div ref={containerRef}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {METRICS.map(m => (
              <Chip key={m.value} isDark={isDark} size="sm" label={m.label}
                    active={metric === m.value} onClick={() => setMetric(m.value)} />
            ))}
          </div>

          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: GAP, paddingTop: 18, marginRight: 4, flexShrink: 0 }}>
              {DAY_LABELS.map((l, i) => (
                <div key={i} style={{ width: 10, height: CELL, fontSize: 8, color: c.textMuted, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                  {l}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <div style={{ position: "relative", height: 16, marginBottom: 2 }}>
                {monthLabels.map(({ wi, label }) => (
                  <span key={wi} style={{ position: "absolute", left: wi * STEP, fontSize: 9, color: c.textMuted, whiteSpace: "nowrap", lineHeight: "16px" }}>
                    {label}
                  </span>
                ))}
              </div>
              <div ref={gridRef} onClick={pick} role="grid" aria-label="Régularité, jour par jour"
                   style={{ display: "flex", gap: GAP, cursor: "pointer", alignSelf: "flex-start" }}>
                {visible.map((week, wi) => (
                  <div key={wi} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                    {week.map((day, di) => (
                      <div key={di} style={{
                        width: CELL, height: CELL, borderRadius: 2, flexShrink: 0,
                        background: colorOf(day),
                        boxShadow: day.dateStr === selected
                          ? `0 0 0 1.5px ${c.text}`
                          : day.isToday ? `inset 0 0 0 1px ${c.accent}` : "none",
                      }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: c.textMuted, marginRight: 3 }}>{legend.ends[0]}</span>
            {legend.swatches.map((col, i) => (
              <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: col, flexShrink: 0 }} />
            ))}
            <span style={{ fontSize: 10, color: c.textMuted, marginLeft: 3 }}>{legend.ends[1]}</span>
          </div>

          {sel ? (
            <DayDetail isDark={isDark} day={sel} metric={metric} index={index} todayISO={todayISO}
                       onOpen={onOpenDay ? () => onOpenDay(sel.dateStr, "week") : null}
                       onClose={() => setSelected(null)} />
          ) : (
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8 }}>Touche une case pour le détail du jour.</div>
          )}
        </div>
      </Card>
    </section>
  );
}

const STATE_LABEL = { done: "faite", missed: "manquée", unrated: "pas notée", planned: "prévue" };

function DayDetail({ isDark, day, metric, index, todayISO, onOpen, onClose }) {
  const c = colors(isDark);
  const items = itemsBetween(index || new Map(), day.dateStr, day.dateStr, todayISO);
  const title = day.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  let headline;
  if (metric === "charge") {
    headline = items.length ? `Charge ${day.charge}, ${plural(items.filter(i => !i.event).length, "séance", "séances")}` : "Aucune séance ce jour-là.";
  } else if (metric === "hooper") {
    headline = day.hooper != null ? `Hooper ${day.hooper}, ${hooperLabel(day.hooper).toLowerCase()}` : "Aucun ressenti noté ce jour-là.";
  } else {
    headline = day.remindersActive === 0 ? "Aucun rappel dû ce jour-là."
      : day.remindersMissed === 0 ? `Tous les rappels cochés (${day.remindersActive}).`
      : `${plural(day.remindersMissed, "rappel manqué", "rappels manqués")} sur ${day.remindersActive}${day.isToday ? ", journée en cours" : ""}.`;
  }
  return (
    <div style={{ marginTop: 12, padding: "12px 12px 10px", borderRadius: 12, background: c.surface2, fontFamily: SANS }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{title.charAt(0).toUpperCase() + title.slice(1)}</span>
        <button type="button" onClick={onClose} aria-label="Fermer le détail"
          style={{ background: "none", border: "none", color: c.textMuted, cursor: "pointer", padding: 4, lineHeight: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div style={{ fontSize: 13, color: c.text, marginBottom: 6 }}>{headline}</div>
      {metric === "charge" && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: it.state === "missed" ? 0.55 : 1 }}>
              <SportDot disciplineId={it.sport} color={it.sport === EVENT_KEY ? DATA.fallback : undefined} size={7} />
              <span style={{ flex: 1, minWidth: 0, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                             textDecoration: it.state === "missed" ? "line-through" : "none" }}>{it.name}</span>
              <span style={{ fontSize: 11, color: it.state === "done" ? c.success : c.textMuted }}>{it.event ? "échéance" : STATE_LABEL[it.state]}</span>
              <span style={{ font: `600 12px ${MONO}`, color: c.textCard, width: 22, textAlign: "right" }}>{it.state === "missed" ? 0 : it.charge}</span>
            </div>
          ))}
        </div>
      )}
      {metric === "reminders" && day.remindersActive > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {day.remindersDetail.map(r => (
            <div key={r.id} style={{ fontSize: 13, color: c.text, display: "flex", gap: 8 }}>
              <span style={{ color: r.checked ? c.success : c.danger, width: 12 }}>{r.checked ? "✓" : "✗"}</span>
              {r.name}
            </div>
          ))}
        </div>
      )}
      {onOpen && (
        <SecondaryButton isDark={isDark} height={36} onClick={onOpen} style={{ marginTop: 10, width: "100%", fontSize: 13 }}>
          Ouvrir ce jour
        </SecondaryButton>
      )}
    </div>
  );
}
