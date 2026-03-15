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

## Dev local

```bash
npm install
# Créer .env.local avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

Voir `CLAUDE.md` pour la documentation technique complète.
