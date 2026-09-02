import { useMemo, useState } from "react";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { BarChart, Bar, Cell, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { getMondayOf, addDays, localDateStr, formatDate } from "../lib/helpers.js";
import { ActivityHeatmap } from "./ActivityHeatmap.jsx";
import { SleepSection } from "./SleepSection.jsx";
import { DashboardSkeleton } from "./ui/Skeleton.jsx";
import { getSessionCharge, normalizeCharge10 } from "../lib/charge.js";
import { colors } from "../theme/palette.js";
import { filterDataBySports, sportFilterLabel } from "../lib/disciplines.js";
import { PageTitle, Segmented, RoundIconButton } from "./ui/Ascent.jsx";

// ─── Spline cubique monotone passant par chaque point ────────────────────────
// Recharts a déjà type='monotone' qui dessine une spline cubique
// monotone à travers TOUS les points non-null. Combiné à connectNulls,
// la courbe enjambe les jours sans mesure et passe exactement par
// chaque mesure réelle — comportement le plus naturel pour
// poids/RPE en présence de mesures espacées irrégulièrement.
//
// Pas de helper de calcul nécessaire : Recharts s'en charge. Cette
// section reste comme point d'ancrage si on veut ré-introduire un
// fit lissé plus tard.

function hooperLabel(total) {
  if (total <= 10) return "Bien récupéré";
  if (total <= 14) return "Récupération normale";
  if (total <= 17) return "Attention fatigue";
  if (total <= 20) return "Fatigue élevée";
  return "Repos recommandé";
}

function hooperColor(total, isDark) {
  if (total <= 10) return colors(isDark).success;
  if (total <= 14) return colors(isDark).accent;
  if (total <= 17) return colors(isDark).warn;
  return colors(isDark).danger;
}

// ─── Barre d'écart ───────────────────────────────────────────────────────────
// Le slider de ressenti part de la charge prévue : confirmer sans y toucher
// donne un écart de zéro, donc une barre de hauteur nulle — invisible. Sur ce
// graphe, « noté et bien estimé » doit se distinguer de « rien à afficher » :
// un écart trop petit pour se voir devient un trait posé sur la ligne du zéro.
const ZERO_MARK = 3;
function DeviationBar({ x, y, width, height, fill, value }) {
  if (value == null || x == null) return null;
  if (Math.abs(height) >= ZERO_MARK) {
    return <rect x={x} y={y} width={width} height={height} rx={3} fill={fill} />;
  }
  return <rect x={x} y={y - ZERO_MARK / 2} width={width} height={ZERO_MARK} rx={1.5} fill={fill} />;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function sessionCharge(s) { return getSessionCharge(s); } // échelle unifiée 0-10 (ressenti > planifié > legacy)

// ─── DÉCOUPAGE DE LA PÉRIODE ──────────────────────────────────────────────────
// Une seule façon de découper le temps, partagée par toutes les séries de la
// page — charge, écart, poids, Hooper, nutrition. Les trois périodes reprennent
// celles du calendrier : la semaine se lit en jours, le mois en semaines,
// l'année en mois.
function getBuckets(range, refDate) {
  const ref = refDate || new Date();
  const todayStr = localDateStr(new Date());

  if (range === "mois") {
    // Les semaines qui touchent le mois affiché, bornées au mois.
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const out = [];
    let monday = getMondayOf(first);
    while (monday <= last) {
      const sunday = addDays(monday, 6);
      out.push({
        label: `${monday.getDate()}/${monday.getMonth() + 1}`,
        start: localDateStr(monday),
        end: localDateStr(sunday),
      });
      monday = addDays(monday, 7);
    }
    return out;
  }

  if (range === "an") {
    return Array.from({ length: 12 }, (_, m) => {
      const first = new Date(ref.getFullYear(), m, 1);
      const last = new Date(ref.getFullYear(), m + 1, 0);
      return {
        label: first.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
        start: localDateStr(first),
        end: localDateStr(last),
      };
    });
  }

  // "sem" : les sept jours de la semaine affichée.
  const monday = getMondayOf(ref);
  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = localDateStr(addDays(monday, i));
    return { label: dayNames[i], start: d, end: d, isToday: d === todayStr };
  });
}

// Toutes les séances (planning + échéances) d'un intervalle de dates.
function sessionsBetween(data, start, end) {
  const out = [];
  Object.entries(data.weeks || {}).forEach(([key, days]) => {
    (days || []).forEach((dayArr, i) => {
      const dateStr = localDateStr(addDays(new Date(key + "T12:00:00"), i));
      if (dateStr < start || dateStr > end) return;
      (dayArr || []).filter(Boolean).forEach(sx => out.push(sx));
    });
  });
  (data.quickSessions || []).forEach(e => {
    if (e.startDate && e.startDate >= start && e.startDate <= end) out.push(e);
  });
  return out;
}

const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const round1 = (n) => n == null ? null : Math.round(n * 10) / 10;

// Charge et écart de charge, période par période.
//
// L'écart, c'est la différence entre le ressenti de l'athlète et ce qui était
// prévu : `feedback.rpe − chargePlanned`. Positif, la séance a été plus dure
// que prévu (charge sous-estimée) ; négatif, plus facile (surestimée).
function getChartData(data, range, refDate) {
  return getBuckets(range, refDate).map(b => {
    const sessions = sessionsBetween(data, b.start, b.end);
    const done = sessions.filter(sx => sx.feedback?.done === true);
    const deviations = done
      .filter(sx => sx.feedback?.rpe != null && (sx.chargePlanned ?? sx.charge) != null)
      .map(sx => sx.feedback.rpe - normalizeCharge10(sx.chargePlanned ?? sx.charge));
    // Qualité ressentie : les étoiles du retour (1-5). Une séance faite mais
    // non étoilée n'entre pas dans la moyenne — elle n'a rien dit là-dessus.
    const qualities = done.filter(sx => sx.feedback?.quality != null).map(sx => sx.feedback.quality);
    return {
      ...b,
      charge: sessions.reduce((sum, sx) => sum + sessionCharge(sx), 0),
      deviation: round1(avg(deviations)),
      quality: round1(avg(qualities)),
      starred: qualities.length,
      rated: deviations.length,
      planned: sessions.length,
      done: done.length,
    };
  });
}

export function Dashboard(props) {
  if (props.isLoading) return <DashboardSkeleton />;
  return <DashboardBody {...props} />;
}

function DashboardBody({ data: rawData, onUpdateSleep, sports, onEditSports }) {
  // Un seul point de filtrage : on retire les séances écartées de `weeks`, et
  // tout ce qui en dérive suit — charge, écart, qualité, heatmap. Le poids, le
  // bien-être et le sommeil voyagent dans le même objet et restent entiers.
  const data = useMemo(() => filterDataBySports(rawData, sports), [rawData, sports]);
  const { styles, isDark } = useThemeCtx();
  const [range, setRange] = useState("sem"); // "sem" | "mois" | "an"
  const [statsRefDate, setStatsRefDate] = useState(() => new Date());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const step = (dir) => {
    if (range === "sem") setStatsRefDate(d => addDays(d, 7 * dir));
    else if (range === "mois") setStatsRefDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else setStatsRefDate(d => new Date(d.getFullYear() + dir, 0, 1));
  };

  // Sommes-nous sur la période en cours ?
  const isCurrentPeriod = (() => {
    const ref = new Date(statsRefDate); ref.setHours(0, 0, 0, 0);
    if (range === "sem") return getMondayOf(ref).getTime() === getMondayOf(today).getTime();
    if (range === "mois") return ref.getFullYear() === today.getFullYear() && ref.getMonth() === today.getMonth();
    return ref.getFullYear() === today.getFullYear();
  })();

  // Libellé de la période — mêmes formes que le calendrier.
  const statsPeriodLabel = (() => {
    const ref = statsRefDate;
    if (range === "sem") {
      const monday = getMondayOf(ref);
      return `${formatDate(monday)} — ${formatDate(addDays(monday, 6))}`;
    }
    if (range === "mois") return ref.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return ref.toLocaleDateString("fr-FR", { year: "numeric" });
  })();
  const currentLabel = range === "sem" ? "Semaine en cours"
    : range === "mois" ? "Mois en cours" : "Année en cours";

  const chartData = getChartData(data, range, statsRefDate);

  const buckets = getBuckets(range, statsRefDate);

  // Poids : moyenne des mesures de chaque période, null quand rien n'a été pesé.
  const weightChartData = buckets.map(b => {
    const vals = Object.entries(data.weight || {})
      .filter(([date, v]) => v != null && date >= b.start && date <= b.end)
      .map(([, v]) => v);
    return { label: b.label, kg: round1(avg(vals)) };
  });

  // Hooper : moyenne du total sur la période (entrées partielles exclues).
  const hooperChartData = buckets.map(b => {
    const vals = (data.hooper || [])
      .filter(h => h.total != null && h.date >= b.start && h.date <= b.end)
      .map(h => h.total);
    const m = avg(vals);
    return { label: b.label, total: m == null ? null : Math.round(m) };
  });

  // Nutrition : moyenne journalière sur les jours renseignés de la période.
  const nutritionChartData = buckets.map(b => {
    const days = Object.keys(data.nutrition || {})
      .filter(dt => dt >= b.start && dt <= b.end && (data.nutrition[dt] || []).length);
    if (!days.length) return { label: b.label, cal: null, prot: null };
    const sum = (key) => days.reduce((acc, dt) =>
      acc + (data.nutrition[dt] || []).reduce((a, meal) => a + (meal[key] || 0), 0), 0);
    return {
      label: b.label,
      cal: Math.round(sum("calories") / days.length) || null,
      prot: Math.round(sum("proteins") / days.length) || null,
    };
  });

  // Charge des quatre dernières semaines, indépendante de la période affichée.
  const totalCharge4w = (() => {
    const end = localDateStr(new Date());
    const start = localDateStr(addDays(new Date(), -27));
    return sessionsBetween(data, start, end).reduce((sum, sx) => sum + sessionCharge(sx), 0);
  })();

  // Écart moyen sur la période : le cœur de la lecture « ai-je tendance à
  // sous-estimer mes séances ? ».
  //
  // Trois mesures, trois échelles (écart −5..+5, qualité 1-5, Hooper 4-28) : les
  // empiler telles quelles donnerait trois axes verticaux dont l'alignement
  // serait arbitraire — un graphe qui invente une corrélation. Les deux
  // superpositions sont donc **indexées sur une base commune** : « % du mieux
  // possible », un seul axe à droite, une seule direction (plus haut = mieux).
  // Le Hooper est retourné pour ça — 4 (frais) devient 100 %, 28 devient 0 % —
  // et s'appelle « forme » sur ce graphe. L'infobulle rend les valeurs brutes,
  // rien n'est caché derrière l'indice.
  const pct = (v, lo, hi) => v == null ? null
    : Math.max(0, Math.min(100, Math.round(((v - lo) / (hi - lo)) * 100)));
  const deviationChartData = chartData.map((d, i) => {
    const hooper = hooperChartData[i]?.total ?? null;
    return {
      ...d, hooper,
      qualityPct: pct(d.quality, 1, 5),
      formePct: hooper == null ? null : pct(28 - hooper, 0, 24),
    };
  });
  const starredCount = chartData.reduce((sum, d) => sum + (d.starred || 0), 0);
  const ratedCount = chartData.reduce((sum, d) => sum + (d.rated || 0), 0);
  const devVals = chartData.filter(d => d.deviation != null).map(d => d.deviation);
  const globalDeviation = devVals.length ? round1(avg(devVals)) : null;
  const deviationVerdict = globalDeviation == null ? "pas encore de retour"
    : Math.abs(globalDeviation) < 0.5 ? "charge bien estimée"
    : globalDeviation > 0 ? "plus dur que prévu" : "plus facile que prévu";

  const tooltipStyle = { background: styles.dashTooltipBg, border: "none", borderRadius: 6, color: styles.dashTooltipText, fontSize: 11 };

  const rangeLabel = { sem: "la semaine", mois: "le mois", an: "l'année" }[range];
  // Étiquettes lisibles : la semaine tient ses 7 jours, le mois ses 5 semaines,
  // l'année ses 12 mois — tout tient, donc on les affiche toutes.
  const tickInterval = 0;
  const devColor = (v) => v > 0 ? colors(isDark).accent : v < 0 ? colors(isDark).info : colors(isDark).textMuted;
  // Le texte de la légende porte une encre de texte, jamais la couleur de la
  // série : c'est la pastille à côté qui porte l'identité.
  const legendItem = { fontSize: 11, color: colors(isDark).textMuted, display: "flex", alignItems: "center", gap: 5 };

  return (
    <div style={styles.dashboard}>
      {/* La puce du filtre est en action principale du titre : c'est ce qui
          rend le geste (appui long sur l'onglet) trouvable, et le seul chemin
          sur ordinateur, où il n'y a pas de barre du bas. */}
      <PageTitle
        isDark={isDark}
        style={{ marginBottom: 20 }}
        right={onEditSports ? (
          <button
            type="button"
            onClick={onEditSports}
            aria-label="Choisir les sports affichés"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: sports?.length ? colors(isDark).accentBg : colors(isDark).control,
              border: `1px solid ${sports?.length ? colors(isDark).accentBorder : "transparent"}`,
              borderRadius: 999, padding: "6px 12px", cursor: "pointer",
              fontFamily: "inherit", fontSize: 11, fontWeight: 600,
              color: sports?.length ? colors(isDark).accent : colors(isDark).textCard,
            }}
          >
            {sportFilterLabel(sports)}
            <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
          </button>
        ) : undefined}
      >Stats</PageTitle>

      {/* Activity heatmap */}
      <ActivityHeatmap data={data} />

      {/* Période — même sélecteur que le calendrier */}
      <Segmented
        isDark={isDark}
        value={range}
        onChange={r => { setRange(r); setStatsRefDate(new Date()); }}
        options={[
          { value: "sem", label: "Semaine" },
          { value: "mois", label: "Mois" },
          { value: "an", label: "Année" },
        ]}
        style={{ marginBottom: 14 }}
      />

      {/* Navigation de période */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 18,
      }}>
        <RoundIconButton isDark={isDark} size={32} label="Précédent" onClick={() => step(-1)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </RoundIconButton>
        <div
          onClick={isCurrentPeriod ? undefined : () => setStatsRefDate(new Date())}
          title={isCurrentPeriod ? undefined : "Revenir à la période en cours"}
          style={{ textAlign: "center", minWidth: 0, cursor: isCurrentPeriod ? "default" : "pointer" }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: colors(isDark).text, textTransform: "capitalize" }}>
            {statsPeriodLabel}
          </div>
          {isCurrentPeriod && (
            <div style={{ fontSize: 10, fontWeight: 600, color: colors(isDark).accent, letterSpacing: "0.04em", marginTop: 1 }}>
              {currentLabel}
            </div>
          )}
        </div>
        <RoundIconButton isDark={isDark} size={32} label="Suivant" onClick={() => step(1)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </RoundIconButton>
      </div>

      <div style={{ ...styles.dashCards, gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div style={styles.dashCard}>
          <span style={styles.dashCardVal}>{totalCharge4w}</span>
          <span style={styles.dashCardLabel}>Charge 4 sem.</span>
        </div>
        <div style={styles.dashCard}>
          <span style={{
            ...styles.dashCardVal,
            color: globalDeviation == null || Math.abs(globalDeviation) < 0.5
              ? undefined : devColor(globalDeviation),
          }}>
            {globalDeviation == null ? "—" : (globalDeviation > 0 ? "+" : "") + globalDeviation}
          </span>
          <span style={styles.dashCardLabel}>Écart — {deviationVerdict}</span>
        </div>
      </div>

      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>Charge — {rangeLabel}</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
              interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
            <YAxis tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: colors(isDark).tint }} />
            <Bar dataKey="charge" name="Charge" fill={colors(isDark).accent} radius={[3, 3, 0, 0]} maxBarSize={36}>
              {range === "jour" && chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isToday ? (colors(isDark).warn) : (colors(isDark).accent)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Écart de charge, qualité et forme ───────────────────────────────
           Trois lectures d'une même période, superposées parce qu'elles ne se
           lisent bien qu'ensemble : ai-je sous-estimé mes séances, les ai-je
           trouvées bonnes, et dans quel état j'étais.

           · Les BARRES portent l'écart (ressenti − prévu) sur l'axe de gauche.
             Au-dessus de zéro la séance a été plus dure qu'annoncé, en dessous
             plus facile. Deux teintes de part et d'autre du zéro, jamais un
             dégradé : le signe est ce qui compte.
           · Les DEUX COURBES partagent l'axe de droite, indexé « % du mieux
             possible ». C'est ce qui permet de les superposer sans mentir :
             trois échelles brutes (−5..+5, 1-5, 4-28) auraient donné trois axes
             dont l'alignement serait arbitraire. Ici une seule échelle, une
             seule direction — plus haut = mieux —, si bien qu'une mauvaise
             semaine fait plonger les deux courbes ensemble.
           · Le Hooper y est donc retourné et nommé « forme » (4 → 100 %).
             L'infobulle rend les valeurs brutes : ★ 4/5, Hooper 12. */}
      <div style={styles.dashSection}>
        <div style={styles.dashSectionTitle}>Écart de charge — {rangeLabel}</div>

        {/* Légende : quatre séries, donc jamais l'identité par la couleur seule. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={legendItem}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: colors(isDark).accent }} />
            plus dur que prévu
          </span>
          <span style={legendItem}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: colors(isDark).info }} />
            plus facile
          </span>
          <span style={legendItem}>
            <span style={{ width: 12, height: 2, borderRadius: 1, background: colors(isDark).qualityLine }} />
            qualité ★
          </span>
          <span style={legendItem}>
            <span style={{ width: 12, height: 2, borderRadius: 1, background: colors(isDark).hooperLine }} />
            forme
          </span>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={deviationChartData} margin={{ top: 4, right: 2, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
              interval={tickInterval} />
            <YAxis yAxisId="dev" domain={[-5, 5]} ticks={[-5, -2.5, 0, 2.5, 5]}
              tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
            {/* Un seul axe pour les deux courbes, borné en dur : la relation
                entre elles ne se déforme pas d'une période à l'autre. */}
            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} ticks={[0, 50, 100]}
              width={30} unit="%"
              tick={{ fill: styles.dashText, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: colors(isDark).tint }}
              formatter={(v, name, item) => {
                if (v == null) return null;
                // On affiche la valeur BRUTE, pas l'indice : l'indexation sert à
                // superposer, elle n'est pas ce qu'on a saisi.
                const row = item?.payload || {};
                if (name === "formePct") {
                  return row.hooper == null ? null : [`${row.hooper} — ${hooperLabel(row.hooper)}`, "Hooper"];
                }
                if (name === "qualityPct") {
                  if (row.quality == null) return null;
                  const n = Math.round(row.quality);
                  return [`${"\u2605".repeat(n)}${"\u2606".repeat(5 - n)} ${row.quality} / 5`, "Qualité"];
                }
                return [(v > 0 ? "+" : "") + v, "Écart"];
              }}
            />
            <ReferenceLine yAxisId="dev" y={0} stroke={styles.dashText} strokeOpacity={0.5} />
            <Bar yAxisId="dev" dataKey="deviation" name="deviation" shape={<DeviationBar />} maxBarSize={30}>
              {deviationChartData.map((entry, i) => (
                <Cell key={i} fill={entry.deviation == null ? "transparent" : devColor(entry.deviation)} />
              ))}
            </Bar>
            <Line yAxisId="pct" type="monotone" dataKey="qualityPct" name="qualityPct"
              stroke={colors(isDark).qualityLine} strokeWidth={2}
              dot={{ r: 3, fill: colors(isDark).qualityLine }} activeDot={{ r: 5 }}
              connectNulls />
            <Line yAxisId="pct" type="monotone" dataKey="formePct" name="formePct"
              stroke={colors(isDark).hooperLine} strokeWidth={2}
              dot={{ r: 3, fill: colors(isDark).hooperLine }} activeDot={{ r: 5 }}
              connectNulls />
          </ComposedChart>
        </ResponsiveContainer>

        <div style={{ fontSize: 11, color: colors(isDark).textDim, marginTop: 8, lineHeight: 1.5 }}>
          {ratedCount === 0 && starredCount === 0
            ? "Aucune séance notée sur la période — l'écart et la qualité viennent du retour de séance."
            : [
                ratedCount ? `${ratedCount} séance${ratedCount > 1 ? "s" : ""} notée${ratedCount > 1 ? "s" : ""}` : null,
                starredCount ? `${starredCount} étoilée${starredCount > 1 ? "s" : ""}` : null,
              ].filter(Boolean).join(" · ") + "."}
          {" "}Les deux courbes partagent l'axe de droite, en % du mieux possible :
          qualité 5 ★ et Hooper 4 valent 100 %. Plus haut, mieux c'est.
        </div>
      </div>

      {weightChartData.some(d => d.kg != null) && (
        <div style={styles.dashSection}>
          <div style={styles.dashSectionTitle}>Poids — {rangeLabel}</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weightChartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
                interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => v != null ? [`${v} kg`, "Poids"] : null} />
              {/* Spline cubique monotone : passe exactement par chaque
                  mesure, enjambe les jours sans valeur. */}
              <Line type="monotone" dataKey="kg" name="Poids"
                stroke={colors(isDark).info} strokeWidth={2}
                dot={{ r: 3, fill: colors(isDark).info }} activeDot={{ r: 5 }}
                connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {hooperChartData.some(d => d.total != null) && (
        <div style={styles.dashSection}>
          <div style={styles.dashSectionTitle}>Indice Hooper — {rangeLabel}</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hooperChartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
                interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
              <YAxis domain={[0, 28]} ticks={[0, 7, 14, 17, 20, 28]} tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => v != null ? [`${v} — ${hooperLabel(v)}`, "Hooper"] : null} cursor={{ fill: colors(isDark).tint }} />
              <ReferenceLine y={14} stroke={colors(isDark).accentBorder} strokeDasharray="4 4" />
              <ReferenceLine y={17} stroke={colors(isDark).warnBorder} strokeDasharray="4 4" />
              <ReferenceLine y={20} stroke={colors(isDark).dangerBorder} strokeDasharray="4 4" />
              <Bar dataKey="total" name="Hooper" radius={[3, 3, 0, 0]} maxBarSize={36}>
                {hooperChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.total != null ? hooperColor(entry.total, isDark) : "transparent"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {nutritionChartData.some(d => d.cal != null || d.prot != null) && (
        <div style={styles.dashSection}>
          <div style={styles.dashSectionTitle}>Nutrition — {rangeLabel}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: colors(isDark).warn, fontWeight: 700 }}>■ Calories (kcal)</span>
            <span style={{ fontSize: 10, color: colors(isDark).success, fontWeight: 700 }}>■ Protéines (g)</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={nutritionChartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke={styles.dashGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false}
                interval={range === "an" || range === "jour" ? 0 : "preserveStartEnd"} />
              <YAxis yAxisId="cal" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="prot" orientation="right" tick={{ fill: styles.dashText, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: colors(isDark).tint }}
                formatter={(v, name) => v != null ? [name === "cal" ? `${v} kcal` : `${v} g`, name === "cal" ? "Calories" : "Protéines"] : null} />
              <Bar yAxisId="cal" dataKey="cal" name="cal" fill={colors(isDark).warn} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar yAxisId="prot" dataKey="prot" name="prot" fill={colors(isDark).success} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <SleepSection sleepData={data.sleep || []} onImport={onUpdateSleep} range={range} />
    </div>
  );
}
