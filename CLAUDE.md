# CLAUDE.md — Planif Escalade

Contexte technique et état du projet pour les sessions Claude Code.

## Stack

- **React 19 + Vite 7** — single-file app : `src/climbing-planner.jsx`
- **PWA** via `vite-plugin-pwa` (service worker, icônes, manifest)
- **Supabase** (`@supabase/supabase-js`) — Auth magic link + sync cloud (tables `climbing_plans`, `coach_athletes`, `sessions_catalog`, `session_blocks`, `session_feedbacks`)
- **Recharts** — graphiques stats (LineChart, BarChart)
- **Deploy** : Vercel, auto-deploy sur push `master` → https://climbing-planner-theta.vercel.app/

## Architecture de l'app

Tout est dans **`src/climbing-planner.jsx`** (~8 100 lignes). Ordre des sections :

```
SUPABASE CLIENT
DATA (constantes SESSIONS, DEFAULT_MESOCYCLES)
STORAGE (loadData, saveData, useSupabaseSync)
HOOKS :
  ├─ useSessionsCatalog        — CRUD sessions_catalog (bibliothèque coach)
  ├─ useSessionBlocks          — CRUD session_blocks (blocs multi-séances)
  ├─ useCommunitySessionsSync  — sync séances communautaires (lecture seule)
  └─ useCoachAthletes          — relations coach-athlète (coach_athletes)
HELPERS (weekKey, addDays, getMondayOf, formatDate…)
STYLES (makeStyles → objet avec tous les styles inline, thème dark/light)
COMPONENTS :
  ├─ PhotoCropModal          — recadrage/zoom avatar (useRef cropAreaRef, ResizeObserver, non-passive wheel/touch)
  ├─ DayColumn               — colonne d'un jour (semaine), prop hasCreatine
  ├─ WeekView                — vue semaine
  ├─ MonthView               — vue mois (pas de barre d'intensité)
  ├─ YearView                — vue année
  ├─ CyclesTimeline          — timeline visuelle des mésocycles (ResizeObserver fitLabel)
  ├─ CyclesEditor            — éditeur mésocycles/microcycles
  ├─ CyclesView              — wrapper locked/unlocked
  ├─ DailyNotesSection       — notes + checkbox créatine (toujours visible, décochée par défaut)
  ├─ Dashboard               — stats + HooperSection + graphiques poids & Hooper
  ├─ DayLogModal             — modal journal quotidien (note, créatine, poids, Hooper) depuis DayColumn
  ├─ SessionComposerModal    — composition de séances à partir de blocs
  ├─ FeedbackHistoryModal    — historique des feedbacks athlète par bloc/séance
  ├─ SuspensionInfoCard      — affichage config d'un bloc Suspension
  ├─ SuspensionSummaryChips  — chips résumé config Suspension
  ├─ CoachAthletesSection    — section "Mes athlètes" dans ProfileView (coach/auto uniquement)
  ├─ ProfileView             — avatar, infos, thème, gestion athlètes
  ├─ CoachLibraryView        — bibliothèque de séances (vue "library", coach uniquement)
  ├─ AccueilView             — page d'accueil (vue par défaut au démarrage)
  ├─ RoleOnboardingModal     — choix du rôle au 1er login
  └─ ClimbingPlanner         — composant racine, state global
```

## Données

### localStorage
- Clé : `climbing_planner_v1` — objet JSON principal
- Clé legacy supprimée : `climbing_planner_photo` (migré → `data.profile.avatarDataUrl`)
- **En vue athlète** : aucune écriture en localStorage (données de l'athlète uniquement en Supabase)

### Structure `data`
```js
{
  weeks: {},           // { "2026-W10": [sessionId, ...] }
  weekMeta: {},        // { "2026-W10": { mesocycle, microcycle, objective, rpe } }
  customSessions: [],  // sessions personnalisées (legacy, migré → sessions_catalog)
  mesocycles: [],      // DEFAULT_MESOCYCLES
  sleep: [],           // [{ date, duration, quality, deep, light, rem }]
  hooper: [],          // [{ date, fatigue, stress, douleur, humeur, sommeil }]
  notes: {},           // { "2026-03-09": "texte" }
  creatine: {},        // { "2026-03-09": true }
  weight: {},          // { "2026-03-09": 70.5 }
  profile: {           // avatar, nom, objectif, thème, rôle, etc.
    avatarDataUrl: "",
    role: null,        // null | "coach" | "athlete" | "auto"
    firstName: "",
    lastName: "",
    // PAS de creatineEnabled (supprimé)
  },
  customCycles: [],    // cycles personnalisés (ex: créatine, suppléments)
  cyclesLocked: false,
}
```

### Supabase — tables

| Table | Contenu | RLS |
|---|---|---|
| `climbing_plans` | `user_id` UNIQUE, `data` JSONB, `status` (rôle), `first_name`, `last_name`, `updated_at` | own row + coach peut lire/écrire les lignes de ses athlètes |
| `coach_athletes` | `coach_id`, `athlete_id`, `created_at` — relation M:N unique | coach gère ses propres lignes |
| `sessions_catalog` | bibliothèque de séances du coach | own rows |
| `session_blocks` | blocs de séances (multi-séances groupées) | own rows |
| `session_feedbacks` | retours athlète sur les séances | authenticated read-all |

- Auth : magic link email + password, `persistSession: true`, `storageKey: "climbing-planner-auth"`
- Sync : debounce 1500ms, upsert on conflict user_id
- Photo stockée dans `data.profile.avatarDataUrl` (base64) → sync automatique via upsert
- Colonne `status` de `climbing_plans` = rôle de l'utilisateur (écrit via `writeStatus()`, jamais écrasé par `saveToCloud`)

### Supabase — RPC

| Fonction | Description |
|---|---|
| `search_athletes(search_term)` | Retourne `user_id, first_name, last_name` des non-coaches. `SECURITY DEFINER` pour contourner RLS sur la recherche. |

## Système de rôles

| Rôle (`profile.role`) | Comportement |
|---|---|
| `null` | Athlète solo — accès complet à son propre planning |
| `"athlete"` | Athlète suivi — cycles en lecture seule (`canEdit = false`) |
| `"coach"` | Coach — accès à la bibliothèque de séances + vue des athlètes |
| `"auto"` | Athlète autonome — expérimental, réglable en DB uniquement — même accès que coach |

- Le rôle est choisi une seule fois via `RoleOnboardingModal` (1er login, quand `!("role" in profile)`)
- `isCoach = role === "coach"`, `isAuto = role === "auto"`, `hasCoachFeatures = isCoach || isAuto`
- `canEdit = role !== "athlete"` (cycles, mésocycles)

## Système coach-athlète

### Vue athlète (coach regardant les données d'un athlète)
- **Déclenchement** : bouton "Voir" dans ProfileView > section "Mes athlètes"
- **`switchToAthlete(athlete)`** : sauvegarde les données coach dans `coachDataRef`, charge les données Supabase de l'athlète via `.eq("user_id", athlete.userId)`, remplace `data` state
- **`switchBackToCoach()`** : restaure depuis `coachDataRef`, efface `viewingAthlete`
- **Auto-save modifié** : quand `viewingAthlete` est set → `saveToCloud(data, viewingAthlete.userId)` (jamais localStorage, jamais la ligne du coach)
- **Bandeau** : barre verte "VUE ATHLÈTE — Prénom Nom" avec bouton "← Retour à ma vue"

### Gestion des athlètes (`useCoachAthletes`)
- Fetch : `coach_athletes` JOIN `climbing_plans` (deux requêtes)
- Recherche : RPC `search_athletes(term)` → athlètes non-coach matchant le nom
- Ajout : upsert dans `coach_athletes` (onConflict coach_id,athlete_id)
- Retrait : delete par `id` (clé primaire de `coach_athletes`)

## Variables d'environnement

`.env.local` (ne pas committer) :
```
VITE_SUPABASE_URL=https://zkoiykpiymvwioihnhhp.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon>
```
Même chose dans Vercel Dashboard > Settings > Environment Variables.

## Vues disponibles

| viewMode | Description | Accès |
|---|---|---|
| `"accueil"` | Page d'accueil — **vue par défaut** au démarrage | tous |
| `"week"` | Vue semaine (7 colonnes DayColumn) | tous |
| `"month"` | Vue mois (grille calendrier) | tous |
| `"year"` | Vue année (12 mois) | tous |
| `"dash"` | Statistiques + notes + Hooper + graphiques poids/Hooper | tous |
| `"cycles"` | CyclesTimeline ou CyclesEditor | tous (lecture seule si athlete) |
| `"profil"` | Profil utilisateur + gestion athlètes | tous |
| `"library"` | Bibliothèque de séances | coach / auto uniquement |

Navigation : les vues calendrier (week/month/year) sont regroupées sous un bouton "Calendrier" avec sous-nav.

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
`makeStyles(isDark)` retourne l'objet de styles complet (renommé depuis `getStyles`)

### Typographie
- **Cormorant Garamond** (serif) pour les titres : `appTitle`, `weekRange`, `dashSectionTitle`, `modalTitle`
- **Inter** pour le corps de texte

### Blocs Suspension
- Config structurée : `{ type: "suspension", config: { ... } }` avec poids, durée, série, etc.
- `SuspensionInfoCard` : résumé visuel de la config dans `SessionModal`
- Feedback poids + graphique évolution dans `FeedbackHistoryModal`
- Charge rating activé pour Suspension et Retour au calme

### DayLogModal
- Modale quotidienne accessible depuis chaque colonne `DayColumn` (bouton journal)
- Regroupe : note du jour, checkbox créatine, poids, Hooper
- Bouton "Enregistrer" dirty-aware (désactivé si pas de changement)

### Dashboard — graphiques
- Graphique poids : scaffold période complète avec données manquantes nulles
- Graphique Hooper : barres (BarChart) au lieu de lignes, scaffold identique
- Sélecteur de plage Sem / Mois / An pour tous les graphiques stats

### Auto-save (useEffect sur `data`)
```js
useEffect(() => {
  if (viewingAthlete) {
    saveToCloud(data, viewingAthlete.userId); // sauvegarde sur la ligne de l'athlète
  } else {
    saveData(data);                           // localStorage
    saveToCloud(data, session?.user?.id);     // Supabase propre
  }
}, [data]);
```

Règles de sync (refonte mars 2026) :
- **Cloud autoritaire** : pas de comparaison timestamp local/cloud (supprimé, trop fragile)
- **`_pendingSync` flag** : dirty flag dans `pendingSaveRef` pour flush via `pagehide`
- **Skip premier render** : pas de save automatique au montage (évite d'écraser le cloud avec données locales stale)
- **Flush `pagehide`** : `navigator.sendBeacon` avec keepalive pour sauvegarder en quittant la page
- **Race condition JWT** : ignorée si le token a expiré entre-temps (pas de corruption cloud)

## Migrations SQL

Fichier : `supabase/migrations/20260313_coach_athletes.sql` (**appliquée en prod**)
- Table `coach_athletes` + RLS
- Policies additives sur `climbing_plans` pour accès coach
- RPC `search_athletes`
- Schéma complet avec DROP IF EXISTS + GRANT authenticated

## Commandes

```bash
npm run dev      # dev server http://localhost:5173
npm run build    # build prod dans dist/
npm run lint     # ESLint
```

## Idées futures / backlog

- Sync Garmin Connect pour le sommeil (voir `garmin-sync-notes.md` — bloqué auth)
- Import CSV sommeil Garmin (bouton déjà présent dans stats)
- Notifications push PWA
- Vue "tableau de bord coach" : résumé de tous les athlètes sur une seule page
- Invitation coach→athlète par lien (au lieu de recherche par nom)
