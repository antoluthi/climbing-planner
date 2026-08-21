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
