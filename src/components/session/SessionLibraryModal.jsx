import { useState, useMemo } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { Modal } from "../ui/Modal.jsx";
import { colors } from "../../theme/palette.js";
import { RADIUS, Z } from "../../theme/makeStyles.js";
import { Chip, SportBadge, RoundIconButton, SANS, MONO } from "../ui/Ascent.jsx";
import { disciplineList, getDiscipline } from "../../lib/disciplines.js";
import { getSessionCharge, getChargeColor } from "../../lib/charge.js";

// ─── RECHERCHE DANS LA BIBLIOTHÈQUE ───────────────────────────────────────────
// S'ouvre depuis le bouton bibliothèque du formulaire de séance. Recherche par
// nom, filtre par discipline, tri par date de création ou par charge. Choisir
// une séance ferme la fenêtre et pré-remplit le formulaire.

const SORTS = [
  { id: "recent",   label: "Plus récentes",  short: "Récentes" },
  { id: "oldest",   label: "Plus anciennes", short: "Anciennes" },
  { id: "charge-",  label: "Charge ↓",       short: "Charge ↓" },
  { id: "charge+",  label: "Charge ↑",       short: "Charge ↑" },
];

// Les lignes du catalogue portent un identifiant croissant : l'ordre de
// création, c'est l'ordre des id.
function creationRank(s) {
  const n = Number(s.id);
  return isFinite(n) ? n : 0;
}

export function SessionLibraryModal({ sessions = [], onPick, onClose }) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);

  const [search, setSearch]         = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [sort, setSort]             = useState("recent");
  const [sortOpen, setSortOpen]     = useState(false);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = sessions.filter(s => {
      const name = (s.name || s.title || "").toLowerCase();
      if (q && !name.includes(q)) return false;
      if (discipline === "all") return true;
      // Les séances d'avant les disciplines n'en portent pas : on les rattache
      // à l'escalade, seule discipline qui existait alors.
      return (s.discipline || "climbing") === discipline;
    });
    const sorted = [...filtered];
    if (sort === "recent")  sorted.sort((a, b) => creationRank(b) - creationRank(a));
    if (sort === "oldest")  sorted.sort((a, b) => creationRank(a) - creationRank(b));
    if (sort === "charge-") sorted.sort((a, b) => getSessionCharge(b) - getSessionCharge(a));
    if (sort === "charge+") sorted.sort((a, b) => getSessionCharge(a) - getSessionCharge(b));
    return sorted;
  }, [sessions, search, discipline, sort]);

  const currentSort = SORTS.find(s => s.id === sort) || SORTS[0];

  return (
    <Modal onClose={onClose} maxWidth={480} zIndex={Z.nested + 1} ariaLabel="Rechercher une séance">
      {/* ── En-tête ── */}
      <div style={{
        padding: "16px 18px 12px", display: "flex", alignItems: "center",
        gap: 12, flexShrink: 0, fontFamily: SANS,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px", color: c.text }}>
            Bibliothèque
          </div>
          <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>
            {list.length} séance{list.length !== 1 ? "s" : ""}
          </div>
        </div>
        <RoundIconButton isDark={isDark} size={32} label="Fermer" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </RoundIconButton>
      </div>

      {/* ── Recherche ── */}
      <div style={{ padding: "0 18px 10px", flexShrink: 0 }}>
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une séance…"
          style={{
            width: "100%", background: c.control, border: "none", outline: "none",
            borderRadius: RADIUS.pill, padding: "11px 18px", color: c.text,
            fontSize: 14, fontFamily: SANS,
          }}
        />
      </div>

      {/* ── Filtres : discipline + tri ── */}
      <div style={{ padding: "0 18px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Chip isDark={isDark} size="sm" label="Toutes"
                active={discipline === "all"} onClick={() => setDiscipline("all")} />
          {disciplineList().map(d => (
            <Chip
              key={d.id} isDark={isDark} size="sm" label={d.label} color={d.color}
              active={discipline === d.id} onClick={() => setDiscipline(d.id)}
            />
          ))}

          {/* Tri — un bouton, quatre choix */}
          <div style={{ position: "relative", marginLeft: "auto" }}>
            <button
              onClick={() => setSortOpen(o => !o)}
              aria-label="Trier"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: c.control, border: "none", borderRadius: RADIUS.pill,
                color: c.text, padding: "6px 12px", cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: SANS,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M6 12h12M9 17h6" />
              </svg>
              {currentSort.short}
            </button>
            {sortOpen && (
              <>
                <div onClick={() => setSortOpen(false)}
                     style={{ position: "fixed", inset: 0, zIndex: 1 }} />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 2,
                  background: c.card, border: `1px solid ${c.border}`,
                  borderRadius: RADIUS.control, overflow: "hidden", minWidth: 168,
                  boxShadow: "0 12px 28px rgba(0,0,0,0.3)",
                }}>
                  {SORTS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSort(s.id); setSortOpen(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        background: s.id === sort ? c.accentBg : "transparent",
                        border: "none", padding: "10px 14px", cursor: "pointer",
                        color: s.id === sort ? c.accent : c.text,
                        fontSize: 13, fontWeight: s.id === sort ? 700 : 500, fontFamily: SANS,
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Résultats ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 18px", fontFamily: SANS }}>
        {list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: c.textMuted, fontSize: 13 }}>
            {sessions.length === 0
              ? "Aucune séance enregistrée. Coche « Enregistrer comme modèle » en créant une séance pour la retrouver ici."
              : "Aucun résultat."}
          </div>
        ) : (
          <div style={{
            background: c.card, border: `1px solid ${c.border}`,
            borderRadius: RADIUS.card, overflow: "hidden",
          }}>
            {list.map((s, i) => {
              const charge = getSessionCharge(s);
              const d = getDiscipline(s.discipline || "climbing");
              return (
                <button
                  key={s.id}
                  onClick={() => onPick(s)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "12px 14px", minHeight: 56, textAlign: "left",
                    background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: i === list.length - 1 ? "none" : `0.5px solid ${c.border}`,
                  }}
                >
                  <SportBadge disciplineId={d.id} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: c.text,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {s.name || s.title}
                    </div>
                    <div style={{ fontSize: 11, color: c.textDim, display: "flex", gap: 10, marginTop: 2 }}>
                      <span>{d.label}</span>
                      {s.estimatedTime ? <span>{s.estimatedTime} min</span> : null}
                      {s.location ? <span>{s.location}</span> : null}
                    </div>
                  </div>
                  <span style={{ font: `700 15px ${MONO}`, color: getChargeColor(charge, isDark), flexShrink: 0 }}>
                    {charge}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
