# CLAUDE.md — Planif Escalade

Contexte technique et état du projet pour les sessions Claude Code.

## Stack

- **React 19 + Vite 7** — architecture modulaire multi-fichiers
- **PWA** via `vite-plugin-pwa` (service worker, icônes, manifest)
- **Supabase** (`@supabase/supabase-js`) — Auth magic link + sync cloud (tables `climbing_plans`, `coach_athletes`, `sessions_catalog`, `session_blocks`, `session_feedbacks`)
- **Recharts** — graphiques stats (LineChart, BarChart)
- **Deploy** : Vercel, auto-deploy sur push `master` → https://climbing-planner-theta.vercel.app/

## Architecture de l'app

Le code source est organisé en modules dans `src/` :

```
src/
├── main.jsx                      — point d'entrée React
├── climbing-planner-new.jsx      — composant racine ClimbingPlanner (~1 078 lignes)
├── index.css                     — styles globaux
│
├── lib/                          — utilitaires et données
│   ├── supabase.js               — client Supabase singleton (default export)
│   ├── constants.js              — MESOCYCLES, DEFAULT_MESOCYCLES, DAYS, BLOCK_TYPES, GRIP_TYPES,
│   │                               DEFAULT_SUSPENSION_CONFIG, CUSTOM_CYCLE_COLORS,
│   │                               isDateInCustomCycle, getCustomCyclesForDate,
│   │                               getDayLogWarning, getMesoColor, getMesoForDate
│   ├── helpers.js                — getMondayOf, addDays, formatDate, weekKey, localDateStr,
│   │                               calcEndTime, migrateWeekKeys, getDaySessions, getDayCharge, getMonthWeeks
│   ├── charge.js                 — échelle de charge unifiée 0-10 : normalizeCharge10,
│   │                               getSessionCharge, climbingCharge10, RPE_LABELS, getChargeColor,
│   │                               VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES, getNbMouvementsZone
│   ├── storage.js                — generateId, loadData, saveData (localStorage)
│   ├── garmin-csv.js             — parseGarminSleepCSV (formats KV et tabulaire)
│   └── hooper.js                 — hooperLabel, hooperColor
│
├── theme/
│   ├── palette.js                — SOURCE UNIQUE des couleurs (PALETTE.light/dark, colors(), DATA)
│   ├── ThemeContext.jsx           — ThemeContext + useThemeCtx()
│   └── makeStyles.js             — makeStyles(isDark) → objet styles inline complet
│
├── hooks/
│   ├── useWindowWidth.js          — largeur fenêtre réactive
│   ├── useSupabaseSync.js         — session auth, loadFromCloud, saveToCloud, uploadNow, writeStatus
│   ├── useCommunitySessionsSync.js — sync séances communautaires (lecture seule)
│   ├── useSessionsCatalog.js      — CRUD sessions_catalog (bibliothèque coach)
│   ├── useSessionBlocks.js        — CRUD session_blocks (blocs multi-séances)
│   └── useCoachAthletes.js        — relations coach-athlète (coach_athletes)
│
└── components/
    ├── Logo.jsx                   — ClimbingPlannerLogo (SVG hexagone)
    ├── SyncButtons.jsx            — boutons export/import/sync
    ├── AuthPanel.jsx              — panneau auth (password + magic link)
    ├── RoleOnboardingModal.jsx    — choix du rôle au 1er login
    ├── RichText.jsx               — rendu texte riche (markdown-like)
    ├── ConfirmModal.jsx           — dialogue de confirmation suppression
    ├── CustomSessionModal.jsx     — formulaire séance personnalisée
    ├── BlockEditor.jsx            — éditeur de bloc dans une séance
    ├── BlockFormModal.jsx         — modal formulaire de bloc (avec config Suspension)
    ├── SessionBuilder.jsx         — construction de séance pas à pas
    ├── SessionPicker.jsx          — sélecteur de séance (athlète)
    ├── SessionModal.jsx           — modal détail séance (feedback, déplacement)
    ├── SessionComposerModal.jsx   — composition de séances à partir de blocs
    ├── CoachPickerModal.jsx       — sélecteur séance/bloc (coach)
    ├── FeedbackHistoryModal.jsx   — historique feedbacks athlète par bloc/séance
    ├── SuspensionInfoCard.jsx     — affichage config bloc Suspension
    ├── SuspensionSummaryChips.jsx — chips résumé config Suspension
    ├── DayColumn.jsx              — colonne d'un jour (vue semaine)
    ├── MonthView.jsx              — vue mois (grille calendrier)
    ├── YearView.jsx               — vue année (12 mois)
    ├── CyclesTimeline.jsx         — timeline visuelle des mésocycles
    ├── CyclesView.jsx             — wrapper locked/unlocked cycles
    ├── CustomCycleModal.jsx       — formulaire cycle personnalisé
    ├── DailyNotesSection.jsx      — notes + checkbox créatine
    ├── DayLogModal.jsx            — modal journal quotidien (note, créatine, poids, Hooper)
    ├── Dashboard.jsx              — stats + graphiques poids & Hooper
    ├── ActivityHeatmap.jsx        — heatmap d'activité GitHub-style
    ├── SleepSection.jsx           — section sommeil (graphiques, import CSV)
    ├── HooperSection.jsx          — section indice Hooper
    ├── WeightSection.jsx          — section poids
    ├── PhotoCropModal.jsx         — recadrage/zoom avatar
    ├── CoachAthletesSection.jsx   — section "Mes athlètes" dans ProfileView
    ├── CalendarSyncSection.jsx    — section sync calendrier (CalDAV/iCal)
    ├── ProfileView.jsx            — avatar, infos, thème, gestion athlètes
    ├── CoachLibraryView.jsx       — bibliothèque de séances (coach uniquement)
    ├── AccueilView.jsx            — page d'accueil (phrase contextuelle, police Newsreader)
    └── PublicPlanView.jsx         — vue publique lecture-seule (Planning d'Anto)
```

### Conventions d'import/export
- **Tous les modules** utilisent des **named exports** (`export function ...`)
- **Seule exception** : `lib/supabase.js` utilise un **default export**
- Les composants importent `useThemeCtx()` depuis `theme/ThemeContext.jsx` pour accéder aux styles
- Les hooks importent `supabase` directement depuis `lib/supabase.js`

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
    avatarUrl: "",     // URL publique Supabase Storage (bucket `avatars`)
    avatarDataUrl: "", // legacy base64 (migré au boot vers avatarUrl)
    role: null,        // null | "coach" | "athlete" | "auto"
    firstName: "",
    lastName: "",
  },
  customCycles: [],    // cycles personnalisés (ex: créatine, suppléments)
  cyclesLocked: false,
  moveSuggestions: [], // [{ id, sessionId, fromDate, targetDate, targetTime, note, athleteId }]
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
- Photo : URL dans `data.profile.avatarUrl` (uploaded vers le bucket Supabase Storage `avatars`, path `{userId}.{ext}`). Legacy `data.profile.avatarDataUrl` (base64) migré au 1er login authentifié vers Storage.
- Colonne `status` de `climbing_plans` = rôle de l'utilisateur (écrit via `writeStatus()`, jamais écrasé par `saveToCloud`)

### Supabase — RPC

| Fonction | Description |
|---|---|
| `search_athletes(search_term)` | Retourne `user_id, first_name, last_name` des non-coaches. `SECURITY DEFINER` pour contourner RLS sur la recherche. |

### Vue publique — Planning d'Anto

Migration `supabase/migrations/20260315_public_anto_plan.sql` : policy RLS autorisant `anon` à lire la ligne de l'utilisateur "Anto" dans `climbing_plans`.

- Bouton "Planning d'Anto" visible sur l'écran de connexion (non authentifié)
- `PublicPlanView` : navigation sem/mois/année en lecture seule, affiche uniquement noms et horaires des séances (pas de données personnelles)
- Aucune authentification requise

## Système de rôles

| Rôle (`profile.role`) | Comportement |
|---|---|
| `null` | Athlète solo — accès complet à son propre planning |
| `"athlete"` | Athlète suivi — cycles en lecture seule (`canEdit = false`) |
| `"coach"` | Coach — accès à la bibliothèque de séances + vue des athlètes |
| `"auto"` | Athlète autonome — expérimental, réglable en DB uniquement — même accès que coach |

- **Source de vérité** : colonne `status` de `climbing_plans`. Valeurs : `'coach'` |
  `'athlete'` | `'auto'` | `'solo'` (athlète solo explicite) | `NULL` (= n'a
  **jamais** choisi → `RoleOnboardingModal` s'affiche). `'solo'` se traduit par
  `role: null` dans l'app.
- Le rôle du **compte** (`accountRole`, résolu dans `DataProvider` depuis la
  même requête que le chargement cloud — plus de course avec le premier upload)
  pilote toutes les permissions : `isCoach`/`isAuto`/`hasCoachFeatures`/`canEdit`
  dérivent de `accountRole`, **jamais de `data.profile.role`** (qui devient
  celui de l'athlète en vue athlète — le coach garde bibliothèque, picker coach
  et édition des cycles pendant la vue athlète).
- Choix unique via `RoleOnboardingModal` → `chooseRole()` (écrit `status`,
  `'solo'` pour null).

## Système coach-athlète

### Vue athlète (coach regardant les données d'un athlète)
- **Déclenchement** : bouton "Voir" dans ProfileView > section "Mes athlètes"
- **`switchToAthlete(athlete)`** dans `climbing-planner-new.jsx` : sauvegarde les données coach dans `coachDataRef`, charge les données Supabase de l'athlète, remplace `data` state
- **`switchBackToCoach()`** : restaure depuis `coachDataRef`, efface `viewingAthlete`
- **Auto-save modifié** : quand `viewingAthlete` est set → `saveToCloud(data, viewingAthlete.userId)` (jamais localStorage, jamais la ligne du coach)
- **Bandeau** : barre brune "VUE ATHLÈTE — Prénom Nom" avec bouton "← Retour à ma vue"

### Gestion des athlètes (`hooks/useCoachAthletes.js` + `hooks/useNotifications.js`)
- **Consentement mutuel** (migration `20260715`) : le coach **invite**
  (notification `coach_request`), et c'est **l'athlète qui crée le lien** en
  acceptant depuis la cloche (RLS : INSERT `coach_athletes` réservé à
  `athlete_id = auth.uid()` — personne ne peut s'auto-déclarer coach).
- Recherche : RPC `search_athletes(term)` (statuts null/'athlete'/'auto'/'solo')
- Retrait : delete par les **deux** côtés (coach retire / athlète quitte via
  section "Mon coach" du profil, RPC `get_my_coaches()` pour les noms)
- États côté coach dans "Mes athlètes" : Inviter → "Invitation en attente…" →
  suivi ✓ (refresh temps réel à l'acceptation)

### Notifications (cloche 🔔 — `components/NotificationBell.jsx` / `NotificationsPanel.jsx`)
- Table `notifications` (RLS : destinataire lit/marque lu, émetteur insère/lit
  ses envois) + realtime (`postgres_changes`) → badge non-lus en direct
- Types : `coach_request` (actionnable Accepter/Refuser), `coach_accepted`,
  `coach_declined`, `plan_update`
- `plan_update` : envoyée à l'athlète quand le coach quitte la vue athlète si
  le planning a changé (diff des `weeks` + cycles dans `switchBackToCoach`,
  payload = semaines touchées)

## Variables d'environnement

`.env.local` (ne pas committer) :
```
VITE_SUPABASE_URL=https://zkoiykpiymvwioihnhhp.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon>
```
Même chose dans Vercel Dashboard > Settings > Environment Variables.

**Variable supplémentaire à ajouter dans Vercel uniquement** (utilisée par les fonctions serverless CalDAV/iCal, pas dans le frontend) :
```
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```
Sans cette variable, les endpoints `/api/caldav/*` et `/api/calendar/*` retournent 503.

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

## Système de charge unifié (0-10)

Toutes les disciplines partagent la même unité : **la charge de séance 0-10**
(équivalente au RPE Borg CR-10). Refonte juillet 2026 (`lib/charge.js`).

- **Escalade** : le calculateur spécifique (nb mouvements → zone volume 1-6 ×
  intensité 1-6 × complexité 1-6) reste un *assistant* — son produit est ramené
  sur 0-10 via `climbingCharge10()` (diviseur 4.8, calibré sur l'usage réel de
  l'ancienne échelle : bloc Grimpe type 24 → 5, séance complète 36 → 8).
- **Blocs** : chaque bloc porte une charge 0-10 ; séance détaillée = somme des
  blocs plafonnée à 10. Autres disciplines : saisie directe 0-10.
- **`getSessionCharge(s)`** : charge effective = `feedback.rpe` (ressenti) >
  `chargePlanned` > `charge` legacy normalisée. **Séance manquée = 0.**
  Tous les totaux (jour, semaine, heatmap, Dashboard, AccueilView) passent par
  cette fonction — jamais de lecture directe de `s.charge` dans les vues.
- **Feedback athlète** : un seul slider "Charge ressentie" 1-10 dans
  `SessionModal`, **pré-rempli à la charge planifiée** — l'athlète confirme ou
  ajuste, avec delta affiché ("Plus/Moins soutenu que prévu (±n)").
  `feedback.adaptedCharge` n'est plus écrit (legacy migré → `rpe`).
- **Migration v5** (`storage.js`) : charges > 10 divisées par 4.8 (séances +
  blocs), `chargePlanned` recalculé, `adaptedCharge` → `rpe`. Les données non
  migrées (catalogue coach en DB) sont normalisées à la volée par
  `normalizeCharge10()` dans les affichages.
- **Couleurs** (`getChargeColor`) : 0 repos · ≤3 léger · ≤6 modéré · ≤9 soutenu
  · >9 très lourd (valable séance et total jour).

## Points techniques importants

### CyclesTimeline — texte adaptatif (`components/CyclesTimeline.jsx`)
`ResizeObserver` sur le conteneur mesure la largeur réelle en pixels.
`fitLabel(label, px)` calcule combien de caractères rentrent (~5.5px/char à font-size 9, padding 12px).
- Tout rentre → texte complet
- Pas assez → `label.slice(0, n-1) + "…"`
- 1 char → première lettre seulement
- < 18px → petit trait coloré (repère visuel)

### PhotoCropModal — zoom/drag (`components/PhotoCropModal.jsx`)
- `cropAreaRef` + listeners non-passifs via `useEffect` (`{ passive: false }`) pour wheel/touchmove
- SVG d'overlay inside le div de crop (position:absolute, pointerEvents:none) — PAS en sibling

### Créatine
- Checkbox toujours visible dans `DailyNotesSection`, décochée par défaut
- Pas de toggle opt-in dans le profil
- `data.creatine[date] = true` quand cochée, supprimée quand décochée

### Thème (`theme/palette.js` + `makeStyles.js` + `ThemeContext.jsx`)

**`theme/palette.js` est le seul endroit où une couleur est définie.** Aucun
littéral hex ne subsiste ailleurs dans `src/` — c'est vérifiable :

```bash
grep -rn '#[0-9a-f]\{3,8\}' src/ --include=*.jsx --include=*.js | grep -v palette.js
```

- Design **« Ascent »** (prototype `Ascent Climbing Planner.dc.html`, à la racine —
  référence pour les écrans restant à refaire). Sombre = valeurs exactes du
  prototype : fond `#000`, cartes `#121212`, filets `rgba(255,255,255,0.08)`,
  accent orange `#FF4500`. Le clair en est la transposition (le prototype ne le
  décrit pas).
- `DATA.sports` : 7 couleurs de sport, **fixes dans les deux thèmes** car
  recopiées dans les séances. Escalade `#FF4500` · Course `#5FE0C0` · Vélo
  `#6C8CFF` · Trail `#E0C25F` · Renforcement `#A78BFF` · Mobilité `#FF8FA3` ·
  Autre `#9A9A9A`.
- `components/ui/Ascent.jsx` : primitives du système — `Card`, `RowCard`/`Row`,
  `SectionLabel`, `StatValue`, `SportBadge`, `SportDot`, `Segmented`,
  `PillToggle`, `RoundIconButton`, `Chip`, `RoundCheck`, `ProgressBar`,
  `InitialsAvatar`, plus les constantes `SANS` / `MONO`.
- Écrans refaits : **Accueil**, **Calendrier** (`CalendarView.jsx`, Mois/Semaine/
  Année, mobile uniquement — le bureau garde les vues historiques) et **Compte**.
  Cycles, Stats et Database héritent de la palette sans être redessinés.
- `PALETTE.light` / `PALETTE.dark` : mêmes clés, ~48 tokens sémantiques
  (`bg`, `surface`, `card`, `border`, `text`, `textMuted`, `accent`,
  `success`/`warn`/`danger`/`info` avec variantes `*Bg` / `*Border`…).
- `colors(isDark)` renvoie l'un des deux objets — ce sont des constantes de
  module, aucune allocation, appelable en plein rendu.
- `DATA` : valeurs porteuses de sens — rampes `charge` et `hooper`, rampes de
  la `heatmap`, séries `sleep` / `hands`, `blocks`, et surtout **`picker`**, la
  palette proposée à l'utilisateur. `picker` est **fixe** (identique dans les
  deux thèmes) parce que ces couleurs sont **enregistrées dans ses données** :
  une couleur choisie en clair ne doit pas changer en sombre.
- `makeStyles(isDark)` ne définit plus aucune couleur : il consomme la palette,
  garde quelques alias historiques (`btnBorder`, `todayBg`, `negativeColor`…) et
  expose la palette brute sous `styles.c` pour les composants qui n'ont que
  `styles`.
- Dans un composant : `colors(isDark).border`. Les `isDark ? "#x" : "#y"` sont
  proscrits.

Pour retoucher l'apparence : éditer `palette.js`, rien d'autre.

### Typographie
- **Cormorant Garamond** (serif) pour les titres : `appTitle`, `weekRange`, `dashSectionTitle`, `modalTitle`
- **Inter** pour le corps de texte

### Blocs Suspension (`components/SuspensionInfoCard.jsx`, `BlockFormModal.jsx`)
- Config structurée : `{ type: "suspension", config: { ... } }` avec poids, durée, série, etc.
- `SuspensionInfoCard` : résumé visuel de la config dans `SessionModal`
- Feedback poids + graphique évolution dans `FeedbackHistoryModal`
- Charge rating activé pour Suspension et Retour au calme

### DayLogModal (`components/DayLogModal.jsx`)
- Modale quotidienne accessible depuis chaque colonne `DayColumn` (bouton journal)
- Regroupe : note du jour, checkbox créatine, poids, Hooper
- Bouton "Enregistrer" dirty-aware (désactivé si pas de changement)

### Dashboard — graphiques (`components/Dashboard.jsx`)
- Graphique poids : scaffold période complète avec données manquantes nulles
- Graphique Hooper : barres (BarChart) au lieu de lignes, scaffold identique
- Sélecteur de plage Sem / Mois / An pour tous les graphiques stats
- **Heatmap d'activité** (`components/ActivityHeatmap.jsx`, GitHub-style) : 53 semaines × 7 jours, sélecteur de métrique (Charge / RPE / Hooper), labels mois et jours, tooltip hover, légende Moins/Plus, adaptatif mobile

### AccueilView — phrase contextuelle (`components/AccueilView.jsx`)
- Police **Newsreader** (serif élégant) pour la phrase d'accueil
- Salutation granulaire selon l'heure (matin, après-midi, soir, nuit)
- Phrase contextuelle dynamique : heure courante, complétion des séances du jour, contexte semaine (mésocycle, charge)
- Fonctions helpers `getGreeting()` et `getContextualPhrase()` définies localement dans le fichier

### Déplacement de séances (`components/SessionModal.jsx` — onglet "Déplacer")
- **Coach / solo / auto** : sélecteur de date (navigation sem ← →) + heure → déplace directement la séance
  - "Enregistrer l'heure" si seul l'horaire change
  - "Déplacer la séance" si une autre journée est choisie
- **Athlète** : peut modifier l'heure directement ; pour un changement de date → envoie une suggestion au coach (semaine + jour + note optionnelle)
  - Suggestions en attente dans `data.moveSuggestions`
  - Coach voit un point orange sur l'onglet "Déplacer" + liste Accepter/Refuser
  - Badge `↔` sur la `DayColumn` pour les séances avec suggestion en attente

### Auto-save (`climbing-planner-new.jsx`, useEffect sur `data`)
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

| Fichier | Contenu | Statut |
|---|---|---|
| `supabase/migrations/20260313_coach_athletes.sql` | Table `coach_athletes` + RLS, policies coach sur `climbing_plans`, RPC `search_athletes` | ✅ appliquée |
| `supabase/migrations/20260315_public_anto_plan.sql` | Policy RLS `anon` lecture-seule sur la ligne Anto dans `climbing_plans` | ✅ appliquée |
| `supabase/migrations/20260331_realtime_climbing_plans.sql` | `climbing_plans` ajoutée à la publication `supabase_realtime` (sync multi-appareils) | ✅ appliquée |
| `supabase/migrations/20260512_avatars_bucket.sql` | Bucket Storage `avatars` (public read, 2MB max, jpeg/png/webp) + policies INSERT/UPDATE/DELETE par owner sur `{auth.uid()}.{ext}` | ✅ appliquée |
| `supabase/migrations/20260513_shared_sessions_catalog.sql` | Bibliothèque commune : `sessions_catalog` + `session_blocks` → tout user authentifié peut SELECT/INSERT/UPDATE/DELETE toutes les rows. `user_id` / `created_by` conservés pour la traçabilité. | ✅ appliquée |
| `supabase/migrations/20260517_public_profiles.sql` | Colonne `climbing_plans.is_public` + policy `anon` lecture des lignes publiques (remplace la policy Anto) | ✅ appliquée |
| `supabase/migrations/20260715_notifications_coach_invites.sql` | Table `notifications` + realtime, `coach_athletes` en consentement mutuel (INSERT athlète only, SELECT/DELETE des deux côtés), `search_athletes` inclut 'solo', RPC `get_my_coaches` | ✅ appliquée |

Statuts vérifiés le 20 août 2026 contre le projet Supabase (existence des
tables, colonnes, RPC et buckets via l'API REST). `supabase/MIGRATIONS-A-COLLER.sql`
concatène les 5 dernières dans l'ordre, idempotent et ré-exécutable.
`supabase/legacy/` conserve les scripts SQL antérieurs aux migrations — dont
`supabase-community-sessions.sql`, seule définition de `community_sessions`
(utilisée par `useCommunitySessionsSync.js`), qui n'a pas d'équivalent en migration.

## APK Android (Capacitor)

- `appId` : `com.climbingplanner.app` · minSdk 24 · target/compile SDK 36
- **Intégration native** : `src/lib/native.js` — `isNative`, `PROD_ORIGIN` (les
  URL destinées à l'extérieur ne peuvent pas utiliser `window.location.origin`,
  qui vaut `https://localhost` dans la WebView), deep link d'auth
  (`com.climbingplanner.app://auth-callback`, en allowlist Supabase), bouton
  retour Android via pile de calques, `syncSystemBars()`.
- **Service worker** : désactivé pour le build natif (`vite build --mode capacitor`).
- **Sauvegarde Android** : `allowBackup="false"` — la session Supabase vit dans
  le localStorage de la WebView et ne doit pas partir dans les backups Google.
- **CI** (`.github/workflows/build-apk.yml`) : build sur `master` et `claude/**`,
  plus `workflow_dispatch`. Chaque run publie un artefact téléchargeable ; seul
  `master` écrase la release `latest-apk` (asset au nom stable
  `climbing-planner.apk` → lien d'installation permanent).
  Échoue volontairement si les secrets `VITE_SUPABASE_*` manquent.
- **Détection de mise à jour** (`src/lib/update-check.js` + `components/UpdateBanner.jsx`,
  monté dans `AutonomousShell`) : l'APK embarquant ses fichiers web, rien ne
  signalerait une nouvelle version. Au démarrage (natif uniquement), l'app lit le
  **titre de la release** `latest-apk` — format imposé par la CI
  « Climbing Planner 1.0.\<run\> » — et compare à `__APP_VERSION_CODE__`. L'API
  GitHub envoie `Access-Control-Allow-Origin: *` (un asset de release, non : sa
  redirection de téléchargement n'a aucun en-tête CORS), donc `fetch` suffit,
  sans plugin HTTP natif. Tout échec (hors-ligne, quota) est silencieux.
- **Versionnage** : `versionCode` = numéro de run GitHub, `versionName` =
  `1.0.<run>`, lus depuis `APK_VERSION_CODE` / `APK_VERSION_NAME` dans
  `android/app/build.gradle` (repli `1` / `1.0` en build local). La même valeur
  alimente `__APP_VERSION__` (`define` dans `vite.config.js`), affichée en pied
  de `ProfileView` — sur le web, repli sur le SHA court du commit.
- **Signature** : `signingConfig` release conditionnel — `android/app/build.gradle`
  ne le déclare que si `ANDROID_KEYSTORE_PATH` pointe vers un fichier existant
  (la CI y décode le secret `ANDROID_KEYSTORE_BASE64`). Sans keystore, la CI
  retombe sur `assembleDebug` : la clé de debug étant régénérée à chaque runner,
  les mises à jour ne s'installent alors pas par-dessus (« application non
  installée »). Les 4 secrets à créer sont listés dans `ACTIONS-A-FAIRE.md`.

## Commandes

```bash
npm run dev      # dev server http://localhost:5173
npm run build    # build prod dans dist/
npm run lint     # ESLint
npm run cap:sync # build mode capacitor (sans SW) + sync du projet android/
npm run cap:open # ouvre Android Studio
./run-android.sh # one-shot : émulateur/téléphone + build + install + lancement
```

## Idées futures / backlog

- Lazy-load des vues lourdes (Dashboard/Recharts) avec `React.lazy`
- Code-splitting via `manualChunks` (Recharts séparé du bundle principal)
- ~~Migrer le stockage avatar base64 → Supabase Storage (URL)~~ ✅ fait (avatar-storage.js + bucket `avatars`)
- Tests unitaires (helpers, charge, storage) + CI GitHub Actions
- Sync Garmin Connect pour le sommeil (voir `garmin-sync-notes.md` — bloqué auth)
- Import CSV sommeil Garmin (bouton déjà présent dans stats)
- Notifications push PWA
- Vue "tableau de bord coach" : résumé de tous les athlètes sur une seule page
- Invitation coach→athlète par lien (au lieu de recherche par nom)
