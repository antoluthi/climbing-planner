# CLAUDE.md — Planif Escalade

Contexte technique et état du projet pour les sessions Claude Code.

## Stack

- **React 19 + Vite 7** — single-file app : `src/climbing-planner.jsx`
- **PWA** via `vite-plugin-pwa` (service worker, icônes, manifest)
- **Supabase** (`@supabase/supabase-js`) — Auth magic link + sync cloud (table `climbing_plans`)
- **Recharts** — graphiques stats (LineChart, BarChart)
- **Deploy** : Vercel, auto-deploy sur push `master` → https://climbing-planner-theta.vercel.app/

## Architecture de l'app

Tout est dans **`src/climbing-planner.jsx`** (~4 300 lignes). Ordre des sections :

```
SUPABASE CLIENT
DATA (constantes SESSIONS, DEFAULT_MESOCYCLES)
STORAGE (loadData, saveData, useSupabaseSync)
HELPERS (weekKey, addDays, getMondayOf, formatDate…)
STYLES (getStyles → objet avec tous les styles inline, thème dark/light)
COMPONENTS :
  ├─ PhotoCropModal        — recadrage/zoom avatar (useRef cropAreaRef, ResizeObserver, non-passive wheel/touch)
  ├─ DayColumn             — colonne d'un jour (semaine), prop hasCreatine
  ├─ WeekView              — vue semaine
  ├─ MonthView             — vue mois (pas de barre d'intensité)
  ├─ YearView              — vue année
  ├─ CyclesTimeline        — timeline visuelle des mésocycles (ResizeObserver fitLabel)
  ├─ CyclesEditor          — éditeur mésocycles/microcycles
  ├─ CyclesView            — wrapper locked/unlocked
  ├─ DailyNotesSection     — notes + checkbox créatine (toujours visible, décochée par défaut)
  ├─ Dashboard             — stats + HooperSection
  ├─ ProfileView           — avatar, infos, thème
  └─ ClimbingPlanner       — composant racine, state global
```

## Données

### localStorage
- Clé : `climbing_planner_v1` — objet JSON principal
- Clé legacy supprimée : `climbing_planner_photo` (migré → `data.profile.avatarDataUrl`)

### Structure `data`
```js
{
  weeks: {},           // { "2026-W10": [sessionId, ...] }
  weekMeta: {},        // { "2026-W10": { mesocycle, microcycle, objective, rpe } }
  customSessions: [],  // sessions personnalisées
  mesocycles: [],      // DEFAULT_MESOCYCLES
  sleep: [],           // [{ date, duration, quality, deep, light, rem }]
  hooper: [],          // [{ date, fatigue, stress, douleur, humeur, sommeil }]
  notes: {},           // { "2026-03-09": "texte" }
  creatine: {},        // { "2026-03-09": true }
  profile: {           // avatar, nom, objectif, thème, etc.
    avatarDataUrl: "",
    // PAS de creatineEnabled (supprimé)
  },
  customCycles: [],    // cycles personnalisés (ex: créatine, suppléments)
  cyclesLocked: false,
}
```

### Supabase
- Table : `climbing_plans` (user_id UNIQUE, data JSONB, updated_at)
- RLS activé (read/insert/update own only)
- Auth : magic link email, `persistSession: true`, `storageKey: "climbing-planner-auth"`
- Sync : debounce 1500ms, upsert on conflict user_id
- Photo stockée dans `data.profile.avatarDataUrl` (base64) → sync automatique via upsert

## Variables d'environnement

`.env.local` (ne pas committer) :
```
VITE_SUPABASE_URL=https://zkoiykpiymvwioihnhhp.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon>
```
Même chose dans Vercel Dashboard > Settings > Environment Variables.

## Vues disponibles

| viewMode | Description |
|---|---|
| `"week"` | Vue semaine (7 colonnes DayColumn) |
| `"month"` | Vue mois (grille calendrier) |
| `"year"` | Vue année (12 mois) |
| `"dash"` | Statistiques + notes + Hooper |
| `"cycles"` | CyclesTimeline ou CyclesEditor |
| `"profil"` | Profil utilisateur |

## Navigation date

- Flèches ← → : changer de période
- **Clic sur le label de date** (ex: "9 mars – 15 mars") → `setCurrentDate(new Date())` pour revenir à la période actuelle
  - Curseur `pointer` uniquement si on n'est pas déjà sur la période en cours
  - Tooltip : "Aller à la semaine en cours" / "Aller au mois en cours" / "Aller à l'année en cours"

## Points techniques importants

### CyclesTimeline — texte adaptatif
`ResizeObserver` sur le conteneur mesure la largeur réelle en pixels.
`fitLabel(label, px)` calcule combien de caractères rentrent (~5.5px/char à font-size 9, padding 12px).
- Tout rentre → texte complet
- Pas assez → `label.slice(0, n-1) + "…"`
- 1 char → première lettre seulement
- < 18px → petit trait coloré (repère visuel)

### PhotoCropModal — zoom/drag
- `cropAreaRef` + listeners non-passifs via `useEffect` (`{ passive: false }`) pour wheel/touchmove
- SVG d'overlay inside le div de crop (position:absolute, pointerEvents:none) — PAS en sibling

### Créatine
- Checkbox toujours visible dans `DailyNotesSection`, décochée par défaut
- Pas de toggle opt-in dans le profil
- `data.creatine[date] = true` quand cochée, supprimée quand décochée

### Thème
`ThemeContext` + `useThemeCtx()` — dark/light, accent vert
`getStyles(theme, isMobile)` retourne l'objet de styles complet

## Commandes

```bash
npm run dev      # dev server http://localhost:5173
npm run build    # build prod dans dist/
npm run lint     # ESLint
```

## Idées futures / backlog

- Sync Garmin Connect pour le sommeil (voir `garmin-sync-notes.md` — bloqué auth)
- Import CSV sommeil Garmin (déjà existant ?)
- Notifications push PWA
- Partage de planning entre utilisateurs
