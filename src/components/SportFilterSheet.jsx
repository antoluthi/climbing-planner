import { Modal, ModalHeader } from "./ui/Modal.jsx";
import { useThemeCtx } from "../theme/ThemeContext.jsx";
import { colors, DATA } from "../theme/palette.js";
import { disciplineList } from "../lib/disciplines.js";
import { Chip } from "./ui/Ascent.jsx";

// ─── CHOIX DES SPORTS AFFICHÉS DANS LES STATS ────────────────────────────────
// Deux chemins mènent ici, à dessein : un appui long sur l'onglet « Stats »
// (le raccourci) et la puce sous le titre de la page (ce qui le rend
// trouvable, et le seul chemin sur ordinateur, où il n'y a pas de barre du bas).
//
// « Tous » n'est pas une case parmi les autres : c'est l'absence de filtre.
// Le distinguer d'une sélection qui contiendrait les sept disciplines évite
// qu'un sport ajouté plus tard soit exclu en silence d'un filtre « complet ».
export function SportFilterSheet({ selected, onChange, onClose }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const all = disciplineList();
  const actif = selected && selected.length > 0;

  const toggle = (id) => {
    // Depuis « Tous », toucher un sport l'ISOLE — c'est le geste qu'on vient
    // chercher ici. Le traiter comme un décochage partirait de sept sports pour
    // en retirer un, soit exactement l'inverse de l'intention.
    if (!actif) return onChange([id]);
    const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
    // Plus rien de coché, ou tout coché : dans les deux cas, plus de filtre.
    onChange(next.length === 0 || next.length === all.length ? null : next);
  };

  return (
    <Modal onClose={onClose} maxWidth={380} ariaLabel="Sports affichés dans les statistiques">
      <ModalHeader eyebrow="Statistiques" title="Sports affichés" onClose={onClose} />
      <div style={{ padding: "4px 18px 18px" }}>
        <p style={{ fontSize: 12, color: c.textMuted, lineHeight: 1.5, margin: "0 0 14px" }}>
          Ne concerne que ce qui vient des séances — charge, écart, qualité et
          l’activité. Le poids, le bien-être et le sommeil ne dépendent d’aucun
          sport et restent affichés en entier.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Chip
            isDark={isDark}
            label="Tous"
            active={!actif}
            onClick={() => onChange(null)}
          />
          {all.map(d => (
            <Chip
              key={d.id}
              isDark={isDark}
              label={d.label}
              color={DATA.sports[d.id]}
              active={actif && selected.includes(d.id)}
              onClick={() => toggle(d.id)}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
