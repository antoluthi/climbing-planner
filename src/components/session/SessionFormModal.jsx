import { useState, useRef, useEffect } from "react";
import { useThemeCtx } from "../../theme/ThemeContext.jsx";
import { Modal } from "../ui/Modal.jsx";
import { colors, DATA } from "../../theme/palette.js";
import { RADIUS, Z } from "../../theme/makeStyles.js";
import { PrimaryButton, RoundIconButton, Chip, RoundCheck, SANS, MONO } from "../ui/Ascent.jsx";
import { disciplineList, getDiscipline } from "../../lib/disciplines.js";
import { getChargeColor, normalizeCharge10, chargeLabel } from "../../lib/charge.js";
import { generateId } from "../../lib/storage.js";
import { calcEndTime } from "../../lib/helpers.js";
import {
  parseDuration, parsePace, parseNumber,
  formatDuration, formatPace, formatNumber,
  sanitizeClockInput, computeThird,
} from "../../lib/pace.js";
import { SessionLibraryModal } from "./SessionLibraryModal.jsx";
import { ChargeCalculatorModal } from "./ChargeCalculatorModal.jsx";
import { ConfirmModal } from "../ConfirmModal.jsx";

// ─── FORMULAIRE DE SÉANCE ─────────────────────────────────────────────────────
// Première étape de l'ajout : quoi. La seconde (quand & où) est
// SessionScheduleModal, ouverte par le shell une fois celle-ci validée.
//
// Le nom se saisit en haut à gauche ; le bouton bibliothèque juste à sa droite
// ouvre la recherche et pré-remplit tout. Sans modèle, on choisit d'abord la
// discipline : ce sont elle qui décide des champs.
//
//   escalade / renforcement / mobilité / autre : temps + charge
//   course / trail                             : temps · distance · allure (liés) + D+
//   vélo                                       : temps · distance · vitesse (liés) + D+
//
// Le trio lié vit dans lib/pace.js : en renseigner deux calcule le troisième.

const EVENT_COLORS = DATA.picker.slice(0, 8);

// Disciplines qui se saisissent en distance : le trio lié s'affiche pour elles.
const RATE_KIND = { running: "pace", trail: "pace", cycling: "speed" };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SessionFormModal({
  initial,
  dayLabel,
  defaultDate,
  library = [],
  // « Suivant » quand l'étape « quand & où » suit, « Enregistrer » sinon. Le
  // parent tranche : revenir de la seconde étape repasse par ici avec les
  // valeurs déjà saisies, sans que ce soit pour autant une modification.
  submitLabel = "Enregistrer",
  // Une échéance n'a pas de seconde étape : le bouton ne dit pas « Suivant ».
  eventSubmitLabel,
  // Les deux cases du pied n'ont de sens qu'à la création : modifier une séance
  // déjà enregistrée (planning ou bibliothèque) ne doit pas les proposer.
  allowEvent = true,
  allowTemplate = true,
  onSave,
  onDelete,
  onClose,
}) {
  const { isDark } = useThemeCtx();
  const c = colors(isDark);
  const nameRef = useRef(null);


  // ── Identité ──
  const [name, setName] = useState(initial?.name || initial?.title || "");
  // Sans modèle ni édition, la discipline n'est pas encore choisie : les champs
  // n'apparaissent qu'une fois qu'elle l'est.
  const [discipline, setDiscipline] = useState(initial?.discipline || null);

  // ── Temps (minutes fractionnaires côté trio, minutes entières côté app) ──
  const [duration, setDuration] = useState(
    initial?.metrics?.durationMin != null ? formatDuration(initial.metrics.durationMin)
      : initial?.estimatedTime != null ? String(initial.estimatedTime) : ""
  );
  const [distance, setDistance] = useState(
    initial?.metrics?.distanceKm != null ? String(initial.metrics.distanceKm) : ""
  );
  const [rate, setRate] = useState(() => {
    if (initial?.metrics?.pace) return initial.metrics.pace;
    if (initial?.metrics?.speedKmh != null) return String(initial.metrics.speedKmh);
    return "";
  });
  const [elevation, setElevation] = useState(
    initial?.metrics?.elevationM != null ? String(initial.metrics.elevationM) : ""
  );
  // Ordre de saisie du trio, plus récent d'abord — décide lequel se calcule.
  const touched = useRef([]);
  const [computedField, setComputedField] = useState(null);

  // ── Charge ──
  const [charge, setCharge] = useState(() => {
    if (initial?.chargePlanned != null) return normalizeCharge10(initial.chargePlanned);
    if (initial?.charge != null) return normalizeCharge10(initial.charge);
    return 5;
  });

  // ── Notes ──
  const [notes, setNotes] = useState(initial?.notes || initial?.description || initial?.content || "");

  // ── Cases du pied ──
  const [isEvent, setIsEvent] = useState(initial?.mode === "event");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // ── Événement ──
  const eventStart = initial?.startDate || initial?.date || defaultDate || todayISO();
  const [startDate, setStartDate] = useState(eventStart);
  const [endDate, setEndDate] = useState(initial?.endDate || "");
  const [color, setColor] = useState(initial?.color || EVENT_COLORS[0]);

  // ── Fenêtres empilées ──
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const kind = RATE_KIND[discipline] || null;   // "pace" | "speed" | null
  const isClimbing = discipline === "climbing";

  // ── Trio lié ────────────────────────────────────────────────────────────────
  const setters = { duration: setDuration, distance: setDistance, rate: setRate };
  const values  = { duration, distance, rate };

  const onTripleChange = (field, raw) => {
    // L'allure et le temps se saisissent en minutes:secondes ; distance et
    // vitesse sont des nombres.
    const clocked = field === "duration" || (field === "rate" && kind === "pace");
    const next = clocked ? sanitizeClockInput(raw) : raw.replace(/[^\d.,]/g, "");
    setters[field](next);

    const order = [field, ...touched.current.filter(f => f !== field)];
    // Un champ vidé ne compte plus comme saisi.
    touched.current = order.filter(f => (f === field ? next.trim() : values[f].trim()));

    const parsed = {
      duration: parseDuration(field === "duration" ? next : duration),
      distance: parseNumber(field === "distance" ? next : distance),
      rate: kind === "pace"
        ? parsePace(field === "rate" ? next : rate)
        : parseNumber(field === "rate" ? next : rate),
    };
    const res = computeThird(parsed, touched.current, kind || "pace");
    if (!res) { setComputedField(null); return; }
    const fmt = res.field === "distance" ? formatNumber(res.value, 2)
      : res.field === "rate" && kind === "speed" ? formatNumber(res.value, 1)
      : res.field === "rate" ? formatPace(res.value)
      : formatDuration(res.value);
    setters[res.field](fmt);
    setComputedField(res.field);
  };

  // ── Charger un modèle ───────────────────────────────────────────────────────
  const loadFromLibrary = (s) => {
    setName(s.name || s.title || "");
    setDiscipline(s.discipline || "climbing");
    if (s.estimatedTime != null) setDuration(String(s.estimatedTime));
    if (s.metrics?.durationMin != null) setDuration(formatDuration(s.metrics.durationMin));
    setDistance(s.metrics?.distanceKm != null ? String(s.metrics.distanceKm) : "");
    setRate(s.metrics?.pace || (s.metrics?.speedKmh != null ? String(s.metrics.speedKmh) : ""));
    setElevation(s.metrics?.elevationM != null ? String(s.metrics.elevationM) : "");
    setCharge(normalizeCharge10(s.chargePlanned ?? s.charge ?? 5));
    setNotes(s.notes || s.description || "");
    touched.current = [];
    setComputedField(null);
    setLibraryOpen(false);
  };

  // ── Enregistrement ──────────────────────────────────────────────────────────
  const durationMin = parseDuration(duration);
  const canSave = name.trim().length > 0 && !!discipline && (!isEvent || !!startDate);

  const buildMetrics = () => {
    const m = {};
    if (durationMin != null) m.durationMin = Math.round(durationMin * 100) / 100;
    const km = parseNumber(distance);
    if (km != null) m.distanceKm = km;
    if (kind === "pace") {
      const p = parsePace(rate);
      if (p != null) m.pace = formatPace(p);
    } else if (kind === "speed") {
      const v = parseNumber(rate);
      if (v != null) m.speedKmh = v;
    }
    const dplus = parseNumber(elevation);
    if (dplus != null) m.elevationM = dplus;
    return Object.keys(m).length ? m : undefined;
  };

  const handleSave = () => {
    if (!canSave) return;
    const label = getDiscipline(discipline).label;
    const common = {
      id: initial?.id || generateId(),
      schemaVersion: 3,
      discipline,
      name: name.trim(),
      title: name.trim(),
      estimatedTime: durationMin != null ? Math.round(durationMin) : null,
      location: initial?.location || null,
      notes: notes.trim() || null,
      metrics: buildMetrics(),
      saveAsTemplate: saveAsTemplate || undefined,
    };

    if (isEvent) {
      // Une échéance ne porte ni heure, ni durée, ni mesures : des dates, une
      // couleur, une charge et une note.
      onSave({
        id: common.id,
        schemaVersion: 3,
        discipline,
        name: common.name,
        title: common.title,
        notes: common.notes,
        saveAsTemplate: common.saveAsTemplate,
        mode: "event",
        type: "Évènement",
        startDate,
        endDate: endDate && endDate > startDate ? endDate : undefined,
        allDay: true,
        color,
        content: notes.trim() || undefined,
        isQuick: true,
        chargePlanned: charge,
        charge,
        estimatedTime: null,
        startTime: null,
        endTime: null,
      });
      return;
    }

    onSave({
      ...common,
      mode: "simple",
      type: discipline === "climbing" ? "Grimpe" : label,
      chargePlanned: charge,
      charge,
      startTime: initial?.startTime || null,
      endTime: initial?.startTime && durationMin
        ? calcEndTime(initial.startTime, Math.round(durationMin))
        : null,
      isCustom: true,
    });
  };

  // ── Briques d'interface ─────────────────────────────────────────────────────
  const label = (txt) => (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
      color: c.textDim, marginBottom: 8,
    }}>{txt}</div>
  );

  const fieldStyle = (computed) => ({
    width: "100%", background: c.control, border: "none", outline: "none",
    borderRadius: RADIUS.control, padding: "11px 14px",
    color: computed ? c.accent : c.text,
    font: `700 16px ${MONO}`, textAlign: "center",
  });

  const cell = (key, txt, suffix, placeholder) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 5, textAlign: "center" }}>
        {txt}{suffix ? <span style={{ color: c.textDim }}> {suffix}</span> : null}
      </div>
      <input
        inputMode={key === "distance" || (key === "rate" && kind === "speed") ? "decimal" : "numeric"}
        value={values[key]}
        onChange={e => onTripleChange(key, e.target.value)}
        placeholder={placeholder}
        style={fieldStyle(computedField === key)}
      />
    </div>
  );

  return (
    <>
      <Modal onClose={onClose} maxWidth={480} zIndex={Z.modal} ariaLabel="Séance">
        {/* ── Nom + bibliothèque ── */}
        <div style={{
          padding: "16px 18px 14px", display: "flex", alignItems: "center", gap: 8,
          borderBottom: `0.5px solid ${c.border}`, flexShrink: 0, fontFamily: SANS,
        }}>
          <input
            ref={nameRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nom de la séance"
            style={{
              flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
              color: c.text, fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px",
              fontFamily: SANS, padding: 0,
            }}
          />
          <RoundIconButton isDark={isDark} size={34} label="Charger depuis la bibliothèque"
                           onClick={() => setLibraryOpen(true)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="6" rx="8" ry="3" />
              <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
              <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
            </svg>
          </RoundIconButton>
          {onDelete && (
            <RoundIconButton isDark={isDark} size={34} label="Supprimer" onClick={() => setConfirmDelete(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.danger}
                   strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
              </svg>
            </RoundIconButton>
          )}
          <RoundIconButton isDark={isDark} size={34} label="Fermer" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </RoundIconButton>
        </div>

        {/* ── Corps ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", fontFamily: SANS }}>
          {dayLabel && !isEvent && (
            <div style={{ fontSize: 12, color: c.textDim, marginBottom: 14, textTransform: "capitalize" }}>
              {dayLabel}
            </div>
          )}

          {/* Discipline */}
          {label("Discipline")}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {disciplineList().map(d => (
              <Chip
                key={d.id} isDark={isDark} size="sm" label={d.label} color={d.color}
                active={discipline === d.id} onClick={() => setDiscipline(d.id)}
              />
            ))}
          </div>

          {!discipline && (
            <div style={{ fontSize: 13, color: c.textMuted, marginTop: 14, lineHeight: 1.5 }}>
              Choisis une discipline — les champs suivants s'y adaptent.
            </div>
          )}

          {discipline && (
            <>
              {/* ── Mesures (séance) ─────────────────────────────────────
                   Une échéance n'en a pas : lui donner une heure de départ et
                   une durée n'a pas de sens quand elle s'étale sur deux jours.
                   Elle porte ses dates, sa couleur, sa charge et sa note. */}
              {!isEvent && (
                <div style={{ marginTop: 20 }}>
                  {kind ? (
                    <>
                      {label("Temps · distance · " + (kind === "pace" ? "allure" : "vitesse"))}
                      <div style={{ display: "flex", gap: 8 }}>
                        {cell("duration", "Temps", "", "45:00")}
                        {cell("distance", "Distance", "km", "8.5")}
                        {kind === "pace"
                          ? cell("rate", "Allure", "/km", "5:30")
                          : cell("rate", "Vitesse", "km/h", "26")}
                      </div>
                      <div style={{ fontSize: 11, color: c.textDim, marginTop: 6, textAlign: "center" }}>
                        Renseignes-en deux, le troisième se calcule.
                      </div>

                      <div style={{ marginTop: 16 }}>
                        {label("Dénivelé positif")}
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input
                            inputMode="numeric"
                            value={elevation}
                            onChange={e => setElevation(e.target.value.replace(/[^\d]/g, ""))}
                            placeholder="350"
                            style={{ ...fieldStyle(false), textAlign: "left", flex: 1 }}
                          />
                          <span style={{ fontSize: 13, color: c.textMuted, flexShrink: 0 }}>m · facultatif</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {label("Temps de séance")}
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                          inputMode="numeric"
                          value={duration}
                          onChange={e => setDuration(sanitizeClockInput(e.target.value))}
                          placeholder="90"
                          style={{ ...fieldStyle(false), textAlign: "left", flex: 1 }}
                        />
                        <span style={{ fontSize: 13, color: c.textMuted, flexShrink: 0 }}>minutes</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Événement : dates + couleur ── */}
              {isEvent && (
                <div style={{ marginTop: 20 }}>
                  {label("Dates")}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="date" value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      style={{ ...fieldStyle(false), fontSize: 14, flex: 1 }}
                    />
                    <span style={{ color: c.textDim, fontSize: 13 }}>→</span>
                    <input
                      type="date" value={endDate} min={startDate}
                      onChange={e => setEndDate(e.target.value)}
                      style={{ ...fieldStyle(false), fontSize: 14, flex: 1 }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: c.textDim, marginTop: 6 }}>
                    Fin facultative — sur un seul jour, laisse-la vide.
                  </div>

                  <div style={{ marginTop: 16 }}>
                    {label("Couleur")}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {/* Une échéance importée ou plus ancienne peut porter une
                          couleur hors palette : on l'ajoute plutôt que de la
                          laisser sans pastille sélectionnée. */}
                      {(EVENT_COLORS.includes(color) ? EVENT_COLORS : [color, ...EVENT_COLORS]).map(col => (
                        <button
                          key={col}
                          onClick={() => setColor(col)}
                          aria-label={`Couleur ${col}`}
                          style={{
                            width: 30, height: 30, borderRadius: 15, background: col,
                            border: col === color ? `2.5px solid ${c.text}` : "2.5px solid transparent",
                            cursor: "pointer", padding: 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Charge ── */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>{label("Charge")}</div>
                  <span style={{ font: `800 20px ${MONO}`, color: getChargeColor(charge, isDark), lineHeight: 1 }}>
                    {charge}<span style={{ fontSize: 12, opacity: 0.5 }}>/10</span>
                  </span>
                  {isClimbing && !isEvent && (
                    <RoundIconButton isDark={isDark} size={30} label="Calculateur de charge"
                                     onClick={() => setCalcOpen(true)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="2" width="16" height="20" rx="2" />
                        <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4M8 19h4" />
                      </svg>
                    </RoundIconButton>
                  )}
                </div>
                {/* Ce que le chiffre veut dire, en toutes lettres (échelle CR-10). */}
                <div style={{ fontSize: 13, color: getChargeColor(charge, isDark), marginBottom: 8, fontWeight: 600 }}>
                  {chargeLabel(charge)}
                </div>
                <input
                  type="range" min="0" max="10" step="1"
                  value={charge}
                  onChange={e => setCharge(Number(e.target.value))}
                  aria-label="Charge"
                  style={{ width: "100%", accentColor: getChargeColor(charge, isDark), cursor: "pointer" }}
                />
              </div>

              {/* ── Notes ── */}
              <div style={{ marginTop: 20 }}>
                {label("Notes")}
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Contenu de la séance, consignes, sensations attendues…"
                  rows={4}
                  style={{
                    width: "100%", background: c.control, border: "none", outline: "none",
                    borderRadius: RADIUS.control, padding: 14, color: c.text,
                    fontSize: 14, fontFamily: SANS, lineHeight: 1.5, resize: "vertical",
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* ── Pied : les deux cases et l'enregistrement ── */}
        <div style={{
          padding: "12px 18px 16px", borderTop: `0.5px solid ${c.border}`,
          flexShrink: 0, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          fontFamily: SANS,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 150 }}>
            {allowEvent && (
              <RoundCheck isDark={isDark} checked={isEvent} onChange={setIsEvent} label="Événement" />
            )}
            {allowTemplate && (
              <RoundCheck isDark={isDark} checked={saveAsTemplate} onChange={setSaveAsTemplate}
                          label="Enregistrer comme modèle" />
            )}
          </div>
          <PrimaryButton
            isDark={isDark}
            height={46}
            onClick={handleSave}
            style={{ width: "auto", padding: "0 24px", opacity: canSave ? 1 : 0.45 }}
          >
            {isEvent ? (eventSubmitLabel || submitLabel) : submitLabel}
          </PrimaryButton>
        </div>
      </Modal>

      {libraryOpen && (
        <SessionLibraryModal
          sessions={library}
          onPick={loadFromLibrary}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Supprimer ?"
          sub={`« ${name.trim() || "Sans nom"} » sera retirée du calendrier.`}
          confirmLabel="Supprimer"
          cancelLabel="Annuler"
          danger
          onConfirm={() => onDelete()}
          onClose={() => setConfirmDelete(false)}
        />
      )}

      {calcOpen && (
        <ChargeCalculatorModal
          initialCharge={charge}
          onApply={(v) => { setCharge(v); setCalcOpen(false); }}
          onClose={() => setCalcOpen(false)}
        />
      )}
    </>
  );
}
