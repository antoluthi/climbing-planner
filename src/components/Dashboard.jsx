import { useMemo, useState } from "react";
import {
  BarChart, Bar, Cell, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { colors, DATA } from "../theme/palette.js";
import { localDateStr } from "../lib/helpers.js";
import { hooperLabel, hooperColor, hooperScaleColor } from "../lib/hooper.js";
import { filterDataBySports, sportFilterLabel, getDiscipline } from "../lib/disciplines.js";
import {
  DEFAULT_RANGE, RANGES, GRAINS, DENSE_POINTS, windowOf, resolveGrain, bucketsFor, grainAllowed,
  stepSelection, selectionIsCurrent, selectionLabel, selectionCaption, currentPeriodLabel,
  previousPhrase, comparisonFor, tickInterval, buildDayIndex, summarize, delta, chargeSeries,
  stackKeys, averageDone, itemsBetween, sportBreakdown, feelStats, deviationVerdict,
  hooperStats, weightStats, nutritionStats, runStats, habitStats, runKm, EVENT_KEY,
  fmtNum, fmtSigned, fmtDuration, shiftISO,
} from "../lib/stats.js";
import { ActivityHeatmap } from "./ActivityHeatmap.jsx";
import { StatsRangePicker } from "./StatsRangePicker.jsx";
import { DashboardSkeleton } from "./ui/Skeleton.jsx";
import {
  PageTitle, Segmented, RoundIconButton, Card, SectionLabel, SportDot, ProgressBar,
  SecondaryButton, Chip, SANS, MONO,
} from "./ui/Ascent.jsx";

// ─── STATS ───────────────────────────────────────────────────────────────────
// Une page qui se lit de haut en bas, et dont tout suit la période choisie en
// tête : le résumé, puis la charge, la répartition par sport, la récupération,
// le ressenti face au plan, la course, le poids, les repas, les habitudes. La
// heatmap ferme la page : elle couvre toujours l'année écoulée, et le dit.
//
// Les calculs vivent dans `lib/stats.js` (purs, testés) ; ce fichier ne fait
// que les dessiner. Un sport isolé (`sports`) filtre tout ce qui dépend des
// séances ; Hooper, poids et repas ne dépendent d'aucun sport et restent
// entiers.

export function Dashboard(props) {
  if (props.isLoading) return <DashboardSkeleton />;
  return <DashboardBody {...props} />;
}

// Chiffres alignés en colonne, dans la police du texte.
const TABULAR = { fontFamily: SANS, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const sportColor = (k) => (k === EVENT_KEY ? DATA.fallback : (DATA.sports[k] || DATA.fallback));
const sportName = (k) => (k === EVENT_KEY ? "Échéance" : getDiscipline(k).label);
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const STATE_LABEL = { done: "faite", missed: "manquée", unrated: "pas notée", planned: "prévue" };

function DashboardBody({ data: rawData, sports, onEditSports, onOpenDay }) {
  const { styles, isDark } = useThemeCtx();
  const c = colors(isDark);
  const data = useMemo(() => filterDataBySports(rawData, sports), [rawData, sports]);
  const filtered = !!sports?.length;
  const index = useMemo(() => buildDayIndex(data, { includeEvents: !filtered }), [data, filtered]);

  // Deux réglages indépendants : la période (un raccourci, ou une plage libre
  // choisie dans la feuille « Dates ») et le découpage (jour, semaine, mois).
  // Le découpage se choisit tout seul selon la longueur ; celui qu'on demande
  // ne tient que tant qu'il reste lisible (`resolveGrain`).
  const [sel, setSel] = useState(() => ({ range: DEFAULT_RANGE, ref: new Date() }));
  const [wantedGrain, setWantedGrain] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // La tranche touchée sur le graphe de charge, attachée à sa période : en
  // changer referme le détail sans effet à déclencher.
  const [picked, setPicked] = useState(null);

  const todayISO = localDateStr(new Date());
  const win = windowOf(sel);
  const grain = resolveGrain(sel, wantedGrain);
  const period = { start: win.start, end: win.end, buckets: bucketsFor(win.start, win.end, grain) };
  const points = period.buckets.length;
  // Beaucoup de tranches : vue simplifiée (une couleur, étiquettes espacées,
  // lecture au doigt). La répartition par sport garde le détail.
  const dense = points > DENSE_POINTS;
  const ticks = tickInterval(points);
  // En vue simplifiée, les graphes se lisent en glissant le doigt : leur zone
  // sort du carrousel d'onglets, qui partirait sinon avec le geste.
  const glideZone = dense ? { "data-no-swipe": "" } : null;
  const periodKey = `${sel.range}:${win.start}:${win.end}:${grain}`;
  const custom = sel.range === "custom";
  const current = selectionIsCurrent(sel, todayISO);
  const cmp = comparisonFor(sel, todayISO);

  // Ce qu'on a déjà utilisé une fois : une section qui sert apparaît toujours,
  // vide ou pleine, pour que la page garde sa forme d'une période à l'autre.
  // Une fonction jamais utilisée (pas de pesée, pas de repas) ne prend pas de
  // place.
  const used = useMemo(() => {
    let run = !!data.profile?.kmGoal, rated = false;
    for (const e of index.values()) {
      for (const s of e.sessions) {
        if (!run && runKm(s) > 0) run = true;
        if (!rated && (s.feedback?.rpe != null || s.feedback?.quality != null)) rated = true;
      }
      if (run && rated) break;
    }
    return {
      run, rated,
      hooper: (data.hooper || []).length > 0,
      weight: Object.values(data.weight || {}).some(v => v != null),
      nutrition: Object.values(data.nutrition || {}).some(m => Array.isArray(m) && m.length),
      reminders: (data.reminders || []).length > 0,
    };
  }, [data, index]);

  const change = (dir) => { setSel(x => stepSelection(x, dir)); setPicked(null); };
  const chooseRange = (r) => {
    // « Dates » ouvre la feuille ; la plage ne change qu'une fois choisie.
    if (r === "custom") { setPickerOpen(true); return; }
    setSel({ range: r, ref: new Date() }); setWantedGrain(null); setPicked(null);
  };
  const applyRange = (next) => { setSel(next); setWantedGrain(null); setPicked(null); };
  const chooseGrain = (g) => { setWantedGrain(g); setPicked(null); };

  // ── Lectures de la période ──
  const cur = cmp ? summarize(index, cmp.cur.start, cmp.cur.end, todayISO) : summarize(index, period.start, period.end, todayISO);
  const prev = cmp ? summarize(index, cmp.prev.start, cmp.prev.end, todayISO) : null;
  // Une variation n'a de sens que si les deux périodes ont quelque chose de
  // noté : un mardi où la séance de lundi attend son retour, « −100 % » ne
  // dirait que ça ; face à des mois où l'app ne servait pas encore, tout
  // serait « nouveau ».
  const compared = prev && cur.done > 0 && prev.done > 0 ? prev : null;
  // Ce qui reste à venir dans la période (au-delà d'aujourd'hui compris).
  const ahead = summarize(index, period.start > todayISO ? period.start : todayISO, period.end, todayISO).planned;
  // La part écoulée de la période : vide si elle est entièrement à venir.
  const elapsedEnd = cmp ? cmp.cur.end : shiftISO(period.start, -1);
  const chargeRows = chargeSeries(index, period.buckets, todayISO);
  const keys = stackKeys(chargeRows);
  const prevWin = windowOf(stepSelection(sel, -1));
  const prevAvg = averageDone(chargeSeries(index, bucketsFor(prevWin.start, prevWin.end, grain), todayISO));
  const split = sportBreakdown(index, period.start, elapsedEnd, todayISO);
  const feel = feelStats(index, period.start, elapsedEnd, period.buckets, todayISO);
  const hooper = hooperStats(data, period.start, period.end, period.buckets);
  const weight = weightStats(data, period.start, period.end, period.buckets);
  const food = nutritionStats(data, period.start, period.end, period.buckets);
  const run = runStats(index, period.buckets, data, todayISO);
  const habits = habitStats(data, period.start, period.end, todayISO);
  const nothingYet = !cmp; // période entièrement à venir

  const pickedIndex = picked?.key === periodKey ? picked.index : null;
  const pickedBucket = pickedIndex != null ? period.buckets[pickedIndex] : null;

  const axisTick = { fill: styles.dashText, fontSize: 10 };
  const tooltipStyle = {
    background: styles.dashTooltipBg, border: `1px solid ${c.border}`, borderRadius: 10,
    color: styles.dashTooltipText, fontSize: 12, fontFamily: SANS, padding: "6px 10px",
  };
  const muted = { fontSize: 12, color: c.textMuted, lineHeight: 1.5 };
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div style={{ ...styles.dashboard, maxWidth: 600, margin: "0 auto", width: "100%" }}>
      {/* La puce du filtre est l'action principale du titre : c'est ce qui
          rend trouvable l'appui long sur l'onglet, et le seul chemin sur
          ordinateur, où il n'y a pas de barre du bas. */}
      <PageTitle
        isDark={isDark}
        right={onEditSports ? (
          <button
            type="button"
            onClick={onEditSports}
            aria-label="Choisir les sports affichés"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: filtered ? c.accentBg : c.control,
              border: `1px solid ${filtered ? c.accentBorder : "transparent"}`,
              borderRadius: 999, padding: "6px 12px", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 600,
              color: filtered ? c.accent : c.textCard,
            }}
          >
            {sportFilterLabel(sports)}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ) : undefined}
      >Stats</PageTitle>

      {/* ── Période : tout ce qui suit en dépend ── */}
      <Segmented isDark={isDark} value={sel.range} onChange={chooseRange} options={RANGES} style={{ marginBottom: 12 }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <RoundIconButton isDark={isDark} size={34} label="Période précédente" onClick={() => change(-1)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </RoundIconButton>
        {/* Une plage libre se change en touchant son libellé ; un raccourci
            y revient à la période en cours, comme dans le calendrier. */}
        <button
          type="button"
          onClick={custom ? () => setPickerOpen(true)
            : current ? undefined : () => { setSel(x => ({ ...x, ref: new Date() })); setPicked(null); }}
          title={custom ? "Changer la période" : current ? undefined : "Revenir à la période en cours"}
          style={{
            textAlign: "center", minWidth: 0, background: "none", border: "none", padding: 0,
            cursor: custom || !current ? "pointer" : "default", fontFamily: SANS,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: c.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {selectionLabel(sel, todayISO)}
            {custom && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2.2"
                   strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
            )}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: custom ? c.textMuted : current ? c.accent : c.textDim, marginTop: 2 }}>
            {custom ? selectionCaption(sel) : current ? currentPeriodLabel(sel.range) : "Revenir à aujourd'hui"}
          </div>
        </button>
        <RoundIconButton isDark={isDark} size={34} label="Période suivante" onClick={() => change(1)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </RoundIconButton>
      </div>

      {/* ── Découpage : vaut pour tous les graphes à la fois ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "-6px 2px 18px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: c.textDim, marginRight: 2 }}>Par</span>
        {GRAINS.map(g => {
          const ok = grainAllowed(win.start, win.end, g.value);
          return (
            <Chip key={g.value} isDark={isDark} size="sm" label={g.label} active={grain === g.value}
                  onClick={ok ? () => chooseGrain(g.value) : undefined}
                  style={{ padding: "5px 12px", opacity: ok ? 1 : 0.35, cursor: ok ? "pointer" : "default" }} />
          );
        })}
        {!grainAllowed(win.start, win.end, "day") && (
          <span style={{ fontSize: 11, color: c.textDim, marginLeft: 4 }}>
            {grainAllowed(win.start, win.end, "week") ? "trop long par jour" : "trop long par jour ou semaine"}
          </span>
        )}
      </div>

      {pickerOpen && (
        <StatsRangePicker
          todayISO={todayISO}
          initial={win}
          mesocycles={rawData.mesocycles}
          onApply={applyRange}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* ── Résumé ── */}
      <Summary
        isDark={isDark} cur={cur} prev={compared} ahead={ahead} hooper={hooper}
        showKm={used.run} showHooper={used.hooper} nothingYet={nothingYet}
        onJump={scrollTo}
      />
      {compared && (
        <div style={{ ...muted, fontSize: 11, color: c.textDim, margin: "-10px 4px 22px" }}>
          Variations par rapport {previousPhrase(sel)}{cmp.partial ? ", à la même date" : ""}.
        </div>
      )}

      {/* ── Charge ── */}
      <Section isDark={isDark} id="stats-charge" title="Charge"
        right={`par ${GRAINS.find(g => g.value === grain)?.label}${dense ? " · vue simplifiée" : ""}`}>
        {chargeRows.some(r => r.done || r.open) ? (
          <>
            <div {...glideZone}>
              <ResponsiveContainer key={periodKey} width="100%" height={190}>
                <BarChart
                  data={chargeRows}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap={dense ? "8%" : points <= 6 ? "28%" : "18%"}
                  onClick={(state) => {
                    const i = Number(state?.activeTooltipIndex);
                    if (!Number.isInteger(i) || i < 0 || i >= chargeRows.length) return;
                    setPicked(p => (p?.key === periodKey && p.index === i ? null : { key: periodKey, index: i }));
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={ticks} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={30} allowDecimals={false}
                         tickFormatter={v => fmtNum(v, 0)} />
                  {dense ? (
                    // Vue simplifiée : les barres sont trop fines pour se viser,
                    // on glisse le doigt et la valeur suit.
                    <Tooltip cursor={{ fill: c.tint }}
                      content={({ active, payload }) => {
                        const row = active && payload?.[0]?.payload;
                        if (!row) return null;
                        return (
                          <div style={tooltipStyle}>
                            <b>{bucketTitle(row)}</b>
                            <div style={{ marginTop: 2 }}>
                              Charge {fmtNum(row.done + row.open, 0)}
                              {row.open > 0 && (
                                <span style={{ color: c.textMuted }}>
                                  {row.done > 0 ? ` dont ${fmtNum(row.open, 0)}` : ""} prévue ou pas notée
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }} />
                  ) : (
                    // Infobulle invisible : c'est elle qui dit au graphe quelle
                    // tranche est sous le doigt. Le détail s'affiche sous le
                    // graphe, où il ne cache rien.
                    <Tooltip content={() => null} cursor={false} />
                  )}
                  {prevAvg != null && (
                    <ReferenceLine y={prevAvg} stroke={c.textMuted} strokeDasharray="4 4" strokeOpacity={0.8} />
                  )}
                  {dense ? [
                    <Bar key="d" dataKey="done" stackId="c" fill={c.accent} isAnimationActive={false}>
                      {chargeRows.map((_, i) => <Cell key={i} fillOpacity={pickedIndex == null || pickedIndex === i ? 1 : 0.45} />)}
                    </Bar>,
                    <Bar key="o" dataKey="open" stackId="c" fill={c.accent} isAnimationActive={false}>
                      {chargeRows.map((_, i) => <Cell key={i} fillOpacity={pickedIndex == null || pickedIndex === i ? 0.32 : 0.14} />)}
                    </Bar>,
                  ] : [
                    ...keys.map(k => (
                      <Bar key={"d" + k} dataKey={"d_" + k} stackId="c" fill={sportColor(k)} isAnimationActive={false}>
                        {chargeRows.map((_, i) => (
                          <Cell key={i} fillOpacity={pickedIndex == null || pickedIndex === i ? 1 : 0.35} />
                        ))}
                      </Bar>
                    )),
                    ...keys.map(k => (
                      <Bar key={"o" + k} dataKey={"o_" + k} stackId="c" fill={sportColor(k)} isAnimationActive={false}>
                        {chargeRows.map((_, i) => (
                          <Cell key={i} fillOpacity={pickedIndex == null || pickedIndex === i ? 0.32 : 0.12} />
                        ))}
                      </Bar>
                    )),
                  ]}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!dense && (
              <Legend isDark={isDark} items={keys.map(k => ({ color: sportColor(k), label: sportName(k) }))} />
            )}
            <div style={{ ...muted, fontSize: 11, marginTop: 6 }}>
              Plein : fait. Atténué : prévu ou pas encore noté.
              {prevAvg != null && <> Pointillés : moyenne de la période d'avant ({fmtNum(prevAvg)}).</>}
              {dense && " Une seule couleur à cette échelle, le détail par sport est dans Répartition. Glisse le doigt sur le graphe pour lire chaque tranche."}
              {!pickedBucket && " Touche une barre pour le détail."}
            </div>
            {pickedBucket && (
              <BucketDetail
                isDark={isDark} bucket={pickedBucket}
                items={itemsBetween(index, pickedBucket.start, pickedBucket.end, todayISO)}
                onOpen={onOpenDay ? () => onOpenDay(pickedBucket.start, pickedBucket.kind === "month" ? "month" : "week") : null}
                onClose={() => setPicked(null)}
              />
            )}
          </>
        ) : (
          <Empty isDark={isDark}>Aucune séance sur la période.</Empty>
        )}
      </Section>

      {/* ── Répartition par sport ── */}
      <Section isDark={isDark} id="stats-sports" title="Répartition"
        right={split.totalCount ? (split.byTime ? fmtDuration(split.totalMin) : plural(split.totalCount, "séance", "séances")) : null}>
        {split.rows.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {split.rows.map(r => (
              <div key={r.sport}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <SportDot disciplineId={r.sport} size={8} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: c.text, flex: 1, minWidth: 0 }}>{sportName(r.sport)}</span>
                  <span style={{ fontSize: 12, color: c.textMuted, whiteSpace: "nowrap" }}>
                    {r.minutes ? `${fmtDuration(r.minutes)} · ` : ""}{plural(r.count, "séance", "séances")}
                  </span>
                  <span style={{ ...TABULAR, fontSize: 13, fontWeight: 700, color: c.text, width: 44, textAlign: "right" }}>
                    {Math.round(r.share * 100)} %
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: c.control, overflow: "hidden" }}>
                  <div style={{ width: `${r.share * 100}%`, height: "100%", borderRadius: 3, background: sportColor(r.sport) }} />
                </div>
              </div>
            ))}
            {!split.byTime && (
              <div style={{ ...muted, fontSize: 11 }}>Parts calculées sur le nombre de séances : aucune durée n'est saisie.</div>
            )}
          </div>
        ) : (
          <Empty isDark={isDark}>{nothingYet ? "Période à venir." : "Aucune séance faite sur la période."}</Empty>
        )}
      </Section>

      {/* ── Récupération ── */}
      {used.hooper && (
        <Section isDark={isDark} id="stats-hooper" title="Récupération"
          right={hooper.n ? plural(hooper.n, "jour noté", "jours notés") : null}>
          {hooper.n ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <span style={{ font: `700 26px ${MONO}`, color: hooperColor(Math.round(hooper.avg), isDark) }}>{fmtNum(hooper.avg)}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{hooper.label}</span>
                <span style={{ fontSize: 12, color: c.textMuted }}>Hooper moyen</span>
              </div>
              <div {...glideZone}>
                <ResponsiveContainer key={periodKey} width="100%" height={150}>
                  {dense ? (
                    // Beaucoup de points : une courbe, les deux seuils en repère.
                    <LineChart data={hooper.perBucket} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={ticks} />
                      <YAxis domain={[4, 28]} ticks={[7, 14, 21, 28]} tick={axisTick} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={tooltipStyle}
                        formatter={v => (v == null ? null : [`${v} · ${hooperLabel(v)}`, "Hooper"])} />
                      <ReferenceLine y={14} stroke={c.warnBorder} strokeDasharray="4 4" />
                      <ReferenceLine y={17} stroke={c.dangerBorder} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="total" name="Hooper" stroke={c.textCard} strokeWidth={1.8}
                            dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                    </LineChart>
                  ) : (
                    <BarChart data={hooper.perBucket} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                      <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={ticks} />
                      <YAxis domain={[0, 28]} ticks={[0, 7, 14, 21, 28]} tick={axisTick} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: c.tint }}
                        formatter={v => (v == null ? null : [`${v} · ${hooperLabel(v)}`, "Hooper"])} />
                      <ReferenceLine y={14} stroke={c.warnBorder} strokeDasharray="4 4" />
                      <ReferenceLine y={17} stroke={c.dangerBorder} strokeDasharray="4 4" />
                      <Bar dataKey="total" name="Hooper" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false}>
                        {hooper.perBucket.map((b, i) => (
                          <Cell key={i} fill={b.total == null ? "transparent" : hooperColor(b.total, isDark)} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div style={{ ...muted, fontSize: 11, marginTop: 4 }}>
                Jusqu'à 14 : bien récupéré. De 15 à 17 : modérément fatigué. Au-delà : très fatigué.
              </div>
              <div style={{ height: 0.5, background: c.border, margin: "14px 0 12px" }} />
              {hooper.dominant && (
                <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>
                  Ce qui pèse le plus : <b style={{ color: c.text }}>{hooper.dominant.label.toLowerCase()}</b>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {hooper.criteria.filter(k => k.avg != null).map(k => (
                  <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: k.key === hooper.dominant?.key ? c.text : c.textCard, fontWeight: k.key === hooper.dominant?.key ? 700 : 500, width: 96 }}>{k.label}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: c.control, overflow: "hidden" }}>
                      <div style={{ width: `${((k.avg - 1) / 6) * 100}%`, minWidth: 4, height: "100%", borderRadius: 3, background: hooperScaleColor(k.avg, isDark) }} />
                    </div>
                    <span style={{ ...TABULAR, fontSize: 12, fontWeight: 600, color: c.textMuted, minWidth: 52, textAlign: "right" }}>{fmtNum(k.avg)} / 7</span>
                  </div>
                ))}
              </div>
              <div style={{ ...muted, fontSize: 11, marginTop: 8 }}>1 est le meilleur côté, 7 le pire.</div>
            </>
          ) : (
            <Empty isDark={isDark}>Aucun ressenti noté sur la période.</Empty>
          )}
        </Section>
      )}

      {/* ── Ressenti face au plan ── */}
      {used.rated && (
        <Section isDark={isDark} id="stats-feel" title="Ressenti face au plan"
          right={feel.nDev ? plural(feel.nDev, "séance notée", "séances notées") : null}>
          {feel.nDev || feel.nQuality ? (
            <>
              {feel.dev != null && (
                <div style={{ fontSize: 14, color: c.text, lineHeight: 1.45, marginBottom: 4 }}>
                  {Math.abs(feel.dev) < 0.5
                    ? <>Tes séances étaient <b>bien estimées</b> (écart moyen {fmtSigned(feel.dev)}).</>
                    : <>Tes séances ont été en moyenne <b style={{ color: feel.dev > 0 ? c.accent : c.info }}>{deviationVerdict(feel.dev)}</b> ({fmtSigned(feel.dev)}).</>}
                </div>
              )}
              {feel.quality != null && (
                <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>
                  Qualité moyenne <span style={{ color: c.qualityLine, letterSpacing: 1 }}>{stars(feel.quality)}</span> {fmtNum(feel.quality)} / 5
                </div>
              )}
              {feel.nDev > 0 && (
                <div {...glideZone}>
                  <ResponsiveContainer key={periodKey} width="100%" height={130}>
                    <BarChart data={feel.perBucket} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap={dense ? "8%" : "28%"}>
                      <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={ticks} />
                      <YAxis domain={[-3, 3]} ticks={[-3, 0, 3]} allowDataOverflow tick={axisTick} axisLine={false} tickLine={false} width={30}
                             tickFormatter={v => fmtSigned(v, 0)} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: c.tint }}
                        formatter={(v, _n, item) => (v == null ? null : [`${fmtSigned(v)} sur ${plural(item?.payload?.n || 0, "séance", "séances")}`, "Écart"])} />
                      <ReferenceLine y={0} stroke={styles.dashText} strokeOpacity={0.6} />
                      <Bar dataKey="dev" name="Écart" shape={<DeviationBar />} maxBarSize={30} isAnimationActive={false}>
                        {feel.perBucket.map((b, i) => (
                          <Cell key={i} fill={b.dev == null ? "transparent" : b.dev > 0 ? c.accent : b.dev < 0 ? c.info : c.textMuted} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {feel.perSport.length > 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {feel.perSport.map(p => (
                    <div key={p.sport} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <SportDot disciplineId={p.sport} size={8} />
                      <span style={{ color: c.text, fontWeight: 600, flex: 1, minWidth: 0 }}>{sportName(p.sport)}</span>
                      {p.dev != null && (
                        <span style={{ font: `600 12px ${MONO}`, color: Math.abs(p.dev) < 0.5 ? c.textMuted : p.dev > 0 ? c.accent : c.info }}>
                          {fmtSigned(p.dev)}
                        </span>
                      )}
                      {p.quality != null && (
                        <span style={{ fontSize: 12, color: c.textMuted, width: 58, textAlign: "right" }}>
                          <span style={{ color: c.qualityLine }}>★</span> {fmtNum(p.quality)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ ...muted, fontSize: 11, marginTop: 8 }}>
                L'écart, c'est le ressenti moins la charge prévue. Au-dessus de zéro, plus dur que prévu.
              </div>
            </>
          ) : (
            <Empty isDark={isDark}>Aucune séance notée sur la période. L'écart et la qualité viennent du retour de séance.</Empty>
          )}
        </Section>
      )}

      {/* ── Course ── */}
      {used.run && (
        <Section isDark={isDark} id="stats-run" title="Course"
          right={run.done || run.open ? `${fmtNum(run.done)} km courus` : null}>
          {run.done || run.open ? (
            <>
              <div {...glideZone}>
                <ResponsiveContainer key={periodKey} width="100%" height={160}>
                  <ComposedChart data={run.rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={dense ? "8%" : "28%"}>
                    <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={ticks} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={30} allowDecimals={false}
                           tickFormatter={v => fmtNum(v, 0)} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: c.tint }}
                      formatter={(v, name) => {
                        if (v == null || (v === 0 && name !== "Couru")) return null;
                        return [`${fmtNum(v)} km`, name];
                      }} />
                    <Bar dataKey="done" name="Couru" stackId="k" fill={DATA.sports.running} isAnimationActive={false} />
                    <Bar dataKey="open" name="Prévu" stackId="k" fill={DATA.sports.running} fillOpacity={0.32} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    {run.rows.some(r => r.goal != null) && (
                      <Line dataKey="goal" name="Objectif" stroke="transparent" isAnimationActive={false} activeDot={false}
                            dot={(p) => <GoalTick key={p.index} {...p} color={c.text} half={dense ? 4 : 13} />} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ ...muted, fontSize: 11, marginTop: 6 }}>
                Plein : couru. Atténué : prévu.{run.rows.some(r => r.goal != null) && " Trait : objectif de la semaine."}
              </div>
              {run.goalWeeks > 0 && (
                <div style={{ fontSize: 13, color: c.text, marginTop: 8 }}>
                  Objectif tenu {run.goalHit} {run.goalHit > 1 ? "semaines" : "semaine"} sur {run.goalWeeks}.
                </div>
              )}
              {run.weekGoal != null && (
                <div style={{ fontSize: 13, color: c.text, marginTop: 8 }}>
                  Objectif de la semaine : {fmtNum(run.weekGoal)} km, {fmtNum(run.done)} faits.
                </div>
              )}
              {prev && (prev.km > 0 || cur.km > 0) && (
                <div style={{ ...muted, marginTop: 4 }}>{deltaPhrase(delta(cur.km, prev.km), "km")}</div>
              )}
            </>
          ) : (
            <Empty isDark={isDark}>Aucune sortie sur la période.</Empty>
          )}
        </Section>
      )}

      {/* ── Poids ── */}
      {used.weight && (
        <Section isDark={isDark} id="stats-weight" title="Poids"
          right={weight.last ? `${fmtNum(weight.last.kg)} kg` : null}>
          {weight.n ? (
            <>
              <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 8 }}>
                {weight.delta != null
                  ? <>{fmtSigned(weight.delta)} kg sur la période, {plural(weight.n, "pesée", "pesées")}.</>
                  : <>Une seule pesée sur la période.</>}
              </div>
              <div {...glideZone}>
                <ResponsiveContainer key={periodKey} width="100%" height={150}>
                  <LineChart data={weight.perBucket} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={ticks} padding={{ left: 10, right: 10 }} />
                    <YAxis domain={weight.domain} ticks={weight.ticks} tick={axisTick} axisLine={false} tickLine={false} width={38}
                           tickFormatter={v => fmtNum(v)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => (v == null ? null : [`${fmtNum(v)} kg`, "Poids"])} />
                    <Line type="monotone" dataKey="kg" name="Poids" stroke={c.info} strokeWidth={2}
                          dot={dense ? false : { r: 3, fill: c.info }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <Empty isDark={isDark}>Aucune pesée sur la période.</Empty>
          )}
        </Section>
      )}

      {/* ── Repas ── */}
      {used.nutrition && (
        <Section isDark={isDark} id="stats-food" title="Repas"
          right={food.days ? plural(food.days, "jour noté", "jours notés") : null}>
          {food.days ? (
            <>
              <div style={{ fontSize: 13, color: c.text, marginBottom: 8 }}>
                {fmtNum(food.cal, 0)} kcal et {fmtNum(food.prot, 0)} g de protéines par jour, en moyenne.
              </div>
              <div {...glideZone}>
                <ResponsiveContainer key={periodKey} width="100%" height={130}>
                  <BarChart data={food.perBucket} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap={dense ? "8%" : "28%"}>
                    <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={ticks} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={38} tickFormatter={v => fmtNum(v, 0)} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: c.tint }}
                      formatter={(v, _n, item) => (v == null ? null
                        : [`${fmtNum(v, 0)} kcal · ${fmtNum(item?.payload?.prot, 0)} g de protéines`, "Par jour"])} />
                    <Bar dataKey="cal" name="Calories" fill={c.warn} radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ ...muted, fontSize: 11, marginTop: 6 }}>Calories par jour noté. Les protéines sont dans le détail de chaque barre.</div>
            </>
          ) : (
            <Empty isDark={isDark}>Aucun repas noté sur la période.</Empty>
          )}
        </Section>
      )}

      {/* ── Habitudes ── */}
      {(used.reminders || used.hooper) && (
        <Section isDark={isDark} id="stats-habits" title="Habitudes">
          {habits.journal.total || habits.reminders.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {used.hooper && habits.journal.total > 0 && (
                <HabitRow isDark={isDark} label="Journal rempli" done={habits.journal.filled} total={habits.journal.total} unit="jours" />
              )}
              {habits.reminders.map(r => (
                <HabitRow key={r.id} isDark={isDark} color={r.color}
                  label={r.deleted ? `${r.name} (supprimé)` : r.name}
                  done={r.checked} total={r.due} unit="jours" />
              ))}
              {used.reminders && habits.reminders.length === 0 && (
                <div style={muted}>Aucun rappel dû sur la période.</div>
              )}
            </div>
          ) : (
            <Empty isDark={isDark}>{nothingYet ? "Période à venir." : "Rien à compter sur la période."}</Empty>
          )}
        </Section>
      )}

      {/* ── Régularité : l'année écoulée, quelle que soit la période ── */}
      <ActivityHeatmap data={data} index={index} onOpenDay={onOpenDay} />
    </div>
  );
}

// ─── Morceaux ────────────────────────────────────────────────────────────────

function Section({ isDark, id, title, right, children }) {
  const c = colors(isDark);
  return (
    <section id={id} style={{ marginBottom: 22, scrollMarginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <SectionLabel isDark={isDark}>{title}</SectionLabel>
        {right && <span style={{ fontSize: 12, color: c.textMuted, margin: "0 4px 8px", whiteSpace: "nowrap" }}>{right}</span>}
      </div>
      <Card isDark={isDark} padding={16} radius={16}>{children}</Card>
    </section>
  );
}

function Empty({ isDark, children }) {
  return <div style={{ fontSize: 13, color: colors(isDark).textMuted, lineHeight: 1.5, padding: "6px 0" }}>{children}</div>;
}

function Legend({ isDark, items }) {
  const c = colors(isDark);
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
      {items.map(it => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.textMuted }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

const stars = (q) => {
  const n = Math.max(0, Math.min(5, Math.round(q)));
  return "★".repeat(n) + "☆".repeat(5 - n);
};

// « +12 % » ne dit rien sans « par rapport à quoi » : la phrase sous le
// résumé le dit une fois pour toute la page.
function deltaPhrase(d, unit) {
  if (!d) return "";
  if (d.pct == null) return `0 ${unit} sur la période d'avant.`;
  if (d.pct === 0) return "Autant que la période d'avant.";
  return `${fmtSigned(d.diff)} ${unit} par rapport à la période d'avant (${fmtSigned(d.pct, 0)} %).`;
}

// ── Résumé : quatre cartes ───────────────────────────────────────────────────
function Summary({ isDark, cur, prev, ahead, hooper, showKm, showHooper, nothingYet, onJump }) {
  const c = colors(isDark);
  const cards = [];
  const waiting = !nothingYet && cur.done === 0 && cur.unrated > 0 ? "à noter" : "";
  const sub = [];
  if (cur.unrated) sub.push(plural(cur.unrated, "non notée", "non notées"));
  if (cur.missed) sub.push(plural(cur.missed, "manquée", "manquées"));
  if (ahead) sub.push(`${ahead} à venir`);
  cards.push({
    key: "sessions", label: "Séances", jump: "stats-charge",
    value: nothingYet ? "0" : String(cur.done),
    unit: cur.due ? `sur ${cur.due}` : null,
    delta: prev ? countDelta(cur.done, prev.done) : null,
    note: sub.join(" · "),
  });
  cards.push({
    key: "time", label: "Temps", jump: "stats-sports",
    value: <Duration minutes={cur.minutes} />,
    delta: prev ? pctDelta(delta(cur.minutes, prev.minutes)) : null,
    note: waiting,
  });
  cards.push({
    key: "charge", label: "Charge", jump: "stats-charge",
    value: fmtNum(cur.charge, 0),
    delta: prev ? pctDelta(delta(cur.charge, prev.charge)) : null,
    note: cur.done ? `${fmtNum(cur.charge / Math.max(1, cur.done))} par séance` : waiting,
  });
  if (showKm) {
    cards.push({
      key: "km", label: "Course", jump: "stats-run",
      value: fmtNum(cur.km), unit: "km",
      delta: prev && (cur.km || prev.km) ? pctDelta(delta(cur.km, prev.km)) : null,
    });
  } else if (showHooper && hooper.n) {
    cards.push({
      key: "hooper", label: "Hooper moyen", jump: "stats-hooper",
      value: fmtNum(hooper.avg), valueColor: hooperColor(Math.round(hooper.avg), isDark),
      note: hooper.label,
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
      {cards.map((card, i) => (
        <button
          key={card.key}
          type="button"
          onClick={() => onJump(card.jump)}
          style={{
            gridColumn: cards.length % 2 === 1 && i === cards.length - 1 ? "span 2" : undefined,
            textAlign: "left", background: c.card, border: `1px solid ${c.border}`, borderRadius: 16,
            padding: "12px 14px", cursor: "pointer", fontFamily: SANS, minWidth: 0,
            display: "flex", flexDirection: "column", gap: 3,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: c.textDim }}>
            {card.label}
          </span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
            <span style={{ font: `700 22px ${MONO}`, color: card.valueColor || c.text, whiteSpace: "nowrap" }}>{card.value}</span>
            {card.unit && <span style={{ fontSize: 12, color: c.textMuted, whiteSpace: "nowrap" }}>{card.unit}</span>}
          </span>
          {(card.delta || card.note) && (
            <span style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.35 }}>
              {card.delta && <span style={{ color: c.textCard, fontWeight: 600 }}>{card.delta}</span>}
              {card.delta && card.note ? " · " : ""}
              {card.note}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// « 32 h 25 » : les chiffres comme les autres valeurs, l'unité en petit.
function Duration({ minutes }) {
  const m = Math.round(minutes || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  const unit = { fontFamily: SANS, fontSize: 13, fontWeight: 600, margin: "0 3px 0 2px" };
  if (!m) return <>0<span style={unit}>h</span></>;
  if (!h) return <>{r}<span style={unit}>min</span></>;
  return <>{h}<span style={unit}>h</span>{r ? String(r).padStart(2, "0") : ""}</>;
}

function pctDelta(d) {
  if (!d) return null;
  if (d.pct == null) return "nouveau";
  return `${fmtSigned(d.pct, 0)} %`;
}
function countDelta(cur, prev) {
  if (prev == null) return null;
  const diff = cur - prev;
  return diff === 0 ? "=" : fmtSigned(diff, 0);
}

// Le titre d'une tranche, en toutes lettres : « lundi 22 septembre »,
// « semaine du 12 août », « octobre 2026 ». Une tranche que la période coupe
// dit ses jours (« du 12 au 16 août ») : elle ne compte que ceux-là.
function bucketTitle(b) {
  const day = (s, o) => new Date(s + "T12:00:00").toLocaleDateString("fr-FR", o)
    .replace(/(^|\s)1(?=\s|$)/, "$11er");
  const dayMonth = { day: "numeric", month: "long" };
  let t;
  if (b.kind === "day" || b.start === b.end) t = day(b.start, { weekday: "long", ...dayMonth });
  else if (!b.full) {
    const sameMonth = b.start.slice(0, 7) === b.end.slice(0, 7);
    t = `du ${day(b.start, sameMonth ? { day: "numeric" } : dayMonth)} au ${day(b.end, dayMonth)}`;
  } else if (b.kind === "month") t = day(b.start, { month: "long", year: "numeric" });
  else t = `semaine du ${day(b.start, dayMonth)}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Détail d'une tranche touchée ─────────────────────────────────────────────
function BucketDetail({ isDark, bucket, items, onOpen, onClose }) {
  const c = colors(isDark);
  const title = bucketTitle(bucket);
  const MAX = 8;
  const shown = items.slice(0, MAX);
  return (
    <div style={{ marginTop: 12, padding: "12px 12px 10px", borderRadius: 12, background: c.surface2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{title}</span>
        <button type="button" onClick={onClose} aria-label="Fermer le détail"
          style={{ background: "none", border: "none", color: c.textMuted, cursor: "pointer", padding: 4, lineHeight: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {shown.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {shown.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: it.state === "missed" ? 0.55 : 1 }}>
              <SportDot disciplineId={it.sport} color={it.event ? DATA.fallback : undefined} size={7} />
              {bucket.kind !== "day" && (
                <span style={{ fontSize: 11, color: c.textMuted, width: 34, flexShrink: 0 }}>
                  {new Date(it.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}
                  {bucket.kind === "month" ? ` ${Number(it.date.slice(8))}` : ""}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                             textDecoration: it.state === "missed" ? "line-through" : "none" }}>{it.name}</span>
              <span style={{ fontSize: 11, color: it.state === "done" ? c.success : c.textMuted }}>{it.event ? "échéance" : STATE_LABEL[it.state]}</span>
              <span style={{ font: `600 12px ${MONO}`, color: c.textCard, width: 22, textAlign: "right" }}>{it.state === "missed" ? 0 : it.charge}</span>
            </div>
          ))}
          {items.length > MAX && <div style={{ fontSize: 12, color: c.textMuted }}>et {items.length - MAX} de plus</div>}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: c.textMuted }}>Rien de prévu.</div>
      )}
      {onOpen && (
        <SecondaryButton isDark={isDark} height={36} onClick={onOpen} style={{ marginTop: 10, width: "100%", fontSize: 13 }}>
          Voir dans le calendrier
        </SecondaryButton>
      )}
    </div>
  );
}

function HabitRow({ isDark, label, color, done, total, unit }) {
  const c = colors(isDark);
  const ratio = total ? done / total : 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {color && <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />}
        <span style={{ fontSize: 14, color: c.text, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: 12, color: c.textMuted, whiteSpace: "nowrap" }}>{done} / {total} {unit}</span>
        <span style={{ ...TABULAR, fontSize: 13, fontWeight: 700, color: c.text, width: 44, textAlign: "right" }}>{Math.round(ratio * 100)} %</span>
      </div>
      <ProgressBar isDark={isDark} ratio={ratio} />
    </div>
  );
}

// ── Formes de graphe ─────────────────────────────────────────────────────────
// Le curseur de ressenti part de la charge prévue : confirmer sans y toucher
// donne un écart de zéro, donc une barre de hauteur nulle. « Noté et bien
// estimé » doit se distinguer de « rien à afficher » : un écart trop petit pour
// se voir devient un trait posé sur la ligne du zéro.
const ZERO_MARK = 3;
function DeviationBar({ x, y, width, height, fill, value }) {
  if (value == null || x == null) return null;
  if (Math.abs(height) >= ZERO_MARK) {
    return <rect x={x} y={height < 0 ? y + height : y} width={width} height={Math.abs(height)} rx={3} fill={fill} />;
  }
  return <rect x={x} y={y - ZERO_MARK / 2} width={width} height={ZERO_MARK} rx={1.5} fill={fill} />;
}

// L'objectif d'une semaine : un trait horizontal à sa hauteur, sur la barre.
function GoalTick({ cx, cy, value, color, half = 13 }) {
  if (value == null || cx == null || cy == null) return <g />;
  return <line x1={cx - half} x2={cx + half} y1={cy} y2={cy} stroke={color} strokeWidth={2.5} strokeLinecap="round" />;
}
