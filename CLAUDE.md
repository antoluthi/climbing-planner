# CLAUDE.md — Planif Escalade

Contexte technique et état du projet pour les sessions Claude Code.

## Stack

- **React 19 + Vite 7** — architecture modulaire multi-fichiers
- **PWA** via `vite-plugin-pwa` (service worker, icônes, manifest)
- **Supabase** (`@supabase/supabase-js`) — Auth magic link + sync cloud (tables `climbing_plans`, `coach_athletes`, `sessions_catalog`, `session_feedbacks`)
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
│   ├── constants.js              — MESOCYCLES, DEFAULT_MESOCYCLES, DAYS, CUSTOM_CYCLE_COLORS,
│   │                               isDateInCustomCycle, getCustomCyclesForDate,
│   │                               getDayLogWarning, getMesoColor, getMesoForDate
│   ├── helpers.js                — getMondayOf, addDays, formatDate, weekKey, localDateStr, calcEndTime,
│   │                               migrateWeekKeys, isEventItem, getDaySessions, getDayCharge, getMonthWeeks
│   ├── charge.js                 — échelle de charge unifiée 0-10 : normalizeCharge10,
│   │                               getSessionCharge, climbingCharge10, RPE_LABELS, chargeLabel, getChargeColor,
│   │                               VOLUME_ZONES, INTENSITY_ZONES, COMPLEXITY_ZONES, getNbMouvementsZone
│   ├── storage.js                — generateId, loadData, saveData (localStorage)
│   ├── pace.js                   — temps · distance · allure/vitesse liés (parse, format, calcul)
│   ├── garmin-csv.js             — parseGarminSleepCSV (formats KV et tabulaire)
│   ├── session-feedbacks.js      — upsertSessionFeedback (miroir Supabase des ressentis)
│   ├── sync-meta.js              — marqueur de synchro local + decideSync (pull/push/reset/idle)
│   └── hooper.js                 — hooperLabel, hooperColor
│
├── theme/
│   ├── palette.js                — SOURCE UNIQUE des couleurs (PALETTE.light/dark, colors(), DATA)
│   ├── ThemeContext.jsx           — ThemeContext + useThemeCtx()
│   └── makeStyles.js             — makeStyles(isDark) → objet styles inline complet
│
├── hooks/
│   ├── useWindowWidth.js          — largeur fenêtre réactive
│   ├── useSwipe.js                — balayage horizontal (onglets / périodes)
│   ├── useSupabaseSync.js         — session auth, loadFromCloud, saveToCloud, uploadNow, writeStatus
│   ├── useCommunitySessionsSync.js — sync séances communautaires (lecture seule)
│   ├── useSessionsCatalog.js      — CRUD sessions_catalog (bibliothèque de modèles)
│   └── useCoachAthletes.js        — relations coach-athlète (coach_athletes)
│
└── components/
    ├── ui/SwipePager.jsx          — carrousel de pages (balayage au doigt entre onglets)
    ├── Logo.jsx                   — ClimbingPlannerLogo (SVG hexagone)
    ├── SyncButtons.jsx            — boutons export/import/sync
    ├── AuthPanel.jsx              — panneau auth (password + magic link)
    ├── RoleOnboardingModal.jsx    — choix du rôle au 1er login
    ├── RoleSection.jsx            — changement de rôle depuis le compte
    ├── RichText.jsx               — rendu texte riche (markdown-like)
    ├── ConfirmModal.jsx           — dialogue de confirmation suppression
    ├── session/SessionFormModal.jsx     — ajout/modification d'une séance (étape 1)
    ├── session/SessionScheduleModal.jsx — heure + lieu (étape 2)
    ├── session/SessionLibraryModal.jsx  — recherche dans la bibliothèque
    ├── session/ChargeCalculatorModal.jsx — calculateur de charge (escalade)
    ├── session/EventDetailModal.jsx     — aperçu d'une échéance (décompte, charge, note)
    ├── SessionModal.jsx           — modal détail séance (feedback, déplacement)
    ├── FeedbackHistoryModal.jsx   — historique des retours par séance
    ├── DayColumn.jsx              — colonne d'un jour (vue semaine)
    ├── MonthView.jsx              — vue mois (grille calendrier)
    ├── YearView.jsx               — vue année (12 mois)
    ├── CyclesTimeline.jsx         — timeline visuelle des mésocycles
    ├── CyclesView.jsx             — wrapper locked/unlocked cycles
    ├── CustomCycleModal.jsx       — formulaire cycle personnalisé
    ├── DailyNotesSection.jsx      — notes + checkbox créatine
    ├── DayLogModal.jsx            — assistant journal quotidien (Hooper → poids → notes)
    ├── Dashboard.jsx              — stats + graphiques poids & Hooper
    ├── ActivityHeatmap.jsx        — heatmap d'activité GitHub-style
    ├── SleepSection.jsx           — section sommeil (graphiques, import CSV)
    ├── HooperSection.jsx          — section indice Hooper
    ├── WeightSection.jsx          — section poids
    ├── PhotoCropModal.jsx         — recadrage/zoom avatar
    ├── CoachAthletesSection.jsx   — section "Mes athlètes" dans ProfileView
    ├── CalendarSyncSection.jsx    — section sync calendrier (CalDAV/iCal)
    ├── ProfileView.jsx            — avatar, infos, thème, gestion athlètes
    ├── CoachLibraryView.jsx       — bibliothèque de séances modèles
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
    role: null,        // null | "coach" | "athlete"
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
| `session_blocks` | **plus utilisée** — la table reste, l'app n'y touche plus (blocs supprimés) | own rows |
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

- **Source de vérité** : colonne `status` de `climbing_plans`. Valeurs :
  `'coach'` | `'athlete'` | `'solo'` (athlète solo explicite) | `NULL` (= n'a
  **jamais** choisi → `RoleOnboardingModal` s'affiche). `'solo'` se traduit par
  `role: null` dans l'app.
- `'auto'` (« athlète autonome ») a été **retiré** : aucun chemin de code ne le
  distinguait de `'coach'`. `roleFromStatus()` (`DataProvider`) le lit comme
  coach — c'est le seul endroit qui connaît encore cette valeur — et la
  migration `20260825` aligne les lignes restées à `'auto'`. La contrainte CHECK
  continue de l'accepter : la resserrer casserait la mise à jour d'une ligne qui
  aurait échappé à l'UPDATE.
- Le rôle du **compte** (`accountRole`, résolu dans `DataProvider` depuis la
  même requête que le chargement cloud — plus de course avec le premier upload)
  pilote toutes les permissions : `isCoach`/`isAuto`/`hasCoachFeatures`/`canEdit`
  dérivent de `accountRole`, **jamais de `data.profile.role`** (qui devient
  celui de l'athlète en vue athlète — le coach garde bibliothèque, picker coach
  et édition des cycles pendant la vue athlète).
- Deux entrées vers `chooseRole()` (qui écrit `status`, `'solo'` pour null) :
  `RoleOnboardingModal` au premier login, puis **`RoleSection` dans Compte**, où
  le rôle se change ensuite librement. Mêmes trois rôles des deux côtés.
  Masquée en vue athlète : le profil affiché n'est pas celui du compte.
- `RoleSection` se lit en **trois temps** — on change de rôle une fois tous les
  jamais, donc le compte n'affiche que l'état : rôle courant + « Modifier le
  rôle » → écran des conséquences (ce que chaque rôle change, l'encart
  d'avertissement si des athlètes sont rattachés) → sélection. Le cas
  destructif (quitter coach avec des athlètes) referme le sélecteur et demande
  une dernière confirmation ; annuler ramène au choix.
- `chooseRole()` bascule l'affichage tout de suite mais **revient en arrière si
  la base refuse** : un rôle absent de `status` n'existe pas — le prochain
  démarrage, ou l'autre appareil, l'ignorerait. `writeStatus()` remonte donc
  son erreur au lieu de l'avaler.
- **Quitter le rôle coach supprime les liens `coach_athletes`** (après
  confirmation). C'est la ligne de liaison, pas `status`, que lit la RLS pour
  autoriser un coach à ouvrir le planning d'un athlète : la garder laisserait
  un accès en écriture à quelqu'un qui n'est plus coach, sans rien dans
  l'interface pour s'en apercevoir. Être coach **et** suivi reste permis (un
  coach peut avoir son propre coach) ; seule conséquence, un coach n'apparaît
  plus dans `search_athletes`.

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
- Recherche : RPC `search_athletes(term)` (statuts null/'athlete'/'solo', plus
  'auto' pour les lignes historiques)
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
| `"year"` | Vue année (12 mois) — mois courant encadré à l'accent et **centré à l'ouverture** (`scrollIntoView({ block: "center" })`), aujourd'hui encadré dans sa case | tous |
| `"dash"` | Statistiques + notes + Hooper + graphiques poids/Hooper | tous |
| `"cycles"` | CyclesTimeline ou CyclesEditor | tous (lecture seule si athlete) |
| `"profil"` | Profil utilisateur + gestion athlètes | tous |
| `"library"` | Bibliothèque de séances modèles | tous (catalogue commun) |

Navigation : les vues calendrier (week/month/year) sont regroupées sous un bouton "Calendrier" avec sous-nav.

## Navigation date

- Flèches ← → : changer de période
- **Clic sur le label de date** (ex: "9 mars – 15 mars", "2028") → retour à la
  période courante **sans changer de vue** : depuis 2028 en vue année on revient
  à l'année en cours, toujours en année. Câblé des deux côtés — en-tête bureau
  du shell et `CalendarView.jsx` (mobile), qui remet aussi le jour sélectionné
  sur aujourd'hui.
  - Curseur `pointer` uniquement si on n'est pas déjà sur la période en cours
  - Tooltip : "Aller à la semaine en cours" / "Aller au mois en cours" / "Aller à l'année en cours"
  - Quand on y est : mention « Semaine / Mois / Année en cours » sous le libellé

## Navigation par swipe (mobile)

Deux zones distinctes, pour qu'un geste ne fasse jamais deux choses.

### Carrousel de pages (`components/ui/SwipePager.jsx`)

Balayage sur la page → onglet précédent/suivant dans l'ordre de la barre du bas
(Accueil, Calendrier, Cycles, Stats, Bibliothèque). **La page suit le doigt** :
trois calques au plus (précédent, courant, suivant) superposés en absolu, seul
le courant monté au repos.

- Voisins montés dès `|dx| ≥ 4 px` et `|dx| > |dy|` — un tap ne monte rien.
- Axe verrouillé à 10 px, horizontal si `|dx| > |dy| × 1,2` ; sinon le geste
  revient au défilement vertical.
- Validation si le déplacement dépasse 25 % de la largeur **ou** si la vitesse
  (moyennée sur 100 ms) dépasse 0,35 px/ms. On valide *puis* on anime (260 ms) :
  l'indicateur de la barre du bas s'allume quand la page part.
- Bords de la liste : résistance élastique (× 0,35), pas de bouclage.
- `prefers-reduced-motion` supprime l'animation de fin.

Deux pièges consignés en tête du fichier :

1. **`transform` et `position: fixed`** — un `transform` sur un ancêtre fait que
   ses descendants `fixed` (toutes les modales, rendues dans les vues) se
   positionnent par rapport à lui. Au repos, le calque courant est donc en
   `transform: none`, jamais `translate3d(0,0,0)`.
2. **React n'écrit pas le `transform`** : il est piloté à la main dans `place()`.
   Le doubler en style inline ferait que React, croyant la valeur inchangée,
   laisserait un transform périmé.

Conséquences sur la mise en page mobile (`shells/AutonomousShell.jsx`) : le
conteneur de l'app ne défile plus (`height: 100dvh; overflow: hidden`), **chaque
calque défile pour son propre compte**, et la barre du bas — `position: fixed`,
hors du pager — ne bouge jamais. `renderTab(mode)` sait dessiner n'importe quel
onglet (le pager en affiche deux à la fois) ; le compte reste hors du carrousel.

**Aucun geste quand une modale est ouverte** : le pager consulte
`hasOpenLayers()` (pile de calques de `lib/native.js`, alimentée par
`ui/Modal.jsx`, `SessionModal` et `DayLogModal`) et reçoit en plus
`enabled={!overlayOpen}` du shell, pour les quatre feuilles qui ne passent pas
par `ui/Modal.jsx`.

### Grille du calendrier

Balayage sur la grille → période précédente/suivante, **d'un coup** (pas de
carrousel ici). La grille passe `stopPropagation: true` à `useSwipe`, et le
pager ignore de son côté tout geste démarré dans `[data-swipe="calendar-grid"]`
— le `stopPropagation` d'un handler React ne peut pas arrêter un listener posé
plus bas dans l'arbre.

`hooks/useSwipe.js` : seuil 60 px, dominance horizontale 1,5×. Les deux zones
portent un attribut `data-swipe` (`page` / `calendar-grid`), et chaque calque du
pager un `data-pane` — utilisés par les tests pilotés.

## Système de charge unifié (0-10)

Toutes les disciplines partagent la même unité : **la charge de séance 0-10**
(équivalente au RPE Borg CR-10). Refonte juillet 2026 (`lib/charge.js`).

- **Escalade** : le calculateur spécifique (nb mouvements → zone volume 1-6 ×
  intensité 1-6 × complexité 1-6) reste un *assistant* — son produit est ramené
  sur 0-10 via `climbingCharge10()` (diviseur 4.8, calibré sur l'usage réel de
  l'ancienne échelle : bloc Grimpe type 24 → 5, séance complète 36 → 8).
- **Saisie** : une séance porte une charge 0-10, réglée au curseur. Pour
  l'escalade, le calculateur (mouvements → volume × intensité × complexité) la
  propose.
- **`getSessionCharge(s)`** : charge effective = `feedback.rpe` (ressenti) >
  `chargePlanned` > `charge` legacy normalisée. **Séance manquée = 0.**
  Tous les totaux (jour, semaine, heatmap, Dashboard, AccueilView) passent par
  cette fonction — jamais de lecture directe de `s.charge` dans les vues.
- **Feedback athlète** : un seul slider "Charge ressentie" 1-10 dans
  `SessionModal`, **pré-rempli à la charge planifiée** — l'athlète confirme ou
  ajuste, avec delta affiché ("Plus/Moins soutenu que prévu (±n)").
  `feedback.adaptedCharge` n'est plus écrit (legacy migré → `rpe`).
- **Migration v5** (`storage.js`) : charges > 10 divisées par 4.8,
  `chargePlanned` recalculé, `adaptedCharge` → `rpe`. **v6** : les blocs sont
  repliés dans les notes de la séance puis supprimés. Les données non migrées
  (catalogue en DB) sont normalisées à la volée par `normalizeCharge10()` dans
  les affichages.
- **Couleurs** (`getChargeColor`) : 0 repos · ≤3 léger · ≤6 modéré · ≤9 soutenu
  · >9 très lourd (valable séance et total jour).
- **Libellés** (`RPE_LABELS` / `chargeLabel()`) : l'échelle Borg CR-10 en toutes
  lettres — 1 rien · 4 confortable · 7 dur · 10 maximal — affichée à côté du
  chiffre partout où la charge se règle (formulaire de séance, calculateur,
  retour de l'athlète).

## Ajout d'une séance

Deux étapes, deux modales, dans `components/session/` :

1. **`SessionFormModal.jsx` — quoi.** Le nom en haut à gauche, et juste à sa
   droite le bouton bibliothèque qui ouvre `SessionLibraryModal`. Sans modèle
   chargé, on choisit **d'abord la discipline** : c'est elle qui décide des
   champs.
   - escalade / renforcement / mobilité / autre : temps + charge (l'escalade a
     l'icône calculatrice → `ChargeCalculatorModal`) ;
   - course / trail : **temps · distance · allure** liés + D+ facultatif ;
   - vélo : **temps · distance · vitesse** liés + D+ facultatif.
   En pied, deux cases au niveau du bouton : « Événement » et « Enregistrer
   comme modèle » (c'est la seule chose qui écrit dans `sessions_catalog` —
   le catalogue ne se remplit plus tout seul). Elles n'ont de sens qu'à la
   création : `allowEvent` / `allowTemplate` les masquent quand on modifie une
   séance déjà planifiée ou une entrée de bibliothèque. Seule l'édition d'une
   échéance garde « Événement », pour pouvoir la reconvertir en séance.
2. **`SessionScheduleModal.jsx` — quand & où.** Heure de départ et lieu, avec
   une flèche de retour en haut à gauche.

**Rien n'est écrit avant la fin de la seconde étape** : le shell garde la séance
dans un `draft` et ne la pose dans `data.weeks` (ou `data.quickSessions` pour un
événement) qu'au « Terminer » ou au « Plus tard ». C'est ce qui permet à la
flèche de retour de rouvrir le formulaire tel quel, sans séance fantôme.

### Le trio lié (`lib/pace.js`)

`allure = durée / distance`, `vitesse = distance / (durée/60)`. En renseigner
deux calcule le troisième — celui qui se calcule est celui qui n'est pas dans
les deux derniers champs saisis (`computeThird`), et il s'affiche en accent.
`sanitizeClockInput` interdit les allures impossibles : taper `6:70` donne
`6:59`. Les durées circulent en **minutes fractionnaires** (5:30/km sur 8,4 km
ne tombe pas juste à la minute) ; `estimatedTime` reste en minutes entières
pour le reste de l'app.

### Échéances (case « Événement »)

Une échéance n'a **ni heure de départ ni durée** — ça n'a pas de sens sur deux
jours. Elle porte : des dates début/fin, une couleur, une **charge** et une
note. Pas de seconde étape non plus : le bouton enregistre directement.

- Stockage : `data.quickSessions` (jamais `data.weeks`).
- `isEventItem(s)` (`lib/helpers.js`) reconnaît une échéance ; `getDaySessions`
  la renvoie pour **chaque jour de sa plage**, pas seulement le premier — c'est
  ce qui la fait apparaître sur toute sa durée dans les calendriers.
- Dans le calendrier mobile elle ressort par un **fond teinté + un bandeau bas**
  à sa couleur (une séance n'a qu'un point) ; la ligne du jour affiche
  « Échéance · du 19 au 20 août ».
- Un clic dessus ouvre `EventDetailModal` — l'équivalent de `SessionModal`
  pour une échéance : décompte, dates, charge en toutes lettres, note, puis
  **Modifier** (qui ouvre le formulaire) ou **Supprimer**. Décocher
  « Événement » dans le formulaire la convertit en séance : elle quitte
  `quickSessions` et repasse par « quand & où » à sa date.
- L'accueil affiche la plus proche en **carte de décompte** (« J-12 »).

### Plus de blocs

Les blocs (Échauffement / Grimpe / Suspension…) ont été retirés de l'app :
composants, éditeurs, feedback par bloc, filtres de bibliothèque. La migration
`v6` de `storage.js` **replie leur contenu dans les notes** de la séance plutôt
que de le jeter. La table `session_blocks` existe toujours côté Supabase mais
plus personne ne l'écrit ni ne la lit.

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
  `PageTitle`, `SectionLabel`, `StatValue`, `SportBadge`, `SportDot`,
  `Segmented`, `PillToggle`, `RoundIconButton`, `Chip`, `RoundCheck`,
  `ProgressBar`, `InitialsAvatar`, `LibraryIcon`, plus les constantes
  `SANS` / `MONO`. `LibraryIcon` (deux livres droits, un troisième appuyé
  dessus) sert à la fois à la barre du bas et au bouton du formulaire de
  séance : une seule silhouette pour un seul endroit de l'app.
- Écrans refaits : **Accueil**, **Calendrier** (`CalendarView.jsx`, Semaine/Mois/
  Année, mobile uniquement — le bureau garde les vues historiques), **Compte**,
  **Bibliothèque** et le **journal du jour**.
- **Chaque page porte son titre** (`PageTitle` : 26 px, 800, `right` pour
  l'action principale) — Accueil excepté, qui a sa salutation. Il n'y a plus
  d'en-tête de shell sur mobile : ni logo, ni « PLANIF ESCALADE », ni total de
  charge, ni avatar au-dessus de Cycles, Stats et Bibliothèque. **La cloche de
  notifications et l'avatar vivent sur l'accueil**, à droite de la salutation —
  seuls points d'entrée vers le compte et les notifications. Le bureau, lui,
  garde son en-tête global.
- Le **contenu** de Cycles (éditeur de mésocycles) et de Stats hérite de la
  palette sans avoir été redessiné : cadres, champs et boutons y sont encore
  ceux d'avant la refonte.
- `RADIUS` (`theme/makeStyles.js`) : `pill` 999 · `control` 12 · `card` 16 ·
  `cardLg` 18. Les boutons partagés (primitives `ui/Ascent.jsx`, `ui/Button.jsx`)
  sont en pill ; cartes et badges gardent leurs rayons.
- Largeur des écrans refaits bornée à **600 px centrés** : sur un navigateur
  large les boutons ne s'étirent plus. Les vues bureau historiques (grille
  semaine, mois, année, stats) gardent la pleine largeur, elles en ont besoin.
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

### SessionModal — détail toujours déplié
Le détail d'une séance (récapitulatif, mesures, notes) est affiché d'emblée :
il n'y a plus de bouton « Voir le détail de la séance ». Le repli qui subsiste
dans cette modale est celui des **notes de retour** de l'athlète, qui est autre
chose.

### Retirer un statut de séance
Recliquer sur l'état déjà sélectionné (Fait / Adaptée / Manquée) le retire :
la séance redevient « pas encore réalisée ». À l'enregistrement, le ressenti
repasse alors à **`null`** — surtout pas à `{ done: false }`, qui est la marque
d'une séance **manquée** (`getSessionCharge` lui donne une charge de 0). Des
notes déjà écrites survivent seules, dans un ressenti neutre
(`{ status: null, done: null, notes }`) : les jeter sans prévenir serait une
perte silencieuse. Le miroir `session_feedbacks` est remis à zéro en même
temps.

### Où vit un ressenti (`lib/session-feedbacks.js`)
Deux destinations, et une seule fait autorité :

1. **Le planning** — `data.weeks[…].feedback`, donc le blob `climbing_plans.data`.
   C'est lui que lisent la charge, l'écart, la heatmap et l'accueil.
2. **`session_feedbacks`** — miroir plat, lu par l'historique « Retours
   athlètes » de la bibliothèque. Un échec ici ne perd jamais un ressenti.

La colonne `session_id` de ce miroir était restée en `INT` alors qu'un
identifiant de séance est une chaîne (`generateId()`) : chaque écriture
repartait en **400 / 22P02** et la table restait vide. La migration
`20260822` la passe en TEXT ; en attendant qu'elle soit appliquée,
`upsertSessionFeedback()` réécrit une fois sans l'identifiant (la clé
d'unicité est `user_id, session_name, feedback_date`, qui suffit).

Le slider de ressenti étant **pré-rempli à la charge planifiée**, confirmer
sans y toucher donne un écart de zéro : le graphe d'écart dessine alors un
trait sur la ligne du zéro (`DeviationBar`) plutôt que rien du tout.

### Rappels journaliers — câblage
Trois écrans les touchent : **Cycles** (créer / modifier / supprimer, que les
cycles soient verrouillés — `CyclesTimeline` — ou non — `CyclesView`),
**Compte** (activer / désactiver) et **Accueil** (cocher pour la journée).
Les handlers `addReminder` / `updateReminder` / `deleteReminder` sont nommés
une fois dans `AutonomousShell` et passés aux deux écrans : c'est l'oubli
d'`onUpdateReminder` côté Cycles qui faisait qu'un rappel se rouvrait, se
modifiait… et ne s'enregistrait jamais.

### DayLogModal (`components/DayLogModal.jsx`)
- Assistant en **trois étapes** : **Ressenti (Hooper) → Poids → Notes**, avec une
  barre de progression en haut de la modale et une navigation Précédent /
  Suivant en pied.
- Hooper en **curseurs** 1-7 (sommeil, fatigue, stress, courbatures) — l'échelle
  et le calcul ne changent pas : `total` = somme des quatre, lu par
  `hooperLabel()` / `hooperColor()`.
- Chaque étape **enregistre en la quittant** (`persistStep`) : fermer en route ne
  perd que l'étape courante.
- Les rappels n'y sont plus : leur place est l'écran Cycles.

### Dashboard — graphiques (`components/Dashboard.jsx`)
- **Périodes** : Semaine · Mois · Année, mêmes libellés et même `Segmented` que
  le calendrier. Un seul découpage sert toutes les séries (`getBuckets`) : la
  semaine se lit en jours, le mois en semaines, l'année en mois.
- **Écart de charge** (remplace le graphe « RPE moyen ») : `feedback.rpe −
  chargePlanned`, moyenné par période. Au-dessus de zéro la séance a été plus
  dure que prévu (charge sous-estimée), en dessous plus facile — deux teintes de
  part et d'autre d'une ligne de zéro, jamais un dégradé.
- **Superposition Hooper** (case à cocher) : la courbe Hooper s'ajoute sur un
  **axe droit à domaine fixe 4-28**, dans `hooperLine` — une troisième teinte
  choisie pour rester séparable de l'accent et de `info` en vision des couleurs
  déficiente (ΔE ≥ 21). Domaines bornés en dur des deux côtés : la relation
  visuelle entre les deux séries ne se déforme pas d'une période à l'autre.
- Graphique poids : scaffold période complète avec données manquantes nulles
- Graphique Hooper : barres (BarChart) au lieu de lignes, scaffold identique
- Sélecteur de plage Sem / Mois / An pour tous les graphiques stats
- **Heatmap d'activité** (`components/ActivityHeatmap.jsx`, GitHub-style) : 53 semaines × 7 jours, sélecteur de métrique (Charge / RPE / Hooper), labels mois et jours, tooltip hover, légende Moins/Plus, adaptatif mobile

### AccueilView — séances du jour
La carte liste **toutes** les séances de la journée, triées par heure de départ
(`minutesOfDay`, celles sans heure en fin de liste), l'heure en tête de ligne.
Chaque ligne ouvre sa séance : l'index passé à `onOpenSession` est celui
d'origine dans `data.weeks`, conservé avant le tri — sans quoi on ouvrirait la
voisine.

### Séance faite : elle s'efface
Une séance dont `feedback.done === true` passe en retrait — nom **barré**,
opacité 0,45 — comme une tâche cochée : ce qui reste à faire ressort seul.
Appliqué à l'accueil et au calendrier mobile (`CalendarView`). Dans la grille
bureau (`DayColumn`), dense et déjà colorée, seul le barré s'applique : le ☑
existant complète.

### AccueilView — en-tête (`components/AccueilView.jsx`)
De haut en bas : date, salutation, phrase contextuelle, puis **où l'on en est
dans le plan** (mésocycle · microcycle · rang de la semaine, à la couleur du
mésocycle, depuis `getMesoForDate`), puis la semaine — barres de charge,
initiales des jours, et une **pastille par séance** à la couleur de sa
discipline (celle de l'échéance pour une échéance, trois au plus par jour).

### AccueilView — phrase contextuelle
- Police **Newsreader** (serif élégant) pour la phrase d'accueil
- Salutation granulaire selon l'heure (matin, après-midi, soir, nuit)
- Phrase contextuelle dynamique : heure courante, complétion des séances du jour, contexte semaine (mésocycle, charge)
- Fonctions helpers `getGreeting()` et `getContextualPhrase()` définies localement dans le fichier

### Déplacement de séances (`components/SessionModal.jsx` — onglet "Déplacer")
- **Coach / solo** : sélecteur de date (navigation sem ← →) + heure → déplace directement la séance
  - "Enregistrer l'heure" si seul l'horaire change
  - "Déplacer la séance" si une autre journée est choisie
- **Athlète** : peut modifier l'heure directement ; pour un changement de date → envoie une suggestion au coach (semaine + jour + note optionnelle)
  - Suggestions en attente dans `data.moveSuggestions`
  - Coach voit un point orange sur l'onglet "Déplacer" + liste Accepter/Refuser
  - Badge `↔` sur la `DayColumn` pour les séances avec suggestion en attente

### Synchronisation (refonte août 2026)

Une seule règle, une seule fonction : `reconcile()` dans `context/DataProvider.jsx`.
Elle demande à la base la **date** de la ligne (`fetchCloudHead` — deux colonnes,
pas le blob), la compare au **marqueur local** (`lib/sync-meta.js`) et agit.

`decideSync()` est pure et sans réseau, c'est là qu'est toute la politique :

| Situation | Geste |
|---|---|
| Pas de ligne pour ce compte | `push` (ou `reset` si le local appartient à un autre compte) |
| Données locales d'un autre compte | `pull` — jamais l'inverse (garde anti-fuite) |
| `updated_at` cloud > `syncedAt` local | `pull`, sauf si le local a des modifications **plus récentes** → `push` |
| Cloud = notre dernier envoi | `push` si `dirtyAt`, sinon rien |

Le marqueur (`climbing_planner_sync_v1`) contient `{ userId, syncedAt, dirtyAt }` :
- `syncedAt` est l'`updated_at` **du serveur**, recopié tel quel après chaque
  échange réussi (l'upsert relit la colonne). Les deux dates comparées viennent
  donc de la même horloge — celle de Postgres, imposée par le trigger de la
  migration `20260823`. Comparaison en **instants** (`Date.parse`), jamais en
  chaînes : PostgREST rend `…+00:00`, l'app produit `…Z`.
- `dirtyAt` est l'heure locale de la **première** modification pas encore
  confirmée. Il survit à la fermeture de l'app : hors ligne, rien ne se perd.

`reconcile()` est appelée à la **connexion**, au **retour au premier plan**
(`visibilitychange` / `focus` / `online`, anti-rafale 3 s), sur **notification
temps réel**, et par le bouton « Charger depuis le cloud » (qui, lui, force le
pull). Le réveil rafraîchit aussi bibliothèque, athlètes et notifications.

Ce que ça répare :
- `loadFromCloud` sélectionnait la ligne **sans `eq(user_id)`**. RLS autorise un
  coach à lire les lignes de ses athlètes : la requête en renvoyait plusieurs,
  `maybeSingle()` partait en `PGRST116`, l'exception était avalée — **un coach
  avec un athlète ne chargeait jamais ses propres données**.
- Rien ne relisait la base après le démarrage. Dans l'APK la WebView survit à
  l'arrière-plan, et le temps réel ne délivre que connecté : deux appareils
  devaient être ouverts **en même temps** pour se synchroniser.
- L'auto-save du montage marquait les données « modifiées » alors que rien
  n'avait bougé — au démarrage suivant, ce faux « plus récent » écrasait le
  planning saisi ailleurs. D'où la comparaison par identité avec l'objet chargé
  au montage (et non un « premier passage », que le double montage de React en
  développement rendait inopérant).

Auto-save (`useEffect` sur `data`) : localStorage **toujours**, cloud seulement
une fois la première réconciliation faite (`syncReadyRef`) — sinon on pousserait
à l'aveugle par-dessus une ligne plus fraîche. En vue athlète, l'écriture part
sur la ligne de l'athlète et ne touche jamais le marqueur du coach.

Conservé de la version précédente : flush `pagehide` / `visibilitychange` par
`fetch({ keepalive: true })`, et l'abandon silencieux si le jeton a expiré (le
marqueur reste sale, la prochaine occasion réessaie).

L'état est visible dans **Compte > Données** : « Synchronisé il y a n min » ou
« Modifications en attente d'envoi ».

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
| `supabase/migrations/20260822_session_feedbacks_text_id.sql` | `session_feedbacks.session_id` INT → TEXT (les identifiants de séance sont des chaînes depuis `generateId()` : chaque upsert de ressenti partait en 400 / 22P02) | ✅ appliquée |
| `supabase/migrations/20260823_climbing_plans_updated_at.sql` | Trigger `BEFORE INSERT OR UPDATE` sur `climbing_plans` : `updated_at = now()` côté serveur — la synchronisation compare des dates, elles doivent venir d'une seule horloge | ✅ appliquée |
| `supabase/migrations/20260824_climbing_plans_status_solo.sql` | `CHECK` de `climbing_plans.status` élargi à `'solo'` — la contrainte d'origine ne connaissait que coach/athlete/auto, donc « athlète solo » repartait en 23514 et le rôle n'était jamais enregistré | ✅ appliquée |
| `supabase/migrations/20260825_drop_auto_role.sql` | `status = 'auto'` → `'coach'` — le rôle « autonome » ne se distinguait du coach nulle part et a été retiré de l'app | ⏳ **à coller** (facultatif : l'app lit déjà 'auto' comme coach) |

Statuts vérifiés le 20 août 2026 contre le projet Supabase (existence des
tables, colonnes, RPC et buckets via l'API REST) ; les trois d'août sur
confirmation de l'utilisateur, le 22. `supabase/MIGRATIONS-A-COLLER.sql`
concatène les 9 dernières dans l'ordre, idempotent et ré-exécutable.
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
