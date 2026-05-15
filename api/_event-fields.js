// Helpers partagés entre /api/calendar/[token].js et /api/caldav/[...path].js
// pour construire des champs ICS cohérents quelle que soit la discipline
// ou le mode de la séance (simple, détaillé, événement).
//
// IMPORTANT : le fichier commence par "_" → Vercel ne le traite pas comme
// une route serverless.

// ─── Mappings ────────────────────────────────────────────────────────────────
const DISCIPLINE_LABELS = {
  climbing: "Escalade",
  running:  "Course",
  cycling:  "Vélo",
  strength: "Renforcement",
  mobility: "Mobilité",
  custom:   "Autre",
};

const METRIC_LABELS = {
  distanceKm:  { label: "Distance",  suffix: "km" },
  elevationM:  { label: "D+",        suffix: "m"  },
  pace:        { label: "Allure",    suffix: "/km" },
  sets:        { label: "Séries",    suffix: ""    },
  reps:        { label: "Reps",      suffix: ""    },
  weightKg:    { label: "Charge",    suffix: "kg"  },
};

// ─── Helpers d'extraction ────────────────────────────────────────────────────

// Retourne le LOCATION ICS depuis n'importe quel modèle de séance.
// Sessions classiques (SessionComposer) utilisent `location`.
// QuickSessions (events) utilisent `address` et/ou `location`.
export function getEventLocation(session) {
  return (session.location || session.address || "").trim() || null;
}

// Normalise la charge planifiée vers l'échelle 0-10.
// - session.chargePlanned (schemaVersion 2) → directement
// - session.charge legacy (0-216) → divisé par 21.6
// - session.charge déjà 0-10 → tel quel
function normalizePlannedCharge(session) {
  if (session.chargePlanned != null) {
    const n = Number(session.chargePlanned);
    if (!Number.isNaN(n)) return Math.max(0, Math.min(10, Math.round(n)));
  }
  if (session.charge != null) {
    const c = Number(session.charge);
    if (Number.isNaN(c)) return null;
    if (c > 10) return Math.max(0, Math.min(10, Math.round(c / 21.6)));
    return Math.max(0, Math.min(10, Math.round(c)));
  }
  return null;
}

// Liste résumée des blocs sous forme "Échauffement → Grimpe → Retour calme".
function summarizeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const names = blocks
    .map(b => (b.name && b.name.trim()) || b.blockType || b.type)
    .filter(Boolean);
  if (names.length === 0) return null;
  if (names.length > 6) return names.slice(0, 5).join(" → ") + ` → … (${names.length} blocs)`;
  return names.join(" → ");
}

// Résumé des métriques selon la discipline ("8 km · D+ 350 m · 5:30/km").
function summarizeMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") return null;
  const parts = [];
  for (const [k, v] of Object.entries(metrics)) {
    if (v == null || v === "") continue;
    const m = METRIC_LABELS[k];
    if (!m) continue;
    const value = typeof v === "number" ? v : String(v);
    parts.push(m.suffix ? `${m.label} ${value} ${m.suffix}`.trim() : `${m.label} ${value}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

// Construit la DESCRIPTION ICS complète. Champs inclus (dans cet ordre) :
//   1. Discipline (si non-escalade ou objectif)
//   2. Charge planifiée (X/10) + ressentie (Y/10) si feedback existe
//   3. Durée (X min)
//   4. Liste des blocs
//   5. Métriques (distance, D+, allure, sets/reps/charge, …)
//   6. Notes / contenu (texte libre)
//   7. Mot de l'entraîneur (coachNote)
//
// Renvoie null si rien d'intéressant à dire.
export function buildEventDescription(session) {
  const parts = [];

  // 1. Discipline (saute climbing par défaut pour ne pas spammer)
  if (session.discipline && session.discipline !== "climbing") {
    const lbl = DISCIPLINE_LABELS[session.discipline] || session.discipline;
    parts.push(lbl);
  } else if (session.discipline === "climbing" && session.mode === "event") {
    // les événements escalade méritent quand même le tag "Objectif" si flag
    if (session.isObjective) parts.push("Objectif");
  }

  // 1bis. Tag Objectif (event flag) hors événement non-escalade
  if (session.isObjective && (!session.discipline || session.discipline !== "climbing")) {
    parts.push("Objectif");
  }

  // 2. Charge planifiée (0-10)
  const planned = normalizePlannedCharge(session);
  if (planned != null && planned > 0) {
    let line = `Charge planifiée : ${planned}/10`;
    const feltRpe = session.feedback?.rpe;
    if (feltRpe != null) line += ` · ressentie : ${feltRpe}/10`;
    parts.push(line);
  }

  // 3. Durée
  if (session.duration) {
    parts.push(`${session.duration} min`);
  } else if (session.estimatedTime) {
    parts.push(`${session.estimatedTime} min`);
  }

  // 4. Liste des blocs
  const blocksLine = summarizeBlocks(session.blocks);
  if (blocksLine) parts.push("Blocs : " + blocksLine);

  // Cas legacy : un bloc unique (session.blockType existe sur les "anciennes" séances bloc-only)
  if (!session.blocks?.length && session.blockType) {
    parts.push(session.blockType);
  }

  // 5. Métriques
  const metricsLine = summarizeMetrics(session.metrics);
  if (metricsLine) parts.push(metricsLine);

  // 6. Notes / contenu libre — préserve les sauts de ligne
  const notes = (session.notes || session.content || session.description || "").trim();
  if (notes) {
    parts.push(notes);
  }

  // 7. Mot de l'entraîneur
  if (session.coachNote && session.coachNote.trim()) {
    parts.push("Coach : " + session.coachNote.trim());
  }

  if (parts.length === 0) return null;
  return parts.join("\n");
}
