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
// Le fond est légèrement cassé (#fafafa / #0a0a0a) pour que les cartes, elles
// franchement blanches ou noires, se détachent sans ombre portée.
const light = {
  // Fonds
  bg:            "#fafafa",
  bgAlt:         "#f4f4f5",   // barres, bandeaux secondaires
  surface:       "#ffffff",   // panneaux
  surface2:      "#f4f4f5",   // panneau enfoncé
  card:          "#ffffff",   // cartes flottantes
  cardAlt:       "#fafafa",
  modalBg:       "#ffffff",
  inputBg:       "#ffffff",
  overlayBg:     "rgba(0,0,0,0.35)",
  headerGrad:    "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
  tint:          "rgba(0,0,0,0.03)",       // survol/zébrure à peine visible
  bgScrim:       "rgba(250,250,250,0.93)", // fond quasi opaque (barres collantes)
  bgVeil:        "rgba(250,250,250,0.33)", // voile léger

  // Bordures
  border:        "#e4e4e7",
  borderSubtle:  "#f0f0f1",
  borderStrong:  "#d4d4d8",
  gridGap:       "#ececed",
  dashedBorder:  "#d4d4d8",

  // Texte
  text:          "#18181b",
  textTitle:     "#09090b",
  textCard:      "#27272a",
  textMuted:     "#71717a",
  textDim:       "#a1a1aa",
  textOnAccent:  "#ffffff",
  textOnSolid:   "#ffffff",   // texte sur un aplat noir

  // Aplat neutre fort (boutons principaux en N&B)
  solid:         "#18181b",
  solidHover:    "#27272a",

  // Toasts et bandeaux : surface inversée en thème clair, simplement surélevée
  // en thème sombre (un toast blanc sur fond noir serait aveuglant).
  // Marque posée sur une surface colorée (pastille d'un sélecteur, curseur d'un
  // interrupteur, texte sur un aplat d'accent). Blanche dans les deux thèmes :
  // les couleurs qui la portent sont toutes en demi-teinte.
  onColor:       "#ffffff",

  toastBg:       "#18181b",
  toastText:     "#fafafa",

  // Accent chaud
  accent:        "#b04a24",
  accentHover:   "#933d1d",
  accentBg:      "#fdf1ec",
  accentBorder:  "#b04a2455",
  accentFaint:   "#b04a2418",
  accentSolid:   "#b04a2433",

  // Sémantique (désaturée)
  success:       "#4d7a5b",
  successBg:     "#eef4ef",
  successBorder: "#4d7a5b44",
  warn:          "#8a6a35",
  warnBg:        "#f7f3ea",
  warnBorder:    "#8a6a3544",
  danger:        "#a44a4a",
  dangerBg:      "#f9eeee",
  dangerBorder:  "#a44a4a44",
  info:          "#4a6b8a",
  infoBg:        "#eef2f6",
  infoBorder:    "#4a6b8a44",
};

const dark = {
  bg:            "#0a0a0a",
  bgAlt:         "#121212",
  surface:       "#161616",
  surface2:      "#1f1f1f",
  card:          "#161616",
  cardAlt:       "#1c1c1c",
  modalBg:       "#161616",
  inputBg:       "#121212",
  overlayBg:     "rgba(0,0,0,0.75)",
  headerGrad:    "linear-gradient(180deg, #121212 0%, #0a0a0a 100%)",
  tint:          "rgba(255,255,255,0.04)",
  bgScrim:       "rgba(10,10,10,0.93)",
  bgVeil:        "rgba(10,10,10,0.33)",

  border:        "#2a2a2a",
  borderSubtle:  "#1f1f1f",
  borderStrong:  "#3d3d3d",
  gridGap:       "#000000",
  dashedBorder:  "#3d3d3d",

  text:          "#ededed",
  textTitle:     "#ffffff",
  textCard:      "#d4d4d4",
  textMuted:     "#8f8f8f",
  textDim:       "#6b6b6b",
  textOnAccent:  "#0a0a0a",
  textOnSolid:   "#0a0a0a",

  solid:         "#ededed",
  solidHover:    "#ffffff",

  // Marque posée sur une surface colorée (pastille d'un sélecteur, curseur d'un
  // interrupteur, texte sur un aplat d'accent). Blanche dans les deux thèmes :
  // les couleurs qui la portent sont toutes en demi-teinte.
  onColor:       "#ffffff",

  toastBg:       "#1f1f1f",
  toastText:     "#ededed",

  accent:        "#e8926a",
  accentHover:   "#f0a37f",
  accentBg:      "#241610",
  accentBorder:  "#e8926a55",
  accentFaint:   "#e8926a1f",
  accentSolid:   "#e8926a33",

  success:       "#8fb89a",
  successBg:     "#16201a",
  successBorder: "#8fb89a44",
  warn:          "#c9a95e",
  warnBg:        "#211c12",
  warnBorder:    "#c9a95e44",
  danger:        "#c26b74",
  dangerBg:      "#221416",
  dangerBorder:  "#c26b7444",
  info:          "#7f9bbd",
  infoBg:        "#141a21",
  infoBorder:    "#7f9bbd44",
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

  // Palette de sélection proposée à l'utilisateur (couleur d'un objectif, d'une
  // séance rapide, d'un événement). Ces valeurs sont ENREGISTRÉES dans ses
  // données : elles ne peuvent pas dépendre du thème, sinon une couleur choisie
  // en clair changerait en sombre. Toutes en demi-teinte pour rester lisibles
  // sur fond blanc comme sur fond noir.
  picker: ["#9a5f3a", "#8a6a35", "#6b8a4a", "#4d7a5b", "#3f7f84", "#4a6b8a",
           "#6d5f8a", "#8a5a86", "#a05a72", "#a44a4a", "#8a6a52", "#6b7280"],

  // Types de blocs — affichés en petit filet coloré. Recopiés dans les séances
  // créées, donc fixes eux aussi.
  blocks: {
    "Échauffement":    "#9a5f3a",
    "Grimpe":          "#8a6a52",
    "Exercices":       "#4a6b8a",
    "Suspension":      "#6d5f8a",
    "Étirements":      "#8a5a86",
    "Retour au calme": "#6b7280",
  },

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
