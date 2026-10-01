// ─── GRILLE HORAIRE DE LA SEMAINE ────────────────────────────────────────────
// Tout ce que la grille décide sans toucher au DOM : où commence et finit un
// bloc, comment se partagent la largeur deux séances qui se chevauchent, dans
// quelle rangée se pose une échéance de plusieurs jours, à quelle heure
// correspond une touche dans une case vide. Pur — `npm run test:grid`.

export const DAY_MIN = 24 * 60;

// Séance sans durée : 1 h 30. Une seule valeur, lue aussi par la cloche
// (lib/todo.js) et les notifications (lib/notifications.js) : la grille dessine
// une séance jusqu'à l'heure exacte où l'on en réclamera le ressenti.
export const DEFAULT_SESSION_MIN = 90;

// Plancher d'un bloc : en dessous, il ne porte même plus une ligne de texte.
// Il sert aussi au calcul des chevauchements — deux séances de 10 min collées
// l'une à l'autre se recouvriraient sinon à l'écran sans être mises côte à côte.
export const MIN_BLOCK_MIN = 30;

// « 18:30 » → 1110. Accepte aussi « 7:05 », « 18h30 », « 18h », « 18:30:00 ».
// Rend null pour une valeur absente ou hors de la journée : une séance sans
// heure n'a pas sa place dans la grille, elle va dans la rangée du haut.
export function parseClock(value) {
  const m = /^\s*(\d{1,2})(?:\s*[:hH.]\s*(\d{2})?)?/.exec(String(value ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] == null ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 870 → « 14:30 », la forme qu'attend le champ heure (`<input type="time">`).
export function clockLabel(minutes) {
  const m = Math.max(0, Math.min(DAY_MIN - 1, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Début et fin d'une séance, en minutes depuis minuit. La fin s'arrête à
// minuit : une sortie de 23 h à 1 h se dessine coupée plutôt que de déborder
// sur une journée qui n'est pas la sienne.
export function sessionSpan(session) {
  const start = parseClock(session?.startTime);
  if (start == null) return null;
  const dur = Number(session?.estimatedTime);
  const len = Number.isFinite(dur) && dur > 0 ? dur : DEFAULT_SESSION_MIN;
  return { start, end: Math.min(DAY_MIN, start + len) };
}

// ── Séances qui se chevauchent ───────────────────────────────────────────────
// Les séances d'une journée se rangent en grappes (tout ce qui se recouvre de
// proche en proche) ; dans une grappe, chacune prend la première colonne libre
// — une colonne libérée par une séance finie se réutilise. Rend, dans l'ordre
// d'entrée, `{ col, cols }` : rang de la séance et nombre de colonnes de sa
// grappe.
//
// La grille ne s'en sert pas pour partager la largeur : sur un téléphone, une
// journée fait ~45 px, et trois séances côte à côte n'en auraient que 15 —
// leurs noms s'écrivaient lettre par lettre. Elle les pose **en cascade**,
// chaque rang décalé vers la droite et par-dessus le précédent (voir
// `cascadeOffset`).
export function layoutDay(spans) {
  const items = spans.map((s, i) => ({
    i, start: s.start, end: Math.max(s.end, s.start + MIN_BLOCK_MIN),
  }));
  const order = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.i - b.i);
  const out = new Array(spans.length);

  let cluster = [];
  let colsEnd = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const it of cluster) out[it.i] = { col: it.col, cols: colsEnd.length };
    cluster = []; colsEnd = []; clusterEnd = -Infinity;
  };

  for (const it of order) {
    if (cluster.length && it.start >= clusterEnd) flush();
    let col = colsEnd.findIndex(end => end <= it.start);
    if (col < 0) { col = colsEnd.length; colsEnd.push(it.end); }
    else colsEnd[col] = it.end;
    it.col = col;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

// Décalage d'un bloc en cascade, en fraction de la largeur du jour : la moitié
// de la largeur se répartit entre les rangs. Le dernier rang garde donc au
// moins la moitié de la colonne, quel que soit le nombre de séances empilées,
// et chacune laisse voir sous la suivante son début et son liseré.
export function cascadeOffset(col, cols) {
  return cols > 1 ? (col / cols) * 0.5 : 0;
}

// ── Rangée « toute la journée » ──────────────────────────────────────────────
// Colonnes (0 = lundi) qu'une plage de dates occupe dans la semaine qui commence
// à `mondayISO`, ou null si elle tombe en dehors. `before` / `after` disent que
// la plage continue au-delà de la semaine : le bandeau perd alors son arrondi
// de ce côté-là, comme un ruban coupé par le bord.
export function weekColumns(startISO, endISO, mondayISO) {
  const at = (iso) => Date.parse(`${iso}T12:00:00Z`);
  const day = (iso) => Math.round((at(iso) - at(mondayISO)) / 86400000);
  const a = day(startISO);
  const b = day(endISO && endISO > startISO ? endISO : startISO);
  if (Number.isNaN(a) || Number.isNaN(b) || b < 0 || a > 6) return null;
  return { from: Math.max(0, a), to: Math.min(6, b), before: a < 0, after: b > 6 };
}

// Rangées de la ligne du haut : chaque élément `{ from, to }` (colonnes
// incluses) prend la première rangée où toutes ses colonnes sont libres. Le
// plus tôt d'abord, le plus long d'abord à égalité — un bandeau de trois jours
// se pose avant les séances isolées qu'il enjambe.
export function layoutAllDay(items, columns = 7) {
  const order = items
    .map((it, i) => ({ i, from: it.from, to: it.to }))
    .sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from) || a.i - b.i);
  const used = [];
  const lane = new Array(items.length);
  for (const it of order) {
    let l = 0;
    while (used[l] && used[l].slice(it.from, it.to + 1).some(Boolean)) l++;
    if (!used[l]) used[l] = new Array(columns).fill(false);
    for (let c = it.from; c <= it.to; c++) used[l][c] = true;
    lane[it.i] = l;
  }
  return { lanes: used.length, lane };
}

// Ce qui ne tient pas quand la rangée est repliée sur `keep` rangées : par
// colonne, le nombre d'éléments cachés. C'est le « +n » de chaque jour.
export function hiddenPerColumn(items, lane, keep, columns = 7) {
  const count = new Array(columns).fill(0);
  items.forEach((it, i) => {
    if (lane[i] < keep) return;
    for (let c = it.from; c <= it.to; c++) count[c]++;
  });
  return count;
}

// ── Toucher une case vide ────────────────────────────────────────────────────
// La touche tombe sur la demi-heure qui la contient : 14:40 → 14:30. Une
// touche sous la dernière ligne (la marge du bas) reste dans la journée.
export function slotAt(minutes, step = 30) {
  const floored = Math.floor(minutes / step) * step;
  return Math.max(0, Math.min(DAY_MIN - step, floored));
}

// Heure à laquelle la grille s'ouvre : 7 h, ou plus tôt si une séance de la
// semaine commence avant. Au-delà de 7 h, rien ne justifie de cacher le matin.
export function firstVisibleHour(spans, fallback = 7) {
  const starts = spans.filter(Boolean).map(s => s.start);
  if (starts.length === 0) return fallback;
  return Math.min(fallback, Math.floor(Math.min(...starts) / 60));
}
