# Planif Escalade 🧗

Application web de planification d'entraînement escalade — PWA, multi-appareils.

**Production :** https://climbing-planner-theta.vercel.app/

## Fonctionnalités

- **Vue semaine / mois / année** — planning des séances par jour
- **Cycles (mésocycles / microcycles)** — timeline visuelle, éditeur intégré
- **Statistiques** — charge d'entraînement, sommeil, indice Hooper
- **Notes journalières + suivi créatine**
- **Profil** — avatar (recadrage/zoom), thème dark/light
- **Sync multi-appareils** via Supabase (magic link email, pas de mot de passe)
- **PWA** — installable sur mobile et desktop, fonctionne offline

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
