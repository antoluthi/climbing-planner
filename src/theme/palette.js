// ─── PALETTE ──────────────────────────────────────────────────────────────────
// LE fichier à éditer pour changer l'apparence de l'app. Rien d'autre ne définit
// de couleur : `makeStyles.js` et les composants lisent tous d'ici.
//
// Principe : un chrome strictement neutre (noir & blanc), un accent chaud unique
// pour l'interactif, et des couleurs désaturées réservées aux données qui en
// portent le sens (charge, Hooper, cycles).
//
// Pour retoucher : change les valeurs ci-dessous, rien d'autre. Les deux objets
// `light` et `dark` ont exactement les mêmes clés.

// ── Neutres ──────────────────────────────────────────────────────────────────
// Le sombre reprend les valeurs exactes du prototype « Ascent » : noir pur,
// cartes #121212, filets blancs à 8 %. Le clair en est la transposition — le
// prototype ne le décrit pas.
const light = {
  // Fonds
  bg:            "#ffffff",
  bgAlt:         "#f7f7f8",
  surface:       "#f7f7f8",
  surface2:      "#f0f0f1",
  card:          "#f7f7f8",
  cardAlt:       "#ffffff",
  modalBg:       "#ffffff",
  inputBg:       "#f0f0f1",
  overlayBg:     "rgba(0,0,0,0.35)",
  headerGrad:    "linear-gradient(180deg, #ffffff 0%, #ffffff 100%)",
  tint:          "rgba(0,0,0,0.03)",
  bgScrim:       "rgba(255,255,255,0.86)",
  bgVeil:        "rgba(255,255,255,0.33)",

  // Surface des contrôles : boutons ronds, pistes d'interrupteur, boutons
  // secondaires. C'est le rgba(255,255,255,0.08) du prototype, inversé.
  control:       "rgba(0,0,0,0.06)",
  controlHover:  "rgba(0,0,0,0.10)",

  // Bordures — filet unique, très discret
  border:        "rgba(0,0,0,0.08)",
  borderSubtle:  "rgba(0,0,0,0.05)",
  borderStrong:  "rgba(0,0,0,0.14)",
  gridGap:       "rgba(0,0,0,0.06)",
  dashedBorder:  "rgba(0,0,0,0.14)",

  // Texte
  text:          "#000000",
  textTitle:     "#000000",
  textCard:      "rgba(0,0,0,0.72)",
  textMuted:     "rgba(0,0,0,0.5)",
  textDim:       "rgba(0,0,0,0.35)",
  textOnAccent:  "#ffffff",
  textOnSolid:   "#ffffff",

  solid:         "#000000",
  solidHover:    "rgba(0,0,0,0.82)",

  onColor:       "#ffffff",
  toastBg:       "#121212",
  toastText:     "#ffffff",

  // Accent — même orange dans les deux thèmes, lisible sur blanc comme sur noir
  accent:        "#ff4500",
  accentHover:   "#e63e00",
  accentBg:      "rgba(255,69,0,0.10)",
  accentBorder:  "rgba(255,69,0,0.35)",
  accentFaint:   "rgba(255,69,0,0.06)",
  accentSolid:   "rgba(255,69,0,0.18)",

  // Sémantique
  success:       "#1c8a5a",
  successBg:     "rgba(28,138,90,0.10)",
  successBorder: "rgba(28,138,90,0.30)",
  warn:          "#a8760a",
  warnBg:        "rgba(168,118,10,0.10)",
  warnBorder:    "rgba(168,118,10,0.30)",
  danger:        "#c0392b",
  dangerBg:      "rgba(192,57,43,0.10)",
  dangerBorder:  "rgba(192,57,43,0.30)",
  info:          "#3a63c8",
  // Ligne de l'indice Hooper superposée au graphe d'écart : troisième teinte,
  // séparable de l'accent et de `info` y compris en vision des couleurs
  // déficiente (validé : ΔE ≥ 21 deutan/protan).
  hooperLine:    "#1c8a5a",
  // Qualité de séance (les étoiles du retour), superposée au même graphe que
  // l'écart et la forme. Teinte prune : la seule famille, avec le cyan, qui
  // reste séparable des trois autres séries dans les DEUX thèmes en vision des
  // couleurs déficiente (ΔE ≥ 9,8 clair / 8,7 sombre) — le cyan frôlait le
  // vert-d'eau du Hooper.
  qualityLine:   "#8e3a6b",
  infoBg:        "rgba(58,99,200,0.10)",
  infoBorder:    "rgba(58,99,200,0.30)",
};

const dark = {
  bg:            "#000000",
  bgAlt:         "#0a0a0a",
  surface:       "#121212",
  surface2:      "#1a1a1a",
  card:          "#121212",
  cardAlt:       "#181818",
  modalBg:       "#121212",
  inputBg:       "rgba(255,255,255,0.06)",
  overlayBg:     "rgba(0,0,0,0.7)",
  headerGrad:    "linear-gradient(180deg, #000000 0%, #000000 100%)",
  tint:          "rgba(255,255,255,0.04)",
  bgScrim:       "rgba(0,0,0,0.86)",
  bgVeil:        "rgba(0,0,0,0.33)",

  control:       "rgba(255,255,255,0.08)",
  controlHover:  "rgba(255,255,255,0.14)",

  border:        "rgba(255,255,255,0.08)",
  borderSubtle:  "rgba(255,255,255,0.05)",
  borderStrong:  "rgba(255,255,255,0.16)",
  gridGap:       "rgba(255,255,255,0.06)",
  dashedBorder:  "rgba(255,255,255,0.16)",

  text:          "#ffffff",
  textTitle:     "#ffffff",
  textCard:      "rgba(255,255,255,0.72)",
  textMuted:     "rgba(255,255,255,0.5)",
  textDim:       "rgba(255,255,255,0.35)",
  textOnAccent:  "#ffffff",
  textOnSolid:   "#000000",

  solid:         "#ffffff",
  solidHover:    "rgba(255,255,255,0.9)",

  onColor:       "#ffffff",
  toastBg:       "#1a1a1a",
  toastText:     "#ffffff",

  accent:        "#ff4500",
  accentHover:   "#ff6428",
  accentBg:      "rgba(255,69,0,0.14)",
  accentBorder:  "rgba(255,69,0,0.45)",
  accentFaint:   "rgba(255,69,0,0.08)",
  accentSolid:   "rgba(255,69,0,0.22)",

  success:       "#5fe0c0",
  successBg:     "rgba(95,224,192,0.12)",
  successBorder: "rgba(95,224,192,0.35)",
  warn:          "#e0c25f",
  warnBg:        "rgba(224,194,95,0.12)",
  warnBorder:    "rgba(224,194,95,0.35)",
  danger:        "#ff6b5f",
  dangerBg:      "rgba(255,107,95,0.12)",
  dangerBorder:  "rgba(255,107,95,0.35)",
  info:          "#6c8cff",
  hooperLine:    "#5fe0c0",   // cf. commentaire côté clair
  qualityLine:   "#e08ab8",   // idem
  infoBg:        "rgba(108,140,255,0.12)",
  infoBorder:    "rgba(108,140,255,0.35)",
};

export const PALETTE = { light, dark };

// Retourne l'objet de couleurs du thème courant. Ce sont deux constantes de
// module : aucun objet n'est alloué à l'appel, c'est utilisable en plein rendu.
export const colors = (isDark) => (isDark ? dark : light);

// ── Couleurs de données ──────────────────────────────────────────────────────
// Elles portent une information (niveau de charge, fatigue, catégorie) : elles
// restent colorées, mais désaturées pour s'accorder au chrome neutre.
// Les SEUILS vivent dans lib/charge.js et lib/hooper.js — ici, que des valeurs.

export const DATA = {
  // Charge de séance 0-10 : repos → léger → modéré → soutenu → très lourd
  charge: {
    light: ["#4d7a5b", "#5f8a68", "#8a6a35", "#9a5f3a", "#a44a4a"],
    dark:  ["#7fae8a", "#8fb89a", "#c9a95e", "#c98a5c", "#c26b74"],
  },

  // Indice Hooper : bien récupéré → modérément fatigué → très fatigué
  hooper: {
    light: ["#4d7a5b", "#8a6a35", "#a44a4a"],
    dark:  ["#8fb89a", "#c9a95e", "#c26b74"],
  },

  // Couleurs de sport — badge lettré sur fond `couleur + 14 %`.
  // Escalade, Course, Vélo, Trail et Autre viennent du prototype « Ascent » ;
  // Renforcement et Mobilité sont une extension (le prototype n'a que 5 sports).
  // Identiques dans les deux thèmes : elles sont recopiées dans les séances.
  sports: {
    climbing: "#ff4500",
    running:  "#5fe0c0",
    cycling:  "#6c8cff",
    trail:    "#e0c25f",
    strength: "#a78bff",
    mobility: "#ff8fa3",
    custom:   "#9a9a9a",
  },

  // Palette de sélection proposée à l'utilisateur (couleur d'un objectif, d'une
  // séance rapide, d'un événement). Ces valeurs sont ENREGISTRÉES dans ses
  // données : elles ne peuvent pas dépendre du thème, sinon une couleur choisie
  // en clair changerait en sombre. Toutes en demi-teinte pour rester lisibles
  // sur fond blanc comme sur fond noir.
  picker: ["#9a5f3a", "#8a6a35", "#6b8a4a", "#4d7a5b", "#3f7f84", "#4a6b8a",
           "#6d5f8a", "#8a5a86", "#a05a72", "#a44a4a", "#8a6a52", "#6b7280"],

  // Types de blocs — affichés en petit filet coloré. Recopiés dans les séances
  // créées, donc fixes eux aussi.
  // Rampes de la heatmap d'activité : 5 paliers, du vide à l'intensité max.
  // « charge » et « rpe » montent vers l'accent ; « hooper » et « reminders »
  // sont divergentes (bien → mal).
  heatmap: {
    charge:    { light: ["#f0f0f1", "#e6d8cf", "#d4b09a", "#c07a52", "#b04a24"],
                 dark:  ["#1c1c1c", "#33241d", "#5c3d2c", "#9a6143", "#e8926a"] },
    rpe:       { light: ["#f0f0f1", "#eae0cc", "#d6c08e", "#b89a55", "#8a6a35"],
                 dark:  ["#1c1c1c", "#2a2418", "#4d422a", "#8a7442", "#c9a95e"] },
    hooper:    { light: ["#f0f0f1", "#cfe0d4", "#4d7a5b", "#8a6a35", "#a44a4a"],
                 dark:  ["#1c1c1c", "#24332a", "#8fb89a", "#c9a95e", "#c26b74"] },
    reminders: { light: ["#f0f0f1", "#cfe0d4", "#4d7a5b", "#8a6a35", "#a44a4a"],
                 dark:  ["#1c1c1c", "#24332a", "#8fb89a", "#c9a95e", "#c26b74"] },
    // Qualité de séance (1-5 étoiles). Rampe **séquentielle** : une seule
    // teinte, du pâle au soutenu — plus c'est dense, meilleure était la séance.
    // Luminosité strictement monotone (0.918 → 0.487 en clair, 0.299 → 0.787 en
    // sombre), et le premier échelon reste distinct de la case vide : une
    // séance notée 1 ★ ne doit pas se lire « aucune donnée ».
    quality:   { light: ["#dae8e0", "#b8d9c4", "#88c2a0", "#4f9975", "#256f4f"],
                 dark:  ["#24312a", "#2c4636", "#3f6b50", "#5f9a74", "#8fc9a8"] },
  },

  // Séries de graphiques : phases de sommeil, et main gauche / droite pour les
  // suspensions. Fixes — ce sont des catégories, pas des états du thème.
  sleep: { deep: "#4a6b8a", rem: "#6d5f8a", light: "#3f7f84", awake: "#9a5f3a66" },
  hands: { left: "#6d5f8a", right: "#a05a72" },

  // Couleur de repli quand un libellé n'a pas de couleur connue.
  fallback: "#8a8a8f",
};

// Statut d'une séance : fond + texte.
export const statusColors = (isDark) => {
  const c = colors(isDark);
  return {
    done:    { bg: c.successBg, fg: c.success },
    adapted: { bg: c.warnBg,    fg: c.warn },
    moved:   { bg: c.warnBg,    fg: c.warn },
    missed:  { bg: c.dangerBg,  fg: c.danger },
  };
};

// Pastille de charge (fond + texte) — trois paliers.
export const chargeTokenColors = (value, isDark) => {
  const c = colors(isDark);
  if (!value || value < 4) return { bg: c.successBg, fg: c.success };
  if (value < 7)           return { bg: c.warnBg,    fg: c.warn };
  return                        { bg: c.dangerBg,  fg: c.danger };
};
