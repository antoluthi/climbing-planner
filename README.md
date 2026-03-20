# Planif Escalade

Application web de planification d'entraînement escalade — PWA, multi-appareils.

**Production :** https://climbing-planner-theta.vercel.app/

## Fonctionnalités

- **Vue semaine / mois / année** — planning des séances par jour
- **Cycles (mésocycles / microcycles)** — timeline visuelle, éditeur intégré
- **Statistiques** — charge d'entraînement, sommeil, indice Hooper, heatmap d'activité GitHub-style
- **Notes journalières + suivi créatine**
- **Profil** — avatar (recadrage/zoom), thème dark/light
- **Sync multi-appareils** via Supabase (magic link email + password)
- **PWA** — installable sur mobile et desktop, fonctionne offline
- **Système coach-athlète** — le coach voit et modifie les données de ses athlètes directement dans l'app
- **Déplacement de séances** — coach déplace directement, athlète envoie une suggestion au coach
- **Bibliothèque de séances** (coach) — création et réutilisation de séances personnalisées
- **Vue publique** — "Planning d'Anto" accessible sans compte depuis la page de connexion

## Stack

- React 19 + Vite 7
- Supabase (Auth + base de données)
- Recharts
- Déployé sur Vercel

## Architecture

Architecture modulaire en 44 fichiers :

```
src/
├── main.jsx                    # Point d'entrée
├── climbing-planner-new.jsx    # Composant racine + state global
├── lib/                        # Utilitaires & logique métier
│   ├── supabase.js             # Client Supabase singleton
│   ├── constants.js            # Constantes, mésocycles, types de blocs
│   ├── helpers.js              # Fonctions date/planning
│   ├── charge.js               # Calcul charge d'entraînement
│   ├── storage.js              # localStorage (load/save/generateId)
│   ├── hooper.js               # Labels & couleurs indice Hooper
│   └── garmin-csv.js           # Parseur CSV sommeil Garmin
├── theme/
│   ├── ThemeContext.jsx         # Context React dark/light
│   └── makeStyles.js           # Styles inline dynamiques
├── hooks/
│   ├── useSupabaseSync.js      # Sync cloud bidirectionnelle
│   ├── useSessionsCatalog.js   # CRUD bibliothèque séances
│   ├── useSessionBlocks.js     # CRUD blocs de séances
│   ├── useCommunitySessionsSync.js
│   ├── useCoachAthletes.js     # Relations coach-athlète
│   └── useWindowWidth.js       # Hook responsive
└── components/                 # 25+ composants UI
    ├── WeekView.jsx, MonthView.jsx, YearView.jsx
    ├── DayColumn.jsx, Dashboard.jsx, ProfileView.jsx
    ├── CoachLibraryView.jsx, AccueilView.jsx
    ├── PublicPlanView.jsx, SessionModal.jsx
    └── ...
```

## Dev local

```bash
npm install
# Créer .env.local avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

Voir `CLAUDE.md` pour la documentation technique complète.
