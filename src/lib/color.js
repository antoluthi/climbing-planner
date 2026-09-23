// ─── UNE COULEUR, TROIS RÉGLAGES QU'ON COMPREND ──────────────────────────────
// Le sélecteur natif d'un navigateur rend du `#rrggbb`. C'est exact, et c'est
// inutilisable pour ce qu'on veut vraiment faire d'une couleur de microcycle :
// **l'éclaircir un peu** pour la distinguer de sa voisine sans quitter la
// famille du bloc. En RGB, éclaircir demande de bouger trois nombres à la fois
// dans la bonne proportion ; en HSL c'est un seul curseur.
//
// D'où ces deux conversions. Elles sont pures et testées (`npm run test:color`)
// parce qu'un arrondi qui dérive se voit tout de suite : régler puis relire une
// couleur sans y toucher doit rendre exactement la même.
//
// ⚠ Ce fichier **ne définit aucune couleur** — il les transforme. La règle
// « une seule source de couleurs » (`theme/palette.js`) reste entière.

export function normalizeHex(input, fallback = "#888888") {
  let s = String(input ?? "").trim();
  if (s[0] === "#") s = s.slice(1);
  // La forme courte est légale en CSS et arrive d'un copier-coller.
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split("").map(ch => ch + ch).join("");
  return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toLowerCase() : fallback;
}

export function hexToHsl(hex) {
  const s = normalizeHex(hex).slice(1);
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(sat * 100), l: Math.round(l * 100) };
}

export function hslToHex(h, s, l) {
  const H = ((Number(h) % 360) + 360) % 360 / 360;
  const S = Math.min(100, Math.max(0, Number(s))) / 100;
  const L = Math.min(100, Math.max(0, Number(l))) / 100;
  if (S === 0) {
    const v = Math.round(L * 255).toString(16).padStart(2, "0");
    return `#${v}${v}${v}`;
  }
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return "#" + [channel(H + 1 / 3), channel(H), channel(H - 1 / 3)]
    .map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}

// Éclaircir ou assombrir sans toucher à la teinte : c'est le seul geste qu'on
// fait vraiment sur la couleur héritée d'un bloc.
export function withLightness(hex, l) {
  const { h, s } = hexToHsl(hex);
  return hslToHex(h, s, l);
}
