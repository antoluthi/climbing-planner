// ─── TEMPS · DISTANCE · ALLURE ────────────────────────────────────────────────
// Les trois données d'une sortie sont liées : en renseigner deux détermine la
// troisième. C'est ici qu'on tient cette arithmétique, pour la course (allure
// en min/km) comme pour le vélo (vitesse en km/h).
//
//   allure  = durée / distance          (min/km)
//   vitesse = distance / (durée / 60)   (km/h)
//
// Les durées circulent en **minutes fractionnaires** : le reste de l'app garde
// des minutes entières (`estimatedTime`), mais 5:30/km sur 8,4 km ne tombe pas
// juste à la minute et arrondir en cours de route ferait dériver l'allure.

// ── Analyse ──────────────────────────────────────────────────────────────────

// "42:30" → 42,5 · "1:05:00" → 65 · "42" → 42 · "42,5" → 42,5
export function parseDuration(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(",", ".");
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length === 1) {
    const n = parseFloat(parts[0]);
    return isFinite(n) && n >= 0 ? n : null;
  }
  if (parts.length > 3) return null;
  const nums = parts.map(p => (p === "" ? NaN : Number(p)));
  if (nums.some(n => !isFinite(n) || n < 0)) return null;
  // Les segments après le premier sont des minutes / secondes : < 60.
  if (nums.slice(1).some(n => n >= 60)) return null;
  return parts.length === 2
    ? nums[0] + nums[1] / 60
    : nums[0] * 60 + nums[1] + nums[2] / 60;
}

// "5:30" → 5,5. Refuse 6:70 : une allure n'a pas 70 secondes.
export function parsePace(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(",", ".");
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length === 1) {
    const n = parseFloat(parts[0]);
    return isFinite(n) && n > 0 ? n : null;
  }
  if (parts.length !== 2) return null;
  const m = Number(parts[0]);
  const sec = parts[1] === "" ? NaN : Number(parts[1]);
  if (!isFinite(m) || !isFinite(sec) || m < 0 || sec < 0 || sec >= 60) return null;
  const total = m + sec / 60;
  return total > 0 ? total : null;
}

export function parseNumber(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(",", ".");
  if (!s) return null;
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? n : null;
}

// ── Mise en forme ────────────────────────────────────────────────────────────

// 42,5 → "42:30". Les durées s'affichent toujours en minutes:secondes.
export function formatDuration(min) {
  if (min == null || !isFinite(min) || min < 0) return "";
  const total = Math.round(min * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// 5,5 → "5:30"
export function formatPace(min) {
  if (min == null || !isFinite(min) || min <= 0) return "";
  const total = Math.round(min * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatNumber(n, decimals = 2) {
  if (n == null || !isFinite(n)) return "";
  return String(Math.round(n * 10 ** decimals) / 10 ** decimals);
}

// Nettoie la frappe d'un champ minutes:secondes — chiffres, un seul deux-points,
// deux chiffres de secondes au plus, et jamais plus de 59 secondes : taper
// « 6:7 » reste possible (7 peut devenir 70), « 6:70 » devient « 6:59 ».
export function sanitizeClockInput(raw) {
  let s = String(raw ?? "").replace(/[^\d:]/g, "");
  const firstColon = s.indexOf(":");
  if (firstColon !== -1) {
    s = s.slice(0, firstColon + 1) + s.slice(firstColon + 1).replace(/:/g, "");
  }
  const [m, sec] = s.split(":");
  if (sec == null) return s;
  let secs = sec.slice(0, 2);
  if (secs.length === 2 && Number(secs) > 59) secs = "59";
  return `${m}:${secs}`;
}

// ── Le trio lié ──────────────────────────────────────────────────────────────
// `touched` liste les champs saisis, du plus récent au plus ancien. On calcule
// celui qui n'est pas dans les deux plus récents : l'utilisateur vient de
// donner deux valeurs, la troisième en découle.

export const TRIPLE_FIELDS = ["duration", "distance", "rate"];

// kind : "pace" (min/km, course) | "speed" (km/h, vélo)
export function computeThird({ duration, distance, rate }, touched, kind = "pace") {
  const recent = touched.filter(f => TRIPLE_FIELDS.includes(f)).slice(0, 2);
  if (recent.length < 2) return null;
  const target = TRIPLE_FIELDS.find(f => !recent.includes(f));
  if (!target) return null;

  const d = duration, km = distance, r = rate;
  const ok = (x) => x != null && isFinite(x) && x > 0;

  if (kind === "pace") {
    if (target === "rate"     && ok(d) && ok(km)) return { field: "rate",     value: d / km };
    if (target === "duration" && ok(r) && ok(km)) return { field: "duration", value: r * km };
    if (target === "distance" && ok(d) && ok(r))  return { field: "distance", value: d / r };
  } else {
    if (target === "rate"     && ok(d) && ok(km)) return { field: "rate",     value: (km / d) * 60 };
    if (target === "duration" && ok(r) && ok(km)) return { field: "duration", value: (km / r) * 60 };
    if (target === "distance" && ok(d) && ok(r))  return { field: "distance", value: (r * d) / 60 };
  }
  return null;
}

// ── Champs à séparateurs fixes ───────────────────────────────────────────────
// Le « : » d'un temps et le « . » d'une distance ne se tapent pas et ne
// s'effacent pas : le champ est découpé en cases, et le séparateur est dessiné
// entre elles (`ui/SegmentField.jsx`). Un « : » effaçable transformait
// « 50:00 » en « 5000 » — cinq mille minutes, et une allure de 555:33/km.
//
// Une valeur reste une chaîne, mais ses séparateurs y sont **toujours** :
// "1:45:30", ":45:00", "8.50", ".". Une case vide vaut zéro ; un champ dont
// toutes les cases sont vides ne vaut rien (null).
//
// `pad` dit comment compléter une case à la sortie du champ : « 7 » secondes
// devient « 07 » (au début), mais « 5 » centièmes devient « 50 » (à la fin) —
// ,5 km, c'est 500 m, pas 50.

export const FIELD_SPECS = {
  duration: { sep: ":", segs: [
    { max: 2, ph: "0",  label: "heures", blankZero: true },
    { max: 2, ph: "00", label: "minutes",  cap: 59, pad: "start" },
    { max: 2, ph: "00", label: "secondes", cap: 59, pad: "start" },
  ] },
  pace: { sep: ":", segs: [
    { max: 2, ph: "0",  label: "minutes" },
    { max: 2, ph: "00", label: "secondes", cap: 59, pad: "start" },
  ] },
  distance: { sep: ".", segs: [
    { max: 3, ph: "0",  label: "kilomètres" },
    { max: 2, ph: "00", label: "centièmes", pad: "end" },
  ] },
  speed: { sep: ".", segs: [
    { max: 2, ph: "0", label: "kilomètres par heure" },
    { max: 1, ph: "0", label: "dixièmes", pad: "end" },
  ] },
};

// "1:45:30" → ["1", "45", "30"] · "" → ["", "", ""] · "8.5" → ["8", "5"]
export function splitField(spec, str) {
  const parts = String(str ?? "").split(spec.sep);
  return spec.segs.map((_, i) => (parts[i] ?? "").replace(/\D/g, ""));
}

export function joinField(spec, segs) {
  return spec.segs.map((_, i) => segs[i] ?? "").join(spec.sep);
}

export function isFieldEmpty(spec, str) {
  return splitField(spec, str).every(s => s === "");
}

// Minutes pour un temps ou une allure (fractionnaires), nombre pour le reste.
export function parseField(spec, str) {
  const segs = splitField(spec, str);
  if (segs.every(s => s === "")) return null;
  if (spec.sep === ":") {
    const seconds = segs.reduce((acc, s) => acc * 60 + (s === "" ? 0 : Number(s)), 0);
    return seconds / 60;
  }
  return Number(`${segs[0] || "0"}.${segs[1] || "0"}`);
}

export function formatField(spec, value) {
  if (value == null || !isFinite(value) || value < 0) return "";
  if (spec.sep === ":") {
    let rest = Math.round(value * 60);
    const out = [];
    for (let i = spec.segs.length - 1; i > 0; i--) {
      out.unshift(String(rest % 60).padStart(2, "0"));
      rest = Math.floor(rest / 60);
    }
    out.unshift(rest === 0 && spec.segs[0].blankZero ? "" : String(rest));
    return out.join(spec.sep);
  }
  const decimals = spec.segs[1].max;
  return value.toFixed(decimals).replace(".", spec.sep);
}

// Une case : des chiffres, et jamais plus que son plafond — « 70 » secondes
// devient « 59 », comme `sanitizeClockInput`.
export function sanitizeSegment(seg, raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (seg.cap != null && d !== "" && Number(d) > seg.cap) return String(seg.cap);
  return d;
}

// À la sortie du champ : chaque case complétée à sa longueur, sauf la
// première (des heures vides restent vides, le « 0 » grisé les dit). Un champ
// vide reste vide — le compléter inventerait une valeur.
export function normalizeField(spec, str) {
  const segs = splitField(spec, str);
  if (segs.every(s => s === "")) return str;
  const out = segs.map((s, i) => {
    const seg = spec.segs[i];
    if (!seg.pad) return s;
    return seg.pad === "end" ? s.padEnd(seg.max, "0") : s.padStart(seg.max, "0");
  });
  return joinField(spec, out);
}

// ── Frappe dans une case ─────────────────────────────────────────────────────
// Toute la décision est ici, pure : le composant ne fait que la traduire en
// DOM. `raw` est la nouvelle valeur brute de la case `i` telle que le
// navigateur la rend, `caret` la position du curseur après la frappe.
// Rend les nouvelles cases et, s'il faut en changer, où poser le curseur :
// `{ i, where: "all" | "start" | "end" }`.
//
// - Tout ce qui n'est pas un chiffre fait passer à la case suivante : « : »,
//   « . », « , », espace. C'est aussi ce qui répartit un « 5:30 » collé.
//   Sur Android, ce caractère n'arrive **que** par ici : Gboard rapporte
//   `key: "Unidentified"` au clavier, jamais « : » ou « . ».
// - Une case pleine qui reçoit un chiffre **repart de ce chiffre** : taper « 5 »
//   dans « 45 » veut dire « 5 », pas « 455 » refusé sans un mot.
// - Une case remplie jusqu'au bout, en tapant à sa fin, passe à la suivante.
export function applySegmentInput(spec, segs, i, raw, caret) {
  const n = spec.segs.length;
  const seg = spec.segs[i];
  const prev = segs[i] ?? "";
  const next = segs.slice();
  const at = caret ?? raw.length;

  if (/\D/.test(raw)) {
    const parts = raw.split(/\D+/);
    next[i] = sanitizeSegment(seg, parts[0]).slice(0, seg.max);
    if (i === n - 1) return { segs: next, focus: null };
    for (let k = 1; k < parts.length && i + k < n; k++) {
      if (parts[k] !== "") next[i + k] = sanitizeSegment(spec.segs[i + k], parts[k]).slice(0, spec.segs[i + k].max);
    }
    const last = Math.min(i + parts.length - 1, n - 1);
    const typedSep = parts[parts.length - 1] === "";
    return { segs: next, focus: { i: last, where: typedSep ? "all" : "end" } };
  }

  const inserted = raw.length - prev.length;
  let digits = raw;
  if (raw.length > seg.max) {
    const from = Math.max(0, at - Math.max(inserted, 1));
    digits = raw.slice(from, at).slice(-seg.max);
  }
  next[i] = sanitizeSegment(seg, digits);

  // Pas besoin de distinguer frappe et effacement : effacer ne remplit jamais
  // une case. Une sélection remplacée (« 45 » sélectionné, on tape « 30 »)
  // compte donc comme une frappe, ce qu'elle est.
  const full = next[i].length === seg.max;
  const advance = full && at === raw.length && raw.length <= seg.max && i < n - 1;
  return { segs: next, focus: advance ? { i: i + 1, where: "all" } : null };
}

// Les touches qui franchissent un séparateur. Rend `null` quand la touche
// garde son rôle ordinaire dans la case.
// - Retour arrière au début d'une case efface le dernier chiffre de la
//   précédente : le séparateur est **sauté**, jamais effacé.
// - Suppr à la fin efface le premier chiffre de la suivante.
// - Les flèches passent d'une case à l'autre aux bords.
export function applySegmentKey(spec, segs, i, key, selStart, selEnd) {
  const n = spec.segs.length;
  const len = (segs[i] ?? "").length;
  const collapsed = selStart === selEnd;

  if (key === "Backspace" && collapsed && selStart === 0 && i > 0) {
    const next = segs.slice();
    next[i - 1] = (next[i - 1] ?? "").slice(0, -1);
    return { segs: next, focus: { i: i - 1, where: "end" } };
  }
  if (key === "Delete" && collapsed && selEnd === len && i < n - 1) {
    const next = segs.slice();
    next[i + 1] = (next[i + 1] ?? "").slice(1);
    return { segs: next, focus: { i: i + 1, where: "start" } };
  }
  if (key === "ArrowLeft" && collapsed && selStart === 0 && i > 0) {
    return { segs, focus: { i: i - 1, where: "end" } };
  }
  if (key === "ArrowRight" && collapsed && selEnd === len && i < n - 1) {
    return { segs, focus: { i: i + 1, where: "start" } };
  }
  // Un séparateur tapé au clavier physique : on passe à la case suivante, et
  // rien n'est écrit. Dans la dernière case, il n'y a nulle part où aller.
  if (typeof key === "string" && key.length === 1 && /[:.,;\s/hH'-]/.test(key)) {
    return { segs, focus: i < n - 1 ? { i: i + 1, where: "all" } : null };
  }
  return null;
}

// ── L'état du trio ───────────────────────────────────────────────────────────
// `{ values, sources, computed }` : les trois valeurs (chaînes à séparateurs
// fixes), les **sources** — les deux champs tapés le plus récemment, le plus
// récent d'abord — et le champ calculé, le troisième.
//
// Règle choisie : « les deux derniers saisis font foi ». Taper dans le champ
// calculé en fait une source ; c'est alors la plus ancienne des deux autres
// qui devient calculée. La règle est invisible par nature, d'où la marque
// « calculé » que l'écran pose sur le champ qui va bouger.

export function trioSpecs(kind) {
  return {
    duration: FIELD_SPECS.duration,
    distance: FIELD_SPECS.distance,
    rate: kind === "speed" ? FIELD_SPECS.speed : FIELD_SPECS.pace,
  };
}

function computeInto(values, sources, target, kind) {
  const specs = trioSpecs(kind);
  const parsed = Object.fromEntries(TRIPLE_FIELDS.map(f => [f, parseField(specs[f], values[f])]));
  const res = computeThird(parsed, sources, kind);
  return res ? formatField(specs[target], res.value) : "";
}

// Un formulaire qui s'ouvre déjà rempli — séance modifiée, retour de « quand &
// où », modèle chargé — n'a pas d'ordre de saisie. Sans en supposer un,
// modifier un champ ne recalculait rien : 45:00 · 9 km · 5:00 passé à 54:00
// gardait son allure de 5:00. C'était le bug.
//
// On tient l'allure (ou la vitesse) pour la calculée, et la distance pour la
// source la plus récente : retoucher l'allure fera bouger le temps, pas la
// distance — on change rarement la longueur d'une sortie en changeant son
// rythme. Deux champs remplis sur trois : le troisième est calculé d'emblée,
// un trio affiché doit toujours tenir debout.
export function seedTrio(values, kind) {
  const specs = trioSpecs(kind);
  const filled = TRIPLE_FIELDS.filter(f => !isFieldEmpty(specs[f], values[f]));
  const sources = ["distance", "duration", "rate"].filter(f => filled.includes(f)).slice(0, 2);
  if (filled.length === 3) return { values, sources, computed: "rate" };
  if (sources.length < 2) return { values, sources, computed: null };
  const target = TRIPLE_FIELDS.find(f => !sources.includes(f));
  const out = { ...values, [target]: computeInto(values, sources, target, kind) };
  return { values: out, sources, computed: target };
}

// Une frappe dans `field`. Le troisième champ est recalculé **à chaque
// frappe** ; s'il ne peut plus l'être, il est vidé plutôt que laissé afficher
// une valeur qui ne correspond plus à rien.
export function updateTrio(state, field, next, kind) {
  const specs = trioSpecs(kind);
  const values = { ...state.values, [field]: next };
  const filled = f => !isFieldEmpty(specs[f], values[f]);
  const sources = [field, ...state.sources.filter(f => f !== field)].filter(filled).slice(0, 2);

  if (sources.length < 2) {
    // Plus assez de sources : ce qui en était calculé ne vaut plus rien.
    if (state.computed && state.computed !== field) values[state.computed] = "";
    return { values, sources, computed: null };
  }
  const target = TRIPLE_FIELDS.find(f => !sources.includes(f));
  // On n'écrit jamais dans le champ sous les doigts : vider le champ calculé
  // pour le retaper ne doit pas le voir se remplir aussitôt.
  if (target === field) return { values, sources, computed: target };
  values[target] = computeInto(values, sources, target, kind);
  return { values, sources, computed: target };
}

// ── Le temps, sous ses deux formes ───────────────────────────────────────────
// Une sortie se saisit en h:mm:ss (trois cases), une séance d'escalade en
// minutes simples (« 90 »). Changer de discipline en cours de saisie convertit
// d'une forme à l'autre : lire « 90 » comme des heures donnerait 90 h.
export function readDuration(str, linked) {
  return linked ? parseField(FIELD_SPECS.duration, str) : parseDuration(str);
}

export function writeDuration(min, linked) {
  if (min == null || !isFinite(min) || min <= 0) return "";
  if (linked) return formatField(FIELD_SPECS.duration, min);
  const sec = Math.round(min * 60);
  return sec % 60 ? formatDuration(min) : String(sec / 60);
}

// Changer de discipline en cours de saisie. `from` / `to` : "pace", "speed"
// ou null (pas de trio). Le temps change de forme (« 90 » ↔ « 1:30:00 »),
// l'allure devient une vitesse (5:00/km = 12 km/h).
//
// ⚠️ L'allure garde la forme de la **dernière discipline à trio**, même
// pendant un passage par l'escalade (`rateKind`) : sans ça, Course → Escalade
// → Vélo lisait « 5:00 » comme une vitesse, soit 500 km/h.
export function convertTrio(state, from, to) {
  if (from === to) return state;
  const values = { ...state.values, duration: writeDuration(readDuration(state.values.duration, !!from), !!to) };
  const rateKind = from || state.rateKind || null;
  if (!to) return { ...state, values, rateKind };
  if (rateKind && rateKind !== to) {
    const r = parseField(trioSpecs(rateKind).rate, values.rate);
    values.rate = r ? formatField(trioSpecs(to).rate, 60 / r) : "";
  }
  return from ? { ...state, values } : seedTrio(values, to);
}
